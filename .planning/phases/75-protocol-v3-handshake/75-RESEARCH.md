# Phase 75: Protocol v3 Handshake - Research

**Researched:** 2026-03-24
**Domain:** OpenClaw Gateway WebSocket Protocol v3 (connect handshake)
**Confidence:** HIGH

## Summary

The current `gateway_ws.rs` sends a minimal connect message containing only `auth.type: "password"` and `auth.password`. The OpenClaw gateway protocol v3 requires a significantly richer handshake: `minProtocol/maxProtocol: 3`, `role: "operator"`, `scopes: [...]`, a `client` metadata object (id, version, platform, mode), and `auth.token` instead of the password-based format. Additionally, the server may send a `connect.challenge` event before the client's connect request, which the current code does not handle at all.

The error response parsing is also incorrect: the current code reads `error` as a flat string (`val.get("error").and_then(|e| e.as_str())`), but the real protocol sends `{ error: { message: "..." } }`. This must be fixed as part of the handshake work since handshake failures surface through this path.

**Primary recommendation:** Rewrite `connect_once()` in `gateway_ws.rs` to build a protocol v3 connect message, handle optional `connect.challenge` events, fix error response parsing, and store the negotiated protocol version. Surface protocol info through the `/api/gateway/status` endpoint and update Settings > Gateway to display "Connected (protocol v3)".

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
None explicitly locked. Implementation is at Claude's discretion, constrained by the OpenClaw gateway protocol v3 specification (memory/reference_openclaw_complete.md).

### Claude's Discretion
All implementation choices are at Claude's discretion. The OpenClaw gateway protocol v3 reference is the source of truth.

### Deferred Ideas (OUT OF SCOPE)
None.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| GW-01 | Connect handshake uses protocol v3 with role/scopes/client metadata (not empty JSON) | Full protocol v3 connect message structure documented from reference repo (abhi1693). Exact fields: minProtocol, maxProtocol, role, scopes, client.id/version/platform/mode, auth.token |
| GW-02 | Device identity sent in handshake (device_id, platform, app_version) | Device identity maps to `client` metadata object in connect params. device_id can be generated once and persisted in SQLite. Platform detected at compile time. App version from Cargo.toml |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| tokio-tungstenite | 0.21 | WebSocket client | Already in use, correct for Tokio runtime |
| serde_json | 1.x | JSON message construction/parsing | Already in use throughout codebase |
| futures | 0.3 | Stream splitting (SinkExt/StreamExt) | Already in use for WS read/write |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| rand | 0.8 | Generate device_id (UUID-like) | One-time device identity creation |
| sqlx | 0.7 | Persist device_id across restarts | Already in use for SQLite |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| rand for UUID generation | uuid crate | Adding a new dependency just for UUID generation is unnecessary; rand + hex formatting achieves the same thing. The protocol only needs a unique string ID, not a strict UUID |
| Numeric string IDs (current) | UUID string IDs | Reference repo uses uuid4() for request IDs, but the gateway just needs unique strings. AtomicU64 counter is fine -- the gateway does not validate ID format |

**Installation:**
No new dependencies required. Everything needed is already in Cargo.toml.

## Architecture Patterns

### Current Handshake (WRONG)
```rust
// gateway_ws.rs line 225-235 -- current broken connect message
let connect_msg = json!({
    "type": "req",
    "id": handshake_id,
    "method": "connect",
    "params": {
        "auth": {
            "type": "password",
            "password": self.password,
        }
    }
});
```

### Required Handshake (Protocol v3)
```rust
// Source: abhi1693 reference repo gateway_rpc.py lines 320-352
let connect_msg = json!({
    "type": "req",
    "id": handshake_id,
    "method": "connect",
    "params": {
        "minProtocol": 3,
        "maxProtocol": 3,
        "role": "operator",
        "scopes": [
            "operator.read",
            "operator.admin",
            "operator.approvals",
            "operator.pairing"
        ],
        "client": {
            "id": "openclaw-manager",
            "version": env!("CARGO_PKG_VERSION"),
            "platform": std::env::consts::OS,  // "linux", "macos", "windows"
            "mode": "ui"
        },
        "auth": {
            "token": self.password  // renamed from "password" to "token"
        }
    }
});
```

