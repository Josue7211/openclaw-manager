//! Gateway WebSocket client — maintains a persistent connection to the
//! Hermes Agent gateway and broadcasts received events to local subscribers.
//!
//! The client connects to the gateway's WebSocket endpoint, authenticates
//! with the configured API key, and re-broadcasts all received event frames
//! via a `tokio::sync::broadcast` channel. SSE endpoints and other internal
//! consumers subscribe to this channel to receive real-time gateway events.

use futures::{SinkExt, StreamExt};
use serde_json::{json, Value};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{broadcast, RwLock};
use tokio_tungstenite::{connect_async, tungstenite::Message as TungMessage};

/// Gateway connection state.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ConnectionState {
    /// No gateway URL configured.
    NotConfigured,
    /// Actively trying to connect.
    Connecting,
    /// Was connected, lost connection, trying to reconnect.
    Reconnecting,
    /// Successfully connected and receiving events.
    Connected,
    /// Disconnected (not attempting reconnect).
    Disconnected,
}

impl std::fmt::Display for ConnectionState {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::NotConfigured => write!(f, "not_configured"),
            Self::Connecting => write!(f, "connecting"),
            Self::Reconnecting => write!(f, "reconnecting"),
            Self::Connected => write!(f, "connected"),
            Self::Disconnected => write!(f, "disconnected"),
        }
    }
}

/// Internal mutable state behind the RwLock.
struct Inner {
    state: ConnectionState,
    protocol_version: Option<u32>,
    reconnect_attempt: u64,
}

/// Client that maintains a WebSocket connection to the Hermes Agent gateway
/// and broadcasts events to local subscribers.
pub struct GatewayWsClient {
    event_tx: broadcast::Sender<Value>,
    inner: RwLock<Inner>,
}

impl GatewayWsClient {
    /// Create a new gateway WebSocket client.
    ///
    /// The broadcast channel has a capacity of 256 — if a subscriber falls
    /// behind, it will receive a `Lagged` error and skip missed events.
    pub fn new() -> Arc<Self> {
        let (event_tx, _) = broadcast::channel(256);
        Arc::new(Self {
            event_tx,
            inner: RwLock::new(Inner {
                state: ConnectionState::Disconnected,
                protocol_version: None,
                reconnect_attempt: 0,
            }),
        })
    }

    /// Subscribe to gateway events. Returns a broadcast receiver.
    pub fn subscribe_events(&self) -> broadcast::Receiver<Value> {
        self.event_tx.subscribe()
    }

    /// Get the current connection state.
    pub async fn connection_state(&self) -> ConnectionState {
        self.inner.read().await.state.clone()
    }

    /// Get the negotiated protocol version (if connected).
    pub async fn protocol_version(&self) -> Option<u32> {
        self.inner.read().await.protocol_version
    }

    /// Get the current reconnect attempt counter.
    pub async fn reconnect_attempt(&self) -> u64 {
        self.inner.read().await.reconnect_attempt
    }

    /// Publish an event to all subscribers. Used internally by the WS read loop.
    pub fn publish_event(&self, event: Value) {
        // Ignore send errors — they just mean no subscribers right now
        let _ = self.event_tx.send(event);
    }

    /// Update the connection state.
    pub async fn set_state(&self, state: ConnectionState) {
        self.inner.write().await.state = state;
    }

    /// Update the protocol version.
    pub async fn set_protocol_version(&self, version: Option<u32>) {
        self.inner.write().await.protocol_version = version;
    }

    /// Increment and return the reconnect attempt counter.
    pub async fn increment_reconnect(&self) -> u64 {
        let mut inner = self.inner.write().await;
        inner.reconnect_attempt += 1;
        inner.reconnect_attempt
    }

    /// Reset the reconnect attempt counter (called on successful connect).
    pub async fn reset_reconnect(&self) {
        self.inner.write().await.reconnect_attempt = 0;
    }

    /// Maintain a persistent Hermes Agent gateway WebSocket connection.
    ///
    /// The gateway protocol starts with a `connect` RPC. Once accepted, event
    /// frames are published to local subscribers and `/api/gateway/status`
    /// reflects the live connection state.
    pub async fn run(self: Arc<Self>, ws_url: String, auth_token: Option<String>) {
        let ws_url = ws_url.trim().to_string();
        if ws_url.is_empty() {
            self.set_state(ConnectionState::NotConfigured).await;
            return;
        }

        loop {
            self.set_state(ConnectionState::Connecting).await;
            match self.connect_once(&ws_url, auth_token.as_deref()).await {
                Ok(()) => tracing::info!("Hermes Agent gateway WebSocket disconnected"),
                Err(error) => tracing::warn!("Hermes Agent gateway WebSocket error: {error}"),
            }

            let attempt = self.increment_reconnect().await;
            self.set_state(ConnectionState::Reconnecting).await;
            let backoff_secs = (attempt.min(6) * 2).max(2);
            tokio::time::sleep(Duration::from_secs(backoff_secs)).await;
        }
    }

