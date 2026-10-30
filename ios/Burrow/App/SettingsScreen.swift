import SwiftUI

struct SettingsScreen: View {
    @Environment(Server.self) private var server

    var body: some View {
        @Bindable var server = server
        Form {
            Section {
                ForEach($server.addresses) { $address in
                    HStack {
                        TextField("Label", text: $address.label)
                            .frame(width: 110)
                        TextField("Address", text: $address.url)
                            .keyboardType(.URL)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .foregroundStyle(.secondary)
                        if server.activeAddress?.id == address.id {
                            Image(systemName: "checkmark.circle.fill").foregroundStyle(.green)
                                .accessibilityLabel("In use")
                        }
                    }
                }
                .onDelete { server.addresses.remove(atOffsets: $0) }
                .onMove { server.addresses.move(fromOffsets: $0, toOffset: $1) }

                Button("Add Address", systemImage: "plus") {
                    server.addresses.append(ServerAddress(label: "Away", url: ""))
                }
                Button("Reconnect", systemImage: "arrow.clockwise") {
                    Task { await server.connect() }
                }
            } header: {
                Text("Server addresses")
            } footer: {
                Text("Tried from top to bottom; the first one that answers is used. Drag to reorder.")
            }

            Section("Sign-in") {
                if let auth = server.auth {
                    if !auth.passwordSet {
                        Label("This server has no password, so anyone who can reach it has full control. Set one in Burrow on your Mac before using an away address.", systemImage: "exclamationmark.shield")
                            .foregroundStyle(.orange)
                    } else if auth.signedIn {
                        LabeledContent("Status", value: "Signed in")
                        Button("Sign Out", role: .destructive) { Task { await server.logout() } }
                    } else {
                        LabeledContent("Status", value: auth.canControl ? "Not needed here" : "Signed out")
                        Button("Sign In") { server.needsLogin = true }
                    }
                } else {
                    Text(server.state == .connected ? "Checking…" : "Not connected").foregroundStyle(.secondary)
                }
            }

            Section("About") {
                LabeledContent("Version", value: Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "—")
                if let base = server.base {
                    LabeledContent("Connected to", value: base.absoluteString)
                }
            }
        }
        .toolbar { EditButton() }
    }
}
