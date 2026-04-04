# Phase 17: Remote VM Viewer - Research

**Researched:** 2026-03-23
**Domain:** VNC remote desktop viewer (noVNC + Axum WebSocket-to-TCP proxy)
**Confidence:** HIGH

## Summary

This phase embeds a VNC remote desktop viewer into the app using noVNC (the standard browser VNC client library) with an Axum WebSocket-to-TCP proxy in the backend. The architecture is: browser connects via WebSocket to `localhost:3000/api/vnc/ws`, the Axum backend opens a TCP connection to the VNC server on the OpenClaw VM (via Tailscale IP, port 5900), and binary RFB protocol frames are relayed transparently in both directions. noVNC handles all VNC protocol negotiation, authentication, rendering, and input capture -- the proxy is a dumb binary pipe.

The implementation closely mirrors two existing codebase patterns: `terminal.rs` (WebSocket upgrade + CAS connection guard + bidirectional relay) and `claude_sessions.rs` (WebSocket-to-upstream-WebSocket relay via tokio). The key difference is that VNC relay connects to a raw TCP socket (not an upstream WebSocket), so the relay uses `tokio::net::TcpStream` with `tokio::io::AsyncReadExt/AsyncWriteExt` instead of `tokio_tungstenite`.

**Primary recommendation:** Use `@novnc/novnc` v1.6.0 directly (not `react-vnc` wrapper) for maximum control. Import RFB from the npm package's `lib/` directory. Build a thin `useVnc` hook following the established `useTerminal` pattern. Backend proxy uses `tokio::net::TcpStream::connect()` to the VNC server and relays binary WebSocket frames bidirectionally.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- noVNC library for browser-side VNC rendering -- mature, WebSocket-native, MIT licensed
- Axum WebSocket proxy relays TCP VNC traffic through the Tauri backend -- browser connects to localhost:3000, backend connects to VM via Tailscale
- VNC server on OpenClaw VM is TigerVNC or x11vnc -- configured separately, not part of this phase
- Connection via Tailscale IP to VNC port (default 5900) -- credential from secrets store
- Full-bleed page component (like Messages, Settings) -- remote desktop needs maximum space
- Scaling: fit-to-container with aspect ratio preservation -- CSS object-fit or canvas scaling
- Mouse and keyboard passthrough via noVNC's built-in input handling
- Clipboard sync via noVNC's clipboard API -- bidirectional text copy/paste
- Connection status indicator: connected (green dot), disconnected (red), reconnecting (amber)
- Dashboard widget with small preview (read-only, no input) -- click opens full page
- Widget shows last frame or "Disconnected" placeholder when not streaming

### Claude's Discretion
- noVNC configuration options (quality, compression, encoding)
- Reconnection strategy and timeouts
- Toolbar/controls layout (fullscreen toggle, clipboard button, scaling options)
- Widget preview frame rate and resolution

### Deferred Ideas (OUT OF SCOPE)
- Moonlight/Sunshine GPU-accelerated streaming
- Multi-VM viewer (tabs for different VMs)
- Screen recording/screenshot capture
- Audio passthrough
- File transfer via VNC
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| MH-27 | Remote VM Viewer: embedded desktop viewer with noVNC proxy, mouse/keyboard, clipboard sync, scaling | noVNC RFB API handles all input/rendering; Axum WS-to-TCP proxy pattern matches terminal.rs; CAS guard limits connections; credential from secrets store |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@novnc/novnc` | 1.6.0 | Browser VNC client (RFB protocol, canvas rendering) | Official noVNC npm package, MIT, 14k GitHub stars, handles all VNC encodings |
| `@types/novnc__novnc` | latest | TypeScript type definitions for @novnc/novnc | DefinitelyTyped, last updated April 2025 |
| `tokio::net::TcpStream` | (bundled with tokio) | Async TCP connection to VNC server | Already a dependency via tokio features |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `axum::extract::ws` | 0.7 (existing) | WebSocket upgrade handler | Backend proxy endpoint |
| `futures::stream` | 0.3 (existing) | Split WebSocket into sender/receiver | Bidirectional relay |
| `tokio::io` | 1 (existing) | AsyncReadExt/AsyncWriteExt for TcpStream | TCP read/write in relay |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@novnc/novnc` (direct) | `react-vnc` (wrapper) | react-vnc adds convenience but hides RFB control; lists React 19 as regular dep (not peer); less control over WebSocket lifecycle; use direct for max control |
| Custom websockify proxy | Axum WS-to-TCP relay | websockify is a separate process; Axum relay is integrated, uses existing auth/CAS patterns |
| `tokio_tungstenite` (upstream WS) | `tokio::net::TcpStream` (raw TCP) | VNC servers speak raw TCP RFB, not WebSocket; TcpStream is the correct choice |

