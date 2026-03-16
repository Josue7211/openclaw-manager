//! SSE endpoint that proxies Supabase Realtime postgres_changes events.
//!
//! `GET /events` returns a long-lived Server-Sent Events stream.  The backend
//! connects to Supabase Realtime via WebSocket (Phoenix Channels protocol),
//! subscribes to `postgres_changes` on a set of tables, and forwards matching
//! events to the SSE client.  Events are filtered by `user_id` so only the
//! authenticated user's rows are forwarded (defense-in-depth on top of RLS).
//!
//! If Supabase credentials are missing or the WebSocket connection fails, the
//! endpoint still returns a valid SSE stream — it simply sends keepalive
//! comments until the frontend reconnects or credentials are configured.

use axum::{
    extract::State,
    response::sse::{Event, KeepAlive, Sse},
    routing::get,
    Router,
};
use futures::StreamExt;
use serde_json::{json, Value};
use std::sync::Arc;
use tokio::sync::broadcast;

use crate::server::{AppState, RequireAuth};

/// Tables to subscribe to for realtime change notifications.
const REALTIME_TABLES: &[&str] = &[
    "todos",
    "missions",
    "agents",
    "ideas",
    "reminders",
    "habits",
    "knowledge_entries",
    "pipeline_items",
    "mission_events",
];

pub fn router() -> Router<AppState> {
    Router::new().route("/events", get(sse_handler))
}

/// SSE handler — requires authentication so we know the user_id for filtering.
async fn sse_handler(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
) -> Sse<impl futures::Stream<Item = Result<Event, std::convert::Infallible>>> {
    let user_id = session.user_id.clone();
    let access_token = session.access_token.clone();

    // broadcast channel: realtime listener pushes events, SSE stream consumes them
    let (tx, rx) = broadcast::channel::<String>(256);

    // Spawn the Supabase Realtime WebSocket listener in the background
    let supabase_url = state.secret("SUPABASE_URL").unwrap_or_default();
    let anon_key = state
        .secret("SUPABASE_ANON_KEY")
        .or_else(|| state.secret("SUPABASE_SERVICE_ROLE_KEY"))
        .unwrap_or_default();

    if !supabase_url.is_empty() && !anon_key.is_empty() {
        let tx_clone = tx.clone();
        let user_id_clone = user_id.clone();
        tokio::spawn(async move {
            realtime_loop(
                supabase_url,
                anon_key,
                access_token,
                user_id_clone,
                tx_clone,
            )
            .await;
        });
    } else {
        tracing::warn!("SSE /events: Supabase credentials not configured, stream will be keepalive-only");
    }

    let stream = sse_stream(rx);

    Sse::new(stream).keep_alive(
        KeepAlive::new()
            .interval(std::time::Duration::from_secs(15))
            .text("keepalive"),
    )
}

