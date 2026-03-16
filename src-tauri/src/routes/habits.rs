use axum::{extract::Query, extract::State, routing::get, Json, Router};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::error::AppError;
use crate::server::{AppState, RequireAuth};
use crate::supabase::SupabaseClient;
use crate::validation::{validate_date, validate_uuid};

// ── Router ──────────────────────────────────────────────────────────────────

/// Build the habits router (CRUD + daily entry toggling).
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/habits", get(get_habits).post(post_habit).delete(delete_habit))
        .route("/habits/entries", get(get_habit_entries).post(post_habit_entry))
}

// ── GET /api/habits ─────────────────────────────────────────────────────────

async fn get_habits(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let sb = SupabaseClient::from_state(&state)?;
    let data = sb
        .select_as_user("habits", "select=*&order=sort_order,created_at", &session.access_token)
        .await?;
    Ok(Json(json!({ "habits": data })))
}

// ── POST /api/habits ────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct PostHabitBody {
    name: Option<String>,
    emoji: Option<String>,
    color: Option<String>,
}

async fn post_habit(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Json(body): Json<PostHabitBody>,
) -> Result<Json<Value>, AppError> {
    let sb = SupabaseClient::from_state(&state)?;

    let name = body.name.as_deref().unwrap_or("").trim();
    if name.is_empty() {
        return Err(AppError::BadRequest("Name required".into()));
    }

    let data = sb
        .insert_as_user(
            "habits",
            json!({
                "name": name,
                "emoji": body.emoji.as_deref().unwrap_or("\u{2705}"),
                "color": body.color.as_deref().unwrap_or("#9b84ec"),
            }),
            &session.access_token,
        )
        .await?;

    Ok(Json(json!({ "habit": data })))
}

// ── DELETE /api/habits ──────────────────────────────────────────────────────

async fn delete_habit(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Json(body): Json<Value>,
) -> Result<Json<Value>, AppError> {
    let sb = SupabaseClient::from_state(&state)?;
    let id = body
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| AppError::BadRequest("id required".into()))?;
    validate_uuid(id)?;
    sb.delete_as_user("habits", &format!("id=eq.{id}"), &session.access_token).await?;
    Ok(Json(json!({ "ok": true })))
}

// ── GET /api/habits/entries ─────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct HabitEntriesQuery {
    since: Option<String>,
}

async fn get_habit_entries(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Query(params): Query<HabitEntriesQuery>,
) -> Result<Json<Value>, AppError> {
    let sb = SupabaseClient::from_state(&state)?;

    let mut query = "select=*&order=date".to_string();
    if let Some(since) = &params.since {
        validate_date(since)?;
        query.push_str(&format!("&date=gte.{since}"));
    }

    let data = sb.select_as_user("habit_entries", &query, &session.access_token).await?;
    Ok(Json(json!({ "entries": data })))
}

// ── POST /api/habits/entries (toggle) ───────────────────────────────────────

#[derive(Debug, Deserialize)]
struct PostHabitEntryBody {
    habit_id: Option<Value>,
    date: Option<String>,
}

async fn post_habit_entry(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Json(body): Json<PostHabitEntryBody>,
) -> Result<Json<Value>, AppError> {
    let sb = SupabaseClient::from_state(&state)?;
    let jwt = &session.access_token;

    let habit_id = body
        .habit_id
        .as_ref()
        .and_then(|v| v.as_str())
        .ok_or_else(|| AppError::BadRequest("habit_id and date required".into()))?;
    validate_uuid(habit_id)?;
    let date = body
        .date
        .as_deref()
        .ok_or_else(|| AppError::BadRequest("habit_id and date required".into()))?;
    validate_date(date)?;

    // Check if entry already exists
    let existing = sb
        .select_as_user(
            "habit_entries",
            &format!("select=id&habit_id=eq.{habit_id}&date=eq.{date}&limit=1"),
            jwt,
        )
        .await?;

    let existing_arr = existing.as_array();
    if let Some(rows) = existing_arr {
        if let Some(row) = rows.first() {
            // Toggle off — delete existing entry
            let existing_id = row
                .get("id")
                .and_then(|v| v.as_str())
                .ok_or_else(|| AppError::Internal(anyhow::anyhow!("Missing id on existing entry")))?;
            validate_uuid(existing_id)?;
            sb.delete_as_user("habit_entries", &format!("id=eq.{existing_id}"), jwt).await?;
            return Ok(Json(json!({ "done": false })));
        }
    }

    // Toggle on — insert new entry
    sb.insert_as_user("habit_entries", json!({ "habit_id": habit_id, "date": date }), jwt)
        .await?;
    Ok(Json(json!({ "done": true })))
}
