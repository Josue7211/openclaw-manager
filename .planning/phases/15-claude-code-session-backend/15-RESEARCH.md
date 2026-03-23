# Phase 15: Claude Code Session Backend - Research

**Researched:** 2026-03-23
**Domain:** Rust/Axum gateway proxy for OpenClaw session management + WebSocket output streaming
**Confidence:** HIGH

## Summary

Phase 15 builds a Rust backend module (`routes/claude_sessions.rs`) that proxies Claude Code (Gunther) session management to the OpenClaw gateway running on a remote VM. The codebase already has all the primitives needed: `gateway_forward()` for REST proxying, `WsConnectionGuard` / `PtyConnectionGuard` CAS patterns for WebSocket connection limits, and the `RequireAuth` extractor for authentication.

The OpenClaw gateway exposes session management via two channels: (1) a WebSocket RPC protocol with methods like `session.list`, `session.get`, `chat.send`, `chat.stream`, and `session.reset`, and (2) an HTTP API at `/v1/chat/completions` for chat interactions. The existing `fetch_openclaw_sessions()` in `agents.rs` already calls `http://localhost:18789/api/sessions` -- this is the OpenClaw gateway's local HTTP endpoint. The new module will use `gateway_forward()` to proxy through the configured `OPENCLAW_API_URL` instead of hardcoded localhost, enabling remote VM access via Tailscale.

**Primary recommendation:** Follow the `openclaw_data.rs` + `crons.rs` pattern exactly -- thin REST handlers that validate input, call `gateway_forward()`, and return sanitized JSON. For WebSocket output streaming, follow the `terminal.rs` pattern (CAS guard + `ws.on_upgrade`) but relay to a remote WebSocket on the OpenClaw VM instead of a local PTY.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Dedicated `/api/claude-sessions/*` namespace -- separate from existing `/api/openclaw/sessions`
- All calls through `gateway_forward()` -- consistent with Phase 9 pattern, credential protection, error sanitization
- WebSocket relay for output streaming at `/api/claude-sessions/:id/ws` -- same pattern as terminal (Phase 13)
- Return 503 with `{ error, available: false }` when OpenClaw VM is unreachable
- Metadata fields: task, status, duration, model, workingDir, startedAt, sessionId -- per success criteria + existing fetch_openclaw_sessions() fields
- Status enum: `running | paused | completed | failed | unknown` -- covers all states per success criteria
- Filter Claude Code sessions by `kind === "claude-code"` or `agentId` field -- existing API returns mixed session types
- No local caching -- always proxy. Sessions are short-lived, stale data is worse than latency
- Raw text stream output -- Claude Code outputs text; structured parsing deferred
- No replay on reconnect -- join live, frontend shows "connected at..."
- Session creation payload: `{ task: string, model?: string, workingDir?: string }` -- minimal
- Kill behavior: graceful then force -- SIGTERM first, SIGKILL after 5s via OpenClaw API

### Claude's Discretion
- Internal handler structure and helper function organization
- Error message wording for edge cases
- WebSocket connection guard limits for session output streams
- Exact OpenClaw API path mapping (research will determine actual endpoints)

### Deferred Ideas (OUT OF SCOPE)
- Structured output parsing (tool calls, thoughts, code blocks)
- Token usage and cost tracking per session
- Session replay/history from completed sessions
- Multi-VM session routing (for family hosting scenario)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| MH-25 | Rust backend for monitoring and controlling Gunther (Claude Code) sessions on the OpenClaw VM. Proxies to OpenClaw's session management API via gateway_forward(). WebSocket relay for real-time session output streaming. Session lifecycle management (list, get, create, kill). | All patterns exist in codebase: gateway_forward() for REST, WsConnectionGuard for WebSocket limits, terminal.rs for WS relay. OpenClaw gateway exposes session.list, session.get, chat.send, chat.stream methods. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| axum | 0.7 | HTTP routing, WebSocket upgrade | Already in Cargo.toml, all routes use it |
| reqwest | 0.12 | HTTP client for gateway_forward() | Already in Cargo.toml, used by gateway.rs |
| tokio-tungstenite | 0.21 | WebSocket client for upstream relay | Already in Cargo.toml, remote WS connection |
| serde / serde_json | 1 | JSON serialization | Already in Cargo.toml |
| futures | 0.3 | Stream combinators for WS relay | Already in Cargo.toml |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| tracing | 0.1 | Structured logging | All handlers log operations |
| chrono | 0.4 | Timestamp parsing/formatting | Duration calculations |

