import AppKit
import SwiftUI

/// Global settings (data/settings.json). Per-service hosts, ports and keys live in Services.
struct SettingsView: View {
    @Environment(AppModel.self) private var model

    // Local draft, saved as a whole
    @State private var draft: BurrowSettings?
    @State private var glancesPort = ""
    @State private var trackedText = ""
    @State private var isSaving = false

    var body: some View {
        NeedsServer {
            if let binding = Binding($draft) {
                form(binding)
            } else {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .navigationTitle("Settings")
        .onAppear { load() }
        .onChange(of: model.settings) { _, _ in if !isSaving { load() } }
    }

    private func form(_ s: Binding<BurrowSettings>) -> some View {
        Form {
            Section {
                LabeledContent("API keys, hosts & ports") {
                    Button("Open Services") { model.show(.services) }
                }
            } footer: {
                Text("Each service (Plex, Radarr, Seerr, Gotify, Steam, AI…) is configured on its own card in Services: where it runs, its port, and its credentials.")
            }

            Section {
                TextField("Language & format", text: s.region.locale, prompt: Text("System default (e.g. en-US, fr-CA)"))
                Picker("Holiday calendar", selection: s.region.holidays) {
                    Text("None").tag("")
                    ForEach(model.holidayCalendars, id: \.id) { Text($0.name).tag($0.id) }
                }
                TextField("Steam store country", text: s.region.steamCountry, prompt: Text("US"))
            } header: {
                Text("Region")
            } footer: {
                Text("Date and time format in the web UI, holidays shown in the agenda, and the store region for Steam prices.")
            }

            Section {
                Toggle("Emulation news (emulation.gametechwiki.com)", isOn: s.news.emulation)
                VStack(alignment: .leading, spacing: 4) {
                    Text("Tracked releases")
                    TextEditor(text: $trackedText)
                        .font(.body.monospaced())
                        .frame(minHeight: 80)
                        .scrollContentBackground(.hidden)
                        .background(Color(nsColor: .textBackgroundColor), in: RoundedRectangle(cornerRadius: 6))
                }
            } header: {
                Text("News")
            } footer: {
                Text("GitHub repos whose latest release shows in the News tab, one per line: owner/repo, or Name=owner/repo.")
            }

            Section {
                HStack {
                    TextField("Latitude", text: s.weather.lat, prompt: Text("e.g. 45.5017"))
                    TextField("Longitude", text: s.weather.lon, prompt: Text("e.g. -73.5673"))
                }
            } header: {
                Text("Weather")
            } footer: {
                Text("Uses Open-Meteo (free, no API key). Find your coordinates at latlong.net.")
            }

            Section {
                TextField("Glances port", text: $glancesPort, prompt: Text("61208"))
            } header: {
                Text("System Monitoring")
            } footer: {
                Text("CPU, memory, disk and Docker stats come from Glances running on each device.")
            }

            if let ai = model.aiBackend {
                Section("AI Assistant") {
                    LabeledContent("Chat backend") {
                        HStack(spacing: 6) {
                            StatusDot(color: ai.online ? .green : .red)
                            Text(ai.backend)
                        }
                    }
                }
            }

            Section {
                HStack {
                    Button("Discard Changes") { load() }
                        .keyboardShortcut(.cancelAction)
                    Spacer()
                    Button(isSaving ? "Saving…" : "Save Changes") { save() }
                        .buttonStyle(.borderedProminent)
                        .keyboardShortcut("s", modifiers: .command)
                        .disabled(isSaving)
                }
            }
        }
        .formStyle(.grouped)
    }

    private func load() {
        guard let s = model.settings else { return }
        draft = s
        glancesPort = String(s.glancesPort)
        trackedText = s.news.tracked.map(Self.line(for:)).joined(separator: "\n")
    }

    // "owner/repo", or "Name=owner/repo" when the name differs from the repo
    private static func line(for t: BurrowSettings.Tracked) -> String {
        let repoName = t.repo.split(separator: "/").last.map(String.init) ?? t.repo
        return t.name.isEmpty || t.name == repoName ? t.repo : "\(t.name)=\(t.repo)"
    }

    private static func tracked(from line: String) -> BurrowSettings.Tracked? {
        let l = line.trimmingCharacters(in: .whitespaces)
        if l.isEmpty { return nil }
        let parts = l.split(separator: "=", maxSplits: 1).map { $0.trimmingCharacters(in: .whitespaces) }
        if parts.count == 2 { return BurrowSettings.Tracked(name: parts[0], repo: parts[1]) }
        return BurrowSettings.Tracked(name: "", repo: l)
    }

    private func save() {
        guard var s = draft else { return }
        s.glancesPort = Int(glancesPort.filter(\.isNumber)) ?? 61208
        s.region.steamCountry = s.region.steamCountry.uppercased()
        s.news.tracked = trackedText.split(separator: "\n").compactMap { Self.tracked(from: String($0)) }
        isSaving = true
        Task {
            await model.saveSettings(s)
            isSaving = false
        }
    }
}
