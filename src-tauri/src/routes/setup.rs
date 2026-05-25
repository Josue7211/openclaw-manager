use axum::{
    extract::{Json as ExtractJson, State},
    http::{header::HOST, HeaderMap, StatusCode},
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::{Digest, Sha256};
use subtle::ConstantTimeEq;
use tracing::warn;

use crate::server::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/setup/status", get(get_setup_status))
        .route("/setup/pair", post(post_pair))
}

#[derive(Debug, Serialize)]
struct SetupStatusResponse {
    ok: bool,
    backend_public_base_url: String,
    pairing_required: bool,
    capabilities: SetupCapabilities,
    services: SetupServices,
    missing: Vec<String>,
}

#[derive(Debug, Serialize)]
struct SetupCapabilities {
    google_oauth: bool,
    github_oauth: bool,
    harness: bool,
    agentsecrets: bool,
    memd: bool,
    bluebubbles: bool,
    mac_bridge: bool,
}

#[derive(Debug, Serialize)]
struct SetupServices {
    supabase: SetupServiceState,
    harness: SetupServiceState,
    agentsecrets: SetupServiceState,
    memd: SetupServiceState,
    bluebubbles: SetupServiceState,
    mac_bridge: SetupServiceState,
}

#[derive(Debug, Serialize)]
struct SetupServiceState {
    configured: bool,
    reachable: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    auth_configured: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    auth_valid: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    auth_source: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    checked_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    message: Option<String>,
}

