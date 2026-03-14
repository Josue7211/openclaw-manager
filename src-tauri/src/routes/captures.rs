use axum::{extract::State, routing::post, Json, Router};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::error::AppError;
use crate::server::AppState;
use crate::supabase::SupabaseClient;

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
    Json(body): Json<QuickCaptureBody>,
) -> Result<Json<Value>, AppError> {
    let sb = SupabaseClient::from_state(&state)?;

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

    match capture_type {
        "Task" => {
            let row = sb
                .insert(
                    "todos",
                    json!({ "title": content, "completed": false, "created_at": now }),
                )
                .await?;
            let id = row.get("id").and_then(|v| v.as_i64()).map(|v| v.to_string()).unwrap_or_default();
            Ok(Json(json!({ "ok": true, "id": id })))
        }
        "Idea" => {
            let row = sb
                .insert(
                    "ideas",
                    json!({ "title": content, "status": "pending", "created_at": now }),
                )
                .await?;
            let id = row.get("id").and_then(|v| v.as_i64()).map(|v| v.to_string()).unwrap_or_default();
            Ok(Json(json!({ "ok": true, "id": id })))
        }
        _ => {
            // Note or Decision — try captures table, fall back to todos
            let captures_result = sb
                .insert(
                    "captures",
                    json!({ "title": content, "type": capture_type, "source": source, "created_at": now }),
                )
                .await;

            match captures_result {
                Ok(row) => {
                    let id = row.get("id").and_then(|v| v.as_i64()).map(|v| v.to_string()).unwrap_or_default();
                    Ok(Json(json!({ "ok": true, "id": id })))
                }
                Err(_) => {
                    // Fallback to todos table
                    let row = sb
                        .insert(
                            "todos",
                            json!({
                                "title": format!("[{capture_type}] {content}"),
                                "completed": false,
                                "created_at": now,
                            }),
                        )
                        .await?;
                    let id = row.get("id").and_then(|v| v.as_i64()).map(|v| v.to_string()).unwrap_or_default();
                    Ok(Json(json!({ "ok": true, "id": id })))
                }
            }
        }
    }
}
