use axum::{extract::State, routing::post, Json, Router};
use serde::Deserialize;
use serde_json::{json, Value};
use std::net::IpAddr;
use tracing::error;

use crate::error::AppError;
use crate::server::{AppState, RequireAuth};

// ── SSRF protection ──────────────────────────────────────────────────────────

/// Returns `true` if the given IP address is private, loopback, link-local,
/// or otherwise belongs to a reserved/internal range that should not be
/// reachable from user-supplied URLs.
fn is_private_or_loopback(ip: &IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => {
            v4.is_loopback()             // 127.0.0.0/8
            || v4.is_private()           // 10/8, 172.16/12, 192.168/16
            || v4.is_link_local()        // 169.254.0.0/16 (incl. AWS metadata)
            || v4.is_broadcast()         // 255.255.255.255
            || v4.is_unspecified()       // 0.0.0.0
            || v4.octets()[0] == 100 && v4.octets()[1] >= 64 && v4.octets()[1] <= 127 // CGNAT 100.64/10 (Tailscale)
            || v4.is_multicast()         // 224.0.0.0/4
            || v4.octets() == [192, 0, 0, 0] || (v4.octets()[0] == 192 && v4.octets()[1] == 0 && v4.octets()[2] == 0) // 192.0.0.0/24
            || (v4.octets()[0] == 192 && v4.octets()[1] == 0 && v4.octets()[2] == 2)   // 192.0.2.0/24 TEST-NET-1
            || (v4.octets()[0] == 198 && v4.octets()[1] == 51 && v4.octets()[2] == 100) // 198.51.100.0/24 TEST-NET-2
            || (v4.octets()[0] == 203 && v4.octets()[1] == 0 && v4.octets()[2] == 113)  // 203.0.113.0/24 TEST-NET-3
        }
        IpAddr::V6(v6) => {
            v6.is_loopback()             // ::1
            || v6.is_unspecified()       // ::
            || v6.is_multicast()         // ff00::/8
            // Link-local fe80::/10
            || (v6.segments()[0] & 0xffc0) == 0xfe80
            // Unique local fc00::/7
            || (v6.segments()[0] & 0xfe00) == 0xfc00
            // IPv4-mapped ::ffff:0:0/96 — check the embedded v4 address
            || v6.to_ipv4_mapped().is_some_and(|v4| is_private_or_loopback(&IpAddr::V4(v4)))
        }
    }
}

// ── Router ───────────────────────────────────────────────────────────────────

/// Build the notify router (send push notifications via ntfy).
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
    RequireAuth(_session): RequireAuth,
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

    // CRLF injection protection: reject control characters in header-bound values
    fn contains_header_injection(s: &str) -> bool {
        s.contains('\r') || s.contains('\n') || s.contains('\0')
    }

    if contains_header_injection(title) || contains_header_injection(message) {
        return Err(AppError::BadRequest(
            "title/message must not contain control characters".into(),
        ));
    }

    if let Some(ref tags) = body.tags {
        for tag in tags {
            if contains_header_injection(tag) {
                return Err(AppError::BadRequest(
                    "tags must not contain control characters".into(),
                ));
            }
        }
    }

    let url = state.secret("NTFY_URL")
        .ok_or_else(|| AppError::BadRequest("NTFY_URL not configured".into()))?;
    let topic = state.secret("NTFY_TOPIC")
        .unwrap_or_else(|| "mission-control".into());

    // SSRF protection: comprehensive private/loopback/reserved IP check
    let full_url = format!("{url}/{topic}");
    let parsed = reqwest::Url::parse(&full_url)
        .map_err(|_| AppError::BadRequest("Invalid ntfy URL".into()))?;

    let scheme = parsed.scheme();
    if scheme != "http" && scheme != "https" {
        return Err(AppError::BadRequest("Invalid ntfy URL protocol".into()));
    }

    let host = parsed.host_str().unwrap_or("");
    if host.is_empty() {
        return Err(AppError::BadRequest("Invalid ntfy URL: no host".into()));
    }

    // Block well-known metadata hostnames
    if host.ends_with(".internal") || host.ends_with(".local") || host == "metadata.google.internal" {
        return Err(AppError::BadRequest("Invalid ntfy URL".into()));
    }

    // Check parsed URL host against private/loopback ranges
    if let Some(url_host) = parsed.host() {
        match url_host {
            url::Host::Ipv4(ip) => {
                if is_private_or_loopback(&IpAddr::V4(ip)) {
                    return Err(AppError::BadRequest("Invalid ntfy URL: private IP".into()));
                }
            }
            url::Host::Ipv6(ip) => {
                if is_private_or_loopback(&IpAddr::V6(ip)) {
                    return Err(AppError::BadRequest("Invalid ntfy URL: private IP".into()));
                }
            }
            url::Host::Domain(_) => {
                // DNS resolution check: resolve the hostname and verify no resolved IP is private
                let port = parsed.port().unwrap_or(if scheme == "https" { 443 } else { 80 });
                let addr = format!("{}:{}", host, port);
                let resolved: Vec<std::net::SocketAddr> = match tokio::net::lookup_host(&addr).await {
                    Ok(addrs) => addrs.collect(),
                    Err(_) => {
                        return Err(AppError::BadRequest("Invalid ntfy URL: DNS resolution failed".into()));
                    }
                };
                if resolved.is_empty() {
                    return Err(AppError::BadRequest("Invalid ntfy URL: DNS resolution failed".into()));
                }
                for socket_addr in &resolved {
                    if is_private_or_loopback(&socket_addr.ip()) {
                        return Err(AppError::BadRequest("Invalid ntfy URL: resolves to private IP".into()));
                    }
                }
            }
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