**Installation:**
```bash
cd frontend && npm install @novnc/novnc @types/novnc__novnc
```

No new Rust crates needed -- all required crates (`tokio`, `axum`, `futures`) are already dependencies.

## Architecture Patterns

### Recommended Project Structure
```
src-tauri/src/routes/
  vnc.rs                    # WebSocket-to-TCP VNC proxy + CAS guard + status endpoint

frontend/src/
  hooks/
    useVnc.ts               # noVNC RFB lifecycle hook (connect, disconnect, events, resize)
  pages/
    remote/
      RemotePage.tsx         # Full-bleed VNC viewer page with toolbar
      VncViewer.tsx          # Core VNC canvas component
      VncToolbar.tsx         # Controls: fullscreen, clipboard, scaling, quality
      types.ts               # VNC connection types
  components/widgets/
    VncPreviewWidget.tsx     # Dashboard widget (read-only preview, click to navigate)
```

### Pattern 1: WebSocket-to-TCP Binary Relay (Backend)
**What:** Axum WebSocket handler upgrades the connection, then opens a TcpStream to the VNC server. Binary frames from the browser are forwarded as raw bytes to the TCP stream, and bytes read from the TCP stream are sent as binary WebSocket frames to the browser.
**When to use:** Whenever bridging a browser WebSocket to a raw TCP protocol.
**Example:**
```rust
// Source: Adapted from terminal.rs + claude_sessions.rs patterns in this codebase
async fn handle_vnc_ws(socket: WebSocket, state: AppState, _guard: VncConnectionGuard) {
    let vnc_host = match state.secret("VNC_HOST") {
        Some(h) if !h.is_empty() => h,
        _ => { error!("vnc: VNC_HOST not configured"); return; }
    };

    // Connect to VNC server via TCP (Tailscale IP:5900)
    let tcp_stream = match TcpStream::connect(&vnc_host).await {
        Ok(s) => s,
        Err(e) => { error!("vnc: TCP connect failed: {e}"); return; }
    };

    let (tcp_reader, tcp_writer) = tcp_stream.into_split();
    let (mut ws_sender, mut ws_receiver) = socket.split();

    // TCP -> WebSocket (VNC server output to browser)
    let tcp_to_ws = tokio::spawn(async move {
        let mut reader = BufReader::new(tcp_reader);
        let mut buf = vec![0u8; 16384];
        loop {
            match reader.read(&mut buf).await {
                Ok(0) => break,
                Ok(n) => {
                    if ws_sender.send(Message::Binary(buf[..n].to_vec())).await.is_err() {
                        break;
                    }
                }
                Err(_) => break,
            }
        }
    });

    // WebSocket -> TCP (browser input to VNC server)
    let ws_to_tcp = tokio::spawn(async move {
        let mut writer = BufWriter::new(tcp_writer);
        while let Some(Ok(msg)) = ws_receiver.next().await {
            match msg {
                Message::Binary(data) => {
                    if writer.write_all(&data).await.is_err() { break; }
                    if writer.flush().await.is_err() { break; }
                }
                Message::Close(_) => break,
                _ => {} // noVNC sends binary only
            }
        }
    });

    tokio::select! {
        _ = tcp_to_ws => {}
        _ = ws_to_tcp => {}
    }

    info!("vnc: session ended");
}
```

