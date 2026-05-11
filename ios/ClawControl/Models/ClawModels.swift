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

struct TodoItem: Decodable, Identifiable {
    let id: String
    let text: String
    let done: Bool
    let dueDate: String?
    let createdAt: String?
    let updatedAt: String?

    enum CodingKeys: String, CodingKey {
        case id
        case text
        case done
        case dueDate = "due_date"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }

    init(id: String, text: String, done: Bool, dueDate: String?, createdAt: String?, updatedAt: String?) {
        self.id = id
        self.text = text
        self.done = done
        self.dueDate = dueDate
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decodeFlexibleString(forKey: .id)
        text = try container.decodeFlexibleStringIfPresent(forKey: .text) ?? ""
        done = try container.decodeFlexibleBoolIfPresent(forKey: .done) ?? false
        dueDate = try container.decodeFlexibleStringIfPresent(forKey: .dueDate)
        createdAt = try container.decodeFlexibleStringIfPresent(forKey: .createdAt)
        updatedAt = try container.decodeFlexibleStringIfPresent(forKey: .updatedAt)
    }
}

struct ChatMessage: Decodable, Identifiable {
    let id: String
    let role: String
    let content: String
    let createdAt: String?

    enum CodingKeys: String, CodingKey {
        case id
        case role
        case content
        case text
        case message
        case createdAt = "created_at"
        case timestamp
        case time
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decodeFlexibleStringIfPresent(forKey: .id) ?? UUID().uuidString
        role = try container.decodeFlexibleStringIfPresent(forKey: .role) ?? "assistant"
        content = try container.decodeFlexibleStringIfPresent(forKey: .content)
            ?? container.decodeFlexibleStringIfPresent(forKey: .text)
            ?? container.decodeFlexibleStringIfPresent(forKey: .message)
            ?? ""
        createdAt = try container.decodeFlexibleStringIfPresent(forKey: .createdAt)
            ?? container.decodeFlexibleStringIfPresent(forKey: .timestamp)
            ?? container.decodeFlexibleStringIfPresent(forKey: .time)
    }
}

struct Conversation: Decodable, Identifiable, Hashable {
    var id: String { guid }

    let guid: String
    let title: String
    let lastMessage: String?
    let date: String?
    let unreadCount: Int
    let service: String?

    enum CodingKeys: String, CodingKey {
        case guid
        case title
        case displayName = "displayName"
        case name
        case lastMessage = "lastMessage"
        case lastMessageText = "lastMessageText"
        case latestText = "latestText"
        case date
        case lastDate
        case lastMessageDate = "lastMessageDate"
        case unreadCount = "unreadCount"
        case unread
        case isUnread
        case service
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        guid = try container.decodeFlexibleString(forKey: .guid)
        title = try container.decodeFlexibleStringIfPresent(forKey: .title)
            ?? container.decodeFlexibleStringIfPresent(forKey: .displayName)
            ?? container.decodeFlexibleStringIfPresent(forKey: .name)
            ?? guid
        lastMessage = try container.decodeFlexibleStringIfPresent(forKey: .lastMessage)
            ?? container.decodeFlexibleStringIfPresent(forKey: .lastMessageText)
            ?? container.decodeFlexibleStringIfPresent(forKey: .latestText)
        date = try container.decodeFlexibleStringIfPresent(forKey: .date)
            ?? container.decodeFlexibleStringIfPresent(forKey: .lastDate)
            ?? container.decodeFlexibleStringIfPresent(forKey: .lastMessageDate)
        unreadCount = try container.decodeFlexibleIntIfPresent(forKey: .unreadCount)
            ?? ((try container.decodeFlexibleBoolIfPresent(forKey: .isUnread)) == true ? 1 : 0)
            ?? ((try container.decodeFlexibleBoolIfPresent(forKey: .unread)) == true ? 1 : 0)
        service = try container.decodeFlexibleStringIfPresent(forKey: .service)
    }
}

struct MessageItem: Decodable, Identifiable {
    let id: String
    let text: String
    let isFromMe: Bool
    let dateCreated: String?
    let sender: String?

