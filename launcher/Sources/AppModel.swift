import AppKit
import Observation
import ServiceManagement
import SwiftUI

/// Shared state: the Node server process, its live logs, system metrics, and settings.
@MainActor
@Observable
final class AppModel {
    static let shared = AppModel()

    let server = ServerProcess()
    let logs = LogStore()

    var selection: SidebarItem? = SidebarItem(rawValue: UserDefaults.standard.string(forKey: "sidebarSelection") ?? "") ?? .overview {
        didSet { UserDefaults.standard.set(selection?.rawValue, forKey: "sidebarSelection") }
    }

    private(set) var settings: BurrowSettings?
    var devices: [DeviceInfo] { settings?.devices ?? [] }
    private(set) var stats: ProcessStats?
    private(set) var services: [ServiceInstance] = []
    private(set) var catalog = ServiceCatalog(categories: [], templates: [])
    private(set) var serviceLinks: [String: URL] = [:]
    private(set) var serviceHealth: [String: ServiceHealth] = [:]
    private(set) var aiBackend: ServerConfig.AI?
    private(set) var holidayCalendars: [ServerConfig.Calendar] = []
    var errorMessage: String?
    var successMessage: String?

    var openMainWindow: (() -> Void)?
    var launchedAtLogin = false

    var launchAtLogin: Bool {
        get { SMAppService.mainApp.status == .enabled }
        set {
            do {
                if newValue { try SMAppService.mainApp.register() } else { try SMAppService.mainApp.unregister() }
            } catch {
                errorMessage = "Couldn't update Launch at Login: \(error.localizedDescription)"
            }
        }
    }

    private init() {
        Task { await refreshLoop() }
    }

    func show(_ item: SidebarItem) {
        selection = item
        openMainWindow?()
    }

    func openInBrowser(_ url: URL? = nil) {
        let target = url ?? URL(string: "http://localhost:\(serverPort)")!
        NSWorkspace.shared.open(target)
    }

    // MARK: - Server Refresh Loop

    private func refreshLoop() async {
        var wasUp = false
        while !Task.isCancelled {
            if server.isUp {
                if !wasUp {
                    await reloadSettings()
                    await reloadServices()
                }
                await reloadSystemStats()
            } else {
                stats = nil
            }
            wasUp = server.isUp
            try? await Task.sleep(for: .seconds(server.isUp ? 4 : 2))
        }
    }

    func reloadSystemStats() async {
        stats = try? await API.shared.getSystemStats()
    }

    func reloadSettings() async {
        if let s = try? await API.shared.getSettings() { settings = s }
    }

    @discardableResult
    func saveSettings(_ new: BurrowSettings) async -> Bool {
        do {
            let devicesChanged = new.devices != settings?.devices
            settings = try await API.shared.saveSettings(new)
            // Device IPs feed service links
            if devicesChanged { await reloadServiceLinks() }
            successMessage = "Settings saved."
            return true
        } catch {
            errorMessage = "Couldn't save settings: \(error.localizedDescription)"
            return false
        }
    }

    /// Change one part of the settings, e.g. `updateSettings { $0.devices = list }`.
    @discardableResult
    func updateSettings(_ change: (inout BurrowSettings) -> Void) async -> Bool {
        guard var s = settings else { return false }
        change(&s)
        return await saveSettings(s)
    }

    func wakeDevice(_ device: DeviceInfo) async {
        do {
            try await API.shared.wakeOnLan(machine: device.id)
            successMessage = "Wake-on-LAN magic packet sent to \(device.name) (\(device.mac))"
        } catch {
            errorMessage = "Failed to send Wake-on-LAN: \(error.localizedDescription)"
        }
    }

    // MARK: - Services

    func template(for service: ServiceInstance) -> ServiceTemplate? {
        catalog.templates.first { $0.id == service.template }
    }

    func reloadServices() async {
        if let c = try? await API.shared.getServiceCatalog() { catalog = c }
        if let list = try? await API.shared.getServiceConfig() { services = list }
        await reloadServiceLinks()
    }

    private func reloadServiceLinks() async {
        guard let config = try? await API.shared.getServerConfig() else { return }
        var links: [String: URL] = [:]
        for s in config.services { if let u = s.url, let url = URL(string: u) { links[s.id] = url } }
        serviceLinks = links
        aiBackend = config.ai
        holidayCalendars = config.region?.calendars ?? []
    }

    func reloadServiceHealth() async {
        if let h = try? await API.shared.getServiceHealth() { serviceHealth = h }
    }

    @discardableResult
    func saveServices(_ list: [ServiceInstance]) async -> Bool {
        do {
            try await API.shared.saveServiceConfig(list)
            services = list
            await reloadServiceLinks()
            successMessage = "Services saved."
            return true
        } catch {
            errorMessage = "Couldn't save services: \(error.localizedDescription)"
            return false
        }
    }

    // MARK: - Network IP helper

    var localIPAddress: String? {
        var address: String?
        var ifaddr: UnsafeMutablePointer<ifaddrs>?
        guard getifaddrs(&ifaddr) == 0, let firstAddr = ifaddr else { return nil }
        defer { freeifaddrs(ifaddr) }

        for ptr in sequence(first: firstAddr, next: { $0.pointee.ifa_next }) {
            let flags = Int32(ptr.pointee.ifa_flags)
            let addr = ptr.pointee.ifa_addr.pointee
            if (flags & (IFF_UP | IFF_RUNNING | IFF_LOOPBACK)) == (IFF_UP | IFF_RUNNING) {
                if addr.sa_family == UInt8(AF_INET) {
                    var hostname = [CChar](repeating: 0, count: Int(NI_MAXHOST))
                    if getnameinfo(ptr.pointee.ifa_addr, socklen_t(addr.sa_len), &hostname, socklen_t(hostname.count), nil, 0, NI_NUMERICHOST) == 0 {
                        address = String(cString: hostname)
                        let ifName = String(cString: ptr.pointee.ifa_name)
                        if ifName == "en0" || ifName == "en1" {
                            return address
                        }
                    }
                }
            }
        }
        return address
    }
}
