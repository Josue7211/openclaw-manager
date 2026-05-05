use axum::{
    extract::{Query, State},
    routing::{get, post},
    Json, Router,
};
use futures::TryStreamExt;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tokio_util::compat::TokioAsyncReadCompatExt;

use crate::error::AppError;
use crate::routes::agentmail;
use crate::routes::mail_accounts::{self, MailAccountRecord};
use crate::routes::mail_policy;
use crate::server::{AppState, RequireAuth};

// ── Credentials ─────────────────────────────────────────────────────────────

struct Credentials {
    host: String,
    port: u16,
    user: String,
    password: String,
}

fn normalized_secret_text(value: Option<String>) -> String {
    value.unwrap_or_default().trim().to_string()
}

/// Resolve IMAP credentials from AppState secrets.
/// Returns `None` when the minimum required secrets are missing.
fn get_credentials(state: &AppState) -> Option<Credentials> {
    let host = normalized_secret_text(state.secret("EMAIL_HOST"));
    let port: u16 = state
        .secret("EMAIL_PORT")
        .and_then(|v| v.parse().ok())
        .unwrap_or(993);
    let user = normalized_secret_text(state.secret("EMAIL_USER"));
    let password = normalized_secret_text(state.secret("EMAIL_PASSWORD"));

    if host.is_empty() || user.is_empty() || password.is_empty() {
        return None;
    }

    Some(Credentials {
        host,
        port,
        user,
        password,
    })
}

// ── IMAP helpers ────────────────────────────────────────────────────────────

/// The concrete TLS stream type used throughout this module.
type ImapTlsStream = async_native_tls::TlsStream<tokio_util::compat::Compat<tokio::net::TcpStream>>;

/// Connect to the IMAP server over TLS and authenticate.
async fn imap_session(creds: &Credentials) -> anyhow::Result<async_imap::Session<ImapTlsStream>> {
    let tcp = tokio::net::TcpStream::connect((&*creds.host, creds.port)).await?;
    let tls = async_native_tls::TlsConnector::new();
    let tls_stream = tls.connect(&creds.host, tcp.compat()).await?;

    let client = async_imap::Client::new(tls_stream);
    let session = client
        .login(&creds.user, &creds.password)
        .await
        .map_err(|(e, _)| e)?;

    Ok(session)
}

