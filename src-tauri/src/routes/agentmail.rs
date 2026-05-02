use reqwest::StatusCode;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::error::AppError;
use crate::server::AppState;

const DEFAULT_AGENTMAIL_BASE_URL: &str = "https://api.agentmail.to/v0";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct MailThread {
    pub id: String,
    pub account_id: Option<String>,
    pub subject: String,
    pub from: String,
    pub preview: String,
    pub unread: bool,
}

impl MailThread {
    pub fn draftable_account_id(&self) -> Option<String> {
        self.account_id
            .as_deref()
            .map(str::trim)
            .filter(|account_id| !account_id.is_empty())
            .map(str::to_string)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AgentMailInbox {
    pub inbox_id: String,
    pub email: Option<String>,
    pub display_name: Option<String>,
    pub client_id: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct AgentMailThread {
    #[serde(default)]
    id: Option<String>,
    #[serde(default)]
    thread_id: Option<String>,
    #[serde(default)]
    inbox_id: Option<String>,
    #[serde(default)]
    subject: Option<String>,
    #[serde(default)]
    preview: Option<String>,
    #[serde(default)]
    senders: Vec<String>,
    #[serde(default)]
    unread: Option<bool>,
}

impl AgentMailThread {
    fn into_mail_thread(self, fallback_inbox_id: &str) -> Option<MailThread> {
        let id = self.thread_id.or(self.id)?;
        let from = self
            .senders
            .first()
            .cloned()
            .unwrap_or_else(|| "Unknown".to_string());
        Some(MailThread {
            id,
            account_id: Some(
                self.inbox_id
                    .unwrap_or_else(|| fallback_inbox_id.to_string()),
            ),
            subject: self.subject.unwrap_or_else(|| "(no subject)".to_string()),
            from,
            preview: self.preview.unwrap_or_default(),
            unread: self.unread.unwrap_or(false),
        })
    }
}

fn agentmail_base_url(state: &AppState) -> String {
    state
        .secret("AGENTMAIL_URL")
        .map(|value| value.trim().trim_end_matches('/').to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| DEFAULT_AGENTMAIL_BASE_URL.to_string())
}

fn agentmail_api_key(state: &AppState) -> Option<String> {
    state
        .secret("AGENTMAIL_API_KEY")
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn thread_list_url(base_url: &str, inbox_id: &str, limit: usize) -> String {
    format!(
        "{}/inboxes/{}/threads?limit={}",
        base_url,
        urlencoding::encode(inbox_id),
        limit
    )
}

fn inbox_create_url(base_url: &str) -> String {
    format!("{base_url}/inboxes")
}

fn parse_threads(value: Value, inbox_id: &str) -> Result<Vec<MailThread>, AppError> {
    let raw_threads = if let Some(threads) = value.get("threads") {
        threads.clone()
    } else {
        value
    };
    let threads = serde_json::from_value::<Vec<AgentMailThread>>(raw_threads).map_err(|e| {
        AppError::Internal(anyhow::anyhow!("failed to parse AgentMail threads: {e}"))
    })?;

    Ok(threads
        .into_iter()
        .filter_map(|thread| thread.into_mail_thread(inbox_id))
        .collect())
}

fn agentmail_upstream_status_error(status: StatusCode) -> AppError {
    AppError::Internal(anyhow::anyhow!(
        "AgentMail returned HTTP {}",
        status.as_u16()
    ))
}

pub async fn list_threads_for_account(
    state: &AppState,
    inbox_id: &str,
    limit: usize,
) -> Result<Option<Vec<MailThread>>, AppError> {
    let Some(api_key) = agentmail_api_key(state) else {
        return Ok(None);
    };

    let base_url = agentmail_base_url(state);
    let url = thread_list_url(&base_url, inbox_id, limit);
    let response = state
        .http
        .get(&url)
        .bearer_auth(api_key)
        .timeout(std::time::Duration::from_secs(15))
        .send()
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("AgentMail request failed: {e}")))?;

    if !response.status().is_success() {
        return Err(agentmail_upstream_status_error(response.status()));
    }

    let value = response
        .json::<Value>()
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("AgentMail response parse failed: {e}")))?;

