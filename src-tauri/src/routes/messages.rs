use axum::{
    extract::{Query, State},
    http::{header, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use regex::Regex;
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::Cursor;
use std::sync::OnceLock;
use tokio::sync::RwLock;

use crate::server::AppState;

// ---------------------------------------------------------------------------
// Environment / configuration helpers
// ---------------------------------------------------------------------------

fn bb_host() -> String {
    std::env::var("BLUEBUBBLES_HOST").unwrap_or_default()
}

fn bb_password() -> String {
    std::env::var("BLUEBUBBLES_PASSWORD").unwrap_or_default()
}

fn bridge_host() -> String {
    std::env::var("MAC_BRIDGE_HOST").unwrap_or_default()
}

fn bridge_api_key() -> String {
    std::env::var("MAC_BRIDGE_API_KEY").unwrap_or_default()
}

// ---------------------------------------------------------------------------
// GUID validation patterns (mirrors _lib/bb.ts)
// ---------------------------------------------------------------------------

fn chat_guid_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"^[a-zA-Z0-9_;+\-@.]+$").unwrap())
}

fn message_guid_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"^[a-zA-Z0-9_;+\-@./: ]+$").unwrap())
}

fn attachment_guid_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"^[a-zA-Z0-9_\-]+$").unwrap())
}

const VALID_REACTIONS: &[&str] = &[
    "love", "like", "dislike", "laugh", "emphasize", "question",
    "-love", "-like", "-dislike", "-laugh", "-emphasize", "-question",
];

// ---------------------------------------------------------------------------
// Phone normalization (mirrors _lib/bb.ts)
// ---------------------------------------------------------------------------

fn normalize_phone(addr: &str) -> String {
    let digits: String = addr.chars().filter(|c| c.is_ascii_digit()).collect();
    if digits.len() == 11 && digits.starts_with('1') {
        digits[1..].to_string()
    } else {
        digits
    }
}

// ---------------------------------------------------------------------------
// Percent-encode helper for URL query params
// ---------------------------------------------------------------------------

fn percent_encode(input: &str) -> String {
    let mut out = String::with_capacity(input.len() * 3);
    for b in input.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char);
            }
            _ => {
                out.push_str(&format!("%{:02X}", b));
            }
        }
    }
    out
}

// ---------------------------------------------------------------------------
// BlueBubbles API fetch (mirrors _lib/bb.ts bbFetch)
// ---------------------------------------------------------------------------

/// Fetch from BlueBubbles API. Returns `json.data` on success.
/// Errors: "bluebubbles_not_configured" if BB_HOST is empty,
///         "Backend service error" on HTTP or API error.
async fn bb_fetch(
    client: &reqwest::Client,
    path: &str,
    method: reqwest::Method,
    body: Option<Value>,
) -> Result<Value, String> {
    let host = bb_host();
    if host.is_empty() {
        return Err("bluebubbles_not_configured".into());
    }
    let password = bb_password();
    let sep = if path.contains('?') { '&' } else { '?' };
    let url = format!(
        "{}/api/v1{}{}password={}",
        host,
        path,
        sep,
        percent_encode(&password)
    );

    let mut req = client.request(method, &url).header("Content-Type", "application/json");
    if let Some(b) = body {
        req = req.json(&b);
    }

    let res = req.send().await.map_err(|e| {
        tracing::error!("BlueBubbles fetch error: {}", e);
        "Backend service error".to_string()
    })?;

    if !res.status().is_success() {
        let status = res.status();
        let text = res.text().await.unwrap_or_default();
        tracing::error!("BlueBubbles {}: {}", status, text);
        return Err("Backend service error".into());
    }

    let json: Value = res.json().await.map_err(|e| {
        tracing::error!("BlueBubbles JSON parse error: {}", e);
        "Backend service error".to_string()
    })?;

    if json.get("status").and_then(|v| v.as_i64()) != Some(200) {
        let msg = json
            .pointer("/error/message")
            .or_else(|| json.get("message"))
            .and_then(|v| v.as_str())
            .unwrap_or("unknown");
        tracing::error!("BlueBubbles API error: {}", msg);
        return Err("Backend service error".into());
    }

    Ok(json.get("data").cloned().unwrap_or(Value::Null))
}

// ---------------------------------------------------------------------------
// Bridge headers helper
// ---------------------------------------------------------------------------

fn bridge_headers() -> Vec<(String, String)> {
    let key = bridge_api_key();
    if key.is_empty() {
        vec![]
    } else {
        vec![("X-API-Key".to_string(), key)]
    }
}

// ---------------------------------------------------------------------------
// Contact map with TTL cache (mirrors _lib/bb.ts getContactMap)
// ---------------------------------------------------------------------------

struct ContactCache {
    map: HashMap<String, String>,
    fetched_at: std::time::Instant,
}

static CONTACT_CACHE: OnceLock<RwLock<Option<ContactCache>>> = OnceLock::new();

fn contact_cache() -> &'static RwLock<Option<ContactCache>> {
    CONTACT_CACHE.get_or_init(|| RwLock::new(None))
}

const CONTACT_CACHE_TTL: std::time::Duration = std::time::Duration::from_secs(5 * 60);

async fn get_contact_map(client: &reqwest::Client) -> HashMap<String, String> {
    // Check cache
    {
        let cache = contact_cache().read().await;
        if let Some(ref c) = *cache {
            if c.fetched_at.elapsed() < CONTACT_CACHE_TTL {
                return c.map.clone();
            }
        }
    }

    let map = fetch_contact_map(client).await;

    // Update cache
    {
        let mut cache = contact_cache().write().await;
        *cache = Some(ContactCache {
            map: map.clone(),
            fetched_at: std::time::Instant::now(),
        });
    }

    map
}

async fn fetch_contact_map(client: &reqwest::Client) -> HashMap<String, String> {
    let mut map = HashMap::new();
    let contacts = match bb_fetch(
        client,
        "/contact/query",
        reqwest::Method::POST,
        Some(json!({ "limit": 500 })),
    )
    .await
    {
        Ok(v) => v,
        Err(_) => return map,
    };

    let arr = contacts.as_array().unwrap_or(&Vec::new()).clone();
    for c in &arr {
        let display_name = c.get("displayName").and_then(|v| v.as_str()).unwrap_or("");
        let first = c.get("firstName").and_then(|v| v.as_str()).unwrap_or("");
        let last = c.get("lastName").and_then(|v| v.as_str()).unwrap_or("");
        let name = if !display_name.is_empty() {
            display_name.to_string()
        } else {
            [first, last]
                .iter()
                .filter(|s| !s.is_empty())
                .copied()
                .collect::<Vec<_>>()
                .join(" ")
        };
        if name.is_empty() {
            continue;
        }

        if let Some(phones) = c.get("phoneNumbers").and_then(|v| v.as_array()) {
            for ph in phones {
                if let Some(addr) = ph.get("address").and_then(|v| v.as_str()) {
                    let normalized = normalize_phone(addr);
                    if normalized.len() >= 7 {
                        map.insert(normalized, name.clone());
                    }
                }
            }
        }

        if let Some(emails) = c.get("emails").and_then(|v| v.as_array()) {
            for em in emails {
                if let Some(addr) = em.get("address").and_then(|v| v.as_str()) {
                    if addr.contains('@') {
                        map.insert(addr.to_lowercase(), name.clone());
                    }
                }
            }
        }
    }
    map
}

// ---------------------------------------------------------------------------
// Avatar cache (mirrors avatar/route.ts)
// ---------------------------------------------------------------------------

struct AvatarCache {
    map: HashMap<String, Vec<u8>>,
    fetched_at: std::time::Instant,
}

static AVATAR_CACHE: OnceLock<RwLock<Option<AvatarCache>>> = OnceLock::new();

fn avatar_cache() -> &'static RwLock<Option<AvatarCache>> {
    AVATAR_CACHE.get_or_init(|| RwLock::new(None))
}

const AVATAR_CACHE_TTL: std::time::Duration = std::time::Duration::from_secs(10 * 60);
const MAX_AVATAR_BYTES: usize = 512 * 1024;
const MAX_CACHE_BYTES: usize = 100 * 1024 * 1024;

async fn get_bb_contact_avatars(client: &reqwest::Client) -> HashMap<String, Vec<u8>> {
    // Check cache
    {
        let cache = avatar_cache().read().await;
        if let Some(ref c) = *cache {
            if c.fetched_at.elapsed() < AVATAR_CACHE_TTL {
                return c.map.clone();
            }
        }
    }

    let map = fetch_bb_contact_avatars(client).await;

    // Update cache
    {
        let mut cache = avatar_cache().write().await;
        *cache = Some(AvatarCache {
            map: map.clone(),
            fetched_at: std::time::Instant::now(),
        });
    }

    map
}

