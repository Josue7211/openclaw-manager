# Phase 9: OpenClaw Gateway Proxy Helper - Research

**Researched:** 2026-03-22
**Domain:** Rust/Axum HTTP proxy pattern, error sanitization, security
**Confidence:** HIGH

## Summary

Phase 9 builds a centralized `gateway_forward()` function in a new `gateway.rs` route module. This function becomes the single chokepoint through which all OpenClaw API requests flow (agents, crons, sessions, usage, models, tools in Phases 10-12, 15). The codebase already has multiple ad-hoc implementations of this pattern scattered across `agents.rs`, `chat.rs`, `memory.rs`, and `workspace.rs` -- each duplicating credential lookup, Authorization header construction, and error handling with varying quality. The gateway module consolidates this.

The existing codebase provides every building block needed: `ServiceClient` with retry/timeout, `AppState.openclaw: Option<ServiceClient>` pre-configured at startup, `validate_uuid()` for path validation, `redact()` for secret stripping, and `AppError` with a clean response envelope. The research confirms no new dependencies are required -- this is pure Rust refactoring with the existing stack.

**Primary recommendation:** Build `gateway_forward()` using `state.http` (the shared reqwest::Client) rather than the `ServiceClient` wrapper. The ServiceClient forces JSON parsing of all responses (including 4xx), which is undesirable when the gateway needs to distinguish between JSON and non-JSON error bodies. Use `state.http` directly with manual Bearer header injection, matching the `bridge_fetch()` pattern from `reminders.rs`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
None -- all implementation choices are at Claude's discretion.

### Claude's Discretion
All implementation choices are at Claude's discretion -- pure infrastructure phase.

Key constraints from existing code:
- `openclaw_api_url()` and `openclaw_api_key()` already exist in `agents.rs` -- extract and centralize
- Use `ServiceClient` pattern from `service_client.rs` for consistent timeout/retry
- Use `validate_uuid()` from `crate::validation` for path parameter validation
- Error sanitization must strip API keys, internal IPs, stack traces from responses
- Follow `RequireAuth` extractor pattern on all endpoints

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| MH-05 | OpenClaw Gateway Proxy Helper -- single reusable proxy with credential protection, error sanitization, input validation | All research findings: proxy patterns (bridge_fetch, existing OpenClaw callers), validation (validate_uuid), error handling (AppError + redact), ServiceClient infrastructure |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| axum | 0.7 | HTTP framework, Router, State extraction, RequireAuth | Already used by all routes |
| reqwest | 0.12 | HTTP client for outbound proxy requests | Already in AppState.http |
| serde_json | 1 | JSON Value manipulation | Used everywhere |
| anyhow | 1 | Error wrapping for AppError::Internal | Used everywhere |
| regex | 1 | IP/path pattern matching in sanitization | Already a dependency |
| tracing | 0.1 | Structured logging | Used everywhere |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| chrono | 0.4 | Timestamps (if needed for health response) | Only if health route needs it |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Raw reqwest | ServiceClient | ServiceClient forces JSON parse on all responses and retries on 5xx -- undesirable for a generic proxy where we want control over error response handling. Use state.http directly. |
| New 503 AppError variant | AppError::BadRequest | Adding ServiceUnavailable is scope creep. BadRequest("OpenClaw API not configured") is semantically acceptable and preserves the message for the frontend. |

**Installation:** No new packages needed.

## Architecture Patterns

### Recommended Project Structure
```
src-tauri/src/routes/
├── gateway.rs          # NEW: gateway_forward(), sanitize_error_body(), openclaw_api_url/key, health route
├── agents.rs           # MODIFIED: remove local openclaw_api_url/key, import from gateway
├── mod.rs              # MODIFIED: add pub mod gateway + merge(gateway::router())
└── ...                 # chat.rs, memory.rs, workspace.rs -- future phases can migrate
```

### Pattern 1: Centralized Credential Helpers (Extract from agents.rs)
**What:** `pub(crate) fn openclaw_api_url(state: &AppState) -> Option<String>` and `pub(crate) fn openclaw_api_key(state: &AppState) -> String` moved to gateway.rs as the single source of truth.
**When to use:** Any route that needs to talk to the OpenClaw API.
**Why centralize:** Currently duplicated in agents.rs (line 15-21), chat.rs (line 101-107), and partially in memory.rs, workspace.rs. Each copy is identical.
**Example:**
```rust
// Source: src-tauri/src/routes/agents.rs lines 15-21 (current pattern to extract)
pub(crate) fn openclaw_api_url(state: &AppState) -> Option<String> {
    state.secret("OPENCLAW_API_URL").filter(|s| !s.is_empty())
}

pub(crate) fn openclaw_api_key(state: &AppState) -> String {
    state.secret_or_default("OPENCLAW_API_KEY")
}
```

