use axum::{Router, routing::get, Json, extract::State};
use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::path::Path;
use tokio::process::Command;

use crate::error::AppError;
use crate::redact::redact;
use crate::server::AppState;

// ── Helpers ──────────────────────────────────────────────────────────────────

/// Resolve the openclaw base directory (~/.openclaw by default).
fn openclaw_dir() -> String {
    std::env::var("OPENCLAW_DIR").unwrap_or_else(|_| {
        dirs::home_dir()
            .map(|h| h.join(".openclaw").to_string_lossy().into_owned())
            .unwrap_or_else(|| ".openclaw".to_string())
    })
}

/// Build a PATH suitable for child-process execution.
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

const REGISTRY_PATH: &str = "/tmp/agent-registry.json";
const LOG_PATH_RE: &str = r"^/tmp/[a-zA-Z0-9._-]+\.log$";

// ── Registry types ───────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct RegistryEntry {
    #[serde(rename = "agentId", default)]
    agent_id: Option<String>,
    #[serde(rename = "agentName", default)]
    agent_name: Option<String>,
    #[serde(default)]
    emoji: Option<String>,
    #[serde(default)]
    task: Option<String>,
    #[serde(rename = "logFile", default)]
    log_file: Option<String>,
    #[serde(default)]
    mission_id: Option<String>,
    #[serde(default)]
    mission_title: Option<String>,
    #[serde(default)]
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

// ── Router ───────────────────────────────────────────────────────────────────

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/status", get(get_status))
        .route("/heartbeat", get(heartbeat))
        .route("/processes", get(get_processes).post(post_process))
}

// ── GET /api/status ──────────────────────────────────────────────────────────

async fn get_status(State(_state): State<AppState>) -> Result<Json<Value>, AppError> {
    let base = openclaw_dir();
    let identity_path = Path::new(&base).join("workspace").join("IDENTITY.md");

    let (name, emoji) = if identity_path.exists() {
        let content = tokio::fs::read_to_string(&identity_path)
            .await
            .unwrap_or_default();
        // TS uses regex: /\*\*Name:\*\*\s*(.+)/ — match both bold-markdown and plain
        let name = content
            .lines()
            .find_map(|l| {
                if let Some(rest) = l.strip_prefix("**Name:**") {
                    Some(rest.trim().to_string())
                } else if l.starts_with("Name:") {
                    Some(l.trim_start_matches("Name:").trim().to_string())
                } else {
                    None
                }
            })
            .unwrap_or_else(|| "Bjorn".to_string());
        let emoji = content
            .lines()
            .find_map(|l| {
                if let Some(rest) = l.strip_prefix("**Emoji:**") {
                    Some(rest.trim().to_string())
                } else if l.starts_with("Emoji:") {
                    Some(l.trim_start_matches("Emoji:").trim().to_string())
                } else {
                    None
                }
            })
            .unwrap_or_else(|| "\u{1F9AC}".to_string());
        (name, emoji)
    } else {
        ("Bjorn".to_string(), "\u{1F9AC}".to_string())
    };

    Ok(Json(json!({
        "name": name,
        "emoji": emoji,
        "model": "claude-sonnet-4-6",
        "status": "online",
        "lastActive": chrono::Utc::now().to_rfc3339(),
        "host": hostname(),
        "ip": local_ip(),
    })))
}

/// Best-effort hostname.
fn hostname() -> String {
    std::fs::read_to_string("/etc/hostname")
        .map(|s| s.trim().to_string())
        .unwrap_or_else(|_| "localhost".to_string())
}

/// Best-effort local IP by reading the default route interface address.
fn local_ip() -> String {
    // Quick heuristic: check common interface env or fall back
    "127.0.0.1".to_string()
}

// ── GET /api/status/heartbeat ────────────────────────────────────────────────

