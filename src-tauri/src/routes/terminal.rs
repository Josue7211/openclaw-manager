use axum::{
    extract::{
        ws::{Message, WebSocket},
        Query, State, WebSocketUpgrade,
    },
    response::{IntoResponse, Response},
    routing::get,
    Json, Router,
};
use futures::{SinkExt, StreamExt};
use portable_pty::{CommandBuilder, MasterPty, PtySize};
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::io::Read;
use std::io::Write as IoWrite;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use tokio::sync::Mutex;
use tracing::{error, info};

use crate::server::{AppState, RequireAuth};

// ---------------------------------------------------------------------------
// CAS connection guard (max 3 concurrent PTY sessions)
// ---------------------------------------------------------------------------

/// Global counter for concurrent PTY connections.
static PTY_CONNECTIONS: AtomicUsize = AtomicUsize::new(0);
static PTY_PROCESS_COUNTER: AtomicUsize = AtomicUsize::new(1);
const MAX_PTY_CONNECTIONS: usize = 3;

/// RAII guard that decrements the PTY connection counter on drop.
struct PtyConnectionGuard;

impl PtyConnectionGuard {
    /// Try to acquire a slot. Returns `None` if the limit is reached (CAS loop).
    fn try_new() -> Option<Self> {
        loop {
            let current = PTY_CONNECTIONS.load(Ordering::Acquire);
            if current >= MAX_PTY_CONNECTIONS {
                return None;
            }
            if PTY_CONNECTIONS
                .compare_exchange(current, current + 1, Ordering::AcqRel, Ordering::Acquire)
                .is_ok()
            {
                return Some(Self);
            }
        }
    }
}

impl Drop for PtyConnectionGuard {
    fn drop(&mut self) {
        PTY_CONNECTIONS.fetch_sub(1, Ordering::AcqRel);
    }
}

// ---------------------------------------------------------------------------
// Environment sanitization
// ---------------------------------------------------------------------------

/// Environment variables safe to forward to the PTY child process.
/// Everything else is stripped via `env_clear()` + whitelist.
const PTY_SAFE_ENV_VARS: &[&str] = &[
    "HOME",
    "USER",
    "LOGNAME",
    "PATH",
    "SHELL",
    "LANG",
    "LC_ALL",
    "LC_CTYPE",
    "LC_MESSAGES",
    "LC_COLLATE",
    "DISPLAY",
    "WAYLAND_DISPLAY",
    "XDG_RUNTIME_DIR",
    "XDG_SESSION_TYPE",
    "XDG_CURRENT_DESKTOP",
    "DBUS_SESSION_BUS_ADDRESS",
    "SSH_AUTH_SOCK",
    "EDITOR",
    "VISUAL",
    "PAGER",
    "COLORTERM",
    "TERM_PROGRAM",
];

/// Prefixes of environment variables that MUST NOT leak into the PTY.
/// These correspond to secrets loaded by dotenvy from `.env.local`.
/// Used by unit tests to verify the whitelist approach is sound.
const PTY_BLOCKED_PREFIXES: &[&str] = &[
    "MC_",
    "OPENCLAW_",
    "COUCHDB_",
    "SUPABASE_",
    "BLUEBUBBLES_",
    "PROXMOX_",
    "OPNSENSE_",
    "PLEX_",
    "CALDAV_",
    "SONARR_",
    "RADARR_",
    "EMAIL_",
    "NTFY_",
    "MAC_BRIDGE_",
    "ANTHROPIC_",
];

const PTY_BLOCKED_ENV_TERMS: &[&str] = &["SECRET", "TOKEN", "PASSWORD", "PRIVATE_KEY", "API_KEY"];
const MAX_EXTRA_ENV_VARS: usize = 32;
const MAX_EXTRA_ENV_VALUE_BYTES: usize = 4096;

// ---------------------------------------------------------------------------
// Shell detection
// ---------------------------------------------------------------------------

fn detect_shell() -> String {
    #[cfg(unix)]
    {
        if let Ok(shell) = std::env::var("SHELL") {
            if !shell.is_empty() {
                return shell;
            }
        }
        "/bin/sh".to_string()
    }
    #[cfg(windows)]
    {
        // PowerShell is always available on Windows 10+
        "powershell.exe".to_string()
    }
}

// ---------------------------------------------------------------------------
// Environment builder (extracted for testability)
// ---------------------------------------------------------------------------

