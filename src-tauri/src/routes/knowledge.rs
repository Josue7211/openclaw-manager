use axum::{extract::State, routing::get, Json, Router};
use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::Row;

use crate::error::AppError;
use crate::server::{AppState, RequireAuth};
use crate::supabase::SupabaseClient;
use crate::validation::{sanitize_postgrest_value, sanitize_search_query, validate_uuid};

/// Build the knowledge router (search, create, delete entries).
pub fn router() -> Router<AppState> {
    Router::new().route(
        "/knowledge",
        get(get_knowledge)
            .post(post_knowledge)
            .delete(delete_knowledge),
    )
}

#[derive(Debug, Deserialize)]
struct GetKnowledgeParams {
    q: Option<String>,
    tag: Option<String>,
    id: Option<String>,
}

async fn get_knowledge(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    axum::extract::Query(params): axum::extract::Query<GetKnowledgeParams>,
) -> Result<Json<Value>, AppError> {
    let Ok(sb) = SupabaseClient::from_state(&state) else {
        return get_local_knowledge(&state, &session.user_id, &params).await;
    };

    let mut query = String::from("select=*&order=created_at.desc");

    if let Some(ref q) = params.q {
        let q = q.trim();
        if !q.is_empty() {
            let safe_q = sanitize_search_query(q);
            // Search title and content with case-insensitive like
            query.push_str(&format!(
                "&or=(title.ilike.*{}*,content.ilike.*{}*)",
                safe_q, safe_q
            ));
        }
    }

    if let Some(ref tag) = params.tag {
        let tag = tag.trim();
        if !tag.is_empty() {
            sanitize_postgrest_value(tag)?;
            query.push_str(&format!("&tags=cs.{{{}}}", tag));
        }
    }

    let data = sb
        .select_as_user("knowledge_entries", &query, &session.access_token)
        .await?;
    Ok(Json(json!({ "entries": data })))
}

#[derive(Debug, Deserialize)]
struct PostKnowledgeBody {
    title: Option<String>,
    content: Option<String>,
    tags: Option<Vec<String>>,
    source_url: Option<String>,
    source_type: Option<String>,
}

async fn post_knowledge(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Json(body): Json<PostKnowledgeBody>,
) -> Result<Json<Value>, AppError> {
    let title = body.title.as_deref().unwrap_or("").trim().to_string();
    if title.is_empty() {
        return Err(AppError::BadRequest("title required".into()));
    }

    let Ok(sb) = SupabaseClient::from_state(&state) else {
        return post_local_knowledge(&state, &session.user_id, body, &title).await;
    };

    let mut row = serde_json::Map::new();
    row.insert("title".into(), json!(title));

    if let Some(ref content) = body.content {
        let content = content.trim();
        if !content.is_empty() {
            row.insert("content".into(), json!(content));
        }
    }

    if let Some(ref tags) = body.tags {
        row.insert("tags".into(), json!(tags));
    }

    if let Some(ref source_url) = body.source_url {
        let source_url = source_url.trim();
        if !source_url.is_empty() {
            row.insert("source_url".into(), json!(source_url));
        }
    }

    if let Some(ref source_type) = body.source_type {
        let source_type = source_type.trim();
        if !source_type.is_empty() {
            row.insert("source_type".into(), json!(source_type));
        }
    }

    let data = sb
        .insert_as_user(
            "knowledge_entries",
            Value::Object(row),
            &session.access_token,
        )
        .await?;
    Ok(Json(json!({ "entry": data })))
}

async fn delete_knowledge(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    axum::extract::Query(params): axum::extract::Query<GetKnowledgeParams>,
) -> Result<Json<Value>, AppError> {
    let id = params.id.as_deref().unwrap_or("").trim().to_string();
    if id.is_empty() {
        return Err(AppError::BadRequest("id required".into()));
    }
    validate_uuid(&id)?;

    tracing::warn!(
        user_id = %session.user_id,
        table = "knowledge_entries",
        item_id = %id,
        "DLP: item deleted"
    );

    if let Ok(sb) = SupabaseClient::from_state(&state) {
        sb.delete_as_user(
            "knowledge_entries",
            &format!("id=eq.{}", id),
            &session.access_token,
        )
        .await?;
    } else {
        archive_local_knowledge(&state, &session.user_id, &id).await?;
    }
    Ok(Json(json!({ "ok": true })))
}

async fn ensure_local_knowledge_scope(state: &AppState, user_id: &str) -> Result<String, AppError> {
    if let Some(row) = sqlx::query(
        "SELECT id FROM memd_scopes WHERE user_id = ? AND scope_kind = 'user' AND scope_name = 'knowledge'",
    )
    .bind(user_id)
    .fetch_optional(&state.db)
    .await?
    {
        return row.try_get("id").map_err(AppError::from);
    }

    let id = crate::routes::util::random_uuid();
    let now = chrono::Utc::now().to_rfc3339();
    sqlx::query(
        "INSERT INTO memd_scopes \
         (id, user_id, scope_kind, scope_name, description, is_default, created_at, updated_at) \
         VALUES (?, ?, 'user', 'knowledge', 'Built-in knowledge base', 0, ?, ?) \
         ON CONFLICT(user_id, scope_kind, scope_name) DO UPDATE SET updated_at = excluded.updated_at",
    )
    .bind(&id)
    .bind(user_id)
    .bind(&now)
    .bind(&now)
    .execute(&state.db)
    .await?;

    let row = sqlx::query(
        "SELECT id FROM memd_scopes WHERE user_id = ? AND scope_kind = 'user' AND scope_name = 'knowledge'",
    )
    .bind(user_id)
    .fetch_one(&state.db)
    .await?;
    row.try_get("id").map_err(AppError::from)
}

