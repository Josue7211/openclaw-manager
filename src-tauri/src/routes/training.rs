use axum::{
    extract::{Path, State},
    routing::{get, post},
    Json, Router,
};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::error::{success_json, AppError};
use crate::server::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/training/intake-links",
            get(list_intake_links).post(create_intake_link),
        )
        .route("/training/intake-submissions", get(list_intake_submissions))
        .route(
            "/training/intake-submissions/:id/applied",
            post(mark_submission_applied),
        )
        .route(
            "/training/public/intake/:token",
            get(public_get_intake).post(public_submit_intake),
        )
}

#[derive(Debug, Deserialize)]
struct CreateIntakeLinkBody {
    title: String,
    fields: Vec<String>,
    client_id: Option<String>,
    client_name: Option<String>,
    language: Option<String>,
    expires_in_days: Option<i64>,
}

async fn list_intake_links(State(state): State<AppState>) -> Result<Json<Value>, AppError> {
    ensure_intake_link_metadata_columns(&state).await?;
    let user_id = coaching_user_id();
    let rows: Vec<(
        String,
        String,
        String,
        String,
        String,
        String,
        String,
        bool,
        Option<String>,
        String,
        String,
    )> = sqlx::query_as(
        "SELECT id, token, title, fields_json, client_id, client_name, language, active, expires_at, created_at, updated_at \
         FROM training_intake_links \
         WHERE user_id = ? \
         ORDER BY created_at DESC",
    )
    .bind(&user_id)
    .fetch_all(&state.db)
    .await?;

    let links: Vec<Value> = rows
        .into_iter()
        .map(
            |(
                id,
                token,
                title,
                fields_json,
                client_id,
                client_name,
                language,
                active,
                expires_at,
                created_at,
                updated_at,
            )| {
                let fields = parse_fields(&fields_json);
                json!({
                    "id": id,
                    "token": token,
                    "title": title,
                    "fields": fields,
                    "clientId": client_id,
                    "clientName": client_name,
                    "language": language,
                    "active": active,
                    "expiresAt": expires_at,
                    "expired": expires_at.as_deref().is_some_and(is_expired),
                    "createdAt": created_at,
                    "updatedAt": updated_at,
                })
            },
        )
        .collect();

    Ok(success_json(json!({ "links": links })))
}

