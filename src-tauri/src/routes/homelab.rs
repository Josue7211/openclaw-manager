use axum::{extract::State, routing::get, routing::post, Json, Router};
use base64::{engine::general_purpose, Engine as _};
use reqwest::Client;
use serde::{Deserialize, Deserializer, Serialize};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    OnceLock,
};
use tokio::process::Command;
use tracing::warn;

use crate::error::{success_json, AppError};
use crate::server::{AppState, RequireAuth};
use crate::supabase::SupabaseClient;

// ── Mock data (matches TypeScript MOCK_DATA) ────────────────────────────────

fn mock_proxmox() -> Value {
    json!({
        "nodes": [{
            "name": "pve",
            "status": "online",
            "cpu": 0.12,
            "mem_used": 32_000_000_000_u64,
            "mem_total": 51_539_607_552_u64,
            "uptime": 864_000
        }],
        "vms": [
            { "vmid": 100, "name": "media-vm",     "node": "pve", "status": "running", "cpu": 0.05, "mem": 4_294_967_296_u64, "maxmem": 25_769_803_776_u64, "kind": "qemu" },
            { "vmid": 400, "name": "nextcloud-vm", "node": "pve", "status": "running", "cpu": 0.02, "mem": 2_147_483_648_u64, "maxmem": 8_589_934_592_u64, "kind": "qemu" },
            { "vmid": 200, "name": "ai-gateway",  "node": "pve", "status": "running", "cpu": 0.08, "mem": 4_294_967_296_u64, "maxmem": 17_179_869_184_u64, "kind": "qemu" },
        ]
    })
}

fn mock_opnsense() -> Value {
    json!({
        "status": "online",
        "cpu": 0.08,
        "mem_used": 4_000_000_000_u64,
        "mem_total": 16_000_000_000_u64,
        "uptime": 1_296_000,
        "wan_in": "15.2 Mbps",
        "wan_out": "3.1 Mbps",
        "services": [
            { "id": "unbound", "name": "unbound", "description": "Unbound DNS", "running": true, "locked": false },
            { "id": "kea-dhcp4", "name": "kea-dhcp4", "description": "Kea DHCPv4", "running": true, "locked": false }
        ]
    })
}

// ── Serde types for Proxmox API responses ───────────────────────────────────

#[derive(Debug, Deserialize)]
struct ProxmoxResponse<T> {
    data: Option<T>,
}

fn deserialize_optional_u64_loose<'de, D>(deserializer: D) -> Result<Option<u64>, D::Error>
where
    D: Deserializer<'de>,
{
    let value = Option::<Value>::deserialize(deserializer)?;
    Ok(value.as_ref().and_then(value_as_u64))
}

#[derive(Debug, Deserialize)]
struct ProxmoxNodeRaw {
    node: Option<String>,
    status: Option<String>,
    cpu: Option<f64>,
    #[serde(default, deserialize_with = "deserialize_optional_u64_loose")]
    mem: Option<u64>,
    #[serde(default, deserialize_with = "deserialize_optional_u64_loose")]
    maxmem: Option<u64>,
    #[serde(default, deserialize_with = "deserialize_optional_u64_loose")]
    uptime: Option<u64>,
}

#[derive(Debug, Deserialize)]
struct ProxmoxResourceRaw {
    #[serde(rename = "type")]
    resource_type: Option<String>,
    name: Option<String>,
    #[serde(default, deserialize_with = "deserialize_optional_u64_loose")]
    vmid: Option<u64>,
    node: Option<String>,
    status: Option<String>,
    cpu: Option<f64>,
    #[serde(default, deserialize_with = "deserialize_optional_u64_loose")]
    mem: Option<u64>,
    #[serde(default, deserialize_with = "deserialize_optional_u64_loose")]
    maxmem: Option<u64>,
}

#[derive(Debug, Deserialize)]
struct ProxmoxSnapshotRaw {
    name: Option<String>,
    snapname: Option<String>,
    description: Option<String>,
    parent: Option<String>,
    #[serde(default, deserialize_with = "deserialize_optional_u64_loose")]
    snaptime: Option<u64>,
    vmstate: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct ProxmoxStorageRaw {
    storage: Option<String>,
    #[serde(rename = "type")]
    storage_type: Option<String>,
    content: Option<String>,
    enabled: Option<Value>,
    active: Option<Value>,
    #[serde(default, deserialize_with = "deserialize_optional_u64_loose")]
    total: Option<u64>,
    #[serde(default, deserialize_with = "deserialize_optional_u64_loose")]
    used: Option<u64>,
    #[serde(default, deserialize_with = "deserialize_optional_u64_loose")]
    avail: Option<u64>,
    shared: Option<Value>,
}

#[derive(Debug, Deserialize)]
struct ProxmoxBackupRaw {
    volid: Option<String>,
    format: Option<String>,
    content: Option<String>,
    notes: Option<String>,
    subtype: Option<String>,
    protected: Option<Value>,
    #[serde(default, deserialize_with = "deserialize_optional_u64_loose")]
    size: Option<u64>,
    #[serde(default, deserialize_with = "deserialize_optional_u64_loose")]
    ctime: Option<u64>,
    #[serde(default, deserialize_with = "deserialize_optional_u64_loose")]
    vmid: Option<u64>,
}

#[derive(Debug, Deserialize)]
struct ProxmoxTaskRaw {
    upid: Option<String>,
    id: Option<String>,
    node: Option<String>,
    user: Option<String>,
    #[serde(rename = "type")]
    task_type: Option<String>,
    status: Option<String>,
    #[serde(default, deserialize_with = "deserialize_optional_u64_loose")]
    starttime: Option<u64>,
    #[serde(default, deserialize_with = "deserialize_optional_u64_loose")]
    endtime: Option<u64>,
}

#[derive(Debug, Deserialize)]
struct ProxmoxServiceRaw {
    id: Option<String>,
    name: Option<String>,
    desc: Option<String>,
    state: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ProxmoxHaResourceRaw {
    sid: Option<String>,
    #[serde(rename = "type")]
    resource_type: Option<String>,
    state: Option<String>,
    group: Option<String>,
    comment: Option<String>,
}

#[derive(Debug, Serialize)]
struct ProxmoxNode {
    name: String,
    status: String,
    cpu: f64,
    mem_used: u64,
    mem_total: u64,
    uptime: u64,
}

#[derive(Debug, Clone, Default, Serialize)]
struct ProxmoxStorage {
    node: String,
    name: String,
    storage_type: String,
    content: String,
    enabled: bool,
    active: bool,
    total: u64,
    used: u64,
    avail: u64,
    shared: bool,
}

#[derive(Debug, Default, Serialize)]
struct ProxmoxBackup {
    node: String,
    storage: String,
    volid: String,
    name: String,
    kind: String,
    vmid: Option<u64>,
    format: String,
    content: String,
    size: u64,
    ctime: u64,
    notes: String,
    protected: bool,
}

#[derive(Debug, Default, Serialize)]
struct ProxmoxTask {
    node: String,
    upid: String,
    id: String,
    user: String,
    task_type: String,
    status: String,
    starttime: u64,
    endtime: u64,
}

#[derive(Debug, Default, Serialize)]
struct ProxmoxService {
    node: String,
    id: String,
    name: String,
    description: String,
    state: String,
}

#[derive(Debug, Default, Serialize)]
struct ProxmoxHaResource {
    sid: String,
    resource_type: String,
    state: String,
    group: String,
    comment: String,
}

#[derive(Debug, Default, Serialize)]
struct ProxmoxDisk {
    key: String,
    value: String,
    storage: Option<String>,
    size: Option<String>,
}

#[derive(Debug, Default, Serialize)]
struct ProxmoxNetwork {
    key: String,
    value: String,
    bridge: Option<String>,
    model: Option<String>,
}

#[derive(Debug, Default, Serialize)]
struct ProxmoxSnapshot {
    name: String,
    description: Option<String>,
    parent: Option<String>,
    snaptime: Option<u64>,
    vmstate: bool,
}

#[derive(Debug, Serialize)]
struct ProxmoxVM {
    vmid: u64,
    name: String,
    node: String,
    status: String,
    cpu: f64,
    mem: u64,
    maxmem: u64,
    kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    config: Option<Value>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    disks: Vec<ProxmoxDisk>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    networks: Vec<ProxmoxNetwork>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    snapshots: Vec<ProxmoxSnapshot>,
    #[serde(skip_serializing_if = "Option::is_none")]
    firewall_options: Option<Value>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    firewall_rules: Vec<Value>,
}

// ── Serde types for OPNsense API responses ──────────────────────────────────

#[derive(Debug, Deserialize)]
struct OPNsenseSystemResources {
    memory: Option<OPNsenseMemory>,
}

#[derive(Debug, Deserialize)]
struct OPNsenseMemory {
    total: Option<String>,
    used: Option<String>,
}

#[derive(Debug, Deserialize)]
struct OPNsenseSystemTime {
    uptime: Option<String>,
    loadavg: Option<String>,
}

#[derive(Debug, Deserialize)]
struct OPNsenseInterfaceStats {
    statistics: Option<serde_json::Map<String, Value>>,
}

#[derive(Debug, Default, Serialize)]
struct OPNsenseService {
    id: String,
    name: String,
    description: String,
    running: bool,
    locked: bool,
}

#[derive(Debug, Deserialize)]
struct OPNsenseServiceSearch {
    rows: Option<Vec<OPNsenseServiceRaw>>,
}

#[derive(Debug, Deserialize)]
struct OPNsenseServiceRaw {
    id: Option<String>,
    name: Option<String>,
    description: Option<String>,
    running: Option<Value>,
    locked: Option<Value>,
}

#[derive(Debug, Deserialize)]
struct HomelabConfigInput {
    proxmox_host: Option<String>,
    proxmox_token_id: Option<String>,
    proxmox_token_secret: Option<String>,
    opnsense_host: Option<String>,
    opnsense_key: Option<String>,
    opnsense_secret: Option<String>,
    portainer_instances: Option<Vec<PortainerConfigInput>>,
}

#[derive(Debug, Deserialize)]
struct HomelabControlInput {
    provider: String,
    #[serde(default, rename = "instanceId")]
    instance_id: Option<String>,
    #[serde(rename = "resourceType")]
    resource_type: String,
    #[serde(rename = "resourceId")]
    resource_id: String,
    action: String,
    #[serde(default)]
    args: Value,
    #[serde(default)]
    confirmation: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
struct PortainerConfigInput {
    id: Option<String>,
    name: String,
    url: String,
    token: Option<String>,
}

#[derive(Debug, Clone)]
struct PortainerInstanceConfig {
    id: String,
    name: String,
    url: String,
    token: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
struct DockerHostConfigInput {
    id: Option<String>,
    name: String,
    host: String,
}

#[derive(Debug, Clone)]
struct DockerHostConfig {
    id: String,
    name: String,
    host: String,
}

#[derive(Debug, Deserialize)]
struct PortainerEndpoint {
    #[serde(rename = "Id")]
    id: i64,
    #[serde(rename = "Name")]
    name: String,
    #[serde(rename = "URL")]
    url: Option<String>,
    #[serde(rename = "Status")]
    status: Option<i64>,
}

#[derive(Debug, Deserialize)]
struct PortainerStack {
    #[serde(rename = "Id")]
    id: i64,
    #[serde(rename = "Name")]
    name: String,
    #[serde(rename = "Type")]
    stack_type: Option<i64>,
    #[serde(rename = "EndpointId")]
    endpoint_id: Option<i64>,
}

#[derive(Debug, Serialize)]
struct DockerContainer {
    id: String,
    name: String,
    image: String,
    status: String,
    state: String,
    ports: String,
    endpoint_id: Option<i64>,
    endpoint_name: Option<String>,
    instance_id: Option<String>,
    host_id: Option<String>,
    host_name: Option<String>,
    provider: String,
}

struct HomelabSystemDefinition {
    id: &'static str,
    name: &'static str,
    keys: &'static [&'static str],
}

struct ProxmoxApiCredentials {
    url: String,
    token_id: String,
    token_secret: String,
    origin: &'static str,
}

struct OPNsenseApiCredentials {
    url: String,
    key: String,
    secret: String,
    origin: &'static str,
}

// ── Insecure reqwest client (for self-signed TLS) ───────────────────────────

fn insecure_client() -> &'static Client {
    static CLIENT: OnceLock<Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        Client::builder()
            .danger_accept_invalid_certs(true)
            .timeout(std::time::Duration::from_secs(10))
            .build()
            .expect("failed to build insecure reqwest client")
    })
}

static HOMELAB_KEYCHAIN_DISABLED: AtomicBool = AtomicBool::new(false);

fn homelab_env_path() -> PathBuf {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    manifest_dir
        .parent()
        .map(|parent| parent.join(".env.local"))
        .unwrap_or_else(|| PathBuf::from(".env.local"))
}

fn homelab_env_values() -> HashMap<String, String> {
    let mut values = HashMap::new();
    let allowed = [
        "PROXMOX_HOST",
        "PROXMOX_TOKEN_ID",
        "PROXMOX_TOKEN_SECRET",
        "OPNSENSE_HOST",
        "OPNSENSE_URL",
        "OPNSENSE_API_KEY",
        "OPNSENSE_KEY",
        "OPNSENSE_API_SECRET",
        "OPNSENSE_SECRET",
        "PORTAINER_INSTANCES",
        "HOMELAB_DOCKER_HOSTS",
    ];

    let mut paths = vec![homelab_env_path()];
    if let Ok(cwd) = std::env::current_dir() {
        paths.push(cwd.join(".env.local"));
        paths.push(cwd.join("../.env.local"));
    }
    paths.dedup();

    for path in paths {
        if !path.is_file() {
            continue;
        }

        if let Ok(contents) = std::fs::read_to_string(&path) {
            for line in contents.lines() {
                let trimmed = line.trim();
                if trimmed.is_empty() || trimmed.starts_with('#') {
                    continue;
                }
                let Some((key, value)) = trimmed.split_once('=') else {
                    continue;
                };
                let key = key.trim();
                let value = value.trim();
                if allowed.contains(&key) && !value.is_empty() {
                    values.insert(key.to_string(), value.to_string());
                }
            }
        }

        if let Ok(iter) = dotenvy::from_path_iter(path) {
            for item in iter.flatten() {
                let (key, value) = item;
                if allowed.contains(&key.as_str()) && !value.trim().is_empty() {
                    values.insert(key, value);
                }
            }
        }
    }

    values
}

#[cfg(test)]
fn parse_homelab_env_contents(contents: &str) -> HashMap<String, String> {
    let allowed = [
        "PROXMOX_HOST",
        "PROXMOX_TOKEN_ID",
        "PROXMOX_TOKEN_SECRET",
        "OPNSENSE_HOST",
        "OPNSENSE_URL",
        "OPNSENSE_API_KEY",
        "OPNSENSE_KEY",
        "OPNSENSE_API_SECRET",
        "OPNSENSE_SECRET",
        "PORTAINER_INSTANCES",
        "HOMELAB_DOCKER_HOSTS",
    ];
    let mut values = HashMap::new();
    for line in contents.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        let Some((key, value)) = trimmed.split_once('=') else {
            continue;
        };
        let key = key.trim();
        let value = value.trim();
        if allowed.contains(&key) && !value.is_empty() {
            values.insert(key.to_string(), value.to_string());
        }
    }
    values
}

#[cfg(test)]
mod homelab_env_tests {
    use super::*;

    #[test]
    fn parses_unquoted_portainer_json_from_env_local() {
        let values = parse_homelab_env_contents(
            r#"PORTAINER_INSTANCES=[{"id":"services-vm-portainer","name":"Services VM Portainer","url":"https://100.124.53.97:9443","token":"ptr_example/with+chars="}]"#,
        );
        let parsed = parse_portainer_instances(
            values
                .get("PORTAINER_INSTANCES")
                .expect("PORTAINER_INSTANCES"),
        )
        .expect("valid portainer json");
        assert_eq!(parsed.len(), 1);
        assert_eq!(parsed[0].id, "services-vm-portainer");
        assert_eq!(parsed[0].url, "https://100.124.53.97:9443");
    }
}

fn push_unique_proxmox_config(
    configs: &mut Vec<ProxmoxApiCredentials>,
    config: ProxmoxApiCredentials,
) {
    if config.url.is_empty() || config.token_id.is_empty() || config.token_secret.is_empty() {
        return;
    }
    if configs.iter().any(|existing| {
        existing.url == config.url
            && existing.token_id == config.token_id
            && existing.token_secret == config.token_secret
    }) {
        return;
    }
    configs.push(config);
}

fn push_unique_opnsense_config(
    configs: &mut Vec<OPNsenseApiCredentials>,
    config: OPNsenseApiCredentials,
) {
    if config.url.is_empty() || config.key.is_empty() || config.secret.is_empty() {
        return;
    }
    if configs.iter().any(|existing| {
        existing.url == config.url && existing.key == config.key && existing.secret == config.secret
    }) {
        return;
    }
    configs.push(config);
}

fn persist_homelab_env_value(env_key: &str, value: &str) -> Result<(), AppError> {
    if value.contains('\n') || value.contains('\r') {
        return Err(AppError::BadRequest(format!(
            "{env_key} cannot contain newlines"
        )));
    }

    let path = homelab_env_path();
    let existing = std::fs::read_to_string(&path).unwrap_or_default();
    let mut lines = Vec::new();
    let mut updated = false;

    for line in existing.lines() {
        let Some((key, _)) = line.split_once('=') else {
            lines.push(line.to_string());
            continue;
        };
        if key.trim() == env_key {
            if !updated {
                lines.push(format!("{env_key}={value}"));
                updated = true;
            }
        } else {
            lines.push(line.to_string());
        }
    }

    if !updated {
        lines.push(format!("{env_key}={value}"));
    }

    std::fs::write(&path, format!("{}\n", lines.join("\n"))).map_err(|e| {
        AppError::Internal(anyhow::anyhow!(
            "failed to persist homelab fallback config: {e}"
        ))
    })?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600));
    }

    Ok(())
}

fn normalize_base_url(raw: &str) -> String {
    raw.trim().trim_end_matches('/').to_string()
}

// ── Proxmox fetcher ─────────────────────────────────────────────────────────

fn proxmox_api_configs(state: &AppState) -> Vec<ProxmoxApiCredentials> {
    let mut configs = Vec::new();
    push_unique_proxmox_config(
        &mut configs,
        ProxmoxApiCredentials {
            url: normalize_base_url(&state.secret_or_default("PROXMOX_HOST")),
            token_id: state.secret_or_default("PROXMOX_TOKEN_ID"),
            token_secret: state.secret_or_default("PROXMOX_TOKEN_SECRET"),
            origin: "runtime",
        },
    );

    let env = homelab_env_values();
    push_unique_proxmox_config(
        &mut configs,
        ProxmoxApiCredentials {
            url: normalize_base_url(env.get("PROXMOX_HOST").map(String::as_str).unwrap_or("")),
            token_id: env.get("PROXMOX_TOKEN_ID").cloned().unwrap_or_default(),
            token_secret: env.get("PROXMOX_TOKEN_SECRET").cloned().unwrap_or_default(),
            origin: "env-local",
        },
    );
    configs
}

async fn fetch_proxmox(state: &AppState) -> Option<Value> {
    let configs = proxmox_api_configs(state);
    if configs.is_empty() {
        if secret_is_set(state, "PROXMOX_TOKEN_ID") || secret_is_set(state, "PROXMOX_TOKEN_SECRET")
        {
            warn!("Proxmox credentials are set but PROXMOX_HOST is not configured");
        }
        return fetch_proxmox_ssh().await;
    }

    for config in configs {
        if let Some(value) = fetch_proxmox_api(&config).await {
            return Some(value);
        }
    }

    fetch_proxmox_ssh().await
}

async fn fetch_proxmox_api(config: &ProxmoxApiCredentials) -> Option<Value> {
    let client = insecure_client();
    let auth_header = format!("PVEAPIToken={}={}", config.token_id, config.token_secret);

    // ── Fetch nodes ─────────────────────────────────────────────────────
    let nodes_res = client
        .get(format!("{}/api2/json/nodes", config.url))
        .header("Authorization", &auth_header)
        .send()
        .await
        .ok()?;

    if !nodes_res.status().is_success() {
        warn!(
            source = config.origin,
            status = %nodes_res.status(),
            "Proxmox nodes endpoint returned non-success"
        );
        return None;
    }

    let nodes_data: ProxmoxResponse<Vec<ProxmoxNodeRaw>> = nodes_res.json().await.ok()?;
    let raw_nodes = nodes_data.data.unwrap_or_default();

    let nodes: Vec<ProxmoxNode> = raw_nodes
        .iter()
        .map(|n| ProxmoxNode {
            name: n.node.clone().unwrap_or_default(),
            status: n.status.clone().unwrap_or_default(),
            cpu: n.cpu.unwrap_or(0.0),
            mem_used: n.mem.unwrap_or(0),
            mem_total: n.maxmem.unwrap_or(0),
            uptime: n.uptime.unwrap_or(0),
        })
        .collect();

    // ── Fetch VMs via cluster/resources?type=vm ─────────────────────────
    let mut vms: Vec<ProxmoxVM> = Vec::new();

    if let Ok(res) = client
        .get(format!(
            "{}/api2/json/cluster/resources?type=vm",
            config.url
        ))
        .header("Authorization", &auth_header)
        .send()
        .await
    {
        if res.status().is_success() {
            if let Ok(data) = res.json::<ProxmoxResponse<Vec<ProxmoxResourceRaw>>>().await {
                vms = data
                    .data
                    .unwrap_or_default()
                    .into_iter()
                    .filter(|r| matches!(r.resource_type.as_deref(), Some("qemu") | Some("lxc")))
                    .map(|r| to_vm(&r))
                    .collect();
            }
        }
    }

    // ── Per-node qemu + lxc queries fill node/kind gaps from cluster/resources.
    if !nodes.is_empty() && (vms.is_empty() || vms.iter().any(|vm| vm.node.is_empty())) {
        let node_vms = fetch_all_node_vms(&client, &config.url, &auth_header, &nodes).await;
        if vms.is_empty() {
            vms = node_vms;
        } else {
            merge_proxmox_node_details(&mut vms, node_vms);
        }
    }
    enrich_proxmox_vms(&client, &config.url, &auth_header, &mut vms).await;
    let (storage, backups, tasks, services) =
        fetch_proxmox_node_inventory(&client, &config.url, &auth_header, &nodes).await;
    let ha_resources = fetch_proxmox_ha_resources(&client, &config.url, &auth_header).await;

    Some(json!({
        "nodes": nodes,
        "vms": vms,
        "storage": storage,
        "backups": backups,
        "tasks": tasks,
        "services": services,
        "ha_resources": ha_resources,
        "source": "api",
    }))
}

async fn ssh_output(host: &str, command: &str) -> Option<String> {
    let output = tokio::time::timeout(
        std::time::Duration::from_secs(8),
        Command::new("ssh")
            .arg("-o")
            .arg("BatchMode=yes")
            .arg("-o")
            .arg("ConnectTimeout=6")
            .arg(host)
            .arg(command)
            .output(),
    )
    .await
    .ok()?
    .ok()?;

    if !output.status.success() {
        return None;
    }

    String::from_utf8(output.stdout).ok()
}

async fn fetch_proxmox_ssh() -> Option<Value> {
    let nodes_raw = ssh_output("proxmox", "pvesh get /nodes --output-format json").await?;
    let resources_raw = ssh_output(
        "proxmox",
        "pvesh get /cluster/resources --type vm --output-format json",
    )
    .await
    .unwrap_or_else(|| "[]".to_string());

    let raw_nodes: Vec<ProxmoxNodeRaw> = serde_json::from_str(&nodes_raw).ok()?;
    let raw_resources: Vec<ProxmoxResourceRaw> =
        serde_json::from_str(&resources_raw).unwrap_or_default();

    let nodes: Vec<ProxmoxNode> = raw_nodes
        .iter()
        .map(|n| ProxmoxNode {
            name: n.node.clone().unwrap_or_default(),
            status: n.status.clone().unwrap_or_default(),
            cpu: n.cpu.unwrap_or(0.0),
            mem_used: n.mem.unwrap_or(0),
            mem_total: n.maxmem.unwrap_or(0),
            uptime: n.uptime.unwrap_or(0),
        })
        .collect();

    let vms: Vec<ProxmoxVM> = raw_resources
        .into_iter()
        .filter(|r| matches!(r.resource_type.as_deref(), Some("qemu") | Some("lxc")))
        .map(|r| to_vm(&r))
        .collect();

    Some(json!({
        "nodes": nodes,
        "vms": vms,
        "storage": [],
        "backups": [],
        "tasks": [],
        "services": [],
        "ha_resources": [],
        "source": "ssh",
    }))
}

fn to_vm(r: &ProxmoxResourceRaw) -> ProxmoxVM {
    ProxmoxVM {
        vmid: r.vmid.unwrap_or(0),
        name: r
            .name
            .clone()
            .unwrap_or_else(|| format!("VM {}", r.vmid.unwrap_or(0))),
        node: r.node.clone().unwrap_or_default(),
        status: r.status.clone().unwrap_or_default(),
        cpu: r.cpu.unwrap_or(0.0),
        mem: r.mem.unwrap_or(0),
        maxmem: r.maxmem.unwrap_or(0),
        kind: r
            .resource_type
            .clone()
            .unwrap_or_else(|| "qemu".to_string()),
        config: None,
        disks: Vec::new(),
        networks: Vec::new(),
        snapshots: Vec::new(),
        firewall_options: None,
        firewall_rules: Vec::new(),
    }
}

async fn enrich_proxmox_vms(
    client: &Client,
    base_url: &str,
    auth_header: &str,
    vms: &mut Vec<ProxmoxVM>,
) {
    for vm in vms.iter_mut() {
        if vm.node.is_empty() || vm.vmid == 0 {
            continue;
        }
        let node = urlencoding::encode(&vm.node);
        let kind = urlencoding::encode(&vm.kind);
        let config_url = format!(
            "{base_url}/api2/json/nodes/{node}/{kind}/{}/config",
            vm.vmid
        );
        let snapshots_url = format!(
            "{base_url}/api2/json/nodes/{node}/{kind}/{}/snapshot",
            vm.vmid
        );
        let firewall_url = format!(
            "{base_url}/api2/json/nodes/{node}/{kind}/{}/firewall/options",
            vm.vmid
        );
        let firewall_rules_url = format!(
            "{base_url}/api2/json/nodes/{node}/{kind}/{}/firewall/rules",
            vm.vmid
        );

        let (config, snapshots, firewall_options, firewall_rules) = tokio::join!(
            fetch_proxmox_vm_config(client, &config_url, auth_header),
            fetch_proxmox_vm_snapshots(client, &snapshots_url, auth_header),
            fetch_proxmox_vm_config(client, &firewall_url, auth_header),
            fetch_proxmox_vm_value_list(client, &firewall_rules_url, auth_header)
        );
        if let Some(config) = config {
            let (disks, networks) = proxmox_config_inventory(&config);
            vm.config = Some(config);
            vm.disks = disks;
            vm.networks = networks;
        }
        vm.snapshots = snapshots;
        vm.firewall_options = firewall_options;
        vm.firewall_rules = firewall_rules;
    }
}

async fn fetch_proxmox_vm_config(client: &Client, url: &str, auth_header: &str) -> Option<Value> {
    let res = client
        .get(url)
        .header("Authorization", auth_header)
        .send()
        .await
        .ok()?;
    if !res.status().is_success() {
        return None;
    }
    res.json::<ProxmoxResponse<Value>>().await.ok()?.data
}

async fn fetch_proxmox_vm_snapshots(
    client: &Client,
    url: &str,
    auth_header: &str,
) -> Vec<ProxmoxSnapshot> {
    let res = match client
        .get(url)
        .header("Authorization", auth_header)
        .send()
        .await
    {
        Ok(res) if res.status().is_success() => res,
        _ => return Vec::new(),
    };
    match res.json::<ProxmoxResponse<Vec<ProxmoxSnapshotRaw>>>().await {
        Ok(data) => data
            .data
            .unwrap_or_default()
            .into_iter()
            .filter_map(|snapshot| {
                let name = snapshot.snapname.or(snapshot.name)?;
                if name == "current" {
                    return None;
                }
                Some(ProxmoxSnapshot {
                    name,
                    description: snapshot.description,
                    parent: snapshot.parent,
                    snaptime: snapshot.snaptime,
                    vmstate: snapshot.vmstate.unwrap_or(false),
                })
            })
            .collect(),
        Err(_) => Vec::new(),
    }
}

async fn fetch_proxmox_vm_value_list(client: &Client, url: &str, auth_header: &str) -> Vec<Value> {
    let res = match client
        .get(url)
        .header("Authorization", auth_header)
        .send()
        .await
    {
        Ok(res) if res.status().is_success() => res,
        _ => return Vec::new(),
    };
    res.json::<ProxmoxResponse<Vec<Value>>>()
        .await
        .ok()
        .and_then(|data| data.data)
        .unwrap_or_default()
}

fn proxmox_config_inventory(config: &Value) -> (Vec<ProxmoxDisk>, Vec<ProxmoxNetwork>) {
    let mut disks = Vec::new();
    let mut networks = Vec::new();
    let Some(map) = config.as_object() else {
        return (disks, networks);
    };

    let mut entries: Vec<_> = map.iter().collect();
    entries.sort_by(|(left, _), (right, _)| left.cmp(right));
    for (key, value) in entries {
        let Some(raw_value) = proxmox_config_string(value) else {
            continue;
        };
        if is_proxmox_disk_key(key) {
            disks.push(ProxmoxDisk {
                key: key.to_string(),
                storage: proxmox_storage_name(&raw_value),
                size: proxmox_config_option(&raw_value, "size"),
                value: raw_value,
            });
        } else if is_proxmox_network_key(key) {
            networks.push(ProxmoxNetwork {
                key: key.to_string(),
                model: raw_value.split(',').next().map(str::to_string),
                bridge: proxmox_config_option(&raw_value, "bridge"),
                value: raw_value,
            });
        }
    }
    (disks, networks)
}

