import AppKit
import SwiftUI

enum HelpTopic: String, CaseIterable, Identifiable {
    case gettingStarted, menuBar, overview, services, devices, settings, shortcuts

    var id: String { rawValue }

    var title: String {
        switch self {
        case .gettingStarted: "Getting Started"
        case .menuBar: "Menu Bar Launcher"
        case .overview: "Overview & Metrics"
        case .services: "Services & Media Stack"
        case .devices: "Devices & Wake-on-LAN"
        case .settings: "Settings & Data"
        case .shortcuts: "Keyboard Shortcuts"
        }
    }

    var icon: String {
        switch self {
        case .gettingStarted: "flag"
        case .menuBar: "menubar.rectangle"
        case .overview: "gauge.with.dots.needle.33percent"
        case .services: "square.grid.2x2"
        case .devices: "server.rack"
        case .settings: "slider.horizontal.3"
        case .shortcuts: "keyboard"
        }
    }
}

struct HelpView: View {
    static let windowID = "help"
    @State private var selection: HelpTopic? = .gettingStarted

    var body: some View {
        NavigationSplitView {
            List(HelpTopic.allCases, selection: $selection) { topic in
                Label(topic.title, systemImage: topic.icon).tag(topic)
            }
            .navigationSplitViewColumnWidth(min: 200, ideal: 220, max: 280)
        } detail: {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if let selection {
                        topicDetail(selection)
                    }
                }
                .padding(24)
                .frame(maxWidth: 720, alignment: .leading)
            }
        }
        .navigationTitle("Burrow Help")
    }

    @ViewBuilder
    private func topicDetail(_ topic: HelpTopic) -> some View {
        switch topic {
        case .gettingStarted:
            Text("Getting Started")
                .font(.title.bold())
            Text("Burrow gives you one place to watch and manage your homelab: machines, services, media servers and more.")
            Text("The native Mac launcher runs in your menu bar. It starts the Node.js backend (`node server.js`), watches its health, monitors system resource usage, and gives you quick access to all your tools.")

            GroupBox("Quick Tips") {
                VStack(alignment: .leading, spacing: 8) {
                    Text("• **Default Address**: Open [http://localhost:3001](http://localhost:3001) in your browser.")
                    Text("• **Menu Bar**: Click the gauge icon in the top menu bar to start, stop, or open Burrow.")
                    Text("• **Settings**: Press **⌘,** anytime to open this settings window.")
                }
                .font(.callout)
            }

        case .menuBar:
            Text("Menu Bar Launcher")
                .font(.title.bold())
            Text("Burrow lives quietly in your macOS menu bar as a background helper (`LSUIElement`).")
            VStack(alignment: .leading, spacing: 8) {
                Text("• **Gauge Icon**: Indicates that the server is up and healthy.")
                Text("• **Open in Browser (⌘O)**: Opens Burrow in your default browser.")
                Text("• **Start / Stop Server (⌘S)**: Controls the background Node process without needing a terminal.")
                Text("• **Quit (⌘Q)**: Shuts down the background process and exits cleanly.")
            }

        case .overview:
            Text("Overview & Metrics")
                .font(.title.bold())
            Text("The **Overview** page gives you instant diagnostics:")
            VStack(alignment: .leading, spacing: 8) {
                Text("• **CPU Usage**: Real-time Node.js process CPU percentage sampled over 300ms intervals.")
                Text("• **Physical Memory (RSS)**: Total resident RAM allocated by Node.")
                Text("• **V8 Heap**: Active JavaScript objects and total V8 memory capacity.")
                Text("• **LAN Addresses**: Clickable URLs to open Burrow from other computers, tablets, or phones on your home network.")
            }

        case .services:
            Text("Services & Media Stack")
                .font(.title.bold())
            Text("Every service has its own card in the **Services** tab: the device it runs on (or a custom host), its port, and its API key or login. **Test Connection** checks that it's reachable and the credentials work.")
            VStack(alignment: .leading, spacing: 8) {
                Text("• **Add Service** picks from a template catalog: integrations that power Burrow's widgets (Plex, Radarr, Sonarr, Tautulli, Seerr, qBittorrent, Gotify, Steam, Ollama, oMLX, Draw Things, Unraid) and ~50 popular self-hosted apps that get a status dot and a link.")
                Text("• Services linked to a device follow its IP — change it once in **Devices & WOL**.")
                Text("• **Export Template** (⋯ menu) shares your service list without IPs, keys or passwords; **Import Template** adds one, ready to fill in.")
                Text("• The same list is editable from the web Settings panel — both stay in sync.")
            }

        case .devices:
            Text("Devices & Wake-on-LAN")
                .font(.title.bold())
            Text("Manage your home network machines from the **Devices & WOL** tab.")
            Text("If you enter the machine's MAC address (e.g. `AA:BB:CC:DD:EE:FF`), you can send UDP broadcast magic packets to wake sleeping PCs or NAS devices over the network with a single click.")

        case .settings:
            Text("Settings & Data")
                .font(.title.bold())
            Text("Region, news, weather and monitoring options are in **Settings**; machines in **Devices & WOL**; service hosts, ports and API keys in **Services**. Changes apply immediately, no restart needed.")
            Text("Everything is stored as JSON in `~/Library/Application Support/Burrow/` (`settings.json`, `services.json`, …). Use **Open Data Folder** in the menu bar to find it, and the web UI's Backup tab to export or restore it.")

        case .shortcuts:
            Text("Keyboard Shortcuts")
                .font(.title.bold())
            VStack(alignment: .leading, spacing: 10) {
                shortcutRow("⌘,", "Open Settings window")
                shortcutRow("⌘O", "Open Burrow in default browser")
                shortcutRow("⌘S", "Start or Stop the server (in menu) / Save Settings (in Settings tab)")
                shortcutRow("⌘R", "Restart server")
                shortcutRow("⌘L", "Show Logs")
                shortcutRow("⌘Q", "Quit Burrow and stop server")
            }
        }
    }

    private func shortcutRow(_ key: String, _ desc: String) -> some View {
        HStack {
            Text(key)
                .font(.system(.body, design: .monospaced).bold())
                .frame(width: 60, alignment: .leading)
            Text(desc)
                .font(.callout)
        }
    }
}
