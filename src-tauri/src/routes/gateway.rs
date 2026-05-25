use axum::{
    extract::{Path, RawQuery, State},
    routing::{get, patch, post},
    Json, Router,
};

use reqwest::Method;
use serde::Deserialize;
use serde_json::{json, Value};
use std::sync::OnceLock;
use std::time::Duration;

use crate::error::AppError;
use crate::server::{AppState, RequireAuth};

// ── Credential helpers ──────────────────────────────────────────────────────

/// Look up the active Hermes Agent API base URL from secrets.
/// Provider-specific env keys are fallback aliases.
pub(crate) fn harness_api_url(state: &AppState) -> Option<String> {
    harness_api_config(state).map(|(_, url)| url)
}

fn harness_api_config(state: &AppState) -> Option<(&'static str, String)> {
    harness_api_configs(state).into_iter().next()
}

pub(crate) fn harness_api_configs(state: &AppState) -> Vec<(&'static str, String)> {
    let mut seen = std::collections::HashSet::new();
    ["HERMES_API_URL", "HARNESS_API_URL", "OPENCLAW_API_URL"]
        .into_iter()
        .filter_map(|key| {
            state
                .secret(key)
                .filter(|url| !url.trim().is_empty())
                .map(|url| (key, url.trim_end_matches('/').to_string()))
        })
        .filter(|(_, url)| {
            let normalized = url.to_ascii_lowercase();
            seen.insert(normalized)
        })
        .collect()
}

pub(crate) fn harness_api_key_for_config(state: &AppState, config_key: &str) -> String {
    let candidates: &[&str] = match config_key {
        "HERMES_API_URL" => &[
            "HERMES_API_KEY",
            "HERMES_PASSWORD",
            "HARNESS_API_KEY",
            "HARNESS_PASSWORD",
            "OPENCLAW_API_KEY",
            "OPENCLAW_PASSWORD",
        ],
        "OPENCLAW_API_URL" => &[
            "OPENCLAW_API_KEY",
            "OPENCLAW_PASSWORD",
            "HERMES_API_KEY",
            "HERMES_PASSWORD",
            "HARNESS_API_KEY",
            "HARNESS_PASSWORD",
        ],
        _ => &[
            "HARNESS_API_KEY",
            "HARNESS_PASSWORD",
            "HERMES_API_KEY",
            "HERMES_PASSWORD",
            "OPENCLAW_API_KEY",
            "OPENCLAW_PASSWORD",
        ],
    };

    state.secret_first(candidates).unwrap_or_default()
}

