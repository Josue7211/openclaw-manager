# Phase 4: Dashboard Grid + Widget System - Context

**Gathered:** 2026-03-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Transform the dashboard from a static card layout into a free-form draggable/resizable widget grid with edit mode, Widget Registry, multiple dashboard pages, and per-user layout persistence. This is the centerpiece of the app — "Discord-like customizability meets Apple widgets." The Widget Registry established here is the foundation that Phase 7 (Bjorn Module Builder) plugs AI-generated modules into.

This phase does NOT include: widget marketplace/extension downloads (deferred), split view/popout windows (deferred), module primitives library (Phase 6), or Bjorn module generation (Phase 7).

</domain>

<decisions>
## Implementation Decisions

### Grid Behavior
- **Auto-columns based on width:** Grid auto-calculates columns — 4 on wide, 3 on default, 2 on compact, 1 on narrow
- **Widget sizing:** Preset sizes (S/M/L/XL like iOS) as starting points + free resize within grid cells after
- **Non-overlapping + z-order:** Widgets push each other out of the way when dragged. Separately, widgets can be pinned/floating above the grid (like sticky notes)
- **Compact breakpoint:** Separate compact layout definable by user, with option to enable auto-reflow instead (setting per widget or globally)
- **Scrollable dashboard:** Dashboard pages scroll vertically — can be infinitely long
- **Widget headers:** Borderless cards by default, optional title header per widget (user toggle)

### Multiple Dashboard Pages
- **Multiple pages with a default "Home"** — users create named tabs ("Home", "Work", "Monitoring")
- **Navigation:** Tabs at top, sidebar sub-items under "Dashboard", optional dot indicators (toggleable)
- **Full control:** Rename by double-clicking tab, reorder by drag-and-drop, delete pages
- **App title pinned at top** — always visible above the dashboard tabs, like a Discord server name

### Edit Mode
- **Enter via:** Header button (pencil icon) + long-press on any widget starts iOS wobble mode + keyboard shortcut (Ctrl+E)
- **Option to disable wobble:** User can turn off wobble animation in Settings but keep hold-to-edit
- **Visual changes in edit mode:**
  - Grid lines visible (subtle column/row structure)
  - Widgets wobble/jiggle (iOS-style, toggleable)
  - Resize handles appear on corners/edges
  - Remove (X) button on each widget corner
- **Add widget — three ways:**
  1. Floating '+' button opens widget picker panel
  2. Drag from widget library sidebar onto the grid
  3. Click empty grid space to place widget where you clicked
- **Recycle bin:** Bottom drawer showing recently removed widgets (drag back to restore) + Ctrl+Z undo stack for recent actions

### Widget Picker
- **Organization:** Categories (Monitoring, Productivity, AI, Media) + search bar + preview pane showing widget appearance before adding
- **Existing cards:** Each of the 9 dashboard cards available as individual widgets AND as grouped bundles ("Agent Monitor" = AgentStatusCard + AgentsCard)
- **Widget config:** Gear icon per widget (visible in edit mode or on hover) opening a config panel. Each widget type defines its own settings schema (e.g., HeartbeatCard: polling interval)

### Widget Registry (Foundation for Bjorn)
- **Three-tier layered architecture:**
  1. **Built-in widgets** — shipped with the app (the 9 existing cards + bundles)
  2. **User widgets** — installed from marketplace/downloaded (future)
  3. **AI widgets** — Bjorn-generated modules (Phase 7)
- Each tier has different trust levels (built-in = full trust, user = validated, AI = sandboxed)
- Registry uses a WidgetPlugin interface: `{ id, component, configSchema, metadata, tier }`

### Default Layout
- **Smart default + curated:** Auto-generate layout from enabled modules, but with a curated arrangement (not random placement)
- **Reset:** Per-page and global "Reset to default layout" option

### Persistence & Sync
- **Layout storage:** Default auto-reflow + optional per-breakpoint custom layouts
- **Sync per Supabase account:** Each user's layouts saved per user_id. New devices get the user's layouts on setup. RLS protects data between users on shared instances.
- **SQLite local + Supabase sync** — follows existing offline-first pattern (sync.rs)

