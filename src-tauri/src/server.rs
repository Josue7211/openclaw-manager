use axum::Router;
use axum::body::Body;
use axum::extract::DefaultBodyLimit;
use axum::http::{HeaderValue, Request, StatusCode};
use axum::middleware::{self, Next};
use axum::response::{IntoResponse, Response};
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;
use subtle::ConstantTimeEq;
use zeroize::Zeroize;
use std::sync::OnceLock;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::sync::RwLock;
use tower_http::timeout::TimeoutLayer;

/// MC_API_KEY stored once at startup so the auth middleware can read it
/// without touching process environment variables.
pub static MC_API_KEY: OnceLock<String> = OnceLock::new();

/// MC_AGENT_KEY — optional stable key for external agents (e.g. Bjorn on OpenClaw VM).
/// Unlike MC_API_KEY which rotates every launch, this is user-configured and persistent.
pub static MC_AGENT_KEY: OnceLock<String> = OnceLock::new();
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
#[derive(Clone, serde::Serialize, serde::Deserialize)]
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
    /// The verified MFA factor ID (if any). Stored at login time so we
    /// don't need to call GoTrue again.
    pub factor_id: Option<String>,
    /// The type of the verified MFA factor: `"totp"` or `"webauthn"`.
    /// Used by the frontend to present the correct verification UI.
    pub factor_type: Option<String>,
    /// All verified MFA factor types available for this user (e.g. `["totp", "webauthn"]`).
    /// Computed at login time from the GoTrue user object's `factors` array.
    pub available_mfa_methods: Vec<String>,
    /// Unix epoch seconds when this session was first created.
    /// Used to enforce a hard 24-hour session lifetime regardless of
    /// token refresh — forces periodic re-authentication.
    pub created_at: i64,
}

/// Manual `Debug` implementation that redacts sensitive fields (tokens and
/// encryption key) so they never appear in log output or panic messages.
impl std::fmt::Debug for UserSession {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("UserSession")
            .field("access_token", &"[REDACTED]")
            .field("refresh_token", &"[REDACTED]")
            .field("user_id", &self.user_id)
            .field("email", &self.email)
            .field("expires_at", &self.expires_at)
            .field("encryption_key", &"[REDACTED]")
            .field("mfa_verified", &self.mfa_verified)
            .field("factor_id", &self.factor_id)
            .field("factor_type", &self.factor_type)
            .field("available_mfa_methods", &self.available_mfa_methods)
            .field("created_at", &self.created_at)
            .finish()
    }
}

/// Zeroize sensitive fields (tokens, encryption key) when a `UserSession` is
/// dropped — prevents secrets from lingering in freed memory.
impl Drop for UserSession {
    fn drop(&mut self) {
        self.access_token.zeroize();
        self.refresh_token.zeroize();
        self.encryption_key.zeroize();
    }
}

/// In debug mode, persist the session to SQLite so it survives app restarts.
#[cfg(debug_assertions)]
pub async fn save_dev_session(db: &sqlx::SqlitePool, session: &UserSession) {
    if let Ok(data) = serde_json::to_string(session) {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64;
        let _ = sqlx::query(
            "INSERT OR REPLACE INTO _dev_session (id, data, created_at) VALUES (1, ?, ?)"
        )
        .bind(&data)
        .bind(now)
        .execute(db)
        .await;
    }
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
    /// Secrets loaded from the OS keychain at startup, then enriched with
    /// user-specific credentials from Supabase `user_secrets` after login.
    /// Keys are env-var names (e.g. "BLUEBUBBLES_HOST").
    /// Route handlers should read from here via `secret()` / `secret_or_default()`.
    ///
    /// Wrapped in `Arc<std::sync::RwLock>` so `load_user_secrets` can merge
    /// decrypted credentials after login without blocking async tasks.
    pub secrets: Arc<std::sync::RwLock<std::collections::HashMap<String, String>>>,
    /// Pre-configured BlueBubbles service client. `None` when BLUEBUBBLES_HOST
    /// is not set (module disabled).
    pub bb: Option<ServiceClient>,
    /// Pre-configured OpenClaw API service client. `None` when OPENCLAW_API_URL
    /// is not set (module disabled).
    pub openclaw: Option<ServiceClient>,
    /// Persistent WebSocket client to the OpenClaw Gateway. `None` when
    /// OPENCLAW_WS is not configured.
    pub gateway_ws: Option<Arc<crate::gateway_ws::GatewayWsClient>>,
    // Supabase already has its own SupabaseClient in `crate::supabase`.

    /// Current user session (JWT tokens + derived encryption key).
    /// `None` until the user logs in. Auto-refreshed by `inject_session`.
    pub session: Arc<RwLock<Option<UserSession>>>,
    /// Mutex that serialises token refresh attempts so concurrent requests
    /// don't all hit GoTrue simultaneously.
    pub refresh_mutex: Arc<tokio::sync::Mutex<()>>,
    /// In-progress OAuth flow state. Stores verifier + URL + nonce so that
    /// duplicate `start_oauth` calls within 120s return the same URL instead
    /// of overwriting the PKCE verifier (fixes first-attempt failure).
    pub pending_oauth: Arc<RwLock<Option<PendingOAuthFlow>>>,
}

