use axum::{
    extract::{RawQuery, State},
    routing::{get, post},
    Json, Router,
};
use reqwest::Method;
use serde::Deserialize;
use serde_json::json;
use serde_json::Value;
use std::path::PathBuf;
use tokio::time::Duration;

use crate::error::AppError;
use crate::harness_paths;
use crate::server::{AppState, RequireAuth};

use super::gateway::{gateway_forward, harness_api_key, harness_api_url, validate_gateway_path};

// ── Router ──────────────────────────────────────────────────────────────────

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/hermes/usage", get(get_usage))
        .route(
            "/hermes/dashboard/overview",
            get(get_codex_lb_dashboard_overview),
        )
        .route(
            "/hermes/dashboard/request-logs",
            get(get_codex_lb_request_logs),
        )
        .route(
            "/hermes/dashboard/request-logs/options",
            get(get_codex_lb_request_log_options),
        )
        .route("/hermes/dashboard/accounts", get(get_codex_lb_accounts))
        .route("/hermes/dashboard/api-keys", get(get_codex_lb_api_keys))
        .route("/hermes/dashboard/settings", get(get_codex_lb_settings))
        .route(
            "/hermes/dashboard/auth/session",
            get(get_codex_lb_auth_session),
        )
        .route(
            "/hermes/dashboard/auth/login",
            post(post_codex_lb_auth_login),
        )
        .route("/hermes/dashboard/auth/totp", post(post_codex_lb_auth_totp))
        .route(
            "/hermes/dashboard/auth/logout",
            post(post_codex_lb_auth_logout),
        )
        .route(
            "/hermes/codex-lb/dashboard/overview",
            get(get_codex_lb_dashboard_overview),
        )
        .route(
            "/hermes/codex-lb/request-logs",
            get(get_codex_lb_request_logs),
        )
        .route(
            "/hermes/codex-lb/request-logs/options",
            get(get_codex_lb_request_log_options),
        )
        .route("/hermes/codex-lb/accounts", get(get_codex_lb_accounts))
        .route("/hermes/codex-lb/api-keys", get(get_codex_lb_api_keys))
        .route("/hermes/codex-lb/settings", get(get_codex_lb_settings))
        .route(
            "/hermes/codex-lb/auth/session",
            get(get_codex_lb_auth_session),
        )
        .route(
            "/hermes/codex-lb/auth/login",
            post(post_codex_lb_auth_login),
        )
        .route("/hermes/codex-lb/auth/totp", post(post_codex_lb_auth_totp))
        .route(
            "/hermes/codex-lb/auth/logout",
            post(post_codex_lb_auth_logout),
        )
        .route("/hermes/models", get(get_models))
        .route("/hermes/tools", get(get_tools))
        .route("/hermes/tools/invoke", post(invoke_tool))
        .route("/hermes/skills", get(get_skills))
        .route(
            "/hermes/runtime-config",
            get(get_runtime_config).patch(patch_runtime_config),
        )
        .route("/harness/usage", get(get_usage))
        .route(
            "/harness/codex-lb/dashboard/overview",
            get(get_codex_lb_dashboard_overview),
        )
        .route(
            "/harness/codex-lb/request-logs",
            get(get_codex_lb_request_logs),
        )
        .route(
            "/harness/codex-lb/request-logs/options",
            get(get_codex_lb_request_log_options),
        )
        .route("/harness/codex-lb/accounts", get(get_codex_lb_accounts))
        .route("/harness/codex-lb/api-keys", get(get_codex_lb_api_keys))
        .route("/harness/codex-lb/settings", get(get_codex_lb_settings))
        .route(
            "/harness/codex-lb/auth/session",
            get(get_codex_lb_auth_session),
        )
        .route(
            "/harness/codex-lb/auth/login",
            post(post_codex_lb_auth_login),
        )
        .route("/harness/codex-lb/auth/totp", post(post_codex_lb_auth_totp))
        .route(
            "/harness/codex-lb/auth/logout",
            post(post_codex_lb_auth_logout),
        )
        .route("/harness/models", get(get_models))
        .route("/harness/tools", get(get_tools))
        .route("/harness/tools/invoke", post(invoke_tool))
        .route("/harness/skills", get(get_skills))
        .route(
            "/harness/runtime-config",
            get(get_runtime_config).patch(patch_runtime_config),
        )
        .route("/openclaw/usage", get(get_usage))
        .route(
            "/openclaw/codex-lb/dashboard/overview",
            get(get_codex_lb_dashboard_overview),
        )
        .route(
            "/openclaw/codex-lb/request-logs",
            get(get_codex_lb_request_logs),
        )
        .route(
            "/openclaw/codex-lb/request-logs/options",
            get(get_codex_lb_request_log_options),
        )
        .route("/openclaw/codex-lb/accounts", get(get_codex_lb_accounts))
        .route("/openclaw/codex-lb/api-keys", get(get_codex_lb_api_keys))
        .route("/openclaw/codex-lb/settings", get(get_codex_lb_settings))
        .route(
            "/openclaw/codex-lb/auth/session",
            get(get_codex_lb_auth_session),
        )
        .route(
            "/openclaw/codex-lb/auth/login",
            post(post_codex_lb_auth_login),
        )
        .route(
            "/openclaw/codex-lb/auth/totp",
            post(post_codex_lb_auth_totp),
        )
        .route(
            "/openclaw/codex-lb/auth/logout",
            post(post_codex_lb_auth_logout),
        )
        .route("/openclaw/models", get(get_models))
        .route("/openclaw/tools", get(get_tools))
        .route("/openclaw/tools/invoke", post(invoke_tool))
        .route("/openclaw/skills", get(get_skills))
        .route(
            "/openclaw/runtime-config",
            get(get_runtime_config).patch(patch_runtime_config),
        )
}