fn proxmox_config_string(value: &Value) -> Option<String> {
    if let Some(s) = value.as_str() {
        return Some(s.to_string());
    }
    if value.is_number() || value.is_boolean() {
        return Some(value.to_string());
    }
    None
}

fn is_proxmox_disk_key(key: &str) -> bool {
    key == "rootfs"
        || key.starts_with("scsi")
        || key.starts_with("sata")
        || key.starts_with("virtio")
        || key.starts_with("ide")
        || key.starts_with("mp")
        || key.starts_with("unused")
        || key.starts_with("efidisk")
        || key.starts_with("tpmstate")
}

fn is_proxmox_network_key(key: &str) -> bool {
    key.starts_with("net")
}

fn proxmox_storage_name(value: &str) -> Option<String> {
    let first = value.split(',').next()?.trim();
    let (storage, _) = first.split_once(':')?;
    if storage.is_empty() {
        None
    } else {
        Some(storage.to_string())
    }
}

fn proxmox_config_option(value: &str, option: &str) -> Option<String> {
    let prefix = format!("{option}=");
    value.split(',').find_map(|part| {
        let part = part.trim();
        part.strip_prefix(&prefix).map(str::to_string)
    })
}

async fn fetch_proxmox_node_inventory(
    client: &Client,
    base_url: &str,
    auth_header: &str,
    nodes: &[ProxmoxNode],
) -> (
    Vec<ProxmoxStorage>,
    Vec<ProxmoxBackup>,
    Vec<ProxmoxTask>,
    Vec<ProxmoxService>,
) {
    let mut storage = Vec::new();
    let mut backups = Vec::new();
    let mut tasks = Vec::new();
    let mut services = Vec::new();
    for node in nodes {
        if node.name.is_empty() {
            continue;
        }
        let node_name = node.name.clone();
        let encoded_node = urlencoding::encode(&node_name);
        let storage_url = format!("{base_url}/api2/json/nodes/{encoded_node}/storage");
        let tasks_url = format!("{base_url}/api2/json/nodes/{encoded_node}/tasks?limit=20");
        let services_url = format!("{base_url}/api2/json/nodes/{encoded_node}/services");
        let (node_storage, node_tasks, node_services) = tokio::join!(
            fetch_proxmox_node_storage(client, &storage_url, auth_header, &node_name),
            fetch_proxmox_node_tasks(client, &tasks_url, auth_header, &node_name),
            fetch_proxmox_node_services(client, &services_url, auth_header, &node_name)
        );
        storage.extend(node_storage);
        let backup_stores = storage
            .iter()
            .filter(|item| {
                item.node == node_name
                    && item.enabled
                    && item.active
                    && item
                        .content
                        .split(',')
                        .any(|content| content.trim().eq_ignore_ascii_case("backup"))
            })
            .cloned()
            .collect::<Vec<_>>();
        backups.extend(
            fetch_proxmox_node_backups(client, base_url, auth_header, &node_name, &backup_stores)
                .await,
        );
        tasks.extend(node_tasks);
        services.extend(node_services);
    }
    backups.sort_by(|left, right| right.ctime.cmp(&left.ctime));
    tasks.sort_by(|left, right| right.starttime.cmp(&left.starttime));
    tasks.truncate(40);
    (storage, backups, tasks, services)
}

async fn fetch_proxmox_node_storage(
    client: &Client,
    url: &str,
    auth_header: &str,
    node: &str,
) -> Vec<ProxmoxStorage> {
    let res = match client
        .get(url)
        .header("Authorization", auth_header)
        .send()
        .await
    {
        Ok(res) if res.status().is_success() => res,
        _ => return Vec::new(),
    };
    match res.json::<ProxmoxResponse<Vec<ProxmoxStorageRaw>>>().await {
        Ok(data) => data
            .data
            .unwrap_or_default()
            .into_iter()
            .filter_map(|raw| to_proxmox_storage(node, raw))
            .collect(),
        Err(_) => Vec::new(),
    }
}

async fn fetch_proxmox_node_backups(
    client: &Client,
    base_url: &str,
    auth_header: &str,
    node: &str,
    stores: &[ProxmoxStorage],
) -> Vec<ProxmoxBackup> {
    let mut backups = Vec::new();
    for store in stores {
        let encoded_node = urlencoding::encode(node);
        let encoded_storage = urlencoding::encode(&store.name);
        let url = format!(
            "{base_url}/api2/json/nodes/{encoded_node}/storage/{encoded_storage}/content?content=backup"
        );
        let res = match client
            .get(url)
            .header("Authorization", auth_header)
            .send()
            .await
        {
            Ok(res) if res.status().is_success() => res,
            _ => continue,
        };
        if let Ok(data) = res.json::<ProxmoxResponse<Vec<ProxmoxBackupRaw>>>().await {
            backups.extend(
                data.data
                    .unwrap_or_default()
                    .into_iter()
                    .filter_map(|raw| to_proxmox_backup(node, &store.name, raw)),
            );
        }
    }
    backups
}

async fn fetch_proxmox_node_tasks(
    client: &Client,
    url: &str,
    auth_header: &str,
    node: &str,
) -> Vec<ProxmoxTask> {
    let res = match client
        .get(url)
        .header("Authorization", auth_header)
        .send()
        .await
    {
        Ok(res) if res.status().is_success() => res,
        _ => return Vec::new(),
    };
    match res.json::<ProxmoxResponse<Vec<ProxmoxTaskRaw>>>().await {
        Ok(data) => data
            .data
            .unwrap_or_default()
            .into_iter()
            .filter_map(|raw| to_proxmox_task(node, raw))
            .collect(),
        Err(_) => Vec::new(),
    }
}

async fn fetch_proxmox_node_services(
    client: &Client,
    url: &str,
    auth_header: &str,
    node: &str,
) -> Vec<ProxmoxService> {
    let res = match client
        .get(url)
        .header("Authorization", auth_header)
        .send()
        .await
    {
        Ok(res) if res.status().is_success() => res,
        _ => return Vec::new(),
    };
    match res.json::<ProxmoxResponse<Vec<ProxmoxServiceRaw>>>().await {
        Ok(data) => data
            .data
            .unwrap_or_default()
            .into_iter()
            .filter_map(|raw| to_proxmox_service(node, raw))
            .collect(),
        Err(_) => Vec::new(),
    }
}

async fn fetch_proxmox_ha_resources(
    client: &Client,
    base_url: &str,
    auth_header: &str,
) -> Vec<ProxmoxHaResource> {
    let res = match client
        .get(format!("{base_url}/api2/json/cluster/ha/resources"))
        .header("Authorization", auth_header)
        .send()
        .await
    {
        Ok(res) if res.status().is_success() => res,
        _ => return Vec::new(),
    };
    match res
        .json::<ProxmoxResponse<Vec<ProxmoxHaResourceRaw>>>()
        .await
    {
        Ok(data) => data
            .data
            .unwrap_or_default()
            .into_iter()
            .filter_map(to_proxmox_ha_resource)
            .collect(),
        Err(_) => Vec::new(),
    }
}

fn to_proxmox_storage(node: &str, raw: ProxmoxStorageRaw) -> Option<ProxmoxStorage> {
    let name = raw.storage?;
    Some(ProxmoxStorage {
        node: node.to_string(),
        name,
        storage_type: raw.storage_type.unwrap_or_default(),
        content: raw.content.unwrap_or_default(),
        enabled: proxmox_flag(raw.enabled.as_ref()),
        active: proxmox_flag(raw.active.as_ref()),
        total: raw.total.unwrap_or(0),
        used: raw.used.unwrap_or(0),
        avail: raw.avail.unwrap_or(0),
        shared: proxmox_flag(raw.shared.as_ref()),
    })
}

fn to_proxmox_backup(node: &str, storage: &str, raw: ProxmoxBackupRaw) -> Option<ProxmoxBackup> {
    let volid = raw.volid?;
    let name = proxmox_backup_name(&volid);
    let parsed_kind = proxmox_backup_kind(&volid)
        .or(raw.subtype)
        .unwrap_or_else(|| "backup".into());
    Some(ProxmoxBackup {
        node: node.to_string(),
        storage: storage.to_string(),
        vmid: raw.vmid.or_else(|| proxmox_backup_vmid(&volid)),
        kind: parsed_kind,
        format: raw.format.unwrap_or_default(),
        content: raw.content.unwrap_or_default(),
        size: raw.size.unwrap_or(0),
        ctime: raw.ctime.unwrap_or(0),
        notes: raw.notes.unwrap_or_default(),
        protected: proxmox_flag(raw.protected.as_ref()),
        name,
        volid,
    })
}

fn proxmox_backup_name(volid: &str) -> String {
    volid
        .rsplit('/')
        .next()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or(volid)
        .to_string()
}

fn proxmox_backup_kind(volid: &str) -> Option<String> {
    let name = proxmox_backup_name(volid);
    if name.contains("vzdump-qemu-") {
        Some("qemu".into())
    } else if name.contains("vzdump-lxc-") {
        Some("lxc".into())
    } else {
        None
    }
}

fn proxmox_backup_vmid(volid: &str) -> Option<u64> {
    let name = proxmox_backup_name(volid);
    let marker = if name.contains("vzdump-qemu-") {
        "vzdump-qemu-"
    } else if name.contains("vzdump-lxc-") {
        "vzdump-lxc-"
    } else {
        return None;
    };
    let rest = name.split_once(marker)?.1;
    let digits = rest
        .chars()
        .take_while(|ch| ch.is_ascii_digit())
        .collect::<String>();
    digits.parse::<u64>().ok()
}

fn proxmox_flag(value: Option<&Value>) -> bool {
    match value {
        Some(Value::Bool(flag)) => *flag,
        Some(Value::Number(number)) => number.as_u64().unwrap_or(0) != 0,
        Some(Value::String(text)) => matches!(text.as_str(), "1" | "true" | "yes" | "on"),
        _ => false,
    }
}

fn to_proxmox_task(node: &str, raw: ProxmoxTaskRaw) -> Option<ProxmoxTask> {
    let upid = raw.upid?;
    Some(ProxmoxTask {
        node: raw.node.unwrap_or_else(|| node.to_string()),
        id: raw.id.unwrap_or_default(),
        user: raw.user.unwrap_or_default(),
        task_type: raw.task_type.unwrap_or_default(),
        status: raw.status.unwrap_or_else(|| "running".into()),
        starttime: raw.starttime.unwrap_or(0),
        endtime: raw.endtime.unwrap_or(0),
        upid,
    })
}

fn to_proxmox_service(node: &str, raw: ProxmoxServiceRaw) -> Option<ProxmoxService> {
    let id = raw.id.or(raw.name.clone())?;
    Some(ProxmoxService {
        node: node.to_string(),
        name: raw.name.unwrap_or_else(|| id.clone()),
        description: raw.desc.unwrap_or_default(),
        state: raw.state.unwrap_or_else(|| "unknown".into()),
        id,
    })
}

fn to_proxmox_ha_resource(raw: ProxmoxHaResourceRaw) -> Option<ProxmoxHaResource> {
    let sid = raw.sid?;
    Some(ProxmoxHaResource {
        sid,
        resource_type: raw.resource_type.unwrap_or_default(),
        state: raw.state.unwrap_or_else(|| "unknown".into()),
        group: raw.group.unwrap_or_default(),
        comment: raw.comment.unwrap_or_default(),
    })
}

async fn fetch_node_vms(
    client: &Client,
    base_url: &str,
    auth_header: &str,
    node_name: &str,
    vm_type: &str,
) -> Vec<ProxmoxVM> {
    let res = match client
        .get(format!("{base_url}/api2/json/nodes/{node_name}/{vm_type}"))
        .header("Authorization", auth_header)
        .send()
        .await
    {
        Ok(r) if r.status().is_success() => r,
        _ => return Vec::new(),
    };

    match res.json::<ProxmoxResponse<Vec<ProxmoxResourceRaw>>>().await {
        Ok(data) => data
            .data
            .unwrap_or_default()
            .into_iter()
            .map(|mut r| {
                if r.resource_type.is_none() {
                    r.resource_type = Some(vm_type.to_string());
                }
                to_vm(&r)
            })
            .collect(),
        Err(_) => Vec::new(),
    }
}

async fn fetch_all_node_vms(
    client: &Client,
    base_url: &str,
    auth_header: &str,
    nodes: &[ProxmoxNode],
) -> Vec<ProxmoxVM> {
    let mut futures = Vec::new();
    for node in nodes {
        let node_name = node.name.clone();
        let url = base_url.to_string();
        let auth = auth_header.to_string();

        let client_q = (*client).clone();
        let url_q = url.clone();
        let auth_q = auth.clone();
        let name_q = node_name.clone();
        futures.push(tokio::spawn(async move {
            fetch_node_vms(&client_q, &url_q, &auth_q, &name_q, "qemu").await
        }));

        let client_lxc = (*client).clone();
        futures.push(tokio::spawn(async move {
            fetch_node_vms(&client_lxc, &url, &auth, &node_name, "lxc").await
        }));
    }

    let mut vms = Vec::new();
    for handle in futures {
        if let Ok(result) = handle.await {
            vms.extend(result);
        }
    }
    vms
}

fn merge_proxmox_node_details(vms: &mut Vec<ProxmoxVM>, node_vms: Vec<ProxmoxVM>) {
    for node_vm in node_vms {
        if let Some(vm) = vms.iter_mut().find(|vm| vm.vmid == node_vm.vmid) {
            if vm.node.is_empty() {
                vm.node = node_vm.node;
            }
            if vm.kind.is_empty() {
                vm.kind = node_vm.kind;
            }
            if vm.status.is_empty() {
                vm.status = node_vm.status;
            }
            if vm.name.starts_with("VM ") && !node_vm.name.starts_with("VM ") {
                vm.name = node_vm.name;
            }
            if vm.mem == 0 {
                vm.mem = node_vm.mem;
            }
            if vm.maxmem == 0 {
                vm.maxmem = node_vm.maxmem;
            }
        } else {
            vms.push(node_vm);
        }
    }
}

// ── OPNsense fetcher ────────────────────────────────────────────────────────

fn opnsense_api_configs(state: &AppState) -> Vec<OPNsenseApiCredentials> {
    let mut configs = Vec::new();
    push_unique_opnsense_config(
        &mut configs,
        OPNsenseApiCredentials {
            url: normalize_base_url(
                &state
                    .secret("OPNSENSE_HOST")
                    .or_else(|| state.secret("OPNSENSE_URL"))
                    .unwrap_or_default(),
            ),
            key: state
                .secret("OPNSENSE_API_KEY")
                .or_else(|| state.secret("OPNSENSE_KEY"))
                .unwrap_or_default(),
            secret: state
                .secret("OPNSENSE_API_SECRET")
                .or_else(|| state.secret("OPNSENSE_SECRET"))
                .unwrap_or_default(),
            origin: "runtime",
        },
    );

    let env = homelab_env_values();
    push_unique_opnsense_config(
        &mut configs,
        OPNsenseApiCredentials {
            url: normalize_base_url(
                env.get("OPNSENSE_HOST")
                    .or_else(|| env.get("OPNSENSE_URL"))
                    .map(String::as_str)
                    .unwrap_or(""),
            ),
            key: env
                .get("OPNSENSE_API_KEY")
                .or_else(|| env.get("OPNSENSE_KEY"))
                .cloned()
                .unwrap_or_default(),
            secret: env
                .get("OPNSENSE_API_SECRET")
                .or_else(|| env.get("OPNSENSE_SECRET"))
                .cloned()
                .unwrap_or_default(),
            origin: "env-local",
        },
    );
    configs
}

async fn fetch_opnsense(state: &AppState) -> Option<Value> {
    let configs = opnsense_api_configs(state);

    if configs.is_empty() {
        warn!("OPNSENSE_HOST is not configured");
        return fetch_opnsense_ssh().await;
    }

    for config in configs {
        if let Some(value) = fetch_opnsense_api(&config).await {
            return Some(value);
        }
    }

    fetch_opnsense_ssh().await
}

async fn fetch_opnsense_api(config: &OPNsenseApiCredentials) -> Option<Value> {
    let client = insecure_client();

    let sys_fut = opnsense_get_json(
        &client,
        &config.url,
        &config.key,
        &config.secret,
        &[
            "/api/diagnostics/system/system_resources",
            "/api/diagnostics/system/systemResources",
        ],
    );
    let time_fut = opnsense_get_json(
        &client,
        &config.url,
        &config.key,
        &config.secret,
        &[
            "/api/diagnostics/system/system_time",
            "/api/diagnostics/system/systemTime",
        ],
    );
    let iface_fut = opnsense_get_json(
        &client,
        &config.url,
        &config.key,
        &config.secret,
        &[
            "/api/diagnostics/interface/get_interface_statistics",
            "/api/diagnostics/interface/getInterfaceStatistics",
        ],
    );
    let traffic_fut = opnsense_get_json(
        &client,
        &config.url,
        &config.key,
        &config.secret,
        &["/api/diagnostics/traffic/_interface"],
    );
    let services_fut = opnsense_post_json(
        &client,
        &config.url,
        &config.key,
        &config.secret,
        "/api/core/service/search",
        json!({ "current": 1, "rowCount": 999, "sort": {}, "searchPhrase": "" }),
    );
    let interfaces_overview_fut = opnsense_get_json(
        &client,
        &config.url,
        &config.key,
        &config.secret,
        &["/api/interfaces/overview/interfaces_info"],
    );
    let gateway_status_fut = opnsense_get_json(
        &client,
        &config.url,
        &config.key,
        &config.secret,
        &["/api/routes/gateway/status"],
    );
    let dhcp_leases_fut = opnsense_get_json(
        &client,
        &config.url,
        &config.key,
        &config.secret,
        &["/api/dnsmasq/leases/search"],
    );
    let unbound_status_fut = opnsense_get_json(
        &client,
        &config.url,
        &config.key,
        &config.secret,
        &["/api/unbound/service/status"],
    );
    let unbound_totals_fut = opnsense_get_json(
        &client,
        &config.url,
        &config.key,
        &config.secret,
        &["/api/unbound/overview/totals/10"],
    );
    let firewall_rules_fut = opnsense_get_json(
        &client,
        &config.url,
        &config.key,
        &config.secret,
        &["/api/firewall/filter/search_rule"],
    );
    let firewall_aliases_fut = opnsense_get_json(
        &client,
        &config.url,
        &config.key,
        &config.secret,
        &["/api/firewall/alias/search_item"],
    );
    let openvpn_status_fut = opnsense_get_json(
        &client,
        &config.url,
        &config.key,
        &config.secret,
        &["/api/openvpn/service/status"],
    );
    let wireguard_status_fut = opnsense_get_json(
        &client,
        &config.url,
        &config.key,
        &config.secret,
        &["/api/wireguard/service/status"],
    );

    let (
        sys_res,
        time_res,
        iface_res,
        traffic_res,
        services_res,
        interfaces_overview_res,
        gateway_status_res,
        dhcp_leases_res,
        unbound_status_res,
        unbound_totals_res,
        firewall_rules_res,
        firewall_aliases_res,
        openvpn_status_res,
        wireguard_status_res,
    ) = tokio::join!(
        sys_fut,
        time_fut,
        iface_fut,
        traffic_fut,
        services_fut,
        interfaces_overview_fut,
        gateway_status_fut,
        dhcp_leases_fut,
        unbound_status_fut,
        unbound_totals_fut,
        firewall_rules_fut,
        firewall_aliases_fut,
        openvpn_status_fut,
        wireguard_status_fut,
    );

    if sys_res.is_none()
        && time_res.is_none()
        && iface_res.is_none()
        && traffic_res.is_none()
        && services_res.is_none()
    {
        warn!(
            source = config.origin,
            "OPNsense API credentials are configured but all diagnostics endpoints failed"
        );
        return None;
    }

    let mut cpu: f64 = 0.0;
    let mut mem_used: u64 = 0;
    let mut mem_total: u64 = 0;
    let mut uptime: u64 = 0;
    let mut wan_in = "N/A".to_string();
    let mut wan_out = "N/A".to_string();
    let services = services_res
        .as_ref()
        .map(parse_opnsense_services)
        .unwrap_or_default();

    // ── System resources (memory) ───────────────────────────────────────
    if let Some(d) = sys_res {
        if let Ok(resources) = serde_json::from_value::<OPNsenseSystemResources>(d.clone()) {
            if let Some(mem) = resources.memory {
                mem_total = mem.total.as_deref().and_then(parse_u64_loose).unwrap_or(0);
                mem_used = mem.used.as_deref().and_then(parse_u64_loose).unwrap_or(0);
            }
        }

        mem_total = mem_total.max(find_number_for_keys(
            &d,
            &["mem_total", "memory_total", "total"],
        ));
        mem_used = mem_used.max(find_number_for_keys(
            &d,
            &["mem_used", "memory_used", "used"],
        ));
    }

    // ── System time (uptime + CPU from load average) ────────────────────
    if let Some(d) = time_res {
        if let Ok(time) = serde_json::from_value::<OPNsenseSystemTime>(d.clone()) {
            if let Some(raw) = &time.uptime {
                uptime = parse_opnsense_uptime(raw);
            }
            if let Some(loadavg) = &time.loadavg {
                if let Some(first) = loadavg
                    .split_whitespace()
                    .next()
                    .or_else(|| loadavg.split(',').next())
                {
                    let cleaned: String = first
                        .chars()
                        .take_while(|c| *c == '.' || c.is_ascii_digit())
                        .collect();
                    if let Ok(load) = cleaned.parse::<f64>() {
                        cpu = (load / 4.0).min(1.0);
                    }
                }
            }
        }
        if uptime == 0 {
            uptime = find_number_for_keys(&d, &["uptime", "uptime_seconds"]);
        }
    }

    // ── Interface statistics (WAN bandwidth) ────────────────────────────
    if let Some(d) = traffic_res {
        if let Some((in_rate, out_rate)) = parse_wan_rates(&d) {
            wan_in = format_bitrate_human(in_rate);
            wan_out = format_bitrate_human(out_rate);
        }
    }

    if (wan_in == "N/A" || wan_out == "N/A") && iface_res.is_some() {
        if let Some(d) = iface_res {
            if let Ok(stats_resp) = serde_json::from_value::<OPNsenseInterfaceStats>(d.clone()) {
                if let Some(stats) = stats_resp.statistics {
                    if let Some((_, iface_val)) = find_wan_entry(&stats) {
                        let bytes_in = parse_stat_value(iface_val, "received-bytes");
                        let bytes_out = parse_stat_value(iface_val, "sent-bytes");
                        wan_in = format_bytes_human(bytes_in);
                        wan_out = format_bytes_human(bytes_out);
                    }
                }
            }
        }
    }

    Some(json!({
        "status": "online",
        "cpu": cpu,
        "mem_used": mem_used,
        "mem_total": mem_total,
        "uptime": uptime,
        "wan_in": wan_in,
        "wan_out": wan_out,
        "services": services,
        "interfaces": opnsense_rows(interfaces_overview_res.as_ref()),
        "gateways": gateway_status_res
            .as_ref()
            .and_then(|value| value.get("items"))
            .cloned()
            .unwrap_or_else(|| json!([])),
        "dhcp": {
            "leases": opnsense_rows(dhcp_leases_res.as_ref()),
            "total": opnsense_total(dhcp_leases_res.as_ref()),
            "interfaces": dhcp_leases_res
                .as_ref()
                .and_then(|value| value.get("interfaces"))
                .cloned()
                .unwrap_or_else(|| json!([])),
        },
        "dns": {
            "unbound_status": unbound_status_res
                .as_ref()
                .and_then(|value| value.get("status"))
                .cloned()
                .unwrap_or_else(|| json!("unknown")),
            "unbound_widget": unbound_status_res
                .as_ref()
                .and_then(|value| value.get("widget"))
                .cloned()
                .unwrap_or_else(|| json!({})),
            "unbound_totals": unbound_totals_res.unwrap_or_else(|| json!([])),
        },
        "firewall": {
            "rules": opnsense_rows(firewall_rules_res.as_ref()),
            "rule_total": opnsense_total(firewall_rules_res.as_ref()),
            "aliases": opnsense_rows(firewall_aliases_res.as_ref()),
            "alias_total": opnsense_total(firewall_aliases_res.as_ref()),
        },
        "vpn": {
            "openvpn": openvpn_status_res.unwrap_or_else(|| json!({ "status": "unknown" })),
            "wireguard": wireguard_status_res.unwrap_or_else(|| json!({ "status": "unknown" })),
        },
        "source": "api",
    }))
}

fn opnsense_rows(value: Option<&Value>) -> Value {
    value
        .and_then(|value| value.get("rows"))
        .cloned()
        .unwrap_or_else(|| json!([]))
}

fn opnsense_total(value: Option<&Value>) -> u64 {
    value
        .and_then(|value| value.get("total"))
        .and_then(|value| {
            value
                .as_u64()
                .or_else(|| value.as_str()?.trim().parse::<u64>().ok())
        })
        .unwrap_or(0)
}

async fn opnsense_get_json(
    client: &Client,
    base_url: &str,
    key: &str,
    secret: &str,
    paths: &[&str],
) -> Option<Value> {
    for path in paths {
        match client
            .get(format!("{base_url}{path}"))
            .basic_auth(key, Some(secret))
            .send()
            .await
        {
            Ok(res) if res.status().is_success() => match res.json::<Value>().await {
                Ok(value) => return Some(value),
                Err(err) => warn!(path, error = %err, "OPNsense JSON parse failed"),
            },
            Ok(res) => warn!(path, status = %res.status(), "OPNsense endpoint failed"),
            Err(err) => warn!(path, error = %err, "OPNsense endpoint unavailable"),
        }
    }
    None
}

async fn opnsense_post_json(
    client: &Client,
    base_url: &str,
    key: &str,
    secret: &str,
    path: &str,
    body: Value,
) -> Option<Value> {
    match client
        .post(format!("{base_url}{path}"))
        .basic_auth(key, Some(secret))
        .json(&body)
        .send()
        .await
    {
        Ok(res) if res.status().is_success() => match res.json::<Value>().await {
            Ok(value) => Some(value),
            Err(err) => {
                warn!(path, error = %err, "OPNsense JSON parse failed");
                None
            }
        },
        Ok(res) => {
            warn!(path, status = %res.status(), "OPNsense endpoint failed");
            None
        }
        Err(err) => {
            warn!(path, error = %err, "OPNsense endpoint unavailable");
            None
        }
    }
}

fn parse_opnsense_services(value: &Value) -> Vec<OPNsenseService> {
    let mut services = serde_json::from_value::<OPNsenseServiceSearch>(value.clone())
        .ok()
        .and_then(|response| response.rows)
        .unwrap_or_default()
        .into_iter()
        .filter_map(to_opnsense_service)
        .collect::<Vec<_>>();
    services.sort_by(|a, b| a.name.cmp(&b.name));
    services
}

fn to_opnsense_service(raw: OPNsenseServiceRaw) -> Option<OPNsenseService> {
    let id = raw.id.or_else(|| raw.name.clone())?;
    let name = raw.name.unwrap_or_else(|| id.clone());
    Some(OPNsenseService {
        id,
        name,
        description: raw.description.unwrap_or_default(),
        running: value_truthy(raw.running.as_ref()),
        locked: value_truthy(raw.locked.as_ref()),
    })
}

fn value_truthy(value: Option<&Value>) -> bool {
    match value {
        Some(Value::Bool(v)) => *v,
        Some(Value::Number(v)) => v.as_i64().unwrap_or_default() != 0,
        Some(Value::String(v)) => matches!(
            v.trim(),
            "1" | "true" | "TRUE" | "True" | "yes" | "YES" | "Yes"
        ),
        _ => false,
    }
}

fn parse_u64_loose(raw: &str) -> Option<u64> {
    let cleaned: String = raw
        .chars()
        .filter(|c| c.is_ascii_digit() || *c == '.')
        .collect();
    if cleaned.is_empty() {
        return None;
    }
    let number = cleaned.parse::<f64>().ok()?;
    let lower = raw.to_ascii_lowercase();
    let multiplier = if lower.contains("tb") || lower.contains("tib") {
        1_000_000_000_000_f64
    } else if lower.contains("gb") || lower.contains("gib") {
        1_000_000_000_f64
    } else if lower.contains("mb") || lower.contains("mib") {
        1_000_000_f64
    } else if lower.contains("kb") || lower.contains("kib") {
        1_000_f64
    } else {
        1_f64
    };
    Some((number * multiplier) as u64)
}

fn value_as_u64(value: &Value) -> Option<u64> {
    match value {
        Value::Number(n) => n.as_u64().or_else(|| n.as_f64().map(|f| f as u64)),
        Value::String(s) => parse_u64_loose(s),
        _ => None,
    }
}

fn find_number_for_keys(value: &Value, keys: &[&str]) -> u64 {
    match value {
        Value::Object(map) => {
            for (key, child) in map {
                let normalized = key.replace(['-', ' '], "_").to_ascii_lowercase();
                if keys.iter().any(|wanted| normalized == *wanted) {
                    if let Some(number) = value_as_u64(child) {
                        return number;
                    }
                }
                let nested = find_number_for_keys(child, keys);
                if nested > 0 {
                    return nested;
                }
            }
            0
        }
        Value::Array(items) => items
            .iter()
            .map(|item| find_number_for_keys(item, keys))
            .find(|number| *number > 0)
            .unwrap_or(0),
        _ => 0,
    }
}