/// Build a sanitized environment for the PTY child process.
/// Uses a whitelist approach: only PTY_SAFE_ENV_VARS are forwarded.
fn build_sanitized_env() -> Vec<(String, String)> {
    let mut env = Vec::new();
    for key in PTY_SAFE_ENV_VARS {
        if let Ok(val) = std::env::var(key) {
            env.push((key.to_string(), val));
        }
    }
    // Force TERM for proper terminal emulation (matches xterm.js in Phase 14)
    env.push(("TERM".to_string(), "xterm-256color".to_string()));
    env
}

/// Build a CommandBuilder with sanitized environment.
fn build_pty_command(cwd: Option<&Path>, extra_env: &[(String, String)]) -> CommandBuilder {
    let shell = detect_shell();
    let mut cmd = CommandBuilder::new(&shell);

    // CRITICAL: Clear ALL env vars first -- Tauri process has 30+ secrets
    cmd.env_clear();

    // Whitelist only safe system variables
    for (key, val) in build_sanitized_env() {
        cmd.env(key, val);
    }
    for (key, val) in extra_env {
        cmd.env(key, val);
    }

    if let Some(cwd) = cwd {
        cmd.cwd(cwd);
    }

    cmd
}

// ---------------------------------------------------------------------------
// Terminal command protocol
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
#[serde(tag = "type")]
enum TerminalCommand {
    #[serde(rename = "resize")]
    Resize { cols: u16, rows: u16 },
    #[serde(rename = "input")]
    Input { data: String },
    #[serde(rename = "terminate")]
    Terminate {
        #[serde(rename = "processId")]
        process_id: Option<String>,
    },
}

#[derive(Clone, Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct TerminalWsQuery {
    cwd: Option<String>,
    process_id: Option<String>,
    env: Option<String>,
}

#[derive(Clone, Debug)]
struct TerminalSessionConfig {
    process_id: String,
    cwd: Option<PathBuf>,
    env: Vec<(String, String)>,
}

fn next_terminal_process_id() -> String {
    format!(
        "terminal-{}",
        PTY_PROCESS_COUNTER.fetch_add(1, Ordering::AcqRel)
    )
}

fn resolve_terminal_cwd(cwd: Option<String>) -> Result<Option<PathBuf>, String> {
    let Some(raw) = cwd else {
        return Ok(None);
    };
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }

    let path = PathBuf::from(trimmed)
        .canonicalize()
        .map_err(|err| format!("terminal cwd does not exist or cannot be read: {err}"))?;
    if !path.is_dir() {
        return Err("terminal cwd must be a folder".to_string());
    }
    Ok(Some(path))
}

fn is_valid_terminal_env_key(key: &str) -> bool {
    let mut chars = key.chars();
    let Some(first) = chars.next() else {
        return false;
    };
    if !(first == '_' || first.is_ascii_alphabetic()) {
        return false;
    }
    chars.all(|ch| ch == '_' || ch.is_ascii_alphanumeric())
}

fn is_blocked_terminal_env_key(key: &str) -> bool {
    let upper = key.to_ascii_uppercase();
    PTY_BLOCKED_PREFIXES
        .iter()
        .any(|prefix| upper.starts_with(prefix))
        || PTY_BLOCKED_ENV_TERMS
            .iter()
            .any(|term| upper.contains(term))
}

fn parse_terminal_env(raw: Option<String>) -> Result<Vec<(String, String)>, String> {
    let Some(raw) = raw else {
        return Ok(Vec::new());
    };
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Ok(Vec::new());
    }

    let parsed: Value = serde_json::from_str(trimmed)
        .map_err(|_| "terminal env must be a JSON object".to_string())?;
    let object = parsed
        .as_object()
        .ok_or_else(|| "terminal env must be a JSON object".to_string())?;
    if object.len() > MAX_EXTRA_ENV_VARS {
        return Err(format!(
            "terminal env cannot include more than {MAX_EXTRA_ENV_VARS} variables"
        ));
    }

    let mut env = BTreeMap::new();
    for (key, value) in object {
        let key = key.trim();
        if key.len() > 64 || !is_valid_terminal_env_key(key) {
            return Err(format!("terminal env key is invalid: {key}"));
        }
        if is_blocked_terminal_env_key(key) {
            return Err(format!("terminal env key is not allowed: {key}"));
        }
        let value = match value {
            Value::String(value) => value.clone(),
            Value::Number(value) => value.to_string(),
            Value::Bool(value) => value.to_string(),
            Value::Null => continue,
            _ => {
                return Err(format!(
                    "terminal env value for {key} must be a string, number, boolean, or null"
                ));
            }
        };
        if value.as_bytes().len() > MAX_EXTRA_ENV_VALUE_BYTES || value.contains('\0') {
            return Err(format!("terminal env value for {key} is invalid"));
        }
        env.insert(key.to_string(), value);
    }

    Ok(env.into_iter().collect())
}