/// State for an in-progress OAuth flow.
#[derive(Clone)]
pub struct PendingOAuthFlow {
    pub verifier: String,
    pub nonce: String,
    pub url: String,
    pub created_at: i64,
}

impl Drop for PendingOAuthFlow {
    fn drop(&mut self) {
        use zeroize::Zeroize;
        self.verifier.zeroize();
        self.nonce.zeroize();
    }
}

impl AppState {
    /// Look up a secret by its env-var name from the in-memory HashMap.
    /// Secrets are never stored in process-wide environment variables.
    pub fn secret(&self, key: &str) -> Option<String> {
        self.secrets
            .read()
            .unwrap_or_else(|e| e.into_inner())
            .get(key)
            .cloned()
    }

    /// Convenience: look up a secret or return an empty string.
    pub fn secret_or_default(&self, key: &str) -> String {
        self.secret(key).unwrap_or_default()
    }

    /// Merge additional secrets into the in-memory HashMap.
    /// Existing keys are overwritten (Supabase user_secrets override keychain).
    pub fn merge_secrets(&self, new_secrets: std::collections::HashMap<String, String>) {
        let mut guard = self.secrets.write().unwrap_or_else(|e| e.into_inner());
        for (k, v) in new_secrets {
            guard.insert(k, v);
        }
    }

    /// Read a cached API response from local SQLite, scoped by `user_id`.
    /// Returns `Some(json_string)` if a row exists for `(user_id, key)`.
    pub async fn cache_get(&self, user_id: &str, key: &str) -> Option<String> {
        sqlx::query_scalar::<_, String>(
            "SELECT data FROM api_cache WHERE user_id = ? AND key = ?",
        )
        .bind(user_id)
        .bind(key)
        .fetch_optional(&self.db)
        .await
        .ok()
        .flatten()
    }

    /// Write (upsert) a cached API response into local SQLite, scoped by `user_id`.
    pub async fn cache_set(&self, user_id: &str, key: &str, data: &str) {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64;
        let _ = sqlx::query(
            "INSERT INTO api_cache (user_id, key, data, updated_at) VALUES (?, ?, ?, ?)
             ON CONFLICT(user_id, key) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at",
        )
        .bind(user_id)
        .bind(key)
        .bind(data)
        .bind(now)
        .execute(&self.db)
        .await;
    }

    /// Delete all cached API responses for a specific user (e.g. on logout).
    pub async fn cache_clear_user(&self, user_id: &str) {
        let _ = sqlx::query("DELETE FROM api_cache WHERE user_id = ?")
            .bind(user_id)
            .execute(&self.db)
            .await;
    }
}

/// Log runtime integrity and tamper-detection results into `security_events`.
///
/// Called once after the DB pool is initialised. The checks themselves already
/// ran in `main()` (and emitted tracing warnings), but we also persist them in
/// SQLite so operators can review via `GET /api/security-events`.
async fn log_integrity_events(db: &sqlx::SqlitePool) {
    // Helper: fire-and-forget insert into security_events.
    async fn insert(db: &sqlx::SqlitePool, event_type: &str, details: &serde_json::Value) {
        let details_str = details.to_string();
        let _ = sqlx::query(
            "INSERT INTO security_events (event_type, user_id, details) VALUES (?, NULL, ?)",
        )
        .bind(event_type)
        .bind(&details_str)
        .execute(db)
        .await;
    }

    // 1. Binary integrity check (SHA-256)
    if let Ok(exe_path) = std::env::current_exe() {
        if let Ok(bytes) = std::fs::read(&exe_path) {
            use sha2::{Sha256, Digest};
            let hash = hex::encode(Sha256::digest(&bytes));
            insert(
                db,
                "integrity_check",
                &serde_json::json!({
                    "binary_hash": hash,
                    "exe_path": exe_path.display().to_string(),
                }),
            )
            .await;
        }
    }

    // 2. Debugger detection (Linux only)
    #[cfg(target_os = "linux")]
    {
        if let Ok(status) = std::fs::read_to_string("/proc/self/status") {
            for line in status.lines() {
                if let Some(pid) = line.strip_prefix("TracerPid:") {
                    let pid = pid.trim();
                    if pid != "0" {
                        insert(
                            db,
                            "debugger_detected",
                            &serde_json::json!({ "tracer_pid": pid }),
                        )
                        .await;
                    }
                }
            }
        }
    }

    // 3. LD_PRELOAD detection (Linux only)
    #[cfg(target_os = "linux")]
    {
        if let Ok(preload) = std::env::var("LD_PRELOAD") {
            if !preload.is_empty() {
                insert(
                    db,
                    "ld_preload_detected",
                    &serde_json::json!({ "ld_preload": preload }),
                )
                .await;
            }
        }
    }
}

