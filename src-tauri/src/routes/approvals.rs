use axum::{
    extract::{Path, State},
    routing::{get, post},
    Json, Router,
};
use rand::RngCore;
use reqwest::Method;
use serde::Deserialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::time::Duration;

use super::gateway::{gateway_forward, harness_api_url, sanitize_error_body};
use super::secret_broker_support::{secret_broker_base_url, validate_secret_broker_transport};
use super::util::random_uuid;
use crate::error::AppError;
use crate::server::{AppState, RequireAuth};

const SOURCE_CLAWCONTROL: &str = "clawcontrol";
const SOURCE_HARNESS: &str = "harness";
const SOURCE_AGENTSECRETS: &str = "agentsecrets";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateApprovalRequest {
    #[serde(default)]
    source: Option<String>,
    #[serde(default)]
    requester: Option<Value>,
    action: String,
    #[serde(default)]
    target: Option<Value>,
    #[serde(default)]
    risk: Option<String>,
    #[serde(default)]
    scope: Option<Value>,
    summary: String,
    #[serde(default)]
    diff: Option<Value>,
    #[serde(default)]
    policy: Option<Value>,
    #[serde(default)]
    nonce: Option<String>,
    #[serde(default, alias = "expiresAt")]
    expires_at: Option<String>,
    #[serde(default)]
    raw: Option<Value>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct VerifyCapabilityRequest {
    capability: String,
    #[serde(default)]
    action: Option<String>,
    #[serde(default)]
    target: Option<Value>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ApprovalResultRequest {
    #[serde(default, alias = "capabilityId")]
    capability_id: Option<String>,
    status: String,
    #[serde(default)]
    summary: Option<String>,
    #[serde(default, alias = "startedAt")]
    started_at: Option<String>,
    #[serde(default, alias = "finishedAt")]
    finished_at: Option<String>,
    #[serde(default)]
    stdout: Option<String>,
    #[serde(default)]
    stderr: Option<String>,
    #[serde(default)]
    artifacts: Option<Value>,
    #[serde(default)]
    redactions: Option<Value>,
    #[serde(default, alias = "consumedBy")]
    consumed_by: Option<String>,
    #[serde(default)]
    raw: Option<Value>,
}

#[derive(Debug, Deserialize)]
struct RevokeCapabilityRequest {
    #[serde(default)]
    reason: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ResolveApprovalCodeRequest {
    code: String,
    decision: String,
    #[serde(default)]
    reason: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ApprovalCodeDecision {
    Approve,
    Deny,
}

impl ApprovalCodeDecision {
    fn parse(value: &str) -> Option<Self> {
        match value.trim().to_ascii_lowercase().as_str() {
            "approve" | "approved" | "yes" => Some(Self::Approve),
            "deny" | "denied" | "reject" | "rejected" | "no" => Some(Self::Deny),
            _ => None,
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::Approve => "approve",
            Self::Deny => "deny",
        }
    }
}

fn prefixed_id(source: &str, id: &str) -> String {
    format!("{source}:{id}")
}

fn split_source_id(id: &str) -> (&str, &str) {
    id.split_once(':').unwrap_or((SOURCE_HARNESS, id))
}

fn str_field<'a>(value: &'a Value, keys: &[&str]) -> Option<&'a str> {
    keys.iter().find_map(|key| value.get(*key)?.as_str())
}

fn value_field(value: &Value, keys: &[&str]) -> Option<Value> {
    keys.iter().find_map(|key| value.get(*key).cloned())
}

fn status_for_ui(status: &str) -> &'static str {
    match status {
        "approved" | "auto_approved" | "consumed" => "approved",
        "rejected" | "denied" | "expired" | "failed" => "rejected",
        _ => "pending",
    }
}

fn json_string(value: &Value) -> Result<String, AppError> {
    serde_json::to_string(value).map_err(|e| AppError::Internal(e.into()))
}

fn parse_json(value: &str) -> Value {
    serde_json::from_str(value).unwrap_or_else(|_| json!({}))
}

fn sha256_hex(value: &str) -> String {
    hex::encode(Sha256::digest(value.as_bytes()))
}

fn sanitize_approval_code(value: &str) -> Option<String> {
    let code = value.trim();
    if (4..=96).contains(&code.len())
        && code
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
    {
        Some(code.to_string())
    } else {
        None
    }
}

fn approval_text_command(text: &str) -> Option<(ApprovalCodeDecision, String)> {
    let mut parts = text.split_whitespace();
    let decision = ApprovalCodeDecision::parse(parts.next()?)?;
    let code = sanitize_approval_code(parts.next()?)?;
    if parts.next().is_some() {
        return None;
    }
    Some((decision, code))
}

fn approval_command_text_from_payload(payload: &Value) -> Option<&str> {
    payload
        .pointer("/data/text")
        .or_else(|| payload.pointer("/data/message/text"))
        .or_else(|| payload.pointer("/message/text"))
        .or_else(|| payload.get("text"))
        .or_else(|| payload.get("message").and_then(|value| value.get("text")))
        .and_then(Value::as_str)
}

fn random_secret(prefix: &str) -> String {
    let mut bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    format!("{prefix}_{}", hex::encode(bytes))
}

fn risk_or_default(value: Option<String>) -> Result<String, AppError> {
    let risk = value
        .unwrap_or_else(|| "medium".into())
        .to_ascii_lowercase();
    match risk.as_str() {
        "low" | "medium" | "high" => Ok(risk),
        _ => Err(AppError::BadRequest(
            "risk must be low, medium, or high".into(),
        )),
    }
}

fn validate_result_status(status: &str) -> Result<&'static str, AppError> {
    match status {
        "success" => Ok("success"),
        "failed" => Ok("failed"),
        "denied" => Ok("denied"),
        "timeout" => Ok("timeout"),
        "canceled" => Ok("canceled"),
        _ => Err(AppError::BadRequest(
            "status must be success, failed, denied, timeout, or canceled".into(),
        )),
    }
}

