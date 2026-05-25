pub mod app_paths;
pub mod audit;
pub mod commands;
pub mod crypto;
pub mod db;
pub mod error;
pub mod fonts;
pub mod gateway_ws;
pub mod gotrue;
pub mod harness_paths;
pub mod logging;
pub mod redact;
pub mod routes;
pub mod secrets;
pub mod server;
pub mod service_client;
pub mod supabase;
pub mod sync;
pub mod tailscale;
pub mod validation;
pub mod vendor;

pub fn initialize_process_runtime() {
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

    #[cfg(target_os = "linux")]
    {
        std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
    }

    std::env::set_var("GTK_A11Y", "none");
}

pub fn initialize_logging() {
    use tracing_subscriber::prelude::*;

    let env_filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| "clawctrl=info".into());

    let stdout_layer = tracing_subscriber::fmt::layer().with_target(true);
    let file_layer = logging::FileLogLayer::new();

    tracing_subscriber::registry()
        .with(env_filter)
        .with(stdout_layer)
        .with(file_layer)
        .init();

    logging::cleanup_old_logs(7);
    logging::cap_log_files(&logging::log_dir(), 100 * 1024 * 1024);

    tracing::info!("Log file: {}", logging::log_dir().display());
}

pub fn log_runtime_integrity_warnings() {
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

    #[cfg(target_os = "linux")]
    {
        if let Ok(preload) = std::env::var("LD_PRELOAD") {
            if !preload.is_empty() {
                tracing::warn!(ld_preload = %preload, "LD_PRELOAD is set — potential library injection");
            }
        }
    }

    if let Ok(exe_path) = std::env::current_exe() {
        if let Ok(bytes) = std::fs::read(&exe_path) {
            use sha2::{Digest, Sha256};
            let hash = Sha256::digest(&bytes);
            tracing::info!(binary_hash = %hex::encode(hash), "binary integrity check");
        }
    }
}

pub fn run_desktop_app() {
    initialize_process_runtime();
    initialize_logging();
    log_runtime_integrity_warnings();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            secrets::get_secret,
            secrets::set_secret,
            secrets::get_modules,
            secrets::check_first_run,
            commands::get_chat_workspace_context,
            commands::get_chat_project_for_path,
            commands::add_chat_workspace_project,
            commands::update_chat_workspace_project,
            commands::remove_chat_workspace_project,
            commands::read_chat_image_data_urls,
            commands::read_chat_context_files,
            commands::get_harness_dir,
            commands::get_openclaw_dir,
            commands::get_log_dir,
            commands::open_log_dir,
            commands::toggle_main_window_maximized,
            commands::toggle_main_window_fullscreen,
            commands::quit_app,
            commands::detect_system_dark_mode,
            commands::detect_gtk_theme,
            commands::read_wallbash_colors,
            commands::read_theme_conf,
            fonts::list_system_fonts,
            tailscale::check_tailscale,
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            let secrets = secrets::load_secrets();

            #[cfg(target_os = "linux")]
            {
                std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
                if std::env::var("WAYLAND_DISPLAY").is_ok() {
                    std::env::set_var("GDK_BACKEND", "wayland");
                }
            }

            {
                use tauri::menu::{MenuBuilder, MenuItemBuilder};
                use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
                use tauri::Manager;

                let show = MenuItemBuilder::with_id("show", "Show clawctrl").build(app)?;
                let quit = MenuItemBuilder::with_id("quit", "Quit").build(app)?;
                let menu = MenuBuilder::new(app).items(&[&show, &quit]).build()?;

                TrayIconBuilder::new()
                    .icon(app.default_window_icon().unwrap().clone())
                    .menu(&menu)
                    .tooltip("clawctrl")
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
                        if let TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        } = event
                        {
                            let app = tray.app_handle();
                            if let Some(w) = app.get_webview_window("main") {
                                let _ = w.show();
                                let _ = w.set_focus();
                            }
                        }
                    })
                    .build(app)?;

                let main_window = app.get_webview_window("main").unwrap();
                let _ = main_window.show();
                let _ = main_window.unminimize();
                let _ = main_window.set_focus();
                let win_clone = main_window.clone();
                main_window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = win_clone.hide();
                    }
                });
            }

            tauri::async_runtime::spawn(async move {
                if let Err(e) = crate::server::start(Some(handle), secrets).await {
                    tracing::error!("Server error: {}", e);
                }
            });

            #[cfg(target_os = "linux")]
            {
                let watcher_handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    crate::commands::start_wallbash_watcher(watcher_handle).await;
                });
                let monitor_handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    crate::commands::start_color_scheme_monitor(monitor_handle).await;
                });
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
