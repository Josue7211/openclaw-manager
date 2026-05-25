use axum::{
    extract::{
        ws::{Message as AxumWsMessage, WebSocket, WebSocketUpgrade},
        Query, State,
    },
    response::{IntoResponse, Response},
    routing::get,
    routing::post,
    Json, Router,
};
use base64::{engine::general_purpose, Engine as _};
use futures::{SinkExt, StreamExt};
use rand::Rng;
use reqwest::Client;
use serde::{Deserialize, Deserializer, Serialize};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    OnceLock,
};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tokio::process::Command;
use tokio::sync::Mutex;
use tokio_tungstenite::{
    connect_async_tls_with_config,
    tungstenite::{client::IntoClientRequest, Message as TungsteniteMessage},
    Connector as WsConnector,
};
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
struct ProxmoxStorageContentRaw {
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

#[derive(Debug, Default, Serialize)]
struct ProxmoxHaGroup {
    group: String,
    nodes: String,
    nofailback: bool,
    restricted: bool,
    comment: String,
}

#[derive(Debug, Default, Serialize)]
struct ProxmoxAccessInventory {
    users: Vec<ProxmoxAccessUser>,
    groups: Vec<ProxmoxAccessGroup>,
    roles: Vec<ProxmoxAccessRole>,
    acl: Vec<ProxmoxAccessAcl>,
    realms: Vec<ProxmoxAccessRealm>,
    tokens: Vec<ProxmoxAccessToken>,
}

#[derive(Debug, Default, Serialize)]
struct ProxmoxAccessUser {
    userid: String,
    enabled: bool,
    expire: u64,
    firstname: String,
    lastname: String,
    email: String,
    comment: String,
    groups: String,
}

#[derive(Debug, Default, Serialize)]
struct ProxmoxAccessGroup {
    groupid: String,
    comment: String,
    users: String,
}

#[derive(Debug, Default, Serialize)]
struct ProxmoxAccessRole {
    roleid: String,
    privs: String,
    special: bool,
}

#[derive(Debug, Default, Serialize)]
struct ProxmoxAccessAcl {
    path: String,
    ugid: String,
    roleid: String,
    propagate: bool,
    acl_type: String,
}

#[derive(Debug, Default, Serialize)]
struct ProxmoxAccessRealm {
    realm: String,
    realm_type: String,
    comment: String,
    default_realm: bool,
    tfa: String,
}

#[derive(Debug, Default, Serialize)]
struct ProxmoxAccessToken {
    userid: String,
    tokenid: String,
    comment: String,
    expire: u64,
    privsep: bool,
}

#[derive(Debug, Default, Serialize)]
struct ProxmoxNodeNetwork {
    node: String,
    iface: String,
    #[serde(rename = "type")]
    network_type: String,
    method: String,
    method6: String,
    cidr: String,
    address: String,
    netmask: String,
    gateway: String,
    bridge_ports: String,
    active: bool,
    autostart: bool,
    comments: String,
}

#[derive(Debug, Default, Serialize)]
struct ProxmoxNodeDns {
    node: String,
    search: String,
    dns1: String,
    dns2: String,
    dns3: String,
}

#[derive(Debug, Default, Serialize)]
struct ProxmoxNodeTime {
    node: String,
    timezone: String,
    localtime: u64,
    time: u64,
}

#[derive(Debug, Default, Serialize)]
struct ProxmoxNodeHostConfig {
    node: String,
    content: String,
}

#[derive(Debug, Default, Serialize)]
struct ProxmoxNodeRepository {
    node: String,
    path: String,
    file_type: String,
    enabled: bool,
    status: String,
    suite: String,
    component: String,
    comment: String,
    uri: String,
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
struct ProxmoxBackupJob {
    id: String,
    enabled: bool,
    schedule: String,
    storage: String,
    node: String,
    vmids: String,
    exclude: String,
    all: bool,
    mode: String,
    compress: String,
    mailto: String,
    mailnotification: String,
    notification_mode: String,
    prune_backups: String,
    notes_template: String,
    comment: String,
}

#[derive(Debug, Default, Serialize)]
struct ProxmoxReplicationJob {
    id: String,
    guest: String,
    target: String,
    source: String,
    schedule: String,
    rate: String,
    enabled: bool,
    job_type: String,
    comment: String,
    next_sync: u64,
    last_sync: u64,
    last_try: u64,
    duration: u64,
    fail_count: u64,
    error: String,
}

#[derive(Debug, Default, Serialize)]
struct ProxmoxPool {
    poolid: String,
    comment: String,
    member_count: usize,
    members: Vec<Value>,
}

#[derive(Debug, Default, Serialize)]
struct ProxmoxSdnInventory {
    status: Vec<Value>,
    controllers: Vec<Value>,
    zones: Vec<Value>,
    vnets: Vec<ProxmoxSdnVnet>,
    subnets: Vec<ProxmoxSdnSubnet>,
    ipams: Vec<Value>,
    dns: Vec<Value>,
    dhcp: Vec<Value>,
}

#[derive(Debug, Default, Serialize)]
struct ProxmoxSdnVnet {
    vnet: String,
    zone: String,
    alias: String,
    tag: String,
    vlanaware: bool,
    mtu: String,
    pending: Value,
    raw: Value,
}

#[derive(Debug, Default, Serialize)]
struct ProxmoxSdnSubnet {
    vnet: String,
    subnet: String,
    gateway: String,
    snat: bool,
    dhcp_range: String,
    dnszoneprefix: String,
    raw: Value,
}

#[derive(Debug, Default, Serialize)]
struct ProxmoxLogInventory {
    cluster: Vec<Value>,
    node_syslog: Vec<Value>,
    node_journal: Vec<Value>,
}

#[derive(Debug, Default, Serialize)]
struct ProxmoxFirewallInventory {
    options: Value,
    rules: Vec<Value>,
    aliases: Vec<ProxmoxFirewallAlias>,
    ipsets: Vec<ProxmoxFirewallIpset>,
    groups: Vec<ProxmoxFirewallGroup>,
}

#[derive(Debug, Default, Serialize)]
struct ProxmoxFirewallAlias {
    name: String,
    cidr: String,
    comment: String,
}

#[derive(Debug, Default, Serialize)]
struct ProxmoxFirewallIpset {
    name: String,
    comment: String,
    entries: Vec<Value>,
}

#[derive(Debug, Default, Serialize)]
struct ProxmoxFirewallGroup {
    group: String,
    comment: String,
    rules: Vec<Value>,
}

#[derive(Debug, Default, Serialize)]
struct ProxmoxStorageContent {
    node: String,
    storage: String,
    volid: String,
    name: String,
    content: String,
    subtype: String,
    format: String,
    vmid: Option<u64>,
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
    #[serde(rename = "resourceType", alias = "resource_type")]
    resource_type: String,
    #[serde(rename = "resourceId", alias = "resource_id")]
    resource_id: String,
    action: String,
    #[serde(default)]
    args: Value,
    #[serde(default)]
    confirmation: Option<String>,
}

#[derive(Debug, Deserialize)]
struct PortainerControlInput {
    #[serde(default, rename = "instanceId")]
    instance_id: Option<String>,
    #[serde(rename = "resourceType", alias = "resource_type")]
    resource_type: String,
    #[serde(rename = "resourceId", alias = "resource_id")]
    resource_id: String,
    action: String,
    #[serde(default)]
    args: Value,
    #[serde(default)]
    confirmation: Option<String>,
}

#[derive(Debug, Deserialize)]
struct PortainerTerminalSessionInput {
    #[serde(default, rename = "instanceId")]
    instance_id: Option<String>,
    #[serde(rename = "resourceType", alias = "resource_type")]
    resource_type: String,
    #[serde(rename = "resourceId", alias = "resource_id")]
    resource_id: String,
    action: String,
    #[serde(default)]
    args: Value,
}

impl From<PortainerControlInput> for HomelabControlInput {
    fn from(value: PortainerControlInput) -> Self {
        Self {
            provider: "portainer".into(),
            instance_id: value.instance_id,
            resource_type: value.resource_type,
            resource_id: value.resource_id,
            action: value.action,
            args: value.args,
            confirmation: value.confirmation,
        }
    }
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

#[derive(Clone, Debug, PartialEq, Eq)]
enum PortainerTerminalKind {
    ContainerLogs,
    DockerEvents,
    ContainerExec,
    KubernetesPodExec,
}

#[derive(Clone, Debug)]
struct PortainerTerminalSession {
    kind: PortainerTerminalKind,
    config: PortainerInstanceConfig,
    endpoint_id: i64,
    resource_id: String,
    target_label: String,
    command: Vec<String>,
    tail: u64,
    since: Option<u64>,
    event_filters: Option<String>,
    namespace: Option<String>,
    container: Option<String>,
    expires_at: Instant,
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
    #[serde(rename = "Type")]
    endpoint_type: Option<i64>,
    #[serde(rename = "GroupId")]
    group_id: Option<i64>,
    #[serde(rename = "TagIds", default)]
    tag_ids: Vec<i64>,
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
    #[serde(skip_serializing_if = "Option::is_none")]
    created: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    command: Option<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    network_names: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    mount_count: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    labels: Option<Value>,
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

#[derive(Clone)]
struct ProxmoxApiCredentials {
    url: String,
    token_id: String,
    token_secret: String,
    origin: &'static str,
}

#[derive(Clone, Debug, PartialEq, Eq)]
enum ProxmoxProxyKind {
    Console,
    Shell,
}

#[derive(Clone, Debug)]
struct ProxmoxProxySession {
    kind: ProxmoxProxyKind,
    config_url: String,
    auth_header: String,
    console_user: Option<String>,
    node: String,
    guest_kind: Option<String>,
    vmid: Option<u64>,
    port: u16,
    ticket: String,
    expires_at: Instant,
}

#[derive(Debug, Deserialize)]
struct ProxmoxConsoleSessionInput {
    #[serde(default)]
    node: Option<String>,
    kind: String,
    vmid: u64,
}

#[derive(Debug, Deserialize)]
struct ProxmoxShellSessionInput {
    node: String,
}

#[derive(Debug, Deserialize)]
struct ProxmoxWsSessionQuery {
    #[serde(rename = "sessionId")]
    session_id: String,
}

fn proxmox_proxy_sessions() -> &'static Mutex<HashMap<String, ProxmoxProxySession>> {
    static SESSIONS: OnceLock<Mutex<HashMap<String, ProxmoxProxySession>>> = OnceLock::new();
    SESSIONS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn portainer_terminal_sessions() -> &'static Mutex<HashMap<String, PortainerTerminalSession>> {
    static SESSIONS: OnceLock<Mutex<HashMap<String, PortainerTerminalSession>>> = OnceLock::new();
    SESSIONS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn proxmox_session_id(prefix: &str) -> String {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default();
    let nonce: u64 = rand::thread_rng().gen();
    format!("{prefix}-{millis:x}-{nonce:x}")
}

fn proxmox_token_user(token_id: &str) -> Option<String> {
    let user = token_id.trim();
    (!user.is_empty()).then(|| user.to_string())
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

    #[cfg(not(test))]
    {
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
    }

    #[cfg(test)]
    if std::env::var("HOMELAB_TEST_ALLOW_ENV_LOCAL")
        .ok()
        .as_deref()
        == Some("1")
    {
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
    }
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
    infer_single_proxmox_node(&mut vms, &nodes);
    enrich_proxmox_vms(&client, &config.url, &auth_header, &mut vms).await;
    let (
        storage,
        backups,
        tasks,
        services,
        node_networks,
        node_dns,
        node_time,
        node_hosts,
        node_repositories,
        storage_content,
    ) = fetch_proxmox_node_inventory(&client, &config.url, &auth_header, &nodes).await;
    let (
        ha_resources,
        ha_groups,
        ha_status,
        permissions,
        backup_jobs,
        replication_jobs,
        pools,
        sdn,
        logs,
        firewall,
    ) = tokio::join!(
        fetch_proxmox_ha_resources(&client, &config.url, &auth_header),
        fetch_proxmox_ha_groups(&client, &config.url, &auth_header),
        fetch_proxmox_ha_status(&client, &config.url, &auth_header),
        fetch_proxmox_access_inventory(&client, &config.url, &auth_header),
        fetch_proxmox_backup_jobs(&client, &config.url, &auth_header),
        fetch_proxmox_replication_jobs(&client, &config.url, &auth_header),
        fetch_proxmox_pools(&client, &config.url, &auth_header),
        fetch_proxmox_sdn_inventory(&client, &config.url, &auth_header),
        fetch_proxmox_log_inventory(&client, &config.url, &auth_header, &nodes),
        fetch_proxmox_firewall_inventory(&client, &config.url, &auth_header)
    );

    Some(json!({
        "nodes": nodes,
        "vms": vms,
        "storage": storage,
        "backups": backups,
        "tasks": tasks,
        "services": services,
        "node_networks": node_networks,
        "node_dns": node_dns,
        "node_time": node_time,
        "node_hosts": node_hosts,
        "node_repositories": node_repositories,
        "storage_content": storage_content,
        "ha_resources": ha_resources,
        "ha_groups": ha_groups,
        "ha_status": ha_status,
        "permissions": permissions,
        "backup_jobs": backup_jobs,
        "replication_jobs": replication_jobs,
        "pools": pools,
        "sdn": sdn,
        "logs": logs,
        "firewall": firewall,
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

fn value_as_port(value: &Value) -> Option<u16> {
    value
        .as_u64()
        .or_else(|| value.as_str().and_then(|text| text.parse::<u64>().ok()))
        .and_then(|port| u16::try_from(port).ok())
        .filter(|port| (5900..=5999).contains(port))
}

fn websocket_base_url(config_url: &str) -> String {
    if let Some(rest) = config_url.strip_prefix("https://") {
        format!("wss://{rest}")
    } else if let Some(rest) = config_url.strip_prefix("http://") {
        format!("ws://{rest}")
    } else {
        format!("wss://{}", config_url.trim_start_matches('/'))
    }
}

fn proxmox_ws_connector(config_url: &str) -> Option<WsConnector> {
    if !config_url.starts_with("https://") && !config_url.starts_with("wss://") {
        return None;
    }
    native_tls::TlsConnector::builder()
        .danger_accept_invalid_certs(true)
        .build()
        .ok()
        .map(WsConnector::NativeTls)
}

fn compact_error_body(text: &str) -> String {
    let normalized = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if normalized.chars().count() > 500 {
        format!("{}...", normalized.chars().take(500).collect::<String>())
    } else {
        normalized
    }
}

fn proxmox_upid_from_response(body: &Value) -> Option<String> {
    body.get("data")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| value.starts_with("UPID:"))
        .map(str::to_string)
}

fn proxmox_upid_node(upid: &str) -> Option<String> {
    let mut parts = upid.split(':');
    if parts.next()? != "UPID" {
        return None;
    }
    parts
        .next()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

async fn proxmox_task_status_snapshot(
    client: &Client,
    config: &ProxmoxApiCredentials,
    auth_header: &str,
    fallback_node: &str,
    upid: &str,
) -> Value {
    let node = proxmox_upid_node(upid).unwrap_or_else(|| fallback_node.to_string());
    let encoded_node = urlencoding::encode(&node);
    let encoded_upid = urlencoding::encode(upid);
    let url = format!(
        "{}/api2/json/nodes/{encoded_node}/tasks/{encoded_upid}/status",
        config.url
    );

    match client
        .get(url)
        .header("Authorization", auth_header)
        .send()
        .await
    {
        Ok(res) if res.status().is_success() => {
            let body = res.json::<Value>().await.unwrap_or_else(|_| json!({}));
            json!({
                "upid": upid,
                "node": node,
                "status": body.get("data").cloned().unwrap_or_else(|| body.clone()),
                "response": body,
            })
        }
        Ok(res) => {
            let status = res.status();
            let text = res.text().await.unwrap_or_default();
            json!({
                "upid": upid,
                "node": node,
                "status": "unknown",
                "error": compact_error_body(&text),
                "httpStatus": status.as_u16(),
            })
        }
        Err(err) => json!({
            "upid": upid,
            "node": node,
            "status": "unknown",
            "error": err.to_string(),
        }),
    }
}

async fn insert_proxmox_proxy_session(id: String, session: ProxmoxProxySession) {
    let mut sessions = proxmox_proxy_sessions().lock().await;
    let now = Instant::now();
    sessions.retain(|_, existing| existing.expires_at > now);
    sessions.insert(id, session);
}

async fn take_proxmox_proxy_session(
    id: &str,
    expected_kind: ProxmoxProxyKind,
) -> Result<ProxmoxProxySession, AppError> {
    let mut sessions = proxmox_proxy_sessions().lock().await;
    let now = Instant::now();
    sessions.retain(|_, existing| existing.expires_at > now);
    let Some(session) = sessions.remove(id) else {
        return Err(AppError::NotFound(
            "Proxmox console session expired or unknown".into(),
        ));
    };
    if session.kind != expected_kind {
        return Err(AppError::BadRequest("Proxmox session type mismatch".into()));
    }
    Ok(session)
}

async fn create_proxmox_console_session(
    state: &AppState,
    input: ProxmoxConsoleSessionInput,
) -> Result<Value, AppError> {
    let requested_node = input
        .node
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| validate_control_token(value, "node"))
        .transpose()?;
    let kind = validate_proxmox_kind(&input.kind)?;
    if !(100..=999_999_999).contains(&input.vmid) {
        return Err(AppError::BadRequest("VMID is out of range".into()));
    }

    let configs = proxmox_api_configs(state);
    if configs.is_empty() {
        return Err(AppError::BadRequest(
            "Proxmox API credentials are required for embedded console".into(),
        ));
    }

    let client = insecure_client();
    let mut last_error: Option<String> = None;
    for config in configs {
        let auth_header = format!("PVEAPIToken={}={}", config.token_id, config.token_secret);
        let node = if let Some(node) = requested_node.as_deref() {
            node.to_string()
        } else {
            match infer_single_proxmox_api_node(&client, &config, &auth_header).await {
                Ok(node) => node,
                Err(err) => {
                    last_error = Some(err);
                    continue;
                }
            }
        };
        let encoded_node = urlencoding::encode(&node);
        let url = format!(
            "{}/api2/json/nodes/{}/{}/{}/vncproxy",
            config.url, encoded_node, kind, input.vmid
        );
        let mut response = None;
        let mut last_request_error = None;
        for attempt in 1..=3 {
            match client
                .post(&url)
                .header("Authorization", &auth_header)
                .form(&[("websocket", "1")])
                .send()
                .await
            {
                Ok(res) => {
                    response = Some(res);
                    break;
                }
                Err(err) => {
                    last_request_error = Some(err);
                    if attempt < 3 {
                        tokio::time::sleep(Duration::from_millis(250 * attempt)).await;
                    }
                }
            }
        }

        match response {
            Some(res) if res.status().is_success() => {
                let body = res.json::<ProxmoxResponse<Value>>().await?;
                let data = body.data.unwrap_or_else(|| json!({}));
                let port = data.get("port").and_then(value_as_port).ok_or_else(|| {
                    AppError::BadRequest("Proxmox vncproxy did not return a valid port".into())
                })?;
                let ticket = data
                    .get("ticket")
                    .or_else(|| data.get("vncticket"))
                    .and_then(Value::as_str)
                    .map(str::to_string)
                    .filter(|value| !value.is_empty())
                    .ok_or_else(|| {
                        AppError::BadRequest("Proxmox vncproxy did not return a ticket".into())
                    })?;
                let id = proxmox_session_id("pve-console");
                let ttl = Duration::from_secs(90);
                let password = ticket.clone();
                insert_proxmox_proxy_session(
                    id.clone(),
                    ProxmoxProxySession {
                        kind: ProxmoxProxyKind::Console,
                        config_url: config.url.clone(),
                        auth_header,
                        console_user: None,
                        node: node.clone(),
                        guest_kind: Some(kind.to_string()),
                        vmid: Some(input.vmid),
                        port,
                        ticket,
                        expires_at: Instant::now() + ttl,
                    },
                )
                .await;
                return Ok(json!({
                    "sessionId": id,
                    "websocketUrl": format!("/api/homelab/proxmox/console/ws?sessionId={}", urlencoding::encode(&id)),
                    "password": password,
                    "expiresInSeconds": ttl.as_secs(),
                    "target": { "node": node, "kind": kind, "vmid": input.vmid },
                }));
            }
            Some(res) => {
                let status = res.status();
                let text = res.text().await.unwrap_or_default();
                let detail = compact_error_body(&text);
                last_error = Some(if detail.is_empty() {
                    format!("{} returned {status}", config.origin)
                } else {
                    format!("{} returned {status}: {detail}", config.origin)
                });
                warn!(
                    source = config.origin,
                    status = %status,
                    error = %detail,
                    node,
                    vmid = input.vmid,
                    "Proxmox vncproxy returned non-success"
                );
            }
            None => {
                let err = last_request_error
                    .map(|err| err.to_string())
                    .unwrap_or_else(|| "unknown request failure".to_string());
                last_error = Some(format!("{} request failed: {err}", config.origin));
                warn!(
                    source = config.origin,
                    error = %err,
                    node,
                    vmid = input.vmid,
                    "Proxmox vncproxy request failed"
                );
            }
        }
    }

    let detail = last_error
        .map(|error| format!(": {error}"))
        .unwrap_or_default();
    let node = requested_node.as_deref().unwrap_or("auto");
    Err(AppError::BadRequest(format!(
        "Unable to open Proxmox console for {kind}/{} on {node}{detail}",
        input.vmid
    )))
}

async fn infer_single_proxmox_api_node(
    client: &Client,
    config: &ProxmoxApiCredentials,
    auth_header: &str,
) -> Result<String, String> {
    let url = format!("{}/api2/json/nodes", config.url);
    let mut response = None;
    let mut last_request_error = None;
    for attempt in 1..=3 {
        match client
            .get(&url)
            .header("Authorization", auth_header)
            .send()
            .await
        {
            Ok(res) => {
                response = Some(res);
                break;
            }
            Err(err) => {
                last_request_error = Some(err);
                if attempt < 3 {
                    tokio::time::sleep(Duration::from_millis(250 * attempt)).await;
                }
            }
        }
    }
    let Some(response) = response else {
        let err = last_request_error
            .map(|err| err.to_string())
            .unwrap_or_else(|| "unknown request failure".to_string());
        return Err(format!(
            "{} node inference request failed: {err}",
            config.origin
        ));
    };
    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        let detail = compact_error_body(&body);
        return Err(if detail.is_empty() {
            format!("{} node inference returned {status}", config.origin)
        } else {
            format!(
                "{} node inference returned {status}: {detail}",
                config.origin
            )
        });
    }
    let data = response
        .json::<ProxmoxResponse<Vec<ProxmoxNodeRaw>>>()
        .await
        .map_err(|err| {
            format!(
                "{} node inference response was invalid: {err}",
                config.origin
            )
        })?;
    let nodes: Vec<String> = data
        .data
        .unwrap_or_default()
        .into_iter()
        .filter_map(|node| node.node)
        .map(|node| node.trim().to_string())
        .filter(|node| !node.is_empty())
        .collect();
    match nodes.as_slice() {
        [node] => Ok(node.clone()),
        [] => Err(format!(
            "{} node inference found no Proxmox nodes",
            config.origin
        )),
        many => Err(format!(
            "{} node inference requires explicit node because {} nodes are visible: {}",
            config.origin,
            many.len(),
            many.join(", ")
        )),
    }
}

async fn create_proxmox_shell_session(
    state: &AppState,
    input: ProxmoxShellSessionInput,
) -> Result<Value, AppError> {
    let node = validate_control_token(&input.node, "node")?;
    let configs = proxmox_api_configs(state);
    if configs.is_empty() {
        return Err(AppError::BadRequest(
            "Proxmox API credentials are required for embedded shell".into(),
        ));
    }

    let client = insecure_client();
    let encoded_node = urlencoding::encode(&node);
    let mut last_error: Option<String> = None;
    for config in configs {
        let auth_header = format!("PVEAPIToken={}={}", config.token_id, config.token_secret);
        let url = format!("{}/api2/json/nodes/{encoded_node}/termproxy", config.url);
        let response = client
            .post(url)
            .header("Authorization", &auth_header)
            .send()
            .await;

        match response {
            Ok(res) if res.status().is_success() => {
                let body = res.json::<ProxmoxResponse<Value>>().await?;
                let data = body.data.unwrap_or_else(|| json!({}));
                let port = data.get("port").and_then(value_as_port).ok_or_else(|| {
                    AppError::BadRequest("Proxmox termproxy did not return a valid port".into())
                })?;
                let ticket = data
                    .get("ticket")
                    .or_else(|| data.get("vncticket"))
                    .and_then(Value::as_str)
                    .map(str::to_string)
                    .filter(|value| !value.is_empty())
                    .ok_or_else(|| {
                        AppError::BadRequest("Proxmox termproxy did not return a ticket".into())
                    })?;
                let console_user = data
                    .get("user")
                    .and_then(Value::as_str)
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .map(str::to_string)
                    .or_else(|| proxmox_token_user(&config.token_id));
                let id = proxmox_session_id("pve-shell");
                let ttl = Duration::from_secs(90);
                insert_proxmox_proxy_session(
                    id.clone(),
                    ProxmoxProxySession {
                        kind: ProxmoxProxyKind::Shell,
                        config_url: config.url.clone(),
                        auth_header,
                        console_user,
                        node: node.clone(),
                        guest_kind: None,
                        vmid: None,
                        port,
                        ticket,
                        expires_at: Instant::now() + ttl,
                    },
                )
                .await;
                return Ok(json!({
                    "sessionId": id,
                    "websocketUrl": format!("/api/homelab/proxmox/shell/ws?sessionId={}", urlencoding::encode(&id)),
                    "expiresInSeconds": ttl.as_secs(),
                    "target": { "node": node },
                }));
            }
            Ok(res) => {
                let status = res.status();
                let text = res.text().await.unwrap_or_default();
                let detail = compact_error_body(&text);
                last_error = Some(if detail.is_empty() {
                    format!("{} returned {status}", config.origin)
                } else {
                    format!("{} returned {status}: {detail}", config.origin)
                });
                warn!(
                    source = config.origin,
                    status = %status,
                    error = %detail,
                    node,
                    "Proxmox termproxy returned non-success"
                );
            }
            Err(err) => {
                last_error = Some(format!("{} request failed: {err}", config.origin));
                warn!(
                    source = config.origin,
                    error = %err,
                    node,
                    "Proxmox termproxy request failed"
                );
            }
        }
    }

    let detail = last_error
        .map(|error| format!(": {error}"))
        .unwrap_or_default();
    Err(AppError::BadRequest(format!(
        "Unable to open Proxmox node shell on {node}{detail}"
    )))
}

async fn infer_proxmox_guest_node_for_control(
    state: &AppState,
    kind: &str,
    vmid: u64,
) -> Option<String> {
    let inventory = fetch_proxmox(state).await?;
    let proxmox = inventory.get("proxmox").unwrap_or(&inventory);
    let vms = proxmox.get("vms").and_then(Value::as_array)?;
    let expected_kind = if kind == "lxc" { "lxc" } else { "qemu" };
    let matched = vms.iter().find(|vm| {
        vm.get("vmid").and_then(Value::as_u64) == Some(vmid)
            && vm
                .get("kind")
                .and_then(Value::as_str)
                .map(|value| value == expected_kind)
                .unwrap_or(true)
    })?;
    let node = matched
        .get("node")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    if node.is_some() {
        return node;
    }
    let nodes = proxmox.get("nodes").and_then(Value::as_array)?;
    if nodes.len() == 1 {
        return nodes[0]
            .get("name")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string);
    }
    None
}

async fn post_proxmox_console_session(
    State(state): State<AppState>,
    Json(input): Json<ProxmoxConsoleSessionInput>,
) -> Result<Json<Value>, AppError> {
    create_proxmox_console_session(&state, input)
        .await
        .map(success_json)
}

async fn post_proxmox_shell_session(
    State(state): State<AppState>,
    Json(input): Json<ProxmoxShellSessionInput>,
) -> Result<Json<Value>, AppError> {
    create_proxmox_shell_session(&state, input)
        .await
        .map(success_json)
}

async fn proxmox_console_ws(
    Query(query): Query<ProxmoxWsSessionQuery>,
    ws: WebSocketUpgrade,
) -> Response {
    match take_proxmox_proxy_session(&query.session_id, ProxmoxProxyKind::Console).await {
        Ok(session) => ws
            .max_message_size(16 * 1024 * 1024)
            .on_upgrade(move |socket| handle_proxmox_proxy_ws(socket, session)),
        Err(error) => error.into_response(),
    }
}

async fn proxmox_shell_ws(
    Query(query): Query<ProxmoxWsSessionQuery>,
    ws: WebSocketUpgrade,
) -> Response {
    match take_proxmox_proxy_session(&query.session_id, ProxmoxProxyKind::Shell).await {
        Ok(session) => ws
            .max_message_size(16 * 1024 * 1024)
            .on_upgrade(move |socket| handle_proxmox_proxy_ws(socket, session)),
        Err(error) => error.into_response(),
    }
}

fn proxmox_proxy_ws_url(session: &ProxmoxProxySession) -> String {
    let encoded_node = urlencoding::encode(&session.node);
    let encoded_ticket = urlencoding::encode(&session.ticket);
    let base = websocket_base_url(&session.config_url);
    match session.kind {
        ProxmoxProxyKind::Console => format!(
            "{base}/api2/json/nodes/{}/{}/{}/vncwebsocket?port={}&vncticket={}",
            encoded_node,
            session.guest_kind.as_deref().unwrap_or("qemu"),
            session.vmid.unwrap_or_default(),
            session.port,
            encoded_ticket
        ),
        ProxmoxProxyKind::Shell => format!(
            "{base}/api2/json/nodes/{encoded_node}/vncwebsocket?port={}&vncticket={}",
            session.port, encoded_ticket
        ),
    }
}

async fn handle_proxmox_proxy_ws(mut socket: WebSocket, session: ProxmoxProxySession) {
    let remote_url = proxmox_proxy_ws_url(&session);
    let mut request = match remote_url.into_client_request() {
        Ok(request) => request,
        Err(err) => {
            let _ = socket
                .send(AxumWsMessage::Text(
                    json!({ "type": "error", "error": format!("Invalid Proxmox websocket URL: {err}") })
                        .to_string()
                        .into(),
                ))
                .await;
            return;
        }
    };
    if let Ok(value) = session.auth_header.parse() {
        request.headers_mut().insert("Authorization", value);
    }
    if let Ok(value) = "binary".parse() {
        request
            .headers_mut()
            .insert("Sec-WebSocket-Protocol", value);
    }

    let connector = proxmox_ws_connector(&session.config_url);
    let remote = connect_async_tls_with_config(request, None, false, connector).await;
    let Ok((mut remote, _)) = remote else {
        let error = remote.err().map(|err| err.to_string()).unwrap_or_default();
        warn!(
            error = %error,
            node = %session.node,
            kind = ?session.kind,
            "Unable to connect to Proxmox websocket"
        );
        let _ = socket
            .send(AxumWsMessage::Text(
                json!({ "type": "error", "error": "Unable to connect to Proxmox websocket" })
                    .to_string()
                    .into(),
            ))
            .await;
        return;
    };
    if session.kind == ProxmoxProxyKind::Shell {
        let Some(console_user) = session.console_user.as_deref() else {
            let _ = socket
                .send(AxumWsMessage::Text(
                    json!({ "type": "error", "error": "Unable to derive Proxmox console user from API token id" })
                        .to_string()
                        .into(),
                ))
                .await;
            return;
        };
        if remote
            .send(TungsteniteMessage::Text(
                format!("{console_user}:{}\n", session.ticket).into(),
            ))
            .await
            .is_err()
        {
            let _ = socket
                .send(AxumWsMessage::Text(
                    json!({ "type": "error", "error": "Unable to authenticate Proxmox shell websocket" })
                        .to_string()
                        .into(),
                ))
                .await;
            return;
        }
    }

    let (mut local_tx, mut local_rx) = socket.split();
    let (mut remote_tx, mut remote_rx) = remote.split();

    let browser_to_proxmox = async {
        while let Some(message) = local_rx.next().await {
            let Ok(message) = message else { break };
            let outgoing = match message {
                AxumWsMessage::Text(text) => TungsteniteMessage::Text(text.to_string()),
                AxumWsMessage::Binary(data) => TungsteniteMessage::Binary(data),
                AxumWsMessage::Ping(data) => TungsteniteMessage::Ping(data),
                AxumWsMessage::Pong(data) => TungsteniteMessage::Pong(data),
                AxumWsMessage::Close(frame) => {
                    let _ = remote_tx
                        .send(TungsteniteMessage::Close(frame.map(|item| {
                            tokio_tungstenite::tungstenite::protocol::CloseFrame {
                                code: item.code.into(),
                                reason: item.reason.to_string().into(),
                            }
                        })))
                        .await;
                    break;
                }
            };
            if remote_tx.send(outgoing).await.is_err() {
                break;
            }
        }
    };

    let proxmox_to_browser = async {
        while let Some(message) = remote_rx.next().await {
            let Ok(message) = message else { break };
            let outgoing = match message {
                TungsteniteMessage::Text(text) => AxumWsMessage::Text(text.into()),
                TungsteniteMessage::Binary(data) => AxumWsMessage::Binary(data),
                TungsteniteMessage::Ping(data) => AxumWsMessage::Ping(data),
                TungsteniteMessage::Pong(data) => AxumWsMessage::Pong(data),
                TungsteniteMessage::Close(frame) => {
                    let _ = local_tx
                        .send(AxumWsMessage::Close(frame.map(|item| {
                            axum::extract::ws::CloseFrame {
                                code: item.code.into(),
                                reason: item.reason.to_string().into(),
                            }
                        })))
                        .await;
                    break;
                }
                TungsteniteMessage::Frame(_) => continue,
            };
            if local_tx.send(outgoing).await.is_err() {
                break;
            }
        }
    };

    tokio::select! {
        _ = browser_to_proxmox => {},
        _ = proxmox_to_browser => {},
    }
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

    let mut vms: Vec<ProxmoxVM> = raw_resources
        .into_iter()
        .filter(|r| matches!(r.resource_type.as_deref(), Some("qemu") | Some("lxc")))
        .map(|r| to_vm(&r))
        .collect();
    infer_single_proxmox_node(&mut vms, &nodes);

    Some(json!({
        "nodes": nodes,
        "vms": vms,
        "storage": [],
        "backups": [],
        "tasks": [],
        "services": [],
        "node_networks": [],
        "node_dns": [],
        "node_time": [],
        "node_hosts": [],
        "node_repositories": [],
        "storage_content": [],
        "ha_resources": [],
        "ha_groups": [],
        "ha_status": [],
        "permissions": {},
        "backup_jobs": [],
        "replication_jobs": [],
        "pools": [],
        "sdn": {},
        "logs": {},
        "firewall": {},
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
    Vec<ProxmoxNodeNetwork>,
    Vec<ProxmoxNodeDns>,
    Vec<ProxmoxNodeTime>,
    Vec<ProxmoxNodeHostConfig>,
    Vec<ProxmoxNodeRepository>,
    Vec<ProxmoxStorageContent>,
) {
    let mut storage = Vec::new();
    let mut backups = Vec::new();
    let mut tasks = Vec::new();
    let mut services = Vec::new();
    let mut node_networks = Vec::new();
    let mut node_dns = Vec::new();
    let mut node_time = Vec::new();
    let mut node_hosts = Vec::new();
    let mut node_repositories = Vec::new();
    let mut storage_content = Vec::new();
    for node in nodes {
        if node.name.is_empty() {
            continue;
        }
        let node_name = node.name.clone();
        let encoded_node = urlencoding::encode(&node_name);
        let storage_url = format!("{base_url}/api2/json/nodes/{encoded_node}/storage");
        let tasks_url = format!("{base_url}/api2/json/nodes/{encoded_node}/tasks?limit=20");
        let services_url = format!("{base_url}/api2/json/nodes/{encoded_node}/services");
        let network_url = format!("{base_url}/api2/json/nodes/{encoded_node}/network");
        let dns_url = format!("{base_url}/api2/json/nodes/{encoded_node}/dns");
        let time_url = format!("{base_url}/api2/json/nodes/{encoded_node}/time");
        let hosts_url = format!("{base_url}/api2/json/nodes/{encoded_node}/hosts");
        let repositories_url =
            format!("{base_url}/api2/json/nodes/{encoded_node}/apt/repositories");
        let (node_storage, node_tasks, node_services, networks, dns, time, hosts, repositories) = tokio::join!(
            fetch_proxmox_node_storage(client, &storage_url, auth_header, &node_name),
            fetch_proxmox_node_tasks(client, &tasks_url, auth_header, &node_name),
            fetch_proxmox_node_services(client, &services_url, auth_header, &node_name),
            fetch_proxmox_node_networks(client, &network_url, auth_header, &node_name),
            fetch_proxmox_node_dns(client, &dns_url, auth_header, &node_name),
            fetch_proxmox_node_time(client, &time_url, auth_header, &node_name),
            fetch_proxmox_node_hosts(client, &hosts_url, auth_header, &node_name),
            fetch_proxmox_node_repositories(client, &repositories_url, auth_header, &node_name)
        );
        storage.extend(node_storage.clone());
        node_networks.extend(networks);
        if let Some(dns) = dns {
            node_dns.push(dns);
        }
        if let Some(time) = time {
            node_time.push(time);
        }
        if let Some(hosts) = hosts {
            node_hosts.push(hosts);
        }
        node_repositories.extend(repositories);
        let active_stores = node_storage
            .iter()
            .filter(|item| item.enabled && item.active)
            .cloned()
            .collect::<Vec<_>>();
        storage_content.extend(
            fetch_proxmox_node_storage_content(
                client,
                base_url,
                auth_header,
                &node_name,
                &active_stores,
            )
            .await,
        );
        let backup_stores = active_stores
            .iter()
            .filter(|item| {
                item.content
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
    storage_content.sort_by(|left, right| {
        left.node
            .cmp(&right.node)
            .then_with(|| left.storage.cmp(&right.storage))
            .then_with(|| left.content.cmp(&right.content))
            .then_with(|| left.name.cmp(&right.name))
    });
    tasks.sort_by(|left, right| right.starttime.cmp(&left.starttime));
    tasks.truncate(40);
    (
        storage,
        backups,
        tasks,
        services,
        node_networks,
        node_dns,
        node_time,
        node_hosts,
        node_repositories,
        storage_content,
    )
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

async fn fetch_proxmox_node_storage_content(
    client: &Client,
    base_url: &str,
    auth_header: &str,
    node: &str,
    stores: &[ProxmoxStorage],
) -> Vec<ProxmoxStorageContent> {
    let mut content = Vec::new();
    for store in stores {
        let encoded_node = urlencoding::encode(node);
        let encoded_storage = urlencoding::encode(&store.name);
        let url =
            format!("{base_url}/api2/json/nodes/{encoded_node}/storage/{encoded_storage}/content");
        let res = match client
            .get(url)
            .header("Authorization", auth_header)
            .send()
            .await
        {
            Ok(res) if res.status().is_success() => res,
            _ => continue,
        };
        if let Ok(data) = res
            .json::<ProxmoxResponse<Vec<ProxmoxStorageContentRaw>>>()
            .await
        {
            content.extend(
                data.data
                    .unwrap_or_default()
                    .into_iter()
                    .filter_map(|raw| to_proxmox_storage_content(node, &store.name, raw)),
            );
        }
    }
    content
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

async fn fetch_proxmox_node_networks(
    client: &Client,
    url: &str,
    auth_header: &str,
    node: &str,
) -> Vec<ProxmoxNodeNetwork> {
    let res = match client
        .get(url)
        .header("Authorization", auth_header)
        .send()
        .await
    {
        Ok(res) if res.status().is_success() => res,
        _ => return Vec::new(),
    };
    match res.json::<ProxmoxResponse<Vec<Value>>>().await {
        Ok(data) => data
            .data
            .unwrap_or_default()
            .into_iter()
            .filter_map(|raw| to_proxmox_node_network(node, &raw))
            .collect(),
        Err(_) => Vec::new(),
    }
}

async fn fetch_proxmox_node_dns(
    client: &Client,
    url: &str,
    auth_header: &str,
    node: &str,
) -> Option<ProxmoxNodeDns> {
    let res = client
        .get(url)
        .header("Authorization", auth_header)
        .send()
        .await
        .ok()?;
    if !res.status().is_success() {
        return None;
    }
    let body = res.json::<ProxmoxResponse<Value>>().await.ok()?.data?;
    Some(ProxmoxNodeDns {
        node: node.to_string(),
        search: value_string(&body, &["search"]).unwrap_or_default(),
        dns1: value_string(&body, &["dns1"]).unwrap_or_default(),
        dns2: value_string(&body, &["dns2"]).unwrap_or_default(),
        dns3: value_string(&body, &["dns3"]).unwrap_or_default(),
    })
}

async fn fetch_proxmox_node_time(
    client: &Client,
    url: &str,
    auth_header: &str,
    node: &str,
) -> Option<ProxmoxNodeTime> {
    let res = client
        .get(url)
        .header("Authorization", auth_header)
        .send()
        .await
        .ok()?;
    if !res.status().is_success() {
        return None;
    }
    let body = res.json::<ProxmoxResponse<Value>>().await.ok()?.data?;
    Some(ProxmoxNodeTime {
        node: node.to_string(),
        timezone: value_string(&body, &["timezone"]).unwrap_or_default(),
        localtime: body
            .get("localtime")
            .and_then(value_as_u64)
            .unwrap_or_default(),
        time: body.get("time").and_then(value_as_u64).unwrap_or_default(),
    })
}

async fn fetch_proxmox_node_hosts(
    client: &Client,
    url: &str,
    auth_header: &str,
    node: &str,
) -> Option<ProxmoxNodeHostConfig> {
    let res = client
        .get(url)
        .header("Authorization", auth_header)
        .send()
        .await
        .ok()?;
    if !res.status().is_success() {
        return None;
    }
    let body = res.json::<ProxmoxResponse<Value>>().await.ok()?.data?;
    let content = match &body {
        Value::String(value) => value.clone(),
        Value::Object(_) => value_string(&body, &["data", "content", "digest"]).unwrap_or_default(),
        _ => String::new(),
    };
    Some(ProxmoxNodeHostConfig {
        node: node.to_string(),
        content,
    })
}

async fn fetch_proxmox_node_repositories(
    client: &Client,
    url: &str,
    auth_header: &str,
    node: &str,
) -> Vec<ProxmoxNodeRepository> {
    let res = match client
        .get(url)
        .header("Authorization", auth_header)
        .send()
        .await
    {
        Ok(res) if res.status().is_success() => res,
        _ => return Vec::new(),
    };
    let body = match res.json::<ProxmoxResponse<Value>>().await {
        Ok(data) => data.data.unwrap_or(Value::Null),
        Err(_) => return Vec::new(),
    };
    proxmox_repository_rows(node, &body)
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

async fn fetch_proxmox_ha_groups(
    client: &Client,
    base_url: &str,
    auth_header: &str,
) -> Vec<ProxmoxHaGroup> {
    let res = match client
        .get(format!("{base_url}/api2/json/cluster/ha/groups"))
        .header("Authorization", auth_header)
        .send()
        .await
    {
        Ok(res) if res.status().is_success() => res,
        _ => return Vec::new(),
    };
    let mut groups = match res.json::<ProxmoxResponse<Vec<Value>>>().await {
        Ok(data) => data
            .data
            .unwrap_or_default()
            .iter()
            .filter_map(to_proxmox_ha_group)
            .collect::<Vec<_>>(),
        Err(_) => Vec::new(),
    };
    groups.sort_by(|left, right| left.group.cmp(&right.group));
    groups
}

async fn fetch_proxmox_ha_status(client: &Client, base_url: &str, auth_header: &str) -> Vec<Value> {
    let res = match client
        .get(format!("{base_url}/api2/json/cluster/ha/status/current"))
        .header("Authorization", auth_header)
        .send()
        .await
    {
        Ok(res) if res.status().is_success() => res,
        _ => return Vec::new(),
    };
    match res.json::<ProxmoxResponse<Vec<Value>>>().await {
        Ok(data) => data.data.unwrap_or_default(),
        Err(_) => Vec::new(),
    }
}

async fn fetch_proxmox_backup_jobs(
    client: &Client,
    base_url: &str,
    auth_header: &str,
) -> Vec<ProxmoxBackupJob> {
    let res = match client
        .get(format!("{base_url}/api2/json/cluster/backup"))
        .header("Authorization", auth_header)
        .send()
        .await
    {
        Ok(res) if res.status().is_success() => res,
        _ => return Vec::new(),
    };
    let mut jobs = match res.json::<ProxmoxResponse<Vec<Value>>>().await {
        Ok(data) => data
            .data
            .unwrap_or_default()
            .iter()
            .filter_map(to_proxmox_backup_job)
            .collect::<Vec<_>>(),
        Err(_) => Vec::new(),
    };
    jobs.sort_by(|left, right| left.id.cmp(&right.id));
    jobs
}

async fn fetch_proxmox_replication_jobs(
    client: &Client,
    base_url: &str,
    auth_header: &str,
) -> Vec<ProxmoxReplicationJob> {
    let res = match client
        .get(format!("{base_url}/api2/json/cluster/replication"))
        .header("Authorization", auth_header)
        .send()
        .await
    {
        Ok(res) if res.status().is_success() => res,
        _ => return Vec::new(),
    };
    let mut jobs = match res.json::<ProxmoxResponse<Vec<Value>>>().await {
        Ok(data) => data
            .data
            .unwrap_or_default()
            .iter()
            .filter_map(to_proxmox_replication_job)
            .collect::<Vec<_>>(),
        Err(_) => Vec::new(),
    };
    jobs.sort_by(|left, right| left.id.cmp(&right.id));
    jobs
}

async fn fetch_proxmox_pools(
    client: &Client,
    base_url: &str,
    auth_header: &str,
) -> Vec<ProxmoxPool> {
    let res = match client
        .get(format!("{base_url}/api2/json/pools"))
        .header("Authorization", auth_header)
        .send()
        .await
    {
        Ok(res) if res.status().is_success() => res,
        _ => return Vec::new(),
    };
    let rows = match res.json::<ProxmoxResponse<Vec<Value>>>().await {
        Ok(data) => data.data.unwrap_or_default(),
        Err(_) => return Vec::new(),
    };
    let mut pools = Vec::new();
    for row in rows {
        if let Some(mut pool) = to_proxmox_pool(&row) {
            let encoded_pool = urlencoding::encode(&pool.poolid);
            if let Some(detail) = fetch_proxmox_pool_detail(
                client,
                base_url,
                auth_header,
                &format!("/pools/{encoded_pool}"),
            )
            .await
            {
                if let Some(comment) = value_string(&detail, &["comment"]) {
                    pool.comment = comment;
                }
                if let Some(members) = detail.get("members").and_then(Value::as_array) {
                    pool.members = members.clone();
                    pool.member_count = pool.members.len();
                }
            }
            pools.push(pool);
        }
    }
    pools.sort_by(|left, right| left.poolid.cmp(&right.poolid));
    pools
}

async fn fetch_proxmox_pool_detail(
    client: &Client,
    base_url: &str,
    auth_header: &str,
    path: &str,
) -> Option<Value> {
    let res = client
        .get(format!("{base_url}/api2/json{path}"))
        .header("Authorization", auth_header)
        .send()
        .await
        .ok()?;
    if !res.status().is_success() {
        return None;
    }
    res.json::<ProxmoxResponse<Value>>().await.ok()?.data
}

async fn fetch_proxmox_sdn_inventory(
    client: &Client,
    base_url: &str,
    auth_header: &str,
) -> ProxmoxSdnInventory {
    let (status, controllers, zones, vnets_raw, ipams, dns, dhcp, global_subnets) = tokio::join!(
        fetch_proxmox_sdn_values(client, base_url, auth_header, "/cluster/sdn/status"),
        fetch_proxmox_sdn_values(client, base_url, auth_header, "/cluster/sdn/controllers"),
        fetch_proxmox_sdn_values(client, base_url, auth_header, "/cluster/sdn/zones"),
        fetch_proxmox_sdn_values(client, base_url, auth_header, "/cluster/sdn/vnets"),
        fetch_proxmox_sdn_values(client, base_url, auth_header, "/cluster/sdn/ipams"),
        fetch_proxmox_sdn_values(client, base_url, auth_header, "/cluster/sdn/dns"),
        fetch_proxmox_sdn_values(client, base_url, auth_header, "/cluster/sdn/dhcp"),
        fetch_proxmox_sdn_values(client, base_url, auth_header, "/cluster/sdn/subnets")
    );

    let mut vnets = vnets_raw
        .iter()
        .filter_map(to_proxmox_sdn_vnet)
        .collect::<Vec<_>>();
    let mut subnets = global_subnets
        .iter()
        .filter_map(|row| to_proxmox_sdn_subnet("", row))
        .collect::<Vec<_>>();

    for vnet in &vnets {
        if vnet.vnet.is_empty() {
            continue;
        }
        let encoded_vnet = urlencoding::encode(&vnet.vnet);
        let rows = fetch_proxmox_sdn_values(
            client,
            base_url,
            auth_header,
            &format!("/cluster/sdn/vnets/{encoded_vnet}/subnets"),
        )
        .await;
        subnets.extend(
            rows.iter()
                .filter_map(|row| to_proxmox_sdn_subnet(&vnet.vnet, row)),
        );
    }

    vnets.sort_by(|left, right| left.vnet.cmp(&right.vnet));
    subnets.sort_by(|left, right| {
        left.vnet
            .cmp(&right.vnet)
            .then_with(|| left.subnet.cmp(&right.subnet))
    });

    ProxmoxSdnInventory {
        status,
        controllers,
        zones,
        vnets,
        subnets,
        ipams,
        dns,
        dhcp,
    }
}

async fn fetch_proxmox_sdn_values(
    client: &Client,
    base_url: &str,
    auth_header: &str,
    path: &str,
) -> Vec<Value> {
    let res = match client
        .get(format!("{base_url}/api2/json{path}"))
        .header("Authorization", auth_header)
        .send()
        .await
    {
        Ok(res) if res.status().is_success() => res,
        _ => return Vec::new(),
    };
    match res.json::<ProxmoxResponse<Value>>().await {
        Ok(data) => match data.data {
            Some(Value::Array(rows)) => rows,
            Some(Value::Object(map)) => vec![Value::Object(map)],
            _ => Vec::new(),
        },
        Err(_) => Vec::new(),
    }
}

async fn fetch_proxmox_log_inventory(
    client: &Client,
    base_url: &str,
    auth_header: &str,
    nodes: &[ProxmoxNode],
) -> ProxmoxLogInventory {
    let cluster = fetch_proxmox_log_values(client, base_url, auth_header, "/cluster/log?max=200")
        .await
        .into_iter()
        .map(|row| annotate_proxmox_log_row(row, "cluster", "cluster"))
        .collect::<Vec<_>>();
    let mut node_syslog = Vec::new();
    let mut node_journal = Vec::new();
    for node in nodes {
        if node.name.is_empty() {
            continue;
        }
        let encoded_node = urlencoding::encode(&node.name);
        let syslog_rows = fetch_proxmox_log_values(
            client,
            base_url,
            auth_header,
            &format!("/nodes/{encoded_node}/syslog?limit=200"),
        )
        .await;
        node_syslog.extend(
            syslog_rows
                .into_iter()
                .map(|row| annotate_proxmox_log_row(row, &node.name, "syslog")),
        );

        let journal_rows = fetch_proxmox_log_values(
            client,
            base_url,
            auth_header,
            &format!("/nodes/{encoded_node}/journal?lastentries=200"),
        )
        .await;
        node_journal.extend(
            journal_rows
                .into_iter()
                .map(|row| annotate_proxmox_log_row(row, &node.name, "journal")),
        );
    }
    ProxmoxLogInventory {
        cluster,
        node_syslog,
        node_journal,
    }
}

async fn fetch_proxmox_log_values(
    client: &Client,
    base_url: &str,
    auth_header: &str,
    path: &str,
) -> Vec<Value> {
    let res = match client
        .get(format!("{base_url}/api2/json{path}"))
        .header("Authorization", auth_header)
        .send()
        .await
    {
        Ok(res) if res.status().is_success() => res,
        _ => return Vec::new(),
    };
    match res.json::<ProxmoxResponse<Value>>().await {
        Ok(data) => match data.data {
            Some(Value::Array(rows)) => rows,
            Some(Value::String(text)) => text
                .lines()
                .enumerate()
                .map(|(index, line)| json!({ "n": index, "msg": line }))
                .collect(),
            Some(Value::Object(map)) => vec![Value::Object(map)],
            _ => Vec::new(),
        },
        Err(_) => Vec::new(),
    }
}

fn annotate_proxmox_log_row(row: Value, node: &str, source: &str) -> Value {
    match row {
        Value::Object(mut map) => {
            map.entry("node")
                .or_insert_with(|| Value::String(node.to_string()));
            map.entry("source")
                .or_insert_with(|| Value::String(source.to_string()));
            Value::Object(map)
        }
        other => json!({ "node": node, "source": source, "msg": other }),
    }
}

async fn fetch_proxmox_firewall_inventory(
    client: &Client,
    base_url: &str,
    auth_header: &str,
) -> ProxmoxFirewallInventory {
    let (options, rules, aliases_raw, ipsets_raw, groups_raw) = tokio::join!(
        fetch_proxmox_firewall_value(client, base_url, auth_header, "/cluster/firewall/options"),
        fetch_proxmox_firewall_values(client, base_url, auth_header, "/cluster/firewall/rules"),
        fetch_proxmox_firewall_values(client, base_url, auth_header, "/cluster/firewall/aliases"),
        fetch_proxmox_firewall_values(client, base_url, auth_header, "/cluster/firewall/ipset"),
        fetch_proxmox_firewall_values(client, base_url, auth_header, "/cluster/firewall/groups")
    );
    let mut aliases = aliases_raw
        .iter()
        .filter_map(to_proxmox_firewall_alias)
        .collect::<Vec<_>>();
    let mut ipsets = Vec::new();
    for raw in ipsets_raw {
        if let Some(mut ipset) = to_proxmox_firewall_ipset(&raw) {
            let encoded_name = urlencoding::encode(&ipset.name);
            ipset.entries = fetch_proxmox_firewall_values(
                client,
                base_url,
                auth_header,
                &format!("/cluster/firewall/ipset/{encoded_name}"),
            )
            .await;
            ipsets.push(ipset);
        }
    }
    let mut groups = Vec::new();
    for raw in groups_raw {
        if let Some(mut group) = to_proxmox_firewall_group(&raw) {
            let encoded_group = urlencoding::encode(&group.group);
            group.rules = fetch_proxmox_firewall_values(
                client,
                base_url,
                auth_header,
                &format!("/cluster/firewall/groups/{encoded_group}"),
            )
            .await;
            groups.push(group);
        }
    }
    aliases.sort_by(|left, right| left.name.cmp(&right.name));
    ipsets.sort_by(|left, right| left.name.cmp(&right.name));
    groups.sort_by(|left, right| left.group.cmp(&right.group));

    ProxmoxFirewallInventory {
        options: options.unwrap_or_else(|| json!({})),
        rules,
        aliases,
        ipsets,
        groups,
    }
}

async fn fetch_proxmox_firewall_value(
    client: &Client,
    base_url: &str,
    auth_header: &str,
    path: &str,
) -> Option<Value> {
    let res = client
        .get(format!("{base_url}/api2/json{path}"))
        .header("Authorization", auth_header)
        .send()
        .await
        .ok()?;
    if !res.status().is_success() {
        return None;
    }
    res.json::<ProxmoxResponse<Value>>().await.ok()?.data
}

async fn fetch_proxmox_firewall_values(
    client: &Client,
    base_url: &str,
    auth_header: &str,
    path: &str,
) -> Vec<Value> {
    let res = match client
        .get(format!("{base_url}/api2/json{path}"))
        .header("Authorization", auth_header)
        .send()
        .await
    {
        Ok(res) if res.status().is_success() => res,
        _ => return Vec::new(),
    };
    match res.json::<ProxmoxResponse<Vec<Value>>>().await {
        Ok(data) => data.data.unwrap_or_default(),
        Err(_) => Vec::new(),
    }
}

async fn fetch_proxmox_access_inventory(
    client: &Client,
    base_url: &str,
    auth_header: &str,
) -> ProxmoxAccessInventory {
    let (users_raw, groups_raw, roles_raw, acl_raw, realms_raw) = tokio::join!(
        fetch_proxmox_access_values(client, base_url, auth_header, "/access/users"),
        fetch_proxmox_access_values(client, base_url, auth_header, "/access/groups"),
        fetch_proxmox_access_values(client, base_url, auth_header, "/access/roles"),
        fetch_proxmox_access_values(client, base_url, auth_header, "/access/acl"),
        fetch_proxmox_access_values(client, base_url, auth_header, "/access/domains")
    );
    let mut users = users_raw
        .iter()
        .filter_map(to_proxmox_access_user)
        .collect::<Vec<_>>();
    let mut groups = groups_raw
        .iter()
        .filter_map(to_proxmox_access_group)
        .collect::<Vec<_>>();
    let mut roles = roles_raw
        .iter()
        .filter_map(to_proxmox_access_role)
        .collect::<Vec<_>>();
    let mut acl = acl_raw
        .iter()
        .filter_map(to_proxmox_access_acl)
        .collect::<Vec<_>>();
    let mut realms = realms_raw
        .iter()
        .filter_map(to_proxmox_access_realm)
        .collect::<Vec<_>>();
    let mut tokens = fetch_proxmox_access_tokens(client, base_url, auth_header, &users).await;

    users.sort_by(|left, right| left.userid.cmp(&right.userid));
    groups.sort_by(|left, right| left.groupid.cmp(&right.groupid));
    roles.sort_by(|left, right| left.roleid.cmp(&right.roleid));
    acl.sort_by(|left, right| {
        left.path
            .cmp(&right.path)
            .then_with(|| left.ugid.cmp(&right.ugid))
            .then_with(|| left.roleid.cmp(&right.roleid))
    });
    realms.sort_by(|left, right| left.realm.cmp(&right.realm));
    tokens.sort_by(|left, right| {
        left.userid
            .cmp(&right.userid)
            .then_with(|| left.tokenid.cmp(&right.tokenid))
    });

    ProxmoxAccessInventory {
        users,
        groups,
        roles,
        acl,
        realms,
        tokens,
    }
}

async fn fetch_proxmox_access_values(
    client: &Client,
    base_url: &str,
    auth_header: &str,
    path: &str,
) -> Vec<Value> {
    let res = match client
        .get(format!("{base_url}/api2/json{path}"))
        .header("Authorization", auth_header)
        .send()
        .await
    {
        Ok(res) if res.status().is_success() => res,
        _ => return Vec::new(),
    };
    match res.json::<ProxmoxResponse<Vec<Value>>>().await {
        Ok(data) => data.data.unwrap_or_default(),
        Err(_) => Vec::new(),
    }
}

async fn fetch_proxmox_access_tokens(
    client: &Client,
    base_url: &str,
    auth_header: &str,
    users: &[ProxmoxAccessUser],
) -> Vec<ProxmoxAccessToken> {
    let mut tokens = Vec::new();
    for user in users {
        if user.userid.is_empty() {
            continue;
        }
        let encoded_user = urlencoding::encode(&user.userid);
        let path = format!("/access/users/{encoded_user}/token");
        let rows = fetch_proxmox_access_values(client, base_url, auth_header, &path).await;
        tokens.extend(
            rows.iter()
                .filter_map(|row| to_proxmox_access_token(&user.userid, row)),
        );
    }
    tokens
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

fn to_proxmox_storage_content(
    node: &str,
    storage: &str,
    raw: ProxmoxStorageContentRaw,
) -> Option<ProxmoxStorageContent> {
    let volid = raw.volid?;
    let name = proxmox_backup_name(&volid);
    let content = raw.content.unwrap_or_default();
    let subtype = raw
        .subtype
        .or_else(|| proxmox_backup_kind(&volid))
        .unwrap_or_else(|| content.clone());
    Some(ProxmoxStorageContent {
        node: node.to_string(),
        storage: storage.to_string(),
        vmid: raw.vmid.or_else(|| proxmox_backup_vmid(&volid)),
        format: raw.format.unwrap_or_default(),
        content,
        subtype,
        size: raw.size.unwrap_or(0),
        ctime: raw.ctime.unwrap_or(0),
        notes: raw.notes.unwrap_or_default(),
        protected: proxmox_flag(raw.protected.as_ref()),
        name,
        volid,
    })
}

fn to_proxmox_backup_job(raw: &Value) -> Option<ProxmoxBackupJob> {
    let id = value_string(raw, &["id", "jobid"])?;
    let enabled = raw
        .get("enabled")
        .or_else(|| raw.get("enable"))
        .map(|value| value_truthy(Some(value)))
        .unwrap_or(true);
    Some(ProxmoxBackupJob {
        id,
        enabled,
        schedule: value_string(raw, &["schedule"]).unwrap_or_default(),
        storage: value_string(raw, &["storage"]).unwrap_or_default(),
        node: value_string(raw, &["node"]).unwrap_or_default(),
        vmids: value_list_string(raw, &["vmid", "vmids"]).unwrap_or_default(),
        exclude: value_list_string(raw, &["exclude"]).unwrap_or_default(),
        all: value_truthy(raw.get("all")),
        mode: value_string(raw, &["mode"]).unwrap_or_default(),
        compress: value_string(raw, &["compress"]).unwrap_or_default(),
        mailto: value_list_string(raw, &["mailto"]).unwrap_or_default(),
        mailnotification: value_string(raw, &["mailnotification"]).unwrap_or_default(),
        notification_mode: value_string(raw, &["notification-mode", "notification_mode"])
            .unwrap_or_default(),
        prune_backups: value_string(raw, &["prune-backups", "prune_backups"]).unwrap_or_default(),
        notes_template: value_string(raw, &["notes-template", "notes_template"])
            .unwrap_or_default(),
        comment: value_string(raw, &["comment"]).unwrap_or_default(),
    })
}

fn to_proxmox_replication_job(raw: &Value) -> Option<ProxmoxReplicationJob> {
    let id = value_string(raw, &["id"])?;
    let disabled = raw
        .get("disable")
        .or_else(|| raw.get("disabled"))
        .map(|value| value_truthy(Some(value)))
        .unwrap_or(false);
    Some(ProxmoxReplicationJob {
        id,
        guest: value_string(raw, &["guest", "vmid"]).unwrap_or_default(),
        target: value_string(raw, &["target"]).unwrap_or_default(),
        source: value_string(raw, &["source"]).unwrap_or_default(),
        schedule: value_string(raw, &["schedule"]).unwrap_or_default(),
        rate: value_string(raw, &["rate"]).unwrap_or_default(),
        enabled: !disabled,
        job_type: value_string(raw, &["type"]).unwrap_or_default(),
        comment: value_string(raw, &["comment"]).unwrap_or_default(),
        next_sync: raw
            .get("next_sync")
            .or_else(|| raw.get("next-sync"))
            .and_then(value_as_u64)
            .unwrap_or_default(),
        last_sync: raw
            .get("last_sync")
            .or_else(|| raw.get("last-sync"))
            .and_then(value_as_u64)
            .unwrap_or_default(),
        last_try: raw
            .get("last_try")
            .or_else(|| raw.get("last-try"))
            .and_then(value_as_u64)
            .unwrap_or_default(),
        duration: raw
            .get("duration")
            .and_then(value_as_u64)
            .unwrap_or_default(),
        fail_count: raw
            .get("fail_count")
            .or_else(|| raw.get("fail-count"))
            .and_then(value_as_u64)
            .unwrap_or_default(),
        error: value_string(raw, &["error"]).unwrap_or_default(),
    })
}

fn to_proxmox_pool(raw: &Value) -> Option<ProxmoxPool> {
    let poolid = value_string(raw, &["poolid", "id"])?;
    let members = raw
        .get("members")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    Some(ProxmoxPool {
        poolid,
        comment: value_string(raw, &["comment"]).unwrap_or_default(),
        member_count: members.len(),
        members,
    })
}

fn to_proxmox_sdn_vnet(raw: &Value) -> Option<ProxmoxSdnVnet> {
    let vnet = value_string(raw, &["vnet", "vnetid", "id"])?;
    Some(ProxmoxSdnVnet {
        vnet,
        zone: value_string(raw, &["zone"]).unwrap_or_default(),
        alias: value_string(raw, &["alias"]).unwrap_or_default(),
        tag: value_string(raw, &["tag", "vlan"]).unwrap_or_default(),
        vlanaware: value_truthy(raw.get("vlanaware")),
        mtu: value_string(raw, &["mtu"]).unwrap_or_default(),
        pending: raw.get("pending").cloned().unwrap_or_else(|| json!({})),
        raw: raw.clone(),
    })
}

fn to_proxmox_sdn_subnet(vnet: &str, raw: &Value) -> Option<ProxmoxSdnSubnet> {
    let subnet = value_string(raw, &["subnet", "cidr", "id"])?;
    Some(ProxmoxSdnSubnet {
        vnet: value_string(raw, &["vnet", "vnetid"]).unwrap_or_else(|| vnet.to_string()),
        subnet,
        gateway: value_string(raw, &["gateway"]).unwrap_or_default(),
        snat: value_truthy(raw.get("snat")),
        dhcp_range: value_string(raw, &["dhcp-range", "dhcp_range"]).unwrap_or_default(),
        dnszoneprefix: value_string(raw, &["dnszoneprefix", "dns-zone-prefix"]).unwrap_or_default(),
        raw: raw.clone(),
    })
}

fn to_proxmox_firewall_alias(raw: &Value) -> Option<ProxmoxFirewallAlias> {
    let name = value_string(raw, &["name"])?;
    Some(ProxmoxFirewallAlias {
        name,
        cidr: value_string(raw, &["cidr"]).unwrap_or_default(),
        comment: value_string(raw, &["comment"]).unwrap_or_default(),
    })
}

fn to_proxmox_firewall_ipset(raw: &Value) -> Option<ProxmoxFirewallIpset> {
    let name = value_string(raw, &["name"])?;
    Some(ProxmoxFirewallIpset {
        name,
        comment: value_string(raw, &["comment"]).unwrap_or_default(),
        entries: Vec::new(),
    })
}

fn to_proxmox_firewall_group(raw: &Value) -> Option<ProxmoxFirewallGroup> {
    let group = value_string(raw, &["group"])?;
    Some(ProxmoxFirewallGroup {
        group,
        comment: value_string(raw, &["comment"]).unwrap_or_default(),
        rules: Vec::new(),
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

fn to_proxmox_node_network(node: &str, raw: &Value) -> Option<ProxmoxNodeNetwork> {
    let iface = value_string(raw, &["iface", "name"])?;
    Some(ProxmoxNodeNetwork {
        node: node.to_string(),
        iface,
        network_type: value_string(raw, &["type"]).unwrap_or_default(),
        method: value_string(raw, &["method"]).unwrap_or_default(),
        method6: value_string(raw, &["method6"]).unwrap_or_default(),
        cidr: value_string(raw, &["cidr"]).unwrap_or_default(),
        address: value_string(raw, &["address"]).unwrap_or_default(),
        netmask: value_string(raw, &["netmask"]).unwrap_or_default(),
        gateway: value_string(raw, &["gateway"]).unwrap_or_default(),
        bridge_ports: value_string(raw, &["bridge_ports", "bridge-ports"]).unwrap_or_default(),
        active: value_truthy(raw.get("active")),
        autostart: value_truthy(raw.get("autostart")),
        comments: value_string(raw, &["comments", "comment"]).unwrap_or_default(),
    })
}

fn proxmox_repository_rows(node: &str, body: &Value) -> Vec<ProxmoxNodeRepository> {
    let mut rows = Vec::new();
    if let Some(files) = body.get("files").and_then(Value::as_array) {
        for file in files {
            let path = value_string(file, &["path"]).unwrap_or_default();
            if let Some(repos) = file.get("repos").and_then(Value::as_array) {
                for repo in repos {
                    rows.push(proxmox_repository_row(node, &path, repo));
                }
            }
        }
    }
    rows
}

fn proxmox_repository_row(node: &str, path: &str, repo: &Value) -> ProxmoxNodeRepository {
    let file_type = proxmox_repository_field(repo, &["FileType", "filetype", "file_type", "type"]);
    let suite = proxmox_repository_field(repo, &["Suites", "suites", "Suite", "suite"]);
    let component = proxmox_repository_field(
        repo,
        &["Components", "components", "Component", "component"],
    );
    let uri = proxmox_repository_field(repo, &["URIs", "uris", "URI", "uri"]);
    let comment = proxmox_repository_field(repo, &["Comment", "comment"]);
    let enabled = repo
        .get("Enabled")
        .or_else(|| repo.get("enabled"))
        .map(|value| value_truthy(Some(value)))
        .unwrap_or(true);
    let status = if enabled { "enabled" } else { "disabled" }.to_string();
    ProxmoxNodeRepository {
        node: node.to_string(),
        path: path.to_string(),
        file_type,
        enabled,
        status,
        suite,
        component,
        comment,
        uri,
    }
}

fn proxmox_repository_field(repo: &Value, keys: &[&str]) -> String {
    for key in keys {
        if let Some(value) = repo.get(*key) {
            return match value {
                Value::Array(items) => items
                    .iter()
                    .filter_map(|item| match item {
                        Value::String(text) => Some(text.trim().to_string()),
                        Value::Number(number) => Some(number.to_string()),
                        _ => None,
                    })
                    .filter(|item| !item.is_empty())
                    .collect::<Vec<_>>()
                    .join(","),
                _ => value_string(repo, &[*key]).unwrap_or_default(),
            };
        }
    }
    String::new()
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

fn to_proxmox_ha_group(raw: &Value) -> Option<ProxmoxHaGroup> {
    let group = value_string(raw, &["group"])?;
    Some(ProxmoxHaGroup {
        group,
        nodes: value_list_string(raw, &["nodes"]).unwrap_or_default(),
        nofailback: value_truthy(raw.get("nofailback")),
        restricted: value_truthy(raw.get("restricted")),
        comment: value_string(raw, &["comment"]).unwrap_or_default(),
    })
}

fn to_proxmox_access_user(raw: &Value) -> Option<ProxmoxAccessUser> {
    let userid = value_string(raw, &["userid", "user"])?;
    let enabled = raw
        .get("enable")
        .or_else(|| raw.get("enabled"))
        .map(|value| value_truthy(Some(value)))
        .unwrap_or(true);
    Some(ProxmoxAccessUser {
        userid,
        enabled,
        expire: raw.get("expire").and_then(value_as_u64).unwrap_or_default(),
        firstname: value_string(raw, &["firstname", "first-name"]).unwrap_or_default(),
        lastname: value_string(raw, &["lastname", "last-name"]).unwrap_or_default(),
        email: value_string(raw, &["email"]).unwrap_or_default(),
        comment: value_string(raw, &["comment"]).unwrap_or_default(),
        groups: value_list_string(raw, &["groups"]).unwrap_or_default(),
    })
}

fn to_proxmox_access_group(raw: &Value) -> Option<ProxmoxAccessGroup> {
    let groupid = value_string(raw, &["groupid", "group"])?;
    Some(ProxmoxAccessGroup {
        groupid,
        comment: value_string(raw, &["comment"]).unwrap_or_default(),
        users: value_list_string(raw, &["users"]).unwrap_or_default(),
    })
}

fn to_proxmox_access_role(raw: &Value) -> Option<ProxmoxAccessRole> {
    let roleid = value_string(raw, &["roleid", "role"])?;
    Some(ProxmoxAccessRole {
        roleid,
        privs: value_list_string(raw, &["privs", "privileges"]).unwrap_or_default(),
        special: value_truthy(raw.get("special")),
    })
}

fn to_proxmox_access_acl(raw: &Value) -> Option<ProxmoxAccessAcl> {
    let path = value_string(raw, &["path"])?;
    let ugid = value_string(raw, &["ugid", "userid", "groupid", "tokenid"])?;
    Some(ProxmoxAccessAcl {
        path,
        ugid,
        roleid: value_string(raw, &["roleid", "role"]).unwrap_or_default(),
        propagate: raw
            .get("propagate")
            .map(|value| value_truthy(Some(value)))
            .unwrap_or(true),
        acl_type: value_string(raw, &["type"]).unwrap_or_default(),
    })
}

fn to_proxmox_access_realm(raw: &Value) -> Option<ProxmoxAccessRealm> {
    let realm = value_string(raw, &["realm"])?;
    Some(ProxmoxAccessRealm {
        realm,
        realm_type: value_string(raw, &["type"]).unwrap_or_default(),
        comment: value_string(raw, &["comment"]).unwrap_or_default(),
        default_realm: value_truthy(raw.get("default")),
        tfa: value_string(raw, &["tfa"]).unwrap_or_default(),
    })
}

fn to_proxmox_access_token(userid: &str, raw: &Value) -> Option<ProxmoxAccessToken> {
    let tokenid = value_string(raw, &["tokenid", "token"])?;
    Some(ProxmoxAccessToken {
        userid: userid.to_string(),
        tokenid,
        comment: value_string(raw, &["comment"]).unwrap_or_default(),
        expire: raw.get("expire").and_then(value_as_u64).unwrap_or_default(),
        privsep: raw
            .get("privsep")
            .map(|value| value_truthy(Some(value)))
            .unwrap_or(true),
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

fn infer_single_proxmox_node(vms: &mut [ProxmoxVM], nodes: &[ProxmoxNode]) {
    let mut node_names = nodes
        .iter()
        .map(|node| node.name.trim())
        .filter(|name| !name.is_empty());
    let Some(single_node) = node_names.next() else {
        return;
    };
    if node_names.next().is_some() {
        return;
    }
    for vm in vms.iter_mut().filter(|vm| vm.node.trim().is_empty()) {
        vm.node = single_node.to_string();
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

fn value_string(value: &Value, keys: &[&str]) -> Option<String> {
    keys.iter()
        .find_map(|key| value.get(*key))
        .and_then(|value| match value {
            Value::String(s) if !s.trim().is_empty() => Some(s.trim().to_string()),
            Value::Number(n) => Some(n.to_string()),
            Value::Bool(b) => Some(b.to_string()),
            _ => None,
        })
}

fn value_list_string(value: &Value, keys: &[&str]) -> Option<String> {
    keys.iter().find_map(|key| {
        let value = value.get(*key)?;
        match value {
            Value::Array(items) => {
                let text = items
                    .iter()
                    .filter_map(|item| match item {
                        Value::String(text) if !text.trim().is_empty() => {
                            Some(text.trim().to_string())
                        }
                        Value::Number(number) => Some(number.to_string()),
                        Value::Bool(flag) => Some(flag.to_string()),
                        _ => None,
                    })
                    .collect::<Vec<_>>()
                    .join(",");
                if text.is_empty() {
                    None
                } else {
                    Some(text)
                }
            }
            Value::String(text) if !text.trim().is_empty() => Some(text.trim().to_string()),
            Value::Number(number) => Some(number.to_string()),
            Value::Bool(flag) => Some(flag.to_string()),
            _ => None,
        }
    })
}

fn portainer_docker_info_payload(info: &Value) -> Value {
    let swarm = info.get("Swarm").unwrap_or(&Value::Null);
    json!({
        "name": value_string(info, &["Name", "name"]),
        "server_version": value_string(info, &["ServerVersion", "serverVersion", "server_version"]),
        "operating_system": value_string(info, &["OperatingSystem", "operatingSystem", "operating_system"]),
        "os_type": value_string(info, &["OSType", "osType", "os_type"]),
        "architecture": value_string(info, &["Architecture", "architecture"]),
        "cpus": value_u64(info, &["NCPU", "ncpu", "cpus"]),
        "memory_bytes": value_u64(info, &["MemTotal", "memTotal", "memory_bytes"]),
        "containers": value_u64(info, &["Containers", "containers"]),
        "containers_running": value_u64(info, &["ContainersRunning", "containersRunning", "containers_running"]),
        "containers_paused": value_u64(info, &["ContainersPaused", "containersPaused", "containers_paused"]),
        "containers_stopped": value_u64(info, &["ContainersStopped", "containersStopped", "containers_stopped"]),
        "images": value_u64(info, &["Images", "images"]),
        "docker_root_dir": value_string(info, &["DockerRootDir", "dockerRootDir", "docker_root_dir"]),
        "driver": value_string(info, &["Driver", "driver"]),
        "swarm_local_node_state": value_string(swarm, &["LocalNodeState", "localNodeState", "local_node_state"]),
        "swarm_control_available": value_bool(swarm, &["ControlAvailable", "controlAvailable", "control_available"]),
    })
}

fn docker_container_port_summary(row: &Value) -> String {
    let ports = row.get("Ports").and_then(Value::as_array);
    let Some(ports) = ports else {
        return row
            .get("Ports")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string();
    };

    let mut values = ports
        .iter()
        .filter_map(|port| {
            let private_port = value_u64(port, &["PrivatePort", "privatePort", "private_port"])?;
            let protocol = value_string(port, &["Type", "type"]).unwrap_or_else(|| "tcp".into());
            let private = format!("{private_port}/{protocol}");
            let public_port = value_u64(port, &["PublicPort", "publicPort", "public_port"]);
            let ip = value_string(port, &["IP", "ip"]);
            Some(match public_port {
                Some(public_port) => {
                    let ip = ip.unwrap_or_else(|| "0.0.0.0".into());
                    format!("{ip}:{public_port}->{private}")
                }
                None => private,
            })
        })
        .collect::<Vec<_>>();
    values.sort();
    values.dedup();
    values.join(", ")
}

fn docker_container_network_names(row: &Value) -> Vec<String> {
    let mut names = row
        .get("NetworkSettings")
        .and_then(|settings| settings.get("Networks"))
        .and_then(Value::as_object)
        .map(|networks| networks.keys().cloned().collect::<Vec<_>>())
        .unwrap_or_default();
    names.sort();
    names
}

fn docker_container_mount_count(row: &Value) -> Option<usize> {
    row.get("Mounts").and_then(Value::as_array).map(Vec::len)
}

fn docker_network_ipam_summary(row: &Value) -> String {
    row.get("IPAM")
        .and_then(|ipam| ipam.get("Config"))
        .and_then(Value::as_array)
        .map(|configs| {
            configs
                .iter()
                .filter_map(|config| {
                    let subnet = value_string(config, &["Subnet", "subnet"]);
                    let gateway = value_string(config, &["Gateway", "gateway"]);
                    match (subnet, gateway) {
                        (Some(subnet), Some(gateway)) => Some(format!("{subnet} via {gateway}")),
                        (Some(subnet), None) => Some(subnet),
                        (None, Some(gateway)) => Some(format!("gateway {gateway}")),
                        (None, None) => None,
                    }
                })
                .collect::<Vec<_>>()
                .join(", ")
        })
        .filter(|value| !value.is_empty())
        .unwrap_or_default()
}

fn docker_network_container_count(row: &Value) -> Option<usize> {
    row.get("Containers")
        .and_then(Value::as_object)
        .map(|containers| containers.len())
}

fn object_field_count(row: &Value, key: &str) -> usize {
    row.get(key)
        .and_then(Value::as_object)
        .map(|values| values.len())
        .unwrap_or(0)
}

fn metadata_name(row: &Value) -> String {
    row.get("metadata")
        .and_then(|metadata| metadata.get("name"))
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

fn metadata_namespace(row: &Value) -> String {
    row.get("metadata")
        .and_then(|metadata| metadata.get("namespace"))
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

fn metadata_created_at(row: &Value) -> String {
    row.get("metadata")
        .and_then(|metadata| metadata.get("creationTimestamp"))
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

fn metadata_uid(row: &Value) -> String {
    row.get("metadata")
        .and_then(|metadata| metadata.get("uid"))
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

fn kubernetes_items(value: Value) -> Vec<Value> {
    if let Some(items) = value.get("items").and_then(Value::as_array) {
        return items.clone();
    }
    value.as_array().cloned().unwrap_or_default()
}

async fn portainer_kubernetes_items(
    config: &PortainerInstanceConfig,
    endpoint_id: i64,
    api_path: &str,
) -> Vec<Value> {
    portainer_get(
        config,
        &format!("/endpoints/{endpoint_id}/kubernetes{api_path}"),
    )
    .await
    .map(kubernetes_items)
    .unwrap_or_default()
}

fn portainer_endpoint_platform(endpoint_type: Option<i64>) -> &'static str {
    match endpoint_type {
        Some(1 | 2 | 4) => "docker",
        Some(5 | 6 | 7) => "kubernetes",
        Some(3) => "aci",
        _ => "unknown",
    }
}

fn portainer_endpoint_connection(endpoint_type: Option<i64>) -> &'static str {
    match endpoint_type {
        Some(1) => "docker-api",
        Some(2) => "portainer-agent-docker",
        Some(3) => "azure-aci",
        Some(4) => "edge-agent-docker",
        Some(5) => "kubernetes-local",
        Some(6) => "portainer-agent-kubernetes",
        Some(7) => "edge-agent-kubernetes",
        _ => "unknown",
    }
}

fn portainer_capabilities_payload(instance: &Value) -> Value {
    let endpoints = instance
        .get("endpoints")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let platforms = endpoints
        .iter()
        .filter_map(|endpoint| endpoint.get("platform").and_then(Value::as_str))
        .collect::<HashSet<_>>();
    let version = instance
        .get("status")
        .and_then(|status| value_string(status, &["Version", "version"]))
        .or_else(|| {
            instance
                .get("system_status")
                .and_then(|status| value_string(status, &["Version", "version"]))
        });
    let edition = instance
        .get("status")
        .and_then(|status| value_string(status, &["Edition", "edition"]))
        .or_else(|| {
            instance
                .get("settings")
                .and_then(|settings| value_string(settings, &["Edition", "edition"]))
        })
        .unwrap_or_else(|| "unknown".to_string());
    json!({
        "version": version,
        "edition": edition,
        "docker": platforms.contains("docker"),
        "swarm": endpoints.iter().any(|endpoint| {
            endpoint
                .get("features")
                .and_then(Value::as_array)
                .map(|features| features.iter().any(|feature| feature.as_str() == Some("swarm")))
                .unwrap_or(false)
        }),
        "kubernetes": platforms.contains("kubernetes"),
        "aci": platforms.contains("aci"),
        "groups": instance.get("groups").and_then(Value::as_array).map(|rows| rows.len()).unwrap_or(0),
        "tags": instance.get("tags").and_then(Value::as_array).map(|rows| rows.len()).unwrap_or(0),
        "users": instance.get("users").and_then(Value::as_array).map(|rows| rows.len()).unwrap_or(0),
        "teams": instance.get("teams").and_then(Value::as_array).map(|rows| rows.len()).unwrap_or(0),
        "app_templates": instance.get("app_templates").and_then(Value::as_array).map(|rows| rows.len()).unwrap_or(0),
        "custom_templates": instance.get("custom_templates").and_then(Value::as_array).map(|rows| rows.len()).unwrap_or(0),
        "swarm_services": instance.get("swarm_services").and_then(Value::as_array).map(|rows| rows.len()).unwrap_or(0),
        "swarm_nodes": instance.get("swarm_nodes").and_then(Value::as_array).map(|rows| rows.len()).unwrap_or(0),
        "swarm_tasks": instance.get("swarm_tasks").and_then(Value::as_array).map(|rows| rows.len()).unwrap_or(0),
        "kubernetes_namespaces": instance.get("kubernetes_namespaces").and_then(Value::as_array).map(|rows| rows.len()).unwrap_or(0),
        "kubernetes_applications": instance.get("kubernetes_applications").and_then(Value::as_array).map(|rows| rows.len()).unwrap_or(0),
        "kubernetes_pods": instance.get("kubernetes_pods").and_then(Value::as_array).map(|rows| rows.len()).unwrap_or(0),
        "kubernetes_services": instance.get("kubernetes_services").and_then(Value::as_array).map(|rows| rows.len()).unwrap_or(0),
        "kubernetes_ingresses": instance.get("kubernetes_ingresses").and_then(Value::as_array).map(|rows| rows.len()).unwrap_or(0),
        "kubernetes_configmaps": instance.get("kubernetes_configmaps").and_then(Value::as_array).map(|rows| rows.len()).unwrap_or(0),
        "kubernetes_secrets": instance.get("kubernetes_secrets").and_then(Value::as_array).map(|rows| rows.len()).unwrap_or(0),
        "kubernetes_volumes": instance.get("kubernetes_volumes").and_then(Value::as_array).map(|rows| rows.len()).unwrap_or(0),
        "kubernetes_crds": instance.get("kubernetes_crds").and_then(Value::as_array).map(|rows| rows.len()).unwrap_or(0),
        "kubernetes_helm_releases": instance.get("kubernetes_helm_releases").and_then(Value::as_array).map(|rows| rows.len()).unwrap_or(0),
        "aci_subscriptions": instance.get("aci_subscriptions").and_then(Value::as_array).map(|rows| rows.len()).unwrap_or(0),
        "aci_resource_groups": instance.get("aci_resource_groups").and_then(Value::as_array).map(|rows| rows.len()).unwrap_or(0),
        "aci_container_groups": instance.get("aci_container_groups").and_then(Value::as_array).map(|rows| rows.len()).unwrap_or(0),
        "settings": instance.get("settings").is_some(),
        "system_status": instance.get("system_status").is_some(),
    })
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
                let status = portainer_get(&config, "/status").await.ok();
                let system_status = portainer_get(&config, "/system/status").await.ok();
                let settings = portainer_get(&config, "/settings").await.ok();
                let groups = portainer_get(&config, "/endpoint_groups")
                    .await
                    .ok()
                    .and_then(|value| value.as_array().cloned())
                    .unwrap_or_default()
                    .into_iter()
                    .map(|row| {
                        json!({
                            "id": row.get("Id").or_else(|| row.get("id")).cloned().unwrap_or(Value::Null),
                            "name": row.get("Name").or_else(|| row.get("name")).cloned().unwrap_or(Value::Null),
                            "instance_id": config.id.clone(),
                        })
                    })
                    .collect::<Vec<_>>();
                let tags = portainer_get(&config, "/tags")
                    .await
                    .ok()
                    .and_then(|value| value.as_array().cloned())
                    .unwrap_or_default()
                    .into_iter()
                    .map(|row| {
                        json!({
                            "id": row.get("Id").or_else(|| row.get("id")).cloned().unwrap_or(Value::Null),
                            "name": row.get("Name").or_else(|| row.get("name")).cloned().unwrap_or(Value::Null),
                            "instance_id": config.id.clone(),
                        })
                    })
                    .collect::<Vec<_>>();
                let users = portainer_get(&config, "/users")
                    .await
                    .ok()
                    .and_then(|value| value.as_array().cloned())
                    .unwrap_or_default()
                    .into_iter()
                    .filter_map(|row| {
                        let id = row.get("Id").or_else(|| row.get("id")).cloned().unwrap_or(Value::Null);
                        let username = row
                            .get("Username")
                            .or_else(|| row.get("username"))
                            .and_then(Value::as_str)
                            .unwrap_or_default()
                            .trim()
                            .to_string();
                        if username.is_empty() {
                            return None;
                        }
                        Some(json!({
                            "id": id,
                            "username": username,
                            "role": row.get("Role").or_else(|| row.get("role")).cloned().unwrap_or(Value::Null),
                            "teams": row.get("TeamIds").or_else(|| row.get("teamIds")).or_else(|| row.get("teams")).cloned().unwrap_or_else(|| json!([])),
                            "instance_id": config.id.clone(),
                        }))
                    })
                    .collect::<Vec<_>>();
                let teams = portainer_get(&config, "/teams")
                    .await
                    .ok()
                    .and_then(|value| value.as_array().cloned())
                    .unwrap_or_default()
                    .into_iter()
                    .filter_map(|row| {
                        let id = row
                            .get("Id")
                            .or_else(|| row.get("id"))
                            .cloned()
                            .unwrap_or(Value::Null);
                        let name = row
                            .get("Name")
                            .or_else(|| row.get("name"))
                            .and_then(Value::as_str)
                            .unwrap_or_default()
                            .trim()
                            .to_string();
                        if name.is_empty() {
                            return None;
                        }
                        Some(json!({
                            "id": id,
                            "name": name,
                            "instance_id": config.id.clone(),
                        }))
                    })
                    .collect::<Vec<_>>();
                let custom_templates = portainer_get(&config, "/custom_templates")
                    .await
                    .ok()
                    .and_then(|value| value.as_array().cloned())
                    .unwrap_or_default()
                    .into_iter()
                    .filter_map(|row| {
                        let id = row.get("Id").or_else(|| row.get("id")).cloned().unwrap_or(Value::Null);
                        let title = row
                            .get("Title")
                            .or_else(|| row.get("title"))
                            .or_else(|| row.get("Name"))
                            .or_else(|| row.get("name"))
                            .and_then(Value::as_str)
                            .unwrap_or_default()
                            .trim()
                            .to_string();
                        if title.is_empty() {
                            return None;
                        }
                        Some(json!({
                            "id": id,
                            "title": title,
                            "description": row.get("Description").or_else(|| row.get("description")).and_then(Value::as_str).unwrap_or_default(),
                            "type": row.get("Type").or_else(|| row.get("type")).cloned().unwrap_or(Value::Null),
                            "platform": row.get("Platform").or_else(|| row.get("platform")).cloned().unwrap_or(Value::Null),
                            "instance_id": config.id.clone(),
                        }))
                    })
                    .collect::<Vec<_>>();
                let app_templates = portainer_get(&config, "/templates")
                    .await
                    .ok()
                    .and_then(|value| {
                        value
                            .get("templates")
                            .and_then(Value::as_array)
                            .cloned()
                            .or_else(|| value.as_array().cloned())
                    })
                    .unwrap_or_default()
                    .into_iter()
                    .filter_map(|row| {
                        let id = row.get("id").or_else(|| row.get("Id")).cloned().unwrap_or(Value::Null);
                        let title = row
                            .get("title")
                            .or_else(|| row.get("Title"))
                            .or_else(|| row.get("name"))
                            .or_else(|| row.get("Name"))
                            .and_then(Value::as_str)
                            .unwrap_or_default()
                            .trim()
                            .to_string();
                        if title.is_empty() {
                            return None;
                        }
                        Some(json!({
                            "id": id,
                            "title": title,
                            "description": row.get("description").or_else(|| row.get("Description")).and_then(Value::as_str).unwrap_or_default(),
                            "type": row.get("type").or_else(|| row.get("Type")).cloned().unwrap_or(Value::Null),
                            "platform": row.get("platform").or_else(|| row.get("Platform")).cloned().unwrap_or(Value::Null),
                            "categories": row.get("categories").or_else(|| row.get("Categories")).cloned().unwrap_or_else(|| json!([])),
                            "image": row.get("image").or_else(|| row.get("Image")).cloned().unwrap_or(Value::Null),
                            "repository": row.get("repository").or_else(|| row.get("Repository")).cloned().unwrap_or(Value::Null),
                            "instance_id": config.id.clone(),
                        }))
                    })
                    .collect::<Vec<_>>();
                let endpoints: Vec<PortainerEndpoint> =
                    serde_json::from_value(endpoints_value.clone()).unwrap_or_default();
                let mut endpoint_values = Vec::new();
                let mut containers = Vec::new();
                let mut images = Vec::new();
                let mut volumes = Vec::new();
                let mut networks = Vec::new();
                let mut secrets = Vec::new();
                let mut configs = Vec::new();
                let mut swarm_services = Vec::new();
                let mut swarm_nodes = Vec::new();
                let mut swarm_tasks = Vec::new();
                let mut kubernetes_namespaces = Vec::new();
                let mut kubernetes_applications = Vec::new();
                let mut kubernetes_pods = Vec::new();
                let mut kubernetes_services = Vec::new();
                let mut kubernetes_ingresses = Vec::new();
                let mut kubernetes_configmaps = Vec::new();
                let mut kubernetes_secrets = Vec::new();
                let mut kubernetes_volumes = Vec::new();
                let mut kubernetes_crds = Vec::new();
                let mut kubernetes_helm_releases = Vec::new();
                let mut aci_subscriptions = Vec::new();
                let mut aci_resource_groups = Vec::new();
                let mut aci_container_groups = Vec::new();
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
                    let platform = portainer_endpoint_platform(endpoint.endpoint_type);
                    if platform == "kubernetes" {
                        let mut features = vec!["kubernetes"];
                        let application_count_before = kubernetes_applications.len();
                        let namespace_rows =
                            portainer_kubernetes_items(&config, endpoint.id, "/api/v1/namespaces")
                                .await;
                        for row in namespace_rows {
                            let name = metadata_name(&row);
                            if name.is_empty() {
                                continue;
                            }
                            kubernetes_namespaces.push(json!({
                                "id": metadata_uid(&row),
                                "name": name,
                                "status": row.get("status").and_then(|status| status.get("phase")).and_then(Value::as_str).unwrap_or_default(),
                                "created_at": metadata_created_at(&row),
                                "endpoint_id": endpoint.id,
                                "endpoint_name": endpoint.name.clone(),
                                "instance_id": config.id.clone(),
                            }));
                        }

                        for (kind, api_path) in [
                            ("Deployment", "/apis/apps/v1/deployments"),
                            ("StatefulSet", "/apis/apps/v1/statefulsets"),
                            ("DaemonSet", "/apis/apps/v1/daemonsets"),
                        ] {
                            let rows =
                                portainer_kubernetes_items(&config, endpoint.id, api_path).await;
                            for row in rows {
                                let name = metadata_name(&row);
                                if name.is_empty() {
                                    continue;
                                }
                                kubernetes_applications.push(json!({
                                    "id": metadata_uid(&row),
                                    "name": name,
                                    "namespace": metadata_namespace(&row),
                                    "kind": kind,
                                    "ready": row.get("status").and_then(|status| status.get("readyReplicas")).and_then(Value::as_u64),
                                    "replicas": row.get("status").and_then(|status| status.get("replicas")).and_then(Value::as_u64).or_else(|| row.get("spec").and_then(|spec| spec.get("replicas")).and_then(Value::as_u64)),
                                    "created_at": metadata_created_at(&row),
                                    "endpoint_id": endpoint.id,
                                    "endpoint_name": endpoint.name.clone(),
                                    "instance_id": config.id.clone(),
                                }));
                            }
                        }

                        let pod_rows =
                            portainer_kubernetes_items(&config, endpoint.id, "/api/v1/pods").await;
                        for row in pod_rows {
                            let name = metadata_name(&row);
                            if name.is_empty() {
                                continue;
                            }
                            kubernetes_pods.push(json!({
                                "id": metadata_uid(&row),
                                "name": name,
                                "namespace": metadata_namespace(&row),
                                "status": row.get("status").and_then(|status| status.get("phase")).and_then(Value::as_str).unwrap_or_default(),
                                "node": row.get("spec").and_then(|spec| spec.get("nodeName")).and_then(Value::as_str).unwrap_or_default(),
                                "restart_count": row.get("status").and_then(|status| status.get("containerStatuses")).and_then(Value::as_array).map(|statuses| statuses.iter().filter_map(|status| status.get("restartCount").and_then(Value::as_u64)).sum::<u64>()).unwrap_or(0),
                                "created_at": metadata_created_at(&row),
                                "endpoint_id": endpoint.id,
                                "endpoint_name": endpoint.name.clone(),
                                "instance_id": config.id.clone(),
                            }));
                        }

                        let service_rows =
                            portainer_kubernetes_items(&config, endpoint.id, "/api/v1/services")
                                .await;
                        for row in service_rows {
                            let name = metadata_name(&row);
                            if name.is_empty() {
                                continue;
                            }
                            kubernetes_services.push(json!({
                                "id": metadata_uid(&row),
                                "name": name,
                                "namespace": metadata_namespace(&row),
                                "service_type": row.get("spec").and_then(|spec| spec.get("type")).and_then(Value::as_str).unwrap_or_default(),
                                "cluster_ip": row.get("spec").and_then(|spec| spec.get("clusterIP")).and_then(Value::as_str).unwrap_or_default(),
                                "ports": row.get("spec").and_then(|spec| spec.get("ports")).cloned().unwrap_or_else(|| json!([])),
                                "created_at": metadata_created_at(&row),
                                "endpoint_id": endpoint.id,
                                "endpoint_name": endpoint.name.clone(),
                                "instance_id": config.id.clone(),
                            }));
                        }

                        let ingress_rows = portainer_kubernetes_items(
                            &config,
                            endpoint.id,
                            "/apis/networking.k8s.io/v1/ingresses",
                        )
                        .await;
                        for row in ingress_rows {
                            let name = metadata_name(&row);
                            if name.is_empty() {
                                continue;
                            }
                            let hosts = row
                                .get("spec")
                                .and_then(|spec| spec.get("rules"))
                                .and_then(Value::as_array)
                                .map(|rules| {
                                    rules
                                        .iter()
                                        .filter_map(|rule| rule.get("host").and_then(Value::as_str))
                                        .collect::<Vec<_>>()
                                        .join(", ")
                                })
                                .unwrap_or_default();
                            kubernetes_ingresses.push(json!({
                                "id": metadata_uid(&row),
                                "name": name,
                                "namespace": metadata_namespace(&row),
                                "hosts": hosts,
                                "class_name": row.get("spec").and_then(|spec| spec.get("ingressClassName")).and_then(Value::as_str).unwrap_or_default(),
                                "created_at": metadata_created_at(&row),
                                "endpoint_id": endpoint.id,
                                "endpoint_name": endpoint.name.clone(),
                                "instance_id": config.id.clone(),
                            }));
                        }

                        for row in
                            portainer_kubernetes_items(&config, endpoint.id, "/api/v1/configmaps")
                                .await
                        {
                            let name = metadata_name(&row);
                            if name.is_empty() {
                                continue;
                            }
                            kubernetes_configmaps.push(json!({
                                "id": metadata_uid(&row),
                                "name": name,
                                "namespace": metadata_namespace(&row),
                                "keys": row.get("data").and_then(Value::as_object).map(|data| data.len()).unwrap_or(0),
                                "created_at": metadata_created_at(&row),
                                "endpoint_id": endpoint.id,
                                "endpoint_name": endpoint.name.clone(),
                                "instance_id": config.id.clone(),
                            }));
                        }

                        for row in
                            portainer_kubernetes_items(&config, endpoint.id, "/api/v1/secrets")
                                .await
                        {
                            let name = metadata_name(&row);
                            if name.is_empty() {
                                continue;
                            }
                            kubernetes_secrets.push(json!({
                                "id": metadata_uid(&row),
                                "name": name,
                                "namespace": metadata_namespace(&row),
                                "secret_type": row.get("type").and_then(Value::as_str).unwrap_or_default(),
                                "keys": row.get("data").and_then(Value::as_object).map(|data| data.len()).unwrap_or(0),
                                "created_at": metadata_created_at(&row),
                                "endpoint_id": endpoint.id,
                                "endpoint_name": endpoint.name.clone(),
                                "instance_id": config.id.clone(),
                            }));
                        }

                        for row in portainer_kubernetes_items(
                            &config,
                            endpoint.id,
                            "/api/v1/persistentvolumeclaims",
                        )
                        .await
                        {
                            let name = metadata_name(&row);
                            if name.is_empty() {
                                continue;
                            }
                            kubernetes_volumes.push(json!({
                                "id": metadata_uid(&row),
                                "name": name,
                                "namespace": metadata_namespace(&row),
                                "kind": "PersistentVolumeClaim",
                                "status": row.get("status").and_then(|status| status.get("phase")).and_then(Value::as_str).unwrap_or_default(),
                                "storage_class": row.get("spec").and_then(|spec| spec.get("storageClassName")).and_then(Value::as_str).unwrap_or_default(),
                                "capacity": row.get("status").and_then(|status| status.get("capacity")).and_then(|capacity| capacity.get("storage")).and_then(Value::as_str).unwrap_or_default(),
                                "created_at": metadata_created_at(&row),
                                "endpoint_id": endpoint.id,
                                "endpoint_name": endpoint.name.clone(),
                                "instance_id": config.id.clone(),
                            }));
                        }
                        for row in portainer_kubernetes_items(
                            &config,
                            endpoint.id,
                            "/api/v1/persistentvolumes",
                        )
                        .await
                        {
                            let name = metadata_name(&row);
                            if name.is_empty() {
                                continue;
                            }
                            kubernetes_volumes.push(json!({
                                "id": metadata_uid(&row),
                                "name": name,
                                "namespace": "",
                                "kind": "PersistentVolume",
                                "status": row.get("status").and_then(|status| status.get("phase")).and_then(Value::as_str).unwrap_or_default(),
                                "storage_class": row.get("spec").and_then(|spec| spec.get("storageClassName")).and_then(Value::as_str).unwrap_or_default(),
                                "capacity": row.get("spec").and_then(|spec| spec.get("capacity")).and_then(|capacity| capacity.get("storage")).and_then(Value::as_str).unwrap_or_default(),
                                "created_at": metadata_created_at(&row),
                                "endpoint_id": endpoint.id,
                                "endpoint_name": endpoint.name.clone(),
                                "instance_id": config.id.clone(),
                            }));
                        }

                        for row in portainer_kubernetes_items(
                            &config,
                            endpoint.id,
                            "/apis/apiextensions.k8s.io/v1/customresourcedefinitions",
                        )
                        .await
                        {
                            let name = metadata_name(&row);
                            if name.is_empty() {
                                continue;
                            }
                            kubernetes_crds.push(json!({
                                "id": metadata_uid(&row),
                                "name": name,
                                "group": row.get("spec").and_then(|spec| spec.get("group")).and_then(Value::as_str).unwrap_or_default(),
                                "scope": row.get("spec").and_then(|spec| spec.get("scope")).and_then(Value::as_str).unwrap_or_default(),
                                "kind": row.get("spec").and_then(|spec| spec.get("names")).and_then(|names| names.get("kind")).and_then(Value::as_str).unwrap_or_default(),
                                "created_at": metadata_created_at(&row),
                                "endpoint_id": endpoint.id,
                                "endpoint_name": endpoint.name.clone(),
                                "instance_id": config.id.clone(),
                            }));
                        }

                        let helm_rows = portainer_get(
                            &config,
                            &format!("/endpoints/{}/kubernetes/helm", endpoint.id),
                        )
                        .await
                        .ok()
                        .and_then(|value| value.as_array().cloned())
                        .unwrap_or_default();
                        for row in helm_rows {
                            let name = row
                                .get("name")
                                .or_else(|| row.get("Name"))
                                .and_then(Value::as_str)
                                .unwrap_or_default()
                                .trim()
                                .to_string();
                            if name.is_empty() {
                                continue;
                            }
                            kubernetes_helm_releases.push(json!({
                                "id": format!("{}:{}", endpoint.id, name),
                                "name": name,
                                "namespace": row.get("namespace").or_else(|| row.get("Namespace")).and_then(Value::as_str).unwrap_or_default(),
                                "chart": row.get("chart").or_else(|| row.get("Chart")).and_then(Value::as_str).unwrap_or_default(),
                                "app_version": row.get("appVersion").or_else(|| row.get("AppVersion")).and_then(Value::as_str).unwrap_or_default(),
                                "revision": row.get("revision").or_else(|| row.get("Revision")).cloned().unwrap_or(Value::Null),
                                "status": row.get("status").or_else(|| row.get("Status")).and_then(Value::as_str).unwrap_or_default(),
                                "updated": row.get("updated").or_else(|| row.get("Updated")).and_then(Value::as_str).unwrap_or_default(),
                                "endpoint_id": endpoint.id,
                                "endpoint_name": endpoint.name.clone(),
                                "instance_id": config.id.clone(),
                            }));
                        }

                        if kubernetes_applications.len() > application_count_before {
                            features.push("applications");
                        }
                        if kubernetes_helm_releases.iter().any(|release| {
                            release.get("endpoint_id").and_then(Value::as_i64) == Some(endpoint.id)
                        }) {
                            features.push("helm");
                        }
                        endpoint_values.push(json!({
                            "id": endpoint.id,
                            "name": endpoint.name,
                            "url": endpoint.url,
                            "status": endpoint.status,
                            "type": endpoint.endpoint_type,
                            "platform": platform,
                            "connection": portainer_endpoint_connection(endpoint.endpoint_type),
                            "group_id": endpoint.group_id,
                            "tags": endpoint.tag_ids,
                            "features": features,
                        }));
                        continue;
                    }
                    if platform == "aci" {
                        let subscription_rows = portainer_get(
                            &config,
                            &format!(
                                "/endpoints/{}/azure/subscriptions?api-version=2016-06-01",
                                endpoint.id
                            ),
                        )
                        .await
                        .ok()
                        .and_then(|value| value.get("value").and_then(Value::as_array).cloned())
                        .unwrap_or_default();
                        let mut features = vec!["aci"];
                        for subscription in subscription_rows {
                            let subscription_id = subscription
                                .get("subscriptionId")
                                .or_else(|| subscription.get("id"))
                                .and_then(Value::as_str)
                                .unwrap_or_default()
                                .to_string();
                            if subscription_id.is_empty() {
                                continue;
                            }
                            let subscription_name = subscription
                                .get("displayName")
                                .or_else(|| subscription.get("name"))
                                .and_then(Value::as_str)
                                .unwrap_or(&subscription_id)
                                .to_string();
                            aci_subscriptions.push(json!({
                                "id": subscription_id,
                                "name": subscription_name,
                                "endpoint_id": endpoint.id,
                                "endpoint_name": endpoint.name.clone(),
                                "instance_id": config.id.clone(),
                            }));

                            let resource_group_rows = portainer_get(
                                &config,
                                &format!(
                                    "/endpoints/{}/azure/subscriptions/{}/resourcegroups?api-version=2018-02-01",
                                    endpoint.id,
                                    urlencoding::encode(&subscription_id)
                                ),
                            )
                            .await
                            .ok()
                            .and_then(|value| value.get("value").and_then(Value::as_array).cloned())
                            .unwrap_or_default();
                            for group in resource_group_rows {
                                let name = group
                                    .get("name")
                                    .and_then(Value::as_str)
                                    .unwrap_or_default()
                                    .to_string();
                                if name.is_empty() {
                                    continue;
                                }
                                aci_resource_groups.push(json!({
                                    "id": group.get("id").and_then(Value::as_str).unwrap_or_default(),
                                    "name": name,
                                    "location": group.get("location").and_then(Value::as_str).unwrap_or_default(),
                                    "subscription_id": subscription_id,
                                    "subscription_name": subscription_name,
                                    "endpoint_id": endpoint.id,
                                    "endpoint_name": endpoint.name.clone(),
                                    "instance_id": config.id.clone(),
                                }));
                            }

                            let group_rows = portainer_get(
                                &config,
                                &format!(
                                    "/endpoints/{}/azure/subscriptions/{}/providers/Microsoft.ContainerInstance/containerGroups?api-version=2018-04-01",
                                    endpoint.id,
                                    urlencoding::encode(&subscription_id)
                                ),
                            )
                            .await
                            .ok()
                            .and_then(|value| value.get("value").and_then(Value::as_array).cloned())
                            .unwrap_or_default();
                            for group in group_rows {
                                let id = group
                                    .get("id")
                                    .and_then(Value::as_str)
                                    .unwrap_or_default()
                                    .to_string();
                                let name = group
                                    .get("name")
                                    .and_then(Value::as_str)
                                    .unwrap_or_default()
                                    .to_string();
                                if id.is_empty() || name.is_empty() {
                                    continue;
                                }
                                let properties = group.get("properties").unwrap_or(&Value::Null);
                                let first_container = properties
                                    .get("containers")
                                    .and_then(Value::as_array)
                                    .and_then(|containers| containers.first())
                                    .unwrap_or(&Value::Null);
                                let container_properties =
                                    first_container.get("properties").unwrap_or(&Value::Null);
                                let ports = properties
                                    .get("ipAddress")
                                    .and_then(|ip| ip.get("ports"))
                                    .cloned()
                                    .unwrap_or_else(|| json!([]));
                                aci_container_groups.push(json!({
                                    "id": id,
                                    "name": name,
                                    "location": group.get("location").and_then(Value::as_str).unwrap_or_default(),
                                    "resource_group": aci_resource_group_from_id(group.get("id").and_then(Value::as_str).unwrap_or_default()).unwrap_or_default(),
                                    "subscription_id": subscription_id,
                                    "subscription_name": subscription_name,
                                    "status": properties.get("instanceView").and_then(|view| view.get("state")).and_then(Value::as_str).unwrap_or_default(),
                                    "os_type": properties.get("osType").and_then(Value::as_str).unwrap_or_default(),
                                    "ip_address": properties.get("ipAddress").and_then(|ip| ip.get("ip")).and_then(Value::as_str).unwrap_or_default(),
                                    "ip_type": properties.get("ipAddress").and_then(|ip| ip.get("type")).and_then(Value::as_str).unwrap_or_default(),
                                    "ports": ports,
                                    "image": container_properties.get("image").and_then(Value::as_str).unwrap_or_default(),
                                    "cpu": container_properties.get("resources").and_then(|resources| resources.get("requests")).and_then(|requests| requests.get("cpu")).cloned().unwrap_or(Value::Null),
                                    "memory_gb": container_properties.get("resources").and_then(|resources| resources.get("requests")).and_then(|requests| requests.get("memoryInGB")).cloned().unwrap_or(Value::Null),
                                    "env_count": container_properties.get("environmentVariables").and_then(Value::as_array).map(|rows| rows.len()).unwrap_or(0),
                                    "endpoint_id": endpoint.id,
                                    "endpoint_name": endpoint.name.clone(),
                                    "instance_id": config.id.clone(),
                                }));
                            }
                        }
                        if aci_container_groups.iter().any(|group| {
                            group.get("endpoint_id").and_then(Value::as_i64) == Some(endpoint.id)
                        }) {
                            features.push("container-groups");
                        }
                        endpoint_values.push(json!({
                            "id": endpoint.id,
                            "name": endpoint.name,
                            "url": endpoint.url,
                            "status": endpoint.status,
                            "type": endpoint.endpoint_type,
                            "platform": platform,
                            "connection": portainer_endpoint_connection(endpoint.endpoint_type),
                            "group_id": endpoint.group_id,
                            "tags": endpoint.tag_ids,
                            "features": features,
                        }));
                        continue;
                    }
                    let info_value =
                        portainer_get(&config, &format!("/endpoints/{}/docker/info", endpoint.id))
                            .await
                            .unwrap_or_else(|_| json!({}));
                    let docker_info = portainer_docker_info_payload(&info_value);
                    let swarm_active = info_value
                        .get("Swarm")
                        .and_then(|swarm| {
                            swarm
                                .get("LocalNodeState")
                                .or_else(|| swarm.get("localNodeState"))
                                .and_then(Value::as_str)
                        })
                        .map(|state| state.eq_ignore_ascii_case("active"))
                        .unwrap_or(false);
                    let mut features = Vec::new();
                    if swarm_active {
                        features.push("swarm");
                    }
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
                                ports: docker_container_port_summary(row),
                                created: row.get("Created").and_then(Value::as_i64),
                                command: row
                                    .get("Command")
                                    .and_then(Value::as_str)
                                    .filter(|value| !value.trim().is_empty())
                                    .map(ToString::to_string),
                                network_names: docker_container_network_names(row),
                                mount_count: docker_container_mount_count(row),
                                labels: row.get("Labels").cloned(),
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
                            let digests = row
                                .get("RepoDigests")
                                .and_then(Value::as_array)
                                .map(|digests| {
                                    digests
                                        .iter()
                                        .filter_map(Value::as_str)
                                        .filter(|digest| {
                                            !digest.is_empty() && *digest != "<none>@<none>"
                                        })
                                        .map(ToString::to_string)
                                        .collect::<Vec<_>>()
                                })
                                .unwrap_or_default();
                            images.push(json!({
                                "id": id,
                                "name": display_name,
                                "tags": tags,
                                "digests": digests,
                                "size": row.get("Size").and_then(Value::as_i64).unwrap_or_default(),
                                "shared_size": row.get("SharedSize").and_then(Value::as_i64),
                                "virtual_size": row.get("VirtualSize").and_then(Value::as_i64),
                                "containers": row.get("Containers").and_then(Value::as_i64),
                                "labels_count": object_field_count(row, "Labels"),
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
                                "created_at": row.get("CreatedAt").and_then(Value::as_str).unwrap_or_default(),
                                "scope": row.get("Scope").and_then(Value::as_str).unwrap_or_default(),
                                "status": row.get("Status").cloned().unwrap_or(Value::Null),
                                "labels_count": object_field_count(row, "Labels"),
                                "options_count": object_field_count(row, "Options"),
                                "usage_ref_count": row.get("UsageData").and_then(|usage| usage.get("RefCount")).and_then(Value::as_i64),
                                "usage_size": row.get("UsageData").and_then(|usage| usage.get("Size")).and_then(Value::as_i64),
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
                                "created": row.get("Created").and_then(Value::as_str).unwrap_or_default(),
                                "ipam": docker_network_ipam_summary(row),
                                "internal": row.get("Internal").and_then(Value::as_bool).unwrap_or(false),
                                "attachable": row.get("Attachable").and_then(Value::as_bool).unwrap_or(false),
                                "ingress": row.get("Ingress").and_then(Value::as_bool).unwrap_or(false),
                                "enable_ipv6": row.get("EnableIPv6").and_then(Value::as_bool).unwrap_or(false),
                                "containers_count": docker_network_container_count(row).unwrap_or(0),
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
                    if swarm_active {
                        let services_value = portainer_get(
                            &config,
                            &format!("/endpoints/{}/docker/services", endpoint.id),
                        )
                        .await
                        .unwrap_or_else(|_| json!([]));
                        if let Some(rows) = services_value.as_array() {
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
                                let mode = spec.get("Mode").unwrap_or(&Value::Null);
                                let replicas = mode
                                    .get("Replicated")
                                    .and_then(|replicated| replicated.get("Replicas"))
                                    .and_then(Value::as_u64);
                                let image = spec
                                    .get("TaskTemplate")
                                    .and_then(|template| template.get("ContainerSpec"))
                                    .and_then(|container| container.get("Image"))
                                    .and_then(Value::as_str)
                                    .unwrap_or_default();
                                swarm_services.push(json!({
                                    "id": id,
                                    "name": name,
                                    "image": image,
                                    "mode": if replicas.is_some() { "replicated" } else { "global" },
                                    "replicas": replicas,
                                    "created_at": row.get("CreatedAt").and_then(Value::as_str).unwrap_or_default(),
                                    "updated_at": row.get("UpdatedAt").and_then(Value::as_str).unwrap_or_default(),
                                    "endpoint_id": endpoint.id,
                                    "endpoint_name": endpoint.name.clone(),
                                    "instance_id": config.id.clone(),
                                }));
                            }
                        }

                        let nodes_value = portainer_get(
                            &config,
                            &format!("/endpoints/{}/docker/nodes", endpoint.id),
                        )
                        .await
                        .unwrap_or_else(|_| json!([]));
                        if let Some(rows) = nodes_value.as_array() {
                            for row in rows {
                                let id = row
                                    .get("ID")
                                    .or_else(|| row.get("Id"))
                                    .and_then(Value::as_str)
                                    .unwrap_or_default()
                                    .to_string();
                                let hostname = row
                                    .get("Description")
                                    .and_then(|description| description.get("Hostname"))
                                    .and_then(Value::as_str)
                                    .unwrap_or_default()
                                    .to_string();
                                if id.is_empty() || hostname.is_empty() {
                                    continue;
                                }
                                swarm_nodes.push(json!({
                                    "id": id,
                                    "hostname": hostname,
                                    "state": row.get("Status").and_then(|status| status.get("State")).and_then(Value::as_str).unwrap_or_default(),
                                    "availability": row.get("Spec").and_then(|spec| spec.get("Availability")).and_then(Value::as_str).unwrap_or_default(),
                                    "role": row.get("Spec").and_then(|spec| spec.get("Role")).and_then(Value::as_str).unwrap_or_default(),
                                    "manager_reachability": row.get("ManagerStatus").and_then(|status| status.get("Reachability")).and_then(Value::as_str).unwrap_or_default(),
                                    "leader": row.get("ManagerStatus").and_then(|status| status.get("Leader")).and_then(Value::as_bool).unwrap_or(false),
                                    "endpoint_id": endpoint.id,
                                    "endpoint_name": endpoint.name.clone(),
                                    "instance_id": config.id.clone(),
                                }));
                            }
                        }

                        let tasks_value = portainer_get(
                            &config,
                            &format!("/endpoints/{}/docker/tasks", endpoint.id),
                        )
                        .await
                        .unwrap_or_else(|_| json!([]));
                        if let Some(rows) = tasks_value.as_array() {
                            for row in rows {
                                let id = row
                                    .get("ID")
                                    .or_else(|| row.get("Id"))
                                    .and_then(Value::as_str)
                                    .unwrap_or_default()
                                    .to_string();
                                if id.is_empty() {
                                    continue;
                                }
                                swarm_tasks.push(json!({
                                    "id": id,
                                    "service_id": row.get("ServiceID").and_then(Value::as_str).unwrap_or_default(),
                                    "node_id": row.get("NodeID").and_then(Value::as_str).unwrap_or_default(),
                                    "slot": row.get("Slot").and_then(Value::as_u64),
                                    "desired_state": row.get("DesiredState").and_then(Value::as_str).unwrap_or_default(),
                                    "state": row.get("Status").and_then(|status| status.get("State")).and_then(Value::as_str).unwrap_or_default(),
                                    "message": row.get("Status").and_then(|status| status.get("Message")).and_then(Value::as_str).unwrap_or_default(),
                                    "container_id": row.get("Status").and_then(|status| status.get("ContainerStatus")).and_then(|container| container.get("ContainerID")).and_then(Value::as_str).unwrap_or_default(),
                                    "endpoint_id": endpoint.id,
                                    "endpoint_name": endpoint.name.clone(),
                                    "instance_id": config.id.clone(),
                                }));
                            }
                        }
                    }
                    endpoint_values.push(json!({
                        "id": endpoint.id,
                        "name": endpoint.name,
                        "url": endpoint.url,
                        "status": endpoint.status,
                        "type": endpoint.endpoint_type,
                        "platform": platform,
                        "connection": portainer_endpoint_connection(endpoint.endpoint_type),
                        "group_id": endpoint.group_id,
                        "tags": endpoint.tag_ids,
                        "features": features,
                        "docker_info": docker_info,
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

                let mut instance_value = json!({
                    "id": config.id,
                    "name": config.name,
                    "url": config.url,
                    "available": true,
                    "status": status,
                    "system_status": system_status,
                    "settings": settings,
                    "groups": groups,
                    "tags": tags,
                    "users": users,
                    "teams": teams,
                    "app_templates": app_templates,
                    "custom_templates": custom_templates,
                    "endpoints": endpoint_values,
                    "stacks": stacks,
                    "containers": containers,
                    "images": images,
                    "volumes": volumes,
                    "networks": networks,
                    "secrets": secrets,
                    "configs": configs,
                    "swarm_services": swarm_services,
                    "swarm_nodes": swarm_nodes,
                    "swarm_tasks": swarm_tasks,
                    "kubernetes_namespaces": kubernetes_namespaces,
                    "kubernetes_applications": kubernetes_applications,
                    "kubernetes_pods": kubernetes_pods,
                    "kubernetes_services": kubernetes_services,
                    "kubernetes_ingresses": kubernetes_ingresses,
                    "kubernetes_configmaps": kubernetes_configmaps,
                    "kubernetes_secrets": kubernetes_secrets,
                    "kubernetes_volumes": kubernetes_volumes,
                    "kubernetes_crds": kubernetes_crds,
                    "kubernetes_helm_releases": kubernetes_helm_releases,
                    "aci_subscriptions": aci_subscriptions,
                    "aci_resource_groups": aci_resource_groups,
                    "aci_container_groups": aci_container_groups,
                    "registries": registries,
                });
                let capabilities = portainer_capabilities_payload(&instance_value);
                if let Some(instance) = instance_value.as_object_mut() {
                    instance.insert("capabilities".into(), capabilities);
                }
                instances.push(instance_value);
            }
            Err(err) => {
                instances.push(json!({
                    "id": config.id,
                    "name": config.name,
                    "url": config.url,
                    "available": false,
                    "error": err.to_string(),
                    "capabilities": {
                        "version": Value::Null,
                        "edition": "unknown",
                        "docker": false,
                        "swarm": false,
                        "kubernetes": false,
                        "aci": false,
                        "groups": 0,
                        "tags": 0,
                        "users": 0,
                        "teams": 0,
                        "app_templates": 0,
                        "custom_templates": 0,
                        "swarm_services": 0,
                        "swarm_nodes": 0,
                        "swarm_tasks": 0,
                        "kubernetes_namespaces": 0,
                        "kubernetes_applications": 0,
                        "kubernetes_pods": 0,
                        "kubernetes_services": 0,
                        "kubernetes_ingresses": 0,
                        "kubernetes_configmaps": 0,
                        "kubernetes_secrets": 0,
                        "kubernetes_volumes": 0,
                        "kubernetes_crds": 0,
                        "kubernetes_helm_releases": 0,
                        "aci_subscriptions": 0,
                        "aci_resource_groups": 0,
                        "aci_container_groups": 0,
                        "settings": false,
                        "system_status": false
                    },
                    "endpoints": [],
                    "stacks": [],
                    "containers": [],
                    "images": [],
                    "volumes": [],
                    "networks": [],
                    "secrets": [],
                    "configs": [],
                    "swarm_services": [],
                    "swarm_nodes": [],
                    "swarm_tasks": [],
                    "kubernetes_namespaces": [],
                    "kubernetes_applications": [],
                    "kubernetes_pods": [],
                    "kubernetes_services": [],
                    "kubernetes_ingresses": [],
                    "kubernetes_configmaps": [],
                    "kubernetes_secrets": [],
                    "kubernetes_volumes": [],
                    "kubernetes_crds": [],
                    "kubernetes_helm_releases": [],
                    "aci_subscriptions": [],
                    "aci_resource_groups": [],
                    "aci_container_groups": [],
                    "registries": [],
                    "groups": [],
                    "tags": [],
                    "users": [],
                    "teams": [],
                    "app_templates": [],
                    "custom_templates": [],
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
    let all_swarm_services = instances
        .iter()
        .flat_map(|item| {
            item.get("swarm_services")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default()
        })
        .collect::<Vec<_>>();
    let all_swarm_nodes = instances
        .iter()
        .flat_map(|item| {
            item.get("swarm_nodes")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default()
        })
        .collect::<Vec<_>>();
    let all_swarm_tasks = instances
        .iter()
        .flat_map(|item| {
            item.get("swarm_tasks")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default()
        })
        .collect::<Vec<_>>();
    let all_kubernetes_namespaces = instances
        .iter()
        .flat_map(|item| {
            item.get("kubernetes_namespaces")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default()
        })
        .collect::<Vec<_>>();
    let all_kubernetes_applications = instances
        .iter()
        .flat_map(|item| {
            item.get("kubernetes_applications")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default()
        })
        .collect::<Vec<_>>();
    let all_kubernetes_pods = instances
        .iter()
        .flat_map(|item| {
            item.get("kubernetes_pods")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default()
        })
        .collect::<Vec<_>>();
    let all_kubernetes_services = instances
        .iter()
        .flat_map(|item| {
            item.get("kubernetes_services")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default()
        })
        .collect::<Vec<_>>();
    let all_kubernetes_ingresses = instances
        .iter()
        .flat_map(|item| {
            item.get("kubernetes_ingresses")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default()
        })
        .collect::<Vec<_>>();
    let all_kubernetes_configmaps = instances
        .iter()
        .flat_map(|item| {
            item.get("kubernetes_configmaps")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default()
        })
        .collect::<Vec<_>>();
    let all_kubernetes_secrets = instances
        .iter()
        .flat_map(|item| {
            item.get("kubernetes_secrets")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default()
        })
        .collect::<Vec<_>>();
    let all_kubernetes_volumes = instances
        .iter()
        .flat_map(|item| {
            item.get("kubernetes_volumes")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default()
        })
        .collect::<Vec<_>>();
    let all_kubernetes_crds = instances
        .iter()
        .flat_map(|item| {
            item.get("kubernetes_crds")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default()
        })
        .collect::<Vec<_>>();
    let all_kubernetes_helm_releases = instances
        .iter()
        .flat_map(|item| {
            item.get("kubernetes_helm_releases")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default()
        })
        .collect::<Vec<_>>();
    let all_aci_subscriptions = instances
        .iter()
        .flat_map(|item| {
            item.get("aci_subscriptions")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default()
        })
        .collect::<Vec<_>>();
    let all_aci_resource_groups = instances
        .iter()
        .flat_map(|item| {
            item.get("aci_resource_groups")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default()
        })
        .collect::<Vec<_>>();
    let all_aci_container_groups = instances
        .iter()
        .flat_map(|item| {
            item.get("aci_container_groups")
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
    let all_groups = instances
        .iter()
        .flat_map(|item| {
            item.get("groups")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default()
        })
        .collect::<Vec<_>>();
    let all_tags = instances
        .iter()
        .flat_map(|item| {
            item.get("tags")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default()
        })
        .collect::<Vec<_>>();
    let all_users = instances
        .iter()
        .flat_map(|item| {
            item.get("users")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default()
        })
        .collect::<Vec<_>>();
    let all_teams = instances
        .iter()
        .flat_map(|item| {
            item.get("teams")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default()
        })
        .collect::<Vec<_>>();
    let all_custom_templates = instances
        .iter()
        .flat_map(|item| {
            item.get("custom_templates")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default()
        })
        .collect::<Vec<_>>();
    let all_app_templates = instances
        .iter()
        .flat_map(|item| {
            item.get("app_templates")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default()
        })
        .collect::<Vec<_>>();
    let all_capabilities = instances
        .iter()
        .map(|instance| {
            json!({
                "instance_id": instance.get("id").cloned().unwrap_or(Value::Null),
                "instance_name": instance.get("name").cloned().unwrap_or(Value::Null),
                "available": instance.get("available").cloned().unwrap_or_else(|| json!(false)),
                "capabilities": instance.get("capabilities").cloned().unwrap_or_else(|| json!({})),
            })
        })
        .collect::<Vec<_>>();

    json!({
        "available": any_live,
        "source": "portainer",
        "instances": instances,
        "capabilities": all_capabilities,
        "endpoints": all_endpoints,
        "stacks": all_stacks,
        "containers": all_containers,
        "images": all_images,
        "volumes": all_volumes,
        "networks": all_networks,
        "secrets": all_secrets,
        "configs": all_configs,
        "swarm_services": all_swarm_services,
        "swarm_nodes": all_swarm_nodes,
        "swarm_tasks": all_swarm_tasks,
        "kubernetes_namespaces": all_kubernetes_namespaces,
        "kubernetes_applications": all_kubernetes_applications,
        "kubernetes_pods": all_kubernetes_pods,
        "kubernetes_services": all_kubernetes_services,
        "kubernetes_ingresses": all_kubernetes_ingresses,
        "kubernetes_configmaps": all_kubernetes_configmaps,
        "kubernetes_secrets": all_kubernetes_secrets,
        "kubernetes_volumes": all_kubernetes_volumes,
        "kubernetes_crds": all_kubernetes_crds,
        "kubernetes_helm_releases": all_kubernetes_helm_releases,
        "aci_subscriptions": all_aci_subscriptions,
        "aci_resource_groups": all_aci_resource_groups,
        "aci_container_groups": all_aci_container_groups,
        "registries": all_registries,
        "groups": all_groups,
        "tags": all_tags,
        "users": all_users,
        "teams": all_teams,
        "app_templates": all_app_templates,
        "custom_templates": all_custom_templates,
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
                            created: None,
                            command: None,
                            network_names: Vec::new(),
                            mount_count: None,
                            labels: None,
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
        | "processes"
        | "changes"
        | "duplicate"
        | "recreate"
        | "redeploy"
        | "delete"
        | "inspect-endpoint"
        | "events"
        | "events-follow"
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
        | "inspect-endpoint-group"
        | "create-endpoint-group"
        | "update-endpoint-group"
        | "remove-endpoint-group"
        | "inspect-tag"
        | "create-tag"
        | "update-tag"
        | "remove-tag"
        | "inspect-user"
        | "create-user"
        | "update-user"
        | "remove-user"
        | "inspect-team"
        | "create-team"
        | "update-team"
        | "remove-team"
        | "app-template-file"
        | "deploy-app-template"
        | "inspect-custom-template"
        | "custom-template-file"
        | "deploy-custom-template"
        | "create-custom-template"
        | "update-custom-template"
        | "remove-custom-template"
        | "inspect-settings"
        | "update-settings"
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
        | "create-service"
        | "apply-kubernetes-manifest"
        | "preview-kubernetes-manifest"
        | "create-kubernetes-namespace"
        | "create-kubernetes-application"
        | "create-kubernetes-service"
        | "create-kubernetes-ingress"
        | "create-kubernetes-configmap"
        | "create-kubernetes-secret"
        | "create-kubernetes-volume"
        | "update-service"
        | "rollback-service"
        | "inspect-service"
        | "service-logs"
        | "scale-service"
        | "remove-service"
        | "inspect-node"
        | "update-node-availability"
        | "inspect-task"
        | "task-logs"
        | "inspect-kubernetes-namespace"
        | "delete-kubernetes-namespace"
        | "inspect-kubernetes-application"
        | "delete-kubernetes-application"
        | "inspect-kubernetes-pod"
        | "kubernetes-pod-logs"
        | "kubernetes-pod-exec"
        | "delete-kubernetes-pod"
        | "inspect-kubernetes-service"
        | "delete-kubernetes-service"
        | "inspect-kubernetes-ingress"
        | "delete-kubernetes-ingress"
        | "inspect-kubernetes-configmap"
        | "delete-kubernetes-configmap"
        | "inspect-kubernetes-secret"
        | "delete-kubernetes-secret"
        | "inspect-kubernetes-volume"
        | "delete-kubernetes-volume"
        | "inspect-kubernetes-crd"
        | "inspect-helm-release"
        | "helm-release-history"
        | "install-helm-chart"
        | "rollback-helm-release"
        | "uninstall-helm-release"
        | "create-aci-container-group"
        | "inspect-aci-container-group"
        | "delete-aci-container-group"
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
        | "shell"
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
            | "remove-endpoint-group"
            | "remove-tag"
            | "remove-user"
            | "remove-team"
            | "remove-custom-template"
            | "rollback-service"
            | "rollback-helm-release"
            | "remove-service"
            | "uninstall-helm-release"
            | "delete-aci-container-group"
            | "remove-disk"
    ) || action.starts_with("delete-kubernetes-")
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

fn docker_event_filter_values(args: &Value, keys: &[&str]) -> Result<Vec<String>, AppError> {
    let values = arg_string_list(args, keys);
    for value in &values {
        if value.len() > 128 || value.chars().any(char::is_control) {
            return Err(AppError::BadRequest(
                "Docker event filter values must be printable and 128 characters or less".into(),
            ));
        }
    }
    Ok(values)
}

fn docker_event_filters_query(args: &Value) -> Result<Option<String>, AppError> {
    if let Some(raw) = arg_string(args, &["filters", "filters_json"]) {
        let parsed: Value = serde_json::from_str(&raw).map_err(|_| {
            AppError::BadRequest("Docker event filters must be a JSON object".into())
        })?;
        if !parsed.is_object() {
            return Err(AppError::BadRequest(
                "Docker event filters must be a JSON object".into(),
            ));
        }
        return Ok(Some(urlencoding::encode(&parsed.to_string()).into_owned()));
    }

    let mut filters = serde_json::Map::new();
    for (docker_key, arg_keys) in [
        ("type", ["type", "event_type", "type_filter"].as_slice()),
        (
            "event",
            ["event", "action", "status", "event_filter"].as_slice(),
        ),
        ("container", ["container", "container_filter"].as_slice()),
        ("image", ["image", "image_filter"].as_slice()),
        ("volume", ["volume", "volume_filter"].as_slice()),
        ("network", ["network", "network_filter"].as_slice()),
        ("label", ["label", "labels", "label_filter"].as_slice()),
    ] {
        let values = docker_event_filter_values(args, arg_keys)?;
        if !values.is_empty() {
            filters.insert(docker_key.to_string(), json!(values));
        }
    }

    if filters.is_empty() {
        Ok(None)
    } else {
        Ok(Some(
            urlencoding::encode(&Value::Object(filters).to_string()).into_owned(),
        ))
    }
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

fn validate_swarm_restart_condition(value: &str) -> Result<String, AppError> {
    match value.trim() {
        "none" | "no" => Ok("none".into()),
        "on-failure" => Ok("on-failure".into()),
        "any" | "always" | "unless-stopped" => Ok("any".into()),
        _ => Err(AppError::BadRequest(
            "restart policy must be none, any, or on-failure".into(),
        )),
    }
}

fn portainer_service_ports(args: &Value) -> Result<Vec<Value>, AppError> {
    let mut ports = Vec::new();
    for entry in arg_string_list(args, &["ports", "published_ports", "port_bindings"]) {
        let mut parts = entry.split(':').map(str::trim).collect::<Vec<_>>();
        if parts.is_empty() {
            continue;
        }
        let target = parts
            .pop()
            .filter(|value| !value.is_empty())
            .ok_or_else(|| AppError::BadRequest("service port target is required".into()))?;
        let (target, protocol) = target
            .split_once('/')
            .map(|(port, protocol)| (port.trim(), protocol.trim()))
            .unwrap_or((target, "tcp"));
        let target_port = target
            .parse::<u64>()
            .map_err(|_| AppError::BadRequest("service target port must be numeric".into()))?;
        let published_port = parts
            .pop()
            .filter(|value| !value.is_empty())
            .map(|value| {
                value.parse::<u64>().map_err(|_| {
                    AppError::BadRequest("service published port must be numeric".into())
                })
            })
            .transpose()?;
        let mut port = serde_json::Map::new();
        port.insert("Protocol".into(), json!(protocol));
        port.insert("TargetPort".into(), json!(target_port));
        port.insert("PublishMode".into(), json!("ingress"));
        if let Some(published_port) = published_port {
            port.insert("PublishedPort".into(), json!(published_port));
        }
        ports.push(Value::Object(port));
    }
    Ok(ports)
}

fn portainer_service_spec(args: &Value, require_name: bool) -> Result<Value, AppError> {
    let mut spec = serde_json::Map::new();
    if let Some(name) = arg_string(args, &["name", "service"]) {
        spec.insert(
            "Name".into(),
            json!(validate_control_token(&name, "service name")?),
        );
    } else if require_name {
        return Err(AppError::BadRequest("service name is required".into()));
    }

    let image =
        validate_proxmox_config_value(&required_arg_string(args, &["image"], "image")?, "image")?;
    let mut container_spec = serde_json::Map::new();
    container_spec.insert("Image".into(), json!(image));
    let env = arg_string_list(args, &["env", "environment"]);
    if !env.is_empty() {
        container_spec.insert("Env".into(), json!(env));
    }
    let container_labels = arg_string_map(args, &["container_labels", "containerLabels"]);
    if !container_labels.is_empty() {
        container_spec.insert("Labels".into(), Value::Object(container_labels));
    }
    if let Some(command) = docker_command(args) {
        container_spec.insert("Command".into(), json!(command));
    }

    let mut task_template = serde_json::Map::new();
    task_template.insert("ContainerSpec".into(), Value::Object(container_spec));
    let restart_condition = arg_string(args, &["restart_policy", "policy"])
        .map(|value| validate_swarm_restart_condition(&value))
        .transpose()?
        .unwrap_or_else(|| "any".into());
    task_template.insert(
        "RestartPolicy".into(),
        json!({ "Condition": restart_condition }),
    );

    let networks = arg_string_list(args, &["networks", "network"]);
    if !networks.is_empty() {
        task_template.insert(
            "Networks".into(),
            json!(networks
                .into_iter()
                .map(|target| json!({ "Target": target }))
                .collect::<Vec<_>>()),
        );
    }

    spec.insert("TaskTemplate".into(), Value::Object(task_template));
    let labels = arg_string_map(args, &["labels", "service_labels", "serviceLabels"]);
    if !labels.is_empty() {
        spec.insert("Labels".into(), Value::Object(labels));
    }
    let mode = arg_string(args, &["mode"]).unwrap_or_else(|| "replicated".into());
    if mode == "global" {
        spec.insert("Mode".into(), json!({ "Global": {} }));
    } else {
        spec.insert(
            "Mode".into(),
            json!({ "Replicated": { "Replicas": optional_arg_u64(args, &["replicas", "scale"]).unwrap_or(1) } }),
        );
    }
    let ports = portainer_service_ports(args)?;
    if !ports.is_empty() {
        spec.insert("EndpointSpec".into(), json!({ "Ports": ports }));
    }
    Ok(Value::Object(spec))
}

fn mutate_portainer_service_spec(spec: &mut Value, args: &Value) -> Result<(), AppError> {
    let spec_object = spec
        .as_object_mut()
        .ok_or_else(|| AppError::BadRequest("Portainer service spec is invalid".into()))?;
    if let Some(name) = arg_string(args, &["name", "service"]) {
        spec_object.insert(
            "Name".into(),
            json!(validate_control_token(&name, "service name")?),
        );
    }
    if let Some(replicas) = optional_arg_u64(args, &["replicas", "scale"]) {
        spec_object.insert(
            "Mode".into(),
            json!({ "Replicated": { "Replicas": replicas } }),
        );
    }
    let labels = arg_string_map(args, &["labels", "service_labels", "serviceLabels"]);
    if !labels.is_empty() {
        spec_object.insert("Labels".into(), Value::Object(labels));
    }
    let ports = portainer_service_ports(args)?;
    if !ports.is_empty() {
        spec_object.insert("EndpointSpec".into(), json!({ "Ports": ports }));
    }

    let task_template = spec_object
        .entry("TaskTemplate")
        .or_insert_with(|| json!({}))
        .as_object_mut()
        .ok_or_else(|| AppError::BadRequest("Portainer service task template is invalid".into()))?;
    let container_spec = task_template
        .entry("ContainerSpec")
        .or_insert_with(|| json!({}))
        .as_object_mut()
        .ok_or_else(|| {
            AppError::BadRequest("Portainer service container spec is invalid".into())
        })?;
    if let Some(image) = arg_string(args, &["image"]) {
        container_spec.insert(
            "Image".into(),
            json!(validate_proxmox_config_value(&image, "image")?),
        );
    }
    let env = arg_string_list(args, &["env", "environment"]);
    if !env.is_empty() {
        container_spec.insert("Env".into(), json!(env));
    }
    let container_labels = arg_string_map(args, &["container_labels", "containerLabels"]);
    if !container_labels.is_empty() {
        container_spec.insert("Labels".into(), Value::Object(container_labels));
    }
    if let Some(command) = docker_command(args) {
        container_spec.insert("Command".into(), json!(command));
    }
    if let Some(policy) = arg_string(args, &["restart_policy", "policy"]) {
        task_template.insert(
            "RestartPolicy".into(),
            json!({ "Condition": validate_swarm_restart_condition(&policy)? }),
        );
    }
    let networks = arg_string_list(args, &["networks", "network"]);
    if !networks.is_empty() {
        task_template.insert(
            "Networks".into(),
            json!(networks
                .into_iter()
                .map(|target| json!({ "Target": target }))
                .collect::<Vec<_>>()),
        );
    }
    Ok(())
}

fn kubernetes_namespace(args: &Value) -> Result<String, AppError> {
    validate_control_token(
        &required_arg_string(args, &["namespace"], "namespace")?,
        "namespace",
    )
}

fn kubernetes_application_plural(args: &Value) -> Result<&'static str, AppError> {
    match required_arg_string(args, &["kind"], "application kind")?.as_str() {
        "Deployment" | "deployment" | "deployments" => Ok("deployments"),
        "StatefulSet" | "statefulset" | "statefulsets" => Ok("statefulsets"),
        "DaemonSet" | "daemonset" | "daemonsets" => Ok("daemonsets"),
        _ => Err(AppError::BadRequest(
            "application kind must be Deployment, StatefulSet, or DaemonSet".into(),
        )),
    }
}

fn kubernetes_resource_name(resource_id: &str) -> Result<String, AppError> {
    validate_control_token(resource_id, "Kubernetes resource name")
}

fn helm_release_name(endpoint_id: i64, resource_id: &str) -> Result<String, AppError> {
    let prefix = format!("{endpoint_id}:");
    let raw = resource_id.strip_prefix(&prefix).unwrap_or(resource_id);
    validate_control_token(raw, "Helm release name")
}

fn helm_namespace(args: &Value) -> Result<String, AppError> {
    let namespace = arg_string(args, &["namespace"]).unwrap_or_else(|| "default".into());
    validate_control_token(&namespace, "Helm namespace")
}

fn helm_release_path(
    endpoint_id: i64,
    release: &str,
    args: &Value,
    suffix: Option<&str>,
) -> Result<String, AppError> {
    let release = helm_release_name(endpoint_id, release)?;
    let namespace = helm_namespace(args)?;
    let mut query = vec![format!("namespace={}", urlencoding::encode(&namespace))];
    if suffix.is_none() {
        if let Some(show_resources) = optional_arg_bool(args, &["show_resources", "showResources"])
        {
            query.push(format!("showResources={show_resources}"));
        }
        if let Some(revision) = optional_arg_u64(args, &["revision"]) {
            query.push(format!("revision={revision}"));
        }
    }
    let suffix = suffix.unwrap_or_default();
    Ok(format!(
        "/endpoints/{endpoint_id}/kubernetes/helm/{}{}?{}",
        urlencoding::encode(&release),
        suffix,
        query.join("&")
    ))
}

fn helm_install_body(args: &Value) -> Result<Value, AppError> {
    let name = validate_control_token(
        &required_arg_string(args, &["name"], "Helm release name")?,
        "Helm release name",
    )?;
    let namespace = helm_namespace(args)?;
    let chart = validate_control_token(
        &required_arg_string(args, &["chart"], "Helm chart")?,
        "Helm chart",
    )?;
    let repo = validate_proxmox_config_value(
        &required_arg_string(args, &["repo", "repository"], "Helm repository")?,
        "Helm repository",
    )?;
    let mut body = serde_json::Map::new();
    body.insert("name".into(), json!(name));
    body.insert("namespace".into(), json!(namespace));
    body.insert("chart".into(), json!(chart));
    body.insert("repo".into(), json!(repo));
    if let Some(version) = arg_string(args, &["version"]) {
        body.insert(
            "version".into(),
            json!(validate_control_token(&version, "Helm chart version")?),
        );
    }
    if let Some(values) = arg_string(args, &["values"]) {
        body.insert(
            "values".into(),
            json!(validate_multiline_control_value(&values, "Helm values")?),
        );
    }
    if let Some(atomic) = optional_arg_bool(args, &["atomic"]) {
        body.insert("atomic".into(), json!(atomic));
    }
    Ok(Value::Object(body))
}

fn helm_install_path(endpoint_id: i64, args: &Value) -> String {
    if optional_arg_bool(args, &["dry_run", "dryRun"]).unwrap_or(false) {
        format!("/endpoints/{endpoint_id}/kubernetes/helm?dryRun=true")
    } else {
        format!("/endpoints/{endpoint_id}/kubernetes/helm")
    }
}

fn helm_rollback_path(endpoint_id: i64, release: &str, args: &Value) -> Result<String, AppError> {
    let release = helm_release_name(endpoint_id, release)?;
    let namespace = helm_namespace(args)?;
    let revision = required_arg_u64(args, &["revision"], "Helm revision")?;
    let mut query = vec![
        format!("namespace={}", urlencoding::encode(&namespace)),
        format!("revision={revision}"),
    ];
    for (keys, name) in [
        (&["wait"][..], "wait"),
        (&["wait_for_jobs", "waitForJobs"][..], "waitForJobs"),
        (&["recreate"][..], "recreate"),
        (&["force"][..], "force"),
    ] {
        if let Some(value) = optional_arg_bool(args, keys) {
            query.push(format!("{name}={value}"));
        }
    }
    if let Some(timeout) = optional_arg_u64(args, &["timeout"]) {
        query.push(format!("timeout={timeout}"));
    }
    Ok(format!(
        "/endpoints/{endpoint_id}/kubernetes/helm/{}/rollback?{}",
        urlencoding::encode(&release),
        query.join("&")
    ))
}

fn aci_container_group_id(resource_id: &str) -> Result<String, AppError> {
    let clean = resource_id.trim();
    if clean.is_empty()
        || clean.len() > 1024
        || !clean.starts_with("/subscriptions/")
        || !clean.contains("/providers/Microsoft.ContainerInstance/containerGroups/")
        || clean.contains('\n')
        || clean.contains('\r')
        || clean.contains('\0')
    {
        return Err(AppError::BadRequest(
            "invalid ACI container group id".into(),
        ));
    }
    Ok(clean.to_string())
}

fn aci_resource_group_from_id(resource_id: &str) -> Option<String> {
    let parts = resource_id.split('/').collect::<Vec<_>>();
    parts.windows(2).find_map(|window| {
        if window[0].eq_ignore_ascii_case("resourceGroups") {
            Some(window[1].to_string())
        } else {
            None
        }
    })
}

fn aci_port_mappings(args: &Value) -> Result<(Vec<Value>, Vec<Value>), AppError> {
    let mut container_ports = Vec::new();
    let mut address_ports = Vec::new();
    for entry in arg_string_list(args, &["ports", "port_bindings"]) {
        let mut parts = entry.split(':').map(str::trim).collect::<Vec<_>>();
        if parts.is_empty() {
            continue;
        }
        let container = parts
            .pop()
            .filter(|value| !value.is_empty())
            .ok_or_else(|| AppError::BadRequest("ACI container port is required".into()))?;
        let (container, protocol) = container
            .split_once('/')
            .map(|(port, protocol)| (port.trim(), protocol.trim().to_ascii_uppercase()))
            .unwrap_or((container, "TCP".into()));
        if !matches!(protocol.as_str(), "TCP" | "UDP") {
            return Err(AppError::BadRequest(
                "ACI port protocol must be TCP or UDP".into(),
            ));
        }
        let container_port = container
            .parse::<u64>()
            .map_err(|_| AppError::BadRequest("ACI container port must be numeric".into()))?;
        let host_port = parts
            .pop()
            .filter(|value| !value.is_empty())
            .unwrap_or(container)
            .parse::<u64>()
            .map_err(|_| AppError::BadRequest("ACI host port must be numeric".into()))?;
        container_ports.push(json!({ "port": container_port }));
        address_ports.push(json!({ "port": host_port, "protocol": protocol }));
    }
    Ok((container_ports, address_ports))
}

fn aci_container_group_create_request(
    endpoint_id: i64,
    args: &Value,
) -> Result<(String, Value), AppError> {
    let subscription = validate_control_token(
        &required_arg_string(
            args,
            &["subscription_id", "subscription"],
            "ACI subscription id",
        )?,
        "ACI subscription id",
    )?;
    let resource_group = validate_proxmox_config_value(
        &required_arg_string(
            args,
            &["resource_group", "resourceGroup"],
            "ACI resource group",
        )?,
        "ACI resource group",
    )?;
    let name = validate_control_token(
        &required_arg_string(args, &["name"], "ACI container group name")?,
        "ACI container group name",
    )?;
    let location = validate_control_token(
        &required_arg_string(args, &["location"], "ACI location")?,
        "ACI location",
    )?;
    let image = validate_proxmox_config_value(
        &required_arg_string(args, &["image"], "ACI image")?,
        "ACI image",
    )?;
    let os = arg_string(args, &["os", "os_type", "osType"]).unwrap_or_else(|| "Linux".into());
    if !matches!(os.as_str(), "Linux" | "Windows") {
        return Err(AppError::BadRequest(
            "ACI OS must be Linux or Windows".into(),
        ));
    }
    let cpu = optional_arg_u64(args, &["cpu"]).unwrap_or(1).max(1);
    let memory = optional_arg_u64(args, &["memory", "memory_gb", "memoryInGB"])
        .unwrap_or(1)
        .max(1);
    let (container_ports, address_ports) = aci_port_mappings(args)?;
    let env = portainer_env_pairs(args)
        .into_iter()
        .map(|pair| {
            json!({
                "name": pair.get("name").cloned().unwrap_or(Value::Null),
                "value": pair.get("value").cloned().unwrap_or(Value::Null),
            })
        })
        .collect::<Vec<_>>();
    let ip_type = if optional_arg_bool(
        args,
        &["allocate_public_ip", "allocatePublicIP", "public_ip"],
    )
    .unwrap_or(true)
    {
        "Public"
    } else {
        "Private"
    };
    let body = json!({
        "location": location,
        "properties": {
            "osType": os,
            "containers": [{
                "name": name,
                "properties": {
                    "image": image,
                    "ports": container_ports,
                    "environmentVariables": env,
                    "resources": {
                        "requests": {
                            "cpu": cpu,
                            "memoryInGB": memory,
                        }
                    }
                }
            }],
            "ipAddress": {
                "type": ip_type,
                "ports": address_ports,
            }
        }
    });
    Ok((
        format!(
            "/endpoints/{endpoint_id}/azure/subscriptions/{}/resourceGroups/{}/providers/Microsoft.ContainerInstance/containerGroups/{}?api-version=2018-04-01",
            urlencoding::encode(&subscription),
            urlencoding::encode(&resource_group),
            urlencoding::encode(&name)
        ),
        body,
    ))
}

fn kubernetes_manifest_documents(args: &Value) -> Result<Vec<Value>, AppError> {
    let manifest = validate_multiline_control_value(
        &required_arg_string(
            args,
            &["manifest", "yaml", "content", "stack_file_content"],
            "Kubernetes manifest",
        )?,
        "Kubernetes manifest",
    )?;
    let mut docs = Vec::new();
    for document in serde_yaml::Deserializer::from_str(&manifest) {
        let value = Value::deserialize(document)
            .map_err(|e| AppError::BadRequest(format!("invalid Kubernetes manifest YAML: {e}")))?;
        if value.is_null() {
            continue;
        }
        if !value.is_object() {
            return Err(AppError::BadRequest(
                "Kubernetes manifest document must be an object".into(),
            ));
        }
        docs.push(value);
    }
    if docs.is_empty() {
        return Err(AppError::BadRequest("Kubernetes manifest is empty".into()));
    }
    Ok(docs)
}

fn kubernetes_manifest_name(document: &Value) -> Result<String, AppError> {
    let name = document
        .get("metadata")
        .and_then(|metadata| metadata.get("name"))
        .and_then(Value::as_str)
        .unwrap_or_default();
    validate_control_token(name, "Kubernetes manifest metadata.name")
}

fn kubernetes_manifest_namespace(document: &Value, args: &Value) -> Result<String, AppError> {
    let namespace = document
        .get("metadata")
        .and_then(|metadata| metadata.get("namespace"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|namespace| !namespace.is_empty())
        .map(ToOwned::to_owned)
        .or_else(|| arg_string(args, &["namespace"]))
        .unwrap_or_else(|| "default".into());
    validate_control_token(&namespace, "Kubernetes manifest namespace")
}

fn kubernetes_manifest_annotation<'a>(document: &'a Value, keys: &[&str]) -> Option<&'a str> {
    let annotations = document
        .get("metadata")
        .and_then(|metadata| metadata.get("annotations"))
        .and_then(Value::as_object)?;
    keys.iter()
        .find_map(|key| annotations.get(*key).and_then(Value::as_str))
        .map(str::trim)
        .filter(|value| !value.is_empty())
}

fn kubernetes_custom_resource_plural(document: &Value, kind: &str) -> Result<String, AppError> {
    if let Some(plural) = kubernetes_manifest_annotation(
        document,
        &[
            "clawcontrol.dev/plural",
            "clawcontrol.io/plural",
            "portainer.io/plural",
        ],
    ) {
        return validate_control_token(plural, "custom resource plural");
    }
    let mut plural = kind.to_ascii_lowercase();
    if plural.ends_with('y') {
        plural.pop();
        plural.push_str("ies");
    } else if plural.ends_with('s') {
        plural.push_str("es");
    } else {
        plural.push('s');
    }
    validate_control_token(&plural, "custom resource plural")
}

fn kubernetes_custom_resource_cluster_scoped(document: &Value, args: &Value) -> bool {
    if let Some(scope) = kubernetes_manifest_annotation(
        document,
        &[
            "clawcontrol.dev/scope",
            "clawcontrol.io/scope",
            "portainer.io/scope",
        ],
    ) {
        return scope.eq_ignore_ascii_case("cluster")
            || scope.eq_ignore_ascii_case("cluster-scoped");
    }
    optional_arg_bool(args, &["cluster_scoped", "clusterScoped"]).unwrap_or(false)
}

fn kubernetes_custom_resource_collection_path(
    endpoint_id: i64,
    document: &Value,
    args: &Value,
    kind: &str,
) -> Result<String, AppError> {
    let api_version = document
        .get("apiVersion")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| AppError::BadRequest("custom resource apiVersion is required".into()))?;
    let Some((group, version)) = api_version.split_once('/') else {
        return Err(AppError::BadRequest(format!(
            "unsupported Kubernetes manifest kind: {kind}"
        )));
    };
    let group = validate_control_token(group, "custom resource API group")?;
    let version = validate_control_token(version, "custom resource API version")?;
    let plural = kubernetes_custom_resource_plural(document, kind)?;
    if kubernetes_custom_resource_cluster_scoped(document, args) {
        Ok(format!(
            "/endpoints/{endpoint_id}/kubernetes/apis/{}/{}/{}",
            urlencoding::encode(&group),
            urlencoding::encode(&version),
            urlencoding::encode(&plural)
        ))
    } else {
        let namespace = kubernetes_manifest_namespace(document, args)?;
        Ok(format!(
            "/endpoints/{endpoint_id}/kubernetes/apis/{}/{}/namespaces/{}/{}",
            urlencoding::encode(&group),
            urlencoding::encode(&version),
            urlencoding::encode(&namespace),
            urlencoding::encode(&plural)
        ))
    }
}

fn kubernetes_manifest_collection_path(
    endpoint_id: i64,
    document: &Value,
    args: &Value,
) -> Result<String, AppError> {
    let kind = document
        .get("kind")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim();
    let _name = kubernetes_manifest_name(document)?;
    let namespace = || kubernetes_manifest_namespace(document, args);
    match kind {
        "Namespace" => Ok(format!("/endpoints/{endpoint_id}/kubernetes/api/v1/namespaces")),
        "Deployment" => Ok(format!(
            "/endpoints/{endpoint_id}/kubernetes/apis/apps/v1/namespaces/{}/deployments",
            urlencoding::encode(&namespace()?)
        )),
        "StatefulSet" => Ok(format!(
            "/endpoints/{endpoint_id}/kubernetes/apis/apps/v1/namespaces/{}/statefulsets",
            urlencoding::encode(&namespace()?)
        )),
        "DaemonSet" => Ok(format!(
            "/endpoints/{endpoint_id}/kubernetes/apis/apps/v1/namespaces/{}/daemonsets",
            urlencoding::encode(&namespace()?)
        )),
        "Pod" => Ok(format!(
            "/endpoints/{endpoint_id}/kubernetes/api/v1/namespaces/{}/pods",
            urlencoding::encode(&namespace()?)
        )),
        "Service" => Ok(format!(
            "/endpoints/{endpoint_id}/kubernetes/api/v1/namespaces/{}/services",
            urlencoding::encode(&namespace()?)
        )),
        "Ingress" => Ok(format!(
            "/endpoints/{endpoint_id}/kubernetes/apis/networking.k8s.io/v1/namespaces/{}/ingresses",
            urlencoding::encode(&namespace()?)
        )),
        "ConfigMap" => Ok(format!(
            "/endpoints/{endpoint_id}/kubernetes/api/v1/namespaces/{}/configmaps",
            urlencoding::encode(&namespace()?)
        )),
        "Secret" => Ok(format!(
            "/endpoints/{endpoint_id}/kubernetes/api/v1/namespaces/{}/secrets",
            urlencoding::encode(&namespace()?)
        )),
        "ServiceAccount" => Ok(format!(
            "/endpoints/{endpoint_id}/kubernetes/api/v1/namespaces/{}/serviceaccounts",
            urlencoding::encode(&namespace()?)
        )),
        "LimitRange" => Ok(format!(
            "/endpoints/{endpoint_id}/kubernetes/api/v1/namespaces/{}/limitranges",
            urlencoding::encode(&namespace()?)
        )),
        "ResourceQuota" => Ok(format!(
            "/endpoints/{endpoint_id}/kubernetes/api/v1/namespaces/{}/resourcequotas",
            urlencoding::encode(&namespace()?)
        )),
        "PersistentVolumeClaim" => Ok(format!(
            "/endpoints/{endpoint_id}/kubernetes/api/v1/namespaces/{}/persistentvolumeclaims",
            urlencoding::encode(&namespace()?)
        )),
        "PersistentVolume" => Ok(format!(
            "/endpoints/{endpoint_id}/kubernetes/api/v1/persistentvolumes"
        )),
        "StorageClass" => Ok(format!(
            "/endpoints/{endpoint_id}/kubernetes/apis/storage.k8s.io/v1/storageclasses"
        )),
        "Role" => Ok(format!(
            "/endpoints/{endpoint_id}/kubernetes/apis/rbac.authorization.k8s.io/v1/namespaces/{}/roles",
            urlencoding::encode(&namespace()?)
        )),
        "RoleBinding" => Ok(format!(
            "/endpoints/{endpoint_id}/kubernetes/apis/rbac.authorization.k8s.io/v1/namespaces/{}/rolebindings",
            urlencoding::encode(&namespace()?)
        )),
        "ClusterRole" => Ok(format!(
            "/endpoints/{endpoint_id}/kubernetes/apis/rbac.authorization.k8s.io/v1/clusterroles"
        )),
        "ClusterRoleBinding" => Ok(format!(
            "/endpoints/{endpoint_id}/kubernetes/apis/rbac.authorization.k8s.io/v1/clusterrolebindings"
        )),
        "NetworkPolicy" => Ok(format!(
            "/endpoints/{endpoint_id}/kubernetes/apis/networking.k8s.io/v1/namespaces/{}/networkpolicies",
            urlencoding::encode(&namespace()?)
        )),
        "HorizontalPodAutoscaler" => Ok(format!(
            "/endpoints/{endpoint_id}/kubernetes/apis/autoscaling/v2/namespaces/{}/horizontalpodautoscalers",
            urlencoding::encode(&namespace()?)
        )),
        "Job" => Ok(format!(
            "/endpoints/{endpoint_id}/kubernetes/apis/batch/v1/namespaces/{}/jobs",
            urlencoding::encode(&namespace()?)
        )),
        "CronJob" => Ok(format!(
            "/endpoints/{endpoint_id}/kubernetes/apis/batch/v1/namespaces/{}/cronjobs",
            urlencoding::encode(&namespace()?)
        )),
        "PodDisruptionBudget" => Ok(format!(
            "/endpoints/{endpoint_id}/kubernetes/apis/policy/v1/namespaces/{}/poddisruptionbudgets",
            urlencoding::encode(&namespace()?)
        )),
        "CustomResourceDefinition" => Ok(format!(
            "/endpoints/{endpoint_id}/kubernetes/apis/apiextensions.k8s.io/v1/customresourcedefinitions"
        )),
        _ => kubernetes_custom_resource_collection_path(endpoint_id, document, args, kind),
    }
}

fn kubernetes_manifest_resource_path(
    endpoint_id: i64,
    document: &Value,
    args: &Value,
) -> Result<String, AppError> {
    let collection = kubernetes_manifest_collection_path(endpoint_id, document, args)?;
    let name = kubernetes_manifest_name(document)?;
    Ok(format!("{}/{}", collection, urlencoding::encode(&name)))
}

fn kubernetes_apply_strategy(
    args: &Value,
    default: &'static str,
) -> Result<&'static str, AppError> {
    match arg_string(args, &["apply_strategy", "strategy"])
        .unwrap_or_else(|| default.into())
        .as_str()
    {
        "create" => Ok("create"),
        "replace" | "update" => Ok("replace"),
        "upsert" | "apply" => Ok("upsert"),
        _ => Err(AppError::BadRequest(
            "Kubernetes apply strategy must be create, replace, or upsert".into(),
        )),
    }
}

fn kubernetes_manifest_for_replace(mut document: Value, existing: &Value) -> Value {
    let Some(document_object) = document.as_object_mut() else {
        return document;
    };
    let metadata = document_object
        .entry("metadata")
        .or_insert_with(|| json!({}));
    let Some(metadata_object) = metadata.as_object_mut() else {
        return document;
    };
    if metadata_object.get("resourceVersion").is_none() {
        if let Some(resource_version) = existing
            .get("metadata")
            .and_then(|value| value.get("resourceVersion"))
            .cloned()
        {
            metadata_object.insert("resourceVersion".into(), resource_version);
        }
    }
    if metadata_object.get("namespace").is_none() {
        if let Some(namespace) = existing
            .get("metadata")
            .and_then(|value| value.get("namespace"))
            .cloned()
        {
            metadata_object.insert("namespace".into(), namespace);
        }
    }
    document
}

fn kubernetes_json_pointer_escape(value: &str) -> String {
    value.replace('~', "~0").replace('/', "~1")
}

fn kubernetes_manifest_sanitized_for_diff(value: &Value) -> Value {
    let mut clean = value.clone();
    if let Some(object) = clean.as_object_mut() {
        object.remove("status");
        if let Some(metadata) = object.get_mut("metadata").and_then(Value::as_object_mut) {
            for key in [
                "creationTimestamp",
                "generation",
                "managedFields",
                "resourceVersion",
                "selfLink",
                "uid",
            ] {
                metadata.remove(key);
            }
            if metadata.is_empty() {
                object.remove("metadata");
            }
        }
    }
    clean
}

fn collect_json_diff_paths(desired: &Value, existing: &Value, path: &str, out: &mut Vec<String>) {
    if out.len() >= 40 || desired == existing {
        return;
    }
    match (desired, existing) {
        (Value::Object(desired_map), Value::Object(existing_map)) => {
            let mut keys = desired_map
                .keys()
                .chain(existing_map.keys())
                .collect::<Vec<_>>();
            keys.sort();
            keys.dedup();
            for key in keys {
                let child_path = format!("{}/{}", path, kubernetes_json_pointer_escape(key));
                match (desired_map.get(key), existing_map.get(key)) {
                    (Some(desired_child), Some(existing_child)) => {
                        collect_json_diff_paths(desired_child, existing_child, &child_path, out);
                    }
                    _ => out.push(child_path),
                }
                if out.len() >= 40 {
                    break;
                }
            }
        }
        (Value::Array(desired_array), Value::Array(existing_array)) => {
            let max_len = desired_array.len().max(existing_array.len());
            for index in 0..max_len {
                let child_path = format!("{path}/{index}");
                match (desired_array.get(index), existing_array.get(index)) {
                    (Some(desired_child), Some(existing_child)) => {
                        collect_json_diff_paths(desired_child, existing_child, &child_path, out);
                    }
                    _ => out.push(child_path),
                }
                if out.len() >= 40 {
                    break;
                }
            }
        }
        _ => out.push(if path.is_empty() {
            "/".into()
        } else {
            path.into()
        }),
    }
}

fn kubernetes_manifest_diff_preview(document: &Value, existing: Option<&Value>) -> Value {
    let Some(existing) = existing else {
        return json!({
            "exists": false,
            "diffStatus": "create",
            "changeCount": Value::Null,
            "changedPaths": [],
        });
    };
    let desired = kubernetes_manifest_sanitized_for_diff(&kubernetes_manifest_for_replace(
        document.clone(),
        existing,
    ));
    let live = kubernetes_manifest_sanitized_for_diff(existing);
    let mut changed_paths = Vec::new();
    collect_json_diff_paths(&desired, &live, "", &mut changed_paths);
    json!({
        "exists": true,
        "diffStatus": if changed_paths.is_empty() { "unchanged" } else { "replace" },
        "changeCount": changed_paths.len(),
        "changedPaths": changed_paths,
        "liveResourceVersion": existing.get("metadata").and_then(|metadata| metadata.get("resourceVersion")).cloned().unwrap_or(Value::Null),
    })
}

fn kubernetes_manifest_preview(
    endpoint_id: i64,
    docs: &[Value],
    args: &Value,
    strategy: &str,
    existing_by_path: &HashMap<String, Option<Value>>,
) -> Result<Value, AppError> {
    let mut resources = Vec::new();
    for document in docs {
        let kind = document
            .get("kind")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .trim()
            .to_string();
        let name = kubernetes_manifest_name(document)?;
        let namespace = match kind.as_str() {
            "Namespace"
            | "PersistentVolume"
            | "StorageClass"
            | "ClusterRole"
            | "ClusterRoleBinding"
            | "CustomResourceDefinition" => None,
            _ if kubernetes_custom_resource_cluster_scoped(document, args) => None,
            _ => Some(kubernetes_manifest_namespace(document, args)?),
        };
        let resource_path = kubernetes_manifest_resource_path(endpoint_id, document, args)?;
        let existing = existing_by_path
            .get(&resource_path)
            .and_then(|value| value.as_ref());
        let diff = kubernetes_manifest_diff_preview(document, existing);
        resources.push(json!({
            "kind": kind,
            "name": name,
            "namespace": namespace,
            "strategy": strategy,
            "collectionPath": kubernetes_manifest_collection_path(endpoint_id, document, args)?,
            "resourcePath": resource_path,
            "diff": diff,
        }));
    }
    Ok(json!({
        "strategy": strategy,
        "resources": resources,
        "resourceCount": resources.len(),
    }))
}

fn kubernetes_metadata(
    name: &str,
    namespace: Option<&str>,
    args: &Value,
) -> Result<Value, AppError> {
    let mut metadata = serde_json::Map::new();
    metadata.insert(
        "name".into(),
        json!(validate_control_token(name, "Kubernetes resource name")?),
    );
    if let Some(namespace) = namespace {
        metadata.insert(
            "namespace".into(),
            json!(validate_control_token(namespace, "Kubernetes namespace")?),
        );
    }
    let labels = arg_string_map(args, &["labels"]);
    if !labels.is_empty() {
        metadata.insert("labels".into(), Value::Object(labels));
    }
    let annotations = arg_string_map(args, &["annotations"]);
    if !annotations.is_empty() {
        metadata.insert("annotations".into(), Value::Object(annotations));
    }
    Ok(Value::Object(metadata))
}

fn kubernetes_app_kind(args: &Value) -> Result<&'static str, AppError> {
    match arg_string(args, &["kind"])
        .unwrap_or_else(|| "Deployment".into())
        .as_str()
    {
        "Deployment" | "deployment" => Ok("Deployment"),
        "StatefulSet" | "statefulset" => Ok("StatefulSet"),
        "DaemonSet" | "daemonset" => Ok("DaemonSet"),
        _ => Err(AppError::BadRequest(
            "application kind must be Deployment, StatefulSet, or DaemonSet".into(),
        )),
    }
}

fn kubernetes_port_u64(args: &Value, keys: &[&str], default: u64) -> Result<u64, AppError> {
    let port = optional_arg_u64(args, keys).unwrap_or(default);
    if !(1..=65_535).contains(&port) {
        return Err(AppError::BadRequest(
            "Kubernetes port is out of range".into(),
        ));
    }
    Ok(port)
}

fn kubernetes_create_manifest_documents(
    action: &str,
    args: &Value,
) -> Result<Vec<Value>, AppError> {
    match action {
        "create-kubernetes-namespace" => {
            let name = required_arg_string(args, &["name", "namespace"], "namespace")?;
            Ok(vec![json!({
                "apiVersion": "v1",
                "kind": "Namespace",
                "metadata": kubernetes_metadata(&name, None, args)?,
            })])
        }
        "create-kubernetes-application" => {
            let name = required_arg_string(args, &["name", "application"], "application name")?;
            let namespace = kubernetes_namespace(args)?;
            let image = validate_proxmox_config_value(
                &required_arg_string(args, &["image"], "image")?,
                "image",
            )?;
            let replicas = optional_arg_u64(args, &["replicas"])
                .unwrap_or(1)
                .min(10_000);
            let kind = kubernetes_app_kind(args)?;
            let app_label = validate_control_token(&name, "application label")?;
            let port = optional_arg_u64(args, &["container_port", "containerPort", "port"])
                .filter(|port| (1..=65_535).contains(port));
            let mut container = json!({
                "name": app_label,
                "image": image,
            });
            if let Some(port) = port {
                container["ports"] = json!([{ "containerPort": port }]);
            }
            let mut spec = serde_json::Map::new();
            if kind != "DaemonSet" {
                spec.insert("replicas".into(), json!(replicas));
            }
            spec.insert(
                "selector".into(),
                json!({ "matchLabels": { "app": app_label } }),
            );
            spec.insert(
                "template".into(),
                json!({
                    "metadata": { "labels": { "app": app_label } },
                    "spec": { "containers": [container] },
                }),
            );
            Ok(vec![json!({
                "apiVersion": "apps/v1",
                "kind": kind,
                "metadata": kubernetes_metadata(&name, Some(&namespace), args)?,
                "spec": spec,
            })])
        }
        "create-kubernetes-service" => {
            let name = required_arg_string(args, &["name", "service"], "service name")?;
            let namespace = kubernetes_namespace(args)?;
            let selector = validate_control_token(
                &arg_string(args, &["selector", "app"]).unwrap_or_else(|| name.clone()),
                "service selector",
            )?;
            let port = kubernetes_port_u64(args, &["port"], 80)?;
            let target_port = kubernetes_port_u64(args, &["target_port", "targetPort"], port)?;
            let service_type = validate_control_token(
                &arg_string(args, &["service_type", "type"]).unwrap_or_else(|| "ClusterIP".into()),
                "service type",
            )?;
            Ok(vec![json!({
                "apiVersion": "v1",
                "kind": "Service",
                "metadata": kubernetes_metadata(&name, Some(&namespace), args)?,
                "spec": {
                    "type": service_type,
                    "selector": { "app": selector },
                    "ports": [{ "port": port, "targetPort": target_port }],
                },
            })])
        }
        "create-kubernetes-ingress" => {
            let name = required_arg_string(args, &["name", "ingress"], "ingress name")?;
            let namespace = kubernetes_namespace(args)?;
            let host = validate_proxmox_config_value(
                &required_arg_string(args, &["host"], "host")?,
                "host",
            )?;
            let service = validate_control_token(
                &required_arg_string(args, &["service", "service_name"], "service")?,
                "service",
            )?;
            let service_port = kubernetes_port_u64(args, &["service_port", "port"], 80)?;
            let path = validate_proxmox_config_value(
                &arg_string(args, &["path"]).unwrap_or_else(|| "/".into()),
                "ingress path",
            )?;
            let mut spec = json!({
                "rules": [{
                    "host": host,
                    "http": {
                        "paths": [{
                            "path": path,
                            "pathType": "Prefix",
                            "backend": {
                                "service": {
                                    "name": service,
                                    "port": { "number": service_port },
                                },
                            },
                        }],
                    },
                }],
            });
            if let Some(class_name) = arg_string(args, &["class_name", "ingressClassName"]) {
                spec["ingressClassName"] =
                    json!(validate_control_token(&class_name, "ingress class")?);
            }
            Ok(vec![json!({
                "apiVersion": "networking.k8s.io/v1",
                "kind": "Ingress",
                "metadata": kubernetes_metadata(&name, Some(&namespace), args)?,
                "spec": spec,
            })])
        }
        "create-kubernetes-configmap" => {
            let name = required_arg_string(args, &["name", "configmap"], "configmap name")?;
            let namespace = kubernetes_namespace(args)?;
            let data = arg_string_map(args, &["data"]);
            if data.is_empty() {
                return Err(AppError::BadRequest("configmap data is required".into()));
            }
            Ok(vec![json!({
                "apiVersion": "v1",
                "kind": "ConfigMap",
                "metadata": kubernetes_metadata(&name, Some(&namespace), args)?,
                "data": data,
            })])
        }
        "create-kubernetes-secret" => {
            let name = required_arg_string(args, &["name", "secret"], "secret name")?;
            let namespace = kubernetes_namespace(args)?;
            let data = arg_string_map(args, &["data", "stringData"]);
            if data.is_empty() {
                return Err(AppError::BadRequest("secret data is required".into()));
            }
            let secret_type = validate_proxmox_config_value(
                &arg_string(args, &["secret_type", "type"]).unwrap_or_else(|| "Opaque".into()),
                "secret type",
            )?;
            Ok(vec![json!({
                "apiVersion": "v1",
                "kind": "Secret",
                "metadata": kubernetes_metadata(&name, Some(&namespace), args)?,
                "type": secret_type,
                "stringData": data,
            })])
        }
        "create-kubernetes-volume" => {
            let name = required_arg_string(args, &["name", "volume", "pvc"], "volume name")?;
            let namespace = kubernetes_namespace(args)?;
            let size = validate_proxmox_config_value(
                &arg_string(args, &["size", "capacity"]).unwrap_or_else(|| "1Gi".into()),
                "volume size",
            )?;
            let access_mode = validate_control_token(
                &arg_string(args, &["access_mode", "accessMode"])
                    .unwrap_or_else(|| "ReadWriteOnce".into()),
                "access mode",
            )?;
            let mut spec = json!({
                "accessModes": [access_mode],
                "resources": { "requests": { "storage": size } },
            });
            if let Some(storage_class) = arg_string(args, &["storage_class", "storageClassName"]) {
                spec["storageClassName"] =
                    json!(validate_control_token(&storage_class, "storage class")?);
            }
            Ok(vec![json!({
                "apiVersion": "v1",
                "kind": "PersistentVolumeClaim",
                "metadata": kubernetes_metadata(&name, Some(&namespace), args)?,
                "spec": spec,
            })])
        }
        _ => Err(AppError::BadRequest(format!(
            "unsupported Kubernetes create action: {action}"
        ))),
    }
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

fn portainer_name_body(args: &Value, label: &str, create: bool) -> Result<Value, AppError> {
    let mut body = serde_json::Map::new();
    if let Some(name) = arg_string(args, &["name"]) {
        body.insert(
            "Name".into(),
            json!(validate_proxmox_config_value(&name, label)?),
        );
    } else if create {
        return Err(AppError::BadRequest(format!("{label} is required")));
    }
    if body.is_empty() {
        return Err(AppError::BadRequest(format!("{label} update is empty")));
    }
    Ok(Value::Object(body))
}

fn portainer_user_body(args: &Value, create: bool) -> Result<Value, AppError> {
    let mut body = serde_json::Map::new();
    if let Some(username) = arg_string(args, &["username", "name"]) {
        body.insert(
            "Username".into(),
            json!(validate_proxmox_config_value(
                &username,
                "Portainer username"
            )?),
        );
    } else if create {
        return Err(AppError::BadRequest(
            "Portainer username is required".into(),
        ));
    }
    if let Some(password) = arg_string(args, &["password"]) {
        let password = password.trim();
        if password.is_empty() {
            return Err(AppError::BadRequest(
                "Portainer password is required".into(),
            ));
        }
        body.insert("Password".into(), json!(password));
    } else if create {
        return Err(AppError::BadRequest(
            "Portainer password is required".into(),
        ));
    }
    if let Some(role) = optional_arg_u64(args, &["role"]) {
        if !matches!(role, 1 | 2) {
            return Err(AppError::BadRequest(
                "Portainer user role must be 1 (administrator) or 2 (standard)".into(),
            ));
        }
        body.insert("Role".into(), json!(role));
    } else if create {
        body.insert("Role".into(), json!(2));
    }
    if body.is_empty() {
        return Err(AppError::BadRequest(
            "Portainer user update is empty".into(),
        ));
    }
    Ok(Value::Object(body))
}

fn portainer_team_body(args: &Value, create: bool) -> Result<Value, AppError> {
    let mut body = serde_json::Map::new();
    if let Some(name) = arg_string(args, &["name"]) {
        body.insert(
            "Name".into(),
            json!(validate_proxmox_config_value(&name, "Portainer team name")?),
        );
    } else if create {
        return Err(AppError::BadRequest(
            "Portainer team name is required".into(),
        ));
    }
    if body.is_empty() {
        return Err(AppError::BadRequest(
            "Portainer team update is empty".into(),
        ));
    }
    Ok(Value::Object(body))
}

fn portainer_custom_template_variables(args: &Value) -> Result<Option<Value>, AppError> {
    for key in ["variables", "Variables"] {
        if let Some(value) = args.get(key) {
            return match value {
                Value::Array(_) => Ok(Some(value.clone())),
                Value::String(text) if text.trim().is_empty() => Ok(None),
                Value::String(text) => {
                    let parsed = serde_json::from_str::<Value>(text.trim()).map_err(|_| {
                        AppError::BadRequest(
                            "custom template variables must be a JSON array".into(),
                        )
                    })?;
                    if parsed.is_array() {
                        Ok(Some(parsed))
                    } else {
                        Err(AppError::BadRequest(
                            "custom template variables must be a JSON array".into(),
                        ))
                    }
                }
                _ => Err(AppError::BadRequest(
                    "custom template variables must be a JSON array".into(),
                )),
            };
        }
    }
    Ok(None)
}

fn portainer_custom_template_body(args: &Value, create: bool) -> Result<Value, AppError> {
    let mut body = serde_json::Map::new();
    if let Some(title) = arg_string(args, &["title", "name", "Title"]) {
        body.insert(
            "Title".into(),
            json!(validate_proxmox_config_value(
                &title,
                "custom template title"
            )?),
        );
    } else if create {
        return Err(AppError::BadRequest(
            "custom template title is required".into(),
        ));
    }
    if let Some(template_type) = optional_arg_u64(args, &["type", "template_type", "Type"]) {
        if !(1..=3).contains(&template_type) {
            return Err(AppError::BadRequest(
                "custom template type must be 1 (swarm), 2 (compose), or 3 (kubernetes)".into(),
            ));
        }
        body.insert("Type".into(), json!(template_type));
    } else if create {
        body.insert("Type".into(), json!(2));
    }
    if let Some(platform) = optional_arg_u64(args, &["platform", "Platform"]) {
        if !(1..=2).contains(&platform) {
            return Err(AppError::BadRequest(
                "custom template platform must be 1 (linux) or 2 (windows)".into(),
            ));
        }
        body.insert("Platform".into(), json!(platform));
    } else if create {
        body.insert("Platform".into(), json!(1));
    }
    if let Some(file_content) = arg_string(
        args,
        &[
            "file_content",
            "fileContent",
            "FileContent",
            "stack_file_content",
        ],
    ) {
        body.insert(
            "FileContent".into(),
            json!(validate_multiline_control_value(
                &file_content,
                "custom template file content"
            )?),
        );
    } else if create {
        return Err(AppError::BadRequest(
            "custom template file content is required".into(),
        ));
    }
    if let Some(description) = arg_string(args, &["description", "Description"]) {
        body.insert(
            "Description".into(),
            json!(validate_proxmox_config_value(
                &description,
                "custom template description"
            )?),
        );
    }
    if let Some(note) = arg_string(args, &["note", "Note"]) {
        body.insert(
            "Note".into(),
            json!(validate_multiline_control_value(
                &note,
                "custom template note"
            )?),
        );
    }
    if let Some(logo) = arg_string(args, &["logo", "Logo"]) {
        body.insert(
            "Logo".into(),
            json!(validate_proxmox_config_value(
                &logo,
                "custom template logo"
            )?),
        );
    }
    if let Some(edge_template) =
        optional_arg_bool(args, &["edge_template", "edgeTemplate", "EdgeTemplate"])
    {
        body.insert("EdgeTemplate".into(), json!(edge_template));
    }
    if let Some(is_compose_format) = optional_arg_bool(
        args,
        &["is_compose_format", "isComposeFormat", "IsComposeFormat"],
    ) {
        body.insert("IsComposeFormat".into(), json!(is_compose_format));
    }
    if let Some(variables) = portainer_custom_template_variables(args)? {
        body.insert("Variables".into(), variables);
    }
    if body.is_empty() {
        return Err(AppError::BadRequest(
            "custom template update is empty".into(),
        ));
    }
    Ok(Value::Object(body))
}

fn value_u64(value: &Value, keys: &[&str]) -> Option<u64> {
    keys.iter().find_map(|key| {
        value.get(*key).and_then(|value| {
            value
                .as_u64()
                .or_else(|| value.as_i64().and_then(|number| u64::try_from(number).ok()))
                .or_else(|| value.as_str()?.trim().parse::<u64>().ok())
        })
    })
}

fn value_bool(value: &Value, keys: &[&str]) -> Option<bool> {
    keys.iter().find_map(|key| {
        value.get(*key).and_then(|value| {
            value.as_bool().or_else(|| match value.as_str()?.trim() {
                "1" | "true" | "TRUE" | "True" | "yes" | "YES" | "Yes" => Some(true),
                "0" | "false" | "FALSE" | "False" | "no" | "NO" | "No" => Some(false),
                _ => None,
            })
        })
    })
}

fn portainer_template_file_content(value: Value) -> Result<String, AppError> {
    value
        .get("FileContent")
        .or_else(|| value.get("StackFileContent"))
        .or_else(|| value.get("fileContent"))
        .and_then(Value::as_str)
        .map(str::to_string)
        .filter(|content| !content.trim().is_empty())
        .ok_or_else(|| AppError::BadRequest("template file content is missing".into()))
}

fn portainer_template_env(args: &Value, template: Option<&Value>) -> Vec<Value> {
    let supplied = portainer_env_pairs(args);
    if !supplied.is_empty() {
        return supplied;
    }
    template
        .and_then(|template| template.get("env").or_else(|| template.get("Env")))
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| {
                    let name = item
                        .get("name")
                        .or_else(|| item.get("Name"))
                        .and_then(Value::as_str)
                        .map(str::trim)
                        .filter(|name| !name.is_empty())?;
                    let value = item
                        .get("default")
                        .or_else(|| item.get("Default"))
                        .or_else(|| item.get("value"))
                        .or_else(|| item.get("Value"))
                        .and_then(Value::as_str)
                        .unwrap_or_default();
                    Some(json!({ "name": name, "value": value }))
                })
                .collect()
        })
        .unwrap_or_default()
}

fn portainer_template_env_strings(args: &Value, template: Option<&Value>) -> Vec<String> {
    let supplied = arg_string_list(args, &["env", "environment"]);
    if !supplied.is_empty() {
        return supplied;
    }
    portainer_template_env(args, template)
        .into_iter()
        .filter_map(|pair| {
            let name = pair.get("name").and_then(Value::as_str)?;
            let value = pair
                .get("value")
                .and_then(Value::as_str)
                .unwrap_or_default();
            Some(format!("{name}={value}"))
        })
        .collect()
}

fn portainer_template_stack_request(
    endpoint_id: i64,
    name: &str,
    content: &str,
    args: &Value,
    template: Option<&Value>,
    default_kind: &str,
    from_app_template: bool,
) -> Result<(String, Value), AppError> {
    let stack_name = validate_control_token(name, "stack name")?;
    let stack_file_content = validate_multiline_control_value(content, "template stack content")?;
    let stack_kind = arg_string(args, &["stack_kind", "stackKind", "kind"])
        .unwrap_or_else(|| default_kind.to_string());
    let mut body = serde_json::Map::new();
    body.insert("Name".into(), json!(stack_name));
    body.insert("StackFileContent".into(), json!(stack_file_content));
    body.insert("Env".into(), json!(portainer_template_env(args, template)));
    body.insert("FromAppTemplate".into(), json!(from_app_template));
    let target_path = match stack_kind.as_str() {
        "standalone" | "compose" | "docker" => {
            format!("/stacks/create/standalone/string?endpointId={endpoint_id}")
        }
        "swarm" => {
            let swarm_id = validate_control_token(
                &required_arg_string(args, &["swarm_id", "swarmId", "SwarmID"], "swarm id")?,
                "swarm id",
            )?;
            body.insert("SwarmID".into(), json!(swarm_id));
            format!("/stacks/create/swarm/string?endpointId={endpoint_id}")
        }
        _ => {
            return Err(AppError::BadRequest(
                "template stack kind must be standalone, compose, docker, or swarm".into(),
            ));
        }
    };
    Ok((target_path, Value::Object(body)))
}

async fn portainer_app_template(
    config: &PortainerInstanceConfig,
    template_id: &str,
) -> Result<Value, AppError> {
    let templates = portainer_get(config, "/templates").await.map_err(|e| {
        AppError::Internal(anyhow::anyhow!("Portainer app template lookup failed: {e}"))
    })?;
    let rows = templates
        .get("templates")
        .and_then(Value::as_array)
        .cloned()
        .or_else(|| templates.as_array().cloned())
        .unwrap_or_default();
    rows.into_iter()
        .find(|template| {
            value_string(template, &["id", "Id"])
                .map(|id| id == template_id)
                .unwrap_or(false)
        })
        .ok_or_else(|| AppError::BadRequest("Portainer app template not found".into()))
}

async fn portainer_app_template_file(
    config: &PortainerInstanceConfig,
    template_id: &str,
) -> Result<String, AppError> {
    let response = insecure_client()
        .post(format!(
            "{}/api/templates/{}/file",
            config.url,
            urlencoding::encode(template_id)
        ))
        .header("X-API-Key", &config.token)
        .send()
        .await
        .map_err(|e| {
            AppError::Internal(anyhow::anyhow!("Portainer app template file failed: {e}"))
        })?;
    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(AppError::BadRequest(format!(
            "Portainer app template file failed ({status}): {text}"
        )));
    }
    portainer_template_file_content(response.json::<Value>().await.unwrap_or_else(|_| json!({})))
}

async fn portainer_custom_template_file(
    config: &PortainerInstanceConfig,
    template_id: &str,
) -> Result<String, AppError> {
    portainer_get(
        config,
        &format!(
            "/custom_templates/{}/file",
            urlencoding::encode(template_id)
        ),
    )
    .await
    .map_err(|e| {
        AppError::Internal(anyhow::anyhow!(
            "Portainer custom template file failed: {e}"
        ))
    })
    .and_then(portainer_template_file_content)
}

fn optional_portainer_setting_u64(
    args: &Value,
    keys: &[&str],
    label: &str,
    min: u64,
    max: u64,
) -> Result<Option<u64>, AppError> {
    for key in keys {
        if let Some(value) = args.get(*key) {
            let parsed = value
                .as_u64()
                .or_else(|| value.as_str()?.trim().parse::<u64>().ok())
                .ok_or_else(|| AppError::BadRequest(format!("{label} must be a number")))?;
            if parsed < min || parsed > max {
                return Err(AppError::BadRequest(format!("{label} is out of range")));
            }
            return Ok(Some(parsed));
        }
    }
    Ok(None)
}

fn optional_portainer_setting_bool(
    args: &Value,
    keys: &[&str],
    label: &str,
) -> Result<Option<bool>, AppError> {
    for key in keys {
        if let Some(value) = args.get(*key) {
            let parsed = value.as_bool().or_else(|| match value.as_str()?.trim() {
                "1" | "true" | "TRUE" | "True" | "yes" | "YES" | "Yes" => Some(true),
                "0" | "false" | "FALSE" | "False" | "no" | "NO" | "No" => Some(false),
                _ => None,
            });
            return parsed
                .map(Some)
                .ok_or_else(|| AppError::BadRequest(format!("{label} must be true or false")));
        }
    }
    Ok(None)
}

fn optional_portainer_setting_string(
    args: &Value,
    keys: &[&str],
    label: &str,
) -> Result<Option<String>, AppError> {
    for key in keys {
        if let Some(value) = args.get(*key) {
            let clean = value
                .as_str()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .ok_or_else(|| AppError::BadRequest(format!("{label} is required")))?;
            if clean.len() > 2048 || clean.contains('\n') || clean.contains('\r') {
                return Err(AppError::BadRequest(format!("invalid {label}")));
            }
            return Ok(Some(clean.to_string()));
        }
    }
    Ok(None)
}

fn optional_portainer_setting_timeout(
    args: &Value,
    keys: &[&str],
) -> Result<Option<Value>, AppError> {
    for key in keys {
        if let Some(value) = args.get(*key) {
            if let Some(number) = value.as_u64() {
                return Ok(Some(json!(number)));
            }
            let clean = value
                .as_str()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .ok_or_else(|| AppError::BadRequest("user session timeout is required".into()))?;
            if clean.len() > 128 || clean.contains('\n') || clean.contains('\r') {
                return Err(AppError::BadRequest("invalid user session timeout".into()));
            }
            return Ok(Some(json!(clean)));
        }
    }
    Ok(None)
}

fn portainer_settings_update_body(current: Value, args: &Value) -> Result<Value, AppError> {
    let mut body = current
        .as_object()
        .cloned()
        .ok_or_else(|| AppError::BadRequest("Portainer settings response is invalid".into()))?;
    let mut changed = false;

    if let Some(value) = optional_portainer_setting_u64(
        args,
        &[
            "edge_agent_checkin_interval",
            "edgeAgentCheckinInterval",
            "EdgeAgentCheckinInterval",
        ],
        "edge agent check-in interval",
        1,
        2_592_000,
    )? {
        body.insert("EdgeAgentCheckinInterval".into(), json!(value));
        changed = true;
    }
    if let Some(value) = optional_portainer_setting_u64(
        args,
        &["snapshot_interval", "snapshotInterval", "SnapshotInterval"],
        "snapshot interval",
        1,
        2_592_000,
    )? {
        body.insert("SnapshotInterval".into(), json!(value));
        changed = true;
    }
    if let Some(value) = optional_portainer_setting_bool(
        args,
        &[
            "enable_edge_compute_features",
            "enableEdgeComputeFeatures",
            "EnableEdgeComputeFeatures",
        ],
        "enable edge compute features",
    )? {
        body.insert("EnableEdgeComputeFeatures".into(), json!(value));
        changed = true;
    }
    if let Some(value) = optional_portainer_setting_bool(
        args,
        &["enable_telemetry", "enableTelemetry", "EnableTelemetry"],
        "enable telemetry",
    )? {
        body.insert("EnableTelemetry".into(), json!(value));
        changed = true;
    }
    if let Some(value) =
        optional_portainer_setting_string(args, &["logo_url", "logoUrl", "LogoURL"], "logo URL")?
    {
        body.insert("LogoURL".into(), json!(value));
        changed = true;
    }
    if let Some(value) = optional_portainer_setting_string(
        args,
        &["templates_url", "templatesUrl", "TemplatesURL"],
        "templates URL",
    )? {
        body.insert("TemplatesURL".into(), json!(value));
        changed = true;
    }
    if let Some(value) = optional_portainer_setting_timeout(
        args,
        &[
            "user_session_timeout",
            "userSessionTimeout",
            "UserSessionTimeout",
        ],
    )? {
        body.insert("UserSessionTimeout".into(), value);
        changed = true;
    }

    if !changed {
        return Err(AppError::BadRequest(
            "Portainer settings update is empty".into(),
        ));
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

fn portainer_container_logs_path(
    endpoint_id: i64,
    resource_id: &str,
    tail: u64,
    follow: bool,
) -> String {
    let follow_param = if follow { "&follow=1" } else { "" };
    format!(
        "/endpoints/{endpoint_id}/docker/containers/{}/logs?stdout=1&stderr=1&timestamps=1&tail={tail}{follow_param}",
        urlencoding::encode(resource_id)
    )
}

fn portainer_docker_events_path(
    endpoint_id: i64,
    since: Option<u64>,
    until: Option<u64>,
    filters: Option<&str>,
) -> String {
    let mut query = Vec::new();
    if let Some(since) = since {
        query.push(format!("since={since}"));
    }
    if let Some(until) = until {
        query.push(format!("until={until}"));
    }
    if let Some(filters) = filters {
        query.push(format!("filters={filters}"));
    }
    if query.is_empty() {
        format!("/endpoints/{endpoint_id}/docker/events")
    } else {
        format!("/endpoints/{endpoint_id}/docker/events?{}", query.join("&"))
    }
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

fn drain_docker_multiplex_stream(buffer: &mut Vec<u8>, chunk: &[u8]) -> String {
    buffer.extend_from_slice(chunk);
    if buffer.len() < 8 {
        if !matches!(buffer.first().copied(), Some(1 | 2)) {
            let plain = String::from_utf8_lossy(buffer).to_string();
            buffer.clear();
            return plain;
        }
        return String::new();
    }
    if !matches!(buffer[0], 1 | 2) {
        let plain = String::from_utf8_lossy(buffer).to_string();
        buffer.clear();
        return plain;
    }

    let mut out = Vec::new();
    let mut offset = 0usize;
    while offset + 8 <= buffer.len() {
        let stream = buffer[offset];
        let size = u32::from_be_bytes([
            buffer[offset + 4],
            buffer[offset + 5],
            buffer[offset + 6],
            buffer[offset + 7],
        ]) as usize;
        if !matches!(stream, 1 | 2) {
            break;
        }
        if offset + 8 + size > buffer.len() {
            break;
        }
        out.extend_from_slice(&buffer[offset + 8..offset + 8 + size]);
        offset += 8 + size;
    }
    if offset > 0 {
        buffer.drain(0..offset);
    }
    String::from_utf8_lossy(&out).to_string()
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

fn normalize_proxmox_create_disk_size(value: &str) -> Result<String, AppError> {
    let clean = value.trim();
    let upper = clean.to_ascii_uppercase();
    let normalized = upper
        .strip_suffix("GIB")
        .or_else(|| upper.strip_suffix("GB"))
        .or_else(|| upper.strip_suffix('G'))
        .unwrap_or(&upper)
        .trim();
    let gib = normalized.parse::<u64>().map_err(|_| {
        AppError::BadRequest("create disk size must be a positive GiB number".into())
    })?;
    if gib == 0 {
        return Err(AppError::BadRequest(
            "create disk size must be a positive GiB number".into(),
        ));
    }
    Ok(gib.to_string())
}

fn normalize_proxmox_disk_allocation_config(value: &str) -> String {
    let Some((storage, size)) = value.trim().split_once(':') else {
        return value.to_string();
    };
    if size.contains(',') || size.contains('/') {
        return value.to_string();
    }
    match normalize_proxmox_create_disk_size(size) {
        Ok(normalized) => format!("{storage}:{normalized}"),
        Err(_) => value.to_string(),
    }
}

fn validate_proxmox_task_upid(value: &str) -> Result<String, AppError> {
    let clean = value.trim();
    if clean.is_empty() || clean.len() > 512 || !clean.starts_with("UPID:") {
        return Err(AppError::BadRequest("invalid task UPID".into()));
    }
    if !clean.chars().all(|c| {
        c.is_ascii_alphanumeric()
            || matches!(c, '_' | '-' | '.' | ':' | '+' | '/' | '=' | '@' | '!')
    }) {
        return Err(AppError::BadRequest("invalid task UPID".into()));
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

    if resource_type == "endpoint"
        && (matches!(
            action,
            "apply-kubernetes-manifest" | "preview-kubernetes-manifest"
        ) || action.starts_with("create-kubernetes-"))
    {
        let endpoint_id = resource_id
            .parse::<i64>()
            .map_err(|_| AppError::BadRequest("endpoint id must be numeric".into()))?;
        let docs = if matches!(
            action,
            "apply-kubernetes-manifest" | "preview-kubernetes-manifest"
        ) {
            kubernetes_manifest_documents(args)?
        } else {
            kubernetes_create_manifest_documents(action, args)?
        };
        let strategy = if matches!(
            action,
            "apply-kubernetes-manifest" | "preview-kubernetes-manifest"
        ) {
            kubernetes_apply_strategy(args, "upsert")?
        } else {
            kubernetes_apply_strategy(args, "create")?
        };
        let client = insecure_client();
        if action == "preview-kubernetes-manifest" {
            let mut existing_by_path = HashMap::new();
            for document in &docs {
                let kind = document
                    .get("kind")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string();
                let name = kubernetes_manifest_name(document)?;
                let resource_path = kubernetes_manifest_resource_path(endpoint_id, document, args)?;
                let response = client
                    .get(format!("{}/api{}", config.url, resource_path))
                    .header("X-API-Key", &config.token)
                    .send()
                    .await
                    .map_err(|e| {
                        AppError::Internal(anyhow::anyhow!(
                            "Portainer Kubernetes manifest preview lookup failed: {e}"
                        ))
                    })?;
                if response.status().is_success() {
                    existing_by_path.insert(
                        resource_path,
                        Some(response.json::<Value>().await.unwrap_or_else(|_| json!({}))),
                    );
                } else if response.status() == reqwest::StatusCode::NOT_FOUND {
                    existing_by_path.insert(resource_path, None);
                } else {
                    let status = response.status();
                    let text = response.text().await.unwrap_or_default();
                    return Err(AppError::BadRequest(format!(
                        "Portainer Kubernetes manifest preview lookup failed for {kind}/{name} ({status}): {text}"
                    )));
                }
            }
            return Ok(json!({
                "mode": "portainer-api",
                "instance_id": config.id,
                "resource_type": resource_type,
                "resource_id": resource_id,
                "action": action,
                "response": kubernetes_manifest_preview(endpoint_id, &docs, args, strategy, &existing_by_path)?,
            }));
        }
        let mut responses = Vec::new();
        for document in docs {
            let name = kubernetes_manifest_name(&document)?;
            let kind = document
                .get("kind")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string();
            let target_path = kubernetes_manifest_collection_path(endpoint_id, &document, args)?;
            let resource_path = kubernetes_manifest_resource_path(endpoint_id, &document, args)?;
            let (method, response) = if strategy == "create" {
                (
                    "create",
                    client
                        .post(format!("{}/api{}", config.url, target_path))
                        .header("X-API-Key", &config.token)
                        .json(&document)
                        .send()
                        .await,
                )
            } else if strategy == "replace" {
                (
                    "replace",
                    client
                        .put(format!("{}/api{}", config.url, resource_path))
                        .header("X-API-Key", &config.token)
                        .json(&document)
                        .send()
                        .await,
                )
            } else {
                let existing_response = client
                    .get(format!("{}/api{}", config.url, resource_path))
                    .header("X-API-Key", &config.token)
                    .send()
                    .await
                    .map_err(|e| {
                        AppError::Internal(anyhow::anyhow!(
                            "Portainer Kubernetes manifest lookup failed: {e}"
                        ))
                    })?;
                if existing_response.status().is_success() {
                    let existing = existing_response
                        .json::<Value>()
                        .await
                        .unwrap_or_else(|_| json!({}));
                    let replacement = kubernetes_manifest_for_replace(document, &existing);
                    (
                        "replace",
                        client
                            .put(format!("{}/api{}", config.url, resource_path))
                            .header("X-API-Key", &config.token)
                            .json(&replacement)
                            .send()
                            .await,
                    )
                } else if existing_response.status() == reqwest::StatusCode::NOT_FOUND {
                    (
                        "create",
                        client
                            .post(format!("{}/api{}", config.url, target_path))
                            .header("X-API-Key", &config.token)
                            .json(&document)
                            .send()
                            .await,
                    )
                } else {
                    let status = existing_response.status();
                    let text = existing_response.text().await.unwrap_or_default();
                    return Err(AppError::BadRequest(format!(
                        "Portainer Kubernetes manifest lookup failed for {kind}/{name} ({status}): {text}"
                    )));
                }
            };
            let response = response.map_err(|e| {
                AppError::Internal(anyhow::anyhow!(
                    "Portainer Kubernetes manifest deploy failed: {e}"
                ))
            })?;
            if !response.status().is_success() {
                let status = response.status();
                let text = response.text().await.unwrap_or_default();
                return Err(AppError::BadRequest(format!(
                    "Portainer Kubernetes manifest deploy failed for {kind}/{name} ({status}): {text}"
                )));
            }
            responses.push(json!({
                "kind": kind,
                "name": name,
                "method": method,
                "response": response.json::<Value>().await.unwrap_or_else(|_| json!({})),
            }));
        }
        return Ok(json!({
            "mode": "portainer-api",
            "instance_id": config.id,
            "resource_type": resource_type,
            "resource_id": resource_id,
            "action": action,
            "response": {
                "applied": responses.len(),
                "strategy": strategy,
                "resources": responses,
            },
        }));
    }

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

    if resource_type == "endpoint" && action == "create-service" {
        let endpoint_id = resource_id
            .parse::<i64>()
            .map_err(|_| AppError::BadRequest("endpoint id must be numeric".into()))?;
        let body = portainer_service_spec(args, true)?;
        let client = insecure_client();
        let create_url = format!(
            "{}/api/endpoints/{endpoint_id}/docker/services/create",
            config.url
        );
        let create_response = client
            .post(create_url)
            .header("X-API-Key", &config.token)
            .json(&body)
            .send()
            .await
            .map_err(|e| {
                AppError::Internal(anyhow::anyhow!("Portainer service create failed: {e}"))
            })?;
        if !create_response.status().is_success() {
            let status = create_response.status();
            let text = create_response.text().await.unwrap_or_default();
            return Err(AppError::BadRequest(format!(
                "Portainer service create failed ({status}): {text}"
            )));
        }
        let data = create_response
            .json::<Value>()
            .await
            .unwrap_or_else(|_| json!({}));
        return Ok(json!({
            "mode": "portainer-api",
            "instance_id": config.id,
            "resource_type": resource_type,
            "resource_id": resource_id,
            "action": action,
            "response": data,
        }));
    }

    if resource_type == "swarm-service" && matches!(action, "update-service" | "rollback-service") {
        let endpoint_id = endpoint_id
            .ok_or_else(|| AppError::BadRequest("service update requires endpoint_id".into()))?;
        let client = insecure_client();
        let inspect_url = format!(
            "{}/api/endpoints/{endpoint_id}/docker/services/{}",
            config.url,
            urlencoding::encode(resource_id)
        );
        let inspect_response = client
            .get(inspect_url)
            .header("X-API-Key", &config.token)
            .send()
            .await
            .map_err(|e| {
                AppError::Internal(anyhow::anyhow!("Portainer service inspect failed: {e}"))
            })?;
        if !inspect_response.status().is_success() {
            let status = inspect_response.status();
            let text = inspect_response.text().await.unwrap_or_default();
            return Err(AppError::BadRequest(format!(
                "Portainer service inspect failed ({status}): {text}"
            )));
        }
        let inspect = inspect_response
            .json::<Value>()
            .await
            .unwrap_or_else(|_| json!({}));
        let version = inspect
            .get("Version")
            .and_then(|version| version.get("Index"))
            .and_then(Value::as_u64)
            .ok_or_else(|| AppError::BadRequest("Portainer service version is missing".into()))?;
        let mut spec = inspect
            .get("Spec")
            .cloned()
            .ok_or_else(|| AppError::BadRequest("Portainer service spec is missing".into()))?;
        if action == "update-service" {
            mutate_portainer_service_spec(&mut spec, args)?;
        }
        let rollback = if action == "rollback-service" {
            "&rollback=previous"
        } else {
            ""
        };
        let update_url = format!(
            "{}/api/endpoints/{endpoint_id}/docker/services/{}/update?version={version}{rollback}",
            config.url,
            urlencoding::encode(resource_id)
        );
        let update_response = client
            .post(update_url)
            .header("X-API-Key", &config.token)
            .json(&spec)
            .send()
            .await
            .map_err(|e| {
                AppError::Internal(anyhow::anyhow!("Portainer service {action} failed: {e}"))
            })?;
        if !update_response.status().is_success() {
            let status = update_response.status();
            let text = update_response.text().await.unwrap_or_default();
            return Err(AppError::BadRequest(format!(
                "Portainer service {action} failed ({status}): {text}"
            )));
        }
        let data = update_response
            .json::<Value>()
            .await
            .unwrap_or_else(|_| json!({}));
        return Ok(json!({
            "mode": "portainer-api",
            "instance_id": config.id,
            "resource_type": resource_type,
            "resource_id": resource_id,
            "action": action,
            "response": data,
        }));
    }

    if resource_type == "swarm-service" && action == "scale-service" {
        let endpoint_id = endpoint_id
            .ok_or_else(|| AppError::BadRequest("service scale requires endpoint_id".into()))?;
        let replicas = required_arg_u64(args, &["replicas", "scale"], "replicas")?;
        let client = insecure_client();
        let inspect_url = format!(
            "{}/api/endpoints/{endpoint_id}/docker/services/{}",
            config.url,
            urlencoding::encode(resource_id)
        );
        let inspect_response = client
            .get(inspect_url)
            .header("X-API-Key", &config.token)
            .send()
            .await
            .map_err(|e| {
                AppError::Internal(anyhow::anyhow!("Portainer service inspect failed: {e}"))
            })?;
        if !inspect_response.status().is_success() {
            let status = inspect_response.status();
            let text = inspect_response.text().await.unwrap_or_default();
            return Err(AppError::BadRequest(format!(
                "Portainer service inspect failed ({status}): {text}"
            )));
        }
        let inspect = inspect_response
            .json::<Value>()
            .await
            .unwrap_or_else(|_| json!({}));
        let version = inspect
            .get("Version")
            .and_then(|version| version.get("Index"))
            .and_then(Value::as_u64)
            .ok_or_else(|| AppError::BadRequest("Portainer service version is missing".into()))?;
        let mut spec = inspect
            .get("Spec")
            .cloned()
            .ok_or_else(|| AppError::BadRequest("Portainer service spec is missing".into()))?;
        let spec_object = spec
            .as_object_mut()
            .ok_or_else(|| AppError::BadRequest("Portainer service spec is invalid".into()))?;
        spec_object.insert(
            "Mode".into(),
            json!({ "Replicated": { "Replicas": replicas } }),
        );
        let update_url = format!(
            "{}/api/endpoints/{endpoint_id}/docker/services/{}/update?version={version}",
            config.url,
            urlencoding::encode(resource_id)
        );
        let update_response = client
            .post(update_url)
            .header("X-API-Key", &config.token)
            .json(&spec)
            .send()
            .await
            .map_err(|e| {
                AppError::Internal(anyhow::anyhow!("Portainer service scale failed: {e}"))
            })?;
        if !update_response.status().is_success() {
            let status = update_response.status();
            let text = update_response.text().await.unwrap_or_default();
            return Err(AppError::BadRequest(format!(
                "Portainer service scale failed ({status}): {text}"
            )));
        }
        let data = update_response
            .json::<Value>()
            .await
            .unwrap_or_else(|_| json!({}));
        return Ok(json!({
            "mode": "portainer-api",
            "instance_id": config.id,
            "resource_type": resource_type,
            "resource_id": resource_id,
            "action": action,
            "response": data,
        }));
    }

    if resource_type == "swarm-node" && action == "update-node-availability" {
        let endpoint_id = endpoint_id.ok_or_else(|| {
            AppError::BadRequest("node availability update requires endpoint_id".into())
        })?;
        let availability =
            match required_arg_string(args, &["availability"], "availability")?.as_str() {
                "active" | "pause" | "drain" => {
                    required_arg_string(args, &["availability"], "availability")?
                }
                _ => {
                    return Err(AppError::BadRequest(
                        "availability must be active, pause, or drain".into(),
                    ));
                }
            };
        let client = insecure_client();
        let inspect_url = format!(
            "{}/api/endpoints/{endpoint_id}/docker/nodes/{}",
            config.url,
            urlencoding::encode(resource_id)
        );
        let inspect_response = client
            .get(inspect_url)
            .header("X-API-Key", &config.token)
            .send()
            .await
            .map_err(|e| {
                AppError::Internal(anyhow::anyhow!("Portainer node inspect failed: {e}"))
            })?;
        if !inspect_response.status().is_success() {
            let status = inspect_response.status();
            let text = inspect_response.text().await.unwrap_or_default();
            return Err(AppError::BadRequest(format!(
                "Portainer node inspect failed ({status}): {text}"
            )));
        }
        let inspect = inspect_response
            .json::<Value>()
            .await
            .unwrap_or_else(|_| json!({}));
        let version = inspect
            .get("Version")
            .and_then(|version| version.get("Index"))
            .and_then(Value::as_u64)
            .ok_or_else(|| AppError::BadRequest("Portainer node version is missing".into()))?;
        let mut spec = inspect
            .get("Spec")
            .cloned()
            .ok_or_else(|| AppError::BadRequest("Portainer node spec is missing".into()))?;
        let spec_object = spec
            .as_object_mut()
            .ok_or_else(|| AppError::BadRequest("Portainer node spec is invalid".into()))?;
        spec_object.insert("Availability".into(), json!(availability));
        let update_url = format!(
            "{}/api/endpoints/{endpoint_id}/docker/nodes/{}/update?version={version}",
            config.url,
            urlencoding::encode(resource_id)
        );
        let update_response = client
            .post(update_url)
            .header("X-API-Key", &config.token)
            .json(&spec)
            .send()
            .await
            .map_err(|e| {
                AppError::Internal(anyhow::anyhow!(
                    "Portainer node availability update failed: {e}"
                ))
            })?;
        if !update_response.status().is_success() {
            let status = update_response.status();
            let text = update_response.text().await.unwrap_or_default();
            return Err(AppError::BadRequest(format!(
                "Portainer node availability update failed ({status}): {text}"
            )));
        }
        let data = update_response
            .json::<Value>()
            .await
            .unwrap_or_else(|_| json!({}));
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
            "{}",
            portainer_container_logs_path(endpoint_id, resource_id, 200, false)
        ),
        ("container", "inspect", Some(endpoint_id)) => format!(
            "/endpoints/{endpoint_id}/docker/containers/{}/json",
            urlencoding::encode(resource_id)
        ),
        ("container", "stats", Some(endpoint_id)) => format!(
            "/endpoints/{endpoint_id}/docker/containers/{}/stats?stream=false",
            urlencoding::encode(resource_id)
        ),
        ("container", "processes", Some(endpoint_id)) => format!(
            "/endpoints/{endpoint_id}/docker/containers/{}/top",
            urlencoding::encode(resource_id)
        ),
        ("container", "changes", Some(endpoint_id)) => format!(
            "/endpoints/{endpoint_id}/docker/containers/{}/changes",
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
                "events" => {
                    let now = SystemTime::now()
                        .duration_since(UNIX_EPOCH)
                        .map(|duration| duration.as_secs())
                        .unwrap_or(0);
                    let until = optional_arg_u64(args, &["until"]).unwrap_or(now);
                    let since = optional_arg_u64(args, &["since"])
                        .unwrap_or_else(|| until.saturating_sub(3600));
                    portainer_docker_events_path(
                        endpoint_id,
                        Some(since),
                        Some(until),
                        docker_event_filters_query(args)?.as_deref(),
                    )
                }
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
                "install-helm-chart" => {
                    request_body = Some(helm_install_body(args)?);
                    helm_install_path(endpoint_id, args)
                }
                "create-aci-container-group" => {
                    let (path, body) = aci_container_group_create_request(endpoint_id, args)?;
                    request_body = Some(body);
                    path
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
        ("swarm-service", "inspect-service", Some(endpoint_id)) => format!(
            "/endpoints/{endpoint_id}/docker/services/{}",
            urlencoding::encode(resource_id)
        ),
        ("swarm-service", "service-logs", Some(endpoint_id)) => format!(
            "/endpoints/{endpoint_id}/docker/services/{}/logs?stdout=1&stderr=1&timestamps=1&tail={}",
            urlencoding::encode(resource_id),
            optional_arg_u64(args, &["tail"]).unwrap_or(200).min(5000)
        ),
        ("swarm-service", "remove-service", Some(endpoint_id)) => format!(
            "/endpoints/{endpoint_id}/docker/services/{}",
            urlencoding::encode(resource_id)
        ),
        ("swarm-node", "inspect-node", Some(endpoint_id)) => format!(
            "/endpoints/{endpoint_id}/docker/nodes/{}",
            urlencoding::encode(resource_id)
        ),
        ("swarm-task", "inspect-task", Some(endpoint_id)) => format!(
            "/endpoints/{endpoint_id}/docker/tasks/{}",
            urlencoding::encode(resource_id)
        ),
        ("swarm-task", "task-logs", Some(endpoint_id)) => format!(
            "/endpoints/{endpoint_id}/docker/tasks/{}/logs?stdout=1&stderr=1&timestamps=1&tail={}",
            urlencoding::encode(resource_id),
            optional_arg_u64(args, &["tail"]).unwrap_or(200).min(5000)
        ),
        ("kubernetes-namespace", "inspect-kubernetes-namespace", Some(endpoint_id))
        | ("kubernetes-namespace", "delete-kubernetes-namespace", Some(endpoint_id)) => {
            let name = kubernetes_resource_name(resource_id)?;
            format!(
                "/endpoints/{endpoint_id}/kubernetes/api/v1/namespaces/{}",
                urlencoding::encode(&name)
            )
        }
        ("kubernetes-application", "inspect-kubernetes-application", Some(endpoint_id))
        | ("kubernetes-application", "delete-kubernetes-application", Some(endpoint_id)) => {
            let namespace = kubernetes_namespace(args)?;
            let plural = kubernetes_application_plural(args)?;
            let name = kubernetes_resource_name(resource_id)?;
            format!(
                "/endpoints/{endpoint_id}/kubernetes/apis/apps/v1/namespaces/{}/{}/{}",
                urlencoding::encode(&namespace),
                plural,
                urlencoding::encode(&name)
            )
        }
        ("kubernetes-pod", "inspect-kubernetes-pod", Some(endpoint_id))
        | ("kubernetes-pod", "delete-kubernetes-pod", Some(endpoint_id)) => {
            let namespace = kubernetes_namespace(args)?;
            let name = kubernetes_resource_name(resource_id)?;
            format!(
                "/endpoints/{endpoint_id}/kubernetes/api/v1/namespaces/{}/pods/{}",
                urlencoding::encode(&namespace),
                urlencoding::encode(&name)
            )
        }
        ("kubernetes-pod", "kubernetes-pod-logs", Some(endpoint_id)) => {
            let namespace = kubernetes_namespace(args)?;
            let name = kubernetes_resource_name(resource_id)?;
            format!(
                "/endpoints/{endpoint_id}/kubernetes/api/v1/namespaces/{}/pods/{}/log?timestamps=true&tailLines={}",
                urlencoding::encode(&namespace),
                urlencoding::encode(&name),
                optional_arg_u64(args, &["tail"]).unwrap_or(200).min(5000)
            )
        }
        ("kubernetes-service", "inspect-kubernetes-service", Some(endpoint_id))
        | ("kubernetes-service", "delete-kubernetes-service", Some(endpoint_id)) => {
            let namespace = kubernetes_namespace(args)?;
            let name = kubernetes_resource_name(resource_id)?;
            format!(
                "/endpoints/{endpoint_id}/kubernetes/api/v1/namespaces/{}/services/{}",
                urlencoding::encode(&namespace),
                urlencoding::encode(&name)
            )
        }
        ("kubernetes-ingress", "inspect-kubernetes-ingress", Some(endpoint_id))
        | ("kubernetes-ingress", "delete-kubernetes-ingress", Some(endpoint_id)) => {
            let namespace = kubernetes_namespace(args)?;
            let name = kubernetes_resource_name(resource_id)?;
            format!(
                "/endpoints/{endpoint_id}/kubernetes/apis/networking.k8s.io/v1/namespaces/{}/ingresses/{}",
                urlencoding::encode(&namespace),
                urlencoding::encode(&name)
            )
        }
        ("kubernetes-configmap", "inspect-kubernetes-configmap", Some(endpoint_id))
        | ("kubernetes-configmap", "delete-kubernetes-configmap", Some(endpoint_id)) => {
            let namespace = kubernetes_namespace(args)?;
            let name = kubernetes_resource_name(resource_id)?;
            format!(
                "/endpoints/{endpoint_id}/kubernetes/api/v1/namespaces/{}/configmaps/{}",
                urlencoding::encode(&namespace),
                urlencoding::encode(&name)
            )
        }
        ("kubernetes-secret", "inspect-kubernetes-secret", Some(endpoint_id))
        | ("kubernetes-secret", "delete-kubernetes-secret", Some(endpoint_id)) => {
            let namespace = kubernetes_namespace(args)?;
            let name = kubernetes_resource_name(resource_id)?;
            format!(
                "/endpoints/{endpoint_id}/kubernetes/api/v1/namespaces/{}/secrets/{}",
                urlencoding::encode(&namespace),
                urlencoding::encode(&name)
            )
        }
        ("kubernetes-volume", "inspect-kubernetes-volume", Some(endpoint_id))
        | ("kubernetes-volume", "delete-kubernetes-volume", Some(endpoint_id)) => {
            let name = kubernetes_resource_name(resource_id)?;
            let kind = arg_string(args, &["kind"]).unwrap_or_else(|| "PersistentVolumeClaim".into());
            if kind == "PersistentVolume" {
                format!(
                    "/endpoints/{endpoint_id}/kubernetes/api/v1/persistentvolumes/{}",
                    urlencoding::encode(&name)
                )
            } else {
                let namespace = kubernetes_namespace(args)?;
                format!(
                    "/endpoints/{endpoint_id}/kubernetes/api/v1/namespaces/{}/persistentvolumeclaims/{}",
                    urlencoding::encode(&namespace),
                    urlencoding::encode(&name)
                )
            }
        }
        ("kubernetes-crd", "inspect-kubernetes-crd", Some(endpoint_id)) => {
            let name = kubernetes_resource_name(resource_id)?;
            format!(
                "/endpoints/{endpoint_id}/kubernetes/apis/apiextensions.k8s.io/v1/customresourcedefinitions/{}",
                urlencoding::encode(&name)
            )
        }
        ("helm-release", "inspect-helm-release", Some(endpoint_id)) => {
            helm_release_path(endpoint_id, resource_id, args, None)?
        }
        ("helm-release", "helm-release-history", Some(endpoint_id)) => {
            helm_release_path(endpoint_id, resource_id, args, Some("/history"))?
        }
        ("helm-release", "rollback-helm-release", Some(endpoint_id)) => {
            helm_rollback_path(endpoint_id, resource_id, args)?
        }
        ("helm-release", "uninstall-helm-release", Some(endpoint_id)) => {
            helm_release_path(endpoint_id, resource_id, args, None)?
        }
        ("aci-container-group", "inspect-aci-container-group", Some(endpoint_id))
        | ("aci-container-group", "delete-aci-container-group", Some(endpoint_id)) => {
            let id = aci_container_group_id(resource_id)?;
            format!("/endpoints/{endpoint_id}/azure{id}?api-version=2018-04-01")
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
        ("endpoint-group", "create-endpoint-group", _) => {
            request_body = Some(portainer_name_body(args, "Portainer endpoint group name", true)?);
            "/endpoint_groups".to_string()
        }
        ("endpoint-group", "update-endpoint-group", _) => {
            request_body = Some(portainer_name_body(args, "Portainer endpoint group name", false)?);
            format!("/endpoint_groups/{}", urlencoding::encode(resource_id))
        }
        ("endpoint-group", "inspect-endpoint-group", _) => {
            format!("/endpoint_groups/{}", urlencoding::encode(resource_id))
        }
        ("endpoint-group", "remove-endpoint-group", _) | ("endpoint-group", "delete", _) => {
            format!("/endpoint_groups/{}", urlencoding::encode(resource_id))
        }
        ("tag", "create-tag", _) => {
            request_body = Some(portainer_name_body(args, "Portainer tag name", true)?);
            "/tags".to_string()
        }
        ("tag", "update-tag", _) => {
            request_body = Some(portainer_name_body(args, "Portainer tag name", false)?);
            format!("/tags/{}", urlencoding::encode(resource_id))
        }
        ("tag", "inspect-tag", _) => {
            format!("/tags/{}", urlencoding::encode(resource_id))
        }
        ("tag", "remove-tag", _) | ("tag", "delete", _) => {
            format!("/tags/{}", urlencoding::encode(resource_id))
        }
        ("user", "create-user", _) => {
            request_body = Some(portainer_user_body(args, true)?);
            "/users".to_string()
        }
        ("user", "update-user", _) => {
            request_body = Some(portainer_user_body(args, false)?);
            format!("/users/{}", urlencoding::encode(resource_id))
        }
        ("user", "inspect-user", _) => {
            format!("/users/{}", urlencoding::encode(resource_id))
        }
        ("user", "remove-user", _) | ("user", "delete", _) => {
            format!("/users/{}", urlencoding::encode(resource_id))
        }
        ("team", "create-team", _) => {
            request_body = Some(portainer_team_body(args, true)?);
            "/teams".to_string()
        }
        ("team", "update-team", _) => {
            request_body = Some(portainer_team_body(args, false)?);
            format!("/teams/{}", urlencoding::encode(resource_id))
        }
        ("team", "inspect-team", _) => {
            format!("/teams/{}", urlencoding::encode(resource_id))
        }
        ("team", "remove-team", _) | ("team", "delete", _) => {
            format!("/teams/{}", urlencoding::encode(resource_id))
        }
        ("app-template", "app-template-file", _) => {
            format!("/templates/{}/file", urlencoding::encode(resource_id))
        }
        ("app-template", "deploy-app-template", _) => {
            let endpoint_id = endpoint_id.ok_or_else(|| {
                AppError::BadRequest("app template deployment requires endpoint_id".into())
            })?;
            let template = portainer_app_template(&config, resource_id).await?;
            let template_type = optional_arg_u64(args, &["type", "template_type", "templateType"])
                .or_else(|| value_u64(&template, &["type", "Type"]))
                .unwrap_or(1);
            let name = arg_string(args, &["name", "stack", "container"])
                .or_else(|| value_string(&template, &["name", "Name", "title", "Title"]))
                .ok_or_else(|| AppError::BadRequest("template deployment name is required".into()))?;
            if template_type == 1 {
                let image = arg_string(args, &["image"])
                    .or_else(|| value_string(&template, &["image", "Image"]))
                    .ok_or_else(|| {
                        AppError::BadRequest("container app template image is required".into())
                    })?;
                let restart_policy = arg_string(args, &["restart_policy", "policy"])
                    .or_else(|| value_string(&template, &["restart_policy", "RestartPolicy"]))
                    .map(|value| validate_restart_policy(&value))
                    .transpose()?
                    .unwrap_or_else(|| "unless-stopped".into());
                let mut host_config = serde_json::Map::new();
                host_config.insert(
                    "RestartPolicy".into(),
                    json!({ "Name": restart_policy, "MaximumRetryCount": 0 }),
                );
                if value_bool(&template, &["privileged", "Privileged"])
                    .or_else(|| optional_arg_bool(args, &["privileged"]))
                    .unwrap_or(false)
                {
                    host_config.insert("Privileged".into(), json!(true));
                }
                if let Some(network_mode) = arg_string(args, &["network", "network_mode"])
                    .or_else(|| value_string(&template, &["network", "Network"]))
                {
                    host_config.insert(
                        "NetworkMode".into(),
                        json!(validate_control_token(&network_mode, "network mode")?),
                    );
                }
                let env = portainer_template_env_strings(args, Some(&template));
                let labels = arg_string_map(args, &["labels"]);
                let ports = docker_exposed_ports(args);
                if !ports.1.is_empty() {
                    host_config.insert("PortBindings".into(), Value::Object(ports.1));
                }
                let mut body = serde_json::Map::new();
                body.insert(
                    "Image".into(),
                    json!(validate_proxmox_config_value(&image, "image")?),
                );
                if !env.is_empty() {
                    body.insert("Env".into(), json!(env));
                }
                if !labels.is_empty() {
                    body.insert("Labels".into(), Value::Object(labels));
                }
                if !ports.0.is_empty() {
                    body.insert("ExposedPorts".into(), Value::Object(ports.0));
                }
                if let Some(cmd) = arg_string(&template, &["command", "Command"]) {
                    body.insert("Cmd".into(), json!(docker_command(&json!({ "command": cmd }))));
                }
                body.insert("HostConfig".into(), Value::Object(host_config));
                request_body = Some(Value::Object(body));
                format!(
                    "/endpoints/{endpoint_id}/docker/containers/create?name={}",
                    urlencoding::encode(&validate_control_token(&name, "container name")?)
                )
            } else if matches!(template_type, 2 | 3) {
                let content = portainer_app_template_file(&config, resource_id).await?;
                let default_kind = if template_type == 2 { "swarm" } else { "standalone" };
                let (path, body) = portainer_template_stack_request(
                    endpoint_id,
                    &name,
                    &content,
                    args,
                    Some(&template),
                    default_kind,
                    true,
                )?;
                request_body = Some(body);
                path
            } else {
                return Err(AppError::BadRequest(
                    "app template type must be 1 (container), 2 (swarm stack), or 3 (compose stack)"
                        .into(),
                ));
            }
        }
        ("custom-template", "deploy-custom-template", _) => {
            let endpoint_id = endpoint_id.ok_or_else(|| {
                AppError::BadRequest("custom template deployment requires endpoint_id".into())
            })?;
            let template = portainer_get(
                &config,
                &format!("/custom_templates/{}", urlencoding::encode(resource_id)),
            )
            .await
            .ok();
            let template_type = optional_arg_u64(args, &["type", "template_type", "templateType"])
                .or_else(|| template.as_ref().and_then(|value| value_u64(value, &["Type", "type"])))
                .unwrap_or(2);
            if template_type == 3 {
                return Err(AppError::BadRequest(
                    "Kubernetes custom template deployment requires the manifest editor".into(),
                ));
            }
            let name = arg_string(args, &["name", "stack"])
                .or_else(|| {
                    template
                        .as_ref()
                        .and_then(|value| value_string(value, &["Title", "title"]))
                })
                .ok_or_else(|| AppError::BadRequest("template stack name is required".into()))?;
            let content = if let Some(content) = arg_string(
                args,
                &["file_content", "fileContent", "FileContent", "stack_file_content"],
            ) {
                validate_multiline_control_value(&content, "template stack content")?
            } else {
                portainer_custom_template_file(&config, resource_id).await?
            };
            let default_kind = if template_type == 1 { "swarm" } else { "standalone" };
            let (path, body) = portainer_template_stack_request(
                endpoint_id,
                &name,
                &content,
                args,
                template.as_ref(),
                default_kind,
                false,
            )?;
            request_body = Some(body);
            path
        }
        ("custom-template", "create-custom-template", _) => {
            request_body = Some(portainer_custom_template_body(args, true)?);
            "/custom_templates/create/string".to_string()
        }
        ("custom-template", "update-custom-template", _) => {
            request_body = Some(portainer_custom_template_body(args, false)?);
            format!("/custom_templates/{}", urlencoding::encode(resource_id))
        }
        ("custom-template", "inspect-custom-template", _) => {
            format!("/custom_templates/{}", urlencoding::encode(resource_id))
        }
        ("custom-template", "custom-template-file", _) => {
            format!("/custom_templates/{}/file", urlencoding::encode(resource_id))
        }
        ("custom-template", "remove-custom-template", _) | ("custom-template", "delete", _) => {
            format!("/custom_templates/{}", urlencoding::encode(resource_id))
        }
        ("settings", "inspect-settings", _) => "/settings".to_string(),
        ("settings", "update-settings", _) => {
            let current = portainer_get(&config, "/settings").await.map_err(|e| {
                AppError::Internal(anyhow::anyhow!("Portainer settings lookup failed: {e}"))
            })?;
            request_body = Some(portainer_settings_update_body(current, args)?);
            "/settings".to_string()
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
        ("container", "logs" | "inspect" | "stats" | "processes" | "changes")
        | ("endpoint", "inspect-endpoint" | "events")
        | ("image", "inspect-image" | "history-image")
        | ("volume", "inspect-volume")
        | ("network", "inspect-network")
        | ("swarm-service", "inspect-service" | "service-logs")
        | ("swarm-node", "inspect-node")
        | ("swarm-task", "inspect-task" | "task-logs")
        | ("kubernetes-namespace", "inspect-kubernetes-namespace")
        | ("kubernetes-application", "inspect-kubernetes-application")
        | ("kubernetes-pod", "inspect-kubernetes-pod" | "kubernetes-pod-logs")
        | ("kubernetes-service", "inspect-kubernetes-service")
        | ("kubernetes-ingress", "inspect-kubernetes-ingress")
        | ("kubernetes-configmap", "inspect-kubernetes-configmap")
        | ("kubernetes-secret", "inspect-kubernetes-secret")
        | ("kubernetes-volume", "inspect-kubernetes-volume")
        | ("kubernetes-crd", "inspect-kubernetes-crd")
        | ("helm-release", "inspect-helm-release" | "helm-release-history")
        | ("aci-container-group", "inspect-aci-container-group")
        | ("secret", "inspect-secret")
        | ("config", "inspect-config")
        | ("registry", "inspect-registry")
        | ("endpoint-group", "inspect-endpoint-group")
        | ("tag", "inspect-tag")
        | ("user", "inspect-user")
        | ("team", "inspect-team")
        | ("custom-template", "inspect-custom-template" | "custom-template-file")
        | ("settings", "inspect-settings")
        | ("stack", "inspect-stack" | "stack-file") => client.get(url),
        ("stack", "update-stack") => client.put(url),
        ("registry", "update-registry") => client.put(url),
        ("endpoint-group", "update-endpoint-group") => client.put(url),
        ("tag", "update-tag") => client.put(url),
        ("user", "update-user") => client.put(url),
        ("team", "update-team") => client.put(url),
        ("custom-template", "update-custom-template") => client.put(url),
        ("settings", "update-settings") => client.put(url),
        ("endpoint", "create-aci-container-group") => client.put(url),
        ("container", "remove" | "delete")
        | ("stack", "remove" | "delete")
        | ("image", "remove-image")
        | ("volume", "remove-volume")
        | ("network", "remove-network")
        | ("swarm-service", "remove-service")
        | ("kubernetes-namespace", "delete-kubernetes-namespace")
        | ("kubernetes-application", "delete-kubernetes-application")
        | ("kubernetes-pod", "delete-kubernetes-pod")
        | ("kubernetes-service", "delete-kubernetes-service")
        | ("kubernetes-ingress", "delete-kubernetes-ingress")
        | ("kubernetes-configmap", "delete-kubernetes-configmap")
        | ("kubernetes-secret", "delete-kubernetes-secret")
        | ("kubernetes-volume", "delete-kubernetes-volume")
        | ("helm-release", "uninstall-helm-release")
        | ("aci-container-group", "delete-aci-container-group")
        | ("secret", "remove-secret")
        | ("config", "remove-config")
        | ("registry", "remove-registry" | "delete")
        | ("endpoint-group", "remove-endpoint-group" | "delete")
        | ("tag", "remove-tag" | "delete")
        | ("user", "remove-user" | "delete")
        | ("team", "remove-team" | "delete")
        | ("custom-template", "remove-custom-template" | "delete") => client.delete(url),
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

    let data = if matches!(
        action,
        "logs" | "events" | "service-logs" | "task-logs" | "kubernetes-pod-logs" | "stack-file"
    ) {
        json!({ "logs": response.text().await.unwrap_or_default() })
    } else if matches!(action, "inspect-helm-release" | "helm-release-history") {
        response.json::<Value>().await.unwrap_or_else(|_| json!({}))
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

#[derive(Debug, PartialEq, Eq)]
struct ProxmoxGuestActionRequestSpec {
    method: &'static str,
    path: String,
    form: Vec<(String, String)>,
}

fn proxmox_core_guest_action_request_spec(
    config_url: &str,
    encoded_node: &str,
    kind: &str,
    vmid: u64,
    action: &str,
    args: &Value,
) -> Result<Option<ProxmoxGuestActionRequestSpec>, AppError> {
    let base = format!("{config_url}/api2/json/nodes/{encoded_node}/{kind}/{vmid}");
    let mut form: Vec<(String, String)> = Vec::new();
    let config_method = if kind == "lxc" { "put" } else { "post" };
    let (method, path) = match action {
        "start" | "shutdown" | "reboot" | "stop" => ("post", format!("{base}/status/{action}")),
        "delete" => {
            if let Some(purge) = optional_arg_bool(args, &["purge"]) {
                form.push((
                    "purge".to_string(),
                    if purge { "1" } else { "0" }.to_string(),
                ));
            }
            if let Some(destroy) = optional_arg_bool(
                args,
                &[
                    "destroy_unreferenced_disks",
                    "destroyUnreferencedDisks",
                    "destroy-unreferenced-disks",
                ],
            ) {
                form.push((
                    "destroy-unreferenced-disks".to_string(),
                    if destroy { "1" } else { "0" }.to_string(),
                ));
            }
            ("delete", base.clone())
        }
        "set-memory" => {
            let memory =
                required_arg_u64(args, &["memory_mb", "memoryMiB", "memory"], "memory MiB")?;
            if !(64..=1_048_576).contains(&memory) {
                return Err(AppError::BadRequest("memory MiB is out of range".into()));
            }
            form.push(("memory".to_string(), memory.to_string()));
            (config_method, format!("{base}/config"))
        }
        "set-cpu" => {
            let cores = required_arg_u64(args, &["cores", "cpu"], "CPU cores")?;
            if !(1..=256).contains(&cores) {
                return Err(AppError::BadRequest("CPU cores is out of range".into()));
            }
            form.push(("cores".to_string(), cores.to_string()));
            (config_method, format!("{base}/config"))
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
            (config_method, format!("{base}/config"))
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
            (config_method, format!("{base}/config"))
        }
        "remove-network" => {
            let key = validate_proxmox_network_key(&required_arg_string(
                args,
                &["net", "iface", "key"],
                "network device",
            )?)?;
            form.push(("delete".to_string(), key));
            (config_method, format!("{base}/config"))
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
        _ => return Ok(None),
    };

    Ok(Some(ProxmoxGuestActionRequestSpec { method, path, form }))
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
    let owned_node;
    let node = if node.trim().is_empty() {
        owned_node = infer_proxmox_guest_node_for_control(state, kind, vmid)
            .await
            .unwrap_or_default();
        owned_node.as_str()
    } else {
        node.trim()
    };
    if node.is_empty() {
        return Err(AppError::BadRequest(format!(
            "Proxmox node is required for {kind}/{vmid}; refresh inventory or select the node explicitly"
        )));
    }

    let configs = proxmox_api_configs(state);
    if configs.is_empty() {
        return Err(AppError::BadRequest(
            "Proxmox API credentials are required for control actions".into(),
        ));
    }

    let client = insecure_client();
    let encoded_node = urlencoding::encode(node);
    let mut last_error: Option<String> = None;
    for config in configs {
        let auth_header = format!("PVEAPIToken={}={}", config.token_id, config.token_secret);
        let base = format!(
            "{}/api2/json/nodes/{}/{}/{}",
            config.url, encoded_node, kind, vmid
        );

        if action == "console" {
            let session = create_proxmox_console_session(
                state,
                ProxmoxConsoleSessionInput {
                    node: Some(node.to_string()),
                    kind: kind.to_string(),
                    vmid,
                },
            )
            .await?;
            return Ok(json!({
                "mode": "proxmox-api",
                "source": config.origin,
                "target": {
                    "node": node,
                    "kind": kind,
                    "vmid": vmid,
                },
                "action": action,
                "capability": {
                    "status": "implemented",
                    "label": "Embedded Proxmox console",
                    "embedded": true,
                    "backend": "vncproxy-vncwebsocket"
                },
                "response": session,
            }));
        }

        let mut form: Vec<(String, String)> = Vec::new();
        let (method, path) = if let Some(spec) = proxmox_core_guest_action_request_spec(
            &config.url,
            &encoded_node,
            kind,
            vmid,
            action,
            args,
        )? {
            form = spec.form;
            (spec.method, spec.path)
        } else {
            match action {
                "start" | "shutdown" | "reboot" | "stop" => {
                    ("post", format!("{base}/status/{action}"))
                }
                "delete" => ("delete", base.clone()),
                "set-memory" => {
                    let memory = required_arg_u64(
                        args,
                        &["memory_mb", "memoryMiB", "memory"],
                        "memory MiB",
                    )?;
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
                    let protection =
                        optional_arg_bool(args, &["protection", "value"]).ok_or_else(|| {
                            AppError::BadRequest("protection boolean is required".into())
                        })?;
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
                        &arg_string(args, &["net", "iface", "key"])
                            .unwrap_or_else(|| "net0".into()),
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
                    let value =
                        normalize_proxmox_disk_allocation_config(&validate_proxmox_config_value(
                            &required_arg_string(args, &["value", "config"], "disk config")?,
                            "disk config",
                        )?);
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
                    let state = validate_proxmox_ha_state(&required_arg_string(
                        args,
                        &["state"],
                        "HA state",
                    )?)?;
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
            }
        };

        let mut path = path;
        if method == "delete" && !form.is_empty() {
            let query = form
                .iter()
                .map(|(key, value)| {
                    format!(
                        "{}={}",
                        urlencoding::encode(key),
                        urlencoding::encode(value)
                    )
                })
                .collect::<Vec<_>>()
                .join("&");
            let separator = if path.contains('?') { '&' } else { '?' };
            path = format!("{path}{separator}{query}");
            form.clear();
        }

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
                let task = if let Some(upid) = proxmox_upid_from_response(&body) {
                    Some(
                        proxmox_task_status_snapshot(&client, &config, &auth_header, node, &upid)
                            .await,
                    )
                } else {
                    None
                };
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
                    "task": task,
                }));
            }
            Ok(res) => {
                let status = res.status();
                let text = res.text().await.unwrap_or_default();
                let detail = compact_error_body(&text);
                last_error = Some(if detail.is_empty() {
                    format!("{} returned {status}", config.origin)
                } else {
                    format!("{} returned {status}: {detail}", config.origin)
                });
                warn!(
                    source = config.origin,
                    status = %status,
                    error = %detail,
                    action,
                    node,
                    vmid,
                    "Proxmox control endpoint returned non-success"
                );
            }
            Err(err) => {
                last_error = Some(format!("{} request failed: {err}", config.origin));
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

    let detail = last_error
        .map(|error| format!(": {error}"))
        .unwrap_or_default();
    Err(AppError::BadRequest(format!(
        "Proxmox {action} failed for {kind}/{vmid} on {node}{detail}"
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
    if !matches!(
        action,
        "shell" | "reboot" | "shutdown" | "create-vm" | "create-lxc"
    ) {
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
    let mut last_error: Option<String> = None;
    for config in configs {
        let auth_header = format!("PVEAPIToken={}={}", config.token_id, config.token_secret);
        if action == "shell" {
            let session = create_proxmox_shell_session(
                state,
                ProxmoxShellSessionInput {
                    node: node.to_string(),
                },
            )
            .await?;
            return Ok(json!({
                "mode": "proxmox-api",
                "source": config.origin,
                "target": { "node": node },
                "action": action,
                "capability": {
                    "status": "implemented",
                    "label": "Embedded Proxmox node shell",
                    "embedded": true,
                    "backend": "termproxy-vncwebsocket"
                },
                "response": session,
            }));
        }
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
                let disk_size = normalize_proxmox_create_disk_size(&validate_control_token(
                    &arg_string(args, &["disk_size", "size"]).unwrap_or_else(|| "32G".into()),
                    "disk size",
                )?)?;
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
                let disk_size = normalize_proxmox_create_disk_size(&validate_control_token(
                    &arg_string(args, &["disk_size", "size"]).unwrap_or_else(|| "8G".into()),
                    "disk size",
                )?)?;
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
                let task = if let Some(upid) = proxmox_upid_from_response(&body) {
                    Some(
                        proxmox_task_status_snapshot(&client, &config, &auth_header, &node, &upid)
                            .await,
                    )
                } else {
                    None
                };
                return Ok(json!({
                    "mode": "proxmox-api",
                    "source": config.origin,
                    "target": { "node": node },
                    "action": action,
                    "response": body,
                    "task": task,
                }));
            }
            Ok(res) => {
                let status = res.status();
                let text = res.text().await.unwrap_or_default();
                let detail = compact_error_body(&text);
                last_error = Some(if detail.is_empty() {
                    format!("{} returned {status}", config.origin)
                } else {
                    format!("{} returned {status}: {detail}", config.origin)
                });
                warn!(
                    source = config.origin,
                    status = %status,
                    error = %detail,
                    action,
                    node,
                    "Proxmox node control endpoint returned non-success"
                );
            }
            Err(err) => {
                last_error = Some(format!("{} request failed: {err}", config.origin));
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

    let detail = last_error
        .map(|error| format!(": {error}"))
        .unwrap_or_default();
    Err(AppError::BadRequest(format!(
        "Proxmox node {action} failed for {node}{detail}"
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
    let mut last_error: Option<String> = None;
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
                let task = if let Some(upid) = proxmox_upid_from_response(&body) {
                    Some(
                        proxmox_task_status_snapshot(&client, &config, &auth_header, &node, &upid)
                            .await,
                    )
                } else {
                    None
                };
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
                    "task": task,
                }));
            }
            Ok(res) => {
                let status = res.status();
                let text = res.text().await.unwrap_or_default();
                let detail = compact_error_body(&text);
                last_error = Some(if detail.is_empty() {
                    format!("{} returned {status}", config.origin)
                } else {
                    format!("{} returned {status}: {detail}", config.origin)
                });
                warn!(
                    source = config.origin,
                    status = %status,
                    error = %detail,
                    action,
                    node,
                    vmid,
                    archive,
                    "Proxmox restore endpoint returned non-success"
                );
            }
            Err(err) => {
                last_error = Some(format!("{} request failed: {err}", config.origin));
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

    let detail = last_error
        .map(|error| format!(": {error}"))
        .unwrap_or_default();
    Err(AppError::BadRequest(format!(
        "Proxmox restore failed for {archive} on {node}{detail}"
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
    let mut last_error: Option<String> = None;
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
                let task = if let Some(upid) = proxmox_upid_from_response(&body) {
                    Some(
                        proxmox_task_status_snapshot(&client, &config, &auth_header, &node, &upid)
                            .await,
                    )
                } else {
                    None
                };
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
                    "task": task,
                }));
            }
            Ok(res) => {
                let status = res.status();
                let text = res.text().await.unwrap_or_default();
                let detail = compact_error_body(&text);
                last_error = Some(if detail.is_empty() {
                    format!("{} returned {status}", config.origin)
                } else {
                    format!("{} returned {status}: {detail}", config.origin)
                });
                warn!(
                    source = config.origin,
                    status = %status,
                    error = %detail,
                    action,
                    node,
                    archive,
                    "Proxmox backup delete endpoint returned non-success"
                );
            }
            Err(err) => {
                last_error = Some(format!("{} request failed: {err}", config.origin));
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

    let detail = last_error
        .map(|error| format!(": {error}"))
        .unwrap_or_default();
    Err(AppError::BadRequest(format!(
        "Proxmox backup delete failed for {archive} on {node}{detail}"
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
    let mut last_error: Option<String> = None;
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
                let task = node.as_deref().and_then(|task_node| {
                    proxmox_upid_from_response(&body).map(|upid| (task_node.to_string(), upid))
                });
                let task = if let Some((task_node, upid)) = task {
                    Some(
                        proxmox_task_status_snapshot(
                            &client,
                            &config,
                            &auth_header,
                            &task_node,
                            &upid,
                        )
                        .await,
                    )
                } else {
                    None
                };
                return Ok(json!({
                    "mode": "proxmox-api",
                    "source": config.origin,
                    "target": {
                        "node": node,
                        "storage": storage,
                    },
                    "action": action,
                    "response": body,
                    "task": task,
                }));
            }
            Ok(res) => {
                let status = res.status();
                let text = res.text().await.unwrap_or_default();
                let detail = compact_error_body(&text);
                last_error = Some(if detail.is_empty() {
                    format!("{} returned {status}", config.origin)
                } else {
                    format!("{} returned {status}: {detail}", config.origin)
                });
                warn!(
                    source = config.origin,
                    status = %status,
                    error = %detail,
                    action,
                    storage,
                    "Proxmox storage endpoint returned non-success"
                );
            }
            Err(err) => {
                last_error = Some(format!("{} request failed: {err}", config.origin));
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

    let detail = last_error
        .map(|error| format!(": {error}"))
        .unwrap_or_default();
    Err(AppError::BadRequest(format!(
        "Proxmox storage {action} failed for {storage}{detail}"
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
    let mut last_error: Option<String> = None;
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
                let status = res.status();
                let text = res.text().await.unwrap_or_default();
                let detail = compact_error_body(&text);
                last_error = Some(if detail.is_empty() {
                    format!("{} returned {status}", config.origin)
                } else {
                    format!("{} returned {status}: {detail}", config.origin)
                });
                warn!(
                    source = config.origin,
                    status = %status,
                    error = %detail,
                    action,
                    sid,
                    "Proxmox HA endpoint returned non-success"
                );
            }
            Err(err) => {
                last_error = Some(format!("{} request failed: {err}", config.origin));
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

    let detail = last_error
        .map(|error| format!(": {error}"))
        .unwrap_or_default();
    Err(AppError::BadRequest(format!(
        "Proxmox HA {action} failed for {sid}{detail}"
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
    let upid = validate_proxmox_task_upid(upid)?;

    let configs = proxmox_api_configs(state);
    if configs.is_empty() {
        return Err(AppError::BadRequest(
            "Proxmox API credentials are required for task controls".into(),
        ));
    }

    let client = insecure_client();
    let encoded_node = urlencoding::encode(&node);
    let encoded_upid = urlencoding::encode(&upid);
    let mut last_error: Option<String> = None;
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
                let status = res.status();
                let text = res.text().await.unwrap_or_default();
                let detail = compact_error_body(&text);
                last_error = Some(if detail.is_empty() {
                    format!("{} returned {status}", config.origin)
                } else {
                    format!("{} returned {status}: {detail}", config.origin)
                });
                warn!(
                    source = config.origin,
                    status = %status,
                    error = %detail,
                    action,
                    node,
                    upid,
                    "Proxmox task endpoint returned non-success"
                );
            }
            Err(err) => {
                last_error = Some(format!("{} request failed: {err}", config.origin));
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

    let detail = last_error
        .map(|error| format!(": {error}"))
        .unwrap_or_default();
    Err(AppError::BadRequest(format!(
        "Proxmox task {action} failed for {upid} on {node}{detail}"
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
    let mut last_error: Option<String> = None;
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
                let task = if let Some(upid) = proxmox_upid_from_response(&body) {
                    Some(
                        proxmox_task_status_snapshot(&client, &config, &auth_header, &node, &upid)
                            .await,
                    )
                } else {
                    None
                };
                return Ok(json!({
                    "mode": "proxmox-api",
                    "source": config.origin,
                    "target": { "node": node, "service": service_id },
                    "action": action,
                    "response": body,
                    "task": task,
                }));
            }
            Ok(res) => {
                let status = res.status();
                let text = res.text().await.unwrap_or_default();
                let detail = compact_error_body(&text);
                last_error = Some(if detail.is_empty() {
                    format!("{} returned {status}", config.origin)
                } else {
                    format!("{} returned {status}: {detail}", config.origin)
                });
                warn!(
                    source = config.origin,
                    status = %status,
                    error = %detail,
                    action,
                    node,
                    service = service_id,
                    "Proxmox service control endpoint returned non-success"
                );
            }
            Err(err) => {
                last_error = Some(format!("{} request failed: {err}", config.origin));
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

    let detail = last_error
        .map(|error| format!(": {error}"))
        .unwrap_or_default();
    Err(AppError::BadRequest(format!(
        "Proxmox service {action} failed for {service_id} on {node}{detail}"
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
        .route("/homelab/portainer/instances", get(get_portainer_instances))
        .route(
            "/homelab/portainer/environments",
            get(get_portainer_environments),
        )
        .route(
            "/homelab/portainer/capabilities",
            get(get_portainer_capabilities),
        )
        .route("/homelab/portainer/resources", get(get_portainer_resources))
        .route("/homelab/portainer/action", post(post_portainer_action))
        .route(
            "/homelab/portainer/terminal/session",
            post(post_portainer_terminal_session),
        )
        .route("/homelab/portainer/terminal/ws", get(portainer_terminal_ws))
        .route("/homelab/proxmox", get(get_proxmox))
        .route(
            "/homelab/proxmox/console/session",
            post(post_proxmox_console_session),
        )
        .route("/homelab/proxmox/console/ws", get(proxmox_console_ws))
        .route(
            "/homelab/proxmox/shell/session",
            post(post_proxmox_shell_session),
        )
        .route("/homelab/proxmox/shell/ws", get(proxmox_shell_ws))
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

fn portainer_environments_payload(portainer: &Value) -> Value {
    let mut environments = Vec::new();
    for instance in portainer
        .get("instances")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        let instance_id = instance
            .get("id")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let instance_name = instance
            .get("name")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let instance_url = instance
            .get("url")
            .and_then(Value::as_str)
            .unwrap_or_default();
        for endpoint in instance
            .get("endpoints")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
        {
            environments.push(json!({
                "instance_id": instance_id,
                "instance_name": instance_name,
                "instance_url": instance_url,
                "endpoint_id": endpoint.get("id").cloned().unwrap_or(Value::Null),
                "name": endpoint.get("name").cloned().unwrap_or(Value::Null),
                "url": endpoint.get("url").cloned().unwrap_or(Value::Null),
                "status": endpoint.get("status").cloned().unwrap_or(Value::Null),
                "type": endpoint.get("type").cloned().unwrap_or(Value::Null),
                "group_id": endpoint.get("group_id").or_else(|| endpoint.get("GroupId")).cloned().unwrap_or(Value::Null),
                "tags": endpoint.get("tags").or_else(|| endpoint.get("TagIds")).cloned().unwrap_or_else(|| json!([])),
            }));
        }
    }
    json!(environments)
}

fn portainer_resources_payload(portainer: &Value) -> Value {
    json!({
        "containers": portainer.get("containers").cloned().unwrap_or_else(|| json!([])),
        "stacks": portainer.get("stacks").cloned().unwrap_or_else(|| json!([])),
        "images": portainer.get("images").cloned().unwrap_or_else(|| json!([])),
        "volumes": portainer.get("volumes").cloned().unwrap_or_else(|| json!([])),
        "networks": portainer.get("networks").cloned().unwrap_or_else(|| json!([])),
        "secrets": portainer.get("secrets").cloned().unwrap_or_else(|| json!([])),
        "configs": portainer.get("configs").cloned().unwrap_or_else(|| json!([])),
        "swarm_services": portainer.get("swarm_services").cloned().unwrap_or_else(|| json!([])),
        "swarm_nodes": portainer.get("swarm_nodes").cloned().unwrap_or_else(|| json!([])),
        "swarm_tasks": portainer.get("swarm_tasks").cloned().unwrap_or_else(|| json!([])),
        "kubernetes_namespaces": portainer.get("kubernetes_namespaces").cloned().unwrap_or_else(|| json!([])),
        "kubernetes_applications": portainer.get("kubernetes_applications").cloned().unwrap_or_else(|| json!([])),
        "kubernetes_pods": portainer.get("kubernetes_pods").cloned().unwrap_or_else(|| json!([])),
        "kubernetes_services": portainer.get("kubernetes_services").cloned().unwrap_or_else(|| json!([])),
        "kubernetes_ingresses": portainer.get("kubernetes_ingresses").cloned().unwrap_or_else(|| json!([])),
        "kubernetes_configmaps": portainer.get("kubernetes_configmaps").cloned().unwrap_or_else(|| json!([])),
        "kubernetes_secrets": portainer.get("kubernetes_secrets").cloned().unwrap_or_else(|| json!([])),
        "kubernetes_volumes": portainer.get("kubernetes_volumes").cloned().unwrap_or_else(|| json!([])),
        "kubernetes_crds": portainer.get("kubernetes_crds").cloned().unwrap_or_else(|| json!([])),
        "kubernetes_helm_releases": portainer.get("kubernetes_helm_releases").cloned().unwrap_or_else(|| json!([])),
        "aci_subscriptions": portainer.get("aci_subscriptions").cloned().unwrap_or_else(|| json!([])),
        "aci_resource_groups": portainer.get("aci_resource_groups").cloned().unwrap_or_else(|| json!([])),
        "aci_container_groups": portainer.get("aci_container_groups").cloned().unwrap_or_else(|| json!([])),
        "registries": portainer.get("registries").cloned().unwrap_or_else(|| json!([])),
        "groups": portainer.get("groups").cloned().unwrap_or_else(|| json!([])),
        "tags": portainer.get("tags").cloned().unwrap_or_else(|| json!([])),
        "users": portainer.get("users").cloned().unwrap_or_else(|| json!([])),
        "teams": portainer.get("teams").cloned().unwrap_or_else(|| json!([])),
        "app_templates": portainer.get("app_templates").cloned().unwrap_or_else(|| json!([])),
        "custom_templates": portainer.get("custom_templates").cloned().unwrap_or_else(|| json!([])),
    })
}

fn portainer_capabilities_list_payload(portainer: &Value) -> Value {
    json!({
        "capabilities": portainer.get("capabilities").cloned().unwrap_or_else(|| json!([])),
        "groups": portainer.get("groups").cloned().unwrap_or_else(|| json!([])),
        "tags": portainer.get("tags").cloned().unwrap_or_else(|| json!([])),
        "users": portainer.get("users").cloned().unwrap_or_else(|| json!([])),
        "teams": portainer.get("teams").cloned().unwrap_or_else(|| json!([])),
        "app_templates": portainer.get("app_templates").cloned().unwrap_or_else(|| json!([])),
        "custom_templates": portainer.get("custom_templates").cloned().unwrap_or_else(|| json!([])),
    })
}

async fn insert_portainer_terminal_session(id: String, session: PortainerTerminalSession) {
    let mut sessions = portainer_terminal_sessions().lock().await;
    let now = Instant::now();
    sessions.retain(|_, existing| existing.expires_at > now);
    sessions.insert(id, session);
}

async fn take_portainer_terminal_session(id: &str) -> Result<PortainerTerminalSession, AppError> {
    let mut sessions = portainer_terminal_sessions().lock().await;
    let now = Instant::now();
    sessions.retain(|_, existing| existing.expires_at > now);
    sessions
        .remove(id)
        .ok_or_else(|| AppError::NotFound("Portainer terminal session expired or unknown".into()))
}

async fn create_portainer_terminal_session(
    state: &AppState,
    input: PortainerTerminalSessionInput,
) -> Result<Value, AppError> {
    let action = validate_docker_action(input.action.trim())?;
    let resource_type = input.resource_type.trim();
    if !matches!(
        (resource_type, action),
        ("container", "logs" | "exec")
            | ("endpoint", "events-follow")
            | ("kubernetes-pod", "kubernetes-pod-exec")
    ) {
        return Err(AppError::BadRequest(
            "Portainer terminal currently supports container logs, Docker events, container exec, and Kubernetes pod exec".into(),
        ));
    }
    let resource_id = match resource_type {
        "endpoint" => input
            .resource_id
            .trim()
            .parse::<i64>()
            .map_err(|_| AppError::BadRequest("endpoint id must be numeric".into()))?
            .to_string(),
        "kubernetes-pod" => kubernetes_resource_name(input.resource_id.trim())?,
        _ => validate_container_target(input.resource_id.trim())?,
    };
    let endpoint_id = if resource_type == "endpoint" {
        resource_id
            .parse::<i64>()
            .map_err(|_| AppError::BadRequest("endpoint id must be numeric".into()))?
    } else {
        input
            .args
            .get("endpoint_id")
            .or_else(|| input.args.get("endpointId"))
            .and_then(Value::as_i64)
            .ok_or_else(|| AppError::BadRequest("Portainer terminal requires endpoint_id".into()))?
    };
    let command = if matches!(action, "exec" | "kubernetes-pod-exec") {
        portainer_exec_cmd(&input.args)?
    } else {
        Vec::new()
    };
    let namespace = if resource_type == "kubernetes-pod" {
        Some(kubernetes_namespace(&input.args)?)
    } else {
        None
    };
    let container = arg_string(&input.args, &["container"]);
    let tail = optional_arg_u64(&input.args, &["tail"])
        .unwrap_or(300)
        .clamp(1, 5_000);
    let since = if action == "events-follow" {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_secs())
            .unwrap_or(0);
        Some(optional_arg_u64(&input.args, &["since"]).unwrap_or_else(|| now.saturating_sub(300)))
    } else {
        None
    };
    let event_filters = if action == "events-follow" {
        docker_event_filters_query(&input.args)?
    } else {
        None
    };
    let target_label = arg_string(&input.args, &["name"])
        .filter(|name| !name.trim().is_empty())
        .unwrap_or_else(|| resource_id.chars().take(12).collect());
    let instance_id = input.instance_id.clone();
    let config = selected_portainer_config(state, input.instance_id.as_deref())?;
    let id = proxmox_session_id(match action {
        "exec" => "portainer-exec",
        "events-follow" => "portainer-events",
        "kubernetes-pod-exec" => "portainer-kube-exec",
        _ => "portainer-logs",
    });
    let ttl = Duration::from_secs(90);
    insert_portainer_terminal_session(
        id.clone(),
        PortainerTerminalSession {
            kind: match action {
                "exec" => PortainerTerminalKind::ContainerExec,
                "events-follow" => PortainerTerminalKind::DockerEvents,
                "kubernetes-pod-exec" => PortainerTerminalKind::KubernetesPodExec,
                _ => PortainerTerminalKind::ContainerLogs,
            },
            config,
            endpoint_id,
            resource_id: resource_id.clone(),
            target_label: target_label.clone(),
            command,
            tail,
            since,
            event_filters: event_filters.clone(),
            namespace: namespace.clone(),
            container: container.clone(),
            expires_at: Instant::now() + ttl,
        },
    )
    .await;
    Ok(json!({
        "sessionId": id,
        "websocketUrl": format!("/api/homelab/portainer/terminal/ws?sessionId={}", urlencoding::encode(&id)),
        "expiresInSeconds": ttl.as_secs(),
        "mode": "portainer-api",
        "terminal": "xterm",
        "target": {
            "instanceId": instance_id,
            "resourceType": resource_type,
            "resourceId": resource_id,
            "action": action,
            "endpointId": endpoint_id,
            "name": target_label,
            "since": since,
            "eventFilters": event_filters,
            "namespace": namespace,
            "container": container,
        },
    }))
}

async fn post_portainer_terminal_session(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Json(input): Json<PortainerTerminalSessionInput>,
) -> Result<Json<Value>, AppError> {
    create_portainer_terminal_session(&state, input)
        .await
        .map(success_json)
}

async fn portainer_terminal_ws(
    Query(query): Query<ProxmoxWsSessionQuery>,
    ws: WebSocketUpgrade,
) -> Response {
    match take_portainer_terminal_session(&query.session_id).await {
        Ok(session) => ws
            .max_message_size(16 * 1024 * 1024)
            .on_upgrade(move |socket| handle_portainer_terminal_ws(socket, session)),
        Err(error) => error.into_response(),
    }
}

async fn handle_portainer_terminal_ws(mut socket: WebSocket, session: PortainerTerminalSession) {
    let target_path = match session.kind {
        PortainerTerminalKind::ContainerLogs => portainer_container_logs_path(
            session.endpoint_id,
            &session.resource_id,
            session.tail,
            true,
        ),
        PortainerTerminalKind::DockerEvents => portainer_docker_events_path(
            session.endpoint_id,
            session.since,
            None,
            session.event_filters.as_deref(),
        ),
        PortainerTerminalKind::ContainerExec => {
            return handle_portainer_exec_terminal_ws(socket, session).await;
        }
        PortainerTerminalKind::KubernetesPodExec => {
            return handle_portainer_kubernetes_pod_exec_ws(socket, session).await;
        }
    };
    let url = format!("{}/api{}", session.config.url, target_path);
    let response = insecure_client()
        .get(url)
        .header("X-API-Key", &session.config.token)
        .send()
        .await;
    let Ok(response) = response else {
        let error = response
            .err()
            .map(|err| err.to_string())
            .unwrap_or_default();
        let _ = socket
            .send(AxumWsMessage::Text(
                format!("Portainer log stream failed: {error}\n").into(),
            ))
            .await;
        return;
    };
    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        let _ = socket
            .send(AxumWsMessage::Text(
                format!("Portainer log stream failed ({status}): {text}\n").into(),
            ))
            .await;
        return;
    }

    let _ = socket
        .send(AxumWsMessage::Text(
            match session.kind {
                PortainerTerminalKind::DockerEvents => {
                    format!("Connected to {} Docker events.\n", session.target_label)
                }
                _ => format!("Connected to {} logs.\n", session.target_label),
            }
            .into(),
        ))
        .await;
    let mut stream = response.bytes_stream();
    let mut decode_buffer = Vec::new();
    loop {
        tokio::select! {
            chunk = stream.next() => {
                let Some(chunk) = chunk else { break };
                match chunk {
                    Ok(bytes) => {
                        let text = if session.kind == PortainerTerminalKind::DockerEvents {
                            String::from_utf8_lossy(&bytes).to_string()
                        } else {
                            drain_docker_multiplex_stream(&mut decode_buffer, &bytes)
                        };
                        if !text.is_empty() && socket.send(AxumWsMessage::Text(text.into())).await.is_err() {
                            break;
                        }
                    }
                    Err(err) => {
                        let _ = socket.send(AxumWsMessage::Text(format!("Portainer log stream error: {err}\n").into())).await;
                        break;
                    }
                }
            }
            message = socket.next() => {
                match message {
                    Some(Ok(AxumWsMessage::Close(_))) | None => break,
                    Some(Ok(_)) => {}
                    Some(Err(_)) => break,
                }
            }
        }
    }
}

async fn handle_portainer_exec_terminal_ws(
    mut socket: WebSocket,
    session: PortainerTerminalSession,
) {
    let client = insecure_client();
    let create_url = format!(
        "{}/api/endpoints/{}/docker/containers/{}/exec",
        session.config.url,
        session.endpoint_id,
        urlencoding::encode(&session.resource_id)
    );
    let create_response = client
        .post(create_url)
        .header("X-API-Key", &session.config.token)
        .json(&json!({
            "AttachStdin": true,
            "AttachStdout": true,
            "AttachStderr": true,
            "Tty": true,
            "Cmd": session.command,
        }))
        .send()
        .await;
    let Ok(create_response) = create_response else {
        let error = create_response
            .err()
            .map(|err| err.to_string())
            .unwrap_or_default();
        let _ = socket
            .send(AxumWsMessage::Text(
                format!("Portainer exec create failed: {error}\n").into(),
            ))
            .await;
        return;
    };
    if !create_response.status().is_success() {
        let status = create_response.status();
        let text = create_response.text().await.unwrap_or_default();
        let _ = socket
            .send(AxumWsMessage::Text(
                format!("Portainer exec create failed ({status}): {text}\n").into(),
            ))
            .await;
        return;
    }
    let create_data = create_response
        .json::<Value>()
        .await
        .unwrap_or_else(|_| json!({}));
    let Some(exec_id) = create_data
        .get("Id")
        .and_then(Value::as_str)
        .map(str::to_string)
    else {
        let _ = socket
            .send(AxumWsMessage::Text(
                "Portainer exec create did not return an exec id.\n".into(),
            ))
            .await;
        return;
    };

    let remote_url = portainer_container_exec_ws_url(&session, &exec_id);
    let mut request = match remote_url.into_client_request() {
        Ok(request) => request,
        Err(err) => {
            let _ = socket
                .send(AxumWsMessage::Text(
                    format!("Invalid Portainer exec websocket URL: {err}\n").into(),
                ))
                .await;
            return;
        }
    };
    if let Ok(value) = session.config.token.parse() {
        request.headers_mut().insert("X-API-Key", value);
    }

    let connector = proxmox_ws_connector(&session.config.url);
    let remote = connect_async_tls_with_config(request, None, false, connector).await;
    let Ok((remote, _)) = remote else {
        let error = remote.err().map(|err| err.to_string()).unwrap_or_default();
        warn!(
            error = %error,
            endpoint_id = session.endpoint_id,
            container = %session.resource_id,
            "Unable to connect to Portainer container exec websocket"
        );
        let _ = socket
            .send(AxumWsMessage::Text(
                "Unable to connect to Portainer container exec websocket.\n".into(),
            ))
            .await;
        return;
    };

    let _ = socket
        .send(AxumWsMessage::Text(
            format!("Connected to {} exec.\n", session.target_label).into(),
        ))
        .await;

    let (mut local_tx, mut local_rx) = socket.split();
    let (mut remote_tx, mut remote_rx) = remote.split();

    let browser_to_exec = async {
        while let Some(message) = local_rx.next().await {
            let Ok(message) = message else { break };
            let outgoing = match message {
                AxumWsMessage::Text(text) => TungsteniteMessage::Text(text.to_string()),
                AxumWsMessage::Binary(data) => TungsteniteMessage::Binary(data),
                AxumWsMessage::Ping(data) => TungsteniteMessage::Ping(data),
                AxumWsMessage::Pong(data) => TungsteniteMessage::Pong(data),
                AxumWsMessage::Close(frame) => {
                    let _ = remote_tx
                        .send(TungsteniteMessage::Close(frame.map(|item| {
                            tokio_tungstenite::tungstenite::protocol::CloseFrame {
                                code: item.code.into(),
                                reason: item.reason.to_string().into(),
                            }
                        })))
                        .await;
                    break;
                }
            };
            if remote_tx.send(outgoing).await.is_err() {
                break;
            }
        }
    };

    let exec_to_browser = async {
        while let Some(message) = remote_rx.next().await {
            let Ok(message) = message else { break };
            let outgoing = match message {
                TungsteniteMessage::Text(text) => AxumWsMessage::Text(text.into()),
                TungsteniteMessage::Binary(data) => AxumWsMessage::Binary(data),
                TungsteniteMessage::Ping(data) => AxumWsMessage::Ping(data),
                TungsteniteMessage::Pong(data) => AxumWsMessage::Pong(data),
                TungsteniteMessage::Close(frame) => {
                    let _ = local_tx
                        .send(AxumWsMessage::Close(frame.map(|item| {
                            axum::extract::ws::CloseFrame {
                                code: item.code.into(),
                                reason: item.reason.to_string().into(),
                            }
                        })))
                        .await;
                    break;
                }
                TungsteniteMessage::Frame(_) => continue,
            };
            if local_tx.send(outgoing).await.is_err() {
                break;
            }
        }
    };

    tokio::select! {
        _ = browser_to_exec => {}
        _ = exec_to_browser => {}
    }
}

fn portainer_container_exec_ws_url(session: &PortainerTerminalSession, exec_id: &str) -> String {
    let base = websocket_base_url(&session.config.url);
    let query = vec![
        format!("endpointId={}", session.endpoint_id),
        format!("id={}", urlencoding::encode(exec_id)),
        format!("token={}", urlencoding::encode(&session.config.token)),
    ];
    format!("{base}/api/websocket/exec?{}", query.join("&"))
}

fn portainer_kubernetes_pod_exec_ws_url(
    session: &PortainerTerminalSession,
) -> Result<String, AppError> {
    let namespace = session
        .namespace
        .as_deref()
        .ok_or_else(|| AppError::BadRequest("Kubernetes pod exec requires namespace".into()))?;
    let base = websocket_base_url(&session.config.url);
    let mut query = vec![
        "stdin=true".to_string(),
        "stdout=true".to_string(),
        "stderr=true".to_string(),
        "tty=true".to_string(),
    ];
    if let Some(container) = session.container.as_deref() {
        query.push(format!("container={}", urlencoding::encode(container)));
    }
    for command in &session.command {
        query.push(format!("command={}", urlencoding::encode(command)));
    }
    Ok(format!(
        "{base}/api/endpoints/{}/kubernetes/api/v1/namespaces/{}/pods/{}/exec?{}",
        session.endpoint_id,
        urlencoding::encode(namespace),
        urlencoding::encode(&session.resource_id),
        query.join("&")
    ))
}

async fn handle_portainer_kubernetes_pod_exec_ws(
    mut socket: WebSocket,
    session: PortainerTerminalSession,
) {
    let remote_url = match portainer_kubernetes_pod_exec_ws_url(&session) {
        Ok(url) => url,
        Err(error) => {
            let _ = socket
                .send(AxumWsMessage::Text(format!("{error}\n").into()))
                .await;
            return;
        }
    };
    let mut request = match remote_url.into_client_request() {
        Ok(request) => request,
        Err(err) => {
            let _ = socket
                .send(AxumWsMessage::Text(
                    format!("Invalid Kubernetes pod exec websocket URL: {err}\n").into(),
                ))
                .await;
            return;
        }
    };
    if let Ok(value) = session.config.token.parse() {
        request.headers_mut().insert("X-API-Key", value);
    }
    if let Ok(value) = "v4.channel.k8s.io".parse() {
        request
            .headers_mut()
            .insert("Sec-WebSocket-Protocol", value);
    }
    if let Ok(value) = "v4.channel.k8s.io".parse() {
        request
            .headers_mut()
            .insert("X-Stream-Protocol-Version", value);
    }

    let connector = proxmox_ws_connector(&session.config.url);
    let remote = connect_async_tls_with_config(request, None, false, connector).await;
    let Ok((remote, _)) = remote else {
        let error = remote.err().map(|err| err.to_string()).unwrap_or_default();
        warn!(
            error = %error,
            endpoint_id = session.endpoint_id,
            pod = %session.resource_id,
            "Unable to connect to Portainer Kubernetes pod exec websocket"
        );
        let _ = socket
            .send(AxumWsMessage::Text(
                "Unable to connect to Kubernetes pod exec websocket.\n".into(),
            ))
            .await;
        return;
    };

    let _ = socket
        .send(AxumWsMessage::Text(
            format!("Connected to {} pod shell.\n", session.target_label).into(),
        ))
        .await;

    let (mut local_tx, mut local_rx) = socket.split();
    let (mut remote_tx, mut remote_rx) = remote.split();

    let browser_to_kubernetes = async {
        while let Some(message) = local_rx.next().await {
            let Ok(message) = message else { break };
            let outgoing = match message {
                AxumWsMessage::Text(text) => {
                    let mut data = Vec::with_capacity(text.len() + 1);
                    data.push(0);
                    data.extend_from_slice(text.as_bytes());
                    TungsteniteMessage::Binary(data)
                }
                AxumWsMessage::Binary(data) => {
                    let mut payload = Vec::with_capacity(data.len() + 1);
                    payload.push(0);
                    payload.extend_from_slice(&data);
                    TungsteniteMessage::Binary(payload)
                }
                AxumWsMessage::Ping(data) => TungsteniteMessage::Ping(data),
                AxumWsMessage::Pong(data) => TungsteniteMessage::Pong(data),
                AxumWsMessage::Close(frame) => {
                    let _ = remote_tx
                        .send(TungsteniteMessage::Close(frame.map(|item| {
                            tokio_tungstenite::tungstenite::protocol::CloseFrame {
                                code: item.code.into(),
                                reason: item.reason.to_string().into(),
                            }
                        })))
                        .await;
                    break;
                }
            };
            if remote_tx.send(outgoing).await.is_err() {
                break;
            }
        }
    };

    let kubernetes_to_browser = async {
        while let Some(message) = remote_rx.next().await {
            let Ok(message) = message else { break };
            let outgoing = match message {
                TungsteniteMessage::Binary(data) => {
                    if data.is_empty() {
                        continue;
                    }
                    let channel = data[0];
                    let payload = &data[1..];
                    match channel {
                        1 | 2 => AxumWsMessage::Binary(payload.to_vec()),
                        3 => AxumWsMessage::Text(
                            format!(
                                "\nKubernetes exec status: {}\n",
                                String::from_utf8_lossy(payload)
                            )
                            .into(),
                        ),
                        _ => continue,
                    }
                }
                TungsteniteMessage::Text(text) => AxumWsMessage::Text(text.into()),
                TungsteniteMessage::Ping(data) => AxumWsMessage::Ping(data),
                TungsteniteMessage::Pong(data) => AxumWsMessage::Pong(data),
                TungsteniteMessage::Close(frame) => {
                    let _ = local_tx
                        .send(AxumWsMessage::Close(frame.map(|item| {
                            axum::extract::ws::CloseFrame {
                                code: item.code.into(),
                                reason: item.reason.to_string().into(),
                            }
                        })))
                        .await;
                    break;
                }
                TungsteniteMessage::Frame(_) => continue,
            };
            if local_tx.send(outgoing).await.is_err() {
                break;
            }
        }
    };

    tokio::select! {
        _ = browser_to_kubernetes => {}
        _ = kubernetes_to_browser => {}
    }
}

async fn get_portainer_instances(State(state): State<AppState>) -> Result<Json<Value>, AppError> {
    let portainer = fetch_portainer_inventory(&state).await;
    Ok(success_json(json!({
        "available": portainer.get("available").cloned().unwrap_or_else(|| json!(false)),
        "source": portainer.get("source").cloned().unwrap_or_else(|| json!("portainer")),
        "error": portainer.get("error").cloned().unwrap_or(Value::Null),
        "instances": portainer.get("instances").cloned().unwrap_or_else(|| json!([])),
    })))
}

async fn get_portainer_environments(
    State(state): State<AppState>,
) -> Result<Json<Value>, AppError> {
    let portainer = fetch_portainer_inventory(&state).await;
    Ok(success_json(json!({
        "available": portainer.get("available").cloned().unwrap_or_else(|| json!(false)),
        "source": portainer.get("source").cloned().unwrap_or_else(|| json!("portainer")),
        "environments": portainer_environments_payload(&portainer),
    })))
}

async fn get_portainer_resources(State(state): State<AppState>) -> Result<Json<Value>, AppError> {
    let portainer = fetch_portainer_inventory(&state).await;
    Ok(success_json(json!({
        "available": portainer.get("available").cloned().unwrap_or_else(|| json!(false)),
        "source": portainer.get("source").cloned().unwrap_or_else(|| json!("portainer")),
        "resources": portainer_resources_payload(&portainer),
    })))
}

async fn get_portainer_capabilities(
    State(state): State<AppState>,
) -> Result<Json<Value>, AppError> {
    let portainer = fetch_portainer_inventory(&state).await;
    let diagnostics = portainer_capabilities_list_payload(&portainer);
    Ok(success_json(json!({
        "available": portainer.get("available").cloned().unwrap_or_else(|| json!(false)),
        "source": portainer.get("source").cloned().unwrap_or_else(|| json!("portainer")),
        "capabilities": diagnostics.get("capabilities").cloned().unwrap_or_else(|| json!([])),
        "groups": diagnostics.get("groups").cloned().unwrap_or_else(|| json!([])),
        "tags": diagnostics.get("tags").cloned().unwrap_or_else(|| json!([])),
        "users": diagnostics.get("users").cloned().unwrap_or_else(|| json!([])),
        "teams": diagnostics.get("teams").cloned().unwrap_or_else(|| json!([])),
        "app_templates": diagnostics.get("app_templates").cloned().unwrap_or_else(|| json!([])),
        "custom_templates": diagnostics.get("custom_templates").cloned().unwrap_or_else(|| json!([])),
    })))
}

async fn post_portainer_action(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Json(input): Json<PortainerControlInput>,
) -> Result<Json<Value>, AppError> {
    let body = HomelabControlInput::from(input);
    let action = body.action.trim();
    let result = run_portainer_action(
        &state,
        action,
        body.instance_id.as_deref(),
        body.resource_type.trim(),
        body.resource_id.trim(),
        &body.args,
        body.confirmation.as_deref(),
    )
    .await?;

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
                    let node = body.args.get("node").and_then(Value::as_str).unwrap_or("");
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
        json!({ "provider": "proxmox", "resource_type": "node", "actions": ["shell", "create-vm", "create-lxc", "reboot", "shutdown"] }),
        json!({ "provider": "proxmox", "resource_type": "service", "actions": ["start", "stop", "restart", "reload"] }),
        json!({ "provider": "proxmox", "resource_type": "backup", "actions": ["restore", "delete-backup"] }),
        json!({ "provider": "proxmox", "resource_type": "storage", "actions": ["enable-storage", "disable-storage"] }),
        json!({ "provider": "proxmox", "resource_type": "ha", "actions": ["set-ha-state", "remove-ha"] }),
        json!({ "provider": "proxmox", "resource_type": "task", "actions": ["task-log", "task-status", "stop-task"] }),
        json!({ "provider": "opnsense", "resource_type": "service", "actions": ["start", "stop", "restart"] }),
        json!({ "provider": "system", "resource_type": "system", "actions": ["open", "healthcheck"] }),
        json!({ "provider": "portainer", "resource_type": "container", "actions": ["start", "stop", "restart", "pause", "unpause", "kill", "logs", "inspect", "stats", "processes", "changes", "exec", "rename", "duplicate", "recreate", "update-restart-policy", "update-resources", "remove"] }),
        json!({ "provider": "portainer", "resource_type": "endpoint", "actions": ["inspect-endpoint", "events", "events-follow", "pull-image", "create-container", "create-stack", "create-service", "install-helm-chart", "create-aci-container-group", "apply-kubernetes-manifest", "preview-kubernetes-manifest", "create-kubernetes-namespace", "create-kubernetes-application", "create-kubernetes-service", "create-kubernetes-ingress", "create-kubernetes-configmap", "create-kubernetes-secret", "create-kubernetes-volume", "create-volume", "create-network", "create-secret", "create-config", "prune-images", "prune-containers", "prune-volumes", "prune-networks"] }),
        json!({ "provider": "portainer", "resource_type": "stack", "actions": ["inspect-stack", "stack-file", "stack-logs", "start-stack", "stop-stack", "update-stack", "redeploy", "delete"] }),
        json!({ "provider": "portainer", "resource_type": "image", "actions": ["inspect-image", "history-image", "tag-image", "remove-image"] }),
        json!({ "provider": "portainer", "resource_type": "volume", "actions": ["inspect-volume", "remove-volume"] }),
        json!({ "provider": "portainer", "resource_type": "network", "actions": ["inspect-network", "connect-container", "disconnect-container", "remove-network"] }),
        json!({ "provider": "portainer", "resource_type": "secret", "actions": ["create-secret", "inspect-secret", "remove-secret"] }),
        json!({ "provider": "portainer", "resource_type": "config", "actions": ["create-config", "inspect-config", "remove-config"] }),
        json!({ "provider": "portainer", "resource_type": "registry", "actions": ["create-registry", "inspect-registry", "update-registry", "remove-registry"] }),
        json!({ "provider": "portainer", "resource_type": "endpoint-group", "actions": ["create-endpoint-group", "inspect-endpoint-group", "update-endpoint-group", "remove-endpoint-group"] }),
        json!({ "provider": "portainer", "resource_type": "tag", "actions": ["create-tag", "inspect-tag", "update-tag", "remove-tag"] }),
        json!({ "provider": "portainer", "resource_type": "user", "actions": ["create-user", "inspect-user", "update-user", "remove-user"] }),
        json!({ "provider": "portainer", "resource_type": "team", "actions": ["create-team", "inspect-team", "update-team", "remove-team"] }),
        json!({ "provider": "portainer", "resource_type": "app-template", "actions": ["app-template-file", "deploy-app-template"] }),
        json!({ "provider": "portainer", "resource_type": "custom-template", "actions": ["create-custom-template", "inspect-custom-template", "custom-template-file", "deploy-custom-template", "update-custom-template", "remove-custom-template"] }),
        json!({ "provider": "portainer", "resource_type": "settings", "actions": ["inspect-settings", "update-settings"] }),
        json!({ "provider": "portainer", "resource_type": "swarm-service", "actions": ["inspect-service", "service-logs", "update-service", "scale-service", "rollback-service", "remove-service"] }),
        json!({ "provider": "portainer", "resource_type": "swarm-node", "actions": ["inspect-node", "update-node-availability"] }),
        json!({ "provider": "portainer", "resource_type": "swarm-task", "actions": ["inspect-task", "task-logs"] }),
        json!({ "provider": "portainer", "resource_type": "kubernetes-namespace", "actions": ["inspect-kubernetes-namespace", "delete-kubernetes-namespace"] }),
        json!({ "provider": "portainer", "resource_type": "kubernetes-application", "actions": ["inspect-kubernetes-application", "delete-kubernetes-application"] }),
        json!({ "provider": "portainer", "resource_type": "kubernetes-pod", "actions": ["inspect-kubernetes-pod", "kubernetes-pod-logs", "kubernetes-pod-exec", "delete-kubernetes-pod"] }),
        json!({ "provider": "portainer", "resource_type": "kubernetes-service", "actions": ["inspect-kubernetes-service", "delete-kubernetes-service"] }),
        json!({ "provider": "portainer", "resource_type": "kubernetes-ingress", "actions": ["inspect-kubernetes-ingress", "delete-kubernetes-ingress"] }),
        json!({ "provider": "portainer", "resource_type": "kubernetes-configmap", "actions": ["inspect-kubernetes-configmap", "delete-kubernetes-configmap"] }),
        json!({ "provider": "portainer", "resource_type": "kubernetes-secret", "actions": ["inspect-kubernetes-secret", "delete-kubernetes-secret"] }),
        json!({ "provider": "portainer", "resource_type": "kubernetes-volume", "actions": ["inspect-kubernetes-volume", "delete-kubernetes-volume"] }),
        json!({ "provider": "portainer", "resource_type": "kubernetes-crd", "actions": ["inspect-kubernetes-crd"] }),
        json!({ "provider": "portainer", "resource_type": "helm-release", "actions": ["inspect-helm-release", "helm-release-history", "rollback-helm-release", "uninstall-helm-release"] }),
        json!({ "provider": "portainer", "resource_type": "aci-container-group", "actions": ["inspect-aci-container-group", "delete-aci-container-group"] }),
    ];
    if docker_ssh_live && !portainer_live {
        control_actions.push(json!({ "provider": "docker-ssh", "resource_type": "container", "actions": ["start", "stop", "restart", "pause", "unpause", "kill", "logs", "inspect", "stats", "remove"] }));
    }
    control_actions
}

fn proxmox_parity_capabilities() -> Vec<Value> {
    vec![
        json!({ "provider": "proxmox", "resource_type": "node", "surface": "Console", "action": "shell", "status": "implemented", "embedded": true, "backend": "termproxy-vncwebsocket" }),
        json!({ "provider": "proxmox", "resource_type": "vm", "surface": "Console", "action": "console", "status": "implemented", "embedded": true, "backend": "vncproxy-vncwebsocket" }),
        json!({ "provider": "proxmox", "resource_type": "lxc", "surface": "Console", "action": "console", "status": "implemented", "embedded": true, "backend": "vncproxy-vncwebsocket" }),
        json!({ "provider": "proxmox", "resource_type": "node", "surface": "Create", "action": "create-vm", "status": "implemented", "backend": "proxmox-api" }),
        json!({ "provider": "proxmox", "resource_type": "node", "surface": "Create", "action": "create-lxc", "status": "implemented", "backend": "proxmox-api" }),
        json!({ "provider": "proxmox", "resource_type": "node", "surface": "Node power", "action": "reboot", "status": "implemented", "backend": "proxmox-api" }),
        json!({ "provider": "proxmox", "resource_type": "node", "surface": "Node power", "action": "shutdown", "status": "implemented", "backend": "proxmox-api" }),
        json!({ "provider": "proxmox", "resource_type": "vm", "surface": "Guest lifecycle", "action": "start/shutdown/reboot/stop/delete", "status": "implemented", "backend": "proxmox-api", "reason": "Individual toolbar actions are advertised in control.actions." }),
        json!({ "provider": "proxmox", "resource_type": "lxc", "surface": "Guest lifecycle", "action": "start/shutdown/reboot/stop/delete", "status": "implemented", "backend": "proxmox-api", "reason": "Individual toolbar actions are advertised in control.actions." }),
        json!({ "provider": "proxmox", "resource_type": "vm", "surface": "Guest config", "action": "cpu-memory-name-tags-onboot-protection-network-disk", "status": "implemented", "backend": "proxmox-api" }),
        json!({ "provider": "proxmox", "resource_type": "lxc", "surface": "Guest config", "action": "cpu-memory-name-tags-onboot-protection-network-disk", "status": "implemented", "backend": "proxmox-api" }),
        json!({ "provider": "proxmox", "resource_type": "vm", "surface": "Snapshots", "action": "snapshot/rollback-snapshot/delete-snapshot", "status": "implemented", "backend": "proxmox-api" }),
        json!({ "provider": "proxmox", "resource_type": "lxc", "surface": "Snapshots", "action": "snapshot/rollback-snapshot/delete-snapshot", "status": "implemented", "backend": "proxmox-api" }),
        json!({ "provider": "proxmox", "resource_type": "backup", "surface": "Backups", "action": "manual-backup/delete-backup/restore", "status": "implemented", "backend": "proxmox-api", "next": "Add scheduled jobs, retention, prune, notes, and browser restore workflow polish." }),
        json!({ "provider": "proxmox", "resource_type": "vm", "surface": "Guest firewall", "action": "set-firewall/add-firewall-rule/update-firewall-rule/delete-firewall-rule", "status": "implemented", "backend": "proxmox-api" }),
        json!({ "provider": "proxmox", "resource_type": "lxc", "surface": "Guest firewall", "action": "set-firewall/add-firewall-rule/update-firewall-rule/delete-firewall-rule", "status": "implemented", "backend": "proxmox-api" }),
        json!({ "provider": "proxmox", "resource_type": "ha", "surface": "Guest HA", "action": "add-ha/set-ha-state/remove-ha", "status": "implemented", "backend": "proxmox-api" }),
        json!({ "provider": "proxmox", "resource_type": "ha", "surface": "HA manager", "action": "groups-status-crm-lrm", "status": "read_only", "backend": "proxmox-api-ha-manager", "next": "Implement HA group CRUD, placement policy editing, and node evacuation/maintenance flows." }),
        json!({ "provider": "proxmox", "resource_type": "task", "surface": "Tasks", "action": "task-log/task-status/stop-task", "status": "implemented", "backend": "proxmox-api" }),
        json!({ "provider": "proxmox", "resource_type": "service", "surface": "Node services", "action": "start/stop/restart/reload", "status": "implemented", "backend": "proxmox-api" }),
        json!({ "provider": "proxmox", "resource_type": "storage", "surface": "Storage", "action": "enable-storage/disable-storage", "status": "implemented", "backend": "proxmox-api" }),
        json!({ "provider": "proxmox", "resource_type": "storage", "surface": "Storage", "action": "reload-storage", "status": "blocked", "backend": "missing", "reason": "No backend handler exists; UI must not render this action." }),
        json!({ "provider": "proxmox", "resource_type": "storage", "surface": "Storage content", "action": "list-iso-template-image-rootdir-backup", "status": "read_only", "backend": "proxmox-api-content-inventory", "next": "Implement upload, download, delete, protect/unprotect, notes, and storage browser task tracking." }),
        json!({ "provider": "proxmox", "resource_type": "storage", "surface": "Storage content", "action": "upload-download-delete-protect-unprotect-notes", "status": "blocked", "backend": "missing", "next": "Implement guarded content mutation endpoints for ISO, vztmpl, backup, image, snippets, and rootdir volumes." }),
        json!({ "provider": "proxmox", "resource_type": "backup-job", "surface": "Backup jobs", "action": "list-schedules-retention-selections", "status": "read_only", "backend": "proxmox-api-cluster-backup", "next": "Implement backup job create/update/delete/run, prune simulator, and task tracking." }),
        json!({ "provider": "proxmox", "resource_type": "backup-job", "surface": "Backup jobs", "action": "create-update-delete-run-prune-retention", "status": "blocked", "backend": "missing", "next": "Implement guarded cluster backup job CRUD, schedules, retention, prune, and job task tracking." }),
        json!({ "provider": "proxmox", "resource_type": "node-network", "surface": "Node network", "action": "interfaces-dns-hosts-time-apply-revert", "status": "read_only", "backend": "proxmox-api-inventory", "next": "Implement editable interface/DNS/hosts/time forms with apply/revert task flow." }),
        json!({ "provider": "proxmox", "resource_type": "node-update", "surface": "Node updates", "action": "repositories-apt-update-upgrade-changelog", "status": "read_only", "backend": "proxmox-api-repositories", "next": "Implement apt update, upgrade, package install/remove, changelog, and task logs." }),
        json!({ "provider": "proxmox", "resource_type": "node-disks", "surface": "Node disks", "action": "disks-zfs-lvm-lvmthin-directory-ceph", "status": "read_only", "backend": "storage-inventory-only", "next": "Implement disk, ZFS, LVM, LVM-thin, directory, and Ceph API panels with guarded destructive actions." }),
        json!({ "provider": "proxmox", "resource_type": "firewall", "surface": "Datacenter firewall", "action": "options-rules-aliases-ipsets-security-groups", "status": "read_only", "backend": "proxmox-api-cluster-firewall", "next": "Implement datacenter firewall writes, macros/refs, and node firewall inventory." }),
        json!({ "provider": "proxmox", "resource_type": "firewall", "surface": "Datacenter/node firewall", "action": "create-update-delete-options-rules-aliases-ipsets-security-groups-macros", "status": "blocked", "backend": "guest-only", "next": "Implement datacenter and node firewall mutation endpoints plus aliases, ipsets, groups, and macros." }),
        json!({ "provider": "proxmox", "resource_type": "permissions", "surface": "Permissions", "action": "users-groups-roles-api-tokens-acl-realms", "status": "read_only", "backend": "proxmox-api-access-inventory", "next": "Implement guarded users, groups, roles, tokens, ACL, and realm mutation flows with permission previews." }),
        json!({ "provider": "proxmox", "resource_type": "permissions", "surface": "Permissions", "action": "create-update-delete-users-groups-roles-api-tokens-acl-realms", "status": "blocked", "backend": "missing", "next": "Add write handlers, typed confirmations for destructive permission edits, and audit/task feedback." }),
        json!({ "provider": "proxmox", "resource_type": "sdn", "surface": "SDN", "action": "zones-vnets-subnets-ipam-dns-dhcp-status", "status": "read_only", "backend": "proxmox-api-sdn-inventory", "next": "Implement SDN CRUD, apply, rollback, and task/state verification." }),
        json!({ "provider": "proxmox", "resource_type": "sdn", "surface": "SDN", "action": "create-update-delete-apply-rollback", "status": "blocked", "backend": "missing", "next": "Implement guarded SDN mutation endpoints for zones, VNets, subnets, providers, and apply/rollback." }),
        json!({ "provider": "proxmox", "resource_type": "ha", "surface": "HA manager", "action": "create-update-delete-groups-placement-maintenance", "status": "blocked", "backend": "resource-only", "next": "Implement HA groups, policy fields, manager maintenance/evacuation actions, and placement diagnostics." }),
        json!({ "provider": "proxmox", "resource_type": "replication", "surface": "Replication", "action": "list-jobs-status", "status": "read_only", "backend": "proxmox-api-cluster-replication", "next": "Implement replication job create/update/delete/run and status task/log tracking." }),
        json!({ "provider": "proxmox", "resource_type": "replication", "surface": "Replication", "action": "jobs-create-update-delete-run-status", "status": "blocked", "backend": "missing", "next": "Implement replication job CRUD and task/log tracking." }),
        json!({ "provider": "proxmox", "resource_type": "pool", "surface": "Pools", "action": "list-members", "status": "read_only", "backend": "proxmox-api-pools", "next": "Implement pool create/update/delete and guest/storage membership management." }),
        json!({ "provider": "proxmox", "resource_type": "pool", "surface": "Pools", "action": "create-update-delete-members", "status": "blocked", "backend": "missing", "next": "Implement pool create/update/delete and membership management." }),
        json!({ "provider": "proxmox", "resource_type": "certificates", "surface": "Certificates/ACME", "action": "certificates-acme-accounts-plugins-orders", "status": "blocked", "backend": "missing", "next": "Implement node cert upload, ACME account/plugin/order flows, and restart warnings." }),
        json!({ "provider": "proxmox", "resource_type": "notifications", "surface": "Notifications", "action": "matchers-targets-test-history", "status": "blocked", "backend": "missing", "next": "Implement notification targets, matchers, test sends, and history." }),
        json!({ "provider": "proxmox", "resource_type": "logs", "surface": "Logs", "action": "syslog-journal-cluster-log", "status": "read_only", "backend": "proxmox-api-logs", "next": "Implement search, download, follow/tail streaming, severity filters, and journal cursor controls." }),
    ]
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
            "parity_version": 1,
            "capabilities": proxmox_parity_capabilities(),
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
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;
    use tokio::sync::RwLock as TokioRwLock;

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

    #[test]
    fn test_portainer_environments_payload_flattens_instances() {
        let portainer = json!({
            "available": true,
            "instances": [
                {
                    "id": "primary",
                    "name": "Primary Portainer",
                    "url": "https://portainer.local",
                    "endpoints": [
                        { "id": 3, "name": "docker-prod", "status": 1, "url": "tcp://10.0.0.3:9001", "GroupId": 7, "TagIds": [1, 2] }
                    ]
                }
            ]
        });

        let environments = portainer_environments_payload(&portainer);
        let rows = environments.as_array().expect("environment rows");
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0]["instance_id"], "primary");
        assert_eq!(rows[0]["instance_name"], "Primary Portainer");
        assert_eq!(rows[0]["endpoint_id"], 3);
        assert_eq!(rows[0]["name"], "docker-prod");
        assert_eq!(rows[0]["group_id"], 7);
        assert_eq!(rows[0]["tags"], json!([1, 2]));
    }

    #[test]
    fn test_portainer_resources_payload_keeps_resource_buckets() {
        let portainer = json!({
            "containers": [{ "id": "abc", "name": "nginx" }],
            "stacks": [{ "id": 8, "name": "infra" }],
            "images": [{ "id": "sha256:image" }],
            "volumes": [{ "name": "data" }],
            "networks": [{ "id": "net" }],
            "secrets": [{ "id": "secret" }],
            "configs": [{ "id": "config" }],
            "registries": [{ "id": 4, "name": "ghcr" }],
            "groups": [{ "id": 1, "name": "prod" }],
            "tags": [{ "id": 2, "name": "edge" }],
            "users": [{ "id": 3, "username": "admin" }],
            "teams": [{ "id": 4, "name": "operators" }],
            "app_templates": [{ "id": 6, "title": "redis" }],
            "custom_templates": [{ "id": 5, "title": "nginx" }],
            "swarm_services": [{ "id": "svc", "name": "web" }],
            "swarm_nodes": [{ "id": "node", "hostname": "manager" }],
            "swarm_tasks": [{ "id": "task", "state": "running" }],
            "kubernetes_namespaces": [{ "name": "apps" }],
            "kubernetes_applications": [{ "name": "api", "kind": "Deployment" }],
            "kubernetes_pods": [{ "name": "api-123", "status": "Running" }],
            "kubernetes_services": [{ "name": "api" }],
            "kubernetes_ingresses": [{ "name": "api" }],
            "kubernetes_configmaps": [{ "name": "api-config" }],
            "kubernetes_secrets": [{ "name": "api-secret" }],
            "kubernetes_volumes": [{ "name": "api-data" }],
            "kubernetes_crds": [{ "name": "widgets.example.com" }],
            "kubernetes_helm_releases": [{ "name": "nginx", "namespace": "apps" }],
            "aci_subscriptions": [{ "id": "sub-1", "name": "Production Subscription" }],
            "aci_resource_groups": [{ "name": "rg-prod", "subscription_id": "sub-1" }],
            "aci_container_groups": [{ "name": "web-aci", "status": "Running" }]
        });

        let resources = portainer_resources_payload(&portainer);
        assert_eq!(resources["containers"][0]["name"], "nginx");
        assert_eq!(resources["stacks"][0]["name"], "infra");
        assert_eq!(resources["registries"][0]["name"], "ghcr");
        assert_eq!(resources["groups"][0]["name"], "prod");
        assert_eq!(resources["tags"][0]["name"], "edge");
        assert_eq!(resources["users"][0]["username"], "admin");
        assert_eq!(resources["teams"][0]["name"], "operators");
        assert_eq!(resources["app_templates"][0]["title"], "redis");
        assert_eq!(resources["custom_templates"][0]["title"], "nginx");
        assert_eq!(resources["swarm_services"][0]["name"], "web");
        assert_eq!(resources["swarm_nodes"][0]["hostname"], "manager");
        assert_eq!(resources["swarm_tasks"][0]["state"], "running");
        assert_eq!(resources["kubernetes_namespaces"][0]["name"], "apps");
        assert_eq!(resources["kubernetes_applications"][0]["name"], "api");
        assert_eq!(resources["kubernetes_pods"][0]["status"], "Running");
        assert_eq!(
            resources["kubernetes_crds"][0]["name"],
            "widgets.example.com"
        );
        assert_eq!(resources["kubernetes_helm_releases"][0]["name"], "nginx");
        assert_eq!(resources["aci_subscriptions"][0]["id"], "sub-1");
        assert_eq!(resources["aci_resource_groups"][0]["name"], "rg-prod");
        assert_eq!(resources["aci_container_groups"][0]["name"], "web-aci");
        assert!(resources["configs"].is_array());
    }

    #[test]
    fn test_portainer_docker_info_payload_normalizes_engine_fields() {
        let payload = portainer_docker_info_payload(&json!({
            "Name": "agent-vm",
            "ServerVersion": "26.1.4",
            "OperatingSystem": "Debian GNU/Linux 12",
            "OSType": "linux",
            "Architecture": "x86_64",
            "NCPU": 4,
            "MemTotal": 8589934592u64,
            "Containers": 7,
            "ContainersRunning": 5,
            "ContainersPaused": 1,
            "ContainersStopped": 1,
            "Images": 12,
            "DockerRootDir": "/var/lib/docker",
            "Driver": "overlay2",
            "Swarm": {
                "LocalNodeState": "active",
                "ControlAvailable": true
            }
        }));

        assert_eq!(payload["name"], "agent-vm");
        assert_eq!(payload["server_version"], "26.1.4");
        assert_eq!(payload["operating_system"], "Debian GNU/Linux 12");
        assert_eq!(payload["cpus"], 4);
        assert_eq!(payload["memory_bytes"], 8589934592u64);
        assert_eq!(payload["containers_running"], 5);
        assert_eq!(payload["images"], 12);
        assert_eq!(payload["docker_root_dir"], "/var/lib/docker");
        assert_eq!(payload["driver"], "overlay2");
        assert_eq!(payload["swarm_local_node_state"], "active");
        assert_eq!(payload["swarm_control_available"], true);
    }

    #[test]
    fn test_docker_container_helpers_normalize_ports_and_networks() {
        let row = json!({
            "Ports": [
                { "PrivatePort": 80, "PublicPort": 8080, "Type": "tcp", "IP": "0.0.0.0" },
                { "PrivatePort": 443, "Type": "tcp" }
            ],
            "NetworkSettings": {
                "Networks": {
                    "frontend": {},
                    "backend": {}
                }
            },
            "Mounts": [{ "Name": "nginx_data" }, { "Type": "bind" }]
        });

        assert_eq!(
            docker_container_port_summary(&row),
            "0.0.0.0:8080->80/tcp, 443/tcp"
        );
        assert_eq!(
            docker_container_network_names(&row),
            vec!["backend".to_string(), "frontend".to_string()]
        );
        assert_eq!(docker_container_mount_count(&row), Some(2));
    }

    #[test]
    fn test_docker_network_helpers_normalize_ipam_and_container_count() {
        let row = json!({
            "IPAM": {
                "Config": [
                    { "Subnet": "172.20.0.0/16", "Gateway": "172.20.0.1" },
                    { "Subnet": "fd00::/64" }
                ]
            },
            "Containers": {
                "abc123": {},
                "def456": {}
            }
        });

        assert_eq!(
            docker_network_ipam_summary(&row),
            "172.20.0.0/16 via 172.20.0.1, fd00::/64"
        );
        assert_eq!(docker_network_container_count(&row), Some(2));
    }

    #[test]
    fn test_object_field_count_handles_volume_labels_and_options() {
        let row = json!({
            "Labels": {
                "com.docker.compose.project": "infra",
                "owner": "ops"
            },
            "Options": {
                "type": "nfs"
            }
        });

        assert_eq!(object_field_count(&row, "Labels"), 2);
        assert_eq!(object_field_count(&row, "Options"), 1);
        assert_eq!(object_field_count(&row, "Missing"), 0);
    }

    #[test]
    fn test_portainer_capabilities_payload_detects_platforms() {
        let instance = json!({
            "status": { "Version": "2.39.0", "Edition": "CE" },
            "settings": { "EdgeAgentCheckinInterval": 5 },
            "system_status": { "Nodes": 1 },
            "groups": [{ "id": 1 }],
            "tags": [{ "id": 2 }, { "id": 3 }],
            "users": [{ "id": 1, "username": "admin" }],
            "teams": [{ "id": 1, "name": "operators" }],
            "app_templates": [{ "id": 1, "title": "redis" }],
            "custom_templates": [{ "id": 1, "title": "nginx" }],
            "swarm_services": [{ "id": "svc", "name": "web" }],
            "swarm_nodes": [{ "id": "node", "hostname": "manager" }],
            "swarm_tasks": [{ "id": "task", "state": "running" }],
            "kubernetes_namespaces": [{ "name": "apps" }],
            "kubernetes_applications": [{ "name": "api", "kind": "Deployment" }],
            "kubernetes_pods": [{ "name": "api-123", "status": "Running" }],
            "kubernetes_services": [{ "name": "api" }],
            "kubernetes_ingresses": [{ "name": "api" }],
            "kubernetes_configmaps": [{ "name": "api-config" }],
            "kubernetes_secrets": [{ "name": "api-secret" }],
            "kubernetes_volumes": [{ "name": "api-data" }],
            "kubernetes_crds": [{ "name": "widgets.example.com" }],
            "kubernetes_helm_releases": [{ "name": "nginx", "namespace": "apps" }],
            "aci_subscriptions": [{ "id": "sub-1", "name": "Production Subscription" }],
            "aci_resource_groups": [{ "name": "rg-prod", "subscription_id": "sub-1" }],
            "aci_container_groups": [{ "name": "web-aci", "status": "Running" }],
            "endpoints": [
                { "id": 1, "name": "docker", "type": 1, "platform": "docker", "features": ["swarm"] },
                { "id": 2, "name": "k8s", "type": 6, "platform": "kubernetes", "features": [] },
                { "id": 3, "name": "aci", "type": 3, "platform": "aci", "features": [] }
            ]
        });

        let capabilities = portainer_capabilities_payload(&instance);
        assert_eq!(capabilities["version"], "2.39.0");
        assert_eq!(capabilities["edition"], "CE");
        assert_eq!(capabilities["docker"], true);
        assert_eq!(capabilities["swarm"], true);
        assert_eq!(capabilities["kubernetes"], true);
        assert_eq!(capabilities["aci"], true);
        assert_eq!(capabilities["groups"], 1);
        assert_eq!(capabilities["tags"], 2);
        assert_eq!(capabilities["users"], 1);
        assert_eq!(capabilities["teams"], 1);
        assert_eq!(capabilities["app_templates"], 1);
        assert_eq!(capabilities["custom_templates"], 1);
        assert_eq!(capabilities["swarm_services"], 1);
        assert_eq!(capabilities["swarm_nodes"], 1);
        assert_eq!(capabilities["swarm_tasks"], 1);
        assert_eq!(capabilities["kubernetes_namespaces"], 1);
        assert_eq!(capabilities["kubernetes_applications"], 1);
        assert_eq!(capabilities["kubernetes_pods"], 1);
        assert_eq!(capabilities["kubernetes_services"], 1);
        assert_eq!(capabilities["kubernetes_ingresses"], 1);
        assert_eq!(capabilities["kubernetes_configmaps"], 1);
        assert_eq!(capabilities["kubernetes_secrets"], 1);
        assert_eq!(capabilities["kubernetes_volumes"], 1);
        assert_eq!(capabilities["kubernetes_crds"], 1);
        assert_eq!(capabilities["kubernetes_helm_releases"], 1);
        assert_eq!(capabilities["aci_subscriptions"], 1);
        assert_eq!(capabilities["aci_resource_groups"], 1);
        assert_eq!(capabilities["aci_container_groups"], 1);
        assert_eq!(capabilities["settings"], true);
        assert_eq!(capabilities["system_status"], true);
    }

    #[test]
    fn test_helm_request_helpers_build_portainer_paths_and_body() {
        let args = json!({
            "name": "nginx",
            "namespace": "apps",
            "chart": "bitnami/nginx",
            "repo": "https://charts.bitnami.com/bitnami",
            "version": "15.0.0",
            "values": "replicaCount: 2\n",
            "atomic": true,
            "dry_run": true
        });
        assert_eq!(
            helm_install_path(6, &args),
            "/endpoints/6/kubernetes/helm?dryRun=true"
        );
        let body = helm_install_body(&args).expect("helm install body");
        assert_eq!(body["name"], "nginx");
        assert_eq!(body["namespace"], "apps");
        assert_eq!(body["chart"], "bitnami/nginx");
        assert_eq!(body["repo"], "https://charts.bitnami.com/bitnami");
        assert_eq!(body["version"], "15.0.0");
        assert_eq!(body["atomic"], true);

        assert_eq!(
            helm_release_path(
                6,
                "6:nginx",
                &json!({ "namespace": "apps", "show_resources": true, "revision": 2 }),
                None
            )
            .expect("helm inspect path"),
            "/endpoints/6/kubernetes/helm/nginx?namespace=apps&showResources=true&revision=2"
        );
        assert_eq!(
            helm_release_path(
                6,
                "nginx",
                &json!({ "namespace": "apps" }),
                Some("/history")
            )
            .expect("helm history path"),
            "/endpoints/6/kubernetes/helm/nginx/history?namespace=apps"
        );
        assert_eq!(
            helm_rollback_path(
                6,
                "nginx",
                &json!({ "namespace": "apps", "revision": 1, "wait": true, "waitForJobs": true, "timeout": 120 })
            )
            .expect("helm rollback path"),
            "/endpoints/6/kubernetes/helm/nginx/rollback?namespace=apps&revision=1&wait=true&waitForJobs=true&timeout=120"
        );
    }

    #[test]
    fn test_aci_request_helpers_build_portainer_paths_and_body() {
        let resource_id = "/subscriptions/sub-1/resourceGroups/rg-prod/providers/Microsoft.ContainerInstance/containerGroups/web-aci";
        assert_eq!(
            aci_container_group_id(resource_id).expect("valid ACI id"),
            resource_id
        );
        assert_eq!(
            aci_resource_group_from_id(resource_id).expect("resource group"),
            "rg-prod"
        );

        let (path, body) = aci_container_group_create_request(
            9,
            &json!({
                "subscription_id": "sub-1",
                "resource_group": "rg-prod",
                "name": "web-aci",
                "location": "eastus",
                "image": "nginx:latest",
                "os": "Linux",
                "cpu": 2,
                "memory": 4,
                "ports": "443:8443/tcp",
                "env": "APP_ENV=production",
                "allocate_public_ip": true
            }),
        )
        .expect("ACI create request");

        assert_eq!(
            path,
            "/endpoints/9/azure/subscriptions/sub-1/resourceGroups/rg-prod/providers/Microsoft.ContainerInstance/containerGroups/web-aci?api-version=2018-04-01"
        );
        assert_eq!(body["location"], "eastus");
        assert_eq!(body["properties"]["osType"], "Linux");
        assert_eq!(body["properties"]["ipAddress"]["type"], "Public");
        assert_eq!(
            body["properties"]["containers"][0]["properties"]["image"],
            "nginx:latest"
        );
        assert_eq!(
            body["properties"]["containers"][0]["properties"]["ports"][0]["port"],
            8443
        );
        assert_eq!(
            body["properties"]["ipAddress"]["ports"][0],
            json!({ "port": 443, "protocol": "TCP" })
        );
        assert_eq!(
            body["properties"]["containers"][0]["properties"]["resources"]["requests"]["cpu"],
            2
        );
        assert!(aci_container_group_id("web-aci").is_err());
    }

    #[test]
    fn test_portainer_container_logs_path_supports_follow_streaming() {
        assert_eq!(
            portainer_container_logs_path(3, "abc/123", 200, false),
            "/endpoints/3/docker/containers/abc%2F123/logs?stdout=1&stderr=1&timestamps=1&tail=200"
        );
        assert_eq!(
            portainer_container_logs_path(3, "abc/123", 300, true),
            "/endpoints/3/docker/containers/abc%2F123/logs?stdout=1&stderr=1&timestamps=1&tail=300&follow=1"
        );
    }

    #[test]
    fn test_portainer_docker_events_path_supports_follow_streaming() {
        assert_eq!(
            portainer_docker_events_path(3, Some(1779235200), None, None),
            "/endpoints/3/docker/events?since=1779235200"
        );
        assert_eq!(
            portainer_docker_events_path(3, Some(1779235200), Some(1779238800), Some("%7B%22type%22%3A%5B%22container%22%5D%7D")),
            "/endpoints/3/docker/events?since=1779235200&until=1779238800&filters=%7B%22type%22%3A%5B%22container%22%5D%7D"
        );
    }

    #[test]
    fn test_portainer_terminal_session_input_parses_exec_aliases() {
        let input: PortainerTerminalSessionInput = serde_json::from_value(json!({
            "instanceId": "primary",
            "resource_type": "container",
            "resource_id": "abc123",
            "action": "exec",
            "args": { "endpoint_id": 3, "command": "whoami" }
        }))
        .expect("terminal input");
        assert_eq!(input.instance_id.as_deref(), Some("primary"));
        assert_eq!(input.resource_type, "container");
        assert_eq!(input.resource_id, "abc123");
        assert_eq!(input.action, "exec");
        assert_eq!(
            portainer_exec_cmd(&input.args).unwrap(),
            vec!["sh", "-lc", "whoami"]
        );
    }

    #[test]
    fn test_portainer_container_exec_ws_url_encodes_exec_id_and_token() {
        let session = PortainerTerminalSession {
            kind: PortainerTerminalKind::ContainerExec,
            config: PortainerInstanceConfig {
                id: "lab".into(),
                name: "Lab".into(),
                url: "https://portainer.local".into(),
                token: "ptr_example/with+chars=".into(),
            },
            endpoint_id: 3,
            resource_id: "abc123".into(),
            target_label: "nginx".into(),
            command: vec!["sh".into()],
            tail: 300,
            since: None,
            event_filters: None,
            namespace: None,
            container: None,
            expires_at: Instant::now() + Duration::from_secs(90),
        };

        let url = portainer_container_exec_ws_url(&session, "exec/id+1");
        assert_eq!(
            url,
            "wss://portainer.local/api/websocket/exec?endpointId=3&id=exec%2Fid%2B1&token=ptr_example%2Fwith%2Bchars%3D"
        );
    }

    #[test]
    fn test_portainer_kubernetes_pod_exec_ws_url_encodes_command() {
        let session = PortainerTerminalSession {
            kind: PortainerTerminalKind::KubernetesPodExec,
            config: PortainerInstanceConfig {
                id: "lab".into(),
                name: "Lab".into(),
                url: "https://portainer.local".into(),
                token: "token".into(),
            },
            endpoint_id: 6,
            resource_id: "api-deployment-7d9c".into(),
            target_label: "api-deployment-7d9c".into(),
            command: vec!["sh".into(), "-lc".into(), "whoami && id".into()],
            tail: 300,
            since: None,
            event_filters: None,
            namespace: Some("apps".into()),
            container: Some("api".into()),
            expires_at: Instant::now() + Duration::from_secs(90),
        };

        let url = portainer_kubernetes_pod_exec_ws_url(&session).expect("pod exec websocket url");
        assert!(url.starts_with("wss://portainer.local/api/endpoints/6/kubernetes/api/v1/namespaces/apps/pods/api-deployment-7d9c/exec?"));
        assert!(url.contains("stdin=true"));
        assert!(url.contains("stdout=true"));
        assert!(url.contains("stderr=true"));
        assert!(url.contains("tty=true"));
        assert!(url.contains("container=api"));
        assert!(url.contains("command=sh"));
        assert!(url.contains("command=-lc"));
        assert!(url.contains("command=whoami%20%26%26%20id"));
    }

    #[test]
    fn test_portainer_control_input_forces_portainer_provider() {
        let input = PortainerControlInput {
            instance_id: Some("primary".into()),
            resource_type: "container".into(),
            resource_id: "abc123".into(),
            action: "restart".into(),
            args: json!({ "endpoint_id": 3 }),
            confirmation: None,
        };
        let body = HomelabControlInput::from(input);
        assert_eq!(body.provider, "portainer");
        assert_eq!(body.instance_id.as_deref(), Some("primary"));
        assert_eq!(body.resource_type, "container");
        assert_eq!(body.resource_id, "abc123");
        assert_eq!(body.action, "restart");
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

        let endpoint_actions =
            manifest_actions_for(&portainer_live_manifest, "portainer", "endpoint");
        assert!(endpoint_actions.contains(&"events".to_string()));
        assert!(endpoint_actions.contains(&"events-follow".to_string()));
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
    fn test_proxmox_parity_capabilities_track_embedded_and_blocked_surfaces() {
        let capabilities = proxmox_parity_capabilities();
        assert!(capabilities.iter().any(|item| {
            item["provider"] == "proxmox"
                && item["resource_type"] == "node"
                && item["action"] == "shell"
                && item["status"] == "implemented"
                && item["embedded"] == true
                && item["backend"] == "termproxy-vncwebsocket"
        }));
        assert!(capabilities.iter().any(|item| {
            item["provider"] == "proxmox"
                && item["resource_type"] == "vm"
                && item["action"] == "console"
                && item["status"] == "implemented"
                && item["embedded"] == true
                && item["backend"] == "vncproxy-vncwebsocket"
        }));
        assert!(capabilities.iter().any(|item| {
            item["provider"] == "proxmox"
                && item["resource_type"] == "storage"
                && item["action"] == "reload-storage"
                && item["status"] == "blocked"
        }));
        assert!(capabilities.iter().any(|item| {
            item["provider"] == "proxmox"
                && item["resource_type"] == "storage"
                && item["action"] == "list-iso-template-image-rootdir-backup"
                && item["status"] == "read_only"
                && item["backend"] == "proxmox-api-content-inventory"
        }));
        assert!(capabilities.iter().any(|item| {
            item["provider"] == "proxmox"
                && item["resource_type"] == "storage"
                && item["action"] == "upload-download-delete-protect-unprotect-notes"
                && item["status"] == "blocked"
        }));
        assert!(capabilities.iter().any(|item| {
            item["provider"] == "proxmox"
                && item["resource_type"] == "backup-job"
                && item["action"] == "list-schedules-retention-selections"
                && item["status"] == "read_only"
                && item["backend"] == "proxmox-api-cluster-backup"
        }));
        assert!(capabilities.iter().any(|item| {
            item["provider"] == "proxmox"
                && item["resource_type"] == "backup-job"
                && item["action"] == "create-update-delete-run-prune-retention"
                && item["status"] == "blocked"
        }));
        assert!(capabilities.iter().any(|item| {
            item["provider"] == "proxmox"
                && item["resource_type"] == "firewall"
                && item["action"] == "options-rules-aliases-ipsets-security-groups"
                && item["status"] == "read_only"
                && item["backend"] == "proxmox-api-cluster-firewall"
        }));
        assert!(capabilities.iter().any(|item| {
            item["provider"] == "proxmox"
                && item["resource_type"] == "firewall"
                && item["action"]
                    == "create-update-delete-options-rules-aliases-ipsets-security-groups-macros"
                && item["status"] == "blocked"
        }));
        assert!(capabilities.iter().any(|item| {
            item["provider"] == "proxmox"
                && item["resource_type"] == "ha"
                && item["action"] == "groups-status-crm-lrm"
                && item["status"] == "read_only"
                && item["backend"] == "proxmox-api-ha-manager"
        }));
        assert!(capabilities.iter().any(|item| {
            item["provider"] == "proxmox"
                && item["resource_type"] == "ha"
                && item["action"] == "create-update-delete-groups-placement-maintenance"
                && item["status"] == "blocked"
        }));
        assert!(capabilities.iter().any(|item| {
            item["provider"] == "proxmox"
                && item["resource_type"] == "replication"
                && item["action"] == "list-jobs-status"
                && item["status"] == "read_only"
                && item["backend"] == "proxmox-api-cluster-replication"
        }));
        assert!(capabilities.iter().any(|item| {
            item["provider"] == "proxmox"
                && item["resource_type"] == "replication"
                && item["action"] == "jobs-create-update-delete-run-status"
                && item["status"] == "blocked"
        }));
        assert!(capabilities.iter().any(|item| {
            item["provider"] == "proxmox"
                && item["resource_type"] == "pool"
                && item["action"] == "list-members"
                && item["status"] == "read_only"
                && item["backend"] == "proxmox-api-pools"
        }));
        assert!(capabilities.iter().any(|item| {
            item["provider"] == "proxmox"
                && item["resource_type"] == "pool"
                && item["action"] == "create-update-delete-members"
                && item["status"] == "blocked"
        }));
        assert!(capabilities.iter().any(|item| {
            item["provider"] == "proxmox"
                && item["resource_type"] == "permissions"
                && item["action"] == "users-groups-roles-api-tokens-acl-realms"
                && item["status"] == "read_only"
                && item["backend"] == "proxmox-api-access-inventory"
        }));
        assert!(capabilities.iter().any(|item| {
            item["provider"] == "proxmox"
                && item["resource_type"] == "permissions"
                && item["action"] == "create-update-delete-users-groups-roles-api-tokens-acl-realms"
                && item["status"] == "blocked"
        }));
        assert!(capabilities.iter().any(|item| {
            item["provider"] == "proxmox"
                && item["resource_type"] == "sdn"
                && item["action"] == "zones-vnets-subnets-ipam-dns-dhcp-status"
                && item["status"] == "read_only"
                && item["backend"] == "proxmox-api-sdn-inventory"
        }));
        assert!(capabilities.iter().any(|item| {
            item["provider"] == "proxmox"
                && item["resource_type"] == "sdn"
                && item["action"] == "create-update-delete-apply-rollback"
                && item["status"] == "blocked"
        }));
        assert!(capabilities.iter().any(|item| {
            item["provider"] == "proxmox"
                && item["resource_type"] == "node-network"
                && item["status"] == "read_only"
        }));
        assert!(capabilities.iter().any(|item| {
            item["provider"] == "proxmox"
                && item["resource_type"] == "logs"
                && item["action"] == "syslog-journal-cluster-log"
                && item["status"] == "read_only"
                && item["backend"] == "proxmox-api-logs"
        }));
    }

    #[test]
    fn test_proxmox_token_user_derives_shell_console_user() {
        assert_eq!(
            proxmox_token_user("root@pam!clawcontrol").as_deref(),
            Some("root@pam!clawcontrol")
        );
        assert_eq!(
            proxmox_token_user("admin@pve").as_deref(),
            Some("admin@pve")
        );
        assert_eq!(proxmox_token_user("   "), None);
    }

    #[test]
    fn test_compact_error_body_normalizes_and_truncates() {
        assert_eq!(
            compact_error_body(" bad\n\n request\tbody "),
            "bad request body"
        );
        let long = "x ".repeat(400);
        let compact = compact_error_body(&long);
        assert!(compact.ends_with("..."));
        assert!(compact.chars().count() <= 503);
    }

    struct FakeProxmoxHttpRequest {
        method: String,
        path: String,
        authorization: Option<String>,
        content_type: Option<String>,
        body: String,
    }

    async fn read_fake_proxmox_request(
        socket: &mut tokio::net::TcpStream,
    ) -> FakeProxmoxHttpRequest {
        let mut bytes = Vec::new();
        let mut chunk = [0_u8; 1024];
        let header_end = loop {
            let read = socket.read(&mut chunk).await.expect("read request");
            assert!(read > 0, "client closed before headers");
            bytes.extend_from_slice(&chunk[..read]);
            if let Some(pos) = bytes.windows(4).position(|window| window == b"\r\n\r\n") {
                break pos + 4;
            }
        };

        let headers = String::from_utf8_lossy(&bytes[..header_end]).to_string();
        let mut lines = headers.split("\r\n");
        let request_line = lines.next().expect("request line");
        let mut request_parts = request_line.split_whitespace();
        let method = request_parts.next().unwrap_or_default().to_string();
        let path = request_parts.next().unwrap_or_default().to_string();

        let mut authorization = None;
        let mut content_type = None;
        let mut content_length = 0_usize;
        for line in lines {
            let Some((name, value)) = line.split_once(':') else {
                continue;
            };
            let name = name.trim().to_ascii_lowercase();
            let value = value.trim().to_string();
            match name.as_str() {
                "authorization" => authorization = Some(value),
                "content-type" => content_type = Some(value),
                "content-length" => {
                    content_length = value.parse::<usize>().expect("content length")
                }
                _ => {}
            }
        }

        while bytes.len() < header_end + content_length {
            let read = socket.read(&mut chunk).await.expect("read body");
            assert!(read > 0, "client closed before body");
            bytes.extend_from_slice(&chunk[..read]);
        }
        let body =
            String::from_utf8_lossy(&bytes[header_end..header_end + content_length]).to_string();

        FakeProxmoxHttpRequest {
            method,
            path,
            authorization,
            content_type,
            body,
        }
    }

    async fn spawn_fake_proxmox_once(
        status: &str,
        body: &'static str,
    ) -> (
        String,
        tokio::sync::oneshot::Receiver<FakeProxmoxHttpRequest>,
    ) {
        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .expect("bind fake proxmox");
        let addr = listener.local_addr().expect("fake proxmox addr");
        let (tx, rx) = tokio::sync::oneshot::channel();
        let status = status.to_string();

        tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.expect("accept fake proxmox");
            let request = read_fake_proxmox_request(&mut socket).await;
            let response = format!(
                "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                body.len()
            );
            let _ = tx.send(request);
            socket
                .write_all(response.as_bytes())
                .await
                .expect("write fake proxmox response");
        });

        (format!("http://{addr}"), rx)
    }

    async fn spawn_fake_proxmox_sequence(
        responses: Vec<(&'static str, &'static str)>,
    ) -> (
        String,
        tokio::sync::oneshot::Receiver<Vec<FakeProxmoxHttpRequest>>,
    ) {
        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .expect("bind fake proxmox");
        let addr = listener.local_addr().expect("fake proxmox addr");
        let (tx, rx) = tokio::sync::oneshot::channel();

        tokio::spawn(async move {
            let mut requests = Vec::new();
            for (status, body) in responses {
                let (mut socket, _) = listener.accept().await.expect("accept fake proxmox");
                let request = read_fake_proxmox_request(&mut socket).await;
                let response = format!(
                    "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                    body.len()
                );
                requests.push(request);
                socket
                    .write_all(response.as_bytes())
                    .await
                    .expect("write fake proxmox response");
            }
            let _ = tx.send(requests);
        });

        (format!("http://{addr}"), rx)
    }

    async fn spawn_fake_proxmox_disconnect_then_success(
        status: &'static str,
        body: &'static str,
    ) -> (
        String,
        tokio::sync::oneshot::Receiver<Vec<FakeProxmoxHttpRequest>>,
    ) {
        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .expect("bind fake proxmox");
        let addr = listener.local_addr().expect("fake proxmox addr");
        let (tx, rx) = tokio::sync::oneshot::channel();

        tokio::spawn(async move {
            let mut requests = Vec::new();

            let (mut first_socket, _) = listener.accept().await.expect("accept first request");
            requests.push(read_fake_proxmox_request(&mut first_socket).await);
            drop(first_socket);

            let (mut second_socket, _) = listener.accept().await.expect("accept retry request");
            requests.push(read_fake_proxmox_request(&mut second_socket).await);
            let response = format!(
                "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                body.len()
            );
            second_socket
                .write_all(response.as_bytes())
                .await
                .expect("write fake proxmox response");
            let _ = tx.send(requests);
        });

        (format!("http://{addr}"), rx)
    }

    async fn proxmox_test_state(base_url: &str) -> AppState {
        let db = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .connect(":memory:")
            .await
            .expect("sqlite memory db");
        let mut secrets = HashMap::new();
        secrets.insert("PROXMOX_HOST".to_string(), base_url.to_string());
        secrets.insert(
            "PROXMOX_TOKEN_ID".to_string(),
            "root@pam!clawcontrol".to_string(),
        );
        secrets.insert(
            "PROXMOX_TOKEN_SECRET".to_string(),
            "secret-value".to_string(),
        );

        AppState {
            app: None,
            db,
            http: reqwest::Client::new(),
            secrets: std::sync::Arc::new(std::sync::RwLock::new(secrets)),
            bb: None,
            harness: None,
            gateway_ws: None,
            session: std::sync::Arc::new(TokioRwLock::new(None)),
            refresh_mutex: std::sync::Arc::new(tokio::sync::Mutex::new(())),
            session_validated_at: std::sync::Arc::new(TokioRwLock::new(0)),
            pending_oauth: std::sync::Arc::new(TokioRwLock::new(None)),
        }
    }

    fn decoded_form_pairs(body: &str) -> Vec<(String, String)> {
        url::form_urlencoded::parse(body.as_bytes())
            .map(|(key, value)| (key.into_owned(), value.into_owned()))
            .collect()
    }

    #[tokio::test]
    async fn test_create_proxmox_console_session_calls_vncproxy_and_stores_ws_session() {
        let ticket = "PVEVNC:ticket/with+chars=";
        let body = r#"{"data":{"port":"5900","ticket":"PVEVNC:ticket/with+chars="}}"#;
        let (base_url, request_rx) = spawn_fake_proxmox_once("200 OK", body).await;
        let state = proxmox_test_state(&base_url).await;

        let result = create_proxmox_console_session(
            &state,
            ProxmoxConsoleSessionInput {
                node: Some("pve".to_string()),
                kind: "qemu".to_string(),
                vmid: 100,
            },
        )
        .await
        .expect("console session should be created");
        let request = request_rx.await.expect("fake proxmox request");
        let session_id = result["sessionId"].as_str().expect("session id");
        let session = take_proxmox_proxy_session(session_id, ProxmoxProxyKind::Console)
            .await
            .expect("stored console session");
        let ws_url = proxmox_proxy_ws_url(&session);

        assert_eq!(request.method, "POST");
        assert_eq!(request.path, "/api2/json/nodes/pve/qemu/100/vncproxy");
        assert_eq!(
            request.authorization.as_deref(),
            Some("PVEAPIToken=root@pam!clawcontrol=secret-value")
        );
        assert!(request
            .content_type
            .as_deref()
            .unwrap_or_default()
            .starts_with("application/x-www-form-urlencoded"));
        assert_eq!(request.body, "websocket=1");
        assert_eq!(
            result["target"],
            json!({ "node": "pve", "kind": "qemu", "vmid": 100 })
        );
        assert_eq!(result["password"], ticket);
        assert_eq!(
            result["websocketUrl"].as_str().unwrap_or_default(),
            format!("/api/homelab/proxmox/console/ws?sessionId={session_id}")
        );
        assert_eq!(session.kind, ProxmoxProxyKind::Console);
        assert_eq!(session.port, 5900);
        assert_eq!(session.ticket, ticket);
        assert_eq!(session.vmid, Some(100));
        assert!(ws_url.starts_with("ws://"));
        assert!(ws_url.contains("/api2/json/nodes/pve/qemu/100/vncwebsocket?port=5900"));
        assert!(ws_url.contains("vncticket=PVEVNC%3Aticket%2Fwith%2Bchars%3D"));
    }

    #[tokio::test]
    async fn test_create_proxmox_console_session_retries_transient_vncproxy_failure() {
        let body = r#"{"data":{"port":"5900","ticket":"PVEVNC:retry-ticket"}}"#;
        let (base_url, request_rx) =
            spawn_fake_proxmox_disconnect_then_success("200 OK", body).await;
        let state = proxmox_test_state(&base_url).await;

        let result = create_proxmox_console_session(
            &state,
            ProxmoxConsoleSessionInput {
                node: Some("pve".to_string()),
                kind: "qemu".to_string(),
                vmid: 100,
            },
        )
        .await
        .expect("console session should retry transient vncproxy request failure");
        let requests = request_rx.await.expect("fake proxmox requests");
        let session_id = result["sessionId"].as_str().expect("session id");
        let session = take_proxmox_proxy_session(session_id, ProxmoxProxyKind::Console)
            .await
            .expect("stored console session");

        assert_eq!(requests.len(), 2);
        assert_eq!(requests[0].path, "/api2/json/nodes/pve/qemu/100/vncproxy");
        assert_eq!(requests[1].path, "/api2/json/nodes/pve/qemu/100/vncproxy");
        assert_eq!(session.ticket, "PVEVNC:retry-ticket");
    }

    #[tokio::test]
    async fn test_infer_single_proxmox_api_node_retries_transient_request_failure() {
        let body = r#"{"data":[{"node":"pve","status":"online"}]}"#;
        let (base_url, request_rx) =
            spawn_fake_proxmox_disconnect_then_success("200 OK", body).await;
        let config = ProxmoxApiCredentials {
            url: base_url,
            token_id: "root@pam!clawcontrol".to_string(),
            token_secret: "secret-value".to_string(),
            origin: "test",
        };

        let node = infer_single_proxmox_api_node(
            &insecure_client(),
            &config,
            "PVEAPIToken=root@pam!clawcontrol=secret-value",
        )
        .await
        .expect("node inference should retry transient request failure");
        let requests = request_rx.await.expect("fake proxmox requests");

        assert_eq!(node, "pve");
        assert_eq!(requests.len(), 2);
        assert_eq!(requests[0].method, "GET");
        assert_eq!(requests[0].path, "/api2/json/nodes");
        assert_eq!(requests[1].method, "GET");
        assert_eq!(requests[1].path, "/api2/json/nodes");
    }

    #[tokio::test]
    async fn test_create_proxmox_console_session_infers_single_node_when_missing() {
        let nodes_body = r#"{"data":[{"node":"pve","status":"online"}]}"#;
        let proxy_body = r#"{"data":{"port":5900,"ticket":"PVEVNC:ticket"}}"#;
        let (base_url, request_rx) =
            spawn_fake_proxmox_sequence(vec![("200 OK", nodes_body), ("200 OK", proxy_body)]).await;
        let state = proxmox_test_state(&base_url).await;

        let result = create_proxmox_console_session(
            &state,
            ProxmoxConsoleSessionInput {
                node: None,
                kind: "qemu".to_string(),
                vmid: 100,
            },
        )
        .await
        .expect("console session should infer the only Proxmox node");
        let requests = request_rx.await.expect("fake proxmox requests");
        let session_id = result["sessionId"].as_str().expect("session id");
        let session = take_proxmox_proxy_session(session_id, ProxmoxProxyKind::Console)
            .await
            .expect("stored console session");

        assert_eq!(requests.len(), 2);
        assert_eq!(requests[0].method, "GET");
        assert_eq!(requests[0].path, "/api2/json/nodes");
        assert_eq!(requests[1].method, "POST");
        assert_eq!(requests[1].path, "/api2/json/nodes/pve/qemu/100/vncproxy");
        assert_eq!(session.node, "pve");
        assert_eq!(
            result["target"],
            json!({ "node": "pve", "kind": "qemu", "vmid": 100 })
        );
    }

    #[tokio::test]
    async fn test_create_proxmox_shell_session_calls_termproxy_and_keeps_console_user() {
        let body = r#"{"data":{"port":5901,"ticket":"shell-ticket","user":"root@pam"}}"#;
        let (base_url, request_rx) = spawn_fake_proxmox_once("200 OK", body).await;
        let state = proxmox_test_state(&base_url).await;

        let result = create_proxmox_shell_session(
            &state,
            ProxmoxShellSessionInput {
                node: "pve".to_string(),
            },
        )
        .await
        .expect("shell session should be created");
        let request = request_rx.await.expect("fake proxmox request");
        let session_id = result["sessionId"].as_str().expect("session id");
        let session = take_proxmox_proxy_session(session_id, ProxmoxProxyKind::Shell)
            .await
            .expect("stored shell session");
        let ws_url = proxmox_proxy_ws_url(&session);

        assert_eq!(request.method, "POST");
        assert_eq!(request.path, "/api2/json/nodes/pve/termproxy");
        assert_eq!(
            request.authorization.as_deref(),
            Some("PVEAPIToken=root@pam!clawcontrol=secret-value")
        );
        assert!(request.body.is_empty());
        assert_eq!(result["target"], json!({ "node": "pve" }));
        assert!(result.get("password").is_none());
        assert_eq!(
            result["websocketUrl"].as_str().unwrap_or_default(),
            format!("/api/homelab/proxmox/shell/ws?sessionId={session_id}")
        );
        assert_eq!(session.kind, ProxmoxProxyKind::Shell);
        assert_eq!(session.port, 5901);
        assert_eq!(session.ticket, "shell-ticket");
        assert_eq!(session.console_user.as_deref(), Some("root@pam"));
        assert!(ws_url.starts_with("ws://"));
        assert!(ws_url.contains("/api2/json/nodes/pve/vncwebsocket?port=5901"));
        assert!(ws_url.contains("vncticket=shell-ticket"));
    }

    #[tokio::test]
    async fn test_create_proxmox_console_session_reports_vncproxy_error_body() {
        let (base_url, request_rx) =
            spawn_fake_proxmox_once("500 Internal Server Error", r#"{"errors":"no display"}"#)
                .await;
        let state = proxmox_test_state(&base_url).await;

        let err = create_proxmox_console_session(
            &state,
            ProxmoxConsoleSessionInput {
                node: Some("pve".to_string()),
                kind: "qemu".to_string(),
                vmid: 100,
            },
        )
        .await
        .expect_err("console session should surface proxmox error");
        let request = request_rx.await.expect("fake proxmox request");
        let AppError::BadRequest(message) = err else {
            panic!("expected bad request error");
        };

        assert_eq!(request.path, "/api2/json/nodes/pve/qemu/100/vncproxy");
        assert!(message.contains("Unable to open Proxmox console for qemu/100 on pve"));
        assert!(message.contains("runtime returned 500"));
        assert!(message.contains("no display"));
    }

    #[tokio::test]
    async fn test_run_proxmox_action_posts_core_config_to_runtime_api() {
        let upid = "UPID:pve:000EE18B:1D8D45C5:6A0FB5F3:qmconfig:100:root@pam:";
        let action_body = format!(r#"{{"data":"{upid}"}}"#);
        let status_body = r#"{"data":{"upid":"UPID:pve:000EE18B:1D8D45C5:6A0FB5F3:qmconfig:100:root@pam:","status":"running","type":"qmconfig","id":"100"}}"#;
        let (base_url, request_rx) = spawn_fake_proxmox_sequence(vec![
            ("200 OK", Box::leak(action_body.into_boxed_str())),
            ("200 OK", status_body),
        ])
        .await;
        let state = proxmox_test_state(&base_url).await;

        let result = run_proxmox_action(
            &state,
            "set-memory",
            "pve",
            "qemu",
            100,
            &json!({ "memory_mb": 4096 }),
            None,
        )
        .await
        .expect("runtime action should succeed");
        let requests = request_rx.await.expect("fake proxmox requests");
        let request = requests.first().expect("action request");
        let task_request = requests.get(1).expect("task request");

        assert_eq!(request.method, "POST");
        assert_eq!(request.path, "/api2/json/nodes/pve/qemu/100/config");
        assert_eq!(
            request.authorization.as_deref(),
            Some("PVEAPIToken=root@pam!clawcontrol=secret-value")
        );
        assert!(request
            .content_type
            .as_deref()
            .unwrap_or_default()
            .starts_with("application/x-www-form-urlencoded"));
        assert_eq!(request.body, "memory=4096");
        assert_eq!(result["mode"], "proxmox-api");
        assert_eq!(result["source"], "runtime");
        assert_eq!(result["target"]["node"], "pve");
        assert_eq!(result["response"]["data"], upid);
        assert_eq!(task_request.method, "GET");
        assert_eq!(
            task_request.path,
            format!(
                "/api2/json/nodes/pve/tasks/{}/status",
                urlencoding::encode(upid)
            )
        );
        assert_eq!(result["task"]["upid"], upid);
        assert_eq!(result["task"]["node"], "pve");
        assert_eq!(result["task"]["status"]["status"], "running");
        assert_eq!(result["task"]["status"]["type"], "qmconfig");
    }

    #[tokio::test]
    async fn test_run_proxmox_action_puts_lxc_config_to_runtime_api() {
        let upid = "UPID:pve:000EE18B:1D8D45C5:6A0FB5F3:vzconfig:101:root@pam:";
        let action_body = format!(r#"{{"data":"{upid}"}}"#);
        let status_body = r#"{"data":{"upid":"UPID:pve:000EE18B:1D8D45C5:6A0FB5F3:vzconfig:101:root@pam:","status":"stopped","exitstatus":"OK","type":"vzconfig","id":"101"}}"#;
        let (base_url, request_rx) = spawn_fake_proxmox_sequence(vec![
            ("200 OK", Box::leak(action_body.into_boxed_str())),
            ("200 OK", status_body),
        ])
        .await;
        let state = proxmox_test_state(&base_url).await;

        let result = run_proxmox_action(
            &state,
            "set-memory",
            "pve",
            "lxc",
            101,
            &json!({ "memory_mb": 512 }),
            None,
        )
        .await
        .expect("lxc config action should succeed");
        let requests = request_rx.await.expect("fake proxmox requests");
        let request = requests.first().expect("action request");

        assert_eq!(request.method, "PUT");
        assert_eq!(request.path, "/api2/json/nodes/pve/lxc/101/config");
        assert_eq!(request.body, "memory=512");
        assert_eq!(result["task"]["status"]["exitstatus"], "OK");
    }

    #[tokio::test]
    async fn test_run_proxmox_action_sends_core_guest_action_variants_to_runtime_api() {
        let cases = vec![
            (
                "set-cpu",
                json!({ "cores": 4 }),
                None,
                "POST",
                "/api2/json/nodes/pve/qemu/100/config",
                vec![("cores".to_string(), "4".to_string())],
            ),
            (
                "add-network",
                json!({ "net": "net1", "value": "virtio,bridge=vmbr0,firewall=1" }),
                None,
                "POST",
                "/api2/json/nodes/pve/qemu/100/config",
                vec![(
                    "net1".to_string(),
                    "virtio,bridge=vmbr0,firewall=1".to_string(),
                )],
            ),
            (
                "remove-network",
                json!({ "net": "net1" }),
                Some("100"),
                "POST",
                "/api2/json/nodes/pve/qemu/100/config",
                vec![("delete".to_string(), "net1".to_string())],
            ),
            (
                "resize-disk",
                json!({ "disk": "scsi0", "size": "+8G" }),
                None,
                "PUT",
                "/api2/json/nodes/pve/qemu/100/resize",
                vec![
                    ("disk".to_string(), "scsi0".to_string()),
                    ("size".to_string(), "+8G".to_string()),
                ],
            ),
            (
                "add-disk",
                json!({ "disk": "scsi1", "value": "local-lvm:1G" }),
                None,
                "POST",
                "/api2/json/nodes/pve/qemu/100/config",
                vec![("scsi1".to_string(), "local-lvm:1".to_string())],
            ),
            (
                "delete",
                json!({}),
                Some("100"),
                "DELETE",
                "/api2/json/nodes/pve/qemu/100",
                vec![],
            ),
            (
                "delete",
                json!({ "purge": true, "destroy_unreferenced_disks": true }),
                Some("100"),
                "DELETE",
                "/api2/json/nodes/pve/qemu/100?purge=1&destroy-unreferenced-disks=1",
                vec![],
            ),
        ];

        for (action, args, confirmation, method, path, form) in cases {
            let (base_url, request_rx) =
                spawn_fake_proxmox_once("200 OK", r#"{"data":"UPID:pve:test"}"#).await;
            let state = proxmox_test_state(&base_url).await;

            let result =
                run_proxmox_action(&state, action, "pve", "qemu", 100, &args, confirmation)
                    .await
                    .unwrap_or_else(|err| panic!("{action} should succeed, got {err:?}"));
            let request = request_rx.await.expect("fake proxmox request");

            assert_eq!(request.method, method, "{action} method");
            assert_eq!(request.path, path, "{action} path");
            assert_eq!(
                request.authorization.as_deref(),
                Some("PVEAPIToken=root@pam!clawcontrol=secret-value"),
                "{action} auth"
            );
            assert_eq!(decoded_form_pairs(&request.body), form, "{action} form");
            assert_eq!(result["action"], action);
            assert_eq!(result["response"]["data"], "UPID:pve:test");
        }
    }

    #[tokio::test]
    async fn test_run_proxmox_action_sends_lifecycle_actions_to_runtime_api() {
        for (action, suffix, task_type) in [
            ("start", "/status/start", "qmstart"),
            ("shutdown", "/status/shutdown", "qmshutdown"),
            ("reboot", "/status/reboot", "qmreboot"),
            ("stop", "/status/stop", "qmstop"),
        ] {
            let upid = format!("UPID:pve:000EE18B:1D8D45C5:6A0FB5F3:{task_type}:100:root@pam:");
            let action_body = format!(r#"{{"data":"{upid}"}}"#);
            let status_body = format!(
                r#"{{"data":{{"upid":"{upid}","status":"running","type":"{task_type}","id":"100"}}}}"#
            );
            let (base_url, request_rx) = spawn_fake_proxmox_sequence(vec![
                ("200 OK", Box::leak(action_body.into_boxed_str())),
                ("200 OK", Box::leak(status_body.into_boxed_str())),
            ])
            .await;
            let state = proxmox_test_state(&base_url).await;

            let result = run_proxmox_action(&state, action, "pve", "qemu", 100, &json!({}), None)
                .await
                .unwrap_or_else(|err| panic!("{action} should succeed, got {err:?}"));
            let requests = request_rx.await.expect("fake proxmox requests");
            let request = requests.first().expect("action request");
            let task_request = requests.get(1).expect("task request");

            assert_eq!(request.method, "POST", "{action} method");
            assert_eq!(
                request.path,
                format!("/api2/json/nodes/pve/qemu/100{suffix}"),
                "{action} path"
            );
            assert!(
                request.body.is_empty(),
                "{action} should not send form body"
            );
            assert_eq!(task_request.method, "GET", "{action} task method");
            assert_eq!(
                task_request.path,
                format!(
                    "/api2/json/nodes/pve/tasks/{}/status",
                    urlencoding::encode(&upid)
                ),
                "{action} task path"
            );
            assert_eq!(result["action"], action);
            assert_eq!(result["response"]["data"], upid);
            assert_eq!(result["task"]["status"]["type"], task_type);
            assert_eq!(result["task"]["status"]["id"], "100");
        }
    }

    #[tokio::test]
    async fn test_run_proxmox_action_reports_runtime_api_error_body() {
        let (base_url, request_rx) =
            spawn_fake_proxmox_once("596 Broken pipe", r#"{"errors":{"vmid":"locked"}}"#).await;
        let state = proxmox_test_state(&base_url).await;

        let err = run_proxmox_action(&state, "start", "pve", "qemu", 100, &json!({}), None)
            .await
            .expect_err("runtime action should surface proxmox error");
        let request = request_rx.await.expect("fake proxmox request");
        let AppError::BadRequest(message) = err else {
            panic!("expected bad request error");
        };

        assert_eq!(request.method, "POST");
        assert_eq!(request.path, "/api2/json/nodes/pve/qemu/100/status/start");
        assert!(message.contains("Proxmox start failed for qemu/100 on pve"));
        assert!(message.contains("runtime returned 596"));
        assert!(message.contains("locked"));
    }

    #[tokio::test]
    async fn test_run_proxmox_node_action_reports_task_status_and_error_body() {
        let upid = "UPID:pve:000EE18B:1D8D45C5:6A0FB5F3:nodecmd:pve:root@pam:";
        let action_body = format!(r#"{{"data":"{upid}"}}"#);
        let status_body = format!(
            r#"{{"data":{{"upid":"{upid}","status":"running","type":"nodecmd","id":"pve"}}}}"#
        );
        let (base_url, request_rx) = spawn_fake_proxmox_sequence(vec![
            ("200 OK", Box::leak(action_body.into_boxed_str())),
            ("200 OK", Box::leak(status_body.into_boxed_str())),
        ])
        .await;
        let state = proxmox_test_state(&base_url).await;

        let result = run_proxmox_node_action(&state, "reboot", "pve", &json!({}), None)
            .await
            .expect("node action should succeed");
        let requests = request_rx.await.expect("fake proxmox requests");
        let request = requests.first().expect("node action request");
        let task_request = requests.get(1).expect("task request");

        assert_eq!(request.method, "POST");
        assert_eq!(request.path, "/api2/json/nodes/pve/status");
        assert_eq!(
            decoded_form_pairs(&request.body),
            vec![("command".into(), "reboot".into())]
        );
        assert_eq!(task_request.method, "GET");
        assert_eq!(
            task_request.path,
            format!(
                "/api2/json/nodes/pve/tasks/{}/status",
                urlencoding::encode(upid)
            )
        );
        assert_eq!(result["task"]["upid"], upid);
        assert_eq!(result["task"]["status"]["type"], "nodecmd");

        let (base_url, request_rx) =
            spawn_fake_proxmox_once("500 Internal Server Error", r#"{"errors":"node locked"}"#)
                .await;
        let state = proxmox_test_state(&base_url).await;
        let err = run_proxmox_node_action(&state, "shutdown", "pve", &json!({}), None)
            .await
            .expect_err("node action should surface proxmox error");
        let request = request_rx.await.expect("fake proxmox request");
        let AppError::BadRequest(message) = err else {
            panic!("expected bad request error");
        };

        assert_eq!(request.path, "/api2/json/nodes/pve/status");
        assert!(message.contains("Proxmox node shutdown failed for pve"));
        assert!(message.contains("500"));
        assert!(message.contains("node locked"));
    }

    #[tokio::test]
    async fn test_run_proxmox_node_create_normalizes_disk_size_for_storage_allocation() {
        for (action, args, path, disk_key, expected_disk) in [
            (
                "create-vm",
                json!({
                    "vmid": 990,
                    "name": "clawcontrol-cert-vm",
                    "memory_mb": 512,
                    "cores": 1,
                    "storage": "local-lvm",
                    "disk_size": "1G",
                    "net0": "virtio,bridge=vmbr0,firewall=1",
                    "start": false,
                }),
                "/api2/json/nodes/pve/qemu",
                "scsi0",
                "local-lvm:1",
            ),
            (
                "create-lxc",
                json!({
                    "vmid": 991,
                    "hostname": "clawcontrol-cert-ct",
                    "ostemplate": "local:vztmpl/debian-12-standard_12.7-1_amd64.tar.zst",
                    "memory_mb": 512,
                    "cores": 1,
                    "storage": "local-lvm",
                    "disk_size": "8G",
                    "net0": "name=eth0,bridge=vmbr0,ip=dhcp,firewall=1",
                    "start": false,
                }),
                "/api2/json/nodes/pve/lxc",
                "rootfs",
                "local-lvm:8",
            ),
        ] {
            let upid = format!("UPID:pve:000EE18B:1D8D45C5:6A0FB5F3:{action}:990:root@pam:");
            let action_body = format!(r#"{{"data":"{upid}"}}"#);
            let status_body = format!(
                r#"{{"data":{{"upid":"{upid}","status":"running","type":"{action}","id":"990"}}}}"#
            );
            let (base_url, request_rx) = spawn_fake_proxmox_sequence(vec![
                ("200 OK", Box::leak(action_body.into_boxed_str())),
                ("200 OK", Box::leak(status_body.into_boxed_str())),
            ])
            .await;
            let state = proxmox_test_state(&base_url).await;

            let result = run_proxmox_node_action(&state, action, "pve", &args, None)
                .await
                .unwrap_or_else(|err| panic!("{action} should succeed, got {err:?}"));
            let requests = request_rx.await.expect("fake proxmox requests");
            let request = requests.first().expect("create request");
            let form = decoded_form_pairs(&request.body);

            assert_eq!(request.method, "POST", "{action} method");
            assert_eq!(request.path, path, "{action} path");
            assert!(form.contains(&(disk_key.to_string(), expected_disk.to_string())));
            assert_eq!(result["task"]["upid"], upid);
        }
    }

    #[tokio::test]
    async fn test_run_proxmox_task_action_fetches_log_and_surfaces_error_body() {
        let upid = "UPID:pve:000EE18B:1D8D45C5:6A0FB5F3:qmstart:100:root@pam:";
        let (base_url, request_rx) =
            spawn_fake_proxmox_once("200 OK", r#"{"data":[{"n":1,"t":"starting VM 100"}]}"#).await;
        let state = proxmox_test_state(&base_url).await;

        let result = run_proxmox_task_action(&state, "task-log", "pve", upid, &json!({}), None)
            .await
            .expect("task log should succeed");
        let request = request_rx.await.expect("fake proxmox request");

        assert_eq!(request.method, "GET");
        assert_eq!(
            request.path,
            format!(
                "/api2/json/nodes/pve/tasks/{}/log",
                urlencoding::encode(upid)
            )
        );
        assert_eq!(result["response"]["data"][0]["t"], "starting VM 100");

        let (base_url, request_rx) =
            spawn_fake_proxmox_once("404 Not Found", r#"{"errors":"no such task"}"#).await;
        let state = proxmox_test_state(&base_url).await;
        let err = run_proxmox_task_action(&state, "task-status", "pve", upid, &json!({}), None)
            .await
            .expect_err("task status should surface proxmox error");
        let request = request_rx.await.expect("fake proxmox request");
        let AppError::BadRequest(message) = err else {
            panic!("expected bad request error");
        };

        assert_eq!(request.method, "GET");
        assert!(message.contains("Proxmox task task-status failed"));
        assert!(message.contains("404"));
        assert!(message.contains("no such task"));
    }

    #[test]
    fn test_proxmox_core_guest_lifecycle_specs_match_api_paths() {
        for (action, method, suffix) in [
            ("start", "post", "/status/start"),
            ("shutdown", "post", "/status/shutdown"),
            ("reboot", "post", "/status/reboot"),
            ("stop", "post", "/status/stop"),
            ("delete", "delete", ""),
        ] {
            let spec = proxmox_core_guest_action_request_spec(
                "https://pve.local:8006",
                "pve",
                "qemu",
                100,
                action,
                &json!({}),
            )
            .expect("spec result")
            .expect("core spec");
            assert_eq!(spec.method, method);
            assert_eq!(
                spec.path,
                format!("https://pve.local:8006/api2/json/nodes/pve/qemu/100{suffix}")
            );
            assert!(spec.form.is_empty());
        }
    }

    #[test]
    fn test_proxmox_core_guest_config_specs_build_forms() {
        let memory = proxmox_core_guest_action_request_spec(
            "https://pve.local:8006",
            "pve",
            "qemu",
            100,
            "set-memory",
            &json!({ "memory_mb": 4096 }),
        )
        .expect("spec result")
        .expect("memory spec");
        assert_eq!(memory.method, "post");
        assert_eq!(
            memory.path,
            "https://pve.local:8006/api2/json/nodes/pve/qemu/100/config"
        );
        assert_eq!(
            memory.form,
            vec![("memory".to_string(), "4096".to_string())]
        );

        let cpu = proxmox_core_guest_action_request_spec(
            "https://pve.local:8006",
            "pve",
            "qemu",
            100,
            "set-cpu",
            &json!({ "cores": 4 }),
        )
        .expect("spec result")
        .expect("cpu spec");
        assert_eq!(cpu.form, vec![("cores".to_string(), "4".to_string())]);
    }

    #[test]
    fn test_proxmox_core_guest_network_and_resize_specs_build_forms() {
        let add_network = proxmox_core_guest_action_request_spec(
            "https://pve.local:8006",
            "pve",
            "qemu",
            100,
            "add-network",
            &json!({ "net": "net1", "value": "virtio,bridge=vmbr0,firewall=1" }),
        )
        .expect("spec result")
        .expect("network spec");
        assert_eq!(
            add_network.form,
            vec![(
                "net1".to_string(),
                "virtio,bridge=vmbr0,firewall=1".to_string()
            )]
        );

        let remove_network = proxmox_core_guest_action_request_spec(
            "https://pve.local:8006",
            "pve",
            "qemu",
            100,
            "remove-network",
            &json!({ "net": "net1" }),
        )
        .expect("spec result")
        .expect("remove network spec");
        assert_eq!(
            remove_network.form,
            vec![("delete".to_string(), "net1".to_string())]
        );

        let resize = proxmox_core_guest_action_request_spec(
            "https://pve.local:8006",
            "pve",
            "lxc",
            101,
            "resize-disk",
            &json!({ "size": "+8G" }),
        )
        .expect("spec result")
        .expect("resize spec");
        assert_eq!(resize.method, "put");
        assert_eq!(
            resize.path,
            "https://pve.local:8006/api2/json/nodes/pve/lxc/101/resize"
        );
        assert_eq!(
            resize.form,
            vec![
                ("disk".to_string(), "rootfs".to_string()),
                ("size".to_string(), "+8G".to_string()),
            ]
        );
    }

    #[test]
    fn test_docker_event_filters_query_builds_docker_filters() {
        let encoded = docker_event_filters_query(&json!({
            "type": "container,image",
            "event": "start",
            "container": "nginx",
            "label": "com.docker.compose.project=infra",
        }))
        .expect("filters result")
        .expect("filters encoded");
        let decoded = urlencoding::decode(&encoded).expect("decode filters");
        let parsed: Value = serde_json::from_str(&decoded).expect("filters json");
        assert_eq!(parsed["type"], json!(["container", "image"]));
        assert_eq!(parsed["event"], json!(["start"]));
        assert_eq!(parsed["container"], json!(["nginx"]));
        assert_eq!(parsed["label"], json!(["com.docker.compose.project=infra"]));
    }

    #[test]
    fn test_docker_event_filters_query_accepts_advanced_json() {
        let encoded = docker_event_filters_query(&json!({
            "filters_json": r#"{"type":["network"],"event":["create"]}"#,
        }))
        .expect("filters result")
        .expect("filters encoded");
        let decoded = urlencoding::decode(&encoded).expect("decode filters");
        let parsed: Value = serde_json::from_str(&decoded).expect("filters json");
        assert_eq!(parsed["type"], json!(["network"]));
        assert_eq!(parsed["event"], json!(["create"]));
    }

    #[test]
    fn test_docker_event_filters_query_rejects_invalid_advanced_json() {
        assert!(docker_event_filters_query(&json!({ "filters_json": "[]" })).is_err());
        assert!(docker_event_filters_query(&json!({ "filters_json": "not-json" })).is_err());
    }

    #[test]
    fn test_validate_portainer_action_rejects_unknown() {
        assert!(validate_docker_action("restart").is_ok());
        assert!(validate_docker_action("inspect").is_ok());
        assert!(validate_docker_action("stats").is_ok());
        assert!(validate_docker_action("processes").is_ok());
        assert!(validate_docker_action("changes").is_ok());
        assert!(validate_docker_action("exec").is_ok());
        assert!(validate_docker_action("inspect-image").is_ok());
        assert!(validate_docker_action("history-image").is_ok());
        assert!(validate_docker_action("tag-image").is_ok());
        assert!(validate_docker_action("remove-image").is_ok());
        assert!(validate_docker_action("inspect-endpoint").is_ok());
        assert!(validate_docker_action("events").is_ok());
        assert!(validate_docker_action("events-follow").is_ok());
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
        assert!(validate_docker_action("create-endpoint-group").is_ok());
        assert!(validate_docker_action("inspect-endpoint-group").is_ok());
        assert!(validate_docker_action("update-endpoint-group").is_ok());
        assert!(validate_docker_action("remove-endpoint-group").is_ok());
        assert!(validate_docker_action("create-tag").is_ok());
        assert!(validate_docker_action("inspect-tag").is_ok());
        assert!(validate_docker_action("update-tag").is_ok());
        assert!(validate_docker_action("remove-tag").is_ok());
        assert!(validate_docker_action("create-user").is_ok());
        assert!(validate_docker_action("inspect-user").is_ok());
        assert!(validate_docker_action("update-user").is_ok());
        assert!(validate_docker_action("remove-user").is_ok());
        assert!(validate_docker_action("create-team").is_ok());
        assert!(validate_docker_action("inspect-team").is_ok());
        assert!(validate_docker_action("update-team").is_ok());
        assert!(validate_docker_action("remove-team").is_ok());
        assert!(validate_docker_action("app-template-file").is_ok());
        assert!(validate_docker_action("deploy-app-template").is_ok());
        assert!(validate_docker_action("create-custom-template").is_ok());
        assert!(validate_docker_action("inspect-custom-template").is_ok());
        assert!(validate_docker_action("custom-template-file").is_ok());
        assert!(validate_docker_action("deploy-custom-template").is_ok());
        assert!(validate_docker_action("update-custom-template").is_ok());
        assert!(validate_docker_action("remove-custom-template").is_ok());
        assert!(validate_docker_action("inspect-settings").is_ok());
        assert!(validate_docker_action("update-settings").is_ok());
        assert!(validate_docker_action("pull-image").is_ok());
        assert!(validate_docker_action("create-volume").is_ok());
        assert!(validate_docker_action("create-network").is_ok());
        assert!(validate_docker_action("create-secret").is_ok());
        assert!(validate_docker_action("create-config").is_ok());
        assert!(validate_docker_action("create-container").is_ok());
        assert!(validate_docker_action("create-stack").is_ok());
        assert!(validate_docker_action("apply-kubernetes-manifest").is_ok());
        assert!(validate_docker_action("preview-kubernetes-manifest").is_ok());
        assert!(validate_docker_action("create-kubernetes-namespace").is_ok());
        assert!(validate_docker_action("create-kubernetes-application").is_ok());
        assert!(validate_docker_action("create-kubernetes-service").is_ok());
        assert!(validate_docker_action("create-kubernetes-ingress").is_ok());
        assert!(validate_docker_action("create-kubernetes-configmap").is_ok());
        assert!(validate_docker_action("create-kubernetes-secret").is_ok());
        assert!(validate_docker_action("create-kubernetes-volume").is_ok());
        assert!(validate_docker_action("inspect-stack").is_ok());
        assert!(validate_docker_action("stack-file").is_ok());
        assert!(validate_docker_action("stack-logs").is_ok());
        assert!(validate_docker_action("start-stack").is_ok());
        assert!(validate_docker_action("stop-stack").is_ok());
        assert!(validate_docker_action("update-stack").is_ok());
        assert!(validate_docker_action("create-service").is_ok());
        assert!(validate_docker_action("update-service").is_ok());
        assert!(validate_docker_action("rollback-service").is_ok());
        assert!(validate_docker_action("inspect-service").is_ok());
        assert!(validate_docker_action("service-logs").is_ok());
        assert!(validate_docker_action("scale-service").is_ok());
        assert!(validate_docker_action("remove-service").is_ok());
        assert!(validate_docker_action("inspect-node").is_ok());
        assert!(validate_docker_action("update-node-availability").is_ok());
        assert!(validate_docker_action("inspect-task").is_ok());
        assert!(validate_docker_action("task-logs").is_ok());
        assert!(validate_docker_action("inspect-kubernetes-namespace").is_ok());
        assert!(validate_docker_action("delete-kubernetes-namespace").is_ok());
        assert!(validate_docker_action("inspect-kubernetes-application").is_ok());
        assert!(validate_docker_action("delete-kubernetes-application").is_ok());
        assert!(validate_docker_action("inspect-kubernetes-pod").is_ok());
        assert!(validate_docker_action("kubernetes-pod-logs").is_ok());
        assert!(validate_docker_action("kubernetes-pod-exec").is_ok());
        assert!(validate_docker_action("delete-kubernetes-pod").is_ok());
        assert!(validate_docker_action("inspect-kubernetes-service").is_ok());
        assert!(validate_docker_action("delete-kubernetes-service").is_ok());
        assert!(validate_docker_action("inspect-kubernetes-ingress").is_ok());
        assert!(validate_docker_action("delete-kubernetes-ingress").is_ok());
        assert!(validate_docker_action("inspect-kubernetes-configmap").is_ok());
        assert!(validate_docker_action("delete-kubernetes-configmap").is_ok());
        assert!(validate_docker_action("inspect-kubernetes-secret").is_ok());
        assert!(validate_docker_action("delete-kubernetes-secret").is_ok());
        assert!(validate_docker_action("inspect-kubernetes-volume").is_ok());
        assert!(validate_docker_action("delete-kubernetes-volume").is_ok());
        assert!(validate_docker_action("inspect-kubernetes-crd").is_ok());
        assert!(validate_docker_action("install-helm-chart").is_ok());
        assert!(validate_docker_action("inspect-helm-release").is_ok());
        assert!(validate_docker_action("helm-release-history").is_ok());
        assert!(validate_docker_action("rollback-helm-release").is_ok());
        assert!(validate_docker_action("uninstall-helm-release").is_ok());
        assert!(validate_docker_action("create-aci-container-group").is_ok());
        assert!(validate_docker_action("inspect-aci-container-group").is_ok());
        assert!(validate_docker_action("delete-aci-container-group").is_ok());
        assert!(validate_docker_action("rename").is_ok());
        assert!(validate_docker_action("duplicate").is_ok());
        assert!(validate_docker_action("recreate").is_ok());
        assert!(validate_docker_action("update-restart-policy").is_ok());
        assert!(validate_docker_action("update-resources").is_ok());
        assert!(validate_docker_action("format-disk").is_err());
    }

    #[test]
    fn test_portainer_service_spec_builds_swarm_service_payload() {
        let spec = portainer_service_spec(
            &json!({
                "name": "api-service",
                "image": "ghcr.io/example/api:1",
                "replicas": 3,
                "ports": "8080:80/tcp",
                "env": "RUST_LOG=info",
                "labels": "com.example.tier=api",
                "restart_policy": "on-failure"
            }),
            true,
        )
        .expect("service spec");

        assert_eq!(spec["Name"], "api-service");
        assert_eq!(
            spec["TaskTemplate"]["ContainerSpec"]["Image"],
            "ghcr.io/example/api:1"
        );
        assert_eq!(
            spec["TaskTemplate"]["ContainerSpec"]["Env"][0],
            "RUST_LOG=info"
        );
        assert_eq!(
            spec["TaskTemplate"]["RestartPolicy"]["Condition"],
            "on-failure"
        );
        assert_eq!(spec["Mode"]["Replicated"]["Replicas"], 3);
        assert_eq!(spec["EndpointSpec"]["Ports"][0]["PublishedPort"], 8080);
        assert_eq!(spec["EndpointSpec"]["Ports"][0]["TargetPort"], 80);
    }

    #[test]
    fn test_mutate_portainer_service_spec_preserves_existing_fields() {
        let mut spec = json!({
            "Name": "web-service",
            "TaskTemplate": {
                "ContainerSpec": {
                    "Image": "nginx:latest",
                    "Env": ["OLD=value"]
                }
            },
            "Mode": { "Replicated": { "Replicas": 2 } },
            "Labels": { "existing": "true" }
        });

        mutate_portainer_service_spec(
            &mut spec,
            &json!({
                "image": "nginx:1.27",
                "replicas": 4,
                "env": "NEW=value"
            }),
        )
        .expect("mutated service spec");

        assert_eq!(spec["Name"], "web-service");
        assert_eq!(spec["TaskTemplate"]["ContainerSpec"]["Image"], "nginx:1.27");
        assert_eq!(spec["TaskTemplate"]["ContainerSpec"]["Env"][0], "NEW=value");
        assert_eq!(spec["Mode"]["Replicated"]["Replicas"], 4);
        assert_eq!(spec["Labels"]["existing"], "true");
    }

    #[test]
    fn test_portainer_kubernetes_manifest_documents_build_collection_paths() {
        let args = json!({
            "namespace": "apps",
            "manifest": r#"
apiVersion: v1
kind: Namespace
metadata:
  name: apps
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
  namespace: apps
spec:
  replicas: 2
"#
        });
        let docs = kubernetes_manifest_documents(&args).expect("manifest docs");
        assert_eq!(docs.len(), 2);
        assert_eq!(kubernetes_manifest_name(&docs[0]).unwrap(), "apps");
        assert_eq!(
            kubernetes_manifest_collection_path(6, &docs[0], &args).unwrap(),
            "/endpoints/6/kubernetes/api/v1/namespaces"
        );
        assert_eq!(
            kubernetes_manifest_collection_path(6, &docs[1], &args).unwrap(),
            "/endpoints/6/kubernetes/apis/apps/v1/namespaces/apps/deployments"
        );
        assert_eq!(
            kubernetes_manifest_resource_path(6, &docs[1], &args).unwrap(),
            "/endpoints/6/kubernetes/apis/apps/v1/namespaces/apps/deployments/api"
        );
    }

    #[test]
    fn test_portainer_kubernetes_manifest_paths_cover_common_extended_kinds() {
        let cases = vec![
            (
                json!({ "kind": "ServiceAccount", "metadata": { "name": "api", "namespace": "apps" } }),
                "/endpoints/6/kubernetes/api/v1/namespaces/apps/serviceaccounts/api",
            ),
            (
                json!({ "kind": "Role", "metadata": { "name": "reader", "namespace": "apps" } }),
                "/endpoints/6/kubernetes/apis/rbac.authorization.k8s.io/v1/namespaces/apps/roles/reader",
            ),
            (
                json!({ "kind": "RoleBinding", "metadata": { "name": "reader", "namespace": "apps" } }),
                "/endpoints/6/kubernetes/apis/rbac.authorization.k8s.io/v1/namespaces/apps/rolebindings/reader",
            ),
            (
                json!({ "kind": "ClusterRole", "metadata": { "name": "view-extra" } }),
                "/endpoints/6/kubernetes/apis/rbac.authorization.k8s.io/v1/clusterroles/view-extra",
            ),
            (
                json!({ "kind": "ClusterRoleBinding", "metadata": { "name": "view-extra" } }),
                "/endpoints/6/kubernetes/apis/rbac.authorization.k8s.io/v1/clusterrolebindings/view-extra",
            ),
            (
                json!({ "kind": "NetworkPolicy", "metadata": { "name": "deny-all", "namespace": "apps" } }),
                "/endpoints/6/kubernetes/apis/networking.k8s.io/v1/namespaces/apps/networkpolicies/deny-all",
            ),
            (
                json!({ "kind": "HorizontalPodAutoscaler", "metadata": { "name": "api", "namespace": "apps" } }),
                "/endpoints/6/kubernetes/apis/autoscaling/v2/namespaces/apps/horizontalpodautoscalers/api",
            ),
            (
                json!({ "kind": "Job", "metadata": { "name": "migrate", "namespace": "apps" } }),
                "/endpoints/6/kubernetes/apis/batch/v1/namespaces/apps/jobs/migrate",
            ),
            (
                json!({ "kind": "CronJob", "metadata": { "name": "nightly", "namespace": "apps" } }),
                "/endpoints/6/kubernetes/apis/batch/v1/namespaces/apps/cronjobs/nightly",
            ),
            (
                json!({ "kind": "PodDisruptionBudget", "metadata": { "name": "api", "namespace": "apps" } }),
                "/endpoints/6/kubernetes/apis/policy/v1/namespaces/apps/poddisruptionbudgets/api",
            ),
            (
                json!({ "kind": "LimitRange", "metadata": { "name": "defaults", "namespace": "apps" } }),
                "/endpoints/6/kubernetes/api/v1/namespaces/apps/limitranges/defaults",
            ),
            (
                json!({ "kind": "ResourceQuota", "metadata": { "name": "quota", "namespace": "apps" } }),
                "/endpoints/6/kubernetes/api/v1/namespaces/apps/resourcequotas/quota",
            ),
            (
                json!({ "kind": "StorageClass", "metadata": { "name": "fast" } }),
                "/endpoints/6/kubernetes/apis/storage.k8s.io/v1/storageclasses/fast",
            ),
            (
                json!({ "apiVersion": "example.com/v1", "kind": "Widget", "metadata": { "name": "api", "namespace": "apps" } }),
                "/endpoints/6/kubernetes/apis/example.com/v1/namespaces/apps/widgets/api",
            ),
            (
                json!({
                    "apiVersion": "example.com/v1",
                    "kind": "Policy",
                    "metadata": {
                        "name": "global",
                        "annotations": {
                            "clawcontrol.dev/plural": "policies",
                            "clawcontrol.dev/scope": "Cluster"
                        }
                    }
                }),
                "/endpoints/6/kubernetes/apis/example.com/v1/policies/global",
            ),
        ];

        for (document, expected) in cases {
            assert_eq!(
                kubernetes_manifest_resource_path(6, &document, &json!({ "namespace": "apps" }))
                    .unwrap(),
                expected
            );
        }
    }

    #[test]
    fn test_portainer_kubernetes_manifest_replace_carries_resource_version() {
        let document = json!({
            "apiVersion": "apps/v1",
            "kind": "Deployment",
            "metadata": { "name": "api" },
            "spec": {}
        });
        let existing = json!({
            "metadata": {
                "name": "api",
                "namespace": "apps",
                "resourceVersion": "12345"
            }
        });
        let replacement = kubernetes_manifest_for_replace(document, &existing);
        assert_eq!(replacement["metadata"]["resourceVersion"], "12345");
        assert_eq!(replacement["metadata"]["namespace"], "apps");
        assert_eq!(
            kubernetes_apply_strategy(&json!({}), "upsert").unwrap(),
            "upsert"
        );
        assert_eq!(
            kubernetes_apply_strategy(&json!({ "apply_strategy": "replace" }), "upsert").unwrap(),
            "replace"
        );
    }

    #[test]
    fn test_portainer_kubernetes_manifest_preview_lists_target_paths() {
        let args = json!({
            "namespace": "apps",
            "apply_strategy": "upsert",
            "manifest": r#"
apiVersion: v1
kind: Service
metadata:
  name: api
spec:
  selector:
    app: api
"#
        });
        let docs = kubernetes_manifest_documents(&args).expect("manifest docs");
        let mut existing_by_path = HashMap::new();
        existing_by_path.insert(
            "/endpoints/6/kubernetes/api/v1/namespaces/apps/services/api".into(),
            Some(json!({
                "apiVersion": "v1",
                "kind": "Service",
                "metadata": {
                    "name": "api",
                    "namespace": "apps",
                    "resourceVersion": "77",
                    "uid": "live"
                },
                "spec": {
                    "selector": { "app": "old" }
                },
                "status": { "loadBalancer": {} }
            })),
        );
        let preview = kubernetes_manifest_preview(6, &docs, &args, "upsert", &existing_by_path)
            .expect("manifest preview");
        assert_eq!(preview["strategy"], "upsert");
        assert_eq!(preview["resourceCount"], 1);
        assert_eq!(preview["resources"][0]["kind"], "Service");
        assert_eq!(preview["resources"][0]["namespace"], "apps");
        assert_eq!(preview["resources"][0]["diff"]["exists"], true);
        assert_eq!(preview["resources"][0]["diff"]["diffStatus"], "replace");
        assert_eq!(preview["resources"][0]["diff"]["liveResourceVersion"], "77");
        assert!(preview["resources"][0]["diff"]["changedPaths"]
            .as_array()
            .unwrap()
            .iter()
            .any(|path| path == "/spec/selector/app"));
        assert_eq!(
            preview["resources"][0]["collectionPath"],
            "/endpoints/6/kubernetes/api/v1/namespaces/apps/services"
        );
        assert_eq!(
            preview["resources"][0]["resourcePath"],
            "/endpoints/6/kubernetes/api/v1/namespaces/apps/services/api"
        );
    }

    #[test]
    fn test_portainer_kubernetes_create_actions_build_manifests() {
        let deployment_args = json!({
            "name": "api",
            "namespace": "apps",
            "image": "ghcr.io/example/api:1",
            "replicas": 2,
            "port": 8080,
            "labels": "tier=backend"
        });
        let docs =
            kubernetes_create_manifest_documents("create-kubernetes-application", &deployment_args)
                .expect("deployment manifest");
        assert_eq!(docs[0]["kind"], "Deployment");
        assert_eq!(docs[0]["metadata"]["namespace"], "apps");
        assert_eq!(docs[0]["metadata"]["labels"]["tier"], "backend");
        assert_eq!(docs[0]["spec"]["replicas"], 2);
        assert_eq!(
            docs[0]["spec"]["template"]["spec"]["containers"][0]["image"],
            "ghcr.io/example/api:1"
        );
        assert_eq!(
            kubernetes_manifest_collection_path(6, &docs[0], &deployment_args).unwrap(),
            "/endpoints/6/kubernetes/apis/apps/v1/namespaces/apps/deployments"
        );

        let service_args = json!({
            "name": "api",
            "namespace": "apps",
            "selector": "api",
            "port": 80,
            "target_port": 8080
        });
        let docs = kubernetes_create_manifest_documents("create-kubernetes-service", &service_args)
            .expect("service manifest");
        assert_eq!(docs[0]["kind"], "Service");
        assert_eq!(docs[0]["spec"]["ports"][0]["targetPort"], 8080);
        assert_eq!(
            kubernetes_manifest_collection_path(6, &docs[0], &service_args).unwrap(),
            "/endpoints/6/kubernetes/api/v1/namespaces/apps/services"
        );

        let config_args = json!({
            "name": "api-config",
            "namespace": "apps",
            "data": "APP_ENV=prod\nLOG_LEVEL=debug"
        });
        let docs =
            kubernetes_create_manifest_documents("create-kubernetes-configmap", &config_args)
                .expect("configmap manifest");
        assert_eq!(docs[0]["kind"], "ConfigMap");
        assert_eq!(docs[0]["data"]["APP_ENV"], "prod");
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
    fn test_drain_docker_multiplex_stream_handles_partial_frames() {
        let mut buffer = Vec::new();
        let mut frame = vec![1, 0, 0, 0, 0, 0, 0, 6];
        frame.extend_from_slice(b"hello\n");
        assert_eq!(drain_docker_multiplex_stream(&mut buffer, &frame[..5]), "");
        assert_eq!(
            drain_docker_multiplex_stream(&mut buffer, &frame[5..]),
            "hello\n"
        );
        assert!(buffer.is_empty());
        assert_eq!(
            drain_docker_multiplex_stream(&mut buffer, b"plain\n"),
            "plain\n"
        );
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
    fn test_portainer_user_and_team_bodies_validate_admin_inputs() {
        let group = portainer_name_body(
            &json!({ "name": "production" }),
            "Portainer endpoint group name",
            true,
        )
        .expect("endpoint group body");
        assert_eq!(group["Name"], "production");
        let tag = portainer_name_body(&json!({ "name": "edge" }), "Portainer tag name", true)
            .expect("tag body");
        assert_eq!(tag["Name"], "edge");
        assert!(portainer_name_body(&json!({}), "Portainer tag name", true).is_err());
        assert!(portainer_name_body(&json!({}), "Portainer tag name", false).is_err());

        let user = portainer_user_body(
            &json!({
                "username": "operator",
                "password": "change-me",
                "role": 2
            }),
            true,
        )
        .expect("user body");
        assert_eq!(user["Username"], "operator");
        assert_eq!(user["Password"], "change-me");
        assert_eq!(user["Role"], 2);
        let default_role =
            portainer_user_body(&json!({ "username": "viewer", "password": "secret" }), true)
                .expect("default role");
        assert_eq!(default_role["Role"], 2);
        let update =
            portainer_user_body(&json!({ "username": "operator-renamed", "role": 1 }), false)
                .expect("user update");
        assert_eq!(update["Username"], "operator-renamed");
        assert_eq!(update["Role"], 1);
        assert!(portainer_user_body(&json!({ "username": "bad", "role": 99 }), false).is_err());
        assert!(portainer_user_body(&json!({ "username": "operator" }), true).is_err());

        let team = portainer_team_body(&json!({ "name": "operators" }), true).expect("team body");
        assert_eq!(team["Name"], "operators");
        assert!(portainer_team_body(&json!({}), true).is_err());
        assert!(portainer_team_body(&json!({}), false).is_err());
    }

    #[test]
    fn test_portainer_settings_update_body_merges_whitelisted_settings() {
        let body = portainer_settings_update_body(
            json!({
                "EdgeAgentCheckinInterval": 5,
                "SnapshotInterval": 15,
                "EnableTelemetry": true,
                "TemplatesURL": "https://templates.local/base.json",
                "UnrelatedSetting": { "preserve": true }
            }),
            &json!({
                "edge_agent_checkin_interval": 30,
                "enable_telemetry": false,
                "templates_url": "https://templates.local/custom.json",
                "user_session_timeout": "8h"
            }),
        )
        .expect("settings body");

        assert_eq!(body["EdgeAgentCheckinInterval"], 30);
        assert_eq!(body["SnapshotInterval"], 15);
        assert_eq!(body["EnableTelemetry"], false);
        assert_eq!(body["TemplatesURL"], "https://templates.local/custom.json");
        assert_eq!(body["UserSessionTimeout"], "8h");
        assert_eq!(body["UnrelatedSetting"]["preserve"], true);
        assert!(portainer_settings_update_body(json!({}), &json!({})).is_err());
        assert!(
            portainer_settings_update_body(json!({}), &json!({ "snapshot_interval": 0 })).is_err()
        );
        assert!(
            portainer_settings_update_body(json!({}), &json!({ "enable_telemetry": "maybe" }))
                .is_err()
        );
    }

    #[test]
    fn test_portainer_custom_template_body_validates_file_content_payload() {
        let body = portainer_custom_template_body(
            &json!({
                "title": "nginx compose",
                "description": "Nginx stack",
                "type": 2,
                "platform": 1,
                "file_content": "services:\n  nginx:\n    image: nginx:latest\n",
                "variables": [{"name": "TAG", "label": "Tag", "defaultValue": "latest"}]
            }),
            true,
        )
        .expect("custom template body");

        assert_eq!(body["Title"], "nginx compose");
        assert_eq!(body["Description"], "Nginx stack");
        assert_eq!(body["Type"], 2);
        assert_eq!(body["Platform"], 1);
        assert!(body["FileContent"]
            .as_str()
            .unwrap_or_default()
            .contains("nginx:latest"));
        assert_eq!(body["Variables"][0]["name"], "TAG");

        let update = portainer_custom_template_body(
            &json!({
                "title": "nginx compose v2",
                "type": 2,
                "variables": r#"[{"name":"IMAGE","defaultValue":"nginx:1.27"}]"#
            }),
            false,
        )
        .expect("custom template update body");
        assert_eq!(update["Title"], "nginx compose v2");
        assert_eq!(update["Variables"][0]["name"], "IMAGE");
        assert!(portainer_custom_template_body(&json!({ "title": "missing file" }), true).is_err());
        assert!(portainer_custom_template_body(
            &json!({ "title": "bad", "type": 99, "file_content": "services: {}" }),
            true
        )
        .is_err());
        assert!(portainer_custom_template_body(
            &json!({ "variables": "{\"name\":\"bad\"}" }),
            false
        )
        .is_err());
    }

    #[test]
    fn test_portainer_template_stack_request_builds_standalone_and_swarm_payloads() {
        let (standalone_path, standalone_body) = portainer_template_stack_request(
            3,
            "nginx-template",
            "services:\n  web:\n    image: nginx:latest\n",
            &json!({ "env": "TAG=latest" }),
            None,
            "standalone",
            true,
        )
        .expect("standalone template stack");
        assert_eq!(
            standalone_path,
            "/stacks/create/standalone/string?endpointId=3"
        );
        assert_eq!(standalone_body["Name"], "nginx-template");
        assert_eq!(standalone_body["FromAppTemplate"], true);
        assert_eq!(standalone_body["Env"][0]["name"], "TAG");

        let (swarm_path, swarm_body) = portainer_template_stack_request(
            3,
            "nginx-swarm",
            "services:\n  web:\n    image: nginx:latest\n",
            &json!({ "stack_kind": "swarm", "swarm_id": "swarm123" }),
            None,
            "standalone",
            false,
        )
        .expect("swarm template stack");
        assert_eq!(swarm_path, "/stacks/create/swarm/string?endpointId=3");
        assert_eq!(swarm_body["SwarmID"], "swarm123");
        assert_eq!(swarm_body["FromAppTemplate"], false);
        assert!(portainer_template_stack_request(
            3,
            "bad",
            "services: {}",
            &json!({ "stack_kind": "swarm" }),
            None,
            "standalone",
            false,
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
        assert!(validate_proxmox_action("shell").is_ok());
        assert!(validate_proxmox_action("console").is_ok());
        assert!(validate_proxmox_action("reload-storage").is_err());
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
    fn test_homelab_control_input_accepts_camel_and_snake_case_ids() {
        let camel: HomelabControlInput = serde_json::from_value(json!({
            "provider": "proxmox",
            "resourceType": "vm",
            "resourceId": "100",
            "action": "console"
        }))
        .expect("camel case control input");
        assert_eq!(camel.resource_type, "vm");
        assert_eq!(camel.resource_id, "100");

        let snake: HomelabControlInput = serde_json::from_value(json!({
            "provider": "proxmox",
            "resource_type": "vm",
            "resource_id": "100",
            "action": "console"
        }))
        .expect("snake case control input");
        assert_eq!(snake.resource_type, "vm");
        assert_eq!(snake.resource_id, "100");
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
        let upid = "UPID:pve:000EE18B:1D8D45C5:6A0FB5F3:qmstart:100:root@pam!clawcontrol:";
        assert_eq!(validate_proxmox_task_upid(upid).expect("upid"), upid);
        assert!(validate_proxmox_task_upid("local:backup/not-a-task").is_err());
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
    fn test_to_proxmox_ha_group_maps_policy_flags() {
        let group = to_proxmox_ha_group(&json!({
            "group": "fast-nodes",
            "nodes": "pve1:1,pve2:2",
            "nofailback": 1,
            "restricted": "1",
            "comment": "prefer fast nodes"
        }))
        .expect("ha group");
        assert_eq!(group.group, "fast-nodes");
        assert_eq!(group.nodes, "pve1:1,pve2:2");
        assert!(group.nofailback);
        assert!(group.restricted);
        assert_eq!(group.comment, "prefer fast nodes");
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
    fn test_infer_single_proxmox_node_fills_missing_guest_node() {
        let nodes = vec![ProxmoxNode {
            name: "pve".into(),
            status: "online".into(),
            cpu: 0.0,
            mem_used: 0,
            mem_total: 0,
            uptime: 0,
        }];
        let mut vms = vec![to_vm(&ProxmoxResourceRaw {
            resource_type: Some("qemu".into()),
            name: Some("media".into()),
            vmid: Some(100),
            node: None,
            status: Some("running".into()),
            cpu: Some(0.1),
            mem: Some(0),
            maxmem: Some(0),
        })];
        infer_single_proxmox_node(&mut vms, &nodes);
        assert_eq!(vms[0].node, "pve");
    }

    #[test]
    fn test_infer_single_proxmox_node_does_not_guess_multi_node() {
        let nodes = vec![
            ProxmoxNode {
                name: "pve-a".into(),
                status: "online".into(),
                cpu: 0.0,
                mem_used: 0,
                mem_total: 0,
                uptime: 0,
            },
            ProxmoxNode {
                name: "pve-b".into(),
                status: "online".into(),
                cpu: 0.0,
                mem_used: 0,
                mem_total: 0,
                uptime: 0,
            },
        ];
        let mut vms = vec![to_vm(&ProxmoxResourceRaw {
            resource_type: Some("qemu".into()),
            name: Some("media".into()),
            vmid: Some(100),
            node: None,
            status: Some("running".into()),
            cpu: Some(0.1),
            mem: Some(0),
            maxmem: Some(0),
        })];
        infer_single_proxmox_node(&mut vms, &nodes);
        assert_eq!(vms[0].node, "");
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
    fn test_to_proxmox_storage_content_maps_common_content() {
        let raw = ProxmoxStorageContentRaw {
            volid: Some("local:iso/debian-13.iso".into()),
            format: Some("iso".into()),
            content: Some("iso".into()),
            notes: Some("installer".into()),
            subtype: None,
            protected: Some(json!(0)),
            size: Some(2048),
            ctime: Some(1_778_630_400),
            vmid: None,
        };
        let content = to_proxmox_storage_content("pve", "local", raw).expect("storage content");
        assert_eq!(content.node, "pve");
        assert_eq!(content.storage, "local");
        assert_eq!(content.volid, "local:iso/debian-13.iso");
        assert_eq!(content.name, "debian-13.iso");
        assert_eq!(content.content, "iso");
        assert_eq!(content.subtype, "iso");
        assert_eq!(content.format, "iso");
        assert_eq!(content.size, 2048);
        assert_eq!(content.notes, "installer");
        assert!(!content.protected);
    }

    #[test]
    fn test_to_proxmox_backup_job_maps_schedule_and_retention() {
        let job = to_proxmox_backup_job(&json!({
            "id": "backup-123",
            "enabled": 1,
            "schedule": "sat 02:15",
            "storage": "local",
            "node": "pve",
            "vmid": "100,101",
            "exclude": ["102", "103"],
            "mode": "snapshot",
            "compress": "zstd",
            "mailto": ["ops@example.test"],
            "mailnotification": "failure",
            "notification-mode": "auto",
            "prune-backups": "keep-last=7,keep-weekly=4",
            "notes-template": "{{guestname}}",
            "comment": "nightly guests"
        }))
        .expect("backup job");
        assert_eq!(job.id, "backup-123");
        assert!(job.enabled);
        assert_eq!(job.schedule, "sat 02:15");
        assert_eq!(job.storage, "local");
        assert_eq!(job.vmids, "100,101");
        assert_eq!(job.exclude, "102,103");
        assert_eq!(job.prune_backups, "keep-last=7,keep-weekly=4");
        assert_eq!(job.notification_mode, "auto");
    }

    #[test]
    fn test_to_proxmox_replication_job_maps_status_fields() {
        let job = to_proxmox_replication_job(&json!({
            "id": "100-0",
            "guest": 100,
            "source": "pve-a",
            "target": "pve-b",
            "schedule": "*/15",
            "rate": 50,
            "disable": 0,
            "type": "local",
            "comment": "replicate media",
            "next_sync": 1_778_700_000,
            "last_sync": 1_778_699_100,
            "last_try": 1_778_699_100,
            "duration": 12,
            "fail_count": 0
        }))
        .expect("replication job");
        assert_eq!(job.id, "100-0");
        assert_eq!(job.guest, "100");
        assert_eq!(job.source, "pve-a");
        assert_eq!(job.target, "pve-b");
        assert!(job.enabled);
        assert_eq!(job.rate, "50");
        assert_eq!(job.next_sync, 1_778_700_000);
    }

    #[test]
    fn test_to_proxmox_pool_maps_members() {
        let pool = to_proxmox_pool(&json!({
            "poolid": "production",
            "comment": "production resources",
            "members": [
                { "type": "qemu", "vmid": 100, "name": "media" },
                { "type": "storage", "storage": "local" }
            ]
        }))
        .expect("pool");
        assert_eq!(pool.poolid, "production");
        assert_eq!(pool.comment, "production resources");
        assert_eq!(pool.member_count, 2);
        assert_eq!(pool.members[0]["type"], "qemu");
    }

    #[test]
    fn test_to_proxmox_sdn_rows_map_common_fields() {
        let vnet = to_proxmox_sdn_vnet(&json!({
            "vnet": "prod-net",
            "zone": "prod-zone",
            "alias": "Production",
            "tag": 120,
            "vlanaware": 1,
            "mtu": 9000,
            "pending": { "delete": 0 }
        }))
        .expect("vnet");
        assert_eq!(vnet.vnet, "prod-net");
        assert_eq!(vnet.zone, "prod-zone");
        assert_eq!(vnet.tag, "120");
        assert!(vnet.vlanaware);

        let subnet = to_proxmox_sdn_subnet(
            "prod-net",
            &json!({
                "subnet": "10.20.0.0/24",
                "gateway": "10.20.0.1",
                "snat": 1,
                "dhcp-range": "10.20.0.50-10.20.0.150",
                "dnszoneprefix": "prod"
            }),
        )
        .expect("subnet");
        assert_eq!(subnet.vnet, "prod-net");
        assert_eq!(subnet.subnet, "10.20.0.0/24");
        assert_eq!(subnet.gateway, "10.20.0.1");
        assert!(subnet.snat);
    }

    #[test]
    fn test_annotate_proxmox_log_row_preserves_existing_fields() {
        let row = annotate_proxmox_log_row(
            json!({ "t": "2026-05-22 10:00:00", "msg": "started task" }),
            "pve",
            "syslog",
        );
        assert_eq!(row["node"], "pve");
        assert_eq!(row["source"], "syslog");
        assert_eq!(row["msg"], "started task");
    }

    #[test]
    fn test_to_proxmox_firewall_inventory_rows_map_common_fields() {
        let alias = to_proxmox_firewall_alias(&json!({
            "name": "lan",
            "cidr": "192.168.1.0/24",
            "comment": "LAN subnet"
        }))
        .expect("alias");
        assert_eq!(alias.name, "lan");
        assert_eq!(alias.cidr, "192.168.1.0/24");

        let ipset = to_proxmox_firewall_ipset(&json!({
            "name": "blocked",
            "comment": "blocked networks"
        }))
        .expect("ipset");
        assert_eq!(ipset.name, "blocked");
        assert!(ipset.entries.is_empty());

        let group = to_proxmox_firewall_group(&json!({
            "group": "web",
            "comment": "web rules"
        }))
        .expect("group");
        assert_eq!(group.group, "web");
        assert!(group.rules.is_empty());
    }

    #[test]
    fn test_to_proxmox_access_inventory_maps_common_rows() {
        let user = to_proxmox_access_user(&json!({
            "userid": "root@pam",
            "enable": 1,
            "expire": 0,
            "firstname": "Root",
            "email": "root@example.test",
            "groups": ["admins", "ops"],
            "comment": "cluster admin"
        }))
        .expect("user");
        assert_eq!(user.userid, "root@pam");
        assert!(user.enabled);
        assert_eq!(user.groups, "admins,ops");
        assert_eq!(user.email, "root@example.test");

        let group = to_proxmox_access_group(&json!({
            "groupid": "admins",
            "users": "root@pam,ops@pve",
            "comment": "administrators"
        }))
        .expect("group");
        assert_eq!(group.groupid, "admins");
        assert_eq!(group.users, "root@pam,ops@pve");

        let role = to_proxmox_access_role(&json!({
            "roleid": "ClawControlAudit",
            "privs": ["Sys.Audit", "VM.Audit"],
            "special": 0
        }))
        .expect("role");
        assert_eq!(role.privs, "Sys.Audit,VM.Audit");
        assert!(!role.special);

        let acl = to_proxmox_access_acl(&json!({
            "path": "/",
            "ugid": "root@pam!clawcontrol",
            "roleid": "Administrator",
            "propagate": 1,
            "type": "token"
        }))
        .expect("acl");
        assert_eq!(acl.path, "/");
        assert_eq!(acl.ugid, "root@pam!clawcontrol");
        assert_eq!(acl.roleid, "Administrator");
        assert!(acl.propagate);

        let realm = to_proxmox_access_realm(&json!({
            "realm": "pam",
            "type": "pam",
            "default": 1,
            "tfa": "oath"
        }))
        .expect("realm");
        assert_eq!(realm.realm, "pam");
        assert!(realm.default_realm);

        let token = to_proxmox_access_token(
            "root@pam",
            &json!({
                "tokenid": "clawcontrol",
                "privsep": 1,
                "expire": 0,
                "comment": "automation"
            }),
        )
        .expect("token");
        assert_eq!(token.userid, "root@pam");
        assert_eq!(token.tokenid, "clawcontrol");
        assert!(token.privsep);
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

    #[test]
    fn test_to_proxmox_node_network_maps_interface_inventory() {
        let raw = json!({
            "iface": "vmbr0",
            "type": "bridge",
            "method": "static",
            "cidr": "192.168.1.10/24",
            "gateway": "192.168.1.1",
            "bridge_ports": "enp1s0",
            "active": 1,
            "autostart": "1",
            "comments": "LAN bridge"
        });
        let network = to_proxmox_node_network("pve", &raw).expect("network");
        assert_eq!(network.node, "pve");
        assert_eq!(network.iface, "vmbr0");
        assert_eq!(network.network_type, "bridge");
        assert_eq!(network.method, "static");
        assert_eq!(network.cidr, "192.168.1.10/24");
        assert_eq!(network.bridge_ports, "enp1s0");
        assert!(network.active);
        assert!(network.autostart);
    }

    #[test]
    fn test_proxmox_repository_rows_flatten_apt_repository_files() {
        let body = json!({
            "files": [
                {
                    "path": "/etc/apt/sources.list.d/pve-enterprise.list",
                    "repos": [
                        {
                            "FileType": "deb",
                            "Enabled": false,
                            "URIs": ["https://enterprise.proxmox.com/debian/pve"],
                            "Suites": ["bookworm"],
                            "Components": ["pve-enterprise"],
                            "Comment": "enterprise"
                        }
                    ]
                }
            ]
        });
        let rows = proxmox_repository_rows("pve", &body);
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].node, "pve");
        assert_eq!(rows[0].path, "/etc/apt/sources.list.d/pve-enterprise.list");
        assert_eq!(rows[0].file_type, "deb");
        assert!(!rows[0].enabled);
        assert_eq!(rows[0].status, "disabled");
        assert_eq!(rows[0].uri, "https://enterprise.proxmox.com/debian/pve");
        assert_eq!(rows[0].suite, "bookworm");
        assert_eq!(rows[0].component, "pve-enterprise");
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
