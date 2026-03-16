use axum::{
    extract::{Query, State},
    routing::{get, post},
    Json, Router,
};
use serde::Deserialize;
use serde_json::{json, Value};
use tokio::process::Command;
use tracing::{error, info};

use crate::error::AppError;
use crate::redact::redact;
use crate::server::{AppState, RequireAuth};
use crate::supabase::SupabaseClient;
use crate::validation::validate_uuid;

// Supabase client is still used for: mission-events (ingestion comes from
// OpenClaw VM), bjorn_event, ingest_events, sync_agents.

// ── Constants ────────────────────────────────────────────────────────────────

const VALID_STATUSES: &[&str] = &["pending", "active", "done", "failed", "awaiting_review"];

const STATUS_DONE: &str = "done";
const STATUS_FAILED: &str = "failed";

// ── Router ───────────────────────────────────────────────────────────────────

/// Build the missions router (CRUD, event ingestion, agent sync).
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/missions", get(get_missions).post(create_mission).patch(update_mission).delete(delete_mission))
        .route("/mission-events", get(get_mission_events).post(ingest_events))
        .route("/mission-events/bjorn", post(bjorn_event))
        .route("/missions/sync-agents", post(sync_agents))
}

// ── Query params ─────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct MissionEventsQuery {
    mission_id: Option<String>,
    action: Option<String>,
    log_path: Option<String>,
}

// ── GET /missions ────────────────────────────────────────────────────────────

async fn get_missions(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let rows: Vec<(
        String, String, Option<String>, String, i64,
        String, Option<String>, Option<i64>, Option<String>,
        Option<String>, Option<String>, Option<String>, i64,
        String, String,
    )> = sqlx::query_as(
        "SELECT id, title, assignee, status, progress, \
         task_type, log_path, complexity, spawn_command, \
         routed_agent, review_status, review_notes, retry_count, \
         created_at, updated_at \
         FROM missions WHERE user_id = ? AND deleted_at IS NULL \
         ORDER BY created_at ASC",
    )
    .bind(&session.user_id)
    .fetch_all(&state.db)
    .await?;

    let missions: Vec<Value> = rows
        .iter()
        .map(
            |(
                id, title, assignee, status, progress,
                task_type, log_path, complexity, spawn_command,
                routed_agent, review_status, review_notes, retry_count,
                created_at, updated_at,
            )| {
                json!({
                    "id": id,
                    "title": title,
                    "assignee": assignee,
                    "status": status,
                    "progress": progress,
                    "task_type": task_type,
                    "log_path": log_path,
                    "complexity": complexity,
                    "spawn_command": spawn_command,
                    "routed_agent": routed_agent,
                    "review_status": review_status,
                    "review_notes": review_notes,
                    "retry_count": retry_count,
                    "created_at": created_at,
                    "updated_at": updated_at,
                })
            },
        )
        .collect();

    Ok(Json(json!({ "missions": missions })))
}

// ── POST /missions ───────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct CreateMissionBody {
    title: Option<String>,
    assignee: Option<String>,
}

async fn create_mission(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Json(body): Json<CreateMissionBody>,
) -> Result<Json<Value>, AppError> {
    let title = body.title.as_deref().map(|s| s.trim()).unwrap_or("");
    if title.is_empty() {
        return Err(AppError::BadRequest("Empty title".into()));
    }

    let id = crate::routes::util::random_uuid();
    let now = chrono::Utc::now().to_rfc3339();
    let assignee = body.assignee.as_deref().unwrap_or("team");

    sqlx::query(
        "INSERT INTO missions (id, user_id, title, assignee, status, progress, created_at, updated_at) \
         VALUES (?, ?, ?, ?, 'pending', 0, ?, ?)",
    )
    .bind(&id)
    .bind(&session.user_id)
    .bind(title)
    .bind(assignee)
    .bind(&now)
    .bind(&now)
    .execute(&state.db)
    .await?;

    let mission = json!({
        "id": id,
        "title": title,
        "assignee": assignee,
        "status": "pending",
        "progress": 0,
        "created_at": now,
        "updated_at": now,
    });

    let payload = serde_json::to_string(&json!({
        "id": id,
        "user_id": session.user_id,
        "title": title,
        "assignee": assignee,
        "status": "pending",
        "progress": 0,
        "created_at": now,
        "updated_at": now,
    }))
    .map_err(|e| AppError::Internal(e.into()))?;

    crate::sync::log_mutation(&state.db, "missions", &id, "INSERT", Some(&payload))
        .await
        .map_err(|e| AppError::Internal(e.into()))?;

    Ok(Json(json!({ "mission": mission })))
}

