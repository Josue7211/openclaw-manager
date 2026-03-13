use axum::{
    extract::{Query, State},
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

use crate::server::AppState;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn openclaw_dir() -> PathBuf {
    std::env::var("OPENCLAW_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| {
            dirs::home_dir()
                .unwrap_or_else(|| PathBuf::from("/tmp"))
                .join(".openclaw")
        })
}

fn openclaw_ws() -> String {
    std::env::var("OPENCLAW_WS").unwrap_or_else(|_| "ws://127.0.0.1:18789".into())
}

fn openclaw_password() -> String {
    std::env::var("OPENCLAW_PASSWORD").unwrap_or_default()
}

fn chat_images_dir() -> PathBuf {
    openclaw_dir().join("media/chat-images")
}

/// Generate a pseudo-UUID v4 string using the `rand` and `hex` crates.
fn random_uuid() -> String {
    use rand::Rng;
    let mut rng = rand::thread_rng();
    let mut bytes = [0u8; 16];
    rng.fill(&mut bytes);
    // Set version 4 and variant bits
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    format!(
        "{}-{}-{}-{}-{}",
        hex::encode(&bytes[0..4]),
        hex::encode(&bytes[4..6]),
        hex::encode(&bytes[6..8]),
        hex::encode(&bytes[8..10]),
        hex::encode(&bytes[10..16]),
    )
}

/// Percent-encode a string for use in a URL query parameter.
fn percent_encode(input: &str) -> String {
    let mut out = String::with_capacity(input.len() * 3);
    for b in input.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char);
            }
            _ => {
                // Use uppercase hex digits per RFC 3986 recommendation
                out.push_str(&format!("%{:02X}", b));
            }
        }
    }
    out
}

/// Decode a base64-encoded string to bytes. Supports standard base64 alphabet.
fn base64_decode(input: &str) -> Option<Vec<u8>> {
    const TABLE: &[u8; 64] =
        b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut lookup = [255u8; 256];
    for (i, &c) in TABLE.iter().enumerate() {
        lookup[c as usize] = i as u8;
    }

    let input = input.trim_end_matches('=');
    let len = input.len();
    let mut out = Vec::with_capacity(len * 3 / 4);

    let mut i = 0;
    while i < len {
        let remaining = len - i;
        let a = lookup[input.as_bytes().get(i).copied().unwrap_or(b'A') as usize];
        let b = lookup[input.as_bytes().get(i + 1).copied().unwrap_or(b'A') as usize];
        if a == 255 || b == 255 {
            return None;
        }
        out.push((a << 2) | (b >> 4));

        if remaining > 2 {
            let c = lookup[input.as_bytes()[i + 2] as usize];
            if c == 255 {
                return None;
            }
            out.push((b << 4) | (c >> 2));
            if remaining > 3 {
                let d = lookup[input.as_bytes()[i + 3] as usize];
                if d == 255 {
                    return None;
                }
                out.push((c << 6) | d);
            }
        }
        i += 4;
    }

    Some(out)
}

// ---------------------------------------------------------------------------
// Session file lookup (mirrors lib/openclaw.ts getSessionFile)
// ---------------------------------------------------------------------------

