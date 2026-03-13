use axum::{extract::State, Json};
use serde::Deserialize;
use serde_json::{json, Value};
use tracing::error;

use crate::error::AppError;
use crate::server::AppState;

use super::agents::{status, route_agent, routing_table};
use super::helpers::{
    log_activity, send_notify, set_agent_active, shell_escape, slugify, supabase,
    validate_uuid, validate_workdir,
};

// ── POST /pipeline/spawn ─────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub(super) struct SpawnBody {
    title: String,
    complexity: u32,
    task_type: String,
    description: Option<String>,
    workdir: Option<String>,
    images: Option<Vec<String>>,
}

pub(super) async fn pipeline_spawn(
    State(_state): State<AppState>,
    Json(body): Json<SpawnBody>,
) -> Result<Json<Value>, AppError> {
    // ── Validate ─────────────────────────────────────────────────
    let title = body.title.trim();
    if title.is_empty() {
        return Err(AppError::BadRequest("title is required".into()));
    }
    if body.complexity > 100 {
        return Err(AppError::BadRequest("complexity must be 0-100".into()));
    }
    let task_type = body.task_type.as_str();
    if task_type.is_empty() {
        return Err(AppError::BadRequest(
            "task_type is required (code | non-code | research | config)".into(),
        ));
    }

    let sb = supabase()?;

    // ── Route ────────────────────────────────────────────────────
    let agent_name = route_agent(body.complexity, task_type);
    let route = routing_table(agent_name).ok_or_else(|| {
        AppError::Internal(anyhow::anyhow!("Unknown agent: {agent_name}"))
    })?;

    // ── Check agent availability ─────────────────────────────────
    let agent_data = sb
        .select_single("agents", &format!("select=status,current_task&id=eq.{}", route.agent_id))
        .await;

    if let Ok(ref agent) = agent_data {
        if agent["status"].as_str() == Some(status::agent::ACTIVE) {
            let current_task = agent["current_task"].as_str().unwrap_or("unknown");
            return Ok(Json(json!({
                "error": format!("{} is already active on: \"{}\". Wait or use a parallel worker.", route.display_name, current_task),
                "agent": agent_name,
                "agent_status": "active",
            })));
        }
    }

    // ── Build spawn command ──────────────────────────────────────
    let slug = slugify(title);
    let log_file = format!("/tmp/{}-{}.log", route.log_prefix, slug);

    let project_dir = std::env::current_dir()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|_| "/tmp".to_string());

    let cwd = match &body.workdir {
        Some(wd) if !wd.is_empty() => {
            validate_workdir(wd)?;
            wd.clone()
        }
        _ => project_dir,
    };

    // Build image attachment section if images provided
    let chat_images_dir = {
        let openclaw_dir = std::env::var("OPENCLAW_DIR").unwrap_or_else(|_| {
            dirs::home_dir()
                .map(|h| h.join(".openclaw").to_string_lossy().into_owned())
                .unwrap_or_else(|| ".openclaw".to_string())
        });
        format!("{openclaw_dir}/media/chat-images")
    };

    let img_paths: Vec<&str> = body
        .images
        .as_deref()
        .unwrap_or(&[])
        .iter()
        .filter_map(|p| {
            if p.starts_with(&chat_images_dir) {
                Some(p.as_str())
            } else {
                None
            }
        })
        .collect();

    let mut prompt_parts = vec![format!("Task: {title}")];
    if let Some(ref desc) = body.description {
        if !desc.is_empty() {
            prompt_parts.push(format!("\nContext: {desc}"));
        }
    }
    if !img_paths.is_empty() {
        let img_list: Vec<String> = img_paths.iter().map(|p| format!("- {p}")).collect();
        prompt_parts.push(format!(
            "\nAttached images (use your Read tool to view these):\n{}",
            img_list.join("\n")
        ));
    }
    prompt_parts.push(format!("\nWorking directory: {cwd}"));
    prompt_parts.push("\nWhen done, output a summary of what you changed.".to_string());
    let worker_prompt = prompt_parts.join("\n");

    // ── Create mission (need ID for auto-complete in spawn command) ──
    let review_required = task_type == "code";
    let mission_insert = json!({
        "title": title,
        "assignee": route.agent_id,
        "status": status::mission::ACTIVE,
        "complexity": body.complexity,
        "task_type": task_type,
        "review_status": if review_required { Some(status::review::PENDING) } else { None },
        "routed_agent": agent_name,
        "spawn_command": "",
        "log_path": log_file,
    });

    let mission_result = sb.insert("missions", mission_insert).await.map_err(|e| {
        error!("[pipeline/spawn] mission create: {e}");
        AppError::Internal(anyhow::anyhow!("Failed to create mission"))
    })?;

    // insert returns an array; grab the first element
    let mission = match &mission_result {
        Value::Array(arr) if !arr.is_empty() => arr[0].clone(),
        other => other.clone(),
    };

    let mission_id = mission["id"]
        .as_str()
        .ok_or_else(|| AppError::Internal(anyhow::anyhow!("Mission insert did not return an id")))?
        .to_string();

    // ── Build spawn command string and update mission ────────────
    let safe_wd = shell_escape(&cwd);
    let safe_log = shell_escape(&log_file);
    let safe_mid = validate_uuid(&mission_id)?;
    let spawn_command = format!(
        "cd {safe_wd} && unset CLAUDECODE && ANTHROPIC_MODEL={model} claude {flags} -p {prompt} > {safe_log} 2>&1; \
         curl -s -X POST {mc_base_url}/api/pipeline/complete -H \"Content-Type: application/json\" -H \"X-API-Key: $MC_API_KEY\" \
         -d '{{\"mission_id\":\"{safe_mid}\",\"status\":\"done\"}}'",
        model = shell_escape(route.model),
        flags = route.flags,
        prompt = shell_escape(&worker_prompt),
        mc_base_url = super::agents::MC_BASE_URL,
    );

    // Update the mission with the spawn_command (fire-and-forget is fine)
    let sb2 = sb.clone();
    let mid = mission_id.clone();
    let sc = spawn_command.clone();
    tokio::spawn(async move {
        let _ = sb2
            .update("missions", &format!("id=eq.{mid}"), json!({ "spawn_command": sc }))
            .await;
    });

    // ── Mark agent active ────────────────────────────────────────
    if let Err(e) = set_agent_active(&sb, route.agent_id, title).await {
        error!("[pipeline/spawn] agent activate: {e}");
        // Rollback: delete the mission
        let _ = sb.delete("missions", &format!("id=eq.{mission_id}")).await;
        return Err(AppError::Internal(anyhow::anyhow!("Failed to activate agent")));
    }

    // ── Log + notify (fire-and-forget) ───────────────────────────
    log_activity(
        &sb,
        json!({
            "mission_id": mission_id,
            "agent_id": route.agent_id,
            "event_type": "pipeline_spawn",
            "description": format!(
                "Pipeline spawned {} ({}) for \"{}\" [complexity: {}%, type: {}]",
                route.display_name, route.model, title, body.complexity, task_type
            ),
            "metadata": {
                "complexity": body.complexity,
                "task_type": task_type,
                "agent": agent_name,
                "model": route.model,
            },
        }),
    );

    send_notify(
        "Mission Spawned",
        &format!("{} {} -> {} [{}%]", route.emoji, route.display_name, title, body.complexity),
        3,
        &["rocket"],
    );

    // ── Registry command for Bjorn ───────────────────────────────
    let registry_entry = json!({
        "agentId": route.agent_id,
        "agentName": route.display_name,
        "emoji": route.emoji,
        "task": title,
        "logFile": log_file,
        "mission_id": mission_id,
        "started_at": chrono::Utc::now().to_rfc3339(),
    });
    let registry_command = format!(
        "node -e \"\nconst fs = require('fs');\n\
         const reg = JSON.parse(fs.readFileSync('/tmp/agent-registry.json','utf8').toString() || '{{}}');\n\
         reg[process.argv[1]] = {};\n\
         fs.writeFileSync('/tmp/agent-registry.json', JSON.stringify(reg,null,2));\n\" PID_HERE",
        serde_json::to_string(&registry_entry).unwrap_or_default()
    );

    Ok(Json(json!({
        "mission": mission,
        "agent": {
            "name": agent_name,
            "display_name": route.display_name,
            "emoji": route.emoji,
            "id": route.agent_id,
            "model": route.model,
        },
        "spawn_command": spawn_command,
        "registry_command": registry_command,
        "log_file": log_file,
        "review_required": review_required,
    })))
}
