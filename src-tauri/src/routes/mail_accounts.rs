use axum::extract::{Query, State};
use axum::routing::get;
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::error::AppError;
use crate::routes::agentmail;
use crate::routes::util::random_uuid;
use crate::server::{AppState, RequireAuth};
use crate::supabase::SupabaseClient;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct MailAccountRecord {
    pub id: String,
    pub label: String,
    pub provider: String,
    pub address: String,
    pub agentmail_inbox_id: String,
    pub forwarding_status: String,
    pub is_default: bool,
}

impl MailAccountRecord {
    pub fn validate(&self) -> Result<(), AppError> {
        if self.id.trim().is_empty() {
            return Err(AppError::BadRequest("id must not be empty".into()));
        }
        if self.label.trim().is_empty() {
            return Err(AppError::BadRequest("label must not be empty".into()));
        }
        if self.provider.trim().is_empty() {
            return Err(AppError::BadRequest("provider must not be empty".into()));
        }
        if self.address.trim().is_empty() {
            return Err(AppError::BadRequest("address must not be empty".into()));
        }
        if is_agentmail_provider(&self.provider) && self.agentmail_inbox_id.trim().is_empty() {
            return Err(AppError::BadRequest(
                "agentmail_inbox_id must not be empty".into(),
            ));
        }
        if self.forwarding_status.trim().is_empty() {
            return Err(AppError::BadRequest(
                "forwarding_status must not be empty".into(),
            ));
        }
        Ok(())
    }
}

fn is_agentmail_provider(provider: &str) -> bool {
    provider.trim().eq_ignore_ascii_case("agentmail")
}

#[derive(Debug, Deserialize)]
struct CreateMailAccountRequest {
    label: Option<String>,
    provider: Option<String>,
    address: Option<String>,
    agentmail_inbox_id: Option<String>,
    forwarding_status: Option<String>,
    is_default: Option<bool>,
}

impl CreateMailAccountRequest {
    fn validate(&self) -> Result<(), AppError> {
        let _ = self.is_default;
        required_text(&self.label, "label")?;
        required_text(&self.provider, "provider")?;
        required_text(&self.address, "address")?;
        required_text(&self.forwarding_status, "forwarding_status")?;
        let _ = optional_text_blank_as_none(&self.agentmail_inbox_id);
        Ok(())
    }
}

#[derive(Debug, Deserialize)]
struct UpdateMailAccountRequest {
    id: Option<String>,
    label: Option<String>,
    provider: Option<String>,
    address: Option<String>,
    agentmail_inbox_id: Option<String>,
    forwarding_status: Option<String>,
    is_default: Option<bool>,
}

impl UpdateMailAccountRequest {
    fn validate(&self) -> Result<(), AppError> {
        let _ = self.is_default;
        required_text(&self.id, "id")?;
        if self.label.is_none()
            && self.provider.is_none()
            && self.address.is_none()
            && self.agentmail_inbox_id.is_none()
            && self.forwarding_status.is_none()
            && self.is_default.is_none()
        {
            return Err(AppError::BadRequest(
                "at least one field must be provided for update".into(),
            ));
        }
        optional_text(&self.label, "label")?;
        optional_text(&self.provider, "provider")?;
        optional_text(&self.address, "address")?;
        let _ = optional_text_blank_as_none(&self.agentmail_inbox_id);
        optional_text(&self.forwarding_status, "forwarding_status")?;
        Ok(())
    }
}

#[derive(Debug, Deserialize)]
struct DeleteMailAccountQuery {
    id: Option<String>,
}

impl DeleteMailAccountQuery {
    fn validate(&self) -> Result<(), AppError> {
        required_text(&self.id, "id")?;
        Ok(())
    }
}

pub fn router() -> Router<AppState> {
    Router::new().route(
        "/mail-accounts",
        get(list_mail_accounts)
            .post(create_mail_account)
            .patch(update_mail_account)
            .delete(delete_mail_account),
    )
}

const MAIL_ACCOUNTS_SERVICE: &str = "mail_accounts";

