use axum::{
    extract::{Query, State},
    routing::get,
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};

use crate::error::AppError;
use crate::harness_paths::{self, HarnessProviderLayout};
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

const HERMES_CORE_FILES: &[&str] = &[
    "SOUL.md",
    "AGENTS.md",
    "USER.md",
    "IDENTITY.md",
    "TOOLS.md",
    "HEARTBEAT.md",
    "RESEARCH.md",
    "BOOTSTRAP.md",
    "CLAUDE.md",
    "GEMINI.md",
    ".memd/README.md",
    ".memd/COMMANDS.md",
    ".memd/config.json",
];

const HERMES_MEMORY_FILES: &[&str] = &[".memd/wake.md", ".memd/mem.md", ".memd/events.md"];
const HERMES_MEMORY_DIRS: &[&str] = &[".memd/compiled/memory", ".memd/compiled/events"];

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

fn local_workspace_provider(state: &AppState) -> HarnessProviderLayout {
    harness_paths::provider_layout(state)
}

fn workspace_dir_from(state: &AppState, provider: HarnessProviderLayout) -> PathBuf {
    harness_paths::workspace_dir_for_layout(state, provider)
}

/// Stateless fallback for post-write verification.
fn default_workspace_dir(provider: HarnessProviderLayout) -> PathBuf {
    match provider {
        HarnessProviderLayout::Harness => {
            harness_paths::generic_base_dir_from_env().join("workspace")
        }
        HarnessProviderLayout::Hermes => harness_paths::hermes_workspace_dir_from_env(),
    }
}

/// Return `(HARNESS_API_URL, HARNESS_API_KEY)` when remote mode is active.
fn remote_config(state: &AppState) -> Option<(String, Option<String>)> {
    state
        .secret_first(&["HARNESS_API_URL", "HERMES_API_URL", "OPENCLAW_API_URL"])
        .filter(|u| !u.is_empty())
        .map(|url| {
            let key = state
                .secret_first(&["HARNESS_API_KEY", "HERMES_API_KEY", "OPENCLAW_API_KEY"])
                .filter(|k| !k.is_empty());
            (url, key)
        })
}

/// Build headers for proxying to the remote harness API.
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

