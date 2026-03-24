use anyhow::{anyhow, Context};
use reqwest::{Client, StatusCode};
use serde_json::Value;
use tracing::warn;

/// Truncate a string to at most `max_chars` characters without panicking on
/// multi-byte UTF-8 boundaries. Returns the full string if it's shorter.
pub fn safe_truncate(s: &str, max_chars: usize) -> &str {
    if s.len() <= max_chars {
        return s;
    }
    match s.char_indices().nth(max_chars) {
        Some((idx, _)) => &s[..idx],
        None => s,
    }
}

/// Lightweight REST client for Supabase PostgREST / RPC endpoints.
///
/// Reads `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from environment.
/// Every request carries the `apikey` header and a `Bearer` Authorization header
/// so it operates with service-role privileges (same as the Node.js `supabaseAdmin`).
#[derive(Clone, Debug)]
pub struct SupabaseClient {
    http: Client,
    url: String,
    service_key: String,
}

impl SupabaseClient {
    /// Build a client from explicit URL and service key.
    /// Use this when constructing a client outside of request handlers
    /// (e.g. in the sync engine background task).
    pub fn new(url: &str, service_key: &str) -> Self {
        Self {
            http: Client::new(),
            url: url.trim_end_matches('/').to_string(),
            service_key: service_key.to_string(),
        }
    }

    /// Build a client from AppState secrets (preferred).
    pub fn from_state(state: &crate::server::AppState) -> anyhow::Result<Self> {
        let url = state.secret("SUPABASE_URL")
            .context("SUPABASE_URL not set")?
            .trim_end_matches('/')
            .to_string();
        let service_key = state.secret("SUPABASE_SERVICE_ROLE_KEY")
            .context("SUPABASE_SERVICE_ROLE_KEY not set")?;

        Ok(Self {
            http: Client::new(),
            url,
            service_key,
        })
    }

    /// Build a client from environment variables (test-only).
    #[cfg(test)]
    pub fn from_env() -> anyhow::Result<Self> {
        let url = std::env::var("SUPABASE_URL")
            .context("SUPABASE_URL not set")?
            .trim_end_matches('/')
            .to_string();
        let service_key = std::env::var("SUPABASE_SERVICE_ROLE_KEY")
            .context("SUPABASE_SERVICE_ROLE_KEY not set")?;

        Ok(Self {
            http: Client::new(),
            url,
            service_key,
        })
    }

    /// Build a client with an existing `reqwest::Client` (test-only).
    #[cfg(test)]
    pub fn with_client(http: Client) -> anyhow::Result<Self> {
        let url = std::env::var("SUPABASE_URL")
            .context("SUPABASE_URL not set")?
            .trim_end_matches('/')
            .to_string();
        let service_key = std::env::var("SUPABASE_SERVICE_ROLE_KEY")
            .context("SUPABASE_SERVICE_ROLE_KEY not set")?;

        Ok(Self {
            http,
            url,
            service_key,
        })
    }

    // ── Internal helpers ─────────────────────────────────────────────────

    fn rest_url(&self, table: &str) -> String {
        format!("{}/rest/v1/{}", self.url, table)
    }

    #[allow(dead_code)] // used only by rpc() which is itself reserved for future Postgres function calls
    fn rpc_url(&self, function: &str) -> String {
        format!("{}/rest/v1/rpc/{}", self.url, function)
    }

    fn auth_headers(
        &self,
        builder: reqwest::RequestBuilder,
    ) -> reqwest::RequestBuilder {
        builder
            .header("apikey", &self.service_key)
            .header("Authorization", format!("Bearer {}", self.service_key))
    }

    /// Like `auth_headers` but uses the caller's JWT instead of the service role key.
    /// The `apikey` header still carries the service key (required by PostgREST to
    /// identify the project), while the `Authorization` header carries the user JWT so
    /// that RLS policies see the authenticated user's `auth.uid()`.
    fn auth_headers_as_user(
        &self,
        builder: reqwest::RequestBuilder,
        jwt: &str,
    ) -> reqwest::RequestBuilder {
        builder
            .header("apikey", &self.service_key)
            .header("Authorization", format!("Bearer {}", jwt))
    }

    // ── Public API ───────────────────────────────────────────────────────

