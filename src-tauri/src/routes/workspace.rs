use axum::{
    extract::{Query, State},
    routing::get,
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};

use crate::error::AppError;
use crate::server::{AppState, RequireAuth};

const MAX_FILE_SIZE: u64 = 5 * 1024 * 1024; // 5 MB

const CORE_FILES: &[&str] = &[
    "SOUL.md",
    "AGENTS.md",
    "USER.md",
    "IDENTITY.md",
    "TOOLS.md",
    "HEARTBEAT.md",
    "RESEARCH.md",
    "BOOTSTRAP.md",
];

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

// Called by: frontend/src/pages/Memory.tsx (list_files, read_file, write_file, delete_file)
/// Build the `/workspace` sub-router (list, read, write, delete workspace files).
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/files", get(list_files))
        .route("/file", get(read_file).post(write_file).delete(delete_file))
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Return the workspace directory: `$OPENCLAW_DIR/workspace` or `~/.openclaw/workspace`.
fn workspace_dir_from(state: &AppState) -> PathBuf {
    let base = state.secret("OPENCLAW_DIR").unwrap_or_else(|| {
        dirs::home_dir()
            .map(|h| h.join(".openclaw").to_string_lossy().into_owned())
            .unwrap_or_else(|| ".openclaw".to_string())
    });
    Path::new(&base).join("workspace")
}

/// Stateless fallback for `safe_path` (only needs the default dir).
fn workspace_dir() -> PathBuf {
    let base = dirs::home_dir()
        .map(|h| h.join(".openclaw").to_string_lossy().into_owned())
        .unwrap_or_else(|| ".openclaw".to_string());
    Path::new(&base).join("workspace")
}

/// Return `(OPENCLAW_API_URL, OPENCLAW_API_KEY)` when remote mode is active.
fn remote_config(state: &AppState) -> Option<(String, Option<String>)> {
    state.secret("OPENCLAW_API_URL")
        .filter(|u| !u.is_empty())
        .map(|url| {
            let key = state.secret("OPENCLAW_API_KEY").filter(|k| !k.is_empty());
            (url, key)
        })
}

/// Build headers for proxying to the remote OpenClaw API.
fn remote_headers(key: &Option<String>) -> reqwest::header::HeaderMap {
    let mut headers = reqwest::header::HeaderMap::new();
    headers.insert(
        reqwest::header::CONTENT_TYPE,
        "application/json".parse().unwrap(),
    );
    if let Some(k) = key {
        if let Ok(val) = format!("Bearer {}", k).parse() {
            headers.insert(reqwest::header::AUTHORIZATION, val);
        }
    }
    headers
}

/// Validate a *relative* workspace path for remote-mode forwarding.
/// Mirrors the TypeScript `isValidWorkspacePath`:
///   - must not contain `..`
///   - must not be absolute
fn is_valid_workspace_path(file_path: &str) -> bool {
    !file_path.contains("..") && !Path::new(file_path).is_absolute()
}

/// Resolve a user-supplied path to a canonical location inside the workspace.
/// Returns `None` if the path escapes the workspace (traversal / symlink attack).
/// Mirrors the TypeScript `safePath` function.
fn safe_path(user_path: &str) -> Option<PathBuf> {
    let ws = workspace_dir();
    // Strip leading slash to treat as relative
    let cleaned = user_path.trim_start_matches('/');
    let resolved = ws.join(cleaned);

    // Lexical prefix check (before following symlinks)
    let ws_prefix = format!("{}{}", ws.display(), std::path::MAIN_SEPARATOR);
    let resolved_str = resolved.to_string_lossy().to_string();
    if resolved_str != ws.to_string_lossy().to_string() && !resolved_str.starts_with(&ws_prefix) {
        return None;
    }

    // Try canonicalize (follows symlinks). If the file doesn't exist yet
    // canonicalize will fail – in that case fall back to the resolved path
    // (same as the TS handler).
    match std::fs::canonicalize(&resolved) {
        Ok(real) => {
            let real_str = real.to_string_lossy().to_string();
            let ws_canon = std::fs::canonicalize(&ws)
                .unwrap_or_else(|_| ws.clone())
                .to_string_lossy()
                .to_string();
            let ws_canon_prefix = format!("{}{}", ws_canon, std::path::MAIN_SEPARATOR);
            if real_str != ws_canon && !real_str.starts_with(&ws_canon_prefix) {
                None
            } else {
                Some(real)
            }
        }
        Err(_) => Some(resolved),
    }
}