// ---------------------------------------------------------------------------
// PTY cleanup with process group kill on Drop
// ---------------------------------------------------------------------------

struct PtyCleanup {
    child: Box<dyn portable_pty::Child + Send + Sync>,
    #[allow(dead_code)]
    // Justification: held alive to keep PTY master fd open; dropping it closes the terminal session
    master: Box<dyn MasterPty + Send>,
    #[cfg(unix)]
    pgid: Option<i32>,
}

impl Drop for PtyCleanup {
    fn drop(&mut self) {
        // Graceful kill via portable-pty
        let _ = self.child.kill();

        // Kill entire process group (catches vim, htop, subprocesses)
        #[cfg(unix)]
        if let Some(pgid) = self.pgid {
            if pgid > 0 {
                unsafe {
                    libc::kill(-pgid, libc::SIGKILL);
                }
            }
        }

        // Reap zombie
        let _ = self.child.wait();
    }
}

// ---------------------------------------------------------------------------
// WebSocket upgrade handler
// ---------------------------------------------------------------------------

async fn ws_upgrade(
    State(_state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Query(params): Query<TerminalWsQuery>,
    ws: WebSocketUpgrade,
) -> Response {
    let guard = match PtyConnectionGuard::try_new() {
        Some(g) => g,
        None => {
            return (
                axum::http::StatusCode::TOO_MANY_REQUESTS,
                Json(json!({"error": "too many terminal sessions (max 3)"})),
            )
                .into_response();
        }
    };

    let cwd = match resolve_terminal_cwd(params.cwd) {
        Ok(cwd) => cwd,
        Err(error) => {
            return (
                axum::http::StatusCode::BAD_REQUEST,
                Json(json!({ "error": error })),
            )
                .into_response();
        }
    };
    let env = match parse_terminal_env(params.env) {
        Ok(env) => env,
        Err(error) => {
            return (
                axum::http::StatusCode::BAD_REQUEST,
                Json(json!({ "error": error })),
            )
                .into_response();
        }
    };
    let process_id = params
        .process_id
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(next_terminal_process_id);
    let config = TerminalSessionConfig {
        process_id,
        cwd,
        env,
    };

    ws.max_message_size(64 * 1024)
        .on_upgrade(move |socket| handle_terminal_ws(socket, guard, config))
}

// ---------------------------------------------------------------------------
// Bidirectional WebSocket <-> PTY relay
// ---------------------------------------------------------------------------

fn terminal_startup_error_payload(code: &str, error: impl ToString) -> String {
    json!({
        "type": "error",
        "code": code,
        "error": error.to_string(),
    })
    .to_string()
}

async fn send_terminal_startup_error(socket: &mut WebSocket, code: &str, error: impl ToString) {
    let _ = socket
        .send(Message::Text(
            terminal_startup_error_payload(code, error).into(),
        ))
        .await;
}

async fn handle_terminal_ws(
    mut socket: WebSocket,
    _guard: PtyConnectionGuard,
    config: TerminalSessionConfig,
) {
    info!(
        process_id = %config.process_id,
        cwd = ?config.cwd,
        "terminal: new PTY session"
    );

    // 1. Open PTY
    let pty_system = portable_pty::native_pty_system();
    let pair = match pty_system.openpty(PtySize {
        rows: 24,
        cols: 80,
        pixel_width: 0,
        pixel_height: 0,
    }) {
        Ok(p) => p,
        Err(e) => {
            error!("terminal: failed to open PTY: {e}");
            send_terminal_startup_error(&mut socket, "pty_open_failed", e).await;
            return;
        }
    };

    // 2. Build command with sanitized env
    let cmd = build_pty_command(config.cwd.as_deref(), &config.env);

    // 3. Spawn shell on slave
    let child = match pair.slave.spawn_command(cmd) {
        Ok(c) => c,
        Err(e) => {
            error!("terminal: failed to spawn shell: {e}");
            send_terminal_startup_error(&mut socket, "pty_spawn_failed", e).await;
            return;
        }
    };

    // 4. CRITICAL: Drop slave immediately to avoid PTY EOF hang
    drop(pair.slave);

    // 5. Get process group leader for cleanup
    #[cfg(unix)]
    let pgid = pair.master.process_group_leader();

    // 6. Clone reader (blocking Read)
    let reader = match pair.master.try_clone_reader() {
        Ok(r) => r,
        Err(e) => {
            error!("terminal: failed to clone reader: {e}");
            send_terminal_startup_error(&mut socket, "pty_reader_failed", e).await;
            return;
        }
    };

    // 7. Take writer (blocking Write)
    let writer = match pair.master.take_writer() {
        Ok(w) => w,
        Err(e) => {
            error!("terminal: failed to take writer: {e}");
            send_terminal_startup_error(&mut socket, "pty_writer_failed", e).await;
            return;
        }
    };

    // 8. Store master + child for Drop-based cleanup
    let cleanup = Arc::new(Mutex::new(Some(PtyCleanup {
        child,
        master: pair.master,
        #[cfg(unix)]
        pgid,
    })));

    // 9. Split WebSocket
    let (ws_sender, mut ws_receiver) = socket.split();
    let ws_sender = Arc::new(Mutex::new(ws_sender));

    let cwd_text = config
        .cwd
        .as_ref()
        .map(|path| path.to_string_lossy().to_string());
    let env_keys = config.env.iter().map(|(key, _)| key).collect::<Vec<_>>();
    {
        let mut sender = ws_sender.lock().await;
        let _ = sender
            .send(Message::Text(
                json!({
                    "type": "started",
                    "processId": config.process_id,
                    "cwd": cwd_text,
                    "envKeys": env_keys,
                })
                .to_string()
                .into(),
            ))
            .await;
    }

    // ── PTY stdout -> WebSocket (OS thread + channel) ──────────────────────
    //
    // portable-pty's reader is blocking `Read`. We use a dedicated OS thread
    // to avoid blocking the tokio runtime. Data is forwarded via an mpsc channel.
    let (pty_tx, mut pty_rx) = tokio::sync::mpsc::channel::<Vec<u8>>(32);

    std::thread::spawn(move || {
        let mut reader = reader;
        let mut buf = vec![0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    if pty_tx.blocking_send(buf[..n].to_vec()).is_err() {
                        break;
                    }
                }
                Err(_) => break,
            }
        }
    });

    let ws_sender_read = Arc::clone(&ws_sender);
    let read_handle = tokio::spawn(async move {
        while let Some(data) = pty_rx.recv().await {
            let mut sender = ws_sender_read.lock().await;
            if sender.send(Message::Binary(data)).await.is_err() {
                break;
            }
        }
    });

    // ── WebSocket -> PTY stdin + resize (OS thread for writer) ─────────────
    let (input_tx, input_rx) = std::sync::mpsc::channel::<Vec<u8>>();

    std::thread::spawn(move || {
        let mut writer = writer;
        while let Ok(data) = input_rx.recv() {
            if writer.write_all(&data).is_err() {
                break;
            }
            // Flush after each write for responsiveness
            let _ = writer.flush();
        }
    });

    // Wrap master reference for resize operations
    let cleanup_for_resize = Arc::clone(&cleanup);
    let close_reason = Arc::new(Mutex::new("closed".to_string()));
    let close_reason_for_write = Arc::clone(&close_reason);
    let process_id_for_write = config.process_id.clone();

    let write_handle = tokio::spawn(async move {
        while let Some(Ok(msg)) = ws_receiver.next().await {
            match msg {
                Message::Text(text) => {
                    // Try to parse as JSON TerminalCommand
                    if let Ok(cmd) = serde_json::from_str::<TerminalCommand>(&text) {
                        match cmd {
                            TerminalCommand::Resize { cols, rows } => {
                                if let Some(ref pty) = *cleanup_for_resize.lock().await {
                                    let _ = pty.master.resize(PtySize {
                                        rows,
                                        cols,
                                        pixel_width: 0,
                                        pixel_height: 0,
                                    });
                                }
                            }
                            TerminalCommand::Input { data } => {
                                if input_tx.send(data.into_bytes()).is_err() {
                                    break;
                                }
                            }
                            TerminalCommand::Terminate { process_id } => {
                                let matches_session = process_id
                                    .as_deref()
                                    .map(|id| id == process_id_for_write)
                                    .unwrap_or(true);
                                if !matches_session {
                                    continue;
                                }
                                *close_reason_for_write.lock().await = "terminated".to_string();
                                if let Some(pty) = cleanup_for_resize.lock().await.take() {
                                    drop(pty);
                                }
                                break;
                            }
                        }
                    } else {
                        // Plain text input (not JSON) -- send as raw bytes
                        if input_tx.send(text.into_bytes()).is_err() {
                            break;
                        }
                    }
                }
                Message::Binary(data) => {
                    // Raw binary input -- write directly to PTY
                    if input_tx.send(data).is_err() {
                        break;
                    }
                }
                Message::Close(_) => break,
                _ => {}
            }
        }
        // Drop input_tx so the writer thread exits
        drop(input_tx);
    });

    // Wait for either task to finish
    tokio::select! {
        _ = read_handle => {}
        _ = write_handle => {}
    }

    // Drop PtyCleanup which kills the process group
    if let Some(pty) = cleanup.lock().await.take() {
        drop(pty);
    }

    {
        let reason = close_reason.lock().await.clone();
        let mut sender = ws_sender.lock().await;
        let _ = sender
            .send(Message::Text(
                json!({
                    "type": "closed",
                    "processId": config.process_id,
                    "reason": reason,
                    "exitCode": null,
                    "exitSignal": null,
                })
                .to_string()
                .into(),
            ))
            .await;
    }

    info!("terminal: PTY session ended");
}

