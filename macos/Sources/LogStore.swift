import Foundation
import Observation
import SwiftUI

enum LogLevel: String, CaseIterable, Identifiable {
    case debug, info, warning, error

    var id: String { rawValue }

    var title: String {
        switch self {
        case .debug: "Debug"
        case .info: "Info"
        case .warning: "Warning"
        case .error: "Error"
        }
    }

    var color: Color {
        switch self {
        case .debug: .secondary
        case .info: .primary
        case .warning: .orange
        case .error: .red
        }
    }

    var symbol: String {
        switch self {
        case .debug: "ladybug"
        case .info: "info.circle"
        case .warning: "exclamationmark.triangle.fill"
        case .error: "xmark.octagon.fill"
        }
    }

    var isProblem: Bool { self == .warning || self == .error }
}

struct LogLine: Identifiable, Hashable {
    let id: Int
    let time: String
    let level: LogLevel
    let rawLevel: String
    let source: String
    let message: String
    var isMarker = false

    var plainText: String {
        "[\(time)] \(level.title.uppercased().padding(toLength: 5, withPad: " ", startingAt: 0)) \(message)"
    }
}

/// Tails and parses the server's output log file (~/Library/Logs/Burrow/server.log).
@MainActor
@Observable
final class LogStore {
    private(set) var lines: [LogLine] = []
    private(set) var counts: [LogLevel: Int] = [:]
    private(set) var isLive = false

    var levels: Set<LogLevel> = [.debug, .info, .warning, .error]
    var searchText = ""

    private var nextID = 1
    private var fileOffset: UInt64 = 0
    private let logURL: URL
    private let maxLines = 5000

    init() {
        let logDir = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Logs/Burrow")
        logURL = logDir.appendingPathComponent("server.log")
        Task { await tailLoop() }
    }

    var recentProblems: [LogLine] {
        Array(lines.lazy.filter { $0.level.isProblem }.suffix(5))
    }

    var filteredLines: [LogLine] {
        let query = searchText.trimmingCharacters(in: .whitespaces)
        return lines.filter { line in
            if line.isMarker { return query.isEmpty }
            return levels.contains(line.level)
                && (query.isEmpty || line.message.localizedCaseInsensitiveContains(query))
        }
    }

    func clear() {
        lines = []
        counts = [:]
    }

    private func tailLoop() async {
        while !Task.isCancelled {
            readNewLines()
            try? await Task.sleep(for: .milliseconds(500))
        }
    }

    private func readNewLines() {
        guard FileManager.default.fileExists(atPath: logURL.path) else {
            isLive = false
            return
        }
        guard let handle = try? FileHandle(forReadingFrom: logURL) else { return }
        defer { try? handle.close() }

        let fileSize = handle.seekToEndOfFile()
        if fileSize < fileOffset {
            // File was truncated or recreated
            fileOffset = 0
            lines.append(LogLine(id: takeID(), time: Self.now(), level: .info, rawLevel: "INFO", source: "launcher", message: "Log restarted", isMarker: true))
        }

        guard fileSize > fileOffset else {
            isLive = true
            return
        }

        handle.seek(toFileOffset: fileOffset)
        let data = handle.readDataToEndOfFile()
        fileOffset = fileSize
        isLive = true

        guard let text = String(data: data, encoding: .utf8), !text.isEmpty else { return }
        let rawLines = text.split(separator: "\n", omittingEmptySubsequences: true)

        var newEntries: [LogLine] = []
        for line in rawLines {
            let s = String(line).trimmingCharacters(in: .whitespacesAndNewlines)
            guard !s.isEmpty else { continue }
            let entry = parseLine(s)
            counts[entry.level, default: 0] += 1
            newEntries.append(entry)
        }

        lines.append(contentsOf: newEntries)
        if lines.count > maxLines {
            let overflow = lines.count - maxLines
            for line in lines.prefix(overflow) where !line.isMarker {
                counts[line.level, default: 1] -= 1
            }
            lines.removeFirst(overflow)
        }
    }

    private func parseLine(_ raw: String) -> LogLine {
        let lower = raw.lowercased()
        let level: LogLevel
        if lower.contains("error") || lower.contains("fatal") || lower.contains("fail") || lower.contains("uncaught") {
            level = .error
        } else if lower.contains("warn") {
            level = .warning
        } else if lower.contains("debug") {
            level = .debug
        } else {
            level = .info
        }

        let isBanner = raw.contains("=====")
        return LogLine(
            id: takeID(),
            time: Self.now(),
            level: level,
            rawLevel: level.rawValue.uppercased(),
            source: "node",
            message: raw,
            isMarker: isBanner
        )
    }

    private func takeID() -> Int {
        defer { nextID += 1 }
        return nextID
    }

    private static func now() -> String {
        Date.now.formatted(.dateTime.hour(.twoDigits(amPM: .omitted)).minute(.twoDigits).second(.twoDigits))
    }
}