### Claude's Discretion
- Exact column calculation formula at each breakpoint
- iOS wobble animation CSS implementation
- Widget picker panel layout and animation
- How preset sizes map to grid cells (S=1x1, M=2x1, etc.)
- Floating/pinned widget z-order management
- Default layout widget arrangement
- Dot indicator style and positioning

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Dashboard Code
- `frontend/src/pages/Dashboard.tsx` — Current static dashboard layout (to be rewritten)
- `frontend/src/pages/dashboard/` — 9 existing card components + useDashboardData hook + types
- `frontend/src/pages/dashboard/types.ts` — Dashboard card type definitions

### Research
- `.planning/research/STACK.md` — Recommends react-grid-layout v2 for dashboard grid
- `.planning/research/ARCHITECTURE.md` — Widget Registry pattern, build order
- `.planning/research/PITFALLS.md` — Dashboard state sync race condition warning (#4)

### Layout System (Phase 1)
- `frontend/src/globals.css` — Container query breakpoints (compact/default/wide)
- `frontend/src/components/LayoutShell.tsx` — Container query context, sidebar auto-collapse

### Persistence
- `src-tauri/src/sync.rs` — Offline-first SQLite ↔ Supabase sync engine
- `frontend/src/lib/preferences-sync.ts` — Multi-device preference sync pattern

### Design System (Phase 1)
- `frontend/src/components/ui/Button.tsx` — 4-variant button hierarchy
- `frontend/src/components/ui/EmptyState.tsx` — Empty state for empty dashboard pages
- `frontend/src/components/ui/ErrorState.tsx` — Error state with retry for widget failures

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `Dashboard.tsx` — Will be rewritten to use grid, but `useDashboardData` hook and the 9 card components are reused as grid widgets
- `useDashboardData.ts` — Centralized data fetching hook (polling at 10s/30s intervals)
- All 9 card components — Refactored to implement WidgetPlugin interface, wrapped in error boundaries
- `EmptyState`, `ErrorState`, `Button` — Phase 1 components for widget feedback states
- `sidebar-config.ts` — Sidebar state management with undo/redo stacks — reference for dashboard undo

### Established Patterns
- `useSyncExternalStore` — For reactive dashboard state
- `useLocalStorageState` — For local layout persistence
- `preferences-sync.ts` — For Supabase layout sync
- `React.lazy()` — For lazy-loading widget components in the registry
- `PageErrorBoundary` — For per-widget error boundaries

### Integration Points
- `Dashboard.tsx` — Complete rewrite with grid system
- `LayoutShell.tsx` — Dashboard tabs navigation
- `sidebar-config.ts` — Dashboard sub-items in sidebar
- `nav-items.ts` — Multiple dashboard pages as nav items
- `sync.rs` — New table for widget_layouts in SQLite
- Supabase migration — New `widget_layouts` table with RLS

</code_context>

<specifics>
## Specific Ideas

- "THIS IS THE CENTER OF THE PAGE" — dashboard is THE most important page, must feel premium
- "Discord-like customizability and Apple Widget #1" — the two reference points for UX
- Dashboard pages are like Discord server channels — scrollable, named, switchable
- App title always pinned at top like a Discord server name
- iOS wobble mode is the edit mode signature interaction — but can be disabled
- Three-tier Widget Registry is forward-looking: built-in now, marketplace and Bjorn later
- Ctrl+Z undo for dashboard edits is essential for fearless customization

</specifics>

<deferred>
## Deferred Ideas

- **Widget marketplace** — Download extensions, themes, widgets, modules, packs from GitHub. Users can install community-made widgets. This is a major new capability requiring: download, validation, sandboxing, versioning, dependency management. Separate phase.
- **Split layouts** — Split the app into 2+ panes showing different pages/dashboards side by side. Cross-cutting windowing feature.
- **Popout windows** — Detach a dashboard page or widget into its own OS window. Tauri multi-window capability.
- **Module packs** — Modules bundled with widgets and themes as installable packages. Marketplace feature.

</deferred>

---

*Phase: 04-dashboard-grid-widget-system*
*Context gathered: 2026-03-19*