// ── GET /harness/usage ──────────────────────────────────────────────────────

async fn get_usage(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let result = gateway_forward(&state, Method::GET, "/usage", None).await?;
    Ok(Json(result))
}

async fn forward_codex_lb_get(
    state: &AppState,
    upstream_path: &str,
    query: Option<String>,
) -> Result<Json<Value>, AppError> {
    ensure_codex_lb_dashboard_session(state).await?;
    let result = codex_lb_forward_get(state, upstream_path, query.as_deref()).await?;
    Ok(Json(result))
}

async fn get_codex_lb_dashboard_overview(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    RawQuery(query): RawQuery,
) -> Result<Json<Value>, AppError> {
    forward_codex_lb_get(&state, "/api/dashboard/overview", query).await
}

async fn get_codex_lb_request_logs(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    RawQuery(query): RawQuery,
) -> Result<Json<Value>, AppError> {
    forward_codex_lb_get(&state, "/api/request-logs", query).await
}

async fn get_codex_lb_request_log_options(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    RawQuery(query): RawQuery,
) -> Result<Json<Value>, AppError> {
    forward_codex_lb_get(&state, "/api/request-logs/options", query).await
}

async fn get_codex_lb_accounts(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    RawQuery(query): RawQuery,
) -> Result<Json<Value>, AppError> {
    forward_codex_lb_get(&state, "/api/accounts", query).await
}

async fn get_codex_lb_api_keys(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    RawQuery(query): RawQuery,
) -> Result<Json<Value>, AppError> {
    forward_codex_lb_get(&state, "/api/api-keys/", query).await
}

async fn get_codex_lb_settings(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    RawQuery(query): RawQuery,
) -> Result<Json<Value>, AppError> {
    forward_codex_lb_get(&state, "/api/settings", query).await
}

fn codex_lb_cookie_from_headers(headers: &reqwest::header::HeaderMap) -> Option<String> {
    let cookies = headers
        .get_all(reqwest::header::SET_COOKIE)
        .iter()
        .filter_map(|value| value.to_str().ok())
        .filter_map(|value| value.split(';').next())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .collect::<Vec<_>>();
    if cookies.is_empty() {
        None
    } else {
        Some(cookies.join("; "))
    }
}

fn store_codex_lb_cookie(state: &AppState, cookie: String) {
    let mut secrets = std::collections::HashMap::new();
    secrets.insert("CODEX_LB_DASHBOARD_COOKIE".to_string(), cookie);
    state.merge_secrets(secrets);
}

fn codex_lb_api_url(state: &AppState) -> String {
    state
        .secret_first(&[
            "HERMES_USAGE_API_URL",
            "HERMES_DASHBOARD_API_URL",
            "HERMES_API_URL",
            "HARNESS_API_URL",
            "CODEX_LB_API_URL",
            "OPENCLAW_API_URL",
        ])
        .unwrap_or_else(|| "http://127.0.0.1:2455".to_string())
}