### Pattern 2: noVNC RFB Hook (Frontend)
**What:** A React hook that creates an RFB instance, connects to the WebSocket endpoint, and exposes connection status, clipboard, and disconnect controls.
**When to use:** In the VNC viewer page component.
**Example:**
```typescript
// Source: noVNC API docs + useTerminal.ts pattern in this codebase
import RFB from '@novnc/novnc/lib/rfb';

export function useVnc(
  containerRef: React.RefObject<HTMLDivElement | null>,
  options: VncOptions = {}
): UseVncReturn {
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rfbRef = useRef<RFB | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const wsBase = API_BASE.replace(/^http/, 'ws');
    const wsUrl = `${wsBase}/api/vnc/ws`;

    const rfb = new RFB(container, wsUrl, {
      credentials: { password: '' }, // Server handles auth via proxy
    });

    rfb.scaleViewport = true;
    rfb.resizeSession = false;
    rfb.qualityLevel = options.quality ?? 6;
    rfb.compressionLevel = options.compression ?? 2;
    rfb.viewOnly = options.viewOnly ?? false;

    rfb.addEventListener('connect', () => { setConnected(true); setError(null); });
    rfb.addEventListener('disconnect', (e) => {
      setConnected(false);
      if (!e.detail.clean) setError('VNC connection lost');
    });
    rfb.addEventListener('credentialsrequired', () => {
      // VNC password from secrets store, sent via proxy
      // noVNC will prompt -- we provide programmatically
      rfb.sendCredentials({ password: '' });
    });

    rfbRef.current = rfb;

    return () => {
      rfb.disconnect();
      rfbRef.current = null;
    };
  }, []);

  return { connected, error, rfbRef };
}
```

### Pattern 3: VNC Password Handling
**What:** The VNC password is stored in the OS keychain as `VNC_PASSWORD`. The RFB protocol authentication challenge-response happens over the proxied connection transparently -- noVNC handles the DES challenge-response internally. However, noVNC needs the password. Two approaches:
1. **Backend injects credentials:** The Axum proxy intercepts the VNC auth handshake, injects the stored password, and the browser never sees it. This is complex (requires parsing the RFB handshake in the proxy).
2. **Frontend requests password from backend:** A REST endpoint (`GET /api/vnc/credentials`) returns the VNC password to the frontend, which passes it to `RFB.sendCredentials()`. The password only crosses localhost:3000.

**Recommendation:** Use approach 2 (frontend requests from backend). The password only traverses localhost (same as MC_API_KEY). Intercepting the RFB handshake in the proxy adds enormous complexity for no real security benefit -- the proxy is already on localhost behind auth.

### Anti-Patterns to Avoid
- **Parsing RFB protocol in the proxy:** The proxy MUST be a dumb binary pipe. Do not attempt to parse, modify, or inspect VNC protocol frames. noVNC handles all protocol negotiation.
- **Using Text WebSocket frames:** noVNC expects all data as Binary frames. The proxy must forward data as `Message::Binary`, never `Message::Text`.
- **Blocking TCP reads on the tokio runtime:** Use `tokio::io::AsyncReadExt` (not `std::io::Read`). Unlike terminal.rs which needs OS threads for portable-pty's blocking API, TcpStream is natively async.
- **Hardcoding VNC server address:** Use `state.secret("VNC_HOST")` -- the Tailscale IP comes from the keychain/config.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| VNC protocol implementation | Custom RFB parser | noVNC's RFB class | RFB is complex (dozens of encodings, auth types, pixel formats); noVNC handles it all |
| WebSocket-to-TCP relay | Manual byte-level framing | tokio TcpStream + axum WS split | Standard async I/O pattern; no protocol awareness needed |
| Canvas rendering / input capture | Custom canvas VNC renderer | noVNC's built-in rendering | Handles tight encoding, cursor, compression, copy-rect, etc. |
| Clipboard sync | Custom clipboard implementation | noVNC's `clipboardPasteFrom()` + `clipboard` event | Handles clipboard negotiation per RFB spec |
| VNC authentication | DES challenge-response code | noVNC's internal auth handler | noVNC supports VNC auth, TLS, None auth natively |
| Connection scaling | Custom canvas resize math | noVNC's `scaleViewport` property | Handles aspect ratio, HiDPI, pixel ratio correctly |

**Key insight:** noVNC is a complete VNC client -- it handles everything from handshake to rendering. The backend is just a transparent binary pipe. Do not try to be smart in the proxy.

## Common Pitfalls

### Pitfall 1: noVNC Import Path
**What goes wrong:** `import RFB from '@novnc/novnc/core/rfb'` fails in Vite -- the `core/` directory contains raw ES6 modules that may not resolve correctly.
**Why it happens:** The npm package ships both `core/` (raw ES modules) and `lib/` (transpiled for npm usage). The raw `core/` files have been removed from recent npm distributions.
**How to avoid:** Import from the `lib/` directory: `import RFB from '@novnc/novnc/lib/rfb'`. If that fails, try `import RFB from '@novnc/novnc'` and check what the package exports.
**Warning signs:** Build errors about "Cannot use import statement outside a module" or "module not found".

