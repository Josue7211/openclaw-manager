use axum::{
    extract::{Query, State},
    routing::{get, post},
    Json, Router,
};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::error::{success_json, AppError};
use crate::server::{AppState, RequireAuth};
use crate::validation::{sanitize_postgrest_value, validate_uuid};

type ScopeRow = (String, String, String, String, String, i64, String, String);
type ScopeCountRow = (
    String,
    String,
    String,
    String,
    String,
    i64,
    String,
    String,
    i64,
);
type AuditRow = (
    String,
    String,
    String,
    Option<String>,
    Option<String>,
    String,
    String,
);

#[derive(Clone, Debug, Deserialize)]
struct ScopeInput {
    kind: String,
    name: String,
    description: Option<String>,
}

#[derive(Debug, Deserialize)]
struct QueryBody {
    query: Option<String>,
    limit: Option<i64>,
    scope: Option<ScopeInput>,
    #[serde(rename = "includeArchived")]
    include_archived: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct UpsertBody {
    id: Option<String>,
    scope: Option<ScopeInput>,
    kind: Option<String>,
    title: Option<String>,
    content: Option<String>,
    summary: Option<String>,
    source: Option<String>,
    confidence: Option<i64>,
    priority: Option<i64>,
    #[serde(rename = "retentionDays")]
    retention_days: Option<i64>,
    metadata: Option<Value>,
}

#[derive(Debug, Deserialize)]
struct ArchiveBody {
    ids: Vec<String>,
    scope: Option<ScopeInput>,
    reason: Option<String>,
}

#[derive(Debug, Deserialize)]
struct CompactBody {
    scope: Option<ScopeInput>,
    #[serde(rename = "keepLatest")]
    keep_latest: Option<i64>,
    #[serde(rename = "maxAgeDays")]
    max_age_days: Option<i64>,
}

#[derive(Debug, Deserialize)]
struct AuditQuery {
    #[serde(rename = "scopeId")]
    scope_id: Option<String>,
    limit: Option<i64>,
}

#[derive(Clone)]
struct MemdScopeRecord {
    id: String,
    user_id: String,
    kind: String,
    name: String,
    description: String,
    is_default: bool,
    created_at: String,
    updated_at: String,
}

#[derive(Clone, sqlx::FromRow)]
struct MemdEntryRecord {
    id: String,
    scope_id: String,
    scope_kind: String,
    scope_name: String,
    scope_description: String,
    kind: String,
    title: String,
    content: String,
    summary: String,
    source: String,
    confidence: i64,
    priority: i64,
    retention_days: i64,
    version: i64,
    status: String,
    metadata: String,
    created_at: String,
    updated_at: String,
    archived_at: Option<String>,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/query", post(query_memo))
        .route("/upsert", post(upsert_memo))
        .route("/archive", post(archive_memo))
        .route("/compact", post(compact_memo))
        .route("/scopes", get(list_scopes))
        .route("/audit", get(list_audit))
}

fn default_scope() -> ScopeInput {
    ScopeInput {
        kind: "user".to_string(),
        name: "brain".to_string(),
        description: Some("Default brain scope".to_string()),
    }
}

fn scope_to_json(scope: &MemdScopeRecord, entry_count: Option<i64>) -> Value {
    json!({
        "id": scope.id,
        "userId": scope.user_id,
        "kind": scope.kind,
        "name": scope.name,
        "description": scope.description,
        "isDefault": scope.is_default,
        "createdAt": scope.created_at,
        "updatedAt": scope.updated_at,
        "entryCount": entry_count,
    })
}

fn entry_to_json(entry: &MemdEntryRecord, score: i64) -> Value {
    let metadata = serde_json::from_str::<Value>(&entry.metadata).unwrap_or_else(|_| json!({}));
    json!({
        "id": entry.id,
        "scope": {
            "id": entry.scope_id,
            "kind": entry.scope_kind,
            "name": entry.scope_name,
            "description": entry.scope_description,
        },
        "kind": entry.kind,
        "title": entry.title,
        "content": entry.content,
        "summary": entry.summary,
        "source": entry.source,
        "confidence": entry.confidence,
        "priority": entry.priority,
        "retentionDays": entry.retention_days,
        "version": entry.version,
        "status": entry.status,
        "metadata": metadata,
        "createdAt": entry.created_at,
        "updatedAt": entry.updated_at,
        "archivedAt": entry.archived_at,
        "name": entry.title,
        "path": format!("memd/{}/{}/{}", entry.scope_kind, entry.scope_name, entry.id),
        "snippet": if entry.summary.trim().is_empty() {
            entry.content.chars().take(160).collect::<String>()
        } else {
            entry.summary.clone()
        },
        "score": score,
    })
}

fn audit_to_json(row: &AuditRow) -> Value {
    json!({
        "id": row.0,
        "userId": row.1,
        "action": row.2,
        "scopeId": row.3,
        "entryId": row.4,
        "details": serde_json::from_str::<Value>(&row.5).unwrap_or_else(|_| json!({})),
        "createdAt": row.6,
    })
}

fn normalize_limit(limit: Option<i64>, default: i64, max: i64) -> i64 {
    limit.unwrap_or(default).clamp(1, max)
}

fn sanitize_scope_component(input: &str, field: &str) -> Result<String, AppError> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err(AppError::BadRequest(format!("{field} required")));
    }
    Ok(sanitize_postgrest_value(trimmed)?.to_string())
}

