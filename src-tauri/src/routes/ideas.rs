use axum::{extract::{Query, State}, routing::get, Json, Router};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::error::AppError;
use crate::server::{AppState, RequireAuth};
use crate::validation::validate_uuid;

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
    RequireAuth(session): RequireAuth,
    Query(params): Query<IdeasQuery>,
) -> Result<Json<Value>, AppError> {
    let rows: Vec<(
        String, String, Option<String>, Option<String>, Option<String>,
        Option<String>, Option<String>, String, Option<String>, Option<String>,
        String, String,
    )> = if let Some(ref status) = params.status {
        sqlx::query_as(
            "SELECT id, title, description, why, effort, \
             impact, category, status, priority, mission_id, \
             created_at, updated_at \
             FROM ideas WHERE user_id = ? AND deleted_at IS NULL AND status = ? \
             ORDER BY created_at DESC",
        )
        .bind(&session.user_id)
        .bind(status)
        .fetch_all(&state.db)
        .await?
    } else {
        sqlx::query_as(
            "SELECT id, title, description, why, effort, \
             impact, category, status, priority, mission_id, \
             created_at, updated_at \
             FROM ideas WHERE user_id = ? AND deleted_at IS NULL \
             ORDER BY created_at DESC",
        )
        .bind(&session.user_id)
        .fetch_all(&state.db)
        .await?
    };

    let ideas: Vec<Value> = rows
        .iter()
        .map(
            |(id, title, description, why, effort, impact, category, status, priority, mission_id, created_at, updated_at)| {
                json!({
                    "id": id,
                    "title": title,
                    "description": description,
                    "why": why,
                    "effort": effort,
                    "impact": impact,
                    "category": category,
                    "status": status,
                    "priority": priority,
                    "mission_id": mission_id,
                    "created_at": created_at,
                    "updated_at": updated_at,
                })
            },
        )
        .collect();

    Ok(Json(json!({ "ideas": ideas })))
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
    RequireAuth(session): RequireAuth,
    Json(body): Json<PostIdeaBody>,
) -> Result<Json<Value>, AppError> {
    let title = body.title.as_deref().unwrap_or("").trim();
    if title.is_empty() {
        return Err(AppError::BadRequest("Title required".into()));
    }

    let id = crate::routes::util::random_uuid();
    let now = chrono::Utc::now().to_rfc3339();
    let description = value_to_opt_string(&body.description);
    let why = value_to_opt_string(&body.why);
    let effort = value_to_opt_string(&body.effort);
    let impact = value_to_opt_string(&body.impact);
    let category = value_to_opt_string(&body.category);

    sqlx::query(
        "INSERT INTO ideas (id, user_id, title, description, why, effort, impact, category, status, created_at, updated_at) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)",
    )
    .bind(&id)
    .bind(&session.user_id)
    .bind(title)
    .bind(&description)
    .bind(&why)
    .bind(&effort)
    .bind(&impact)
    .bind(&category)
    .bind(&now)
    .bind(&now)
    .execute(&state.db)
    .await?;

    let idea = json!({
        "id": id,
        "title": title,
        "description": body.description,
        "why": body.why,
        "effort": body.effort,
        "impact": body.impact,
        "category": body.category,
        "status": "pending",
        "created_at": now,
        "updated_at": now,
    });

    let payload = serde_json::to_string(&json!({
        "id": id,
        "user_id": session.user_id,
        "title": title,
        "description": description,
        "why": why,
        "effort": effort,
        "impact": impact,
        "category": category,
        "status": "pending",
        "created_at": now,
        "updated_at": now,
    }))
    .map_err(|e| AppError::Internal(e.into()))?;

    crate::sync::log_mutation(&state.db, "ideas", &id, "INSERT", Some(&payload))
        .await
        .map_err(|e| AppError::Internal(e.into()))?;

    Ok(Json(json!({ "idea": idea })))
}

#[derive(Debug, Deserialize)]
struct PatchIdeaBody {
    id: Option<String>,
    status: Option<String>,
    mission_id: Option<Value>,
}

