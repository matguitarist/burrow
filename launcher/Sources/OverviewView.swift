import AppKit
import SwiftUI

struct OverviewView: View {
    @Environment(AppModel.self) private var model
    @AppStorage("autoStartServer") private var autoStartServer = true
    @State private var launchAtLogin = false
    @State private var port = serverPort

    var body: some View {
        let server = model.server
        Form {
            Section {
                headerCard
                if let error = server.lastError {
                    Label(error, systemImage: "exclamationmark.triangle.fill")
                        .foregroundStyle(.orange)
                        .padding(.vertical, 4)
                }
            }

            if server.isUp, let stats = model.stats {
                Section("Process Metrics (Node.js)") {
                    HStack(spacing: 12) {
                        StatCard(
                            title: "CPU USAGE",
                            value: "\(stats.cpu)%",
                            subtitle: "Sampled over 300ms",
                            icon: "cpu",
                            color: stats.cpu > 50 ? .orange : .blue
                        )
                        StatCard(
                            title: "PHYSICAL MEMORY (RSS)",
                            value: stats.rss.formattedBytes,
                            subtitle: "Active RAM footprint",
                            icon: "memorychip",
                            color: .purple
                        )
                        StatCard(
                            title: "V8 HEAP ALLOCATED",
                            value: stats.heapUsed.formattedBytes,
                            subtitle: "of \(stats.heapTotal.formattedBytes) total",
                            icon: "internaldrive",
                            color: .green
                        )
                    }
                    .padding(.vertical, 4)
                }
            }

            Section("Addresses") {
                AddressRow(label: "On this Mac", url: URL(string: "http://localhost:\(serverPort)")!)
                if let localIP = model.localIPAddress, let lanURL = URL(string: "http://\(localIP):\(serverPort)") {
                    AddressRow(label: "Local Network (LAN)", url: lanURL)
                }
            }

            if !model.devices.isEmpty {
                Section("Managed Devices") {
                    ForEach(model.devices) { device in
                        HStack {
                            Image(systemName: device.symbol)
                                .font(.title3)
                                .foregroundStyle(device.accentColor)
                                .frame(width: 28)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(device.name)
                                    .fontWeight(.medium)
                                HStack(spacing: 6) {
                                    Text(device.ip.isEmpty ? "No IP configured" : device.ip)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                    if !device.mac.isEmpty {
                                        Text("•")
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                        Text(device.mac)
                                            .font(.caption.monospaced())
                                            .foregroundStyle(.secondary)
                                    }
                                }
                            }
                            Spacer()
                            if !device.mac.isEmpty {
                                Button {
                                    Task { await model.wakeDevice(device) }
                                } label: {
                                    Label("Wake", systemImage: "bolt.fill")
                                }
                                .controlSize(.small)
                                .disabled(!server.isUp)
                                .help("Send Wake-on-LAN packet")
                            }
                        }
                        .padding(.vertical, 2)
                    }
                }
            }

            let problems = model.logs.recentProblems
            if !problems.isEmpty {
                Section {
                    ForEach(problems.reversed()) { line in
                        HStack(alignment: .firstTextBaseline, spacing: 8) {
                            Image(systemName: line.level.symbol)
                                .foregroundStyle(line.level.color)
                            Text(line.time)
                                .monospacedDigit()
                                .foregroundStyle(.secondary)
                            Text(line.message)
                                .lineLimit(2)
                                .foregroundStyle(line.level.color)
                        }
                        .font(.callout)
                    }
                } header: {
                    HStack {
                        Text("Recent Log Warnings")
                        Spacer()
                        Button("Show Logs") {
                            model.show(.logs)
                        }
                        .buttonStyle(.link)
                    }
                }
            }

            Section("Launcher Options") {
                Toggle(isOn: $autoStartServer) {
                    Text("Start server automatically when Burrow opens")
                    Text("Launches the Node backend in the background on startup.")
                }

                Toggle(isOn: $launchAtLogin) {
                    Text("Launch Burrow at login")
                    Text("Runs silently in the menu bar when you log into your Mac.")
                }
                .onChange(of: launchAtLogin) { _, on in
                    if on != model.launchAtLogin { model.launchAtLogin = on }
                    launchAtLogin = model.launchAtLogin
                }

                LabeledContent {
                    HStack {
                        TextField("Port", value: $port, format: .number.grouping(.never))
                            .labelsHidden()
                            .frame(width: 70)
                            .multilineTextAlignment(.trailing)
                            .onSubmit(applyPort)
                        if port != serverPort {
                            Button("Apply", action: applyPort)
                                .buttonStyle(.borderedProminent)
                        }
                    }
                } label: {
                    Text("Server Port")
                    Text("Port for both the web interface and API endpoints.")
                }
            }
        }
        .formStyle(.grouped)
        .navigationTitle("Overview")
        .onAppear {
            launchAtLogin = model.launchAtLogin
            port = serverPort
        }
    }

    private var headerCard: some View {
        let server = model.server
        return HStack(spacing: 16) {
            ZStack {
                Circle()
                    .fill(server.isUp ? Color.green.opacity(0.15) : (server.state == .stopped ? Color.secondary.opacity(0.15) : Color.orange.opacity(0.15)))
                    .frame(width: 48, height: 48)
                Image(systemName: server.isUp ? "checkmark.circle.fill" : (server.state == .stopped ? "power.circle" : "arrow.triangle.2.circlepath.circle"))
                    .font(.title2)
                    .foregroundStyle(server.isUp ? Color.green : (server.state == .stopped ? Color.secondary : Color.orange))
            }

            VStack(alignment: .leading, spacing: 3) {
                Text(server.statusText)
                    .font(.title3.weight(.semibold))
                Text(server.isUp ? "The web interface and API are healthy." : "The background Node process is not currently active.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            HStack(spacing: 8) {
                if server.isUp {
                    Button("Open in Browser") {
                        model.openInBrowser()
                    }
                    .buttonStyle(.borderedProminent)

                    Button("Restart") {
                        server.restart()
                    }
                    .buttonStyle(.bordered)

                    Button("Stop") {
                        server.stop()
                    }
                    .buttonStyle(.bordered)
                } else if server.state == .stopped {
                    Button("Start Server") {
                        server.start()
                    }
                    .buttonStyle(.borderedProminent)
                }
            }
        }
        .padding(.vertical, 6)
    }

    private func applyPort() {
        guard port > 0 && port < 65536 else {
            port = serverPort
            return
        }
        model.server.changePort(to: port)
    }
}
