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
    #[serde(default)]
    pub imap_host: String,
    #[serde(default = "default_imap_port")]
    pub imap_port: u16,
    #[serde(default)]
    pub imap_username: String,
    #[serde(default)]
    pub imap_password: String,
}

impl Default for MailAccountRecord {
    fn default() -> Self {
        Self {
            id: String::new(),
            label: String::new(),
            provider: String::new(),
            address: String::new(),
            agentmail_inbox_id: String::new(),
            forwarding_status: "pending".into(),
            is_default: false,
            imap_host: String::new(),
            imap_port: 993,
            imap_username: String::new(),
            imap_password: String::new(),
        }
    }
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

fn default_imap_port() -> u16 {
    993
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PublicMailAccountRecord {
    pub id: String,
    pub label: String,
    pub provider: String,
    pub address: String,
    pub agentmail_inbox_id: String,
    pub forwarding_status: String,
    pub is_default: bool,
    pub imap_host: String,
    pub imap_port: u16,
    pub imap_username: String,
    pub imap_configured: bool,
}

impl From<&MailAccountRecord> for PublicMailAccountRecord {
    fn from(account: &MailAccountRecord) -> Self {
        Self {
            id: account.id.clone(),
            label: account.label.clone(),
            provider: account.provider.clone(),
            address: account.address.clone(),
            agentmail_inbox_id: account.agentmail_inbox_id.clone(),
            forwarding_status: account.forwarding_status.clone(),
            is_default: account.is_default,
            imap_host: account.imap_host.clone(),
            imap_port: normalized_imap_port(account.imap_port),
            imap_username: account.imap_username.clone(),
            imap_configured: account.has_direct_imap_credentials(),
        }
    }
}

impl MailAccountRecord {
    pub fn has_direct_imap_credentials(&self) -> bool {
        !self.imap_host.trim().is_empty() && !self.imap_password.trim().is_empty()
    }
}

fn public_mail_accounts(accounts: &[MailAccountRecord]) -> Vec<PublicMailAccountRecord> {
    accounts.iter().map(PublicMailAccountRecord::from).collect()
}

fn normalized_imap_port(port: u16) -> u16 {
    if port == 0 {
        993
    } else {
        port
    }
}

fn is_agentmail_provider(provider: &str) -> bool {
    provider.trim().eq_ignore_ascii_case("agentmail")
}

fn validate_agentmail_access_policy(
    provider: &str,
    agentmail_inbox_id: &str,
) -> Result<(), AppError> {
    let _ = (provider, agentmail_inbox_id);
    Ok(())
}

#[derive(Debug, Deserialize)]
struct CreateMailAccountRequest {
    label: Option<String>,
    provider: Option<String>,
    address: Option<String>,
    agentmail_inbox_id: Option<String>,
    forwarding_status: Option<String>,
    is_default: Option<bool>,
    imap_host: Option<String>,
    imap_port: Option<u16>,
    imap_username: Option<String>,
    imap_password: Option<String>,
}

impl CreateMailAccountRequest {
    fn validate(&self) -> Result<(), AppError> {
        let _ = self.is_default;
        required_text(&self.label, "label")?;
        required_text(&self.provider, "provider")?;
        required_text(&self.address, "address")?;
        required_text(&self.forwarding_status, "forwarding_status")?;
        let _ = optional_text_blank_as_none(&self.agentmail_inbox_id);
        let _ = optional_text_blank_as_none(&self.imap_host);
        let _ = optional_text_blank_as_none(&self.imap_username);
        let _ = optional_text_blank_as_none(&self.imap_password);
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
    imap_host: Option<String>,
    imap_port: Option<u16>,
    imap_username: Option<String>,
    imap_password: Option<String>,
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
            && self.imap_host.is_none()
            && self.imap_port.is_none()
            && self.imap_username.is_none()
            && self.imap_password.is_none()
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
        let _ = optional_text_allow_blank(&self.imap_host);
        let _ = optional_text_allow_blank(&self.imap_username);
        let _ = optional_text_blank_as_none(&self.imap_password);
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
const LOCAL_MAIL_ACCOUNTS_KEY: &str = "mail_accounts.local";

fn load_local_mail_accounts() -> Vec<MailAccountRecord> {
    let Some(json) = crate::secrets::get_internal_entry(LOCAL_MAIL_ACCOUNTS_KEY) else {
        return Vec::new();
    };

    match serde_json::from_str::<Vec<MailAccountRecord>>(&json) {
        Ok(accounts) => accounts,
        Err(err) => {
            tracing::warn!("failed to parse local mail account registry: {err}");
            Vec::new()
        }
    }
}

fn save_local_mail_accounts(accounts: &[MailAccountRecord]) -> Result<(), AppError> {
    let json = serde_json::to_string(accounts).map_err(|err| {
        AppError::Internal(anyhow::anyhow!(
            "failed to serialize local mail accounts: {err}"
        ))
    })?;

    crate::secrets::set_entry(LOCAL_MAIL_ACCOUNTS_KEY, &json).map_err(|err| {
        AppError::Internal(anyhow::anyhow!(
            "failed to save local mail account registry: {err}"
        ))
    })
}

pub(crate) async fn load_mail_accounts(
    state: &AppState,
    session: &crate::server::UserSession,
) -> Result<Vec<MailAccountRecord>, AppError> {
    let local_accounts = load_local_mail_accounts();

    if session.encryption_key.is_empty() {
        return Ok(local_accounts);
    }

    let sb = match SupabaseClient::from_state(state) {
        Ok(sb) => sb,
        Err(err) => {
            tracing::warn!("mail account cloud registry unavailable: {err}");
            return Ok(local_accounts);
        }
    };
    let rows = match sb
        .select_as_user(
            "user_secrets",
            &format!(
                "select=encrypted_credentials,nonce&service=eq.{}&limit=1",
                MAIL_ACCOUNTS_SERVICE
            ),
            &session.access_token,
        )
        .await
    {
        Ok(rows) => rows,
        Err(err) => {
            tracing::warn!("mail account cloud registry load failed: {err}");
            return Ok(local_accounts);
        }
    };

    let Some(row) = rows.as_array().and_then(|arr| arr.first()) else {
        if !local_accounts.is_empty() {
            if let Err(err) = save_cloud_mail_accounts(state, session, &local_accounts).await {
                tracing::warn!("failed to promote local mail accounts to cloud registry: {err:?}");
            }
        }
        return Ok(local_accounts);
    };

    let Some(ciphertext) = row["encrypted_credentials"].as_str() else {
        tracing::warn!("mail account cloud registry row missing encrypted_credentials");
        return Ok(local_accounts);
    };
    let Some(nonce) = row["nonce"].as_str() else {
        tracing::warn!("mail account cloud registry row missing nonce");
        return Ok(local_accounts);
    };

    let plaintext = match crate::crypto::decrypt(ciphertext, nonce, &session.encryption_key) {
        Ok(plaintext) => plaintext,
        Err(err) => {
            tracing::warn!(
                "mail account cloud registry decrypt failed; using local fallback: {err}"
            );
            return Ok(local_accounts);
        }
    };

    let cloud_accounts = match serde_json::from_slice::<Vec<MailAccountRecord>>(&plaintext) {
        Ok(accounts) => accounts,
        Err(err) => {
            tracing::warn!("mail account cloud registry JSON invalid; using local fallback: {err}");
            return Ok(local_accounts);
        }
    };

    if local_accounts.is_empty() && !cloud_accounts.is_empty() {
        if let Err(err) = save_local_mail_accounts(&cloud_accounts) {
            tracing::warn!("failed to mirror cloud mail accounts locally: {err:?}");
        }
        return Ok(cloud_accounts);
    }

    let merged = merge_mail_account_sets(local_accounts.clone(), cloud_accounts.clone());

    if merged != local_accounts {
        if let Err(err) = save_local_mail_accounts(&merged) {
            tracing::warn!("failed to update local mail account registry from merge: {err:?}");
        }
    }

    if merged != cloud_accounts {
        if let Err(err) = save_cloud_mail_accounts(state, session, &merged).await {
            tracing::warn!("failed to update cloud mail account registry from merge: {err:?}");
        }
    }

    Ok(merged)
}

pub(crate) async fn save_cloud_mail_accounts(
    state: &AppState,
    session: &crate::server::UserSession,
    accounts: &[MailAccountRecord],
) -> Result<(), AppError> {
    if session.encryption_key.is_empty() {
        tracing::warn!("mail account cloud sync skipped: encryption key unavailable");
        return Ok(());
    }

    let json_bytes = serde_json::to_vec(accounts).map_err(|e| {
        AppError::Internal(anyhow::anyhow!("failed to serialize mail_accounts: {e}"))
    })?;
    let (ciphertext, nonce) = crate::crypto::encrypt(&json_bytes, &session.encryption_key)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("encryption failed: {e}")))?;

    let sb = match SupabaseClient::from_state(state) {
        Ok(sb) => sb,
        Err(err) => {
            tracing::warn!("mail account saved locally only: cloud registry unavailable: {err}");
            return Ok(());
        }
    };
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

pub(crate) async fn repair_cloud_mail_accounts_from_local(
    state: &AppState,
    session: &crate::server::UserSession,
) -> Result<bool, AppError> {
    let local_accounts = load_local_mail_accounts();
    if local_accounts.is_empty() {
        return Ok(false);
    }

    save_cloud_mail_accounts(state, session, &local_accounts).await?;
    Ok(true)
}

async fn save_mail_accounts(
    state: &AppState,
    session: &crate::server::UserSession,
    accounts: &[MailAccountRecord],
) -> Result<(), AppError> {
    save_local_mail_accounts(accounts)?;

    if let Err(err) = save_cloud_mail_accounts(state, session, accounts).await {
        tracing::warn!("mail account cloud registry save failed after local save: {err:?}");
    }

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
    let accounts = merge_configured_mail_accounts_with_discovery(
        &state,
        load_mail_accounts(&state, &session).await?,
    )
    .await;
    Ok(Json(json!({ "accounts": public_mail_accounts(&accounts) })))
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
    validate_agentmail_access_policy(&provider, &agentmail_inbox_id)?;
    let account = MailAccountRecord {
        id: random_uuid(),
        label,
        provider,
        address: address.clone(),
        agentmail_inbox_id,
        forwarding_status: required_text(&body.forwarding_status, "forwarding_status")?,
        is_default: body.is_default.unwrap_or(accounts.is_empty()),
        imap_host: optional_text_blank_as_none(&body.imap_host).unwrap_or_default(),
        imap_port: normalized_imap_port(body.imap_port.unwrap_or(993)),
        imap_username: optional_text_blank_as_none(&body.imap_username).unwrap_or_default(),
        imap_password: optional_text_blank_as_none(&body.imap_password).unwrap_or_default(),
    };
    account.validate()?;
    accounts.push(account.clone());

    if account.is_default {
        ensure_single_default(&mut accounts, Some(&account.id));
    } else {
        ensure_single_default(&mut accounts, None);
    }

    save_mail_accounts(&state, &session, &accounts).await?;
    Ok(Json(json!({
        "account": PublicMailAccountRecord::from(&account),
        "accounts": public_mail_accounts(&accounts)
    })))
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
    if let Some(value) = optional_text_allow_blank(&body.imap_host) {
        account.imap_host = value;
    }
    if let Some(value) = body.imap_port {
        account.imap_port = normalized_imap_port(value);
    }
    if let Some(value) = optional_text_allow_blank(&body.imap_username) {
        account.imap_username = value;
    }
    if let Some(value) = optional_text_blank_as_none(&body.imap_password) {
        account.imap_password = value;
    }

    validate_agentmail_access_policy(&account.provider, &account.agentmail_inbox_id)?;
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

    Ok(Json(json!({
        "account": PublicMailAccountRecord::from(&updated),
        "accounts": public_mail_accounts(&accounts)
    })))
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
    Ok(Json(json!({
        "deleted": true,
        "accounts": public_mail_accounts(&accounts)
    })))
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
        address: address.clone(),
        agentmail_inbox_id: default_agentmail_inbox_for_address(state, &address),
        forwarding_status: "active".into(),
        is_default: true,
        imap_host: host,
        imap_port: state
            .secret("EMAIL_PORT")
            .and_then(|value| value.trim().parse::<u16>().ok())
            .map(normalized_imap_port)
            .unwrap_or(993),
        imap_username: address.clone(),
        imap_password: state
            .secret("EMAIL_PASSWORD")
            .map(|value| value.trim().to_string())
            .unwrap_or_default(),
    }]
}

pub(crate) fn default_mail_accounts(state: &AppState) -> Vec<MailAccountRecord> {
    default_imap_accounts(state)
}

fn default_agentmail_inbox_for_address(state: &AppState, address: &str) -> String {
    let Some(inbox_id) = state
        .secret("AGENTMAIL_DEFAULT_INBOX_ID")
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
    else {
        return String::new();
    };

    let default_address = state
        .secret("AGENTMAIL_DEFAULT_ADDRESS")
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    match default_address {
        Some(default_address) if default_address.eq_ignore_ascii_case(address) => inbox_id,
        None => inbox_id,
        Some(_) => String::new(),
    }
}

#[cfg(test)]
fn account_from_agentmail_inbox(inbox: agentmail::AgentMailInbox) -> Option<MailAccountRecord> {
    let inbox_id = inbox.inbox_id.trim().to_string();
    if inbox_id.is_empty() {
        return None;
    }

    let address = inbox
        .email
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(inbox_id.as_str())
        .to_string();
    let label = inbox
        .display_name
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(address.as_str())
        .to_string();

    Some(MailAccountRecord {
        id: format!("agentmail:{inbox_id}"),
        label,
        provider: infer_provider_from_address_or_host(&address, ""),
        address,
        agentmail_inbox_id: inbox_id,
        forwarding_status: "active".into(),
        is_default: false,
        imap_host: String::new(),
        imap_port: 993,
        imap_username: String::new(),
        imap_password: String::new(),
    })
}

pub(crate) async fn merge_configured_mail_accounts_with_discovery(
    state: &AppState,
    saved_accounts: Vec<MailAccountRecord>,
) -> Vec<MailAccountRecord> {
    let configured_accounts = default_mail_accounts(state);
    merge_mail_account_sets(configured_accounts, saved_accounts)
}

fn merge_mail_account_sets(
    configured_accounts: Vec<MailAccountRecord>,
    saved_accounts: Vec<MailAccountRecord>,
) -> Vec<MailAccountRecord> {
    if configured_accounts.is_empty() {
        return saved_accounts;
    }

    let mut accounts: Vec<MailAccountRecord> = Vec::new();
    for account in saved_accounts.into_iter().chain(configured_accounts) {
        if let Some(existing) = accounts.iter_mut().find(|existing| {
            existing.id == account.id
                || (!account.agentmail_inbox_id.is_empty()
                    && existing.agentmail_inbox_id == account.agentmail_inbox_id)
        }) {
            if !existing.is_default && account.is_default {
                existing.is_default = true;
            }
            if existing.imap_password.trim().is_empty() && account.has_direct_imap_credentials() {
                existing.imap_host = account.imap_host;
                existing.imap_port = account.imap_port;
                existing.imap_username = account.imap_username;
                existing.imap_password = account.imap_password;
            }
            continue;
        }
        accounts.push(account);
    }

    let preferred_default_id = accounts
        .iter()
        .find(|account| account.id.starts_with("imap:") && account.is_default)
        .map(|account| account.id.clone())
        .or_else(|| {
            accounts
                .iter()
                .find(|account| account.is_default)
                .map(|account| account.id.clone())
        });
    ensure_single_default(&mut accounts, preferred_default_id.as_deref());
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
            ..MailAccountRecord::default()
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
            ..MailAccountRecord::default()
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
            ..MailAccountRecord::default()
        };

