import SwiftUI

@main
struct BurrowApp: App {
    @State private var server = Server.shared
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(server)
        }
        .onChange(of: scenePhase) { _, phase in
            // Coming back to the app may mean a different network — re-pick the address
            if phase == .active { Task { await server.connect() } }
        }
    }
}