pub(crate) async fn load_mail_accounts(
    state: &AppState,
    session: &crate::server::UserSession,
) -> Result<Vec<MailAccountRecord>, AppError> {
    if session.encryption_key.is_empty() {
        return Ok(default_mail_accounts(state));
    }

    let sb = SupabaseClient::from_state(state)?;
    let rows = sb
        .select_as_user(
            "user_secrets",
            &format!(
                "select=encrypted_credentials,nonce&service=eq.{}&limit=1",
                MAIL_ACCOUNTS_SERVICE
            ),
            &session.access_token,
        )
        .await?;

    let Some(row) = rows.as_array().and_then(|arr| arr.first()) else {
        return Ok(Vec::new());
    };

    let ciphertext = row["encrypted_credentials"]
        .as_str()
        .ok_or_else(|| AppError::Internal(anyhow::anyhow!("missing encrypted_credentials")))?;
    let nonce = row["nonce"]
        .as_str()
        .ok_or_else(|| AppError::Internal(anyhow::anyhow!("missing nonce")))?;

    let plaintext = crate::crypto::decrypt(ciphertext, nonce, &session.encryption_key)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("decryption failed: {e}")))?;

    serde_json::from_slice::<Vec<MailAccountRecord>>(&plaintext)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("invalid mail_accounts JSON: {e}")))
}

async fn save_mail_accounts(
    state: &AppState,
    session: &crate::server::UserSession,
    accounts: &[MailAccountRecord],
) -> Result<(), AppError> {
    if session.encryption_key.is_empty() {
        return Err(AppError::BadRequest(
            "Encryption key not available. Log in with email/password to manage mail accounts."
                .into(),
        ));
    }

    let json_bytes = serde_json::to_vec(accounts).map_err(|e| {
        AppError::Internal(anyhow::anyhow!("failed to serialize mail_accounts: {e}"))
    })?;
    let (ciphertext, nonce) = crate::crypto::encrypt(&json_bytes, &session.encryption_key)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("encryption failed: {e}")))?;

    let sb = SupabaseClient::from_state(state)?;
    let row = json!({
        "user_id": session.user_id,
        "service": MAIL_ACCOUNTS_SERVICE,
        "encrypted_credentials": ciphertext,
        "nonce": nonce,
    });

    sb.upsert_as_user("user_secrets", row, &session.access_token)
        .await?;
    Ok(())
}

fn ensure_single_default(accounts: &mut [MailAccountRecord], preferred_id: Option<&str>) {
    if let Some(preferred_id) = preferred_id {
        let mut matched = false;
        for account in accounts.iter_mut() {
            let is_match = account.id == preferred_id;
            account.is_default = is_match;
            matched |= is_match;
        }
        if matched {
            return;
        }
    }

    let mut found = false;
    for account in accounts.iter_mut() {
        if account.is_default && !found {
            found = true;
        } else {
            account.is_default = false;
        }
    }

    if !found {
        if let Some(first) = accounts.first_mut() {
            first.is_default = true;
        }
    }
}

async fn list_mail_accounts(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let accounts =
        merge_configured_mail_accounts(&state, load_mail_accounts(&state, &session).await?);
    Ok(Json(json!({ "accounts": accounts })))
}

async fn create_mail_account(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Json(body): Json<CreateMailAccountRequest>,
) -> Result<Json<Value>, AppError> {
    body.validate()?;

    let mut accounts = load_mail_accounts(&state, &session).await?;
    let label = required_text(&body.label, "label")?;
    let address = required_text(&body.address, "address")?;
    let mut provider = required_text(&body.provider, "provider")?;
    let requested_agentmail_provider = is_agentmail_provider(&provider);
    if requested_agentmail_provider {
        provider = infer_provider_from_address_or_host(&address, "");
    }
    let agentmail_inbox_id = if optional_text_blank_as_none(&body.agentmail_inbox_id).is_some() {
        optional_text_blank_as_none(&body.agentmail_inbox_id).unwrap_or_default()
    } else if requested_agentmail_provider {
        resolve_agentmail_inbox_for_create(&state, &label, &address, &body).await?
    } else {
        String::new()
    };
    let account = MailAccountRecord {
        id: random_uuid(),
        label,
        provider,
        address,
        agentmail_inbox_id,
        forwarding_status: required_text(&body.forwarding_status, "forwarding_status")?,
        is_default: body.is_default.unwrap_or(accounts.is_empty()),
    };
    account.validate()?;
    accounts.push(account.clone());

    if account.is_default {
        ensure_single_default(&mut accounts, Some(&account.id));
    } else {
        ensure_single_default(&mut accounts, None);
    }

    save_mail_accounts(&state, &session, &accounts).await?;
    Ok(Json(json!({ "account": account, "accounts": accounts })))
}

