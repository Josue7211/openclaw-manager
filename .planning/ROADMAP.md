# Roadmap: OpenClaw Manager

## Milestones

- v1.0 -- Publishable release (shipped 2026-03-21) -- [Full details](milestones/v1.0-ROADMAP.md)
- v0.0.2 -- Widget-First Architecture (shipped 2026-03-22)
- v0.0.3 -- AI Ops Center + OpenClaw Controller + Polish

## Phases

### v0.0.3 -- AI Ops Center + OpenClaw Controller + Polish

**Group A: Bug Verification** *(code-reviewed, verified)*
- [x] **Phase 1: Verify Widget Resize Fix** - Confirm widget resize handles work across all widget types *(verified 2026-03-23)*
- [x] **Phase 2: Verify Page Layout Fix** - Confirm full-bleed and scrolling pages work at all viewport sizes *(verified 2026-03-23)*
- [x] **Phase 3: Verify Widget Tab-Switch Fix** - Confirm widgets persist across page/tab navigation *(verified 2026-03-23)*
- [x] **Phase 4: Verify Widget Picker UX Fixes** - Confirm duplicates, animations, preset feedback, delete dialog *(verified 2026-03-23)*

**Group B: Infrastructure**
- [x] **Phase 5: Set CI Bundle Budget** - CI check failing if any chunk >400KB or total >5MB *(completed 2026-03-22)*

**Group C: Theme Blend**
- [x] **Phase 6: Theme Blend -- OKLCH Helpers** - Color interpolation utilities with unit tests *(completed 2026-03-22)*
- [x] **Phase 7: Theme Blend -- Interpolation Engine** - Working theme interpolation with WCAG contrast enforcement *(completed 2026-03-22)*
- [x] **Phase 8: Theme Blend -- Slider UI + Persistence** - User-facing slider that blends dark/light themes in real-time *(completed 2026-03-22)*

**Group D: OpenClaw Controller**
- [x] **Phase 9: OpenClaw Gateway Proxy Helper** - Reusable proxy function with credential protection and error sanitization *(completed 2026-03-22)*
- [x] **Phase 10: OpenClaw Agent Management** - Beautiful agents tab with right-panel settings editor (note-style) *(completed 2026-03-22)*
- [x] **Phase 11: OpenClaw Agent Calendar** - Cron schedules displayed as a calendar view under agents *(completed 2026-03-22)*
- [x] **Phase 12: OpenClaw Usage + Models + Controller Page** - Usage dashboard, model listing, tool registry, unified page shell *(completed 2026-03-22)*

**Group E: Terminal**
- [x] **Phase 13: Terminal PTY Backend** - portable-pty + WebSocket relay + process group cleanup *(completed 2026-03-23)*
- [x] **Phase 14: Terminal Frontend (xterm.js)** - Terminal component with resize, copy/paste, scrollback, theme integration *(completed 2026-03-23)*

**Group F: AI Ops Center**
- [x] **Phase 15: Claude Code Session Backend** - Rust backend for spawning/managing Claude Code sessions via SDK/CLI *(completed 2026-03-23)*
- [x] **Phase 16: Session Monitor Frontend** - Live dashboard showing active sessions, their status, output, and controls *(completed 2026-03-23)*
- [x] **Phase 17: Remote VM Viewer** - Embedded noVNC/Moonlight for watching the OpenClaw VM desktop *(completed 2026-03-23)*

**Group G: Integration + Polish**
- [x] **Phase 18: Widget Registry + Sidebar Module Integration** - Register all new features as widgets and sidebar modules *(completed 2026-03-23)*
- [x] **Phase 19: Final Verification + Bundle Audit** - End-to-end verification, bundle audit, contrast check, integration test *(completed 2026-03-23)*

**Group H: Post-Ship Bug Fixes**
- [ ] **Phase 19.1: Post-Ship Bug Fixes** - Fix all broken pages found during manual testing

## Phase Details

