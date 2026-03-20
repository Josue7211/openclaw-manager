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

/// Detect the current GTK theme name on Linux.
///
/// Runs `gsettings get org.gnome.desktop.interface gtk-theme` and returns the
/// theme name (e.g. "Rose-Pine", "Catppuccin-Mocha", "Adwaita-dark").
/// The frontend uses this to map the system GTK theme to a built-in preset.
///
/// Returns an empty string on non-Linux platforms or if gsettings is unavailable.
#[tauri::command]
pub fn detect_gtk_theme() -> String {
    #[cfg(target_os = "linux")]
    {
        if let Ok(output) = std::process::Command::new("gsettings")
            .args(["get", "org.gnome.desktop.interface", "gtk-theme"])
            .output()
        {
            if output.status.success() {
                // gsettings wraps the value in single quotes, e.g. 'Rose-Pine'
                let raw = String::from_utf8_lossy(&output.stdout);
                return raw.trim().trim_matches('\'').to_string();
            }
        }
        String::new()
    }

    #[cfg(not(target_os = "linux"))]
    {
        String::new()
    }
}

// ---------------------------------------------------------------------------
// Wallbash / HyDE theme integration
// ---------------------------------------------------------------------------

/// Parse `~/.config/hypr/themes/colors.conf` and return a JSON map of
/// `"variable_name" -> "#RRGGBB"`. Skips `_rgba` variants, comments, and
/// blank lines. Returns an empty object if the file does not exist.
pub fn read_wallbash_colors_inner() -> Result<serde_json::Value, std::io::Error> {
    read_wallbash_colors_from_path(
        &dirs::home_dir()
            .unwrap_or_default()
            .join(".config/hypr/themes/colors.conf"),
    )
}

/// Testable inner: parse a wallbash colors file at an arbitrary path.
pub fn read_wallbash_colors_from_path(
    path: &std::path::Path,
) -> Result<serde_json::Value, std::io::Error> {
    if !path.exists() {
        return Ok(serde_json::Value::Object(serde_json::Map::new()));
    }

    let content = std::fs::read_to_string(path)?;
    let mut colors = serde_json::Map::new();

    for line in content.lines() {
        let trimmed = line.trim();
        // Skip empty, comments, and _rgba variants
        if trimmed.is_empty() || trimmed.starts_with('#') || trimmed.contains("_rgba") {
            continue;
        }
        // Match: $variable_name = RRGGBB  (possibly with trailing # comment)
        if let Some(rest) = trimmed.strip_prefix('$') {
            if let Some((name_part, value_part)) = rest.split_once('=') {
                let name = name_part.trim();
                // Strip trailing comment
                let value_raw = value_part.split('#').next().unwrap_or("").trim();
                // Validate 6-char hex
                if value_raw.len() == 6
                    && value_raw.chars().all(|c| c.is_ascii_hexdigit())
                {
                    colors.insert(
                        name.to_string(),
                        serde_json::Value::String(format!("#{}", value_raw)),
                    );
                }
            }
        }
    }

    Ok(serde_json::Value::Object(colors))
}

/// Parse `~/.config/hypr/themes/theme.conf` and return JSON with
/// `gtk_theme`, `icon_theme`, and `color_scheme` fields.
/// Returns empty strings if the file does not exist.
pub fn read_theme_conf_inner() -> Result<serde_json::Value, std::io::Error> {
    read_theme_conf_from_path(
        &dirs::home_dir()
            .unwrap_or_default()
            .join(".config/hypr/themes/theme.conf"),
    )
}

/// Testable inner: parse a theme.conf file at an arbitrary path.
pub fn read_theme_conf_from_path(
    path: &std::path::Path,
) -> Result<serde_json::Value, std::io::Error> {
    let mut gtk_theme = String::new();
    let mut icon_theme = String::new();
    let mut color_scheme = String::new();

    if path.exists() {
        let content = std::fs::read_to_string(path)?;
        for line in content.lines() {
            let trimmed = line.trim();
            if let Some(rest) = trimmed.strip_prefix('$') {
                if let Some((key, val)) = rest.split_once('=') {
                    let key = key.trim();
                    let val = val.trim().trim_matches('"').trim_matches('\'').trim();
                    match key {
                        "GTK_THEME" => gtk_theme = val.to_string(),
                        "ICON_THEME" => icon_theme = val.to_string(),
                        "COLOR_SCHEME" => color_scheme = val.to_string(),
                        _ => {}
                    }
                }
            }
        }
    }

    Ok(serde_json::json!({
        "gtk_theme": gtk_theme,
        "icon_theme": icon_theme,
        "color_scheme": color_scheme,
    }))
}

