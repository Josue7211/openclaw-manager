use axum::{
    extract::{Query, State, WebSocketUpgrade, ws::{Message, WebSocket}},
    response::{
        sse::{Event, KeepAlive, Sse},
        IntoResponse, Response,
    },
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use tokio::time::{interval, Duration};

use std::sync::OnceLock;

use crate::server::AppState;
use super::util::{percent_encode, random_uuid, base64_decode};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn openclaw_dir_from(state: &AppState) -> PathBuf {
    state.secret("OPENCLAW_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            dirs::home_dir()
                .unwrap_or_else(|| PathBuf::from("/tmp"))
                .join(".openclaw")
        })
}

/// Stateless fallback used only by `is_safe_path` / `chat_images_dir`
/// which are called from contexts that already verified the dir.
fn openclaw_dir_default() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("/tmp"))
        .join(".openclaw")
}

fn openclaw_ws(state: &AppState) -> String {
    let val = state.secret_or_default("OPENCLAW_WS");
    if val.is_empty() { "ws://127.0.0.1:18789".into() } else { val }
}

fn openclaw_password(state: &AppState) -> String {
    state.secret_or_default("OPENCLAW_PASSWORD")
}

fn openclaw_api_url(state: &AppState) -> Option<String> {
    state.secret("OPENCLAW_API_URL").filter(|s| !s.is_empty())
}

fn openclaw_api_key(state: &AppState) -> String {
    state.secret_or_default("OPENCLAW_API_KEY")
}

/// Fetch chat history from the remote OpenClaw API when local files aren't available.
async fn fetch_remote_history(state: &AppState) -> Option<Vec<ChatMessage>> {
    let base = openclaw_api_url(state)?;
    let url = format!("{}/chat/history", base);
    let key = openclaw_api_key(state);

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .ok()?;

    let mut req = client.get(&url);
    if !key.is_empty() {
        req = req.header("Authorization", format!("Bearer {}", key));
    }

    let resp = req.send().await.ok()?;
    if !resp.status().is_success() {
        return None;
    }

    let body: Value = resp.json().await.ok()?;
    let messages = body.get("messages")?.as_array()?;

    let mut result = Vec::new();
    for m in messages {
        let id = m.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let role = m.get("role").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let text = m.get("text").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let timestamp = m.get("timestamp").and_then(|v| v.as_str()).unwrap_or("").to_string();
        if !text.is_empty() {
            result.push(ChatMessage { id, role, text, timestamp, images: None });
        }
    }

    Some(result)
}

fn chat_images_dir() -> PathBuf {
    openclaw_dir_default().join("media/chat-images")
}

// ---------------------------------------------------------------------------
// Session file lookup (mirrors lib/openclaw.ts getSessionFile)
// ---------------------------------------------------------------------------

fn get_session_file(state: &AppState) -> Option<PathBuf> {
    let dir = openclaw_dir_from(state);
    let sessions_json = dir.join("agents/main/sessions/sessions.json");
    let content = std::fs::read_to_string(sessions_json).ok()?;
    let idx: Value = serde_json::from_str(&content).ok()?;
    let session_id = idx
        .get("agent:main:main")?
        .get("sessionId")?
        .as_str()?;

    // Validate session_id to prevent directory traversal
    if !re_session_id().is_match(session_id) {
        tracing::warn!("Rejected invalid session_id: {}", session_id);
        return None;
    }

    let path = dir.join(format!("agents/main/sessions/{}.jsonl", session_id));
    if path.exists() {
        Some(path)
    } else {
        None
    }
}

// ---------------------------------------------------------------------------
// Image saving (mirrors lib/openclaw.ts saveImageToDisk)
// ---------------------------------------------------------------------------