/// Look up the active Hermes Agent API key from secrets.
/// Provider-specific env keys are fallback aliases.
pub(crate) fn harness_api_key(state: &AppState) -> String {
    harness_api_config(state)
        .map(|(key, _)| harness_api_key_for_config(state, key))
        .unwrap_or_default()
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
    let path_re = PATH_RE.get_or_init(|| regex::Regex::new(r"(?:/[\w\-.]+){3,}").unwrap());
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

fn parse_gateway_json_body(
    method: &Method,
    path: &str,
    status: reqwest::StatusCode,
    text: &str,
) -> Result<Value, AppError> {
    if text.trim().is_empty() {
        tracing::error!("[gateway] {method} {path} -> {status}: empty response body");
        return Err(AppError::BadRequest(format!(
            "Hermes Agent: {path} returned an empty response"
        )));
    }

    serde_json::from_str::<Value>(text).map_err(|e| {
        let safe_preview = sanitize_error_body(text);
        tracing::error!(
            "[gateway] {method} {path} -> {status}: invalid JSON response: {e}; body: {safe_preview}"
        );
        AppError::BadRequest(format!(
            "Hermes Agent: {path} returned invalid JSON"
        ))
    })
}

// ── Gateway forward ─────────────────────────────────────────────────────────

/// Forward an HTTP request to the configured Hermes Agent API.
///
/// This is the single chokepoint for Hermes Agent API communication.
/// Uses `state.http` (bare reqwest client with connection pooling) rather
/// than `state.harness` (ServiceClient) because:
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

    let configs = harness_api_configs(state);
    if configs.is_empty() {
        return Err(AppError::BadRequest(
            "Hermes Agent API not configured. Set HERMES_API_URL in Settings > Connections.".into(),
        ));
    }

    let mut last_error: Option<AppError> = None;
    let can_fallback = method == Method::GET || path == "/chat/model";

    for (index, (config_key, base)) in configs.iter().enumerate() {
        let api_key = harness_api_key_for_config(state, config_key);
        let url = format!("{base}{path}");

        let mut req = state
            .http
            .request(method.clone(), &url)
            .header("Content-Type", "application/json")
            .header(reqwest::header::ACCEPT, "application/json")
            .timeout(Duration::from_secs(30));

        if !api_key.is_empty() {
            req = req.header("Authorization", format!("Bearer {api_key}"));
        }

        if let Some(cookie) = state
            .secret("CODEX_LB_DASHBOARD_COOKIE")
            .filter(|value| !value.trim().is_empty())
        {
            req = req.header(reqwest::header::COOKIE, cookie);
        }

        if let Some(b) = body.clone() {
            req = req.json(&b);
        }

        let res = match req.send().await {
            Ok(res) => res,
            Err(e) => {
                tracing::error!("[gateway] request to {path} via {config_key} failed: {e}");
                let err = AppError::Internal(anyhow::anyhow!("Failed to reach Hermes Agent API"));
                if can_fallback && index + 1 < configs.len() {
                    last_error = Some(err);
                    continue;
                }
                return Err(err);
            }
        };

        let status = res.status();
        let text = res.text().await.unwrap_or_default();

        if !status.is_success() {
            tracing::error!("[gateway] {method} {path} via {config_key} -> {status}: {text}");
            let safe_msg = sanitize_error_body(&text);

            if status.is_client_error() {
                let err = AppError::BadRequest(format!("Hermes Agent: {safe_msg}"));
                if can_fallback
                    && index + 1 < configs.len()
                    && matches!(status.as_u16(), 401 | 403 | 404 | 405)
                {
                    last_error = Some(err);
                    continue;
                }
                return Err(err);
            }
            let err = AppError::Internal(anyhow::anyhow!("Hermes Agent API error"));
            if can_fallback && index + 1 < configs.len() {
                last_error = Some(err);
                continue;
            }
            return Err(err);
        }

        if text.trim().is_empty() {
            let err =
                AppError::BadRequest(format!("Hermes Agent: {path} returned an empty response"));
            if can_fallback && index + 1 < configs.len() {
                tracing::debug!(
                    "[gateway] {method} {path} via {config_key} -> {status}: empty response; trying next configured gateway"
                );
                last_error = Some(err);
                continue;
            }
            return parse_gateway_json_body(&method, path, status, &text);
        }

        match serde_json::from_str::<Value>(&text) {
            Ok(value) => return Ok(value),
            Err(e) => {
                let err =
                    AppError::BadRequest(format!("Hermes Agent: {path} returned invalid JSON"));
                if can_fallback && index + 1 < configs.len() {
                    let safe_preview = sanitize_error_body(&text);
                    tracing::debug!(
                        "[gateway] {method} {path} via {config_key} -> {status}: invalid JSON response: {e}; body: {safe_preview}; trying next configured gateway"
                    );
                    last_error = Some(err);
                    continue;
                }
                return parse_gateway_json_body(&method, path, status, &text);
            }
        }
    }

    Err(last_error.unwrap_or_else(|| {
        AppError::BadRequest(
            "Hermes Agent API not configured. Set HERMES_API_URL in Settings > Connections.".into(),
        )
    }))
}

// ── Health route ────────────────────────────────────────────────────────────

/// `GET /api/hermes/health`
///
/// Returns HTTP 200 always. The `ok` field indicates connectivity:
/// - `{ "ok": false, "status": "not_configured" }` — no Hermes Agent API URL set
/// - `{ "ok": true,  "status": "connected" }`      — upstream /health returned 2xx
/// - `{ "ok": false, "status": "unreachable" }`     — upstream unreachable or non-2xx
async fn harness_health(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let base = match harness_api_url(&state) {
        Some(b) => b,
        None => {
            return Ok(Json(json!({"ok": false, "status": "not_configured"})));
        }
    };

    let api_key = harness_api_key(&state);
    let health_url = format!("{base}/health");
    let health_res = state
        .http
        .get(&health_url)
        .header(reqwest::header::ACCEPT, "application/json")
        .timeout(Duration::from_secs(5))
        .send()
        .await;

    let body = match health_res {
        Ok(r) if r.status().is_success() => r.json::<Value>().await.unwrap_or_else(|_| json!({})),
        _ => return Ok(Json(json!({"ok": false, "status": "unreachable"}))),
    };

    if api_key.is_empty() {
        return Ok(Json(json!({
            "ok": false,
            "status": "auth_missing",
            "provider": body
                .get("provider")
                .or_else(|| body.get("platform"))
                .and_then(Value::as_str)
                .unwrap_or("Hermes Agent"),
        })));
    }

    let mut verified_authenticated = false;
    if !api_key.is_empty() {
        for auth_path in ["/sessions", "/files"] {
            let auth_url = format!("{base}{auth_path}");
            match state
                .http
                .get(&auth_url)
                .header(reqwest::header::ACCEPT, "application/json")
                .header("Authorization", format!("Bearer {api_key}"))
                .timeout(Duration::from_secs(5))
                .send()
                .await
            {
                Ok(r) if r.status().is_success() => {
                    verified_authenticated = true;
                    break;
                }
                Ok(r) if r.status().as_u16() == 404 => continue,
                Ok(r) if r.status().as_u16() == 401 => {
                    return Ok(Json(json!({
                        "ok": false,
                        "status": "unauthorized",
                        "provider": body
                            .get("provider")
                            .or_else(|| body.get("platform"))
                            .and_then(Value::as_str)
                            .unwrap_or("Hermes Agent"),
                    })));
                }
                _ => return Ok(Json(json!({"ok": false, "status": "unreachable"}))),
            }
        }
    }

    if !verified_authenticated {
        return Ok(Json(json!({
            "ok": false,
            "status": "auth_probe_missing",
            "provider": body
                .get("provider")
                .or_else(|| body.get("platform"))
                .and_then(Value::as_str)
                .unwrap_or("Hermes Agent"),
        })));
    }

    let provider = body
        .get("provider")
        .or_else(|| body.get("platform"))
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("Hermes Agent");
    Ok(Json(json!({
        "ok": true,
        "status": "connected",
        "provider": provider,
    })))
}

