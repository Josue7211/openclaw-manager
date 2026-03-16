use axum::{extract::State, routing::get, Json, Router};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::OnceLock;
use tracing::warn;

use crate::error::AppError;
use crate::server::AppState;

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
            { "name": "media-vm",     "status": "running", "cpu": 0.05, "mem": 4_294_967_296_u64 },
            { "name": "nextcloud-vm", "status": "running", "cpu": 0.02, "mem": 2_147_483_648_u64 },
            { "name": "openclaw-vm",  "status": "running", "cpu": 0.08, "mem": 4_294_967_296_u64 },
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
    status: Option<String>,
    cpu: Option<f64>,
    mem: Option<u64>,
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
    name: String,
    status: String,
    cpu: f64,
    mem: u64,
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

// ── Proxmox fetcher ─────────────────────────────────────────────────────────

async fn fetch_proxmox(state: &AppState) -> Option<Value> {
    let url = state.secret_or_default("PROXMOX_HOST");
    let token_id = state.secret_or_default("PROXMOX_TOKEN_ID");
    let token_secret = state.secret_or_default("PROXMOX_TOKEN_SECRET");

    if url.is_empty() || token_id.is_empty() || token_secret.is_empty() {
        if !token_id.is_empty() || !token_secret.is_empty() {
            warn!("Proxmox credentials are set but PROXMOX_HOST is not configured");
        }
        return None;
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

    let nodes_data: ProxmoxResponse<Vec<ProxmoxNodeRaw>> =
        nodes_res.json().await.ok()?;
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
            if let Ok(data) = res
                .json::<ProxmoxResponse<Vec<ProxmoxResourceRaw>>>()
                .await
            {
                vms = data
                    .data
                    .unwrap_or_default()
                    .into_iter()
                    .filter(|r| {
                        matches!(
                            r.resource_type.as_deref(),
                            Some("qemu") | Some("lxc")
                        )
                    })
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
    }))
}

fn to_vm(r: &ProxmoxResourceRaw) -> ProxmoxVM {
    ProxmoxVM {
        name: r
            .name
            .clone()
            .unwrap_or_else(|| format!("VM {}", r.vmid.unwrap_or(0))),
        status: r.status.clone().unwrap_or_default(),
        cpu: r.cpu.unwrap_or(0.0),
        mem: r.mem.unwrap_or(0),
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
            .iter()
            .map(to_vm)
            .collect(),
        Err(_) => Vec::new(),
    }
}

// ── OPNsense fetcher ────────────────────────────────────────────────────────

