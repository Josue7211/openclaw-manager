use axum::{
    extract::State,
    routing::{get, post},
    Json, Router,
};
use reqwest::Method;
use serde::Deserialize;
use serde_json::{json, Value};
use tokio::time::Duration;

use crate::error::AppError;
use crate::server::{AppState, RequireAuth};
use crate::validation::validate_uuid;

use super::gateway::{gateway_forward, harness_api_key, harness_api_url};

/// Row type for agent queries (avoids clippy::type_complexity).
type AgentRow = (
    String,
    String,
    Option<String>,
    Option<String>,
    Option<String>,
    String,
    String,
    Option<String>,
    Option<String>,
    i64,
    String,
    String,
);

// ── Router ───────────────────────────────────────────────────────────────────

/// Build the agents router (CRUD + active-coders + subagent detection).
pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/agents",
            get(get_agents)
                .post(create_agent)
                .patch(update_agent)
                .delete(delete_agent),
        )
        .route("/agents/action", post(agent_action))
        .route("/agents/active-coders", get(active_coders))
        .route("/subagents/active", get(subagents_active))
}

// ── GET /agents ──────────────────────────────────────────────────────────────

async fn get_agents(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let rows: Vec<AgentRow> = sqlx::query_as(
        "SELECT id, name, display_name, emoji, role, \
         status, current_task, model, color, sort_order, \
         created_at, updated_at \
         FROM agents WHERE user_id = ? AND deleted_at IS NULL \
         ORDER BY sort_order ASC",
    )
    .bind(&session.user_id)
    .fetch_all(&state.db)
    .await?;

    let agents: Vec<Value> = rows
        .iter()
        .map(
            |(
                id,
                name,
                display_name,
                emoji,
                role,
                status,
                current_task,
                model,
                color,
                sort_order,
                created_at,
                updated_at,
            )| {
                json!({
                    "id": id,
                    "name": name,
                    "display_name": display_name,
                    "emoji": emoji,
                    "role": role,
                    "status": status,
                    "current_task": current_task,
                    "model": model,
                    "color": color,
                    "sort_order": sort_order,
                    "created_at": created_at,
                    "updated_at": updated_at,
                })
            },
        )
        .collect();

    Ok(Json(json!({ "agents": agents })))
}

// ── POST /agents ─────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct CreateAgentBody {
    display_name: Option<String>,
    emoji: Option<String>,
    role: Option<String>,
    model: Option<String>,
}

async fn create_agent(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Json(body): Json<CreateAgentBody>,
) -> Result<Json<Value>, AppError> {
    let display_name = body.display_name.as_deref().unwrap_or("New Agent").trim();
    let display_name = if display_name.is_empty() {
        "New Agent"
    } else {
        display_name
    };

    let id = crate::routes::util::random_uuid();

    // Generate system name from display_name: lowercase, replace spaces with
    // underscores, keep only alphanumeric + underscores, truncate to 32 chars.
    let name: String = display_name
        .to_lowercase()
        .chars()
        .map(|c| if c == ' ' { '_' } else { c })
        .filter(|c| c.is_ascii_alphanumeric() || *c == '_')
        .take(32)
        .collect();
    let name = if name.is_empty() {
        "agent".to_string()
    } else {
        name
    };

    let emoji = body.emoji.as_deref().unwrap_or("\u{1F916}");
    let role = body.role.as_deref().unwrap_or("");
    let model = body.model.as_deref().unwrap_or("");

    // Next sort_order
    let (next_sort,): (i64,) = sqlx::query_as(
        "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM agents \
         WHERE user_id = ? AND deleted_at IS NULL",
    )
    .bind(&session.user_id)
    .fetch_one(&state.db)
    .await?;

    let now = chrono::Utc::now().to_rfc3339();

    sqlx::query(
        "INSERT INTO agents (id, user_id, name, display_name, emoji, role, \
         status, current_task, model, color, sort_order, created_at, updated_at) \
         VALUES (?, ?, ?, ?, ?, ?, 'idle', '', ?, NULL, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&session.user_id)
    .bind(&name)
    .bind(display_name)
    .bind(emoji)
    .bind(role)
    .bind(model)
    .bind(next_sort)
    .bind(&now)
    .bind(&now)
    .execute(&state.db)
    .await?;

    let agent_val = json!({
        "id": id,
        "name": name,
        "display_name": display_name,
        "emoji": emoji,
        "role": role,
        "status": "idle",
        "current_task": "",
        "model": model,
        "color": null,
        "sort_order": next_sort,
        "created_at": now,
        "updated_at": now,
    });

    let payload = serde_json::to_string(&agent_val).map_err(|e| AppError::Internal(e.into()))?;
    crate::sync::log_mutation(&state.db, "agents", &id, "INSERT", Some(&payload))
        .await
        .map_err(|e| AppError::Internal(e.into()))?;

    crate::audit::log_audit_or_warn(
        &state.db,
        &session.user_id,
        "create",
        "agents",
        Some(&id),
        None,
    )
    .await;

    Ok(Json(json!({ "agent": agent_val })))
}

// ── DELETE /agents ───────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct DeleteAgentBody {
    id: String,
}

