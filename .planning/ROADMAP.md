# Roadmap: OpenClaw Manager

## Milestones

- v1.0 -- Publishable release (shipped 2026-03-21) -- [Full details](milestones/v1.0-ROADMAP.md)
- v0.0.2 -- Widget-First Architecture (shipped 2026-03-22)
- v0.0.3 -- AI Ops Center + OpenClaw Controller + Polish (shipped 2026-03-24)
- v0.0.4 -- Stabilize & Strip (shipped 2026-03-24) -- [Full details](milestones/v0.0.4-ROADMAP.md)
- v0.0.5 -- Gateway Protocol v3 (shipped 2026-03-24) -- [Full details](milestones/v0.0.5-ROADMAP.md)
- v0.0.6 -- Sessions & Chat (in progress)

## Phases

### v0.0.6 -- Sessions & Chat

**Group AE: Session Foundation** *(session list is the entry point for all chat work)*
- [x] **Phase 91: Session List** - Fetch and display all sessions via sessions.list with label, agent, message count, last activity (completed 2026-03-25)
- [ ] **Phase 92: Chat History Display** - Load and render chat history for a selected session with markdown formatting

**Group AF: Chat Send & Streaming** *(send messages and stream agent responses token-by-token)*
- [ ] **Phase 93: Chat Send with Token Streaming** - Send messages via chat.send with deliver:true and stream agent response tokens via SSE
- [ ] **Phase 94: Streaming UX Polish** - Low-latency token rendering, typing/thinking indicator, multiline input with Enter/Shift+Enter

**Group AG: Model Selection** *(pick which model/agent powers a new session)*
- [ ] **Phase 95: Model Picker for New Sessions** - Fetch models via models.list, display picker, pass selection to chat.send for session creation

**Group AH: Session CRUD** *(manage existing sessions -- rename, delete, compact)*
- [ ] **Phase 96: Session Rename, Delete, Compact** - Patch session labels, delete with confirmation, compact to reduce token usage

**Group AI: Resilience & Real-time** *(abort, reconnect, live updates)*
- [ ] **Phase 97: Chat Abort & Stream Resilience** - Cancel in-progress responses via chat.abort, preserve partial responses on disconnect
- [ ] **Phase 98: Real-time Session List Updates** - Session list updates live via SSE when sessions are created or messages arrive

<details>
<summary>v0.0.5 -- Gateway Protocol v3 (16 phases) -- SHIPPED 2026-03-24</summary>

**Group AA: Gateway Handshake** *(foundation -- everything else depends on correct connection)*
- [x] **Phase 75: Protocol v3 Handshake** - Connect to gateway using protocol v3 with role, scopes, client metadata, and device identity (completed 2026-03-24)
- [x] **Phase 76: Reconnect with Backoff** - Automatic WebSocket reconnection with exponential backoff on disconnect

**Group AB: RPC Method Corrections** *(fix all wrong method names so backend calls real gateway methods)*
- [x] **Phase 77: Chat Method Corrections** - Fix sessions.history -> chat.history and sessions.create -> chat.send
- [x] **Phase 78: Agent Method Verification** - Verify agents.list params and agents CRUD method signatures match protocol
- [x] **Phase 79: Cron Method Verification** - Verify cron CRUD method signatures (cron.list/add/update/remove vs crons.*)
- [x] **Phase 80: Models Method Verification** - Verify models.list response shape matches protocol
- [x] **Phase 81: Usage Method Correction** - Fix usage.summary -> usage.status/usage.cost with correct params (completed 2026-03-24)
- [x] **Phase 82: Tools & Skills Method Verification** - Verify tools.list and skills.list method names and response shapes
- [x] **Phase 83: Activity Events Method Correction** - Fix activity.recent to use logs.tail via WS RPC

**Group AC: Event Bus Wiring** *(SSE event bus connected to real gateway WebSocket events)*
- [x] **Phase 84: SSE Event Bus Wiring** - Wire SSE event bus to actual gateway WebSocket events instead of mock data
- [x] **Phase 85: Agent Event Streaming** - Surface real-time agent.* events from gateway via SSE (completed 2026-03-24)
- [x] **Phase 86: Session Event Streaming** - Surface session created/completed/error events via SSE

