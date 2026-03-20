/// Return the path to the OpenClaw data directory (`$OPENCLAW_DIR` or `~/.openclaw`).
#[tauri::command]
pub fn get_openclaw_dir() -> String {
    std::env::var("OPENCLAW_DIR").unwrap_or_else(|_| {
        dirs::home_dir()
            .map(|h| h.join(".openclaw").to_string_lossy().into_owned())
            .unwrap_or_else(|| ".openclaw".to_string())
    })
}

/// Returns the absolute path to the log directory.
#[tauri::command]
pub fn get_log_dir() -> String {
    crate::logging::log_dir().to_string_lossy().into_owned()
}

/// Detect whether the OS is using a dark theme.
///
/// On Linux, Tauri's `getCurrentWindow().theme()` reads `gtk-application-prefer-dark-theme`
/// which is unset on Hyprland and many Wayland compositors, causing system mode to always
/// report "light". This command checks `gsettings` as a fallback:
///   1. `org.gnome.desktop.interface color-scheme` → "prefer-dark"
///   2. `org.gnome.desktop.interface gtk-theme` → name contains "dark" (case-insensitive)
///
/// On macOS/Windows, returns false (Tauri native detection works correctly there).
#[tauri::command]
pub fn detect_system_dark_mode() -> bool {
    #[cfg(target_os = "linux")]
    {
        // Check color-scheme first (GNOME 42+, also set by many Wayland compositors)
        if let Ok(output) = std::process::Command::new("gsettings")
            .args(["get", "org.gnome.desktop.interface", "color-scheme"])
            .output()
        {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                if stdout.contains("prefer-dark") {
                    return true;
                }
            }
        }

        // Fallback: check GTK theme name for "dark" substring
        if let Ok(output) = std::process::Command::new("gsettings")
            .args(["get", "org.gnome.desktop.interface", "gtk-theme"])
            .output()
        {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout).to_lowercase();
                if stdout.contains("dark") {
                    return true;
                }
            }
        }

        false
    }

    #[cfg(not(target_os = "linux"))]
    {
        false
    }
}

/// Opens the log directory in the system file manager.
#[tauri::command]
pub async fn open_log_dir() -> Result<String, String> {
    let dir = crate::logging::log_dir();
    if !dir.exists() {
        std::fs::create_dir_all(&dir).map_err(|e| format!("Failed to create log dir: {}", e))?;
    }

    // Use the `open` crate pattern via std::process::Command
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&dir)
            .spawn()
            .map_err(|e| format!("Failed to open folder: {}", e))?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&dir)
            .spawn()
            .map_err(|e| format!("Failed to open folder: {}", e))?;
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&dir)
            .spawn()
            .map_err(|e| format!("Failed to open folder: {}", e))?;
    }

    Ok(dir.to_string_lossy().into_owned())
}
