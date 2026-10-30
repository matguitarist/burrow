import SwiftUI

struct LoginSheet: View {
    @Environment(Server.self) private var server
    @Environment(\.dismiss) private var dismiss
    @State private var password = ""
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    SecureField("Password", text: $password)
                        .textContentType(.password)
                        .onSubmit { Task { await signIn() } }
                } footer: {
                    Text("The Burrow password set in Settings → Sign-in on the server. You stay signed in on this iPad.")
                }
                if let error {
                    Label(error, systemImage: "exclamationmark.triangle.fill").foregroundStyle(.orange)
                }
            }
            .navigationTitle("Sign in to Burrow")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(busy ? "Signing in…" : "Sign In") { Task { await signIn() } }
                        .disabled(password.isEmpty || busy)
                }
            }
        }
    }

    private func signIn() async {
        busy = true
        defer { busy = false }
        do {
            try await server.login(password: password)
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
