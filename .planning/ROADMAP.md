# Roadmap: OpenClaw Manager v1.0

## Overview

OpenClaw Manager is a mature alpha with 17 working modules, solid security (96/100), and extensive tests. The path to a publishable v1.0 follows three parallel tracks: **(1)** polishing what exists (responsive layout, visual consistency, loading/error/empty states), **(2)** adding table-stakes features users expect (theming, setup wizard, customizable dashboard, data export), and **(3)** building the differentiating AI module builder that no competitor offers. The critical dependency chain is: responsive shell -> color audit -> theming -> setup wizard -> dashboard grid -> page experience -> module primitives -> Bjorn builder -> data export.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Responsive Layout Shell + Visual Polish** - Stable responsive layout via container queries, sidebar auto-collapse, and full visual consistency audit (colors, spacing, typography, icons, shared feedback components)
- [x] **Phase 2: Theming System** - Light/dark/system themes, 6-8 curated presets, instant theme switching, import/export, and Supabase sync (completed 2026-03-19)
- [ ] **Phase 3: Setup Wizard + Onboarding** - First-run wizard covering service connections, module selection, theme pick, demo mode, with progressive disclosure and resumable state
- [ ] **Phase 4: Dashboard Grid + Widget System** - Free-form drag/resize widget grid with edit mode, Widget Registry, layout persistence per breakpoint, and existing cards refactored as widgets
- [ ] **Phase 5: Page Experience** - Seamless page transitions, state preservation on navigation, unread badges, keyboard shortcut discoverability, global search extension, and Discord-style sidebar categories
- [ ] **Phase 6: Module Primitives Library** - 14 reusable component primitives (charts, lists, forms, tables, kanban, etc.) with documented config schemas, widget compatibility, and internal error handling
- [ ] **Phase 7: Bjorn Module Builder** - AI-generated React modules via sandboxed iframe, static analysis gate, approval flow, hot-reload into Widget Registry, persistence, version history
- [ ] **Phase 8: Data Export** - Export all Supabase data as JSON, SQLite database backup, and notes as markdown files from Settings

## Phase Details

### Phase 1: Responsive Layout Shell + Visual Polish
**Goal**: The app looks and feels like one cohesive product across all window sizes and monitor configurations -- no visual inconsistencies, no layout breakage, and clear feedback states everywhere.
**Depends on**: Nothing (first phase)
**Requirements**: LAYOUT-01, LAYOUT-02, LAYOUT-03, LAYOUT-04, LAYOUT-05, LAYOUT-06, POLISH-01, POLISH-02, POLISH-03, POLISH-04, POLISH-05, POLISH-06, POLISH-07, POLISH-08, POLISH-09
**Success Criteria** (what must be TRUE):
  1. User can resize the app window from minimum (900px) to ultrawide without any content overflow, clipping, or overlapping elements on any page
  2. Sidebar automatically collapses to icon-only mode when the main content area drops below 900px, and the resize handle operates without layout jank
  3. Every page uses a consistent spacing scale, button hierarchy (primary/secondary/ghost/danger), typography scale, icon style, and border-radius/shadow depth
  4. All hardcoded color values (hex, rgba, hsl in JSX/TS files) have been migrated to CSS variables -- zero remaining inline color literals
  5. Every async page and widget displays a shared LoadingState, ErrorState (with retry), or EmptyState (with guidance) component instead of blank screens or raw spinners
**Plans**: 5 plans

Plans:
- [x] 01-01-PLAN.md -- Design system foundation + container query responsive shell
- [x] 01-02-PLAN.md -- Shared UI feedback components (Button, EmptyState, ErrorState, Toast, ProgressBar)
- [x] 01-03-PLAN.md -- Icon migration (lucide to Phosphor) + hardcoded color audit
- [x] 01-04-PLAN.md -- Gap closure: Adopt EmptyState/ErrorState/Button across pages (batch 1: Todos, Missions, Knowledge, Calendar, HomeLab, Status, Search, Pipeline, Personal, Dashboard)
- [ ] 01-05-PLAN.md -- Gap closure: Adopt EmptyState/ErrorState/Button across pages (batch 2: Messages, Chat, Email, Notes, Memory, Pomodoro, Settings, Agents, remaining)