**Group AD: Live Data Verification** *(verify every OpenClaw tab with real gateway data)*
- [x] **Phase 87: Live Agents Tab** - Verify agents tab shows real agents with working CRUD against live gateway
- [x] **Phase 88: Live Crons Tab** - Verify crons tab shows real scheduled tasks with working CRUD against live gateway
- [x] **Phase 89: Live Usage & Models Tabs** - Verify usage and models tabs show real data from gateway
- [x] **Phase 90: Live Activity Feed** - Verify activity feed shows real events from gateway

</details>

<details>
<summary>v0.0.4 -- Stabilize & Strip (19 phases) -- SHIPPED 2026-03-24</summary>

**Group U: Dev Workflow Fixes** *(unblocks everything else)*
- [x] **Phase 56: Browser Mode Auth Fix** - Fix browser mode auth to work without Tauri shell for development (completed 2026-03-24)
- [x] **Phase 57: ffir Error Toast Fix** - Resolve persistent "ffir" binary reference error toast on every page load (completed 2026-03-24)

**Group V: Backend Dead Code Audit & Strip** *(Rust compiler assists, source of truth)*
- [x] **Phase 58: Audit #[allow(dead_code)] Annotations** - Audit all 13 annotations across 7 Rust files, remove or justify each (completed 2026-03-24)
- [x] **Phase 59: Strip Unused Crate Dependencies** - Run cargo-machete and remove unused crates from Cargo.toml (completed 2026-03-24)
- [x] **Phase 60: Strip Dead Route Modules** - Remove backend route modules with zero frontend consumers after audit (completed 2026-03-24)
- [x] **Phase 61: Strip Nonexistent Gateway Methods** - Remove pause/resume routes that map to nothing in the gateway protocol (completed 2026-03-24)

**Group W: Frontend Tooling Setup**
- [x] **Phase 62: Configure knip for Dead Code Detection** - Set up knip v6 with entry points for lazy routes and widget registry (completed 2026-03-24)

**Group X: Frontend Dead Code Strip** *(using knip results + manual audit)*
- [x] **Phase 63: Strip noVNC Dependency** - Remove @novnc/novnc package and VncPreviewWidget.tsx (completed 2026-03-24)
- [x] **Phase 64: Strip TipTap/Project Tracker Stubs** - Verified never scaffolded (completed 2026-03-24)
- [x] **Phase 65: Strip Unused File Exports** - Remove all unused file exports detected by knip (completed 2026-03-24)
- [x] **Phase 66: Strip Unused npm Dependencies** - Remove all unused npm dependencies detected by knip (completed 2026-03-24)
- [x] **Phase 67: Strip Unused Imports** - Clean all unused imports via eslint-plugin-unused-imports (completed 2026-03-24)
- [x] **Phase 68: Enable TypeScript Strict Flags** - Enable noUnusedLocals and noUnusedParameters, fix all violations (completed 2026-03-24)

**Group Y: Test Coverage** *(after code is stable)*
- [x] **Phase 69: OpenClaw Hook Tests** - Unit tests for useAgents, useCrons, useOpenClawStatus, useOpenClawModels (completed 2026-03-24)
- [x] **Phase 70: Terminal Hook Tests** - Unit tests for useTerminal, useSessionOutput (completed 2026-03-24)
- [x] **Phase 71: Gateway Integration Tests** - Integration tests for gateway status and health check paths (completed 2026-03-24)

**Group Z: Final Verification** *(after everything else)*
- [x] **Phase 72: Sidebar Module Smoke Test** - Verify every sidebar module loads without errors after cleanup (completed 2026-03-24)
- [x] **Phase 73: Widget Render Smoke Test** - Verify all 29 widgets render without crashes after cleanup (completed 2026-03-24)
- [x] **Phase 74: Full Route Audit** - Verify no 404s, blank pages, or infinite loaders across all routes (completed 2026-03-24)

</details>

<details>
<summary>v0.0.3 -- AI Ops Center + OpenClaw Controller + Polish (55 phases) -- SHIPPED 2026-03-24</summary>

**Group A: Bug Verification** *(code-reviewed, verified)*
- [x] **Phase 1: Verify Widget Resize Fix** - Confirm widget resize handles work across all widget types *(verified 2026-03-23)*
- [x] **Phase 2: Verify Page Layout Fix** - Confirm full-bleed and scrolling pages work at all viewport sizes *(verified 2026-03-23)*
- [x] **Phase 3: Verify Widget Tab-Switch Fix** - Confirm widgets persist across page/tab navigation *(verified 2026-03-23)*
- [x] **Phase 4: Verify Widget Picker UX Fixes** - Confirm duplicates, animations, preset feedback, delete dialog *(verified 2026-03-23)*

