use axum::{extract::State, routing::{get, post}, Json, Router};
use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use tokio::process::Command;
use tracing::{error, info, warn};

use crate::error::AppError;
use crate::redact::redact;
use crate::server::AppState;
use crate::supabase::SupabaseClient;

// ── Constants ────────────────────────────────────────────────────────────────

const REGISTRY_PATH: &str = "/tmp/agent-registry.json";
const MC_BASE_URL: &str = "http://localhost:3000";
const MAX_RETRIES: u32 = 3;

// ── Status constants (mirrors lib/constants.ts) ──────────────────────────────

mod status {
    pub mod agent {
        pub const ACTIVE: &str = "active";
        pub const IDLE: &str = "idle";
    }
    pub mod mission {
        pub const PENDING: &str = "pending";
        pub const ACTIVE: &str = "active";
        pub const DONE: &str = "done";
        pub const FAILED: &str = "failed";
        pub const AWAITING_REVIEW: &str = "awaiting_review";
    }
    pub mod review {
        pub const PENDING: &str = "pending";
        pub const APPROVED: &str = "approved";
        pub const REJECTED: &str = "rejected";
    }
}

// ── Agent routing table ──────────────────────────────────────────────────────

#[derive(Debug, Clone)]
struct AgentRoute {
    agent_id: &'static str,
    model: &'static str,
    flags: &'static str,
    log_prefix: &'static str,
    display_name: &'static str,
    emoji: &'static str,
}

const ROMAN: AgentRoute = AgentRoute {
    agent_id: "fast",
    model: "claude-haiku-4-5",
    flags: "--dangerously-skip-permissions",
    log_prefix: "roman",
    display_name: "Roman",
    emoji: "\u{26A1}",
};

const SONNET: AgentRoute = AgentRoute {
    agent_id: "sonnet",
    model: "claude-sonnet-4-6",
    flags: "--dangerously-skip-permissions",
    log_prefix: "sonnet",
    display_name: "Sonnet",
    emoji: "\u{1F9E9}",
};

const GUNTHER: AgentRoute = AgentRoute {
    agent_id: "koda",
    model: "claude-opus-4-6",
    flags: "--verbose --output-format stream-json --dangerously-skip-permissions",
    log_prefix: "gunther",
    display_name: "Gunther",
    emoji: "\u{1F6E0}\u{FE0F}",
};

const JIRAIYA: AgentRoute = AgentRoute {
    agent_id: "deep",
    model: "claude-opus-4-6",
    flags: "--dangerously-skip-permissions",
    log_prefix: "jiraiya",
    display_name: "Jiraiya",
    emoji: "\u{1F9E0}",
};

const CODEX: AgentRoute = AgentRoute {
    agent_id: "review",
    model: "claude-haiku-4-5",
    flags: "--dangerously-skip-permissions",
    log_prefix: "codex",
    display_name: "Codex",
    emoji: "\u{1F50D}",
};

fn routing_table(name: &str) -> Option<&'static AgentRoute> {
    match name {
        "roman" => Some(&ROMAN),
        "sonnet" => Some(&SONNET),
        "gunther" => Some(&GUNTHER),
        "jiraiya" => Some(&JIRAIYA),
        "codex" => Some(&CODEX),
        _ => None,
    }
}

/// Escalation chain: roman -> sonnet -> jiraiya
fn escalation_target(name: &str) -> Option<&'static str> {
    match name {
        "roman" => Some("sonnet"),
        "sonnet" => Some("jiraiya"),
        _ => None,
    }
}

/// Route a task to an agent based on complexity and task type.
/// - code tasks -> gunther
/// - complexity 0-40 -> roman (haiku)
/// - complexity 41-70 -> sonnet
/// - complexity 71+ -> jiraiya (opus)
fn route_agent(complexity: u32, task_type: &str) -> &'static str {
    if task_type == "code" {
        return "gunther";
    }
    if complexity <= 40 {
        "roman"
    } else if complexity <= 70 {
        "sonnet"
    } else {
        "jiraiya"
    }
}

// ── Validation helpers ───────────────────────────────────────────────────────

