import SwiftUI

extension View {
    /// Runs `action` now and then every `interval` while the view is on screen,
    /// restarting when the server connection changes.
    func poll(every interval: Duration, _ action: @escaping @MainActor () async -> Void) -> some View {
        modifier(PollModifier(interval: interval, action: action))
    }

    func card() -> some View {
        padding(14)
            .background(.background.secondary, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}

private struct PollModifier: ViewModifier {
    let interval: Duration
    let action: @MainActor () async -> Void
    @Environment(Server.self) private var server

    func body(content: Content) -> some View {
        content.task(id: server.base) {
            guard server.base != nil else { return }
            while !Task.isCancelled {
                await action()
                try? await Task.sleep(for: interval)
            }
        }
    }
}

/// An image served by Burrow (path relative to the server) or an absolute URL.
struct RemoteImage: View {
    let source: String?
    var contentMode: ContentMode = .fill
    @Environment(Server.self) private var server

    private var url: URL? {
        guard let source, !source.isEmpty else { return nil }
        return source.hasPrefix("http") ? URL(string: source) : server.url(source)
    }

    var body: some View {
        AsyncImage(url: url, transaction: Transaction(animation: .easeOut(duration: 0.2))) { phase in
            if let image = phase.image {
                image.resizable().aspectRatio(contentMode: contentMode)
            } else {
                Rectangle().fill(.quaternary)
            }
        }
    }
}

enum Thumb {
    /// Plex artwork through the server's proxy (keeps the Plex token server-side).
    static func plex(_ path: String?) -> String? {
        guard let path, !path.isEmpty else { return nil }
        return "api/plex/thumb?path=" + (path.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? path)
    }
    static func tautulli(_ img: String?) -> String? {
        guard let img, !img.isEmpty else { return nil }
        return "api/tautulli/thumb?img=" + (img.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? img)
    }
}

struct StatusDot: View {
    let online: Bool?
    var body: some View {
        Circle()
            .fill(online == nil ? Color.secondary : online! ? Color.green : Color.red)
            .frame(width: 9, height: 9)
            .accessibilityLabel(online == nil ? "Unknown" : online! ? "Online" : "Offline")
    }
}

struct SectionTitle: View {
    let title: String
    var detail: String? = nil
    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(title).font(.title3.weight(.semibold))
            if let detail { Text(detail).font(.subheadline).foregroundStyle(.secondary) }
            Spacer()
        }
    }
}

/// Quiet inline note for a section whose integration failed or isn't set up.
struct Note: View {
    let text: String
    var systemImage = "exclamationmark.triangle"
    var body: some View {
        Label(text, systemImage: systemImage)
            .font(.footnote)
            .foregroundStyle(.secondary)
    }
}

struct ProgressLine: View {
    let fraction: Double
    var tint: Color = .accentColor
    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(.quaternary)
                Capsule().fill(tint).frame(width: geo.size.width * min(max(fraction, 0), 1))
            }
        }
        .frame(height: 4)
    }
}
