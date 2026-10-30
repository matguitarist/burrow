import SwiftUI

/// First run: where is the server?
struct ConnectView: View {
    @Environment(Server.self) private var server
    @State private var home = ""
    @State private var away = ""
    @State private var checking = false
    @State private var error: String?

    var body: some View {
        VStack(spacing: 28) {
            VStack(spacing: 10) {
                Image(systemName: "gauge.with.dots.needle.33percent")
                    .font(.system(size: 56))
                    .foregroundStyle(.tint)
                Text("Connect to Burrow").font(.largeTitle.bold())
                Text("Enter the address of the Mac running Burrow. Add a second address if you also reach it away from home, through Tailscale or a reverse proxy.")
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.secondary)
            }

            VStack(alignment: .leading, spacing: 18) {
                field("Home address", "192.168.1.10:3001", $home)
                field("Away address", "https://burrow.example.ts.net (optional)", $away,
                      footer: "Tried when the home address doesn't answer.")
            }

            if let error {
                Label(error, systemImage: "exclamationmark.triangle.fill").foregroundStyle(.orange)
            }

            Button {
                Task { await connect() }
            } label: {
                Text(checking ? "Connecting…" : "Connect").frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .disabled(home.trimmingCharacters(in: .whitespaces).isEmpty || checking)
        }
        .frame(maxWidth: 520)
        .padding(32)
    }

    private func field(_ label: String, _ prompt: String, _ text: Binding<String>, footer: String? = nil) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label).font(.subheadline.weight(.semibold))
            TextField(prompt, text: text)
                .keyboardType(.URL)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .padding(12)
                .background(.background.secondary, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                .onSubmit { Task { await connect() } }
            if let footer { Text(footer).font(.caption).foregroundStyle(.secondary) }
        }
    }

    private func connect() async {
        checking = true
        defer { checking = false }
        error = nil
        guard let url = Server.normalize(home) else { error = "That doesn't look like an address"; return }
        let awayURL = Server.normalize(away)
        let homeOK = await Server.isBurrow(url, session: server.session)
        let awayOK = if let awayURL { await Server.isBurrow(awayURL, session: server.session) } else { false }
        guard homeOK || awayOK else {
            error = "No Burrow server answered at \(awayURL == nil ? "that address" : "either address")"
            return
        }
        var list = [ServerAddress(label: "Home", url: url.absoluteString)]
        if let awayURL { list.append(ServerAddress(label: "Away", url: awayURL.absoluteString)) }
        server.addresses = list
        await server.connect()
    }
}
