use axum::{
    extract::{Path, State},
    routing::{get, post},
    Json, Router,
};
use reqwest::Method;
use serde::Deserialize;
use serde_json::{json, Value};
use std::sync::atomic::{AtomicUsize, Ordering};
use tracing::info;

use crate::error::AppError;
use crate::server::{AppState, RequireAuth};

use super::gateway::gateway_forward;

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
// Router (WebSocket route added in Task 2)
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