// ---------------------------------------------------------------------------
// GET /files – list core + memory files
// ---------------------------------------------------------------------------

#[derive(Serialize)]
struct FileEntry {
    name: String,
    path: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ListFilesResponse {
    core_files: Vec<FileEntry>,
    memory_files: Vec<FileEntry>,
}

async fn list_files(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    // Remote mode
    if let Some((url, key)) = remote_config(&state) {
        let res = state
            .http
            .get(format!("{}/files", url))
            .headers(remote_headers(&key))
            .send()
            .await;

        return match res {
            Ok(r) if r.status().is_success() => {
                let body: Value = r.json().await.unwrap_or_else(|_| {
                    json!({ "coreFiles": [], "memoryFiles": [] })
                });
                Ok(Json(body))
            }
            _ => Ok(Json(json!({ "coreFiles": [], "memoryFiles": [] }))),
        };
    }

    // Local mode
    let ws = workspace_dir_from(&state);

    let core_files: Vec<FileEntry> = CORE_FILES
        .iter()
        .filter(|f| ws.join(f).exists())
        .map(|f| FileEntry {
            name: f.to_string(),
            path: f.to_string(),
        })
        .collect();

    let memory_dir = ws.join("memory");
    let memory_files: Vec<FileEntry> = if memory_dir.exists() {
        let mut entries: Vec<String> = std::fs::read_dir(&memory_dir)
            .map(|rd| {
                rd.filter_map(|e| e.ok())
                    .map(|e| e.file_name().to_string_lossy().to_string())
                    .filter(|name| name.ends_with(".md"))
                    .collect()
            })
            .unwrap_or_default();
        entries.sort();
        entries.reverse();
        entries
            .into_iter()
            .map(|name| FileEntry {
                path: format!("memory/{}", name),
                name,
            })
            .collect()
    } else {
        Vec::new()
    };

    Ok(Json(
        serde_json::to_value(ListFilesResponse {
            core_files,
            memory_files,
        })
        .unwrap(),
    ))
}

// ---------------------------------------------------------------------------
// GET /file?path=... – read file content
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct FileQuery {
    #[serde(default)]
    path: String,
}

async fn read_file(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Query(query): Query<FileQuery>,
) -> Result<Json<Value>, AppError> {
    let file_path = query.path;

    // Remote mode
    if let Some((url, key)) = remote_config(&state) {
        if !is_valid_workspace_path(&file_path) {
            return Err(AppError::BadRequest("Invalid path".into()));
        }

        let res = state
            .http
            .get(format!("{}/file", url))
            .query(&[("path", &file_path)])
            .headers(remote_headers(&key))
            .send()
            .await;

        return match res {
            Ok(r) if r.status().is_success() => {
                let body: Value = r.json().await.map_err(|e| AppError::Internal(e.into()))?;
                Ok(Json(body))
            }
            Ok(r) => {
                let status = r.status().as_u16();
                if status == 404 {
                    Err(AppError::NotFound("File not found".into()))
                } else {
                    Err(AppError::Internal(anyhow::anyhow!(
                        "Remote fetch failed with status {}",
                        status
                    )))
                }
            }
            Err(_) => Err(AppError::Internal(anyhow::anyhow!("Remote fetch failed"))),
        };
    }

    // Local mode
    let full = safe_path(&file_path).ok_or_else(|| AppError::BadRequest("Invalid path".into()))?;

    let meta = tokio::fs::metadata(&full)
        .await
        .map_err(|_| AppError::NotFound("File not found".into()))?;

    if meta.len() > MAX_FILE_SIZE {
        return Err(AppError::BadRequest("File too large (max 5MB)".into()));
    }

    let content = tokio::fs::read_to_string(&full)
        .await
        .map_err(|_| AppError::NotFound("File not found".into()))?;

    Ok(Json(json!({ "content": content })))
}

// ---------------------------------------------------------------------------
// POST /file – write file content
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct WriteFileBody {
    path: String,
    content: String,
}

async fn write_file(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Json(body): Json<WriteFileBody>,
) -> Result<Json<Value>, AppError> {
    let file_path = body.path;
    let content = body.content;

    if content.len() as u64 > MAX_FILE_SIZE {
        return Err(AppError::BadRequest("Content too large (max 5MB)".into()));
    }

    // Remote mode
    if let Some((url, key)) = remote_config(&state) {
        if !is_valid_workspace_path(&file_path) {
            return Err(AppError::BadRequest("Invalid path".into()));
        }

        let res = state
            .http
            .post(format!("{}/file", url))
            .headers(remote_headers(&key))
            .json(&json!({ "path": file_path, "content": content }))
            .send()
            .await;

        return match res {
            Ok(r) if r.status().is_success() => {
                let body: Value = r.json().await.map_err(|e| AppError::Internal(e.into()))?;
                Ok(Json(body))
            }
            Ok(r) => {
                let status = r.status().as_u16();
                Err(AppError::Internal(anyhow::anyhow!(
                    "Remote write failed with status {}",
                    status
                )))
            }
            Err(_) => Err(AppError::Internal(anyhow::anyhow!("Remote write failed"))),
        };
    }

    // Local mode
    let full = safe_path(&file_path).ok_or_else(|| AppError::BadRequest("Invalid path".into()))?;

    // Ensure parent directories exist
    if let Some(parent) = full.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| AppError::Internal(e.into()))?;
    }

    tokio::fs::write(&full, content.as_bytes())
        .await
        .map_err(|e| AppError::Internal(e.into()))?;

    // Post-write safety: canonicalize the written file and verify it's still
    // inside the workspace (guards against symlink races / TOCTOU).
    let ws_canon = std::fs::canonicalize(workspace_dir())
        .unwrap_or_else(|_| workspace_dir());
    match std::fs::canonicalize(&full) {
        Ok(real) => {
            let ws_prefix = format!("{}{}", ws_canon.display(), std::path::MAIN_SEPARATOR);
            let real_str = real.to_string_lossy().to_string();
            let ws_str = ws_canon.to_string_lossy().to_string();
            if real_str != ws_str && !real_str.starts_with(&ws_prefix) {
                // File escaped the workspace — remove it
                let _ = tokio::fs::remove_file(&full).await;
                return Err(AppError::BadRequest("Path traversal detected".into()));
            }
        }
        Err(_) => {
            // Cannot canonicalize a file we just wrote — something is wrong
            let _ = tokio::fs::remove_file(&full).await;
            return Err(AppError::Internal(anyhow::anyhow!(
                "Failed to verify written file"
            )));
        }
    }

    Ok(Json(json!({ "ok": true })))
}

