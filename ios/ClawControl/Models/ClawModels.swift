import Foundation

struct HealthResponse: Decodable {
    let ok: Bool
}

struct AgentIdentity: Decodable {
    let name: String
    let emoji: String
    let model: String
    let status: String
    let lastActive: String
    let host: String
    let ip: String
}

struct SystemHealth: Decodable {
    let version: String
    let uptimeSeconds: Double
    let platform: String
    let hostname: String
    let sqliteCacheEntries: Int
    let sqliteDbSizeBytes: Int
    let services: [String: ServiceStatus]

    enum CodingKeys: String, CodingKey {
        case version
        case uptimeSeconds = "uptime_seconds"
        case platform
        case hostname
        case sqliteCacheEntries = "sqlite_cache_entries"
        case sqliteDbSizeBytes = "sqlite_db_size_bytes"
        case services
    }
}

struct ServiceStatus: Decodable, Identifiable {
    var id: String { name }

    let name: String
    let status: String
    let latencyMilliseconds: Double?
    let peerHostname: String?
    let peerVerified: Bool?

    enum CodingKeys: String, CodingKey {
        case status
        case latencyMilliseconds = "latency_ms"
        case peerHostname = "peer_hostname"
        case peerVerified = "peer_verified"
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        status = try container.decodeFlexibleStringIfPresent(forKey: .status) ?? "unknown"
        latencyMilliseconds = try container.decodeFlexibleDoubleIfPresent(forKey: .latencyMilliseconds)
        peerHostname = try container.decodeFlexibleStringIfPresent(forKey: .peerHostname)
        peerVerified = try container.decodeIfPresent(Bool.self, forKey: .peerVerified)
        name = decoder.codingPath.last?.stringValue ?? "service"
    }
}

struct Mission: Decodable, Identifiable {
    let id: String
    let title: String
    let status: String?
    let assignee: String?
    let progress: Double?
    let logPath: String?
    let createdAt: String?
    let updatedAt: String?

    enum CodingKeys: String, CodingKey {
        case id
        case title
        case status
        case assignee
        case progress
        case logPath = "log_path"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decodeFlexibleString(forKey: .id)
        title = try container.decodeFlexibleStringIfPresent(forKey: .title) ?? "Untitled mission"
        status = try container.decodeFlexibleStringIfPresent(forKey: .status)
        assignee = try container.decodeFlexibleStringIfPresent(forKey: .assignee)
        progress = try container.decodeFlexibleDoubleIfPresent(forKey: .progress)
        logPath = try container.decodeFlexibleStringIfPresent(forKey: .logPath)
        createdAt = try container.decodeFlexibleStringIfPresent(forKey: .createdAt)
        updatedAt = try container.decodeFlexibleStringIfPresent(forKey: .updatedAt)
    }
}

struct Agent: Decodable, Identifiable {
    let id: String
    let displayName: String
    let emoji: String?
    let role: String?
    let status: String?
    let currentTask: String?
    let color: String?
    let model: String?
    let sortOrder: Int?

    enum CodingKeys: String, CodingKey {
        case id
        case displayName = "display_name"
        case emoji
        case role
        case status
        case currentTask = "current_task"
        case color
        case model
        case sortOrder = "sort_order"
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decodeFlexibleString(forKey: .id)
        displayName = try container.decodeFlexibleStringIfPresent(forKey: .displayName) ?? "Agent"
        emoji = try container.decodeFlexibleStringIfPresent(forKey: .emoji)
        role = try container.decodeFlexibleStringIfPresent(forKey: .role)
        status = try container.decodeFlexibleStringIfPresent(forKey: .status)
        currentTask = try container.decodeFlexibleStringIfPresent(forKey: .currentTask)
        color = try container.decodeFlexibleStringIfPresent(forKey: .color)
        model = try container.decodeFlexibleStringIfPresent(forKey: .model)
        sortOrder = try container.decodeFlexibleIntIfPresent(forKey: .sortOrder)
    }
}

struct PipelineEvent: Decodable, Identifiable {
    let id: String
    let eventType: String
    let description: String
    let agentID: String?
    let missionID: String?
    let createdAt: String?

    enum CodingKeys: String, CodingKey {
        case id
        case eventType = "event_type"
        case description
        case agentID = "agent_id"
        case missionID = "mission_id"
        case createdAt = "created_at"
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decodeFlexibleStringIfPresent(forKey: .id) ?? UUID().uuidString
        eventType = try container.decodeFlexibleStringIfPresent(forKey: .eventType) ?? "event"
        description = try container.decodeFlexibleStringIfPresent(forKey: .description) ?? ""
        agentID = try container.decodeFlexibleStringIfPresent(forKey: .agentID)
        missionID = try container.decodeFlexibleStringIfPresent(forKey: .missionID)
        createdAt = try container.decodeFlexibleStringIfPresent(forKey: .createdAt)
    }
}

struct MissionsResponse: Decodable {
    let missions: [Mission]
}

struct AgentsResponse: Decodable {
    let agents: [Agent]
}

struct PipelineEventsResponse: Decodable {
    let events: [PipelineEvent]
}

struct QuickCaptureBody: Encodable {
    let content: String
    let type: String
    let source: String
}

struct SpawnPipelineBody: Encodable {
    let title: String
    let complexity: Int
    let taskType: String
    let description: String?
    let workdir: String?

    enum CodingKeys: String, CodingKey {
        case title
        case complexity
        case taskType = "task_type"
        case description
        case workdir
    }
}

private extension KeyedDecodingContainer {
    func decodeFlexibleString(forKey key: Key) throws -> String {
        if let value = try decodeFlexibleStringIfPresent(forKey: key) {
            return value
        }
        throw DecodingError.keyNotFound(key, DecodingError.Context(codingPath: codingPath, debugDescription: "Missing \(key.stringValue)"))
    }

    func decodeFlexibleStringIfPresent(forKey key: Key) throws -> String? {
        if let value = try decodeIfPresent(String.self, forKey: key) {
            return value
        }
        if let value = try decodeIfPresent(Int.self, forKey: key) {
            return String(value)
        }
        if let value = try decodeIfPresent(Double.self, forKey: key) {
            return String(value)
        }
        return nil
    }

    func decodeFlexibleDoubleIfPresent(forKey key: Key) throws -> Double? {
        if let value = try decodeIfPresent(Double.self, forKey: key) {
            return value
        }
        if let value = try decodeIfPresent(Int.self, forKey: key) {
            return Double(value)
        }
        if let value = try decodeIfPresent(String.self, forKey: key) {
            return Double(value)
        }
        return nil
    }

    func decodeFlexibleIntIfPresent(forKey key: Key) throws -> Int? {
        if let value = try decodeIfPresent(Int.self, forKey: key) {
            return value
        }
        if let value = try decodeIfPresent(Double.self, forKey: key) {
            return Int(value)
        }
        if let value = try decodeIfPresent(String.self, forKey: key) {
            return Int(value)
        }
        return nil
    }
}
