# Requirements: OpenClaw Manager v1.0

**Defined:** 2026-03-19
**Core Value:** AI agent (Bjorn) builds, previews, and hot-reloads custom modules inside the running app — making it infinitely extensible without writing code.

## v1 Requirements

Requirements for the publishable v1.0 release. Each maps to roadmap phases.

### Responsive Layout

- [x] **LAYOUT-01**: App layout adapts to window resize without breaking (no overflow, no clipping, no overlapping elements)
- [x] **LAYOUT-02**: Sidebar auto-collapses to icon-only mode when main area drops below 900px
- [x] **LAYOUT-03**: Dashboard grid reflows to fewer columns at smaller container widths (3 breakpoints: compact, default, wide)
- [x] **LAYOUT-04**: Switching between 1080p and 1440p monitors preserves usable layout without manual adjustment
- [x] **LAYOUT-05**: All pages use CSS container queries for component-level responsiveness (not viewport media queries)
- [x] **LAYOUT-06**: Sidebar resize handle works smoothly without layout jank

### Visual Polish

- [x] **POLISH-01**: All hardcoded color values (rgba, hex, hsl in JSX/TS) migrated to CSS variables
- [x] **POLISH-02**: Consistent spacing scale applied across all 17+ pages
- [x] **POLISH-03**: Unified button hierarchy (primary, secondary, ghost, danger) used consistently
- [x] **POLISH-04**: Consistent typography scale (headings, body, captions, labels)
- [x] **POLISH-05**: Shared `<LoadingState>` component used on all async pages/widgets
- [x] **POLISH-06**: Shared `<ErrorState>` component with retry action on all failable pages/widgets
- [x] **POLISH-07**: Shared `<EmptyState>` component with contextual guidance on all list/data pages
- [x] **POLISH-08**: Consistent icon style across all modules (no mixed icon sets)
- [x] **POLISH-09**: Consistent border-radius and shadow depth across all card/panel components

### Theming

- [x] **THEME-01**: Three theme modes: light, dark, system-follow (via `prefers-color-scheme`)
- [x] **THEME-02**: 6-8 curated theme presets (2 light, 2 dark, 2 high-contrast, 2 colorful accent)
- [x] **THEME-03**: Theme selection persisted to Supabase via existing preferences-sync
- [x] **THEME-04**: Theme applies instantly without page reload
- [x] **THEME-05**: All UI elements respect active theme (zero hardcoded colors remaining after POLISH-01)
- [x] **THEME-06**: Theme import from JSON file
- [x] **THEME-07**: Theme export as JSON file
- [x] **THEME-08**: Smooth transition animation when switching themes

### Theme Polish (Phase 02.1)

- [x] **POLISH-10**: System mode correctly detects dark GTK theme on Linux (Hyprland/gsettings fallback)
- [x] **POLISH-11**: 3-tier color hierarchy (accent, secondary/functional, tertiary/accent-blue) with dynamic tint derivation
- [x] **POLISH-12**: All hardcoded green (--green, --green-400, --emerald) references migrated to --secondary CSS variables
- [x] **POLISH-13**: All hardcoded blue (--accent-blue, --accent-secondary) references migrated to --tertiary CSS variables
- [x] **POLISH-14**: Settings Display page uses card-based section layout with compact color pickers
- [x] **POLISH-15**: Glow brightness/opacity slider controls ambient top glow intensity
- [x] **POLISH-16**: Border radius and panel opacity sliders in Advanced section

### Theme System Mode Fixes (Phase 02.2)

- [x] **SYSMODE-01**: System mode shows only the active system theme card (detected GTK theme) — other presets hidden
- [x] **SYSMODE-02**: Dark↔Light mode auto-switches to counterpart preset (gruvbox-dark↔gruvbox-light, etc.)
- [x] **SYSMODE-03**: Live Wallbash color reading from ~/.config/hypr/themes/colors.conf when GTK theme is Wallbash-Gtk
- [x] **SYSMODE-04**: Wallbash dark/light/auto mode changes update app CSS variables without switching app mode toggle
- [x] **SYSMODE-05**: File watcher on Hyprland theme config for instant system theme sync (replace 1s polling)
- [x] **SYSMODE-06**: Light mode text contrast fix — all light themes meet WCAG AA for text-primary/secondary/muted on all surfaces
- [x] **SYSMODE-07**: Windows/macOS fallback — System mode without GTK falls back to dark/light preset filtering

