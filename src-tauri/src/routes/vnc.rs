use axum::{
    extract::{
        ws::{Message, WebSocket},
        State, WebSocketUpgrade,
    },
    response::{IntoResponse, Response},
    routing::get,
    Json, Router,
};
use futures::{SinkExt, StreamExt};
use serde_json::{json, Value};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tracing::{debug, error, info};

use crate::server::AppState;

static VNC_CONNECTIONS: AtomicUsize = AtomicUsize::new(0);
const MAX_VNC_CONNECTIONS: usize = 8;

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

/// Check if the embedded VNC desktop is reachable.
async fn remote_status(State(state): State<AppState>) -> Json<Value> {
    let host = vnc_host(&state);

    let reachable = tokio::time::timeout(Duration::from_secs(3), TcpStream::connect(&host))
        .await
        .map(|r| r.is_ok())
        .unwrap_or(false);

    debug!("remote: VNC at {host} reachable={reachable}");

    Json(json!({
        "configured": true,
        "reachable": reachable,
        "host": host,
        "message": if reachable { "Embedded viewer is online" } else { "Embedded viewer is not reachable" }
    }))
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
        .route("/vnc/ws", get(vnc_ws))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn remote_status_response_shape() {
        // Ensures JSON structure compiles
        let val = json!({
            "configured": true,
            "reachable": false,
            "host": "127.0.0.1:5901",
            "message": "Embedded viewer is not reachable"
        });
        assert_eq!(val["configured"], true);
        assert_eq!(val["reachable"], false);
    }
}
