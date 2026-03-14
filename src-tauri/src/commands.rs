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
