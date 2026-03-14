use axum::{extract::State, routing::get, Json, Router};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::error::AppError;
use crate::server::AppState;
use crate::supabase::SupabaseClient;

/// Stale-items threshold: items untouched for more than 3 days.
const STALE_DAYS: i64 = 3;

pub fn router() -> Router<AppState> {
    Router::new().route("/stale", get(get_stale).patch(patch_stale).delete(delete_stale))
}

// ── GET /stale ──────────────────────────────────────────────────────────────

async fn get_stale(State(state): State<AppState>) -> Result<Json<Value>, AppError> {
    let sb = SupabaseClient::from_state(&state)?;
    let cutoff = (chrono::Utc::now() - chrono::Duration::days(STALE_DAYS))
        .to_rfc3339_opts(chrono::SecondsFormat::Secs, true);

    let mut items: Vec<Value> = Vec::new();

    // Stale todos: not done, updated/created before cutoff
    if let Ok(todos) = sb
        .select(
            "todos",
            &format!(
                "select=id,text,created_at,updated_at&done=eq.false&order=updated_at.asc&updated_at=lt.{cutoff}"
            ),
        )
        .await
    {
        if let Some(arr) = todos.as_array() {
            for row in arr {
                items.push(json!({
                    "id": row.get("id"),
                    "text": row.get("text"),
                    "type": "todo",
                    "staleSince": row.get("updated_at").or(row.get("created_at")),
                }));
            }
        }
    }

    // Stale missions: pending or active, updated before cutoff
    if let Ok(missions) = sb
        .select(
            "missions",
            &format!(
                "select=id,title,status,created_at,updated_at&or=(status.eq.pending,status.eq.active)&order=updated_at.asc&updated_at=lt.{cutoff}"
            ),
        )
        .await
    {
        if let Some(arr) = missions.as_array() {
            for row in arr {
                items.push(json!({
                    "id": row.get("id"),
                    "title": row.get("title"),
                    "type": "mission",
                    "status": row.get("status"),
                    "staleSince": row.get("updated_at").or(row.get("created_at")),
                }));
            }
        }
    }

    // Stale ideas: pending, created before cutoff
    if let Ok(ideas) = sb
        .select(
            "ideas",
            &format!(
                "select=id,title,status,created_at,updated_at&status=eq.pending&order=created_at.asc&created_at=lt.{cutoff}"
            ),
        )
        .await
    {
        if let Some(arr) = ideas.as_array() {
            for row in arr {
                items.push(json!({
                    "id": row.get("id"),
                    "title": row.get("title"),
                    "type": "idea",
                    "status": row.get("status"),
                    "staleSince": row.get("updated_at").or(row.get("created_at")),
                }));
            }
        }
    }

    Ok(Json(json!({ "items": items })))
}

// ── PATCH /stale ────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct PatchStaleBody {
    id: String,
    #[serde(rename = "type")]
    item_type: String,
    action: String,
}

async fn patch_stale(
    State(state): State<AppState>,
    Json(body): Json<PatchStaleBody>,
) -> Result<Json<Value>, AppError> {
    let sb = SupabaseClient::from_state(&state)?;
    let query = format!("id=eq.{}", body.id);
    let now = chrono::Utc::now().to_rfc3339();

    match body.action.as_str() {
        "done" => {
            let table = type_to_table(&body.item_type)?;
            let update = match body.item_type.as_str() {
                "todo" => json!({ "done": true, "updated_at": now }),
                "mission" => json!({ "status": "done", "updated_at": now }),
                "idea" => json!({ "status": "approved", "updated_at": now }),
                _ => return Err(AppError::BadRequest("Invalid type".into())),
            };
            sb.update(table, &query, update).await?;
        }
        "snooze" => {
            let table = type_to_table(&body.item_type)?;
            sb.update(table, &query, json!({ "updated_at": now })).await?;
        }
        _ => return Err(AppError::BadRequest("action must be 'done' or 'snooze'".into())),
    }

    Ok(Json(json!({ "ok": true })))
}

// ── DELETE /stale ───────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct DeleteStaleBody {
    id: String,
    #[serde(rename = "type")]
    item_type: String,
}

async fn delete_stale(
    State(state): State<AppState>,
    Json(body): Json<DeleteStaleBody>,
) -> Result<Json<Value>, AppError> {
    let sb = SupabaseClient::from_state(&state)?;
    let table = type_to_table(&body.item_type)?;
    sb.delete(table, &format!("id=eq.{}", body.id)).await?;
    Ok(Json(json!({ "ok": true })))
}

// ── Helpers ─────────────────────────────────────────────────────────────────

fn type_to_table(item_type: &str) -> Result<&'static str, AppError> {
    match item_type {
        "todo" => Ok("todos"),
        "mission" => Ok("missions"),
        "idea" => Ok("ideas"),
        _ => Err(AppError::BadRequest(format!(
            "Unknown item type '{item_type}'. Must be todo, mission, or idea."
        ))),
    }
}