// ── Activity route ──────────────────────────────────────────────────────────

/// `GET /api/gateway/activity`
///
/// Returns the latest activity log entries from the configured harness gateway.
async fn gateway_activity(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let payload = gateway_forward(&state, Method::GET, "/logs", None)
        .await
        .map_err(|e| {
            tracing::error!("[gateway] logs.tail failed: {e:?}");
            match e {
                AppError::BadRequest(_) => e,
                _ => AppError::BadRequest("Gateway error: failed to fetch activity logs".into()),
            }
        })?;
    Ok(Json(json!({ "ok": true, "data": payload })))
}

// ── Sessions route ─────────────────────────────────────────────────────────

#[derive(Debug, Default, Clone, PartialEq, Eq)]
struct GatewaySessionFilters {
    cwd: Vec<String>,
    project_ids: Vec<String>,
    project_id_paths: Vec<String>,
    projects: Vec<String>,
    branches: Vec<String>,
    runtimes: Vec<String>,
    environment_ids: Vec<String>,
    include_unscoped: bool,
}

impl GatewaySessionFilters {
    fn from_query(query: &str) -> Self {
        let mut filters = Self::default();
        for (key, value) in url::form_urlencoded::parse(query.as_bytes()) {
            let value = value.trim();
            if value.is_empty() {
                continue;
            }
            match key.as_ref() {
                "cwd" | "workingDir" | "working_dir" | "projectRoot" | "project_root"
                | "projectPath" | "project_path" | "workspacePath" | "workspace_path"
                | "workspaceRoot" | "workspace_root" | "repositoryRoot" | "repository_root"
                | "repoRoot" | "repo_root" | "root" => {
                    filters.cwd.push(normalize_session_path(value));
                }
                "project" | "projectName" | "project_name" => {
                    filters.projects.push(value.to_ascii_lowercase());
                }
                "projectId" | "project_id" => {
                    if looks_like_session_path(value) {
                        let path = normalize_session_path(value);
                        filters.cwd.push(path.clone());
                        filters.project_id_paths.push(path);
                    } else {
                        filters.project_ids.push(value.to_ascii_lowercase());
                    }
                }
                "branch" => filters.branches.push(value.to_ascii_lowercase()),
                "runtime" => filters.runtimes.push(value.to_ascii_lowercase()),
                "environmentId" | "environment_id" | "env" => {
                    filters.environment_ids.push(value.to_ascii_lowercase());
                }
                "includeUnscoped" | "include_unscoped" => {
                    filters.include_unscoped = matches!(
                        value.to_ascii_lowercase().as_str(),
                        "1" | "true" | "yes" | "on"
                    );
                }
                _ => {}
            }
        }
        filters.cwd.sort();
        filters.cwd.dedup();
        filters.project_ids.sort();
        filters.project_ids.dedup();
        filters.project_id_paths.sort();
        filters.project_id_paths.dedup();
        filters.projects.sort();
        filters.projects.dedup();
        filters.branches.sort();
        filters.branches.dedup();
        filters.runtimes.sort();
        filters.runtimes.dedup();
        filters.environment_ids.sort();
        filters.environment_ids.dedup();
        filters
    }

    fn has_scoping_filters(&self) -> bool {
        !self.cwd.is_empty()
            || !self.project_ids.is_empty()
            || !self.project_id_paths.is_empty()
            || !self.projects.is_empty()
            || !self.branches.is_empty()
            || !self.runtimes.is_empty()
            || !self.environment_ids.is_empty()
    }
}

fn looks_like_session_path(path: &str) -> bool {
    let trimmed = path.trim();
    trimmed.contains('/')
        || trimmed.contains('\\')
        || trimmed.starts_with('~')
        || matches!(trimmed.as_bytes(), [drive, b':', ..] if drive.is_ascii_alphabetic())
}

fn normalize_session_path(path: &str) -> String {
    let normalized = path.trim().replace('\\', "/");
    if normalized == "/" {
        return normalized;
    }
    normalized.trim_end_matches('/').to_ascii_lowercase()
}

fn session_field<'a>(session: &'a Value, keys: &[&str]) -> Option<&'a str> {
    const CONTAINERS: &[&str] = &["metadata", "context", "projectContext", "workspace"];

    for key in keys {
        if let Some(value) = session
            .get(*key)
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            return Some(value);
        }

        for container in CONTAINERS {
            if let Some(value) = session
                .get(*container)
                .and_then(Value::as_object)
                .and_then(|object| object.get(*key))
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
            {
                return Some(value);
            }
        }
    }

    None
}