    parse_threads(value, inbox_id).map(Some)
}

pub async fn create_inbox(
    state: &AppState,
    username: Option<&str>,
    display_name: Option<&str>,
    client_id: Option<&str>,
) -> Result<Option<AgentMailInbox>, AppError> {
    let Some(api_key) = agentmail_api_key(state) else {
        return Ok(None);
    };

    let mut body = serde_json::Map::new();
    if let Some(username) = username.map(str::trim).filter(|value| !value.is_empty()) {
        body.insert("username".into(), Value::String(username.to_string()));
    }
    if let Some(display_name) = display_name
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        body.insert(
            "display_name".into(),
            Value::String(display_name.to_string()),
        );
    }
    if let Some(client_id) = client_id.map(str::trim).filter(|value| !value.is_empty()) {
        body.insert("client_id".into(), Value::String(client_id.to_string()));
    }

    let response = state
        .http
        .post(inbox_create_url(&agentmail_base_url(state)))
        .bearer_auth(api_key)
        .json(&Value::Object(body))
        .timeout(std::time::Duration::from_secs(15))
        .send()
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("AgentMail request failed: {e}")))?;

    if !response.status().is_success() {
        return Err(agentmail_upstream_status_error(response.status()));
    }

    response
        .json::<AgentMailInbox>()
        .await
        .map(Some)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("AgentMail response parse failed: {e}")))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn classifies_agentmail_upstream_status_as_internal() {
        let err = agentmail_upstream_status_error(StatusCode::BAD_GATEWAY);
        assert!(matches!(err, AppError::Internal(_)));
        assert!(format!("{err:?}").contains("AgentMail returned HTTP 502"));
    }

    #[test]
    fn parses_wrapped_threads_payload() {
        let value = json!({
            "threads": [
                {
                    "id": "thr_1",
                    "account_id": "acct_1",
                    "subject": "Hello",
                    "from": "sender@example.com",
                    "preview": "Preview",
                    "unread": true
                }
            ]
        });

        let threads = parse_threads(value, "acct_1").unwrap();
        assert_eq!(threads.len(), 1);
        assert_eq!(threads[0].id, "thr_1");
        assert_eq!(threads[0].draftable_account_id(), Some("acct_1".into()));
    }

    #[test]
    fn parses_bare_threads_payload() {
        let value = json!([
            {
                "id": "thr_2",
                "account_id": null,
                "subject": "Hello",
                "from": "sender@example.com",
                "preview": "Preview",
                "unread": false
            }
        ]);

        let threads = parse_threads(value, "am_fallback").unwrap();
        assert_eq!(threads.len(), 1);
        assert_eq!(threads[0].id, "thr_2");
        assert_eq!(
            threads[0].draftable_account_id(),
            Some("am_fallback".into())
        );
    }

    #[test]
    fn parses_current_agentmail_threads_payload() {
        let value = json!({
            "threads": [
                {
                    "inbox_id": "josue@agentmail.to",
                    "thread_id": "thread_1",
                    "senders": ["sender@example.com"],
                    "subject": "Hello",
                    "preview": "Preview"
                }
            ]
        });

        let threads = parse_threads(value, "josue@agentmail.to").unwrap();
        assert_eq!(threads[0].id, "thread_1");
        assert_eq!(threads[0].account_id, Some("josue@agentmail.to".into()));
        assert_eq!(threads[0].from, "sender@example.com");
    }

    #[test]
    fn builds_current_agentmail_thread_list_url() {
        let url = thread_list_url("https://api.agentmail.to/v0", "inbox@example.com", 20);
        assert_eq!(
            url,
            "https://api.agentmail.to/v0/inboxes/inbox%40example.com/threads?limit=20"
        );
    }
}