async fn fetch_bb_contact_avatars(client: &reqwest::Client) -> HashMap<String, Vec<u8>> {
    let host = bb_host();
    if host.is_empty() {
        return HashMap::new();
    }
    let password = bb_password();
    let url = format!(
        "{}/api/v1/contact/query?password={}",
        host,
        percent_encode(&password)
    );

    let res = match client
        .post(&url)
        .header("Content-Type", "application/json")
        .json(&json!({ "limit": 500, "extraProperties": ["avatar"] }))
        .send()
        .await
    {
        Ok(r) => r,
        Err(_) => return HashMap::new(),
    };

    if !res.status().is_success() {
        return HashMap::new();
    }

    let json: Value = match res.json().await {
        Ok(v) => v,
        Err(_) => return HashMap::new(),
    };

    if json.get("status").and_then(|v| v.as_i64()) != Some(200) {
        return HashMap::new();
    }

    let mut map = HashMap::new();
    let mut total_bytes: usize = 0;
    let data = json.get("data").and_then(|v| v.as_array());

    for c in data.unwrap_or(&Vec::new()) {
        let avatar_b64 = match c.get("avatar").and_then(|v| v.as_str()) {
            Some(s) if !s.is_empty() => s,
            _ => continue,
        };

        use base64_decode::decode_base64;
        let buf = match decode_base64(avatar_b64) {
            Some(b) => b,
            None => continue,
        };

        if buf.len() > MAX_AVATAR_BYTES {
            continue;
        }
        if total_bytes + buf.len() > MAX_CACHE_BYTES {
            break;
        }

        if let Some(phones) = c.get("phoneNumbers").and_then(|v| v.as_array()) {
            for ph in phones {
                if let Some(addr) = ph.get("address").and_then(|v| v.as_str()) {
                    let n = normalize_phone(addr);
                    if n.len() >= 7 {
                        map.insert(n, buf.clone());
                    }
                }
            }
        }
        if let Some(emails) = c.get("emails").and_then(|v| v.as_array()) {
            for em in emails {
                if let Some(addr) = em.get("address").and_then(|v| v.as_str()) {
                    if addr.contains('@') {
                        map.insert(addr.to_lowercase(), buf.clone());
                    }
                }
            }
        }
        total_bytes += buf.len();
    }

    map
}

// Inline base64 decoder (no external crate needed — mirrors chat.rs pattern)
mod base64_decode {
    const TABLE: &[u8; 64] =
        b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