**Group B: Infrastructure**
- [x] **Phase 5: Set CI Bundle Budget** - CI check failing if any chunk >400KB or total >5MB *(completed 2026-03-22)*

**Group C: Theme Blend**
- [x] **Phase 6: Theme Blend -- OKLCH Helpers** *(completed 2026-03-22)*
- [x] **Phase 7: Theme Blend -- Interpolation Engine** *(completed 2026-03-22)*
- [x] **Phase 8: Theme Blend -- Slider UI + Persistence** *(completed 2026-03-22)*

**Group D: OpenClaw Controller**
- [x] **Phase 9: OpenClaw Gateway Proxy Helper** *(completed 2026-03-22)*
- [x] **Phase 10: OpenClaw Agent Management** *(completed 2026-03-22)*
- [x] **Phase 11: OpenClaw Agent Calendar** *(completed 2026-03-22)*
- [x] **Phase 12: OpenClaw Usage + Models + Controller Page** *(completed 2026-03-22)*

**Group E: Terminal**
- [x] **Phase 13: Terminal PTY Backend** *(completed 2026-03-23)*
- [x] **Phase 14: Terminal Frontend (xterm.js)** *(completed 2026-03-23)*

**Group F: AI Ops Center**
- [x] **Phase 15: Claude Code Session Backend** *(completed 2026-03-23)*
- [x] **Phase 16: Session Monitor Frontend** *(completed 2026-03-23)*
- [x] **Phase 17: Remote VM Viewer** *(completed 2026-03-23)*

**Group G: Integration + Polish**
- [x] **Phase 18: Widget Registry + Sidebar Module Integration** *(completed 2026-03-23)*
- [x] **Phase 19: Final Verification + Bundle Audit** *(completed 2026-03-23)*

**Group H: Post-Ship Bug Fixes**
- [x] **Phase 19.1: Post-Ship Bug Fixes** *(verified 2026-03-23)*

**Group I: Critical Bug Fixes**
- [x] **Phase 20-24** *(committed 2026-03-23)*

**Group J-T: Gateway, Sessions, Tabs, Approvals, Skills, Monitoring, Memory, Models, Remote Desktop, Dashboard, Notes**
- [x] **Phases 25-55** *(committed 2026-03-23 to 2026-03-24)*

**Total:** 55 phases -- all complete

</details>

<details>
<summary>v0.0.2 -- Widget-First Architecture (7 phases) -- SHIPPED 2026-03-22</summary>

- [x] Phase 1: Fix Widget Bugs + Decouple Existing Cards (MH-01 through MH-04)
- [x] Phase 2: Convert Tier 1 Modules to Widgets (MH-05, MH-11, MH-14, MH-15)
- [x] Phase 3: Unify Personal + Dashboard Pages (MH-06)
- [x] Phase 4: Convert Tier 2 Modules to Widgets (MH-07, MH-11)
- [x] Phase 5: Category Presets + Widget Picker Enhancement (MH-08, MH-12)
- [x] Phase 6: Convert Tier 3 Modules -- Summary Widgets (MH-09, MH-15)
- [x] Phase 7: Remove DashboardDataContext + Cleanup (MH-10, MH-13)

**Total:** 7 phases, 15 requirements -- all complete

</details>

## Phase Details

### Phase 91: Session List
**Goal**: Users can browse all their sessions and see key metadata at a glance
**Depends on**: Nothing (v0.0.5 gateway connection is prerequisite -- already shipped)
**Requirements**: SESS-01
**Success Criteria** (what must be TRUE):
  1. Sessions page displays a list of all sessions fetched via sessions.list RPC
  2. Each session row shows its label, agent name, message count, and last activity timestamp
  3. Sessions are sorted by most recent activity (newest first)
  4. Empty state is shown when no sessions exist, with a prompt to start a new chat
**Plans**: 2 plans
Plans:
- [ ] 91-01-PLAN.md — Backend route + types + hook + tests (data layer)
- [ ] 91-02-PLAN.md — SessionCard, SessionList, SessionsPage UI rewrite
**UI hint**: yes