### Phase 2: Theming System
**Goal**: Users can personalize the app's appearance with curated theme presets or imported themes, with changes applying instantly and syncing across devices.
**Depends on**: Phase 1 (all hardcoded colors must be CSS variables before themes can override them)
**Requirements**: THEME-01, THEME-02, THEME-03, THEME-04, THEME-05, THEME-06, THEME-07, THEME-08
**Success Criteria** (what must be TRUE):
  1. User can switch between light, dark, and system-follow modes, and the system-follow mode tracks OS preference changes in real time
  2. User can choose from 6-8 curated theme presets (2 light, 2 dark, 2 high-contrast, 2 colorful accent) and every UI element across all pages responds to the selected theme
  3. Theme selection persists across app restarts and syncs to other devices via Supabase
  4. User can export the current theme as a JSON file and import a theme from a JSON file, with imported themes validated and sanitized
  5. Theme switches apply instantly with a smooth transition animation and no page reload
**Plans**: 7 plans

Plans:
- [x] 02-01-PLAN.md -- Foundation: deps install, ThemeDefinition types, 17 preset definitions, ThemeStore, migration v5, preferences-sync
- [x] 02-02-PLAN.md -- Theme engine: applyTheme(), ripple animation (View Transitions API), alpha tint derivation, mode switching, main.tsx wiring
- [x] 02-03-PLAN.md -- Theme validation, import/export, share codes (lz-string compression)
- [x] 02-04-PLAN.md -- Theme Picker modal (Super+Shift+T), ThemeCard, AccentPicker (react-colorful), LayoutShell integration
- [x] 02-05-PLAN.md -- Font system (4 slots, system font enumeration via font-kit, Google Fonts, base size slider) + custom branding
- [x] 02-06-PLAN.md -- Custom CSS editor (CodeMirror), theme scheduling (sunrise/sunset + manual), per-page override logic
- [x] 02-07-PLAN.md -- Settings Display rewrite, ThemeImportExport panel, sidebar context menu, end-to-end verification

### Phase 02.1: Theme Settings Page Polish + System Mode Fix (INSERTED)

**Goal:** System mode detects dark themes correctly on Linux, all functional/status colors are customizable via a 3-tier color hierarchy, and the Settings Display page is reorganized into card-based sections with advanced customization sliders.
**Requirements**: POLISH-10, POLISH-11, POLISH-12, POLISH-13, POLISH-14, POLISH-15, POLISH-16
**Depends on:** Phase 2
**Plans:** 4/4 plans complete
**Success Criteria** (what must be TRUE):
  1. System mode detects dark themes correctly on Linux (Hyprland/GNOME via gsettings)
  2. All functional/status colors use a 3-tier hierarchy (accent, secondary, tertiary)
  3. Settings Display is card-based with compact color pickers, live font preview, and advanced sliders

Plans:
- [x] 02.1-01-PLAN.md -- System mode fix: Rust gsettings command + frontend Linux fallback
- [x] 02.1-02-PLAN.md -- Color hierarchy foundation: 3-tier types, tint derivation, migration v6, CSS variables
- [x] 02.1-03-PLAN.md -- Green-to-secondary + blue-to-tertiary migration across 57+ component files
- [x] 02.1-04-PLAN.md -- Settings Display redesign: card sections, compact colors, glow/radius/opacity sliders

### Phase 02.2: Theme System Mode Fixes (INSERTED)

**Goal:** System mode truly mirrors the desktop theme — shows only the active GTK theme, reads live Wallbash colors, syncs instantly with desktop transitions, and all light themes have readable text.
**Requirements**: SYSMODE-01, SYSMODE-02, SYSMODE-03, SYSMODE-04, SYSMODE-05, SYSMODE-06, SYSMODE-07
**Depends on:** Phase 02.1
**Plans:** 2/2 plans complete

Plans:
- [ ] 02.2-01-PLAN.md -- Rust wallbash parser + file watcher, counterpart auto-switch, light theme contrast fix
- [ ] 02.2-02-PLAN.md -- Frontend wallbash integration, event-driven sync, system mode single-card UI

### Phase 3: Setup Wizard + Onboarding
**Goal**: New users (including non-technical users) can go from first launch to a configured, personalized app in under 5 minutes without reading documentation.
**Depends on**: Phase 2 (theme selection is part of the wizard flow)
**Requirements**: WIZARD-01, WIZARD-02, WIZARD-03, WIZARD-04, WIZARD-05, WIZARD-06, WIZARD-07, WIZARD-08
**Prior art**: A v0.1.0 setup wizard milestone is archived at `.planning-v0.1.0-wizard/` -- this phase incorporates and extends that work.
**Success Criteria** (what must be TRUE):
  1. First-time users see the setup wizard automatically on launch, and returning users who completed setup go straight to the dashboard
  2. User can connect services (BlueBubbles, OpenClaw, Supabase, CouchDB, Mac Bridge) individually with each being optional, select which modules to enable, and pick a theme -- all in a progressive, non-overwhelming flow
  3. User can choose demo mode to explore the app with fake data, without any infrastructure
  4. User can skip the wizard at any point and complete setup later via Settings, and an interrupted wizard resumes exactly where the user left off
