import SwiftUI

struct GamesScreen: View {
    enum Filter: String, CaseIterable, Identifiable {
        case all = "All", want = "Want", playing = "Playing", done = "Done", sale = "On Sale"
        var id: Self { self }
    }
    enum Sort: String, CaseIterable, Identifiable {
        case added = "Recently Added", discount = "Biggest Discount", priceLow = "Price: Low to High"
        case priceHigh = "Price: High to Low", name = "Name"
        var id: Self { self }
    }

    @Environment(Server.self) private var server
    @State private var games: [Game] = []
    @State private var loaded = false
    @State private var error: String?
    @State private var filter: Filter = .all
    @AppStorage("gamesSort") private var sort: Sort = .added
    @State private var search = ""
    @State private var selected: Game?

    private var visible: [Game] {
        var list = games.filter { g in
            switch filter {
            case .all:     true
            case .want:    (g.status ?? "want") == "want"
            case .playing: g.status == "playing"
            case .done:    g.status == "done"
            case .sale:    g.onSale == true
            }
        }
        if !search.isEmpty { list = list.filter { $0.title.localizedCaseInsensitiveContains(search) } }
        switch sort {
        case .added:     list.sort { ($0.addedAt ?? "") > ($1.addedAt ?? "") }
        case .discount:  list.sort { ($0.discountPct ?? 0) > ($1.discountPct ?? 0) }
        case .priceLow:  list.sort { $0.priceValue < $1.priceValue }
        case .priceHigh: list.sort { ($0.priceValue.isFinite ? $0.priceValue : -1) > ($1.priceValue.isFinite ? $1.priceValue : -1) }
        case .name:      list.sort { $0.title.localizedCompare($1.title) == .orderedAscending }
        }
        return list
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Picker("Filter", selection: $filter) {
                    ForEach(Filter.allCases) { f in Text("\(f.rawValue) (\(count(f)))").tag(f) }
                }
                .pickerStyle(.segmented)

                if let error { Note(text: error) }

                if !loaded {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 80)
                } else if visible.isEmpty {
                    ContentUnavailableView(search.isEmpty ? "No games here" : "No matches", systemImage: "gamecontroller")
                        .padding(.top, 60)
                } else {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 260), spacing: 16)], spacing: 16) {
                        ForEach(visible) { game in
                            Button { selected = game } label: { GameCard(game: game) }
                                .buttonStyle(.plain)
                        }
                    }
                }
            }
            .padding(20)
        }
        .searchable(text: $search, prompt: "Search games")
        .toolbar {
            Menu {
                Picker("Sort", selection: $sort) {
                    ForEach(Sort.allCases) { Text($0.rawValue).tag($0) }
                }
            } label: {
                Label("Sort", systemImage: "arrow.up.arrow.down")
            }
        }
        .refreshable { await load() }
        .poll(every: .seconds(300)) { await load() }
        .sheet(item: $selected) { game in
            GameDetailSheet(game: game) { updated in
                if let i = games.firstIndex(where: { $0.appid == game.appid }) {
                    if let updated { games[i] = updated } else { games.remove(at: i) }
                }
            }
            .presentationSizing(.page)
        }
    }

    private func count(_ f: Filter) -> Int {
        switch f {
        case .all:     games.count
        case .want:    games.filter { ($0.status ?? "want") == "want" }.count
        case .playing: games.filter { $0.status == "playing" }.count
        case .done:    games.filter { $0.status == "done" }.count
        case .sale:    games.filter { $0.onSale == true }.count
        }
    }

    private func load() async {
        do {
            games = try await server.get("api/games")
            error = nil
            #if DEBUG
            // simctl launch … -openGame <appid>  → open its detail sheet (screenshots/testing)
            let appid = UserDefaults.standard.integer(forKey: "openGame")
            if !loaded, appid != 0 { selected = games.first { $0.appid == appid } }
            #endif
        } catch is CancellationError {
        } catch {
            self.error = error.localizedDescription
        }
        loaded = true
    }
}

private struct GameCard: View {
    let game: Game
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            RemoteImage(source: game.headerImage)
                .aspectRatio(460.0 / 215.0, contentMode: .fit)
                .overlay(alignment: .topLeading) {
                    if game.onSale == true, let pct = game.discountPct {
                        Text("-\(pct)%")
                            .font(.caption.weight(.bold))
                            .padding(.horizontal, 7).padding(.vertical, 3)
                            .background(.green, in: Capsule())
                            .foregroundStyle(.black)
                            .padding(8)
                    }
                }
            VStack(alignment: .leading, spacing: 4) {
                Text(game.title).font(.headline).lineLimit(1)
                HStack {
                    PriceText(game: game)
                    Spacer()
                    if game.status == "playing" { Label("Playing", systemImage: "play.fill").labelStyle(.iconOnly).foregroundStyle(.blue) }
                    if game.status == "done" { Label("Done", systemImage: "checkmark").labelStyle(.iconOnly).foregroundStyle(.green) }
                }
                .font(.subheadline)
            }
            .padding(12)
        }
        .background(.background.secondary)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}

