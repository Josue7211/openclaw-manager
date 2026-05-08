use axum::Json;
use reqwest::header::{HeaderMap, HeaderValue};
use serde::Serialize;
use serde_json::{json, Value};

use crate::error::AppError;
use crate::server::AppState;

pub fn secret_broker_base_url(state: &AppState) -> Option<String> {
    state
        .secret("AGENTSECRETS_URL")
        .and_then(|value| normalize_secret_broker_base_url(&value))
}

pub(crate) fn normalize_secret_broker_base_url(value: &str) -> Option<String> {
    let trimmed = value.trim().trim_end_matches('/');
    let is_http = trimmed.starts_with("http://") || trimmed.starts_with("https://");
    if !is_http || trimmed.is_empty() {
        return None;
    }

    Some(trimmed.to_string())
}

fn secret_broker_client_key(state: &AppState) -> Option<String> {
    state
        .secret("AGENTSECRETS_CLIENT_API_KEY")
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn broker_headers(state: &AppState) -> Result<HeaderMap, AppError> {
    let client_key = secret_broker_client_key(state).ok_or_else(|| {
        AppError::BadRequest(
            "Agent Secrets client key is not configured. Set AGENTSECRETS_CLIENT_API_KEY on the backend."
                .into(),
        )
    })?;

    let mut headers = HeaderMap::new();
    let auth_value = HeaderValue::from_str(&format!("Bearer {client_key}"))
        .map_err(|e| AppError::Internal(anyhow::anyhow!("invalid Agent Secrets API key: {e}")))?;
    headers.insert(reqwest::header::AUTHORIZATION, auth_value);
    Ok(headers)
}

pub async fn health(state: &AppState) -> Result<Json<Value>, AppError> {
    let Some(base) = secret_broker_base_url(state) else {
        return Ok(Json(json!({ "ok": false, "status": "not_configured" })));
    };

    let url = format!("{}/healthz", base.trim_end_matches('/'));
    let mut req = state
        .http
        .get(&url)
        .timeout(std::time::Duration::from_secs(5));
    if let Ok(headers) = broker_headers(state) {
        req = req.headers(headers);
    }

    match req.send().await {
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
    let Some(base) = secret_broker_base_url(state) else {
        return Err(AppError::BadRequest(
            "Agent Secrets is not configured. Set AGENTSECRETS_URL on the backend.".into(),
        ));
    };
    let headers = broker_headers(state)?;

    let url = format!("{}{}", base.trim_end_matches('/'), path);
    let resp = state
        .http
        .request(method, &url)
        .headers(headers)
        .json(payload)
        .timeout(std::time::Duration::from_secs(30))
        .send()
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Agent Secrets request failed: {e}")))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(AppError::BadRequest(format!(
            "Agent Secrets returned HTTP {}: {}",
            status.as_u16(),
            body
        )));
    }

    let value = resp.json::<Value>().await.map_err(|e| {
        AppError::Internal(anyhow::anyhow!("Agent Secrets response parse failed: {e}"))
    })?;

    Ok(Json(value))
}