// ── Types ───────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
struct Email {
    id: String,
    from: String,
    subject: String,
    date: String,
    preview: String,
    read: bool,
    folder: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
struct DraftReplyRequest {
    thread_id: Option<String>,
    account_id: Option<String>,
    subject: Option<String>,
    from: Option<String>,
    preview: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
struct DraftReply {
    id: String,
    account_label: String,
    subject: String,
    body: String,
    handoff_status: String,
}

/// Strip HTML tags and collapse whitespace to produce a plain-text preview.
fn make_preview(raw: &str) -> String {
    // Mimics the TS pipeline:
    //   .replace(/=\r?\n/g, '')       — remove soft line-breaks (quoted-printable)
    //   .replace(/\r?\n/g, ' ')       — newlines → spaces
    //   .replace(/\s+/g, ' ')         — collapse whitespace
    //   .replace(/<[^>]+>/g, '')      — strip HTML tags
    let mut s = raw.to_string();

    // Remove quoted-printable soft breaks
    s = s.replace("=\r\n", "").replace("=\n", "");

    // Newlines → space
    s = s.replace("\r\n", " ").replace('\n', " ");

    // Collapse whitespace
    let mut prev_space = false;
    s = s
        .chars()
        .filter_map(|c| {
            if c.is_whitespace() {
                if prev_space {
                    None
                } else {
                    prev_space = true;
                    Some(' ')
                }
            } else {
                prev_space = false;
                Some(c)
            }
        })
        .collect();

    // Strip HTML tags (simple <…> removal)
    let mut result = String::with_capacity(s.len());
    let mut inside_tag = false;
    for c in s.chars() {
        match c {
            '<' => inside_tag = true,
            '>' if inside_tag => inside_tag = false,
            _ if !inside_tag => result.push(c),
            _ => {}
        }
    }

    let trimmed = result.trim();
    if trimmed.len() > 200 {
        // Truncate at a char boundary
        let end = trimmed
            .char_indices()
            .nth(200)
            .map(|(i, _)| i)
            .unwrap_or(trimmed.len());
        trimmed[..end].to_string()
    } else {
        trimmed.to_string()
    }
}

/// Fetch recent emails from the given IMAP folder.
async fn fetch_emails(creds: &Credentials, folder: &str, limit: u32) -> anyhow::Result<Vec<Email>> {
    let mut session = imap_session(creds).await?;
    // examine = read-only SELECT (matches TS `readOnly: true`)
    let mailbox = session.examine(folder).await?;
    let total = mailbox.exists;

    if total == 0 {
        session.logout().await?;
        return Ok(Vec::new());
    }

    let start = if total > limit { total - limit + 1 } else { 1 };
    let range = format!("{}:{}", start, total);

    let messages_stream = session
        .fetch(&range, "(UID ENVELOPE FLAGS BODY.PEEK[TEXT])")
        .await?;
    let messages: Vec<_> = messages_stream.try_collect().await?;

    let mut emails: Vec<Email> = Vec::with_capacity(messages.len());

    for msg in &messages {
        let uid = msg.uid.unwrap_or(msg.message);

        // Envelope
        let (from, subject, date) = if let Some(env) = msg.envelope() {
            let from_str = env
                .from
                .as_ref()
                .and_then(|addrs| addrs.first())
                .map(|addr| {
                    if let Some(ref name) = addr.name {
                        // The name field is raw bytes — decode as UTF-8 lossy
                        String::from_utf8_lossy(name).to_string()
                    } else if let Some(ref mbox) = addr.mailbox {
                        let mailbox_part = String::from_utf8_lossy(mbox);
                        if let Some(ref host) = addr.host {
                            format!("{}@{}", mailbox_part, String::from_utf8_lossy(host))
                        } else {
                            mailbox_part.to_string()
                        }
                    } else {
                        "Unknown".to_string()
                    }
                })
                .unwrap_or_else(|| "Unknown".to_string());

            let subj = env
                .subject
                .as_ref()
                .map(|s| String::from_utf8_lossy(s).to_string())
                .unwrap_or_else(|| "(no subject)".to_string());

            let date_str = env
                .date
                .as_ref()
                .map(|d| String::from_utf8_lossy(d).to_string())
                .unwrap_or_default();

            (from_str, subj, date_str)
        } else {
            (
                "Unknown".to_string(),
                "(no subject)".to_string(),
                String::new(),
            )
        };

        // Parse date into ISO 8601; fall back to now
        let iso_date = chrono::DateTime::parse_from_rfc2822(&date)
            .map(|dt| dt.to_rfc3339())
            .unwrap_or_else(|_| chrono::Utc::now().to_rfc3339());

        // Flags — check for \Seen
        let read = msg
            .flags()
            .any(|f| matches!(f, async_imap::types::Flag::Seen));

        // Body text preview
        let preview = msg
            .text()
            .map(|bytes| {
                let raw = String::from_utf8_lossy(bytes);
                make_preview(&raw)
            })
            .unwrap_or_default();

        emails.push(Email {
            id: format!("{}:{}", folder, uid),
            from,
            subject,
            date: iso_date,
            preview,
            read,
            folder: folder.to_string(),
        });
    }

    // Most recent first (matches TS `emails.reverse()`)
    emails.reverse();

    session.logout().await?;
    Ok(emails)
}

// ── Router ──────────────────────────────────────────────────────────────────

/// Build the email router (IMAP fetch + read/unread flag toggling).
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/email", get(get_emails).patch(patch_email))
        .route("/email/drafts", post(create_draft_reply))
        .route("/email/send", post(send_email))
}

// ── GET /api/email ──────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct GetEmailsQuery {
    folder: Option<String>,
    account_id: Option<String>,
    limit: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
struct SendEmailRequest {
    account_id: Option<String>,
    to: Option<String>,
    cc: Option<String>,
    bcc: Option<String>,
    subject: Option<String>,
    body: Option<String>,
}

/// Validate folder name: only allow alphanumeric, dots, slashes, hyphens,
/// underscores, and spaces — matching the TS regex `/^[a-zA-Z0-9./ \-_]+$/`.
fn sanitize_folder(raw: &str) -> &str {
    let valid = raw
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '/' | ' ' | '-' | '_'));
    if valid && !raw.is_empty() {
        raw
    } else {
        "INBOX"
    }
}

