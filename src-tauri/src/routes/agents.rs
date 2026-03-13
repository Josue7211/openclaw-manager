use axum::{
    extract::State,
    routing::get,
    Json, Router,
};
use serde::Deserialize;
use serde_json::{json, Value};
use tokio::process::Command;

use crate::error::AppError;
use crate::server::AppState;
use crate::supabase::SupabaseClient;

// ── Constants ────────────────────────────────────────────────────────────────

/// Friendly names assigned to detected subagent processes.
const SUBAGENT_NAMES: &[&str] = &[
    "Axel", "Nova", "Pixel", "Hex", "Byte", "Flux", "Cipher", "Sage",
];

/// Allowed fields for PATCH /agents updates.
const ALLOWED_FIELDS: &[&str] = &[
    "display_name",
    "emoji",
    "role",
    "status",
    "current_task",
    "color",
    "model",
    "sort_order",
];

// ── Router ───────────────────────────────────────────────────────────────────

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/agents", get(get_agents).patch(update_agent))
        .route("/agents/active-coders", get(active_coders))
        .route("/subagents/active", get(subagents_active))
}

// ── GET /agents ──────────────────────────────────────────────────────────────

async fn get_agents(
    State(_state): State<AppState>,
) -> Result<Json<Value>, AppError> {
    let sb = SupabaseClient::from_env()?;
    let data = sb
        .select("agents", "select=*&order=sort_order.asc")
        .await?;
    Ok(Json(json!({ "agents": data })))
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
    State(_state): State<AppState>,
    Json(body): Json<UpdateAgentBody>,
) -> Result<Json<Value>, AppError> {
    let id = body
        .id
        .as_deref()
        .ok_or_else(|| AppError::BadRequest("id required".into()))?;

    let mut update = serde_json::Map::new();
    update.insert(
        "updated_at".into(),
        json!(chrono::Utc::now().to_rfc3339()),
    );

    // Build update map from allowed fields
    let body_value = json!({
        "display_name": body.display_name,
        "emoji": body.emoji,
        "role": body.role,
        "status": body.status,
        "current_task": body.current_task,
        "color": body.color,
        "model": body.model,
        "sort_order": body.sort_order,
    });

    for key in ALLOWED_FIELDS {
        if let Some(val) = body_value.get(*key) {
            if !val.is_null() {
                update.insert((*key).to_string(), val.clone());
            }
        }
    }

    let sb = SupabaseClient::from_env()?;
    let data = sb
        .update("agents", &format!("id=eq.{id}"), Value::Object(update))
        .await?;

    let agent = data.get(0).cloned().unwrap_or(Value::Null);
    Ok(Json(json!({ "agent": agent })))
}

// ── GET /agents/active-coders ────────────────────────────────────────────────
//
// Detects running Claude processes via `ps aux`, assigns them friendly names.

async fn active_coders(
    State(_state): State<AppState>,
) -> Result<Json<Value>, AppError> {
    let lines = match detect_claude_processes().await {
        Ok(l) => l,
        Err(_) => {
            return Ok(Json(json!({
                "total": 0,
                "kodaActive": false,
                "subagents": [],
            })));
        }
    };

    // First line is typically the primary koda process; subagents are the rest
    let subagents: Vec<Value> = lines
        .iter()
        .skip(1)
        .enumerate()
        .map(|(i, _line)| {
            json!({
                "id": format!("temp-{i}"),
                "name": SUBAGENT_NAMES[i % SUBAGENT_NAMES.len()],
                "model": "claude-sonnet-4-6",
                "status": "active",
                "task": "(running)",
                "temp": true,
            })
        })
        .collect();

    Ok(Json(json!({
        "total": lines.len(),
        "kodaActive": !lines.is_empty(),
        "subagents": subagents,
    })))
}

// ── GET /subagents/active ────────────────────────────────────────────────────
//
// Detects active Claude processes with --dangerously-skip-permissions flag,
// parses start times, and supplements with OpenClaw session data.

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
) -> Result<Json<Value>, AppError> {
    let mut tasks: Vec<ActiveTask> = Vec::new();

    // Detect running Claude processes with --dangerously flag
    match detect_dangerously_claude_processes().await {
        Ok(lines) => {
            for (_i, line) in lines.iter().enumerate() {
                let parts: Vec<&str> = line.split_whitespace().collect();
                let pid = parts.get(1).unwrap_or(&"").to_string();
                if pid.is_empty() {
                    continue;
                }

                // Parse start time from ps STIME field (column 8)
                let started_at = if let Some(stime) = parts.get(8) {
                    parse_ps_stime(stime)
                } else {
                    chrono::Utc::now().to_rfc3339()
                };

                tasks.push(ActiveTask {
                    id: pid,
                    label: "Claude Code".into(),
                    agent_id: "coding".into(),
                    started_at,
                });
            }
        }
        Err(_) => {}
    }

    // Supplement with OpenClaw sessions as fallback
    match fetch_openclaw_sessions(&state.http).await {
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

                let kind = session
                    .get("kind")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                let status = session
                    .get("status")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");

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

/// Detect Claude processes via `ps aux`, filtering for `claude` lines and
/// excluding grep/bash wrappers.
async fn detect_claude_processes() -> anyhow::Result<Vec<String>> {
    let output = Command::new("ps").arg("aux").output().await?;
    let stdout = String::from_utf8_lossy(&output.stdout);

    let lines: Vec<String> = stdout
        .lines()
        .filter(|line| {
            line.contains("claude")
                && !line.contains("grep")
                && !line.contains("/bin/bash")
        })
        .map(|s| s.to_string())
        .collect();

    Ok(lines)
}

/// Detect Claude processes running with --dangerously-skip-permissions.
async fn detect_dangerously_claude_processes() -> anyhow::Result<Vec<String>> {
    let output = Command::new("bash")
        .arg("-c")
        .arg("ps aux | grep -E '[c]laude.*(--dangerously|dangerously)' | grep -v grep")
        .output()
        .await?;

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if stdout.is_empty() {
        return Ok(Vec::new());
    }

    Ok(stdout.lines().filter(|l| !l.is_empty()).map(|s| s.to_string()).collect())
}

/// Parse ps STIME field into an ISO timestamp.
/// STIME is like "00:15" (today) or "Mar06" (older date).
fn parse_ps_stime(stime: &str) -> String {
    if stime.contains(':') {
        // Today, e.g. "00:15"
        let parts: Vec<&str> = stime.split(':').collect();
        if parts.len() >= 2 {
            if let (Ok(h), Ok(m)) = (parts[0].parse::<u32>(), parts[1].parse::<u32>()) {
                let now = chrono::Utc::now();
                let today = now.date_naive();
                if let Some(time) = chrono::NaiveTime::from_hms_opt(h, m, 0) {
                    let dt = today.and_time(time);
                    return chrono::DateTime::<chrono::Utc>::from_naive_utc_and_offset(dt, chrono::Utc)
                        .to_rfc3339();
                }
            }
        }
    }
    // Older date or unparseable -- estimate ~5 minutes ago
    (chrono::Utc::now() - chrono::Duration::minutes(5)).to_rfc3339()
}

/// Fetch active sessions from the local OpenClaw gateway.
async fn fetch_openclaw_sessions(http: &reqwest::Client) -> anyhow::Result<Vec<Value>> {
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
