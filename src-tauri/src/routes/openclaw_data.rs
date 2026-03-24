use axum::{extract::State, routing::{get, post}, Json, Router};
use reqwest::Method;
use serde_json::Value;

use crate::error::AppError;
use crate::server::{AppState, RequireAuth};

use super::gateway::gateway_forward;

// ── Router ──────────────────────────────────────────────────────────────────

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/openclaw/usage", get(get_usage))
        .route("/openclaw/tools", get(get_tools))
        .route("/openclaw/tools/invoke", post(invoke_tool))
        .route("/openclaw/skills", get(get_skills))
}

// ── GET /openclaw/usage ─────────────────────────────────────────────────────

async fn get_usage(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let result = gateway_forward(&state, Method::GET, "/usage", None).await?;
    Ok(Json(result))
}

// ── GET /openclaw/tools ─────────────────────────────────────────────────────

async fn get_tools(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let result = gateway_forward(&state, Method::GET, "/tools", None).await?;
    Ok(Json(result))
}

// ── POST /openclaw/tools/invoke ────────────────────────────────────────────

async fn invoke_tool(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Json(body): Json<Value>,
) -> Result<Json<Value>, AppError> {
    let result = gateway_forward(&state, Method::POST, "/tools/invoke", Some(body)).await?;
    Ok(Json(result))
}

// ── GET /openclaw/skills ──────────────────────────────────────────────────

async fn get_skills(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let result = gateway_forward(&state, Method::GET, "/skills", None).await?;
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
    fn validate_tools_path() {
        assert!(validate_gateway_path("/tools").is_ok());
    }

    #[test]
    fn validate_tools_invoke_path() {
        assert!(validate_gateway_path("/tools/invoke").is_ok());
    }

    #[test]
    fn validate_skills_path() {
        assert!(validate_gateway_path("/skills").is_ok());
    }

    #[test]
    fn reject_usage_with_injection() {
        assert!(validate_gateway_path("/usage?inject=true").is_err());
    }
}