// ── PATCH /missions ──────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct UpdateMissionBody {
    id: Option<String>,
    status: Option<String>,
    assignee: Option<String>,
    progress: Option<f64>,
    log_path: Option<String>,
}

async fn update_mission(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Json(body): Json<UpdateMissionBody>,
) -> Result<Json<Value>, AppError> {
    let id = body.id.as_deref().unwrap_or("");
    if id.is_empty() {
        return Err(AppError::BadRequest("Valid mission id required".into()));
    }
    validate_uuid(id)?;

    if let Some(ref status) = body.status {
        if !VALID_STATUSES.contains(&status.as_str()) {
            return Err(AppError::BadRequest(format!(
                "Invalid status. Must be one of: {}",
                VALID_STATUSES.join(", ")
            )));
        }
    }

    let now = chrono::Utc::now().to_rfc3339();

    // Build dynamic UPDATE
    let mut sets = vec!["updated_at = ?"];
    if body.status.is_some() {
        sets.push("status = ?");
    }
    if body.assignee.is_some() {
        sets.push("assignee = ?");
    }
    if body.progress.is_some() {
        sets.push("progress = ?");
    }
    if body.log_path.is_some() {
        sets.push("log_path = ?");
    }
    let sql = format!(
        "UPDATE missions SET {} WHERE id = ? AND user_id = ?",
        sets.join(", ")
    );

    let mut query = sqlx::query(&sql).bind(&now);
    if let Some(ref status) = body.status {
        query = query.bind(status);
    }
    if let Some(ref assignee) = body.assignee {
        query = query.bind(assignee);
    }
    if let Some(progress) = body.progress {
        let clamped = progress.max(0.0).min(100.0) as i64;
        query = query.bind(clamped);
    }
    if let Some(ref log_path) = body.log_path {
        query = query.bind(log_path);
    }
    query = query.bind(id).bind(&session.user_id);
    query.execute(&state.db).await?;

    // Read back updated row for response and sync
    let row: Option<(
        String, String, Option<String>, String, i64,
        String, Option<String>, Option<i64>, Option<String>,
        Option<String>, Option<String>, Option<String>, i64,
        String, String,
    )> = sqlx::query_as(
        "SELECT id, title, assignee, status, progress, \
         task_type, log_path, complexity, spawn_command, \
         routed_agent, review_status, review_notes, retry_count, \
         created_at, updated_at \
         FROM missions WHERE id = ? AND user_id = ?",
    )
    .bind(id)
    .bind(&session.user_id)
    .fetch_optional(&state.db)
    .await?;

    let mission = match row {
        Some((
            rid, title, assignee_val, status_val, progress_val,
            task_type, log_path_val, complexity, spawn_command,
            routed_agent, review_status, review_notes, retry_count,
            created_at, updated_at,
        )) => {
            let val = json!({
                "id": rid,
                "user_id": session.user_id,
                "title": title,
                "assignee": assignee_val,
                "status": status_val,
                "progress": progress_val,
                "task_type": task_type,
                "log_path": log_path_val,
                "complexity": complexity,
                "spawn_command": spawn_command,
                "routed_agent": routed_agent,
                "review_status": review_status,
                "review_notes": review_notes,
                "retry_count": retry_count,
                "created_at": created_at,
                "updated_at": updated_at,
            });

            // Log for sync
            let payload = serde_json::to_string(&val)
                .map_err(|e| AppError::Internal(e.into()))?;
            crate::sync::log_mutation(&state.db, "missions", &rid, "UPDATE", Some(&payload))
                .await
                .map_err(|e| AppError::Internal(e.into()))?;

            val
        }
        None => Value::Null,
    };

    // Send push notification for terminal status changes
    if let Some(ref status) = body.status {
        if status == STATUS_DONE || status == STATUS_FAILED {
            let title_text = mission
                .get("title")
                .and_then(|v| v.as_str())
                .unwrap_or("Unknown");
            let (label, emoji, priority) = if status == STATUS_DONE {
                ("Mission Complete", "white_check_mark", 3)
            } else {
                ("Mission Failed", "x", 4)
            };

            let ntfy_url = state.secret("NTFY_URL").unwrap_or_default();
            let ntfy_topic = state.secret("NTFY_TOPIC").unwrap_or_else(|| "mission-control".into());
            let http = state.http.clone();
            let label = label.to_string();
            let title_text = title_text.to_string();
            let emoji = emoji.to_string();
            tokio::spawn(async move {
                let _ = send_ntfy(&http, &ntfy_url, &ntfy_topic, &label, &title_text, priority, &[&emoji]).await;
            });
        }
    }

    // Log activity for status changes (still to Supabase activity_log)
    let jwt = session.access_token.clone();
    if let Some(ref status) = body.status {
        let title_text = mission
            .get("title")
            .and_then(|v| v.as_str())
            .unwrap_or("Unknown");
        let assignee_str = mission
            .get("assignee")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let clamped = body.progress.map(|p| p.max(0.0).min(100.0) as i64);

        let mut desc = format!("Mission \"{title_text}\" status changed to {status}");
        if let Some(p) = clamped {
            desc.push_str(&format!(", progress: {p}%"));
        }

        let sb_log = SupabaseClient::from_state(&state).ok();
        if let Some(sb_log) = sb_log {
            let log_row = json!({
                "mission_id": id,
                "agent_id": if assignee_str.is_empty() { Value::Null } else { json!(assignee_str) },
                "event_type": "mission_status_change",
                "description": desc,
                "metadata": { "status": status, "progress": clamped },
            });
            let jwt_clone = jwt.clone();
            tokio::spawn(async move {
                let _ = sb_log.insert_as_user("activity_log", log_row, &jwt_clone).await;
            });
        }
    }

    // When marking done, auto-ingest agent log
    if body.status.as_deref() == Some(STATUS_DONE) {
        let created_at = mission
            .get("created_at")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let updated_at = mission
            .get("updated_at")
            .and_then(|v| v.as_str())
            .unwrap_or("");

        let duration_sec = compute_duration_sec(created_at, updated_at);

        let mut final_log_path = body.log_path.clone();
        if final_log_path.is_none() {
            if let Some(assignee) = mission.get("assignee").and_then(|v| v.as_str()) {
                final_log_path = find_agent_log_file(assignee).await;
            }
        }

        if let Some(log_path) = final_log_path {
            let mission_id = id.to_string();
            let state_clone = state.clone();
            let jwt_clone = jwt.clone();
            tokio::spawn(async move {
                if let Err(e) = ingest_log_file(&state_clone, &mission_id, &log_path, duration_sec, &jwt_clone).await {
                    error!("[missions] auto-ingest error: {e:#}");
                }
            });
        }
    }

    Ok(Json(json!({ "mission": mission })))
}

