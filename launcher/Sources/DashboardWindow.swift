import AppKit
import SwiftUI
import WebKit

/// The web dashboard in a native window, so Burrow on this Mac feels like an
/// app. Other devices keep using it in their browser.
struct DashboardWindow: View {
    static let windowID = "dashboard"

    @Environment(AppModel.self) private var model
    @State private var reloadToken = 0

    private var url: URL { URL(string: "http://127.0.0.1:\(serverPort)")! }

    var body: some View {
        NeedsServer {
            DashboardWebView(url: url, reloadToken: reloadToken)
        }
        .frame(minWidth: 720, minHeight: 480)
        .toolbar {
            ToolbarItemGroup {
                Button { reloadToken += 1 } label: { Label("Reload", systemImage: "arrow.clockwise") }
                    .keyboardShortcut("r")
                    .help("Reload")
                Button { model.openInBrowser() } label: { Label("Open in Browser", systemImage: "safari") }
                    .help("Open in your default browser")
            }
        }
        // Server restarted (or came up after the window opened): load it fresh
        .onChange(of: model.server.isUp) { _, up in if up { reloadToken += 1 } }
        .keepsDockIcon()
    }
}

/// WKWebView with the bits a web app expects from a browser: links to other
/// sites open in the default browser, downloads land in ~/Downloads, file
/// pickers and alert/confirm dialogs work.
private struct DashboardWebView: NSViewRepresentable {
    let url: URL
    let reloadToken: Int

    func makeCoordinator() -> Coordinator { Coordinator(home: url) }

    func makeNSView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.preferences.isElementFullscreenEnabled = true
        let web = WKWebView(frame: .zero, configuration: config)
        web.navigationDelegate = context.coordinator
        web.uiDelegate = context.coordinator
        web.allowsBackForwardNavigationGestures = true
        web.setValue(false, forKey: "drawsBackground")  // no white flash before the dark UI paints
        web.load(URLRequest(url: url))
        context.coordinator.lastToken = reloadToken
        return web
    }

    func updateNSView(_ web: WKWebView, context: Context) {
        guard context.coordinator.lastToken != reloadToken else { return }
        context.coordinator.lastToken = reloadToken
        if web.url == nil { web.load(URLRequest(url: url)) } else { web.reload() }
    }

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate {
        let home: URL
        var lastToken = 0
        private var downloads: [WKDownload: URL] = [:]

        init(home: URL) { self.home = home }

        private func isLocal(_ url: URL) -> Bool {
            (url.host == home.host && url.port == home.port) || url.scheme == "blob" || url.scheme == "data"
        }

        // MARK: Navigation

        func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction) async -> WKNavigationActionPolicy {
            if action.shouldPerformDownload { return .download }
            guard let url = action.request.url else { return .allow }
            // Service links, release notes… belong in the real browser
            if action.navigationType == .linkActivated, !isLocal(url) {
                NSWorkspace.shared.open(url)
                return .cancel
            }
            return .allow
        }

        func webView(_ webView: WKWebView, decidePolicyFor response: WKNavigationResponse) async -> WKNavigationResponsePolicy {
            let disposition = (response.response as? HTTPURLResponse)?.value(forHTTPHeaderField: "Content-Disposition") ?? ""
            return disposition.lowercased().hasPrefix("attachment") || !response.canShowMIMEType ? .download : .allow
        }

        func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
            download.delegate = self
        }

        func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
            download.delegate = self
        }

        // target="_blank" links: open in the default browser instead of a new web view
        func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                     for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
            if let url = action.request.url {
                if isLocal(url) { webView.load(action.request) } else { NSWorkspace.shared.open(url) }
            }
            return nil
        }

        // MARK: Downloads → ~/Downloads, then reveal in Finder

        func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String) async -> URL? {
            let dir = FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask)[0]
            var dest = dir.appendingPathComponent(suggestedFilename)
            let base = dest.deletingPathExtension().lastPathComponent, ext = dest.pathExtension
            var n = 1
            while FileManager.default.fileExists(atPath: dest.path) {
                n += 1
                dest = dir.appendingPathComponent(ext.isEmpty ? "\(base) \(n)" : "\(base) \(n).\(ext)")
            }
            downloads[download] = dest
            return dest
        }

        func downloadDidFinish(_ download: WKDownload) {
            if let dest = downloads.removeValue(forKey: download) {
                NSWorkspace.shared.activateFileViewerSelecting([dest])
            }
        }

        func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
            downloads.removeValue(forKey: download)
            NSAlert(error: error).runModal()
        }

        // MARK: File pickers and JS dialogs

        func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters,
                     initiatedByFrame frame: WKFrameInfo) async -> [URL]? {
            let panel = NSOpenPanel()
            panel.allowsMultipleSelection = parameters.allowsMultipleSelection
            panel.canChooseDirectories = parameters.allowsDirectories
            return panel.runModal() == .OK ? panel.urls : nil
        }

        func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                     initiatedByFrame frame: WKFrameInfo) async {
            let alert = NSAlert()
            alert.messageText = message
            alert.runModal()
        }

        func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                     initiatedByFrame frame: WKFrameInfo) async -> Bool {
            let alert = NSAlert()
            alert.messageText = message
            alert.addButton(withTitle: "OK")
            alert.addButton(withTitle: "Cancel")
            return alert.runModal() == .alertFirstButtonReturn
        }
    }
}
