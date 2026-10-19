import Foundation
import SwiftUI

enum SidebarItem: String, Hashable, CaseIterable, Identifiable {
    case overview, services, devices, settings, logs

    var id: String { rawValue }

    var title: String {
        switch self {
        case .overview: "Overview"
        case .services: "Services"
        case .devices: "Devices & WOL"
        case .settings: "Settings"
        case .logs: "Logs"
        }
    }

    var symbol: String {
        switch self {
        case .overview: "gauge.with.dots.needle.33percent"
        case .services: "square.grid.2x2"
        case .devices: "server.rack"
        case .settings: "slider.horizontal.3"
        case .logs: "list.bullet.rectangle.portrait"
        }
    }
}

/// GET /api/system
struct SystemStatsResponse: Decodable {
    var process: ProcessStats
}

struct ProcessStats: Decodable {
    var cpu: Int
    var rss: Int64
    var heapUsed: Int64
    var heapTotal: Int64
    var external: Int64?
}

// MARK: - Global settings (data/settings.json on the server)

/// GET/PUT /api/settings
struct BurrowSettings: Codable, Equatable {
    struct Weather: Codable, Equatable { var lat: String; var lon: String }
    struct Region: Codable, Equatable { var locale: String; var holidays: String; var steamCountry: String }
    struct Tracked: Codable, Equatable, Hashable { var name: String; var repo: String }
    struct News: Codable, Equatable { var emulation: Bool; var tracked: [Tracked] }

    var devices: [DeviceInfo]
    var glancesPort: Int
    var weather: Weather
    var region: Region
    var news: News
}

/// A machine from Settings → Devices.
struct DeviceInfo: Codable, Identifiable, Hashable {
    var id: String
    var name: String
    var ip: String
    var mac: String
    var icon: String?
    var accent: String?
    var sshUser: String?
    var sshPort: Int?

    var symbol: String {
        switch icon {
        case "server": "server.rack"
        case "monitor": "display"
        case "cpu": "cpu"
        case "laptop": "laptopcomputer"
        case "mac": "macmini"
        default: "desktopcomputer"
        }
    }

    var accentColor: Color {
        guard let accent, !accent.isEmpty else { return .accentColor }
        return Color(hex: accent) ?? .accentColor
    }
}

// MARK: - Services (data/services.json on the server)

/// A credential / extra field declared by a template, e.g. API key or Steam64 ID.
struct TemplateField: Codable, Hashable {
    var key: String
    var label: String
    var secret: Bool?
    var hint: String?
}

/// GET /api/service-templates — the catalog services are created from.
struct ServiceTemplate: Codable, Identifiable, Hashable {
    var id: String
    var name: String
    var category: String
    var color: String
    var port: Int?
    var webPath: String?
    var description: String?
    var integration: Bool?
    var cloud: Bool?
    var https: Bool?
    var fields: [TemplateField]?
    var testable: Bool?

    var isIntegration: Bool { integration ?? false }
    var isCloud: Bool { cloud ?? false }

    var symbol: String {
        switch category {
        case "Media": "play.tv"
        case "Downloads": "arrow.down.circle"
        case "AI": "brain"
        case "Monitoring": "chart.bar.xaxis"
        case "Infrastructure": "server.rack"
        case "Home": "house"
        case "Productivity": "doc.text"
        case "Notifications": "bell.badge"
        case "Accounts": "person.crop.circle"
        default: "globe"
        }
    }
}

struct ServiceCatalog: Codable {
    var categories: [String]
    var templates: [ServiceTemplate]
}

/// One configured service. Known keys are typed; template-specific extras
/// (e.g. `steamId`) round-trip through `extras` so nothing is lost on save.
struct ServiceInstance: Codable, Identifiable, Hashable {
    var id: String
    var template: String
    var name: String
    var color: String
    var enabled: Bool = true
    var device: String = ""
    var host: String = ""
    var port: Int?
    var https: Bool = false
    var webPath: String = ""
    var apiUrl: String = ""
    var apiKey: String = ""
    var user: String = ""
    var pass: String = ""
    var extras: [String: String] = [:]