fn save_image_to_disk(data_url: &str) -> Option<String> {
    use std::io::Write;

    let rest = data_url.strip_prefix("data:image/")?;
    let semi_pos = rest.find(';')?;
    let raw_ext = &rest[..semi_pos];
    let base64_data = rest.strip_prefix(&format!("{};base64,", raw_ext))?;

    let ext = if raw_ext == "jpeg" { "jpg" } else { raw_ext };

    const SAFE_EXTS: &[&str] = &["png", "jpg", "jpeg", "gif", "webp"];
    if !SAFE_EXTS.contains(&ext) {
        return None;
    }

    let decoded = base64_decode(base64_data)?;

    let dir = chat_images_dir();
    std::fs::create_dir_all(&dir).ok()?;
    let filename = format!("{}.{}", random_uuid(), ext);
    let filepath = dir.join(&filename);
    let mut file = std::fs::File::create(&filepath).ok()?;
    file.write_all(&decoded).ok()?;

    Some(filepath.to_string_lossy().into_owned())
}

// ---------------------------------------------------------------------------
// JSONL message parsing (mirrors app/api/chat/history/route.ts)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub id: String,
    pub role: String,
    pub text: String,
    pub timestamp: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub images: Option<Vec<String>>,
}

// ---- Compiled-once regexes for clean_user_text / clean_assistant_text -----

fn re_image_source() -> &'static regex::Regex {
    static RE: OnceLock<regex::Regex> = OnceLock::new();
    RE.get_or_init(|| regex::Regex::new(r"\[Image:\s*source:\s*([^\]]+)\]").unwrap())
}

fn re_attached() -> &'static regex::Regex {
    static RE: OnceLock<regex::Regex> = OnceLock::new();
    RE.get_or_init(|| regex::Regex::new(r"\[Attached image:\s*([^\]]+)\]").unwrap())
}

fn re_sender() -> &'static regex::Regex {
    static RE: OnceLock<regex::Regex> = OnceLock::new();
    RE.get_or_init(|| regex::Regex::new(r"(?ms)^Sender \(untrusted metadata\):\s*```json[\s\S]*?```\s*").unwrap())
}

fn re_ts_prefix() -> &'static regex::Regex {
    static RE: OnceLock<regex::Regex> = OnceLock::new();
    RE.get_or_init(|| regex::Regex::new(r"^\[.*?\]\s+").unwrap())
}

fn re_collapse_nl() -> &'static regex::Regex {
    static RE: OnceLock<regex::Regex> = OnceLock::new();
    RE.get_or_init(|| regex::Regex::new(r"\n{2,}").unwrap())
}

fn re_reply_current() -> &'static regex::Regex {
    static RE: OnceLock<regex::Regex> = OnceLock::new();
    RE.get_or_init(|| regex::Regex::new(r"\[\[\s*reply_to_current\s*\]\]\s*").unwrap())
}

fn re_reply_to() -> &'static regex::Regex {
    static RE: OnceLock<regex::Regex> = OnceLock::new();
    RE.get_or_init(|| regex::Regex::new(r"\[\[\s*reply_to\s*:\s*[^\]]*\]\]\s*").unwrap())
}

fn re_session_id() -> &'static regex::Regex {
    static RE: OnceLock<regex::Regex> = OnceLock::new();
    RE.get_or_init(|| regex::Regex::new(r"^[a-zA-Z0-9_-]+$").unwrap())
}

/// Strip "[Timestamp] Sender metadata" prefix and extract image path annotations.
fn clean_user_text(raw: &str) -> (String, Vec<String>) {
    let mut image_paths: Vec<String> = Vec::new();

    // Extract [Image: source: /path] annotations
    let without1 = re_image_source()
        .replace_all(raw, |caps: &regex::Captures| {
            image_paths.push(caps[1].trim().to_string());
            String::new()
        })
        .into_owned();

    // Extract [Attached image: /path] annotations
    let without2 = re_attached()
        .replace_all(&without1, |caps: &regex::Captures| {
            image_paths.push(caps[1].trim().to_string());
            String::new()
        })
        .into_owned();

    // Strip sender metadata block
    let without3 = re_sender().replace(&without2, "").into_owned();

    // Strip leading [timestamp] prefix
    let without4 = re_ts_prefix().replace(&without3, "").into_owned();

    // Collapse multiple newlines
    let text = re_collapse_nl().replace_all(&without4, "\n").trim().to_string();

    (text, image_paths)
}