### Pattern 2: Bridge-Style Proxy (from reminders.rs)
**What:** The `bridge_fetch()` function in reminders.rs is the closest existing pattern to what `gateway_forward()` needs to be.
**When to use:** As the template for gateway_forward().
**Key properties of bridge_fetch:**
- Takes `client`, `host`, `api_key`, `path`, `method`, `body: Option<Value>`
- Adds auth header if key is non-empty
- Returns `Result<Value, AppError>`
- Logs errors with `tracing::error!`
- Returns sanitized error messages (not raw upstream errors)

**Example:**
```rust
// Source: src-tauri/src/routes/reminders.rs lines 27-59
async fn bridge_fetch(
    client: &reqwest::Client,
    host: &str,
    api_key: &str,
    path: &str,
    method: reqwest::Method,
    body: Option<Value>,
) -> Result<Value, AppError> {
    let url = format!("{host}{path}");
    let mut req = client.request(method, &url).header("Content-Type", "application/json");
    if !api_key.is_empty() {
        req = req.header("X-API-Key", api_key);
    }
    if let Some(b) = body { req = req.json(&b); }

    let res = req.send().await.map_err(|e| {
        tracing::error!("[reminders] Bridge request failed: {e}");
        AppError::Internal(anyhow::anyhow!("Failed to reach Mac Bridge"))
    })?;

    if !res.status().is_success() {
        let status = res.status();
        let text = res.text().await.unwrap_or_default();
        tracing::error!("[reminders] Bridge {status}: {text}");
        return Err(AppError::Internal(anyhow::anyhow!("Bridge {status}: {text}")));
    }

    res.json::<Value>().await.map_err(|e| AppError::Internal(e.into()))
}
```

### Pattern 3: Error Response Envelope (from error.rs)
**What:** AppError's IntoResponse maps to JSON envelopes: `{ "ok": false, "error": "<message>", "code": "<code>" }`.
**Critical detail:** `AppError::Internal` ALWAYS returns `"Something went wrong"` to the client (line 43 of error.rs) -- the actual error is only logged server-side. This is a security feature. It means any upstream error routed through `Internal` is automatically sanitized.
**For gateway_forward:** Use `BadRequest` for user-actionable errors (not configured, invalid input) and `Internal` for upstream failures (5xx, unreachable). The `Internal` variant's response is inherently safe.

### Pattern 4: "Not Configured" Pattern (from reminders.rs)
**What:** When a service is not configured, return a helpful JSON response (not an error).
**Example from reminders.rs:**
```rust
// Source: src-tauri/src/routes/reminders.rs lines 88-97
let (host, api_key) = match bridge_config(&state) {
    Some(cfg) => cfg,
    None => {
        return Ok(Json(json!({
            "error": "bridge_not_configured",
            "message": "Set MAC_BRIDGE_HOST in Settings...",
            "reminders": [],
        })));
    }
};
```
**For gateway_forward:** Use `AppError::BadRequest("OpenClaw API not configured. Set OPENCLAW_API_URL in Settings > Connections.".into())` which preserves the message for the frontend via the error envelope.

### Pattern 5: Route Registration (from mod.rs)
**What:** Modules declared with `pub mod gateway;` and routers merged with `.merge(gateway::router())`.
**Registration order:** Alphabetical. gateway goes after `export`.
**Example:**
```rust
// Source: src-tauri/src/routes/mod.rs
pub mod gateway;  // after export
// ...
.merge(gateway::router())  // after export::router()
```

