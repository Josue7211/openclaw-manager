use axum::{
    extract::State,
    routing::{delete, patch, post},
    Json, Router,
};
use reqwest::Method;
use serde::Deserialize;
use serde_json::{json, Value};

use crate::error::AppError;
use crate::server::{AppState, RequireAuth};

use super::gateway::gateway_forward;

// -- Router ------------------------------------------------------------------

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/crons", post(create_cron))
        .route("/crons/update", patch(update_cron))
        .route("/crons/delete", delete(delete_cron))
}

// -- POST /crons -------------------------------------------------------------

#[derive(Debug, Deserialize)]
struct CreateCronBody {
    name: String,
    description: Option<String>,
    schedule: Value, // { kind, everyMs?, expr? }
}

async fn create_cron(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Json(body): Json<CreateCronBody>,
) -> Result<Json<Value>, AppError> {
    if body.name.trim().is_empty() {
        return Err(AppError::BadRequest("name required".into()));
    }

    let payload = json!({
        "name": body.name.trim(),
        "description": body.description,
        "schedule": body.schedule,
    });

    let result = gateway_forward(&state, Method::POST, "/crons", Some(payload)).await?;
    Ok(Json(result))
}

// -- PATCH /crons/update -----------------------------------------------------

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

    let result =
        gateway_forward(&state, Method::PUT, &format!("/crons/{id}"), Some(body)).await?;
    Ok(Json(result))
}

// -- DELETE /crons/delete ----------------------------------------------------

#[derive(Debug, Deserialize)]
struct DeleteCronBody {
    id: String,
}

async fn delete_cron(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Json(body): Json<DeleteCronBody>,
) -> Result<Json<Value>, AppError> {
    if body.id.is_empty() || body.id.len() > 100 {
        return Err(AppError::BadRequest("invalid cron id".into()));
    }

    let result =
        gateway_forward(&state, Method::DELETE, &format!("/crons/{}", body.id), None).await?;
    Ok(Json(result))
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