fn split_local_approval_id<'a>(id: &'a str) -> Result<&'a str, AppError> {
    let (source, raw_id) = split_source_id(id);
    if source == SOURCE_CLAWCONTROL || (source == SOURCE_HARNESS && raw_id.starts_with("appr_")) {
        Ok(raw_id)
    } else {
        Err(AppError::BadRequest(
            "result reporting is only supported for ClawControl approvals".into(),
        ))
    }
}

fn default_expiry() -> String {
    (chrono::Utc::now() + chrono::Duration::minutes(15)).to_rfc3339()
}

fn now_rfc3339() -> String {
    chrono::Utc::now().to_rfc3339()
}

fn expiry_is_past(value: &str) -> bool {
    chrono::DateTime::parse_from_rfc3339(value)
        .map(|dt| dt.with_timezone(&chrono::Utc) <= chrono::Utc::now())
        .unwrap_or(false)
}

fn requester_agent_id(requester: &Value) -> &str {
    str_field(requester, &["id", "agent_id", "agentId"]).unwrap_or("")
}

fn source_label(source: &str) -> &'static str {
    match source {
        "agentshell" => "Agent Shell",
        SOURCE_AGENTSECRETS => "Agent Secrets",
        SOURCE_HARNESS => "Hermes Harness",
        _ => "ClawControl",
    }
}

fn normalize_local_approval(row: LocalApprovalRow) -> Value {
    let requester = parse_json(&row.requester);
    let target = parse_json(&row.target);
    let scope = parse_json(&row.scope);
    let diff = parse_json(&row.diff);
    let policy = parse_json(&row.policy);
    let raw = parse_json(&row.raw);

    json!({
        "id": prefixed_id(SOURCE_CLAWCONTROL, &row.id),
        "source": row.source,
        "sourceLabel": source_label(&row.source),
        "sessionId": str_field(&requester, &["session_id", "sessionId"]).unwrap_or(""),
        "agentId": requester_agent_id(&requester),
        "tool": row.action,
        "args": {
            "risk": row.risk,
            "target": target,
            "scope": scope,
            "diff": diff,
            "policy": policy,
            "expires_at": row.expires_at,
        },
        "context": row.summary,
        "requestedAt": row.requested_at,
        "status": status_for_ui(&row.status),
        "raw": {
            "id": row.id,
            "source": row.source,
            "requester": requester,
            "action": row.action,
            "target": target,
            "risk": row.risk,
            "scope": scope,
            "summary": row.summary,
            "diff": diff,
            "policy": policy,
            "expires_at": row.expires_at,
            "raw": raw,
        },
    })
}

#[derive(Debug)]
struct LocalApprovalRow {
    id: String,
    source: String,
    requester: String,
    action: String,
    target: String,
    risk: String,
    scope: String,
    summary: String,
    diff: String,
    policy: String,
    status: String,
    expires_at: String,
    requested_at: String,
    raw: String,
}

fn normalize_harness_approval(raw: Value) -> Option<Value> {
    let id = str_field(&raw, &["id", "approval_id", "request_id"])?;
    let status = str_field(&raw, &["status"]).unwrap_or("pending");
    let requested_at = str_field(&raw, &["requestedAt", "requested_at", "created_at"])
        .map(str::to_string)
        .unwrap_or_else(|| chrono::Utc::now().to_rfc3339());
    let tool =
        str_field(&raw, &["tool", "name", "action", "request_type"]).unwrap_or("Harness request");
    let context = str_field(&raw, &["context", "reason", "summary", "message"]).unwrap_or("");
    let args = value_field(&raw, &["args", "arguments", "payload", "request"])
        .unwrap_or_else(|| json!({}));

    Some(json!({
        "id": prefixed_id(SOURCE_HARNESS, id),
        "source": SOURCE_HARNESS,
        "sourceLabel": "Hermes Harness",
        "sessionId": str_field(&raw, &["sessionId", "session_id"]).unwrap_or(""),
        "agentId": str_field(&raw, &["agentId", "agent_id"]).unwrap_or(""),
        "tool": tool,
        "args": args,
        "context": context,
        "requestedAt": requested_at,
        "status": status_for_ui(status),
        "raw": raw,
    }))
}

fn normalize_harness_payload(payload: Value) -> Vec<Value> {
    let approvals = payload
        .get("approvals")
        .cloned()
        .or_else(|| payload.as_array().map(|_| payload.clone()))
        .unwrap_or_else(|| json!([]));

    approvals
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|item| normalize_harness_approval(item.clone()))
        .collect()
}

fn agentsecrets_request_id(raw: &Value) -> Option<&str> {
    str_field(raw, &["id", "request_id"])
}

fn normalize_agentsecrets_approval(raw: Value) -> Option<Value> {
    let id = agentsecrets_request_id(&raw)?;
    let payload = raw.get("approval_payload").unwrap_or(&raw);
    let status = str_field(&raw, &["status"]).unwrap_or("pending_approval");
    let requested_at = str_field(&raw, &["created_at", "requested_at", "requestedAt"])
        .map(str::to_string)
        .unwrap_or_else(|| chrono::Utc::now().to_rfc3339());
    let action = str_field(payload, &["action"]).unwrap_or("secret_access");
    let target = str_field(payload, &["target"]).unwrap_or("");
    let reason = str_field(payload, &["reason"])
        .or_else(|| str_field(&raw, &["reason"]))
        .unwrap_or("");
    let secret_ref = str_field(
        payload,
        &["secret_ref_masked", "secret_ref", "provider_secret_ref"],
    )
    .or_else(|| str_field(&raw, &["secret_ref_masked"]))
    .unwrap_or("");
    let request_type = str_field(payload, &["request_type"]).unwrap_or("secret_access");

    let context = if reason.is_empty() {
        format!("{action} {target}").trim().to_string()
    } else {
        reason.to_string()
    };

    Some(json!({
        "id": prefixed_id(SOURCE_AGENTSECRETS, id),
        "source": SOURCE_AGENTSECRETS,
        "sourceLabel": "Agent Secrets",
        "sessionId": str_field(payload, &["session_id"]).unwrap_or(""),
        "agentId": str_field(payload, &["actor_id", "agent_id"]).unwrap_or(""),
        "tool": format!("Agent Secrets: {action}"),
        "args": {
            "request_type": request_type,
            "secret_ref": secret_ref,
            "action": action,
            "target": target,
            "policy": payload.get("policy").cloned().unwrap_or_else(|| json!(null)),
            "identity": payload.get("identity").cloned().unwrap_or_else(|| json!(null)),
            "memd_context": payload.get("memd_context").cloned().unwrap_or_else(|| json!(null)),
        },
        "context": context,
        "requestedAt": requested_at,
        "status": status_for_ui(status),
        "raw": raw,
    }))
}

