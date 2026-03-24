# Roadmap: OpenClaw Manager

## Milestones

- v1.0 -- Publishable release (shipped 2026-03-21) -- [Full details](milestones/v1.0-ROADMAP.md)
- v0.0.2 -- Widget-First Architecture (shipped 2026-03-22)
- v0.0.3 -- AI Ops Center + OpenClaw Controller + Polish (shipped 2026-03-24)
- v0.0.4 -- Stabilize & Strip (shipped 2026-03-24) -- [Full details](milestones/v0.0.4-ROADMAP.md)
- v0.0.5 -- Gateway Protocol v3 (in progress)

## Phases

### v0.0.5 -- Gateway Protocol v3

**Group AA: Gateway Handshake** *(foundation -- everything else depends on correct connection)*
- [x] **Phase 75: Protocol v3 Handshake** - Connect to gateway using protocol v3 with role, scopes, client metadata, and device identity (completed 2026-03-24)
- [x] **Phase 76: Reconnect with Backoff** - Automatic WebSocket reconnection with exponential backoff on disconnect

**Group AB: RPC Method Corrections** *(fix all wrong method names so backend calls real gateway methods)*
- [ ] **Phase 77: Chat Method Corrections** - Fix sessions.history -> chat.history and sessions.create -> chat.send
- [ ] **Phase 78: Agent Method Verification** - Verify agents.list params and agents CRUD method signatures match protocol
- [ ] **Phase 79: Cron Method Verification** - Verify cron CRUD method signatures (cron.list/add/update/remove vs crons.*)
- [ ] **Phase 80: Models Method Verification** - Verify models.list response shape matches protocol
- [ ] **Phase 81: Usage Method Correction** - Fix usage.summary -> usage.status/usage.cost with correct params
- [ ] **Phase 82: Tools & Skills Method Verification** - Verify tools.list and skills.list method names and response shapes
- [x] **Phase 83: Activity Events Method Correction** - Fix activity.recent to use logs.tail via WS RPC

**Group AC: Event Bus Wiring** *(SSE event bus connected to real gateway WebSocket events)*
- [ ] **Phase 84: SSE Event Bus Wiring** - Wire SSE event bus to actual gateway WebSocket events instead of mock data
- [ ] **Phase 85: Agent Event Streaming** - Surface real-time agent.* events from gateway via SSE
- [ ] **Phase 86: Session Event Streaming** - Surface session created/completed/error events via SSE

**Group AD: Live Data Verification** *(verify every OpenClaw tab with real gateway data)*
- [ ] **Phase 87: Live Agents Tab** - Verify agents tab shows real agents with working CRUD against live gateway
- [ ] **Phase 88: Live Crons Tab** - Verify crons tab shows real scheduled tasks with working CRUD against live gateway
- [ ] **Phase 89: Live Usage & Models Tabs** - Verify usage and models tabs show real data from gateway
- [ ] **Phase 90: Live Activity Feed** - Verify activity feed shows real events from gateway

## Phase Details

### Phase 75: Protocol v3 Handshake
**Goal**: App connects to the OpenClaw gateway using the real protocol v3 handshake with proper identity
**Depends on**: Nothing (first phase -- foundation for all gateway work)
**Requirements**: GW-01, GW-02
**Success Criteria** (what must be TRUE):
  1. Connect message includes minProtocol/maxProtocol 3, role "operator", scopes array, and client metadata object
  2. Device identity (device_id, platform, app_version) is sent in the handshake params
  3. Gateway responds with ok:true and the app transitions to connected state
  4. Settings > Connections shows gateway as "Connected (protocol v3)"
**Plans**: 1 plan
Plans:
- [x] 75-01-PLAN.md -- Protocol v3 handshake + error parsing + frontend display

### Phase 76: Reconnect with Backoff
**Goal**: Gateway connection recovers automatically after network disruptions without user intervention
**Depends on**: Phase 75
**Requirements**: GW-03
**Success Criteria** (what must be TRUE):
  1. When gateway WebSocket disconnects, the app attempts reconnection automatically
  2. Reconnect uses exponential backoff (e.g. 1s, 2s, 4s, 8s, max 30s)
  3. After reconnection, the gateway status indicator returns to "Connected" without page refresh
  4. Multiple rapid disconnects do not spawn duplicate WebSocket connections
**Plans**: 1 plan
Plans:
- [ ] 76-01-PLAN.md -- Exponential backoff reconnection + Reconnecting state + frontend status

### Phase 77: Chat Method Corrections
**Goal**: Chat/session RPC calls use the correct gateway method names so messages actually reach agents
**Depends on**: Phase 75
**Requirements**: RPC-01, RPC-02
**Success Criteria** (what must be TRUE):
  1. Fetching session history calls `chat.history` (not `sessions.history`) with sessionKey param
  2. Sending a message calls `chat.send` with { sessionKey, message, deliver, idempotencyKey } params
  3. Both calls return successful responses from the live gateway (not 404 or method-not-found errors)
