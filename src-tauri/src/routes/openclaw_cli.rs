use axum::{routing::get, Json, Router};
use serde_json::{json, Value};
use std::time::Duration;
use tokio::process::Command;

use crate::error::AppError;
use crate::server::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/sessions", get(get_sessions))
        .route("/subagents", get(get_subagents))
        .route("/crons", get(get_crons))
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Build a PATH string that includes common binary locations so the `openclaw`
/// binary can be found even when the app is launched outside a shell.
fn exec_path() -> String {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".into());
    let inherited = std::env::var("PATH").unwrap_or_default();

    [
        "/usr/local/bin",
        "/usr/bin",
        "/bin",
        &format!("{home}/.local/bin"),
        &format!("{home}/.npm-global/bin"),
        &inherited,
    ]
    .join(":")
}

/// Run an `openclaw` CLI subcommand with a timeout and return its stdout.
///
/// Returns `Ok(stdout)` on success, `Err(message)` if the command fails, times
/// out, or the binary is not found.
async fn run_openclaw(args: &[&str], timeout: Duration) -> Result<String, String> {
    let result = tokio::time::timeout(timeout, async {
        Command::new("openclaw")
            .args(args)
            .env("PATH", exec_path())
            // Suppress stderr so noisy warnings don't leak into output.
            .stderr(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .output()
            .await
    })
    .await;

    match result {
        Ok(Ok(output)) => {
            if output.status.success() {
                String::from_utf8(output.stdout)
                    .map_err(|e| format!("invalid utf-8 in stdout: {e}"))
            } else {
                let stderr = String::from_utf8_lossy(&output.stderr);
                Err(format!(
                    "openclaw exited with {}: {}",
                    output.status,
                    stderr.trim()
                ))
            }
        }
        Ok(Err(e)) => Err(format!("failed to spawn openclaw: {e}")),
        Err(_) => Err("openclaw command timed out".into()),
    }
}

/// Try to parse `raw` as a JSON array. Returns an empty array on any failure.
fn parse_json_array(raw: &str) -> Vec<Value> {
    let trimmed = raw.trim();
    let input = if trimmed.is_empty() { "[]" } else { trimmed };
    match serde_json::from_str::<Value>(input) {
        Ok(Value::Array(arr)) => arr,
        _ => Vec::new(),
    }
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/// GET /sessions
///
/// Mirrors the Next.js behaviour:
/// - On success, returns `{ "sessions": [...] }` (capped at 5 entries).
/// - On failure, returns a single mock session so the UI always has something
///   to render.
async fn get_sessions() -> Result<Json<Value>, AppError> {
    let timeout = Duration::from_secs(5);

    match run_openclaw(&["sessions", "list", "--json"], timeout).await {
        Ok(stdout) => {
            let mut sessions = parse_json_array(&stdout);
            sessions.truncate(5);
            Ok(Json(json!({ "sessions": sessions })))
        }
        Err(_) => {
            // Fallback: return a synthetic "main" session so the UI stays
            // functional even when the daemon is unreachable.
            Ok(Json(json!({
                "sessions": [{
                    "id": "main",
                    "label": "main session",
                    "kind": "main",
                    "lastActive": chrono::Utc::now().to_rfc3339(),
                }]
            })))
        }
    }
}

/// GET /subagents
///
/// Returns `{ "count": N, "agents": [...] }`.
/// Falls back to an empty list on any error.
async fn get_subagents() -> Result<Json<Value>, AppError> {
    let timeout = Duration::from_secs(5);

    match run_openclaw(&["subagents", "list", "--json"], timeout).await {
        Ok(stdout) => {
            let agents = parse_json_array(&stdout);
            let count = agents.len();
            Ok(Json(json!({ "count": count, "agents": agents })))
        }
        Err(_) => Ok(Json(json!({ "count": 0, "agents": [] }))),
    }
}

/// GET /crons
///
/// Returns `{ "jobs": [...] }`.
/// On failure, includes an `"error"` key alongside the empty list, matching
/// the original Next.js route.
async fn get_crons() -> Result<Json<Value>, AppError> {
    // The original TS route used execSync (no explicit timeout). We still apply
    // a generous timeout to avoid hanging the server indefinitely.
    let timeout = Duration::from_secs(10);

    match run_openclaw(&["cron", "list", "--json"], timeout).await {
        Ok(stdout) => {
            let jobs = parse_json_array(&stdout);
            Ok(Json(json!({ "jobs": jobs })))
        }
        Err(msg) => {
            tracing::error!("[crons] {msg}");
            Ok(Json(json!({ "jobs": [], "error": "Failed to list crons" })))
        }
    }
}
