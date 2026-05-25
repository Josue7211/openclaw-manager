use axum::{
    extract::{Path, RawQuery, State},
    routing::{delete, get, post, put},
    Json, Router,
};
use reqwest::Method;
use serde::Deserialize;
use serde_json::{json, Map, Value};
use std::{net::IpAddr, time::Duration};

use crate::error::AppError;
use crate::server::{AppState, RequireAuth};
use crate::tailscale::TailscalePeer;

const ALLOWED_ENV_KEYS: &[&str] = &[
    "DISCORD_BOT_TOKEN",
    "DISCORD_ALLOWED_USERS",
    "DISCORD_REPLY_TO_MODE",
    "BLUEBUBBLES_SERVER_URL",
    "BLUEBUBBLES_PASSWORD",
    "BLUEBUBBLES_ALLOWED_USERS",
    "BLUEBUBBLES_ALLOW_ALL_USERS",
    "GATEWAY_ALLOW_ALL_USERS",
    "API_SERVER_ENABLED",
    "API_SERVER_KEY",
    "API_SERVER_HOST",
    "API_SERVER_PORT",
    "API_SERVER_MODEL_NAME",
    "MATRIX_HOMESERVER",
    "MATRIX_ACCESS_TOKEN",
    "MATRIX_USER_ID",
    "MATRIX_ALLOWED_USERS",
    "MATRIX_REQUIRE_MENTION",
    "MATRIX_FREE_RESPONSE_ROOMS",
    "MATRIX_AUTO_THREAD",
    "MATRIX_DEVICE_ID",
    "MATRIX_RECOVERY_KEY",
];

const DISCORD_CONFIG_KEYS: &[&str] = &[
    "discord.require_mention",
    "discord.allowed_channels",
    "discord.free_response_channels",
    "discord.auto_thread",
    "discord.reactions",
    "discord.channel_prompts",
];

const HERMES_PLATFORM_CONFIG_KEYS: &[&str] = &[
    "platform_toolsets",
    "toolsets",
    "cron",
    "memory",
    "model",
    "display",
];

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/hermes/control/status", get(get_status))
        .route("/hermes/control/infra", get(get_infra))
        .route("/hermes/control/config", get(get_config).put(put_config))
        .route("/hermes/control/config/schema", get(get_config_schema))
        .route("/hermes/control/config/defaults", get(get_config_defaults))
        .route(
            "/hermes/control/env",
            get(get_env).put(put_env).delete(delete_env),
        )
        .route("/hermes/control/env/reveal", post(post_env_reveal))
        .route("/hermes/control/sessions", get(get_sessions))
        .route("/hermes/control/sessions/search", get(get_sessions_search))
        .route(
            "/hermes/control/sessions/:session_id",
            get(get_session).delete(delete_session),
        )
        .route(
            "/hermes/control/sessions/:session_id/messages",
            get(get_session_messages),
        )
        .route("/hermes/control/logs", get(get_logs))
        .route(
            "/hermes/control/cron/jobs",
            get(get_cron_jobs).post(post_cron_job),
        )
        .route(
            "/hermes/control/cron/jobs/:job_id",
            get(get_cron_job).put(put_cron_job).delete(delete_cron_job),
        )
        .route(
            "/hermes/control/cron/jobs/:job_id/pause",
            post(post_cron_pause),
        )
        .route(
            "/hermes/control/cron/jobs/:job_id/resume",
            post(post_cron_resume),
        )
        .route(
            "/hermes/control/cron/jobs/:job_id/trigger",
            post(post_cron_trigger),
        )
        .route("/hermes/control/providers/oauth", get(get_oauth_providers))
        .route(
            "/hermes/control/providers/oauth/:provider_id/start",
            post(post_oauth_start),
        )
        .route(
            "/hermes/control/providers/oauth/:provider_id/submit",
            post(post_oauth_submit),
        )
        .route(
            "/hermes/control/providers/oauth/:provider_id/poll/:session_id",
            get(get_oauth_poll),
        )
        .route(
            "/hermes/control/providers/oauth/:provider_id",
            delete(delete_oauth_provider),
        )
        .route(
            "/hermes/control/providers/oauth/sessions/:session_id",
            delete(delete_oauth_session),
        )
        .route("/hermes/control/tools/toolsets", get(get_toolsets))
        .route("/hermes/control/skills", get(get_skills))
        .route("/hermes/control/skills/toggle", put(put_skills_toggle))
        .route("/hermes/control/model/info", get(get_model_info))
        .route("/hermes/control/analytics/usage", get(get_analytics_usage))
        .route(
            "/hermes/control/setup/discord/discover",
            get(discord_discover),
        )
        .route(
            "/hermes/control/setup/discord/test-token",
            post(discord_test_token),
        )
        .route("/hermes/control/setup/discord/save", post(discord_save))
        .route(
            "/hermes/control/setup/discord/certify",
            post(discord_certify),
        )
        .route(
            "/hermes/control/setup/bluebubbles/discover",
            get(bluebubbles_discover),
        )
        .route(
            "/hermes/control/setup/bluebubbles/test",
            post(bluebubbles_test),
        )
        .route(
            "/hermes/control/setup/bluebubbles/save",
            post(bluebubbles_save),
        )
        .route(
            "/hermes/control/setup/bluebubbles/certify",
            post(bluebubbles_certify),
        )
        .route("/hermes/control/setup/matrix/audit", get(matrix_audit))
        .route("/hermes/control/setup/matrix/disable", post(matrix_disable))
}