### Setup Wizard

- [ ] **WIZARD-01**: First-run detection triggers setup wizard automatically
- [ ] **WIZARD-02**: Service connection step (BlueBubbles, OpenClaw, Supabase, CouchDB, Mac Bridge — each optional)
- [ ] **WIZARD-03**: Module selection step (enable/disable from available modules)
- [ ] **WIZARD-04**: Theme selection step (pick from presets, choose light/dark/system)
- [ ] **WIZARD-05**: Demo mode option for users without infrastructure
- [ ] **WIZARD-06**: Setup can be skipped and completed later via Settings
- [ ] **WIZARD-07**: Progressive disclosure (no 20-step wall — collapse advanced options)
- [ ] **WIZARD-08**: Setup state persisted so interrupted wizard resumes where user left off

### Dashboard Grid

- [ ] **DASH-01**: Free-form grid layout with drag-to-reposition and resize handles
- [ ] **DASH-02**: Widgets snap to grid cells during drag/resize
- [ ] **DASH-03**: Edit mode toggle (enter/exit via button and keyboard shortcut)
- [ ] **DASH-04**: Edit mode shows grid lines, resize handles, add widget button, remove widget X
- [ ] **DASH-05**: Non-edit mode shows clean layout with no edit chrome
- [ ] **DASH-06**: Add widget picker showing available widgets by category
- [ ] **DASH-07**: Widget Registry mapping widget IDs to lazy-loaded React components
- [ ] **DASH-08**: Layout persisted to SQLite + synced to Supabase per breakpoint
- [ ] **DASH-09**: Default layout provided for first-time users (populated from enabled modules)
- [ ] **DASH-10**: Existing dashboard cards (HeartbeatCard, AgentsCard, MissionsCard, etc.) refactored as grid widgets
- [ ] **DASH-11**: Each widget has its own error boundary and loading state

### Page Experience

- [ ] **PAGE-01**: Page transitions are seamless — no full-page reload when switching modules
- [ ] **PAGE-02**: Previous page state preserved when navigating back (scroll position, form state)
- [ ] **PAGE-03**: Unread badges on sidebar items for modules with new activity
- [ ] **PAGE-04**: Per-conversation unread badge on Messages conversation list
- [ ] **PAGE-05**: Keyboard shortcuts displayed in tooltips and menus
- [ ] **PAGE-06**: Global search extended to query all module backends (notes, tasks, messages, calendar, knowledge)
- [ ] **PAGE-07**: Discord-style collapsible categories in sidebar with activity indicators

### Module Primitives

- [ ] **PRIM-01**: Stat card primitive (title, value, trend indicator, sparkline)
- [ ] **PRIM-02**: Line chart primitive (time series, configurable axes, tooltip)
- [ ] **PRIM-03**: Bar chart primitive (vertical/horizontal, grouped, stacked)
- [ ] **PRIM-04**: List view primitive (sortable, filterable, paginated)
- [ ] **PRIM-05**: Table primitive (sortable columns, row actions, pagination)
- [ ] **PRIM-06**: Form primitive (text, number, select, toggle, date — schema-driven)
- [ ] **PRIM-07**: Kanban board primitive (columns, drag between columns)
- [ ] **PRIM-08**: Progress bar / gauge primitive
- [ ] **PRIM-09**: Markdown display primitive (render markdown content)
- [ ] **PRIM-10**: Timer / countdown primitive
- [ ] **PRIM-11**: Image gallery primitive (grid, lightbox on click)
- [ ] **PRIM-12**: Each primitive has a documented config schema (JSON)
- [ ] **PRIM-13**: Each primitive is widget-compatible (renders inside dashboard grid)
- [ ] **PRIM-14**: Each primitive handles loading, error, and empty states internally

### Bjorn Module Builder

- [ ] **BJORN-01**: User can describe a module in natural language via chat with Bjorn
- [ ] **BJORN-02**: Bjorn generates a React component using module primitives
- [ ] **BJORN-03**: Generated module renders in a sandboxed iframe (srcdoc, sandbox="allow-scripts", no allow-same-origin)
- [ ] **BJORN-04**: Dev preview panel shows generated module alongside the main app
- [ ] **BJORN-05**: User can approve, reject, or request changes to generated module
- [ ] **BJORN-06**: Approved module installs into Widget Registry and appears in dashboard widget picker
- [ ] **BJORN-07**: Hot-reload: approved module appears without app restart
- [ ] **BJORN-08**: Static analysis gate rejects generated code containing network calls, DOM access, or disallowed APIs
- [ ] **BJORN-09**: Module sandbox has no access to parent DOM, localStorage, cookies, or Tauri IPC
- [ ] **BJORN-10**: Generated module persisted (survives app restart)
- [ ] **BJORN-11**: User can delete/disable generated modules
- [ ] **BJORN-12**: Version history for generated modules (rollback to previous version)

