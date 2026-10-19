import Foundation
import Sparkle

/// Sparkle auto-updates. Only active when the build has a feed URL and public
/// key in Info.plist (release builds with launcher/config.local.sh filled in).
@MainActor
final class Updater {
    static let shared = Updater()

    private let controller: SPUStandardUpdaterController?

    var isAvailable: Bool { controller != nil }

    private init() {
        let info = Bundle.main.infoDictionary ?? [:]
        let configured = (info["SUFeedURL"] as? String)?.isEmpty == false && (info["SUPublicEDKey"] as? String)?.isEmpty == false
        controller = configured
            ? SPUStandardUpdaterController(startingUpdater: true, updaterDelegate: nil, userDriverDelegate: nil)
            : nil
    }

    func checkForUpdates() {
        controller?.checkForUpdates(nil)
    }
}
