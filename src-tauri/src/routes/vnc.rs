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
const LOCAL_TUNNEL_SERVICE: &str = "openclaw-sunshine-tunnel.service";
const REMOTE_VNC_SERVICE: &str = "clawcontrol-vnc.service";
const REMOTE_VNC_HOST: &str = "openclaw-vm";

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

fn vnc_host(state: &AppState) -> String {
    state
        .secret("VNC_HOST")
        .filter(|h| !h.is_empty())
        .unwrap_or_else(|| "127.0.0.1:5901".to_string())
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

/// Check if the embedded VNC desktop is reachable.
async fn remote_status(State(state): State<AppState>) -> Json<Value> {
    let host = vnc_host(&state);

    let probe_result = probe_vnc(&host).await;
    let reachable = probe_result.is_ok();
    let active = VNC_CONNECTIONS.load(Ordering::Acquire);
    let available = reachable && active < MAX_VNC_CONNECTIONS;
    let probe_error = probe_result.as_ref().err().cloned();

    debug!(
        "remote: VNC at {host} reachable={reachable} probe={:?}",
        probe_error
    );

    Json(json!({
        "configured": true,
        "reachable": reachable,
        "available": available,
        "active": active,
        "max": MAX_VNC_CONNECTIONS,
        "host": host,
        "reason": probe_error,
        "message": if reachable {
            if available { "Embedded viewer is online" } else { "Viewer connection limit reached" }
        } else {
            "Embedded viewer is not reachable"
        }
    }))
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

async fn restart_local_tunnel() -> Result<Value, String> {
    run_repair_command("systemctl", &["--user", "restart", LOCAL_TUNNEL_SERVICE]).await
}

async fn restart_remote_vnc() -> Result<Value, String> {
    run_repair_command(
        "ssh",
        &[
            "-o",
            "BatchMode=yes",
            "-o",
            "ConnectTimeout=10",
            REMOTE_VNC_HOST,
            "systemctl",
            "--user",
            "restart",
            REMOTE_VNC_SERVICE,
        ],
    )
    .await
}

async fn repair_vnc(Json(body): Json<VncRepairRequest>) -> Result<Json<Value>, AppError> {
    let mut steps = Vec::new();

    if matches!(body.target, VncRepairTarget::Vnc | VncRepairTarget::All) {
        match restart_remote_vnc().await {
            Ok(result) => steps.push(json!({ "target": "vnc", "ok": true, "result": result })),
            Err(error) => steps.push(json!({ "target": "vnc", "ok": false, "error": error })),
        }
    }

    if matches!(body.target, VncRepairTarget::Tunnel | VncRepairTarget::All) {
        match restart_local_tunnel().await {
            Ok(result) => steps.push(json!({ "target": "tunnel", "ok": true, "result": result })),
            Err(error) => steps.push(json!({ "target": "tunnel", "ok": false, "error": error })),
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
    let host = vnc_host(&state);
    let tcp = match tokio::time::timeout(Duration::from_secs(5), TcpStream::connect(&host)).await {
        Ok(Ok(tcp)) => tcp,
        Ok(Err(e)) => {
            error!("vnc: TCP connect to {host} failed: {e}");
            return;
        }
        Err(_) => {
            error!("vnc: TCP connect to {host} timed out");
            return;
        }
    };

    info!("vnc: connected to {host}");
    eprintln!("vnc: connected to {host}");

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
        .route("/vnc/status", get(remote_status))
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
            "configured": true,
            "reachable": false,
            "available": false,
            "active": 0,
            "max": MAX_VNC_CONNECTIONS,
            "host": "127.0.0.1:5901",
            "reason": "probe timed out",
            "message": "Embedded viewer is not reachable"
        });
        assert_eq!(val["configured"], true);
        assert_eq!(val["reachable"], false);
        assert_eq!(val["available"], false);
        assert_eq!(val["active"], 0);
        assert_eq!(val["max"], MAX_VNC_CONNECTIONS);
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
