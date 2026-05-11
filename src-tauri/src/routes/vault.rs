use axum::{
    body::Body,
    extract::{Path, Query, State},
    http::header,
    response::Response,
    routing::get,
    Json, Router,
};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use reqwest::{
    header::{HeaderMap, HeaderName, HeaderValue},
    RequestBuilder,
};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::error::{success_json, AppError};
use crate::routes::auth::load_user_secrets;
use crate::server::{AppState, RequireAuth};

const FOLDER_DOC_PREFIX: &str = "cc:folder:";

/// CouchDB proxy for the Obsidian-style vault.
/// All requests are proxied through the Axum backend so CouchDB credentials
/// never reach the frontend.
struct CouchConfig {
    url: String,
    user: String,
    pass: String,
    db: String,
    headers: HeaderMap,
}

fn couch_config(state: &AppState) -> Result<Option<CouchConfig>, AppError> {
    let Some(url) = state.secret("COUCHDB_URL") else {
        return Ok(None);
    };
    let Some(user) = state.secret("COUCHDB_USER") else {
        return Ok(None);
    };
    let Some(pass) = state.secret("COUCHDB_PASSWORD") else {
        return Ok(None);
    };
    let db = state
        .secret("COUCHDB_DATABASE")
        .unwrap_or_else(|| "clawctrl-vault".to_string());
    let headers = parse_custom_headers(
        state
            .secret("COUCHDB_CUSTOM_HEADERS")
            .or_else(|| state.secret("COUCHDB_HEADERS"))
            .as_deref()
            .unwrap_or(""),
    )?;
    Ok(Some(CouchConfig {
        url,
        user,
        pass,
        db,
        headers,
    }))
}

fn parse_custom_headers(raw: &str) -> Result<HeaderMap, AppError> {
    let mut headers = HeaderMap::new();
    let raw = raw.trim();
    if raw.is_empty() {
        return Ok(headers);
    }

    if raw.starts_with('{') {
        let parsed: serde_json::Map<String, Value> = serde_json::from_str(raw)
            .map_err(|_| AppError::BadRequest("Invalid CouchDB custom headers JSON".into()))?;
        for (name, value) in parsed {
            if let Some(value) = value.as_str() {
                insert_custom_header(&mut headers, &name, value)?;
            }
        }
        return Ok(headers);
    }

    for line in raw.lines().map(str::trim).filter(|line| !line.is_empty()) {
        let (name, value) = line
            .split_once(':')
            .ok_or_else(|| AppError::BadRequest("Invalid CouchDB custom header line".into()))?;
        insert_custom_header(&mut headers, name.trim(), value.trim())?;
    }
    Ok(headers)
}

fn insert_custom_header(headers: &mut HeaderMap, name: &str, value: &str) -> Result<(), AppError> {
    let name = HeaderName::from_bytes(name.as_bytes())
        .map_err(|_| AppError::BadRequest("Invalid CouchDB custom header name".into()))?;
    let value = HeaderValue::from_str(value)
        .map_err(|_| AppError::BadRequest("Invalid CouchDB custom header value".into()))?;
    headers.insert(name, value);
    Ok(())
}

fn couch_request(req: RequestBuilder, config: &CouchConfig) -> RequestBuilder {
    req.basic_auth(&config.user, Some(&config.pass))
        .headers(config.headers.clone())
}

fn normalize_folder_path(path: &str) -> Result<String, AppError> {
    let parts: Vec<String> = path
        .split('/')
        .map(str::trim)
        .filter(|part| !part.is_empty())
        .map(|part| {
            part.chars()
                .filter(|ch| !matches!(ch, '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' | '\0'))
                .collect::<String>()
        })
        .filter(|part| !part.is_empty() && part != "." && part != "..")
        .collect();

    if parts.is_empty() {
        return Err(AppError::BadRequest("Folder path required".into()));
    }

    let path = parts.join("/");
    if path.contains("..") || path.starts_with('_') {
        return Err(AppError::BadRequest("Invalid folder path".into()));
    }
    Ok(path)
}

fn folder_doc_id(path: &str) -> String {
    format!("{FOLDER_DOC_PREFIX}{path}")
}

