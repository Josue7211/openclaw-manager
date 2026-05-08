import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var model: AppModel
    @State private var showAPIKey = false

    var body: some View {
        Form {
            Section("Backend") {
                TextField("https://clawcontrol.example.com", text: $model.backendURL)

                if showAPIKey {
                    TextField("X-API-Key", text: $model.apiKey)
                } else {
                    SecureField("X-API-Key", text: $model.apiKey)
                }

                Toggle("Show API key", isOn: $showAPIKey)

                HStack {
                    Button {
                        Task { await model.saveSettings() }
                    } label: {
                        Label("Save", systemImage: "checkmark")
                    }

                    Button {
                        Task { await model.testConnection() }
                    } label: {
                        Label("Test", systemImage: "network")
                    }
                }
            }

            Section("Status") {
                LabeledContent("Connection", value: model.connectionMessage)
                if let identity = model.identity {
                    LabeledContent("Agent", value: "\(identity.emoji) \(identity.name)")
                    LabeledContent("Host", value: identity.host)
                }
                if let health = model.health {
                    LabeledContent("Version", value: health.version)
                    LabeledContent("Hostname", value: health.hostname)
                }
                if let error = model.lastError {
                    Text(error)
                        .foregroundStyle(.red)
                }
            }

            Section("Signing") {
                Text("Open the project in Xcode, choose your paid Apple Developer team, then run on iPad or archive for TestFlight.")
                    .foregroundStyle(.secondary)
            }
        }
        .navigationTitle("Settings")
    }
}