fn normalize_agentsecrets_payload(payload: Value) -> Vec<Value> {
    let rows = payload
        .get("data")
        .cloned()
        .or_else(|| payload.get("requests").cloned())
        .or_else(|| payload.as_array().map(|_| payload.clone()))
        .unwrap_or_else(|| json!([]));

    rows.as_array()
        .into_iter()
        .flatten()
        .filter_map(|item| normalize_agentsecrets_approval(item.clone()))
        .collect()
}

fn source_ok(source: &str, label: &str, configured: bool, count: usize) -> Value {
    json!({
        "source": source,
        "label": label,
        "configured": configured,
        "ok": true,
        "count": count,
    })
}

fn source_error(source: &str, label: &str, configured: bool, error: String) -> Value {
    json!({
        "source": source,
        "label": label,
        "configured": configured,
        "ok": false,
        "error": error,
    })
}

fn broker_approver_key(state: &AppState) -> Option<String> {
    state
        .secret_first(&[
            "SECRET_BROKER_APPROVER_API_KEY",
            "AGENTSECRETS_APPROVER_API_KEY",
        ])
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn broker_client_key(state: &AppState) -> Option<String> {
    state
        .secret("AGENTSECRETS_CLIENT_API_KEY")
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

async fn broker_json(
    state: &AppState,
    method: Method,
    path: &str,
    api_key: &str,
    body: Option<Value>,
) -> Result<Value, AppError> {
    let Some(base) = secret_broker_base_url(state) else {
        return Err(AppError::BadRequest(
            "Agent Secrets is not configured. Set AGENTSECRETS_URL.".into(),
        ));
    };
    validate_secret_broker_transport(&base)?;
    let url = format!("{}{}", base.trim_end_matches('/'), path);
    let mut req = state
        .http
        .request(method, &url)
        .header("x-api-key", api_key)
        .header("Authorization", format!("Bearer {api_key}"))
        .timeout(Duration::from_secs(15));

    if let Some(body) = body {
        req = req.json(&body);
    }

    let resp = req
        .send()
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Agent Secrets request failed: {e}")))?;
    let status = resp.status();
    if !status.is_success() {
        let text = resp.text().await.unwrap_or_default();
        return Err(AppError::BadRequest(format!(
            "Agent Secrets HTTP {}: {}",
            status.as_u16(),
            sanitize_error_body(&text)
        )));
    }

    resp.json::<Value>()
        .await
        .map_err(|e| AppError::Internal(e.into()))
}

async fn list_harness_approvals(state: &AppState) -> (Vec<Value>, Value) {
    let configured = harness_api_url(state).is_some();
    if !configured {
        return (
            Vec::new(),
            source_error(
                SOURCE_HARNESS,
                "Hermes Harness",
                false,
                "Harness API is not configured.".into(),
            ),
        );
    }

    match gateway_forward(state, Method::GET, "/approvals", None).await {
        Ok(payload) => {
            let approvals = normalize_harness_payload(payload);
            let source = source_ok(SOURCE_HARNESS, "Hermes Harness", true, approvals.len());
            (approvals, source)
        }
        Err(err) => (
            Vec::new(),
            source_error(
                SOURCE_HARNESS,
                "Hermes Harness",
                true,
                match err {
                    AppError::BadRequest(message) => message,
                    _ => "Harness approvals are unreachable.".into(),
                },
            ),
        ),
    }
}

async fn list_agentsecrets_approvals(state: &AppState) -> (Vec<Value>, Value) {
    let configured = secret_broker_base_url(state).is_some();
    if !configured {
        return (
            Vec::new(),
            source_error(
                SOURCE_AGENTSECRETS,
                "Agent Secrets",
                false,
                "Agent Secrets URL is not configured.".into(),
            ),
        );
    }

    if let Some(key) = broker_approver_key(state) {
        match broker_json(
            state,
            Method::GET,
            "/v1/operator/requests/pending?limit=100",
            &key,
            None,
        )
        .await
        {
            Ok(payload) => {
                let approvals = normalize_agentsecrets_payload(payload);
                let source = source_ok(SOURCE_AGENTSECRETS, "Agent Secrets", true, approvals.len());
                return (approvals, source);
            }
            Err(err) => {
                tracing::debug!("[approvals] Agent Secrets operator list failed: {err:?}");
            }
        }
    }

    let Some(key) = broker_client_key(state) else {
        return (
            Vec::new(),
            source_error(
                SOURCE_AGENTSECRETS,
                "Agent Secrets",
                true,
                "Agent Secrets approver/client key is not configured.".into(),
            ),
        );
    };

    match broker_json(
        state,
        Method::GET,
        "/v1/requests?status=pending_approval&limit=100",
        &key,
        None,
    )
    .await
    {
        Ok(payload) => {
            let approvals = normalize_agentsecrets_payload(payload);
            let source = source_ok(SOURCE_AGENTSECRETS, "Agent Secrets", true, approvals.len());
            (approvals, source)
        }
        Err(err) => (
            Vec::new(),
            source_error(
                SOURCE_AGENTSECRETS,
                "Agent Secrets",
                true,
                match err {
                    AppError::BadRequest(message) => message,
                    _ => "Agent Secrets approvals are unreachable.".into(),
                },
            ),
        ),
    }
}

async fn list_clawcontrol_approvals(state: &AppState, user_id: &str) -> (Vec<Value>, Value) {
    if let Err(err) = sweep_expired_local(state, user_id, "list").await {
        tracing::warn!("expired approval sweep failed before list: {err:?}");
    }

    let rows = match sqlx::query_as::<
        _,
        (
            String,
            String,
            String,
            String,
            String,
            String,
            String,
            String,
            String,
            String,
            String,
            String,
            String,
            String,
        ),
    >(
        "SELECT id, source, requester, action, target, risk, scope, summary, diff, policy, \
         status, expires_at, requested_at, raw \
         FROM approval_requests \
         WHERE user_id = ? AND status IN ('pending', 'approved', 'rejected', 'expired', 'failed') \
         ORDER BY requested_at DESC LIMIT 100",
    )
    .bind(user_id)
    .fetch_all(&state.db)
    .await
    {
        Ok(rows) => rows,
        Err(err) => {
            return (
                Vec::new(),
                source_error(
                    SOURCE_CLAWCONTROL,
                    "ClawControl",
                    true,
                    format!("Local approvals unavailable: {err}"),
                ),
            );
        }
    };

    let approvals: Vec<Value> = rows
        .into_iter()
        .map(
            |(
                id,
                source,
                requester,
                action,
                target,
                risk,
                scope,
                summary,
                diff,
                policy,
                status,
                expires_at,
                requested_at,
                raw,
            )| {
                normalize_local_approval(LocalApprovalRow {
                    id,
                    source,
                    requester,
                    action,
                    target,
                    risk,
                    scope,
                    summary,
                    diff,
                    policy,
                    status,
                    expires_at,
                    requested_at,
                    raw,
                })
            },
        )
        .collect();

    let pending = approvals
        .iter()
        .filter(|approval| str_field(approval, &["status"]) == Some("pending"))
        .count();
    (
        approvals,
        source_ok(SOURCE_CLAWCONTROL, "ClawControl", true, pending),
    )
}

async fn sweep_expired_local(
    state: &AppState,
    user_id: &str,
    actor: &str,
) -> Result<Value, AppError> {
    let now = now_rfc3339();
    let expired_approvals = sqlx::query(
        "UPDATE approval_requests \
         SET status = 'expired', resolved_at = COALESCE(resolved_at, datetime('now')), \
             resolved_by = COALESCE(resolved_by, ?), \
             resolution_reason = COALESCE(resolution_reason, 'expired before consumption') \
         WHERE user_id = ? AND status IN ('pending', 'approved') AND expires_at <= ?",
    )
    .bind(actor)
    .bind(user_id)
    .bind(&now)
    .execute(&state.db)
    .await?
    .rows_affected();

    let expired_capabilities = sqlx::query(
        "UPDATE capability_grants \
         SET status = 'expired' \
         WHERE user_id = ? AND status = 'active' AND expires_at <= ?",
    )
    .bind(user_id)
    .bind(&now)
    .execute(&state.db)
    .await?
    .rows_affected();

    if expired_approvals > 0 || expired_capabilities > 0 {
        insert_approval_audit(
            state,
            user_id,
            None,
            None,
            "approvals.sweep_expired",
            &json!({"kind": "system", "id": actor}),
            &json!({
                "expired_approvals": expired_approvals,
                "expired_capabilities": expired_capabilities,
                "checked_at": now,
            }),
        )
        .await;
    }

    Ok(json!({
        "expired_approvals": expired_approvals,
        "expired_capabilities": expired_capabilities,
        "checked_at": now,
    }))
}

async fn sweep_expired_request(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let payload = sweep_expired_local(&state, &session.user_id, "manual").await?;
    Ok(Json(json!({
        "ok": true,
        "source": SOURCE_CLAWCONTROL,
        "data": payload,
    })))
}

/// `GET /api/approvals`
///
/// Aggregates approval requests from ClawControl, Hermes Harness, and Agent Secrets.
async fn list_approvals(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let (mut approvals, clawcontrol_source) =
        list_clawcontrol_approvals(&state, &session.user_id).await;
    let (harness, harness_source) = list_harness_approvals(&state).await;
    let (agentsecrets, agentsecrets_source) = list_agentsecrets_approvals(&state).await;
    approvals.extend(harness);
    approvals.extend(agentsecrets);
    approvals.sort_by(|a, b| {
        let a_ts = str_field(a, &["requestedAt"]).unwrap_or("");
        let b_ts = str_field(b, &["requestedAt"]).unwrap_or("");
        b_ts.cmp(a_ts)
    });

    Ok(Json(json!({
        "approvals": approvals,
        "sources": [clawcontrol_source, harness_source, agentsecrets_source],
    })))
}

async fn create_request(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Json(payload): Json<CreateApprovalRequest>,
) -> Result<Json<Value>, AppError> {
    let action = payload.action.trim();
    if action.is_empty() {
        return Err(AppError::BadRequest("action must not be empty".into()));
    }
    let summary = payload.summary.trim();
    if summary.is_empty() {
        return Err(AppError::BadRequest("summary must not be empty".into()));
    }

    let id = format!("appr_{}", random_uuid());
    let source = payload
        .source
        .unwrap_or_else(|| SOURCE_CLAWCONTROL.into())
        .trim()
        .to_ascii_lowercase();
    let risk = risk_or_default(payload.risk)?;
    let requester = payload.requester.unwrap_or_else(|| json!({}));
    let target = payload.target.unwrap_or_else(|| json!({}));
    let scope = payload.scope.unwrap_or_else(|| json!({}));
    let diff = payload.diff.unwrap_or_else(|| json!({}));
    let policy = payload
        .policy
        .unwrap_or_else(|| json!({ "decision": "ask" }));
    let raw = payload.raw.unwrap_or_else(|| json!({}));
    let expires_at = payload.expires_at.unwrap_or_else(default_expiry);
    if expiry_is_past(&expires_at) {
        return Err(AppError::BadRequest(
            "expires_at must be in the future".into(),
        ));
    }
    let nonce = payload
        .nonce
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| random_secret("nonce"));
    let nonce_hash = sha256_hex(&nonce);

    sqlx::query(
        "INSERT INTO approval_requests \
         (id, user_id, source, requester, action, target, risk, scope, summary, diff, policy, \
          nonce_hash, status, expires_at, raw) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)",
    )
    .bind(&id)
    .bind(&session.user_id)
    .bind(&source)
    .bind(json_string(&requester)?)
    .bind(action)
    .bind(json_string(&target)?)
    .bind(&risk)
    .bind(json_string(&scope)?)
    .bind(summary)
    .bind(json_string(&diff)?)
    .bind(json_string(&policy)?)
    .bind(nonce_hash)
    .bind(&expires_at)
    .bind(json_string(&raw)?)
    .execute(&state.db)
    .await?;

    insert_approval_audit(
        &state,
        &session.user_id,
        Some(&id),
        None,
        "approval.requested",
        &json!({"kind": "user", "id": session.user_id}),
        &json!({"source": source, "action": action, "risk": risk}),
    )
    .await;

    Ok(Json(json!({
        "ok": true,
        "approval": {
            "id": prefixed_id(SOURCE_CLAWCONTROL, &id),
            "source": source,
            "action": action,
            "risk": risk,
            "summary": summary,
            "expires_at": expires_at,
            "status": "pending",
        }
    })))
}

async fn approve_harness(state: &AppState, id: &str) -> Result<Value, AppError> {
    gateway_forward(
        state,
        Method::POST,
        &format!("/approvals/{id}/approve"),
        Some(json!({"approval_id": id})),
    )
    .await
}

async fn reject_harness(state: &AppState, id: &str, reason: &str) -> Result<Value, AppError> {
    gateway_forward(
        state,
        Method::POST,
        &format!("/approvals/{id}/reject"),
        Some(json!({"approval_id": id, "reason": reason})),
    )
    .await
}

async fn approve_agentsecrets(state: &AppState, id: &str) -> Result<Value, AppError> {
    let Some(key) = broker_approver_key(state) else {
        return Err(AppError::BadRequest(
            "Agent Secrets approver key is not configured.".into(),
        ));
    };
    match broker_json(
        state,
        Method::POST,
        &format!("/v1/operator/requests/{id}/approve"),
        &key,
        Some(json!({})),
    )
    .await
    {
        Ok(payload) => Ok(payload),
        Err(operator_error) => {
            tracing::warn!(
                "[approvals] Agent Secrets operator approve failed; trying legacy endpoint: {operator_error:?}"
            );
            broker_json(
                state,
                Method::POST,
                &format!("/v1/requests/{id}/approve"),
                &key,
                Some(json!({})),
            )
            .await
        }
    }
}

async fn insert_approval_audit(
    state: &AppState,
    user_id: &str,
    approval_id: Option<&str>,
    capability_id: Option<&str>,
    event_type: &str,
    actor: &Value,
    details: &Value,
) {
    let audit_id = format!("ae_{}", random_uuid());
    let actor = json_string(actor).unwrap_or_else(|_| "{}".into());
    let details = json_string(details).unwrap_or_else(|_| "{}".into());
    if let Err(err) = sqlx::query(
        "INSERT INTO approval_audit_events \
         (id, approval_id, capability_id, user_id, event_type, actor, details) \
         VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(audit_id)
    .bind(approval_id)
    .bind(capability_id)
    .bind(user_id)
    .bind(event_type)
    .bind(actor)
    .bind(details)
    .execute(&state.db)
    .await
    {
        tracing::warn!(
            event_type = event_type,
            "approval audit write failed: {err}"
        );
    }
}

async fn expire_local_approval(state: &AppState, user_id: &str, id: &str) -> Result<(), AppError> {
    sqlx::query(
        "UPDATE approval_requests \
         SET status = 'expired', resolved_at = datetime('now'), resolved_by = ?, \
             resolution_reason = 'expired before approval' \
         WHERE id = ? AND user_id = ? AND status = 'pending'",
    )
    .bind(user_id)
    .bind(id)
    .bind(user_id)
    .execute(&state.db)
    .await?;

    insert_approval_audit(
        state,
        user_id,
        Some(id),
        None,
        "approval.expired",
        &json!({"kind": "system", "id": "clawcontrol"}),
        &json!({}),
    )
    .await;
    Ok(())
}

async fn approve_local(state: &AppState, user_id: &str, id: &str) -> Result<Value, AppError> {
    let row = sqlx::query_as::<_, (String, String, String, String, String, String)>(
        "SELECT action, target, scope, risk, expires_at, status \
         FROM approval_requests WHERE id = ? AND user_id = ? LIMIT 1",
    )
    .bind(id)
    .bind(user_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("approval request not found".into()))?;

    let (action, target, scope, risk, expires_at, status) = row;
    if status != "pending" {
        return Err(AppError::BadRequest(format!(
            "approval is already {status}"
        )));
    }
    if expiry_is_past(&expires_at) {
        expire_local_approval(state, user_id, id).await?;
        return Err(AppError::BadRequest("approval is expired".into()));
    }

    let capability_id = format!("cap_{}", random_uuid());
    let capability = random_secret("cap_live");
    let token_hash = sha256_hex(&capability);
    sqlx::query(
        "INSERT INTO capability_grants \
         (id, approval_id, user_id, token_hash, action, target, scope, risk, expires_at, metadata) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&capability_id)
    .bind(id)
    .bind(user_id)
    .bind(token_hash)
    .bind(&action)
    .bind(&target)
    .bind(&scope)
    .bind(&risk)
    .bind(&expires_at)
    .bind("{}")
    .execute(&state.db)
    .await?;

    sqlx::query(
        "UPDATE approval_requests \
         SET status = 'approved', resolved_at = datetime('now'), resolved_by = ? \
         WHERE id = ? AND user_id = ?",
    )
    .bind(user_id)
    .bind(id)
    .bind(user_id)
    .execute(&state.db)
    .await?;

    insert_approval_audit(
        state,
        user_id,
        Some(id),
        Some(&capability_id),
        "approval.approved",
        &json!({"kind": "user", "id": user_id}),
        &json!({"action": action, "risk": risk}),
    )
    .await;
    insert_approval_audit(
        state,
        user_id,
        Some(id),
        Some(&capability_id),
        "capability.issued",
        &json!({"kind": "system", "id": "clawcontrol"}),
        &json!({"expires_at": expires_at}),
    )
    .await;

    Ok(json!({
        "approval_id": id,
        "capability": {
            "capability": capability,
            "capability_id": capability_id,
            "approval_id": id,
            "action": action,
            "target": parse_json(&target),
            "scope": parse_json(&scope),
            "risk": risk,
            "issuer": "clawcontrol",
            "expires_at": expires_at,
        }
    }))
}

async fn reject_local(
    state: &AppState,
    user_id: &str,
    id: &str,
    reason: &str,
) -> Result<Value, AppError> {
    let result = sqlx::query(
        "UPDATE approval_requests \
         SET status = 'rejected', resolved_at = datetime('now'), resolved_by = ?, \
             resolution_reason = ? \
         WHERE id = ? AND user_id = ? AND status = 'pending'",
    )
    .bind(user_id)
    .bind(reason)
    .bind(id)
    .bind(user_id)
    .execute(&state.db)
    .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::BadRequest(
            "approval request is not pending or does not exist".into(),
        ));
    }

    insert_approval_audit(
        state,
        user_id,
        Some(id),
        None,
        "approval.rejected",
        &json!({"kind": "user", "id": user_id}),
        &json!({"reason": reason}),
    )
    .await;

    Ok(json!({"approval_id": id, "status": "rejected"}))
}

async fn reject_agentsecrets(state: &AppState, id: &str, reason: &str) -> Result<Value, AppError> {
    let Some(key) = broker_approver_key(state) else {
        return Err(AppError::BadRequest(
            "Agent Secrets approver key is not configured.".into(),
        ));
    };
    match broker_json(
        state,
        Method::POST,
        &format!("/v1/operator/requests/{id}/deny"),
        &key,
        Some(json!({ "reason": reason })),
    )
    .await
    {
        Ok(payload) => Ok(payload),
        Err(operator_error) => {
            tracing::warn!(
                "[approvals] Agent Secrets operator deny failed; trying legacy endpoint: {operator_error:?}"
            );
            broker_json(
                state,
                Method::POST,
                &format!("/v1/requests/{id}/deny"),
                &key,
                Some(json!({ "reason": reason })),
            )
            .await
        }
    }
}

async fn resolve_approval_code(
    state: &AppState,
    code: &str,
    decision: ApprovalCodeDecision,
    reason: &str,
    allow_high_risk: bool,
) -> Result<Value, AppError> {
    let code = sanitize_approval_code(code)
        .ok_or_else(|| AppError::BadRequest("invalid approval code".into()))?;
    let nonce_hash = sha256_hex(&code);
    let row = sqlx::query_as::<_, (String, String, String, String)>(
        "SELECT id, user_id, risk, expires_at \
         FROM approval_requests \
         WHERE nonce_hash = ? AND status = 'pending' \
         LIMIT 1",
    )
    .bind(nonce_hash)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("approval code not found".into()))?;

    let (id, user_id, risk, expires_at) = row;
    if expiry_is_past(&expires_at) {
        expire_local_approval(state, &user_id, &id).await?;
        return Err(AppError::BadRequest("approval is expired".into()));
    }
    if risk == "high" && !allow_high_risk {
        insert_approval_audit(
            state,
            &user_id,
            Some(&id),
            None,
            "approval.code_rejected",
            &json!({"kind": "imessage", "id": "structured-reply"}),
            &json!({"reason": "high_risk_requires_strong_confirmation"}),
        )
        .await;
        return Err(AppError::Forbidden(
            "high-risk approvals require strong confirmation".into(),
        ));
    }

    let payload = match decision {
        ApprovalCodeDecision::Approve => approve_local(state, &user_id, &id).await?,
        ApprovalCodeDecision::Deny => reject_local(state, &user_id, &id, reason).await?,
    };

    insert_approval_audit(
        state,
        &user_id,
        Some(&id),
        None,
        "approval.code_resolved",
        &json!({"kind": "imessage", "id": "structured-reply"}),
        &json!({"decision": decision.as_str(), "risk": risk}),
    )
    .await;

    Ok(json!({
        "approval_id": prefixed_id(SOURCE_CLAWCONTROL, &id),
        "decision": decision.as_str(),
        "risk": risk,
        "data": payload,
    }))
}