fn session_is_unscoped(session: &Value) -> bool {
    session_field(
        session,
        &[
            "projectRoot",
            "project_root",
            "workingDir",
            "working_dir",
            "cwd",
            "projectPath",
            "project_path",
            "workspacePath",
            "workspace_path",
            "workspaceRoot",
            "workspace_root",
            "repositoryRoot",
            "repository_root",
            "repoRoot",
            "repo_root",
            "root",
            "path",
            "projectId",
            "project_id",
            "projectRef",
            "project_ref",
            "project",
            "projectName",
            "project_name",
            "branch",
            "runtime",
            "environmentId",
            "environment_id",
            "env",
            "environment",
        ],
    )
    .is_none()
}

fn normalized_path_matches_roots(path: &str, roots: &[String]) -> bool {
    let path = normalize_session_path(path);
    roots
        .iter()
        .any(|root| path == *root || path.starts_with(&format!("{root}/")))
}

fn session_matches_path(session: &Value, roots: &[String]) -> bool {
    if roots.is_empty() {
        return true;
    }
    let Some(path) = session_field(
        session,
        &[
            "projectRoot",
            "project_root",
            "workingDir",
            "working_dir",
            "cwd",
            "projectPath",
            "project_path",
            "workspacePath",
            "workspace_path",
            "workspaceRoot",
            "workspace_root",
            "repositoryRoot",
            "repository_root",
            "repoRoot",
            "repo_root",
            "root",
            "path",
        ],
    ) else {
        return false;
    };
    normalized_path_matches_roots(path, roots)
}

fn session_matches_text_filter(session: &Value, keys: &[&str], values: &[String]) -> bool {
    if values.is_empty() {
        return true;
    }
    let Some(value) = session_field(session, keys) else {
        return false;
    };
    let value = value.to_ascii_lowercase();
    values.iter().any(|filter| value == *filter)
}

fn session_project_id(session: &Value) -> Option<&str> {
    session_field(
        session,
        &["projectId", "project_id", "projectRef", "project_ref"],
    )
}

fn session_project_id_matches_text_filter(session: &Value, values: &[String]) -> bool {
    if values.is_empty() {
        return true;
    }
    let Some(value) = session_project_id(session) else {
        return false;
    };
    let value = value.to_ascii_lowercase();
    values.iter().any(|filter| value == *filter)
}

fn session_project_id_matches_path_filter(session: &Value, roots: &[String]) -> bool {
    let Some(project_id) = session_project_id(session) else {
        return false;
    };
    normalized_path_matches_roots(project_id, roots)
}

fn session_matches_workspace_identity(session: &Value, filters: &GatewaySessionFilters) -> bool {
    if filters.cwd.is_empty()
        && filters.project_ids.is_empty()
        && filters.project_id_paths.is_empty()
    {
        return true;
    }
    let path_matches = !filters.cwd.is_empty()
        && (session_matches_path(session, &filters.cwd)
            || session_project_id_matches_path_filter(session, &filters.cwd));
    let project_id_path_matches = !filters.project_id_paths.is_empty()
        && (session_matches_path(session, &filters.project_id_paths)
            || session_project_id_matches_path_filter(session, &filters.project_id_paths));
    let project_id_matches = !filters.project_ids.is_empty()
        && session_project_id_matches_text_filter(session, &filters.project_ids);

    if !filters.project_ids.is_empty() && session_project_id(session).is_some() {
        let project_id_path_matches_scope = (!filters.cwd.is_empty()
            && session_project_id_matches_path_filter(session, &filters.cwd))
            || (!filters.project_id_paths.is_empty()
                && session_project_id_matches_path_filter(session, &filters.project_id_paths));
        if !project_id_matches && !project_id_path_matches_scope {
            return false;
        }
    }

    path_matches || project_id_path_matches || project_id_matches
}

fn session_matches_filters(session: &Value, filters: &GatewaySessionFilters) -> bool {
    if filters.include_unscoped && session_is_unscoped(session) {
        return true;
    }
    session_matches_workspace_identity(session, filters)
        && session_matches_text_filter(
            session,
            &["project", "projectName", "project_name"],
            &filters.projects,
        )
        && session_matches_text_filter(session, &["branch"], &filters.branches)
        && session_matches_text_filter(session, &["runtime"], &filters.runtimes)
        && session_matches_text_filter(
            session,
            &["environmentId", "environment_id", "env", "environment"],
            &filters.environment_ids,
        )
}

fn filter_gateway_sessions(sessions: Value, filters: &GatewaySessionFilters) -> Value {
    if !filters.has_scoping_filters() {
        return sessions;
    }
    let Some(items) = sessions.as_array() else {
        return sessions;
    };
    Value::Array(
        items
            .iter()
            .filter(|session| session_matches_filters(session, filters))
            .cloned()
            .collect(),
    )
}

