use axum::{routing::get, Json, Router};
use serde_json::{json, Value};
use std::sync::OnceLock;
use std::time::Duration;
use tokio::process::Command;

use crate::error::AppError;
use crate::server::{AppState, RequireAuth};

/// Build the harness CLI compatibility router (sessions, subagents).
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/sessions", get(get_sessions))
        .route("/subagents", get(get_subagents))
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Build a PATH string that includes common binary locations so a harness CLI
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

/// Find the first compatible harness CLI binary on PATH.
fn harness_cli_binary() -> Option<&'static str> {
    static BINARY: OnceLock<Option<&'static str>> = OnceLock::new();
    *BINARY.get_or_init(|| {
        let path = exec_path();
        ["harness", "hermes", "openclaw"]
            .into_iter()
            .find(|binary| {
                path.split(':')
                    .any(|dir| std::path::Path::new(dir).join(binary).exists())
            })
    })
}

/// Run a compatible harness CLI subcommand with a timeout and return stdout.
///
/// Returns `Ok(stdout)` on success, `Err(message)` if the command fails, times
/// out, or the binary is not found.
async fn run_harness_cli(args: &[&str], timeout: Duration) -> Result<String, String> {
    let binary = harness_cli_binary().ok_or_else(|| "harness cli not installed".to_string())?;

    let result = tokio::time::timeout(timeout, async {
        Command::new(binary)
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
                    "harness cli exited with {}: {}",
                    output.status,
                    stderr.trim()
                ))
            }
        }
        Ok(Err(e)) => Err(format!("failed to spawn harness cli: {e}")),
        Err(_) => Err("harness cli command timed out".into()),
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
async fn get_sessions(RequireAuth(_session): RequireAuth) -> Result<Json<Value>, AppError> {
    let timeout = Duration::from_secs(5);

    match run_harness_cli(&["sessions", "list", "--json"], timeout).await {
        Ok(stdout) => {
            let mut sessions = parse_json_array(&stdout);
            sessions.truncate(5);
            Ok(Json(json!({ "sessions": sessions })))
        }
        Err(_) => Ok(Json(json!({
            "sessions": [{
                "id": "main",
                "label": "main session",
                "kind": "main",
                "lastActive": chrono::Utc::now().to_rfc3339(),
            }]
        }))),
    }
}

/// GET /subagents
async fn get_subagents(RequireAuth(_session): RequireAuth) -> Result<Json<Value>, AppError> {
    let timeout = Duration::from_secs(5);

    match run_harness_cli(&["subagents", "list", "--json"], timeout).await {
        Ok(stdout) => {
            let agents = parse_json_array(&stdout);
            let count = agents.len();
            Ok(Json(json!({ "count": count, "agents": agents })))
        }
        Err(_) => Ok(Json(json!({ "count": 0, "agents": [] }))),
    }
}
