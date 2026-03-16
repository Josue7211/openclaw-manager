use axum::{extract::{Query, State}, routing::get, Json, Router};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::error::AppError;
use crate::server::AppState;
use crate::supabase::SupabaseClient;

/// Build the decisions router (CRUD with search).
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/decisions", get(get_decisions).post(post_decision).patch(patch_decision).delete(delete_decision))
}

// ── Decisions ───────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct DecisionsQuery {
    q: Option<String>,
}

async fn get_decisions(
    State(state): State<AppState>,
    Query(params): Query<DecisionsQuery>,
) -> Result<Json<Value>, AppError> {
    let sb = SupabaseClient::from_state(&state)?;

    let mut query = "select=*&order=created_at.desc".to_string();
    if let Some(q) = &params.q {
        let safe: String = q.chars().filter(|c| *c != ',' && *c != '(' && *c != ')').collect();
        query.push_str(&format!(
            "&or=(title.ilike.%25{safe}%25,decision.ilike.%25{safe}%25,rationale.ilike.%25{safe}%25)"
        ));
    }

    let data = sb.select("decisions", &query).await?;
    Ok(Json(json!({ "decisions": data })))
}

#[derive(Debug, Deserialize)]
struct PostDecisionBody {
    title: Option<String>,
    decision: Option<String>,
    alternatives: Option<String>,
    rationale: Option<String>,
    outcome: Option<String>,
    tags: Option<Value>,
    linked_mission_id: Option<Value>,
}

async fn post_decision(
    State(state): State<AppState>,
    Json(body): Json<PostDecisionBody>,
) -> Result<Json<Value>, AppError> {
    let sb = SupabaseClient::from_state(&state)?;

    let title = body.title.as_deref().unwrap_or("").trim();
    if title.is_empty() {
        return Err(AppError::BadRequest("title required".into()));
    }
    let decision_text = body.decision.as_deref().unwrap_or("").trim();
    if decision_text.is_empty() {
        return Err(AppError::BadRequest("decision required".into()));
    }
    let rationale = body.rationale.as_deref().unwrap_or("").trim();
    if rationale.is_empty() {
        return Err(AppError::BadRequest("rationale required".into()));
    }

    let data = sb
        .insert(
            "decisions",
            json!({
                "title": title,
                "decision": decision_text,
                "alternatives": body.alternatives.as_deref().map(|s| s.trim()).filter(|s| !s.is_empty()),
                "rationale": rationale,
                "outcome": body.outcome.as_deref().map(|s| s.trim()).filter(|s| !s.is_empty()),
                "tags": body.tags.clone().unwrap_or(json!([])),
                "linked_mission_id": body.linked_mission_id.clone(),
            }),
        )
        .await?;

    Ok(Json(json!({ "decision": data })))
}

#[derive(Debug, Deserialize)]
struct PatchDecisionBody {
    id: Option<Value>,
    title: Option<Value>,
    decision: Option<Value>,
    alternatives: Option<Value>,
    rationale: Option<Value>,
    outcome: Option<Value>,
    tags: Option<Value>,
    linked_mission_id: Option<Value>,
}

async fn patch_decision(
    State(state): State<AppState>,
    Json(body): Json<PatchDecisionBody>,
) -> Result<Json<Value>, AppError> {
    let sb = SupabaseClient::from_state(&state)?;

    let id = body.id.as_ref().ok_or_else(|| AppError::BadRequest("id required".into()))?;

    let mut update = json!({ "updated_at": chrono::Utc::now().to_rfc3339() });
    let obj = update.as_object_mut().unwrap();
    if let Some(v) = &body.title { obj.insert("title".into(), v.clone()); }
    if let Some(v) = &body.decision { obj.insert("decision".into(), v.clone()); }
    if let Some(v) = &body.alternatives { obj.insert("alternatives".into(), v.clone()); }
    if let Some(v) = &body.rationale { obj.insert("rationale".into(), v.clone()); }
    if let Some(v) = &body.outcome { obj.insert("outcome".into(), v.clone()); }
    if let Some(v) = &body.tags { obj.insert("tags".into(), v.clone()); }
    if let Some(v) = &body.linked_mission_id { obj.insert("linked_mission_id".into(), v.clone()); }

    let data = sb.update("decisions", &format!("id=eq.{id}"), update).await?;
    Ok(Json(json!({ "decision": data })))
}

async fn delete_decision(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, AppError> {
    let sb = SupabaseClient::from_state(&state)?;

    let id = body.get("id").ok_or_else(|| AppError::BadRequest("id required".into()))?;
    sb.delete("decisions", &format!("id=eq.{id}")).await?;
    Ok(Json(json!({ "ok": true })))
}
