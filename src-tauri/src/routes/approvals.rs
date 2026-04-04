use axum::{extract::{Path, State}, routing::{get, post}, Json, Router};
use reqwest::Method;
use serde_json::{json, Value};

use crate::error::AppError;
use crate::server::{AppState, RequireAuth};
use super::gateway::gateway_forward;

// ── List pending approvals ─────────────────────────────────────────────────

/// `GET /api/approvals`
///
/// Lists pending execution approval requests via the OpenClaw HTTP API.
/// Returns `{ approvals: [...] }` on success.
async fn list_approvals(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let payload = gateway_forward(&state, Method::GET, "/approvals", None)
        .await
        .map_err(|e| {
            tracing::error!("[approvals] list failed: {e:?}");
            match e {
                AppError::BadRequest(_) => e,
                _ => AppError::BadRequest("Gateway error: failed to fetch approvals".into()),
            }
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
/// Approves an execution request by forwarding to the OpenClaw HTTP API.
async fn approve_request(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Path(id): Path<String>,
) -> Result<Json<Value>, AppError> {
    let payload = gateway_forward(
        &state,
        Method::POST,
        &format!("/approvals/{id}/approve"),
        Some(json!({"approval_id": id})),
    )
    .await
    .map_err(|e| {
        tracing::error!("[approvals] approve({id}) failed: {e:?}");
        match e {
            AppError::BadRequest(_) => e,
            _ => AppError::BadRequest("Gateway error: failed to approve request".into()),
        }
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
    let reason = body
        .get("reason")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let payload = gateway_forward(
        &state,
        Method::POST,
        &format!("/approvals/{id}/reject"),
        Some(json!({"approval_id": id, "reason": reason})),
    )
    .await
    .map_err(|e| {
        tracing::error!("[approvals] reject({id}) failed: {e:?}");
        match e {
            AppError::BadRequest(_) => e,
            _ => AppError::BadRequest("Gateway error: failed to reject request".into()),
        }
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