pub(crate) async fn resolve_imessage_approval_command(
    state: &AppState,
    payload: &Value,
) -> Option<Value> {
    let text = approval_command_text_from_payload(payload)?;
    let (decision, code) = approval_text_command(text)?;
    Some(
        match resolve_approval_code(
            state,
            &code,
            decision,
            "resolved by structured iMessage reply",
            false,
        )
        .await
        {
            Ok(payload) => json!({"ok": true, "source": "imessage", "data": payload}),
            Err(err) => json!({"ok": false, "source": "imessage", "error": format!("{err:?}")}),
        },
    )
}

async fn resolve_code_request(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Json(body): Json<ResolveApprovalCodeRequest>,
) -> Result<Json<Value>, AppError> {
    let decision = ApprovalCodeDecision::parse(&body.decision)
        .ok_or_else(|| AppError::BadRequest("decision must be approve or deny".into()))?;
    let reason = body
        .reason
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("resolved by approval code");
    let payload = resolve_approval_code(&state, &body.code, decision, reason, false).await?;
    Ok(Json(json!({
        "ok": true,
        "source": SOURCE_CLAWCONTROL,
        "data": payload,
    })))
}

async fn record_local_result(
    state: &AppState,
    user_id: &str,
    approval_id: &str,
    body: ApprovalResultRequest,
) -> Result<Value, AppError> {
    let result_status = validate_result_status(body.status.trim())?;
    let capability_row = if let Some(capability_id) = body
        .capability_id
        .as_ref()
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
    {
        sqlx::query_as::<_, (String, String, String, String)>(
            "SELECT id, status, action, risk FROM capability_grants \
             WHERE id = ? AND approval_id = ? AND user_id = ? LIMIT 1",
        )
        .bind(capability_id)
        .bind(approval_id)
        .bind(user_id)
        .fetch_optional(&state.db)
        .await?
    } else {
        sqlx::query_as::<_, (String, String, String, String)>(
            "SELECT id, status, action, risk FROM capability_grants \
             WHERE approval_id = ? AND user_id = ? ORDER BY issued_at DESC LIMIT 1",
        )
        .bind(approval_id)
        .bind(user_id)
        .fetch_optional(&state.db)
        .await?
    }
    .ok_or_else(|| AppError::NotFound("capability grant not found".into()))?;

    let (capability_id, capability_status, action, risk) = capability_row;
    if capability_status != "active" {
        return Err(AppError::BadRequest(format!(
            "capability is already {capability_status}"
        )));
    }

    let approval_status = if result_status == "success" {
        "consumed"
    } else {
        "failed"
    };
    let summary = body.summary.unwrap_or_default();
    let consumed_by = body.consumed_by.unwrap_or_else(|| "agentshell".into());
    let result_details = json!({
        "status": result_status,
        "summary": summary,
        "started_at": body.started_at,
        "finished_at": body.finished_at,
        "stdout": body.stdout.unwrap_or_default(),
        "stderr": body.stderr.unwrap_or_default(),
        "artifacts": body.artifacts.unwrap_or_else(|| json!([])),
        "redactions": body.redactions.unwrap_or_else(|| json!([])),
        "raw": body.raw.unwrap_or_else(|| json!({})),
    });

    sqlx::query(
        "UPDATE capability_grants \
         SET status = 'consumed', consumed_at = datetime('now'), consumed_by = ?, \
             result_summary = ?, metadata = ? \
         WHERE id = ? AND approval_id = ? AND user_id = ? AND status = 'active'",
    )
    .bind(&consumed_by)
    .bind(&summary)
    .bind(json_string(&result_details)?)
    .bind(&capability_id)
    .bind(approval_id)
    .bind(user_id)
    .execute(&state.db)
    .await?;

    sqlx::query(
        "UPDATE approval_requests \
         SET status = ?, resolved_at = COALESCE(resolved_at, datetime('now')), \
             resolution_reason = ? \
         WHERE id = ? AND user_id = ?",
    )
    .bind(approval_status)
    .bind(format!("execution {result_status}"))
    .bind(approval_id)
    .bind(user_id)
    .execute(&state.db)
    .await?;

    insert_approval_audit(
        state,
        user_id,
        Some(approval_id),
        Some(&capability_id),
        "capability.consumed",
        &json!({"kind": "agent", "id": consumed_by}),
        &json!({"status": result_status, "action": action, "risk": risk}),
    )
    .await;
    insert_approval_audit(
        state,
        user_id,
        Some(approval_id),
        Some(&capability_id),
        "approval.result",
        &json!({"kind": "agent", "id": consumed_by}),
        &result_details,
    )
    .await;

    Ok(json!({
        "approval_id": approval_id,
        "capability_id": capability_id,
        "approval_status": approval_status,
        "capability_status": "consumed",
        "result_status": result_status,
    }))
}

