# Phase 15: Claude Code Session Backend - Context

**Gathered:** 2026-03-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver Rust backend endpoints for monitoring and controlling Claude Code (Gunther) sessions running on the OpenClaw VM. All requests proxy through gateway_forward() with credential protection. Includes REST CRUD + WebSocket output streaming.

</domain>

<decisions>
## Implementation Decisions

### API Surface Design
- Dedicated `/api/claude-sessions/*` namespace — separate from existing `/api/openclaw/sessions`
- All calls through `gateway_forward()` — consistent with Phase 9 pattern, credential protection, error sanitization
- WebSocket relay for output streaming at `/api/claude-sessions/:id/ws` — same pattern as terminal (Phase 13)
- Return 503 with `{ error, available: false }` when OpenClaw VM is unreachable

### Session Data Model
- Metadata fields: task, status, duration, model, workingDir, startedAt, sessionId — per success criteria + existing fetch_openclaw_sessions() fields
- Status enum: `running | paused | completed | failed | unknown` — covers all states per success criteria
- Filter Claude Code sessions by `kind === "claude-code"` or `agentId` field — existing API returns mixed session types
- No local caching — always proxy. Sessions are short-lived, stale data is worse than latency

### Output Streaming & Control
- Raw text stream output — Claude Code outputs text; structured parsing deferred
- No replay on reconnect — join live, frontend shows "connected at..."
- Session creation payload: `{ task: string, model?: string, workingDir?: string }` — minimal
- Kill behavior: graceful then force — SIGTERM first, SIGKILL after 5s via OpenClaw API

### Claude's Discretion
- Internal handler structure and helper function organization
- Error message wording for edge cases
- WebSocket connection guard limits for session output streams
- Exact OpenClaw API path mapping (research will determine actual endpoints)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `gateway_forward()` in `routes/gateway.rs` — single chokepoint for OpenClaw communication with path validation, error sanitization
- `openclaw_api_url()` / `openclaw_api_key()` — credential lookups from AppState
- `fetch_openclaw_sessions()` in `agents.rs` — existing session fetch from `http://localhost:18789/api/sessions`
- `detect_claude_processes()` in `agents.rs` — ps-based Claude process detection
- `WsConnectionGuard` pattern from `chat.rs` — CAS guard for WebSocket limits
- `PtyConnectionGuard` pattern from `terminal.rs` — same pattern, max 3

### Established Patterns
- Gateway forwarding: `gateway_forward(&state, Method::POST, path, body)` with 30s timeout
- Path validation: `validate_gateway_path(path)?` prevents traversal/injection
- Error sanitization: 4xx → BadRequest (cleaned), 5xx → Internal (hidden)
- WebSocket upgrade: `RequireAuth` + connection guard + `ws.on_upgrade()`
- Credential protection: secrets from AppState, never logged, redacted in errors

### Integration Points
- Route registration: `pub mod claude_sessions;` + `.merge(claude_sessions::router())` in `routes/mod.rs`
- Gateway credentials: `OPENCLAW_API_URL` + `OPENCLAW_API_KEY` from secrets
- Existing sessions: `/api/openclaw/sessions` (CLI-based) coexists with new gateway-based endpoints
- Frontend will consume these in Phase 16 (Session Monitor Frontend)

</code_context>

<specifics>
## Specific Ideas

No specific requirements — standard gateway proxy pattern following established conventions.

</specifics>

<deferred>
## Deferred Ideas

- Structured output parsing (tool calls, thoughts, code blocks)
- Token usage and cost tracking per session
- Session replay/history from completed sessions
- Multi-VM session routing (for family hosting scenario)

</deferred>