async fn update_mail_account(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Json(body): Json<UpdateMailAccountRequest>,
) -> Result<Json<Value>, AppError> {
    body.validate()?;
    let mut accounts = load_mail_accounts(&state, &session).await?;
    let id = required_text(&body.id, "id")?;
    let account = accounts
        .iter_mut()
        .find(|account| account.id == id)
        .ok_or_else(|| AppError::NotFound(format!("mail account not found: {id}")))?;

    if let Some(value) = optional_text(&body.label, "label")? {
        account.label = value;
    }
    if let Some(value) = optional_text(&body.provider, "provider")? {
        account.provider = value;
    }
    if let Some(value) = optional_text(&body.address, "address")? {
        account.address = value;
    }
    if let Some(value) = optional_text_allow_blank(&body.agentmail_inbox_id) {
        account.agentmail_inbox_id = value;
    }
    if let Some(value) = optional_text(&body.forwarding_status, "forwarding_status")? {
        account.forwarding_status = value;
    }
    if let Some(value) = body.is_default {
        account.is_default = value;
    }

    account.validate()?;
    let preferred_default = accounts
        .iter()
        .find(|record| record.is_default)
        .map(|record| record.id.clone());
    ensure_single_default(&mut accounts, preferred_default.as_deref());
    save_mail_accounts(&state, &session, &accounts).await?;

    let updated = accounts
        .iter()
        .find(|record| record.id == id)
        .cloned()
        .ok_or_else(|| AppError::Internal(anyhow::anyhow!("updated account missing after save")))?;

    Ok(Json(json!({ "account": updated, "accounts": accounts })))
}

async fn delete_mail_account(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Query(query): Query<DeleteMailAccountQuery>,
) -> Result<Json<Value>, AppError> {
    query.validate()?;
    let id = required_text(&query.id, "id")?;
    let mut accounts = load_mail_accounts(&state, &session).await?;
    let initial_len = accounts.len();
    accounts.retain(|account| account.id != id);
    if accounts.len() == initial_len {
        return Err(AppError::NotFound(format!("mail account not found: {id}")));
    }
    ensure_single_default(&mut accounts, None);
    save_mail_accounts(&state, &session, &accounts).await?;
    Ok(Json(json!({ "deleted": true, "accounts": accounts })))
}

async fn resolve_agentmail_inbox_for_create(
    state: &AppState,
    label: &str,
    address: &str,
    body: &CreateMailAccountRequest,
) -> Result<String, AppError> {
    if let Some(inbox_id) = optional_text(&body.agentmail_inbox_id, "agentmail_inbox_id")? {
        return Ok(inbox_id);
    }

    let username = agentmail_username_from_address(address);
    let client_id = format!("clawctrl-mail-account:{address}");
    let inbox = agentmail::create_inbox(state, Some(&username), Some(label), Some(&client_id))
        .await?
        .ok_or_else(|| {
            AppError::BadRequest(
                "AGENTMAIL_API_KEY is required to create an AgentMail inbox automatically".into(),
            )
        })?;

    Ok(inbox.inbox_id)
}

fn agentmail_username_from_address(address: &str) -> String {
    let mut username = String::with_capacity(address.len());
    let mut last_was_dash = false;

    for ch in address.trim().to_ascii_lowercase().chars() {
        if ch.is_ascii_alphanumeric() {
            username.push(ch);
            last_was_dash = false;
        } else if !last_was_dash {
            username.push('-');
            last_was_dash = true;
        }
    }

    let trimmed = username.trim_matches('-').to_string();
    if trimmed.is_empty() {
        format!("clawctrl-{}", random_uuid())
    } else {
        trimmed
    }
}

