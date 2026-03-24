use axum::{extract::{Path, State}, routing::{get, post}, Json, Router};
use reqwest::Method;
use serde_json::{json, Value};
use std::sync::OnceLock;
use std::time::Duration;

use crate::error::AppError;
use crate::server::{AppState, RequireAuth};

// ── Credential helpers ──────────────────────────────────────────────────────

/// Look up the OpenClaw API base URL from secrets.
/// Returns `None` when the user has not configured OpenClaw.
pub(crate) fn openclaw_api_url(state: &AppState) -> Option<String> {
    state.secret("OPENCLAW_API_URL").filter(|s| !s.is_empty())
}

/// Look up the OpenClaw API key from secrets.
/// Returns an empty string when not configured.
pub(crate) fn openclaw_api_key(state: &AppState) -> String {
    state.secret_or_default("OPENCLAW_API_KEY")
}

// ── Path validation ─────────────────────────────────────────────────────────

/// Validate a gateway path segment before forwarding.
///
/// Rejects path traversal (`..`), query/fragment injection (`?`, `#`),
/// null bytes, and CRLF sequences.
pub(crate) fn validate_gateway_path(path: &str) -> Result<&str, AppError> {
    if path.contains("..")
        || path.contains('?')
        || path.contains('#')
        || path.contains('\0')
        || path.contains('\n')
        || path.contains('\r')
    {
        return Err(AppError::BadRequest("invalid gateway path".into()));
    }
    if !path.starts_with('/') {
        return Err(AppError::BadRequest("invalid gateway path".into()));
    }
    Ok(path)
}

// ── Error sanitization ──────────────────────────────────────────────────────

/// Regex matching internal/Tailscale/LAN IP addresses.
static IP_RE: OnceLock<regex::Regex> = OnceLock::new();

/// Regex matching Unix file paths (3+ segments).
static PATH_RE: OnceLock<regex::Regex> = OnceLock::new();

/// Strip secrets, internal IPs, file paths, and stack traces from an error
/// body before returning it to the client.
///
/// Layers:
/// 1. `crate::redact::redact()` — API keys, JWTs, hex strings
/// 2. Internal IP replacement (100.x, 10.x, 192.168.x)
/// 3. Unix file path replacement
/// 4. Stack trace truncation (keep first line only)
/// 5. Length cap (500 chars)
pub(crate) fn sanitize_error_body(body: &str) -> String {
    // Step 1: redact API keys, JWTs, hex strings
    let sanitized = crate::redact::redact(body);

    // Step 2: replace internal IPs
    let ip_re = IP_RE.get_or_init(|| {
        regex::Regex::new(
            r"\b(100\.\d{1,3}\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})\b",
        )
        .unwrap()
    });
    let sanitized = ip_re.replace_all(&sanitized, "[redacted-ip]").into_owned();

    // Step 3: replace Unix file paths (3+ segments like /home/user/file)
    let path_re = PATH_RE.get_or_init(|| {
        regex::Regex::new(r"(?:/[\w\-.]+){3,}").unwrap()
    });
    let sanitized = path_re.replace_all(&sanitized, "[path]").into_owned();

    // Step 4: truncate stack traces (if "   at " found, keep first line only)
    let sanitized = if sanitized.contains("   at ") {
        sanitized.lines().next().unwrap_or("").to_string()
    } else {
        sanitized
    };

    // Step 5: truncate to 500 chars max
    if sanitized.len() > 500 {
        sanitized[..500].to_string()
    } else {
        sanitized
    }
}

// ── Gateway forward ─────────────────────────────────────────────────────────

