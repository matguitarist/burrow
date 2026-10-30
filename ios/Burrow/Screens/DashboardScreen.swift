import SwiftUI
import WebKit

/// The full web dashboard, for everything that isn't native yet. Shares the
/// app's sign-in by copying the session cookie into the web view first.
struct DashboardScreen: View {
    @Environment(Server.self) private var server
    @State private var reloadToken = 0

    var body: some View {
        Group {
            if let base = server.base {
                WebView(url: base, reloadToken: reloadToken)
                    .ignoresSafeArea(edges: .bottom)
            } else {
                ProgressView()
            }
        }
        .toolbar {
            Button("Reload", systemImage: "arrow.clockwise") { reloadToken += 1 }
        }
    }
}

private struct WebView: UIViewRepresentable {
    let url: URL
    let reloadToken: Int

    func makeUIView(context: Context) -> WKWebView {
        let view = WKWebView(frame: .zero, configuration: WKWebViewConfiguration())
        view.allowsBackForwardNavigationGestures = true
        view.isInspectable = true
        load(url, in: view)
        context.coordinator.loaded = (url, reloadToken)
        return view
    }

    func updateUIView(_ view: WKWebView, context: Context) {
        guard context.coordinator.loaded.url != url || context.coordinator.loaded.token != reloadToken else { return }
        context.coordinator.loaded = (url, reloadToken)
        load(url, in: view)
    }

    func makeCoordinator() -> Coordinator { Coordinator() }
    final class Coordinator { var loaded: (url: URL?, token: Int) = (nil, 0) }

    private func load(_ url: URL, in view: WKWebView) {
        let cookies = HTTPCookieStorage.shared.cookies(for: url) ?? []
        let store = view.configuration.websiteDataStore.httpCookieStore
        Task { @MainActor in
            for cookie in cookies { await store.setCookie(cookie) }
            view.load(URLRequest(url: url))
        }
    }
}
