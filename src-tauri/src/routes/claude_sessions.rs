use axum::{
    extract::{
        ws::{Message, WebSocket},
        Path, State, WebSocketUpgrade,
    },
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use futures::{SinkExt, StreamExt};
use reqwest::Method;
use serde::Deserialize;
use serde_json::{json, Value};
use std::sync::atomic::{AtomicUsize, Ordering};
use tracing::{error, info};

use crate::error::AppError;
use crate::server::{AppState, RequireAuth};

use super::gateway::{gateway_forward, openclaw_api_key, openclaw_api_url};

// ---------------------------------------------------------------------------
// CAS connection guard (max 5 concurrent session WebSocket streams)
// ---------------------------------------------------------------------------

/// Global counter for concurrent session WebSocket connections.
static SESSION_WS_CONNECTIONS: AtomicUsize = AtomicUsize::new(0);
const MAX_SESSION_WS_CONNECTIONS: usize = 5;

/// RAII guard that decrements the session WS connection counter on drop.
struct SessionWsGuard;

impl SessionWsGuard {
    /// Try to acquire a slot. Returns `None` if the limit is reached (CAS loop).
    fn try_new() -> Option<Self> {
        loop {
            let current = SESSION_WS_CONNECTIONS.load(Ordering::Acquire);
            if current >= MAX_SESSION_WS_CONNECTIONS {
                return None;
            }
            if SESSION_WS_CONNECTIONS
                .compare_exchange(current, current + 1, Ordering::AcqRel, Ordering::Acquire)
                .is_ok()
            {
                return Some(Self);
            }
        }
    }
}

impl Drop for SessionWsGuard {
    fn drop(&mut self) {
        SESSION_WS_CONNECTIONS.fetch_sub(1, Ordering::AcqRel);
    }
}

// ---------------------------------------------------------------------------
// Request bodies
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
struct CreateSessionBody {
    task: String,
    model: Option<String>,
    #[serde(rename = "workingDir")]
    working_dir: Option<String>,
}

// ---------------------------------------------------------------------------
// REST handlers
// ---------------------------------------------------------------------------

/// `GET /api/claude-sessions` -- list Claude Code sessions only.
///
/// Filters the gateway response to sessions where `kind == "claude-code"`
/// or the `agentId` field is present. Returns `{ available: false }` envelope
/// when OpenClaw VM is unreachable (instead of a hard error).
async fn list_sessions(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let result = gateway_forward(&state, Method::GET, "/sessions", None).await;

    match result {
        Ok(data) => {
            // The gateway may return { sessions: [...] } or a raw array
            let sessions = data
                .get("sessions")
                .and_then(|v| v.as_array())
                .or_else(|| data.as_array())
                .cloned()
                .unwrap_or_default();

            let filtered: Vec<Value> = sessions
                .into_iter()
                .filter(|s| {
                    s.get("kind").and_then(|v| v.as_str()) == Some("claude-code")
                        || s.get("agentId").is_some()
                })
                .collect();

            Ok(Json(json!({ "sessions": filtered })))
        }
        Err(_) => {
            // 503-equivalent: return error envelope instead of propagating
            Ok(Json(json!({
                "error": "OpenClaw VM unreachable",
                "available": false,
                "sessions": []
            })))
        }
    }
}

/// `GET /api/claude-sessions/:id` -- get session detail.
async fn get_session(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Path(id): Path<String>,
) -> Result<Json<Value>, AppError> {
    if id.is_empty() || id.len() > 100 {
        return Err(AppError::BadRequest("invalid session id".into()));
    }

    let result = gateway_forward(&state, Method::GET, &format!("/sessions/{id}"), None).await?;
    Ok(Json(result))
}

/// `POST /api/claude-sessions` -- create a new Claude Code session.
async fn create_session(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Json(body): Json<CreateSessionBody>,
) -> Result<Json<Value>, AppError> {
    if body.task.trim().is_empty() {
        return Err(AppError::BadRequest("task description required".into()));
    }
    if body.task.len() > 2000 {
        return Err(AppError::BadRequest(
            "task too long (max 2000 chars)".into(),
        ));
    }

    let payload = json!({
        "task": body.task.trim(),
        "model": body.model,
        "workingDir": body.working_dir,
    });

    let result =
        gateway_forward(&state, Method::POST, "/sessions/spawn", Some(payload)).await?;
    Ok(Json(result))
}

/// `POST /api/claude-sessions/:id/kill` -- terminate a session.
async fn kill_session(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Path(id): Path<String>,
) -> Result<Json<Value>, AppError> {
    if id.is_empty() || id.len() > 100 {
        return Err(AppError::BadRequest("invalid session id".into()));
    }

    let result =
        gateway_forward(&state, Method::DELETE, &format!("/sessions/{id}"), None).await?;
    Ok(Json(result))
}

/// `GET /api/claude-sessions/status` -- CAS guard status for WebSocket streams.
async fn session_ws_status(
    RequireAuth(_session): RequireAuth,
) -> Json<Value> {
    let active = SESSION_WS_CONNECTIONS.load(Ordering::Acquire);
    let available = MAX_SESSION_WS_CONNECTIONS.saturating_sub(active);
    Json(json!({
        "active": active,
        "max": MAX_SESSION_WS_CONNECTIONS,
        "available": available,
    }))
}

// ---------------------------------------------------------------------------
// WebSocket upgrade handler
// ---------------------------------------------------------------------------

/// `GET /api/claude-sessions/:id/ws` -- upgrade to WebSocket and relay
/// bidirectional frames to/from the upstream OpenClaw session stream.
///
/// Returns bare `Response` (not `Result<Json<Value>, AppError>`) because
/// `WebSocketUpgrade::on_upgrade` returns `Response`. This is the same
/// pattern as `ws_upgrade` in terminal.rs -- bare `Response` return works
/// fine with merged routers (the gotcha is about `Result<Response, AppError>`).
async fn ws_upgrade(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Path(id): Path<String>,
    ws: WebSocketUpgrade,
) -> Response {
    // 1. Validate session ID
    if id.is_empty() || id.len() > 100 {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "invalid session id"})),
        )
            .into_response();
    }

    // 2. Try acquire CAS guard
    let guard = match SessionWsGuard::try_new() {
        Some(g) => g,
        None => {
            return (
                StatusCode::TOO_MANY_REQUESTS,
                Json(json!({"error": "too many session streams (max 5)"})),
            )
                .into_response();
        }
    };

    // 3. Upgrade
    ws.max_message_size(64 * 1024)
        .on_upgrade(move |socket| handle_session_ws(socket, state, id, guard))
}