fn codex_lb_api_key(state: &AppState) -> String {
    state
        .secret_first(&[
            "HERMES_USAGE_API_KEY",
            "HERMES_DASHBOARD_API_KEY",
            "HERMES_API_KEY",
            "HERMES_PASSWORD",
            "HARNESS_API_KEY",
            "HARNESS_PASSWORD",
            "CODEX_LB_API_KEY",
            "OPENCLAW_API_KEY",
            "OPENCLAW_PASSWORD",
        ])
        .unwrap_or_default()
}

async fn codex_lb_forward_get(
    state: &AppState,
    upstream_path: &str,
    query: Option<&str>,
) -> Result<Value, AppError> {
    validate_gateway_path(upstream_path)?;
    let base = codex_lb_api_url(state);
    let api_key = codex_lb_api_key(state);
    let mut url = format!("{base}{upstream_path}");
    if let Some(query) = query.filter(|value| !value.trim().is_empty()) {
        let normalized = url::form_urlencoded::parse(query.as_bytes())
            .fold(
                url::form_urlencoded::Serializer::new(String::new()),
                |mut ser, (key, value)| {
                    ser.append_pair(&key, &value);
                    ser
                },
            )
            .finish();
        if !normalized.is_empty() {
            url.push('?');
            url.push_str(&normalized);
        }
    }

    let mut req = state
        .http
        .get(&url)
        .header("Content-Type", "application/json")
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

    let res = req.send().await.map_err(|e| {
        tracing::error!("[hermes-dashboard] request to {upstream_path} failed: {e}");
        AppError::Internal(anyhow::anyhow!(
            "Failed to reach Hermes Agent dashboard API"
        ))
    })?;
    let status = res.status();
    if !status.is_success() {
        let text = res.text().await.unwrap_or_default();
        let safe_msg = super::gateway::sanitize_error_body(&text);
        if status.is_client_error() {
            return Err(AppError::BadRequest(format!("Hermes Agent: {safe_msg}")));
        }
        return Err(AppError::Internal(anyhow::anyhow!(
            "Hermes Agent dashboard API error"
        )));
    }
    res.json::<Value>()
        .await
        .map_err(|e| AppError::Internal(e.into()))
}

async fn codex_lb_auth_forward(
    state: &AppState,
    method: Method,
    upstream_path: &str,
    body: Option<Value>,
    capture_cookie: bool,
) -> Result<Value, AppError> {
    let base = codex_lb_api_url(state);
    let api_key = codex_lb_api_key(state);
    let url = format!("{base}{upstream_path}");
    let mut req = state
        .http
        .request(method.clone(), &url)
        .header("Content-Type", "application/json")
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
    if let Some(value) = body {
        req = req.json(&value);
    }

    let res = req.send().await.map_err(|e| {
        tracing::error!("[hermes-dashboard-auth] request to {upstream_path} failed: {e}");
        AppError::Internal(anyhow::anyhow!(
            "Failed to reach Hermes Agent dashboard auth"
        ))
    })?;
    let status = res.status();
    let cookie = if capture_cookie {
        codex_lb_cookie_from_headers(res.headers())
    } else {
        None
    };
    if !status.is_success() {
        let text = res.text().await.unwrap_or_default();
        let safe_msg = super::gateway::sanitize_error_body(&text);
        if status.is_client_error() {
            return Err(AppError::BadRequest(format!("Hermes Agent: {safe_msg}")));
        }
        return Err(AppError::Internal(anyhow::anyhow!(
            "Hermes Agent dashboard auth error"
        )));
    }
    let parsed = res
        .json::<Value>()
        .await
        .map_err(|e| AppError::Internal(e.into()))?;
    if let Some(cookie) = cookie {
        store_codex_lb_cookie(state, cookie);
    }
    Ok(parsed)
}