**Plans**: 1 plan
Plans:
- [ ] 77-01-PLAN.md -- Fix chat.history and chat.send RPC method names and params

### Phase 78: Agent Method Verification
**Goal**: Agent CRUD operations use verified protocol v3 method signatures
**Depends on**: Phase 75
**Requirements**: RPC-03, RPC-04
**Success Criteria** (what must be TRUE):
  1. `agents.list` call uses correct params and the response shape matches what the frontend expects
  2. `agents.create`, `agents.update`, `agents.delete` use correct method names and param shapes per protocol
  3. All four agent RPC calls succeed against the live gateway without method-not-found errors
**Plans**: 1 plan
Plans:
- [ ] 78-01-PLAN.md -- Gateway agent CRUD proxy routes (agents.list/create/update/delete)

### Phase 79: Cron Method Verification
**Goal**: Cron CRUD operations use verified protocol v3 method names (cron.* not crons.*)
**Depends on**: Phase 75
**Requirements**: RPC-05
**Success Criteria** (what must be TRUE):
  1. Cron listing calls `cron.list` (not `crons.list`) and parses the response correctly
  2. Cron create calls `cron.add` (not `crons.create`), update calls `cron.update`, delete calls `cron.remove`
  3. All cron RPC calls succeed against the live gateway
**Plans**: 1 plan
Plans:
- [ ] 79-01-PLAN.md -- Rewrite cron CRUD to use gateway WS RPC (cron.list/add/update/remove)

### Phase 80: Models Method Verification
**Goal**: Models listing uses verified method name and the frontend correctly renders the response shape
**Depends on**: Phase 75
**Requirements**: RPC-06
**Success Criteria** (what must be TRUE):
  1. `models.list` call succeeds against the live gateway
  2. The response shape (model names, providers, capabilities) is correctly parsed by the frontend
  3. Models tab renders real model data without "undefined" or missing fields
**Plans**: 1 plan
Plans:
- [ ] 80-01-PLAN.md -- Gateway WS models.list route (replace HTTP proxy)

### Phase 81: Usage Method Correction
**Goal**: Usage data is fetched with the correct method names so token/cost tracking shows real numbers
**Depends on**: Phase 75
**Requirements**: RPC-07
**Success Criteria** (what must be TRUE):
  1. Usage data calls `usage.status` and/or `usage.cost` (not `usage.summary`)
  2. The response shape (token counts, cost breakdowns) is correctly parsed by the frontend
  3. Usage tab shows non-zero real data from the live gateway
**Plans**: 1 plan
Plans:
- [ ] 81-01-PLAN.md -- Gateway WS usage.status and usage.cost routes (replace HTTP proxy)

### Phase 82: Tools & Skills Method Verification
**Goal**: Tools and skills listings use verified method names and response shapes
**Depends on**: Phase 75
**Requirements**: RPC-08
**Success Criteria** (what must be TRUE):
  1. Tools listing calls the correct gateway method and parses the response
  2. Skills listing calls `skills.status` or `skills.bins` (verified correct method) and parses the response
  3. Both tabs render real data from the live gateway without "undefined" or empty states when data exists
**Plans**: 1 plan
Plans:
- [ ] 82-01-PLAN.md -- Gateway WS skills.status and skills.bins routes (replace HTTP proxies)

### Phase 83: Activity Events Method Correction
**Goal**: Activity data uses the correct gateway method or subscription pattern instead of the nonexistent activity.recent
**Depends on**: Phase 75
**Requirements**: RPC-09
**Success Criteria** (what must be TRUE):
  1. The code no longer calls `activity.recent` (this method does not exist in the protocol)
  2. Activity data is sourced from a real gateway method (events.list, logs.tail, or event subscription)
  3. The activity data structure matches what the frontend activity feed component expects
**Plans**: 1 plan
Plans:
- [x] 83-01-PLAN.md -- Replace activity.recent with logs.tail in gateway_activity handler

### Phase 84: SSE Event Bus Wiring
**Goal**: The SSE event bus delivers real gateway WebSocket events to the frontend instead of mock/assumed data
**Depends on**: Phase 75, Phase 76
**Requirements**: EVT-01
**Success Criteria** (what must be TRUE):
  1. Gateway WebSocket events (17 event types from protocol v3) are forwarded through the SSE event bus
  2. Event names in SSE match the actual gateway event names (agent, chat, presence, cron, etc.)
  3. Frontend event listeners receive events with correct payload shapes matching gateway protocol
  4. SSE connection stays alive and delivers events in real-time (< 1s latency from gateway event to frontend)
**Plans**: TBD