fn local_knowledge_json(row: &sqlx::sqlite::SqliteRow) -> Result<Value, AppError> {
    let metadata_text: String = row.try_get("metadata")?;
    let metadata = serde_json::from_str::<Value>(&metadata_text).unwrap_or_else(|_| json!({}));
    let source_url = metadata
        .get("source_url")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let source_type = metadata
        .get("source_type")
        .and_then(Value::as_str)
        .unwrap_or("memd");
    let tags = metadata
        .get("tags")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    Ok(json!({
        "id": row.try_get::<String, _>("id")?,
        "title": row.try_get::<String, _>("title")?,
        "content": row.try_get::<String, _>("content")?,
        "tags": tags,
        "source_url": if source_url.is_empty() { Value::Null } else { json!(source_url) },
        "source_type": source_type,
        "created_at": row.try_get::<String, _>("created_at")?,
        "updated_at": row.try_get::<String, _>("updated_at")?,
    }))
}

async fn get_local_knowledge(
    state: &AppState,
    user_id: &str,
    params: &GetKnowledgeParams,
) -> Result<Json<Value>, AppError> {
    let scope_id = ensure_local_knowledge_scope(state, user_id).await?;
    let rows = sqlx::query(
        "SELECT id, title, content, metadata, created_at, updated_at \
         FROM memd_entries \
         WHERE user_id = ? AND scope_id = ? AND status = 'active' AND kind = 'knowledge' \
         ORDER BY updated_at DESC \
         LIMIT 300",
    )
    .bind(user_id)
    .bind(&scope_id)
    .fetch_all(&state.db)
    .await?;

    let q = params
        .q
        .as_deref()
        .unwrap_or_default()
        .trim()
        .to_lowercase();
    let tag = params
        .tag
        .as_deref()
        .unwrap_or_default()
        .trim()
        .to_lowercase();
    let mut entries = Vec::new();
    for row in rows {
        let entry = local_knowledge_json(&row)?;
        if !q.is_empty() {
            let haystack = format!(
                "{} {}",
                entry.get("title").and_then(Value::as_str).unwrap_or(""),
                entry.get("content").and_then(Value::as_str).unwrap_or("")
            )
            .to_lowercase();
            if !haystack.contains(&q) {
                continue;
            }
        }
        if !tag.is_empty() {
            let has_tag = entry
                .get("tags")
                .and_then(Value::as_array)
                .map(|tags| {
                    tags.iter().any(|value| {
                        value
                            .as_str()
                            .map(|item| item.to_lowercase() == tag)
                            .unwrap_or(false)
                    })
                })
                .unwrap_or(false);
            if !has_tag {
                continue;
            }
        }
        entries.push(entry);
    }

    Ok(Json(json!({ "entries": entries })))
}

async fn post_local_knowledge(
    state: &AppState,
    user_id: &str,
    body: PostKnowledgeBody,
    title: &str,
) -> Result<Json<Value>, AppError> {
    let scope_id = ensure_local_knowledge_scope(state, user_id).await?;
    let id = crate::routes::util::random_uuid();
    let now = chrono::Utc::now().to_rfc3339();
    let content = body.content.as_deref().unwrap_or("").trim();
    let tags = body
        .tags
        .unwrap_or_default()
        .into_iter()
        .map(|tag| tag.trim().chars().take(80).collect::<String>())
        .filter(|tag| !tag.is_empty())
        .collect::<Vec<_>>();
    let source_url = body.source_url.as_deref().unwrap_or("").trim();
    let source_type = body.source_type.as_deref().unwrap_or("memd").trim();
    let metadata = json!({
        "tags": tags,
        "source_url": source_url,
        "source_type": if source_type.is_empty() { "memd" } else { source_type },
    });

    sqlx::query(
        "INSERT INTO memd_entries \
         (id, user_id, scope_id, kind, title, content, summary, source, confidence, priority, \
          retention_days, version, status, metadata, created_at, updated_at, archived_at) \
         VALUES (?, ?, ?, 'knowledge', ?, ?, ?, ?, 80, 20, 3650, 1, 'active', ?, ?, ?, NULL)",
    )
    .bind(&id)
    .bind(user_id)
    .bind(&scope_id)
    .bind(title)
    .bind(content)
    .bind(content.chars().take(400).collect::<String>())
    .bind(if source_url.is_empty() {
        "knowledge"
    } else {
        source_url
    })
    .bind(metadata.to_string())
    .bind(&now)
    .bind(&now)
    .execute(&state.db)
    .await?;

    let row = sqlx::query(
        "SELECT id, title, content, metadata, created_at, updated_at \
         FROM memd_entries WHERE user_id = ? AND id = ?",
    )
    .bind(user_id)
    .bind(&id)
    .fetch_one(&state.db)
    .await?;
    Ok(Json(json!({ "entry": local_knowledge_json(&row)? })))
}

async fn archive_local_knowledge(
    state: &AppState,
    user_id: &str,
    id: &str,
) -> Result<(), AppError> {
    let now = chrono::Utc::now().to_rfc3339();
    sqlx::query(
        "UPDATE memd_entries SET status = 'archived', archived_at = ?, updated_at = ? \
         WHERE user_id = ? AND id = ? AND kind = 'knowledge'",
    )
    .bind(&now)
    .bind(&now)
    .bind(user_id)
    .bind(id)
    .execute(&state.db)
    .await?;
    Ok(())
}
