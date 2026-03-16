//! Simple file-based logging with daily rotation (last 7 days).
//!
//! Writes logs to `{data_local_dir}/mission-control/logs/mission-control-YYYY-MM-DD.log`.
//! On startup, deletes log files older than 7 days.
//!
//! This avoids adding `tracing-appender` as a dependency by implementing a
//! lightweight `tracing_subscriber::Layer` that writes to a file.

use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;
use tracing::field::Visit;
use tracing::Subscriber;
use tracing_subscriber::Layer;

/// Returns the log directory path: `{data_local_dir}/mission-control/logs/`
pub fn log_dir() -> PathBuf {
    dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("mission-control")
        .join("logs")
}

/// Returns the log file path for today.
fn log_file_path() -> PathBuf {
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    log_dir().join(format!("mission-control-{}.log", today))
}

/// Delete log files older than `keep_days` days.
pub fn cleanup_old_logs(keep_days: i64) {
    let dir = log_dir();
    if !dir.exists() {
        return;
    }

    let cutoff = chrono::Local::now() - chrono::Duration::days(keep_days);
    let cutoff_str = cutoff.format("%Y-%m-%d").to_string();

    let entries = match fs::read_dir(&dir) {
        Ok(e) => e,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        let name = entry.file_name();
        let name_str = name.to_string_lossy();

        // Match pattern: mission-control-YYYY-MM-DD.log
        if let Some(date_part) = name_str
            .strip_prefix("mission-control-")
            .and_then(|s| s.strip_suffix(".log"))
        {
            if date_part < cutoff_str.as_str() {
                if let Err(e) = fs::remove_file(entry.path()) {
                    eprintln!("Failed to remove old log {}: {}", name_str, e);
                }
            }
        }
    }
}

/// A tracing Layer that writes formatted log lines to a daily log file.
pub struct FileLogLayer {
    file: Mutex<Option<(String, File)>>, // (current_date, file_handle)
}

impl FileLogLayer {
    /// Create a new file-logging layer, opening today's log file.
    pub fn new() -> Self {
        let dir = log_dir();
        if let Err(e) = fs::create_dir_all(&dir) {
            eprintln!("Failed to create log directory {:?}: {}", dir, e);
        }

        // Restrict log directory permissions to owner only
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = fs::set_permissions(&dir, fs::Permissions::from_mode(0o700));
        }

        let file = Self::open_log_file();
        let today = chrono::Local::now().format("%Y-%m-%d").to_string();

        FileLogLayer {
            file: Mutex::new(file.map(|f| (today, f))),
        }
    }

    fn open_log_file() -> Option<File> {
        let path = log_file_path();
        let file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)
            .ok()?;

        // Restrict log file permissions to owner only
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600));
        }

        Some(file)
    }

    /// Ensure the file handle points to today's log (rotate at midnight).
    fn ensure_current_file(&self) -> Option<std::sync::MutexGuard<'_, Option<(String, File)>>> {
        let mut guard = self.file.lock().ok()?;
        let today = chrono::Local::now().format("%Y-%m-%d").to_string();

        let needs_rotate = match &*guard {
            Some((date, _)) => date != &today,
            None => true,
        };

        if needs_rotate {
            *guard = Self::open_log_file().map(|f| (today, f));
        }

        Some(guard)
    }
}

/// Helper to collect tracing field key-value pairs into a string.
struct FieldCollector {
    fields: String,
}

impl FieldCollector {
    fn new() -> Self {
        Self {
            fields: String::new(),
        }
    }
}

impl Visit for FieldCollector {
    fn record_debug(&mut self, field: &tracing::field::Field, value: &dyn std::fmt::Debug) {
        if field.name() == "message" {
            if !self.fields.is_empty() {
                self.fields.push(' ');
            }
            self.fields.push_str(&format!("{:?}", value));
        } else {
            if !self.fields.is_empty() {
                self.fields.push(' ');
            }
            self.fields.push_str(&format!("{}={:?}", field.name(), value));
        }
    }

    fn record_str(&mut self, field: &tracing::field::Field, value: &str) {
        if field.name() == "message" {
            if !self.fields.is_empty() {
                self.fields.push(' ');
            }
            self.fields.push_str(value);
        } else {
            if !self.fields.is_empty() {
                self.fields.push(' ');
            }
            self.fields.push_str(&format!("{}=\"{}\"", field.name(), value));
        }
    }
}

impl<S: Subscriber> Layer<S> for FileLogLayer {
    fn on_event(
        &self,
        event: &tracing::Event<'_>,
        _ctx: tracing_subscriber::layer::Context<'_, S>,
    ) {
        let metadata = event.metadata();
        let level = metadata.level();
        let target = metadata.target();
        let timestamp = chrono::Local::now().format("%Y-%m-%dT%H:%M:%S%.3f");

        let mut collector = FieldCollector::new();
        event.record(&mut collector);

        let line = format!(
            "{} {:>5} {} {}\n",
            timestamp, level, target, collector.fields
        );

        if let Some(mut guard) = self.ensure_current_file() {
            if let Some((_, ref mut file)) = *guard {
                let _ = file.write_all(line.as_bytes());
            }
        }
    }
}
