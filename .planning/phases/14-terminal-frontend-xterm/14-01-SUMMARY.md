---
phase: 14-terminal-frontend-xterm
plan: 01
subsystem: ui
tags: [xterm.js, terminal, websocket, widget, react, resize-observer, mutation-observer]

# Dependency graph
requires:
  - phase: 13-terminal-pty-backend
    provides: PTY WebSocket endpoint at /api/terminal/ws with JSON protocol
provides:
  - TerminalWidget registered in widget registry (id: terminal)
  - useTerminal hook with full lifecycle management
  - buildThemeFromCSS utility for xterm.js ITheme from CSS variables
  - xterm.js isolated in dedicated Vite chunk (~344KB)
affects: [dashboard, widget-picker, theme-system]

# Tech tracking
tech-stack:
  added: ["@xterm/xterm ^6.0.0", "@xterm/addon-fit ^0.11.0", "@xterm/addon-web-links ^0.12.0"]
  patterns: [css-variable-to-theme-mapping, resize-observer-fit-addon, mutation-observer-theme-sync, arraybuffer-websocket]

key-files:
  created:
    - frontend/src/lib/terminal-theme.ts
    - frontend/src/hooks/useTerminal.ts
    - frontend/src/components/widgets/TerminalWidget.tsx
  modified:
    - frontend/package.json
    - frontend/vite.config.ts
    - frontend/src/globals.css
    - frontend/src/lib/widget-registry.ts
    - frontend/src/lib/__tests__/widget-registry.test.ts

key-decisions:
  - "xterm.js v6 with FitAddon and WebLinksAddon -- fit addon handles resize, web links addon makes URLs clickable"
  - "Ctrl+Shift+C/V for copy/paste to avoid SIGINT conflict with Ctrl+C"
  - "MutationObserver on data-theme attribute for theme sync instead of polling"
  - "ResizeObserver + requestAnimationFrame for debounced resize fitting"
  - "Click-to-focus instead of auto-focus on mount to avoid stealing focus from other widgets"

patterns-established:
  - "Terminal theme sync: buildThemeFromCSS() reads CSS custom properties and maps to xterm ITheme"
  - "Widget with WebSocket: useTerminal hook manages WebSocket lifecycle tied to React component mount/unmount"
  - "Binary WebSocket: ws.binaryType = arraybuffer for raw PTY output"

requirements-completed: [MH-22]

# Metrics
duration: 5min
completed: 2026-03-23
---

# Phase 14 Plan 01: Terminal Frontend (xterm.js) Summary

**xterm.js terminal widget with WebSocket PTY connection, CSS-variable theme sync, ResizeObserver fitting, and copy/paste via Ctrl+Shift+C/V**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-23T01:39:15Z
- **Completed:** 2026-03-23T01:44:41Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Terminal widget renders in dashboard grid with full interactive shell via WebSocket to /api/terminal/ws
- Theme colors auto-sync with app theme changes (dark/light, blend slider) via MutationObserver
- Widget resizes correctly when grid cell changes size (ResizeObserver + FitAddon)
- Copy/paste works via Ctrl+Shift+C/V without conflicting with SIGINT
- xterm.js isolated in its own Vite chunk (344KB) for lazy loading
- Font size configurable via widget settings slider (10-18px)
- Fixed 3 pre-existing widget-registry test failures (widget count, media suite bundle, media center preset)

## Task Commits

Each task was committed atomically:

1. **Task 1: Install xterm.js packages + theme utility + Vite chunk + CSS overrides** - `914504c` (feat)
2. **Task 2: useTerminal hook + TerminalWidget component + widget registration + tests** - `f20050e` (feat)

## Files Created/Modified
- `frontend/src/lib/terminal-theme.ts` - CSS variable to xterm.js ITheme mapping (buildThemeFromCSS)
- `frontend/src/hooks/useTerminal.ts` - Terminal lifecycle hook (create, WebSocket, resize, theme sync, clipboard, dispose)
- `frontend/src/components/widgets/TerminalWidget.tsx` - React widget component with connection banner and click-to-focus
- `frontend/package.json` - Added @xterm/xterm, @xterm/addon-fit, @xterm/addon-web-links
- `frontend/vite.config.ts` - Added xterm chunk isolation in manualChunks
- `frontend/src/globals.css` - Terminal CSS overrides for user-select and scrollbar styling
- `frontend/src/lib/widget-registry.ts` - Terminal widget registration entry (id: terminal, monitoring, slider config)
- `frontend/src/lib/__tests__/widget-registry.test.ts` - Fixed pre-existing failures + added terminal assertions

## Decisions Made
- Used xterm.js v6 with FitAddon and WebLinksAddon for resize handling and clickable URLs
- Ctrl+Shift+C/V for copy/paste to avoid SIGINT conflict with Ctrl+C in terminal
- MutationObserver watching data-theme and style attributes for real-time theme sync
- Click-to-focus pattern instead of auto-focus on mount to prevent focus stealing

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed pre-existing widget-registry test failures**
- **Found during:** Task 2 (widget registration + tests)
- **Issue:** 3 tests were already failing: BUILTIN_WIDGETS count (28 vs 29 actual), Media Suite bundle (missing music-now-playing), Media Center preset (3 vs 4 widgets)
- **Fix:** Updated count to 30 (29 existing + 1 terminal), fixed media suite bundle assertion, fixed media center preset length
- **Files modified:** frontend/src/lib/__tests__/widget-registry.test.ts
- **Verification:** All 33 tests pass
- **Committed in:** f20050e (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Pre-existing test fix was planned in the task spec. No scope creep.

## Issues Encountered
- 5 pre-existing test failures in full suite (wizard-store, DashboardGrid, DashboardIntegration, WidgetWrapper timeout, BjornModules) -- none related to terminal changes, all pass when run individually (timing/flaky tests)

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Terminal widget is fully functional and registered in the widget system
- Ready for Phase 15 (Claude Code session management) or any subsequent phase
- Terminal backend (Phase 13) + frontend (Phase 14) are complete as a pair

---
*Phase: 14-terminal-frontend-xterm*
*Completed: 2026-03-23*
