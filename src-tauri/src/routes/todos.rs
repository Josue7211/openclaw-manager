use axum::{extract::State, routing::get, Json, Router};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::error::AppError;
use crate::server::AppState;
use crate::supabase::SupabaseClient;

pub fn router() -> Router<AppState> {
    Router::new().route("/todos", get(get_todos).post(post_todo).patch(patch_todo).delete(delete_todo))
}

async fn get_todos(State(state): State<AppState>) -> Result<Json<Value>, AppError> {
    let sb = SupabaseClient::from_state(&state)?;
    let data = sb.select("todos", "select=*&order=created_at.asc").await?;
    Ok(Json(json!({ "todos": data })))
}

#[derive(Debug, Deserialize)]
struct PostTodoBody {
    text: Option<String>,
}

async fn post_todo(
    State(state): State<AppState>,
    Json(body): Json<PostTodoBody>,
) -> Result<Json<Value>, AppError> {
    let sb = SupabaseClient::from_state(&state)?;
    let text = body.text.as_deref().unwrap_or("").trim();
    if text.is_empty() {
        return Err(AppError::BadRequest("text required".into()));
    }
    let data = sb.insert("todos", json!({ "text": text })).await?;
    Ok(Json(json!({ "todo": data })))
}

#[derive(Debug, Deserialize)]
struct PatchTodoBody {
    id: String,
    done: Option<bool>,
    due_date: Option<Value>,
}

async fn patch_todo(
    State(state): State<AppState>,
    Json(body): Json<PatchTodoBody>,
) -> Result<Json<Value>, AppError> {
    let sb = SupabaseClient::from_state(&state)?;
    let mut update = serde_json::Map::new();
    if let Some(done) = body.done {
        update.insert("done".into(), json!(done));
    }
    if let Some(ref due_date) = body.due_date {
        update.insert("due_date".into(), due_date.clone());
    }
    if update.is_empty() {
        return Err(AppError::BadRequest("nothing to update".into()));
    }
    let data = sb
        .update("todos", &format!("id=eq.{}", body.id), Value::Object(update))
        .await?;
    Ok(Json(json!({ "todo": data })))
}

#[derive(Debug, Deserialize)]
struct DeleteTodoBody {
    id: String,
}

async fn delete_todo(
    State(state): State<AppState>,
    Json(body): Json<DeleteTodoBody>,
) -> Result<Json<Value>, AppError> {
    let sb = SupabaseClient::from_state(&state)?;
    sb.delete("todos", &format!("id=eq.{}", body.id)).await?;
    Ok(Json(json!({ "ok": true })))
}
