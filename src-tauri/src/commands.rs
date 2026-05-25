use base64::Engine as _;
use serde::{Deserialize, Deserializer, Serialize};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

fn deserialize_optional_optional_string<'de, D>(
    deserializer: D,
) -> Result<Option<Option<String>>, D::Error>
where
    D: Deserializer<'de>,
{
    Option::<String>::deserialize(deserializer).map(Some)
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatProjectScript {
    pub id: String,
    pub name: String,
    pub command: String,
    pub cwd: Option<String>,
    pub icon: Option<String>,
    pub keybinding: Option<String>,
    pub run_on_worktree_create: Option<bool>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatWorkspaceProjectPatch {
    pub name: Option<String>,
    pub machine_label: Option<String>,
    pub scripts: Option<Vec<ChatProjectScript>>,
    #[serde(default, deserialize_with = "deserialize_optional_optional_string")]
    pub grouping_override: Option<Option<String>>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatRepositoryIdentity {
    pub canonical_key: String,
    pub root_path: Option<String>,
    pub display_name: Option<String>,
    pub name: Option<String>,
    pub owner: Option<String>,
    pub remote_name: Option<String>,
    pub remote_url: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatWorkspaceProject {
    pub id: Option<String>,
    pub environment_id: Option<String>,
    pub name: String,
    pub path: String,
    pub branches: Vec<String>,
    pub current_branch: Option<String>,
    pub repository_identity: Option<ChatRepositoryIdentity>,
    pub machine: Option<String>,
    pub machine_label: Option<String>,
    pub host: Option<String>,
    pub group: Option<String>,
    pub root: Option<String>,
    pub scripts: Option<Vec<ChatProjectScript>>,
    pub grouping_override: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatWorkspaceContext {
    pub projects: Vec<ChatWorkspaceProject>,
    pub runtime_modes: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatWorkspaceProjectMutationResponse {
    pub project: ChatWorkspaceProject,
    pub projects: Vec<ChatWorkspaceProject>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatContextFileAttachment {
    pub id: String,
    pub name: String,
    pub path: String,
    pub mime_type: Option<String>,
    pub size: Option<u64>,
    pub content: String,
    pub truncated: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalChatSessionMessage {
    pub id: String,
    pub role: String,
    pub text: String,
    pub timestamp: String,
    pub images: Option<Vec<String>>,
    pub context_files: Option<Vec<serde_json::Value>>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalChatSession {
    pub key: String,
    pub label: String,
    pub agent_key: String,
    pub message_count: usize,
    pub last_activity: String,
    pub provider: String,
    pub project_id: Option<String>,
    pub project: Option<String>,
    pub project_root: Option<String>,
    pub working_dir: Option<String>,
    pub environment_id: Option<String>,
    pub branch: Option<String>,
    pub runtime: Option<String>,
    pub local: bool,
    pub pinned: Option<bool>,
    pub favorite: Option<bool>,
    pub messages: Vec<LocalChatSessionMessage>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalChatSessionSummary {
    pub key: String,
    pub label: String,
    pub agent_key: String,
    pub message_count: usize,
    pub last_activity: String,
    pub provider: String,
    pub project_id: Option<String>,
    pub project: Option<String>,
    pub project_root: Option<String>,
    pub working_dir: Option<String>,
    pub environment_id: Option<String>,
    pub branch: Option<String>,
    pub runtime: Option<String>,
    pub local: bool,
    pub pinned: Option<bool>,
    pub favorite: Option<bool>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalChatCompactResult {
    pub key: String,
    pub messages_removed: usize,
    pub message_count: usize,
    pub tokens_saved: usize,
}

impl From<&LocalChatSession> for LocalChatSessionSummary {
    fn from(session: &LocalChatSession) -> Self {
        Self {
            key: session.key.clone(),
            label: session.label.clone(),
            agent_key: session.agent_key.clone(),
            message_count: session.message_count,
            last_activity: session.last_activity.clone(),
            provider: session.provider.clone(),
            project_id: session.project_id.clone(),
            project: session.project.clone(),
            project_root: session.project_root.clone(),
            working_dir: session.working_dir.clone(),
            environment_id: session.environment_id.clone(),
            branch: session.branch.clone(),
            runtime: session.runtime.clone(),
            local: session.local,
            pinned: session.pinned,
            favorite: session.favorite,
        }
    }
}

fn basename(path: &Path) -> String {
    path.file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.trim().is_empty())
        .unwrap_or("Project")
        .to_string()
}

fn machine_label_for_path(path: &Path) -> String {
    let text = path.to_string_lossy();
    if text.starts_with("/run/media/") {
        return text.split('/').nth(4).unwrap_or("External").to_string();
    }
    if text.starts_with("/Volumes/") {
        return text.split('/').nth(2).unwrap_or("External").to_string();
    }
    if text.starts_with("/home/") {
        return "Linux".to_string();
    }
    if text.starts_with("/Users/") {
        return "Local Mac".to_string();
    }
    "Local".to_string()
}

fn git_output(path: &Path, args: &[&str]) -> Option<String> {
    let output = std::process::Command::new("git")
        .arg("-C")
        .arg(path)
        .args(args)
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let value = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if value.is_empty() {
        None
    } else {
        Some(value)
    }
}

fn current_git_branch(path: &Path) -> Option<String> {
    let branch = git_output(path, &["rev-parse", "--abbrev-ref", "HEAD"])?;
    if branch.is_empty() || branch == "HEAD" {
        None
    } else {
        Some(branch)
    }
}

fn git_repository_root(path: &Path) -> Option<PathBuf> {
    git_output(path, &["rev-parse", "--show-toplevel"]).map(PathBuf::from)
}

fn git_branches(path: &Path, current_branch: &str) -> Vec<String> {
    let mut branches = git_output(path, &["branch", "--format=%(refname:short)"])
        .map(|value| {
            value
                .lines()
                .map(str::trim)
                .filter(|line| !line.is_empty())
                .map(ToOwned::to_owned)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    if !branches.iter().any(|branch| branch == current_branch) {
        branches.push(current_branch.to_string());
    }
    branches.sort();
    branches.dedup();
    branches
}

fn git_primary_remote(path: &Path) -> Option<(String, String)> {
    let origin = git_output(path, &["config", "--get", "remote.origin.url"]);
    if let Some(url) = origin {
        return Some(("origin".to_string(), url));
    }

    let remote_name = git_output(path, &["remote"])?
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())?
        .to_string();
    let remote_url = git_output(
        path,
        &["config", "--get", &format!("remote.{remote_name}.url")],
    )?;
    Some((remote_name, remote_url))
}

fn parse_remote_identity(remote_url: &str) -> Option<(String, String, String)> {
    let mut value = remote_url.trim().trim_end_matches(".git").to_string();
    if value.is_empty() {
        return None;
    }

    if let Some(rest) = value.strip_prefix("git@") {
        if let Some((host, path)) = rest.split_once(':') {
            let parts = path
                .split('/')
                .filter(|part| !part.is_empty())
                .collect::<Vec<_>>();
            if parts.len() >= 2 {
                let owner = parts[parts.len() - 2].to_string();
                let name = parts[parts.len() - 1].to_string();
                return Some((host.to_ascii_lowercase(), owner, name));
            }
        }
    }

    if let Ok(url) = url::Url::parse(&value) {
        let host = url.host_str()?.to_ascii_lowercase();
        let parts = url
            .path_segments()?
            .filter(|part| !part.is_empty())
            .collect::<Vec<_>>();
        if parts.len() >= 2 {
            let owner = parts[parts.len() - 2].to_string();
            let name = parts[parts.len() - 1].trim_end_matches(".git").to_string();
            return Some((host, owner, name));
        }
    }

    if value.contains("://") {
        value = value.split("://").nth(1)?.to_string();
    }
    let parts = value
        .split('/')
        .filter(|part| !part.is_empty() && !part.contains('@'))
        .collect::<Vec<_>>();
    if parts.len() >= 3 {
        let host = parts[0].to_ascii_lowercase();
        let owner = parts[parts.len() - 2].to_string();
        let name = parts[parts.len() - 1].trim_end_matches(".git").to_string();
        return Some((host, owner, name));
    }

    None
}

fn repository_identity(path: &Path, root: &Path) -> Option<ChatRepositoryIdentity> {
    let (remote_name, remote_url) = git_primary_remote(path)?;
    let (host, owner, name) = parse_remote_identity(&remote_url)?;
    let canonical_key = format!("{host}/{owner}/{name}").to_ascii_lowercase();
    Some(ChatRepositoryIdentity {
        canonical_key,
        root_path: Some(root.to_string_lossy().into_owned()),
        display_name: Some(format!("{owner}/{name}")),
        name: Some(name),
        owner: Some(owner),
        remote_name: Some(remote_name),
        remote_url: Some(remote_url),
    })
}

fn chat_project_id(path: &Path) -> String {
    let mut id = String::from("local-");
    for byte in path.to_string_lossy().as_bytes() {
        use std::fmt::Write as _;
        let _ = write!(id, "{byte:02x}");
    }
    id
}

fn chat_project_script(
    id: &str,
    name: &str,
    command: &str,
    cwd: Option<&str>,
    icon: Option<&str>,
) -> ChatProjectScript {
    ChatProjectScript {
        id: id.to_string(),
        name: name.to_string(),
        command: command.to_string(),
        cwd: cwd.map(ToOwned::to_owned),
        icon: icon.map(ToOwned::to_owned),
        keybinding: None,
        run_on_worktree_create: None,
    }
}

fn push_project_script(
    scripts: &mut Vec<ChatProjectScript>,
    id: &str,
    name: &str,
    command: &str,
    cwd: Option<&str>,
    icon: Option<&str>,
) {
    if scripts.iter().any(|script| script.id == id) {
        return;
    }
    scripts.push(chat_project_script(id, name, command, cwd, icon));
}

fn package_manager_for(dir: &Path) -> &'static str {
    if dir.join("pnpm-lock.yaml").exists() {
        "pnpm"
    } else if dir.join("yarn.lock").exists() {
        "yarn"
    } else if dir.join("bun.lockb").exists() || dir.join("bun.lock").exists() {
        "bun"
    } else {
        "npm"
    }
}

fn package_script_label(cwd: Option<&str>, script: &str) -> String {
    let label = match script {
        "dev" => "dev",
        "start" => "start",
        "test" => "test",
        "build" => "build",
        "typecheck" => "typecheck",
        "lint" => "lint",
        _ => script,
    };
    let Some(cwd) = cwd else {
        return label.to_string();
    };
    let prefix = cwd
        .rsplit(['/', '\\'])
        .next()
        .filter(|part| !part.trim().is_empty())
        .unwrap_or(cwd);
    format!("{} {label}", capitalize_ascii(prefix))
}

fn capitalize_ascii(value: &str) -> String {
    let mut chars = value.chars();
    let Some(first) = chars.next() else {
        return String::new();
    };
    format!("{}{}", first.to_ascii_uppercase(), chars.as_str())
}

fn infer_package_json_scripts(scripts: &mut Vec<ChatProjectScript>, dir: &Path, cwd: Option<&str>) {
    let package_json = dir.join("package.json");
    if !package_json.exists() {
        return;
    }
    let Ok(text) = std::fs::read_to_string(package_json) else {
        return;
    };
    let Ok(value) = serde_json::from_str::<serde_json::Value>(&text) else {
        return;
    };
    let Some(script_map) = value.get("scripts").and_then(serde_json::Value::as_object) else {
        return;
    };
    let package_manager = package_manager_for(dir);
    for (script_name, icon) in [
        ("dev", "play"),
        ("start", "play"),
        ("test", "test"),
        ("build", "build"),
        ("typecheck", "test"),
        ("lint", "lint"),
    ] {
        if !script_map.contains_key(script_name) {
            continue;
        }
        let cwd_key = cwd.unwrap_or("root").replace(['/', '\\'], "-");
        let id = format!("{cwd_key}-{script_name}");
        let command = format!("{package_manager} run {script_name}");
        let name = package_script_label(cwd, script_name);
        push_project_script(scripts, &id, &name, &command, cwd, Some(icon));
    }
}

fn inferred_chat_project_scripts(path: &Path) -> Option<Vec<ChatProjectScript>> {
    let mut scripts = Vec::new();

    if path.join("src-tauri").join("Cargo.toml").exists() {
        push_project_script(
            &mut scripts,
            "tauri-dev",
            "Tauri dev",
            "cargo tauri dev",
            Some("src-tauri"),
            Some("play"),
        );
    }

    infer_package_json_scripts(&mut scripts, path, None);
    for relative in ["frontend", "web", "app", "apps/web"] {
        infer_package_json_scripts(&mut scripts, &path.join(relative), Some(relative));
    }

    if path.join("Cargo.toml").exists() {
        push_project_script(
            &mut scripts,
            "cargo-run",
            "Cargo run",
            "cargo run",
            None,
            Some("play"),
        );
        push_project_script(
            &mut scripts,
            "cargo-test",
            "Cargo test",
            "cargo test",
            None,
            Some("test"),
        );
        push_project_script(
            &mut scripts,
            "cargo-build",
            "Cargo build",
            "cargo build",
            None,
            Some("build"),
        );
    }

    if path.join("Makefile").exists() || path.join("makefile").exists() {
        push_project_script(&mut scripts, "make", "Make", "make", None, Some("build"));
    }

    if scripts.is_empty() {
        None
    } else {
        Some(scripts.into_iter().take(8).collect())
    }
}

pub fn normalize_chat_workspace_project(path: PathBuf) -> ChatWorkspaceProject {
    let path = path.canonicalize().unwrap_or(path);
    let root = git_repository_root(&path).unwrap_or_else(|| path.clone());
    let branch = current_git_branch(&path).unwrap_or_else(|| "main".to_string());
    let branches = git_branches(&path, &branch);
    let machine_label = machine_label_for_path(&path);
    ChatWorkspaceProject {
        id: Some(chat_project_id(&path)),
        environment_id: Some("local".to_string()),
        name: basename(&path),
        path: path.to_string_lossy().into_owned(),
        branches,
        current_branch: Some(branch),
        repository_identity: repository_identity(&path, &root),
        machine: Some(machine_label.clone()),
        machine_label: Some(machine_label),
        host: None,
        group: None,
        root: Some(root.to_string_lossy().into_owned()),
        scripts: inferred_chat_project_scripts(&path),
        grouping_override: None,
    }
}

fn workspace_store_path() -> PathBuf {
    crate::app_paths::resolve_app_data_dir().join("chat-workspace-projects.json")
}

fn read_workspace_store() -> Result<Vec<ChatWorkspaceProject>, String> {
    let path = workspace_store_path();
    if !path.exists() {
        return Ok(Vec::new());
    }
    let text = std::fs::read_to_string(&path).map_err(|err| err.to_string())?;
    serde_json::from_str(&text).map_err(|err| err.to_string())
}

fn write_workspace_store(projects: &[ChatWorkspaceProject]) -> Result<(), String> {
    let path = workspace_store_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }
    let text = serde_json::to_string_pretty(projects).map_err(|err| err.to_string())?;
    std::fs::write(path, text).map_err(|err| err.to_string())
}

fn expand_chat_filesystem_path(
    path: &str,
    home: Option<&Path>,
    required_label: &str,
) -> Result<PathBuf, String> {
    let mut trimmed = path.trim();
    if trimmed.len() >= 2 {
        let first = trimmed.as_bytes()[0] as char;
        let last = trimmed.as_bytes()[trimmed.len() - 1] as char;
        if matches!(first, '"' | '\'' | '`') && first == last {
            trimmed = trimmed[1..trimmed.len() - 1].trim();
        }
    }
    if trimmed.is_empty() {
        return Err(format!("{required_label} is required"));
    }
    if trimmed.to_ascii_lowercase().starts_with("file://") {
        if let Ok(url) = url::Url::parse(trimmed) {
            if let Ok(path) = url.to_file_path() {
                return Ok(path);
            }
        }
        let file_path = &trimmed["file://".len()..];
        let decoded = urlencoding::decode(file_path)
            .map(|value| value.into_owned())
            .unwrap_or_else(|_| file_path.to_string());
        return Ok(PathBuf::from(decoded));
    }
    if trimmed == "~" {
        return home
            .map(Path::to_path_buf)
            .ok_or_else(|| "home directory could not be resolved".to_string());
    }
    if let Some(rest) = trimmed.strip_prefix("~/") {
        return home
            .map(|home| home.join(rest))
            .ok_or_else(|| "home directory could not be resolved".to_string());
    }
    let unescaped = trimmed.replace("\\ ", " ");
    Ok(PathBuf::from(unescaped))
}

fn expand_chat_workspace_project_path(path: &str, home: Option<&Path>) -> Result<PathBuf, String> {
    expand_chat_filesystem_path(path, home, "project path")
}

fn expand_chat_attachment_path(path: &str) -> Result<PathBuf, String> {
    let home = dirs::home_dir();
    expand_chat_filesystem_path(path, home.as_deref(), "attachment path")
}

fn chat_filesystem_path_key(path: &Path) -> String {
    let normalized = path
        .canonicalize()
        .unwrap_or_else(|_| path.to_path_buf())
        .to_string_lossy()
        .replace('\\', "/");
    if cfg!(windows) {
        normalized.to_ascii_lowercase()
    } else {
        normalized
    }
}

fn validate_chat_workspace_project_path(path: &str) -> Result<PathBuf, String> {
    let home = dirs::home_dir();
    let path = expand_chat_workspace_project_path(path, home.as_deref())?;
    let metadata = std::fs::metadata(&path)
        .map_err(|err| format!("project folder does not exist or cannot be read: {err}"))?;
    if !metadata.is_dir() {
        return Err("project path must be a folder".to_string());
    }
    path.canonicalize()
        .map_err(|err| format!("project folder cannot be resolved: {err}"))
}

fn canonical_chat_workspace_project_lookup(id_or_path: &str) -> Option<String> {
    validate_chat_workspace_project_path(id_or_path)
        .ok()
        .map(|path| path.to_string_lossy().into_owned())
}

fn chat_workspace_path_lookup_key(value: &str) -> String {
    let mut normalized = value.trim().replace('\\', "/");
    while normalized.len() > 1 && normalized.ends_with('/') {
        if normalized.len() == 3 && normalized.as_bytes().get(1) == Some(&b':') {
            break;
        }
        normalized.pop();
    }
    if cfg!(windows) {
        normalized.to_ascii_lowercase()
    } else {
        normalized
    }
}

fn chat_workspace_project_environment_key(project: &ChatWorkspaceProject) -> &str {
    project.environment_id.as_deref().unwrap_or("").trim()
}

fn chat_workspace_project_location_environment_key(project: &ChatWorkspaceProject) -> String {
    let key = chat_workspace_project_environment_key(project);
    if key.is_empty() {
        "local".to_string()
    } else {
        key.to_ascii_lowercase()
    }
}

fn chat_workspace_projects_share_identity(
    left: &ChatWorkspaceProject,
    right: &ChatWorkspaceProject,
) -> bool {
    let same_environment = chat_workspace_project_location_environment_key(left)
        == chat_workspace_project_location_environment_key(right);
    left.id.is_some() && left.id == right.id && same_environment
        || (left.path == right.path && same_environment)
}

fn chat_workspace_project_matches_lookup(
    project: &ChatWorkspaceProject,
    id_or_path: &str,
    canonical_path: Option<&str>,
    environment_id: Option<&str>,
) -> bool {
    if let Some(environment_id) = environment_id {
        let environment_key = environment_id.trim();
        let project_environment_key = chat_workspace_project_location_environment_key(project);
        let lookup_environment_key = if environment_key.is_empty() {
            "local".to_string()
        } else {
            environment_key.to_ascii_lowercase()
        };
        if project_environment_key != lookup_environment_key {
            return false;
        }
    }
    if project.id.as_deref() == Some(id_or_path) {
        return true;
    }
    if project.path == id_or_path {
        return true;
    }
    let project_path_key = chat_workspace_path_lookup_key(&project.path);
    let lookup_path_key = chat_workspace_path_lookup_key(id_or_path);
    if !project_path_key.is_empty() && project_path_key == lookup_path_key {
        return true;
    }
    let Some(canonical_path) = canonical_path else {
        return false;
    };
    validate_chat_workspace_project_path(&project.path)
        .ok()
        .map(|path| path.to_string_lossy() == canonical_path)
        .unwrap_or(false)
}

struct ChatWorkspaceProjectLookup {
    value: String,
    canonical_path: Option<String>,
    environment_id: Option<String>,
}

fn workspace_project_lookup_candidates(
    id: Option<String>,
    path: Option<String>,
    environment_id: Option<String>,
) -> Result<Vec<ChatWorkspaceProjectLookup>, String> {
    let mut lookups = Vec::new();
    let environment_id = environment_id
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    for value in [path, id].into_iter().flatten() {
        let value = value.trim().to_string();
        if value.is_empty()
            || lookups
                .iter()
                .any(|lookup: &ChatWorkspaceProjectLookup| lookup.value == value)
        {
            continue;
        }
        let canonical_path = canonical_chat_workspace_project_lookup(&value);
        lookups.push(ChatWorkspaceProjectLookup {
            value,
            canonical_path,
            environment_id: environment_id.clone(),
        });
    }
    if lookups.is_empty() {
        return Err("project id or path is required".to_string());
    }
    Ok(lookups)
}

fn chat_workspace_project_matches_any_lookup(
    project: &ChatWorkspaceProject,
    lookups: &[ChatWorkspaceProjectLookup],
) -> bool {
    lookups.iter().any(|lookup| {
        chat_workspace_project_matches_lookup(
            project,
            &lookup.value,
            lookup.canonical_path.as_deref(),
            lookup.environment_id.as_deref(),
        )
    })
}

fn local_chat_sessions_path() -> PathBuf {
    crate::app_paths::resolve_app_data_dir().join("chat-local-sessions.json")
}

fn read_local_chat_sessions_store() -> Result<Vec<LocalChatSession>, String> {
    let path = local_chat_sessions_path();
    if !path.exists() {
        return Ok(Vec::new());
    }
    let text = std::fs::read_to_string(&path).map_err(|err| err.to_string())?;
    serde_json::from_str(&text).map_err(|err| err.to_string())
}

fn write_local_chat_sessions_store(sessions: &[LocalChatSession]) -> Result<(), String> {
    let path = local_chat_sessions_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }
    let text = serde_json::to_string_pretty(sessions).map_err(|err| err.to_string())?;
    std::fs::write(path, text).map_err(|err| err.to_string())
}

fn trim_optional(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn local_chat_context_file_label(files: Option<&[serde_json::Value]>) -> Option<String> {
    let files = files?;
    if files.is_empty() {
        return None;
    }
    let first = files.first()?;
    let path = first
        .get("path")
        .or_else(|| first.get("name"))
        .and_then(serde_json::Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())?;
    let clean_path = path.replace('\\', "/");
    let label = if clean_path.chars().count() > 48 {
        let tail: String = clean_path
            .chars()
            .rev()
            .take(45)
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .collect();
        format!("...{tail}")
    } else {
        clean_path
    };
    if files.len() == 1 {
        Some(format!("Context: {label}"))
    } else {
        let extra = files.len() - 1;
        Some(format!(
            "Context: {label} + {extra} file{}",
            if extra == 1 { "" } else { "s" }
        ))
    }
}

fn local_chat_label(
    text: &str,
    context_files: Option<&[serde_json::Value]>,
    provider_id: &str,
) -> String {
    let first_line = text
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .unwrap_or("");
    let raw = if !first_line.is_empty() {
        first_line.to_string()
    } else if let Some(label) = local_chat_context_file_label(context_files) {
        label
    } else {
        provider_id.to_string()
    };
    raw.chars().take(80).collect()
}

pub fn is_local_chat_session_key(key: &str) -> bool {
    key.trim().starts_with("local-chat-")
}

const LOCAL_CHAT_COMPACT_KEEP_MESSAGES: usize = 8;
const LOCAL_CHAT_COMPACT_SUMMARY_MAX_CHARS: usize = 6_000;

pub struct AppendLocalChatTurn<'a> {
    pub session_key: Option<&'a str>,
    pub provider_id: &'a str,
    pub user_text: &'a str,
    pub assistant_text: &'a str,
    pub images: Option<Vec<String>>,
    pub context_files: Option<Vec<serde_json::Value>>,
    pub project_id: Option<&'a str>,
    pub project: Option<&'a str>,
    pub project_root: Option<&'a str>,
    pub working_dir: Option<&'a str>,
    pub environment_id: Option<&'a str>,
    pub branch: Option<&'a str>,
    pub runtime: Option<&'a str>,
}

pub fn append_local_chat_turn(input: AppendLocalChatTurn<'_>) -> Result<LocalChatSession, String> {
    let mut sessions = read_local_chat_sessions_store()?;
    let requested_key = input
        .session_key
        .map(str::trim)
        .filter(|key| is_local_chat_session_key(key));
    let index =
        requested_key.and_then(|key| sessions.iter().position(|session| session.key == key));
    let now = chrono::Utc::now().to_rfc3339();
    let context_files_len = input.context_files.as_ref().map(Vec::len).unwrap_or(0);

    let session_index = if let Some(index) = index {
        index
    } else {
        let key = requested_key
            .map(str::to_string)
            .unwrap_or_else(|| format!("local-chat-{}", crate::routes::util::random_uuid()));
        sessions.push(LocalChatSession {
            key,
            label: local_chat_label(
                input.user_text,
                input.context_files.as_deref(),
                input.provider_id,
            ),
            agent_key: input.provider_id.to_string(),
            message_count: 0,
            last_activity: now.clone(),
            provider: input.provider_id.to_string(),
            project_id: trim_optional(input.project_id),
            project: trim_optional(input.project),
            project_root: trim_optional(input.project_root),
            working_dir: trim_optional(input.working_dir),
            environment_id: trim_optional(input.environment_id),
            branch: trim_optional(input.branch),
            runtime: trim_optional(input.runtime),
            local: true,
            pinned: None,
            favorite: None,
            messages: Vec::new(),
        });
        sessions.len() - 1
    };

    let session = &mut sessions[session_index];
    let next_turn = session.messages.len() + 1;
    let user_text = if input.user_text.trim().is_empty() && context_files_len > 0 {
        "Attached context files".to_string()
    } else {
        input.user_text.trim().to_string()
    };

    session.messages.push(LocalChatSessionMessage {
        id: format!("{}-user-{next_turn}", session.key),
        role: "user".to_string(),
        text: user_text,
        timestamp: now.clone(),
        images: input.images.filter(|images| !images.is_empty()),
        context_files: input.context_files.filter(|files| !files.is_empty()),
    });
    session.messages.push(LocalChatSessionMessage {
        id: format!("{}-assistant-{next_turn}", session.key),
        role: "assistant".to_string(),
        text: input.assistant_text.trim().to_string(),
        timestamp: now.clone(),
        images: None,
        context_files: None,
    });
    session.message_count = session.messages.len();
    session.last_activity = now;
    let project_id = trim_optional(input.project_id).or_else(|| session.project_id.clone());
    let project = trim_optional(input.project).or_else(|| session.project.clone());
    let project_root = trim_optional(input.project_root).or_else(|| session.project_root.clone());
    let working_dir = trim_optional(input.working_dir).or_else(|| session.working_dir.clone());
    let environment_id =
        trim_optional(input.environment_id).or_else(|| session.environment_id.clone());
    let branch = trim_optional(input.branch).or_else(|| session.branch.clone());
    let runtime = trim_optional(input.runtime).or_else(|| session.runtime.clone());
    session.project_id = project_id;
    session.project = project;
    session.project_root = project_root;
    session.working_dir = working_dir;
    session.environment_id = environment_id;
    session.branch = branch;
    session.runtime = runtime;

    let saved_session = session.clone();
    sessions.sort_by(|left, right| right.last_activity.cmp(&left.last_activity));
    write_local_chat_sessions_store(&sessions)?;
    Ok(saved_session)
}

pub fn load_local_chat_sessions() -> Result<Vec<LocalChatSession>, String> {
    read_local_chat_sessions_store()
}

pub fn load_local_chat_session_summaries() -> Result<Vec<LocalChatSessionSummary>, String> {
    Ok(read_local_chat_sessions_store()?
        .iter()
        .map(LocalChatSessionSummary::from)
        .collect())
}

pub fn local_chat_session_history(
    key: &str,
) -> Result<Option<Vec<LocalChatSessionMessage>>, String> {
    local_chat_session_history_with_limit(key, None)
}

pub fn local_chat_session_history_with_limit(
    key: &str,
    limit: Option<usize>,
) -> Result<Option<Vec<LocalChatSessionMessage>>, String> {
    Ok(read_local_chat_sessions_store()?
        .into_iter()
        .find(|session| session.key == key)
        .map(|session| {
            let mut messages = session.messages;
            if let Some(limit) = limit.filter(|limit| *limit > 0) {
                if messages.len() > limit {
                    messages = messages.split_off(messages.len() - limit);
                }
            }
            messages
        }))
}

fn compact_local_chat_message_line(message: &LocalChatSessionMessage) -> Option<String> {
    let role = match message.role.as_str() {
        "assistant" => "Assistant",
        "user" => "User",
        "tool" => "Tool",
        _ => return None,
    };
    let mut text = message
        .text
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    if text.chars().count() > 360 {
        text = text.chars().take(357).collect::<String>();
        text.push_str("...");
    }
    let file_note = local_chat_context_file_label(message.context_files.as_deref())
        .map(|label| format!(" [{label}]"))
        .unwrap_or_default();
    if text.trim().is_empty() && file_note.is_empty() {
        return None;
    }
    Some(format!("- {role}{file_note}: {text}"))
}

pub fn compact_local_chat_session(key: &str) -> Result<Option<LocalChatCompactResult>, String> {
    let mut sessions = read_local_chat_sessions_store()?;
    let Some(index) = sessions.iter().position(|session| session.key == key) else {
        return Ok(None);
    };
    let session = &mut sessions[index];
    if session.messages.len() <= LOCAL_CHAT_COMPACT_KEEP_MESSAGES + 1 {
        return Ok(Some(LocalChatCompactResult {
            key: session.key.clone(),
            messages_removed: 0,
            message_count: session.message_count,
            tokens_saved: 0,
        }));
    }

    let compacted_count = session.messages.len() - LOCAL_CHAT_COMPACT_KEEP_MESSAGES;
    let compacted_messages = session.messages[..compacted_count].to_vec();
    let recent_messages = session.messages[compacted_count..].to_vec();
    let original_chars = compacted_messages
        .iter()
        .map(|message| message.text.chars().count())
        .sum::<usize>();
    let mut summary = compacted_messages
        .iter()
        .filter_map(compact_local_chat_message_line)
        .collect::<Vec<_>>()
        .join("\n");
    if summary.chars().count() > LOCAL_CHAT_COMPACT_SUMMARY_MAX_CHARS {
        summary = summary
            .chars()
            .take(LOCAL_CHAT_COMPACT_SUMMARY_MAX_CHARS)
            .collect::<String>();
        summary.push_str("\n- ...");
    }
    if summary.trim().is_empty() {
        summary = "Earlier local chat messages were compacted.".to_string();
    }

    let now = chrono::Utc::now().to_rfc3339();
    let summary_text = format!(
        "Compacted previous local chat context ({} messages):\n{}",
        compacted_messages.len(),
        summary
    );
    let summary_chars = summary_text.chars().count();
    let tokens_saved = original_chars.saturating_sub(summary_chars) / 4;
    let summary_message = LocalChatSessionMessage {
        id: format!(
            "{}-compact-{}",
            session.key,
            now.replace(':', "-").replace('.', "-").replace('+', "-")
        ),
        role: "assistant".to_string(),
        text: summary_text,
        timestamp: now.clone(),
        images: None,
        context_files: None,
    };

    session.messages = std::iter::once(summary_message)
        .chain(recent_messages)
        .collect();
    session.message_count = session.messages.len();
    session.last_activity = now;
    let result = LocalChatCompactResult {
        key: session.key.clone(),
        messages_removed: compacted_messages.len().saturating_sub(1),
        message_count: session.message_count,
        tokens_saved,
    };
    sessions.sort_by(|left, right| right.last_activity.cmp(&left.last_activity));
    write_local_chat_sessions_store(&sessions)?;
    Ok(Some(result))
}

pub fn rename_local_chat_session(key: &str, label: &str) -> Result<bool, String> {
    patch_local_chat_session(key, Some(label), None, None)
}

pub fn patch_local_chat_session(
    key: &str,
    label: Option<&str>,
    pinned: Option<bool>,
    favorite: Option<bool>,
) -> Result<bool, String> {
    let mut sessions = read_local_chat_sessions_store()?;
    let Some(session) = sessions.iter_mut().find(|session| session.key == key) else {
        return Ok(false);
    };
    if let Some(label) = label {
        let label = label.trim();
        if !label.is_empty() {
            session.label = label.chars().take(120).collect();
        }
    }
    if let Some(pinned) = pinned {
        session.pinned = Some(pinned);
        session.favorite = Some(pinned);
    }
    if let Some(favorite) = favorite {
        session.favorite = Some(favorite);
        session.pinned = Some(favorite);
    }
    write_local_chat_sessions_store(&sessions)?;
    Ok(true)
}

pub fn delete_local_chat_session(key: &str) -> Result<bool, String> {
    let mut sessions = read_local_chat_sessions_store()?;
    let before = sessions.len();
    sessions.retain(|session| session.key != key);
    let removed = sessions.len() != before;
    if removed {
        write_local_chat_sessions_store(&sessions)?;
    }
    Ok(removed)
}

fn refresh_chat_workspace_project(project: ChatWorkspaceProject) -> Option<ChatWorkspaceProject> {
    let path = validate_chat_workspace_project_path(&project.path).ok()?;
    let mut refreshed = normalize_chat_workspace_project(path);
    if project.environment_id.as_deref() != Some("local") {
        if project.id.is_some() {
            refreshed.id = project.id.clone();
        }
        refreshed.environment_id = project.environment_id.clone();
    }
    if !project.name.trim().is_empty() && project.name != basename(Path::new(&project.path)) {
        refreshed.name = project.name;
    }
    if project.machine_label.is_some() {
        refreshed.machine_label = project.machine_label;
    }
    if project.machine.is_some() {
        refreshed.machine = project.machine;
    }
    if project.host.is_some() {
        refreshed.host = project.host;
    }
    if project.group.is_some() {
        refreshed.group = project.group;
    }
    if project.scripts.is_some() {
        refreshed.scripts = project.scripts;
    }
    if project.grouping_override.is_some() {
        refreshed.grouping_override = project.grouping_override;
    }
    Some(refreshed)
}

fn chat_workspace_context_from_projects(
    projects: Vec<ChatWorkspaceProject>,
) -> ChatWorkspaceContext {
    let mut refreshed_projects: Vec<ChatWorkspaceProject> = Vec::new();
    for project in projects
        .into_iter()
        .filter_map(refresh_chat_workspace_project)
    {
        if refreshed_projects
            .iter()
            .any(|candidate| chat_workspace_projects_share_identity(candidate, &project))
        {
            continue;
        }
        refreshed_projects.push(project);
    }
    ChatWorkspaceContext {
        projects: refreshed_projects,
        runtime_modes: vec!["Work locally".to_string()],
    }
}

fn refreshed_chat_workspace_projects(
    projects: Vec<ChatWorkspaceProject>,
) -> Vec<ChatWorkspaceProject> {
    chat_workspace_context_from_projects(projects).projects
}

fn read_image_data_url_from_path(path: &Path) -> Result<String, String> {
    let ext = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let mime = match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        _ => return Err("unsupported image type".to_string()),
    };
    let bytes = std::fs::read(path).map_err(|err| err.to_string())?;
    let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
    Ok(format!("data:{mime};base64,{encoded}"))
}

pub fn read_dropped_image_data_url(path: impl AsRef<str>) -> Result<String, String> {
    let path = expand_chat_attachment_path(path.as_ref())?;
    read_image_data_url_from_path(&path)
}

#[tauri::command]
pub fn read_chat_image_data_urls(paths: Vec<String>) -> Result<Vec<String>, String> {
    let mut images = Vec::new();
    let mut seen_paths = HashSet::new();
    for raw_path in paths {
        if images.len() >= 10 {
            break;
        }
        let Ok(path) = expand_chat_attachment_path(&raw_path) else {
            continue;
        };
        if !seen_paths.insert(chat_filesystem_path_key(&path)) {
            continue;
        }
        if let Ok(data_url) = read_image_data_url_from_path(&path) {
            images.push(data_url);
        }
    }
    Ok(images)
}

const CHAT_CONTEXT_FILE_LIMIT: usize = 8;
const CHAT_CONTEXT_FILE_MAX_CHARS: usize = 20_000;
const CHAT_CONTEXT_FILE_SCAN_LIMIT: usize = 256;

fn chat_context_file_extension(path: &Path) -> String {
    path.extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .trim()
        .to_ascii_lowercase()
}

fn is_chat_context_text_file(path: &Path) -> bool {
    let extension = chat_context_file_extension(path);
    if matches!(
        extension.as_str(),
        "c" | "cpp"
            | "cs"
            | "css"
            | "csv"
            | "go"
            | "h"
            | "html"
            | "java"
            | "js"
            | "json"
            | "jsx"
            | "kt"
            | "lock"
            | "log"
            | "md"
            | "mdx"
            | "php"
            | "py"
            | "rb"
            | "rs"
            | "scss"
            | "sh"
            | "sql"
            | "svelte"
            | "toml"
            | "ts"
            | "tsx"
            | "txt"
            | "vue"
            | "xml"
            | "yaml"
            | "yml"
    ) {
        return true;
    }
    path.file_name()
        .and_then(|value| value.to_str())
        .map(|name| {
            matches!(
                name.to_ascii_lowercase().as_str(),
                "dockerfile" | "makefile" | "package-lock" | "cargo.lock"
            )
        })
        .unwrap_or(false)
}

fn is_generated_chat_context_segment(segment: &str) -> bool {
    matches!(
        segment,
        ".cache"
            | ".git"
            | ".next"
            | ".output"
            | ".turbo"
            | ".vite"
            | "build"
            | "coverage"
            | "dist"
            | "node_modules"
            | "target"
    )
}

fn path_has_generated_context_segment(path: &Path) -> bool {
    path.components().any(|component| {
        component
            .as_os_str()
            .to_str()
            .map(|segment| is_generated_chat_context_segment(&segment.to_ascii_lowercase()))
            .unwrap_or(false)
    })
}

fn chat_context_file_rank(path: &Path) -> i32 {
    let normalized = path
        .to_string_lossy()
        .replace('\\', "/")
        .to_ascii_lowercase();
    let segments: Vec<&str> = normalized
        .split('/')
        .filter(|segment| !segment.is_empty())
        .collect();
    let extension = chat_context_file_extension(path);
    let mut rank = 20;

    if segments
        .iter()
        .any(|segment| matches!(*segment, "src" | "app" | "components"))
    {
        rank -= 8;
    }
    if path
        .file_name()
        .and_then(|value| value.to_str())
        .map(|name| {
            let name = name.to_ascii_lowercase();
            name.starts_with("readme")
                || name.starts_with("package")
                || name.starts_with("tsconfig")
                || name.starts_with("vite.config")
                || name.starts_with("tauri.conf")
                || name.starts_with("cargo")
                || name == "dockerfile"
                || name == "compose.yaml"
                || name == "docker-compose.yml"
        })
        .unwrap_or(false)
    {
        rank -= 5;
    }
    if matches!(
        extension.as_str(),
        "css"
            | "go"
            | "html"
            | "js"
            | "json"
            | "jsx"
            | "md"
            | "mdx"
            | "py"
            | "rs"
            | "scss"
            | "svelte"
            | "toml"
            | "ts"
            | "tsx"
            | "vue"
            | "yaml"
            | "yml"
    ) {
        rank -= 3;
    }
    if matches!(extension.as_str(), "csv" | "lock" | "log" | "txt") {
        rank += 8;
    }
    if segments.iter().any(|segment| *segment == "vendor") {
        rank += 10;
    }
    rank
}

fn collect_chat_context_file_candidates(path: &Path, candidates: &mut Vec<PathBuf>) {
    if candidates.len() >= CHAT_CONTEXT_FILE_SCAN_LIMIT {
        return;
    }
    let Ok(metadata) = std::fs::metadata(path) else {
        return;
    };
    if metadata.is_file() {
        if is_chat_context_text_file(path) && !path_has_generated_context_segment(path) {
            candidates.push(path.to_path_buf());
        }
        return;
    }
    if !metadata.is_dir() || path_has_generated_context_segment(path) {
        return;
    }
    let Ok(entries) = std::fs::read_dir(path) else {
        return;
    };
    let mut entries: Vec<PathBuf> = entries
        .filter_map(|entry| entry.ok().map(|entry| entry.path()))
        .collect();
    entries.sort();
    for entry in entries {
        collect_chat_context_file_candidates(&entry, candidates);
        if candidates.len() >= CHAT_CONTEXT_FILE_SCAN_LIMIT {
            break;
        }
    }
}

fn display_path_for_chat_context_file(root: &Path, file_path: &Path) -> String {
    let root_label = root
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .trim();
    let relative = file_path.strip_prefix(root).ok().and_then(|path| {
        let value = path.to_string_lossy().replace('\\', "/");
        if value.trim().is_empty() {
            None
        } else {
            Some(value)
        }
    });
    match (root_label.is_empty(), relative) {
        (false, Some(relative)) => format!("{root_label}/{relative}"),
        (_, Some(relative)) => relative,
        _ => file_path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("file")
            .to_string(),
    }
}

fn read_chat_context_file_attachment(
    root: &Path,
    file_path: &Path,
    index: usize,
) -> Option<ChatContextFileAttachment> {
    let metadata = std::fs::metadata(file_path).ok()?;
    if !metadata.is_file() {
        return None;
    }
    let raw = std::fs::read_to_string(file_path).ok()?;
    let content: String = raw.chars().take(CHAT_CONTEXT_FILE_MAX_CHARS).collect();
    let truncated = raw.chars().count() > content.chars().count();
    let path = display_path_for_chat_context_file(root, file_path);
    let name = file_path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("file")
        .to_string();

    Some(ChatContextFileAttachment {
        id: format!("native-file-{index}"),
        name,
        path,
        mime_type: None,
        size: Some(metadata.len()),
        content,
        truncated,
    })
}

#[tauri::command]
pub fn read_chat_context_files(
    paths: Vec<String>,
) -> Result<Vec<ChatContextFileAttachment>, String> {
    let mut candidates = Vec::new();
    let mut roots = Vec::new();
    let mut seen_roots = HashSet::new();
    for raw_path in paths {
        let Ok(path) = expand_chat_attachment_path(&raw_path) else {
            continue;
        };
        let root = path.canonicalize().unwrap_or(path.clone());
        if !seen_roots.insert(chat_filesystem_path_key(&root)) {
            continue;
        }
        collect_chat_context_file_candidates(&root, &mut candidates);
        roots.push(root);
        if candidates.len() >= CHAT_CONTEXT_FILE_SCAN_LIMIT {
            break;
        }
    }

    candidates.sort_by(|left, right| {
        chat_context_file_rank(left)
            .cmp(&chat_context_file_rank(right))
            .then_with(|| left.to_string_lossy().cmp(&right.to_string_lossy()))
    });
    candidates.dedup();

    let mut attachments = Vec::new();
    for candidate in candidates {
        if attachments.len() >= CHAT_CONTEXT_FILE_LIMIT {
            break;
        }
        let root = roots
            .iter()
            .filter(|root| candidate.starts_with(root))
            .max_by_key(|root| root.components().count())
            .unwrap_or(&candidate);
        if let Some(attachment) =
            read_chat_context_file_attachment(root, &candidate, attachments.len())
        {
            attachments.push(attachment);
        }
    }
    Ok(attachments)
}

#[tauri::command]
pub fn get_chat_workspace_context() -> ChatWorkspaceContext {
    chat_workspace_context_from_projects(read_workspace_store().unwrap_or_default())
}

#[tauri::command]
pub fn get_chat_project_for_path(path: String) -> Result<ChatWorkspaceProject, String> {
    let path = validate_chat_workspace_project_path(&path)?;
    Ok(normalize_chat_workspace_project(path))
}

#[tauri::command]
pub fn add_chat_workspace_project(
    path: String,
) -> Result<ChatWorkspaceProjectMutationResponse, String> {
    let project = add_stored_chat_workspace_project(path)?;
    let projects = load_stored_chat_workspace_projects()?;
    Ok(ChatWorkspaceProjectMutationResponse { project, projects })
}

#[tauri::command]
pub fn update_chat_workspace_project(
    id: Option<String>,
    path: Option<String>,
    environment_id: Option<String>,
    patch: ChatWorkspaceProjectPatch,
) -> Result<ChatWorkspaceProjectMutationResponse, String> {
    let (project, projects) =
        update_stored_chat_workspace_project_by_lookup(id, path, environment_id, patch)?;
    Ok(ChatWorkspaceProjectMutationResponse { project, projects })
}

#[tauri::command]
pub fn remove_chat_workspace_project(
    id: Option<String>,
    path: Option<String>,
    environment_id: Option<String>,
) -> Result<Vec<ChatWorkspaceProject>, String> {
    remove_stored_chat_workspace_project_by_lookup(id, path, environment_id)
}

pub fn load_stored_chat_workspace_projects() -> Result<Vec<ChatWorkspaceProject>, String> {
    read_workspace_store().map(refreshed_chat_workspace_projects)
}

pub fn add_stored_chat_workspace_project(path: String) -> Result<ChatWorkspaceProject, String> {
    let path = validate_chat_workspace_project_path(&path)?;
    let project = normalize_chat_workspace_project(path);
    let mut projects = read_workspace_store()?;
    let canonical_path = Some(project.path.as_str());
    projects.retain(|candidate| {
        candidate.id != project.id
            && !chat_workspace_project_matches_lookup(
                candidate,
                &project.path,
                canonical_path,
                project.environment_id.as_deref(),
            )
    });
    projects.push(project.clone());
    write_workspace_store(&projects)?;
    Ok(project)
}

pub fn update_stored_chat_workspace_project(
    id_or_path: String,
    patch: ChatWorkspaceProjectPatch,
) -> Result<(ChatWorkspaceProject, Vec<ChatWorkspaceProject>), String> {
    update_stored_chat_workspace_project_by_lookup(None, Some(id_or_path), None, patch)
}

pub fn update_stored_chat_workspace_project_by_lookup(
    id: Option<String>,
    path: Option<String>,
    environment_id: Option<String>,
    patch: ChatWorkspaceProjectPatch,
) -> Result<(ChatWorkspaceProject, Vec<ChatWorkspaceProject>), String> {
    let mut projects = read_workspace_store()?;
    let lookups = workspace_project_lookup_candidates(id, path, environment_id)?;
    let index = projects
        .iter()
        .position(|project| chat_workspace_project_matches_any_lookup(project, &lookups))
        .ok_or_else(|| "workspace project not found".to_string())?;

    if let Some(name) = patch.name {
        let name = name.trim().to_string();
        if name.is_empty() {
            return Err("project name is required".to_string());
        }
        projects[index].name = name;
    }
    if let Some(machine_label) = patch.machine_label {
        projects[index].machine_label = Some(machine_label);
    }
    if let Some(scripts) = patch.scripts {
        projects[index].scripts = Some(scripts);
    }
    if let Some(grouping_override) = patch.grouping_override {
        projects[index].grouping_override = grouping_override.filter(|value| {
            matches!(
                value.as_str(),
                "repository" | "repository-path" | "separate"
            )
        });
    }

    if let Some(refreshed) = refresh_chat_workspace_project(projects[index].clone()) {
        projects[index] = refreshed;
    }
    let project = projects[index].clone();
    write_workspace_store(&projects)?;
    Ok((project, refreshed_chat_workspace_projects(projects)))
}

pub fn remove_stored_chat_workspace_project(
    id_or_path: String,
) -> Result<Vec<ChatWorkspaceProject>, String> {
    remove_stored_chat_workspace_project_by_lookup(None, Some(id_or_path), None)
}

pub fn remove_stored_chat_workspace_project_by_lookup(
    id: Option<String>,
    path: Option<String>,
    environment_id: Option<String>,
) -> Result<Vec<ChatWorkspaceProject>, String> {
    let mut projects = read_workspace_store()?;
    let lookups = workspace_project_lookup_candidates(id, path, environment_id)?;
    let original_len = projects.len();
    projects.retain(|project| !chat_workspace_project_matches_any_lookup(project, &lookups));
    if projects.len() == original_len {
        return Err("workspace project not found".to_string());
    }
    write_workspace_store(&projects)?;
    Ok(refreshed_chat_workspace_projects(projects))
}

/// Return the configured harness data directory.
#[tauri::command]
pub fn get_harness_dir() -> String {
    crate::harness_paths::generic_base_dir_from_env()
        .to_string_lossy()
        .into_owned()
}

/// Compatibility alias for older frontend builds.
#[tauri::command]
pub fn get_openclaw_dir() -> String {
    get_harness_dir()
}

/// Returns the absolute path to the log directory.
#[tauri::command]
pub fn get_log_dir() -> String {
    crate::logging::log_dir().to_string_lossy().into_owned()
}

#[tauri::command]
pub fn toggle_main_window_maximized(app: AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())?;

    let maximized = window.is_maximized().map_err(|e| e.to_string())?;
    if maximized {
        window.unmaximize().map_err(|e| e.to_string())
    } else {
        window.maximize().map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn toggle_main_window_fullscreen(app: AppHandle) -> Result<bool, String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())?;

    let fullscreen = window.is_fullscreen().map_err(|e| e.to_string())?;
    let next = !fullscreen;
    window.set_fullscreen(next).map_err(|e| e.to_string())?;
    Ok(next)
}

#[tauri::command]
pub fn quit_app(app: AppHandle) {
    app.exit(0);
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
                if value_raw.len() == 6 && value_raw.chars().all(|c| c.is_ascii_hexdigit()) {
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
    //
    // Uses recv_timeout-based coalescing debounce: events within 200ms of each
    // other are coalesced, and the emit fires 200ms after the LAST event in a burst.
    // This replaces the old sleep(150ms) + drain approach which could drop events.
    tokio::task::spawn_blocking(move || {
        let _watcher = watcher; // keep alive

        let debounce = std::time::Duration::from_millis(200);
        let mut pending = false;

        loop {
            let timeout = if pending {
                debounce
            } else {
                std::time::Duration::from_secs(86400)
            };
            match rx.recv_timeout(timeout) {
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
                    if dominated {
                        pending = true;
                    }
                }
                Ok(Err(e)) => {
                    tracing::warn!("File watcher error: {}", e);
                }
                Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
                    if pending {
                        pending = false;
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
                }
                Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
                    tracing::info!("Wallbash watcher channel closed, stopping");
                    break;
                }
            }
        }
    });
}

/// Spawn `gsettings monitor` to detect color-scheme changes instantly (Linux only).
///
/// Emits `gsettings-color-scheme-changed` with "prefer-dark" or "prefer-light" payload.
/// This replaces the frontend's polling approach with event-driven detection.
pub async fn start_color_scheme_monitor(handle: tauri::AppHandle) {
    #[cfg(not(target_os = "linux"))]
    {
        let _ = handle;
        return;
    }

    #[cfg(target_os = "linux")]
    {
        use tauri::Emitter;

        // Verify gsettings is available
        if std::process::Command::new("gsettings")
            .arg("--version")
            .output()
            .is_err()
        {
            tracing::info!("gsettings not available, skipping color-scheme monitor");
            return;
        }

        tokio::task::spawn_blocking(move || {
            use std::io::BufRead;

            let mut restart_delay = std::time::Duration::from_secs(1);
            let max_delay = std::time::Duration::from_secs(60);

            loop {
                let started_at = std::time::Instant::now();

                let child = std::process::Command::new("gsettings")
                    .args(["monitor", "org.gnome.desktop.interface", "color-scheme"])
                    .stdout(std::process::Stdio::piped())
                    .stderr(std::process::Stdio::null())
                    .spawn();

                let mut child = match child {
                    Ok(c) => c,
                    Err(e) => {
                        tracing::warn!("Failed to spawn gsettings monitor: {}", e);
                        tracing::warn!("gsettings monitor restart in {:?}", restart_delay);
                        std::thread::sleep(restart_delay);
                        restart_delay = std::cmp::min(restart_delay * 2, max_delay);
                        continue;
                    }
                };

                tracing::info!("gsettings color-scheme monitor started");

                let stdout = match child.stdout.take() {
                    Some(s) => s,
                    None => {
                        let _ = child.wait();
                        tracing::warn!(
                            "gsettings monitor had no stdout, restarting in {:?}",
                            restart_delay
                        );
                        std::thread::sleep(restart_delay);
                        restart_delay = std::cmp::min(restart_delay * 2, max_delay);
                        continue;
                    }
                };

                let reader = std::io::BufReader::new(stdout);
                for line in reader.lines() {
                    let line = match line {
                        Ok(l) => l,
                        Err(_) => break,
                    };
                    // Output format: "color-scheme: 'prefer-dark'" or "color-scheme: 'prefer-light'"
                    let scheme = if line.contains("prefer-dark") {
                        "prefer-dark"
                    } else {
                        "prefer-light"
                    };
                    tracing::info!("gsettings color-scheme changed: {}", scheme);
                    let _ = handle.emit("gsettings-color-scheme-changed", scheme);
                }

                // Properly reap the child process before restarting
                let _ = child.wait();

                // Reset backoff if the process stayed alive for at least 30 seconds
                let alive_duration = started_at.elapsed();
                if alive_duration >= std::time::Duration::from_secs(30) {
                    restart_delay = std::time::Duration::from_secs(1);
                }

                tracing::warn!(
                    "gsettings monitor exited after {:?}, restarting in {:?}",
                    alive_duration,
                    restart_delay
                );
                std::thread::sleep(restart_delay);
                restart_delay = std::cmp::min(restart_delay * 2, max_delay);
            }
        });
    }
}

// ---------------------------------------------------------------------------
// Tests for wallbash / theme parsers
// ---------------------------------------------------------------------------
#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use std::process::Command;
    use std::sync::{Mutex, OnceLock};

    fn run_git(path: &Path, args: &[&str]) {
        let status = Command::new("git")
            .arg("-C")
            .arg(path)
            .args(args)
            .status()
            .expect("git command should run");
        assert!(status.success(), "git command failed: {:?}", args);
    }

    fn data_dir_env_lock() -> &'static Mutex<()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(()))
    }

    struct EnvRestore {
        key: &'static str,
        previous: Option<std::ffi::OsString>,
    }

    impl Drop for EnvRestore {
        fn drop(&mut self) {
            if let Some(previous) = self.previous.as_ref() {
                std::env::set_var(self.key, previous);
            } else {
                std::env::remove_var(self.key);
            }
        }
    }

    fn set_test_env(key: &'static str, value: impl AsRef<std::ffi::OsStr>) -> EnvRestore {
        let previous = std::env::var_os(key);
        std::env::set_var(key, value);
        EnvRestore { key, previous }
    }

    #[test]
    fn chat_workspace_machine_labels_external_linux_volumes_by_drive_name() {
        assert_eq!(
            machine_label_for_path(Path::new("/run/media/josue/T7/projects/clawcontrol")),
            "T7"
        );
        assert_eq!(
            machine_label_for_path(Path::new("/Volumes/T7/projects/clawcontrol")),
            "T7"
        );
    }

    #[test]
    fn local_chat_sessions_append_history_rename_and_delete() {
        let _guard = data_dir_env_lock().lock().expect("env lock");
        let dir = tempfile::tempdir().unwrap();
        let _data_dir = set_test_env("CLAWCONTROL_DATA_DIR", dir.path());

        let session = append_local_chat_turn(AppendLocalChatTurn {
            session_key: None,
            provider_id: "codex-cli",
            user_text: "review this file",
            assistant_text: "looks good",
            images: None,
            context_files: Some(vec![serde_json::json!({
                "name": "Chat.tsx",
                "content": "export default function Chat() {}"
            })]),
            project_id: Some("local:chat"),
            project: Some("chat"),
            project_root: Some("/tmp/chat"),
            working_dir: Some("/tmp/chat"),
            environment_id: Some("local"),
            branch: Some("main"),
            runtime: Some("Work locally"),
        })
        .expect("local chat turn should save");

        assert!(is_local_chat_session_key(&session.key));
        assert_eq!(session.agent_key, "codex-cli");
        assert_eq!(session.message_count, 2);
        assert_eq!(session.working_dir.as_deref(), Some("/tmp/chat"));
        assert_eq!(session.messages[0].context_files.as_ref().unwrap().len(), 1);

        let continued = append_local_chat_turn(AppendLocalChatTurn {
            session_key: Some(&session.key),
            provider_id: "codex-cli",
            user_text: "continue",
            assistant_text: "continued",
            images: None,
            context_files: None,
            project_id: None,
            project: None,
            project_root: None,
            working_dir: None,
            environment_id: None,
            branch: None,
            runtime: None,
        })
        .expect("existing local chat should append");

        assert_eq!(continued.key, session.key);
        assert_eq!(continued.message_count, 4);
        assert_eq!(continued.working_dir.as_deref(), Some("/tmp/chat"));

        let history = local_chat_session_history(&session.key)
            .expect("history should load")
            .expect("session should exist");
        assert_eq!(history.len(), 4);
        assert_eq!(history[0].text, "review this file");
        assert_eq!(history[3].text, "continued");

        let summaries = load_local_chat_session_summaries().unwrap();
        assert_eq!(summaries.len(), 1);
        assert_eq!(summaries[0].key, session.key);
        assert_eq!(summaries[0].message_count, 4);
        assert_eq!(summaries[0].pinned, None);
        let summary_json = serde_json::to_value(&summaries[0]).unwrap();
        assert!(summary_json.get("messages").is_none());
        assert!(summary_json.get("agentKey").is_some());

        assert!(rename_local_chat_session(&session.key, "Renamed local chat").unwrap());
        let renamed = load_local_chat_sessions().unwrap();
        assert_eq!(renamed[0].label, "Renamed local chat");

        assert!(patch_local_chat_session(&session.key, None, Some(true), None).unwrap());
        let pinned = load_local_chat_session_summaries().unwrap();
        assert_eq!(pinned[0].pinned, Some(true));
        assert_eq!(pinned[0].favorite, Some(true));

        assert!(delete_local_chat_session(&session.key).unwrap());
        assert!(local_chat_session_history(&session.key).unwrap().is_none());
    }

    #[test]
    fn local_chat_session_history_limit_returns_latest_messages_in_order() {
        let _guard = data_dir_env_lock().lock().expect("env lock");
        let dir = tempfile::tempdir().unwrap();
        let _data_dir = set_test_env("CLAWCONTROL_DATA_DIR", dir.path());

        let first = append_local_chat_turn(AppendLocalChatTurn {
            session_key: None,
            provider_id: "codex-cli",
            user_text: "turn 1",
            assistant_text: "reply 1",
            images: None,
            context_files: None,
            project_id: Some("local:chat"),
            project: Some("chat"),
            project_root: Some("/tmp/chat"),
            working_dir: Some("/tmp/chat"),
            environment_id: Some("local"),
            branch: Some("main"),
            runtime: Some("Work locally"),
        })
        .expect("first local chat turn should save");

        for index in 2..=4 {
            append_local_chat_turn(AppendLocalChatTurn {
                session_key: Some(&first.key),
                provider_id: "codex-cli",
                user_text: &format!("turn {index}"),
                assistant_text: &format!("reply {index}"),
                images: None,
                context_files: None,
                project_id: None,
                project: None,
                project_root: None,
                working_dir: None,
                environment_id: None,
                branch: None,
                runtime: None,
            })
            .expect("continued local chat turn should save");
        }

        let full_history = local_chat_session_history_with_limit(&first.key, None)
            .expect("history should load")
            .expect("session should exist");
        let limited_history = local_chat_session_history_with_limit(&first.key, Some(3))
            .expect("limited history should load")
            .expect("session should exist");
        let zero_limit_history = local_chat_session_history_with_limit(&first.key, Some(0))
            .expect("zero-limit history should load")
            .expect("session should exist");

        assert_eq!(full_history.len(), 8);
        assert_eq!(
            limited_history
                .iter()
                .map(|message| message.text.as_str())
                .collect::<Vec<_>>(),
            vec!["reply 3", "turn 4", "reply 4"],
        );
        assert_eq!(zero_limit_history.len(), 8);
    }

    #[test]
    fn local_chat_session_label_uses_context_file_paths_for_file_only_turns() {
        let _guard = data_dir_env_lock().lock().expect("env lock");
        let dir = tempfile::tempdir().unwrap();
        let _data_dir = set_test_env("CLAWCONTROL_DATA_DIR", dir.path());

        let session = append_local_chat_turn(AppendLocalChatTurn {
            session_key: None,
            provider_id: "claudeAgent",
            user_text: "",
            assistant_text: "reviewed",
            images: None,
            context_files: Some(vec![
                serde_json::json!({
                    "name": "Chat.tsx",
                    "path": "frontend/src/pages/Chat.tsx",
                    "content": "export default function Chat() {}"
                }),
                serde_json::json!({
                    "name": "useChatState.ts",
                    "path": "frontend/src/pages/chat/useChatState.ts",
                    "content": "export function useChatState() {}"
                }),
            ]),
            project_id: None,
            project: None,
            project_root: None,
            working_dir: None,
            environment_id: None,
            branch: None,
            runtime: None,
        })
        .expect("file-only local chat turn should save");

        assert_eq!(
            session.label,
            "Context: frontend/src/pages/Chat.tsx + 1 file"
        );
        assert_eq!(session.messages[0].text, "Attached context files");
    }

    #[test]
    fn local_chat_session_compact_summarizes_older_messages_and_keeps_metadata() {
        let _guard = data_dir_env_lock().lock().expect("env lock");
        let dir = tempfile::tempdir().unwrap();
        let _data_dir = set_test_env("CLAWCONTROL_DATA_DIR", dir.path());
        let repeated = "context ".repeat(180);

        let first = append_local_chat_turn(AppendLocalChatTurn {
            session_key: None,
            provider_id: "codex-cli",
            user_text: &format!("first turn {repeated}"),
            assistant_text: &format!("first reply {repeated}"),
            images: None,
            context_files: Some(vec![serde_json::json!({
                "name": "Chat.tsx",
                "path": "frontend/src/pages/Chat.tsx",
                "content": "export default function Chat() {}"
            })]),
            project_id: Some("local:chat"),
            project: Some("chat"),
            project_root: Some("/tmp/chat"),
            working_dir: Some("/tmp/chat"),
            environment_id: Some("local"),
            branch: Some("main"),
            runtime: Some("Work locally"),
        })
        .expect("first local chat turn should save");

        for index in 2..=6 {
            append_local_chat_turn(AppendLocalChatTurn {
                session_key: Some(&first.key),
                provider_id: "codex-cli",
                user_text: &format!("turn {index} {repeated}"),
                assistant_text: &format!("reply {index} {repeated}"),
                images: None,
                context_files: None,
                project_id: None,
                project: None,
                project_root: None,
                working_dir: None,
                environment_id: None,
                branch: None,
                runtime: None,
            })
            .expect("continued local chat turn should save");
        }

        let result = compact_local_chat_session(&first.key)
            .expect("compact should succeed")
            .expect("session should exist");

        assert_eq!(result.message_count, LOCAL_CHAT_COMPACT_KEEP_MESSAGES + 1);
        assert_eq!(result.messages_removed, 3);
        assert!(result.tokens_saved > 0);

        let session = load_local_chat_sessions()
            .unwrap()
            .into_iter()
            .find(|session| session.key == first.key)
            .expect("compacted session should remain");

        assert_eq!(session.project_id.as_deref(), Some("local:chat"));
        assert_eq!(session.working_dir.as_deref(), Some("/tmp/chat"));
        assert_eq!(session.environment_id.as_deref(), Some("local"));
        assert_eq!(session.message_count, LOCAL_CHAT_COMPACT_KEEP_MESSAGES + 1);
        assert!(session.messages[0]
            .text
            .starts_with("Compacted previous local chat context (4 messages):"));
        assert!(session.messages[0]
            .text
            .contains("Context: frontend/src/pages/Chat.tsx"));
        assert!(session
            .messages
            .iter()
            .any(|message| message.text.contains("turn 6")));
    }

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

    #[test]
    fn chat_workspace_project_includes_git_root_branches_and_repository_identity() {
        let dir = tempfile::tempdir().unwrap();
        let repo = dir.path().join("new-project");
        let nested = repo.join("frontend");
        std::fs::create_dir_all(&nested).unwrap();

        Command::new("git")
            .arg("init")
            .arg("-b")
            .arg("main")
            .arg(&repo)
            .status()
            .expect("git init should run");
        run_git(
            &repo,
            &[
                "remote",
                "add",
                "origin",
                "git@github.com:josue/new-project.git",
            ],
        );
        std::fs::write(repo.join("README.md"), "chat workspace").unwrap();
        run_git(&repo, &["add", "README.md"]);
        run_git(
            &repo,
            &[
                "-c",
                "user.name=ClawControl",
                "-c",
                "user.email=clawcontrol@example.test",
                "commit",
                "-m",
                "init",
            ],
        );
        run_git(&repo, &["checkout", "-b", "codex/chat-parity"]);

        let project = normalize_chat_workspace_project(nested.clone());
        let expected_path = nested
            .canonicalize()
            .unwrap()
            .to_string_lossy()
            .into_owned();
        let expected_root = repo.canonicalize().unwrap().to_string_lossy().into_owned();

        assert_eq!(project.name, "frontend");
        assert_eq!(project.path, expected_path);
        assert_eq!(project.root.as_deref(), Some(expected_root.as_str()));
        assert_eq!(project.environment_id.as_deref(), Some("local"));
        assert_eq!(project.current_branch.as_deref(), Some("codex/chat-parity"));
        assert!(project.branches.contains(&"main".to_string()));
        assert!(project.branches.contains(&"codex/chat-parity".to_string()));

        let identity = project
            .repository_identity
            .expect("git remote should produce identity");
        assert_eq!(identity.canonical_key, "github.com/josue/new-project");
        assert_eq!(identity.display_name.as_deref(), Some("josue/new-project"));
        assert_eq!(identity.name.as_deref(), Some("new-project"));
        assert_eq!(identity.owner.as_deref(), Some("josue"));
        assert_eq!(identity.remote_name.as_deref(), Some("origin"));
    }

    #[test]
    fn chat_workspace_context_does_not_inject_process_cwd_as_project() {
        let context = chat_workspace_context_from_projects(Vec::new());

        assert!(context.projects.is_empty());
        assert_eq!(context.runtime_modes, vec!["Work locally".to_string()]);
    }

    #[test]
    fn chat_workspace_project_identity_keeps_same_ids_distinct_by_environment() {
        let local_project = ChatWorkspaceProject {
            id: Some("shared-project-id".to_string()),
            environment_id: Some("local".to_string()),
            name: "Project".to_string(),
            path: "/tmp/shared".to_string(),
            branches: vec!["main".to_string()],
            current_branch: Some("main".to_string()),
            repository_identity: None,
            machine: None,
            machine_label: None,
            host: None,
            group: None,
            root: Some("/tmp/shared".to_string()),
            scripts: None,
            grouping_override: None,
        };
        let remote_project = ChatWorkspaceProject {
            environment_id: Some("harness-vm".to_string()),
            ..local_project.clone()
        };
        let legacy_local_project = ChatWorkspaceProject {
            environment_id: None,
            ..local_project.clone()
        };

        assert!(!chat_workspace_projects_share_identity(
            &local_project,
            &remote_project
        ));
        assert!(chat_workspace_projects_share_identity(
            &local_project,
            &legacy_local_project
        ));
        assert!(!chat_workspace_project_matches_lookup(
            &remote_project,
            "shared-project-id",
            None,
            Some("local"),
        ));
        assert!(chat_workspace_project_matches_lookup(
            &remote_project,
            "shared-project-id",
            None,
            Some("harness-vm"),
        ));
    }

    #[test]
    fn chat_workspace_project_path_validation_rejects_missing_paths_and_files() {
        let dir = tempfile::tempdir().unwrap();
        let missing = dir.path().join("missing-project");
        let file = dir.path().join("not-a-project.txt");
        std::fs::write(&file, "not a folder").unwrap();

        let missing_error = get_chat_project_for_path(missing.to_string_lossy().into_owned())
            .expect_err("missing project path should be rejected");
        let file_error = get_chat_project_for_path(file.to_string_lossy().into_owned())
            .expect_err("file project path should be rejected");

        assert!(missing_error.contains("project folder does not exist"));
        assert_eq!(file_error, "project path must be a folder");
    }

    #[test]
    fn chat_context_files_read_selected_files_and_prioritize_folder_context() {
        let dir = tempfile::tempdir().unwrap();
        let project = dir.path().join("native-context");
        std::fs::create_dir_all(project.join("src")).unwrap();
        std::fs::create_dir_all(project.join("node_modules")).unwrap();
        std::fs::write(project.join("README.md"), "read me").unwrap();
        std::fs::write(
            project.join("src").join("main.ts"),
            "export const main = true",
        )
        .unwrap();
        std::fs::write(project.join("node_modules").join("ignored.ts"), "ignore me").unwrap();
        std::fs::write(project.join("image.png"), [0_u8, 1, 2]).unwrap();

        let attachments =
            read_chat_context_files(vec![project.to_string_lossy().into_owned()]).unwrap();

        assert_eq!(attachments.len(), 2);
        assert_eq!(attachments[0].path, "native-context/src/main.ts");
        assert_eq!(attachments[0].content, "export const main = true");
        assert_eq!(attachments[1].path, "native-context/README.md");
        assert!(!attachments
            .iter()
            .any(|file| file.path.contains("node_modules")));
        assert!(!attachments.iter().any(|file| file.name == "image.png"));
    }

    #[test]
    fn chat_context_files_expand_native_path_variants_and_dedupe_roots() {
        let dir = tempfile::tempdir().unwrap();
        let project = dir.path().join("My Project");
        std::fs::create_dir_all(&project).unwrap();
        std::fs::write(project.join("README.md"), "read me").unwrap();
        let file_url = url::Url::from_file_path(&project).unwrap().to_string();
        let escaped = project.to_string_lossy().replace(' ', "\\ ");

        let attachments =
            read_chat_context_files(vec![format!("\"{file_url}\""), escaped, "   ".to_string()])
                .unwrap();

        assert_eq!(attachments.len(), 1);
        assert_eq!(attachments[0].path, "My Project/README.md");
        assert_eq!(attachments[0].content, "read me");
    }

    #[test]
    fn chat_image_data_urls_read_selected_supported_images() {
        let dir = tempfile::tempdir().unwrap();
        let png = dir.path().join("shot.png");
        let unsupported = dir.path().join("notes.txt");
        std::fs::write(&png, [0_u8, 1, 2]).unwrap();
        std::fs::write(&unsupported, "not an image").unwrap();

        let images = read_chat_image_data_urls(vec![
            png.to_string_lossy().into_owned(),
            unsupported.to_string_lossy().into_owned(),
        ])
        .unwrap();

        assert_eq!(images.len(), 1);
        assert!(images[0].starts_with("data:image/png;base64,"));
    }

    #[test]
    fn chat_image_data_urls_expand_native_path_variants_and_dedupe_images() {
        let dir = tempfile::tempdir().unwrap();
        let png = dir.path().join("shot one.png");
        std::fs::write(&png, [0_u8, 1, 2]).unwrap();
        let file_url = url::Url::from_file_path(&png).unwrap().to_string();
        let escaped = png.to_string_lossy().replace(' ', "\\ ");

        let images =
            read_chat_image_data_urls(vec![format!("'{file_url}'"), escaped, "   ".to_string()])
                .unwrap();

        assert_eq!(images.len(), 1);
        assert!(images[0].starts_with("data:image/png;base64,"));
    }

    #[test]
    fn chat_workspace_project_path_validation_expands_home_shorthand() {
        let home = tempfile::tempdir().unwrap();
        let project = home.path().join("typed-project");
        std::fs::create_dir_all(&project).unwrap();

        assert_eq!(
            expand_chat_workspace_project_path("~/typed-project", Some(home.path())).unwrap(),
            project
        );
        assert_eq!(
            expand_chat_workspace_project_path("~", Some(home.path())).unwrap(),
            home.path()
        );
        assert_eq!(
            expand_chat_workspace_project_path("  /tmp/project  ", Some(home.path())).unwrap(),
            PathBuf::from("/tmp/project")
        );
        assert_eq!(
            expand_chat_workspace_project_path("\"file:///tmp/My%20Project\"", Some(home.path()))
                .unwrap(),
            PathBuf::from("/tmp/My Project")
        );
        assert_eq!(
            expand_chat_workspace_project_path(r#"/tmp/My\ Project"#, Some(home.path())).unwrap(),
            PathBuf::from("/tmp/My Project")
        );
    }

    #[test]
    fn chat_workspace_project_infers_scripts_from_project_files() {
        let dir = tempfile::tempdir().unwrap();
        let project = dir.path().join("tauri-app");
        std::fs::create_dir_all(project.join("src-tauri")).unwrap();
        std::fs::create_dir_all(project.join("frontend")).unwrap();
        std::fs::write(
            project.join("src-tauri").join("Cargo.toml"),
            "[package]\nname = \"app\"\nversion = \"0.1.0\"\n",
        )
        .unwrap();
        std::fs::write(
            project.join("frontend").join("package.json"),
            r#"{"scripts":{"dev":"vite","typecheck":"tsc --noEmit","lint":"eslint ."}}"#,
        )
        .unwrap();
        std::fs::write(project.join("frontend").join("pnpm-lock.yaml"), "").unwrap();

        let normalized = normalize_chat_workspace_project(project);
        let scripts = normalized
            .scripts
            .expect("project scripts should be inferred");

        assert!(scripts.iter().any(|script| {
            script.id == "tauri-dev"
                && script.command == "cargo tauri dev"
                && script.cwd.as_deref() == Some("src-tauri")
        }));
        assert!(scripts.iter().any(|script| {
            script.name == "Frontend dev"
                && script.command == "pnpm run dev"
                && script.cwd.as_deref() == Some("frontend")
        }));
        assert!(scripts
            .iter()
            .any(|script| script.name == "Frontend typecheck"));
        assert!(scripts.iter().any(|script| script.name == "Frontend lint"));
    }

    #[test]
    fn chat_workspace_project_does_not_invent_scripts_for_unknown_folders() {
        let dir = tempfile::tempdir().unwrap();
        let project = dir.path().join("plain-folder");
        std::fs::create_dir_all(&project).unwrap();

        let normalized = normalize_chat_workspace_project(project);

        assert!(normalized.scripts.is_none());
    }

    #[test]
    fn chat_workspace_project_patch_distinguishes_cleared_grouping_override() {
        let missing_patch: ChatWorkspaceProjectPatch =
            serde_json::from_value(serde_json::json!({})).expect("missing patch should parse");
        let cleared_patch: ChatWorkspaceProjectPatch =
            serde_json::from_value(serde_json::json!({ "groupingOverride": null }))
                .expect("null grouping override should parse");
        let separate_patch: ChatWorkspaceProjectPatch =
            serde_json::from_value(serde_json::json!({ "groupingOverride": "separate" }))
                .expect("string grouping override should parse");

        assert_eq!(missing_patch.grouping_override, None);
        assert_eq!(cleared_patch.grouping_override, Some(None));
        assert_eq!(
            separate_patch.grouping_override,
            Some(Some("separate".to_string()))
        );
    }

    #[test]
    fn chat_workspace_context_refreshes_stored_project_metadata_without_losing_user_settings() {
        let dir = tempfile::tempdir().unwrap();
        let repo = dir.path().join("stored-project");
        std::fs::create_dir_all(&repo).unwrap();

        Command::new("git")
            .arg("init")
            .arg("-b")
            .arg("main")
            .arg(&repo)
            .status()
            .expect("git init should run");
        std::fs::write(repo.join("README.md"), "stored project").unwrap();
        run_git(&repo, &["add", "README.md"]);
        run_git(
            &repo,
            &[
                "-c",
                "user.name=ClawControl",
                "-c",
                "user.email=clawcontrol@example.test",
                "commit",
                "-m",
                "init",
            ],
        );
        run_git(&repo, &["checkout", "-b", "feature/chat-workspace"]);

        let stored = ChatWorkspaceProject {
            id: Some("stale-id".to_string()),
            environment_id: Some("local".to_string()),
            name: "Renamed Project".to_string(),
            path: repo.to_string_lossy().into_owned(),
            branches: vec!["stale".to_string()],
            current_branch: Some("stale".to_string()),
            repository_identity: None,
            machine: None,
            machine_label: Some("Pinned Machine".to_string()),
            host: None,
            group: None,
            root: None,
            scripts: Some(vec![ChatProjectScript {
                id: "dev".to_string(),
                name: "Dev".to_string(),
                command: "npm run dev".to_string(),
                cwd: None,
                icon: None,
                keybinding: Some("ctrl+shift+d".to_string()),
                run_on_worktree_create: None,
            }]),
            grouping_override: Some("separate".to_string()),
        };

        let context = chat_workspace_context_from_projects(vec![stored]);
        let project = context
            .projects
            .first()
            .expect("stored project should remain");

        assert_eq!(context.projects.len(), 1);
        assert_eq!(project.name, "Renamed Project");
        assert_eq!(project.machine_label.as_deref(), Some("Pinned Machine"));
        assert_eq!(
            project
                .scripts
                .as_ref()
                .and_then(|scripts| scripts.first())
                .and_then(|script| script.keybinding.as_deref()),
            Some("ctrl+shift+d")
        );
        assert_eq!(
            project.current_branch.as_deref(),
            Some("feature/chat-workspace")
        );
        assert!(project.branches.contains(&"main".to_string()));
        assert!(project
            .branches
            .contains(&"feature/chat-workspace".to_string()));
        assert_eq!(project.scripts.as_ref().map(Vec::len), Some(1));
        assert_eq!(project.grouping_override.as_deref(), Some("separate"));
    }

    #[test]
    fn updating_stored_chat_workspace_project_refreshes_git_metadata() {
        let _guard = data_dir_env_lock().lock().expect("env lock");
        let dir = tempfile::tempdir().unwrap();
        let _data_dir = set_test_env("CLAWCONTROL_DATA_DIR", dir.path());
        let repo = dir.path().join("patched-project");
        std::fs::create_dir_all(&repo).unwrap();

        Command::new("git")
            .arg("init")
            .arg("-b")
            .arg("main")
            .arg(&repo)
            .status()
            .expect("git init should run");
        std::fs::write(repo.join("README.md"), "patched project").unwrap();
        run_git(&repo, &["add", "README.md"]);
        run_git(
            &repo,
            &[
                "-c",
                "user.name=ClawControl",
                "-c",
                "user.email=clawcontrol@example.test",
                "commit",
                "-m",
                "init",
            ],
        );

        let stored = add_stored_chat_workspace_project(repo.to_string_lossy().into_owned())
            .expect("project should store");
        run_git(&repo, &["checkout", "-b", "feature/refreshed-metadata"]);

        let patch = ChatWorkspaceProjectPatch {
            name: Some("Renamed patched project".to_string()),
            machine_label: Some("Pinned Machine".to_string()),
            scripts: None,
            grouping_override: Some(Some("separate".to_string())),
        };
        let (updated, stored_projects) =
            update_stored_chat_workspace_project(stored.id.clone().unwrap(), patch)
                .expect("project patch should save");

        assert_eq!(updated.name, "Renamed patched project");
        assert_eq!(updated.machine_label.as_deref(), Some("Pinned Machine"));
        assert_eq!(updated.grouping_override.as_deref(), Some("separate"));
        assert_eq!(
            updated.current_branch.as_deref(),
            Some("feature/refreshed-metadata")
        );
        assert!(updated.branches.contains(&"main".to_string()));
        assert!(updated
            .branches
            .contains(&"feature/refreshed-metadata".to_string()));
        assert_eq!(
            stored_projects
                .first()
                .and_then(|project| project.current_branch.as_deref()),
            Some("feature/refreshed-metadata")
        );
    }

    #[test]
    fn native_chat_workspace_project_commands_return_refreshed_mutation_payloads() {
        let _guard = data_dir_env_lock().lock().expect("env lock");
        let dir = tempfile::tempdir().unwrap();
        let _data_dir = set_test_env("CLAWCONTROL_DATA_DIR", dir.path());
        let repo = dir.path().join("native-project");
        std::fs::create_dir_all(&repo).unwrap();

        let added = add_chat_workspace_project(repo.to_string_lossy().into_owned())
            .expect("native add should store project");
        assert_eq!(added.project.path.as_str(), repo.to_string_lossy().as_ref());
        assert_eq!(added.projects.len(), 1);

        let updated = update_chat_workspace_project(
            added.project.id.clone(),
            Some(added.project.path.clone()),
            added.project.environment_id.clone(),
            ChatWorkspaceProjectPatch {
                name: Some("Native Project".to_string()),
                machine_label: Some("Native Machine".to_string()),
                scripts: Some(vec![ChatProjectScript {
                    id: "test".to_string(),
                    name: "Test".to_string(),
                    command: "npm test".to_string(),
                    cwd: None,
                    icon: Some("test".to_string()),
                    keybinding: Some("ctrl+shift+t".to_string()),
                    run_on_worktree_create: None,
                }]),
                grouping_override: Some(Some("separate".to_string())),
            },
        )
        .expect("native update should patch project");

        assert_eq!(updated.project.name, "Native Project");
        assert_eq!(
            updated
                .project
                .scripts
                .as_ref()
                .and_then(|scripts| scripts.first())
                .and_then(|script| script.keybinding.as_deref()),
            Some("ctrl+shift+t")
        );
        assert_eq!(updated.projects.len(), 1);

        let after_remove = remove_chat_workspace_project(
            updated.project.id.clone(),
            Some(updated.project.path),
            updated.project.environment_id,
        )
        .expect("native remove should delete project");
        assert!(after_remove.is_empty());
    }

    #[test]
    fn stored_chat_workspace_project_list_and_remove_return_refreshed_metadata() {
        let _guard = data_dir_env_lock().lock().expect("env lock");
        let dir = tempfile::tempdir().unwrap();
        let _data_dir = set_test_env("CLAWCONTROL_DATA_DIR", dir.path());
        let removed_repo = dir.path().join("removed-project");
        let remaining_repo = dir.path().join("remaining-project");
        std::fs::create_dir_all(&removed_repo).unwrap();
        std::fs::create_dir_all(&remaining_repo).unwrap();

        for repo in [&removed_repo, &remaining_repo] {
            Command::new("git")
                .arg("init")
                .arg("-b")
                .arg("main")
                .arg(repo)
                .status()
                .expect("git init should run");
            std::fs::write(repo.join("README.md"), "stored project").unwrap();
            run_git(repo, &["add", "README.md"]);
            run_git(
                repo,
                &[
                    "-c",
                    "user.name=ClawControl",
                    "-c",
                    "user.email=clawcontrol@example.test",
                    "commit",
                    "-m",
                    "init",
                ],
            );
        }

        let removed = normalize_chat_workspace_project(removed_repo.clone());
        let mut remaining = normalize_chat_workspace_project(remaining_repo.clone());
        remaining.name = "Pinned Remaining".to_string();
        remaining.current_branch = Some("stale".to_string());
        remaining.branches = vec!["stale".to_string()];
        remaining.machine_label = Some("Pinned Machine".to_string());
        write_workspace_store(&[removed.clone(), remaining.clone()]).expect("store should write");
        run_git(
            &remaining_repo,
            &["checkout", "-b", "feature/refreshed-list"],
        );

        let listed = load_stored_chat_workspace_projects().expect("projects should load");
        let listed_remaining = listed
            .iter()
            .find(|project| project.path == remaining.path)
            .expect("remaining project should be listed");
        assert_eq!(listed_remaining.name, "Pinned Remaining");
        assert_eq!(
            listed_remaining.current_branch.as_deref(),
            Some("feature/refreshed-list")
        );
        assert!(listed_remaining.branches.contains(&"main".to_string()));
        assert_eq!(
            listed_remaining.machine_label.as_deref(),
            Some("Pinned Machine")
        );

        let after_remove = remove_stored_chat_workspace_project(removed.id.unwrap())
            .expect("project should remove");
        assert_eq!(after_remove.len(), 1);
        assert_eq!(after_remove[0].name, "Pinned Remaining");
        assert_eq!(
            after_remove[0].current_branch.as_deref(),
            Some("feature/refreshed-list")
        );
        assert!(after_remove[0].branches.contains(&"main".to_string()));
    }

    #[test]
    fn stored_chat_workspace_project_update_and_remove_match_canonical_path_variants() {
        let _guard = data_dir_env_lock().lock().expect("env lock");
        let dir = tempfile::tempdir().unwrap();
        let _data_dir = set_test_env("CLAWCONTROL_DATA_DIR", dir.path());
        let repo = dir.path().join("variant-project");
        std::fs::create_dir_all(&repo).unwrap();

        let stored = add_stored_chat_workspace_project(repo.to_string_lossy().into_owned())
            .expect("project should store");
        let variant_path = format!("{}/", stored.path);
        let (updated, projects) = update_stored_chat_workspace_project(
            variant_path.clone(),
            ChatWorkspaceProjectPatch {
                name: Some("Variant Project".to_string()),
                machine_label: None,
                scripts: None,
                grouping_override: None,
            },
        )
        .expect("path variant should patch the stored project");

        assert_eq!(updated.path, stored.path);
        assert_eq!(updated.name, "Variant Project");
        assert_eq!(projects.len(), 1);

        let after_remove = remove_stored_chat_workspace_project(variant_path)
            .expect("path variant should remove the stored project");
        assert!(after_remove.is_empty());
    }

    #[test]
    fn stored_chat_workspace_project_remove_matches_missing_path_variants() {
        let _guard = data_dir_env_lock().lock().expect("env lock");
        let dir = tempfile::tempdir().unwrap();
        let _data_dir = set_test_env("CLAWCONTROL_DATA_DIR", dir.path());
        let repo = dir.path().join("missing-variant-project");
        std::fs::create_dir_all(&repo).unwrap();
        let stored = normalize_chat_workspace_project(repo.clone());
        let stored_path = stored.path.clone();
        write_workspace_store(&[stored]).expect("workspace store should write");
        std::fs::remove_dir_all(&repo).expect("stored project folder should be removable");

        let after_remove = remove_stored_chat_workspace_project(format!("{stored_path}/"))
            .expect("missing path variant should remove the stored project");

        assert!(after_remove.is_empty());
        assert!(read_workspace_store()
            .expect("workspace store should still read")
            .is_empty());
    }

    #[test]
    fn stored_chat_workspace_project_routes_fall_back_to_path_when_id_is_stale() {
        let _guard = data_dir_env_lock().lock().expect("env lock");
        let dir = tempfile::tempdir().unwrap();
        let _data_dir = set_test_env("CLAWCONTROL_DATA_DIR", dir.path());
        let repo = dir.path().join("stale-id-project");
        std::fs::create_dir_all(&repo).unwrap();

        let stored = add_stored_chat_workspace_project(repo.to_string_lossy().into_owned())
            .expect("project should store");
        let (updated, projects) = update_stored_chat_workspace_project_by_lookup(
            Some("local-stale-generated-id".to_string()),
            Some(stored.path.clone()),
            None,
            ChatWorkspaceProjectPatch {
                name: Some("Path Matched".to_string()),
                machine_label: None,
                scripts: None,
                grouping_override: None,
            },
        )
        .expect("path should patch when id is stale");

        assert_eq!(updated.path, stored.path);
        assert_eq!(updated.name, "Path Matched");
        assert_eq!(projects.len(), 1);

        let after_remove = remove_stored_chat_workspace_project_by_lookup(
            Some("local-stale-generated-id".to_string()),
            Some(stored.path),
            None,
        )
        .expect("path should remove when id is stale");
        assert!(after_remove.is_empty());
    }

    #[test]
    fn stored_chat_workspace_project_rename_rejects_blank_names() {
        let _guard = data_dir_env_lock().lock().expect("env lock");
        let dir = tempfile::tempdir().unwrap();
        let _data_dir = set_test_env("CLAWCONTROL_DATA_DIR", dir.path());
        let repo = dir.path().join("blank-name-project");
        std::fs::create_dir_all(&repo).unwrap();

        let stored = add_stored_chat_workspace_project(repo.to_string_lossy().into_owned())
            .expect("project should store");
        let error = update_stored_chat_workspace_project_by_lookup(
            stored.id.clone(),
            Some(stored.path.clone()),
            stored.environment_id.clone(),
            ChatWorkspaceProjectPatch {
                name: Some("   ".to_string()),
                machine_label: None,
                scripts: None,
                grouping_override: None,
            },
        )
        .expect_err("blank project names should be rejected");

        assert_eq!(error, "project name is required");
        let projects = read_workspace_store().expect("store should still be readable");
        assert_eq!(projects.len(), 1);
        assert_eq!(projects[0].name, stored.name);
    }

    #[test]
    fn stored_chat_workspace_project_mutations_respect_environment_identity() {
        let _guard = data_dir_env_lock().lock().expect("env lock");
        let dir = tempfile::tempdir().unwrap();
        let _data_dir = set_test_env("CLAWCONTROL_DATA_DIR", dir.path());
        let repo = dir.path().join("shared-path-project");
        std::fs::create_dir_all(&repo).unwrap();

        let local = normalize_chat_workspace_project(repo.clone());
        let mut remote = local.clone();
        remote.id = Some("remote:shared-path-project".to_string());
        remote.environment_id = Some("harness-vm".to_string());
        remote.name = "Remote shared path".to_string();
        write_workspace_store(&[local.clone(), remote.clone()]).expect("store should write");

        let (updated, projects) = update_stored_chat_workspace_project_by_lookup(
            Some("stale-remote-id".to_string()),
            Some(local.path.clone()),
            Some("harness-vm".to_string()),
            ChatWorkspaceProjectPatch {
                name: Some("Remote patched".to_string()),
                machine_label: None,
                scripts: None,
                grouping_override: None,
            },
        )
        .expect("environment path match should patch only the remote project");

        assert_eq!(updated.id.as_deref(), Some("remote:shared-path-project"));
        assert_eq!(updated.environment_id.as_deref(), Some("harness-vm"));
        assert_eq!(updated.name, "Remote patched");
        assert_eq!(projects.len(), 2);
        assert!(projects.iter().any(|project| {
            project.environment_id.as_deref() == Some("local") && project.name == local.name
        }));

        let after_remove = remove_stored_chat_workspace_project_by_lookup(
            None,
            Some(local.path),
            Some("harness-vm".to_string()),
        )
        .expect("environment path match should remove only the remote project");

        assert_eq!(after_remove.len(), 1);
        assert_eq!(after_remove[0].environment_id.as_deref(), Some("local"));
    }

    #[test]
    fn stored_chat_workspace_project_exact_id_respects_supplied_environment_lookup() {
        let _guard = data_dir_env_lock().lock().expect("env lock");
        let dir = tempfile::tempdir().unwrap();
        let _data_dir = set_test_env("CLAWCONTROL_DATA_DIR", dir.path());
        let local_repo = dir.path().join("local-project");
        let remote_repo = dir.path().join("remote-project");
        std::fs::create_dir_all(&local_repo).unwrap();
        std::fs::create_dir_all(&remote_repo).unwrap();

        let local = normalize_chat_workspace_project(local_repo);
        let mut remote = normalize_chat_workspace_project(remote_repo);
        remote.id = Some("remote:stable-project-id".to_string());
        remote.environment_id = Some("harness-vm".to_string());
        remote.name = "Remote project".to_string();
        write_workspace_store(&[local.clone(), remote.clone()]).expect("store should write");

        let update_error = update_stored_chat_workspace_project_by_lookup(
            remote.id.clone(),
            None,
            Some("local".to_string()),
            ChatWorkspaceProjectPatch {
                name: Some("Remote patched by stable id".to_string()),
                machine_label: None,
                scripts: None,
                grouping_override: None,
            },
        )
        .expect_err("exact project id should not patch when the supplied environment is different");

        assert_eq!(update_error, "workspace project not found");

        let remove_error = remove_stored_chat_workspace_project_by_lookup(
            remote.id,
            None,
            Some("local".to_string()),
        )
        .expect_err(
            "exact project id should not delete when the supplied environment is different",
        );

        assert_eq!(remove_error, "workspace project not found");

        let after_remove = read_workspace_store().expect("store should remain readable");
        assert_eq!(after_remove.len(), 2);
        assert!(after_remove
            .iter()
            .any(|project| project.environment_id.as_deref() == Some("local")));
        assert!(after_remove
            .iter()
            .any(|project| project.environment_id.as_deref() == Some("harness-vm")));
    }

    #[test]
    fn adding_stored_chat_workspace_project_replaces_legacy_path_variants() {
        let _guard = data_dir_env_lock().lock().expect("env lock");
        let dir = tempfile::tempdir().unwrap();
        let _data_dir = set_test_env("CLAWCONTROL_DATA_DIR", dir.path());
        let repo = dir.path().join("duplicate-project");
        std::fs::create_dir_all(&repo).unwrap();

        let canonical = repo.canonicalize().unwrap().to_string_lossy().into_owned();
        let legacy = ChatWorkspaceProject {
            id: Some("legacy-duplicate".to_string()),
            environment_id: Some("local".to_string()),
            name: "Legacy Duplicate".to_string(),
            path: format!("{canonical}/"),
            branches: vec!["stale".to_string()],
            current_branch: Some("stale".to_string()),
            repository_identity: None,
            machine: None,
            machine_label: None,
            host: None,
            group: None,
            root: Some(format!("{canonical}/")),
            scripts: None,
            grouping_override: None,
        };
        write_workspace_store(&[legacy]).expect("legacy store should write");

        let added =
            add_stored_chat_workspace_project(canonical.clone()).expect("project should add");
        let raw_store = read_workspace_store().expect("store should read");

        assert_eq!(added.path, canonical);
        assert_eq!(raw_store.len(), 1);
        assert_eq!(raw_store[0].path, canonical);
        assert_ne!(raw_store[0].id.as_deref(), Some("legacy-duplicate"));
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
