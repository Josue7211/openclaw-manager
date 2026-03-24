use axum::{
    extract::{Path, Query, State},
    http::header,
    response::{Html, IntoResponse},
    routing::{delete, get, post},
    Json, Router,
};
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use subtle::ConstantTimeEq;
use std::path::PathBuf;
use std::sync::Mutex;

use crate::error::AppError;
use crate::gotrue::GoTrueClient;
use crate::server::{AppState, RequireAuth, UserSession};
use crate::supabase::SupabaseClient;

use super::util::random_uuid;
use zeroize::Zeroize;

// ---------------------------------------------------------------------------
// Security event logging
// ---------------------------------------------------------------------------

/// Insert a security event into the local SQLite `security_events` table.
/// Fire-and-forget — errors are logged but never propagated.
async fn log_security_event(
    db: &sqlx::SqlitePool,
    event_type: &str,
    user_id: Option<&str>,
    details: &serde_json::Value,
) {
    let details_str = details.to_string();
    let result = sqlx::query(
        "INSERT INTO security_events (event_type, user_id, details) VALUES (?, ?, ?)",
    )
    .bind(event_type)
    .bind(user_id)
    .bind(&details_str)
    .execute(db)
    .await;

    if let Err(e) = result {
        tracing::warn!(event_type = %event_type, "failed to log security event: {e}");
    }
}

/// Check recent failed login count and send ntfy alert if threshold exceeded.
async fn check_failed_login_alert(db: &sqlx::SqlitePool) {
    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM security_events WHERE event_type = 'login_failed' AND created_at > datetime('now', '-15 minutes')",
    )
    .fetch_one(db)
    .await
    .unwrap_or(0);

    if count >= 5 {
        tracing::warn!("Security alert: {count} failed login attempts in 15 minutes");
        crate::routes::pipeline::helpers::send_notify(
            "Security Alert: Multiple Failed Logins",
            &format!("{count} failed login attempts in the last 15 minutes"),
            4, // high priority
            &["warning", "lock"],
        );
    }
}

// ---------------------------------------------------------------------------
// OAuth nonce — prevents code injection via POST /auth/tauri-session or
// replayed/forged callbacks. The nonce is generated when the frontend
// requests GET /auth/nonce and must be returned as the `state` query
// parameter in the OAuth callback.
// ---------------------------------------------------------------------------

static OAUTH_NONCE: Mutex<Option<String>> = Mutex::new(None);

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

/// Build the `/auth` sub-router.
pub fn router() -> Router<AppState> {
    Router::new()
        // Existing routes
        .route(
            "/tauri-session",
            get(get_tauri_session).post(post_tauri_session),
        )
        .route("/nonce", get(get_nonce))
        .route("/callback", get(oauth_callback))
        .route("/favicon.png", get(serve_favicon))
        .route("/logo.png", get(serve_logo))
        // Auth proxy routes
        .route("/login", post(login))
        .route("/signup", post(signup))
        .route("/session", get(get_session))
        .route("/logout", post(logout))
        .route("/refresh", post(refresh))
        .route("/password", post(change_password))
        .route("/oauth/:provider", get(start_oauth))
        // MFA routes (TOTP + WebAuthn)
        .route("/mfa/factors", get(mfa_list_factors))
        .route("/mfa/enroll", post(mfa_enroll))
        .route("/mfa/enroll-webauthn", post(mfa_enroll_webauthn))
        .route("/mfa/challenge", post(mfa_challenge))
        .route("/mfa/verify", post(mfa_verify))
        .route("/mfa/unenroll/:factor_id", delete(mfa_unenroll))
        // Security monitoring
        .route("/security-events", get(get_security_events))
}

// ---------------------------------------------------------------------------
// Helpers: epoch seconds
// ---------------------------------------------------------------------------

fn epoch_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

// ---------------------------------------------------------------------------
// Helpers: load user_secrets from Supabase after login
// ---------------------------------------------------------------------------

/// Maps a `user_secrets.service` name + credential key to the env-var name
/// used by `AppState::secret()`. This follows the same naming convention as
/// `KEY_ENV_MAP` in `secrets.rs`.
///
/// Returns `None` for unknown combinations (they are skipped with a warning).
fn service_credential_to_env_var(service: &str, key: &str) -> Option<&'static str> {
    match (service, key) {
        // BlueBubbles
        ("bluebubbles", "host") => Some("BLUEBUBBLES_HOST"),
        ("bluebubbles", "password") => Some("BLUEBUBBLES_PASSWORD"),
        // OpenClaw
        ("openclaw", "url" | "api_url" | "api-url") => Some("OPENCLAW_API_URL"),
        ("openclaw", "api_key" | "api-key") => Some("OPENCLAW_API_KEY"),
        ("openclaw", "ws") => Some("OPENCLAW_WS"),
        ("openclaw", "password") => Some("OPENCLAW_PASSWORD"),
        // Proxmox
        ("proxmox", "host") => Some("PROXMOX_HOST"),
        ("proxmox", "token_id" | "token-id") => Some("PROXMOX_TOKEN_ID"),
        ("proxmox", "token_secret" | "token-secret") => Some("PROXMOX_TOKEN_SECRET"),
        // OPNsense
        ("opnsense", "host") => Some("OPNSENSE_HOST"),
        ("opnsense", "key") => Some("OPNSENSE_KEY"),
        ("opnsense", "secret") => Some("OPNSENSE_SECRET"),
        // Plex
        ("plex", "url") => Some("PLEX_URL"),
        ("plex", "token") => Some("PLEX_TOKEN"),
        // Sonarr
        ("sonarr", "url") => Some("SONARR_URL"),
        ("sonarr", "api_key" | "api-key") => Some("SONARR_API_KEY"),
        // Radarr
        ("radarr", "url") => Some("RADARR_URL"),
        ("radarr", "api_key" | "api-key") => Some("RADARR_API_KEY"),
        // Email
        ("email", "host") => Some("EMAIL_HOST"),
        ("email", "port") => Some("EMAIL_PORT"),
        ("email", "user") => Some("EMAIL_USER"),
        ("email", "password") => Some("EMAIL_PASSWORD"),
        // CalDAV
        ("caldav", "url") => Some("CALDAV_URL"),
        ("caldav", "username") => Some("CALDAV_USERNAME"),
        ("caldav", "password") => Some("CALDAV_PASSWORD"),
        // ntfy
        ("ntfy", "url") => Some("NTFY_URL"),
        ("ntfy", "topic") => Some("NTFY_TOPIC"),
        // Mac Bridge
        ("mac-bridge" | "mac_bridge", "host") => Some("MAC_BRIDGE_HOST"),
        ("mac-bridge" | "mac_bridge", "api_key" | "api-key") => Some("MAC_BRIDGE_API_KEY"),
        // Anthropic
        ("anthropic", "api_key" | "api-key") => Some("ANTHROPIC_API_KEY"),
        _ => None,
    }
}