fn parse_heartbeat_tasks(content: &str) -> Vec<String> {
    content
        .lines()
        .filter(|l| {
            let trimmed = l.trim();
            !trimmed.is_empty() && !trimmed.starts_with('#')
        })
        .map(|l| l.trim().to_string())
        .collect()
}

async fn heartbeat(State(state): State<AppState>) -> Result<Json<Value>, AppError> {
    let base = openclaw_dir();
    let heartbeat_path = Path::new(&base).join("workspace").join("HEARTBEAT.md");

    if heartbeat_path.exists() {
        let last_check = match tokio::fs::metadata(&heartbeat_path).await {
            Ok(meta) => meta
                .modified()
                .ok()
                .map(|t| {
                    let dt: chrono::DateTime<chrono::Utc> = t.into();
                    dt.to_rfc3339()
                }),
            Err(_) => None,
        };

        let content = tokio::fs::read_to_string(&heartbeat_path)
            .await
            .unwrap_or_default();

        return Ok(Json(json!({
            "lastCheck": last_check,
            "status": "ok",
            "tasks": parse_heartbeat_tasks(&content),
        })));
    }

    // No local file — try fetching HEARTBEAT.md from the remote OpenClaw API
    let openclaw_url = std::env::var("OPENCLAW_API_URL").unwrap_or_default();
    if !openclaw_url.is_empty() {
        let url = format!(
            "{}/file?path=HEARTBEAT.md",
            openclaw_url.trim_end_matches('/')
        );
        let mut req = state.http.get(&url);
        if let Ok(key) = std::env::var("OPENCLAW_API_KEY") {
            req = req.header("Authorization", format!("Bearer {key}"));
        }
        if let Ok(resp) = req.send().await {
            if resp.status().is_success() {
                if let Ok(data) = resp.json::<Value>().await {
                    let content = data
                        .get("content")
                        .and_then(|v| v.as_str())
                        .unwrap_or("");
                    return Ok(Json(json!({
                        "lastCheck": chrono::Utc::now().to_rfc3339(),
                        "status": "ok",
                        "tasks": parse_heartbeat_tasks(content),
                    })));
                }
            }
        }
    }

    Ok(Json(
        json!({ "lastCheck": null, "status": "unknown", "tasks": [] }),
    ))
}

// ── GET /api/status/processes ────────────────────────────────────────────────

#[derive(Debug, Serialize)]
struct ProcessEntry {
    pid: String,
    cmd: String,
    cpu: String,
    mem: String,
    elapsed: String,
    #[serde(rename = "logFile")]
    log_file: Option<String>,
    #[serde(rename = "agentName")]
    agent_name: Option<String>,
    #[serde(rename = "agentEmoji")]
    agent_emoji: Option<String>,
    #[serde(rename = "lastLogLine")]
    last_log_line: Option<String>,
    task: Option<String>,
    mission_id: Option<String>,
    mission_title: Option<String>,
    started_at: Option<String>,
}