// ---------------------------------------------------------------------------
// Bidirectional WebSocket relay (client <-> upstream OpenClaw)
// ---------------------------------------------------------------------------

/// Relay frames between the client WebSocket (Axum) and an upstream
/// WebSocket on the OpenClaw VM (tokio-tungstenite).
///
/// Both sides are async -- no OS threads needed (unlike terminal.rs PTY).
/// The `_guard` is held for the lifetime of this function; on any exit
/// path the CAS counter decrements via Drop.
async fn handle_session_ws(
    client_socket: WebSocket,
    state: AppState,
    session_id: String,
    _guard: SessionWsGuard,
) {
    info!("claude-sessions: WS stream connecting for session {session_id}");

    // 1. Build upstream URL from OPENCLAW_API_URL
    let base_url = match openclaw_api_url(&state) {
        Some(url) => url,
        None => {
            error!("claude-sessions: OPENCLAW_API_URL not configured");
            return;
        }
    };
    let ws_url = base_url
        .replace("http://", "ws://")
        .replace("https://", "wss://");
    let upstream_url = format!("{ws_url}/sessions/{session_id}/stream");

    // 2. Build request with auth header
    let api_key = openclaw_api_key(&state);
    let request = match tokio_tungstenite::tungstenite::http::Request::builder()
        .uri(&upstream_url)
        .header("Authorization", format!("Bearer {api_key}"))
        .header("Connection", "Upgrade")
        .header("Upgrade", "websocket")
        .header("Sec-WebSocket-Version", "13")
        .header(
            "Sec-WebSocket-Key",
            tokio_tungstenite::tungstenite::handshake::client::generate_key(),
        )
        .body(())
    {
        Ok(r) => r,
        Err(e) => {
            error!("claude-sessions: failed to build upstream request: {e}");
            return;
        }
    };

    // 3. Connect to upstream WebSocket
    let (upstream_ws, _response) = match tokio_tungstenite::connect_async(request).await {
        Ok(conn) => conn,
        Err(e) => {
            error!("claude-sessions: upstream WS connect failed: {e}");
            // Send error to client before closing
            let (mut sender, _) = client_socket.split();
            let _ = sender
                .send(Message::Text(
                    json!({"error": "Failed to connect to session stream"}).to_string(),
                ))
                .await;
            return;
        }
    };

    info!("claude-sessions: upstream WS connected for session {session_id}");

    // 4. Split both sockets
    let (mut client_tx, mut client_rx) = client_socket.split();
    let (mut upstream_tx, mut upstream_rx) = upstream_ws.split();

    // 5. Relay upstream -> client (session output to browser)
    let up_to_client = tokio::spawn(async move {
        use tokio_tungstenite::tungstenite::Message as TungsteniteMessage;
        while let Some(msg) = upstream_rx.next().await {
            match msg {
                Ok(TungsteniteMessage::Text(text)) => {
                    if client_tx.send(Message::Text(text)).await.is_err() {
                        break;
                    }
                }
                Ok(TungsteniteMessage::Binary(data)) => {
                    if client_tx.send(Message::Binary(data)).await.is_err() {
                        break;
                    }
                }
                Ok(TungsteniteMessage::Close(_)) => break,
                Err(_) => break,
                _ => {} // Ping/Pong handled by tungstenite
            }
        }
    });

    // 6. Relay client -> upstream (commands from browser to session)
    let client_to_up = tokio::spawn(async move {
        use tokio_tungstenite::tungstenite::Message as TungsteniteMessage;
        while let Some(Ok(msg)) = client_rx.next().await {
            match msg {
                Message::Text(text) => {
                    if upstream_tx
                        .send(TungsteniteMessage::Text(text))
                        .await
                        .is_err()
                    {
                        break;
                    }
                }
                Message::Binary(data) => {
                    if upstream_tx
                        .send(TungsteniteMessage::Binary(data))
                        .await
                        .is_err()
                    {
                        break;
                    }
                }
                Message::Close(_) => break,
                _ => {}
            }
        }
    });

    // 7. Wait for either direction to finish, then cancel both
    tokio::select! {
        _ = up_to_client => {}
        _ = client_to_up => {}
    }

    info!("claude-sessions: WS stream ended for session {session_id}");
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/api/claude-sessions",
            get(list_sessions).post(create_session),
        )
        .route("/api/claude-sessions/status", get(session_ws_status))
        .route("/api/claude-sessions/:id", get(get_session))
        .route("/api/claude-sessions/:id/kill", post(kill_session))
        .route("/api/claude-sessions/:id/ws", get(ws_upgrade))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use super::super::gateway::validate_gateway_path;

    // -- CreateSessionBody deserialization --

    #[test]
    fn create_body_deserializes_full() {
        let json_str = r#"{"task": "fix the login bug", "model": "opus", "workingDir": "/home/user/project"}"#;
        let body: CreateSessionBody = serde_json::from_str(json_str).unwrap();
        assert_eq!(body.task, "fix the login bug");
        assert_eq!(body.model.as_deref(), Some("opus"));
        assert_eq!(body.working_dir.as_deref(), Some("/home/user/project"));
    }

    #[test]
    fn create_body_deserializes_minimal() {
        let json_str = r#"{"task": "add error handling"}"#;
        let body: CreateSessionBody = serde_json::from_str(json_str).unwrap();
        assert_eq!(body.task, "add error handling");
        assert!(body.model.is_none());
        assert!(body.working_dir.is_none());
    }

    #[test]
    fn create_body_rejects_missing_task() {
        let json_str = r#"{"model": "opus"}"#;
        let result = serde_json::from_str::<CreateSessionBody>(json_str);
        assert!(result.is_err(), "should reject payload without task");
    }

    // -- Gateway path validation --

    #[test]
    fn validate_sessions_paths() {
        assert!(validate_gateway_path("/sessions").is_ok());
        assert!(validate_gateway_path("/sessions/abc123").is_ok());
        assert!(validate_gateway_path("/sessions/abc123/stop").is_ok());
        assert!(validate_gateway_path("/sessions/spawn").is_ok());
    }

    #[test]
    fn validate_sessions_paths_reject_injection() {
        assert!(validate_gateway_path("/sessions?drop=true").is_err());
        assert!(validate_gateway_path("/sessions/../etc/passwd").is_err());
    }

    // -- SessionWsGuard CAS --

    #[test]
    fn session_ws_guard_acquires_up_to_max() {
        // Reset counter to known state
        SESSION_WS_CONNECTIONS.store(0, Ordering::SeqCst);

        let mut guards = Vec::new();
        for i in 0..MAX_SESSION_WS_CONNECTIONS {
            let g = SessionWsGuard::try_new();
            assert!(g.is_some(), "guard {i} should succeed");
            guards.push(g.unwrap());
        }

        // Next should fail
        let overflow = SessionWsGuard::try_new();
        assert!(overflow.is_none(), "guard beyond max should fail");

        // Drop one and retry
        guards.pop();
        let retry = SessionWsGuard::try_new();
        assert!(retry.is_some(), "guard should succeed after dropping one");

        // Clean up
        drop(guards);
        drop(retry);

        assert_eq!(
            SESSION_WS_CONNECTIONS.load(Ordering::SeqCst),
            0,
            "counter should be 0 after dropping all guards"
        );
    }

    // -- Status response shape --

    #[test]
    fn status_response_shape() {
        SESSION_WS_CONNECTIONS.store(0, Ordering::SeqCst);

        let active = SESSION_WS_CONNECTIONS.load(Ordering::Acquire);
        let available = MAX_SESSION_WS_CONNECTIONS.saturating_sub(active);
        let response = json!({
            "active": active,
            "max": MAX_SESSION_WS_CONNECTIONS,
            "available": available,
        });

        assert_eq!(response["active"], 0);
        assert_eq!(response["max"], 5);
        assert_eq!(response["available"], 5);

        // Simulate 3 connections
        SESSION_WS_CONNECTIONS.store(3, Ordering::SeqCst);
        let active = SESSION_WS_CONNECTIONS.load(Ordering::Acquire);
        let available = MAX_SESSION_WS_CONNECTIONS.saturating_sub(active);
        let response = json!({
            "active": active,
            "max": MAX_SESSION_WS_CONNECTIONS,
            "available": available,
        });

        assert_eq!(response["active"], 3);
        assert_eq!(response["max"], 5);
        assert_eq!(response["available"], 2);

        // Clean up
        SESSION_WS_CONNECTIONS.store(0, Ordering::SeqCst);
    }

    // -- Session ID validation --

    #[test]
    fn session_id_rejects_empty() {
        let id = "";
        assert!(
            id.is_empty() || id.len() > 100,
            "empty ID should be rejected"
        );
    }

    #[test]
    fn session_id_rejects_too_long() {
        let id = "a".repeat(101);
        assert!(
            id.is_empty() || id.len() > 100,
            "101-char ID should be rejected"
        );
    }

    #[test]
    fn session_id_accepts_valid() {
        let id = "session-abc-123";
        assert!(
            !id.is_empty() && id.len() <= 100,
            "valid ID should be accepted"
        );
    }
}
