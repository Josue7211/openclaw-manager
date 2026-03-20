---
phase: 03-setup-wizard-onboarding
plan: 06
subsystem: ui
tags: [guided-tour, spotlight-overlay, clip-path, useSyncExternalStore, portal, accessibility]

# Dependency graph
requires:
  - phase: 03-setup-wizard-onboarding (plan 03)
    provides: SetupWizard shell, wizard-store, animation-intensity store
provides:
  - Guided tour overlay system with spotlight cutout and data-driven stops
  - Tour state store with persistence and section-skip support
  - TourTooltip with smart placement, arrow, ARIA dialog, focus trap
  - data-tour attribute convention for targeting UI elements
affects: [03-05 (completion flow can trigger startTour), settings (re-run walkthrough)]

# Tech tracking
tech-stack:
  added: []
  patterns: [clip-path polygon evenodd for spotlight cutout, data-tour attributes for tour targeting, ResizeObserver for dynamic repositioning]

key-files:
  created:
    - frontend/src/lib/tour-store.ts
    - frontend/src/components/tour/TourTooltip.tsx
    - frontend/src/components/GuidedTour.tsx
  modified:
    - frontend/src/components/LayoutShell.tsx
    - frontend/src/components/Sidebar.tsx
    - frontend/src/components/GlobalSearch.tsx
    - frontend/src/components/ConnectionStatus.tsx

key-decisions:
  - "clip-path polygon with evenodd fill rule for spotlight cutout -- clicks pass through naturally"
  - "Tour stops defined as const array with CSS selector targets -- fully data-driven"
  - "TourTooltip uses viewport collision detection with 4-direction fallback"
  - "data-tour attribute convention added to 7 existing elements across Sidebar, GlobalSearch, ConnectionStatus, LayoutShell"

patterns-established:
  - "data-tour attributes: CSS selector targeting for guided tour stops"
  - "Tour store: useSyncExternalStore with localStorage persistence for tour progress"

requirements-completed: [WIZARD-05]

# Metrics
duration: 6min
completed: 2026-03-20
---

# Phase 03 Plan 06: Guided Tour Overlay System Summary

**Spotlight overlay tour with clip-path cutout, positioned tooltips, 8 data-driven stops across 3 sections, and LayoutShell integration**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-20T04:19:06Z
- **Completed:** 2026-03-20T04:25:23Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Tour store with 8 stops in 3 sections (Navigation, Dashboard, Key Features) using useSyncExternalStore pattern with localStorage persistence
- TourTooltip with smart placement (4-direction fallback), CSS triangle arrow, viewport collision detection, resize recalculation, ARIA dialog role, and focus trap
- GuidedTour overlay with clip-path polygon evenodd cutout allowing clicks through to target elements, ResizeObserver tracking, scroll/resize recalculation
- LayoutShell lazy-renders GuidedTour when tour is active; 7 data-tour attributes added to Sidebar, GlobalSearch, ConnectionStatus, and LayoutShell

## Task Commits

Each task was committed atomically:

1. **Task 1: Tour store + TourTooltip component** - `85ed8ad` (feat)
2. **Task 2: GuidedTour overlay with spotlight cutout + LayoutShell integration** - `d819c33` (feat)

## Files Created/Modified
- `frontend/src/lib/tour-store.ts` - Tour state store with 8 stops, useSyncExternalStore, section skip, localStorage persistence
- `frontend/src/components/tour/TourTooltip.tsx` - Positioned tooltip with smart placement, arrow, ARIA dialog, focus trap
- `frontend/src/components/GuidedTour.tsx` - Full-screen spotlight overlay via portal with clip-path cutout
- `frontend/src/components/LayoutShell.tsx` - Added lazy GuidedTour render, data-tour="dashboard" on main, tour state subscription
- `frontend/src/components/Sidebar.tsx` - Added data-tour="sidebar", data-tour="module-list", data-tour="settings"
- `frontend/src/components/GlobalSearch.tsx` - Added data-tour="search", data-tour="command-palette"
- `frontend/src/components/ConnectionStatus.tsx` - Added data-tour="connection-status"

## Decisions Made
- Used clip-path polygon with evenodd fill rule for the spotlight cutout. This creates a "hole" in the overlay backdrop that naturally allows pointer events to pass through to the target element without needing pointer-events tricks.
- Tour stops are a const array of TourStop objects with CSS selector targets. No hardcoded component references; new stops can be added by appending to the array and adding a data-tour attribute.
- TourTooltip uses a 4-direction fallback chain for placement: tries preferred direction first, then opposite, then perpendicular. This handles edge cases like sidebar elements near screen edges.
- The `data-tour="shortcuts"` target is intentionally absent from the DOM (no visible trigger element exists for keyboard shortcuts). The tour gracefully handles missing targets by showing a centered fallback message.

## Deviations from Plan

None -- plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None -- no external service configuration required.

## Next Phase Readiness
- Tour system is complete and ready for integration with the wizard completion flow (plan 03-05's "Take a Quick Tour" button)
- Settings page can add a "Re-run Walkthrough" button that calls startTour()
- New tour stops can be added by extending TOUR_STOPS array and adding data-tour attributes

## Self-Check: PASSED

- FOUND: frontend/src/lib/tour-store.ts (7895 bytes)
- FOUND: frontend/src/components/tour/TourTooltip.tsx (11363 bytes)
- FOUND: frontend/src/components/GuidedTour.tsx (6827 bytes)
- FOUND: 85ed8ad (Task 1 commit)
- FOUND: d819c33 (Task 2 commit)
- All 1564 tests passing

---
*Phase: 03-setup-wizard-onboarding*
*Completed: 2026-03-20*
