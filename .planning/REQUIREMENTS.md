# Requirements: v0.0.3 -- AI Ops Center + OpenClaw Controller + Polish

**Created:** 2026-03-22
**Updated:** 2026-03-22
**Source:** Research (SUMMARY.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md) + user vision session

## Must-Have (MH)

### MH-01: Verify Widget Resize Fix
The z-index fix for widget resize handles applied in v0.0.2 must be verified working across all widget types in both dev and production builds. Drag-resize must work on every registered widget.
**Success:** User can drag any widget resize handle and the widget resizes smoothly without z-index occlusion.

### MH-02: Verify Page Layout Fix
Pages filling screen width was fixed in v0.0.2. Verify full-bleed pages (Messages, Settings) and scrolling pages (Personal, Dashboard) work correctly at all viewport sizes.
**Success:** Every page fills its available width; no horizontal gaps or overflow. Scrolling pages scroll correctly.

### MH-03: Verify Widget Tab-Switch Fix
Widget disappearance on tab/page switch was fixed via memo dependency corrections. Verify widgets persist across all navigation paths.
**Success:** User navigates away from Dashboard and back; all widgets remain in place with correct state.

### MH-04: Verify Widget Picker UX Fixes
Widget picker changes (duplicates allowed, entry animations, preset feedback, delete confirmation dialog) must be verified end-to-end.
**Success:** User can add duplicate widgets, sees animations on add, gets visual feedback on preset apply, and sees a confirmation dialog before deleting widgets.

### MH-05: OpenClaw Gateway Proxy Helper
Build the `gateway_forward()` helper in `gateway.rs` with credential protection, error sanitization, and input validation. All OpenClaw CRUD routes depend on this.
**Success:** A single reusable function proxies requests to the OpenClaw gateway. Error responses never contain API keys, internal paths, or stack traces. All path parameters are validated.

### MH-06: OpenClaw Agent CRUD
Full create/update/delete for agents plus lifecycle controls (start, stop, restart). Proxied through the gateway helper.
**Success:** User can create a new agent, edit its name/model/role, start/stop it, and delete it from the OpenClaw Controller page. Optimistic UI updates with rollback on error.

### MH-07: OpenClaw Cron CRUD
Full create/update/delete for cron jobs with a human-readable schedule editor and enable/disable toggle.
**Success:** User can create a cron job with a schedule picked from a UI (not raw crontab syntax), toggle it on/off, edit its command, and delete it.

### MH-08: OpenClaw Usage + Models + Controller Page
Read-only usage dashboard (token counts, cost, model usage), model listing, tool registry, and the unified OpenClawPage.tsx shell with tab navigation.
**Success:** User navigates to the OpenClaw page and sees tabs for Agents, Crons, Usage, Models, and Tools. Usage data displays with charts. Page only polls when active (30s minimum interval).

### MH-09: Theme Blend OKLCH Helpers
Add `hexToOklch()`, `oklchToHex()`, and `interpolateHexOklch()` utility functions to the theme system. Pure functions with unit tests.
**Success:** Unit tests pass for color conversions. Round-trip hex -> OKLCH -> hex produces the same color (within rounding tolerance).

### MH-10: Theme Blend Interpolation Engine
Add `interpolateThemes()` to theme-engine.ts. Text color switches based on background lightness (not slider position). WCAG AA contrast enforced at every position.
**Success:** Programmatically setting blendPosition produces correctly interpolated CSS variables. Text remains readable (WCAG AA 4.5:1) at every slider position including mid-range.

### MH-11: Theme Blend Slider UI + Persistence
Add slider to SettingsDisplay.tsx with real-time preview. Blend position persisted in ThemeState (localStorage + Supabase sync).
**Success:** User drags a slider from dark to light and sees the theme blend in real-time. Position survives app restart. System theme mode interaction works correctly.

### MH-20: CI Bundle Budget
Add a CI check that fails if any JS chunk exceeds 400KB or total bundle exceeds 5MB uncompressed.
**Success:** CI pipeline includes a bundle size check. A PR that adds a 500KB chunk fails CI.

### MH-21: Terminal PTY Backend
Build terminal.rs with portable-pty for local PTY spawning, WebSocket relay, CAS connection guard (max 3 sessions), process group cleanup.
**Success:** `/api/terminal/ws` WebSocket endpoint spawns a PTY. Opening and closing 100 terminals leaves zero orphaned processes. Environment is sanitized (no `MC_*` or `OPENCLAW_*` vars in PTY).

### MH-22: Terminal Frontend (xterm.js)
xterm.js component with WebSocket connection, fit addon for resize, theme integration, copy/paste, scrollback.
**Success:** User opens a terminal widget and gets a working shell. Terminal resizes when the widget resizes. Copy/paste works (Ctrl+Shift+C/V). Colors match the current theme.

### MH-23: Widget Registry + Sidebar Module Integration
Register Terminal, Session Monitor, and VNC Viewer as widgets. Add OpenClaw, Sessions, and VM Viewer to sidebar modules. Wire Settings connections for OpenClaw.
**Success:** Terminal, Session Monitor, and VNC widgets appear in Widget Picker. OpenClaw, Sessions pages are accessible from sidebar. OpenClaw module shows `requiresConfig` warning when API URL is not set.

