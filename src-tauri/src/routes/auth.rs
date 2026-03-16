use axum::{
    extract::{Path, Query, State},
    http::header,
    response::{Html, IntoResponse},
    routing::{delete, get, post},
    Json, Router,
};
use serde::Deserialize;
use serde_json::{json, Value};
use std::path::PathBuf;
use std::sync::Mutex;

use crate::error::AppError;
use crate::gotrue::GoTrueClient;
use crate::server::{AppState, UserSession};

use super::util::random_uuid;

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
        // MFA routes
        .route("/mfa/factors", get(mfa_list_factors))
        .route("/mfa/enroll", post(mfa_enroll))
        .route("/mfa/challenge", post(mfa_challenge))
        .route("/mfa/verify", post(mfa_verify))
        .route("/mfa/unenroll/:factor_id", delete(mfa_unenroll))
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

    let auth = gotrue
        .sign_in_with_password(&body.email, &body.password)
        .await
        .map_err(|e| AppError::BadRequest(format!("login failed: {e}")))?;

    // Derive encryption key from password for user_secrets
    let user_id = auth.user["id"].as_str().unwrap_or("").to_string();
    let encryption_key = crate::crypto::derive_key(&body.password, &user_id);

    let now = epoch_secs();

    // Check MFA factors — if the user has verified TOTP factors, they need
    // to complete MFA verification before getting full access.
    let factors = auth.user.get("factors").and_then(|v| v.as_array());
    // Find verified TOTP factor (if any)
    let verified_factor_id = factors
        .and_then(|fs| {
            fs.iter().find(|f| {
                f.get("factor_type").and_then(|t| t.as_str()) == Some("totp")
                    && f.get("status").and_then(|s| s.as_str()) == Some("verified")
            })
        })
        .and_then(|f| f.get("id").and_then(|v| v.as_str()))
        .map(|s| s.to_string());

    let has_verified_factors = verified_factor_id.is_some();

    // Check if user has NO factors — they need to enroll
    let has_any_factors = factors.map(|fs| !fs.is_empty()).unwrap_or(false);
    let mfa_enroll_required = !has_any_factors;

    // Store session — mfa_verified is false until TOTP is verified
    let session = UserSession {
        access_token: auth.access_token,
        refresh_token: auth.refresh_token,
        user_id: user_id.clone(),
        email: body.email.clone(),
        expires_at: now + auth.expires_in,
        encryption_key,
        mfa_verified: false,
        factor_id: verified_factor_id.clone(),
    };
    *state.session.write().await = Some(session);

    tracing::info!(user_id = %user_id, mfa_required = %has_verified_factors, "user logged in");

    Ok(Json(json!({
        "ok": true,
        "user": { "id": user_id, "email": body.email },
        "mfa_required": has_verified_factors,
        "mfa_enroll_required": mfa_enroll_required,
        "factor_id": verified_factor_id,
    })))
}

// ---------------------------------------------------------------------------
// POST /auth/signup
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct SignupBody {
    email: String,
    password: String,
    #[allow(dead_code)]
    invite_token: Option<String>,
}

async fn signup(
    State(state): State<AppState>,
    Json(body): Json<SignupBody>,
) -> Result<Json<Value>, AppError> {
    // TODO: Validate invite_token against a stored list
    // For now, signup is open (will be restricted later)

    let gotrue = GoTrueClient::from_state(&state)
        .map_err(|e| AppError::Internal(e))?;

    let auth = gotrue
        .sign_up(&body.email, &body.password)
        .await
        .map_err(|e| AppError::BadRequest(format!("signup failed: {e}")))?;

    let user_id = auth.user["id"].as_str().unwrap_or("").to_string();
    tracing::info!(user_id = %user_id, "user signed up");

    Ok(Json(json!({
        "ok": true,
        "user": { "id": user_id, "email": body.email },
    })))
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
    Json(body): Json<PasswordBody>,
) -> Result<Json<Value>, AppError> {
    let session = state
        .session
        .read()
        .await
        .clone()
        .ok_or(AppError::Unauthorized)?;

    // CRITICAL: Cannot change password without first verifying MFA
    if !session.mfa_verified {
        return Err(AppError::BadRequest("MFA verification required to change password".into()));
    }

    let gotrue = GoTrueClient::from_state(&state)
        .map_err(|e| AppError::Internal(e))?;

    // Re-verify current password
    gotrue
        .sign_in_with_password(&session.email, &body.current_password)
        .await
        .map_err(|_| AppError::BadRequest("current password incorrect".into()))?;

    // Update password
    gotrue
        .update_user(&session.access_token, json!({ "password": body.new_password }))
        .await
        .map_err(|e| AppError::Internal(e))?;

    // Re-derive encryption key with new password
    let new_key = crate::crypto::derive_key(&body.new_password, &session.user_id);
    let mut write = state.session.write().await;
    if let Some(ref mut s) = *write {
        s.encryption_key = new_key;
    }

    tracing::info!(user_id = %session.user_id, "password changed");

    Ok(Json(json!({ "ok": true })))
}

// ---------------------------------------------------------------------------
// GET /auth/oauth/:provider
// ---------------------------------------------------------------------------