### Pattern 1: connect.challenge Handling
**What:** The server MAY send a `{ type: "event", event: "connect.challenge", payload: { nonce: "..." } }` before the client sends its connect request. The client should wait briefly for this event, extract the nonce if present, and include it in the device auth payload.
**When to use:** Every connection attempt.
**Example:**
```rust
// Source: abhi1693 gateway_rpc.py lines 355-376
// In connect_once(), after WS connection established:
// 1. Wait up to 2 seconds for a possible connect.challenge event
// 2. If received, extract nonce from payload
// 3. Send connect request (with nonce if present)
// 4. Wait for connect response

async fn connect_once(self: &Arc<Self>) -> anyhow::Result<()> {
    let (ws_stream, _) = tokio_tungstenite::connect_async(&self.ws_url).await?;
    let (write, mut read) = ws_stream.split();
    *self.writer.lock().await = Some(write);

    // Wait briefly for optional connect.challenge
    let _nonce = match tokio::time::timeout(
        Duration::from_secs(2),
        read.next(),
    ).await {
        Ok(Some(Ok(TungsteniteMessage::Text(text)))) => {
            let val: Value = serde_json::from_str(&text).unwrap_or_default();
            if val.get("type").and_then(|t| t.as_str()) == Some("event")
                && val.get("event").and_then(|e| e.as_str()) == Some("connect.challenge")
            {
                val.pointer("/payload/nonce")
                    .and_then(|n| n.as_str())
                    .map(String::from)
            } else {
                None
            }
        }
        _ => None,
    };

    // Build and send protocol v3 connect message
    let connect_msg = self.build_connect_message();
    // ... send and wait for response
}
```

### Pattern 2: Error Response Parsing Fix
**What:** The gateway sends errors as `{ ok: false, error: { message: "..." } }` (object), not `{ ok: false, error: "string" }`.
**When to use:** All response handling in `handle_text_frame()`.
**Example:**
```rust
// Source: abhi1693 gateway_rpc.py lines 285-293
// Current (WRONG):
let error = val.get("error")
    .and_then(|e| e.as_str())  // fails -- error is an object
    .unwrap_or("unknown gateway error");

// Correct:
let error = val.get("error")
    .and_then(|e| {
        // Try object format first: { message: "..." }
        e.get("message").and_then(|m| m.as_str())
            // Fallback to flat string format for compatibility
            .or_else(|| e.as_str())
    })
    .unwrap_or("unknown gateway error")
    .to_string();
```

### Pattern 3: Device Identity Generation and Persistence
**What:** Generate a stable device_id on first run and persist it in SQLite so the same device always identifies itself consistently.
**When to use:** During `GatewayWsClient::new()` or at app startup.
**Example:**
```rust
// Generate device_id once, store in SQLite _device_identity table
// Format: "mc-{random_hex}" (e.g., "mc-a1b2c3d4e5f6")
// No need for cryptographic keys or device pairing in this phase --
// just a stable identifier string.
```

### Pattern 4: Protocol Version in Status Response
**What:** The `/api/gateway/status` endpoint should return the negotiated protocol version.
**When to use:** Always, after connected state is reached.
**Example:**
```rust
// gateway_ws.rs -- store protocol info from connect response
pub struct GatewayWsClient {
    // ... existing fields ...
    protocol_version: Arc<RwLock<Option<u32>>>,
}

// gateway.rs -- expose in status response
json!({
    "ok": connected,
    "status": conn_state,
    "connected": connected,
    "protocol": 3,  // from stored connect response
})
```

