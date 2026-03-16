use regex::Regex;
use serde_json::{json, Value};
use tracing::{error, info, warn};

use crate::error::AppError;
use crate::supabase::SupabaseClient;

use super::agents::{status, AgentRoute, MC_BASE_URL};
use super::registry::register_process;

// ── Validation helpers ───────────────────────────────────────────────────────

pub(super) fn validate_uuid(id: &str) -> Result<&str, AppError> {
    let re = Regex::new(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
        .unwrap();
    if re.is_match(id) {
        Ok(id)
    } else {
        Err(AppError::BadRequest("Invalid UUID format".into()))
    }
}

pub(super) fn validate_workdir(workdir: &str) -> Result<&str, AppError> {
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

pub(super) fn slugify(title: &str) -> String {
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
pub(super) fn shell_escape(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}

/// Validate that CLI flags only contain known Claude CLI flags.
/// Prevents command injection through the `flags` field of AgentRoute.
pub(super) fn validate_cli_flags(flags: &str) -> Result<&str, AppError> {
    if flags.is_empty() {
        return Ok(flags);
    }
    let allowed_prefixes = [
        "--model",
        "--max-turns",
        "--verbose",
        "-v",
        "--allowedTools",
        "--output-format",
        "--dangerously-skip-permissions",
    ];
    let parts: Vec<&str> = flags.split_whitespace().collect();
    for (i, part) in parts.iter().enumerate() {
        if part.starts_with('-') {
            if !allowed_prefixes.iter().any(|prefix| part.starts_with(prefix)) {
                return Err(AppError::BadRequest(format!("disallowed CLI flag: {}", part)));
            }
        } else if i == 0 {
            // First token must be a flag, not a bare argument
            return Err(AppError::BadRequest("unexpected argument".into()));
        } else {
            // Flag value — reject shell metacharacters
            if part.contains(';')
                || part.contains('|')
                || part.contains('`')
                || part.contains('$')
                || part.contains('(')
                || part.contains(')')
                || part.contains('\n')
                || part.contains('\r')
            {
                return Err(AppError::BadRequest(
                    "invalid characters in flag value".into(),
                ));
            }
        }
    }
    Ok(flags)
}

// ── Supabase helpers ─────────────────────────────────────────────────────────

pub(super) fn supabase(state: &crate::server::AppState) -> Result<SupabaseClient, AppError> {
    SupabaseClient::from_state(state).map_err(|e| {
        warn!("Supabase not configured: {e}");
        AppError::Internal(e)
    })
}

/// Set agent status to active with current task.
pub(super) async fn set_agent_active(sb: &SupabaseClient, agent_id: &str, task: &str) -> anyhow::Result<Value> {
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
pub(super) async fn set_agent_idle(sb: &SupabaseClient, agent_id: &str) -> anyhow::Result<Value> {
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
pub(super) fn log_activity(sb: &SupabaseClient, params: Value) {
    let sb = sb.clone();
    tokio::spawn(async move {
        if let Err(e) = sb.insert("activity_log", params).await {
            warn!("activity_log insert failed: {e}");
        }
    });
}

/// Fire-and-forget notification via local Ntfy-style endpoint.
pub(super) fn send_notify(title: &str, message: &str, priority: u8, tags: &[&str]) {
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
pub(super) fn extract_workdir(mission: &Value) -> String {
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

pub(super) fn exec_path() -> String {
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
/// System vars (HOME, USER, etc.) are read from `std::env::var` (they are not secrets).
/// Actual secrets come from the AppState HashMap.
#[allow(dead_code)]
pub(super) fn clean_env(state: &crate::server::AppState, model: &str) -> Vec<(String, String)> {
    let mut env = Vec::new();

    // System (non-secret) env vars
    let system_passthrough = ["HOME", "USER", "PATH", "SHELL", "TERM", "LANG"];
    for key in system_passthrough {
        if let Ok(val) = std::env::var(key) {
            env.push((key.to_string(), val));
        }
    }
    // Secrets from AppState
    let secret_passthrough = ["ANTHROPIC_API_KEY", "MC_API_KEY"];
    for key in secret_passthrough {
        if let Some(val) = state.secret(key) {
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

/// Fallback version of `clean_env` for code paths that don't have access to AppState.
/// Reads ANTHROPIC_API_KEY and MC_API_KEY from process env (only works if .env.local is loaded).
/// TODO: Remove this once spawn_agent_process accepts &AppState.
fn clean_env_from_env(model: &str) -> Vec<(String, String)> {
    let mut env = Vec::new();
    let passthrough = ["HOME", "USER", "PATH", "SHELL", "TERM", "LANG", "ANTHROPIC_API_KEY", "MC_API_KEY"];
    for key in passthrough {
        if let Ok(val) = std::env::var(key) {
            env.push((key.to_string(), val));
        }
    }
    env.push(("PATH".to_string(), exec_path()));
    env.push(("ANTHROPIC_MODEL".to_string(), model.to_string()));
    env
}

/// Spawn a detached agent process. Returns the child PID.
pub(super) async fn spawn_agent_process(
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

    // Validate CLI flags before interpolating into the shell command
    let validated_flags = validate_cli_flags(route.flags)?;

    // Auto-call /api/pipeline/complete when the worker process exits
    // Uses $MC_API_KEY from the clean env — never embed the literal key
    let auto_complete = format!(
        r#"curl -s -X POST {MC_BASE_URL}/api/pipeline/complete -H "Content-Type: application/json" -H "X-API-Key: $MC_API_KEY" -d '{{"mission_id":"{safe_mission_id}","status":"done"}}'"#
    );

    let bash_cmd = format!(
        "cd {safe_wd} && claude {flags} -p \"$(cat {safe_prompt_file})\" > {safe_log_file} 2>&1; rm -f {safe_prompt_file}; {auto_complete}",
        flags = validated_flags,
    );

    // TODO: spawn_agent_process should accept &AppState to pass secrets to clean_env.
    // For now, read ANTHROPIC_API_KEY and MC_API_KEY from the process env as a fallback,
    // which will only work if .env.local is loaded by dotenvy (dev mode).
    let env_vars = clean_env_from_env(route.model);

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
