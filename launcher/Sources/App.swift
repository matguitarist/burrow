import AppKit
import SwiftUI

@main
struct BurrowApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    private let model = AppModel.shared

    var body: some Scene {
        Window("Burrow", id: "main") {
            RootView()
                .environment(model)
        }
        .defaultSize(width: 1080, height: 720)
        .defaultLaunchBehavior(.suppressed)
        .commands {
            CommandGroup(replacing: .appSettings) { SettingsCommand() }
            CommandGroup(after: .appInfo) {
                if Updater.shared.isAvailable {
                    Button("Check for Updates…") { Updater.shared.checkForUpdates() }
                }
            }
            CommandGroup(replacing: .help) { HelpCommands() }
        }

        Window("Burrow Help", id: HelpView.windowID) {
            HelpView()
        }
        .defaultSize(width: 860, height: 600)
        .defaultLaunchBehavior(.suppressed)
        .commandsRemoved()

        MenuBarExtra {
            MenuContent()
                .environment(model)
        } label: {
            MenuBarLabel(model: model)
        }
    }
}

/// Always present in the menu bar, initializes `openMainWindow`.
private struct MenuBarLabel: View {
    let model: AppModel
    @Environment(\.openWindow) private var openWindow

    var body: some View {
        Image(systemName: model.server.menuIcon)
            .task {
                guard model.openMainWindow == nil else { return }
                model.openMainWindow = {
                    openWindow(id: "main")
                    NSApp.activate()
                }
                if !model.launchedAtLogin {
                    model.openMainWindow?()
                }
            }
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationWillFinishLaunching(_ notification: Notification) {
        let event = NSAppleEventManager.shared().currentAppleEvent
        let atLogin = event?.eventID == AEEventID(kAEOpenApplication)
            && event?.paramDescriptor(forKeyword: AEKeyword(keyAEPropData))?.enumCodeValue == OSType(keyAELaunchedAsLogInItem)
        MainActor.assumeIsolated { AppModel.shared.launchedAtLogin = atLogin }
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        // Start Sparkle's scheduled update checks (no-op in dev builds)
        MainActor.assumeIsolated { _ = Updater.shared }
        Task { @MainActor in
            // Brief pause to allow reachability check to detect already running server
            try? await Task.sleep(for: .seconds(1.2))
            let server = AppModel.shared.server
            if server.state == .stopped && UserDefaults.standard.object(forKey: "autoStartServer") as? Bool ?? true {
                server.start()
            }
        }
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        MainActor.assumeIsolated { AppModel.shared.openMainWindow?() }
        return false
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }

    func applicationWillTerminate(_ notification: Notification) {
        MainActor.assumeIsolated { AppModel.shared.server.stop(synchronous: true) }
    }
}

struct MenuContent: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        let server = model.server
        Text("Burrow: \(server.statusText)")
        if let error = server.lastError {
            Text(error)
        }
        Divider()

        Button("Open Burrow in Browser") { model.openInBrowser() }
            .keyboardShortcut("o")
            .disabled(!server.isUp)

        if let ip = model.localIPAddress, let url = URL(string: "http://\(ip):\(serverPort)") {
            Button("Open LAN Address (\(ip))") { model.openInBrowser(url) }
                .disabled(!server.isUp)
        }
        Divider()

        switch server.state {
        case .stopped:
            Button("Start Server") { server.start() }.keyboardShortcut("s")
        case .starting, .running, .external:
            Button("Restart Server") { server.restart() }.keyboardShortcut("r")
            Button("Stop Server") { server.stop() }.keyboardShortcut("s")
        case .stopping:
            Text("Stopping…")
        }
        Divider()

        Button("Settings…") { model.show(.settings) }.keyboardShortcut(",")
        Button("Logs…") { model.show(.logs) }.keyboardShortcut("l")
        Button("Open Data Folder") {
            NSWorkspace.shared.open(server.dataDir ?? server.projectDir)
        }
        HelpMenuItem()
        if Updater.shared.isAvailable {
            Button("Check for Updates…") { Updater.shared.checkForUpdates() }
        }
        Divider()

        Button("Quit Burrow (Stops Server)") { NSApp.terminate(nil) }
            .keyboardShortcut("q")
    }
}

private struct HelpMenuItem: View {
    @Environment(\.openWindow) private var openWindow

    var body: some View {
        Button("Burrow Help") {
            openWindow(id: HelpView.windowID)
            NSApp.activate()
        }
    }
}

private struct HelpCommands: View {
    @Environment(\.openWindow) private var openWindow

    var body: some View {
        Button("Burrow Help") {
            openWindow(id: HelpView.windowID)
            NSApp.activate()
        }
        .keyboardShortcut("?")
    }
}

private struct SettingsCommand: View {
    @Environment(\.openWindow) private var openWindow

    var body: some View {
        Button("Settings…") {
            openWindow(id: "main")
            NSApp.activate()
        }
        .keyboardShortcut(",")
    }
}
