use axum::{
    extract::{
        ws::{Message, WebSocket},
        State, WebSocketUpgrade,
    },
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use futures::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio::process::Command;
use tracing::{debug, error, info};

use crate::error::AppError;
use crate::server::AppState;

static VNC_CONNECTIONS: AtomicUsize = AtomicUsize::new(0);
const MAX_VNC_CONNECTIONS: usize = 8;
const VNC_SECURITY_NONE: u8 = 1;
const LOCAL_TUNNEL_SERVICE: &str = "openclaw-vnc-tunnel.service";
const LEGACY_LOCAL_TUNNEL_SERVICE: &str = "openclaw-sunshine-tunnel.service";
const REMOTE_VNC_SERVICE: &str = "clawctrl-vnc.service";
const REMOTE_VNC_HOST: &str = "agent-vm";
const DEFAULT_VNC_HOST: &str = "127.0.0.1";
const DEFAULT_VNC_PORT: u16 = 5901;
const DEFAULT_SUNSHINE_PORT: u16 = 47990;

struct VncConnectionGuard;

impl VncConnectionGuard {
    fn try_new() -> Option<Self> {
        loop {
            let current = VNC_CONNECTIONS.load(Ordering::Acquire);
            if current >= MAX_VNC_CONNECTIONS {
                return None;
            }
            if VNC_CONNECTIONS
                .compare_exchange(current, current + 1, Ordering::AcqRel, Ordering::Acquire)
                .is_ok()
            {
                return Some(Self);
            }
        }
    }
}

impl Drop for VncConnectionGuard {
    fn drop(&mut self) {
        VNC_CONNECTIONS.fetch_sub(1, Ordering::AcqRel);
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct VncTarget {
    raw: Option<String>,
    host: String,
    port: u16,
    address: String,
    configured: bool,
    repair_host: String,
}

impl VncTarget {
    #[cfg(test)]
    fn from_raw(raw: Option<String>) -> Self {
        Self::from_raw_with_repair_host(raw, None)
    }

    fn from_raw_with_repair_host(raw: Option<String>, repair_host: Option<String>) -> Self {
        let raw = raw
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());
        let configured = raw.is_some();
        let value = raw.as_deref().unwrap_or(DEFAULT_VNC_HOST);
        let parsed = parse_vnc_target(value);
        let host = parsed
            .as_ref()
            .map(|(host, _)| host.clone())
            .unwrap_or_else(|| value.trim_matches('/').to_string());
        let port = parsed.map(|(_, port)| port).unwrap_or(DEFAULT_VNC_PORT);
        let address = format_socket_address(&host, port);

        Self {
            raw,
            host,
            port,
            address,
            configured,
            repair_host: repair_host.unwrap_or_else(|| REMOTE_VNC_HOST.to_string()),
        }
    }

    fn is_loopback(&self) -> bool {
        matches!(self.host.as_str(), "127.0.0.1" | "localhost" | "::1")
    }

    fn repair_host(&self) -> String {
        if self.is_loopback() {
            self.repair_host.clone()
        } else {
            self.host.clone()
        }
    }
}

fn parse_vnc_target(value: &str) -> Option<(String, u16)> {
    let candidate = if value.contains("://") {
        value.to_string()
    } else {
        format!("vnc://{value}")
    };
    let url = url::Url::parse(&candidate).ok()?;
    let host = url.host_str()?.to_string();
    let port = url.port().unwrap_or(DEFAULT_VNC_PORT);
    Some((host, port))
}

fn format_socket_address(host: &str, port: u16) -> String {
    if host.contains(':') && !host.starts_with('[') {
        format!("[{host}]:{port}")
    } else {
        format!("{host}:{port}")
    }
}

fn harness_host_from_url(value: Option<String>) -> Option<String> {
    let raw = value?.trim().to_string();
    if raw.is_empty() {
        return None;
    }
    let candidate = if raw.contains("://") {
        raw
    } else {
        format!("http://{raw}")
    };
    url::Url::parse(&candidate)
        .ok()
        .and_then(|url| url.host_str().map(str::to_string))
}

fn vnc_target(state: &AppState) -> VncTarget {
    VncTarget::from_raw_with_repair_host(
        state.secret("VNC_HOST"),
        harness_host_from_url(state.secret_first(&[
            "HARNESS_API_URL",
            "HERMES_API_URL",
            "OPENCLAW_API_URL",
        ])),
    )
}

async fn probe_vnc(host: &str) -> Result<(), String> {
    tokio::time::timeout(Duration::from_secs(3), async {
        let mut tcp = TcpStream::connect(host)
            .await
            .map_err(|e| format!("connect failed: {e}"))?;

        let mut version = [0u8; 12];
        tcp.read_exact(&mut version)
            .await
            .map_err(|e| format!("version read failed: {e}"))?;

        if !version.starts_with(b"RFB ") || version[11] != b'\n' {
            return Err("server did not send an RFB greeting".to_string());
        }

        tcp.write_all(&version)
            .await
            .map_err(|e| format!("version write failed: {e}"))?;

        if &version[4..11] == b"003.003" {
            return Ok(());
        }

        let mut count = [0u8; 1];
        tcp.read_exact(&mut count)
            .await
            .map_err(|e| format!("security count read failed: {e}"))?;

        if count[0] == 0 {
            return Err("server rejected security negotiation".to_string());
        }

        let mut security_types = vec![0u8; count[0] as usize];
        tcp.read_exact(&mut security_types)
            .await
            .map_err(|e| format!("security types read failed: {e}"))?;

        if !security_types.contains(&VNC_SECURITY_NONE) {
            return Err("server requires VNC credentials".to_string());
        }

        tcp.write_all(&[VNC_SECURITY_NONE])
            .await
            .map_err(|e| format!("security type write failed: {e}"))?;

        let mut security_result = [0u8; 4];
        tcp.read_exact(&mut security_result)
            .await
            .map_err(|e| format!("security result read failed: {e}"))?;

        if u32::from_be_bytes(security_result) != 0 {
            return Err("server rejected no-auth security".to_string());
        }

        tcp.write_all(&[1])
            .await
            .map_err(|e| format!("client init write failed: {e}"))?;

        let mut server_init = [0u8; 24];
        tcp.read_exact(&mut server_init)
            .await
            .map_err(|e| format!("server init read failed: {e}"))?;

        Ok(())
    })
    .await
    .map_err(|_| "probe timed out".to_string())?
}

fn status_message(
    target: &VncTarget,
    reachable: bool,
    available: bool,
    reason: Option<&str>,
) -> String {
    if reachable {
        return if available {
            format!("VNC target {} is online", target.address)
        } else {
            "Viewer connection limit reached".to_string()
        };
    }

    let reason = reason.unwrap_or("probe failed");
    if reason.contains("Connection refused") || reason.contains("connection refused") {
        format!("VNC target {} refused the connection", target.address)
    } else if reason.contains("timed out") {
        format!("VNC target {} timed out", target.address)
    } else if reason.contains("credentials") {
        format!("VNC target {} requires VNC credentials", target.address)
    } else {
        format!("VNC target {} is not reachable", target.address)
    }
}

fn repair_guidance(target: &VncTarget, reason: Option<&str>) -> Value {
    let repair_host = target.repair_host();
    let mut steps = vec![
        format!(
            "Verify VNC_HOST is set to the reachable VNC endpoint, currently {}.",
            target.address
        ),
        format!(
            "Restart remote VNC: ssh {repair_host} systemctl --user restart {REMOTE_VNC_SERVICE}."
        ),
    ];

    if target.is_loopback() {
        #[cfg(target_os = "macos")]
        steps.push(format!(
            "Restart local tunnel: ssh -f -N -L 5901:127.0.0.1:5901 {repair_host}."
        ));
        #[cfg(not(target_os = "macos"))]
        steps.push(format!(
            "Restart local tunnel: systemctl --user restart {LOCAL_TUNNEL_SERVICE}."
        ));
        steps.push(format!(
            "The tunnel must forward local {} to VNC on {repair_host}.",
            target.address
        ));
    } else {
        steps.push(format!(
            "Confirm TCP {} is reachable from this clawctrl backend.",
            target.address
        ));
    }

    json!({
        "summary": match reason {
            Some(reason) if reason.contains("Connection refused") || reason.contains("connection refused") =>
                format!("Nothing is accepting VNC on {}.", target.address),
            Some(reason) if reason.contains("timed out") =>
                format!("TCP connect to {} timed out.", target.address),
            Some(reason) if reason.contains("credentials") =>
                format!("{} requires credentials, but the embedded viewer expects no-auth VNC.", target.address),
            Some(_) => format!("The VNC probe failed for {}.", target.address),
            None => format!("Repair target is {}.", target.address),
        },
        "steps": steps,
        "services": {
            "remoteVnc": REMOTE_VNC_SERVICE,
            "localTunnel": LOCAL_TUNNEL_SERVICE,
            "legacySunshineTunnel": LEGACY_LOCAL_TUNNEL_SERVICE,
        },
        "repairHost": repair_host,
    })
}

/// Check if the legacy embedded VNC desktop is reachable.
async fn vnc_status(State(state): State<AppState>) -> Json<Value> {
    let target = vnc_target(&state);

    let probe_result = probe_vnc(&target.address).await;
    let reachable = probe_result.is_ok();
    let active = VNC_CONNECTIONS.load(Ordering::Acquire);
    let available = reachable && active < MAX_VNC_CONNECTIONS;
    let probe_error = probe_result.as_ref().err().cloned();
    let message = status_message(&target, reachable, available, probe_error.as_deref());
    let guidance = repair_guidance(&target, probe_error.as_deref());

    debug!(
        "remote: VNC at {} reachable={reachable} probe={:?}",
        target.address, probe_error
    );

    Json(json!({
        "configured": target.configured,
        "reachable": reachable,
        "available": available,
        "active": active,
        "max": MAX_VNC_CONNECTIONS,
        "host": &target.address,
        "target": {
            "raw": &target.raw,
            "host": &target.host,
            "port": target.port,
            "address": &target.address,
            "configured": target.configured,
            "repairHost": target.repair_host(),
            "vncService": REMOTE_VNC_SERVICE,
            "tunnelService": LOCAL_TUNNEL_SERVICE,
        },
        "reason": probe_error,
        "message": message,
        "guidance": guidance,
    }))
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct SunshineTarget {
    raw: Option<String>,
    host: String,
    port: u16,
    address: String,
    configured: bool,
}

impl SunshineTarget {
    fn from_raw(raw: Option<String>) -> Self {
        let raw = raw
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());
        let configured = raw.is_some();
        let value = raw.as_deref().unwrap_or("127.0.0.1");
        let parsed = parse_service_target(value, DEFAULT_SUNSHINE_PORT);
        let host = parsed
            .as_ref()
            .map(|(host, _)| host.clone())
            .unwrap_or_else(|| value.trim_matches('/').to_string());
        let port = parsed
            .map(|(_, port)| port)
            .unwrap_or(DEFAULT_SUNSHINE_PORT);
        let address = format_socket_address(&host, port);

        Self {
            raw,
            host,
            port,
            address,
            configured,
        }
    }
}

fn parse_service_target(value: &str, default_port: u16) -> Option<(String, u16)> {
    let candidate = if value.contains("://") {
        value.to_string()
    } else {
        format!("tcp://{value}")
    };
    let url = url::Url::parse(&candidate).ok()?;
    let host = url.host_str()?.to_string();
    let port = url.port().unwrap_or(default_port);
    Some((host, port))
}

fn sunshine_target(state: &AppState) -> SunshineTarget {
    SunshineTarget::from_raw(state.secret("SUNSHINE_HOST"))
}

fn moonlight_url(host: &str) -> String {
    format!("moonlight://{host}")
}

fn sunshine_admin_url(target: &SunshineTarget) -> String {
    format!("https://{}", target.address)
}

async fn probe_tcp(host: &str) -> Result<(), String> {
    tokio::time::timeout(Duration::from_secs(3), TcpStream::connect(host))
        .await
        .map_err(|_| "probe timed out".to_string())?
        .map(|_| ())
        .map_err(|e| format!("connect failed: {e}"))
}

/// Check if Sunshine is reachable for native Moonlight streaming.
async fn remote_status(State(state): State<AppState>) -> Json<Value> {
    let target = sunshine_target(&state);
    let probe_result = probe_tcp(&target.address).await;
    let reachable = probe_result.is_ok();
    let reason = probe_result.as_ref().err().cloned();

    Json(json!({
        "configured": target.configured,
        "reachable": reachable,
        "host": &target.address,
        "target": {
            "raw": &target.raw,
            "host": &target.host,
            "port": target.port,
            "address": &target.address,
            "configured": target.configured,
        },
        "mode": "moonlight",
        "moonlightUrl": moonlight_url(&target.host),
        "sunshineUrl": sunshine_admin_url(&target),
        "reason": reason,
        "message": if reachable {
            format!("Sunshine is reachable at {}", target.address)
        } else if target.configured {
            format!("Sunshine is not reachable at {}", target.address)
        } else {
            "Sunshine host is not configured".to_string()
        },
    }))
}

async fn launch_remote(State(state): State<AppState>) -> Result<Json<Value>, AppError> {
    let target = sunshine_target(&state);
    if !target.configured {
        return Err(AppError::BadRequest(
            "SUNSHINE_HOST is not configured".into(),
        ));
    }

    let uri = moonlight_url(&target.host);
    let output = tokio::time::timeout(
        Duration::from_secs(5),
        Command::new("open").arg(&uri).output(),
    )
    .await
    .map_err(|_| AppError::BadRequest("Moonlight launch timed out".into()))?
    .map_err(|e| AppError::BadRequest(format!("Moonlight launch failed: {e}")))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(AppError::BadRequest(if stderr.is_empty() {
            "Moonlight launch failed".into()
        } else {
            stderr
        }));
    }

    Ok(Json(json!({
        "ok": true,
        "moonlightUrl": uri,
    })))
}

#[derive(Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
enum VncRepairTarget {
    Tunnel,
    Vnc,
    All,
}

#[derive(Debug, Deserialize)]
struct VncRepairRequest {
    target: VncRepairTarget,
}

async fn run_repair_command(program: &str, args: &[&str]) -> Result<Value, String> {
    let output = tokio::time::timeout(
        Duration::from_secs(20),
        Command::new(program).args(args).output(),
    )
    .await
    .map_err(|_| format!("{program} timed out"))?
    .map_err(|e| format!("{program} failed to start: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let status = output.status.code().unwrap_or(-1);

    if !output.status.success() {
        return Err(if stderr.is_empty() {
            format!("{program} exited with status {status}")
        } else {
            stderr
        });
    }

    Ok(json!({
        "program": program,
        "status": status,
        "stdout": stdout,
    }))
}

#[cfg(target_os = "macos")]
async fn run_optional_repair_command(program: &str, args: &[&str]) -> Value {
    match tokio::time::timeout(
        Duration::from_secs(5),
        Command::new(program).args(args).output(),
    )
    .await
    {
        Ok(Ok(output)) => json!({
            "program": program,
            "status": output.status.code().unwrap_or(-1),
            "stdout": String::from_utf8_lossy(&output.stdout).trim().to_string(),
            "stderr": String::from_utf8_lossy(&output.stderr).trim().to_string(),
        }),
        Ok(Err(error)) => json!({
            "program": program,
            "error": format!("{program} failed to start: {error}"),
        }),
        Err(_) => json!({
            "program": program,
            "error": format!("{program} timed out"),
        }),
    }
}

#[cfg(target_os = "macos")]
async fn restart_local_tunnel(repair_host: &str) -> Result<Value, String> {
    let forward = format!("127.0.0.1:{DEFAULT_VNC_PORT}:127.0.0.1:{DEFAULT_VNC_PORT}");
    let stale_pattern =
        format!("ssh .*127\\.0\\.0\\.1:{DEFAULT_VNC_PORT}:127\\.0\\.0\\.1:{DEFAULT_VNC_PORT}");
    let stale_tunnel = run_optional_repair_command("pkill", &["-f", &stale_pattern]).await;
    let start_result = run_repair_command(
        "ssh",
        &[
            "-f",
            "-N",
            "-L",
            &forward,
            "-o",
            "BatchMode=yes",
            "-o",
            "ConnectTimeout=10",
            "-o",
            "TCPKeepAlive=yes",
            "-o",
            "ServerAliveInterval=15",
            "-o",
            "ServerAliveCountMax=2",
            "-o",
            "ExitOnForwardFailure=yes",
            repair_host,
        ],
    )
    .await?;

    Ok(json!({
        "staleTunnel": stale_tunnel,
        "start": start_result,
    }))
}

#[cfg(not(target_os = "macos"))]
async fn restart_local_tunnel(repair_host: &str) -> Result<Value, String> {
    match run_repair_command("systemctl", &["--user", "restart", LOCAL_TUNNEL_SERVICE]).await {
        Ok(result) => Ok(result),
        Err(service_error) => {
            let forward = format!("127.0.0.1:{DEFAULT_VNC_PORT}:127.0.0.1:{DEFAULT_VNC_PORT}");
            match run_repair_command(
                "ssh",
                &[
                    "-f",
                    "-N",
                    "-L",
                    &forward,
                    "-o",
                    "BatchMode=yes",
                    "-o",
                    "ConnectTimeout=10",
                    "-o",
                    "TCPKeepAlive=yes",
                    "-o",
                    "ServerAliveInterval=15",
                    "-o",
                    "ServerAliveCountMax=2",
                    "-o",
                    "ExitOnForwardFailure=yes",
                    repair_host,
                ],
            )
            .await
            {
                Ok(result) => Ok(json!({
                    "fallback": "ssh",
                    "serviceError": service_error,
                    "result": result,
                })),
                Err(ssh_error) => Err(format!(
                    "{LOCAL_TUNNEL_SERVICE} restart failed: {service_error}; direct SSH tunnel failed: {ssh_error}"
                )),
            }
        }
    }
}

async fn restart_remote_vnc(host: &str) -> Result<Value, String> {
    run_repair_command(
        "ssh",
        &[
            "-o",
            "BatchMode=yes",
            "-o",
            "ConnectTimeout=10",
            host,
            "systemctl",
            "--user",
            "restart",
            REMOTE_VNC_SERVICE,
        ],
    )
    .await
}

async fn repair_vnc(
    State(state): State<AppState>,
    Json(body): Json<VncRepairRequest>,
) -> Result<Json<Value>, AppError> {
    let mut steps = Vec::new();
    let target = vnc_target(&state);
    let repair_host = target.repair_host();

    if matches!(body.target, VncRepairTarget::Vnc | VncRepairTarget::All) {
        match restart_remote_vnc(&repair_host).await {
            Ok(result) => steps.push(json!({ "target": "vnc", "host": repair_host, "service": REMOTE_VNC_SERVICE, "ok": true, "result": result })),
            Err(error) => steps.push(json!({ "target": "vnc", "host": repair_host, "service": REMOTE_VNC_SERVICE, "ok": false, "error": error })),
        }
    }

    if matches!(body.target, VncRepairTarget::Tunnel | VncRepairTarget::All) {
        match restart_local_tunnel(&repair_host).await {
            Ok(result) => steps.push(json!({ "target": "tunnel", "host": "127.0.0.1", "service": LOCAL_TUNNEL_SERVICE, "ok": true, "result": result })),
            Err(error) => steps.push(json!({ "target": "tunnel", "host": "127.0.0.1", "service": LOCAL_TUNNEL_SERVICE, "ok": false, "error": error })),
        }
    }

    let ok = steps.iter().all(|step| step["ok"].as_bool() == Some(true));
    if !ok {
        return Err(AppError::BadRequest(
            json!({ "message": "Remote Viewer repair failed", "steps": steps }).to_string(),
        ));
    }

    Ok(Json(json!({
        "ok": true,
        "target": body.target,
        "steps": steps,
    })))
}

async fn vnc_ws(State(state): State<AppState>, ws: WebSocketUpgrade) -> Response {
    let guard = match VncConnectionGuard::try_new() {
        Some(guard) => guard,
        None => {
            return (axum::http::StatusCode::TOO_MANY_REQUESTS, "VNC viewer busy").into_response()
        }
    };

    ws.protocols(["binary"])
        .on_upgrade(move |socket| handle_vnc_ws(socket, state, guard))
}

async fn handle_vnc_ws(socket: WebSocket, state: AppState, _guard: VncConnectionGuard) {
    let target = vnc_target(&state);
    let tcp =
        match tokio::time::timeout(Duration::from_secs(5), TcpStream::connect(&target.address))
            .await
        {
            Ok(Ok(tcp)) => tcp,
            Ok(Err(e)) => {
                error!("vnc: TCP connect to {} failed: {e}", target.address);
                return;
            }
            Err(_) => {
                error!("vnc: TCP connect to {} timed out", target.address);
                return;
            }
        };

    info!("vnc: connected to {}", target.address);
    eprintln!("vnc: connected to {}", target.address);

    let (mut ws_sender, mut ws_receiver) = socket.split();
    let (mut tcp_reader, mut tcp_writer) = tcp.into_split();

    let tcp_to_ws = tokio::spawn(async move {
        let mut buf = vec![0u8; 16 * 1024];
        let mut logged_first_read = false;
        loop {
            match tcp_reader.read(&mut buf).await {
                Ok(0) => break,
                Ok(n) => {
                    if !logged_first_read {
                        logged_first_read = true;
                        eprintln!("vnc: tcp->ws first read {n} bytes");
                    }
                    if ws_sender
                        .send(Message::Binary(buf[..n].to_vec()))
                        .await
                        .is_err()
                    {
                        break;
                    }
                }
                Err(e) => {
                    debug!("vnc: TCP read failed: {e}");
                    break;
                }
            }
        }
    });

    let ws_to_tcp = tokio::spawn(async move {
        let mut logged_first_message = false;
        while let Some(message) = ws_receiver.next().await {
            match message {
                Ok(Message::Binary(data)) => {
                    if !logged_first_message {
                        logged_first_message = true;
                        eprintln!("vnc: ws->tcp first binary {} bytes", data.len());
                    }
                    if tcp_writer.write_all(&data).await.is_err() {
                        break;
                    }
                    if tcp_writer.flush().await.is_err() {
                        break;
                    }
                }
                Ok(Message::Close(_)) => break,
                Ok(Message::Text(data)) => {
                    if !logged_first_message {
                        logged_first_message = true;
                        eprintln!("vnc: ws->tcp first text {} bytes", data.len());
                    }
                    if tcp_writer.write_all(data.as_bytes()).await.is_err() {
                        break;
                    }
                    if tcp_writer.flush().await.is_err() {
                        break;
                    }
                }
                Ok(_) => {}
                Err(e) => {
                    debug!("vnc: WebSocket receive failed: {e}");
                    break;
                }
            }
        }
    });

    tokio::select! {
        _ = tcp_to_ws => {}
        _ = ws_to_tcp => {}
    }

    info!("vnc: session ended");
    eprintln!("vnc: session ended");
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/remote/status", get(remote_status))
        .route("/remote/launch", post(launch_remote))
        .route("/vnc/status", get(vnc_status))
        .route("/vnc/repair", post(repair_vnc))
        .route("/vnc/ws", get(vnc_ws))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::net::TcpListener;

    #[test]
    fn remote_status_response_shape() {
        let val = json!({
            "configured": false,
            "reachable": false,
            "available": false,
            "active": 0,
            "max": MAX_VNC_CONNECTIONS,
            "host": "127.0.0.1:5901",
            "target": {
                "host": "127.0.0.1",
                "port": 5901,
                "address": "127.0.0.1:5901",
                "configured": false,
                "repairHost": "agent-vm",
                "vncService": "clawctrl-vnc.service",
                "tunnelService": "openclaw-vnc-tunnel.service"
            },
            "reason": "connect failed: Connection refused (os error 61)",
            "message": "VNC target 127.0.0.1:5901 refused the connection",
            "guidance": {
                "summary": "Nothing is accepting VNC on 127.0.0.1:5901."
            }
        });
        assert_eq!(val["configured"], false);
        assert_eq!(val["reachable"], false);
        assert_eq!(val["available"], false);
        assert_eq!(val["active"], 0);
        assert_eq!(val["max"], MAX_VNC_CONNECTIONS);
        assert_eq!(val["target"]["address"], "127.0.0.1:5901");
        assert_eq!(val["target"]["repairHost"], REMOTE_VNC_HOST);
    }

    #[test]
    fn vnc_target_defaults_to_local_tunnel_endpoint() {
        let target = VncTarget::from_raw(None);

        assert_eq!(target.host, DEFAULT_VNC_HOST);
        assert_eq!(target.port, DEFAULT_VNC_PORT);
        assert_eq!(target.address, "127.0.0.1:5901");
        assert!(!target.configured);
        assert_eq!(target.repair_host(), REMOTE_VNC_HOST);
    }

    #[test]
    fn vnc_target_uses_configured_host_for_loopback_repair() {
        let target = VncTarget::from_raw_with_repair_host(
            Some("127.0.0.1:5901".to_string()),
            Some("100.104.154.24".to_string()),
        );

        assert_eq!(target.address, "127.0.0.1:5901");
        assert_eq!(target.repair_host(), "100.104.154.24");
    }

    #[test]
    fn vnc_target_accepts_configured_host_and_port() {
        let target = VncTarget::from_raw(Some("vnc://agent-vm:5902".to_string()));

        assert_eq!(target.host, "agent-vm");
        assert_eq!(target.port, 5902);
        assert_eq!(target.address, "agent-vm:5902");
        assert!(target.configured);
        assert_eq!(target.repair_host(), "agent-vm");
    }

    #[test]
    fn harness_host_from_url_accepts_url_and_bare_host() {
        assert_eq!(
            harness_host_from_url(Some("http://100.104.154.24:3939".to_string())),
            Some("100.104.154.24".to_string())
        );
        assert_eq!(
            harness_host_from_url(Some("agent-vm.tail8fd5f4.ts.net:3939".to_string())),
            Some("agent-vm.tail8fd5f4.ts.net".to_string())
        );
    }

    #[test]
    fn sunshine_target_accepts_host_and_default_port() {
        let target = SunshineTarget::from_raw(Some("100.104.154.24".to_string()));

        assert_eq!(target.host, "100.104.154.24");
        assert_eq!(target.port, DEFAULT_SUNSHINE_PORT);
        assert_eq!(target.address, "100.104.154.24:47990");
        assert!(target.configured);
    }

    #[test]
    fn sunshine_target_accepts_url_and_custom_port() {
        let target = SunshineTarget::from_raw(Some("https://openclaw.local:47991".to_string()));

        assert_eq!(target.host, "openclaw.local");
        assert_eq!(target.port, 47991);
        assert_eq!(target.address, "openclaw.local:47991");
    }

    #[test]
    fn status_message_names_refused_target() {
        let target = VncTarget::from_raw(None);

        assert_eq!(
            status_message(
                &target,
                false,
                false,
                Some("connect failed: Connection refused (os error 61)")
            ),
            "VNC target 127.0.0.1:5901 refused the connection"
        );
    }

    #[tokio::test]
    async fn probe_vnc_completes_rfb_handshake() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();

        let server = tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();

            socket.write_all(b"RFB 003.008\n").await.unwrap();

            let mut client_version = [0u8; 12];
            socket.read_exact(&mut client_version).await.unwrap();
            assert_eq!(&client_version, b"RFB 003.008\n");

            socket.write_all(&[1, VNC_SECURITY_NONE]).await.unwrap();

            let mut selected_security = [0u8; 1];
            socket.read_exact(&mut selected_security).await.unwrap();
            assert_eq!(selected_security[0], VNC_SECURITY_NONE);

            socket.write_all(&0u32.to_be_bytes()).await.unwrap();

            let mut client_init = [0u8; 1];
            socket.read_exact(&mut client_init).await.unwrap();
            assert_eq!(client_init[0], 1);

            socket
                .write_all(&[
                    0x07, 0x80, 0x04, 0x38, 32, 24, 0, 1, 0, 0xff, 0, 0xff, 0, 0xff, 16, 8, 0, 0,
                    0, 0, 0, 0, 0, 0,
                ])
                .await
                .unwrap();
        });

        probe_vnc(&addr.to_string()).await.unwrap();
        server.await.unwrap();
    }

    #[tokio::test]
    async fn probe_vnc_rejects_non_rfb_server() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();

        let server = tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();
            socket.write_all(b"HTTP/1.1 200").await.unwrap();
        });

        let err = probe_vnc(&addr.to_string()).await.unwrap_err();
        assert!(err.contains("RFB greeting"));
        server.await.unwrap();
    }
}
