use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use super::agents::REGISTRY_PATH;
use super::agents::AgentRoute;

// ── Agent-registry helpers ───────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub(super) struct RegistryEntry {
    #[serde(rename = "agentId", default)]
    agent_id: String,
    #[serde(rename = "agentName", default)]
    agent_name: String,
    #[serde(default)]
    emoji: String,
    #[serde(default)]
    task: String,
    #[serde(rename = "logFile", default)]
    log_file: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    mission_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    started_at: Option<String>,
}

pub(super) type Registry = HashMap<String, RegistryEntry>;

pub(super) async fn read_registry() -> Registry {
    match tokio::fs::read_to_string(REGISTRY_PATH).await {
        Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
        Err(_) => HashMap::new(),
    }
}

pub(super) async fn write_registry(registry: &Registry) {
    if let Ok(json) = serde_json::to_string_pretty(registry) {
        let _ = tokio::fs::write(REGISTRY_PATH, json).await;
    }
}

pub(super) async fn register_process(pid: u32, route: &AgentRoute, task: &str, log_file: &str, mission_id: &str) {
    let mut reg = read_registry().await;
    reg.insert(
        pid.to_string(),
        RegistryEntry {
            agent_id: route.agent_id.to_string(),
            agent_name: route.display_name.to_string(),
            emoji: route.emoji.to_string(),
            task: task.to_string(),
            log_file: log_file.to_string(),
            mission_id: Some(mission_id.to_string()),
            started_at: Some(chrono::Utc::now().to_rfc3339()),
        },
    );
    write_registry(&reg).await;
}

pub(super) async fn clean_registry_by_mission_id(mission_id: &str) {
    let mut reg = read_registry().await;
    let before = reg.len();
    reg.retain(|_, entry| entry.mission_id.as_deref() != Some(mission_id));
    if reg.len() != before {
        write_registry(&reg).await;
    }
}
