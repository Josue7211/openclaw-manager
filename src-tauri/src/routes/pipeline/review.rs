use axum::{extract::State, Json};
use serde::Deserialize;
use serde_json::{json, Value};
use tracing::error;

use crate::error::AppError;
use crate::server::{AppState, RequireAuth};

use super::agents::{status, CODEX, GUNTHER};
use super::helpers::{
    extract_workdir, log_activity, send_notify, set_agent_active, set_agent_idle,
    spawn_agent_process, supabase, validate_uuid,
};
use super::registry::clean_registry_by_mission_id;

// ── POST /pipeline/review ────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub(super) struct ReviewBody {
    mission_id: String,
    verdict: String,
    notes: Option<String>,
}

pub(super) async fn pipeline_review(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Json(body): Json<ReviewBody>,
) -> Result<Json<Value>, AppError> {
    if body.mission_id.is_empty() {
        return Err(AppError::BadRequest("mission_id is required".into()));
    }
    validate_uuid(&body.mission_id)?;
    if body.verdict != "approved" && body.verdict != "rejected" {
        return Err(AppError::BadRequest(
            "verdict must be \"approved\" or \"rejected\"".into(),
        ));
    }

    let sb = supabase(&state)?;
    let jwt = &session.access_token;
    let mission_id = &body.mission_id;

    // Fetch mission
    let mission = sb
        .select_single_as_user("missions", &format!("select=*&id=eq.{mission_id}"), jwt)
        .await
        .map_err(|_| AppError::NotFound("Mission not found".into()))?;

    if mission["review_status"].as_str() != Some(status::review::PENDING) {
        return Err(AppError::BadRequest(format!(
            "Mission review_status is \"{}\", not \"pending\". Nothing to review.",
            mission["review_status"].as_str().unwrap_or("null")
        )));
    }

    let codex_route = &CODEX;
    let mission_title = mission["title"].as_str().unwrap_or("").to_string();

    // ── Approved ─────────────────────────────────────────────────
    if body.verdict == "approved" {
        let mission_query = format!("id=eq.{mission_id}");
        let _ = tokio::join!(
            sb.update_as_user(
                "missions",
                &mission_query,
                json!({
                    "status": status::mission::DONE,
                    "review_status": status::review::APPROVED,
                    "review_notes": body.notes,
                    "progress": 100,
                    "updated_at": chrono::Utc::now().to_rfc3339(),
                }),
                jwt,
            ),
            set_agent_idle(&sb, codex_route.agent_id, jwt),
        );

        log_activity(
            &sb,
            json!({
                "mission_id": mission_id,
                "agent_id": codex_route.agent_id,
                "event_type": "pipeline_review_approved",
                "description": format!(
                    "Codex approved: \"{}\"{}",
                    mission_title,
                    body.notes.as_ref().map(|n| format!(" -- {n}")).unwrap_or_default()
                ),
                "metadata": { "verdict": "approved", "notes": body.notes },
            }),
            jwt,
        );

        // Clean registry (fire-and-forget)
        let mid = mission_id.clone();
        tokio::spawn(async move {
            clean_registry_by_mission_id(&mid).await;
        });

        send_notify(
            "Review Approved",
            &format!("\"{}\" -- ready for deploy", mission_title),
            3,
            &["white_check_mark"],
        );

        return Ok(Json(json!({
            "action": "approved",
            "message": "Review approved. Safe to deploy.",
            "mission_id": mission_id,
            "can_deploy": true,
        })));
    }

    // ── Rejected -> auto-spawn Gunther to fix ─────────────────────
    let gunther_route = &GUNTHER;
    let workdir = extract_workdir(&mission);
    let fix_log_file = format!("/tmp/gunther-fix-{}.log", &mission_id[..mission_id.len().min(8)]);

    // Update mission + reset Codex + activate Gunther in parallel
    let mission_query = format!("id=eq.{mission_id}");
    let fix_task = format!("Fix: {}", mission_title);
    let _ = tokio::join!(
        sb.update_as_user(
            "missions",
            &mission_query,
            json!({
                "status": status::mission::ACTIVE,
                "review_status": status::review::REJECTED,
                "review_notes": body.notes,
                "progress": 50,
                "log_path": fix_log_file,
                "assignee": gunther_route.agent_id,
                "updated_at": chrono::Utc::now().to_rfc3339(),
            }),
            jwt,
        ),
        set_agent_idle(&sb, codex_route.agent_id, jwt),
        set_agent_active(&sb, gunther_route.agent_id, &fix_task, jwt),
    );

    log_activity(
        &sb,
        json!({
            "mission_id": mission_id,
            "agent_id": codex_route.agent_id,
            "event_type": "pipeline_review_rejected",
            "description": format!(
                "Codex rejected: \"{}\" -- {}. Auto-spawning Gunther to fix.",
                mission_title,
                body.notes.as_deref().unwrap_or("no notes")
            ),
            "metadata": { "verdict": "rejected", "notes": body.notes },
        }),
        jwt,
    );

    // Build fix prompt
    let fix_prompt = format!(
        "Task: Fix issues in \"{mission_title}\"\n\n\
         Codex (the code reviewer) rejected the previous changes with these notes:\n\
         {notes}\n\n\
         Fix the issues described above. Do NOT rewrite everything -- make targeted fixes based on the review feedback.\n\
         When done, output a summary of what you fixed.\n\
         \nWorking directory: {workdir}",
        notes = body.notes.as_deref().unwrap_or("No specific notes provided."),
    );

    // Spawn Gunther
    let mut fix_pid: u32 = 0;
    match spawn_agent_process(
        gunther_route,
        &fix_prompt,
        &workdir,
        &fix_log_file,
        mission_id,
        &format!("Fix: {}", mission_title),
    )
    .await
    {
        Ok(pid) => fix_pid = pid,
        Err(e) => {
            error!("[pipeline/review] Failed to spawn Gunther for fix: {e:?}");
            let _ = set_agent_idle(&sb, gunther_route.agent_id, jwt).await;
        }
    }

    send_notify(
        "Review Rejected -> Gunther Fixing",
        &format!(
            "\"{}\" -- {}",
            mission_title,
            body.notes.as_deref().unwrap_or("see review")
        ),
        4,
        &["x", "hammer"],
    );

    Ok(Json(json!({
        "action": "rejected_auto_fix",
        "message": "Review rejected. Gunther auto-spawned to fix. Will auto-review again when done.",
        "mission_id": mission_id,
        "review_notes": body.notes,
        "gunther_pid": fix_pid,
        "gunther_log": fix_log_file,
    })))
}
