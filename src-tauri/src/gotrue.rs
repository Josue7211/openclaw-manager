//! GoTrue REST API client for Supabase Auth.
//!
//! Handles all auth flows server-side: login, signup, OAuth PKCE exchange,
//! token refresh, logout, user management, and MFA (TOTP enroll/challenge/verify).
//!
//! Base URL: `{SUPABASE_URL}/auth/v1`

use anyhow::{anyhow, Context};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use rand::RngCore;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

/// Successful authentication response from GoTrue token endpoints.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthResponse {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_in: i64,
    pub user: Value,
}

/// Response from MFA TOTP enrollment.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MfaEnrollResponse {
    pub id: String,
    pub totp: MfaTotp,
}

/// TOTP details returned during MFA enrollment.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MfaTotp {
    pub qr_code: String,
    pub secret: String,
    pub uri: String,
}

/// Response from MFA challenge creation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MfaChallengeResponse {
    pub id: String,
}

/// A single MFA factor as returned by the list factors endpoint.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MfaFactor {
    pub id: String,
    pub factor_type: String,
    #[serde(default)]
    pub friendly_name: Option<String>,
    pub status: String,
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

/// REST client for the GoTrue (Supabase Auth) API.
///
/// All requests carry the `apikey` header. Authenticated endpoints additionally
/// carry a `Bearer` token in the `Authorization` header.
#[derive(Clone, Debug)]
pub struct GoTrueClient {
    http: Client,
    /// `{SUPABASE_URL}/auth/v1`
    base_url: String,
    /// Supabase service-role key (or anon key).
    api_key: String,
}

impl GoTrueClient {
    /// Create a new client from an explicit Supabase URL and API key.
    pub fn new(supabase_url: &str, api_key: &str) -> Self {
        Self {
            http: Client::new(),
            base_url: format!("{}/auth/v1", supabase_url.trim_end_matches('/')),
            api_key: api_key.to_string(),
        }
    }

    /// Create a client from `AppState` secrets (`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`).
    pub fn from_state(state: &crate::server::AppState) -> anyhow::Result<Self> {
        let url = state
            .secret("SUPABASE_URL")
            .context("SUPABASE_URL not set")?;
        let key = state
            .secret("SUPABASE_SERVICE_ROLE_KEY")
            .context("SUPABASE_SERVICE_ROLE_KEY not set")?;
        Ok(Self::new(&url, &key))
    }

    // ── Internal helpers ─────────────────────────────────────────────────

    /// Attach the `apikey` header (project-level auth).
    fn auth_request(&self, builder: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
        builder.header("apikey", &self.api_key)
    }

    /// Attach both the `apikey` header and a user-level `Authorization: Bearer` header.
    fn user_request(
        &self,
        builder: reqwest::RequestBuilder,
        token: &str,
    ) -> reqwest::RequestBuilder {
        builder
            .header("apikey", &self.api_key)
            .header("Authorization", format!("Bearer {}", token))
    }

    /// Parse a GoTrue JSON error body into an `anyhow::Error`.
    async fn parse_error(resp: reqwest::Response, context: &str) -> anyhow::Error {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        // Try to extract GoTrue's "msg" or "error_description" field for a nicer message.
        if let Ok(v) = serde_json::from_str::<Value>(&body) {
            if let Some(msg) = v["msg"].as_str().or(v["error_description"].as_str()) {
                return anyhow!("{context}: {status} — {msg}");
            }
        }
        anyhow!("{context}: {status} — {body}")
    }

    // ── Public API: Authentication ───────────────────────────────────────

    /// Sign in with email and password.
    ///
    /// `POST /token?grant_type=password`
    pub async fn sign_in_with_password(
        &self,
        email: &str,
        password: &str,
    ) -> anyhow::Result<AuthResponse> {
        let url = format!("{}?grant_type=password", self.token_url());
        let resp = self
            .auth_request(self.http.post(&url))
            .json(&json!({ "email": email, "password": password }))
            .send()
            .await
            .context("gotrue sign_in_with_password request failed")?;

        if !resp.status().is_success() {
            return Err(Self::parse_error(resp, "sign_in_with_password").await);
        }
        resp.json::<AuthResponse>()
            .await
            .context("sign_in_with_password: failed to parse response")
    }