/// Strip [[reply_to_current]] and [[reply_to:...]] tags from assistant messages.
fn clean_assistant_text(raw: &str) -> String {
    let r = re_reply_current().replace_all(raw, "").into_owned();
    re_reply_to().replace_all(&r, "").trim().to_string()
}

fn parse_messages(file_path: &Path) -> Vec<ChatMessage> {
    let content = match std::fs::read_to_string(file_path) {
        Ok(c) => c,
        Err(_) => return Vec::new(),
    };

    let mut msgs: Vec<ChatMessage> = Vec::new();

    for line in content.lines() {
        if line.is_empty() {
            continue;
        }
        let entry: Value = match serde_json::from_str(line) {
            Ok(v) => v,
            Err(_) => continue,
        };

        if entry.get("type").and_then(|t| t.as_str()) != Some("message") {
            continue;
        }

        let message = match entry.get("message") {
            Some(m) => m,
            None => continue,
        };
        let role = match message.get("role").and_then(|r| r.as_str()) {
            Some(r) => r,
            None => continue,
        };
        let content_val = match message.get("content") {
            Some(c) => c,
            None => continue,
        };

        let id = entry
            .get("id")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let timestamp = entry
            .get("timestamp")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        // Normalize content to array of parts
        let parts: Vec<Value> = if let Some(arr) = content_val.as_array() {
            arr.clone()
        } else if let Some(s) = content_val.as_str() {
            vec![json!({"type": "text", "text": s})]
        } else {
            continue;
        };

        if role == "user" {
            let text_parts: Vec<&Value> = parts
                .iter()
                .filter(|p| p.get("type").and_then(|t| t.as_str()) == Some("text"))
                .collect();
            let image_parts: Vec<&Value> = parts
                .iter()
                .filter(|p| {
                    let t = p.get("type").and_then(|t| t.as_str()).unwrap_or("");
                    t == "image_url" || t == "image"
                })
                .collect();

            let raw_text: String = text_parts
                .iter()
                .map(|p| p.get("text").and_then(|t| t.as_str()).unwrap_or(""))
                .collect::<Vec<_>>()
                .join("\n");

            let (text, image_path_annotations) = clean_user_text(&raw_text);

            // Build image URLs from inline content parts
            let mut inline_images: Vec<String> = Vec::new();
            for p in &image_parts {
                if let Some(url) = p
                    .get("image_url")
                    .and_then(|u| u.get("url"))
                    .and_then(|u| u.as_str())
                {
                    inline_images.push(url.to_string());
                } else if let Some(data) = p.get("data").and_then(|d| d.as_str()) {
                    let mime = if data.starts_with("/9j/") {
                        "image/jpeg"
                    } else if data.starts_with("iVBOR") {
                        "image/png"
                    } else {
                        "image/jpeg"
                    };
                    inline_images.push(format!("data:{};base64,{}", mime, data));
                } else if let Some(source_data) = p
                    .get("source")
                    .and_then(|s| s.get("data"))
                    .and_then(|d| d.as_str())
                {
                    let media_type = p
                        .get("source")
                        .and_then(|s| s.get("media_type"))
                        .and_then(|m| m.as_str())
                        .unwrap_or("image/jpeg");
                    inline_images
                        .push(format!("data:{};base64,{}", media_type, source_data));
                }
            }

            // Build image URLs for file-path annotations
            let path_images: Vec<String> = image_path_annotations
                .iter()
                .map(|p| format!("/api/chat/image?path={}", percent_encode(p)))
                .collect();

            let mut all_images = inline_images;
            all_images.extend(path_images);

            if text.is_empty() && all_images.is_empty() {
                continue;
            }

            // Hide internal session-trigger messages
            if text.starts_with("A new session was started via /new or /reset")
                || text == "/new"
                || text == "/reset"
            {
                continue;
            }

            msgs.push(ChatMessage {
                id,
                role: "user".into(),
                text,
                timestamp,
                images: if all_images.is_empty() {
                    None
                } else {
                    Some(all_images)
                },
            });
        } else if role == "assistant" {
            let text_parts: Vec<&Value> = parts
                .iter()
                .filter(|p| p.get("type").and_then(|t| t.as_str()) == Some("text"))
                .collect();
            if text_parts.is_empty() {
                continue;
            }
            let raw = text_parts
                .iter()
                .map(|p| p.get("text").and_then(|t| t.as_str()).unwrap_or(""))
                .collect::<Vec<_>>()
                .join("\n")
                .trim()
                .to_string();
            let text = clean_assistant_text(&raw);
            if text.is_empty() {
                continue;
            }
            msgs.push(ChatMessage {
                id,
                role: "assistant".into(),
                text,
                timestamp,
                images: None,
            });
        }
    }

    msgs
}