### Data Export

- [ ] **EXPORT-01**: Export all Supabase data as JSON from Settings
- [ ] **EXPORT-02**: Export SQLite database backup from Settings
- [ ] **EXPORT-03**: Export notes as markdown files from Settings

## v2 Requirements

Deferred to post-v1.0 release. Tracked but not in current roadmap.

### Advanced Theming

- **ATHEME-01**: Visual CSS variable editor with color pickers and sliders for all theme variables
- **ATHEME-02**: Live preview as theme variables change
- **ATHEME-03**: Community theme gallery (static JSON index hosted on GitHub)

### Notes Overhaul

- **NOTES-01**: Wiki-style `[[linking]]` with autocomplete suggestions while typing
- **NOTES-02**: Backlinks panel showing all notes that link to the current note
- **NOTES-03**: Graph view with force-directed layout showing note connections
- **NOTES-04**: Rich text WYSIWYG editing (bold, italic, headings, inline images, tables, code blocks, checklists)
- **NOTES-05**: Editor toolbar for formatting without memorizing markdown
- **NOTES-06**: Full-text search across all notes with highlighted results
- **NOTES-07**: Tag system for notes organization
- **NOTES-08**: Starred/pinned notes
- **NOTES-09**: CodeMirror retained as source/markdown fallback mode
- **NOTES-10**: Round-trip fidelity: Tiptap → Markdown → Tiptap produces identical output
- **NOTES-11**: Note sharing (export as markdown/PDF)
- **NOTES-12**: Real-time co-editing (via CouchDB LiveSync)

### Extended Modules

- **FINANCE-01**: Manual transaction entry with categories
- **FINANCE-02**: CSV/OFX file import for bank transactions
- **FINANCE-03**: Monthly budget tracking with spending charts
- **HEALTH-01**: Manual health data entry (weight, exercise, sleep, water, mood)
- **HEALTH-02**: Trend charts over time
- **BOOKMARK-01**: Save links with title, description, tags
- **BOOKMARK-02**: Read-later queue with archive

### AI Suggestions

- **AISUG-01**: Local-only usage pattern tracking (never transmitted)
- **AISUG-02**: Bjorn suggests new modules based on usage patterns
- **AISUG-03**: Suggestion UI with dismissable cards

### Embedded VM Viewer

- **VM-01**: Embedded noVNC viewer for OpenClaw VM in a dashboard widget or dedicated page
- **VM-02**: Proxmox API token authentication

## Out of Scope

