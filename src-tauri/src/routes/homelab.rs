use axum::{extract::State, routing::get, routing::post, Json, Router};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
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
        "wan_out": "3.1 Mbps"
    })
}

// ── Serde types for Proxmox API responses ───────────────────────────────────

#[derive(Debug, Deserialize)]
struct ProxmoxResponse<T> {
    data: Option<T>,
}

#[derive(Debug, Deserialize)]
struct ProxmoxNodeRaw {
    node: Option<String>,
    status: Option<String>,
    cpu: Option<f64>,
    mem: Option<u64>,
    maxmem: Option<u64>,
    uptime: Option<u64>,
}

#[derive(Debug, Deserialize)]
struct ProxmoxResourceRaw {
    #[serde(rename = "type")]
    resource_type: Option<String>,
    name: Option<String>,
    vmid: Option<u64>,
    node: Option<String>,
    status: Option<String>,
    cpu: Option<f64>,
    mem: Option<u64>,
    maxmem: Option<u64>,
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

#[derive(Debug, Deserialize)]
struct HomelabConfigInput {
    proxmox_host: Option<String>,
    proxmox_token_id: Option<String>,
    proxmox_token_secret: Option<String>,
    opnsense_host: Option<String>,
    opnsense_key: Option<String>,
    opnsense_secret: Option<String>,
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

async fn fetch_proxmox(state: &AppState) -> Option<Value> {
    let url = normalize_base_url(&state.secret_or_default("PROXMOX_HOST"));
    let token_id = state.secret_or_default("PROXMOX_TOKEN_ID");
    let token_secret = state.secret_or_default("PROXMOX_TOKEN_SECRET");

    if url.is_empty() || token_id.is_empty() || token_secret.is_empty() {
        if !token_id.is_empty() || !token_secret.is_empty() {
            warn!("Proxmox credentials are set but PROXMOX_HOST is not configured");
        }
        return fetch_proxmox_ssh().await;
    }

    let client = insecure_client();
    let auth_header = format!("PVEAPIToken={token_id}={token_secret}");

    // ── Fetch nodes ─────────────────────────────────────────────────────
    let nodes_res = client
        .get(format!("{url}/api2/json/nodes"))
        .header("Authorization", &auth_header)
        .send()
        .await
        .ok()?;

    if !nodes_res.status().is_success() {
        warn!("Proxmox nodes endpoint returned {}", nodes_res.status());
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
        .get(format!("{url}/api2/json/cluster/resources?type=vm"))
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

    // ── Fallback: per-node qemu + lxc queries ───────────────────────────
    if vms.is_empty() && !nodes.is_empty() {
        let mut futures = Vec::new();
        for node in &nodes {
            let node_name = node.name.clone();
            let url = url.clone();
            let auth = auth_header.clone();

            // qemu
            let client_ref = client;
            let url_q = url.clone();
            let auth_q = auth.clone();
            let name_q = node_name.clone();
            futures.push(tokio::spawn(async move {
                fetch_node_vms(client_ref, &url_q, &auth_q, &name_q, "qemu").await
            }));

            // lxc
            futures.push(tokio::spawn(async move {
                fetch_node_vms(client_ref, &url, &auth, &node_name, "lxc").await
            }));
        }

        for handle in futures {
            if let Ok(result) = handle.await {
                vms.extend(result);
            }
        }
    }

    Some(json!({
        "nodes": nodes,
        "vms": vms,
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
    }
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

// ── OPNsense fetcher ────────────────────────────────────────────────────────

async fn fetch_opnsense(state: &AppState) -> Option<Value> {
    let url = state
        .secret("OPNSENSE_HOST")
        .or_else(|| state.secret("OPNSENSE_URL"))
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| {
            warn!("OPNSENSE_HOST is not configured");
            String::new()
        });

    if url.is_empty() {
        return fetch_opnsense_ssh().await;
    }
    let url = normalize_base_url(&url);

    let key = state
        .secret("OPNSENSE_API_KEY")
        .or_else(|| state.secret("OPNSENSE_KEY"))
        .unwrap_or_default();
    let secret = state
        .secret("OPNSENSE_API_SECRET")
        .or_else(|| state.secret("OPNSENSE_SECRET"))
        .unwrap_or_default();

    if key.is_empty() || secret.is_empty() {
        return fetch_opnsense_ssh().await;
    }

    let client = insecure_client();

    let sys_fut = opnsense_get_json(
        client,
        &url,
        &key,
        &secret,
        &[
            "/api/diagnostics/system/system_resources",
            "/api/diagnostics/system/systemResources",
        ],
    );
    let time_fut = opnsense_get_json(
        client,
        &url,
        &key,
        &secret,
        &[
            "/api/diagnostics/system/system_time",
            "/api/diagnostics/system/systemTime",
        ],
    );
    let iface_fut = opnsense_get_json(
        client,
        &url,
        &key,
        &secret,
        &[
            "/api/diagnostics/interface/get_interface_statistics",
            "/api/diagnostics/interface/getInterfaceStatistics",
        ],
    );
    let traffic_fut = opnsense_get_json(
        client,
        &url,
        &key,
        &secret,
        &["/api/diagnostics/traffic/_interface"],
    );

    let (sys_res, time_res, iface_res, traffic_res) =
        tokio::join!(sys_fut, time_fut, iface_fut, traffic_fut);

    if sys_res.is_none() && time_res.is_none() && iface_res.is_none() && traffic_res.is_none() {
        warn!("OPNsense API credentials are configured but all diagnostics endpoints failed");
        return fetch_opnsense_ssh().await;
    }

    let mut cpu: f64 = 0.0;
    let mut mem_used: u64 = 0;
    let mut mem_total: u64 = 0;
    let mut uptime: u64 = 0;
    let mut wan_in = "N/A".to_string();
    let mut wan_out = "N/A".to_string();

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
        "source": "api",
    }))
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

// ── Router ──────────────────────────────────────────────────────────────────

/// Build the homelab router (Proxmox nodes/VMs + OPNsense firewall status).
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/homelab", get(get_homelab))
        .route("/homelab/config", get(get_config).put(put_config))
        .route("/homelab/sync", post(sync_config))
        .route("/proxmox", get(get_proxmox))
        .route("/opnsense", get(get_opnsense))
}

fn secret_is_set(state: &AppState, key: &str) -> bool {
    state
        .secret(key)
        .is_some_and(|value| !value.trim().is_empty())
}

fn homelab_config_value(state: &AppState) -> Value {
    let proxmox_host = state.secret_or_default("PROXMOX_HOST");
    let proxmox_token_id = state.secret_or_default("PROXMOX_TOKEN_ID");
    let opnsense_host = state
        .secret("OPNSENSE_HOST")
        .or_else(|| state.secret("OPNSENSE_URL"))
        .unwrap_or_default();

    let proxmox_configured = !proxmox_host.trim().is_empty()
        && !proxmox_token_id.trim().is_empty()
        && secret_is_set(state, "PROXMOX_TOKEN_SECRET");
    let opnsense_configured = !opnsense_host.trim().is_empty()
        && (secret_is_set(state, "OPNSENSE_API_KEY") || secret_is_set(state, "OPNSENSE_KEY"))
        && (secret_is_set(state, "OPNSENSE_API_SECRET") || secret_is_set(state, "OPNSENSE_SECRET"));

    json!({
        "api_configured": {
            "proxmox": proxmox_configured,
            "opnsense": opnsense_configured,
        },
        "local": {
            "proxmox_host": proxmox_host,
            "proxmox_token_id": proxmox_token_id,
            "proxmox_token_secret_set": secret_is_set(state, "PROXMOX_TOKEN_SECRET"),
            "opnsense_host": opnsense_host,
            "opnsense_key_set": secret_is_set(state, "OPNSENSE_API_KEY") || secret_is_set(state, "OPNSENSE_KEY"),
            "opnsense_secret_set": secret_is_set(state, "OPNSENSE_API_SECRET") || secret_is_set(state, "OPNSENSE_SECRET"),
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

// ── GET /homelab ────────────────────────────────────────────────────────────

async fn get_homelab(State(state): State<AppState>) -> Result<Json<Value>, AppError> {
    let config = homelab_config_value(&state);
    let proxmox_configured = config["api_configured"]["proxmox"]
        .as_bool()
        .unwrap_or(false);
    let opnsense_configured = config["api_configured"]["opnsense"]
        .as_bool()
        .unwrap_or(false);

    // Fetch both concurrently; each returns None on failure. When API credentials
    // are missing, each fetcher tries the local SSH host alias before giving up.
    let (proxmox_result, opnsense_result) =
        tokio::join!(fetch_proxmox(&state), fetch_opnsense(&state));

    let proxmox_live = proxmox_result.is_some();
    let opnsense_live = opnsense_result.is_some();

    let proxmox = proxmox_result.unwrap_or_else(mock_proxmox);
    let opnsense = opnsense_result.unwrap_or_else(mock_opnsense);

    let mut response = json!({
        "proxmox": proxmox,
        "opnsense": opnsense,
        "live": {
            "proxmox": proxmox_live,
            "opnsense": opnsense_live,
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