**Plans**: 6 plans

Plans:
- [ ] 03-01-PLAN.md -- Foundation: wizard state store (useSyncExternalStore), animation intensity store, canvas-confetti install
- [ ] 03-02-PLAN.md -- Backend: Rust wizard connection test endpoints, check_tailscale Tauri command, reload-secrets
- [ ] 03-03-PLAN.md -- Wizard shell (full-screen takeover, step dots, morphing card transitions), welcome screen, shared components, LayoutShell integration
- [ ] 03-04-PLAN.md -- Service step components: Tailscale, Supabase, OpenClaw (required) + Mac Services, Server Services (optional)
- [ ] 03-05-PLAN.md -- Module selection (preset bundles + card grid), theme selection (8 presets + mode), summary + confetti, completion flow, demo mode, Settings integration
- [ ] 03-06-PLAN.md -- Guided tour overlay with spotlight cutout, positioned tooltips, data-driven tour stops

### Phase 4: Dashboard Grid + Widget System
**Goal**: The dashboard is a user-owned canvas where widgets can be freely arranged, and the Widget Registry pattern establishes the foundation that Bjorn modules will plug into later.
**Depends on**: Phase 1 (responsive shell for container-aware breakpoints), Phase 2 (theme engine for widget styling)
**Requirements**: DASH-01, DASH-02, DASH-03, DASH-04, DASH-05, DASH-06, DASH-07, DASH-08, DASH-09, DASH-10, DASH-11
**Success Criteria** (what must be TRUE):
  1. User can drag widgets to reposition them and resize widgets using handles, with widgets snapping to grid cells during both operations
  2. User can enter and exit edit mode (via button and keyboard shortcut), where edit mode reveals grid lines, resize handles, add-widget button, and per-widget remove buttons -- and non-edit mode shows a clean layout with no edit chrome
  3. User can add new widgets from a categorized picker and remove unwanted widgets, with the dashboard populated by a sensible default layout on first use based on enabled modules
  4. All existing dashboard cards (HeartbeatCard, AgentsCard, MissionsCard, etc.) work as grid widgets, each with its own error boundary and loading state independent of other widgets
  5. Dashboard layout persists across app restarts, syncs to Supabase per breakpoint, and adapts correctly when moving between monitors of different resolutions
**Plans**: 6 plans

Plans:
- [x] 04-01-PLAN.md -- Foundation: react-grid-layout install, Widget Registry, dashboard store, default layout generator, CSS (wobble, grid-lines, z-indices)
- [ ] 04-02-PLAN.md -- Grid engine: DashboardGrid (react-grid-layout Responsive), WidgetWrapper (error boundary + lazy loading), Dashboard.tsx rewrite
- [ ] 04-03-PLAN.md -- Edit mode controls: DashboardEditBar (toggle, Ctrl+E, long-press), DashboardTabs (page CRUD, rename, reorder), DotIndicators
- [ ] 04-04-PLAN.md -- Widget management: WidgetPicker (categorized panel with search + size presets), RecycleBin (recovery drawer), WidgetConfigPanel (per-widget settings)
- [ ] 04-05-PLAN.md -- Persistence: preferences-sync wiring for Supabase sync, dashboard-edit keybinding registration, integration tests
- [ ] 04-06-PLAN.md -- Integration: Wire all components into Dashboard.tsx, edit-mode chrome on WidgetWrapper (remove X, gear, title, wobble), first-use default layout, floating FAB

### Phase 04.1: Wallbash GTK System Mode Integration Fix (INSERTED)

**Goal:** [Urgent work - to be planned]
**Requirements**: TBD
**Depends on:** Phase 04
**Plans:** 3/6 plans executed

Plans:
- [ ] TBD (run /gsd:plan-phase 04.1 to break down)

### Phase 5: Page Experience
**Goal**: Navigating between modules feels instant and polished -- state is preserved, activity is visible at a glance, and power users can find anything in seconds.
**Depends on**: Phase 4 (dashboard grid establishes the widget and page infrastructure)
**Requirements**: PAGE-01, PAGE-02, PAGE-03, PAGE-04, PAGE-05, PAGE-06, PAGE-07
**Success Criteria** (what must be TRUE):
  1. Switching between modules produces no full-page reload, and navigating back to a previously visited page restores scroll position and form state
  2. Sidebar items display unread badges for modules with new activity, and the Messages conversation list shows per-conversation unread counts
  3. Keyboard shortcuts appear in tooltips and menus throughout the app, and global search returns results across notes, tasks, messages, calendar events, and knowledge entries
  4. Sidebar categories are collapsible (Discord-style) and show activity indicators for sections with unread content
