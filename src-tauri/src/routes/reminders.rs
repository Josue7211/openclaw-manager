use axum::{extract::Query, extract::State, routing::get, Json, Router};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::error::AppError;
use crate::server::AppState;

// ── Router ──────────────────────────────────────────────────────────────────

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/reminders", get(get_reminders).patch(patch_reminder))
}

// ── Bridge helper ───────────────────────────────────────────────────────────

fn bridge_config(state: &AppState) -> Option<(String, String)> {
    let host = state.secret_or_default("MAC_BRIDGE_HOST");
    if host.is_empty() {
        return None;
    }
    let api_key = state.secret_or_default("MAC_BRIDGE_API_KEY");
    Some((host, api_key))
}

async fn bridge_fetch(
    client: &reqwest::Client,
    host: &str,
    api_key: &str,
    path: &str,
    method: reqwest::Method,
    body: Option<Value>,
) -> Result<Value, AppError> {
    let url = format!("{host}{path}");
    let mut req = client.request(method, &url).header("Content-Type", "application/json");

    if !api_key.is_empty() {
        req = req.header("X-API-Key", api_key);
    }

    if let Some(b) = body {
        req = req.json(&b);
    }

    let res = req.send().await.map_err(|e| {
        tracing::error!("[reminders] Bridge request failed: {e}");
        AppError::Internal(anyhow::anyhow!("Failed to reach Mac Bridge"))
    })?;

    if !res.status().is_success() {
        let status = res.status();
        let text = res.text().await.unwrap_or_default();
        tracing::error!("[reminders] Bridge {status}: {text}");
        return Err(AppError::Internal(anyhow::anyhow!("Bridge {status}: {text}")));
    }

    res.json::<Value>().await.map_err(|e| AppError::Internal(e.into()))
}

/// Normalize a bridge reminder to a consistent shape.
fn normalize_reminder(r: &Value) -> Value {
    json!({
        "id": r.get("id").cloned().unwrap_or(Value::Null),
        "title": r.get("title").and_then(|v| v.as_str()).unwrap_or(""),
        "completed": r.get("completed").and_then(|v| v.as_bool())
            .or_else(|| r.get("isCompleted").and_then(|v| v.as_bool()))
            .unwrap_or(false),
        "dueDate": r.get("dueDate").cloned().unwrap_or(Value::Null),
        "priority": r.get("priority").and_then(|v| v.as_i64()).unwrap_or(0),
        "notes": r.get("notes").cloned().unwrap_or(Value::Null),
        "list": r.get("list").and_then(|v| v.as_str()).unwrap_or("Reminders"),
    })
}

// ── GET /api/reminders ──────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct RemindersQuery {
    filter: Option<String>,
}

async fn get_reminders(
    State(state): State<AppState>,
    Query(params): Query<RemindersQuery>,
) -> Result<Json<Value>, AppError> {
    let (host, api_key) = match bridge_config(&state) {
        Some(cfg) => cfg,
        None => {
            return Ok(Json(json!({
                "error": "bridge_not_configured",
                "message": "Set MAC_BRIDGE_HOST in Settings (e.g. http://macbook.tailnet.ts.net:4100)",
                "reminders": [],
            })));
        }
    };

    let valid_filters = ["all", "incomplete", "completed", "today"];
    let filter = params
        .filter
        .as_deref()
        .filter(|f| valid_filters.contains(f))
        .unwrap_or("all");

    let path = format!("/reminders?filter={filter}");

    match bridge_fetch(&state.http, &host, &api_key, &path, reqwest::Method::GET, None).await {
        Ok(data) => {
            let raw_list = if data.is_array() {
                data.as_array().cloned().unwrap_or_default()
            } else {
                data.get("reminders")
                    .and_then(|v| v.as_array())
                    .cloned()
                    .unwrap_or_default()
            };

            let reminders: Vec<Value> = raw_list.iter().map(normalize_reminder).collect();
            Ok(Json(json!({ "reminders": reminders, "source": "bridge" })))
        }
        Err(e) => {
            tracing::error!("[reminders] Error: {e:?}");
            Ok(Json(json!({ "error": "Failed to fetch reminders", "reminders": [] })))
        }
    }
}

// ── PATCH /api/reminders ────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct PatchReminderBody {
    id: Option<String>,
    completed: Option<bool>,
}

async fn patch_reminder(
    State(state): State<AppState>,
    Json(body): Json<PatchReminderBody>,
) -> Result<Json<Value>, AppError> {
    let (host, api_key) = match bridge_config(&state) {
        Some(cfg) => cfg,
        None => {
            return Err(AppError::Internal(anyhow::anyhow!("bridge_not_configured")));
        }
    };

    let id = body.id.as_deref().ok_or_else(|| AppError::BadRequest("Missing id".into()))?;

    if body.completed == Some(true) {
        bridge_fetch(
            &state.http,
            &host,
            &api_key,
            "/reminders/complete",
            reqwest::Method::POST,
            Some(json!({ "ids": [id] })),
        )
        .await?;
    }

    Ok(Json(json!({ "ok": true })))
}
