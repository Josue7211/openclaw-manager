use axum::{extract::State, routing::get, Json, Router};
use reqwest::Method;
use serde_json::Value;

use crate::error::AppError;
use crate::server::{AppState, RequireAuth};

use super::gateway::gateway_forward;

// ── Router ──────────────────────────────────────────────────────────────────

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/openclaw/usage", get(get_usage))
        .route("/openclaw/models", get(get_models))
}

// ── GET /openclaw/usage ─────────────────────────────────────────────────────

async fn get_usage(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let result = gateway_forward(&state, Method::GET, "/usage", None).await?;
    Ok(Json(result))
}

// ── GET /openclaw/models ────────────────────────────────────────────────────

async fn get_models(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let result = gateway_forward(&state, Method::GET, "/models", None).await?;
    Ok(Json(result))
}

// ── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::super::gateway::validate_gateway_path;

    #[test]
    fn validate_usage_path() {
        assert!(validate_gateway_path("/usage").is_ok());
    }

    #[test]
    fn validate_models_path() {
        assert!(validate_gateway_path("/models").is_ok());
    }

    #[test]
    fn reject_usage_with_injection() {
        assert!(validate_gateway_path("/usage?inject=true").is_err());
    }
}
