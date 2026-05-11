use axum::{
    extract::rejection::JsonRejection,
    extract::{Query, State},
    routing::get,
    Json, Router,
};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::error::AppError;
use crate::server::{AppState, RequireAuth};

const MAC_BRIDGE_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(4);

// ── Router ──────────────────────────────────────────────────────────────────

/// Build the reminders router (proxy to Mac-Bridge for Apple Reminders).
pub fn router() -> Router<AppState> {
    Router::new().route(
        "/reminders",
        get(get_reminders)
            .post(post_reminder)
            .patch(patch_reminder)
            .delete(delete_reminder),
    )
}

// ── Bridge helper ───────────────────────────────────────────────────────────

fn bridge_config(state: &AppState) -> Option<(String, String)> {
    let api_key = state.secret_or_default("MAC_BRIDGE_API_KEY");
    let host = state
        .secret("MAC_BRIDGE_HOST")
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .or_else(|| (!api_key.trim().is_empty()).then(|| "http://127.0.0.1:4100".to_string()))?;
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
    let mut req = client
        .request(method, &url)
        .timeout(MAC_BRIDGE_TIMEOUT)
        .header("Content-Type", "application/json");

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
        return Err(AppError::Internal(anyhow::anyhow!(
            "Bridge {status}: {text}"
        )));
    }

    res.json::<Value>()
        .await
        .map_err(|e| AppError::Internal(e.into()))
}

#[derive(Clone)]
struct BridgeCandidate {
    path: String,
    method: reqwest::Method,
    body: Option<Value>,
}

impl BridgeCandidate {
    fn new(path: impl Into<String>, method: reqwest::Method, body: Option<Value>) -> Self {
        Self {
            path: path.into(),
            method,
            body,
        }
    }
}

async fn bridge_fetch_first(
    client: &reqwest::Client,
    host: &str,
    api_key: &str,
    candidates: Vec<BridgeCandidate>,
) -> Result<Value, AppError> {
    let mut last_error: Option<AppError> = None;

    for candidate in candidates {
        match bridge_fetch(
            client,
            host,
            api_key,
            &candidate.path,
            candidate.method,
            candidate.body,
        )
        .await
        {
            Ok(value) => return Ok(value),
            Err(err) => last_error = Some(err),
        }
    }

    Err(last_error.unwrap_or_else(|| {
        AppError::Internal(anyhow::anyhow!(
            "No Mac Bridge reminder endpoint candidates"
        ))
    }))
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
        "priority": normalize_priority(r.get("priority")),
        "notes": r.get("notes").cloned().unwrap_or(Value::Null),
        "list": r.get("list")
            .or_else(|| r.get("listName"))
            .and_then(|v| v.as_str())
            .unwrap_or("Reminders"),
    })
}

fn normalize_priority(value: Option<&Value>) -> i64 {
    match value {
        Some(Value::Number(n)) => n.as_i64().unwrap_or(0),
        Some(Value::String(s)) => match s.trim().to_ascii_lowercase().as_str() {
            "high" => 1,
            "medium" => 5,
            "low" => 9,
            _ => 0,
        },
        _ => 0,
    }
}

// ── GET /api/reminders ──────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct RemindersQuery {
    filter: Option<String>,
}