    enum CodingKeys: String, CodingKey {
        case guid
        case id
        case text
        case message
        case isFromMe = "isFromMe"
        case is_from_me
        case dateCreated = "dateCreated"
        case createdAt = "created_at"
        case sender
        case handle
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decodeFlexibleStringIfPresent(forKey: .guid)
            ?? container.decodeFlexibleStringIfPresent(forKey: .id)
            ?? UUID().uuidString
        text = try container.decodeFlexibleStringIfPresent(forKey: .text)
            ?? container.decodeFlexibleStringIfPresent(forKey: .message)
            ?? ""
        isFromMe = try container.decodeFlexibleBoolIfPresent(forKey: .isFromMe)
            ?? container.decodeFlexibleBoolIfPresent(forKey: .is_from_me)
            ?? false
        dateCreated = try container.decodeFlexibleStringIfPresent(forKey: .dateCreated)
            ?? container.decodeFlexibleStringIfPresent(forKey: .createdAt)
        sender = try container.decodeFlexibleStringIfPresent(forKey: .sender)
    }
}

struct ApprovalRequest: Decodable, Identifiable {
    let id: String
    let source: String?
    let sourceLabel: String?
    let risk: String?
    let tool: String
    let context: String?
    let requestedAt: String?
    let status: String
    let args: [String: LooseJSON]?

    enum CodingKeys: String, CodingKey {
        case id
        case source
        case sourceLabel
        case risk
        case tool
        case context
        case requestedAt
        case status
        case args
    }
}

struct ApprovalSourceStatus: Decodable, Identifiable {
    var id: String { source }

    let source: String
    let label: String
    let configured: Bool
    let ok: Bool
    let count: Int?
    let error: String?
}

struct RemoteStatus: Decodable {
    let configured: Bool
    let reachable: Bool
    let host: String?
    let mode: String?
    let moonlightUrl: String?
    let sunshineUrl: String?
    let message: String
    let reason: String?
}

struct VNCStatus: Decodable {
    let configured: Bool
    let reachable: Bool
    let available: Bool
    let active: Int?
    let max: Int?
    let host: String?
    let message: String
    let reason: String?
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

struct TodosResponse: Decodable {
    let todos: [TodoItem]
}

struct TodoCreateBody: Encodable {
    let text: String
    let dueDate: String?

    enum CodingKeys: String, CodingKey {
        case text
        case dueDate = "due_date"
    }
}

struct TodoPatchBody: Encodable {
    let id: String
    let done: Bool
}

struct TodoDeleteBody: Encodable {
    let id: String
}

struct ChatHistoryResponse: Decodable {
    let messages: [ChatMessage]
}

struct ChatSendBody: Encodable {
    let text: String
    let images: [String]
    let model: String?
    let sessionKey: String
}

struct ChatSendResponse: Decodable {
    let ok: Bool
    let sessionKey: String?
}

struct ConversationsResponse: Decodable {
    let conversations: [Conversation]
}

struct MessagesResponse: Decodable {
    let messages: [MessageItem]
}

struct SendMessageBody: Encodable {
    let chatGuid: String
    let text: String
}

struct ApprovalsResponse: Decodable {
    let approvals: [ApprovalRequest]
    let sources: [ApprovalSourceStatus]?
}

struct ApprovalRejectBody: Encodable {
    let reason: String?
}

struct VNCRepairBody: Encodable {
    let target: String
}

enum LooseJSON: Decodable {
    case string(String)
    case number(Double)
    case bool(Bool)
    case object([String: LooseJSON])
    case array([LooseJSON])
    case null

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
        } else if let value = try? container.decode(Bool.self) {
            self = .bool(value)
        } else if let value = try? container.decode(Double.self) {
            self = .number(value)
        } else if let value = try? container.decode(String.self) {
            self = .string(value)
        } else if let value = try? container.decode([LooseJSON].self) {
            self = .array(value)
        } else {
            self = .object((try? container.decode([String: LooseJSON].self)) ?? [:])
        }
    }

    var display: String {
        switch self {
        case .string(let value): value
        case .number(let value): "\(value)"
        case .bool(let value): value ? "true" : "false"
        case .object(let value): "\(value.count) fields"
        case .array(let value): "\(value.count) items"
        case .null: "null"
        }
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

    func decodeFlexibleBoolIfPresent(forKey key: Key) throws -> Bool? {
        if let value = try decodeIfPresent(Bool.self, forKey: key) {
            return value
        }
        if let value = try decodeIfPresent(Int.self, forKey: key) {
            return value != 0
        }
        if let value = try decodeIfPresent(String.self, forKey: key) {
            switch value.lowercased() {
            case "true", "yes", "1":
                return true
            case "false", "no", "0":
                return false
            default:
                return nil
            }
        }
        return nil
    }
}
