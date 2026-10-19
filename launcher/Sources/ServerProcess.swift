import Foundation
import Observation

let defaultServerPort = 3001

/// The port the server listens on (Overview → Options).
var serverPort: Int {
    let saved = UserDefaults.standard.integer(forKey: "serverPort")
    return saved == 0 ? defaultServerPort : saved
}

/// Starts, stops and watches the Node server (`node server.js`).
@MainActor
@Observable
final class ServerProcess {
    enum State: Equatable { case stopped, starting, running, external, stopping }

    var state: State = .stopped
    var lastError: String?

    /// Folder containing server.js — inside the app bundle for releases,
    /// the repo checkout for dev builds.
    let projectDir: URL
    /// Node bundled with release builds; dev builds use the installed one.
    let bundledNode: URL?
    /// Settings + data for release builds (~/Library/Application Support/<App>).
    /// Dev builds keep using data/ in the checkout.
    let dataDir: URL?
    /// Everything the server prints, including crashes.
    let outputURL: URL
    private var process: Process?
    private var restartRequested = false
    private var pendingPort: Int?

    var isUp: Bool { state == .running || state == .external }

    var menuIcon: String {
        switch state {
        case .running, .external: "gauge.with.dots.needle.33percent"
        case .starting, .stopping: "gauge.with.dots.needle.bottom.half"
        case .stopped: "gauge.with.dots.needle.33percent"
        }
    }

    var statusText: String {
        switch state {
        case .stopped: "Stopped"
        case .starting: "Starting…"
        case .running: "Running (Port \(serverPort))"
        case .external: "Running (External process)"
        case .stopping: "Stopping…"
        }
    }

    init() {
        let fm = FileManager.default
        let resources = Bundle.main.resourceURL!
        let bundledServer = resources.appendingPathComponent("server")
        if let devPath = Bundle.main.object(forInfoDictionaryKey: "BurrowProjectPath") as? String {
            projectDir = URL(fileURLWithPath: devPath)
            bundledNode = nil
            dataDir = nil
        } else {
            projectDir = bundledServer
            bundledNode = resources.appendingPathComponent("node/bin/node")
            let name = Bundle.main.object(forInfoDictionaryKey: "CFBundleName") as? String ?? "Burrow"
            let support = fm.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent(name)
            try? fm.createDirectory(at: support, withIntermediateDirectories: true)
            dataDir = support
        }
        let logDir = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Logs/Burrow")
        try? FileManager.default.createDirectory(at: logDir, withIntermediateDirectories: true)
        outputURL = logDir.appendingPathComponent("server.log")
        Task { await pollLoop() }
    }

    func start() {
        guard process == nil, state != .external else { return }
        guard Self.isPortFree(serverPort) else {
            lastError = "Port \(serverPort) is used by another app. Choose another port in Overview → Options."
            return
        }
        guard let node = bundledNode?.path ?? Self.findNode() else {
            lastError = "Node.js not found (checked /opt/homebrew/bin/node, /usr/local/bin/node, ~/.nvm, etc.)"
            return
        }
        guard FileManager.default.fileExists(atPath: projectDir.appendingPathComponent("server.js").path) else {
            lastError = "server.js not found in \(projectDir.path)"
            return
        }
        lastError = nil

        if !FileManager.default.fileExists(atPath: outputURL.path) {
            FileManager.default.createFile(atPath: outputURL.path, contents: nil)
        }
        guard let log = try? FileHandle(forWritingTo: outputURL) else {
            lastError = "Can't open \(outputURL.path)"
            return
        }
        log.seekToEndOfFile()
        let startBanner = "\n===== Starting Burrow [\(Date())] =====\n"
        log.write(startBanner.data(using: .utf8)!)

        let p = Process()
        p.executableURL = URL(fileURLWithPath: node)
        p.arguments = ["server.js"]
        p.currentDirectoryURL = projectDir
        var env = ProcessInfo.processInfo.environment
        env["PATH"] = "\((node as NSString).deletingLastPathComponent):/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
        env["PORT"] = String(serverPort)
        env["NODE_ENV"] = "production"
        if let dataDir { env["BURROW_DATA_DIR"] = dataDir.path }
        p.environment = env
        p.standardOutput = log
        p.standardError = log
        p.terminationHandler = { proc in
            let code = proc.terminationStatus
            let crashed = proc.terminationReason == .uncaughtSignal
            Task { @MainActor in self.processExited(code: code, crashed: crashed) }
        }
        do {
            try p.run()
            process = p
            state = .starting
        } catch {
            lastError = "Failed to start server: \(error.localizedDescription)"
        }
    }

