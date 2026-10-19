import AppKit
import SwiftUI

struct DevicesView: View {
    @Environment(AppModel.self) private var model
    @State private var showingAddSheet = false
    @State private var newName = ""
    @State private var newIP = ""
    @State private var newMAC = ""
    @State private var newIcon = "server"

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Network Devices & Wake-on-LAN")
                            .font(.title2.weight(.bold))
                        Text("Manage network hosts, view hardware addresses, and send Wake-on-LAN magic packets.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    Button {
                        showingAddSheet = true
                    } label: {
                        Label("Add Device", systemImage: "plus")
                    }
                }

                if model.devices.isEmpty {
                    ContentUnavailableView("No Devices Configured",
                                           systemImage: "network.slash",
                                           description: Text("Add the machines on your network to monitor them and link services to them."))
                        .padding(.vertical, 40)
                } else {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 340, maximum: 540), spacing: 14)], spacing: 14) {
                        ForEach(model.devices) { device in
                            deviceCard(device)
                        }
                    }
                }
            }
            .padding(20)
        }
        .navigationTitle("Devices & WOL")
        .sheet(isPresented: $showingAddSheet) {
            addDeviceSheet
        }
    }

    private func deviceCard(_ device: DeviceInfo) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 12) {
                ZStack {
                    RoundedRectangle(cornerRadius: 10)
                        .fill(device.accentColor.opacity(0.12))
                        .frame(width: 44, height: 44)
                    Image(systemName: device.symbol)
                        .font(.title2)
                        .foregroundStyle(device.accentColor)
                }

                VStack(alignment: .leading, spacing: 2) {
                    Text(device.name)
                        .font(.headline)
                    Text("ID: \(device.id)")
                        .font(.caption2.monospaced())
                        .foregroundStyle(.tertiary)
                }

                Spacer()

                if !device.mac.isEmpty {
                    Button {
                        Task { await model.wakeDevice(device) }
                    } label: {
                        Label("Wake (WOL)", systemImage: "bolt.fill")
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.small)
                    .disabled(!model.server.isUp)
                }
            }

            Divider()

            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text("IP Address:")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .frame(width: 90, alignment: .leading)
                    Text(device.ip.isEmpty ? "Not set" : device.ip)
                        .font(.caption.monospaced())
                        .textSelection(.enabled)
                    Spacer()
                    if !device.ip.isEmpty {
                        Button {
                            NSPasteboard.general.clearContents()
                            NSPasteboard.general.setString(device.ip, forType: .string)
                        } label: {
                            Image(systemName: "doc.on.doc")
                        }
                        .buttonStyle(.borderless)
                        .help("Copy IP")
                    }
                }

                HStack {
                    Text("MAC Address:")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .frame(width: 90, alignment: .leading)
                    Text(device.mac.isEmpty ? "None (WOL disabled)" : device.mac)
                        .font(.caption.monospaced())
                        .foregroundStyle(device.mac.isEmpty ? .secondary : .primary)
                        .textSelection(.enabled)
                }
            }

            if !device.ip.isEmpty {
                HStack(spacing: 8) {
                    Button {
                        let script = "tell application \"Terminal\" to do script \"ssh \(device.ip)\""
                        if let appleScript = NSAppleScript(source: script) {
                            var error: NSDictionary?
                            appleScript.executeAndReturnError(&error)
                        }
                    } label: {
                        Label("SSH Session", systemImage: "terminal")
                    }
                    .controlSize(.small)

                    Spacer()

                    Button("Remove", role: .destructive) {
                        removeDevice(device)
                    }
                    .buttonStyle(.borderless)
                    .font(.caption)
                    .foregroundStyle(.red)
                }
                .padding(.top, 4)
            }
        }
        .padding(14)
        .background(Color(nsColor: .controlBackgroundColor), in: RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Color.primary.opacity(0.06), lineWidth: 1))
    }

    private var addDeviceSheet: some View {
        VStack(spacing: 16) {
            Text("Add Managed Device")
                .font(.headline)

            Form {
                TextField("Device Name", text: $newName, prompt: Text("e.g. Gaming PC, Proxmox Node"))
                TextField("IP Address", text: $newIP, prompt: Text("192.168.1.xxx"))
                TextField("MAC Address (for WOL)", text: $newMAC, prompt: Text("AA:BB:CC:DD:EE:FF"))
                Picker("Icon", selection: $newIcon) {
                    Label("Server", systemImage: "server.rack").tag("server")
                    Label("Desktop / PC", systemImage: "display").tag("desktop")
                    Label("Mac", systemImage: "macmini").tag("mac")
                }
            }
            .formStyle(.grouped)

            HStack {
                Button("Cancel") {
                    showingAddSheet = false
                }
                .keyboardShortcut(.cancelAction)

                Spacer()

                Button("Add Device") {
                    saveNewDevice()
                    showingAddSheet = false
                }
                .buttonStyle(.borderedProminent)
                .disabled(newName.trimmingCharacters(in: .whitespaces).isEmpty || newIP.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }
        .padding(20)
        .frame(width: 440, height: 320)
    }

    private func saveNewDevice() {
        let cleanName = newName.trimmingCharacters(in: .whitespaces)
        let id = cleanName.lowercased().filter { $0.isLetter || $0.isNumber }
        let newDevice = DeviceInfo(
            id: id.isEmpty ? UUID().uuidString.prefix(6).lowercased() : id,
            name: cleanName,
            ip: newIP.trimmingCharacters(in: .whitespaces),
            mac: newMAC.trimmingCharacters(in: .whitespaces),
            icon: newIcon,
            accent: "#818cf8"
        )
        var updated = model.devices
        updated.append(newDevice)
        saveDevices(updated)
        newName = ""
        newIP = ""
        newMAC = ""
    }

    private func removeDevice(_ device: DeviceInfo) {
        let updated = model.devices.filter { $0.id != device.id }
        saveDevices(updated)
    }

    private func saveDevices(_ list: [DeviceInfo]) {
        Task { await model.updateSettings { $0.devices = list } }
    }
}
