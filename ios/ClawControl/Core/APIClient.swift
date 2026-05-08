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
        var url = baseURL
        for component in path.split(separator: "/") {
            url.appendPathComponent(String(component))
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
