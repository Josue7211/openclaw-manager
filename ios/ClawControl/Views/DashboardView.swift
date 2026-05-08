import SwiftUI

struct DashboardView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        ScrollView {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 260), spacing: 16)], spacing: 16) {
                if let identity = model.identity {
                    MetricCard(
                        title: "Primary Agent",
                        value: "\(identity.emoji) \(identity.name)",
                        detail: "\(identity.model) · \(identity.host)",
                        status: identity.status
                    )
                } else {
                    MetricCard(title: "Primary Agent", value: "Unknown", detail: "No status loaded", status: nil)
                }

                MetricCard(
                    title: "Missions",
                    value: "\(model.missions.count)",
                    detail: activeMissionSummary,
                    status: "active"
                )

                MetricCard(
                    title: "Agents",
                    value: "\(model.agents.count)",
                    detail: activeAgentSummary,
                    status: "online"
                )

                if let health = model.health {
                    MetricCard(
                        title: "Backend",
                        value: health.version,
                        detail: "\(health.platform) · \(formatUptime(health.uptimeSeconds))",
                        status: "ok"
                    )
                } else {
                    MetricCard(title: "Backend", value: "No health", detail: model.backendURL.isEmpty ? "Add backend URL" : "Tap refresh", status: nil)
                }
            }
            .padding(.horizontal)
            .padding(.top)

            if let error = model.lastError {
                Text(error)
                    .font(.callout)
                    .foregroundStyle(.red)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding()
                    .background(.red.opacity(0.08), in: RoundedRectangle(cornerRadius: 8))
                    .padding(.horizontal)
                    .padding(.top, 8)
            }

            if let health = model.health {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Services")
                        .font(.headline)
                    ForEach(health.services.values.sorted { $0.name < $1.name }) { service in
                        ServiceRow(service: service)
                    }
                }
                .padding()
            }

            VStack(alignment: .leading, spacing: 12) {
                Text("Recent Events")
                    .font(.headline)
                if model.events.isEmpty {
                    Text("No pipeline events loaded.")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(model.events.prefix(8)) { event in
                        EventRow(event: event)
                    }
                }
            }
            .padding()
        }
        .navigationTitle("Dashboard")
        .background(Color.gray.opacity(0.08))
    }

    private var activeMissionSummary: String {
        let active = model.missions.filter { ($0.status ?? "").lowercased() == "active" }.count
        return "\(active) active"
    }

    private var activeAgentSummary: String {
        let active = model.agents.filter { ($0.status ?? "").lowercased().contains("active") }.count
        return "\(active) active"
    }

    private func formatUptime(_ seconds: Double) -> String {
        let hours = Int(seconds / 3600)
        if hours > 24 {
            return "\(hours / 24)d uptime"
        }
        return "\(hours)h uptime"
    }
}

struct MetricCard: View {
    let title: String
    let value: String
    let detail: String
    let status: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text(title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.secondary)
                Spacer()
                if let status {
                    StatusPill(text: status, status: status.lowercased().contains("ok") || status.lowercased().contains("active") || status.lowercased().contains("online") ? .good : .neutral)
                }
            }
            Text(value)
                .font(.title2.weight(.bold))
                .lineLimit(1)
                .minimumScaleFactor(0.75)
            Text(detail)
                .font(.callout)
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.background, in: RoundedRectangle(cornerRadius: 8))
    }
}

struct ServiceRow: View {
    let service: ServiceStatus

    var body: some View {
        HStack(spacing: 12) {
            StatusPill(text: service.status, status: service.status.lowercased().contains("ok") ? .good : .warn)
            VStack(alignment: .leading, spacing: 3) {
                Text(service.name.capitalized)
                    .font(.callout.weight(.semibold))
                if let peer = service.peerHostname {
                    Text(peer)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            Spacer()
            if let latency = service.latencyMilliseconds {
                Text("\(Int(latency)) ms")
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(.secondary)
            }
            if service.peerVerified == true {
                Image(systemName: "checkmark.shield")
                    .foregroundStyle(.green)
            }
        }
        .padding()
        .background(.background, in: RoundedRectangle(cornerRadius: 8))
    }
}

struct EventRow: View {
    let event: PipelineEvent

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack {
                Text(event.eventType.replacingOccurrences(of: "_", with: " ").capitalized)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                Spacer()
                if let createdAt = event.createdAt {
                    Text(createdAt)
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                }
            }
            Text(event.description)
                .font(.callout)
                .lineLimit(3)
        }
        .padding()
        .background(.background, in: RoundedRectangle(cornerRadius: 8))
    }
}