### Phase 19.1: Post-Ship Bug Fixes
**Goal**: Fix ALL broken pages and features — every module must work when user logs in
**Depends on**: Phase 19
**Requirements**: Post-ship QA + user-reported issues
**Success Criteria** (what must be TRUE):
  1. No "Executable not found: ffir" error toast on any page
  2. Chat page has NO "Bjorn" tab — Chat IS Bjorn, one tab only
  3. Dashboard shows all default widgets (not just one) in browser mode
  4. OpenClaw Agents tab shows all agents (not empty/loading forever)
  5. OpenClaw Models/Usage/Tools tabs work when configured (no false "not configured")
  6. OpenClaw architecture corrected — services point at Services VM, not OpenClaw VM
  7. Remote Viewer uses Moonlight/Sunshine on OpenClaw VM (not noVNC)
  8. Skills/Marketplace/Plugins either work or are cleanly removed (no broken references)
  9. Models page shows real model data when connected (not just static cards)
  10. No duplicate Agents page — single source of truth for agent management
  11. Every page in the sidebar loads without errors
  12. koel.rs (music streaming route) committed if ready, or removed if not
  13. All navigation works — no 404s, no blank pages, no infinite loaders
**Plans**: TBD

### Phase 1: Verify Widget Resize Fix
**Goal**: Confirmed widget resize works across all widget types in dev and production
**Depends on**: Nothing (first phase)
**Requirements**: MH-01
**Success Criteria** (what must be TRUE):
  1. User can drag any widget resize handle and the widget resizes smoothly
  2. Resize handles are not occluded by other widgets (z-index correct)
  3. Resize works in both development and production builds
**Plans**: TBD

### Phase 2: Verify Page Layout Fix
**Goal**: Confirmed full-bleed and scrolling pages work correctly at all viewport sizes
**Depends on**: Nothing (parallel with Phase 1)
**Requirements**: MH-02
**Success Criteria** (what must be TRUE):
  1. Full-bleed pages (Messages, Settings) fill the entire main area with no gaps
  2. Scrolling pages (Personal, Dashboard) scroll correctly with proper padding
  3. Layout works at viewport widths from 800px to 3840px
**Plans**: TBD

### Phase 3: Verify Widget Tab-Switch Fix
**Goal**: Confirmed widgets persist across page/tab navigation without disappearing
**Depends on**: Nothing (parallel with Phase 1)
**Requirements**: MH-03
**Success Criteria** (what must be TRUE):
  1. User navigates away from Dashboard and back -- all widgets remain
  2. Widget state (expanded/collapsed, scroll position) preserved across navigation
  3. Works across all navigation methods (sidebar click, keyboard shortcut, back button)
**Plans**: TBD

### Phase 4: Verify Widget Picker UX Fixes
**Goal**: Confirmed widget picker works as designed with all recent UX improvements
**Depends on**: Nothing (parallel with Phase 1)
**Requirements**: MH-04
**Success Criteria** (what must be TRUE):
  1. User can add the same widget type multiple times (duplicates allowed)
  2. Widgets animate into place when added
  3. Preset apply shows visual feedback (toast or highlight)
  4. Delete widget shows confirmation dialog before removing
**Plans**: TBD

### Phase 5: Set CI Bundle Budget
**Goal**: CI enforcement preventing bundle size regression before any new packages are added
**Depends on**: Nothing (parallel with Group A)
**Requirements**: MH-20
**Success Criteria** (what must be TRUE):
  1. CI pipeline includes a bundle size check step
  2. Build fails if any single JS chunk exceeds 400KB uncompressed
  3. Build fails if total JS bundle exceeds 5MB uncompressed
**Plans:** 1 plan
Plans:
- [x] 05-01-PLAN.md -- Bundle size check script + CI/pre-commit integration

