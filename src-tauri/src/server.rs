use axum::Router;
use axum::body::Body;
use axum::extract::DefaultBodyLimit;
use axum::http::{HeaderValue, Request, StatusCode};
use axum::middleware::{self, Next};
use axum::response::{IntoResponse, Response};
use std::net::SocketAddr;
use std::sync::Arc;
use subtle::ConstantTimeEq;
use std::sync::OnceLock;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::sync::RwLock;

/// MC_API_KEY stored once at startup so the auth middleware can read it
/// without touching process environment variables.
static MC_API_KEY: OnceLock<String> = OnceLock::new();
use tokio::net::TcpListener;
use tower_http::cors::{CorsLayer, Any, AllowOrigin};
use crate::routes;
use crate::service_client::ServiceClient;

// ---------------------------------------------------------------------------
// User session (JWT passthrough)
// ---------------------------------------------------------------------------

/// Authenticated user session stored in `AppState`.
///
/// Populated after login/OAuth and auto-refreshed by the `inject_session`
/// middleware when the access token is near expiry. Route handlers that require
/// authentication extract this via the [`RequireAuth`] extractor.
#[derive(Clone, Debug)]
pub struct UserSession {
    pub access_token: String,
    pub refresh_token: String,
    pub user_id: String,
    pub email: String,
    /// Unix epoch seconds when the access token expires.
    pub expires_at: i64,
    /// Argon2id-derived key for user_secrets encryption/decryption.
    pub encryption_key: Vec<u8>,
    /// Whether MFA has been verified this session (aal2).
    /// If false, only auth endpoints are accessible.
    pub mfa_verified: bool,
    /// The verified TOTP factor ID (if any). Stored at login time so we
    /// don't need to call GoTrue again.
    pub factor_id: Option<String>,
}

// ---------------------------------------------------------------------------
// RequireAuth extractor
// ---------------------------------------------------------------------------

/// Axum extractor that pulls a [`UserSession`] from request extensions.
///
/// Returns `401 Unauthorized` if no session is present (the user is not
/// logged in, or the session expired and refresh failed).
///
/// # Usage
/// ```ignore
/// async fn my_handler(RequireAuth(session): RequireAuth) -> impl IntoResponse {
///     // session.access_token, session.user_id, etc.
/// }
/// ```
pub struct RequireAuth(pub UserSession);

#[axum::async_trait]
impl<S> axum::extract::FromRequestParts<S> for RequireAuth
where
    S: Send + Sync,
{
    type Rejection = Response;

    async fn from_request_parts(
        parts: &mut axum::http::request::Parts,
        _state: &S,
    ) -> Result<Self, Self::Rejection> {
        let session = parts
            .extensions
            .get::<UserSession>()
            .cloned()
            .ok_or_else(|| {
                (StatusCode::UNAUTHORIZED, "Authentication required").into_response()
            })?;

        // Hard gate: MFA must be verified before ANY data access
        if !session.mfa_verified {
            return Err(
                (StatusCode::FORBIDDEN, "MFA verification required").into_response()
            );
        }

        Ok(RequireAuth(session))
    }
}

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

    /// Current user session (JWT tokens + derived encryption key).
    /// `None` until the user logs in. Auto-refreshed by `inject_session`.
    pub session: Arc<RwLock<Option<UserSession>>>,
    /// Mutex that serialises token refresh attempts so concurrent requests
    /// don't all hit GoTrue simultaneously.
    pub refresh_mutex: Arc<tokio::sync::Mutex<()>>,
    /// PKCE `code_verifier` stored between OAuth redirect and callback.
    pub pkce_verifier: Arc<RwLock<Option<String>>>,
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

/// Start the embedded Axum HTTP server on localhost:3000 with all API routes.
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
        session: Arc::new(RwLock::new(None)),
        refresh_mutex: Arc::new(tokio::sync::Mutex::new(())),
        pkce_verifier: Arc::new(RwLock::new(None)),
    };

    // Start the background sync engine (offline-first SQLite <-> Supabase)
    {
        let supabase_url = state.secret_or_default("SUPABASE_URL");
        let service_key = state.secret_or_default("SUPABASE_SERVICE_ROLE_KEY");
        let sync_engine = crate::sync::SyncEngine::new(
            state.db.clone(),
            supabase_url,
            service_key,
            state.session.clone(),
        );
        sync_engine.start();
        tracing::info!("Sync engine started (30s interval)");
    }

    // Pre-warm the messages conversation cache in the background
    let prewarm_state = state.clone();

    let app = Router::new()
        .nest("/api", routes::router())
        .layer(DefaultBodyLimit::max(10 * 1024 * 1024)) // 10 MB
        .layer(middleware::from_fn_with_state(state.clone(), inject_session))
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