// ---------------------------------------------------------------------------
// Status endpoint (pre-flight capacity check)
// ---------------------------------------------------------------------------

async fn terminal_status(RequireAuth(_session): RequireAuth) -> Json<serde_json::Value> {
    let active = PTY_CONNECTIONS.load(Ordering::Acquire);
    let available = MAX_PTY_CONNECTIONS.saturating_sub(active);
    Json(json!({
        "active": active,
        "max": MAX_PTY_CONNECTIONS,
        "available": available,
    }))
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/terminal/ws", get(ws_upgrade))
        .route("/api/terminal/status", get(terminal_status))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex as StdMutex;

    static PTY_TEST_MUTEX: StdMutex<()> = StdMutex::new(());

    #[test]
    fn test_detect_shell() {
        let shell = detect_shell();
        assert!(!shell.is_empty(), "shell must not be empty");

        #[cfg(unix)]
        {
            // On Unix, the shell should be a path or known shell name
            let known_shells = [
                "sh", "bash", "zsh", "fish", "dash", "ksh", "csh", "tcsh", "nu", "elvish",
            ];
            let basename = shell.rsplit('/').next().unwrap_or(&shell);
            assert!(
                known_shells.contains(&basename) || shell.starts_with('/'),
                "unexpected shell: {shell}"
            );
        }

        #[cfg(windows)]
        {
            assert!(
                shell.contains("powershell"),
                "Windows shell should be powershell, got: {shell}"
            );
        }
    }

    #[test]
    fn test_env_sanitization() {
        // Set a fake secret env var to verify it does NOT leak
        unsafe {
            std::env::set_var("MC_TEST_SECRET", "hunter2");
            std::env::set_var("SUPABASE_TEST_KEY", "secret123");
            std::env::set_var("HOME", "/test/home");
        }

        let env = build_sanitized_env();

        // Verify no blocked prefix vars are present
        for (key, _) in &env {
            for prefix in PTY_BLOCKED_PREFIXES {
                assert!(
                    !key.starts_with(prefix),
                    "blocked env var {key} (prefix {prefix}) leaked through sanitization"
                );
            }
        }

        // Verify TERM is set correctly
        let term = env.iter().find(|(k, _)| k == "TERM");
        assert_eq!(
            term.map(|(_, v)| v.as_str()),
            Some("xterm-256color"),
            "TERM must be xterm-256color"
        );

        // Verify HOME is forwarded (we set it above)
        let home = env.iter().find(|(k, _)| k == "HOME");
        assert!(home.is_some(), "HOME should be present in sanitized env");

        // Cleanup
        unsafe {
            std::env::remove_var("MC_TEST_SECRET");
            std::env::remove_var("SUPABASE_TEST_KEY");
        }
    }

    #[test]
    fn test_resolve_terminal_cwd_accepts_existing_folder() {
        let cwd = std::env::current_dir().expect("current dir exists");
        let resolved = resolve_terminal_cwd(Some(cwd.to_string_lossy().to_string()))
            .expect("existing folder should resolve");

        assert_eq!(
            resolved,
            Some(cwd.canonicalize().expect("cwd canonicalizes"))
        );
    }

    #[test]
    fn test_resolve_terminal_cwd_rejects_missing_folder() {
        let missing = std::env::temp_dir().join("clawctrl-missing-terminal-cwd");
        let resolved = resolve_terminal_cwd(Some(missing.to_string_lossy().to_string()));

        assert!(resolved.is_err());
    }

    #[test]
    fn test_parse_terminal_env_accepts_safe_context() {
        let env = parse_terminal_env(Some(
            r#"{"CLAWCTRL_PROJECT_PATH":"/tmp/project","CLAWCTRL_BRANCH":"main","CLAWCTRL_RUNTIME":"Work locally","COUNT":2,"ENABLED":true,"SKIP":null}"#
                .to_string(),
        ))
        .expect("safe env parses");

        assert_eq!(
            env,
            vec![
                ("CLAWCTRL_BRANCH".to_string(), "main".to_string()),
                (
                    "CLAWCTRL_PROJECT_PATH".to_string(),
                    "/tmp/project".to_string()
                ),
                ("CLAWCTRL_RUNTIME".to_string(), "Work locally".to_string()),
                ("COUNT".to_string(), "2".to_string()),
                ("ENABLED".to_string(), "true".to_string()),
            ]
        );
    }

    #[test]
    fn test_parse_terminal_env_rejects_secret_like_keys() {
        let env = parse_terminal_env(Some(r#"{"SUPABASE_URL":"secret"}"#.to_string()));
        assert!(env.is_err());

        let env = parse_terminal_env(Some(r#"{"MY_TOKEN":"secret"}"#.to_string()));
        assert!(env.is_err());
    }

    #[test]
    fn test_terminal_command_parses_resize_and_input() {
        let command: TerminalCommand =
            serde_json::from_str(r#"{"type":"resize","cols":120,"rows":40}"#)
                .expect("resize command parses");
        match command {
            TerminalCommand::Resize { cols, rows } => {
                assert_eq!(cols, 120);
                assert_eq!(rows, 40);
            }
            _ => panic!("expected resize command"),
        }

        let command: TerminalCommand =
            serde_json::from_str(r#"{"type":"input","data":"npm test\n"}"#)
                .expect("input command parses");
        match command {
            TerminalCommand::Input { data } => assert_eq!(data, "npm test\n"),
            _ => panic!("expected input command"),
        }
    }

    #[test]
    fn test_terminal_command_parses_terminate_with_process_id() {
        let command: TerminalCommand =
            serde_json::from_str(r#"{"type":"terminate","processId":"chat-proc-1"}"#)
                .expect("terminate command parses");

        match command {
            TerminalCommand::Terminate { process_id } => {
                assert_eq!(process_id.as_deref(), Some("chat-proc-1"));
            }
            _ => panic!("expected terminate command"),
        }
    }

    #[test]
    fn test_terminal_ws_query_accepts_api_key_auth_parameter() {
        let query: TerminalWsQuery = serde_urlencoded::from_str(
            "apiKey=local-terminal-key&cwd=%2Ftmp&processId=chat-process-1",
        )
        .expect("terminal websocket query parses with auth parameter");

        assert_eq!(query.cwd.as_deref(), Some("/tmp"));
        assert_eq!(query.process_id.as_deref(), Some("chat-process-1"));
    }

    #[test]
    fn test_terminal_ws_query_accepts_encoded_env_context() {
        let query: TerminalWsQuery =
            serde_urlencoded::from_str("env=%7B%22CLAWCTRL_RUNTIME%22%3A%22Work%20locally%22%7D")
                .expect("terminal websocket query parses encoded env");
        let env = parse_terminal_env(query.env).expect("encoded terminal env parses");

        assert_eq!(
            env,
            vec![("CLAWCTRL_RUNTIME".to_string(), "Work locally".to_string())]
        );
    }

    #[test]
    fn test_terminal_startup_error_payload_has_code_and_message() {
        let payload = terminal_startup_error_payload("pty_spawn_failed", "shell missing");
        let parsed: Value = serde_json::from_str(&payload).expect("payload parses");

        assert_eq!(parsed["type"], "error");
        assert_eq!(parsed["code"], "pty_spawn_failed");
        assert_eq!(parsed["error"], "shell missing");
    }

    #[test]
    fn test_pty_connection_guard() {
        let _guard = PTY_TEST_MUTEX.lock().expect("pty test mutex");

        // Reset counter to known state (tests may run in parallel)
        PTY_CONNECTIONS.store(0, Ordering::SeqCst);

        // Acquire 3 guards (should succeed)
        let g1 = PtyConnectionGuard::try_new();
        let g2 = PtyConnectionGuard::try_new();
        let g3 = PtyConnectionGuard::try_new();

        assert!(g1.is_some(), "1st guard should succeed");
        assert!(g2.is_some(), "2nd guard should succeed");
        assert!(g3.is_some(), "3rd guard should succeed");

        // 4th should fail
        let g4 = PtyConnectionGuard::try_new();
        assert!(g4.is_none(), "4th guard should fail (limit is 3)");

        // Drop one and try again
        drop(g3);
        let g5 = PtyConnectionGuard::try_new();
        assert!(g5.is_some(), "guard should succeed after dropping one");

        // Drop all remaining to clean up
        drop(g1);
        drop(g2);
        drop(g5);

        assert_eq!(
            PTY_CONNECTIONS.load(Ordering::SeqCst),
            0,
            "counter should be 0 after dropping all guards"
        );
    }

    #[test]
    fn test_terminal_status_response_shape() {
        let _guard = PTY_TEST_MUTEX.lock().expect("pty test mutex");

        // Reset counter
        PTY_CONNECTIONS.store(0, Ordering::SeqCst);

        // At 0 connections: active=0, max=3, available=3
        let active = PTY_CONNECTIONS.load(Ordering::Acquire);
        let available = MAX_PTY_CONNECTIONS.saturating_sub(active);
        let response = json!({
            "active": active,
            "max": MAX_PTY_CONNECTIONS,
            "available": available,
        });

        assert_eq!(response["active"], 0);
        assert_eq!(response["max"], 3);
        assert_eq!(response["available"], 3);

        // Simulate 2 connections
        PTY_CONNECTIONS.store(2, Ordering::SeqCst);
        let active = PTY_CONNECTIONS.load(Ordering::Acquire);
        let available = MAX_PTY_CONNECTIONS.saturating_sub(active);
        let response = json!({
            "active": active,
            "max": MAX_PTY_CONNECTIONS,
            "available": available,
        });

        assert_eq!(response["active"], 2);
        assert_eq!(response["max"], 3);
        assert_eq!(response["available"], 1);

        // Simulate full capacity
        PTY_CONNECTIONS.store(3, Ordering::SeqCst);
        let active = PTY_CONNECTIONS.load(Ordering::Acquire);
        let available = MAX_PTY_CONNECTIONS.saturating_sub(active);
        let response = json!({
            "active": active,
            "max": MAX_PTY_CONNECTIONS,
            "available": available,
        });

        assert_eq!(response["active"], 3);
        assert_eq!(response["max"], 3);
        assert_eq!(response["available"], 0);

        // Clean up
        PTY_CONNECTIONS.store(0, Ordering::SeqCst);
    }

    #[test]
    fn test_blocked_prefixes_complete() {
        // Verify that PTY_BLOCKED_PREFIXES contains entries for all known
        // secret prefixes from the codebase (secrets.rs KEY_ENV_MAP).
        let expected_prefixes = [
            "MC_",
            "OPENCLAW_",
            "COUCHDB_",
            "SUPABASE_",
            "BLUEBUBBLES_",
            "PROXMOX_",
            "OPNSENSE_",
            "PLEX_",
            "CALDAV_",
            "SONARR_",
            "RADARR_",
            "EMAIL_",
            "NTFY_",
            "MAC_BRIDGE_",
            "ANTHROPIC_",
        ];

        for prefix in &expected_prefixes {
            assert!(
                PTY_BLOCKED_PREFIXES.contains(prefix),
                "PTY_BLOCKED_PREFIXES missing: {prefix}"
            );
        }
    }
}