### Pitfall 2: WebSocket Subprotocol Negotiation
**What goes wrong:** noVNC negotiates a `binary` subprotocol with the WebSocket server. If the Axum WebSocket upgrade doesn't accept this subprotocol, noVNC may fall back to base64 encoding or fail.
**Why it happens:** noVNC sends `Sec-WebSocket-Protocol: binary` during handshake. Axum's default WebSocket upgrade ignores subprotocols.
**How to avoid:** Accept the subprotocol in the Axum upgrade handler using `ws.protocols(["binary"])` if noVNC requires it. Test by connecting and checking the browser console for subprotocol warnings. Modern noVNC (1.5+) uses binary frames regardless.
**Warning signs:** Console warnings about subprotocol, base64-encoded data instead of binary.

### Pitfall 3: Axum Route Return Type Gotcha
**What goes wrong:** The WebSocket upgrade handler returns `Response` (not `Result<Json<Value>, AppError>`). Using `Result<Response, AppError>` may silently fail to register in merged routers.
**Why it happens:** Known Axum behavior documented in CLAUDE.md -- `Result<Response, AppError>` silently fails.
**How to avoid:** Return bare `Response` from the WebSocket upgrade handler (same as `terminal.rs` and `claude_sessions.rs`). Use `Json<Value>` returns for REST endpoints.
**Warning signs:** 404 when hitting the WS endpoint despite successful compilation.

### Pitfall 4: VNC Password Credential Flow
**What goes wrong:** noVNC fires `credentialsrequired` event but the app doesn't respond with `sendCredentials()`, causing the connection to hang.
**Why it happens:** If the VNC server requires password auth (type 2), noVNC cannot proceed without credentials.
**How to avoid:** Listen for `credentialsrequired`, fetch the password from `GET /api/vnc/credentials`, and call `rfb.sendCredentials({ password })`. If using VNC auth type "None", this event won't fire.
**Warning signs:** Connection stuck at "Connecting..." state, noVNC console says "credentials required".

### Pitfall 5: noVNC Bundle Size
**What goes wrong:** noVNC adds ~200-300KB to the bundle, potentially pushing past the 400KB chunk limit.
**Why it happens:** noVNC includes RFB protocol handling, multiple encodings, WebSocket wrapper, input handlers, canvas rendering.
**How to avoid:** Add noVNC to `manualChunks` in `vite.config.ts` (same as xterm): `if (id.includes('node_modules/@novnc')) return 'novnc'`. This isolates it into its own lazy-loaded chunk.
**Warning signs:** CI bundle budget check fails.

### Pitfall 6: TCP Connection Timeout / Firewall
**What goes wrong:** `TcpStream::connect()` hangs for 2+ minutes when the VNC server is unreachable (firewall, wrong IP, VNC not running).
**Why it happens:** Default TCP connect timeout is OS-controlled (often 60-120s).
**How to avoid:** Use `tokio::time::timeout(Duration::from_secs(5), TcpStream::connect(&host))` to fail fast. Return a clean error WebSocket frame to the browser before closing.
**Warning signs:** User sees infinite "Connecting..." with no feedback.

## Code Examples

