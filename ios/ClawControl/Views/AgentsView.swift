import SwiftUI

struct AgentsView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        Group {
            if model.agents.isEmpty {
                EmptyStateView(title: "No Agents", message: "No agent registry data loaded from the backend.", systemImage: "person.2.slash")
            } else {
                List(model.agents) { agent in
                    AgentRow(agent: agent)
                }
                .listStyle(.plain)
            }
        }
        .navigationTitle("Agents")
    }
}

struct AgentRow: View {
    let agent: Agent

    var body: some View {
        HStack(spacing: 14) {
            Text(agent.emoji ?? "•")
                .font(.largeTitle)
                .frame(width: 44, height: 44)
            VStack(alignment: .leading, spacing: 5) {
                HStack {
                    Text(agent.displayName)
                        .font(.headline)
                    if let status = agent.status {
                        StatusPill(text: status, status: status.lowercased().contains("active") ? .good : .neutral)
                    }
                }
                if let role = agent.role {
                    Text(role)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                if let task = agent.currentTask, !task.isEmpty {
                    Text(task)
                        .font(.callout)
                        .lineLimit(2)
                }
            }
            Spacer()
            if let model = agent.model {
                Text(model)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 6)
    }
}
