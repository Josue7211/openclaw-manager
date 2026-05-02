use axum::{
    extract::{Query, State},
    routing::{get, post},
    Extension, Json, Router,
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
}

// ── GET /api/email ──────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct GetEmailsQuery {
    folder: Option<String>,
    account_id: Option<String>,
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

async fn resolve_linked_agentmail_inbox_id(
    state: &AppState,
    session: &crate::server::UserSession,
    selected_account_id: &str,
) -> Result<Option<String>, AppError> {
    let accounts = mail_accounts::load_mail_accounts(state, session).await?;
    Ok(resolve_agentmail_inbox_id(&accounts, selected_account_id))
}

fn required_draft_text(value: Option<&str>, field: &str) -> Result<String, AppError> {
    let text = value.unwrap_or_default().trim();
    if text.is_empty() {
        return Err(AppError::BadRequest(format!("Missing {field}")));
    }
    Ok(text.to_string())
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
    session: Option<Extension<crate::server::UserSession>>,
    Query(params): Query<GetEmailsQuery>,
) -> Result<Json<Value>, AppError> {
    let raw_folder = params.folder.as_deref().unwrap_or("INBOX");
    let folder = sanitize_folder(raw_folder);
    let selected_account_id = params
        .account_id
        .as_deref()
        .map(str::trim)
        .filter(|account_id| !account_id.is_empty())
        .map(str::to_string)
        .or_else(|| default_account_id_for_email_request(&state, session.as_ref()));

    if let Some(account_id) = selected_account_id.as_deref() {
        let agentmail_inbox_id = if let Some(Extension(session)) = session.as_ref() {
            resolve_linked_agentmail_inbox_id(&state, session, account_id).await?
        } else {
            resolve_agentmail_inbox_id(
                &mail_accounts::default_agentmail_accounts(&state),
                account_id,
            )
        };

        if let Some(agentmail_inbox_id) = agentmail_inbox_id {
            if let Some(threads) =
                agentmail::list_threads_for_account(&state, &agentmail_inbox_id, 20).await?
            {
                let emails = agentmail_threads_to_emails(&threads, folder);
                return Ok(Json(json!({ "threads": threads, "emails": emails })));
            }
        }
    }

    let creds = match get_credentials(&state) {
        Some(c) => c,
        None => {
            // Match TS: return 200 with error key and empty array
            return Ok(Json(
                json!({ "error": "missing_credentials", "emails": [] }),
            ));
        }
    };

    match fetch_emails(&creds, folder, 20).await {
        Ok(emails) => Ok(Json(json!({ "emails": emails }))),
        Err(e) => {
            tracing::error!("[email] GET error: {:#}", e);
            // Match TS: return 500 with error string
            Err(AppError::Internal(e))
        }
    }
}

fn default_account_id_for_email_request(
    state: &AppState,
    session: Option<&Extension<crate::server::UserSession>>,
) -> Option<String> {
    if session.is_some() {
        return None;
    }

    mail_accounts::default_agentmail_accounts(state)
        .into_iter()
        .find(|account| account.is_default)
        .or_else(|| mail_accounts::default_agentmail_accounts(state).into_iter().next())
        .map(|account| account.id)
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