fn find_wan_entry(stats: &serde_json::Map<String, Value>) -> Option<(&String, &Value)> {
    stats.iter().find(|(key, value)| {
        let key_upper = key.to_uppercase();
        let value_text = value.to_string().to_uppercase();
        key_upper.contains("[WAN]")
            || key_upper == "WAN"
            || key_upper.contains(" WAN")
            || value_text.contains("\"WAN\"")
    })
}

fn parse_wan_rates(value: &Value) -> Option<(f64, f64)> {
    let Value::Object(map) = value else {
        return None;
    };

    let candidates: Vec<&Value> = if let Some(Value::Object(interfaces)) = map.get("interfaces") {
        interfaces.values().collect()
    } else if let Some(Value::Object(interfaces)) = map.get("data") {
        interfaces.values().collect()
    } else {
        map.values().collect()
    };

    for candidate in candidates {
        let text = candidate.to_string().to_uppercase();
        if !text.contains("WAN") {
            continue;
        }
        let in_rate = find_number_for_keys(
            candidate,
            &[
                "rate_bits_in",
                "rate_in",
                "bits_in",
                "bps_in",
                "inbps",
                "rx_rate",
                "rx_bps",
            ],
        );
        let out_rate = find_number_for_keys(
            candidate,
            &[
                "rate_bits_out",
                "rate_out",
                "bits_out",
                "bps_out",
                "outbps",
                "tx_rate",
                "tx_bps",
            ],
        );
        if in_rate > 0 || out_rate > 0 {
            return Some((in_rate as f64, out_rate as f64));
        }
    }

    None
}

async fn fetch_opnsense_ssh() -> Option<Value> {
    let command = r#"sh -c 'total=$(sysctl -n hw.physmem 2>/dev/null || echo 0); free=$(sysctl -n vm.stats.vm.v_free_count 2>/dev/null || echo 0); page=$(sysctl -n hw.pagesize 2>/dev/null || echo 4096); used=$((total - free * page)); boot=$(sysctl -n kern.boottime 2>/dev/null | cut -d" " -f4 | tr -d ,); now=$(date +%s); uptime=$((now - ${boot:-now})); printf "{\"status\":\"online\",\"cpu\":0.0,\"mem_used\":%s,\"mem_total\":%s,\"uptime\":%s,\"wan_in\":\"N/A\",\"wan_out\":\"N/A\",\"source\":\"ssh\"}\n" "$used" "$total" "$uptime"'"#;
    let raw = ssh_output("opnsense", command).await?;
    serde_json::from_str(&raw).ok()
}

/// Parse OPNsense uptime string like "3 days, 03:58:11" into seconds.
fn parse_opnsense_uptime(raw: &str) -> u64 {
    let mut days: u64 = 0;
    let mut hours: u64 = 0;
    let mut mins: u64 = 0;
    let mut secs: u64 = 0;

    // Extract days: "N day(s)"
    for (i, segment) in raw.split_whitespace().enumerate() {
        if segment.starts_with("day") && i > 0 {
            if let Some(prev) = raw.split_whitespace().nth(i - 1) {
                days = prev.parse().unwrap_or(0);
            }
        }
    }

    // Extract HH:MM:SS
    for part in raw.split([',', ' ']) {
        let trimmed = part.trim();
        if trimmed.contains(':') {
            let time_parts: Vec<&str> = trimmed.split(':').collect();
            if time_parts.len() >= 3 {
                hours = time_parts[0].parse().unwrap_or(0);
                mins = time_parts[1].parse().unwrap_or(0);
                secs = time_parts[2].parse().unwrap_or(0);
            } else if time_parts.len() == 2 {
                hours = time_parts[0].parse().unwrap_or(0);
                mins = time_parts[1].parse().unwrap_or(0);
            }
        }
    }

    days * 86400 + hours * 3600 + mins * 60 + secs
}

/// Extract a numeric value from an OPNsense interface statistics entry.
fn parse_stat_value(iface: &Value, key: &str) -> u64 {
    match iface.get(key) {
        Some(Value::Number(n)) => n.as_u64().unwrap_or(0),
        Some(Value::String(s)) => s.parse::<u64>().unwrap_or(0),
        _ => 0,
    }
}

/// Format byte count into human-readable string (matches TS `fmt` function).
fn format_bytes_human(bytes: u64) -> String {
    let b = bytes as f64;
    if b >= 1e12 {
        format!("{:.1} TB", b / 1e12)
    } else if b >= 1e9 {
        format!("{:.1} GB", b / 1e9)
    } else if b >= 1e6 {
        format!("{:.1} MB", b / 1e6)
    } else {
        format!("{:.1} KB", b / 1e3)
    }
}

fn format_bitrate_human(bits_per_second: f64) -> String {
    if bits_per_second >= 1e9 {
        format!("{:.1} Gbps", bits_per_second / 1e9)
    } else if bits_per_second >= 1e6 {
        format!("{:.1} Mbps", bits_per_second / 1e6)
    } else if bits_per_second >= 1e3 {
        format!("{:.1} Kbps", bits_per_second / 1e3)
    } else {
        format!("{:.0} bps", bits_per_second)
    }
}

fn docker_unavailable(reason: impl Into<String>) -> Value {
    json!({
        "available": false,
        "source": "portainer",
        "error": reason.into(),
        "containers": [],
    })
}

async fn portainer_get(
    config: &PortainerInstanceConfig,
    path: &str,
) -> Result<Value, reqwest::Error> {
    insecure_client()
        .get(format!("{}/api{}", config.url, path))
        .header("X-API-Key", &config.token)
        .send()
        .await?
        .error_for_status()?
        .json::<Value>()
        .await
}

pub(crate) async fn fetch_portainer_inventory(state: &AppState) -> Value {
    let configs = portainer_configs(state);
    if configs.is_empty() {
        return docker_unavailable("No Portainer instances configured");
    }

    let mut instances = Vec::new();
    let mut any_live = false;

    for config in configs {
        match portainer_get(&config, "/endpoints").await {
            Ok(endpoints_value) => {
                any_live = true;
                let endpoints: Vec<PortainerEndpoint> =
                    serde_json::from_value(endpoints_value.clone()).unwrap_or_default();
                let mut endpoint_values = Vec::new();
                let mut containers = Vec::new();
                let mut images = Vec::new();
                let mut volumes = Vec::new();
                let mut networks = Vec::new();
                let mut secrets = Vec::new();
                let mut configs = Vec::new();
                let registries = portainer_get(&config, "/registries")
                    .await
                    .ok()
                    .and_then(|value| value.as_array().cloned())
                    .unwrap_or_default()
                    .into_iter()
                    .filter_map(|row| {
                        let id = row
                            .get("Id")
                            .or_else(|| row.get("id"))
                            .and_then(Value::as_i64)
                            .or_else(|| {
                                row.get("Id")
                                    .or_else(|| row.get("id"))
                                    .and_then(Value::as_str)
                                    .and_then(|id| id.parse::<i64>().ok())
                            })?;
                        let name = row
                            .get("Name")
                            .or_else(|| row.get("name"))
                            .and_then(Value::as_str)
                            .unwrap_or_default()
                            .to_string();
                        Some(json!({
                            "id": id,
                            "name": if name.is_empty() { format!("Registry {id}") } else { name },
                            "url": row.get("URL").or_else(|| row.get("Url")).or_else(|| row.get("url")).and_then(Value::as_str).unwrap_or_default(),
                            "type": row.get("Type").or_else(|| row.get("type")).and_then(Value::as_i64).unwrap_or_default(),
                            "authentication": row.get("Authentication").or_else(|| row.get("authentication")).and_then(Value::as_bool).unwrap_or(false),
                            "instance_id": config.id.clone(),
                        }))
                    })
                    .collect::<Vec<_>>();

                for endpoint in endpoints {
                    let containers_value = portainer_get(
                        &config,
                        &format!("/endpoints/{}/docker/containers/json?all=1", endpoint.id),
                    )
                    .await
                    .unwrap_or_else(|_| json!([]));
                    if let Some(rows) = containers_value.as_array() {
                        for row in rows {
                            let names = row
                                .get("Names")
                                .and_then(Value::as_array)
                                .and_then(|names| names.first())
                                .and_then(Value::as_str)
                                .unwrap_or_default()
                                .trim_start_matches('/')
                                .to_string();
                            let image = row
                                .get("Image")
                                .and_then(Value::as_str)
                                .unwrap_or_default()
                                .to_string();
                            containers.push(json!(DockerContainer {
                                id: row
                                    .get("Id")
                                    .and_then(Value::as_str)
                                    .unwrap_or_default()
                                    .to_string(),
                                name: names,
                                image,
                                status: row
                                    .get("Status")
                                    .and_then(Value::as_str)
                                    .unwrap_or_default()
                                    .to_string(),
                                state: row
                                    .get("State")
                                    .and_then(Value::as_str)
                                    .unwrap_or_default()
                                    .to_string(),
                                ports: row.get("Ports").map(Value::to_string).unwrap_or_default(),
                                endpoint_id: Some(endpoint.id),
                                endpoint_name: Some(endpoint.name.clone()),
                                instance_id: Some(config.id.clone()),
                                host_id: None,
                                host_name: None,
                                provider: "portainer".to_string(),
                            }));
                        }
                    }

                    let images_value = portainer_get(
                        &config,
                        &format!("/endpoints/{}/docker/images/json", endpoint.id),
                    )
                    .await
                    .unwrap_or_else(|_| json!([]));
                    if let Some(rows) = images_value.as_array() {
                        for row in rows {
                            let id = row
                                .get("Id")
                                .and_then(Value::as_str)
                                .unwrap_or_default()
                                .to_string();
                            let tags = row
                                .get("RepoTags")
                                .and_then(Value::as_array)
                                .map(|tags| {
                                    tags.iter()
                                        .filter_map(Value::as_str)
                                        .filter(|tag| !tag.is_empty() && *tag != "<none>:<none>")
                                        .map(ToString::to_string)
                                        .collect::<Vec<_>>()
                                })
                                .unwrap_or_default();
                            let display_name = tags
                                .first()
                                .cloned()
                                .unwrap_or_else(|| id.chars().take(20).collect());
                            images.push(json!({
                                "id": id,
                                "name": display_name,
                                "tags": tags,
                                "size": row.get("Size").and_then(Value::as_i64).unwrap_or_default(),
                                "created": row.get("Created").and_then(Value::as_i64).unwrap_or_default(),
                                "endpoint_id": endpoint.id,
                                "endpoint_name": endpoint.name.clone(),
                                "instance_id": config.id.clone(),
                            }));
                        }
                    }

                    let volumes_value = portainer_get(
                        &config,
                        &format!("/endpoints/{}/docker/volumes", endpoint.id),
                    )
                    .await
                    .unwrap_or_else(|_| json!({ "Volumes": [] }));
                    if let Some(rows) = volumes_value.get("Volumes").and_then(Value::as_array) {
                        for row in rows {
                            let name = row
                                .get("Name")
                                .and_then(Value::as_str)
                                .unwrap_or_default()
                                .to_string();
                            if name.is_empty() {
                                continue;
                            }
                            volumes.push(json!({
                                "id": name,
                                "name": name,
                                "driver": row.get("Driver").and_then(Value::as_str).unwrap_or_default(),
                                "mountpoint": row.get("Mountpoint").and_then(Value::as_str).unwrap_or_default(),
                                "endpoint_id": endpoint.id,
                                "endpoint_name": endpoint.name.clone(),
                                "instance_id": config.id.clone(),
                            }));
                        }
                    }

                    let networks_value = portainer_get(
                        &config,
                        &format!("/endpoints/{}/docker/networks", endpoint.id),
                    )
                    .await
                    .unwrap_or_else(|_| json!([]));
                    if let Some(rows) = networks_value.as_array() {
                        for row in rows {
                            let id = row
                                .get("Id")
                                .and_then(Value::as_str)
                                .unwrap_or_default()
                                .to_string();
                            let name = row
                                .get("Name")
                                .and_then(Value::as_str)
                                .unwrap_or_default()
                                .to_string();
                            if id.is_empty() || name.is_empty() {
                                continue;
                            }
                            networks.push(json!({
                                "id": id,
                                "name": name,
                                "driver": row.get("Driver").and_then(Value::as_str).unwrap_or_default(),
                                "scope": row.get("Scope").and_then(Value::as_str).unwrap_or_default(),
                                "endpoint_id": endpoint.id,
                                "endpoint_name": endpoint.name.clone(),
                                "instance_id": config.id.clone(),
                            }));
                        }
                    }

                    let secrets_value = portainer_get(
                        &config,
                        &format!("/endpoints/{}/docker/secrets", endpoint.id),
                    )
                    .await
                    .unwrap_or_else(|_| json!([]));
                    if let Some(rows) = secrets_value.as_array() {
                        for row in rows {
                            let id = row
                                .get("ID")
                                .or_else(|| row.get("Id"))
                                .and_then(Value::as_str)
                                .unwrap_or_default()
                                .to_string();
                            let spec = row.get("Spec").unwrap_or(row);
                            let name = spec
                                .get("Name")
                                .and_then(Value::as_str)
                                .unwrap_or_default()
                                .to_string();
                            if id.is_empty() || name.is_empty() {
                                continue;
                            }
                            secrets.push(json!({
                                "id": id,
                                "name": name,
                                "created_at": row.get("CreatedAt").and_then(Value::as_str).unwrap_or_default(),
                                "updated_at": row.get("UpdatedAt").and_then(Value::as_str).unwrap_or_default(),
                                "endpoint_id": endpoint.id,
                                "endpoint_name": endpoint.name.clone(),
                                "instance_id": config.id.clone(),
                            }));
                        }
                    }

                    let configs_value = portainer_get(
                        &config,
                        &format!("/endpoints/{}/docker/configs", endpoint.id),
                    )
                    .await
                    .unwrap_or_else(|_| json!([]));
                    if let Some(rows) = configs_value.as_array() {
                        for row in rows {
                            let id = row
                                .get("ID")
                                .or_else(|| row.get("Id"))
                                .and_then(Value::as_str)
                                .unwrap_or_default()
                                .to_string();
                            let spec = row.get("Spec").unwrap_or(row);
                            let name = spec
                                .get("Name")
                                .and_then(Value::as_str)
                                .unwrap_or_default()
                                .to_string();
                            if id.is_empty() || name.is_empty() {
                                continue;
                            }
                            configs.push(json!({
                                "id": id,
                                "name": name,
                                "created_at": row.get("CreatedAt").and_then(Value::as_str).unwrap_or_default(),
                                "updated_at": row.get("UpdatedAt").and_then(Value::as_str).unwrap_or_default(),
                                "endpoint_id": endpoint.id,
                                "endpoint_name": endpoint.name.clone(),
                                "instance_id": config.id.clone(),
                            }));
                        }
                    }
                    endpoint_values.push(json!({
                        "id": endpoint.id,
                        "name": endpoint.name,
                        "url": endpoint.url,
                        "status": endpoint.status,
                    }));
                }

                let stacks = portainer_get(&config, "/stacks")
                    .await
                    .ok()
                    .and_then(|value| serde_json::from_value::<Vec<PortainerStack>>(value).ok())
                    .unwrap_or_default()
                    .into_iter()
                    .map(|stack| {
                        json!({
                            "id": stack.id,
                            "name": stack.name,
                            "type": stack.stack_type,
                            "endpoint_id": stack.endpoint_id,
                            "instance_id": config.id.clone(),
                        })
                    })
                    .collect::<Vec<_>>();

                instances.push(json!({
                    "id": config.id,
                    "name": config.name,
                    "url": config.url,
                    "available": true,
                    "endpoints": endpoint_values,
                    "stacks": stacks,
                    "containers": containers,
                    "images": images,
                    "volumes": volumes,
                    "networks": networks,
                    "secrets": secrets,
                    "configs": configs,
                    "registries": registries,
                }));
            }
            Err(err) => {
                instances.push(json!({
                    "id": config.id,
                    "name": config.name,
                    "url": config.url,
                    "available": false,
                    "error": err.to_string(),
                    "endpoints": [],
                    "stacks": [],
                    "containers": [],
                    "images": [],
                    "volumes": [],
                    "networks": [],
                    "secrets": [],
                    "configs": [],
                    "registries": [],
                }));
            }
        }
    }

    let all_containers = instances
        .iter()
        .flat_map(|item| {
            item.get("containers")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default()
        })
        .collect::<Vec<_>>();
    let all_endpoints = instances
        .iter()
        .flat_map(|item| {
            item.get("endpoints")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default()
        })
        .collect::<Vec<_>>();
    let all_stacks = instances
        .iter()
        .flat_map(|item| {
            item.get("stacks")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default()
        })
        .collect::<Vec<_>>();
    let all_images = instances
        .iter()
        .flat_map(|item| {
            item.get("images")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default()
        })
        .collect::<Vec<_>>();
    let all_volumes = instances
        .iter()
        .flat_map(|item| {
            item.get("volumes")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default()
        })
        .collect::<Vec<_>>();
    let all_networks = instances
        .iter()
        .flat_map(|item| {
            item.get("networks")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default()
        })
        .collect::<Vec<_>>();
    let all_secrets = instances
        .iter()
        .flat_map(|item| {
            item.get("secrets")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default()
        })
        .collect::<Vec<_>>();
    let all_configs = instances
        .iter()
        .flat_map(|item| {
            item.get("configs")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default()
        })
        .collect::<Vec<_>>();
    let all_registries = instances
        .iter()
        .flat_map(|item| {
            item.get("registries")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default()
        })
        .collect::<Vec<_>>();

    json!({
        "available": any_live,
        "source": "portainer",
        "instances": instances,
        "endpoints": all_endpoints,
        "stacks": all_stacks,
        "containers": all_containers,
        "images": all_images,
        "volumes": all_volumes,
        "networks": all_networks,
        "secrets": all_secrets,
        "configs": all_configs,
        "registries": all_registries,
    })
}

async fn fetch_docker_ssh_inventory(state: &AppState) -> Value {
    let hosts = docker_host_configs(state);
    let mut host_values = Vec::new();
    let mut all_containers = Vec::new();
    let mut any_live = false;

    for host in hosts {
        let output = Command::new("ssh")
            .args([
                "-o",
                "BatchMode=yes",
                "-o",
                "ConnectTimeout=6",
                &host.host,
                "docker ps -a --format '{{json .}}'",
            ])
            .output()
            .await;

        match output {
            Ok(output) if output.status.success() => {
                any_live = true;
                let stdout = String::from_utf8_lossy(&output.stdout);
                let containers = stdout
                    .lines()
                    .filter_map(|line| serde_json::from_str::<Value>(line).ok())
                    .map(|row| {
                        let id = row
                            .get("ID")
                            .and_then(Value::as_str)
                            .unwrap_or_default()
                            .to_string();
                        let container = json!(DockerContainer {
                            id: id.clone(),
                            name: row
                                .get("Names")
                                .and_then(Value::as_str)
                                .unwrap_or_default()
                                .trim_start_matches('/')
                                .to_string(),
                            image: row
                                .get("Image")
                                .and_then(Value::as_str)
                                .unwrap_or_default()
                                .to_string(),
                            status: row
                                .get("Status")
                                .and_then(Value::as_str)
                                .unwrap_or_default()
                                .to_string(),
                            state: row
                                .get("State")
                                .and_then(Value::as_str)
                                .unwrap_or_default()
                                .to_string(),
                            ports: row
                                .get("Ports")
                                .and_then(Value::as_str)
                                .unwrap_or_default()
                                .to_string(),
                            endpoint_id: None,
                            endpoint_name: None,
                            instance_id: None,
                            host_id: Some(host.id.clone()),
                            host_name: Some(host.name.clone()),
                            provider: "docker-ssh".to_string(),
                        });
                        container
                    })
                    .collect::<Vec<_>>();
                all_containers.extend(containers.clone());
                host_values.push(json!({
                    "id": host.id,
                    "name": host.name,
                    "host": host.host,
                    "available": true,
                    "containers": containers,
                }));
            }
            Ok(output) => {
                host_values.push(json!({
                    "id": host.id,
                    "name": host.name,
                    "host": host.host,
                    "available": false,
                    "error": String::from_utf8_lossy(&output.stderr).trim(),
                    "containers": [],
                }));
            }
            Err(err) => {
                host_values.push(json!({
                    "id": host.id,
                    "name": host.name,
                    "host": host.host,
                    "available": false,
                    "error": err.to_string(),
                    "containers": [],
                }));
            }
        }
    }

    json!({
        "available": any_live,
        "source": "docker-ssh",
        "hosts": host_values,
        "containers": all_containers,
    })
}

fn validate_docker_action(action: &str) -> Result<&str, AppError> {
    match action {
        "start"
        | "stop"
        | "restart"
        | "pause"
        | "unpause"
        | "kill"
        | "remove"
        | "exec"
        | "logs"
        | "inspect"
        | "stats"
        | "duplicate"
        | "recreate"
        | "redeploy"
        | "delete"
        | "inspect-endpoint"
        | "prune-images"
        | "prune-containers"
        | "prune-volumes"
        | "prune-networks"
        | "inspect-image"
        | "history-image"
        | "tag-image"
        | "remove-image"
        | "inspect-volume"
        | "remove-volume"
        | "inspect-network"
        | "remove-network"
        | "connect-container"
        | "disconnect-container"
        | "inspect-secret"
        | "remove-secret"
        | "inspect-config"
        | "remove-config"
        | "inspect-registry"
        | "remove-registry"
        | "create-registry"
        | "update-registry"
        | "pull-image"
        | "create-volume"
        | "create-network"
        | "create-secret"
        | "create-config"
        | "create-container"
        | "create-stack"
        | "inspect-stack"
        | "stack-file"
        | "stack-logs"
        | "start-stack"
        | "stop-stack"
        | "update-stack"
        | "rename"
        | "update-restart-policy"
        | "update-resources" => Ok(action),
        _ => Err(AppError::BadRequest(format!(
            "unsupported Portainer action: {action}"
        ))),
    }
}

fn validate_proxmox_action(action: &str) -> Result<&str, AppError> {
    match action {
        "start"
        | "shutdown"
        | "reboot"
        | "stop"
        | "set-memory"
        | "set-cpu"
        | "set-network"
        | "add-network"
        | "remove-network"
        | "resize-disk"
        | "add-disk"
        | "remove-disk"
        | "snapshot"
        | "delete-snapshot"
        | "rollback-snapshot"
        | "migrate"
        | "clone"
        | "backup"
        | "restore"
        | "delete-backup"
        | "enable-storage"
        | "disable-storage"
        | "add-ha"
        | "set-ha-state"
        | "remove-ha"
        | "console"
        | "delete"
        | "set-name"
        | "set-description"
        | "set-tags"
        | "set-onboot"
        | "set-protection"
        | "set-firewall"
        | "add-firewall-rule"
        | "update-firewall-rule"
        | "delete-firewall-rule"
        | "task-log"
        | "task-status"
        | "stop-task"
        | "restart"
        | "reload"
        | "create-vm"
        | "create-lxc" => Ok(action),
        _ => Err(AppError::BadRequest(format!(
            "unsupported Proxmox action: {action}"
        ))),
    }
}

fn validate_opnsense_action(action: &str) -> Result<&str, AppError> {
    match action {
        "start" | "stop" | "restart" => Ok(action),
        _ => Err(AppError::BadRequest(format!(
            "unsupported OPNsense action: {action}"
        ))),
    }
}

fn validate_system_action(action: &str) -> Result<&str, AppError> {
    match action {
        "open" | "healthcheck" => Ok(action),
        _ => Err(AppError::BadRequest(format!(
            "unsupported system action: {action}"
        ))),
    }
}

fn validate_proxmox_kind(kind: &str) -> Result<&str, AppError> {
    match kind {
        "qemu" | "lxc" => Ok(kind),
        _ => Err(AppError::BadRequest(format!(
            "unsupported Proxmox resource kind: {kind}"
        ))),
    }
}

fn proxmox_ha_sid(kind: &str, vmid: u64) -> String {
    let prefix = if kind == "lxc" { "ct" } else { "vm" };
    format!("{prefix}:{vmid}")
}

fn validate_proxmox_ha_state(value: &str) -> Result<String, AppError> {
    let clean = validate_control_token(value, "HA state")?;
    match clean.as_str() {
        "started" | "stopped" | "enabled" | "disabled" | "ignored" => Ok(clean),
        _ => Err(AppError::BadRequest("invalid HA state".into())),
    }
}

fn validate_proxmox_firewall_policy(value: &str) -> Result<String, AppError> {
    let clean = validate_control_token(value, "firewall policy")?;
    match clean.as_str() {
        "ACCEPT" | "DROP" | "REJECT" => Ok(clean),
        _ => Err(AppError::BadRequest("invalid firewall policy".into())),
    }
}

fn validate_proxmox_firewall_rule_type(value: &str) -> Result<String, AppError> {
    let clean = validate_control_token(value, "firewall rule type")?.to_lowercase();
    match clean.as_str() {
        "in" | "out" | "forward" => Ok(clean),
        _ => Err(AppError::BadRequest("invalid firewall rule type".into())),
    }
}

fn validate_proxmox_firewall_rule_action(value: &str) -> Result<String, AppError> {
    let clean = validate_control_token(value, "firewall rule action")?;
    let upper = clean.to_uppercase();
    if matches!(upper.as_str(), "ACCEPT" | "DROP" | "REJECT") {
        Ok(upper)
    } else {
        Ok(clean)
    }
}

fn proxmox_firewall_rule_pos(args: &Value) -> Result<u64, AppError> {
    required_arg_u64(args, &["pos", "position"], "firewall rule position")
}

fn proxmox_firewall_rule_form(
    args: &Value,
    create: bool,
) -> Result<Vec<(String, String)>, AppError> {
    let mut form = Vec::new();
    if create || arg_string(args, &["type", "rule_type"]).is_some() {
        form.push((
            "type".to_string(),
            validate_proxmox_firewall_rule_type(&required_arg_string(
                args,
                &["type", "rule_type"],
                "firewall rule type",
            )?)?,
        ));
    }
    if create || arg_string(args, &["action"]).is_some() {
        form.push((
            "action".to_string(),
            validate_proxmox_firewall_rule_action(&required_arg_string(
                args,
                &["action"],
                "firewall rule action",
            )?)?,
        ));
    }
    if let Some(enable) = optional_arg_bool(args, &["enable", "enabled"]) {
        form.push((
            "enable".to_string(),
            if enable { "1" } else { "0" }.to_string(),
        ));
    } else if create {
        form.push(("enable".to_string(), "1".to_string()));
    }
    for (arg_key, form_key, label) in [
        ("iface", "iface", "firewall interface"),
        ("source", "source", "firewall source"),
        ("dest", "dest", "firewall destination"),
        ("proto", "proto", "firewall protocol"),
        ("dport", "dport", "firewall destination port"),
        ("sport", "sport", "firewall source port"),
        ("comment", "comment", "firewall comment"),
        ("log", "log", "firewall log level"),
        ("macro", "macro", "firewall macro"),
    ] {
        if let Some(value) = arg_string(args, &[arg_key]) {
            form.push((
                form_key.to_string(),
                validate_proxmox_config_value(&value, label)?,
            ));
        }
    }
    if form.is_empty() {
        return Err(AppError::BadRequest("firewall rule update is empty".into()));
    }
    Ok(form)
}

fn validate_container_target(container: &str) -> Result<String, AppError> {
    let clean = container.trim().trim_start_matches('/');
    if clean.is_empty() || clean.len() > 128 {
        return Err(AppError::BadRequest("invalid container target".into()));
    }
    if !clean
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '-' | '.'))
    {
        return Err(AppError::BadRequest("invalid container target".into()));
    }
    Ok(clean.to_string())
}

fn is_destructive_action(action: &str) -> bool {
    matches!(
        action,
        "remove"
            | "delete"
            | "update-stack"
            | "delete-snapshot"
            | "rollback-snapshot"
            | "stop-stack"
            | "restore"
            | "delete-backup"
            | "recreate"
            | "remove-ha"
            | "delete-firewall-rule"
            | "prune"
            | "prune-images"
            | "prune-containers"
            | "prune-volumes"
            | "prune-networks"
            | "remove-image"
            | "remove-volume"
            | "remove-network"
            | "remove-secret"
            | "remove-config"
            | "remove-registry"
            | "remove-disk"
    )
}

fn require_destructive_confirmation(
    action: &str,
    resource_id: &str,
    args: &Value,
    confirmation: Option<&str>,
) -> Result<(), AppError> {
    if !is_destructive_action(action) {
        return Ok(());
    }
    let expected = args
        .get("name")
        .and_then(Value::as_str)
        .unwrap_or(resource_id)
        .trim();
    if confirmation.map(str::trim) == Some(expected) {
        Ok(())
    } else {
        Err(AppError::BadRequest(format!(
            "typed confirmation must match {expected}"
        )))
    }
}

fn homelab_control_audit_details(body: &HomelabControlInput) -> Value {
    json!({
        "provider": body.provider.trim(),
        "instance_id": body.instance_id.as_deref(),
        "resource_type": body.resource_type.trim(),
        "resource_id": body.resource_id.trim(),
        "action": body.action.trim(),
        "destructive": is_destructive_action(body.action.trim()),
        "confirmation_supplied": body.confirmation.is_some(),
        "target_name": body.args.get("name").and_then(Value::as_str),
        "endpoint_id": body.args.get("endpoint_id").or_else(|| body.args.get("endpointId")),
        "node": body.args.get("node").and_then(Value::as_str),
        "kind": body.args.get("kind").and_then(Value::as_str),
    })
}