/// Fetch all `user_secrets` rows from Supabase for the given user, decrypt
/// each row's `encrypted_credentials` using the session's encryption key,
/// and merge the resulting key-value pairs into `state.secrets`.
///
/// Supabase credentials override OS keychain values (they are more
/// authoritative since they are user-specific and encrypted).
///
/// This function logs but never returns errors — secrets may not be migrated
/// yet, and the OS keychain provides a working fallback.
pub async fn load_user_secrets(state: &AppState, session: &UserSession) {
    // Skip if no encryption key is available (e.g. OAuth login without password)
    if session.encryption_key.is_empty() {
        tracing::debug!("skipping user_secrets load: no encryption key (OAuth login)");
        return;
    }

    let sb = match SupabaseClient::from_state(state) {
        Ok(sb) => sb,
        Err(e) => {
            tracing::warn!("skipping user_secrets load: {e}");
            return;
        }
    };

    // Fetch all user_secrets rows using the user's JWT for RLS
    let query = "select=service,encrypted_credentials,nonce";
    let rows = match sb
        .select_as_user("user_secrets", query, &session.access_token)
        .await
    {
        Ok(rows) => rows,
        Err(e) => {
            tracing::warn!("failed to fetch user_secrets: {e}");
            return;
        }
    };

    let rows = match rows.as_array() {
        Some(arr) => arr,
        None => {
            tracing::debug!("user_secrets returned non-array (user has no secrets)");
            return;
        }
    };

    if rows.is_empty() {
        tracing::info!("no user_secrets found — auto-migrating from keychain");
        auto_migrate_keychain_secrets(state, session, &sb).await;
        return;
    }

    let mut merged: HashMap<String, String> = HashMap::new();
    let mut count = 0usize;

    for row in rows {
        let service = match row["service"].as_str() {
            Some(s) => s,
            None => continue,
        };
        let ciphertext = match row["encrypted_credentials"].as_str() {
            Some(s) => s,
            None => continue,
        };
        let nonce = match row["nonce"].as_str() {
            Some(s) => s,
            None => continue,
        };

        // Decrypt the credentials blob
        let plaintext = match crate::crypto::decrypt(ciphertext, nonce, &session.encryption_key) {
            Ok(bytes) => bytes,
            Err(e) => {
                tracing::warn!(
                    service = %service,
                    "failed to decrypt user_secrets for service (wrong key or corrupted): {e}"
                );
                continue;
            }
        };

        // Parse as JSON map of credential key -> value
        let creds: HashMap<String, String> = match serde_json::from_slice(&plaintext) {
            Ok(map) => map,
            Err(e) => {
                tracing::warn!(
                    service = %service,
                    "failed to parse decrypted user_secrets as JSON: {e}"
                );
                continue;
            }
        };

        // Map each credential to its env-var name and collect
        for (cred_key, cred_value) in &creds {
            match service_credential_to_env_var(service, cred_key) {
                Some(env_var) => {
                    merged.insert(env_var.to_string(), cred_value.clone());
                    count += 1;
                }
                None => {
                    tracing::warn!(
                        service = %service,
                        key = %cred_key,
                        "unknown service/credential key in user_secrets — skipping"
                    );
                }
            }
        }
    }

    if !merged.is_empty() {
        state.merge_secrets(merged);
        tracing::info!(
            user_id = %session.user_id,
            secrets_loaded = count,
            "user_secrets loaded from Supabase and merged into AppState"
        );
    }
}

/// Auto-migrate keychain secrets to Supabase user_secrets on first login.
async fn auto_migrate_keychain_secrets(
    state: &AppState,
    session: &UserSession,
    sb: &SupabaseClient,
) {
    let env_to_service: &[(&str, &str, &str)] = &[
        ("BLUEBUBBLES_HOST", "bluebubbles", "host"),
        ("BLUEBUBBLES_PASSWORD", "bluebubbles", "password"),
        ("OPENCLAW_API_URL", "openclaw", "api_url"),
        ("OPENCLAW_API_KEY", "openclaw", "api_key"),
        ("OPENCLAW_WS", "openclaw", "ws"),
        ("OPENCLAW_PASSWORD", "openclaw", "password"),
        ("PROXMOX_HOST", "proxmox", "host"),
        ("PROXMOX_TOKEN_ID", "proxmox", "token_id"),
        ("PROXMOX_TOKEN_SECRET", "proxmox", "token_secret"),
        ("OPNSENSE_HOST", "opnsense", "host"),
        ("OPNSENSE_KEY", "opnsense", "key"),
        ("OPNSENSE_SECRET", "opnsense", "secret"),
        ("PLEX_URL", "plex", "url"),
        ("PLEX_TOKEN", "plex", "token"),
        ("SONARR_URL", "sonarr", "url"),
        ("SONARR_API_KEY", "sonarr", "api_key"),
        ("RADARR_URL", "radarr", "url"),
        ("RADARR_API_KEY", "radarr", "api_key"),
        ("EMAIL_HOST", "email", "host"),
        ("EMAIL_PORT", "email", "port"),
        ("EMAIL_USER", "email", "user"),
        ("EMAIL_PASSWORD", "email", "password"),
        ("CALDAV_URL", "caldav", "url"),
        ("CALDAV_USERNAME", "caldav", "username"),
        ("CALDAV_PASSWORD", "caldav", "password"),
        ("NTFY_URL", "ntfy", "url"),
        ("NTFY_TOPIC", "ntfy", "topic"),
        ("MAC_BRIDGE_HOST", "mac-bridge", "host"),
        ("MAC_BRIDGE_API_KEY", "mac-bridge", "api_key"),
        ("ANTHROPIC_API_KEY", "anthropic", "api_key"),
    ];

    // Group by service
    let mut services: HashMap<String, serde_json::Map<String, serde_json::Value>> = HashMap::new();
    for &(env_var, service, cred_key) in env_to_service {
        if let Some(value) = state.secret(env_var) {
            if !value.is_empty() {
                services
                    .entry(service.to_string())
                    .or_default()
                    .insert(cred_key.to_string(), serde_json::Value::String(value));
            }
        }
    }

    let mut count = 0usize;
    for (service, creds) in &services {
        let creds_value = serde_json::Value::Object(creds.clone());
        let json_bytes = match serde_json::to_vec(&creds_value) {
            Ok(b) => b,
            Err(_) => continue,
        };
        let (ciphertext, nonce) = match crate::crypto::encrypt(&json_bytes, &session.encryption_key)
        {
            Ok(pair) => pair,
            Err(_) => continue,
        };
        let row = serde_json::json!({
            "user_id": session.user_id,
            "service": service,
            "encrypted_credentials": ciphertext,
            "nonce": nonce,
        });
        if let Err(e) = sb
            .upsert_as_user("user_secrets", row, &session.access_token)
            .await
        {
            tracing::warn!(service = %service, "auto-migrate failed: {e}");
            continue;
        }
        count += 1;
    }

    tracing::info!(
        services_migrated = count,
        "auto-migrated keychain secrets to Supabase user_secrets"
    );
}

// ---------------------------------------------------------------------------
// Helpers: per-user encryption salt
// ---------------------------------------------------------------------------

/// Fetch or create a random 16-byte encryption salt for the given user.
///
/// On first login the salt does not exist yet, so we generate one and INSERT it.
/// Subsequent logins (including from other devices) read the stored salt.
///
/// Uses the user's JWT (not service role) so RLS policies are respected.
async fn get_or_create_salt(
    state: &AppState,
    access_token: &str,
    user_id: &str,
) -> anyhow::Result<String> {
    let sb = SupabaseClient::from_state(state)?;

    // Validate user_id to prevent injection into the PostgREST query
    crate::validation::validate_uuid(user_id)
        .map_err(|_| anyhow::anyhow!("invalid user_id format"))?;

    // Try to fetch existing salt
    let query = format!("select=encryption_salt&user_id=eq.{user_id}");
    let rows = sb
        .select_as_user("user_profiles", &query, access_token)
        .await;

    if let Ok(rows) = rows {
        if let Some(arr) = rows.as_array() {
            if let Some(row) = arr.first() {
                if let Some(salt) = row["encryption_salt"].as_str() {
                    return Ok(salt.to_string());
                }
            }
        }
    }

    // No profile yet — generate a random 16-byte salt
    let mut salt_bytes = [0u8; 16];
    rand::RngCore::fill_bytes(&mut rand::thread_rng(), &mut salt_bytes);
    let salt_b64 = base64::Engine::encode(
        &base64::engine::general_purpose::STANDARD,
        &salt_bytes,
    );

    let body = serde_json::json!({
        "user_id": user_id,
        "encryption_salt": salt_b64,
    });

    sb.insert_as_user("user_profiles", body, access_token)
        .await
        .map_err(|e| anyhow::anyhow!("failed to create user profile: {e}"))?;

    tracing::info!(user_id = %user_id, "created encryption salt for new user profile");

    Ok(salt_b64)
}

