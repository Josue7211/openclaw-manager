---
phase: 63-strip-novnc-dependency
plan: 01
subsystem: ui
tags: [widget-registry, migrations, dead-code-removal, novnc]

# Dependency graph
requires: []
provides:
  - "v8 dashboard-state migration stripping vnc-viewer widget instances"
  - "Clean codebase with zero noVNC references (excluding migration filter)"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dashboard state migration pattern for removed widgets"

key-files:
  created: []
  modified:
    - "frontend/src/lib/migrations.ts"
    - "frontend/src/lib/__tests__/migrations.test.ts"

key-decisions:
  - "noVNC package, component, registry entry, config, and type refs were already removed by a prior change -- only migration + test updates needed"

patterns-established:
  - "Widget removal migration: filter pluginId from dashboard-state widgets array to clean persisted layouts"

requirements-completed: [DEAD-05]

# Metrics
duration: 2min
completed: 2026-03-24
---

# Phase 63 Plan 01: Strip noVNC Dependency Summary

**Dashboard state v8 migration to strip dead vnc-viewer widget from persisted layouts, completing noVNC removal**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-24T09:18:32Z
- **Completed:** 2026-03-24T09:20:50Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Confirmed all noVNC code, packages, config, and type references were already removed from the codebase
- Added v8 localStorage migration that filters vnc-viewer widget instances from persisted dashboard-state
- Added 3 new migration tests covering vnc-viewer stripping, no-op without state, and no-op without vnc-viewer
- Updated all migration test assertions from version 7 to version 8

## Task Commits

Each task was committed atomically:

1. **Task 1: Delete VncPreviewWidget and remove all noVNC references** - No commit needed (already clean)
2. **Task 2: Add dashboard state migration and update tests** - `a89ebce` (feat)

## Files Created/Modified
- `frontend/src/lib/migrations.ts` - Bumped CURRENT_VERSION to 8, added v8 migration filtering vnc-viewer from dashboard-state
- `frontend/src/lib/__tests__/migrations.test.ts` - Updated version assertions to '8', added 3 new v8 migration tests

## Decisions Made
- Task 1 required no code changes because all noVNC references (VncPreviewWidget.tsx, @novnc/novnc package, tsconfig types, vite chunks, query keys, widget registry entry) were already removed in prior work
- Did not modify widget-registry.test.ts -- the test expects 28 widgets but registry has 29 (pre-existing mismatch unrelated to this plan)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Skipped already-completed Task 1 deletions**
- **Found during:** Task 1 (Delete VncPreviewWidget and remove all noVNC references)
- **Issue:** VncPreviewWidget.tsx already deleted, @novnc/novnc already absent from package.json, vite.config.ts already clean, tsconfig.app.json already clean, query-keys.ts already clean, widget-registry.ts already clean
- **Fix:** Verified all 9 acceptance criteria pass without changes, skipped redundant deletions
- **Files modified:** None
- **Verification:** `grep -ri 'novnc\|VncPreview\|vncStatus' frontend/src/` returns zero results (migration references to vnc-viewer are intentional)

---

**Total deviations:** 1 auto-handled (Task 1 was already done)
**Impact on plan:** No scope creep. Migration and tests are the only net-new work.

## Issues Encountered
- widget-registry.test.ts has pre-existing test failures (expects 28 widgets, actual count is 29; media suite bundle and media center preset assertions also outdated) -- these are NOT related to this plan and were left untouched per scope boundary rules

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- noVNC is fully removed from the codebase
- Dashboard state migration ensures users with persisted vnc-viewer widgets get them cleaned up on next app load

---
*Phase: 63-strip-novnc-dependency*
*Completed: 2026-03-24*
