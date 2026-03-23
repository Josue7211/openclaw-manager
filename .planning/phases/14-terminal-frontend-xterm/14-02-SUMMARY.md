---
phase: 14-terminal-frontend-xterm
plan: 02
subsystem: terminal
tags: [gap-closure, pre-flight, capacity, xterm]
dependency_graph:
  requires: [14-01]
  provides: [terminal-capacity-check]
  affects: [terminal-widget]
tech_stack:
  added: []
  patterns: [pre-flight-http-check, async-useEffect-setup, CAS-status-endpoint]
key_files:
  created: []
  modified:
    - src-tauri/src/routes/terminal.rs
    - frontend/src/hooks/useTerminal.ts
decisions:
  - "Pre-flight HTTP check over WebSocket-only approach -- browser WebSocket API cannot read HTTP response bodies from rejected upgrades"
  - "Async IIFE pattern in useEffect with local closure variables for cleanup correctness"
  - "saturating_sub for available count to prevent underflow edge cases"
  - "didOpen boolean flag for stale closure avoidance in onclose handler"
metrics:
  duration: 6min
  completed: "2026-03-23T04:59:00Z"
---

# Phase 14 Plan 02: Terminal Capacity Pre-flight Check Summary

GET /api/terminal/status endpoint with pre-flight capacity check in useTerminal -- prevents 4th terminal widget from hanging on "Connecting..." by checking slot availability before WebSocket upgrade.

## What Was Done

### Task 1: Add GET /api/terminal/status endpoint + pre-flight capacity check in useTerminal

**Backend (terminal.rs):**
- Added `terminal_status` async handler with `RequireAuth` extractor
- Reads `PTY_CONNECTIONS` atomic counter, returns `{active, max, available}` as JSON
- Uses `saturating_sub` to prevent underflow if counter exceeds max
- Registered at `/api/terminal/status` alongside existing `/api/terminal/ws`
- Added `test_terminal_status_response_shape` unit test verifying response at 0, 2, and 3 connections

**Frontend (useTerminal.ts):**
- Added `api` import from `@/lib/api`
- Wrapped useEffect body in async `setup()` IIFE pattern
- Pre-flight calls `api.get('/api/terminal/status')` before creating Terminal or WebSocket
- When `available <= 0`, sets error to `"Too many terminal sessions (max 3)"` and returns early
- If pre-flight fails (network error), silently proceeds -- WebSocket will fail on its own
- Added `didOpen` boolean flag to track whether `onopen` fired
- Enhanced `onclose` handler: if WebSocket closed without ever opening (code 1006), sets error to `"Terminal connection failed"`
- Cleanup function uses local closure variables instead of refs for correctness with async setup
- Refs (`termRef`, `fitAddonRef`, `wsRef`) still set for the font size effect

**Commit:** 5b12e2b

## Verification Results

- **Rust tests:** 5/5 terminal tests pass (including new `test_terminal_status_response_shape`)
- **TypeScript:** `tsc --noEmit` passes with zero errors
- **Frontend tests:** 2242/2247 pass -- 5 pre-existing failures in unrelated files (wizard-store, DashboardGrid, DashboardIntegration, WidgetWrapper, BjornModules)

## Deviations from Plan

None -- plan executed exactly as written.

## Key Files

| File | Change |
|------|--------|
| `src-tauri/src/routes/terminal.rs` | Added `terminal_status` handler + route + unit test |
| `frontend/src/hooks/useTerminal.ts` | Added pre-flight capacity check, async setup, improved onclose |

## Self-Check: PASSED

- All source files exist on disk
- Commit 5b12e2b verified in git log
- must_have artifacts confirmed: terminal_status handler, PTY_CONNECTIONS.load, api.get terminal/status
