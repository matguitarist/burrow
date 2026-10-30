import Foundation
import Observation

/// One way to reach the server — e.g. "Home" (LAN) and "Away" (Tailscale / reverse proxy).
struct ServerAddress: Codable, Identifiable, Hashable {
    var id = UUID()
    var label: String
    var url: String
}

enum APIError: LocalizedError {
    case notConnected, loginRequired, http(Int, String?)

    var errorDescription: String? {
        switch self {
        case .notConnected:        "Not connected to Burrow"
        case .loginRequired:       "Sign in to do that"
        case .http(let code, let msg): msg ?? "Server returned HTTP \(code)"
        }
    }
}

struct AuthStatus: Decodable {
    let passwordSet: Bool
    let mode: String
    let signedIn: Bool
    let canControl: Bool
}

/// The Burrow server this app talks to. Tries each saved address in order and
/// uses the first one that answers as Burrow; the session cookie lives in the
/// shared cookie store, so sign-in survives relaunches.
@MainActor @Observable
final class Server {
    static let shared = Server()

    enum State: Equatable { case idle, connecting, connected, unreachable }

    var addresses: [ServerAddress] { didSet { save() } }
    private(set) var base: URL?
    private(set) var activeAddress: ServerAddress?
    private(set) var state: State = .idle
    private(set) var auth: AuthStatus?
    /// Set when a request came back `login-required` — shows the sign-in sheet.
    var needsLogin = false

    let session: URLSession
    private static let storeKey = "serverAddresses"

    private init() {
        let config = URLSessionConfiguration.default
        config.httpCookieStorage = .shared
        config.httpCookieAcceptPolicy = .always
        config.timeoutIntervalForRequest = 15
        // The server names sessions from the User-Agent ("Burrow app on iPad")
        config.httpAdditionalHeaders = ["User-Agent": "BurrowApp/1.0 (iPad)"]
        session = URLSession(configuration: config)
        let saved = UserDefaults.standard.data(forKey: Self.storeKey)
        addresses = saved.flatMap { try? JSONDecoder().decode([ServerAddress].self, from: $0) } ?? []
    }

    private func save() {
        UserDefaults.standard.set(try? JSONEncoder().encode(addresses), forKey: Self.storeKey)
    }

    // MARK: Connecting

    func connect() async {
        guard !addresses.isEmpty, state != .connecting else { return }
        state = .connecting
        for address in addresses {
            guard let url = Self.normalize(address.url), await Self.isBurrow(url, session: session) else { continue }
            base = url
            activeAddress = address
            state = .connected
            await refreshAuth()
            return
        }
        base = nil
        activeAddress = nil
        state = .unreachable
    }

    /// "192.168.1.5:3001" → http://192.168.1.5:3001
    nonisolated static func normalize(_ raw: String) -> URL? {
        var s = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !s.isEmpty else { return nil }
        if !s.contains("://") { s = "http://" + s }
        while s.hasSuffix("/") { s.removeLast() }
        guard let url = URL(string: s), url.host != nil else { return nil }
        return url
    }

    nonisolated static func isBurrow(_ base: URL, session: URLSession) async -> Bool {
        struct Ping: Decodable { let app: String }
        var req = URLRequest(url: base.appendingPathComponent("api/server/ping"))
        req.timeoutInterval = 4
        guard let (data, resp) = try? await session.data(for: req),
              (resp as? HTTPURLResponse)?.statusCode == 200,
              let ping = try? JSONDecoder().decode(Ping.self, from: data) else { return false }
        return ping.app == "burrow"
    }

    // MARK: Auth

    func refreshAuth() async {
        auth = try? await get("api/auth/status")
    }

    func login(password: String) async throws {
        struct Body: Encodable { let password: String; let remember = true }
        _ = try await send("POST", "api/auth/login", body: Body(password: password))
        needsLogin = false
        await refreshAuth()
    }

    func logout() async {
        _ = try? await send("POST", "api/auth/logout")
        await refreshAuth()
    }

    // MARK: Requests

    /// Absolute URL for a server path, e.g. an image proxy.
    func url(_ path: String) -> URL? {
        guard let base else { return nil }
        return URL(string: base.absoluteString + "/" + path)
    }

    func get<T: Decodable>(_ path: String, as type: T.Type = T.self) async throws -> T {
        let data = try await request("GET", path, body: nil, acceptErrorBodies: true)
        return try JSONDecoder().decode(T.self, from: data)
    }

    @discardableResult
    func send(_ method: String, _ path: String, body: (any Encodable)? = nil) async throws -> Data {
        try await request(method, path, body: body.map { try JSONEncoder().encode($0) }, acceptErrorBodies: false)
    }

    /// Integration endpoints answer 503 with a normal-shaped body plus `error`
    /// (e.g. `{ records: [], error: "…" }`), so GETs decode those too.
    private func request(_ method: String, _ path: String, body: Data?, acceptErrorBodies: Bool) async throws -> Data {
        guard let url = url(path) else { throw APIError.notConnected }
        var req = URLRequest(url: url)
        req.httpMethod = method
        if let body {
            req.httpBody = body
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        let data: Data, resp: URLResponse
        do {
            (data, resp) = try await session.data(for: req)
        } catch let error as URLError where error.code != .cancelled {
            // Probably left home (or came back) — find whichever address answers now
            Task { await self.reconnect() }
            throw error
        }
        let code = (resp as? HTTPURLResponse)?.statusCode ?? 0
        if (200..<300).contains(code) || (acceptErrorBodies && code == 503) { return data }
        let message = (try? JSONDecoder().decode([String: String].self, from: data))?["error"]
        if code == 401 && message == "login-required" {
            needsLogin = true
            throw APIError.loginRequired
        }
        throw APIError.http(code, message)
    }

    private var reconnecting = false
    private func reconnect() async {
        guard !reconnecting, state == .connected else { return }
        reconnecting = true
        defer { reconnecting = false }
        state = .idle
        await connect()
    }
}
