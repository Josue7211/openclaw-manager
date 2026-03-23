use axum::{
    body::Body,
    extract::{Path, Query, State},
    http::header,
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use serde::Deserialize;
use serde_json::{json, Value};
use std::sync::OnceLock;
use tokio::sync::Mutex;

use crate::error::AppError;
use crate::server::{AppState, RequireAuth};

// ── Config ──────────────────────────────────────────────────────────────────

struct KoelConfig {
    host: String,
    email: String,
    password: String,
}

fn koel_config(state: &AppState) -> Option<KoelConfig> {
    let host = state.secret_or_default("KOEL_HOST");
    if host.is_empty() {
        return None;
    }
    let email = state.secret_or_default("KOEL_EMAIL");
    if email.is_empty() {
        return None;
    }
    let password = state.secret_or_default("KOEL_PASSWORD");
    if password.is_empty() {
        return None;
    }
    Some(KoelConfig {
        host,
        email,
        password,
    })
}

fn not_configured_error() -> Json<Value> {
    Json(json!({
        "error": "not_configured",
        "message": "Set KOEL_HOST, KOEL_EMAIL, KOEL_PASSWORD in Settings -> Connections"
    }))
}

// ── Token management ────────────────────────────────────────────────────────

static TOKEN_CACHE: OnceLock<Mutex<Option<String>>> = OnceLock::new();

fn token_mutex() -> &'static Mutex<Option<String>> {
    TOKEN_CACHE.get_or_init(|| Mutex::new(None))
}

/// Authenticate with Koel and return a Sanctum bearer token.
async fn authenticate(state: &AppState, cfg: &KoelConfig) -> Result<String, AppError> {
    let res = state
        .http
        .post(format!("{}/api/me", cfg.host))
        .json(&json!({ "email": cfg.email, "password": cfg.password }))
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
        .map_err(|e| {
            tracing::error!("[koel] Authentication request failed: {e}");
            AppError::Internal(anyhow::anyhow!("Koel authentication failed: {e}"))
        })?;

    if !res.status().is_success() {
        let status = res.status();
        let text = res.text().await.unwrap_or_default();
        tracing::error!("[koel] Authentication returned {status}: {text}");
        return Err(AppError::Internal(anyhow::anyhow!(
            "Koel authentication returned {status}"
        )));
    }

    let body: Value = res.json().await.map_err(|e| {
        AppError::Internal(anyhow::anyhow!("Failed to parse Koel auth response: {e}"))
    })?;

    body["token"]
        .as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| AppError::Internal(anyhow::anyhow!("Koel auth response missing token field")))
}

/// Get a cached token or authenticate to obtain a new one.
async fn get_token(state: &AppState, cfg: &KoelConfig) -> Result<String, AppError> {
    let mutex = token_mutex();
    let mut guard = mutex.lock().await;

    if let Some(ref token) = *guard {
        return Ok(token.clone());
    }

    let token = authenticate(state, cfg).await?;
    *guard = Some(token.clone());
    Ok(token)
}

/// Clear the cached token (called on 401 to force re-authentication).
async fn clear_token() {
    let mutex = token_mutex();
    let mut guard = mutex.lock().await;
    *guard = None;
}

/// Make an authenticated request to Koel with automatic retry on 401.
async fn koel_request(
    state: &AppState,
    cfg: &KoelConfig,
    method: reqwest::Method,
    path: &str,
) -> Result<reqwest::Response, AppError> {
    let token = get_token(state, cfg).await?;
    let url = format!("{}{}", cfg.host, path);

    let res = state
        .http
        .request(method.clone(), &url)
        .bearer_auth(&token)
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
        .map_err(|e| {
            tracing::error!("[koel] Request to {path} failed: {e}");
            AppError::Internal(anyhow::anyhow!("Koel request failed: {e}"))
        })?;

    // On 401: clear token, re-authenticate, and retry once
    if res.status() == reqwest::StatusCode::UNAUTHORIZED {
        tracing::info!("[koel] Got 401, re-authenticating...");
        clear_token().await;
        let new_token = get_token(state, cfg).await?;

        return state
            .http
            .request(method, &url)
            .bearer_auth(&new_token)
            .timeout(std::time::Duration::from_secs(10))
            .send()
            .await
            .map_err(|e| {
                tracing::error!("[koel] Retry request to {path} failed: {e}");
                AppError::Internal(anyhow::anyhow!("Koel retry request failed: {e}"))
            });
    }

    Ok(res)
}

// ── Handlers ────────────────────────────────────────────────────────────────

