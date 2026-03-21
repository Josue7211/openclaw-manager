---
phase: 03-setup-wizard-onboarding
plan: 07
subsystem: ui
tags: [themes, wallbash, gtk, dark-light, counterpart, wcag]

# Dependency graph
requires:
  - phase: 02.2-theme-system-mode-fixes
    provides: "Wallbash file watcher, buildWallbashTheme, GTK_THEME_MAP, COUNTERPART_MAP"
provides:
  - "13 new theme variants (10 light, 1 dark, 2 light-from-colorful) — every theme now has dark+light"
  - "Expanded COUNTERPART_MAP with 18 bidirectional pairs for system mode switching"
  - "Wallbash generation counter for scheme-only change detection"
  - "System mode GTK theme resolution with COLOR_SCHEME-aware counterpart lookup"
affects: [settings-display, theme-picker, system-mode]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Wallbash generation counter pattern for cache-busting on scheme-only changes"
    - "System bridge pattern in tests (system->dark->light) for state-safe counterpart testing"

key-files:
  created: []
  modified:
    - "frontend/src/lib/theme-engine.ts"
    - "frontend/src/lib/theme-definitions.ts"
    - "frontend/src/lib/__tests__/theme-wallbash.test.ts"
    - "frontend/src/lib/__tests__/theme-counterpart.test.ts"
    - "frontend/src/lib/__tests__/theme-system-mode.test.ts"
    - "frontend/src/lib/__tests__/theme-definitions.test.ts"

key-decisions:
  - "Text colors darkened from official palettes for WCAG AA/AAA on composited surfaces (Rose Pine Dawn, Tokyo Night Day)"
  - "Purple-mode and pink-mode get light counterparts (not dark) since originals are already dark-category colorful themes"
  - "GTK theme dir creation deferred — desktop environment concern, not app logic"
  - "Nordic-Blue/Gruvbox-Retro/Frosted-Glass added to GTK_THEME_MAP patterns"

patterns-established:
  - "Every built-in theme has a dark<->light counterpart via COUNTERPART_MAP"
  - "resolveThemeDefinition uses COUNTERPART_MAP when GTK theme dark/light doesn't match OS COLOR_SCHEME"

requirements-completed: []

# Metrics
duration: 10min
completed: 2026-03-20
---

# Phase 03 Plan 07: Wallbash Fix + Theme Dark/Light Variants Summary

**Wallbash generation counter for scheme-only change detection, 13 new theme variants (37 total), COUNTERPART_MAP covering all 18 pairs, system mode GTK-to-counterpart resolution**

## Performance

- **Duration:** 10 min
- **Started:** 2026-03-20T03:55:04Z
- **Completed:** 2026-03-20T04:04:47Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments
- Added wallbash generation counter (_wallbashGeneration) that increments on every color/scheme change, preventing stale cache hits when only COLOR_SCHEME changes
- Added 13 new theme variants: 10 light variants (dracula-light, nord-light, rose-pine-light/Dawn, tokyo-night-light/Day, graphite-mono-light, decay-green-light, edge-runner-light, synth-wave-light, terminal-light, monster-high-light), 1 dark (material-sakura-dark), 2 light-from-colorful (purple-mode-light, pink-mode-light)
- Expanded COUNTERPART_MAP from 10 to 36 entries (18 bidirectional pairs) so every theme can auto-switch dark<->light
- Fixed resolveThemeDefinition to use COUNTERPART_MAP when GTK theme category doesn't match OS COLOR_SCHEME preference

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix wallbash dark/light/auto mode switching** - `3350cba` (feat — TDD: test + implementation)
2. **Task 2: Add missing light/dark theme variants from GTK colors** - `89935bf` (feat)
3. **Task 3: Update COUNTERPART_MAP, GTK_THEME_MAP, and system mode resolution** - `1dc7251` (feat)

