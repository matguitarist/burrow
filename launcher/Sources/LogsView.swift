import AppKit
import SwiftUI

struct LogsView: View {
    @Environment(AppModel.self) private var model
    @AppStorage("logFollowLive") private var followLive = true

    var body: some View {
        @Bindable var store = model.logs
        let lines = store.filteredLines
        VStack(spacing: 0) {
            header(lines: lines)
            Divider()
            logList(lines)
        }
        .navigationTitle("Logs")
        .navigationSubtitle(store.isLive ? "Live" : (model.server.isUp ? "Reading log…" : "Server stopped"))
        .searchable(text: $store.searchText, placement: .toolbar, prompt: "Search log entries")
        .toolbar { toolbar(lines: lines) }
    }

    private func header(lines: [LogLine]) -> some View {
        let store = model.logs
        return HStack(spacing: 8) {
            ForEach(LogLevel.allCases) { level in
                levelChip(level, count: store.counts[level, default: 0])
            }
            Spacer()
            Text("\(lines.count) of \(store.lines.count) lines")
                .monospacedDigit()
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .background(.bar)
    }

    private func levelChip(_ level: LogLevel, count: Int) -> some View {
        let store = model.logs
        let isOn = store.levels.contains(level)
        return Button {
            if isOn { store.levels.remove(level) } else { store.levels.insert(level) }
        } label: {
            HStack(spacing: 4) {
                Image(systemName: level.symbol)
                Text("\(level.title) \(count)")
                    .monospacedDigit()
            }
            .font(.caption.weight(.medium))
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
            .background(isOn ? level.color.opacity(0.18) : Color.clear, in: Capsule())
            .overlay(Capsule().strokeBorder(level.color.opacity(isOn ? 0.6 : 0.2)))
            .foregroundStyle(isOn ? level.color : .secondary)
        }
        .buttonStyle(.plain)
    }

    private func logList(_ lines: [LogLine]) -> some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 2) {
                    ForEach(lines) { line in
                        logRow(line)
                            .id(line.id)
                    }
                }
                .padding(10)
            }
            .textSelection(.enabled)
            .onChange(of: lines.count) { _, _ in
                if followLive, let last = lines.last {
                    proxy.scrollTo(last.id, anchor: .bottom)
                }
            }
        }
        .background(Color(nsColor: .textBackgroundColor))
    }

    private func logRow(_ line: LogLine) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Text(line.time)
                .monospacedDigit()
                .foregroundStyle(.tertiary)
                .frame(width: 65, alignment: .leading)

            if line.isMarker {
                Text(line.message)
                    .fontWeight(.bold)
                    .foregroundStyle(Color.accentColor)
            } else {
                Text(line.level.title.uppercased())
                    .font(.caption2.bold())
                    .padding(.horizontal, 4)
                    .padding(.vertical, 1)
                    .background(line.level.color.opacity(0.15), in: RoundedRectangle(cornerRadius: 3))
                    .foregroundStyle(line.level.color)
                    .frame(width: 50, alignment: .center)

                Text(line.message)
                    .font(.system(.body, design: .monospaced))
                    .foregroundStyle(line.level == .error ? Color.red : .primary)
            }
            Spacer()
        }
        .font(.system(size: 11, design: .monospaced))
        .padding(.vertical, 1)
    }

    @ToolbarContentBuilder
    private func toolbar(lines: [LogLine]) -> some ToolbarContent {
        ToolbarItemGroup {
            Toggle(isOn: $followLive) {
                Label("Follow live", systemImage: "arrow.down.to.line")
            }
            .help("Auto-scroll to latest lines")

            Button {
                let text = lines.map(\.plainText).joined(separator: "\n")
                NSPasteboard.general.clearContents()
                NSPasteboard.general.setString(text, forType: .string)
            } label: {
                Label("Copy All", systemImage: "doc.on.doc")
            }
            .help("Copy filtered logs to clipboard")

            Button {
                model.logs.clear()
            } label: {
                Label("Clear", systemImage: "trash")
            }
            .help("Clear displayed logs")

            Button {
                NSWorkspace.shared.selectFile(model.server.outputURL.path, inFileViewerRootedAtPath: "")
            } label: {
                Label("Reveal in Finder", systemImage: "folder")
            }
            .help("Show server.log in Finder")
        }
    }
}
