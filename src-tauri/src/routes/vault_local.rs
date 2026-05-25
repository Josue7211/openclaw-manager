use axum::{
    body::Body,
    extract::{Path, Query, State},
    http::header,
    response::Response,
    routing::get,
    Json, Router,
};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use rand::RngCore;
use serde::Deserialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use sqlx::{sqlite::SqliteRow, Row};
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path as FsPath, PathBuf};

use crate::error::{success_json, AppError};
use crate::routes::util::random_uuid;
use crate::server::{AppState, RequireAuth};

const FOLDER_DOC_PREFIX: &str = "cc:folder:";
const AUTOSAVE_VERSION_INTERVAL_MS: i64 = 5 * 60 * 1000;

#[derive(Deserialize)]
struct DocQuery {
    id: String,
}

#[derive(Deserialize)]
struct FolderQuery {
    path: String,
}

#[derive(Deserialize)]
struct RevisionQuery {
    id: String,
}

#[derive(Deserialize)]
struct RevisionDetailQuery {
    id: String,
    rev: String,
}

#[derive(Deserialize)]
struct VersionCheckpointBody {
    id: String,
    label: Option<String>,
}

#[derive(Deserialize)]
struct VersionLabelBody {
    id: String,
    rev: String,
    label: Option<String>,
}

#[derive(Deserialize)]
struct SearchQuery {
    q: Option<String>,
    include_trashed: Option<bool>,
}

#[derive(Deserialize)]
struct AuditQuery {
    id: Option<String>,
    limit: Option<i64>,
}

#[derive(Deserialize)]
struct SyncLedgerQuery {
    limit: Option<i64>,
}

#[derive(Deserialize)]
struct ResolveSyncConflictBody {
    provider: String,
    remote_id: String,
}

#[derive(Deserialize)]
struct CollaborationEventsQuery {
    id: String,
    since: Option<i64>,
    limit: Option<i64>,
}

#[derive(Deserialize)]
struct CollaborationCrdtStateQuery {
    id: String,
}

#[derive(Deserialize)]
struct CollaborationEventBody {
    document_id: String,
    event_id: Option<String>,
    client_id: Option<String>,
    sequence: Option<i64>,
    #[serde(rename = "type")]
    kind: String,
    peer_id: String,
    peer_name: String,
    peer_seen_at: Option<i64>,
    content: Option<String>,
    base_checksum: Option<String>,
    content_checksum: Option<String>,
    operations: Option<Value>,
    crdt_operations: Option<Value>,
    rich_operations: Option<Value>,
    cursor: Option<Value>,
    updated_at: Option<i64>,
    ttl_ms: Option<i64>,
}

#[derive(Deserialize)]
struct CollaborationCrdtStateBody {
    document_id: String,
    state: Value,
    checksum: String,
    client_id: Option<String>,
    sequence: Option<i64>,
    updated_at: Option<i64>,
}

#[derive(Deserialize)]
struct CollaborationPairingBody {
    pairing_key: String,
    device_label: Option<String>,
}

#[derive(Deserialize)]
struct CollaborationPairingRevokeBody {
    pairing_id: Option<String>,
    pairing_key: Option<String>,
}

#[derive(Deserialize)]
struct RestoreRevisionBody {
    id: String,
    rev: String,
}

#[derive(Deserialize)]
struct RestoreTrashBody {
    id: String,
    folder: Option<String>,
}

#[derive(Deserialize)]
struct RestoreFolderTrashBody {
    path: String,
}

#[derive(Deserialize)]
struct AttachmentBody {
    id: Option<String>,
    name: String,
    mime: Option<String>,
    data: String,
    folder: Option<String>,
    document_id: Option<String>,
}

#[derive(Deserialize)]
struct CommentBody {
    document_id: String,
    body: String,
    anchor_json: Option<Value>,
}

#[derive(Deserialize)]
struct CommentReplyBody {
    body: String,
}

#[derive(Deserialize)]
struct SuggestionBody {
    document_id: String,
    body: Option<String>,
    anchor_json: Option<Value>,
    patch_json: Value,
}

#[derive(Deserialize)]
struct ImportVaultBody {
    notes: Option<Vec<Value>>,
    folders: Option<Vec<Value>>,
}

#[derive(Deserialize)]
struct EncryptedExportBody {
    password: String,
}

#[derive(Deserialize)]
struct EncryptedImportBody {
    password: String,
    backup: Value,
}

fn now_millis() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

fn collaboration_event_ttl_ms(ttl_ms: Option<i64>) -> i64 {
    ttl_ms.unwrap_or(60_000).clamp(5_000, 15 * 60 * 1000)
}

fn validate_collaboration_event_body(body: &CollaborationEventBody) -> Result<(), AppError> {
    if body.document_id.trim().is_empty() {
        return Err(AppError::BadRequest(
            "Missing collaboration document".into(),
        ));
    }
    if !matches!(
        body.kind.as_str(),
        "presence" | "leave" | "draft" | "operation" | "cursor"
    ) {
        return Err(AppError::BadRequest(
            "Invalid collaboration event type".into(),
        ));
    }
    if body.peer_id.trim().is_empty() || body.peer_name.trim().is_empty() {
        return Err(AppError::BadRequest("Missing collaboration peer".into()));
    }
    if let Some(event_id) = body.event_id.as_ref() {
        let event_id = event_id.trim();
        let valid = !event_id.is_empty()
            && event_id.len() <= 128
            && event_id
                .chars()
                .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.' | ':'));
        if !valid {
            return Err(AppError::BadRequest(
                "Invalid collaboration event id".into(),
            ));
        }
    }
    if let Some(client_id) = body.client_id.as_ref() {
        let client_id = client_id.trim();
        let valid = !client_id.is_empty()
            && client_id.len() <= 128
            && client_id
                .chars()
                .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.' | ':'));
        if !valid {
            return Err(AppError::BadRequest(
                "Invalid collaboration client id".into(),
            ));
        }
    }
    if body.sequence.map(|sequence| sequence < 0).unwrap_or(false) {
        return Err(AppError::BadRequest(
            "Invalid collaboration sequence".into(),
        ));
    }
    if (body.kind == "draft" || body.kind == "operation")
        && (body.content.is_none()
            || body.base_checksum.is_none()
            || body.content_checksum.is_none())
    {
        return Err(AppError::BadRequest(
            "Draft collaboration events need content checksums".into(),
        ));
    }
    let has_text_operations = body
        .operations
        .as_ref()
        .and_then(Value::as_array)
        .map(|operations| !operations.is_empty())
        .unwrap_or(false);
    let has_crdt_operations = body
        .crdt_operations
        .as_ref()
        .and_then(Value::as_array)
        .map(|operations| !operations.is_empty() && valid_collaboration_crdt_operations(operations))
        .unwrap_or(false);
    let has_rich_operations = body
        .rich_operations
        .as_ref()
        .and_then(Value::as_array)
        .map(|operations| !operations.is_empty() && valid_collaboration_rich_operations(operations))
        .unwrap_or(false);
    if body.kind == "operation"
        && !(has_text_operations || has_crdt_operations || has_rich_operations)
    {
        return Err(AppError::BadRequest(
            "Operation collaboration events need text operations".into(),
        ));
    }
    if body
        .crdt_operations
        .as_ref()
        .and_then(Value::as_array)
        .map(|operations| !valid_collaboration_crdt_operations(operations))
        .unwrap_or(false)
    {
        return Err(AppError::BadRequest(
            "Invalid collaboration CRDT operations".into(),
        ));
    }
    if body
        .rich_operations
        .as_ref()
        .and_then(Value::as_array)
        .map(|operations| !valid_collaboration_rich_operations(operations))
        .unwrap_or(false)
    {
        return Err(AppError::BadRequest(
            "Invalid collaboration rich-text operations".into(),
        ));
    }
    if body.kind == "cursor" && !valid_collaboration_cursor(body.cursor.as_ref()) {
        return Err(AppError::BadRequest(
            "Cursor collaboration events need a valid cursor".into(),
        ));
    }
    Ok(())
}

fn valid_collaboration_crdt_operations(operations: &[Value]) -> bool {
    operations.iter().all(|operation| {
        let Some(operation) = operation.as_object() else {
            return false;
        };
        let Some(kind) = operation.get("type").and_then(Value::as_str) else {
            return false;
        };
        let valid_id = operation
            .get("id")
            .and_then(Value::as_str)
            .map(|id| !id.trim().is_empty() && id.len() <= 256)
            .unwrap_or(false);
        if !valid_id {
            return false;
        }
        match kind {
            "insert" => {
                let valid_after_id = operation
                    .get("afterId")
                    .map(|after_id| {
                        after_id.is_null()
                            || after_id.as_str().map(|id| id.len() <= 256).unwrap_or(false)
                    })
                    .unwrap_or(false);
                let valid_value = operation
                    .get("value")
                    .and_then(Value::as_str)
                    .map(|value| !value.is_empty() && value.len() <= 16)
                    .unwrap_or(false);
                valid_after_id && valid_value
            }
            "delete" => true,
            _ => false,
        }
    })
}

fn valid_collaboration_rich_operations(operations: &[Value]) -> bool {
    operations.len() <= 100
        && operations.iter().all(|operation| {
            let Some(operation) = operation.as_object() else {
                return false;
            };
            let valid_id = operation
                .get("id")
                .and_then(Value::as_str)
                .map(|id| !id.trim().is_empty() && id.len() <= 256)
                .unwrap_or(false);
            if !valid_id {
                return false;
            }
            let kind = operation.get("type").and_then(Value::as_str);
            if kind == Some("delete") {
                return true;
            }
            if kind == Some("tableCell") {
                let row = operation.get("row").and_then(Value::as_i64);
                let column = operation.get("column").and_then(Value::as_i64);
                let valid_markdown = operation
                    .get("markdown")
                    .and_then(Value::as_str)
                    .map(|markdown| markdown.len() <= 5_000)
                    .unwrap_or(false);
                return matches!((row, column), (Some(row), Some(column)) if row >= 0 && column >= 0)
                    && valid_markdown;
            }
            if kind == Some("tableRow")
                || kind == Some("tableRowDelete")
                || kind == Some("tableColumn")
                || kind == Some("tableColumnDelete")
            {
                let index = operation.get("index").and_then(Value::as_i64);
                let valid_cells = operation
                    .get("cells")
                    .and_then(Value::as_array)
                    .map(|cells| {
                        !cells.is_empty()
                            && cells.len() <= 50
                            && cells.iter().all(|cell| {
                                cell.as_str()
                                    .map(|value| value.len() <= 5_000)
                                    .unwrap_or(false)
                            })
                    })
                    .unwrap_or(false);
                return matches!(index, Some(index) if index >= 0) && valid_cells;
            }
            if kind == Some("listItem") {
                let index = operation.get("index").and_then(Value::as_i64);
                let valid_markdown = operation
                    .get("markdown")
                    .and_then(Value::as_str)
                    .map(|markdown| !markdown.trim().is_empty() && markdown.len() <= 5_000)
                    .unwrap_or(false);
                return matches!(index, Some(index) if index >= 0) && valid_markdown;
            }
            if kind == Some("listItemInsert") || kind == Some("listItemDelete") {
                let index = operation.get("index").and_then(Value::as_i64);
                let valid_markdown = operation
                    .get("markdown")
                    .and_then(Value::as_str)
                    .map(|markdown| !markdown.trim().is_empty() && markdown.len() <= 5_000)
                    .unwrap_or(false);
                return matches!(index, Some(index) if index >= 0) && valid_markdown;
            }
            if kind == Some("line") || kind == Some("lineInsert") || kind == Some("lineDelete") {
                let index = operation.get("index").and_then(Value::as_i64);
                let valid_markdown = operation
                    .get("markdown")
                    .and_then(Value::as_str)
                    .map(|markdown| !markdown.trim().is_empty() && markdown.len() <= 5_000)
                    .unwrap_or(false);
                return matches!(index, Some(index) if index >= 0) && valid_markdown;
            }
            if kind == Some("mark") {
                let valid_mark = operation
                    .get("mark")
                    .and_then(Value::as_str)
                    .map(|mark| {
                        matches!(
                            mark,
                            "bold"
                                | "italic"
                                | "code"
                                | "link"
                                | "strike"
                                | "underline"
                                | "highlight"
                                | "color"
                        )
                    })
                    .unwrap_or(false);
                let text_start = operation.get("textStart").and_then(Value::as_i64);
                let text_end = operation.get("textEnd").and_then(Value::as_i64);
                let valid_href = operation
                    .get("href")
                    .map(|href| href.as_str().map(|value| value.len() <= 2_000).unwrap_or(false))
                    .unwrap_or(true);
                let valid_color = operation
                    .get("color")
                    .map(|color| {
                        color
                            .as_str()
                            .map(|value| value.len() <= 64 && value.starts_with('#'))
                            .unwrap_or(false)
                    })
                    .unwrap_or(true);
                return valid_mark
                    && matches!((text_start, text_end), (Some(start), Some(end)) if start >= 0 && end > start)
                    && valid_href
                    && valid_color;
            }
            if kind != Some("insert") && kind != Some("update") {
                return false;
            }
            let valid_after_id = if kind == Some("insert") {
                operation
                    .get("afterId")
                    .map(|after_id| {
                        after_id.is_null()
                            || after_id
                                .as_str()
                                .map(|id| !id.trim().is_empty() && id.len() <= 256)
                                .unwrap_or(false)
                    })
                    .unwrap_or(false)
            } else {
                true
            };
            let valid_block_type = operation
                .get("blockType")
                .and_then(Value::as_str)
                .map(|block_type| {
                    matches!(
                        block_type,
                        "heading"
                            | "paragraph"
                            | "list"
                            | "taskList"
                            | "table"
                            | "quote"
                            | "code"
                            | "horizontalRule"
                    )
                })
                .unwrap_or(false);
            let valid_markdown = operation
                .get("markdown")
                .and_then(Value::as_str)
                .map(|markdown| !markdown.trim().is_empty() && markdown.len() <= 20_000)
                .unwrap_or(false);
            valid_after_id && valid_block_type && valid_markdown
        })
}

fn validate_collaboration_crdt_state_body(
    body: &CollaborationCrdtStateBody,
) -> Result<(), AppError> {
    if body.document_id.trim().is_empty() {
        return Err(AppError::BadRequest("Missing CRDT document".into()));
    }
    if body.checksum.trim().is_empty() || body.checksum.len() > 128 {
        return Err(AppError::BadRequest("Invalid CRDT checksum".into()));
    }
    if body.sequence.map(|sequence| sequence < 0).unwrap_or(false) {
        return Err(AppError::BadRequest("Invalid CRDT sequence".into()));
    }
    if let Some(client_id) = body.client_id.as_ref() {
        let client_id = client_id.trim();
        let valid = !client_id.is_empty()
            && client_id.len() <= 128
            && client_id
                .chars()
                .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.' | ':'));
        if !valid {
            return Err(AppError::BadRequest("Invalid CRDT client id".into()));
        }
    }
    let Some(characters) = body.state.as_array() else {
        return Err(AppError::BadRequest("Invalid CRDT state".into()));
    };
    if characters.len() > 500_000 {
        return Err(AppError::BadRequest("CRDT state too large".into()));
    }
    if !valid_collaboration_crdt_characters(characters) {
        return Err(AppError::BadRequest("Invalid CRDT characters".into()));
    }
    Ok(())
}

fn valid_collaboration_crdt_characters(characters: &[Value]) -> bool {
    characters.iter().all(|character| {
        let Some(character) = character.as_object() else {
            return false;
        };
        let valid_id = character
            .get("id")
            .and_then(Value::as_str)
            .map(|id| !id.trim().is_empty() && id.len() <= 256)
            .unwrap_or(false);
        let valid_after_id = character
            .get("afterId")
            .map(|after_id| {
                after_id.is_null() || after_id.as_str().map(|id| id.len() <= 256).unwrap_or(false)
            })
            .unwrap_or(false);
        let valid_value = character
            .get("value")
            .and_then(Value::as_str)
            .map(|value| !value.is_empty() && value.len() <= 16)
            .unwrap_or(false);
        let valid_deleted = character
            .get("deleted")
            .map(|deleted| deleted.is_boolean())
            .unwrap_or(true);
        valid_id && valid_after_id && valid_value && valid_deleted
    })
}

fn valid_collaboration_cursor(cursor: Option<&Value>) -> bool {
    let Some(cursor) = cursor.and_then(Value::as_object) else {
        return false;
    };
    let anchor = cursor.get("anchor").and_then(Value::as_i64);
    let head = cursor.get("head").and_then(Value::as_i64);
    let updated_at = cursor.get("updatedAt").and_then(Value::as_i64);
    matches!((anchor, head, updated_at), (Some(a), Some(h), Some(_)) if a >= 0 && h >= 0)
}

fn validate_collaboration_pairing_key(pairing_key: &str) -> bool {
    let pairing_key = pairing_key.trim();
    (16..=240).contains(&pairing_key.len())
        && pairing_key
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '.' | '_' | '~' | ':' | '-'))
}

fn collaboration_pairing_key_hash(pairing_key: &str) -> String {
    let digest = Sha256::digest(pairing_key.trim().as_bytes());
    hex::encode(digest)
}

fn collaboration_pairing_label(value: Option<&String>) -> String {
    value
        .map(|label| label.trim())
        .filter(|label| !label.is_empty())
        .unwrap_or("Remote notes device")
        .chars()
        .take(80)
        .collect()
}

fn checksum(content: &str) -> String {
    hex::encode(Sha256::digest(content.as_bytes()))
}

fn attachment_root() -> std::path::PathBuf {
    crate::app_paths::resolve_app_data_dir().join("vault-attachments")
}

fn normalize_folder_path(path: &str) -> String {
    path.split('/')
        .map(str::trim)
        .map(|part| {
            part.chars()
                .filter(|ch| {
                    !matches!(
                        ch,
                        '\\' | ':'
                            | '*'
                            | '?'
                            | '"'
                            | '<'
                            | '>'
                            | '|'
                            | '\0'
                            | '\u{200B}'
                            | '\u{200C}'
                            | '\u{200D}'
                            | '\u{FEFF}'
                    ) && !ch.is_control()
                })
                .collect::<String>()
                .trim()
                .to_string()
        })
        .filter(|part| !part.is_empty() && part != "." && part != "..")
        .collect::<Vec<_>>()
        .join("/")
}

fn stored_folder_path(path: &str) -> String {
    let normalized = normalize_folder_path(path);
    normalized
        .strip_prefix("Trash/")
        .map(str::to_string)
        .unwrap_or(normalized)
}

fn folder_like(path: &str) -> String {
    format!("{path}/%")
}

fn folder_doc_id(path: &str) -> String {
    format!("{FOLDER_DOC_PREFIX}{path}")
}

fn folder_name(path: &str) -> String {
    path.rsplit('/').next().unwrap_or(path).to_string()
}

fn parent_path(path: &str) -> String {
    path.rsplit_once('/')
        .map(|(parent, _)| parent.to_string())
        .unwrap_or_default()
}

fn attachment_content_type(id: &str, stored_mime: Option<&str>) -> String {
    if let Some(mime) = stored_mime.filter(|mime| !mime.trim().is_empty()) {
        return mime.to_string();
    }
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
    } else {
        "application/octet-stream"
    }
    .to_string()
}

fn clean_file_name(name: &str) -> String {
    let file_name = name
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
    if file_name.trim().is_empty() {
        "attachment".to_string()
    } else {
        file_name
    }
}

fn attachment_id(body: &AttachmentBody) -> Result<String, AppError> {
    let id = body.id.as_deref().unwrap_or("").trim();
    if !id.is_empty() {
        if id.contains("..") || id.starts_with('_') || id.contains('\0') {
            return Err(AppError::BadRequest("Invalid attachment ID".into()));
        }
        return Ok(id.to_string());
    }

    let folder = body
        .folder
        .as_deref()
        .map(normalize_folder_path)
        .filter(|folder| !folder.is_empty())
        .unwrap_or_else(|| "attachments".to_string());
    Ok(format!(
        "{folder}/{}-{}",
        now_millis(),
        clean_file_name(&body.name)
    ))
}

fn json_text(value: Option<&Value>, fallback: Value) -> String {
    value.cloned().unwrap_or(fallback).to_string()
}

fn parse_json(text: String, fallback: Value) -> Value {
    serde_json::from_str(&text).unwrap_or(fallback)
}

fn markdown_content_from_document(doc: &Value) -> &str {
    let fields = ["content", "content_markdown", "markdown", "body", "text"];
    let mut first_string = "";
    for field in fields {
        let Some(value) = doc.get(field).and_then(Value::as_str) else {
            continue;
        };
        if first_string.is_empty() {
            first_string = value;
        }
        if !value.is_empty() {
            return value;
        }
    }
    first_string
}