async fn get_reminders(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Query(params): Query<RemindersQuery>,
) -> Result<Json<Value>, AppError> {
    let (host, api_key) = match bridge_config(&state) {
        Some(cfg) => cfg,
        None => {
            return Ok(Json(json!({
                "error": "bridge_not_configured",
                "message": "Set MAC_BRIDGE_HOST in Settings (e.g. http://your-mac-host:4100)",
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

    match bridge_fetch(
        &state.http,
        &host,
        &api_key,
        &path,
        reqwest::Method::GET,
        None,
    )
    .await
    {
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
            Ok(Json(json!({
                "error": "bridge_unreachable",
                "message": "Mac Bridge not reachable",
                "reminders": []
            })))
        }
    }
}

// ── PATCH /api/reminders ────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct PatchReminderBody {
    id: Option<String>,
    completed: Option<bool>,
    title: Option<String>,
    #[serde(rename = "dueDate")]
    due_date: Option<Value>,
    priority: Option<i64>,
    notes: Option<String>,
    list: Option<String>,
}

async fn patch_reminder(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Json(body): Json<PatchReminderBody>,
) -> Result<Json<Value>, AppError> {
    let (host, api_key) = match bridge_config(&state) {
        Some(cfg) => cfg,
        None => {
            return Err(AppError::Internal(anyhow::anyhow!("bridge_not_configured")));
        }
    };

    let id = body
        .id
        .as_deref()
        .ok_or_else(|| AppError::BadRequest("Missing id".into()))?;

    let encoded_id = urlencoding::encode(id);
    let mut patch = serde_json::Map::new();
    patch.insert("id".to_string(), json!(id));
    if let Some(completed) = body.completed {
        patch.insert("completed".to_string(), json!(completed));
    }
    if let Some(title) = body
        .title
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        patch.insert("title".to_string(), json!(title));
    }
    if let Some(due_date) = body.due_date {
        patch.insert("dueDate".to_string(), due_date);
    }
    if let Some(priority) = body.priority {
        patch.insert("priority".to_string(), json!(priority));
    }
    if let Some(notes) = body.notes {
        patch.insert("notes".to_string(), json!(notes));
    }
    if let Some(list) = body
        .list
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        patch.insert("list".to_string(), json!(list));
    }

    if patch.len() <= 1 {
        return Err(AppError::BadRequest("nothing to update".into()));
    }

    let patch_value = Value::Object(patch);
    let mut candidates = vec![
        BridgeCandidate::new(
            format!("/reminders/{encoded_id}"),
            reqwest::Method::PATCH,
            Some(patch_value.clone()),
        ),
        BridgeCandidate::new(
            "/reminders",
            reqwest::Method::PATCH,
            Some(patch_value.clone()),
        ),
        BridgeCandidate::new(
            "/reminders/update",
            reqwest::Method::POST,
            Some(patch_value.clone()),
        ),
    ];

    if body.completed == Some(true) {
        candidates.push(BridgeCandidate::new(
            "/reminders/complete",
            reqwest::Method::POST,
            Some(json!({ "ids": [id], "id": id })),
        ));
    } else if body.completed == Some(false) {
        candidates.push(BridgeCandidate::new(
            "/reminders/uncomplete",
            reqwest::Method::POST,
            Some(json!({ "ids": [id], "id": id })),
        ));
    }

    bridge_fetch_first(&state.http, &host, &api_key, candidates).await?;

    Ok(Json(json!({ "ok": true })))
}

// ── POST /api/reminders ─────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct PostReminderBody {
    title: Option<String>,
    #[serde(rename = "dueDate")]
    due_date: Option<Value>,
    priority: Option<i64>,
    notes: Option<String>,
    list: Option<String>,
}

async fn post_reminder(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Json(body): Json<PostReminderBody>,
) -> Result<Json<Value>, AppError> {
    let (host, api_key) = match bridge_config(&state) {
        Some(cfg) => cfg,
        None => {
            return Err(AppError::Internal(anyhow::anyhow!("bridge_not_configured")));
        }
    };

    let title = body.title.as_deref().unwrap_or("").trim();
    if title.is_empty() {
        return Err(AppError::BadRequest("title required".into()));
    }

    let payload = json!({
        "title": title,
        "dueDate": body.due_date.unwrap_or(Value::Null),
        "priority": body.priority.unwrap_or(0),
        "notes": body.notes.unwrap_or_default(),
        "list": body.list.as_deref().map(str::trim).filter(|s| !s.is_empty()).unwrap_or("Reminders"),
    });

    let data = bridge_fetch_first(
        &state.http,
        &host,
        &api_key,
        vec![
            BridgeCandidate::new("/reminders", reqwest::Method::POST, Some(payload.clone())),
            BridgeCandidate::new(
                "/reminders/create",
                reqwest::Method::POST,
                Some(payload.clone()),
            ),
        ],
    )
    .await?;

    let reminder = data
        .get("reminder")
        .or_else(|| {
            data.get("reminders")
                .and_then(|v| v.as_array())
                .and_then(|a| a.first())
        })
        .map(normalize_reminder);

    Ok(Json(json!({
        "ok": true,
        "reminder": reminder,
    })))
}

// ── DELETE /api/reminders ───────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct DeleteReminderBody {
    id: String,
}

