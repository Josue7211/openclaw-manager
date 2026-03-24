//! Gateway WebSocket client — maintains a persistent connection to the
//! OpenClaw gateway and broadcasts received events to local subscribers.
//!
//! The client connects to the gateway's WebSocket endpoint, authenticates
//! with the configured API key, and re-broadcasts all received event frames
//! via a `tokio::sync::broadcast` channel. SSE endpoints and other internal
//! consumers subscribe to this channel to receive real-time gateway events.

use serde_json::Value;
use std::sync::Arc;
use tokio::sync::{broadcast, RwLock};

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

/// Client that maintains a WebSocket connection to the OpenClaw gateway
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
        assert_eq!(client.connection_state().await, ConnectionState::Disconnected);
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
}