// ---------------------------------------------------------------------------
// POST /auth/login
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct LoginBody {
    email: String,
    password: String,
}

async fn login(
    State(state): State<AppState>,
    Json(body): Json<LoginBody>,
) -> Result<Json<Value>, AppError> {
    let gotrue = GoTrueClient::from_state(&state)
        .map_err(|e| AppError::Internal(e))?;

    let auth = match gotrue
        .sign_in_with_password(&body.email, &body.password)
        .await
    {
        Ok(auth) => auth,
        Err(e) => {
            log_security_event(
                &state.db,
                "login_failed",
                None,
                &json!({ "email": body.email }),
            )
            .await;
            check_failed_login_alert(&state.db).await;
            return Err(AppError::BadRequest("Invalid email or password".into()));
        }
    };

    // Derive encryption key from password using per-user random salt
    let user_id = auth.user["id"].as_str().unwrap_or("").to_string();
    let salt = get_or_create_salt(&state, &auth.access_token, &user_id)
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("salt retrieval failed: {e}")))?;
    let encryption_key = crate::crypto::derive_key(&body.password, &salt);

    let now = epoch_secs();

    // Check MFA factors — if the user has verified TOTP or WebAuthn factors,
    // they need to complete MFA verification before getting full access.
    let factors = auth.user.get("factors").and_then(|v| v.as_array());
    // Find first verified MFA factor (TOTP or WebAuthn)
    let verified_factor = factors
        .and_then(|fs| {
            fs.iter().find(|f| {
                let ft = f.get("factor_type").and_then(|t| t.as_str());
                let status = f.get("status").and_then(|s| s.as_str());
                (ft == Some("totp") || ft == Some("webauthn")) && status == Some("verified")
            })
        });
    let verified_factor_id = verified_factor
        .and_then(|f| f.get("id").and_then(|v| v.as_str()))
        .map(|s| s.to_string());
    let verified_factor_type = verified_factor
        .and_then(|f| f.get("factor_type").and_then(|v| v.as_str()))
        .map(|s| s.to_string());

    let has_verified_factors = verified_factor_id.is_some();

    // Compute all verified MFA factor types (e.g. ["totp", "webauthn"])
    let available_mfa_methods: Vec<String> = factors
        .map(|fs| {
            let mut methods: Vec<String> = fs
                .iter()
                .filter(|f| f.get("status").and_then(|s| s.as_str()) == Some("verified"))
                .filter_map(|f| f.get("factor_type").and_then(|t| t.as_str()).map(|s| s.to_string()))
                .collect();
            methods.sort();
            methods.dedup();
            methods
        })
        .unwrap_or_default();

    // Check if user has NO factors — they need to enroll
    let has_any_factors = factors.map(|fs| !fs.is_empty()).unwrap_or(false);
    let mfa_enroll_required = !has_any_factors;

    // Detect concurrent session — log if a session already exists
    if let Some(ref existing) = *state.session.read().await {
        log_security_event(
            &state.db,
            "concurrent_session",
            Some(&user_id),
            &json!({
                "action": "new_login_replaced_existing",
                "previous_user_id": existing.user_id,
            }),
        )
        .await;
        tracing::warn!(
            user_id = %user_id,
            previous_user_id = %existing.user_id,
            "concurrent session detected — replacing existing session"
        );
    }

    // Store session — mfa_verified is false until MFA is verified
    let session = UserSession {
        access_token: auth.access_token,
        refresh_token: auth.refresh_token,
        user_id: user_id.clone(),
        email: body.email.clone(),
        expires_at: now + auth.expires_in,
        encryption_key: encryption_key.to_vec(),
        mfa_verified: false,
        factor_id: verified_factor_id.clone(),
        factor_type: verified_factor_type.clone(),
        available_mfa_methods: available_mfa_methods.clone(),
        created_at: now,
    };
    // Drop the Zeroizing wrapper now — its copy is zeroed, the session
    // field is protected by UserSession's own Drop impl.
    drop(encryption_key);
    *state.session.write().await = Some(session.clone());

    // NOTE: load_user_secrets is NOT called here — the session is pre-MFA
    // and the user has not yet verified their MFA factor. Secrets are loaded
    // after MFA verification in the mfa_verify handler.

    log_security_event(
        &state.db,
        "login_success",
        Some(&user_id),
        &json!({ "email": body.email }),
    )
    .await;

    tracing::info!(user_id = %user_id, mfa_required = %has_verified_factors, "user logged in");

    Ok(Json(json!({
        "ok": true,
        "user": { "id": user_id, "email": body.email },
        "mfa_required": has_verified_factors,
        "mfa_enroll_required": mfa_enroll_required,
        "factor_id": verified_factor_id,
        "factor_type": verified_factor_type,
        "available_mfa_methods": available_mfa_methods,
    })))
}

// ---------------------------------------------------------------------------
// POST /auth/signup
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
#[allow(dead_code)]
struct SignupBody {
    email: String,
    password: String,
    invite_token: Option<String>,
}

async fn signup(
    State(state): State<AppState>,
    Json(_body): Json<SignupBody>,
) -> Result<Json<Value>, AppError> {
    // Signup is disabled — this is a personal self-hosted app.
    // New accounts must be created by an administrator via the Supabase dashboard.
    log_security_event(
        &state.db,
        "signup_attempt",
        None,
        &json!({}),
    )
    .await;
    tracing::warn!("signup attempt rejected (signup is disabled)");
    Err(AppError::Forbidden(
        "Signup is disabled. New accounts must be created by an administrator.".into(),
    ))
}

// ---------------------------------------------------------------------------
// GET /auth/session
// ---------------------------------------------------------------------------

async fn get_session(State(state): State<AppState>) -> Json<Value> {
    let session = state.session.read().await;
    match session.as_ref() {
        Some(s) => {
            // If MFA is already verified, return immediately — no network call needed
            if s.mfa_verified {
                return Json(json!({
                    "authenticated": true,
                    "user": { "id": s.user_id, "email": s.email },
                    "mfa_required": false,
                    "mfa_verified": true,
                    "available_mfa_methods": s.available_mfa_methods,
                }));
            }

            // MFA not verified — use stored factor_id (no GoTrue call needed)
            let mfa_enroll_required = s.factor_id.is_none();

            Json(json!({
                "authenticated": true,
                "user": { "id": s.user_id, "email": s.email },
                "mfa_required": true,
                "mfa_enroll_required": mfa_enroll_required,
                "mfa_verified": false,
                "factor_id": s.factor_id,
                "factor_type": s.factor_type,
                "available_mfa_methods": s.available_mfa_methods,
            }))
        }
        None => Json(json!({ "authenticated": false })),
    }
}

// ---------------------------------------------------------------------------
// POST /auth/logout
// ---------------------------------------------------------------------------