async fn revoke_capability_local(
    state: &AppState,
    user_id: &str,
    capability_id: &str,
    reason: &str,
) -> Result<Value, AppError> {
    let row = sqlx::query_as::<_, (String, String, String)>(
        "SELECT approval_id, status, action FROM capability_grants \
         WHERE id = ? AND user_id = ? LIMIT 1",
    )
    .bind(capability_id)
    .bind(user_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("capability grant not found".into()))?;

    let (approval_id, status, action) = row;
    if status != "active" {
        return Err(AppError::BadRequest(format!(
            "capability is already {status}"
        )));
    }

    sqlx::query(
        "UPDATE capability_grants \
         SET status = 'revoked', result_summary = ?, metadata = ? \
         WHERE id = ? AND user_id = ? AND status = 'active'",
    )
    .bind(reason)
    .bind(json_string(&json!({"reason": reason}))?)
    .bind(capability_id)
    .bind(user_id)
    .execute(&state.db)
    .await?;

    sqlx::query(
        "UPDATE approval_requests \
         SET status = 'failed', resolved_at = COALESCE(resolved_at, datetime('now')), \
             resolution_reason = ? \
         WHERE id = ? AND user_id = ? AND status = 'approved'",
    )
    .bind(format!("capability revoked: {reason}"))
    .bind(&approval_id)
    .bind(user_id)
    .execute(&state.db)
    .await?;

    insert_approval_audit(
        state,
        user_id,
        Some(&approval_id),
        Some(capability_id),
        "capability.revoked",
        &json!({"kind": "user", "id": user_id}),
        &json!({"reason": reason, "action": action}),
    )
    .await;

    Ok(json!({
        "approval_id": approval_id,
        "capability_id": capability_id,
        "capability_status": "revoked",
        "reason": reason,
    }))
}