    async fn connect_once(&self, ws_url: &str, auth_token: Option<&str>) -> anyhow::Result<()> {
        let (mut ws, _) = connect_async(ws_url).await?;
        let connect_id = format!("connect-{}", crate::routes::util::random_uuid());
        ws.send(TungMessage::Text(
            gateway_connect_frame(&connect_id, auth_token).to_string(),
        ))
        .await?;

        let mut connected = false;
        while let Some(message) = ws.next().await {
            let message = message?;
            match message {
                TungMessage::Text(text) => {
                    let Ok(frame) = serde_json::from_str::<Value>(&text) else {
                        continue;
                    };

                    if !connected
                        && frame.get("type").and_then(Value::as_str) == Some("res")
                        && frame.get("id").and_then(Value::as_str) == Some(connect_id.as_str())
                    {
                        if frame.get("ok").and_then(Value::as_bool) == Some(true) {
                            connected = true;
                            self.set_protocol_version(protocol_from_connect_frame(&frame))
                                .await;
                            self.reset_reconnect().await;
                            self.set_state(ConnectionState::Connected).await;
                            tracing::info!("Hermes Agent gateway WebSocket connected");
                        } else {
                            anyhow::bail!(
                                "{}",
                                frame
                                    .get("error")
                                    .and_then(Value::as_str)
                                    .unwrap_or("connect rejected")
                            );
                        }
                        continue;
                    }

                    if frame.get("type").and_then(Value::as_str) == Some("event") {
                        self.publish_event(frame);
                    }
                }
                TungMessage::Close(_) => break,
                _ => {}
            }
        }

        self.set_protocol_version(None).await;
        self.set_state(ConnectionState::Disconnected).await;
        Ok(())
    }
}

fn gateway_connect_frame(connect_id: &str, auth_token: Option<&str>) -> Value {
    let mut params = json!({
        "minProtocol": 3,
        "maxProtocol": 3,
        "client": {
            "name": "clawctrl",
            "platform": std::env::consts::OS,
            "mode": "ui",
            "instanceId": crate::routes::util::random_uuid(),
        },
    });

    if let Some(token) = auth_token.map(str::trim).filter(|token| !token.is_empty()) {
        params["auth"] = json!({ "token": token });
    }

    json!({
        "type": "req",
        "id": connect_id,
        "method": "connect",
        "params": params,
    })
}

fn protocol_from_connect_frame(frame: &Value) -> Option<u32> {
    frame
        .get("protocol")
        .or_else(|| {
            frame
                .get("payload")
                .and_then(|payload| payload.get("protocol"))
        })
        .and_then(Value::as_u64)
        .and_then(|value| u32::try_from(value).ok())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_subscribe_receives_published_events() {
        let client = GatewayWsClient::new();
        let mut rx = client.subscribe_events();

        let event = serde_json::json!({
            "type": "event",
            "event": "agent",
            "payload": { "id": "test-agent", "status": "active" }
        });

        client.publish_event(event.clone());

        let received = rx.try_recv().unwrap();
        assert_eq!(received, event);
    }

    #[tokio::test]
    async fn test_connection_state_default() {
        let client = GatewayWsClient::new();
        assert_eq!(
            client.connection_state().await,
            ConnectionState::Disconnected
        );
    }

    #[tokio::test]
    async fn test_set_connection_state() {
        let client = GatewayWsClient::new();
        client.set_state(ConnectionState::Connected).await;
        assert_eq!(client.connection_state().await, ConnectionState::Connected);
    }

    #[tokio::test]
    async fn test_reconnect_counter() {
        let client = GatewayWsClient::new();
        assert_eq!(client.reconnect_attempt().await, 0);

        let attempt = client.increment_reconnect().await;
        assert_eq!(attempt, 1);

        let attempt = client.increment_reconnect().await;
        assert_eq!(attempt, 2);

        client.reset_reconnect().await;
        assert_eq!(client.reconnect_attempt().await, 0);
    }

    #[tokio::test]
    async fn test_protocol_version() {
        let client = GatewayWsClient::new();
        assert_eq!(client.protocol_version().await, None);

        client.set_protocol_version(Some(3)).await;
        assert_eq!(client.protocol_version().await, Some(3));
    }

    #[test]
    fn connect_frame_includes_hermes_gateway_auth() {
        let frame = gateway_connect_frame("connect-test", Some("secret-token"));

        assert_eq!(frame["type"], "req");
        assert_eq!(frame["id"], "connect-test");
        assert_eq!(frame["method"], "connect");
        assert_eq!(frame["params"]["minProtocol"], 3);
        assert_eq!(frame["params"]["maxProtocol"], 3);
        assert_eq!(frame["params"]["auth"]["token"], "secret-token");
        assert_eq!(frame["params"]["client"]["mode"], "ui");
    }

    #[test]
    fn protocol_can_be_read_from_connect_response_shapes() {
        assert_eq!(
            protocol_from_connect_frame(&json!({ "protocol": 3 })),
            Some(3)
        );
        assert_eq!(
            protocol_from_connect_frame(&json!({ "payload": { "protocol": 3 } })),
            Some(3),
        );
        assert_eq!(protocol_from_connect_frame(&json!({ "payload": {} })), None);
    }
}
