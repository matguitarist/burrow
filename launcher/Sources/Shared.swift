import AppKit
import SwiftUI

/// Colored circle showing connection or process state.
struct StatusDot: View {
    let color: Color
    var pulse: Bool = false

    var body: some View {
        Circle()
            .fill(color)
            .frame(width: 8, height: 8)
            .shadow(color: color.opacity(0.4), radius: 2)
    }
}

/// A modern metric stat card for CPU, Memory, or Counts.
struct StatCard: View {
    let title: String
    let value: String
    var subtitle: String? = nil
    var icon: String? = nil
    var color: Color = .blue

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                if let icon {
                    Image(systemName: icon)
                        .foregroundStyle(color)
                }
                Text(title)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Text(value)
                .font(.system(.title2, design: .rounded, weight: .bold))
                .monospacedDigit()
            if let subtitle {
                Text(subtitle)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(Color(nsColor: .controlBackgroundColor), in: RoundedRectangle(cornerRadius: 10))
        .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(Color.primary.opacity(0.06), lineWidth: 1))
    }
}

/// Row displaying a clickable address with copy & browser action buttons.
struct AddressRow: View {
    let label: String
    let url: URL
    @State private var copied = false

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(label)
                    .font(.body)
                Text(url.absoluteString)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .textSelection(.enabled)
            }
            Spacer()
            Button {
                NSPasteboard.general.clearContents()
                NSPasteboard.general.setString(url.absoluteString, forType: .string)
                copied = true
                DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { copied = false }
            } label: {
                Image(systemName: copied ? "checkmark" : "doc.on.doc")
            }
            .buttonStyle(.borderless)
            .help("Copy URL")

            Button("Open") {
                NSWorkspace.shared.open(url)
            }
            .controlSize(.small)
        }
    }
}

/// View container requiring the backend server to be running.
struct NeedsServer<Content: View>: View {
    @Environment(AppModel.self) private var model
    @ViewBuilder let content: Content

    var body: some View {
        if model.server.isUp {
            content
        } else {
            ContentUnavailableView {
                Label(model.server.state == .stopped ? "The Server Isn't Running" : "Waiting for Server…", systemImage: "server.rack")
            } description: {
                Text("Start the server using the button below or in the Overview tab to view and edit these settings.")
            } actions: {
                if model.server.state == .stopped {
                    Button("Start Server") {
                        model.server.start()
                    }
                    .buttonStyle(.borderedProminent)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }
}

extension Int64 {
    var formattedBytes: String {
        let formatter = ByteCountFormatter()
        formatter.allowedUnits = [.useMB, .useGB]
        formatter.countStyle = .memory
        return formatter.string(fromByteCount: self)
    }
}
