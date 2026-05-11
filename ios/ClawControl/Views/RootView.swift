import SwiftUI

enum AppSection: String, CaseIterable, Identifiable {
    case dashboard = "Dashboard"
    case missions = "Missions"
    case agents = "Agents"
    case todos = "Todos"
    case chat = "Chat"
    case messages = "Messages"
    case approvals = "Approvals"
    case remote = "Remote"
    case command = "Command"
    case settings = "Settings"

    var id: String { rawValue }

    var icon: String {
        switch self {
        case .dashboard: "rectangle.3.group"
        case .missions: "checklist"
        case .agents: "person.2.wave.2"
        case .todos: "checkmark.circle"
        case .chat: "bubble.left.and.bubble.right"
        case .messages: "message"
        case .approvals: "checkmark.shield"
        case .remote: "rectangle.connected.to.line.below"
        case .command: "terminal"
        case .settings: "gearshape"
        }
    }
}

struct RootView: View {
    @EnvironmentObject private var model: AppModel
    @State private var selection: AppSection? = .dashboard

    var body: some View {
        NavigationSplitView {
            List(AppSection.allCases, selection: $selection) { section in
                Label(section.rawValue, systemImage: section.icon)
                    .tag(section)
            }
            .navigationTitle("ClawControl")
            .safeAreaInset(edge: .bottom) {
                VStack(alignment: .leading, spacing: 6) {
                    StatusPill(text: model.connectionMessage, status: model.connectionMessage.contains("Connected") || model.connectionMessage.contains("healthy") ? .good : .warn)
                    if let identity = model.identity {
                        Text("\(identity.emoji) \(identity.name)")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding()
                .background(.bar)
            }
        } detail: {
            Group {
                switch selection ?? .dashboard {
                case .dashboard:
                    DashboardView()
                case .missions:
                    MissionsView()
                case .agents:
                    AgentsView()
                case .todos:
                    TodosView()
                case .chat:
                    ChatView()
                case .messages:
                    MessagesView()
                case .approvals:
                    ApprovalsView()
                case .remote:
                    RemoteView()
                case .command:
                    CommandView()
                case .settings:
                    SettingsView()
                }
            }
            .toolbar {
                ToolbarItemGroup(placement: .primaryAction) {
                    if model.isLoading {
                        ProgressView()
                    }
                    Button {
                        Task { await model.refreshAll() }
                    } label: {
                        Label("Refresh", systemImage: "arrow.clockwise")
                    }
                }
            }
        }
    }
}

struct TodosView: View {
    @EnvironmentObject private var model: AppModel
    @State private var draft = ""

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 10) {
                TextField("New task", text: $draft)
                    .textFieldStyle(.roundedBorder)
                Button {
                    let value = draft.trimmingCharacters(in: .whitespacesAndNewlines)
                    Task {
                        await model.addTodo(value)
                        draft = ""
                    }
                } label: {
                    Label("Add", systemImage: "plus")
                }
                .disabled(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
            .padding()

            if model.todos.isEmpty {
                EmptyStateView(title: "No Todos", message: "Tasks from the backend will appear here.", systemImage: "checkmark.circle")
            } else {
                List {
                    ForEach(model.todos) { todo in
                        HStack(spacing: 12) {
                            Button {
                                Task { await model.setTodo(todo, done: !todo.done) }
                            } label: {
                                Image(systemName: todo.done ? "checkmark.circle.fill" : "circle")
                                    .font(.title3)
                            }
                            .buttonStyle(.plain)

                            VStack(alignment: .leading, spacing: 4) {
                                Text(todo.text)
                                    .strikethrough(todo.done)
                                if let due = todo.dueDate {
                                    Text(due)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                            Spacer()
                        }
                        .padding(.vertical, 4)
                        .swipeActions {
                            Button(role: .destructive) {
                                Task { await model.deleteTodo(todo) }
                            } label: {
                                Label("Delete", systemImage: "trash")
                            }
                        }
                    }
                }
                .listStyle(.plain)
            }
        }
        .navigationTitle("Todos")
    }
}

struct ChatView: View {
    @EnvironmentObject private var model: AppModel
    @State private var draft = ""

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 12) {
                    if model.chatMessages.isEmpty {
                        EmptyStateView(title: "No Chat Yet", message: "Send a message to the configured harness.", systemImage: "bubble.left")
                            .frame(minHeight: 360)
                    } else {
                        ForEach(model.chatMessages) { message in
                            ChatBubble(message: message)
                        }
                    }
                }
                .padding()
            }

            HStack(alignment: .bottom, spacing: 10) {
                TextField("Message", text: $draft, axis: .vertical)
                    .lineLimit(1...5)
                    .textFieldStyle(.roundedBorder)
                Button {
                    let value = draft.trimmingCharacters(in: .whitespacesAndNewlines)
                    Task {
                        await model.sendChat(value)
                        draft = ""
                    }
                } label: {
                    Label("Send", systemImage: "paperplane.fill")
                }
                .disabled(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
            .padding()
            .background(.bar)
        }
        .navigationTitle("Chat")
    }
}

struct ChatBubble: View {
    let message: ChatMessage

