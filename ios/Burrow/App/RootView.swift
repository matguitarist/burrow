import SwiftUI

enum Screen: String, CaseIterable, Identifiable {
    case services, media, games, dashboard, settings
    var id: Self { self }

    var title: String {
        switch self {
        case .services:  "Services"
        case .media:     "Media"
        case .games:     "Games"
        case .dashboard: "Dashboard"
        case .settings:  "Settings"
        }
    }

    var icon: String {
        switch self {
        case .services:  "square.grid.2x2"
        case .media:     "play.rectangle"
        case .games:     "gamecontroller"
        case .dashboard: "safari"
        case .settings:  "gearshape"
        }
    }
}

struct RootView: View {
    @Environment(Server.self) private var server
    @SceneStorage("screen") private var screen: Screen = .services

    var body: some View {
        @Bindable var server = server
        Group {
            if server.addresses.isEmpty {
                ConnectView()
            } else {
                NavigationSplitView {
                    List(selection: Binding($screen)) {
                        Section {
                            ForEach([Screen.services, .media, .games]) { s in
                                Label(s.title, systemImage: s.icon).tag(s)
                            }
                        }
                        Section("More") {
                            Label("Dashboard (web)", systemImage: Screen.dashboard.icon).tag(Screen.dashboard)
                            Label(Screen.settings.title, systemImage: Screen.settings.icon).tag(Screen.settings)
                        }
                    }
                    .navigationTitle("Burrow")
                    .safeAreaInset(edge: .bottom) { ConnectionBadge().padding() }
                } detail: {
                    NavigationStack {
                        detail
                            .navigationTitle(screen.title)
                    }
                }
            }
        }
        .task {
            #if DEBUG
            // simctl launch … -screen games  → open a screen directly (screenshots/testing)
            if let s = UserDefaults.standard.string(forKey: "screen").flatMap(Screen.init(rawValue:)) { screen = s }
            #endif
            await server.connect()
        }
        .sheet(isPresented: $server.needsLogin) { LoginSheet() }
    }

    @ViewBuilder private var detail: some View {
        if server.state == .unreachable && screen != .settings {
            UnreachableView()
        } else {
            switch screen {
            case .services:  ServicesScreen()
            case .media:     MediaScreen()
            case .games:     GamesScreen()
            case .dashboard: DashboardScreen()
            case .settings:  SettingsScreen()
            }
        }
    }
}

private struct ConnectionBadge: View {
    @Environment(Server.self) private var server

    var body: some View {
        HStack(spacing: 8) {
            switch server.state {
            case .connected:
                StatusDot(online: true)
                Text(server.activeAddress?.label ?? "Connected")
            case .connecting, .idle:
                ProgressView().controlSize(.small)
                Text("Connecting…")
            case .unreachable:
                StatusDot(online: false)
                Text("Can't reach Burrow")
            }
            Spacer()
        }
        .font(.footnote)
        .foregroundStyle(.secondary)
    }
}

private struct UnreachableView: View {
    @Environment(Server.self) private var server

    var body: some View {
        ContentUnavailableView {
            Label("Can't reach Burrow", systemImage: "wifi.exclamationmark")
        } description: {
            Text("None of your server addresses answered. Check that Burrow is running, or add an address that works from here in Settings.")
        } actions: {
            Button("Try Again") { Task { await server.connect() } }
                .buttonStyle(.borderedProminent)
        }
    }
}
