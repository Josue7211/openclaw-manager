use axum::extract::State;
use axum::routing::{get, post};
use axum::{Json, Router};
use reqwest::Method;
use serde_json::{json, Value};

use crate::error::AppError;
use crate::server::{AppState, RequireAuth};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/agent-shell/health", get(get_health))
        .route("/agent-shell/sessions/plan", post(plan_session))
        .route("/agent-shell/sessions/dispatch", post(dispatch_session))
        .route("/agent-shell/approvals/plan", post(plan_approval))
        .route("/agent-shell/approvals/dispatch", post(dispatch_approval))
}

fn agent_shell_base_url(state: &AppState) -> Option<String> {
    state.secret("AGENTSHELL_URL").filter(|s| !s.is_empty())
}

async fn get_health(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let Some(base) = agent_shell_base_url(&state) else {
        return Ok(Json(json!({ "ok": false, "status": "not_configured" })));
    };

    let url = format!("{}/healthz", base.trim_end_matches('/'));
    match state
        .http
        .get(&url)
        .timeout(std::time::Duration::from_secs(5))
        .send()
        .await
    {
        Ok(resp) if resp.status().is_success() => {
            Ok(Json(json!({ "ok": true, "status": "connected" })))
        }
        Ok(resp) => Ok(Json(json!({
            "ok": false,
            "status": "error",
            "error": format!("HTTP {}", resp.status().as_u16())
        }))),
        Err(err) => Ok(Json(json!({
            "ok": false,
            "status": "unreachable",
            "error": if err.is_timeout() { "timed out" } else { "connection failed" }
        }))),
    }
}

async fn plan_session(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, AppError> {
    proxy_json(&state, Method::POST, "/v1/sessions/plan", payload).await
}

async fn dispatch_session(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, AppError> {
    proxy_json(&state, Method::POST, "/v1/sessions", payload).await
}

async fn plan_approval(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, AppError> {
    proxy_json(&state, Method::POST, "/v1/approvals/plan", payload).await
}

async fn dispatch_approval(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, AppError> {
    proxy_json(&state, Method::POST, "/v1/approvals", payload).await
}

async fn proxy_json(
    state: &AppState,
    method: Method,
    path: &str,
    payload: Value,
) -> Result<Json<Value>, AppError> {
    let Some(base) = agent_shell_base_url(state) else {
        return Err(AppError::BadRequest(
            "AgentShell is not configured. Set AGENTSHELL_URL in Settings > Connections.".into(),
        ));
    };

    let url = format!("{}{}", base.trim_end_matches('/'), path);
    let resp = state
        .http
        .request(method, &url)
        .json(&payload)
        .timeout(std::time::Duration::from_secs(30))
        .send()
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("AgentShell request failed: {e}")))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(AppError::BadRequest(format!(
            "AgentShell returned HTTP {}: {}",
            status.as_u16(),
            body
        )));
    }

    let value = resp.json::<Value>().await.map_err(|e| {
        AppError::Internal(anyhow::anyhow!("AgentShell response parse failed: {e}"))
    })?;

    Ok(Json(value))
}