    var body: some View {
        HStack {
            if message.role.lowercased() == "user" {
                Spacer(minLength: 40)
            }
            VStack(alignment: .leading, spacing: 6) {
                Text(message.role.capitalized)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                Text(message.content.isEmpty ? "(empty)" : message.content)
                    .font(.body)
                    .textSelection(.enabled)
            }
            .padding(12)
            .background(message.role.lowercased() == "user" ? Color.accentColor.opacity(0.16) : Color.secondary.opacity(0.12), in: RoundedRectangle(cornerRadius: 8))
            if message.role.lowercased() != "user" {
                Spacer(minLength: 40)
            }
        }
    }
}

struct MessagesView: View {
    @EnvironmentObject private var model: AppModel
    @State private var selected: Conversation?
    @State private var draft = ""

    var body: some View {
        HStack(spacing: 0) {
            List(model.conversations, selection: $selected) { conversation in
                VStack(alignment: .leading, spacing: 5) {
                    HStack {
                        Text(conversation.title)
                            .font(.headline)
                            .lineLimit(1)
                        Spacer()
                        if conversation.unreadCount > 0 {
                            Text("\(conversation.unreadCount)")
                                .font(.caption.weight(.bold))
                                .padding(.horizontal, 7)
                                .padding(.vertical, 3)
                                .background(.blue, in: Capsule())
                                .foregroundStyle(.white)
                        }
                    }
                    if let last = conversation.lastMessage, !last.isEmpty {
                        Text(last)
                            .font(.callout)
                            .foregroundStyle(.secondary)
                            .lineLimit(2)
                    }
                }
                .padding(.vertical, 5)
                .tag(conversation)
            }
            .frame(minWidth: 280, idealWidth: 340, maxWidth: 420)

            Divider()

            VStack(spacing: 0) {
                if let selected {
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 10) {
                            ForEach(model.selectedConversationMessages) { message in
                                MessageBubble(message: message)
                            }
                        }
                        .padding()
                    }
                    HStack(alignment: .bottom, spacing: 10) {
                        TextField("Message", text: $draft, axis: .vertical)
                            .lineLimit(1...4)
                            .textFieldStyle(.roundedBorder)
                        Button {
                            let value = draft.trimmingCharacters(in: .whitespacesAndNewlines)
                            Task {
                                await model.sendMessage(value, to: selected)
                                draft = ""
                            }
                        } label: {
                            Label("Send", systemImage: "paperplane.fill")
                        }
                        .disabled(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    }
                    .padding()
                    .background(.bar)
                } else {
                    EmptyStateView(title: "Pick a Conversation", message: "Messages uses the backend BlueBubbles bridge.", systemImage: "message")
                }
            }
        }
        .navigationTitle("Messages")
        .onChange(of: selected) { conversation in
            guard let conversation else {
                model.selectedConversationMessages = []
                return
            }
            Task { await model.loadMessages(for: conversation) }
        }
    }
}

struct MessageBubble: View {
    let message: MessageItem

    var body: some View {
        HStack {
            if message.isFromMe {
                Spacer(minLength: 44)
            }
            Text(message.text.isEmpty ? "(attachment or empty message)" : message.text)
                .textSelection(.enabled)
                .padding(11)
                .background(message.isFromMe ? Color.accentColor.opacity(0.16) : Color.secondary.opacity(0.12), in: RoundedRectangle(cornerRadius: 8))
            if !message.isFromMe {
                Spacer(minLength: 44)
            }
        }
    }
}

