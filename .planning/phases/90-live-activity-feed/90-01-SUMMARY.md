---
phase: 90-live-activity-feed
plan: 01
subsystem: api, ui
tags: [axum, react, react-query, sse, gateway, activity-feed]

# Dependency graph
requires:
  - phase: 09-openclaw-gateway-proxy
    provides: gateway_forward HTTP proxy pattern and sanitize_error_body
provides:
  - /api/gateway/activity endpoint using gateway_forward to /logs
  - ActivityPage component with event rendering and SSE wiring
  - gatewayActivity query key in centralized query-keys
  - /activity route registered in main.tsx router
affects: [dashboard, openclaw]

# Tech tracking
tech-stack:
  added: []
  patterns: [gateway HTTP forward for activity logs, useRealtimeSSE for page-level event invalidation]

key-files:
  created:
    - frontend/src/pages/activity/ActivityPage.tsx
    - frontend/src/pages/activity/__tests__/ActivityPage.test.tsx
  modified:
    - src-tauri/src/routes/gateway.rs
    - frontend/src/lib/query-keys.ts
    - frontend/src/main.tsx

key-decisions:
  - "Used gateway_forward HTTP to /logs instead of WS RPC logs.tail (gateway_ws not on AppState)"
  - "Used useRealtimeSSE with agents table for SSE invalidation (no useGatewaySSE hook exists)"
  - "Added 30s refetchInterval + visibility change handler for reliable real-time feel"

patterns-established:
  - "Gateway activity fetching via HTTP forward pattern (no WS RPC needed)"

requirements-completed: [LIVE-05]

# Metrics
duration: 7min
completed: 2026-03-24
---

# Phase 90 Plan 01: Live Activity Feed Summary

**Gateway activity endpoint at /api/gateway/activity with HTTP forward to /logs, SSE-wired ActivityPage rendering event cards with type pills, and 8 smoke tests**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-24T16:16:41Z
- **Completed:** 2026-03-24T16:23:42Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Created gateway_activity handler using gateway_forward HTTP pattern to /logs endpoint
- Built ActivityPage with event cards, type pills, colour-coded icons, relative timestamps, and agent/session metadata
- Wired useRealtimeSSE for SSE-based query invalidation on gateway events
- Added 8 smoke tests covering all states: loading, error, empty, events, type pills, metadata, flat array response

## Task Commits

Each task was committed atomically:

1. **Task 1: Create gateway_activity handler** - `c03c31f` (feat)
2. **Task 2: Wire SSE into ActivityPage and create smoke test** - `bdeb491` (feat)

## Files Created/Modified
- `src-tauri/src/routes/gateway.rs` - Added gateway_activity handler at /gateway/activity, 2 new path validation tests
- `src-tauri/src/routes/koel.rs` - Restored missing file from main repo (worktree sync issue)
- `frontend/src/pages/activity/ActivityPage.tsx` - Full activity feed page with event rendering, SSE wiring, loading/error/empty states
- `frontend/src/pages/activity/__tests__/ActivityPage.test.tsx` - 8 smoke tests covering all rendering states
- `frontend/src/lib/query-keys.ts` - Added gatewayActivity query key
- `frontend/src/main.tsx` - Registered /activity route with lazy loading

## Decisions Made
- Used gateway_forward (HTTP) instead of WS RPC logs.tail because gateway_ws doesn't exist on AppState -- the codebase exclusively uses HTTP forwarding for gateway communication
- Used useRealtimeSSE (existing Supabase SSE hook) instead of non-existent useGatewaySSE -- subscribes to agents table events to trigger activity feed refetch
- Added 30s refetchInterval plus visibility change handler for reliable near-real-time updates without dedicated SSE endpoint

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Used gateway_forward HTTP instead of WS RPC logs.tail**
- **Found during:** Task 1 (gateway_activity handler)
- **Issue:** Plan specified `gateway_ws.request("logs.tail", ...)` but gateway_ws field doesn't exist on AppState; no WS RPC infrastructure exists in the codebase
- **Fix:** Used gateway_forward(&state, Method::GET, "/logs", None) which follows the identical pattern used by all other gateway handlers (crons, agents, etc.)
- **Files modified:** src-tauri/src/routes/gateway.rs
- **Verification:** cargo test routes::gateway::tests -- 13 passed
- **Committed in:** c03c31f

**2. [Rule 3 - Blocking] Used useRealtimeSSE instead of non-existent useGatewaySSE**
- **Found during:** Task 2 (SSE wiring)
- **Issue:** Plan specified useGatewaySSE hook which doesn't exist in the codebase
- **Fix:** Used existing useRealtimeSSE hook (Supabase SSE) which invalidates the activity query on agents table events, plus added refetchInterval and visibility change handler for real-time feel
- **Files modified:** frontend/src/pages/activity/ActivityPage.tsx
- **Verification:** 8 vitest tests pass, SSE wiring confirmed via grep
- **Committed in:** bdeb491

**3. [Rule 3 - Blocking] Restored missing koel.rs from main repo**
- **Found during:** Task 1 (cargo check)
- **Issue:** koel.rs referenced in routes/mod.rs but missing from worktree, preventing compilation
- **Fix:** Copied koel.rs from main repo to worktree
- **Files modified:** src-tauri/src/routes/koel.rs
- **Verification:** cargo check compiles successfully
- **Committed in:** c03c31f

**4. [Rule 1 - Bug] Fixed AppError Display trait usage in tracing**
- **Found during:** Task 1 (cargo check)
- **Issue:** Used `{e}` format on AppError in tracing::error! but AppError doesn't implement Display
- **Fix:** Changed to `{e:?}` (Debug format) and used static error message string
- **Files modified:** src-tauri/src/routes/gateway.rs
- **Verification:** cargo check succeeds
- **Committed in:** c03c31f

---

**Total deviations:** 4 auto-fixed (1 bug, 3 blocking)
**Impact on plan:** All deviations were necessary adaptations to the actual codebase state. The plan referenced infrastructure (gateway_ws, useGatewaySSE) that doesn't exist; the implementations use the correct existing patterns. No scope creep.

## Issues Encountered
None beyond the deviation fixes above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Activity feed is fully wired to /api/gateway/activity endpoint
- SSE invalidation is active via useRealtimeSSE
- Page is registered at /activity route
- When OpenClaw gateway is configured with OPENCLAW_API_URL, the /logs endpoint will return real activity data

## Self-Check: PASSED

All files exist, all commits verified.

---
*Phase: 90-live-activity-feed*
*Completed: 2026-03-24*