pub(crate) fn default_agentmail_accounts(state: &AppState) -> Vec<MailAccountRecord> {
    let Some(inbox_id) = state
        .secret("AGENTMAIL_DEFAULT_INBOX_ID")
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
    else {
        return Vec::new();
    };

    let address = state
        .secret("AGENTMAIL_DEFAULT_ADDRESS")
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| inbox_id.clone());
    let label = state
        .secret("AGENTMAIL_DEFAULT_LABEL")
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| address.clone());
    let provider = state
        .secret("AGENTMAIL_DEFAULT_PROVIDER")
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| infer_provider_from_address_or_host(&address, ""));

    vec![MailAccountRecord {
        id: address.clone(),
        label,
        provider,
        address,
        agentmail_inbox_id: inbox_id,
        forwarding_status: "active".into(),
        is_default: true,
    }]
}

pub(crate) fn default_imap_accounts(state: &AppState) -> Vec<MailAccountRecord> {
    let Some(host) = state
        .secret("EMAIL_HOST")
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
    else {
        return Vec::new();
    };

    let Some(address) = state
        .secret("EMAIL_USER")
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
    else {
        return Vec::new();
    };

    if state
        .secret("EMAIL_PASSWORD")
        .map(|value| value.trim().is_empty())
        .unwrap_or(true)
    {
        return Vec::new();
    }

    let provider = state
        .secret("EMAIL_PROVIDER")
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| infer_imap_provider(&host));
    let label = state
        .secret("EMAIL_LABEL")
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| title_case_provider(&provider));

    vec![MailAccountRecord {
        id: format!("imap:{address}"),
        label,
        provider,
        address,
        agentmail_inbox_id: String::new(),
        forwarding_status: "active".into(),
        is_default: true,
    }]
}

pub(crate) fn default_mail_accounts(state: &AppState) -> Vec<MailAccountRecord> {
    let mut accounts = default_imap_accounts(state);
    let has_imap_default = !accounts.is_empty();
    accounts.extend(
        default_agentmail_accounts(state)
            .into_iter()
            .map(|mut account| {
                if has_imap_default {
                    account.is_default = false;
                }
                account
            }),
    );
    accounts
}

pub(crate) fn merge_configured_mail_accounts(
    state: &AppState,
    saved_accounts: Vec<MailAccountRecord>,
) -> Vec<MailAccountRecord> {
    let configured_accounts = default_mail_accounts(state);
    if configured_accounts.is_empty() {
        return saved_accounts;
    }

    let mut accounts = configured_accounts;
    for account in saved_accounts {
        if accounts.iter().any(|existing| existing.id == account.id) {
            continue;
        }
        accounts.push(account);
    }

    let configured_default_id = accounts
        .iter()
        .find(|account| account.id.starts_with("imap:") && account.is_default)
        .map(|account| account.id.clone())
        .or_else(|| {
            accounts
                .iter()
                .find(|account| account.is_default)
                .map(|account| account.id.clone())
        });
    ensure_single_default(&mut accounts, configured_default_id.as_deref());
    accounts
}

fn infer_imap_provider(host: &str) -> String {
    let normalized = host.to_ascii_lowercase();
    if normalized.contains("proton") || normalized == "127.0.0.1" || normalized == "localhost" {
        "proton".into()
    } else if normalized.contains("gmail") || normalized.contains("google") {
        "gmail".into()
    } else if normalized.contains("icloud")
        || normalized.contains("me.com")
        || normalized.contains("apple")
    {
        "icloud".into()
    } else if normalized.contains("outlook") || normalized.contains("office365") {
        "outlook".into()
    } else if normalized.contains("fastmail") {
        "fastmail".into()
    } else {
        "imap".into()
    }
}