### Phase 92: Chat History Display
**Goal**: Users can select a session and read its full conversation with proper formatting
**Depends on**: Phase 91
**Requirements**: CHAT-01, CHAT-04
**Success Criteria** (what must be TRUE):
  1. Clicking a session in the list loads its message history via chat.history with sessionKey
  2. Messages render with proper markdown formatting (bold, italic, lists, links)
  3. Code blocks render with syntax highlighting and a copy button
  4. User messages and agent messages are visually distinct (different alignment or color)
  5. Scrolling loads older messages if the history exceeds the initial page (pagination via limit param)
**Plans**: 2 plans
Plans:
- [ ] 91-01-PLAN.md — Backend route + types + hook + tests (data layer)
- [ ] 91-02-PLAN.md — SessionCard, SessionList, SessionsPage UI rewrite
**UI hint**: yes

### Phase 93: Chat Send with Token Streaming
**Goal**: Users can send a message and watch the agent's response appear token-by-token in real-time
**Depends on**: Phase 92
**Requirements**: CHAT-02, STREAM-01
**Success Criteria** (what must be TRUE):
  1. User types a message and submits it; the message appears immediately in the thread
  2. chat.send is called with { sessionKey, message, deliver: true, idempotencyKey }
  3. Agent response tokens stream in via SSE "chat" events and render incrementally (not batched)
  4. When streaming completes, the full response is displayed as a single coherent message
  5. Sending the first message in a new session implicitly creates the session (no separate create step)
**Plans**: 2 plans
Plans:
- [ ] 91-01-PLAN.md — Backend route + types + hook + tests (data layer)
- [ ] 91-02-PLAN.md — SessionCard, SessionList, SessionsPage UI rewrite
**UI hint**: yes

### Phase 94: Streaming UX Polish
**Goal**: Chat input and streaming feel responsive and polished with clear feedback during agent thinking
**Depends on**: Phase 93
**Requirements**: STREAM-02, CHAT-05, CHAT-06
**Success Criteria** (what must be TRUE):
  1. Streaming tokens appear with less than 200ms latency from gateway event to UI render
  2. A visible "thinking" or typing indicator shows while waiting for the first token after sending
  3. Chat input supports multiline text entry (Shift+Enter for newline, Enter to send)
  4. Send button is disabled while an agent response is in progress
**Plans**: 2 plans
Plans:
- [ ] 91-01-PLAN.md — Backend route + types + hook + tests (data layer)
- [ ] 91-02-PLAN.md — SessionCard, SessionList, SessionsPage UI rewrite
**UI hint**: yes

### Phase 95: Model Picker for New Sessions
**Goal**: Users can choose which model or agent powers a new conversation before sending the first message
**Depends on**: Phase 93
**Requirements**: MODEL-01, MODEL-02, MODEL-03
**Success Criteria** (what must be TRUE):
  1. A model picker is visible when starting a new session (before the first message is sent)
  2. Available models are fetched from the gateway via models.list and displayed with provider labels
  3. The selected model is included as a parameter when chat.send creates the session
  4. The picker defaults to a sensible model (e.g., the one used in the most recent session or the first in the list)
**Plans**: 2 plans
Plans:
- [ ] 91-01-PLAN.md — Backend route + types + hook + tests (data layer)
- [ ] 91-02-PLAN.md — SessionCard, SessionList, SessionsPage UI rewrite
**UI hint**: yes

### Phase 96: Session Rename, Delete, Compact
**Goal**: Users can manage existing sessions -- rename for organization, delete unwanted ones, compact to save tokens
**Depends on**: Phase 91
**Requirements**: SESS-03, SESS-04, SESS-05
**Success Criteria** (what must be TRUE):
  1. User can double-click or use a menu to rename a session label (calls sessions.patch)
  2. User can delete a session with a confirmation dialog (calls sessions.delete)
  3. User can compact a session to reduce its token footprint (calls sessions.compact) with visual feedback
  4. After rename/delete/compact, the session list reflects the change immediately without full refetch
**Plans**: 2 plans
Plans:
- [ ] 91-01-PLAN.md — Backend route + types + hook + tests (data layer)
- [ ] 91-02-PLAN.md — SessionCard, SessionList, SessionsPage UI rewrite
**UI hint**: yes