fn row_to_note(row: &SqliteRow) -> Result<Value, AppError> {
    let id: String = row.try_get("id")?;
    let folder_path: String = row.try_get("folder_path")?;
    let trashed_at: Option<i64> = row.try_get("trashed_at")?;
    let trash_origin_path: Option<String> = row.try_get("trash_origin_path")?;
    let folder = if trashed_at.is_some() {
        let origin = trash_origin_path.as_deref().unwrap_or(&folder_path);
        if origin.is_empty() {
            "Trash".to_string()
        } else {
            format!("Trash/{origin}")
        }
    } else {
        folder_path
    };
    Ok(json!({
        "_id": id,
        "_rev": format!("local-{}", row.try_get::<i64, _>("updated_at")?),
        "type": row.try_get::<String, _>("kind")?,
        "title": row.try_get::<String, _>("title")?,
        "content": row.try_get::<String, _>("content_markdown")?,
        "folder": folder,
        "tags": parse_json(row.try_get("tags_json")?, json!([])),
        "links": parse_json(row.try_get("links_json")?, json!([])),
        "aliases": parse_json(row.try_get("aliases_json")?, json!([])),
        "properties": parse_json(row.try_get("properties_json")?, json!({})),
        "created_at": row.try_get::<i64, _>("created_at")?,
        "updated_at": row.try_get::<i64, _>("updated_at")?,
        "trashed_at": trashed_at,
        "trash_origin_path": trash_origin_path,
    }))
}

fn row_to_folder(row: &SqliteRow) -> Result<Value, AppError> {
    let path: String = row.try_get("path")?;
    let trashed_at: Option<i64> = row.try_get("trashed_at")?;
    let trash_origin_path: Option<String> = row.try_get("trash_origin_path")?;
    let display_path = if trashed_at.is_some() {
        format!("Trash/{}", trash_origin_path.as_deref().unwrap_or(&path))
    } else {
        path.clone()
    };
    Ok(json!({
        "_id": folder_doc_id(&display_path),
        "_rev": format!("local-{}", row.try_get::<i64, _>("updated_at")?),
        "type": "folder",
        "path": display_path,
        "name": row.try_get::<String, _>("name")?,
        "created_at": row.try_get::<i64, _>("created_at")?,
        "updated_at": row.try_get::<i64, _>("updated_at")?,
        "trashed_at": trashed_at,
        "trash_origin_path": trash_origin_path,
    }))
}

fn row_to_attachment(row: &SqliteRow) -> Result<Value, AppError> {
    let id: String = row.try_get("id")?;
    let path: String = row.try_get("path")?;
    let filename: String = row.try_get("filename")?;
    let trashed_at: Option<i64> = row.try_get("trashed_at")?;
    let trash_origin_path: Option<String> = row.try_get("trash_origin_path")?;
    let folder = if trashed_at.is_some() {
        format!("Trash/{}", trash_origin_path.as_deref().unwrap_or(&path))
    } else {
        path.clone()
    };
    Ok(json!({
        "_id": id,
        "type": "attachment",
        "title": filename,
        "filename": filename,
        "path": folder,
        "folder": folder,
        "mime": row.try_get::<String, _>("mime")?,
        "size": row.try_get::<i64, _>("size")?,
        "created_at": row.try_get::<i64, _>("created_at")?,
        "updated_at": row.try_get::<i64, _>("created_at")?,
        "trashed_at": trashed_at,
        "trash_origin_path": trash_origin_path,
    }))
}

async fn write_audit(
    state: &AppState,
    document_id: Option<&str>,
    action: &str,
    metadata: Value,
) -> Result<(), AppError> {
    sqlx::query(
        "INSERT INTO vault_audit_log (id, document_id, action, metadata_json, created_at) \
         VALUES (?, ?, ?, ?, ?)",
    )
    .bind(random_uuid())
    .bind(document_id)
    .bind(action)
    .bind(metadata.to_string())
    .bind(now_millis())
    .execute(&state.db)
    .await?;
    Ok(())
}

async fn update_search_index(state: &AppState, document_id: &str) -> Result<(), AppError> {
    sqlx::query("DELETE FROM vault_documents_fts WHERE id = ?")
        .bind(document_id)
        .execute(&state.db)
        .await?;

    let Some(row) = sqlx::query(
        "SELECT id, title, content_markdown, tags_json, aliases_json, properties_json, folder_path \
         FROM vault_documents \
         WHERE id = ? AND deleted_at IS NULL",
    )
    .bind(document_id)
    .fetch_optional(&state.db)
    .await?
    else {
        return Ok(());
    };

    sqlx::query(
        "INSERT INTO vault_documents_fts (id, title, content, tags, properties, folder) \
         VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(row.try_get::<String, _>("id")?)
    .bind(row.try_get::<String, _>("title")?)
    .bind(row.try_get::<String, _>("content_markdown")?)
    .bind(row.try_get::<String, _>("tags_json")?)
    .bind(search_properties_text(
        &row.try_get::<String, _>("properties_json")?,
        &row.try_get::<String, _>("aliases_json")?,
    ))
    .bind(row.try_get::<String, _>("folder_path")?)
    .execute(&state.db)
    .await?;

    Ok(())
}

fn fts_query(raw: &str) -> String {
    raw.split(|ch: char| !ch.is_alphanumeric())
        .map(str::trim)
        .filter(|token| !token.is_empty())
        .take(8)
        .map(|token| format!("{token}*"))
        .collect::<Vec<_>>()
        .join(" ")
}

fn search_properties_text(properties_json: &str, aliases_json: &str) -> String {
    format!("{properties_json} {aliases_json}")
}

fn like_pattern(raw: &str) -> String {
    let mut pattern = String::from("%");
    for ch in raw.trim().chars() {
        if matches!(ch, '%' | '_' | '\\') {
            pattern.push('\\');
        }
        pattern.push(ch);
    }
    pattern.push('%');
    pattern
}

async fn create_version_with_label(
    state: &AppState,
    document_id: &str,
    reason: &str,
    label: Option<&str>,
) -> Result<Option<String>, AppError> {
    let Some(row) = sqlx::query(
        "SELECT id, title, path, kind, content_markdown, content_json, folder_path, \
                tags_json, links_json, aliases_json, properties_json, checksum \
         FROM vault_documents WHERE id = ? AND deleted_at IS NULL",
    )
    .bind(document_id)
    .fetch_optional(&state.db)
    .await?
    else {
        return Ok(None);
    };

    let next_number: i64 = sqlx::query_scalar(
        "SELECT COALESCE(MAX(version_number), 0) + 1 FROM vault_versions WHERE document_id = ?",
    )
    .bind(document_id)
    .fetch_one(&state.db)
    .await?;

    let metadata = json!({
        "title": row.try_get::<String, _>("title")?,
        "path": row.try_get::<String, _>("path")?,
        "kind": row.try_get::<String, _>("kind")?,
        "folder": row.try_get::<String, _>("folder_path")?,
        "tags": parse_json(row.try_get("tags_json")?, json!([])),
        "links": parse_json(row.try_get("links_json")?, json!([])),
        "aliases": parse_json(row.try_get("aliases_json")?, json!([])),
        "properties": parse_json(row.try_get("properties_json")?, json!({})),
    });

    let version_id = format!("local:{}:{next_number}", document_id.replace(':', "_"));
    sqlx::query(
        "INSERT INTO vault_versions \
         (id, document_id, version_number, label, content_markdown, content_json, metadata_json, created_at, created_by, reason, checksum) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'local', ?, ?)",
    )
    .bind(&version_id)
    .bind(document_id)
    .bind(next_number)
    .bind(label.map(str::trim).filter(|text| !text.is_empty()))
    .bind(row.try_get::<String, _>("content_markdown")?)
    .bind(row.try_get::<Option<String>, _>("content_json")?)
    .bind(metadata.to_string())
    .bind(now_millis())
    .bind(reason)
    .bind(row.try_get::<String, _>("checksum")?)
    .execute(&state.db)
    .await?;

    Ok(Some(version_id))
}

async fn create_version(state: &AppState, document_id: &str, reason: &str) -> Result<(), AppError> {
    create_version_with_label(state, document_id, reason, None).await?;
    Ok(())
}

fn autosave_version_due(
    now: i64,
    current_checksum: &str,
    latest_created_at: Option<i64>,
    latest_checksum: Option<&str>,
) -> bool {
    if latest_checksum == Some(current_checksum) {
        return false;
    }
    latest_created_at
        .map(|created_at| now.saturating_sub(created_at) >= AUTOSAVE_VERSION_INTERVAL_MS)
        .unwrap_or(true)
}

async fn create_coalesced_autosave_version(
    state: &AppState,
    document_id: &str,
) -> Result<(), AppError> {
    let Some(current_checksum): Option<String> = sqlx::query_scalar(
        "SELECT checksum FROM vault_documents WHERE id = ? AND deleted_at IS NULL",
    )
    .bind(document_id)
    .fetch_optional(&state.db)
    .await?
    else {
        return Ok(());
    };
    let latest = sqlx::query(
        "SELECT created_at, checksum FROM vault_versions \
         WHERE document_id = ? \
         ORDER BY version_number DESC \
         LIMIT 1",
    )
    .bind(document_id)
    .fetch_optional(&state.db)
    .await?;
    let now = now_millis();
    let latest_created_at = latest
        .as_ref()
        .map(|row| row.try_get::<i64, _>("created_at"))
        .transpose()?;
    let latest_checksum = latest
        .as_ref()
        .map(|row| row.try_get::<String, _>("checksum"))
        .transpose()?;
    if autosave_version_due(
        now,
        &current_checksum,
        latest_created_at,
        latest_checksum.as_deref(),
    ) {
        create_version(state, document_id, "autosave").await?;
    }
    Ok(())
}

async fn ensure_folder(state: &AppState, folder: &str) -> Result<(), AppError> {
    let folder = normalize_folder_path(folder);
    if folder.is_empty() {
        return Ok(());
    }

    let mut current = String::new();
    for part in folder.split('/') {
        current = if current.is_empty() {
            part.to_string()
        } else {
            format!("{current}/{part}")
        };
        let now = now_millis();
        sqlx::query(
            "INSERT INTO vault_folders (path, parent_path, name, created_at, updated_at) \
             VALUES (?, ?, ?, ?, ?) \
             ON CONFLICT(path) DO UPDATE SET deleted_at = NULL, updated_at = excluded.updated_at",
        )
        .bind(&current)
        .bind(parent_path(&current))
        .bind(folder_name(&current))
        .bind(now)
        .bind(now)
        .execute(&state.db)
        .await?;
    }

    Ok(())
}

async fn import_document(state: &AppState, doc: &Value) -> Result<bool, AppError> {
    let Some(id) = doc
        .get("_id")
        .and_then(Value::as_str)
        .or_else(|| doc.get("id").and_then(Value::as_str))
    else {
        return Ok(false);
    };
    if id.is_empty()
        || id.contains("..")
        || id.starts_with('_')
        || id.starts_with("h:")
        || id.starts_with("ps:")
        || id.starts_with("ix:")
        || id.starts_with("cc:")
        || id.starts_with("!_")
        || id.starts_with("!:")
        || id.contains(".obsidian/")
        || id.contains("obsidian-livesync")
    {
        return Ok(false);
    }

    let now = now_millis();
    let title = doc
        .get("title")
        .and_then(Value::as_str)
        .unwrap_or_else(|| {
            id.trim_end_matches(".md")
                .rsplit('/')
                .next()
                .unwrap_or("Untitled")
        })
        .trim();
    let title = if title.is_empty() { "Untitled" } else { title };
    let content = markdown_content_from_document(doc);
    let folder = normalize_folder_path(
        doc.get("folder")
            .and_then(Value::as_str)
            .unwrap_or_else(|| id.rsplit_once('/').map(|(folder, _)| folder).unwrap_or("")),
    );
    ensure_folder(state, &folder).await?;
    let created_at = doc.get("created_at").and_then(Value::as_i64).unwrap_or(now);
    let updated_at = doc.get("updated_at").and_then(Value::as_i64).unwrap_or(now);
    let trashed_at = doc.get("trashed_at").and_then(Value::as_i64);
    let trash_origin_path = doc
        .get("trash_origin_path")
        .and_then(Value::as_str)
        .map(normalize_folder_path)
        .filter(|path| !path.is_empty());
    let content_checksum = checksum(content);

    sqlx::query(
        "UPDATE vault_documents SET deleted_at = ?, updated_at = ? \
         WHERE lower(id) = lower(?) AND id <> ? AND deleted_at IS NULL",
    )
    .bind(now)
    .bind(now)
    .bind(id)
    .bind(id)
    .execute(&state.db)
    .await?;

    sqlx::query(
        "INSERT INTO vault_documents \
         (id, path, title, kind, content_markdown, content_json, folder_path, tags_json, links_json, aliases_json, properties_json, created_at, updated_at, trashed_at, trash_origin_path, checksum) \
         VALUES (?, ?, ?, 'note', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) \
         ON CONFLICT(id) DO UPDATE SET \
            title = excluded.title, \
            kind = excluded.kind, \
            content_markdown = excluded.content_markdown, \
            content_json = excluded.content_json, \
            folder_path = excluded.folder_path, \
            tags_json = excluded.tags_json, \
            links_json = excluded.links_json, \
            aliases_json = excluded.aliases_json, \
            properties_json = excluded.properties_json, \
            updated_at = excluded.updated_at, \
            trashed_at = excluded.trashed_at, \
            trash_origin_path = excluded.trash_origin_path, \
            deleted_at = NULL, \
            checksum = excluded.checksum",
    )
    .bind(id)
    .bind(id)
    .bind(title)
    .bind(content)
    .bind(doc.get("content_json").map(Value::to_string))
    .bind(&folder)
    .bind(json_text(doc.get("tags"), json!([])))
    .bind(json_text(doc.get("links"), json!([])))
    .bind(json_text(doc.get("aliases"), json!([])))
    .bind(json_text(doc.get("properties"), json!({})))
    .bind(created_at)
    .bind(updated_at)
    .bind(trashed_at)
    .bind(trash_origin_path.as_deref())
    .bind(&content_checksum)
    .execute(&state.db)
    .await?;

    update_search_index(state, id).await?;
    create_version(state, id, "import").await?;
    write_audit(
        state,
        Some(id),
        "import",
        json!({ "path": id, "folder": folder }),
    )
    .await?;
    Ok(true)
}

fn configured_obsidian_vault_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();

    if let Ok(path) = std::env::var("CLAWCONTROL_OBSIDIAN_VAULT_PATH") {
        let trimmed = path.trim();
        if !trimmed.is_empty() {
            paths.push(PathBuf::from(trimmed));
        }
    }

    if let Some(config_dir) = dirs::config_dir() {
        let obsidian_config = config_dir.join("obsidian").join("obsidian.json");
        if let Ok(raw) = fs::read_to_string(obsidian_config) {
            if let Ok(value) = serde_json::from_str::<Value>(&raw) {
                if let Some(vaults) = value.get("vaults").and_then(Value::as_object) {
                    let mut vaults: Vec<&Value> = vaults.values().collect();
                    vaults.sort_by_key(|vault| {
                        vault
                            .get("ts")
                            .and_then(Value::as_i64)
                            .map(|ts| -ts)
                            .unwrap_or(0)
                    });
                    for vault in vaults {
                        if let Some(path) = vault.get("path").and_then(Value::as_str) {
                            paths.push(PathBuf::from(path));
                        }
                    }
                }
            }
        }
    }

    let mut seen = BTreeSet::new();
    paths
        .into_iter()
        .filter(|path| path.is_dir())
        .filter(|path| seen.insert(path.to_string_lossy().to_string()))
        .collect()
}

fn is_hidden_vault_component(path: &FsPath) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .map(|name| name.starts_with('.') || name == "node_modules")
        .unwrap_or(false)
}

fn collect_markdown_files(root: &FsPath, current: &FsPath, files: &mut Vec<PathBuf>) {
    let Ok(entries) = fs::read_dir(current) else {
        return;
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if is_hidden_vault_component(&path) {
            continue;
        }
        if path.is_dir() {
            collect_markdown_files(root, &path, files);
            continue;
        }
        if path
            .extension()
            .and_then(|ext| ext.to_str())
            .map(|ext| ext.eq_ignore_ascii_case("md"))
            .unwrap_or(false)
            && path.strip_prefix(root).is_ok()
        {
            files.push(path);
        }
    }
}

fn markdown_file_to_import_note(root: &FsPath, path: &FsPath) -> Option<Value> {
    let relative = path.strip_prefix(root).ok()?;
    let id = relative.to_string_lossy().replace('\\', "/");
    if id.is_empty() || id.contains("..") || id.contains("/.obsidian/") {
        return None;
    }
    let content = fs::read_to_string(path).ok()?;
    let metadata = fs::metadata(path).ok();
    let updated_at = metadata
        .and_then(|meta| meta.modified().ok())
        .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis().min(i64::MAX as u128) as i64)
        .unwrap_or_else(now_millis);
    let folder = relative
        .parent()
        .map(|parent| parent.to_string_lossy().replace('\\', "/"))
        .unwrap_or_default();
    let title = relative
        .file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or("Untitled");

    Some(json!({
        "_id": id,
        "path": id,
        "title": title,
        "content": content,
        "folder": folder,
        "created_at": updated_at,
        "updated_at": updated_at,
    }))
}

async fn maybe_import_sparse_obsidian_vault(state: &AppState) -> Result<(), AppError> {
    let existing_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM vault_documents WHERE deleted_at IS NULL AND id NOT LIKE '.clawcontrol/%'",
    )
    .fetch_one(&state.db)
    .await?;

    for root in configured_obsidian_vault_paths() {
        let mut markdown_files = Vec::new();
        collect_markdown_files(&root, &root, &mut markdown_files);
        if markdown_files.len() as i64 <= existing_count {
            continue;
        }

        let mut imported = 0usize;
        for path in markdown_files {
            let Some(note) = markdown_file_to_import_note(&root, &path) else {
                continue;
            };
            if import_document(state, &note).await? {
                imported += 1;
            }
        }

        if imported > 0 {
            tracing::info!(
                vault = %root.display(),
                imported,
                existing_count,
                "local vault was sparse; imported markdown files from Obsidian vault"
            );
        }
        break;
    }

    Ok(())
}

async fn list_documents(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    maybe_import_sparse_obsidian_vault(&state).await?;

    let rows = sqlx::query(
        "SELECT id, path, title, kind, content_markdown, folder_path, tags_json, links_json, \
                aliases_json, properties_json, created_at, updated_at, trashed_at, trash_origin_path \
         FROM vault_documents \
         WHERE deleted_at IS NULL \
         ORDER BY updated_at DESC",
    )
    .fetch_all(&state.db)
    .await?;

    let notes = rows
        .iter()
        .map(row_to_note)
        .collect::<Result<Vec<_>, _>>()?;

    let attachment_rows = sqlx::query(
        "SELECT id, path, filename, mime, size, created_at, trashed_at, trash_origin_path \
         FROM vault_attachments \
         WHERE deleted_at IS NULL \
         ORDER BY created_at DESC",
    )
    .fetch_all(&state.db)
    .await?;
    let attachments = attachment_rows
        .iter()
        .map(row_to_attachment)
        .collect::<Result<Vec<_>, _>>()?;

    Ok(success_json(
        json!({ "notes": notes, "attachments": attachments }),
    ))
}

async fn list_folders(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let rows = sqlx::query(
        "SELECT path, name, created_at, updated_at, trashed_at, trash_origin_path \
         FROM vault_folders \
         WHERE deleted_at IS NULL \
         ORDER BY path ASC",
    )
    .fetch_all(&state.db)
    .await?;

    let folders = rows
        .iter()
        .map(row_to_folder)
        .collect::<Result<Vec<_>, _>>()?;

    Ok(success_json(json!({ "folders": folders })))
}

