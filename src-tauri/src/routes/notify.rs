use axum::{extract::State, routing::post, Json, Router};
use serde::Deserialize;
use serde_json::{json, Value};
use tracing::error;

use crate::error::AppError;
use crate::server::AppState;

// ── Router ───────────────────────────────────────────────────────────────────

pub fn router() -> Router<AppState> {
    Router::new().route("/notify", post(send_notification))
}

// ── POST /notify ─────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct NotifyBody {
    title: Option<String>,
    message: Option<String>,
    priority: Option<i32>,
    tags: Option<Vec<String>>,
}

async fn send_notification(
    State(state): State<AppState>,
    Json(body): Json<NotifyBody>,
) -> Result<Json<Value>, AppError> {
    let title = body
        .title
        .as_deref()
        .ok_or_else(|| AppError::BadRequest("title and message required".into()))?;
    let message = body
        .message
        .as_deref()
        .ok_or_else(|| AppError::BadRequest("title and message required".into()))?;

    if title.is_empty() || message.is_empty() {
        return Err(AppError::BadRequest(
            "title and message required".into(),
        ));
    }

    let url = std::env::var("NTFY_URL").unwrap_or_else(|_| "http://localhost:2586".into());
    let topic =
        std::env::var("NTFY_TOPIC").unwrap_or_else(|_| "mission-control".into());

    // SSRF protection: block cloud metadata and sensitive internal endpoints
    let full_url = format!("{url}/{topic}");
    match reqwest::Url::parse(&full_url) {
        Ok(parsed) => {
            let scheme = parsed.scheme();
            if scheme != "http" && scheme != "https" {
                return Err(AppError::BadRequest("Invalid ntfy URL protocol".into()));
            }

            let host = parsed.host_str().unwrap_or("");
            let blocked_hosts = [
                "169.254.169.254",
                "metadata.google.internal",
                "100.100.100.200",
                "fd00:ec2::254",
            ];

            if blocked_hosts.contains(&host)
                || host.ends_with(".internal")
                || host.starts_with("fe80:")
                || (host == "[::1]" && parsed.port() == Some(80))
            {
                return Err(AppError::BadRequest("Invalid ntfy URL".into()));
            }
        }
        Err(_) => {
            return Err(AppError::BadRequest("Invalid ntfy URL".into()));
        }
    }

    let priority = body.priority.unwrap_or(3);

    let mut req = state
        .http
        .post(&full_url)
        .header("Title", title)
        .header("Priority", priority.to_string())
        .header("Content-Type", "text/plain");

    if let Some(ref tags) = body.tags {
        if !tags.is_empty() {
            req = req.header("Tags", tags.join(","));
        }
    }

    let res = req.body(message.to_string()).send().await;

    match res {
        Ok(resp) if resp.status().is_success() => Ok(Json(json!({ "ok": true }))),
        Ok(resp) => {
            let status = resp.status();
            let body_text = resp.text().await.unwrap_or_default();
            error!("[notify] ntfy error: {status} {body_text}");
            Err(AppError::Internal(anyhow::anyhow!(
                "Notification delivery failed"
            )))
        }
        Err(e) => {
            error!("[notify] ntfy request failed: {e:#}");
            Err(AppError::Internal(anyhow::anyhow!(
                "Notification delivery failed"
            )))
        }
    }
}
