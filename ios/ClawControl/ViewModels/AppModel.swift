import Foundation

@MainActor
final class AppModel: ObservableObject {
    @Published var backendURL: String
    @Published var apiKey: String
    @Published var isConfigured = false
    @Published var isLoading = false
    @Published var connectionMessage = "Not connected"
    @Published var identity: AgentIdentity?
    @Published var health: SystemHealth?
    @Published var missions: [Mission] = []
    @Published var agents: [Agent] = []
    @Published var events: [PipelineEvent] = []
    @Published var lastError: String?

    private let defaults = UserDefaults.standard
    private let backendURLKey = "backendURL"
    private let apiKeyAccount = "backend-api-key"

    init() {
        backendURL = defaults.string(forKey: backendURLKey) ?? ""
        apiKey = KeychainStore.read(apiKeyAccount)
        isConfigured = !backendURL.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    func start() async {
        guard isConfigured else {
            return
        }
        await refreshAll()
    }

    func saveSettings() async {
        backendURL = normalizeBackendURL(backendURL)
        defaults.set(backendURL, forKey: backendURLKey)
        KeychainStore.save(apiKey, account: apiKeyAccount)
        isConfigured = !backendURL.isEmpty
        await refreshAll()
    }

    func refreshAll() async {
        guard let client = makeClient() else {
            connectionMessage = "Add backend URL"
            return
        }
        isLoading = true
        lastError = nil
        do {
            async let status = client.status()
            async let systemHealth = client.systemHealth()
            async let loadedMissions = client.missions()
            async let loadedAgents = client.agents()
            async let loadedEvents = client.pipelineEvents()

            identity = try await status
            health = try await systemHealth
            missions = try await loadedMissions
            agents = try await loadedAgents
            events = try await loadedEvents
            connectionMessage = "Connected"
        } catch {
            lastError = error.localizedDescription
            connectionMessage = "Connection failed"
        }
        isLoading = false
    }

    func testConnection() async {
        guard let client = makeClient() else {
            connectionMessage = "Add backend URL"
            return
        }
        isLoading = true
        lastError = nil
        do {
            let response = try await client.health()
            connectionMessage = response.ok ? "Backend healthy" : "Backend answered"
        } catch {
            lastError = error.localizedDescription
            connectionMessage = "Connection failed"
        }
        isLoading = false
    }

    func quickCapture(_ content: String, type: String) async {
        guard let client = makeClient() else {
            return
        }
        do {
            try await client.quickCapture(QuickCaptureBody(content: content, type: type, source: "ipad"))
            await refreshAll()
        } catch {
            lastError = error.localizedDescription
        }
    }

    func spawnMission(title: String, description: String, complexity: Int, taskType: String) async {
        guard let client = makeClient() else {
            return
        }
        do {
            try await client.spawnMission(SpawnPipelineBody(
                title: title,
                complexity: complexity,
                taskType: taskType,
                description: description.isEmpty ? nil : description,
                workdir: nil
            ))
            await refreshAll()
        } catch {
            lastError = error.localizedDescription
        }
    }

    private func makeClient() -> APIClient? {
        let normalized = normalizeBackendURL(backendURL)
        guard let url = URL(string: normalized), !normalized.isEmpty else {
            return nil
        }
        return APIClient(baseURL: url, apiKey: apiKey)
    }

    private func normalizeBackendURL(_ value: String) -> String {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            return ""
        }
        let withoutTrailingSlash = trimmed.replacingOccurrences(of: "/+$", with: "", options: .regularExpression)
        if withoutTrailingSlash.hasPrefix("http://") || withoutTrailingSlash.hasPrefix("https://") {
            return withoutTrailingSlash
        }
        return "https://\(withoutTrailingSlash)"
    }
}