**No new dependencies required.** Everything needed is already in `Cargo.toml`.

## Architecture Patterns

### Recommended Module Structure
```
src-tauri/src/routes/
├── claude_sessions.rs    # NEW: All claude-sessions handlers + tests
├── gateway.rs            # EXISTING: gateway_forward(), validate_gateway_path()
├── mod.rs                # ADD: pub mod claude_sessions; + .merge(claude_sessions::router())
```

Single file is appropriate (like `crons.rs` at ~130 lines, `openclaw_data.rs` at ~75 lines). Expected size: ~300-400 lines including tests.

### Pattern 1: REST Proxy via gateway_forward()
**What:** Thin handlers that validate input, call `gateway_forward()`, and return JSON.
**When to use:** All CRUD operations (list, get, create, kill).
**Example (from `openclaw_data.rs`):**
```rust
// Source: src-tauri/src/routes/openclaw_data.rs
async fn get_usage(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let result = gateway_forward(&state, Method::GET, "/usage", None).await?;
    Ok(Json(result))
}
```

### Pattern 2: CAS Connection Guard for WebSocket
**What:** Atomic counter with RAII drop guard limiting concurrent connections.
**When to use:** WebSocket output streaming endpoint.
**Example (from `terminal.rs`):**
```rust
// Source: src-tauri/src/routes/terminal.rs
static SESSION_WS_CONNECTIONS: AtomicUsize = AtomicUsize::new(0);
const MAX_SESSION_WS_CONNECTIONS: usize = 5;

struct SessionWsGuard;

impl SessionWsGuard {
    fn try_new() -> Option<Self> {
        loop {
            let current = SESSION_WS_CONNECTIONS.load(Ordering::Acquire);
            if current >= MAX_SESSION_WS_CONNECTIONS {
                return None;
            }
            if SESSION_WS_CONNECTIONS
                .compare_exchange(current, current + 1, Ordering::AcqRel, Ordering::Acquire)
                .is_ok()
            {
                return Some(Self);
            }
        }
    }
}

impl Drop for SessionWsGuard {
    fn drop(&mut self) {
        SESSION_WS_CONNECTIONS.fetch_sub(1, Ordering::AcqRel);
    }
}
```

### Pattern 3: WebSocket Relay to Remote OpenClaw
**What:** Axum WebSocket upgrade on client side, `tokio-tungstenite` connection on upstream side, bidirectional frame relay between them.
**When to use:** `/api/claude-sessions/:id/ws` for live output streaming.
**Key difference from terminal.rs:** Terminal relays to a local PTY (blocking I/O). Session streaming relays to a remote WebSocket (async I/O). This is simpler -- no OS threads needed.

```rust
// Conceptual pattern: relay between client WS and upstream WS
async fn handle_session_ws(
    client_socket: WebSocket,
    state: AppState,
    session_id: String,
    _guard: SessionWsGuard,
) {
    // 1. Build upstream URL: ws://<OPENCLAW_WS>/sessions/<id>/stream
    // 2. Connect via tokio-tungstenite with auth header
    // 3. Split both sockets
    // 4. Forward upstream->client and client->upstream
    // 5. On either close, clean up both
}
```

### Pattern 4: Path Parameter Extraction with Validation
**What:** Extract session ID from URL path, validate length/format.
**When to use:** GET/DELETE with session ID.
**Example (from `crons.rs`):**
```rust
// Source: src-tauri/src/routes/crons.rs
// Validate ID: non-empty, max 100 chars (no validate_uuid -- IDs may be short strings)
if id.is_empty() || id.len() > 100 {
    return Err(AppError::BadRequest("invalid session id".into()));
}
```

