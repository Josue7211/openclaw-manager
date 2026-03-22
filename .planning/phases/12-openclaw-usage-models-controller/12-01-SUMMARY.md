---
phase: 12-openclaw-usage-models-controller
plan: 01
subsystem: api
tags: [axum, react-query, gateway-proxy, openclaw, polling]

# Dependency graph
requires:
  - phase: 09-openclaw-gateway
    provides: gateway_forward() proxy helper with credential protection
provides:
  - 3 Rust proxy routes for /openclaw/usage, /openclaw/models, /openclaw/tools
  - TypeScript interfaces for usage, models, tools response shapes
  - 3 React Query hooks with 30s polling
  - 3 centralized query keys under openclaw namespace
affects: [12-02 unified page tabs, 12-03 usage charts]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "GET-only gateway proxy handlers (no body, no deserialization struct)"
    - "Flexible TypeScript interfaces with index signatures for unknown API shapes"

key-files:
  created:
    - src-tauri/src/routes/openclaw_data.rs
    - frontend/src/pages/openclaw/types.ts
    - frontend/src/hooks/useOpenClawUsage.ts
    - frontend/src/hooks/useOpenClawModels.ts
    - frontend/src/hooks/useOpenClawTools.ts
  modified:
    - src-tauri/src/routes/mod.rs
    - frontend/src/lib/query-keys.ts

key-decisions:
  - "GET-only handlers with no deserialization struct -- simpler than crons.rs POST pattern since these are read-only"
  - "Index signatures on all TypeScript interfaces for forward-compatible unknown API shapes"

patterns-established:
  - "Read-only gateway proxy: State + RequireAuth + gateway_forward(GET) pattern"
  - "Flexible response types with optional fields and index signatures for external APIs"

requirements-completed: [MH-08]

# Metrics
duration: 4min
completed: 2026-03-22
---

# Phase 12 Plan 01: OpenClaw Usage/Models/Tools Data Layer Summary

**3 Rust proxy routes via gateway_forward() and 3 React Query hooks with 30s polling for OpenClaw usage, models, and tools data**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-22T22:14:08Z
- **Completed:** 2026-03-22T22:18:43Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- 3 GET proxy routes (/openclaw/usage, /openclaw/models, /openclaw/tools) registered in Axum router
- TypeScript interfaces with flexible shapes for all 3 response types
- 3 React Query hooks polling at 30s intervals using centralized query keys
- 269 Rust tests pass (4 new), 29 query-key tests pass, tsc --noEmit clean

## Task Commits

Each task was committed atomically:

1. **Task 1: Rust proxy routes for usage, models, and tools** - `2e71d07` (feat)
2. **Task 2: Frontend types, query keys, and React Query hooks** - `afd79ca` (feat)

## Files Created/Modified
- `src-tauri/src/routes/openclaw_data.rs` - 3 GET handlers proxying through gateway_forward with RequireAuth
- `src-tauri/src/routes/mod.rs` - Registered openclaw_data module and router merge
- `frontend/src/pages/openclaw/types.ts` - UsageData, ModelInfo, ModelsResponse, ToolInfo, ToolsResponse interfaces
- `frontend/src/lib/query-keys.ts` - Added openclawUsage, openclawModels, openclawTools keys
- `frontend/src/hooks/useOpenClawUsage.ts` - React Query hook with 30s refetchInterval
- `frontend/src/hooks/useOpenClawModels.ts` - React Query hook with 30s refetchInterval
- `frontend/src/hooks/useOpenClawTools.ts` - React Query hook with 30s refetchInterval

## Decisions Made
- GET-only handlers with no deserialization struct -- these are read-only passthrough proxies, simpler than the crons.rs POST/PATCH/DELETE pattern
- All TypeScript interfaces use index signatures (`[key: string]: unknown`) for forward compatibility with unknown OpenClaw API response shapes
- ModelsResponse includes both `models` and `data` fields since LiteLLM uses the `data` key

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Data layer complete: 3 proxy routes + 3 hooks ready for consumption by unified OpenClaw page tabs
- Types established for usage, models, and tools response shapes
- Query keys registered for cache management

## Self-Check: PASSED

- All 7 files exist on disk
- Both commits verified: `2e71d07`, `afd79ca`
- gateway_forward count: 4 (3 handlers + 1 import = correct, `grep -c` counts use line too)
- RequireAuth count: 4 (3 handlers + 1 import)
- Result<Json<Value> count: 3 (all handlers)
- Query keys registered: openclawUsage, openclawModels, openclawTools
- refetchInterval: 30_000 in all 3 hooks
- cargo test: 269 passed, 0 failed
- tsc --noEmit: clean

---
*Phase: 12-openclaw-usage-models-controller*
*Completed: 2026-03-22*