fn get_session_file() -> Option<PathBuf> {
    let dir = openclaw_dir();
    let sessions_json = dir.join("agents/main/sessions/sessions.json");
    let content = std::fs::read_to_string(sessions_json).ok()?;
    let idx: Value = serde_json::from_str(&content).ok()?;
    let session_id = idx
        .get("agent:main:main")?
        .get("sessionId")?
        .as_str()?;
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

/// Strip "[Timestamp] Sender metadata" prefix and extract image path annotations.
fn clean_user_text(raw: &str) -> (String, Vec<String>) {
    let mut image_paths: Vec<String> = Vec::new();

    // Extract [Image: source: /path] annotations
    let re_image_source =
        regex::Regex::new(r"\[Image:\s*source:\s*([^\]]+)\]").unwrap();
    let without1 = re_image_source
        .replace_all(raw, |caps: &regex::Captures| {
            image_paths.push(caps[1].trim().to_string());
            String::new()
        })
        .into_owned();

    // Extract [Attached image: /path] annotations
    let re_attached =
        regex::Regex::new(r"\[Attached image:\s*([^\]]+)\]").unwrap();
    let without2 = re_attached
        .replace_all(&without1, |caps: &regex::Captures| {
            image_paths.push(caps[1].trim().to_string());
            String::new()
        })
        .into_owned();

    // Strip sender metadata block
    let re_sender = regex::Regex::new(
        r"(?ms)^Sender \(untrusted metadata\):\s*```json[\s\S]*?```\s*",
    )
    .unwrap();
    let without3 = re_sender.replace(&without2, "").into_owned();

    // Strip leading [timestamp] prefix
    let re_ts = regex::Regex::new(r"^\[.*?\]\s+").unwrap();
    let without4 = re_ts.replace(&without3, "").into_owned();

    // Collapse multiple newlines
    let re_nl = regex::Regex::new(r"\n{2,}").unwrap();
    let text = re_nl.replace_all(&without4, "\n").trim().to_string();

    (text, image_paths)
}

/// Strip [[reply_to_current]] and [[reply_to:...]] tags from assistant messages.
fn clean_assistant_text(raw: &str) -> String {
    let re1 = regex::Regex::new(r"\[\[\s*reply_to_current\s*\]\]\s*").unwrap();
    let r = re1.replace_all(raw, "").into_owned();
    let re2 = regex::Regex::new(r"\[\[\s*reply_to\s*:\s*[^\]]*\]\]\s*").unwrap();
    re2.replace_all(&r, "").trim().to_string()
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
// WebSocket chat.send to OpenClaw (mirrors lib/openclaw.ts openclawChatSend)
// ---------------------------------------------------------------------------

#[derive(Debug)]
struct ChatSendResult {
    ok: bool,
    error: Option<String>,
}

async fn openclaw_chat_send(
    message: &str,
    attachments: Option<Vec<Value>>,
    deliver: bool,
) -> ChatSendResult {
    use futures::{SinkExt, StreamExt};
    use tokio_tungstenite::tungstenite::Message;

    let ws_url = openclaw_ws();
    let password = openclaw_password();

    let ws_stream = match tokio_tungstenite::connect_async(&ws_url).await {
        Ok((stream, _)) => stream,
        Err(e) => {
            return ChatSendResult {
                ok: false,
                error: Some(format!("ws connect error: {}", e)),
            };
        }
    };

    let (mut write, mut read) = ws_stream.split();
    let mut connected = false;

    let timeout = tokio::time::timeout(Duration::from_secs(15), async {
        while let Some(msg_result) = read.next().await {
            let msg = match msg_result {
                Ok(m) => m,
                Err(e) => {
                    return ChatSendResult {
                        ok: false,
                        error: Some(format!("ws read error: {}", e)),
                    };
                }
            };

            let text = match msg {
                Message::Text(t) => t,
                Message::Close(_) => {
                    if !connected {
                        return ChatSendResult {
                            ok: false,
                            error: Some("closed early".into()),
                        };
                    }
                    continue;
                }
                _ => continue,
            };

            let frame: Value = match serde_json::from_str(&text) {
                Ok(v) => v,
                Err(_) => continue,
            };

            let frame_type = frame.get("type").and_then(|t| t.as_str()).unwrap_or("");

            // Step 1: Respond to connect.challenge with auth credentials
            if frame_type == "event"
                && frame.get("event").and_then(|e| e.as_str())
                    == Some("connect.challenge")
            {
                let connect_req = json!({
                    "type": "req",
                    "id": random_uuid(),
                    "method": "connect",
                    "params": {
                        "minProtocol": 3,
                        "maxProtocol": 3,
                        "client": {
                            "id": "gateway-client",
                            "version": "1.0.0",
                            "platform": "linux",
                            "mode": "ui"
                        },
                        "role": "operator",
                        "scopes": ["operator.read", "operator.write"],
                        "caps": [],
                        "commands": [],
                        "permissions": {},
                        "auth": { "password": password },
                        "locale": "en-US",
                        "userAgent": "mission-control/1.0.0"
                    }
                });
                if let Err(e) = write
                    .send(Message::Text(connect_req.to_string()))
                    .await
                {
                    return ChatSendResult {
                        ok: false,
                        error: Some(format!("ws send error: {}", e)),
                    };
                }
            }
            // Step 2: After hello-ok, send chat.send request
            else if !connected
                && frame_type == "res"
                && frame.get("ok").and_then(|v| v.as_bool()) == Some(true)
                && frame
                    .get("payload")
                    .and_then(|p| p.get("type"))
                    .and_then(|t| t.as_str())
                    == Some("hello-ok")
            {
                connected = true;

                let mut params = json!({
                    "sessionKey": "main",
                    "message": message,
                    "deliver": deliver,
                    "idempotencyKey": random_uuid(),
                });
                if let Some(ref att) = attachments {
                    if !att.is_empty() {
                        params
                            .as_object_mut()
                            .unwrap()
                            .insert("attachments".into(), json!(att));
                    }
                }

                let chat_req = json!({
                    "type": "req",
                    "id": random_uuid(),
                    "method": "chat.send",
                    "params": params,
                });
                if let Err(e) = write
                    .send(Message::Text(chat_req.to_string()))
                    .await
                {
                    return ChatSendResult {
                        ok: false,
                        error: Some(format!("ws send error: {}", e)),
                    };
                }
            }
            // Step 3: Receive chat.send response
            else if connected && frame_type == "res" {
                let ok = frame.get("ok").and_then(|v| v.as_bool()).unwrap_or(false);
                let error = if ok {
                    None
                } else {
                    frame
                        .get("error")
                        .and_then(|e| e.get("message"))
                        .and_then(|m| m.as_str())
                        .map(|s| s.to_string())
                };
                let _ = write.close().await;
                return ChatSendResult { ok, error };
            }
        }

        // Stream ended without getting a response
        ChatSendResult {
            ok: false,
            error: Some("ws stream ended unexpectedly".into()),
        }
    });

    match timeout.await {
        Ok(result) => result,
        Err(_) => ChatSendResult {
            ok: false,
            error: Some("timeout".into()),
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
    State(_state): State<AppState>,
    Json(body): Json<PostChatBody>,
) -> Response {
    let dir = openclaw_dir();
    if !dir.exists() {
        return Json(json!({
            "error": "openclaw_not_configured",
            "message": "OpenClaw workspace not found. Set OPENCLAW_WS in .env.local and ensure OpenClaw is running."
        }))
        .into_response();
    }

    let txt = body.text.unwrap_or_default().trim().to_string();
    let imgs = body.images.unwrap_or_default();

    if txt.is_empty() && imgs.is_empty() {
        return (
            axum::http::StatusCode::BAD_REQUEST,
            Json(json!({"error": "empty message"})),
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

async fn get_history(State(_state): State<AppState>) -> Response {
    let dir = openclaw_dir();
    if !dir.exists() {
        return Json(json!({
            "error": "openclaw_not_configured",
            "message": "OpenClaw workspace not found. Set OPENCLAW_WS in .env.local and ensure OpenClaw is running.",
            "messages": []
        }))
        .into_response();
    }

    let file_path = match get_session_file() {
        Some(p) => p,
        None => return Json(json!({"messages": []})).into_response(),
    };

    let messages = parse_messages(&file_path);
    Json(json!({"messages": messages})).into_response()
}

// ---------------------------------------------------------------------------
// GET /chat/stream -- SSE endpoint polling session file for new messages
// ---------------------------------------------------------------------------

async fn get_stream(State(_state): State<AppState>) -> Response {
    let dir = openclaw_dir();
    if !dir.exists() {
        return Json(json!({
            "error": "openclaw_not_configured",
            "message": "OpenClaw workspace not found. Set OPENCLAW_WS in .env.local and ensure OpenClaw is running."
        }))
        .into_response();
    }

    let file_path = match get_session_file() {
        Some(p) => p,
        None => {
            // Return a single SSE error event matching the TS behavior
            let stream = async_stream::stream! {
                yield Ok::<_, std::convert::Infallible>(
                    Event::default().data(r#"{"error":"no session"}"#)
                );
            };
            return Sse::new(stream)
                .keep_alive(KeepAlive::default())
                .into_response();
        }
    };

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

    let oc_dir = openclaw_dir();
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
// Router
// ---------------------------------------------------------------------------

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", post(post_chat))
        .route("/history", get(get_history))
        .route("/stream", get(get_stream))
        .route("/image", get(get_image))
}