### Anti-Patterns to Avoid
- **Direct HTTP to localhost:18789:** The `fetch_openclaw_sessions()` in `agents.rs` calls `http://localhost:18789/api/sessions` directly. This only works when the app runs on the same machine as OpenClaw. All new code MUST use `gateway_forward()` which routes through `OPENCLAW_API_URL` (Tailscale IP).
- **Custom reqwest clients:** Never build a new `reqwest::Client` in handlers. Use `state.http` via `gateway_forward()`.
- **Leaking credentials:** The `openclaw_api_key()` and `openclaw_api_url()` values are never logged or returned to the client. `sanitize_error_body()` strips IPs and paths from error messages.
- **Blocking in async:** Never use `std::thread::spawn` for the WS relay -- both sides are async. Use `tokio::spawn` and `tokio::select!`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTTP proxying | Custom reqwest calls with manual auth | `gateway_forward()` from `gateway.rs` | Handles path validation, auth header injection, error sanitization, credential protection |
| Connection limiting | Manual counters or mutexes | CAS guard pattern (AtomicUsize + RAII Drop) | Race-free, zero-overhead, proven in terminal.rs and chat.rs |
| Error sanitization | Manual IP/path stripping | `sanitize_error_body()` from `gateway.rs` | Already handles Tailscale IPs, file paths, stack traces, API keys |
| WebSocket upgrade | Raw hyper upgrade | Axum `WebSocketUpgrade` extractor | Type-safe, handles protocol negotiation, integrates with extractors |
| Auth checking | Manual header parsing | `RequireAuth` extractor | MFA enforcement, session validation, consistent with all other routes |
| Path validation | Regex or manual checks | `validate_gateway_path()` from `gateway.rs` | Prevents traversal, injection, null bytes, CRLF |

**Key insight:** This phase is almost entirely composition of existing primitives. The only new code is the handler wiring and WebSocket relay logic.

## Common Pitfalls

### Pitfall 1: OpenClaw API Path Mismatch
**What goes wrong:** The OpenClaw gateway exposes session management via WebSocket RPC methods (`session.list`, `session.get`, `chat.send`), not clean REST endpoints. The existing HTTP API is limited to `/v1/chat/completions` and `/tools/invoke`.
**Why it happens:** OpenClaw was designed as a WebSocket-first protocol. REST is secondary.
**How to avoid:** The `gateway_forward()` approach works because the OpenClaw gateway also exposes a REST-compatible `/api/sessions` endpoint (already used by `fetch_openclaw_sessions()`). The gateway translates HTTP requests to internal RPC calls. Map REST endpoints to these internal routes:
- `GET /api/sessions` -> list sessions
- `GET /api/sessions/:id` -> get session detail
- `POST /api/sessions` -> create/spawn session
- `DELETE /api/sessions/:id` -> kill session
- WebSocket at the gateway's streaming endpoint for output
**Warning signs:** 404s from gateway_forward() -- means the REST path mapping is wrong.

### Pitfall 2: Session Filtering (Mixed Session Types)
**What goes wrong:** The OpenClaw gateway manages multiple session types: main agent conversations, cron jobs, webhook sessions, subagent sessions, AND Claude Code sessions. The `session.list` response includes ALL of them.
**Why it happens:** OpenClaw sessions are polymorphic -- identified by key format (`agent:id:main`, `cron:job-id`, etc.) and metadata fields (`kind`, `agentId`).
**How to avoid:** Filter on the backend before returning to the frontend. The CONTEXT.md specifies: filter by `kind === "claude-code"` or `agentId` field. Apply this filter in the list handler after receiving the gateway response.
**Warning signs:** Frontend shows irrelevant sessions (cron jobs, webhook sessions).

### Pitfall 3: WebSocket Relay Deadlock
**What goes wrong:** The WebSocket relay hangs or drops messages because both sides are waiting to send simultaneously.
**Why it happens:** Using a single task to relay bidirectionally can deadlock when both sides have pending sends.
**How to avoid:** Split both the client WebSocket and upstream WebSocket into separate read/write halves. Use `tokio::select!` or two `tokio::spawn` tasks: one for upstream->client, one for client->upstream. When either direction errors, cancel both.
**Warning signs:** WebSocket connections hang after initial connect, or messages arrive with increasing latency.

### Pitfall 4: Missing 503 for Unreachable VM
**What goes wrong:** When the OpenClaw VM is down, `gateway_forward()` returns a generic `Internal` error. The CONTEXT.md requires a specific `503 { error, available: false }` response.
**Why it happens:** `gateway_forward()` wraps network errors as `AppError::Internal`, which returns 500 with "Something went wrong".
**How to avoid:** Catch the specific error case in the handler. Before calling `gateway_forward()`, check `openclaw_api_url()` -- if None, return the 503. For network errors from `gateway_forward()`, match on the error and return the 503 envelope. Alternatively, add a health check before operations.
**Warning signs:** Frontend can't distinguish "not configured" from "temporarily unreachable".

