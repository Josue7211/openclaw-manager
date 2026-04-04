use axum::extract::{rejection::JsonRejection, State};
use axum::routing::{get, post};
use axum::{Json, Router};
use reqwest::Method;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::error::{success_json, AppError};
use crate::server::{AppState, RequireAuth};
use crate::validation::validate_enum;

use super::agent_shell_support;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/agent-shell/health", get(get_health))
        .route("/agent-shell/sessions/plan", post(plan_session))
        .route("/agent-shell/sessions/dispatch", post(dispatch_session))
        .route("/agent-shell/approvals/plan", post(plan_approval))
        .route("/agent-shell/approvals/dispatch", post(dispatch_approval))
}

async fn get_health(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    agent_shell_support::health(&state).await
}

async fn plan_session(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    payload: Result<Json<SessionPlanBody>, JsonRejection>,
) -> Result<Json<Value>, AppError> {
    let payload = parse_json_payload(payload)?.validate()?;
    let Json(value) =
        agent_shell_support::proxy_json(&state, Method::POST, "/v1/sessions/plan", &payload)
            .await?;
    Ok(success_json(value))
}

async fn dispatch_session(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    payload: Result<Json<SessionDispatchBody>, JsonRejection>,
) -> Result<Json<Value>, AppError> {
    let payload = parse_json_payload(payload)?.validate()?;
    let Json(value) =
        agent_shell_support::proxy_json(&state, Method::POST, "/v1/sessions", &payload).await?;
    Ok(success_json(value))
}

async fn plan_approval(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    payload: Result<Json<ApprovalPlanBody>, JsonRejection>,
) -> Result<Json<Value>, AppError> {
    let payload = parse_json_payload(payload)?.validate()?;
    let Json(value) =
        agent_shell_support::proxy_json(&state, Method::POST, "/v1/approvals/plan", &payload)
            .await?;
    Ok(success_json(value))
}

async fn dispatch_approval(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    payload: Result<Json<ApprovalDispatchBody>, JsonRejection>,
) -> Result<Json<Value>, AppError> {
    let payload = parse_json_payload(payload)?.validate()?;
    let Json(value) =
        agent_shell_support::proxy_json(&state, Method::POST, "/v1/approvals", &payload).await?;
    Ok(success_json(value))
}

fn parse_json_payload<T>(payload: Result<Json<T>, JsonRejection>) -> Result<T, AppError> {
    payload
        .map(|Json(value)| value)
        .map_err(|err| AppError::BadRequest(format!("invalid AgentShell payload: {err}")))
}

fn clean_required_text(value: &str, field: &str, max_len: usize) -> Result<String, AppError> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(AppError::BadRequest(format!("{field} required")));
    }
    if trimmed.len() > max_len {
        return Err(AppError::BadRequest(format!("{field} too long")));
    }
    if trimmed.contains('\n') || trimmed.contains('\r') || trimmed.contains('\0') {
        return Err(AppError::BadRequest(format!("{field} contains invalid characters")));
    }
    Ok(trimmed.to_string())
}

fn clean_optional_text(
    value: Option<String>,
    field: &str,
    max_len: usize,
) -> Result<Option<String>, AppError> {
    match value {
        Some(value) => Ok(Some(clean_required_text(&value, field, max_len)?)),
        None => Ok(None),
    }
}

