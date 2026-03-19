---
phase: 02-theming-system
plan: 01
subsystem: ui
tags: [theming, css-variables, useSyncExternalStore, localStorage, migration, preferences-sync, react-colorful, lz-string, codemirror-css]

# Dependency graph
requires:
  - phase: 01-wizard-state-foundation
    provides: CSS variable foundation in globals.css, useSyncExternalStore pattern, preferences-sync infrastructure
provides:
  - ThemeDefinition, UserThemeOverrides, ThemeState, ThemeSchedule type system
  - 17 built-in theme presets with complete Tier 1 + Tier 2 color maps
  - ThemeStore (reactive state via useSyncExternalStore)
  - Migration v5 from old per-key theme settings to unified theme-state
  - theme-state key in preferences-sync SYNCED_KEYS
  - react-colorful, lz-string, @codemirror/lang-css dependencies
affects: [02-02, 02-03, 02-04, 02-05, 02-06, 02-07]

# Tech tracking
tech-stack:
  added: [react-colorful@5.6.1, lz-string@1.5.0, @codemirror/lang-css@6.3.1, @types/lz-string]
  patterns: [ThemeStore useSyncExternalStore, two-tier color architecture, theme migration pattern]

key-files:
  created:
    - frontend/src/lib/theme-definitions.ts
    - frontend/src/lib/theme-store.ts
    - frontend/src/lib/__tests__/theme-definitions.test.ts
    - frontend/src/lib/__tests__/theme-store.test.ts
  modified:
    - frontend/package.json
    - frontend/src/lib/migrations.ts
    - frontend/src/lib/preferences-sync.ts
    - frontend/src/lib/__tests__/migrations.test.ts
    - frontend/src/lib/__tests__/preferences-sync.test.ts

key-decisions:
  - "ThemeStore stores ripple click coordinates separately from state to avoid serializing transient UI data"
  - "Migration v5 is idempotent: skips if theme-state already exists, always removes old keys"
  - "applyThemeFromState is a placeholder (mode-only) -- full CSS property application deferred to Plan 02-02"
  - "Colorful themes (terminal, purple-mode, pink-mode, monster-high) use accent-tinted borders instead of white-alpha"
  - "Terminal theme overrides all 4 font slots to monospace for authentic look"

patterns-established:
  - "ThemeStore mutate() pattern: every mutation wraps updater function, adds lastModified, calls persist()"
  - "Two-tier color architecture: ~28 Tier 1 properties per preset, Tier 2 accent/status colors user-overridable"
  - "Migration v5 pattern: read old JSON-wrapped localStorage values, construct new unified state, remove old keys"

requirements-completed: [THEME-01, THEME-02, THEME-03, THEME-04, THEME-05]

# Metrics
duration: 8min
completed: 2026-03-19
---

# Phase 2 Plan 1: Theme Engine Foundation Summary

**17 built-in theme presets with typed ThemeDefinition system, reactive ThemeStore via useSyncExternalStore, localStorage migration v5, and preferences-sync unified theme-state key**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-19T18:08:19Z
- **Completed:** 2026-03-19T18:16:40Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- Defined complete type system (ThemeDefinition, UserThemeOverrides, ThemeState, ThemeSchedule) as the contract layer for all 7 plans in the theming phase
- Created 17 built-in theme presets (7 dark, 4 light, 4 colorful, 2 high-contrast) each with 28+ CSS custom properties covering surfaces, text, borders, glass, hover, overlays, accent, and status colors
- Built ThemeStore following exact useSyncExternalStore pattern from keybindings.ts with full mutation API (theme switching, mode, accent/glow/secondary/logo overrides, fonts, scheduling, page/category overrides, pin/unpin, custom themes)
- Migrated preferences-sync from separate theme + accent-color keys to unified theme-state key with backward-compatible v5 migration
- Installed react-colorful, lz-string, and @codemirror/lang-css for use by downstream plans

## Task Commits

Each task was committed atomically:

1. **Task 1: Install dependencies + create ThemeDefinition types + 17 preset definitions** - `cb8705b` (feat)
2. **Task 2: Create ThemeStore + migration v5 + preferences-sync theme-state key** - `1882da2` (feat)

## Files Created/Modified
- `frontend/src/lib/theme-definitions.ts` - ThemeDefinition/ThemeState types + 17 BUILT_IN_THEMES + getThemeById helper
- `frontend/src/lib/theme-store.ts` - Reactive theme state management via useSyncExternalStore with full mutation API
- `frontend/src/lib/__tests__/theme-definitions.test.ts` - 14 tests validating preset completeness, uniqueness, and category distribution
- `frontend/src/lib/__tests__/theme-store.test.ts` - 16 tests covering store operations, subscriptions, persistence, and migration v5
- `frontend/package.json` - Added react-colorful, lz-string, @codemirror/lang-css, @types/lz-string
- `frontend/src/lib/migrations.ts` - CURRENT_VERSION 4->5, v5 migration converting old theme keys to unified theme-state
- `frontend/src/lib/preferences-sync.ts` - Replaced theme + accent-color with theme-state in SYNCED_KEYS, updated side effects
- `frontend/src/lib/__tests__/migrations.test.ts` - Updated expected version from 4 to 5
- `frontend/src/lib/__tests__/preferences-sync.test.ts` - Updated tests for new theme-state key and applyThemeFromState mock

## Decisions Made
- ThemeStore stores ripple click coordinates in a separate module-level variable instead of the persisted ThemeState, avoiding serializing transient UI data to localStorage/Supabase
- Migration v5 is idempotent (skips if theme-state already exists) and always removes old keys even if theme-state already existed, preventing stale keys
- applyThemeFromState is implemented as a mode-only placeholder (sets data-theme attribute) -- full CSS custom property application will be implemented in Plan 02-02
- Colorful themes use accent-tinted border colors (e.g., `rgba(51, 255, 51, 0.1)` for Terminal) instead of generic white-alpha borders, providing a cohesive visual identity
- Terminal theme sets all 4 font slots to monospace font stack for authentic terminal appearance

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated existing migration and preferences-sync tests**
- **Found during:** Task 2 (ThemeStore + migration + preferences-sync)
- **Issue:** Existing tests in migrations.test.ts asserted `CURRENT_VERSION = 4` and preferences-sync.test.ts referenced old `'theme'` and `'accent-color'` keys that no longer exist in SYNCED_KEYS
- **Fix:** Updated migrations.test.ts to expect version `'5'` in all assertions. Rewrote preferences-sync.test.ts to use `'theme-state'` key and mock `applyThemeFromState` instead of `applyAccentColor`
- **Files modified:** frontend/src/lib/__tests__/migrations.test.ts, frontend/src/lib/__tests__/preferences-sync.test.ts
- **Verification:** Full test suite (1103 tests, 60 files) passes with zero failures
- **Committed in:** 1882da2 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug fix)
**Impact on plan:** Necessary to maintain test suite integrity after the planned changes to migrations and preferences-sync. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Type system, preset definitions, and reactive store are ready for Plan 02-02 (theme application engine)
- Plan 02-02 will implement full `applyTheme()` that iterates preset colors onto document.documentElement.style
- All downstream plans (02-02 through 02-07) can import from theme-definitions.ts and theme-store.ts

---
*Phase: 02-theming-system*
*Completed: 2026-03-19*
