# Phase 17: Remote VM Viewer - Context

**Gathered:** 2026-03-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver an embedded remote desktop viewer for the OpenClaw VM. Uses noVNC (JavaScript VNC client) rendered in an app panel/widget, with an Axum WebSocket proxy relaying VNC traffic so the browser never connects directly to the VM.

</domain>

<decisions>
## Implementation Decisions

### VNC Architecture
- noVNC library for browser-side VNC rendering — mature, WebSocket-native, MIT licensed
- Axum WebSocket proxy relays TCP VNC traffic through the Tauri backend — browser connects to localhost:3000, backend connects to VM via Tailscale
- VNC server on OpenClaw VM is TigerVNC or x11vnc — configured separately, not part of this phase
- Connection via Tailscale IP to VNC port (default 5900) — credential from secrets store

### Viewer Integration
- Full-bleed page component (like Messages, Settings) — remote desktop needs maximum space
- Scaling: fit-to-container with aspect ratio preservation — CSS object-fit or canvas scaling
- Mouse and keyboard passthrough via noVNC's built-in input handling
- Clipboard sync via noVNC's clipboard API — bidirectional text copy/paste
- Connection status indicator: connected (green dot), disconnected (red), reconnecting (amber)

### Widget Option
- Dashboard widget with small preview (read-only, no input) — click opens full page
- Widget shows last frame or "Disconnected" placeholder when not streaming

### Moonlight/Sunshine
- Deferred to nice-to-have — noVNC covers the core requirement
- Moonlight requires native client integration which is out of scope for web-based widget

### Claude's Discretion
- noVNC configuration options (quality, compression, encoding)
- Reconnection strategy and timeouts
- Toolbar/controls layout (fullscreen toggle, clipboard button, scaling options)
- Widget preview frame rate and resolution

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- WebSocket proxy pattern from `terminal.rs` (Phase 13) — bidirectional relay between browser WS and backend TCP
- `PtyConnectionGuard` CAS pattern — limit concurrent VNC connections
- `RequireAuth` extractor — all endpoints require auth
- Full-bleed page layout pattern (Messages, Settings) — `position: absolute; inset: 0`
- Widget registration pattern from `widget-registry.ts`

### Established Patterns
- WebSocket upgrade handler: `ws.on_upgrade(move |socket| handler(socket, guard))`
- Credential lookup: `state.secret("VNC_HOST")`, `state.secret("VNC_PASSWORD")`
- Connection status components (similar to `ConnectionStatus.tsx`)
- Lazy-loaded pages via React Router

### Integration Points
- Route registration: `pub mod vnc;` + `.merge(vnc::router())` in `routes/mod.rs`
- Frontend route: `/remote` in `main.tsx`
- Module registration: add `remote-viewer` to `modules.ts`
- Widget registration: add to `widget-registry.ts` `BUILTIN_WIDGETS`

</code_context>

<specifics>
## Specific Ideas

No specific requirements — standard noVNC integration following established WebSocket proxy patterns.

</specifics>

<deferred>
## Deferred Ideas

- Moonlight/Sunshine GPU-accelerated streaming
- Multi-VM viewer (tabs for different VMs)
- Screen recording/screenshot capture
- Audio passthrough
- File transfer via VNC

</deferred>