fn validate_metadata(metadata: Option<Value>, field: &str) -> Result<Option<Value>, AppError> {
    match metadata {
        Some(Value::Object(map)) => Ok(Some(Value::Object(map))),
        Some(_) => Err(AppError::BadRequest(format!("{field} must be an object"))),
        None => Ok(None),
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SessionPlanBody {
    prompt: String,
    agent_id: Option<String>,
    workspace_id: Option<String>,
    cwd: Option<String>,
    model: Option<String>,
    profile: Option<String>,
    approval_policy: Option<String>,
    sandbox_mode: Option<String>,
    include_memory: Option<bool>,
    metadata: Option<Value>,
}

impl SessionPlanBody {
    fn validate(self) -> Result<Self, AppError> {
        Ok(Self {
            prompt: clean_required_text(&self.prompt, "prompt", 8_000)?,
            agent_id: clean_optional_text(self.agent_id, "agentId", 255)?,
            workspace_id: clean_optional_text(self.workspace_id, "workspaceId", 255)?,
            cwd: clean_optional_text(self.cwd, "cwd", 4_096)?,
            model: clean_optional_text(self.model, "model", 255)?,
            profile: clean_optional_text(self.profile, "profile", 255)?,
            approval_policy: clean_optional_text(self.approval_policy, "approvalPolicy", 255)?,
            sandbox_mode: clean_optional_text(self.sandbox_mode, "sandboxMode", 255)?,
            include_memory: self.include_memory,
            metadata: validate_metadata(self.metadata, "metadata")?,
        })
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SessionDispatchBody {
    prompt: String,
    agent_id: Option<String>,
    workspace_id: Option<String>,
    cwd: Option<String>,
    model: Option<String>,
    profile: Option<String>,
    approval_policy: Option<String>,
    sandbox_mode: Option<String>,
    session_name: Option<String>,
    metadata: Option<Value>,
}

impl SessionDispatchBody {
    fn validate(self) -> Result<Self, AppError> {
        Ok(Self {
            prompt: clean_required_text(&self.prompt, "prompt", 8_000)?,
            agent_id: clean_optional_text(self.agent_id, "agentId", 255)?,
            workspace_id: clean_optional_text(self.workspace_id, "workspaceId", 255)?,
            cwd: clean_optional_text(self.cwd, "cwd", 4_096)?,
            model: clean_optional_text(self.model, "model", 255)?,
            profile: clean_optional_text(self.profile, "profile", 255)?,
            approval_policy: clean_optional_text(self.approval_policy, "approvalPolicy", 255)?,
            sandbox_mode: clean_optional_text(self.sandbox_mode, "sandboxMode", 255)?,
            session_name: clean_optional_text(self.session_name, "sessionName", 255)?,
            metadata: validate_metadata(self.metadata, "metadata")?,
        })
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ApprovalPlanBody {
    action: String,
    session_id: Option<String>,
    reason: Option<String>,
    metadata: Option<Value>,
}

impl ApprovalPlanBody {
    fn validate(self) -> Result<Self, AppError> {
        Ok(Self {
            action: clean_required_text(&self.action, "action", 255)?,
            session_id: clean_optional_text(self.session_id, "sessionId", 255)?,
            reason: clean_optional_text(self.reason, "reason", 2_000)?,
            metadata: validate_metadata(self.metadata, "metadata")?,
        })
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ApprovalDispatchBody {
    approval_id: String,
    decision: String,
    reason: Option<String>,
    metadata: Option<Value>,
}

impl ApprovalDispatchBody {
    fn validate(self) -> Result<Self, AppError> {
        let decision = clean_required_text(&self.decision, "decision", 32)?;
        validate_enum(decision.as_str(), &["approve", "reject"])?;
        Ok(Self {
            approval_id: clean_required_text(&self.approval_id, "approvalId", 255)?,
            decision,
            reason: clean_optional_text(self.reason, "reason", 2_000)?,
            metadata: validate_metadata(self.metadata, "metadata")?,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn session_plan_rejects_unknown_fields() {
        let payload = json!({
            "prompt": "ship it",
            "unexpected": true
        });
        let err = serde_json::from_value::<SessionPlanBody>(payload).unwrap_err();
        assert!(err.to_string().contains("unknown field"));
    }

    #[test]
    fn session_plan_requires_prompt() {
        let payload = SessionPlanBody {
            prompt: "   ".into(),
            agent_id: None,
            workspace_id: None,
            cwd: None,
            model: None,
            profile: None,
            approval_policy: None,
            sandbox_mode: None,
            include_memory: None,
            metadata: None,
        };
        let err = payload.validate().unwrap_err();
        match err {
            AppError::BadRequest(message) => assert_eq!(message, "prompt required"),
            _ => panic!("expected bad request"),
        }
    }

    #[test]
    fn session_dispatch_requires_metadata_object() {
        let payload = SessionDispatchBody {
            prompt: "run".into(),
            agent_id: None,
            workspace_id: None,
            cwd: None,
            model: None,
            profile: None,
            approval_policy: None,
            sandbox_mode: None,
            session_name: None,
            metadata: Some(json!(["bad"])),
        };
        let err = payload.validate().unwrap_err();
        match err {
            AppError::BadRequest(message) => assert_eq!(message, "metadata must be an object"),
            _ => panic!("expected bad request"),
        }
    }

    #[test]
    fn approval_dispatch_rejects_invalid_decision() {
        let payload = ApprovalDispatchBody {
            approval_id: "abc123".into(),
            decision: "later".into(),
            reason: None,
            metadata: None,
        };
        let err = payload.validate().unwrap_err();
        match err {
            AppError::BadRequest(message) => assert!(message.contains("invalid value")),
            _ => panic!("expected bad request"),
        }
    }

    #[test]
    fn approval_dispatch_rejects_unknown_fields() {
        let payload = json!({
            "approvalId": "abc123",
            "decision": "approve",
            "extra": "nope"
        });
        let err = serde_json::from_value::<ApprovalDispatchBody>(payload).unwrap_err();
        assert!(err.to_string().contains("unknown field"));
    }
}
