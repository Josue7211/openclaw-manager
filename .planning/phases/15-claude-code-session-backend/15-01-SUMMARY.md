---
phase: 15-claude-code-session-backend
plan: 01
subsystem: backend/routes
tags: [rust, axum, websocket, gateway-proxy, claude-code, sessions]
dependency_graph:
  requires: [gateway.rs, openclaw_api_url, openclaw_api_key, gateway_forward, validate_gateway_path]
  provides: [claude_sessions::router, /api/claude-sessions/*, WebSocket relay]
  affects: [mod.rs]
tech_stack:
  added: []
  patterns: [gateway_forward proxy, CAS connection guard, WebSocket bidirectional relay]
key_files:
  created: [src-tauri/src/routes/claude_sessions.rs]
  modified: [src-tauri/src/routes/mod.rs]
key_decisions:
  - Return 200 with { available: false } envelope instead of 503 status to avoid Result<Response, AppError> router registration gotcha
  - Filter sessions by kind=claude-code OR agentId presence for flexible Claude Code detection
  - Bare Response return (not Result<Response, AppError>) for WebSocket upgrade handler -- matches terminal.rs pattern
  - tokio::spawn for both relay directions with tokio::select! for clean shutdown
metrics:
  duration: 15min
  completed: 2026-03-23
  tasks: 2
  tests_added: 10
  tests_total: 284
---

# Phase 15 Plan 01: Claude Code Session Backend Summary

REST CRUD + CAS-guarded WebSocket relay for Claude Code sessions, proxied through gateway_forward() to OpenClaw VM with credential protection and input validation.

## What Was Built

### Task 1: REST CRUD handlers + CAS guard + route registration
**Commit:** `5d26a35`

Created `src-tauri/src/routes/claude_sessions.rs` with five REST handlers:

1. **list_sessions** (GET /api/claude-sessions) -- Fetches all sessions via gateway, filters to `kind == "claude-code"` or sessions with `agentId` present. Returns `{ available: false, sessions: [] }` envelope when VM unreachable instead of a hard error.

2. **get_session** (GET /api/claude-sessions/:id) -- Session detail with ID validation (1-100 chars).

3. **create_session** (POST /api/claude-sessions) -- Spawns new session via `/sessions/spawn` with `{ task, model?, workingDir? }`. Validates task non-empty and max 2000 chars.

4. **kill_session** (POST /api/claude-sessions/:id/kill) -- Terminates session via DELETE to `/sessions/{id}`.

5. **session_ws_status** (GET /api/claude-sessions/status) -- Returns `{ active, max, available }` for CAS guard capacity.

Also implemented `SessionWsGuard` CAS pattern (AtomicUsize + RAII Drop, max 5) for WebSocket connection limiting. Registered module in `mod.rs` with `pub mod claude_sessions` and `.merge(claude_sessions::router())`.

10 unit tests covering deserialization, path validation, CAS guard, status shape, and ID validation.

### Task 2: WebSocket relay handler for live session output streaming
**Commit:** `daa9bf0`

Added `ws_upgrade` and `handle_session_ws` to claude_sessions.rs:

- **ws_upgrade** validates session ID, acquires CAS guard, then upgrades to WebSocket
- **handle_session_ws** connects to upstream OpenClaw VM via tokio-tungstenite with Bearer auth header
- Bidirectional frame relay: upstream->client and client->upstream using split + tokio::spawn
- Both sides async (no OS threads needed -- unlike terminal.rs PTY)
- Error path sends JSON error to client before closing if upstream connection fails
- Never logs upstream URL (Tailscale IP protection)

Full route set registered: list, get, create, kill, status, ws.

## Deviations from Plan

None -- plan executed exactly as written.

## Verification Results

- `cargo test claude_sessions`: 10 passed, 0 failed
- `cargo test` (full suite): 284 passed, 0 failed, 0 regressions
- No compilation errors or warnings from claude_sessions.rs
- Route registration verified in mod.rs
- Status route placed before :id route to prevent path parameter capture

## Files

| File | Action | Lines |
|------|--------|-------|
| src-tauri/src/routes/claude_sessions.rs | Created | 527 |
| src-tauri/src/routes/mod.rs | Modified | +2 lines |

## Self-Check: PASSED

- claude_sessions.rs: FOUND
- Commit 5d26a35: FOUND
- Commit daa9bf0: FOUND