### Axum VNC Router (verified pattern from terminal.rs + claude_sessions.rs)
```rust
// Source: terminal.rs pattern adapted for TCP relay
use axum::{
    extract::{ws::{Message, WebSocket}, State, WebSocketUpgrade},
    response::{IntoResponse, Response},
    routing::get, Json, Router,
};
use futures::{SinkExt, StreamExt};
use serde_json::json;
use std::sync::atomic::{AtomicUsize, Ordering};
use tokio::io::{AsyncReadExt, AsyncWriteExt, BufReader, BufWriter};
use tokio::net::TcpStream;
use tracing::{error, info};

use crate::server::{AppState, RequireAuth};

// CAS guard -- max 2 concurrent VNC sessions (each is heavyweight)
static VNC_CONNECTIONS: AtomicUsize = AtomicUsize::new(0);
const MAX_VNC_CONNECTIONS: usize = 2;

struct VncConnectionGuard;

impl VncConnectionGuard {
    fn try_new() -> Option<Self> {
        loop {
            let current = VNC_CONNECTIONS.load(Ordering::Acquire);
            if current >= MAX_VNC_CONNECTIONS { return None; }
            if VNC_CONNECTIONS.compare_exchange(
                current, current + 1, Ordering::AcqRel, Ordering::Acquire
            ).is_ok() {
                return Some(Self);
            }
        }
    }
}

impl Drop for VncConnectionGuard {
    fn drop(&mut self) {
        VNC_CONNECTIONS.fetch_sub(1, Ordering::AcqRel);
    }
}

async fn ws_upgrade(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    ws: WebSocketUpgrade,
) -> Response {
    let guard = match VncConnectionGuard::try_new() {
        Some(g) => g,
        None => {
            return (
                axum::http::StatusCode::TOO_MANY_REQUESTS,
                Json(json!({"error": "too many VNC sessions (max 2)"})),
            ).into_response();
        }
    };

    ws.max_message_size(256 * 1024) // VNC frames can be larger than terminal
        .on_upgrade(move |socket| handle_vnc_ws(socket, state, guard))
}

async fn vnc_status(RequireAuth(_session): RequireAuth) -> Json<serde_json::Value> {
    let active = VNC_CONNECTIONS.load(Ordering::Acquire);
    let available = MAX_VNC_CONNECTIONS.saturating_sub(active);
    Json(json!({ "active": active, "max": MAX_VNC_CONNECTIONS, "available": available }))
}

/// GET /api/vnc/credentials -- return VNC password for noVNC auth
async fn vnc_credentials(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Json<serde_json::Value> {
    let password = state.secret_or_default("VNC_PASSWORD");
    Json(json!({ "password": password }))
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/vnc/ws", get(ws_upgrade))
        .route("/api/vnc/status", get(vnc_status))
        .route("/api/vnc/credentials", get(vnc_credentials))
}
```

### noVNC RFB Initialization (verified from official API docs)
```typescript
// Source: https://github.com/novnc/noVNC/blob/master/docs/API.md
import RFB from '@novnc/novnc/lib/rfb';

// RFB constructor: new RFB(target, urlOrChannel, options?)
const rfb = new RFB(containerElement, 'ws://localhost:3000/api/vnc/ws', {
  shared: true,           // Allow shared VNC sessions
  credentials: { password: vncPassword },
});

// Key properties
rfb.scaleViewport = true;   // Scale to fit container
rfb.resizeSession = false;  // Don't resize remote desktop
rfb.clipViewport = false;   // Don't clip (scroll)
rfb.focusOnClick = true;    // Focus keyboard on click
rfb.qualityLevel = 6;       // JPEG quality 0-9
rfb.compressionLevel = 2;   // Compression 0-9
rfb.viewOnly = false;       // Allow input

// Events
rfb.addEventListener('connect', () => { /* connected */ });
rfb.addEventListener('disconnect', (e: CustomEvent) => {
  // e.detail.clean: boolean
});
rfb.addEventListener('credentialsrequired', (e: CustomEvent) => {
  // e.detail.types: string[] (e.g. ['password'])
  rfb.sendCredentials({ password: storedPassword });
});
rfb.addEventListener('clipboard', (e: CustomEvent) => {
  // e.detail.text: string -- clipboard data from remote
  navigator.clipboard.writeText(e.detail.text);
});
rfb.addEventListener('desktopname', (e: CustomEvent) => {
  // e.detail.name: string -- remote desktop name
});

// Send clipboard to remote
rfb.clipboardPasteFrom('text to paste');

// Disconnect
rfb.disconnect();
```