fn arg_string(args: &Value, keys: &[&str]) -> Option<String> {
    keys.iter().find_map(|key| {
        args.get(*key)
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToOwned::to_owned)
    })
}

fn required_arg_string(args: &Value, keys: &[&str], label: &str) -> Result<String, AppError> {
    arg_string(args, keys).ok_or_else(|| AppError::BadRequest(format!("{label} is required")))
}

fn required_arg_u64(args: &Value, keys: &[&str], label: &str) -> Result<u64, AppError> {
    keys.iter()
        .find_map(|key| {
            args.get(*key).and_then(|value| {
                value
                    .as_u64()
                    .or_else(|| value.as_str()?.trim().parse::<u64>().ok())
            })
        })
        .ok_or_else(|| AppError::BadRequest(format!("{label} is required")))
}

fn optional_arg_bool(args: &Value, keys: &[&str]) -> Option<bool> {
    keys.iter().find_map(|key| {
        args.get(*key).and_then(|value| {
            value.as_bool().or_else(|| match value.as_str()?.trim() {
                "1" | "true" | "TRUE" | "True" | "yes" | "YES" | "Yes" => Some(true),
                "0" | "false" | "FALSE" | "False" | "no" | "NO" | "No" => Some(false),
                _ => None,
            })
        })
    })
}

fn optional_arg_u64(args: &Value, keys: &[&str]) -> Option<u64> {
    keys.iter().find_map(|key| {
        args.get(*key).and_then(|value| {
            value
                .as_u64()
                .or_else(|| value.as_str()?.trim().parse::<u64>().ok())
        })
    })
}

fn arg_string_list(args: &Value, keys: &[&str]) -> Vec<String> {
    keys.iter()
        .find_map(|key| args.get(*key))
        .map(|value| match value {
            Value::Array(items) => items
                .iter()
                .filter_map(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(ToOwned::to_owned)
                .collect(),
            Value::String(text) => text
                .split([',', '\n'])
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(ToOwned::to_owned)
                .collect(),
            _ => Vec::new(),
        })
        .unwrap_or_default()
}

fn arg_string_map(args: &Value, keys: &[&str]) -> serde_json::Map<String, Value> {
    let mut map = serde_json::Map::new();
    if let Some(value) = keys.iter().find_map(|key| args.get(*key)) {
        match value {
            Value::Object(input) => {
                for (key, value) in input {
                    if !key.trim().is_empty() {
                        map.insert(key.trim().to_string(), value.clone());
                    }
                }
            }
            Value::String(text) => {
                for entry in text.split([',', '\n']) {
                    let entry = entry.trim();
                    if entry.is_empty() {
                        continue;
                    }
                    let Some((key, value)) = entry.split_once('=') else {
                        continue;
                    };
                    let key = key.trim();
                    if !key.is_empty() {
                        map.insert(key.to_string(), json!(value.trim()));
                    }
                }
            }
            _ => {}
        }
    }
    map
}

fn docker_command(args: &Value) -> Option<Vec<String>> {
    if let Some(value) = args.get("cmd").or_else(|| args.get("command")) {
        if let Value::Array(items) = value {
            let parsed = items
                .iter()
                .filter_map(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(ToOwned::to_owned)
                .collect::<Vec<_>>();
            if !parsed.is_empty() {
                return Some(parsed);
            }
        }
    }
    arg_string(args, &["cmd", "command"]).map(|command| vec!["sh".into(), "-lc".into(), command])
}

fn docker_exposed_ports(
    args: &Value,
) -> (
    serde_json::Map<String, Value>,
    serde_json::Map<String, Value>,
) {
    let mut exposed = serde_json::Map::new();
    let mut bindings = serde_json::Map::new();
    for entry in arg_string_list(args, &["ports", "port_bindings"]) {
        let mut parts = entry.split(':').map(str::trim).collect::<Vec<_>>();
        if parts.is_empty() {
            continue;
        }
        let container = parts.pop().unwrap_or_default();
        if container.is_empty() {
            continue;
        }
        let container_port = if container.contains('/') {
            container.to_string()
        } else {
            format!("{container}/tcp")
        };
        exposed.insert(container_port.clone(), json!({}));
        if let Some(host_port) = parts.pop().filter(|value| !value.is_empty()) {
            let host_ip = parts.pop().unwrap_or_default();
            bindings.insert(
                container_port,
                json!([{
                    "HostIp": host_ip,
                    "HostPort": host_port,
                }]),
            );
        }
    }
    (exposed, bindings)
}

fn portainer_env_pairs(args: &Value) -> Vec<Value> {
    arg_string_list(args, &["env", "environment"])
        .into_iter()
        .filter_map(|entry| {
            let (name, value) = entry.split_once('=')?;
            let name = name.trim();
            if name.is_empty() {
                return None;
            }
            Some(json!({ "name": name, "value": value.trim() }))
        })
        .collect()
}

fn portainer_registry_body(args: &Value, require_name: bool) -> Result<Value, AppError> {
    let mut body = serde_json::Map::new();
    if let Some(name) = arg_string(args, &["name"]) {
        body.insert(
            "Name".into(),
            json!(validate_proxmox_config_value(&name, "registry name")?),
        );
    } else if require_name {
        return Err(AppError::BadRequest("registry name is required".into()));
    }
    if let Some(url) = arg_string(args, &["url", "registry_url"]) {
        body.insert(
            "URL".into(),
            json!(validate_proxmox_config_value(&url, "registry URL")?),
        );
    } else if require_name {
        return Err(AppError::BadRequest("registry URL is required".into()));
    }
    if let Some(registry_type) = optional_arg_u64(args, &["type", "registry_type"]) {
        if !(1..=10).contains(&registry_type) {
            return Err(AppError::BadRequest("registry type is out of range".into()));
        }
        body.insert("Type".into(), json!(registry_type));
    }
    let authentication = optional_arg_bool(args, &["authentication", "auth"]).or_else(|| {
        if require_name {
            Some(false)
        } else {
            None
        }
    });
    if let Some(authentication) = authentication {
        body.insert("Authentication".into(), json!(authentication));
        if authentication {
            let username = required_arg_string(args, &["username", "user"], "registry username")?;
            let password = required_arg_string(args, &["password", "token"], "registry password")?;
            body.insert(
                "Username".into(),
                json!(validate_proxmox_config_value(
                    &username,
                    "registry username"
                )?),
            );
            body.insert("Password".into(), json!(password));
        }
    }
    if body.is_empty() {
        return Err(AppError::BadRequest("registry update is empty".into()));
    }
    Ok(Value::Object(body))
}

async fn portainer_container_inspect(
    client: &Client,
    config: &PortainerInstanceConfig,
    endpoint_id: i64,
    resource_id: &str,
) -> Result<Value, AppError> {
    let url = format!(
        "{}/api/endpoints/{endpoint_id}/docker/containers/{}/json",
        config.url,
        urlencoding::encode(resource_id)
    );
    let response = client
        .get(url)
        .header("X-API-Key", &config.token)
        .send()
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Portainer inspect failed: {e}")))?;
    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(AppError::BadRequest(format!(
            "Portainer inspect failed ({status}): {text}"
        )));
    }
    response
        .json::<Value>()
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Portainer inspect decode failed: {e}")))
}

async fn portainer_stack_logs(
    client: &Client,
    config: &PortainerInstanceConfig,
    endpoint_id: i64,
    resource_id: &str,
    args: &Value,
) -> Result<Value, AppError> {
    let stack_name = validate_proxmox_config_value(
        &arg_string(args, &["name", "stack"]).unwrap_or_else(|| resource_id.to_string()),
        "stack name",
    )?;
    let tail = optional_arg_u64(args, &["tail"])
        .unwrap_or(200)
        .clamp(1, 2_000);
    let label_filters = [
        format!("com.docker.compose.project={stack_name}"),
        format!("com.docker.stack.namespace={stack_name}"),
    ];
    let mut containers_by_id: HashMap<String, Value> = HashMap::new();

    for label in label_filters {
        let filters = serde_json::to_string(&json!({ "label": [label] })).map_err(|e| {
            AppError::Internal(anyhow::anyhow!("Portainer stack filter encode failed: {e}"))
        })?;
        let url = format!(
            "{}/api/endpoints/{endpoint_id}/docker/containers/json?all=1&filters={}",
            config.url,
            urlencoding::encode(&filters)
        );
        let response = client
            .get(url)
            .header("X-API-Key", &config.token)
            .send()
            .await
            .map_err(|e| {
                AppError::Internal(anyhow::anyhow!(
                    "Portainer stack container lookup failed: {e}"
                ))
            })?;
        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(AppError::BadRequest(format!(
                "Portainer stack container lookup failed ({status}): {text}"
            )));
        }
        for row in response
            .json::<Value>()
            .await
            .unwrap_or_else(|_| json!([]))
            .as_array()
            .into_iter()
            .flatten()
        {
            if let Some(id) = row
                .get("Id")
                .and_then(Value::as_str)
                .filter(|id| !id.is_empty())
            {
                containers_by_id
                    .entry(id.to_string())
                    .or_insert_with(|| row.clone());
            }
        }
    }

    let mut containers = containers_by_id.into_values().collect::<Vec<_>>();
    containers.sort_by(|a, b| {
        let a_name = a
            .get("Names")
            .and_then(Value::as_array)
            .and_then(|names| names.first())
            .and_then(Value::as_str)
            .unwrap_or_default();
        let b_name = b
            .get("Names")
            .and_then(Value::as_array)
            .and_then(|names| names.first())
            .and_then(Value::as_str)
            .unwrap_or_default();
        a_name.cmp(b_name)
    });

    let mut summaries = Vec::new();
    let mut output = String::new();
    for container in containers {
        let id = container
            .get("Id")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string();
        if id.is_empty() {
            continue;
        }
        let name = container
            .get("Names")
            .and_then(Value::as_array)
            .and_then(|names| names.first())
            .and_then(Value::as_str)
            .unwrap_or_default()
            .trim_start_matches('/')
            .to_string();
        summaries.push(json!({
            "id": id,
            "name": name,
            "image": container.get("Image").and_then(Value::as_str).unwrap_or_default(),
            "state": container.get("State").and_then(Value::as_str).unwrap_or_default(),
            "status": container.get("Status").and_then(Value::as_str).unwrap_or_default(),
        }));
        let url = format!(
            "{}/api/endpoints/{endpoint_id}/docker/containers/{}/logs?stdout=1&stderr=1&tail={tail}&timestamps=1",
            config.url,
            urlencoding::encode(&id)
        );
        let response = client
            .get(url)
            .header("X-API-Key", &config.token)
            .send()
            .await
            .map_err(|e| AppError::Internal(anyhow::anyhow!("Portainer stack logs failed: {e}")))?;
        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(AppError::BadRequest(format!(
                "Portainer stack logs failed ({status}): {text}"
            )));
        }
        let bytes = response.bytes().await.unwrap_or_default();
        let decoded = decode_docker_exec_output(&bytes);
        output.push_str(&format!(
            "===== {} ({}) =====\n{}\n",
            if name.is_empty() { "container" } else { &name },
            &id.chars().take(12).collect::<String>(),
            decoded.trim_end()
        ));
    }

    if output.trim().is_empty() {
        output = format!("No containers matched stack labels for {stack_name}.");
    }

    Ok(json!({
        "logs": output,
        "containers": summaries,
        "tail": tail,
    }))
}

fn portainer_container_clone_body(inspect: &Value) -> Value {
    let mut body = inspect
        .get("Config")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    if let Some(host_config) = inspect.get("HostConfig").and_then(Value::as_object) {
        body.insert("HostConfig".into(), Value::Object(host_config.clone()));
    }
    if let Some(networks) = inspect
        .get("NetworkSettings")
        .and_then(|settings| settings.get("Networks"))
        .and_then(Value::as_object)
    {
        body.insert(
            "NetworkingConfig".into(),
            json!({ "EndpointsConfig": networks.clone() }),
        );
    }
    for key in ["HostnamePath", "HostsPath", "LogPath", "ResolvConfPath"] {
        body.remove(key);
    }
    Value::Object(body)
}

fn portainer_exec_cmd(args: &Value) -> Result<Vec<String>, AppError> {
    if let Some(cmd) = args.get("cmd").or_else(|| args.get("command")) {
        if let Value::Array(items) = cmd {
            let parsed = items
                .iter()
                .filter_map(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(ToOwned::to_owned)
                .collect::<Vec<_>>();
            if !parsed.is_empty() {
                return Ok(parsed);
            }
        }
    }
    let command = validate_multiline_control_value(
        &required_arg_string(args, &["cmd", "command"], "exec command")?,
        "exec command",
    )?;
    Ok(vec!["sh".into(), "-lc".into(), command])
}

fn decode_docker_exec_output(bytes: &[u8]) -> String {
    let mut out = Vec::new();
    let mut offset = 0usize;
    let mut decoded_frames = false;

    while offset + 8 <= bytes.len() {
        let stream = bytes[offset];
        let size = u32::from_be_bytes([
            bytes[offset + 4],
            bytes[offset + 5],
            bytes[offset + 6],
            bytes[offset + 7],
        ]) as usize;
        if !matches!(stream, 1 | 2) || offset + 8 + size > bytes.len() {
            break;
        }
        out.extend_from_slice(&bytes[offset + 8..offset + 8 + size]);
        offset += 8 + size;
        decoded_frames = true;
    }

    if decoded_frames && offset == bytes.len() {
        String::from_utf8_lossy(&out).to_string()
    } else {
        String::from_utf8_lossy(bytes).to_string()
    }
}

fn validate_control_token(value: &str, label: &str) -> Result<String, AppError> {
    let clean = value.trim();
    if clean.is_empty() || clean.len() > 128 {
        return Err(AppError::BadRequest(format!("invalid {label}")));
    }
    if !clean
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '-' | '.' | ':' | '+' | '/'))
    {
        return Err(AppError::BadRequest(format!("invalid {label}")));
    }
    Ok(clean.to_string())
}

fn validate_proxmox_volume_id(value: &str, label: &str) -> Result<String, AppError> {
    let clean = value.trim();
    if clean.is_empty() || clean.len() > 512 {
        return Err(AppError::BadRequest(format!("invalid {label}")));
    }
    if !clean
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '-' | '.' | ':' | '+' | '/' | '='))
    {
        return Err(AppError::BadRequest(format!("invalid {label}")));
    }
    Ok(clean.to_string())
}

fn validate_restart_policy(value: &str) -> Result<String, AppError> {
    let clean = value.trim();
    match clean {
        "no" | "always" | "unless-stopped" | "on-failure" => Ok(clean.to_string()),
        _ => Err(AppError::BadRequest("invalid restart policy".into())),
    }
}

fn validate_proxmox_config_value(value: &str, label: &str) -> Result<String, AppError> {
    let clean = value.trim();
    if clean.is_empty() || clean.len() > 512 || clean.contains('\n') || clean.contains('\r') {
        return Err(AppError::BadRequest(format!("invalid {label}")));
    }
    Ok(clean.to_string())
}

fn has_numeric_suffix(value: &str, prefix: &str) -> bool {
    value
        .strip_prefix(prefix)
        .map(|suffix| !suffix.is_empty() && suffix.chars().all(|c| c.is_ascii_digit()))
        .unwrap_or(false)
}

fn validate_proxmox_network_key(value: &str) -> Result<String, AppError> {
    let key = validate_control_token(value, "network device")?;
    if has_numeric_suffix(&key, "net") {
        Ok(key)
    } else {
        Err(AppError::BadRequest(
            "network device must be net0, net1, ...".into(),
        ))
    }
}

fn validate_proxmox_disk_key(value: &str, kind: &str) -> Result<String, AppError> {
    let key = validate_control_token(value, "disk")?;
    let valid = if kind == "lxc" {
        key == "rootfs" || has_numeric_suffix(&key, "mp") || has_numeric_suffix(&key, "unused")
    } else {
        [
            "scsi", "virtio", "sata", "ide", "efidisk", "tpmstate", "unused",
        ]
        .iter()
        .any(|prefix| has_numeric_suffix(&key, prefix))
    };
    if valid {
        Ok(key)
    } else {
        Err(AppError::BadRequest("invalid Proxmox disk key".into()))
    }
}

fn validate_multiline_control_value(value: &str, label: &str) -> Result<String, AppError> {
    let clean = value.trim();
    if clean.is_empty() || clean.len() > 128_000 || clean.contains('\0') {
        return Err(AppError::BadRequest(format!("invalid {label}")));
    }
    Ok(clean.to_string())
}

fn selected_portainer_config(
    state: &AppState,
    instance_id: Option<&str>,
) -> Result<PortainerInstanceConfig, AppError> {
    let configs = portainer_configs(state);
    if configs.is_empty() {
        return Err(AppError::BadRequest(
            "No Portainer instances are configured".into(),
        ));
    }
    if let Some(instance_id) = instance_id.filter(|id| !id.trim().is_empty()) {
        return configs
            .into_iter()
            .find(|config| config.id == instance_id)
            .ok_or_else(|| {
                AppError::BadRequest(format!("unknown Portainer instance: {instance_id}"))
            });
    }
    configs
        .into_iter()
        .next()
        .ok_or_else(|| AppError::BadRequest("No Portainer instances are configured".into()))
}

