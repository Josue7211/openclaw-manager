use axum::{
    extract::State,
    http::header,
    routing::get,
    Json, Router,
};
use serde::Deserialize;
use serde_json::{json, Value};
use std::path::PathBuf;

use crate::error::AppError;
use crate::server::AppState;

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

pub fn router() -> Router<AppState> {
    Router::new().route(
        "/tauri-session",
        get(get_tauri_session).post(post_tauri_session),
    )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Path to the one-time auth code file: `{tmpdir}/mc-tauri-auth-code`.
fn code_file_path() -> PathBuf {
    std::env::temp_dir().join("mc-tauri-auth-code")
}

/// Store a pending OAuth code to the one-time file.
///
/// This is the Rust equivalent of the TypeScript `setPendingCode`.
/// It is `pub` so that sibling route modules (e.g. an auth callback handler)
/// can call it directly without going through HTTP.
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