async fn fetch_opnsense(state: &AppState) -> Option<Value> {
    let mut url = state.secret("OPNSENSE_HOST")
        .or_else(|| state.secret("OPNSENSE_URL"))
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| {
            warn!("OPNSENSE_HOST is not configured");
            String::new()
        });

    if url.is_empty() {
        return None;
    }

    // Force HTTPS (matching TS behavior)
    if url.starts_with("http://") {
        url = format!("https://{}", &url[7..]);
    }

    let key = state.secret("OPNSENSE_API_KEY")
        .or_else(|| state.secret("OPNSENSE_KEY"))
        .unwrap_or_default();
    let secret = state.secret("OPNSENSE_API_SECRET")
        .or_else(|| state.secret("OPNSENSE_SECRET"))
        .unwrap_or_default();

    if key.is_empty() || secret.is_empty() {
        return None;
    }

    let client = insecure_client();

    // Fire all three diagnostic requests concurrently
    let sys_fut = client
        .get(format!("{url}/api/diagnostics/system/systemResources"))
        .basic_auth(&key, Some(&secret))
        .send();
    let time_fut = client
        .get(format!("{url}/api/diagnostics/system/systemTime"))
        .basic_auth(&key, Some(&secret))
        .send();
    let iface_fut = client
        .get(format!(
            "{url}/api/diagnostics/interface/getInterfaceStatistics"
        ))
        .basic_auth(&key, Some(&secret))
        .send();

    let (sys_res, time_res, iface_res) = tokio::join!(sys_fut, time_fut, iface_fut);

    let mut cpu: f64 = 0.0;
    let mut mem_used: u64 = 0;
    let mut mem_total: u64 = 0;
    let mut uptime: u64 = 0;
    let mut wan_in = "N/A".to_string();
    let mut wan_out = "N/A".to_string();

    // ── System resources (memory) ───────────────────────────────────────
    if let Ok(res) = sys_res {
        if res.status().is_success() {
            if let Ok(d) = res.json::<OPNsenseSystemResources>().await {
                if let Some(mem) = d.memory {
                    mem_total = mem
                        .total
                        .as_deref()
                        .unwrap_or("0")
                        .parse::<u64>()
                        .unwrap_or(0);
                    mem_used = mem
                        .used
                        .as_deref()
                        .unwrap_or("0")
                        .parse::<u64>()
                        .unwrap_or(0);
                }
            }
        }
    }

    // ── System time (uptime + CPU from load average) ────────────────────
    if let Ok(res) = time_res {
        if res.status().is_success() {
            if let Ok(d) = res.json::<OPNsenseSystemTime>().await {
                // Parse uptime: "3 days, 03:58:11" → seconds
                if let Some(raw) = &d.uptime {
                    uptime = parse_opnsense_uptime(raw);
                }
                // CPU estimate from load average (1-min / 4 CPUs)
                if let Some(loadavg) = &d.loadavg {
                    if let Some(first) = loadavg
                        .split_whitespace()
                        .next()
                        .or_else(|| loadavg.split(',').next())
                    {
                        // Strip any non-numeric trailing chars
                        let cleaned: String =
                            first.chars().take_while(|c| *c == '.' || c.is_ascii_digit()).collect();
                        if let Ok(load) = cleaned.parse::<f64>() {
                            cpu = (load / 4.0).min(1.0);
                        }
                    }
                }
            }
        }
    }

    // ── Interface statistics (WAN bandwidth) ────────────────────────────
    if let Ok(res) = iface_res {
        if res.status().is_success() {
            if let Ok(d) = res.json::<OPNsenseInterfaceStats>().await {
                if let Some(stats) = d.statistics {
                    // Find WAN entry — key contains "[WAN]"
                    let wan_entry = stats.iter().find(|(k, _)| {
                        let upper = k.to_uppercase();
                        upper.contains("[WAN]") || upper.contains("WAN")
                    });

                    if let Some((_, iface_val)) = wan_entry {
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
    }))
}

/// Parse OPNsense uptime string like "3 days, 03:58:11" into seconds.
fn parse_opnsense_uptime(raw: &str) -> u64 {
    let mut days: u64 = 0;
    let mut hours: u64 = 0;
    let mut mins: u64 = 0;
    let mut secs: u64 = 0;

    // Extract days: "N day(s)"
    for (i, segment) in raw.split_whitespace().enumerate() {
        if segment.starts_with("day") {
            if i > 0 {
                if let Some(prev) = raw.split_whitespace().nth(i - 1) {
                    days = prev.parse().unwrap_or(0);
                }
            }
        }
    }

    // Extract HH:MM:SS
    for part in raw.split(|c: char| c == ',' || c == ' ') {
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

// ── Router ──────────────────────────────────────────────────────────────────

/// Build the homelab router (Proxmox nodes/VMs + OPNsense firewall status).
pub fn router() -> Router<AppState> {
    Router::new().route("/homelab", get(get_homelab))
}

// ── GET /homelab ────────────────────────────────────────────────────────────

async fn get_homelab(
    State(state): State<AppState>,
) -> Result<Json<Value>, AppError> {
    let proxmox_configured = state.secret("PROXMOX_TOKEN_ID")
        .filter(|s| !s.is_empty())
        .is_some()
        && state.secret("PROXMOX_TOKEN_SECRET")
            .filter(|s| !s.is_empty())
            .is_some();

    let opnsense_configured = (state.secret("OPNSENSE_API_KEY")
        .filter(|s| !s.is_empty())
        .is_some()
        || state.secret("OPNSENSE_KEY")
            .filter(|s| !s.is_empty())
            .is_some())
        && (state.secret("OPNSENSE_API_SECRET")
            .filter(|s| !s.is_empty())
            .is_some()
            || state.secret("OPNSENSE_SECRET")
                .filter(|s| !s.is_empty())
                .is_some());

    // Neither service configured — return mock data with explanation
    if !proxmox_configured && !opnsense_configured {
        return Ok(Json(json!({
            "error": "service_not_configured",
            "message": "Neither Proxmox nor OPNsense credentials are configured. Set PROXMOX_TOKEN_ID/PROXMOX_TOKEN_SECRET and/or OPNSENSE_API_KEY/OPNSENSE_API_SECRET in .env.local.",
            "proxmox": mock_proxmox(),
            "opnsense": mock_opnsense(),
            "mock": true,
        })));
    }

    // Fetch both concurrently; each returns None on failure
    let (proxmox_result, opnsense_result) =
        tokio::join!(fetch_proxmox(&state), fetch_opnsense(&state));

    let proxmox_live = proxmox_result.is_some();
    let opnsense_live = opnsense_result.is_some();

    let proxmox = proxmox_result.unwrap_or_else(mock_proxmox);
    let opnsense = opnsense_result.unwrap_or_else(mock_opnsense);

    let mut response = json!({
        "proxmox": proxmox,
        "opnsense": opnsense,
    });

    // Only include mock flag when at least one service fell back to mock data
    if !proxmox_live || !opnsense_live {
        response["mock"] = json!(true);
    }

    Ok(Json(response))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_opnsense_uptime() {
        assert_eq!(parse_opnsense_uptime("3 days, 03:58:11"), 3 * 86400 + 3 * 3600 + 58 * 60 + 11);
        assert_eq!(parse_opnsense_uptime("0 days, 01:30:00"), 1 * 3600 + 30 * 60);
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
        assert_eq!(parse_opnsense_uptime("15 days, 02:30:45"), 15 * 86400 + 2 * 3600 + 30 * 60 + 45);
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
        };
        let vm = to_vm(&raw);
        assert_eq!(vm.name, "my-vm");
        assert_eq!(vm.status, "running");
        assert!((vm.cpu - 0.25).abs() < f64::EPSILON);
        assert_eq!(vm.mem, 4_000_000_000);
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
        };
        let vm = to_vm(&raw);
        assert_eq!(vm.name, "VM 200");
        assert_eq!(vm.status, "");
        assert!((vm.cpu - 0.0).abs() < f64::EPSILON);
        assert_eq!(vm.mem, 0);
    }
}