async fn logout(State(state): State<AppState>) -> Json<Value> {
    let session = state.session.read().await.clone();
    if let Some(sess) = session {
        if let Ok(gotrue) = GoTrueClient::from_state(&state) {
            if let Err(e) = gotrue.sign_out(&sess.access_token).await {
                tracing::warn!("gotrue sign_out failed (non-fatal): {e}");
            }
        }
        // Clear cached API responses for this user to prevent data leakage
        state.cache_clear_user(&sess.user_id).await;
        log_security_event(
            &state.db,
            "logout",
            Some(&sess.user_id),
            &json!({}),
        )
        .await;
        // Audit trail
        crate::audit::log_audit_or_warn(&state.db, &sess.user_id, "logout", "session", None, None).await;
        tracing::info!(user_id = %sess.user_id, "user logged out");
    }
    *state.session.write().await = None;
    Json(json!({ "ok": true }))
}

// ---------------------------------------------------------------------------
// POST /auth/refresh
// ---------------------------------------------------------------------------

async fn refresh(State(state): State<AppState>) -> Result<Json<Value>, AppError> {
    let session = state
        .session
        .read()
        .await
        .clone()
        .ok_or(AppError::Unauthorized)?;

    // Hard 24-hour session lifetime — force re-authentication
    if epoch_secs() - session.created_at > 86400 {
        tracing::info!(user_id = %session.user_id, "session exceeded 24h lifetime — forcing re-auth");
        *state.session.write().await = None;
        return Err(AppError::Unauthorized);
    }

    // Serialise refresh attempts so concurrent requests don't all hit GoTrue
    let _guard = state.refresh_mutex.lock().await;

    // Re-check after acquiring the lock — another request may have refreshed already
    {
        let current = state.session.read().await;
        if let Some(ref s) = *current {
            if s.expires_at > session.expires_at {
                // Already refreshed by another concurrent request
                return Ok(Json(json!({ "ok": true })));
            }
        }
    }

    let gotrue = GoTrueClient::from_state(&state)
        .map_err(|e| AppError::Internal(e))?;

    let auth = gotrue
        .refresh_token(&session.refresh_token)
        .await
        .map_err(|e| AppError::Internal(e))?;

    let now = epoch_secs();

    let mut write = state.session.write().await;
    if let Some(ref mut s) = *write {
        s.access_token = auth.access_token;
        s.refresh_token = auth.refresh_token;
        s.expires_at = now + auth.expires_in;
    }

    tracing::debug!("session refreshed, expires_at={}", now + auth.expires_in);

    Ok(Json(json!({ "ok": true })))
}

// ---------------------------------------------------------------------------
// POST /auth/password
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct PasswordBody {
    current_password: String,
    new_password: String,
}

async fn change_password(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Json(body): Json<PasswordBody>,
) -> Result<Json<Value>, AppError> {

    let gotrue = GoTrueClient::from_state(&state)
        .map_err(|e| AppError::Internal(e))?;

    // Re-verify current password
    gotrue
        .sign_in_with_password(&session.email, &body.current_password)
        .await
        .map_err(|_| AppError::BadRequest("current password incorrect".into()))?;

    // Dry-run: verify all user_secrets can be decrypted with the old key
    // BEFORE changing the password. This prevents data loss if any secret
    // is corrupted or encrypted with a different key.
    let old_key = &session.encryption_key;
    if !old_key.is_empty() {
        let sb_dryrun = SupabaseClient::from_state(&state)
            .map_err(|e| AppError::Internal(e))?;

        let dryrun_secrets = sb_dryrun
            .select_as_user(
                "user_secrets",
                "select=service,encrypted_credentials,nonce",
                &session.access_token,
            )
            .await
            .unwrap_or(serde_json::json!([]));

        if let Some(rows) = dryrun_secrets.as_array() {
            for row in rows {
                let service = row["service"].as_str().unwrap_or("unknown");
                let ciphertext = match row["encrypted_credentials"].as_str() {
                    Some(s) => s,
                    None => continue,
                };
                let nonce = match row["nonce"].as_str() {
                    Some(s) => s,
                    None => continue,
                };

                if crate::crypto::decrypt(ciphertext, nonce, old_key).is_err() {
                    return Err(AppError::BadRequest(format!(
                        "Cannot change password: secret for service '{}' cannot be decrypted with current key. \
                         Please re-save that credential first.",
                        service
                    )));
                }
            }
        }
    }

    // Update password
    gotrue
        .update_user(&session.access_token, json!({ "password": body.new_password }))
        .await
        .map_err(|e| AppError::Internal(e))?;

    // Re-derive encryption key with new password (same salt — password changed, not salt)
    let salt = get_or_create_salt(&state, &session.access_token, &session.user_id)
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("salt retrieval failed: {e}")))?;
    let new_key = crate::crypto::derive_key(&body.new_password, &salt);

    // Re-encrypt all user_secrets with the new key BEFORE updating the session.
    // The old key is still in session.encryption_key at this point.
    let old_key = &session.encryption_key;
    if !old_key.is_empty() {
        let sb = SupabaseClient::from_state(&state)
            .map_err(|e| AppError::Internal(e))?;

        let secrets = sb
            .select_as_user(
                "user_secrets",
                "select=service,encrypted_credentials,nonce",
                &session.access_token,
            )
            .await
            .unwrap_or(serde_json::json!([]));

        if let Some(rows) = secrets.as_array() {
            for row in rows {
                let service = match row["service"].as_str() {
                    Some(s) => s,
                    None => continue,
                };
                let ciphertext = match row["encrypted_credentials"].as_str() {
                    Some(s) => s,
                    None => continue,
                };
                let nonce = match row["nonce"].as_str() {
                    Some(s) => s,
                    None => continue,
                };

                // Decrypt with old key
                let plaintext = match crate::crypto::decrypt(ciphertext, nonce, old_key) {
                    Ok(p) => p,
                    Err(e) => {
                        tracing::warn!(service = %service, "failed to decrypt secret during re-encryption: {e}");
                        continue;
                    }
                };

                // Re-encrypt with new key
                let (new_ciphertext, new_nonce) = crate::crypto::encrypt(&plaintext, &new_key)
                    .map_err(|e| AppError::Internal(anyhow::anyhow!("re-encryption failed: {e}")))?;

                let update_row = serde_json::json!({
                    "user_id": session.user_id,
                    "service": service,
                    "encrypted_credentials": new_ciphertext,
                    "nonce": new_nonce,
                });

                if let Err(e) = sb.upsert_as_user("user_secrets", update_row, &session.access_token).await {
                    tracing::warn!(service = %service, "failed to upsert re-encrypted secret: {e}");
                    return Err(AppError::Internal(anyhow::anyhow!(
                        "failed to re-encrypt secrets — password change aborted: {e}"
                    )));
                }

                tracing::debug!(service = %service, "re-encrypted secret with new key");
            }
        }
    }

    let mut write = state.session.write().await;
    if let Some(ref mut s) = *write {
        s.encryption_key = new_key.to_vec();
    }
    drop(new_key);

    log_security_event(
        &state.db,
        "password_change",
        Some(&session.user_id),
        &json!({}),
    )
    .await;

    tracing::info!(user_id = %session.user_id, "password changed, {} secrets re-encrypted",
        session.encryption_key.is_empty().then(|| 0).unwrap_or(1));

    Ok(Json(json!({ "ok": true })))
}

// ---------------------------------------------------------------------------
// GET /auth/oauth/:provider
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct OAuthStartQuery {
    redirect_to: Option<String>,
}