### Recommended File Changes
```
src-tauri/src/
├── gateway_ws.rs       # PRIMARY: rewrite connect_once(), fix error parsing,
│                       #   add connect.challenge handling, store protocol version,
│                       #   add device_id field, build_connect_message() method
├── routes/gateway.rs   # MINOR: add protocol_version to gateway_status response
└── server.rs           # MINOR: pass device_id to GatewayWsClient::new()

frontend/src/
├── pages/Settings.tsx             # MINOR: update gateway section to show protocol version
├── hooks/sessions/useGatewayStatus.ts  # MINOR: add protocol field to response type
└── pages/sessions/types.ts        # MINOR: update GATEWAY_STATUS_LABELS
```

### Anti-Patterns to Avoid
- **Adding uuid crate just for request IDs:** The current AtomicU64 counter works fine. The gateway accepts any unique string.
- **Device pairing / cryptographic signatures:** The reference repo (abhi1693) supports device pairing with Ed25519 signatures, but that's a separate feature. For this phase, device identity is just a stable string ID in the `client` metadata object. Do NOT implement `device.pair.*` methods.
- **Hardcoding the token auth format:** Use the `OPENCLAW_PASSWORD` secret but send it as `auth.token`, not `auth.type: "password"`. The gateway uses token-based auth, not password-based.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Device ID | Custom UUID generator | `rand::thread_rng().gen::<[u8; 16]>()` + hex::encode | Simple, unique enough for device identification |
| Platform detection | Manual OS detection | `std::env::consts::OS` | Built-in, returns "linux"/"macos"/"windows" |
| App version | Hardcoded string | `env!("CARGO_PKG_VERSION")` | Reads from Cargo.toml at compile time |

## Common Pitfalls

