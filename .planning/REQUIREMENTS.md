# Requirements: OpenClaw Manager

**Defined:** 2026-03-24
**Milestone:** v0.0.6 -- Sessions & Chat
**Core Value:** AI agent (Bjorn) builds, previews, and hot-reloads custom modules inside the running app -- making it infinitely extensible without writing code.

## v0.0.6 Requirements

Requirements for full session management and chat functionality. Each maps to roadmap phases.

### Session Management

- [ ] **SESS-01**: User can view a list of all sessions with label, agent name, message count, and last activity timestamp
- [ ] **SESS-02**: User can create a new session by sending the first message (chat.send creates session implicitly)
- [ ] **SESS-03**: User can rename a session by editing its label (sessions.patch)
- [ ] **SESS-04**: User can delete a session (sessions.delete with confirmation)
- [ ] **SESS-05**: User can compact a session to reduce token usage (sessions.compact)
- [ ] **SESS-06**: Session list updates in real-time when new sessions are created or messages arrive (via SSE events)

### Chat

- [ ] **CHAT-01**: User can view chat history for a selected session (chat.history with sessionKey)
- [x] **CHAT-02**: User can send a message to an agent and see the response stream in real-time (chat.send with deliver:true)
- [ ] **CHAT-03**: User can abort an in-progress agent response (chat.abort)
- [ ] **CHAT-04**: Chat messages display with proper formatting (markdown rendering, code blocks)
- [ ] **CHAT-05**: User can see when an agent is "thinking" or generating a response (loading indicator)
- [ ] **CHAT-06**: Chat input supports multiline text and submit via Enter/Shift+Enter

### Model Selection

- [ ] **MODEL-01**: User can select which model/agent to use when starting a new session
- [ ] **MODEL-02**: Available models are fetched from the gateway (models.list) and displayed in a picker
- [ ] **MODEL-03**: Selected model is passed as parameter when creating a session via chat.send

### Session Output Streaming

- [ ] **STREAM-01**: Agent responses stream token-by-token to the frontend via SSE (not batch after completion)
- [ ] **STREAM-02**: Streaming tokens appear with minimal latency (< 200ms from gateway event to UI render)
- [ ] **STREAM-03**: If the gateway connection drops mid-stream, the partial response is preserved and a reconnect is attempted

## Future Requirements (deferred from v0.0.6)

- Session search/filter by content or agent name
- Session export (markdown, JSON)
- Session branching (fork from a specific message)
- Multi-agent sessions (multiple agents in one conversation)
- Session sharing between users

## Out of Scope

- Voice input/output -- deferred to a future milestone (TTS/voice methods exist in protocol)
- File attachments in chat -- deferred (no gateway method for file upload in chat context)
- Session templates/presets -- deferred to Skills & Plugins milestone

## Traceability

| Requirement | Phase | Status |
|------------|-------|--------|
| SESS-01 | Phase 91 | Pending |
| SESS-02 | Phase 93 | Pending |
| SESS-03 | Phase 96 | Pending |
| SESS-04 | Phase 96 | Pending |
| SESS-05 | Phase 96 | Pending |
| SESS-06 | Phase 98 | Pending |
| CHAT-01 | Phase 92 | Pending |
| CHAT-02 | Phase 93 | Complete |
| CHAT-03 | Phase 97 | Pending |
| CHAT-04 | Phase 92 | Pending |
| CHAT-05 | Phase 94 | Pending |
| CHAT-06 | Phase 94 | Pending |
| MODEL-01 | Phase 95 | Pending |
| MODEL-02 | Phase 95 | Pending |
| MODEL-03 | Phase 95 | Pending |
| STREAM-01 | Phase 93 | Pending |
| STREAM-02 | Phase 94 | Pending |
| STREAM-03 | Phase 97 | Pending |