struct PriceText: View {
    let game: Game
    var body: some View {
        if game.comingSoon == true && game.price == nil {
            Text(game.releaseDate ?? "Coming soon").foregroundStyle(.secondary)
        } else if game.delisted == true {
            Text("No longer sold").foregroundStyle(.secondary)
        } else if game.onSale == true, let orig = game.origPrice {
            HStack(spacing: 6) {
                Text(orig).strikethrough().foregroundStyle(.secondary)
                Text(game.price ?? "").foregroundStyle(.green)
            }
        } else {
            Text(game.price ?? "—")
        }
    }
}

// MARK: - Detail

private struct GameDetailSheet: View {
    @State var game: Game
    /// Updated game, or nil when it was removed.
    let onChange: (Game?) -> Void

    @Environment(Server.self) private var server
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    @State private var details: GameDetails?
    @State private var confirmRemove = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    RemoteImage(source: game.headerImage)
                        .aspectRatio(460.0 / 215.0, contentMode: .fit)
                        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))

                    HStack(alignment: .firstTextBaseline) {
                        Text(game.title).font(.title2.bold())
                        Spacer()
                        PriceText(game: game).font(.title3)
                    }

                    if let d = details?.description, !d.isEmpty {
                        Text(d).foregroundStyle(.secondary)
                    }
                    if let genres = details?.genres, !genres.isEmpty {
                        HStack { ForEach(genres, id: \.self) { Text($0).font(.caption).padding(.horizontal, 10).padding(.vertical, 5).background(.quaternary, in: Capsule()) } }
                    }

                    Picker("Status", selection: statusBinding) {
                        Label("Want", systemImage: "star").tag("want")
                        Label("Playing", systemImage: "play").tag("playing")
                        Label("Done", systemImage: "checkmark").tag("done")
                    }
                    .pickerStyle(.segmented)

                    Grid(alignment: .leading, horizontalSpacing: 24, verticalSpacing: 14) {
                        GridRow {
                            field("Release date", game.releaseDate ?? "To be announced")
                            field("Developers", details?.developers?.joined(separator: ", ") ?? "—")
                        }
                        GridRow {
                            lowestPrice
                            nextSale
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .card()

                    if let shots = details?.screenshots, !shots.isEmpty {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 10) {
                                ForEach(shots, id: \.self) { s in
                                    RemoteImage(source: s).frame(width: 260, height: 146).clipShape(RoundedRectangle(cornerRadius: 10))
                                }
                            }
                        }
                    }
                    if let error { Note(text: error) }
                }
                .padding(24)
            }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Done") { dismiss() } }
                ToolbarItemGroup(placement: .primaryAction) {
                    Button("Remove", systemImage: "trash", role: .destructive) { confirmRemove = true }
                    if let url = game.url.flatMap(URL.init(string:)) {
                        Button("Open on Steam", systemImage: "arrow.up.right.square") { openURL(url) }
                    }
                }
            }
            .confirmationDialog("Remove \(game.title) from your wishlist?", isPresented: $confirmRemove, titleVisibility: .visible) {
                Button("Remove", role: .destructive) { Task { await remove() } }
            }
            .task { details = try? await server.get("api/games/\(game.appid)/details") }
        }
    }

    private func field(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(label).font(.caption.weight(.semibold)).foregroundStyle(.secondary).textCase(.uppercase)
            Text(value)
        }
    }

    @ViewBuilder private var lowestPrice: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text("Lowest price ever").font(.caption.weight(.semibold)).foregroundStyle(.secondary).textCase(.uppercase)
            if let d = details {
                if d.itadConfigured != true {
                    Text("Add IsThereAnyDeal in Burrow's settings").foregroundStyle(.secondary)
                } else if let low = d.historyLow {
                    HStack(spacing: 6) {
                        Text(Format.money(low.price, low.currency)).foregroundStyle(.green)
                        if low.cut > 0 { Text("-\(low.cut)%").font(.caption.bold()) }
                        if let date = Format.date(low.date) {
                            Text(date, format: .dateTime.month(.abbreviated).day().year()).foregroundStyle(.secondary)
                        }
                    }
                } else {
                    Text("No price history yet").foregroundStyle(.secondary)
                }
            } else {
                Text("—")
            }
        }
    }

    @ViewBuilder private var nextSale: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text("Next Steam sale").font(.caption.weight(.semibold)).foregroundStyle(.secondary).textCase(.uppercase)
            if let s = details?.nextSale, let start = Format.date(s.start), let end = Format.date(s.end) {
                if s.active {
                    Text("\(s.name) · on now, ends \(end.formatted(.dateTime.month(.abbreviated).day()))").foregroundStyle(.green)
                } else {
                    Text("\(s.name) · \(start.formatted(.dateTime.month(.abbreviated).day())) – \(end.formatted(.dateTime.month(.abbreviated).day()))")
                    Text(start, style: .relative).font(.caption).foregroundStyle(.secondary)
                }
            } else {
                Text("—")
            }
        }
    }

    private var statusBinding: Binding<String> {
        Binding(get: { game.status ?? "want" }, set: { new in Task { await setStatus(new) } })
    }

    private func setStatus(_ status: String) async {
        let old = game.status
        game.status = status
        do {
            struct Body: Encodable { let status: String }
            try await server.send("PUT", "api/games/\(game.appid)", body: Body(status: status))
            onChange(game)
        } catch {
            game.status = old
            self.error = error.localizedDescription
        }
    }

    private func remove() async {
        do {
            try await server.send("DELETE", "api/games/\(game.appid)")
            onChange(nil)
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
