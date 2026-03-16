use axum::{extract::{Query, State}, routing::get, Json, Router};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::error::AppError;
use crate::server::{AppState, RequireAuth};
use crate::supabase::SupabaseClient;
use crate::validation::{sanitize_postgrest_value, validate_uuid};

/// Build the workflow-notes router (list, create, mark as applied).
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
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Query(params): Query<WorkflowNotesQuery>,
) -> Result<Json<Value>, AppError> {
    let sb = SupabaseClient::from_state(&state)?;

    let mut query = "select=*&order=created_at.desc".to_string();
    if let Some(cat) = &params.category {
        sanitize_postgrest_value(cat)?;
        query.push_str(&format!("&category=eq.{cat}"));
    }

    let data = sb.select_as_user("workflow_notes", &query, &session.access_token).await?;
    Ok(Json(json!({ "notes": data })))
}

#[derive(Debug, Deserialize)]
struct PostWorkflowNoteBody {
    category: Option<String>,
    note: Option<String>,
}

async fn post_workflow_note(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Json(body): Json<PostWorkflowNoteBody>,
) -> Result<Json<Value>, AppError> {
    let sb = SupabaseClient::from_state(&state)?;

    let category = body.category.as_deref().unwrap_or("");
    let note = body.note.as_deref().unwrap_or("");
    if category.is_empty() || note.is_empty() {
        return Err(AppError::BadRequest("category and note required".into()));
    }

    let data = sb
        .insert_as_user("workflow_notes", json!({ "category": category, "note": note }), &session.access_token)
        .await?;
    Ok(Json(json!({ "note": data })))
}

#[derive(Debug, Deserialize)]
struct PatchWorkflowNoteBody {
    id: Option<Value>,
    applied: Option<Value>,
}

async fn patch_workflow_note(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Json(body): Json<PatchWorkflowNoteBody>,
) -> Result<Json<Value>, AppError> {
    let sb = SupabaseClient::from_state(&state)?;

    let id = body.id.as_ref()
        .and_then(|v| v.as_str())
        .ok_or_else(|| AppError::BadRequest("id required".into()))?;
    validate_uuid(id)?;
    let data = sb
        .update_as_user("workflow_notes", &format!("id=eq.{id}"), json!({ "applied": body.applied }), &session.access_token)
        .await?;
    Ok(Json(json!({ "note": data })))
}
