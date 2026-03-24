//! Persistent WebSocket client for the OpenClaw Gateway.
//!
//! Maintains a long-lived connection to the gateway, handles the protocol v3
//! `connect` handshake with token auth, routes responses back to waiting callers
//! via one-shot channels, and broadcasts gateway events to subscribers.
//!
//! The connection auto-reconnects on disconnect with a 5-second delay.

use futures::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;
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
// Error parsing helper
// ---------------------------------------------------------------------------

/// Parse a gateway error value into a string message.
///
/// Protocol v3 sends errors as `{ error: { message: "..." } }` (object format).
/// Falls back to flat string `{ error: "..." }` for compatibility.
fn parse_error_value(val: &Value) -> String {
    val.get("error")
        .and_then(|e| {
            // Try object format first: { message: "..." }
            e.get("message")
                .and_then(|m| m.as_str())
                // Fallback: flat string format
                .or_else(|| e.as_str())
        })
        .unwrap_or("unknown gateway error")
        .to_string()
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
    /// Auth token for the `connect` handshake (stored as OPENCLAW_PASSWORD).
    password: String,
    /// Stable device identifier, format "mc-{12_hex_chars}".
    device_id: String,
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
    /// Negotiated protocol version from the connect response.
    protocol_version: Arc<RwLock<Option<u32>>>,
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
    pub fn new(ws_url: String, password: String, device_id: String) -> Arc<Self> {
        let (event_tx, _) = broadcast::channel(256);
        Arc::new(Self {
            ws_url,
            password,
            device_id,
            state: Arc::new(RwLock::new(ConnectionState::Disconnected)),
            writer: Arc::new(Mutex::new(None)),
            next_id: AtomicU64::new(1),
            pending: Arc::new(Mutex::new(HashMap::new())),
            event_tx,
            protocol_version: Arc::new(RwLock::new(None)),
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
                // Clear protocol version on disconnect
                *client.protocol_version.write().await = None;

                tracing::info!("[gateway-ws] reconnecting in 5s...");
                tokio::time::sleep(Duration::from_secs(5)).await;
            }
        });
    }

    /// Return the current connection state.
    pub async fn connection_state(&self) -> ConnectionState {
        *self.state.read().await
    }

    /// Return the negotiated protocol version, if connected.
    pub async fn protocol_version(&self) -> Option<u32> {
        *self.protocol_version.read().await
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
        self.pending
            .lock()
            .await
            .insert(id.clone(), PendingRequest { tx });

        // Send the request frame.
        {
            let mut writer_guard = self.writer.lock().await;
            let writer = writer_guard
                .as_mut()
                .ok_or_else(|| "gateway not connected".to_string())?;
            writer
                .send(TungsteniteMessage::Text(msg.to_string()))
                .await
                .map_err(|e| format!("failed to send to gateway: {e}"))?;
        }

        // Wait for the response with a timeout.
        match tokio::time::timeout(Duration::from_secs(30), rx).await {
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
    // Protocol v3 connect message
    // -----------------------------------------------------------------------

    /// Build the protocol v3 connect message with full identity and scopes.
    pub(crate) fn build_connect_message(&self) -> Value {
        let handshake_id = self.next_id.fetch_add(1, Ordering::Relaxed).to_string();

        let mut params = json!({
            "minProtocol": 3,
            "maxProtocol": 3,
            "role": "operator",
            "scopes": [
                "operator.read",
                "operator.admin",
                "operator.approvals",
                "operator.pairing"
            ],
            "client": {
                "id": "openclaw-manager",
                "version": env!("CARGO_PKG_VERSION"),
                "platform": std::env::consts::OS,
                "mode": "ui",
                "deviceId": self.device_id
            }
        });

        // Add auth token if password is configured
        if !self.password.is_empty() {
            params["auth"] = json!({ "token": self.password });
        }

        json!({
            "type": "req",
            "id": handshake_id,
            "method": "connect",
            "params": params
        })
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

        // Wait up to 2 seconds for an optional connect.challenge event.
        // The server MAY send this before the client's connect request.
        let _nonce: Option<String> = match tokio::time::timeout(
            Duration::from_secs(2),
            read.next(),
        )
        .await
        {
            Ok(Some(Ok(TungsteniteMessage::Text(text)))) => {
                let val: Value = serde_json::from_str(&text).unwrap_or_default();
                if val.get("type").and_then(|t| t.as_str()) == Some("event")
                    && val.get("event").and_then(|e| e.as_str())
                        == Some("connect.challenge")
                {
                    tracing::debug!("[gateway-ws] received connect.challenge");
                    val.pointer("/payload/nonce")
                        .and_then(|n| n.as_str())
                        .map(String::from)
                } else {
                    // Not a challenge — this might be an unexpected frame.
                    // Log it and proceed; the connect will still work.
                    tracing::debug!(
                        "[gateway-ws] first frame is not connect.challenge, proceeding"
                    );
                    None
                }
            }
            Ok(Some(Ok(_))) => {
                tracing::debug!("[gateway-ws] non-text frame before handshake");
                None
            }
            Ok(Some(Err(e))) => {
                return Err(anyhow::anyhow!(
                    "WebSocket error before handshake: {e}"
                ));
            }
            Ok(None) => {
                anyhow::bail!("connection closed before handshake");
            }
            Err(_) => {
                // Timeout — no challenge sent, proceed normally.
                tracing::debug!(
                    "[gateway-ws] no connect.challenge received (2s timeout), proceeding"
                );
                None
            }
        };

        // Build and send the protocol v3 connect message.
        let connect_msg = self.build_connect_message();
        let handshake_id = connect_msg
            .get("id")
            .and_then(|i| i.as_str())
            .unwrap_or("0")
            .to_string();

        {
            let mut writer_guard = self.writer.lock().await;
            if let Some(ref mut w) = *writer_guard {
                w.send(TungsteniteMessage::Text(connect_msg.to_string()))
                    .await?;
            }
        }

        // Wait for the handshake response.
        let handshake_ok =
            Self::wait_for_handshake(&mut read, &handshake_id).await?;

        if !handshake_ok {
            anyhow::bail!("gateway handshake rejected");
        }

        self.set_state(ConnectionState::Connected).await;
        tracing::info!("[gateway-ws] connected and authenticated (protocol v3)");

        // Spawn a heartbeat/ping task to keep the connection alive.
        let writer_clone = Arc::clone(&self.writer);
        let heartbeat = tokio::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_secs(30));
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

    /// Wait for the handshake response. Returns true if the server accepted.
    ///
    /// On success, stores the negotiated protocol version from the response payload.
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
        let timeout = Duration::from_secs(10);
        match tokio::time::timeout(timeout, read.next()).await {
            Ok(Some(Ok(TungsteniteMessage::Text(text)))) => {
                let val: Value =
                    serde_json::from_str(&text).unwrap_or_default();
                let msg_type = val.get("type").and_then(|t| t.as_str());
                let msg_id = val.get("id").and_then(|i| i.as_str());

                if msg_type == Some("res") && msg_id == Some(expected_id) {
                    let ok = val
                        .get("ok")
                        .and_then(|v| v.as_bool())
                        .unwrap_or(false);
                    if !ok {
                        let err = parse_error_value(&val);
                        tracing::error!(
                            "[gateway-ws] handshake failed: {err}"
                        );
                    } else {
                        // Log connect response payload for debugging
                        if let Some(payload) = val.get("payload") {
                            tracing::info!(
                                "[gateway-ws] connect response payload: {}",
                                payload
                            );
                        }
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
    async fn read_loop<S>(
        self: &Arc<Self>,
        read: &mut S,
    ) -> anyhow::Result<()>
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
                tracing::warn!("[gateway-ws] non-JSON frame: {e}");
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
                    let ok = val
                        .get("ok")
                        .and_then(|v| v.as_bool())
                        .unwrap_or(false);
                    let result = if ok {
                        // Store protocol version from connect response if present
                        if let Some(protocol) = val
                            .pointer("/payload/protocol")
                            .and_then(|p| p.as_u64())
                        {
                            *self.protocol_version.write().await =
                                Some(protocol as u32);
                        }
                        Ok(val
                            .get("payload")
                            .cloned()
                            .unwrap_or(Value::Null))
                    } else {
                        Err(parse_error_value(&val))
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

    /// Helper to create a test client with a known device_id.
    fn test_client() -> Arc<GatewayWsClient> {
        GatewayWsClient::new(
            "ws://127.0.0.1:1".into(),
            "test-token".into(),
            "mc-aabbccddeeff".into(),
        )
    }

    #[test]
    fn connection_state_display() {
        assert_eq!(
            ConnectionState::NotConfigured.to_string(),
            "not_configured"
        );
        assert_eq!(ConnectionState::Connecting.to_string(), "connecting");
        assert_eq!(ConnectionState::Connected.to_string(), "connected");
        assert_eq!(
            ConnectionState::Disconnected.to_string(),
            "disconnected"
        );
    }

    #[test]
    fn connection_state_serde() {
        let json =
            serde_json::to_string(&ConnectionState::Connected).unwrap();
        assert_eq!(json, "\"connected\"");

        let parsed: ConnectionState =
            serde_json::from_str("\"disconnected\"").unwrap();
        assert_eq!(parsed, ConnectionState::Disconnected);
    }

    #[tokio::test]
    async fn client_request_fails_when_not_connected() {
        let client = test_client();
        let result = client.request("sessions.list", json!({})).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("not connected"));
    }

    #[test]
    fn event_subscriber_receives_nothing_without_events() {
        let client = test_client();
        let mut rx = client.subscribe_events();
        // try_recv should return empty since no events have been sent
        assert!(rx.try_recv().is_err());
    }

    // ---- Protocol v3 tests ----

    #[test]
    fn connect_message_protocol_v3() {
        let client = test_client();
        let msg = client.build_connect_message();

        // Verify top-level fields
        assert_eq!(msg["type"], "req");
        assert_eq!(msg["method"], "connect");
        assert!(msg.get("id").is_some(), "missing id field");

        // Verify protocol negotiation
        let params = &msg["params"];
        assert_eq!(params["minProtocol"], 3);
        assert_eq!(params["maxProtocol"], 3);

        // Verify role and scopes
        assert_eq!(params["role"], "operator");
        let scopes = params["scopes"].as_array().expect("scopes should be array");
        let scope_strs: Vec<&str> = scopes
            .iter()
            .map(|s| s.as_str().unwrap())
            .collect();
        assert!(scope_strs.contains(&"operator.read"));
        assert!(scope_strs.contains(&"operator.admin"));
        assert!(scope_strs.contains(&"operator.approvals"));
        assert!(scope_strs.contains(&"operator.pairing"));

        // Verify client metadata
        let client_meta = &params["client"];
        assert_eq!(client_meta["id"], "openclaw-manager");
        assert_eq!(client_meta["mode"], "ui");
        assert!(
            client_meta.get("version").is_some(),
            "missing client.version"
        );
        assert!(
            client_meta.get("platform").is_some(),
            "missing client.platform"
        );

        // Verify auth token (NOT password format)
        assert_eq!(params["auth"]["token"], "test-token");
        assert!(
            params.get("auth").unwrap().get("type").is_none(),
            "should NOT have auth.type field"
        );
        assert!(
            params.get("auth").unwrap().get("password").is_none(),
            "should NOT have auth.password field"
        );
    }

    #[test]
    fn connect_message_omits_auth_when_empty() {
        let client = GatewayWsClient::new(
            "ws://127.0.0.1:1".into(),
            "".into(),
            "mc-aabbccddeeff".into(),
        );
        let msg = client.build_connect_message();
        assert!(
            msg["params"].get("auth").is_none(),
            "auth should be omitted when password is empty"
        );
    }

    #[test]
    fn client_metadata_includes_device_identity() {
        let client = test_client();
        let msg = client.build_connect_message();
        let client_meta = &msg["params"]["client"];

        assert_eq!(
            client_meta["platform"].as_str().unwrap(),
            std::env::consts::OS
        );
        assert_eq!(
            client_meta["version"].as_str().unwrap(),
            env!("CARGO_PKG_VERSION")
        );
        assert_eq!(
            client_meta["deviceId"].as_str().unwrap(),
            "mc-aabbccddeeff"
        );
    }

    #[tokio::test]
    async fn error_response_object_format() {
        let client = test_client();

        // Insert a pending request with id "1"
        let (tx, rx) = tokio::sync::oneshot::channel();
        client
            .pending
            .lock()
            .await
            .insert("1".into(), PendingRequest { tx });

        // Simulate receiving an error response in object format
        let frame = r#"{"type":"res","id":"1","ok":false,"error":{"message":"auth failed"}}"#;
        client.handle_text_frame(frame).await;

        let result = rx.await.expect("channel should not be dropped");
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "auth failed");
    }

    #[tokio::test]
    async fn error_response_flat_string_fallback() {
        let client = test_client();

        // Insert a pending request with id "1"
        let (tx, rx) = tokio::sync::oneshot::channel();
        client
            .pending
            .lock()
            .await
            .insert("1".into(), PendingRequest { tx });

        // Simulate receiving an error response in flat string format
        let frame =
            r#"{"type":"res","id":"1","ok":false,"error":"simple error"}"#;
        client.handle_text_frame(frame).await;

        let result = rx.await.expect("channel should not be dropped");
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "simple error");
    }

    #[test]
    fn connect_challenge_handled() {
        // Verify that a connect.challenge event is recognized as valid
        // and does not cause a parsing failure.
        let challenge_frame = json!({
            "type": "event",
            "event": "connect.challenge",
            "payload": {
                "nonce": "abc123"
            }
        });

        let msg_type = challenge_frame
            .get("type")
            .and_then(|t| t.as_str());
        let event_name = challenge_frame
            .get("event")
            .and_then(|e| e.as_str());
        let nonce = challenge_frame
            .pointer("/payload/nonce")
            .and_then(|n| n.as_str());

        assert_eq!(msg_type, Some("event"));
        assert_eq!(event_name, Some("connect.challenge"));
        assert_eq!(nonce, Some("abc123"));
    }

    #[tokio::test]
    async fn protocol_version_stored_from_response() {
        let client = test_client();

        // Insert a pending request with id "42"
        let (tx, rx) = tokio::sync::oneshot::channel();
        client
            .pending
            .lock()
            .await
            .insert("42".into(), PendingRequest { tx });

        // Simulate a successful connect response with protocol version
        let frame = r#"{"type":"res","id":"42","ok":true,"payload":{"protocol":3,"server":"openclaw-gateway"}}"#;
        client.handle_text_frame(frame).await;

        let result = rx.await.expect("channel should not be dropped");
        assert!(result.is_ok());

        // Verify protocol version was stored
        let version = client.protocol_version().await;
        assert_eq!(version, Some(3));
    }

    #[test]
    fn parse_error_object_format() {
        let val: Value = json!({"error": {"message": "not authorized"}});
        assert_eq!(parse_error_value(&val), "not authorized");
    }

    #[test]
    fn parse_error_flat_string() {
        let val: Value = json!({"error": "timeout"});
        assert_eq!(parse_error_value(&val), "timeout");
    }

    #[test]
    fn parse_error_missing() {
        let val: Value = json!({"ok": false});
        assert_eq!(parse_error_value(&val), "unknown gateway error");
    }
}
