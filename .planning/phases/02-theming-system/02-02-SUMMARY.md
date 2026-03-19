---
phase: 02-theming-system
plan: 02
subsystem: ui
tags: [css-variables, view-transitions, theme-engine, font-scaling, ripple-animation]

# Dependency graph
requires:
  - phase: 02-theming-system/01
    provides: ThemeDefinition types, ThemeState types, BUILT_IN_THEMES presets, ThemeStore with useSyncExternalStore, migration v5
provides:
  - applyTheme() function that applies full CSS variable set from any preset
  - deriveAlphaTints() regeneration of 16 accent-derived alpha tint variables
  - resolveThemeDefinition() for mode/system resolution
  - performRippleTransition() View Transitions API ripple animation
  - applyFontScale() that multiplies --text-* variables safely
  - Unified startup pipeline in main.tsx via ThemeStore + ThemeEngine
affects: [02-theming-system/03, 02-theming-system/04, 02-theming-system/05, 02-theming-system/06, 02-theming-system/07]

# Tech tracking
tech-stack:
  added: []
  patterns: [view-transitions-api-ripple, css-variable-theme-application, alpha-tint-regeneration, font-scale-multiplication]

key-files:
  created:
    - frontend/src/lib/theme-engine.ts
    - frontend/src/lib/__tests__/theme-engine.test.ts
  modified:
    - frontend/src/lib/theme-store.ts
    - frontend/src/main.tsx
    - frontend/src/globals.css

key-decisions:
  - "matchMedia guarded with typeof check for test/SSR environments where window.matchMedia is undefined"
  - "applyThemeFromState signature changed from (state?) to (clickEvent?) since state is always read from internal _state"
  - "Font families append system fallback stacks rather than replacing them entirely"

patterns-established:
  - "Theme application pipeline: resolveThemeDefinition -> apply colors -> accent overrides -> alpha tints -> data-theme -> fonts -> font scale"
  - "View Transitions ripple: feature-detect -> startViewTransition -> clip-path circle animation -> fallback to instant apply"
  - "Alpha tint regeneration: parse hex to RGB, iterate ACCENT_TINTS array, set all 16 variables with rgba()"

requirements-completed: [THEME-01, THEME-04, THEME-05, THEME-08]

# Metrics
duration: 7min
completed: 2026-03-19
---

# Phase 02 Plan 02: Theme Application Engine Summary

**CSS variable theme engine with View Transitions API ripple animation, alpha tint regeneration, font scaling, and unified startup pipeline in main.tsx**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-19T18:20:04Z
- **Completed:** 2026-03-19T18:27:26Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Built complete theme application engine that applies all CSS variables from any of 17 presets
- Alpha tints regenerated from active accent color on every theme switch (16 variables, Pitfall #1 prevention)
- View Transitions API ripple animation with graceful fallback for WebKitGTK and prefers-reduced-motion (Pitfall #2 prevention)
- Font scale multiplies --text-* variables without touching html font-size (Pitfall #5 prevention)
- Unified app startup: replaced 3 fragmented IIFEs in main.tsx with single applyThemeFromState() call
- System-follow mode uses single matchMedia listener through ThemeStore

## Task Commits

Each task was committed atomically:

1. **Task 1: Create theme-engine.ts with applyTheme, alpha tints, ripple animation, and font scaling** - `ca45535` (feat) — TDD: RED tests committed as part of 02-03 wave, GREEN implementation here
2. **Task 2: Wire theme engine into main.tsx and update ThemeStore's applyThemeFromState** - `b41813a` (feat)

## Files Created/Modified
- `frontend/src/lib/theme-engine.ts` - Theme application engine: resolveThemeDefinition, deriveAlphaTints, applyFonts, applyFontScale, performRippleTransition, applyTheme
- `frontend/src/lib/__tests__/theme-engine.test.ts` - 16 tests covering resolution, tints, application, font scaling, and ripple fallback
- `frontend/src/lib/theme-store.ts` - Replaced placeholder applyThemeFromState with real engine integration, added apply calls to all mutators
- `frontend/src/main.tsx` - Removed old theme/accent/glow/secondary/logo IIFEs, replaced with unified pipeline
- `frontend/src/globals.css` - Added --font-ui variable and View Transition CSS overrides for ripple animation

## Decisions Made
- matchMedia guarded with typeof check for test/SSR environments — theme-store tests don't set up matchMedia, and the guard is safe for production
- applyThemeFromState signature changed from (state?) to (clickEvent?) — state is always read from internal _state, making the API cleaner
- Font family application appends system fallback stacks rather than replacing them

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Guard matchMedia for test environments**
- **Found during:** Task 2 (wiring into theme-store)
- **Issue:** theme-store tests don't mock window.matchMedia, causing TypeError when applyTheme is called from setActiveTheme/setMode
- **Fix:** Added `typeof window.matchMedia === 'function'` guard before all matchMedia calls in theme-engine.ts
- **Files modified:** frontend/src/lib/theme-engine.ts
- **Verification:** All 1157 tests pass after fix
- **Committed in:** b41813a (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Necessary for test compatibility. No scope creep.

## Issues Encountered
- Concurrent agent (02-03) committed theme-engine.test.ts as part of its own commit during parallel execution, causing a HEAD lock conflict on the first commit attempt. Resolved by verifying the file was already tracked and proceeding with the implementation commit.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Theme engine ready for Settings UI integration (Plan 03: ThemePicker modal)
- All exports available: applyTheme, deriveAlphaTints, resolveThemeDefinition, applyFonts, applyFontScale
- View Transition CSS in place for ripple animations when ThemePicker triggers setActiveTheme with click coordinates

---
*Phase: 02-theming-system*
*Completed: 2026-03-19*