    /// `GET /rest/v1/{table}?{query}`
    ///
    /// `query` is the raw PostgREST query string, e.g.
    /// `"select=*&id=eq.some-uuid&limit=1"`.
    pub async fn select(&self, table: &str, query: &str) -> anyhow::Result<Value> {
        let url = format!("{}?{}", self.rest_url(table), query);
        let resp = self
            .auth_headers(self.http.get(&url))
            .header("Accept", "application/json")
            .send()
            .await
            .context("supabase select request failed")?;

        let status = resp.status();
        if !status.is_success() {
            let body = resp.text().await.unwrap_or_default();
            let truncated = safe_truncate(&body, 200);
            warn!("supabase select {table} returned {status}: {truncated}");
            return Err(anyhow!("supabase select {table}: {status} — {truncated}"));
        }

        resp.json::<Value>()
            .await
            .context("supabase select: failed to parse JSON")
    }

    /// Convenience: select a single row. Returns the object (not an array).
    /// Adds `limit=1` and the PostgREST `Accept: application/vnd.pgrst.object+json`
    /// header so the response is a single JSON object (or 406 if zero rows).
    pub async fn select_single(&self, table: &str, query: &str) -> anyhow::Result<Value> {
        let sep = if query.is_empty() { "" } else { "&" };
        let url = format!("{}?{}{sep}limit=1", self.rest_url(table), query);
        let resp = self
            .auth_headers(self.http.get(&url))
            .header("Accept", "application/vnd.pgrst.object+json")
            .send()
            .await
            .context("supabase select_single request failed")?;

        let status = resp.status();
        if !status.is_success() {
            let body = resp.text().await.unwrap_or_default();
            let truncated = safe_truncate(&body, 200);
            warn!("supabase select_single {table} returned {status}: {truncated}");
            return Err(anyhow!("supabase select_single {table}: {status} — {truncated}"));
        }

        resp.json::<Value>()
            .await
            .context("supabase select_single: failed to parse JSON")
    }

    /// `POST /rest/v1/{table}` — insert one or more rows.
    ///
    /// Returns the inserted rows when using `Prefer: return=representation`.
    pub async fn insert(&self, table: &str, body: Value) -> anyhow::Result<Value> {
        let resp = self
            .auth_headers(self.http.post(&self.rest_url(table)))
            .header("Content-Type", "application/json")
            .header("Prefer", "return=representation")
            .json(&body)
            .send()
            .await
            .context("supabase insert request failed")?;

        let status = resp.status();
        if !status.is_success() {
            let body_text = resp.text().await.unwrap_or_default();
            let truncated = safe_truncate(&body_text, 200);
            warn!("supabase insert {table} returned {status}: {truncated}");
            return Err(anyhow!("supabase insert {table}: {status} — {truncated}"));
        }

        resp.json::<Value>()
            .await
            .context("supabase insert: failed to parse JSON")
    }

    /// `POST /rest/v1/{table}` with `Prefer: resolution=merge-duplicates` — upsert rows.
    ///
    /// On conflict with the primary key, updates the existing row.
    pub async fn upsert(&self, table: &str, body: Value) -> anyhow::Result<Value> {
        let resp = self
            .auth_headers(self.http.post(&self.rest_url(table)))
            .header("Content-Type", "application/json")
            .header("Prefer", "return=representation,resolution=merge-duplicates")
            .json(&body)
            .send()
            .await
            .context("supabase upsert request failed")?;

        let status = resp.status();
        if !status.is_success() {
            let body_text = resp.text().await.unwrap_or_default();
            let truncated = safe_truncate(&body_text, 200);
            warn!("supabase upsert {table} returned {status}: {truncated}");
            return Err(anyhow!("supabase upsert {table}: {status} — {truncated}"));
        }

        resp.json::<Value>()
            .await
            .context("supabase upsert: failed to parse JSON")
    }

    /// `PATCH /rest/v1/{table}?{query}` — update matching rows.
    ///
    /// Returns updated rows.
    pub async fn update(&self, table: &str, query: &str, body: Value) -> anyhow::Result<Value> {
        let url = format!("{}?{}", self.rest_url(table), query);
        let resp = self
            .auth_headers(self.http.patch(&url))
            .header("Content-Type", "application/json")
            .header("Prefer", "return=representation")
            .json(&body)
            .send()
            .await
            .context("supabase update request failed")?;

        let status = resp.status();
        if !status.is_success() {
            let body_text = resp.text().await.unwrap_or_default();
            let truncated = safe_truncate(&body_text, 200);
            warn!("supabase update {table} returned {status}: {truncated}");
            return Err(anyhow!("supabase update {table}: {status} — {truncated}"));
        }

        resp.json::<Value>()
            .await
            .context("supabase update: failed to parse JSON")
    }