async fn run_portainer_action(
    state: &AppState,
    action: &str,
    instance_id: Option<&str>,
    resource_type: &str,
    resource_id: &str,
    args: &Value,
    confirmation: Option<&str>,
) -> Result<Value, AppError> {
    let action = validate_docker_action(action)?;
    require_destructive_confirmation(action, resource_id, args, confirmation)?;
    if resource_type == "container" {
        let _ = validate_container_target(resource_id)?;
    }
    let config = selected_portainer_config(state, instance_id)?;
    let endpoint_id = args
        .get("endpoint_id")
        .or_else(|| args.get("endpointId"))
        .and_then(Value::as_i64);

    if resource_type == "container" && action == "exec" {
        let endpoint_id = endpoint_id
            .ok_or_else(|| AppError::BadRequest("container exec requires endpoint_id".into()))?;
        let client = insecure_client();
        let create_url = format!(
            "{}/api/endpoints/{endpoint_id}/docker/containers/{}/exec",
            config.url,
            urlencoding::encode(resource_id)
        );
        let create_body = json!({
            "AttachStdout": true,
            "AttachStderr": true,
            "Tty": false,
            "Cmd": portainer_exec_cmd(args)?,
        });
        let create_response = client
            .post(create_url)
            .header("X-API-Key", &config.token)
            .json(&create_body)
            .send()
            .await
            .map_err(|e| AppError::Internal(anyhow::anyhow!("Portainer exec failed: {e}")))?;
        if !create_response.status().is_success() {
            let status = create_response.status();
            let text = create_response.text().await.unwrap_or_default();
            return Err(AppError::BadRequest(format!(
                "Portainer exec failed ({status}): {text}"
            )));
        }
        let create_data = create_response
            .json::<Value>()
            .await
            .unwrap_or_else(|_| json!({}));
        let exec_id = create_data
            .get("Id")
            .and_then(Value::as_str)
            .ok_or_else(|| {
                AppError::BadRequest("Portainer exec did not return an exec id".into())
            })?;
        let start_url = format!(
            "{}/api/endpoints/{endpoint_id}/docker/exec/{}/start",
            config.url,
            urlencoding::encode(exec_id)
        );
        let start_response = client
            .post(start_url)
            .header("X-API-Key", &config.token)
            .json(&json!({ "Detach": false, "Tty": false }))
            .send()
            .await
            .map_err(|e| AppError::Internal(anyhow::anyhow!("Portainer exec start failed: {e}")))?;
        if !start_response.status().is_success() {
            let status = start_response.status();
            let text = start_response.text().await.unwrap_or_default();
            return Err(AppError::BadRequest(format!(
                "Portainer exec start failed ({status}): {text}"
            )));
        }
        let output = start_response
            .bytes()
            .await
            .map(|bytes| decode_docker_exec_output(&bytes))
            .unwrap_or_default();
        return Ok(json!({
            "mode": "portainer-api",
            "instance_id": config.id,
            "resource_type": resource_type,
            "resource_id": resource_id,
            "action": action,
            "response": {
                "exec_id": exec_id,
                "output": output,
            },
        }));
    }

    if resource_type == "container" && matches!(action, "duplicate" | "recreate") {
        let endpoint_id = endpoint_id.ok_or_else(|| {
            AppError::BadRequest("container duplicate/recreate requires endpoint_id".into())
        })?;
        let client = insecure_client();
        let inspect =
            portainer_container_inspect(&client, &config, endpoint_id, resource_id).await?;
        let body = portainer_container_clone_body(&inspect);
        let was_running = inspect
            .get("State")
            .and_then(|state| state.get("Running"))
            .and_then(Value::as_bool)
            .unwrap_or(false);
        let target_name = if action == "duplicate" {
            validate_control_token(
                &required_arg_string(args, &["new_name", "name"], "new container name")?,
                "new container name",
            )?
        } else {
            arg_string(args, &["name"])
                .or_else(|| {
                    inspect
                        .get("Name")
                        .and_then(Value::as_str)
                        .map(|name| name.trim_start_matches('/').to_string())
                })
                .filter(|name| !name.trim().is_empty())
                .ok_or_else(|| AppError::BadRequest("container name is required".into()))?
        };

        if action == "recreate" {
            let remove_url = format!(
                "{}/api/endpoints/{endpoint_id}/docker/containers/{}?force=true",
                config.url,
                urlencoding::encode(resource_id)
            );
            let remove_response = client
                .delete(remove_url)
                .header("X-API-Key", &config.token)
                .send()
                .await
                .map_err(|e| {
                    AppError::Internal(anyhow::anyhow!("Portainer recreate remove failed: {e}"))
                })?;
            if !remove_response.status().is_success() {
                let status = remove_response.status();
                let text = remove_response.text().await.unwrap_or_default();
                return Err(AppError::BadRequest(format!(
                    "Portainer recreate remove failed ({status}): {text}"
                )));
            }
        }

        let create_url = format!(
            "{}/api/endpoints/{endpoint_id}/docker/containers/create?name={}",
            config.url,
            urlencoding::encode(&target_name)
        );
        let create_response = client
            .post(create_url)
            .header("X-API-Key", &config.token)
            .json(&body)
            .send()
            .await
            .map_err(|e| {
                AppError::Internal(anyhow::anyhow!("Portainer {action} create failed: {e}"))
            })?;
        if !create_response.status().is_success() {
            let status = create_response.status();
            let text = create_response.text().await.unwrap_or_default();
            return Err(AppError::BadRequest(format!(
                "Portainer {action} create failed ({status}): {text}"
            )));
        }
        let create_data = create_response
            .json::<Value>()
            .await
            .unwrap_or_else(|_| json!({}));
        let new_id = create_data
            .get("Id")
            .and_then(Value::as_str)
            .unwrap_or(&target_name)
            .to_string();
        let should_start = optional_arg_bool(args, &["start"]).unwrap_or(was_running);
        if should_start {
            let start_url = format!(
                "{}/api/endpoints/{endpoint_id}/docker/containers/{}/start",
                config.url,
                urlencoding::encode(&new_id)
            );
            let start_response = client
                .post(start_url)
                .header("X-API-Key", &config.token)
                .send()
                .await
                .map_err(|e| {
                    AppError::Internal(anyhow::anyhow!("Portainer {action} start failed: {e}"))
                })?;
            if !start_response.status().is_success() {
                let status = start_response.status();
                let text = start_response.text().await.unwrap_or_default();
                return Err(AppError::BadRequest(format!(
                    "Portainer {action} start failed ({status}): {text}"
                )));
            }
        }
        return Ok(json!({
            "mode": "portainer-api",
            "instance_id": config.id,
            "resource_type": resource_type,
            "resource_id": resource_id,
            "action": action,
            "response": {
                "id": new_id,
                "name": target_name,
                "started": should_start,
            },
        }));
    }

    if resource_type == "stack" && action == "stack-logs" {
        let endpoint_id = endpoint_id
            .ok_or_else(|| AppError::BadRequest("stack logs require endpoint_id".into()))?;
        let data = portainer_stack_logs(insecure_client(), &config, endpoint_id, resource_id, args)
            .await?;
        return Ok(json!({
            "mode": "portainer-api",
            "instance_id": config.id,
            "resource_type": resource_type,
            "resource_id": resource_id,
            "action": action,
            "response": data,
        }));
    }

    let mut request_body: Option<Value> = None;
    let target_path = match (resource_type, action, endpoint_id) {
        ("container", "logs", Some(endpoint_id)) => format!(
            "/endpoints/{endpoint_id}/docker/containers/{}/logs?stdout=1&stderr=1&tail=200",
            urlencoding::encode(resource_id)
        ),
        ("container", "inspect", Some(endpoint_id)) => format!(
            "/endpoints/{endpoint_id}/docker/containers/{}/json",
            urlencoding::encode(resource_id)
        ),
        ("container", "stats", Some(endpoint_id)) => format!(
            "/endpoints/{endpoint_id}/docker/containers/{}/stats?stream=false",
            urlencoding::encode(resource_id)
        ),
        ("container", "exec", Some(endpoint_id)) => {
            request_body = Some(json!({
                "AttachStdout": true,
                "AttachStderr": true,
                "Tty": false,
                "Cmd": portainer_exec_cmd(args)?,
            }));
            format!(
                "/endpoints/{endpoint_id}/docker/containers/{}/exec",
                urlencoding::encode(resource_id)
            )
        }
        ("container", "rename", Some(endpoint_id)) => {
            let name = validate_control_token(
                &required_arg_string(args, &["new_name", "name"], "container name")?,
                "container name",
            )?;
            format!(
                "/endpoints/{endpoint_id}/docker/containers/{}/rename?name={}",
                urlencoding::encode(resource_id),
                urlencoding::encode(&name)
            )
        }
        ("container", "update-restart-policy", Some(endpoint_id)) => {
            let name = validate_restart_policy(&required_arg_string(
                args,
                &["restart_policy", "policy"],
                "restart policy",
            )?)?;
            request_body = Some(json!({
                "RestartPolicy": {
                    "Name": name,
                    "MaximumRetryCount": optional_arg_u64(args, &["maximum_retry_count", "retries"]).unwrap_or(0),
                }
            }));
            format!(
                "/endpoints/{endpoint_id}/docker/containers/{}/update",
                urlencoding::encode(resource_id)
            )
        }
        ("container", "update-resources", Some(endpoint_id)) => {
            let memory_mb = optional_arg_u64(args, &["memory_mb", "memoryMiB", "memory"]);
            let cpu_shares = optional_arg_u64(args, &["cpu_shares", "cpuShares"]);
            if memory_mb.is_none() && cpu_shares.is_none() {
                return Err(AppError::BadRequest(
                    "memory_mb or cpu_shares is required".into(),
                ));
            }
            let mut body = serde_json::Map::new();
            if let Some(memory_mb) = memory_mb {
                body.insert("Memory".into(), json!(memory_mb.saturating_mul(1_048_576)));
            }
            if let Some(cpu_shares) = cpu_shares {
                body.insert("CpuShares".into(), json!(cpu_shares));
            }
            request_body = Some(Value::Object(body));
            format!(
                "/endpoints/{endpoint_id}/docker/containers/{}/update",
                urlencoding::encode(resource_id)
            )
        }
        ("container", "remove", Some(endpoint_id)) | ("container", "delete", Some(endpoint_id)) => {
            format!(
                "/endpoints/{endpoint_id}/docker/containers/{}?force=true",
                urlencoding::encode(resource_id)
            )
        }
        ("container", action, Some(endpoint_id)) => format!(
            "/endpoints/{endpoint_id}/docker/containers/{}/{}",
            urlencoding::encode(resource_id),
            action
        ),
        ("stack", "delete", _) | ("stack", "remove", _) => {
            format!("/stacks/{}", urlencoding::encode(resource_id))
        }
        ("stack", "inspect-stack", _) => {
            format!("/stacks/{}", urlencoding::encode(resource_id))
        }
        ("stack", "redeploy", _) | ("stack", "restart", _) => {
            format!("/stacks/{}/git/redeploy", urlencoding::encode(resource_id))
        }
        ("stack", "start-stack" | "stop-stack", _) => {
            let endpoint_id = endpoint_id.ok_or_else(|| {
                AppError::BadRequest("stack lifecycle requires endpoint_id".into())
            })?;
            let lifecycle_action = if action == "start-stack" {
                "start"
            } else {
                "stop"
            };
            format!(
                "/stacks/{}/{lifecycle_action}?endpointId={endpoint_id}",
                urlencoding::encode(resource_id)
            )
        }
        ("stack", "stack-file", _) => {
            format!("/stacks/{}/file", urlencoding::encode(resource_id))
        }
        ("stack", "update-stack", _) => {
            let endpoint_id = endpoint_id
                .ok_or_else(|| AppError::BadRequest("stack update requires endpoint_id".into()))?;
            let compose = validate_multiline_control_value(
                &required_arg_string(
                    args,
                    &["stack_file_content", "compose", "content"],
                    "compose content",
                )?,
                "compose content",
            )?;
            request_body = Some(json!({
                "StackFileContent": compose,
                "Env": portainer_env_pairs(args),
                "Prune": optional_arg_bool(args, &["prune"]).unwrap_or(true),
            }));
            format!(
                "/stacks/{}?endpointId={endpoint_id}",
                urlencoding::encode(resource_id)
            )
        }
        ("endpoint", action, _) => {
            let endpoint_id = resource_id
                .parse::<i64>()
                .map_err(|_| AppError::BadRequest("endpoint id must be numeric".into()))?;
            match action {
                "inspect-endpoint" => format!("/endpoints/{endpoint_id}"),
                "prune-images" => format!("/endpoints/{endpoint_id}/docker/images/prune"),
                "prune-containers" => format!("/endpoints/{endpoint_id}/docker/containers/prune"),
                "prune-volumes" => format!("/endpoints/{endpoint_id}/docker/volumes/prune"),
                "prune-networks" => format!("/endpoints/{endpoint_id}/docker/networks/prune"),
                "pull-image" => {
                    let image = validate_proxmox_config_value(
                        &required_arg_string(args, &["image", "name"], "image")?,
                        "image",
                    )?;
                    let tag = validate_control_token(
                        &arg_string(args, &["tag"]).unwrap_or_else(|| "latest".into()),
                        "image tag",
                    )?;
                    format!(
                        "/endpoints/{endpoint_id}/docker/images/create?fromImage={}&tag={}",
                        urlencoding::encode(&image),
                        urlencoding::encode(&tag)
                    )
                }
                "create-volume" => {
                    let name = validate_control_token(
                        &required_arg_string(args, &["volume", "name"], "volume name")?,
                        "volume name",
                    )?;
                    let driver = validate_control_token(
                        &arg_string(args, &["driver"]).unwrap_or_else(|| "local".into()),
                        "volume driver",
                    )?;
                    request_body = Some(json!({
                        "Name": name,
                        "Driver": driver,
                    }));
                    format!("/endpoints/{endpoint_id}/docker/volumes/create")
                }
                "create-network" => {
                    let name = validate_control_token(
                        &required_arg_string(args, &["network", "name"], "network name")?,
                        "network name",
                    )?;
                    let driver = validate_control_token(
                        &arg_string(args, &["driver"]).unwrap_or_else(|| "bridge".into()),
                        "network driver",
                    )?;
                    request_body = Some(json!({
                        "Name": name,
                        "Driver": driver,
                        "CheckDuplicate": true,
                    }));
                    format!("/endpoints/{endpoint_id}/docker/networks/create")
                }
                "create-secret" => {
                    let name = validate_control_token(
                        &required_arg_string(args, &["secret", "name"], "secret name")?,
                        "secret name",
                    )?;
                    let data = validate_multiline_control_value(
                        &required_arg_string(args, &["data", "value"], "secret data")?,
                        "secret data",
                    )?;
                    let labels = arg_string_map(args, &["labels"]);
                    request_body = Some(json!({
                        "Name": name,
                        "Data": general_purpose::STANDARD.encode(data.as_bytes()),
                        "Labels": labels,
                    }));
                    format!("/endpoints/{endpoint_id}/docker/secrets/create")
                }
                "create-config" => {
                    let name = validate_control_token(
                        &required_arg_string(args, &["config", "name"], "config name")?,
                        "config name",
                    )?;
                    let data = validate_multiline_control_value(
                        &required_arg_string(args, &["data", "value"], "config data")?,
                        "config data",
                    )?;
                    let labels = arg_string_map(args, &["labels"]);
                    request_body = Some(json!({
                        "Name": name,
                        "Data": general_purpose::STANDARD.encode(data.as_bytes()),
                        "Labels": labels,
                    }));
                    format!("/endpoints/{endpoint_id}/docker/configs/create")
                }
                "create-container" => {
                    let name = validate_control_token(
                        &required_arg_string(args, &["container", "name"], "container name")?,
                        "container name",
                    )?;
                    let image = validate_proxmox_config_value(
                        &required_arg_string(args, &["image"], "image")?,
                        "image",
                    )?;
                    let restart_policy = arg_string(args, &["restart_policy", "policy"])
                        .map(|value| validate_restart_policy(&value))
                        .transpose()?
                        .unwrap_or_else(|| "unless-stopped".into());
                    let env = arg_string_list(args, &["env", "environment"]);
                    let labels = arg_string_map(args, &["labels"]);
                    let binds = arg_string_list(args, &["binds", "volumes"]);
                    let ports = docker_exposed_ports(args);
                    let mut host_config = serde_json::Map::new();
                    host_config.insert(
                        "RestartPolicy".into(),
                        json!({ "Name": restart_policy, "MaximumRetryCount": 0 }),
                    );
                    if !binds.is_empty() {
                        host_config.insert("Binds".into(), json!(binds));
                    }
                    if !ports.1.is_empty() {
                        host_config.insert("PortBindings".into(), Value::Object(ports.1));
                    }
                    if let Some(network_mode) = arg_string(args, &["network", "network_mode"]) {
                        host_config.insert(
                            "NetworkMode".into(),
                            json!(validate_control_token(&network_mode, "network mode")?),
                        );
                    }
                    if optional_arg_bool(args, &["privileged"]).unwrap_or(false) {
                        host_config.insert("Privileged".into(), json!(true));
                    }
                    if let Some(memory_mb) = optional_arg_u64(args, &["memory_mb", "memoryMiB"]) {
                        host_config
                            .insert("Memory".into(), json!(memory_mb.saturating_mul(1_048_576)));
                    }
                    if let Some(cpu_shares) = optional_arg_u64(args, &["cpu_shares", "cpuShares"]) {
                        host_config.insert("CpuShares".into(), json!(cpu_shares));
                    }
                    let mut body = serde_json::Map::new();
                    body.insert("Image".into(), json!(image));
                    if !env.is_empty() {
                        body.insert("Env".into(), json!(env));
                    }
                    if !labels.is_empty() {
                        body.insert("Labels".into(), Value::Object(labels));
                    }
                    if !ports.0.is_empty() {
                        body.insert("ExposedPorts".into(), Value::Object(ports.0));
                    }
                    if let Some(cmd) = docker_command(args) {
                        body.insert("Cmd".into(), json!(cmd));
                    }
                    body.insert("HostConfig".into(), Value::Object(host_config));
                    request_body = Some(Value::Object(body));
                    format!(
                        "/endpoints/{endpoint_id}/docker/containers/create?name={}",
                        urlencoding::encode(&name)
                    )
                }
                "create-stack" => {
                    let name = validate_control_token(
                        &required_arg_string(args, &["stack", "name"], "stack name")?,
                        "stack name",
                    )?;
                    let compose = validate_multiline_control_value(
                        &required_arg_string(
                            args,
                            &["stack_file_content", "compose", "content"],
                            "compose content",
                        )?,
                        "compose content",
                    )?;
                    request_body = Some(json!({
                        "Name": name,
                        "StackFileContent": compose,
                        "Env": portainer_env_pairs(args),
                    }));
                    format!("/stacks/create/standalone/string?endpointId={endpoint_id}")
                }
                _ => {
                    return Err(AppError::BadRequest(format!(
                        "endpoint/{action} is unsupported"
                    )));
                }
            }
        }
        ("image", "remove-image", Some(endpoint_id)) => format!(
            "/endpoints/{endpoint_id}/docker/images/{}?force=true",
            urlencoding::encode(resource_id)
        ),
        ("image", "inspect-image", Some(endpoint_id)) => format!(
            "/endpoints/{endpoint_id}/docker/images/{}/json",
            urlencoding::encode(resource_id)
        ),
        ("image", "history-image", Some(endpoint_id)) => format!(
            "/endpoints/{endpoint_id}/docker/images/{}/history",
            urlencoding::encode(resource_id)
        ),
        ("image", "tag-image", Some(endpoint_id)) => {
            let repo = validate_proxmox_config_value(
                &required_arg_string(args, &["repo", "repository", "name"], "image repository")?,
                "image repository",
            )?;
            let tag = validate_control_token(
                &arg_string(args, &["tag"]).unwrap_or_else(|| "latest".into()),
                "image tag",
            )?;
            format!(
                "/endpoints/{endpoint_id}/docker/images/{}/tag?repo={}&tag={}",
                urlencoding::encode(resource_id),
                urlencoding::encode(&repo),
                urlencoding::encode(&tag)
            )
        }
        ("volume", "remove-volume", Some(endpoint_id)) => format!(
            "/endpoints/{endpoint_id}/docker/volumes/{}?force=true",
            urlencoding::encode(resource_id)
        ),
        ("volume", "inspect-volume", Some(endpoint_id)) => format!(
            "/endpoints/{endpoint_id}/docker/volumes/{}",
            urlencoding::encode(resource_id)
        ),
        ("network", "remove-network", Some(endpoint_id)) => format!(
            "/endpoints/{endpoint_id}/docker/networks/{}",
            urlencoding::encode(resource_id)
        ),
        ("network", "inspect-network", Some(endpoint_id)) => format!(
            "/endpoints/{endpoint_id}/docker/networks/{}",
            urlencoding::encode(resource_id)
        ),
        ("network", "connect-container", Some(endpoint_id)) => {
            let container = validate_container_target(&required_arg_string(
                args,
                &["container", "container_id", "containerId"],
                "container",
            )?)?;
            request_body = Some(json!({
                "Container": container,
                "EndpointConfig": {},
            }));
            format!(
                "/endpoints/{endpoint_id}/docker/networks/{}/connect",
                urlencoding::encode(resource_id)
            )
        }
        ("network", "disconnect-container", Some(endpoint_id)) => {
            let container = validate_container_target(&required_arg_string(
                args,
                &["container", "container_id", "containerId"],
                "container",
            )?)?;
            request_body = Some(json!({
                "Container": container,
                "Force": optional_arg_bool(args, &["force"]).unwrap_or(true),
            }));
            format!(
                "/endpoints/{endpoint_id}/docker/networks/{}/disconnect",
                urlencoding::encode(resource_id)
            )
        }
        ("secret", "remove-secret", Some(endpoint_id)) => format!(
            "/endpoints/{endpoint_id}/docker/secrets/{}",
            urlencoding::encode(resource_id)
        ),
        ("secret", "inspect-secret", Some(endpoint_id)) => format!(
            "/endpoints/{endpoint_id}/docker/secrets/{}",
            urlencoding::encode(resource_id)
        ),
        ("config", "remove-config", Some(endpoint_id)) => format!(
            "/endpoints/{endpoint_id}/docker/configs/{}",
            urlencoding::encode(resource_id)
        ),
        ("config", "inspect-config", Some(endpoint_id)) => format!(
            "/endpoints/{endpoint_id}/docker/configs/{}",
            urlencoding::encode(resource_id)
        ),
        ("registry", "create-registry", _) => {
            request_body = Some(portainer_registry_body(args, true)?);
            "/registries".to_string()
        }
        ("registry", "update-registry", _) => {
            request_body = Some(portainer_registry_body(args, false)?);
            format!("/registries/{}", urlencoding::encode(resource_id))
        }
        ("registry", "inspect-registry", _) => {
            format!("/registries/{}", urlencoding::encode(resource_id))
        }
        ("registry", "remove-registry", _) | ("registry", "delete", _) => {
            format!("/registries/{}", urlencoding::encode(resource_id))
        }
        _ => {
            return Err(AppError::BadRequest(format!(
                "{resource_type}/{action} requires endpoint_id or is unsupported"
            )));
        }
    };

    let url = format!("{}/api{}", config.url, target_path);
    let client = insecure_client();
    let builder = match (resource_type, action) {
        ("container", "logs" | "inspect" | "stats")
        | ("endpoint", "inspect-endpoint")
        | ("image", "inspect-image" | "history-image")
        | ("volume", "inspect-volume")
        | ("network", "inspect-network")
        | ("secret", "inspect-secret")
        | ("config", "inspect-config")
        | ("registry", "inspect-registry")
        | ("stack", "inspect-stack" | "stack-file") => client.get(url),
        ("stack", "update-stack") => client.put(url),
        ("registry", "update-registry") => client.put(url),
        ("container", "remove" | "delete")
        | ("stack", "remove" | "delete")
        | ("image", "remove-image")
        | ("volume", "remove-volume")
        | ("network", "remove-network")
        | ("secret", "remove-secret")
        | ("config", "remove-config")
        | ("registry", "remove-registry" | "delete") => client.delete(url),
        _ => client.post(url),
    }
    .header("X-API-Key", &config.token);

    let response = if let Some(body) = request_body {
        builder.json(&body).send().await
    } else if resource_type == "stack" && matches!(action, "redeploy" | "restart") {
        builder.json(&json!({})).send().await
    } else {
        builder.send().await
    }
    .map_err(|e| AppError::Internal(anyhow::anyhow!("Portainer {action} failed: {e}")))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(AppError::BadRequest(format!(
            "Portainer {action} failed ({status}): {text}"
        )));
    }

    let data = if matches!(action, "logs" | "stack-file") {
        json!({ "logs": response.text().await.unwrap_or_default() })
    } else {
        response.json::<Value>().await.unwrap_or_else(|_| json!({}))
    };

    Ok(json!({
        "mode": "portainer-api",
        "instance_id": config.id,
        "resource_type": resource_type,
        "resource_id": resource_id,
        "action": action,
        "response": data,
    }))
}

fn selected_docker_host(
    state: &AppState,
    host_id: Option<&str>,
) -> Result<DockerHostConfig, AppError> {
    let hosts = docker_host_configs(state);
    if let Some(host_id) = host_id.filter(|id| !id.trim().is_empty()) {
        return hosts
            .into_iter()
            .find(|host| host.id == host_id)
            .ok_or_else(|| AppError::BadRequest(format!("unknown Docker host: {host_id}")));
    }
    hosts
        .into_iter()
        .next()
        .ok_or_else(|| AppError::BadRequest("No Docker SSH hosts configured".into()))
}

async fn run_docker_ssh_action(
    state: &AppState,
    action: &str,
    host_id: Option<&str>,
    resource_type: &str,
    resource_id: &str,
    args: &Value,
    confirmation: Option<&str>,
) -> Result<Value, AppError> {
    let action = validate_docker_action(action)?;
    require_destructive_confirmation(action, resource_id, args, confirmation)?;
    if resource_type != "container" {
        return Err(AppError::BadRequest(format!(
            "docker-ssh only supports container actions, got {resource_type}"
        )));
    }
    let host = selected_docker_host(state, host_id)?;
    let docker_action = if action == "remove" { "rm" } else { action };
    let target = validate_container_target(resource_id)?;
    let remote_command = match docker_action {
        "logs" => format!("docker logs --tail 200 {target}"),
        "inspect" => format!("docker inspect {target}"),
        "stats" => format!("docker stats --no-stream --format '{{{{json .}}}}' {target}"),
        "rm" => format!("docker rm -f {target}"),
        _ => format!("docker {docker_action} {target}"),
    };

    let output = Command::new("ssh")
        .args([
            "-o",
            "BatchMode=yes",
            "-o",
            "ConnectTimeout=6",
            &host.host,
            &remote_command,
        ])
        .output()
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("docker-ssh {action} failed: {e}")))?;

    if !output.status.success() {
        return Err(AppError::BadRequest(format!(
            "docker-ssh {action} failed: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        )));
    }

    let response = if matches!(action, "logs" | "inspect" | "stats") {
        json!({ "logs": String::from_utf8_lossy(&output.stdout).to_string() })
    } else {
        json!({ "output": String::from_utf8_lossy(&output.stdout).trim() })
    };

    Ok(json!({
        "mode": "docker-ssh",
        "host_id": host.id,
        "resource_type": resource_type,
        "resource_id": resource_id,
        "action": action,
        "response": response,
    }))
}

async fn run_opnsense_action(
    state: &AppState,
    action: &str,
    resource_type: &str,
    resource_id: &str,
    args: &Value,
    confirmation: Option<&str>,
) -> Result<Value, AppError> {
    let action = validate_opnsense_action(action)?;
    require_destructive_confirmation(action, resource_id, args, confirmation)?;
    if resource_type != "service" {
        return Err(AppError::BadRequest(format!(
            "OPNsense only supports service controls, got {resource_type}"
        )));
    }
    let service = validate_control_token(
        &arg_string(args, &["service", "id", "name"]).unwrap_or_else(|| resource_id.to_string()),
        "OPNsense service",
    )?;
    let configs = opnsense_api_configs(state);
    let config = configs
        .into_iter()
        .next()
        .ok_or_else(|| AppError::BadRequest("OPNsense API is not configured".into()))?;
    let url = format!(
        "{}/api/core/service/{}/{}",
        config.url,
        action,
        urlencoding::encode(&service)
    );
    let client = insecure_client();
    let response = client
        .post(url)
        .basic_auth(&config.key, Some(&config.secret))
        .json(&json!({}))
        .send()
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("OPNsense {action} failed: {e}")))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(AppError::BadRequest(format!(
            "OPNsense {action} failed ({status}): {text}"
        )));
    }

    let data = response.json::<Value>().await.unwrap_or_else(|_| json!({}));
    Ok(json!({
        "mode": "opnsense-api",
        "resource_type": resource_type,
        "resource_id": service,
        "action": action,
        "response": data,
    }))
}

async fn run_system_action(
    state: &AppState,
    action: &str,
    resource_type: &str,
    resource_id: &str,
    _args: &Value,
    confirmation: Option<&str>,
) -> Result<Value, AppError> {
    let action = validate_system_action(action)?;
    require_destructive_confirmation(action, resource_id, &json!({}), confirmation)?;
    if resource_type != "system" {
        return Err(AppError::BadRequest(format!(
            "system controls only support system resources, got {resource_type}"
        )));
    }
    let def = HOMELAB_SYSTEM_DEFINITIONS
        .iter()
        .find(|def| def.id == resource_id)
        .ok_or_else(|| AppError::BadRequest(format!("unknown homelab system: {resource_id}")))?;
    let env = homelab_env_values();
    let values = homelab_system_values(state, &env, def);
    if values.is_empty() {
        return Err(AppError::BadRequest(format!(
            "{} is not configured",
            def.name
        )));
    }
    let urls = values
        .iter()
        .filter_map(|(key, value)| homelab_system_url(value).map(|url| (key.clone(), url)))
        .collect::<Vec<_>>();

    if action == "open" {
        return Ok(json!({
            "mode": "homelab-system",
            "resource_type": resource_type,
            "resource_id": resource_id,
            "action": action,
            "response": {
                "name": def.name,
                "urls": urls.iter().map(|(key, url)| json!({ "key": key, "url": url })).collect::<Vec<_>>(),
                "url": urls.first().map(|(_, url)| url.clone()),
            }
        }));
    }

    let client = insecure_client();
    let mut checks = Vec::new();
    for (key, url) in &urls {
        let started = std::time::Instant::now();
        let result = client.get(url).send().await;
        match result {
            Ok(response) => {
                checks.push(json!({
                    "key": key,
                    "url": url,
                    "status": response.status().as_u16(),
                    "ok": response.status().is_success(),
                    "latency_ms": started.elapsed().as_millis() as u64,
                }));
            }
            Err(err) => {
                checks.push(json!({
                    "key": key,
                    "url": url,
                    "ok": false,
                    "error": err.to_string(),
                    "latency_ms": started.elapsed().as_millis() as u64,
                }));
            }
        }
    }

    Ok(json!({
        "mode": "homelab-system",
        "resource_type": resource_type,
        "resource_id": resource_id,
        "action": action,
        "response": {
            "name": def.name,
            "configured_keys": values.iter().map(|(key, _)| key.clone()).collect::<Vec<_>>(),
            "checks": checks,
            "ok": checks.iter().all(|check| check.get("ok").and_then(Value::as_bool).unwrap_or(false)),
        }
    }))
}

async fn run_proxmox_action(
    state: &AppState,
    action: &str,
    node: &str,
    kind: &str,
    vmid: u64,
    args: &Value,
    confirmation: Option<&str>,
) -> Result<Value, AppError> {
    let action = validate_proxmox_action(action)?;
    require_destructive_confirmation(action, &vmid.to_string(), args, confirmation)?;
    let kind = validate_proxmox_kind(kind)?;
    let node = node.trim();
    if node.is_empty() {
        return Err(AppError::BadRequest("Proxmox node is required".into()));
    }

    let configs = proxmox_api_configs(state);
    if configs.is_empty() {
        return Err(AppError::BadRequest(
            "Proxmox API credentials are required for control actions".into(),
        ));
    }

    let client = insecure_client();
    let encoded_node = urlencoding::encode(node);
    for config in configs {
        let auth_header = format!("PVEAPIToken={}={}", config.token_id, config.token_secret);
        let base = format!(
            "{}/api2/json/nodes/{}/{}/{}",
            config.url, encoded_node, kind, vmid
        );

        if action == "console" {
            return Ok(json!({
                "mode": "proxmox-api",
                "source": config.origin,
                "target": {
                    "node": node,
                    "kind": kind,
                    "vmid": vmid,
                },
                "action": action,
                "response": {
                    "url": format!("{}/#v1:0:18:4:::::::{}::{}/{}", config.url, encoded_node, kind, vmid),
                },
            }));
        }

        let mut form: Vec<(String, String)> = Vec::new();
        let (method, path) = match action {
            "start" | "shutdown" | "reboot" | "stop" => ("post", format!("{base}/status/{action}")),
            "delete" => ("delete", base.clone()),
            "set-memory" => {
                let memory =
                    required_arg_u64(args, &["memory_mb", "memoryMiB", "memory"], "memory MiB")?;
                if !(64..=1_048_576).contains(&memory) {
                    return Err(AppError::BadRequest("memory MiB is out of range".into()));
                }
                form.push(("memory".to_string(), memory.to_string()));
                ("post", format!("{base}/config"))
            }
            "set-cpu" => {
                let cores = required_arg_u64(args, &["cores", "cpu"], "CPU cores")?;
                if !(1..=256).contains(&cores) {
                    return Err(AppError::BadRequest("CPU cores is out of range".into()));
                }
                form.push(("cores".to_string(), cores.to_string()));
                ("post", format!("{base}/config"))
            }
            "set-name" => {
                let name = validate_proxmox_config_value(
                    &required_arg_string(args, &["name", "value"], "name")?,
                    "name",
                )?;
                form.push(("name".to_string(), name));
                ("post", format!("{base}/config"))
            }
            "set-description" => {
                let description = validate_proxmox_config_value(
                    &required_arg_string(args, &["description", "value"], "description")?,
                    "description",
                )?;
                form.push(("description".to_string(), description));
                ("post", format!("{base}/config"))
            }
            "set-tags" => {
                let tags = validate_proxmox_config_value(
                    &required_arg_string(args, &["tags", "value"], "tags")?,
                    "tags",
                )?;
                form.push(("tags".to_string(), tags));
                ("post", format!("{base}/config"))
            }
            "set-onboot" => {
                let onboot = optional_arg_bool(args, &["onboot", "value"])
                    .ok_or_else(|| AppError::BadRequest("onboot boolean is required".into()))?;
                form.push((
                    "onboot".to_string(),
                    if onboot { "1" } else { "0" }.to_string(),
                ));
                ("post", format!("{base}/config"))
            }
            "set-protection" => {
                let protection = optional_arg_bool(args, &["protection", "value"])
                    .ok_or_else(|| AppError::BadRequest("protection boolean is required".into()))?;
                form.push((
                    "protection".to_string(),
                    if protection { "1" } else { "0" }.to_string(),
                ));
                ("post", format!("{base}/config"))
            }
            "set-firewall" => {
                if let Some(enable) = optional_arg_bool(args, &["enable", "enabled", "value"]) {
                    form.push((
                        "enable".to_string(),
                        if enable { "1" } else { "0" }.to_string(),
                    ));
                }
                if let Some(policy) = arg_string(args, &["policy_in", "policyIn"]) {
                    form.push((
                        "policy_in".to_string(),
                        validate_proxmox_firewall_policy(&policy)?,
                    ));
                }
                if let Some(policy) = arg_string(args, &["policy_out", "policyOut"]) {
                    form.push((
                        "policy_out".to_string(),
                        validate_proxmox_firewall_policy(&policy)?,
                    ));
                }
                for (arg_key, form_key) in [
                    ("log_level_in", "log_level_in"),
                    ("logLevelIn", "log_level_in"),
                    ("log_level_out", "log_level_out"),
                    ("logLevelOut", "log_level_out"),
                ] {
                    if let Some(level) = arg_string(args, &[arg_key]) {
                        form.push((
                            form_key.to_string(),
                            validate_control_token(&level, "firewall log level")?,
                        ));
                    }
                }
                if form.is_empty() {
                    return Err(AppError::BadRequest(
                        "at least one firewall option is required".into(),
                    ));
                }
                ("put", format!("{base}/firewall/options"))
            }
            "add-firewall-rule" => {
                form = proxmox_firewall_rule_form(args, true)?;
                ("post", format!("{base}/firewall/rules"))
            }
            "update-firewall-rule" => {
                let pos = proxmox_firewall_rule_pos(args)?;
                form = proxmox_firewall_rule_form(args, false)?;
                ("put", format!("{base}/firewall/rules/{pos}"))
            }
            "delete-firewall-rule" => {
                let pos = proxmox_firewall_rule_pos(args)?;
                ("delete", format!("{base}/firewall/rules/{pos}"))
            }
            "set-network" => {
                let key = validate_proxmox_network_key(
                    &arg_string(args, &["net", "iface", "key"]).unwrap_or_else(|| "net0".into()),
                )?;
                let value = validate_proxmox_config_value(
                    &required_arg_string(args, &["value", "config"], "network config")?,
                    "network config",
                )?;
                form.push((key, value));
                ("post", format!("{base}/config"))
            }
            "add-network" => {
                let key = validate_proxmox_network_key(&required_arg_string(
                    args,
                    &["net", "iface", "key"],
                    "network device",
                )?)?;
                let value = validate_proxmox_config_value(
                    &required_arg_string(args, &["value", "config"], "network config")?,
                    "network config",
                )?;
                form.push((key, value));
                ("post", format!("{base}/config"))
            }
            "remove-network" => {
                let key = validate_proxmox_network_key(&required_arg_string(
                    args,
                    &["net", "iface", "key"],
                    "network device",
                )?)?;
                form.push(("delete".to_string(), key));
                ("post", format!("{base}/config"))
            }
            "resize-disk" => {
                let disk = validate_proxmox_disk_key(
                    &arg_string(args, &["disk"]).unwrap_or_else(|| {
                        if kind == "lxc" {
                            "rootfs".to_string()
                        } else {
                            "scsi0".to_string()
                        }
                    }),
                    kind,
                )?;
                let size = validate_control_token(
                    &required_arg_string(args, &["size"], "disk size")?,
                    "disk size",
                )?;
                form.push(("disk".to_string(), disk));
                form.push(("size".to_string(), size));
                ("put", format!("{base}/resize"))
            }
            "add-disk" => {
                let disk = validate_proxmox_disk_key(
                    &required_arg_string(args, &["disk", "key"], "disk")?,
                    kind,
                )?;
                let value = validate_proxmox_config_value(
                    &required_arg_string(args, &["value", "config"], "disk config")?,
                    "disk config",
                )?;
                form.push((disk, value));
                ("post", format!("{base}/config"))
            }
            "remove-disk" => {
                let disk = validate_proxmox_disk_key(
                    &required_arg_string(args, &["disk", "key"], "disk")?,
                    kind,
                )?;
                form.push(("delete".to_string(), disk));
                ("post", format!("{base}/config"))
            }
            "snapshot" => {
                let snapname = validate_control_token(
                    &required_arg_string(args, &["snapname", "snapshot"], "snapshot name")?,
                    "snapshot name",
                )?;
                form.push(("snapname".to_string(), snapname));
                if let Some(description) = arg_string(args, &["description"]) {
                    form.push(("description".to_string(), description));
                }
                ("post", format!("{base}/snapshot"))
            }
            "delete-snapshot" => {
                let snapshot = validate_control_token(
                    &required_arg_string(args, &["snapname", "snapshot"], "snapshot name")?,
                    "snapshot name",
                )?;
                ("delete", format!("{base}/snapshot/{snapshot}"))
            }
            "rollback-snapshot" => {
                let snapshot = validate_control_token(
                    &required_arg_string(args, &["snapname", "snapshot"], "snapshot name")?,
                    "snapshot name",
                )?;
                ("post", format!("{base}/snapshot/{snapshot}/rollback"))
            }
            "migrate" => {
                let target = validate_control_token(
                    &required_arg_string(args, &["target", "target_node"], "target node")?,
                    "target node",
                )?;
                form.push(("target".to_string(), target));
                if optional_arg_bool(args, &["online"]).unwrap_or(false) {
                    form.push(("online".to_string(), "1".to_string()));
                }
                ("post", format!("{base}/migrate"))
            }
            "clone" => {
                let newid = required_arg_u64(args, &["newid", "vmid"], "new VMID")?;
                form.push(("newid".to_string(), newid.to_string()));
                if let Some(name) = arg_string(args, &["name"]) {
                    form.push(("name".to_string(), name));
                }
                if let Some(target) = arg_string(args, &["target", "target_node"]) {
                    form.push((
                        "target".to_string(),
                        validate_control_token(&target, "target node")?,
                    ));
                }
                ("post", format!("{base}/clone"))
            }
            "backup" => {
                form.push(("vmid".to_string(), vmid.to_string()));
                let mode = arg_string(args, &["mode"])
                    .map(|value| validate_control_token(&value, "backup mode"))
                    .transpose()?
                    .unwrap_or_else(|| "snapshot".into());
                if !matches!(mode.as_str(), "snapshot" | "suspend" | "stop") {
                    return Err(AppError::BadRequest("invalid backup mode".into()));
                }
                form.push(("mode".to_string(), mode));
                if let Some(storage) = arg_string(args, &["storage"]) {
                    form.push((
                        "storage".to_string(),
                        validate_control_token(&storage, "backup storage")?,
                    ));
                }
                if let Some(compress) = arg_string(args, &["compress"]) {
                    form.push((
                        "compress".to_string(),
                        validate_control_token(&compress, "backup compression")?,
                    ));
                }
                if let Some(notes) = arg_string(args, &["notes", "description"]) {
                    form.push((
                        "notes-template".to_string(),
                        validate_proxmox_config_value(&notes, "backup notes")?,
                    ));
                }
                (
                    "post",
                    format!("{}/api2/json/nodes/{encoded_node}/vzdump", config.url),
                )
            }
            "add-ha" => {
                form.push(("sid".to_string(), proxmox_ha_sid(kind, vmid)));
                let state = arg_string(args, &["state"])
                    .map(|value| validate_proxmox_ha_state(&value))
                    .transpose()?
                    .unwrap_or_else(|| "started".into());
                form.push(("state".to_string(), state));
                if let Some(group) = arg_string(args, &["group"]) {
                    form.push((
                        "group".to_string(),
                        validate_control_token(&group, "HA group")?,
                    ));
                }
                if let Some(comment) = arg_string(args, &["comment", "notes"]) {
                    form.push((
                        "comment".to_string(),
                        validate_proxmox_config_value(&comment, "HA comment")?,
                    ));
                }
                (
                    "post",
                    format!("{}/api2/json/cluster/ha/resources", config.url),
                )
            }
            "set-ha-state" => {
                let state =
                    validate_proxmox_ha_state(&required_arg_string(args, &["state"], "HA state")?)?;
                form.push(("state".to_string(), state));
                let sid = proxmox_ha_sid(kind, vmid);
                let encoded_sid = urlencoding::encode(&sid);
                (
                    "put",
                    format!(
                        "{}/api2/json/cluster/ha/resources/{encoded_sid}",
                        config.url
                    ),
                )
            }
            "remove-ha" => {
                let sid = proxmox_ha_sid(kind, vmid);
                let encoded_sid = urlencoding::encode(&sid);
                (
                    "delete",
                    format!(
                        "{}/api2/json/cluster/ha/resources/{encoded_sid}",
                        config.url
                    ),
                )
            }
            _ => unreachable!("validated Proxmox action"),
        };

        let mut request = match method {
            "delete" => client.delete(path),
            "put" => client.put(path),
            _ => client.post(path),
        }
        .header("Authorization", &auth_header);
        if !form.is_empty() {
            request = request.form(&form);
        }

        match request.send().await {
            Ok(res) if res.status().is_success() => {
                let body = res.json::<Value>().await.unwrap_or_else(|_| json!({}));
                return Ok(json!({
                    "mode": "proxmox-api",
                    "source": config.origin,
                    "target": {
                        "node": node,
                        "kind": kind,
                        "vmid": vmid,
                    },
                    "action": action,
                    "response": body,
                }));
            }
            Ok(res) => {
                warn!(
                    source = config.origin,
                    status = %res.status(),
                    action,
                    node,
                    vmid,
                    "Proxmox control endpoint returned non-success"
                );
            }
            Err(err) => {
                warn!(
                    source = config.origin,
                    error = %err,
                    action,
                    node,
                    vmid,
                    "Proxmox control endpoint failed"
                );
            }
        }
    }

    Err(AppError::BadRequest(format!(
        "Proxmox {action} failed for {kind}/{vmid} on {node}"
    )))
}