fn sanitize_limit(raw: Option<u32>) -> u32 {
    raw.unwrap_or(100).clamp(1, 200)
}

fn validate_patch_folder(raw: &str) -> Result<&str, AppError> {
    let valid = raw
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '/' | ' ' | '-' | '_'));
    if valid && !raw.is_empty() {
        Ok(raw)
    } else {
        Err(AppError::BadRequest(
            "Invalid folder in email id".to_string(),
        ))
    }
}

fn parse_patch_target(id: &str) -> Result<(String, u32), AppError> {
    let colon_idx = id
        .find(':')
        .ok_or_else(|| AppError::BadRequest("Invalid id format".to_string()))?;
    let raw_folder = &id[..colon_idx];
    let folder = validate_patch_folder(raw_folder)?.to_string();
    let uid_str = &id[colon_idx + 1..];
    let uid: u32 = uid_str
        .parse()
        .map_err(|_| AppError::BadRequest("Invalid uid in id".to_string()))?;

    Ok((folder, uid))
}

fn reject_unsupported_agentmail_patch(body: &PatchEmailBody) -> Result<(), AppError> {
    if body.id.as_deref().is_some_and(|id| id.starts_with("thr_")) {
        return Err(AppError::BadRequest(
            "AgentMail thread patching is not implemented yet".to_string(),
        ));
    }

    Ok(())
}

fn require_patch_read(body: &PatchEmailBody) -> Result<bool, AppError> {
    body.read
        .ok_or_else(|| AppError::BadRequest("Missing read".to_string()))
}

fn patch_missing_credentials_error() -> AppError {
    AppError::BadRequest("Missing IMAP credentials for PATCH /email".to_string())
}

fn require_patch_credentials(state: &AppState) -> Result<Credentials, AppError> {
    get_credentials(state).ok_or_else(patch_missing_credentials_error)
}

fn agentmail_threads_to_emails(threads: &[agentmail::MailThread], folder: &str) -> Vec<Email> {
    let folder = folder.to_string();
    threads
        .iter()
        .map(|thread| Email {
            id: thread.id.clone(),
            from: thread.from.clone(),
            subject: thread.subject.clone(),
            date: chrono::Utc::now().to_rfc3339(),
            preview: thread.preview.clone(),
            read: !thread.unread,
            folder: folder.clone(),
        })
        .collect()
}

fn resolve_agentmail_inbox_id(
    accounts: &[MailAccountRecord],
    selected_account_id: &str,
) -> Option<String> {
    let selected_account_id = selected_account_id.trim();
    if selected_account_id.is_empty() {
        return None;
    }

    accounts
        .iter()
        .find(|account| account.id == selected_account_id)
        .map(|account| account.agentmail_inbox_id.trim())
        .filter(|inbox_id| !inbox_id.is_empty())
        .map(str::to_string)
}

async fn list_all_agentmail_threads(
    state: &AppState,
    selected_inbox_id: Option<&str>,
    limit: usize,
) -> Result<Vec<agentmail::MailThread>, AppError> {
    let Some(inboxes) = agentmail::list_inboxes(state, 100).await? else {
        return Ok(Vec::new());
    };

    let mut threads = Vec::new();
    for inbox in inboxes {
        let inbox_id = inbox.inbox_id.trim();
        if inbox_id.is_empty() || Some(inbox_id) == selected_inbox_id {
            continue;
        }

        if let Some(inbox_threads) =
            agentmail::list_threads_for_account(state, inbox_id, limit).await?
        {
            threads.extend(inbox_threads);
        }

        if let Some(message_threads) =
            agentmail::list_messages_as_threads_for_account(state, inbox_id, limit).await?
        {
            threads.extend(message_threads);
        }

        if threads.len() >= limit {
            break;
        }
    }

    threads.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
    threads.truncate(limit);
    Ok(threads)
}

fn required_draft_text(value: Option<&str>, field: &str) -> Result<String, AppError> {
    let text = value.unwrap_or_default().trim();
    if text.is_empty() {
        return Err(AppError::BadRequest(format!("Missing {field}")));
    }
    Ok(text.to_string())
}

fn required_send_text(value: Option<&str>, field: &str) -> Result<String, AppError> {
    let text = value.unwrap_or_default().trim();
    if text.is_empty() {
        return Err(AppError::BadRequest(format!("Missing {field}")));
    }
    Ok(text.to_string())
}