async fn get_processes(State(_state): State<AppState>) -> Result<Json<Value>, AppError> {
    // Run: ps aux | grep -E 'claude|haiku|sonnet|opus' | grep -v grep | grep -v 'next-server'
    let ps_output = Command::new("bash")
        .arg("-c")
        .arg("ps aux | grep -E 'claude|haiku|sonnet|opus' | grep -v grep | grep -v 'next-server'")
        .env("PATH", exec_path())
        .output()
        .await;

    let stdout = match ps_output {
        Ok(out) => String::from_utf8_lossy(&out.stdout).to_string(),
        Err(_) => {
            return Ok(Json(
                json!({ "processes": [], "agents": [], "error": "monitoring_error" }),
            ));
        }
    };

    // Get our own PID to exclude
    let own_pid = std::process::id().to_string();

    // Parse ps lines, filtering out own PID and bash wrappers
    let lines: Vec<&str> = stdout
        .lines()
        .filter(|line| {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() < 11 {
                return false;
            }
            let pid = parts[1];
            if pid == own_pid {
                return false;
            }
            // Filter out bash wrapper processes
            let cmd = parts[10..].join(" ");
            !cmd.contains("/bin/bash -c") && !cmd.contains("bash -c")
        })
        .collect();

    let pids: Vec<String> = lines
        .iter()
        .filter_map(|line| {
            let parts: Vec<&str> = line.split_whitespace().collect();
            parts.get(1).map(|s| s.to_string())
        })
        .collect();

    // Read registry and clean stale entries
    let mut registry = read_registry().await;
    let live_pid_set: HashSet<String> = pids.iter().cloned().collect();
    let mut registry_dirty = false;

    // Collect stale PIDs
    let stale_pids: Vec<String> = registry
        .keys()
        .filter(|pid| {
            // Non-numeric PIDs are invalid
            if !pid.chars().all(|c| c.is_ascii_digit()) {
                return true; // will be cleaned
            }
            !live_pid_set.contains(*pid)
        })
        .cloned()
        .collect();

    // Check child processes for stale PIDs — remap if child is alive
    for registered_pid in &stale_pids {
        if !registered_pid.chars().all(|c| c.is_ascii_digit()) {
            registry.remove(registered_pid);
            registry_dirty = true;
            continue;
        }
        // Try to find a child claude process
        let child_result = Command::new("pgrep")
            .args(["-P", registered_pid, "claude"])
            .env("PATH", exec_path())
            .output()
            .await;

        if let Ok(out) = child_result {
            let child_pid = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if !child_pid.is_empty() && live_pid_set.contains(&child_pid) {
                // Remap registry entry from parent PID to child PID
                if let Some(entry) = registry.remove(registered_pid) {
                    registry.insert(child_pid, entry);
                }
                registry_dirty = true;
            } else {
                registry.remove(registered_pid);
                registry_dirty = true;
            }
        } else {
            registry.remove(registered_pid);
            registry_dirty = true;
        }
    }

    if registry_dirty {
        write_registry(&registry).await;
    }

    // Get CPU core count for normalizing ps CPU values
    let ncpus = get_ncpus().await;

    // Gather log matches and top stats concurrently
    let (pid_log_map, top_map) = tokio::join!(
        match_pids_to_logs(&pids),
        get_top_cpu_mem(&pids),
    );

    // Regex for redacting prompt content from command lines (two patterns since regex crate doesn't support backreferences)
    let prompt_re_single = Regex::new(r#"-p\s+'[^']*'"#).unwrap_or_else(|_| Regex::new(r"$^").unwrap());
    let prompt_re_double = Regex::new(r#"-p\s+"[^"]*""#).unwrap_or_else(|_| Regex::new(r"$^").unwrap());
    let prompt_file_re = Regex::new(r#"-p\s+"?\$\(cat [^)]+\)"?"#).unwrap_or_else(|_| Regex::new(r"$^").unwrap());

    let processes: Vec<ProcessEntry> = lines
        .iter()
        .map(|line| {
            let parts: Vec<&str> = line.split_whitespace().collect();
            // USER PID %CPU %MEM VSZ RSS TTY STAT START TIME COMMAND...
            let pid = parts.get(1).unwrap_or(&"").to_string();
            let ps_cpu: f64 = parts.get(2).and_then(|s| s.parse().ok()).unwrap_or(0.0);
            let ps_mem = parts.get(3).unwrap_or(&"0").to_string();
            let elapsed = parts.get(9).unwrap_or(&"").to_string();
            let raw_cmd = if parts.len() > 10 {
                parts[10..].join(" ")
            } else {
                String::new()
            };
            // Redact prompt content
            let redacted1 = prompt_re_single.replace_all(&raw_cmd, "-p [redacted]");
            let redacted2 = prompt_re_double.replace_all(&redacted1, "-p [redacted]");
            let cmd = prompt_file_re
                .replace_all(&redacted2, "-p [prompt-file]")
                .to_string();

            // Prefer top's instantaneous values; fall back to ps normalized by core count
            let (cpu, mem) = if let Some(top_entry) = top_map.get(&pid) {
                (top_entry.0.clone(), top_entry.1.clone())
            } else {
                (format!("{:.1}", ps_cpu / ncpus as f64), ps_mem)
            };

            let log_entry = pid_log_map.get(&pid);
            let reg_entry = registry.get(&pid);

            ProcessEntry {
                pid: pid.clone(),
                cmd,
                cpu,
                mem,
                elapsed,
                log_file: reg_entry
                    .and_then(|r| r.log_file.clone())
                    .or_else(|| log_entry.as_ref().map(|l| l.log_file.clone())),
                agent_name: reg_entry.and_then(|r| r.agent_name.clone()),
                agent_emoji: reg_entry.and_then(|r| r.emoji.clone()),
                last_log_line: log_entry.as_ref().and_then(|l| l.last_log_line.clone()),
                task: reg_entry.and_then(|r| r.task.clone()),
                mission_id: reg_entry.and_then(|r| r.mission_id.clone()),
                mission_title: reg_entry.and_then(|r| r.mission_title.clone()),
                started_at: reg_entry.and_then(|r| r.started_at.clone()),
            }
        })
        .collect();

    // Note: agent DB sync is omitted — there's no Supabase connection in the Tauri app.
    // The frontend can handle agent status syncing if needed.

    Ok(Json(json!({ "processes": processes, "agents": [] })))
}

// ── POST /api/status/processes ───────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct RegisterProcessBody {
    pid: String,
    #[serde(rename = "agentId")]
    agent_id: Option<String>,
    #[serde(rename = "agentName")]
    agent_name: Option<String>,
    emoji: Option<String>,
    task: Option<String>,
    #[serde(rename = "logFile")]
    log_file: Option<String>,
    mission_id: Option<String>,
    mission_title: Option<String>,
    started_at: Option<String>,
}

async fn post_process(
    State(_state): State<AppState>,
    Json(body): Json<RegisterProcessBody>,
) -> Result<Json<Value>, AppError> {
    // Validate PID is numeric
    if body.pid.is_empty() || !body.pid.chars().all(|c| c.is_ascii_digit()) {
        return Err(AppError::BadRequest(
            "pid must be a numeric string".to_string(),
        ));
    }

    // Validate logFile path if provided
    if let Some(ref log_file) = body.log_file {
        let log_re = Regex::new(LOG_PATH_RE).unwrap();
        if !log_re.is_match(log_file) {
            return Err(AppError::BadRequest(
                "logFile must be a .log file under /tmp/".to_string(),
            ));
        }
    }

    let mut registry = read_registry().await;
    registry.insert(
        body.pid.clone(),
        RegistryEntry {
            agent_id: body.agent_id,
            agent_name: body.agent_name,
            emoji: body.emoji,
            task: body.task,
            log_file: body.log_file,
            mission_id: body.mission_id,
            mission_title: body.mission_title,
            started_at: body.started_at,
        },
    );
    write_registry(&registry).await;

    Ok(Json(json!({ "ok": true })))
}

// ── Process helpers ──────────────────────────────────────────────────────────

struct LogMatch {
    log_file: String,
    last_log_line: Option<String>,
}

async fn get_last_log_line(log_path: &str) -> Option<String> {
    let log_re = Regex::new(LOG_PATH_RE).ok()?;
    if !log_re.is_match(log_path) {
        return None;
    }
    let output = Command::new("tail")
        .args(["-1", log_path])
        .env("PATH", exec_path())
        .output()
        .await
        .ok()?;
    let line = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if line.is_empty() {
        None
    } else {
        Some(redact(&line))
    }
}

async fn match_pids_to_logs(pids: &[String]) -> HashMap<String, LogMatch> {
    let mut map = HashMap::new();
    let entries = match tokio::fs::read_dir("/tmp").await {
        Ok(e) => e,
        Err(_) => return map,
    };

    let mut log_files = Vec::new();
    let mut dir = entries;
    while let Ok(Some(entry)) = dir.next_entry().await {
        let name = entry.file_name().to_string_lossy().to_string();
        if name.ends_with(".log") {
            log_files.push(name);
        }
    }

    // Collect (pid, log_path) pairs
    let mut pairs: Vec<(String, String)> = Vec::new();
    for file in &log_files {
        let log_path = format!("/tmp/{file}");
        for pid in pids {
            if file.contains(pid.as_str()) {
                pairs.push((pid.clone(), log_path.clone()));
            }
        }
    }

    // Fetch last log lines concurrently
    let results: Vec<(String, String, Option<String>)> =
        futures::future::join_all(pairs.into_iter().map(|(pid, log_path)| async move {
            let last_line = get_last_log_line(&log_path).await;
            (pid, log_path, last_line)
        }))
        .await;

    for (pid, log_path, last_log_line) in results {
        map.insert(
            pid,
            LogMatch {
                log_file: log_path,
                last_log_line,
            },
        );
    }

    map
}

/// Run `top -bn2 -d0.5 -p <pids>` and parse the second batch for accurate
/// instantaneous CPU/memory readings.
async fn get_top_cpu_mem(pids: &[String]) -> HashMap<String, (String, String)> {
    let mut map = HashMap::new();
    if pids.is_empty() {
        return map;
    }

    // Validate all PIDs are numeric
    let safe_pids: Vec<&String> = pids
        .iter()
        .filter(|p| p.chars().all(|c| c.is_ascii_digit()))
        .collect();
    if safe_pids.is_empty() {
        return map;
    }

    let pid_list = safe_pids
        .iter()
        .map(|s| s.as_str())
        .collect::<Vec<&str>>()
        .join(",");

    let output = Command::new("bash")
        .arg("-c")
        .arg(format!("top -bn2 -d0.5 -p {pid_list}"))
        .env("PATH", exec_path())
        .output()
        .await;

    let stdout = match output {
        Ok(out) => String::from_utf8_lossy(&out.stdout).to_string(),
        Err(_) => return map,
    };

    // top -bn2 outputs two batches; we want the second for accurate snapshot.
    let batches: Vec<&str> = stdout.split("top - ").collect();
    let last_batch = batches.last().unwrap_or(&"");

    // Find the header line with PID column
    let batch_lines: Vec<&str> = last_batch.lines().collect();
    let header_re = Regex::new(r"(?i)^\s*PID\s+USER").unwrap();
    let header_idx = batch_lines.iter().position(|l| header_re.is_match(l));

    if let Some(idx) = header_idx {
        // Parse process lines after header
        // top columns: PID USER PR NI VIRT RES SHR S %CPU %MEM TIME+ COMMAND
        for line in &batch_lines[idx + 1..] {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() < 10 {
                continue;
            }
            let pid = parts[0];
            if pid.parse::<u64>().is_err() {
                continue;
            }
            let cpu = parts[8].to_string();
            let mem = parts[9].to_string();
            map.insert(pid.to_string(), (cpu, mem));
        }
    }

    map
}

/// Get the number of CPU cores (cached via a static OnceCell).
async fn get_ncpus() -> usize {
    use std::sync::OnceLock;
    static NCPUS: OnceLock<usize> = OnceLock::new();

    if let Some(&n) = NCPUS.get() {
        return n;
    }

    let n = match Command::new("nproc")
        .env("PATH", exec_path())
        .output()
        .await
    {
        Ok(out) => String::from_utf8_lossy(&out.stdout)
            .trim()
            .parse::<usize>()
            .unwrap_or(1),
        Err(_) => 1,
    };

    // Best effort — if another thread beat us, use their value
    let _ = NCPUS.set(n);
    *NCPUS.get().unwrap_or(&1)
}
