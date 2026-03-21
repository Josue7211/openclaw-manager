use axum::{
    body::Body,
    extract::State,
    http::header,
    response::{IntoResponse, Response},
    routing::get,
    Json, Router,
};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use serde_json::{json, Map, Value};

use crate::error::{AppError, success_json};
use crate::server::{AppState, RequireAuth};
use crate::supabase::SupabaseClient;

/// User-data tables to export from Supabase.
/// Excludes `cache` (internal sync data) and `user_preferences` (settings, not user content).
/// Includes tables from SYNC_TABLES plus additional user-data tables from the initial migration.
const EXPORT_TABLES: &[&str] = &[
    "todos",
    "missions",
    "mission_events",
    "agents",
    "ideas",
    "captures",
    "habits",
    "habit_entries",
    "changelog_entries",
    "decisions",
    "knowledge_entries",
    "daily_reviews",
    "weekly_reviews",
    "retrospectives",
    "workflow_notes",
    "bjorn_modules",
    "bjorn_module_versions",
    "pipeline_events",
    "activity_log",
];

/// GET /api/export/supabase -- export all user-owned rows from every synced table as JSON.
async fn export_supabase(
    RequireAuth(session): RequireAuth,
    State(state): State<AppState>,
) -> Result<Json<Value>, AppError> {
    let supabase = SupabaseClient::from_state(&state)?;

    let mut tables = Map::new();
    for &table in EXPORT_TABLES {
        match supabase
            .select_as_user(table, "select=*", &session.access_token)
            .await
        {
            Ok(data) => {
                tables.insert(table.to_string(), data);
            }
            Err(e) => {
                tables.insert(
                    table.to_string(),
                    json!({ "error": format!("{e:#}") }),
                );
            }
        }
    }

    tracing::info!(tables = EXPORT_TABLES.len(), "export: supabase data exported");

    Ok(success_json(json!({
        "exported_at": chrono::Utc::now().to_rfc3339(),
        "user_id": session.user_id,
        "tables": tables,
    })))
}

/// GET /api/export/sqlite -- download the local SQLite database file as a binary backup.
async fn export_sqlite(
    RequireAuth(_session): RequireAuth,
    State(_state): State<AppState>,
) -> Result<Response, AppError> {
    let db_path = dirs::data_local_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("mission-control")
        .join("local.db");

    let bytes = tokio::fs::read(&db_path)
        .await
        .map_err(|_| AppError::NotFound("SQLite database not found".into()))?;

    tracing::info!(size_bytes = bytes.len(), "export: sqlite backup sent");

    Ok(Response::builder()
        .header(header::CONTENT_TYPE, "application/octet-stream")
        .header(
            header::CONTENT_DISPOSITION,
            "attachment; filename=\"mission-control-backup.sqlite\"",
        )
        .body(Body::from(bytes))
        .unwrap()
        .into_response())
}

// ── CouchDB helpers (duplicated from vault.rs since they are private) ────

fn vault_config(state: &AppState) -> Option<(String, String, String, String)> {
    let url = state.secret("COUCHDB_URL")?;
    let user = state.secret("COUCHDB_USER")?;
    let pass = state.secret("COUCHDB_PASSWORD")?;
    let db = state
        .secret("COUCHDB_DATABASE")
        .unwrap_or_else(|| "josue-vault".to_string());
    Some((url, user, pass, db))
}

/// Decode chunk data based on note type.
/// LiveSync "plain" type stores raw text; "newnote" stores base64-encoded text.
fn decode_chunk_data(raw: &str, is_binary: bool) -> String {
    if is_binary {
        match BASE64.decode(raw) {
            Ok(bytes) => String::from_utf8(bytes).unwrap_or_default(),
            Err(_) => raw.to_string(),
        }
    } else {
        raw.to_string()
    }
}

/// Check if an ID (lowercased) is a binary attachment, not a text note.
fn is_attachment(id_lower: &str) -> bool {
    const EXTS: &[&str] = &[
        ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".pdf", ".mp3", ".mp4", ".wav",
        ".webm",
    ];
    EXTS.iter().any(|ext| id_lower.ends_with(ext))
}