#[tauri::command]
pub fn read_wallbash_colors() -> Result<serde_json::Value, String> {
    read_wallbash_colors_inner().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn read_theme_conf() -> Result<serde_json::Value, String> {
    read_theme_conf_inner().map_err(|e| e.to_string())
}

/// Spawn a file watcher on `~/.config/hypr/themes/` (Linux only).
///
/// Emits Tauri events when wallbash colors or GTK theme config change:
/// - `wallbash-colors-changed` with the parsed color map
/// - `gtk-theme-changed` with theme/icon/color-scheme info
///
/// Uses a 100 ms debounce to avoid partial reads during atomic writes.
pub async fn start_wallbash_watcher(handle: tauri::AppHandle) {
    use notify::{Config, RecommendedWatcher, RecursiveMode, Watcher};
    use std::sync::mpsc;
    use tauri::Emitter;

    let themes_dir = match dirs::home_dir() {
        Some(h) => h.join(".config/hypr/themes"),
        None => return,
    };
    if !themes_dir.exists() {
        tracing::info!("Wallbash themes dir not found, skipping watcher");
        return;
    }

    let (tx, rx) = mpsc::channel();
    let mut watcher = match RecommendedWatcher::new(tx, Config::default()) {
        Ok(w) => w,
        Err(e) => {
            tracing::warn!("Failed to create file watcher: {}", e);
            return;
        }
    };

    if let Err(e) = watcher.watch(&themes_dir, RecursiveMode::NonRecursive) {
        tracing::warn!("Failed to watch themes dir: {}", e);
        return;
    }

    tracing::info!("Wallbash watcher started on {}", themes_dir.display());

    // Move watcher into the blocking task so it doesn't get dropped.
    // Wallbash writes colors.conf and theme.conf in quick succession during a
    // theme switch. Instead of emitting two separate events (which causes a
    // flash of wrong colors), we coalesce: wait for writes to settle, then
    // emit a single "wallbash-theme-update" event with both colors and config.
    tokio::task::spawn_blocking(move || {
        let _watcher = watcher; // keep alive

        let mut last_emit_ts = std::time::Instant::now() - std::time::Duration::from_secs(1);
        let debounce = std::time::Duration::from_millis(250);

        loop {
            match rx.recv() {
                Ok(Ok(event)) => {
                    use notify::EventKind;
                    match event.kind {
                        EventKind::Modify(_) | EventKind::Create(_) => {}
                        _ => continue,
                    }

                    let dominated = event.paths.iter().any(|p| {
                        let name = p.file_name().and_then(|n| n.to_str()).unwrap_or("");
                        name == "colors.conf" || name == "theme.conf"
                    });
                    if !dominated {
                        continue;
                    }

                    let now = std::time::Instant::now();
                    if now.duration_since(last_emit_ts) < debounce {
                        continue;
                    }

                    // Wait a bit for the other file to finish writing
                    std::thread::sleep(std::time::Duration::from_millis(150));
                    // Drain any queued events that arrived during the sleep
                    while rx.try_recv().is_ok() {}
                    last_emit_ts = std::time::Instant::now();

                    // Read BOTH files and emit a single combined event
                    let colors = read_wallbash_colors_inner().ok();
                    let theme = read_theme_conf_inner().ok();

                    let payload = serde_json::json!({
                        "colors": colors.unwrap_or_else(|| serde_json::json!({})),
                        "theme": theme.unwrap_or_else(|| serde_json::json!({
                            "gtk_theme": "", "icon_theme": "", "color_scheme": ""
                        })),
                    });

                    tracing::info!("Wallbash theme update, emitting combined event");
                    let _ = handle.emit("wallbash-theme-update", &payload);
                }
                Ok(Err(e)) => {
                    tracing::warn!("File watcher error: {}", e);
                }
                Err(_) => {
                    tracing::info!("Wallbash watcher channel closed, stopping");
                    break;
                }
            }
        }
    });
}

// ---------------------------------------------------------------------------
// Tests for wallbash / theme parsers
// ---------------------------------------------------------------------------
#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn test_wallbash_parse() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("colors.conf");
        let mut f = std::fs::File::create(&path).unwrap();
        writeln!(f, "# HyDE wallbash palette").unwrap();
        writeln!(f, "$wallbash_pry1 = 11151A    # darkest bg").unwrap();
        writeln!(f, "$wallbash_txt1 = FFFFFF    # white text").unwrap();
        writeln!(f, "$wallbash_1xa1 = 293B52").unwrap();
        writeln!(f, "$wallbash_pry1_rgba = rgba(17,21,26,0.8)  # skip this").unwrap();
        writeln!(f, "").unwrap();
        writeln!(f, "# another comment").unwrap();
        writeln!(f, "$wallbash_pry4 = AC8986").unwrap();

        let result = read_wallbash_colors_from_path(&path).unwrap();
        let obj = result.as_object().unwrap();

        assert_eq!(obj.get("wallbash_pry1").unwrap(), "#11151A");
        assert_eq!(obj.get("wallbash_txt1").unwrap(), "#FFFFFF");
        assert_eq!(obj.get("wallbash_1xa1").unwrap(), "#293B52");
        assert_eq!(obj.get("wallbash_pry4").unwrap(), "#AC8986");
        // rgba variants must be skipped
        assert!(obj.get("wallbash_pry1_rgba").is_none());
        assert_eq!(obj.len(), 4);
    }

    #[test]
    fn test_theme_conf_parse() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("theme.conf");
        let mut f = std::fs::File::create(&path).unwrap();
        writeln!(f, "$GTK_THEME = Decay-Green").unwrap();
        writeln!(f, "$ICON_THEME = Tela-circle-green").unwrap();
        writeln!(f, "$COLOR_SCHEME = prefer-dark").unwrap();

        let result = read_theme_conf_from_path(&path).unwrap();
        assert_eq!(result["gtk_theme"], "Decay-Green");
        assert_eq!(result["icon_theme"], "Tela-circle-green");
        assert_eq!(result["color_scheme"], "prefer-dark");
    }

    #[test]
    fn test_empty_file_wallbash() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("nonexistent.conf");
        let result = read_wallbash_colors_from_path(&path).unwrap();
        assert_eq!(result.as_object().unwrap().len(), 0);
    }

    #[test]
    fn test_empty_file_theme_conf() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("nonexistent.conf");
        let result = read_theme_conf_from_path(&path).unwrap();
        assert_eq!(result["gtk_theme"], "");
        assert_eq!(result["icon_theme"], "");
        assert_eq!(result["color_scheme"], "");
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