        assert!(entry.validate().is_ok());
    }

    #[test]
    fn public_mail_account_never_serializes_imap_password() {
        let entry = MailAccountRecord {
            id: "acct_proton".into(),
            label: "Proton".into(),
            provider: "proton".into(),
            address: "me@proton.me".into(),
            forwarding_status: "active".into(),
            is_default: true,
            imap_host: "127.0.0.1".into(),
            imap_port: 1143,
            imap_username: "me@proton.me".into(),
            imap_password: "bridge-secret".into(),
            ..MailAccountRecord::default()
        };

        let public = PublicMailAccountRecord::from(&entry);
        let serialized = serde_json::to_string(&public).unwrap();

        assert!(public.imap_configured);
        assert!(!serialized.contains("bridge-secret"));
        assert!(!serialized.contains("imap_password"));
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
            imap_host: None,
            imap_port: None,
            imap_username: None,
            imap_password: None,
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
            imap_host: None,
            imap_port: None,
            imap_username: None,
            imap_password: None,
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
            imap_host: None,
            imap_port: None,
            imap_username: None,
            imap_password: None,
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
            imap_host: None,
            imap_port: None,
            imap_username: None,
            imap_password: None,
        };

        assert!(request.validate().is_ok());
    }

    #[test]
    fn gmail_allows_direct_imap_without_agentmail_mapping() {
        assert!(validate_agentmail_access_policy("gmail", " ").is_ok());
    }

    #[test]
    fn gmail_with_agentmail_access_mapping_is_still_allowed() {
        assert!(validate_agentmail_access_policy("google-workspace", "am_inbox_personal").is_ok());
    }

    #[test]
    fn custom_imap_allows_gmail_address_without_agentmail_mapping() {
        assert!(validate_agentmail_access_policy("imap", "").is_ok());
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
            imap_host: None,
            imap_port: None,
            imap_username: None,
            imap_password: None,
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
        assert_eq!(
            infer_provider_from_address_or_host("me@proton.me", ""),
            "proton"
        );
        assert_eq!(
            infer_provider_from_address_or_host("me@gmail.com", ""),
            "gmail"
        );
        assert_eq!(
            infer_provider_from_address_or_host("me@aparcedo.org", ""),
            "imap"
        );
    }

    #[test]
    fn maps_agentmail_inbox_to_agent_access_account() {
        let account = account_from_agentmail_inbox(agentmail::AgentMailInbox {
            inbox_id: "inbox_123".into(),
            email: Some("agent@aparcedo.org".into()),
            display_name: Some("Agent Access".into()),
            client_id: None,
        })
        .unwrap();

        assert_eq!(account.id, "agentmail:inbox_123");
        assert_eq!(account.label, "Agent Access");
        assert_eq!(account.provider, "imap");
        assert_eq!(account.address, "agent@aparcedo.org");
        assert_eq!(account.agentmail_inbox_id, "inbox_123");
        assert!(account.validate().is_ok());
    }

    #[test]
    fn merge_mail_account_sets_deduplicates_agentmail_discovery() {
        let configured = vec![MailAccountRecord {
            id: "agentmail:inbox_123".into(),
            label: "Discovered".into(),
            provider: "imap".into(),
            address: "agent@aparcedo.org".into(),
            agentmail_inbox_id: "inbox_123".into(),
            forwarding_status: "active".into(),
            is_default: false,
            ..MailAccountRecord::default()
        }];
        let saved = vec![MailAccountRecord {
            id: "saved-agent".into(),
            label: "Saved".into(),
            provider: "proton".into(),
            address: "agent@aparcedo.org".into(),
            agentmail_inbox_id: "inbox_123".into(),
            forwarding_status: "active".into(),
            is_default: true,
            ..MailAccountRecord::default()
        }];

        let accounts = merge_mail_account_sets(configured, saved);
        assert_eq!(accounts.len(), 1);
        assert_eq!(accounts[0].label, "Saved");
        assert!(accounts[0].is_default);
    }

    #[test]
    fn merge_mail_account_sets_prefers_saved_imap_bridge_settings() {
        let configured = vec![MailAccountRecord {
            id: "imap:me@proton.me".into(),
            label: "Proton".into(),
            provider: "proton".into(),
            address: "me@proton.me".into(),
            forwarding_status: "active".into(),
            is_default: true,
            imap_host: "127.0.0.1".into(),
            imap_port: 993,
            imap_username: "me@proton.me".into(),
            imap_password: "configured-secret".into(),
            ..MailAccountRecord::default()
        }];
        let saved = vec![MailAccountRecord {
            id: "imap:me@proton.me".into(),
            label: "Proton Mail".into(),
            provider: "proton".into(),
            address: "me@proton.me".into(),
            forwarding_status: "active".into(),
            is_default: true,
            imap_host: "127.0.0.1".into(),
            imap_port: 1143,
            imap_username: "me@proton.me".into(),
            imap_password: "bridge-secret".into(),
            ..MailAccountRecord::default()
        }];

        let accounts = merge_mail_account_sets(configured, saved);
        assert_eq!(accounts.len(), 1);
        assert_eq!(accounts[0].label, "Proton Mail");
        assert_eq!(accounts[0].imap_port, 1143);
        assert_eq!(accounts[0].imap_password, "bridge-secret");
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
            imap_host: None,
            imap_port: None,
            imap_username: None,
            imap_password: None,
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
            imap_host: None,
            imap_port: None,
            imap_username: None,
            imap_password: None,
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
            imap_host: None,
            imap_port: None,
            imap_username: None,
            imap_password: None,
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
                ..MailAccountRecord::default()
            },
            MailAccountRecord {
                id: "b".into(),
                label: "B".into(),
                provider: "agentmail".into(),
                address: "b@example.com".into(),
                agentmail_inbox_id: "am_b".into(),
                forwarding_status: "active".into(),
                is_default: true,
                ..MailAccountRecord::default()
            },
        ];

        ensure_single_default(&mut accounts, Some("a"));
        assert!(accounts[0].is_default);
        assert!(!accounts[1].is_default);
    }
}