/// Resolve a user-supplied path to a canonical location inside the workspace root.
/// Returns `None` if the path escapes the workspace (traversal / symlink attack).
/// Mirrors the TypeScript `safePath` function.
fn safe_path_in(ws: &Path, user_path: &str) -> Option<PathBuf> {
    // Strip leading slash to treat as relative
    let cleaned = user_path.trim_start_matches('/');
    let cleaned_path = Path::new(cleaned);
    if cleaned_path
        .components()
        .any(|component| matches!(component, std::path::Component::ParentDir))
    {
        return None;
    }
    let resolved = ws.join(cleaned);

    // Lexical prefix check (before following symlinks)
    let ws_prefix = format!("{}{}", ws.display(), std::path::MAIN_SEPARATOR);
    let resolved_str = resolved.to_string_lossy().to_string();
    if resolved_str != *ws.to_string_lossy() && !resolved_str.starts_with(&ws_prefix) {
        return None;
    }

    // Try canonicalize (follows symlinks). If the file doesn't exist yet
    // canonicalize will fail – in that case fall back to the resolved path
    // (same as the TS handler).
    match std::fs::canonicalize(&resolved) {
        Ok(real) => {
            let real_str = real.to_string_lossy().to_string();
            let ws_canon = std::fs::canonicalize(ws)
                .unwrap_or_else(|_| ws.to_path_buf())
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
#[cfg_attr(test, derive(Debug))]
struct FileEntry {
    name: String,
    path: String,
}

#[derive(Serialize)]
#[cfg_attr(test, derive(Debug))]
#[serde(rename_all = "camelCase")]
struct ListFilesResponse {
    core_files: Vec<FileEntry>,
    memory_files: Vec<FileEntry>,
}

fn file_entry(path: &str) -> FileEntry {
    FileEntry {
        name: Path::new(path)
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
            .unwrap_or_else(|| path.to_string()),
        path: path.to_string(),
    }
}

fn list_files_for_root(ws: &Path, provider: HarnessProviderLayout) -> ListFilesResponse {
    match provider {
        HarnessProviderLayout::Harness => {
            let core_files = CORE_FILES
                .iter()
                .filter(|f| ws.join(f).exists())
                .map(|f| file_entry(f))
                .collect();

            let memory_dir = ws.join("memory");
            let memory_files = if memory_dir.exists() {
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
                    .map(|name| file_entry(&format!("memory/{}", name)))
                    .collect()
            } else {
                Vec::new()
            };

            ListFilesResponse {
                core_files,
                memory_files,
            }
        }
        HarnessProviderLayout::Hermes => {
            let core_files = HERMES_CORE_FILES
                .iter()
                .filter(|f| ws.join(f).exists())
                .map(|f| file_entry(f))
                .collect();

            let mut seen = std::collections::HashSet::new();
            let mut memory_paths = Vec::new();
            for path in HERMES_MEMORY_FILES {
                if ws.join(path).exists() && seen.insert(path.to_string()) {
                    memory_paths.push(path.to_string());
                }
            }
            for rel_dir in HERMES_MEMORY_DIRS {
                let dir = ws.join(rel_dir);
                if !dir.exists() {
                    continue;
                }
                let mut entries: Vec<String> = std::fs::read_dir(&dir)
                    .map(|rd| {
                        rd.filter_map(|e| e.ok())
                            .map(|e| e.file_name().to_string_lossy().to_string())
                            .filter(|name| name.ends_with(".md"))
                            .collect()
                    })
                    .unwrap_or_default();
                entries.sort();
                entries.reverse();
                for name in entries {
                    let path = format!("{}/{}", rel_dir, name);
                    if seen.insert(path.clone()) {
                        memory_paths.push(path);
                    }
                }
            }

            ListFilesResponse {
                core_files,
                memory_files: memory_paths.iter().map(|path| file_entry(path)).collect(),
            }
        }
    }
}

fn local_files_json(state: &AppState, provider: HarnessProviderLayout) -> Value {
    let ws = workspace_dir_from(state, provider);
    serde_json::to_value(list_files_for_root(&ws, provider)).unwrap()
}

fn is_core_workspace_file(file_path: &str, provider: HarnessProviderLayout) -> bool {
    match provider {
        HarnessProviderLayout::Harness => {
            let basename = file_path.split('/').next_back().unwrap_or("");
            CORE_FILES.contains(&basename) && !file_path.starts_with("memory/")
        }
        HarnessProviderLayout::Hermes => HERMES_CORE_FILES.contains(&file_path),
    }
}

async fn remote_provider_is_hermes(state: &AppState, url: &str, key: &Option<String>) -> bool {
    let res = state
        .http
        .get(format!("{}/health", url))
        .headers(remote_headers(key))
        .send()
        .await;

    let Ok(response) = res else {
        return false;
    };
    if !response.status().is_success() {
        return false;
    }
    let body = response.json::<Value>().await.unwrap_or_else(|_| json!({}));
    body.get("provider")
        .or_else(|| body.get("platform"))
        .and_then(Value::as_str)
        .map(|provider| provider.to_ascii_lowercase().contains("hermes"))
        .unwrap_or(false)
}

async fn read_local_file_content(
    state: &AppState,
    file_path: &str,
    provider: HarnessProviderLayout,
) -> Result<String, AppError> {
    let ws = workspace_dir_from(state, provider);
    let full =
        safe_path_in(&ws, file_path).ok_or_else(|| AppError::BadRequest("Invalid path".into()))?;

    let meta = tokio::fs::metadata(&full)
        .await
        .map_err(|_| AppError::NotFound("File not found".into()))?;

    if meta.len() > MAX_FILE_SIZE {
        return Err(AppError::BadRequest("File too large (max 5MB)".into()));
    }

    tokio::fs::read_to_string(&full)
        .await
        .map_err(|_| AppError::NotFound("File not found".into()))
}

async fn write_local_file_content(
    state: &AppState,
    file_path: &str,
    content: &str,
    provider: HarnessProviderLayout,
) -> Result<(), AppError> {
    let ws = workspace_dir_from(state, provider);
    let full =
        safe_path_in(&ws, file_path).ok_or_else(|| AppError::BadRequest("Invalid path".into()))?;

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
    let ws_canon = std::fs::canonicalize(&ws)
        .or_else(|_| std::fs::canonicalize(default_workspace_dir(provider)))
        .unwrap_or(ws);
    match std::fs::canonicalize(&full) {
        Ok(real) => {
            let ws_prefix = format!("{}{}", ws_canon.display(), std::path::MAIN_SEPARATOR);
            let real_str = real.to_string_lossy().to_string();
            let ws_str = ws_canon.to_string_lossy().to_string();
            if real_str != ws_str && !real_str.starts_with(&ws_prefix) {
                let _ = tokio::fs::remove_file(&full).await;
                return Err(AppError::BadRequest("Path traversal detected".into()));
            }
        }
        Err(_) => {
            let _ = tokio::fs::remove_file(&full).await;
            return Err(AppError::Internal(anyhow::anyhow!(
                "Failed to verify written file"
            )));
        }
    }

    Ok(())
}

async fn delete_local_file_path(
    state: &AppState,
    file_path: &str,
    provider: HarnessProviderLayout,
) -> Result<Json<Value>, AppError> {
    let full = safe_path_in(&workspace_dir_from(state, provider), file_path)
        .ok_or_else(|| AppError::BadRequest("Invalid path".into()))?;

    match tokio::fs::remove_file(&full).await {
        Ok(()) => Ok(Json(json!({ "ok": true }))),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            Err(AppError::NotFound("File not found".into()))
        }
        Err(e) => Err(AppError::Internal(e.into())),
    }
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

        match res {
            Ok(r) if r.status().is_success() => {
                let body: Value = r
                    .json()
                    .await
                    .unwrap_or_else(|_| json!({ "coreFiles": [], "memoryFiles": [] }));
                return Ok(Json(body));
            }
            _ => {}
        }

        if remote_provider_is_hermes(&state, &url, &key).await {
            return Ok(Json(local_files_json(
                &state,
                HarnessProviderLayout::Hermes,
            )));
        }

        return Ok(Json(json!({ "coreFiles": [], "memoryFiles": [] })));
    }

    // Local mode
    Ok(Json(local_files_json(
        &state,
        local_workspace_provider(&state),
    )))
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

        match res {
            Ok(r) if r.status().is_success() => {
                let body: Value = r.json().await.map_err(|e| AppError::Internal(e.into()))?;
                return Ok(Json(body));
            }
            Ok(r) => {
                let status = r.status().as_u16();
                if remote_provider_is_hermes(&state, &url, &key).await {
                    let content =
                        read_local_file_content(&state, &file_path, HarnessProviderLayout::Hermes)
                            .await?;
                    return Ok(Json(json!({ "content": content })));
                }
                return if status == 404 {
                    Err(AppError::NotFound("File not found".into()))
                } else {
                    Err(AppError::Internal(anyhow::anyhow!(
                        "Remote fetch failed with status {}",
                        status
                    )))
                };
            }
            Err(_) => {
                if remote_provider_is_hermes(&state, &url, &key).await {
                    let content =
                        read_local_file_content(&state, &file_path, HarnessProviderLayout::Hermes)
                            .await?;
                    return Ok(Json(json!({ "content": content })));
                }
                return Err(AppError::Internal(anyhow::anyhow!("Remote fetch failed")));
            }
        }
    }

    // Local mode
    let content =
        read_local_file_content(&state, &file_path, local_workspace_provider(&state)).await?;
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
            .json(&json!({ "path": &file_path, "content": &content }))
            .send()
            .await;

        match res {
            Ok(r) if r.status().is_success() => {
                let body: Value = r.json().await.map_err(|e| AppError::Internal(e.into()))?;
                return Ok(Json(body));
            }
            Ok(r) => {
                let status = r.status().as_u16();
                if remote_provider_is_hermes(&state, &url, &key).await {
                    write_local_file_content(
                        &state,
                        &file_path,
                        &content,
                        HarnessProviderLayout::Hermes,
                    )
                    .await?;
                    return Ok(Json(json!({ "ok": true })));
                }
                return Err(AppError::Internal(anyhow::anyhow!(
                    "Remote write failed with status {}",
                    status
                )));
            }
            Err(_) => {
                if remote_provider_is_hermes(&state, &url, &key).await {
                    write_local_file_content(
                        &state,
                        &file_path,
                        &content,
                        HarnessProviderLayout::Hermes,
                    )
                    .await?;
                    return Ok(Json(json!({ "ok": true })));
                }
                return Err(AppError::Internal(anyhow::anyhow!("Remote write failed")));
            }
        }
    }

    // Local mode
    write_local_file_content(
        &state,
        &file_path,
        &content,
        local_workspace_provider(&state),
    )
    .await?;
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
    let provider = local_workspace_provider(&state);
    if is_core_workspace_file(&file_path, provider) {
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

        match res {
            Ok(r) if r.status().is_success() => return Ok(Json(json!({ "ok": true }))),
            Ok(r) => {
                let status = r.status().as_u16();
                if remote_provider_is_hermes(&state, &url, &key).await {
                    if is_core_workspace_file(&file_path, HarnessProviderLayout::Hermes) {
                        return Err(AppError::BadRequest(
                            "Cannot delete core workspace files".into(),
                        ));
                    }
                    return delete_local_file_path(
                        &state,
                        &file_path,
                        HarnessProviderLayout::Hermes,
                    )
                    .await;
                }
                return if status == 404 {
                    Err(AppError::NotFound("File not found".into()))
                } else {
                    Err(AppError::Internal(anyhow::anyhow!(
                        "Remote delete failed with status {}",
                        status
                    )))
                };
            }
            Err(_) => {
                if remote_provider_is_hermes(&state, &url, &key).await {
                    if is_core_workspace_file(&file_path, HarnessProviderLayout::Hermes) {
                        return Err(AppError::BadRequest(
                            "Cannot delete core workspace files".into(),
                        ));
                    }
                    return delete_local_file_path(
                        &state,
                        &file_path,
                        HarnessProviderLayout::Hermes,
                    )
                    .await;
                }
                return Err(AppError::Internal(anyhow::anyhow!("Remote delete failed")));
            }
        }
    }

    // Local mode
    delete_local_file_path(&state, &file_path, provider).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hermes_listing_includes_memd_bundle_and_soul_files() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        std::fs::write(root.join("SOUL.md"), "soul").unwrap();
        std::fs::create_dir_all(root.join(".memd/compiled/memory")).unwrap();
        std::fs::write(root.join(".memd/wake.md"), "wake").unwrap();
        std::fs::write(root.join(".memd/mem.md"), "mem").unwrap();
        std::fs::write(root.join(".memd/compiled/memory/working.md"), "working").unwrap();

        let listed = list_files_for_root(root, HarnessProviderLayout::Hermes);
        assert!(listed
            .core_files
            .iter()
            .any(|entry| entry.path == "SOUL.md"));
        assert!(listed
            .memory_files
            .iter()
            .any(|entry| entry.path == ".memd/wake.md"));
        assert!(listed
            .memory_files
            .iter()
            .any(|entry| entry.path == ".memd/compiled/memory/working.md"));
    }

    #[test]
    fn safe_path_rejects_traversal_outside_root() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();

        assert!(safe_path_in(root, ".memd/mem.md").is_some());
        assert!(safe_path_in(root, "../outside.md").is_none());
        assert!(safe_path_in(root, "/../outside.md").is_none());
    }
}
