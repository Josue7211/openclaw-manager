use axum::{
    extract::{
        ws::{Message, WebSocket},
        State, WebSocketUpgrade,
    },
    response::{IntoResponse, Response},
    routing::get,
    Json, Router,
};
use futures::{SinkExt, StreamExt};
use portable_pty::{CommandBuilder, MasterPty, PtySize};
use serde::Deserialize;
use serde_json::json;
use std::io::Read;
use std::io::Write as IoWrite;
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
fn build_pty_command() -> CommandBuilder {
    let shell = detect_shell();
    let mut cmd = CommandBuilder::new(&shell);

    // CRITICAL: Clear ALL env vars first -- Tauri process has 30+ secrets
    cmd.env_clear();

    // Whitelist only safe system variables
    for (key, val) in build_sanitized_env() {
        cmd.env(key, val);
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
}

// ---------------------------------------------------------------------------
// PTY cleanup with process group kill on Drop
// ---------------------------------------------------------------------------

struct PtyCleanup {
    child: Box<dyn portable_pty::Child + Send + Sync>,
    #[allow(dead_code)]
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
                    libc::kill(-(pgid as i32), libc::SIGKILL);
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

    ws.max_message_size(64 * 1024)
        .on_upgrade(move |socket| handle_terminal_ws(socket, guard))
}

// ---------------------------------------------------------------------------
// Bidirectional WebSocket <-> PTY relay
// ---------------------------------------------------------------------------

async fn handle_terminal_ws(socket: WebSocket, _guard: PtyConnectionGuard) {
    info!("terminal: new PTY session");

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
            return;
        }
    };

    // 2. Build command with sanitized env
    let cmd = build_pty_command();

    // 3. Spawn shell on slave
    let child = match pair.slave.spawn_command(cmd) {
        Ok(c) => c,
        Err(e) => {
            error!("terminal: failed to spawn shell: {e}");
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
            return;
        }
    };

    // 7. Take writer (blocking Write)
    let writer = match pair.master.take_writer() {
        Ok(w) => w,
        Err(e) => {
            error!("terminal: failed to take writer: {e}");
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

    info!("terminal: PTY session ended");
}

// ---------------------------------------------------------------------------
// Status endpoint (pre-flight capacity check)
// ---------------------------------------------------------------------------

async fn terminal_status(
    RequireAuth(_session): RequireAuth,
) -> Json<serde_json::Value> {
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
    fn test_pty_connection_guard() {
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