/// `GET /api/gateway/sessions`
///
/// Proxies `sessions.list` through the configured Hermes Agent API.
/// Returns the full sessions list without filtering (unlike /api/claude-sessions
/// which filters by kind). Wraps the payload in a standard ok envelope.
async fn gateway_sessions(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    RawQuery(raw_query): RawQuery,
) -> Result<Json<Value>, AppError> {
    let local_sessions = crate::commands::load_local_chat_session_summaries().unwrap_or_default();
    let remote_sessions = match gateway_forward(&state, Method::GET, "/sessions", None).await {
        Ok(payload) => payload
            .get("sessions")
            .cloned()
            .unwrap_or_else(|| serde_json::json!([])),
        Err(e) => {
            tracing::error!("[gateway] sessions.list failed: {e:?}");
            if local_sessions.is_empty() {
                return Err(match e {
                    AppError::BadRequest(_) => e,
                    _ => AppError::BadRequest("Gateway error: failed to fetch sessions".into()),
                });
            }
            serde_json::json!([])
        }
    };

    let mut sessions = remote_sessions.as_array().cloned().unwrap_or_default();
    if let Ok(Value::Array(local)) = serde_json::to_value(local_sessions) {
        sessions.extend(local);
    }
    let filters = GatewaySessionFilters::from_query(raw_query.as_deref().unwrap_or(""));
    let sessions = filter_gateway_sessions(Value::Array(sessions), &filters);

    Ok(Json(json!({ "ok": true, "sessions": sessions })))
}

// ── Session history route ──────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct HistoryQueryParams {
    limit: Option<u32>,
    #[serde(rename = "environmentId", alias = "environment_id", alias = "env")]
    environment_id: Option<String>,
}

/// `GET /api/gateway/sessions/:key/history`
///
/// Fetches the conversation history for a specific session from the configured harness gateway.
/// Uses `state.http` directly (not `gateway_forward`) because the upstream URL
/// requires query parameters which `validate_gateway_path` would reject.
async fn gateway_session_history(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Path(key): Path<String>,
    axum::extract::Query(params): axum::extract::Query<HistoryQueryParams>,
) -> Result<Json<Value>, AppError> {
    if key.is_empty() || key.len() > 100 {
        return Err(AppError::BadRequest("invalid session key".into()));
    }

    if crate::commands::is_local_chat_session_key(&key) {
        let limit = params.limit.map(|value| value.min(200) as usize);
        let messages = crate::commands::local_chat_session_history_with_limit(&key, limit)
            .map_err(AppError::BadRequest)?
            .unwrap_or_default();
        return Ok(Json(json!({ "messages": messages })));
    }

    let encoded_key = crate::routes::util::percent_encode(&key);

    let configs = harness_api_configs(&state);
    if configs.is_empty() {
        return Err(AppError::BadRequest(
            "Hermes Agent API not configured. Set HERMES_API_URL in Settings > Connections.".into(),
        ));
    }

    let limit = params.limit.unwrap_or(50).min(200);
    let environment_id = params
        .environment_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let path = format!("/chat/history/{key}");
    let mut last_error: Option<AppError> = None;

    for (index, (config_key, base)) in configs.iter().enumerate() {
        let api_key = harness_api_key_for_config(&state, config_key);
        let mut url = format!("{base}/chat/history/{encoded_key}?limit={limit}");
        if let Some(environment_id) = environment_id {
            url.push_str("&environmentId=");
            url.push_str(&crate::routes::util::percent_encode(environment_id));
        }

        let mut req = state
            .http
            .get(&url)
            .header("Content-Type", "application/json")
            .header(reqwest::header::ACCEPT, "application/json")
            .timeout(Duration::from_secs(30));

        if !api_key.is_empty() {
            req = req.header("Authorization", format!("Bearer {api_key}"));
        }

        if let Some(cookie) = state
            .secret("CODEX_LB_DASHBOARD_COOKIE")
            .filter(|value| !value.trim().is_empty())
        {
            req = req.header(reqwest::header::COOKIE, cookie);
        }

        let res = match req.send().await {
            Ok(res) => res,
            Err(e) => {
                tracing::error!("[gateway] session history for {key} via {config_key} failed: {e}");
                let err = AppError::Internal(anyhow::anyhow!("Failed to reach Hermes Agent API"));
                if index + 1 < configs.len() {
                    last_error = Some(err);
                    continue;
                }
                return Err(err);
            }
        };

        let status = res.status();
        let text = res.text().await.unwrap_or_default();

        if !status.is_success() {
            tracing::error!(
                "[gateway] GET /chat/history/{key} via {config_key} -> {status}: {text}"
            );
            let safe_msg = sanitize_error_body(&text);

            if status.is_client_error() {
                let err = AppError::BadRequest(format!("Hermes Agent: {safe_msg}"));
                if index + 1 < configs.len() && matches!(status.as_u16(), 401 | 403 | 404) {
                    last_error = Some(err);
                    continue;
                }
                return Err(err);
            }
            let err = AppError::Internal(anyhow::anyhow!("Hermes Agent API error"));
            if index + 1 < configs.len() {
                last_error = Some(err);
                continue;
            }
            return Err(err);
        }

        if text.trim().is_empty() {
            let err =
                AppError::BadRequest(format!("Hermes Agent: {path} returned an empty response"));
            if index + 1 < configs.len() {
                tracing::debug!(
                    "[gateway] GET {path} via {config_key} -> {status}: empty response; trying next configured gateway"
                );
                last_error = Some(err);
                continue;
            }
            return parse_gateway_json_body(&Method::GET, &path, status, &text).map(Json);
        }

        match serde_json::from_str::<Value>(&text) {
            Ok(value) => return Ok(Json(value)),
            Err(e) => {
                let err =
                    AppError::BadRequest(format!("Hermes Agent: {path} returned invalid JSON"));
                if index + 1 < configs.len() {
                    let safe_preview = sanitize_error_body(&text);
                    tracing::debug!(
                        "[gateway] GET {path} via {config_key} -> {status}: invalid JSON response: {e}; body: {safe_preview}; trying next configured gateway"
                    );
                    last_error = Some(err);
                    continue;
                }
                return parse_gateway_json_body(&Method::GET, &path, status, &text).map(Json);
            }
        }
    }

    Err(last_error.unwrap_or_else(|| {
        AppError::BadRequest(
            "Hermes Agent API not configured. Set HERMES_API_URL in Settings > Connections.".into(),
        )
    }))
}

