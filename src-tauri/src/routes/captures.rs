use axum::{extract::State, routing::post, Json, Router};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::error::AppError;
use crate::server::{AppState, RequireAuth};

/// Build the quick-capture router (Note/Task/Idea/Decision inbox).
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/quick-capture", post(post_quick_capture))
}

// ── POST /api/quick-capture ─────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct QuickCaptureBody {
    content: Option<String>,
    #[serde(rename = "type")]
    capture_type: Option<String>,
    source: Option<String>,
}

async fn post_quick_capture(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Json(body): Json<QuickCaptureBody>,
) -> Result<Json<Value>, AppError> {
    let content = body.content.as_deref().unwrap_or("").trim().to_string();
    if content.is_empty() {
        return Err(AppError::BadRequest("content is required".into()));
    }

    let valid_types = ["Note", "Task", "Idea", "Decision"];
    let capture_type = body.capture_type.as_deref().unwrap_or("");
    if !valid_types.contains(&capture_type) {
        return Err(AppError::BadRequest(format!(
            "type must be one of: {}",
            valid_types.join(", ")
        )));
    }

    let now = chrono::Utc::now().to_rfc3339();
    let source = body.source.as_deref().unwrap_or("ios-shortcut");
    let id = crate::routes::util::random_uuid();

    match capture_type {
        "Task" => {
            // Insert into local todos table
            sqlx::query(
                "INSERT INTO todos (id, user_id, text, done, created_at, updated_at) \
                 VALUES (?, ?, ?, 0, ?, ?)",
            )
            .bind(&id)
            .bind(&session.user_id)
            .bind(&content)
            .bind(&now)
            .bind(&now)
            .execute(&state.db)
            .await?;

            let payload = serde_json::to_string(&json!({
                "id": id,
                "user_id": session.user_id,
                "text": content,
                "done": false,
                "created_at": now,
                "updated_at": now,
            }))
            .map_err(|e| AppError::Internal(e.into()))?;

            crate::sync::log_mutation(&state.db, "todos", &id, "INSERT", Some(&payload))
                .await
                .map_err(|e| AppError::Internal(e.into()))?;

            Ok(Json(json!({ "ok": true, "id": id })))
        }
        "Idea" => {
            // Insert into local ideas table
            sqlx::query(
                "INSERT INTO ideas (id, user_id, title, status, created_at, updated_at) \
                 VALUES (?, ?, ?, 'pending', ?, ?)",
            )
            .bind(&id)
            .bind(&session.user_id)
            .bind(&content)
            .bind(&now)
            .bind(&now)
            .execute(&state.db)
            .await?;

            let payload = serde_json::to_string(&json!({
                "id": id,
                "user_id": session.user_id,
                "title": content,
                "status": "pending",
                "created_at": now,
                "updated_at": now,
            }))
            .map_err(|e| AppError::Internal(e.into()))?;

            crate::sync::log_mutation(&state.db, "ideas", &id, "INSERT", Some(&payload))
                .await
                .map_err(|e| AppError::Internal(e.into()))?;

            Ok(Json(json!({ "ok": true, "id": id })))
        }
        _ => {
            // Note or Decision — insert into captures table
            sqlx::query(
                "INSERT INTO captures (id, user_id, title, type, source, created_at, updated_at) \
                 VALUES (?, ?, ?, ?, ?, ?, ?)",
            )
            .bind(&id)
            .bind(&session.user_id)
            .bind(&content)
            .bind(capture_type)
            .bind(source)
            .bind(&now)
            .bind(&now)
            .execute(&state.db)
            .await?;

            let payload = serde_json::to_string(&json!({
                "id": id,
                "user_id": session.user_id,
                "title": content,
                "type": capture_type,
                "source": source,
                "created_at": now,
                "updated_at": now,
            }))
            .map_err(|e| AppError::Internal(e.into()))?;

            crate::sync::log_mutation(&state.db, "captures", &id, "INSERT", Some(&payload))
                .await
                .map_err(|e| AppError::Internal(e.into()))?;

            Ok(Json(json!({ "ok": true, "id": id })))
        }
    }
}