async fn delete_agent(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Json(body): Json<DeleteAgentBody>,
) -> Result<Json<Value>, AppError> {
    // Do NOT use validate_uuid -- seed agents have short string IDs like 'koda'
    if body.id.is_empty() || body.id.len() > 100 {
        return Err(AppError::BadRequest("invalid agent id".into()));
    }

    tracing::warn!(
        user_id = %session.user_id,
        table = "agents",
        item_id = %body.id,
        "DLP: item deleted"
    );

    let now = chrono::Utc::now().to_rfc3339();
    let result = sqlx::query(
        "UPDATE agents SET deleted_at = ?, updated_at = ? \
         WHERE id = ? AND user_id = ? AND deleted_at IS NULL",
    )
    .bind(&now)
    .bind(&now)
    .bind(&body.id)
    .bind(&session.user_id)
    .execute(&state.db)
    .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::BadRequest(
            "agent not found or already deleted".into(),
        ));
    }

    crate::sync::log_mutation(&state.db, "agents", &body.id, "DELETE", None)
        .await
        .map_err(|e| AppError::Internal(e.into()))?;

    crate::audit::log_audit_or_warn(
        &state.db,
        &session.user_id,
        "delete",
        "agents",
        Some(&body.id),
        None,
    )
    .await;

    Ok(Json(json!({ "ok": true })))
}

// ── POST /agents/action ──────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct AgentActionBody {
    id: String,
    action: String,
}

async fn agent_action(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Json(body): Json<AgentActionBody>,
) -> Result<Json<Value>, AppError> {
    if body.id.is_empty() {
        return Err(AppError::BadRequest("id required".into()));
    }
    if !["start", "stop", "restart"].contains(&body.action.as_str()) {
        return Err(AppError::BadRequest(
            "action must be start, stop, or restart".into(),
        ));
    }

    let result = gateway_forward(
        &state,
        Method::POST,
        &format!("/agents/{}/action", body.id),
        Some(json!({ "action": body.action })),
    )
    .await?;

    Ok(Json(result))
}

// ── PATCH /agents ────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct UpdateAgentBody {
    id: Option<String>,
    display_name: Option<String>,
    emoji: Option<String>,
    role: Option<String>,
    status: Option<String>,
    current_task: Option<String>,
    color: Option<String>,
    model: Option<String>,
    sort_order: Option<Value>,
}