// ── Session mutation routes ────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct PatchSessionBody {
    label: Option<String>,
    pinned: Option<bool>,
    favorite: Option<bool>,
}

/// `PATCH /api/gateway/sessions/:key`
///
/// Patch session metadata via the configured harness gateway.
async fn patch_session(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Path(key): Path<String>,
    Json(body): Json<PatchSessionBody>,
) -> Result<Json<Value>, AppError> {
    if key.is_empty() || key.len() > 100 {
        return Err(AppError::BadRequest("invalid session key".into()));
    }

    let label = body
        .label
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    if label.is_none() && body.pinned.is_none() && body.favorite.is_none() {
        return Err(AppError::BadRequest("session patch is empty".into()));
    }
    if crate::commands::is_local_chat_session_key(&key) {
        let patched = crate::commands::patch_local_chat_session(
            &key,
            label.as_deref(),
            body.pinned,
            body.favorite,
        )
        .map_err(AppError::BadRequest)?;
        if !patched {
            return Err(AppError::BadRequest("local session not found".into()));
        }
        return Ok(Json(json!({ "ok": true })));
    }

    let mut payload = serde_json::Map::new();
    if let Some(label) = label {
        payload.insert("label".to_string(), json!(label));
    }
    if let Some(pinned) = body.pinned {
        payload.insert("pinned".to_string(), json!(pinned));
    }
    if let Some(favorite) = body.favorite {
        payload.insert("favorite".to_string(), json!(favorite));
    }

    let payload = gateway_forward(
        &state,
        Method::PATCH,
        &format!("/sessions/{key}"),
        Some(Value::Object(payload)),
    )
    .await
    .map_err(|e| {
        tracing::error!("[gateway] session patch failed: {e:?}");
        match e {
            AppError::BadRequest(_) => e,
            _ => AppError::BadRequest("Gateway error: failed to patch session".into()),
        }
    })?;

    Ok(Json(json!({ "ok": true, "data": payload })))
}

/// `DELETE /api/gateway/sessions/:key`
///
/// Delete a session via the configured harness gateway.
async fn delete_session(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Path(key): Path<String>,
) -> Result<Json<Value>, AppError> {
    if key.is_empty() || key.len() > 100 {
        return Err(AppError::BadRequest("invalid session key".into()));
    }

    if crate::commands::is_local_chat_session_key(&key) {
        let removed =
            crate::commands::delete_local_chat_session(&key).map_err(AppError::BadRequest)?;
        if !removed {
            return Err(AppError::BadRequest("local session not found".into()));
        }
        return Ok(Json(json!({ "ok": true })));
    }

    let payload = gateway_forward(&state, Method::DELETE, &format!("/sessions/{key}"), None)
        .await
        .map_err(|e| {
            tracing::error!("[gateway] session delete failed: {e:?}");
            match e {
                AppError::BadRequest(_) => e,
                _ => AppError::BadRequest("Gateway error: failed to delete session".into()),
            }
        })?;

    Ok(Json(json!({ "ok": true, "data": payload })))
}

/// `POST /api/gateway/sessions/:key/compact`
///
/// Compact a session to reduce token usage via the configured harness gateway.
async fn compact_session(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Path(key): Path<String>,
) -> Result<Json<Value>, AppError> {
    if key.is_empty() || key.len() > 100 {
        return Err(AppError::BadRequest("invalid session key".into()));
    }

    if crate::commands::is_local_chat_session_key(&key) {
        let result = crate::commands::compact_local_chat_session(&key)
            .map_err(AppError::BadRequest)?
            .ok_or_else(|| AppError::BadRequest("local session not found".into()))?;
        return Ok(Json(json!({ "ok": true, "data": result })));
    }

    let payload = gateway_forward(
        &state,
        Method::POST,
        &format!("/sessions/{key}/compact"),
        None,
    )
    .await
    .map_err(|e| {
        tracing::error!("[gateway] session compact failed: {e:?}");
        match e {
            AppError::BadRequest(_) => e,
            _ => AppError::BadRequest("Gateway error: failed to compact session".into()),
        }
    })?;

    Ok(Json(json!({ "ok": true, "data": payload })))
}