// ---------------------------------------------------------------------------
// DELETE /file?path=... – delete a file
// ---------------------------------------------------------------------------

async fn delete_file(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Query(query): Query<FileQuery>,
) -> Result<Json<Value>, AppError> {
    let file_path = query.path;

    if file_path.is_empty() {
        return Err(AppError::BadRequest("path is required".into()));
    }

    // Prevent deleting core workspace files
    let basename = file_path.split('/').last().unwrap_or("");
    if CORE_FILES.contains(&basename) && !file_path.starts_with("memory/") {
        return Err(AppError::BadRequest(
            "Cannot delete core workspace files".into(),
        ));
    }

    // Remote mode
    if let Some((url, key)) = remote_config(&state) {
        if !is_valid_workspace_path(&file_path) {
            return Err(AppError::BadRequest("Invalid path".into()));
        }

        let res = state
            .http
            .delete(format!("{}/file", url))
            .query(&[("path", &file_path)])
            .headers(remote_headers(&key))
            .send()
            .await;

        return match res {
            Ok(r) if r.status().is_success() => Ok(Json(json!({ "ok": true }))),
            Ok(r) => {
                let status = r.status().as_u16();
                if status == 404 {
                    Err(AppError::NotFound("File not found".into()))
                } else {
                    Err(AppError::Internal(anyhow::anyhow!(
                        "Remote delete failed with status {}",
                        status
                    )))
                }
            }
            Err(_) => Err(AppError::Internal(anyhow::anyhow!("Remote delete failed"))),
        };
    }

    // Local mode
    let full =
        safe_path(&file_path).ok_or_else(|| AppError::BadRequest("Invalid path".into()))?;

    match tokio::fs::remove_file(&full).await {
        Ok(()) => Ok(Json(json!({ "ok": true }))),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            Err(AppError::NotFound("File not found".into()))
        }
        Err(e) => Err(AppError::Internal(e.into())),
    }
}