async fn update_agent(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Json(body): Json<UpdateAgentBody>,
) -> Result<Json<Value>, AppError> {
    let id = body
        .id
        .as_deref()
        .ok_or_else(|| AppError::BadRequest("id required".into()))?;
    validate_uuid(id)?;

    let now = chrono::Utc::now().to_rfc3339();

    // Build dynamic UPDATE from allowed fields
    let mut sets = vec!["updated_at = ?"];
    if body.display_name.is_some() {
        sets.push("display_name = ?");
    }
    if body.emoji.is_some() {
        sets.push("emoji = ?");
    }
    if body.role.is_some() {
        sets.push("role = ?");
    }
    if body.status.is_some() {
        sets.push("status = ?");
    }
    if body.current_task.is_some() {
        sets.push("current_task = ?");
    }
    if body.color.is_some() {
        sets.push("color = ?");
    }
    if body.model.is_some() {
        sets.push("model = ?");
    }
    if body.sort_order.is_some() {
        sets.push("sort_order = ?");
    }

    let sql = format!(
        "UPDATE agents SET {} WHERE id = ? AND user_id = ?",
        sets.join(", ")
    );

    let mut query = sqlx::query(&sql).bind(&now);
    if let Some(ref v) = body.display_name {
        query = query.bind(v);
    }
    if let Some(ref v) = body.emoji {
        query = query.bind(v);
    }
    if let Some(ref v) = body.role {
        query = query.bind(v);
    }
    if let Some(ref v) = body.status {
        query = query.bind(v);
    }
    if let Some(ref v) = body.current_task {
        query = query.bind(v);
    }
    if let Some(ref v) = body.color {
        query = query.bind(v);
    }
    if let Some(ref v) = body.model {
        query = query.bind(v);
    }
    if let Some(ref v) = body.sort_order {
        let sort_val = v.as_i64().unwrap_or(0);
        query = query.bind(sort_val);
    }
    query = query.bind(id).bind(&session.user_id);
    query.execute(&state.db).await?;

    // Read back the updated row
    let row: Option<AgentRow> = sqlx::query_as(
        "SELECT id, name, display_name, emoji, role, \
         status, current_task, model, color, sort_order, \
         created_at, updated_at \
         FROM agents WHERE id = ? AND user_id = ?",
    )
    .bind(id)
    .bind(&session.user_id)
    .fetch_optional(&state.db)
    .await?;

    let agent = match row {
        Some((
            rid,
            name,
            display_name,
            emoji,
            role,
            status,
            current_task,
            model,
            color,
            sort_order,
            created_at,
            updated_at,
        )) => {
            let val = json!({
                "id": rid,
                "user_id": session.user_id,
                "name": name,
                "display_name": display_name,
                "emoji": emoji,
                "role": role,
                "status": status,
                "current_task": current_task,
                "model": model,
                "color": color,
                "sort_order": sort_order,
                "created_at": created_at,
                "updated_at": updated_at,
            });

            let payload = serde_json::to_string(&val).map_err(|e| AppError::Internal(e.into()))?;
            crate::sync::log_mutation(&state.db, "agents", &rid, "UPDATE", Some(&payload))
                .await
                .map_err(|e| AppError::Internal(e.into()))?;

            val
        }
        None => Value::Null,
    };

    // Sync model change to harness via API (fire-and-forget)
    if let Some(model) = &body.model {
        if !model.is_empty() {
            if let Some(base) = harness_api_url(&state) {
                let url = format!("{}/agents/model", base);
                let key = harness_api_key(&state);
                let agent_id = id.to_string();
                let model_clone = model.clone();
                tokio::spawn(async move {
                    let client = reqwest::Client::builder()
                        .timeout(Duration::from_secs(15))
                        .build()
                        .ok();
                    if let Some(client) = client {
                        let mut req = client
                            .post(&url)
                            .json(&json!({"agentId": agent_id, "model": model_clone}));
                        if !key.is_empty() {
                            req = req.header("Authorization", format!("Bearer {}", key));
                        }
                        if let Err(e) = req.send().await {
                            tracing::warn!("Failed to sync agent model to harness: {}", e);
                        }
                    }
                });
            }
        }
    }

    Ok(Json(json!({ "agent": agent })))
}

// ── GET /agents/active-coders ────────────────────────────────────────────────
//
// Reports active Hermes/harness coding sessions while preserving the legacy
// response shape expected by older dashboard widgets.

async fn active_coders(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let sessions = match fetch_harness_sessions(&state.http).await {
        Ok(sessions) => sessions,
        Err(_) => {
            return Ok(Json(json!({
                "total": 0,
                "kodaActive": false,
                "subagents": [],
            })));
        }
    };

    let active_sessions: Vec<&Value> = sessions
        .iter()
        .filter(|session| {
            matches!(
                session.get("status").and_then(|v| v.as_str()),
                Some("running" | "active")
            )
        })
        .collect();
    let subagents: Vec<Value> = active_sessions
        .iter()
        .enumerate()
        .map(|(index, session)| {
            let id = session
                .get("id")
                .or(session.get("sessionKey"))
                .and_then(|v| v.as_str())
                .map(str::to_string)
                .unwrap_or_else(|| format!("session-{index}"));
            let name = session
                .get("label")
                .or(session.get("agentId"))
                .and_then(|v| v.as_str())
                .unwrap_or("Hermes Agent");
            let model = session
                .get("model")
                .and_then(|v| v.as_str())
                .unwrap_or("hermes-agent");
            let task = session
                .get("task")
                .or(session.get("title"))
                .and_then(|v| v.as_str())
                .unwrap_or("(running)");
            json!({
                "id": id,
                "name": name,
                "model": model,
                "status": "active",
                "task": task,
                "temp": false,
            })
        })
        .collect();

    Ok(Json(json!({
        "total": active_sessions.len(),
        "kodaActive": !active_sessions.is_empty(),
        "subagents": subagents,
    })))
}

