use axum::{
    extract::State,
    routing::{delete, get, patch, post},
    Json, Router,
};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::error::AppError;
use crate::server::{AppState, RequireAuth};

use super::gateway::sanitize_error_body;

// -- Router ------------------------------------------------------------------

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/crons", get(list_crons).post(create_cron))
        .route("/crons/update", patch(update_cron))
        .route("/crons/delete", delete(delete_cron))
}

// -- GET /crons --------------------------------------------------------------

/// `GET /api/crons`
///
/// Lists all cron jobs via gateway WS RPC `cron.list`.
/// Response: `{ "jobs": [...] }`
async fn list_crons(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let gw = state.gateway_ws.as_ref().ok_or_else(|| {
        AppError::BadRequest(
            "OpenClaw Gateway not configured. Set OPENCLAW_WS in Settings > Connections.".into(),
        )
    })?;

    let payload = gw
        .request("cron.list", json!({}))
        .await
        .map_err(|e| {
            tracing::error!("[gateway] cron.list failed: {e}");
            AppError::BadRequest(format!("Gateway error: {}", sanitize_error_body(&e)))
        })?;

    // Gateway returns the list directly; wrap in { jobs: [...] } for frontend compatibility
    let jobs = if payload.is_array() {
        payload
    } else {
        payload
            .get("jobs")
            .cloned()
            .or_else(|| payload.get("data").cloned())
            .unwrap_or_else(|| json!([]))
    };

    Ok(Json(json!({ "jobs": jobs })))
}

// -- POST /crons -------------------------------------------------------------

#[derive(Debug, Deserialize)]
struct CreateCronBody {
    name: String,
    description: Option<String>,
    schedule: Value, // { kind, everyMs?, expr? }
}

/// `POST /api/crons`
///
/// Creates a cron job via gateway WS RPC `cron.add`.
async fn create_cron(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Json(body): Json<CreateCronBody>,
) -> Result<Json<Value>, AppError> {
    if body.name.trim().is_empty() {
        return Err(AppError::BadRequest("name required".into()));
    }

    let gw = state.gateway_ws.as_ref().ok_or_else(|| {
        AppError::BadRequest(
            "OpenClaw Gateway not configured. Set OPENCLAW_WS in Settings > Connections.".into(),
        )
    })?;

    let params = json!({
        "name": body.name.trim(),
        "description": body.description,
        "schedule": body.schedule,
    });

    let payload = gw
        .request("cron.add", params)
        .await
        .map_err(|e| {
            tracing::error!("[gateway] cron.add failed: {e}");
            AppError::BadRequest(format!("Gateway error: {}", sanitize_error_body(&e)))
        })?;

    Ok(Json(json!({ "ok": true, "job": payload })))
}

// -- PATCH /crons/update -----------------------------------------------------

/// `PATCH /api/crons/update`
///
/// Updates a cron job via gateway WS RPC `cron.update`.
async fn update_cron(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Json(body): Json<Value>,
) -> Result<Json<Value>, AppError> {
    let id = body
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| AppError::BadRequest("id required".into()))?;

    if id.is_empty() || id.len() > 100 {
        return Err(AppError::BadRequest("invalid cron id".into()));
    }

    let gw = state.gateway_ws.as_ref().ok_or_else(|| {
        AppError::BadRequest(
            "OpenClaw Gateway not configured. Set OPENCLAW_WS in Settings > Connections.".into(),
        )
    })?;

    let payload = gw
        .request("cron.update", body)
        .await
        .map_err(|e| {
            tracing::error!("[gateway] cron.update failed: {e}");
            AppError::BadRequest(format!("Gateway error: {}", sanitize_error_body(&e)))
        })?;

    Ok(Json(json!({ "ok": true, "job": payload })))
}

// -- DELETE /crons/delete ----------------------------------------------------

#[derive(Debug, Deserialize)]
struct DeleteCronBody {
    id: String,
}

/// `DELETE /api/crons/delete`
///
/// Removes a cron job via gateway WS RPC `cron.remove`.
async fn delete_cron(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Json(body): Json<DeleteCronBody>,
) -> Result<Json<Value>, AppError> {
    if body.id.is_empty() || body.id.len() > 100 {
        return Err(AppError::BadRequest("invalid cron id".into()));
    }

    let gw = state.gateway_ws.as_ref().ok_or_else(|| {
        AppError::BadRequest(
            "OpenClaw Gateway not configured. Set OPENCLAW_WS in Settings > Connections.".into(),
        )
    })?;

    let payload = gw
        .request("cron.remove", json!({ "id": body.id }))
        .await
        .map_err(|e| {
            tracing::error!("[gateway] cron.remove failed: {e}");
            AppError::BadRequest(format!("Gateway error: {}", sanitize_error_body(&e)))
        })?;

    Ok(Json(json!({ "ok": true, "data": payload })))
}

// -- Tests -------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn create_body_deserializes_full() {
        let json = r#"{"name": "backup", "description": "nightly db backup", "schedule": {"kind": "every", "everyMs": 86400000}}"#;
        let body: CreateCronBody = serde_json::from_str(json).unwrap();
        assert_eq!(body.name, "backup");
        assert_eq!(body.description.as_deref(), Some("nightly db backup"));
        assert_eq!(body.schedule["kind"], "every");
        assert_eq!(body.schedule["everyMs"], 86400000);
    }

    #[test]
    fn create_body_deserializes_minimal() {
        let json = r#"{"name": "healthcheck", "schedule": {"kind": "every", "everyMs": 300000}}"#;
        let body: CreateCronBody = serde_json::from_str(json).unwrap();
        assert_eq!(body.name, "healthcheck");
        assert!(body.description.is_none());
    }

    #[test]
    fn create_body_rejects_missing_name() {
        let json = r#"{"schedule": {"kind": "every", "everyMs": 300000}}"#;
        let result = serde_json::from_str::<CreateCronBody>(json);
        assert!(result.is_err(), "should reject payload without name");
    }

    #[test]
    fn delete_body_deserializes() {
        let json = r#"{"id": "cron-abc-123"}"#;
        let body: DeleteCronBody = serde_json::from_str(json).unwrap();
        assert_eq!(body.id, "cron-abc-123");
    }
}