async fn ensure_codex_lb_dashboard_session(state: &AppState) -> Result<(), AppError> {
    let session = codex_lb_auth_forward(
        state,
        Method::GET,
        "/api/dashboard-auth/session",
        None,
        false,
    )
    .await?;
    if session
        .get("authenticated")
        .and_then(Value::as_bool)
        .unwrap_or(false)
    {
        return Ok(());
    }

    let Some(password) = state
        .secret_first(&["HERMES_DASHBOARD_PASSWORD", "CODEX_LB_DASHBOARD_PASSWORD"])
        .filter(|value| !value.trim().is_empty())
    else {
        return Ok(());
    };

    if let Err(err) = codex_lb_auth_forward(
        state,
        Method::POST,
        "/api/dashboard-auth/password/login",
        Some(json!({ "password": password })),
        true,
    )
    .await
    {
        tracing::warn!(
            "[hermes-dashboard-auth] saved dashboard password did not establish a session: {err:?}"
        );
    }
    Ok(())
}

async fn get_codex_lb_auth_session(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    ensure_codex_lb_dashboard_session(&state).await?;
    let result = codex_lb_auth_forward(
        &state,
        Method::GET,
        "/api/dashboard-auth/session",
        None,
        false,
    )
    .await?;
    Ok(Json(result))
}

async fn post_codex_lb_auth_login(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Json(body): Json<Value>,
) -> Result<Json<Value>, AppError> {
    let result = codex_lb_auth_forward(
        &state,
        Method::POST,
        "/api/dashboard-auth/password/login",
        Some(body),
        true,
    )
    .await?;
    Ok(Json(result))
}

async fn post_codex_lb_auth_totp(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Json(body): Json<Value>,
) -> Result<Json<Value>, AppError> {
    let result = codex_lb_auth_forward(
        &state,
        Method::POST,
        "/api/dashboard-auth/totp/verify",
        Some(body),
        true,
    )
    .await?;
    Ok(Json(result))
}

async fn post_codex_lb_auth_logout(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let result = codex_lb_auth_forward(
        &state,
        Method::POST,
        "/api/dashboard-auth/logout",
        None,
        false,
    )
    .await
    .unwrap_or_else(|_| json!({ "status": "ok" }));
    store_codex_lb_cookie(&state, String::new());
    Ok(Json(result))
}

// ── GET /harness/models ─────────────────────────────────────────────────────

async fn get_models(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let result = gateway_forward(&state, Method::GET, "/models", None).await?;
    Ok(Json(result))
}

async fn get_tools(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let result = gateway_forward(&state, Method::GET, "/tools", None).await?;
    Ok(Json(result))
}

async fn get_skills(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let result = gateway_forward(&state, Method::GET, "/skills", None).await?;
    Ok(Json(result))
}

async fn invoke_tool(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Json(body): Json<Value>,
) -> Result<Json<Value>, AppError> {
    let result = gateway_forward(&state, Method::POST, "/tools/invoke", Some(body)).await?;
    Ok(Json(result))
}

#[derive(Debug, Default)]
struct HarnessRuntimePrefs {
    chat_primary_model: Option<String>,
    heartbeat_model: Option<String>,
    favorite_models: Option<Vec<String>>,
}