    private static let known: Set<String> = ["id", "template", "name", "color", "enabled", "device", "host", "port", "https", "webPath", "apiUrl", "apiKey", "user", "pass"]

    init(id: String, template: ServiceTemplate, device: String) {
        self.id = id
        self.template = template.id
        self.name = template.name
        self.color = template.color
        self.device = template.isCloud ? "" : device
        self.port = template.port
        self.https = template.https ?? false
    }

    /// Read/write any field by its template key (apiKey, user, pass or an extra).
    subscript(field key: String) -> String {
        get {
            switch key {
            case "apiKey": apiKey
            case "user": user
            case "pass": pass
            default: extras[key] ?? ""
            }
        }
        set {
            switch key {
            case "apiKey": apiKey = newValue
            case "user": user = newValue
            case "pass": pass = newValue
            default: extras[key] = newValue
            }
        }
    }

    private struct Key: CodingKey {
        var stringValue: String
        var intValue: Int? { nil }
        init(_ s: String) { stringValue = s }
        init?(stringValue: String) { self.stringValue = stringValue }
        init?(intValue: Int) { nil }
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Key.self)
        func str(_ k: String) -> String { (try? c.decodeIfPresent(String.self, forKey: Key(k))) ?? "" }
        id = str("id")
        template = str("template")
        name = str("name")
        color = str("color")
        enabled = (try? c.decodeIfPresent(Bool.self, forKey: Key("enabled"))) ?? true
        device = str("device")
        host = str("host")
        port = try? c.decodeIfPresent(Int.self, forKey: Key("port"))
        https = (try? c.decodeIfPresent(Bool.self, forKey: Key("https"))) ?? false
        webPath = str("webPath")
        apiUrl = str("apiUrl")
        apiKey = str("apiKey")
        user = str("user")
        pass = str("pass")
        for k in c.allKeys where !Self.known.contains(k.stringValue) {
            if let v = try? c.decode(String.self, forKey: k) { extras[k.stringValue] = v }
        }
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: Key.self)
        try c.encode(id, forKey: Key("id"))
        try c.encode(template, forKey: Key("template"))
        try c.encode(name, forKey: Key("name"))
        try c.encode(color, forKey: Key("color"))
        try c.encode(enabled, forKey: Key("enabled"))
        try c.encode(device, forKey: Key("device"))
        try c.encode(host, forKey: Key("host"))
        try c.encode(port, forKey: Key("port"))
        try c.encode(https, forKey: Key("https"))
        try c.encode(webPath, forKey: Key("webPath"))
        try c.encode(apiUrl, forKey: Key("apiUrl"))
        try c.encode(apiKey, forKey: Key("apiKey"))
        try c.encode(user, forKey: Key("user"))
        try c.encode(pass, forKey: Key("pass"))
        for (k, v) in extras where !Self.known.contains(k) { try c.encode(v, forKey: Key(k)) }
    }
}

/// GET /api/services — live health per service id (and device_<id>).
struct ServiceHealth: Decodable, Hashable {
    var online: Bool
    var since: String?
}

/// GET /api/config — the parts the launcher needs: service links, the active
/// AI backend and the holiday calendars to pick from.
struct ServerConfig: Decodable {
    struct Service: Decodable { var id: String; var url: String? }
    struct AI: Decodable { var backend: String; var online: Bool }
    struct Calendar: Decodable, Hashable { var id: String; var name: String }
    struct Region: Decodable { var calendars: [Calendar] }
    var services: [Service]
    var ai: AI?
    var region: Region?
}

/// POST /api/service-config/test
struct ServiceTestResult: Decodable {
    var ok: Bool
    var message: String
}

extension Color {
    init?(hex: String) {
        var str = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        if str.hasPrefix("#") { str.removeFirst() }
        guard str.count == 6, let rgb = UInt64(str, radix: 16) else { return nil }
        self.init(
            red: Double((rgb >> 16) & 0xFF) / 255.0,
            green: Double((rgb >> 8) & 0xFF) / 255.0,
            blue: Double(rgb & 0xFF) / 255.0
        )
    }
}