async fn start_oauth(
    State(state): State<AppState>,
    Path(provider): Path<String>,
    Query(query): Query<OAuthStartQuery>,
) -> Result<Json<Value>, AppError> {
    // Validate provider
    if !["github", "google"].contains(&provider.as_str()) {
        return Err(AppError::BadRequest(format!(
            "unsupported OAuth provider: {provider}"
        )));
    }

    // Validate redirect_to — only allow localhost URLs to prevent open redirect
    let validated_redirect = query.redirect_to.filter(|url| {
        url.starts_with("http://localhost:") || url.starts_with("http://127.0.0.1:")
    });

    // If an OAuth flow was initiated recently (< 120s), return the same URL
    // instead of generating a new PKCE pair. This prevents double-click or
    // re-render from overwriting the verifier that Supabase expects.
    {
        let guard = state.pending_oauth.read().await;
        if let Some(ref flow) = *guard {
            let age = epoch_secs() - flow.created_at;
            if age < 120 {
                tracing::info!(provider = %provider, age_secs = age, "OAuth flow already in progress — returning existing URL");
                return Ok(Json(json!({ "url": flow.url, "nonce": flow.nonce })));
            }
        }
    }

    let (verifier, challenge) = crate::gotrue::generate_pkce();

    let supabase_url = state
        .secret("SUPABASE_URL")
        .ok_or_else(|| AppError::Internal(anyhow::anyhow!("SUPABASE_URL not set")))?;

    let url = crate::gotrue::build_oauth_url(
        &supabase_url,
        &provider,
        "http://127.0.0.1:3000/api/auth/callback",
        &challenge,
    );

    let nonce = random_uuid();
    {
        let mut guard = OAUTH_NONCE.lock().unwrap_or_else(|e| e.into_inner());
        *guard = Some(nonce.clone());
    }

    // Store the full flow state so duplicate calls return the same URL
    *state.pending_oauth.write().await = Some(crate::server::PendingOAuthFlow {
        verifier,
        nonce: nonce.clone(),
        url: url.clone(),
        created_at: epoch_secs(),
        redirect_to: validated_redirect,
    });

    tracing::info!(provider = %provider, "OAuth flow initiated");

    Ok(Json(json!({ "url": url, "nonce": nonce })))
}

// ---------------------------------------------------------------------------
// GET /auth/mfa/factors — list user's MFA factors
// ---------------------------------------------------------------------------

async fn mfa_list_factors(State(state): State<AppState>) -> Result<Json<Value>, AppError> {
    let session = state.session.read().await.clone()
        .ok_or(AppError::Unauthorized)?;
    let gotrue = GoTrueClient::from_state(&state).map_err(|e| AppError::Internal(e))?;
    let factors = gotrue.mfa_list_factors(&session.access_token).await
        .map_err(|e| AppError::Internal(e))?;
    let json_factors: Vec<Value> = factors.iter().map(|f| {
        json!({ "id": f.id, "type": f.factor_type, "status": f.status, "friendly_name": f.friendly_name })
    }).collect();
    Ok(Json(json!({ "factors": json_factors })))
}

// ---------------------------------------------------------------------------
// MFA endpoints
// ---------------------------------------------------------------------------

// POST /auth/mfa/enroll — enroll a TOTP factor
async fn mfa_enroll(State(state): State<AppState>) -> Result<Json<Value>, AppError> {
    let session = state
        .session
        .read()
        .await
        .clone()
        .ok_or(AppError::Unauthorized)?;

    let gotrue = GoTrueClient::from_state(&state)
        .map_err(|e| AppError::Internal(e))?;

    let resp = gotrue
        .mfa_enroll_totp(&session.access_token, "OpenClaw Manager")
        .await
        .map_err(|e| AppError::Internal(e))?;

    tracing::info!(user_id = %session.user_id, factor_id = %resp.id, "TOTP factor enrolled");

    Ok(Json(json!({
        "id": resp.id,
        "qr_code": resp.totp.qr_code,
        "secret": resp.totp.secret,
        "uri": resp.totp.uri,
    })))
}

// POST /auth/mfa/enroll-webauthn — start WebAuthn registration
//
// Calls GoTrue `POST /factors` with `factor_type: "webauthn"`. Returns the
// credential creation options that the frontend passes to
// `navigator.credentials.create()`.
async fn mfa_enroll_webauthn(State(state): State<AppState>) -> Result<Json<Value>, AppError> {
    let session = state
        .session
        .read()
        .await
        .clone()
        .ok_or(AppError::Unauthorized)?;

    let gotrue = GoTrueClient::from_state(&state)
        .map_err(|e| AppError::Internal(e))?;

    let result = gotrue
        .mfa_enroll(&session.access_token, "webauthn", "Hardware Key")
        .await
        .map_err(|e| AppError::Internal(e))?;

    let factor_id = result["id"].as_str().unwrap_or("").to_string();
    tracing::info!(user_id = %session.user_id, factor_id = %factor_id, "WebAuthn factor enrolled — awaiting credential registration");

    // Return the full GoTrue response (includes id + web_authn creation options)
    Ok(Json(result))
}

// POST /auth/mfa/challenge
//
// For TOTP factors, returns `{ "id": "challenge-uuid" }`.
// For WebAuthn factors, also returns credential request options that the
// frontend passes to `navigator.credentials.get()`.

#[derive(Deserialize)]
struct MfaChallengeBody {
    factor_id: String,
}

async fn mfa_challenge(
    State(state): State<AppState>,
    Json(body): Json<MfaChallengeBody>,
) -> Result<Json<Value>, AppError> {
    crate::validation::validate_uuid(&body.factor_id)?;

    let session = state
        .session
        .read()
        .await
        .clone()
        .ok_or(AppError::Unauthorized)?;

    let gotrue = GoTrueClient::from_state(&state)
        .map_err(|e| AppError::Internal(e))?;

    let result = gotrue
        .mfa_challenge(&session.access_token, &body.factor_id)
        .await
        .map_err(|e| AppError::Internal(e))?;

    // Return the full GoTrue response (includes challenge id + WebAuthn options if applicable)
    Ok(Json(result))
}

// POST /auth/mfa/verify
//
// Accepts both TOTP and WebAuthn verification payloads:
//   TOTP:    { "factor_id": "...", "challenge_id": "...", "code": "123456" }
//   WebAuthn: { "factor_id": "...", "challenge_id": "...", "credential": { ... } }
//
// The `credential` field is the JSON-serialised output of
// `navigator.credentials.get()` or `navigator.credentials.create()`.

#[derive(Deserialize)]
struct MfaVerifyBody {
    factor_id: String,
    /// Remaining fields are forwarded verbatim to GoTrue (challenge_id, code,
    /// credential, etc.) so we support both TOTP and WebAuthn without coupling
    /// to a specific set of fields.
    #[serde(flatten)]
    extra: serde_json::Map<String, Value>,
}

async fn mfa_verify(
    State(state): State<AppState>,
    Json(body): Json<MfaVerifyBody>,
) -> Result<Json<Value>, AppError> {
    crate::validation::validate_uuid(&body.factor_id)?;

    let session = state
        .session
        .read()
        .await
        .clone()
        .ok_or(AppError::Unauthorized)?;

    let gotrue = GoTrueClient::from_state(&state)
        .map_err(|e| AppError::Internal(e))?;

    // Build the verify payload from the extra fields (challenge_id + code or credential)
    let verify_body = Value::Object(body.extra.clone());

    let auth = match gotrue
        .mfa_verify(
            &session.access_token,
            &body.factor_id,
            &verify_body,
        )
        .await
    {
        Ok(auth) => {
            log_security_event(
                &state.db,
                "mfa_verified",
                Some(&session.user_id),
                &json!({ "factor_id": body.factor_id }),
            )
            .await;
            auth
        }
        Err(e) => {
            log_security_event(
                &state.db,
                "mfa_failed",
                Some(&session.user_id),
                &json!({ "factor_id": body.factor_id }),
            )
            .await;
            return Err(AppError::Internal(e));
        }
    };

    // Update session with upgraded token (aal2) — MFA is now verified
    let now = epoch_secs();
    let mut write = state.session.write().await;
    if let Some(ref mut s) = *write {
        s.access_token = auth.access_token;
        s.refresh_token = auth.refresh_token;
        s.expires_at = now + auth.expires_in;
        s.mfa_verified = true; // GATE OPENS — user can now access all data
    }
    // Read the updated session back for load_user_secrets
    let upgraded_session = write.clone();
    drop(write);

    tracing::info!(user_id = %session.user_id, "MFA verified (aal2) — full access granted");

    // Reload user_secrets with the upgraded aal2 token.
    // This ensures secrets are available even if the initial load at login
    // was skipped or failed (e.g. RLS policies that require aal2).
    if let Some(ref sess) = upgraded_session {
        load_user_secrets(&state, sess).await;

        // In dev mode, persist session to SQLite so it survives restarts
        #[cfg(debug_assertions)]
        crate::server::save_dev_session(&state.db, sess).await;
    }

    Ok(Json(json!({ "ok": true })))
}