async fn search_documents(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Query(q): Query<SearchQuery>,
) -> Result<Json<Value>, AppError> {
    let raw = q.q.as_deref().unwrap_or_default().trim();
    if raw.is_empty() {
        return Ok(success_json(json!({ "notes": [] })));
    }

    let query = fts_query(raw);
    let like = like_pattern(raw);
    if query.is_empty() && like == "%%" {
        return Ok(success_json(json!({ "notes": [] })));
    }
    let query = if query.is_empty() {
        "__clawcontrol_no_match__".to_string()
    } else {
        query
    };

    let include_trashed = q.include_trashed.unwrap_or(false);
    let rows = sqlx::query(
        "WITH matched_documents AS ( \
            SELECT d.id AS id, 0 AS source_rank \
            FROM vault_documents_fts f \
            JOIN vault_documents d ON d.id = f.id \
            WHERE vault_documents_fts MATCH ? \
              AND d.deleted_at IS NULL \
              AND (? OR d.trashed_at IS NULL) \
            UNION \
            SELECT c.document_id AS id, 1 AS source_rank \
            FROM vault_comments c \
            JOIN vault_documents d ON d.id = c.document_id \
            WHERE lower(c.body) LIKE lower(?) ESCAPE '\\' \
              AND d.deleted_at IS NULL \
              AND (? OR d.trashed_at IS NULL) \
            UNION \
            SELECT r.document_id AS id, 2 AS source_rank \
            FROM vault_comment_replies r \
            JOIN vault_documents d ON d.id = r.document_id \
            WHERE lower(r.body) LIKE lower(?) ESCAPE '\\' \
              AND d.deleted_at IS NULL \
              AND (? OR d.trashed_at IS NULL) \
            UNION \
            SELECT s.document_id AS id, 3 AS source_rank \
            FROM vault_suggestions s \
            JOIN vault_documents d ON d.id = s.document_id \
            WHERE lower(s.patch_json) LIKE lower(?) ESCAPE '\\' \
              AND d.deleted_at IS NULL \
              AND (? OR d.trashed_at IS NULL) \
         ), ranked_documents AS ( \
            SELECT id, MIN(source_rank) AS source_rank FROM matched_documents GROUP BY id \
         ) \
         SELECT d.id, d.path, d.title, d.kind, d.content_markdown, d.folder_path, d.tags_json, d.links_json, \
                d.aliases_json, d.properties_json, d.created_at, d.updated_at, d.trashed_at, d.trash_origin_path \
         FROM ranked_documents m \
         JOIN vault_documents d ON d.id = m.id \
         ORDER BY m.source_rank ASC, d.updated_at DESC \
         LIMIT 100",
    )
    .bind(query)
    .bind(include_trashed)
    .bind(&like)
    .bind(include_trashed)
    .bind(&like)
    .bind(include_trashed)
    .bind(&like)
    .bind(include_trashed)
    .fetch_all(&state.db)
    .await?;

    let notes = rows
        .iter()
        .map(row_to_note)
        .collect::<Result<Vec<_>, _>>()?;

    let attachment_rows = sqlx::query(
        "SELECT id, path, filename, mime, size, created_at, trashed_at, trash_origin_path \
         FROM vault_attachments \
         WHERE deleted_at IS NULL \
           AND (? OR trashed_at IS NULL) \
           AND (lower(id) LIKE lower(?) ESCAPE '\\' \
                OR lower(path) LIKE lower(?) ESCAPE '\\' \
                OR lower(filename) LIKE lower(?) ESCAPE '\\') \
         ORDER BY created_at DESC \
         LIMIT 100",
    )
    .bind(include_trashed)
    .bind(&like)
    .bind(&like)
    .bind(&like)
    .fetch_all(&state.db)
    .await?;
    let attachments = attachment_rows
        .iter()
        .map(row_to_attachment)
        .collect::<Result<Vec<_>, _>>()?;

    Ok(success_json(
        json!({ "notes": notes, "attachments": attachments }),
    ))
}

fn row_to_comment(row: &SqliteRow) -> Result<Value, AppError> {
    let anchor_text: String = row.try_get("anchor_json")?;
    Ok(json!({
        "id": row.try_get::<String, _>("id")?,
        "document_id": row.try_get::<String, _>("document_id")?,
        "anchor": parse_json(anchor_text, json!({})),
        "body": row.try_get::<String, _>("body")?,
        "status": row.try_get::<String, _>("status")?,
        "created_at": row.try_get::<i64, _>("created_at")?,
        "updated_at": row.try_get::<i64, _>("updated_at")?,
        "resolved_at": row.try_get::<Option<i64>, _>("resolved_at")?,
        "replies": [],
    }))
}

fn row_to_comment_reply(row: &SqliteRow) -> Result<Value, AppError> {
    Ok(json!({
        "id": row.try_get::<String, _>("id")?,
        "comment_id": row.try_get::<String, _>("comment_id")?,
        "document_id": row.try_get::<String, _>("document_id")?,
        "body": row.try_get::<String, _>("body")?,
        "created_at": row.try_get::<i64, _>("created_at")?,
        "updated_at": row.try_get::<i64, _>("updated_at")?,
    }))
}

async fn list_comments(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Query(q): Query<DocQuery>,
) -> Result<Json<Value>, AppError> {
    let rows = sqlx::query(
        "SELECT id, document_id, anchor_json, body, status, created_at, updated_at, resolved_at \
         FROM vault_comments \
         WHERE document_id = ? \
         ORDER BY resolved_at IS NOT NULL ASC, created_at DESC",
    )
    .bind(&q.id)
    .fetch_all(&state.db)
    .await?;

    let mut comments = rows
        .iter()
        .map(row_to_comment)
        .collect::<Result<Vec<_>, _>>()?;

    let reply_rows = sqlx::query(
        "SELECT id, comment_id, document_id, body, created_at, updated_at \
         FROM vault_comment_replies \
         WHERE document_id = ? \
         ORDER BY created_at ASC",
    )
    .bind(&q.id)
    .fetch_all(&state.db)
    .await?;

    for comment in &mut comments {
        let Some(comment_id) = comment.get("id").and_then(Value::as_str).map(str::to_owned) else {
            continue;
        };
        let replies = reply_rows
            .iter()
            .filter(|row| {
                row.try_get::<String, _>("comment_id").ok().as_deref() == Some(comment_id.as_str())
            })
            .map(row_to_comment_reply)
            .collect::<Result<Vec<_>, _>>()?;
        if let Some(obj) = comment.as_object_mut() {
            obj.insert("replies".to_string(), json!(replies));
        }
    }

    Ok(success_json(json!({ "comments": comments })))
}

async fn create_comment(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Json(body): Json<CommentBody>,
) -> Result<Json<Value>, AppError> {
    let text = body.body.trim();
    if text.is_empty() {
        return Err(AppError::BadRequest("Comment body required".into()));
    }

    let exists: Option<String> =
        sqlx::query_scalar("SELECT id FROM vault_documents WHERE id = ? AND deleted_at IS NULL")
            .bind(&body.document_id)
            .fetch_optional(&state.db)
            .await?;
    if exists.is_none() {
        return Err(AppError::NotFound("Document not found".into()));
    }

    let now = now_millis();
    let id = random_uuid();
    sqlx::query(
        "INSERT INTO vault_comments \
         (id, document_id, anchor_json, body, status, created_at, updated_at) \
         VALUES (?, ?, ?, ?, 'open', ?, ?)",
    )
    .bind(&id)
    .bind(&body.document_id)
    .bind(body.anchor_json.unwrap_or_else(|| json!({})).to_string())
    .bind(text)
    .bind(now)
    .bind(now)
    .execute(&state.db)
    .await?;

    write_audit(
        &state,
        Some(&body.document_id),
        "comment_create",
        json!({ "comment_id": id }),
    )
    .await?;

    let row = sqlx::query(
        "SELECT id, document_id, anchor_json, body, status, created_at, updated_at, resolved_at \
         FROM vault_comments WHERE id = ?",
    )
    .bind(&id)
    .fetch_one(&state.db)
    .await?;
    Ok(success_json(json!({ "comment": row_to_comment(&row)? })))
}

async fn create_comment_reply(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Path(id): Path<String>,
    Json(body): Json<CommentReplyBody>,
) -> Result<Json<Value>, AppError> {
    let text = body.body.trim();
    if text.is_empty() {
        return Err(AppError::BadRequest("Reply body required".into()));
    }

    let comment_row = sqlx::query("SELECT document_id FROM vault_comments WHERE id = ?")
        .bind(&id)
        .fetch_optional(&state.db)
        .await?;
    let Some(row) = comment_row else {
        return Err(AppError::NotFound("Comment not found".into()));
    };
    let document_id: String = row.try_get("document_id")?;

    let now = now_millis();
    let reply_id = random_uuid();
    sqlx::query(
        "INSERT INTO vault_comment_replies \
         (id, comment_id, document_id, body, created_at, updated_at) \
         VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(&reply_id)
    .bind(&id)
    .bind(&document_id)
    .bind(text)
    .bind(now)
    .bind(now)
    .execute(&state.db)
    .await?;

    write_audit(
        &state,
        Some(&document_id),
        "comment_reply_create",
        json!({ "comment_id": id, "reply_id": reply_id }),
    )
    .await?;

    let row = sqlx::query(
        "SELECT id, comment_id, document_id, body, created_at, updated_at \
         FROM vault_comment_replies WHERE id = ?",
    )
    .bind(&reply_id)
    .fetch_one(&state.db)
    .await?;
    Ok(success_json(
        json!({ "reply": row_to_comment_reply(&row)? }),
    ))
}

async fn resolve_comment(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Path(id): Path<String>,
) -> Result<Json<Value>, AppError> {
    let now = now_millis();
    let result = sqlx::query(
        "UPDATE vault_comments \
         SET status = 'resolved', resolved_at = ?, updated_at = ? \
         WHERE id = ? AND resolved_at IS NULL",
    )
    .bind(now)
    .bind(now)
    .bind(&id)
    .execute(&state.db)
    .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Open comment not found".into()));
    }

    let document_id: Option<String> =
        sqlx::query_scalar("SELECT document_id FROM vault_comments WHERE id = ?")
            .bind(&id)
            .fetch_optional(&state.db)
            .await?;
    write_audit(
        &state,
        document_id.as_deref(),
        "comment_resolve",
        json!({ "comment_id": id }),
    )
    .await?;

    Ok(success_json(json!({ "ok": true, "id": id })))
}

fn row_to_suggestion(row: &SqliteRow) -> Result<Value, AppError> {
    let anchor_text: String = row.try_get("anchor_json")?;
    let patch_text: String = row.try_get("patch_json")?;
    Ok(json!({
        "id": row.try_get::<String, _>("id")?,
        "document_id": row.try_get::<String, _>("document_id")?,
        "anchor": parse_json(anchor_text, json!({})),
        "patch": parse_json(patch_text, json!({})),
        "status": row.try_get::<String, _>("status")?,
        "created_at": row.try_get::<i64, _>("created_at")?,
        "applied_at": row.try_get::<Option<i64>, _>("applied_at")?,
    }))
}

async fn list_suggestions(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Query(q): Query<DocQuery>,
) -> Result<Json<Value>, AppError> {
    let rows = sqlx::query(
        "SELECT id, document_id, anchor_json, patch_json, status, created_at, applied_at \
         FROM vault_suggestions \
         WHERE document_id = ? \
         ORDER BY status = 'open' DESC, created_at DESC",
    )
    .bind(&q.id)
    .fetch_all(&state.db)
    .await?;

    let suggestions = rows
        .iter()
        .map(row_to_suggestion)
        .collect::<Result<Vec<_>, _>>()?;

    Ok(success_json(json!({ "suggestions": suggestions })))
}

async fn create_suggestion(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Json(body): Json<SuggestionBody>,
) -> Result<Json<Value>, AppError> {
    let exists: Option<String> =
        sqlx::query_scalar("SELECT id FROM vault_documents WHERE id = ? AND deleted_at IS NULL")
            .bind(&body.document_id)
            .fetch_optional(&state.db)
            .await?;
    if exists.is_none() {
        return Err(AppError::NotFound("Document not found".into()));
    }

    let now = now_millis();
    let id = random_uuid();
    let mut patch = body.patch_json;
    if let Some(text) = body
        .body
        .as_deref()
        .map(str::trim)
        .filter(|text| !text.is_empty())
    {
        if let Some(obj) = patch.as_object_mut() {
            obj.insert("body".to_string(), json!(text));
        }
    }
    sqlx::query(
        "INSERT INTO vault_suggestions \
         (id, document_id, anchor_json, patch_json, status, created_at) \
         VALUES (?, ?, ?, ?, 'open', ?)",
    )
    .bind(&id)
    .bind(&body.document_id)
    .bind(body.anchor_json.unwrap_or_else(|| json!({})).to_string())
    .bind(patch.to_string())
    .bind(now)
    .execute(&state.db)
    .await?;

    write_audit(
        &state,
        Some(&body.document_id),
        "suggestion_create",
        json!({ "suggestion_id": id }),
    )
    .await?;

    let row = sqlx::query(
        "SELECT id, document_id, anchor_json, patch_json, status, created_at, applied_at \
         FROM vault_suggestions WHERE id = ?",
    )
    .bind(&id)
    .fetch_one(&state.db)
    .await?;
    Ok(success_json(
        json!({ "suggestion": row_to_suggestion(&row)? }),
    ))
}

async fn set_suggestion_status(
    state: &AppState,
    id: &str,
    status: &str,
) -> Result<Json<Value>, AppError> {
    let now = now_millis();
    let result = sqlx::query(
        "UPDATE vault_suggestions \
         SET status = ?, applied_at = ?, created_at = created_at \
         WHERE id = ? AND status = 'open'",
    )
    .bind(status)
    .bind(now)
    .bind(id)
    .execute(&state.db)
    .await?;
    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Open suggestion not found".into()));
    }

    let document_id: Option<String> =
        sqlx::query_scalar("SELECT document_id FROM vault_suggestions WHERE id = ?")
            .bind(id)
            .fetch_optional(&state.db)
            .await?;
    write_audit(
        state,
        document_id.as_deref(),
        if status == "applied" {
            "suggestion_apply"
        } else {
            "suggestion_reject"
        },
        json!({ "suggestion_id": id }),
    )
    .await?;

    Ok(success_json(
        json!({ "ok": true, "id": id, "status": status }),
    ))
}

async fn apply_suggestion(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Path(id): Path<String>,
) -> Result<Json<Value>, AppError> {
    set_suggestion_status(&state, &id, "applied").await
}

async fn reject_suggestion(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Path(id): Path<String>,
) -> Result<Json<Value>, AppError> {
    set_suggestion_status(&state, &id, "rejected").await
}

async fn get_document(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Query(q): Query<DocQuery>,
) -> Result<Json<Value>, AppError> {
    let row = sqlx::query(
        "SELECT id, path, title, kind, content_markdown, folder_path, tags_json, links_json, \
                aliases_json, properties_json, created_at, updated_at, trashed_at, trash_origin_path \
         FROM vault_documents \
         WHERE id = ? AND deleted_at IS NULL",
    )
    .bind(&q.id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Document not found".into()))?;

    Ok(success_json(row_to_note(&row)?))
}

async fn put_document(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Query(q): Query<DocQuery>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, AppError> {
    if q.id.contains("..") || q.id.starts_with('_') || q.id.contains('\0') {
        return Err(AppError::BadRequest("Invalid document ID".into()));
    }

    let now = now_millis();
    let existing = sqlx::query(
        "SELECT id, folder_path, trashed_at FROM vault_documents WHERE id = ? AND deleted_at IS NULL",
    )
    .bind(&q.id)
    .fetch_optional(&state.db)
    .await?;
    if existing.is_some() {
        create_coalesced_autosave_version(&state, &q.id).await?;
    }

    let title = body
        .get("title")
        .and_then(Value::as_str)
        .unwrap_or_else(|| {
            q.id.trim_end_matches(".md")
                .rsplit('/')
                .next()
                .unwrap_or("Untitled")
        })
        .trim();
    let title = if title.is_empty() { "Untitled" } else { title };
    let content = body
        .get("content")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let folder =
        if let Some(row) = existing.as_ref() {
            let trashed_at: Option<i64> = row.try_get("trashed_at")?;
            if trashed_at.is_some() {
                row.try_get::<String, _>("folder_path")?
            } else {
                normalize_folder_path(body.get("folder").and_then(Value::as_str).unwrap_or_else(
                    || {
                        q.id.rsplit_once('/')
                            .map(|(folder, _)| folder)
                            .unwrap_or("")
                    },
                ))
            }
        } else {
            normalize_folder_path(
                body.get("folder")
                    .and_then(Value::as_str)
                    .unwrap_or_else(|| {
                        q.id.rsplit_once('/')
                            .map(|(folder, _)| folder)
                            .unwrap_or("")
                    }),
            )
        };
    ensure_folder(&state, &folder).await?;

    let created_at = body
        .get("created_at")
        .and_then(Value::as_i64)
        .unwrap_or(now);
    let content_checksum = checksum(content);

    sqlx::query(
        "INSERT INTO vault_documents \
         (id, path, title, kind, content_markdown, content_json, folder_path, tags_json, links_json, aliases_json, properties_json, created_at, updated_at, checksum) \
         VALUES (?, ?, ?, 'note', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) \
         ON CONFLICT(id) DO UPDATE SET \
            path = excluded.path, \
            title = excluded.title, \
            kind = excluded.kind, \
            content_markdown = excluded.content_markdown, \
            content_json = excluded.content_json, \
            folder_path = excluded.folder_path, \
            tags_json = excluded.tags_json, \
            links_json = excluded.links_json, \
            aliases_json = excluded.aliases_json, \
            properties_json = excluded.properties_json, \
            updated_at = excluded.updated_at, \
            deleted_at = NULL, \
            checksum = excluded.checksum",
    )
    .bind(&q.id)
    .bind(&q.id)
    .bind(title)
    .bind(content)
    .bind(body.get("content_json").map(Value::to_string))
    .bind(&folder)
    .bind(json_text(body.get("tags"), json!([])))
    .bind(json_text(body.get("links"), json!([])))
    .bind(json_text(body.get("aliases"), json!([])))
    .bind(json_text(body.get("properties"), json!({})))
    .bind(created_at)
    .bind(now)
    .bind(&content_checksum)
    .execute(&state.db)
    .await?;

    update_search_index(&state, &q.id).await?;
    if existing.is_none() {
        create_version(&state, &q.id, "create").await?;
    }
    write_audit(
        &state,
        Some(&q.id),
        if existing.is_some() {
            "update"
        } else {
            "create"
        },
        json!({ "path": q.id, "folder": folder }),
    )
    .await?;

    Ok(success_json(
        json!({ "id": q.id, "rev": format!("local-{now}") }),
    ))
}

async fn delete_document(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Query(q): Query<DocQuery>,
) -> Result<Json<Value>, AppError> {
    create_version(&state, &q.id, "delete").await?;
    let now = now_millis();
    let result = sqlx::query(
        "UPDATE vault_documents SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL",
    )
    .bind(now)
    .bind(now)
    .bind(&q.id)
    .execute(&state.db)
    .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Document not found".into()));
    }

    sqlx::query("DELETE FROM vault_documents_fts WHERE id = ?")
        .bind(&q.id)
        .execute(&state.db)
        .await?;

    write_audit(&state, Some(&q.id), "delete", json!({ "path": q.id })).await?;
    Ok(success_json(json!({ "ok": true, "id": q.id })))
}

async fn trash_document(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Query(q): Query<DocQuery>,
) -> Result<Json<Value>, AppError> {
    create_version(&state, &q.id, "trash").await?;
    let Some(row) = sqlx::query(
        "SELECT folder_path, trashed_at FROM vault_documents WHERE id = ? AND deleted_at IS NULL",
    )
    .bind(&q.id)
    .fetch_optional(&state.db)
    .await?
    else {
        return Err(AppError::NotFound("Document not found".into()));
    };

    let origin: String = row.try_get("folder_path")?;
    let trashed_at: Option<i64> = row.try_get("trashed_at")?;
    let now = now_millis();
    if trashed_at.is_none() {
        sqlx::query(
            "UPDATE vault_documents \
             SET trashed_at = ?, trash_origin_path = ?, updated_at = ? \
             WHERE id = ? AND deleted_at IS NULL",
        )
        .bind(now)
        .bind(&origin)
        .bind(now)
        .bind(&q.id)
        .execute(&state.db)
        .await?;
    }

    update_search_index(&state, &q.id).await?;
    ensure_folder(&state, "Trash").await?;
    write_audit(
        &state,
        Some(&q.id),
        "trash",
        json!({ "path": q.id, "origin_folder": origin }),
    )
    .await?;
    Ok(success_json(
        json!({ "ok": true, "id": q.id, "rev": format!("local-{now}") }),
    ))
}

async fn restore_trashed_document(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Json(body): Json<RestoreTrashBody>,
) -> Result<Json<Value>, AppError> {
    let Some(row) = sqlx::query(
        "SELECT folder_path, trash_origin_path FROM vault_documents \
         WHERE id = ? AND deleted_at IS NULL AND trashed_at IS NOT NULL",
    )
    .bind(&body.id)
    .fetch_optional(&state.db)
    .await?
    else {
        return Err(AppError::NotFound("Trashed document not found".into()));
    };

    let fallback_folder: String = row.try_get("folder_path")?;
    let origin_folder: Option<String> = row.try_get("trash_origin_path")?;
    let folder = body
        .folder
        .as_deref()
        .map(normalize_folder_path)
        .filter(|folder| !folder.starts_with("Trash"))
        .or(origin_folder)
        .unwrap_or(fallback_folder);
    ensure_folder(&state, &folder).await?;

    create_version(&state, &body.id, "restore_from_trash").await?;
    let now = now_millis();
    sqlx::query(
        "UPDATE vault_documents \
         SET folder_path = ?, trashed_at = NULL, trash_origin_path = NULL, updated_at = ? \
         WHERE id = ? AND deleted_at IS NULL",
    )
    .bind(&folder)
    .bind(now)
    .bind(&body.id)
    .execute(&state.db)
    .await?;

    update_search_index(&state, &body.id).await?;
    write_audit(
        &state,
        Some(&body.id),
        "restore_from_trash",
        json!({ "path": body.id, "folder": folder }),
    )
    .await?;
    Ok(success_json(
        json!({ "ok": true, "id": body.id, "rev": format!("local-{now}") }),
    ))
}

async fn trash_folder(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Query(q): Query<FolderQuery>,
) -> Result<Json<Value>, AppError> {
    let path = stored_folder_path(&q.path);
    if path.is_empty() || path == "Trash" {
        return Err(AppError::BadRequest("Folder path required".into()));
    }

    let exists: Option<String> =
        sqlx::query_scalar("SELECT path FROM vault_folders WHERE path = ? AND deleted_at IS NULL")
            .bind(&path)
            .fetch_optional(&state.db)
            .await?;

    let doc_rows = sqlx::query(
        "SELECT id FROM vault_documents \
         WHERE deleted_at IS NULL AND trashed_at IS NULL AND (folder_path = ? OR folder_path LIKE ?)",
    )
    .bind(&path)
    .bind(folder_like(&path))
    .fetch_all(&state.db)
    .await?;
    let doc_ids = doc_rows
        .iter()
        .map(|row| row.try_get::<String, _>("id"))
        .collect::<Result<Vec<_>, _>>()?;
    let attachment_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM vault_attachments \
         WHERE deleted_at IS NULL AND trashed_at IS NULL AND (path = ? OR path LIKE ?)",
    )
    .bind(&path)
    .bind(folder_like(&path))
    .fetch_one(&state.db)
    .await?;
    if exists.is_none() && doc_ids.is_empty() && attachment_count == 0 {
        return Err(AppError::NotFound("Folder not found".into()));
    }
    for id in &doc_ids {
        create_version(&state, id, "folder_trash").await?;
    }

    let now = now_millis();
    let folder_result = sqlx::query(
        "UPDATE vault_folders \
         SET trashed_at = COALESCE(trashed_at, ?), trash_origin_path = COALESCE(trash_origin_path, path), updated_at = ? \
         WHERE deleted_at IS NULL AND (path = ? OR path LIKE ?)",
    )
    .bind(now)
    .bind(now)
    .bind(&path)
    .bind(folder_like(&path))
    .execute(&state.db)
    .await?;

    sqlx::query(
        "UPDATE vault_documents \
         SET trashed_at = COALESCE(trashed_at, ?), trash_origin_path = COALESCE(trash_origin_path, folder_path), updated_at = ? \
         WHERE deleted_at IS NULL AND (folder_path = ? OR folder_path LIKE ?)",
    )
    .bind(now)
    .bind(now)
    .bind(&path)
    .bind(folder_like(&path))
    .execute(&state.db)
    .await?;
    for id in &doc_ids {
        update_search_index(&state, id).await?;
    }
    let attachment_result = sqlx::query(
        "UPDATE vault_attachments \
         SET trashed_at = COALESCE(trashed_at, ?), trash_origin_path = COALESCE(trash_origin_path, path) \
         WHERE deleted_at IS NULL AND (path = ? OR path LIKE ?)",
    )
    .bind(now)
    .bind(&path)
    .bind(folder_like(&path))
    .execute(&state.db)
    .await?;

    ensure_folder(&state, "Trash").await?;
    write_audit(
        &state,
        None,
        "folder_trash",
        json!({
            "path": path,
            "folders": folder_result.rows_affected(),
            "documents": doc_ids.len(),
            "attachments": attachment_result.rows_affected(),
        }),
    )
    .await?;
    Ok(success_json(json!({
        "ok": true,
        "path": q.path,
        "folders": folder_result.rows_affected(),
        "documents": doc_ids.len(),
        "attachments": attachment_result.rows_affected(),
        "rev": format!("local-{now}"),
    })))
}