// ── DELETE /missions ─────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct DeleteMissionBody {
    id: String,
}

async fn delete_mission(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Json(body): Json<DeleteMissionBody>,
) -> Result<Json<Value>, AppError> {
    validate_uuid(&body.id)?;

    let now = chrono::Utc::now().to_rfc3339();
    sqlx::query(
        "UPDATE missions SET deleted_at = ?, updated_at = ? WHERE id = ? AND user_id = ?",
    )
    .bind(&now)
    .bind(&now)
    .bind(&body.id)
    .bind(&session.user_id)
    .execute(&state.db)
    .await?;

    crate::sync::log_mutation(&state.db, "missions", &body.id, "DELETE", None)
        .await
        .map_err(|e| AppError::Internal(e.into()))?;

    Ok(Json(json!({ "ok": true })))
}

// ── GET /mission-events ──────────────────────────────────────────────────────

async fn get_mission_events(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Query(params): Query<MissionEventsQuery>,
) -> Result<Json<Value>, AppError> {
    let sb = SupabaseClient::from_state(&state)?;
    let jwt = &session.access_token;

    // TODO: This mutation should be POST, not GET. Migrate callers.
    // Manual ingest mode: GET /mission-events?action=ingest&mission_id=X&log_path=/tmp/foo.log
    if params.action.as_deref() == Some("ingest") {
        let mission_id = params
            .mission_id
            .as_deref()
            .ok_or_else(|| AppError::BadRequest("mission_id required".into()))?;
        validate_uuid(mission_id)?;
        let log_path = params
            .log_path
            .as_deref()
            .ok_or_else(|| AppError::BadRequest("log_path required".into()))?;

        // Validate log_path: must be a .log file under /tmp/
        let log_re = regex::Regex::new(r"^/tmp/[a-zA-Z0-9._-]+\.log$").unwrap();
        if !log_re.is_match(log_path) {
            return Err(AppError::BadRequest(
                "log_path must be a .log file under /tmp/".into(),
            ));
        }

        // Resolve symlinks to prevent reading arbitrary files
        let resolved = match tokio::fs::canonicalize(log_path).await {
            Ok(p) => p,
            Err(_) => return Err(AppError::NotFound("Log file not found".into())),
        };
        if !resolved.starts_with("/tmp/") {
            return Err(AppError::BadRequest(
                "log_path must resolve within /tmp/".into(),
            ));
        }

        let log_content = tokio::fs::read_to_string(&resolved)
            .await
            .map_err(|_| AppError::NotFound("Log file not found".into()))?;
        if log_content.trim().is_empty() {
            return Err(AppError::BadRequest("Log file is empty".into()));
        }

        // Get mission duration if available
        let mission_data = sb
            .select_as_user(
                "missions",
                &format!("select=created_at,updated_at&id=eq.{mission_id}&limit=1"),
                jwt,
            )
            .await
            .unwrap_or_else(|_| json!([]));

        let duration_sec = if let Some(m) = mission_data.get(0) {
            compute_duration_sec(
                m.get("created_at").and_then(|v| v.as_str()).unwrap_or(""),
                m.get("updated_at").and_then(|v| v.as_str()).unwrap_or(""),
            )
        } else {
            None
        };

        let parsed = parse_log_events(&log_content, duration_sec);
        if parsed.is_empty() {
            return Err(AppError::BadRequest("No events parsed from log".into()));
        }

        let model_name = parsed
            .first()
            .and_then(|e| e.get("model_name"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        let rows: Vec<Value> = parsed
            .iter()
            .map(|e| {
                let content = e
                    .get("content")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                let tool_input = e
                    .get("tool_input")
                    .and_then(|v| v.as_str());

                json!({
                    "mission_id": mission_id,
                    "event_type": e.get("event_type"),
                    "content": redact(content),
                    "file_path": e.get("file_path"),
                    "seq": e.get("seq"),
                    "elapsed_seconds": e.get("elapsed_seconds"),
                    "tool_input": tool_input.map(|s| redact(s)),
                    "model_name": e.get("model_name"),
                })
            })
            .collect();

        // Delete existing events (idempotent)
        let _ = sb
            .delete_as_user("mission_events", &format!("mission_id=eq.{mission_id}"), jwt)
            .await;

        sb.insert_as_user("mission_events", json!(rows), jwt).await?;

        return Ok(Json(json!({
            "success": true,
            "events_inserted": rows.len(),
            "model_name": model_name,
        })));
    }

    // Standard fetch: GET /mission-events?mission_id=X
    let mission_id = params
        .mission_id
        .as_deref()
        .ok_or_else(|| AppError::BadRequest("mission_id required".into()))?;
    validate_uuid(mission_id)?;

    let data = sb
        .select_as_user(
            "mission_events",
            &format!("select=*&mission_id=eq.{mission_id}&order=seq.asc"),
            jwt,
        )
        .await?;

    Ok(Json(json!({ "events": data })))
}

// ── POST /mission-events ─────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct IngestEventsBody {
    mission_id: Option<String>,
    log_content: Option<String>,
    mission_duration_seconds: Option<i64>,
}

async fn ingest_events(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Json(body): Json<IngestEventsBody>,
) -> Result<Json<Value>, AppError> {
    let mission_id = body
        .mission_id
        .as_deref()
        .ok_or_else(|| AppError::BadRequest("mission_id required".into()))?;
    validate_uuid(mission_id)?;

    let log_content = match body.log_content.as_deref() {
        Some(c) if !c.is_empty() => c,
        _ => return Ok(Json(json!({ "events_inserted": 0 }))),
    };

    let duration = body.mission_duration_seconds.map(|s| s as u64);
    let parsed = parse_log_events(log_content, duration.map(|s| s as i64));
    if parsed.is_empty() {
        return Ok(Json(json!({ "events_inserted": 0 })));
    }

    let rows: Vec<Value> = parsed
        .iter()
        .map(|e| {
            let content = e
                .get("content")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            json!({
                "mission_id": mission_id,
                "event_type": e.get("event_type"),
                "content": redact(content),
                "file_path": e.get("file_path"),
                "seq": e.get("seq"),
                "elapsed_seconds": e.get("elapsed_seconds"),
            })
        })
        .collect();

    let sb = SupabaseClient::from_state(&state)?;
    let jwt = &session.access_token;

    // Delete existing events for this mission first (idempotent re-ingest)
    let _ = sb
        .delete_as_user("mission_events", &format!("mission_id=eq.{mission_id}"), jwt)
        .await;

    sb.insert_as_user("mission_events", json!(rows), jwt).await?;

    Ok(Json(json!({ "events_inserted": rows.len() })))
}

// ── POST /mission-events/bjorn ───────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct BjornEventBody {
    mission_id: Option<String>,
    event_type: Option<String>,
    content: Option<String>,
    elapsed_seconds: Option<i64>,
}

