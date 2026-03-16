use axum::{extract::State, Json};
use serde::Deserialize;
use serde_json::{json, Value};
use tracing::error;

use crate::error::AppError;
use crate::server::{AppState, RequireAuth};
use crate::validation::{sanitize_postgrest_value, validate_uuid};

use super::helpers::supabase;

// ── GET /pipeline-events ─────────────────────────────────────────────────────

pub(super) async fn get_pipeline_events(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let sb = supabase(&state)?;
    let data = sb
        .select_as_user(
            "pipeline_events",
            "select=*&order=created_at.desc&limit=50",
            &session.access_token,
        )
        .await
        .map_err(|e| {
            error!("pipeline_events select: {e}");
            AppError::Internal(anyhow::anyhow!("Database error"))
        })?;

    Ok(Json(json!({ "events": data })))
}

// ── POST /pipeline-events ────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub(super) struct PipelineEventBody {
    event_type: String,
    description: String,
    agent_id: Option<String>,
    mission_id: Option<String>,
    idea_id: Option<String>,
    metadata: Option<Value>,
}

pub(super) async fn post_pipeline_event(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Json(body): Json<PipelineEventBody>,
) -> Result<Json<Value>, AppError> {
    if body.event_type.is_empty() || body.description.is_empty() {
        return Err(AppError::BadRequest(
            "event_type and description required".into(),
        ));
    }
    if let Some(ref mid) = body.mission_id {
        validate_uuid(mid)?;
    }
    if let Some(ref aid) = body.agent_id {
        sanitize_postgrest_value(aid)?;
    }
    if let Some(ref iid) = body.idea_id {
        validate_uuid(iid)?;
    }

    let sb = supabase(&state)?;
    let row = json!({
        "event_type": body.event_type,
        "agent_id": body.agent_id,
        "mission_id": body.mission_id,
        "idea_id": body.idea_id,
        "description": body.description,
        "metadata": body.metadata,
    });

    let result = sb.insert_as_user("pipeline_events", row, &session.access_token).await.map_err(|e| {
        error!("pipeline_events insert: {e}");
        AppError::Internal(anyhow::anyhow!("Database error"))
    })?;

    // insert returns array; get first element
    let event = match &result {
        Value::Array(arr) if !arr.is_empty() => arr[0].clone(),
        other => other.clone(),
    };

    Ok(Json(json!({ "event": event })))
}
