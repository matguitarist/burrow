import AppKit
import SwiftUI
import UniformTypeIdentifiers

/// Services configured on the dashboard (data/services.json): live status, links,
/// and an editor for host/port/credentials — same data as the web Settings panel.
struct ServicesView: View {
    @Environment(AppModel.self) private var model
    @State private var filterText = ""
    @State private var editing: ServiceInstance?
    @State private var isNew = false
    @State private var showingPicker = false

    private var grouped: [(category: String, services: [ServiceInstance])] {
        let shown = model.services.filter { svc in
            filterText.isEmpty ||
            svc.name.localizedCaseInsensitiveContains(filterText) ||
            (model.template(for: svc)?.name.localizedCaseInsensitiveContains(filterText) ?? false)
        }
        let categories = model.catalog.categories.isEmpty ? ["Other"] : model.catalog.categories
        return categories.compactMap { cat in
            let inCat = shown.filter { (model.template(for: $0)?.category ?? "Other") == cat }
            return inCat.isEmpty ? nil : (category: cat, services: inCat)
        }
    }

    var body: some View {
        NeedsServer {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    header

                    if model.services.isEmpty {
                        ContentUnavailableView {
                            Label("No Services Yet", systemImage: "square.grid.2x2")
                        } description: {
                            Text("Add services from the template catalog — Plex, Radarr, Home Assistant, Pi-hole and more.")
                        } actions: {
                            Button("Add Service") { showingPicker = true }
                                .buttonStyle(.borderedProminent)
                        }
                        .padding(.vertical, 40)
                    }

                    ForEach(grouped, id: \.category) { group in
                        VStack(alignment: .leading, spacing: 10) {
                            Text(group.category)
                                .font(.title3.weight(.bold))
                            LazyVGrid(columns: [GridItem(.adaptive(minimum: 300, maximum: 480), spacing: 12)], spacing: 12) {
                                ForEach(group.services) { serviceCard($0) }
                            }
                        }
                    }
                }
                .padding(20)
            }
            .searchable(text: $filterText, prompt: "Filter services")
            // HealthMonitor keeps this fresh every 30s; refresh once so the view isn't stale on open
            .task { await model.reloadServiceHealth() }
        }
        .navigationTitle("Services")
        .sheet(isPresented: $showingPicker) {
            TemplatePickerSheet { template in
                showingPicker = false
                let taken = Set(model.services.map(\.id))
                let id = taken.contains(template.id) ? "\(template.id)_\(UUID().uuidString.prefix(5).lowercased())" : template.id
                isNew = true
                editing = ServiceInstance(id: id, template: template, device: model.devices.first?.id ?? "")
            }
        }
        .sheet(item: $editing) { svc in
            ServiceEditorSheet(service: svc, isNew: isNew) { updated in
                var list = model.services
                if let i = list.firstIndex(where: { $0.id == updated.id }) { list[i] = updated } else { list.append(updated) }
                Task { await model.saveServices(list) }
            } onDelete: {
                Task { await model.saveServices(model.services.filter { $0.id != svc.id }) }
            }
        }
    }

    private var header: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text("Home Services")
                    .font(.title2.weight(.bold))
                Text("Each service has its own address and credentials. IPs of linked devices come from Devices & WOL.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Menu {
                Button("Export Template…", action: exportTemplate)
                    .disabled(model.services.isEmpty)
                Button("Import Template…", action: importTemplate)
                Divider()
                Button("Refresh") { Task { await model.reloadServices(); await model.reloadServiceHealth() } }
            } label: {
                Image(systemName: "ellipsis.circle")
            }
            .menuStyle(.borderlessButton)
            .fixedSize()
            .help("Share or refresh")

            Button {
                showingPicker = true
            } label: {
                Label("Add Service", systemImage: "plus")
            }
        }
    }

    private func serviceCard(_ svc: ServiceInstance) -> some View {
        let template = model.template(for: svc)
        let tint = Color(hex: svc.color) ?? .accentColor
        let health = model.serviceHealth[svc.id]
        let link = model.serviceLinks[svc.id]

        return VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 12) {
                ZStack {
                    RoundedRectangle(cornerRadius: 8)
                        .fill(tint.opacity(0.14))
                        .frame(width: 38, height: 38)
                    Image(systemName: template?.symbol ?? "globe")
                        .font(.title3)
                        .foregroundStyle(tint)
                }
                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 6) {
                        Text(svc.name).font(.headline)
                        if !svc.enabled {
                            Text("Disabled").font(.caption2).foregroundStyle(.secondary)
                                .padding(.horizontal, 5).background(.quaternary, in: Capsule())
                        } else if template?.isCloud != true, let health {
                            StatusDot(color: health.online ? .green : .red)
                                .help(health.online ? "Online" : "Offline")
                        }
                        if missingCredentials(svc, template) {
                            Image(systemName: "key.slash").font(.caption).foregroundStyle(.orange)
                                .help("Credentials missing — integration won't work yet")
                        }
                    }
                    Text(template.map { $0.isIntegration ? "\($0.name) · integration" : $0.name } ?? svc.template)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
            }

            Divider()

            HStack {
                Text(locationLabel(svc, template))
                    .font(.caption.monospaced())
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                Spacer()
                Button("Edit") { isNew = false; editing = svc }
                    .controlSize(.small)
                if let link {
                    Button("Open") { NSWorkspace.shared.open(link) }
                        .controlSize(.small)
                }
            }
        }
        .padding(14)
        .background(Color(nsColor: .controlBackgroundColor), in: RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Color.primary.opacity(0.06), lineWidth: 1))
        .opacity(svc.enabled ? 1 : 0.6)
        .contextMenu {
            Button("Edit…") { isNew = false; editing = svc }
            Button(svc.enabled ? "Disable" : "Enable") {
                var list = model.services
                if let i = list.firstIndex(where: { $0.id == svc.id }) { list[i].enabled.toggle() }
                Task { await model.saveServices(list) }
            }
            if let link { Button("Open in Browser") { NSWorkspace.shared.open(link) } }
        }
    }

    private func locationLabel(_ svc: ServiceInstance, _ t: ServiceTemplate?) -> String {
        if t?.isCloud == true { return "Cloud account" }
        let host = model.devices.first(where: { $0.id == svc.device }).map { "\($0.name) (\($0.ip))" } ?? svc.host
        if host.isEmpty { return "Not configured" }
        return svc.port.map { "\(host):\($0)" } ?? host
    }

    private func missingCredentials(_ svc: ServiceInstance, _ t: ServiceTemplate?) -> Bool {
        guard let t, t.isIntegration, t.id != "openai" else { return false }
        return (t.fields ?? []).contains { $0.key != "user" && $0.key != "pass" && svc[field: $0.key].isEmpty }
    }

    // MARK: - Share templates (no IPs, keys or passwords)

    private struct TemplateFile: Codable {
        var format = "burrow/services"
        var version = 1
        var services: [ServiceInstance]
    }

    private static func stripPrivate(_ s: ServiceInstance) -> ServiceInstance {
        var out = s
        out.device = ""; out.host = ""; out.apiUrl = ""
        out.apiKey = ""; out.user = ""; out.pass = ""
        out.extras = [:]
        return out
    }

    private func exportTemplate() {
        let panel = NSSavePanel()
        panel.nameFieldStringValue = "burrow-services-template.json"
        panel.allowedContentTypes = [.json]
        guard panel.runModal() == .OK, let url = panel.url else { return }
        do {
            let encoder = JSONEncoder()
            encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
            // Drop the empty private keys entirely rather than shipping blanks
            let data = try encoder.encode(TemplateFile(services: model.services.map(Self.stripPrivate)))
            var json = try JSONSerialization.jsonObject(with: data) as? [String: Any] ?? [:]
            let privateKeys = ["device", "host", "apiUrl", "apiKey", "user", "pass"]
            json["services"] = (json["services"] as? [[String: Any]])?.map { $0.filter { !privateKeys.contains($0.key) } }
            try JSONSerialization.data(withJSONObject: json, options: [.prettyPrinted, .sortedKeys]).write(to: url)
            model.successMessage = "Exported \(model.services.count) services (without IPs or credentials)."
        } catch {
            model.errorMessage = "Couldn't export: \(error.localizedDescription)"
        }
    }

    private func importTemplate() {
        let panel = NSOpenPanel()
        panel.allowedContentTypes = [.json]
        guard panel.runModal() == .OK, let url = panel.url else { return }
        do {
            let data = try Data(contentsOf: url)
            let incoming: [ServiceInstance]
            if let file = try? JSONDecoder().decode(TemplateFile.self, from: data) {
                incoming = file.services
            } else {
                incoming = try JSONDecoder().decode([ServiceInstance].self, from: data)
            }
            var list = model.services
            var taken = Set(list.map(\.id))
            for raw in incoming {
                var s = Self.stripPrivate(raw)
                if model.catalog.templates.first(where: { $0.id == s.template }) == nil { s.template = "custom" }
                if s.id.isEmpty || taken.contains(s.id) { s.id = "\(s.template)_\(UUID().uuidString.prefix(5).lowercased())" }
                s.device = model.devices.first?.id ?? ""
                taken.insert(s.id)
                list.append(s)
            }
            Task {
                if await model.saveServices(list) {
                    model.successMessage = "Added \(incoming.count) services — set their host and keys."
                }
            }
        } catch {
            model.errorMessage = "Not a valid services template: \(error.localizedDescription)"
        }
    }
}