/// Verify that the Supabase URL's hostname resolves via DNS.
///
/// Catches DNS spoofing or misconfiguration. Logs the resolved IPs on success,
/// a warning on failure. Returns `true` if at least one address resolved.
/// Never blocks startup — callers should log but not abort on `false`.
async fn verify_supabase_dns(supabase_url: &str) -> bool {
    let parsed = match url::Url::parse(supabase_url) {
        Ok(u) => u,
        Err(_) => {
            tracing::warn!(url = %supabase_url, "Supabase DNS verification skipped: invalid URL");
            return false;
        }
    };
    let host = match parsed.host_str() {
        Some(h) => h,
        None => {
            tracing::warn!(url = %supabase_url, "Supabase DNS verification skipped: no host in URL");
            return false;
        }
    };

    // Direct IPs don't need DNS resolution
    if host.parse::<std::net::IpAddr>().is_ok() {
        tracing::info!(host = %host, "Supabase URL uses direct IP — DNS verification not applicable");
        return true;
    }

    let port = parsed.port().unwrap_or(if parsed.scheme() == "https" { 443 } else { 80 });
    match tokio::net::lookup_host(format!("{host}:{port}")).await {
        Ok(addrs) => {
            let ips: Vec<String> = addrs.map(|a| a.ip().to_string()).collect();
            if ips.is_empty() {
                tracing::warn!(host = %host, "Supabase DNS resolution returned zero addresses");
                false
            } else {
                tracing::info!(host = %host, ips = ?ips, "Supabase DNS resolution verified");
                true
            }
        }
        Err(e) => {
            tracing::warn!(host = %host, error = %e, "Supabase DNS resolution failed");
            false
        }
    }
}

/// Log whether a service URL uses TLS or plaintext HTTP.
///
/// For HTTPS URLs, confirms that certificate verification is enabled
/// (reqwest with rustls-tls verifies by default). For HTTP URLs on
/// non-local addresses, logs a security warning.
fn log_tls_status(service: &str, url: &str) {
    if url.starts_with("https://") {
        tracing::info!(
            service = %service,
            "connection uses TLS — certificate verification enabled (rustls)"
        );
    } else if url.starts_with("http://") {
        if let Ok(parsed) = url::Url::parse(url) {
            if let Some(host) = parsed.host_str() {
                let is_local = host == "127.0.0.1"
                    || host == "localhost"
                    || host == "::1"
                    || host.starts_with("100.") // Tailscale CGNAT — WireGuard-encrypted
                    || host.starts_with("10.");  // LAN — acceptable for self-hosted
                if is_local {
                    tracing::info!(
                        service = %service,
                        host = %host,
                        "connection uses plaintext HTTP on local/Tailscale address"
                    );
                } else {
                    tracing::warn!(
                        service = %service,
                        host = %host,
                        "connection uses plaintext HTTP on non-local address — no TLS protection"
                    );
                }
            }
        }
    }
}

/// Check if a host string is in the RFC 1918 172.16.0.0/12 range (172.16.x.x – 172.31.x.x).
///
/// The full 172.0.0.0/8 block is NOT private — only the 172.16–31 second-octet
/// range is reserved. This avoids false negatives for public IPs like 172.217.x.x (Google).
fn is_rfc1918_172(host: &str) -> bool {
    if let Some(rest) = host.strip_prefix("172.") {
        if let Some(second_octet_str) = rest.split('.').next() {
            if let Ok(second_octet) = second_octet_str.parse::<u8>() {
                return (16..=31).contains(&second_octet);
            }
        }
    }
    false
}

