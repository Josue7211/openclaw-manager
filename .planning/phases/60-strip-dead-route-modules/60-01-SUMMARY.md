---
phase: 60-strip-dead-route-modules
plan: 01
subsystem: infra
tags: [rust, axum, dead-code, routes, cleanup]

# Dependency graph
requires:
  - phase: 58-audit-dead-code-annotations
    provides: Dead code audit identifying candidate routes
provides:
  - Three dead route modules removed (decisions.rs, dlp.rs, habits.rs = 607 lines)
  - Two kept routes documented with Called-by comments (workspace.rs, deploy.rs)
affects: [61-strip-nonexistent-gateway-methods]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Called-by comment pattern for route consumer documentation"]

key-files:
  created: []
  modified:
    - src-tauri/src/routes/mod.rs
    - src-tauri/src/routes/workspace.rs
    - src-tauri/src/routes/deploy.rs

key-decisions:
  - "Sync tables and SOFT_DELETE_TABLES arrays left intact -- tables still exist in SQLite/Supabase, only API handlers removed"

patterns-established:
  - "Called-by comment: add '// Called by: frontend/src/pages/X.tsx (functions)' above router() for auditable route provenance"

requirements-completed: [RUST-03]

# Metrics
duration: 3min
completed: 2026-03-24
---

# Phase 60 Plan 01: Strip Dead Route Modules Summary

**Deleted 3 dead backend route modules (decisions.rs, dlp.rs, habits.rs -- 607 lines) and documented 2 kept routes with Called-by provenance comments**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-24T08:57:13Z
- **Completed:** 2026-03-24T09:00:37Z
- **Tasks:** 2
- **Files modified:** 4 (1 modified, 3 deleted)

## Accomplishments
- Deleted 607 lines of dead backend code across 3 route modules with zero frontend consumers
- Added Called-by documentation to workspace.rs (Memory.tsx) and deploy.rs (LiveProcesses.tsx) for future audit provenance
- Verified cargo build and all 286 tests pass with no regressions
- Sync engine table arrays left intact as planned (tables still exist, only API handlers removed)

## Task Commits

Each task was committed atomically:

1. **Task 1: Audit and document route consumer status** - `7e3302b` (docs)
2. **Task 2: Delete dead route modules and clean mod.rs** - `562b8cf` (feat)

## Files Created/Modified
- `src-tauri/src/routes/mod.rs` - Removed 3 pub mod declarations and 3 .merge() calls
- `src-tauri/src/routes/workspace.rs` - Added Called-by comment (Memory.tsx consumer)
- `src-tauri/src/routes/deploy.rs` - Added Called-by comment (LiveProcesses.tsx consumer)
- `src-tauri/src/routes/decisions.rs` - DELETED (154 lines, decisions CRUD -- zero consumers)
- `src-tauri/src/routes/dlp.rs` - DELETED (160 lines, soft-delete restore -- zero consumers)
- `src-tauri/src/routes/habits.rs` - DELETED (293 lines, habits CRUD -- zero consumers)

## Decisions Made
- Sync tables (SYNC_TABLES, SOFT_DELETE_TABLES) intentionally kept intact because the database tables still exist and data still syncs -- only the HTTP API handlers were dead code

## Deviations from Plan

None -- plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None -- no external service configuration required.

## Next Phase Readiness
- Backend route modules are clean, ready for Phase 61 (strip nonexistent gateway methods)
- No blockers or concerns

---
*Phase: 60-strip-dead-route-modules*
*Completed: 2026-03-24*