// MARK: - Template picker

private struct TemplatePickerSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var query = ""
    @State private var category = "All"
    let onPick: (ServiceTemplate) -> Void

    private var shown: [ServiceTemplate] {
        model.catalog.templates.filter {
            (category == "All" || $0.category == category) &&
            (query.isEmpty || $0.name.localizedCaseInsensitiveContains(query) || ($0.description ?? "").localizedCaseInsensitiveContains(query))
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Add a Service").font(.title2.weight(.bold))
            HStack {
                TextField("Search templates", text: $query)
                    .textFieldStyle(.roundedBorder)
                Picker("Category", selection: $category) {
                    Text("All").tag("All")
                    ForEach(model.catalog.categories.filter { c in model.catalog.templates.contains { $0.category == c } }, id: \.self) {
                        Text($0).tag($0)
                    }
                }
                .labelsHidden()
                .frame(width: 160)
            }
            ScrollView {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 170), spacing: 8)], spacing: 8) {
                    ForEach(shown) { t in
                        Button { onPick(t) } label: {
                            HStack(spacing: 8) {
                                Circle().fill(Color(hex: t.color) ?? .accentColor).frame(width: 8, height: 8)
                                Text(t.name).lineLimit(1)
                                Spacer(minLength: 0)
                                if t.isIntegration {
                                    Image(systemName: "bolt.fill").font(.caption2).foregroundStyle(.yellow)
                                }
                            }
                            .padding(.horizontal, 10).padding(.vertical, 8)
                            .frame(maxWidth: .infinity)
                            .background(Color(nsColor: .controlBackgroundColor), in: RoundedRectangle(cornerRadius: 8))
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .help(t.description ?? t.name)
                    }
                }
            }
            HStack {
                Label("Integration: powers dashboard widgets. Others get status + link.", systemImage: "bolt.fill")
                    .font(.caption).foregroundStyle(.secondary)
                Spacer()
                Button("Cancel") { dismiss() }.keyboardShortcut(.cancelAction)
            }
        }
        .padding(20)
        .frame(width: 600, height: 480)
    }
}