fn dashboard_base(state: &AppState) -> Result<String, AppError> {
    let Some(base) = configured_secret_first(state, &["HERMES_DASHBOARD_URL", "CODEX_LB_API_URL"])
    else {
        return Err(AppError::BadRequest(
            "Hermes dashboard URL is not configured. Set HERMES_DASHBOARD_URL in settings or secrets."
                .into(),
        ));
    };
    ensure_trusted_dashboard_url(&base)?;
    Ok(base)
}

fn configured_secret(state: &AppState, key: &str) -> Option<String> {
    state
        .secret(key)
        .map(|value| value.trim().trim_end_matches('/').to_string())
        .filter(|value| !value.is_empty())
}

fn configured_secret_first(state: &AppState, keys: &[&str]) -> Option<String> {
    state
        .secret_first(keys)
        .map(|value| value.trim().trim_end_matches('/').to_string())
        .filter(|value| !value.is_empty())
}

fn configured_infra_node(
    id: &str,
    label: &str,
    url: Option<String>,
    peers: &[TailscalePeer],
) -> Value {
    let configured = url.is_some();
    let url = url.unwrap_or_default();
    let peer = if configured {
        crate::tailscale::verify_service_peer(&url, None, peers)
    } else {
        crate::tailscale::PeerVerification {
            peer_hostname: None,
            peer_verified: None,
        }
    };
    json!({
        "id": id,
        "label": label,
        "url": url,
        "configured": configured,
        "peer_hostname": peer.peer_hostname,
        "peer_verified": peer.peer_verified,
    })
}

fn ensure_trusted_dashboard_url(base: &str) -> Result<(), AppError> {
    let parsed = url::Url::parse(base)
        .map_err(|_| AppError::BadRequest("invalid Hermes dashboard URL".into()))?;
    let host = parsed
        .host_str()
        .ok_or_else(|| AppError::BadRequest("invalid Hermes dashboard URL".into()))?;
    if host.eq_ignore_ascii_case("localhost") || host.eq_ignore_ascii_case("127.0.0.1") {
        return Ok(());
    }
    if host.ends_with(".tail8fd5f4.ts.net") || host.ends_with(".ts.net") {
        return Ok(());
    }
    if let Ok(ip) = host.parse::<IpAddr>() {
        return match ip {
            IpAddr::V4(v4)
                if v4.is_loopback()
                    || v4.is_private()
                    || crate::tailscale::is_tailscale_ip(&v4.to_string()) =>
            {
                Ok(())
            }
            IpAddr::V6(v6)
                if v6.is_loopback() || crate::tailscale::is_tailscale_ip(&v6.to_string()) =>
            {
                Ok(())
            }
            _ => Err(AppError::BadRequest(
                "Hermes dashboard URL must be local, private, or Tailscale".into(),
            )),
        };
    }
    Err(AppError::BadRequest(
        "Hermes dashboard URL must be local, private, or Tailscale".into(),
    ))
}

async fn dashboard_token(state: &AppState, base: &str) -> Result<String, AppError> {
    if let Some(token) = state
        .secret("HERMES_DASHBOARD_TOKEN")
        .filter(|value| !value.trim().is_empty())
    {
        return Ok(token);
    }

    let html = state
        .http
        .get(base)
        .timeout(Duration::from_secs(5))
        .send()
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("failed to reach Hermes dashboard: {e}")))?
        .text()
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("failed to read Hermes dashboard: {e}")))?;

    let Some(token) = extract_dashboard_token(&html) else {
        return Err(AppError::BadRequest(
            "Hermes dashboard token could not be discovered".into(),
        ));
    };
    let mut secrets = std::collections::HashMap::new();
    secrets.insert("HERMES_DASHBOARD_TOKEN".to_string(), token.clone());
    state.merge_secrets(secrets);
    Ok(token)
}

