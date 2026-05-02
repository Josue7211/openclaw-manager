use axum::extract::State;
use axum::routing::{get, post};
use axum::{Json, Router};
use reqwest::Method;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use super::agent_shell_support::{health, proxy_json as proxy_agent_shell_json};
use super::mail_policy;
use super::secret_broker_support;
use crate::error::AppError;
use crate::server::{AppState, RequireAuth};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct OpenClawSessionRequest {
    pub project: String,
    pub objective: String,
    pub profile: String,
    pub workspace: Option<String>,
    pub command: Option<String>,
    pub needs_secrets: bool,
}

impl OpenClawSessionRequest {
    fn validate(&self) -> Result<(), AppError> {
        if self.project.trim().is_empty() {
            return Err(AppError::BadRequest("project must not be empty".into()));
        }
        if self.objective.trim().is_empty() {
            return Err(AppError::BadRequest("objective must not be empty".into()));
        }
        if self.profile.trim().is_empty() {
            return Err(AppError::BadRequest("profile must not be empty".into()));
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SecretApprovalRequest {
    pub session_id: String,
    pub secret_ref: String,
    pub action: String,
    pub target: String,
    pub reason: String,
    pub ttl_seconds: u64,
}

impl SecretApprovalRequest {
    fn validate(&self) -> Result<(), AppError> {
        if self.session_id.trim().is_empty() {
            return Err(AppError::BadRequest("session_id must not be empty".into()));
        }
        if self.secret_ref.trim().is_empty() {
            return Err(AppError::BadRequest("secret_ref must not be empty".into()));
        }
        if self.action.trim().is_empty() {
            return Err(AppError::BadRequest("action must not be empty".into()));
        }
        if self.target.trim().is_empty() {
            return Err(AppError::BadRequest("target must not be empty".into()));
        }
        if self.reason.trim().is_empty() {
            return Err(AppError::BadRequest("reason must not be empty".into()));
        }
        if self.ttl_seconds == 0 {
            return Err(AppError::BadRequest(
                "ttl_seconds must be greater than zero".into(),
            ));
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct MailActionRequest {
    pub action: String,
    pub thread_id: Option<String>,
    pub account_id: Option<String>,
    pub instructions: Option<String>,
}

impl MailActionRequest {
    fn validate(&self) -> Result<(), AppError> {
        if self.action.trim().is_empty() {
            return Err(AppError::BadRequest("action must not be empty".into()));
        }

        mail_policy::mail_action_allowed(&self.action)
    }
}

#[derive(Debug, Serialize)]
struct BrokerCreateRequest<'a> {
    request_type: &'a str,
    secret_ref: &'a str,
    action: &'a str,
    target: &'a str,
    reason: &'a str,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/agent-shell/health", get(get_health))
        .route("/agent-shell/sessions/plan", post(plan_session))
        .route("/agent-shell/sessions/dispatch", post(dispatch_session))
        .route("/agent-shell/approvals/plan", post(plan_approval))
        .route("/agent-shell/approvals/dispatch", post(dispatch_approval))
        .route("/agent-shell/mail-actions/plan", post(plan_mail_action))
        .route(
            "/agent-shell/mail-actions/dispatch",
            post(dispatch_mail_action),
        )
}

async fn get_health(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    health(&state).await
}

async fn plan_session(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Json(payload): Json<OpenClawSessionRequest>,
) -> Result<Json<Value>, AppError> {
    payload.validate()?;
    proxy_agent_shell_json(&state, Method::POST, "/v1/sessions/plan", &payload).await
}

async fn dispatch_session(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Json(payload): Json<OpenClawSessionRequest>,
) -> Result<Json<Value>, AppError> {
    payload.validate()?;
    proxy_agent_shell_json(&state, Method::POST, "/v1/sessions", &payload).await
}

async fn plan_approval(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Json(payload): Json<SecretApprovalRequest>,
) -> Result<Json<Value>, AppError> {
    payload.validate()?;
    let broker_status = secret_broker_support::health(&state).await?.0;
    Ok(Json(json!({
        "ok": true,
        "provider": "agentsecrets",
        "broker": broker_status,
        "request": {
            "request_type": "secret_access",
            "secret_ref": payload.secret_ref,
            "action": payload.action,
            "target": payload.target,
            "reason": payload.reason,
            "ttl_seconds": payload.ttl_seconds,
        }
    })))
}

async fn dispatch_approval(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Json(payload): Json<SecretApprovalRequest>,
) -> Result<Json<Value>, AppError> {
    payload.validate()?;
    let broker_request = BrokerCreateRequest {
        request_type: "secret_access",
        secret_ref: &payload.secret_ref,
        action: &payload.action,
        target: &payload.target,
        reason: &payload.reason,
    };
    secret_broker_support::proxy_json(&state, Method::POST, "/v1/requests", &broker_request).await
}

async fn plan_mail_action(
    State(_state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Json(payload): Json<MailActionRequest>,
) -> Result<Json<Value>, AppError> {
    payload.validate()?;
    Ok(Json(json!({
        "ok": true,
        "policy": "draft_only",
        "request": payload,
    })))
}

async fn dispatch_mail_action(
    State(_state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Json(payload): Json<MailActionRequest>,
) -> Result<Json<Value>, AppError> {
    payload.validate()?;
    Ok(Json(json!({
        "ok": true,
        "policy": "draft_only",
        "dispatched": false,
        "request": payload,
    })))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::routes::agent_shell_support::normalize_agent_shell_base_url;

    #[test]
    fn normalizes_agent_shell_base_url() {
        assert_eq!(
            normalize_agent_shell_base_url("https://example.com/"),
            Some("https://example.com".to_string())
        );
        assert_eq!(
            normalize_agent_shell_base_url("  http://127.0.0.1:8077  "),
            Some("http://127.0.0.1:8077".to_string())
        );
    }

    #[test]
    fn rejects_invalid_agent_shell_base_url() {
        assert_eq!(normalize_agent_shell_base_url(""), None);
        assert_eq!(normalize_agent_shell_base_url("ftp://example.com"), None);
        assert_eq!(normalize_agent_shell_base_url("example.com"), None);
    }

    #[test]
    fn validates_openclaw_session_request() {
        let request = OpenClawSessionRequest {
            project: "clawcontrol".into(),
            objective: "Do useful work".into(),
            profile: "default".into(),
            workspace: None,
            command: None,
            needs_secrets: false,
        };

        assert!(request.validate().is_ok());
    }

    #[test]
    fn rejects_empty_openclaw_session_fields() {
        let request = OpenClawSessionRequest {
            project: " ".into(),
            objective: "Do useful work".into(),
            profile: "default".into(),
            workspace: None,
            command: None,
            needs_secrets: false,
        };

        assert!(matches!(
            request.validate(),
            Err(AppError::BadRequest(message)) if message.contains("project")
        ));
    }

    #[test]
    fn validates_secret_approval_request() {
        let request = SecretApprovalRequest {
            session_id: "sess_123".into(),
            secret_ref: "bw://login/github".into(),
            action: "read".into(),
            target: "github".into(),
            reason: "CI deploy".into(),
            ttl_seconds: 300,
        };

        assert!(request.validate().is_ok());
    }

    #[test]
    fn rejects_invalid_secret_approval_fields() {
        let request = SecretApprovalRequest {
            session_id: "sess_123".into(),
            secret_ref: "bw://login/github".into(),
            action: "read".into(),
            target: "github".into(),
            reason: " ".into(),
            ttl_seconds: 300,
        };

        assert!(matches!(
            request.validate(),
            Err(AppError::BadRequest(message)) if message.contains("reason")
        ));
    }

    #[test]
    fn validates_draft_reply_mail_action_request() {
        let request = MailActionRequest {
            action: "draft_reply".into(),
            thread_id: Some("thr_123".into()),
            account_id: Some("acct_personal".into()),
            instructions: Some("Write a short reply".into()),
        };

        assert!(request.validate().is_ok());
    }

    #[test]
    fn rejects_send_reply_mail_action_request() {
        let request = MailActionRequest {
            action: "send_reply".into(),
            thread_id: Some("thr_123".into()),
            account_id: Some("acct_personal".into()),
            instructions: None,
        };

        assert!(
            matches!(request.validate(), Err(AppError::BadRequest(message)) if message.contains("draft-only policy"))
        );
    }
}
