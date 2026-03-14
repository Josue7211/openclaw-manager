use reqwest::Client;
use serde_json::Value;
use std::fmt;
use std::time::Duration;

// ---------------------------------------------------------------------------
// ServiceError
// ---------------------------------------------------------------------------

/// Unified error type for external service calls.
#[derive(Debug)]
pub enum ServiceError {
    /// The service could not be reached (DNS failure, connection refused, etc.).
    Unreachable(String),
    /// The request timed out.
    Timeout,
    /// The service returned a 5xx status code.
    ServerError(u16, String),
    /// The response body could not be parsed as JSON.
    ParseError(String),
}

impl fmt::Display for ServiceError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ServiceError::Unreachable(msg) => write!(f, "service unreachable: {}", msg),
            ServiceError::Timeout => write!(f, "request timed out"),
            ServiceError::ServerError(status, body) => {
                write!(f, "server error ({}): {}", status, body)
            }
            ServiceError::ParseError(msg) => write!(f, "parse error: {}", msg),
        }
    }
}

impl std::error::Error for ServiceError {}

// ---------------------------------------------------------------------------
// ServiceClient
// ---------------------------------------------------------------------------

/// A lightweight wrapper around `reqwest::Client` for calling external HTTP
/// services with consistent timeout, retry (1 retry on 5xx), and logging.
#[derive(Clone, Debug)]
pub struct ServiceClient {
    http: Client,
    name: String,
    base_url: String,
    timeout: Duration,
}

impl ServiceClient {
    /// Create a new service client.
    ///
    /// - `name`: human-readable label used in log messages (e.g. "BlueBubbles").
    /// - `base_url`: scheme + host, no trailing slash (e.g. "http://192.168.1.50:1234").
    /// - `timeout_secs`: per-request timeout in seconds.
    pub fn new(name: &str, base_url: &str, timeout_secs: u64) -> Self {
        let http = Client::builder()
            .timeout(Duration::from_secs(timeout_secs))
            .build()
            .unwrap_or_else(|_| Client::new());

        Self {
            http,
            name: name.to_string(),
            base_url: base_url.trim_end_matches('/').to_string(),
            timeout: Duration::from_secs(timeout_secs),
        }
    }

    /// The service name (for logging / diagnostics).
    pub fn name(&self) -> &str {
        &self.name
    }

    /// The base URL this client targets.
    pub fn base_url(&self) -> &str {
        &self.base_url
    }

    /// Configured per-request timeout.
    pub fn timeout(&self) -> Duration {
        self.timeout
    }

    /// Send a GET request to `{base_url}{path}`.
    ///
    /// Retries once on 5xx responses.
    pub async fn get(&self, path: &str) -> Result<Value, ServiceError> {
        let url = format!("{}{}", self.base_url, path);
        self.execute_with_retry(|| self.http.get(&url)).await
    }

    /// Send a POST request with a JSON body to `{base_url}{path}`.
    ///
    /// Retries once on 5xx responses.
    pub async fn post(&self, path: &str, body: Value) -> Result<Value, ServiceError> {
        let url = format!("{}{}", self.base_url, path);
        self.execute_with_retry(|| {
            self.http
                .post(&url)
                .header("Content-Type", "application/json")
                .json(&body)
        })
        .await
    }

    /// Quick reachability check — sends a GET to the base URL and returns
    /// `true` if any non-timeout response is received (even 4xx/5xx).
    pub async fn is_healthy(&self) -> bool {
        match self.http.get(&self.base_url).send().await {
            Ok(_) => true,
            Err(e) if e.is_timeout() => false,
            Err(_) => false,
        }
    }

    // ── Internal ────────────────────────────────────────────────────────

    /// Execute the request, retrying once on 5xx.
    async fn execute_with_retry<F>(&self, build: F) -> Result<Value, ServiceError>
    where
        F: Fn() -> reqwest::RequestBuilder,
    {
        let result = self.execute_once(&build).await;

        // Retry once on server errors (5xx)
        match &result {
            Err(ServiceError::ServerError(..)) => {
                tracing::warn!("[{}] 5xx received, retrying once", self.name);
                self.execute_once(&build).await
            }
            _ => result,
        }
    }

    /// Execute a single request attempt.
    async fn execute_once<F>(&self, build: &F) -> Result<Value, ServiceError>
    where
        F: Fn() -> reqwest::RequestBuilder,
    {
        let resp = build().send().await.map_err(|e| {
            if e.is_timeout() {
                tracing::warn!("[{}] request timed out", self.name);
                ServiceError::Timeout
            } else {
                tracing::error!("[{}] request failed: {}", self.name, e);
                ServiceError::Unreachable(e.to_string())
            }
        })?;

        let status = resp.status().as_u16();

        if status >= 500 {
            let body = resp.text().await.unwrap_or_default();
            tracing::error!("[{}] server error {}: {}", self.name, status, body);
            return Err(ServiceError::ServerError(status, body));
        }

        // For non-5xx errors (4xx), we still parse and return the body as JSON
        // so the caller can inspect it. This matches the existing bb_fetch pattern
        // where the caller decides how to handle non-success responses.
        resp.json::<Value>().await.map_err(|e| {
            tracing::error!("[{}] failed to parse response JSON: {}", self.name, e);
            ServiceError::ParseError(e.to_string())
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_strips_trailing_slash() {
        let client = ServiceClient::new("test", "http://localhost:8080/", 10);
        assert_eq!(client.base_url(), "http://localhost:8080");
    }

    #[test]
    fn new_preserves_clean_url() {
        let client = ServiceClient::new("test", "http://localhost:8080", 10);
        assert_eq!(client.base_url(), "http://localhost:8080");
    }

    #[test]
    fn name_matches() {
        let client = ServiceClient::new("BlueBubbles", "http://bb.local", 30);
        assert_eq!(client.name(), "BlueBubbles");
    }

    #[test]
    fn timeout_matches() {
        let client = ServiceClient::new("test", "http://localhost", 42);
        assert_eq!(client.timeout(), Duration::from_secs(42));
    }

    #[test]
    fn display_service_error_variants() {
        let e1 = ServiceError::Unreachable("conn refused".into());
        assert!(e1.to_string().contains("unreachable"));

        let e2 = ServiceError::Timeout;
        assert!(e2.to_string().contains("timed out"));

        let e3 = ServiceError::ServerError(502, "bad gateway".into());
        assert!(e3.to_string().contains("502"));

        let e4 = ServiceError::ParseError("expected value".into());
        assert!(e4.to_string().contains("parse error"));
    }
}
