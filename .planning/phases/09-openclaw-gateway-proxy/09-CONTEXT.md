# Phase 9: OpenClaw Gateway Proxy Helper - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Build a reusable `gateway_forward()` function in a new `gateway.rs` module. This is the security-critical proxy foundation that all OpenClaw CRUD routes (agents, crons, sessions, usage, models, tools) will build on. It proxies requests to the OPENCLAW_API_URL with API key authentication, sanitizes error responses, and validates path parameters.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure phase.

Key constraints from existing code:
- `openclaw_api_url()` and `openclaw_api_key()` already exist in `agents.rs` — extract and centralize
- Use `ServiceClient` pattern from `service_client.rs` for consistent timeout/retry
- Use `validate_uuid()` from `crate::validation` for path parameter validation
- Error sanitization must strip API keys, internal IPs, stack traces from responses
- Follow `RequireAuth` extractor pattern on all endpoints

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `service_client.rs` — ServiceClient with retry, timeout, logging
- `agents.rs` — openclaw_api_url(), openclaw_api_key() helpers (to be extracted)
- `crate::validation::validate_uuid()` — UUID validation
- `crate::error::AppError` — unified error type
- `crate::server::{AppState, RequireAuth}` — auth middleware

### Established Patterns
- Routes return `Result<Json<Value>, AppError>`
- State accessed via `State(state): State<AppState>`
- Secrets via `state.secret("KEY")`
- Existing proxy patterns: `bridge_fetch()` in reminders.rs, BlueBubbles proxy in messages.rs

### Integration Points
- New file: `src-tauri/src/routes/gateway.rs`
- Register in `routes/mod.rs`
- Consumed by: agents, crons, sessions, usage, models, tools routes

</code_context>

<specifics>
## Specific Ideas

No specific requirements — infrastructure phase

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>
