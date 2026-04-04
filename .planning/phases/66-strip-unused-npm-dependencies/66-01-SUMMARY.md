---
phase: 66-strip-unused-npm-dependencies
plan: 01
subsystem: infra
tags: [npm, knip, dependencies, vite, bundle]

# Dependency graph
requires: []
provides:
  - Clean package.json with no dead npm packages
  - Accurate knip.json with minimal ignoreDependencies
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "knip ignoreDependencies for CSS-only and @types-only packages"

key-files:
  created: []
  modified:
    - frontend/package.json
    - frontend/package-lock.json
    - frontend/vite.config.ts
    - frontend/knip.json
    - frontend/tsconfig.app.json

key-decisions:
  - "Keep @types/dompurify and @types/lz-string in ignoreDependencies -- knip cannot detect @types usage via source imports"
  - "Add tailwindcss to ignoreDependencies -- used via CSS @import invisible to knip"

patterns-established:
  - "knip ignoreDependencies: only entries knip genuinely cannot detect (CSS imports, @types packages)"

requirements-completed: [DEAD-02]

# Metrics
duration: 3min
completed: 2026-03-24
---

# Phase 66 Plan 01: Strip Unused npm Dependencies Summary

**Removed @novnc/novnc and @types/novnc__novnc from package.json, cleaned novnc vite chunk, and trimmed knip ignoreDependencies to 3 entries**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-24T09:49:28Z
- **Completed:** 2026-03-24T09:52:01Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Removed 2 unused npm dependencies (@novnc/novnc, @types/novnc__novnc)
- Removed novnc manualChunks entry from vite.config.ts
- Cleaned novnc__novnc type reference from tsconfig.app.json
- Trimmed knip ignoreDependencies from 6 entries to 3 (removed 4 redundant, added tailwindcss)
- knip --include dependencies reports zero issues

## Task Commits

Each task was committed atomically:

1. **Task 1: Remove dead npm packages and clean vite config** - `d1de3be` (chore)
2. **Task 2: Clean knip ignoreDependencies and add tailwindcss** - `de5328a` (chore)

## Files Created/Modified
- `frontend/package.json` - Removed @novnc/novnc and @types/novnc__novnc from dependencies
- `frontend/package-lock.json` - Regenerated without removed packages
- `frontend/vite.config.ts` - Removed novnc manualChunks entry
- `frontend/tsconfig.app.json` - Removed novnc__novnc from types array
- `frontend/knip.json` - Trimmed ignoreDependencies to [@types/dompurify, @types/lz-string, tailwindcss]

## Decisions Made
- Kept @types/dompurify and @types/lz-string in ignoreDependencies because knip cannot detect @types packages via source imports (they provide type definitions, not runtime imports)
- Added tailwindcss to ignoreDependencies because it is used via CSS @import which knip cannot detect

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Removed novnc__novnc from tsconfig.app.json types array**
- **Found during:** Task 1 (Remove dead npm packages)
- **Issue:** tsconfig.app.json had `"novnc__novnc"` in the `types` array, causing `tsc -b` to fail with "Cannot find type definition file"
- **Fix:** Removed the entry from the types array
- **Files modified:** frontend/tsconfig.app.json
- **Verification:** vite build succeeds
- **Committed in:** d1de3be (Task 1 commit)

**2. [Rule 1 - Bug] Kept @types/dompurify and @types/lz-string in ignoreDependencies**
- **Found during:** Task 2 (Clean knip ignoreDependencies)
- **Issue:** Plan assumed knip detects all 6 entries via source imports, but knip cannot detect @types packages -- it reported them as unused
- **Fix:** Kept @types/dompurify and @types/lz-string in ignoreDependencies alongside tailwindcss (3 entries instead of planned 1)
- **Files modified:** frontend/knip.json
- **Verification:** knip --include dependencies reports zero issues
- **Committed in:** de5328a (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both fixes necessary for build and knip to pass. No scope creep.

## Issues Encountered
- Pre-existing TypeScript errors in dashboard tests and other files (unrelated to this plan's changes) -- out of scope, not addressed

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- npm dependency tree is clean
- knip configuration is accurate with minimal false-positive suppressions
- Ready for any subsequent dependency or bundle work

---
*Phase: 66-strip-unused-npm-dependencies*
*Completed: 2026-03-24*
