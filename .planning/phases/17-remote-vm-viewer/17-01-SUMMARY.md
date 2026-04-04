---
phase: 17-remote-vm-viewer
plan: 01
subsystem: api
tags: [vnc, novnc, websocket, tcp-proxy, axum, react-hook]

# Dependency graph
requires:
  - phase: 15-claude-code-sessions
    provides: CAS guard + WebSocket relay patterns
provides:
  - WebSocket-to-TCP VNC proxy at /api/vnc/ws, /api/vnc/status, /api/vnc/credentials
  - useVnc React hook wrapping noVNC RFB lifecycle
  - VncStatus, VncOptions, UseVncReturn type definitions
  - remote-viewer module registered in modules.ts
  - vncStatus query key in query-keys.ts
affects: [17-02-remote-vm-viewer]

# Tech tracking
tech-stack:
  added: ["@novnc/novnc 1.6.0", "@types/novnc__novnc 1.6.0"]
  patterns: ["WebSocket-to-TCP binary relay via tokio TcpStream", "noVNC RFB hook with credential fetch"]

key-files:
  created:
    - src-tauri/src/routes/vnc.rs
    - frontend/src/hooks/useVnc.ts
    - frontend/src/pages/remote/types.ts
  modified:
    - src-tauri/src/routes/mod.rs
    - frontend/src/lib/query-keys.ts
    - frontend/src/lib/modules.ts
    - frontend/vite.config.ts
    - frontend/tsconfig.app.json
    - frontend/package.json

key-decisions:
  - "Bare Response return for VNC WebSocket upgrade handler (not Result<Response, AppError>) -- matches terminal.rs/claude_sessions.rs pattern"
  - "Max 2 concurrent VNC sessions via CAS guard -- VNC is heavyweight compared to terminal or session streams"
  - "5-second TCP connect timeout for fail-fast VNC server unreachable detection"
  - "noVNC RFB directly (not react-vnc wrapper) per user decision from research"
  - "Added novnc__novnc to tsconfig types array -- tsconfig.app.json types field limits auto-discovery"

patterns-established:
  - "WebSocket-to-TCP relay: tokio TcpStream split + BufReader/BufWriter + tokio::select! for bidirectional binary pipe"
  - "VNC credentials via secrets store: VNC_HOST for connection, VNC_PASSWORD returned to frontend for noVNC"

requirements-completed: [MH-27]

# Metrics
duration: 5min
completed: 2026-03-23
---

# Phase 17 Plan 01: VNC Proxy Backend + noVNC Hook Summary

**WebSocket-to-TCP VNC proxy backend with CAS guard (max 2) and noVNC RFB React hook for remote VM viewer**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-23T07:38:07Z
- **Completed:** 2026-03-23T07:43:30Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- Built VNC WebSocket-to-TCP proxy with /api/vnc/ws, /api/vnc/status, /api/vnc/credentials endpoints
- Created useVnc React hook wrapping noVNC RFB with connect/disconnect/reconnect/sendClipboard lifecycle
- Registered remote-viewer module, vncStatus query key, and @novnc Vite chunk isolation

## Task Commits

Each task was committed atomically:

1. **Task 1: VNC WebSocket-to-TCP proxy backend (vnc.rs) + route registration** - `4372dd1` (feat)
2. **Task 2: Install noVNC + useVnc hook + types + module/chunk/query-key registration** - `1298570` (feat)

## Files Created/Modified
- `src-tauri/src/routes/vnc.rs` - WebSocket-to-TCP VNC proxy with CAS guard, status, and credentials endpoints
- `src-tauri/src/routes/mod.rs` - Added vnc module declaration and router merge
- `frontend/src/hooks/useVnc.ts` - noVNC RFB lifecycle hook with credential fetch and reconnect
- `frontend/src/pages/remote/types.ts` - VncStatus, VncOptions, UseVncReturn type definitions
- `frontend/src/lib/query-keys.ts` - Added vncStatus query key
- `frontend/src/lib/modules.ts` - Added remote-viewer module with requiresConfig VNC_HOST
- `frontend/vite.config.ts` - Added @novnc to manualChunks for bundle isolation
- `frontend/tsconfig.app.json` - Added novnc__novnc to types for module resolution
- `frontend/package.json` - Added @novnc/novnc and @types/novnc__novnc dependencies

## Decisions Made
- Bare Response return for WS upgrade handler (matches existing terminal.rs and claude_sessions.rs patterns)
- Max 2 concurrent VNC sessions (heavyweight binary streams vs terminal text streams)
- 5-second TCP connect timeout for fail-fast behavior
- Direct noVNC RFB usage (not react-vnc wrapper) per research recommendation
- Added novnc__novnc to tsconfig types array since the explicit types field limits auto-discovery of @types packages

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added novnc__novnc to tsconfig.app.json types array**
- **Found during:** Task 2 (TypeScript compilation)
- **Issue:** tsconfig.app.json has `"types": ["vite/client"]` which prevents auto-discovery of `@types/novnc__novnc`
- **Fix:** Added `"novnc__novnc"` to the types array
- **Files modified:** frontend/tsconfig.app.json
- **Verification:** `npx tsc --noEmit` passes with no noVNC-related errors
- **Committed in:** 1298570 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Required for TypeScript type resolution. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required. VNC_HOST and VNC_PASSWORD are configured through the existing Settings > Connections flow.

## Next Phase Readiness
- VNC proxy backend is ready for Plan 02's RemoteViewer page component
- useVnc hook is ready for Plan 02's React integration
- Module registered -- will appear in sidebar once enabled
- noVNC chunk isolation configured -- will produce separate chunk once page component imports the hook

---
*Phase: 17-remote-vm-viewer*
*Completed: 2026-03-23*