fn folder_path_from_doc_id(id: &str) -> Option<String> {
    id.strip_prefix(FOLDER_DOC_PREFIX).map(str::to_string)
}

fn folder_json_from_doc(doc: &Value) -> Option<Value> {
    let id = doc.get("_id")?.as_str()?;
    let path = doc
        .get("path")
        .and_then(|v| v.as_str())
        .map(str::to_string)
        .or_else(|| folder_path_from_doc_id(id))?;
    let name = path.rsplit('/').next().unwrap_or(&path);
    Some(json!({
        "_id": id,
        "_rev": doc.get("_rev").cloned().unwrap_or(Value::Null),
        "type": "folder",
        "path": path,
        "name": name,
        "created_at": doc.get("created_at").cloned().unwrap_or_else(|| json!(0)),
        "updated_at": doc.get("updated_at").cloned().unwrap_or_else(|| json!(0)),
    }))
}

async fn couch_get(state: &AppState, path: &str) -> Result<Value, AppError> {
    let config = couch_config(state)?
        .ok_or_else(|| AppError::BadRequest("CouchDB not configured".into()))?;
    let resp = couch_request(
        state.http.get(format!(
            "{}/{}/{path}",
            config.url.trim_end_matches('/'),
            config.db
        )),
        &config,
    )
    .send()
    .await
    .map_err(|e| AppError::Internal(e.into()))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(AppError::BadRequest(format!("CouchDB {status}: {body}")));
    }
    resp.json::<Value>()
        .await
        .map_err(|e| AppError::Internal(e.into()))
}

async fn couch_put(state: &AppState, path: &str, body: Value) -> Result<Value, AppError> {
    let config = couch_config(state)?
        .ok_or_else(|| AppError::BadRequest("CouchDB not configured".into()))?;
    let resp = couch_request(
        state.http.put(format!(
            "{}/{}/{path}",
            config.url.trim_end_matches('/'),
            config.db
        )),
        &config,
    )
    .json(&body)
    .send()
    .await
    .map_err(|e| AppError::Internal(e.into()))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(AppError::BadRequest(format!("CouchDB {status}: {body}")));
    }
    resp.json::<Value>()
        .await
        .map_err(|e| AppError::Internal(e.into()))
}

async fn couch_delete(state: &AppState, path: &str) -> Result<Value, AppError> {
    let config = couch_config(state)?
        .ok_or_else(|| AppError::BadRequest("CouchDB not configured".into()))?;
    let resp = couch_request(
        state.http.delete(format!(
            "{}/{}/{path}",
            config.url.trim_end_matches('/'),
            config.db
        )),
        &config,
    )
    .send()
    .await
    .map_err(|e| AppError::Internal(e.into()))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(AppError::BadRequest(format!("CouchDB {status}: {body}")));
    }
    resp.json::<Value>()
        .await
        .map_err(|e| AppError::Internal(e.into()))
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
        ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".pdf", ".mp3", ".mp4", ".wav",
        ".webm",
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

fn attachment_content_type(id: &str) -> &'static str {
    let id = id.to_lowercase();
    if id.ends_with(".png") {
        "image/png"
    } else if id.ends_with(".jpg") || id.ends_with(".jpeg") {
        "image/jpeg"
    } else if id.ends_with(".gif") {
        "image/gif"
    } else if id.ends_with(".webp") {
        "image/webp"
    } else if id.ends_with(".svg") {
        "image/svg+xml"
    } else if id.ends_with(".bmp") {
        "image/bmp"
    } else if id.ends_with(".pdf") {
        "application/pdf"
    } else if id.ends_with(".mp3") {
        "audio/mpeg"
    } else if id.ends_with(".wav") {
        "audio/wav"
    } else if id.ends_with(".mp4") {
        "video/mp4"
    } else if id.ends_with(".webm") {
        "video/webm"
    } else {
        "application/octet-stream"
    }
}

/// GET /api/vault/notes — list all notes (with content reassembled from LiveSync chunks)
async fn list_notes(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    ensure_couch_config(&state, &session).await;
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
    tracing::debug!(
        chunk_count = chunks.len(),
        "vault: built chunk lookup table"
    );

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
            note.as_object_mut()?
                .insert("content".to_string(), Value::String(content));
            Some(note)
        })
        .collect();
    tracing::info!(
        notes = notes.len(),
        attachments = attachments.len(),
        "vault: returning notes + attachments"
    );
    Ok(success_json(json!({
        "notes": notes,
        "attachments": attachments,
    })))
}