fn split_recipients(value: Option<&str>) -> Vec<String> {
    value
        .unwrap_or_default()
        .split([',', ';', '\n'])
        .map(str::trim)
        .filter(|part| !part.is_empty())
        .map(str::to_string)
        .collect()
}

fn build_agentmail_send_request(
    body: &SendEmailRequest,
) -> Result<agentmail::SendMessageRequest, AppError> {
    let to = split_recipients(body.to.as_deref());
    if to.is_empty() {
        return Err(AppError::BadRequest("Missing recipient".into()));
    }

    let subject = required_send_text(body.subject.as_deref(), "subject")?;
    let text = required_send_text(body.body.as_deref(), "body")?;

    Ok(agentmail::SendMessageRequest {
        to,
        cc: split_recipients(body.cc.as_deref()),
        bcc: split_recipients(body.bcc.as_deref()),
        subject,
        text,
        labels: vec!["clawcontrol".into()],
    })
}

fn find_account_label(
    accounts: &[MailAccountRecord],
    account_id: &str,
) -> Result<String, AppError> {
    accounts
        .iter()
        .find(|account| account.id == account_id)
        .map(|account| account.label.trim())
        .filter(|label| !label.is_empty())
        .map(str::to_string)
        .ok_or_else(|| {
            AppError::BadRequest("Drafting is blocked until sender identity is resolved".into())
        })
}

fn build_draft_reply(
    accounts: &[MailAccountRecord],
    body: &DraftReplyRequest,
) -> Result<DraftReply, AppError> {
    mail_policy::mail_action_allowed("draft_reply")?;

    let thread_id = required_draft_text(body.thread_id.as_deref(), "thread_id")?;
    let account_id = required_draft_text(body.account_id.as_deref(), "account_id")?;
    let subject = required_draft_text(body.subject.as_deref(), "subject")?;
    let from = required_draft_text(body.from.as_deref(), "from")?;
    let preview = required_draft_text(body.preview.as_deref(), "preview")?;
    let account_label = find_account_label(accounts, &account_id)?;

    Ok(DraftReply {
        id: format!("draft-{thread_id}"),
        account_label,
        subject: if subject.starts_with("Re:") {
            subject
        } else {
            format!("Re: {subject}")
        },
        body: format!("Draft reply for {from}\n\n{preview}"),
        handoff_status: "needs_human_send".into(),
    })
}

async fn get_emails(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Query(params): Query<GetEmailsQuery>,
) -> Result<Json<Value>, AppError> {
    let raw_folder = params.folder.as_deref().unwrap_or("INBOX");
    let folder = sanitize_folder(raw_folder);
    let limit = sanitize_limit(params.limit);
    let accounts = mail_accounts::load_mail_accounts(&state, &session).await?;
    let selected_account_id = params
        .account_id
        .as_deref()
        .map(str::trim)
        .filter(|account_id| !account_id.is_empty())
        .map(str::to_string)
        .or_else(|| default_account_id_from_accounts(&accounts));

    if let Some(account_id) = selected_account_id.as_deref() {
        let agentmail_inbox_id = resolve_agentmail_inbox_id(&accounts, account_id);

        let mut agentmail_checked = false;
        let mut agentmail_available = false;
        if let Some(agentmail_inbox_id) = agentmail_inbox_id {
            agentmail_checked = true;
            if let Some(threads) =
                agentmail::list_threads_for_account(&state, &agentmail_inbox_id, limit as usize)
                    .await?
            {
                agentmail_available = true;
                if !threads.is_empty() {
                    let emails = agentmail_threads_to_emails(&threads, folder);
                    return Ok(Json(json!({ "threads": threads, "emails": emails })));
                }
            }

            if let Some(message_threads) = agentmail::list_messages_as_threads_for_account(
                &state,
                &agentmail_inbox_id,
                limit as usize,
            )
            .await?
            {
                agentmail_available = true;
                if !message_threads.is_empty() {
                    let emails = agentmail_threads_to_emails(&message_threads, folder);
                    return Ok(Json(
                        json!({ "threads": message_threads, "emails": emails }),
                    ));
                }
            }

            let all_inbox_threads =
                list_all_agentmail_threads(&state, Some(&agentmail_inbox_id), limit as usize)
                    .await?;
            if !all_inbox_threads.is_empty() {
                let emails = agentmail_threads_to_emails(&all_inbox_threads, folder);
                return Ok(Json(json!({
                    "threads": all_inbox_threads,
                    "emails": emails,
                    "source": "agentmail_all_inboxes"
                })));
            }

            if agentmail_available {
                return Ok(Json(json!({
                    "threads": [],
                    "emails": [],
                    "source": "agentmail"
                })));
            }
        }

        tracing::info!(
            account_id = %account_id,
            agentmail_checked,
            "AgentMail returned no mail; falling back to IMAP credentials"
        );
    }

    let creds = match get_credentials(&state) {
        Some(c) => c,
        None => {
            // Match TS: return 200 with error key and empty array
            return Ok(Json(
                json!({ "error": "missing_credentials", "emails": [], "threads": [] }),
            ));
        }
    };

    match fetch_emails(&creds, folder, limit).await {
        Ok(emails) => Ok(Json(json!({ "emails": emails }))),
        Err(e) => {
            tracing::error!("[email] GET error: {:#}", e);
            // Match TS: return 500 with error string
            Err(AppError::Internal(e))
        }
    }
}

