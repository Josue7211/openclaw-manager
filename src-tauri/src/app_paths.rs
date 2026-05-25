use std::fs;
use std::path::PathBuf;

pub const APP_DIR_NAME: &str = "clawctrl";
pub const LEGACY_APP_DIR_NAME: &str = "clawcontrol";
pub const OLDEST_APP_DIR_NAME: &str = "mission-control";
pub const APP_LOG_PREFIX: &str = "clawctrl";
pub const LEGACY_APP_LOG_PREFIX: &str = "clawcontrol";
pub const OLDEST_APP_LOG_PREFIX: &str = "mission-control";

fn data_local_root() -> PathBuf {
    if let Ok(path) =
        std::env::var("CLAWCTRL_DATA_DIR").or_else(|_| std::env::var("CLAWCONTROL_DATA_DIR"))
    {
        let trimmed = path.trim();
        if !trimmed.is_empty() {
            return PathBuf::from(trimmed);
        }
    }
    dirs::data_local_dir().unwrap_or_else(|| PathBuf::from("."))
}

pub fn app_data_dir() -> PathBuf {
    data_local_root().join(APP_DIR_NAME)
}

pub fn legacy_app_data_dir() -> PathBuf {
    data_local_root().join(LEGACY_APP_DIR_NAME)
}

pub fn oldest_app_data_dir() -> PathBuf {
    data_local_root().join(OLDEST_APP_DIR_NAME)
}

pub fn resolve_app_data_dir() -> PathBuf {
    let current = app_data_dir();
    if current.exists() {
        return current;
    }

    for legacy in [legacy_app_data_dir(), oldest_app_data_dir()] {
        if !legacy.exists() {
            continue;
        }
        match fs::rename(&legacy, &current) {
            Ok(()) => return current,
            Err(err) => {
                eprintln!(
                    "Failed to migrate app data dir from {} to {}: {}",
                    legacy.display(),
                    current.display(),
                    err
                );
                return legacy;
            }
        }
    }

    current
}

pub fn active_log_prefix() -> &'static str {
    let active_dir = resolve_app_data_dir();
    if active_dir.file_name().and_then(|name| name.to_str()) == Some(LEGACY_APP_DIR_NAME) {
        LEGACY_APP_LOG_PREFIX
    } else if active_dir.file_name().and_then(|name| name.to_str()) == Some(OLDEST_APP_DIR_NAME) {
        OLDEST_APP_LOG_PREFIX
    } else {
        APP_LOG_PREFIX
    }
}
