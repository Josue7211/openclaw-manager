use axum::Router;
use axum::body::Body;
use axum::http::{HeaderValue, Request, StatusCode};
use axum::middleware::{self, Next};
use axum::response::{IntoResponse, Response};
use std::net::SocketAddr;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::OnceLock;
use std::time::{SystemTime, UNIX_EPOCH};

/// MC_API_KEY stored once at startup so the auth middleware can read it
/// without touching process environment variables.
static MC_API_KEY: OnceLock<String> = OnceLock::new();
use tokio::net::TcpListener;
use tower_http::cors::{CorsLayer, Any, AllowOrigin};
use crate::routes;
use crate::service_client::ServiceClient;

#[derive(Clone)]
pub struct AppState {
    pub app: tauri::AppHandle,
    pub db: sqlx::SqlitePool,
    pub http: reqwest::Client,
    /// Secrets loaded from the OS keychain at startup.
    /// Keys are env-var names (e.g. "BLUEBUBBLES_HOST").
    /// Route handlers should read from here instead of `std::env::var`.
    pub secrets: std::collections::HashMap<String, String>,
    /// Pre-configured BlueBubbles service client. `None` when BLUEBUBBLES_HOST
    /// is not set (module disabled).
    pub bb: Option<ServiceClient>,
    /// Pre-configured OpenClaw API service client. `None` when OPENCLAW_API_URL
    /// is not set (module disabled).
    pub openclaw: Option<ServiceClient>,
    // Supabase already has its own SupabaseClient in `crate::supabase`.
}

impl AppState {
    /// Look up a secret by its env-var name from the in-memory HashMap.
    /// Secrets are never stored in process-wide environment variables.
    pub fn secret(&self, key: &str) -> Option<String> {
        self.secrets
            .get(key)
            .cloned()
    }

    /// Convenience: look up a secret or return an empty string.
    pub fn secret_or_default(&self, key: &str) -> String {
        self.secret(key).unwrap_or_default()
    }

    /// Read a cached API response from local SQLite.
    /// Returns `Some(json_string)` if a row exists for `key`.
    pub async fn cache_get(&self, key: &str) -> Option<String> {
        sqlx::query_scalar::<_, String>("SELECT data FROM api_cache WHERE key = ?")
            .bind(key)
            .fetch_optional(&self.db)
            .await
            .ok()
            .flatten()
    }

    /// Write (upsert) a cached API response into local SQLite.
    pub async fn cache_set(&self, key: &str, data: &str) {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64;
        let _ = sqlx::query(
            "INSERT INTO api_cache (key, data, updated_at) VALUES (?, ?, ?)
             ON CONFLICT(key) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at",
        )
        .bind(key)
        .bind(data)
        .bind(now)
        .execute(&self.db)
        .await;
    }
}

pub async fn start(
    app_handle: tauri::AppHandle,
    secrets: std::collections::HashMap<String, String>,
) -> anyhow::Result<()> {
    // Run Tailscale peer identity verification in the background.
    // This logs warnings for any mismatched peers but never blocks startup.
    {
        let secrets_clone = secrets.clone();
        std::thread::spawn(move || {
            crate::tailscale::startup_verify(&secrets_clone);
        });
    }

    // Store MC_API_KEY for the auth middleware (runs outside State extraction)
    if let Some(key) = secrets.get("MC_API_KEY").filter(|s| !s.is_empty()) {
        let _ = MC_API_KEY.set(key.clone());
    }

    // Build optional service clients from secrets HashMap
    let bb_host = secrets
        .get("BLUEBUBBLES_HOST")
        .cloned()
        .filter(|s| !s.is_empty());
    let bb = bb_host.map(|host| {
        tracing::info!("BlueBubbles service client configured");
        ServiceClient::new("BlueBubbles", &host, 30)
    });

    let openclaw_url = secrets
        .get("OPENCLAW_API_URL")
        .cloned()
        .filter(|s| !s.is_empty());
    let openclaw = openclaw_url.map(|url| {
        tracing::info!("OpenClaw service client configured");
        ServiceClient::new("OpenClaw", &url, 60)
    });

    let state = AppState {
        app: app_handle,
        db: crate::db::init().await?,
        http: reqwest::Client::new(),
        secrets,
        bb,
        openclaw,
    };

    // Pre-warm the messages conversation cache in the background
    let prewarm_state = state.clone();

    let app = Router::new()
        .nest("/api", routes::router())
        .layer(middleware::from_fn(request_logger))
        .layer(middleware::from_fn(api_key_auth))
        .layer(middleware::from_fn(rate_limit))
        .layer(CorsLayer::new()
            .allow_origin(AllowOrigin::predicate(|origin: &HeaderValue, _| {
                if let Ok(s) = origin.to_str() {
                    s.starts_with("http://localhost:") || s.starts_with("http://127.0.0.1:")
                        || s == "http://localhost" || s == "http://127.0.0.1"
                        || s.starts_with("tauri://") || s.starts_with("https://tauri.localhost")
                } else {
                    false
                }
            }))
            .allow_methods(Any)
            .allow_headers(Any))
        .with_state(state);

    {
        tokio::spawn(async move {
            crate::routes::messages::refresh_conv_cache(&prewarm_state.http, &prewarm_state).await;
            tracing::info!("Conversation cache pre-warmed");
        });
    }

    let addr = SocketAddr::from(([127, 0, 0, 1], 3000));
    let listener = TcpListener::bind(addr).await?;
    tracing::info!("Axum listening on {}", addr);
    axum::serve(listener, app).await?;
    Ok(())
}