fn default_account_id_from_accounts(accounts: &[MailAccountRecord]) -> Option<String> {
    accounts
        .iter()
        .find(|account| account.is_default)
        .or_else(|| accounts.first())
        .map(|account| account.id.clone())
}

// ── PATCH /api/email ────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct PatchEmailBody {
    id: Option<String>,
    read: Option<bool>,
    account_id: Option<String>,
}

async fn patch_email(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Json(body): Json<PatchEmailBody>,
) -> Result<Json<Value>, AppError> {
    let id = body
        .id
        .as_deref()
        .ok_or_else(|| AppError::BadRequest("Missing id".to_string()))?;
    let _ = body.account_id.as_deref();

    reject_unsupported_agentmail_patch(&body)?;

    let read = require_patch_read(&body)?;

    let creds = require_patch_credentials(&state)?;

    // Parse "FOLDER:UID" with strict folder validation for PATCH requests.
    let (folder, uid) = parse_patch_target(id)?;

    let mut session = imap_session(&creds).await.map_err(|e| {
        tracing::error!("[email] PATCH connect error: {:#}", e);
        AppError::Internal(e)
    })?;

    // Select mailbox (read-write for flag changes)
    session.select(folder).await.map_err(|e| {
        tracing::error!("[email] PATCH select error: {:#}", e);
        AppError::Internal(e.into())
    })?;

    let uid_set = uid.to_string();
    let flag_op = if read {
        "+FLAGS (\\Seen)"
    } else {
        "-FLAGS (\\Seen)"
    };

    let updates = session.uid_store(&uid_set, flag_op).await.map_err(|e| {
        tracing::error!("[email] PATCH store error: {:#}", e);
        AppError::Internal(e.into())
    })?;

    // Consume the stream to ensure the command completes and release the borrow on session
    let _: Vec<_> = updates.try_collect().await.map_err(|e| {
        tracing::error!("[email] PATCH collect error: {:#}", e);
        AppError::Internal(e.into())
    })?;

    let _ = session.logout().await;
    Ok(Json(json!({ "ok": true })))
}

async fn create_draft_reply(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Json(body): Json<DraftReplyRequest>,
) -> Result<Json<Value>, AppError> {
    let accounts = mail_accounts::load_mail_accounts(&state, &session).await?;
    let draft = build_draft_reply(&accounts, &body)?;
    Ok(Json(json!({ "draft": draft })))
}