struct ApprovalsView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        List {
            if !model.approvalSources.isEmpty {
                Section("Sources") {
                    ForEach(model.approvalSources) { source in
                        HStack {
                            StatusPill(text: source.ok ? "ok" : "check", status: source.ok ? .good : .warn)
                            VStack(alignment: .leading) {
                                Text(source.label)
                                if let error = source.error {
                                    Text(error)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                            Spacer()
                            Text("\(source.count ?? 0)")
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }

            Section("Requests") {
                if model.approvals.isEmpty {
                    EmptyStateView(title: "No Approvals", message: "Pending approvals will appear here.", systemImage: "checkmark.shield")
                } else {
                    ForEach(model.approvals) { approval in
                        ApprovalRow(approval: approval)
                    }
                }
            }
        }
        .navigationTitle("Approvals")
    }
}

struct ApprovalRow: View {
    @EnvironmentObject private var model: AppModel
    let approval: ApprovalRequest

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(approval.tool)
                    .font(.headline)
                Spacer()
                StatusPill(text: approval.status, status: approval.status == "pending" ? .warn : .neutral)
            }
            if let context = approval.context, !context.isEmpty {
                Text(context)
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .lineLimit(3)
            }
            HStack {
                if let source = approval.sourceLabel ?? approval.source {
                    Label(source, systemImage: "server.rack")
                }
                if let risk = approval.risk {
                    Label(risk, systemImage: "exclamationmark.triangle")
                }
            }
            .font(.caption)
            .foregroundStyle(.secondary)

            if approval.status == "pending" {
                HStack {
                    Button {
                        Task { await model.approve(approval) }
                    } label: {
                        Label("Approve", systemImage: "checkmark")
                    }
                    Button(role: .destructive) {
                        Task { await model.reject(approval) }
                    } label: {
                        Label("Reject", systemImage: "xmark")
                    }
                }
            }
        }
        .padding(.vertical, 5)
    }
}

struct RemoteView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.openURL) private var openURL

    var body: some View {
        List {
            Section("Moonlight") {
                RemoteStatusRow(
                    title: "Sunshine",
                    message: model.remoteStatus?.message ?? "No remote status loaded",
                    reachable: model.remoteStatus?.reachable
                )
                if let urlString = model.remoteStatus?.moonlightUrl, let url = URL(string: urlString) {
                    Button {
                        openURL(url)
                    } label: {
                        Label("Open Moonlight", systemImage: "play.rectangle")
                    }
                }
                if let urlString = model.remoteStatus?.sunshineUrl, let url = URL(string: urlString) {
                    Link(destination: url) {
                        Label("Open Sunshine", systemImage: "gear")
                    }
                }
            }

            Section("Embedded VNC") {
                RemoteStatusRow(
                    title: "VNC",
                    message: model.vncStatus?.message ?? "No VNC status loaded",
                    reachable: model.vncStatus?.reachable
                )
                if let vnc = model.vncStatus {
                    LabeledContent("Active", value: "\(vnc.active ?? 0) / \(vnc.max ?? 1)")
                    LabeledContent("Host", value: vnc.host ?? "unknown")
                }
                Button {
                    Task { await model.repairRemoteViewer() }
                } label: {
                    Label("Repair VNC", systemImage: "wrench.and.screwdriver")
                }
            }
        }
        .navigationTitle("Remote")
    }
}

struct RemoteStatusRow: View {
    let title: String
    let message: String
    let reachable: Bool?

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            StatusPill(text: reachable == true ? "online" : "offline", status: reachable == true ? .good : .warn)
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.headline)
                Text(message)
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }
        }
    }
}

enum PillStatus {
    case good
    case warn
    case neutral

    var color: Color {
        switch self {
        case .good: .green
        case .warn: .orange
        case .neutral: .secondary
        }
    }
}

struct StatusPill: View {
    let text: String
    var status: PillStatus = .neutral

    var body: some View {
        HStack(spacing: 6) {
            Circle()
                .fill(status.color)
                .frame(width: 8, height: 8)
            Text(text)
                .font(.caption.weight(.semibold))
                .lineLimit(1)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(status.color.opacity(0.12), in: Capsule())
        .foregroundStyle(status.color)
    }
}

struct EmptyStateView: View {
    let title: String
    let message: String
    let systemImage: String

    var body: some View {
        VStack(spacing: 14) {
            Image(systemName: systemImage)
                .font(.system(size: 42, weight: .semibold))
                .foregroundStyle(.secondary)
            Text(title)
                .font(.title3.weight(.semibold))
            Text(message)
                .font(.callout)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding()
    }
}