### Anti-Patterns to Avoid
- **Creating a new reqwest::Client per request:** memory.rs (line 19) and agents.rs (line 203) both do `reqwest::Client::new()` or `reqwest::Client::builder()...build()` inside handlers. Use `state.http` instead -- it's a shared client with connection pooling.
- **Leaking raw upstream errors:** memory.rs silently swallows errors (returns empty data), which is fine for display but gateway_forward() needs to surface meaningful errors while sanitizing secrets.
- **Returning raw AppError::Internal with upstream text:** If you do `AppError::Internal(anyhow::anyhow!("Bridge {status}: {text}"))`, the `text` is logged but never shown to the client (the Internal variant returns "Something went wrong"). This is safe but loses useful context. For 4xx upstream errors, use `BadRequest(sanitized_message)` to give the frontend something useful.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Secret redaction | Custom regex for API keys/tokens | `crate::redact::redact()` | Already handles sk-*, JWTs, hex strings, password assignments. 7 unit tests. |
| UUID validation | Custom regex check | `crate::validation::validate_uuid()` | Already validated, rejects PostgREST injection chars. 5 unit tests. |
| Auth extraction | Manual session checking | `RequireAuth(session)` extractor | Checks session presence + MFA verification. |
| Error envelope | Custom JSON error format | `AppError` variants | Consistent `{ ok, error, code }` envelope. Automatic "Something went wrong" for Internal. |
| HTTP client | `reqwest::Client::new()` in handlers | `state.http` | Shared connection pool, 30s default timeout. |
| Secret lookup | `std::env::var()` | `state.secret("KEY")` / `state.secret_or_default("KEY")` | Reads from in-memory HashMap populated from OS keychain + Supabase user_secrets. |

**Key insight:** This phase is primarily about consolidation and a thin security layer, not building complex new functionality. Every building block exists; the value is in combining them into a single reusable function.

## Common Pitfalls

### Pitfall 1: Cargo Package Name
**What goes wrong:** Using `cargo test -p mission-control` fails because the package is named `openclaw` in Cargo.toml.
**Why it happens:** The repo directory is `mission-control` but the Rust package is `openclaw`.
**How to avoid:** Use `cargo test` from the `src-tauri/` directory (no `-p` flag needed) or `cargo test -p openclaw`.
**Warning signs:** `error: no such package: mission-control`

### Pitfall 2: No Library Target
**What goes wrong:** `cargo test --lib` fails with "no library targets found in package openclaw".
**Why it happens:** The crate is a binary-only crate (no `[lib]` in Cargo.toml). All code is under `src/main.rs`.
**How to avoid:** Use `cargo test` without `--lib`. Filter tests with `cargo test routes::gateway`.
**Warning signs:** `error: no library targets found`

### Pitfall 3: AppError::Internal Swallows Messages
**What goes wrong:** You use `AppError::Internal(anyhow!("useful error message"))` expecting the frontend to see "useful error message", but the client always receives `"Something went wrong"`.
**Why it happens:** error.rs line 39-45 deliberately replaces Internal error messages with a generic string for security.
**How to avoid:** For user-visible errors, use `AppError::BadRequest(message)` or `AppError::NotFound(message)`. Use `Internal` only when the real error should be hidden from the client.
**Warning signs:** Frontend showing "Something went wrong" when it should show "OpenClaw API not configured".

### Pitfall 4: ServiceClient Forces JSON Parse
**What goes wrong:** If the upstream returns non-JSON (HTML error page, empty body), ServiceClient's `execute_once` returns `ServiceError::ParseError` instead of giving you the raw response.
**Why it happens:** `execute_once` always calls `resp.json::<Value>()` on non-5xx responses.
**How to avoid:** Use `state.http` directly instead of `state.openclaw` ServiceClient. This gives control over response parsing per status code.
**Warning signs:** ParseError on 4xx responses that return plain text.

### Pitfall 5: State.openclaw is None When Not Configured
**What goes wrong:** Using `state.openclaw.as_ref().ok_or(...)?.get(path)` is fine, but the ServiceClient doesn't carry the API key -- it only has the base URL.
**Why it happens:** ServiceClient was designed for simple get/post with auto-retry, not for authenticated proxying with Bearer tokens.
**How to avoid:** Look up the API key separately via `state.secret_or_default("OPENCLAW_API_KEY")`. Or skip ServiceClient entirely and use state.http with manual URL construction.

### Pitfall 6: IP Regex Over-Matching
**What goes wrong:** Sanitization regex for Tailscale IPs (`100.x.x.x`) matches legitimate error codes or version numbers.
**Why it happens:** Overly broad regex like `\d+\.\d+\.\d+\.\d+`.
**How to avoid:** Scope the Tailscale IP regex to `100.` prefix only (Tailscale CGNAT range). Also consider `10.` and `192.168.` for LAN IPs.
**Warning signs:** Error messages like "version 1.2.3.4 not found" getting mangled.

