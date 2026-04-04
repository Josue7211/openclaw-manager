---
phase: 16-session-monitor-frontend
verified: 2026-03-23T03:25:00Z
status: gaps_found
score: 7/8 must-haves verified
re_verification: false
gaps:
  - truth: "User can kill a running session with inline confirmation"
    status: failed
    reason: "Kill mutation calls api.del('/api/claude-sessions/:id') (DELETE) but backend only registers POST /api/claude-sessions/:id/kill. The DELETE method to /api/claude-sessions/:id has no handler — kills will produce a 405 Method Not Allowed error at runtime."
    artifacts:
      - path: "frontend/src/pages/sessions/SessionList.tsx"
        issue: "Line 36: api.del(`/api/claude-sessions/${id}`) sends DELETE to /api/claude-sessions/:id which is not a registered route"
    missing:
      - "Change killMutation in SessionList.tsx to use api.post(`/api/claude-sessions/${id}/kill`) instead of api.del(`/api/claude-sessions/${id}`)"
human_verification:
  - test: "Visual layout verification of Sessions page"
    expected: "Full-bleed split-pane renders with list on left, output panel on right, resizable divider. Session cards display status badges with correct colors, live duration timer, model badge. Output terminal connects and streams text via WebSocket."
    why_human: "Visual appearance, WebSocket streaming, real-time behavior, and resize drag interaction cannot be verified programmatically"
  - test: "Kill confirmation flow (after kill endpoint fix)"
    expected: "First click on X shows 'Kill?' text, second click sends POST /api/claude-sessions/:id/kill, session disappears from list within 5s"
    why_human: "Requires live OpenClaw connection and actual session to test the two-click confirmation + backend round-trip"
---

# Phase 16: Session Monitor Frontend Verification Report

**Phase Goal:** Live dashboard showing all active Claude Code sessions with real-time status and output
**Verified:** 2026-03-23T03:25:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Session types match the backend API contract from claude_sessions.rs | VERIFIED | `frontend/src/pages/sessions/types.ts` exports ClaudeSession, SessionStatus, SessionListResponse, CreateSessionPayload matching backend CreateSessionBody and list response shapes exactly |
| 2 | Query keys for claude sessions are centralized and importable | VERIFIED | `frontend/src/lib/query-keys.ts` lines 38-40: claudeSessions, claudeSessionDetail, claudeSessionStatus all present |
| 3 | Sessions module is registered in APP_MODULES with requiresConfig | VERIFIED | `frontend/src/lib/modules.ts` line 28: `{ id: 'sessions', ..., requiresConfig: ['OPENCLAW_API_URL'] }` |
| 4 | useSessionOutput connects to /api/claude-sessions/:id/ws and writes incoming text to xterm.js | VERIFIED | Line 74: `ws = new WebSocket(\`${wsBase}/api/claude-sessions/${sessionId}/ws\`)`. Lines 84-100: onmessage writes string and ArrayBuffer data to terminal |
| 5 | useSessionOutput is read-only (no input forwarding, no resize protocol) | VERIFIED | `disableStdin: true` on Terminal (line 46), no onData/onBinary handlers, no resize JSON sent to WebSocket. Only Ctrl+Shift+C copy handler |
| 6 | useSessionOutput disposes terminal and closes WebSocket when sessionId changes | VERIFIED | Cleanup function (lines 129-135): themeObserver.disconnect(), resizeObserver.disconnect(), ws.close(), localTerm.dispose(). Effect deps: [sessionId, fontSize] |
| 7 | User can see all active/recent Claude Code sessions in a card list with auto-updates | VERIFIED | SessionList.tsx: useQuery with queryKeys.claudeSessions, refetchInterval: 5000, maps sessions to SessionCard components. Empty state, loading state, unreachable banner all implemented |
| 8 | User can kill a running session with inline confirmation | FAILED | SessionList.tsx line 36 calls `api.del(\`/api/claude-sessions/${id}\`)` (DELETE to /api/claude-sessions/:id) but backend only registers `POST /api/claude-sessions/:id/kill`. The delete route handler does not exist — kills will return 405 at runtime |

