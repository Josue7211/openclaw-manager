import Foundation

struct APIError: LocalizedError {
    let message: String

    var errorDescription: String? {
        message
    }
}

struct APIClient {
    var baseURL: URL
    var apiKey: String
    var session: URLSession = .shared

    func health() async throws -> HealthResponse {
        try await request("GET", path: "/api/health")
    }

    func status() async throws -> AgentIdentity {
        try await request("GET", path: "/api/status")
    }

    func systemHealth() async throws -> SystemHealth {
        try await request("GET", path: "/api/status/health")
    }

    func missions() async throws -> [Mission] {
        let response: MissionsResponse = try await request("GET", path: "/api/missions")
        return response.missions
    }

    func agents() async throws -> [Agent] {
        let response: AgentsResponse = try await request("GET", path: "/api/agents")
        return response.agents
    }

    func pipelineEvents() async throws -> [PipelineEvent] {
        let response: PipelineEventsResponse = try await request("GET", path: "/api/pipeline-events")
        return response.events
    }

    func todos() async throws -> [TodoItem] {
        let response: TodosResponse = try await request("GET", path: "/api/todos")
        return response.todos
    }

    func createTodo(text: String, dueDate: String? = nil) async throws {
        let _: EmptyResponse = try await request("POST", path: "/api/todos", body: TodoCreateBody(text: text, dueDate: dueDate))
    }

    func updateTodo(id: String, done: Bool) async throws {
        let _: EmptyResponse = try await request("PATCH", path: "/api/todos", body: TodoPatchBody(id: id, done: done))
    }

    func deleteTodo(id: String) async throws {
        let _: EmptyResponse = try await request("DELETE", path: "/api/todos", body: TodoDeleteBody(id: id))
    }

    func chatHistory(sessionKey: String) async throws -> [ChatMessage] {
        let encoded = sessionKey.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? sessionKey
        let response: ChatHistoryResponse = try await request("GET", path: "/api/chat/history?sessionKey=\(encoded)")
        return response.messages
    }

    func sendChat(text: String, sessionKey: String, model: String?) async throws -> ChatSendResponse {
        try await request("POST", path: "/api/chat", body: ChatSendBody(text: text, images: [], model: model, sessionKey: sessionKey))
    }

    func conversations(limit: Int = 25) async throws -> [Conversation] {
        let response: ConversationsResponse = try await request("GET", path: "/api/messages?limit=\(limit)")
        return response.conversations
    }

    func messages(conversation: String, limit: Int = 50) async throws -> [MessageItem] {
        let encoded = conversation.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? conversation
        let response: MessagesResponse = try await request("GET", path: "/api/messages?conversation=\(encoded)&limit=\(limit)")
        return response.messages
    }

    func sendMessage(chatGuid: String, text: String) async throws {
        let _: EmptyResponse = try await request("POST", path: "/api/messages", body: SendMessageBody(chatGuid: chatGuid, text: text))
    }

    func approvals() async throws -> ApprovalsResponse {
        try await request("GET", path: "/api/approvals")
    }

    func approve(_ id: String) async throws {
        let _: EmptyResponse = try await request("POST", path: "/api/approvals/\(id)/approve")
    }

    func reject(_ id: String, reason: String?) async throws {
        let _: EmptyResponse = try await request("POST", path: "/api/approvals/\(id)/reject", body: ApprovalRejectBody(reason: reason))
    }

    func remoteStatus() async throws -> RemoteStatus {
        try await request("GET", path: "/api/remote/status")
    }

    func vncStatus() async throws -> VNCStatus {
        try await request("GET", path: "/api/vnc/status")
    }

    func repairVNC() async throws {
        let _: EmptyResponse = try await request("POST", path: "/api/vnc/repair", body: VNCRepairBody(target: "all"))
    }

    func quickCapture(_ body: QuickCaptureBody) async throws {
        let _: EmptyResponse = try await request("POST", path: "/api/quick-capture", body: body)
    }

    func spawnMission(_ body: SpawnPipelineBody) async throws {
        let _: EmptyResponse = try await request("POST", path: "/api/pipeline/spawn", body: body)
    }

    private func request<T: Decodable>(
        _ method: String,
        path: String
    ) async throws -> T {
        try await request(method, path: path, body: Optional<EmptyBody>.none)
    }

    private func request<T: Decodable, Body: Encodable>(
        _ method: String,
        path: String,
        body: Body?
    ) async throws -> T {
        let parts = path.split(separator: "?", maxSplits: 1, omittingEmptySubsequences: false)
        var url = baseURL
        for component in parts[0].split(separator: "/") {
            url.appendPathComponent(String(component))
        }
        if parts.count == 2 {
            var components = URLComponents(url: url, resolvingAgainstBaseURL: false)
            components?.percentEncodedQuery = String(parts[1])
            url = components?.url ?? url
        }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = 30
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if !apiKey.isEmpty {
            request.setValue(apiKey, forHTTPHeaderField: "X-API-Key")
        }
        if let body {
            request.httpBody = try JSONEncoder.claw.encode(body)
        }

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw APIError(message: "No HTTP response from backend")
        }
        guard 200..<300 ~= http.statusCode else {
            let bodyText = String(data: data, encoding: .utf8) ?? "Request failed"
            throw APIError(message: "API \(http.statusCode): \(bodyText)")
        }
        if T.self == EmptyResponse.self {
            return EmptyResponse() as! T
        }
        do {
            return try JSONDecoder.claw.decode(T.self, from: data)
        } catch {
            throw APIError(message: "Could not decode \(path): \(error.localizedDescription)")
        }
    }
}

struct EmptyResponse: Decodable {}

private struct EmptyBody: Encodable {}

extension JSONDecoder {
    static var claw: JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }
}

extension JSONEncoder {
    static var claw: JSONEncoder {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        return encoder
    }
}
