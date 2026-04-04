use axum::{
    extract::{Path, Query, State},
    routing::get,
    Json, Router,
};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::error::{AppError, success_json};
use crate::server::{AppState, RequireAuth};

/// CouchDB proxy for the Obsidian-style vault.
/// All requests are proxied through the Axum backend so CouchDB credentials
/// never reach the frontend.
fn couch_config(state: &AppState) -> Option<(String, String, String, String)> {
    let url = state.secret("COUCHDB_URL")?;
    let user = state.secret("COUCHDB_USER")?;
    let pass = state.secret("COUCHDB_PASSWORD")?;
    let db = state.secret("COUCHDB_DATABASE").unwrap_or_else(|| "josue-vault".to_string());
    Some((url, user, pass, db))
}

async fn couch_get(state: &AppState, path: &str) -> Result<Value, AppError> {
    let (url, user, pass, db) = couch_config(state)
        .ok_or_else(|| AppError::BadRequest("CouchDB not configured".into()))?;
    let resp = state
        .http
        .get(format!("{url}/{db}/{path}"))
        .basic_auth(&user, Some(&pass))
        .send()
        .await
        .map_err(|e| AppError::Internal(e.into()))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(AppError::BadRequest(format!("CouchDB {status}: {body}")));
    }
    resp.json::<Value>().await.map_err(|e| AppError::Internal(e.into()))
}

async fn couch_put(state: &AppState, path: &str, body: Value) -> Result<Value, AppError> {
    let (url, user, pass, db) = couch_config(state)
        .ok_or_else(|| AppError::BadRequest("CouchDB not configured".into()))?;
    let resp = state
        .http
        .put(format!("{url}/{db}/{path}"))
        .basic_auth(&user, Some(&pass))
        .json(&body)
        .send()
        .await
        .map_err(|e| AppError::Internal(e.into()))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(AppError::BadRequest(format!("CouchDB {status}: {body}")));
    }
    resp.json::<Value>().await.map_err(|e| AppError::Internal(e.into()))
}

async fn couch_delete(state: &AppState, path: &str) -> Result<Value, AppError> {
    let (url, user, pass, db) = couch_config(state)
        .ok_or_else(|| AppError::BadRequest("CouchDB not configured".into()))?;
    let resp = state
        .http
        .delete(format!("{url}/{db}/{path}"))
        .basic_auth(&user, Some(&pass))
        .send()
        .await
        .map_err(|e| AppError::Internal(e.into()))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(AppError::BadRequest(format!("CouchDB {status}: {body}")));
    }
    resp.json::<Value>().await.map_err(|e| AppError::Internal(e.into()))
}

/// Decode chunk data based on note type.
/// LiveSync "plain" type stores raw text; "newnote" stores base64-encoded text.
fn decode_chunk_data(raw: &str, is_binary: bool) -> String {
    if is_binary {
        // "newnote" type: chunk data is base64-encoded
        match BASE64.decode(raw) {
            Ok(bytes) => String::from_utf8(bytes).unwrap_or_default(),
            Err(_) => raw.to_string(), // fallback: treat as plain text
        }
    } else {
        raw.to_string()
    }
}

/// Check if an ID (lowercased) is a binary attachment, not a text note.
fn is_attachment(id_lower: &str) -> bool {
    const EXTS: &[&str] = &[
        ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp",
        ".pdf", ".mp3", ".mp4", ".wav", ".webm",
    ];
    EXTS.iter().any(|ext| id_lower.ends_with(ext))
}

/// Check if a LiveSync note type indicates base64-encoded chunks.
/// "newnote" = binary (base64), "plain" = raw text.
fn is_binary_note(doc: &Value) -> bool {
    doc.get("type")
        .and_then(|v| v.as_str())
        .map(|t| t == "newnote")
        .unwrap_or(false)
}

