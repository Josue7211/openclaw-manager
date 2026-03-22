# Requirements: v0.0.3 -- Bug Fixes + OpenClaw Controller + Polish

**Created:** 2026-03-22
**Source:** Research (SUMMARY.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md)

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

### MH-12: Supabase Migration for Projects
Create `projects`, `project_columns`, and `project_items` tables with RLS policies, indexes, and Realtime publication.
**Success:** Migration applies cleanly. Tables have RLS enforcing user isolation. Realtime subscription works for project_items changes.

### MH-13: Project Tracker Backend API
Axum routes for project CRUD: boards, columns, items, drag reorder. Follows the todos.rs pattern with RequireAuth.
**Success:** All `/api/projects/*` endpoints return correct data. Drag reorder updates `position` column. Cascade delete works (deleting a board deletes its columns and items).

### MH-14: Project Tracker Frontend Kanban Board
ProjectsPage.tsx with drag-and-drop kanban columns and cards, card detail panel, Realtime sync. Uses existing HTML5 DnD pattern.
**Success:** User can create a board, add columns, create cards, drag cards between columns, open a card detail panel to edit description/labels/due date. Changes sync in real-time.

### MH-15: TipTap Markdown Roundtrip Test Suite
Load 20+ representative notes through TipTap parse/serialize cycle and diff against input. Any diff that loses content is a blocker.
**Success:** Test suite runs against real vault content. All standard markdown constructs roundtrip perfectly. Edge cases (frontmatter, callouts) are documented with passthrough nodes or explicit deferral.

### MH-16: TipTap Custom Extensions (Wikilinks + Image Embeds)
Custom WikilinkExtension.ts and ImageEmbedExtension.ts TipTap nodes with markdown serialization that roundtrip correctly.
**Success:** `[[target|display]]` renders as a clickable chip and serializes back to `[[target|display]]`. `![[image.png]]` renders inline and serializes back to `![[image.png]]`. Both pass roundtrip tests.

### MH-17: TipTap Editor Migration
Rewrite NoteEditor.tsx and EditorToolbar.tsx using TipTap. All existing features preserved: formatting toolbar, keyboard shortcuts, wikilink autocomplete, image embeds, backlinks.
**Success:** User opens a note and sees WYSIWYG rendering (bold is bold, headings are large). All toolbar buttons work. Wikilink `[[` autocomplete works. Saving produces markdown identical to what CodeMirror would have produced for the same edits.

### MH-18: TipTap Polish (Slash Commands + Floating Toolbar + Tables)
Add BubbleMenu floating toolbar on text selection, slash commands via Suggestion API (`/heading`, `/table`, `/code`), and table extension for visual table editing.
**Success:** User selects text and sees a floating formatting toolbar. User types `/` and sees a command palette of block types. User can insert and edit tables with add/remove rows and columns.

### MH-19: Remove CodeMirror Packages
After TipTap migration is verified, remove all 11 CodeMirror/@lezer packages from dependencies.
**Success:** `npm ls @codemirror` returns empty. Bundle size decreases. No CodeMirror imports remain in source code.

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
Register Terminal and Project Board as widgets. Add OpenClaw and Projects to sidebar modules. Wire Settings connections for OpenClaw.
**Success:** Terminal and Kanban widgets appear in Widget Picker. OpenClaw and Projects pages are accessible from sidebar. OpenClaw module shows `requiresConfig` warning when API URL is not set.

### MH-24: Final Verification + Bundle Audit
End-to-end verification of all features together. Bundle size audit. Theme slider contrast check across all positions. Cross-feature integration test.
**Success:** All features work together without conflicts. Bundle stays under 5MB. Theme slider produces readable text at every position. No regressions in existing features.

## Should-Have (SH)

### SH-01: Agent Memory Browser
View, edit, and clear agent RAG memory context from the OpenClaw Controller page.
**Success:** User selects an agent and sees its memory entries. User can add, edit, or clear memory entries.

### SH-02: Note Templates
Pre-built templates for common note types: meeting notes, daily journal, retro. Applied on note creation.
**Success:** When creating a new note, user can choose from a template dropdown. Selected template populates the note with structured content.

### SH-03: Slash Commands (Editor)
Captured under MH-18 for the core set. This covers extended slash commands beyond the basics: `/callout`, `/embed`, `/image`, `/task-list`.
**Success:** Extended slash commands insert the corresponding block types. Autocomplete filters as user types.

### SH-04: Install TipTap Packages
Install all TipTap packages and configure Vite chunks. Build must compile. Do NOT remove CodeMirror packages yet.
**Success:** `npm install` succeeds. `npm run build` succeeds with both TipTap and CodeMirror in the dependency tree. TipTap packages are in their own Vite manual chunk.

## Nice-to-Have (NH)

### NH-01: Full-Text Note Search
Search inside note content, not just titles. Backend endpoint over CouchDB content with relevance ranking.
**Success:** User types a search query and sees notes ranked by content relevance, with matching snippets highlighted.

### NH-02: Version History
View revision history for a note using CouchDB revisions. Diff view showing changes between versions.
**Success:** User opens a note's history and sees a list of revisions with timestamps. Selecting two revisions shows a diff.

### NH-03: Kanban Swimlanes
Group kanban cards by assignee, priority, or label in horizontal swimlanes.
**Success:** User toggles swimlane grouping and cards reorganize into horizontal rows by the selected attribute.

## Out of Scope (v0.0.3)

- Real-time collaboration on notes (Yjs + Hocuspocus -- massive scope, defer to v0.0.4+)
- Obsidian plugin compatibility (different paradigm)
- Storing TipTap JSON in CouchDB (breaks LiveSync)
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
| MH-05 | Phase 11 | Pending |
| MH-06 | Phase 12 | Pending |
| MH-07 | Phase 13 | Pending |
| MH-08 | Phase 14 | Pending |
| MH-09 | Phase 8 | Pending |
| MH-10 | Phase 9 | Pending |
| MH-11 | Phase 10 | Pending |
| MH-12 | Phase 6 | Pending |
| MH-13 | Phase 15 | Pending |
| MH-14 | Phase 16 | Pending |
| MH-15 | Phase 17 | Pending |
| MH-16 | Phase 18 | Pending |
| MH-17 | Phase 19 | Pending |
| MH-18 | Phase 20 | Pending |
| MH-19 | Phase 21 | Pending |
| MH-20 | Phase 5 | Pending |
| MH-21 | Phase 22 | Pending |
| MH-22 | Phase 23 | Pending |
| MH-23 | Phase 24 | Pending |
| MH-24 | Phase 25 | Pending |
| SH-01 | Phase 14 | Pending |
| SH-02 | Phase 20 | Pending |
| SH-03 | Phase 20 | Pending |
| SH-04 | Phase 7 | Pending |
| NH-01 | Deferred (v0.0.4+) | Deferred |
| NH-02 | Deferred (v0.0.4+) | Deferred |
| NH-03 | Deferred (v0.0.4+) | Deferred |

## Success Criteria (Milestone-Level)

1. All v0.0.2 bug fixes verified working in production builds
2. Full OpenClaw gateway CRUD (agents, crons, usage) accessible from a dedicated controller page
3. Theme blend slider produces readable themes at every position using OKLCH interpolation
4. Kanban board with persistent cards, columns, drag-and-drop, and Realtime sync
5. TipTap WYSIWYG editor with markdown round-trip, wikilinks, image embeds, slash commands, and tables
6. Embedded terminal widget with local PTY and secure process management
7. Bundle stays under 5MB with CI enforcement
8. All existing tests pass, no regressions