fn validate_uuid(id: &str) -> Result<&str, AppError> {
    let re = Regex::new(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
        .unwrap();
    if re.is_match(id) {
        Ok(id)
    } else {
        Err(AppError::BadRequest("Invalid UUID format".into()))
    }
}

fn validate_workdir(workdir: &str) -> Result<&str, AppError> {
    if !workdir.starts_with('/') {
        return Err(AppError::BadRequest("workdir must be an absolute path".into()));
    }
    let re = Regex::new(r"^[a-zA-Z0-9/_.\-]+$").unwrap();
    if !re.is_match(workdir) {
        return Err(AppError::BadRequest("workdir contains invalid characters".into()));
    }
    if workdir.contains("..") {
        return Err(AppError::BadRequest("workdir must not contain \"..\"".into()));
    }
    Ok(workdir)
}

fn slugify(title: &str) -> String {
    let re = Regex::new(r"[^a-z0-9]+").unwrap();
    let lowered = title.to_lowercase();
    let slug = re.replace_all(&lowered, "-");
    let slug = slug.trim_matches('-');
    // After regex replace, slug is ASCII-only (a-z0-9 and hyphens), so byte indexing is safe
    if slug.len() > 40 {
        slug[..40].trim_end_matches('-').to_string()
    } else {
        slug.to_string()
    }
}

/// Shell-escape a string for safe interpolation into bash commands.
fn shell_escape(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}

// ── Agent-registry helpers ───────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct RegistryEntry {
    #[serde(rename = "agentId", default)]
    agent_id: String,
    #[serde(rename = "agentName", default)]
    agent_name: String,
    #[serde(default)]
    emoji: String,
    #[serde(default)]
    task: String,
    #[serde(rename = "logFile", default)]
    log_file: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    mission_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    started_at: Option<String>,
}

type Registry = HashMap<String, RegistryEntry>;

async fn read_registry() -> Registry {
    match tokio::fs::read_to_string(REGISTRY_PATH).await {
        Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
        Err(_) => HashMap::new(),
    }
}

async fn write_registry(registry: &Registry) {
    if let Ok(json) = serde_json::to_string_pretty(registry) {
        let _ = tokio::fs::write(REGISTRY_PATH, json).await;
    }
}

async fn register_process(pid: u32, route: &AgentRoute, task: &str, log_file: &str, mission_id: &str) {
    let mut reg = read_registry().await;
    reg.insert(
        pid.to_string(),
        RegistryEntry {
            agent_id: route.agent_id.to_string(),
            agent_name: route.display_name.to_string(),
            emoji: route.emoji.to_string(),
            task: task.to_string(),
            log_file: log_file.to_string(),
            mission_id: Some(mission_id.to_string()),
            started_at: Some(chrono::Utc::now().to_rfc3339()),
        },
    );
    write_registry(&reg).await;
}

async fn clean_registry_by_mission_id(mission_id: &str) {
    let mut reg = read_registry().await;
    let before = reg.len();
    reg.retain(|_, entry| entry.mission_id.as_deref() != Some(mission_id));
    if reg.len() != before {
        write_registry(&reg).await;
    }
}

// ── Supabase helpers ─────────────────────────────────────────────────────────

fn supabase() -> Result<SupabaseClient, AppError> {
    SupabaseClient::from_env().map_err(|e| {
        warn!("Supabase not configured: {e}");
        AppError::Internal(e)
    })
}

/// Set agent status to active with current task.
async fn set_agent_active(sb: &SupabaseClient, agent_id: &str, task: &str) -> anyhow::Result<Value> {
    sb.update(
        "agents",
        &format!("id=eq.{agent_id}"),
        json!({
            "status": status::agent::ACTIVE,
            "current_task": task,
            "updated_at": chrono::Utc::now().to_rfc3339(),
        }),
    )
    .await
}

/// Set agent status to idle.
async fn set_agent_idle(sb: &SupabaseClient, agent_id: &str) -> anyhow::Result<Value> {
    sb.update(
        "agents",
        &format!("id=eq.{agent_id}"),
        json!({
            "status": status::agent::IDLE,
            "current_task": "",
            "updated_at": chrono::Utc::now().to_rfc3339(),
        }),
    )
    .await
}

/// Fire-and-forget activity log insert.
fn log_activity(sb: &SupabaseClient, params: Value) {
    let sb = sb.clone();
    tokio::spawn(async move {
        if let Err(e) = sb.insert("activity_log", params).await {
            warn!("activity_log insert failed: {e}");
        }
    });
}

/// Fire-and-forget notification via local Ntfy-style endpoint.
fn send_notify(title: &str, message: &str, priority: u8, tags: &[&str]) {
    let body = json!({
        "title": title,
        "message": message,
        "priority": priority,
        "tags": tags,
    });
    tokio::spawn(async move {
        let _ = reqwest::Client::new()
            .post(format!("{MC_BASE_URL}/api/notify"))
            .json(&body)
            .send()
            .await;
    });
}