impl SetupServiceState {
    fn simple(configured: bool, reachable: bool) -> Self {
        Self {
            configured,
            reachable,
            status: None,
            auth_configured: None,
            auth_valid: None,
            auth_source: None,
            checked_path: None,
            message: None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum HarnessAuthSource {
    ApiKey,
    PasswordFallback,
    Missing,
}

impl HarnessAuthSource {
    fn as_str(self) -> &'static str {
        match self {
            Self::ApiKey => "api_key",
            Self::PasswordFallback => "password_fallback",
            Self::Missing => "missing",
        }
    }
}

struct HarnessAuth {
    key: String,
    source: HarnessAuthSource,
}

#[derive(Debug, Clone, Copy)]
struct HarnessHealth {
    reachable: bool,
    status: &'static str,
    auth_valid: bool,
    checked_path: Option<&'static str>,
    message: &'static str,
}

#[derive(Debug, Deserialize)]
struct PairRequest {
    token: String,
    #[serde(rename = "deviceName", default)]
    device_name: Option<String>,
    #[serde(rename = "deviceId", default)]
    device_id: Option<String>,
}

#[derive(Debug, Serialize)]
struct PairResponse {
    ok: bool,
    paired: bool,
    device_name: Option<String>,
    #[serde(rename = "deviceApiKey")]
    device_api_key: Option<String>,
    next: Vec<String>,
}

async fn get_setup_status(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Json<SetupStatusResponse> {
    let supabase_url = state.secret_or_default("SUPABASE_URL");
    let supabase_reachability_key = state
        .secret_first(&[
            "SUPABASE_ANON_KEY",
            "VITE_SUPABASE_ANON_KEY",
            "SUPABASE_SERVICE_ROLE_KEY",
        ])
        .unwrap_or_default();
    let harness_url = state
        .secret_first(&["HERMES_API_URL", "HARNESS_API_URL", "OPENCLAW_API_URL"])
        .unwrap_or_default();
    let bluebubbles_host = state.secret_or_default("BLUEBUBBLES_HOST");
    let bluebubbles_password = state.secret_or_default("BLUEBUBBLES_PASSWORD");
    let mac_bridge_host = state.secret_or_default("MAC_BRIDGE_HOST");
    let mac_bridge_key = state.secret_or_default("MAC_BRIDGE_API_KEY");
    let harness_auth = harness_auth(&state);
    let agentsecrets_health = crate::routes::secret_broker_support::health_status(&state).await;
    let agentsecrets_configured = !matches!(
        agentsecrets_health.status.as_str(),
        "not_configured" | "auth_missing"
    );

    let supabase_configured = !supabase_url.is_empty() && !supabase_reachability_key.is_empty();
    let supabase_reachable = if supabase_configured {
        crate::sync::is_supabase_reachable(&supabase_url, &supabase_reachability_key).await
    } else {
        false
    };

    let harness_configured = !harness_url.is_empty();
    let bluebubbles_configured = !bluebubbles_host.trim().is_empty();
    let mac_bridge_configured = !mac_bridge_host.trim().is_empty();
    let harness_health = if harness_configured {
        harness_health(&state, &harness_url, &harness_auth.key).await
    } else {
        HarnessHealth {
            reachable: false,
            status: "not_configured",
            auth_valid: false,
            checked_path: None,
            message: "Hermes Agent URL is not configured.",
        }
    };
    let (bluebubbles_reachable, bluebubbles_status, bluebubbles_message) =
        bluebubbles_health(&state, &bluebubbles_host, &bluebubbles_password).await;
    let (mac_bridge_reachable, mac_bridge_status, mac_bridge_message) =
        mac_bridge_health(&state, &mac_bridge_host, &mac_bridge_key).await;
    let mut missing = Vec::new();
    if !supabase_configured {
        missing.push("supabase".to_string());
    }
    if !harness_configured {
        missing.push("harness".to_string());
    } else if !harness_health.auth_valid {
        missing.push("harness_auth".to_string());
    }
    if !agentsecrets_configured {
        missing.push("agentsecrets".to_string());
    }

    Json(SetupStatusResponse {
        ok: true,
        backend_public_base_url: backend_public_base_url(&state, &headers),
        pairing_required: !pairing_token(&state).is_empty(),
        capabilities: SetupCapabilities {
            google_oauth: env_or_secret_bool(&state, "GOTRUE_EXTERNAL_GOOGLE_ENABLED"),
            github_oauth: env_or_secret_bool(&state, "GOTRUE_EXTERNAL_GITHUB_ENABLED"),
            harness: harness_configured,
            agentsecrets: agentsecrets_configured,
            memd: true,
            bluebubbles: bluebubbles_configured,
            mac_bridge: mac_bridge_configured,
        },
        services: SetupServices {
            supabase: SetupServiceState::simple(supabase_configured, supabase_reachable),
            harness: SetupServiceState {
                configured: harness_configured,
                reachable: harness_health.reachable,
                status: Some(harness_health.status.into()),
                auth_configured: Some(harness_auth.source != HarnessAuthSource::Missing),
                auth_valid: Some(harness_health.auth_valid),
                auth_source: Some(harness_auth.source.as_str().into()),
                checked_path: harness_health.checked_path.map(str::to_string),
                message: Some(harness_health.message.into()),
            },
            agentsecrets: SetupServiceState {
                configured: agentsecrets_configured,
                reachable: agentsecrets_health.ok,
                status: Some(agentsecrets_health.status),
                auth_configured: Some(agentsecrets_configured),
                auth_valid: Some(agentsecrets_health.ok),
                auth_source: Some("client_api_key".into()),
                checked_path: Some("/healthz".into()),
                message: agentsecrets_health.message,
            },
            memd: SetupServiceState::simple(true, true),
            bluebubbles: SetupServiceState {
                configured: bluebubbles_configured,
                reachable: bluebubbles_reachable,
                status: Some(bluebubbles_status.into()),
                auth_configured: Some(!bluebubbles_password.trim().is_empty()),
                auth_valid: Some(bluebubbles_reachable),
                auth_source: Some("password".into()),
                checked_path: Some("/api/v1/ping".into()),
                message: Some(bluebubbles_message.into()),
            },
            mac_bridge: SetupServiceState {
                configured: mac_bridge_configured,
                reachable: mac_bridge_reachable,
                status: Some(mac_bridge_status.into()),
                auth_configured: Some(!mac_bridge_key.trim().is_empty()),
                auth_valid: Some(mac_bridge_reachable),
                auth_source: Some("api_key".into()),
                checked_path: Some("/health".into()),
                message: Some(mac_bridge_message.into()),
            },
        },
        missing,
    })
}

async fn bluebubbles_health(
    state: &AppState,
    host: &str,
    password: &str,
) -> (bool, &'static str, &'static str) {
    if host.trim().is_empty() {
        return (
            false,
            "not_configured",
            "BlueBubbles host is not configured.",
        );
    }
    if password.trim().is_empty() {
        return (
            false,
            "auth_missing",
            "BlueBubbles password is not configured.",
        );
    }

    let url = format!(
        "{}/api/v1/ping?password={}",
        host.trim_end_matches('/'),
        urlencoding::encode(password)
    );
    match state
        .http
        .get(&url)
        .timeout(std::time::Duration::from_secs(5))
        .send()
        .await
    {
        Ok(resp) if resp.status().is_success() => (true, "connected", "BlueBubbles ping passed."),
        Ok(resp) if resp.status().as_u16() == 401 || resp.status().as_u16() == 403 => (
            false,
            "auth_invalid",
            "BlueBubbles rejected the configured password.",
        ),
        Ok(_) => (
            false,
            "unreachable",
            "BlueBubbles returned an unexpected status.",
        ),
        Err(_) => (
            false,
            "unreachable",
            "BlueBubbles could not be reached at the configured host.",
        ),
    }
}

async fn mac_bridge_health(
    state: &AppState,
    host: &str,
    api_key: &str,
) -> (bool, &'static str, &'static str) {
    if host.trim().is_empty() {
        return (
            false,
            "not_configured",
            "Mac Bridge host is not configured.",
        );
    }

    let url = format!("{}/health", host.trim_end_matches('/'));
    let mut req = state
        .http
        .get(&url)
        .timeout(std::time::Duration::from_secs(5));
    if !api_key.trim().is_empty() {
        req = req.header("X-API-Key", api_key);
    }

    match req.send().await {
        Ok(resp) if resp.status().is_success() => (true, "connected", "Mac Bridge health passed."),
        Ok(resp) if resp.status().as_u16() == 401 || resp.status().as_u16() == 403 => (
            false,
            "auth_invalid",
            "Mac Bridge rejected the configured API key.",
        ),
        Ok(_) => (
            false,
            "unreachable",
            "Mac Bridge returned an unexpected status.",
        ),
        Err(_) => (
            false,
            "unreachable",
            "Mac Bridge could not be reached at the configured host.",
        ),
    }
}

async fn post_pair(
    State(state): State<AppState>,
    ExtractJson(payload): ExtractJson<PairRequest>,
) -> Result<Json<PairResponse>, (StatusCode, Json<serde_json::Value>)> {
    let expected = pairing_token(&state);
    if expected.is_empty() {
        return Ok(Json(PairResponse {
            ok: true,
            paired: true,
            device_name: payload.device_name,
            device_api_key: None,
            next: vec!["pairing_not_required".to_string()],
        }));
    }

    let provided = payload.token.trim();
    if provided.len() != expected.len()
        || !bool::from(provided.as_bytes().ct_eq(expected.as_bytes()))
    {
        return Err((
            StatusCode::UNAUTHORIZED,
            Json(json!({
                "ok": false,
                "error": "invalid_pairing_token",
            })),
        ));
    }

    let device_id = payload
        .device_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            (
                StatusCode::BAD_REQUEST,
                Json(json!({
                    "ok": false,
                    "error": "device_id_required",
                })),
            )
        })?;

    let device_api_key = derive_device_api_key(&expected, device_id);

    Ok(Json(PairResponse {
        ok: true,
        paired: true,
        device_name: payload.device_name,
        device_api_key: Some(device_api_key),
        next: vec!["sign_in".to_string()],
    }))
}

fn harness_auth(state: &AppState) -> HarnessAuth {
    let api_key = state.secret_first(&["HERMES_API_KEY", "HARNESS_API_KEY", "OPENCLAW_API_KEY"]);
    if let Some(key) = api_key {
        return HarnessAuth {
            key,
            source: HarnessAuthSource::ApiKey,
        };
    }

    let password =
        state.secret_first(&["HERMES_PASSWORD", "HARNESS_PASSWORD", "OPENCLAW_PASSWORD"]);
    if let Some(key) = password {
        return HarnessAuth {
            key,
            source: HarnessAuthSource::PasswordFallback,
        };
    }

    HarnessAuth {
        key: String::new(),
        source: HarnessAuthSource::Missing,
    }
}

async fn harness_health(state: &AppState, base_url: &str, api_key: &str) -> HarnessHealth {
    if api_key.trim().is_empty() {
        return HarnessHealth {
            reachable: false,
            status: "auth_missing",
            auth_valid: false,
            checked_path: Some("/sessions"),
            message: "Hermes Agent auth is missing. Public health is not enough for agents, chat, or approvals.",
        };
    }

    for path in ["/sessions", "/files"] {
        let url = format!("{}{}", base_url.trim_end_matches('/'), path);
        let req = state
            .http
            .get(&url)
            .timeout(std::time::Duration::from_secs(5))
            .header("Authorization", format!("Bearer {api_key}"));

        match req.send().await {
            Ok(resp) if resp.status().is_success() => {
                return HarnessHealth {
                    reachable: true,
                    status: "connected",
                    auth_valid: true,
                    checked_path: Some(path),
                    message: "Authenticated Hermes Agent preflight passed.",
                }
            }
            Ok(resp) if resp.status().as_u16() == 404 => continue,
            Ok(resp) if resp.status().as_u16() == 401 || resp.status().as_u16() == 403 => {
                return HarnessHealth {
                    reachable: false,
                    status: "auth_invalid",
                    auth_valid: false,
                    checked_path: Some(path),
                    message: "Hermes Agent rejected the configured auth token.",
                }
            }
            Ok(resp) => {
                warn!(
                    harness_url = %base_url,
                    path = path,
                    status = resp.status().as_u16(),
                    "harness health check returned non-success"
                );
                return HarnessHealth {
                    reachable: false,
                    status: "unreachable",
                    auth_valid: false,
                    checked_path: Some(path),
                    message: "Authenticated harness preflight returned an unexpected status.",
                };
            }
            Err(err) => {
                warn!(
                    harness_url = %base_url,
                    path = path,
                    error = %err,
                    is_timeout = err.is_timeout(),
                    is_connect = err.is_connect(),
                    "harness health check failed"
                );
                return HarnessHealth {
                    reachable: false,
                    status: "unreachable",
                    auth_valid: false,
                    checked_path: Some(path),
                    message: "Authenticated harness preflight could not reach the service.",
                };
            }
        }
    }

    HarnessHealth {
        reachable: false,
        status: "auth_probe_missing",
        auth_valid: false,
        checked_path: Some("/sessions"),
        message: "No authenticated harness capability route was available to verify.",
    }
}

fn backend_public_base_url(state: &AppState, headers: &HeaderMap) -> String {
    let forwarded_proto = headers
        .get("x-forwarded-proto")
        .and_then(|value| value.to_str().ok())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("http");
    let host = headers
        .get("x-forwarded-host")
        .or_else(|| headers.get(HOST))
        .and_then(|value| value.to_str().ok())
        .map(str::trim)
        .filter(|value| !value.is_empty());

    if let Some(host) = host {
        if host.starts_with("127.0.0.1:") || host.starts_with("localhost:") {
            return format!("{forwarded_proto}://{host}");
        }
    }

    if let Some(value) = state
        .secret("BACKEND_PUBLIC_BASE_URL")
        .map(|value| value.trim().trim_end_matches('/').to_string())
        .filter(|value| !value.is_empty())
    {
        return value;
    }

    match host {
        Some(host) => format!("{forwarded_proto}://{host}"),
        _ => "http://127.0.0.1:5000".to_string(),
    }
}

fn pairing_token(state: &AppState) -> String {
    state.secret("PAIRING_TOKEN").unwrap_or_default()
}

fn env_or_secret_bool(state: &AppState, key: &str) -> bool {
    state
        .secret(key)
        .map(|value| matches!(value.as_str(), "1" | "true" | "TRUE" | "True"))
        .unwrap_or(false)
}

pub(crate) fn derive_device_api_key(pairing_token: &str, device_id: &str) -> String {
    let normalized_device_id = device_id.trim();
    let mut hasher = Sha256::new();
    hasher.update(b"clawctrl-device-key-v1:");
    hasher.update(pairing_token.as_bytes());
    hasher.update(b":");
    hasher.update(normalized_device_id.as_bytes());
    let signature = hex::encode(hasher.finalize());
    format!("ccd_v1.{}.{}", normalized_device_id, signature)
}

pub(crate) fn matches_device_api_key(pairing_token: &str, candidate: &str) -> bool {
    let Some(rest) = candidate.strip_prefix("ccd_v1.") else {
        return false;
    };
    let Some((device_id, _sig)) = rest.split_once('.') else {
        return false;
    };
    let expected = derive_device_api_key(pairing_token, device_id);
    candidate.as_bytes().ct_eq(expected.as_bytes()).into()
}
