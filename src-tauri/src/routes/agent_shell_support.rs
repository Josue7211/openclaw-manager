use axum::Json;
use serde::Serialize;
use serde_json::{json, Value};

use crate::error::AppError;
use crate::server::AppState;

pub fn agent_shell_base_url(state: &AppState) -> Option<String> {
    state
        .secret("AGENTSHELL_URL")
        .and_then(|value| normalize_agent_shell_base_url(&value))
}

pub(crate) fn normalize_agent_shell_base_url(value: &str) -> Option<String> {
    let trimmed = value.trim().trim_end_matches('/');
    let is_http = trimmed.starts_with("http://") || trimmed.starts_with("https://");
    if !is_http || trimmed.is_empty() {
        return None;
    }

    Some(trimmed.to_string())
}

pub async fn health(state: &AppState) -> Result<Json<Value>, AppError> {
    let Some(base) = agent_shell_base_url(state) else {
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

pub async fn proxy_json<T: Serialize>(
    state: &AppState,
    method: reqwest::Method,
    path: &str,
    payload: &T,
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
        .json(payload)
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
