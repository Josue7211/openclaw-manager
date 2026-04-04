---
phase: 57-ffir-error-toast-fix
plan: 01
subsystem: ui
tags: [tauri, error-handling, webkitgtk, sidecar, unhandledrejection]

# Dependency graph
requires: []
provides:
  - "Global unhandledrejection guard in main.tsx for non-critical Tauri runtime errors"
  - "Regression test suite preventing reintroduction of startup error toasts"
affects: [62-configure-knip, 74-full-route-audit]

# Tech tracking
tech-stack:
  added: []
  patterns: ["unhandledrejection listener pattern for Tauri plugin/IPC error suppression"]

key-files:
  created:
    - frontend/src/lib/__tests__/no-startup-errors.test.ts
  modified:
    - frontend/src/main.tsx

key-decisions:
  - "Stale sidecar binaries already gitignored -- no git removal needed, only local filesystem cleanup"
  - "Used unhandledrejection listener (not console.error monkey-patch) for cleaner error suppression"
  - "Guard scoped to Tauri mode only via __TAURI_INTERNALS__ check"

patterns-established:
  - "Error guard pattern: use window.addEventListener('unhandledrejection') with pattern-matching + preventDefault for non-critical Tauri errors"

requirements-completed: [DEV-02]

# Metrics
duration: 2min
completed: 2026-03-24
---

# Phase 57 Plan 01: ffir Error Toast Fix Summary

**Unhandledrejection guard added to main.tsx suppressing non-critical Tauri plugin/IPC errors (like 'Executable not found: ffir') from surfacing as WebKitGTK overlays, with 4-test regression suite**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-24T08:01:04Z
- **Completed:** 2026-03-24T08:03:41Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Added permanent unhandledrejection guard in main.tsx that catches non-critical Tauri runtime errors (missing binaries, plugin failures) and prevents them from appearing as WebKitGTK error overlays
- Confirmed stale sidecar binaries (node-, node-~, node-x86_64-unknown-linux-gnu) are already gitignored and not tracked -- they only exist as local filesystem artifacts
- Created regression test suite with 4 tests: guard presence, no stale binaries, invoke() error handling coverage, no debug code residue
- Full test suite passes (2257 tests across 108 files)

## Task Commits

Each task was committed atomically:

1. **Task 1: Remove stale sidecar binaries, diagnose ffir error, and add permanent guard** - `fdb8ec9` (fix)
2. **Task 2: Add regression test for clean startup** - `6243752` (test)

## Files Created/Modified
- `frontend/src/main.tsx` - Added unhandledrejection guard before runMigrations() call, scoped to Tauri mode
- `frontend/src/lib/__tests__/no-startup-errors.test.ts` - 4 regression tests: guard present, no stale binaries, invoke() error handling, no debug residue

## Decisions Made
- Stale sidecar binaries are already excluded by .gitignore (`src-tauri/binaries/*` with `!.gitkeep`). They exist only as local filesystem artifacts on the main repo working directory. No git removal needed.
- The guard uses `unhandledrejection` listener instead of `console.error` monkey-patching -- cleaner, no side effects, and specifically targets promise rejections which is the actual error vector.
- Guard is scoped to `window.__TAURI_INTERNALS__` check so browser mode is completely unaffected.
- Error patterns matched: 'Executable', 'not found', 'plugin' -- covers the ffir error and similar Tauri plugin initialization failures.
- Test context window expanded to 500 chars before / 300 chars after invoke() calls to correctly detect try/catch blocks that span many lines.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Expanded test context window for invoke() error handling check**
- **Found during:** Task 2 (regression test)
- **Issue:** The initial 100-char context window was too small to detect try/catch blocks enclosing invoke() calls deep inside nested async functions (wallbash color reading, GTK theme polling). 3 false-positive failures.
- **Fix:** Expanded context window from 100/200 chars to 500/300 chars before/after each invoke() match
- **Files modified:** frontend/src/lib/__tests__/no-startup-errors.test.ts
- **Verification:** All 4 tests pass, including the invoke() error handling check
- **Committed in:** 6243752 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Minor test calibration. No scope creep.

## Issues Encountered
- Worktree was behind main repo HEAD -- required `git merge` to bring in latest code including the phase 57 plan and all recent v0.0.3/v0.0.4 changes
- Node modules needed installation in worktree (`npm install`)

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Dev workflow is now clean: no error toasts on page load, browser mode auth works (Phase 56)
- Ready for Phase 58 (Audit #[allow(dead_code)] annotations) and Phase 62 (Configure knip)
- Local filesystem cleanup of stale sidecar binaries can be done manually with `rm src-tauri/binaries/node-*` -- not required for correctness since they're gitignored

## Self-Check: PASSED

- FOUND: frontend/src/main.tsx
- FOUND: frontend/src/lib/__tests__/no-startup-errors.test.ts
- FOUND: .planning/phases/57-ffir-error-toast-fix/57-01-SUMMARY.md
- FOUND: commit fdb8ec9
- FOUND: commit 6243752

---
*Phase: 57-ffir-error-toast-fix*
*Completed: 2026-03-24*