/// GET /api/vault/folders — list clawctrl folder marker docs.
async fn list_folders(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    ensure_couch_config(&state, &session).await;
    let data = couch_get(&state, "_all_docs?include_docs=true").await?;
    let rows = data.get("rows").and_then(|r| r.as_array());
    let folders: Vec<Value> = rows
        .map(|rows| {
            rows.iter()
                .filter_map(|row| row.get("doc"))
                .filter(|doc| {
                    doc.get("_id")
                        .and_then(|v| v.as_str())
                        .map(|id| id.starts_with(FOLDER_DOC_PREFIX))
                        .unwrap_or(false)
                })
                .filter_map(folder_json_from_doc)
                .collect()
        })
        .unwrap_or_default();

    Ok(success_json(json!({ "folders": folders })))
}

#[derive(Deserialize)]
struct FolderQuery {
    path: String,
}

async fn get_folder_by_query(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Query(q): Query<FolderQuery>,
) -> Result<Json<Value>, AppError> {
    ensure_couch_config(&state, &session).await;
    let path = normalize_folder_path(&q.path)?;
    let id = folder_doc_id(&path);
    let encoded = urlencoding::encode(&id);
    let doc = couch_get(&state, &encoded).await?;
    Ok(success_json(
        json!({ "folder": folder_json_from_doc(&doc) }),
    ))
}

