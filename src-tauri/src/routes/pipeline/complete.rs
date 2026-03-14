use axum::{extract::State, Json};
use serde::Deserialize;
use serde_json::{json, Value};
use tokio::process::Command;
use tracing::error;

use crate::error::AppError;
use crate::redact::redact;
use crate::server::AppState;

use super::agents::{status, escalation_target, CODEX, MAX_RETRIES};
use super::helpers::{
    extract_workdir, log_activity, send_notify, set_agent_active, set_agent_idle,
    spawn_agent_process, supabase,
};
use super::registry::clean_registry_by_mission_id;

// ── POST /pipeline/complete ──────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub(super) struct CompleteBody {
    mission_id: String,
    status: String,
    failure_reason: Option<String>,
}

pub(super) async fn pipeline_complete(
    State(state): State<AppState>,
    Json(body): Json<CompleteBody>,
) -> Result<Json<Value>, AppError> {
    if body.mission_id.is_empty() {
        return Err(AppError::BadRequest("mission_id is required".into()));
    }
    if body.status != "done" && body.status != "failed" {
        return Err(AppError::BadRequest(
            "status must be \"done\" or \"failed\"".into(),
        ));
    }

    let sb = supabase(&state)?;
    let mission_id = &body.mission_id;

    // Fetch mission
    let mission = sb
        .select_single(
            "missions",
            &format!("select=*&id=eq.{mission_id}"),
        )
        .await
        .map_err(|_| AppError::NotFound("Mission not found".into()))?;

    // Guard: skip if mission is already done or reviewed
    let current_status = mission["status"].as_str().unwrap_or("");
    let review_st = mission["review_status"].as_str().unwrap_or("");
    if current_status == status::mission::DONE
        || review_st == status::review::APPROVED
        || review_st == status::review::REJECTED
    {
        return Ok(Json(json!({
            "action": "skipped",
            "message": "Mission already completed or reviewed.",
            "mission_id": mission_id,
        })));
    }

    let is_code_task = mission["task_type"].as_str() == Some("code");
    let agent_id = mission["assignee"].as_str().unwrap_or("").to_string();
    let routed_agent = mission["routed_agent"].as_str().unwrap_or("").to_string();
    let mission_title = mission["title"].as_str().unwrap_or("").to_string();

    // ── Failure ──────────────────────────────────────────────────
    if body.status == "failed" {
        let retry_count = mission["retry_count"].as_u64().unwrap_or(0) as u32 + 1;
        let should_escalate =
            retry_count >= MAX_RETRIES && escalation_target(&routed_agent).is_some();

        // Update mission + idle agent
        let mission_query = format!("id=eq.{mission_id}");
        let _ = tokio::join!(
            sb.update(
                "missions",
                &mission_query,
                json!({
                    "status": status::mission::FAILED,
                    "retry_count": retry_count,
                    "updated_at": chrono::Utc::now().to_rfc3339(),
                }),
            ),
            set_agent_idle(&sb, &agent_id),
        );

        if should_escalate {
            let escalated_agent = escalation_target(&routed_agent).unwrap();
            log_activity(
                &sb,
                json!({
                    "mission_id": mission_id,
                    "agent_id": agent_id,
                    "event_type": "pipeline_escalation",
                    "description": format!(
                        "{retry_count} failures -- escalating from {routed_agent} to {escalated_agent}. Reason: {}",
                        body.failure_reason.as_deref().unwrap_or("unknown")
                    ),
                    "metadata": {
                        "retry_count": retry_count,
                        "from": routed_agent,
                        "to": escalated_agent,
                        "reason": body.failure_reason.as_deref().unwrap_or("unknown"),
                    },
                }),
            );
            send_notify(
                "Mission Escalated",
                &format!(
                    "\"{}\" failed {}x -> escalating to {}",
                    mission_title, retry_count, escalated_agent
                ),
                4,
                &["warning"],
            );

            return Ok(Json(json!({
                "action": "escalate",
                "message": format!("Failed {retry_count}x. Escalate to {escalated_agent}. Use POST /api/pipeline/spawn to re-route."),
                "escalate_to": escalated_agent,
                "retry_count": retry_count,
                "failure_reason": body.failure_reason,
            })));
        }

        let failure_reason = body.failure_reason.as_deref().unwrap_or("unknown");
        log_activity(
            &sb,
            json!({
                "mission_id": mission_id,
                "agent_id": agent_id,
                "event_type": "pipeline_failure",
                "description": format!("Mission failed (attempt {retry_count}/{MAX_RETRIES}). Reason: {failure_reason}"),
                "metadata": {
                    "retry_count": retry_count,
                    "reason": failure_reason,
                },
            }),
        );
        send_notify(
            "Mission Failed",
            &format!(
                "\"{}\" attempt {}/{}. {}",
                mission_title, retry_count, MAX_RETRIES, failure_reason
            ),
            4,
            &["x"],
        );

        let can_retry = retry_count < MAX_RETRIES;
        return Ok(Json(json!({
            "action": if can_retry { "retry" } else { "escalate_manual" },
            "message": if can_retry {
                format!("Failed ({retry_count}/{MAX_RETRIES}). Read the log, diagnose, then retry or re-spawn.")
            } else {
                format!("Failed {retry_count}x with no escalation path. Manual intervention needed.")
            },
            "retry_count": retry_count,
            "can_retry": can_retry,
            "failure_reason": body.failure_reason,
        })));
    }

    // ── Success: code task -> auto-spawn Codex review ─────────────
    if is_code_task {
        let codex_route = &CODEX;
        let workdir = extract_workdir(&mission);
        let codex_log_file = format!("/tmp/codex-review-{}.log", &mission_id[..mission_id.len().min(8)]);

        // Update mission + reset worker + activate Codex in parallel
        let mission_query = format!("id=eq.{mission_id}");
        let review_task = format!("Review: {}", mission_title);
        let _ = tokio::join!(
            sb.update(
                "missions",
                &mission_query,
                json!({
                    "status": status::mission::AWAITING_REVIEW,
                    "review_status": status::review::PENDING,
                    "progress": 90,
                    "updated_at": chrono::Utc::now().to_rfc3339(),
                }),
            ),
            set_agent_idle(&sb, &agent_id),
            set_agent_active(&sb, codex_route.agent_id, &review_task),
        );

        // Build Codex review prompt
        let review_prompt = format!(
            "You are Codex, the code review agent. Review the changes for mission: \"{mission_title}\"\n\n\
             Your job is to REVIEW, not fix. Check:\n\
             1. Run \"git diff\" in the project directory to see what changed\n\
             2. Run \"npm run build\" to verify it compiles\n\
             3. Check for broken imports, logic errors, missing props, type errors\n\
             4. If agent-browser is available, open the app and visually verify the changes look correct\n\n\
             When done, submit your review by running:\n\n\
             curl -X POST http://localhost:3000/api/pipeline/review \\\n\
               -H \"Content-Type: application/json\" \\\n\
               -H \"X-API-Key: $MC_API_KEY\" \\\n\
               -d '{{\"mission_id\":\"{mission_id}\",\"verdict\":\"approved\",\"notes\":\"your review notes\"}}'\n\n\
             Use verdict \"approved\" if changes are good. Use \"rejected\" with detailed notes if there are issues.\n\
             \nWorking directory: {workdir}"
        );

        // Spawn Codex
        let mut codex_pid: u32 = 0;
        match spawn_agent_process(
            codex_route,
            &review_prompt,
            &workdir,
            &codex_log_file,
            mission_id,
            &format!("Review: {}", mission_title),
        )
        .await
        {
            Ok(pid) => codex_pid = pid,
            Err(e) => {
                error!("[pipeline/complete] Failed to spawn Codex: {e:?}");
                let _ = set_agent_idle(&sb, codex_route.agent_id).await;
            }
        }

        log_activity(
            &sb,
            json!({
                "mission_id": mission_id,
                "agent_id": codex_route.agent_id,
                "event_type": "pipeline_auto_review",
                "description": format!("Auto-spawned Codex to review \"{}\"", mission_title),
                "metadata": {
                    "task_type": "code",
                    "codex_pid": codex_pid,
                    "log_file": codex_log_file,
                },
            }),
        );
        send_notify(
            "Codex Reviewing",
            &format!("{} Auto-reviewing \"{}\"", CODEX.emoji, mission_title),
            3,
            &["eyes"],
        );

        return Ok(Json(json!({
            "action": "review_auto_spawned",
            "message": "Code task done. Codex auto-spawned for review. Deploy will unblock when Codex approves.",
            "mission_id": mission_id,
            "review_status": "pending",
            "codex_pid": codex_pid,
            "codex_log": codex_log_file,
        })));
    }

    // ── Success: non-code task -> done immediately ────────────────
    let mission_query = format!("id=eq.{mission_id}");
    let _ = tokio::join!(
        sb.update(
            "missions",
            &mission_query,
            json!({
                "status": status::mission::DONE,
                "progress": 100,
                "updated_at": chrono::Utc::now().to_rfc3339(),
            }),
        ),
        set_agent_idle(&sb, &agent_id),
    );

    // Read last 2000 chars of log for notification (best-effort)
    let log_path = mission["log_path"].as_str().unwrap_or("");
    let log_tail = if !log_path.is_empty() {
        let output = Command::new("tail")
            .args(["-c", "2000", log_path])
            .output()
            .await;
        match output {
            Ok(out) => {
                let raw = String::from_utf8_lossy(&out.stdout).to_string();
                redact(&raw)
            }
            Err(_) => String::new(),
        }
    } else {
        String::new()
    };

    log_activity(
        &sb,
        json!({
            "mission_id": mission_id,
            "agent_id": agent_id,
            "event_type": "mission_status_change",
            "description": format!("Mission \"{}\" completed successfully", mission_title),
            "metadata": { "status": "done" },
        }),
    );
    send_notify(
        "Mission Complete",
        &format!("\"{}\" done", mission_title),
        3,
        &["white_check_mark"],
    );

    // Clean registry (fire-and-forget)
    let mid = mission_id.clone();
    tokio::spawn(async move {
        clean_registry_by_mission_id(&mid).await;
    });

    let _ = log_tail; // used for notifyBjorn in TS; kept here for future use

    Ok(Json(json!({
        "action": "done",
        "message": "Mission completed. No review needed (non-code task).",
        "mission_id": mission_id,
    })))
}