// ---------------------------------------------------------------------------
// HTTP chat completions to OpenClaw gateway (/v1/chat/completions)
// ---------------------------------------------------------------------------

#[derive(Debug)]
struct ChatSendResult {
    ok: bool,
    error: Option<String>,
}

async fn openclaw_chat_send(
    state: &AppState,
    message: &str,
    _attachments: Option<Vec<Value>>,
    _deliver: bool,
) -> ChatSendResult {
    // Try remote OpenClaw API first (handles session persistence + AI response)
    if let Some(base) = openclaw_api_url(state) {
        let url = format!("{}/chat/send", base);
        let key = openclaw_api_key(state);

        let client = match reqwest::Client::builder()
            .timeout(Duration::from_secs(180))
            .build()
        {
            Ok(c) => c,
            Err(e) => {
                return ChatSendResult {
                    ok: false,
                    error: Some(format!("http client error: {}", e)),
                };
            }
        };

        let body = json!({ "text": message });
        let mut req = client.post(&url).json(&body);
        if !key.is_empty() {
            req = req.header("Authorization", format!("Bearer {}", key));
        }

        return match req.send().await {
            Ok(resp) => {
                if resp.status().is_success() {
                    ChatSendResult { ok: true, error: None }
                } else {
                    let status = resp.status();
                    let text = resp.text().await.unwrap_or_default();
                    ChatSendResult {
                        ok: false,
                        error: Some(format!("api returned {}: {}", status, text)),
                    }
                }
            }
            Err(e) => ChatSendResult {
                ok: false,
                error: Some(format!("http request error: {}", e)),
            },
        };
    }

    // Fallback: direct gateway HTTP completions (no session persistence)
    let gateway_url = openclaw_ws(state)
        .replace("ws://", "http://")
        .replace("wss://", "https://");
    let password = openclaw_password(state);
    let url = format!("{}/v1/chat/completions", gateway_url);

    let client = match reqwest::Client::builder()
        .timeout(Duration::from_secs(120))
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            return ChatSendResult {
                ok: false,
                error: Some(format!("http client error: {}", e)),
            };
        }
    };

    let body = json!({
        "messages": [{"role": "user", "content": message}],
        "model": "default",
    });

    let res = client
        .post(&url)
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {}", password))
        .json(&body)
        .send()
        .await;

    match res {
        Ok(resp) => {
            if resp.status().is_success() {
                ChatSendResult { ok: true, error: None }
            } else {
                let status = resp.status();
                let text = resp.text().await.unwrap_or_default();
                ChatSendResult {
                    ok: false,
                    error: Some(format!("gateway returned {}: {}", status, text)),
                }
            }
        }
        Err(e) => ChatSendResult {
            ok: false,
            error: Some(format!("http request error: {}", e)),
        },
    }
}