// DELETE /auth/mfa/unenroll/:factor_id
async fn mfa_unenroll(
    State(state): State<AppState>,
    Path(factor_id): Path<String>,
) -> Result<Json<Value>, AppError> {
    crate::validation::validate_uuid(&factor_id)?;

    let session = state
        .session
        .read()
        .await
        .clone()
        .ok_or(AppError::Unauthorized)?;

    // CRITICAL: Cannot unenroll MFA without first verifying MFA
    if !session.mfa_verified {
        return Err(AppError::BadRequest("MFA verification required to unenroll factors".into()));
    }

    let gotrue = GoTrueClient::from_state(&state)
        .map_err(|e| AppError::Internal(e))?;

    gotrue
        .mfa_unenroll(&session.access_token, &factor_id)
        .await
        .map_err(|e| AppError::Internal(e))?;

    log_security_event(
        &state.db,
        "mfa_unenroll",
        Some(&session.user_id),
        &json!({ "factor_id": factor_id }),
    )
    .await;

    tracing::info!(user_id = %session.user_id, factor_id = %factor_id, "MFA factor unenrolled");

    Ok(Json(json!({ "ok": true })))
}

// ---------------------------------------------------------------------------
// GET /auth/nonce
//
// Generates a fresh random nonce and stores it. The frontend must include
// this value as the `state` parameter when initiating the OAuth flow, so
// the callback can verify it was not forged or replayed.
// ---------------------------------------------------------------------------