fn optional_trimmed(input: Option<&str>, max_len: usize) -> Option<String> {
    input
        .map(|v| v.trim())
        .filter(|v| !v.is_empty())
        .map(|v| v.chars().take(max_len).collect::<String>())
}

async fn ensure_scope(
    db: &sqlx::SqlitePool,
    user_id: &str,
    scope: Option<&ScopeInput>,
) -> Result<MemdScopeRecord, AppError> {
    let is_default_scope = scope.is_none();
    let scope = scope.cloned().unwrap_or_else(default_scope);
    let kind = sanitize_scope_component(&scope.kind, "scope.kind")?;
    let name = sanitize_scope_component(&scope.name, "scope.name")?;
    let description = optional_trimmed(scope.description.as_deref(), 255).unwrap_or_default();

    if let Some(row) = sqlx::query_as::<_, ScopeRow>(
        "SELECT id, user_id, scope_kind, scope_name, description, is_default, created_at, updated_at \
         FROM memd_scopes WHERE user_id = ? AND scope_kind = ? AND scope_name = ?",
    )
    .bind(user_id)
    .bind(&kind)
    .bind(&name)
    .fetch_optional(db)
    .await?
    {
        return Ok(MemdScopeRecord {
            id: row.0,
            user_id: row.1,
            kind: row.2,
            name: row.3,
            description: row.4,
            is_default: row.5 != 0,
            created_at: row.6,
            updated_at: row.7,
        });
    }

    let id = crate::routes::util::random_uuid();
    let now = chrono::Utc::now().to_rfc3339();
    let is_default = i64::from(is_default_scope || (kind == "user" && name == "brain"));

    // Avoid uniqueness races (another request might create the same scope concurrently).
    // If the scope already exists, we update the description/updated_at but keep its original id.
    sqlx::query(
        "INSERT INTO memd_scopes \
         (id, user_id, scope_kind, scope_name, description, is_default, created_at, updated_at) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?) \
         ON CONFLICT(user_id, scope_kind, scope_name) DO UPDATE SET \
           description = excluded.description, \
           is_default = excluded.is_default, \
           updated_at = excluded.updated_at",
    )
    .bind(&id)
    .bind(user_id)
    .bind(&kind)
    .bind(&name)
    .bind(&description)
    .bind(is_default)
    .bind(&now)
    .bind(&now)
    .execute(db)
    .await?;

    // Re-fetch to return the canonical scope row (especially important on conflict).
    let row = sqlx::query_as::<_, ScopeRow>(
        "SELECT id, user_id, scope_kind, scope_name, description, is_default, created_at, updated_at \
         FROM memd_scopes WHERE user_id = ? AND scope_kind = ? AND scope_name = ?",
    )
    .bind(user_id)
    .bind(&kind)
    .bind(&name)
    .fetch_one(db)
    .await?;

    Ok(MemdScopeRecord {
        id: row.0,
        user_id: row.1,
        kind: row.2,
        name: row.3,
        description: row.4,
        is_default: row.5 != 0,
        created_at: row.6,
        updated_at: row.7,
    })
}

