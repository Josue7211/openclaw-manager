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
    openclaw: bool,
    agentsecrets: bool,
    memd: bool,
}

#[derive(Debug, Serialize)]
struct SetupServices {
    supabase: SetupServiceState,
    harness: SetupServiceState,
    openclaw: SetupServiceState,
    agentsecrets: SetupServiceState,
    memd: SetupServiceState,
}

#[derive(Debug, Serialize)]
struct SetupServiceState {
    configured: bool,
    reachable: bool,
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
    let supabase_service_key = state.secret_or_default("SUPABASE_SERVICE_ROLE_KEY");
    // The persisted key names are still OPENCLAW_* for compatibility with the
    // older API contract, but the active runtime may be Hermes behind that
    // compatibility layer. Expose it to setup as the product "harness".
    let harness_url = state.secret_or_default("OPENCLAW_API_URL");
    let harness_api_key = state.secret_or_default("OPENCLAW_API_KEY");
    let agentsecrets_url = state.secret_or_default("AGENTSECRETS_URL");
    let agentsecrets_key = state.secret_or_default("AGENTSECRETS_CLIENT_API_KEY");

    let supabase_configured = !supabase_url.is_empty() && !supabase_service_key.is_empty();
    let supabase_reachable = if supabase_configured {
        crate::sync::is_supabase_reachable(&supabase_url, &supabase_service_key).await
    } else {
        false
    };

    let harness_configured = !harness_url.is_empty();
    let harness_reachable = if harness_configured {
        harness_health(&state, &harness_url, &harness_api_key).await
    } else {
        false
    };
    let agentsecrets_configured = !agentsecrets_url.is_empty() && !agentsecrets_key.is_empty();
    let agentsecrets_reachable = if agentsecrets_configured {
        crate::routes::secret_broker_support::health(&state)
            .await
            .map(|value| {
                value
                    .0
                    .get("ok")
                    .and_then(|value| value.as_bool())
                    .unwrap_or(false)
            })
            .unwrap_or(false)
    } else {
        false
    };

    let mut missing = Vec::new();
    if !supabase_configured {
        missing.push("supabase".to_string());
    }
    if !harness_configured {
        missing.push("harness".to_string());
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
            openclaw: harness_configured,
            agentsecrets: agentsecrets_configured,
            memd: true,
        },
        services: SetupServices {
            supabase: SetupServiceState {
                configured: supabase_configured,
                reachable: supabase_reachable,
            },
            harness: SetupServiceState {
                configured: harness_configured,
                reachable: harness_reachable,
            },
            openclaw: SetupServiceState {
                configured: harness_configured,
                reachable: harness_reachable,
            },
            agentsecrets: SetupServiceState {
                configured: agentsecrets_configured,
                reachable: agentsecrets_reachable,
            },
            memd: SetupServiceState {
                configured: true,
                reachable: true,
            },
        },
        missing,
    })
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

async fn harness_health(state: &AppState, base_url: &str, api_key: &str) -> bool {
    let url = format!("{}/files", base_url.trim_end_matches('/'));
    let mut req = state
        .http
        .get(&url)
        .timeout(std::time::Duration::from_secs(5));
    if !api_key.is_empty() {
        req = req.header("Authorization", format!("Bearer {api_key}"));
    }

    match req.send().await {
        Ok(resp) if resp.status().is_success() => true,
        Ok(resp) => {
            warn!(
                harness_url = %base_url,
                status = resp.status().as_u16(),
                "harness health check returned non-success"
            );
            false
        }
        Err(err) => {
            warn!(
                harness_url = %base_url,
                error = %err,
                is_timeout = err.is_timeout(),
                is_connect = err.is_connect(),
                "harness health check failed"
            );
            false
        }
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
    hasher.update(b"clawcontrol-device-key-v1:");
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