/// GET /api/vault/notes — list all notes (with content reassembled from LiveSync chunks)
async fn list_notes(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let data = couch_get(&state, "_all_docs?include_docs=true").await?;
    let rows = data.get("rows").and_then(|r| r.as_array());
    let all_docs: Vec<&Value> = rows
        .map(|rows| rows.iter().filter_map(|row| row.get("doc")).collect())
        .unwrap_or_default();

    // Build a map of chunk IDs (h:xxx) to their raw data for content reassembly.
    // These are standalone chunk documents stored at the top level of CouchDB.
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
    tracing::debug!(chunk_count = chunks.len(), "vault: built chunk lookup table");

    // Collect attachment IDs (binary files) for the sidebar — no content needed
    let mut attachments: Vec<Value> = Vec::new();

    // Filter to actual note documents and reassemble content from children chunks
    let notes: Vec<Value> = all_docs
        .iter()
        .filter_map(|doc| {
            let id = doc.get("_id")?.as_str()?;
            // Log all non-chunk doc IDs for debugging
            if !id.starts_with("h:") {
                tracing::debug!(doc_id = id, "vault: processing doc");
            }
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
                tracing::debug!(doc_id = id, "vault: filtered out");
                return None;
            }
            // Collect binary/image files as attachments (IDs only, no content)
            let id_lower = id.to_lowercase();
            if is_attachment(&id_lower) {
                attachments.push(json!({ "_id": id, "type": "attachment" }));
                return None;
            }

            let binary = is_binary_note(doc);

            // LiveSync "eden" field: newly created chunks that haven't been
            // graduated to standalone h: docs yet. These are stored inline
            // in the note document as: eden: { "h:xxxx": { "data": "...", "epoch": N }, ... }
            let eden = doc.get("eden").and_then(|e| e.as_object());

            // Reassemble content from children chunks
            let mut content = String::new();
            let mut found = 0u32;
            let mut missing = 0u32;
            if let Some(children) = doc.get("children").and_then(|c| c.as_array()) {
                for child_id in children {
                    if let Some(chunk_id) = child_id.as_str() {
                        // 1) Check standalone h: chunk docs
                        if let Some(raw) = chunks.get(chunk_id) {
                            content.push_str(&decode_chunk_data(raw, binary));
                            found += 1;
                        }
                        // 2) Check eden (inline newborn chunks)
                        else if let Some(eden_chunk) = eden
                            .and_then(|e| e.get(chunk_id))
                            .and_then(|v| v.as_object())
                        {
                            if let Some(raw) = eden_chunk.get("data").and_then(|d| d.as_str()) {
                                content.push_str(&decode_chunk_data(raw, binary));
                                found += 1;
                            } else {
                                missing += 1;
                            }
                        } else {
                            missing += 1;
                        }
                    }
                }
            }
            tracing::debug!(
                note_id = id,
                content_len = content.len(),
                chunks_found = found,
                chunks_missing = missing,
                is_binary = binary,
                has_eden = eden.is_some(),
                "vault: note assembled"
            );
            let mut note = (*doc).clone();
            note.as_object_mut()?.insert("content".to_string(), Value::String(content));
            Some(note)
        })
        .collect();
    tracing::info!(notes = notes.len(), attachments = attachments.len(), "vault: returning notes + attachments");
    Ok(success_json(json!({
        "notes": notes,
        "attachments": attachments,
    })))
}

