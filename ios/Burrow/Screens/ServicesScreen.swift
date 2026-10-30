import SwiftUI

struct ServicesScreen: View {
    @Environment(Server.self) private var server
    @Environment(\.openURL) private var openURL
    @State private var config: AppConfig?
    @State private var status: [String: ServiceStatus] = [:]
    @State private var uptime: [String: Uptime] = [:]
    @State private var error: String?
    @State private var waking: Set<String> = []

    private let columns = [GridItem(.adaptive(minimum: 260), spacing: 14)]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                if let error { Note(text: error) }
                if let config {
                    summary(config)
                    if !config.devices.isEmpty { devices(config.devices) }
                    ForEach(groups(config.services), id: \.0) { category, services in
                        VStack(alignment: .leading, spacing: 12) {
                            SectionTitle(title: category)
                            LazyVGrid(columns: columns, spacing: 14) {
                                ForEach(services) { serviceCard($0) }
                            }
                        }
                    }
                } else if error == nil {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 80)
                }
            }
            .padding(20)
        }
        .refreshable { await load() }
        .poll(every: .seconds(30)) { await load() }
    }

    private func load() async {
        do {
            async let c: AppConfig = server.get("api/config")
            async let s: [String: ServiceStatus] = server.get("api/services")
            async let u: [String: Uptime] = server.get("api/uptime")
            (config, status, uptime) = try await (c, s, u)
            error = nil
        } catch is CancellationError {
        } catch {
            self.error = error.localizedDescription
        }
    }

    // Categories in the web UI's order, services alphabetical inside each
    private func groups(_ services: [ServiceInfo]) -> [(String, [ServiceInfo])] {
        let order = ["Media", "Downloads", "AI", "Monitoring", "Infrastructure", "Home", "Productivity", "Notifications", "Accounts", "Other"]
        let grouped = Dictionary(grouping: services) { $0.category ?? "Other" }
        return grouped.keys
            .sorted { (order.firstIndex(of: $0) ?? 99, $0) < (order.firstIndex(of: $1) ?? 99, $1) }
            .map { ($0, grouped[$0]!.sorted { $0.name.localizedCompare($1.name) == .orderedAscending }) }
    }

    private func summary(_ config: AppConfig) -> some View {
        let watched = config.services.filter { status[$0.id] != nil }
        let up = watched.filter { status[$0.id]?.online == true }.count
        let down = watched.filter { status[$0.id]?.online == false }
        return HStack(spacing: 12) {
            Image(systemName: down.isEmpty ? "checkmark.seal.fill" : "exclamationmark.triangle.fill")
                .font(.title)
                .foregroundStyle(down.isEmpty ? .green : .orange)
            VStack(alignment: .leading, spacing: 2) {
                Text(down.isEmpty ? "Everything is up" : "\(down.count) service\(down.count == 1 ? " is" : "s are") down")
                    .font(.headline)
                Text(down.isEmpty ? "\(up) services online" : down.map(\.name).joined(separator: ", "))
                    .font(.subheadline).foregroundStyle(.secondary)
            }
            Spacer()
        }
        .card()
    }

    private func devices(_ devices: [Device]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionTitle(title: "Machines")
            LazyVGrid(columns: columns, spacing: 14) {
                ForEach(devices) { device in
                    let s = status["device_\(device.id)"]
                    HStack(spacing: 12) {
                        Image(systemName: deviceSymbol(device.icon))
                            .font(.title2)
                            .foregroundStyle(Color(hex: device.accent) ?? .accentColor)
                            .frame(width: 36)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(device.name).font(.headline).lineLimit(1)
                            HStack(spacing: 6) {
                                StatusDot(online: s?.online)
                                Text(device.ip ?? "").font(.caption.monospaced()).foregroundStyle(.secondary)
                            }
                        }
                        Spacer()
                        if s?.online == false && device.wol == true {
                            Button {
                                Task { await wake(device) }
                            } label: {
                                if waking.contains(device.id) { ProgressView() } else { Label("Wake", systemImage: "power") }
                            }
                            .buttonStyle(.bordered)
                            .disabled(waking.contains(device.id))
                        }
                    }
                    .card()
                }
            }
        }
    }

    private func wake(_ device: Device) async {
        waking.insert(device.id)
        defer { waking.remove(device.id) }
        do { try await server.send("POST", "api/wol/\(device.id)") }
        catch { self.error = "Couldn't wake \(device.name): \(error.localizedDescription)" }
    }

    private func deviceSymbol(_ icon: String?) -> String {
        switch icon {
        case "server": "server.rack"
        case "laptop": "laptopcomputer"
        case "desktop", "monitor": "desktopcomputer"
        case "mac", "macmini": "macmini"
        default: "desktopcomputer"
        }
    }

    private func serviceCard(_ service: ServiceInfo) -> some View {
        let s = status[service.id]
        let u = uptime[service.id]
        let link = service.url.flatMap(URL.init(string:))
        return Button {
            if let link { openURL(link) }
        } label: {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 10) {
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .fill(Color(hex: service.color) ?? .accentColor)
                        .frame(width: 32, height: 32)
                        .overlay(Text(service.name.prefix(1)).font(.headline).foregroundStyle(.white))
                    VStack(alignment: .leading, spacing: 2) {
                        Text(service.name).font(.headline).lineLimit(1)
                        if let s {
                            HStack(spacing: 5) {
                                StatusDot(online: s.online)
                                Text(stateText(s)).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                            }
                        } else {
                            Text(service.cloud == true ? "Online service" : "Not monitored")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                    }
                    Spacer(minLength: 0)
                    if link != nil {
                        Image(systemName: "arrow.up.right").font(.caption).foregroundStyle(.tertiary)
                    }
                }
                if let u {
                    HStack(alignment: .bottom) {
                        VStack(alignment: .leading, spacing: 1) {
                            Text("24h \(Format.percent(u.uptime24h))")
                            Text("7d \(Format.percent(u.uptime7d))").foregroundStyle(.secondary)
                        }
                        .font(.caption2.monospacedDigit())
                        Spacer()
                        UptimeBars(days: u.days ?? [])
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .card()
        }
        .buttonStyle(.plain)
        .disabled(link == nil)
    }

    private func stateText(_ s: ServiceStatus) -> String {
        let span = Format.duration(since: s.since)
        if s.online { return span.map { "Up for \($0)" } ?? "Up" }
        return span.map { "Down for \($0)" } ?? "Down"
    }
}

/// Last 7 days, one bar per day, colored by uptime.
private struct UptimeBars: View {
    let days: [Uptime.Day]
    var body: some View {
        HStack(alignment: .bottom, spacing: 3) {
            ForEach(days, id: \.date) { day in
                let v = day.uptime
                RoundedRectangle(cornerRadius: 2)
                    .fill(v == nil ? Color.secondary.opacity(0.3) : v! >= 99.9 ? .green : v! >= 95 ? .yellow : .red)
                    .frame(width: 7, height: 22)
                    .accessibilityLabel("\(day.date): \(Format.percent(v))")
            }
        }
    }
}