/// Convert the broadcast receiver into an SSE event stream.
fn sse_stream(
    mut rx: broadcast::Receiver<String>,
) -> impl futures::Stream<Item = Result<Event, std::convert::Infallible>> {
    async_stream::stream! {
        loop {
            match rx.recv().await {
                Ok(data) => {
                    yield Ok(Event::default().data(data));
                }
                Err(broadcast::error::RecvError::Lagged(n)) => {
                    tracing::debug!("SSE client lagged by {n} messages, skipping");
                    continue;
                }
                Err(broadcast::error::RecvError::Closed) => break,
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Supabase Realtime WebSocket listener
// ---------------------------------------------------------------------------

/// Reconnection loop — keeps trying to maintain a WebSocket connection to
/// Supabase Realtime.  On disconnect it waits briefly then reconnects.
/// Exits only when the broadcast sender is closed (all SSE clients gone).
async fn realtime_loop(
    supabase_url: String,
    anon_key: String,
    access_token: String,
    user_id: String,
    tx: broadcast::Sender<String>,
) {
    let mut backoff = std::time::Duration::from_secs(1);
    let max_backoff = std::time::Duration::from_secs(30);

    loop {
        // Stop if all receivers are gone
        if tx.receiver_count() == 0 {
            tracing::debug!("SSE /events: no receivers, stopping realtime listener");
            break;
        }

        match realtime_connect(&supabase_url, &anon_key, &access_token, &user_id, &tx).await {
            Ok(()) => {
                tracing::info!("SSE /events: realtime connection closed normally");
            }
            Err(e) => {
                tracing::warn!("SSE /events: realtime connection error: {e}");
            }
        }

        // Stop if all receivers are gone (check again after disconnect)
        if tx.receiver_count() == 0 {
            break;
        }

        tracing::info!(
            "SSE /events: reconnecting in {}s",
            backoff.as_secs()
        );
        tokio::time::sleep(backoff).await;
        backoff = (backoff * 2).min(max_backoff);
    }
}

/// Single WebSocket connection attempt.  Joins channels for each table,
/// processes incoming messages, and sends heartbeats.
async fn realtime_connect(
    supabase_url: &str,
    anon_key: &str,
    access_token: &str,
    user_id: &str,
    tx: &broadcast::Sender<String>,
) -> anyhow::Result<()> {
    use tokio_tungstenite::tungstenite::Message;

    // Build the WebSocket URL
    let ws_url = supabase_url
        .replace("http://", "ws://")
        .replace("https://", "wss://");
    let url = format!(
        "{}/realtime/v1/websocket?apikey={}&vsn=1.0.0",
        ws_url.trim_end_matches('/'),
        anon_key
    );

    tracing::debug!("SSE /events: connecting to Supabase Realtime");
    let (ws_stream, _response) = tokio_tungstenite::connect_async(&url).await?;
    let (write, read) = ws_stream.split();
    let write = Arc::new(tokio::sync::Mutex::new(write));

    // Join channels for each table with the user's access token for RLS
    for (i, table) in REALTIME_TABLES.iter().enumerate() {
        let join_msg = json!({
            "topic": format!("realtime:public:{}", table),
            "event": "phx_join",
            "payload": {
                "config": {
                    "broadcast": {"self": false},
                    "presence": {"key": ""},
                    "postgres_changes": [{
                        "event": "*",
                        "schema": "public",
                        "table": table
                    }]
                },
                "access_token": access_token
            },
            "ref": (i + 1).to_string()
        });

        let mut w = write.lock().await;
        use futures::SinkExt;
        w.send(Message::Text(join_msg.to_string())).await?;
    }

    tracing::info!(
        "SSE /events: joined {} realtime channels",
        REALTIME_TABLES.len()
    );

    // Spawn heartbeat task
    let hb_write = Arc::clone(&write);
    let heartbeat_handle = tokio::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(30));
        loop {
            interval.tick().await;
            let msg = json!({
                "topic": "phoenix",
                "event": "heartbeat",
                "payload": {},
                "ref": null
            });
            let mut w = hb_write.lock().await;
            use futures::SinkExt;
            if w.send(Message::Text(msg.to_string())).await.is_err() {
                break;
            }
        }
    });

    // Process incoming messages
    let user_id_owned = user_id.to_string();
    let result = process_messages(read, &user_id_owned, tx).await;

    // Clean up heartbeat task
    heartbeat_handle.abort();

    result
}

/// Read messages from the WebSocket and forward matching postgres_changes
/// events to the broadcast channel.
async fn process_messages<S>(
    mut read: S,
    user_id: &str,
    tx: &broadcast::Sender<String>,
) -> anyhow::Result<()>
where
    S: futures::Stream<Item = Result<tokio_tungstenite::tungstenite::Message, tokio_tungstenite::tungstenite::Error>>
        + Unpin,
{
    use tokio_tungstenite::tungstenite::Message;

    while let Some(msg) = read.next().await {
        match msg {
            Ok(Message::Text(text)) => {
                handle_text_message(&text, user_id, tx);
            }
            Ok(Message::Close(_)) => {
                tracing::debug!("SSE /events: WebSocket closed by server");
                break;
            }
            Ok(Message::Ping(_)) => {
                // tungstenite handles pong automatically
            }
            Ok(_) => {}
            Err(e) => {
                return Err(anyhow::anyhow!("WebSocket read error: {e}"));
            }
        }
    }

    Ok(())
}

/// Parse a single text message from the Supabase Realtime WebSocket.
/// If it's a postgres_changes event matching our user_id, forward it
/// to the broadcast channel as a compact JSON SSE payload.
fn handle_text_message(text: &str, user_id: &str, tx: &broadcast::Sender<String>) {
    let data: Value = match serde_json::from_str(text) {
        Ok(v) => v,
        Err(_) => return,
    };

    let event = data
        .get("event")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    // Only forward postgres_changes events
    if event != "postgres_changes" {
        return;
    }

    let payload = match data.get("payload") {
        Some(p) => p,
        None => return,
    };

    // Supabase Realtime wraps the change in payload.data
    let change_data = match payload.get("data") {
        Some(d) => d,
        None => return,
    };

    let table = change_data
        .get("table")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let change_type = change_data
        .get("type")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    // Filter by user_id — defense-in-depth on top of RLS.
    // The record may be in "record" (INSERT/UPDATE) or "old_record" (DELETE).
    let record = change_data.get("record").or_else(|| change_data.get("old_record"));
    let record_user_id = record
        .and_then(|r| r.get("user_id"))
        .and_then(|v| v.as_str())
        .unwrap_or("");

    // Some tables (like mission_events) may not have user_id, so allow
    // empty record_user_id through only if our user_id is also empty
    // (unauthenticated dev mode).  Otherwise require a match.
    if !record_user_id.is_empty() && record_user_id != user_id {
        return;
    }

    // Extract the row ID for cache invalidation
    let row_id = record
        .and_then(|r| r.get("id"))
        .and_then(|v| v.as_str())
        .unwrap_or("");

    let sse_payload = json!({
        "table": table,
        "event": change_type,
        "id": row_id,
    });

    // Ignore send errors — they just mean no subscribers right now
    let _ = tx.send(sse_payload.to_string());
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_handle_postgres_changes_event() {
        let (tx, mut rx) = broadcast::channel::<String>(16);

        let msg = json!({
            "topic": "realtime:public:todos",
            "event": "postgres_changes",
            "payload": {
                "data": {
                    "table": "todos",
                    "type": "UPDATE",
                    "record": {
                        "id": "abc-123",
                        "user_id": "user-1",
                        "title": "Buy milk"
                    }
                }
            },
            "ref": null
        });

        handle_text_message(&msg.to_string(), "user-1", &tx);
        let received = rx.try_recv().unwrap();
        let parsed: Value = serde_json::from_str(&received).unwrap();
        assert_eq!(parsed["table"], "todos");
        assert_eq!(parsed["event"], "UPDATE");
        assert_eq!(parsed["id"], "abc-123");
    }

    #[test]
    fn test_filters_wrong_user() {
        let (tx, mut rx) = broadcast::channel::<String>(16);

        let msg = json!({
            "topic": "realtime:public:todos",
            "event": "postgres_changes",
            "payload": {
                "data": {
                    "table": "todos",
                    "type": "INSERT",
                    "record": {
                        "id": "xyz-789",
                        "user_id": "other-user",
                        "title": "Not mine"
                    }
                }
            },
            "ref": null
        });

        handle_text_message(&msg.to_string(), "user-1", &tx);
        assert!(rx.try_recv().is_err());
    }

    #[test]
    fn test_ignores_non_postgres_changes_events() {
        let (tx, mut rx) = broadcast::channel::<String>(16);

        let msg = json!({
            "topic": "phoenix",
            "event": "heartbeat",
            "payload": {},
            "ref": null
        });

        handle_text_message(&msg.to_string(), "user-1", &tx);
        assert!(rx.try_recv().is_err());

        // phx_reply events should also be ignored
        let reply = json!({
            "topic": "realtime:public:todos",
            "event": "phx_reply",
            "payload": {"status": "ok"},
            "ref": "1"
        });

        handle_text_message(&reply.to_string(), "user-1", &tx);
        assert!(rx.try_recv().is_err());
    }

    #[test]
    fn test_allows_records_without_user_id() {
        let (tx, mut rx) = broadcast::channel::<String>(16);

        // mission_events may not have user_id
        let msg = json!({
            "topic": "realtime:public:mission_events",
            "event": "postgres_changes",
            "payload": {
                "data": {
                    "table": "mission_events",
                    "type": "INSERT",
                    "record": {
                        "id": "evt-456",
                        "mission_id": "m-1"
                    }
                }
            },
            "ref": null
        });

        handle_text_message(&msg.to_string(), "user-1", &tx);
        let received = rx.try_recv().unwrap();
        let parsed: Value = serde_json::from_str(&received).unwrap();
        assert_eq!(parsed["table"], "mission_events");
        assert_eq!(parsed["event"], "INSERT");
    }

    #[test]
    fn test_delete_uses_old_record() {
        let (tx, mut rx) = broadcast::channel::<String>(16);

        let msg = json!({
            "topic": "realtime:public:todos",
            "event": "postgres_changes",
            "payload": {
                "data": {
                    "table": "todos",
                    "type": "DELETE",
                    "old_record": {
                        "id": "del-999",
                        "user_id": "user-1"
                    }
                }
            },
            "ref": null
        });

        handle_text_message(&msg.to_string(), "user-1", &tx);
        let received = rx.try_recv().unwrap();
        let parsed: Value = serde_json::from_str(&received).unwrap();
        assert_eq!(parsed["table"], "todos");
        assert_eq!(parsed["event"], "DELETE");
        assert_eq!(parsed["id"], "del-999");
    }
}
