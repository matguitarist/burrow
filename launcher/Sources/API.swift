import Foundation

/// The Burrow server's HTTP API.
final class API: Sendable {
    static let shared = API()

    var base: URL { URL(string: "http://127.0.0.1:\(serverPort)")! }
    private let session: URLSession

    struct ServerError: LocalizedError {
        let message: String
        var errorDescription: String? { message }
    }

    init() {
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 10
        session = URLSession(configuration: config)
    }

    func url(_ path: String) -> URL { URL(string: path, relativeTo: base)!.absoluteURL }

    /// Checks whether the Burrow server (not another app on the port) answers.
    func isReachable() async -> Bool {
        struct Ping: Decodable { var app: String? }
        var request = URLRequest(url: url("/api/server/ping"))
        request.timeoutInterval = 1.5
        guard let (data, _) = try? await session.data(for: request) else { return false }
        return (try? JSONDecoder().decode(Ping.self, from: data))?.app == "burrow"
    }

    func get<T: Decodable>(_ path: String, as type: T.Type = T.self) async throws -> T {
        try await send(URLRequest(url: url(path)))
    }

    @discardableResult
    func post<T: Decodable>(_ path: String, json: (some Encodable)? = nil, as type: T.Type = T.self) async throws -> T {
        var request = URLRequest(url: url(path))
        request.httpMethod = "POST"
        if let json {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONEncoder().encode(json)
        }
        return try await send(request)
    }

    func post(_ path: String) async throws {
        var request = URLRequest(url: url(path))
        request.httpMethod = "POST"
        _ = try await session.data(for: request)
    }

    func post(_ path: String, json: some Encodable) async throws {
        var request = URLRequest(url: url(path))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(json)
        _ = try await session.data(for: request)
    }

    func getSettings() async throws -> BurrowSettings {
        try await get("/api/settings")
    }

    func saveSettings(_ settings: BurrowSettings) async throws -> BurrowSettings {
        var request = URLRequest(url: url("/api/settings"))
        request.httpMethod = "PUT"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(settings)
        return try await send(request)
    }

    // MARK: Services

    func getServiceCatalog() async throws -> ServiceCatalog {
        try await get("/api/service-templates")
    }

    func getServiceConfig() async throws -> [ServiceInstance] {
        try await get("/api/service-config")
    }

    func saveServiceConfig(_ list: [ServiceInstance]) async throws {
        struct Saved: Decodable { var ok: Bool }
        var request = URLRequest(url: url("/api/service-config"))
        request.httpMethod = "PUT"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(list)
        let _: Saved = try await send(request)
    }

    func testService(_ service: ServiceInstance) async throws -> ServiceTestResult {
        var request = URLRequest(url: url("/api/service-config/test"))
        request.httpMethod = "POST"
        request.timeoutInterval = 20
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(service)
        return try await send(request)
    }

    func getServiceHealth() async throws -> [String: ServiceHealth] {
        var request = URLRequest(url: url("/api/services"))
        request.timeoutInterval = 20
        return try await send(request)
    }

    func getServerConfig() async throws -> ServerConfig {
        var request = URLRequest(url: url("/api/config"))
        request.timeoutInterval = 20
        return try await send(request)
    }

    func getSystemStats() async throws -> ProcessStats {
        let res: SystemStatsResponse = try await get("/api/system")
        return res.process
    }

    func wakeOnLan(machine: String) async throws {
        try await post("/api/wol/\(machine)")
    }

    func shutdownServer() async throws {
        try await post("/api/server/shutdown")
    }

    func restartServer() async throws {
        try await post("/api/server/restart")
    }

    private func send<T: Decodable>(_ request: URLRequest) async throws -> T {
        let (data, response) = try await session.data(for: request)
        try Self.check(response, data)
        return try JSONDecoder().decode(T.self, from: data)
    }

    private static func check(_ response: URLResponse, _ data: Data) throws {
        guard let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) else { return }
        let detail = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["error"] as? String
        throw ServerError(message: detail ?? "The server returned status \(http.statusCode)")
    }
}
