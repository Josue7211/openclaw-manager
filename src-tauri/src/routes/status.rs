use axum::{
    extract::State,
    routing::{get, post},
    Json, Router,
};
use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::sync::OnceLock;
use tokio::process::Command;

use crate::error::AppError;
use crate::harness_paths;
use crate::redact::redact;
use crate::routes::util::random_uuid;
use crate::server::{AppState, RequireAuth};

use super::{gateway::harness_api_key, secret_broker_support};

// ── Compiled-once regexes ────────────────────────────────────────────────────

fn prompt_re_single() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r#"-p\s+'[^']*'"#).unwrap())
}

fn prompt_re_double() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r#"-p\s+"[^"]*""#).unwrap())
}

fn prompt_file_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r#"-p\s+"?\$\(cat [^)]+\)"?"#).unwrap())
}

fn log_path_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(LOG_PATH_RE).unwrap())
}

fn top_header_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(?i)^\s*PID\s+USER").unwrap())
}

// ── Helpers ──────────────────────────────────────────────────────────────────

fn harness_primary_model(state: &AppState) -> String {
    let Some(config_path) = harness_paths::model_config_candidates(state)
        .into_iter()
        .find(|path| path.exists())
    else {
        return String::new();
    };
    let content = match std::fs::read_to_string(config_path) {
        Ok(content) => content,
        Err(_) => return String::new(),
    };

    let parsed: Value = match serde_json::from_str(&content) {
        Ok(parsed) => parsed,
        Err(_) => return String::new(),
    };

    parsed
        .pointer("/agents/main/model/primary")
        .and_then(|value| value.as_str())
        .or_else(|| {
            parsed
                .pointer("/agents/defaults/model/primary")
                .and_then(|value| value.as_str())
        })
        .unwrap_or("")
        .to_string()
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

/// Build the status router (system status, connections, health, Tailscale, processes, feature flags).
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/status", get(get_status))
        .route("/status/active-config", get(get_active_config))
        .route("/status/connections", get(get_connections))
        .route("/status/health", get(get_health))
        .route("/status/mac-bridge/restart", post(restart_mac_bridge))
        .route("/status/apple-sync/verify", post(verify_apple_sync))
        .route("/status/tailscale", get(get_tailscale_peers))
        .route("/health/supabase", get(supabase_health))
        .route("/heartbeat", get(heartbeat))
        .route("/processes", get(get_processes).post(post_process))
        .route("/feature-flags", get(get_feature_flags))
}

// ── GET /api/status ──────────────────────────────────────────────────────────