    pub fn decode_base64(input: &str) -> Option<Vec<u8>> {
        let mut lookup = [255u8; 256];
        for (i, &c) in TABLE.iter().enumerate() {
            lookup[c as usize] = i as u8;
        }

        let input = input.trim_end_matches('=');
        let len = input.len();
        let mut out = Vec::with_capacity(len * 3 / 4);
        let bytes = input.as_bytes();

        let mut i = 0;
        while i < len {
            let remaining = len - i;
            let a = lookup[*bytes.get(i).unwrap_or(&b'A') as usize];
            let b = lookup[*bytes.get(i + 1).unwrap_or(&b'A') as usize];
            if a == 255 || b == 255 {
                return None;
            }
            out.push((a << 2) | (b >> 4));

            if remaining > 2 {
                let c = lookup[bytes[i + 2] as usize];
                if c == 255 {
                    return None;
                }
                out.push((b << 4) | (c >> 2));
                if remaining > 3 {
                    let d = lookup[bytes[i + 3] as usize];
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
}

// ---------------------------------------------------------------------------
// TIFF-to-JPEG conversion using the `image` crate (mirrors sharp usage in TS)
// ---------------------------------------------------------------------------

fn to_jpeg(data: &[u8]) -> Result<Vec<u8>, String> {
    let img = image::load_from_memory(data).map_err(|e| format!("image decode: {}", e))?;
    let mut buf = Cursor::new(Vec::new());
    img.write_to(&mut buf, image::ImageFormat::Jpeg)
        .map_err(|e| format!("jpeg encode: {}", e))?;
    Ok(buf.into_inner())
}

// ---------------------------------------------------------------------------
// UUID helper
// ---------------------------------------------------------------------------

fn random_uuid() -> String {
    use rand::Rng;
    let mut rng = rand::thread_rng();
    let mut bytes = [0u8; 16];
    rng.fill(&mut bytes);
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

// ---------------------------------------------------------------------------
// Reaction processing (mirrors route.ts processMessagesWithReactions)
// ---------------------------------------------------------------------------

/// Map string reaction names to numeric types
fn normalize_reaction_type(raw: &Value) -> Option<i64> {
    if let Some(n) = raw.as_i64() {
        if n >= 2000 {
            return Some(n);
        }
    }
    if let Some(s) = raw.as_str() {
        let map: &[(&str, i64)] = &[
            ("love", 2000),
            ("like", 2001),
            ("dislike", 2002),
            ("laugh", 2003),
            ("emphasize", 2004),
            ("question", 2005),
            ("-love", 3000),
            ("-like", 3001),
            ("-dislike", 3002),
            ("-laugh", 3003),
            ("-emphasize", 3004),
            ("-question", 3005),
        ];
        for &(name, val) in map {
            if s == name {
                return Some(val);
            }
        }
    }
    None
}

/// Strips p:N/ or bp: prefix from associated GUID to get parent GUID
fn strip_reaction_prefix(guid: &str) -> String {
    static RE: OnceLock<Regex> = OnceLock::new();
    let re = RE.get_or_init(|| Regex::new(r"^(p|bp):\d+/").unwrap());
    re.replace(guid, "").into_owned()
}

#[derive(Clone)]
struct ReactionInfo {
    reaction_type: i64,
    from_me: bool,
    handle: Option<String>,
    date_created: i64,
}

fn process_messages_with_reactions(raw_messages: &[Value]) -> Vec<Value> {
    // Map: parentGuid -> Map<senderKey, ReactionInfo>
    let mut reaction_map: HashMap<String, HashMap<String, ReactionInfo>> = HashMap::new();
    let mut regular_messages: Vec<Value> = Vec::new();

    for msg in raw_messages {
        let assoc_guid = msg
            .get("associatedMessageGuid")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let assoc_type = msg
            .get("associatedMessageType")
            .unwrap_or(&Value::Null);
        let reaction_type = normalize_reaction_type(assoc_type);

        if !assoc_guid.is_empty() && reaction_type.is_some() {
            let reaction_type = reaction_type.unwrap();
            let parent_guid = strip_reaction_prefix(assoc_guid);
            let is_from_me = msg
                .get("isFromMe")
                .and_then(|v| v.as_bool())
                .or_else(|| msg.get("isFromMe").and_then(|v| v.as_i64()).map(|n| n != 0))
                .unwrap_or(false);
            let sender_key = if is_from_me {
                "__me__".to_string()
            } else {
                msg.pointer("/handle/address")
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown")
                    .to_string()
            };
            let date_created = msg
                .get("dateCreated")
                .and_then(|v| v.as_i64())
                .unwrap_or(0);

            let sender_map = reaction_map.entry(parent_guid).or_default();
            let existing = sender_map.get(&sender_key);
            let should_update = existing
                .map(|e| date_created > e.date_created)
                .unwrap_or(true);

            if should_update {
                if reaction_type >= 3000 {
                    // Remove reaction
                    sender_map.remove(&sender_key);
                } else {
                    sender_map.insert(
                        sender_key,
                        ReactionInfo {
                            reaction_type,
                            from_me: is_from_me,
                            handle: if is_from_me {
                                None
                            } else {
                                msg.pointer("/handle/address")
                                    .and_then(|v| v.as_str())
                                    .map(|s| s.to_string())
                            },
                            date_created,
                        },
                    );
                }
            }
        } else {
            regular_messages.push(msg.clone());
        }
    }

    // Attach reactions to parent messages
    for msg in &mut regular_messages {
        let guid = msg.get("guid").and_then(|v| v.as_str()).unwrap_or("");
        if let Some(reactions) = reaction_map.get(guid) {
            if !reactions.is_empty() {
                let reactions_arr: Vec<Value> = reactions
                    .values()
                    .map(|r| {
                        let mut obj = json!({
                            "type": r.reaction_type,
                            "fromMe": r.from_me,
                        });
                        if let Some(ref h) = r.handle {
                            obj.as_object_mut()
                                .unwrap()
                                .insert("handle".into(), json!(h));
                        }
                        obj
                    })
                    .collect();
                msg.as_object_mut()
                    .unwrap()
                    .insert("reactions".into(), json!(reactions_arr));
            }
        }
    }

    regular_messages
}

// ---------------------------------------------------------------------------
// Service priority for conversation deduplication
// ---------------------------------------------------------------------------

fn service_priority(guid: &str) -> i32 {
    if guid.starts_with("iMessage;") {
        3
    } else if guid.starts_with("RCS;") {
        2
    } else if guid.starts_with("SMS;") {
        1
    } else {
        0
    }
}

// ---------------------------------------------------------------------------
// GET /messages — list conversations or get messages for a conversation
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct MessagesQuery {
    conversation: Option<String>,
    limit: Option<String>,
    before: Option<String>,
}

async fn get_messages(
    State(state): State<AppState>,
    Query(params): Query<MessagesQuery>,
) -> Response {
    let client = &state.http;

    if let Some(ref chat_guid) = params.conversation {
        // Fetch messages for a specific conversation
        if !chat_guid_re().is_match(chat_guid) {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": "Invalid conversation ID" })),
            )
                .into_response();
        }

        let requested_limit = params
            .limit
            .as_deref()
            .and_then(|s| s.parse::<i64>().ok())
            .unwrap_or(25)
            .max(1)
            .min(500);

        let mut query_body = json!({
            "chatGuid": chat_guid,
            "limit": (requested_limit * 4).min(1000),
            "offset": 0,
            "sort": "DESC",
            "with": ["attachment", "handle"],
        });

        if let Some(ref before_str) = params.before {
            if let Ok(before_ts) = before_str.parse::<i64>() {
                query_body
                    .as_object_mut()
                    .unwrap()
                    .insert("before".into(), json!(before_ts));
            }
        }

        let (raw_result, contact_map) = tokio::join!(
            bb_fetch(client, "/message/query", reqwest::Method::POST, Some(query_body)),
            get_contact_map(client),
        );

        match raw_result {
            Ok(raw_data) => {
                let mut arr = raw_data
                    .as_array()
                    .cloned()
                    .unwrap_or_default();
                arr.reverse(); // chronological order
                let messages = process_messages_with_reactions(&arr);

                Json(json!({
                    "messages": messages,
                    "contacts": contact_map,
                }))
                .into_response()
            }
            Err(e) => {
                if e == "bluebubbles_not_configured" {
                    return Json(json!({
                        "error": "bluebubbles_not_configured",
                        "messages": [],
                    }))
                    .into_response();
                }
                tracing::error!("Messages API error: {}", e);
                (
                    StatusCode::BAD_GATEWAY,
                    Json(json!({ "error": "Backend service error" })),
                )
                    .into_response()
            }
        }
    } else {
        // List conversations
        let requested_conv_limit = params
            .limit
            .as_deref()
            .and_then(|s| s.parse::<i64>().ok())
            .unwrap_or(25)
            .max(1)
            .min(500);

        let chat_query = json!({
            "limit": requested_conv_limit,
            "offset": 0,
            "sort": "lastmessage",
            "with": ["lastMessage", "participants"],
        });

        let fetch_recent = requested_conv_limit > 100;
        let now_ms = chrono::Utc::now().timestamp_millis();
        let fourteen_days_ago = now_ms - 14 * 24 * 60 * 60 * 1000;

        let recent_query = json!({
            "limit": 500,
            "sort": "DESC",
            "after": fourteen_days_ago,
            "with": ["chat"],
        });

        let (chats_result, recent_result, contact_map) = tokio::join!(
            bb_fetch(client, "/chat/query", reqwest::Method::POST, Some(chat_query)),
            async {
                if fetch_recent {
                    bb_fetch(client, "/message/query", reqwest::Method::POST, Some(recent_query))
                        .await
                        .unwrap_or(Value::Array(vec![]))
                } else {
                    Value::Array(vec![])
                }
            },
            get_contact_map(client),
        );

        let chats = match chats_result {
            Ok(v) => v,
            Err(e) => {
                if e == "bluebubbles_not_configured" {
                    return Json(json!({
                        "error": "bluebubbles_not_configured",
                        "conversations": [],
                    }))
                    .into_response();
                }
                tracing::error!("Messages API error: {}", e);
                return (
                    StatusCode::BAD_GATEWAY,
                    Json(json!({ "error": "Backend service error" })),
                )
                    .into_response();
            }
        };

        let chats_arr = chats.as_array().cloned().unwrap_or_default();
        let recent_arr = recent_result.as_array().cloned().unwrap_or_default();

        // Build conversation map keyed by normalized phone/email
        // Track: best chat entry (prefer iMessage) + newest date across all versions
        let mut best_chat: HashMap<String, Value> = HashMap::new();

        #[derive(Clone)]
        struct NewestInfo {
            text: Option<String>,
            date_created: Option<i64>,
            is_from_me: Option<bool>,
            date_read: Option<i64>,
        }
        let mut newest_date: HashMap<String, NewestInfo> = HashMap::new();

        for c in &chats_arr {
            let chat_id = c
                .get("chatIdentifier")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let norm = normalize_phone(chat_id);
            let normalized_id = if !norm.is_empty() {
                norm
            } else {
                chat_id.to_lowercase()
            };
            if normalized_id.is_empty() {
                continue;
            }

            let this_guid = c.get("guid").and_then(|v| v.as_str()).unwrap_or("");
            let this_priority = service_priority(this_guid);

            let existing_priority = best_chat
                .get(&normalized_id)
                .and_then(|e| e.get("guid").and_then(|v| v.as_str()))
                .map(service_priority)
                .unwrap_or(-1);

            if !best_chat.contains_key(&normalized_id) || this_priority > existing_priority {
                best_chat.insert(normalized_id.clone(), c.clone());
            }

            let this_date = c
                .pointer("/lastMessage/dateCreated")
                .and_then(|v| v.as_i64())
                .unwrap_or(0);
            let prev = newest_date.get(&normalized_id);
            let should_update = prev
                .map(|p| this_date > p.date_created.unwrap_or(0))
                .unwrap_or(true);
            if should_update {
                newest_date.insert(
                    normalized_id,
                    NewestInfo {
                        text: c
                            .pointer("/lastMessage/text")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string()),
                        date_created: c
                            .pointer("/lastMessage/dateCreated")
                            .and_then(|v| v.as_i64()),
                        is_from_me: c
                            .pointer("/lastMessage/isFromMe")
                            .and_then(|v| v.as_bool())
                            .or_else(|| {
                                c.pointer("/lastMessage/isFromMe")
                                    .and_then(|v| v.as_i64())
                                    .map(|n| n != 0)
                            }),
                        date_read: c
                            .pointer("/lastMessage/dateRead")
                            .and_then(|v| v.as_i64()),
                    },
                );
            }
        }

        // Supplement with recent messages
        for msg in &recent_arr {
            let msg_chats = msg.get("chats").and_then(|v| v.as_array());
            for chat in msg_chats.unwrap_or(&Vec::new()) {
                let chat_id = chat
                    .get("chatIdentifier")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                let norm = normalize_phone(chat_id);
                let normalized_id = if !norm.is_empty() {
                    norm
                } else {
                    chat_id.to_lowercase()
                };
                if normalized_id.is_empty() {
                    continue;
                }

                let this_guid = chat.get("guid").and_then(|v| v.as_str()).unwrap_or("");
                let this_priority = service_priority(this_guid);
                let existing_priority = best_chat
                    .get(&normalized_id)
                    .and_then(|e| e.get("guid").and_then(|v| v.as_str()))
                    .map(service_priority)
                    .unwrap_or(-1);

                if !best_chat.contains_key(&normalized_id) {
                    best_chat.insert(normalized_id.clone(), chat.clone());
                } else if this_priority > existing_priority {
                    // Preserve participants from existing record
                    let mut merged = chat.clone();
                    if merged.get("participants").is_none()
                        || merged
                            .get("participants")
                            .and_then(|v| v.as_array())
                            .map(|a| a.is_empty())
                            .unwrap_or(true)
                    {
                        if let Some(existing) = best_chat.get(&normalized_id) {
                            if let Some(p) = existing.get("participants") {
                                merged
                                    .as_object_mut()
                                    .unwrap()
                                    .insert("participants".into(), p.clone());
                            }
                        }
                    }
                    best_chat.insert(normalized_id.clone(), merged);
                }

                let msg_date = msg.get("dateCreated").and_then(|v| v.as_i64()).unwrap_or(0);
                let prev = newest_date.get(&normalized_id);
                let should_update = prev
                    .map(|p| msg_date > p.date_created.unwrap_or(0))
                    .unwrap_or(true);
                if should_update {
                    newest_date.insert(
                        normalized_id,
                        NewestInfo {
                            text: msg
                                .get("text")
                                .and_then(|v| v.as_str())
                                .map(|s| s.to_string()),
                            date_created: msg.get("dateCreated").and_then(|v| v.as_i64()),
                            is_from_me: msg
                                .get("isFromMe")
                                .and_then(|v| v.as_bool())
                                .or_else(|| {
                                    msg.get("isFromMe").and_then(|v| v.as_i64()).map(|n| n != 0)
                                }),
                            date_read: msg.get("dateRead").and_then(|v| v.as_i64()),
                        },
                    );
                }
            }
        }

        // Build contact lookup for frontend
        let contact_lookup: HashMap<String, String> = contact_map.clone();

        // Backfill participants for chats missing them
        let mut missing_participant_guids: Vec<String> = Vec::new();
        for (_norm_id, entry) in best_chat.iter_mut() {
            let has_participants = entry
                .get("participants")
                .and_then(|v| v.as_array())
                .map(|a| !a.is_empty())
                .unwrap_or(false);

            if !has_participants {
                let chat_id = entry
                    .get("chatIdentifier")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let guid = entry.get("guid").and_then(|v| v.as_str()).unwrap_or("").to_string();
                let is_group = guid.contains(";+;");

                if is_group {
                    missing_participant_guids.push(guid);
                } else if !chat_id.is_empty() {
                    // 1:1 chat — infer participant from chatIdentifier
                    let guid_service = guid.split(';').next().unwrap_or("").to_string();
                    let service = if !guid_service.is_empty() && guid_service != "any" {
                        guid_service
                    } else {
                        "iMessage".to_string()
                    };
                    entry.as_object_mut().unwrap().insert(
                        "participants".into(),
                        json!([{ "address": chat_id, "service": service }]),
                    );
                }
            }
        }

        // Batch-fetch participants for group chats missing them
        if !missing_participant_guids.is_empty() {
            let fetches: Vec<_> = missing_participant_guids
                .iter()
                .map(|guid| {
                    let client = client.clone();
                    let guid = guid.clone();
                    async move {
                        let result = bb_fetch(
                            &client,
                            "/chat/query",
                            reqwest::Method::POST,
                            Some(json!({ "guid": guid, "with": ["participants"] })),
                        )
                        .await;
                        match result {
                            Ok(data) => {
                                let arr = data.as_array().cloned().unwrap_or_default();
                                arr.into_iter().next()
                            }
                            Err(_) => None,
                        }
                    }
                })
                .collect();

            let results = futures::future::join_all(fetches).await;
            let mut group_participants_map: HashMap<String, Value> = HashMap::new();

            for (i, chat_data) in results.into_iter().enumerate() {
                if let Some(cd) = chat_data {
                    if let Some(participants) = cd.get("participants") {
                        if participants.as_array().map(|a| !a.is_empty()).unwrap_or(false) {
                            group_participants_map
                                .insert(missing_participant_guids[i].clone(), participants.clone());
                        }
                    }
                }
            }

            // For group chats where BB returned no participants, infer from recent message handles
            let still_missing: Vec<String> = missing_participant_guids
                .iter()
                .filter(|g| !group_participants_map.contains_key(*g))
                .cloned()
                .collect();

            if !still_missing.is_empty() {
                let msg_fetches: Vec<_> = still_missing
                    .iter()
                    .map(|guid| {
                        let client = client.clone();
                        let guid = guid.clone();
                        async move {
                            bb_fetch(
                                &client,
                                "/message/query",
                                reqwest::Method::POST,
                                Some(json!({
                                    "chatGuid": guid,
                                    "limit": 50,
                                    "sort": "DESC",
                                    "with": ["handle"],
                                })),
                            )
                            .await
                            .unwrap_or(Value::Array(vec![]))
                        }
                    })
                    .collect();

                let msg_results = futures::future::join_all(msg_fetches).await;
                for (i, msgs) in msg_results.into_iter().enumerate() {
                    let msgs_arr = msgs.as_array().cloned().unwrap_or_default();
                    let mut seen = std::collections::HashSet::new();
                    let mut inferred: Vec<Value> = Vec::new();
                    for m in &msgs_arr {
                        let addr = m.pointer("/handle/address").and_then(|v| v.as_str());
                        let handle_svc = m
                            .pointer("/handle/service")
                            .and_then(|v| v.as_str())
                            .unwrap_or("");
                        if let Some(addr) = addr {
                            if seen.insert(addr.to_string()) {
                                inferred.push(json!({
                                    "address": addr,
                                    "service": handle_svc,
                                }));
                            }
                        }
                    }
                    if !inferred.is_empty() {
                        group_participants_map
                            .insert(still_missing[i].clone(), json!(inferred));
                    }
                }
            }

            // Patch best_chat entries
            for (_norm_id, entry) in best_chat.iter_mut() {
                let has = entry
                    .get("participants")
                    .and_then(|v| v.as_array())
                    .map(|a| !a.is_empty())
                    .unwrap_or(false);
                if !has {
                    let guid = entry
                        .get("guid")
                        .and_then(|v| v.as_str())
                        .unwrap_or("");
                    if let Some(fetched) = group_participants_map.get(guid) {
                        entry
                            .as_object_mut()
                            .unwrap()
                            .insert("participants".into(), fetched.clone());
                    }
                }
            }
        }

        // Build final conversations
        let mut conversations: Vec<Value> = best_chat
            .iter()
            .map(|(normalized_id, c)| {
                let participants_raw = c
                    .get("participants")
                    .and_then(|v| v.as_array())
                    .cloned()
                    .unwrap_or_default();
                let participants: Vec<Value> = participants_raw
                    .iter()
                    .map(|p| {
                        json!({
                            "address": p.get("address").and_then(|v| v.as_str()).unwrap_or(""),
                            "service": p.get("service").and_then(|v| v.as_str()).unwrap_or(""),
                        })
                    })
                    .collect();
                let chat_id = c
                    .get("chatIdentifier")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                let newest = newest_date.get(normalized_id);

                // Resolve display name from contacts
                let mut display_name: Option<String> =
                    c.get("displayName").and_then(|v| v.as_str()).and_then(|s| {
                        if s.is_empty() {
                            None
                        } else {
                            Some(s.to_string())
                        }
                    });
                if display_name.is_none() && participants.len() == 1 {
                    let addr = participants[0]
                        .get("address")
                        .and_then(|v| v.as_str())
                        .unwrap_or("");
                    display_name = contact_map
                        .get(&normalize_phone(addr))
                        .or_else(|| contact_map.get(&addr.to_lowercase()))
                        .cloned();
                }
                if display_name.is_none() && !chat_id.is_empty() {
                    display_name = contact_map
                        .get(&normalize_phone(chat_id))
                        .or_else(|| contact_map.get(&chat_id.to_lowercase()))
                        .cloned();
                }

                // Unread = last message is incoming and has no dateRead
                let is_unread = newest
                    .as_ref()
                    .map(|n| !n.is_from_me.unwrap_or(true) && n.date_read.is_none())
                    .unwrap_or(false);

                // Resolve service — macOS 26+ uses 'any' prefix
                let guid_str = c.get("guid").and_then(|v| v.as_str()).unwrap_or("");
                let service = {
                    let part_svc = participants
                        .first()
                        .and_then(|p| p.get("service").and_then(|v| v.as_str()))
                        .unwrap_or("");
                    let part_svc_lower = part_svc.to_lowercase();
                    if !part_svc_lower.is_empty() && part_svc_lower != "any" {
                        part_svc.to_string()
                    } else {
                        let guid_prefix = guid_str
                            .split(';')
                            .next()
                            .unwrap_or("")
                            .to_lowercase();
                        if !guid_prefix.is_empty() && guid_prefix != "any" {
                            guid_prefix
                        } else {
                            // 'any' with no explicit SMS -> iMessage (macOS 26+ default)
                            let has_sms = participants.iter().any(|p| {
                                p.get("service")
                                    .and_then(|v| v.as_str())
                                    .map(|s| s.eq_ignore_ascii_case("sms"))
                                    .unwrap_or(false)
                            });
                            let has_rcs = participants.iter().any(|p| {
                                p.get("service")
                                    .and_then(|v| v.as_str())
                                    .map(|s| s.eq_ignore_ascii_case("rcs"))
                                    .unwrap_or(false)
                            });
                            if has_sms {
                                "SMS".to_string()
                            } else if has_rcs {
                                "RCS".to_string()
                            } else {
                                "iMessage".to_string()
                            }
                        }
                    }
                };

                json!({
                    "guid": guid_str,
                    "chatId": chat_id,
                    "displayName": display_name,
                    "participants": participants,
                    "service": service,
                    "lastMessage": newest.as_ref().and_then(|n| n.text.clone()),
                    "lastDate": newest.as_ref().and_then(|n| n.date_created),
                    "lastFromMe": if newest.as_ref().and_then(|n| n.is_from_me).unwrap_or(false) { 1 } else { 0 },
                    "isUnread": is_unread,
                })
            })
            .collect();

        // Sort by most recent message
        conversations.sort_by(|a, b| {
            let a_date = a.get("lastDate").and_then(|v| v.as_i64()).unwrap_or(0);
            let b_date = b.get("lastDate").and_then(|v| v.as_i64()).unwrap_or(0);
            b_date.cmp(&a_date)
        });

        (
            [
                (header::CACHE_CONTROL, "private, max-age=5, stale-while-revalidate=30"),
            ],
            Json(json!({
                "conversations": conversations,
                "contacts": contact_lookup,
            })),
        )
            .into_response()
    }
}

// ---------------------------------------------------------------------------
// POST /messages — send a message
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct SendMessageBody {
    #[serde(rename = "chatGuid")]
    chat_guid: Option<String>,
    text: Option<String>,
    #[serde(rename = "selectedMessageGuid")]
    selected_message_guid: Option<String>,
}

async fn post_message(
    State(state): State<AppState>,
    Json(body): Json<SendMessageBody>,
) -> Response {
    let chat_guid = match &body.chat_guid {
        Some(g) if !g.is_empty() => g.clone(),
        _ => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": "chatGuid and text required" })),
            )
                .into_response()
        }
    };
    let text = match &body.text {
        Some(t) if !t.is_empty() => t.clone(),
        _ => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": "chatGuid and text required" })),
            )
                .into_response()
        }
    };

    if !chat_guid_re().is_match(&chat_guid) {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Invalid conversation ID" })),
        )
            .into_response();
    }
    if text.len() > 10000 {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Message too long" })),
        )
            .into_response();
    }
    if let Some(ref reply_guid) = body.selected_message_guid {
        if !message_guid_re().is_match(reply_guid) {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": "Invalid reply message GUID" })),
            )
                .into_response();
        }
    }

    let mut send_body = json!({
        "chatGuid": chat_guid,
        "tempGuid": format!("temp-{}", random_uuid()),
        "message": text,
    });
    if let Some(ref reply_guid) = body.selected_message_guid {
        send_body
            .as_object_mut()
            .unwrap()
            .insert("selectedMessageGuid".into(), json!(reply_guid));
    }

    match bb_fetch(
        &state.http,
        "/message/text",
        reqwest::Method::POST,
        Some(send_body),
    )
    .await
    {
        Ok(result) => Json(json!({ "ok": true, "message": result })).into_response(),
        Err(e) => {
            tracing::error!("Send message error: {}", e);
            (
                StatusCode::BAD_GATEWAY,
                Json(json!({ "error": "Failed to send message" })),
            )
                .into_response()
        }
    }
}