fn infer_provider_from_address_or_host(address: &str, host: &str) -> String {
    let normalized_address = address.to_ascii_lowercase();
    if normalized_address.contains("proton") {
        "proton".into()
    } else if normalized_address.contains("gmail") {
        "gmail".into()
    } else if normalized_address.contains("icloud")
        || normalized_address.contains("@me.com")
        || normalized_address.contains("@mac.com")
    {
        "icloud".into()
    } else if normalized_address.contains("outlook") || normalized_address.contains("hotmail") {
        "outlook".into()
    } else if normalized_address.contains("fastmail") {
        "fastmail".into()
    } else {
        infer_imap_provider(host)
    }
}

fn title_case_provider(provider: &str) -> String {
    match provider.trim().to_ascii_lowercase().as_str() {
        "proton" | "protonmail" => "Proton".into(),
        "gmail" | "google" | "google-workspace" => "Gmail".into(),
        "icloud" | "apple" => "iCloud".into(),
        "outlook" | "office365" => "Outlook".into(),
        "fastmail" => "Fastmail".into(),
        "agentmail" => "AgentMail".into(),
        _ => "IMAP".into(),
    }
}

fn required_text(value: &Option<String>, field: &'static str) -> Result<String, AppError> {
    let text = value
        .as_deref()
        .ok_or_else(|| AppError::BadRequest(format!("{field} required")))?;
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return Err(AppError::BadRequest(format!("{field} required")));
    }
    Ok(trimmed.to_string())
}

fn optional_text(value: &Option<String>, field: &'static str) -> Result<Option<String>, AppError> {
    match value {
        Some(text) if text.trim().is_empty() => Err(AppError::BadRequest(format!(
            "{field} must not be empty when provided"
        ))),
        Some(text) => Ok(Some(text.trim().to_string())),
        None => Ok(None),
    }
}

fn optional_text_blank_as_none(value: &Option<String>) -> Option<String> {
    value
        .as_deref()
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .map(str::to_string)
}

