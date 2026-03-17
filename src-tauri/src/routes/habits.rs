use axum::{extract::Query, extract::State, routing::get, Json, Router};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::error::AppError;
use crate::server::{AppState, RequireAuth};
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
    let rows: Vec<(String, String, String, String, i64, String, String)> = sqlx::query_as(
        "SELECT id, name, emoji, color, sort_order, created_at, updated_at \
         FROM habits WHERE user_id = ? AND deleted_at IS NULL \
         ORDER BY sort_order ASC, created_at ASC",
    )
    .bind(&session.user_id)
    .fetch_all(&state.db)
    .await?;

    let habits: Vec<Value> = rows
        .iter()
        .map(|(id, name, emoji, color, sort_order, created_at, updated_at)| {
            json!({
                "id": id,
                "name": name,
                "emoji": emoji,
                "color": color,
                "sort_order": sort_order,
                "created_at": created_at,
                "updated_at": updated_at,
            })
        })
        .collect();

    Ok(Json(json!({ "habits": habits })))
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
    let name = body.name.as_deref().unwrap_or("").trim();
    if name.is_empty() {
        return Err(AppError::BadRequest("Name required".into()));
    }

    let id = crate::routes::util::random_uuid();
    let now = chrono::Utc::now().to_rfc3339();
    let emoji = body.emoji.as_deref().unwrap_or("\u{2705}");
    let color = body.color.as_deref().unwrap_or("#9b84ec");

    sqlx::query(
        "INSERT INTO habits (id, user_id, name, emoji, color, created_at, updated_at) \
         VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&session.user_id)
    .bind(name)
    .bind(emoji)
    .bind(color)
    .bind(&now)
    .bind(&now)
    .execute(&state.db)
    .await?;

    let habit = json!({
        "id": id,
        "name": name,
        "emoji": emoji,
        "color": color,
        "created_at": now,
        "updated_at": now,
    });

    let payload = serde_json::to_string(&json!({
        "id": id,
        "user_id": session.user_id,
        "name": name,
        "emoji": emoji,
        "color": color,
        "created_at": now,
        "updated_at": now,
    }))
    .map_err(|e| AppError::Internal(e.into()))?;

    crate::sync::log_mutation(&state.db, "habits", &id, "INSERT", Some(&payload))
        .await
        .map_err(|e| AppError::Internal(e.into()))?;

    Ok(Json(json!({ "habit": habit })))
}

// ── DELETE /api/habits ──────────────────────────────────────────────────────

async fn delete_habit(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Json(body): Json<Value>,
) -> Result<Json<Value>, AppError> {
    let id = body
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| AppError::BadRequest("id required".into()))?;
    validate_uuid(id)?;

    tracing::warn!(
        user_id = %session.user_id,
        table = "habits",
        item_id = %id,
        "DLP: item deleted"
    );

    let now = chrono::Utc::now().to_rfc3339();
    sqlx::query(
        "UPDATE habits SET deleted_at = ?, updated_at = ? WHERE id = ? AND user_id = ?",
    )
    .bind(&now)
    .bind(&now)
    .bind(id)
    .bind(&session.user_id)
    .execute(&state.db)
    .await?;

    crate::sync::log_mutation(&state.db, "habits", id, "DELETE", None)
        .await
        .map_err(|e| AppError::Internal(e.into()))?;

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
    let rows: Vec<(String, String, String, String)> = if let Some(ref since) = params.since {
        validate_date(since)?;
        sqlx::query_as(
            "SELECT id, habit_id, date, created_at \
             FROM habit_entries WHERE user_id = ? AND deleted_at IS NULL AND date >= ? \
             ORDER BY date ASC",
        )
        .bind(&session.user_id)
        .bind(since)
        .fetch_all(&state.db)
        .await?
    } else {
        sqlx::query_as(
            "SELECT id, habit_id, date, created_at \
             FROM habit_entries WHERE user_id = ? AND deleted_at IS NULL \
             ORDER BY date ASC",
        )
        .bind(&session.user_id)
        .fetch_all(&state.db)
        .await?
    };

    let entries: Vec<Value> = rows
        .iter()
        .map(|(id, habit_id, date, created_at)| {
            json!({
                "id": id,
                "habit_id": habit_id,
                "date": date,
                "created_at": created_at,
            })
        })
        .collect();

    Ok(Json(json!({ "entries": entries })))
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
    let existing: Option<(String,)> = sqlx::query_as(
        "SELECT id FROM habit_entries \
         WHERE user_id = ? AND habit_id = ? AND date = ? AND deleted_at IS NULL \
         LIMIT 1",
    )
    .bind(&session.user_id)
    .bind(habit_id)
    .bind(date)
    .fetch_optional(&state.db)
    .await?;

    if let Some((existing_id,)) = existing {
        // Toggle off — soft-delete the entry
        let now = chrono::Utc::now().to_rfc3339();
        sqlx::query(
            "UPDATE habit_entries SET deleted_at = ?, updated_at = ? WHERE id = ? AND user_id = ?",
        )
        .bind(&now)
        .bind(&now)
        .bind(&existing_id)
        .bind(&session.user_id)
        .execute(&state.db)
        .await?;

        crate::sync::log_mutation(&state.db, "habit_entries", &existing_id, "DELETE", None)
            .await
            .map_err(|e| AppError::Internal(e.into()))?;

        return Ok(Json(json!({ "done": false })));
    }

    // Toggle on — insert new entry
    let id = crate::routes::util::random_uuid();
    let now = chrono::Utc::now().to_rfc3339();

    sqlx::query(
        "INSERT INTO habit_entries (id, user_id, habit_id, date, created_at, updated_at) \
         VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&session.user_id)
    .bind(habit_id)
    .bind(date)
    .bind(&now)
    .bind(&now)
    .execute(&state.db)
    .await?;

    let payload = serde_json::to_string(&json!({
        "id": id,
        "user_id": session.user_id,
        "habit_id": habit_id,
        "date": date,
        "created_at": now,
        "updated_at": now,
    }))
    .map_err(|e| AppError::Internal(e.into()))?;

    crate::sync::log_mutation(&state.db, "habit_entries", &id, "INSERT", Some(&payload))
        .await
        .map_err(|e| AppError::Internal(e.into()))?;

    Ok(Json(json!({ "done": true })))
}