async fn restore_trashed_folder(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Json(body): Json<RestoreFolderTrashBody>,
) -> Result<Json<Value>, AppError> {
    let path = stored_folder_path(&body.path);
    if path.is_empty() {
        return Err(AppError::BadRequest("Folder path required".into()));
    }

    let exists: Option<String> = sqlx::query_scalar(
        "SELECT path FROM vault_folders \
         WHERE path = ? AND deleted_at IS NULL AND trashed_at IS NOT NULL",
    )
    .bind(&path)
    .fetch_optional(&state.db)
    .await?;

    let doc_rows = sqlx::query(
        "SELECT id FROM vault_documents \
         WHERE deleted_at IS NULL AND trashed_at IS NOT NULL AND (folder_path = ? OR folder_path LIKE ?)",
    )
    .bind(&path)
    .bind(folder_like(&path))
    .fetch_all(&state.db)
    .await?;
    let doc_ids = doc_rows
        .iter()
        .map(|row| row.try_get::<String, _>("id"))
        .collect::<Result<Vec<_>, _>>()?;
    let attachment_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM vault_attachments \
         WHERE deleted_at IS NULL AND trashed_at IS NOT NULL AND (path = ? OR path LIKE ?)",
    )
    .bind(&path)
    .bind(folder_like(&path))
    .fetch_one(&state.db)
    .await?;
    if exists.is_none() && doc_ids.is_empty() && attachment_count == 0 {
        return Err(AppError::NotFound("Trashed folder not found".into()));
    }

    let now = now_millis();
    let folder_result = sqlx::query(
        "UPDATE vault_folders \
         SET trashed_at = NULL, trash_origin_path = NULL, updated_at = ? \
         WHERE deleted_at IS NULL AND trashed_at IS NOT NULL AND (path = ? OR path LIKE ?)",
    )
    .bind(now)
    .bind(&path)
    .bind(folder_like(&path))
    .execute(&state.db)
    .await?;

    sqlx::query(
        "UPDATE vault_documents \
         SET trashed_at = NULL, trash_origin_path = NULL, updated_at = ? \
         WHERE deleted_at IS NULL AND trashed_at IS NOT NULL AND (folder_path = ? OR folder_path LIKE ?)",
    )
    .bind(now)
    .bind(&path)
    .bind(folder_like(&path))
    .execute(&state.db)
    .await?;
    for id in &doc_ids {
        update_search_index(&state, id).await?;
    }
    let attachment_result = sqlx::query(
        "UPDATE vault_attachments \
         SET trashed_at = NULL, trash_origin_path = NULL \
         WHERE deleted_at IS NULL AND trashed_at IS NOT NULL AND (path = ? OR path LIKE ?)",
    )
    .bind(&path)
    .bind(folder_like(&path))
    .execute(&state.db)
    .await?;

    write_audit(
        &state,
        None,
        "folder_restore_from_trash",
        json!({
            "path": path,
            "folders": folder_result.rows_affected(),
            "documents": doc_ids.len(),
            "attachments": attachment_result.rows_affected(),
        }),
    )
    .await?;
    Ok(success_json(json!({
        "ok": true,
        "path": path,
        "folders": folder_result.rows_affected(),
        "documents": doc_ids.len(),
        "attachments": attachment_result.rows_affected(),
        "rev": format!("local-{now}"),
    })))
}

async fn empty_trash(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let rows = sqlx::query(
        "SELECT id FROM vault_documents \
         WHERE deleted_at IS NULL AND trashed_at IS NOT NULL",
    )
    .fetch_all(&state.db)
    .await?;
    let ids = rows
        .iter()
        .map(|row| row.try_get::<String, _>("id"))
        .collect::<Result<Vec<_>, _>>()?;
    for id in &ids {
        create_version(&state, id, "empty_trash").await?;
    }

    let now = now_millis();
    let result = sqlx::query(
        "UPDATE vault_documents \
         SET deleted_at = ?, updated_at = ? \
         WHERE deleted_at IS NULL AND trashed_at IS NOT NULL",
    )
    .bind(now)
    .bind(now)
    .execute(&state.db)
    .await?;

    for id in &ids {
        sqlx::query("DELETE FROM vault_documents_fts WHERE id = ?")
            .bind(id)
            .execute(&state.db)
            .await?;
    }
    let folder_result = sqlx::query(
        "UPDATE vault_folders \
         SET deleted_at = ?, updated_at = ? \
         WHERE deleted_at IS NULL AND trashed_at IS NOT NULL",
    )
    .bind(now)
    .bind(now)
    .execute(&state.db)
    .await?;
    let attachment_result = sqlx::query(
        "UPDATE vault_attachments \
         SET deleted_at = ? \
         WHERE deleted_at IS NULL AND trashed_at IS NOT NULL",
    )
    .bind(now)
    .execute(&state.db)
    .await?;

    write_audit(
        &state,
        None,
        "trash_empty",
        json!({
            "deleted": result.rows_affected(),
            "folders": folder_result.rows_affected(),
            "attachments": attachment_result.rows_affected(),
            "ids": ids,
        }),
    )
    .await?;

    Ok(success_json(json!({
        "ok": true,
        "deleted": result.rows_affected(),
        "folders": folder_result.rows_affected(),
        "attachments": attachment_result.rows_affected(),
    })))
}

async fn vault_status(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let live_notes: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM vault_documents \
         WHERE deleted_at IS NULL AND trashed_at IS NULL",
    )
    .fetch_one(&state.db)
    .await?;
    let trashed_notes: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM vault_documents \
         WHERE deleted_at IS NULL AND trashed_at IS NOT NULL",
    )
    .fetch_one(&state.db)
    .await?;
    let folders: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM vault_folders WHERE deleted_at IS NULL")
            .fetch_one(&state.db)
            .await?;
    let attachments: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM vault_attachments WHERE deleted_at IS NULL")
            .fetch_one(&state.db)
            .await?;
    let attachment_bytes: i64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(size), 0) FROM vault_attachments WHERE deleted_at IS NULL",
    )
    .fetch_one(&state.db)
    .await?;
    let versions: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM vault_versions")
        .fetch_one(&state.db)
        .await?;
    let open_comments: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM vault_comments WHERE status = 'open'")
            .fetch_one(&state.db)
            .await?;
    let open_suggestions: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM vault_suggestions WHERE status = 'open'")
            .fetch_one(&state.db)
            .await?;
    let pending_saves: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM vault_save_queue")
        .fetch_one(&state.db)
        .await?;
    let audit_events: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM vault_audit_log")
        .fetch_one(&state.db)
        .await?;
    let app_data = crate::app_paths::resolve_app_data_dir();

    Ok(success_json(json!({
        "canonical_store": "local_sqlite",
        "remote_required": false,
        "encrypted_backup_supported": true,
        "database_path": app_data.join("local.db").display().to_string(),
        "attachments_path": attachment_root().display().to_string(),
        "counts": {
            "live_notes": live_notes,
            "trashed_notes": trashed_notes,
            "folders": folders,
            "attachments": attachments,
            "attachment_bytes": attachment_bytes,
            "versions": versions,
            "open_comments": open_comments,
            "open_suggestions": open_suggestions,
            "pending_saves": pending_saves,
            "audit_events": audit_events,
        },
    })))
}

async fn collaboration_health(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let approved_pairings: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM vault_collaboration_pairings \
         WHERE status = 'approved' AND revoked_at IS NULL",
    )
    .fetch_one(&state.db)
    .await?;
    let now = now_millis();
    let active_events: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM vault_collaboration_events \
         WHERE expires_at IS NULL OR expires_at > ?",
    )
    .bind(now)
    .fetch_one(&state.db)
    .await?;
    let crdt_snapshots: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM vault_collaboration_crdt_state")
            .fetch_one(&state.db)
            .await?;
    let last_event_at: Option<i64> =
        sqlx::query_scalar("SELECT MAX(created_at) FROM vault_collaboration_events")
            .fetch_one(&state.db)
            .await?;
    let last_snapshot_at: Option<i64> =
        sqlx::query_scalar("SELECT MAX(updated_at) FROM vault_collaboration_crdt_state")
            .fetch_one(&state.db)
            .await?;
    let last_pairing_seen_at: Option<i64> = sqlx::query_scalar(
        "SELECT MAX(last_seen_at) FROM vault_collaboration_pairings \
         WHERE status = 'approved' AND revoked_at IS NULL",
    )
    .fetch_one(&state.db)
    .await?;

    Ok(success_json(json!({
        "canonical_store": "local_sqlite",
        "remote_required": false,
        "collaboration_pairing": "approved",
        "crdt_snapshots": true,
        "events": true,
        "counts": {
            "approved_pairings": approved_pairings,
            "active_events": active_events,
            "crdt_snapshots": crdt_snapshots,
        },
        "lastEventAt": last_event_at,
        "lastSnapshotAt": last_snapshot_at,
        "lastPairingSeenAt": last_pairing_seen_at,
    })))
}

async fn list_audit_events(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Query(q): Query<AuditQuery>,
) -> Result<Json<Value>, AppError> {
    let limit = q.limit.unwrap_or(50).clamp(1, 200);
    let rows = if let Some(id) = q.id.as_deref().filter(|id| !id.is_empty()) {
        sqlx::query(
            "SELECT id, document_id, action, metadata_json, created_at \
             FROM vault_audit_log \
             WHERE document_id = ? \
             ORDER BY created_at DESC \
             LIMIT ?",
        )
        .bind(id)
        .bind(limit)
        .fetch_all(&state.db)
        .await?
    } else {
        sqlx::query(
            "SELECT id, document_id, action, metadata_json, created_at \
             FROM vault_audit_log \
             ORDER BY created_at DESC \
             LIMIT ?",
        )
        .bind(limit)
        .fetch_all(&state.db)
        .await?
    };

    let events = rows
        .iter()
        .map(|row| {
            let metadata: String = row.try_get("metadata_json")?;
            let metadata = serde_json::from_str::<Value>(&metadata).unwrap_or_else(|_| json!({}));
            Ok::<Value, AppError>(json!({
                "id": row.try_get::<String, _>("id")?,
                "document_id": row.try_get::<Option<String>, _>("document_id")?,
                "action": row.try_get::<String, _>("action")?,
                "metadata": metadata,
                "created_at": row.try_get::<i64, _>("created_at")?,
            }))
        })
        .collect::<Result<Vec<_>, _>>()?;

    Ok(success_json(json!({ "events": events })))
}

async fn list_sync_ledger(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Query(q): Query<SyncLedgerQuery>,
) -> Result<Json<Value>, AppError> {
    let limit = q.limit.unwrap_or(50).clamp(1, 200);
    let save_rows = sqlx::query(
        "SELECT id, document_id, operation, payload_json, created_at, attempts, last_error \
         FROM vault_save_queue \
         ORDER BY created_at DESC \
         LIMIT ?",
    )
    .bind(limit)
    .fetch_all(&state.db)
    .await?;
    let sync_rows = sqlx::query(
        "SELECT provider, remote_id, local_id, remote_rev, last_synced_at, conflict_state, conflict_json \
         FROM vault_sync_state \
         ORDER BY COALESCE(last_synced_at, 0) DESC \
         LIMIT ?",
    )
    .bind(limit)
    .fetch_all(&state.db)
    .await?;

    let pending_saves = save_rows
        .iter()
        .map(|row| {
            let payload: String = row.try_get("payload_json")?;
            let payload = serde_json::from_str::<Value>(&payload).unwrap_or_else(|_| json!({}));
            Ok::<Value, AppError>(json!({
                "id": row.try_get::<String, _>("id")?,
                "document_id": row.try_get::<String, _>("document_id")?,
                "operation": row.try_get::<String, _>("operation")?,
                "payload": payload,
                "created_at": row.try_get::<i64, _>("created_at")?,
                "attempts": row.try_get::<i64, _>("attempts")?,
                "last_error": row.try_get::<Option<String>, _>("last_error")?,
            }))
        })
        .collect::<Result<Vec<_>, _>>()?;
    let sync_states = sync_rows
        .iter()
        .map(|row| {
            let conflict: String = row.try_get("conflict_json")?;
            let conflict = serde_json::from_str::<Value>(&conflict).unwrap_or_else(|_| json!({}));
            Ok::<Value, AppError>(json!({
                "provider": row.try_get::<String, _>("provider")?,
                "remote_id": row.try_get::<String, _>("remote_id")?,
                "local_id": row.try_get::<String, _>("local_id")?,
                "remote_rev": row.try_get::<Option<String>, _>("remote_rev")?,
                "last_synced_at": row.try_get::<Option<i64>, _>("last_synced_at")?,
                "conflict_state": row.try_get::<String, _>("conflict_state")?,
                "conflict": conflict,
            }))
        })
        .collect::<Result<Vec<_>, _>>()?;

    Ok(success_json(json!({
        "pending_saves": pending_saves,
        "sync_states": sync_states,
    })))
}

