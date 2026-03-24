//! Persistent WebSocket client for the OpenClaw Gateway.
//!
//! Maintains a long-lived connection to the gateway, handles the `connect`
//! handshake with password auth, routes responses back to waiting callers
//! via one-shot channels, and broadcasts gateway events to subscribers.
//!
//! The connection auto-reconnects on disconnect with a 5-second delay.

use futures::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tokio::sync::{broadcast, Mutex, RwLock};
use tokio_tungstenite::tungstenite::Message as TungsteniteMessage;

// ---------------------------------------------------------------------------
// Connection state
// ---------------------------------------------------------------------------

/// Observable connection state for the gateway WebSocket.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ConnectionState {
    /// No OPENCLAW_WS configured.
    NotConfigured,
    /// Actively trying to establish a connection.
    Connecting,
    /// Connected and handshake complete.
    Connected,
    /// Connection lost; will auto-reconnect.
    Disconnected,
}

impl std::fmt::Display for ConnectionState {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ConnectionState::NotConfigured => write!(f, "not_configured"),
            ConnectionState::Connecting => write!(f, "connecting"),
            ConnectionState::Connected => write!(f, "connected"),
            ConnectionState::Disconnected => write!(f, "disconnected"),
        }
    }
}

// ---------------------------------------------------------------------------
// Gateway protocol types
// ---------------------------------------------------------------------------

/// A pending request waiting for a response from the gateway.
struct PendingRequest {
    tx: tokio::sync::oneshot::Sender<Result<Value, String>>,
}

// ---------------------------------------------------------------------------
// GatewayWsClient
// ---------------------------------------------------------------------------

/// Persistent WebSocket client for the OpenClaw Gateway.
///
/// Holds the write half of the WS connection behind a mutex, a map of
/// pending request IDs to one-shot senders, and a broadcast channel
/// for gateway events.
pub struct GatewayWsClient {
    /// The gateway WebSocket URL (e.g. `ws://10.0.0.173:18789`).
    ws_url: String,
    /// Password for the `connect` handshake.
    password: String,
    /// Current connection state.
    state: Arc<RwLock<ConnectionState>>,
    /// Write half of the WS stream (None when disconnected).
    writer: Arc<Mutex<Option<WriterHandle>>>,
    /// Monotonic request ID counter.
    next_id: AtomicU64,
    /// Pending requests awaiting a response keyed by string ID.
    pending: Arc<Mutex<HashMap<String, PendingRequest>>>,
    /// Broadcast channel for gateway events.
    event_tx: broadcast::Sender<Value>,
}

/// Type alias for the write half of a tokio-tungstenite WebSocket.
type WriterHandle = futures::stream::SplitSink<
    tokio_tungstenite::WebSocketStream<
        tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
    >,
    TungsteniteMessage,
>;

impl GatewayWsClient {
    /// Create a new gateway client. Does NOT connect yet — call `start()` to
    /// spawn the background connection loop.
    pub fn new(ws_url: String, password: String) -> Arc<Self> {
        let (event_tx, _) = broadcast::channel(256);
        Arc::new(Self {
            ws_url,
            password,
            state: Arc::new(RwLock::new(ConnectionState::Disconnected)),
            writer: Arc::new(Mutex::new(None)),
            next_id: AtomicU64::new(1),
            pending: Arc::new(Mutex::new(HashMap::new())),
            event_tx,
        })
    }

    /// Spawn the background connection loop. Reconnects automatically on failure.
    pub fn start(self: &Arc<Self>) {
        let client = Arc::clone(self);
        tokio::spawn(async move {
            loop {
                client.set_state(ConnectionState::Connecting).await;
                match client.connect_once().await {
                    Ok(()) => {
                        tracing::info!("[gateway-ws] connection closed cleanly");
                    }
                    Err(e) => {
                        tracing::warn!("[gateway-ws] connection error: {e}");
                    }
                }

                // Connection dropped — clean up and reconnect.
                client.set_state(ConnectionState::Disconnected).await;
                *client.writer.lock().await = None;
                client.drain_pending("gateway disconnected").await;

                tracing::info!("[gateway-ws] reconnecting in 5s...");
                tokio::time::sleep(std::time::Duration::from_secs(5)).await;
            }
        });
    }

    /// Return the current connection state.
    pub async fn connection_state(&self) -> ConnectionState {
        *self.state.read().await
    }

    /// Send a request to the gateway and wait for the matching response.
    ///
    /// Returns the `payload` field on success or an error string on failure.
    /// Times out after 30 seconds.
    pub async fn request(
        &self,
        method: &str,
        params: Value,
    ) -> Result<Value, String> {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed).to_string();

        let msg = json!({
            "type": "req",
            "id": id,
            "method": method,
            "params": params,
        });