### Phase 6: Theme Blend -- OKLCH Helpers
**Goal**: Pure color interpolation utility functions ready for the theme blend engine
**Depends on**: Nothing (parallel with other Group C phases)
**Requirements**: MH-09
**Success Criteria** (what must be TRUE):
  1. `hexToOklch()` correctly converts hex colors to OKLCH
  2. `oklchToHex()` correctly converts OKLCH back to hex
  3. `interpolateHexOklch()` blends two hex colors in OKLCH space
  4. Round-trip hex -> OKLCH -> hex produces the same color (within 1 unit tolerance)
  5. Unit tests cover edge cases (black, white, pure colors, transparent)
Plans:
- [x] 06-01-PLAN.md -- OKLCH color utilities with TDD

### Phase 7: Theme Blend -- Interpolation Engine
**Goal**: Working theme interpolation with automatic text color switching and WCAG contrast enforcement
**Depends on**: Phase 6
**Requirements**: MH-10
**Success Criteria** (what must be TRUE):
  1. `interpolateThemes()` blends all Tier 1 CSS variables between dark and light theme values
  2. Accent colors (Tier 2) are NOT blended -- they remain as the user chose
  3. Text color switches from light to dark based on background OKLCH lightness (not slider position)
  4. Every text/background pair meets WCAG AA contrast ratio (4.5:1) at every blend position
**Plans:** 1 plan
Plans:
- [ ] 07-01-PLAN.md -- TDD interpolation engine with WCAG contrast enforcement + applyTheme wiring

### Phase 8: Theme Blend -- Slider UI + Persistence
**Goal**: User-facing slider that blends between dark and light themes in real-time
**Depends on**: Phase 7
**Requirements**: MH-11
**Success Criteria** (what must be TRUE):
  1. Slider appears in Settings > Display with 0% (dark) to 100% (light) range
  2. Dragging the slider updates the theme in real-time (RAF-throttled)
  3. Blend position persists across app restarts (localStorage + Supabase sync)
  4. System theme mode interaction: switching to "System" resets the slider appropriately
**Plans:** 1 plan
Plans:
- [ ] 08-01-PLAN.md -- setBlendPosition store function + Theme Blend slider UI in SettingsDisplay

### Phase 9: OpenClaw Gateway Proxy Helper
**Goal**: Security-critical proxy foundation that all OpenClaw CRUD routes build on
**Depends on**: Nothing (parallel with other Group D phases)
**Requirements**: MH-05
**Success Criteria** (what must be TRUE):
  1. `gateway_forward()` function proxies requests to OPENCLAW_API_URL with API key
  2. Error responses are sanitized -- no API keys, internal paths, or stack traces leak to frontend
  3. All path parameters validated with `validate_uuid()` before URL construction
  4. Returns "OpenClaw API not configured" when OPENCLAW_API_URL is not set
**Plans:** 1 plan
Plans:
- [x] 09-01-PLAN.md -- gateway_forward() proxy + error sanitization + health route + wiring

### Phase 10: OpenClaw Agent Management
**Goal**: Beautiful agents tab with polished cards and a right-side settings panel (note-editor style)
**Depends on**: Phase 9
**Requirements**: MH-06
**Success Criteria** (what must be TRUE):
  1. Agents tab shows agent cards in a polished grid/list layout
  2. Clicking an agent's settings opens a right-side detail panel (like notes editor pattern)
  3. Settings panel shows all agent configuration: name, model, role, status, memory
  4. User can start, stop, restart agents from the card or settings panel
  5. User can create new agents and delete existing ones (with confirmation)
  6. UI updates optimistically with rollback on error
**Plans:** 2 plans
Plans:
- [x] 10-01-PLAN.md -- Backend POST/DELETE/lifecycle endpoints + Agent type update
- [x] 10-02-PLAN.md -- useAgents hook + split-pane page layout + detail panel + confirmation dialog

### Phase 11: OpenClaw Agent Calendar
**Goal**: Cron CRUD with schedule presets, toggle, and delete -- wired into existing calendar page
**Depends on**: Phase 9
**Requirements**: MH-07
**Success Criteria** (what must be TRUE):
  1. Calendar view shows cron job schedules visually (week/month view)
  2. User can create a cron job with a schedule picked from the calendar UI
  3. User can toggle a cron job enabled/disabled
  4. User can click a calendar entry to edit its command and schedule
  5. User can delete a cron job (with confirmation)
