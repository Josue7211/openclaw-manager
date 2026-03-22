# Roadmap: OpenClaw Manager

## Milestones

- ✅ **v1.0** -- Publishable release (shipped 2026-03-21) -- [Full details](milestones/v1.0-ROADMAP.md)
- ✅ **v0.0.2** -- Widget-First Architecture (shipped 2026-03-22)
- 🚧 **v0.0.3** -- Bug Fixes + OpenClaw Controller + Polish

## Phases

### v0.0.3 -- Bug Fixes + OpenClaw Controller + Polish

**Group A: Bug Verification**
- [ ] **Phase 1: Verify Widget Resize Fix** - Confirm widget resize handles work across all widget types
- [ ] **Phase 2: Verify Page Layout Fix** - Confirm full-bleed and scrolling pages work at all viewport sizes
- [ ] **Phase 3: Verify Widget Tab-Switch Fix** - Confirm widgets persist across page/tab navigation
- [ ] **Phase 4: Verify Widget Picker UX Fixes** - Confirm duplicates, animations, preset feedback, delete dialog

**Group B: Infrastructure Foundations**
- [ ] **Phase 5: Set CI Bundle Budget** - CI check failing if any chunk >400KB or total >5MB
- [ ] **Phase 6: Supabase Migration for Projects** - projects, project_columns, project_items tables with RLS + Realtime
- [ ] **Phase 7: Install TipTap Packages** - TipTap packages installed, Vite chunks configured, build compiles

**Group C: Low-Risk Independent Features**
- [ ] **Phase 8: Theme Blend -- OKLCH Helpers** - Color interpolation utilities with unit tests
- [ ] **Phase 9: Theme Blend -- Interpolation Engine** - Working theme interpolation with WCAG contrast enforcement
- [ ] **Phase 10: Theme Blend -- Slider UI + Persistence** - User-facing slider that blends dark/light themes in real-time
- [ ] **Phase 11: OpenClaw Gateway Proxy Helper** - Reusable proxy function with credential protection and error sanitization
- [ ] **Phase 12: OpenClaw Agent CRUD** - Agent create/update/delete + lifecycle controls (start/stop/restart)
- [ ] **Phase 13: OpenClaw Cron CRUD** - Cron create/update/delete + human-readable schedule UI
- [ ] **Phase 14: OpenClaw Usage + Models + Controller Page** - Usage dashboard, model listing, tool registry, unified page shell
- [ ] **Phase 15: Project Tracker Backend + API** - Axum routes for project CRUD (boards, columns, items, drag reorder)
- [ ] **Phase 16: Project Tracker Frontend + Kanban Board** - Drag-and-drop kanban page with card detail panel + Realtime sync

**Group D: High-Complexity Features (TipTap Editor)**
- [ ] **Phase 17: TipTap Markdown Roundtrip Test Suite** - Safety gate: validate roundtrip fidelity before any editor code
- [ ] **Phase 18: TipTap Custom Extensions (Wikilinks + Image Embeds)** - Custom nodes with markdown serialization
- [ ] **Phase 19: TipTap Editor Migration** - Rewrite NoteEditor.tsx and EditorToolbar.tsx with all features preserved
- [ ] **Phase 20: TipTap Polish (Slash Commands + Floating Toolbar + Tables)** - Google Docs-level editing experience
- [ ] **Phase 21: Remove CodeMirror Packages** - Clean bundle, no dual-editor overhead

**Group E: Terminal (Highest Risk)**
- [ ] **Phase 22: Terminal PTY Backend** - portable-pty + WebSocket relay + process group cleanup
- [ ] **Phase 23: Terminal Frontend (xterm.js)** - Terminal component with resize, copy/paste, scrollback, theme integration

**Group F: Integration + Polish**
- [ ] **Phase 24: Widget Registry + Sidebar Module Integration** - Register all new features as widgets and sidebar modules
- [ ] **Phase 25: Final Verification + Bundle Audit** - End-to-end verification, bundle audit, contrast check, integration test

## Phase Details

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
**Plans**: TBD

### Phase 6: Supabase Migration for Projects
**Goal**: Database schema ready for the project tracker with proper security and real-time support
**Depends on**: Nothing (parallel with Group A)
**Requirements**: MH-12
**Success Criteria** (what must be TRUE):
  1. `projects`, `project_columns`, `project_items` tables exist with correct schema
  2. RLS policies enforce user isolation (user can only see their own projects)
  3. Realtime publication enabled for project_items
  4. Indexes on foreign keys and position columns for sort performance
