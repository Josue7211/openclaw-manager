#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod db;
mod error;
mod redact;
mod routes;
mod secrets;
mod server;
mod supabase;

fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "mission_control=info".into()),
        )
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![
            secrets::get_secret,
            secrets::set_secret,
            secrets::get_modules,
            secrets::check_first_run,
            commands::get_openclaw_dir,
        ])
        .setup(|app| {
            let handle = app.handle().clone();

            // Load keychain secrets into env vars
            let env_vars = secrets::load_env_vars();
            for (key, value) in &env_vars {
                std::env::set_var(key, value);
            }

            #[cfg(target_os = "linux")]
            {
                std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
                if std::env::var("WAYLAND_DISPLAY").is_ok() {
                    std::env::set_var("GDK_BACKEND", "wayland");
                }
            }

            // Start embedded Axum server (replaces Node.js sidecar)
            tauri::async_runtime::spawn(async move {
                if let Err(e) = crate::server::start(handle).await {
                    tracing::error!("Server error: {}", e);
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