async fn query_entry_rows(
    db: &sqlx::SqlitePool,
    user_id: &str,
    scope_id: Option<&str>,
    include_archived: bool,
    limit: i64,
) -> Result<Vec<MemdEntryRecord>, AppError> {
    let rows: Vec<MemdEntryRecord> = if let Some(scope_id) = scope_id {
        if include_archived {
            sqlx::query_as(
                "SELECT e.id, e.scope_id, s.scope_kind, s.scope_name, s.description as scope_description, \
                 e.kind, e.title, e.content, e.summary, e.source, e.confidence, e.priority, \
                 e.retention_days, e.version, e.status, e.metadata, e.created_at, e.updated_at, e.archived_at \
                 FROM memd_entries e \
                 JOIN memd_scopes s ON s.id = e.scope_id AND s.user_id = e.user_id \
                 WHERE e.user_id = ? AND e.scope_id = ? \
                 ORDER BY e.priority DESC, e.updated_at DESC \
                 LIMIT ?",
            )
            .bind(user_id)
            .bind(scope_id)
            .bind(limit)
            .fetch_all(db)
            .await?
        } else {
            sqlx::query_as(
                "SELECT e.id, e.scope_id, s.scope_kind, s.scope_name, s.description as scope_description, \
                 e.kind, e.title, e.content, e.summary, e.source, e.confidence, e.priority, \
                 e.retention_days, e.version, e.status, e.metadata, e.created_at, e.updated_at, e.archived_at \
                 FROM memd_entries e \
                 JOIN memd_scopes s ON s.id = e.scope_id AND s.user_id = e.user_id \
                 WHERE e.user_id = ? AND e.scope_id = ? AND e.status = 'active' \
                 ORDER BY e.priority DESC, e.updated_at DESC \
                 LIMIT ?",
            )
            .bind(user_id)
            .bind(scope_id)
            .bind(limit)
            .fetch_all(db)
            .await?
        }
    } else if include_archived {
        sqlx::query_as(
            "SELECT e.id, e.scope_id, s.scope_kind, s.scope_name, s.description as scope_description, \
             e.kind, e.title, e.content, e.summary, e.source, e.confidence, e.priority, \
             e.retention_days, e.version, e.status, e.metadata, e.created_at, e.updated_at, e.archived_at \
             FROM memd_entries e \
             JOIN memd_scopes s ON s.id = e.scope_id AND s.user_id = e.user_id \
             WHERE e.user_id = ? \
             ORDER BY e.priority DESC, e.updated_at DESC \
             LIMIT ?",
        )
        .bind(user_id)
        .bind(limit)
        .fetch_all(db)
        .await?
    } else {
        sqlx::query_as(
            "SELECT e.id, e.scope_id, s.scope_kind, s.scope_name, s.description as scope_description, \
             e.kind, e.title, e.content, e.summary, e.source, e.confidence, e.priority, \
             e.retention_days, e.version, e.status, e.metadata, e.created_at, e.updated_at, e.archived_at \
             FROM memd_entries e \
             JOIN memd_scopes s ON s.id = e.scope_id AND s.user_id = e.user_id \
             WHERE e.user_id = ? AND e.status = 'active' \
             ORDER BY e.priority DESC, e.updated_at DESC \
             LIMIT ?",
        )
        .bind(user_id)
        .bind(limit)
        .fetch_all(db)
        .await?
    };

    Ok(rows)
}