async fn run_proxmox_node_action(
    state: &AppState,
    action: &str,
    node: &str,
    args: &Value,
    confirmation: Option<&str>,
) -> Result<Value, AppError> {
    let action = validate_proxmox_action(action)?;
    if !matches!(action, "reboot" | "shutdown" | "create-vm" | "create-lxc") {
        return Err(AppError::BadRequest(format!(
            "unsupported Proxmox node action: {action}"
        )));
    }
    require_destructive_confirmation(action, node, args, confirmation)?;
    let node = validate_control_token(node, "node")?;

    let configs = proxmox_api_configs(state);
    if configs.is_empty() {
        return Err(AppError::BadRequest(
            "Proxmox API credentials are required for node controls".into(),
        ));
    }

    let client = insecure_client();
    let encoded_node = urlencoding::encode(&node);
    for config in configs {
        let auth_header = format!("PVEAPIToken={}={}", config.token_id, config.token_secret);
        let mut form: Vec<(String, String)> = Vec::new();
        let url = match action {
            "reboot" | "shutdown" => {
                form.push(("command".to_string(), action.to_string()));
                format!("{}/api2/json/nodes/{encoded_node}/status", config.url)
            }
            "create-vm" => {
                let vmid = required_arg_u64(args, &["vmid", "newid"], "VMID")?;
                let name = validate_proxmox_config_value(
                    &required_arg_string(args, &["name"], "VM name")?,
                    "VM name",
                )?;
                let memory =
                    optional_arg_u64(args, &["memory_mb", "memoryMiB", "memory"]).unwrap_or(2048);
                let cores = optional_arg_u64(args, &["cores", "cpu"]).unwrap_or(2);
                if !(64..=1_048_576).contains(&memory) {
                    return Err(AppError::BadRequest("memory MiB is out of range".into()));
                }
                if !(1..=256).contains(&cores) {
                    return Err(AppError::BadRequest("CPU cores is out of range".into()));
                }
                let storage = validate_control_token(
                    &arg_string(args, &["storage"]).unwrap_or_else(|| "local-lvm".into()),
                    "storage",
                )?;
                let disk_size = validate_control_token(
                    &arg_string(args, &["disk_size", "size"]).unwrap_or_else(|| "32G".into()),
                    "disk size",
                )?;
                let net0 = validate_proxmox_config_value(
                    &arg_string(args, &["net0", "network"])
                        .unwrap_or_else(|| "virtio,bridge=vmbr0,firewall=1".into()),
                    "network config",
                )?;
                form.extend([
                    ("vmid".to_string(), vmid.to_string()),
                    ("name".to_string(), name),
                    ("memory".to_string(), memory.to_string()),
                    ("cores".to_string(), cores.to_string()),
                    ("scsihw".to_string(), "virtio-scsi-pci".to_string()),
                    ("scsi0".to_string(), format!("{storage}:{disk_size}")),
                    ("net0".to_string(), net0),
                    ("ostype".to_string(), "l26".to_string()),
                    ("agent".to_string(), "1".to_string()),
                ]);
                if optional_arg_bool(args, &["start"]).unwrap_or(false) {
                    form.push(("start".to_string(), "1".to_string()));
                }
                format!("{}/api2/json/nodes/{encoded_node}/qemu", config.url)
            }
            "create-lxc" => {
                let vmid = required_arg_u64(args, &["vmid", "newid"], "VMID")?;
                let hostname = validate_proxmox_config_value(
                    &required_arg_string(args, &["hostname", "name"], "hostname")?,
                    "hostname",
                )?;
                let ostemplate = validate_control_token(
                    &required_arg_string(args, &["ostemplate", "template"], "OS template")?,
                    "OS template",
                )?;
                let memory =
                    optional_arg_u64(args, &["memory_mb", "memoryMiB", "memory"]).unwrap_or(1024);
                let cores = optional_arg_u64(args, &["cores", "cpu"]).unwrap_or(1);
                if !(64..=1_048_576).contains(&memory) {
                    return Err(AppError::BadRequest("memory MiB is out of range".into()));
                }
                if !(1..=256).contains(&cores) {
                    return Err(AppError::BadRequest("CPU cores is out of range".into()));
                }
                let storage = validate_control_token(
                    &arg_string(args, &["storage"]).unwrap_or_else(|| "local-lvm".into()),
                    "storage",
                )?;
                let disk_size = validate_control_token(
                    &arg_string(args, &["disk_size", "size"]).unwrap_or_else(|| "8G".into()),
                    "disk size",
                )?;
                let net0 = validate_proxmox_config_value(
                    &arg_string(args, &["net0", "network"])
                        .unwrap_or_else(|| "name=eth0,bridge=vmbr0,ip=dhcp,firewall=1".into()),
                    "network config",
                )?;
                form.extend([
                    ("vmid".to_string(), vmid.to_string()),
                    ("hostname".to_string(), hostname),
                    ("ostemplate".to_string(), ostemplate),
                    ("memory".to_string(), memory.to_string()),
                    ("cores".to_string(), cores.to_string()),
                    ("rootfs".to_string(), format!("{storage}:{disk_size}")),
                    ("net0".to_string(), net0),
                    ("unprivileged".to_string(), "1".to_string()),
                ]);
                if optional_arg_bool(args, &["start"]).unwrap_or(false) {
                    form.push(("start".to_string(), "1".to_string()));
                }
                format!("{}/api2/json/nodes/{encoded_node}/lxc", config.url)
            }
            _ => unreachable!("validated Proxmox node action"),
        };
        let response = client
            .post(url)
            .header("Authorization", &auth_header)
            .form(&form)
            .send()
            .await;

        match response {
            Ok(res) if res.status().is_success() => {
                let body = res.json::<Value>().await.unwrap_or_else(|_| json!({}));
                return Ok(json!({
                    "mode": "proxmox-api",
                    "source": config.origin,
                    "target": { "node": node },
                    "action": action,
                    "response": body,
                }));
            }
            Ok(res) => {
                warn!(
                    source = config.origin,
                    status = %res.status(),
                    action,
                    node,
                    "Proxmox node control endpoint returned non-success"
                );
            }
            Err(err) => {
                warn!(
                    source = config.origin,
                    error = %err,
                    action,
                    node,
                    "Proxmox node control endpoint failed"
                );
            }
        }
    }

    Err(AppError::BadRequest(format!(
        "Proxmox node {action} failed for {node}"
    )))
}

async fn run_proxmox_restore_action(
    state: &AppState,
    node: &str,
    resource_id: &str,
    args: &Value,
    confirmation: Option<&str>,
) -> Result<Value, AppError> {
    let action = validate_proxmox_action("restore")?;
    require_destructive_confirmation(action, resource_id, args, confirmation)?;
    let node = validate_control_token(node, "node")?;
    let archive = validate_proxmox_volume_id(
        &arg_string(args, &["archive", "volid"]).unwrap_or_else(|| resource_id.to_string()),
        "backup archive",
    )?;
    let kind = validate_proxmox_kind(
        &arg_string(args, &["kind", "subtype"])
            .or_else(|| proxmox_backup_kind(&archive))
            .unwrap_or_else(|| "qemu".into()),
    )?
    .to_string();
    let vmid = required_arg_u64(args, &["vmid", "newid", "target_vmid"], "target VMID")?;
    let force = optional_arg_bool(args, &["force"]).unwrap_or(false);

    let configs = proxmox_api_configs(state);
    if configs.is_empty() {
        return Err(AppError::BadRequest(
            "Proxmox API credentials are required for restore controls".into(),
        ));
    }

    let client = insecure_client();
    let encoded_node = urlencoding::encode(&node);
    for config in configs {
        let auth_header = format!("PVEAPIToken={}={}", config.token_id, config.token_secret);
        let mut form = vec![("vmid".to_string(), vmid.to_string())];
        let url = if kind == "lxc" {
            form.push(("ostemplate".to_string(), archive.clone()));
            form.push(("restore".to_string(), "1".to_string()));
            format!("{}/api2/json/nodes/{encoded_node}/lxc", config.url)
        } else {
            form.push(("archive".to_string(), archive.clone()));
            format!("{}/api2/json/nodes/{encoded_node}/qemu", config.url)
        };
        if let Some(storage) = arg_string(args, &["storage"]) {
            form.push((
                "storage".to_string(),
                validate_control_token(&storage, "target storage")?,
            ));
        }
        if force {
            form.push(("force".to_string(), "1".to_string()));
        }
        if kind == "qemu" && optional_arg_bool(args, &["unique"]).unwrap_or(false) {
            form.push(("unique".to_string(), "1".to_string()));
        }

        match client
            .post(url)
            .header("Authorization", &auth_header)
            .form(&form)
            .send()
            .await
        {
            Ok(res) if res.status().is_success() => {
                let body = res.json::<Value>().await.unwrap_or_else(|_| json!({}));
                return Ok(json!({
                    "mode": "proxmox-api",
                    "source": config.origin,
                    "target": {
                        "node": node,
                        "kind": kind,
                        "vmid": vmid,
                        "archive": archive,
                    },
                    "action": action,
                    "response": body,
                }));
            }
            Ok(res) => {
                warn!(
                    source = config.origin,
                    status = %res.status(),
                    action,
                    node,
                    vmid,
                    archive,
                    "Proxmox restore endpoint returned non-success"
                );
            }
            Err(err) => {
                warn!(
                    source = config.origin,
                    error = %err,
                    action,
                    node,
                    vmid,
                    archive,
                    "Proxmox restore endpoint failed"
                );
            }
        }
    }

    Err(AppError::BadRequest(format!(
        "Proxmox restore failed for {archive} on {node}"
    )))
}

async fn run_proxmox_delete_backup_action(
    state: &AppState,
    node: &str,
    resource_id: &str,
    args: &Value,
    confirmation: Option<&str>,
) -> Result<Value, AppError> {
    let action = validate_proxmox_action("delete-backup")?;
    require_destructive_confirmation(action, resource_id, args, confirmation)?;
    let node = validate_control_token(node, "node")?;
    let storage = validate_control_token(
        &required_arg_string(args, &["storage"], "backup storage")?,
        "backup storage",
    )?;
    let archive = validate_proxmox_volume_id(
        &arg_string(args, &["archive", "volid"]).unwrap_or_else(|| resource_id.to_string()),
        "backup archive",
    )?;

    let configs = proxmox_api_configs(state);
    if configs.is_empty() {
        return Err(AppError::BadRequest(
            "Proxmox API credentials are required for backup delete controls".into(),
        ));
    }

    let client = insecure_client();
    let encoded_node = urlencoding::encode(&node);
    let encoded_storage = urlencoding::encode(&storage);
    let encoded_archive = urlencoding::encode(&archive);
    for config in configs {
        let auth_header = format!("PVEAPIToken={}={}", config.token_id, config.token_secret);
        let url = format!(
            "{}/api2/json/nodes/{encoded_node}/storage/{encoded_storage}/content/{encoded_archive}",
            config.url
        );

        match client
            .delete(url)
            .header("Authorization", &auth_header)
            .send()
            .await
        {
            Ok(res) if res.status().is_success() => {
                let body = res.json::<Value>().await.unwrap_or_else(|_| json!({}));
                return Ok(json!({
                    "mode": "proxmox-api",
                    "source": config.origin,
                    "target": {
                        "node": node,
                        "storage": storage,
                        "archive": archive,
                    },
                    "action": action,
                    "response": body,
                }));
            }
            Ok(res) => {
                warn!(
                    source = config.origin,
                    status = %res.status(),
                    action,
                    node,
                    archive,
                    "Proxmox backup delete endpoint returned non-success"
                );
            }
            Err(err) => {
                warn!(
                    source = config.origin,
                    error = %err,
                    action,
                    node,
                    archive,
                    "Proxmox backup delete endpoint failed"
                );
            }
        }
    }

    Err(AppError::BadRequest(format!(
        "Proxmox backup delete failed for {archive} on {node}"
    )))
}

async fn run_proxmox_storage_action(
    state: &AppState,
    action: &str,
    resource_id: &str,
    args: &Value,
    confirmation: Option<&str>,
) -> Result<Value, AppError> {
    let action = validate_proxmox_action(action)?;
    if !matches!(action, "enable-storage" | "disable-storage") {
        return Err(AppError::BadRequest(format!(
            "unsupported Proxmox storage action: {action}"
        )));
    }
    require_destructive_confirmation(action, resource_id, args, confirmation)?;
    let storage = validate_control_token(
        &arg_string(args, &["storage", "name"]).unwrap_or_else(|| resource_id.to_string()),
        "storage",
    )?;
    let node = arg_string(args, &["node"])
        .map(|value| validate_control_token(&value, "node"))
        .transpose()?;

    let configs = proxmox_api_configs(state);
    if configs.is_empty() {
        return Err(AppError::BadRequest(
            "Proxmox API credentials are required for storage controls".into(),
        ));
    }

    let disable_value = if action == "disable-storage" {
        "1"
    } else {
        "0"
    };
    let encoded_storage = urlencoding::encode(&storage);
    let client = insecure_client();
    for config in configs {
        let auth_header = format!("PVEAPIToken={}={}", config.token_id, config.token_secret);
        let url = format!("{}/api2/json/storage/{encoded_storage}", config.url);
        match client
            .put(url)
            .header("Authorization", &auth_header)
            .form(&[("disable", disable_value)])
            .send()
            .await
        {
            Ok(res) if res.status().is_success() => {
                let body = res.json::<Value>().await.unwrap_or_else(|_| json!({}));
                return Ok(json!({
                    "mode": "proxmox-api",
                    "source": config.origin,
                    "target": {
                        "node": node,
                        "storage": storage,
                    },
                    "action": action,
                    "response": body,
                }));
            }
            Ok(res) => {
                warn!(
                    source = config.origin,
                    status = %res.status(),
                    action,
                    storage,
                    "Proxmox storage endpoint returned non-success"
                );
            }
            Err(err) => {
                warn!(
                    source = config.origin,
                    error = %err,
                    action,
                    storage,
                    "Proxmox storage endpoint failed"
                );
            }
        }
    }

    Err(AppError::BadRequest(format!(
        "Proxmox storage {action} failed for {storage}"
    )))
}

async fn run_proxmox_ha_action(
    state: &AppState,
    action: &str,
    resource_id: &str,
    args: &Value,
    confirmation: Option<&str>,
) -> Result<Value, AppError> {
    let action = validate_proxmox_action(action)?;
    if !matches!(action, "set-ha-state" | "remove-ha") {
        return Err(AppError::BadRequest(format!(
            "unsupported Proxmox HA action: {action}"
        )));
    }
    require_destructive_confirmation(action, resource_id, args, confirmation)?;
    let sid = validate_control_token(
        &arg_string(args, &["sid", "resource", "name"]).unwrap_or_else(|| resource_id.to_string()),
        "HA resource",
    )?;

    let configs = proxmox_api_configs(state);
    if configs.is_empty() {
        return Err(AppError::BadRequest(
            "Proxmox API credentials are required for HA controls".into(),
        ));
    }

    let client = insecure_client();
    let encoded_sid = urlencoding::encode(&sid);
    for config in configs {
        let auth_header = format!("PVEAPIToken={}={}", config.token_id, config.token_secret);
        let url = format!(
            "{}/api2/json/cluster/ha/resources/{encoded_sid}",
            config.url
        );
        let mut form = Vec::new();
        let mut request = if action == "remove-ha" {
            client.delete(&url)
        } else {
            let state =
                validate_proxmox_ha_state(&required_arg_string(args, &["state"], "HA state")?)?;
            form.push(("state".to_string(), state));
            client.put(&url)
        }
        .header("Authorization", &auth_header);
        if !form.is_empty() {
            request = request.form(&form);
        }

        match request.send().await {
            Ok(res) if res.status().is_success() => {
                let body = res.json::<Value>().await.unwrap_or_else(|_| json!({}));
                return Ok(json!({
                    "mode": "proxmox-api",
                    "source": config.origin,
                    "target": { "sid": sid },
                    "action": action,
                    "response": body,
                }));
            }
            Ok(res) => {
                warn!(
                    source = config.origin,
                    status = %res.status(),
                    action,
                    sid,
                    "Proxmox HA endpoint returned non-success"
                );
            }
            Err(err) => {
                warn!(
                    source = config.origin,
                    error = %err,
                    action,
                    sid,
                    "Proxmox HA endpoint failed"
                );
            }
        }
    }

    Err(AppError::BadRequest(format!(
        "Proxmox HA {action} failed for {sid}"
    )))
}

async fn run_proxmox_task_action(
    state: &AppState,
    action: &str,
    node: &str,
    upid: &str,
    args: &Value,
    confirmation: Option<&str>,
) -> Result<Value, AppError> {
    let action = validate_proxmox_action(action)?;
    if !matches!(action, "task-log" | "task-status" | "stop-task") {
        return Err(AppError::BadRequest(format!(
            "unsupported Proxmox task action: {action}"
        )));
    }
    require_destructive_confirmation(action, upid, args, confirmation)?;
    let node = validate_control_token(node, "node")?;
    let upid = validate_proxmox_volume_id(upid, "task UPID")?;

    let configs = proxmox_api_configs(state);
    if configs.is_empty() {
        return Err(AppError::BadRequest(
            "Proxmox API credentials are required for task controls".into(),
        ));
    }

    let client = insecure_client();
    let encoded_node = urlencoding::encode(&node);
    let encoded_upid = urlencoding::encode(&upid);
    for config in configs {
        let auth_header = format!("PVEAPIToken={}={}", config.token_id, config.token_secret);
        let (method, url) = match action {
            "task-log" => (
                "get",
                format!(
                    "{}/api2/json/nodes/{encoded_node}/tasks/{encoded_upid}/log",
                    config.url
                ),
            ),
            "task-status" => (
                "get",
                format!(
                    "{}/api2/json/nodes/{encoded_node}/tasks/{encoded_upid}/status",
                    config.url
                ),
            ),
            "stop-task" => (
                "delete",
                format!(
                    "{}/api2/json/nodes/{encoded_node}/tasks/{encoded_upid}",
                    config.url
                ),
            ),
            _ => unreachable!("validated Proxmox task action"),
        };
        let request = if method == "delete" {
            client.delete(url)
        } else {
            client.get(url)
        }
        .header("Authorization", &auth_header);

        match request.send().await {
            Ok(res) if res.status().is_success() => {
                let body = res.json::<Value>().await.unwrap_or_else(|_| json!({}));
                return Ok(json!({
                    "mode": "proxmox-api",
                    "source": config.origin,
                    "target": { "node": node, "upid": upid },
                    "action": action,
                    "response": body,
                }));
            }
            Ok(res) => {
                warn!(
                    source = config.origin,
                    status = %res.status(),
                    action,
                    node,
                    upid,
                    "Proxmox task endpoint returned non-success"
                );
            }
            Err(err) => {
                warn!(
                    source = config.origin,
                    error = %err,
                    action,
                    node,
                    upid,
                    "Proxmox task endpoint failed"
                );
            }
        }
    }

    Err(AppError::BadRequest(format!(
        "Proxmox task {action} failed for {upid} on {node}"
    )))
}

async fn run_proxmox_service_action(
    state: &AppState,
    action: &str,
    node: &str,
    service_id: &str,
    args: &Value,
    confirmation: Option<&str>,
) -> Result<Value, AppError> {
    let action = validate_proxmox_action(action)?;
    if !matches!(action, "start" | "stop" | "restart" | "reload") {
        return Err(AppError::BadRequest(format!(
            "unsupported Proxmox service action: {action}"
        )));
    }
    require_destructive_confirmation(action, service_id, args, confirmation)?;
    let node = validate_control_token(node, "node")?;
    let service_id = validate_control_token(service_id, "service")?;

    let configs = proxmox_api_configs(state);
    if configs.is_empty() {
        return Err(AppError::BadRequest(
            "Proxmox API credentials are required for service controls".into(),
        ));
    }

    let client = insecure_client();
    let encoded_node = urlencoding::encode(&node);
    let encoded_service = urlencoding::encode(&service_id);
    for config in configs {
        let auth_header = format!("PVEAPIToken={}={}", config.token_id, config.token_secret);
        let url = format!(
            "{}/api2/json/nodes/{encoded_node}/services/{encoded_service}/state",
            config.url
        );
        let response = client
            .put(url)
            .header("Authorization", &auth_header)
            .form(&[("state", action)])
            .send()
            .await;

        match response {
            Ok(res) if res.status().is_success() => {
                let body = res.json::<Value>().await.unwrap_or_else(|_| json!({}));
                return Ok(json!({
                    "mode": "proxmox-api",
                    "source": config.origin,
                    "target": { "node": node, "service": service_id },
                    "action": action,
                    "response": body,
                }));
            }
            Ok(res) => {
                warn!(
                    source = config.origin,
                    status = %res.status(),
                    action,
                    node,
                    service = service_id,
                    "Proxmox service control endpoint returned non-success"
                );
            }
            Err(err) => {
                warn!(
                    source = config.origin,
                    error = %err,
                    action,
                    node,
                    service = service_id,
                    "Proxmox service control endpoint failed"
                );
            }
        }
    }

    Err(AppError::BadRequest(format!(
        "Proxmox service {action} failed for {service_id} on {node}"
    )))
}

// ── Router ──────────────────────────────────────────────────────────────────

/// Build the homelab router (Proxmox nodes/VMs + OPNsense firewall status).
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/homelab", get(get_homelab))
        .route("/homelab/config", get(get_config).put(put_config))
        .route("/homelab/control", post(post_control))
        .route("/homelab/docker", get(get_docker))
        .route("/homelab/proxmox", get(get_proxmox))
        .route("/homelab/opnsense", get(get_opnsense))
        .route("/homelab/sync", post(sync_config))
        .route("/proxmox", get(get_proxmox))
        .route("/opnsense", get(get_opnsense))
}

fn secret_is_set(state: &AppState, key: &str) -> bool {
    state
        .secret(key)
        .is_some_and(|value| !value.trim().is_empty())
}

fn env_value(env: &HashMap<String, String>, keys: &[&str]) -> Option<String> {
    keys.iter().find_map(|key| {
        env.get(*key)
            .filter(|value| !value.trim().is_empty())
            .cloned()
    })
}

fn homelab_secret_or_env(state: &AppState, env: &HashMap<String, String>, keys: &[&str]) -> String {
    for key in keys {
        if let Some(value) = state.secret(key).filter(|value| !value.trim().is_empty()) {
            return value;
        }
    }
    env_value(env, keys).unwrap_or_default()
}

fn homelab_secret_or_env_is_set(
    state: &AppState,
    env: &HashMap<String, String>,
    keys: &[&str],
) -> bool {
    keys.iter().any(|key| secret_is_set(state, key)) || env_value(env, keys).is_some()
}

fn stable_portainer_id(name: &str, url: &str) -> String {
    let raw = format!("{}-{}", name.trim(), url.trim());
    let mut out = String::new();
    for c in raw.chars() {
        if c.is_ascii_alphanumeric() {
            out.push(c.to_ascii_lowercase());
        } else if matches!(c, '-' | '_' | '.') {
            out.push(c);
        } else if c.is_whitespace() || matches!(c, ':' | '/') {
            out.push('-');
        }
    }
    let trimmed = out.trim_matches('-').to_string();
    if trimmed.is_empty() {
        "portainer".to_string()
    } else {
        trimmed.chars().take(64).collect()
    }
}

fn homelab_resource_key(value: &str) -> String {
    value
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect()
}

fn value_string_keys(value: &Value, fields: &[&str]) -> Vec<String> {
    fields
        .iter()
        .filter_map(|field| value.get(field).and_then(Value::as_str))
        .flat_map(|raw| {
            let lower = raw.trim().to_ascii_lowercase();
            let compact = homelab_resource_key(raw);
            [lower, compact]
        })
        .filter(|key| !key.is_empty())
        .collect()
}

fn portainer_endpoint_keys(portainer: &Value) -> HashSet<String> {
    portainer
        .get("endpoints")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .flat_map(|endpoint| value_string_keys(endpoint, &["name", "url"]))
        .collect()
}

fn filter_docker_ssh_shadowed_by_portainer(docker_ssh: Value, portainer: &Value) -> Value {
    let endpoint_keys = portainer_endpoint_keys(portainer);
    if endpoint_keys.is_empty() {
        return docker_ssh;
    }

    let filtered_hosts = docker_ssh
        .get("hosts")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .filter(|host| {
            !value_string_keys(host, &["id", "name", "host"])
                .iter()
                .any(|key| endpoint_keys.contains(key))
        })
        .collect::<Vec<_>>();

    let containers = filtered_hosts
        .iter()
        .flat_map(|host| {
            host.get("containers")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default()
        })
        .collect::<Vec<_>>();
    let available = filtered_hosts.iter().any(|host| {
        host.get("available")
            .and_then(Value::as_bool)
            .unwrap_or(false)
    });

    json!({
        "available": available,
        "source": if filtered_hosts.is_empty() { "portainer-shadowed" } else { "docker-ssh" },
        "hosts": filtered_hosts,
        "containers": containers,
    })
}

fn parse_portainer_instances(raw: &str) -> Result<Vec<PortainerInstanceConfig>, ()> {
    if raw.trim().is_empty() {
        return Ok(Vec::new());
    }
    let items = serde_json::from_str::<Vec<PortainerConfigInput>>(raw).map_err(|_| ())?;
    Ok(items
        .into_iter()
        .filter_map(|item| {
            let name = item.name.trim().to_string();
            let url = normalize_base_url(&item.url);
            let token = item.token.unwrap_or_default().trim().to_string();
            if name.is_empty() || url.is_empty() || token.is_empty() {
                return None;
            }
            Some(PortainerInstanceConfig {
                id: item
                    .id
                    .filter(|id| !id.trim().is_empty())
                    .unwrap_or_else(|| stable_portainer_id(&name, &url)),
                name,
                url,
                token,
            })
        })
        .collect())
}

fn raw_env_value_from_file(path: PathBuf, target: &str) -> Option<String> {
    let contents = std::fs::read_to_string(path).ok()?;
    contents.lines().find_map(|line| {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            return None;
        }
        let (key, value) = trimmed.split_once('=')?;
        if key.trim() == target && !value.trim().is_empty() {
            Some(value.trim().to_string())
        } else {
            None
        }
    })
}

fn raw_env_file_candidates(target: &str) -> Vec<String> {
    let mut paths = Vec::new();
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    paths.push(manifest_dir.join(".env.local"));
    paths.push(manifest_dir.join("../.env.local"));
    if let Ok(cwd) = std::env::current_dir() {
        paths.push(cwd.join(".env.local"));
        paths.push(cwd.join("src-tauri/.env.local"));
        paths.push(cwd.join("../.env.local"));
    }
    paths.dedup();
    paths
        .into_iter()
        .filter_map(|path| raw_env_value_from_file(path, target))
        .collect()
}

