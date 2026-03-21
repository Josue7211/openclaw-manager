---
phase: 04-dashboard-grid-widget-system
plan: 01
subsystem: ui
tags: [react-grid-layout, widget-registry, dashboard, useSyncExternalStore, css-animation]

# Dependency graph
requires:
  - phase: 01-responsive-layout-shell
    provides: CSS variables, shared UI components
  - phase: 02-theming-system
    provides: Theme engine, CSS variable architecture
provides:
  - Widget Registry with 8 built-in widget definitions and registration API
  - Dashboard store with pages, edit mode, undo/redo, recycle bin, persistence
  - Default layout generator for 4 breakpoints (lg, md, sm, xs)
  - CSS foundation for widget wobble, grid lines, drag states, z-indices
  - react-grid-layout v2.2.2 dependency
affects: [04-02-grid-engine, 04-03-edit-mode, 04-04-widget-management, 04-05-persistence, 04-06-integration]

# Tech tracking
tech-stack:
  added: [react-grid-layout@2.2.2]
  patterns: [widget-registry-map, dashboard-store-useSyncExternalStore, per-breakpoint-layout-generator]

key-files:
  created:
    - frontend/src/lib/widget-registry.ts
    - frontend/src/lib/dashboard-store.ts
    - frontend/src/lib/dashboard-defaults.ts
    - frontend/src/lib/__tests__/widget-registry.test.ts
    - frontend/src/lib/__tests__/dashboard-store.test.ts
    - frontend/src/lib/__tests__/dashboard-defaults.test.ts
  modified:
    - frontend/package.json
    - frontend/package-lock.json
    - frontend/src/globals.css

key-decisions:
  - "Widget Registry uses Map for O(1) lookup with registerWidget() for future Bjorn AI-generated widgets"
  - "Dashboard store uses structuredClone for undo stack entries to prevent reference aliasing"
  - "All 8 built-in widgets always included in default layout regardless of enabled modules (graceful empty states)"
  - "Per-breakpoint curated layouts instead of auto-reflow: lg 12-col, md 8-col, sm/xs 4-col stacked"
  - "RecycleBin capped at 20 items, undo stack capped at 30 entries"

patterns-established:
  - "WidgetDefinition type contract: id, name, description, icon, category, tier, defaultSize, component (lazy import)"
  - "Dashboard store follows sidebar-config.ts useSyncExternalStore pattern with undo/redo"
  - "CSS dashboard namespace: .widget-wobble, .dashboard-grid-lines, .react-grid-item overrides"

requirements-completed: [DASH-07, DASH-09]

# Metrics
duration: 6min
completed: 2026-03-20
---

# Phase 04 Plan 01: Foundation Summary

**Widget Registry with 8 lazy-loaded built-in widgets, reactive dashboard store with undo/redo and recycle bin, per-breakpoint default layout generator, and CSS wobble/grid-line/drag-lift foundation**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-20T21:10:41Z
- **Completed:** 2026-03-20T21:17:23Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- Widget Registry resolves all 8 built-in widget IDs (agent-status, heartbeat, agents, missions, memory, idea-briefing, network, sessions) with correct metadata, categories, lazy imports, and bundle groupings
- Dashboard store provides full state management: pages CRUD, edit mode toggle, undo/redo (30-deep), recycle bin (max 20), wobble toggle, dot indicators toggle, localStorage persistence, and useSyncExternalStore React hook
- Default layout generator produces curated non-overlapping grid arrangements across 4 breakpoints (lg 12-col, md 8-col, sm 4-col, xs 4-col)
- CSS foundation: widget-wobble keyframe with nth-child stagger, grid-line overlay, drag placeholder, drag-lift shadow, z-index tokens, reduced-motion respect

## Task Commits

Each task was committed atomically:

1. **Task 1: Widget Registry + dashboard-defaults + react-grid-layout** - `6644cb4` (feat)
2. **Task 2: Dashboard store + CSS foundation** - `3de227a` (feat)

## Files Created/Modified
- `frontend/src/lib/widget-registry.ts` - Widget Registry: types (WidgetDefinition, WidgetProps, WidgetConfigSchema, WidgetBundle), BUILTIN_WIDGETS array, getWidget, getWidgetsByCategory, registerWidget, getWidgetBundles
- `frontend/src/lib/dashboard-store.ts` - Dashboard store: types (LayoutItem, DashboardPage, RecycleBinItem, DashboardState), all state management functions, useDashboardStore hook
- `frontend/src/lib/dashboard-defaults.ts` - Default layout generator: generateDefaultLayout, DEFAULT_ORDER, per-breakpoint layout functions
- `frontend/src/lib/__tests__/widget-registry.test.ts` - 21 tests covering all registry API
- `frontend/src/lib/__tests__/dashboard-store.test.ts` - 25 tests covering store mutations, undo, persistence
- `frontend/src/lib/__tests__/dashboard-defaults.test.ts` - 8 tests covering layout generation and overlap detection
- `frontend/package.json` - react-grid-layout v2.2.2 dependency
- `frontend/src/globals.css` - Dashboard grid CSS: wobble, grid-lines, placeholder, drag-lift, z-indices

## Decisions Made
- Widget Registry uses a Map internally for O(1) lookups, populated from BUILTIN_WIDGETS at module load time
- registerWidget() enables future Bjorn AI-generated and user-created widgets to be added dynamically
- Dashboard store uses structuredClone() for undo stack entries to prevent shared reference mutations
- All 8 built-in widgets are always included in the default layout regardless of which modules are enabled, since each widget handles missing services with graceful empty states
- Curated per-breakpoint layouts (not auto-reflow from a single layout) for each screen size
- RecycleBin capped at 20 items (FIFO eviction), undo stack capped at 30 entries (per sidebar-config.ts precedent)
- setActivePage does NOT push to undo stack (switching pages is navigation, not an edit)
- Exiting edit mode (setEditMode(false)) clears both undo and redo stacks

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- widget-registry.ts already existed as an untracked file from a prior aborted session, but matched the plan spec exactly. Tests passed immediately against it.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Widget Registry, dashboard store, and default layout generator are the foundation that Plans 02-06 build upon
- Plan 02 (Grid Engine) can now import from widget-registry.ts and dashboard-store.ts
- Plan 03 (Edit Mode) can use setEditMode, wobble CSS, grid-line overlay
- Plan 04 (Widget Management) can use removeWidget, restoreWidget, clearRecycleBin
- Plan 05 (Persistence) can use updatePageLayouts, dashboard-state localStorage key
- All 54 tests passing, TypeScript clean, production build succeeds

## Self-Check: PASSED

- All 7 created files exist on disk
- Both task commit hashes (6644cb4, 3de227a) found in git log
- All 28 acceptance criteria verified via grep

---
*Phase: 04-dashboard-grid-widget-system*
*Completed: 2026-03-20*
