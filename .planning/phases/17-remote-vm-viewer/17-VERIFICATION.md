---
phase: 17-remote-vm-viewer
verified: 2026-03-23T07:52:03Z
status: gaps_found
score: 11/12 must-haves verified
gaps:
  - truth: "Connection status indicator shows connected (green), disconnected (red), or connecting (amber)"
    status: partial
    reason: "VncToolbar status dot only has two states (green/red). It lacks the connecting (amber) state because no error prop is passed and the toolbar cannot distinguish connecting from disconnected."
    artifacts:
      - path: "frontend/src/pages/remote/VncToolbar.tsx"
        issue: "statusColor only maps connected (green) vs not-connected (red). No amber for in-progress connecting state. VncToolbarProps lacks error or isConnecting prop."
    missing:
      - "Add isConnecting prop to VncToolbarProps interface"
      - "Update VncViewer to pass isConnecting={!connected && !error} to VncToolbar"
      - "Update statusColor logic: connected=green, isConnecting=amber, else=red"
      - "Update statusLabel similarly: 'Connected' | 'Connecting...' | 'Disconnected'"
human_verification:
  - test: "Navigate to /remote and verify connecting amber spinner appears during initial connection"
    expected: "Amber spinner overlay appears while VNC is establishing connection, then disappears when connected"
    why_human: "Requires a live VNC server to test the connecting state transition"
  - test: "Move mouse to top 60px of the VNC viewer canvas"
    expected: "The floating toolbar reappears after being auto-hidden"
    why_human: "Mouse interaction in the VNC canvas (captured by noVNC) can interfere with DOM mousemove events — needs manual testing"
  - test: "Copy text in the remote desktop and check it appears in local clipboard"
    expected: "Clipboard text from VNC remote syncs to local clipboard via noVNC clipboard event"
    why_human: "Requires a live VNC session; browser clipboard API behavior differs per focus state"
---

# Phase 17: Remote VM Viewer Verification Report

**Phase Goal:** Embedded remote desktop viewer for watching the OpenClaw VM directly in the app
**Verified:** 2026-03-23T07:52:03Z
**Status:** gaps_found (1 partial gap)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

All truths come from the must_haves frontmatter in the two PLAN files.

#### Plan 01 Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | WebSocket endpoint at /api/vnc/ws upgrades and relays binary data to a TCP VNC server | VERIFIED | `vnc.rs:59-83` — ws_upgrade handler with TcpStream relay in handle_vnc_ws |
| 2 | CAS guard limits concurrent VNC connections to 2 | VERIFIED | `vnc.rs:25-53` — VncConnectionGuard with MAX_VNC_CONNECTIONS=2 and CAS loop |
| 3 | VNC status endpoint returns capacity info (active, max, available) | VERIFIED | `vnc.rs:197-205` — vnc_status returns JSON with active/max/available fields |
| 4 | VNC credentials endpoint returns the VNC_PASSWORD from secrets store | VERIFIED | `vnc.rs:213-220` — vnc_credentials returns `state.secret_or_default("VNC_PASSWORD")` |
| 5 | useVnc hook creates an RFB instance, connects to the WebSocket, and exposes connected/error state | VERIFIED | `useVnc.ts:16-87` — createConnection() creates RFB, registers connect/disconnect events, returns {connected, error, disconnect, reconnect, sendClipboard} |
| 6 | noVNC is isolated into its own Vite chunk to avoid bundle budget violations | VERIFIED | `vite.config.ts:22` — `if (id.includes('node_modules/@novnc')) return 'novnc'` |
| 7 | remote-viewer module registered in modules.ts with requiresConfig for VNC_HOST | VERIFIED | `modules.ts:29` — `{ id: 'remote-viewer', ..., requiresConfig: ['VNC_HOST'] }` |

#### Plan 02 Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 8 | User can navigate to /remote and see a full-bleed VNC viewer page | VERIFIED | `main.tsx:37,305` — lazy import + Route at path="/remote". `RemotePage.tsx:4-18` — position:absolute, inset:0, margin:-20px -28px |
| 9 | VNC viewer renders the remote desktop in a canvas element via noVNC | VERIFIED | `VncViewer.tsx:10-21` — useVnc(containerRef) called; noVNC RFB injects canvas into containerRef div |
| 10 | Connection status indicator shows connected (green), disconnected (red), or connecting (amber) | PARTIAL | `VncToolbar.tsx:59` — only two states: green (connected) / red (not-connected). Amber connecting state missing from toolbar. Connecting amber spinner exists in VncViewer overlay but toolbar status dot is binary. |
| 11 | Toolbar provides disconnect, reconnect, clipboard paste, scale toggle, quality selector, and fullscreen controls | VERIFIED | `VncToolbar.tsx:110-184` — all six controls present as semantic buttons with aria-labels |
| 12 | Toolbar auto-hides after 3 seconds of mouse inactivity, reappears on mouse move to top | VERIFIED | `VncToolbar.tsx:35-56` — resetHideTimer sets 3s timeout; vnc-toolbar-show custom event listener in toolbar; VncViewer dispatches event on mouse Y < 60px |

**Score:** 11/12 truths verified (1 partial)

### Required Artifacts

