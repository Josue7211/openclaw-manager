# Requirements: OpenClaw Manager

**Defined:** 2026-03-24
**Core Value:** AI agent (Bjorn) builds, previews, and hot-reloads custom modules inside the running app -- making it infinitely extensible without writing code.

## v0.0.5 Requirements

Requirements for gateway protocol integration milestone. Each maps to roadmap phases.

### Gateway Connection

- [x] **GW-01**: Connect handshake uses protocol v3 with role/scopes/client metadata (not empty JSON)
- [x] **GW-02**: Device identity sent in handshake (device_id, platform, app_version)
- [x] **GW-03**: Gateway WebSocket reconnects automatically with exponential backoff on disconnect

### RPC Method Corrections

- [x] **RPC-01**: sessions.history -> chat.history (correct method name)
- [x] **RPC-02**: sessions.create -> chat.send with proper message format
- [ ] **RPC-03**: agents.list -> agents.list (verify params match protocol)
- [ ] **RPC-04**: agents.create/update/delete -> verify CRUD method signatures
- [ ] **RPC-05**: crons.list/create/update/delete -> verify CRUD method signatures
- [x] **RPC-06**: models.list -> models.list (verify response shape)
- [ ] **RPC-07**: usage.summary -> usage.get (correct method name and params)
- [x] **RPC-08**: tools.list/skills.list -> verify method names and response shapes
- [x] **RPC-09**: activity.recent -> logs.tail via WS RPC (completed Phase 83)

### Event Bus

- [ ] **EVT-01**: SSE event bus wired to actual gateway WebSocket events (not mock data)
- [ ] **EVT-02**: Real-time agent status updates surfaced via SSE when gateway sends agent.* events
- [x] **EVT-03**: Session events (created, completed, error) surfaced via SSE

### Live Data Verification

- [ ] **LIVE-01**: Agents tab shows real agents from gateway with correct CRUD operations
- [ ] **LIVE-02**: Crons tab shows real scheduled tasks with correct CRUD operations
- [ ] **LIVE-03**: Usage tab shows real token/cost data from gateway
- [ ] **LIVE-04**: Models tab shows real available models from gateway
- [ ] **LIVE-05**: Activity feed shows real events from gateway (not assumed shapes)

## Future Requirements

### Sessions & Chat (v0.0.6)

- **CHAT-01**: Sessions CRUD with proper chat.send/history/abort methods
- **CHAT-02**: Live streaming chat responses via WebSocket
- **CHAT-03**: Model selection per session

## Out of Scope

| Feature | Reason |
|---------|--------|
| New UI pages or widgets | Protocol integration only -- no new features |
| Terminal or remote desktop changes | Working from v0.0.3, untouched |
| Notes/calendar/messages changes | Working from v0.0.1, untouched |
| Multi-user support | Single-user app |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| GW-01 | Phase 75 | Complete |
| GW-02 | Phase 75 | Complete |
| GW-03 | Phase 76 | Complete |
| RPC-01 | Phase 77 | Complete |
| RPC-02 | Phase 77 | Complete |
| RPC-03 | Phase 78 | Pending |
| RPC-04 | Phase 78 | Pending |
| RPC-05 | Phase 79 | Pending |
| RPC-06 | Phase 80 | Complete |
| RPC-07 | Phase 81 | Pending |
| RPC-08 | Phase 82 | Complete |
| RPC-09 | Phase 83 | Complete |
| EVT-01 | Phase 84 | Pending |
| EVT-02 | Phase 85 | Pending |
| EVT-03 | Phase 86 | Complete |
| LIVE-01 | Phase 87 | Pending |
| LIVE-02 | Phase 88 | Pending |
| LIVE-03 | Phase 89 | Pending |
| LIVE-04 | Phase 89 | Pending |
| LIVE-05 | Phase 90 | Pending |

**Coverage:**
- v0.0.5 requirements: 20 total
- Mapped to phases: 20/20
- Unmapped: 0

---
*Requirements defined: 2026-03-24*
*Last updated: 2026-03-24*