## Files Created/Modified
- `frontend/src/lib/theme-engine.ts` - Added wallbash generation counter, COUNTERPART_MAP import, updated resolveThemeDefinition with counterpart lookup, expanded GTK_THEME_MAP
- `frontend/src/lib/theme-definitions.ts` - Added 13 new theme variants, expanded COUNTERPART_MAP from 10 to 36 entries
- `frontend/src/lib/__tests__/theme-wallbash.test.ts` - Added scheme-only change and generation counter tests
- `frontend/src/lib/__tests__/theme-counterpart.test.ts` - Updated counts, added 18 pair coverage, new counterpart switch tests
- `frontend/src/lib/__tests__/theme-system-mode.test.ts` - Updated for counterpart-aware resolution, added light/dark counterpart tests
- `frontend/src/lib/__tests__/theme-definitions.test.ts` - Updated theme count from 24 to 37

## Decisions Made
- Text colors darkened from official palettes for WCAG AA/AAA on composited surfaces (Rose Pine Dawn: #575279->#3b3660, Tokyo Night Day: #3760bf->#1a2b5e)
- Purple-mode and pink-mode get light counterparts (not dark) since originals are already dark-category colorful themes — plan naming adjusted accordingly
- GTK theme directory creation in ~/.themes/ deferred as a desktop environment concern, not an app code task
- Added Nordic-Blue, Gruvbox-Retro, and Frosted-Glass patterns to GTK_THEME_MAP for broader HyDE theme coverage

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed theme-system-mode tests broken by new counterpart resolution**
- **Found during:** Task 3
- **Issue:** Existing system-mode tests expected GTK dark theme to always resolve to dark variant, but new code correctly picks light counterpart when OS prefers light
- **Fix:** Updated tests to set OS dark preference explicitly and added new test cases for counterpart behavior
- **Files modified:** frontend/src/lib/__tests__/theme-system-mode.test.ts
- **Verification:** All 1564 tests pass
- **Committed in:** 1dc7251 (Task 3 commit)

**2. [Rule 1 - Bug] Fixed counterpart test state leaking between tests**
- **Found during:** Task 3
- **Issue:** Counterpart tests shared module state, causing mode to leak between tests and trigger unintended counterpart switches
- **Fix:** Used system-mode bridge pattern (setMode('system') -> setMode('dark') -> setMode('light')) to reset state without triggering counterparts
- **Files modified:** frontend/src/lib/__tests__/theme-counterpart.test.ts
- **Verification:** All counterpart tests pass in isolation and in suite
- **Committed in:** 1dc7251 (Task 3 commit)

**3. [Rule 2 - Missing Critical] WCAG contrast fixes for new light themes**
- **Found during:** Task 2
- **Issue:** Initial light theme colors from official palettes failed WCAG contrast on composited surfaces (bg-panel, bg-card)
- **Fix:** Darkened text-primary/text-secondary/text-muted for rose-pine-light, tokyo-night-light, nord-light, edge-runner-light
- **Files modified:** frontend/src/lib/theme-definitions.ts
- **Verification:** All 275 contrast tests pass
- **Committed in:** 89935bf (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (2 bugs, 1 missing critical)
**Impact on plan:** All auto-fixes necessary for correctness and accessibility. No scope creep.

## Issues Encountered
- GTK theme CSS files for HyDE themes have identical gtk.css and gtk-dark.css (both contain dark colors). Used official palettes (Rose Pine Dawn, Tokyo Night Day, Nord Snow Storm) instead of GTK extraction.
- GTK theme directory creation in ~/.themes/ skipped as a desktop environment concern — the app correctly maps existing GTK themes regardless.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Every built-in theme now has a dark<->light counterpart for seamless system mode switching
- Wallbash mode switching is fully functional with generation counter for cache-busting
- Theme infrastructure is complete for the setup wizard's theme selection step

## Self-Check: PASSED

- All 6 modified files verified present on disk
- All 3 task commits verified in git log: 3350cba, 89935bf, 1dc7251
- All 1564 vitest tests pass, cargo check passes

---
*Phase: 03-setup-wizard-onboarding*
*Completed: 2026-03-20*
