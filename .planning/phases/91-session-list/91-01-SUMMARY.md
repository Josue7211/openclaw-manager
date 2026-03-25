---
phase: 91-session-list
plan: "01"
subsystem: sessions
tags: [gateway, sessions, react-query, axum, typescript]
dependency_graph:
  requires: []
  provides: [GET /api/gateway/sessions, ClaudeSession type, useGatewaySessions hook, useGatewaySSE hook]
  affects: [frontend/src/pages/sessions, frontend/src/hooks/sessions]
tech_stack:
  added: [useGatewaySSE singleton EventSource hook]
  patterns: [gateway_forward HTTP proxy, gateway-only hook (no CLI fallback), sessions sorted by lastActivity desc]
key_files:
  created:
    - frontend/src/pages/sessions/types.ts
    - frontend/src/hooks/sessions/useGatewaySessions.ts
    - frontend/src/hooks/sessions/__tests__/useGatewaySessions.test.ts
    - frontend/src/lib/hooks/useGatewaySSE.ts
  modified:
    - src-tauri/src/routes/gateway.rs
    - frontend/src/lib/query-keys.ts
decisions:
  - HTTP proxy (gateway_forward) over WS RPC — gateway_ws.request() doesn't exist in this codebase; HTTP /sessions endpoint proven
  - Gateway-only hook — removed two-tier fallback (gateway + CLI); simplifies logic and matches locked decisions
  - useGatewaySSE simplified for worktree — main project version depends on GATEWAY_EVENT_MAP which doesn't exist in this older worktree state
  - Added gatewaySessions and claudeSessions query keys to query-keys.ts (were missing in worktree)
metrics:
  duration: 7min
  completed: "2026-03-25"
  tasks_completed: 2
  files_modified: 6
---

# Phase 91 Plan 01: Session List Data Layer Summary

Gateway sessions data layer: Axum route + TypeScript types + React Query hook using real OpenClaw protocol fields.

## What Was Built

**GET /api/gateway/sessions** backend route that proxies `sessions.list` through `gateway_forward`, returning `{ ok: true, sessions: [...] }` with the full unfiltered session list.

**ClaudeSession TypeScript type** rewritten from the v0.0.3 assumed shape (`id/task/status/model/kind`) to match the real OpenClaw protocol v3 shape (`key/label/agentKey/messageCount/lastActivity`).

**useGatewaySessions hook** simplified from a two-tier fallback (gateway + CLI) to a gateway-only path. Sessions are sorted by `lastActivity` descending. Returns `{ sessions, isLoading, available }` with no `source` field.

**useGatewaySSE hook** created as a dependency — singleton EventSource at `/api/gateway/events` with per-event callbacks and React Query invalidation. Simplified from the main project version (no GATEWAY_EVENT_MAP dependency needed for this worktree state).

**7 unit tests** covering: SSE wiring, demo mode behavior, sessions from gateway response, descending sort by lastActivity, error handling, and absence of the removed `source` field.

## Tasks

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add gateway sessions route, rewrite types + hook | 022c8a7 | gateway.rs, types.ts, useGatewaySessions.ts, useGatewaySSE.ts, query-keys.ts |
| 2 | Rewrite useGatewaySessions tests for new data shape | 0c39d74 | useGatewaySessions.test.ts |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Missing gatewaySessions query key**
- **Found during:** Task 1
- **Issue:** Plan referenced `queryKeys.gatewaySessions` but this key didn't exist in the worktree's older `query-keys.ts`
- **Fix:** Added `gatewaySessions: ['gateway', 'sessions'] as const` and `claudeSessions: ['claude-sessions'] as const` to query-keys.ts
- **Files modified:** frontend/src/lib/query-keys.ts
- **Commit:** 022c8a7

**2. [Rule 3 - Blocking] Missing useGatewaySSE hook**
- **Found during:** Task 1
- **Issue:** Plan referenced `useGatewaySSE` from `@/lib/hooks/useGatewaySSE` but this file didn't exist in the worktree (only exists in the main project 321 commits ahead)
- **Fix:** Created a simplified `useGatewaySSE` hook that matches the interface expected by the plan. Uses singleton EventSource pattern without GATEWAY_EVENT_MAP dependency (which doesn't exist in this worktree state)
- **Files modified:** frontend/src/lib/hooks/useGatewaySSE.ts (new file)
- **Commit:** 022c8a7

### Pre-existing Issues (Out of Scope)

- 5 frontend test failures in `widget-registry.test.ts`, `wizard-store.test.ts`, `BjornModules.test.tsx` — pre-existing in the worktree before this plan
- 1 Rust compile error: `koel` module declared in `routes/mod.rs` but file doesn't exist — pre-existing in the worktree

## Verification Results

- TypeScript: Zero errors in our new/modified files (pre-existing errors in unrelated files)
- Hook tests: 7/7 pass
- Rust: gateway.rs changes compile cleanly (pre-existing koel error unrelated)
- Full test suite: 2248/2253 pass (5 pre-existing failures, all unrelated to this plan)

## Self-Check: PASSED

- [x] frontend/src/pages/sessions/types.ts exists with `key: string` in ClaudeSession
- [x] frontend/src/hooks/sessions/useGatewaySessions.ts exists with no DataSource/source/claudeSessions
- [x] frontend/src/hooks/sessions/__tests__/useGatewaySessions.test.ts exists, 7 tests pass
- [x] frontend/src/lib/hooks/useGatewaySSE.ts exists
- [x] src-tauri/src/routes/gateway.rs contains `gateway_sessions` handler and route
- [x] Commits 022c8a7 and 0c39d74 exist
