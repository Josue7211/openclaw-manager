use axum::{routing::get, Json, Router};
use serde_json::{json, Value};
use std::sync::OnceLock;
use std::time::Duration;
use tokio::process::Command;

use crate::error::AppError;
use crate::server::AppState;

/// Build the OpenClaw CLI router (sessions, subagents, cron jobs).
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

/// Check once whether `openclaw` binary exists on PATH.
fn openclaw_available() -> bool {
    static AVAILABLE: OnceLock<bool> = OnceLock::new();
    *AVAILABLE.get_or_init(|| {
        let path = exec_path();
        path.split(':')
            .any(|dir| std::path::Path::new(dir).join("openclaw").exists())
    })
}

/// Run an `openclaw` CLI subcommand with a timeout and return its stdout.
///
/// Returns `Ok(stdout)` on success, `Err(message)` if the command fails, times
/// out, or the binary is not found.
async fn run_openclaw(args: &[&str], timeout: Duration) -> Result<String, String> {
    if !openclaw_available() {
        return Err("openclaw not installed".into());
    }

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
async fn get_sessions() -> Result<Json<Value>, AppError> {
    let timeout = Duration::from_secs(5);

    match run_openclaw(&["sessions", "list", "--json"], timeout).await {
        Ok(stdout) => {
            let mut sessions = parse_json_array(&stdout);
            sessions.truncate(5);
            Ok(Json(json!({ "sessions": sessions })))
        }
        Err(_) => {
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
async fn get_crons() -> Result<Json<Value>, AppError> {
    let timeout = Duration::from_secs(10);

    match run_openclaw(&["cron", "list", "--json"], timeout).await {
        Ok(stdout) => {
            let jobs = parse_json_array(&stdout);
            Ok(Json(json!({ "jobs": jobs })))
        }
        Err(_) => Ok(Json(json!({ "jobs": [] }))),
    }
}