| Feature | Reason |
|---------|--------|
| Bank API integration (Plaid/Teller) | Security liability, PCI considerations, constant API breakage, massive support burden. Use CSV/OFX import instead. |
| Native mobile app | Doubles codebase, Tauri doesn't target mobile well. Target audience uses desktop. Consider lightweight PWA later. |
| Real-time collaboration (Google Docs) | CRDT editing is enormous engineering. CouchDB LiveSync handles note sync. Defer to Matrix integration. |
| Plugin/extension marketplace | Requires sandboxing, API stability, review process, versioning. Bjorn module builder IS the extensibility system. |
| Full email client (IMAP/SMTP) | Multi-year project (Thunderbird has 20 years). Email digest module covers the use case. |
| Social media integration | API instability, content moderation liability. RSS-based widgets via Bjorn if needed. |
| Telemetry / analytics | Explicitly prohibited. Local-only usage stats for AI suggestions (AISUG-01) only. |
| Auto-updating without consent | Hostile UX for power users. Check + notify + user decides. |
| Self-hosted Matrix integration | Future collaboration feature. Not v1 scope. |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| LAYOUT-01 | Phase 1 | Complete |
| LAYOUT-02 | Phase 1 | Complete |
| LAYOUT-03 | Phase 1 | Complete |
| LAYOUT-04 | Phase 1 | Complete |
| LAYOUT-05 | Phase 1 | Complete |
| LAYOUT-06 | Phase 1 | Complete |
| POLISH-01 | Phase 1 | Pending |
| POLISH-02 | Phase 1 | Complete |
| POLISH-03 | Phase 1 | Complete |
| POLISH-04 | Phase 1 | Complete |
| POLISH-05 | Phase 1 | Complete |
| POLISH-06 | Phase 1 | Complete |
| POLISH-07 | Phase 1 | Complete |
| POLISH-08 | Phase 1 | Pending |
| POLISH-09 | Phase 1 | Complete |
| POLISH-10 | Phase 2.1 | Complete |
| POLISH-11 | Phase 2.1 | Complete |
| POLISH-12 | Phase 2.1 | Complete |
| POLISH-13 | Phase 2.1 | Complete |
| POLISH-14 | Phase 2.1 | Complete |
| POLISH-15 | Phase 2.1 | Complete |
| POLISH-16 | Phase 2.1 | Complete |
| THEME-01 | Phase 2 | Complete |
| THEME-02 | Phase 2 | Complete |
| THEME-03 | Phase 2 | Complete |
| THEME-04 | Phase 2 | Complete |
| THEME-05 | Phase 2 | Complete |
| THEME-06 | Phase 2 | Complete |
| THEME-07 | Phase 2 | Complete |
| THEME-08 | Phase 2 | Complete |
| WIZARD-01 | Phase 3 | Pending |
| WIZARD-02 | Phase 3 | Pending |
| WIZARD-03 | Phase 3 | Pending |
| WIZARD-04 | Phase 3 | Pending |
| WIZARD-05 | Phase 3 | Pending |
| WIZARD-06 | Phase 3 | Pending |
| WIZARD-07 | Phase 3 | Pending |
| WIZARD-08 | Phase 3 | Pending |
| DASH-01 | Phase 4 | Pending |
| DASH-02 | Phase 4 | Pending |
| DASH-03 | Phase 4 | Pending |
| DASH-04 | Phase 4 | Pending |
| DASH-05 | Phase 4 | Pending |
| DASH-06 | Phase 4 | Pending |
| DASH-07 | Phase 4 | Pending |
| DASH-08 | Phase 4 | Pending |
| DASH-09 | Phase 4 | Pending |
| DASH-10 | Phase 4 | Pending |
| DASH-11 | Phase 4 | Pending |
| PAGE-01 | Phase 5 | Pending |
| PAGE-02 | Phase 5 | Pending |
| PAGE-03 | Phase 5 | Pending |
| PAGE-04 | Phase 5 | Pending |
| PAGE-05 | Phase 5 | Pending |
| PAGE-06 | Phase 5 | Pending |
| PAGE-07 | Phase 5 | Pending |
| PRIM-01 | Phase 6 | Pending |
| PRIM-02 | Phase 6 | Pending |
| PRIM-03 | Phase 6 | Pending |
| PRIM-04 | Phase 6 | Pending |
| PRIM-05 | Phase 6 | Pending |
| PRIM-06 | Phase 6 | Pending |
| PRIM-07 | Phase 6 | Pending |
| PRIM-08 | Phase 6 | Pending |
| PRIM-09 | Phase 6 | Pending |
| PRIM-10 | Phase 6 | Pending |
| PRIM-11 | Phase 6 | Pending |
| PRIM-12 | Phase 6 | Pending |
| PRIM-13 | Phase 6 | Pending |
| PRIM-14 | Phase 6 | Pending |
| BJORN-01 | Phase 7 | Pending |
| BJORN-02 | Phase 7 | Pending |
| BJORN-03 | Phase 7 | Pending |
| BJORN-04 | Phase 7 | Pending |
| BJORN-05 | Phase 7 | Pending |
| BJORN-06 | Phase 7 | Pending |
| BJORN-07 | Phase 7 | Pending |
| BJORN-08 | Phase 7 | Pending |
| BJORN-09 | Phase 7 | Pending |
| BJORN-10 | Phase 7 | Pending |
| BJORN-11 | Phase 7 | Pending |
| BJORN-12 | Phase 7 | Pending |
| EXPORT-01 | Phase 8 | Pending |
| EXPORT-02 | Phase 8 | Pending |
| EXPORT-03 | Phase 8 | Pending |

**Coverage:**
- v1 requirements: 79 total
- Mapped to phases: 79
- Unmapped: 0

---
*Requirements defined: 2026-03-19*
*Last updated: 2026-03-19*