async fn resolve_sync_conflict(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Json(body): Json<ResolveSyncConflictBody>,
) -> Result<Json<Value>, AppError> {
    let provider = body.provider.trim();
    let remote_id = body.remote_id.trim();
    if provider.is_empty() || remote_id.is_empty() {
        return Err(AppError::BadRequest(
            "Provider and remote ID are required".into(),
        ));
    }

    let row = sqlx::query(
        "SELECT local_id, remote_rev, conflict_state \
         FROM vault_sync_state \
         WHERE provider = ? AND remote_id = ?",
    )
    .bind(provider)
    .bind(remote_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Sync conflict not found".into()))?;

    let local_id: String = row.try_get("local_id")?;
    let remote_rev: Option<String> = row.try_get("remote_rev")?;
    let previous_state: String = row.try_get("conflict_state")?;
    let resolved_at = now_millis();

    sqlx::query(
        "UPDATE vault_sync_state \
         SET conflict_state = 'clean', conflict_json = '{}', last_synced_at = COALESCE(last_synced_at, ?) \
         WHERE provider = ? AND remote_id = ?",
    )
    .bind(resolved_at)
    .bind(provider)
    .bind(remote_id)
    .execute(&state.db)
    .await?;

    write_audit(
        &state,
        Some(&local_id),
        "sync_conflict_resolved",
        json!({
            "provider": provider,
            "remote_id": remote_id,
            "remote_rev": remote_rev,
            "previous_state": previous_state,
            "resolution": "review_suggestion_created",
        }),
    )
    .await?;

    Ok(success_json(json!({
        "provider": provider,
        "remote_id": remote_id,
        "local_id": local_id,
        "resolved_at": resolved_at,
    })))
}

async fn list_collaboration_events(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Query(q): Query<CollaborationEventsQuery>,
) -> Result<Json<Value>, AppError> {
    let now = now_millis();
    let since = q.since.unwrap_or(now - 30_000);
    let limit = q.limit.unwrap_or(100).clamp(1, 300);
    sqlx::query(
        "DELETE FROM vault_collaboration_events WHERE expires_at IS NOT NULL AND expires_at <= ?",
    )
    .bind(now)
    .execute(&state.db)
    .await?;

    let rows = sqlx::query(
        "SELECT id, document_id, peer_id, peer_name, peer_seen_at, kind, content_markdown, base_checksum, \
         content_checksum, metadata_json, created_at \
         FROM vault_collaboration_events \
         WHERE document_id = ? AND created_at >= ? AND (expires_at IS NULL OR expires_at > ?) \
         ORDER BY created_at ASC \
         LIMIT ?",
    )
    .bind(&q.id)
    .bind(since)
    .bind(now)
    .bind(limit)
    .fetch_all(&state.db)
    .await?;

    let events = rows
        .iter()
        .map(|row| {
            let document_id: String = row.try_get("document_id")?;
            let kind: String = row.try_get("kind")?;
            let metadata = parse_json(row.try_get::<String, _>("metadata_json")?, json!({}));
            Ok::<Value, AppError>(json!({
                "protocol": "clawcontrol-notes-local-collab",
                "version": 1,
                "eventId": row.try_get::<String, _>("id")?,
                "clientId": metadata
                    .get("clientId")
                    .cloned()
                    .unwrap_or_else(|| Value::String(row.try_get::<String, _>("peer_id").unwrap_or_default())),
                "sequence": metadata
                    .get("sequence")
                    .cloned()
                    .unwrap_or_else(|| Value::Number(row.try_get::<i64, _>("created_at").unwrap_or_default().into())),
                "type": kind,
                "documentId": document_id,
                "peer": {
                    "id": row.try_get::<String, _>("peer_id")?,
                    "name": row.try_get::<String, _>("peer_name")?,
                    "seenAt": row.try_get::<i64, _>("peer_seen_at")?,
                },
                "content": row.try_get::<Option<String>, _>("content_markdown")?,
                "baseChecksum": row.try_get::<Option<String>, _>("base_checksum")?,
                "contentChecksum": row.try_get::<Option<String>, _>("content_checksum")?,
                "operations": metadata.get("operations").cloned().unwrap_or(Value::Null),
                "crdtOperations": metadata.get("crdtOperations").cloned().unwrap_or(Value::Null),
                "richOperations": metadata.get("richOperations").cloned().unwrap_or(Value::Null),
                "cursor": metadata.get("cursor").cloned().unwrap_or(Value::Null),
                "updatedAt": row.try_get::<i64, _>("created_at")?,
            }))
        })
        .collect::<Result<Vec<_>, _>>()?;

    Ok(success_json(json!({ "events": events, "now": now })))
}

async fn create_collaboration_event(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Json(body): Json<CollaborationEventBody>,
) -> Result<Json<Value>, AppError> {
    validate_collaboration_event_body(&body)?;
    let document_id = body.document_id.trim();
    let peer_id = body.peer_id.trim();
    let peer_name = body.peer_name.trim();

    let exists: Option<i64> = sqlx::query_scalar(
        "SELECT 1 FROM vault_documents WHERE id = ? AND deleted_at IS NULL LIMIT 1",
    )
    .bind(document_id)
    .fetch_optional(&state.db)
    .await?;
    if exists.is_none() {
        return Err(AppError::NotFound("Document not found".into()));
    }

    let now = now_millis();
    let created_at = body.updated_at.unwrap_or(now);
    let event_id = body
        .event_id
        .as_ref()
        .map(|event_id| event_id.trim().to_string())
        .unwrap_or_else(random_uuid);
    let ttl_ms = collaboration_event_ttl_ms(body.ttl_ms);
    let expires_at = Some(now + ttl_ms);
    let client_id = body
        .client_id
        .as_ref()
        .map(|client_id| client_id.trim().to_string())
        .unwrap_or_else(|| peer_id.to_string());
    let metadata_json = json!({
        "clientId": client_id,
        "sequence": body.sequence.unwrap_or(created_at),
        "operations": body.operations,
        "crdtOperations": body.crdt_operations,
        "richOperations": body.rich_operations,
        "cursor": body.cursor,
    })
    .to_string();
    sqlx::query(
        "DELETE FROM vault_collaboration_events WHERE expires_at IS NOT NULL AND expires_at <= ?",
    )
    .bind(now)
    .execute(&state.db)
    .await?;

    sqlx::query(
        "INSERT OR IGNORE INTO vault_collaboration_events \
         (id, document_id, peer_id, peer_name, peer_seen_at, kind, content_markdown, base_checksum, \
          content_checksum, metadata_json, created_at, expires_at) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(event_id)
    .bind(document_id)
    .bind(peer_id)
    .bind(peer_name)
    .bind(body.peer_seen_at.unwrap_or(created_at))
    .bind(&body.kind)
    .bind(body.content)
    .bind(body.base_checksum)
    .bind(body.content_checksum)
    .bind(metadata_json)
    .bind(created_at)
    .bind(expires_at)
    .execute(&state.db)
    .await?;

    Ok(success_json(
        json!({ "ok": true, "created_at": created_at }),
    ))
}

async fn get_collaboration_crdt_state(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Query(q): Query<CollaborationCrdtStateQuery>,
) -> Result<Json<Value>, AppError> {
    let document_id = q.id.trim();
    if document_id.is_empty() {
        return Err(AppError::BadRequest("Missing CRDT document".into()));
    }
    let row = sqlx::query(
        "SELECT state_json, checksum, client_id, sequence, updated_at \
         FROM vault_collaboration_crdt_state \
         WHERE document_id = ?",
    )
    .bind(document_id)
    .fetch_optional(&state.db)
    .await?;

    let Some(row) = row else {
        return Ok(success_json(json!({ "state": null })));
    };
    let state_json = parse_json(row.try_get::<String, _>("state_json")?, json!([]));
    Ok(success_json(json!({
        "documentId": document_id,
        "state": state_json,
        "checksum": row.try_get::<String, _>("checksum")?,
        "clientId": row.try_get::<Option<String>, _>("client_id")?,
        "sequence": row.try_get::<i64, _>("sequence")?,
        "updatedAt": row.try_get::<i64, _>("updated_at")?,
    })))
}

async fn put_collaboration_crdt_state(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Json(body): Json<CollaborationCrdtStateBody>,
) -> Result<Json<Value>, AppError> {
    validate_collaboration_crdt_state_body(&body)?;
    let document_id = body.document_id.trim();
    let exists: Option<i64> = sqlx::query_scalar(
        "SELECT 1 FROM vault_documents WHERE id = ? AND deleted_at IS NULL LIMIT 1",
    )
    .bind(document_id)
    .fetch_optional(&state.db)
    .await?;
    if exists.is_none() {
        return Err(AppError::NotFound("Document not found".into()));
    }

    let updated_at = body.updated_at.unwrap_or_else(now_millis);
    let client_id = body
        .client_id
        .as_ref()
        .map(|client_id| client_id.trim().to_string());
    sqlx::query(
        "INSERT INTO vault_collaboration_crdt_state \
         (document_id, state_json, checksum, client_id, sequence, updated_at) \
         VALUES (?, ?, ?, ?, ?, ?) \
         ON CONFLICT(document_id) DO UPDATE SET \
             state_json = excluded.state_json, \
             checksum = excluded.checksum, \
             client_id = excluded.client_id, \
             sequence = excluded.sequence, \
             updated_at = excluded.updated_at",
    )
    .bind(document_id)
    .bind(body.state.to_string())
    .bind(body.checksum.trim())
    .bind(client_id)
    .bind(body.sequence.unwrap_or(0))
    .bind(updated_at)
    .execute(&state.db)
    .await?;

    Ok(success_json(json!({ "ok": true, "updatedAt": updated_at })))
}

async fn list_collaboration_pairings(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let rows = sqlx::query(
        "SELECT id, pairing_key_hash, device_label, status, created_at, updated_at, \
         approved_at, revoked_at, last_seen_at \
         FROM vault_collaboration_pairings \
         ORDER BY updated_at DESC",
    )
    .fetch_all(&state.db)
    .await?;

    let pairings = rows
        .iter()
        .map(|row| {
            let hash: String = row.try_get("pairing_key_hash")?;
            Ok::<Value, AppError>(json!({
                "id": row.try_get::<String, _>("id")?,
                "deviceLabel": row.try_get::<String, _>("device_label")?,
                "status": row.try_get::<String, _>("status")?,
                "keyFingerprint": hash.chars().take(12).collect::<String>(),
                "createdAt": row.try_get::<i64, _>("created_at")?,
                "updatedAt": row.try_get::<i64, _>("updated_at")?,
                "approvedAt": row.try_get::<Option<i64>, _>("approved_at")?,
                "revokedAt": row.try_get::<Option<i64>, _>("revoked_at")?,
                "lastSeenAt": row.try_get::<Option<i64>, _>("last_seen_at")?,
            }))
        })
        .collect::<Result<Vec<_>, _>>()?;

    Ok(success_json(json!({ "pairings": pairings })))
}

async fn approve_collaboration_pairing(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Json(body): Json<CollaborationPairingBody>,
) -> Result<Json<Value>, AppError> {
    let pairing_key = body.pairing_key.trim();
    if !validate_collaboration_pairing_key(pairing_key) {
        return Err(AppError::BadRequest(
            "Invalid collaboration pairing key".into(),
        ));
    }

    let now = now_millis();
    let pairing_key_hash = collaboration_pairing_key_hash(pairing_key);
    let device_label = collaboration_pairing_label(body.device_label.as_ref());
    let existing_id: Option<String> = sqlx::query_scalar(
        "SELECT id FROM vault_collaboration_pairings WHERE pairing_key_hash = ? LIMIT 1",
    )
    .bind(&pairing_key_hash)
    .fetch_optional(&state.db)
    .await?;
    let pairing_id = existing_id.unwrap_or_else(random_uuid);

    sqlx::query(
        "INSERT INTO vault_collaboration_pairings \
         (id, pairing_key_hash, device_label, status, created_at, updated_at, approved_at, revoked_at, last_seen_at) \
         VALUES (?, ?, ?, 'approved', ?, ?, ?, NULL, NULL) \
         ON CONFLICT(pairing_key_hash) DO UPDATE SET \
             device_label = excluded.device_label, \
             status = 'approved', \
             updated_at = excluded.updated_at, \
             approved_at = excluded.approved_at, \
             revoked_at = NULL",
    )
    .bind(&pairing_id)
    .bind(&pairing_key_hash)
    .bind(&device_label)
    .bind(now)
    .bind(now)
    .bind(now)
    .execute(&state.db)
    .await?;

    sqlx::query(
        "INSERT INTO vault_audit_log (id, document_id, action, metadata_json, created_at) \
         VALUES (?, NULL, ?, ?, ?)",
    )
    .bind(random_uuid())
    .bind("vault_collaboration_pairing_approved")
    .bind(json!({ "pairingId": pairing_id, "deviceLabel": device_label }).to_string())
    .bind(now)
    .execute(&state.db)
    .await?;

    Ok(success_json(json!({
        "id": pairing_id,
        "deviceLabel": device_label,
        "status": "approved",
        "keyFingerprint": pairing_key_hash.chars().take(12).collect::<String>(),
        "approvedAt": now,
    })))
}

async fn revoke_collaboration_pairing(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Json(body): Json<CollaborationPairingRevokeBody>,
) -> Result<Json<Value>, AppError> {
    let pairing_id = body.pairing_id.as_deref().map(str::trim).unwrap_or("");
    let pairing_key = body.pairing_key.as_deref().map(str::trim).unwrap_or("");
    if pairing_id.is_empty() && pairing_key.is_empty() {
        return Err(AppError::BadRequest(
            "Missing collaboration pairing to revoke".into(),
        ));
    }
    if !pairing_key.is_empty() && !validate_collaboration_pairing_key(pairing_key) {
        return Err(AppError::BadRequest(
            "Invalid collaboration pairing key".into(),
        ));
    }

    let now = now_millis();
    let result = if !pairing_id.is_empty() {
        sqlx::query(
            "UPDATE vault_collaboration_pairings \
             SET status = 'revoked', revoked_at = ?, updated_at = ? \
             WHERE id = ? AND revoked_at IS NULL",
        )
        .bind(now)
        .bind(now)
        .bind(pairing_id)
        .execute(&state.db)
        .await?
    } else {
        let pairing_key_hash = collaboration_pairing_key_hash(pairing_key);
        sqlx::query(
            "UPDATE vault_collaboration_pairings \
             SET status = 'revoked', revoked_at = ?, updated_at = ? \
             WHERE pairing_key_hash = ? AND revoked_at IS NULL",
        )
        .bind(now)
        .bind(now)
        .bind(pairing_key_hash)
        .execute(&state.db)
        .await?
    };

    sqlx::query(
        "INSERT INTO vault_audit_log (id, document_id, action, metadata_json, created_at) \
         VALUES (?, NULL, ?, ?, ?)",
    )
    .bind(random_uuid())
    .bind("vault_collaboration_pairing_revoked")
    .bind(json!({ "pairingId": pairing_id, "revoked": result.rows_affected() }).to_string())
    .bind(now)
    .execute(&state.db)
    .await?;

    Ok(success_json(json!({
        "revoked": result.rows_affected(),
        "revokedAt": now,
    })))
}

async fn post_attachment(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Json(body): Json<AttachmentBody>,
) -> Result<Json<Value>, AppError> {
    let id = attachment_id(&body)?;
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
    let sha256 = hex::encode(Sha256::digest(&bytes));
    let root = attachment_root();
    let shard = &sha256[..2];
    let storage_dir = root.join(shard);
    tokio::fs::create_dir_all(&storage_dir)
        .await
        .map_err(|e| AppError::Internal(e.into()))?;
    let storage_path = format!("{shard}/{sha256}");
    tokio::fs::write(storage_dir.join(&sha256), &bytes)
        .await
        .map_err(|e| AppError::Internal(e.into()))?;

    let folder = body
        .folder
        .as_deref()
        .map(normalize_folder_path)
        .filter(|folder| !folder.is_empty())
        .unwrap_or_else(|| "attachments".to_string());
    ensure_folder(&state, &folder).await?;
    let filename = clean_file_name(&body.name);
    let mime = body
        .mime
        .as_deref()
        .map(str::trim)
        .filter(|mime| !mime.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| attachment_content_type(&filename, None));
    let now = now_millis();

    sqlx::query(
        "INSERT INTO vault_attachments \
         (id, document_id, path, filename, mime, size, sha256, storage_path, created_at) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) \
         ON CONFLICT(id) DO UPDATE SET \
            document_id = excluded.document_id, \
            path = excluded.path, \
            filename = excluded.filename, \
            mime = excluded.mime, \
            size = excluded.size, \
            sha256 = excluded.sha256, \
            storage_path = excluded.storage_path, \
            deleted_at = NULL, \
            trashed_at = NULL, \
            trash_origin_path = NULL",
    )
    .bind(&id)
    .bind(body.document_id.as_deref())
    .bind(&folder)
    .bind(&filename)
    .bind(&mime)
    .bind(bytes.len() as i64)
    .bind(&sha256)
    .bind(&storage_path)
    .bind(now)
    .execute(&state.db)
    .await?;

    write_audit(
        &state,
        body.document_id.as_deref(),
        "attachment_upload",
        json!({ "id": id, "path": folder, "mime": mime, "size": bytes.len() }),
    )
    .await?;

    Ok(success_json(json!({
        "id": id,
        "rev": format!("local-{now}"),
        "mime": mime,
        "size": bytes.len(),
        "created_at": now,
    })))
}

async fn trash_attachment(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Query(q): Query<DocQuery>,
) -> Result<Json<Value>, AppError> {
    let Some(row) = sqlx::query(
        "SELECT path, trashed_at FROM vault_attachments WHERE id = ? AND deleted_at IS NULL",
    )
    .bind(&q.id)
    .fetch_optional(&state.db)
    .await?
    else {
        return Err(AppError::NotFound("Attachment not found".into()));
    };

    let origin: String = row.try_get("path")?;
    let trashed_at: Option<i64> = row.try_get("trashed_at")?;
    let now = now_millis();
    if trashed_at.is_none() {
        sqlx::query(
            "UPDATE vault_attachments \
             SET trashed_at = ?, trash_origin_path = ? \
             WHERE id = ? AND deleted_at IS NULL",
        )
        .bind(now)
        .bind(&origin)
        .bind(&q.id)
        .execute(&state.db)
        .await?;
    }

    ensure_folder(&state, "Trash").await?;
    write_audit(
        &state,
        None,
        "attachment_trash",
        json!({ "id": q.id, "origin_folder": origin }),
    )
    .await?;
    Ok(success_json(
        json!({ "ok": true, "id": q.id, "rev": format!("local-{now}") }),
    ))
}

async fn restore_trashed_attachment(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Json(body): Json<RestoreTrashBody>,
) -> Result<Json<Value>, AppError> {
    let Some(row) = sqlx::query(
        "SELECT path, trash_origin_path FROM vault_attachments \
         WHERE id = ? AND deleted_at IS NULL AND trashed_at IS NOT NULL",
    )
    .bind(&body.id)
    .fetch_optional(&state.db)
    .await?
    else {
        return Err(AppError::NotFound("Trashed attachment not found".into()));
    };

    let fallback_folder: String = row.try_get("path")?;
    let origin_folder: Option<String> = row.try_get("trash_origin_path")?;
    let folder = body
        .folder
        .as_deref()
        .map(normalize_folder_path)
        .filter(|folder| !folder.starts_with("Trash"))
        .or(origin_folder)
        .unwrap_or(fallback_folder);
    ensure_folder(&state, &folder).await?;

    let now = now_millis();
    sqlx::query(
        "UPDATE vault_attachments \
         SET path = ?, trashed_at = NULL, trash_origin_path = NULL \
         WHERE id = ? AND deleted_at IS NULL",
    )
    .bind(&folder)
    .bind(&body.id)
    .execute(&state.db)
    .await?;

    write_audit(
        &state,
        None,
        "attachment_restore_from_trash",
        json!({ "id": body.id, "folder": folder }),
    )
    .await?;
    Ok(success_json(
        json!({ "ok": true, "id": body.id, "rev": format!("local-{now}") }),
    ))
}

async fn delete_attachment(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Query(q): Query<DocQuery>,
) -> Result<Json<Value>, AppError> {
    let now = now_millis();
    let result = sqlx::query(
        "UPDATE vault_attachments SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL",
    )
    .bind(now)
    .bind(&q.id)
    .execute(&state.db)
    .await?;
    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Attachment not found".into()));
    }
    write_audit(&state, None, "attachment_delete", json!({ "id": q.id })).await?;
    Ok(success_json(json!({ "ok": true, "id": q.id })))
}

async fn import_attachment_from_backup(
    state: &AppState,
    attachment: &Value,
) -> Result<bool, AppError> {
    let Some(id) = attachment.get("id").and_then(Value::as_str) else {
        return Ok(false);
    };
    if id.is_empty() || id.contains("..") || id.starts_with('_') || id.contains('\0') {
        return Ok(false);
    }

    let data = attachment
        .get("data_base64")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|data| !data.is_empty());
    let Some(data) = data else {
        return Ok(false);
    };

    let bytes = BASE64
        .decode(data.as_bytes())
        .map_err(|_| AppError::BadRequest("Backup attachment data is not valid base64".into()))?;
    let sha256 = hex::encode(Sha256::digest(&bytes));
    let root = attachment_root();
    let shard = &sha256[..2];
    let storage_dir = root.join(shard);
    tokio::fs::create_dir_all(&storage_dir)
        .await
        .map_err(|e| AppError::Internal(e.into()))?;
    let storage_path = format!("{shard}/{sha256}");
    tokio::fs::write(storage_dir.join(&sha256), &bytes)
        .await
        .map_err(|e| AppError::Internal(e.into()))?;

    let path = attachment
        .get("path")
        .and_then(Value::as_str)
        .map(normalize_folder_path)
        .filter(|path| !path.is_empty())
        .unwrap_or_else(|| {
            id.rsplit_once('/')
                .map(|(folder, _)| folder)
                .unwrap_or("attachments")
                .to_string()
        });
    ensure_folder(state, &path).await?;
    let filename = attachment
        .get("filename")
        .and_then(Value::as_str)
        .map(clean_file_name)
        .unwrap_or_else(|| clean_file_name(id));
    let mime = attachment
        .get("mime")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|mime| !mime.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| attachment_content_type(&filename, None));
    let created_at = attachment
        .get("created_at")
        .and_then(Value::as_i64)
        .unwrap_or_else(now_millis);

    sqlx::query(
        "INSERT INTO vault_attachments \
         (id, document_id, path, filename, mime, size, sha256, storage_path, created_at) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) \
         ON CONFLICT(id) DO UPDATE SET \
            document_id = excluded.document_id, \
            path = excluded.path, \
            filename = excluded.filename, \
            mime = excluded.mime, \
            size = excluded.size, \
            sha256 = excluded.sha256, \
            storage_path = excluded.storage_path, \
            deleted_at = NULL, \
            trashed_at = NULL, \
            trash_origin_path = NULL",
    )
    .bind(id)
    .bind(attachment.get("document_id").and_then(Value::as_str))
    .bind(&path)
    .bind(&filename)
    .bind(&mime)
    .bind(bytes.len() as i64)
    .bind(&sha256)
    .bind(&storage_path)
    .bind(created_at)
    .execute(&state.db)
    .await?;

    Ok(true)
}