**Plans**: TBD

Plans:
- [ ] 05-01: TBD
- [ ] 05-02: TBD

### Phase 6: Module Primitives Library
**Goal**: A comprehensive set of tested, themed, widget-compatible UI primitives exists that both users and Bjorn can compose modules from.
**Depends on**: Phase 4 (Widget Registry pattern for widget compatibility), Phase 2 (theme variables for consistent styling)
**Requirements**: PRIM-01, PRIM-02, PRIM-03, PRIM-04, PRIM-05, PRIM-06, PRIM-07, PRIM-08, PRIM-09, PRIM-10, PRIM-11, PRIM-12, PRIM-13, PRIM-14
**Success Criteria** (what must be TRUE):
  1. All 14 primitives exist and render correctly: stat card, line chart, bar chart, list view, table, form, kanban board, progress bar, markdown display, timer/countdown, image gallery -- each with a documented JSON config schema
  2. Every primitive can be added to the dashboard grid as a widget, respecting grid cell sizing and responsive breakpoints
  3. Every primitive handles its own loading, error, and empty states internally -- a broken primitive never crashes other widgets or the dashboard
  4. Every primitive respects the active theme (colors, typography, spacing) without any hardcoded visual values
**Plans**: TBD

Plans:
- [ ] 06-01: TBD
- [ ] 06-02: TBD
- [ ] 06-03: TBD

### Phase 7: Bjorn Module Builder
**Goal**: Users can describe a module in natural language, see it previewed safely, approve it, and use it on their dashboard -- the differentiating feature that makes the app infinitely extensible.
**Depends on**: Phase 6 (module primitives that Bjorn composes from), Phase 4 (Widget Registry for module installation)
**Requirements**: BJORN-01, BJORN-02, BJORN-03, BJORN-04, BJORN-05, BJORN-06, BJORN-07, BJORN-08, BJORN-09, BJORN-10, BJORN-11, BJORN-12
**Success Criteria** (what must be TRUE):
  1. User can describe a module in natural language via chat with Bjorn, and Bjorn generates a working React component that renders in a sandboxed iframe preview alongside the main app
  2. The sandbox has no access to the parent DOM, localStorage, cookies, Tauri IPC, or network -- and a static analysis gate rejects generated code containing fetch, XMLHttpRequest, WebSocket, document.cookie, window.parent, or other disallowed APIs
  3. User can approve, reject, or request changes to a generated module -- approved modules appear in the dashboard widget picker and load without app restart (hot-reload)
  4. Generated modules persist across app restarts, can be deleted or disabled by the user, and maintain a version history allowing rollback to any previous version
**Plans**: TBD

Plans:
- [ ] 07-01: TBD
- [ ] 07-02: TBD
- [ ] 07-03: TBD

### Phase 8: Data Export
**Goal**: Users have full sovereignty over their data and can extract everything the app stores in standard, portable formats.
**Depends on**: Phase 4 (Settings infrastructure for export UI)
**Requirements**: EXPORT-01, EXPORT-02, EXPORT-03
**Success Criteria** (what must be TRUE):
  1. User can export all Supabase data as a JSON file from Settings
  2. User can export the local SQLite database as a backup file from Settings
  3. User can export all notes as individual markdown files from Settings
**Plans**: TBD

Plans:
- [ ] 08-01: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 2.1 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Responsive Layout Shell + Visual Polish | 4/5 | Gap closure | - |
| 2. Theming System | 7/7 | Complete   | 2026-03-19 |
| 2.1. Theme Settings Polish + System Mode Fix | 4/4 | Complete | 2026-03-20 |
| 2.2. Theme System Mode Fixes | 0/2 | Planned | - |
| 3. Setup Wizard + Onboarding | 0/6 | Planned | - |
| 4. Dashboard Grid + Widget System | 1/6 | In Progress | - |
| 5. Page Experience | 0/2 | Not started | - |
| 6. Module Primitives Library | 0/3 | Not started | - |
| 7. Bjorn Module Builder | 0/3 | Not started | - |
| 8. Data Export | 0/1 | Not started | - |

---
*Roadmap created: 2026-03-19*
*Last updated: 2026-03-20*