/// Middleware that injects the current [`UserSession`] into request extensions
/// and auto-refreshes tokens that are within 60 seconds of expiry.
///
/// Runs after `api_key_auth` (the API key has already been validated).
/// If no session exists the request proceeds without one — routes that
/// require auth use the [`RequireAuth`] extractor to enforce it.
async fn inject_session(
    axum::extract::State(state): axum::extract::State<AppState>,
    mut req: Request<Body>,
    next: Next,
) -> Response {
    let session = state.session.read().await.clone();

    if let Some(ref sess) = session {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64;

        if sess.expires_at - now < 60 {
            // Token is near expiry — try to refresh.
            // Acquire the mutex so only one request refreshes at a time.
            let _guard = state.refresh_mutex.lock().await;

            // Re-read: another request may have already refreshed while we waited.
            let current = state.session.read().await.clone();
            if let Some(ref current_sess) = current {
                let now = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs() as i64;

                if current_sess.expires_at - now < 60 {
                    // Still needs refresh.
                    if let Ok(gotrue) = crate::gotrue::GoTrueClient::from_state(&state) {
                        match gotrue.refresh_token(&current_sess.refresh_token).await {
                            Ok(auth_resp) => {
                                let mut write = state.session.write().await;
                                if let Some(ref mut s) = *write {
                                    s.access_token = auth_resp.access_token;
                                    s.refresh_token = auth_resp.refresh_token;
                                    s.expires_at = now + auth_resp.expires_in;
                                }
                                drop(write);
                            }
                            Err(e) => {
                                tracing::warn!("token refresh failed: {e}");
                                // Clear session — user will need to re-authenticate.
                                *state.session.write().await = None;
                            }
                        }
                    }
                }
            }
        }

        // Insert the (possibly refreshed) session into request extensions.
        let final_session = state.session.read().await.clone();
        if let Some(s) = final_session {
            req.extensions_mut().insert(s);
        }
    }

    next.run(req).await
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
/// All `/api/auth/*` routes are exempt because auth endpoints handle their
/// own authentication internally (session checks, password verification, etc.).
const AUTH_EXEMPT_PATHS: &[&str] = &[
    "/api/health",
];

/// Path prefixes exempt from API key authentication.
const AUTH_EXEMPT_PREFIXES: &[&str] = &[
    "/api/auth/",
];

// ---------------------------------------------------------------------------
// Per-user rate limiting
// ---------------------------------------------------------------------------

/// Per-key rate-limit bucket: tracks request count within a 60-second window.
struct RateBucket {
    count: u64,
    window_start: u64,
}

/// Global map of rate-limit buckets keyed by `"{user_or_ip}:{category}"`.
static RATE_LIMITS: OnceLock<std::sync::Mutex<std::collections::HashMap<String, RateBucket>>> =
    OnceLock::new();

fn rate_map() -> &'static std::sync::Mutex<std::collections::HashMap<String, RateBucket>> {
    RATE_LIMITS.get_or_init(|| std::sync::Mutex::new(std::collections::HashMap::new()))
}

/// Check and increment a rate-limit bucket. Returns `true` if the request
/// should be allowed, `false` if the limit has been exceeded.
fn check_rate(key: &str, max_per_minute: u64, now_secs: u64) -> bool {
    let mut map = rate_map().lock().unwrap_or_else(|e| e.into_inner());
    let bucket = map.entry(key.to_string()).or_insert(RateBucket {
        count: 0,
        window_start: now_secs,
    });

    // Reset window if more than 60 seconds have elapsed
    if now_secs - bucket.window_start >= 60 {
        bucket.count = 1;
        bucket.window_start = now_secs;
        return true;
    }

    bucket.count += 1;
    bucket.count <= max_per_minute
}

/// Per-user / per-IP rate-limit middleware.
///
/// Limits:
/// - Auth endpoints (`/api/auth/`): 5/min per IP
/// - Read (GET): 120/min per user (falls back to IP if no session)
/// - Mutation (POST/PATCH/DELETE): 30/min per user
/// - AI/chat (`/api/chat/`): 10/min per user
async fn rate_limit(req: Request<Body>, next: Next) -> Response {
    let now_secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let path = req.uri().path().to_string();
    let method = req.method().clone();

    // Determine the identity key: user_id from session, or remote IP
    let identity = req
        .extensions()
        .get::<UserSession>()
        .map(|s| format!("user:{}", s.user_id))
        .unwrap_or_else(|| "ip:127.0.0.1".to_string());

    // Choose category and limit
    // Session polling is frequent (every 2s during OAuth) — never rate-limit it
    if path == "/api/auth/session" || path == "/api/health" {
        return next.run(req).await;
    }

    let (category, limit) = if path.starts_with("/api/auth/") {
        ("auth", 30u64)
    } else if path.starts_with("/api/chat/") {
        ("chat", 10u64)
    } else if method == axum::http::Method::GET {
        ("read", 120u64)
    } else {
        ("mutation", 30u64)
    };

    let key = format!("{identity}:{category}");

    if !check_rate(&key, limit, now_secs) {
        return (
            StatusCode::TOO_MANY_REQUESTS,
            format!("Rate limit exceeded: {limit}/min for {category}"),
        )
            .into_response();
    }

    next.run(req).await
}

/// Middleware that validates the `X-API-Key` header against `MC_API_KEY`.
async fn api_key_auth(req: Request<Body>, next: Next) -> Response {
    let path = req.uri().path();

    // Skip auth for exempt paths and resource paths (images, avatars, attachments)
    if AUTH_EXEMPT_PATHS.iter().any(|exempt| path == *exempt)
        || AUTH_EXEMPT_PREFIXES.iter().any(|prefix| path.starts_with(prefix))
    {
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

    // Check X-API-Key header (Tauri app path) — constant-time comparison
    if let Some(provided) = req.headers().get("x-api-key").and_then(|v| v.to_str().ok()) {
        if provided.as_bytes().ct_eq(expected.as_bytes()).into() {
            return next.run(req).await;
        }
    }

    // WebSocket connections can't send custom headers — check query parameter
    // e.g. ws://127.0.0.1:3000/api/chat/ws?apiKey=...
    if req.headers().get("upgrade").and_then(|v| v.to_str().ok()).map(|v| v.eq_ignore_ascii_case("websocket")).unwrap_or(false) {
        if let Some(query) = req.uri().query() {
            for pair in query.split('&') {
                if let Some(val) = pair.strip_prefix("apiKey=") {
                    if val.as_bytes().ct_eq(expected.as_bytes()).into() {
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
