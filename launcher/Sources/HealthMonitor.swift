import AppKit
import UserNotifications

/// Watches service (and optionally device) health while the server runs and
/// posts macOS notifications when something goes down or comes back — no
/// browser tab needed. Feeds `AppModel.serviceHealth` and the menu bar count.
@MainActor
final class HealthMonitor: NSObject, UNUserNotificationCenterDelegate {
    /// Preference keys (Settings → Alerts)
    static let enabledKey = "alertsEnabled"
    static let devicesKey = "alertsIncludeDevices"
    static let recoveryKey = "alertsRecovery"

    private let interval: Duration = .seconds(30)
    /// The server already confirms an outage (two failed checks in a row)
    /// before reporting it down, so one report is enough here.
    private let failuresBeforeAlert = 1

    private var failures: [String: Int] = [:]
    /// Ids we've announced as down (and not yet as recovered)
    private(set) var down: Set<String> = []
    private var task: Task<Void, Never>?

    var onOpenDashboard: (() -> Void)?

    override init() {
        super.init()
        UserDefaults.standard.register(defaults: [Self.enabledKey: true, Self.devicesKey: false, Self.recoveryKey: true])
        UNUserNotificationCenter.current().delegate = self
    }

    func start(model: AppModel) {
        guard task == nil else { return }
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { _, _ in }
        task = Task { [weak self] in
            while !Task.isCancelled {
                guard let self else { return }
                if model.server.isUp { await self.check(model) }
                try? await Task.sleep(for: self.interval)
            }
        }
    }

    private func check(_ model: AppModel) async {
        guard let health = try? await API.shared.getServiceHealth() else { return }
        model.applyServiceHealth(health)

        let defaults = UserDefaults.standard
        let includeDevices = defaults.bool(forKey: Self.devicesKey)
        let watched = health.filter { id, _ in includeDevices || !id.hasPrefix("device_") }

        for (id, state) in watched {
            if state.online {
                failures[id] = 0
                if down.remove(id) != nil, defaults.bool(forKey: Self.recoveryKey) {
                    notify(title: "\(name(for: id, model)) is back online", body: nil, id: id)
                }
            } else {
                failures[id, default: 0] += 1
                if failures[id] == failuresBeforeAlert, down.insert(id).inserted {
                    notify(title: "\(name(for: id, model)) went offline", body: "Burrow will let you know when it's back.", id: id)
                }
            }
        }
        // Forget anything no longer reported (removed/disabled, or devices toggled off)
        down.formIntersection(watched.keys)
        model.downCount = down.count
        model.downNames = down.map { name(for: $0, model) }.sorted()
    }

    private func name(for id: String, _ model: AppModel) -> String {
        if id.hasPrefix("device_") {
            let deviceId = String(id.dropFirst("device_".count))
            return model.devices.first { $0.id == deviceId }?.name ?? deviceId
        }
        return model.services.first { $0.id == id }?.name ?? id
    }

    private func notify(title: String, body: String?, id: String) {
        guard UserDefaults.standard.bool(forKey: Self.enabledKey) else { return }
        let content = UNMutableNotificationContent()
        content.title = title
        if let body { content.body = body }
        content.sound = .default
        // Same identifier per service: a recovery replaces its "went offline" banner
        let request = UNNotificationRequest(identifier: "health.\(id)", content: content, trigger: nil)
        UNUserNotificationCenter.current().add(request)
    }

    // Show banners even while a Burrow window is focused
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        [.banner, .sound]
    }

    // Clicking an alert opens the dashboard
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        await MainActor.run { onOpenDashboard?() }
    }
}