// ---------------------------------------------------------------------------
// POST /chat -- send a message via WebSocket to OpenClaw
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct PostChatBody {
    text: Option<String>,
    images: Option<Vec<String>>,
}

async fn post_chat(
    State(state): State<AppState>,
    Json(body): Json<PostChatBody>,
) -> Response {
    let txt = body.text.unwrap_or_default().trim().to_string();
    let imgs = body.images.unwrap_or_default();

    if txt.is_empty() && imgs.is_empty() {
        return (
            axum::http::StatusCode::BAD_REQUEST,
            Json(json!({"error": "empty message"})),
        )
            .into_response();
    }

    if txt.len() > 50_000 {
        return (
            axum::http::StatusCode::BAD_REQUEST,
            Json(json!({"error": "Message too long (max 50000 characters)"})),
        )
            .into_response();
    }

    // Save images to disk so they survive the pipeline
    let mut saved_paths: Vec<String> = Vec::new();
    for img in &imgs {
        if let Some(saved) = save_image_to_disk(img) {
            saved_paths.push(saved);
        }
    }

    // Inject image path annotations into text
    let annotated_text = if saved_paths.is_empty() {
        txt.clone()
    } else {
        let annotations: String = saved_paths
            .iter()
            .map(|p| format!("[Attached image: {}]", p))
            .collect::<Vec<_>>()
            .join("\n");
        if txt.is_empty() {
            annotations
        } else {
            format!("{}\n{}", txt, annotations)
        }
    };

    // Build attachments from data URLs (extract mimeType + base64 content)
    let attachments: Vec<Value> = imgs
        .iter()
        .filter_map(|data_url| {
            let rest = data_url.strip_prefix("data:")?;
            let semi_pos = rest.find(';')?;
            let mime_type = &rest[..semi_pos];
            let base64_content =
                rest.strip_prefix(&format!("{};base64,", mime_type))?;
            Some(json!({
                "mimeType": mime_type,
                "content": base64_content,
            }))
        })
        .collect();

    let deliver = txt == "/new" || txt == "/reset";

    let result = openclaw_chat_send(
        &state,
        &annotated_text,
        if attachments.is_empty() {
            None
        } else {
            Some(attachments)
        },
        deliver,
    )
    .await;

    if !result.ok {
        return (
            axum::http::StatusCode::BAD_GATEWAY,
            Json(json!({"error": result.error.unwrap_or_else(|| "unknown".into())})),
        )
            .into_response();
    }

    Json(json!({"ok": true})).into_response()
}

// ---------------------------------------------------------------------------
// GET /chat/history -- parse JSONL session file
// ---------------------------------------------------------------------------

async fn get_history(State(state): State<AppState>) -> Response {
    let dir = openclaw_dir_from(&state);

    // Try local session files first
    if dir.exists() {
        if let Some(file_path) = get_session_file(&state) {
            let messages = parse_messages(&file_path);
            return Json(json!({"messages": messages})).into_response();
        }
    }

    // Fall back to remote OpenClaw API
    if let Some(messages) = fetch_remote_history(&state).await {
        return Json(json!({"messages": messages})).into_response();
    }

    Json(json!({"messages": []})).into_response()
}

// ---------------------------------------------------------------------------
// GET /chat/stream -- SSE endpoint polling session file for new messages
// ---------------------------------------------------------------------------

