import SwiftUI

enum Format {
    private static let isoFrac: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
    private static let iso = ISO8601DateFormatter()

    static func date(_ s: String?) -> Date? {
        guard let s else { return nil }
        if s.count == 10 {   // "2026-12-17"
            let f = DateFormatter()
            f.calendar = Calendar(identifier: .gregorian)
            f.dateFormat = "yyyy-MM-dd"
            return f.date(from: s)
        }
        return isoFrac.date(from: s) ?? iso.date(from: s)
    }

    /// "for 3 days" / "for 2 hours"
    static func duration(since s: String?) -> String? {
        guard let d = date(s) else { return nil }
        let f = DateComponentsFormatter()
        f.unitsStyle = .full
        f.maximumUnitCount = 1
        f.allowedUnits = [.day, .hour, .minute]
        return f.string(from: d, to: .now)
    }

    static func relative(_ s: String?) -> String? {
        guard let d = date(s) else { return nil }
        return d.formatted(.relative(presentation: .named))
    }

    static func bytes(_ n: Double?) -> String? {
        guard let n, n > 0 else { return nil }
        return ByteCountFormatter.string(fromByteCount: Int64(n), countStyle: .file)
    }

    static func percent(_ v: Double?) -> String {
        guard let v else { return "—" }
        return v >= 99.995 ? "100%" : String(format: "%.2f%%", v)
    }

    static func money(_ amount: Double, _ currency: String) -> String {
        amount.formatted(.currency(code: currency))
    }

    /// Plex durations are in milliseconds → "1:02:03" / "42:10"
    static func clock(ms: Int) -> String {
        let s = ms / 1000
        let h = s / 3600, m = (s % 3600) / 60, sec = s % 60
        return h > 0 ? String(format: "%d:%02d:%02d", h, m, sec) : String(format: "%d:%02d", m, sec)
    }
}

extension Color {
    /// "#ff6b35" → Color; nil for anything else.
    init?(hex: String?) {
        guard var s = hex?.trimmingCharacters(in: .whitespaces), s.hasPrefix("#") else { return nil }
        s.removeFirst()
        guard s.count == 6, let v = UInt32(s, radix: 16) else { return nil }
        self.init(red: Double((v >> 16) & 0xff) / 255, green: Double((v >> 8) & 0xff) / 255, blue: Double(v & 0xff) / 255)
    }
}