        let (tx, rx) = tokio::sync::oneshot::channel();
        self.pending.lock().await.insert(id.clone(), PendingRequest { tx });

        // Send the request frame.
        {
            let mut writer_guard = self.writer.lock().await;
            let writer = writer_guard.as_mut().ok_or_else(|| {
                "gateway not connected".to_string()
            })?;
            writer
                .send(TungsteniteMessage::Text(msg.to_string()))
                .await
                .map_err(|e| {
                    format!("failed to send to gateway: {e}")
                })?;
        }

        // Wait for the response with a timeout.
        match tokio::time::timeout(std::time::Duration::from_secs(30), rx).await {
            Ok(Ok(result)) => result,
            Ok(Err(_)) => Err("request cancelled (sender dropped)".into()),
            Err(_) => {
                // Timed out — remove from pending map.
                self.pending.lock().await.remove(&id);
                Err("request timed out (30s)".into())
            }
        }
    }

    /// Subscribe to gateway events. Returns a broadcast receiver.
    pub fn subscribe_events(&self) -> broadcast::Receiver<Value> {
        self.event_tx.subscribe()
    }

    // -----------------------------------------------------------------------
    // Internal helpers
    // -----------------------------------------------------------------------

    async fn set_state(&self, new_state: ConnectionState) {
        let mut guard = self.state.write().await;
        if *guard != new_state {
            tracing::debug!("[gateway-ws] state: {} -> {}", *guard, new_state);
            *guard = new_state;
        }
    }

    /// Drain all pending requests with an error message (e.g. on disconnect).
    async fn drain_pending(&self, reason: &str) {
        let mut pending = self.pending.lock().await;
        for (_id, req) in pending.drain() {
            let _ = req.tx.send(Err(reason.to_string()));
        }
    }

    /// Run a single connection attempt: connect, handshake, then read loop.
    async fn connect_once(self: &Arc<Self>) -> anyhow::Result<()> {
        tracing::info!("[gateway-ws] connecting to {}", self.ws_url);

        let (ws_stream, _response) =
            tokio_tungstenite::connect_async(&self.ws_url).await?;

        let (write, mut read) = ws_stream.split();
        *self.writer.lock().await = Some(write);

        // Send the connect handshake.
        let handshake_id = self
            .next_id
            .fetch_add(1, Ordering::Relaxed)
            .to_string();

        let connect_msg = json!({
            "type": "req",
            "id": handshake_id,
            "method": "connect",
            "params": {
                "auth": {
                    "type": "password",
                    "password": self.password,
                }
            }
        });

        {
            let mut writer_guard = self.writer.lock().await;
            if let Some(ref mut w) = *writer_guard {
                w.send(TungsteniteMessage::Text(connect_msg.to_string()))
                    .await?;
            }
        }

        // Wait for the handshake response.
        let handshake_ok = Self::wait_for_handshake(
            &mut read,
            &handshake_id,
        )
        .await?;

        if !handshake_ok {
            anyhow::bail!("gateway handshake rejected (bad password?)");
        }

        self.set_state(ConnectionState::Connected).await;
        tracing::info!("[gateway-ws] connected and authenticated");

        // Spawn a heartbeat/ping task to keep the connection alive.
        let writer_clone = Arc::clone(&self.writer);
        let heartbeat = tokio::spawn(async move {
            let mut interval = tokio::time::interval(std::time::Duration::from_secs(30));
            loop {
                interval.tick().await;
                let mut guard = writer_clone.lock().await;
                if let Some(ref mut w) = *guard {
                    if w.send(TungsteniteMessage::Ping(vec![])).await.is_err() {
                        break;
                    }
                } else {
                    break;
                }
            }
        });

        // Main read loop: dispatch responses and events.
        let result = self.read_loop(&mut read).await;

        heartbeat.abort();
        result
    }

    /// Wait for the handshake response. Returns true if `hello-ok`.
    async fn wait_for_handshake<S>(
        read: &mut S,
        expected_id: &str,
    ) -> anyhow::Result<bool>
    where
        S: futures::Stream<
                Item = Result<
                    TungsteniteMessage,
                    tokio_tungstenite::tungstenite::Error,
                >,
            > + Unpin,
    {
        let timeout = std::time::Duration::from_secs(10);
        match tokio::time::timeout(timeout, read.next()).await {
            Ok(Some(Ok(TungsteniteMessage::Text(text)))) => {
                let val: Value = serde_json::from_str(&text)
                    .unwrap_or_default();
                let msg_type = val.get("type").and_then(|t| t.as_str());
                let msg_id = val.get("id").and_then(|i| i.as_str());

                if msg_type == Some("res") && msg_id == Some(expected_id) {
                    let ok = val.get("ok").and_then(|v| v.as_bool()).unwrap_or(false);
                    if !ok {
                        let err = val
                            .get("error")
                            .and_then(|e| e.as_str())
                            .unwrap_or("unknown error");
                        tracing::error!(
                            "[gateway-ws] handshake failed: {err}"
                        );
                    }
                    Ok(ok)
                } else {
                    tracing::warn!(
                        "[gateway-ws] unexpected handshake frame: {text}"
                    );
                    Ok(false)
                }
            }
            Ok(Some(Ok(_))) => {
                tracing::warn!(
                    "[gateway-ws] non-text frame during handshake"
                );
                Ok(false)
            }
            Ok(Some(Err(e))) => Err(e.into()),
            Ok(None) => anyhow::bail!("connection closed during handshake"),
            Err(_) => anyhow::bail!("handshake timed out (10s)"),
        }
    }

    /// Read messages from the WebSocket and dispatch to pending requests or
    /// the event broadcast channel.
    async fn read_loop<S>(self: &Arc<Self>, read: &mut S) -> anyhow::Result<()>
    where
        S: futures::Stream<
                Item = Result<
                    TungsteniteMessage,
                    tokio_tungstenite::tungstenite::Error,
                >,
            > + Unpin,
    {
        while let Some(msg) = read.next().await {
            match msg {
                Ok(TungsteniteMessage::Text(text)) => {
                    self.handle_text_frame(&text).await;
                }
                Ok(TungsteniteMessage::Close(_)) => {
                    tracing::debug!("[gateway-ws] server sent close frame");
                    break;
                }
                Ok(TungsteniteMessage::Ping(_)) => {
                    // tungstenite handles pong automatically
                }
                Ok(_) => {}
                Err(e) => {
                    return Err(anyhow::anyhow!(
                        "WebSocket read error: {e}"
                    ));
                }
            }
        }
        Ok(())
    }

    /// Parse a text frame and route it to the correct handler.
    async fn handle_text_frame(&self, text: &str) {
        let val: Value = match serde_json::from_str(text) {
            Ok(v) => v,
            Err(e) => {
                tracing::warn!(
                    "[gateway-ws] non-JSON frame: {e}"
                );
                return;
            }
        };

        let msg_type = val.get("type").and_then(|t| t.as_str());

        match msg_type {
            Some("res") => {
                // Response to a pending request.
                let id = val
                    .get("id")
                    .and_then(|i| i.as_str())
                    .unwrap_or("")
                    .to_string();

                if id.is_empty() {
                    return;
                }

                let mut pending = self.pending.lock().await;
                if let Some(req) = pending.remove(&id) {
                    let ok = val.get("ok").and_then(|v| v.as_bool()).unwrap_or(false);
                    let result = if ok {
                        Ok(val.get("payload").cloned().unwrap_or(Value::Null))
                    } else {
                        let error = val
                            .get("error")
                            .and_then(|e| e.as_str())
                            .unwrap_or("unknown gateway error")
                            .to_string();
                        Err(error)
                    };
                    let _ = req.tx.send(result);
                }
            }
            Some("event") => {
                // Broadcast event to all subscribers.
                // It's fine if nobody is listening (send returns Err on 0 receivers).
                let _ = self.event_tx.send(val);
            }
            _ => {
                tracing::trace!(
                    "[gateway-ws] unhandled frame type: {:?}",
                    msg_type
                );
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn connection_state_display() {
        assert_eq!(ConnectionState::NotConfigured.to_string(), "not_configured");
        assert_eq!(ConnectionState::Connecting.to_string(), "connecting");
        assert_eq!(ConnectionState::Connected.to_string(), "connected");
        assert_eq!(ConnectionState::Disconnected.to_string(), "disconnected");
    }

    #[test]
    fn connection_state_serde() {
        let json = serde_json::to_string(&ConnectionState::Connected).unwrap();
        assert_eq!(json, "\"connected\"");

        let parsed: ConnectionState = serde_json::from_str("\"disconnected\"").unwrap();
        assert_eq!(parsed, ConnectionState::Disconnected);
    }

    #[tokio::test]
    async fn client_request_fails_when_not_connected() {
        let client = GatewayWsClient::new(
            "ws://127.0.0.1:1".into(),
            "test".into(),
        );
        let result = client.request("sessions.list", json!({})).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("not connected"));
    }

    #[test]
    fn event_subscriber_receives_nothing_without_events() {
        let client = GatewayWsClient::new(
            "ws://127.0.0.1:1".into(),
            "test".into(),
        );
        let mut rx = client.subscribe_events();
        // try_recv should return empty since no events have been sent
        assert!(rx.try_recv().is_err());
    }
}