/// Forward an HTTP request to the OpenClaw API.
///
/// This is the single chokepoint for all OpenClaw API communication.
/// Uses `state.http` (bare reqwest client with connection pooling) rather
/// than `state.openclaw` (ServiceClient) because:
/// - ServiceClient retries on 5xx, which is dangerous for writes (POST/DELETE)
/// - ServiceClient forces JSON parsing on all responses
///
/// Error handling:
/// - 4xx upstream -> `AppError::BadRequest` with sanitized body (user-visible)
/// - 5xx upstream -> `AppError::Internal` (hidden from client)
/// - Network error -> `AppError::Internal` (hidden from client)
pub(crate) async fn gateway_forward(
    state: &AppState,
    method: Method,
    path: &str,
    body: Option<Value>,
) -> Result<Value, AppError> {
    validate_gateway_path(path)?;

    let base = openclaw_api_url(state).ok_or_else(|| {
        AppError::BadRequest(
            "OpenClaw API not configured. Set OPENCLAW_API_URL in Settings > Connections.".into(),
        )
    })?;

    let api_key = openclaw_api_key(state);
    let url = format!("{base}{path}");

    let mut req = state
        .http
        .request(method.clone(), &url)
        .header("Content-Type", "application/json")
        .timeout(Duration::from_secs(30));

    if !api_key.is_empty() {
        req = req.header("Authorization", format!("Bearer {api_key}"));
    }

    if let Some(b) = body {
        req = req.json(&b);
    }

    let res = req.send().await.map_err(|e| {
        tracing::error!("[gateway] request to {path} failed: {e}");
        AppError::Internal(anyhow::anyhow!("Failed to reach OpenClaw API"))
    })?;

    let status = res.status();

    if !status.is_success() {
        let text = res.text().await.unwrap_or_default();
        tracing::error!("[gateway] {method} {path} -> {status}: {text}");
        let safe_msg = sanitize_error_body(&text);

        if status.is_client_error() {
            return Err(AppError::BadRequest(format!("OpenClaw: {safe_msg}")));
        }
        // 5xx — hide from client
        return Err(AppError::Internal(anyhow::anyhow!("OpenClaw API error")));
    }

    res.json::<Value>()
        .await
        .map_err(|e| AppError::Internal(e.into()))
}

// ── Health route ────────────────────────────────────────────────────────────

/// `GET /api/openclaw/health`
///
/// Returns HTTP 200 always. The `ok` field indicates connectivity:
/// - `{ "ok": false, "status": "not_configured" }` — neither OPENCLAW_API_URL nor OPENCLAW_WS set
/// - `{ "ok": true,  "status": "connected" }`      — gateway or workspace API reachable
/// - `{ "ok": false, "status": "unreachable" }`     — both unreachable
///
/// Checks both the gateway (OPENCLAW_WS converted to HTTP) and workspace API (OPENCLAW_API_URL).
async fn openclaw_health(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let api_url = openclaw_api_url(&state);
    let ws_url = state.secret("OPENCLAW_WS").filter(|s| !s.is_empty());

    if api_url.is_none() && ws_url.is_none() {
        return Ok(Json(json!({"ok": false, "status": "not_configured"})));
    }

    // Try gateway health first (ws:// → http://, wss:// → https://)
    if let Some(ws) = &ws_url {
        let http_url = ws
            .replace("ws://", "http://")
            .replace("wss://", "https://");
        let url = format!("{http_url}/health");
        if let Ok(r) = state
            .http
            .get(&url)
            .timeout(Duration::from_secs(5))
            .send()
            .await
        {
            if r.status().is_success() {
                return Ok(Json(json!({"ok": true, "status": "connected", "gateway": true})));
            }
        }
    }

    // Fallback: try workspace API health
    if let Some(base) = &api_url {
        let url = format!("{base}/health");
        if let Ok(r) = state
            .http
            .get(&url)
            .timeout(Duration::from_secs(5))
            .send()
            .await
        {
            if r.status().is_success() {
                return Ok(Json(json!({"ok": true, "status": "connected", "gateway": false})));
            }
        }
    }

    Ok(Json(json!({"ok": false, "status": "unreachable"})))
}

// ── Gateway WS status ────────────────────────────────────────────────────

/// `GET /api/gateway/status`
///
/// Returns the current WebSocket connection state:
/// - `connected` — WS is up and handshake complete
/// - `connecting` — actively trying to connect
/// - `disconnected` — connection lost, will auto-reconnect
/// - `not_configured` — OPENCLAW_WS not set
async fn gateway_status(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let (conn_state, protocol_version) = match &state.gateway_ws {
        Some(gw) => (gw.connection_state().await, gw.protocol_version().await),
        None => (crate::gateway_ws::ConnectionState::NotConfigured, None),
    };
    let connected = conn_state == crate::gateway_ws::ConnectionState::Connected;
    Ok(Json(json!({
        "ok": connected,
        "status": conn_state,
        "connected": connected,
        "protocol": protocol_version,
    })))
}