// ---------------------------------------------------------------------------
// GET /messages/avatar — fetch contact avatar
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct AvatarQuery {
    address: Option<String>,
}

async fn get_avatar(
    State(state): State<AppState>,
    Query(params): Query<AvatarQuery>,
) -> Response {
    let address = match &params.address {
        Some(a) if !a.is_empty() => a.clone(),
        _ => return StatusCode::NOT_FOUND.into_response(),
    };

    let normalized = normalize_phone(&address);
    let lowered = address.to_lowercase();

    // 1) Try BlueBubbles contact avatars first (already browser-friendly JPEG/PNG)
    let avatars = get_bb_contact_avatars(&state.http).await;
    let avatar = avatars.get(&normalized).or_else(|| avatars.get(&lowered));
    if let Some(buf) = avatar {
        return (
            [
                (header::CONTENT_TYPE, "image/jpeg"),
                (header::CACHE_CONTROL, "public, max-age=3600"),
            ],
            buf.clone(),
        )
            .into_response();
    }

    // 2) Try MAC_BRIDGE (may return TIFF — convert to JPEG)
    let bhost = bridge_host();
    if !bhost.is_empty() {
        let url = format!(
            "{}/contacts/photo?address={}",
            bhost,
            percent_encode(&address)
        );
        let mut req = state.http.get(&url);
        for (k, v) in bridge_headers() {
            req = req.header(&k, &v);
        }
        if let Ok(res) = req.send().await {
            if res.status().is_success() {
                if let Ok(image_data) = res.bytes().await {
                    if !image_data.is_empty() {
                        match to_jpeg(&image_data) {
                            Ok(jpeg) => {
                                return (
                                    [
                                        (header::CONTENT_TYPE, "image/jpeg"),
                                        (header::CACHE_CONTROL, "public, max-age=3600"),
                                    ],
                                    jpeg,
                                )
                                    .into_response();
                            }
                            Err(e) => {
                                tracing::warn!("Avatar TIFF->JPEG conversion failed: {}", e);
                            }
                        }
                    }
                }
            }
        }
    }

    (
        StatusCode::NOT_FOUND,
        [(header::CACHE_CONTROL, "public, max-age=86400")],
    )
        .into_response()
}

