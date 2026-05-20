use axum::Json;
use reqwest::header::{HeaderMap, HeaderValue};
use serde::Serialize;
use serde_json::{json, Value};

use crate::error::AppError;
use crate::server::AppState;

#[derive(Debug, Clone, Serialize)]
pub struct AgentSecretsHealth {
    pub ok: bool,
    pub status: String,
    pub message: Option<String>,
    pub error: Option<String>,
}

pub fn secret_broker_base_url(state: &AppState) -> Option<String> {
    state
        .secret("AGENTSECRETS_URL")
        .and_then(|value| normalize_secret_broker_base_url(&value))
}

pub(crate) fn normalize_secret_broker_base_url(value: &str) -> Option<String> {
    let trimmed = value.trim().trim_end_matches('/');
    let is_http = trimmed.starts_with("http://") || trimmed.starts_with("https://");
    if !is_http || trimmed.is_empty() {
        return None;
    }

    Some(trimmed.to_string())
}

pub(crate) fn secret_broker_client_key(state: &AppState) -> Option<String> {
    state
        .secret("AGENTSECRETS_CLIENT_API_KEY")
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn url_host_is_private(host: &str) -> bool {
    let host = host.trim_matches(['[', ']']).to_ascii_lowercase();
    if host == "localhost"
        || host.ends_with(".local")
        || host.ends_with(".lan")
        || host.ends_with(".internal")
        || host.ends_with(".ts.net")
        || !host.contains('.')
    {
        return true;
    }

    if let Ok(ip) = host.parse::<std::net::IpAddr>() {
        return match ip {
            std::net::IpAddr::V4(ip) => {
                ip.is_loopback()
                    || ip.is_private()
                    || ip.is_link_local()
                    || (ip.octets()[0] == 100 && (64..=127).contains(&ip.octets()[1]))
            }
            std::net::IpAddr::V6(ip) => ip.is_loopback(),
        };
    }

    false
}

fn transport_policy_error(base_url: &str) -> Option<&'static str> {
    let parsed = match url::Url::parse(base_url) {
        Ok(parsed) => parsed,
        Err(_) => return Some("Agent Secrets URL is invalid."),
    };

    match parsed.scheme() {
        "https" => None,
        "http" => {
            let Some(host) = parsed.host_str() else {
                return Some("Agent Secrets URL is missing a host.");
            };
            if url_host_is_private(host) {
                None
            } else {
                Some("Agent Secrets over plain HTTP must stay on loopback, LAN, or Tailscale/private addresses. Use HTTPS for public hosts.")
            }
        }
        _ => Some("Agent Secrets URL must use http:// or https://."),
    }
}

pub(crate) fn validate_secret_broker_transport(base_url: &str) -> Result<(), AppError> {
    if let Some(message) = transport_policy_error(base_url) {
        return Err(AppError::BadRequest(message.into()));
    }
    Ok(())
}

pub(crate) fn broker_headers(state: &AppState) -> Result<HeaderMap, AppError> {
    let client_key = secret_broker_client_key(state).ok_or_else(|| {
        AppError::BadRequest(
            "Agent Secrets client key is not configured. Set AGENTSECRETS_CLIENT_API_KEY on the backend."
                .into(),
        )
    })?;

    let mut headers = HeaderMap::new();
    let auth_value = HeaderValue::from_str(&format!("Bearer {client_key}"))
        .map_err(|e| AppError::Internal(anyhow::anyhow!("invalid Agent Secrets API key: {e}")))?;
    headers.insert(reqwest::header::AUTHORIZATION, auth_value);
    let api_key_value = HeaderValue::from_str(&client_key)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("invalid Agent Secrets API key: {e}")))?;
    headers.insert("x-api-key", api_key_value);
    Ok(headers)
}

