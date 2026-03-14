use axum::{
    extract::{Query, State},
    routing::get,
    Json, Router,
};
use futures::TryStreamExt;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tokio_util::compat::TokioAsyncReadCompatExt;

use crate::error::AppError;
use crate::server::AppState;

// ── Credentials ─────────────────────────────────────────────────────────────

struct Credentials {
    host: String,
    port: u16,
    user: String,
    password: String,
}

/// Resolve IMAP credentials from AppState secrets.
/// Returns `None` when the minimum required secrets are missing.
fn get_credentials(state: &AppState) -> Option<Credentials> {
    let host = state.secret_or_default("EMAIL_HOST");
    let port: u16 = state.secret("EMAIL_PORT")
        .and_then(|v| v.parse().ok())
        .unwrap_or(993);
    let user = state.secret_or_default("EMAIL_USER");
    let password = state.secret_or_default("EMAIL_PASSWORD");

    if host.is_empty() || user.is_empty() || password.is_empty() {
        return None;
    }

    Some(Credentials { host, port, user, password })
}

// ── IMAP helpers ────────────────────────────────────────────────────────────

/// The concrete TLS stream type used throughout this module.
type ImapTlsStream =
    async_native_tls::TlsStream<tokio_util::compat::Compat<tokio::net::TcpStream>>;

/// Connect to the IMAP server over TLS and authenticate.
async fn imap_session(
    creds: &Credentials,
) -> anyhow::Result<async_imap::Session<ImapTlsStream>> {
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

    let messages_stream = session.fetch(&range, "(UID ENVELOPE FLAGS BODY.PEEK[TEXT])").await?;
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
            ("Unknown".to_string(), "(no subject)".to_string(), String::new())
        };

        // Parse date into ISO 8601; fall back to now
        let iso_date = chrono::DateTime::parse_from_rfc2822(&date)
            .map(|dt| dt.to_rfc3339())
            .unwrap_or_else(|_| chrono::Utc::now().to_rfc3339());

        // Flags — check for \Seen
        let read = msg.flags().any(|f| matches!(f, async_imap::types::Flag::Seen));

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

pub fn router() -> Router<AppState> {
    Router::new().route("/email", get(get_emails).patch(patch_email))
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

async fn get_emails(
    State(state): State<AppState>,
    Query(params): Query<GetEmailsQuery>,
) -> Result<Json<Value>, AppError> {
    let raw_folder = params.folder.as_deref().unwrap_or("INBOX");
    let folder = sanitize_folder(raw_folder);

    // account_id is accepted for API compat but unused
    let _ = params.account_id;

    let creds = match get_credentials(&state) {
        Some(c) => c,
        None => {
            // Match TS: return 200 with error key and empty array
            return Ok(Json(json!({ "error": "missing_credentials", "emails": [] })));
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

// ── PATCH /api/email ────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct PatchEmailBody {
    id: Option<String>,
    read: Option<bool>,
    account_id: Option<String>,
}

async fn patch_email(
    State(state): State<AppState>,
    Json(body): Json<PatchEmailBody>,
) -> Result<Json<Value>, AppError> {
    let id = body
        .id
        .as_deref()
        .ok_or_else(|| AppError::BadRequest("Missing id".to_string()))?;

    let _ = body.account_id;

    let creds = match get_credentials(&state) {
        Some(c) => c,
        None => return Err(AppError::Unauthorized),
    };

    // Parse "FOLDER:UID"
    let colon_idx = id
        .find(':')
        .ok_or_else(|| AppError::BadRequest("Invalid id format".to_string()))?;
    let folder = &id[..colon_idx];
    let uid_str = &id[colon_idx + 1..];
    let uid: u32 = uid_str
        .parse()
        .map_err(|_| AppError::BadRequest("Invalid uid in id".to_string()))?;

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
    let flag_op = if body.read.unwrap_or(false) {
        "+FLAGS (\\Seen)"
    } else {
        "-FLAGS (\\Seen)"
    };

    let updates = session
        .uid_store(&uid_set, flag_op)
        .await
        .map_err(|e| {
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