// ---------------------------------------------------------------------------
// POST /messages/avatar — batch check which addresses have avatars
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct AvatarBatchBody {
    addresses: Option<Vec<String>>,
}

async fn post_avatar_batch(
    State(state): State<AppState>,
    Json(body): Json<AvatarBatchBody>,
) -> Response {
    let addresses = match body.addresses {
        Some(ref a) => a,
        None => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": "addresses array required" })),
            )
                .into_response();
        }
    };

    let avatars = get_bb_contact_avatars(&state.http).await;
    let mut available: Vec<String> = Vec::new();

    for addr in addresses {
        let normalized = normalize_phone(addr);
        let lowered = addr.to_lowercase();
        if avatars.contains_key(&normalized) || avatars.contains_key(&lowered) {
            available.push(addr.clone());
        }
    }

    (
        [(header::CACHE_CONTROL, "public, max-age=300")],
        Json(json!({ "available": available })),
    )
        .into_response()
}

// ---------------------------------------------------------------------------
// GET /messages/link-preview — extract OpenGraph metadata with SSRF protection
// ---------------------------------------------------------------------------

fn blocked_host_regexes() -> &'static Vec<Regex> {
    static RES: OnceLock<Vec<Regex>> = OnceLock::new();
    RES.get_or_init(|| {
        vec![
            Regex::new(r"(?i)^localhost$").unwrap(),
            Regex::new(r"^127\.").unwrap(),
            Regex::new(r"^10\.").unwrap(),
            Regex::new(r"^0\.").unwrap(),
            Regex::new(r"^169\.254\.").unwrap(),
            Regex::new(r"^172\.(1[6-9]|2\d|3[01])\.").unwrap(),
            Regex::new(r"^192\.168\.").unwrap(),
            Regex::new(r"^\[::1\]").unwrap(),
            Regex::new(r"(?i)^fe80:").unwrap(),
            Regex::new(r"(?i)^fc00:").unwrap(),
            Regex::new(r"(?i)^fd").unwrap(),
        ]
    })
}

fn is_blocked_host(hostname: &str) -> bool {
    blocked_host_regexes()
        .iter()
        .any(|re| re.is_match(hostname))
}

fn extract_og(html: &str, property: &str) -> String {
    // Try property="..." content="..."
    let pat1 = format!(
        r#"<meta[^>]*property=["']{}["'][^>]*content=["']([^"']*)["']"#,
        regex::escape(property)
    );
    if let Ok(re) = Regex::new(&pat1) {
        if let Some(caps) = re.captures(html) {
            if let Some(m) = caps.get(1) {
                return m.as_str().to_string();
            }
        }
    }
    // Try content="..." property="..."
    let pat2 = format!(
        r#"<meta[^>]*content=["']([^"']*)["'][^>]*property=["']{}["']"#,
        regex::escape(property)
    );
    if let Ok(re) = Regex::new(&pat2) {
        if let Some(caps) = re.captures(html) {
            if let Some(m) = caps.get(1) {
                return m.as_str().to_string();
            }
        }
    }
    String::new()
}