**Score:** 7/8 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `frontend/src/pages/sessions/types.ts` | ClaudeSession, SessionStatus, SessionListResponse, CreateSessionPayload types | VERIFIED | All 4 types + STATUS_COLORS + STATUS_LABELS exported. Index signature for forward-compat. |
| `frontend/src/hooks/sessions/useSessionOutput.ts` | Read-only xterm.js WebSocket hook | VERIFIED | 140 lines. disableStdin, scrollback:5000, cursorBlink:false, sessionId-driven lifecycle |
| `frontend/src/lib/query-keys.ts` | claudeSessions, claudeSessionDetail, claudeSessionStatus keys | VERIFIED | Lines 38-40 present |
| `frontend/src/lib/modules.ts` | sessions module entry in APP_MODULES | VERIFIED | Line 28, requiresConfig: ['OPENCLAW_API_URL'] |
| `frontend/src/pages/sessions/SessionsPage.tsx` | Full-bleed split-pane page (list + output viewer) | VERIFIED | position:absolute, inset:0, margin:'-20px -28px', resize handle with min:240/max:480 |
| `frontend/src/pages/sessions/SessionCard.tsx` | React.memo session card with status badge | VERIFIED | React.memo, button with aria-pressed, status dot with pulse animation, inline kill confirmation with 3s auto-reset |
| `frontend/src/pages/sessions/SessionList.tsx` | Scrollable card list with New Session button | VERIFIED | useQuery + 5s polling, create/kill mutations, unreachable banner, empty/loading states |
| `frontend/src/pages/sessions/SessionOutputPanel.tsx` | xterm.js output viewer using useSessionOutput hook | VERIFIED | Uses useSessionOutput hook, connection status indicator (green/amber dot), error banner, terminal-container div |
| `frontend/src/pages/sessions/NewSessionForm.tsx` | Inline form for spawning new sessions | VERIFIED | task textarea (maxLength:2000), workingDir input, model input, submit disabled when empty/submitting/unavailable |
| `frontend/src/main.tsx` | Lazy-loaded route at /sessions | VERIFIED | Line 36: lazy import. Line 303: Route at /sessions with GenericPageSkeleton fallback |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| useSessionOutput.ts | /api/claude-sessions/:id/ws | WebSocket connection | WIRED | Line 74: `new WebSocket(\`${wsBase}/api/claude-sessions/${sessionId}/ws\`)` |
| useSessionOutput.ts | frontend/src/lib/terminal-theme.ts | import buildThemeFromCSS | WIRED | Line 7: `import { buildThemeFromCSS } from '@/lib/terminal-theme'`. Used on lines 44 and 122 |
| SessionsPage.tsx | SessionList.tsx | component composition in split-pane left panel | WIRED | Line 48: `<SessionList selectedId={selectedId} onSelect={setSelectedId} />` |
| SessionsPage.tsx | SessionOutputPanel.tsx | component composition in split-pane right panel | WIRED | Line 76: `<SessionOutputPanel sessionId={selectedId} key={selectedId} />` — includes key prop for clean lifecycle |
| SessionOutputPanel.tsx | useSessionOutput.ts | hook invocation for xterm.js lifecycle | WIRED | Line 29: `const { connected, error } = useSessionOutput(containerRef, sessionId)` |
| SessionList.tsx | /api/claude-sessions | React Query useQuery with 5s polling | WIRED | Lines 19-23: useQuery with queryFn, refetchInterval: 5000 |
| SessionList.tsx | /api/claude-sessions/:id/kill | Kill POST endpoint | NOT WIRED | Line 36: `api.del(\`/api/claude-sessions/${id}\`)` sends DELETE to /api/claude-sessions/:id — backend has no DELETE handler at that path. Correct endpoint is POST /api/claude-sessions/:id/kill |
| main.tsx | SessionsPage.tsx | lazy import + Route | WIRED | Line 36: lazy import. Line 303: Route path="/sessions" |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| MH-26 | 16-01, 16-02 | Session Monitor Frontend — live dashboard with sessions, real-time output viewer, spawn/kill controls | PARTIAL | All UI infrastructure is present and wired. Kill functionality is broken at the API call level (wrong HTTP method and URL). Session viewing, spawning, and listing are fully functional. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| frontend/src/pages/sessions/SessionList.tsx | 36 | `api.del('/api/claude-sessions/${id}')` — wrong HTTP method + wrong URL for kill endpoint | Blocker | Kill button will fail at runtime with 405 Method Not Allowed. Backend requires POST /api/claude-sessions/:id/kill |

No placeholder comments, empty implementations, or return null stubs found in any sessions files.

### Human Verification Required

#### 1. Visual Layout and Terminal Streaming

**Test:** Run `cd frontend && npm run dev`, navigate to /sessions (enable in Settings > Modules if needed)
**Expected:** Full-bleed split-pane renders with Sessions list on left, empty state on right. If OpenClaw configured and reachable: session cards appear with colored status badges (green=running, amber=paused, blue=completed, red=failed), clicking a card opens terminal output that streams text
**Why human:** Visual appearance, xterm.js rendering, WebSocket streaming, and split-pane resize drag cannot be verified programmatically

#### 2. Kill Confirmation Flow (after kill endpoint fix)

**Test:** After applying the fix (`api.post` to `/api/claude-sessions/${id}/kill`), click X button on a running session, verify 'Kill?' appears, click again to confirm
**Expected:** Two-click confirmation with 3s auto-reset, session removed from list within 5s
**Why human:** Requires live OpenClaw connection with an active session; end-to-end mutation + invalidation flow

### Gaps Summary

One gap blocks full goal achievement: the kill endpoint mismatch.

The backend registers `POST /api/claude-sessions/:id/kill` (line 373 of claude_sessions.rs) but `SessionList.tsx` line 36 calls `api.del(\`/api/claude-sessions/${id}\`)`, which sends a DELETE request to `/api/claude-sessions/:id`. There is no DELETE handler registered at that path — the backend router only handles GET at `/api/claude-sessions/:id`. This will produce a 405 Method Not Allowed response from Axum at runtime, silently failing the kill action.

The fix is a one-line change in `SessionList.tsx`:
```typescript
// Current (broken):
api.del(`/api/claude-sessions/${id}`)

// Fixed:
api.post<{ ok: boolean }>(`/api/claude-sessions/${id}/kill`)
```

Everything else is fully implemented and wired: the full-bleed split-pane page, session cards with status dots and live duration timers, React Query polling, new session form with validation, xterm.js output viewer with WebSocket streaming, route registration, module registration, and nav item. TypeScript compiles without errors. The modules completeness test (25/25) passes, confirming the sessions nav item and module entry are consistent.

The four test failures in the full suite (DashboardGrid, DashboardIntegration, WidgetWrapper, BjornModules) are pre-existing flakiness issues unrelated to Phase 16 — all pass when run in isolation, and none touch sessions code.

---

_Verified: 2026-03-23T03:25:00Z_
_Verifier: Claude (gsd-verifier)_