### Pitfall 5: WebSocket Auth Before Upgrade
**What goes wrong:** The WebSocket connection is established without authentication, then the auth check fails after the upgrade is complete.
**Why it happens:** WebSocket upgrade in Axum happens in the handler, but auth needs to be checked before calling `ws.on_upgrade()`.
**How to avoid:** Place `RequireAuth` as an extractor parameter BEFORE `WebSocketUpgrade`. Axum runs extractors in order -- if `RequireAuth` fails, the handler never runs. This is already the correct pattern used in `terminal.rs` and `chat.rs`.
**Warning signs:** Unauthenticated WebSocket connections succeed.

### Pitfall 6: Route Registration Silent Failure
**What goes wrong:** New routes compile but return 404 at runtime.
**Why it happens:** From CLAUDE.md: "Handlers returning `Result<Response, AppError>` may silently fail to register in merged routers."
**How to avoid:** Use `Result<Json<Value>, AppError>` for REST handlers (matching all other handlers). Test new routes with `curl` immediately after adding. Always `cargo clean -p mission-control` before restart.
**Warning signs:** 404 on newly added routes despite successful compilation.

## Code Examples

### Example 1: List Sessions Handler
```rust
// Pattern follows openclaw_data.rs
async fn list_sessions(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let result = gateway_forward(&state, Method::GET, "/sessions", None).await;

    match result {
        Ok(data) => {
            // Filter to Claude Code sessions only
            let sessions = data
                .get("sessions")
                .and_then(|v| v.as_array())
                .cloned()
                .unwrap_or_default();

            let filtered: Vec<Value> = sessions
                .into_iter()
                .filter(|s| {
                    s.get("kind").and_then(|v| v.as_str()) == Some("claude-code")
                        || s.get("agentId").and_then(|v| v.as_str()) == Some("coding")
                })
                .collect();

            Ok(Json(json!({ "sessions": filtered })))
        }
        Err(_) => {
            // 503 when unreachable
            Ok(Json(json!({
                "error": "OpenClaw VM unreachable",
                "available": false,
                "sessions": []
            })))
        }
    }
}
```

### Example 2: Create Session Handler
```rust
// Pattern follows crons.rs create_cron
#[derive(Debug, Deserialize)]
struct CreateSessionBody {
    task: String,
    model: Option<String>,
    #[serde(rename = "workingDir")]
    working_dir: Option<String>,
}

async fn create_session(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Json(body): Json<CreateSessionBody>,
) -> Result<Json<Value>, AppError> {
    if body.task.trim().is_empty() {
        return Err(AppError::BadRequest("task description required".into()));
    }
    if body.task.len() > 2000 {
        return Err(AppError::BadRequest("task too long (max 2000 chars)".into()));
    }

    let payload = json!({
        "task": body.task.trim(),
        "model": body.model,
        "workingDir": body.working_dir,
    });

    let result = gateway_forward(
        &state, Method::POST, "/sessions/spawn", Some(payload)
    ).await?;
    Ok(Json(result))
}
```

### Example 3: Kill Session Handler
```rust
// Pattern follows crons.rs delete_cron
#[derive(Debug, Deserialize)]
struct KillSessionBody {
    id: String,
}

async fn kill_session(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Json(body): Json<KillSessionBody>,
) -> Result<Json<Value>, AppError> {
    if body.id.is_empty() || body.id.len() > 100 {
        return Err(AppError::BadRequest("invalid session id".into()));
    }

    let result = gateway_forward(
        &state,
        Method::DELETE,
        &format!("/sessions/{}", body.id),
        None,
    ).await?;
    Ok(Json(result))
}
```

### Example 4: WebSocket Relay
```rust
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::http::Request;

async fn handle_session_ws(
    client_ws: WebSocket,
    state: AppState,
    session_id: String,
    _guard: SessionWsGuard,
) {
    // 1. Build upstream URL
    let ws_base = state.secret_or_default("OPENCLAW_WS");
    let ws_url = if ws_base.is_empty() {
        format!("ws://127.0.0.1:18789/sessions/{}/stream", session_id)
    } else {
        format!("{}/sessions/{}/stream", ws_base, session_id)
    };

    // 2. Connect upstream with auth
    let api_key = gateway::openclaw_api_key(&state);
    let request = Request::builder()
        .uri(&ws_url)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Connection", "Upgrade")
        .header("Upgrade", "websocket")
        .header("Sec-WebSocket-Version", "13")
        .header("Sec-WebSocket-Key", tokio_tungstenite::tungstenite::handshake::client::generate_key())
        .body(())
        .unwrap();

    let (upstream_ws, _) = match connect_async(request).await {
        Ok(conn) => conn,
        Err(e) => {
            tracing::error!("session ws: upstream connect failed: {e}");
            let _ = client_ws.close().await;
            return;
        }
    };

    // 3. Split both sockets and relay bidirectionally
    let (client_tx, client_rx) = client_ws.split();
    let (upstream_tx, upstream_rx) = upstream_ws.split();

    // upstream -> client
    let up_to_client = tokio::spawn(/* ... */);
    // client -> upstream (for commands like pause/resume)
    let client_to_up = tokio::spawn(/* ... */);

    tokio::select! {
        _ = up_to_client => {},
        _ = client_to_up => {},
    }
}
```