**Plans:** 2 plans
Plans:
- [ ] 11-01-PLAN.md -- Backend crons.rs CRUD routes + useCrons hook + query key
- [ ] 11-02-PLAN.md -- CronFormModal + JobList enhancements + CronJobs page wiring + clickable calendar

### Phase 12: OpenClaw Usage + Models + Controller Page
**Goal**: Unified OpenClaw page with tabs for all management features plus read-only dashboards
**Depends on**: Phases 10, 11
**Requirements**: MH-08
**Success Criteria** (what must be TRUE):
  1. OpenClawPage.tsx has tab navigation: Agents, Crons, Usage, Models, Tools
  2. Usage tab shows token counts, cost, and model usage with chart widgets
  3. Models tab lists available models with configuration details
  4. Tools tab shows the tool registry
  5. Page polls at 30s minimum, only when the page is active
**Plans:** 2 plans
Plans:
- [x] 12-01-PLAN.md -- Backend proxy routes (usage/models/tools) + frontend types + hooks + query keys
- [ ] 12-02-PLAN.md -- OpenClawPage tab shell + Usage/Models/Tools tab components + route/nav/module wiring

### Phase 13: Terminal PTY Backend
**Goal**: Secure PTY spawning with WebSocket relay and robust process lifecycle management
**Depends on**: Nothing (can start after Group A)
**Requirements**: MH-21
**Research**: YES -- portable-pty API, PTY process group management cross-platform
**Success Criteria** (what must be TRUE):
  1. `/api/terminal/ws` WebSocket endpoint spawns a PTY with the user's default shell
  2. Max 3 concurrent PTY sessions enforced via CAS guard
  3. Opening and closing 100 terminals leaves zero orphaned processes (process group kill)
  4. PTY environment is sanitized: no `MC_*`, `OPENCLAW_*`, `COUCHDB_*`, `SUPABASE_*` variables
  5. Correct shell detected per platform (bash/zsh on Linux/macOS, PowerShell on Windows)
**Plans:** 1 plan
Plans:
- [x] 13-01-PLAN.md -- portable-pty dependency + terminal.rs (CAS guard, env sanitization, PTY relay, process group cleanup) + route registration

### Phase 14: Terminal Frontend (xterm.js)
**Goal**: Working terminal component integrated with the app's theme and widget system
**Depends on**: Phase 13
**Requirements**: MH-22
**Success Criteria** (what must be TRUE):
  1. Terminal renders in a widget with full ANSI color support
  2. Terminal resizes correctly when widget is resized (fit addon + ResizeObserver)
  3. Copy/paste works (Ctrl+Shift+C/V, not Ctrl+C which is SIGINT)
  4. Scrollback buffer allows scrolling through previous output
  5. Terminal font uses the app's monospace CSS variable
**Plans:** 2 plans
Plans:
- [ ] 14-01-PLAN.md -- xterm.js packages + theme utility + useTerminal hook + TerminalWidget + widget registration
- [ ] 14-02-PLAN.md -- Gap closure: terminal capacity pre-flight check + status endpoint

### Phase 15: Claude Code Session Backend
**Goal**: Rust backend for monitoring and controlling Gunther (Claude Code) sessions running on the OpenClaw VM
**Depends on**: Phase 9 (reuses OpenClaw gateway proxy)
**Requirements**: MH-25
**Research**: YES -- OpenClaw session management API, Gunther session lifecycle, output streaming
**Success Criteria** (what must be TRUE):
  1. `/api/claude-sessions` REST endpoints proxy to OpenClaw VM session management (list, get, create, kill)
  2. `/api/claude-sessions/:id/ws` WebSocket endpoint streams live Gunther session output from OpenClaw VM
  3. Session metadata surfaced: task description, status (running/paused/completed/failed), duration, model, working directory
  4. Create endpoint can dispatch new tasks to Gunther via OpenClaw API
  5. Kill endpoint gracefully terminates sessions on the remote VM
  6. All requests proxied through gateway_forward() with credential protection