async fn import_vault_payload(state: &AppState, payload: &Value) -> Result<Value, AppError> {
    let mut folder_count = 0usize;
    for folder in payload
        .get("folders")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
    {
        let path = folder
            .get("path")
            .and_then(Value::as_str)
            .or_else(|| {
                folder
                    .get("_id")
                    .and_then(Value::as_str)
                    .and_then(|id| id.strip_prefix(FOLDER_DOC_PREFIX))
            })
            .map(normalize_folder_path)
            .unwrap_or_default();
        if path.is_empty() {
            continue;
        }
        ensure_folder(&state, &path).await?;
        folder_count += 1;
    }

    let mut note_count = 0usize;
    for note in payload
        .get("notes")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
    {
        if import_document(&state, &note).await? {
            note_count += 1;
        }
    }

    let mut attachment_count = 0usize;
    for attachment in payload
        .get("attachments")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
    {
        if import_attachment_from_backup(state, &attachment).await? {
            attachment_count += 1;
        }
    }

    let mut version_count = 0usize;
    for version in payload
        .get("versions")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
    {
        let Some(document_id) = version.get("document_id").and_then(Value::as_str) else {
            continue;
        };
        let Some(id) = version.get("id").and_then(Value::as_str) else {
            continue;
        };
        let version_number = version
            .get("version_number")
            .and_then(Value::as_i64)
            .unwrap_or(1);
        sqlx::query(
            "INSERT INTO vault_versions \
             (id, document_id, version_number, label, content_markdown, content_json, metadata_json, created_at, created_by, reason, checksum) \
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) \
             ON CONFLICT(document_id, version_number) DO UPDATE SET \
                label = excluded.label, \
                content_markdown = excluded.content_markdown, \
                content_json = excluded.content_json, \
                metadata_json = excluded.metadata_json, \
                created_at = excluded.created_at, \
                created_by = excluded.created_by, \
                reason = excluded.reason, \
                checksum = excluded.checksum",
        )
        .bind(id)
        .bind(document_id)
        .bind(version_number)
        .bind(version.get("label").and_then(Value::as_str))
        .bind(version.get("content").and_then(Value::as_str).unwrap_or_default())
        .bind(version.get("content_json").map(Value::to_string))
        .bind(json_text(version.get("metadata"), json!({})))
        .bind(version.get("created_at").and_then(Value::as_i64).unwrap_or_else(now_millis))
        .bind(version.get("created_by").and_then(Value::as_str).unwrap_or("local"))
        .bind(version.get("reason").and_then(Value::as_str).unwrap_or("import"))
        .bind(version.get("checksum").and_then(Value::as_str).unwrap_or_default())
        .execute(&state.db)
        .await?;
        version_count += 1;
    }

    let mut comment_count = 0usize;
    let mut comment_reply_count = 0usize;
    for comment in payload
        .get("comments")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
    {
        let Some(document_id) = comment.get("document_id").and_then(Value::as_str) else {
            continue;
        };
        let id = comment
            .get("id")
            .and_then(Value::as_str)
            .map(str::to_string)
            .unwrap_or_else(random_uuid);
        let now = now_millis();
        sqlx::query(
            "INSERT INTO vault_comments \
             (id, document_id, anchor_json, body, status, created_at, updated_at, resolved_at) \
             VALUES (?, ?, ?, ?, ?, ?, ?, ?) \
             ON CONFLICT(id) DO UPDATE SET \
                anchor_json = excluded.anchor_json, \
                body = excluded.body, \
                status = excluded.status, \
                updated_at = excluded.updated_at, \
                resolved_at = excluded.resolved_at",
        )
        .bind(&id)
        .bind(document_id)
        .bind(json_text(comment.get("anchor"), json!({})))
        .bind(
            comment
                .get("body")
                .and_then(Value::as_str)
                .unwrap_or_default(),
        )
        .bind(
            comment
                .get("status")
                .and_then(Value::as_str)
                .unwrap_or("open"),
        )
        .bind(
            comment
                .get("created_at")
                .and_then(Value::as_i64)
                .unwrap_or(now),
        )
        .bind(
            comment
                .get("updated_at")
                .and_then(Value::as_i64)
                .unwrap_or(now),
        )
        .bind(comment.get("resolved_at").and_then(Value::as_i64))
        .execute(&state.db)
        .await?;
        comment_count += 1;

        for reply in comment
            .get("replies")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default()
        {
            let reply_id = reply
                .get("id")
                .and_then(Value::as_str)
                .map(str::to_string)
                .unwrap_or_else(random_uuid);
            sqlx::query(
                "INSERT INTO vault_comment_replies \
                 (id, comment_id, document_id, body, created_at, updated_at) \
                 VALUES (?, ?, ?, ?, ?, ?) \
                 ON CONFLICT(id) DO UPDATE SET \
                    body = excluded.body, \
                    updated_at = excluded.updated_at",
            )
            .bind(&reply_id)
            .bind(&id)
            .bind(document_id)
            .bind(
                reply
                    .get("body")
                    .and_then(Value::as_str)
                    .unwrap_or_default(),
            )
            .bind(
                reply
                    .get("created_at")
                    .and_then(Value::as_i64)
                    .unwrap_or(now),
            )
            .bind(
                reply
                    .get("updated_at")
                    .and_then(Value::as_i64)
                    .unwrap_or(now),
            )
            .execute(&state.db)
            .await?;
            comment_reply_count += 1;
        }
    }

    let mut suggestion_count = 0usize;
    for suggestion in payload
        .get("suggestions")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
    {
        let Some(document_id) = suggestion.get("document_id").and_then(Value::as_str) else {
            continue;
        };
        let id = suggestion
            .get("id")
            .and_then(Value::as_str)
            .map(str::to_string)
            .unwrap_or_else(random_uuid);
        sqlx::query(
            "INSERT INTO vault_suggestions \
             (id, document_id, anchor_json, patch_json, status, created_at, applied_at) \
             VALUES (?, ?, ?, ?, ?, ?, ?) \
             ON CONFLICT(id) DO UPDATE SET \
                anchor_json = excluded.anchor_json, \
                patch_json = excluded.patch_json, \
                status = excluded.status, \
                applied_at = excluded.applied_at",
        )
        .bind(&id)
        .bind(document_id)
        .bind(json_text(suggestion.get("anchor"), json!({})))
        .bind(json_text(suggestion.get("patch"), json!({})))
        .bind(
            suggestion
                .get("status")
                .and_then(Value::as_str)
                .unwrap_or("open"),
        )
        .bind(
            suggestion
                .get("created_at")
                .and_then(Value::as_i64)
                .unwrap_or_else(now_millis),
        )
        .bind(suggestion.get("applied_at").and_then(Value::as_i64))
        .execute(&state.db)
        .await?;
        suggestion_count += 1;
    }

    let mut audit_count = 0usize;
    for event in payload
        .get("audit_events")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
    {
        let id = event
            .get("id")
            .and_then(Value::as_str)
            .map(str::to_string)
            .unwrap_or_else(random_uuid);
        let action = event
            .get("action")
            .and_then(Value::as_str)
            .unwrap_or("imported_event");
        sqlx::query(
            "INSERT INTO vault_audit_log (id, document_id, action, metadata_json, created_at) \
             VALUES (?, ?, ?, ?, ?) \
             ON CONFLICT(id) DO UPDATE SET \
                document_id = excluded.document_id, \
                action = excluded.action, \
                metadata_json = excluded.metadata_json, \
                created_at = excluded.created_at",
        )
        .bind(&id)
        .bind(event.get("document_id").and_then(Value::as_str))
        .bind(action)
        .bind(json_text(event.get("metadata"), json!({})))
        .bind(
            event
                .get("created_at")
                .and_then(Value::as_i64)
                .unwrap_or_else(now_millis),
        )
        .execute(&state.db)
        .await?;
        audit_count += 1;
    }

    let mut save_queue_count = 0usize;
    for save in payload
        .get("save_queue")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
    {
        let Some(document_id) = save.get("document_id").and_then(Value::as_str) else {
            continue;
        };
        let id = save
            .get("id")
            .and_then(Value::as_str)
            .map(str::to_string)
            .unwrap_or_else(random_uuid);
        sqlx::query(
            "INSERT INTO vault_save_queue (id, document_id, operation, payload_json, created_at, attempts, last_error) \
             VALUES (?, ?, ?, ?, ?, ?, ?) \
             ON CONFLICT(id) DO UPDATE SET \
                document_id = excluded.document_id, \
                operation = excluded.operation, \
                payload_json = excluded.payload_json, \
                attempts = excluded.attempts, \
                last_error = excluded.last_error",
        )
        .bind(&id)
        .bind(document_id)
        .bind(save.get("operation").and_then(Value::as_str).unwrap_or("sync"))
        .bind(json_text(save.get("payload"), json!({})))
        .bind(save.get("created_at").and_then(Value::as_i64).unwrap_or_else(now_millis))
        .bind(save.get("attempts").and_then(Value::as_i64).unwrap_or(0))
        .bind(save.get("last_error").and_then(Value::as_str))
        .execute(&state.db)
        .await?;
        save_queue_count += 1;
    }

    let mut sync_state_count = 0usize;
    for sync in payload
        .get("sync_state")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
    {
        let Some(provider) = sync.get("provider").and_then(Value::as_str) else {
            continue;
        };
        let Some(remote_id) = sync.get("remote_id").and_then(Value::as_str) else {
            continue;
        };
        let Some(local_id) = sync.get("local_id").and_then(Value::as_str) else {
            continue;
        };
        sqlx::query(
            "INSERT INTO vault_sync_state (provider, remote_id, local_id, remote_rev, last_synced_at, conflict_state, conflict_json) \
             VALUES (?, ?, ?, ?, ?, ?, ?) \
             ON CONFLICT(provider, remote_id) DO UPDATE SET \
                local_id = excluded.local_id, \
                remote_rev = excluded.remote_rev, \
                last_synced_at = excluded.last_synced_at, \
                conflict_state = excluded.conflict_state, \
                conflict_json = excluded.conflict_json",
        )
        .bind(provider)
        .bind(remote_id)
        .bind(local_id)
        .bind(sync.get("remote_rev").and_then(Value::as_str))
        .bind(sync.get("last_synced_at").and_then(Value::as_i64))
        .bind(sync.get("conflict_state").and_then(Value::as_str).unwrap_or("clean"))
        .bind(json_text(sync.get("conflict"), json!({})))
        .execute(&state.db)
        .await?;
        sync_state_count += 1;
    }

    write_audit(
        &state,
        None,
        "vault_import",
        json!({
            "notes": note_count,
            "folders": folder_count,
            "attachments": attachment_count,
            "versions": version_count,
            "comments": comment_count,
            "comment_replies": comment_reply_count,
            "suggestions": suggestion_count,
            "audit_events": audit_count,
            "save_queue": save_queue_count,
            "sync_state": sync_state_count,
        }),
    )
    .await?;

    Ok(json!({
        "imported_notes": note_count,
        "imported_folders": folder_count,
        "imported_attachments": attachment_count,
        "imported_versions": version_count,
        "imported_comments": comment_count,
        "imported_comment_replies": comment_reply_count,
        "imported_suggestions": suggestion_count,
        "imported_audit_events": audit_count,
        "imported_save_queue": save_queue_count,
        "imported_sync_state": sync_state_count,
    }))
}

async fn import_vault(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Json(body): Json<ImportVaultBody>,
) -> Result<Json<Value>, AppError> {
    let payload = json!({
        "notes": body.notes.unwrap_or_default(),
        "folders": body.folders.unwrap_or_default(),
    });
    Ok(success_json(import_vault_payload(&state, &payload).await?))
}

async fn collect_vault_export_payload(state: &AppState, full: bool) -> Result<Value, AppError> {
    let note_rows = sqlx::query(
        "SELECT id, path, title, content_markdown, folder_path, tags_json, links_json, \
                aliases_json, properties_json, created_at, updated_at, trashed_at, trash_origin_path \
         FROM vault_documents \
         WHERE deleted_at IS NULL AND (? OR trashed_at IS NULL) \
         ORDER BY path ASC",
    )
    .bind(full)
    .fetch_all(&state.db)
    .await?;
    let notes = note_rows
        .iter()
        .map(|row| {
            let id: String = row.try_get("id")?;
            Ok(json!({
                "id": id,
                "path": row.try_get::<String, _>("path")?,
                "title": row.try_get::<String, _>("title")?,
                "content": row.try_get::<String, _>("content_markdown")?,
                "folder": row.try_get::<String, _>("folder_path")?,
                "tags": parse_json(row.try_get("tags_json")?, json!([])),
                "links": parse_json(row.try_get("links_json")?, json!([])),
                "aliases": parse_json(row.try_get("aliases_json")?, json!([])),
                "properties": parse_json(row.try_get("properties_json")?, json!({})),
                "created_at": row.try_get::<i64, _>("created_at")?,
                "updated_at": row.try_get::<i64, _>("updated_at")?,
                "trashed_at": row.try_get::<Option<i64>, _>("trashed_at")?,
                "trash_origin_path": row.try_get::<Option<String>, _>("trash_origin_path")?,
            }))
        })
        .collect::<Result<Vec<_>, sqlx::Error>>()?;

    let folder_rows = sqlx::query(
        "SELECT path, name, parent_path, created_at, updated_at, trashed_at, trash_origin_path \
         FROM vault_folders \
         WHERE deleted_at IS NULL AND (? OR trashed_at IS NULL) \
         ORDER BY path ASC",
    )
    .bind(full)
    .fetch_all(&state.db)
    .await?;
    let folders = folder_rows
        .iter()
        .map(|row| {
            Ok(json!({
                "path": row.try_get::<String, _>("path")?,
                "name": row.try_get::<String, _>("name")?,
                "parent_path": row.try_get::<String, _>("parent_path")?,
                "created_at": row.try_get::<i64, _>("created_at")?,
                "updated_at": row.try_get::<i64, _>("updated_at")?,
                "trashed_at": row.try_get::<Option<i64>, _>("trashed_at")?,
                "trash_origin_path": row.try_get::<Option<String>, _>("trash_origin_path")?,
            }))
        })
        .collect::<Result<Vec<_>, sqlx::Error>>()?;

    let attachment_rows = sqlx::query(
        "SELECT id, document_id, path, filename, mime, size, sha256, storage_path, created_at, trashed_at, trash_origin_path \
         FROM vault_attachments \
         WHERE deleted_at IS NULL AND (? OR trashed_at IS NULL) \
         ORDER BY path ASC, filename ASC",
    )
    .bind(full)
    .fetch_all(&state.db)
    .await?;
    let attachments = attachment_rows
        .iter()
        .map(|row| {
            let storage_path = row.try_get::<String, _>("storage_path")?;
            let data_base64 = if full {
                let full_path = attachment_root().join(&storage_path);
                let bytes = std::fs::read(&full_path).map_err(|err| {
                    AppError::Internal(anyhow::anyhow!(
                        "Attachment bytes missing for export at {}: {err}",
                        full_path.display()
                    ))
                })?;
                Some(BASE64.encode(bytes))
            } else {
                None
            };
            Ok::<Value, AppError>(json!({
                "id": row.try_get::<String, _>("id")?,
                "document_id": row.try_get::<Option<String>, _>("document_id")?,
                "path": row.try_get::<String, _>("path")?,
                "filename": row.try_get::<String, _>("filename")?,
                "mime": row.try_get::<String, _>("mime")?,
                "size": row.try_get::<i64, _>("size")?,
                "sha256": row.try_get::<String, _>("sha256")?,
                "storage_path": storage_path,
                "data_base64": data_base64,
                "created_at": row.try_get::<i64, _>("created_at")?,
                "trashed_at": row.try_get::<Option<i64>, _>("trashed_at")?,
                "trash_origin_path": row.try_get::<Option<String>, _>("trash_origin_path")?,
            }))
        })
        .collect::<Result<Vec<_>, AppError>>()?;

    let version_rows = sqlx::query(
        "SELECT id, document_id, version_number, label, content_markdown, content_json, \
                metadata_json, created_at, created_by, reason, checksum \
         FROM vault_versions \
         ORDER BY document_id ASC, version_number ASC",
    )
    .fetch_all(&state.db)
    .await?;
    let versions = version_rows
        .iter()
        .map(|row| {
            Ok(json!({
                "id": row.try_get::<String, _>("id")?,
                "document_id": row.try_get::<String, _>("document_id")?,
                "version_number": row.try_get::<i64, _>("version_number")?,
                "label": row.try_get::<Option<String>, _>("label")?,
                "content": row.try_get::<String, _>("content_markdown")?,
                "content_json": row.try_get::<Option<String>, _>("content_json")?,
                "metadata": parse_json(row.try_get("metadata_json")?, json!({})),
                "created_at": row.try_get::<i64, _>("created_at")?,
                "created_by": row.try_get::<String, _>("created_by")?,
                "reason": row.try_get::<String, _>("reason")?,
                "checksum": row.try_get::<String, _>("checksum")?,
            }))
        })
        .collect::<Result<Vec<_>, sqlx::Error>>()?;

    let comment_rows = sqlx::query(
        "SELECT id, document_id, anchor_json, body, status, created_at, updated_at, resolved_at \
         FROM vault_comments \
         ORDER BY document_id ASC, created_at ASC",
    )
    .fetch_all(&state.db)
    .await?;
    let mut comments = comment_rows
        .iter()
        .map(row_to_comment)
        .collect::<Result<Vec<_>, _>>()?;
    let reply_rows = sqlx::query(
        "SELECT id, comment_id, document_id, body, created_at, updated_at \
         FROM vault_comment_replies \
         ORDER BY document_id ASC, comment_id ASC, created_at ASC",
    )
    .fetch_all(&state.db)
    .await?;
    for comment in &mut comments {
        let Some(comment_id) = comment.get("id").and_then(Value::as_str).map(str::to_owned) else {
            continue;
        };
        let replies = reply_rows
            .iter()
            .filter(|row| {
                row.try_get::<String, _>("comment_id").ok().as_deref() == Some(comment_id.as_str())
            })
            .map(row_to_comment_reply)
            .collect::<Result<Vec<_>, _>>()?;
        if let Some(obj) = comment.as_object_mut() {
            obj.insert("replies".to_string(), json!(replies));
        }
    }

    let suggestion_rows = sqlx::query(
        "SELECT id, document_id, anchor_json, patch_json, status, created_at, applied_at \
         FROM vault_suggestions \
         ORDER BY document_id ASC, created_at ASC",
    )
    .fetch_all(&state.db)
    .await?;
    let suggestions = suggestion_rows
        .iter()
        .map(row_to_suggestion)
        .collect::<Result<Vec<_>, _>>()?;
    let audit_rows = sqlx::query(
        "SELECT id, document_id, action, metadata_json, created_at \
         FROM vault_audit_log \
         ORDER BY created_at ASC",
    )
    .fetch_all(&state.db)
    .await?;
    let audit_events = audit_rows
        .iter()
        .map(|row| {
            let metadata: String = row.try_get("metadata_json")?;
            Ok::<Value, AppError>(json!({
                "id": row.try_get::<String, _>("id")?,
                "document_id": row.try_get::<Option<String>, _>("document_id")?,
                "action": row.try_get::<String, _>("action")?,
                "metadata": serde_json::from_str::<Value>(&metadata).unwrap_or_else(|_| json!({})),
                "created_at": row.try_get::<i64, _>("created_at")?,
            }))
        })
        .collect::<Result<Vec<_>, _>>()?;
    let save_rows = sqlx::query(
        "SELECT id, document_id, operation, payload_json, created_at, attempts, last_error \
         FROM vault_save_queue \
         ORDER BY created_at ASC",
    )
    .fetch_all(&state.db)
    .await?;
    let save_queue = save_rows
        .iter()
        .map(|row| {
            let payload: String = row.try_get("payload_json")?;
            Ok::<Value, AppError>(json!({
                "id": row.try_get::<String, _>("id")?,
                "document_id": row.try_get::<String, _>("document_id")?,
                "operation": row.try_get::<String, _>("operation")?,
                "payload": serde_json::from_str::<Value>(&payload).unwrap_or_else(|_| json!({})),
                "created_at": row.try_get::<i64, _>("created_at")?,
                "attempts": row.try_get::<i64, _>("attempts")?,
                "last_error": row.try_get::<Option<String>, _>("last_error")?,
            }))
        })
        .collect::<Result<Vec<_>, _>>()?;
    let sync_rows = sqlx::query(
        "SELECT provider, remote_id, local_id, remote_rev, last_synced_at, conflict_state, conflict_json \
         FROM vault_sync_state \
         ORDER BY provider ASC, remote_id ASC",
    )
    .fetch_all(&state.db)
    .await?;
    let sync_state = sync_rows
        .iter()
        .map(|row| {
            let conflict: String = row.try_get("conflict_json")?;
            Ok::<Value, AppError>(json!({
                "provider": row.try_get::<String, _>("provider")?,
                "remote_id": row.try_get::<String, _>("remote_id")?,
                "local_id": row.try_get::<String, _>("local_id")?,
                "remote_rev": row.try_get::<Option<String>, _>("remote_rev")?,
                "last_synced_at": row.try_get::<Option<i64>, _>("last_synced_at")?,
                "conflict_state": row.try_get::<String, _>("conflict_state")?,
                "conflict": serde_json::from_str::<Value>(&conflict).unwrap_or_else(|_| json!({})),
            }))
        })
        .collect::<Result<Vec<_>, _>>()?;

    Ok(json!({
        "format": "clawcontrol-local-vault",
        "version": 1,
        "exported_at": chrono::Utc::now().to_rfc3339(),
        "scope": if full { "full" } else { "live" },
        "notes": notes,
        "folders": folders,
        "attachments": attachments,
        "versions": versions,
        "comments": comments,
        "suggestions": suggestions,
        "audit_events": audit_events,
        "save_queue": save_queue,
        "sync_state": sync_state,
    }))
}

fn clean_tar_path(path: &str) -> String {
    path.split('/')
        .map(str::trim)
        .filter(|part| !part.is_empty() && *part != "." && *part != "..")
        .map(|part| {
            part.chars()
                .filter(|ch| !matches!(ch, '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' | '\0'))
                .collect::<String>()
        })
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("/")
}

fn split_tar_name(path: &str) -> Result<(String, String), AppError> {
    let path = clean_tar_path(path);
    if path.is_empty() {
        return Err(AppError::BadRequest("Export path is empty".into()));
    }
    if path.as_bytes().len() <= 100 {
        return Ok((String::new(), path));
    }
    for (index, ch) in path.char_indices().rev() {
        if ch != '/' {
            continue;
        }
        let prefix = &path[..index];
        let name = &path[index + 1..];
        if !prefix.is_empty()
            && !name.is_empty()
            && prefix.as_bytes().len() <= 155
            && name.as_bytes().len() <= 100
        {
            return Ok((prefix.to_string(), name.to_string()));
        }
    }
    Err(AppError::BadRequest(format!(
        "Export path too long: {path}"
    )))
}

fn write_octal_field(header: &mut [u8], start: usize, len: usize, value: u64) {
    let width = len.saturating_sub(1);
    let text = format!("{value:0width$o}");
    let bytes = text.as_bytes();
    let offset = width.saturating_sub(bytes.len());
    for (index, byte) in bytes.iter().enumerate().take(width) {
        header[start + offset + index] = *byte;
    }
    header[start + len - 1] = 0;
}

fn append_tar_file(
    out: &mut Vec<u8>,
    path: &str,
    bytes: &[u8],
    mtime: i64,
) -> Result<(), AppError> {
    let (prefix, name) = split_tar_name(path)?;
    let mut header_block = [0u8; 512];
    header_block[..name.as_bytes().len()].copy_from_slice(name.as_bytes());
    write_octal_field(&mut header_block, 100, 8, 0o644);
    write_octal_field(&mut header_block, 108, 8, 0);
    write_octal_field(&mut header_block, 116, 8, 0);
    write_octal_field(&mut header_block, 124, 12, bytes.len() as u64);
    write_octal_field(&mut header_block, 136, 12, mtime.max(0) as u64);
    for byte in &mut header_block[148..156] {
        *byte = b' ';
    }
    header_block[156] = b'0';
    header_block[257..263].copy_from_slice(b"ustar\0");
    header_block[263..265].copy_from_slice(b"00");
    if !prefix.is_empty() {
        header_block[345..345 + prefix.as_bytes().len()].copy_from_slice(prefix.as_bytes());
    }
    let checksum: u64 = header_block.iter().map(|byte| u64::from(*byte)).sum();
    let checksum_text = format!("{checksum:06o}\0 ");
    header_block[148..156].copy_from_slice(checksum_text.as_bytes());
    out.extend_from_slice(&header_block);
    out.extend_from_slice(bytes);
    let padding = (512 - (bytes.len() % 512)) % 512;
    out.extend(std::iter::repeat(0).take(padding));
    Ok(())
}

