---
phase: 81-usage-method-correction
plan: 01
subsystem: api
tags: [openclaw, gateway, websocket, rpc, usage.status, usage.cost]

# Dependency graph
requires:
  - phase: 75-protocol-v3-handshake
    provides: gateway_ws WS client, AppState.gateway_ws field
provides:
  - GET /api/gateway/usage/status endpoint proxying usage.status via WS RPC
  - GET /api/gateway/usage/cost endpoint proxying usage.cost via WS RPC
affects: [frontend-usage-tab, openclaw-dashboard, 89-live-usage-models-tabs]

# Tech tracking
tech-stack:
  added: []
  patterns: [gateway WS RPC proxy for usage data]

key-files:
  created: []
  modified:
    - src-tauri/src/routes/gateway.rs
    - src-tauri/src/routes/openclaw_data.rs

key-decisions:
  - "Used gateway_ws WS RPC pattern (matching gateway_activity) rather than HTTP gateway_forward for usage routes"
  - "Removed HTTP proxy route /openclaw/usage entirely -- usage data now flows through WS RPC only"

patterns-established:
  - "WS RPC proxy pattern for usage.status and usage.cost"

requirements-completed: [RPC-07]

# Metrics
duration: 2min
completed: 2026-03-24
---

# Phase 81 Plan 01: Usage Method Correction Summary

**Replaced HTTP proxy usage route with WS RPC handlers for usage.status and usage.cost, matching protocol v3 method names**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-24T12:56:36Z
- **Completed:** 2026-03-24T12:58:49Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments
- Added `gateway_usage_status` handler proxying `usage.status` via persistent WebSocket RPC
- Added `gateway_usage_cost` handler proxying `usage.cost` via persistent WebSocket RPC
- Registered both routes at `/gateway/usage/status` and `/gateway/usage/cost`
- Removed old HTTP proxy `get_usage` from `openclaw_data.rs`
- Zero references to `usage.summary` in the codebase
- All 298 Rust tests pass

## Task Commits

Each task was committed atomically:

1. **Task 1: Add gateway WS usage.status and usage.cost routes, remove HTTP proxy** - `1e18490` (feat)

## Files Created/Modified
- `src-tauri/src/routes/gateway.rs` - Added gateway_usage_status and gateway_usage_cost handlers using WS RPC, registered /gateway/usage/status and /gateway/usage/cost routes
- `src-tauri/src/routes/openclaw_data.rs` - Removed get_usage handler, /openclaw/usage route, and usage-related tests

## Decisions Made
- Used the `gateway_ws` WebSocket RPC pattern (matching `gateway_activity` from phase 83) rather than HTTP `gateway_forward`, since the plan specifies WS RPC for protocol v3 compliance
- Removed the usage path validation test from openclaw_data.rs since it was testing a removed route

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Usage endpoints ready for frontend consumption at GET /api/gateway/usage/status and GET /api/gateway/usage/cost
- Response shape `{ ok: true, data: payload }` matches existing gateway proxy patterns
- Frontend Usage tab can be updated to call these new endpoints instead of /openclaw/usage

## Self-Check: PASSED