**Plans:** 1 plan
Plans:
- [ ] 15-01-PLAN.md -- REST CRUD handlers + WebSocket relay for Claude Code sessions via gateway proxy

### Phase 16: Session Monitor Frontend
**Goal**: Live dashboard showing all active Claude Code sessions with real-time status and output
**Depends on**: Phase 15
**Requirements**: MH-26
**Success Criteria** (what must be TRUE):
  1. Sessions page shows all active/recent Claude Code sessions in a list/grid
  2. Each session card shows: task description, status (running/paused/completed/failed), duration, model
  3. Clicking a session opens a live terminal-style output viewer (reuses xterm.js from Phase 14)
  4. User can spawn a new session with a task prompt and optional working directory
  5. User can pause, resume, or kill a running session
  6. Session list auto-updates via WebSocket (no polling)
**Plans:** 2 plans
Plans:
- [ ] 16-01-PLAN.md -- Session types + query keys + module registration + useSessionOutput hook
- [ ] 16-02-PLAN.md -- SessionsPage split-pane + SessionCard + SessionList + NewSessionForm + SessionOutputPanel + route registration

### Phase 17: Remote VM Viewer
**Goal**: Embedded remote desktop viewer for watching the OpenClaw VM directly in the app
**Depends on**: Nothing (parallel with Group F)
**Requirements**: MH-27
**Research**: YES -- noVNC WebSocket proxy, Moonlight/Sunshine protocol, Tailscale connectivity
**Success Criteria** (what must be TRUE):
  1. VNC viewer component renders the OpenClaw VM desktop in an app panel/widget
  2. Connects via Tailscale IP to a VNC server (TigerVNC/x11vnc) on the VM
  3. WebSocket proxy in Axum relays VNC traffic (no direct browser-to-VM connection)
  4. Viewer supports: mouse input, keyboard input, clipboard sync, scaling
  5. Connection status indicator shows connected/disconnected/reconnecting
  6. Optional Moonlight/Sunshine integration for low-latency GPU-accelerated streaming
**Plans:** 2 plans
Plans:
- [ ] 17-01-PLAN.md -- VNC WebSocket-to-TCP proxy backend + useVnc hook + noVNC install + module registration
- [ ] 17-02-PLAN.md -- RemotePage full-bleed layout + VncViewer canvas + VncToolbar controls + route registration

### Phase 18: Widget Registry + Sidebar Module Integration
**Goal**: All new features accessible from sidebar navigation and widget picker
**Depends on**: Phases 12, 14, 16, 17
**Requirements**: MH-23
**Success Criteria** (what must be TRUE):
  1. Terminal widget appears in Widget Picker under a "Developer" category
  2. Session Monitor widget appears in Widget Picker under "AI Ops"
  3. VNC Viewer widget appears in Widget Picker under "AI Ops"
  4. OpenClaw page accessible from sidebar with `requiresConfig` warning when unconfigured
  5. Sessions page accessible from sidebar
  6. All new widgets are lazy-loaded via React.lazy
**Plans**: TBD

### Phase 19: Final Verification + Bundle Audit
**Goal**: Verified v0.0.3 release candidate with no regressions
**Depends on**: All previous phases
**Requirements**: MH-24
**Success Criteria** (what must be TRUE):
  1. All features work together without conflicts
  2. Bundle stays under 5MB (CI budget passes)
  3. Theme slider produces readable text at every position (automated WCAG check)
  4. No regressions in existing tests (frontend + Rust + E2E)
  5. Claude Code session management works end-to-end
  6. VNC viewer connects and renders the VM desktop
**Plans**: TBD

## Progress