fn build_markdown_archive_manifest(payload: &Value, created_at: String) -> Value {
    let notes = payload
        .get("notes")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let attachments = payload
        .get("attachments")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let comments = payload
        .get("comments")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let suggestions = payload
        .get("suggestions")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    let mut tag_counts = BTreeMap::<String, usize>::new();
    let mut property_keys = BTreeSet::<String>::new();
    let mut link_edges = Vec::<Value>::new();
    let mut backlinks = BTreeMap::<String, Vec<String>>::new();
    let mut review_counts = BTreeMap::<String, (usize, usize)>::new();

    for comment in &comments {
        if let Some(id) = comment.get("document_id").and_then(Value::as_str) {
            review_counts.entry(id.to_string()).or_default().0 += 1;
        }
    }
    for suggestion in &suggestions {
        if let Some(id) = suggestion.get("document_id").and_then(Value::as_str) {
            review_counts.entry(id.to_string()).or_default().1 += 1;
        }
    }

    let documents = notes
        .iter()
        .map(|note| {
            let id = note
                .get("id")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string();
            for tag in note
                .get("tags")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default()
                .iter()
                .filter_map(Value::as_str)
            {
                *tag_counts.entry(tag.to_string()).or_default() += 1;
            }
            if let Some(properties) = note.get("properties").and_then(Value::as_object) {
                for key in properties.keys() {
                    property_keys.insert(key.to_string());
                }
            }
            for target in note
                .get("links")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default()
                .iter()
                .filter_map(Value::as_str)
            {
                link_edges.push(json!({ "source": id, "target": target }));
                backlinks
                    .entry(target.to_string())
                    .or_default()
                    .push(id.clone());
            }
            let (comments, suggestions) = review_counts.get(&id).copied().unwrap_or_default();
            json!({
                "id": id,
                "path": note.get("path").cloned().unwrap_or_else(|| json!(null)),
                "title": note.get("title").cloned().unwrap_or_else(|| json!("Untitled")),
                "folder": note.get("folder").cloned().unwrap_or_else(|| json!("")),
                "tags": note.get("tags").cloned().unwrap_or_else(|| json!([])),
                "aliases": note.get("aliases").cloned().unwrap_or_else(|| json!([])),
                "properties": note.get("properties").cloned().unwrap_or_else(|| json!({})),
                "links": note.get("links").cloned().unwrap_or_else(|| json!([])),
                "updated_at": note.get("updated_at").cloned().unwrap_or_else(|| json!(null)),
                "trashed_at": note.get("trashed_at").cloned().unwrap_or_else(|| json!(null)),
                "review": {
                    "comments": comments,
                    "suggestions": suggestions,
                },
            })
        })
        .collect::<Vec<_>>();

    let attachment_index = attachments
        .iter()
        .map(|attachment| {
            json!({
                "id": attachment.get("id").cloned().unwrap_or_else(|| json!("")),
                "document_id": attachment.get("document_id").cloned().unwrap_or_else(|| json!(null)),
                "path": attachment.get("path").cloned().unwrap_or_else(|| json!("")),
                "filename": attachment.get("filename").cloned().unwrap_or_else(|| json!("")),
                "mime": attachment.get("mime").cloned().unwrap_or_else(|| json!("application/octet-stream")),
                "size": attachment.get("size").cloned().unwrap_or_else(|| json!(0)),
                "sha256": attachment.get("sha256").cloned().unwrap_or_else(|| json!(null)),
                "trashed_at": attachment.get("trashed_at").cloned().unwrap_or_else(|| json!(null)),
            })
        })
        .collect::<Vec<_>>();

    json!({
        "format": "clawcontrol-markdown-vault-tar",
        "version": 1,
        "created_at": created_at,
        "notes": notes.len(),
        "attachments": attachments.len(),
        "plugin_metadata": {
            "schema": "clawcontrol-vault-plugin-index",
            "version": 1,
            "documents": documents,
            "attachments": attachment_index,
            "tags": tag_counts,
            "property_keys": property_keys.into_iter().collect::<Vec<_>>(),
            "links": link_edges,
            "backlinks": backlinks,
            "review": {
                "comments": comments.len(),
                "suggestions": suggestions.len(),
            },
        },
    })
}

async fn export_vault_markdown_archive(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Result<Response, AppError> {
    let payload = collect_vault_export_payload(&state, true).await?;
    let now = chrono::Utc::now().timestamp();
    let mut archive = Vec::new();
    let manifest = build_markdown_archive_manifest(&payload, chrono::Utc::now().to_rfc3339());
    append_tar_file(
        &mut archive,
        "vault-manifest.json",
        serde_json::to_string_pretty(&manifest)
            .map_err(|e| AppError::Internal(e.into()))?
            .as_bytes(),
        now,
    )?;

    for note in payload
        .get("notes")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
    {
        let path = note
            .get("id")
            .and_then(Value::as_str)
            .or_else(|| note.get("path").and_then(Value::as_str))
            .unwrap_or("Untitled.md");
        let path = if path.ends_with(".md") {
            path.to_string()
        } else {
            format!("{path}.md")
        };
        let content = note
            .get("content")
            .and_then(Value::as_str)
            .unwrap_or_default();
        append_tar_file(&mut archive, &path, content.as_bytes(), now)?;
    }

    for attachment in payload
        .get("attachments")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
    {
        let Some(data) = attachment.get("data_base64").and_then(Value::as_str) else {
            continue;
        };
        let bytes = BASE64.decode(data.as_bytes()).map_err(|_| {
            AppError::Internal(anyhow::anyhow!("Attachment export data was invalid base64"))
        })?;
        let path = attachment
            .get("id")
            .and_then(Value::as_str)
            .or_else(|| attachment.get("filename").and_then(Value::as_str))
            .unwrap_or("attachments/file");
        append_tar_file(&mut archive, path, &bytes, now)?;
    }
    archive.extend_from_slice(&[0u8; 1024]);

    Response::builder()
        .header(header::CONTENT_TYPE, "application/x-tar")
        .header(
            header::CONTENT_DISPOSITION,
            "attachment; filename=\"clawcontrol-vault-markdown.tar\"",
        )
        .body(Body::from(archive))
        .map_err(|e| AppError::Internal(e.into()))
}

async fn export_vault(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    Ok(success_json(
        collect_vault_export_payload(&state, false).await?,
    ))
}

fn backup_password(password: &str) -> Result<&str, AppError> {
    let password = password.trim();
    if password.len() < 8 {
        return Err(AppError::BadRequest(
            "Backup password must be at least 8 characters".into(),
        ));
    }
    Ok(password)
}

fn random_salt_b64() -> String {
    let mut salt = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut salt);
    BASE64.encode(salt)
}

fn encrypt_backup_payload(payload: &Value, password: &str) -> Result<Value, AppError> {
    let password = backup_password(password)?;
    let salt = random_salt_b64();
    let key = crate::crypto::derive_key(password, &salt);
    let plaintext = serde_json::to_vec(payload).map_err(|e| AppError::Internal(e.into()))?;
    let (ciphertext, nonce) =
        crate::crypto::encrypt(&plaintext, &key).map_err(|e| AppError::Internal(e.into()))?;
    Ok(json!({
        "format": "clawcontrol-encrypted-vault-backup",
        "version": 1,
        "created_at": chrono::Utc::now().to_rfc3339(),
        "encryption": {
            "algorithm": "AES-256-GCM",
            "kdf": "Argon2id",
            "salt": salt,
            "nonce": nonce,
        },
        "ciphertext": ciphertext,
    }))
}

fn decrypt_backup_payload(backup: &Value, password: &str) -> Result<Value, AppError> {
    let password = backup_password(password)?;
    if backup.get("format").and_then(Value::as_str) != Some("clawcontrol-encrypted-vault-backup") {
        return Err(AppError::BadRequest(
            "Unsupported vault backup format".into(),
        ));
    }
    let encryption = backup
        .get("encryption")
        .and_then(Value::as_object)
        .ok_or_else(|| AppError::BadRequest("Backup encryption metadata missing".into()))?;
    let salt = encryption
        .get("salt")
        .and_then(Value::as_str)
        .ok_or_else(|| AppError::BadRequest("Backup salt missing".into()))?;
    let nonce = encryption
        .get("nonce")
        .and_then(Value::as_str)
        .ok_or_else(|| AppError::BadRequest("Backup nonce missing".into()))?;
    let ciphertext = backup
        .get("ciphertext")
        .and_then(Value::as_str)
        .ok_or_else(|| AppError::BadRequest("Backup ciphertext missing".into()))?;
    let key = crate::crypto::derive_key(password, salt);
    let plaintext = crate::crypto::decrypt(ciphertext, nonce, &key).map_err(|_| {
        AppError::BadRequest("Backup password is wrong or backup is corrupted".into())
    })?;
    serde_json::from_slice(&plaintext)
        .map_err(|_| AppError::BadRequest("Backup plaintext is not valid vault JSON".into()))
}

async fn export_vault_encrypted(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Json(body): Json<EncryptedExportBody>,
) -> Result<Json<Value>, AppError> {
    let payload = collect_vault_export_payload(&state, true).await?;
    let backup = encrypt_backup_payload(&payload, &body.password)?;
    write_audit(
        &state,
        None,
        "vault_export_encrypted",
        json!({ "scope": "full" }),
    )
    .await?;
    Ok(success_json(json!({ "backup": backup })))
}

async fn import_vault_encrypted(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Json(body): Json<EncryptedImportBody>,
) -> Result<Json<Value>, AppError> {
    let payload = decrypt_backup_payload(&body.backup, &body.password)?;
    let stats = import_vault_payload(&state, &payload).await?;
    write_audit(
        &state,
        None,
        "vault_import_encrypted",
        json!({ "format": "clawcontrol-encrypted-vault-backup" }),
    )
    .await?;
    Ok(success_json(stats))
}

async fn media_response(state: &AppState, id: &str) -> Result<Response, AppError> {
    if id.contains("..") || id.starts_with('_') || id.contains('\0') {
        return Err(AppError::BadRequest("Invalid attachment ID".into()));
    }
    let row = sqlx::query(
        "SELECT mime, storage_path FROM vault_attachments WHERE id = ? AND deleted_at IS NULL",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Attachment not found".into()))?;
    let mime: String = row.try_get("mime")?;
    let storage_path: String = row.try_get("storage_path")?;
    let full_path = attachment_root().join(storage_path);
    let bytes = tokio::fs::read(full_path)
        .await
        .map_err(|_| AppError::NotFound("Attachment file not found".into()))?;

    Response::builder()
        .header(
            header::CONTENT_TYPE,
            attachment_content_type(id, Some(&mime)),
        )
        .header(header::CACHE_CONTROL, "private, max-age=3600")
        .body(Body::from(bytes))
        .map_err(|e| AppError::Internal(e.into()))
}

async fn get_media_by_query(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Query(q): Query<DocQuery>,
) -> Result<Response, AppError> {
    media_response(&state, &q.id).await
}

async fn get_media_by_path(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Path(id): Path<String>,
) -> Result<Response, AppError> {
    media_response(&state, &id).await
}

async fn put_folder(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Query(q): Query<FolderQuery>,
) -> Result<Json<Value>, AppError> {
    let path = normalize_folder_path(&q.path);
    if path.is_empty() {
        return Err(AppError::BadRequest("Folder path required".into()));
    }
    ensure_folder(&state, &path).await?;
    write_audit(&state, None, "folder_upsert", json!({ "path": path })).await?;

    let row = sqlx::query(
        "SELECT path, name, created_at, updated_at, trashed_at, trash_origin_path \
             FROM vault_folders WHERE path = ?",
    )
    .bind(&path)
    .fetch_one(&state.db)
    .await?;

    Ok(success_json(json!({ "folder": row_to_folder(&row)? })))
}

async fn get_folder(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Query(q): Query<FolderQuery>,
) -> Result<Json<Value>, AppError> {
    let path = normalize_folder_path(&q.path);
    if path.is_empty() {
        return Err(AppError::BadRequest("Folder path required".into()));
    }

    let row = sqlx::query(
        "SELECT path, name, created_at, updated_at, trashed_at, trash_origin_path \
         FROM vault_folders \
         WHERE path = ? AND deleted_at IS NULL",
    )
    .bind(&path)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Folder not found".into()))?;

    Ok(success_json(json!({ "folder": row_to_folder(&row)? })))
}

async fn delete_folder(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Query(q): Query<FolderQuery>,
) -> Result<Json<Value>, AppError> {
    let requested = normalize_folder_path(&q.path);
    let path = stored_folder_path(&requested);
    if path.is_empty() {
        return Err(AppError::BadRequest("Folder path required".into()));
    }
    let trash_view = requested.starts_with("Trash/");
    let doc_rows = if trash_view {
        sqlx::query(
            "SELECT id FROM vault_documents \
             WHERE deleted_at IS NULL AND trashed_at IS NOT NULL AND (folder_path = ? OR folder_path LIKE ?)",
        )
        .bind(&path)
        .bind(folder_like(&path))
        .fetch_all(&state.db)
        .await?
    } else {
        Vec::new()
    };
    let doc_ids = doc_rows
        .iter()
        .map(|row| row.try_get::<String, _>("id"))
        .collect::<Result<Vec<_>, _>>()?;
    for id in &doc_ids {
        create_version(&state, id, "folder_delete").await?;
    }

    let now = now_millis();
    let folder_result = if trash_view {
        sqlx::query(
            "UPDATE vault_folders \
             SET deleted_at = ?, updated_at = ? \
             WHERE deleted_at IS NULL AND trashed_at IS NOT NULL AND (path = ? OR path LIKE ?)",
        )
        .bind(now)
        .bind(now)
        .bind(&path)
        .bind(folder_like(&path))
        .execute(&state.db)
        .await?
    } else {
        sqlx::query(
            "UPDATE vault_folders SET deleted_at = ?, updated_at = ? WHERE path = ? OR path LIKE ?",
        )
        .bind(now)
        .bind(now)
        .bind(&path)
        .bind(folder_like(&path))
        .execute(&state.db)
        .await?
    };

    if trash_view {
        sqlx::query(
            "UPDATE vault_documents \
             SET deleted_at = ?, updated_at = ? \
             WHERE deleted_at IS NULL AND trashed_at IS NOT NULL AND (folder_path = ? OR folder_path LIKE ?)",
        )
        .bind(now)
        .bind(now)
        .bind(&path)
        .bind(folder_like(&path))
        .execute(&state.db)
        .await?;
        for id in &doc_ids {
            sqlx::query("DELETE FROM vault_documents_fts WHERE id = ?")
                .bind(id)
                .execute(&state.db)
                .await?;
        }
    }
    let attachment_deleted = if trash_view {
        sqlx::query(
            "UPDATE vault_attachments \
             SET deleted_at = ? \
             WHERE deleted_at IS NULL AND trashed_at IS NOT NULL AND (path = ? OR path LIKE ?)",
        )
        .bind(now)
        .bind(&path)
        .bind(folder_like(&path))
        .execute(&state.db)
        .await?
        .rows_affected()
    } else {
        0
    };

    write_audit(
        &state,
        None,
        "folder_delete",
        json!({
            "path": path,
            "trash_view": trash_view,
            "folders": folder_result.rows_affected(),
            "documents": doc_ids.len(),
            "attachments": attachment_deleted,
        }),
    )
    .await?;
    Ok(success_json(json!({
        "ok": true,
        "folders": folder_result.rows_affected(),
        "documents": doc_ids.len(),
        "attachments": attachment_deleted,
    })))
}

async fn list_revisions(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Query(q): Query<RevisionQuery>,
) -> Result<Json<Value>, AppError> {
    let rows = sqlx::query(
        "SELECT id, version_number, label, created_at, created_by, reason, checksum FROM vault_versions \
         WHERE document_id = ? \
         ORDER BY version_number DESC",
    )
    .bind(&q.id)
    .fetch_all(&state.db)
    .await?;

    let revisions = rows
        .iter()
        .map(|row| {
            let version: i64 = row.try_get("version_number")?;
            let id: String = row.try_get("id")?;
            Ok(json!({
                "rev": id,
                "status": "available",
                "version_number": version,
                "label": row.try_get::<Option<String>, _>("label")?,
                "created_at": row.try_get::<i64, _>("created_at")?,
                "created_by": row.try_get::<String, _>("created_by")?,
                "reason": row.try_get::<String, _>("reason")?,
                "checksum": row.try_get::<String, _>("checksum")?,
            }))
        })
        .collect::<Result<Vec<_>, sqlx::Error>>()?;

    Ok(success_json(json!({ "id": q.id, "revisions": revisions })))
}

async fn get_revision_detail(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Query(q): Query<RevisionDetailQuery>,
) -> Result<Json<Value>, AppError> {
    let row = sqlx::query(
        "SELECT id, document_id, version_number, label, content_markdown, content_json, \
                metadata_json, created_at, created_by, reason, checksum \
         FROM vault_versions \
         WHERE document_id = ? AND id = ?",
    )
    .bind(&q.id)
    .bind(&q.rev)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Revision not found".into()))?;

    Ok(success_json(json!({
        "revision": {
            "rev": row.try_get::<String, _>("id")?,
            "document_id": row.try_get::<String, _>("document_id")?,
            "version_number": row.try_get::<i64, _>("version_number")?,
            "label": row.try_get::<Option<String>, _>("label")?,
            "content": row.try_get::<String, _>("content_markdown")?,
            "content_json": row.try_get::<Option<String>, _>("content_json")?,
            "metadata": parse_json(row.try_get("metadata_json")?, json!({})),
            "created_at": row.try_get::<i64, _>("created_at")?,
            "created_by": row.try_get::<String, _>("created_by")?,
            "reason": row.try_get::<String, _>("reason")?,
            "checksum": row.try_get::<String, _>("checksum")?,
            "status": "available",
        }
    })))
}

async fn create_version_checkpoint(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Json(body): Json<VersionCheckpointBody>,
) -> Result<Json<Value>, AppError> {
    let label = body
        .label
        .as_deref()
        .map(str::trim)
        .filter(|text| !text.is_empty());
    let rev = create_version_with_label(&state, &body.id, "checkpoint", label)
        .await?
        .ok_or_else(|| AppError::NotFound("Document not found".into()))?;
    write_audit(
        &state,
        Some(&body.id),
        "version_checkpoint",
        json!({ "rev": rev, "label": label }),
    )
    .await?;
    Ok(success_json(json!({ "id": body.id, "rev": rev })))
}

async fn update_revision_label(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Json(body): Json<VersionLabelBody>,
) -> Result<Json<Value>, AppError> {
    let label = body
        .label
        .as_deref()
        .map(str::trim)
        .filter(|text| !text.is_empty());
    let result =
        sqlx::query("UPDATE vault_versions SET label = ? WHERE document_id = ? AND id = ?")
            .bind(label)
            .bind(&body.id)
            .bind(&body.rev)
            .execute(&state.db)
            .await?;
    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Revision not found".into()));
    }
    write_audit(
        &state,
        Some(&body.id),
        "version_label",
        json!({ "rev": body.rev, "label": label }),
    )
    .await?;
    Ok(success_json(
        json!({ "id": body.id, "rev": body.rev, "label": label }),
    ))
}

async fn restore_revision(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Json(body): Json<RestoreRevisionBody>,
) -> Result<Json<Value>, AppError> {
    create_version(&state, &body.id, "pre_restore").await?;
    let row = sqlx::query(
        "SELECT content_markdown, content_json, metadata_json, checksum \
         FROM vault_versions \
         WHERE document_id = ? AND id = ?",
    )
    .bind(&body.id)
    .bind(&body.rev)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Revision not found".into()))?;

    let metadata = parse_json(row.try_get("metadata_json")?, json!({}));
    let now = now_millis();
    sqlx::query(
        "UPDATE vault_documents SET \
            title = ?, content_markdown = ?, content_json = ?, folder_path = ?, tags_json = ?, links_json = ?, \
            aliases_json = ?, properties_json = ?, checksum = ?, updated_at = ?, deleted_at = NULL \
         WHERE id = ?",
    )
    .bind(metadata.get("title").and_then(Value::as_str).unwrap_or("Untitled"))
    .bind(row.try_get::<String, _>("content_markdown")?)
    .bind(row.try_get::<Option<String>, _>("content_json")?)
    .bind(metadata.get("folder").and_then(Value::as_str).unwrap_or(""))
    .bind(json_text(metadata.get("tags"), json!([])))
    .bind(json_text(metadata.get("links"), json!([])))
    .bind(json_text(metadata.get("aliases"), json!([])))
    .bind(json_text(metadata.get("properties"), json!({})))
    .bind(row.try_get::<String, _>("checksum")?)
    .bind(now)
    .bind(&body.id)
    .execute(&state.db)
    .await?;

    update_search_index(&state, &body.id).await?;
    create_version(&state, &body.id, "restore").await?;
    write_audit(
        &state,
        Some(&body.id),
        "restore_version",
        json!({ "rev": body.rev }),
    )
    .await?;
    Ok(success_json(
        json!({ "id": body.id, "rev": format!("local-{now}") }),
    ))
}