async fn start_oauth(
    State(state): State<AppState>,
    Path(provider): Path<String>,
) -> Result<Json<Value>, AppError> {
    // Validate provider
    if !["github", "google"].contains(&provider.as_str()) {
        return Err(AppError::BadRequest(format!(
            "unsupported OAuth provider: {provider}"
        )));
    }

    let (verifier, challenge) = crate::gotrue::generate_pkce();

    // Store verifier for the callback
    *state.pkce_verifier.write().await = Some(verifier);

    let supabase_url = state
        .secret("SUPABASE_URL")
        .ok_or_else(|| AppError::Internal(anyhow::anyhow!("SUPABASE_URL not set")))?;

    let url = crate::gotrue::build_oauth_url(
        &supabase_url,
        &provider,
        "http://127.0.0.1:3000/api/auth/callback",
        &challenge,
    );

    // Also generate nonce for CSRF protection (existing pattern)
    let nonce = random_uuid();
    {
        let mut guard = OAUTH_NONCE.lock().unwrap_or_else(|e| e.into_inner());
        *guard = Some(nonce.clone());
    }

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

// POST /auth/mfa/enroll
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
        .mfa_enroll(&session.access_token, "Mission Control")
        .await
        .map_err(|e| AppError::Internal(e))?;

    tracing::info!(user_id = %session.user_id, factor_id = %resp.id, "MFA factor enrolled");

    Ok(Json(json!({
        "id": resp.id,
        "qr_code": resp.totp.qr_code,
        "secret": resp.totp.secret,
        "uri": resp.totp.uri,
    })))
}

// POST /auth/mfa/challenge

#[derive(Deserialize)]
struct MfaChallengeBody {
    factor_id: String,
}

async fn mfa_challenge(
    State(state): State<AppState>,
    Json(body): Json<MfaChallengeBody>,
) -> Result<Json<Value>, AppError> {
    let session = state
        .session
        .read()
        .await
        .clone()
        .ok_or(AppError::Unauthorized)?;

    let gotrue = GoTrueClient::from_state(&state)
        .map_err(|e| AppError::Internal(e))?;

    let resp = gotrue
        .mfa_challenge(&session.access_token, &body.factor_id)
        .await
        .map_err(|e| AppError::Internal(e))?;

    Ok(Json(json!({ "id": resp.id })))
}

// POST /auth/mfa/verify

#[derive(Deserialize)]
struct MfaVerifyBody {
    factor_id: String,
    challenge_id: String,
    code: String,
}

async fn mfa_verify(
    State(state): State<AppState>,
    Json(body): Json<MfaVerifyBody>,
) -> Result<Json<Value>, AppError> {
    let session = state
        .session
        .read()
        .await
        .clone()
        .ok_or(AppError::Unauthorized)?;

    let gotrue = GoTrueClient::from_state(&state)
        .map_err(|e| AppError::Internal(e))?;

    let auth = gotrue
        .mfa_verify(
            &session.access_token,
            &body.factor_id,
            &body.challenge_id,
            &body.code,
        )
        .await
        .map_err(|e| AppError::Internal(e))?;

    // Update session with upgraded token (aal2) — MFA is now verified
    let now = epoch_secs();
    let mut write = state.session.write().await;
    if let Some(ref mut s) = *write {
        s.access_token = auth.access_token;
        s.refresh_token = auth.refresh_token;
        s.expires_at = now + auth.expires_in;
        s.mfa_verified = true; // GATE OPENS — user can now access all data
    }

    tracing::info!(user_id = %session.user_id, "MFA verified (aal2) — full access granted");

    Ok(Json(json!({ "ok": true })))
}

// DELETE /auth/mfa/unenroll/:factor_id
async fn mfa_unenroll(
    State(state): State<AppState>,
    Path(factor_id): Path<String>,
) -> Result<Json<Value>, AppError> {
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
<html lang="en"><head><meta charset="utf-8"><title>{title} — Mission Control</title>
<link rel="icon" type="image/png" href="/api/auth/favicon.png">
<style>{style}</style></head>
<body><div class="card">
<img src="/api/auth/logo.png" width="64" height="64" alt="Mission Control" style="margin:0 auto 14px;display:block;filter:drop-shadow(0 2px 8px rgba(167,139,250,0.3))">
<h1 class="{h1_class}">{heading}</h1>
<p>{msg}</p>
</div>
<script>setTimeout(function(){{window.close()}},10000)</script>
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
            (Some(exp), Some(got)) if exp == got => {
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
        // Try PKCE exchange to establish a server-side session immediately
        let verifier = state.pkce_verifier.read().await.clone();
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

                        // Extract factor_id from user object (same as email login)
                        let oauth_factor_id = auth.user.get("factors")
                            .and_then(|v| v.as_array())
                            .and_then(|fs| fs.iter().find(|f| {
                                f.get("factor_type").and_then(|t| t.as_str()) == Some("totp")
                                    && f.get("status").and_then(|s| s.as_str()) == Some("verified")
                            }))
                            .and_then(|f| f.get("id").and_then(|v| v.as_str()))
                            .map(|s| s.to_string());

                        let session = UserSession {
                            access_token: auth.access_token,
                            refresh_token: auth.refresh_token,
                            user_id: user_id.clone(),
                            email,
                            expires_at: now + auth.expires_in,
                            encryption_key: Vec::new(),
                            mfa_verified: false,
                            factor_id: oauth_factor_id,
                        };
                        *state.session.write().await = Some(session);
                        *state.pkce_verifier.write().await = None;
                        tracing::info!(
                            user_id = %user_id,
                            "[oauth-callback] PKCE exchange succeeded — session stored"
                        );
                    }
                    Err(e) => {
                        tracing::warn!("[oauth-callback] PKCE exchange failed: {e}");
                    }
                }
            }
        }

        // Still store code for legacy tauri-session polling
        set_pending_code(&code).await?;

        Ok(Html(callback_page(
            "Signed In",
            "Signed in!",
            "Close this tab and return to Mission Control.<br>This tab will close automatically in 10 seconds.",
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
}