async fn bjorn_event(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Json(body): Json<BjornEventBody>,
) -> Result<Json<Value>, AppError> {
    let mission_id = body
        .mission_id
        .as_deref()
        .ok_or_else(|| AppError::BadRequest("mission_id required".into()))?;
    validate_uuid(mission_id)?;
    let event_type = body
        .event_type
        .as_deref()
        .ok_or_else(|| AppError::BadRequest("event_type required".into()))?;
    let content = body
        .content
        .as_deref()
        .ok_or_else(|| AppError::BadRequest("content required".into()))?;

    let sb = SupabaseClient::from_state(&state)?;
    let jwt = &session.access_token;

    // Get current max seq for this mission
    let max_rows = sb
        .select_as_user(
            "mission_events",
            &format!(
                "select=seq&mission_id=eq.{mission_id}&order=seq.desc&limit=1"
            ),
            jwt,
        )
        .await
        .unwrap_or_else(|_| json!([]));

    let next_seq = max_rows
        .get(0)
        .and_then(|r| r.get("seq"))
        .and_then(|v| v.as_i64())
        .unwrap_or(0)
        + 1;

    let row = json!({
        "mission_id": mission_id,
        "event_type": event_type,
        "content": content,
        "elapsed_seconds": body.elapsed_seconds,
        "seq": next_seq,
    });

    let data = sb.insert_as_user("mission_events", row, jwt).await?;
    let event = data.get(0).cloned().unwrap_or(Value::Null);

    Ok(Json(json!({ "ok": true, "event": event })))
}

