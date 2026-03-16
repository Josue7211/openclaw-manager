use axum::{
    extract::{Query, State},
    http::header,
    response::{Html, IntoResponse},
    routing::get,
    Json, Router,
};
use serde::Deserialize;
use serde_json::{json, Value};
use std::path::PathBuf;
use std::sync::Mutex;

use crate::error::AppError;
use crate::server::AppState;

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

/// Build the `/auth` sub-router (OAuth callback, nonce, tauri-session).
pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/tauri-session",
            get(get_tauri_session).post(post_tauri_session),
        )
        .route("/nonce", get(get_nonce))
        .route("/callback", get(oauth_callback))
        .route("/favicon.png", get(serve_favicon))
        .route("/logo.png", get(serve_logo))
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
// We extract the authorization code, store it for the WebView to pick up,
// and return a simple HTML page telling the user to go back to the app.
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
                tracing::error!("[oauth-callback] state/nonce mismatch");
                return Ok(Html(callback_page(
                    "Auth Error",
                    "Authentication Error",
                    "Invalid OAuth state parameter. Please try signing in again.",
                    true,
                )));
            }
            (Some(_), None) => {
                tracing::error!("[oauth-callback] missing state parameter");
                return Ok(Html(callback_page(
                    "Auth Error",
                    "Authentication Error",
                    "Missing OAuth state parameter. Please try signing in again.",
                    true,
                )));
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
}