**Execution Order:** Phases within a group can run in parallel. Groups execute in order: A -> B -> C -> D -> E -> F -> G.

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Verify Widget Resize Fix | v0.0.3 | 0/? | Not started | - |
| 2. Verify Page Layout Fix | v0.0.3 | 0/? | Not started | - |
| 3. Verify Widget Tab-Switch Fix | v0.0.3 | 0/? | Not started | - |
| 4. Verify Widget Picker UX Fixes | v0.0.3 | 0/? | Not started | - |
| 5. Set CI Bundle Budget | v0.0.3 | 1/1 | Complete | 2026-03-22 |
| 6. Theme Blend -- OKLCH Helpers | v0.0.3 | 1/1 | Complete | 2026-03-22 |
| 7. Theme Blend -- Interpolation Engine | v0.0.3 | 0/1 | Not started | - |
| 8. Theme Blend -- Slider UI + Persistence | v0.0.3 | 0/1 | Not started | - |
| 9. OpenClaw Gateway Proxy Helper | v0.0.3 | 1/1 | Complete | 2026-03-22 |
| 10. OpenClaw Agent CRUD | v0.0.3 | 2/2 | Complete    | 2026-03-22 |
| 11. OpenClaw Cron CRUD | v0.0.3 | 0/2 | Complete    | 2026-03-22 |
| 12. OpenClaw Usage + Models + Controller Page | v0.0.3 | 1/2 | Complete    | 2026-03-22 |
| 13. Terminal PTY Backend | v0.0.3 | 1/1 | Complete    | 2026-03-23 |
| 14. Terminal Frontend (xterm.js) | v0.0.3 | 1/2 | Complete    | 2026-03-23 |
| 15. Claude Code Session Backend | v0.0.3 | 0/1 | Complete    | 2026-03-23 |
| 16. Session Monitor Frontend | v0.0.3 | 0/2 | Complete    | 2026-03-23 |
| 17. Remote VM Viewer | v0.0.3 | 1/2 | Complete    | 2026-03-23 |
| 18. Widget Registry + Sidebar Integration | v0.0.3 | 0/? | Complete    | 2026-03-23 |
| 19. Final Verification + Bundle Audit | v0.0.3 | 0/? | Not started | - |

<details>
<summary>Deferred from v0.0.3 to v0.0.4</summary>

- Supabase Migration for Projects (was Phase 6)
- Install TipTap Packages (was Phase 7)
- Project Tracker Backend + API (was Phase 15)
- Project Tracker Frontend + Kanban Board (was Phase 16)
- TipTap Markdown Roundtrip Test Suite (was Phase 17)
- TipTap Custom Extensions (Wikilinks + Image Embeds) (was Phase 18)
- TipTap Editor Migration (was Phase 19)
- TipTap Polish (Slash Commands + Floating Toolbar + Tables) (was Phase 20)
- Remove CodeMirror Packages (was Phase 21)

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

<details>
<summary>v1.0 (Phases 1-8 + 3 decimal insertions) -- SHIPPED 2026-03-21</summary>

- [x] Phase 1: Responsive Layout Shell + Visual Polish (5/5 plans)
- [x] Phase 2: Theming System (7/7 plans)
- [x] Phase 2.1: Theme Settings Page Polish + System Mode Fix (4/4 plans)
- [x] Phase 2.2: Theme System Mode Fixes (2/2 plans)
- [x] Phase 3: Setup Wizard + Onboarding (7/7 plans)
- [x] Phase 4: Dashboard Grid + Widget System (6/6 plans)
- [x] Phase 4.1: Wallbash GTK System Mode Integration Fix (2/2 plans)
- [x] Phase 5: Page Experience (3/3 plans)
- [x] Phase 6: Module Primitives Library (7/7 plans)
- [x] Phase 7: Bjorn Module Builder (7/7 plans)
- [x] Phase 8: Data Export (2/2 plans)

**Total:** 11 phases, 52 plans, 92 requirements -- all complete

</details>

---
*Roadmap created: 2026-03-19*
*Last updated: 2026-03-23*