fn portainer_configs(state: &AppState) -> Vec<PortainerInstanceConfig> {
    let env = homelab_env_values();
    let mut raw_values = Vec::new();
    raw_values.extend(raw_env_file_candidates("PORTAINER_INSTANCES"));
    raw_values.extend(env.get("PORTAINER_INSTANCES").cloned());
    raw_values.extend(std::env::var("PORTAINER_INSTANCES").ok());
    raw_values.extend(state.secret("PORTAINER_INSTANCES"));

    let mut configs: Vec<PortainerInstanceConfig> = Vec::new();
    let mut saw_invalid = false;
    for raw in raw_values {
        let parsed = match parse_portainer_instances(&raw) {
            Ok(parsed) => parsed,
            Err(()) => {
                saw_invalid = true;
                continue;
            }
        };
        for mut config in parsed {
            if configs
                .iter()
                .any(|existing| existing.url == config.url && existing.token == config.token)
            {
                continue;
            }
            if configs.iter().any(|existing| existing.id == config.id) {
                config.id = format!("{}-{}", config.id, configs.len() + 1);
            }
            configs.push(config);
        }
    }
    if configs.is_empty() && saw_invalid {
        warn!("PORTAINER_INSTANCES could not be parsed as JSON");
    }
    configs
}

fn parse_docker_hosts(raw: &str) -> Result<Vec<DockerHostConfig>, ()> {
    if raw.trim().is_empty() {
        return Ok(Vec::new());
    }
    let items = serde_json::from_str::<Vec<DockerHostConfigInput>>(raw).map_err(|_| ())?;
    Ok(items
        .into_iter()
        .filter_map(|item| {
            let name = item.name.trim().to_string();
            let host = item.host.trim().to_string();
            if name.is_empty() || host.is_empty() {
                return None;
            }
            Some(DockerHostConfig {
                id: item
                    .id
                    .filter(|id| !id.trim().is_empty())
                    .unwrap_or_else(|| stable_portainer_id(&name, &host)),
                name,
                host,
            })
        })
        .collect())
}

fn docker_host_configs(state: &AppState) -> Vec<DockerHostConfig> {
    let env = homelab_env_values();
    let mut saw_invalid = false;
    for raw in [
        raw_env_file_candidates("HOMELAB_DOCKER_HOSTS")
            .into_iter()
            .next(),
        state.secret("HOMELAB_DOCKER_HOSTS"),
        env.get("HOMELAB_DOCKER_HOSTS").cloned(),
    ]
    .into_iter()
    .flatten()
    {
        match parse_docker_hosts(&raw) {
            Ok(configured) if !configured.is_empty() => return configured,
            Ok(_) => {}
            Err(()) => saw_invalid = true,
        }
    }
    if saw_invalid {
        warn!("HOMELAB_DOCKER_HOSTS could not be parsed as JSON");
    }
    vec![DockerHostConfig {
        id: "agent-vm".to_string(),
        name: "Agent VM".to_string(),
        host: "agent-vm".to_string(),
    }]
}

fn redacted_portainer_instances(state: &AppState) -> Vec<Value> {
    portainer_configs(state)
        .into_iter()
        .map(|item| {
            json!({
                "id": item.id,
                "name": item.name,
                "url": item.url,
                "token_set": !item.token.trim().is_empty(),
            })
        })
        .collect()
}

const HOMELAB_SYSTEM_DEFINITIONS: &[HomelabSystemDefinition] = &[
    HomelabSystemDefinition {
        id: "storage",
        name: "NAS / storage",
        keys: &["UNRAID_URL", "COUCHDB_URL", "SUPABASE_URL"],
    },
    HomelabSystemDefinition {
        id: "backups",
        name: "Backups",
        keys: &["R2_BUCKET", "BACKUP_HOST", "RESTIC_REPOSITORY"],
    },
    HomelabSystemDefinition {
        id: "dns",
        name: "DNS / adblock",
        keys: &["ADGUARD_URL", "PIHOLE_URL", "OPNSENSE_HOST"],
    },
    HomelabSystemDefinition {
        id: "tunnels",
        name: "Tunnels",
        keys: &["TAILSCALE_HOST", "VNC_HOST", "SUNSHINE_HOST"],
    },
    HomelabSystemDefinition {
        id: "ups",
        name: "Power / UPS",
        keys: &["NUT_HOST", "UPS_HOST"],
    },
    HomelabSystemDefinition {
        id: "host-services",
        name: "Host services",
        keys: &["AGENTSHELL_URL", "AGENTSECRETS_URL", "MEMD_RAG_URL"],
    },
];

fn homelab_system_values(
    state: &AppState,
    env: &HashMap<String, String>,
    def: &HomelabSystemDefinition,
) -> Vec<(String, String)> {
    def.keys
        .iter()
        .filter_map(|key| {
            let value = homelab_secret_or_env(state, env, &[*key]);
            if value.trim().is_empty() {
                None
            } else {
                Some(((*key).to_string(), value.trim().to_string()))
            }
        })
        .collect()
}

fn homelab_system_url(value: &str) -> Option<String> {
    let clean = value.trim();
    if clean.is_empty() {
        return None;
    }
    if clean.starts_with("http://") || clean.starts_with("https://") {
        return Some(normalize_base_url(clean));
    }
    if clean.contains('.') || clean.contains(':') {
        return Some(normalize_base_url(&format!("https://{clean}")));
    }
    None
}

fn homelab_systems(state: &AppState) -> Vec<Value> {
    let env = homelab_env_values();
    HOMELAB_SYSTEM_DEFINITIONS
        .into_iter()
        .map(|def| {
            let values = homelab_system_values(state, &env, def);
            let configured = !values.is_empty();
            let primary_url = values
                .iter()
                .find_map(|(_, value)| homelab_system_url(value));
            json!({
                "id": def.id,
                "name": def.name,
                "status": if configured { "configured" } else { "not_configured" },
                "actions": if configured { vec!["open", "healthcheck"] } else { Vec::<&str>::new() },
                "primary_url": primary_url,
            })
        })
        .collect()
}

fn homelab_config_value(state: &AppState) -> Value {
    let env = homelab_env_values();
    let proxmox_host = homelab_secret_or_env(state, &env, &["PROXMOX_HOST"]);
    let proxmox_token_id = homelab_secret_or_env(state, &env, &["PROXMOX_TOKEN_ID"]);
    let opnsense_host = homelab_secret_or_env(state, &env, &["OPNSENSE_HOST", "OPNSENSE_URL"]);
    let portainer_instances = redacted_portainer_instances(state);

    let proxmox_configured = !proxmox_host.trim().is_empty()
        && !proxmox_token_id.trim().is_empty()
        && homelab_secret_or_env_is_set(state, &env, &["PROXMOX_TOKEN_SECRET"]);
    let opnsense_configured = !opnsense_host.trim().is_empty()
        && homelab_secret_or_env_is_set(state, &env, &["OPNSENSE_API_KEY", "OPNSENSE_KEY"])
        && homelab_secret_or_env_is_set(state, &env, &["OPNSENSE_API_SECRET", "OPNSENSE_SECRET"]);
    let portainer_configured = !portainer_instances.is_empty();

    json!({
        "api_configured": {
            "proxmox": proxmox_configured,
            "opnsense": opnsense_configured,
            "portainer": portainer_configured,
        },
        "local": {
            "proxmox_host": proxmox_host,
            "proxmox_token_id": proxmox_token_id,
            "proxmox_token_secret_set": homelab_secret_or_env_is_set(state, &env, &["PROXMOX_TOKEN_SECRET"]),
            "opnsense_host": opnsense_host,
            "opnsense_key_set": homelab_secret_or_env_is_set(state, &env, &["OPNSENSE_API_KEY", "OPNSENSE_KEY"]),
            "opnsense_secret_set": homelab_secret_or_env_is_set(state, &env, &["OPNSENSE_API_SECRET", "OPNSENSE_SECRET"]),
            "portainer_instances": portainer_instances,
        }
    })
}

async fn save_config_value(
    state: &AppState,
    keyring_key: &str,
    env_key: &str,
    value: String,
) -> Result<(), AppError> {
    let value = value.trim().to_string();
    state.merge_secrets(std::collections::HashMap::from([(
        env_key.to_string(),
        value.clone(),
    )]));

    if HOMELAB_KEYCHAIN_DISABLED.load(Ordering::Relaxed) {
        persist_homelab_env_value(env_key, &value)?;
        return Ok(());
    }

    let keyring_key = keyring_key.to_string();
    let keyring_value = value.clone();
    let keyring_key_for_save = keyring_key.clone();
    let save = tokio::task::spawn_blocking(move || {
        crate::secrets::set_entry(&keyring_key_for_save, &keyring_value)
    });

    match tokio::time::timeout(std::time::Duration::from_secs(5), save).await {
        Ok(Ok(Ok(()))) => {}
        Ok(Ok(Err(e))) => {
            HOMELAB_KEYCHAIN_DISABLED.store(true, Ordering::Relaxed);
            warn!(key = keyring_key, error = %e, "homelab keychain save failed; using .env.local fallback");
            persist_homelab_env_value(env_key, &value)?;
        }
        Ok(Err(e)) => {
            HOMELAB_KEYCHAIN_DISABLED.store(true, Ordering::Relaxed);
            warn!(key = keyring_key, error = %e, "homelab keychain save task failed; using .env.local fallback");
            persist_homelab_env_value(env_key, &value)?;
        }
        Err(_) => {
            HOMELAB_KEYCHAIN_DISABLED.store(true, Ordering::Relaxed);
            warn!(
                key = keyring_key,
                "homelab keychain save timed out; using .env.local fallback"
            );
            persist_homelab_env_value(env_key, &value)?;
        }
    }

    Ok(())
}

async fn save_secret_value_if_present(
    state: &AppState,
    keyring_key: &str,
    env_key: &str,
    value: Option<String>,
) -> Result<(), AppError> {
    let Some(value) = value else {
        return Ok(());
    };
    if value.trim().is_empty() {
        return Ok(());
    }
    save_config_value(state, keyring_key, env_key, value).await
}

async fn get_config(State(state): State<AppState>) -> Result<Json<Value>, AppError> {
    Ok(success_json(homelab_config_value(&state)))
}

async fn put_config(
    State(state): State<AppState>,
    Json(body): Json<HomelabConfigInput>,
) -> Result<Json<Value>, AppError> {
    if let Some(value) = body.proxmox_host {
        save_config_value(&state, "proxmox.host", "PROXMOX_HOST", value).await?;
    }
    if let Some(value) = body.proxmox_token_id {
        save_config_value(&state, "proxmox.token-id", "PROXMOX_TOKEN_ID", value).await?;
    }
    save_secret_value_if_present(
        &state,
        "proxmox.token-secret",
        "PROXMOX_TOKEN_SECRET",
        body.proxmox_token_secret,
    )
    .await?;

    if let Some(value) = body.opnsense_host {
        save_config_value(&state, "opnsense.host", "OPNSENSE_HOST", value).await?;
    }
    save_secret_value_if_present(&state, "opnsense.key", "OPNSENSE_KEY", body.opnsense_key).await?;
    save_secret_value_if_present(
        &state,
        "opnsense.secret",
        "OPNSENSE_SECRET",
        body.opnsense_secret,
    )
    .await?;

    if let Some(instances) = body.portainer_instances {
        let existing_tokens: HashMap<String, String> = portainer_configs(&state)
            .into_iter()
            .map(|item| (item.id, item.token))
            .collect();
        let clean: Vec<Value> = instances
            .into_iter()
            .filter_map(|item| {
                let name = item.name.trim().to_string();
                let url = normalize_base_url(&item.url);
                if name.is_empty() || url.is_empty() {
                    return None;
                }
                let id = item
                    .id
                    .filter(|id| !id.trim().is_empty())
                    .unwrap_or_else(|| stable_portainer_id(&name, &url));
                let token = item.token.unwrap_or_default().trim().to_string();
                let token = if token.is_empty() {
                    existing_tokens.get(&id).cloned().unwrap_or_default()
                } else {
                    token
                };
                Some(json!({
                    "id": id,
                    "name": name,
                    "url": url,
                    "token": token,
                }))
            })
            .collect();
        let encoded = serde_json::to_string(&clean).map_err(|e| {
            AppError::Internal(anyhow::anyhow!("failed to serialize Portainer config: {e}"))
        })?;
        save_config_value(
            &state,
            "portainer.instances",
            "PORTAINER_INSTANCES",
            encoded,
        )
        .await?;
    }

    Ok(success_json(homelab_config_value(&state)))
}

async fn sync_config(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    if session.encryption_key.is_empty() {
        return Err(AppError::BadRequest(
            "Encryption key not available. Log in with email/password to sync homelab secrets."
                .into(),
        ));
    }

    let sb = SupabaseClient::from_state(&state)?;
    let services = [
        (
            "proxmox",
            vec![
                ("host", state.secret_or_default("PROXMOX_HOST")),
                ("token_id", state.secret_or_default("PROXMOX_TOKEN_ID")),
                (
                    "token_secret",
                    state.secret_or_default("PROXMOX_TOKEN_SECRET"),
                ),
            ],
        ),
        (
            "opnsense",
            vec![
                (
                    "host",
                    state
                        .secret("OPNSENSE_HOST")
                        .or_else(|| state.secret("OPNSENSE_URL"))
                        .unwrap_or_default(),
                ),
                (
                    "key",
                    state
                        .secret("OPNSENSE_API_KEY")
                        .or_else(|| state.secret("OPNSENSE_KEY"))
                        .unwrap_or_default(),
                ),
                (
                    "secret",
                    state
                        .secret("OPNSENSE_API_SECRET")
                        .or_else(|| state.secret("OPNSENSE_SECRET"))
                        .unwrap_or_default(),
                ),
            ],
        ),
        (
            "portainer",
            vec![("instances", state.secret_or_default("PORTAINER_INSTANCES"))],
        ),
    ];

    let mut synced = Vec::new();
    let mut skipped = Vec::new();

    for (service, pairs) in services {
        let mut credentials = serde_json::Map::new();
        let mut complete = true;
        for (key, value) in pairs {
            let value = value.trim().to_string();
            if value.is_empty() {
                complete = false;
            } else {
                credentials.insert(key.to_string(), Value::String(value));
            }
        }

        if !complete {
            skipped.push(service);
            continue;
        }

        let json_bytes = serde_json::to_vec(&Value::Object(credentials)).map_err(|e| {
            AppError::Internal(anyhow::anyhow!(
                "failed to serialize {service} credentials: {e}"
            ))
        })?;
        let (ciphertext, nonce) = crate::crypto::encrypt(&json_bytes, &session.encryption_key)
            .map_err(|e| AppError::Internal(anyhow::anyhow!("encryption failed: {e}")))?;
        let row = json!({
            "user_id": session.user_id,
            "service": service,
            "encrypted_credentials": ciphertext,
            "nonce": nonce,
        });
        sb.upsert_as_user("user_secrets", row, &session.access_token)
            .await?;
        synced.push(service);
    }

    Ok(success_json(json!({
        "synced": synced,
        "skipped": skipped,
    })))
}

async fn get_docker(State(state): State<AppState>) -> Result<Json<Value>, AppError> {
    let (portainer, ssh) = tokio::join!(
        fetch_portainer_inventory(&state),
        fetch_docker_ssh_inventory(&state)
    );
    let ssh = filter_docker_ssh_shadowed_by_portainer(ssh, &portainer);
    let mut containers = Vec::new();
    containers.extend(
        portainer
            .get("containers")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default(),
    );
    containers.extend(
        ssh.get("containers")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default(),
    );

    Ok(success_json(json!({
        "available": portainer.get("available").and_then(Value::as_bool).unwrap_or(false)
            || ssh.get("available").and_then(Value::as_bool).unwrap_or(false),
        "source": "combined",
        "instances": portainer.get("instances").cloned().unwrap_or_else(|| json!([])),
        "hosts": ssh.get("hosts").cloned().unwrap_or_else(|| json!([])),
        "containers": containers,
        "portainer": portainer,
        "ssh": ssh,
    })))
}

async fn post_control(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Json(body): Json<HomelabControlInput>,
) -> Result<Json<Value>, AppError> {
    let action = body.action.trim();
    let result = match body.provider.trim() {
        "portainer" => {
            run_portainer_action(
                &state,
                action,
                body.instance_id.as_deref(),
                body.resource_type.trim(),
                body.resource_id.trim(),
                &body.args,
                body.confirmation.as_deref(),
            )
            .await?
        }
        "docker-ssh" => {
            run_docker_ssh_action(
                &state,
                action,
                body.instance_id.as_deref(),
                body.resource_type.trim(),
                body.resource_id.trim(),
                &body.args,
                body.confirmation.as_deref(),
            )
            .await?
        }
        "opnsense" => {
            run_opnsense_action(
                &state,
                action,
                body.resource_type.trim(),
                body.resource_id.trim(),
                &body.args,
                body.confirmation.as_deref(),
            )
            .await?
        }
        "system" => {
            run_system_action(
                &state,
                action,
                body.resource_type.trim(),
                body.resource_id.trim(),
                &body.args,
                body.confirmation.as_deref(),
            )
            .await?
        }
        "proxmox" => {
            let resource_type = body.resource_type.trim();
            let node = body
                .args
                .get("node")
                .and_then(Value::as_str)
                .unwrap_or_else(|| body.resource_id.trim());
            match resource_type {
                "node" => {
                    run_proxmox_node_action(
                        &state,
                        action,
                        body.resource_id.trim(),
                        &body.args,
                        body.confirmation.as_deref(),
                    )
                    .await?
                }
                "service" => {
                    run_proxmox_service_action(
                        &state,
                        action,
                        node,
                        body.resource_id.trim(),
                        &body.args,
                        body.confirmation.as_deref(),
                    )
                    .await?
                }
                "backup" => {
                    if action == "restore" {
                        run_proxmox_restore_action(
                            &state,
                            node,
                            body.resource_id.trim(),
                            &body.args,
                            body.confirmation.as_deref(),
                        )
                        .await?
                    } else if action == "delete-backup" {
                        run_proxmox_delete_backup_action(
                            &state,
                            node,
                            body.resource_id.trim(),
                            &body.args,
                            body.confirmation.as_deref(),
                        )
                        .await?
                    } else {
                        return Err(AppError::BadRequest(format!(
                            "unsupported Proxmox backup action: {action}"
                        )));
                    }
                }
                "storage" => {
                    run_proxmox_storage_action(
                        &state,
                        action,
                        body.resource_id.trim(),
                        &body.args,
                        body.confirmation.as_deref(),
                    )
                    .await?
                }
                "ha" => {
                    run_proxmox_ha_action(
                        &state,
                        action,
                        body.resource_id.trim(),
                        &body.args,
                        body.confirmation.as_deref(),
                    )
                    .await?
                }
                "task" => {
                    run_proxmox_task_action(
                        &state,
                        action,
                        node,
                        body.resource_id.trim(),
                        &body.args,
                        body.confirmation.as_deref(),
                    )
                    .await?
                }
                "vm" | "lxc" => {
                    let kind = body
                        .args
                        .get("kind")
                        .and_then(Value::as_str)
                        .unwrap_or("qemu");
                    let vmid = body.resource_id.trim().parse::<u64>().map_err(|_| {
                        AppError::BadRequest("Proxmox resourceId must be a vmid".into())
                    })?;
                    run_proxmox_action(
                        &state,
                        action,
                        node,
                        kind,
                        vmid,
                        &body.args,
                        body.confirmation.as_deref(),
                    )
                    .await?
                }
                other => {
                    return Err(AppError::BadRequest(format!(
                        "unsupported Proxmox resource type: {other}"
                    )));
                }
            }
        }
        other => {
            return Err(AppError::BadRequest(format!(
                "unsupported homelab control provider: {other}"
            )));
        }
    };

    let audit_details = homelab_control_audit_details(&body);
    crate::audit::log_audit_or_warn(
        &state.db,
        &session.user_id,
        action,
        "homelab_control",
        Some(body.resource_id.trim()),
        Some(&audit_details.to_string()),
    )
    .await;

    Ok(success_json(result))
}

fn homelab_control_actions(docker_ssh_live: bool, portainer_live: bool) -> Vec<Value> {
    let mut control_actions = vec![
        json!({ "provider": "proxmox", "resource_type": "vm", "actions": ["start", "shutdown", "reboot", "stop", "set-memory", "set-cpu", "set-network", "add-network", "remove-network", "resize-disk", "add-disk", "remove-disk", "snapshot", "rollback-snapshot", "delete-snapshot", "backup", "migrate", "clone", "console", "set-name", "set-description", "set-tags", "set-onboot", "set-protection", "set-firewall", "add-firewall-rule", "update-firewall-rule", "delete-firewall-rule", "add-ha", "set-ha-state", "remove-ha", "delete"] }),
        json!({ "provider": "proxmox", "resource_type": "lxc", "actions": ["start", "shutdown", "reboot", "stop", "set-memory", "set-cpu", "set-network", "add-network", "remove-network", "resize-disk", "add-disk", "remove-disk", "snapshot", "rollback-snapshot", "delete-snapshot", "backup", "migrate", "clone", "console", "set-name", "set-description", "set-tags", "set-onboot", "set-protection", "set-firewall", "add-firewall-rule", "update-firewall-rule", "delete-firewall-rule", "add-ha", "set-ha-state", "remove-ha", "delete"] }),
        json!({ "provider": "proxmox", "resource_type": "node", "actions": ["create-vm", "create-lxc", "reboot", "shutdown"] }),
        json!({ "provider": "proxmox", "resource_type": "service", "actions": ["start", "stop", "restart", "reload"] }),
        json!({ "provider": "proxmox", "resource_type": "backup", "actions": ["restore", "delete-backup"] }),
        json!({ "provider": "proxmox", "resource_type": "storage", "actions": ["enable-storage", "disable-storage"] }),
        json!({ "provider": "proxmox", "resource_type": "ha", "actions": ["set-ha-state", "remove-ha"] }),
        json!({ "provider": "proxmox", "resource_type": "task", "actions": ["task-log", "task-status", "stop-task"] }),
        json!({ "provider": "opnsense", "resource_type": "service", "actions": ["start", "stop", "restart"] }),
        json!({ "provider": "system", "resource_type": "system", "actions": ["open", "healthcheck"] }),
        json!({ "provider": "portainer", "resource_type": "container", "actions": ["start", "stop", "restart", "pause", "unpause", "kill", "logs", "inspect", "stats", "exec", "rename", "duplicate", "recreate", "update-restart-policy", "update-resources", "remove"] }),
        json!({ "provider": "portainer", "resource_type": "endpoint", "actions": ["inspect-endpoint", "pull-image", "create-container", "create-stack", "create-volume", "create-network", "create-secret", "create-config", "prune-images", "prune-containers", "prune-volumes", "prune-networks"] }),
        json!({ "provider": "portainer", "resource_type": "stack", "actions": ["inspect-stack", "stack-file", "stack-logs", "start-stack", "stop-stack", "update-stack", "redeploy", "delete"] }),
        json!({ "provider": "portainer", "resource_type": "image", "actions": ["inspect-image", "history-image", "tag-image", "remove-image"] }),
        json!({ "provider": "portainer", "resource_type": "volume", "actions": ["inspect-volume", "remove-volume"] }),
        json!({ "provider": "portainer", "resource_type": "network", "actions": ["inspect-network", "connect-container", "disconnect-container", "remove-network"] }),
        json!({ "provider": "portainer", "resource_type": "secret", "actions": ["create-secret", "inspect-secret", "remove-secret"] }),
        json!({ "provider": "portainer", "resource_type": "config", "actions": ["create-config", "inspect-config", "remove-config"] }),
        json!({ "provider": "portainer", "resource_type": "registry", "actions": ["create-registry", "inspect-registry", "update-registry", "remove-registry"] }),
    ];
    if docker_ssh_live && !portainer_live {
        control_actions.push(json!({ "provider": "docker-ssh", "resource_type": "container", "actions": ["start", "stop", "restart", "pause", "unpause", "kill", "logs", "inspect", "stats", "remove"] }));
    }
    control_actions
}

// ── GET /homelab ────────────────────────────────────────────────────────────

async fn get_homelab(State(state): State<AppState>) -> Result<Json<Value>, AppError> {
    let config = homelab_config_value(&state);
    let proxmox_configured = config["api_configured"]["proxmox"]
        .as_bool()
        .unwrap_or(false);
    let opnsense_configured = config["api_configured"]["opnsense"]
        .as_bool()
        .unwrap_or(false);
    let (proxmox_result, opnsense_result, portainer, docker_ssh_raw) = tokio::join!(
        fetch_proxmox(&state),
        fetch_opnsense(&state),
        fetch_portainer_inventory(&state),
        fetch_docker_ssh_inventory(&state)
    );
    let docker_ssh = filter_docker_ssh_shadowed_by_portainer(docker_ssh_raw, &portainer);
    let proxmox_live = proxmox_result.is_some();
    let opnsense_live = opnsense_result.is_some();
    let portainer_live = portainer
        .get("available")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let proxmox = proxmox_result.unwrap_or_else(mock_proxmox);
    let opnsense = opnsense_result.unwrap_or_else(mock_opnsense);
    let docker_ssh_live = docker_ssh
        .get("available")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let control_actions = homelab_control_actions(docker_ssh_live, portainer_live);
    let mut provider_diagnostics = Vec::new();
    if proxmox_configured && !proxmox_live {
        provider_diagnostics.push(json!({
            "provider": "proxmox",
            "status": "offline",
            "severity": "error",
            "configured": true,
            "message": "Proxmox is configured but neither API nor SSH fallback returned live data. Check host reachability, token permissions, and network routing.",
        }));
    } else if !proxmox_configured {
        provider_diagnostics.push(json!({
            "provider": "proxmox",
            "status": "not_configured",
            "severity": "warn",
            "configured": false,
            "message": "Proxmox credentials are missing. Add host URL, token ID, and token secret in HomeLab settings.",
        }));
    }
    if opnsense_configured && !opnsense_live {
        provider_diagnostics.push(json!({
            "provider": "opnsense",
            "status": "offline",
            "severity": "error",
            "configured": true,
            "message": "OPNsense is configured but live diagnostics did not respond. Check API credentials and firewall reachability.",
        }));
    } else if !opnsense_configured {
        provider_diagnostics.push(json!({
            "provider": "opnsense",
            "status": "not_configured",
            "severity": "warn",
            "configured": false,
            "message": "OPNsense credentials are missing. Add host URL, API key, and API secret in HomeLab settings.",
        }));
    }
    if !portainer_live {
        provider_diagnostics.push(json!({
            "provider": "portainer",
            "status": if config["api_configured"]["portainer"].as_bool().unwrap_or(false) { "offline" } else { "not_configured" },
            "severity": "error",
            "configured": config["api_configured"]["portainer"].as_bool().unwrap_or(false),
            "message": portainer.get("error").and_then(Value::as_str).unwrap_or("Portainer is not returning live Docker inventory."),
        }));
    }

    let mut response = json!({
        "proxmox": proxmox,
        "opnsense": opnsense,
        "portainer": portainer.clone(),
        "docker": docker_ssh.clone(),
        "systems": homelab_systems(&state),
        "control": {
            "actions": control_actions,
        },
        "diagnostics": {
            "providers": provider_diagnostics,
        },
        "live": {
            "proxmox": proxmox_live,
            "opnsense": opnsense_live,
            "portainer": portainer_live,
            "docker": portainer_live || docker_ssh_live,
        },
        "mock_services": {
            "proxmox": !proxmox_live,
            "opnsense": !opnsense_live,
        },
    });

    // Only include mock flag when at least one service fell back to mock data.
    // The configured booleans are kept for diagnostics; SSH fallbacks can be live
    // even when API credentials are not configured.
    if !proxmox_live || !opnsense_live {
        response["mock"] = json!(true);
        response["api_configured"] = json!({
            "proxmox": proxmox_configured,
            "opnsense": opnsense_configured,
        });
    }

    Ok(Json(response))
}

async fn get_proxmox(State(state): State<AppState>) -> Result<Json<Value>, AppError> {
    match fetch_proxmox(&state).await {
        Some(value) => Ok(Json(json!({ "proxmox": value, "live": true }))),
        None => Ok(Json(json!({
            "proxmox": mock_proxmox(),
            "live": false,
            "mock": true,
        }))),
    }
}

