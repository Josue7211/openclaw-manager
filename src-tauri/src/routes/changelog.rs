use axum::{extract::State, routing::get, Json, Router};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::error::AppError;
use crate::server::AppState;
use crate::supabase::SupabaseClient;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/changelog", get(get_changelog).post(post_changelog).delete(delete_changelog))
}

// ── Changelog ───────────────────────────────────────────────────────────────

async fn get_changelog(State(state): State<AppState>) -> Result<Json<Value>, AppError> {
    let sb = SupabaseClient::from_state(&state)?;
    let data = sb.select("changelog_entries", "select=*&order=date.desc").await?;
    Ok(Json(json!({ "entries": data })))
}

#[derive(Debug, Deserialize)]
struct PostChangelogBody {
    title: Option<String>,
    date: Option<String>,
    description: Option<String>,
    tags: Option<Value>,
}

async fn post_changelog(
    State(state): State<AppState>,
    Json(body): Json<PostChangelogBody>,
) -> Result<Json<Value>, AppError> {
    let sb = SupabaseClient::from_state(&state)?;

    let title = body.title.as_deref().unwrap_or("").trim();
    if title.is_empty() {
        return Err(AppError::BadRequest("Title required".into()));
    }
    let date = body.date.as_deref().ok_or_else(|| AppError::BadRequest("Date required".into()))?;

    let data = sb
        .insert(
            "changelog_entries",
            json!({
                "title": title,
                "date": date,
                "description": body.description.as_deref().map(|s| s.trim()).unwrap_or(""),
                "tags": body.tags.clone().unwrap_or(json!([])),
            }),
        )
        .await?;

    Ok(Json(json!({ "entry": data })))
}

async fn delete_changelog(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, AppError> {
    let sb = SupabaseClient::from_state(&state)?;
    let id = body.get("id").ok_or_else(|| AppError::BadRequest("id required".into()))?;
    sb.delete("changelog_entries", &format!("id=eq.{id}")).await?;
    Ok(Json(json!({ "ok": true })))
}