// ── Router ──────────────────────────────────────────────────────────────────

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/hermes/health", get(harness_health))
        .route("/harness/health", get(harness_health))
        .route("/openclaw/health", get(harness_health))
        .route("/gateway/activity", get(gateway_activity))
        .route("/gateway/sessions", get(gateway_sessions))
        .route(
            "/gateway/sessions/:key/history",
            get(gateway_session_history),
        )
        .route(
            "/gateway/sessions/:key",
            patch(patch_session).delete(delete_session),
        )
        .route("/gateway/sessions/:key/compact", post(compact_session))
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
        assert!(
            result.contains("***"),
            "expected redacted output, got: {result}"
        );
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
        assert!(
            !result.contains("100.64.0.1"),
            "Tailscale IP leaked: {result}"
        );
        assert!(!result.contains("192.168.1.50"), "LAN IP leaked: {result}");
        assert!(!result.contains("10.0.0.5"), "private IP leaked: {result}");
    }

    #[test]
    fn sanitize_strips_file_paths() {
        let input = "error reading /home/josue/.config/provider/keys";
        let result = sanitize_error_body(input);
        assert!(result.contains("[path]"), "expected [path] in: {result}");
        assert!(
            !result.contains("/home/josue/.config/provider/keys"),
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
            result.contains("Error: agent not found") || result.contains("Error:"),
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
        assert!(validate_gateway_path("/agents/550e8400-e29b-41d4-a716-446655440000").is_ok());
    }

    #[test]
    fn validate_path_accepts_session_key_paths() {
        assert!(validate_gateway_path("/sessions/sess-123").is_ok());
        assert!(validate_gateway_path("/sessions/sess-123/compact").is_ok());
    }

    #[test]
    fn parses_gateway_json_body() {
        let parsed = parse_gateway_json_body(
            &Method::GET,
            "/sessions",
            reqwest::StatusCode::OK,
            r#"{"sessions":[]}"#,
        )
        .expect("valid JSON should parse");

        assert_eq!(parsed["sessions"], json!([]));
    }

    #[test]
    fn rejects_empty_gateway_json_body() {
        let err =
            parse_gateway_json_body(&Method::GET, "/sessions", reqwest::StatusCode::OK, "   ")
                .expect_err("empty body should fail");

        match err {
            AppError::BadRequest(message) => assert!(
                message.contains("empty response"),
                "unexpected error: {message}"
            ),
            other => panic!("unexpected error: {other:?}"),
        }
    }

    #[test]
    fn rejects_invalid_gateway_json_body() {
        let err =
            parse_gateway_json_body(&Method::GET, "/sessions", reqwest::StatusCode::OK, "<html>")
                .expect_err("invalid JSON should fail");

        match err {
            AppError::BadRequest(message) => assert!(
                message.contains("invalid JSON"),
                "unexpected error: {message}"
            ),
            other => panic!("unexpected error: {other:?}"),
        }
    }

    // -- gateway session filter tests --

    #[test]
    fn session_filters_parse_repeated_workspace_roots() {
        let filters = GatewaySessionFilters::from_query(
            "cwd=%2FVolumes%2FT7%2Fprojects%2Fclawctrl&cwd=/Users/josue/clawctrl&includeUnscoped=1",
        );

        assert_eq!(
            filters.cwd,
            vec![
                "/users/josue/clawctrl".to_string(),
                "/volumes/t7/projects/clawctrl".to_string(),
            ]
        );
        assert!(filters.include_unscoped);
    }

    #[test]
    fn session_filters_treat_path_like_project_ids_as_workspace_roots() {
        let filters = GatewaySessionFilters::from_query("projectId=/Volumes/T7/projects/clawctrl/");

        assert_eq!(
            filters.cwd,
            vec!["/volumes/t7/projects/clawctrl".to_string()]
        );
        assert_eq!(
            filters.project_id_paths,
            vec!["/volumes/t7/projects/clawctrl".to_string()]
        );
        assert!(filters.project_ids.is_empty());

        let sessions = json!([
            {
                "key": "working-dir",
                "workingDir": "/Volumes/T7/projects/clawctrl"
            },
            {
                "key": "nested-working-dir",
                "workingDir": "/Volumes/T7/projects/clawctrl/frontend"
            },
            {
                "key": "path-project-ref",
                "projectRef": "/Volumes/T7/projects/clawctrl"
            },
            {
                "key": "stable-project-id-with-path",
                "workingDir": "/Volumes/T7/projects/clawctrl",
                "projectId": "local:clawctrl:stable"
            },
            {
                "key": "other",
                "workingDir": "/tmp/other-project"
            }
        ]);

        let filtered = filter_gateway_sessions(sessions, &filters);
        let keys: Vec<&str> = filtered
            .as_array()
            .unwrap()
            .iter()
            .filter_map(|session| session.get("key").and_then(Value::as_str))
            .collect();

        assert_eq!(
            keys,
            vec![
                "working-dir",
                "nested-working-dir",
                "path-project-ref",
                "stable-project-id-with-path"
            ]
        );
    }

    #[test]
    fn session_filters_scope_by_workspace_root_and_keep_unscoped() {
        let sessions = json!([
            {
                "key": "claw",
                "workingDir": "/Volumes/T7/projects/clawctrl",
                "project": "clawctrl"
            },
            {
                "key": "nested",
                "cwd": "/Volumes/T7/projects/clawctrl/frontend",
                "project": "clawctrl"
            },
            {
                "key": "project-root",
                "projectRoot": "/Volumes/T7/projects/clawctrl",
                "project": "clawctrl"
            },
            {
                "key": "nested-metadata-root",
                "metadata": {
                    "projectRoot": "/Volumes/T7/projects/clawctrl",
                    "project": "clawctrl"
                }
            },
            {
                "key": "other",
                "workingDir": "/Users/josue/AgentShell",
                "project": "AgentShell"
            },
            {
                "key": "unscoped",
                "label": "Untitled"
            }
        ]);
        let filters = GatewaySessionFilters::from_query(
            "cwd=/Volumes/T7/projects/clawctrl&includeUnscoped=true",
        );

        let filtered = filter_gateway_sessions(sessions, &filters);
        let keys: Vec<&str> = filtered
            .as_array()
            .unwrap()
            .iter()
            .filter_map(|session| session.get("key").and_then(Value::as_str))
            .collect();

        assert_eq!(
            keys,
            vec![
                "claw",
                "nested",
                "project-root",
                "nested-metadata-root",
                "unscoped"
            ]
        );
    }

    #[test]
    fn session_filters_require_matching_metadata_dimensions() {
        let sessions = json!([
            {
                "key": "match",
                "workingDir": "/Volumes/T7/projects/clawctrl",
                "projectId": "local:clawctrl:stable",
                "project": "clawctrl",
                "branch": "codex/chat-parity",
                "runtime": "Work locally",
                "environmentId": "local"
            },
            {
                "key": "match-by-project-id",
                "projectId": "local:clawctrl:stable",
                "project": "clawctrl",
                "branch": "codex/chat-parity",
                "runtime": "Work locally",
                "environmentId": "local"
            },
            {
                "key": "match-by-project-ref",
                "projectRef": "local:clawctrl:stable",
                "project": "clawctrl",
                "branch": "codex/chat-parity",
                "runtime": "Work locally",
                "env": "local"
            },
            {
                "key": "match-by-cwd-without-project-id",
                "workingDir": "/Volumes/T7/projects/clawctrl",
                "project": "clawctrl",
                "branch": "codex/chat-parity",
                "runtime": "Work locally",
                "environmentId": "local"
            },
            {
                "key": "wrong-project-id",
                "workingDir": "/tmp/other-project",
                "projectId": "local:other:stable",
                "project": "clawctrl",
                "branch": "codex/chat-parity",
                "runtime": "Work locally",
                "environmentId": "local"
            },
            {
                "key": "wrong-project-id-same-cwd",
                "workingDir": "/Volumes/T7/projects/clawctrl",
                "projectId": "local:other:stable",
                "project": "clawctrl",
                "branch": "codex/chat-parity",
                "runtime": "Work locally",
                "environmentId": "local"
            },
            {
                "key": "wrong-branch",
                "workingDir": "/Volumes/T7/projects/clawctrl",
                "projectId": "local:clawctrl:stable",
                "project": "clawctrl",
                "branch": "main",
                "runtime": "Work locally",
                "environmentId": "local"
            },
            {
                "key": "wrong-env",
                "workingDir": "/Volumes/T7/projects/clawctrl",
                "projectId": "local:clawctrl:stable",
                "project": "clawctrl",
                "branch": "codex/chat-parity",
                "runtime": "Work locally",
                "environmentId": "remote"
            }
        ]);
        let filters = GatewaySessionFilters::from_query(
            "cwd=/Volumes/T7/projects/clawctrl&projectId=local%3Aclawctrl%3Astable&project=clawctrl&branch=codex%2Fchat-parity&runtime=Work%20locally&environmentId=local",
        );

        let filtered = filter_gateway_sessions(sessions, &filters);
        let keys: Vec<&str> = filtered
            .as_array()
            .unwrap()
            .iter()
            .filter_map(|session| session.get("key").and_then(Value::as_str))
            .collect();

        assert_eq!(
            keys,
            vec![
                "match",
                "match-by-project-id",
                "match-by-project-ref",
                "match-by-cwd-without-project-id"
            ]
        );
    }
}
