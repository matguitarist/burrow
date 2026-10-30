import AppKit
import SwiftUI

struct RootView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.openWindow) private var openWindow

    var body: some View {
        @Bindable var model = model
        NavigationSplitView {
            List(selection: $model.selection) {
                Section("Burrow") {
                    row(.overview)
                    row(.services)
                    row(.devices)
                }
                Section("System") {
                    row(.settings)
                    row(.logs, badge: model.logs.counts[.error, default: 0])
                }
            }
            .navigationSplitViewColumnWidth(min: 190, ideal: 210, max: 260)
            .safeAreaInset(edge: .bottom, spacing: 0) { serverFooter }
        } detail: {
            switch model.selection ?? .overview {
            case .overview: OverviewView()
            case .services: ServicesView()
            case .devices: DevicesView()
            case .settings: SettingsView()
            case .logs: LogsView()
            }
        }
        .frame(minWidth: 820, minHeight: 540)
        .alert("Burrow", isPresented: Binding(get: { model.errorMessage != nil }, set: { if !$0 { model.errorMessage = nil } })) {
            Button("OK") { model.errorMessage = nil }
        } message: {
            Text(model.errorMessage ?? "")
        }
        .alert("Notice", isPresented: Binding(get: { model.successMessage != nil }, set: { if !$0 { model.successMessage = nil } })) {
            Button("OK") { model.successMessage = nil }
        } message: {
            Text(model.successMessage ?? "")
        }
        .keepsDockIcon()
    }

    private func row(_ item: SidebarItem, badge: Int = 0) -> some View {
        Label(item.title, systemImage: item.symbol)
            .badge(badge)
            .tag(item)
    }

    private var serverFooter: some View {
        let server = model.server
        return HStack(spacing: 8) {
            StatusDot(color: server.isUp ? .green : (server.state == .stopped ? .secondary : .orange))
            Text(server.state == .external ? "Running" : server.statusText)
                .lineLimit(1)
                .font(.callout)
            Spacer()
            if server.state == .stopped {
                Button("Start") { server.start() }
                    .controlSize(.small)
            }
            Button {
                openWindow(id: HelpView.windowID)
                NSApp.activate()
            } label: {
                Image(systemName: "questionmark.circle")
            }
            .buttonStyle(.borderless)
            .help("Burrow Help")
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(.bar)
    }
}
