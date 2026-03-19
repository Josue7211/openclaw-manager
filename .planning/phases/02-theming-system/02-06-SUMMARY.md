---
phase: 02-theming-system
plan: 06
subsystem: ui
tags: [codemirror, css-editor, theme-scheduling, sunrise-sunset, per-page-override, custom-css]

# Dependency graph
requires:
  - phase: 02-theming-system/01
    provides: ThemeDefinition types, ThemeState types, ThemeStore, BUILT_IN_THEMES
  - phase: 02-theming-system/02
    provides: applyTheme() engine, theme-engine.ts
provides:
  - CustomCssEditor component with CodeMirror CSS syntax highlighting and external file watcher
  - ThemeScheduler component with sunrise/sunset auto-switch and manual time ranges
  - theme-scheduling.ts with approximateSunTimes, checkSchedule, startScheduleTimer, stopScheduleTimer
  - Per-page and per-category theme override logic in LayoutShell.tsx
  - Schedule timer integration in LayoutShell.tsx
affects: [02-theming-system/07]

# Tech tracking
tech-stack:
  added: []
  patterns: [codemirror-css-editor, solar-declination-scheduling, per-page-css-variable-scoping, polling-file-watcher]

key-files:
  created:
    - frontend/src/lib/theme-scheduling.ts
    - frontend/src/lib/__tests__/theme-scheduling.test.ts
    - frontend/src/components/CustomCssEditor.tsx
    - frontend/src/components/ThemeScheduler.tsx
  modified:
    - frontend/src/components/LayoutShell.tsx

key-decisions:
  - "Solar declination formula at 40deg latitude gives +/- 30min accuracy, sufficient for theme scheduling without geolocation"
  - "External CSS file uses 2-second polling via Tauri fs plugin rather than native file watcher for simplicity"
  - "Per-page override cleanup iterates snapshot of CSS custom properties to avoid mutation during iteration"
  - "Schedule timer only starts when schedule type is not none, cleaned up on schedule change"

patterns-established:
  - "CodeMirror CSS editor pattern: EditorView with css() language, debounced 500ms onChange, injection via style element"
  - "Per-page theme override: scoped CSS variables on main element, cleanup removes only -- prefixed properties"
  - "Schedule timer: 60-second interval checks getThemeState().schedule and auto-switches via setActiveTheme()"

requirements-completed: [THEME-04, THEME-05]

# Metrics
duration: 5min
completed: 2026-03-19
---

# Phase 02 Plan 06: Power-User Theming Features Summary

**CodeMirror CSS editor with external file watcher, sunrise/sunset theme scheduling with manual time ranges, and per-page/per-category theme override scoping to main element**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-19T18:32:55Z
- **Completed:** 2026-03-19T18:38:47Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Built theme-scheduling.ts with solar declination sunrise/sunset calculation accurate to +/- 30 minutes without geolocation
- Created CustomCssEditor with CodeMirror 6 CSS language mode, syntax highlighting, 500ms debounced injection, external file tab with Tauri dialog and 2-second polling watcher
- Created ThemeScheduler with sunrise/sunset auto-switch toggle (day/night theme dropdowns, approximate times display) and manual time ranges with add/remove and 24-hour gap validation
- Added per-page and per-category theme override logic to LayoutShell that applies scoped CSS variables to the main element while keeping sidebar/titlebar in global theme
- Integrated schedule timer in LayoutShell that starts on mount when a schedule is active

## Task Commits

Each task was committed atomically:

1. **Task 1: Create theme-scheduling.ts with sunrise/sunset calculation and schedule checker (TDD)** - `ab483fb` (feat)
2. **Task 2: Create CustomCssEditor, ThemeScheduler components, and per-page override logic** - `59e3711` (feat)

## Files Created/Modified
- `frontend/src/lib/theme-scheduling.ts` - Sunrise/sunset calculation, schedule checker, 60-second auto-switch timer
- `frontend/src/lib/__tests__/theme-scheduling.test.ts` - 10 tests covering solstice/equinox times and all schedule branches
- `frontend/src/components/CustomCssEditor.tsx` - CodeMirror CSS editor with external file tab, warning banner, clear button
- `frontend/src/components/ThemeScheduler.tsx` - Sunrise/sunset toggle + manual time ranges UI with Toggle component
- `frontend/src/components/LayoutShell.tsx` - Per-page/category override logic, schedule timer integration

## Decisions Made
- Solar declination formula at 40 degrees latitude gives +/- 30 minute accuracy without requiring geolocation or SunCalc library
- External CSS file watching uses 2-second polling via Tauri fs plugin readTextFile rather than a native file watcher (simpler, sufficient for this use case)
- Per-page override cleanup iterates a snapshot of CSS custom properties to avoid array mutation during iteration
- Schedule timer only starts when schedule.type is not 'none', and is cleaned up on schedule change via useEffect dependency

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-existing ThemePicker.test.tsx failure (1 test) -- `getByText('Dark')` finds multiple elements due to mode button and category heading collision. Logged to deferred-items.md. Not related to this plan's changes.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All power-user features (custom CSS, scheduling, per-page overrides) are ready for Settings Display integration in Plan 02-07
- CustomCssEditor and ThemeScheduler components can be directly embedded in the Settings Display panel
- Per-page override logic is live in LayoutShell -- context menu trigger (Plan 02-07) will use setPageOverride/setCategoryOverride from theme-store

## Self-Check: PASSED

All 5 files verified on disk. Both commit hashes (ab483fb, 59e3711) found in git history.

---
*Phase: 02-theming-system*
*Completed: 2026-03-19*
