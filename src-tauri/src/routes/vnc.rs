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
use tokio::io::{AsyncReadExt, AsyncWriteExt, BufReader, BufWriter};
use tokio::net::TcpStream;
use tracing::{error, info};

use crate::server::{AppState, RequireAuth};

// ---------------------------------------------------------------------------
// CAS connection guard (max 2 concurrent VNC sessions -- each is heavyweight)
// ---------------------------------------------------------------------------

/// Global counter for concurrent VNC connections.
static VNC_CONNECTIONS: AtomicUsize = AtomicUsize::new(0);
const MAX_VNC_CONNECTIONS: usize = 2;

/// RAII guard that decrements the VNC connection counter on drop.
struct VncConnectionGuard;

impl VncConnectionGuard {
    /// Try to acquire a slot. Returns `None` if the limit is reached (CAS loop).
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

// ---------------------------------------------------------------------------
// WebSocket upgrade handler
// ---------------------------------------------------------------------------

/// `GET /api/vnc/ws` -- upgrade to WebSocket and relay binary VNC frames
/// to/from a TCP VNC server.
///
/// Returns bare `Response` (not `Result<Response, AppError>`) -- Axum route
/// gotcha documented in CLAUDE.md: WS upgrade handlers must return bare
/// Response to avoid router registration issues with merged routers.
async fn ws_upgrade(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    ws: WebSocketUpgrade,
) -> Response {
    let guard = match VncConnectionGuard::try_new() {
        Some(g) => g,
        None => {
            return (
                axum::http::StatusCode::TOO_MANY_REQUESTS,
                Json(json!({"error": "too many VNC sessions (max 2)"})),
            )
                .into_response();
        }
    };

    ws.max_message_size(256 * 1024)
        .on_upgrade(move |socket| handle_vnc_ws(socket, state, guard))
}

// ---------------------------------------------------------------------------
// Bidirectional WebSocket <-> TCP VNC relay
// ---------------------------------------------------------------------------

/// Relay binary frames between the client WebSocket (noVNC in browser) and
/// a raw TCP VNC server. This is a dumb binary pipe -- we do NOT parse or
/// inspect VNC protocol frames.
async fn handle_vnc_ws(socket: WebSocket, state: AppState, _guard: VncConnectionGuard) {
    info!("vnc: new VNC session starting");

    // 1. Get VNC host from secrets
    let vnc_host = match state.secret("VNC_HOST") {
        Some(h) if !h.is_empty() => h,
        _ => {
            error!("vnc: VNC_HOST not configured in secrets");
            return;
        }
    };

    // 2. Connect to VNC server with timeout
    let tcp_stream = match tokio::time::timeout(
        Duration::from_secs(5),
        TcpStream::connect(&vnc_host),
    )
    .await
    {
        Ok(Ok(stream)) => stream,
        Ok(Err(e)) => {
            error!("vnc: TCP connect to {vnc_host} failed: {e}");
            let (mut ws_sender, _) = socket.split();
            let _ = ws_sender
                .send(Message::Text(
                    json!({"error": "VNC server unreachable"}).to_string(),
                ))
                .await;
            return;
        }
        Err(_) => {
            error!("vnc: TCP connect to {vnc_host} timed out (5s)");
            let (mut ws_sender, _) = socket.split();
            let _ = ws_sender
                .send(Message::Text(
                    json!({"error": "VNC server unreachable"}).to_string(),
                ))
                .await;
            return;
        }
    };

    info!("vnc: connected to VNC server at {vnc_host}");

    // 3. Split TCP stream
    let (tcp_reader, tcp_writer) = tcp_stream.into_split();

    // 4. Split WebSocket
    let (mut ws_sender, mut ws_receiver) = socket.split();

    // 5. TCP -> WebSocket direction (VNC server output to browser)
    let tcp_to_ws = tokio::spawn(async move {
        let mut reader = BufReader::new(tcp_reader);
        let mut buf = vec![0u8; 16384];
        loop {
            match reader.read(&mut buf).await {
                Ok(0) => break,
                Ok(n) => {
                    if ws_sender
                        .send(Message::Binary(buf[..n].to_vec()))
                        .await
                        .is_err()
                    {
                        break;
                    }
                }
                Err(_) => break,
            }
        }
    });

    // 6. WebSocket -> TCP direction (browser input to VNC server)
    let ws_to_tcp = tokio::spawn(async move {
        let mut writer = BufWriter::new(tcp_writer);
        while let Some(Ok(msg)) = ws_receiver.next().await {
            match msg {
                Message::Binary(data) => {
                    if writer.write_all(&data).await.is_err() {
                        break;
                    }
                    if writer.flush().await.is_err() {
                        break;
                    }
                }
                Message::Close(_) => break,
                _ => {} // Ignore non-binary messages (noVNC sends binary only)
            }
        }
    });

    // 7. Wait for either direction to finish
    tokio::select! {
        _ = tcp_to_ws => {}
        _ = ws_to_tcp => {}
    }

    info!("vnc: session ended");
    // _guard drops here, decrementing VNC_CONNECTIONS
}

// ---------------------------------------------------------------------------
// Status endpoint
// ---------------------------------------------------------------------------

/// `GET /api/vnc/status` -- CAS guard capacity info.
async fn vnc_status(RequireAuth(_session): RequireAuth) -> Json<Value> {
    let active = VNC_CONNECTIONS.load(Ordering::Acquire);
    let available = MAX_VNC_CONNECTIONS.saturating_sub(active);
    Json(json!({
        "active": active,
        "max": MAX_VNC_CONNECTIONS,
        "available": available,
    }))
}

// ---------------------------------------------------------------------------
// Credentials endpoint
// ---------------------------------------------------------------------------

/// `GET /api/vnc/credentials` -- return VNC password from secrets store.
/// Password only crosses localhost (same security model as MC_API_KEY).
async fn vnc_credentials(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Json<Value> {
    Json(json!({
        "password": state.secret_or_default("VNC_PASSWORD"),
    }))
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/vnc/ws", get(ws_upgrade))
        .route("/api/vnc/status", get(vnc_status))
        .route("/api/vnc/credentials", get(vnc_credentials))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn vnc_connection_guard_acquires_up_to_max() {
        // Reset counter to known state
        VNC_CONNECTIONS.store(0, Ordering::SeqCst);

        let g1 = VncConnectionGuard::try_new();
        let g2 = VncConnectionGuard::try_new();
        assert!(g1.is_some(), "1st guard should succeed");
        assert!(g2.is_some(), "2nd guard should succeed");

        // 3rd should fail (max is 2)
        let g3 = VncConnectionGuard::try_new();
        assert!(g3.is_none(), "3rd guard should fail (limit is 2)");

        // Drop one and retry
        drop(g2);
        let g4 = VncConnectionGuard::try_new();
        assert!(g4.is_some(), "guard should succeed after dropping one");

        // Clean up
        drop(g1);
        drop(g4);

        assert_eq!(
            VNC_CONNECTIONS.load(Ordering::SeqCst),
            0,
            "counter should be 0 after dropping all guards"
        );
    }

    #[test]
    fn vnc_status_response_shape() {
        VNC_CONNECTIONS.store(0, Ordering::SeqCst);

        let active = VNC_CONNECTIONS.load(Ordering::Acquire);
        let available = MAX_VNC_CONNECTIONS.saturating_sub(active);
        let response = json!({
            "active": active,
            "max": MAX_VNC_CONNECTIONS,
            "available": available,
        });

        assert_eq!(response["active"], 0);
        assert_eq!(response["max"], 2);
        assert_eq!(response["available"], 2);

        // Simulate 1 connection
        VNC_CONNECTIONS.store(1, Ordering::SeqCst);
        let active = VNC_CONNECTIONS.load(Ordering::Acquire);
        let available = MAX_VNC_CONNECTIONS.saturating_sub(active);
        let response = json!({
            "active": active,
            "max": MAX_VNC_CONNECTIONS,
            "available": available,
        });

        assert_eq!(response["active"], 1);
        assert_eq!(response["max"], 2);
        assert_eq!(response["available"], 1);

        // Full capacity
        VNC_CONNECTIONS.store(2, Ordering::SeqCst);
        let active = VNC_CONNECTIONS.load(Ordering::Acquire);
        let available = MAX_VNC_CONNECTIONS.saturating_sub(active);
        let response = json!({
            "active": active,
            "max": MAX_VNC_CONNECTIONS,
            "available": available,
        });

        assert_eq!(response["active"], 2);
        assert_eq!(response["max"], 2);
        assert_eq!(response["available"], 0);

        // Clean up
        VNC_CONNECTIONS.store(0, Ordering::SeqCst);
    }
}
