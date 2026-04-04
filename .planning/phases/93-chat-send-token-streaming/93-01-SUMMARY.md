---
phase: 93-chat-send-token-streaming
plan: "01"
subsystem: api
tags: [rust, axum, gateway, openclaw, validation]

# Dependency graph
requires:
  - phase: 92-chat-history-display
    provides: gateway_forward function and existing gateway router
  - phase: 91-session-list
    provides: gateway.rs base file with sessions routes
provides:
  - POST /api/gateway/chat/send Axum route with input validation
  - gateway_chat_send handler forwarding to OpenClaw /chat/send
  - ChatSendBody deserialization struct (session_key, message, deliver, idempotency_key)
affects:
  - 93-02 (SSE token streaming plan will consume this endpoint)
  - frontend chat pages that will call POST /api/gateway/chat/send

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "gateway_forward(Method::POST, path, payload) for all write operations to OpenClaw"
    - "Validation-first handler: check inputs before constructing payload"
    - "Match on AppError::BadRequest to preserve client-facing messages through map_err"

key-files:
  created: []
  modified:
    - src-tauri/src/routes/gateway.rs

key-decisions:
  - "Session key is validated (non-empty, <=100 chars) when present but remains optional — null/absent starts a new session"
  - "gateway_forward 5xx errors re-mapped to BadRequest with a generic message — 5xx details never leak to client"
  - "Idempotency key max 64 chars matches common UUID/ULID lengths plus some slack"

patterns-established:
  - "Post handler pattern: RequireAuth extractor + Json body + validate + construct payload + gateway_forward + Ok(Json(envelope))"
  - "Test validation logic directly (pure functions) — no async/AppState needed for unit tests"

requirements-completed: [CHAT-02]

# Metrics
duration: 2min
completed: 2026-03-25
---

# Phase 93 Plan 01: Chat Send Route Summary

**POST /api/gateway/chat/send Axum endpoint with message/idempotency validation forwarding to OpenClaw /chat/send**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-25T03:57:56Z
- **Completed:** 2026-03-25T03:59:22Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Added `ChatSendBody` struct with `session_key` (optional), `message`, `deliver`, `idempotency_key` fields
- Added `gateway_chat_send` handler with three validation rules: non-empty message, 32KB message limit, non-empty idempotency key with 64-char cap
- Registered `POST /api/gateway/chat/send` in the gateway router
- Added 3 unit tests covering all validation edge cases (empty message, oversized message, idempotency key bounds)
- All 14 gateway tests pass (11 pre-existing + 3 new)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add POST /api/gateway/chat/send route with validation** - `0657114` (feat)

**Plan metadata:** _(docs commit follows)_

## Files Created/Modified
- `src-tauri/src/routes/gateway.rs` - Added ChatSendBody struct, gateway_chat_send handler, route registration, 3 unit tests

## Decisions Made
- Session key is optional: absent or null means new session; when provided it must be non-empty and <=100 chars (consistent with existing session key validation in gateway_session_history)
- 5xx gateway errors are remapped to BadRequest with a generic "failed to send message" message — same pattern as all other gateway handlers in this file to avoid leaking internal details
- Idempotency key validation: empty OR >64 chars both return the same "invalid idempotencyKey" error to avoid leaking size constraints

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- POST /api/gateway/chat/send is live and compiles cleanly
- Plan 02 (SSE token streaming) can now hook into gateway events and stream tokens back to the frontend
- No blockers

---
*Phase: 93-chat-send-token-streaming*
*Completed: 2026-03-25*