    func stop(synchronous: Bool = false) {
        if let p = process {
            state = .stopping
            p.terminate()
            if synchronous {
                let deadline = Date().addingTimeInterval(1.5)
                while p.isRunning && Date() < deadline {
                    usleep(50_000)
                }
                if p.isRunning {
                    kill(p.processIdentifier, SIGKILL)
                }
            } else {
                let pid = p.processIdentifier
                DispatchQueue.main.asyncAfter(deadline: .now() + 6) {
                    if p.isRunning { kill(pid, SIGKILL) }
                }
            }
        } else if state == .external {
            state = .stopping
            Task { try? await API.shared.shutdownServer() }
        }
    }

    func restart() {
        if process != nil {
            restartRequested = true
            stop()
        } else if state == .external {
            Task { try? await API.shared.restartServer() }
        } else {
            start()
        }
    }

    func changePort(to port: Int) {
        guard port != serverPort else { return }
        if process != nil {
            pendingPort = port
            stop()
        } else if state == .external {
            lastError = "The server was started outside Burrow: stop it first, then change the port."
        } else {
            UserDefaults.standard.set(port, forKey: "serverPort")
        }
    }

    private func processExited(code: Int32, crashed: Bool) {
        process = nil
        if let port = pendingPort {
            pendingPort = nil
            UserDefaults.standard.set(port, forKey: "serverPort")
            state = .stopped
            start()
            return
        }
        let wasStopping = state == .stopping
        let again = restartRequested
        restartRequested = false
        state = .stopped
        if again {
            start()
        } else if !wasStopping && (crashed || code != 0) {
            lastError = "The server exited unexpectedly (\(crashed ? "signal" : "code") \(code)). Check the Logs tab for details."
        }
    }

    private func pollLoop() async {
        while !Task.isCancelled {
            let up = await API.shared.isReachable()
            switch (state, up, process != nil) {
            case (.starting, true, _): state = .running
            case (.running, false, true): state = .starting
            case (.stopped, true, false): state = .external
            case (.external, false, _), (.stopping, false, false): state = .stopped
            default: break
            }
            try? await Task.sleep(for: .seconds(state == .running || state == .stopped ? 3 : 1))
        }
    }

    static func isPortFree(_ port: Int) -> Bool {
        let fd = socket(AF_INET, SOCK_STREAM, 0)
        guard fd >= 0 else { return true }
        defer { close(fd) }
        var reuse: Int32 = 1
        setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, &reuse, socklen_t(MemoryLayout<Int32>.size))
        var address = sockaddr_in()
        address.sin_family = sa_family_t(AF_INET)
        address.sin_port = in_port_t(UInt16(port).bigEndian)
        address.sin_addr = in_addr(s_addr: INADDR_ANY)
        let result = withUnsafePointer(to: &address) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { bind(fd, $0, socklen_t(MemoryLayout<sockaddr_in>.size)) }
        }
        return result == 0
    }

    static func findNode() -> String? {
        let home = NSHomeDirectory()
        var candidates = [
            "/opt/homebrew/bin/node",
            "/usr/local/bin/node",
            "\(home)/.volta/bin/node",
            "\(home)/.asdf/shims/node",
            "\(home)/.local/bin/node"
        ]
        // Check nvm paths
        let nvmDir = "\(home)/.nvm/versions/node"
        if let versions = try? FileManager.default.contentsOfDirectory(atPath: nvmDir) {
            for v in versions.sorted().reversed() {
                candidates.append("\(nvmDir)/\(v)/bin/node")
            }
        }
        return candidates.first { FileManager.default.isExecutableFile(atPath: $0) }
    }
}