### Pitfall 7: Forgetting to Register the Module
**What goes wrong:** gateway.rs compiles but routes return 404.
**Why it happens:** Missing `pub mod gateway;` in mod.rs or missing `.merge(gateway::router())`.
**How to avoid:** Both the module declaration AND the router merge are required. Follow alphabetical ordering.
**Warning signs:** `cargo check` passes but `curl localhost:3000/api/openclaw/health` returns 404.

## Code Examples

### gateway_forward() Signature
```rust
// Recommended signature following bridge_fetch pattern
pub(crate) async fn gateway_forward(
    state: &AppState,
    method: reqwest::Method,
    path: &str,
    body: Option<Value>,
) -> Result<Value, AppError>
```

### Error Sanitization Layering
```rust
// Layer 1: Use existing redact() for secrets
// Layer 2: Additional gateway-specific patterns
pub(crate) fn sanitize_error_body(body: &str) -> String {
    // Step 1: redact API keys, JWTs, hex strings via crate::redact::redact
    let sanitized = crate::redact::redact(body);
    // Step 2: Replace internal IPs (Tailscale 100.x, LAN 10.x, 192.168.x)
    // Step 3: Replace file paths
    // Step 4: Truncate stack traces
    sanitized
}
```

### Health Check Route Pattern
```rust
// Health checks ALWAYS return 200 -- the "ok" field indicates status
async fn openclaw_health(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    match openclaw_api_url(&state) {
        None => Ok(Json(json!({"ok": false, "status": "not_configured"}))),
        Some(base) => {
            // Probe with short timeout
            match state.http.get(format!("{base}/health"))
                .timeout(Duration::from_secs(5))
                .send().await
            {
                Ok(r) if r.status().is_success() => Ok(Json(json!({"ok": true, "status": "connected"}))),
                _ => Ok(Json(json!({"ok": false, "status": "unreachable"}))),
            }
        }
    }
}
```

