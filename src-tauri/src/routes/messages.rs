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
use std::net::ToSocketAddrs;
use std::sync::OnceLock;
use tokio::sync::RwLock;

use crate::server::{AppState, RequireAuth};
use super::util::{percent_encode, random_uuid, base64_decode};

// ---------------------------------------------------------------------------
// Environment / configuration helpers
// ---------------------------------------------------------------------------

/// Read BlueBubbles host from AppState (env-var fallback built in).
fn bb_host(state: &AppState) -> String {
    state.secret_or_default("BLUEBUBBLES_HOST")
}

/// Read BlueBubbles password from AppState (env-var fallback built in).
fn bb_password(state: &AppState) -> String {
    state.secret_or_default("BLUEBUBBLES_PASSWORD")
}

/// Redact `password=...` query parameters from a string to prevent credential
/// leaks in log output. Works on URLs and on `reqwest` error messages that
/// embed the full URL.
fn redact_bb_url(s: &str) -> String {
    static PW_RE: OnceLock<Regex> = OnceLock::new();
    let re = PW_RE.get_or_init(|| Regex::new(r"password=[^&\s]*").unwrap());
    re.replace_all(s, "password=REDACTED").to_string()
}

/// Read Mac-Bridge host from AppState (env-var fallback built in).
fn bridge_host(state: &AppState) -> String {
    state.secret_or_default("MAC_BRIDGE_HOST")
}