/// `POST /api/approvals/:id/approve`
async fn approve_request(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Path(id): Path<String>,
) -> Result<Json<Value>, AppError> {
    let (source, raw_id) = split_source_id(&id);
    let payload = match source {
        SOURCE_CLAWCONTROL => approve_local(&state, &session.user_id, raw_id).await?,
        SOURCE_AGENTSECRETS => approve_agentsecrets(&state, raw_id).await?,
        _ => approve_harness(&state, raw_id).await?,
    };

    Ok(Json(json!({"ok": true, "source": source, "data": payload})))
}

/// `POST /api/approvals/:id/result`
async fn approval_result(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Path(id): Path<String>,
    Json(body): Json<ApprovalResultRequest>,
) -> Result<Json<Value>, AppError> {
    let raw_id = split_local_approval_id(&id)?;
    let payload = record_local_result(&state, &session.user_id, raw_id, body).await?;
    Ok(Json(json!({
        "ok": true,
        "source": SOURCE_CLAWCONTROL,
        "data": payload,
    })))
}

/// `POST /api/approvals/:id/reject`
async fn reject_request(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Path(id): Path<String>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, AppError> {
    let reason = body
        .get("reason")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let (source, raw_id) = split_source_id(&id);
    let payload = match source {
        SOURCE_CLAWCONTROL => reject_local(&state, &session.user_id, raw_id, &reason).await?,
        SOURCE_AGENTSECRETS => reject_agentsecrets(&state, raw_id, &reason).await?,
        _ => reject_harness(&state, raw_id, &reason).await?,
    };

    Ok(Json(json!({"ok": true, "source": source, "data": payload})))
}

async fn verify_capability(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Json(body): Json<VerifyCapabilityRequest>,
) -> Result<Json<Value>, AppError> {
    let sweep = sweep_expired_local(&state, &session.user_id, "verify").await?;
    if body.capability.trim().is_empty() {
        return Err(AppError::BadRequest("capability must not be empty".into()));
    }
    let token_hash = sha256_hex(body.capability.trim());
    let row = sqlx::query_as::<_, (String, String, String, String, String, String, String)>(
        "SELECT id, approval_id, action, target, scope, risk, expires_at \
         FROM capability_grants \
         WHERE token_hash = ? AND user_id = ? AND status = 'active' \
         LIMIT 1",
    )
    .bind(token_hash)
    .bind(&session.user_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::Forbidden("capability is invalid or inactive".into()))?;

    let (capability_id, approval_id, action, target, scope, risk, expires_at) = row;
    if expiry_is_past(&expires_at) {
        sqlx::query("UPDATE capability_grants SET status = 'expired' WHERE id = ? AND user_id = ?")
            .bind(&capability_id)
            .bind(&session.user_id)
            .execute(&state.db)
            .await?;
        return Err(AppError::Forbidden("capability is expired".into()));
    }
    if let Some(expected_action) = body.action.as_deref() {
        if expected_action != action {
            return Err(AppError::Forbidden(
                "capability action does not match request".into(),
            ));
        }
    }
    if let Some(expected_target) = body.target.as_ref() {
        if expected_target != &parse_json(&target) {
            return Err(AppError::Forbidden(
                "capability target does not match request".into(),
            ));
        }
    }

    insert_approval_audit(
        &state,
        &session.user_id,
        Some(&approval_id),
        Some(&capability_id),
        "capability.verified",
        &json!({"kind": "system", "id": "clawcontrol"}),
        &json!({"action": action}),
    )
    .await;

    Ok(Json(json!({
        "ok": true,
        "capability": {
            "capability_id": capability_id,
            "approval_id": approval_id,
            "action": action,
            "target": parse_json(&target),
            "scope": parse_json(&scope),
            "risk": risk,
            "expires_at": expires_at,
        },
        "sweep": sweep,
    })))
}

/// `POST /api/capabilities/:id/revoke`
async fn revoke_capability(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Path(id): Path<String>,
    Json(body): Json<RevokeCapabilityRequest>,
) -> Result<Json<Value>, AppError> {
    let reason = body
        .reason
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("revoked by user");
    let payload = revoke_capability_local(&state, &session.user_id, &id, reason).await?;
    Ok(Json(json!({
        "ok": true,
        "source": SOURCE_CLAWCONTROL,
        "data": payload,
    })))
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/approvals", get(list_approvals))
        .route("/approvals/requests", post(create_request))
        .route("/approvals/sweep-expired", post(sweep_expired_request))
        .route("/approvals/code/resolve", post(resolve_code_request))
        .route("/approvals/:id/approve", post(approve_request))
        .route("/approvals/:id/reject", post(reject_request))
        .route("/approvals/:id/result", post(approval_result))
        .route("/capabilities/:id/revoke", post(revoke_capability))
        .route("/capabilities/verify", post(verify_capability))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn split_source_id_defaults_to_harness() {
        assert_eq!(split_source_id("abc"), ("harness", "abc"));
        assert_eq!(
            split_source_id("agentsecrets:req_1"),
            ("agentsecrets", "req_1")
        );
    }

    #[test]
    fn normalizes_agentsecrets_operator_rows() {
        let row = json!({
            "id": "req_1",
            "status": "pending_approval",
            "created_at": "2026-05-08T00:00:00Z",
            "approval_payload": {
                "request_type": "secret_access",
                "secret_ref_masked": "bw://login/***",
                "action": "read",
                "target": "github",
                "reason": "deploy"
            }
        });

        let approval = normalize_agentsecrets_approval(row).unwrap();
        assert_eq!(approval["id"], "agentsecrets:req_1");
        assert_eq!(approval["status"], "pending");
        assert_eq!(approval["source"], "agentsecrets");
        assert_eq!(approval["tool"], "Agent Secrets: read");
        assert_eq!(approval["args"]["secret_ref"], "bw://login/***");
    }

    #[test]
    fn normalizes_harness_rows() {
        let row = json!({
            "id": "h1",
            "status": "pending",
            "tool": "exec",
            "context": "Needs shell",
            "requested_at": "2026-05-08T00:00:00Z",
            "args": { "cmd": "ls" }
        });

        let approval = normalize_harness_approval(row).unwrap();
        assert_eq!(approval["id"], "harness:h1");
        assert_eq!(approval["status"], "pending");
        assert_eq!(approval["tool"], "exec");
    }

    #[test]
    fn validates_result_statuses() {
        assert_eq!(validate_result_status("success").unwrap(), "success");
        assert_eq!(validate_result_status("failed").unwrap(), "failed");
        assert!(matches!(
            validate_result_status("maybe"),
            Err(AppError::BadRequest(message)) if message.contains("status")
        ));
    }

    #[test]
    fn split_local_result_id_accepts_prefixed_and_raw_ids() {
        assert_eq!(
            split_local_approval_id("clawcontrol:appr_123").unwrap(),
            "appr_123"
        );
        assert_eq!(split_local_approval_id("appr_123").unwrap(), "appr_123");
        assert!(matches!(
            split_local_approval_id("agentsecrets:req_1"),
            Err(AppError::BadRequest(_))
        ));
    }

    #[test]
    fn parses_structured_approval_text_commands() {
        assert_eq!(
            approval_text_command("APPROVE abc_123").unwrap(),
            (ApprovalCodeDecision::Approve, "abc_123".to_string())
        );
        assert_eq!(
            approval_text_command("deny code-456").unwrap(),
            (ApprovalCodeDecision::Deny, "code-456".to_string())
        );
        assert!(approval_text_command("approve").is_none());
        assert!(approval_text_command("approve code extra").is_none());
        assert!(approval_text_command("approve bad/code").is_none());
    }

    #[test]
    fn extracts_approval_command_text_from_webhook_payloads() {
        let payload = json!({ "data": { "message": { "text": "APPROVE abc123" } } });
        assert_eq!(
            approval_command_text_from_payload(&payload),
            Some("APPROVE abc123")
        );
    }
}