**Plans**: TBD

### Phase 7: Install TipTap Packages
**Goal**: TipTap packages installed and build compiles with both TipTap and CodeMirror present
**Depends on**: Nothing (parallel with Group A)
**Requirements**: SH-04
**Success Criteria** (what must be TRUE):
  1. All 22 TipTap packages installed successfully
  2. `npm run build` succeeds with no errors
  3. TipTap packages are in their own Vite manual chunk
  4. CodeMirror packages are NOT removed yet
**Plans**: TBD

### Phase 8: Theme Blend -- OKLCH Helpers
**Goal**: Pure color interpolation utility functions ready for the theme blend engine
**Depends on**: Nothing (parallel with other Group C phases)
**Requirements**: MH-09
**Success Criteria** (what must be TRUE):
  1. `hexToOklch()` correctly converts hex colors to OKLCH
  2. `oklchToHex()` correctly converts OKLCH back to hex
  3. `interpolateHexOklch()` blends two hex colors in OKLCH space
  4. Round-trip hex -> OKLCH -> hex produces the same color (within 1 unit tolerance)
  5. Unit tests cover edge cases (black, white, pure colors, transparent)
**Plans**: TBD

### Phase 9: Theme Blend -- Interpolation Engine
**Goal**: Working theme interpolation with automatic text color switching and WCAG contrast enforcement
**Depends on**: Phase 8
**Requirements**: MH-10
**Success Criteria** (what must be TRUE):
  1. `interpolateThemes()` blends all Tier 1 CSS variables between dark and light theme values
  2. Accent colors (Tier 2) are NOT blended -- they remain as the user chose
  3. Text color switches from light to dark based on background OKLCH lightness (not slider position)
  4. Every text/background pair meets WCAG AA contrast ratio (4.5:1) at every blend position
**Plans**: TBD

### Phase 10: Theme Blend -- Slider UI + Persistence
**Goal**: User-facing slider that blends between dark and light themes in real-time
**Depends on**: Phase 9
**Requirements**: MH-11
**Success Criteria** (what must be TRUE):
  1. Slider appears in Settings > Display with 0% (dark) to 100% (light) range
  2. Dragging the slider updates the theme in real-time (RAF-throttled)
  3. Blend position persists across app restarts (localStorage + Supabase sync)
  4. System theme mode interaction: switching to "System" resets the slider appropriately
**Plans**: TBD

### Phase 11: OpenClaw Gateway Proxy Helper
**Goal**: Security-critical proxy foundation that all OpenClaw CRUD routes build on
**Depends on**: Nothing (parallel with other Group C phases)
**Requirements**: MH-05
**Success Criteria** (what must be TRUE):
  1. `gateway_forward()` function proxies requests to OPENCLAW_API_URL with API key
  2. Error responses are sanitized -- no API keys, internal paths, or stack traces leak to frontend
  3. All path parameters validated with `validate_uuid()` before URL construction
  4. Returns "OpenClaw API not configured" when OPENCLAW_API_URL is not set
**Plans**: TBD

### Phase 12: OpenClaw Agent CRUD
**Goal**: Full agent management from the OpenClaw Controller page
**Depends on**: Phase 11
**Requirements**: MH-06
**Success Criteria** (what must be TRUE):
  1. User can create a new agent with name, model, and role
  2. User can edit an existing agent's configuration
  3. User can start, stop, and restart an agent
  4. User can delete an agent (with confirmation dialog)
  5. UI updates optimistically with rollback on error
**Plans**: TBD

### Phase 13: OpenClaw Cron CRUD
**Goal**: Full cron job management with human-readable schedule editing
**Depends on**: Phase 11
**Requirements**: MH-07
**Success Criteria** (what must be TRUE):
  1. User can create a cron job with a schedule picked from a UI (not raw crontab)
  2. User can toggle a cron job enabled/disabled
  3. User can edit a cron job's command and schedule
  4. User can delete a cron job (with confirmation)
  5. Duplicate crons prevented on retry (PUT with deterministic IDs)
**Plans**: TBD

### Phase 14: OpenClaw Usage + Models + Controller Page
**Goal**: Unified OpenClaw page with tabs for all management features plus read-only dashboards
**Depends on**: Phases 12, 13
**Requirements**: MH-08, SH-01
**Success Criteria** (what must be TRUE):
  1. OpenClawPage.tsx has tab navigation: Agents, Crons, Usage, Models, Tools
  2. Usage tab shows token counts, cost, and model usage with chart widgets
  3. Models tab lists available models with configuration details
  4. Tools tab shows the tool registry
  5. Page polls at 30s minimum, only when the page is active
