import SwiftUI

struct MissionsView: View {
    @EnvironmentObject private var model: AppModel
    @State private var showingNewMission = false

    var body: some View {
        Group {
            if model.missions.isEmpty {
                EmptyStateView(title: "No Missions", message: "Connect to a backend or launch a mission from Command.", systemImage: "checklist")
            } else {
                List(model.missions) { mission in
                    MissionRow(mission: mission)
                }
                .listStyle(.plain)
            }
        }
        .navigationTitle("Missions")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    showingNewMission = true
                } label: {
                    Label("New Mission", systemImage: "plus")
                }
            }
        }
        .sheet(isPresented: $showingNewMission) {
            NewMissionSheet()
                .environmentObject(model)
        }
    }
}

struct MissionRow: View {
    let mission: Mission

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                Text(mission.title)
                    .font(.headline)
                Spacer()
                StatusPill(text: mission.status ?? "unknown", status: missionStatus)
            }
            HStack {
                if let assignee = mission.assignee, !assignee.isEmpty {
                    Label(assignee, systemImage: "person")
                }
                if let progress = mission.progress {
                    Label("\(Int(progress))%", systemImage: "chart.line.uptrend.xyaxis")
                }
                if let updated = mission.updatedAt {
                    Label(updated, systemImage: "clock")
                }
            }
            .font(.caption)
            .foregroundStyle(.secondary)
        }
        .padding(.vertical, 4)
    }

    private var missionStatus: PillStatus {
        switch (mission.status ?? "").lowercased() {
        case "active", "done":
            return .good
        case "failed":
            return .warn
        default:
            return .neutral
        }
    }
}

struct NewMissionSheet: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var description = ""
    @State private var complexity = 50.0
    @State private var taskType = "code"

    var body: some View {
        NavigationStack {
            Form {
                Section("Mission") {
                    TextField("Title", text: $title)
                    TextField("Description", text: $description, axis: .vertical)
                        .lineLimit(4, reservesSpace: true)
                }
                Section("Routing") {
                    Picker("Task Type", selection: $taskType) {
                        Text("Code").tag("code")
                        Text("Research").tag("research")
                        Text("Config").tag("config")
                        Text("Non-code").tag("non-code")
                    }
                    Slider(value: $complexity, in: 0...100, step: 5) {
                        Text("Complexity")
                    } minimumValueLabel: {
                        Text("0")
                    } maximumValueLabel: {
                        Text("100")
                    }
                    Text("Complexity: \(Int(complexity))")
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("New Mission")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Launch") {
                        Task {
                            await model.spawnMission(title: title, description: description, complexity: Int(complexity), taskType: taskType)
                            dismiss()
                        }
                    }
                    .disabled(title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
    }
}
