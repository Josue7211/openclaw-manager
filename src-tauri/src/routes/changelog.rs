use axum::{extract::State, routing::get, Json, Router};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::error::AppError;
use crate::server::{AppState, RequireAuth};
use crate::supabase::SupabaseClient;
use crate::validation::{validate_date, validate_uuid};

/// Build the changelog router (list, create, delete entries).
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/changelog", get(get_changelog).post(post_changelog).delete(delete_changelog))
}

// ── Changelog ───────────────────────────────────────────────────────────────

async fn get_changelog(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let sb = SupabaseClient::from_state(&state)?;
    let data = sb.select_as_user("changelog_entries", "select=*&order=date.desc", &session.access_token).await?;
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
    RequireAuth(session): RequireAuth,
    Json(body): Json<PostChangelogBody>,
) -> Result<Json<Value>, AppError> {
    let sb = SupabaseClient::from_state(&state)?;

    let title = body.title.as_deref().unwrap_or("").trim();
    if title.is_empty() {
        return Err(AppError::BadRequest("Title required".into()));
    }
    let date = body.date.as_deref().ok_or_else(|| AppError::BadRequest("Date required".into()))?;
    validate_date(date)?;

    let data = sb
        .insert_as_user(
            "changelog_entries",
            json!({
                "title": title,
                "date": date,
                "description": body.description.as_deref().map(|s| s.trim()).unwrap_or(""),
                "tags": body.tags.clone().unwrap_or(json!([])),
            }),
            &session.access_token,
        )
        .await?;

    Ok(Json(json!({ "entry": data })))
}

async fn delete_changelog(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Json(body): Json<Value>,
) -> Result<Json<Value>, AppError> {
    let sb = SupabaseClient::from_state(&state)?;
    let id = body.get("id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| AppError::BadRequest("id required".into()))?;
    validate_uuid(id)?;

    tracing::warn!(
        user_id = %session.user_id,
        table = "changelog_entries",
        item_id = %id,
        "DLP: item deleted"
    );

    sb.delete_as_user("changelog_entries", &format!("id=eq.{id}"), &session.access_token).await?;
    Ok(Json(json!({ "ok": true })))
}