fn extract_name(html: &str, name: &str) -> String {
    let pat1 = format!(
        r#"<meta[^>]*name=["']{}["'][^>]*content=["']([^"']*)["']"#,
        regex::escape(name)
    );
    if let Ok(re) = Regex::new(&pat1) {
        if let Some(caps) = re.captures(html) {
            if let Some(m) = caps.get(1) {
                return m.as_str().to_string();
            }
        }
    }
    let pat2 = format!(
        r#"<meta[^>]*content=["']([^"']*)["'][^>]*name=["']{}["']"#,
        regex::escape(name)
    );
    if let Ok(re) = Regex::new(&pat2) {
        if let Some(caps) = re.captures(html) {
            if let Some(m) = caps.get(1) {
                return m.as_str().to_string();
            }
        }
    }
    String::new()
}

fn decode_entities(s: &str) -> String {
    let mut result = s.to_string();
    result = result.replace("&amp;", "&");
    result = result.replace("&lt;", "<");
    result = result.replace("&gt;", ">");
    result = result.replace("&quot;", "\"");
    result = result.replace("&#39;", "'");
    result = result.replace("&#x27;", "'");

    // Decode numeric character references &#NNN;
    static NUM_ENTITY: OnceLock<Regex> = OnceLock::new();
    let re = NUM_ENTITY.get_or_init(|| Regex::new(r"&#(\d+);").unwrap());
    result = re
        .replace_all(&result, |caps: &regex::Captures| {
            caps.get(1)
                .and_then(|m| m.as_str().parse::<u32>().ok())
                .and_then(char::from_u32)
                .map(|c| c.to_string())
                .unwrap_or_default()
        })
        .into_owned();

    result
}

#[derive(Deserialize)]
struct LinkPreviewQuery {
    url: Option<String>,
}

async fn get_link_preview(
    State(state): State<AppState>,
    Query(params): Query<LinkPreviewQuery>,
) -> Response {
    let url_str = match &params.url {
        Some(u) if !u.is_empty() => u.clone(),
        _ => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": "url required" })),
            )
                .into_response()
        }
    };

    let parsed = match reqwest::Url::parse(&url_str) {
        Ok(u) => u,
        Err(_) => {
            // Fall back: try to parse as a URL; if it still fails, try prepending https://
            match reqwest::Url::parse(&format!("https://{}", url_str)) {
                Ok(u) => u,
                Err(_) => {
                    return (
                        StatusCode::BAD_REQUEST,
                        Json(json!({ "error": "Invalid URL" })),
                    )
                        .into_response();
                }
            }
        }
    };

    let scheme = parsed.scheme();
    if scheme != "http" && scheme != "https" {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Invalid protocol" })),
        )
            .into_response();
    }

    let hostname = parsed.host_str().unwrap_or("");
    if is_blocked_host(hostname) {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Blocked host" })),
        )
            .into_response();
    }

    let is_twitter = {
        static RE: OnceLock<Regex> = OnceLock::new();
        let re = RE.get_or_init(|| {
            Regex::new(r"(?i)^(www\.)?(twitter\.com|x\.com)$").unwrap()
        });
        re.is_match(hostname)
    };
    let is_instagram = {
        static RE: OnceLock<Regex> = OnceLock::new();
        let re =
            RE.get_or_init(|| Regex::new(r"(?i)^(www\.)?instagram\.com$").unwrap());
        re.is_match(hostname)
    };

    // Instagram: return a static preview since they block all scrapers
    if is_instagram {
        static PATH_RE: OnceLock<Regex> = OnceLock::new();
        let path_re =
            PATH_RE.get_or_init(|| Regex::new(r"^/(p|reel|stories)/([^/]+)").unwrap());
        let title = if let Some(caps) = path_re.captures(parsed.path()) {
            let kind = caps.get(1).map(|m| m.as_str()).unwrap_or("");
            if kind == "reel" {
                "Instagram Reel"
            } else {
                "Instagram Post"
            }
        } else {
            "Instagram"
        };
        return (
            [(header::CACHE_CONTROL, "public, max-age=3600, s-maxage=3600")],
            Json(json!({
                "title": title,
                "description": "",
                "image": "",
                "siteName": "Instagram",
            })),
        )
            .into_response();
    }

    let fetch_url = if is_twitter {
        static TWITTER_RE: OnceLock<Regex> = OnceLock::new();
        let re = TWITTER_RE
            .get_or_init(|| Regex::new(r"^https?://(www\.)?(twitter\.com|x\.com)").unwrap());
        re.replace(&url_str, "https://fxtwitter.com").into_owned()
    } else {
        url_str.clone()
    };

    let ua = if is_twitter {
        "Mozilla/5.0 (compatible; Twitterbot/1.0)"
    } else {
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15"
    };

    let empty_preview = || {
        let site = hostname
            .strip_prefix("www.")
            .unwrap_or(hostname);
        Json(json!({
            "title": "",
            "description": "",
            "image": "",
            "siteName": site,
        }))
    };

    // Build a one-off client with no redirect following (SSRF protection checks
    // redirect targets manually, mirroring the TS `redirect: 'manual'` behavior).
    let no_redirect_client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .unwrap_or_else(|_| state.http.clone());

    let result = no_redirect_client
        .get(&fetch_url)
        .header("User-Agent", ua)
        .header("Accept", "text/html,application/xhtml+xml")
        .send()
        .await;

    let res = match result {
        Ok(r) => r,
        Err(_) => {
            return (
                StatusCode::BAD_GATEWAY,
                Json(json!({ "error": "Failed to fetch preview" })),
            )
                .into_response();
        }
    };

    // Block redirects to internal/private IPs (SSRF protection)
    let status = res.status();
    if status.is_redirection() {
        if let Some(location) = res.headers().get(header::LOCATION) {
            if let Ok(loc_str) = location.to_str() {
                if let Ok(redirect_url) = reqwest::Url::parse(loc_str)
                    .or_else(|_| reqwest::Url::parse(&format!("{}{}", url_str, loc_str)))
                {
                    if let Some(rh) = redirect_url.host_str() {
                        if is_blocked_host(rh) {
                            return (
                                StatusCode::BAD_REQUEST,
                                Json(json!({ "error": "Blocked redirect target" })),
                            )
                                .into_response();
                        }
                    }
                }
            }
        }
        return empty_preview().into_response();
    }

    if !status.is_success() {
        return empty_preview().into_response();
    }

    let content_type = res
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    if !content_type.contains("text/html") && !content_type.contains("xhtml") {
        return empty_preview().into_response();
    }

    let raw = match res.text().await {
        Ok(t) => t,
        Err(_) => return empty_preview().into_response(),
    };
    // Only parse first 50KB
    let html = if raw.len() > 50000 {
        &raw[..50000]
    } else {
        &raw
    };

    let title = {
        let og = extract_og(html, "og:title");
        if !og.is_empty() {
            og
        } else {
            let tw = extract_name(html, "twitter:title");
            if !tw.is_empty() {
                tw
            } else {
                static TITLE_RE: OnceLock<Regex> = OnceLock::new();
                let re = TITLE_RE
                    .get_or_init(|| Regex::new(r"(?i)<title[^>]*>([^<]*)</title>").unwrap());
                re.captures(html)
                    .and_then(|c| c.get(1))
                    .map(|m| m.as_str().trim().to_string())
                    .unwrap_or_default()
            }
        }
    };

    let description = {
        let og = extract_og(html, "og:description");
        if !og.is_empty() {
            og
        } else {
            let tw = extract_name(html, "twitter:description");
            if !tw.is_empty() {
                tw
            } else {
                extract_name(html, "description")
            }
        }
    };

    let image_raw = {
        let og = extract_og(html, "og:image");
        if !og.is_empty() {
            og
        } else {
            let tw = extract_name(html, "twitter:image");
            if !tw.is_empty() {
                tw
            } else {
                extract_name(html, "twitter:image:src")
            }
        }
    };

    let mut site_name = {
        let og = extract_og(html, "og:site_name");
        if !og.is_empty() {
            og
        } else {
            hostname
                .strip_prefix("www.")
                .unwrap_or(hostname)
                .to_string()
        }
    };
    if is_twitter {
        site_name = "X (Twitter)".to_string();
    }

    let resolved_image = if !image_raw.is_empty() && !image_raw.starts_with("http") {
        // Resolve relative URL
        match reqwest::Url::parse(&url_str)
            .and_then(|base| base.join(&image_raw))
        {
            Ok(u) => u.to_string(),
            Err(_) => String::new(),
        }
    } else {
        image_raw
    };

    let decoded_title = decode_entities(&title);
    let decoded_desc = decode_entities(&description);
    let decoded_site = decode_entities(&site_name);

    (
        [(header::CACHE_CONTROL, "public, max-age=3600, s-maxage=3600")],
        Json(json!({
            "title": if decoded_title.len() > 200 { &decoded_title[..200] } else { &decoded_title },
            "description": if decoded_desc.len() > 300 { &decoded_desc[..300] } else { &decoded_desc },
            "image": resolved_image,
            "siteName": decoded_site,
        })),
    )
        .into_response()
}