/// Extract workdir from a mission's spawn_command field (`cd /some/path`).
fn extract_workdir(mission: &Value) -> String {
    let default = std::env::current_dir()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|_| "/tmp".to_string());

    mission["spawn_command"]
        .as_str()
        .and_then(|cmd| {
            let re = Regex::new(r"^cd ([^ ]+)").ok()?;
            re.captures(cmd)?.get(1).map(|m| {
                m.as_str().trim_matches('\'').trim_matches('"').to_string()
            })
        })
        .unwrap_or(default)
}

// ── Exec path for child processes ────────────────────────────────────────────

fn exec_path() -> String {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
    let mut parts: Vec<String> = vec![
        "/usr/local/bin".into(),
        "/usr/bin".into(),
        "/bin".into(),
        format!("{home}/.local/bin"),
        format!("{home}/.npm-global/bin"),
    ];
    if let Ok(p) = std::env::var("PATH") {
        parts.push(p);
    }
    parts.join(":")
}

/// Build a clean env for spawning agent subprocesses.
/// Strips infrastructure secrets — only passes through ANTHROPIC_API_KEY and MC_API_KEY.
fn clean_env(model: &str) -> Vec<(String, String)> {
    let mut env = Vec::new();

    let passthrough = ["HOME", "USER", "PATH", "SHELL", "TERM", "LANG", "ANTHROPIC_API_KEY", "MC_API_KEY"];
    for key in passthrough {
        if let Ok(val) = std::env::var(key) {
            env.push((key.to_string(), val));
        }
    }
    // Override PATH with our exec_path
    env.push(("PATH".to_string(), exec_path()));
    env.push(("ANTHROPIC_MODEL".to_string(), model.to_string()));
    // Exclude CLAUDECODE to prevent "nested session" error
    // Exclude: SUPABASE_*, PROXMOX_*, OPNSENSE_*, CALDAV_*, OPENCLAW_*

    env
}

/// Spawn a detached agent process. Returns the child PID.
async fn spawn_agent_process(
    route: &AgentRoute,
    prompt: &str,
    workdir: &str,
    log_file: &str,
    mission_id: &str,
    task: &str,
) -> Result<u32, AppError> {
    let safe_workdir = validate_workdir(workdir)?;
    let safe_mission_id = validate_uuid(mission_id)?;

    // Write prompt to temp file to avoid shell injection
    let prompt_file = format!("/tmp/prompt-{}.txt", &safe_mission_id[..8]);
    tokio::fs::write(&prompt_file, prompt)
        .await
        .map_err(|e| AppError::Internal(e.into()))?;

    let safe_log_file = shell_escape(log_file);
    let safe_prompt_file = shell_escape(&prompt_file);
    let safe_wd = shell_escape(safe_workdir);

    // Auto-call /api/pipeline/complete when the worker process exits
    // Uses $MC_API_KEY from the clean env — never embed the literal key
    let auto_complete = format!(
        r#"curl -s -X POST {MC_BASE_URL}/api/pipeline/complete -H "Content-Type: application/json" -H "X-API-Key: $MC_API_KEY" -d '{{"mission_id":"{safe_mission_id}","status":"done"}}'"#
    );

    let bash_cmd = format!(
        "cd {safe_wd} && claude {flags} -p \"$(cat {safe_prompt_file})\" > {safe_log_file} 2>&1; rm -f {safe_prompt_file}; {auto_complete}",
        flags = route.flags,
    );

    let env_vars = clean_env(route.model);

    // Use std::process::Command (not tokio) for detached spawning — we don't
    // need async I/O on the child; it runs fully backgrounded.
    let mut cmd = std::process::Command::new("bash");
    cmd.arg("-c").arg(&bash_cmd);
    // Clear env and set clean vars
    cmd.env_clear();
    for (key, val) in &env_vars {
        cmd.env(key, val);
    }

    // Detach the process into its own process group
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        // process_group(0) calls setpgid to detach from parent
        cmd.process_group(0);
    }

    let child = cmd
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|e| {
            error!("Failed to spawn agent process for {}: {e}", route.display_name);
            AppError::Internal(e.into())
        })?;

    let pid = child.id();

    // Register in agent registry
    register_process(pid, route, task, log_file, mission_id).await;

    info!(
        "Spawned {} (pid={}, model={}, mission={})",
        route.display_name, pid, route.model, mission_id
    );

    Ok(pid)
}

