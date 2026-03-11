#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod secrets;
mod sidecar;

use std::sync::Mutex;
use tauri::Manager;
use tauri_plugin_shell::process::CommandChild;

/// Holds the sidecar child process handle so we can kill it on shutdown.
struct SidecarState(Mutex<Option<CommandChild>>);

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .manage(SidecarState(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            secrets::get_secret,
            secrets::set_secret,
            secrets::get_modules,
            secrets::check_first_run,
        ])
        .setup(|app| {
            // In dev mode the Next.js dev server is started by `beforeDevCommand`
            // in tauri.conf.json, so we skip sidecar spawning entirely.
            if cfg!(debug_assertions) {
                println!("[main] Dev mode — sidecar managed by beforeDevCommand");
                return Ok(());
            }

            // Load keychain secrets as env vars for the sidecar process.
            let env_vars = secrets::load_env_vars();

            // On first run there are no secrets configured yet. The webview
            // will show a setup wizard; once secrets are saved the user
            // restarts the app and the sidecar launches normally.
            if secrets::is_first_run() {
                println!("[main] First run detected — skipping sidecar, showing setup wizard");
                return Ok(());
            }

            let app_handle = app.handle().clone();

            // Spawn the Node.js sidecar and wait for it to accept connections.
            match sidecar::spawn_sidecar(&app_handle, env_vars) {
                Ok(child) => {
                    println!("[main] Sidecar spawned, waiting for health check…");
                    if let Err(e) = sidecar::wait_for_ready(30) {
                        eprintln!("[main] Sidecar health check failed: {e}");
                    } else {
                        // Store the child handle so we can kill it later.
                        let state = app_handle.state::<SidecarState>();
                        *state.0.lock().unwrap() = Some(child);
                    }
                }
                Err(e) => {
                    eprintln!("[main] Failed to start sidecar: {e}");
                }
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                let state = window.state::<SidecarState>();
                let mut guard = state.0.lock().unwrap();
                if let Some(child) = guard.take() {
                    println!("[main] Killing sidecar on window close…");
                    let _ = child.kill();
                    println!("[main] Sidecar killed");
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