fn extract_dashboard_token(html: &str) -> Option<String> {
    static TOKEN_RE: std::sync::OnceLock<regex::Regex> = std::sync::OnceLock::new();
    let re = TOKEN_RE
        .get_or_init(|| regex::Regex::new(r#"__HERMES_SESSION_TOKEN__\s*=\s*"([^"]+)""#).unwrap());
    re.captures(html)
        .and_then(|caps| caps.get(1))
        .map(|value| value.as_str().to_string())
}

async fn dashboard_forward(
    state: &AppState,
    method: Method,
    path: &str,
    query: Option<&str>,
    body: Option<Value>,
) -> Result<Value, AppError> {
    if !path.starts_with("/api/") || path.contains("..") || path.contains('\n') {
        return Err(AppError::BadRequest("invalid Hermes dashboard path".into()));
    }
    let base = dashboard_base(state)?;
    let token = dashboard_token(state, &base).await?;
    let mut url = format!("{base}{path}");
    if let Some(query) = query.filter(|value| !value.trim().is_empty()) {
        url.push('?');
        url.push_str(query);
    }

    let mut req = state
        .http
        .request(method.clone(), &url)
        .header(reqwest::header::ACCEPT, "application/json")
        .header(reqwest::header::CONTENT_TYPE, "application/json")
        .header("Authorization", format!("Bearer {token}"))
        .timeout(Duration::from_secs(30));
    if let Some(body) = body {
        req = req.json(&body);
    }
    let res = req.send().await.map_err(|e| {
        AppError::Internal(anyhow::anyhow!("failed to reach Hermes dashboard: {e}"))
    })?;
    let status = res.status();
    let text = res.text().await.unwrap_or_default();
    if !status.is_success() {
        let safe = super::gateway::sanitize_error_body(&text);
        if status.is_client_error() {
            return Err(AppError::BadRequest(format!("Hermes dashboard: {safe}")));
        }
        return Err(AppError::Internal(anyhow::anyhow!(
            "Hermes dashboard returned {status}"
        )));
    }
    if text.trim().is_empty() {
        return Ok(json!({ "ok": true }));
    }
    let value = serde_json::from_str::<Value>(&text).map_err(|e| {
        AppError::BadRequest(format!("Hermes dashboard returned invalid JSON: {e}"))
    })?;
    Ok(redact_value(value))
}

fn redact_value(value: Value) -> Value {
    match value {
        Value::Object(map) => Value::Object(
            map.into_iter()
                .map(|(key, value)| {
                    if key_is_secret(&key) {
                        (key, redacted_shape(value))
                    } else {
                        (key, redact_value(value))
                    }
                })
                .collect(),
        ),
        Value::Array(items) => Value::Array(items.into_iter().map(redact_value).collect()),
        other => other,
    }
}

fn key_is_secret(key: &str) -> bool {
    let key = key.to_ascii_lowercase();
    key.contains("token")
        || key.contains("password")
        || key.contains("secret")
        || key.contains("api_key")
        || key.contains("credential")
        || key.contains("cookie")
}

fn redacted_shape(value: Value) -> Value {
    match value {
        Value::Object(mut map) if map.contains_key("is_set") => {
            map.insert("redacted_value".to_string(), Value::Null);
            Value::Object(map)
        }
        Value::Bool(value) => Value::Bool(value),
        Value::Null => Value::Null,
        _ => Value::String("[redacted]".to_string()),
    }
}

async fn get_json(
    state: AppState,
    path: &str,
    query: Option<String>,
) -> Result<Json<Value>, AppError> {
    Ok(Json(
        dashboard_forward(&state, Method::GET, path, query.as_deref(), None).await?,
    ))
}

async fn body_forward(
    state: AppState,
    method: Method,
    path: &'static str,
    body: Value,
) -> Result<Json<Value>, AppError> {
    Ok(Json(
        dashboard_forward(&state, method, path, None, Some(body)).await?,
    ))
}

async fn get_status(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    get_json(state, "/api/status", None).await
}

async fn get_config(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    get_json(state, "/api/config", None).await
}

async fn put_config(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Json(body): Json<Value>,
) -> Result<Json<Value>, AppError> {
    ensure_config_write_allowed(&body)?;
    body_forward(state, Method::PUT, "/api/config", body).await
}

async fn get_config_schema(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    get_json(state, "/api/config/schema", None).await
}

async fn get_config_defaults(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    get_json(state, "/api/config/defaults", None).await
}

async fn get_env(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    get_json(state, "/api/env", None).await
}

async fn put_env(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Json(body): Json<Value>,
) -> Result<Json<Value>, AppError> {
    ensure_env_write_allowed(&body)?;
    body_forward(state, Method::PUT, "/api/env", body).await
}

async fn delete_env(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Json(body): Json<Value>,
) -> Result<Json<Value>, AppError> {
    ensure_env_write_allowed(&body)?;
    body_forward(state, Method::DELETE, "/api/env", body).await
}

async fn post_env_reveal(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Json(body): Json<Value>,
) -> Result<Json<Value>, AppError> {
    ensure_env_write_allowed(&body)?;
    body_forward(state, Method::POST, "/api/env/reveal", body).await
}

fn ensure_env_write_allowed(body: &Value) -> Result<(), AppError> {
    let keys = env_payload_keys(body);
    if keys.is_empty() {
        return Err(AppError::BadRequest("env payload must include keys".into()));
    }
    let bad = keys
        .iter()
        .find(|key| !ALLOWED_ENV_KEYS.contains(&key.as_str()));
    if let Some(key) = bad {
        return Err(AppError::BadRequest(format!(
            "Hermes env key is not allowed: {key}"
        )));
    }
    Ok(())
}

fn env_payload_keys(body: &Value) -> Vec<String> {
    if let Some(key) = body.get("key").and_then(Value::as_str) {
        return vec![key.to_string()];
    }
    if let Some(keys) = body.get("keys").and_then(Value::as_array) {
        return keys
            .iter()
            .filter_map(Value::as_str)
            .map(str::to_string)
            .collect();
    }
    if let Some(vars) = body
        .get("vars")
        .or_else(|| body.get("env"))
        .and_then(Value::as_object)
    {
        return vars.keys().cloned().collect();
    }
    body.as_object()
        .map(|map| map.keys().cloned().collect())
        .unwrap_or_default()
}

fn ensure_config_write_allowed(body: &Value) -> Result<(), AppError> {
    let keys = flattened_config_keys(body);
    if keys.is_empty() {
        return Err(AppError::BadRequest(
            "config payload must include keys".into(),
        ));
    }
    for key in keys {
        let allowed = DISCORD_CONFIG_KEYS.contains(&key.as_str())
            || HERMES_PLATFORM_CONFIG_KEYS
                .iter()
                .any(|prefix| key == *prefix || key.starts_with(&format!("{prefix}.")));
        if !allowed {
            return Err(AppError::BadRequest(format!(
                "Hermes config key is not allowed: {key}"
            )));
        }
    }
    Ok(())
}

fn flattened_config_keys(value: &Value) -> Vec<String> {
    let mut keys = Vec::new();
    flatten_config_keys("", value, &mut keys);
    keys
}

fn flatten_config_keys(prefix: &str, value: &Value, out: &mut Vec<String>) {
    match value {
        Value::Object(map) => {
            for (key, value) in map {
                let next = if prefix.is_empty() {
                    key.to_string()
                } else {
                    format!("{prefix}.{key}")
                };
                if value.is_object() {
                    flatten_config_keys(&next, value, out);
                } else {
                    out.push(next);
                }
            }
        }
        _ if !prefix.is_empty() => out.push(prefix.to_string()),
        _ => {}
    }
}

async fn get_sessions(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    RawQuery(query): RawQuery,
) -> Result<Json<Value>, AppError> {
    get_json(state, "/api/sessions", query).await
}

async fn get_sessions_search(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    RawQuery(query): RawQuery,
) -> Result<Json<Value>, AppError> {
    get_json(state, "/api/sessions/search", query).await
}

async fn get_session(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Path(session_id): Path<String>,
) -> Result<Json<Value>, AppError> {
    let path = format!("/api/sessions/{session_id}");
    get_json(state, &path, None).await
}

async fn get_session_messages(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Path(session_id): Path<String>,
    RawQuery(query): RawQuery,
) -> Result<Json<Value>, AppError> {
    let path = format!("/api/sessions/{session_id}/messages");
    Ok(Json(
        dashboard_forward(&state, Method::GET, &path, query.as_deref(), None).await?,
    ))
}

async fn delete_session(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Path(session_id): Path<String>,
) -> Result<Json<Value>, AppError> {
    let path = format!("/api/sessions/{session_id}");
    Ok(Json(
        dashboard_forward(&state, Method::DELETE, &path, None, None).await?,
    ))
}

async fn get_logs(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    RawQuery(query): RawQuery,
) -> Result<Json<Value>, AppError> {
    get_json(state, "/api/logs", query).await
}

async fn get_cron_jobs(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    get_json(state, "/api/cron/jobs", None).await
}

async fn post_cron_job(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Json(body): Json<Value>,
) -> Result<Json<Value>, AppError> {
    body_forward(state, Method::POST, "/api/cron/jobs", body).await
}

async fn get_cron_job(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Path(job_id): Path<String>,
) -> Result<Json<Value>, AppError> {
    let path = format!("/api/cron/jobs/{job_id}");
    Ok(Json(
        dashboard_forward(&state, Method::GET, &path, None, None).await?,
    ))
}

async fn put_cron_job(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Path(job_id): Path<String>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, AppError> {
    let path = format!("/api/cron/jobs/{job_id}");
    Ok(Json(
        dashboard_forward(&state, Method::PUT, &path, None, Some(body)).await?,
    ))
}

async fn delete_cron_job(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Path(job_id): Path<String>,
) -> Result<Json<Value>, AppError> {
    let path = format!("/api/cron/jobs/{job_id}");
    Ok(Json(
        dashboard_forward(&state, Method::DELETE, &path, None, None).await?,
    ))
}

async fn cron_action(
    state: AppState,
    job_id: String,
    action: &str,
) -> Result<Json<Value>, AppError> {
    let path = format!("/api/cron/jobs/{job_id}/{action}");
    Ok(Json(
        dashboard_forward(&state, Method::POST, &path, None, None).await?,
    ))
}

async fn post_cron_pause(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Path(job_id): Path<String>,
) -> Result<Json<Value>, AppError> {
    cron_action(state, job_id, "pause").await
}

async fn post_cron_resume(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Path(job_id): Path<String>,
) -> Result<Json<Value>, AppError> {
    cron_action(state, job_id, "resume").await
}

async fn post_cron_trigger(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Path(job_id): Path<String>,
) -> Result<Json<Value>, AppError> {
    cron_action(state, job_id, "trigger").await
}

async fn get_oauth_providers(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    get_json(state, "/api/providers/oauth", None).await
}

async fn post_oauth_start(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Path(provider_id): Path<String>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, AppError> {
    let path = format!("/api/providers/oauth/{provider_id}/start");
    Ok(Json(
        dashboard_forward(&state, Method::POST, &path, None, Some(body)).await?,
    ))
}

async fn post_oauth_submit(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Path(provider_id): Path<String>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, AppError> {
    let path = format!("/api/providers/oauth/{provider_id}/submit");
    Ok(Json(
        dashboard_forward(&state, Method::POST, &path, None, Some(body)).await?,
    ))
}

async fn get_oauth_poll(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Path((provider_id, session_id)): Path<(String, String)>,
) -> Result<Json<Value>, AppError> {
    let path = format!("/api/providers/oauth/{provider_id}/poll/{session_id}");
    Ok(Json(
        dashboard_forward(&state, Method::GET, &path, None, None).await?,
    ))
}

async fn delete_oauth_provider(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Path(provider_id): Path<String>,
) -> Result<Json<Value>, AppError> {
    let path = format!("/api/providers/oauth/{provider_id}");
    Ok(Json(
        dashboard_forward(&state, Method::DELETE, &path, None, None).await?,
    ))
}

async fn delete_oauth_session(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Path(session_id): Path<String>,
) -> Result<Json<Value>, AppError> {
    let path = format!("/api/providers/oauth/sessions/{session_id}");
    Ok(Json(
        dashboard_forward(&state, Method::DELETE, &path, None, None).await?,
    ))
}

async fn get_toolsets(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    get_json(state, "/api/tools/toolsets", None).await
}

async fn get_skills(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    get_json(state, "/api/skills", None).await
}

async fn put_skills_toggle(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Json(body): Json<Value>,
) -> Result<Json<Value>, AppError> {
    body_forward(state, Method::PUT, "/api/skills/toggle", body).await
}

async fn get_model_info(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    get_json(state, "/api/model/info", None).await
}

async fn get_analytics_usage(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    RawQuery(query): RawQuery,
) -> Result<Json<Value>, AppError> {
    get_json(state, "/api/analytics/usage", query).await
}

async fn get_infra(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let dashboard_url =
        configured_secret_first(&state, &["HERMES_DASHBOARD_URL", "CODEX_LB_API_URL"]);
    let hermes_api_url = configured_secret_first(
        &state,
        &["HERMES_API_URL", "OPENCLAW_API_URL", "HARNESS_API_URL"],
    );
    let hermes_ws = configured_secret_first(&state, &["HERMES_WS", "OPENCLAW_WS", "HARNESS_WS"]);
    let hermes_usage_api_url = configured_secret_first(
        &state,
        &[
            "HERMES_USAGE_API_URL",
            "HERMES_DASHBOARD_API_URL",
            "CODEX_LB_API_URL",
        ],
    );
    let mac_bridge_host = configured_secret(&state, "MAC_BRIDGE_HOST");
    let bluebubbles_host = configured_secret(&state, "BLUEBUBBLES_HOST");

    let peers = tokio::task::spawn_blocking(crate::tailscale::get_tailscale_peers)
        .await
        .ok()
        .and_then(Result::ok)
        .unwrap_or_default();

    Ok(Json(json!({
        "nodes": [
            configured_infra_node("hermes-dashboard", "Hermes dashboard", dashboard_url, &peers),
            configured_infra_node("hermes-api", "Hermes compat API", hermes_api_url, &peers),
            configured_infra_node("hermes-ws", "Hermes gateway WS", hermes_ws, &peers),
            configured_infra_node("hermes-usage-api", "Hermes usage API", hermes_usage_api_url, &peers),
            configured_infra_node("mac-bridge", "Mac Bridge", mac_bridge_host, &peers),
            configured_infra_node("bluebubbles", "BlueBubbles", bluebubbles_host, &peers),
        ],
        "matrix": { "status": "retired" },
        "discord": { "server": "Local AI Club" }
    })))
}

#[derive(Debug, Deserialize)]
struct DiscordTokenBody {
    #[serde(default)]
    token: String,
    #[serde(rename = "guildName", default = "default_discord_guild")]
    guild_name: String,
}

fn default_discord_guild() -> String {
    "Local AI Club".to_string()
}

async fn discord_discover(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let config = dashboard_forward(&state, Method::GET, "/api/config", None, None)
        .await
        .unwrap_or_else(|_| json!({}));
    let env = dashboard_forward(&state, Method::GET, "/api/env", None, None)
        .await
        .unwrap_or_else(|_| json!({}));
    Ok(Json(json!({
        "guildName": "Local AI Club",
        "env": {
            "DISCORD_BOT_TOKEN": env.pointer("/DISCORD_BOT_TOKEN/is_set").and_then(Value::as_bool).unwrap_or(false),
            "DISCORD_ALLOWED_USERS": env.get("DISCORD_ALLOWED_USERS").cloned().unwrap_or(Value::Null),
            "DISCORD_REPLY_TO_MODE": env.get("DISCORD_REPLY_TO_MODE").cloned().unwrap_or(Value::Null),
        },
        "config": config.get("discord").cloned().unwrap_or(Value::Null),
        "defaults": {
            "requireMention": true,
            "replyToMode": "first",
            "allowAllUsers": false
        }
    })))
}

async fn discord_test_token(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Json(body): Json<DiscordTokenBody>,
) -> Result<Json<Value>, AppError> {
    let token = body
        .token
        .trim()
        .to_string()
        .or_else_nonempty(|| state.secret("DISCORD_BOT_TOKEN").unwrap_or_default());
    if token.is_empty() {
        return Err(AppError::BadRequest("Discord bot token is required".into()));
    }
    let me = discord_api(&state, &token, "/users/@me").await?;
    let guilds = discord_api(&state, &token, "/users/@me/guilds").await?;
    let matching_guilds = guilds
        .as_array()
        .map(|items| {
            items
                .iter()
                .filter(|item| {
                    item.get("name")
                        .and_then(Value::as_str)
                        .map(|name| name.eq_ignore_ascii_case(&body.guild_name))
                        .unwrap_or(false)
                })
                .cloned()
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let channels = matching_guilds
        .first()
        .and_then(|guild| guild.get("id"))
        .and_then(Value::as_str)
        .map(|guild_id| format!("/guilds/{guild_id}/channels"));
    let channels = match channels {
        Some(path) => discord_api(&state, &token, &path)
            .await
            .unwrap_or_else(|_| json!([])),
        None => json!([]),
    };
    Ok(Json(json!({
        "ok": !matching_guilds.is_empty(),
        "bot": {
            "id": me.get("id"),
            "username": me.get("username"),
            "discriminator": me.get("discriminator"),
        },
        "guildName": body.guild_name,
        "guilds": matching_guilds,
        "channels": channels,
        "inviteRequired": matching_guilds.is_empty(),
    })))
}

async fn discord_api(state: &AppState, token: &str, path: &str) -> Result<Value, AppError> {
    let url = format!("https://discord.com/api/v10{path}");
    let res = state
        .http
        .get(url)
        .header("Authorization", format!("Bot {token}"))
        .header(reqwest::header::ACCEPT, "application/json")
        .timeout(Duration::from_secs(10))
        .send()
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Discord API request failed: {e}")))?;
    let status = res.status();
    let text = res.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(AppError::BadRequest(format!(
            "Discord API returned {status}: {}",
            super::gateway::sanitize_error_body(&text)
        )));
    }
    serde_json::from_str(&text)
        .map_err(|e| AppError::BadRequest(format!("Discord API returned invalid JSON: {e}")))
}

trait NonEmptyFallback {
    fn or_else_nonempty<F: FnOnce() -> String>(self, fallback: F) -> String;
}

impl NonEmptyFallback for String {
    fn or_else_nonempty<F: FnOnce() -> String>(self, fallback: F) -> String {
        if self.trim().is_empty() {
            fallback()
        } else {
            self
        }
    }
}

#[derive(Debug, Deserialize)]
struct DiscordSaveBody {
    #[serde(default)]
    token: String,
    #[serde(rename = "allowedUsers", default)]
    allowed_users: Vec<String>,
    #[serde(rename = "allowedChannels", default)]
    allowed_channels: Vec<String>,
    #[serde(rename = "replyToMode", default = "default_reply_mode")]
    reply_to_mode: String,
    #[serde(rename = "requireMention", default = "default_true")]
    require_mention: bool,
    #[serde(rename = "autoThread", default = "default_true")]
    auto_thread: bool,
    #[serde(default = "default_true")]
    reactions: bool,
    #[serde(rename = "channelPrompts", default)]
    channel_prompts: Map<String, Value>,
}

fn default_reply_mode() -> String {
    "first".to_string()
}

fn default_true() -> bool {
    true
}

async fn discord_save(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Json(body): Json<DiscordSaveBody>,
) -> Result<Json<Value>, AppError> {
    let mut env = Map::new();
    if !body.token.trim().is_empty() {
        env.insert("DISCORD_BOT_TOKEN".to_string(), json!(body.token.trim()));
    }
    env.insert(
        "DISCORD_ALLOWED_USERS".to_string(),
        json!(body.allowed_users.join(",")),
    );
    env.insert(
        "DISCORD_REPLY_TO_MODE".to_string(),
        json!(body.reply_to_mode),
    );
    env.insert("GATEWAY_ALLOW_ALL_USERS".to_string(), json!("false"));
    put_env_inner(&state, Value::Object(env)).await?;

    let config = json!({
        "discord": {
            "require_mention": body.require_mention,
            "allowed_channels": body.allowed_channels.join(","),
            "free_response_channels": "",
            "auto_thread": body.auto_thread,
            "reactions": body.reactions,
            "channel_prompts": body.channel_prompts,
        }
    });
    ensure_config_write_allowed(&config)?;
    dashboard_forward(&state, Method::PUT, "/api/config", None, Some(config)).await?;
    Ok(Json(json!({ "ok": true, "restart_required": true })))
}

async fn put_env_inner(state: &AppState, body: Value) -> Result<Value, AppError> {
    ensure_env_write_allowed(&body)?;
    dashboard_forward(state, Method::PUT, "/api/env", None, Some(body)).await
}

async fn discord_certify(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let status = dashboard_forward(&state, Method::GET, "/api/status", None, None)
        .await
        .unwrap_or_else(|_| json!({}));
    let logs = dashboard_forward(&state, Method::GET, "/api/logs", Some("limit=200"), None)
        .await
        .unwrap_or_else(|_| json!({}));
    Ok(Json(json!({
        "ok": status.pointer("/gateway_platforms/discord").is_some() || value_mentions(&logs, "discord"),
        "gateway_running": status.get("gateway_running"),
        "gateway_platforms": status.get("gateway_platforms"),
        "evidence": {
            "logsMentionDiscord": value_mentions(&logs, "discord")
        },
        "manualStep": "Mention Hermes in the selected Local AI Club channel, then run certification again."
    })))
}

fn value_mentions(value: &Value, needle: &str) -> bool {
    value.to_string().to_ascii_lowercase().contains(needle)
}

fn bluebubbles_discovery_payload(
    mac_bridge_host: Option<String>,
    bluebubbles_host: Option<String>,
    has_password: bool,
) -> Value {
    let hermes_mapping_host = bluebubbles_host.clone().unwrap_or_default();
    json!({
        "macBridge": {
            "host": mac_bridge_host.clone().unwrap_or_default(),
            "configured": mac_bridge_host.is_some()
        },
        "bluebubbles": {
            "host": bluebubbles_host.clone().unwrap_or_default(),
            "configured": bluebubbles_host.is_some(),
            "passwordConfigured": has_password
        },
        "hermesMapping": {
            "BLUEBUBBLES_SERVER_URL": hermes_mapping_host,
            "BLUEBUBBLES_PASSWORD": has_password,
            "BLUEBUBBLES_ALLOW_ALL_USERS": false
        }
    })
}

async fn bluebubbles_discover(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let mac_bridge_host = configured_secret(&state, "MAC_BRIDGE_HOST");
    let bluebubbles_host = configured_secret(&state, "BLUEBUBBLES_HOST");
    let has_password = state
        .secret("BLUEBUBBLES_PASSWORD")
        .map(|value| !value.trim().is_empty())
        .unwrap_or(false);
    Ok(Json(bluebubbles_discovery_payload(
        mac_bridge_host,
        bluebubbles_host,
        has_password,
    )))
}

#[derive(Debug, Deserialize)]
struct BlueBubblesTestBody {
    #[serde(default)]
    host: String,
    #[serde(default)]
    password: String,
}

async fn bluebubbles_test(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Json(body): Json<BlueBubblesTestBody>,
) -> Result<Json<Value>, AppError> {
    let host = body
        .host
        .trim()
        .trim_end_matches('/')
        .to_string()
        .or_else_nonempty(|| state.secret("BLUEBUBBLES_HOST").unwrap_or_default());
    let password = body
        .password
        .trim()
        .to_string()
        .or_else_nonempty(|| state.secret("BLUEBUBBLES_PASSWORD").unwrap_or_default());
    if host.is_empty() || password.is_empty() {
        return Err(AppError::BadRequest(
            "BlueBubbles host and password are required".into(),
        ));
    }
    let url = format!(
        "{host}/api/v1/ping?password={}",
        urlencoding::encode(&password)
    );
    let res = state
        .http
        .get(url)
        .timeout(Duration::from_secs(8))
        .send()
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("BlueBubbles request failed: {e}")))?;
    Ok(Json(
        json!({ "ok": res.status().is_success(), "status": res.status().as_u16() }),
    ))
}

#[derive(Debug, Deserialize)]
struct BlueBubblesSaveBody {
    #[serde(default)]
    host: String,
    #[serde(default)]
    password: String,
    #[serde(rename = "allowedUsers", default)]
    allowed_users: Vec<String>,
}

async fn bluebubbles_save(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Json(body): Json<BlueBubblesSaveBody>,
) -> Result<Json<Value>, AppError> {
    let host = body
        .host
        .trim()
        .trim_end_matches('/')
        .to_string()
        .or_else_nonempty(|| configured_secret(&state, "BLUEBUBBLES_HOST").unwrap_or_default());
    let password = body
        .password
        .trim()
        .to_string()
        .or_else_nonempty(|| state.secret("BLUEBUBBLES_PASSWORD").unwrap_or_default());
    if host.is_empty() {
        return Err(AppError::BadRequest(
            "BlueBubbles host is required before saving Hermes Agent iMessage setup".into(),
        ));
    }
    let mut env = Map::new();
    env.insert("BLUEBUBBLES_SERVER_URL".to_string(), json!(host));
    if !password.is_empty() {
        env.insert("BLUEBUBBLES_PASSWORD".to_string(), json!(password));
    }
    env.insert(
        "BLUEBUBBLES_ALLOWED_USERS".to_string(),
        json!(body.allowed_users.join(",")),
    );
    env.insert("BLUEBUBBLES_ALLOW_ALL_USERS".to_string(), json!("false"));
    env.insert("GATEWAY_ALLOW_ALL_USERS".to_string(), json!("false"));
    put_env_inner(&state, Value::Object(env)).await?;
    Ok(Json(json!({ "ok": true, "restart_required": true })))
}

async fn bluebubbles_certify(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let status = dashboard_forward(&state, Method::GET, "/api/status", None, None)
        .await
        .unwrap_or_else(|_| json!({}));
    let env = dashboard_forward(&state, Method::GET, "/api/env", None, None)
        .await
        .unwrap_or_else(|_| json!({}));
    Ok(Json(json!({
        "ok": env.pointer("/BLUEBUBBLES_SERVER_URL/is_set").and_then(Value::as_bool).unwrap_or(false),
        "gateway_running": status.get("gateway_running"),
        "gateway_platforms": status.get("gateway_platforms"),
        "manualStep": "Send a test message in the selected iMessage group, then verify it appears in Messages and Hermes logs."
    })))
}

async fn matrix_audit(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let env = dashboard_forward(&state, Method::GET, "/api/env", None, None)
        .await
        .unwrap_or_else(|_| json!({}));
    let keys = [
        "MATRIX_HOMESERVER",
        "MATRIX_ACCESS_TOKEN",
        "MATRIX_USER_ID",
        "MATRIX_ALLOWED_USERS",
        "MATRIX_REQUIRE_MENTION",
        "MATRIX_FREE_RESPONSE_ROOMS",
        "MATRIX_AUTO_THREAD",
        "MATRIX_DEVICE_ID",
        "MATRIX_RECOVERY_KEY",
    ];
    let active = keys
        .iter()
        .filter(|key| {
            env.get(**key)
                .and_then(|value| value.get("is_set"))
                .and_then(Value::as_bool)
                .unwrap_or(false)
        })
        .copied()
        .collect::<Vec<_>>();
    Ok(Json(json!({
        "status": if active.is_empty() { "retired" } else { "configured" },
        "activeKeys": active,
        "message": "Matrix is retired for ClawControl; Discord is the target platform."
    })))
}

async fn matrix_disable(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let body = json!({
        "keys": [
            "MATRIX_HOMESERVER",
            "MATRIX_ACCESS_TOKEN",
            "MATRIX_USER_ID",
            "MATRIX_ALLOWED_USERS",
            "MATRIX_REQUIRE_MENTION",
            "MATRIX_FREE_RESPONSE_ROOMS",
            "MATRIX_AUTO_THREAD",
            "MATRIX_DEVICE_ID",
            "MATRIX_RECOVERY_KEY"
        ]
    });
    ensure_env_write_allowed(&body)?;
    dashboard_forward(&state, Method::DELETE, "/api/env", None, Some(body)).await?;
    Ok(Json(json!({ "ok": true, "restart_required": true })))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_dashboard_token() {
        let html = r#"<script>window.__HERMES_SESSION_TOKEN__="abc123"</script>"#;
        assert_eq!(extract_dashboard_token(html).as_deref(), Some("abc123"));
    }

    #[test]
    fn rejects_unknown_env_keys() {
        assert!(ensure_env_write_allowed(&json!({"DISCORD_ALLOWED_USERS": "1"})).is_ok());
        assert!(ensure_env_write_allowed(&json!({"UNKNOWN": "1"})).is_err());
    }

    #[test]
    fn rejects_unknown_config_keys() {
        assert!(
            ensure_config_write_allowed(&json!({"discord": {"require_mention": true}})).is_ok()
        );
        assert!(ensure_config_write_allowed(&json!({"terminal": {"cwd": "/"}})).is_err());
    }

    #[test]
    fn redacts_secret_values() {
        let value = redact_value(json!({"token": "abc", "nested": {"api_key": "def"}, "ok": true}));
        assert_eq!(value["token"], "[redacted]");
        assert_eq!(value["nested"]["api_key"], "[redacted]");
        assert_eq!(value["ok"], true);
    }

    #[test]
    fn infra_node_marks_missing_urls_unconfigured_without_fake_defaults() {
        let node = configured_infra_node("hermes-api", "Hermes compat API", None, &[]);

        assert_eq!(node["url"], "");
        assert_eq!(node["configured"], false);
        assert_eq!(node["peer_hostname"], Value::Null);
        assert_eq!(node["peer_verified"], Value::Null);
    }

    #[test]
    fn infra_node_verifies_configured_tailscale_urls() {
        let peers = vec![TailscalePeer {
            ip: "100.104.154.24".to_string(),
            hostname: "agent-vm".to_string(),
            online: true,
        }];
        let node = configured_infra_node(
            "hermes-api",
            "Hermes compat API",
            Some("http://100.104.154.24:3939".to_string()),
            &peers,
        );

        assert_eq!(node["configured"], true);
        assert_eq!(node["peer_hostname"], "agent-vm");
    }

    #[test]
    fn bluebubbles_discovery_marks_missing_hosts_unconfigured() {
        let payload = bluebubbles_discovery_payload(None, None, false);

        assert_eq!(payload["macBridge"]["host"], "");
        assert_eq!(payload["macBridge"]["configured"], false);
        assert_eq!(payload["bluebubbles"]["host"], "");
        assert_eq!(payload["bluebubbles"]["configured"], false);
        assert_eq!(payload["hermesMapping"]["BLUEBUBBLES_SERVER_URL"], "");
    }
}