async fn get_opnsense(State(state): State<AppState>) -> Result<Json<Value>, AppError> {
    match fetch_opnsense(&state).await {
        Some(value) => Ok(Json(json!({ "opnsense": value, "live": true }))),
        None => Ok(Json(json!({
            "opnsense": mock_opnsense(),
            "live": false,
            "mock": true,
        }))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_opnsense_uptime() {
        assert_eq!(
            parse_opnsense_uptime("3 days, 03:58:11"),
            3 * 86400 + 3 * 3600 + 58 * 60 + 11
        );
        assert_eq!(
            parse_opnsense_uptime("0 days, 01:30:00"),
            1 * 3600 + 30 * 60
        );
        assert_eq!(parse_opnsense_uptime("12:05:33"), 12 * 3600 + 5 * 60 + 33);
        assert_eq!(parse_opnsense_uptime("1 day, 00:00:01"), 86400 + 1);
    }

    #[test]
    fn test_format_bytes_human() {
        assert_eq!(format_bytes_human(1_500_000_000_000), "1.5 TB");
        assert_eq!(format_bytes_human(2_500_000_000), "2.5 GB");
        assert_eq!(format_bytes_human(15_200_000), "15.2 MB");
        assert_eq!(format_bytes_human(3100), "3.1 KB");
    }

    #[test]
    fn test_parse_stat_value() {
        let obj = json!({"received-bytes": "12345", "sent-bytes": 67890});
        assert_eq!(parse_stat_value(&obj, "received-bytes"), 12345);
        assert_eq!(parse_stat_value(&obj, "sent-bytes"), 67890);
        assert_eq!(parse_stat_value(&obj, "missing"), 0);
    }

    #[test]
    fn test_mock_data_shapes() {
        let p = mock_proxmox();
        assert!(p["nodes"].is_array());
        assert!(p["vms"].is_array());
        assert_eq!(p["nodes"][0]["name"], "pve");

        let o = mock_opnsense();
        assert_eq!(o["status"], "online");
        assert!(o["cpu"].is_f64());
        assert!(o["wan_in"].is_string());
    }

    #[test]
    fn test_destructive_confirmation_requires_target_name() {
        let args = json!({ "name": "db" });
        assert!(require_destructive_confirmation("remove", "abc123", &args, Some("db")).is_ok());
        assert!(
            require_destructive_confirmation("remove", "abc123", &args, Some("abc123")).is_err()
        );
        assert!(require_destructive_confirmation("restart", "abc123", &args, None).is_ok());
    }

    #[test]
    fn test_parse_portainer_instances_skips_incomplete_rows() {
        let raw = r#"[
            {"name":"Primary","url":"https://portainer.local/","token":"secret"},
            {"name":"Missing token","url":"https://portainer.local"}
        ]"#;
        let parsed = parse_portainer_instances(raw).expect("valid portainer json");
        assert_eq!(parsed.len(), 1);
        assert_eq!(parsed[0].name, "Primary");
        assert_eq!(parsed[0].url, "https://portainer.local");
    }

    fn manifest_actions_for(
        manifest: &[Value],
        provider: &str,
        resource_type: &str,
    ) -> Vec<String> {
        manifest
            .iter()
            .find(|item| {
                item.get("provider").and_then(Value::as_str) == Some(provider)
                    && item.get("resource_type").and_then(Value::as_str) == Some(resource_type)
            })
            .and_then(|item| item.get("actions").and_then(Value::as_array))
            .map(|actions| {
                actions
                    .iter()
                    .filter_map(Value::as_str)
                    .map(str::to_string)
                    .collect()
            })
            .unwrap_or_default()
    }

    #[test]
    fn test_control_manifest_keeps_portainer_source_of_truth() {
        let portainer_live_manifest = homelab_control_actions(true, true);
        assert!(portainer_live_manifest
            .iter()
            .all(|item| item.get("provider").and_then(Value::as_str) != Some("docker-ssh")));

        let fallback_manifest = homelab_control_actions(true, false);
        let docker_actions = manifest_actions_for(&fallback_manifest, "docker-ssh", "container");
        assert!(docker_actions.contains(&"inspect".to_string()));
        assert!(docker_actions.contains(&"stats".to_string()));
        assert!(docker_actions.contains(&"logs".to_string()));
    }

    #[test]
    fn test_control_manifest_actions_validate_centrally() {
        for item in homelab_control_actions(true, false) {
            let provider = item["provider"].as_str().expect("provider");
            let actions = item["actions"].as_array().expect("actions");
            for action in actions.iter().filter_map(Value::as_str) {
                let result = match provider {
                    "portainer" | "docker-ssh" => validate_docker_action(action),
                    "proxmox" => validate_proxmox_action(action),
                    "opnsense" => validate_opnsense_action(action),
                    "system" => validate_system_action(action),
                    other => panic!("unexpected provider in control manifest: {other}"),
                };
                assert!(
                    result.is_ok(),
                    "{provider}/{action} should be accepted by central validation"
                );
            }
        }
    }

    #[test]
    fn test_validate_portainer_action_rejects_unknown() {
        assert!(validate_docker_action("restart").is_ok());
        assert!(validate_docker_action("inspect").is_ok());
        assert!(validate_docker_action("stats").is_ok());
        assert!(validate_docker_action("exec").is_ok());
        assert!(validate_docker_action("inspect-image").is_ok());
        assert!(validate_docker_action("history-image").is_ok());
        assert!(validate_docker_action("tag-image").is_ok());
        assert!(validate_docker_action("remove-image").is_ok());
        assert!(validate_docker_action("inspect-endpoint").is_ok());
        assert!(validate_docker_action("inspect-volume").is_ok());
        assert!(validate_docker_action("remove-volume").is_ok());
        assert!(validate_docker_action("inspect-network").is_ok());
        assert!(validate_docker_action("remove-network").is_ok());
        assert!(validate_docker_action("connect-container").is_ok());
        assert!(validate_docker_action("disconnect-container").is_ok());
        assert!(validate_docker_action("inspect-secret").is_ok());
        assert!(validate_docker_action("remove-secret").is_ok());
        assert!(validate_docker_action("inspect-config").is_ok());
        assert!(validate_docker_action("remove-config").is_ok());
        assert!(validate_docker_action("remove-registry").is_ok());
        assert!(validate_docker_action("create-registry").is_ok());
        assert!(validate_docker_action("inspect-registry").is_ok());
        assert!(validate_docker_action("update-registry").is_ok());
        assert!(validate_docker_action("pull-image").is_ok());
        assert!(validate_docker_action("create-volume").is_ok());
        assert!(validate_docker_action("create-network").is_ok());
        assert!(validate_docker_action("create-secret").is_ok());
        assert!(validate_docker_action("create-config").is_ok());
        assert!(validate_docker_action("create-container").is_ok());
        assert!(validate_docker_action("create-stack").is_ok());
        assert!(validate_docker_action("inspect-stack").is_ok());
        assert!(validate_docker_action("stack-file").is_ok());
        assert!(validate_docker_action("stack-logs").is_ok());
        assert!(validate_docker_action("start-stack").is_ok());
        assert!(validate_docker_action("stop-stack").is_ok());
        assert!(validate_docker_action("update-stack").is_ok());
        assert!(validate_docker_action("rename").is_ok());
        assert!(validate_docker_action("duplicate").is_ok());
        assert!(validate_docker_action("recreate").is_ok());
        assert!(validate_docker_action("update-restart-policy").is_ok());
        assert!(validate_docker_action("update-resources").is_ok());
        assert!(validate_docker_action("format-disk").is_err());
    }

    #[test]
    fn test_portainer_endpoint_shadows_duplicate_docker_ssh_host() {
        let docker_ssh = json!({
            "available": true,
            "source": "docker-ssh",
            "hosts": [
                {
                    "id": "agent-vm",
                    "name": "Agent VM",
                    "host": "agent-vm",
                    "available": true,
                    "containers": [{ "name": "portainer", "provider": "docker-ssh" }]
                },
                {
                    "id": "utility-vm",
                    "name": "Utility VM",
                    "host": "utility-vm",
                    "available": true,
                    "containers": [{ "name": "utility", "provider": "docker-ssh" }]
                }
            ],
            "containers": []
        });
        let portainer = json!({
            "available": true,
            "endpoints": [
                { "id": 5, "name": "agent-vm", "url": "tcp://10.0.0.5:9001" }
            ]
        });

        let filtered = filter_docker_ssh_shadowed_by_portainer(docker_ssh, &portainer);
        assert_eq!(filtered["source"], "docker-ssh");
        assert_eq!(filtered["hosts"].as_array().unwrap().len(), 1);
        assert_eq!(filtered["hosts"][0]["id"], "utility-vm");
        assert_eq!(filtered["containers"].as_array().unwrap().len(), 1);
        assert_eq!(filtered["available"], true);
    }

    #[test]
    fn test_portainer_endpoint_can_shadow_all_docker_ssh_hosts() {
        let docker_ssh = json!({
            "available": true,
            "source": "docker-ssh",
            "hosts": [{
                "id": "agent-vm",
                "name": "Agent VM",
                "host": "agent-vm",
                "available": true,
                "containers": [{ "name": "portainer", "provider": "docker-ssh" }]
            }],
            "containers": []
        });
        let portainer = json!({
            "available": true,
            "endpoints": [
                { "id": 5, "name": "agent-vm" }
            ]
        });

        let filtered = filter_docker_ssh_shadowed_by_portainer(docker_ssh, &portainer);
        assert_eq!(filtered["source"], "portainer-shadowed");
        assert_eq!(filtered["hosts"].as_array().unwrap().len(), 0);
        assert_eq!(filtered["containers"].as_array().unwrap().len(), 0);
        assert_eq!(filtered["available"], false);
    }

    #[test]
    fn test_decode_docker_exec_output_handles_multiplexed_frames() {
        let mut bytes = Vec::new();
        bytes.extend_from_slice(&[1, 0, 0, 0, 0, 0, 0, 6]);
        bytes.extend_from_slice(b"hello\n");
        bytes.extend_from_slice(&[2, 0, 0, 0, 0, 0, 0, 6]);
        bytes.extend_from_slice(b"warn!\n");

        assert_eq!(decode_docker_exec_output(&bytes), "hello\nwarn!\n");
        assert_eq!(decode_docker_exec_output(b"plain output"), "plain output");
    }

    #[test]
    fn test_docker_create_helpers_parse_ports_labels_and_command() {
        let args = json!({
            "ports": "8080:80/tcp,127.0.0.1:8443:443",
            "labels": "app=home, tier=edge",
            "command": "sleep 3600"
        });
        let (exposed, bindings) = docker_exposed_ports(&args);
        assert!(exposed.get("80/tcp").is_some());
        assert!(exposed.get("443/tcp").is_some());
        assert_eq!(bindings["80/tcp"][0]["HostPort"], "8080");
        assert_eq!(bindings["443/tcp"][0]["HostIp"], "127.0.0.1");
        assert_eq!(bindings["443/tcp"][0]["HostPort"], "8443");

        let labels = arg_string_map(&args, &["labels"]);
        assert_eq!(labels["app"], "home");
        assert_eq!(labels["tier"], "edge");
        assert_eq!(
            docker_command(&args).expect("command"),
            vec![
                "sh".to_string(),
                "-lc".to_string(),
                "sleep 3600".to_string()
            ]
        );
    }

    #[test]
    fn test_portainer_registry_body_validates_auth_and_type() {
        let body = portainer_registry_body(
            &json!({
                "name": "ghcr",
                "url": "ghcr.io",
                "type": 1,
                "authentication": true,
                "username": "robot",
                "password": "token-value",
            }),
            true,
        )
        .expect("registry body");
        assert_eq!(body["Name"], "ghcr");
        assert_eq!(body["URL"], "ghcr.io");
        assert_eq!(body["Type"], 1);
        assert_eq!(body["Authentication"], true);
        assert_eq!(body["Username"], "robot");
        assert!(portainer_registry_body(
            &json!({ "name": "bad", "url": "registry.local", "type": 99 }),
            true
        )
        .is_err());
        assert!(portainer_registry_body(
            &json!({ "name": "ghcr", "url": "ghcr.io", "authentication": true }),
            true
        )
        .is_err());
        let update = portainer_registry_body(
            &json!({ "name": "ghcr", "url": "ghcr.io", "type": 1 }),
            false,
        )
        .expect("registry update body");
        assert!(update.get("Authentication").is_none());
        assert!(portainer_registry_body(
            &json!({ "name": "ghcr", "url": "ghcr.io", "authentication": true }),
            false
        )
        .is_err());
    }

    #[test]
    fn test_validate_proxmox_control_actions() {
        assert!(validate_proxmox_action("set-memory").is_ok());
        assert!(validate_proxmox_action("set-cpu").is_ok());
        assert!(validate_proxmox_action("set-network").is_ok());
        assert!(validate_proxmox_action("add-network").is_ok());
        assert!(validate_proxmox_action("remove-network").is_ok());
        assert!(validate_proxmox_action("resize-disk").is_ok());
        assert!(validate_proxmox_action("add-disk").is_ok());
        assert!(validate_proxmox_action("remove-disk").is_ok());
        assert!(validate_proxmox_action("snapshot").is_ok());
        assert!(validate_proxmox_action("backup").is_ok());
        assert!(validate_proxmox_action("restore").is_ok());
        assert!(validate_proxmox_action("delete-backup").is_ok());
        assert!(validate_proxmox_action("enable-storage").is_ok());
        assert!(validate_proxmox_action("disable-storage").is_ok());
        assert!(validate_proxmox_action("migrate").is_ok());
        assert!(validate_proxmox_action("clone").is_ok());
        assert!(validate_proxmox_action("set-name").is_ok());
        assert!(validate_proxmox_action("set-tags").is_ok());
        assert!(validate_proxmox_action("set-onboot").is_ok());
        assert!(validate_proxmox_action("set-protection").is_ok());
        assert!(validate_proxmox_action("set-firewall").is_ok());
        assert!(validate_proxmox_action("add-firewall-rule").is_ok());
        assert!(validate_proxmox_action("update-firewall-rule").is_ok());
        assert!(validate_proxmox_action("delete-firewall-rule").is_ok());
        assert!(validate_proxmox_action("task-log").is_ok());
        assert!(validate_proxmox_action("task-status").is_ok());
        assert!(validate_proxmox_action("stop-task").is_ok());
        assert!(validate_proxmox_action("add-ha").is_ok());
        assert!(validate_proxmox_action("set-ha-state").is_ok());
        assert!(validate_proxmox_action("remove-ha").is_ok());
        assert!(validate_proxmox_action("restart").is_ok());
        assert!(validate_proxmox_action("reload").is_ok());
        assert!(validate_proxmox_action("create-vm").is_ok());
        assert!(validate_proxmox_action("create-lxc").is_ok());
        assert!(validate_proxmox_action("delete").is_ok());
        assert!(validate_proxmox_action("format-node").is_err());
    }

    #[test]
    fn test_validate_opnsense_service_actions() {
        assert!(validate_opnsense_action("start").is_ok());
        assert!(validate_opnsense_action("stop").is_ok());
        assert!(validate_opnsense_action("restart").is_ok());
        assert!(validate_opnsense_action("factory-reset").is_err());
    }

    #[test]
    fn test_validate_system_actions() {
        assert!(validate_system_action("open").is_ok());
        assert!(validate_system_action("healthcheck").is_ok());
        assert!(validate_system_action("format").is_err());
    }

    #[test]
    fn test_homelab_system_url_normalizes_hosts() {
        assert_eq!(
            homelab_system_url("adguard.local:3000").as_deref(),
            Some("https://adguard.local:3000")
        );
        assert_eq!(
            homelab_system_url("http://nas.local/").as_deref(),
            Some("http://nas.local")
        );
        assert!(homelab_system_url("bucket-name").is_none());
    }

    #[test]
    fn test_opnsense_inventory_helpers_default_safely() {
        let value = json!({
            "total": "2",
            "rows": [{ "name": "WAN" }, { "name": "LAN" }]
        });
        assert_eq!(opnsense_rows(Some(&value)).as_array().unwrap().len(), 2);
        assert_eq!(opnsense_total(Some(&value)), 2);
        assert_eq!(opnsense_rows(None), json!([]));
        assert_eq!(opnsense_total(None), 0);
    }

    #[test]
    fn test_parse_opnsense_services() {
        let services = parse_opnsense_services(&json!({
            "rows": [
                { "id": "unbound", "name": "unbound", "description": "Unbound DNS", "running": 1, "locked": 0 },
                { "id": "kea-dhcp4", "name": "kea-dhcp4", "description": "Kea DHCPv4", "running": "0", "locked": "1" }
            ]
        }));
        assert_eq!(services.len(), 2);
        assert_eq!(services[1].id, "unbound");
        assert!(services[1].running);
        assert!(!services[1].locked);
        assert!(services[0].locked);
    }

    #[test]
    fn test_validate_proxmox_hardware_keys() {
        assert_eq!(
            validate_proxmox_network_key("net1").expect("valid network key"),
            "net1"
        );
        assert!(validate_proxmox_network_key("eth0").is_err());

        assert_eq!(
            validate_proxmox_disk_key("scsi1", "qemu").expect("valid qemu disk key"),
            "scsi1"
        );
        assert_eq!(
            validate_proxmox_disk_key("rootfs", "lxc").expect("valid lxc disk key"),
            "rootfs"
        );
        assert_eq!(
            validate_proxmox_disk_key("mp0", "lxc").expect("valid lxc mount key"),
            "mp0"
        );
        assert!(validate_proxmox_disk_key("rootfs", "qemu").is_err());
        assert!(validate_proxmox_disk_key("scsi1", "lxc").is_err());
    }

    #[test]
    fn test_destructive_confirmation_covers_portainer_assets_and_prune() {
        let args = json!({ "name": "portainer_data" });
        assert!(
            require_destructive_confirmation("remove-volume", "portainer_data", &args, None)
                .is_err()
        );
        assert!(require_destructive_confirmation(
            "remove-volume",
            "portainer_data",
            &args,
            Some("portainer_data")
        )
        .is_ok());
        assert!(require_destructive_confirmation(
            "prune-images",
            "3",
            &json!({ "name": "agent-vm" }),
            Some("agent-vm")
        )
        .is_ok());
        assert!(require_destructive_confirmation(
            "update-stack",
            "8",
            &json!({ "name": "infra-stack" }),
            None
        )
        .is_err());
        assert!(require_destructive_confirmation(
            "update-stack",
            "8",
            &json!({ "name": "infra-stack" }),
            Some("infra-stack")
        )
        .is_ok());
        assert!(require_destructive_confirmation(
            "remove-registry",
            "4",
            &json!({ "name": "ghcr" }),
            None
        )
        .is_err());
        assert!(require_destructive_confirmation(
            "remove-registry",
            "4",
            &json!({ "name": "ghcr" }),
            Some("ghcr")
        )
        .is_ok());
        assert!(require_destructive_confirmation(
            "delete",
            "100",
            &json!({ "name": "media" }),
            Some("media")
        )
        .is_ok());
        assert!(require_destructive_confirmation(
            "remove-disk",
            "100",
            &json!({ "name": "media" }),
            None
        )
        .is_err());
        assert!(require_destructive_confirmation(
            "remove-network",
            "100",
            &json!({ "name": "media" }),
            Some("media")
        )
        .is_ok());
        assert!(require_destructive_confirmation(
            "remove-secret",
            "secret-id",
            &json!({ "name": "db_password" }),
            None
        )
        .is_err());
        assert!(require_destructive_confirmation(
            "remove-config",
            "config-id",
            &json!({ "name": "app_config" }),
            Some("app_config")
        )
        .is_ok());
    }

    #[test]
    fn test_homelab_control_audit_details_omit_confirmation_secret() {
        let body = HomelabControlInput {
            provider: "portainer".into(),
            instance_id: Some("primary".into()),
            resource_type: "endpoint".into(),
            resource_id: "3".into(),
            action: "prune-images".into(),
            args: json!({ "name": "agent-vm", "endpoint_id": 3 }),
            confirmation: Some("agent-vm".into()),
        };
        let details = homelab_control_audit_details(&body);
        assert_eq!(details["provider"], "portainer");
        assert_eq!(details["resource_type"], "endpoint");
        assert_eq!(details["resource_id"], "3");
        assert_eq!(details["action"], "prune-images");
        assert_eq!(details["destructive"], true);
        assert_eq!(details["confirmation_supplied"], true);
        assert!(details.get("confirmation").is_none());
    }

    #[test]
    fn test_validate_proxmox_config_value_rejects_newlines() {
        assert!(
            validate_proxmox_config_value("virtio,bridge=vmbr0,firewall=1", "network config")
                .is_ok()
        );
        assert!(validate_proxmox_config_value("virtio\nbridge=vmbr0", "network config").is_err());
    }

    #[test]
    fn test_validate_proxmox_volume_id_allows_backup_archives() {
        let archive = "local:backup/vzdump-qemu-101-2026_05_13-00_00_00.vma.zst";
        assert_eq!(
            validate_proxmox_volume_id(archive, "backup archive").expect("archive"),
            archive
        );
        assert!(
            validate_proxmox_volume_id("local:backup/bad archive.vma.zst", "backup archive")
                .is_err()
        );
    }

    #[test]
    fn test_validate_proxmox_ha_helpers() {
        assert_eq!(proxmox_ha_sid("qemu", 100), "vm:100");
        assert_eq!(proxmox_ha_sid("lxc", 200), "ct:200");
        assert_eq!(
            validate_proxmox_ha_state("started").expect("state"),
            "started"
        );
        assert!(validate_proxmox_ha_state("evacuate").is_err());
        assert_eq!(
            validate_proxmox_firewall_policy("DROP").expect("policy"),
            "DROP"
        );
        assert!(validate_proxmox_firewall_policy("ALLOW").is_err());
        assert_eq!(
            validate_proxmox_firewall_rule_type("IN").expect("rule type"),
            "in"
        );
        assert_eq!(
            validate_proxmox_firewall_rule_action("accept").expect("rule action"),
            "ACCEPT"
        );
        assert!(validate_proxmox_firewall_rule_type("sideways").is_err());
    }

    #[test]
    fn test_proxmox_firewall_rule_form_validates_required_fields() {
        let form = proxmox_firewall_rule_form(
            &json!({
                "type": "in",
                "action": "ACCEPT",
                "proto": "tcp",
                "dport": "443",
                "source": "10.0.0.0/24",
                "comment": "https from lan"
            }),
            true,
        )
        .expect("firewall rule");
        assert!(form.contains(&("type".into(), "in".into())));
        assert!(form.contains(&("action".into(), "ACCEPT".into())));
        assert!(form.contains(&("enable".into(), "1".into())));
        assert!(form.contains(&("dport".into(), "443".into())));
        assert!(proxmox_firewall_rule_form(&json!({ "action": "ACCEPT" }), true).is_err());
        assert!(proxmox_firewall_rule_form(
            &json!({ "type": "sideways", "action": "ACCEPT" }),
            true
        )
        .is_err());
    }

    #[test]
    fn test_proxmox_config_inventory_extracts_disks_and_networks() {
        let config = json!({
            "cores": 4,
            "memory": 8192,
            "scsi0": "local-lvm:vm-100-disk-0,size=80G,ssd=1",
            "net0": "virtio=AA:BB:CC:DD:EE:FF,bridge=vmbr0,firewall=1",
            "rootfs": "tank:subvol-200-disk-0,size=32G",
            "description": "not inventory"
        });
        let (disks, networks) = proxmox_config_inventory(&config);
        assert_eq!(disks.len(), 2);
        assert_eq!(disks[0].key, "rootfs");
        assert_eq!(disks[0].storage.as_deref(), Some("tank"));
        assert_eq!(disks[1].key, "scsi0");
        assert_eq!(disks[1].size.as_deref(), Some("80G"));
        assert_eq!(networks.len(), 1);
        assert_eq!(networks[0].key, "net0");
        assert_eq!(networks[0].bridge.as_deref(), Some("vmbr0"));
    }

    #[test]
    fn test_merge_proxmox_node_details_fills_missing_node() {
        let mut cluster_vms = vec![to_vm(&ProxmoxResourceRaw {
            resource_type: Some("qemu".into()),
            name: Some("media".into()),
            vmid: Some(100),
            node: None,
            status: Some("running".into()),
            cpu: Some(0.1),
            mem: Some(0),
            maxmem: Some(0),
        })];
        let node_vms = vec![to_vm(&ProxmoxResourceRaw {
            resource_type: Some("qemu".into()),
            name: Some("media".into()),
            vmid: Some(100),
            node: Some("pve".into()),
            status: Some("running".into()),
            cpu: Some(0.1),
            mem: Some(4_294_967_296),
            maxmem: Some(8_589_934_592),
        })];
        merge_proxmox_node_details(&mut cluster_vms, node_vms);
        assert_eq!(cluster_vms[0].node, "pve");
        assert_eq!(cluster_vms[0].mem, 4_294_967_296);
        assert_eq!(cluster_vms[0].maxmem, 8_589_934_592);
    }

    #[test]
    fn test_to_proxmox_storage_maps_capacity_and_flags() {
        let raw = ProxmoxStorageRaw {
            storage: Some("local-lvm".into()),
            storage_type: Some("lvmthin".into()),
            content: Some("images,rootdir".into()),
            enabled: Some(json!(1)),
            active: Some(json!(true)),
            total: Some(100),
            used: Some(40),
            avail: Some(60),
            shared: Some(json!("0")),
        };
        let storage = to_proxmox_storage("pve", raw).expect("storage");
        assert_eq!(storage.node, "pve");
        assert_eq!(storage.name, "local-lvm");
        assert_eq!(storage.storage_type, "lvmthin");
        assert!(storage.enabled);
        assert!(storage.active);
        assert!(!storage.shared);
        assert_eq!(storage.used, 40);
        assert_eq!(storage.avail, 60);
    }

    #[test]
    fn test_to_proxmox_backup_infers_kind_and_vmid() {
        let raw = ProxmoxBackupRaw {
            volid: Some("local:backup/vzdump-qemu-101-2026_05_13-00_00_00.vma.zst".into()),
            format: Some("vma.zst".into()),
            content: Some("backup".into()),
            notes: Some("manual".into()),
            subtype: None,
            protected: Some(json!(1)),
            size: Some(4096),
            ctime: Some(1_778_630_400),
            vmid: None,
        };
        let backup = to_proxmox_backup("pve", "local", raw).expect("backup");
        assert_eq!(backup.node, "pve");
        assert_eq!(backup.storage, "local");
        assert_eq!(backup.kind, "qemu");
        assert_eq!(backup.vmid, Some(101));
        assert!(backup.protected);
    }

    #[test]
    fn test_to_proxmox_task_defaults_running_status() {
        let raw = ProxmoxTaskRaw {
            upid: Some("UPID:pve:abc".into()),
            id: Some("100".into()),
            node: None,
            user: Some("root@pam".into()),
            task_type: Some("qmstart".into()),
            status: None,
            starttime: Some(123),
            endtime: None,
        };
        let task = to_proxmox_task("pve", raw).expect("task");
        assert_eq!(task.node, "pve");
        assert_eq!(task.id, "100");
        assert_eq!(task.task_type, "qmstart");
        assert_eq!(task.status, "running");
        assert_eq!(task.starttime, 123);
    }

    #[test]
    fn test_to_proxmox_service_maps_node_service_state() {
        let raw = ProxmoxServiceRaw {
            id: Some("pvedaemon".into()),
            name: None,
            desc: Some("PVE API daemon".into()),
            state: Some("running".into()),
        };
        let service = to_proxmox_service("pve", raw).expect("service");
        assert_eq!(service.node, "pve");
        assert_eq!(service.id, "pvedaemon");
        assert_eq!(service.name, "pvedaemon");
        assert_eq!(service.description, "PVE API daemon");
        assert_eq!(service.state, "running");
    }

    // ---- parse_opnsense_uptime edge cases ----

    #[test]
    fn test_parse_opnsense_uptime_plural_days() {
        assert_eq!(
            parse_opnsense_uptime("15 days, 02:30:45"),
            15 * 86400 + 2 * 3600 + 30 * 60 + 45
        );
    }

    #[test]
    fn test_parse_opnsense_uptime_hours_only() {
        assert_eq!(parse_opnsense_uptime("00:45:00"), 45 * 60);
    }

    #[test]
    fn test_parse_opnsense_uptime_empty() {
        assert_eq!(parse_opnsense_uptime(""), 0);
    }

    // ---- format_bytes_human edge cases ----

    #[test]
    fn test_format_bytes_human_zero() {
        assert_eq!(format_bytes_human(0), "0.0 KB");
    }

    #[test]
    fn test_format_bytes_human_exact_gb() {
        assert_eq!(format_bytes_human(1_000_000_000), "1.0 GB");
    }

    #[test]
    fn test_format_bytes_human_large_tb() {
        assert_eq!(format_bytes_human(5_000_000_000_000), "5.0 TB");
    }

    // ---- parse_stat_value edge cases ----

    #[test]
    fn test_parse_stat_value_null_value() {
        let obj = json!({"key": null});
        assert_eq!(parse_stat_value(&obj, "key"), 0);
    }

    #[test]
    fn test_parse_stat_value_non_numeric_string() {
        let obj = json!({"key": "not-a-number"});
        assert_eq!(parse_stat_value(&obj, "key"), 0);
    }

    // ---- to_vm ----

    #[test]
    fn test_to_vm_with_all_fields() {
        let raw = ProxmoxResourceRaw {
            resource_type: Some("qemu".into()),
            name: Some("my-vm".into()),
            vmid: Some(100),
            status: Some("running".into()),
            cpu: Some(0.25),
            mem: Some(4_000_000_000),
            maxmem: Some(8_000_000_000),
            node: Some("pve".into()),
        };
        let vm = to_vm(&raw);
        assert_eq!(vm.name, "my-vm");
        assert_eq!(vm.status, "running");
        assert!((vm.cpu - 0.25).abs() < f64::EPSILON);
        assert_eq!(vm.mem, 4_000_000_000);
        assert_eq!(vm.maxmem, 8_000_000_000);
        assert_eq!(vm.node, "pve");
        assert_eq!(vm.kind, "qemu");
    }

    #[test]
    fn test_to_vm_missing_name_uses_vmid() {
        let raw = ProxmoxResourceRaw {
            resource_type: Some("lxc".into()),
            name: None,
            vmid: Some(200),
            status: None,
            cpu: None,
            mem: None,
            maxmem: None,
            node: None,
        };
        let vm = to_vm(&raw);
        assert_eq!(vm.name, "VM 200");
        assert_eq!(vm.status, "");
        assert!((vm.cpu - 0.0).abs() < f64::EPSILON);
        assert_eq!(vm.mem, 0);
        assert_eq!(vm.kind, "lxc");
    }
}