impl HarnessRuntimePrefs {
    fn overlay(&mut self, other: HarnessRuntimePrefs) {
        if other.chat_primary_model.is_some() {
            self.chat_primary_model = other.chat_primary_model;
        }
        if other.heartbeat_model.is_some() {
            self.heartbeat_model = other.heartbeat_model;
        }
        if other.favorite_models.is_some() {
            self.favorite_models = other.favorite_models;
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PatchRuntimeConfigBody {
    #[serde(default)]
    chat_primary_model: Option<String>,
    #[serde(default)]
    heartbeat_model: Option<String>,
    #[serde(default)]
    favorite_models: Option<Vec<String>>,
}

fn harness_workspace_dir(state: &AppState) -> PathBuf {
    harness_paths::runtime_preferences_dir(state)
}

fn normalize_model_id(value: Option<String>) -> Option<String> {
    value
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
}

fn normalize_favorite_models(models: Option<Vec<String>>) -> Option<Vec<String>> {
    models.map(|values| {
        let mut unique = Vec::new();
        for value in values {
            let trimmed = value.trim();
            if !trimmed.is_empty() && !unique.iter().any(|existing: &String| existing == trimmed) {
                unique.push(trimmed.to_string());
            }
        }
        unique
    })
}

async fn load_runtime_prefs(
    state: &AppState,
    user_id: &str,
) -> Result<(String, serde_json::Map<String, Value>, HarnessRuntimePrefs), AppError> {
    let existing_row: Option<(String, String)> = sqlx::query_as(
        "SELECT id, preferences FROM user_preferences \
         WHERE user_id = ? AND deleted_at IS NULL \
         LIMIT 1",
    )
    .bind(user_id)
    .fetch_optional(&state.db)
    .await?;

    let (row_id, prefs_map) = match existing_row {
        Some((id, prefs_str)) => {
            let map = serde_json::from_str::<Value>(&prefs_str)
                .ok()
                .and_then(|v| v.as_object().cloned())
                .unwrap_or_default();
            (id, map)
        }
        None => (crate::routes::util::random_uuid(), serde_json::Map::new()),
    };

    let runtime = HarnessRuntimePrefs {
        chat_primary_model: prefs_map
            .get("harness-chat-primary-model")
            .or_else(|| prefs_map.get("hermes-chat-primary-model"))
            .or_else(|| prefs_map.get("openclaw-chat-primary-model"))
            .and_then(|v| v.as_str())
            .map(ToString::to_string),
        heartbeat_model: prefs_map
            .get("harness-heartbeat-model")
            .or_else(|| prefs_map.get("hermes-heartbeat-model"))
            .or_else(|| prefs_map.get("openclaw-heartbeat-model"))
            .and_then(|v| v.as_str())
            .map(ToString::to_string),
        favorite_models: prefs_map
            .get("chat-favorite-models")
            .and_then(|v| v.as_array())
            .map(|items| {
                items
                    .iter()
                    .filter_map(|item| item.as_str().map(ToString::to_string))
                    .collect()
            }),
    };

    Ok((row_id, prefs_map, runtime))
}

async fn load_runtime_file(state: &AppState) -> HarnessRuntimePrefs {
    if let Some(base) = harness_api_url(state) {
        let url = format!("{}/runtime-config", base);
        let key = harness_api_key(state);
        let mut req = state.http.get(url);
        if !key.is_empty() {
            req = req.header("Authorization", format!("Bearer {key}"));
        }
        return match req.timeout(Duration::from_secs(10)).send().await {
            Ok(resp) if resp.status().is_success() => resp
                .json::<Value>()
                .await
                .ok()
                .map(parse_runtime_config_value)
                .unwrap_or_default(),
            _ => HarnessRuntimePrefs::default(),
        };
    }

    let dir = harness_workspace_dir(state);
    let content = match tokio::fs::read_to_string(dir.join("HARNESS-PREFERENCES.json")).await {
        Ok(raw) => Some(raw),
        Err(_) => match tokio::fs::read_to_string(dir.join("HERMES-PREFERENCES.json")).await {
            Ok(raw) => Some(raw),
            Err(_) => tokio::fs::read_to_string(dir.join("OPENCLAW-PREFERENCES.json"))
                .await
                .ok(),
        },
    };
    match content {
        Some(raw) => {
            parse_runtime_config_value(serde_json::from_str::<Value>(&raw).unwrap_or(Value::Null))
        }
        None => HarnessRuntimePrefs::default(),
    }
}

fn parse_runtime_config_value(parsed: Value) -> HarnessRuntimePrefs {
    HarnessRuntimePrefs {
        chat_primary_model: parsed
            .get("chatPrimaryModel")
            .and_then(|v| v.as_str())
            .map(ToString::to_string),
        heartbeat_model: parsed
            .get("heartbeatModel")
            .and_then(|v| v.as_str())
            .map(ToString::to_string),
        favorite_models: parsed
            .get("favoriteModels")
            .and_then(|v| v.as_array())
            .map(|items| {
                items
                    .iter()
                    .filter_map(|item| item.as_str().map(ToString::to_string))
                    .collect()
            }),
    }
}

async fn persist_runtime_prefs(
    state: &AppState,
    row_id: &str,
    user_id: &str,
    prefs_map: serde_json::Map<String, Value>,
) -> Result<(), AppError> {
    let now = chrono::Utc::now().to_rfc3339();
    let prefs_value = Value::Object(prefs_map.clone());
    let prefs_str =
        serde_json::to_string(&prefs_value).map_err(|e| AppError::Internal(e.into()))?;

    sqlx::query(
        "INSERT INTO user_preferences (id, user_id, preferences, updated_at) \
         VALUES (?, ?, ?, ?) \
         ON CONFLICT(id) DO UPDATE SET preferences = excluded.preferences, updated_at = excluded.updated_at",
    )
    .bind(row_id)
    .bind(user_id)
    .bind(&prefs_str)
    .bind(&now)
    .execute(&state.db)
    .await?;

    let payload = serde_json::to_string(&json!({
        "user_id": user_id,
        "preferences": prefs_value,
        "updated_at": now,
    }))
    .map_err(|e| AppError::Internal(e.into()))?;

    crate::sync::log_mutation(
        &state.db,
        "user_preferences",
        user_id,
        "UPDATE",
        Some(&payload),
    )
    .await
    .map_err(|e| AppError::Internal(e.into()))?;

    Ok(())
}

async fn write_runtime_file(state: &AppState, runtime: &HarnessRuntimePrefs) {
    let payload = json!({
        "chatPrimaryModel": runtime.chat_primary_model,
        "heartbeatModel": runtime.heartbeat_model,
        "favoriteModels": runtime.favorite_models.clone().unwrap_or_default(),
        "updatedAt": chrono::Utc::now().to_rfc3339(),
        "managedBy": "clawctrl",
    });

    if let Some(base) = harness_api_url(state) {
        let url = format!("{}/runtime-config", base);
        let key = harness_api_key(state);
        let mut req = state.http.patch(url).json(&payload);
        if !key.is_empty() {
            req = req.header("Authorization", format!("Bearer {key}"));
        }
        let _ = req.timeout(Duration::from_secs(10)).send().await;
        return;
    }

    let content = payload.to_string();
    let path = harness_workspace_dir(state).join("HARNESS-PREFERENCES.json");
    if let Some(parent) = path.parent() {
        let _ = tokio::fs::create_dir_all(parent).await;
    }
    let _ = tokio::fs::write(path, content.as_bytes()).await;
}

async fn apply_primary_chat_model(state: &AppState, model: &str) -> bool {
    let Some(base) = harness_api_url(state) else {
        return false;
    };

    let url = format!("{}/chat/model", base);
    let key = harness_api_key(state);
    let mut req = state.http.post(url).json(&json!({ "model": model }));
    if !key.is_empty() {
        req = req.header("Authorization", format!("Bearer {key}"));
    }

    match req.timeout(Duration::from_secs(10)).send().await {
        Ok(resp) => resp.status().is_success(),
        Err(_) => false,
    }
}

async fn get_runtime_config(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let (_row_id, _prefs_map, prefs_runtime) = load_runtime_prefs(&state, &session.user_id).await?;
    let mut runtime = load_runtime_file(&state).await;
    runtime.overlay(prefs_runtime);
    Ok(Json(json!({
        "chatPrimaryModel": runtime.chat_primary_model,
        "heartbeatModel": runtime.heartbeat_model,
        "favoriteModels": runtime.favorite_models.unwrap_or_default(),
    })))
}

async fn patch_runtime_config(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Json(body): Json<PatchRuntimeConfigBody>,
) -> Result<Json<Value>, AppError> {
    let (row_id, mut prefs_map, mut runtime) = load_runtime_prefs(&state, &session.user_id).await?;

    if let Some(value) = normalize_model_id(body.chat_primary_model) {
        prefs_map.insert("harness-chat-primary-model".into(), json!(value.clone()));
        prefs_map.insert("chat-model".into(), json!(value.clone()));
        runtime.chat_primary_model = Some(value);
    }

    if let Some(value) = normalize_model_id(body.heartbeat_model) {
        prefs_map.insert("harness-heartbeat-model".into(), json!(value.clone()));
        runtime.heartbeat_model = Some(value);
    }

    if let Some(values) = normalize_favorite_models(body.favorite_models) {
        prefs_map.insert("chat-favorite-models".into(), json!(values.clone()));
        runtime.favorite_models = Some(values);
    }

    persist_runtime_prefs(&state, &row_id, &session.user_id, prefs_map).await?;
    write_runtime_file(&state, &runtime).await;

    let applied = if let Some(model) = runtime.chat_primary_model.as_deref() {
        apply_primary_chat_model(&state, model).await
    } else {
        false
    };

    Ok(Json(json!({
        "ok": true,
        "chatPrimaryModel": runtime.chat_primary_model,
        "heartbeatModel": runtime.heartbeat_model,
        "favoriteModels": runtime.favorite_models.unwrap_or_default(),
        "appliedChatModel": applied,
    })))
}

// ── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::super::gateway::validate_gateway_path;
    use super::*;

    async fn harness_data_test_state(
        secrets: std::collections::HashMap<String, String>,
    ) -> AppState {
        let db = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .connect(":memory:")
            .await
            .expect("sqlite memory db");

        AppState {
            app: None,
            db,
            http: reqwest::Client::new(),
            secrets: std::sync::Arc::new(std::sync::RwLock::new(secrets)),
            bb: None,
            harness: None,
            gateway_ws: None,
            session: std::sync::Arc::new(tokio::sync::RwLock::new(None)),
            refresh_mutex: std::sync::Arc::new(tokio::sync::Mutex::new(())),
            session_validated_at: std::sync::Arc::new(tokio::sync::RwLock::new(0)),
            pending_oauth: std::sync::Arc::new(tokio::sync::RwLock::new(None)),
        }
    }

    #[test]
    fn validate_usage_path() {
        assert!(validate_gateway_path("/usage").is_ok());
    }

    #[test]
    fn validate_models_path() {
        assert!(validate_gateway_path("/models").is_ok());
    }

    #[test]
    fn reject_usage_with_injection() {
        assert!(validate_gateway_path("/usage?inject=true").is_err());
    }

    #[tokio::test]
    async fn dashboard_proxy_prefers_hermes_usage_aliases_over_legacy_codex_lb_aliases() {
        let state = harness_data_test_state(std::collections::HashMap::from([
            (
                "HERMES_USAGE_API_URL".to_string(),
                "http://hermes-usage.local".to_string(),
            ),
            (
                "CODEX_LB_API_URL".to_string(),
                "http://legacy-dashboard.local".to_string(),
            ),
            ("HERMES_USAGE_API_KEY".to_string(), "hermes-key".to_string()),
            ("CODEX_LB_API_KEY".to_string(), "legacy-key".to_string()),
        ]))
        .await;

        assert_eq!(codex_lb_api_url(&state), "http://hermes-usage.local");
        assert_eq!(codex_lb_api_key(&state), "hermes-key");
    }

    #[test]
    fn runtime_overlay_prefers_runtime_values() {
        let mut prefs = HarnessRuntimePrefs {
            chat_primary_model: Some("openai/gpt-5".into()),
            heartbeat_model: Some("llama-desktop/qwen".into()),
            favorite_models: Some(vec!["openai/gpt-5".into()]),
        };
        let runtime = HarnessRuntimePrefs {
            chat_primary_model: Some("openai-codex/gpt-5.2-codex".into()),
            heartbeat_model: None,
            favorite_models: Some(vec![
                "openai-codex/gpt-5.2-codex".into(),
                "openai/gpt-5-mini".into(),
            ]),
        };

        prefs.overlay(runtime);

        assert_eq!(
            prefs.chat_primary_model.as_deref(),
            Some("openai-codex/gpt-5.2-codex")
        );
        assert_eq!(prefs.heartbeat_model.as_deref(), Some("llama-desktop/qwen"));
        assert_eq!(
            prefs.favorite_models,
            Some(vec![
                "openai-codex/gpt-5.2-codex".into(),
                "openai/gpt-5-mini".into()
            ])
        );
    }

    #[test]
    fn normalize_favorite_models_trims_and_dedupes() {
        let normalized = normalize_favorite_models(Some(vec![
            " openai/gpt-5 ".into(),
            "".into(),
            "openai/gpt-5".into(),
            "openai/gpt-5-mini".into(),
        ]));

        assert_eq!(
            normalized,
            Some(vec!["openai/gpt-5".into(), "openai/gpt-5-mini".into()])
        );
    }

    #[test]
    fn parse_runtime_config_value_extracts_expected_fields() {
        let parsed = parse_runtime_config_value(json!({
            "chatPrimaryModel": "openai-codex/gpt-5.2-codex",
            "heartbeatModel": "llama-desktop/qwen",
            "favoriteModels": ["openai-codex/gpt-5.2-codex", "openai/gpt-5-mini"]
        }));

        assert_eq!(
            parsed.chat_primary_model.as_deref(),
            Some("openai-codex/gpt-5.2-codex")
        );
        assert_eq!(
            parsed.heartbeat_model.as_deref(),
            Some("llama-desktop/qwen")
        );
        assert_eq!(
            parsed.favorite_models,
            Some(vec![
                "openai-codex/gpt-5.2-codex".into(),
                "openai/gpt-5-mini".into()
            ])
        );
    }
}