/// Check if a LiveSync note type indicates base64-encoded chunks.
fn is_binary_note(doc: &Value) -> bool {
    doc.get("type")
        .and_then(|v| v.as_str())
        .map(|t| t == "newnote")
        .unwrap_or(false)
}

/// GET /api/export/notes -- export all notes with reassembled markdown content.
async fn export_notes(
    RequireAuth(_session): RequireAuth,
    State(state): State<AppState>,
) -> Result<Json<Value>, AppError> {
    let (url, user, pass, db) = match vault_config(&state) {
        Some(cfg) => cfg,
        None => {
            return Ok(success_json(json!({
                "notes": [],
                "message": "CouchDB not configured"
            })));
        }
    };

    // Fetch all docs from CouchDB
    let resp = state
        .http
        .get(format!("{url}/{db}/_all_docs?include_docs=true"))
        .basic_auth(&user, Some(&pass))
        .send()
        .await
        .map_err(|e| AppError::Internal(e.into()))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(AppError::BadRequest(format!(
            "CouchDB {status}: {body}"
        )));
    }

    let data: Value = resp
        .json()
        .await
        .map_err(|e| AppError::Internal(e.into()))?;

    let rows = data.get("rows").and_then(|r| r.as_array());
    let all_docs: Vec<&Value> = rows
        .map(|rows| rows.iter().filter_map(|row| row.get("doc")).collect())
        .unwrap_or_default();

    // Build chunk lookup table from h:* docs
    let mut chunks: std::collections::HashMap<&str, &str> = std::collections::HashMap::new();
    for doc in &all_docs {
        if let (Some(id), Some(data)) = (
            doc.get("_id").and_then(|v| v.as_str()),
            doc.get("data").and_then(|v| v.as_str()),
        ) {
            if id.starts_with("h:") {
                chunks.insert(id, data);
            }
        }
    }

    // Filter and reassemble notes
    let notes: Vec<Value> = all_docs
        .iter()
        .filter_map(|doc| {
            let id = doc.get("_id")?.as_str()?;
            // Skip internal LiveSync docs, design docs, obsidian config, and attachments
            if id.starts_with("_design/")
                || id.starts_with("h:")
                || id.starts_with("ps:")
                || id.starts_with("ix:")
                || id.starts_with("cc:")
                || id.contains("/.obsidian/")
                || id.contains(".obsidian/")
                || id.starts_with(".obsidian")
                || id.contains("obsidian-livesync")
                || id.starts_with("!:")
                || id.starts_with("!_")
            {
                return None;
            }
            let id_lower = id.to_lowercase();
            if is_attachment(&id_lower) {
                return None;
            }

            let binary = is_binary_note(doc);
            let eden = doc.get("eden").and_then(|e| e.as_object());

            // Reassemble content from children chunks
            let mut content = String::new();
            if let Some(children) = doc.get("children").and_then(|c| c.as_array()) {
                for child_id in children {
                    if let Some(chunk_id) = child_id.as_str() {
                        if let Some(raw) = chunks.get(chunk_id) {
                            content.push_str(&decode_chunk_data(raw, binary));
                        } else if let Some(raw) = eden
                            .and_then(|e| e.get(chunk_id))
                            .and_then(|v| v.as_object())
                            .and_then(|o| o.get("data"))
                            .and_then(|d| d.as_str())
                        {
                            content.push_str(&decode_chunk_data(raw, binary));
                        }
                    }
                }
            }

            Some(json!({
                "id": id,
                "content": content,
            }))
        })
        .collect();

    let count = notes.len();
    tracing::info!(notes = count, "export: notes exported as markdown");

    Ok(success_json(json!({ "notes": notes })))
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/export/supabase", get(export_supabase))
        .route("/api/export/sqlite", get(export_sqlite))
        .route("/api/export/notes", get(export_notes))
}
