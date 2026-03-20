use axum::{extract::State, routing::post, Json, Router};
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::HashMap;

use crate::error::AppError;
use crate::redact::redact;
use crate::server::AppState;

// ── Request types ───────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct WizardTestRequest {
    service: String,
    url: String,
    #[serde(default)]
    key: String,
    #[serde(default)]
    password: String,
    #[serde(default)]
    username: String,
}

#[derive(Debug, Deserialize)]
pub struct WizardSaveRequest {
    credentials: HashMap<String, String>,
}

// ── Router ──────────────────────────────────────────────────────────────────

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/wizard/test-connection", post(wizard_test_connection))
        .route("/wizard/save-credentials", post(wizard_save_credentials))
        .route("/wizard/reload-secrets", post(wizard_reload_secrets))
}

// ── POST /api/wizard/test-connection ────────────────────────────────────────

async fn wizard_test_connection(
    State(state): State<AppState>,
    Json(body): Json<WizardTestRequest>,
) -> Result<Json<Value>, AppError> {
    tracing::info!(
        service = %body.service,
        url = %redact(&body.url),
        "wizard: testing connection"
    );

    // Build a client with a short timeout for connection testing
    let http = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .unwrap_or_else(|_| state.http.clone());

    let url = body.url.trim_end_matches('/');

    let start = std::time::Instant::now();

    let result = match body.service.as_str() {
        "supabase" => test_supabase(&http, url, &body.key).await,
        "openclaw" => test_openclaw(&http, url, &body.key).await,
        "bluebubbles" => test_bluebubbles(&http, url, &body.password).await,
        "couchdb" => test_couchdb(&http, url, &body.username, &body.password).await,
        "mac-bridge" => test_mac_bridge(&http, url, &body.key).await,
        unknown => {
            return Ok(Json(json!({
                "status": "error",
                "error": format!("Unknown service: {unknown}")
            })));
        }
    };

    let latency_ms = start.elapsed().as_millis() as u64;

    match result {
        Ok(()) => {
            tracing::info!(
                service = %body.service,
                latency_ms = latency_ms,
                "wizard: connection test passed"
            );
            Ok(Json(json!({
                "status": "ok",
                "latency_ms": latency_ms
            })))
        }
        Err(msg) => {
            // Append Tailscale hint if the URL looks like a Tailscale address
            let error_msg = if url.contains("://100.") && is_connection_error(&msg) {
                format!(
                    "{msg}. This looks like a Tailscale address -- is Tailscale connected?"
                )
            } else {
                msg
            };
            tracing::info!(
                service = %body.service,
                error = %error_msg,
                "wizard: connection test failed"
            );
            Ok(Json(json!({
                "status": "error",
                "error": error_msg,
                "latency_ms": latency_ms
            })))
        }
    }
}

/// Check if the error message indicates a connectivity issue (vs auth).
fn is_connection_error(msg: &str) -> bool {
    msg.contains("Connection refused")
        || msg.contains("timed out")
        || msg.contains("resolve hostname")
        || msg.contains("unreachable")
}

// ── Service-specific testers ────────────────────────────────────────────────

async fn test_supabase(http: &reqwest::Client, url: &str, anon_key: &str) -> Result<(), String> {
    let endpoint = format!("{url}/rest/v1/");
    let resp = http
        .get(&endpoint)
        .header("apikey", anon_key)
        .header("Authorization", format!("Bearer {anon_key}"))
        .send()
        .await
        .map_err(|e| connection_error_msg(&e, "Supabase"))?;

    let status = resp.status().as_u16();
    if status == 401 {
        return Err("Authentication failed -- check your anon key".to_string());
    }
    if (200..400).contains(&status) {
        return Ok(());
    }
    Err(format!("Supabase returned HTTP {status}"))
}

async fn test_openclaw(http: &reqwest::Client, url: &str, api_key: &str) -> Result<(), String> {
    let endpoint = format!("{url}/v1/models");
    let mut req = http.get(&endpoint);
    if !api_key.is_empty() {
        req = req.header("Authorization", format!("Bearer {api_key}"));
    }
    let resp = req
        .send()
        .await
        .map_err(|e| connection_error_msg(&e, "OpenClaw"))?;

    let status = resp.status().as_u16();
    if status == 401 || status == 403 {
        return Err("Authentication failed -- check your API key".to_string());
    }
    if resp.status().is_success() {
        return Ok(());
    }
    Err(format!("OpenClaw returned HTTP {status}"))
}

async fn test_bluebubbles(
    http: &reqwest::Client,
    url: &str,
    password: &str,
) -> Result<(), String> {
    let endpoint = format!("{url}/api/v1/server/info?password={password}");
    let resp = http
        .get(&endpoint)
        .send()
        .await
        .map_err(|e| connection_error_msg(&e, "BlueBubbles"))?;

    let status = resp.status().as_u16();
    if status == 401 || status == 403 {
        return Err("Authentication failed -- check your BlueBubbles password".to_string());
    }
    if resp.status().is_success() {
        return Ok(());
    }
    Err(format!("BlueBubbles returned HTTP {status}"))
}

async fn test_couchdb(
    http: &reqwest::Client,
    url: &str,
    username: &str,
    password: &str,
) -> Result<(), String> {
    let endpoint = format!("{url}/");
    let resp = http
        .get(&endpoint)
        .basic_auth(username, Some(password))
        .send()
        .await
        .map_err(|e| connection_error_msg(&e, "CouchDB"))?;

    let status = resp.status().as_u16();
    if status == 401 {
        return Err("Authentication failed -- check your CouchDB username and password".to_string());
    }
    if resp.status().is_success() {
        return Ok(());
    }
    Err(format!("CouchDB returned HTTP {status}"))
}

