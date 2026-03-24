use axum::{extract::{Path, State}, routing::{get, post}, Json, Router};
use serde_json::{json, Value};

use crate::error::AppError;
use crate::server::{AppState, RequireAuth};
use super::gateway::sanitize_error_body;

// ── List pending approvals ─────────────────────────────────────────────────

/// `GET /api/approvals`
///
/// Lists pending execution approval requests via the gateway WS connection.
/// Returns `{ approvals: [...] }` on success.
async fn list_approvals(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let gw = state.gateway_ws.as_ref().ok_or_else(|| {
        AppError::BadRequest(
            "OpenClaw Gateway not configured. Set OPENCLAW_WS in Settings > Connections.".into(),
        )
    })?;

    let payload = gw
        .request("exec.approvals.list", json!({}))
        .await
        .map_err(|e| {
            tracing::error!("[approvals] exec.approvals.list failed: {e}");
            AppError::BadRequest(format!("Gateway error: {}", sanitize_error_body(&e)))
        })?;

    // Normalize: gateway may return { approvals: [...] } or a raw array
    let approvals = payload
        .get("approvals")
        .cloned()
        .or_else(|| {
            if payload.is_array() {
                Some(payload.clone())
            } else {
                None
            }
        })
        .unwrap_or_else(|| json!([]));

    Ok(Json(json!({ "approvals": approvals })))
}

// ── Approve a request ──────────────────────────────────────────────────────

/// `POST /api/approvals/:id/approve`
///
/// Approves an execution request by forwarding the decision through the
/// gateway WS connection.
async fn approve_request(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Path(id): Path<String>,
) -> Result<Json<Value>, AppError> {
    let gw = state.gateway_ws.as_ref().ok_or_else(|| {
        AppError::BadRequest("OpenClaw Gateway not configured.".into())
    })?;

    let payload = gw
        .request("exec.approve", json!({"approval_id": id}))
        .await
        .map_err(|e| {
            tracing::error!("[approvals] exec.approve({id}) failed: {e}");
            AppError::BadRequest(format!("Gateway error: {}", sanitize_error_body(&e)))
        })?;

    Ok(Json(json!({"ok": true, "data": payload})))
}

// ── Reject a request ───────────────────────────────────────────────────────

/// `POST /api/approvals/:id/reject`
///
/// Rejects an execution request, optionally with a reason.
async fn reject_request(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Path(id): Path<String>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, AppError> {
    let gw = state.gateway_ws.as_ref().ok_or_else(|| {
        AppError::BadRequest("OpenClaw Gateway not configured.".into())
    })?;

    let reason = body
        .get("reason")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let payload = gw
        .request("exec.reject", json!({"approval_id": id, "reason": reason}))
        .await
        .map_err(|e| {
            tracing::error!("[approvals] exec.reject({id}) failed: {e}");
            AppError::BadRequest(format!("Gateway error: {}", sanitize_error_body(&e)))
        })?;

    Ok(Json(json!({"ok": true, "data": payload})))
}

// ── Router ─────────────────────────────────────────────────────────────────

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/approvals", get(list_approvals))
        .route("/approvals/:id/approve", post(approve_request))
        .route("/approvals/:id/reject", post(reject_request))
}