async fn send_email(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Json(body): Json<SendEmailRequest>,
) -> Result<Json<Value>, AppError> {
    let account_id = required_send_text(body.account_id.as_deref(), "account_id")?;
    let accounts = mail_accounts::load_mail_accounts(&state, &session).await?;
    let account = accounts
        .iter()
        .find(|account| account.id == account_id)
        .ok_or_else(|| {
            AppError::BadRequest("Sending is blocked until sender identity is resolved".into())
        })?;
    let inbox_id = account.agentmail_inbox_id.trim();
    if inbox_id.is_empty() {
        return Err(AppError::BadRequest(
            "Selected account has no AgentMail inbox id".into(),
        ));
    }

    let send_body = build_agentmail_send_request(&body)?;
    let sent = agentmail::send_message_for_account(&state, inbox_id, &send_body).await?;
    Ok(Json(json!({ "sent": sent })))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::routes::agentmail::MailThread;

    #[test]
    fn resolves_sender_identity_for_draftable_thread() {
        let thread = MailThread {
            id: "thr_123".into(),
            account_id: Some("acct_gmail_personal".into()),
            subject: "Quarterly update".into(),
            from: "boss@example.com".into(),
            preview: "Can you reply by Friday?".into(),
            unread: true,
            timestamp: None,
            message_count: None,
        };

        assert!(thread.draftable_account_id().is_some());
    }

    #[test]
    fn blocks_draft_when_thread_has_no_account_identity() {
        let thread = MailThread {
            id: "thr_anon".into(),
            account_id: None,
            subject: "Unknown".into(),
            from: "mystery@example.com".into(),
            preview: "hello".into(),
            unread: true,
            timestamp: None,
            message_count: None,
        };

        assert!(thread.draftable_account_id().is_none());
    }

    #[test]
    fn rejects_invalid_patch_folder() {
        let err = parse_patch_target("BAD!BOX:123").unwrap_err();
        assert!(matches!(err, AppError::BadRequest(_)));
    }

    #[test]
    fn rejects_missing_read_in_patch_body() {
        let body = PatchEmailBody {
            id: Some("INBOX:123".into()),
            read: None,
            account_id: None,
        };

        let err = require_patch_read(&body).unwrap_err();

        assert!(matches!(err, AppError::BadRequest(_)));
    }

    #[test]
    fn rejects_agentmail_style_patch_payloads() {
        let body = PatchEmailBody {
            id: Some("thr_123".into()),
            read: Some(true),
            account_id: Some("acct_gmail_personal".into()),
        };

        let err = reject_unsupported_agentmail_patch(&body).unwrap_err();
        assert!(format!("{err:?}").contains("AgentMail thread patching is not implemented yet"));
    }

    #[test]
    fn allows_imap_patch_id_even_when_account_id_is_present() {
        let body = PatchEmailBody {
            id: Some("INBOX:123".into()),
            read: Some(true),
            account_id: Some("acct_gmail_personal".into()),
        };

        assert!(reject_unsupported_agentmail_patch(&body).is_ok());
    }

    #[test]
    fn classifies_missing_patch_credentials_as_bad_request() {
        let err = patch_missing_credentials_error();
        assert!(matches!(err, AppError::BadRequest(_)));
        assert!(format!("{err:?}").contains("Missing IMAP credentials for PATCH /email"));
    }

    #[test]
    fn normalizes_secret_text_before_missing_check() {
        assert_eq!(
            normalized_secret_text(Some("  host.example.com ".into())),
            "host.example.com"
        );
        assert_eq!(normalized_secret_text(Some("   ".into())), "");
        assert_eq!(normalized_secret_text(None), "");
    }

    #[test]
    fn validates_parse_patch_target_for_inbox_uid() {
        let (folder, uid) = parse_patch_target("INBOX:123").unwrap();
        assert_eq!(folder, "INBOX");
        assert_eq!(uid, 123);
    }

    #[test]
    fn maps_agentmail_threads_into_emails_shape() {
        let threads = vec![crate::routes::agentmail::MailThread {
            id: "thr_1".into(),
            account_id: Some("acct_1".into()),
            subject: "Hello".into(),
            from: "sender@example.com".into(),
            preview: "Preview".into(),
            unread: true,
            timestamp: None,
            message_count: None,
        }];

        let emails = agentmail_threads_to_emails(&threads, "INBOX");
        assert_eq!(emails.len(), 1);
        assert_eq!(emails[0].id, "thr_1");
        assert_eq!(emails[0].folder, "INBOX");
        assert!(!emails[0].read);
        assert_eq!(emails[0].subject, "Hello");
    }

    #[test]
    fn resolves_agentmail_inbox_id_from_linked_account_id() {
        let accounts = vec![
            MailAccountRecord {
                id: "acct_personal".into(),
                label: "Personal".into(),
                provider: "gmail".into(),
                address: "me@gmail.com".into(),
                agentmail_inbox_id: "am_inbox_personal".into(),
                forwarding_status: "active".into(),
                is_default: true,
            },
            MailAccountRecord {
                id: "acct_work".into(),
                label: "Work".into(),
                provider: "google-workspace".into(),
                address: "me@work.com".into(),
                agentmail_inbox_id: "am_inbox_work".into(),
                forwarding_status: "active".into(),
                is_default: false,
            },
        ];

        let resolved = resolve_agentmail_inbox_id(&accounts, "acct_work");

        assert_eq!(resolved.as_deref(), Some("am_inbox_work"));
    }

    #[test]
    fn sorts_agentmail_threads_by_timestamp_descending() {
        let mut threads = [
            MailThread {
                id: "old".into(),
                account_id: Some("acct".into()),
                subject: "Old".into(),
                from: "old@example.com".into(),
                preview: "old".into(),
                unread: false,
                timestamp: Some("2026-01-01T00:00:00Z".into()),
                message_count: Some(1),
            },
            MailThread {
                id: "new".into(),
                account_id: Some("acct".into()),
                subject: "New".into(),
                from: "new@example.com".into(),
                preview: "new".into(),
                unread: true,
                timestamp: Some("2026-02-01T00:00:00Z".into()),
                message_count: Some(1),
            },
        ];

        threads.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));

        assert_eq!(threads[0].id, "new");
    }

    #[test]
    fn builds_draft_reply_with_resolved_sender_identity() {
        let accounts = vec![MailAccountRecord {
            id: "acct_personal".into(),
            label: "Personal Gmail".into(),
            provider: "gmail".into(),
            address: "me@gmail.com".into(),
            agentmail_inbox_id: "am_1".into(),
            forwarding_status: "active".into(),
            is_default: true,
        }];
        let body = DraftReplyRequest {
            thread_id: Some("thr_1".into()),
            account_id: Some("acct_personal".into()),
            subject: Some("Quarterly update".into()),
            from: Some("boss@example.com".into()),
            preview: Some("Can you reply by Friday?".into()),
        };

        let draft = build_draft_reply(&accounts, &body).unwrap();

        assert_eq!(draft.account_label, "Personal Gmail");
        assert_eq!(draft.subject, "Re: Quarterly update");
        assert_eq!(draft.handoff_status, "needs_human_send");
    }

    #[test]
    fn clamps_email_fetch_limit() {
        assert_eq!(sanitize_limit(None), 100);
        assert_eq!(sanitize_limit(Some(0)), 1);
        assert_eq!(sanitize_limit(Some(250)), 200);
        assert_eq!(sanitize_limit(Some(75)), 75);
    }

    #[test]
    fn builds_agentmail_send_request_from_compose_payload() {
        let body = SendEmailRequest {
            account_id: Some("acct_personal".into()),
            to: Some("a@example.com, b@example.com".into()),
            cc: Some("c@example.com".into()),
            bcc: None,
            subject: Some("Hello".into()),
            body: Some("Body text".into()),
        };

        let request = build_agentmail_send_request(&body).unwrap();

        assert_eq!(request.to, vec!["a@example.com", "b@example.com"]);
        assert_eq!(request.cc, vec!["c@example.com"]);
        assert_eq!(request.subject, "Hello");
        assert_eq!(request.text, "Body text");
        assert_eq!(request.labels, vec!["clawcontrol"]);
    }

    #[test]
    fn rejects_send_without_recipient() {
        let body = SendEmailRequest {
            account_id: Some("acct_personal".into()),
            to: Some("   ".into()),
            cc: None,
            bcc: None,
            subject: Some("Hello".into()),
            body: Some("Body text".into()),
        };

        let err = build_agentmail_send_request(&body).unwrap_err();

        assert!(matches!(err, AppError::BadRequest(_)));
        assert!(format!("{err:?}").contains("Missing recipient"));
    }

    #[test]
    fn blocks_draft_reply_without_resolved_sender_identity() {
        let accounts = vec![];
        let body = DraftReplyRequest {
            thread_id: Some("thr_1".into()),
            account_id: Some("acct_missing".into()),
            subject: Some("Quarterly update".into()),
            from: Some("boss@example.com".into()),
            preview: Some("Can you reply by Friday?".into()),
        };

        let err = build_draft_reply(&accounts, &body).unwrap_err();

        assert!(matches!(err, AppError::BadRequest(_)));
        assert!(format!("{err:?}").contains("sender identity"));
    }
}