### Phase 85: Agent Event Streaming
**Goal**: Real-time agent status changes appear in the UI without polling
**Depends on**: Phase 84
**Requirements**: EVT-02
**Success Criteria** (what must be TRUE):
  1. When an agent starts/stops/errors on the gateway, the frontend receives the `agent` event via SSE
  2. Agent status indicators update in real-time on the Agents tab
  3. Agent status changes appear in the activity feed without page refresh
**Plans**: TBD

### Phase 86: Session Event Streaming
**Goal**: Session lifecycle events (created, completed, error) appear in the UI in real-time
**Depends on**: Phase 84
**Requirements**: EVT-03
**Success Criteria** (what must be TRUE):
  1. When a session is created/completed/errors on the gateway, the frontend receives the `chat` event via SSE
  2. Session status updates appear in the Sessions tab without polling
  3. Session completion/error events trigger notification if the user has notifications enabled
**Plans**: TBD

### Phase 87: Live Agents Tab
**Goal**: The Agents tab is fully functional against the live gateway with real agent data
**Depends on**: Phase 78, Phase 85
**Requirements**: LIVE-01
**Success Criteria** (what must be TRUE):
  1. Agents tab lists all agents from the live gateway (main, fast-agent, standard-agent, etc.)
  2. Creating a new agent via the UI results in a real agent on the gateway
  3. Editing an agent's config via the UI persists the change on the gateway
  4. Deleting an agent via the UI removes it from the gateway
  5. Agent status indicators reflect real-time state from gateway events
**Plans**: TBD
**UI hint**: yes

### Phase 88: Live Crons Tab
**Goal**: The Crons tab is fully functional against the live gateway with real scheduled task data
**Depends on**: Phase 79, Phase 85
**Requirements**: LIVE-02
**Success Criteria** (what must be TRUE):
  1. Crons tab lists all cron jobs from the live gateway
  2. Creating a new cron job via the UI results in a real scheduled task on the gateway
  3. Editing/toggling a cron job via the UI persists the change on the gateway
  4. Deleting a cron job via the UI removes it from the gateway
**Plans**: TBD
**UI hint**: yes

### Phase 89: Live Usage & Models Tabs
**Goal**: Usage and Models tabs display real data from the live gateway
**Depends on**: Phase 80, Phase 81
**Requirements**: LIVE-03, LIVE-04
**Success Criteria** (what must be TRUE):
  1. Usage tab shows real token counts and cost data from the gateway
  2. Usage charts render with actual historical data (not zeros or placeholders)
  3. Models tab shows all available models from the gateway with correct provider labels
  4. Model capabilities and context windows display correctly
**Plans**: TBD
**UI hint**: yes

### Phase 90: Live Activity Feed
**Goal**: The activity feed shows real events from the gateway, completing the live data verification
**Depends on**: Phase 83, Phase 84, Phase 85, Phase 86
**Requirements**: LIVE-05
**Success Criteria** (what must be TRUE):
  1. Activity feed widget displays real events sourced from the gateway
  2. Events include agent actions, session completions, cron runs, and system events
  3. New events appear in real-time via SSE without page refresh
  4. Event timestamps and details match what the gateway reports
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:** Groups execute in order: AA -> AB -> AC -> AD. Phases within a group can run in parallel where dependencies allow.

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 75. Protocol v3 Handshake | v0.0.5 | 1/1 | Complete    | 2026-03-24 |
| 76. Reconnect with Backoff | v0.0.5 | 0/1 | Complete    | 2026-03-24 |
| 77. Chat Method Corrections | v0.0.5 | 0/1 | Complete    | 2026-03-24 |
| 78. Agent Method Verification | v0.0.5 | 0/1 | Complete    | 2026-03-24 |
| 79. Cron Method Verification | v0.0.5 | 0/1 | Complete    | 2026-03-24 |
| 80. Models Method Verification | v0.0.5 | 0/1 | Planned    |  |
| 81. Usage Method Correction | v0.0.5 | 0/1 | Not started | - |
| 82. Tools & Skills Method Verification | v0.0.5 | 0/1 | Not started | - |
| 83. Activity Events Method Correction | v0.0.5 | 0/1 | Not started | - |
| 84. SSE Event Bus Wiring | v0.0.5 | 0/? | Not started | - |
| 85. Agent Event Streaming | v0.0.5 | 0/? | Not started | - |
| 86. Session Event Streaming | v0.0.5 | 0/? | Not started | - |
| 87. Live Agents Tab | v0.0.5 | 0/? | Not started | - |
| 88. Live Crons Tab | v0.0.5 | 0/? | Not started | - |
| 89. Live Usage & Models Tabs | v0.0.5 | 0/? | Not started | - |
| 90. Live Activity Feed | v0.0.5 | 0/? | Not started | - |

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

---
*Roadmap created: 2026-03-19*
*Last updated: 2026-03-24*