    /// Create a new account with email and password.
    ///
    /// `POST /signup`
    pub async fn sign_up(
        &self,
        email: &str,
        password: &str,
    ) -> anyhow::Result<AuthResponse> {
        let url = format!("{}/signup", self.base_url);
        let resp = self
            .auth_request(self.http.post(&url))
            .json(&json!({ "email": email, "password": password }))
            .send()
            .await
            .context("gotrue sign_up request failed")?;

        if !resp.status().is_success() {
            return Err(Self::parse_error(resp, "sign_up").await);
        }
        resp.json::<AuthResponse>()
            .await
            .context("sign_up: failed to parse response")
    }

    /// Refresh an expired session using a refresh token.
    ///
    /// `POST /token?grant_type=refresh_token`
    pub async fn refresh_token(
        &self,
        refresh_token: &str,
    ) -> anyhow::Result<AuthResponse> {
        let url = format!("{}?grant_type=refresh_token", self.token_url());
        let resp = self
            .auth_request(self.http.post(&url))
            .json(&json!({ "refresh_token": refresh_token }))
            .send()
            .await
            .context("gotrue refresh_token request failed")?;

        if !resp.status().is_success() {
            return Err(Self::parse_error(resp, "refresh_token").await);
        }
        resp.json::<AuthResponse>()
            .await
            .context("refresh_token: failed to parse response")
    }

    /// Exchange an OAuth authorization code (PKCE) for tokens.
    ///
    /// `POST /token?grant_type=pkce`
    pub async fn exchange_code_for_session(
        &self,
        auth_code: &str,
        code_verifier: &str,
    ) -> anyhow::Result<AuthResponse> {
        let url = format!("{}?grant_type=pkce", self.token_url());
        let resp = self
            .auth_request(self.http.post(&url))
            .json(&json!({
                "auth_code": auth_code,
                "code_verifier": code_verifier,
            }))
            .send()
            .await
            .context("gotrue exchange_code_for_session request failed")?;

        if !resp.status().is_success() {
            return Err(Self::parse_error(resp, "exchange_code_for_session").await);
        }
        resp.json::<AuthResponse>()
            .await
            .context("exchange_code_for_session: failed to parse response")
    }

    /// Sign out (invalidate the access token server-side).
    ///
    /// `POST /logout`
    pub async fn sign_out(&self, access_token: &str) -> anyhow::Result<()> {
        let url = format!("{}/logout", self.base_url);
        let resp = self
            .user_request(self.http.post(&url), access_token)
            .send()
            .await
            .context("gotrue sign_out request failed")?;

        if !resp.status().is_success() {
            return Err(Self::parse_error(resp, "sign_out").await);
        }
        Ok(())
    }

    // ── Public API: User management ──────────────────────────────────────

    /// Get the current user's profile.
    ///
    /// `GET /user`
    pub async fn get_user(&self, access_token: &str) -> anyhow::Result<Value> {
        let url = format!("{}/user", self.base_url);
        let resp = self
            .user_request(self.http.get(&url), access_token)
            .send()
            .await
            .context("gotrue get_user request failed")?;

        if !resp.status().is_success() {
            return Err(Self::parse_error(resp, "get_user").await);
        }
        resp.json::<Value>()
            .await
            .context("get_user: failed to parse response")
    }

    /// Update the current user (e.g., change password).
    ///
    /// `PUT /user`
    pub async fn update_user(
        &self,
        access_token: &str,
        body: Value,
    ) -> anyhow::Result<Value> {
        let url = format!("{}/user", self.base_url);
        let resp = self
            .user_request(self.http.put(&url), access_token)
            .json(&body)
            .send()
            .await
            .context("gotrue update_user request failed")?;

        if !resp.status().is_success() {
            return Err(Self::parse_error(resp, "update_user").await);
        }
        resp.json::<Value>()
            .await
            .context("update_user: failed to parse response")
    }

    // ── Public API: MFA ──────────────────────────────────────────────────