fn optional_text_allow_blank(value: &Option<String>) -> Option<String> {
    value.as_deref().map(str::trim).map(str::to_string)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_mail_account_registry_entry() {
        let entry = MailAccountRecord {
            id: "acct_agentmail_personal".into(),
            label: "Aparcedo".into(),
            provider: "agentmail".into(),
            address: "me@gmail.com".into(),
            agentmail_inbox_id: "me-at-agentmail".into(),
            forwarding_status: "active".into(),
            is_default: true,
        };

        assert!(entry.validate().is_ok());
    }

    #[test]
    fn rejects_mail_account_registry_entry_without_address() {
        let entry = MailAccountRecord {
            id: "acct_empty".into(),
            label: "Broken".into(),
            provider: "gmail".into(),
            address: "".into(),
            agentmail_inbox_id: "broken".into(),
            forwarding_status: "pending".into(),
            is_default: false,
        };

        assert!(entry.validate().is_err());
    }

    #[test]
    fn allows_imap_account_without_agentmail_inbox_id() {
        let entry = MailAccountRecord {
            id: "acct_proton".into(),
            label: "Proton".into(),
            provider: "proton".into(),
            address: "me@proton.me".into(),
            agentmail_inbox_id: "".into(),
            forwarding_status: "active".into(),
            is_default: true,
        };

        assert!(entry.validate().is_ok());
    }

    #[test]
    fn validates_create_mail_account_request() {
        let request = CreateMailAccountRequest {
            label: Some("Aparcedo".into()),
            provider: Some("agentmail".into()),
            address: Some("me@gmail.com".into()),
            agentmail_inbox_id: Some("me-at-agentmail".into()),
            forwarding_status: Some("active".into()),
            is_default: Some(true),
        };

        assert!(request.validate().is_ok());
    }

    #[test]
    fn validates_create_mail_account_request_without_id() {
        let request = CreateMailAccountRequest {
            label: Some("Aparcedo".into()),
            provider: Some("agentmail".into()),
            address: Some("me@gmail.com".into()),
            agentmail_inbox_id: Some("me-at-agentmail".into()),
            forwarding_status: Some("active".into()),
            is_default: None,
        };

        assert!(request.validate().is_ok());
    }

    #[test]
    fn validates_create_mail_account_request_without_agentmail_inbox_id() {
        let request = CreateMailAccountRequest {
            label: Some("Proton".into()),
            provider: Some("proton".into()),
            address: Some("me@proton.me".into()),
            agentmail_inbox_id: None,
            forwarding_status: Some("pending".into()),
            is_default: None,
        };

        assert!(request.validate().is_ok());
    }

    #[test]
    fn validates_imap_create_mail_account_request_with_blank_agentmail_id() {
        let request = CreateMailAccountRequest {
            label: Some("Proton".into()),
            provider: Some("proton".into()),
            address: Some("me@proton.me".into()),
            agentmail_inbox_id: Some(" ".into()),
            forwarding_status: Some("active".into()),
            is_default: None,
        };

        assert!(request.validate().is_ok());
    }

    #[test]
    fn update_mail_account_can_clear_agentmail_access_mapping() {
        let request = UpdateMailAccountRequest {
            id: Some("acct_proton".into()),
            label: None,
            provider: None,
            address: None,
            agentmail_inbox_id: Some(" ".into()),
            forwarding_status: None,
            is_default: None,
        };

        assert!(request.validate().is_ok());
        assert_eq!(
            optional_text_allow_blank(&request.agentmail_inbox_id),
            Some(String::new())
        );
    }

    #[test]
    fn derives_agentmail_username_from_address() {
        assert_eq!(
            agentmail_username_from_address("Josue@Aparcedo.Org"),
            "josue-aparcedo-org"
        );
        assert_eq!(
            agentmail_username_from_address("alerts+prod@example.com"),
            "alerts-prod-example-com"
        );
    }

    #[test]
    fn infers_real_provider_from_address_for_agentmail_binding() {
        assert_eq!(infer_provider_from_address_or_host("me@proton.me", ""), "proton");
        assert_eq!(infer_provider_from_address_or_host("me@gmail.com", ""), "gmail");
        assert_eq!(infer_provider_from_address_or_host("me@aparcedo.org", ""), "imap");
    }

    #[test]
    fn validates_partial_update_mail_account_request() {
        let request = UpdateMailAccountRequest {
            id: Some("acct_agentmail_personal".into()),
            label: Some("Aparcedo Work".into()),
            provider: None,
            address: None,
            agentmail_inbox_id: None,
            forwarding_status: None,
            is_default: None,
        };

        assert!(request.validate().is_ok());
    }

    #[test]
    fn rejects_partial_update_mail_account_request_without_changes() {
        let request = UpdateMailAccountRequest {
            id: Some("acct_agentmail_personal".into()),
            label: None,
            provider: None,
            address: None,
            agentmail_inbox_id: None,
            forwarding_status: None,
            is_default: None,
        };

        assert!(request.validate().is_err());
    }

    #[test]
    fn rejects_update_mail_account_request_with_empty_changed_field() {
        let request = UpdateMailAccountRequest {
            id: Some("acct_gmail_personal".into()),
            label: Some("".into()),
            provider: None,
            address: None,
            agentmail_inbox_id: None,
            forwarding_status: None,
            is_default: None,
        };

        assert!(request.validate().is_err());
    }

    #[test]
    fn rejects_delete_mail_account_query_without_id() {
        let query = DeleteMailAccountQuery { id: None };

        assert!(query.validate().is_err());
    }

    #[test]
    fn ensure_single_default_prefers_requested_id() {
        let mut accounts = vec![
            MailAccountRecord {
                id: "a".into(),
                label: "A".into(),
                provider: "agentmail".into(),
                address: "a@example.com".into(),
                agentmail_inbox_id: "am_a".into(),
                forwarding_status: "active".into(),
                is_default: false,
            },
            MailAccountRecord {
                id: "b".into(),
                label: "B".into(),
                provider: "agentmail".into(),
                address: "b@example.com".into(),
                agentmail_inbox_id: "am_b".into(),
                forwarding_status: "active".into(),
                is_default: true,
            },
        ];

        ensure_single_default(&mut accounts, Some("a"));
        assert!(accounts[0].is_default);
        assert!(!accounts[1].is_default);
    }
}