// ── Gateway WS sessions ──────────────────────────────────────────────────

/// `GET /api/gateway/sessions`
///
/// Proxies `sessions.list` through the persistent gateway WS connection.
/// Returns the session list payload on success, or an error if the gateway
/// is not connected or not configured.
async fn gateway_sessions(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let gw = state.gateway_ws.as_ref().ok_or_else(|| {
        AppError::BadRequest(
            "OpenClaw Gateway not configured. Set OPENCLAW_WS in Settings > Connections.".into(),
        )
    })?;

    let payload = gw
        .request("sessions.list", json!({}))
        .await
        .map_err(|e| {
            tracing::error!("[gateway] sessions.list failed: {e}");
            AppError::BadRequest(format!("Gateway error: {}", sanitize_error_body(&e)))
        })?;

    Ok(Json(json!({
        "ok": true,
        "data": payload,
    })))
}

// ── Gateway WS session history ──────────────────────────────────────────────

/// `GET /api/gateway/sessions/:id/history`
///
/// Proxies `sessions.history` through the persistent gateway WS connection.
/// Returns the message history for a specific session.
async fn gateway_session_history(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Path(session_id): Path<String>,
) -> Result<Json<Value>, AppError> {
    let gw = state.gateway_ws.as_ref().ok_or_else(|| {
        AppError::BadRequest(
            "OpenClaw Gateway not configured. Set OPENCLAW_WS in Settings > Connections.".into(),
        )
    })?;

    let payload = gw
        .request("sessions.history", json!({"session_id": session_id}))
        .await
        .map_err(|e| {
            tracing::error!("[gateway] sessions.history failed: {e}");
            AppError::BadRequest(format!("Gateway error: {}", sanitize_error_body(&e)))
        })?;

    Ok(Json(json!({
        "ok": true,
        "data": payload,
    })))
}

// ── Gateway WS session send ──────────────────────────────────────────────

/// `POST /api/gateway/sessions/:id/send`
///
/// Sends a message to a running session via `sessions.send`.
async fn gateway_session_send(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Path(session_id): Path<String>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, AppError> {
    let gw = state.gateway_ws.as_ref().ok_or_else(|| {
        AppError::BadRequest("OpenClaw Gateway not configured.".into())
    })?;

    let message = body
        .get("message")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    if message.is_empty() {
        return Err(AppError::BadRequest("Message is required".into()));
    }

    let payload = gw
        .request(
            "sessions.send",
            json!({"session_id": session_id, "message": message}),
        )
        .await
        .map_err(|e| {
            tracing::error!("[gateway] sessions.send failed: {e}");
            AppError::BadRequest(format!("Gateway error: {}", sanitize_error_body(&e)))
        })?;

    Ok(Json(json!({"ok": true, "data": payload})))
}

// ── Gateway activity feed ────────────────────────────────────────────────

/// `GET /api/gateway/activity`
///
/// Proxies `activity.recent` through the persistent gateway WS connection.
/// Returns recent gateway events (session start/stop, cron runs, errors, etc.).
async fn gateway_activity(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let gw = state.gateway_ws.as_ref().ok_or_else(|| {
        AppError::BadRequest("OpenClaw Gateway not configured.".into())
    })?;

    let payload = gw
        .request("activity.recent", json!({}))
        .await
        .map_err(|e| {
            tracing::error!("[gateway] activity.recent failed: {e}");
            AppError::BadRequest(format!("Gateway error: {}", sanitize_error_body(&e)))
        })?;

    Ok(Json(json!({
        "ok": true,
        "data": payload,
    })))
}

// ── Gateway memory search ────────────────────────────────────────────────

/// `POST /api/gateway/memory/search`
///
/// Proxies `memory.search` through the persistent gateway WS connection.
/// Accepts `{ query, limit? }` and returns semantic search results.
async fn gateway_memory_search(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Json(body): Json<Value>,
) -> Result<Json<Value>, AppError> {
    let gw = state.gateway_ws.as_ref().ok_or_else(|| {
        AppError::BadRequest("OpenClaw Gateway not configured.".into())
    })?;

    let payload = gw
        .request("memory.search", body)
        .await
        .map_err(|e| {
            tracing::error!("[gateway] memory.search failed: {e}");
            AppError::BadRequest(format!("Gateway error: {}", sanitize_error_body(&e)))
        })?;

    Ok(Json(json!({ "ok": true, "data": payload })))
}

// ── Router ──────────────────────────────────────────────────────────────────

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/openclaw/health", get(openclaw_health))
        .route("/gateway/status", get(gateway_status))
        .route("/gateway/sessions", get(gateway_sessions))
        .route("/gateway/sessions/:id/history", get(gateway_session_history))
        .route("/gateway/sessions/:id/send", post(gateway_session_send))
        .route("/gateway/activity", get(gateway_activity))
        .route("/gateway/memory/search", post(gateway_memory_search))
}

// ── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // -- sanitize_error_body tests --

    #[test]
    fn sanitize_strips_api_keys() {
        let input = "Authorization: Bearer sk-abc123456789012345678901234567890";
        let result = sanitize_error_body(input);
        assert!(result.contains("***"), "expected redacted output, got: {result}");
        assert!(
            !result.contains("abc123456789012345678901234567890"),
            "raw key still present: {result}"
        );
    }

    #[test]
    fn sanitize_strips_internal_ips() {
        let input = "connection to 100.64.0.1 failed, also tried 192.168.1.50 and 10.0.0.5";
        let result = sanitize_error_body(input);
        assert!(
            result.contains("[redacted-ip]"),
            "expected [redacted-ip] in: {result}"
        );
        assert!(!result.contains("100.64.0.1"), "Tailscale IP leaked: {result}");
        assert!(!result.contains("192.168.1.50"), "LAN IP leaked: {result}");
        assert!(!result.contains("10.0.0.5"), "private IP leaked: {result}");
    }

    #[test]
    fn sanitize_strips_file_paths() {
        let input = "error reading /home/josue/.config/openclaw/keys";
        let result = sanitize_error_body(input);
        assert!(result.contains("[path]"), "expected [path] in: {result}");
        assert!(
            !result.contains("/home/josue/.config/openclaw/keys"),
            "file path leaked: {result}"
        );
    }

    #[test]
    fn sanitize_strips_stack_traces() {
        let input = "Error: agent not found\n   at main::routes::gateway::handler\n   at axum::routing::Router";
        let result = sanitize_error_body(input);
        assert!(
            !result.contains("main::routes::gateway"),
            "stack trace leaked: {result}"
        );
        // Should only keep first line
        assert!(
            result.contains("Error: agent not found")
                || result.contains("Error:"),
            "first line lost: {result}"
        );
    }

    #[test]
    fn sanitize_preserves_normal() {
        let input = "Agent not found";
        let result = sanitize_error_body(input);
        assert_eq!(result, "Agent not found");
    }

    // -- validate_gateway_path tests --

    #[test]
    fn validate_path_rejects_traversal() {
        assert!(validate_gateway_path("/../etc/passwd").is_err());
    }

    #[test]
    fn validate_path_rejects_query() {
        assert!(validate_gateway_path("/agents?drop=true").is_err());
    }

    #[test]
    fn validate_path_rejects_fragment() {
        assert!(validate_gateway_path("/agents#hack").is_err());
    }

    #[test]
    fn validate_path_rejects_null_bytes() {
        assert!(validate_gateway_path("/agents\0hack").is_err());
    }

    #[test]
    fn validate_path_accepts_clean() {
        assert!(validate_gateway_path("/agents").is_ok());
        assert!(validate_gateway_path("/agents/123/status").is_ok());
        assert!(validate_gateway_path("/v1/models").is_ok());
    }

    #[test]
    fn validate_path_accepts_uuid_segments() {
        assert!(
            validate_gateway_path("/agents/550e8400-e29b-41d4-a716-446655440000").is_ok()
        );
    }
}