// MARK: - Editor

private struct ServiceEditorSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State var service: ServiceInstance
    let isNew: Bool
    let onSave: (ServiceInstance) -> Void
    let onDelete: () -> Void

    @State private var testResult: ServiceTestResult?
    @State private var testing = false
    @State private var confirmDelete = false

    private var template: ServiceTemplate? { model.template(for: service) }

    private var portText: Binding<String> {
        Binding(
            get: { service.port.map(String.init) ?? "" },
            set: { service.port = Int($0.filter(\.isNumber)) }
        )
    }

    private var colorBinding: Binding<Color> {
        Binding(
            get: { Color(hex: service.color) ?? .accentColor },
            set: { service.color = $0.hexString ?? service.color }
        )
    }

    var body: some View {
        VStack(spacing: 0) {
            Form {
                Section {
                    TextField("Name", text: $service.name)
                    ColorPicker("Color", selection: colorBinding, supportsOpacity: false)
                    Toggle("Enabled", isOn: $service.enabled)
                } header: {
                    Text(template.map { "\($0.name)\($0.isIntegration ? " · integration" : "")" } ?? service.template)
                } footer: {
                    if let d = template?.description { Text(d) }
                }

                if template?.isCloud != true {
                    Section("Location") {
                        Picker("Runs on", selection: $service.device) {
                            ForEach(model.devices) { d in Text("\(d.name) — \(d.ip)").tag(d.id) }
                            Text("Custom host…").tag("")
                        }
                        if service.device.isEmpty {
                            TextField("Host / IP", text: $service.host, prompt: Text("192.168.x.x or nas.local"))
                        }
                        TextField("Port", text: portText, prompt: Text(template?.port.map(String.init) ?? ""))
                        Toggle("Use HTTPS", isOn: $service.https)
                    }
                }

                if let fields = template?.fields, !fields.isEmpty {
                    Section("Credentials") {
                        ForEach(fields, id: \.key) { f in
                            VStack(alignment: .leading, spacing: 3) {
                                if f.secret == true {
                                    SecureField(f.label, text: $service[field: f.key])
                                } else {
                                    TextField(f.label, text: $service[field: f.key])
                                }
                                if let hint = f.hint {
                                    Text(hint).font(.caption).foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                }

                if template?.isCloud != true {
                    Section {
                        DisclosureGroup("Advanced") {
                            TextField("Web path", text: $service.webPath, prompt: Text(template?.webPath ?? "/"))
                            TextField("Server URL override", text: $service.apiUrl, prompt: Text("http://127.0.0.1:port"))
                            Text("Only if the dashboard server must reach the service differently than your browser does, e.g. one that only listens on localhost.")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }

                Section {
                    HStack {
                        Button {
                            Task { await runTest() }
                        } label: {
                            Label(testing ? "Testing…" : "Test Connection", systemImage: "bolt")
                        }
                        .disabled(testing)
                        if let r = testResult {
                            Label(r.message, systemImage: r.ok ? "checkmark.circle.fill" : "exclamationmark.triangle.fill")
                                .foregroundStyle(r.ok ? .green : .orange)
                                .font(.callout)
                                .lineLimit(2)
                        }
                    }
                }
            }
            .formStyle(.grouped)
            .onChange(of: service) { _, _ in testResult = nil }

            HStack {
                if !isNew {
                    Button("Remove", role: .destructive) { confirmDelete = true }
                }
                Spacer()
                Button("Cancel") { dismiss() }.keyboardShortcut(.cancelAction)
                Button(isNew ? "Add" : "Save") {
                    onSave(service)
                    dismiss()
                }
                .buttonStyle(.borderedProminent)
                .keyboardShortcut(.defaultAction)
            }
            .padding(16)
        }
        .frame(width: 520, height: 600)
        .confirmationDialog("Remove \(service.name)?", isPresented: $confirmDelete) {
            Button("Remove", role: .destructive) {
                onDelete()
                dismiss()
            }
        }
    }

    private func runTest() async {
        testing = true
        defer { testing = false }
        do {
            testResult = try await API.shared.testService(service)
        } catch {
            testResult = ServiceTestResult(ok: false, message: error.localizedDescription)
        }
    }
}

private extension Color {
    var hexString: String? {
        guard let c = NSColor(self).usingColorSpace(.sRGB) else { return nil }
        return String(format: "#%02x%02x%02x", Int(round(c.redComponent * 255)), Int(round(c.greenComponent * 255)), Int(round(c.blueComponent * 255)))
    }
}
