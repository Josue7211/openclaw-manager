use anyhow::{anyhow, Context};
use reqwest::{Client, StatusCode};
use serde_json::Value;
use tracing::warn;

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
    /// Build a client from environment variables.
    /// Returns `Err` if either `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` is missing.
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

    /// Build a client with an existing `reqwest::Client` (connection pooling).
    #[allow(dead_code)]
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

    #[allow(dead_code)]
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
            warn!("supabase select {table} returned {status}: {body}");
            return Err(anyhow!("supabase select {table}: {status} — {body}"));
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
            warn!("supabase select_single {table} returned {status}: {body}");
            return Err(anyhow!("supabase select_single {table}: {status} — {body}"));
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
            warn!("supabase insert {table} returned {status}: {body_text}");
            return Err(anyhow!("supabase insert {table}: {status} — {body_text}"));
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
            warn!("supabase upsert {table} returned {status}: {body_text}");
            return Err(anyhow!("supabase upsert {table}: {status} — {body_text}"));
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
            warn!("supabase update {table} returned {status}: {body_text}");
            return Err(anyhow!("supabase update {table}: {status} — {body_text}"));
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
            warn!("supabase delete {table} returned {status}: {body_text}");
            return Err(anyhow!("supabase delete {table}: {status} — {body_text}"));
        }

        Ok(())
    }

    /// `POST /rest/v1/rpc/{function}` — call a Postgres function.
    #[allow(dead_code)]
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
            warn!("supabase rpc {function} returned {status}: {body_text}");
            return Err(anyhow!("supabase rpc {function}: {status} — {body_text}"));
        }

        resp.json::<Value>()
            .await
            .context("supabase rpc: failed to parse JSON")
    }

    /// Check whether the client can reach Supabase. Returns `true` on success.
    #[allow(dead_code)]
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

    #[test]
    fn test_rest_url() {
        std::env::set_var("SUPABASE_URL", "https://abc.supabase.co");
        std::env::set_var("SUPABASE_SERVICE_ROLE_KEY", "test-key");
        let client = SupabaseClient::from_env().unwrap();
        assert_eq!(
            client.rest_url("missions"),
            "https://abc.supabase.co/rest/v1/missions"
        );
    }

    #[test]
    fn test_rpc_url() {
        std::env::set_var("SUPABASE_URL", "https://abc.supabase.co");
        std::env::set_var("SUPABASE_SERVICE_ROLE_KEY", "test-key");
        let client = SupabaseClient::from_env().unwrap();
        assert_eq!(
            client.rpc_url("search_memory"),
            "https://abc.supabase.co/rest/v1/rpc/search_memory"
        );
    }

    #[test]
    fn test_url_trailing_slash_stripped() {
        std::env::set_var("SUPABASE_URL", "https://abc.supabase.co/");
        std::env::set_var("SUPABASE_SERVICE_ROLE_KEY", "test-key");
        let client = SupabaseClient::from_env().unwrap();
        assert_eq!(
            client.rest_url("agents"),
            "https://abc.supabase.co/rest/v1/agents"
        );
    }
}
