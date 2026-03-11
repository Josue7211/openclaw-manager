use std::collections::HashMap;
use std::net::{SocketAddr, TcpStream};
use std::time::{Duration, Instant};
use tauri::AppHandle;
use tauri::Manager;
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

/// Spawn the Node.js sidecar with env vars injected.
///
/// The sidecar binary is the platform-specific Node.js executable registered
/// in `tauri.conf.json` under `bundle.externalBin`. It runs the Next.js
/// standalone `server.js` with `PORT=3000` and `HOSTNAME=127.0.0.1`.
///
/// Returns the `CommandChild` handle so the caller can kill it on shutdown.
pub fn spawn_sidecar(
    app: &AppHandle,
    env_vars: HashMap<String, String>,
) -> Result<CommandChild, String> {
    let server_js_path = get_server_js_path(app);

    println!("[sidecar] server.js path: {server_js_path}");

    let (mut rx, child) = app
        .shell()
        .sidecar("binaries/node")
        .map_err(|e| format!("Failed to create sidecar command: {e}"))?
        .args([&server_js_path])
        .envs(env_vars)
        .env("PORT", "3000")
        .env("HOSTNAME", "127.0.0.1")
        .env("NODE_ENV", "production")
        .spawn()
        .map_err(|e| format!("Failed to spawn sidecar: {e}"))?;

    // Log sidecar stdout/stderr in a background async task
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    let text = String::from_utf8_lossy(&line);
                    println!("[sidecar] {}", text.trim());
                }
                CommandEvent::Stderr(line) => {
                    let text = String::from_utf8_lossy(&line);
                    eprintln!("[sidecar:err] {}", text.trim());
                }
                CommandEvent::Terminated(status) => {
                    println!("[sidecar] terminated with status: {:?}", status);
                    break;
                }
                _ => {}
            }
        }
    });

    Ok(child)
}

/// Wait for the sidecar to be ready by attempting a TCP connection to
/// `127.0.0.1:3000`. Polls every 500 ms and gives up after `timeout_secs`.
///
/// Uses `std::net::TcpStream::connect_timeout` — intentionally lightweight,
/// no HTTP client dependency needed.
pub fn wait_for_ready(timeout_secs: u64) -> Result<(), String> {
    let addr: SocketAddr = "127.0.0.1:3000"
        .parse()
        .expect("valid socket address literal");
    let deadline = Instant::now() + Duration::from_secs(timeout_secs);
    let poll_interval = Duration::from_millis(500);
    let connect_timeout = Duration::from_millis(200);

    println!("[sidecar] waiting for server to be ready on {addr} (timeout {timeout_secs}s)…");

    loop {
        if Instant::now() >= deadline {
            return Err(format!(
                "Sidecar did not become ready within {timeout_secs} seconds"
            ));
        }

        match TcpStream::connect_timeout(&addr, connect_timeout) {
            Ok(_) => {
                println!("[sidecar] ready!");
                return Ok(());
            }
            Err(_) => {
                std::thread::sleep(poll_interval);
            }
        }
    }
}

/// Resolve the path to `server.js`.
///
/// **Production:** look inside the app's resource directory for
/// `standalone/server.js` (copied there by the bundle script).
///
/// **Dev fallback:** `.next/standalone/server.js` relative to the current
/// working directory (project root).
fn get_server_js_path(app: &AppHandle) -> String {
    // Try the production resource directory first.
    if let Ok(resource_dir) = app.path().resource_dir() {
        let prod_path = resource_dir.join("standalone").join("server.js");
        if prod_path.exists() {
            return prod_path.to_string_lossy().to_string();
        }
    }

    // Fallback for development / non-bundled runs.
    ".next/standalone/server.js".to_string()
}
