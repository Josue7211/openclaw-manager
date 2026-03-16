use axum::{extract::Query, extract::State, routing::get, Json, Router};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::error::AppError;
use crate::server::{AppState, RequireAuth};
use crate::supabase::SupabaseClient;
use crate::validation::{validate_date, validate_uuid};

// ── Router ──────────────────────────────────────────────────────────────────

/// Build the reviews router (daily reviews, weekly reviews, retrospectives).
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/daily-review", get(get_daily_review).post(post_daily_review))
        .route("/weekly-review", get(get_weekly_review).post(post_weekly_review))
        .route("/retrospectives", get(get_retrospectives).post(post_retrospective))
}

// ── GET /api/daily-review ───────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct DailyReviewQuery {
    date: Option<String>,
}

async fn get_daily_review(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Query(params): Query<DailyReviewQuery>,
) -> Result<Json<Value>, AppError> {
    let sb = SupabaseClient::from_state(&state)?;
    let jwt = &session.access_token;

    let date = params
        .date
        .unwrap_or_else(|| chrono::Utc::now().format("%Y-%m-%d").to_string());
    validate_date(&date)?;

    let data = sb
        .select_as_user(
            "daily_reviews",
            &format!("select=*&date=eq.{date}&order=created_at.desc&limit=1"),
            jwt,
        )
        .await?;

    let review = data
        .as_array()
        .and_then(|a| a.first())
        .cloned()
        .unwrap_or(Value::Null);

    Ok(Json(json!({ "review": review })))
}

// ── POST /api/daily-review ──────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct PostDailyReviewBody {
    date: Option<String>,
    accomplishments: Option<String>,
    priorities: Option<String>,
    notes: Option<String>,
}

async fn post_daily_review(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Json(body): Json<PostDailyReviewBody>,
) -> Result<Json<Value>, AppError> {
    let sb = SupabaseClient::from_state(&state)?;
    let jwt = &session.access_token;

    let date = body
        .date
        .as_deref()
        .ok_or_else(|| AppError::BadRequest("Missing date".into()))?;
    validate_date(date)?;

    // Upsert by date — check if a review already exists for this date
    let existing = sb
        .select_as_user(
            "daily_reviews",
            &format!("select=id&date=eq.{date}&limit=1"),
            jwt,
        )
        .await?;

    let review_data = json!({
        "date": date,
        "accomplishments": body.accomplishments.as_deref().unwrap_or(""),
        "priorities": body.priorities.as_deref().unwrap_or(""),
        "notes": body.notes.as_deref().unwrap_or(""),
    });

    let data = if let Some(row) = existing.as_array().and_then(|a| a.first()) {
        let id = row.get("id").and_then(|v| v.as_str())
            .ok_or_else(|| AppError::Internal(anyhow::anyhow!("Missing id")))?;
        validate_uuid(id)?;
        sb.update_as_user("daily_reviews", &format!("id=eq.{id}"), review_data, jwt).await?
    } else {
        sb.insert_as_user("daily_reviews", review_data, jwt).await?
    };

    Ok(Json(json!({ "review": data })))
}

// ── GET /api/weekly-review ──────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct WeeklyReviewQuery {
    week_start: Option<String>,
}

async fn get_weekly_review(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Query(params): Query<WeeklyReviewQuery>,
) -> Result<Json<Value>, AppError> {
    let sb = SupabaseClient::from_state(&state)?;
    let jwt = &session.access_token;

    let query = if let Some(week_start) = &params.week_start {
        validate_date(week_start)?;
        format!("select=*&order=week_start.desc&week_start=eq.{week_start}")
    } else {
        "select=*&order=week_start.desc&limit=10".to_string()
    };

    let data = sb.select_as_user("weekly_reviews", &query, jwt).await.unwrap_or(json!([]));
    Ok(Json(json!({ "reviews": data })))
}

// ── POST /api/weekly-review ─────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct PostWeeklyReviewBody {
    week_start: Option<String>,
    wins: Option<Value>,
    incomplete_count: Option<Value>,
    priorities: Option<Value>,
    reflection: Option<Value>,
}

async fn post_weekly_review(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Json(body): Json<PostWeeklyReviewBody>,
) -> Result<Json<Value>, AppError> {
    let sb = SupabaseClient::from_state(&state)?;
    let jwt = &session.access_token;

    let week_start = body
        .week_start
        .as_deref()
        .ok_or_else(|| AppError::BadRequest("week_start required".into()))?;
    validate_date(week_start)?;

    let review_data = json!({
        "week_start": week_start,
        "wins": body.wins,
        "incomplete_count": body.incomplete_count,
        "priorities": body.priorities,
        "reflection": body.reflection,
    });

    // Upsert by week_start
    let existing = sb
        .select_as_user(
            "weekly_reviews",
            &format!("select=id&week_start=eq.{week_start}&limit=1"),
            jwt,
        )
        .await?;

    let data = if let Some(row) = existing.as_array().and_then(|a| a.first()) {
        let id = row.get("id").and_then(|v| v.as_str())
            .ok_or_else(|| AppError::Internal(anyhow::anyhow!("Missing id")))?;
        validate_uuid(id)?;
        sb.update_as_user("weekly_reviews", &format!("id=eq.{id}"), review_data, jwt).await?
    } else {
        sb.insert_as_user("weekly_reviews", review_data, jwt).await?
    };

    Ok(Json(json!({ "review": data })))
}

// ── GET /api/retrospectives ─────────────────────────────────────────────────

async fn get_retrospectives(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let sb = SupabaseClient::from_state(&state)?;
    let data = sb
        .select_as_user("retrospectives", "select=*&order=created_at.desc", &session.access_token)
        .await?;
    Ok(Json(json!({ "retrospectives": data })))
}

// ── POST /api/retrospectives ────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct PostRetrospectiveBody {
    mission_id: Option<Value>,
    what_went_well: Option<Value>,
    what_went_wrong: Option<Value>,
    improvements: Option<Value>,
    tags: Option<Value>,
}

async fn post_retrospective(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Json(body): Json<PostRetrospectiveBody>,
) -> Result<Json<Value>, AppError> {
    let sb = SupabaseClient::from_state(&state)?;

    let mission_id = body
        .mission_id
        .as_ref()
        .and_then(|v| v.as_str())
        .ok_or_else(|| AppError::BadRequest("mission_id required".into()))?;
    validate_uuid(mission_id)?;

    let data = sb
        .insert_as_user(
            "retrospectives",
            json!({
                "mission_id": mission_id,
                "what_went_well": body.what_went_well,
                "what_went_wrong": body.what_went_wrong,
                "improvements": body.improvements,
                "tags": body.tags.clone().unwrap_or(json!([])),
            }),
            &session.access_token,
        )
        .await?;

    Ok(Json(json!({ "retrospective": data })))
}
