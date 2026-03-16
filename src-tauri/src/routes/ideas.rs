use axum::{extract::{Query, State}, routing::get, Json, Router};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::error::AppError;
use crate::server::AppState;
use crate::supabase::SupabaseClient;

/// Build the ideas router (CRUD with auto-mission creation on approval).
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/ideas", get(get_ideas).post(post_idea).patch(patch_idea).delete(delete_idea))
}

// ── Ideas ───────────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct IdeasQuery {
    status: Option<String>,
}

async fn get_ideas(
    State(state): State<AppState>,
    Query(params): Query<IdeasQuery>,
) -> Result<Json<Value>, AppError> {
    let sb = SupabaseClient::from_state(&state)?;

    let mut query = "select=*&order=created_at.desc".to_string();
    if let Some(status) = &params.status {
        query.push_str(&format!("&status=eq.{status}"));
    }

    let data = sb.select("ideas", &query).await?;
    Ok(Json(json!({ "ideas": data })))
}

#[derive(Debug, Deserialize)]
struct PostIdeaBody {
    title: Option<String>,
    description: Option<Value>,
    why: Option<Value>,
    effort: Option<Value>,
    impact: Option<Value>,
    category: Option<Value>,
}

async fn post_idea(
    State(state): State<AppState>,
    Json(body): Json<PostIdeaBody>,
) -> Result<Json<Value>, AppError> {
    let sb = SupabaseClient::from_state(&state)?;

    let title = body.title.as_deref().unwrap_or("").trim();
    if title.is_empty() {
        return Err(AppError::BadRequest("Title required".into()));
    }

    let data = sb
        .insert(
            "ideas",
            json!({
                "title": title,
                "description": body.description,
                "why": body.why,
                "effort": body.effort,
                "impact": body.impact,
                "category": body.category,
                "status": "pending",
            }),
        )
        .await?;

    Ok(Json(json!({ "idea": data })))
}

#[derive(Debug, Deserialize)]
struct PatchIdeaBody {
    id: Option<String>,
    status: Option<String>,
    mission_id: Option<Value>,
}

async fn patch_idea(
    State(state): State<AppState>,
    Json(body): Json<PatchIdeaBody>,
) -> Result<Json<Value>, AppError> {
    let sb = SupabaseClient::from_state(&state)?;

    let id = body.id.as_ref().ok_or_else(|| AppError::BadRequest("id required".into()))?;

    let mut update = serde_json::Map::new();
    if let Some(ref s) = body.status {
        update.insert("status".into(), json!(s));
    }
    if let Some(ref m) = body.mission_id {
        update.insert("mission_id".into(), m.clone());
    }

    if update.is_empty() {
        return Err(AppError::BadRequest(
            "At least one field (status or mission_id) must be provided".into(),
        ));
    }

    // If approving, auto-create a mission
    if body.status.as_deref() == Some("approved") {
        let idea_data = sb.select("ideas", &format!("select=*&id=eq.{id}")).await?;
        if let Some(idea) = idea_data.as_array().and_then(|a| a.first()) {
            let idea_title = idea.get("title").and_then(|v| v.as_str()).unwrap_or("Untitled");
            match sb
                .insert(
                    "missions",
                    json!({ "title": idea_title, "assignee": "koda", "status": "pending" }),
                )
                .await
            {
                Ok(mission) => {
                    if let Some(mid) = mission.get("id") {
                        update.insert("mission_id".into(), mid.clone());
                    }
                }
                Err(e) => {
                    tracing::error!("[ideas] Failed to create mission: {e}");
                }
            }
        }
    }

    let data = sb
        .update("ideas", &format!("id=eq.{id}"), Value::Object(update))
        .await?;
    Ok(Json(json!({ "idea": data })))
}

#[derive(Debug, Deserialize)]
struct DeleteIdeaParams {
    id: Option<String>,
}

async fn delete_idea(
    State(state): State<AppState>,
    axum::extract::Query(params): axum::extract::Query<DeleteIdeaParams>,
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

    let sb = SupabaseClient::from_state(&state)?;
    sb.delete("ideas", &format!("id=eq.{id}")).await?;
    Ok(Json(json!({ "ok": true })))
}