// ── POST /missions/sync-agents ───────────────────────────────────────────────

async fn sync_agents(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    // Detect running coding agent processes
    let ps_output = Command::new("ps")
        .arg("aux")
        .output()
        .await
        .map_err(|e| AppError::Internal(e.into()))?;

    let stdout = String::from_utf8_lossy(&ps_output.stdout);
    let active_processes: Vec<&str> = stdout
        .lines()
        .filter(|l| {
            l.contains("claude")
                && l.contains("--dangerously-skip-permissions")
                && !l.contains("grep")
        })
        .collect();

    let sb = SupabaseClient::from_state(&state)?;
    let jwt = &session.access_token;

    // Get all active/pending bjorn missions
    let active_missions = sb
        .select_as_user(
            "missions",
            "select=*&assignee=eq.bjorn&or=(status.eq.active,status.eq.pending)",
            jwt,
        )
        .await
        .unwrap_or_else(|_| json!([]));

    // If no processes running, close all active bjorn missions
    if active_processes.is_empty() {
        if let Some(arr) = active_missions.as_array() {
            if !arr.is_empty() {
                let ids: Vec<String> = arr
                    .iter()
                    .filter_map(|m| m.get("id").and_then(|v| v.as_str()).map(|s| s.to_string()))
                    .collect();
                let now = chrono::Utc::now().to_rfc3339();
                for id in &ids {
                    let _ = sb
                        .update_as_user(
                            "missions",
                            &format!("id=eq.{id}"),
                            json!({ "status": "done", "updated_at": now }),
                            jwt,
                        )
                        .await;
                }
            }
        }
    }

    // Clean up stale "Coding Agent Task" missions
    let _ = sb
        .delete_as_user(
            "missions",
            "title=eq.Coding Agent Task&assignee=eq.bjorn",
            jwt,
        )
        .await;

    // Delete done missions older than 24h
    let one_day_ago = (chrono::Utc::now() - chrono::Duration::hours(24))
        .to_rfc3339_opts(chrono::SecondsFormat::Secs, true);
    let _ = sb
        .delete_as_user(
            "missions",
            &format!(
                "assignee=eq.bjorn&status=eq.done&updated_at=lt.{one_day_ago}"
            ),
            jwt,
        )
        .await;

    Ok(Json(json!({
        "ok": true,
        "processes": active_processes.len(),
    })))
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/// Compute mission duration in seconds from created_at and updated_at timestamps.
fn compute_duration_sec(created_at: &str, updated_at: &str) -> Option<i64> {
    let created = chrono::DateTime::parse_from_rfc3339(created_at).ok()?;
    let updated = if updated_at.is_empty() {
        chrono::Utc::now().into()
    } else {
        chrono::DateTime::parse_from_rfc3339(updated_at).ok()?
    };
    Some((updated - created).num_seconds())
}

/// Find the most recently modified agent log file in /tmp matching assignee patterns.
async fn find_agent_log_file(assignee: &str) -> Option<String> {
    let patterns: &[&str] = match assignee {
        "koda" | "gunther" => &["koda-", "gunther-"],
        "roman" | "fast" => &["roman-", "fast-"],
        "review" | "codex" => &["codex-review-"],
        _ => &[assignee],
    };

    let mut entries = match tokio::fs::read_dir("/tmp").await {
        Ok(e) => e,
        Err(_) => return None,
    };

    let mut best: Option<(String, std::time::SystemTime)> = None;

    while let Ok(Some(entry)) = entries.next_entry().await {
        let name = entry.file_name().to_string_lossy().to_string();
        if !name.ends_with(".log") {
            continue;
        }
        let matches = patterns.iter().any(|p| name.starts_with(p));
        if !matches {
            continue;
        }
        if let Ok(meta) = entry.metadata().await {
            if let Ok(modified) = meta.modified() {
                match &best {
                    Some((_, prev_time)) if modified > *prev_time => {
                        best = Some((format!("/tmp/{name}"), modified));
                    }
                    None => {
                        best = Some((format!("/tmp/{name}"), modified));
                    }
                    _ => {}
                }
            }
        }
    }

    best.map(|(path, _)| path)
}

/// Ingest a log file into mission_events via Supabase.
async fn ingest_log_file(
    state: &AppState,
    mission_id: &str,
    log_path: &str,
    duration_sec: Option<i64>,
    jwt: &str,
) -> anyhow::Result<()> {
    let log_re = regex::Regex::new(r"^/tmp/[a-zA-Z0-9._-]+\.log$")?;
    if !log_re.is_match(log_path) {
        anyhow::bail!("Invalid log path");
    }

    let resolved = tokio::fs::canonicalize(log_path).await?;
    if !resolved.starts_with("/tmp/") {
        anyhow::bail!("Log path escapes /tmp/");
    }

    let content = tokio::fs::read_to_string(&resolved).await?;
    if content.trim().is_empty() {
        return Ok(());
    }

    let parsed = parse_log_events(&content, duration_sec);
    if parsed.is_empty() {
        return Ok(());
    }

    let rows: Vec<Value> = parsed
        .iter()
        .map(|e| {
            let c = e.get("content").and_then(|v| v.as_str()).unwrap_or("");
            let tool_input = e.get("tool_input").and_then(|v| v.as_str());
            json!({
                "mission_id": mission_id,
                "event_type": e.get("event_type"),
                "content": redact(c),
                "file_path": e.get("file_path"),
                "seq": e.get("seq"),
                "elapsed_seconds": e.get("elapsed_seconds"),
                "tool_input": tool_input.map(|s| redact(s)),
                "model_name": e.get("model_name"),
            })
        })
        .collect();

    let sb = SupabaseClient::from_state(state)?;
    let _ = sb
        .delete_as_user("mission_events", &format!("mission_id=eq.{mission_id}"), jwt)
        .await;
    sb.insert_as_user("mission_events", json!(rows), jwt).await?;

    info!(
        "[missions] auto-ingested {} events for mission {mission_id}",
        rows.len()
    );
    Ok(())
}

/// Parse Claude log content into structured event objects.
///
/// This is a simplified Rust port of the TypeScript `parseClaudeLog` function.
/// It handles both plain-text logs and JSONL (stream-json) format.
fn parse_log_events(log_content: &str, duration_sec: Option<i64>) -> Vec<Value> {
    let mut events = Vec::new();
    let mut seq = 0;

    // Detect JSONL format (stream-json output)
    let first_line = log_content.lines().next().unwrap_or("");
    let is_jsonl = first_line.starts_with('{') && serde_json::from_str::<Value>(first_line).is_ok();

    if is_jsonl {
        // Parse JSONL stream-json format
        let mut model_name: Option<String> = None;

        for line in log_content.lines() {
            let line = line.trim();
            if line.is_empty() {
                continue;
            }
            let entry: Value = match serde_json::from_str(line) {
                Ok(v) => v,
                Err(_) => continue,
            };

            // Extract model name from system entries
            if let Some(model) = entry.get("model").and_then(|v| v.as_str()) {
                model_name = Some(model.to_string());
            }

            let entry_type = entry.get("type").and_then(|v| v.as_str()).unwrap_or("");

            match entry_type {
                "assistant" => {
                    // Tool use blocks
                    if let Some(content_blocks) = entry.get("message").and_then(|m| m.get("content")).and_then(|c| c.as_array()) {
                        for block in content_blocks {
                            let block_type = block.get("type").and_then(|v| v.as_str()).unwrap_or("");
                            if block_type == "tool_use" {
                                let tool_name = block.get("name").and_then(|v| v.as_str()).unwrap_or("unknown");
                                let input = block.get("input").cloned().unwrap_or(Value::Null);

                                let event_type = match tool_name {
                                    "Write" | "write" => "write",
                                    "Edit" | "edit" => "edit",
                                    "Bash" | "bash" => "bash",
                                    "Read" | "read" => "read",
                                    "Glob" | "glob" => "glob",
                                    "Grep" | "grep" => "grep",
                                    _ => "bash",
                                };

                                let file_path = input.get("file_path").or(input.get("path")).and_then(|v| v.as_str());
                                let content_text = input.get("command")
                                    .or(input.get("content"))
                                    .or(input.get("pattern"))
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("");

                                let elapsed = if let Some(dur) = duration_sec {
                                    if seq > 0 { Some(dur * seq as i64 / (seq + 1) as i64) } else { Some(0) }
                                } else {
                                    None
                                };

                                events.push(json!({
                                    "event_type": event_type,
                                    "content": content_text,
                                    "file_path": file_path,
                                    "seq": seq,
                                    "elapsed_seconds": elapsed,
                                    "tool_input": serde_json::to_string(&input).ok(),
                                    "model_name": model_name,
                                }));
                                seq += 1;
                            } else if block_type == "thinking" {
                                let text = block.get("thinking").and_then(|v| v.as_str()).unwrap_or("");
                                if !text.is_empty() {
                                    events.push(json!({
                                        "event_type": "think",
                                        "content": text,
                                        "seq": seq,
                                        "model_name": model_name,
                                    }));
                                    seq += 1;
                                }
                            } else if block_type == "text" {
                                let text = block.get("text").and_then(|v| v.as_str()).unwrap_or("");
                                if !text.trim().is_empty() {
                                    events.push(json!({
                                        "event_type": "result",
                                        "content": text,
                                        "seq": seq,
                                        "model_name": model_name,
                                    }));
                                    seq += 1;
                                }
                            }
                        }
                    }
                }
                "result" => {
                    if let Some(result_text) = entry.get("result").and_then(|v| v.as_str()) {
                        if !result_text.trim().is_empty() {
                            events.push(json!({
                                "event_type": "result",
                                "content": result_text,
                                "seq": seq,
                                "model_name": model_name,
                            }));
                            seq += 1;
                        }
                    }
                }
                _ => {}
            }
        }
    } else {
        // Plain text log parsing
        // Look for patterns like tool invocations, results, and thinking blocks
        let tool_re = regex::Regex::new(r"(?m)^(?:⏺|●)\s*(\w+)\s*(?:\((.*?)\))?").ok();
        let think_re = regex::Regex::new(r"(?m)^(?:💭|🤔)\s*(.+)").ok();

        for line in log_content.lines() {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }

            // Check for tool invocations
            if let Some(ref re) = tool_re {
                if let Some(caps) = re.captures(trimmed) {
                    let tool = caps.get(1).map(|m| m.as_str()).unwrap_or("");
                    let event_type = match tool.to_lowercase().as_str() {
                        "write" => "write",
                        "edit" => "edit",
                        "bash" => "bash",
                        "read" => "read",
                        "glob" => "glob",
                        "grep" => "grep",
                        _ => "bash",
                    };
                    let content = caps.get(2).map(|m| m.as_str()).unwrap_or(trimmed);
                    let elapsed = duration_sec.map(|dur| {
                        if seq > 0 {
                            dur * seq as i64 / (seq + 1) as i64
                        } else {
                            0
                        }
                    });

                    events.push(json!({
                        "event_type": event_type,
                        "content": content,
                        "seq": seq,
                        "elapsed_seconds": elapsed,
                    }));
                    seq += 1;
                    continue;
                }
            }

            // Check for thinking blocks
            if let Some(ref re) = think_re {
                if let Some(caps) = re.captures(trimmed) {
                    let content = caps.get(1).map(|m| m.as_str()).unwrap_or("");
                    events.push(json!({
                        "event_type": "think",
                        "content": content,
                        "seq": seq,
                    }));
                    seq += 1;
                    continue;
                }
            }

            // Fallback: treat as result text if it has content
            if !trimmed.starts_with('#') && trimmed.len() > 3 {
                events.push(json!({
                    "event_type": "result",
                    "content": trimmed,
                    "seq": seq,
                }));
                seq += 1;
            }
        }
    }

    events
}

/// Send a notification via ntfy.sh (best-effort).
async fn send_ntfy(
    http: &reqwest::Client,
    url: &str,
    topic: &str,
    title: &str,
    message: &str,
    priority: i32,
    tags: &[&str],
) -> anyhow::Result<()> {
    if url.is_empty() {
        return Err(anyhow::anyhow!("NTFY_URL not configured"));
    }

    let mut req = http
        .post(format!("{url}/{topic}"))
        .header("Title", title)
        .header("Priority", priority.to_string())
        .header("Content-Type", "text/plain");

    if !tags.is_empty() {
        req = req.header("Tags", tags.join(","));
    }

    req.body(message.to_string()).send().await?;
    Ok(())
}