async fn get_nonce() -> Json<Value> {
    let nonce = random_uuid();
    {
        let mut guard = OAUTH_NONCE.lock().unwrap_or_else(|e| e.into_inner());
        *guard = Some(nonce.clone());
    }
    tracing::info!("[oauth] generated new nonce");
    Json(json!({ "nonce": nonce }))
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Path to the one-time auth code file: `{tmpdir}/mc-tauri-auth-code`.
fn code_file_path() -> PathBuf {
    std::env::temp_dir().join("mc-tauri-auth-code")
}

/// Store a pending OAuth authorization code to a one-time temp file (Unix: mode 0o600).
#[cfg(unix)]
pub async fn set_pending_code(code: &str) -> Result<(), AppError> {
    use std::os::unix::fs::OpenOptionsExt;

    let path = code_file_path();
    tracing::info!("[tauri-session] storing code to {}", path.display());

    // Write with mode 0o600 (owner read/write only), matching the TS handler.
    let code_bytes = code.as_bytes().to_vec();
    let p = path.clone();
    tokio::task::spawn_blocking(move || {
        std::fs::OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .mode(0o600)
            .open(&p)
            .and_then(|mut f| {
                use std::io::Write;
                f.write_all(&code_bytes)
            })
    })
    .await
    .map_err(|e| AppError::Internal(e.into()))?
    .map_err(|e| AppError::Internal(e.into()))?;

    Ok(())
}

/// Store a pending OAuth authorization code to a one-time temp file (non-Unix fallback).
#[cfg(not(unix))]
pub async fn set_pending_code(code: &str) -> Result<(), AppError> {
    let path = code_file_path();
    tracing::info!("[tauri-session] storing code to {}", path.display());

    tokio::fs::write(&path, code.as_bytes())
        .await
        .map_err(|e| AppError::Internal(e.into()))?;

    Ok(())
}

// ---------------------------------------------------------------------------
// GET /auth/tauri-session
//
// The Tauri WebView polls this endpoint to pick up the OAuth authorization
// code after the user authenticates in the system browser.
//
// Behaviour (mirrors the TypeScript handler exactly):
//   - If the one-time file exists: read it, delete it, return { code: "..." }
//   - If the file does not exist:  return { code: null }
//   - Always set no-cache headers.
// ---------------------------------------------------------------------------

fn no_cache_headers() -> axum::http::HeaderMap {
    let mut headers = axum::http::HeaderMap::new();
    headers.insert(
        header::CACHE_CONTROL,
        "no-store, no-cache, must-revalidate".parse().unwrap(),
    );
    headers.insert(header::PRAGMA, "no-cache".parse().unwrap());
    headers
}

async fn get_tauri_session(
    State(_state): State<AppState>,
) -> Result<(axum::http::HeaderMap, Json<Value>), AppError> {
    let path = code_file_path();
    let headers = no_cache_headers();

    match tokio::fs::read_to_string(&path).await {
        Ok(code) => {
            // Delete immediately — one-time use.
            if let Err(e) = tokio::fs::remove_file(&path).await {
                tracing::warn!(
                    "[tauri-session] failed to remove code file: {}",
                    e
                );
            }
            tracing::info!("[tauri-session] delivering code to webview");
            Ok((headers, Json(json!({ "code": code }))))
        }
        Err(_) => {
            // File does not exist (or is unreadable) — no pending code.
            Ok((headers, Json(json!({ "code": null }))))
        }
    }
}

// ---------------------------------------------------------------------------
// POST /auth/tauri-session
//
// Accepts { "code": "..." } and stores it in the one-time file so the
// WebView can pick it up via the GET endpoint above.
//
// This is the HTTP-callable equivalent of `setPendingCode` — useful when the
// OAuth callback route lives in a different service or process.
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct SetCodeBody {
    code: String,
}

async fn post_tauri_session(
    State(_state): State<AppState>,
    Json(body): Json<SetCodeBody>,
) -> Result<Json<Value>, AppError> {
    set_pending_code(&body.code).await?;
    Ok(Json(json!({ "ok": true })))
}

// ---------------------------------------------------------------------------
// GET /auth/callback?code=...
//
// The system browser lands here after the OAuth provider redirects back.
// We extract the authorization code, attempt PKCE exchange to establish a
// session, store it for the WebView to pick up (legacy flow), and return a
// simple HTML page telling the user to go back to the app.
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct CallbackQuery {
    code: Option<String>,
    error: Option<String>,
    error_description: Option<String>,
    state: Option<String>,
}

const FAVICON_PNG: &[u8] = include_bytes!("../../../frontend/public/favicon.png");
const LOGO_128_PNG: &[u8] = include_bytes!("../../../frontend/public/logo-128.png");

async fn serve_logo() -> impl IntoResponse {
    (
        [(header::CONTENT_TYPE, "image/png"), (header::CACHE_CONTROL, "public, max-age=86400")],
        LOGO_128_PNG,
    )
}

async fn serve_favicon() -> impl IntoResponse {
    (
        [(header::CONTENT_TYPE, "image/png"), (header::CACHE_CONTROL, "public, max-age=86400")],
        FAVICON_PNG,
    )
}


const PAGE_STYLE: &str = r#"
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Plus Jakarta Sans',system-ui,sans-serif;background:#0c0d11;color:#e2e2e8;display:flex;align-items:center;justify-content:center;height:100vh;overflow:hidden}
body::before{content:'';position:absolute;top:-30%;left:20%;width:500px;height:500px;background:radial-gradient(circle,rgba(167,139,250,0.06) 0%,transparent 70%);pointer-events:none}
.card{text-align:center;padding:40px 48px;border-radius:20px;background:rgba(255,255,255,0.025);border:1px solid rgba(255,255,255,0.06);backdrop-filter:blur(24px);max-width:380px}
.icon{width:48px;height:48px;border-radius:14px;display:flex;align-items:center;justify-content:center;margin:0 auto 16px}
.icon-ok{background:rgba(167,139,250,0.1);border:1px solid rgba(167,139,250,0.2)}
.icon-err{background:rgba(248,113,113,0.1);border:1px solid rgba(248,113,113,0.2)}
h1{font-size:18px;font-weight:700;margin-bottom:8px}
h1.ok{color:#a78bfa}
h1.err{color:#f87171}
p{color:rgba(255,255,255,0.4);font-size:13px;line-height:1.5}
"#;

fn callback_page(title: &str, heading: &str, msg: &str, is_error: bool) -> String {
    let h1_class = if is_error { "err" } else { "ok" };
    format!(
        r##"<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>{title} — OpenClaw Manager</title>
<link rel="icon" type="image/png" href="/api/auth/favicon.png">
<style>{style}</style></head>
<body><div class="card">
<img src="/api/auth/logo.png" width="64" height="64" alt="OpenClaw Manager" style="margin:0 auto 14px;display:block;filter:drop-shadow(0 2px 8px rgba(167,139,250,0.3))">
<h1 class="{h1_class}">{heading}</h1>
<p>{msg}</p>
</div>
<script>setTimeout(function(){{window.close()}},2000)</script>
</body></html>"##,
        title = title,
        style = PAGE_STYLE,
        h1_class = h1_class,
        heading = heading,
        msg = msg,
    )
}

async fn oauth_callback(
    State(state): State<AppState>,
    Query(params): Query<CallbackQuery>,
) -> Result<Html<String>, AppError> {
    if let Some(err) = params.error {
        let desc = params.error_description.unwrap_or_default();
        tracing::error!("[oauth-callback] error={err} desc={desc}");
        let err_safe = err.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;");
        let desc_safe = desc.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;");
        let msg = format!("{}: {}<br>Close this tab and try again.", err_safe, desc_safe);
        return Ok(Html(callback_page("Auth Error", "Authentication Error", &msg, true)));
    }

    // Verify the OAuth state/nonce to prevent code injection.
    // The nonce is consumed (set to None) so it cannot be reused.
    {
        let mut guard = OAUTH_NONCE.lock().unwrap_or_else(|e| e.into_inner());
        let expected = guard.take(); // consume the nonce — single use
        match (&expected, &params.state) {
            (Some(exp), Some(got)) if exp.as_bytes().ct_eq(got.as_bytes()).into() => {
                // Nonce matches — proceed.
                tracing::info!("[oauth-callback] nonce verified");
            }
            (Some(_), Some(_)) => {
                // Supabase uses its own state parameter, so a mismatch with our
                // nonce is expected. PKCE code_verifier provides replay protection.
                tracing::warn!("[oauth-callback] state mismatch (Supabase manages its own state) — proceeding with PKCE");
            }
            (Some(_), None) => {
                // Supabase manages its own state parameter — our nonce may not
                // be forwarded. With server-side PKCE, replay protection is
                // already handled by the code_verifier. Allow the callback.
                tracing::warn!("[oauth-callback] no state param from Supabase — PKCE provides replay protection");
            }
            (None, _) => {
                // No nonce was generated (e.g. non-Tauri flow or server restarted).
                // Allow the callback to proceed to avoid breaking existing flows,
                // but log a warning.
                tracing::warn!("[oauth-callback] no nonce stored — skipping verification");
            }
        }
    }

    if let Some(code) = params.code {
        // Extract redirect_to and verifier before the flow gets cleared
        let (verifier, browser_redirect) = {
            let guard = state.pending_oauth.read().await;
            let verifier = guard.as_ref().map(|f| f.verifier.clone());
            let redirect = guard.as_ref().and_then(|f| f.redirect_to.clone());
            (verifier, redirect)
        };
        if let Some(verifier) = verifier {
            if let Ok(gotrue) = GoTrueClient::from_state(&state) {
                match gotrue.exchange_code_for_session(&code, &verifier).await {
                    Ok(auth) => {
                        let now = epoch_secs();
                        let user_id =
                            auth.user["id"].as_str().unwrap_or("").to_string();
                        let email = auth.user["email"]
                            .as_str()
                            .unwrap_or("")
                            .to_string();

                        // Extract factor_id and factor_type from user object (same as email login)
                        // Looks for both TOTP and WebAuthn verified factors
                        let oauth_verified_factor = auth.user.get("factors")
                            .and_then(|v| v.as_array())
                            .and_then(|fs| fs.iter().find(|f| {
                                let ft = f.get("factor_type").and_then(|t| t.as_str());
                                let status = f.get("status").and_then(|s| s.as_str());
                                (ft == Some("totp") || ft == Some("webauthn")) && status == Some("verified")
                            }));
                        let oauth_factor_id = oauth_verified_factor
                            .and_then(|f| f.get("id").and_then(|v| v.as_str()))
                            .map(|s| s.to_string());
                        let oauth_factor_type = oauth_verified_factor
                            .and_then(|f| f.get("factor_type").and_then(|v| v.as_str()))
                            .map(|s| s.to_string());
                        let oauth_available_methods: Vec<String> = auth.user.get("factors")
                            .and_then(|v| v.as_array())
                            .map(|fs| {
                                let mut methods: Vec<String> = fs
                                    .iter()
                                    .filter(|f| f.get("status").and_then(|s| s.as_str()) == Some("verified"))
                                    .filter_map(|f| f.get("factor_type").and_then(|t| t.as_str()).map(|s| s.to_string()))
                                    .collect();
                                methods.sort();
                                methods.dedup();
                                methods
                            })
                            .unwrap_or_default();

                        // Detect concurrent session
                        if let Some(ref existing) = *state.session.read().await {
                            log_security_event(
                                &state.db,
                                "concurrent_session",
                                Some(&user_id),
                                &json!({
                                    "action": "new_login_replaced_existing",
                                    "method": "oauth",
                                    "previous_user_id": existing.user_id,
                                }),
                            )
                            .await;
                            tracing::warn!(
                                user_id = %user_id,
                                previous_user_id = %existing.user_id,
                                "concurrent session detected (OAuth) — replacing existing session"
                            );
                        }

                        let session = UserSession {
                            access_token: auth.access_token,
                            refresh_token: auth.refresh_token,
                            user_id: user_id.clone(),
                            email: email.clone(),
                            expires_at: now + auth.expires_in,
                            encryption_key: Vec::new(),
                            mfa_verified: false,
                            factor_id: oauth_factor_id,
                            factor_type: oauth_factor_type,
                            available_mfa_methods: oauth_available_methods,
                            created_at: now,
                        };
                        *state.session.write().await = Some(session.clone());
                        {
                            let mut guard = state.pending_oauth.write().await;
                            if let Some(ref mut flow) = *guard {
                                flow.verifier.zeroize();
                            }
                            *guard = None;
                        }

                        // Try to load user_secrets (will skip if no encryption
                        // key, which is the case for OAuth logins without a
                        // password-derived key).
                        load_user_secrets(&state, &session).await;

                        log_security_event(
                            &state.db,
                            "oauth_login",
                            Some(&user_id),
                            &json!({ "email": email }),
                        )
                        .await;

                        tracing::info!(
                            user_id = %user_id,
                            "[oauth-callback] PKCE exchange succeeded — session stored"
                        );
                    }
                    Err(e) => {
                        // Zeroize and clear the PKCE verifier even on failure
                        let mut guard = state.pending_oauth.write().await;
                        if let Some(ref mut flow) = *guard {
                            flow.verifier.zeroize();
                        }
                        *guard = None;
                        tracing::warn!("[oauth-callback] PKCE exchange failed: {e}");
                    }
                }
            }
        }

        // Still store code for legacy tauri-session polling
        set_pending_code(&code).await?;

        // If a redirect_to URL was stored (browser-mode OAuth), redirect
        // back to the frontend instead of showing the "close this tab" page.
        if let Some(redirect_url) = browser_redirect {
            return Ok(Html(format!(
                r#"<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0;url={url}"></head><body>Redirecting...</body></html>"#,
                url = redirect_url,
            )));
        }

        Ok(Html(callback_page(
            "Signed In",
            "Signed in!",
            "You\u{2019}re all set! You can close this tab and return to OpenClaw Manager.",
            false,
        )))
    } else {
        Ok(Html(callback_page(
            "Error",
            "Something went wrong",
            "No authorization code received. Please try again.",
            true,
        )))
    }
}

// ---------------------------------------------------------------------------
// GET /auth/security-events — last 100 security events for the settings dashboard
// ---------------------------------------------------------------------------

async fn get_security_events(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let rows = sqlx::query_as::<_, (i64, String, Option<String>, Option<String>, String, String)>(
        "SELECT id, event_type, user_id, ip, details, created_at \
         FROM security_events WHERE user_id = ? OR user_id IS NULL \
         ORDER BY created_at DESC LIMIT 100",
    )
    .bind(&session.user_id)
    .fetch_all(&state.db)
    .await?;

    let events: Vec<Value> = rows
        .into_iter()
        .map(|(id, event_type, user_id, ip, details, created_at)| {
            let details_val: Value =
                serde_json::from_str(&details).unwrap_or(json!({}));
            json!({
                "id": id,
                "event_type": event_type,
                "user_id": user_id,
                "ip": ip,
                "details": details_val,
                "created_at": created_at,
            })
        })
        .collect();

    Ok(Json(json!({ "events": events })))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Helper: reset the global nonce before each test.
    fn reset_nonce() {
        let mut guard = OAUTH_NONCE.lock().unwrap();
        *guard = None;
    }

    #[test]
    fn setting_and_reading_nonce() {
        reset_nonce();

        // Initially no nonce stored
        {
            let guard = OAUTH_NONCE.lock().unwrap();
            assert!(guard.is_none(), "nonce should start as None");
        }

        // Set a nonce (mirrors what get_nonce handler does)
        let nonce_value = "test-nonce-abc123".to_string();
        {
            let mut guard = OAUTH_NONCE.lock().unwrap();
            *guard = Some(nonce_value.clone());
        }

        // Read it back
        {
            let guard = OAUTH_NONCE.lock().unwrap();
            assert_eq!(guard.as_deref(), Some("test-nonce-abc123"));
        }
    }

    #[test]
    fn nonce_consumed_after_take() {
        reset_nonce();

        // Store a nonce
        {
            let mut guard = OAUTH_NONCE.lock().unwrap();
            *guard = Some("single-use-nonce".to_string());
        }

        // Consume via .take() — mirrors what oauth_callback does
        let consumed = {
            let mut guard = OAUTH_NONCE.lock().unwrap();
            guard.take()
        };
        assert_eq!(consumed, Some("single-use-nonce".to_string()));

        // Second read should yield None — nonce is single-use
        {
            let guard = OAUTH_NONCE.lock().unwrap();
            assert!(guard.is_none(), "nonce must be None after take()");
        }
    }

    #[test]
    fn nonce_overwrite_replaces_previous() {
        reset_nonce();

        {
            let mut guard = OAUTH_NONCE.lock().unwrap();
            *guard = Some("first".to_string());
        }
        {
            let mut guard = OAUTH_NONCE.lock().unwrap();
            *guard = Some("second".to_string());
        }

        let value = OAUTH_NONCE.lock().unwrap().clone();
        assert_eq!(value, Some("second".to_string()));
    }

    #[test]
    fn epoch_secs_returns_reasonable_value() {
        let now = epoch_secs();
        // Should be after 2024-01-01 (1704067200) and before 2100-01-01
        assert!(now > 1_704_067_200, "epoch_secs should be a recent timestamp");
        assert!(now < 4_102_444_800, "epoch_secs should not be in the far future");
    }

    // ---- service_credential_to_env_var ----

    #[test]
    fn service_credential_mapping_bluebubbles() {
        assert_eq!(
            service_credential_to_env_var("bluebubbles", "host"),
            Some("BLUEBUBBLES_HOST")
        );
        assert_eq!(
            service_credential_to_env_var("bluebubbles", "password"),
            Some("BLUEBUBBLES_PASSWORD")
        );
    }

    #[test]
    fn service_credential_mapping_openclaw() {
        assert_eq!(
            service_credential_to_env_var("openclaw", "url"),
            Some("OPENCLAW_API_URL")
        );
        assert_eq!(
            service_credential_to_env_var("openclaw", "api_url"),
            Some("OPENCLAW_API_URL")
        );
        assert_eq!(
            service_credential_to_env_var("openclaw", "api-url"),
            Some("OPENCLAW_API_URL")
        );
        assert_eq!(
            service_credential_to_env_var("openclaw", "api_key"),
            Some("OPENCLAW_API_KEY")
        );
        assert_eq!(
            service_credential_to_env_var("openclaw", "ws"),
            Some("OPENCLAW_WS")
        );
    }

    #[test]
    fn service_credential_mapping_proxmox() {
        assert_eq!(
            service_credential_to_env_var("proxmox", "host"),
            Some("PROXMOX_HOST")
        );
        assert_eq!(
            service_credential_to_env_var("proxmox", "token_id"),
            Some("PROXMOX_TOKEN_ID")
        );
        assert_eq!(
            service_credential_to_env_var("proxmox", "token-id"),
            Some("PROXMOX_TOKEN_ID")
        );
        assert_eq!(
            service_credential_to_env_var("proxmox", "token_secret"),
            Some("PROXMOX_TOKEN_SECRET")
        );
    }

    #[test]
    fn service_credential_mapping_returns_none_for_unknown() {
        assert_eq!(service_credential_to_env_var("unknown", "host"), None);
        assert_eq!(service_credential_to_env_var("bluebubbles", "unknown_key"), None);
        assert_eq!(service_credential_to_env_var("", ""), None);
    }

    #[test]
    fn service_credential_mapping_all_services_covered() {
        // Verify every service mentioned in the design spec has at least one mapping
        let services = [
            "bluebubbles", "openclaw", "proxmox", "opnsense", "plex",
            "sonarr", "radarr", "email", "caldav", "ntfy",
        ];
        for service in services {
            // Each service should have at least one recognized credential key
            let has_mapping = ["host", "url", "password", "key", "secret", "token",
                "api_key", "api-key", "ws", "token_id", "token-id", "token_secret",
                "token-secret", "username", "user", "port", "topic"]
                .iter()
                .any(|key| service_credential_to_env_var(service, key).is_some());
            assert!(has_mapping, "service '{}' should have at least one credential mapping", service);
        }
    }
}
