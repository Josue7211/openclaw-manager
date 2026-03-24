---
phase: 75-protocol-v3-handshake
plan: 01
subsystem: api
tags: [websocket, openclaw, gateway, protocol-v3, handshake, device-identity]

# Dependency graph
requires:
  - phase: none
    provides: n/a
provides:
  - Protocol v3 gateway handshake with role/scopes/client metadata
  - Device identity persistence via SQLite _device_identity table
  - Protocol version exposed in /api/gateway/status
  - Gateway WebSocket status card in Settings > Status
affects: [77-rpc-method-corrections, 78-event-bus-gateway, 79-live-verification]

# Tech tracking
tech-stack:
  added: []
  patterns: [protocol-v3-connect-message, error-object-parsing, connect-challenge-handling]

key-files:
  created:
    - src-tauri/migrations/0010_device_identity.sql
  modified:
    - src-tauri/src/gateway_ws.rs
    - src-tauri/src/routes/gateway.rs
    - src-tauri/src/server.rs
    - frontend/src/hooks/sessions/useGatewayStatus.ts
    - frontend/src/hooks/sessions/__tests__/useGatewayStatus.test.ts
    - frontend/src/pages/settings/SettingsStatus.tsx

key-decisions:
  - "Used auth.token instead of auth.type/auth.password for protocol v3 compliance"
  - "Device ID format mc-{12_hex_chars} using rand::random::<u64>() -- simpler than uuid crate"
  - "Moved gateway_ws init after db init in server.rs to enable device_id persistence"
  - "Added parse_error_value() helper shared by handle_text_frame and wait_for_handshake"

patterns-established:
  - "Protocol v3 connect message: minProtocol/maxProtocol 3, role operator, 4 scopes, client metadata"
  - "Error parsing: try error.message object first, fall back to flat string"
  - "connect.challenge: 2s timeout before sending connect, consume nonce if present"

requirements-completed: [GW-01, GW-02]

# Metrics
duration: 7min
completed: 2026-03-24
---

# Phase 75 Plan 01: Protocol v3 Handshake Summary

**Rewrote gateway WebSocket handshake to protocol v3 with role/scopes/client metadata, fixed error parsing, added device identity persistence, and surfaced protocol version in Settings UI**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-24T11:55:37Z
- **Completed:** 2026-03-24T12:02:37Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Gateway connect message now sends protocol v3 format with minProtocol/maxProtocol 3, role "operator", 4 scopes, client metadata (id, version, platform, mode, deviceId), and auth.token
- Error responses correctly parsed as { error: { message: "..." } } objects with flat string fallback
- Optional connect.challenge event handled with 2s timeout before sending connect
- Device identity persisted in SQLite _device_identity table across restarts
- /api/gateway/status returns negotiated protocol version
- Settings > Status shows Gateway WebSocket card with "Connected (protocol v3)" when connected
- 14 new Rust tests + 2 new frontend tests, all passing

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewrite gateway_ws.rs for protocol v3 handshake + fix error parsing + add protocol_version** - `e516e42` (feat)
2. **Task 2: Update frontend useGatewayStatus hook and Settings display for protocol v3** - `1db895e` (feat)

## Files Created/Modified
- `src-tauri/migrations/0010_device_identity.sql` - SQLite table for persisting device_id
- `src-tauri/src/gateway_ws.rs` - Protocol v3 connect message, connect.challenge handling, error object parsing, device_id/protocol_version fields, 14 tests
- `src-tauri/src/routes/gateway.rs` - Added protocol_version to gateway_status response
- `src-tauri/src/server.rs` - load_or_create_device_id function, moved gateway_ws init after db
- `frontend/src/hooks/sessions/useGatewayStatus.ts` - Added protocol field to types and return
- `frontend/src/hooks/sessions/__tests__/useGatewayStatus.test.ts` - 2 new tests for protocol
- `frontend/src/pages/settings/SettingsStatus.tsx` - Gateway WebSocket status card

## Decisions Made
- Used `auth.token` field instead of `auth.type: "password"` / `auth.password` -- matches protocol v3 spec from abhi1693 reference
- Device ID format is `mc-{12_hex_chars}` using `rand::random::<u64>()` -- avoids adding uuid crate just for a unique string
- Moved `gateway_ws` initialization to after `db` initialization in server.rs so device_id can be loaded from SQLite
- Created shared `parse_error_value()` helper function used by both `handle_text_frame` and `wait_for_handshake` to avoid error parsing duplication

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Protocol v3 handshake is complete and tested
- Gateway connects with full identity, scopes, and proper error handling
- Ready for RPC method corrections (phase 77) and event bus work (phase 78)
- All 296 Rust tests pass; 2445+ frontend tests pass (4 pre-existing failures unrelated to this plan)

---
*Phase: 75-protocol-v3-handshake*
*Completed: 2026-03-24*
