use axum::{extract::State, routing::get, Json, Router};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::error::AppError;
use crate::server::AppState;
use crate::supabase::SupabaseClient;
use crate::validation::{sanitize_postgrest_value, sanitize_search_query, validate_uuid};

/// Build the knowledge router (search, create, delete entries).
pub fn router() -> Router<AppState> {
    Router::new().route(
        "/knowledge",
        get(get_knowledge).post(post_knowledge).delete(delete_knowledge),
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
    axum::extract::Query(params): axum::extract::Query<GetKnowledgeParams>,
) -> Result<Json<Value>, AppError> {
    let sb = SupabaseClient::from_state(&state)?;

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

    let data = sb.select("knowledge_entries", &query).await?;
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
    Json(body): Json<PostKnowledgeBody>,
) -> Result<Json<Value>, AppError> {
    let sb = SupabaseClient::from_state(&state)?;

    let title = body.title.as_deref().unwrap_or("").trim();
    if title.is_empty() {
        return Err(AppError::BadRequest("title required".into()));
    }

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

    let data = sb.insert("knowledge_entries", Value::Object(row)).await?;
    Ok(Json(json!({ "entry": data })))
}

async fn delete_knowledge(
    State(state): State<AppState>,
    axum::extract::Query(params): axum::extract::Query<GetKnowledgeParams>,
) -> Result<Json<Value>, AppError> {
    let id = params
        .id
        .as_deref()
        .unwrap_or("")
        .trim()
        .to_string();
    if id.is_empty() {
        return Err(AppError::BadRequest("id required".into()));
    }
    validate_uuid(&id)?;

    let sb = SupabaseClient::from_state(&state)?;
    sb.delete("knowledge_entries", &format!("id=eq.{}", id)).await?;
    Ok(Json(json!({ "ok": true })))
}
