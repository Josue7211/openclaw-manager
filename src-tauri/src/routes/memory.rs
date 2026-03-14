use axum::{extract::State, routing::get, Json, Router};
use serde_json::{json, Value};
use std::path::Path;

use crate::error::AppError;
use crate::server::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/memory", get(get_memory))
}

// ── GET /api/memory ─────────────────────────────────────────────────────────

async fn get_memory(State(state): State<AppState>) -> Result<Json<Value>, AppError> {
    // Check for remote OpenClaw API first
    if let Some(openclaw_url) = state.secret("OPENCLAW_API_URL").filter(|s| !s.is_empty()) {
        let client = reqwest::Client::new();
        let mut req = client.get(format!("{openclaw_url}/memory"));
        if let Some(key) = state.secret("OPENCLAW_API_KEY") {
            req = req.header("Authorization", format!("Bearer {key}"));
        }
        match req.send().await {
            Ok(res) if res.status().is_success() => {
                let body: Value = res.json().await.unwrap_or(json!({ "entries": [] }));
                return Ok(Json(body));
            }
            _ => return Ok(Json(json!({ "entries": [] }))),
        }
    }

    // Local filesystem mode
    let home = std::env::var("HOME").unwrap_or_default();
    let memory_dir = Path::new(&home).join(".openclaw/workspace/memory");

    if !memory_dir.exists() {
        return Ok(Json(json!({ "entries": [] })));
    }

    let mut files: Vec<String> = Vec::new();
    let mut dir = match tokio::fs::read_dir(&memory_dir).await {
        Ok(d) => d,
        Err(_) => return Ok(Json(json!({ "entries": [] }))),
    };

    while let Ok(Some(entry)) = dir.next_entry().await {
        let name = entry.file_name().to_string_lossy().to_string();
        if name.ends_with(".md") && !name.starts_with('.') {
            files.push(name);
        }
    }

    files.sort();
    files.reverse();
    files.truncate(5);

    let mut entries = Vec::new();
    for file in &files {
        let file_path = memory_dir.join(file);
        let preview = match tokio::fs::read_to_string(&file_path).await {
            Ok(content) => {
                let first_line = content
                    .lines()
                    .find(|l| {
                        let trimmed = l.trim();
                        !trimmed.is_empty() && !trimmed.starts_with('#')
                    })
                    .unwrap_or("");
                first_line.chars().take(120).collect::<String>()
            }
            Err(_) => String::new(),
        };

        let date = file.trim_end_matches(".md");
        entries.push(json!({
            "date": date,
            "preview": preview,
            "path": format!("memory/{file}"),
        }));
    }

    Ok(Json(json!({ "entries": entries })))
}
