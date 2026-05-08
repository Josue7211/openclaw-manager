use std::path::PathBuf;

use crate::server::AppState;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum HarnessProviderLayout {
    Harness,
    Hermes,
}

fn home_dir() -> PathBuf {
    dirs::home_dir().unwrap_or_else(|| PathBuf::from("."))
}

fn existing_home_child(names: &[&str]) -> Option<PathBuf> {
    let home = home_dir();
    names
        .iter()
        .map(|name| home.join(name))
        .find(|candidate| candidate.exists())
}

pub fn generic_base_dir_from_env() -> PathBuf {
    if let Ok(value) = std::env::var("HARNESS_DIR") {
        return PathBuf::from(value);
    }
    if let Ok(value) = std::env::var("OPENCLAW_DIR") {
        return PathBuf::from(value);
    }
    existing_home_child(&[".harness", ".openclaw"]).unwrap_or_else(|| home_dir().join(".harness"))
}

pub fn generic_base_dir(state: &AppState) -> PathBuf {
    state
        .secret_first(&["HARNESS_DIR", "OPENCLAW_DIR"])
        .map(PathBuf::from)
        .unwrap_or_else(generic_base_dir_from_env)
}

pub fn hermes_workspace_dir_from_env() -> PathBuf {
    if let Ok(value) = std::env::var("HERMES_HOME") {
        return PathBuf::from(value);
    }
    if let Ok(value) = std::env::var("HERMES_DIR") {
        let path = PathBuf::from(value);
        let nested = path.join("hermes-agent");
        return if nested.exists() { nested } else { path };
    }
    home_dir().join(".hermes/hermes-agent")
}

pub fn hermes_workspace_dir(state: &AppState) -> PathBuf {
    if let Some(value) = state.secret("HERMES_HOME") {
        return PathBuf::from(value);
    }
    if let Some(value) = state.secret("HERMES_DIR") {
        let path = PathBuf::from(value);
        let nested = path.join("hermes-agent");
        return if nested.exists() { nested } else { path };
    }
    hermes_workspace_dir_from_env()
}

pub fn provider_layout(state: &AppState) -> HarnessProviderLayout {
    if state
        .secret("HARNESS_PROVIDER")
        .map(|value| value.to_ascii_lowercase().contains("hermes"))
        .unwrap_or(false)
    {
        return HarnessProviderLayout::Hermes;
    }
    if state.secret("HERMES_HOME").is_some()
        || std::env::var("HERMES_HOME").is_ok()
        || state.secret("HERMES_DIR").is_some()
        || std::env::var("HERMES_DIR").is_ok()
        || hermes_workspace_dir(state).exists()
    {
        return HarnessProviderLayout::Hermes;
    }
    HarnessProviderLayout::Harness
}

pub fn workspace_dir_for_layout(state: &AppState, layout: HarnessProviderLayout) -> PathBuf {
    match layout {
        HarnessProviderLayout::Harness => generic_base_dir(state).join("workspace"),
        HarnessProviderLayout::Hermes => hermes_workspace_dir(state),
    }
}

pub fn workspace_dir(state: &AppState) -> PathBuf {
    workspace_dir_for_layout(state, provider_layout(state))
}

pub fn runtime_preferences_dir(state: &AppState) -> PathBuf {
    workspace_dir(state)
}

pub fn generic_media_dir_from_env() -> PathBuf {
    if let Ok(value) = std::env::var("HARNESS_DIR") {
        return PathBuf::from(value).join("media/chat-images");
    }
    if let Ok(value) = std::env::var("OPENCLAW_DIR") {
        return PathBuf::from(value).join("media/chat-images");
    }
    if let Ok(value) = std::env::var("HERMES_DIR") {
        return PathBuf::from(value).join("media/chat-images");
    }
    if let Ok(value) = std::env::var("HERMES_HOME") {
        let path = PathBuf::from(value);
        let base = path.parent().map(PathBuf::from).unwrap_or(path);
        return base.join("media/chat-images");
    }
    existing_home_child(&[".harness", ".openclaw", ".hermes"])
        .unwrap_or_else(|| home_dir().join(".harness"))
        .join("media/chat-images")
}

pub fn media_dir(state: &AppState) -> PathBuf {
    if let Some(value) = state.secret("HARNESS_DIR") {
        return PathBuf::from(value).join("media/chat-images");
    }
    if let Some(value) = state.secret("OPENCLAW_DIR") {
        return PathBuf::from(value).join("media/chat-images");
    }
    if let Some(value) = state.secret("HERMES_DIR") {
        return PathBuf::from(value).join("media/chat-images");
    }
    if let Some(value) = state.secret("HERMES_HOME") {
        let path = PathBuf::from(value);
        let base = path.parent().map(PathBuf::from).unwrap_or(path);
        return base.join("media/chat-images");
    }
    generic_media_dir_from_env()
}

pub fn model_config_candidates(state: &AppState) -> Vec<PathBuf> {
    let base = generic_base_dir(state);
    let workspace = workspace_dir(state);
    ["harness.json", "hermes.json", "openclaw.json"]
        .into_iter()
        .flat_map(|name| [base.join(name), workspace.join(name)])
        .collect()
}