**Plans**: TBD

### Phase 15: Project Tracker Backend + API
**Goal**: Complete backend API for project management following existing CRUD patterns
**Depends on**: Phase 6
**Requirements**: MH-13
**Success Criteria** (what must be TRUE):
  1. `/api/projects` CRUD endpoints work for boards, columns, and items
  2. Drag reorder updates `position` column correctly
  3. Cascade delete works (deleting a board removes its columns and items)
  4. All endpoints use RequireAuth and validate inputs
**Plans**: TBD

### Phase 16: Project Tracker Frontend + Kanban Board
**Goal**: Full kanban board page with drag-and-drop and Supabase Realtime sync
**Depends on**: Phase 15
**Requirements**: MH-14
**Success Criteria** (what must be TRUE):
  1. User can create a project board and add named columns
  2. User can create cards with title, description, labels, and due date
  3. User can drag cards between columns (HTML5 DnD, no new library)
  4. Card detail panel opens on click with full editing
  5. Changes sync in real-time via Supabase Realtime
**Plans**: TBD

### Phase 17: TipTap Markdown Roundtrip Test Suite
**Goal**: Safety gate ensuring TipTap does not silently drop or corrupt note content
**Depends on**: Phase 7
**Requirements**: MH-15
**Research**: YES -- TipTap markdown extension is "early release"; edge cases undocumented
**Success Criteria** (what must be TRUE):
  1. Test suite loads 20+ representative notes through TipTap parse/serialize
  2. All standard markdown constructs (headings, lists, code, links, images) roundtrip perfectly
  3. Obsidian-specific constructs (frontmatter, callouts) are documented: either handled by passthrough nodes or explicitly deferred
  4. Any content-losing diff is treated as a test failure
**Plans**: TBD

### Phase 18: TipTap Custom Extensions (Wikilinks + Image Embeds)
**Goal**: Custom TipTap nodes that handle Obsidian-specific markdown syntax with perfect roundtrip
**Depends on**: Phase 17
**Requirements**: MH-16
**Success Criteria** (what must be TRUE):
  1. `[[target]]` and `[[target|display]]` render as clickable inline chips
  2. `![[image.png]]` renders as an inline image via vault media proxy
  3. Both serialize back to their original markdown syntax on save
  4. Wikilink autocomplete triggers on `[[` and shows matching note titles
**Plans**: TBD

### Phase 19: TipTap Editor Migration
**Goal**: WYSIWYG editor replaces CodeMirror with all existing features preserved
**Depends on**: Phases 17, 18
**Requirements**: MH-17
**Success Criteria** (what must be TRUE):
  1. User opens a note and sees WYSIWYG rendering (bold is bold, headings are large)
  2. All toolbar buttons work (bold, italic, strike, code, lists, headings, links, blockquote, code blocks)
  3. Keyboard shortcuts work (Cmd+B, Cmd+I, Cmd+K, Cmd+Shift+S)
  4. Wikilink autocomplete works on `[[` trigger
  5. Image embeds render inline and survive save/reload
  6. Backlinks panel still resolves correctly
**Plans**: TBD

### Phase 20: TipTap Polish (Slash Commands + Floating Toolbar + Tables)
**Goal**: Google Docs-level editing experience with advanced features
**Depends on**: Phase 19
**Requirements**: MH-18, SH-02, SH-03
**Success Criteria** (what must be TRUE):
  1. Selecting text shows a floating BubbleMenu with formatting options
  2. Typing `/` shows a command palette of block types (heading, table, code, task list)
  3. User can insert a table and add/remove rows and columns
  4. Note templates available on note creation (meeting notes, daily journal, retro)
**Plans**: TBD

### Phase 21: Remove CodeMirror Packages
**Goal**: Clean bundle with no dual-editor overhead
**Depends on**: Phase 19 (verified working)
**Requirements**: MH-19
**Success Criteria** (what must be TRUE):
  1. All 11 CodeMirror/@lezer packages removed from package.json
  2. `npm ls @codemirror` returns empty
  3. No CodeMirror imports remain in source code
  4. Bundle size decreases measurably
**Plans**: TBD

### Phase 22: Terminal PTY Backend
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
**Plans**: TBD