// ---------------------------------------------------------------------------
// GET /messages/attachment — proxy attachment from BlueBubbles
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct AttachmentQuery {
    guid: Option<String>,
    uti: Option<String>,
}

async fn get_attachment(
    State(state): State<AppState>,
    Query(params): Query<AttachmentQuery>,
) -> Response {
    let guid = match &params.guid {
        Some(g) if !g.is_empty() => g.clone(),
        _ => return StatusCode::NOT_FOUND.into_response(),
    };
    let host = bb_host();
    if host.is_empty() {
        return StatusCode::NOT_FOUND.into_response();
    }

    // Validate guid format to prevent path traversal
    if !attachment_guid_re().is_match(&guid) {
        return StatusCode::BAD_REQUEST.into_response();
    }

    let password = bb_password();
    let mut uti = params.uti.clone().unwrap_or_default();
    let mut transfer_name = String::new();

    if uti.is_empty() {
        // Check attachment metadata
        let meta_url = format!(
            "{}/api/v1/attachment/{}?password={}",
            host,
            percent_encode(&guid),
            percent_encode(&password)
        );
        if let Ok(res) = state.http.get(&meta_url).send().await {
            if res.status().is_success() {
                if let Ok(meta) = res.json::<Value>().await {
                    uti = meta
                        .pointer("/data/uti")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                    transfer_name = meta
                        .pointer("/data/transferName")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                }
            }
        }
    }

    // HEIC/HEICS: fetch original from Mac Bridge (BB strips animation)
    if uti == "public.heics" || uti == "public.heic" {
        let bhost = bridge_host();
        if !bhost.is_empty() {
            let original_name = if !transfer_name.is_empty() {
                static JPEG_RE: OnceLock<Regex> = OnceLock::new();
                let re = JPEG_RE.get_or_init(|| Regex::new(r"(?i)\.jpeg$").unwrap());
                re.replace(&transfer_name, "").into_owned()
            } else {
                String::new()
            };

            let mut params_str = format!("guid={}", percent_encode(&guid));
            if !original_name.is_empty() {
                params_str.push_str(&format!("&name={}", percent_encode(&original_name)));
            }
            let bridge_url = format!("{}/messages/attachment-raw?{}", bhost, params_str);
            let mut req = state.http.get(&bridge_url);
            for (k, v) in bridge_headers() {
                req = req.header(&k, &v);
            }
            if let Ok(res) = req.send().await {
                if res.status().is_success() {
                    let ct = res
                        .headers()
                        .get(header::CONTENT_TYPE)
                        .and_then(|v| v.to_str().ok())
                        .unwrap_or("image/png")
                        .to_string();
                    if let Ok(data) = res.bytes().await {
                        let builder = axum::http::Response::builder()
                            .status(StatusCode::OK)
                            .header(header::CONTENT_TYPE, &ct)
                            .header(header::CONTENT_DISPOSITION, "inline")
                            .header("x-content-type-options", "nosniff")
                            .header(header::CACHE_CONTROL, "public, max-age=86400");
                        if let Ok(resp) = builder.body(axum::body::Body::from(data.to_vec())) {
                            return resp.into_response();
                        }
                    }
                }
            }
        }
    }

    // Default: use BB download endpoint
    let download_url = format!(
        "{}/api/v1/attachment/{}/download?password={}",
        host,
        percent_encode(&guid),
        percent_encode(&password)
    );
    match state.http.get(&download_url).send().await {
        Ok(res) if res.status().is_success() => {
            let raw_type = res
                .headers()
                .get(header::CONTENT_TYPE)
                .and_then(|v| v.to_str().ok())
                .unwrap_or("application/octet-stream")
                .to_string();
            let safe_type = if raw_type.starts_with("image/")
                || raw_type.starts_with("video/")
                || raw_type.starts_with("audio/")
            {
                raw_type
            } else {
                "application/octet-stream".to_string()
            };

            match res.bytes().await {
                Ok(data) => {
                    let mut builder =
                        axum::http::Response::builder().status(StatusCode::OK);
                    builder = builder
                        .header(header::CONTENT_TYPE, &safe_type)
                        .header(header::CONTENT_DISPOSITION, "inline")
                        .header("x-content-type-options", "nosniff")
                        .header(header::CACHE_CONTROL, "public, max-age=86400");
                    builder
                        .body(axum::body::Body::from(data.to_vec()))
                        .unwrap_or_else(|_| {
                            axum::http::Response::builder()
                                .status(StatusCode::INTERNAL_SERVER_ERROR)
                                .body(axum::body::Body::empty())
                                .unwrap()
                        })
                        .into_response()
                }
                Err(_) => StatusCode::BAD_GATEWAY.into_response(),
            }
        }
        _ => StatusCode::NOT_FOUND.into_response(),
    }
}

// ---------------------------------------------------------------------------
// POST /messages/react — send a tapback reaction
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct ReactBody {
    #[serde(rename = "chatGuid")]
    chat_guid: Option<String>,
    #[serde(rename = "selectedMessageGuid")]
    selected_message_guid: Option<String>,
    reaction: Option<String>,
}

async fn post_react(
    State(state): State<AppState>,
    Json(body): Json<ReactBody>,
) -> Response {
    if bb_host().is_empty() {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": "bluebubbles_not_configured" })),
        )
            .into_response();
    }

    let chat_guid = match &body.chat_guid {
        Some(g) if !g.is_empty() => g.clone(),
        _ => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": "chatGuid, selectedMessageGuid, and reaction are required" })),
            )
                .into_response()
        }
    };
    let selected_message_guid = match &body.selected_message_guid {
        Some(g) if !g.is_empty() => g.clone(),
        _ => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": "chatGuid, selectedMessageGuid, and reaction are required" })),
            )
                .into_response()
        }
    };
    let reaction = match &body.reaction {
        Some(r) if !r.is_empty() => r.clone(),
        _ => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": "chatGuid, selectedMessageGuid, and reaction are required" })),
            )
                .into_response()
        }
    };

    if !chat_guid_re().is_match(&chat_guid) || !message_guid_re().is_match(&selected_message_guid)
    {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Invalid GUID format" })),
        )
            .into_response();
    }

    if !VALID_REACTIONS.contains(&reaction.as_str()) {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Invalid reaction type" })),
        )
            .into_response();
    }

    match bb_fetch(
        &state.http,
        "/message/react",
        reqwest::Method::POST,
        Some(json!({
            "chatGuid": chat_guid,
            "selectedMessageGuid": selected_message_guid,
            "reaction": reaction,
        })),
    )
    .await
    {
        Ok(_) => Json(json!({ "ok": true })).into_response(),
        Err(e) => {
            tracing::error!("React endpoint error: {}", e);
            (
                StatusCode::BAD_GATEWAY,
                Json(json!({ "error": "Reaction failed" })),
            )
                .into_response()
        }
    }
}

// ---------------------------------------------------------------------------
// POST /messages/read — mark a chat as read or unread
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct ReadBody {
    #[serde(rename = "chatGuid")]
    chat_guid: Option<String>,
    action: Option<String>,
}

async fn post_read(
    State(state): State<AppState>,
    Json(body): Json<ReadBody>,
) -> Response {
    let chat_guid = match &body.chat_guid {
        Some(g) if !g.is_empty() => g.clone(),
        _ => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": "chatGuid is required" })),
            )
                .into_response()
        }
    };
    if !chat_guid_re().is_match(&chat_guid) {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Invalid conversation ID" })),
        )
            .into_response();
    }

    let action = body.action.as_deref().unwrap_or("read");
    if action != "read" && action != "unread" {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "action must be \"read\" or \"unread\"" })),
        )
            .into_response();
    }

    let host = bb_host();
    if host.is_empty() {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": "BlueBubbles not configured" })),
        )
            .into_response();
    }

    let password = bb_password();
    let endpoint = if action == "unread" { "unread" } else { "read" };
    let url = format!(
        "{}/api/v1/chat/{}/{}?password={}",
        host,
        percent_encode(&chat_guid),
        endpoint,
        percent_encode(&password)
    );

    match state
        .http
        .post(&url)
        .header("Content-Type", "application/json")
        .send()
        .await
    {
        Ok(res) if res.status().is_success() => {
            Json(json!({ "ok": true })).into_response()
        }
        Ok(res) => {
            let status = res.status();
            let text = res.text().await.unwrap_or_default();
            tracing::error!("BlueBubbles mark-{} {}: {}", endpoint, status, text);
            (
                StatusCode::BAD_GATEWAY,
                Json(json!({ "error": format!("Failed to mark as {}", endpoint) })),
            )
                .into_response()
        }
        Err(e) => {
            tracing::error!("Mark read/unread error: {}", e);
            (
                StatusCode::BAD_GATEWAY,
                Json(json!({ "error": "Failed to update read status" })),
            )
                .into_response()
        }
    }
}