async fn get_stream(State(state): State<AppState>) -> Response {
    let dir = openclaw_dir_from(&state);
    let local_session = if dir.exists() { get_session_file(&state) } else { None };

    if let Some(file_path) = local_session {
        // Local mode: poll session file for changes
        let mut last_size = std::fs::metadata(&file_path)
            .map(|m| m.len())
            .unwrap_or(0);
        let mut last_count = parse_messages(&file_path).len();

        let stream = async_stream::stream! {
            let mut ticker = interval(Duration::from_secs(1));

            loop {
                ticker.tick().await;

                let current_size = match std::fs::metadata(&file_path) {
                    Ok(m) => m.len(),
                    Err(_) => {
                        yield Ok::<_, std::convert::Infallible>(
                            Event::default().comment("error")
                        );
                        continue;
                    }
                };

                if current_size == last_size {
                    yield Ok(Event::default().comment("ping"));
                    continue;
                }

                last_size = current_size;

                let messages = parse_messages(&file_path);
                if messages.len() > last_count {
                    let new_msgs = &messages[last_count..];
                    last_count = messages.len();

                    for msg in new_msgs {
                        let mut redacted = msg.clone();
                        redacted.text = crate::redact::redact(&msg.text);
                        if let Ok(data) = serde_json::to_string(&redacted) {
                            yield Ok(Event::default().data(data));
                        }
                    }
                }
            }
        };

        Sse::new(stream)
            .keep_alive(KeepAlive::default())
            .into_response()
    } else {
        // Remote mode: poll OpenClaw API for new messages
        let initial = fetch_remote_history(&state).await.unwrap_or_default();
        let mut last_count = initial.len();
        let state_clone = state.clone();

        let stream = async_stream::stream! {
            let mut ticker = interval(Duration::from_secs(2));

            loop {
                ticker.tick().await;

                let messages = match fetch_remote_history(&state_clone).await {
                    Some(m) => m,
                    None => {
                        yield Ok::<_, std::convert::Infallible>(
                            Event::default().comment("ping")
                        );
                        continue;
                    }
                };

                if messages.len() > last_count {
                    let new_msgs = &messages[last_count..];
                    last_count = messages.len();

                    for msg in new_msgs {
                        let mut redacted = msg.clone();
                        redacted.text = crate::redact::redact(&msg.text);
                        if let Ok(data) = serde_json::to_string(&redacted) {
                            yield Ok(Event::default().data(data));
                        }
                    }
                } else {
                    yield Ok(Event::default().comment("ping"));
                }
            }
        };

        Sse::new(stream)
            .keep_alive(KeepAlive::default())
            .into_response()
    }
}

// ---------------------------------------------------------------------------
// GET /chat/image?path=... -- serve images from allowed directories
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct ImageQuery {
    path: Option<String>,
}

const ALLOWED_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "gif", "webp"];

/// Validate that the resolved file path is inside an allowed directory and has
/// a permitted image extension. Uses canonicalize to resolve symlinks (matching
/// the TS realpathSync behavior) to prevent directory-traversal attacks.
fn is_safe_path(file_path: &str) -> bool {
    let resolved = match std::fs::canonicalize(file_path) {
        Ok(p) => p,
        Err(_) => return false,
    };

    // Check extension
    let ext = resolved
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .unwrap_or_default();
    if !ALLOWED_EXTENSIONS.contains(&ext.as_str()) {
        return false;
    }

    let oc_dir = openclaw_dir_default();
    let allowed_dirs = [
        oc_dir.join("workspace/chat-uploads"),
        oc_dir.join("workspace"),
        oc_dir.join("media/chat-images"),
    ];

    // Verify resolved path is strictly inside an allowed directory
    allowed_dirs.iter().any(|dir| {
        if let Ok(canonical_dir) = std::fs::canonicalize(dir) {
            let dir_prefix = format!(
                "{}{}",
                canonical_dir.display(),
                std::path::MAIN_SEPARATOR
            );
            resolved.to_string_lossy().starts_with(&dir_prefix)
                || resolved == canonical_dir
        } else {
            false
        }
    })
}

fn guess_mime(file_path: &str) -> &'static str {
    let ext = Path::new(file_path)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .unwrap_or_default();
    match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        _ => "image/png",
    }
}