| Artifact | Expected | Lines | Status | Details |
|----------|----------|-------|--------|---------|
| `src-tauri/src/routes/vnc.rs` | WS-to-TCP proxy with CAS guard, 3 endpoints | 319 | VERIFIED | All endpoints present: /api/vnc/ws, /api/vnc/status, /api/vnc/credentials. CAS guard with tests. |
| `frontend/src/hooks/useVnc.ts` | noVNC RFB lifecycle hook | 118 | VERIFIED | Exports useVnc, handles connect/disconnect/reconnect/sendClipboard, fetches credentials |
| `frontend/src/pages/remote/types.ts` | VNC type definitions | 19 | VERIFIED | Exports VncStatus, VncOptions, UseVncReturn |
| `frontend/src/pages/remote/RemotePage.tsx` | Full-bleed VNC page (min 40 lines) | 19 | NOTE | File is 19 lines — well below 40 line minimum specified in plan. However the component is NOT a stub — it is a complete, intentionally minimal wrapper that delegates entirely to VncViewer. All functional logic is in VncViewer.tsx. |
| `frontend/src/pages/remote/VncViewer.tsx` | Core VNC canvas component (min 30 lines) | 147 | VERIFIED | 147 lines, substantive implementation |
| `frontend/src/pages/remote/VncToolbar.tsx` | Floating toolbar (min 50 lines) | 232 | VERIFIED | 232 lines, all controls present |

**Note on RemotePage.tsx line count:** The plan specified min_lines: 40 but the file has 19 lines. This is not a stub — it correctly implements a full-bleed layout delegating to VncViewer. The low line count reflects correct separation of concerns, not incompleteness.

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `frontend/src/hooks/useVnc.ts` | `/api/vnc/ws` | noVNC RFB constructor WebSocket URL | WIRED | `useVnc.ts:35-36` — `API_BASE.replace(/^http/, 'ws')` + `/api/vnc/ws` |
| `src-tauri/src/routes/vnc.rs` | `TcpStream::connect(vnc_host)` | tokio TCP connection | WIRED | `vnc.rs:105-132` — `tokio::time::timeout(5s, TcpStream::connect(&vnc_host))` |
| `src-tauri/src/routes/mod.rs` | `vnc::router()` | `.merge(vnc::router())` | WIRED | `mod.rs:45,96` — `pub mod vnc` declared + `.merge(vnc::router())` in router chain |
| `frontend/src/pages/remote/VncViewer.tsx` | `useVnc` hook | `useVnc(containerRef, options)` | WIRED | `VncViewer.tsx:2,17` — import and call |
| `frontend/src/pages/remote/RemotePage.tsx` | `VncViewer` component | `<VncViewer` | WIRED | `RemotePage.tsx:1,15` — import and render |
| `frontend/src/main.tsx` | `RemotePage.tsx` | React Router lazy + Route | WIRED | `main.tsx:37,305` — lazy import + `path="/remote"` route |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| MH-27 | 17-01, 17-02 | Remote VM Viewer — noVNC WebSocket proxy, mouse/keyboard input, clipboard sync, scaling | SATISFIED | Backend: vnc.rs with WS-TCP relay. Frontend: VncViewer+VncToolbar with clipboard sync and scale toggle. Route at /remote. |

No orphaned requirements — MH-27 is the only requirement mapped to Phase 17 in REQUIREMENTS.md, and both plans claim it.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `frontend/src/pages/remote/VncViewer.tsx` | 49 | `window.dispatchEvent(new Event('vnc-toolbar-show'))` | Warning | CLAUDE.md explicitly prohibits `window.dispatchEvent` for cross-component communication. Documented as intentional decision in SUMMARY but violates project convention. Alternative: pass a callback ref from VncViewer to VncToolbar instead. |

### Human Verification Required

#### 1. Connecting State Amber Transition

**Test:** Navigate to /remote while VNC_HOST points to a live VNC server. Observe the toolbar status dot during connection establishment.
**Expected:** Status dot shows amber color during the brief connecting window before the RFB 'connect' event fires.
**Why human:** The toolbar currently cannot show amber — this requires the gap to be fixed first.

#### 2. Mouse Toolbar Reveal

**Test:** Let the toolbar auto-hide (3 seconds of inactivity), then move the mouse to the top 60px of the VNC canvas area.
**Expected:** Toolbar reappears with slide-down animation.
**Why human:** noVNC captures mouse events on its canvas, which may prevent the `onMouseMove` on the outer div from firing reliably.

#### 3. Bidirectional Clipboard Sync

**Test:** Copy text on the remote desktop, then check local clipboard. Also paste local clipboard content using the toolbar paste button.
**Expected:** Both directions work: remote-to-local (noVNC clipboard event → navigator.clipboard.writeText) and local-to-remote (toolbar paste → sendClipboard → rfb.clipboardPasteFrom).
**Why human:** Requires a live VNC session; clipboard API requires document focus.

### Gaps Summary

One truth is partially verified: the VncToolbar status dot lacks the three-state amber "connecting" indicator specified in Plan 02.

**Root cause:** `VncToolbarProps` only accepts `connected: boolean`. It cannot receive `error` or `isConnecting` state, so it cannot distinguish between "disconnected after a session" and "connecting on first load." The amber spinner overlay exists correctly in `VncViewer.tsx`, but the toolbar dot stays red in both states.

**Fix is small:** Add `isConnecting?: boolean` prop to VncToolbarProps, pass `!connected && !error` from VncViewer, and update the statusColor ternary to a three-way expression.

**Secondary note (warning, not a gap):** `window.dispatchEvent` is used for toolbar visibility signaling, which violates CLAUDE.md's explicit prohibition on custom DOM events for cross-component communication. The functional behavior is correct — the violation is architectural. A callback ref or a shared state approach would be more idiomatic.

---

_Verified: 2026-03-23T07:52:03Z_
_Verifier: Claude (gsd-verifier)_