### Inline Test Pattern (following existing codebase style)
```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_strips_api_keys() {
        let input = "Authorization: Bearer sk-abc123456789012345678901234567890";
        let result = sanitize_error_body(input);
        assert!(result.contains("***"));
        assert!(!result.contains("abc123456789012345678901234567890"));
    }

    #[test]
    fn validate_path_rejects_traversal() {
        assert!(validate_gateway_path("../etc/passwd").is_err());
    }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Per-file openclaw_api_url() duplication | Centralized in gateway.rs | Phase 9 (this phase) | Single source of truth, easier to update |
| reqwest::Client::new() per handler | state.http shared client | Already in place | Connection pooling, consistent timeout |
| Raw error forwarding | sanitize_error_body() | Phase 9 (this phase) | No credential leaks in error responses |
| Fire-and-forget OpenClaw calls (agents.rs line 202) | gateway_forward() with proper error handling | Phase 9 (this phase) | Consistent error handling, sanitization |

**Deprecated/outdated:**
- `state.openclaw: Option<ServiceClient>` exists on AppState but is NEVER USED anywhere in the codebase. It was added for future use. The gateway_forward() function should consider using it, but its API limitations (forced JSON parse, no Bearer token support) make `state.http` more appropriate.

## Open Questions

1. **Should gateway_forward() use state.openclaw (ServiceClient) or state.http (raw reqwest)?**
   - What we know: ServiceClient has retry on 5xx and timeout built in, but forces JSON parsing and doesn't handle auth headers.
   - What's unclear: Whether the 5xx retry behavior is desirable for gateway proxying (it could mask transient failures vs. doubling write operations).
   - Recommendation: Use `state.http` directly. Retry on 5xx is dangerous for non-idempotent operations (POST/DELETE). The gateway should let callers decide retry policy. This matches the bridge_fetch pattern.

2. **Should chat.rs, memory.rs, workspace.rs also be migrated to use gateway_forward()?**
   - What we know: They all duplicate the openclaw_api_url/key pattern.
   - What's unclear: Whether their bespoke logic (chat has WebSocket, workspace has file path validation) fits gateway_forward().
   - Recommendation: Out of scope for Phase 9. Only agents.rs is migrated. Future phases can adopt gateway_forward() incrementally.

3. **Health endpoint path collision?**
   - What we know: There's already a `/health` route in mod.rs (line 47). The gateway health is at `/openclaw/health`.
   - What's unclear: Nothing -- the paths don't collide.
   - Recommendation: No issue. `/openclaw/health` is namespaced.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Rust built-in test (#[cfg(test)], #[test]) |
| Config file | Cargo.toml (package name: `openclaw`) |
| Quick run command | `cd src-tauri && cargo test routes::gateway -- --nocapture` |
| Full suite command | `cd src-tauri && cargo test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MH-05a | sanitize_error_body strips API keys | unit | `cd src-tauri && cargo test routes::gateway::tests::sanitize_strips_api_keys -- --nocapture` | Wave 0 |
| MH-05b | sanitize_error_body strips internal IPs | unit | `cd src-tauri && cargo test routes::gateway::tests::sanitize_strips_internal_ips -- --nocapture` | Wave 0 |
| MH-05c | sanitize_error_body strips file paths | unit | `cd src-tauri && cargo test routes::gateway::tests::sanitize_strips_file_paths -- --nocapture` | Wave 0 |
| MH-05d | sanitize_error_body strips stack traces | unit | `cd src-tauri && cargo test routes::gateway::tests::sanitize_strips_stack_traces -- --nocapture` | Wave 0 |
| MH-05e | sanitize_error_body preserves normal messages | unit | `cd src-tauri && cargo test routes::gateway::tests::sanitize_preserves_normal -- --nocapture` | Wave 0 |
| MH-05f | validate_gateway_path rejects traversal | unit | `cd src-tauri && cargo test routes::gateway::tests::validate_path_rejects_traversal -- --nocapture` | Wave 0 |
| MH-05g | validate_gateway_path rejects query injection | unit | `cd src-tauri && cargo test routes::gateway::tests::validate_path_rejects_query -- --nocapture` | Wave 0 |
| MH-05h | validate_gateway_path accepts clean paths | unit | `cd src-tauri && cargo test routes::gateway::tests::validate_path_accepts_clean -- --nocapture` | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd src-tauri && cargo test routes::gateway -- --nocapture`
- **Per wave merge:** `cd src-tauri && cargo test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src-tauri/src/routes/gateway.rs` -- contains inline #[cfg(test)] module with all tests listed above
- No framework install needed -- Rust testing is built in
- No shared fixtures needed -- all tests are pure function tests (no async, no state)

## Sources

### Primary (HIGH confidence)
- `src-tauri/src/routes/reminders.rs` -- bridge_fetch() proxy pattern (lines 27-59), "not configured" pattern (lines 88-97)
- `src-tauri/src/routes/agents.rs` -- openclaw_api_url/key helpers (lines 15-21), fire-and-forget proxy pattern (lines 195-221)
- `src-tauri/src/routes/chat.rs` -- duplicate openclaw_api_url/key (lines 101-107), remote history fetch (lines 110-139)
- `src-tauri/src/routes/memory.rs` -- inline OpenClaw proxy (lines 16-31), creates new reqwest::Client per call (anti-pattern)
- `src-tauri/src/routes/workspace.rs` -- remote_config() + remote_headers() (lines 59-82), path validation (lines 88-90)
- `src-tauri/src/service_client.rs` -- ServiceClient with retry, timeout, JSON parse (full file)
- `src-tauri/src/server.rs` -- AppState with openclaw: Option<ServiceClient> (line 179), secret() / secret_or_default() (lines 214-225)
- `src-tauri/src/error.rs` -- AppError variants and IntoResponse (full file)
- `src-tauri/src/validation.rs` -- validate_uuid() and other validators (full file)
- `src-tauri/src/redact.rs` -- redact() secret stripping (full file)
- `src-tauri/src/routes/mod.rs` -- route registration pattern (full file)
- `src-tauri/Cargo.toml` -- package name "openclaw", no [lib] target

### Secondary (MEDIUM confidence)
- `.planning/ROADMAP.md` -- Phases 10-12, 15 that will consume gateway_forward()
- `.planning/REQUIREMENTS.md` -- MH-05 requirements definition

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all dependencies already in Cargo.toml, patterns verified in codebase
- Architecture: HIGH -- directly modeled on existing bridge_fetch() pattern in reminders.rs
- Pitfalls: HIGH -- all pitfalls discovered from actual code analysis (Cargo package name, no lib target, AppError::Internal behavior, ServiceClient limitations)

**Research date:** 2026-03-22
**Valid until:** 2026-04-22 (stable infrastructure, no external dependencies)