    /// Enroll a new TOTP factor for the current user.
    ///
    /// `POST /factors`
    pub async fn mfa_enroll(
        &self,
        access_token: &str,
        friendly_name: &str,
    ) -> anyhow::Result<MfaEnrollResponse> {
        let url = format!("{}/factors", self.base_url);
        let resp = self
            .user_request(self.http.post(&url), access_token)
            .json(&json!({
                "factor_type": "totp",
                "friendly_name": friendly_name,
            }))
            .send()
            .await
            .context("gotrue mfa_enroll request failed")?;

        if !resp.status().is_success() {
            return Err(Self::parse_error(resp, "mfa_enroll").await);
        }
        resp.json::<MfaEnrollResponse>()
            .await
            .context("mfa_enroll: failed to parse response")
    }

    /// Create an MFA challenge for a specific factor.
    ///
    /// `POST /factors/{factor_id}/challenge`
    pub async fn mfa_challenge(
        &self,
        access_token: &str,
        factor_id: &str,
    ) -> anyhow::Result<MfaChallengeResponse> {
        let url = format!("{}/factors/{}/challenge", self.base_url, factor_id);
        let resp = self
            .user_request(self.http.post(&url), access_token)
            .send()
            .await
            .context("gotrue mfa_challenge request failed")?;

        if !resp.status().is_success() {
            return Err(Self::parse_error(resp, "mfa_challenge").await);
        }
        resp.json::<MfaChallengeResponse>()
            .await
            .context("mfa_challenge: failed to parse response")
    }

    /// Verify an MFA challenge with a TOTP code. Returns an upgraded (aal2) session.
    ///
    /// `POST /factors/{factor_id}/verify`
    pub async fn mfa_verify(
        &self,
        access_token: &str,
        factor_id: &str,
        challenge_id: &str,
        code: &str,
    ) -> anyhow::Result<AuthResponse> {
        let url = format!("{}/factors/{}/verify", self.base_url, factor_id);
        let resp = self
            .user_request(self.http.post(&url), access_token)
            .json(&json!({
                "challenge_id": challenge_id,
                "code": code,
            }))
            .send()
            .await
            .context("gotrue mfa_verify request failed")?;

        if !resp.status().is_success() {
            return Err(Self::parse_error(resp, "mfa_verify").await);
        }
        resp.json::<AuthResponse>()
            .await
            .context("mfa_verify: failed to parse response")
    }

    /// Unenroll (delete) an MFA factor.
    ///
    /// `DELETE /factors/{factor_id}`
    pub async fn mfa_unenroll(
        &self,
        access_token: &str,
        factor_id: &str,
    ) -> anyhow::Result<()> {
        let url = format!("{}/factors/{}", self.base_url, factor_id);
        let resp = self
            .user_request(self.http.delete(&url), access_token)
            .send()
            .await
            .context("gotrue mfa_unenroll request failed")?;

        if !resp.status().is_success() {
            return Err(Self::parse_error(resp, "mfa_unenroll").await);
        }
        Ok(())
    }

    /// List all MFA factors for the current user.
    ///
    /// `GET /factors`
    pub async fn mfa_list_factors(
        &self,
        access_token: &str,
    ) -> anyhow::Result<Vec<MfaFactor>> {
        let url = format!("{}/factors", self.base_url);
        let resp = self
            .user_request(self.http.get(&url), access_token)
            .send()
            .await
            .context("gotrue mfa_list_factors request failed")?;

        if !resp.status().is_success() {
            return Err(Self::parse_error(resp, "mfa_list_factors").await);
        }
        resp.json::<Vec<MfaFactor>>()
            .await
            .context("mfa_list_factors: failed to parse response")
    }

    // ── Private helpers ──────────────────────────────────────────────────

    /// `{base_url}/token`
    fn token_url(&self) -> String {
        format!("{}/token", self.base_url)
    }
}

// ---------------------------------------------------------------------------
// PKCE helpers
// ---------------------------------------------------------------------------

/// Generate a PKCE `code_verifier` (URL-safe base64, >= 43 chars) and its
/// corresponding `code_challenge` (S256 hash).
pub fn generate_pkce() -> (String, String) {
    let mut bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    let verifier = URL_SAFE_NO_PAD.encode(bytes);

    let mut hasher = Sha256::new();
    hasher.update(verifier.as_bytes());
    let challenge = URL_SAFE_NO_PAD.encode(hasher.finalize());

    (verifier, challenge)
}

