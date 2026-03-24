# Requirements: OpenClaw Manager

**Defined:** 2026-03-24
**Core Value:** AI agent (Bjorn) builds, previews, and hot-reloads custom modules inside the running app -- making it infinitely extensible without writing code.

## v0.0.5 Requirements

Requirements for gateway protocol integration milestone. Each maps to roadmap phases.

### Gateway Connection

- [ ] **GW-01**: Connect handshake uses protocol v3 with role/scopes/client metadata (not empty JSON)
- [ ] **GW-02**: Device identity sent in handshake (device_id, platform, app_version)
- [ ] **GW-03**: Gateway WebSocket reconnects automatically with exponential backoff on disconnect

### RPC Method Corrections

- [ ] **RPC-01**: sessions.history → chat.history (correct method name)
- [ ] **RPC-02**: sessions.create → chat.send with proper message format
- [ ] **RPC-03**: agents.list → agents.list (verify params match protocol)
- [ ] **RPC-04**: agents.create/update/delete → verify CRUD method signatures
- [ ] **RPC-05**: crons.list/create/update/delete → verify CRUD method signatures
- [ ] **RPC-06**: models.list → models.list (verify response shape)
- [ ] **RPC-07**: usage.summary → usage.get (correct method name and params)
- [ ] **RPC-08**: tools.list/skills.list → verify method names and response shapes
- [ ] **RPC-09**: activity.recent → events.list or subscribe pattern (verify correct approach)

### Event Bus

- [ ] **EVT-01**: SSE event bus wired to actual gateway WebSocket events (not mock data)
- [ ] **EVT-02**: Real-time agent status updates surfaced via SSE when gateway sends agent.* events
- [ ] **EVT-03**: Session events (created, completed, error) surfaced via SSE

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
| GW-01 | TBD | Pending |
| GW-02 | TBD | Pending |
| GW-03 | TBD | Pending |
| RPC-01 | TBD | Pending |
| RPC-02 | TBD | Pending |
| RPC-03 | TBD | Pending |
| RPC-04 | TBD | Pending |
| RPC-05 | TBD | Pending |
| RPC-06 | TBD | Pending |
| RPC-07 | TBD | Pending |
| RPC-08 | TBD | Pending |
| RPC-09 | TBD | Pending |
| EVT-01 | TBD | Pending |
| EVT-02 | TBD | Pending |
| EVT-03 | TBD | Pending |
| LIVE-01 | TBD | Pending |
| LIVE-02 | TBD | Pending |
| LIVE-03 | TBD | Pending |
| LIVE-04 | TBD | Pending |
| LIVE-05 | TBD | Pending |

**Coverage:**
- v0.0.5 requirements: 20 total
- Mapped to phases: 0 (pending roadmap)
- Unmapped: 20

---
*Requirements defined: 2026-03-24*
*Last updated: 2026-03-24*