### Phase 97: Chat Abort & Stream Resilience
**Goal**: Users can cancel in-progress responses, and partial responses survive connection drops
**Depends on**: Phase 93
**Requirements**: CHAT-03, STREAM-03
**Success Criteria** (what must be TRUE):
  1. A "Stop" button appears during active streaming that sends chat.abort to cancel the response
  2. After abort, the partial response received so far is preserved and displayed in the thread
  3. If the gateway connection drops mid-stream, tokens received so far are kept in the UI
  4. After a mid-stream disconnect, the app attempts reconnection and the user can continue the conversation
**Plans**: 2 plans
Plans:
- [ ] 91-01-PLAN.md — Backend route + types + hook + tests (data layer)
- [ ] 91-02-PLAN.md — SessionCard, SessionList, SessionsPage UI rewrite
**UI hint**: yes

### Phase 98: Real-time Session List Updates
**Goal**: The session list stays current without manual refresh as new sessions are created and messages arrive
**Depends on**: Phase 91, Phase 93
**Requirements**: SESS-06
**Success Criteria** (what must be TRUE):
  1. When a new session is created (by sending the first message), it appears in the session list without refresh
  2. When a message arrives in any session, that session's last activity timestamp and message count update live
  3. The currently selected session remains selected and stable when other sessions update
  4. SSE "chat" events from the gateway trigger the session list updates (no polling)
**Plans**: 2 plans
Plans:
- [ ] 91-01-PLAN.md — Backend route + types + hook + tests (data layer)
- [ ] 91-02-PLAN.md — SessionCard, SessionList, SessionsPage UI rewrite
**UI hint**: yes

## Progress

**Execution Order:** Groups execute in order: AE -> AF -> AG/AH (parallel) -> AI. Phases within a group can run in parallel where dependencies allow.

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 91. Session List | v0.0.6 | 0/2 | Complete    | 2026-03-25 |
| 92. Chat History Display | v0.0.6 | 0/0 | Not started | - |
| 93. Chat Send with Token Streaming | v0.0.6 | 0/0 | Not started | - |
| 94. Streaming UX Polish | v0.0.6 | 0/0 | Not started | - |
| 95. Model Picker for New Sessions | v0.0.6 | 0/0 | Not started | - |
| 96. Session Rename, Delete, Compact | v0.0.6 | 0/0 | Not started | - |
| 97. Chat Abort & Stream Resilience | v0.0.6 | 0/0 | Not started | - |
| 98. Real-time Session List Updates | v0.0.6 | 0/0 | Not started | - |
| 75. Protocol v3 Handshake | v0.0.5 | 1/1 | Complete    | 2026-03-24 |
| 76. Reconnect with Backoff | v0.0.5 | 0/1 | Complete    | 2026-03-24 |
| 77. Chat Method Corrections | v0.0.5 | 0/1 | Complete    | 2026-03-24 |
| 78. Agent Method Verification | v0.0.5 | 0/1 | Complete    | 2026-03-24 |
| 79. Cron Method Verification | v0.0.5 | 0/1 | Complete    | 2026-03-24 |
| 80. Models Method Verification | v0.0.5 | 0/1 | Complete    | 2026-03-24 |
| 81. Usage Method Correction | v0.0.5 | 0/1 | Complete    | 2026-03-24 |
| 82. Tools & Skills Method Verification | v0.0.5 | 1/1 | Complete    | 2026-03-24 |
| 83. Activity Events Method Correction | v0.0.5 | 0/1 | Complete    | 2026-03-24 |
| 84. SSE Event Bus Wiring | v0.0.5 | 0/1 | Complete    | 2026-03-24 |
| 85. Agent Event Streaming | v0.0.5 | 0/1 | Complete    | 2026-03-24 |
| 86. Session Event Streaming | v0.0.5 | 1/1 | Complete    | 2026-03-24 |
| 87. Live Agents Tab | v0.0.5 | 0/1 | Complete    | 2026-03-24 |
| 88. Live Crons Tab | v0.0.5 | 0/1 | Complete    | 2026-03-24 |
| 89. Live Usage & Models Tabs | v0.0.5 | 1/1 | Complete    | 2026-03-24 |
| 90. Live Activity Feed | v0.0.5 | 0/1 | Complete    | 2026-03-24 |

---
*Roadmap created: 2026-03-19*
*Last updated: 2026-03-24*
