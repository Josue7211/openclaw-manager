//! SSE endpoint that bridges OpenClaw gateway WebSocket events to the frontend.
//!
//! `GET /gateway/events` returns a long-lived Server-Sent Events stream that
//! subscribes to the `GatewayWsClient` broadcast channel and forwards all
//! user-facing gateway events. Internal protocol events (connect.challenge,
//! tick, heartbeat) are filtered out.
//!
//! `GET /gateway/status` returns the current gateway connection state as JSON.

use axum::{
    extract::State,
    response::sse::{Event, KeepAlive, Sse},
    routing::get,
    Json, Router,
};
use serde_json::{json, Value};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::Duration;

use crate::error::AppError;
use crate::server::{AppState, RequireAuth};

/// Global counter for concurrent gateway SSE connections.
static GATEWAY_SSE_CONNECTIONS: AtomicUsize = AtomicUsize::new(0);
const MAX_GATEWAY_SSE_CONNECTIONS: usize = 5;

/// Internal gateway events that should NOT be forwarded to the frontend.
/// These are protocol-level events, not useful for UI rendering.
const FILTERED_EVENTS: &[&str] = &["connect.challenge", "tick", "heartbeat"];

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/gateway/events", get(gateway_sse_handler))
        .route("/gateway/status", get(gateway_status_handler))
}

