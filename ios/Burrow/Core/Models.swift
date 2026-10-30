import Foundation

// Shapes of the server's /api responses (see routes/*.js). Integration data is
// loosely typed, so most fields are optional and a few decode leniently.

/// Accepts a JSON number or a numeric string (Tautulli sends counts as strings).
struct LooseInt: Decodable, Hashable {
    let value: Int
    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if let i = try? c.decode(Int.self) { value = i }
        else if let d = try? c.decode(Double.self) { value = Int(d) }
        else { value = Int(try c.decode(String.self)) ?? 0 }
    }
}

/// Accepts a JSON number or string id (Radarr ids are ints, qBittorrent's are hashes).
struct LooseID: Decodable, Hashable {
    let value: String
    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if let i = try? c.decode(Int.self) { value = String(i) } else { value = try c.decode(String.self) }
    }
}

// MARK: - Config, services, uptime  (/api/config, /api/services, /api/uptime)

struct AppConfig: Decodable {
    let devices: [Device]
    let services: [ServiceInfo]
}

struct Device: Decodable, Identifiable {
    let id: String
    let name: String
    let ip: String?
    let icon: String?
    let accent: String?
    let wol: Bool?
}

struct ServiceInfo: Decodable, Identifiable {
    let id: String
    let template: String?
    let name: String
    let color: String?
    let category: String?
    let machine: String?
    let cloud: Bool?
    let url: String?
}

/// /api/services — keyed by service id, plus `device_<id>` for machines.
struct ServiceStatus: Decodable {
    let online: Bool
    let since: String?
}

struct Uptime: Decodable {
    struct Day: Decodable { let date: String; let uptime: Double? }
    let uptime24h: Double?
    let uptime7d: Double?
    let days: [Day]?
}

// MARK: - Games  (/api/games, /api/games/:appid/details)

struct Game: Decodable, Identifiable, Hashable {
    var id: Int { appid }
    let appid: Int
    let title: String
    let headerImage: String?
    let price: String?
    let origPrice: String?
    let discountPct: Int?
    let onSale: Bool?
    let url: String?
    let releaseDate: String?
    let comingSoon: Bool?
    var status: String?
    let owned: Bool?
    let delisted: Bool?
    let addedAt: String?

    /// Numeric price for sorting ("CDN$ 79,99" → 79.99); free = 0, unknown = ∞.
    var priceValue: Double {
        guard let price else { return .infinity }
        if price.localizedCaseInsensitiveContains("free") { return 0 }
        let digits = price.filter { $0.isNumber || $0 == "." || $0 == "," }.replacingOccurrences(of: ",", with: ".")
        return Double(digits) ?? .infinity
    }
}

struct GameDetails: Decodable {
    struct Low: Decodable {
        let price: Double
        let regular: Double?
        let currency: String
        let cut: Int
        let date: String
    }
    struct Sale: Decodable {
        let name: String
        let start: String
        let end: String
        let active: Bool
    }
    let description: String?
    let genres: [String]?
    let developers: [String]?
    let screenshots: [String]?
    let historyLow: Low?
    let itadConfigured: Bool?
    let nextSale: Sale?
}

// MARK: - Plex  (/api/plex/now-playing, /api/plex/recent, /api/plex/ondeck)

struct PlexList: Decodable {
    let items: [PlexItem]
    let error: String?
}

struct PlexItem: Decodable, Identifiable {
    var id: String { ratingKey }
    let ratingKey: String
    let type: String
    let title: String?
    let subtitle: String?
    let thumb: String?
    let progress: Int?
}

struct NowPlaying: Decodable {
    let sessions: [PlexSession]
    let error: String?
}

struct PlexSession: Decodable, Identifiable {
    var id: String { "\(user)-\(title)-\(playerName ?? "")" }
    let type: String
    let title: String
    let showTitle: String?
    let season: String?
    let thumb: String?
    let duration: Int
    let viewOffset: Int
    let user: String
    let playerName: String?
    let state: String
    let transcoding: Bool?
}

// MARK: - Downloads  (/api/radarr/queue, /api/sonarr/queue, /api/qbittorrent/queue)

struct Queue: Decodable {
    let records: [QueueRecord]
    let error: String?
}

struct QueueRecord: Decodable, Identifiable {
    var id: String { rawId.value }
    let rawId: LooseID
    let title: String?
    let episode: String?
    let progress: Int?
    let sizeleft: Double?
    let eta: String?
    let status: String?

    enum CodingKeys: String, CodingKey { case rawId = "id", title, episode, progress, sizeleft, eta, status }
}

// MARK: - Tautulli  (/api/tautulli/stats)

struct WatchStats: Decodable {
    struct Title: Decodable, Identifiable {
        var id: String { title }
        let title: String
        let plays: Int
        let thumb: String?
    }
    struct User: Decodable, Identifiable {
        var id: String { name }
        let name: String
        let plays: Int
    }
    let plays: LooseInt?
    let duration: String?
    let topMovies: [Title]?
    let topShows: [Title]?
    let topUsers: [User]?
    let error: String?
}

// MARK: - Seerr  (/api/seerr/requests)

struct SeerrRequests: Decodable {
    let results: [SeerrRequest]
    let error: String?
    let configured: Bool?
}

struct SeerrRequest: Decodable, Identifiable {
    struct Person: Decodable { let displayName: String? }
    struct Media: Decodable { let status: Int? }
    let id: Int
    let status: Int          // 1 pending · 2 approved · 3 declined
    let type: String         // movie | tv
    let title: String?
    let year: String?
    let createdAt: String?
    let requestedBy: Person?
    let media: Media?        // status 5 = available, 4 = partially, 3 = processing

    var statusLabel: String {
        if media?.status == 5 { return "Available" }
        if media?.status == 4 { return "Partly available" }
        switch status {
        case 1: return "Pending approval"
        case 3: return "Declined"
        default: return media?.status == 3 ? "Downloading" : "Approved"
        }
    }
}