### MH-24: Final Verification + Bundle Audit
End-to-end verification of all features together. Bundle size audit. Theme slider contrast check across all positions. Cross-feature integration test.
**Success:** All features work together without conflicts. Bundle stays under 5MB. Theme slider produces readable text at every position. No regressions in existing features.

### MH-25: Claude Code Session Backend
Rust backend for monitoring and controlling Gunther (Claude Code) sessions on the OpenClaw VM. Proxies to OpenClaw's session management API via gateway_forward(). WebSocket relay for real-time session output streaming. Session lifecycle management (list, get, create, kill). Gunther is already part of the architecture — this surfaces existing sessions in the MC UI.
**Success:** User can see all active Gunther sessions, dispatch new tasks, and stream live output. Sessions proxied through the OpenClaw gateway with credential protection.

### MH-26: Session Monitor Frontend
Live dashboard showing all active Claude Code sessions with real-time status. Each session shows: task description, status (running/paused/completed/failed), duration, model. Live terminal-style output viewer per session (reuses xterm.js). Session controls: spawn, pause, resume, kill.
**Success:** User can see all active sessions, click into one to view its live output, spawn new sessions, and manage lifecycle from the UI. Auto-updates via WebSocket.

### MH-27: Remote VM Viewer
Embedded remote desktop viewer for watching the OpenClaw VM. noVNC WebSocket proxy in Axum relays VNC traffic. Supports mouse/keyboard input, clipboard sync, and scaling. Optional Moonlight/Sunshine integration for low-latency GPU-accelerated streaming.
**Success:** User can view the OpenClaw VM desktop directly in the app without switching to a separate VNC client. Connects via Tailscale.

## Should-Have (SH)

### SH-01: Agent Memory Browser
View, edit, and clear agent RAG memory context from the OpenClaw Controller page.
**Success:** User selects an agent and sees its memory entries. User can add, edit, or clear memory entries.

## Nice-to-Have (NH)

### NH-01: Full-Text Note Search
Search inside note content, not just titles. Backend endpoint over CouchDB content with relevance ranking.
**Success:** User types a search query and sees notes ranked by content relevance, with matching snippets highlighted.

### NH-02: Version History
View revision history for a note using CouchDB revisions. Diff view showing changes between versions.
**Success:** User opens a note's history and sees a list of revisions with timestamps. Selecting two revisions shows a diff.

## Deferred to v0.0.4

### Project Tracker (MH-12, MH-13, MH-14)
- Supabase migration for projects, project_columns, project_items tables
- Backend API for project CRUD (boards, columns, items, drag reorder)
- Frontend kanban board with drag-and-drop and Realtime sync

### TipTap Editor (SH-04, MH-15, MH-16, MH-17, MH-18, MH-19)
- Install TipTap packages + Vite chunk config
- Markdown roundtrip test suite (safety gate)
- Custom extensions (wikilinks, image embeds)
- Editor migration (CodeMirror -> TipTap)
- Polish (slash commands, floating toolbar, tables)
- Remove CodeMirror packages

### Advanced Notes (SH-02, SH-03)
- Note templates (meeting notes, daily journal, retro)
- Extended slash commands (/callout, /embed, /image, /task-list)

## Out of Scope (v0.0.3)

- Real-time collaboration on notes (Yjs + Hocuspocus -- massive scope, defer to v0.0.4+)
- Obsidian plugin compatibility (different paradigm)
- Full SSH client / multi-gateway support (scope creep)
- Agent code editor (security risk, remote file sync complexity)
- Gantt charts, sprints, time tracking on kanban cards
- Terminal multiplexer (tmux-like splits)

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| MH-01 | Phase 1 | Pending |
| MH-02 | Phase 2 | Pending |
| MH-03 | Phase 3 | Pending |
| MH-04 | Phase 4 | Pending |
| MH-05 | Phase 9 | Pending |
| MH-06 | Phase 10 | Pending |
| MH-07 | Phase 11 | Pending |
| MH-08 | Phase 12 | Pending |
| MH-09 | Phase 6 | Complete |
| MH-10 | Phase 7 | Complete |
| MH-11 | Phase 8 | Complete |
| MH-20 | Phase 5 | Complete |
| MH-21 | Phase 13 | Pending |
| MH-22 | Phase 14 | Pending |
| MH-23 | Phase 18 | Pending |
| MH-24 | Phase 19 | Pending |
| MH-25 | Phase 15 | Pending |
| MH-26 | Phase 16 | Pending |
| MH-27 | Phase 17 | Pending |
| SH-01 | Phase 12 | Pending |

## Success Criteria (Milestone-Level)

1. All v0.0.2 bug fixes verified working in production builds
2. Full OpenClaw gateway CRUD (agents, crons, usage) accessible from a dedicated controller page
3. Theme blend slider produces readable themes at every position using OKLCH interpolation
4. Embedded terminal widget with local PTY and secure process management
5. Claude Code session management: spawn, monitor, and control AI coding sessions from the app
6. Remote VM viewer: watch the OpenClaw VM desktop directly in the app
7. Bundle stays under 5MB with CI enforcement
8. All existing tests pass, no regressions