// ---------------------------------------------------------------------------
// POST /messages/send-attachment — send an attachment via BlueBubbles
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct SendAttachmentBody {
    #[serde(rename = "chatGuid")]
    chat_guid: Option<String>,
    message: Option<String>,
    #[serde(rename = "selectedMessageGuid")]
    selected_message_guid: Option<String>,
    /// Base64-encoded file data
    #[serde(rename = "fileData")]
    file_data: Option<String>,
    #[serde(rename = "fileName")]
    file_name: Option<String>,
    #[serde(rename = "fileContentType")]
    file_content_type: Option<String>,
}

async fn post_send_attachment(
    State(state): State<AppState>,
    Json(body): Json<SendAttachmentBody>,
) -> Response {
    let host = bb_host();
    if host.is_empty() {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": "BlueBubbles not configured" })),
        )
            .into_response();
    }

    let message = body.message.unwrap_or_default();
    let selected_message_guid = body.selected_message_guid;
    let file_name = body.file_name;
    let file_content_type = body.file_content_type;
    let file_data: Option<Vec<u8>> = body.file_data.as_deref().and_then(base64_decode::decode_base64);

    let chat_guid = match body.chat_guid {
        Some(g) if !g.is_empty() && chat_guid_re().is_match(&g) => g,
        _ => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": "Invalid chatGuid" })),
            )
                .into_response()
        }
    };

    let (data, fname) = match (file_data, file_name) {
        (Some(d), Some(n)) => (d, n),
        _ => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": "attachment required" })),
            )
                .into_response()
        }
    };

    if let Some(ref reply_guid) = selected_message_guid {
        if !message_guid_re().is_match(reply_guid) {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": "Invalid reply GUID" })),
            )
                .into_response();
        }
    }

    // 50MB limit
    if data.len() > 50 * 1024 * 1024 {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "File too large (max 50MB)" })),
        )
            .into_response();
    }

    let password = bb_password();
    let url = format!(
        "{}/api/v1/message/attachment?password={}",
        host,
        percent_encode(&password)
    );

    // Build multipart body manually (reqwest "multipart" feature not enabled)
    let boundary = format!("----MissionControl{}", random_uuid().replace('-', ""));
    let ct = file_content_type.unwrap_or_else(|| "application/octet-stream".to_string());
    let temp_guid = format!("temp-{}", random_uuid());

    let mut body_bytes: Vec<u8> = Vec::new();

    // Helper: write a text field
    fn write_text_field(out: &mut Vec<u8>, boundary: &str, name: &str, value: &str) {
        out.extend_from_slice(format!("--{}\r\n", boundary).as_bytes());
        out.extend_from_slice(
            format!("Content-Disposition: form-data; name=\"{}\"\r\n\r\n", name).as_bytes(),
        );
        out.extend_from_slice(value.as_bytes());
        out.extend_from_slice(b"\r\n");
    }

    write_text_field(&mut body_bytes, &boundary, "chatGuid", &chat_guid);
    write_text_field(&mut body_bytes, &boundary, "tempGuid", &temp_guid);
    write_text_field(&mut body_bytes, &boundary, "name", &fname);
    if !message.is_empty() {
        write_text_field(&mut body_bytes, &boundary, "message", &message);
    }
    if let Some(ref reply_guid) = selected_message_guid {
        write_text_field(&mut body_bytes, &boundary, "selectedMessageGuid", reply_guid);
    }

    // File field
    body_bytes.extend_from_slice(format!("--{}\r\n", boundary).as_bytes());
    body_bytes.extend_from_slice(
        format!(
            "Content-Disposition: form-data; name=\"attachment\"; filename=\"{}\"\r\n",
            fname
        )
        .as_bytes(),
    );
    body_bytes.extend_from_slice(format!("Content-Type: {}\r\n\r\n", ct).as_bytes());
    body_bytes.extend_from_slice(&data);
    body_bytes.extend_from_slice(b"\r\n");

    // Closing boundary
    body_bytes.extend_from_slice(format!("--{}--\r\n", boundary).as_bytes());

    let content_type = format!("multipart/form-data; boundary={}", boundary);

    match state
        .http
        .post(&url)
        .header("Content-Type", &content_type)
        .body(body_bytes)
        .send()
        .await
    {
        Ok(res) if res.status().is_success() => {
            let json: Value = res.json().await.unwrap_or(json!({}));
            Json(json!({ "ok": true, "message": json.get("data") })).into_response()
        }
        Ok(res) => {
            let status = res.status();
            let text = res.text().await.unwrap_or_default();
            tracing::error!("BB send-attachment {}: {}", status, text);
            (
                StatusCode::BAD_GATEWAY,
                Json(json!({ "error": "Failed to send attachment" })),
            )
                .into_response()
        }
        Err(e) => {
            tracing::error!("Send attachment error: {}", e);
            (
                StatusCode::BAD_GATEWAY,
                Json(json!({ "error": "Failed to send attachment" })),
            )
                .into_response()
        }
    }
}

// ---------------------------------------------------------------------------
// GET /messages/stream — SSE bridge for BlueBubbles socket.io events
//
// NOTE: The TS version uses socket.io-client to connect to BlueBubbles and
// bridges events to SSE. Rust does not have a mature socket.io client that
// matches the JS library's auto-negotiation. Instead we use BlueBubbles'
// polling approach: periodically query for new messages and emit SSE events.
//
// If a full socket.io client becomes available, this can be upgraded.
// ---------------------------------------------------------------------------

async fn get_stream(State(state): State<AppState>) -> Response {
    use axum::response::sse::{Event, KeepAlive, Sse};

    let host = bb_host();
    if host.is_empty() {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": "bluebubbles_not_configured" })),
        )
            .into_response();
    }

    let client = state.http.clone();

    let stream = async_stream::stream! {
        // Track last seen message date to detect new messages
        let mut last_date: i64 = chrono::Utc::now().timestamp_millis();

        yield Ok::<_, std::convert::Infallible>(
            Event::default().data(serde_json::to_string(&json!({ "type": "connected" })).unwrap_or_default())
        );

        let mut ticker = tokio::time::interval(std::time::Duration::from_secs(2));

        loop {
            ticker.tick().await;

            let query = json!({
                "limit": 20,
                "sort": "DESC",
                "after": last_date,
                "with": ["attachment", "handle", "chat"],
            });

            match bb_fetch(&client, "/message/query", reqwest::Method::POST, Some(query)).await {
                Ok(data) => {
                    if let Some(messages) = data.as_array() {
                        // Process in chronological order (API returns DESC)
                        let mut msgs: Vec<&Value> = messages.iter().collect();
                        msgs.reverse();

                        for msg in msgs {
                            let date = msg.get("dateCreated").and_then(|v| v.as_i64()).unwrap_or(0);
                            if date > last_date {
                                last_date = date;
                            }

                            let event_data = json!({ "type": "new-message", "data": msg });
                            yield Ok(Event::default().data(
                                serde_json::to_string(&event_data).unwrap_or_default()
                            ));
                        }
                    }
                }
                Err(_) => {
                    // Silently continue polling
                }
            }
        }
    };

    Sse::new(stream)
        .keep_alive(KeepAlive::new().interval(std::time::Duration::from_secs(15)))
        .into_response()
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/messages", get(get_messages).post(post_message))
        .route("/messages/avatar", get(get_avatar).post(post_avatar_batch))
        .route("/messages/link-preview", get(get_link_preview))
        .route("/messages/attachment", get(get_attachment))
        .route("/messages/react", post(post_react))
        .route("/messages/read", post(post_read))
        .route("/messages/send-attachment", post(post_send_attachment))
        .route("/messages/stream", get(get_stream))
}
