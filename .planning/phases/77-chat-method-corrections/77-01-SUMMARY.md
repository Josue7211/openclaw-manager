---
phase: 77-chat-method-corrections
plan: 01
subsystem: api
tags: [openclaw, gateway, rpc, protocol-v3, chat]

requires:
  - phase: 75-gateway-handshake-fix
    provides: "Protocol v3 handshake with auth.token"
provides:
  - "chat.history RPC handler with sessionKey param"
  - "chat.send RPC handler with sessionKey, message, deliver, idempotencyKey params"
  - "GET /api/gateway/sessions/:id/history route"
  - "POST /api/gateway/sessions/:id/send route"
affects: [78-session-list-method, 79-agent-crud-methods, event-bus]

tech-stack:
  added: []
  patterns:
    - "Gateway RPC routes use gateway_forward with /rpc/{method} path convention"
    - "Protocol v3 uses sessionKey (not session_id) for session identification"
    - "chat.send requires deliver boolean and idempotencyKey for deduplication"

key-files:
  created: []
  modified:
    - src-tauri/src/routes/gateway.rs

key-decisions:
  - "Used gateway_forward HTTP proxy pattern (consistent with agents, crons) rather than WebSocket RPC since gateway_ws.rs does not exist yet"
  - "Added /rpc/ prefix to method paths to distinguish RPC-style calls from REST resource paths"
  - "Used Debug format {:?} for AppError logging since AppError does not implement Display"

patterns-established:
  - "Gateway RPC handlers: validate input, call gateway_forward with /rpc/{method}, log errors with Debug format"

requirements-completed: [RPC-01, RPC-02]

duration: 6min
completed: 2026-03-24
---

# Phase 77 Plan 01: Chat Method Corrections Summary

**Added chat.history and chat.send RPC handlers in gateway.rs using correct OpenClaw protocol v3 method names, sessionKey param, and idempotencyKey deduplication**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-24T12:37:20Z
- **Completed:** 2026-03-24T12:43:40Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Added `gateway_session_history` handler calling `chat.history` with `sessionKey` param (not the wrong `sessions.history` / `session_id`)
- Added `gateway_session_send` handler calling `chat.send` with `sessionKey`, `message`, `deliver: true`, and `idempotencyKey` params (not the wrong `sessions.send` / `session_id`)
- Both handlers registered on router with proper Axum routes
- All 11 existing gateway tests pass

## Task Commits

Each task was committed atomically:

1. **Task 1+2: Add chat.history and chat.send RPC handlers** - `c0f658d` (feat)

## Files Created/Modified
- `src-tauri/src/routes/gateway.rs` - Added gateway_session_history (chat.history) and gateway_session_send (chat.send) handlers with correct protocol v3 method names and params

## Decisions Made
- Used `gateway_forward` HTTP proxy pattern rather than WebSocket RPC since no WebSocket gateway client exists yet -- consistent with how agents.rs and crons.rs call the gateway
- Added `/rpc/` prefix to method paths (`/rpc/chat.history`, `/rpc/chat.send`) to clearly distinguish RPC-style method calls from REST resource paths
- Used `{e:?}` (Debug format) for AppError in tracing::error! calls since AppError does not implement Display

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Code referenced by plan did not exist -- created handlers from scratch**
- **Found during:** Task 1 (chat.history fix)
- **Issue:** Plan assumed `gateway_session_history` and `gateway_session_send` functions already existed with wrong method names (`sessions.history`, `sessions.send`). The functions did not exist in gateway.rs -- the file only had health check, path validation, error sanitization, and `gateway_forward`.
- **Fix:** Created both handlers from scratch using the correct protocol v3 method names (`chat.history`, `chat.send`) and parameter shapes (`sessionKey`, `deliver`, `idempotencyKey`). Used existing `gateway_forward` pattern.
- **Files modified:** src-tauri/src/routes/gateway.rs
- **Verification:** All acceptance criteria pass, all 11 existing tests pass
- **Committed in:** c0f658d

**2. [Rule 1 - Bug] AppError does not implement Display trait**
- **Found during:** Task 1 (compilation)
- **Issue:** Error logging used `{e}` format which requires `Display`, but `AppError` only implements `Debug`
- **Fix:** Changed to `{e:?}` (Debug format) in both error log lines
- **Files modified:** src-tauri/src/routes/gateway.rs
- **Verification:** Code compiles and tests pass
- **Committed in:** c0f658d (same commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both deviations were necessary -- the plan's assumption that the code existed was wrong, so the handlers were created correctly from scratch instead of patched. The end result matches all success criteria exactly.

## Issues Encountered
- Worktree missing `koel.rs` file (referenced in routes/mod.rs but not present) -- pre-existing issue unrelated to this plan. Temporarily copied from main repo to verify compilation, then removed. Not committed.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Gateway now has chat.history and chat.send handlers with correct protocol v3 params
- Ready for phase 78 (session list method corrections) and 79 (agent CRUD method corrections)
- WebSocket RPC client (gateway_ws.rs) still does not exist -- future phases may need to implement it for real-time communication

---
*Phase: 77-chat-method-corrections*
*Completed: 2026-03-24*
