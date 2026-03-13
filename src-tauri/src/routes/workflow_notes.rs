use axum::{extract::{Query, State}, routing::get, Json, Router};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::error::AppError;
use crate::server::AppState;
use crate::supabase::SupabaseClient;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/workflow-notes", get(get_workflow_notes).post(post_workflow_note).patch(patch_workflow_note))
}

// ── Workflow Notes ──────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct WorkflowNotesQuery {
    category: Option<String>,
}

async fn get_workflow_notes(
    State(_state): State<AppState>,
    Query(params): Query<WorkflowNotesQuery>,
) -> Result<Json<Value>, AppError> {
    let sb = SupabaseClient::from_env()?;

    let mut query = "select=*&order=created_at.desc".to_string();
    if let Some(cat) = &params.category {
        query.push_str(&format!("&category=eq.{cat}"));
    }

    let data = sb.select("workflow_notes", &query).await?;
    Ok(Json(json!({ "notes": data })))
}

#[derive(Debug, Deserialize)]
struct PostWorkflowNoteBody {
    category: Option<String>,
    note: Option<String>,
}

async fn post_workflow_note(
    State(_state): State<AppState>,
    Json(body): Json<PostWorkflowNoteBody>,
) -> Result<Json<Value>, AppError> {
    let sb = SupabaseClient::from_env()?;

    let category = body.category.as_deref().unwrap_or("");
    let note = body.note.as_deref().unwrap_or("");
    if category.is_empty() || note.is_empty() {
        return Err(AppError::BadRequest("category and note required".into()));
    }

    let data = sb
        .insert("workflow_notes", json!({ "category": category, "note": note }))
        .await?;
    Ok(Json(json!({ "note": data })))
}

#[derive(Debug, Deserialize)]
struct PatchWorkflowNoteBody {
    id: Option<Value>,
    applied: Option<Value>,
}

async fn patch_workflow_note(
    State(_state): State<AppState>,
    Json(body): Json<PatchWorkflowNoteBody>,
) -> Result<Json<Value>, AppError> {
    let sb = SupabaseClient::from_env()?;

    let id = body.id.as_ref().ok_or_else(|| AppError::BadRequest("id required".into()))?;
    let data = sb
        .update("workflow_notes", &format!("id=eq.{id}"), json!({ "applied": body.applied }))
        .await?;
    Ok(Json(json!({ "note": data })))
}