pub async fn health_status(state: &AppState) -> AgentSecretsHealth {
    let Some(base) = secret_broker_base_url(state) else {
        return AgentSecretsHealth {
            ok: false,
            status: "not_configured".into(),
            message: Some(
                "Set Agent Secrets URL to a private hosted endpoint or a working local tunnel."
                    .into(),
            ),
            error: None,
        };
    };

    if let Some(message) = transport_policy_error(&base) {
        return AgentSecretsHealth {
            ok: false,
            status: "insecure_url".into(),
            message: Some(message.into()),
            error: None,
        };
    }

    let headers = match broker_headers(state) {
        Ok(headers) => headers,
        Err(_) => {
            return AgentSecretsHealth {
                ok: false,
                status: "auth_missing".into(),
                message: Some("Set Agent Secrets client API key before using the broker.".into()),
                error: None,
            };
        }
    };

    let url = format!("{}/healthz", base.trim_end_matches('/'));
    let req = state
        .http
        .get(&url)
        .headers(headers)
        .timeout(std::time::Duration::from_secs(5));

    match req.send().await {
        Ok(resp) if resp.status().is_success() => AgentSecretsHealth {
            ok: true,
            status: "connected".into(),
            message: Some("Agent Secrets is reachable with the configured client key.".into()),
            error: None,
        },
        Ok(resp) if resp.status().as_u16() == 401 || resp.status().as_u16() == 403 => {
            AgentSecretsHealth {
                ok: false,
                status: "auth_invalid".into(),
                message: Some("Agent Secrets rejected the configured client key.".into()),
                error: Some(format!("HTTP {}", resp.status().as_u16())),
            }
        }
        Ok(resp) => AgentSecretsHealth {
            ok: false,
            status: "error".into(),
            message: None,
            error: Some(format!("HTTP {}", resp.status().as_u16())),
        },
        Err(err) => AgentSecretsHealth {
            ok: false,
            status: "unreachable".into(),
            message: Some(
                "Agent Secrets is configured but not reachable from this machine.".into(),
            ),
            error: Some(if err.is_timeout() {
                "timed out".into()
            } else {
                "connection failed".into()
            }),
        },
    }
}

pub async fn health(state: &AppState) -> Result<Json<Value>, AppError> {
    let health = health_status(state).await;
    Ok(Json(json!(health)))
}

pub async fn proxy_json<T: Serialize>(
    state: &AppState,
    method: reqwest::Method,
    path: &str,
    payload: &T,
) -> Result<Json<Value>, AppError> {
    let Some(base) = secret_broker_base_url(state) else {
        return Err(AppError::BadRequest(
            "Agent Secrets is not configured. Set AGENTSECRETS_URL on the backend.".into(),
        ));
    };
    validate_secret_broker_transport(&base)?;
    let headers = broker_headers(state)?;

    let url = format!("{}{}", base.trim_end_matches('/'), path);
    let resp = state
        .http
        .request(method, &url)
        .headers(headers)
        .json(payload)
        .timeout(std::time::Duration::from_secs(30))
        .send()
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Agent Secrets request failed: {e}")))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(AppError::BadRequest(format!(
            "Agent Secrets returned HTTP {}: {}",
            status.as_u16(),
            body
        )));
    }

    let value = resp.json::<Value>().await.map_err(|e| {
        AppError::Internal(anyhow::anyhow!("Agent Secrets response parse failed: {e}"))
    })?;

    Ok(Json(value))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_secret_broker_base_url() {
        assert_eq!(
            normalize_secret_broker_base_url(" http://100.104.154.24:4815/ "),
            Some("http://100.104.154.24:4815".into())
        );
        assert_eq!(normalize_secret_broker_base_url("ftp://example.com"), None);
    }

    #[test]
    fn allows_private_http_agentsecrets_urls() {
        assert!(transport_policy_error("http://127.0.0.1:4815").is_none());
        assert!(transport_policy_error("http://192.168.1.20:4815").is_none());
        assert!(transport_policy_error("http://100.104.154.24:4815").is_none());
        assert!(transport_policy_error("http://agent-vm:4815").is_none());
    }

    #[test]
    fn rejects_public_plain_http_agentsecrets_urls() {
        assert!(transport_policy_error("http://example.com:4815").is_some());
        assert!(transport_policy_error("https://example.com:4815").is_none());
    }
}