// ── Router ───────────────────────────────────────────────────────────────────

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/pipeline/spawn", post(pipeline_spawn))
        .route("/pipeline/complete", post(pipeline_complete))
        .route("/pipeline/review", post(pipeline_review))
        .route("/pipeline-events", get(get_pipeline_events).post(post_pipeline_event))
}

// ── POST /pipeline/spawn ─────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct SpawnBody {
    title: String,
    complexity: u32,
    task_type: String,
    description: Option<String>,
    workdir: Option<String>,
    images: Option<Vec<String>>,
}

async fn pipeline_spawn(
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
         curl -s -X POST {MC_BASE_URL}/api/pipeline/complete -H \"Content-Type: application/json\" -H \"X-API-Key: $MC_API_KEY\" \
         -d '{{\"mission_id\":\"{safe_mid}\",\"status\":\"done\"}}'",
        model = shell_escape(route.model),
        flags = route.flags,
        prompt = shell_escape(&worker_prompt),
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

// ── POST /pipeline/complete ──────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct CompleteBody {
    mission_id: String,
    status: String,
    failure_reason: Option<String>,
}

async fn pipeline_complete(
    State(_state): State<AppState>,
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

    let sb = supabase()?;
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

// ── POST /pipeline/review ────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct ReviewBody {
    mission_id: String,
    verdict: String,
    notes: Option<String>,
}

async fn pipeline_review(
    State(_state): State<AppState>,
    Json(body): Json<ReviewBody>,
) -> Result<Json<Value>, AppError> {
    if body.mission_id.is_empty() {
        return Err(AppError::BadRequest("mission_id is required".into()));
    }
    if body.verdict != "approved" && body.verdict != "rejected" {
        return Err(AppError::BadRequest(
            "verdict must be \"approved\" or \"rejected\"".into(),
        ));
    }

    let sb = supabase()?;
    let mission_id = &body.mission_id;

    // Fetch mission
    let mission = sb
        .select_single("missions", &format!("select=*&id=eq.{mission_id}"))
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
            sb.update(
                "missions",
                &mission_query,
                json!({
                    "status": status::mission::DONE,
                    "review_status": status::review::APPROVED,
                    "review_notes": body.notes,
                    "progress": 100,
                    "updated_at": chrono::Utc::now().to_rfc3339(),
                }),
            ),
            set_agent_idle(&sb, codex_route.agent_id),
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
        sb.update(
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
        ),
        set_agent_idle(&sb, codex_route.agent_id),
        set_agent_active(&sb, gunther_route.agent_id, &fix_task),
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
            let _ = set_agent_idle(&sb, gunther_route.agent_id).await;
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

// ── GET /pipeline-events ─────────────────────────────────────────────────────

async fn get_pipeline_events(
    State(_state): State<AppState>,
) -> Result<Json<Value>, AppError> {
    let sb = supabase()?;
    let data = sb
        .select(
            "pipeline_events",
            "select=*&order=created_at.desc&limit=50",
        )
        .await
        .map_err(|e| {
            error!("pipeline_events select: {e}");
            AppError::Internal(anyhow::anyhow!("Database error"))
        })?;

    Ok(Json(json!({ "events": data })))
}

// ── POST /pipeline-events ────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct PipelineEventBody {
    event_type: String,
    description: String,
    agent_id: Option<String>,
    mission_id: Option<String>,
    idea_id: Option<String>,
    metadata: Option<Value>,
}

async fn post_pipeline_event(
    State(_state): State<AppState>,
    Json(body): Json<PipelineEventBody>,
) -> Result<Json<Value>, AppError> {
    if body.event_type.is_empty() || body.description.is_empty() {
        return Err(AppError::BadRequest(
            "event_type and description required".into(),
        ));
    }

    let sb = supabase()?;
    let row = json!({
        "event_type": body.event_type,
        "agent_id": body.agent_id,
        "mission_id": body.mission_id,
        "idea_id": body.idea_id,
        "description": body.description,
        "metadata": body.metadata,
    });

    let result = sb.insert("pipeline_events", row).await.map_err(|e| {
        error!("pipeline_events insert: {e}");
        AppError::Internal(anyhow::anyhow!("Database error"))
    })?;

    // insert returns array; get first element
    let event = match &result {
        Value::Array(arr) if !arr.is_empty() => arr[0].clone(),
        other => other.clone(),
    };

    Ok(Json(json!({ "event": event })))
}