/// Build the OAuth authorization URL for a given provider using PKCE S256.
pub fn build_oauth_url(
    supabase_url: &str,
    provider: &str,
    redirect_to: &str,
    code_challenge: &str,
) -> String {
    format!(
        "{}/auth/v1/authorize?provider={}&redirect_to={}&code_challenge={}&code_challenge_method=S256",
        supabase_url.trim_end_matches('/'),
        provider,
        urlencoding::encode(redirect_to),
        code_challenge,
    )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pkce_verifier_is_correct_length() {
        let (verifier, challenge) = generate_pkce();
        // 32 bytes -> 43 chars in URL-safe base64 without padding
        assert!(
            verifier.len() >= 43,
            "verifier should be at least 43 chars, got {}",
            verifier.len()
        );
        assert!(!challenge.is_empty());
        assert_ne!(verifier, challenge, "challenge is a hash, not the verifier");
    }

    #[test]
    fn pkce_generates_unique_pairs() {
        let (v1, c1) = generate_pkce();
        let (v2, c2) = generate_pkce();
        assert_ne!(v1, v2, "two verifiers should differ (random)");
        assert_ne!(c1, c2, "two challenges should differ");
    }

    #[test]
    fn pkce_challenge_is_deterministic_for_verifier() {
        let verifier = "test-verifier-string-that-is-long-enough-for-pkce";

        let mut h1 = Sha256::new();
        h1.update(verifier.as_bytes());
        let c1 = URL_SAFE_NO_PAD.encode(h1.finalize());

        let mut h2 = Sha256::new();
        h2.update(verifier.as_bytes());
        let c2 = URL_SAFE_NO_PAD.encode(h2.finalize());

        assert_eq!(c1, c2, "same verifier must produce same challenge");
    }

    #[test]
    fn oauth_url_building() {
        let url = build_oauth_url(
            "https://test.supabase.co",
            "github",
            "http://localhost:3000/api/auth/callback",
            "test-challenge",
        );
        assert!(url.contains("provider=github"));
        assert!(url.contains("code_challenge=test-challenge"));
        assert!(url.contains("code_challenge_method=S256"));
        assert!(url.starts_with("https://test.supabase.co/auth/v1/authorize?"));
    }

    #[test]
    fn oauth_url_encodes_redirect() {
        let url = build_oauth_url(
            "https://test.supabase.co",
            "google",
            "http://localhost:3000/api/auth/callback?foo=bar",
            "challenge",
        );
        // The `?` and `=` in redirect_to should be percent-encoded
        assert!(url.contains("redirect_to=http%3A%2F%2Flocalhost%3A3000%2Fapi%2Fauth%2Fcallback%3Ffoo%3Dbar"));
    }

    #[test]
    fn oauth_url_strips_trailing_slash() {
        let url = build_oauth_url(
            "https://test.supabase.co/",
            "github",
            "http://localhost:3000/callback",
            "challenge",
        );
        assert!(
            url.starts_with("https://test.supabase.co/auth/v1/authorize?"),
            "trailing slash should be stripped: {url}"
        );
    }

    #[test]
    fn gotrue_client_builds_correct_base_url() {
        let client = GoTrueClient::new("https://test.supabase.co/", "test-key");
        assert_eq!(client.base_url, "https://test.supabase.co/auth/v1");
    }

    #[test]
    fn gotrue_client_no_trailing_slash() {
        let client = GoTrueClient::new("https://test.supabase.co", "key");
        assert_eq!(client.base_url, "https://test.supabase.co/auth/v1");
    }

    #[test]
    fn gotrue_client_stores_api_key() {
        let client = GoTrueClient::new("https://x.supabase.co", "my-secret-key");
        assert_eq!(client.api_key, "my-secret-key");
    }

    #[test]
    fn token_url_is_correct() {
        let client = GoTrueClient::new("https://x.supabase.co", "k");
        assert_eq!(client.token_url(), "https://x.supabase.co/auth/v1/token");
    }
}