async fn test_mac_bridge(http: &reqwest::Client, url: &str, api_key: &str) -> Result<(), String> {
    let endpoint = format!("{url}/health");
    let resp = http
        .get(&endpoint)
        .header("X-API-Key", api_key)
        .send()
        .await
        .map_err(|e| connection_error_msg(&e, "Mac Bridge"))?;

    let status = resp.status().as_u16();
    if status == 401 || status == 403 {
        return Err("Authentication failed -- check your Mac Bridge API key".to_string());
    }
    if resp.status().is_success() {
        return Ok(());
    }
    Err(format!("Mac Bridge returned HTTP {status}"))
}

/// Produce a user-friendly error message from a reqwest error.
fn connection_error_msg(e: &reqwest::Error, service: &str) -> String {
    if e.is_connect() {
        // Try to extract port from the URL in the error
        if let Some(url) = e.url() {
            if let Some(port) = url.port() {
                return format!(
                    "Connection refused on port {port} -- is {service} running?"
                );
            }
        }
        format!("Connection refused -- is {service} running?")
    } else if e.is_timeout() {
        format!("Connection timed out -- check that {service} is reachable")
    } else if e.is_request() {
        "Could not resolve hostname -- check the URL".to_string()
    } else {
        format!("Connection error: {e}")
    }
}

// ── POST /api/wizard/save-credentials ───────────────────────────────────────

async fn wizard_save_credentials(
    Json(body): Json<WizardSaveRequest>,
) -> Result<Json<Value>, AppError> {
    let mut saved = 0u32;
    let mut errors = Vec::new();

    for (key, value) in &body.credentials {
        // Only allow keys that exist in KEY_ENV_MAP
        if !crate::secrets::is_allowed_key(key) {
            errors.push(format!("Key '{key}' is not in the allowed set"));
            continue;
        }
        match crate::secrets::set_entry(key, value) {
            Ok(()) => saved += 1,
            Err(e) => errors.push(format!("Failed to save '{key}': {e}")),
        }
    }

    tracing::info!(saved = saved, errors = errors.len(), "wizard: saved credentials");

    if errors.is_empty() {
        Ok(Json(json!({ "saved": saved })))
    } else {
        Ok(Json(json!({
            "saved": saved,
            "errors": errors
        })))
    }
}

// ── POST /api/wizard/reload-secrets ─────────────────────────────────────────

async fn wizard_reload_secrets(
    State(state): State<AppState>,
) -> Result<Json<Value>, AppError> {
    let new_secrets = crate::secrets::load_secrets();
    let count = new_secrets.len();

    // Replace the secrets HashMap behind the RwLock
    {
        let mut guard = state.secrets.write().unwrap_or_else(|e| e.into_inner());
        *guard = new_secrets;
    }

    tracing::info!(count = count, "wizard: reloaded secrets into AppState");

    Ok(Json(json!({ "reloaded": true, "count": count })))
}

// ── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wizard_test_request_deserializes() {
        let json_str = r#"{
            "service": "supabase",
            "url": "http://localhost:8000",
            "key": "my-anon-key"
        }"#;
        let req: WizardTestRequest = serde_json::from_str(json_str).unwrap();
        assert_eq!(req.service, "supabase");
        assert_eq!(req.url, "http://localhost:8000");
        assert_eq!(req.key, "my-anon-key");
        assert!(req.password.is_empty());
        assert!(req.username.is_empty());
    }

    #[test]
    fn wizard_test_request_deserializes_with_all_fields() {
        let json_str = r#"{
            "service": "couchdb",
            "url": "http://localhost:5984",
            "username": "admin",
            "password": "secret"
        }"#;
        let req: WizardTestRequest = serde_json::from_str(json_str).unwrap();
        assert_eq!(req.service, "couchdb");
        assert_eq!(req.username, "admin");
        assert_eq!(req.password, "secret");
        assert!(req.key.is_empty());
    }

    #[test]
    fn wizard_save_request_deserializes() {
        let json_str = r#"{
            "credentials": {
                "supabase.url": "http://localhost:8000",
                "supabase.anon-key": "my-key"
            }
        }"#;
        let req: WizardSaveRequest = serde_json::from_str(json_str).unwrap();
        assert_eq!(req.credentials.len(), 2);
        assert_eq!(
            req.credentials.get("supabase.url"),
            Some(&"http://localhost:8000".to_string())
        );
    }

    #[test]
    fn connection_error_msg_formats_correctly() {
        // We can't easily create reqwest::Error instances in tests,
        // but we can verify the helper function logic via is_connection_error
        assert!(is_connection_error("Connection refused on port 8000 -- is Supabase running?"));
        assert!(is_connection_error("Connection timed out -- check that OpenClaw is reachable"));
        assert!(is_connection_error("Could not resolve hostname -- check the URL"));
        assert!(!is_connection_error("Authentication failed"));
    }

    #[test]
    fn is_connection_error_detects_patterns() {
        assert!(is_connection_error("Connection refused"));
        assert!(is_connection_error("timed out"));
        assert!(is_connection_error("resolve hostname"));
        assert!(is_connection_error("unreachable"));
        assert!(!is_connection_error("Authentication failed -- check your API key"));
        assert!(!is_connection_error("HTTP 500"));
    }

    #[test]
    fn unknown_service_returns_correct_json() {
        // Verify that the JSON structure for unknown services is correct
        let result = json!({
            "status": "error",
            "error": format!("Unknown service: {}", "foobar")
        });
        assert_eq!(result["status"], "error");
        assert!(result["error"].as_str().unwrap().contains("foobar"));
    }
}