async fn create_intake_link(
    State(state): State<AppState>,
    Json(body): Json<CreateIntakeLinkBody>,
) -> Result<Json<Value>, AppError> {
    ensure_intake_link_metadata_columns(&state).await?;
    let user_id = coaching_user_id();
    let title = body.title.trim();
    if title.is_empty() {
        return Err(AppError::BadRequest("title required".into()));
    }
    let fields: Vec<String> = body
        .fields
        .into_iter()
        .map(|field| field.trim().to_string())
        .filter(|field| !field.is_empty())
        .collect();
    if fields.is_empty() {
        return Err(AppError::BadRequest("at least one field required".into()));
    }

    let id = crate::routes::util::random_uuid();
    let token = crate::routes::util::random_uuid().replace('-', "");
    let now = chrono::Utc::now().to_rfc3339();
    let expires_in_days = body.expires_in_days.unwrap_or(14).clamp(1, 90);
    let expires_at = (chrono::Utc::now() + chrono::Duration::days(expires_in_days)).to_rfc3339();
    let fields_json = serde_json::to_string(&fields).map_err(|e| AppError::Internal(e.into()))?;
    let client_id = body.client_id.unwrap_or_default().trim().to_string();
    let client_name = body.client_name.unwrap_or_default().trim().to_string();
    let language = normalize_language(body.language.as_deref());

    sqlx::query(
        "INSERT INTO training_intake_links (id, user_id, token, title, fields_json, client_id, client_name, language, active, expires_at, created_at, updated_at) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&user_id)
    .bind(&token)
    .bind(title)
    .bind(&fields_json)
    .bind(&client_id)
    .bind(&client_name)
    .bind(&language)
    .bind(&expires_at)
    .bind(&now)
    .bind(&now)
    .execute(&state.db)
    .await?;

    Ok(success_json(json!({
        "link": {
            "id": id,
            "token": token,
            "title": title,
            "fields": fields,
            "clientId": client_id,
            "clientName": client_name,
            "language": language,
            "active": true,
            "expiresAt": expires_at,
            "expired": false,
            "createdAt": now,
            "updatedAt": now,
        }
    })))
}

async fn list_intake_submissions(State(state): State<AppState>) -> Result<Json<Value>, AppError> {
    ensure_intake_link_metadata_columns(&state).await?;
    let user_id = coaching_user_id();
    let rows: Vec<(
        String,
        String,
        String,
        String,
        String,
        String,
        String,
        Option<String>,
        Option<String>,
    )> =
        sqlx::query_as(
            "SELECT s.id, s.link_id, l.title, s.client_id, s.client_name, s.answers_json, s.created_at, s.reviewed_at, s.applied_at \
             FROM training_intake_submissions s \
             JOIN training_intake_links l ON l.id = s.link_id \
             WHERE s.user_id = ? \
             ORDER BY s.created_at DESC",
        )
        .bind(&user_id)
        .fetch_all(&state.db)
        .await?;

    let submissions: Vec<Value> = rows
        .into_iter()
        .map(
            |(
                id,
                link_id,
                title,
                client_id,
                client_name,
                answers_json,
                created_at,
                reviewed_at,
                applied_at,
            )| {
                let answers: Value =
                    serde_json::from_str(&answers_json).unwrap_or_else(|_| json!({}));
                json!({
                    "id": id,
                    "linkId": link_id,
                    "title": title,
                    "clientId": client_id,
                    "clientName": client_name,
                    "answers": answers,
                    "createdAt": created_at,
                    "reviewedAt": reviewed_at,
                    "appliedAt": applied_at,
                })
            },
        )
        .collect();

    Ok(success_json(json!({ "submissions": submissions })))
}

async fn mark_submission_applied(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<Value>, AppError> {
    let now = chrono::Utc::now().to_rfc3339();
    let user_id = coaching_user_id();
    sqlx::query(
        "UPDATE training_intake_submissions \
         SET reviewed_at = COALESCE(reviewed_at, ?), applied_at = ? \
         WHERE id = ? AND user_id = ?",
    )
    .bind(&now)
    .bind(&now)
    .bind(&id)
    .bind(&user_id)
    .execute(&state.db)
    .await?;

    Ok(success_json(json!({ "id": id, "appliedAt": now })))
}

async fn public_get_intake(
    State(state): State<AppState>,
    Path(token): Path<String>,
) -> Result<Json<Value>, AppError> {
    ensure_intake_link_metadata_columns(&state).await?;
    let row: Option<(String, String, String, String, String, bool, Option<String>)> =
        sqlx::query_as(
            "SELECT id, title, fields_json, client_name, language, active, expires_at \
         FROM training_intake_links \
         WHERE token = ?",
        )
        .bind(&token)
        .fetch_optional(&state.db)
        .await?;

    let Some((id, title, fields_json, client_name, language, active, expires_at)) = row else {
        return Err(AppError::NotFound("intake form not found".into()));
    };
    if !active || expires_at.as_deref().is_some_and(is_expired) {
        return Err(AppError::Forbidden("intake form is closed".into()));
    }

    Ok(success_json(json!({
        "form": {
            "id": id,
            "token": token,
            "title": title,
            "fields": parse_fields(&fields_json),
            "clientName": client_name,
            "language": language,
            "expiresAt": expires_at,
        }
    })))
}

#[derive(Debug, Deserialize)]
struct PublicSubmitBody {
    answers: Value,
}

async fn public_submit_intake(
    State(state): State<AppState>,
    Path(token): Path<String>,
    Json(body): Json<PublicSubmitBody>,
) -> Result<Json<Value>, AppError> {
    ensure_intake_link_metadata_columns(&state).await?;
    let row: Option<(String, String, String, String, bool, Option<String>)> = sqlx::query_as(
        "SELECT id, user_id, client_id, client_name, active, expires_at \
         FROM training_intake_links \
         WHERE token = ?",
    )
    .bind(&token)
    .fetch_optional(&state.db)
    .await?;

    let Some((link_id, user_id, client_id, link_client_name, active, expires_at)) = row else {
        return Err(AppError::NotFound("intake form not found".into()));
    };
    if !active || expires_at.as_deref().is_some_and(is_expired) {
        return Err(AppError::Forbidden("intake form is closed".into()));
    }

    let answers = match body.answers {
        Value::Object(map) => Value::Object(map),
        _ => return Err(AppError::BadRequest("answers must be an object".into())),
    };
    let client_name = answers
        .get("Full name")
        .or_else(|| answers.get("Client name"))
        .or_else(|| answers.get("Name"))
        .and_then(Value::as_str)
        .unwrap_or(&link_client_name)
        .trim()
        .to_string();
    let answers_json = serde_json::to_string(&answers).map_err(|e| AppError::Internal(e.into()))?;
    let id = crate::routes::util::random_uuid();
    let now = chrono::Utc::now().to_rfc3339();

    sqlx::query(
        "INSERT INTO training_intake_submissions (id, user_id, link_id, token, client_id, client_name, answers_json, created_at) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&user_id)
    .bind(&link_id)
    .bind(&token)
    .bind(&client_id)
    .bind(&client_name)
    .bind(&answers_json)
    .bind(&now)
    .execute(&state.db)
    .await?;

    Ok(success_json(
        json!({ "submission": { "id": id, "createdAt": now } }),
    ))
}

fn parse_fields(fields_json: &str) -> Vec<String> {
    serde_json::from_str::<Vec<String>>(fields_json).unwrap_or_default()
}

fn normalize_language(language: Option<&str>) -> String {
    match language.unwrap_or("en").trim().to_lowercase().as_str() {
        "spanish" | "es" | "español" | "espanol" => "es".to_string(),
        _ => "en".to_string(),
    }
}

fn coaching_user_id() -> String {
    std::env::var("COACHING_USER_ID")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "user-1".to_string())
}

fn is_expired(expires_at: &str) -> bool {
    chrono::DateTime::parse_from_rfc3339(expires_at)
        .map(|dt| dt.with_timezone(&chrono::Utc) <= chrono::Utc::now())
        .unwrap_or(false)
}

async fn ensure_intake_link_metadata_columns(state: &AppState) -> Result<(), AppError> {
    sqlx::query(
        "ALTER TABLE training_intake_links ADD COLUMN client_name TEXT NOT NULL DEFAULT ''",
    )
    .execute(&state.db)
    .await
    .ok();
    sqlx::query("ALTER TABLE training_intake_links ADD COLUMN language TEXT NOT NULL DEFAULT 'en'")
        .execute(&state.db)
        .await
        .ok();
    sqlx::query("ALTER TABLE training_intake_links ADD COLUMN expires_at TEXT")
        .execute(&state.db)
        .await
        .ok();
    sqlx::query("ALTER TABLE training_intake_links ADD COLUMN client_id TEXT NOT NULL DEFAULT ''")
        .execute(&state.db)
        .await
        .ok();
    sqlx::query(
        "ALTER TABLE training_intake_submissions ADD COLUMN client_id TEXT NOT NULL DEFAULT ''",
    )
    .execute(&state.db)
    .await
    .ok();
    Ok(())
}