async fn patch_idea(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Json(body): Json<PatchIdeaBody>,
) -> Result<Json<Value>, AppError> {
    let id = body.id.as_ref().ok_or_else(|| AppError::BadRequest("id required".into()))?;
    validate_uuid(id)?;

    if body.status.is_none() && body.mission_id.is_none() {
        return Err(AppError::BadRequest(
            "At least one field (status or mission_id) must be provided".into(),
        ));
    }

    let now = chrono::Utc::now().to_rfc3339();
    let mut mission_id_to_set = body.mission_id.clone();

    // If approving, auto-create a mission in local SQLite
    if body.status.as_deref() == Some("approved") {
        let idea_row: Option<(String,)> = sqlx::query_as(
            "SELECT title FROM ideas WHERE id = ? AND user_id = ?",
        )
        .bind(id)
        .bind(&session.user_id)
        .fetch_optional(&state.db)
        .await?;

        if let Some((idea_title,)) = idea_row {
            let mission_id = crate::routes::util::random_uuid();
            sqlx::query(
                "INSERT INTO missions (id, user_id, title, assignee, status, progress, created_at, updated_at) \
                 VALUES (?, ?, ?, 'koda', 'pending', 0, ?, ?)",
            )
            .bind(&mission_id)
            .bind(&session.user_id)
            .bind(&idea_title)
            .bind(&now)
            .bind(&now)
            .execute(&state.db)
            .await?;

            let mission_payload = serde_json::to_string(&json!({
                "id": mission_id,
                "user_id": session.user_id,
                "title": idea_title,
                "assignee": "koda",
                "status": "pending",
                "progress": 0,
                "created_at": now,
                "updated_at": now,
            }))
            .map_err(|e| AppError::Internal(e.into()))?;

            crate::sync::log_mutation(&state.db, "missions", &mission_id, "INSERT", Some(&mission_payload))
                .await
                .map_err(|e| AppError::Internal(e.into()))?;

            mission_id_to_set = Some(json!(mission_id));
        }
    }

    // Build dynamic UPDATE
    let mut sets = vec!["updated_at = ?"];
    if body.status.is_some() { sets.push("status = ?"); }
    if mission_id_to_set.is_some() { sets.push("mission_id = ?"); }
    let sql = format!(
        "UPDATE ideas SET {} WHERE id = ? AND user_id = ?",
        sets.join(", ")
    );

    let mut query = sqlx::query(&sql).bind(&now);
    if let Some(ref status) = body.status { query = query.bind(status); }
    if let Some(ref mid) = mission_id_to_set {
        let mid_str = mid.as_str().map(|s| s.to_string()).or_else(|| {
            if mid.is_null() { None } else { Some(mid.to_string()) }
        });
        query = query.bind(mid_str);
    }
    query = query.bind(id).bind(&session.user_id);
    query.execute(&state.db).await?;

    // Read back updated row
    let updated: Option<(
        String, String, Option<String>, Option<String>, Option<String>,
        Option<String>, Option<String>, String, Option<String>, Option<String>,
        String, String,
    )> = sqlx::query_as(
        "SELECT id, title, description, why, effort, \
         impact, category, status, priority, mission_id, \
         created_at, updated_at \
         FROM ideas WHERE id = ? AND user_id = ?",
    )
    .bind(id)
    .bind(&session.user_id)
    .fetch_optional(&state.db)
    .await?;

    let idea = match updated {
        Some((
            rid, title, description, why, effort,
            impact, category, status, priority, mission_id,
            created_at, updated_at,
        )) => {
            let val = json!({
                "id": rid,
                "user_id": session.user_id,
                "title": title,
                "description": description,
                "why": why,
                "effort": effort,
                "impact": impact,
                "category": category,
                "status": status,
                "priority": priority,
                "mission_id": mission_id,
                "created_at": created_at,
                "updated_at": updated_at,
            });

            let payload = serde_json::to_string(&val)
                .map_err(|e| AppError::Internal(e.into()))?;
            crate::sync::log_mutation(&state.db, "ideas", &rid, "UPDATE", Some(&payload))
                .await
                .map_err(|e| AppError::Internal(e.into()))?;

            val
        }
        None => Value::Null,
    };

    Ok(Json(json!({ "idea": idea })))
}

#[derive(Debug, Deserialize)]
struct DeleteIdeaParams {
    id: Option<String>,
}

async fn delete_idea(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
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
    validate_uuid(&id)?;

    tracing::warn!(
        user_id = %session.user_id,
        table = "ideas",
        item_id = %id,
        "DLP: item deleted"
    );

    let now = chrono::Utc::now().to_rfc3339();
    sqlx::query(
        "UPDATE ideas SET deleted_at = ?, updated_at = ? WHERE id = ? AND user_id = ?",
    )
    .bind(&now)
    .bind(&now)
    .bind(&id)
    .bind(&session.user_id)
    .execute(&state.db)
    .await?;

    crate::sync::log_mutation(&state.db, "ideas", &id, "DELETE", None)
        .await
        .map_err(|e| AppError::Internal(e.into()))?;

    Ok(Json(json!({ "ok": true })))
}

/// Convert a serde_json::Value to an Option<String> for SQLite TEXT storage.
fn value_to_opt_string(val: &Option<Value>) -> Option<String> {
    match val {
        Some(Value::String(s)) => Some(s.clone()),
        Some(Value::Null) | None => None,
        Some(v) => Some(v.to_string()),
    }
}
