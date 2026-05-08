import SwiftUI

struct CommandView: View {
    @EnvironmentObject private var model: AppModel
    @State private var captureText = ""
    @State private var captureType = "Task"
    @State private var missionTitle = ""
    @State private var missionDescription = ""
    @State private var complexity = 35.0
    @State private var taskType = "code"

    var body: some View {
        Form {
            Section("Quick Capture") {
                Picker("Type", selection: $captureType) {
                    Text("Task").tag("Task")
                    Text("Note").tag("Note")
                    Text("Idea").tag("Idea")
                    Text("Decision").tag("Decision")
                }
                .pickerStyle(.segmented)
                TextField("Capture", text: $captureText, axis: .vertical)
                    .lineLimit(3, reservesSpace: true)
                Button {
                    Task {
                        await model.quickCapture(captureText, type: captureType)
                        captureText = ""
                    }
                } label: {
                    Label("Send Capture", systemImage: "paperplane")
                }
                .disabled(captureText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }

            Section("Spawn Pipeline Mission") {
                TextField("Mission title", text: $missionTitle)
                TextField("Description", text: $missionDescription, axis: .vertical)
                    .lineLimit(4, reservesSpace: true)
                Picker("Task Type", selection: $taskType) {
                    Text("Code").tag("code")
                    Text("Research").tag("research")
                    Text("Config").tag("config")
                    Text("Non-code").tag("non-code")
                }
                Slider(value: $complexity, in: 0...100, step: 5)
                Text("Complexity: \(Int(complexity))")
                    .foregroundStyle(.secondary)
                Button {
                    Task {
                        await model.spawnMission(
                            title: missionTitle,
                            description: missionDescription,
                            complexity: Int(complexity),
                            taskType: taskType
                        )
                        missionTitle = ""
                        missionDescription = ""
                    }
                } label: {
                    Label("Launch Mission", systemImage: "bolt")
                }
                .disabled(missionTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
        .navigationTitle("Command")
    }
}