#[derive(Debug, Deserialize, Default)]
struct DeleteReminderQuery {
    id: Option<String>,
}

async fn delete_reminder(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Query(query): Query<DeleteReminderQuery>,
    body: Result<Json<DeleteReminderBody>, JsonRejection>,
) -> Result<Json<Value>, AppError> {
    let (host, api_key) = match bridge_config(&state) {
        Some(cfg) => cfg,
        None => {
            return Err(AppError::Internal(anyhow::anyhow!("bridge_not_configured")));
        }
    };

    let id = match body {
        Ok(Json(body)) => body.id,
        Err(_) => query
            .id
            .ok_or_else(|| AppError::BadRequest("id required".into()))?,
    };
    let id = id.trim();
    if id.is_empty() {
        return Err(AppError::BadRequest("id required".into()));
    }

    let encoded_id = urlencoding::encode(id);
    bridge_fetch_first(
        &state.http,
        &host,
        &api_key,
        vec![
            BridgeCandidate::new(
                format!("/reminders/{encoded_id}"),
                reqwest::Method::DELETE,
                None,
            ),
            BridgeCandidate::new(
                format!("/reminders?id={encoded_id}"),
                reqwest::Method::DELETE,
                None,
            ),
            BridgeCandidate::new(
                "/reminders/delete",
                reqwest::Method::POST,
                Some(json!({ "ids": [id], "id": id })),
            ),
        ],
    )
    .await?;

    Ok(Json(json!({ "ok": true })))
}

#[cfg(test)]
mod tests {
    #[test]
    fn post_reminder_body_deserializes() {
        let json = r#"{"title":"Pay bill","dueDate":"2026-05-08","priority":1,"list":"Home"}"#;
        let body: super::PostReminderBody = serde_json::from_str(json).unwrap();
        assert_eq!(body.title.as_deref(), Some("Pay bill"));
        assert_eq!(body.priority, Some(1));
        assert_eq!(body.list.as_deref(), Some("Home"));
    }

    #[test]
    fn patch_reminder_body_deserializes_update_fields() {
        let json = r#"{"id":"abc","completed":false,"title":"New title","dueDate":"2026-05-08","notes":"n"}"#;
        let body: super::PatchReminderBody = serde_json::from_str(json).unwrap();
        assert_eq!(body.id.as_deref(), Some("abc"));
        assert_eq!(body.completed, Some(false));
        assert_eq!(body.title.as_deref(), Some("New title"));
        assert!(body.due_date.is_some());
        assert_eq!(body.notes.as_deref(), Some("n"));
    }

    #[test]
    fn delete_reminder_query_deserializes() {
        let query: super::DeleteReminderQuery = serde_urlencoded::from_str("id=abc123").unwrap();
        assert_eq!(query.id.as_deref(), Some("abc123"));
    }

    #[test]
    fn normalize_reminder_maps_bridge_strings() {
        let value = serde_json::json!({
            "id": "abc",
            "title": "Call",
            "isCompleted": false,
            "priority": "high",
            "listName": "Personal"
        });
        let normalized = super::normalize_reminder(&value);
        assert_eq!(normalized["priority"], 1);
        assert_eq!(normalized["list"], "Personal");
    }
}
