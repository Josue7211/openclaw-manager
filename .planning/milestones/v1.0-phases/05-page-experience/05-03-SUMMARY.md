---
phase: 05-page-experience
plan: 03
subsystem: ui
tags: [react, useSyncExternalStore, sidebar, badges, unread, event-bus, localStorage]

# Dependency graph
requires:
  - phase: 04-dashboard-grid-widget-system
    provides: "Dashboard store with pages, active page, subscribeDashboard"
  - phase: 01-responsive-layout-shell
    provides: "Sidebar component with NavSection, categories, drag-and-drop"
provides:
  - "Reactive unread badge store (unread-store.ts) with useSyncExternalStore pattern"
  - "Sidebar unread badge dots on nav items (expanded and collapsed modes)"
  - "Persisted collapsible category state (survives page reloads)"
  - "Activity indicator dots on collapsed category headers"
  - "Dashboard page sub-items in sidebar navigation"
  - "pipeline-updated event type in event-bus"
affects: [06-module-primitives, 07-bjorn-module-builder]

# Tech tracking
tech-stack:
  added: []
  patterns: ["useSyncExternalStore for reactive unread badge state", "Direct localStorage persist for view preferences (bypass undo stack)"]

key-files:
  created:
    - frontend/src/lib/unread-store.ts
    - frontend/src/lib/__tests__/unread-store.test.ts
  modified:
    - frontend/src/lib/event-bus.ts
    - frontend/src/lib/sidebar-config.ts
    - frontend/src/components/Sidebar.tsx

key-decisions:
  - "Direct localStorage persist for collapsedCategories bypasses undo stack -- collapse is a view preference, not a structural edit"
  - "Dashboard sub-items only rendered when 2+ pages exist -- single page needs no sub-navigation"
  - "subscribeDashboard used (actual export name) instead of subscribeDashboardStore from plan"

patterns-established:
  - "Unread store pattern: event-bus auto-subscriptions at module init for badge updates"
  - "View preferences bypass undo stack via direct persist to localStorage"

requirements-completed: [PAGE-03, PAGE-04, PAGE-07]

# Metrics
duration: 5min
completed: 2026-03-21
---

# Phase 05 Plan 03: Sidebar Overhaul Summary

**Reactive unread badge system with collapsible categories, activity indicators, and dashboard page sub-items wired into the sidebar**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-21T01:52:34Z
- **Completed:** 2026-03-21T01:58:08Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Created reactive unread-store.ts with useSyncExternalStore pattern and event-bus auto-subscriptions for messages, missions, todos, and pipeline events
- Replaced in-memory category open/close state with persisted collapsedCategories in sidebar-config.ts (survives page reloads)
- Added red dot unread badges on sidebar nav items with collapsed-mode small indicators and auto-clear on click
- Added activity indicator dots on collapsed category headers when any child has unread content
- Added dashboard page sub-items under Dashboard nav item, visible when 2+ pages exist

## Task Commits

Each task was committed atomically:

1. **Task 1: Create unread-store.ts and extend event-bus + sidebar-config** - `1580477` (feat)
2. **Task 2: Wire badges, collapsible persistence, and dashboard sub-items into Sidebar.tsx** - `d84fa76` (feat)

## Files Created/Modified
- `frontend/src/lib/unread-store.ts` - Reactive unread badge store with incrementUnread, markRead, setUnreadCount, useUnreadCounts
- `frontend/src/lib/__tests__/unread-store.test.ts` - 14 unit tests covering all store operations
- `frontend/src/lib/event-bus.ts` - Added pipeline-updated event type
- `frontend/src/lib/sidebar-config.ts` - Added collapsedCategories field and setCategoryCollapsed with direct persist
- `frontend/src/components/Sidebar.tsx` - Badge dots, collapsible persistence, activity indicators, dashboard sub-items, markRead on click

## Decisions Made
- Used direct localStorage persist for collapsedCategories (bypassing undo stack) because collapse/expand is a view preference, not a structural sidebar edit
- Dashboard sub-items only render when there are 2+ dashboard pages -- a single page does not need sub-navigation
- Used `subscribeDashboard` (the actual exported function name from dashboard-store.ts) instead of `subscribeDashboardStore` mentioned in the plan

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed JSX fragment wrapper for ternary expression**
- **Found during:** Task 2 (Sidebar.tsx integration)
- **Issue:** Adding dashboard sub-items after NavSection inside a ternary expression required two sibling elements, which JSX does not allow without a wrapper
- **Fix:** Wrapped NavSection + dashboard sub-items in a React fragment (`<>...</>`)
- **Files modified:** frontend/src/components/Sidebar.tsx
- **Verification:** Production build passes, all 1779 tests pass
- **Committed in:** d84fa76 (Task 2 commit)

**2. [Rule 1 - Bug] Corrected dashboard store subscription function name**
- **Found during:** Task 2 (reading dashboard-store.ts)
- **Issue:** Plan referenced `subscribeDashboardStore` but the actual export is `subscribeDashboard`
- **Fix:** Used `subscribeDashboard` import from dashboard-store.ts
- **Files modified:** frontend/src/components/Sidebar.tsx
- **Verification:** TypeScript type-check passes, no runtime errors
- **Committed in:** d84fa76 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both fixes necessary for correctness. No scope creep.

## Issues Encountered
None -- both tasks executed cleanly after the minor deviations above.

## User Setup Required
None -- no external service configuration required.

## Next Phase Readiness
- Phase 05 (Page Experience) is now complete with all 3 plans executed
- Unread badge store is ready for integration with SSE/realtime event sources
- Collapsible categories and dashboard sub-items enhance sidebar usability
- Ready for Phase 06 (Module Primitives Library)

## Self-Check: PASSED

All created files exist on disk. All commit hashes verified in git log.

---
*Phase: 05-page-experience*
*Completed: 2026-03-21*