### Phase 23: Terminal Frontend (xterm.js)
**Goal**: Working terminal component integrated with the app's theme and widget system
**Depends on**: Phase 22
**Requirements**: MH-22
**Success Criteria** (what must be TRUE):
  1. Terminal renders in a widget with full ANSI color support
  2. Terminal resizes correctly when widget is resized (fit addon + ResizeObserver)
  3. Copy/paste works (Ctrl+Shift+C/V, not Ctrl+C which is SIGINT)
  4. Scrollback buffer allows scrolling through previous output
  5. Terminal font uses the app's monospace CSS variable
**Plans**: TBD

### Phase 24: Widget Registry + Sidebar Module Integration
**Goal**: All new features accessible from sidebar navigation and widget picker
**Depends on**: Phases 14, 16, 23
**Requirements**: MH-23
**Success Criteria** (what must be TRUE):
  1. Terminal widget appears in Widget Picker under a "Developer" category
  2. Kanban/Project Board widget appears in Widget Picker under "Productivity"
  3. OpenClaw page accessible from sidebar with `requiresConfig` warning when unconfigured
  4. Projects page accessible from sidebar
  5. All new widgets are lazy-loaded via React.lazy
**Plans**: TBD

### Phase 25: Final Verification + Bundle Audit
**Goal**: Verified v0.0.3 release candidate with no regressions
**Depends on**: All previous phases
**Requirements**: MH-24
**Success Criteria** (what must be TRUE):
  1. All features work together without conflicts
  2. Bundle stays under 5MB (CI budget passes)
  3. Theme slider produces readable text at every position (automated WCAG check)
  4. No regressions in existing tests (frontend + Rust + E2E)
  5. CodeMirror fully removed, TipTap is the only editor
**Plans**: TBD

<details>
<summary>✅ v0.0.2 -- Widget-First Architecture (7 phases) -- SHIPPED 2026-03-22</summary>

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
<summary>✅ v1.0 (Phases 1-8 + 3 decimal insertions) -- SHIPPED 2026-03-21</summary>

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

## Progress

**Execution Order:** Phases within a group can run in parallel. Groups execute in order: A -> B -> C -> D -> E -> F.

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Verify Widget Resize Fix | v0.0.3 | 0/? | Not started | - |
| 2. Verify Page Layout Fix | v0.0.3 | 0/? | Not started | - |
| 3. Verify Widget Tab-Switch Fix | v0.0.3 | 0/? | Not started | - |
| 4. Verify Widget Picker UX Fixes | v0.0.3 | 0/? | Not started | - |
| 5. Set CI Bundle Budget | v0.0.3 | 0/? | Not started | - |
| 6. Supabase Migration for Projects | v0.0.3 | 0/? | Not started | - |
| 7. Install TipTap Packages | v0.0.3 | 0/? | Not started | - |
| 8. Theme Blend -- OKLCH Helpers | v0.0.3 | 0/? | Not started | - |
| 9. Theme Blend -- Interpolation Engine | v0.0.3 | 0/? | Not started | - |
| 10. Theme Blend -- Slider UI + Persistence | v0.0.3 | 0/? | Not started | - |
| 11. OpenClaw Gateway Proxy Helper | v0.0.3 | 0/? | Not started | - |
| 12. OpenClaw Agent CRUD | v0.0.3 | 0/? | Not started | - |
| 13. OpenClaw Cron CRUD | v0.0.3 | 0/? | Not started | - |
| 14. OpenClaw Usage + Models + Controller Page | v0.0.3 | 0/? | Not started | - |
| 15. Project Tracker Backend + API | v0.0.3 | 0/? | Not started | - |
| 16. Project Tracker Frontend + Kanban Board | v0.0.3 | 0/? | Not started | - |
| 17. TipTap Markdown Roundtrip Test Suite | v0.0.3 | 0/? | Not started | - |
| 18. TipTap Custom Extensions | v0.0.3 | 0/? | Not started | - |
| 19. TipTap Editor Migration | v0.0.3 | 0/? | Not started | - |
| 20. TipTap Polish | v0.0.3 | 0/? | Not started | - |
| 21. Remove CodeMirror Packages | v0.0.3 | 0/? | Not started | - |
| 22. Terminal PTY Backend | v0.0.3 | 0/? | Not started | - |
| 23. Terminal Frontend (xterm.js) | v0.0.3 | 0/? | Not started | - |
| 24. Widget Registry + Sidebar Integration | v0.0.3 | 0/? | Not started | - |
| 25. Final Verification + Bundle Audit | v0.0.3 | 0/? | Not started | - |

---
*Roadmap created: 2026-03-19*
*Last updated: 2026-03-22*