/// Read Mac-Bridge API key from AppState (env-var fallback built in).
fn bridge_api_key(state: &AppState) -> String {
    state.secret_or_default("MAC_BRIDGE_API_KEY")
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
    RE.get_or_init(|| Regex::new(r"^[a-zA-Z0-9_;+\-@.:]+$").unwrap())
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
// BlueBubbles API fetch (mirrors _lib/bb.ts bbFetch)
// ---------------------------------------------------------------------------

// TODO: Replace bb_fetch calls with `state.bb` ServiceClient.
// Migration: each `bb_fetch(client, state, path, method, body)` call becomes
// `state.bb.as_ref().ok_or("bluebubbles_not_configured")?.get(path)` or
// `.post(path, body)`. The ServiceClient handles timeout and 5xx retry
// automatically. BB-specific auth (password query param) will need an
// auth-header adapter or a custom method on ServiceClient.

/// Fetch from BlueBubbles API. Returns `json.data` on success.
/// Errors: "bluebubbles_not_configured" if BB_HOST is empty,
///         "Backend service error" on HTTP or API error.
async fn bb_fetch(
    client: &reqwest::Client,
    state: &AppState,
    path: &str,
    method: reqwest::Method,
    body: Option<Value>,
) -> Result<Value, String> {
    let host = bb_host(state);
    if host.is_empty() {
        return Err("bluebubbles_not_configured".into());
    }
    let password = bb_password(state);
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
        tracing::error!("BlueBubbles fetch error: {}", redact_bb_url(&e.to_string()));
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

fn bridge_headers(state: &AppState) -> Vec<(String, String)> {
    let key = bridge_api_key(state);
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

// Conversation list cache — serves stale data instantly while refreshing in background
struct ConvCache {
    conversations: Vec<Value>,
    contacts: HashMap<String, String>,
    fetched_at: std::time::Instant,
}

static CONV_CACHE: OnceLock<RwLock<Option<ConvCache>>> = OnceLock::new();

fn conv_cache() -> &'static RwLock<Option<ConvCache>> {
    CONV_CACHE.get_or_init(|| RwLock::new(None))
}

const CONV_CACHE_TTL: std::time::Duration = std::time::Duration::from_secs(15);

async fn get_contact_map(client: &reqwest::Client, state: &AppState) -> HashMap<String, String> {
    // Check cache
    {
        let cache = contact_cache().read().await;
        if let Some(ref c) = *cache {
            if c.fetched_at.elapsed() < CONTACT_CACHE_TTL {
                return c.map.clone();
            }
        }
    }

    let map = fetch_contact_map(client, state).await;

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

async fn fetch_contact_map(client: &reqwest::Client, state: &AppState) -> HashMap<String, String> {
    let mut map = HashMap::new();
    let contacts = match bb_fetch(
        client,
        state,
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

async fn get_bb_contact_avatars(client: &reqwest::Client, state: &AppState) -> HashMap<String, Vec<u8>> {
    // Check cache
    {
        let cache = avatar_cache().read().await;
        if let Some(ref c) = *cache {
            if c.fetched_at.elapsed() < AVATAR_CACHE_TTL {
                return c.map.clone();
            }
        }
    }

    let map = fetch_bb_contact_avatars(client, state).await;

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

async fn fetch_bb_contact_avatars(client: &reqwest::Client, state: &AppState) -> HashMap<String, Vec<u8>> {
    let host = bb_host(state);
    if host.is_empty() {
        return HashMap::new();
    }
    let password = bb_password(state);
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

        let buf = match base64_decode(avatar_b64) {
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
// TODO: Extract into `conversations.rs` — conversation list builder, dedup,
// contact map, contact cache, avatar cache, and the conversation cache refresh
// logic (~500 lines). These are self-contained and only used by get_messages
// and refresh_conv_cache.
// ---------------------------------------------------------------------------
// Conversation list builder (shared by cache-miss and background refresh)
// ---------------------------------------------------------------------------

/// Fetch all conversations from BlueBubbles, deduplicate, resolve contacts,
/// detect junk, sort by recency. Returns (sorted_conversations, contact_map).
async fn fetch_and_build_conversations(
    client: &reqwest::Client,
    state: &AppState,
) -> Result<(Vec<Value>, HashMap<String, String>), String> {
    // BB caps at 1000 per request but its "lastmessage" sort is unreliable —
    // chats without messages get mixed in, pushing real conversations past 1000.
    // Fetch two pages in parallel and merge. Cache pre-warming means this
    // doesn't affect perceived load time.
    let chat_query_p1 = json!({
        "limit": 1000,
        "offset": 0,
        "sort": "lastmessage",
        "with": ["lastMessage", "participants"],
    });
    let chat_query_p2 = json!({
        "limit": 1000,
        "offset": 1000,
        "sort": "lastmessage",
        "with": ["lastMessage", "participants"],
    });

    let now_ms = chrono::Utc::now().timestamp_millis();
    let fourteen_days_ago = now_ms - 14 * 24 * 60 * 60 * 1000;

    let recent_query = json!({
        "limit": 500,
        "sort": "DESC",
        "after": fourteen_days_ago,
        "with": ["chat"],
    });

    let (chats_p1, chats_p2, recent_result, contact_map) = tokio::join!(
        bb_fetch(client, state, "/chat/query", reqwest::Method::POST, Some(chat_query_p1)),
        async {
            bb_fetch(client, state, "/chat/query", reqwest::Method::POST, Some(chat_query_p2))
                .await
                .unwrap_or(Value::Array(vec![]))
        },
        async {
            bb_fetch(client, state, "/message/query", reqwest::Method::POST, Some(recent_query))
                .await
                .unwrap_or(Value::Array(vec![]))
        },
        get_contact_map(client, state),
    );

    let page1 = chats_p1?;

    let mut chats_arr = page1.as_array().cloned().unwrap_or_default();
    let page2_arr = chats_p2.as_array().cloned().unwrap_or_default();
    chats_arr.extend(page2_arr);
    let recent_arr = recent_result.as_array().cloned().unwrap_or_default();

    tracing::info!(
        "BB fetch: {} chats, {} recent messages, {} contacts",
        chats_arr.len(),
        recent_arr.len(),
        contact_map.len()
    );

    // Build conversation map keyed by normalized phone/email
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
        let this_guid = c.get("guid").and_then(|v| v.as_str()).unwrap_or("");
        let is_group = this_guid.contains(";+;");

        // Group chats: use chatIdentifier as-is (phone normalization would strip
        // the "chat" prefix and could cause collisions).
        // 1:1 chats: normalize phone to dedup iMessage/SMS/any variants.
        let normalized_id = if is_group {
            chat_id.to_lowercase()
        } else {
            let norm = normalize_phone(chat_id);
            if !norm.is_empty() {
                norm
            } else {
                chat_id.to_lowercase()
            }
        };
        if normalized_id.is_empty() {
            continue;
        }

        let this_priority = service_priority(this_guid);

        let existing_priority = best_chat
            .get(&normalized_id)
            .and_then(|e| e.get("guid").and_then(|v| v.as_str()))
            .map(service_priority)
            .unwrap_or(-1);

        if !best_chat.contains_key(&normalized_id) || this_priority > existing_priority {
            best_chat.insert(normalized_id.clone(), c.clone());
        }

        // Only use the lastMessage date if it's a real message — phantom/system
        // events (no text, no attachments, itemType != 0) can bump old
        // conversations to appear recent. Photos/attachments are still valid.
        let this_date = c
            .pointer("/lastMessage/dateCreated")
            .and_then(|v| v.as_i64())
            .unwrap_or(0);
        let last_msg_has_text = c
            .pointer("/lastMessage/text")
            .and_then(|v| v.as_str())
            .map(|s| !s.is_empty())
            .unwrap_or(false);
        let last_msg_has_attachments = c
            .pointer("/lastMessage/attachments")
            .and_then(|v| v.as_array())
            .map(|a| !a.is_empty())
            .unwrap_or(false);
        let is_real_message = last_msg_has_text || last_msg_has_attachments;
        let prev = newest_date.get(&normalized_id);
        let should_update = is_real_message
            && prev
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
            let this_guid = chat.get("guid").and_then(|v| v.as_str()).unwrap_or("");
            let is_group = this_guid.contains(";+;");

            let normalized_id = if is_group {
                chat_id.to_lowercase()
            } else {
                let norm = normalize_phone(chat_id);
                if !norm.is_empty() {
                    norm
                } else {
                    chat_id.to_lowercase()
                }
            };
            if normalized_id.is_empty() {
                continue;
            }

            let this_priority = service_priority(this_guid);
            let existing_priority = best_chat
                .get(&normalized_id)
                .and_then(|e| e.get("guid").and_then(|v| v.as_str()))
                .map(service_priority)
                .unwrap_or(-1);

            if !best_chat.contains_key(&normalized_id) {
                best_chat.insert(normalized_id.clone(), chat.clone());
            } else if this_priority > existing_priority {
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

            let msg_text = msg.get("text").and_then(|v| v.as_str()).unwrap_or("");
            let msg_date = msg.get("dateCreated").and_then(|v| v.as_i64()).unwrap_or(0);
            let has_content = !msg_text.is_empty();
            let prev = newest_date.get(&normalized_id);
            let should_update = has_content
                && prev
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

    // Inline-fix 1:1 chats missing participants
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
            let guid = entry
                .get("guid")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let is_group = guid.contains(";+;");

            if !is_group && !chat_id.is_empty() {
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

            let is_unread = newest
                .as_ref()
                .map(|n| !n.is_from_me.unwrap_or(true) && n.date_read.is_none())
                .unwrap_or(false);

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

            // Junk detection
            let is_group = guid_str.contains(";+;");
            // Named group chats (user set a display name in iMessage) are never junk
            let has_bb_display_name = c
                .get("displayName")
                .and_then(|v| v.as_str())
                .map(|s| !s.is_empty())
                .unwrap_or(false);
            let all_participants_unknown = !participants.is_empty()
                && participants.iter().all(|p| {
                    let addr = p.get("address").and_then(|v| v.as_str()).unwrap_or("");
                    let norm = normalize_phone(addr);
                    !contact_map.contains_key(&norm)
                        && !contact_map.contains_key(&addr.to_lowercase())
                });
            // For group chats: also check if ANY participant is known (not just all unknown)
            let any_participant_known = is_group
                && participants.iter().any(|p| {
                    let addr = p.get("address").and_then(|v| v.as_str()).unwrap_or("");
                    let norm = normalize_phone(addr);
                    contact_map.contains_key(&norm)
                        || contact_map.contains_key(&addr.to_lowercase())
                });
            let is_short_code = chat_id.chars().all(|c| c.is_ascii_digit())
                && chat_id.len() <= 6
                && !chat_id.is_empty();
            let is_unknown_email = chat_id.contains('@') && display_name.is_none();

            let is_junk = if has_bb_display_name || any_participant_known {
                // Named group chats or groups with at least one known contact are never junk
                false
            } else {
                (is_group && all_participants_unknown)
                    || (is_short_code && all_participants_unknown)
                    || is_unknown_email
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
                "isJunk": is_junk,
            })
        })
        .collect();

    // Sort by most recent message
    conversations.sort_by(|a, b| {
        let a_date = a.get("lastDate").and_then(|v| v.as_i64()).unwrap_or(0);
        let b_date = b.get("lastDate").and_then(|v| v.as_i64()).unwrap_or(0);
        b_date.cmp(&a_date)
    });

    Ok((conversations, contact_map))
}

/// Background cache refresh — fetches fresh data and stores it.
/// Also called at server startup to pre-warm the cache.
pub async fn refresh_conv_cache(client: &reqwest::Client, state: &AppState) {
    match fetch_and_build_conversations(client, state).await {
        Ok((conversations, contacts)) => {
            // Persist to SQLite for instant next launch
            if let Ok(payload) = serde_json::to_string(&json!({
                "conversations": conversations,
                "contacts": contacts,
            })) {
                state.cache_set("conversations", &payload).await;
            }

            let mut cache = conv_cache().write().await;
            *cache = Some(ConvCache {
                conversations,
                contacts,
                fetched_at: std::time::Instant::now(),
            });
        }
        Err(e) => {
            tracing::warn!("Background conv cache refresh failed: {}", e);
        }
    }
}

/// Load conversations from SQLite into the in-memory cache.
/// Returns `true` if the cache was populated from disk.
async fn hydrate_conv_cache_from_db(state: &AppState) -> bool {
    let cached = match state.cache_get("conversations").await {
        Some(s) => s,
        None => return false,
    };
    let parsed: Value = match serde_json::from_str(&cached) {
        Ok(v) => v,
        Err(_) => return false,
    };
    let conversations: Vec<Value> = parsed
        .get("conversations")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    let contacts: HashMap<String, String> = parsed
        .get("contacts")
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default();

    if conversations.is_empty() {
        return false;
    }

    let mut cache = conv_cache().write().await;
    *cache = Some(ConvCache {
        conversations,
        contacts,
        // Mark as stale so a background refresh fires immediately
        fetched_at: std::time::Instant::now() - CONV_CACHE_TTL - std::time::Duration::from_secs(1),
    });
    tracing::info!("Hydrated conversation cache from SQLite");
    true
}

// ---------------------------------------------------------------------------
// GET /messages — list conversations or get messages for a conversation
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct MessagesQuery {
    conversation: Option<String>,
    limit: Option<String>,
    before: Option<String>,
    /// Epoch ms — only return messages created after this timestamp (delta sync).
    since: Option<String>,
    offset: Option<String>,
    /// "all" (default, excludes junk), "junk" (only junk), "unfiltered" (everything)
    filter: Option<String>,
}

async fn get_messages(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
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

        // Delta sync: when `since` is provided, only fetch messages newer
        // than that timestamp.  The BlueBubbles API uses the `after` field.
        let since_ts = params
            .since
            .as_deref()
            .and_then(|s| s.parse::<i64>().ok());

        if let Some(ts) = since_ts {
            query_body
                .as_object_mut()
                .unwrap()
                .insert("after".into(), json!(ts));
        }

        if let Some(ref before_str) = params.before {
            if let Ok(before_ts) = before_str.parse::<i64>() {
                query_body
                    .as_object_mut()
                    .unwrap()
                    .insert("before".into(), json!(before_ts));
            }
        }

        let (raw_result, contact_map) = tokio::join!(
            bb_fetch(client, &state, "/message/query", reqwest::Method::POST, Some(query_body)),
            get_contact_map(client, &state),
        );

        match raw_result {
            Ok(raw_data) => {
                let mut arr = raw_data
                    .as_array()
                    .cloned()
                    .unwrap_or_default();
                arr.reverse(); // chronological order
                let messages = process_messages_with_reactions(&arr);

                // Track the newest message timestamp for this conversation
                // so the frontend knows what `since` value to use next time.
                let newest_ts = messages
                    .iter()
                    .filter_map(|m| m.get("dateCreated").and_then(|v| v.as_i64()))
                    .max();

                if let Some(ts) = newest_ts {
                    let cache_key = format!("msg-ts-{}", chat_guid);
                    state.cache_set(&cache_key, &ts.to_string()).await;
                }

                Json(json!({
                    "messages": messages,
                    "contacts": contact_map,
                    "newestTimestamp": newest_ts,
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
        let filter_mode = params.filter.as_deref().unwrap_or("all").to_string();
        let requested_conv_limit = params
            .limit
            .as_deref()
            .and_then(|s| s.parse::<usize>().ok())
            .unwrap_or(25)
            .max(1)
            .min(500);

        let conv_offset = params
            .offset
            .as_deref()
            .and_then(|s| s.parse::<usize>().ok())
            .unwrap_or(0);

        // Serve from in-memory cache if available (stale-while-revalidate)
        // If empty, try hydrating from SQLite for instant cold-start.
        {
            let has_cache = conv_cache().read().await.is_some();
            if !has_cache {
                hydrate_conv_cache_from_db(&state).await;
            }
        }
        {
            let cache = conv_cache().read().await;
            if let Some(ref c) = *cache {
                let is_stale = c.fetched_at.elapsed() >= CONV_CACHE_TTL;

                // Apply filter + offset + limit from cached data
                let mut convs = c.conversations.clone();
                match filter_mode.as_str() {
                    "junk" => convs.retain(|c| c.get("isJunk").and_then(|v| v.as_bool()).unwrap_or(false)),
                    "unfiltered" => {}
                    _ => convs.retain(|c| !c.get("isJunk").and_then(|v| v.as_bool()).unwrap_or(false)),
                }
                if conv_offset > 0 && conv_offset < convs.len() {
                    convs = convs.split_off(conv_offset);
                } else if conv_offset >= convs.len() {
                    convs.clear();
                }
                convs.truncate(requested_conv_limit);

                let contacts = c.contacts.clone();
                drop(cache);

                // Trigger background refresh if stale
                if is_stale {
                    let client = client.clone();
                    let bg_state = state.clone();
                    tokio::spawn(async move {
                        refresh_conv_cache(&client, &bg_state).await;
                    });
                }

                return (
                    [(header::CACHE_CONTROL, "private, max-age=5, stale-while-revalidate=30")],
                    Json(json!({ "conversations": convs, "contacts": contacts })),
                ).into_response();
            }
        }

        let (conversations_all, contact_lookup) = match fetch_and_build_conversations(client, &state).await {
            Ok(data) => data,
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

        // Store in cache for subsequent requests + persist to SQLite
        {
            if let Ok(payload) = serde_json::to_string(&json!({
                "conversations": conversations_all,
                "contacts": contact_lookup,
            })) {
                state.cache_set("conversations", &payload).await;
            }

            let mut cache = conv_cache().write().await;
            *cache = Some(ConvCache {
                conversations: conversations_all.clone(),
                contacts: contact_lookup.clone(),
                fetched_at: std::time::Instant::now(),
            });
        }

        // Apply junk filter
        let mut conversations = conversations_all;
        match filter_mode.as_str() {
            "junk" => conversations.retain(|c| c.get("isJunk").and_then(|v| v.as_bool()).unwrap_or(false)),
            "unfiltered" => {}
            _ => conversations.retain(|c| !c.get("isJunk").and_then(|v| v.as_bool()).unwrap_or(false)),
        }

        // Apply offset + limit
        if conv_offset > 0 && conv_offset < conversations.len() {
            conversations = conversations.split_off(conv_offset);
        } else if conv_offset >= conversations.len() {
            conversations.clear();
        }
        conversations.truncate(requested_conv_limit);

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
// TODO: Extract into `send.rs` — POST /messages and POST /messages/send-attachment
// handlers with their request structs (~200 lines).
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
    RequireAuth(_session): RequireAuth,
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
        &state,
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
// TODO: Extract into `avatars.rs` — avatar fetching, batch avatar endpoint,
// and avatar cache (~120 lines).
// ---------------------------------------------------------------------------
// GET /messages/avatar — fetch contact avatar
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct AvatarQuery {
    address: Option<String>,
}

async fn get_avatar(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Query(params): Query<AvatarQuery>,
) -> Response {
    let address = match &params.address {
        Some(a) if !a.is_empty() => a.clone(),
        _ => return StatusCode::NOT_FOUND.into_response(),
    };

    let normalized = normalize_phone(&address);
    let lowered = address.to_lowercase();

    // 1) Try BlueBubbles contact avatars first (already browser-friendly JPEG/PNG)
    let avatars = get_bb_contact_avatars(&state.http, &state).await;
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
    let bhost = bridge_host(&state);
    if !bhost.is_empty() {
        let url = format!(
            "{}/contacts/photo?address={}",
            bhost,
            percent_encode(&address)
        );
        let mut req = state.http.get(&url);
        for (k, v) in bridge_headers(&state) {
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
    RequireAuth(_session): RequireAuth,
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

    let avatars = get_bb_contact_avatars(&state.http, &state).await;
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
// TODO: Extract into `link_preview.rs` — OpenGraph metadata extraction with
// SSRF protection, blocked-host regexes, and HTML parsing (~400 lines).
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

#[derive(Deserialize)]
struct LinkPreviewQuery {
    url: Option<String>,
}

async fn get_link_preview(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
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

    // DNS resolution check: block requests that resolve to private/loopback IPs
    // This prevents SSRF via DNS rebinding or hostnames pointing to internal IPs
    if let Ok(addrs) = format!("{}:80", hostname).to_socket_addrs() {
        for addr in addrs {
            let blocked = match addr.ip() {
                std::net::IpAddr::V4(ipv4) => {
                    ipv4.is_loopback()
                        || ipv4.is_private()
                        || ipv4.is_link_local()
                        || ipv4.is_unspecified()
                        || ipv4.is_broadcast()
                }
                std::net::IpAddr::V6(ipv6) => {
                    ipv6.is_loopback() || ipv6.is_unspecified()
                }
            };
            if blocked {
                return (
                    StatusCode::BAD_REQUEST,
                    Json(json!({ "error": "Blocked host (resolved to private IP)" })),
                )
                    .into_response();
            }
        }
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
                        // DNS check on redirect target
                        if let Ok(addrs) = format!("{}:80", rh).to_socket_addrs() {
                            for addr in addrs {
                                let blocked = match addr.ip() {
                                    std::net::IpAddr::V4(ipv4) => {
                                        ipv4.is_loopback()
                                            || ipv4.is_private()
                                            || ipv4.is_link_local()
                                            || ipv4.is_unspecified()
                                            || ipv4.is_broadcast()
                                    }
                                    std::net::IpAddr::V6(ipv6) => {
                                        ipv6.is_loopback() || ipv6.is_unspecified()
                                    }
                                };
                                if blocked {
                                    return (
                                        StatusCode::BAD_REQUEST,
                                        Json(json!({ "error": "Blocked redirect target (resolved to private IP)" })),
                                    )
                                        .into_response();
                                }
                            }
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

    // Don't decode HTML entities server-side — React auto-escapes text content,
    // and decoding here could pass through crafted HTML from malicious OG tags.
    let clamped_title = if title.len() > 200 { &title[..200] } else { &title };
    let clamped_desc = if description.len() > 300 { &description[..300] } else { &description };

    (
        [(header::CACHE_CONTROL, "public, max-age=3600, s-maxage=3600")],
        Json(json!({
            "title": clamped_title,
            "description": clamped_desc,
            "image": resolved_image,
            "siteName": site_name,
        })),
    )
        .into_response()
}

// ---------------------------------------------------------------------------
// TODO: Extract into `attachments.rs` — attachment proxying, video transcoding,
// and send-attachment handler (~400 lines).
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
    RequireAuth(_session): RequireAuth,
    Query(params): Query<AttachmentQuery>,
) -> Response {
    let guid = match &params.guid {
        Some(g) if !g.is_empty() => g.clone(),
        _ => return StatusCode::NOT_FOUND.into_response(),
    };
    let host = bb_host(&state);
    if host.is_empty() {
        return StatusCode::NOT_FOUND.into_response();
    }

    // Validate guid format to prevent path traversal
    if !attachment_guid_re().is_match(&guid) {
        return StatusCode::BAD_REQUEST.into_response();
    }

    let password = bb_password(&state);
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
        let bhost = bridge_host(&state);
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
            for (k, v) in bridge_headers(&state) {
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
                    // Transcode HEVC/MOV videos to H.264 MP4 for WebKitGTK compatibility
                    let needs_transcode = safe_type == "video/quicktime"
                        || uti == "com.apple.quicktime-movie"
                        || uti == "public.mpeg-4"
                        || transfer_name.ends_with(".mov")
                        || transfer_name.ends_with(".MOV");
                    if needs_transcode || safe_type.starts_with("video/") {
                        if let Ok(transcoded) = transcode_to_h264(&data).await {
                            let builder = axum::http::Response::builder()
                                .status(StatusCode::OK)
                                .header(header::CONTENT_TYPE, "video/mp4")
                                .header(header::CONTENT_DISPOSITION, "inline")
                                .header("x-content-type-options", "nosniff")
                                .header(header::CACHE_CONTROL, "public, max-age=86400");
                            if let Ok(resp) = builder.body(axum::body::Body::from(transcoded)) {
                                return resp.into_response();
                            }
                        }
                    }

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

/// Transcode video to H.264 MP4 using ffmpeg for browser compatibility.
async fn transcode_to_h264(input: &[u8]) -> Result<Vec<u8>, String> {
    use tokio::process::Command;
    use tokio::io::AsyncWriteExt;

    let mut child = Command::new("ffmpeg")
        .args([
            "-i", "pipe:0",          // read from stdin
            "-c:v", "libx264",       // H.264 video
            "-preset", "ultrafast",  // speed over compression
            "-crf", "23",            // reasonable quality
            "-c:a", "aac",           // AAC audio
            "-movflags", "+faststart+frag_keyframe+empty_moov", // streaming-friendly
            "-f", "mp4",             // MP4 container
            "pipe:1",                // write to stdout
        ])
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("ffmpeg spawn: {}", e))?;

    let mut stdin = child.stdin.take().ok_or("no stdin")?;
    let input_owned = input.to_vec();
    tokio::spawn(async move {
        let _ = stdin.write_all(&input_owned).await;
        let _ = stdin.shutdown().await;
    });

    let output = child
        .wait_with_output()
        .await
        .map_err(|e| format!("ffmpeg wait: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        tracing::warn!("ffmpeg transcode failed: {}", stderr);
        return Err(format!("ffmpeg exit: {}", output.status));
    }

    if output.stdout.is_empty() {
        return Err("ffmpeg produced empty output".into());
    }

    tracing::info!("Transcoded video: {}KB -> {}KB", input.len() / 1024, output.stdout.len() / 1024);
    Ok(output.stdout)
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
    RequireAuth(_session): RequireAuth,
    Json(body): Json<ReactBody>,
) -> Response {
    if bb_host(&state).is_empty() {
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
        &state,
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
    RequireAuth(_session): RequireAuth,
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

    let host = bb_host(&state);
    if host.is_empty() {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": "BlueBubbles not configured" })),
        )
            .into_response();
    }

    let password = bb_password(&state);
    let url = format!(
        "{}/api/v1/chat/{}/mark-read?password={}",
        host,
        percent_encode(&chat_guid),
        percent_encode(&password)
    );

    match state
        .http
        .post(&url)
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({ "status": action == "read" }))
        .send()
        .await
    {
        Ok(res) if res.status().is_success() => {
            Json(json!({ "ok": true })).into_response()
        }
        Ok(res) => {
            let status = res.status();
            let text = res.text().await.unwrap_or_default();
            tracing::error!("BlueBubbles mark-read {}: {}", status, text);
            (
                StatusCode::BAD_GATEWAY,
                Json(json!({ "error": "Failed to update read status" })),
            )
                .into_response()
        }
        Err(e) => {
            tracing::error!("Mark read/unread error: {}", redact_bb_url(&e.to_string()));
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
    RequireAuth(_session): RequireAuth,
    Json(body): Json<SendAttachmentBody>,
) -> Response {
    let host = bb_host(&state);
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
    let file_data: Option<Vec<u8>> = body.file_data.as_deref().and_then(base64_decode);

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

    // Sanitize filename and content type to prevent header injection
    let fname = fname.replace(['"', '\r', '\n', '\0'], "_");

    // Validate file name length
    if fname.len() > 255 {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "File name too long (max 255 characters)" })),
        )
            .into_response();
    }

    // Validate content type against whitelist
    const ALLOWED_CONTENT_TYPES: &[&str] = &[
        "image/jpeg",
        "image/png",
        "image/gif",
        "image/webp",
        "image/heic",
        "image/heif",
        "image/tiff",
        "image/bmp",
        "video/mp4",
        "video/quicktime",
        "video/x-m4v",
        "audio/mpeg",
        "audio/mp4",
        "audio/aac",
        "audio/x-m4a",
        "audio/wav",
        "application/pdf",
        "application/octet-stream",
        "text/plain",
        "text/vcard",
        "text/x-vcard",
    ];
    if let Some(ref ct) = file_content_type {
        let ct_lower = ct.to_lowercase();
        if !ALLOWED_CONTENT_TYPES.contains(&ct_lower.as_str()) {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": "Unsupported file content type" })),
            )
                .into_response();
        }
    }

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

    let password = bb_password(&state);
    let url = format!(
        "{}/api/v1/message/attachment?password={}",
        host,
        percent_encode(&password)
    );

    // Build multipart body manually (reqwest "multipart" feature not enabled)
    let boundary = format!("----MissionControl{}", random_uuid().replace('-', ""));
    let ct = file_content_type.unwrap_or_else(|| "application/octet-stream".to_string());
    // Sanitize content type to prevent header injection
    let ct = ct.replace(['\r', '\n', '\0'], "_");
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
            tracing::error!("Send attachment error: {}", redact_bb_url(&e.to_string()));
            (
                StatusCode::BAD_GATEWAY,
                Json(json!({ "error": "Failed to send attachment" })),
            )
                .into_response()
        }
    }
}

// ---------------------------------------------------------------------------
// TODO: Extract into `stream.rs` — SSE bridge for BlueBubbles events (~100 lines).
// ---------------------------------------------------------------------------

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

async fn get_stream(State(state): State<AppState>, RequireAuth(_session): RequireAuth) -> Response {
    use axum::response::sse::{Event, KeepAlive, Sse};

    let host = bb_host(&state);
    if host.is_empty() {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": "bluebubbles_not_configured" })),
        )
            .into_response();
    }

    let client = state.http.clone();
    let stream_state = state.clone();

    let stream = async_stream::stream! {
        // Track last seen message date + GUIDs to detect new messages without duplicates
        let mut last_date: i64 = chrono::Utc::now().timestamp_millis();
        let mut seen_guids: std::collections::HashSet<String> = std::collections::HashSet::new();

        yield Ok::<_, std::convert::Infallible>(
            Event::default().data(serde_json::to_string(&json!({ "type": "connected" })).unwrap_or_default())
        );

        let mut ticker = tokio::time::interval(std::time::Duration::from_secs(2));

        loop {
            ticker.tick().await;

            let query = json!({
                "limit": 20,
                "sort": "DESC",
                "after": last_date - 1, // -1ms to catch edge cases with equal timestamps
                "with": ["attachment", "handle", "chat"],
            });

            match bb_fetch(&client, &stream_state, "/message/query", reqwest::Method::POST, Some(query)).await {
                Ok(data) => {
                    if let Some(messages) = data.as_array() {
                        // Process in chronological order (API returns DESC)
                        let mut msgs: Vec<&Value> = messages.iter().collect();
                        msgs.reverse();

                        for msg in msgs {
                            let guid = msg.get("guid").and_then(|v| v.as_str()).unwrap_or("").to_string();
                            if guid.is_empty() || seen_guids.contains(&guid) {
                                continue;
                            }
                            seen_guids.insert(guid);
                            // Cap the seen set to prevent unbounded growth
                            if seen_guids.len() > 500 {
                                seen_guids.clear();
                            }

                            let date = msg.get("dateCreated").and_then(|v| v.as_i64()).unwrap_or(0);
                            if date > last_date {
                                last_date = date;
                            }

                            // Show tray notification for incoming messages when window is hidden
                            let is_from_me = msg.get("isFromMe").and_then(|v| v.as_bool()).unwrap_or(true);
                            if !is_from_me {
                                use tauri::Manager;
                                let window_hidden = stream_state.app
                                    .get_webview_window("main")
                                    .map(|w| !w.is_visible().unwrap_or(true))
                                    .unwrap_or(false);
                                if window_hidden {
                                    use tauri_plugin_notification::NotificationExt;
                                    let sender = msg
                                        .pointer("/handle/address")
                                        .and_then(|v| v.as_str())
                                        .or_else(|| msg.get("address").and_then(|v| v.as_str()))
                                        .unwrap_or("Unknown");
                                    let body = msg.get("text")
                                        .and_then(|v| v.as_str())
                                        .unwrap_or("New message");
                                    let _ = stream_state.app.notification()
                                        .builder()
                                        .title(sender)
                                        .body(body)
                                        .show();
                                }
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

// Debug endpoint — shows all conversations with junk status for troubleshooting
async fn get_messages_debug(State(state): State<AppState>, RequireAuth(_session): RequireAuth) -> Response {
    let client = &state.http;
    match fetch_and_build_conversations(client, &state).await {
        Ok((conversations, contacts)) => {
            let summary: Vec<Value> = conversations
                .iter()
                .map(|c| {
                    json!({
                        "displayName": c.get("displayName"),
                        "chatId": c.get("chatId"),
                        "guid": c.get("guid"),
                        "lastDate": c.get("lastDate"),
                        "isJunk": c.get("isJunk"),
                        "participants": c.get("participants"),
                    })
                })
                .collect();
            Json(json!({
                "total": summary.len(),
                "totalContacts": contacts.len(),
                "conversations": summary,
            }))
            .into_response()
        }
        Err(e) => {
            Json(json!({ "error": e })).into_response()
        }
    }
}

/// Build the messages router (iMessage via BlueBubbles: conversations, send, attachments, SSE).
pub fn router() -> Router<AppState> {
    let r = Router::new()
        .route("/messages", get(get_messages).post(post_message))
        .route("/messages/avatar", get(get_avatar).post(post_avatar_batch))
        .route("/messages/link-preview", get(get_link_preview))
        .route("/messages/attachment", get(get_attachment))
        .route("/messages/react", post(post_react))
        .route("/messages/read", post(post_read))
        .route("/messages/send-attachment", post(post_send_attachment))
        .route("/messages/stream", get(get_stream));

    #[cfg(debug_assertions)]
    let r = r.route("/messages/debug", get(get_messages_debug));

    r
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_phone_formatted_us() {
        assert_eq!(normalize_phone("+1 (555) 123-4567"), "5551234567");
    }

    #[test]
    fn normalize_phone_plain_digits() {
        assert_eq!(normalize_phone("5551234567"), "5551234567");
    }

    #[test]
    fn normalize_phone_strips_leading_1_from_11_digits() {
        assert_eq!(normalize_phone("15551234567"), "5551234567");
    }

    #[test]
    fn normalize_phone_non_us_no_strip() {
        // 12 digits, does not strip even though starts with 1
        assert_eq!(normalize_phone("447700900123"), "447700900123");
    }

    #[test]
    fn normalize_phone_email_passthrough() {
        // Email has no digits, so result is empty string
        assert_eq!(normalize_phone("user@icloud.com"), "");
    }

    #[test]
    fn normalize_phone_empty() {
        assert_eq!(normalize_phone(""), "");
    }

    // ---- redact_bb_url ----

    #[test]
    fn redact_bb_url_hides_password() {
        let url = "http://host:1234/api/v1/chat?password=supersecret123&limit=10";
        let redacted = redact_bb_url(url);
        assert!(redacted.contains("password=REDACTED"));
        assert!(!redacted.contains("supersecret123"));
        assert!(redacted.contains("limit=10"));
    }

    #[test]
    fn redact_bb_url_no_password() {
        let url = "http://host:1234/api/v1/chat?limit=10";
        assert_eq!(redact_bb_url(url), url);
    }

    #[test]
    fn redact_bb_url_password_at_end() {
        let url = "http://host/api?password=abc123";
        let redacted = redact_bb_url(url);
        assert_eq!(redacted, "http://host/api?password=REDACTED");
    }

    // ---- normalize_reaction_type ----

    #[test]
    fn normalize_reaction_type_from_string() {
        assert_eq!(normalize_reaction_type(&json!("love")), Some(2000));
        assert_eq!(normalize_reaction_type(&json!("like")), Some(2001));
        assert_eq!(normalize_reaction_type(&json!("dislike")), Some(2002));
        assert_eq!(normalize_reaction_type(&json!("laugh")), Some(2003));
        assert_eq!(normalize_reaction_type(&json!("emphasize")), Some(2004));
        assert_eq!(normalize_reaction_type(&json!("question")), Some(2005));
    }

    #[test]
    fn normalize_reaction_type_removal_strings() {
        assert_eq!(normalize_reaction_type(&json!("-love")), Some(3000));
        assert_eq!(normalize_reaction_type(&json!("-like")), Some(3001));
        assert_eq!(normalize_reaction_type(&json!("-dislike")), Some(3002));
        assert_eq!(normalize_reaction_type(&json!("-laugh")), Some(3003));
        assert_eq!(normalize_reaction_type(&json!("-emphasize")), Some(3004));
        assert_eq!(normalize_reaction_type(&json!("-question")), Some(3005));
    }

    #[test]
    fn normalize_reaction_type_from_number() {
        assert_eq!(normalize_reaction_type(&json!(2000)), Some(2000));
        assert_eq!(normalize_reaction_type(&json!(2005)), Some(2005));
        assert_eq!(normalize_reaction_type(&json!(3000)), Some(3000));
    }

    #[test]
    fn normalize_reaction_type_invalid() {
        assert_eq!(normalize_reaction_type(&json!("unknown")), None);
        assert_eq!(normalize_reaction_type(&json!(999)), None);
        assert_eq!(normalize_reaction_type(&json!(null)), None);
    }

    // ---- strip_reaction_prefix ----

    #[test]
    fn strip_reaction_prefix_with_p_prefix() {
        assert_eq!(
            strip_reaction_prefix("p:0/some-guid-here"),
            "some-guid-here"
        );
    }

    #[test]
    fn strip_reaction_prefix_with_bp_prefix() {
        assert_eq!(
            strip_reaction_prefix("bp:1/another-guid"),
            "another-guid"
        );
    }

    #[test]
    fn strip_reaction_prefix_no_prefix() {
        assert_eq!(
            strip_reaction_prefix("plain-guid-value"),
            "plain-guid-value"
        );
    }

    #[test]
    fn strip_reaction_prefix_multi_digit() {
        assert_eq!(
            strip_reaction_prefix("p:42/msg-guid"),
            "msg-guid"
        );
    }

    // ---- service_priority ----

    #[test]
    fn service_priority_imessage() {
        assert_eq!(service_priority("iMessage;-;+1234567890"), 3);
    }

    #[test]
    fn service_priority_rcs() {
        assert_eq!(service_priority("RCS;-;+1234567890"), 2);
    }

    #[test]
    fn service_priority_sms() {
        assert_eq!(service_priority("SMS;-;+1234567890"), 1);
    }

    #[test]
    fn service_priority_unknown() {
        assert_eq!(service_priority("unknown;-;+1234567890"), 0);
    }

    // ---- is_blocked_host (SSRF protection) ----

    #[test]
    fn is_blocked_host_localhost() {
        assert!(is_blocked_host("localhost"));
        assert!(is_blocked_host("LOCALHOST"));
    }

    #[test]
    fn is_blocked_host_loopback() {
        assert!(is_blocked_host("127.0.0.1"));
        assert!(is_blocked_host("127.0.0.2"));
    }

    #[test]
    fn is_blocked_host_private_ranges() {
        assert!(is_blocked_host("10.0.0.1"));
        assert!(is_blocked_host("172.16.0.1"));
        assert!(is_blocked_host("172.31.255.255"));
        assert!(is_blocked_host("192.168.1.1"));
    }

    #[test]
    fn is_blocked_host_link_local() {
        assert!(is_blocked_host("169.254.1.1"));
    }

    #[test]
    fn is_blocked_host_allows_public() {
        assert!(!is_blocked_host("example.com"));
        assert!(!is_blocked_host("8.8.8.8"));
        assert!(!is_blocked_host("1.1.1.1"));
    }

    // ---- extract_og ----

    #[test]
    fn extract_og_property_before_content() {
        let html = r#"<meta property="og:title" content="My Page">"#;
        assert_eq!(extract_og(html, "og:title"), "My Page");
    }

    #[test]
    fn extract_og_content_before_property() {
        let html = r#"<meta content="Description here" property="og:description">"#;
        assert_eq!(extract_og(html, "og:description"), "Description here");
    }

    #[test]
    fn extract_og_missing() {
        let html = r#"<meta property="og:title" content="Title">"#;
        assert_eq!(extract_og(html, "og:image"), "");
    }

    // ---- extract_name ----

    #[test]
    fn extract_name_description() {
        let html = r#"<meta name="description" content="A test page">"#;
        assert_eq!(extract_name(html, "description"), "A test page");
    }

    #[test]
    fn extract_name_missing() {
        let html = r#"<meta name="author" content="Test">"#;
        assert_eq!(extract_name(html, "keywords"), "");
    }

    // ---- GUID validation regexes ----

    #[test]
    fn chat_guid_re_valid() {
        assert!(chat_guid_re().is_match("iMessage;-;+15551234567"));
        assert!(chat_guid_re().is_match("SMS;-;user@icloud.com"));
    }

    #[test]
    fn chat_guid_re_rejects_spaces() {
        assert!(!chat_guid_re().is_match("invalid guid"));
    }

    #[test]
    fn message_guid_re_valid() {
        // Message GUIDs are like "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE" (no slashes)
        assert!(message_guid_re().is_match("AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE"));
        // The regex also allows colons and dots
        assert!(message_guid_re().is_match("p:0:some-msg-guid"));
    }

    #[test]
    fn attachment_guid_re_valid() {
        assert!(attachment_guid_re().is_match("att_abc123-DEF456"));
    }

    #[test]
    fn attachment_guid_re_rejects_dots() {
        assert!(!attachment_guid_re().is_match("bad.guid"));
    }
}