async fn insert_audit(
    db: &sqlx::SqlitePool,
    user_id: &str,
    action: &str,
    scope_id: Option<&str>,
    entry_id: Option<&str>,
    details: Value,
) -> Result<(), AppError> {
    let id = crate::routes::util::random_uuid();
    let now = chrono::Utc::now().to_rfc3339();
    sqlx::query(
        "INSERT INTO memd_audit (id, user_id, action, scope_id, entry_id, details, created_at) \
         VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(user_id)
    .bind(action)
    .bind(scope_id)
    .bind(entry_id)
    .bind(details.to_string())
    .bind(&now)
    .execute(db)
    .await?;
    Ok(())
}

async fn query_memo(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Json(body): Json<QueryBody>,
) -> Result<Json<Value>, AppError> {
    let scope = ensure_scope(&state.db, &session.user_id, body.scope.as_ref()).await?;
    let limit = normalize_limit(body.limit, 10, 100);
    let mut entries = query_entry_rows(
        &state.db,
        &session.user_id,
        Some(&scope.id),
        body.include_archived.unwrap_or(false),
        limit.saturating_mul(5),
    )
    .await?;

    let needle = body
        .query
        .as_deref()
        .unwrap_or_default()
        .trim()
        .to_lowercase();

    let mut scored: Vec<(i64, MemdEntryRecord)> = entries
        .drain(..)
        .filter_map(|entry| {
            if needle.is_empty() {
                return Some((entry.priority.max(0), entry));
            }

            let haystack = format!(
                "{} {} {} {}",
                entry.title, entry.summary, entry.content, entry.scope_name
            )
            .to_lowercase();
            if !haystack.contains(&needle) {
                return None;
            }

            let mut score = entry.priority.max(0) + entry.confidence.max(0) / 10;
            if entry.title.to_lowercase().contains(&needle) {
                score += 30;
            }
            if entry.summary.to_lowercase().contains(&needle) {
                score += 20;
            }
            if entry.content.to_lowercase().contains(&needle) {
                score += 10;
            }
            if entry.kind.to_lowercase().contains(&needle) {
                score += 5;
            }
            Some((score, entry))
        })
        .collect();

    scored.sort_by(|a, b| {
        b.0.cmp(&a.0)
            .then_with(|| b.1.priority.cmp(&a.1.priority))
            .then_with(|| b.1.updated_at.cmp(&a.1.updated_at))
    });

    let entries: Vec<Value> = scored
        .into_iter()
        .take(limit as usize)
        .map(|(score, entry)| entry_to_json(&entry, score))
        .collect();

    insert_audit(
        &state.db,
        &session.user_id,
        "query",
        Some(&scope.id),
        None,
        json!({
            "query": body.query,
            "limit": limit,
            "includeArchived": body.include_archived.unwrap_or(false),
            "resultCount": entries.len(),
        }),
    )
    .await?;

    Ok(success_json(json!({
        "scope": scope_to_json(&scope, None),
        "entries": entries,
    })))
}

async fn upsert_memo(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Json(body): Json<UpsertBody>,
) -> Result<Json<Value>, AppError> {
    let scope = ensure_scope(&state.db, &session.user_id, body.scope.as_ref()).await?;
    let now = chrono::Utc::now().to_rfc3339();
    let title = optional_trimmed(body.title.as_deref(), 200)
        .ok_or_else(|| AppError::BadRequest("title required".into()))?;
    let content = optional_trimmed(body.content.as_deref(), 20_000).unwrap_or_default();
    let summary = optional_trimmed(body.summary.as_deref(), 4_000).unwrap_or_default();
    let kind = sanitize_scope_component(body.kind.as_deref().unwrap_or("fact"), "kind")?;
    let source = sanitize_scope_component(body.source.as_deref().unwrap_or("manual"), "source")?;
    let confidence = body.confidence.unwrap_or(50).clamp(0, 100);
    let priority = body.priority.unwrap_or(0).clamp(0, 100);
    let retention_days = body.retention_days.unwrap_or(30).clamp(1, 3650);
    let metadata = body.metadata.unwrap_or_else(|| json!({}));

    let id = if let Some(id) = body.id.as_deref() {
        validate_uuid(id)?;
        id.to_string()
    } else {
        crate::routes::util::random_uuid()
    };

    let existing: Option<(i64, String)> =
        sqlx::query_as("SELECT version, created_at FROM memd_entries WHERE id = ? AND user_id = ?")
            .bind(&id)
            .bind(&session.user_id)
            .fetch_optional(&state.db)
            .await?;

    let created_at = existing
        .as_ref()
        .map(|row| row.1.clone())
        .unwrap_or_else(|| now.clone());
    let version = existing.as_ref().map(|row| row.0 + 1).unwrap_or(1);
    let archived_at: Option<String> = None;
    let metadata_str = metadata.to_string();

    sqlx::query(
        "INSERT INTO memd_entries \
         (id, user_id, scope_id, kind, title, content, summary, source, confidence, priority, \
         retention_days, version, status, metadata, created_at, updated_at, archived_at) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?) \
         ON CONFLICT(id, user_id) DO UPDATE SET \
           scope_id = excluded.scope_id, \
           kind = excluded.kind, \
           title = excluded.title, \
           content = excluded.content, \
           summary = excluded.summary, \
           source = excluded.source, \
           confidence = excluded.confidence, \
           priority = excluded.priority, \
           retention_days = excluded.retention_days, \
           version = excluded.version, \
           status = excluded.status, \
           metadata = excluded.metadata, \
           updated_at = excluded.updated_at, \
           archived_at = excluded.archived_at",
    )
    .bind(&id)
    .bind(&session.user_id)
    .bind(&scope.id)
    .bind(&kind)
    .bind(&title)
    .bind(&content)
    .bind(&summary)
    .bind(&source)
    .bind(confidence)
    .bind(priority)
    .bind(retention_days)
    .bind(version)
    .bind(&metadata_str)
    .bind(&created_at)
    .bind(&now)
    .bind(&archived_at)
    .execute(&state.db)
    .await?;

    insert_audit(
        &state.db,
        &session.user_id,
        if existing.is_some() {
            "update"
        } else {
            "upsert"
        },
        Some(&scope.id),
        Some(&id),
        json!({
            "kind": kind,
            "title": title,
            "priority": priority,
            "confidence": confidence,
            "retentionDays": retention_days,
        }),
    )
    .await?;

    let entry = MemdEntryRecord {
        id: id.clone(),
        scope_id: scope.id.clone(),
        scope_kind: scope.kind.clone(),
        scope_name: scope.name.clone(),
        scope_description: scope.description.clone(),
        kind,
        title: title.clone(),
        content: content.clone(),
        summary: summary.clone(),
        source,
        confidence,
        priority,
        retention_days,
        version,
        status: "active".to_string(),
        metadata: metadata_str,
        created_at,
        updated_at: now.clone(),
        archived_at,
    };

    Ok(success_json(json!({
        "scope": scope_to_json(&scope, None),
        "entry": entry_to_json(&entry, priority + confidence / 10),
    })))
}

async fn archive_memo(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Json(body): Json<ArchiveBody>,
) -> Result<Json<Value>, AppError> {
    if body.ids.is_empty() {
        return Err(AppError::BadRequest("ids required".into()));
    }

    let scope = if let Some(scope) = body.scope.as_ref() {
        Some(ensure_scope(&state.db, &session.user_id, Some(scope)).await?)
    } else {
        None
    };

    let now = chrono::Utc::now().to_rfc3339();
    let mut archived = 0i64;
    for id in &body.ids {
        validate_uuid(id)?;
        let res = if let Some(scope) = &scope {
            sqlx::query(
                "UPDATE memd_entries SET status = 'archived', archived_at = ?, updated_at = ? \
                 WHERE id = ? AND user_id = ? AND scope_id = ?",
            )
            .bind(&now)
            .bind(&now)
            .bind(id)
            .bind(&session.user_id)
            .bind(&scope.id)
            .execute(&state.db)
            .await?
        } else {
            sqlx::query(
                "UPDATE memd_entries SET status = 'archived', archived_at = ?, updated_at = ? \
                 WHERE id = ? AND user_id = ?",
            )
            .bind(&now)
            .bind(&now)
            .bind(id)
            .bind(&session.user_id)
            .execute(&state.db)
            .await?
        };
        archived += res.rows_affected() as i64;
    }

    insert_audit(
        &state.db,
        &session.user_id,
        "archive",
        scope.as_ref().map(|s| s.id.as_str()),
        None,
        json!({
            "ids": body.ids,
            "reason": body.reason,
            "archived": archived,
        }),
    )
    .await?;

    Ok(success_json(json!({
        "archived": archived,
        "scope": scope.map(|s| scope_to_json(&s, None)),
    })))
}

async fn compact_memo(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Json(body): Json<CompactBody>,
) -> Result<Json<Value>, AppError> {
    let scope = ensure_scope(&state.db, &session.user_id, body.scope.as_ref()).await?;
    let keep_latest = normalize_limit(body.keep_latest, 12, 100);
    let max_age_days = normalize_limit(body.max_age_days, 30, 3650);
    let cutoff = chrono::Utc::now() - chrono::Duration::days(max_age_days);
    let cutoff_str = cutoff.to_rfc3339();

    let rows = query_entry_rows(&state.db, &session.user_id, Some(&scope.id), false, 200).await?;

    let mut archive_ids: Vec<String> = Vec::new();
    let mut kept_titles: Vec<String> = Vec::new();
    for (idx, row) in rows.iter().enumerate() {
        if idx < keep_latest as usize || row.updated_at >= cutoff_str {
            kept_titles.push(row.title.clone());
        } else {
            archive_ids.push(row.id.clone());
        }
    }

    let mut archived = 0i64;
    let now = chrono::Utc::now().to_rfc3339();
    for id in &archive_ids {
        let res = sqlx::query(
            "UPDATE memd_entries SET status = 'archived', archived_at = ?, updated_at = ? \
             WHERE id = ? AND user_id = ? AND scope_id = ?",
        )
        .bind(&now)
        .bind(&now)
        .bind(id)
        .bind(&session.user_id)
        .bind(&scope.id)
        .execute(&state.db)
        .await?;
        archived += res.rows_affected() as i64;
    }

    let summary_entry = if archived > 0 {
        let summary_id = crate::routes::util::random_uuid();
        let summary_title = format!("MemD compaction: {} archived", archived);
        let summary_content = format!(
            "Archived {} stale entries from scope {}/{}. Kept {} active entries.",
            archived,
            scope.kind,
            scope.name,
            kept_titles.len()
        );
        let metadata = json!({
            "archivedIds": archive_ids,
            "keepLatest": keep_latest,
            "maxAgeDays": max_age_days,
            "keptTitles": kept_titles.iter().take(10).cloned().collect::<Vec<_>>(),
        });
        sqlx::query(
            "INSERT INTO memd_entries \
             (id, user_id, scope_id, kind, title, content, summary, source, confidence, priority, \
              retention_days, version, status, metadata, created_at, updated_at, archived_at) \
             VALUES (?, ?, ?, 'summary', ?, ?, ?, 'system', 90, 50, 365, 1, 'active', ?, ?, ?, NULL)",
        )
        .bind(&summary_id)
        .bind(&session.user_id)
        .bind(&scope.id)
        .bind(summary_title.as_str())
        .bind(summary_content.as_str())
        .bind(summary_content.as_str())
        .bind(metadata.to_string())
        .bind(&now)
        .bind(&now)
        .execute(&state.db)
        .await?;

        Some(json!({
            "id": summary_id,
            "title": summary_title,
            "content": summary_content,
        }))
    } else {
        None
    };

    insert_audit(
        &state.db,
        &session.user_id,
        "compact",
        Some(&scope.id),
        None,
        json!({
            "archived": archived,
            "keepLatest": keep_latest,
            "maxAgeDays": max_age_days,
        }),
    )
    .await?;

    Ok(success_json(json!({
        "archived": archived,
        "summary": summary_entry,
        "scope": scope_to_json(&scope, None),
    })))
}

async fn list_scopes(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let rows: Vec<ScopeCountRow> = sqlx::query_as(
        "SELECT s.id, s.user_id, s.scope_kind, s.scope_name, s.description, s.is_default, \
         s.created_at, s.updated_at, COUNT(e.id) as entry_count \
         FROM memd_scopes s \
         LEFT JOIN memd_entries e ON e.scope_id = s.id AND e.user_id = s.user_id AND e.status = 'active' \
         WHERE s.user_id = ? \
         GROUP BY s.id, s.user_id, s.scope_kind, s.scope_name, s.description, s.is_default, s.created_at, s.updated_at \
         ORDER BY s.is_default DESC, s.updated_at DESC",
    )
    .bind(&session.user_id)
    .fetch_all(&state.db)
    .await?;

    let scopes: Vec<Value> = rows
        .into_iter()
        .map(|row| {
            let scope = MemdScopeRecord {
                id: row.0,
                user_id: row.1,
                kind: row.2,
                name: row.3,
                description: row.4,
                is_default: row.5 != 0,
                created_at: row.6,
                updated_at: row.7,
            };
            scope_to_json(&scope, Some(row.8))
        })
        .collect();

    Ok(success_json(json!({ "scopes": scopes })))
}

async fn list_audit(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Query(params): Query<AuditQuery>,
) -> Result<Json<Value>, AppError> {
    let limit = normalize_limit(params.limit, 20, 100);
    let rows: Vec<AuditRow> = if let Some(scope_id) = params.scope_id.as_deref() {
        sqlx::query_as(
            "SELECT id, user_id, action, scope_id, entry_id, details, created_at \
             FROM memd_audit \
             WHERE user_id = ? AND scope_id = ? \
             ORDER BY created_at DESC \
             LIMIT ?",
        )
        .bind(&session.user_id)
        .bind(scope_id)
        .bind(limit)
        .fetch_all(&state.db)
        .await?
    } else {
        sqlx::query_as(
            "SELECT id, user_id, action, scope_id, entry_id, details, created_at \
             FROM memd_audit \
             WHERE user_id = ? \
             ORDER BY created_at DESC \
             LIMIT ?",
        )
        .bind(&session.user_id)
        .bind(limit)
        .fetch_all(&state.db)
        .await?
    };

    let events: Vec<Value> = rows.iter().map(audit_to_json).collect();
    Ok(success_json(json!({ "events": events })))
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::SqlitePool;

    async fn setup_pool() -> SqlitePool {
        let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
        sqlx::query("PRAGMA foreign_keys = ON;")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query(
            "CREATE TABLE memd_scopes (
                id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                scope_kind TEXT NOT NULL,
                scope_name TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                is_default INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                PRIMARY KEY(id, user_id),
                UNIQUE(user_id, scope_kind, scope_name)
            )",
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query(
            "CREATE TABLE memd_entries (
                id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                scope_id TEXT NOT NULL,
                kind TEXT NOT NULL,
                title TEXT NOT NULL,
                content TEXT NOT NULL DEFAULT '',
                summary TEXT NOT NULL DEFAULT '',
                source TEXT NOT NULL,
                confidence INTEGER NOT NULL DEFAULT 50,
                priority INTEGER NOT NULL DEFAULT 0,
                retention_days INTEGER NOT NULL DEFAULT 30,
                version INTEGER NOT NULL DEFAULT 1,
                status TEXT NOT NULL DEFAULT 'active',
                metadata TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                archived_at TEXT,
                PRIMARY KEY(id, user_id),
                FOREIGN KEY(scope_id, user_id) REFERENCES memd_scopes(id, user_id) ON DELETE CASCADE
            )",
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query(
            "CREATE TABLE memd_audit (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                action TEXT NOT NULL,
                scope_id TEXT,
                entry_id TEXT,
                details TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL
            )",
        )
        .execute(&pool)
        .await
        .unwrap();
        pool
    }

    #[tokio::test]
    async fn scope_is_created_and_reused() {
        let pool = setup_pool().await;
        let scope = ensure_scope(
            &pool,
            "user-1",
            Some(&ScopeInput {
                kind: "agent".to_string(),
                name: "brain".to_string(),
                description: Some("Agent brain".to_string()),
            }),
        )
        .await
        .unwrap();

        let again = ensure_scope(
            &pool,
            "user-1",
            Some(&ScopeInput {
                kind: "agent".to_string(),
                name: "brain".to_string(),
                description: Some("Agent brain".to_string()),
            }),
        )
        .await
        .unwrap();

        assert_eq!(scope.id, again.id);
        assert_eq!(scope.kind, "agent");
    }

    #[tokio::test]
    async fn upsert_query_and_archive_roundtrip() {
        // This test intentionally avoids invoking the HTTP handlers because `AppState`
        // contains a `tauri::AppHandle` that cannot be safely constructed in unit tests.
        let pool = setup_pool().await;
        let scope = ensure_scope(&pool, "user-1", None).await.unwrap();

        let now = chrono::Utc::now().to_rfc3339();
        sqlx::query(
            "INSERT INTO memd_entries \
             (id, user_id, scope_id, kind, title, content, summary, source, confidence, priority, \
              retention_days, version, status, metadata, created_at, updated_at, archived_at) \
             VALUES (?, ?, ?, 'fact', 'New idea', 'This is the new brain note', 'Brain note', 'manual', 90, 30, 60, 1, 'active', ?, ?, ?, NULL)",
        )
        .bind("22222222-2222-4222-8222-222222222222")
        .bind("user-1")
        .bind(&scope.id)
        .bind(json!({ "topic": "brain" }).to_string())
        .bind(&now)
        .bind(&now)
        .execute(&pool)
        .await
        .unwrap();

        let queried = query_entry_rows(&pool, "user-1", Some(&scope.id), false, 10)
            .await
            .unwrap();
        assert!(queried.iter().any(|row| row.title == "New idea"));

        let res = sqlx::query(
            "UPDATE memd_entries SET status = 'archived', archived_at = ?, updated_at = ? \
             WHERE id = ? AND user_id = ?",
        )
        .bind(&now)
        .bind(&now)
        .bind("22222222-2222-4222-8222-222222222222")
        .bind("user-1")
        .execute(&pool)
        .await
        .unwrap();
        assert_eq!(res.rows_affected(), 1);

        let active_only = query_entry_rows(&pool, "user-1", Some(&scope.id), false, 10)
            .await
            .unwrap();
        assert!(!active_only
            .iter()
            .any(|row| row.id == "22222222-2222-4222-8222-222222222222"));

        let with_archived = query_entry_rows(&pool, "user-1", Some(&scope.id), true, 10)
            .await
            .unwrap();
        assert!(with_archived
            .iter()
            .any(|row| row.id == "22222222-2222-4222-8222-222222222222"));
    }
}
