import SwiftUI

struct MediaScreen: View {
    @Environment(Server.self) private var server
    @State private var nowPlaying: NowPlaying?
    @State private var onDeck: PlexList?
    @State private var recent: PlexList?
    @State private var queues: [(name: String, queue: Queue)] = []
    @State private var stats: WatchStats?
    @State private var requests: SeerrRequests?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 32) {
                nowPlayingSection
                shelf("Continue Watching", onDeck)
                shelf("Recently Added", recent)
                downloadsSection
                HStack(alignment: .top, spacing: 20) {
                    statsSection.frame(maxWidth: .infinity, alignment: .topLeading)
                    requestsSection.frame(maxWidth: .infinity, alignment: .topLeading)
                }
            }
            .padding(20)
        }
        .refreshable { await loadFast(); await loadSlow() }
        .poll(every: .seconds(10)) { await loadFast() }
        .poll(every: .seconds(120)) { await loadSlow() }
    }

    // Playback and downloads change by the second; libraries and stats don't
    private func loadFast() async {
        async let np: NowPlaying? = try? server.get("api/plex/now-playing")
        async let r: Queue? = try? server.get("api/radarr/queue")
        async let s: Queue? = try? server.get("api/sonarr/queue")
        async let q: Queue? = try? server.get("api/qbittorrent/queue")
        let (npv, rv, sv, qv) = await (np, r, s, q)
        nowPlaying = npv
        queues = [("Radarr", rv), ("Sonarr", sv), ("qBittorrent", qv)].compactMap { name, q in q.map { (name, $0) } }
    }

    private func loadSlow() async {
        async let d: PlexList? = try? server.get("api/plex/ondeck")
        async let r: PlexList? = try? server.get("api/plex/recent")
        async let st: WatchStats? = try? server.get("api/tautulli/stats")
        async let rq: SeerrRequests? = try? server.get("api/seerr/requests")
        (onDeck, recent, stats, requests) = await (d, r, st, rq)
    }

    // MARK: Now playing

    @ViewBuilder private var nowPlayingSection: some View {
        if let sessions = nowPlaying?.sessions, !sessions.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                SectionTitle(title: "Now Playing", detail: "\(sessions.count) stream\(sessions.count == 1 ? "" : "s")")
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 340), spacing: 14)], spacing: 14) {
                    ForEach(sessions) { s in
                        HStack(spacing: 14) {
                            RemoteImage(source: Thumb.plex(s.thumb))
                                .frame(width: 64, height: 96)
                                .clipShape(RoundedRectangle(cornerRadius: 8))
                            VStack(alignment: .leading, spacing: 5) {
                                Text(s.showTitle?.isEmpty == false ? s.showTitle! : s.title).font(.headline).lineLimit(1)
                                if s.showTitle?.isEmpty == false {
                                    Text([s.season, s.title].compactMap { $0 }.joined(separator: " · "))
                                        .font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
                                }
                                Label("\(s.user) · \(s.playerName ?? "")", systemImage: s.state == "paused" ? "pause.fill" : "play.fill")
                                    .font(.caption).foregroundStyle(.secondary)
                                ProgressLine(fraction: s.duration > 0 ? Double(s.viewOffset) / Double(s.duration) : 0)
                                HStack {
                                    Text("\(Format.clock(ms: s.viewOffset)) / \(Format.clock(ms: s.duration))")
                                    Spacer()
                                    if s.transcoding == true { Text("Transcoding") }
                                }
                                .font(.caption2.monospacedDigit()).foregroundStyle(.secondary)
                            }
                        }
                        .card()
                    }
                }
            }
        }
    }

    // MARK: Plex shelves

    @ViewBuilder private func shelf(_ title: String, _ list: PlexList?) -> some View {
        if let list {
            VStack(alignment: .leading, spacing: 12) {
                SectionTitle(title: title)
                if let error = list.error {
                    Note(text: "Plex: \(error)")
                } else if list.items.isEmpty {
                    Note(text: "Nothing here yet", systemImage: "tray")
                } else {
                    ScrollView(.horizontal, showsIndicators: false) {
                        LazyHStack(alignment: .top, spacing: 14) {
                            ForEach(list.items) { PosterView(item: $0) }
                        }
                    }
                }
            }
        }
    }

    // MARK: Downloads

    @ViewBuilder private var downloadsSection: some View {
        let active = queues.flatMap { q in q.queue.records.map { (source: q.name, record: $0) } }
        let errors = queues.compactMap { q in q.queue.error.map { "\(q.name): \($0)" } }
        VStack(alignment: .leading, spacing: 12) {
            SectionTitle(title: "Downloads", detail: active.isEmpty ? nil : "\(active.count) active")
            if active.isEmpty {
                Note(text: "Nothing downloading", systemImage: "arrow.down.circle")
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(active.enumerated()), id: \.offset) { i, item in
                        if i > 0 { Divider() }
                        DownloadRow(source: item.source, record: item.record).padding(.vertical, 10)
                    }
                }
                .card()
            }
            ForEach(errors, id: \.self) { Note(text: $0) }
        }
    }

    // MARK: Watch stats (Tautulli)

    @ViewBuilder private var statsSection: some View {
        if let stats {
            VStack(alignment: .leading, spacing: 12) {
                SectionTitle(title: "Last 30 Days")
                if let error = stats.error {
                    Note(text: "Tautulli: \(error)")
                } else {
                    VStack(alignment: .leading, spacing: 14) {
                        HStack(spacing: 28) {
                            stat("\(stats.plays?.value ?? 0)", "plays")
                            if let d = stats.duration { stat(d, "watched") }
                        }
                        ranking("Top shows", (stats.topShows ?? []).map { ($0.title, $0.plays) })
                        ranking("Top movies", (stats.topMovies ?? []).map { ($0.title, $0.plays) })
                        ranking("Top viewers", (stats.topUsers ?? []).map { ($0.name, $0.plays) })
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .card()
                }
            }
        }
    }

    private func stat(_ value: String, _ label: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value).font(.title2.weight(.semibold)).lineLimit(1).minimumScaleFactor(0.7)
            Text(label).font(.caption).foregroundStyle(.secondary)
        }
    }

    @ViewBuilder private func ranking(_ title: String, _ rows: [(String, Int)]) -> some View {
        if !rows.isEmpty {
            VStack(alignment: .leading, spacing: 4) {
                Text(title).font(.caption.weight(.semibold)).foregroundStyle(.secondary).textCase(.uppercase)
                ForEach(Array(rows.prefix(5).enumerated()), id: \.offset) { _, row in
                    HStack {
                        Text(row.0).lineLimit(1)
                        Spacer()
                        Text("\(row.1)").monospacedDigit().foregroundStyle(.secondary)
                    }
                    .font(.subheadline)
                }
            }
        }
    }

    // MARK: Requests (Seerr)

    @ViewBuilder private var requestsSection: some View {
        if let requests, requests.configured != false {
            VStack(alignment: .leading, spacing: 12) {
                SectionTitle(title: "Requests")
                if let error = requests.error {
                    Note(text: "Seerr: \(error)")
                } else if requests.results.isEmpty {
                    Note(text: "No requests", systemImage: "tray")
                } else {
                    VStack(spacing: 0) {
                        ForEach(Array(requests.results.prefix(10).enumerated()), id: \.element.id) { i, r in
                            if i > 0 { Divider() }
                            HStack {
                                Image(systemName: r.type == "tv" ? "tv" : "film").foregroundStyle(.secondary).frame(width: 22)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text([r.title, r.year.map { "(\($0))" }].compactMap { $0 }.joined(separator: " ")).lineLimit(1)
                                    Text([r.requestedBy?.displayName, Format.relative(r.createdAt)].compactMap { $0 }.joined(separator: " · "))
                                        .font(.caption).foregroundStyle(.secondary)
                                }
                                Spacer()
                                Text(r.statusLabel).font(.caption.weight(.medium))
                                    .foregroundStyle(r.media?.status == 5 ? .green : r.status == 3 ? .red : .secondary)
                            }
                            .padding(.vertical, 8)
                        }
                    }
                    .card()
                }
            }
        }
    }
}

private struct PosterView: View {
    let item: PlexItem
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            RemoteImage(source: Thumb.plex(item.thumb))
                .frame(width: 120, height: 180)
                .overlay(alignment: .bottom) {
                    if let p = item.progress { ProgressLine(fraction: Double(p) / 100).padding(6) }
                }
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            Text(item.title ?? "").font(.footnote.weight(.medium)).lineLimit(1)
            Text(item.subtitle ?? "").font(.caption2).foregroundStyle(.secondary).lineLimit(1)
        }
        .frame(width: 120)
    }
}

private struct DownloadRow: View {
    let source: String
    let record: QueueRecord
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text([record.title, record.episode].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "))
                    .lineLimit(1)
                Spacer()
                Text("\(record.progress ?? 0)%").monospacedDigit().foregroundStyle(.secondary)
            }
            .font(.subheadline)
            ProgressLine(fraction: Double(record.progress ?? 0) / 100)
            HStack {
                Text(source)
                if let left = Format.bytes(record.sizeleft) { Text("· \(left) left") }
                Spacer()
                if let eta = Format.date(record.eta) { Text(eta, style: .relative) }
            }
            .font(.caption).foregroundStyle(.secondary)
        }
    }
}