### Vite Chunk Configuration (verified from existing vite.config.ts)
```typescript
// Source: frontend/vite.config.ts -- add noVNC chunk alongside xterm
manualChunks(id) {
  if (id.includes('node_modules/@novnc')) return 'novnc'
  // ... existing chunks
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| websockify (separate Python/Node process) | Integrated Axum WS-to-TCP relay | N/A (architectural choice) | No external process to manage; uses existing auth/middleware |
| noVNC `core/` imports (raw ES6) | noVNC `lib/` imports (transpiled) | noVNC 1.5+ | Fixes module resolution issues with bundlers like Vite |
| Base64 WebSocket encoding | Binary WebSocket frames only | websockify 0.5+ | Performance improvement; base64 removed from modern noVNC |
| react-vnc wrapper | Direct @novnc/novnc | N/A (choice) | More control over RFB lifecycle; fewer abstraction layers |

**Deprecated/outdated:**
- `websockify` base64 mode: Removed in 0.5+. Only binary mode supported.
- `@novnc/novnc/core/rfb` import path: May not work with npm distributions. Use `@novnc/novnc/lib/rfb`.

## Discretion Recommendations

### noVNC Configuration Options
**Recommendation:** Default to `qualityLevel: 6`, `compressionLevel: 2` (noVNC defaults). Expose quality/compression in the VncToolbar as a slider (0-9). Higher quality = more bandwidth but better visuals. For the widget preview, use `qualityLevel: 2`, `compressionLevel: 8` (low quality, high compression) to minimize bandwidth.

### Reconnection Strategy
**Recommendation:** On disconnect, show status indicator change (green -> red). Offer a "Reconnect" button rather than auto-reconnect. Auto-reconnect for VNC is problematic because:
1. If the VNC server is down, retries waste resources
2. Each reconnect fires a new TCP connection on the backend
3. The user should consciously decide to reconnect

Provide a `retryConnection()` function in the hook. No auto-retry timer.

### Toolbar/Controls Layout
**Recommendation:** Floating toolbar at the top of the VNC viewer (similar to full-screen VNC apps). Contains:
- Connection status dot (green/red/amber)
- Desktop name label
- Clipboard paste button (paste system clipboard to remote)
- Scale toggle (fit-to-window vs 1:1 pixel)
- Quality dropdown (Low/Medium/High mapping to quality 2/5/8)
- Fullscreen button (uses browser Fullscreen API on the container)
- Disconnect button

The toolbar auto-hides after 3 seconds of mouse inactivity over it, reappears on mouse move to top edge. This keeps the VNC view unobstructed.

### Widget Preview Frame Rate and Resolution
**Recommendation:** The widget connects with `viewOnly: true` and `qualityLevel: 2` to minimize bandwidth. The widget does NOT maintain a persistent VNC connection -- it connects on mount, captures a single frame, then disconnects. Use a 30-second polling interval to refresh the preview thumbnail. This avoids holding a CAS slot for a tiny preview widget. Alternative: just show a static "VM Viewer" card with connection status (ping VNC port) and no live preview -- simpler and uses zero bandwidth.

**Recommended approach for widget:** Static card with VNC server reachability status + "Open Remote Viewer" button. No live preview. Reasoning: live preview requires a full VNC connection (CAS slot, bandwidth), is tiny and barely useful, and adds complexity. The widget is just a launcher.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1 + Rust cargo test |
| Config file | `frontend/vitest.config.ts` (existing) + `src-tauri/Cargo.toml` (existing) |
| Quick run command | `cd frontend && npx vitest run --reporter=verbose -- vnc` |
| Full suite command | `cd frontend && npx vitest run && cd ../src-tauri && cargo test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MH-27a | VNC WebSocket proxy connects to TCP VNC server | unit (Rust) | `cd src-tauri && cargo test routes::vnc` | Wave 0 |
| MH-27b | CAS guard limits concurrent VNC connections | unit (Rust) | `cd src-tauri && cargo test routes::vnc::tests::vnc_connection_guard` | Wave 0 |
| MH-27c | VNC status endpoint returns capacity info | unit (Rust) | `cd src-tauri && cargo test routes::vnc::tests::status_response` | Wave 0 |
| MH-27d | VNC credentials endpoint returns password | unit (Rust) | `cd src-tauri && cargo test routes::vnc::tests::credentials` | Wave 0 |
| MH-27e | useVnc hook manages RFB lifecycle | unit (TS) | `cd frontend && npx vitest run src/hooks/__tests__/useVnc.test.ts` | Wave 0 |
| MH-27f | VncViewer renders canvas and toolbar | unit (TS) | `cd frontend && npx vitest run src/pages/remote/__tests__/VncViewer.test.tsx` | Wave 0 |
| MH-27g | Connection status indicator transitions | unit (TS) | covered by MH-27f | Wave 0 |
| MH-27h | noVNC chunk isolated in Vite build | build | `cd frontend && npm run build` (check chunk sizes) | manual |

