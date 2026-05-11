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
    @Published var todos: [TodoItem] = []
    @Published var chatMessages: [ChatMessage] = []
    @Published var chatSessionKey = "main"
    @Published var conversations: [Conversation] = []
    @Published var selectedConversationMessages: [MessageItem] = []
    @Published var approvals: [ApprovalRequest] = []
    @Published var approvalSources: [ApprovalSourceStatus] = []
    @Published var remoteStatus: RemoteStatus?
    @Published var vncStatus: VNCStatus?
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
        var errors: [String] = []

        do {
            identity = try await client.status()
            connectionMessage = "Connected"
        } catch {
            errors.append("Status: \(error.localizedDescription)")
        }

        do { health = try await client.systemHealth() } catch { errors.append("Health: \(error.localizedDescription)") }
        do { missions = try await client.missions() } catch { errors.append("Missions: \(error.localizedDescription)") }
        do { agents = try await client.agents() } catch { errors.append("Agents: \(error.localizedDescription)") }
        do { events = try await client.pipelineEvents() } catch { errors.append("Events: \(error.localizedDescription)") }
        do { todos = try await client.todos() } catch { errors.append("Todos: \(error.localizedDescription)") }
        do { chatMessages = try await client.chatHistory(sessionKey: chatSessionKey) } catch { errors.append("Chat: \(error.localizedDescription)") }
        do { conversations = try await client.conversations() } catch { errors.append("Messages: \(error.localizedDescription)") }
        do {
            let response = try await client.approvals()
            approvals = response.approvals
            approvalSources = response.sources ?? []
        } catch {
            errors.append("Approvals: \(error.localizedDescription)")
        }
        do { remoteStatus = try await client.remoteStatus() } catch { errors.append("Remote: \(error.localizedDescription)") }
        do { vncStatus = try await client.vncStatus() } catch { errors.append("VNC: \(error.localizedDescription)") }

        if identity != nil || health != nil {
            connectionMessage = "Connected"
        } else {
            connectionMessage = "Connection failed"
        }
        lastError = errors.isEmpty ? nil : errors.prefix(3).joined(separator: "\n")
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

    func addTodo(_ text: String) async {
        guard let client = makeClient() else {
            return
        }
        do {
            try await client.createTodo(text: text)
            todos = try await client.todos()
        } catch {
            lastError = error.localizedDescription
        }
    }

    func setTodo(_ todo: TodoItem, done: Bool) async {
        guard let client = makeClient() else {
            return
        }
        do {
            try await client.updateTodo(id: todo.id, done: done)
            todos = todos.map { item in
                item.id == todo.id ? todo.replacing(done: done) : item
            }
            todos = try await client.todos()
        } catch {
            lastError = error.localizedDescription
        }
    }

    func deleteTodo(_ todo: TodoItem) async {
        guard let client = makeClient() else {
            return
        }
        do {
            try await client.deleteTodo(id: todo.id)
            todos.removeAll { $0.id == todo.id }
        } catch {
            lastError = error.localizedDescription
        }
    }

    func sendChat(_ text: String) async {
        guard let client = makeClient() else {
            return
        }
        do {
            _ = try await client.sendChat(text: text, sessionKey: chatSessionKey, model: nil)
            chatMessages = try await client.chatHistory(sessionKey: chatSessionKey)
        } catch {
            lastError = error.localizedDescription
        }
    }

    func loadMessages(for conversation: Conversation) async {
        guard let client = makeClient() else {
            return
        }
        do {
            selectedConversationMessages = try await client.messages(conversation: conversation.guid)
        } catch {
            lastError = error.localizedDescription
        }
    }

    func sendMessage(_ text: String, to conversation: Conversation) async {
        guard let client = makeClient() else {
            return
        }
        do {
            try await client.sendMessage(chatGuid: conversation.guid, text: text)
            selectedConversationMessages = try await client.messages(conversation: conversation.guid)
            conversations = try await client.conversations()
        } catch {
            lastError = error.localizedDescription
        }
    }

    func approve(_ approval: ApprovalRequest) async {
        guard let client = makeClient() else {
            return
        }
        do {
            try await client.approve(approval.id)
            let response = try await client.approvals()
            approvals = response.approvals
            approvalSources = response.sources ?? []
        } catch {
            lastError = error.localizedDescription
        }
    }

    func reject(_ approval: ApprovalRequest, reason: String? = nil) async {
        guard let client = makeClient() else {
            return
        }
        do {
            try await client.reject(approval.id, reason: reason)
            let response = try await client.approvals()
            approvals = response.approvals
            approvalSources = response.sources ?? []
        } catch {
            lastError = error.localizedDescription
        }
    }

    func repairRemoteViewer() async {
        guard let client = makeClient() else {
            return
        }
        do {
            try await client.repairVNC()
            vncStatus = try await client.vncStatus()
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

private extension TodoItem {
    func replacing(done: Bool) -> TodoItem {
        TodoItem(id: id, text: text, done: done, dueDate: dueDate, createdAt: createdAt, updatedAt: updatedAt)
    }
}