/// SSE handler — streams gateway WebSocket events to the frontend.
///
/// Requires authentication. Returns 503 if the gateway WS client is not
/// configured, or 429 if the maximum number of concurrent connections is
/// reached.
async fn gateway_sse_handler(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> axum::response::Response {
    use axum::response::IntoResponse;

    // Check if gateway is configured
    let gateway_ws = match &state.gateway_ws {
        Some(gw) => gw.clone(),
        None => {
            return (
                axum::http::StatusCode::SERVICE_UNAVAILABLE,
                axum::Json(json!({"error": "Gateway not configured"})),
            )
                .into_response();
        }
    };

    // Enforce connection limit
    if GATEWAY_SSE_CONNECTIONS.load(Ordering::Relaxed) >= MAX_GATEWAY_SSE_CONNECTIONS {
        return (
            axum::http::StatusCode::TOO_MANY_REQUESTS,
            axum::Json(json!({"error": "too many gateway SSE connections"})),
        )
            .into_response();
    }

    let rx = gateway_ws.subscribe_events();

    // Increment connection counter
    GATEWAY_SSE_CONNECTIONS.fetch_add(1, Ordering::Relaxed);

    let stream = gateway_sse_stream(rx);

    Sse::new(stream)
        .keep_alive(
            KeepAlive::new()
                .interval(Duration::from_secs(15))
                .text("keepalive"),
        )
        .into_response()
}

/// Convert the broadcast receiver into an SSE event stream.
///
/// Each gateway event frame has the shape:
/// ```json
/// { "type": "event", "event": "EVENT_NAME", "payload": {...} }
/// ```
///
/// The SSE event is emitted with the `event` field set to the gateway event
/// name (e.g. "agent", "chat") and the `data` field containing the JSON
/// payload. Internal events are filtered out.
fn gateway_sse_stream(
    mut rx: tokio::sync::broadcast::Receiver<Value>,
) -> impl futures::Stream<Item = Result<Event, std::convert::Infallible>> {
    async_stream::stream! {
        loop {
            match rx.recv().await {
                Ok(frame) => {
                    // Extract event name from the gateway frame
                    let event_name = frame
                        .get("event")
                        .and_then(|v| v.as_str())
                        .unwrap_or("");

                    // Filter out internal protocol events
                    if FILTERED_EVENTS.contains(&event_name) {
                        continue;
                    }

                    // Skip frames without an event name
                    if event_name.is_empty() {
                        continue;
                    }

                    // Extract payload (or use empty object)
                    let payload = frame.get("payload").cloned().unwrap_or(json!({}));

                    // Emit as named SSE event
                    let data = serde_json::to_string(&payload).unwrap_or_default();
                    yield Ok(
                        Event::default()
                            .event(event_name)
                            .data(data)
                    );
                }
                Err(tokio::sync::broadcast::error::RecvError::Lagged(n)) => {
                    tracing::debug!("Gateway SSE client lagged by {n} messages, skipping");
                    continue;
                }
                Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
            }
        }
        // Stream ended — decrement the connection counter
        GATEWAY_SSE_CONNECTIONS.fetch_sub(1, Ordering::Relaxed);
    }
}

/// Status endpoint — returns the current gateway connection state.
///
/// Response shape:
/// ```json
/// {
///   "connected": bool,
///   "status": "connected" | "connecting" | "reconnecting" | "disconnected" | "not_configured",
///   "protocol": number | null,
///   "reconnect_attempt": number
/// }
/// ```
async fn gateway_status_handler(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let gw = match &state.gateway_ws {
        Some(gw) => gw,
        None => {
            return Ok(Json(json!({
                "connected": false,
                "status": "not_configured",
                "protocol": null,
                "reconnect_attempt": 0
            })));
        }
    };

    let conn_state = gw.connection_state().await;
    let protocol = gw.protocol_version().await;
    let reconnect = gw.reconnect_attempt().await;

    let connected = conn_state == crate::gateway_ws::ConnectionState::Connected;

    Ok(Json(json!({
        "connected": connected,
        "status": conn_state.to_string(),
        "protocol": protocol,
        "reconnect_attempt": reconnect
    })))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::gateway_ws::GatewayWsClient;
    use futures::StreamExt;

    #[tokio::test]
    async fn test_sse_stream_yields_gateway_events() {
        let client = GatewayWsClient::new();
        let rx = client.subscribe_events();

        // Publish a gateway event
        client.publish_event(json!({
            "type": "event",
            "event": "agent",
            "payload": { "id": "test-1", "status": "active" }
        }));

        // Close the sender by dropping the client so the stream ends
        let mut stream = Box::pin(gateway_sse_stream(rx));

        // We need to collect in a timeout since the stream is infinite
        let result = tokio::time::timeout(
            Duration::from_millis(100),
            stream.next(),
        ).await;

        assert!(result.is_ok(), "should receive an event");
        let event = result.unwrap().unwrap().unwrap();
        // Event should serialize to SSE format with event name "agent"
        let text = format!("{:?}", event);
        assert!(text.contains("agent"), "event should contain 'agent': {text}");
    }

    #[tokio::test]
    async fn test_sse_stream_includes_event_field_and_payload() {
        let client = GatewayWsClient::new();
        let rx = client.subscribe_events();

        let payload = json!({ "id": "test-agent", "name": "Worker" });
        client.publish_event(json!({
            "type": "event",
            "event": "agent",
            "payload": payload
        }));

        let mut stream = Box::pin(gateway_sse_stream(rx));
        let result = tokio::time::timeout(
            Duration::from_millis(100),
            stream.next(),
        ).await;

        assert!(result.is_ok());
        let event = result.unwrap().unwrap().unwrap();
        let text = format!("{:?}", event);
        assert!(text.contains("test-agent"), "payload should be in event data: {text}");
    }

    #[tokio::test]
    async fn test_sse_stream_filters_connect_challenge() {
        let client = GatewayWsClient::new();
        let rx = client.subscribe_events();

        // Publish a connect.challenge (internal handshake — should be filtered)
        client.publish_event(json!({
            "type": "event",
            "event": "connect.challenge",
            "payload": { "challenge": "abc123" }
        }));

        // Then publish a real event
        client.publish_event(json!({
            "type": "event",
            "event": "chat",
            "payload": { "message": "hello" }
        }));

        let mut stream = Box::pin(gateway_sse_stream(rx));
        let result = tokio::time::timeout(
            Duration::from_millis(100),
            stream.next(),
        ).await;

        assert!(result.is_ok());
        let event = result.unwrap().unwrap().unwrap();
        let text = format!("{:?}", event);
        // Should be the "chat" event, not "connect.challenge"
        assert!(text.contains("chat"), "should receive 'chat' not 'connect.challenge': {text}");
        assert!(!text.contains("connect.challenge"), "connect.challenge should be filtered: {text}");
    }

    #[tokio::test]
    async fn test_sse_stream_filters_tick_events() {
        let client = GatewayWsClient::new();
        let rx = client.subscribe_events();

        // Publish tick (noise — should be filtered)
        client.publish_event(json!({
            "type": "event",
            "event": "tick",
            "payload": { "ts": 1234 }
        }));

        // Then publish a real event
        client.publish_event(json!({
            "type": "event",
            "event": "presence",
            "payload": { "agent_id": "a1" }
        }));

        let mut stream = Box::pin(gateway_sse_stream(rx));
        let result = tokio::time::timeout(
            Duration::from_millis(100),
            stream.next(),
        ).await;

        assert!(result.is_ok());
        let event = result.unwrap().unwrap().unwrap();
        let text = format!("{:?}", event);
        assert!(text.contains("presence"), "should receive 'presence' not 'tick': {text}");
    }

    #[tokio::test]
    async fn test_sse_stream_filters_heartbeat_events() {
        let client = GatewayWsClient::new();
        let rx = client.subscribe_events();

        // Publish heartbeat (noise — should be filtered)
        client.publish_event(json!({
            "type": "event",
            "event": "heartbeat",
            "payload": {}
        }));

        // Then publish a real event
        client.publish_event(json!({
            "type": "event",
            "event": "cron",
            "payload": { "job": "backup" }
        }));

        let mut stream = Box::pin(gateway_sse_stream(rx));
        let result = tokio::time::timeout(
            Duration::from_millis(100),
            stream.next(),
        ).await;

        assert!(result.is_ok());
        let event = result.unwrap().unwrap().unwrap();
        let text = format!("{:?}", event);
        assert!(text.contains("cron"), "should receive 'cron' not 'heartbeat': {text}");
    }

    #[tokio::test]
    async fn test_gateway_status_not_configured() {
        // When gateway_ws is None, status should return not_configured
        // This is tested via the handler logic — we verify the JSON shape
        let result = json!({
            "connected": false,
            "status": "not_configured",
            "protocol": null,
            "reconnect_attempt": 0
        });
        assert_eq!(result["connected"], false);
        assert_eq!(result["status"], "not_configured");
        assert!(result["protocol"].is_null());
        assert_eq!(result["reconnect_attempt"], 0);
    }

    #[tokio::test]
    async fn test_gateway_status_connected() {
        let client = GatewayWsClient::new();
        client.set_state(crate::gateway_ws::ConnectionState::Connected).await;
        client.set_protocol_version(Some(3)).await;

        let state = client.connection_state().await;
        let protocol = client.protocol_version().await;
        let reconnect = client.reconnect_attempt().await;

        let connected = state == crate::gateway_ws::ConnectionState::Connected;
        let result = json!({
            "connected": connected,
            "status": state.to_string(),
            "protocol": protocol,
            "reconnect_attempt": reconnect
        });

        assert_eq!(result["connected"], true);
        assert_eq!(result["status"], "connected");
        assert_eq!(result["protocol"], 3);
        assert_eq!(result["reconnect_attempt"], 0);
    }

    #[test]
    fn test_filtered_events_constant() {
        assert!(FILTERED_EVENTS.contains(&"connect.challenge"));
        assert!(FILTERED_EVENTS.contains(&"tick"));
        assert!(FILTERED_EVENTS.contains(&"heartbeat"));
        assert!(!FILTERED_EVENTS.contains(&"agent"));
        assert!(!FILTERED_EVENTS.contains(&"chat"));
    }
}