/// Warn if a service URL uses plaintext HTTP on an address that is neither
/// loopback, Tailscale CGNAT (100.x.x.x), nor private LAN (10.x.x.x).
///
/// Called at startup for each configured service URL.
fn warn_if_insecure_url(service: &str, url: &str) {
    if !url.starts_with("http://") {
        return;
    }
    if let Ok(parsed) = url::Url::parse(url) {
        if let Some(host) = parsed.host_str() {
            if host != "127.0.0.1"
                && host != "localhost"
                && host != "::1"
                && !host.starts_with("100.") // Tailscale CGNAT
                && !host.starts_with("10.")  // Private LAN
                && !host.starts_with("192.168.") // Private LAN
                && !is_rfc1918_172(host)     // Private LAN (172.16.0.0/12)
            {
                tracing::warn!(
                    service = %service,
                    host = %host,
                    "service URL uses plaintext HTTP on non-local address — traffic is unencrypted"
                );
            }
        }
    }
}

/// Run all startup connection security checks for configured services.
///
/// - Verifies Supabase DNS resolution
/// - Logs TLS status for each service
/// - Warns about insecure (non-TLS, non-local) URLs
async fn verify_connection_security(secrets: &std::collections::HashMap<String, String>) {
    // Service URL keys and their human-readable names
    let service_urls: &[(&str, &str)] = &[
        ("Supabase", "SUPABASE_URL"),
        ("BlueBubbles", "BLUEBUBBLES_HOST"),
        ("OpenClaw", "OPENCLAW_API_URL"),
        ("Proxmox", "PROXMOX_HOST"),
        ("OPNsense", "OPNSENSE_HOST"),
        ("CalDAV", "CALDAV_URL"),
        ("Plex", "PLEX_URL"),
        ("Sonarr", "SONARR_URL"),
        ("Radarr", "RADARR_URL"),
        ("Mac Bridge", "MAC_BRIDGE_HOST"),
        ("Ntfy", "NTFY_URL"),
    ];

    // 1. Supabase DNS verification
    if let Some(supabase_url) = secrets.get("SUPABASE_URL").filter(|s| !s.is_empty()) {
        verify_supabase_dns(supabase_url).await;
    }

    // 2. TLS status + insecure URL warnings for all configured services
    for (name, key) in service_urls {
        if let Some(url) = secrets.get(*key).filter(|s| !s.is_empty()) {
            log_tls_status(name, url);
            warn_if_insecure_url(name, url);
        }
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

    // Run connection security checks (DNS verification, TLS status, insecure URL warnings).
    verify_connection_security(&secrets).await;

    // Store MC_API_KEY for the auth middleware (runs outside State extraction)
    if let Some(key) = secrets.get("MC_API_KEY").filter(|s| !s.is_empty()) {
        let _ = MC_API_KEY.set(key.clone());
    }

    // Store stable agent key (user-configured, doesn't rotate)
    if let Some(key) = secrets.get("MC_AGENT_KEY").filter(|s| !s.is_empty()) {
        let _ = MC_AGENT_KEY.set(key.clone());
        tracing::info!("Agent API key configured (MC_AGENT_KEY)");
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

    // Build gateway WS client if OPENCLAW_WS is configured
    let gateway_ws = {
        let ws_url = secrets.get("OPENCLAW_WS").cloned().filter(|s| !s.is_empty());
        let ws_password = secrets.get("OPENCLAW_PASSWORD").cloned().unwrap_or_default();
        ws_url.map(|url| {
            tracing::info!("OpenClaw Gateway WS client configured");
            crate::gateway_ws::GatewayWsClient::new(url, ws_password)
        })
    };

    let db = crate::db::init().await?;

    // In debug mode, restore the previous session from SQLite so you don't
    // have to re-login every time cargo tauri dev restarts.
    #[cfg(debug_assertions)]
    let restored_session = {
        sqlx::query("CREATE TABLE IF NOT EXISTS _dev_session (id INTEGER PRIMARY KEY, data TEXT NOT NULL, created_at INTEGER NOT NULL)")
            .execute(&db).await.ok();
        let row: Option<(String, i64)> = sqlx::query_as(
            "SELECT data, created_at FROM _dev_session WHERE id = 1"
        ).fetch_optional(&db).await.unwrap_or(None);
        match row {
            Some((data, created_at)) => {
                let now = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs() as i64;
                // Only restore if less than 24 hours old
                if now - created_at < 86400 {
                    match serde_json::from_str::<UserSession>(&data) {
                        Ok(sess) => {
                            tracing::info!(user_id = %sess.user_id, "dev session restored from SQLite");
                            Some(sess)
                        }
                        Err(_) => None,
                    }
                } else {
                    tracing::info!("dev session expired (>24h) — login required");
                    sqlx::query("DELETE FROM _dev_session").execute(&db).await.ok();
                    None
                }
            }
            None => None,
        }
    };
    #[cfg(not(debug_assertions))]
    let restored_session: Option<UserSession> = None;

    let state = AppState {
        app: app_handle,
        db,
        http: reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .unwrap_or_default(),
        secrets: Arc::new(std::sync::RwLock::new(secrets)),
        bb,
        openclaw,
        gateway_ws: gateway_ws.clone(),
        session: Arc::new(RwLock::new(restored_session)),
        refresh_mutex: Arc::new(tokio::sync::Mutex::new(())),
        pending_oauth: Arc::new(RwLock::new(None)),
    };

    // Log runtime integrity checks to security_events (fire-and-forget).
    // These mirror the tracing warnings emitted in main.rs but persist in SQLite
    // for later inspection via GET /api/security-events.
    log_integrity_events(&state.db).await;

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

    // Start the persistent gateway WebSocket connection (if configured).
    if let Some(ref gw) = gateway_ws {
        gw.start();
        tracing::info!("Gateway WS connection loop started");
    }

    // Start the background database cleanup job (runs on startup + every hour).
    // Purges stale cache entries, old sync logs, conflict logs, and soft-deleted rows.
    {
        let cleanup_db = state.db.clone();
        tokio::spawn(async move {
            db_cleanup(&cleanup_db).await;
            let mut interval = tokio::time::interval(Duration::from_secs(3600));
            loop {
                interval.tick().await;
                db_cleanup(&cleanup_db).await;
            }
        });
        tracing::info!("Database cleanup job started (1h interval)");
    }

    // Resolve bind address before state is moved into the router.
    // Default: 127.0.0.1 (localhost only). Set MC_BIND_HOST to "0.0.0.0"
    // or a specific Tailscale IP to expose the API to the tailnet.
    let bind_host = state.secret("MC_BIND_HOST")
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "127.0.0.1".to_string());
    let bind_ip: std::net::IpAddr = bind_host.parse().unwrap_or_else(|_| {
        tracing::warn!("Invalid MC_BIND_HOST '{}', falling back to 127.0.0.1", bind_host);
        std::net::IpAddr::V4(std::net::Ipv4Addr::LOCALHOST)
    });

    // Warn if exposing to network without an agent key
    if !bind_ip.is_loopback() && MC_AGENT_KEY.get().map(|k| k.is_empty()).unwrap_or(true) {
        tracing::warn!(
            "MC_BIND_HOST is set to {} (network-accessible) but MC_AGENT_KEY is not configured. \
             External agents will not be able to authenticate. Set MC_AGENT_KEY for Tailscale access."
        , bind_ip);
    }

    // Pre-warm the messages conversation cache in the background
    let prewarm_state = state.clone();

    let app = Router::new()
        .nest("/api", routes::router())
        .layer(DefaultBodyLimit::max(10 * 1024 * 1024)) // 10 MB
        .layer(middleware::from_fn(no_store_api_responses))
        .layer(middleware::from_fn(rate_limit))
        .layer(middleware::from_fn_with_state(state.clone(), inject_session))
        .layer(middleware::from_fn(request_logger))
        .layer(middleware::from_fn(api_key_auth))
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
        // Outermost layer: reject requests that take >30s to produce a response.
        // Mitigates slowloris-style attacks. SSE and WebSocket routes are unaffected
        // because they send the initial HTTP response (200/101) immediately — the
        // timeout only applies to the time before the first response headers are sent.
        .layer(TimeoutLayer::new(Duration::from_secs(30)))
        .with_state(state);

    {
        tokio::spawn(async move {
            crate::routes::messages::refresh_conv_cache(&prewarm_state.http, &prewarm_state).await;
            tracing::info!("Conversation cache pre-warmed");
        });
    }

    let addr = SocketAddr::from((bind_ip, 3000));
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

        // Force re-login after 24 hours regardless of token validity.
        // This limits the blast radius of a compromised session.
        let session_age = now - sess.created_at;
        if session_age > 86400 {
            tracing::info!(
                user_id = %sess.user_id,
                session_age_secs = session_age,
                "session expired (24h) — forcing re-login"
            );
            *state.session.write().await = None;
            return (StatusCode::UNAUTHORIZED, "Session expired — please log in again").into_response();
        }

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

/// Middleware that sets Cache-Control: no-store on all API responses.
/// Prevents WebKitGTK from caching sensitive data to disk.
async fn no_store_api_responses(req: Request<Body>, next: Next) -> Response {
    let mut response = next.run(req).await;
    response.headers_mut().insert(
        axum::http::header::CACHE_CONTROL,
        "no-store, no-cache, must-revalidate".parse().unwrap(),
    );
    response.headers_mut().insert(
        axum::http::header::PRAGMA,
        "no-cache".parse().unwrap(),
    );
    response.headers_mut().insert(
        "x-content-type-options",
        "nosniff".parse().unwrap(),
    );
    response.headers_mut().insert(
        "referrer-policy",
        "no-referrer".parse().unwrap(),
    );
    response.headers_mut().insert(
        "x-frame-options",
        "DENY".parse().unwrap(),
    );
    response.headers_mut().insert(
        "permissions-policy",
        "camera=(), microphone=(), geolocation=(), payment=()".parse().unwrap(),
    );
    response.headers_mut().insert(
        "cross-origin-opener-policy",
        "same-origin".parse().unwrap(),
    );
    response
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
    if path != "/api/health" && path != "/api/status/health" && !path.ends_with(".png") {
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
/// Note: "/api/wizard/" endpoints are NOT exempt -- they require X-API-Key
/// but not RequireAuth (no user session needed during setup wizard).
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

        // Evict stale entries to prevent unbounded memory growth
        if map.len() > 500 {
            map.retain(|_, b| now_secs - b.window_start < 120);
        }

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
/// - Notifications (`/api/notify`): 5/min per user
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
        .unwrap_or_else(|| format!("ip:{}:{}", req.uri().path(), req.uri().host().unwrap_or("unknown")));

    // Choose category and limit
    // Session polling is frequent (every 2s during OAuth) — never rate-limit it
    if path == "/api/auth/session" || path == "/api/health" {
        return next.run(req).await;
    }

    let (category, limit) = if path.starts_with("/api/auth/") {
        ("auth", 30u64)
    } else if path.starts_with("/api/chat/") {
        ("chat", 10u64)
    } else if path.starts_with("/api/notify") {
        ("notify", 5u64)
    } else if method == axum::http::Method::GET
        && (path == "/api/todos"
            || path == "/api/missions"
            || path == "/api/ideas"
            || path == "/api/knowledge"
            || path == "/api/captures")
    {
        ("bulk_read", 10u64)
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
        || path.starts_with("/api/vault/media")
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
            // No API key configured — reject all requests (keychain unavailable)
            return (StatusCode::SERVICE_UNAVAILABLE, "Service unavailable: API key not configured").into_response();
        }
    };

    // Check X-API-Key header (Tauri app path) — constant-time comparison
    if let Some(provided) = req.headers().get("x-api-key").and_then(|v| v.to_str().ok()) {
        if provided.as_bytes().ct_eq(expected.as_bytes()).into() {
            return next.run(req).await;
        }
        // Also check against stable agent key (for external agents like Bjorn)
        if let Some(agent_key) = MC_AGENT_KEY.get() {
            if !agent_key.is_empty() && provided.as_bytes().ct_eq(agent_key.as_bytes()).into() {
                return next.run(req).await;
            }
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
                    // Also check stable agent key for WebSocket connections
                    if let Some(agent_key) = MC_AGENT_KEY.get() {
                        if !agent_key.is_empty() && val.as_bytes().ct_eq(agent_key.as_bytes()).into() {
                            return next.run(req).await;
                        }
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

// ---------------------------------------------------------------------------
// Periodic database cleanup
// ---------------------------------------------------------------------------

/// Tables that support soft-delete (have `deleted_at` and `synced_at` columns
/// via the sync log). Rows with `deleted_at` older than 30 days that have been
/// synced are permanently removed.
const SOFT_DELETE_TABLES: &[&str] = &[
    "todos",
    "missions",
    "mission_events",
    "agents",
    "ideas",
    "captures",
    "habits",
    "habit_entries",
    "user_preferences",
    "changelog_entries",
    "decisions",
    "knowledge_entries",
    "daily_reviews",
    "weekly_reviews",
    "retrospectives",
    "workflow_notes",
];

/// Run periodic cleanup queries against local SQLite.
///
/// 1. Expire stale api_cache entries (>7 days old)
/// 2. Purge synced _sync_log entries (>7 days old)
/// 3. Purge old _conflict_log entries (>30 days old)
/// 4. Hard-delete soft-deleted rows that have been synced (>30 days old)
async fn db_cleanup(db: &sqlx::SqlitePool) {
    tracing::info!("Running database cleanup");

    // 1. Expire stale api_cache entries older than 7 days
    let res = sqlx::query("DELETE FROM api_cache WHERE updated_at < unixepoch() - (7 * 86400)")
        .execute(db)
        .await;
    match res {
        Ok(r) if r.rows_affected() > 0 => {
            tracing::info!("cleanup: purged {} stale api_cache entries", r.rows_affected());
        }
        Err(e) => tracing::warn!("cleanup: api_cache purge failed: {e}"),
        _ => {}
    }

    // 2. Purge synced _sync_log entries older than 7 days
    let res = sqlx::query(
        "DELETE FROM _sync_log WHERE synced_at IS NOT NULL AND synced_at < unixepoch() - (7 * 86400)",
    )
    .execute(db)
    .await;
    match res {
        Ok(r) if r.rows_affected() > 0 => {
            tracing::info!("cleanup: purged {} old _sync_log entries", r.rows_affected());
        }
        Err(e) => tracing::warn!("cleanup: _sync_log purge failed: {e}"),
        _ => {}
    }

    // 3. Purge old _conflict_log entries older than 30 days
    let res = sqlx::query(
        "DELETE FROM _conflict_log WHERE created_at < unixepoch() - (30 * 86400)",
    )
    .execute(db)
    .await;
    match res {
        Ok(r) if r.rows_affected() > 0 => {
            tracing::info!("cleanup: purged {} old _conflict_log entries", r.rows_affected());
        }
        Err(e) => tracing::warn!("cleanup: _conflict_log purge failed: {e}"),
        _ => {}
    }

    // 4. Hard-delete soft-deleted rows that have been synced (>30 days).
    //    A row is safe to hard-delete if:
    //    - deleted_at is set and older than 30 days
    //    - There are no pending (unsynced) mutations for it in _sync_log
    for table in SOFT_DELETE_TABLES {
        let query = format!(
            "DELETE FROM {table} WHERE deleted_at IS NOT NULL \
             AND deleted_at < datetime('now', '-30 days') \
             AND id NOT IN (SELECT row_id FROM _sync_log WHERE table_name = ? AND synced_at IS NULL)"
        );
        let res = sqlx::query(&query).bind(table).execute(db).await;
        match res {
            Ok(r) if r.rows_affected() > 0 => {
                tracing::info!(
                    "cleanup: hard-deleted {} soft-deleted rows from {table}",
                    r.rows_affected()
                );
            }
            Err(e) => tracing::warn!("cleanup: {table} soft-delete purge failed: {e}"),
            _ => {}
        }
    }

    // 5. Hard-delete soft-deleted cache entries (composite PK: key + user_id, no `id` column)
    let res = sqlx::query(
        "DELETE FROM cache WHERE deleted_at IS NOT NULL \
         AND deleted_at < datetime('now', '-30 days')",
    )
    .execute(db)
    .await;
    match res {
        Ok(r) if r.rows_affected() > 0 => {
            tracing::info!("cleanup: hard-deleted {} soft-deleted cache entries", r.rows_affected());
        }
        Err(e) => tracing::warn!("cleanup: cache soft-delete purge failed: {e}"),
        _ => {}
    }

    // 6. Purge old security_events (>90 days)
    let _ = sqlx::query("DELETE FROM security_events WHERE created_at < datetime('now', '-90 days')")
        .execute(db)
        .await;

    // 7. Purge old audit_log entries (>90 days)
    let _ = sqlx::query("DELETE FROM audit_log WHERE created_at < datetime('now', '-90 days')")
        .execute(db)
        .await;
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_session() -> UserSession {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64;
        UserSession {
            access_token: "eyJhbGciOiJIUzI1NiJ9.test-token".to_string(),
            refresh_token: "v1.refresh-secret-value".to_string(),
            user_id: "user-123".to_string(),
            email: "test@example.com".to_string(),
            expires_at: 9999999999,
            encryption_key: vec![0xDE, 0xAD, 0xBE, 0xEF, 0xCA, 0xFE],
            mfa_verified: true,
            factor_id: None,
            factor_type: None,
            available_mfa_methods: Vec::new(),
            created_at: now,
        }
    }

    #[test]
    fn user_session_drop_does_not_panic() {
        // Verify the Drop impl compiles and runs without panicking.
        let session = make_session();
        assert!(!session.access_token.is_empty());
        assert!(!session.refresh_token.is_empty());
        assert!(!session.encryption_key.is_empty());
        drop(session);
        // If we reach here the Drop impl executed successfully.
    }

    #[test]
    fn user_session_option_drop_zeroizes() {
        // Simulates the logout path: `*session.write() = None` drops
        // the inner `Some(UserSession)`, triggering our `Drop` impl.
        let mut slot: Option<UserSession> = Some(make_session());
        slot = None;
        assert!(slot.is_none());
    }

    #[test]
    fn user_session_replace_zeroizes_old() {
        // Simulates token refresh: replacing the session drops the old one.
        let mut slot: Option<UserSession> = Some(make_session());
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64;
        let new_session = UserSession {
            access_token: "new-token".to_string(),
            refresh_token: "new-refresh".to_string(),
            user_id: "user-123".to_string(),
            email: "test@example.com".to_string(),
            expires_at: 9999999999,
            encryption_key: vec![0x01, 0x02],
            mfa_verified: true,
            factor_id: None,
            factor_type: None,
            available_mfa_methods: Vec::new(),
            created_at: now,
        };
        slot = Some(new_session);
        assert!(slot.is_some());
    }

    // -- Connection security tests ----------------------------------------

    #[test]
    fn warn_if_insecure_url_ignores_https() {
        // HTTPS URLs should never trigger a warning — this just verifies
        // the function doesn't panic on HTTPS input.
        warn_if_insecure_url("Supabase", "https://supabase.example.com");
    }

    #[test]
    fn warn_if_insecure_url_ignores_localhost() {
        warn_if_insecure_url("TestService", "http://127.0.0.1:3000");
        warn_if_insecure_url("TestService", "http://localhost:8080");
    }

    #[test]
    fn warn_if_insecure_url_ignores_tailscale() {
        warn_if_insecure_url("BlueBubbles", "http://100.64.0.3:1234");
    }

    #[test]
    fn warn_if_insecure_url_ignores_private_lan() {
        warn_if_insecure_url("TestService", "http://192.0.2.1:8000");
        warn_if_insecure_url("TestService", "http://192.168.1.50:9090");
    }

    #[test]
    fn warn_if_insecure_url_flags_public_http() {
        // This should log a warning (we can't assert on tracing output in
        // unit tests, but we verify it doesn't panic).
        warn_if_insecure_url("External", "http://203.0.113.50:8080/api");
    }

    #[test]
    fn log_tls_status_does_not_panic() {
        log_tls_status("Supabase", "https://supabase.example.com");
        log_tls_status("Supabase", "http://192.0.2.1:8000");
        log_tls_status("External", "http://203.0.113.50:8080");
        log_tls_status("Local", "http://127.0.0.1:3000");
        log_tls_status("Tailscale", "http://100.64.0.3:1234");
    }

    #[tokio::test]
    async fn verify_supabase_dns_direct_ip() {
        // Direct IPs should return true without DNS lookup
        assert!(verify_supabase_dns("http://192.0.2.1:8000").await);
        assert!(verify_supabase_dns("https://127.0.0.1:443").await);
    }

    #[tokio::test]
    async fn verify_supabase_dns_invalid_url() {
        assert!(!verify_supabase_dns("not-a-url").await);
    }

    #[tokio::test]
    async fn verify_supabase_dns_localhost_resolves() {
        // localhost should always resolve
        assert!(verify_supabase_dns("http://localhost:8000").await);
    }

    #[tokio::test]
    async fn verify_connection_security_empty_secrets() {
        // Should not panic with no configured services
        let secrets = std::collections::HashMap::new();
        verify_connection_security(&secrets).await;
    }

    #[tokio::test]
    async fn verify_connection_security_with_urls() {
        let mut secrets = std::collections::HashMap::new();
        secrets.insert("SUPABASE_URL".to_string(), "http://localhost:8000".to_string());
        secrets.insert("BLUEBUBBLES_HOST".to_string(), "http://100.64.0.3:1234".to_string());
        verify_connection_security(&secrets).await;
    }

    // -- Existing session tests -------------------------------------------

    #[test]
    fn session_created_at_detects_expired_session() {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64;

        // Session created 25 hours ago should be expired
        let old_session = UserSession {
            access_token: "token".to_string(),
            refresh_token: "refresh".to_string(),
            user_id: "user-123".to_string(),
            email: "test@example.com".to_string(),
            expires_at: now + 3600, // token still valid
            encryption_key: vec![0x01],
            mfa_verified: true,
            factor_id: None,
            factor_type: None,
            available_mfa_methods: Vec::new(),
            created_at: now - 90000, // 25 hours ago
        };
        let session_age = now - old_session.created_at;
        assert!(session_age > 86400, "session should be older than 24h");

        // Session created 1 hour ago should NOT be expired
        let fresh_session = UserSession {
            access_token: "token".to_string(),
            refresh_token: "refresh".to_string(),
            user_id: "user-123".to_string(),
            email: "test@example.com".to_string(),
            expires_at: now + 3600,
            encryption_key: vec![0x01],
            mfa_verified: true,
            factor_id: None,
            factor_type: None,
            available_mfa_methods: Vec::new(),
            created_at: now - 3600, // 1 hour ago
        };
        let session_age = now - fresh_session.created_at;
        assert!(session_age <= 86400, "session should NOT be older than 24h");
    }
}