async fn put_folder_by_query(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Query(q): Query<FolderQuery>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, AppError> {
    ensure_couch_config(&state, &session).await;
    let path = normalize_folder_path(&q.path)?;
    let id = folder_doc_id(&path);
    let encoded = urlencoding::encode(&id);
    let now = chrono::Utc::now().timestamp_millis();

    let mut doc = body.as_object().cloned().unwrap_or_default();
    doc.insert("_id".to_string(), Value::String(id.clone()));
    doc.insert("type".to_string(), Value::String("folder".to_string()));
    doc.insert("path".to_string(), Value::String(path.clone()));
    doc.insert(
        "name".to_string(),
        Value::String(path.rsplit('/').next().unwrap_or(&path).to_string()),
    );
    doc.insert("updated_at".to_string(), json!(now));
    doc.entry("created_at".to_string())
        .or_insert_with(|| json!(now));

    if !doc.contains_key("_rev") {
        if let Ok(existing) = couch_get(&state, &encoded).await {
            if let Some(rev) = existing.get("_rev").cloned() {
                doc.insert("_rev".to_string(), rev);
            }
            if let Some(created_at) = existing.get("created_at").cloned() {
                doc.insert("created_at".to_string(), created_at);
            }
        }
    }

    let result = couch_put(&state, &encoded, Value::Object(doc)).await?;
    let rev = result.get("rev").cloned();
    let mut folder = json!({
        "_id": id,
        "type": "folder",
        "path": path,
        "name": path.rsplit('/').next().unwrap_or(&path),
        "created_at": now,
        "updated_at": now,
    });
    if let (Some(rev), Some(obj)) = (rev, folder.as_object_mut()) {
        obj.insert("_rev".to_string(), rev);
    }

    Ok(success_json(json!({ "folder": folder })))
}

#[derive(Deserialize)]
struct FolderDeleteQuery {
    path: String,
    rev: Option<String>,
}

async fn delete_folder_by_query(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Query(q): Query<FolderDeleteQuery>,
) -> Result<Json<Value>, AppError> {
    ensure_couch_config(&state, &session).await;
    let path = normalize_folder_path(&q.path)?;
    let id = folder_doc_id(&path);
    let encoded = urlencoding::encode(&id);
    let rev = match q.rev {
        Some(rev) => rev,
        None => couch_get(&state, &encoded)
            .await?
            .get("_rev")
            .and_then(|v| v.as_str())
            .ok_or_else(|| AppError::BadRequest("Folder revision required".into()))?
            .to_string(),
    };
    let result = couch_delete(
        &state,
        &format!("{encoded}?rev={}", urlencoding::encode(&rev)),
    )
    .await?;
    Ok(success_json(result))
}

/// GET /api/vault/notes/:id — get a single note with content reassembled
async fn get_note(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Path(id): Path<String>,
) -> Result<Json<Value>, AppError> {
    ensure_couch_config(&state, &session).await;
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

async fn attachment_bytes(state: &AppState, id: &str) -> Result<Vec<u8>, AppError> {
    if id.contains("..") || id.starts_with('_') {
        return Err(AppError::BadRequest("Invalid document ID".into()));
    }
    let encoded = urlencoding::encode(id);
    let doc = couch_get(state, &encoded).await?;
    let eden = doc.get("eden").and_then(|e| e.as_object()).cloned();

    if let Some(children) = doc.get("children").and_then(|c| c.as_array()).cloned() {
        let mut bytes = Vec::new();
        for child_id in &children {
            let Some(chunk_id) = child_id.as_str() else {
                continue;
            };
            let raw = eden
                .as_ref()
                .and_then(|e| e.get(chunk_id))
                .and_then(|v| v.get("data"))
                .and_then(|d| d.as_str())
                .map(str::to_string);
            let raw = match raw {
                Some(raw) => Some(raw),
                None => couch_get(state, chunk_id).await.ok().and_then(|chunk| {
                    chunk
                        .get("data")
                        .and_then(|d| d.as_str())
                        .map(str::to_string)
                }),
            };

            if let Some(raw) = raw {
                if let Ok(decoded) = BASE64.decode(raw.as_bytes()) {
                    bytes.extend_from_slice(&decoded);
                }
            }
        }
        if !bytes.is_empty() {
            return Ok(bytes);
        }
    }

    let content = doc
        .get("content")
        .and_then(|value| value.as_str())
        .ok_or_else(|| AppError::NotFound("Attachment content not found".into()))?;
    let content = content
        .split_once(";base64,")
        .map(|(_, data)| data)
        .unwrap_or(content);
    let clean = content
        .chars()
        .filter(|ch| !ch.is_whitespace())
        .collect::<String>();
    BASE64
        .decode(clean.as_bytes())
        .map_err(|_| AppError::BadRequest("Attachment content is not valid base64".into()))
}

async fn get_media_by_id(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Path(id): Path<String>,
) -> Result<Response, AppError> {
    ensure_couch_config(&state, &session).await;
    media_response(&state, &id).await
}

async fn get_media_by_query(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Query(q): Query<DocQuery>,
) -> Result<Response, AppError> {
    ensure_couch_config(&state, &session).await;
    media_response(&state, &q.id).await
}

async fn media_response(state: &AppState, id: &str) -> Result<Response, AppError> {
    let bytes = attachment_bytes(state, id).await?;
    Response::builder()
        .header(header::CONTENT_TYPE, attachment_content_type(id))
        .header(header::CACHE_CONTROL, "private, max-age=3600")
        .body(Body::from(bytes))
        .map_err(|e| AppError::Internal(e.into()))
}

/// PUT /api/vault/notes/:id — create or update a note
async fn put_note(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Path(id): Path<String>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, AppError> {
    ensure_couch_config(&state, &session).await;
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
    RequireAuth(session): RequireAuth,
    Path(id): Path<String>,
    Query(q): Query<DeleteQuery>,
) -> Result<Json<Value>, AppError> {
    ensure_couch_config(&state, &session).await;
    if id.contains("..") || id.starts_with('_') {
        return Err(AppError::BadRequest("Invalid document ID".into()));
    }
    let encoded = urlencoding::encode(&id);
    let result = couch_delete(
        &state,
        &format!("{encoded}?rev={}", urlencoding::encode(&q.rev)),
    )
    .await?;
    Ok(success_json(result))
}

async fn ensure_couch_config(state: &AppState, session: &crate::server::UserSession) {
    if !session.encryption_key.is_empty()
        && state
            .secret("COUCHDB_URL")
            .map(|value| value.trim().is_empty())
            .unwrap_or(true)
    {
        load_user_secrets(state, session).await;
    }
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

#[derive(Deserialize)]
struct AttachmentBody {
    id: Option<String>,
    name: String,
    mime: Option<String>,
    data: String,
    folder: Option<String>,
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
    delete_note(
        State(state),
        RequireAuth(session),
        Path(q.id),
        Query(DeleteQuery { rev: q.rev }),
    )
    .await
}

async fn post_attachment(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Json(body): Json<AttachmentBody>,
) -> Result<Json<Value>, AppError> {
    ensure_couch_config(&state, &session).await;
    let id = attachment_doc_id(&body)?;
    let data = body
        .data
        .split_once(";base64,")
        .map(|(_, data)| data)
        .unwrap_or(&body.data)
        .chars()
        .filter(|ch| !ch.is_whitespace())
        .collect::<String>();
    let bytes = BASE64
        .decode(data.as_bytes())
        .map_err(|_| AppError::BadRequest("Attachment data is not valid base64".into()))?;
    let now = chrono::Utc::now().timestamp_millis();
    let encoded = urlencoding::encode(&id);
    let mut doc = json!({
        "_id": id,
        "type": "newnote",
        "content": data,
        "mime": body.mime.unwrap_or_else(|| attachment_content_type(&body.name).to_string()),
        "created_at": now,
        "updated_at": now,
    });
    if let Ok(existing) = couch_get(&state, &encoded).await {
        if let Some(rev) = existing.get("_rev").cloned() {
            doc.as_object_mut()
                .expect("attachment doc object")
                .insert("_rev".to_string(), rev);
        }
        if let Some(created_at) = existing.get("created_at").cloned() {
            doc.as_object_mut()
                .expect("attachment doc object")
                .insert("created_at".to_string(), created_at);
        }
    }
    let result = couch_put(&state, &encoded, doc).await?;
    Ok(success_json(json!({
        "id": id,
        "rev": result.get("rev").cloned().unwrap_or(Value::Null),
        "mime": attachment_content_type(&body.name),
        "size": bytes.len(),
        "created_at": now,
    })))
}

fn attachment_doc_id(body: &AttachmentBody) -> Result<String, AppError> {
    let id = body.id.as_deref().unwrap_or("").trim();
    if !id.is_empty() {
        if id.contains("..") || id.starts_with('_') || id.contains('\0') {
            return Err(AppError::BadRequest("Invalid attachment ID".into()));
        }
        return Ok(id.to_string());
    }
    let file_name = body
        .name
        .split('/')
        .next_back()
        .unwrap_or("attachment")
        .chars()
        .filter(|ch| {
            !matches!(
                ch,
                '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|' | '\0'
            )
        })
        .collect::<String>();
    let file_name = if file_name.trim().is_empty() {
        "attachment".to_string()
    } else {
        file_name
    };
    let folder = body
        .folder
        .as_deref()
        .map(normalize_folder_path)
        .transpose()?
        .unwrap_or_else(|| "attachments".to_string());
    Ok(format!(
        "{folder}/{}-{file_name}",
        chrono::Utc::now().timestamp_millis()
    ))
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/vault/notes", get(list_notes))
        .route("/vault/folders", get(list_folders))
        .route(
            "/vault/folder",
            get(get_folder_by_query)
                .put(put_folder_by_query)
                .delete(delete_folder_by_query),
        )
        .route(
            "/vault/notes/{id}",
            get(get_note).put(put_note).delete(delete_note),
        )
        .route("/vault/media/{id}", get(get_media_by_id))
        .route("/vault/media", get(get_media_by_query))
        .route("/vault/attachment", axum::routing::post(post_attachment))
        .route(
            "/vault/doc",
            get(get_doc_by_query)
                .put(put_doc_by_query)
                .delete(delete_doc_by_query),
        )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_folder_path_preserves_obsidian_names() {
        let path = normalize_folder_path(" Projects / Daily Notes ").unwrap();

        assert_eq!(path, "Projects/Daily Notes");
    }

    #[test]
    fn folder_doc_ids_use_internal_prefix() {
        let id = folder_doc_id("Projects/Daily Notes");

        assert_eq!(id, "cc:folder:Projects/Daily Notes");
        assert_eq!(
            folder_path_from_doc_id(&id).as_deref(),
            Some("Projects/Daily Notes"),
        );
    }
}