async fn get_document_path(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Path(id): Path<String>,
) -> Result<Json<Value>, AppError> {
    get_document(State(state), RequireAuth(session), Query(DocQuery { id })).await
}

async fn put_document_path(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Path(id): Path<String>,
    body: Json<Value>,
) -> Result<Json<Value>, AppError> {
    put_document(
        State(state),
        RequireAuth(session),
        Query(DocQuery { id }),
        body,
    )
    .await
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/vault/local/documents", get(list_documents))
        .route(
            "/vault/local/documents/{id}",
            get(get_document_path).put(put_document_path),
        )
        .route(
            "/vault/local/doc",
            get(get_document).put(put_document).delete(delete_document),
        )
        .route("/vault/local/trash", axum::routing::post(trash_document))
        .route(
            "/vault/local/trash/restore",
            axum::routing::post(restore_trashed_document),
        )
        .route(
            "/vault/local/folder/trash",
            axum::routing::post(trash_folder),
        )
        .route(
            "/vault/local/folder/trash/restore",
            axum::routing::post(restore_trashed_folder),
        )
        .route("/vault/local/trash/empty", axum::routing::post(empty_trash))
        .route("/vault/local/status", get(vault_status))
        .route("/vault/local/audit", get(list_audit_events))
        .route("/vault/local/sync-ledger", get(list_sync_ledger))
        .route(
            "/vault/local/sync-ledger/resolve",
            axum::routing::post(resolve_sync_conflict),
        )
        .route(
            "/vault/local/collaboration/events",
            get(list_collaboration_events).post(create_collaboration_event),
        )
        .route(
            "/vault/local/collaboration/crdt-state",
            get(get_collaboration_crdt_state).put(put_collaboration_crdt_state),
        )
        .route(
            "/vault/local/collaboration/health",
            get(collaboration_health),
        )
        .route(
            "/vault/local/collaboration/pairings",
            get(list_collaboration_pairings).post(approve_collaboration_pairing),
        )
        .route(
            "/vault/local/collaboration/pairings/revoke",
            axum::routing::post(revoke_collaboration_pairing),
        )
        .route(
            "/vault/local/attachment",
            axum::routing::post(post_attachment).delete(delete_attachment),
        )
        .route(
            "/vault/local/attachment/trash",
            axum::routing::post(trash_attachment),
        )
        .route(
            "/vault/local/attachment/trash/restore",
            axum::routing::post(restore_trashed_attachment),
        )
        .route("/vault/local/import", axum::routing::post(import_vault))
        .route("/vault/local/export", get(export_vault))
        .route(
            "/vault/local/export/markdown",
            get(export_vault_markdown_archive),
        )
        .route(
            "/vault/local/export/encrypted",
            axum::routing::post(export_vault_encrypted),
        )
        .route(
            "/vault/local/import/encrypted",
            axum::routing::post(import_vault_encrypted),
        )
        .route("/vault/local/search", get(search_documents))
        .route(
            "/vault/local/comments",
            get(list_comments).post(create_comment),
        )
        .route(
            "/vault/local/comments/{id}/resolve",
            axum::routing::post(resolve_comment),
        )
        .route(
            "/vault/local/comments/{id}/replies",
            axum::routing::post(create_comment_reply),
        )
        .route(
            "/vault/local/suggestions",
            get(list_suggestions).post(create_suggestion),
        )
        .route(
            "/vault/local/suggestions/{id}/apply",
            axum::routing::post(apply_suggestion),
        )
        .route(
            "/vault/local/suggestions/{id}/reject",
            axum::routing::post(reject_suggestion),
        )
        .route("/vault/local/media", get(get_media_by_query))
        .route("/vault/local/media/{id}", get(get_media_by_path))
        .route("/vault/local/folders", get(list_folders))
        .route(
            "/vault/local/folder",
            get(get_folder).put(put_folder).delete(delete_folder),
        )
        .route("/vault/local/revisions", get(list_revisions))
        .route("/vault/local/revision", get(get_revision_detail))
        .route(
            "/vault/local/revisions/checkpoint",
            axum::routing::post(create_version_checkpoint),
        )
        .route(
            "/vault/local/revisions/label",
            axum::routing::post(update_revision_label),
        )
        .route(
            "/vault/local/restore",
            axum::routing::post(restore_revision),
        )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn local_folder_paths_keep_obsidian_case() {
        assert_eq!(
            normalize_folder_path(" Projects / Daily Notes "),
            "Projects/Daily Notes"
        );
        assert_eq!(
            normalize_folder_path(" Home\u{200B}work /\u{FEFF} Commands "),
            "Homework/Commands"
        );
    }

    #[test]
    fn parent_path_handles_root() {
        assert_eq!(parent_path("Projects/Daily Notes"), "Projects");
        assert_eq!(parent_path("Projects"), "");
    }

    #[test]
    fn stored_folder_path_maps_trash_view_to_original_path() {
        assert_eq!(
            stored_folder_path("Trash/Projects/Daily Notes"),
            "Projects/Daily Notes"
        );
        assert_eq!(
            stored_folder_path(" Trash / Projects / Daily Notes "),
            "Projects/Daily Notes"
        );
        assert_eq!(
            stored_folder_path("Projects/Daily Notes"),
            "Projects/Daily Notes"
        );
    }

    #[test]
    fn search_properties_text_indexes_aliases() {
        let indexed = search_properties_text(r#"{"status":"draft"}"#, r#"["Launch Plan"]"#);

        assert!(indexed.contains("status"));
        assert!(indexed.contains("Launch Plan"));
    }

    #[test]
    fn import_markdown_content_accepts_legacy_body_fields() {
        assert_eq!(
            markdown_content_from_document(&json!({
                "content": "",
                "content_markdown": "# From content_markdown",
                "markdown": "# From markdown",
            })),
            "# From content_markdown"
        );
        assert_eq!(
            markdown_content_from_document(&json!({
                "markdown": "# From markdown",
            })),
            "# From markdown"
        );
        assert_eq!(
            markdown_content_from_document(&json!({
                "content": "",
                "body": "",
            })),
            ""
        );
    }

    #[test]
    fn tar_export_sanitizes_paths_and_writes_file_blocks() {
        assert_eq!(
            clean_tar_path("../Projects/./Bad:Name.md"),
            "Projects/BadName.md"
        );
        let mut archive = Vec::new();
        append_tar_file(&mut archive, "Projects/Roadmap.md", b"# Roadmap", 0).unwrap();

        assert_eq!(&archive[..20], b"Projects/Roadmap.md\0");
        assert_eq!(archive.len(), 1024);
        assert_eq!(&archive[512..521], b"# Roadmap");
    }

    #[test]
    fn markdown_archive_manifest_indexes_plugin_metadata() {
        let payload = json!({
            "notes": [{
                "id": "Projects/roadmap.md",
                "path": "Projects/roadmap.md",
                "title": "Roadmap",
                "folder": "Projects",
                "tags": ["strategy", "private"],
                "aliases": ["Plan"],
                "properties": { "status": "draft" },
                "links": ["Projects/target.md"],
                "updated_at": 2,
                "trashed_at": null,
            }],
            "attachments": [{
                "id": "Media/diagram.png",
                "document_id": "Projects/roadmap.md",
                "path": "Media",
                "filename": "diagram.png",
                "mime": "image/png",
                "size": 4,
                "sha256": "abc",
                "trashed_at": null,
            }],
            "comments": [{ "document_id": "Projects/roadmap.md" }],
            "suggestions": [{ "document_id": "Projects/roadmap.md" }],
        });

        let manifest = build_markdown_archive_manifest(&payload, "2026-05-12T00:00:00Z".into());

        assert_eq!(manifest["format"], "clawcontrol-markdown-vault-tar");
        assert_eq!(
            manifest["plugin_metadata"]["schema"],
            "clawcontrol-vault-plugin-index"
        );
        assert_eq!(
            manifest["plugin_metadata"]["documents"][0]["review"]["comments"],
            1
        );
        assert_eq!(manifest["plugin_metadata"]["tags"]["strategy"], 1);
        assert_eq!(manifest["plugin_metadata"]["property_keys"][0], "status");
        assert_eq!(
            manifest["plugin_metadata"]["links"][0]["source"],
            "Projects/roadmap.md"
        );
        assert_eq!(
            manifest["plugin_metadata"]["backlinks"]["Projects/target.md"][0],
            "Projects/roadmap.md"
        );
        assert_eq!(
            manifest["plugin_metadata"]["attachments"][0]["sha256"],
            "abc"
        );
    }

    #[test]
    fn autosave_versions_are_coalesced_by_checksum_and_time() {
        let now = 1_000_000;

        assert!(autosave_version_due(now, "b", None, None));
        assert!(!autosave_version_due(
            now,
            "a",
            Some(now - AUTOSAVE_VERSION_INTERVAL_MS - 1),
            Some("a")
        ));
        assert!(!autosave_version_due(
            now,
            "b",
            Some(now - 10_000),
            Some("a")
        ));
        assert!(autosave_version_due(
            now,
            "b",
            Some(now - AUTOSAVE_VERSION_INTERVAL_MS),
            Some("a"),
        ));
    }

    #[test]
    fn collaboration_events_validate_private_draft_protocol() {
        let mut body = CollaborationEventBody {
            document_id: "Projects/roadmap.md".into(),
            event_id: Some("evt-1".into()),
            client_id: Some("client-1".into()),
            sequence: Some(1),
            kind: "draft".into(),
            peer_id: "peer-1".into(),
            peer_name: "Ada".into(),
            peer_seen_at: Some(1),
            content: Some("# Draft".into()),
            base_checksum: Some("base".into()),
            content_checksum: Some("draft".into()),
            operations: Some(json!([{ "id": "op-1" }])),
            crdt_operations: None,
            rich_operations: None,
            cursor: None,
            updated_at: Some(2),
            ttl_ms: Some(1),
        };

        assert!(validate_collaboration_event_body(&body).is_ok());
        assert_eq!(collaboration_event_ttl_ms(body.ttl_ms), 5_000);

        body.event_id = Some("bad id".into());
        assert!(matches!(
            validate_collaboration_event_body(&body),
            Err(AppError::BadRequest(_))
        ));

        body.event_id = Some("evt-1".into());
        body.client_id = Some("bad id".into());
        assert!(matches!(
            validate_collaboration_event_body(&body),
            Err(AppError::BadRequest(_))
        ));

        body.client_id = Some("client-1".into());
        body.sequence = Some(-1);
        assert!(matches!(
            validate_collaboration_event_body(&body),
            Err(AppError::BadRequest(_))
        ));

        body.sequence = Some(1);
        body.content_checksum = None;
        assert!(matches!(
            validate_collaboration_event_body(&body),
            Err(AppError::BadRequest(_))
        ));

        body.kind = "remote-sync".into();
        body.content_checksum = Some("draft".into());
        assert!(matches!(
            validate_collaboration_event_body(&body),
            Err(AppError::BadRequest(_))
        ));

        body.kind = "operation".into();
        body.content_checksum = Some("draft".into());
        body.operations = Some(json!([{ "id": "op-1" }]));
        assert!(validate_collaboration_event_body(&body).is_ok());

        body.operations = Some(json!([]));
        body.crdt_operations = Some(json!([
            { "type": "insert", "id": "crdt-client-1", "afterId": null, "value": "A" }
        ]));
        assert!(validate_collaboration_event_body(&body).is_ok());

        body.crdt_operations = Some(json!([
            { "type": "insert", "id": "crdt-client-1", "afterId": null, "value": "" }
        ]));
        assert!(matches!(
            validate_collaboration_event_body(&body),
            Err(AppError::BadRequest(_))
        ));

        body.crdt_operations = None;
        assert!(matches!(
            validate_collaboration_event_body(&body),
            Err(AppError::BadRequest(_))
        ));

        body.rich_operations = Some(json!([
            { "type": "tableCell", "id": "block:base:0001:table1234", "row": 1, "column": 2, "markdown": "12" }
        ]));
        assert!(validate_collaboration_event_body(&body).is_ok());

        body.rich_operations = Some(json!([
            { "type": "tableRow", "id": "block:base:0001:table1234", "index": 2, "cells": ["DNS", "Sam"] }
        ]));
        assert!(validate_collaboration_event_body(&body).is_ok());

        body.rich_operations = Some(json!([
            { "type": "tableRowDelete", "id": "block:base:0001:table1234", "index": 1, "cells": ["Hosting", "Ada"] }
        ]));
        assert!(validate_collaboration_event_body(&body).is_ok());

        body.rich_operations = Some(json!([
            { "type": "tableColumn", "id": "block:base:0001:table1234", "index": 2, "cells": ["Cost", "---", "10"] }
        ]));
        assert!(validate_collaboration_event_body(&body).is_ok());

        body.rich_operations = Some(json!([
            { "type": "tableColumnDelete", "id": "block:base:0001:table1234", "index": 1, "cells": ["Owner", "---", "Ada"] }
        ]));
        assert!(validate_collaboration_event_body(&body).is_ok());

        body.rich_operations = Some(json!([
            { "type": "listItem", "id": "block:base:0003:tasks1234", "index": 1, "markdown": "- [x] Review citations" }
        ]));
        assert!(validate_collaboration_event_body(&body).is_ok());

        body.rich_operations = Some(json!([
            { "type": "listItemInsert", "id": "block:base:0003:tasks1234", "index": 2, "markdown": "- [ ] Send confirmation" }
        ]));
        assert!(validate_collaboration_event_body(&body).is_ok());

        body.rich_operations = Some(json!([
            { "type": "listItemDelete", "id": "block:base:0003:tasks1234", "index": 1, "markdown": "- [ ] Review citations" }
        ]));
        assert!(validate_collaboration_event_body(&body).is_ok());

        body.rich_operations = Some(json!([
            { "type": "line", "id": "block:base:0004:quote1234", "index": 2, "markdown": "> Confirm launch owner" }
        ]));
        assert!(validate_collaboration_event_body(&body).is_ok());

        body.rich_operations = Some(json!([
            { "type": "lineInsert", "id": "block:base:0004:quote1234", "index": 3, "markdown": "> Publish update" }
        ]));
        assert!(validate_collaboration_event_body(&body).is_ok());

        body.rich_operations = Some(json!([
            { "type": "lineDelete", "id": "block:base:0004:quote1234", "index": 1, "markdown": "> Draft checklist" }
        ]));
        assert!(validate_collaboration_event_body(&body).is_ok());

        body.rich_operations = Some(json!([
            { "type": "mark", "id": "block:base:0002:style1234", "mark": "highlight", "textStart": 0, "textEnd": 5, "color": "#ffee58" }
        ]));
        assert!(validate_collaboration_event_body(&body).is_ok());

        body.rich_operations = Some(json!([
            { "type": "tableCell", "id": "block:base:0001:table1234", "row": -1, "column": 2, "markdown": "12" }
        ]));
        assert!(matches!(
            validate_collaboration_event_body(&body),
            Err(AppError::BadRequest(_))
        ));

        body.rich_operations = Some(json!([
            { "type": "tableRow", "id": "block:base:0001:table1234", "index": -1, "cells": ["DNS", "Sam"] }
        ]));
        assert!(matches!(
            validate_collaboration_event_body(&body),
            Err(AppError::BadRequest(_))
        ));

        body.rich_operations = Some(json!([
            { "type": "tableRowDelete", "id": "block:base:0001:table1234", "index": -1, "cells": ["Hosting", "Ada"] }
        ]));
        assert!(matches!(
            validate_collaboration_event_body(&body),
            Err(AppError::BadRequest(_))
        ));

        body.rich_operations = Some(json!([
            { "type": "tableColumn", "id": "block:base:0001:table1234", "index": -1, "cells": ["Cost", "---", "10"] }
        ]));
        assert!(matches!(
            validate_collaboration_event_body(&body),
            Err(AppError::BadRequest(_))
        ));

        body.rich_operations = Some(json!([
            { "type": "tableColumnDelete", "id": "block:base:0001:table1234", "index": -1, "cells": ["Owner", "---", "Ada"] }
        ]));
        assert!(matches!(
            validate_collaboration_event_body(&body),
            Err(AppError::BadRequest(_))
        ));

        body.rich_operations = Some(json!([
            { "type": "listItem", "id": "block:base:0003:tasks1234", "index": -1, "markdown": "- [x] Review citations" }
        ]));
        assert!(matches!(
            validate_collaboration_event_body(&body),
            Err(AppError::BadRequest(_))
        ));

        body.rich_operations = Some(json!([
            { "type": "listItemInsert", "id": "block:base:0003:tasks1234", "index": -1, "markdown": "- [ ] Send confirmation" }
        ]));
        assert!(matches!(
            validate_collaboration_event_body(&body),
            Err(AppError::BadRequest(_))
        ));

        body.rich_operations = Some(json!([
            { "type": "listItemDelete", "id": "block:base:0003:tasks1234", "index": -1, "markdown": "- [ ] Review citations" }
        ]));
        assert!(matches!(
            validate_collaboration_event_body(&body),
            Err(AppError::BadRequest(_))
        ));

        body.rich_operations = Some(json!([
            { "type": "line", "id": "block:base:0004:quote1234", "index": -1, "markdown": "> Confirm launch owner" }
        ]));
        assert!(matches!(
            validate_collaboration_event_body(&body),
            Err(AppError::BadRequest(_))
        ));

        body.rich_operations = Some(json!([
            { "type": "lineInsert", "id": "block:base:0004:quote1234", "index": -1, "markdown": "> Publish update" }
        ]));
        assert!(matches!(
            validate_collaboration_event_body(&body),
            Err(AppError::BadRequest(_))
        ));

        body.rich_operations = Some(json!([
            { "type": "lineDelete", "id": "block:base:0004:quote1234", "index": -1, "markdown": "> Draft checklist" }
        ]));
        assert!(matches!(
            validate_collaboration_event_body(&body),
            Err(AppError::BadRequest(_))
        ));
        body.rich_operations = None;

        body.kind = "cursor".into();
        body.content = None;
        body.base_checksum = None;
        body.content_checksum = None;
        body.operations = None;
        body.cursor = Some(json!({ "anchor": 4, "head": 8, "updatedAt": 3 }));
        assert!(validate_collaboration_event_body(&body).is_ok());

        body.cursor = Some(json!({ "anchor": -1, "head": 8, "updatedAt": 3 }));
        assert!(matches!(
            validate_collaboration_event_body(&body),
            Err(AppError::BadRequest(_))
        ));
    }

    #[test]
    fn collaboration_crdt_state_validates_snapshot_protocol() {
        let mut body = CollaborationCrdtStateBody {
            document_id: "Projects/roadmap.md".into(),
            state: json!([
                { "id": "m:base:000000", "afterId": null, "value": "A" },
                { "id": "crdt:client:1:0", "afterId": "m:base:000000", "value": "B", "deleted": true }
            ]),
            checksum: "abcd1234".into(),
            client_id: Some("client-1".into()),
            sequence: Some(2),
            updated_at: Some(3),
        };

        assert!(validate_collaboration_crdt_state_body(&body).is_ok());

        body.client_id = Some("bad id".into());
        assert!(matches!(
            validate_collaboration_crdt_state_body(&body),
            Err(AppError::BadRequest(_))
        ));

        body.client_id = Some("client-1".into());
        body.sequence = Some(-1);
        assert!(matches!(
            validate_collaboration_crdt_state_body(&body),
            Err(AppError::BadRequest(_))
        ));

        body.sequence = Some(2);
        body.state = json!([{ "id": "", "afterId": null, "value": "A" }]);
        assert!(matches!(
            validate_collaboration_crdt_state_body(&body),
            Err(AppError::BadRequest(_))
        ));

        body.state = json!([{ "id": "m:base:000000", "afterId": null, "value": "" }]);
        assert!(matches!(
            validate_collaboration_crdt_state_body(&body),
            Err(AppError::BadRequest(_))
        ));
    }

    #[test]
    fn encrypted_backup_roundtrips_payload() {
        let payload = json!({
            "format": "clawcontrol-local-vault",
            "notes": [{ "id": "Projects/roadmap.md", "content": "# Roadmap" }],
        });

        let backup = encrypt_backup_payload(&payload, "long-password").unwrap();
        let restored = decrypt_backup_payload(&backup, "long-password").unwrap();

        assert_eq!(backup["format"], "clawcontrol-encrypted-vault-backup");
        assert_eq!(restored, payload);
    }

    #[test]
    fn encrypted_backup_rejects_wrong_password() {
        let payload = json!({ "notes": [] });
        let backup = encrypt_backup_payload(&payload, "long-password").unwrap();

        let result = decrypt_backup_payload(&backup, "wrong-password");

        assert!(result.is_err());
    }
}
