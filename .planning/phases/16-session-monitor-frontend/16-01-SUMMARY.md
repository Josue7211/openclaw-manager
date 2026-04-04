---
phase: 16-session-monitor-frontend
plan: 01
subsystem: ui
tags: [xterm.js, websocket, react-query, typescript, session-monitor]

# Dependency graph
requires:
  - phase: 15-claude-session-backend
    provides: REST + WebSocket API for Claude Code session management
provides:
  - ClaudeSession, SessionStatus, SessionListResponse, CreateSessionPayload types
  - claudeSessions, claudeSessionDetail, claudeSessionStatus query keys
  - sessions module registered in APP_MODULES with requiresConfig
  - useSessionOutput read-only xterm.js WebSocket hook
affects: [16-session-monitor-frontend plan 02, dashboard session widgets]

# Tech tracking
tech-stack:
  added: []
  patterns: [read-only xterm.js hook with sessionId-driven lifecycle]

key-files:
  created:
    - frontend/src/pages/sessions/types.ts
    - frontend/src/hooks/sessions/useSessionOutput.ts
  modified:
    - frontend/src/lib/query-keys.ts
    - frontend/src/lib/modules.ts

key-decisions:
  - "useSessionOutput adapts proven useTerminal pattern with disableStdin and no input forwarding"
  - "scrollback 5000 (vs 1000 in useTerminal) for longer session output history"
  - "No pre-flight capacity check -- session WebSocket guard handles rejection at upgrade time"

patterns-established:
  - "Read-only terminal hook pattern: disableStdin, no onData/onBinary, no resize protocol"
  - "Session types with index signature for forward-compatible unknown API shapes"

requirements-completed: [MH-26]

# Metrics
duration: 2min
completed: 2026-03-23
---

# Phase 16 Plan 01: Session Monitor Frontend Foundation Summary

**Session data contracts (types, query keys, module entry) and read-only xterm.js WebSocket hook for Claude Code session output**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-23T07:02:19Z
- **Completed:** 2026-03-23T07:03:52Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Defined ClaudeSession, SessionStatus, SessionListResponse, CreateSessionPayload types matching the backend API contract
- Added centralized query keys for session list, detail, and status endpoints
- Registered sessions module in APP_MODULES with OPENCLAW_API_URL dependency
- Built read-only useSessionOutput hook adapting the proven useTerminal pattern

## Task Commits

Each task was committed atomically:

1. **Task 1: Session types + query keys + module registration** - `35d1218` (feat)
2. **Task 2: useSessionOutput hook** - `9f98f00` (feat)

## Files Created/Modified
- `frontend/src/pages/sessions/types.ts` - Session data contracts (types, status colors, status labels)
- `frontend/src/hooks/sessions/useSessionOutput.ts` - Read-only xterm.js hook with sessionId-driven WebSocket lifecycle
- `frontend/src/lib/query-keys.ts` - Added claudeSessions, claudeSessionDetail, claudeSessionStatus keys
- `frontend/src/lib/modules.ts` - Added sessions module entry with requiresConfig

## Decisions Made
- Used disableStdin: true instead of filtering input events -- cleaner read-only terminal
- Set scrollback to 5000 (up from useTerminal's 1000) since session output is typically longer
- Skipped pre-flight capacity check -- the backend WebSocket upgrade handler rejects unauthorized/over-capacity connections
- Used index signature on ClaudeSession interface for forward-compatible unknown API shapes (Phase 12 pattern)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All data contracts and hooks ready for Plan 02 to build page components
- SessionList, SessionDetail, and SessionOutputPanel can import types from pages/sessions/types.ts
- useSessionOutput hook ready for SessionOutputPanel integration
- Query keys available for React Query hooks in Plan 02

## Self-Check: PASSED

All files verified present, all commit hashes found in git log.

---
*Phase: 16-session-monitor-frontend*
*Completed: 2026-03-23*
