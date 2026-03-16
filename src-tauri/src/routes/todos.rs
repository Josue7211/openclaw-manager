use axum::{extract::State, routing::get, Json, Router};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::error::AppError;
use crate::server::{AppState, RequireAuth};
use crate::validation::validate_uuid;

// Supabase client kept as import for reference — will be removed once sync
// engine handles all push operations and other routes are migrated.
// use crate::supabase::SupabaseClient;

/// Build the todos router (offline-first: reads/writes local SQLite,
/// sync engine pushes to Supabase in the background).
pub fn router() -> Router<AppState> {
    Router::new().route(
        "/todos",
        get(get_todos)
            .post(post_todo)
            .patch(patch_todo)
            .delete(delete_todo),
    )
}

async fn get_todos(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let rows: Vec<(String, String, bool, Option<String>, String, String)> = sqlx::query_as(
        "SELECT id, text, done, due_date, created_at, updated_at \
         FROM todos \
         WHERE user_id = ? AND deleted_at IS NULL \
         ORDER BY created_at ASC",
    )
    .bind(&session.user_id)
    .fetch_all(&state.db)
    .await?;

    let todos: Vec<Value> = rows
        .iter()
        .map(|(id, text, done, due_date, created_at, updated_at)| {
            json!({
                "id": id,
                "text": text,
                "done": done,
                "due_date": due_date,
                "created_at": created_at,
                "updated_at": updated_at,
            })
        })
        .collect();

    Ok(Json(json!({ "todos": todos })))
}

#[derive(Debug, Deserialize)]
struct PostTodoBody {
    text: Option<String>,
}

async fn post_todo(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Json(body): Json<PostTodoBody>,
) -> Result<Json<Value>, AppError> {
    let text = body.text.as_deref().unwrap_or("").trim();
    if text.is_empty() {
        return Err(AppError::BadRequest("text required".into()));
    }

    let id = crate::routes::util::random_uuid();
    let now = chrono::Utc::now().to_rfc3339();

    sqlx::query(
        "INSERT INTO todos (id, user_id, text, done, created_at, updated_at) \
         VALUES (?, ?, ?, 0, ?, ?)",
    )
    .bind(&id)
    .bind(&session.user_id)
    .bind(text)
    .bind(&now)
    .bind(&now)
    .execute(&state.db)
    .await?;

    // Log for sync engine
    let payload = serde_json::to_string(&json!({
        "id": id,
        "user_id": session.user_id,
        "text": text,
        "done": false,
        "created_at": now,
        "updated_at": now,
    }))
    .map_err(|e| AppError::Internal(e.into()))?;

    crate::sync::log_mutation(&state.db, "todos", &id, "INSERT", Some(&payload))
        .await
        .map_err(|e| AppError::Internal(e.into()))?;

    Ok(Json(json!({
        "todo": [{
            "id": id,
            "text": text,
            "done": false,
            "created_at": now,
            "updated_at": now,
        }]
    })))
}

#[derive(Debug, Deserialize)]
struct PatchTodoBody {
    id: String,
    done: Option<bool>,
    due_date: Option<Value>,
}

async fn patch_todo(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Json(body): Json<PatchTodoBody>,
) -> Result<Json<Value>, AppError> {
    if body.done.is_none() && body.due_date.is_none() {
        return Err(AppError::BadRequest("nothing to update".into()));
    }
    validate_uuid(&body.id)?;

    let now = chrono::Utc::now().to_rfc3339();

    // Build dynamic UPDATE
    let mut sets = vec!["updated_at = ?"];
    if body.done.is_some() {
        sets.push("done = ?");
    }
    if body.due_date.is_some() {
        sets.push("due_date = ?");
    }
    let sql = format!(
        "UPDATE todos SET {} WHERE id = ? AND user_id = ?",
        sets.join(", ")
    );

    let mut query = sqlx::query(&sql).bind(&now);
    if let Some(done) = body.done {
        query = query.bind(done);
    }
    if let Some(ref due_date) = body.due_date {
        let due_str = match due_date {
            Value::String(s) => Some(s.clone()),
            Value::Null => None,
            _ => Some(due_date.to_string()),
        };
        query = query.bind(due_str);
    }
    query = query.bind(&body.id).bind(&session.user_id);
    query.execute(&state.db).await?;

    // Read back the updated row for the response and sync payload
    let row: Option<(String, String, bool, Option<String>, String, String)> = sqlx::query_as(
        "SELECT id, text, done, due_date, created_at, updated_at \
         FROM todos WHERE id = ? AND user_id = ?",
    )
    .bind(&body.id)
    .bind(&session.user_id)
    .fetch_optional(&state.db)
    .await?;

    let todo = match row {
        Some((id, text, done, due_date, created_at, updated_at)) => {
            let val = json!({
                "id": id,
                "user_id": session.user_id,
                "text": text,
                "done": done,
                "due_date": due_date,
                "created_at": created_at,
                "updated_at": updated_at,
            });

            // Log for sync
            let payload = serde_json::to_string(&val)
                .map_err(|e| AppError::Internal(e.into()))?;
            crate::sync::log_mutation(&state.db, "todos", &id, "UPDATE", Some(&payload))
                .await
                .map_err(|e| AppError::Internal(e.into()))?;

            json!([val])
        }
        None => json!([]),
    };

    Ok(Json(json!({ "todo": todo })))
}

#[derive(Debug, Deserialize)]
struct DeleteTodoBody {
    id: String,
}

async fn delete_todo(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Json(body): Json<DeleteTodoBody>,
) -> Result<Json<Value>, AppError> {
    validate_uuid(&body.id)?;

    // Soft-delete locally (mark deleted_at) so sync engine can propagate
    let now = chrono::Utc::now().to_rfc3339();
    sqlx::query(
        "UPDATE todos SET deleted_at = ?, updated_at = ? WHERE id = ? AND user_id = ?",
    )
    .bind(&now)
    .bind(&now)
    .bind(&body.id)
    .bind(&session.user_id)
    .execute(&state.db)
    .await?;

    // Log for sync — DELETE operation tells sync engine to delete remotely
    crate::sync::log_mutation(&state.db, "todos", &body.id, "DELETE", None)
        .await
        .map_err(|e| AppError::Internal(e.into()))?;

    Ok(Json(json!({ "ok": true })))
}

#[cfg(test)]
mod tests {
    #[test]
    fn post_todo_body_deserializes() {
        let json = r#"{"text": "buy milk"}"#;
        let body: super::PostTodoBody = serde_json::from_str(json).unwrap();
        assert_eq!(body.text.as_deref(), Some("buy milk"));
    }

    #[test]
    fn patch_todo_body_deserializes_done() {
        let json = r#"{"id": "550e8400-e29b-41d4-a716-446655440000", "done": true}"#;
        let body: super::PatchTodoBody = serde_json::from_str(json).unwrap();
        assert_eq!(body.done, Some(true));
        assert!(body.due_date.is_none());
    }

    #[test]
    fn patch_todo_body_deserializes_due_date() {
        let json = r#"{"id": "550e8400-e29b-41d4-a716-446655440000", "due_date": "2026-03-20"}"#;
        let body: super::PatchTodoBody = serde_json::from_str(json).unwrap();
        assert!(body.done.is_none());
        assert!(body.due_date.is_some());
    }

    #[test]
    fn delete_todo_body_deserializes() {
        let json = r#"{"id": "550e8400-e29b-41d4-a716-446655440000"}"#;
        let body: super::DeleteTodoBody = serde_json::from_str(json).unwrap();
        assert_eq!(body.id, "550e8400-e29b-41d4-a716-446655440000");
    }
}
