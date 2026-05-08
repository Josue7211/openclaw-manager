use axum::{extract::State, routing::get, Json, Router};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use crate::error::AppError;
use crate::harness_paths::{self, HarnessProviderLayout};
use crate::server::{AppState, RequireAuth};

/// Build the memory router (list recent harness memory entries).
pub fn router() -> Router<AppState> {
    Router::new().route("/memory", get(get_memory))
}

// ── GET /api/memory ─────────────────────────────────────────────────────────

async fn get_memory(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let provider = harness_paths::provider_layout(&state);
    let workspace = harness_paths::workspace_dir(&state);

    // Check for remote Harness API first
    if let Some(harness_url) = state
        .secret_first(&["HARNESS_API_URL", "HERMES_API_URL", "OPENCLAW_API_URL"])
        .filter(|s| !s.is_empty())
    {
        let client = reqwest::Client::new();
        let mut req = client.get(format!("{harness_url}/memory"));
        if let Some(key) =
            state.secret_first(&["HARNESS_API_KEY", "HERMES_API_KEY", "OPENCLAW_API_KEY"])
        {
            req = req.header("Authorization", format!("Bearer {key}"));
        }
        match req.send().await {
            Ok(res) if res.status().is_success() => {
                let body: Value = res.json().await.unwrap_or(json!({ "entries": [] }));
                return Ok(Json(body));
            }
            _ => {
                let entries = local_memory_entries(&workspace, provider, 8);
                return Ok(Json(json!({ "entries": entries })));
            }
        }
    }

    Ok(Json(json!({
        "entries": local_memory_entries(&workspace, provider, 8)
    })))
}

#[derive(Debug)]
struct LocalMemoryEntry {
    path: String,
    date: String,
    preview: String,
    modified_secs: u64,
}

fn local_memory_entries(
    workspace: &Path,
    provider: HarnessProviderLayout,
    limit: usize,
) -> Vec<Value> {
    let mut entries = Vec::new();
    for candidate in memory_candidates(provider) {
        let absolute = workspace.join(&candidate);
        if absolute.is_file() {
            collect_memory_file(workspace, &absolute, &mut entries);
        } else if absolute.is_dir() {
            collect_memory_dir(workspace, &absolute, &mut entries);
        }
    }

    entries.sort_by(|a, b| {
        b.modified_secs
            .cmp(&a.modified_secs)
            .then_with(|| a.path.cmp(&b.path))
    });

    entries
        .into_iter()
        .take(limit)
        .map(|entry| {
            json!({
                "date": entry.date,
                "preview": entry.preview,
                "path": entry.path,
            })
        })
        .collect()
}

fn memory_candidates(provider: HarnessProviderLayout) -> Vec<PathBuf> {
    let mut candidates = vec![
        PathBuf::from("memory"),
        PathBuf::from(".memd/wake.md"),
        PathBuf::from(".memd/mem.md"),
        PathBuf::from(".memd/events.md"),
        PathBuf::from(".memd/compiled/memory"),
        PathBuf::from(".memd/compiled/events"),
    ];

    if provider == HarnessProviderLayout::Hermes {
        candidates.insert(0, PathBuf::from("SOUL.md"));
    }

    candidates
}

fn collect_memory_dir(workspace: &Path, dir: &Path, entries: &mut Vec<LocalMemoryEntry>) {
    let Ok(children) = std::fs::read_dir(dir) else {
        return;
    };

    for child in children.flatten() {
        let path = child.path();
        if path.is_dir() {
            collect_memory_dir(workspace, &path, entries);
        } else if path.is_file() {
            collect_memory_file(workspace, &path, entries);
        }
    }
}

fn collect_memory_file(workspace: &Path, path: &Path, entries: &mut Vec<LocalMemoryEntry>) {
    if !is_memory_file(path) {
        return;
    }

    let Ok(relative) = path.strip_prefix(workspace) else {
        return;
    };
    let relative = relative.to_string_lossy().replace('\\', "/");
    let preview = std::fs::read_to_string(path)
        .ok()
        .and_then(|content| {
            content
                .lines()
                .find(|line| {
                    let trimmed = line.trim();
                    !trimmed.is_empty() && !trimmed.starts_with('#')
                })
                .map(|line| line.chars().take(120).collect::<String>())
        })
        .unwrap_or_default();
    let modified_secs = std::fs::metadata(path)
        .and_then(|metadata| metadata.modified())
        .ok()
        .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_secs())
        .unwrap_or_default();
    let date = Path::new(&relative)
        .file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or(&relative)
        .to_string();

    entries.push(LocalMemoryEntry {
        path: relative,
        date,
        preview,
        modified_secs,
    });
}

fn is_memory_file(path: &Path) -> bool {
    let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
        return false;
    };
    if name.starts_with('.') {
        return false;
    }
    matches!(
        path.extension().and_then(|extension| extension.to_str()),
        Some("md" | "markdown" | "txt")
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn local_harness_memory_reads_generic_workspace_memory() {
        let dir = tempfile::tempdir().unwrap();
        let workspace = dir.path();
        std::fs::create_dir_all(workspace.join("memory")).unwrap();
        std::fs::write(
            workspace.join("memory/2026-05-07.md"),
            "# heading\nremember this",
        )
        .unwrap();

        let entries = local_memory_entries(workspace, HarnessProviderLayout::Harness, 8);
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0]["path"], "memory/2026-05-07.md");
        assert_eq!(entries[0]["preview"], "remember this");
    }

    #[test]
    fn local_hermes_memory_reads_soul_and_memd_files() {
        let dir = tempfile::tempdir().unwrap();
        let workspace = dir.path();
        std::fs::create_dir_all(workspace.join(".memd/compiled/memory")).unwrap();
        std::fs::write(workspace.join("SOUL.md"), "# soul\ncore identity").unwrap();
        std::fs::write(workspace.join(".memd/mem.md"), "# mem\ncompiled memory").unwrap();
        std::fs::write(
            workspace.join(".memd/compiled/memory/session.md"),
            "# session\nworking memory",
        )
        .unwrap();

        let entries = local_memory_entries(workspace, HarnessProviderLayout::Hermes, 8);
        let paths = entries
            .iter()
            .filter_map(|entry| entry["path"].as_str())
            .collect::<Vec<_>>();

        assert!(paths.contains(&"SOUL.md"));
        assert!(paths.contains(&".memd/mem.md"));
        assert!(paths.contains(&".memd/compiled/memory/session.md"));
    }
}