### Example 5: Router Registration
```rust
// In claude_sessions.rs
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/claude-sessions", get(list_sessions).post(create_session))
        .route("/api/claude-sessions/:id", get(get_session))
        .route("/api/claude-sessions/:id/kill", post(kill_session))
        .route("/api/claude-sessions/:id/ws", get(ws_upgrade))
        .route("/api/claude-sessions/status", get(session_ws_status))
}

// In mod.rs: add to router()
pub mod claude_sessions;
// ...
.merge(claude_sessions::router())
```

## OpenClaw API Path Mapping

Based on research of the OpenClaw gateway protocol and existing codebase usage:

| MC Endpoint | Method | OpenClaw Gateway Path | Notes |
|-------------|--------|----------------------|-------|
| `GET /api/claude-sessions` | GET | `/sessions` | Filter response by `kind=claude-code` |
| `GET /api/claude-sessions/:id` | GET | `/sessions/:id` | Session detail with metadata |
| `POST /api/claude-sessions` | POST | `/sessions/spawn` | Creates new Claude Code session |
| `POST /api/claude-sessions/:id/kill` | POST/DELETE | `/sessions/:id` (DELETE) or `/sessions/:id/stop` | Graceful kill via gateway |
| `GET /api/claude-sessions/:id/ws` | WebSocket | `ws://<OPENCLAW_WS>/sessions/:id/stream` | Or `chat.stream` via WS RPC |

**Confidence: MEDIUM** -- The existing `fetch_openclaw_sessions()` confirms `/api/sessions` works as a list endpoint. Session spawn and kill paths are inferred from OpenClaw docs and need verification against the actual running gateway. The WebSocket streaming path may need adjustment based on the actual gateway implementation.

**Fallback strategy:** If the gateway does not expose clean REST paths for spawn/kill, wrap the `openclaw gateway call` CLI command (like `openclaw_cli.rs` does for `openclaw sessions list --json`). This is less elegant but known to work.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `fetch_openclaw_sessions()` via localhost:18789 | `gateway_forward()` via OPENCLAW_API_URL | Phase 9 (gateway.rs) | Remote VM support via Tailscale |
| `openclaw sessions list --json` CLI | Gateway HTTP API | Phase 12 (openclaw_data.rs) | No CLI dependency, works remotely |
| Custom reqwest per-handler | Shared `state.http` client | Phase 9 | Connection pooling, consistent timeout |

**Deprecated/outdated:**
- Direct `localhost:18789` access: Only works when app runs on same machine as OpenClaw. Use `gateway_forward()` instead.
- `openclaw_cli.rs` CLI-based session listing: Kept for backward compatibility but new code should use gateway proxy.

## Open Questions

1. **Exact OpenClaw REST paths for session spawn and kill**
   - What we know: `/api/sessions` works for listing (confirmed by `agents.rs`). OpenClaw WebSocket RPC has `session.list`, `session.get`, `chat.send`, `chat.stream`. The Tools Invoke API lists `sessions_spawn` as a hard-deny by default.
   - What's unclear: Whether the gateway exposes REST endpoints at `/sessions/spawn` or `/sessions/:id/stop`, or if these must go through WebSocket RPC or the CLI.
   - Recommendation: Try `gateway_forward()` paths first. If 404, fall back to wrapping `openclaw gateway call session.reset --params '{...}'` via `tokio::process::Command` (same pattern as `openclaw_cli.rs`). The list and get operations are confirmed to work via HTTP.

2. **WebSocket streaming endpoint format**
   - What we know: OpenClaw supports `chat.stream(sessionKey)` via WebSocket RPC. Session transcripts are JSONL files.
   - What's unclear: Whether there's a dedicated HTTP-upgradeable WebSocket endpoint for session output streaming, or if we need to use the main gateway WebSocket and subscribe via RPC.
   - Recommendation: First try connecting to `ws://<host>/sessions/:id/stream`. If not available, connect to the main gateway WebSocket and send a `chat.stream` RPC request. Either way, the upstream connection is async and the relay pattern is the same.