// ── GET /subagents/active ────────────────────────────────────────────────────
//
// Reports active Hermes/harness subagent sessions.

#[derive(Debug, serde::Serialize)]
struct ActiveTask {
    id: String,
    label: String,
    #[serde(rename = "agentId")]
    agent_id: String,
    #[serde(rename = "startedAt")]
    started_at: String,
}

async fn subagents_active(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let mut tasks: Vec<ActiveTask> = Vec::new();

    match fetch_harness_sessions(&state.http).await {
        Ok(sessions) => {
            for session in sessions {
                let agent_id = session
                    .get("agentId")
                    .and_then(|v| v.as_str())
                    .unwrap_or("coding");

                // Skip if we already have a task for this agentId
                if tasks.iter().any(|t| t.agent_id == agent_id) {
                    continue;
                }

                let kind = session.get("kind").and_then(|v| v.as_str()).unwrap_or("");
                let status = session.get("status").and_then(|v| v.as_str()).unwrap_or("");

                if kind == "subagent" && (status == "running" || status == "active") {
                    tasks.push(ActiveTask {
                        id: session
                            .get("id")
                            .or(session.get("sessionKey"))
                            .and_then(|v| v.as_str())
                            .unwrap_or("session")
                            .to_string(),
                        label: session
                            .get("label")
                            .or(session.get("agentId"))
                            .and_then(|v| v.as_str())
                            .unwrap_or("subagent")
                            .to_string(),
                        agent_id: agent_id.to_string(),
                        started_at: session
                            .get("startedAt")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string())
                            .unwrap_or_else(|| chrono::Utc::now().to_rfc3339()),
                    });
                }
            }
        }
        Err(_) => { /* gateway unreachable */ }
    }

    Ok(Json(json!({
        "active": !tasks.is_empty(),
        "count": tasks.len(),
        "tasks": tasks,
    })))
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/// Fetch active sessions from the local harness gateway.
async fn fetch_harness_sessions(http: &reqwest::Client) -> anyhow::Result<Vec<Value>> {
    let resp = http
        .get("http://localhost:18789/api/sessions")
        .header("x-openclaw-internal", "1")
        .timeout(std::time::Duration::from_secs(2))
        .send()
        .await?;

    if !resp.status().is_success() {
        return Ok(Vec::new());
    }

    let data: Value = resp.json().await?;
    let sessions = data
        .get("sessions")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    Ok(sessions)
}

// ── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    #[test]
    fn create_agent_body_deserializes_full() {
        let json = r#"{"display_name": "TestBot", "emoji": "\uD83E\uDD16", "role": "coder", "model": "claude-sonnet-4-6"}"#;
        let body: super::CreateAgentBody = serde_json::from_str(json).unwrap();
        assert_eq!(body.display_name.as_deref(), Some("TestBot"));
        assert_eq!(body.emoji.as_deref(), Some("\u{1F916}"));
        assert_eq!(body.role.as_deref(), Some("coder"));
    }

    #[test]
    fn create_agent_body_deserializes_minimal() {
        let json = r#"{}"#;
        let body: super::CreateAgentBody = serde_json::from_str(json).unwrap();
        assert!(body.display_name.is_none());
        assert!(body.emoji.is_none());
    }

    #[test]
    fn delete_agent_body_deserializes_uuid() {
        let json = r#"{"id": "550e8400-e29b-41d4-a716-446655440000"}"#;
        let body: super::DeleteAgentBody = serde_json::from_str(json).unwrap();
        assert_eq!(body.id, "550e8400-e29b-41d4-a716-446655440000");
    }

    #[test]
    fn delete_agent_body_deserializes_short_id() {
        let json = r#"{"id": "koda"}"#;
        let body: super::DeleteAgentBody = serde_json::from_str(json).unwrap();
        assert_eq!(body.id, "koda");
    }

    #[test]
    fn action_body_deserializes() {
        let json = r#"{"id": "koda", "action": "restart"}"#;
        let body: super::AgentActionBody = serde_json::from_str(json).unwrap();
        assert_eq!(body.id, "koda");
        assert_eq!(body.action, "restart");
    }
}