/// GET /koel/health — Check if Koel backend is configured and reachable.
async fn health(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let host = match state.secret("KOEL_HOST") {
        Some(h) if !h.is_empty() => h,
        _ => {
            return Ok(Json(json!({
                "status": "not_configured",
                "message": "Set KOEL_HOST in Settings -> Connections"
            })));
        }
    };

    match state
        .http
        .get(format!("{host}/api/ping"))
        .timeout(std::time::Duration::from_secs(5))
        .send()
        .await
    {
        Ok(res) if res.status().is_success() => {
            Ok(Json(json!({ "status": "ok", "host": host })))
        }
        Ok(res) => Ok(Json(json!({
            "status": "error",
            "host": host,
            "code": res.status().as_u16()
        }))),
        Err(_) => Ok(Json(json!({
            "status": "unreachable",
            "host": host
        }))),
    }
}

/// GET /koel/now-playing — Proxy the now-playing endpoint.
async fn now_playing(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let cfg = match koel_config(&state) {
        Some(c) => c,
        None => return Ok(not_configured_error()),
    };

    let res = match koel_request(&state, &cfg, reqwest::Method::GET, "/api/v2/now-playing").await {
        Ok(r) => r,
        Err(_) => {
            return Ok(Json(json!({
                "error": "koel_unavailable",
                "message": "Music service is offline"
            })));
        }
    };

    let mut body: Value = res.json().await.unwrap_or(json!({ "data": null }));

    // Rewrite album_art URL to use the proxy endpoint
    if let Some(data) = body.get_mut("data") {
        if let Some(art) = data.get("album_art").and_then(|v| v.as_str()) {
            if !art.is_empty() {
                // Extract album ID from the art URL if possible, or use the raw path
                data["album_art_proxy"] = json!(format!("/api/koel/album-art/proxy?url={}", art));
            }
        }
    }

    Ok(Json(body))
}

/// GET /koel/search — Proxy full-text search to Koel.
#[derive(Debug, Deserialize)]
struct SearchQuery {
    q: String,
}

async fn search(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Query(params): Query<SearchQuery>,
) -> Result<Json<Value>, AppError> {
    let cfg = match koel_config(&state) {
        Some(c) => c,
        None => return Ok(not_configured_error()),
    };

    let path = format!(
        "/api/v2/search?q={}&per_type=10",
        urlencoding::encode(&params.q)
    );

    let res = match koel_request(&state, &cfg, reqwest::Method::GET, &path).await {
        Ok(r) => r,
        Err(_) => {
            return Ok(Json(json!({
                "error": "koel_unavailable",
                "message": "Music service is offline"
            })));
        }
    };

    let body: Value = res.json().await.unwrap_or(json!({ "data": {} }));
    Ok(Json(body))
}

/// POST /koel/play/{song_id} — Return a deep link to open the song in Koel.
async fn play_song(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Path(song_id): Path<String>,
) -> Result<Json<Value>, AppError> {
    let cfg = match koel_config(&state) {
        Some(c) => c,
        None => return Ok(not_configured_error()),
    };

    Ok(Json(json!({
        "url": format!("{}#!/song/{}", cfg.host, song_id),
        "message": "Open this URL to play the song in Koel"
    })))
}

/// POST /koel/playback/toggle — Remote playback control (not currently supported).
async fn toggle_playback(
    State(_state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    Ok(Json(json!({
        "status": "not_supported",
        "message": "Remote playback control requires an active Koel client"
    })))
}

/// POST /koel/playback/skip — Remote skip control (not currently supported).
async fn skip(
    State(_state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    Ok(Json(json!({
        "status": "not_supported",
        "message": "Remote playback control requires an active Koel client"
    })))
}

/// GET /koel/album-art/{album_id} — Proxy album art from Koel.
async fn album_art(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Path(album_id): Path<String>,
) -> Result<Response, AppError> {
    let cfg = match koel_config(&state) {
        Some(c) => c,
        None => {
            return Err(AppError::NotFound("Koel not configured".into()));
        }
    };

    let path = format!("/api/albums/{}/thumbnail", album_id);
    let res = koel_request(&state, &cfg, reqwest::Method::GET, &path).await.map_err(|_| {
        AppError::Internal(anyhow::anyhow!("Failed to fetch album art from Koel"))
    })?;

    let content_type = res
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("image/jpeg")
        .to_string();

    let bytes = res.bytes().await.map_err(|e| {
        AppError::Internal(anyhow::anyhow!("Failed to read album art bytes: {e}"))
    })?;

    Ok(Response::builder()
        .header(header::CONTENT_TYPE, content_type)
        .header(header::CACHE_CONTROL, "public, max-age=86400")
        .body(Body::from(bytes))
        .unwrap())
}

// ── Router ──────────────────────────────────────────────────────────────────

/// Build the Koel proxy router with health, now-playing, search, play,
/// playback control, and album art endpoints.
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/koel/health", get(health))
        .route("/koel/now-playing", get(now_playing))
        .route("/koel/search", get(search))
        .route("/koel/play/{song_id}", post(play_song))
        .route("/koel/playback/toggle", post(toggle_playback))
        .route("/koel/playback/skip", post(skip))
        .route("/koel/album-art/{album_id}", get(album_art))
}