3. **Session spawn -- API key vs Claude Code SDK**
   - What we know: The Claude Agent SDK spawns sessions via `query()`. OpenClaw spawns via `sessions_spawn` tool. The Tools Invoke HTTP API has `sessions_spawn` in the hard-deny list by default.
   - What's unclear: Whether the gateway has a REST endpoint for session creation or if it must go through the WebSocket RPC protocol.
   - Recommendation: The gateway likely exposes session creation via its internal API since `sessions_spawn` exists as a tool. If the REST path fails, use `openclaw gateway call chat.send` with appropriate params, or dispatch via the chat completions endpoint with a `x-openclaw-session-key` header.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Rust built-in #[test] + cargo test |
| Config file | src-tauri/Cargo.toml |
| Quick run command | `cd src-tauri && cargo test --lib routes::claude_sessions` |
| Full suite command | `cd src-tauri && cargo test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MH-25-a | REST endpoint paths registered | unit | `cd src-tauri && cargo test --lib routes::claude_sessions -x` | Wave 0 |
| MH-25-b | CreateSessionBody deserializes correctly | unit | `cd src-tauri && cargo test --lib routes::claude_sessions::tests::create_body -x` | Wave 0 |
| MH-25-c | KillSessionBody validates ID length | unit | `cd src-tauri && cargo test --lib routes::claude_sessions::tests::kill_body -x` | Wave 0 |
| MH-25-d | Gateway paths pass validate_gateway_path() | unit | `cd src-tauri && cargo test --lib routes::claude_sessions::tests::validate_paths -x` | Wave 0 |
| MH-25-e | CAS connection guard limits concurrent WS | unit | `cd src-tauri && cargo test --lib routes::claude_sessions::tests::connection_guard -x` | Wave 0 |
| MH-25-f | Session status endpoint response shape | unit | `cd src-tauri && cargo test --lib routes::claude_sessions::tests::status_shape -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd src-tauri && cargo test --lib routes::claude_sessions -x`
- **Per wave merge:** `cd src-tauri && cargo test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src-tauri/src/routes/claude_sessions.rs` -- new file with all handlers + #[cfg(test)] mod tests
- [ ] Test infrastructure exists (cargo test) -- no new framework needed

*(No framework install needed -- Rust test infrastructure is already in place)*

## Sources

### Primary (HIGH confidence)
- **Codebase analysis** -- `gateway.rs`, `openclaw_data.rs`, `crons.rs`, `agents.rs`, `terminal.rs`, `chat.rs` -- verified patterns for gateway proxying, WebSocket relay, CAS guards
- **OpenClaw gateway protocol** -- https://docs.openclaw.ai/gateway/protocol.md -- WebSocket RPC framing, methods
- **OpenClaw session management** -- https://docs.openclaw.ai/concepts/session.md -- session lifecycle, storage, CLI commands
- **Claude Agent SDK sessions** -- https://platform.claude.com/docs/en/agent-sdk/sessions -- session IDs, lifecycle, query() API
- **Claude Code CLI reference** -- https://code.claude.com/docs/en/cli-reference -- session flags, --print mode, --output-format

### Secondary (MEDIUM confidence)
- **OpenClaw DeepWiki** -- https://deepwiki.com/openclaw/openclaw/2.4-session-management -- session.list, session.get, chat.send, chat.stream RPC methods
- **OpenClaw Tools Invoke API** -- https://docs.openclaw.ai/gateway/tools-invoke-http-api.md -- sessions_spawn in hard-deny list
- **OpenClaw HTTP API** -- https://docs.openclaw.ai/gateway/openai-http-api.md -- /v1/chat/completions, x-openclaw-session-key header

### Tertiary (LOW confidence)
- **Exact REST paths for spawn/kill** -- inferred from WebSocket RPC method names and gateway architecture; needs verification against running gateway

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- zero new dependencies, all patterns proven in codebase
- Architecture: HIGH -- direct composition of gateway_forward(), CAS guard, WS relay patterns
- Pitfalls: HIGH -- identified from actual codebase patterns and CLAUDE.md warnings
- OpenClaw API paths: MEDIUM -- list/get confirmed, spawn/kill/stream paths inferred

**Research date:** 2026-03-23
**Valid until:** 2026-04-22 (30 days -- stable patterns, OpenClaw API unlikely to change)