### Sampling Rate
- **Per task commit:** `cd src-tauri && cargo test routes::vnc && cd ../frontend && npx vitest run -- vnc`
- **Per wave merge:** Full suite: `cd frontend && npx vitest run && cd ../src-tauri && cargo test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src-tauri/src/routes/vnc.rs` -- VNC proxy route module (CAS guard, WS upgrade, TCP relay, status, credentials)
- [ ] `frontend/src/hooks/useVnc.ts` -- noVNC RFB lifecycle hook
- [ ] `frontend/src/hooks/__tests__/useVnc.test.ts` -- hook unit tests
- [ ] `frontend/src/pages/remote/` -- page directory and components
- [ ] Vite config update for noVNC chunk

## Open Questions

1. **noVNC Import Resolution in Vite**
   - What we know: The official npm package ships `lib/` (transpiled) and possibly `core/` (raw ES6). Import from `lib/rfb` is the recommended path.
   - What's unclear: Whether Vite resolves `@novnc/novnc/lib/rfb` without additional configuration. The package.json `exports` field may or may not map correctly.
   - Recommendation: Try `import RFB from '@novnc/novnc/lib/rfb'` first. If that fails, try `import RFB from '@novnc/novnc'`. If both fail, use the `novnc-core` package or configure Vite `resolve.alias`. Verify at implementation time.

2. **VNC Authentication via Proxy**
   - What we know: The proxy is a dumb binary pipe. noVNC handles DES challenge-response internally. The password needs to reach noVNC somehow.
   - What's unclear: Whether we should expose the VNC password via a REST endpoint (localhost-only) or handle it differently.
   - Recommendation: `GET /api/vnc/credentials` behind `RequireAuth` is secure enough -- it only crosses localhost, same as every other secret the app uses. The frontend stores it in a ref (not localStorage) and passes it to `sendCredentials()`.

3. **Widget Live Preview vs Static Card**
   - What we know: A live preview requires a full VNC connection (CAS slot, continuous bandwidth). The preview would be tiny and barely useful.
   - What's unclear: User preference for live vs static.
   - Recommendation: Start with static card (reachability check + launch button). Add live preview as enhancement if requested.

## Sources

### Primary (HIGH confidence)
- [noVNC API documentation](https://github.com/novnc/noVNC/blob/master/docs/API.md) - RFB class constructor, properties, events, methods
- [noVNC embedding guide](https://novnc.com/noVNC/docs/EMBEDDING.html) - deployment and query parameter reference
- [noVNC WebSocket communication (DeepWiki)](https://deepwiki.com/novnc/noVNC/5-websocket-communication) - binary frame handling, WebSock module architecture
- Existing codebase `terminal.rs` - CAS guard, WebSocket upgrade, bidirectional relay patterns
- Existing codebase `claude_sessions.rs` - WebSocket-to-upstream relay with tokio::spawn + select!

### Secondary (MEDIUM confidence)
- [@novnc/novnc npm package](https://www.npmjs.com/package/@novnc/novnc) - version 1.6.0, last published ~1 year ago
- [@types/novnc__novnc](https://www.npmjs.com/package/@types/novnc__novnc) - TypeScript definitions, updated April 2025
- [react-vnc npm package](https://www.npmjs.com/package/react-vnc) - React wrapper, v3.2.0, React 19 compatible
- [noVNC GitHub issue #1792](https://github.com/novnc/noVNC/issues/1792) - import path resolution for npm/bundler usage
- [noVNC websockify](https://github.com/novnc/websockify) - WebSocket-to-TCP proxy reference architecture
- [RFC 6143 - RFB Protocol](https://datatracker.ietf.org/doc/html/rfc6143) - VNC authentication challenge-response flow

### Tertiary (LOW confidence)
- [Medium: noVNC in Node.js + React](https://medium.com/@deepakmukundpur/how-to-use-vnc-in-a-node-js-react-project-with-novnc-83f5c8fae616) - integration tutorial (Nov 2025)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - noVNC is the de facto browser VNC client; @novnc/novnc is the official npm package; all Rust dependencies already exist
- Architecture: HIGH - WebSocket-to-TCP relay is a well-established pattern; two existing codebase examples (terminal.rs, claude_sessions.rs) provide proven templates
- Pitfalls: HIGH - import path issues are well-documented in GitHub issues; Axum route gotchas are documented in CLAUDE.md; TCP timeout is standard knowledge
- noVNC import path: MEDIUM - the exact import resolution with Vite needs runtime verification; `lib/rfb` should work but edge cases exist

**Research date:** 2026-03-23
**Valid until:** 2026-04-23 (noVNC is stable; rarely releases)