/// Middleware that logs each incoming request with method, path, status, and duration.
async fn request_logger(req: Request<Body>, next: Next) -> Response {
    let method = req.method().clone();
    let path = req.uri().path().to_string();
    let start = std::time::Instant::now();
    let response = next.run(req).await;
    let duration = start.elapsed();
    let status = response.status();

    // Don't log health checks or static assets
    if path != "/api/health" && !path.ends_with(".png") {
        tracing::info!(
            method = %method,
            path = %path,
            status = %status.as_u16(),
            duration_ms = %duration.as_millis(),
        );
    }
    response
}

/// Paths exempt from API key authentication.
const AUTH_EXEMPT_PATHS: &[&str] = &[
    "/api/health",
    "/api/auth/callback",
    "/api/auth/favicon.png",
    "/api/auth/logo.png",
];

// ---------------------------------------------------------------------------
// Global rate limiter: 100 requests per second (burst protection)
// ---------------------------------------------------------------------------

/// Epoch-second of the current rate-limit window.
static RATE_LIMIT_WINDOW: AtomicU64 = AtomicU64::new(0);
/// Number of requests seen in the current window.
static RATE_LIMIT_COUNT: AtomicU64 = AtomicU64::new(0);
/// Maximum requests allowed per second.
const RATE_LIMIT_MAX: u64 = 100;

/// Middleware that enforces a global rate limit of 100 requests/second.
/// Returns 429 Too Many Requests when the limit is exceeded.
async fn rate_limit(req: Request<Body>, next: Next) -> Response {
    let now_secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let prev_window = RATE_LIMIT_WINDOW.load(Ordering::Relaxed);

    if now_secs != prev_window {
        // New second -- reset the counter. A compare-exchange avoids
        // double-resetting when two threads race, but for a local desktop
        // app a relaxed swap is fine.
        if RATE_LIMIT_WINDOW
            .compare_exchange(prev_window, now_secs, Ordering::Relaxed, Ordering::Relaxed)
            .is_ok()
        {
            RATE_LIMIT_COUNT.store(1, Ordering::Relaxed);
            return next.run(req).await;
        }
    }

    let count = RATE_LIMIT_COUNT.fetch_add(1, Ordering::Relaxed);
    if count >= RATE_LIMIT_MAX {
        return (
            StatusCode::TOO_MANY_REQUESTS,
            "Too many requests -- limit is 100/second",
        )
            .into_response();
    }

    next.run(req).await
}

/// Middleware that validates the `X-API-Key` header against `MC_API_KEY`.
async fn api_key_auth(req: Request<Body>, next: Next) -> Response {
    let path = req.uri().path();

    // Skip auth for exempt paths and resource paths (images, avatars, attachments)
    if AUTH_EXEMPT_PATHS.iter().any(|exempt| path == *exempt) {
        return next.run(req).await;
    }
    // Allow direct resource requests (img src, audio src, etc.) that don't send Origin headers
    if path.starts_with("/api/messages/avatar")
        || path.starts_with("/api/messages/attachment")
        || path.starts_with("/api/messages/sticker")
        || path.ends_with(".png")
        || path.ends_with(".jpg")
    {
        return next.run(req).await;
    }

    // Also skip CORS preflight requests
    if req.method() == axum::http::Method::OPTIONS {
        return next.run(req).await;
    }

    let expected = match MC_API_KEY.get() {
        Some(k) if !k.is_empty() => k.as_str(),
        _ => {
            // No API key configured — allow all requests (dev/fallback)
            return next.run(req).await;
        }
    };

    // Check X-API-Key header (Tauri app path)
    if let Some(provided) = req.headers().get("x-api-key").and_then(|v| v.to_str().ok()) {
        if provided == expected {
            return next.run(req).await;
        }
    }

    // WebSocket connections can't send custom headers — check query parameter
    // e.g. ws://127.0.0.1:3000/api/chat/ws?apiKey=...
    if req.headers().get("upgrade").and_then(|v| v.to_str().ok()).map(|v| v.eq_ignore_ascii_case("websocket")).unwrap_or(false) {
        if let Some(query) = req.uri().query() {
            for pair in query.split('&') {
                if let Some(val) = pair.strip_prefix("apiKey=") {
                    if val == expected {
                        return next.run(req).await;
                    }
                }
            }
        }
    }

    // Browser dev mode: allow requests from localhost origins
    // (CORS limits origins; API key provides defense-in-depth for Tauri production)
    #[cfg(debug_assertions)]
    if let Some(origin) = req.headers().get("origin").and_then(|v| v.to_str().ok()) {
        if origin.starts_with("http://localhost:") || origin.starts_with("http://127.0.0.1:") {
            return next.run(req).await;
        }
    }

    (StatusCode::UNAUTHORIZED, "Unauthorized: invalid or missing API key").into_response()
}