/// GET /api/vault/notes/:id — get a single note with content reassembled
async fn get_note(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Path(id): Path<String>,
) -> Result<Json<Value>, AppError> {
    // URL-encode the doc ID for CouchDB (IDs like "homework/image.png" have slashes)
    let encoded = urlencoding::encode(&id);
    tracing::info!(note_id = %id, encoded_id = %encoded, "vault: get_note called");
    let mut doc = couch_get(&state, &encoded).await?;
    let binary = is_binary_note(&doc);
    let is_image = is_attachment(&id.to_lowercase());
    let eden = doc.get("eden").and_then(|e| e.as_object()).cloned();

    // Reassemble content from children chunks
    if let Some(children) = doc.get("children").and_then(|c| c.as_array()).cloned() {
        let mut content = String::new();
        // For images: collect raw bytes from each chunk, then re-encode as single base64
        let mut image_bytes: Vec<u8> = Vec::new();
        for child_id in &children {
            if let Some(chunk_id) = child_id.as_str() {
                // 1) Check eden (inline newborn chunks) first — avoids extra HTTP call
                if let Some(raw) = eden
                    .as_ref()
                    .and_then(|e| e.get(chunk_id))
                    .and_then(|v| v.get("data"))
                    .and_then(|d| d.as_str())
                {
                    if is_image {
                        // Decode each chunk's base64 to bytes individually
                        if let Ok(bytes) = BASE64.decode(raw.as_bytes()) {
                            image_bytes.extend_from_slice(&bytes);
                        }
                    } else {
                        content.push_str(&decode_chunk_data(raw, binary));
                    }
                }
                // 2) Fetch standalone chunk doc from CouchDB
                else if let Ok(chunk) = couch_get(&state, chunk_id).await {
                    if let Some(raw) = chunk.get("data").and_then(|d| d.as_str()) {
                        if is_image {
                            if let Ok(bytes) = BASE64.decode(raw.as_bytes()) {
                                image_bytes.extend_from_slice(&bytes);
                            }
                        } else {
                            content.push_str(&decode_chunk_data(raw, binary));
                        }
                    }
                }
            }
        }
        // For images: re-encode collected bytes as single clean base64 string
        if is_image && !image_bytes.is_empty() {
            content = BASE64.encode(&image_bytes);
        }
        tracing::debug!(
            note_id = %id,
            content_len = content.len(),
            is_binary = binary,
            is_image = is_image,
            image_bytes_len = image_bytes.len(),
            has_eden = eden.is_some(),
            "vault: single note assembled"
        );
        if let Some(obj) = doc.as_object_mut() {
            obj.insert("content".to_string(), Value::String(content));
        }
    }
    Ok(success_json(doc))
}

/// PUT /api/vault/notes/:id — create or update a note
async fn put_note(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Path(id): Path<String>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, AppError> {
    if id.contains("..") || id.starts_with('_') {
        return Err(AppError::BadRequest("Invalid document ID".into()));
    }
    let encoded = urlencoding::encode(&id);
    let result = couch_put(&state, &encoded, body).await?;
    Ok(success_json(result))
}

/// DELETE /api/vault/notes/:id?rev=xxx — delete a note
#[derive(Deserialize)]
struct DeleteQuery {
    rev: String,
}

async fn delete_note(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Path(id): Path<String>,
    Query(q): Query<DeleteQuery>,
) -> Result<Json<Value>, AppError> {
    if id.contains("..") || id.starts_with('_') {
        return Err(AppError::BadRequest("Invalid document ID".into()));
    }
    let encoded = urlencoding::encode(&id);
    let result = couch_delete(&state, &format!("{encoded}?rev={}", urlencoding::encode(&q.rev))).await?;
    Ok(success_json(result))
}

/// /api/vault/doc?id=... — query-param routes for docs with slashes in IDs
#[derive(Deserialize)]
struct DocQuery {
    id: String,
}

#[derive(Deserialize)]
struct DocDeleteQuery {
    id: String,
    rev: String,
}

async fn get_doc_by_query(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Query(q): Query<DocQuery>,
) -> Result<Json<Value>, AppError> {
    get_note(State(state), RequireAuth(session), Path(q.id)).await
}

async fn put_doc_by_query(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Query(q): Query<DocQuery>,
    body: Json<Value>,
) -> Result<Json<Value>, AppError> {
    put_note(State(state), RequireAuth(session), Path(q.id), body).await
}

async fn delete_doc_by_query(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Query(q): Query<DocDeleteQuery>,
) -> Result<Json<Value>, AppError> {
    delete_note(State(state), RequireAuth(session), Path(q.id), Query(DeleteQuery { rev: q.rev })).await
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/vault/notes", get(list_notes))
        .route("/vault/notes/{id}", get(get_note).put(put_note).delete(delete_note))
        .route("/vault/doc", get(get_doc_by_query).put(put_doc_by_query).delete(delete_doc_by_query))
}
