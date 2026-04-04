---
phase: 91-session-list
plan: "02"
subsystem: sessions-ui
tags: [sessions, ui, react, cleanup]
dependency_graph:
  requires: [91-01]
  provides: [session-card-ui, session-list-ui, sessions-page-ui]
  affects: [frontend/src/pages/sessions]
tech_stack:
  added: []
  patterns: [React.memo, SecondsAgo-sinceMs, phosphor-icon-empty-state, shimmer-skeleton]
key_files:
  created: []
  modified:
    - frontend/src/pages/sessions/SessionCard.tsx
    - frontend/src/pages/sessions/SessionList.tsx
    - frontend/src/pages/sessions/SessionsPage.tsx
decisions:
  - SecondsAgo uses sinceMs:number not timestamp:string — converted ISO string to ms inline in SessionCard
  - Legacy STATUS_COLORS/STATUS_LABELS kept in types.ts because NewSessionForm.tsx still imports CreateSessionPayload
  - Pre-existing memory module test failure (1/2522 tests) is unrelated to sessions work
  - gatewayActivity query key does not exist in this worktree — removed SSE subscription from SessionsPage
metrics:
  duration: "5m 15s"
  completed: "2026-03-25T01:23:35Z"
  tasks_completed: 2
  files_modified: 3
---

# Phase 91 Plan 02: Session List UI Rewrite Summary

Rewrote session list UI components to display real OpenClaw gateway protocol fields (label, agentKey, messageCount, lastActivity) and replaced session.id with session.key throughout. Added designed empty state and skeleton loading state. Removed all status/model/duration/kill UI from v0.0.3.

## What Was Built

**SessionCard.tsx** — Complete rewrite replacing task/status/model/duration/kill display with:
- `session.label || 'Untitled'` as primary display (font-weight 600, truncated)
- `session.agentKey` as secondary line (muted, truncated)
- `{session.messageCount} messages` + `<SecondsAgo sinceMs={...} />` in bottom row
- `aria-pressed={selected}` for accessibility
- `React.memo` wrapping, simplified props (removed onKill/available/isKilling)

**SessionList.tsx** — Complete rewrite:
- Removed createMutation, killMutation, NewSessionForm, Plus button, source badge
- Loading state: 3 skeleton cards with shimmer animation (was plain "Loading..." text)
- Empty state: ChatTeardrop icon + "No sessions yet" heading + description (was "No active sessions")
- Session cards keyed and selected by `session.key` (not `session.id`)
- Kept demo mode banner and unreachable banner

**SessionsPage.tsx** — Updated:
- Removed tab bar (History/Output tabs), SessionControls, SessionOutputPanel
- Removed status-based auto-set viewMode useEffect
- Removed handleSessionEvent + useGatewaySSE subscription (hook handles invalidation)
- Right panel shows SessionHistoryPanel when session selected, centered prompt otherwise
- All `sessions.find((s) => s.id === ...)` → `sessions.find((s) => s.key === ...)`

## Verification

- TypeScript: Zero errors in all three modified files
- Frontend test suite: 2521/2522 passing (1 pre-existing memory module failure unrelated to sessions)
- Rust: Compiles cleanly
- session.id references: zero in pages/sessions/ directory
- session.task references: zero in pages/sessions/ directory

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] SecondsAgo API mismatch**
- **Found during:** Task 1
- **Issue:** Plan specified `<SecondsAgo timestamp={session.lastActivity} />` but the actual component takes `sinceMs: number` (not `timestamp: string`)
- **Fix:** Convert ISO string to epoch ms inline: `new Date(session.lastActivity as string).getTime()` and pass as `sinceMs`
- **Files modified:** frontend/src/pages/sessions/SessionCard.tsx
- **Commit:** 6f99713

**2. [Rule 3 - Blocking] SecondsAgo is default export**
- **Found during:** Task 1
- **Issue:** Plan specified `import { SecondsAgo }` (named import) but component is `export default`
- **Fix:** Changed to `import SecondsAgo from '@/components/SecondsAgo'`
- **Files modified:** frontend/src/pages/sessions/SessionCard.tsx
- **Commit:** 6f99713

**3. [Rule 1 - Bug] gatewayActivity query key missing**
- **Found during:** Task 2
- **Issue:** SessionsPage used `queryKeys.gatewayActivity` in SSE subscription but this key doesn't exist in query-keys.ts in this worktree
- **Fix:** Removed the SSE subscription from SessionsPage (the useGatewaySessions hook already handles session invalidation via SSE internally)
- **Files modified:** frontend/src/pages/sessions/SessionsPage.tsx
- **Commit:** c790559

**4. [Rule 2 - ClaudeSession index signature] Type casting for index-signed interface**
- **Found during:** Tasks 1-2
- **Issue:** ClaudeSession has `[key: string]: unknown` index signature so properties like `session.key`, `session.label`, `session.agentKey` are typed as `unknown`
- **Fix:** Applied `as string` / `as number` casts where needed to satisfy TypeScript without changing the interface
- **Files modified:** SessionCard.tsx, SessionList.tsx, SessionsPage.tsx
- **Commit:** 6f99713, c790559

## Commits

| Hash | Message | Files |
|------|---------|-------|
| 6f99713 | feat(91-02): rewrite SessionCard for real protocol fields | SessionCard.tsx |
| c790559 | feat(91-02): rewrite SessionList and SessionsPage for new data shape | SessionList.tsx, SessionsPage.tsx |

## Self-Check: PASSED

- SessionCard.tsx: FOUND
- SessionList.tsx: FOUND
- SessionsPage.tsx: FOUND
- Commit 6f99713: FOUND
- Commit c790559: FOUND