async fn get_image(Query(params): Query<ImageQuery>) -> Response {
    let file_path = match params.path {
        Some(p) if !p.is_empty() => p,
        _ => {
            return (
                axum::http::StatusCode::BAD_REQUEST,
                Json(json!({"error": "missing path"})),
            )
                .into_response();
        }
    };

    if !is_safe_path(&file_path) {
        return (
            axum::http::StatusCode::FORBIDDEN,
            Json(json!({"error": "forbidden path"})),
        )
            .into_response();
    }

    match tokio::fs::read(&file_path).await {
        Ok(data) => {
            let mime = guess_mime(&file_path);
            (
                [
                    (axum::http::header::CONTENT_TYPE, mime),
                    (
                        axum::http::header::CACHE_CONTROL,
                        "public, max-age=86400",
                    ),
                ],
                data,
            )
                .into_response()
        }
        Err(_) => (
            axum::http::StatusCode::NOT_FOUND,
            Json(json!({"error": "not found"})),
        )
            .into_response(),
    }
}

// ---------------------------------------------------------------------------
// GET /chat/ws -- WebSocket endpoint for real-time message delivery
// ---------------------------------------------------------------------------

async fn ws_upgrade(
    State(state): State<AppState>,
    ws: WebSocketUpgrade,
) -> Response {
    ws.on_upgrade(move |socket| handle_ws(socket, state))
}

async fn handle_ws(mut socket: WebSocket, state: AppState) {
    let dir = openclaw_dir_from(&state);
    let local_session = if dir.exists() { get_session_file(&state) } else { None };

    if let Some(file_path) = local_session {
        // Local mode: watch session JSONL file for new messages
        let mut last_size = std::fs::metadata(&file_path)
            .map(|m| m.len())
            .unwrap_or(0);
        let mut last_count = parse_messages(&file_path).len();
        let mut ticker = interval(Duration::from_millis(500));

        loop {
            ticker.tick().await;

            let current_size = match std::fs::metadata(&file_path) {
                Ok(m) => m.len(),
                Err(_) => continue,
            };

            if current_size == last_size {
                // Send a ping frame to keep the connection alive and detect drops
                if socket
                    .send(Message::Ping(vec![]))
                    .await
                    .is_err()
                {
                    break; // client disconnected
                }
                continue;
            }

            last_size = current_size;
            let messages = parse_messages(&file_path);
            if messages.len() > last_count {
                let new_msgs = &messages[last_count..];
                last_count = messages.len();

                for msg in new_msgs {
                    let mut redacted = msg.clone();
                    redacted.text = crate::redact::redact(&msg.text);
                    if let Ok(data) = serde_json::to_string(&redacted) {
                        if socket.send(Message::Text(data)).await.is_err() {
                            return; // client disconnected
                        }
                    }
                }
            }
        }
    } else {
        // Remote mode: poll OpenClaw API and push new messages over WS
        let initial = fetch_remote_history(&state).await.unwrap_or_default();
        let mut last_count = initial.len();
        let mut ticker = interval(Duration::from_secs(2));

        loop {
            ticker.tick().await;

            let messages = match fetch_remote_history(&state).await {
                Some(m) => m,
                None => {
                    // Send ping to keep alive
                    if socket.send(Message::Ping(vec![])).await.is_err() {
                        break;
                    }
                    continue;
                }
            };

            if messages.len() > last_count {
                let new_msgs = &messages[last_count..];
                last_count = messages.len();

                for msg in new_msgs {
                    let mut redacted = msg.clone();
                    redacted.text = crate::redact::redact(&msg.text);
                    if let Ok(data) = serde_json::to_string(&redacted) {
                        if socket.send(Message::Text(data)).await.is_err() {
                            return;
                        }
                    }
                }
            } else {
                // Keep alive
                if socket.send(Message::Ping(vec![])).await.is_err() {
                    break;
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", post(post_chat))
        .route("/history", get(get_history))
        .route("/stream", get(get_stream))
        .route("/ws", get(ws_upgrade))
        .route("/image", get(get_image))
}