### Pitfall 1: connect.challenge Timing
**What goes wrong:** The server might not send connect.challenge at all (it's optional, MAY send). If you wait too long, the connection hangs. If you don't wait at all, you miss the nonce.
**Why it happens:** Different gateway configurations may or may not require challenge-response auth.
**How to avoid:** Use a short timeout (2 seconds, matching abhi1693 reference). If no challenge arrives, proceed without a nonce. The connect request works either way.
**Warning signs:** Connection hangs for 10+ seconds on startup.

### Pitfall 2: Error Response Format Mismatch
**What goes wrong:** Current code tries `error.as_str()` but the real format is `{ error: { message: "..." } }`. All gateway errors silently fall through to "unknown gateway error" string.
**Why it happens:** The original implementation assumed a simpler error format.
**How to avoid:** Parse errors as objects first (`error.message`), fall back to flat string for compatibility.
**Warning signs:** All gateway errors showing as "unknown gateway error" in logs.

### Pitfall 3: Handshake Response Before Read Loop
**What goes wrong:** The current `wait_for_handshake()` only reads one frame. If the server sends `connect.challenge` first, the handshake response detection fails because `wait_for_handshake` sees the challenge event instead of the response.
**Why it happens:** The handshake flow has two possible paths: (1) client sends connect -> server responds, or (2) server sends challenge -> client sends connect -> server responds.
**How to avoid:** Handle the challenge BEFORE calling wait_for_handshake. Read the first frame with a timeout to check for challenge, then send the connect message, then wait for the response.
**Warning signs:** "unexpected handshake frame" log messages.

### Pitfall 4: OPENCLAW_PASSWORD vs Token
**What goes wrong:** The secret is stored as `OPENCLAW_PASSWORD` in the keychain, but protocol v3 expects `auth.token` not `auth.password`.
**Why it happens:** Legacy naming. The secret name doesn't need to change -- just the field name in the connect message.
**How to avoid:** Read `OPENCLAW_PASSWORD` from secrets but place it in `params.auth.token` in the connect message. No need to rename the secret.
**Warning signs:** "invalid auth" errors from gateway.

### Pitfall 5: Frontend Env Vars vs Backend Secrets
**What goes wrong:** Settings > Gateway currently reads `import.meta.env.VITE_OPENCLAW_WS` which is a Vite env var. The actual WS URL is configured on the backend via `OPENCLAW_WS` secret in the keychain.
**Why it happens:** The gateway section was added as a static display before the backend connection was implemented.
**How to avoid:** The gateway section should query `/api/gateway/status` for live connection info, not read frontend env vars.
**Warning signs:** Settings shows "not configured" even though the gateway is actually connected.

## Code Examples

### Complete Protocol v3 Connect Message
```rust
// Source: abhi1693 gateway_rpc.py _build_connect_params() lines 320-352
fn build_connect_message(&self) -> Value {
    let handshake_id = self.next_id.fetch_add(1, Ordering::Relaxed).to_string();

    let mut params = json!({
        "minProtocol": 3,
        "maxProtocol": 3,
        "role": "operator",
        "scopes": [
            "operator.read",
            "operator.admin",
            "operator.approvals",
            "operator.pairing"
        ],
        "client": {
            "id": "openclaw-manager",
            "version": env!("CARGO_PKG_VERSION"),
            "platform": std::env::consts::OS,
            "mode": "ui"
        }
    });

    // Add auth token if password is configured
    if !self.password.is_empty() {
        params["auth"] = json!({ "token": self.password });
    }

    json!({
        "type": "req",
        "id": handshake_id,
        "method": "connect",
        "params": params
    })
}
```

### Updated Error Parsing in handle_text_frame
```rust
// Source: abhi1693 gateway_rpc.py lines 285-293
let error = val
    .get("error")
    .and_then(|e| {
        // Protocol v3: { error: { message: "..." } }
        e.get("message")
            .and_then(|m| m.as_str())
            // Fallback: { error: "string" }
            .or_else(|| e.as_str())
    })
    .unwrap_or("unknown gateway error")
    .to_string();
```

### Updated Gateway Status Response
```rust
// gateway.rs gateway_status handler
async fn gateway_status(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let (conn_state, protocol_version) = match &state.gateway_ws {
        Some(gw) => (gw.connection_state().await, gw.protocol_version().await),
        None => (ConnectionState::NotConfigured, None),
    };
    let connected = conn_state == ConnectionState::Connected;
    Ok(Json(json!({
        "ok": connected,
        "status": conn_state,
        "connected": connected,
        "protocol": protocol_version,
    })))
}
```

### Updated Frontend Gateway Settings Section
```tsx
// Settings.tsx gateway case -- query live status instead of env vars
case 'gateway': {
  // Use the useGatewayStatus hook data
  const statusText = gwConnected
    ? `Connected (protocol v${gwProtocol || '?'})`
    : gwStatus === 'not_configured'
      ? 'Not configured'
      : 'Disconnected';
  return (
    <div>
      <div style={sectionLabel}>Gateway Connection</div>
      <div style={row}><span>Status</span><span style={val}>{statusText}</span></div>
      <div style={rowLast}><span>Auth</span><span style={val}>token</span></div>
    </div>
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Password-based auth (`auth.type: "password"`) | Token-based auth (`auth.token`) | Protocol v3 (2026) | All controllers must send token, not password |
| No protocol negotiation | minProtocol/maxProtocol fields | Protocol v3 | Server can reject incompatible clients |
| No client metadata | client object with id/version/platform/mode | Protocol v3 | Server tracks connected clients, enables version-aware behavior |
| No challenge-response | Optional connect.challenge event | Protocol v3 | Nonce-based auth verification for device pairing |

**Deprecated/outdated:**
- `auth.type: "password"` + `auth.password`: Old format, replaced by `auth.token` in protocol v3
- Flat error strings `{ error: "string" }`: Replaced by `{ error: { message: "..." } }` object format

## Open Questions

1. **connect.challenge nonce usage without device pairing**
   - What we know: The nonce is used by the `device` auth payload for signed authentication. Without device pairing, the nonce is not needed.
   - What's unclear: Whether the gateway still sends connect.challenge when device pairing is disabled.
   - Recommendation: Handle it defensively -- wait 2 seconds for possible challenge, extract nonce if present, but don't fail if absent. This matches abhi1693 reference behavior.

2. **Connect response payload structure**
   - What we know: Server responds with `{ type: "res", id: UUID, ok: true, payload: {...} }`. The payload likely contains server info (version, capabilities).
   - What's unclear: Exact fields in the connect response payload.
   - Recommendation: Log the full connect response payload on first successful connection. Store `protocol` if returned. Parse what's available, don't fail on unexpected fields.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Rust: `cargo test`, Frontend: vitest 3.x |
| Config file | Rust: default. Frontend: `frontend/vitest.config.ts` |
| Quick run command | `cd src-tauri && CARGO_TARGET_DIR=/tmp/mc-target cargo test gateway_ws` |
| Full suite command | `cd src-tauri && CARGO_TARGET_DIR=/tmp/mc-target cargo test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| GW-01 | Connect message includes minProtocol/maxProtocol 3, role, scopes, client metadata | unit | `cd src-tauri && CARGO_TARGET_DIR=/tmp/mc-target cargo test gateway_ws::tests::connect_message_protocol_v3 -x` | Wave 0 |
| GW-01 | Error responses parsed as `error.message` object | unit | `cd src-tauri && CARGO_TARGET_DIR=/tmp/mc-target cargo test gateway_ws::tests::error_response_object_format -x` | Wave 0 |
| GW-02 | Device identity (platform, app_version) present in client metadata | unit | `cd src-tauri && CARGO_TARGET_DIR=/tmp/mc-target cargo test gateway_ws::tests::client_metadata_includes_device_identity -x` | Wave 0 |
| GW-01 | Gateway status endpoint returns protocol version | unit | `cd src-tauri && CARGO_TARGET_DIR=/tmp/mc-target cargo test routes::gateway::tests -x` | Wave 0 |
| GW-01 | Frontend shows "Connected (protocol v3)" | unit | `cd frontend && npx vitest run --testPathPattern useGatewayStatus` | Existing (update) |

### Sampling Rate
- **Per task commit:** `cd src-tauri && CARGO_TARGET_DIR=/tmp/mc-target cargo test gateway_ws`
- **Per wave merge:** `cd src-tauri && CARGO_TARGET_DIR=/tmp/mc-target cargo test && cd ../frontend && npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `gateway_ws::tests::connect_message_protocol_v3` -- verify connect message structure has all v3 fields
- [ ] `gateway_ws::tests::error_response_object_format` -- verify `{ error: { message: "..." } }` is parsed correctly
- [ ] `gateway_ws::tests::client_metadata_includes_device_identity` -- verify client object has platform, version
- [ ] `gateway_ws::tests::connect_challenge_handled` -- verify challenge event is consumed before connect
- [ ] `routes::gateway::tests::status_includes_protocol` -- verify status endpoint returns protocol field
- [ ] Update existing `useGatewayStatus.test.ts` for new `protocol` field in response

## Sources

### Primary (HIGH confidence)
- abhi1693/openclaw-mission-control `backend/app/services/openclaw/gateway_rpc.py` -- full protocol v3 implementation (lines 30-414)
- Local codebase: `src-tauri/src/gateway_ws.rs` -- current implementation read in full
- Local codebase: `src-tauri/src/routes/gateway.rs` -- current HTTP routes read in full
- Project memory: `reference_openclaw_complete.md` -- protocol spec with all 88 methods and 17 events
- Project memory: `reference_openclaw_gateway_protocol.md` -- detailed method signatures

### Secondary (MEDIUM confidence)
- abhi1693/openclaw-mission-control `gateway_compat.py` -- version compatibility checks

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies needed, all libraries already in use
- Architecture: HIGH -- exact protocol format verified from reference implementation (abhi1693) which is the gold standard reference repo per project memory
- Pitfalls: HIGH -- identified by comparing current code against reference implementation line-by-line, every gap documented
- Error parsing fix: HIGH -- verified from reference repo `_await_response()` method (line 286: `data.get("error", {}).get("message", "Gateway error")`)

**Research date:** 2026-03-24
**Valid until:** 2026-04-24 (stable -- OpenClaw protocol v3 is the current version)
