#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

pub mod audit;
mod commands;
pub mod crypto;
mod fonts;
mod db;
mod error;
pub mod gotrue;
mod logging;
mod redact;
mod routes;
mod secrets;
mod server;
mod service_client;
mod supabase;
pub mod sync;
mod tailscale;
pub mod validation;

fn main() {
    // Prevent core dumps from containing sensitive data (keys, tokens, passwords).
    // Must be the very first thing before any secrets are loaded.
    #[cfg(unix)]
    {
        use libc::{rlimit, setrlimit, RLIMIT_CORE};
        let zero = rlimit {
            rlim_cur: 0,
            rlim_max: 0,
        };
        unsafe {
            setrlimit(RLIMIT_CORE, &zero);
        }
    }

    // Hyprland/Wayland: must be set before any GTK/WebKit initialization
    #[cfg(target_os = "linux")]
    {
        std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
    }

    // Suppress harmless GTK theme parsing warnings from WebKitGTK
    std::env::set_var("GTK_A11Y", "none");

    // Set up logging: stdout + daily rotating log file.
    // Log files go to {data_local_dir}/mission-control/logs/
    // Old logs (>7 days) are cleaned up on each startup.
    {
        use tracing_subscriber::prelude::*;

        let env_filter = tracing_subscriber::EnvFilter::try_from_default_env()
            .unwrap_or_else(|_| "mission_control=info".into());

        let stdout_layer = tracing_subscriber::fmt::layer()
            .with_target(true);

        let file_layer = logging::FileLogLayer::new();

        tracing_subscriber::registry()
            .with(env_filter)
            .with(stdout_layer)
            .with(file_layer)
            .init();

        // Clean up log files older than 7 days, then remove any that exceed 100 MB
        logging::cleanup_old_logs(7);
        logging::cap_log_files(&logging::log_dir(), 100 * 1024 * 1024);

        tracing::info!("Log file: {}", logging::log_dir().display());
    }

    // -----------------------------------------------------------------------
    // Runtime integrity & tamper detection
    // -----------------------------------------------------------------------
    // These checks run after logging is initialized but before secrets are
    // loaded. They are warnings only — they never block startup.

    // 1. Debugger detection (Linux: check TracerPid in /proc/self/status)
    #[cfg(target_os = "linux")]
    {
        if let Ok(status) = std::fs::read_to_string("/proc/self/status") {
            for line in status.lines() {
                if let Some(pid) = line.strip_prefix("TracerPid:") {
                    let pid = pid.trim();
                    if pid != "0" {
                        tracing::warn!(tracer_pid = %pid, "debugger detected — process is being traced");
                    }
                }
            }
        }
    }

    // 2. LD_PRELOAD detection (Linux: potential library injection)
    #[cfg(target_os = "linux")]
    {
        if let Ok(preload) = std::env::var("LD_PRELOAD") {
            if !preload.is_empty() {
                tracing::warn!(ld_preload = %preload, "LD_PRELOAD is set — potential library injection");
            }
        }
    }

    // 3. Binary integrity check (SHA-256 of the running executable)
    {
        if let Ok(exe_path) = std::env::current_exe() {
            if let Ok(bytes) = std::fs::read(&exe_path) {
                use sha2::{Sha256, Digest};
                let hash = Sha256::digest(&bytes);
                tracing::info!(binary_hash = %hex::encode(hash), "binary integrity check");
            }
        }
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        // TODO: System tray — add `tauri-plugin-tray = "2"` to Cargo.toml, then:
        //   .plugin(tauri_plugin_tray::init())
        // and configure the tray icon + menu in .setup() below. The icon path
        // is already set in tauri.conf.json under app.trayIcon.
        //
        // TODO: Global shortcut — add `tauri-plugin-global-shortcut = "2"` to Cargo.toml, then:
        //   .plugin(tauri_plugin_global_shortcut::Builder::new().with_handler(|app, shortcut, event| {
        //       if shortcut.matches(tauri_plugin_global_shortcut::Modifiers::SUPER | tauri_plugin_global_shortcut::Modifiers::SHIFT, tauri_plugin_global_shortcut::Code::KeyM) {
        //           if let tauri_plugin_global_shortcut::ShortcutState::Pressed = event.state {
        //               if let Some(window) = app.get_webview_window("main") {
        //                   if window.is_visible().unwrap_or(false) {
        //                       let _ = window.hide();
        //                   } else {
        //                       let _ = window.show();
        //                       let _ = window.set_focus();
        //                   }
        //               }
        //           }
        //       }
        //   }).build())
        // Also add "global-shortcut:allow-register" to capabilities/default.json.
        //
        // TODO: Auto-start — add `tauri-plugin-autostart = "2"` to Cargo.toml, then:
        //   .plugin(tauri_plugin_autostart::init(
        //       tauri_plugin_autostart::MacosLauncher::LaunchAgent,
        //       Some(vec!["--minimized"]),
        //   ))
        // Also add "autostart:allow-enable", "autostart:allow-disable",
        // "autostart:allow-is-enabled" to capabilities/default.json.
        //
        // TODO: Auto-updater — add `tauri-plugin-updater = "2"` to Cargo.toml, then:
        //   .plugin(tauri_plugin_updater::Builder::new().build())
        // Also:
        //   1. Move "_plugins_TODO" → "plugins" in tauri.conf.json and fill in your
        //      GitHub repo URL + public key (see `tauri signer generate`).
        //   2. Move "_permissions_TODO" entries into "permissions" in capabilities/default.json.
        //   3. Add "updater:default" to capabilities/default.json permissions array.
        //   4. Set up GitHub Actions to build + publish signed releases.
        .invoke_handler(tauri::generate_handler![
            secrets::get_secret,
            secrets::set_secret,
            secrets::get_modules,
            secrets::check_first_run,
            commands::get_openclaw_dir,
            commands::get_log_dir,
            commands::open_log_dir,
            commands::detect_system_dark_mode,
            commands::detect_gtk_theme,
            fonts::list_system_fonts,
        ])
        .setup(|app| {
            let handle = app.handle().clone();

            // Load secrets from keychain, then merge in .env.local for dev mode
            let secrets = secrets::load_secrets();

            #[cfg(target_os = "linux")]
            {
                std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
                if std::env::var("WAYLAND_DISPLAY").is_ok() {
                    std::env::set_var("GDK_BACKEND", "wayland");
                }
            }

            // System tray + window close prevention
            {
                use tauri::tray::{TrayIconBuilder, MouseButton, MouseButtonState, TrayIconEvent};
                use tauri::menu::{MenuBuilder, MenuItemBuilder};
                use tauri::Manager;

                let show = MenuItemBuilder::with_id("show", "Show OpenClaw Manager").build(app)?;
                let quit = MenuItemBuilder::with_id("quit", "Quit").build(app)?;
                let menu = MenuBuilder::new(app).items(&[&show, &quit]).build()?;

                TrayIconBuilder::new()
                    .icon(app.default_window_icon().unwrap().clone())
                    .menu(&menu)
                    .tooltip("OpenClaw Manager")
                    .on_menu_event(|app, event| match event.id().as_ref() {
                        "show" => {
                            if let Some(w) = app.get_webview_window("main") {
                                let _ = w.show();
                                let _ = w.set_focus();
                            }
                        }
                        "quit" => app.exit(0),
                        _ => {}
                    })
                    .on_tray_icon_event(|tray, event| {
                        if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                            let app = tray.app_handle();
                            if let Some(w) = app.get_webview_window("main") {
                                let _ = w.show();
                                let _ = w.set_focus();
                            }
                        }
                    })
                    .build(app)?;

                // Prevent close from killing the app — hide to tray instead.
                // Only truly quit from the tray menu "Quit" option.
                let main_window = app.get_webview_window("main").unwrap();
                let win_clone = main_window.clone();
                main_window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = win_clone.hide();
                    }
                });
            }

            // Start embedded Axum server (replaces Node.js sidecar)
            tauri::async_runtime::spawn(async move {
                if let Err(e) = crate::server::start(handle, secrets).await {
                    tracing::error!("Server error: {}", e);
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