async fn get_status(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let identity_path = harness_paths::workspace_dir(&state).join("IDENTITY.md");

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
            .unwrap_or_else(|| "Primary Agent".to_string());
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
        ("Primary Agent".to_string(), "\u{1F9AC}".to_string())
    };

    Ok(Json(json!({
        "name": name,
        "emoji": emoji,
        "model": harness_primary_model(&state),
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

fn process_uptime_seconds() -> u64 {
    static STARTED: OnceLock<std::time::Instant> = OnceLock::new();
    STARTED
        .get_or_init(std::time::Instant::now)
        .elapsed()
        .as_secs()
}

/// Best-effort local IP by reading the default route interface address.
fn local_ip() -> String {
    // Quick heuristic: check common interface env or fall back
    "127.0.0.1".to_string()
}

// ── GET /api/status/active-config ──────────────────────────────────────────────
//
// Returns the service URLs that the backend is actively using (loaded from
// the OS keychain + .env.local merge at startup). Only URL/host fields are
// exposed — never passwords, tokens, or API keys. This lets the Settings >
// Connections page show the real active config even when the OS keychain has
// no user-saved values (e.g. when URLs came from .env.local).

async fn get_active_config(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Json<Value> {
    Json(json!({
        "bluebubbles_url": state.secret("BLUEBUBBLES_HOST").unwrap_or_default(),
        "harness_url": state.secret_first(&["HERMES_API_URL", "HARNESS_API_URL", "OPENCLAW_API_URL"]).unwrap_or_default(),
        "codex_lb_url": state.secret_first(&["HERMES_USAGE_API_URL", "HERMES_DASHBOARD_API_URL", "CODEX_LB_API_URL"]).unwrap_or_default(),
        "hermes_dashboard_url": state.secret("HERMES_DASHBOARD_URL").unwrap_or_default(),
        "hermes_dashboard_api_url": state.secret_first(&["HERMES_USAGE_API_URL", "HERMES_DASHBOARD_API_URL", "CODEX_LB_API_URL"]).unwrap_or_default(),
        "hermes_url": state.secret("HERMES_API_URL").unwrap_or_default(),
        "openclaw_url": state.secret("OPENCLAW_API_URL").unwrap_or_default(),
        "sunshine_url": state.secret("SUNSHINE_HOST").unwrap_or_default(),
        "vnc_url": state.secret("VNC_HOST").unwrap_or_default(),
        "agentsecrets_url": state.secret("AGENTSECRETS_URL").unwrap_or_default(),
        "agentshell_url": state.secret("AGENTSHELL_URL").unwrap_or_default(),
        "memd_url": state.secret("MEMD_BASE_URL").unwrap_or_default(),
    }))
}

// ── GET /api/status/health ─────────────────────────────────────────────────────
//
// Returns a comprehensive health snapshot: version, uptime, platform, SQLite
// cache stats, and service connectivity — all in a single request so the
// Status page only needs one fetch.

async fn get_health(State(state): State<AppState>) -> Result<Json<Value>, AppError> {
    let bb_host = state.secret("BLUEBUBBLES_HOST").unwrap_or_default();
    let bb_password = state.secret("BLUEBUBBLES_PASSWORD").unwrap_or_default();
    let mac_bridge_key = state.secret_or_default("MAC_BRIDGE_API_KEY");
    let mac_bridge_host = state
        .secret("MAC_BRIDGE_HOST")
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .or_else(|| {
            (!mac_bridge_key.trim().is_empty()).then(|| "http://127.0.0.1:4100".to_string())
        })
        .unwrap_or_default();
    let harness_url = state
        .secret_first(&["HERMES_API_URL", "HARNESS_API_URL", "OPENCLAW_API_URL"])
        .unwrap_or_default();
    let harness_key = state
        .secret_first(&[
            "HERMES_API_KEY",
            "HERMES_PASSWORD",
            "HARNESS_API_KEY",
            "HARNESS_PASSWORD",
            "OPENCLAW_API_KEY",
            "OPENCLAW_PASSWORD",
        ])
        .unwrap_or_default();
    let agentshell_url = state.secret("AGENTSHELL_URL").unwrap_or_default();
    let supabase_url = state.secret_or_default("SUPABASE_URL");
    let supabase_key = state.secret_or_default("SUPABASE_SERVICE_ROLE_KEY");
    let memd_url = state
        .secret("MEMD_BASE_URL")
        .or_else(|| dotenvy::var("MEMD_BASE_URL").ok())
        .unwrap_or_default();

    let (
        bb_result,
        bb_private_result,
        mac_bridge_result,
        calendar_result,
        reminders_result,
        harness_result,
        agentsecrets_result,
        agentshell_result,
        supabase_result,
        memd_result,
    ) = tokio::join!(
        test_bluebubbles(&state.http, &bb_host, &bb_password),
        test_bluebubbles_private_api(&state.http, &bb_host, &bb_password),
        test_mac_bridge(&state.http, &mac_bridge_host, &mac_bridge_key),
        test_mac_bridge_path(&state.http, &mac_bridge_host, &mac_bridge_key, "/calendar"),
        test_mac_bridge_path(
            &state.http,
            &mac_bridge_host,
            &mac_bridge_key,
            "/reminders?filter=all",
        ),
        test_harness(&state.http, &harness_url, &harness_key),
        test_agentsecrets(&state),
        test_agentshell(&state.http, &agentshell_url),
        test_supabase(&state.http, &supabase_url, &supabase_key),
        test_memd(&state.http, &memd_url),
    );

    let sqlite_cache_entries = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM api_cache")
        .fetch_one(&state.db)
        .await
        .unwrap_or(0);
    let page_count = sqlx::query_scalar::<_, i64>("PRAGMA page_count")
        .fetch_one(&state.db)
        .await
        .unwrap_or(0);
    let page_size = sqlx::query_scalar::<_, i64>("PRAGMA page_size")
        .fetch_one(&state.db)
        .await
        .unwrap_or(0);

    Ok(Json(json!({
        "ok": true,
        "version": env!("CARGO_PKG_VERSION"),
        "uptime_seconds": process_uptime_seconds(),
        "platform": std::env::consts::OS,
        "hostname": hostname(),
        "sqlite_cache_entries": sqlite_cache_entries,
        "sqlite_db_size_bytes": page_count.saturating_mul(page_size),
        "services": {
            "bluebubbles": bb_result.clone(),
            "bluebubbles_private_api": bb_private_result,
            "messages": bb_result,
            "mac_bridge": mac_bridge_result,
            "calendar": calendar_result,
            "reminders": reminders_result,
            "harness": harness_result.clone(),
            "hermes": harness_result.clone(),
            "openclaw": harness_result,
            "agentsecrets": agentsecrets_result,
            "agentshell": agentshell_result,
            "supabase": supabase_result,
            "memd": memd_result,
        }
    })))
}

async fn restart_mac_bridge(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    if let Some(container) = secret_or_env(&state, "MAC_BRIDGE_DOCKER_CONTAINER")
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
    {
        let output = Command::new("docker")
            .args(["restart", &container])
            .env("PATH", exec_path())
            .output()
            .await
            .map_err(|e| AppError::Internal(anyhow::anyhow!("docker restart failed: {e}")))?;
        if output.status.success() {
            return Ok(Json(json!({
                "ok": true,
                "mode": "docker",
                "target": container,
            })));
        }
        return Err(AppError::BadRequest(format!(
            "docker restart failed: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        )));
    }

    restart_mac_bridge_launchd(&state).await
}

#[derive(Debug, Deserialize)]
struct AppleSyncVerifyBody {
    #[serde(default = "default_true")]
    calendar: bool,
    #[serde(default = "default_true")]
    reminders: bool,
    #[serde(default = "default_true")]
    cleanup: bool,
}

fn default_true() -> bool {
    true
}

async fn verify_apple_sync(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Json(body): Json<AppleSyncVerifyBody>,
) -> Result<Json<Value>, AppError> {
    let mac_bridge_key = state.secret_or_default("MAC_BRIDGE_API_KEY");
    let mac_bridge_host = state
        .secret("MAC_BRIDGE_HOST")
        .map(|value| value.trim().trim_end_matches('/').to_string())
        .filter(|value| !value.is_empty())
        .or_else(|| {
            (!mac_bridge_key.trim().is_empty()).then(|| "http://127.0.0.1:4100".to_string())
        })
        .ok_or_else(|| AppError::BadRequest("Mac Bridge is not configured".into()))?;

    let (calendar, reminders) = tokio::join!(
        async {
            if body.calendar {
                verify_calendar_round_trip(
                    &state.http,
                    &mac_bridge_host,
                    &mac_bridge_key,
                    body.cleanup,
                )
                .await
            } else {
                json!({ "status": "skipped" })
            }
        },
        async {
            if body.reminders {
                verify_reminder_round_trip(
                    &state.http,
                    &mac_bridge_host,
                    &mac_bridge_key,
                    body.cleanup,
                )
                .await
            } else {
                json!({ "status": "skipped" })
            }
        },
    );

    let ok = probe_status_ok(&calendar) && probe_status_ok(&reminders);
    Ok(Json(json!({
        "ok": ok,
        "calendar": calendar,
        "reminders": reminders,
        "caveat": "This proves Mac Bridge source round-trip. iPhone visibility still depends on iCloud finishing sync."
    })))
}

fn probe_status_ok(value: &Value) -> bool {
    matches!(
        value.get("status").and_then(Value::as_str),
        Some("ok") | Some("skipped")
    )
}

async fn verify_calendar_round_trip(
    http: &reqwest::Client,
    host: &str,
    api_key: &str,
    cleanup: bool,
) -> Value {
    let token = random_uuid();
    let title = format!("[clawctrl Verify] {token}");
    let start = chrono::Utc::now() + chrono::Duration::minutes(10);
    let end = start + chrono::Duration::minutes(15);
    let create_body = json!({
        "title": title,
        "start": start.to_rfc3339(),
        "end": end.to_rfc3339(),
    });

    let created = match mac_bridge_json(
        http,
        host,
        api_key,
        reqwest::Method::POST,
        "/calendar",
        Some(create_body),
    )
    .await
    {
        Ok(value) => value,
        Err(error) => return json!({ "status": "failed", "step": "create", "error": error }),
    };

    let list_after_create =
        match mac_bridge_json(http, host, api_key, reqwest::Method::GET, "/calendar", None).await {
            Ok(value) => value,
            Err(error) => {
                return json!({ "status": "failed", "step": "list_after_create", "error": error })
            }
        };

    let event_id = extract_resource_id(&created)
        .or_else(|| find_resource_id_by_title(&list_after_create, "events", &title));
    let Some(event_id) = event_id else {
        return json!({
            "status": "failed",
            "step": "find_created",
            "message": "Calendar event was created but could not be found in Mac Bridge list response",
            "title": title,
        });
    };

    if cleanup {
        let delete_path = format!("/calendar/{}", urlencoding::encode(&event_id));
        if let Err(error) = mac_bridge_json(
            http,
            host,
            api_key,
            reqwest::Method::DELETE,
            &delete_path,
            None,
        )
        .await
        {
            return json!({ "status": "failed", "step": "delete", "error": error, "id": event_id });
        }

        let list_after_delete = match mac_bridge_json(
            http,
            host,
            api_key,
            reqwest::Method::GET,
            "/calendar",
            None,
        )
        .await
        {
            Ok(value) => value,
            Err(error) => {
                return json!({ "status": "failed", "step": "list_after_delete", "error": error })
            }
        };
        if find_resource_id_by_title(&list_after_delete, "events", &title).is_some() {
            return json!({
                "status": "failed",
                "step": "confirm_delete",
                "message": "Calendar event still appears after source delete",
                "id": event_id,
            });
        }
    }

    json!({
        "status": "ok",
        "id": event_id,
        "title": title,
        "created": true,
        "listed": true,
        "deleted": cleanup,
    })
}

async fn verify_reminder_round_trip(
    http: &reqwest::Client,
    host: &str,
    api_key: &str,
    cleanup: bool,
) -> Value {
    let token = random_uuid();
    let title = format!("[clawctrl Verify] {token}");
    let create_body = json!({
        "title": title,
        "notes": "Temporary clawctrl Mac Bridge verification item",
        "dueDate": (chrono::Utc::now() + chrono::Duration::hours(1)).to_rfc3339(),
    });

    let created = match mac_bridge_json(
        http,
        host,
        api_key,
        reqwest::Method::POST,
        "/reminders",
        Some(create_body),
    )
    .await
    {
        Ok(value) => value,
        Err(error) => return json!({ "status": "failed", "step": "create", "error": error }),
    };

    let list_after_create = match mac_bridge_json(
        http,
        host,
        api_key,
        reqwest::Method::GET,
        "/reminders?filter=all",
        None,
    )
    .await
    {
        Ok(value) => value,
        Err(error) => {
            return json!({ "status": "failed", "step": "list_after_create", "error": error })
        }
    };

    let reminder_id = extract_resource_id(&created)
        .or_else(|| find_resource_id_by_title(&list_after_create, "reminders", &title));
    let Some(reminder_id) = reminder_id else {
        return json!({
            "status": "failed",
            "step": "find_created",
            "message": "Reminder was created but could not be found in Mac Bridge list response",
            "title": title,
        });
    };

    let patch_path = format!("/reminders/{}", urlencoding::encode(&reminder_id));
    if let Err(error) = mac_bridge_json(
        http,
        host,
        api_key,
        reqwest::Method::PATCH,
        &patch_path,
        Some(json!({ "completed": true })),
    )
    .await
    {
        return json!({ "status": "failed", "step": "complete", "error": error, "id": reminder_id });
    }

    if cleanup {
        if let Err(error) = mac_bridge_json(
            http,
            host,
            api_key,
            reqwest::Method::POST,
            "/reminders/delete",
            Some(json!({ "id": reminder_id })),
        )
        .await
        {
            return json!({ "status": "failed", "step": "delete", "error": error, "id": reminder_id });
        }

        let list_after_delete = match mac_bridge_json(
            http,
            host,
            api_key,
            reqwest::Method::GET,
            "/reminders?filter=all",
            None,
        )
        .await
        {
            Ok(value) => value,
            Err(error) => {
                return json!({ "status": "failed", "step": "list_after_delete", "error": error })
            }
        };
        if find_resource_id_by_title(&list_after_delete, "reminders", &title).is_some() {
            return json!({
                "status": "failed",
                "step": "confirm_delete",
                "message": "Reminder still appears after source delete",
                "id": reminder_id,
            });
        }
    }

    json!({
        "status": "ok",
        "id": reminder_id,
        "title": title,
        "created": true,
        "listed": true,
        "completed": true,
        "deleted": cleanup,
    })
}

async fn mac_bridge_json(
    http: &reqwest::Client,
    host: &str,
    api_key: &str,
    method: reqwest::Method,
    path: &str,
    body: Option<Value>,
) -> Result<Value, String> {
    let url = format!("{host}{path}");
    let mut req = http
        .request(method, &url)
        .timeout(std::time::Duration::from_secs(15))
        .header("Content-Type", "application/json");
    if !api_key.is_empty() {
        req = req.header("X-API-Key", api_key);
    }
    if let Some(body) = body {
        req = req.json(&body);
    }

    let resp = req
        .send()
        .await
        .map_err(|error| connection_error_message(&error))?;
    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(format!("HTTP {}: {text}", status.as_u16()));
    }
    if text.trim().is_empty() {
        return Ok(json!({}));
    }
    serde_json::from_str(&text).map_err(|error| format!("invalid JSON: {error}"))
}

fn extract_resource_id(value: &Value) -> Option<String> {
    value
        .get("id")
        .or_else(|| value.pointer("/event/id"))
        .or_else(|| value.pointer("/reminder/id"))
        .or_else(|| value.pointer("/data/id"))
        .and_then(Value::as_str)
        .map(str::to_string)
}

fn find_resource_id_by_title(value: &Value, collection_key: &str, title: &str) -> Option<String> {
    let items = value
        .get(collection_key)
        .and_then(Value::as_array)
        .or_else(|| value.get("data").and_then(Value::as_array))
        .or_else(|| value.as_array())?;
    items.iter().find_map(|item| {
        let item_title = item
            .get("title")
            .or_else(|| item.get("summary"))
            .and_then(Value::as_str)?;
        if item_title == title {
            item.get("id").and_then(Value::as_str).map(str::to_string)
        } else {
            None
        }
    })
}

#[cfg(target_os = "macos")]
async fn restart_mac_bridge_launchd(state: &AppState) -> Result<Json<Value>, AppError> {
    let label = secret_or_env(state, "MAC_BRIDGE_LAUNCHD_LABEL")
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "com.memd.mac-bridge".to_string());
    let uid = current_uid().await?;
    let target = format!("gui/{uid}/{label}");
    let output = Command::new("launchctl")
        .args(["kickstart", "-k", &target])
        .env("PATH", exec_path())
        .output()
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("launchctl restart failed: {e}")))?;

    if output.status.success() {
        return Ok(Json(json!({
            "ok": true,
            "mode": "launchd",
            "target": target,
        })));
    }

    Err(AppError::BadRequest(format!(
        "launchctl restart failed for {target}: {}",
        String::from_utf8_lossy(&output.stderr).trim()
    )))
}

#[cfg(not(target_os = "macos"))]
async fn restart_mac_bridge_launchd(_state: &AppState) -> Result<Json<Value>, AppError> {
    Err(AppError::BadRequest(
        "Set MAC_BRIDGE_DOCKER_CONTAINER to enable local Mac Bridge restart on this host.".into(),
    ))
}

#[cfg(target_os = "macos")]
async fn current_uid() -> Result<String, AppError> {
    if let Ok(uid) = std::env::var("UID") {
        let uid = uid.trim();
        if !uid.is_empty() {
            return Ok(uid.to_string());
        }
    }
    let output = Command::new("id")
        .arg("-u")
        .env("PATH", exec_path())
        .output()
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("could not resolve uid: {e}")))?;
    if output.status.success() {
        let uid = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if !uid.is_empty() {
            return Ok(uid);
        }
    }
    Err(AppError::Internal(anyhow::anyhow!("could not resolve uid")))
}

fn secret_or_env(state: &AppState, key: &str) -> Option<String> {
    state.secret(key).or_else(|| dotenvy::var(key).ok())
}

// ── GET /api/health/supabase ──────────────────────────────────────────────────
//
// Lightweight check for whether Supabase is reachable. Used by the frontend
// to show online/offline sync status.

async fn supabase_health(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Json<Value> {
    let url = state.secret_or_default("SUPABASE_URL");
    let key = state.secret_or_default("SUPABASE_SERVICE_ROLE_KEY");
    let reachable = crate::sync::is_supabase_reachable(&url, &key).await;
    Json(json!({ "reachable": reachable }))
}

// ── GET /api/status/tailscale ─────────────────────────────────────────────────
//
// Returns the list of Tailscale peers from `tailscale status --json`.

async fn get_tailscale_peers(RequireAuth(_session): RequireAuth) -> Result<Json<Value>, AppError> {
    // Run the blocking tailscale CLI call on a blocking thread
    let peers = tokio::task::spawn_blocking(crate::tailscale::get_tailscale_peers)
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("join error: {e}")))?
        .map_err(|e| AppError::Internal(anyhow::anyhow!("{e}")))?;

    let peer_json: Vec<Value> = peers
        .iter()
        .map(|p| json!({ "ip": p.ip, "hostname": p.hostname, "online": p.online }))
        .collect();

    Ok(Json(json!({ "peers": peer_json })))
}

// ── GET /api/status/connections ───────────────────────────────────────────────
//
// Tests connectivity to BlueBubbles, Harness, Agent Secrets, AgentShell, and Supabase, returning latency
// or error info for each. Also verifies Tailscale peer identity when services
// are accessed via Tailscale IPs.

async fn get_connections(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let http = &state.http;

    let bb_host = state.secret("BLUEBUBBLES_HOST").unwrap_or_default();
    let bb_password = state.secret("BLUEBUBBLES_PASSWORD").unwrap_or_default();
    let mac_bridge_key = state.secret_or_default("MAC_BRIDGE_API_KEY");
    let mac_bridge_host = state
        .secret("MAC_BRIDGE_HOST")
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .or_else(|| {
            (!mac_bridge_key.trim().is_empty()).then(|| "http://127.0.0.1:4100".to_string())
        })
        .unwrap_or_default();
    let harness_url = state
        .secret_first(&["HERMES_API_URL", "HARNESS_API_URL", "OPENCLAW_API_URL"])
        .unwrap_or_default();
    let harness_key = state
        .secret_first(&[
            "HERMES_API_KEY",
            "HERMES_PASSWORD",
            "HARNESS_API_KEY",
            "HARNESS_PASSWORD",
            "OPENCLAW_API_KEY",
            "OPENCLAW_PASSWORD",
        ])
        .unwrap_or_default();
    let agentsecrets_url = state.secret("AGENTSECRETS_URL").unwrap_or_default();
    let agentshell_url = state.secret("AGENTSHELL_URL").unwrap_or_default();
    let supabase_url = state.secret_or_default("SUPABASE_URL");
    let supabase_key = state.secret_or_default("SUPABASE_SERVICE_ROLE_KEY");

    // Load expected hostnames from user preferences (stored in Supabase)
    let (bb_expected_host, harness_expected_host, as_expected_host, sh_expected_host) =
        load_expected_hostnames(&state, &session.access_token).await;

    // Test all services concurrently
    let (bb_result, mac_bridge_result, harness_result, as_result, sh_result, sb_result) = tokio::join!(
        test_bluebubbles(http, &bb_host, &bb_password),
        test_mac_bridge(http, &mac_bridge_host, &mac_bridge_key),
        test_harness(http, &harness_url, &harness_key),
        test_agentsecrets(&state),
        test_agentshell(http, &agentshell_url),
        test_supabase(http, &supabase_url, &supabase_key),
    );

    // Run Tailscale peer verification on a blocking thread (calls CLI)
    let bb_url = bb_host.clone();
    let harness_url_for_peer = harness_url.clone();
    let as_url = agentsecrets_url.clone();
    let sh_url = agentshell_url.clone();
    let bb_exp = bb_expected_host.clone();
    let harness_exp = harness_expected_host.clone();
    let as_exp = as_expected_host.clone();
    let sh_exp = sh_expected_host.clone();
    let peer_results = tokio::task::spawn_blocking(move || {
        let peers = crate::tailscale::get_tailscale_peers().unwrap_or_default();
        let bb_peer = crate::tailscale::verify_service_peer(&bb_url, bb_exp.as_deref(), &peers);
        let harness_peer = crate::tailscale::verify_service_peer(
            &harness_url_for_peer,
            harness_exp.as_deref(),
            &peers,
        );
        let as_peer = crate::tailscale::verify_service_peer(&as_url, as_exp.as_deref(), &peers);
        let sh_peer = crate::tailscale::verify_service_peer(&sh_url, sh_exp.as_deref(), &peers);
        (bb_peer, harness_peer, as_peer, sh_peer)
    })
    .await
    .unwrap_or_else(|_| {
        let empty = crate::tailscale::PeerVerification {
            peer_hostname: None,
            peer_verified: None,
        };
        (empty.clone(), empty.clone(), empty.clone(), empty)
    });

    // Merge connectivity results with peer verification
    let mut bb_json = bb_result;
    if let Some(hostname) = &peer_results.0.peer_hostname {
        bb_json["peer_hostname"] = json!(hostname);
    }
    if let Some(verified) = peer_results.0.peer_verified {
        bb_json["peer_verified"] = json!(verified);
    }

    let mut harness_json = harness_result;
    if let Some(hostname) = &peer_results.1.peer_hostname {
        harness_json["peer_hostname"] = json!(hostname);
    }
    if let Some(verified) = peer_results.1.peer_verified {
        harness_json["peer_verified"] = json!(verified);
    }

    let mut as_json = as_result;
    if let Some(hostname) = &peer_results.2.peer_hostname {
        as_json["peer_hostname"] = json!(hostname);
    }
    if let Some(verified) = peer_results.2.peer_verified {
        as_json["peer_verified"] = json!(verified);
    }

    let mut sh_json = sh_result;
    if let Some(hostname) = &peer_results.3.peer_hostname {
        sh_json["peer_hostname"] = json!(hostname);
    }
    if let Some(verified) = peer_results.3.peer_verified {
        sh_json["peer_verified"] = json!(verified);
    }

    Ok(Json(json!({
        "bluebubbles": bb_json,
        "mac_bridge": mac_bridge_result,
        "harness": harness_json.clone(),
        "hermes": harness_json.clone(),
        "openclaw": harness_json,
        "agentsecrets": as_json,
        "agentshell": sh_json,
        "supabase": sb_result,
    })))
}

/// Load expected Tailscale hostnames from user preferences in Supabase.
async fn load_expected_hostnames(
    state: &AppState,
    jwt: &str,
) -> (
    Option<String>,
    Option<String>,
    Option<String>,
    Option<String>,
) {
    let sb = match crate::supabase::SupabaseClient::from_state(state) {
        Ok(sb) => sb,
        Err(_) => return (None, None, None, None),
    };

    let query = "select=preferences&user_id=eq.default";
    let prefs = match sb
        .select_single_as_user("user_preferences", query, jwt)
        .await
    {
        Ok(row) => row.get("preferences").cloned().unwrap_or(json!({})),
        Err(_) => return (None, None, None, None),
    };

    let bb = prefs
        .get("bluebubbles.expected-host")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(String::from);
    let harness = prefs
        .get("harness.expected-host")
        .or_else(|| prefs.get("hermes.expected-host"))
        .or_else(|| prefs.get("openclaw.expected-host"))
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(String::from);
    let as_host = prefs
        .get("agentsecrets.expected-host")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(String::from);
    let sh = prefs
        .get("agentshell.expected-host")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(String::from);

    (bb, harness, as_host, sh)
}

async fn test_bluebubbles(http: &reqwest::Client, host: &str, password: &str) -> Value {
    if host.is_empty() {
        return json!({ "status": "not_configured" });
    }
    let url = format!(
        "{}/api/v1/ping?password={}",
        host.trim_end_matches('/'),
        urlencoding::encode(password)
    );
    ping_service(http, &url).await
}

async fn test_bluebubbles_private_api(http: &reqwest::Client, host: &str, password: &str) -> Value {
    if host.is_empty() {
        return json!({ "status": "not_configured" });
    }

    let url = format!(
        "{}/api/v1/server?password={}",
        host.trim_end_matches('/'),
        urlencoding::encode(password)
    );
    let start = std::time::Instant::now();
    match http
        .get(&url)
        .timeout(std::time::Duration::from_secs(5))
        .send()
        .await
    {
        Ok(resp) if resp.status().is_success() => {
            let latency_ms = start.elapsed().as_millis() as u64;
            let payload = resp.json::<Value>().await.unwrap_or_else(|_| json!({}));
            let root = payload.get("data").unwrap_or(&payload);
            let private_api_enabled = find_bool_field(
                root,
                &[
                    "private_api",
                    "privateApi",
                    "private_api_enabled",
                    "privateApiEnabled",
                    "privateAPIEnabled",
                    "privateApiStatus",
                ],
            );
            let helper_connected = find_bool_field(
                root,
                &[
                    "helper_connected",
                    "helperConnected",
                    "private_api_helper_connected",
                    "privateApiHelperConnected",
                    "privateAPIHelperConnected",
                    "helperStatus",
                ],
            );

            let (status, message) = match (private_api_enabled, helper_connected) {
                (_, Some(true)) => ("ok", "Private API helper connected"),
                (Some(false), _) => ("degraded", "Private API is disabled"),
                (Some(true), Some(false)) => ("unreachable", "Private API helper disconnected"),
                (Some(true), None) => ("unknown", "Private API enabled; helper state not reported"),
                _ => ("unknown", "Private API fields not reported by BlueBubbles"),
            };

            json!({
                "status": status,
                "message": message,
                "latency_ms": latency_ms,
                "private_api_enabled": private_api_enabled,
                "helper_connected": helper_connected,
            })
        }
        Ok(resp) => {
            json!({ "status": "error", "error": format!("HTTP {}", resp.status().as_u16()), "latency_ms": start.elapsed().as_millis() as u64 })
        }
        Err(e) => {
            json!({ "status": "unreachable", "error": connection_error_message(&e) })
        }
    }
}

fn find_bool_field(value: &Value, keys: &[&str]) -> Option<bool> {
    match value {
        Value::Object(map) => {
            for key in keys {
                if let Some(found) = map.get(*key).and_then(Value::as_bool) {
                    return Some(found);
                }
            }
            map.values().find_map(|child| find_bool_field(child, keys))
        }
        Value::Array(items) => items.iter().find_map(|child| find_bool_field(child, keys)),
        _ => None,
    }
}

async fn test_mac_bridge(http: &reqwest::Client, host: &str, api_key: &str) -> Value {
    if host.is_empty() {
        return json!({ "status": "not_configured" });
    }
    let url = format!("{}/health", host.trim_end_matches('/'));
    let start = std::time::Instant::now();
    let mut req = http.get(&url).timeout(std::time::Duration::from_secs(5));
    if !api_key.is_empty() {
        req = req.header("X-API-Key", api_key);
    }
    match req.send().await {
        Ok(resp) if resp.status().is_success() => {
            json!({ "status": "ok", "latency_ms": start.elapsed().as_millis() as u64 })
        }
        Ok(resp) => {
            json!({ "status": "error", "error": format!("HTTP {}", resp.status().as_u16()), "latency_ms": start.elapsed().as_millis() as u64 })
        }
        Err(e) => {
            json!({ "status": "unreachable", "error": connection_error_message(&e) })
        }
    }
}

async fn test_mac_bridge_path(
    http: &reqwest::Client,
    host: &str,
    api_key: &str,
    path: &str,
) -> Value {
    if host.is_empty() {
        return json!({ "status": "not_configured" });
    }
    let url = format!("{}{}", host.trim_end_matches('/'), path);
    let start = std::time::Instant::now();
    let mut req = http.get(&url).timeout(std::time::Duration::from_secs(5));
    if !api_key.is_empty() {
        req = req.header("X-API-Key", api_key);
    }
    match req.send().await {
        Ok(resp) if resp.status().is_success() => {
            json!({ "status": "ok", "latency_ms": start.elapsed().as_millis() as u64 })
        }
        Ok(resp) => {
            json!({ "status": "error", "error": format!("HTTP {}", resp.status().as_u16()), "latency_ms": start.elapsed().as_millis() as u64 })
        }
        Err(e) => {
            json!({ "status": "unreachable", "error": connection_error_message(&e) })
        }
    }
}

async fn test_harness(http: &reqwest::Client, base_url: &str, api_key: &str) -> Value {
    if base_url.is_empty() {
        return json!({ "status": "not_configured" });
    }
    let url = format!("{}/files", base_url.trim_end_matches('/'));
    let mut req = http.get(&url);
    if !api_key.is_empty() {
        req = req.header("Authorization", format!("Bearer {api_key}"));
    }
    let start = std::time::Instant::now();
    match req.timeout(std::time::Duration::from_secs(5)).send().await {
        Ok(resp) if resp.status().is_success() => {
            json!({ "status": "ok", "latency_ms": start.elapsed().as_millis() as u64 })
        }
        Ok(resp) => {
            json!({ "status": "error", "error": format!("HTTP {}", resp.status().as_u16()), "latency_ms": start.elapsed().as_millis() as u64 })
        }
        Err(e) => {
            json!({ "status": "unreachable", "error": connection_error_message(&e) })
        }
    }
}

async fn test_agentshell(http: &reqwest::Client, base_url: &str) -> Value {
    if base_url.is_empty() {
        return json!({ "status": "not_configured" });
    }
    let url = format!("{}/healthz", base_url.trim_end_matches('/'));
    ping_service(http, &url).await
}

async fn test_agentsecrets(state: &AppState) -> Value {
    let health = secret_broker_support::health_status(state).await;
    let status = if health.ok {
        "ok".to_string()
    } else {
        health.status.clone()
    };
    json!({
        "status": status,
        "message": health.message,
        "error": health.error,
    })
}

async fn test_supabase(http: &reqwest::Client, url: &str, service_key: &str) -> Value {
    if url.is_empty() {
        return json!({ "status": "not_configured" });
    }
    let rest_url = format!("{}/rest/v1/", url.trim_end_matches('/'));
    let req = http
        .get(&rest_url)
        .header("apikey", service_key)
        .header("Authorization", format!("Bearer {service_key}"));
    let start = std::time::Instant::now();
    match req.timeout(std::time::Duration::from_secs(5)).send().await {
        Ok(resp) if resp.status().as_u16() != 401 => {
            json!({ "status": "ok", "latency_ms": start.elapsed().as_millis() as u64 })
        }
        Ok(_) => {
            json!({ "status": "error", "error": "unauthorized (bad service key)", "latency_ms": start.elapsed().as_millis() as u64 })
        }
        Err(e) => {
            json!({ "status": "unreachable", "error": connection_error_message(&e) })
        }
    }
}

async fn test_memd(http: &reqwest::Client, base_url: &str) -> Value {
    if base_url.is_empty() {
        return json!({ "status": "not_configured" });
    }
    let url = format!("{}/healthz", base_url.trim_end_matches('/'));
    ping_service(http, &url).await
}

/// Ping a URL with GET and return a status JSON object.
async fn ping_service(http: &reqwest::Client, url: &str) -> Value {
    let start = std::time::Instant::now();
    match http
        .get(url)
        .timeout(std::time::Duration::from_secs(5))
        .send()
        .await
    {
        Ok(resp) if resp.status().is_success() => {
            json!({ "status": "ok", "latency_ms": start.elapsed().as_millis() as u64 })
        }
        Ok(resp) => {
            json!({ "status": "error", "error": format!("HTTP {}", resp.status().as_u16()), "latency_ms": start.elapsed().as_millis() as u64 })
        }
        Err(e) => {
            json!({ "status": "unreachable", "error": connection_error_message(&e) })
        }
    }
}

/// Produce a short user-friendly error message from a reqwest error.
fn connection_error_message(e: &reqwest::Error) -> String {
    if e.is_connect() {
        "connection refused".to_string()
    } else if e.is_timeout() {
        "timed out".to_string()
    } else if e.is_request() {
        "invalid URL".to_string()
    } else {
        format!("{e}")
    }
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

async fn heartbeat(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let heartbeat_path = harness_paths::workspace_dir(&state).join("HEARTBEAT.md");

    if heartbeat_path.exists() {
        let last_check = match tokio::fs::metadata(&heartbeat_path).await {
            Ok(meta) => meta.modified().ok().map(|t| {
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

    // No local file: try fetching HEARTBEAT.md from the remote Hermes Agent API.
    let harness_url = state
        .secret_first(&["HERMES_API_URL", "HARNESS_API_URL", "OPENCLAW_API_URL"])
        .unwrap_or_default();
    if !harness_url.is_empty() {
        let url = format!(
            "{}/file?path=HEARTBEAT.md",
            harness_url.trim_end_matches('/')
        );
        let mut req = state.http.get(&url);
        let key = harness_api_key(&state);
        if !key.is_empty() {
            req = req.header("Authorization", format!("Bearer {key}"));
        }
        if let Ok(resp) = req.send().await {
            if resp.status().is_success() {
                if let Ok(data) = resp.json::<Value>().await {
                    let content = data.get("content").and_then(|v| v.as_str()).unwrap_or("");
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

// ── GET /api/feature-flags ───────────────────────────────────────────────────
//
// Returns the user's enabled-modules list from the `user_preferences` table in
// Supabase. This lets the backend (or external services) know which modules are
// active, so they can skip unnecessary work for disabled modules (e.g. skipping
// BlueBubbles SSE polling when Messages is disabled).
//
// Response shape:
//   { "ok": true, "data": { "enabled_modules": ["chat","todos",...] } }
//
// Falls back to an empty array if Supabase is unreachable or no preferences
// have been saved yet.

async fn get_feature_flags(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let jwt = &session.access_token;
    let modules: Vec<String> = match crate::supabase::SupabaseClient::from_state(&state) {
        Ok(sb) => {
            let query = format!("select=preferences&user_id=eq.{}", session.user_id);
            match sb
                .select_single_as_user("user_preferences", &query, jwt)
                .await
            {
                Ok(row) => row
                    .get("preferences")
                    .and_then(|p| p.get("enabled-modules"))
                    .and_then(|v| v.as_array())
                    .map(|arr| {
                        arr.iter()
                            .filter_map(|v| v.as_str().map(String::from))
                            .collect()
                    })
                    .unwrap_or_default(),
                Err(_) => vec![],
            }
        }
        Err(_) => vec![],
    };

    Ok(crate::error::success_json(json!({
        "enabled_modules": modules,
    })))
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

async fn get_processes(
    State(_state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    // Run a provider-agnostic scan for common local AI / harness worker processes.
    let ps_output = Command::new("bash")
        .arg("-c")
        .arg("ps aux | grep -E 'openclaw|litellm|ollama|codex|gpt|qwen|claude|gemini|kimi|llama' | grep -v grep | grep -v 'next-server'")
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
    let (pid_log_map, top_map) = tokio::join!(match_pids_to_logs(&pids), get_top_cpu_mem(&pids),);

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
            let redacted1 = prompt_re_single().replace_all(&raw_cmd, "-p [redacted]");
            let redacted2 = prompt_re_double().replace_all(&redacted1, "-p [redacted]");
            let cmd = prompt_file_re()
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
    RequireAuth(_session): RequireAuth,
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
        if !log_path_re().is_match(log_file) {
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
    if !log_path_re().is_match(log_path) {
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
    let header_idx = batch_lines.iter().position(|l| top_header_re().is_match(l));

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_resource_ids_from_common_bridge_shapes() {
        assert_eq!(
            extract_resource_id(&json!({"id": "evt_1"})).as_deref(),
            Some("evt_1")
        );
        assert_eq!(
            extract_resource_id(&json!({"event": {"id": "evt_2"}})).as_deref(),
            Some("evt_2")
        );
        assert_eq!(
            extract_resource_id(&json!({"reminder": {"id": "rem_1"}})).as_deref(),
            Some("rem_1")
        );
        assert_eq!(
            extract_resource_id(&json!({"data": {"id": "data_1"}})).as_deref(),
            Some("data_1")
        );
    }

    #[test]
    fn finds_resource_id_by_title_in_list_shapes() {
        let payload = json!({
            "events": [
                {"id": "evt_1", "title": "Other"},
                {"id": "evt_2", "summary": "Target"}
            ]
        });
        assert_eq!(
            find_resource_id_by_title(&payload, "events", "Target").as_deref(),
            Some("evt_2")
        );

        let array_payload = json!([
            {"id": "rem_1", "title": "Target"}
        ]);
        assert_eq!(
            find_resource_id_by_title(&array_payload, "reminders", "Target").as_deref(),
            Some("rem_1")
        );
    }
}