    /// `DELETE /rest/v1/{table}?{query}` — delete matching rows.
    pub async fn delete(&self, table: &str, query: &str) -> anyhow::Result<()> {
        let url = format!("{}?{}", self.rest_url(table), query);
        let resp = self
            .auth_headers(self.http.delete(&url))
            .send()
            .await
            .context("supabase delete request failed")?;

        let status = resp.status();
        if !status.is_success() {
            let body_text = resp.text().await.unwrap_or_default();
            let truncated = safe_truncate(&body_text, 200);
            warn!("supabase delete {table} returned {status}: {truncated}");
            return Err(anyhow!("supabase delete {table}: {status} — {truncated}"));
        }

        Ok(())
    }

    // ── User-JWT variants (RLS-aware) ────────────────────────────────────

    /// Like `select` but authenticates as the user identified by `jwt`.
    /// RLS policies will see `auth.uid()` set to the user's ID.
    pub async fn select_as_user(&self, table: &str, query: &str, jwt: &str) -> anyhow::Result<Value> {
        let url = format!("{}?{}", self.rest_url(table), query);
        let resp = self
            .auth_headers_as_user(self.http.get(&url), jwt)
            .header("Accept", "application/json")
            .send()
            .await
            .context("supabase select_as_user request failed")?;

        let status = resp.status();
        if !status.is_success() {
            let body = resp.text().await.unwrap_or_default();
            let truncated = safe_truncate(&body, 200);
            warn!("supabase select_as_user {table} returned {status}: {truncated}");
            return Err(anyhow!("supabase select_as_user {table}: {status} — {truncated}"));
        }

        resp.json::<Value>()
            .await
            .context("supabase select_as_user: failed to parse JSON")
    }

    /// Like `select_single` but authenticates as the user identified by `jwt`.
    pub async fn select_single_as_user(&self, table: &str, query: &str, jwt: &str) -> anyhow::Result<Value> {
        let sep = if query.is_empty() { "" } else { "&" };
        let url = format!("{}?{}{sep}limit=1", self.rest_url(table), query);
        let resp = self
            .auth_headers_as_user(self.http.get(&url), jwt)
            .header("Accept", "application/vnd.pgrst.object+json")
            .send()
            .await
            .context("supabase select_single_as_user request failed")?;

        let status = resp.status();
        if !status.is_success() {
            let body = resp.text().await.unwrap_or_default();
            let truncated = safe_truncate(&body, 200);
            warn!("supabase select_single_as_user {table} returned {status}: {truncated}");
            return Err(anyhow!("supabase select_single_as_user {table}: {status} — {truncated}"));
        }

        resp.json::<Value>()
            .await
            .context("supabase select_single_as_user: failed to parse JSON")
    }

    /// Like `insert` but authenticates as the user identified by `jwt`.
    pub async fn insert_as_user(&self, table: &str, body: Value, jwt: &str) -> anyhow::Result<Value> {
        let resp = self
            .auth_headers_as_user(self.http.post(&self.rest_url(table)), jwt)
            .header("Content-Type", "application/json")
            .header("Prefer", "return=representation")
            .json(&body)
            .send()
            .await
            .context("supabase insert_as_user request failed")?;

        let status = resp.status();
        if !status.is_success() {
            let body_text = resp.text().await.unwrap_or_default();
            let truncated = safe_truncate(&body_text, 200);
            warn!("supabase insert_as_user {table} returned {status}: {truncated}");
            return Err(anyhow!("supabase insert_as_user {table}: {status} — {truncated}"));
        }

        resp.json::<Value>()
            .await
            .context("supabase insert_as_user: failed to parse JSON")
    }

    /// Like `upsert` but authenticates as the user identified by `jwt`.
    pub async fn upsert_as_user(&self, table: &str, body: Value, jwt: &str) -> anyhow::Result<Value> {
        let resp = self
            .auth_headers_as_user(self.http.post(&self.rest_url(table)), jwt)
            .header("Content-Type", "application/json")
            .header("Prefer", "return=representation,resolution=merge-duplicates")
            .json(&body)
            .send()
            .await
            .context("supabase upsert_as_user request failed")?;

        let status = resp.status();
        if !status.is_success() {
            let body_text = resp.text().await.unwrap_or_default();
            let truncated = safe_truncate(&body_text, 200);
            warn!("supabase upsert_as_user {table} returned {status}: {truncated}");
            return Err(anyhow!("supabase upsert_as_user {table}: {status} — {truncated}"));
        }

        resp.json::<Value>()
            .await
            .context("supabase upsert_as_user: failed to parse JSON")
    }

    /// Like `update` but authenticates as the user identified by `jwt`.
    pub async fn update_as_user(&self, table: &str, query: &str, body: Value, jwt: &str) -> anyhow::Result<Value> {
        let url = format!("{}?{}", self.rest_url(table), query);
        let resp = self
            .auth_headers_as_user(self.http.patch(&url), jwt)
            .header("Content-Type", "application/json")
            .header("Prefer", "return=representation")
            .json(&body)
            .send()
            .await
            .context("supabase update_as_user request failed")?;

        let status = resp.status();
        if !status.is_success() {
            let body_text = resp.text().await.unwrap_or_default();
            let truncated = safe_truncate(&body_text, 200);
            warn!("supabase update_as_user {table} returned {status}: {truncated}");
            return Err(anyhow!("supabase update_as_user {table}: {status} — {truncated}"));
        }

        resp.json::<Value>()
            .await
            .context("supabase update_as_user: failed to parse JSON")
    }

    /// Like `delete` but authenticates as the user identified by `jwt`.
    pub async fn delete_as_user(&self, table: &str, query: &str, jwt: &str) -> anyhow::Result<()> {
        let url = format!("{}?{}", self.rest_url(table), query);
        let resp = self
            .auth_headers_as_user(self.http.delete(&url), jwt)
            .send()
            .await
            .context("supabase delete_as_user request failed")?;

        let status = resp.status();
        if !status.is_success() {
            let body_text = resp.text().await.unwrap_or_default();
            let truncated = safe_truncate(&body_text, 200);
            warn!("supabase delete_as_user {table} returned {status}: {truncated}");
            return Err(anyhow!("supabase delete_as_user {table}: {status} — {truncated}"));
        }

        Ok(())
    }

    /// `POST /rest/v1/rpc/{function}` — call a Postgres function.
    #[allow(dead_code)] // reserved for future Postgres function calls (e.g. search_memory)
    pub async fn rpc(&self, function: &str, body: Value) -> anyhow::Result<Value> {
        let resp = self
            .auth_headers(self.http.post(&self.rpc_url(function)))
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .context("supabase rpc request failed")?;

        let status = resp.status();
        if !status.is_success() {
            let body_text = resp.text().await.unwrap_or_default();
            let truncated = safe_truncate(&body_text, 200);
            warn!("supabase rpc {function} returned {status}: {truncated}");
            return Err(anyhow!("supabase rpc {function}: {status} — {truncated}"));
        }

        resp.json::<Value>()
            .await
            .context("supabase rpc: failed to parse JSON")
    }

    /// Check whether the client can reach Supabase. Returns `true` on success.
    pub async fn health_check(&self) -> bool {
        let url = format!("{}/rest/v1/", self.url);
        match self
            .auth_headers(self.http.get(&url))
            .send()
            .await
        {
            Ok(resp) => resp.status() != StatusCode::UNAUTHORIZED,
            Err(_) => false,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_client(url: &str) -> SupabaseClient {
        SupabaseClient::new(url, "test-key")
    }

    #[test]
    fn test_rest_url() {
        let client = test_client("https://abc.supabase.co");
        assert_eq!(
            client.rest_url("missions"),
            "https://abc.supabase.co/rest/v1/missions"
        );
    }

    #[test]
    fn test_rpc_url() {
        let client = test_client("https://abc.supabase.co");
        assert_eq!(
            client.rpc_url("search_memory"),
            "https://abc.supabase.co/rest/v1/rpc/search_memory"
        );
    }

    #[test]
    fn test_as_user_header_uses_jwt() {
        let client = SupabaseClient::new("https://test.supabase.co", "service-key-123");
        assert_eq!(client.service_key, "service-key-123");
        assert_eq!(client.url, "https://test.supabase.co");
    }

    #[test]
    fn test_url_trailing_slash_stripped() {
        let client = test_client("https://abc.supabase.co/");
        assert_eq!(
            client.rest_url("agents"),
            "https://abc.supabase.co/rest/v1/agents"
        );
    }

    #[test]
    fn safe_truncate_ascii() {
        assert_eq!(super::safe_truncate("hello", 3), "hel");
        assert_eq!(super::safe_truncate("hello", 10), "hello");
        assert_eq!(super::safe_truncate("", 5), "");
    }

    #[test]
    fn safe_truncate_multibyte_utf8() {
        // Each emoji is 4 bytes — slicing at byte 4 would panic if not char-aligned
        let emoji_str = "\u{1F600}\u{1F601}\u{1F602}"; // 3 emojis, 12 bytes
        let truncated = super::safe_truncate(emoji_str, 2);
        assert_eq!(truncated.chars().count(), 2);
        assert_eq!(truncated, "\u{1F600}\u{1F601}");
    }

    #[test]
    fn safe_truncate_exact_boundary() {
        let s = "abc";
        assert_eq!(super::safe_truncate(s, 3), "abc");
    }
}
