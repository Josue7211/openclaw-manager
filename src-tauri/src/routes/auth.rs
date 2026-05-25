use axum::{
    extract::{Path, Query, State},
    http::header,
    http::HeaderMap,
    response::{Html, IntoResponse},
    routing::{delete, get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::Mutex;
use subtle::ConstantTimeEq;

use crate::error::AppError;
use crate::gotrue::GoTrueClient;
use crate::server::{AppState, RequireAuth, UserSession};
use crate::supabase::SupabaseClient;

use super::{mail_accounts, util::random_uuid};
use zeroize::Zeroize;

// ---------------------------------------------------------------------------
// Security event logging
// ---------------------------------------------------------------------------

/// Insert a security event into the local SQLite `security_events` table.
/// Fire-and-forget — errors are logged but never propagated.
async fn log_security_event(
    db: &sqlx::SqlitePool,
    event_type: &str,
    user_id: Option<&str>,
    details: &serde_json::Value,
) {
    let details_str = details.to_string();
    let result =
        sqlx::query("INSERT INTO security_events (event_type, user_id, details) VALUES (?, ?, ?)")
            .bind(event_type)
            .bind(user_id)
            .bind(&details_str)
            .execute(db)
            .await;

    if let Err(e) = result {
        tracing::warn!(event_type = %event_type, "failed to log security event: {e}");
    }
}

/// Check recent failed login count and send ntfy alert if threshold exceeded.
async fn check_failed_login_alert(db: &sqlx::SqlitePool) {
    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM security_events WHERE event_type = 'login_failed' AND created_at > datetime('now', '-15 minutes')",
    )
    .fetch_one(db)
    .await
    .unwrap_or(0);

    if count >= 5 {
        tracing::warn!("Security alert: {count} failed login attempts in 15 minutes");
        crate::routes::pipeline::helpers::send_notify(
            "Security Alert: Multiple Failed Logins",
            &format!("{count} failed login attempts in the last 15 minutes"),
            4, // high priority
            &["warning", "lock"],
        );
    }
}

// ---------------------------------------------------------------------------
// OAuth nonce — prevents code injection via POST /auth/tauri-session or
// replayed/forged callbacks. The nonce is generated when the frontend
// requests GET /auth/nonce and must be returned as the `state` query
// parameter in the OAuth callback.
// ---------------------------------------------------------------------------

static OAUTH_NONCE: Mutex<Option<String>> = Mutex::new(None);

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

/// Build the `/auth` sub-router.
pub fn router() -> Router<AppState> {
    Router::new()
        // Existing routes
        .route(
            "/tauri-session",
            get(get_tauri_session).post(post_tauri_session),
        )
        .route("/nonce", get(get_nonce))
        .route("/callback", get(oauth_callback))
        .route("/favicon.png", get(serve_favicon))
        .route("/logo.png", get(serve_logo))
        // Auth proxy routes
        .route("/login", post(login))
        .route("/signup", post(signup))
        .route("/session", get(get_session))
        .route("/sync/status", get(account_sync_status))
        .route("/sync/hydrate", post(account_sync_hydrate))
        .route("/sync/unlock", post(account_sync_unlock))
        .route("/sync/recover-local", post(account_sync_recover_local))
        .route("/sync/handoff/request", post(account_sync_handoff_request))
        .route("/sync/handoff/requests", get(account_sync_handoff_requests))
        .route("/sync/handoff/approve", post(account_sync_handoff_approve))
        .route("/sync/handoff/claim", post(account_sync_handoff_claim))
        .route("/sync/recovery/status", get(account_sync_recovery_status))
        .route(
            "/sync/recovery/generate",
            post(account_sync_recovery_generate),
        )
        .route("/sync/recovery/unlock", post(account_sync_recovery_unlock))
        .route("/logout", post(logout))
        .route("/refresh", post(refresh))
        .route("/password", post(change_password))
        .route("/oauth/:provider", get(start_oauth))
        // MFA routes (TOTP + WebAuthn)
        .route("/mfa/factors", get(mfa_list_factors))
        .route("/mfa/enroll", post(mfa_enroll))
        .route("/mfa/enroll-webauthn", post(mfa_enroll_webauthn))
        .route("/mfa/challenge", post(mfa_challenge))
        .route("/mfa/verify", post(mfa_verify))
        .route("/mfa/unenroll/:factor_id", delete(mfa_unenroll))
        // Security monitoring
        .route("/security-events", get(get_security_events))
}

// ---------------------------------------------------------------------------
// Helpers: epoch seconds
// ---------------------------------------------------------------------------

fn epoch_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

fn account_sync_key_name(user_id: &str) -> String {
    format!("account-sync-key.{user_id}")
}

fn load_cached_account_sync_key(user_id: &str) -> Option<Vec<u8>> {
    use base64::Engine as _;

    let encoded = crate::secrets::get_internal_entry(&account_sync_key_name(user_id))?;
    let key = base64::engine::general_purpose::STANDARD
        .decode(encoded)
        .ok()?;
    (key.len() == 32).then_some(key)
}

fn cache_account_sync_key(user_id: &str, key: &[u8]) {
    use base64::Engine as _;

    if key.len() != 32 {
        tracing::warn!("not caching account sync key: invalid key length");
        return;
    }

    let encoded = base64::engine::general_purpose::STANDARD.encode(key);
    if let Err(e) = crate::secrets::set_entry(&account_sync_key_name(user_id), &encoded) {
        tracing::warn!("failed to cache account sync key in OS keychain: {e}");
    }
}

#[derive(Debug, Deserialize)]
struct AccountSyncUnlockBody {
    password: String,
}

#[derive(Debug, Deserialize)]
struct HandoffRequestBody {
    device_name: Option<String>,
}

#[derive(Debug, Deserialize)]
struct HandoffIdBody {
    request_id: String,
}

#[derive(Debug, Deserialize)]
struct RecoveryUnlockBody {
    recovery_key: String,
}

fn account_sync_handoff_private_key_name(user_id: &str, request_id: &str) -> String {
    format!("account-sync-handoff-private.{user_id}.{request_id}")
}

fn local_device_name() -> String {
    std::env::var("COMPUTERNAME")
        .ok()
        .or_else(|| std::env::var("HOSTNAME").ok())
        .or_else(|| {
            std::fs::read_to_string("/etc/hostname")
                .ok()
                .map(|value| value.trim().to_string())
        })
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "clawctrl device".to_string())
}

fn random_handoff_code() -> String {
    use rand::Rng;
    const ALPHABET: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let mut rng = rand::thread_rng();
    (0..6)
        .map(|_| {
            let idx = rng.gen_range(0..ALPHABET.len());
            ALPHABET[idx] as char
        })
        .collect()
}

fn normalize_recovery_key(input: &str) -> String {
    input
        .trim()
        .strip_prefix("ccrk_v1_")
        .unwrap_or(input.trim())
        .chars()
        .filter(|ch| !ch.is_whitespace() && *ch != '-')
        .collect::<String>()
}

fn random_recovery_key() -> (String, [u8; 32]) {
    use base64::Engine as _;
    use rand::RngCore;

    let mut bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    let encoded = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes);
    (format!("ccrk_v1_{encoded}"), bytes)
}

fn parse_recovery_key(input: &str) -> Result<[u8; 32], AppError> {
    use base64::Engine as _;
    let normalized = normalize_recovery_key(input);
    let bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(normalized.as_bytes())
        .map_err(|_| AppError::BadRequest("Recovery key is not valid.".into()))?;
    bytes
        .try_into()
        .map_err(|_| AppError::BadRequest("Recovery key is not valid.".into()))
}

fn recovery_key_hash(key: &[u8; 32]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(b"clawcontrol-account-sync-recovery-key-hash-v1");
    hasher.update(key);
    hex::encode(hasher.finalize())
}

fn recovery_wrap_key(key: &[u8; 32]) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(b"clawcontrol-account-sync-recovery-wrap-v1");
    hasher.update(key);
    hasher.finalize().into()
}

fn base64_32(value: &str, field: &str) -> Result<[u8; 32], AppError> {
    use base64::Engine as _;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(value)
        .map_err(|_| AppError::BadRequest(format!("{field} is not valid base64")))?;
    bytes
        .try_into()
        .map_err(|_| AppError::BadRequest(format!("{field} must be 32 bytes")))
}

fn derive_handoff_envelope_key(
    shared_secret: &[u8; 32],
    request_public_key: &[u8; 32],
    approver_public_key: &[u8; 32],
) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(b"clawcontrol-account-sync-handoff-v1");
    hasher.update(shared_secret);
    hasher.update(request_public_key);
    hasher.update(approver_public_key);
    hasher.finalize().into()
}

fn handoff_row_json(row: &Value) -> Value {
    json!({
        "id": row.get("id").and_then(|v| v.as_str()).unwrap_or_default(),
        "requesting_device_name": row.get("requesting_device_name").and_then(|v| v.as_str()).unwrap_or("Unknown device"),
        "verification_code": row.get("verification_code").and_then(|v| v.as_str()).unwrap_or_default(),
        "approver_device_name": row.get("approver_device_name").and_then(|v| v.as_str()),
        "status": row.get("status").and_then(|v| v.as_str()).unwrap_or("pending"),
        "expires_at": row.get("expires_at").and_then(|v| v.as_str()).unwrap_or_default(),
        "created_at": row.get("created_at").and_then(|v| v.as_str()).unwrap_or_default(),
    })
}

#[derive(Clone, Copy)]
struct SyncFieldSpec {
    keys: &'static [&'static str],
    env_var: &'static str,
    label: &'static str,
    required: bool,
}

#[derive(Clone, Copy)]
struct SyncServiceSpec {
    service: &'static str,
    label: &'static str,
    fields: &'static [SyncFieldSpec],
}

const BLUEBUBBLES_FIELDS: &[SyncFieldSpec] = &[
    SyncFieldSpec {
        keys: &["host"],
        env_var: "BLUEBUBBLES_HOST",
        label: "Host URL",
        required: true,
    },
    SyncFieldSpec {
        keys: &["password"],
        env_var: "BLUEBUBBLES_PASSWORD",
        label: "Password",
        required: true,
    },
];
const HARNESS_FIELDS: &[SyncFieldSpec] = &[
    SyncFieldSpec {
        keys: &["url", "api_url", "api-url"],
        env_var: "HARNESS_API_URL",
        label: "API URL",
        required: true,
    },
    SyncFieldSpec {
        keys: &["api_key", "api-key"],
        env_var: "HARNESS_API_KEY",
        label: "API key",
        required: false,
    },
    SyncFieldSpec {
        keys: &["ws"],
        env_var: "HARNESS_WS",
        label: "WebSocket URL",
        required: false,
    },
    SyncFieldSpec {
        keys: &["password"],
        env_var: "HARNESS_PASSWORD",
        label: "Password",
        required: false,
    },
];
const HERMES_FIELDS: &[SyncFieldSpec] = &[
    SyncFieldSpec {
        keys: &["url", "api_url", "api-url"],
        env_var: "HERMES_API_URL",
        label: "API URL",
        required: true,
    },
    SyncFieldSpec {
        keys: &["api_key", "api-key"],
        env_var: "HERMES_API_KEY",
        label: "API key",
        required: false,
    },
    SyncFieldSpec {
        keys: &["ws"],
        env_var: "HERMES_WS",
        label: "WebSocket URL",
        required: false,
    },
    SyncFieldSpec {
        keys: &["password"],
        env_var: "HERMES_PASSWORD",
        label: "Password",
        required: false,
    },
];
const CODEX_LB_FIELDS: &[SyncFieldSpec] = &[
    SyncFieldSpec {
        keys: &["url", "api_url", "api-url"],
        env_var: "CODEX_LB_API_URL",
        label: "Dashboard URL",
        required: false,
    },
    SyncFieldSpec {
        keys: &["dashboard_password", "dashboard-password", "password"],
        env_var: "CODEX_LB_DASHBOARD_PASSWORD",
        label: "Dashboard password",
        required: true,
    },
];
const HERMES_DASHBOARD_FIELDS: &[SyncFieldSpec] = &[
    SyncFieldSpec {
        keys: &[
            "dashboard_url",
            "dashboard-url",
            "control_url",
            "control-url",
        ],
        env_var: "HERMES_DASHBOARD_URL",
        label: "Control dashboard URL",
        required: false,
    },
    SyncFieldSpec {
        keys: &[
            "url",
            "api_url",
            "api-url",
            "dashboard_api_url",
            "dashboard-api-url",
        ],
        env_var: "HERMES_DASHBOARD_API_URL",
        label: "Dashboard API URL",
        required: false,
    },
    SyncFieldSpec {
        keys: &[
            "api_key",
            "api-key",
            "dashboard_api_key",
            "dashboard-api-key",
        ],
        env_var: "HERMES_DASHBOARD_API_KEY",
        label: "Dashboard API key",
        required: false,
    },
    SyncFieldSpec {
        keys: &["dashboard_password", "dashboard-password", "password"],
        env_var: "HERMES_DASHBOARD_PASSWORD",
        label: "Dashboard password",
        required: true,
    },
];
const AGENTSECRETS_FIELDS: &[SyncFieldSpec] = &[
    SyncFieldSpec {
        keys: &["url", "base_url", "base-url"],
        env_var: "AGENTSECRETS_URL",
        label: "URL",
        required: false,
    },
    SyncFieldSpec {
        keys: &["client_api_key", "client-api-key", "api_key", "api-key"],
        env_var: "AGENTSECRETS_CLIENT_API_KEY",
        label: "Client API key",
        required: true,
    },
];
const SUNSHINE_FIELDS: &[SyncFieldSpec] = &[SyncFieldSpec {
    keys: &["url", "host"],
    env_var: "SUNSHINE_HOST",
    label: "Host",
    required: true,
}];
const VNC_FIELDS: &[SyncFieldSpec] = &[SyncFieldSpec {
    keys: &["url", "host"],
    env_var: "VNC_HOST",
    label: "Host",
    required: true,
}];
const PROXMOX_FIELDS: &[SyncFieldSpec] = &[
    SyncFieldSpec {
        keys: &["host"],
        env_var: "PROXMOX_HOST",
        label: "Host URL",
        required: true,
    },
    SyncFieldSpec {
        keys: &["token_id", "token-id"],
        env_var: "PROXMOX_TOKEN_ID",
        label: "Token ID",
        required: true,
    },
    SyncFieldSpec {
        keys: &["token_secret", "token-secret"],
        env_var: "PROXMOX_TOKEN_SECRET",
        label: "Token secret",
        required: true,
    },
];
const OPNSENSE_FIELDS: &[SyncFieldSpec] = &[
    SyncFieldSpec {
        keys: &["host"],
        env_var: "OPNSENSE_HOST",
        label: "Host URL",
        required: true,
    },
    SyncFieldSpec {
        keys: &["key"],
        env_var: "OPNSENSE_KEY",
        label: "API key",
        required: true,
    },
    SyncFieldSpec {
        keys: &["secret"],
        env_var: "OPNSENSE_SECRET",
        label: "API secret",
        required: true,
    },
];
const PLEX_FIELDS: &[SyncFieldSpec] = &[
    SyncFieldSpec {
        keys: &["url"],
        env_var: "PLEX_URL",
        label: "URL",
        required: true,
    },
    SyncFieldSpec {
        keys: &["token"],
        env_var: "PLEX_TOKEN",
        label: "Token",
        required: true,
    },
];
const ARR_FIELDS: &[SyncFieldSpec] = &[
    SyncFieldSpec {
        keys: &["url"],
        env_var: "",
        label: "URL",
        required: true,
    },
    SyncFieldSpec {
        keys: &["api_key", "api-key"],
        env_var: "",
        label: "API key",
        required: true,
    },
];
const EMAIL_FIELDS: &[SyncFieldSpec] = &[
    SyncFieldSpec {
        keys: &["host"],
        env_var: "EMAIL_HOST",
        label: "Host",
        required: true,
    },
    SyncFieldSpec {
        keys: &["port"],
        env_var: "EMAIL_PORT",
        label: "Port",
        required: true,
    },
    SyncFieldSpec {
        keys: &["user"],
        env_var: "EMAIL_USER",
        label: "Username",
        required: true,
    },
    SyncFieldSpec {
        keys: &["password"],
        env_var: "EMAIL_PASSWORD",
        label: "Password",
        required: true,
    },
];
const AGENTMAIL_FIELDS: &[SyncFieldSpec] = &[
    SyncFieldSpec {
        keys: &["url", "base_url", "base-url"],
        env_var: "AGENTMAIL_URL",
        label: "URL",
        required: false,
    },
    SyncFieldSpec {
        keys: &["api_key", "api-key"],
        env_var: "AGENTMAIL_API_KEY",
        label: "API key",
        required: true,
    },
];
const COUCHDB_FIELDS: &[SyncFieldSpec] = &[
    SyncFieldSpec {
        keys: &["url"],
        env_var: "COUCHDB_URL",
        label: "URL",
        required: true,
    },
    SyncFieldSpec {
        keys: &["user", "username"],
        env_var: "COUCHDB_USER",
        label: "Username",
        required: true,
    },
    SyncFieldSpec {
        keys: &["password"],
        env_var: "COUCHDB_PASSWORD",
        label: "Password",
        required: true,
    },
    SyncFieldSpec {
        keys: &["database"],
        env_var: "COUCHDB_DATABASE",
        label: "Database",
        required: true,
    },
];
const MAC_BRIDGE_FIELDS: &[SyncFieldSpec] = &[
    SyncFieldSpec {
        keys: &["host"],
        env_var: "MAC_BRIDGE_HOST",
        label: "Host URL",
        required: true,
    },
    SyncFieldSpec {
        keys: &["api_key", "api-key"],
        env_var: "MAC_BRIDGE_API_KEY",
        label: "API key",
        required: true,
    },
];
const CALDAV_FIELDS: &[SyncFieldSpec] = &[
    SyncFieldSpec {
        keys: &["url"],
        env_var: "CALDAV_URL",
        label: "URL",
        required: true,
    },
    SyncFieldSpec {
        keys: &["username"],
        env_var: "CALDAV_USERNAME",
        label: "Username",
        required: true,
    },
    SyncFieldSpec {
        keys: &["password"],
        env_var: "CALDAV_PASSWORD",
        label: "Password",
        required: true,
    },
];
const LIGHTRAG_FIELDS: &[SyncFieldSpec] = &[
    SyncFieldSpec {
        keys: &["url", "base_url", "base-url"],
        env_var: "LIGHTRAG_BASE_URL",
        label: "Base URL",
        required: true,
    },
    SyncFieldSpec {
        keys: &["api_key", "api-key"],
        env_var: "LIGHTRAG_API_KEY",
        label: "API key",
        required: false,
    },
    SyncFieldSpec {
        keys: &[
            "llm_api_key",
            "llm-api-key",
            "llm_binding_api_key",
            "llm-binding-api-key",
        ],
        env_var: "LIGHTRAG_LLM_BINDING_API_KEY",
        label: "LLM API key",
        required: false,
    },
    SyncFieldSpec {
        keys: &[
            "embedding_api_key",
            "embedding-api-key",
            "embedding_binding_api_key",
            "embedding-binding-api-key",
        ],
        env_var: "LIGHTRAG_EMBEDDING_BINDING_API_KEY",
        label: "Embedding API key",
        required: false,
    },
];
const MEMD_FIELDS: &[SyncFieldSpec] = &[SyncFieldSpec {
    keys: &["rag_url", "rag-url"],
    env_var: "MEMD_RAG_URL",
    label: "RAG URL",
    required: false,
}];
const RAGANYTHING_FIELDS: &[SyncFieldSpec] = &[SyncFieldSpec {
    keys: &["url"],
    env_var: "RAGANYTHING_URL",
    label: "URL",
    required: false,
}];
const RAG_FIELDS: &[SyncFieldSpec] = &[SyncFieldSpec {
    keys: &["url"],
    env_var: "RAG_URL",
    label: "URL",
    required: false,
}];
const ANTHROPIC_FIELDS: &[SyncFieldSpec] = &[SyncFieldSpec {
    keys: &["api_key", "api-key"],
    env_var: "ANTHROPIC_API_KEY",
    label: "API key",
    required: true,
}];

const SYNC_SERVICE_SPECS: &[SyncServiceSpec] = &[
    SyncServiceSpec {
        service: "bluebubbles",
        label: "BlueBubbles",
        fields: BLUEBUBBLES_FIELDS,
    },
    SyncServiceSpec {
        service: "harness",
        label: "Harness Legacy",
        fields: HARNESS_FIELDS,
    },
    SyncServiceSpec {
        service: "hermes",
        label: "Hermes Agent",
        fields: HERMES_FIELDS,
    },
    SyncServiceSpec {
        service: "codex-lb",
        label: "Hermes Agent",
        fields: CODEX_LB_FIELDS,
    },
    SyncServiceSpec {
        service: "hermes-dashboard",
        label: "Hermes Agent Dashboard",
        fields: HERMES_DASHBOARD_FIELDS,
    },
    SyncServiceSpec {
        service: "agentsecrets",
        label: "Agent Secrets",
        fields: AGENTSECRETS_FIELDS,
    },
    SyncServiceSpec {
        service: "sunshine",
        label: "Sunshine",
        fields: SUNSHINE_FIELDS,
    },
    SyncServiceSpec {
        service: "vnc",
        label: "Embedded Viewer",
        fields: VNC_FIELDS,
    },
    SyncServiceSpec {
        service: "proxmox",
        label: "Proxmox",
        fields: PROXMOX_FIELDS,
    },
    SyncServiceSpec {
        service: "opnsense",
        label: "OPNsense",
        fields: OPNSENSE_FIELDS,
    },
    SyncServiceSpec {
        service: "plex",
        label: "Plex",
        fields: PLEX_FIELDS,
    },
    SyncServiceSpec {
        service: "sonarr",
        label: "Sonarr",
        fields: ARR_FIELDS,
    },
    SyncServiceSpec {
        service: "radarr",
        label: "Radarr",
        fields: ARR_FIELDS,
    },
    SyncServiceSpec {
        service: "lidarr",
        label: "Lidarr",
        fields: ARR_FIELDS,
    },
    SyncServiceSpec {
        service: "prowlarr",
        label: "Prowlarr",
        fields: ARR_FIELDS,
    },
    SyncServiceSpec {
        service: "bazarr",
        label: "Bazarr",
        fields: ARR_FIELDS,
    },
    SyncServiceSpec {
        service: "overseerr",
        label: "Overseerr",
        fields: ARR_FIELDS,
    },
    SyncServiceSpec {
        service: "jellyseerr",
        label: "Jellyseerr",
        fields: ARR_FIELDS,
    },
    SyncServiceSpec {
        service: "tautulli",
        label: "Tautulli",
        fields: ARR_FIELDS,
    },
    SyncServiceSpec {
        service: "email",
        label: "Email",
        fields: EMAIL_FIELDS,
    },
    SyncServiceSpec {
        service: "agentmail",
        label: "AgentMail",
        fields: AGENTMAIL_FIELDS,
    },
    SyncServiceSpec {
        service: "couchdb",
        label: "Obsidian Notes",
        fields: COUCHDB_FIELDS,
    },
    SyncServiceSpec {
        service: "mac-bridge",
        label: "Mac Bridge",
        fields: MAC_BRIDGE_FIELDS,
    },
    SyncServiceSpec {
        service: "caldav",
        label: "Calendar",
        fields: CALDAV_FIELDS,
    },
    SyncServiceSpec {
        service: "lightrag",
        label: "LightRAG",
        fields: LIGHTRAG_FIELDS,
    },
    SyncServiceSpec {
        service: "memd",
        label: "memd",
        fields: MEMD_FIELDS,
    },
    SyncServiceSpec {
        service: "raganything",
        label: "RAGAnything/MinerU",
        fields: RAGANYTHING_FIELDS,
    },
    SyncServiceSpec {
        service: "rag",
        label: "RAG",
        fields: RAG_FIELDS,
    },
    SyncServiceSpec {
        service: "anthropic",
        label: "Anthropic",
        fields: ANTHROPIC_FIELDS,
    },
];

fn sync_service_spec(service: &str) -> Option<SyncServiceSpec> {
    match service {
        "harness" => {
            return Some(SyncServiceSpec {
                service: "harness",
                label: "Harness Legacy",
                fields: HARNESS_FIELDS,
            })
        }
        "hermes" => {
            return Some(SyncServiceSpec {
                service: "hermes",
                label: "Hermes Agent",
                fields: HERMES_FIELDS,
            })
        }
        "hermes-dashboard" | "hermes_dashboard" => {
            return Some(SyncServiceSpec {
                service: "hermes-dashboard",
                label: "Hermes Agent Dashboard",
                fields: HERMES_DASHBOARD_FIELDS,
            })
        }
        "agent-secrets" => {
            return Some(SyncServiceSpec {
                service: "agent-secrets",
                label: "Agent Secrets",
                fields: AGENTSECRETS_FIELDS,
            })
        }
        "mac_bridge" => {
            return Some(SyncServiceSpec {
                service: "mac_bridge",
                label: "Mac Bridge",
                fields: MAC_BRIDGE_FIELDS,
            })
        }
        _ => {}
    }
    SYNC_SERVICE_SPECS
        .iter()
        .find(|spec| spec.service == service)
        .copied()
}

fn env_var_for_service_field(
    service: &str,
    key: &str,
    fallback: &'static str,
) -> Option<&'static str> {
    if !fallback.is_empty() {
        return Some(fallback);
    }
    service_credential_to_env_var(service, key)
}

fn is_insecure_dev_session(session: &UserSession) -> bool {
    #[cfg(debug_assertions)]
    {
        session.access_token == "dev-token" && session.user_id == "dev-user"
    }
    #[cfg(not(debug_assertions))]
    {
        let _ = session;
        false
    }
}

async fn account_sync_status_payload(state: &AppState, session: &UserSession) -> Value {
    if is_insecure_dev_session(session) {
        return json!({
            "authenticated": true,
            "mfa_verified": true,
            "has_cached_key": true,
            "has_synced_services": false,
            "synced_service_count": 0,
            "hydrated_service_count": 0,
            "services": [],
            "service_details": [],
            "requires_unlock": false,
            "ready": true,
            "recovery_key_configured": false,
            "needs_recovery_key": false,
            "setup_doctor_required": false,
        });
    }

    let sb = match SupabaseClient::from_state(state) {
        Ok(sb) => Some(sb),
        Err(e) => {
            tracing::warn!("failed to build Supabase client for account sync status: {e}");
            None
        }
    };

    let rows = if let Some(sb) = &sb {
        match sb
            .select_as_user(
                "user_secrets",
                "select=service,encrypted_credentials,nonce,created_at,updated_at&order=service.asc",
                &session.access_token,
            )
            .await
        {
            Ok(rows) => rows.as_array().cloned().unwrap_or_default(),
            Err(e) => {
                tracing::warn!("failed to inspect synced services: {e}");
                Vec::new()
            }
        }
    } else {
        Vec::new()
    };

    let services = rows
        .iter()
        .filter_map(|row| {
            row.get("service")
                .and_then(|value| value.as_str())
                .map(str::to_string)
        })
        .collect::<Vec<_>>();
    let has_cached_key = !session.encryption_key.is_empty()
        || load_cached_account_sync_key(&session.user_id).is_some();
    let has_synced_services = !services.is_empty();
    let requires_unlock = session.mfa_verified && has_synced_services && !has_cached_key;
    let recovery_key_configured = if let Some(sb) = &sb {
        sb.select_as_user(
            "account_sync_recovery_keys",
            "select=id&revoked_at=is.null&limit=1",
            &session.access_token,
        )
        .await
        .ok()
        .and_then(|rows| rows.as_array().map(|arr| !arr.is_empty()))
        .unwrap_or(false)
    } else {
        false
    };

    let can_inspect_credentials = !session.encryption_key.is_empty();
    let mut seen = HashSet::new();
    let mut service_details = Vec::new();
    let mut hydrated_service_count = 0usize;

    for row in &rows {
        let Some(service) = row.get("service").and_then(|value| value.as_str()) else {
            continue;
        };
        seen.insert(service.to_string());
        let spec = sync_service_spec(service);
        let label = spec.map(|spec| spec.label).unwrap_or(service);
        let updated_at = row.get("updated_at").and_then(|value| value.as_str());
        let created_at = row.get("created_at").and_then(|value| value.as_str());
        let mut credential_keys = HashSet::new();
        let mut decryptable = false;

        if can_inspect_credentials {
            if let (Some(ciphertext), Some(nonce)) = (
                row.get("encrypted_credentials")
                    .and_then(|value| value.as_str()),
                row.get("nonce").and_then(|value| value.as_str()),
            ) {
                if let Ok(plaintext) =
                    crate::crypto::decrypt(ciphertext, nonce, &session.encryption_key)
                {
                    if let Ok(creds) = serde_json::from_slice::<Value>(&plaintext) {
                        decryptable = true;
                        if let Some(creds) = creds.as_object() {
                            credential_keys.extend(
                                creds
                                    .iter()
                                    .filter(|(_, value)| {
                                        value.as_str().is_some_and(|v| !v.trim().is_empty())
                                    })
                                    .map(|(key, _)| key.to_string()),
                            );
                        }
                    }
                }
            }
        }

        let mut configured_fields = Vec::new();
        let mut missing_fields = Vec::new();
        let mut hydrated_fields = Vec::new();
        let mut expected_count = 0usize;

        if let Some(spec) = spec {
            for field in spec.fields {
                expected_count += 1;
                let configured = !can_inspect_credentials
                    || field.keys.iter().any(|key| credential_keys.contains(*key));
                let hydrated = field.keys.iter().any(|key| {
                    env_var_for_service_field(service, key, field.env_var)
                        .and_then(|env_var| state.secret(env_var))
                        .is_some_and(|value| !value.trim().is_empty())
                });
                if configured {
                    configured_fields.push(field.label);
                }
                if hydrated {
                    hydrated_fields.push(field.label);
                }
                if can_inspect_credentials && field.required && !configured {
                    missing_fields.push(field.label);
                }
            }
        }

        let hydrated = expected_count == 0
            || (can_inspect_credentials
                && !credential_keys.is_empty()
                && missing_fields.is_empty())
            || (!hydrated_fields.is_empty() && missing_fields.is_empty());
        if hydrated {
            hydrated_service_count += 1;
        }
        let status = if requires_unlock {
            "locked"
        } else if !can_inspect_credentials {
            "unknown"
        } else if !decryptable {
            "needs_repair"
        } else if !missing_fields.is_empty() {
            "partial"
        } else if hydrated {
            "ready"
        } else {
            "synced"
        };

        service_details.push(json!({
            "service": service,
            "label": label,
            "status": status,
            "synced": true,
            "hydrated": hydrated,
            "decryptable": decryptable || !can_inspect_credentials,
            "configured_fields": configured_fields,
            "hydrated_fields": hydrated_fields,
            "missing_fields": missing_fields,
            "updated_at": updated_at,
            "created_at": created_at,
        }));
    }

    for spec in SYNC_SERVICE_SPECS {
        if seen.contains(spec.service) {
            continue;
        }
        let hydrated_fields = spec
            .fields
            .iter()
            .filter_map(|field| {
                field
                    .keys
                    .iter()
                    .find_map(|key| {
                        env_var_for_service_field(spec.service, key, field.env_var)
                            .and_then(|env_var| state.secret(env_var))
                    })
                    .filter(|value| !value.trim().is_empty())
                    .map(|_| field.label)
            })
            .collect::<Vec<_>>();
        if hydrated_fields.is_empty() {
            continue;
        }
        hydrated_service_count += 1;
        service_details.push(json!({
            "service": spec.service,
            "label": spec.label,
            "status": "local_only",
            "synced": false,
            "hydrated": true,
            "decryptable": false,
            "configured_fields": [],
            "hydrated_fields": hydrated_fields,
            "missing_fields": [],
            "updated_at": Value::Null,
            "created_at": Value::Null,
        }));
    }

    json!({
        "authenticated": true,
        "mfa_verified": session.mfa_verified,
        "has_cached_key": has_cached_key,
        "has_synced_services": has_synced_services,
        "synced_service_count": services.len(),
        "hydrated_service_count": hydrated_service_count,
        "services": services,
        "service_details": service_details,
        "requires_unlock": requires_unlock,
        "ready": session.mfa_verified && (!has_synced_services || has_cached_key),
        "recovery_key_configured": recovery_key_configured,
        "needs_recovery_key": session.mfa_verified && has_synced_services && has_cached_key && !recovery_key_configured,
        "setup_doctor_required": session.mfa_verified && !has_synced_services,
    })
}

async fn account_sync_status(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    Ok(Json(account_sync_status_payload(&state, &session).await))
}

async fn account_sync_recovery_status(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    if is_insecure_dev_session(&session) {
        return Ok(Json(json!({
            "ok": true,
            "configured": false,
            "latest": Value::Null,
        })));
    }

    let sb = SupabaseClient::from_state(&state)?;
    let rows = sb
        .select_as_user(
            "account_sync_recovery_keys",
            "select=id,created_at,last_used_at&revoked_at=is.null&order=created_at.desc&limit=1",
            &session.access_token,
        )
        .await?;
    let latest = rows.as_array().and_then(|arr| arr.first()).cloned();
    Ok(Json(json!({
        "ok": true,
        "configured": latest.is_some(),
        "latest": latest,
    })))
}

async fn account_sync_recovery_generate(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    if session.encryption_key.is_empty() {
        return Err(AppError::BadRequest(
            "Unlock this device before generating a recovery key.".into(),
        ));
    }

    let (display_key, recovery_key) = random_recovery_key();
    let key_hash = recovery_key_hash(&recovery_key);
    let wrap_key = recovery_wrap_key(&recovery_key);
    let (encrypted_key, nonce) = crate::crypto::encrypt(&session.encryption_key, &wrap_key)?;

    let sb = SupabaseClient::from_state(&state)?;
    let row = sb
        .upsert_as_user(
            "account_sync_recovery_keys",
            json!({
                "user_id": session.user_id,
                "key_hash": key_hash,
                "encrypted_key": encrypted_key,
                "nonce": nonce,
                "label": "Recovery key",
                "revoked_at": Value::Null,
            }),
            &session.access_token,
        )
        .await?;

    log_security_event(
        &state.db,
        "account_sync_recovery_generated",
        Some(&session.user_id),
        &json!({}),
    )
    .await;

    Ok(Json(json!({
        "ok": true,
        "recovery_key": display_key,
        "record": row.as_array().and_then(|arr| arr.first()).cloned().unwrap_or(Value::Null),
    })))
}

async fn account_sync_recovery_unlock(
    State(state): State<AppState>,
    RequireAuth(mut session): RequireAuth,
    Json(body): Json<RecoveryUnlockBody>,
) -> Result<Json<Value>, AppError> {
    if !session.mfa_verified {
        return Err(AppError::Forbidden(
            "Verify MFA before unlocking synced account data.".into(),
        ));
    }

    let recovery_key = parse_recovery_key(&body.recovery_key)?;
    let key_hash = recovery_key_hash(&recovery_key);
    let wrap_key = recovery_wrap_key(&recovery_key);

    let sb = SupabaseClient::from_state(&state)?;
    let rows = sb
        .select_as_user(
            "account_sync_recovery_keys",
            &format!(
                "select=id,encrypted_key,nonce&revoked_at=is.null&key_hash=eq.{key_hash}&limit=1"
            ),
            &session.access_token,
        )
        .await?;
    let row = rows
        .as_array()
        .and_then(|arr| arr.first())
        .ok_or_else(|| AppError::BadRequest("Recovery key was not accepted.".into()))?;
    let encrypted_key = row["encrypted_key"]
        .as_str()
        .ok_or_else(|| AppError::Internal(anyhow::anyhow!("missing encrypted_key")))?;
    let nonce = row["nonce"]
        .as_str()
        .ok_or_else(|| AppError::Internal(anyhow::anyhow!("missing nonce")))?;
    let account_key = crate::crypto::decrypt(encrypted_key, nonce, &wrap_key)
        .map_err(|_| AppError::BadRequest("Recovery key was not accepted.".into()))?;
    if account_key.len() != 32 {
        return Err(AppError::BadRequest(
            "Recovery key returned an invalid account key.".into(),
        ));
    }

    cache_account_sync_key(&session.user_id, &account_key);
    session.encryption_key = account_key;
    *state.session.write().await = Some(session.clone());
    promote_missing_keychain_secrets(&state, &session, &sb).await;
    load_user_secrets(&state, &session).await;

    #[cfg(debug_assertions)]
    crate::server::save_dev_session(&state.db, &session).await;

    if let Some(id) = row["id"].as_str() {
        let _ = sb
            .update_as_user(
                "account_sync_recovery_keys",
                &format!("id=eq.{id}"),
                json!({ "last_used_at": chrono::Utc::now().to_rfc3339() }),
                &session.access_token,
            )
            .await;
    }

    log_security_event(
        &state.db,
        "account_sync_recovery_unlocked",
        Some(&session.user_id),
        &json!({}),
    )
    .await;

    Ok(Json(json!({
        "ok": true,
        "sync": account_sync_status_payload(&state, &session).await,
    })))
}

async fn account_sync_handoff_request(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Json(body): Json<HandoffRequestBody>,
) -> Result<Json<Value>, AppError> {
    if !session.mfa_verified {
        return Err(AppError::Forbidden(
            "Verify MFA before requesting account sync handoff.".into(),
        ));
    }

    use base64::Engine as _;
    use rand::RngCore;

    let mut private_bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut private_bytes);
    let private_key = x25519_dalek::StaticSecret::from(private_bytes);
    let public_key = x25519_dalek::PublicKey::from(&private_key);
    let public_key_b64 = base64::engine::general_purpose::STANDARD.encode(public_key.as_bytes());

    let request_id = random_uuid();
    let code = random_handoff_code();
    let expires_at = (chrono::Utc::now() + chrono::Duration::minutes(10)).to_rfc3339();
    let requested_device_name = body
        .device_name
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .unwrap_or_else(local_device_name);
    let device_name = requested_device_name.chars().take(80).collect::<String>();

    crate::secrets::set_entry(
        &account_sync_handoff_private_key_name(&session.user_id, &request_id),
        &base64::engine::general_purpose::STANDARD.encode(private_bytes),
    )
    .map_err(|e| AppError::Internal(anyhow::anyhow!("failed to store handoff key: {e}")))?;

    let sb = SupabaseClient::from_state(&state)?;
    sb.insert_as_user(
        "account_sync_handoffs",
        json!({
            "id": request_id,
            "user_id": session.user_id,
            "requesting_device_name": device_name,
            "verification_code": code,
            "request_public_key": public_key_b64,
            "status": "pending",
            "expires_at": expires_at,
        }),
        &session.access_token,
    )
    .await?;

    Ok(Json(json!({
        "ok": true,
        "request_id": request_id,
        "code": code,
        "expires_at": expires_at,
    })))
}

async fn account_sync_handoff_requests(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    if session.encryption_key.is_empty() {
        return Err(AppError::BadRequest(
            "Unlock this device before approving account sync handoffs.".into(),
        ));
    }

    let sb = SupabaseClient::from_state(&state)?;
    let rows = sb
        .select_as_user(
            "account_sync_handoffs",
            "select=id,requesting_device_name,verification_code,approver_device_name,status,expires_at,created_at&status=eq.pending&order=created_at.desc",
            &session.access_token,
        )
        .await?;

    let requests = rows
        .as_array()
        .map(|rows| rows.iter().map(handoff_row_json).collect::<Vec<_>>())
        .unwrap_or_default();

    Ok(Json(json!({ "ok": true, "requests": requests })))
}

async fn account_sync_handoff_approve(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Json(body): Json<HandoffIdBody>,
) -> Result<Json<Value>, AppError> {
    if session.encryption_key.is_empty() {
        return Err(AppError::BadRequest(
            "Unlock this device before approving account sync handoffs.".into(),
        ));
    }
    crate::validation::validate_uuid(&body.request_id)?;

    let sb = SupabaseClient::from_state(&state)?;
    let rows = sb
        .select_as_user(
            "account_sync_handoffs",
            &format!(
                "select=id,request_public_key,status,expires_at&status=eq.pending&id=eq.{}&limit=1",
                body.request_id
            ),
            &session.access_token,
        )
        .await?;
    let row = rows
        .as_array()
        .and_then(|arr| arr.first())
        .ok_or_else(|| AppError::NotFound("No pending handoff request found.".into()))?;

    let request_public_key_b64 = row["request_public_key"]
        .as_str()
        .ok_or_else(|| AppError::Internal(anyhow::anyhow!("missing request_public_key")))?;
    let request_public_key = base64_32(request_public_key_b64, "request_public_key")?;
    let request_public = x25519_dalek::PublicKey::from(request_public_key);

    use base64::Engine as _;
    use rand::RngCore;

    let mut approver_private_bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut approver_private_bytes);
    let approver_private = x25519_dalek::StaticSecret::from(approver_private_bytes);
    let approver_public = x25519_dalek::PublicKey::from(&approver_private);
    let shared = approver_private.diffie_hellman(&request_public);
    let envelope_key = derive_handoff_envelope_key(
        shared.as_bytes(),
        &request_public_key,
        approver_public.as_bytes(),
    );
    let (encrypted_key, nonce) = crate::crypto::encrypt(&session.encryption_key, &envelope_key)?;
    let now = chrono::Utc::now().to_rfc3339();

    sb.update_as_user(
        "account_sync_handoffs",
        &format!("id=eq.{}", body.request_id),
        json!({
            "status": "approved",
            "approver_device_name": local_device_name(),
            "approver_public_key": base64::engine::general_purpose::STANDARD.encode(approver_public.as_bytes()),
            "encrypted_key": encrypted_key,
            "nonce": nonce,
            "updated_at": now,
        }),
        &session.access_token,
    )
    .await?;

    log_security_event(
        &state.db,
        "account_sync_handoff_approved",
        Some(&session.user_id),
        &json!({ "request_id": body.request_id }),
    )
    .await;

    Ok(Json(json!({ "ok": true, "request_id": body.request_id })))
}

async fn account_sync_handoff_claim(
    State(state): State<AppState>,
    RequireAuth(mut session): RequireAuth,
    Json(body): Json<HandoffIdBody>,
) -> Result<Json<Value>, AppError> {
    crate::validation::validate_uuid(&body.request_id)?;

    let sb = SupabaseClient::from_state(&state)?;
    let rows = sb
        .select_as_user(
            "account_sync_handoffs",
            &format!(
                "select=id,status,request_public_key,approver_public_key,encrypted_key,nonce&id=eq.{}&limit=1",
                body.request_id
            ),
            &session.access_token,
        )
        .await?;
    let row = rows
        .as_array()
        .and_then(|arr| arr.first())
        .ok_or_else(|| AppError::NotFound("No handoff request found.".into()))?;

    let status = row["status"].as_str().unwrap_or("pending");
    if status != "approved" {
        return Ok(Json(json!({
            "ok": true,
            "claimed": false,
            "status": status,
        })));
    }

    let private_key_b64 = crate::secrets::get_internal_entry(
        &account_sync_handoff_private_key_name(&session.user_id, &body.request_id),
    )
    .ok_or_else(|| AppError::BadRequest("This device cannot claim that handoff.".into()))?;
    let private_key_bytes = base64_32(&private_key_b64, "private_key")?;
    let private_key = x25519_dalek::StaticSecret::from(private_key_bytes);

    let request_public_key_b64 = row["request_public_key"]
        .as_str()
        .ok_or_else(|| AppError::Internal(anyhow::anyhow!("missing request_public_key")))?;
    let approver_public_key_b64 = row["approver_public_key"]
        .as_str()
        .ok_or_else(|| AppError::Internal(anyhow::anyhow!("missing approver_public_key")))?;
    let request_public_key = base64_32(request_public_key_b64, "request_public_key")?;
    let approver_public_key = base64_32(approver_public_key_b64, "approver_public_key")?;
    let approver_public = x25519_dalek::PublicKey::from(approver_public_key);
    let shared = private_key.diffie_hellman(&approver_public);
    let envelope_key =
        derive_handoff_envelope_key(shared.as_bytes(), &request_public_key, &approver_public_key);

    let encrypted_key = row["encrypted_key"]
        .as_str()
        .ok_or_else(|| AppError::Internal(anyhow::anyhow!("missing encrypted_key")))?;
    let nonce = row["nonce"]
        .as_str()
        .ok_or_else(|| AppError::Internal(anyhow::anyhow!("missing nonce")))?;
    let account_key = crate::crypto::decrypt(encrypted_key, nonce, &envelope_key)
        .map_err(|_| AppError::BadRequest("Approved handoff could not be decrypted.".into()))?;
    if account_key.len() != 32 {
        return Err(AppError::BadRequest(
            "Approved handoff returned an invalid account key.".into(),
        ));
    }

    cache_account_sync_key(&session.user_id, &account_key);
    session.encryption_key = account_key;
    *state.session.write().await = Some(session.clone());
    promote_missing_keychain_secrets(&state, &session, &sb).await;
    load_user_secrets(&state, &session).await;

    #[cfg(debug_assertions)]
    crate::server::save_dev_session(&state.db, &session).await;

    let now = chrono::Utc::now().to_rfc3339();
    sb.update_as_user(
        "account_sync_handoffs",
        &format!("id=eq.{}", body.request_id),
        json!({
            "status": "claimed",
            "claimed_at": now,
            "updated_at": now,
        }),
        &session.access_token,
    )
    .await?;

    log_security_event(
        &state.db,
        "account_sync_handoff_claimed",
        Some(&session.user_id),
        &json!({ "request_id": body.request_id }),
    )
    .await;

    Ok(Json(json!({
        "ok": true,
        "claimed": true,
        "status": "claimed",
        "sync": account_sync_status_payload(&state, &session).await,
    })))
}

async fn account_sync_hydrate(
    State(state): State<AppState>,
    RequireAuth(mut session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    if session.encryption_key.is_empty() {
        if let Some(key) = load_cached_account_sync_key(&session.user_id) {
            session.encryption_key = key;
            *state.session.write().await = Some(session.clone());
        }
    }

    if session.encryption_key.is_empty() {
        return Err(AppError::BadRequest(
            "Account sync is locked on this device.".into(),
        ));
    }

    load_user_secrets(&state, &session).await;
    if let Ok(sb) = SupabaseClient::from_state(&state) {
        promote_missing_keychain_secrets(&state, &session, &sb).await;
        load_user_secrets(&state, &session).await;
    }

    #[cfg(debug_assertions)]
    crate::server::save_dev_session(&state.db, &session).await;

    Ok(Json(account_sync_status_payload(&state, &session).await))
}

async fn account_sync_recover_local(
    State(state): State<AppState>,
    RequireAuth(mut session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    if !session.mfa_verified {
        return Err(AppError::Forbidden(
            "Verify MFA before repairing account sync from this device.".into(),
        ));
    }

    let services = collect_local_sync_credentials(&state);
    if services.is_empty() {
        return Err(AppError::BadRequest(
            "No local service credentials are available on this device.".into(),
        ));
    }

    use rand::RngCore;
    let mut account_key = vec![0u8; 32];
    rand::thread_rng().fill_bytes(&mut account_key);

    cache_account_sync_key(&session.user_id, &account_key);
    session.encryption_key = account_key;
    *state.session.write().await = Some(session.clone());

    let sb = SupabaseClient::from_state(&state)?;
    let mut count = 0usize;
    for (service, creds) in &services {
        if let Err(err) = upsert_encrypted_service_credentials(&session, &sb, service, creds).await
        {
            tracing::warn!(service = %service, "local sync repair failed: {err}");
            continue;
        }
        count += 1;
    }

    if count == 0 {
        return Err(AppError::BadRequest(
            "Local service credentials could not be synced.".into(),
        ));
    }

    load_user_secrets(&state, &session).await;

    #[cfg(debug_assertions)]
    crate::server::save_dev_session(&state.db, &session).await;

    log_security_event(
        &state.db,
        "account_sync_recovered_from_local",
        Some(&session.user_id),
        &json!({ "services_synced": count }),
    )
    .await;

    Ok(Json(account_sync_status_payload(&state, &session).await))
}

async fn account_sync_unlock(
    State(state): State<AppState>,
    RequireAuth(mut session): RequireAuth,
    Json(body): Json<AccountSyncUnlockBody>,
) -> Result<Json<Value>, AppError> {
    if !session.mfa_verified {
        return Err(AppError::Forbidden(
            "Verify MFA before unlocking synced account data.".into(),
        ));
    }

    let salt = get_or_create_salt(&state, &session.access_token, &session.user_id)
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("salt retrieval failed: {e}")))?;
    let encryption_key = crate::crypto::derive_key(&body.password, &salt);

    let sb = SupabaseClient::from_state(&state)?;
    let rows = sb
        .select_as_user(
            "user_secrets",
            "select=service,encrypted_credentials,nonce&limit=1",
            &session.access_token,
        )
        .await?;

    let row = rows.as_array().and_then(|arr| arr.first());
    if let Some(row) = row {
        let ciphertext = row["encrypted_credentials"]
            .as_str()
            .ok_or_else(|| AppError::Internal(anyhow::anyhow!("missing encrypted_credentials")))?;
        let nonce = row["nonce"]
            .as_str()
            .ok_or_else(|| AppError::Internal(anyhow::anyhow!("missing nonce")))?;

        let plaintext =
            crate::crypto::decrypt(ciphertext, nonce, &encryption_key).map_err(|_| {
                AppError::BadRequest("That password did not unlock synced services.".into())
            })?;
        serde_json::from_slice::<Value>(&plaintext)
            .map_err(|_| AppError::BadRequest("Synced services could not be decoded.".into()))?;
    }

    cache_account_sync_key(&session.user_id, encryption_key.as_ref());
    session.encryption_key = encryption_key.to_vec();
    drop(encryption_key);
    *state.session.write().await = Some(session.clone());

    promote_missing_keychain_secrets(&state, &session, &sb).await;
    load_user_secrets(&state, &session).await;

    #[cfg(debug_assertions)]
    crate::server::save_dev_session(&state.db, &session).await;

    log_security_event(
        &state.db,
        "account_sync_unlocked",
        Some(&session.user_id),
        &json!({ "method": "password_fallback" }),
    )
    .await;

    Ok(Json(account_sync_status_payload(&state, &session).await))
}

// ---------------------------------------------------------------------------
// Helpers: load user_secrets from Supabase after login
// ---------------------------------------------------------------------------

/// Maps a `user_secrets.service` name + credential key to the env-var name
/// used by `AppState::secret()`. This follows the same naming convention as
/// `KEY_ENV_MAP` in `secrets.rs`.
///
/// Returns `None` for unknown combinations (they are skipped with a warning).
pub(crate) fn service_credential_to_env_var(service: &str, key: &str) -> Option<&'static str> {
    match (service, key) {
        // BlueBubbles
        ("bluebubbles", "host") => Some("BLUEBUBBLES_HOST"),
        ("bluebubbles", "password") => Some("BLUEBUBBLES_PASSWORD"),
        // Hermes Agent is the app contract; harness remains a legacy alias.
        ("harness", "url" | "api_url" | "api-url") => Some("HARNESS_API_URL"),
        ("harness", "api_key" | "api-key") => Some("HARNESS_API_KEY"),
        ("harness", "ws") => Some("HARNESS_WS"),
        ("harness", "password") => Some("HARNESS_PASSWORD"),
        ("codex-lb" | "codex_lb", "url" | "api_url" | "api-url") => Some("CODEX_LB_API_URL"),
        ("codex-lb" | "codex_lb", "dashboard_password" | "dashboard-password" | "password") => {
            Some("CODEX_LB_DASHBOARD_PASSWORD")
        }
        (
            "hermes-dashboard" | "hermes_dashboard",
            "dashboard_url" | "dashboard-url" | "control_url" | "control-url",
        ) => Some("HERMES_DASHBOARD_URL"),
        (
            "hermes-dashboard" | "hermes_dashboard",
            "url" | "api_url" | "api-url" | "dashboard_api_url" | "dashboard-api-url",
        ) => Some("HERMES_DASHBOARD_API_URL"),
        (
            "hermes-dashboard" | "hermes_dashboard",
            "api_key" | "api-key" | "dashboard_api_key" | "dashboard-api-key",
        ) => Some("HERMES_DASHBOARD_API_KEY"),
        (
            "hermes-dashboard" | "hermes_dashboard",
            "dashboard_password" | "dashboard-password" | "password",
        ) => Some("HERMES_DASHBOARD_PASSWORD"),
        ("hermes", "url" | "api_url" | "api-url") => Some("HERMES_API_URL"),
        ("hermes", "api_key" | "api-key") => Some("HERMES_API_KEY"),
        ("hermes", "ws") => Some("HERMES_WS"),
        ("hermes", "password") => Some("HERMES_PASSWORD"),
        ("openclaw", "url" | "api_url" | "api-url") => Some("OPENCLAW_API_URL"),
        ("openclaw", "api_key" | "api-key") => Some("OPENCLAW_API_KEY"),
        ("openclaw", "ws") => Some("OPENCLAW_WS"),
        ("openclaw", "password") => Some("OPENCLAW_PASSWORD"),
        // Agent Secrets
        ("agentsecrets" | "agent-secrets", "url" | "base_url" | "base-url") => {
            Some("AGENTSECRETS_URL")
        }
        (
            "agentsecrets" | "agent-secrets",
            "client_api_key" | "client-api-key" | "api_key" | "api-key",
        ) => Some("AGENTSECRETS_CLIENT_API_KEY"),
        ("agentsecrets" | "agent-secrets", "approver_api_key" | "approver-api-key") => {
            Some("SECRET_BROKER_APPROVER_API_KEY")
        }
        // Agent Shell
        ("agentshell" | "agent-shell", "url" | "base_url" | "base-url") => Some("AGENTSHELL_URL"),
        // Sunshine
        ("sunshine", "url" | "host") => Some("SUNSHINE_HOST"),
        // Embedded VNC viewer
        ("vnc", "url" | "host") => Some("VNC_HOST"),
        // Proxmox
        ("proxmox", "host") => Some("PROXMOX_HOST"),
        ("proxmox", "token_id" | "token-id") => Some("PROXMOX_TOKEN_ID"),
        ("proxmox", "token_secret" | "token-secret") => Some("PROXMOX_TOKEN_SECRET"),
        // OPNsense
        ("opnsense", "host") => Some("OPNSENSE_HOST"),
        ("opnsense", "key") => Some("OPNSENSE_KEY"),
        ("opnsense", "secret") => Some("OPNSENSE_SECRET"),
        ("portainer", "instances" | "instances_json" | "instances-json") => {
            Some("PORTAINER_INSTANCES")
        }
        // Plex
        ("plex", "url") => Some("PLEX_URL"),
        ("plex", "token") => Some("PLEX_TOKEN"),
        // Sonarr
        ("sonarr", "url") => Some("SONARR_URL"),
        ("sonarr", "api_key" | "api-key") => Some("SONARR_API_KEY"),
        // Radarr
        ("radarr", "url") => Some("RADARR_URL"),
        ("radarr", "api_key" | "api-key") => Some("RADARR_API_KEY"),
        // Lidarr
        ("lidarr", "url") => Some("LIDARR_URL"),
        ("lidarr", "api_key" | "api-key") => Some("LIDARR_API_KEY"),
        // Prowlarr
        ("prowlarr", "url") => Some("PROWLARR_URL"),
        ("prowlarr", "api_key" | "api-key") => Some("PROWLARR_API_KEY"),
        // Media request/stat services
        ("overseerr", "url") => Some("OVERSEERR_URL"),
        ("overseerr", "api_key" | "api-key") => Some("OVERSEERR_API_KEY"),
        ("tautulli", "url") => Some("TAUTULLI_URL"),
        ("tautulli", "api_key" | "api-key") => Some("TAUTULLI_API_KEY"),
        ("bazarr", "url") => Some("BAZARR_URL"),
        ("bazarr", "api_key" | "api-key") => Some("BAZARR_API_KEY"),
        ("jellyseerr", "url") => Some("JELLYSEERR_URL"),
        ("jellyseerr", "api_key" | "api-key") => Some("JELLYSEERR_API_KEY"),
        ("jellystat", "url") => Some("JELLYSTAT_URL"),
        ("jellystat", "api_key" | "api-key") => Some("JELLYSTAT_API_KEY"),
        ("qbittorrent", "url") => Some("QBITTORRENT_URL"),
        ("qbittorrent", "username") => Some("QBITTORRENT_USERNAME"),
        ("qbittorrent", "password") => Some("QBITTORRENT_PASSWORD"),
        ("sabnzbd", "url") => Some("SABNZBD_URL"),
        ("sabnzbd", "api_key" | "api-key") => Some("SABNZBD_API_KEY"),
        ("nzbget", "url") => Some("NZBGET_URL"),
        ("nzbget", "username") => Some("NZBGET_USERNAME"),
        ("nzbget", "password") => Some("NZBGET_PASSWORD"),
        ("transmission", "url") => Some("TRANSMISSION_URL"),
        ("transmission", "username") => Some("TRANSMISSION_USERNAME"),
        ("transmission", "password") => Some("TRANSMISSION_PASSWORD"),
        ("deluge", "url") => Some("DELUGE_URL"),
        ("deluge", "password") => Some("DELUGE_PASSWORD"),
        ("unraid", "url") => Some("UNRAID_URL"),
        ("unraid", "api_key" | "api-key") => Some("UNRAID_API_KEY"),
        ("wizarr", "url") => Some("WIZARR_URL"),
        ("wizarr", "api_key" | "api-key") => Some("WIZARR_API_KEY"),
        ("jellyfin", "url") => Some("JELLYFIN_URL"),
        ("jellyfin", "api_key" | "api-key") => Some("JELLYFIN_API_KEY"),
        ("emby", "url") => Some("EMBY_URL"),
        ("emby", "api_key" | "api-key") => Some("EMBY_API_KEY"),
        ("readarr", "url") => Some("READARR_URL"),
        ("readarr", "api_key" | "api-key") => Some("READARR_API_KEY"),
        ("whisparr", "url") => Some("WHISPARR_URL"),
        ("whisparr", "api_key" | "api-key") => Some("WHISPARR_API_KEY"),
        ("mylar", "url") => Some("MYLAR_URL"),
        ("mylar", "api_key" | "api-key") => Some("MYLAR_API_KEY"),
        ("autobrr", "url") => Some("AUTOBRR_URL"),
        ("autobrr", "api_key" | "api-key") => Some("AUTOBRR_API_KEY"),
        ("recyclarr", "url") => Some("RECYCLARR_URL"),
        ("recyclarr", "api_key" | "api-key") => Some("RECYCLARR_API_KEY"),
        ("kometa", "url") => Some("KOMETA_URL"),
        ("kometa", "api_key" | "api-key") => Some("KOMETA_API_KEY"),
        ("flaresolverr", "url") => Some("FLARESOLVERR_URL"),
        ("ssh", "host") => Some("SSH_HOST"),
        ("ssh", "user" | "username") => Some("SSH_USER"),
        ("ssh", "password") => Some("SSH_PASSWORD"),
        ("ssh", "key_path" | "key-path") => Some("SSH_KEY_PATH"),
        ("sftp", "host") => Some("SFTP_HOST"),
        ("sftp", "user" | "username") => Some("SFTP_USER"),
        ("sftp", "password") => Some("SFTP_PASSWORD"),
        ("sftp", "key_path" | "key-path") => Some("SFTP_KEY_PATH"),
        // Email
        ("email", "host") => Some("EMAIL_HOST"),
        ("email", "port") => Some("EMAIL_PORT"),
        ("email", "user") => Some("EMAIL_USER"),
        ("email", "password") => Some("EMAIL_PASSWORD"),
        ("email", "provider") => Some("EMAIL_PROVIDER"),
        ("email", "label") => Some("EMAIL_LABEL"),
        // AgentMail
        ("agentmail", "url" | "base_url" | "base-url") => Some("AGENTMAIL_URL"),
        ("agentmail", "api_key" | "api-key") => Some("AGENTMAIL_API_KEY"),
        ("agentmail", "default_inbox_id" | "default-inbox-id") => {
            Some("AGENTMAIL_DEFAULT_INBOX_ID")
        }
        ("agentmail", "default_address" | "default-address") => Some("AGENTMAIL_DEFAULT_ADDRESS"),
        ("agentmail", "default_label" | "default-label") => Some("AGENTMAIL_DEFAULT_LABEL"),
        ("agentmail", "default_provider" | "default-provider") => {
            Some("AGENTMAIL_DEFAULT_PROVIDER")
        }
        // CalDAV
        ("caldav", "url") => Some("CALDAV_URL"),
        ("caldav", "username") => Some("CALDAV_USERNAME"),
        ("caldav", "password") => Some("CALDAV_PASSWORD"),
        // ntfy
        ("ntfy", "url") => Some("NTFY_URL"),
        ("ntfy", "topic") => Some("NTFY_TOPIC"),
        // CouchDB
        ("couchdb", "url") => Some("COUCHDB_URL"),
        ("couchdb", "user" | "username") => Some("COUCHDB_USER"),
        ("couchdb", "password") => Some("COUCHDB_PASSWORD"),
        ("couchdb", "database") => Some("COUCHDB_DATABASE"),
        ("couchdb", "custom_headers" | "custom-headers" | "headers") => {
            Some("COUCHDB_CUSTOM_HEADERS")
        }
        // Mac Bridge
        ("mac-bridge" | "mac_bridge", "host") => Some("MAC_BRIDGE_HOST"),
        ("mac-bridge" | "mac_bridge", "api_key" | "api-key") => Some("MAC_BRIDGE_API_KEY"),
        // Anthropic
        ("anthropic", "api_key" | "api-key") => Some("ANTHROPIC_API_KEY"),
        // LightRAG / memd RAG sidecar
        ("lightrag", "url" | "base_url" | "base-url") => Some("LIGHTRAG_BASE_URL"),
        ("lightrag", "api_key" | "api-key") => Some("LIGHTRAG_API_KEY"),
        (
            "lightrag",
            "llm_api_key" | "llm-api-key" | "llm_binding_api_key" | "llm-binding-api-key",
        ) => Some("LIGHTRAG_LLM_BINDING_API_KEY"),
        (
            "lightrag",
            "embedding_api_key"
            | "embedding-api-key"
            | "embedding_binding_api_key"
            | "embedding-binding-api-key",
        ) => Some("LIGHTRAG_EMBEDDING_BINDING_API_KEY"),
        ("memd", "rag_url" | "rag-url") => Some("MEMD_RAG_URL"),
        ("raganything", "url") => Some("RAGANYTHING_URL"),
        ("mineru", "url") => Some("MINERU_URL"),
        ("rag", "url") => Some("RAG_URL"),
        _ => None,
    }
}

fn string_map_to_value_map(
    creds: &HashMap<String, String>,
) -> serde_json::Map<String, serde_json::Value> {
    creds
        .iter()
        .filter(|(_, value)| !value.trim().is_empty())
        .map(|(key, value)| (key.clone(), serde_json::Value::String(value.clone())))
        .collect()
}

fn merge_service_credentials_into_state_map(
    service: &str,
    creds: &serde_json::Map<String, serde_json::Value>,
    merged: &mut HashMap<String, String>,
    count: &mut usize,
) {
    for (cred_key, cred_value) in creds {
        let Some(cred_value) = cred_value.as_str() else {
            tracing::warn!(
                service = %service,
                key = %cred_key,
                "non-string credential in user_secrets — skipping"
            );
            continue;
        };

        match service_credential_to_env_var(service, cred_key) {
            Some(env_var) => {
                merged.insert(env_var.to_string(), cred_value.to_string());
                *count += 1;
            }
            None => {
                tracing::warn!(
                    service = %service,
                    key = %cred_key,
                    "unknown service/credential key in user_secrets — skipping"
                );
            }
        }
    }
}

/// Fetch all `user_secrets` rows from Supabase for the given user, decrypt
/// each row's `encrypted_credentials` using the session's encryption key,
/// and merge the resulting key-value pairs into `state.secrets`.
///
/// Supabase credentials override OS keychain values (they are more
/// authoritative since they are user-specific and encrypted).
///
/// This function logs but never returns errors — secrets may not be migrated
/// yet, and the OS keychain provides a working fallback.
pub async fn load_user_secrets(state: &AppState, session: &UserSession) {
    if is_insecure_dev_session(session) {
        tracing::debug!("skipping user_secrets load for insecure dev session");
        return;
    }

    // Skip if no encryption key is available (e.g. OAuth login without password)
    if session.encryption_key.is_empty() {
        tracing::debug!("skipping user_secrets load: no encryption key (OAuth login)");
        return;
    }

    let sb = match SupabaseClient::from_state(state) {
        Ok(sb) => sb,
        Err(e) => {
            tracing::warn!("skipping user_secrets load: {e}");
            return;
        }
    };

    // Fetch all user_secrets rows using the user's JWT for RLS
    let query = "select=service,encrypted_credentials,nonce";
    let rows = match sb
        .select_as_user("user_secrets", query, &session.access_token)
        .await
    {
        Ok(rows) => rows,
        Err(e) => {
            tracing::warn!("failed to fetch user_secrets: {e}");
            return;
        }
    };

    let rows = match rows.as_array() {
        Some(arr) => arr,
        None => {
            tracing::debug!("user_secrets returned non-array (user has no secrets)");
            return;
        }
    };

    if rows.is_empty() {
        tracing::info!("no user_secrets found — auto-migrating from keychain");
        auto_migrate_keychain_secrets(state, session, &sb).await;
        return;
    }

    let local_services = collect_local_sync_credentials(state);
    let mut merged: HashMap<String, String> = HashMap::new();
    let mut count = 0usize;
    let mut repaired = 0usize;

    for row in rows {
        let service = match row["service"].as_str() {
            Some(s) => s,
            None => continue,
        };
        let ciphertext = match row["encrypted_credentials"].as_str() {
            Some(s) => s,
            None => continue,
        };
        let nonce = match row["nonce"].as_str() {
            Some(s) => s,
            None => continue,
        };

        // Decrypt the credentials blob
        let plaintext = match crate::crypto::decrypt(ciphertext, nonce, &session.encryption_key) {
            Ok(bytes) => bytes,
            Err(e) => {
                tracing::warn!(
                    service = %service,
                    "failed to decrypt user_secrets for service (wrong key or corrupted): {e}"
                );
                if service == "mail_accounts" {
                    match mail_accounts::repair_cloud_mail_accounts_from_local(state, session).await
                    {
                        Ok(true) => {
                            repaired += 1;
                            tracing::info!(
                                service = %service,
                                "repaired synced user_secrets from local mail account registry"
                            );
                        }
                        Ok(false) => {}
                        Err(err) => {
                            tracing::warn!(
                                service = %service,
                                "failed to repair synced mail_accounts from local registry: {err:?}"
                            );
                        }
                    }
                } else if let Some(local_creds) = local_services.get(service) {
                    match upsert_encrypted_service_credentials(session, &sb, service, local_creds)
                        .await
                    {
                        Ok(()) => {
                            repaired += 1;
                            merge_service_credentials_into_state_map(
                                service,
                                local_creds,
                                &mut merged,
                                &mut count,
                            );
                            tracing::info!(
                                service = %service,
                                "repaired synced user_secrets from local keychain fallback"
                            );
                        }
                        Err(err) => {
                            tracing::warn!(
                                service = %service,
                                "failed to repair synced user_secrets from local keychain fallback: {err}"
                            );
                        }
                    }
                } else {
                    tracing::warn!(
                        service = %service,
                        "leaving undecryptable synced user_secret intact because no local fallback exists"
                    );
                }
                continue;
            }
        };

        if service == "mail_accounts" {
            continue;
        }

        // Parse as JSON map of credential key -> value
        let creds: HashMap<String, String> = match serde_json::from_slice(&plaintext) {
            Ok(map) => map,
            Err(e) => {
                tracing::warn!(
                    service = %service,
                    "failed to parse decrypted user_secrets as JSON: {e}"
                );
                continue;
            }
        };

        merge_service_credentials_into_state_map(
            service,
            &string_map_to_value_map(&creds),
            &mut merged,
            &mut count,
        );
    }

    if !merged.is_empty() {
        state.merge_secrets(merged);
        tracing::info!(
            user_id = %session.user_id,
            secrets_loaded = count,
            "user_secrets loaded from Supabase and merged into AppState"
        );
    }

    if repaired > 0 {
        tracing::info!(
            user_id = %session.user_id,
            services_repaired = repaired,
            "repaired synced user_secrets with current account encryption key"
        );
    }
}

/// Auto-migrate keychain secrets to Supabase user_secrets on first login.
fn sync_env_to_service_fields() -> &'static [(&'static str, &'static str, &'static str)] {
    &[
        ("BLUEBUBBLES_HOST", "bluebubbles", "host"),
        ("BLUEBUBBLES_PASSWORD", "bluebubbles", "password"),
        ("HARNESS_API_URL", "harness", "api_url"),
        ("HARNESS_API_KEY", "harness", "api_key"),
        ("HARNESS_WS", "harness", "ws"),
        ("HARNESS_PASSWORD", "harness", "password"),
        ("CODEX_LB_API_URL", "codex-lb", "api_url"),
        (
            "CODEX_LB_DASHBOARD_PASSWORD",
            "codex-lb",
            "dashboard_password",
        ),
        ("HERMES_DASHBOARD_URL", "hermes-dashboard", "dashboard_url"),
        (
            "HERMES_DASHBOARD_API_URL",
            "hermes-dashboard",
            "dashboard_api_url",
        ),
        (
            "HERMES_DASHBOARD_API_KEY",
            "hermes-dashboard",
            "dashboard_api_key",
        ),
        (
            "HERMES_DASHBOARD_PASSWORD",
            "hermes-dashboard",
            "dashboard_password",
        ),
        ("HERMES_API_URL", "hermes", "api_url"),
        ("HERMES_API_KEY", "hermes", "api_key"),
        ("HERMES_WS", "hermes", "ws"),
        ("HERMES_PASSWORD", "hermes", "password"),
        ("OPENCLAW_API_URL", "openclaw", "api_url"),
        ("OPENCLAW_API_KEY", "openclaw", "api_key"),
        ("OPENCLAW_WS", "openclaw", "ws"),
        ("OPENCLAW_PASSWORD", "openclaw", "password"),
        ("AGENTSECRETS_URL", "agentsecrets", "url"),
        (
            "AGENTSECRETS_CLIENT_API_KEY",
            "agentsecrets",
            "client_api_key",
        ),
        (
            "SECRET_BROKER_APPROVER_API_KEY",
            "agentsecrets",
            "approver_api_key",
        ),
        ("AGENTSHELL_URL", "agentshell", "url"),
        ("SUNSHINE_HOST", "sunshine", "url"),
        ("VNC_HOST", "vnc", "url"),
        ("PROXMOX_HOST", "proxmox", "host"),
        ("PROXMOX_TOKEN_ID", "proxmox", "token_id"),
        ("PROXMOX_TOKEN_SECRET", "proxmox", "token_secret"),
        ("OPNSENSE_HOST", "opnsense", "host"),
        ("OPNSENSE_KEY", "opnsense", "key"),
        ("OPNSENSE_SECRET", "opnsense", "secret"),
        ("PORTAINER_INSTANCES", "portainer", "instances"),
        ("PLEX_URL", "plex", "url"),
        ("PLEX_TOKEN", "plex", "token"),
        ("SONARR_URL", "sonarr", "url"),
        ("SONARR_API_KEY", "sonarr", "api_key"),
        ("RADARR_URL", "radarr", "url"),
        ("RADARR_API_KEY", "radarr", "api_key"),
        ("LIDARR_URL", "lidarr", "url"),
        ("LIDARR_API_KEY", "lidarr", "api_key"),
        ("PROWLARR_URL", "prowlarr", "url"),
        ("PROWLARR_API_KEY", "prowlarr", "api_key"),
        ("OVERSEERR_URL", "overseerr", "url"),
        ("OVERSEERR_API_KEY", "overseerr", "api_key"),
        ("TAUTULLI_URL", "tautulli", "url"),
        ("TAUTULLI_API_KEY", "tautulli", "api_key"),
        ("BAZARR_URL", "bazarr", "url"),
        ("BAZARR_API_KEY", "bazarr", "api_key"),
        ("JELLYSEERR_URL", "jellyseerr", "url"),
        ("JELLYSEERR_API_KEY", "jellyseerr", "api_key"),
        ("JELLYSTAT_URL", "jellystat", "url"),
        ("JELLYSTAT_API_KEY", "jellystat", "api_key"),
        ("QBITTORRENT_URL", "qbittorrent", "url"),
        ("QBITTORRENT_USERNAME", "qbittorrent", "username"),
        ("QBITTORRENT_PASSWORD", "qbittorrent", "password"),
        ("SABNZBD_URL", "sabnzbd", "url"),
        ("SABNZBD_API_KEY", "sabnzbd", "api_key"),
        ("NZBGET_URL", "nzbget", "url"),
        ("NZBGET_USERNAME", "nzbget", "username"),
        ("NZBGET_PASSWORD", "nzbget", "password"),
        ("TRANSMISSION_URL", "transmission", "url"),
        ("TRANSMISSION_USERNAME", "transmission", "username"),
        ("TRANSMISSION_PASSWORD", "transmission", "password"),
        ("DELUGE_URL", "deluge", "url"),
        ("DELUGE_PASSWORD", "deluge", "password"),
        ("UNRAID_URL", "unraid", "url"),
        ("UNRAID_API_KEY", "unraid", "api_key"),
        ("WIZARR_URL", "wizarr", "url"),
        ("WIZARR_API_KEY", "wizarr", "api_key"),
        ("JELLYFIN_URL", "jellyfin", "url"),
        ("JELLYFIN_API_KEY", "jellyfin", "api_key"),
        ("EMBY_URL", "emby", "url"),
        ("EMBY_API_KEY", "emby", "api_key"),
        ("READARR_URL", "readarr", "url"),
        ("READARR_API_KEY", "readarr", "api_key"),
        ("WHISPARR_URL", "whisparr", "url"),
        ("WHISPARR_API_KEY", "whisparr", "api_key"),
        ("MYLAR_URL", "mylar", "url"),
        ("MYLAR_API_KEY", "mylar", "api_key"),
        ("AUTOBRR_URL", "autobrr", "url"),
        ("AUTOBRR_API_KEY", "autobrr", "api_key"),
        ("RECYCLARR_URL", "recyclarr", "url"),
        ("RECYCLARR_API_KEY", "recyclarr", "api_key"),
        ("KOMETA_URL", "kometa", "url"),
        ("KOMETA_API_KEY", "kometa", "api_key"),
        ("FLARESOLVERR_URL", "flaresolverr", "url"),
        ("SSH_HOST", "ssh", "host"),
        ("SSH_USER", "ssh", "user"),
        ("SSH_PASSWORD", "ssh", "password"),
        ("SSH_KEY_PATH", "ssh", "key_path"),
        ("SFTP_HOST", "sftp", "host"),
        ("SFTP_USER", "sftp", "user"),
        ("SFTP_PASSWORD", "sftp", "password"),
        ("SFTP_KEY_PATH", "sftp", "key_path"),
        ("EMAIL_HOST", "email", "host"),
        ("EMAIL_PORT", "email", "port"),
        ("EMAIL_USER", "email", "user"),
        ("EMAIL_PASSWORD", "email", "password"),
        ("AGENTMAIL_URL", "agentmail", "url"),
        ("AGENTMAIL_API_KEY", "agentmail", "api_key"),
        ("CALDAV_URL", "caldav", "url"),
        ("CALDAV_USERNAME", "caldav", "username"),
        ("CALDAV_PASSWORD", "caldav", "password"),
        ("NTFY_URL", "ntfy", "url"),
        ("NTFY_TOPIC", "ntfy", "topic"),
        ("COUCHDB_URL", "couchdb", "url"),
        ("COUCHDB_USER", "couchdb", "user"),
        ("COUCHDB_PASSWORD", "couchdb", "password"),
        ("COUCHDB_DATABASE", "couchdb", "database"),
        ("COUCHDB_CUSTOM_HEADERS", "couchdb", "custom_headers"),
        ("MAC_BRIDGE_HOST", "mac-bridge", "host"),
        ("MAC_BRIDGE_API_KEY", "mac-bridge", "api_key"),
        ("ANTHROPIC_API_KEY", "anthropic", "api_key"),
        ("LIGHTRAG_BASE_URL", "lightrag", "base_url"),
        ("LIGHTRAG_API_KEY", "lightrag", "api_key"),
        ("LIGHTRAG_LLM_BINDING_API_KEY", "lightrag", "llm_api_key"),
        (
            "LIGHTRAG_EMBEDDING_BINDING_API_KEY",
            "lightrag",
            "embedding_api_key",
        ),
        ("MEMD_RAG_URL", "memd", "rag_url"),
        ("RAGANYTHING_URL", "raganything", "url"),
        ("MINERU_URL", "mineru", "url"),
        ("RAG_URL", "rag", "url"),
    ]
}

fn collect_local_sync_credentials(
    state: &AppState,
) -> HashMap<String, serde_json::Map<String, serde_json::Value>> {
    // Group by service
    let mut services: HashMap<String, serde_json::Map<String, serde_json::Value>> = HashMap::new();
    for &(env_var, service, cred_key) in sync_env_to_service_fields() {
        if let Some(value) = state.secret(env_var) {
            if !value.is_empty() {
                services
                    .entry(service.to_string())
                    .or_default()
                    .insert(cred_key.to_string(), serde_json::Value::String(value));
            }
        }
    }
    services
}

async fn upsert_encrypted_service_credentials(
    session: &UserSession,
    sb: &SupabaseClient,
    service: &str,
    creds: &serde_json::Map<String, serde_json::Value>,
) -> anyhow::Result<()> {
    let creds = sanitize_service_credentials(creds);
    if creds.is_empty() {
        anyhow::bail!("no nonempty credentials to sync");
    }
    let creds_value = serde_json::Value::Object(creds);
    let json_bytes = serde_json::to_vec(&creds_value)?;
    let (ciphertext, nonce) = crate::crypto::encrypt(&json_bytes, &session.encryption_key)?;
    let row = serde_json::json!({
        "user_id": session.user_id,
        "service": service,
        "encrypted_credentials": ciphertext,
        "nonce": nonce,
    });
    sb.upsert_as_user("user_secrets", row, &session.access_token)
        .await?;
    Ok(())
}

fn sanitize_service_credentials(
    creds: &serde_json::Map<String, serde_json::Value>,
) -> serde_json::Map<String, serde_json::Value> {
    creds
        .iter()
        .filter_map(|(key, value)| match value {
            serde_json::Value::String(s) if !s.trim().is_empty() => {
                Some((key.clone(), serde_json::Value::String(s.clone())))
            }
            serde_json::Value::Array(items) if !items.is_empty() => {
                Some((key.clone(), value.clone()))
            }
            serde_json::Value::Object(map) if !map.is_empty() => Some((key.clone(), value.clone())),
            serde_json::Value::Bool(_) | serde_json::Value::Number(_) => {
                Some((key.clone(), value.clone()))
            }
            _ => None,
        })
        .collect()
}

/// Auto-migrate keychain secrets to Supabase user_secrets on first login.
async fn auto_migrate_keychain_secrets(
    state: &AppState,
    session: &UserSession,
    sb: &SupabaseClient,
) {
    let services = collect_local_sync_credentials(state);

    let mut count = 0usize;
    for (service, creds) in &services {
        if let Err(e) = upsert_encrypted_service_credentials(session, sb, service, creds).await {
            tracing::warn!(service = %service, "auto-migrate failed: {e}");
            continue;
        }
        count += 1;
    }

    tracing::info!(
        services_migrated = count,
        "auto-migrated keychain secrets to Supabase user_secrets"
    );
}

/// Promote local-only keychain secrets after account sync unlock.
///
/// This keeps existing synced rows authoritative and only fills missing
/// services, so an older or partial local cache cannot overwrite better cloud
/// data.
async fn promote_missing_keychain_secrets(
    state: &AppState,
    session: &UserSession,
    sb: &SupabaseClient,
) {
    if is_insecure_dev_session(session) {
        tracing::debug!("skipping local secret promotion for insecure dev session");
        return;
    }

    if session.encryption_key.is_empty() {
        return;
    }

    let rows = match sb
        .select_as_user(
            "user_secrets",
            "select=service,encrypted_credentials,nonce",
            &session.access_token,
        )
        .await
    {
        Ok(rows) => rows,
        Err(err) => {
            tracing::warn!("cannot inspect synced services for local promotion: {err}");
            return;
        }
    };

    let existing = rows
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|row| {
            row.get("service")
                .and_then(Value::as_str)
                .map(|service| (service.to_string(), row.clone()))
        })
        .collect::<HashMap<_, _>>();

    let services = collect_local_sync_credentials(state);
    let mut count = 0usize;
    for (service, creds) in &services {
        let local_creds = sanitize_service_credentials(creds);
        if local_creds.is_empty() {
            continue;
        }

        if let Some(row) = existing.get(service) {
            let Some(ciphertext) = row.get("encrypted_credentials").and_then(Value::as_str) else {
                continue;
            };
            let Some(nonce) = row.get("nonce").and_then(Value::as_str) else {
                continue;
            };
            let plaintext = match crate::crypto::decrypt(ciphertext, nonce, &session.encryption_key)
            {
                Ok(bytes) => bytes,
                Err(err) => {
                    tracing::warn!(
                        service = %service,
                        "skipping local secret promotion because synced credentials could not be decrypted: {err}"
                    );
                    continue;
                }
            };
            let mut remote_creds: serde_json::Map<String, serde_json::Value> =
                match serde_json::from_slice::<HashMap<String, String>>(&plaintext) {
                    Ok(map) => string_map_to_value_map(&map),
                    Err(err) => {
                        tracing::warn!(
                            service = %service,
                            "skipping local secret promotion because synced credentials could not be parsed: {err}"
                        );
                        continue;
                    }
                };

            let mut changed = false;
            for (key, value) in local_creds {
                let remote_has_value = remote_creds
                    .get(&key)
                    .and_then(Value::as_str)
                    .map(|s| !s.trim().is_empty())
                    .unwrap_or_else(|| remote_creds.get(&key).is_some());
                if !remote_has_value {
                    remote_creds.insert(key, value);
                    changed = true;
                }
            }

            if !changed {
                continue;
            }

            if let Err(err) =
                upsert_encrypted_service_credentials(session, sb, service, &remote_creds).await
            {
                tracing::warn!(service = %service, "partial synced secret promotion failed: {err}");
                continue;
            }
            count += 1;
            continue;
        }

        if let Err(err) =
            upsert_encrypted_service_credentials(session, sb, service, &local_creds).await
        {
            tracing::warn!(service = %service, "local-only secret promotion failed: {err}");
            continue;
        }
        count += 1;
    }

    if count > 0 {
        tracing::info!(
            services_promoted = count,
            "promoted local-only secrets to synced user_secrets"
        );
    }
}

// ---------------------------------------------------------------------------
// Helpers: per-user encryption salt
// ---------------------------------------------------------------------------

/// Fetch or create a random 16-byte encryption salt for the given user.
///
/// On first login the salt does not exist yet, so we generate one and INSERT it.
/// Subsequent logins (including from other devices) read the stored salt.
///
/// Uses the user's JWT (not service role) so RLS policies are respected.
async fn get_or_create_salt(
    state: &AppState,
    access_token: &str,
    user_id: &str,
) -> anyhow::Result<String> {
    let sb = SupabaseClient::from_state(state)?;

    // Validate user_id to prevent injection into the PostgREST query
    crate::validation::validate_uuid(user_id)
        .map_err(|_| anyhow::anyhow!("invalid user_id format"))?;

    // Try to fetch existing salt
    let query = format!("select=encryption_salt&user_id=eq.{user_id}");
    let rows = sb
        .select_as_user("user_profiles", &query, access_token)
        .await;

    if let Ok(rows) = rows {
        if let Some(arr) = rows.as_array() {
            if let Some(row) = arr.first() {
                if let Some(salt) = row["encryption_salt"].as_str() {
                    return Ok(salt.to_string());
                }
            }
        }
    }

    // No profile yet — generate a random 16-byte salt
    let mut salt_bytes = [0u8; 16];
    rand::RngCore::fill_bytes(&mut rand::thread_rng(), &mut salt_bytes);
    let salt_b64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, salt_bytes);

    let body = serde_json::json!({
        "user_id": user_id,
        "encryption_salt": salt_b64,
    });

    sb.insert_as_user("user_profiles", body, access_token)
        .await
        .map_err(|e| anyhow::anyhow!("failed to create user profile: {e}"))?;

    tracing::info!(user_id = %user_id, "created encryption salt for new user profile");

    Ok(salt_b64)
}

// ---------------------------------------------------------------------------
// POST /auth/login
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct LoginBody {
    email: String,
    password: String,
}

async fn login(
    State(state): State<AppState>,
    Json(body): Json<LoginBody>,
) -> Result<Json<Value>, AppError> {
    let gotrue = GoTrueClient::from_state(&state).map_err(AppError::Internal)?;

    let auth = match gotrue
        .sign_in_with_password(&body.email, &body.password)
        .await
    {
        Ok(auth) => auth,
        Err(_e) => {
            log_security_event(
                &state.db,
                "login_failed",
                None,
                &json!({ "email": body.email }),
            )
            .await;
            check_failed_login_alert(&state.db).await;
            return Err(AppError::BadRequest("Invalid email or password".into()));
        }
    };

    // Derive encryption key from password using per-user random salt
    let user_id = auth.user["id"].as_str().unwrap_or("").to_string();
    let salt = get_or_create_salt(&state, &auth.access_token, &user_id)
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("salt retrieval failed: {e}")))?;
    let encryption_key = crate::crypto::derive_key(&body.password, &salt);
    cache_account_sync_key(&user_id, encryption_key.as_ref());

    let now = epoch_secs();

    // Check MFA factors — if the user has verified TOTP or WebAuthn factors,
    // they need to complete MFA verification before getting full access.
    let factors = auth.user.get("factors").and_then(|v| v.as_array());
    // Find first verified MFA factor (TOTP or WebAuthn)
    let verified_factor = factors.and_then(|fs| {
        fs.iter().find(|f| {
            let ft = f.get("factor_type").and_then(|t| t.as_str());
            let status = f.get("status").and_then(|s| s.as_str());
            (ft == Some("totp") || ft == Some("webauthn")) && status == Some("verified")
        })
    });
    let verified_factor_id = verified_factor
        .and_then(|f| f.get("id").and_then(|v| v.as_str()))
        .map(|s| s.to_string());
    let verified_factor_type = verified_factor
        .and_then(|f| f.get("factor_type").and_then(|v| v.as_str()))
        .map(|s| s.to_string());

    let has_verified_factors = verified_factor_id.is_some();

    // Compute all verified MFA factor types (e.g. ["totp", "webauthn"])
    let available_mfa_methods: Vec<String> = factors
        .map(|fs| {
            let mut methods: Vec<String> = fs
                .iter()
                .filter(|f| f.get("status").and_then(|s| s.as_str()) == Some("verified"))
                .filter_map(|f| {
                    f.get("factor_type")
                        .and_then(|t| t.as_str())
                        .map(|s| s.to_string())
                })
                .collect();
            methods.sort();
            methods.dedup();
            methods
        })
        .unwrap_or_default();

    // Check if user has NO factors — they need to enroll
    let has_any_factors = factors.map(|fs| !fs.is_empty()).unwrap_or(false);
    let mfa_enroll_required = !has_any_factors;

    // Detect concurrent session — log if a session already exists
    if let Some(ref existing) = *state.session.read().await {
        log_security_event(
            &state.db,
            "concurrent_session",
            Some(&user_id),
            &json!({
                "action": "new_login_replaced_existing",
                "previous_user_id": existing.user_id,
            }),
        )
        .await;
        tracing::warn!(
            user_id = %user_id,
            previous_user_id = %existing.user_id,
            "concurrent session detected — replacing existing session"
        );
    }

    // Store session — mfa_verified is false until MFA is verified
    let session = UserSession {
        access_token: auth.access_token,
        refresh_token: auth.refresh_token,
        user_id: user_id.clone(),
        email: body.email.clone(),
        expires_at: now + auth.expires_in,
        encryption_key: encryption_key.to_vec(),
        mfa_verified: false,
        factor_id: verified_factor_id.clone(),
        factor_type: verified_factor_type.clone(),
        available_mfa_methods: available_mfa_methods.clone(),
        created_at: now,
    };
    // Drop the Zeroizing wrapper now — its copy is zeroed, the session
    // field is protected by UserSession's own Drop impl.
    drop(encryption_key);
    *state.session.write().await = Some(session.clone());

    // NOTE: load_user_secrets is NOT called here — the session is pre-MFA
    // and the user has not yet verified their MFA factor. Secrets are loaded
    // after MFA verification in the mfa_verify handler.

    log_security_event(
        &state.db,
        "login_success",
        Some(&user_id),
        &json!({ "email": body.email }),
    )
    .await;

    tracing::info!(user_id = %user_id, mfa_required = %has_verified_factors, "user logged in");

    Ok(Json(json!({
        "ok": true,
        "user": { "id": user_id, "email": body.email },
        "mfa_required": has_verified_factors,
        "mfa_enroll_required": mfa_enroll_required,
        "factor_id": verified_factor_id,
        "factor_type": verified_factor_type,
        "available_mfa_methods": available_mfa_methods,
    })))
}

// ---------------------------------------------------------------------------
// POST /auth/signup
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
#[allow(dead_code)] // fields consumed by serde deserialization; body intentionally discarded (signup disabled)
struct SignupBody {
    email: String,
    password: String,
    invite_token: Option<String>,
}

async fn signup(
    State(state): State<AppState>,
    Json(_body): Json<SignupBody>,
) -> Result<Json<Value>, AppError> {
    // Signup is disabled — this is a personal self-hosted app.
    // New accounts must be created by an administrator via the Supabase dashboard.
    log_security_event(&state.db, "signup_attempt", None, &json!({})).await;
    tracing::warn!("signup attempt rejected (signup is disabled)");
    Err(AppError::Forbidden(
        "Signup is disabled. New accounts must be created by an administrator.".into(),
    ))
}

// ---------------------------------------------------------------------------
// GET /auth/session
// ---------------------------------------------------------------------------

async fn get_session(State(state): State<AppState>) -> Json<Value> {
    if state.session.read().await.is_some() && !crate::server::ensure_session_valid(&state).await {
        return Json(json!({
            "authenticated": false,
            "mfa_required": false,
            "mfa_verified": false,
        }));
    }

    let mut session = state.session.read().await.clone();
    if let Some(ref mut s) = session {
        if s.mfa_verified && s.encryption_key.is_empty() {
            if let Some(key) = load_cached_account_sync_key(&s.user_id) {
                s.encryption_key = key;
                *state.session.write().await = Some(s.clone());
                load_user_secrets(&state, s).await;
            }
        }
    }
    match session.as_ref() {
        Some(s) => {
            if s.mfa_verified {
                return Json(json!({
                    "authenticated": true,
                    "user": { "id": s.user_id, "email": s.email },
                    "mfa_required": false,
                    "mfa_verified": true,
                    "available_mfa_methods": s.available_mfa_methods,
                }));
            }

            // MFA not verified — use stored factor_id (no GoTrue call needed)
            let mfa_enroll_required = s.factor_id.is_none();

            Json(json!({
                "authenticated": true,
                "user": { "id": s.user_id, "email": s.email },
                "mfa_required": true,
                "mfa_enroll_required": mfa_enroll_required,
                "mfa_verified": false,
                "factor_id": s.factor_id,
                "factor_type": s.factor_type,
                "available_mfa_methods": s.available_mfa_methods,
            }))
        }
        None => {
            #[cfg(debug_assertions)]
            if matches!(
                std::env::var("ALLOW_INSECURE_DEV_AUTH_BYPASS")
                    .ok()
                    .as_deref(),
                Some("1" | "true" | "TRUE" | "True")
            ) {
                return Json(json!({
                    "authenticated": true,
                    "user": { "id": "dev-user", "email": "dev@localhost" },
                    "mfa_required": false,
                    "mfa_verified": true,
                    "available_mfa_methods": [],
                }));
            }

            Json(json!({ "authenticated": false }))
        }
    }
}

// ---------------------------------------------------------------------------
// POST /auth/logout
// ---------------------------------------------------------------------------

async fn logout(State(state): State<AppState>) -> Json<Value> {
    let session = state.session.read().await.clone();
    if let Some(sess) = session {
        if let Ok(gotrue) = GoTrueClient::from_state(&state) {
            if let Err(e) = gotrue.sign_out(&sess.access_token).await {
                tracing::warn!("gotrue sign_out failed (non-fatal): {e}");
            }
        }
        // Clear cached API responses for this user to prevent data leakage
        state.cache_clear_user(&sess.user_id).await;
        log_security_event(&state.db, "logout", Some(&sess.user_id), &json!({})).await;
        // Audit trail
        crate::audit::log_audit_or_warn(&state.db, &sess.user_id, "logout", "session", None, None)
            .await;
        tracing::info!(user_id = %sess.user_id, "user logged out");
    }
    *state.session.write().await = None;
    Json(json!({ "ok": true }))
}

// ---------------------------------------------------------------------------
// POST /auth/refresh
// ---------------------------------------------------------------------------

async fn refresh(State(state): State<AppState>) -> Result<Json<Value>, AppError> {
    let session = state
        .session
        .read()
        .await
        .clone()
        .ok_or(AppError::Unauthorized)?;

    // Hard 24-hour session lifetime — force re-authentication
    if epoch_secs() - session.created_at > 86400 {
        tracing::info!(user_id = %session.user_id, "session exceeded 24h lifetime — forcing re-auth");
        *state.session.write().await = None;
        return Err(AppError::Unauthorized);
    }

    // Serialise refresh attempts so concurrent requests don't all hit GoTrue
    let _guard = state.refresh_mutex.lock().await;

    // Re-check after acquiring the lock — another request may have refreshed already
    {
        let current = state.session.read().await;
        if let Some(ref s) = *current {
            if s.expires_at > session.expires_at {
                // Already refreshed by another concurrent request
                return Ok(Json(json!({ "ok": true })));
            }
        }
    }

    let gotrue = GoTrueClient::from_state(&state).map_err(AppError::Internal)?;

    let auth = match gotrue.refresh_token(&session.refresh_token).await {
        Ok(auth) => auth,
        Err(err) => {
            tracing::warn!(user_id = %session.user_id, "session refresh failed; clearing restored session: {err}");
            *state.session.write().await = None;
            crate::server::clear_dev_session(&state.db).await;
            return Err(AppError::Unauthorized);
        }
    };

    let now = epoch_secs();

    let mut write = state.session.write().await;
    if let Some(ref mut s) = *write {
        s.access_token = auth.access_token;
        s.refresh_token = auth.refresh_token;
        s.expires_at = now + auth.expires_in;
    }
    let updated_session = write.clone();
    drop(write);

    if let Some(ref session) = updated_session {
        #[cfg(debug_assertions)]
        crate::server::save_dev_session(&state.db, session).await;
    }

    tracing::debug!("session refreshed, expires_at={}", now + auth.expires_in);

    Ok(Json(json!({ "ok": true })))
}

// ---------------------------------------------------------------------------
// POST /auth/password
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct PasswordBody {
    current_password: String,
    new_password: String,
}

async fn change_password(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Json(body): Json<PasswordBody>,
) -> Result<Json<Value>, AppError> {
    let gotrue = GoTrueClient::from_state(&state).map_err(AppError::Internal)?;

    // Re-verify current password
    gotrue
        .sign_in_with_password(&session.email, &body.current_password)
        .await
        .map_err(|_| AppError::BadRequest("current password incorrect".into()))?;

    // Dry-run: verify all user_secrets can be decrypted with the old key
    // BEFORE changing the password. This prevents data loss if any secret
    // is corrupted or encrypted with a different key.
    let old_key = &session.encryption_key;
    if !old_key.is_empty() {
        let sb_dryrun = SupabaseClient::from_state(&state).map_err(AppError::Internal)?;

        let dryrun_secrets = sb_dryrun
            .select_as_user(
                "user_secrets",
                "select=service,encrypted_credentials,nonce",
                &session.access_token,
            )
            .await
            .unwrap_or(serde_json::json!([]));

        if let Some(rows) = dryrun_secrets.as_array() {
            for row in rows {
                let service = row["service"].as_str().unwrap_or("unknown");
                let ciphertext = match row["encrypted_credentials"].as_str() {
                    Some(s) => s,
                    None => continue,
                };
                let nonce = match row["nonce"].as_str() {
                    Some(s) => s,
                    None => continue,
                };

                if crate::crypto::decrypt(ciphertext, nonce, old_key).is_err() {
                    return Err(AppError::BadRequest(format!(
                        "Cannot change password: secret for service '{}' cannot be decrypted with current key. \
                         Please re-save that credential first.",
                        service
                    )));
                }
            }
        }
    }

    // Update password
    gotrue
        .update_user(
            &session.access_token,
            json!({ "password": body.new_password }),
        )
        .await
        .map_err(AppError::Internal)?;

    // Re-derive encryption key with new password (same salt — password changed, not salt)
    let salt = get_or_create_salt(&state, &session.access_token, &session.user_id)
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("salt retrieval failed: {e}")))?;
    let new_key = crate::crypto::derive_key(&body.new_password, &salt);

    // Re-encrypt all user_secrets with the new key BEFORE updating the session.
    // The old key is still in session.encryption_key at this point.
    let old_key = &session.encryption_key;
    if !old_key.is_empty() {
        let sb = SupabaseClient::from_state(&state).map_err(AppError::Internal)?;

        let secrets = sb
            .select_as_user(
                "user_secrets",
                "select=service,encrypted_credentials,nonce",
                &session.access_token,
            )
            .await
            .unwrap_or(serde_json::json!([]));

        if let Some(rows) = secrets.as_array() {
            for row in rows {
                let service = match row["service"].as_str() {
                    Some(s) => s,
                    None => continue,
                };
                let ciphertext = match row["encrypted_credentials"].as_str() {
                    Some(s) => s,
                    None => continue,
                };
                let nonce = match row["nonce"].as_str() {
                    Some(s) => s,
                    None => continue,
                };

                // Decrypt with old key
                let plaintext = match crate::crypto::decrypt(ciphertext, nonce, old_key) {
                    Ok(p) => p,
                    Err(e) => {
                        tracing::warn!(service = %service, "failed to decrypt secret during re-encryption: {e}");
                        continue;
                    }
                };

                // Re-encrypt with new key
                let (new_ciphertext, new_nonce) = crate::crypto::encrypt(&plaintext, &new_key)
                    .map_err(|e| {
                        AppError::Internal(anyhow::anyhow!("re-encryption failed: {e}"))
                    })?;

                let update_row = serde_json::json!({
                    "user_id": session.user_id,
                    "service": service,
                    "encrypted_credentials": new_ciphertext,
                    "nonce": new_nonce,
                });

                if let Err(e) = sb
                    .upsert_as_user("user_secrets", update_row, &session.access_token)
                    .await
                {
                    tracing::warn!(service = %service, "failed to upsert re-encrypted secret: {e}");
                    return Err(AppError::Internal(anyhow::anyhow!(
                        "failed to re-encrypt secrets — password change aborted: {e}"
                    )));
                }

                tracing::debug!(service = %service, "re-encrypted secret with new key");
            }
        }
    }

    let mut write = state.session.write().await;
    if let Some(ref mut s) = *write {
        s.encryption_key = new_key.to_vec();
    }
    drop(new_key);

    log_security_event(
        &state.db,
        "password_change",
        Some(&session.user_id),
        &json!({}),
    )
    .await;

    tracing::info!(user_id = %session.user_id, "password changed, {} secrets re-encrypted",
        if session.encryption_key.is_empty() { 0 } else { 1 });

    Ok(Json(json!({ "ok": true })))
}

// ---------------------------------------------------------------------------
// GET /auth/oauth/:provider
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct OAuthStartQuery {
    redirect_to: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct PendingOAuthFlowSnapshot {
    provider: String,
    verifier: String,
    nonce: String,
    url: String,
    created_at: i64,
    redirect_to: Option<String>,
}

fn pending_oauth_file_path() -> PathBuf {
    std::env::temp_dir().join("mc-tauri-pending-oauth.json")
}

async fn write_pending_oauth_snapshot(flow: &crate::server::PendingOAuthFlow) {
    let snapshot = PendingOAuthFlowSnapshot {
        provider: flow.provider.clone(),
        verifier: flow.verifier.clone(),
        nonce: flow.nonce.clone(),
        url: flow.url.clone(),
        created_at: flow.created_at,
        redirect_to: flow.redirect_to.clone(),
    };
    if let Ok(json) = serde_json::to_vec(&snapshot) {
        let path = pending_oauth_file_path();
        let _ = tokio::task::spawn_blocking(move || std::fs::write(path, json)).await;
    }
}

async fn read_pending_oauth_snapshot() -> Option<PendingOAuthFlowSnapshot> {
    let bytes = tokio::fs::read(pending_oauth_file_path()).await.ok()?;
    serde_json::from_slice::<PendingOAuthFlowSnapshot>(&bytes).ok()
}

async fn clear_pending_oauth_snapshot() {
    let _ = tokio::fs::remove_file(pending_oauth_file_path()).await;
}

fn escape_html_attr(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

fn same_origin(left: &url::Url, right: &url::Url) -> bool {
    left.scheme() == right.scheme()
        && left.host_str() == right.host_str()
        && left.port_or_known_default() == right.port_or_known_default()
}

fn is_allowed_oauth_redirect(candidate: &str, public_base: &str) -> bool {
    let Ok(redirect) = url::Url::parse(candidate) else {
        return false;
    };
    if !matches!(redirect.scheme(), "http" | "https") {
        return false;
    }

    if matches!(redirect.host_str(), Some("localhost" | "127.0.0.1" | "::1")) {
        return true;
    }

    url::Url::parse(public_base)
        .ok()
        .is_some_and(|base| same_origin(&redirect, &base))
}

async fn start_oauth(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(provider): Path<String>,
    Query(query): Query<OAuthStartQuery>,
) -> Result<Json<Value>, AppError> {
    // Validate provider
    if !["github", "google"].contains(&provider.as_str()) {
        return Err(AppError::BadRequest(format!(
            "unsupported OAuth provider: {provider}"
        )));
    }

    let public_base = backend_public_base_url(&state, &headers);

    // Validate redirect_to with URL parsing instead of prefix checks. Prefix
    // checks accept lookalikes such as `http://localhost:5000.evil.test`.
    let validated_redirect = query
        .redirect_to
        .filter(|url| is_allowed_oauth_redirect(url, &public_base));

    // If an OAuth flow was initiated recently (< 120s), return the same URL
    // instead of generating a new PKCE pair. This prevents double-click or
    // re-render from overwriting the verifier that Supabase expects.
    {
        let guard = state.pending_oauth.read().await;
        if let Some(ref flow) = *guard {
            let age = epoch_secs() - flow.created_at;
            if age < 120 && flow.provider == provider {
                tracing::info!(provider = %provider, age_secs = age, "OAuth flow already in progress — returning existing URL");
                return Ok(Json(json!({ "url": flow.url, "nonce": flow.nonce })));
            }
        }
    }

    let (verifier, challenge) = crate::gotrue::generate_pkce();

    let supabase_url = state
        .secret("SUPABASE_URL")
        .ok_or_else(|| AppError::Internal(anyhow::anyhow!("SUPABASE_URL not set")))?;

    let url = crate::gotrue::build_oauth_url(
        &supabase_url,
        &provider,
        &format!("{}/api/auth/callback", public_base),
        &challenge,
    );

    let nonce = random_uuid();
    {
        let mut guard = OAUTH_NONCE.lock().unwrap_or_else(|e| e.into_inner());
        *guard = Some(nonce.clone());
    }

    // Store the full flow state so duplicate calls return the same URL
    *state.pending_oauth.write().await = Some(crate::server::PendingOAuthFlow {
        provider: provider.clone(),
        verifier,
        nonce: nonce.clone(),
        url: url.clone(),
        created_at: epoch_secs(),
        redirect_to: validated_redirect,
    });
    if let Some(flow) = state.pending_oauth.read().await.as_ref() {
        write_pending_oauth_snapshot(flow).await;
    }

    tracing::info!(provider = %provider, "OAuth flow initiated");

    Ok(Json(json!({ "url": url, "nonce": nonce })))
}

fn backend_public_base_url(state: &AppState, headers: &HeaderMap) -> String {
    let host = headers
        .get("x-forwarded-host")
        .or_else(|| headers.get("host"))
        .and_then(|v| v.to_str().ok())
        .map(|s| s.split(',').next().unwrap_or("").trim())
        .filter(|s| !s.is_empty());
    let proto = headers
        .get("x-forwarded-proto")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.split(',').next().unwrap_or("").trim())
        .filter(|s| !s.is_empty())
        .unwrap_or("http");

    if let Some(host) = host {
        if host.starts_with("127.0.0.1:") || host.starts_with("localhost:") {
            return format!("{proto}://{host}")
                .trim_end_matches('/')
                .to_string();
        }
    }

    if let Some(value) = state.secret("BACKEND_PUBLIC_BASE_URL") {
        let trimmed = value.trim();
        if !trimmed.is_empty() {
            return trimmed.trim_end_matches('/').to_string();
        }
    }

    match host {
        Some(host) => format!("{proto}://{host}")
            .trim_end_matches('/')
            .to_string(),
        None => "http://127.0.0.1:5000".to_string(),
    }
}

// ---------------------------------------------------------------------------
// GET /auth/mfa/factors — list user's MFA factors
// ---------------------------------------------------------------------------

async fn mfa_list_factors(State(state): State<AppState>) -> Result<Json<Value>, AppError> {
    let session = state
        .session
        .read()
        .await
        .clone()
        .ok_or(AppError::Unauthorized)?;
    let gotrue = GoTrueClient::from_state(&state).map_err(AppError::Internal)?;
    let factors = gotrue
        .mfa_list_factors(&session.access_token)
        .await
        .map_err(map_auth_error)?;
    let json_factors: Vec<Value> = factors.iter().map(|f| {
        json!({ "id": f.id, "type": f.factor_type, "status": f.status, "friendly_name": f.friendly_name })
    }).collect();
    Ok(Json(json!({ "factors": json_factors })))
}

// ---------------------------------------------------------------------------
// MFA endpoints
// ---------------------------------------------------------------------------

// POST /auth/mfa/enroll — enroll a TOTP factor
async fn mfa_enroll(State(state): State<AppState>) -> Result<Json<Value>, AppError> {
    let session = state
        .session
        .read()
        .await
        .clone()
        .ok_or(AppError::Unauthorized)?;

    let gotrue = GoTrueClient::from_state(&state).map_err(AppError::Internal)?;

    let resp = gotrue
        .mfa_enroll_totp(&session.access_token, "clawctrl")
        .await
        .map_err(AppError::Internal)?;

    tracing::info!(user_id = %session.user_id, factor_id = %resp.id, "TOTP factor enrolled");

    Ok(Json(json!({
        "id": resp.id,
        "qr_code": resp.totp.qr_code,
        "secret": resp.totp.secret,
        "uri": resp.totp.uri,
    })))
}

// POST /auth/mfa/enroll-webauthn — start WebAuthn registration
//
// Calls GoTrue `POST /factors` with `factor_type: "webauthn"`. Returns the
// credential creation options that the frontend passes to
// `navigator.credentials.create()`.
async fn mfa_enroll_webauthn(State(state): State<AppState>) -> Result<Json<Value>, AppError> {
    let session = state
        .session
        .read()
        .await
        .clone()
        .ok_or(AppError::Unauthorized)?;

    let gotrue = GoTrueClient::from_state(&state).map_err(AppError::Internal)?;

    let result = gotrue
        .mfa_enroll(&session.access_token, "webauthn", "Hardware Key")
        .await
        .map_err(AppError::Internal)?;

    let factor_id = result["id"].as_str().unwrap_or("").to_string();
    tracing::info!(user_id = %session.user_id, factor_id = %factor_id, "WebAuthn factor enrolled — awaiting credential registration");

    // Return the full GoTrue response (includes id + web_authn creation options)
    Ok(Json(result))
}

// POST /auth/mfa/challenge
//
// For TOTP factors, returns `{ "id": "challenge-uuid" }`.
// For WebAuthn factors, also returns credential request options that the
// frontend passes to `navigator.credentials.get()`.

#[derive(Deserialize)]
struct MfaChallengeBody {
    factor_id: String,
}

async fn mfa_challenge(
    State(state): State<AppState>,
    Json(body): Json<MfaChallengeBody>,
) -> Result<Json<Value>, AppError> {
    crate::validation::validate_uuid(&body.factor_id)?;

    let session = state
        .session
        .read()
        .await
        .clone()
        .ok_or(AppError::Unauthorized)?;

    let gotrue = GoTrueClient::from_state(&state).map_err(AppError::Internal)?;

    let result = gotrue
        .mfa_challenge(&session.access_token, &body.factor_id)
        .await
        .map_err(map_auth_error)?;

    // Return the full GoTrue response (includes challenge id + WebAuthn options if applicable)
    Ok(Json(result))
}

// POST /auth/mfa/verify
//
// Accepts both TOTP and WebAuthn verification payloads:
//   TOTP:    { "factor_id": "...", "challenge_id": "...", "code": "123456" }
//   WebAuthn: { "factor_id": "...", "challenge_id": "...", "credential": { ... } }
//
// The `credential` field is the JSON-serialised output of
// `navigator.credentials.get()` or `navigator.credentials.create()`.

#[derive(Deserialize)]
struct MfaVerifyBody {
    factor_id: String,
    /// Remaining fields are forwarded verbatim to GoTrue (challenge_id, code,
    /// credential, etc.) so we support both TOTP and WebAuthn without coupling
    /// to a specific set of fields.
    #[serde(flatten)]
    extra: serde_json::Map<String, Value>,
}

async fn mfa_verify(
    State(state): State<AppState>,
    Json(body): Json<MfaVerifyBody>,
) -> Result<Json<Value>, AppError> {
    crate::validation::validate_uuid(&body.factor_id)?;

    let session = state
        .session
        .read()
        .await
        .clone()
        .ok_or(AppError::Unauthorized)?;

    let gotrue = GoTrueClient::from_state(&state).map_err(AppError::Internal)?;

    // Build the verify payload from the extra fields (challenge_id + code or credential)
    let verify_body = Value::Object(body.extra.clone());

    let auth = match gotrue
        .mfa_verify(&session.access_token, &body.factor_id, &verify_body)
        .await
    {
        Ok(auth) => {
            log_security_event(
                &state.db,
                "mfa_verified",
                Some(&session.user_id),
                &json!({ "factor_id": body.factor_id }),
            )
            .await;
            auth
        }
        Err(e) => {
            log_security_event(
                &state.db,
                "mfa_failed",
                Some(&session.user_id),
                &json!({ "factor_id": body.factor_id }),
            )
            .await;
            return Err(map_auth_error(e));
        }
    };

    // Update session with upgraded token (aal2) — MFA is now verified
    let now = epoch_secs();
    let mut write = state.session.write().await;
    if let Some(ref mut s) = *write {
        s.access_token = auth.access_token;
        s.refresh_token = auth.refresh_token;
        s.expires_at = now + auth.expires_in;
        s.mfa_verified = true; // GATE OPENS — user can now access all data
        if s.encryption_key.is_empty() {
            if let Some(key) = load_cached_account_sync_key(&s.user_id) {
                s.encryption_key = key;
            }
        }
    }
    // Read the updated session back for load_user_secrets
    let upgraded_session = write.clone();
    drop(write);

    tracing::info!(user_id = %session.user_id, "MFA verified (aal2) — full access granted");

    // Reload user_secrets with the upgraded aal2 token.
    // This ensures secrets are available even if the initial load at login
    // was skipped or failed (e.g. RLS policies that require aal2).
    if let Some(ref sess) = upgraded_session {
        load_user_secrets(&state, sess).await;

        // In dev mode, persist session to SQLite so it survives restarts
        #[cfg(debug_assertions)]
        crate::server::save_dev_session(&state.db, sess).await;
    }

    Ok(Json(json!({ "ok": true })))
}

fn map_auth_error(err: anyhow::Error) -> AppError {
    let message = err.to_string();
    if message.contains("400 Bad Request")
        || message.contains("401 Unauthorized")
        || message.contains("403 Forbidden")
        || message.contains("422 Unprocessable Entity")
    {
        AppError::BadRequest(message)
    } else {
        AppError::Internal(err)
    }
}

// DELETE /auth/mfa/unenroll/:factor_id
async fn mfa_unenroll(
    State(state): State<AppState>,
    Path(factor_id): Path<String>,
) -> Result<Json<Value>, AppError> {
    crate::validation::validate_uuid(&factor_id)?;

    let session = state
        .session
        .read()
        .await
        .clone()
        .ok_or(AppError::Unauthorized)?;

    // CRITICAL: Cannot unenroll MFA without first verifying MFA
    if !session.mfa_verified {
        return Err(AppError::BadRequest(
            "MFA verification required to unenroll factors".into(),
        ));
    }

    let gotrue = GoTrueClient::from_state(&state).map_err(AppError::Internal)?;

    gotrue
        .mfa_unenroll(&session.access_token, &factor_id)
        .await
        .map_err(AppError::Internal)?;

    log_security_event(
        &state.db,
        "mfa_unenroll",
        Some(&session.user_id),
        &json!({ "factor_id": factor_id }),
    )
    .await;

    tracing::info!(user_id = %session.user_id, factor_id = %factor_id, "MFA factor unenrolled");

    Ok(Json(json!({ "ok": true })))
}

// ---------------------------------------------------------------------------
// GET /auth/nonce
//
// Generates a fresh random nonce and stores it. The frontend must include
// this value as the `state` parameter when initiating the OAuth flow, so
// the callback can verify it was not forged or replayed.
// ---------------------------------------------------------------------------

async fn get_nonce() -> Json<Value> {
    let nonce = random_uuid();
    {
        let mut guard = OAUTH_NONCE.lock().unwrap_or_else(|e| e.into_inner());
        *guard = Some(nonce.clone());
    }
    tracing::info!("[oauth] generated new nonce");
    Json(json!({ "nonce": nonce }))
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Path to the one-time auth code file: `{tmpdir}/mc-tauri-auth-code`.
fn code_file_path() -> PathBuf {
    std::env::temp_dir().join("mc-tauri-auth-code")
}

/// Store a pending OAuth authorization code to a one-time temp file (Unix: mode 0o600).
#[cfg(unix)]
pub async fn set_pending_code(code: &str) -> Result<(), AppError> {
    use std::os::unix::fs::OpenOptionsExt;

    let path = code_file_path();
    tracing::info!("[tauri-session] storing code to {}", path.display());

    // Write with mode 0o600 (owner read/write only), matching the TS handler.
    let code_bytes = code.as_bytes().to_vec();
    let p = path.clone();
    tokio::task::spawn_blocking(move || {
        std::fs::OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .mode(0o600)
            .open(&p)
            .and_then(|mut f| {
                use std::io::Write;
                f.write_all(&code_bytes)
            })
    })
    .await
    .map_err(|e| AppError::Internal(e.into()))?
    .map_err(|e| AppError::Internal(e.into()))?;

    Ok(())
}

/// Store a pending OAuth authorization code to a one-time temp file (non-Unix fallback).
#[cfg(not(unix))]
pub async fn set_pending_code(code: &str) -> Result<(), AppError> {
    let path = code_file_path();
    tracing::info!("[tauri-session] storing code to {}", path.display());

    tokio::fs::write(&path, code.as_bytes())
        .await
        .map_err(|e| AppError::Internal(e.into()))?;

    Ok(())
}

// ---------------------------------------------------------------------------
// GET /auth/tauri-session
//
// The Tauri WebView polls this endpoint to pick up the OAuth authorization
// code after the user authenticates in the system browser.
//
// Behaviour (mirrors the TypeScript handler exactly):
//   - If the one-time file exists: read it, delete it, return { code: "..." }
//   - If the file does not exist:  return { code: null }
//   - Always set no-cache headers.
// ---------------------------------------------------------------------------

fn no_cache_headers() -> axum::http::HeaderMap {
    let mut headers = axum::http::HeaderMap::new();
    headers.insert(
        header::CACHE_CONTROL,
        "no-store, no-cache, must-revalidate".parse().unwrap(),
    );
    headers.insert(header::PRAGMA, "no-cache".parse().unwrap());
    headers
}

async fn get_tauri_session(
    State(state): State<AppState>,
) -> Result<(axum::http::HeaderMap, Json<Value>), AppError> {
    let path = code_file_path();
    let headers = no_cache_headers();

    match tokio::fs::read_to_string(&path).await {
        Ok(code) => {
            // Delete immediately — one-time use.
            if let Err(e) = tokio::fs::remove_file(&path).await {
                tracing::warn!("[tauri-session] failed to remove code file: {}", e);
            }
            let mut exchange_error: Option<String> = None;
            // The desktop app may still hold the PKCE verifier even if the
            // browser callback landed in a different process instance.
            if state.session.read().await.is_none() {
                let verifier = state
                    .pending_oauth
                    .read()
                    .await
                    .as_ref()
                    .map(|flow| flow.verifier.clone());
                let verifier = match verifier {
                    Some(verifier) => Some(verifier),
                    None => read_pending_oauth_snapshot()
                        .await
                        .map(|flow| flow.verifier),
                };
                if let Some(verifier) = verifier {
                    if let Ok(gotrue) = GoTrueClient::from_state(&state) {
                        match gotrue.exchange_code_for_session(&code, &verifier).await {
                            Ok(auth) => {
                                let now = epoch_secs();
                                let user_id = auth.user["id"].as_str().unwrap_or("").to_string();
                                let email = auth.user["email"].as_str().unwrap_or("").to_string();
                                let verified_factor = auth
                                    .user
                                    .get("factors")
                                    .and_then(|v| v.as_array())
                                    .and_then(|fs| {
                                        fs.iter().find(|f| {
                                            let ft = f.get("factor_type").and_then(|t| t.as_str());
                                            let status = f.get("status").and_then(|s| s.as_str());
                                            (ft == Some("totp") || ft == Some("webauthn"))
                                                && status == Some("verified")
                                        })
                                    });
                                let factor_id = verified_factor
                                    .and_then(|f| f.get("id").and_then(|v| v.as_str()))
                                    .map(|s| s.to_string());
                                let factor_type = verified_factor
                                    .and_then(|f| f.get("factor_type").and_then(|v| v.as_str()))
                                    .map(|s| s.to_string());
                                let available_mfa_methods: Vec<String> = auth
                                    .user
                                    .get("factors")
                                    .and_then(|v| v.as_array())
                                    .map(|fs| {
                                        let mut methods: Vec<String> = fs
                                            .iter()
                                            .filter(|f| {
                                                f.get("status").and_then(|s| s.as_str())
                                                    == Some("verified")
                                            })
                                            .filter_map(|f| {
                                                f.get("factor_type")
                                                    .and_then(|t| t.as_str())
                                                    .map(|s| s.to_string())
                                            })
                                            .collect();
                                        methods.sort();
                                        methods.dedup();
                                        methods
                                    })
                                    .unwrap_or_default();

                                let session = UserSession {
                                    access_token: auth.access_token,
                                    refresh_token: auth.refresh_token,
                                    user_id: user_id.clone(),
                                    email: email.clone(),
                                    expires_at: now + auth.expires_in,
                                    encryption_key: load_cached_account_sync_key(&user_id)
                                        .unwrap_or_default(),
                                    mfa_verified: false,
                                    factor_id,
                                    factor_type,
                                    available_mfa_methods,
                                    created_at: now,
                                };
                                *state.session.write().await = Some(session.clone());
                                {
                                    let mut guard = state.pending_oauth.write().await;
                                    if let Some(ref mut flow) = *guard {
                                        flow.verifier.zeroize();
                                    }
                                    *guard = None;
                                }
                                clear_pending_oauth_snapshot().await;
                                load_user_secrets(&state, &session).await;
                                #[cfg(debug_assertions)]
                                crate::server::save_dev_session(&state.db, &session).await;
                                log_security_event(
                                    &state.db,
                                    "oauth_login",
                                    Some(&user_id),
                                    &json!({ "email": email, "source": "tauri-session" }),
                                )
                                .await;
                                tracing::info!(
                                    user_id = %user_id,
                                    "[tauri-session] PKCE exchange succeeded — session stored"
                                );
                            }
                            Err(e) => {
                                clear_pending_oauth_snapshot().await;
                                exchange_error = Some(e.to_string());
                                tracing::warn!("[tauri-session] PKCE exchange failed: {e}");
                            }
                        }
                    }
                }
            }
            tracing::info!("[tauri-session] delivering code to webview");
            Ok((
                headers,
                Json(json!({ "code": code, "exchange_error": exchange_error })),
            ))
        }
        Err(_) => {
            // File does not exist (or is unreadable) — no pending code.
            Ok((
                headers,
                Json(json!({ "code": null, "exchange_error": null })),
            ))
        }
    }
}

// ---------------------------------------------------------------------------
// POST /auth/tauri-session
//
// Accepts { "code": "..." } and stores it in the one-time file so the
// WebView can pick it up via the GET endpoint above.
//
// This is the HTTP-callable equivalent of `setPendingCode` — useful when the
// OAuth callback route lives in a different service or process.
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct SetCodeBody {
    code: String,
}

async fn post_tauri_session(
    State(_state): State<AppState>,
    Json(body): Json<SetCodeBody>,
) -> Result<Json<Value>, AppError> {
    set_pending_code(&body.code).await?;
    Ok(Json(json!({ "ok": true })))
}

// ---------------------------------------------------------------------------
// GET /auth/callback?code=...
//
// The system browser lands here after the OAuth provider redirects back.
// We extract the authorization code, attempt PKCE exchange to establish a
// session, store it for the WebView to pick up (legacy flow), and return a
// simple HTML page telling the user to go back to the app.
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct CallbackQuery {
    code: Option<String>,
    error: Option<String>,
    error_description: Option<String>,
    state: Option<String>,
}

const FAVICON_PNG: &[u8] = include_bytes!("../../../frontend/public/favicon.png");
const LOGO_128_PNG: &[u8] = include_bytes!("../../../frontend/public/logo-128.png");

async fn serve_logo() -> impl IntoResponse {
    (
        [
            (header::CONTENT_TYPE, "image/png"),
            (header::CACHE_CONTROL, "public, max-age=86400"),
        ],
        LOGO_128_PNG,
    )
}

async fn serve_favicon() -> impl IntoResponse {
    (
        [
            (header::CONTENT_TYPE, "image/png"),
            (header::CACHE_CONTROL, "public, max-age=86400"),
        ],
        FAVICON_PNG,
    )
}

const PAGE_STYLE: &str = r#"
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Plus Jakarta Sans',system-ui,sans-serif;background:#0c0d11;color:#e2e2e8;display:flex;align-items:center;justify-content:center;height:100vh;overflow:hidden}
body::before{content:'';position:absolute;top:-30%;left:20%;width:500px;height:500px;background:radial-gradient(circle,rgba(167,139,250,0.06) 0%,transparent 70%);pointer-events:none}
.card{text-align:center;padding:40px 48px;border-radius:20px;background:rgba(255,255,255,0.025);border:1px solid rgba(255,255,255,0.06);backdrop-filter:blur(24px);max-width:380px}
.icon{width:48px;height:48px;border-radius:14px;display:flex;align-items:center;justify-content:center;margin:0 auto 16px}
.icon-ok{background:rgba(167,139,250,0.1);border:1px solid rgba(167,139,250,0.2)}
.icon-err{background:rgba(248,113,113,0.1);border:1px solid rgba(248,113,113,0.2)}
h1{font-size:18px;font-weight:700;margin-bottom:8px}
h1.ok{color:#a78bfa}
h1.err{color:#f87171}
p{color:rgba(255,255,255,0.4);font-size:13px;line-height:1.5}
"#;

fn callback_page(title: &str, heading: &str, msg: &str, is_error: bool) -> String {
    let h1_class = if is_error { "err" } else { "ok" };
    format!(
        r##"<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>{title} - clawctrl</title>
<link rel="icon" type="image/png" href="/api/auth/favicon.png">
<style>{style}</style></head>
<body><div class="card">
<img src="/api/auth/logo.png" width="64" height="64" alt="clawctrl" style="margin:0 auto 14px;display:block;filter:drop-shadow(0 2px 8px rgba(167,139,250,0.3))">
<h1 class="{h1_class}">{heading}</h1>
<p>{msg}</p>
</div>
<script>setTimeout(function(){{window.close()}},2000)</script>
</body></html>"##,
        title = title,
        style = PAGE_STYLE,
        h1_class = h1_class,
        heading = heading,
        msg = msg,
    )
}

async fn oauth_callback(
    State(state): State<AppState>,
    Query(params): Query<CallbackQuery>,
) -> Result<Html<String>, AppError> {
    if let Some(err) = params.error {
        let desc = params.error_description.unwrap_or_default();
        tracing::error!("[oauth-callback] error={err} desc={desc}");
        let err_safe = err
            .replace('&', "&amp;")
            .replace('<', "&lt;")
            .replace('>', "&gt;")
            .replace('"', "&quot;");
        let desc_safe = desc
            .replace('&', "&amp;")
            .replace('<', "&lt;")
            .replace('>', "&gt;")
            .replace('"', "&quot;");
        let msg = format!(
            "{}: {}<br>Close this tab and try again.",
            err_safe, desc_safe
        );
        return Ok(Html(callback_page(
            "Auth Error",
            "Authentication Error",
            &msg,
            true,
        )));
    }

    // Verify the OAuth state/nonce to prevent code injection.
    // The nonce is consumed (set to None) so it cannot be reused.
    {
        let mut guard = OAUTH_NONCE.lock().unwrap_or_else(|e| e.into_inner());
        let expected = guard.take(); // consume the nonce — single use
        match (&expected, &params.state) {
            (Some(exp), Some(got)) if exp.as_bytes().ct_eq(got.as_bytes()).into() => {
                // Nonce matches — proceed.
                tracing::info!("[oauth-callback] nonce verified");
            }
            (Some(_), Some(_)) => {
                // Supabase uses its own state parameter, so a mismatch with our
                // nonce is expected. PKCE code_verifier provides replay protection.
                tracing::warn!("[oauth-callback] state mismatch (Supabase manages its own state) — proceeding with PKCE");
            }
            (Some(_), None) => {
                // Supabase manages its own state parameter — our nonce may not
                // be forwarded. With server-side PKCE, replay protection is
                // already handled by the code_verifier. Allow the callback.
                tracing::warn!("[oauth-callback] no state param from Supabase — PKCE provides replay protection");
            }
            (None, _) => {
                // No nonce was generated (e.g. non-Tauri flow or server restarted).
                // Allow the callback to proceed to avoid breaking existing flows,
                // but log a warning.
                tracing::warn!("[oauth-callback] no nonce stored — skipping verification");
            }
        }
    }

    if let Some(code) = params.code {
        // Extract redirect_to and verifier before the flow gets cleared
        let (verifier, browser_redirect) = {
            let guard = state.pending_oauth.read().await;
            let verifier = guard.as_ref().map(|f| f.verifier.clone());
            let redirect = guard.as_ref().and_then(|f| f.redirect_to.clone());
            (verifier, redirect)
        };
        let snapshot = read_pending_oauth_snapshot().await;
        let verifier = verifier.or_else(|| snapshot.as_ref().map(|flow| flow.verifier.clone()));
        let browser_redirect = browser_redirect
            .or_else(|| snapshot.as_ref().and_then(|flow| flow.redirect_to.clone()));
        // Browser mode owns the exchange in the callback. Tauri mode only
        // stores the code here; the desktop app completes the exchange via
        // /api/auth/tauri-session to avoid consuming the one-time code early.
        if browser_redirect.is_some() {
            if let Some(verifier) = verifier {
                if let Ok(gotrue) = GoTrueClient::from_state(&state) {
                    match gotrue.exchange_code_for_session(&code, &verifier).await {
                        Ok(auth) => {
                            let now = epoch_secs();
                            let user_id = auth.user["id"].as_str().unwrap_or("").to_string();
                            let email = auth.user["email"].as_str().unwrap_or("").to_string();

                            // Extract factor_id and factor_type from user object (same as email login)
                            // Looks for both TOTP and WebAuthn verified factors
                            let oauth_verified_factor = auth
                                .user
                                .get("factors")
                                .and_then(|v| v.as_array())
                                .and_then(|fs| {
                                    fs.iter().find(|f| {
                                        let ft = f.get("factor_type").and_then(|t| t.as_str());
                                        let status = f.get("status").and_then(|s| s.as_str());
                                        (ft == Some("totp") || ft == Some("webauthn"))
                                            && status == Some("verified")
                                    })
                                });
                            let oauth_factor_id = oauth_verified_factor
                                .and_then(|f| f.get("id").and_then(|v| v.as_str()))
                                .map(|s| s.to_string());
                            let oauth_factor_type = oauth_verified_factor
                                .and_then(|f| f.get("factor_type").and_then(|v| v.as_str()))
                                .map(|s| s.to_string());
                            let oauth_available_methods: Vec<String> = auth
                                .user
                                .get("factors")
                                .and_then(|v| v.as_array())
                                .map(|fs| {
                                    let mut methods: Vec<String> = fs
                                        .iter()
                                        .filter(|f| {
                                            f.get("status").and_then(|s| s.as_str())
                                                == Some("verified")
                                        })
                                        .filter_map(|f| {
                                            f.get("factor_type")
                                                .and_then(|t| t.as_str())
                                                .map(|s| s.to_string())
                                        })
                                        .collect();
                                    methods.sort();
                                    methods.dedup();
                                    methods
                                })
                                .unwrap_or_default();

                            // Detect concurrent session
                            if let Some(ref existing) = *state.session.read().await {
                                log_security_event(
                                    &state.db,
                                    "concurrent_session",
                                    Some(&user_id),
                                    &json!({
                                        "action": "new_login_replaced_existing",
                                        "method": "oauth",
                                        "previous_user_id": existing.user_id,
                                    }),
                                )
                                .await;
                                tracing::warn!(
                                    user_id = %user_id,
                                    previous_user_id = %existing.user_id,
                                    "concurrent session detected (OAuth) — replacing existing session"
                                );
                            }

                            let session = UserSession {
                                access_token: auth.access_token,
                                refresh_token: auth.refresh_token,
                                user_id: user_id.clone(),
                                email: email.clone(),
                                expires_at: now + auth.expires_in,
                                encryption_key: load_cached_account_sync_key(&user_id)
                                    .unwrap_or_default(),
                                mfa_verified: false,
                                factor_id: oauth_factor_id,
                                factor_type: oauth_factor_type,
                                available_mfa_methods: oauth_available_methods,
                                created_at: now,
                            };
                            *state.session.write().await = Some(session.clone());
                            {
                                let mut guard = state.pending_oauth.write().await;
                                if let Some(ref mut flow) = *guard {
                                    flow.verifier.zeroize();
                                }
                                *guard = None;
                            }
                            clear_pending_oauth_snapshot().await;

                            // Try to load user_secrets (will skip if no encryption
                            // key, which is the case for OAuth logins without a
                            // password-derived key).
                            load_user_secrets(&state, &session).await;
                            #[cfg(debug_assertions)]
                            crate::server::save_dev_session(&state.db, &session).await;

                            log_security_event(
                                &state.db,
                                "oauth_login",
                                Some(&user_id),
                                &json!({ "email": email }),
                            )
                            .await;

                            tracing::info!(
                                user_id = %user_id,
                                "[oauth-callback] PKCE exchange succeeded — session stored"
                            );
                        }
                        Err(e) => {
                            // Zeroize and clear the PKCE verifier even on failure
                            let mut guard = state.pending_oauth.write().await;
                            if let Some(ref mut flow) = *guard {
                                flow.verifier.zeroize();
                            }
                            *guard = None;
                            clear_pending_oauth_snapshot().await;
                            tracing::warn!("[oauth-callback] PKCE exchange failed: {e}");
                        }
                    }
                }
            }
        }

        // Still store code for legacy tauri-session polling
        set_pending_code(&code).await?;

        // If a redirect_to URL was stored (browser-mode OAuth), redirect
        // back to the frontend instead of showing the "close this tab" page.
        if let Some(redirect_url) = browser_redirect {
            let redirect_url = escape_html_attr(&redirect_url);
            return Ok(Html(format!(
                r#"<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0;url={url}"></head><body>Redirecting...</body></html>"#,
                url = redirect_url,
            )));
        }

        Ok(Html(callback_page(
            "Signed In",
            "Signed in!",
            "You\u{2019}re all set! You can close this tab and return to clawctrl.",
            false,
        )))
    } else {
        Ok(Html(callback_page(
            "Error",
            "Something went wrong",
            "No authorization code received. Please try again.",
            true,
        )))
    }
}

// ---------------------------------------------------------------------------
// GET /auth/security-events — last 100 security events for the settings dashboard
// ---------------------------------------------------------------------------

async fn get_security_events(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let rows = sqlx::query_as::<_, (i64, String, Option<String>, Option<String>, String, String)>(
        "SELECT id, event_type, user_id, ip, details, created_at \
         FROM security_events WHERE user_id = ? OR user_id IS NULL \
         ORDER BY created_at DESC LIMIT 100",
    )
    .bind(&session.user_id)
    .fetch_all(&state.db)
    .await?;

    let events: Vec<Value> = rows
        .into_iter()
        .map(|(id, event_type, user_id, ip, details, created_at)| {
            let details_val: Value = serde_json::from_str(&details).unwrap_or(json!({}));
            json!({
                "id": id,
                "event_type": event_type,
                "user_id": user_id,
                "ip": ip,
                "details": details_val,
                "created_at": created_at,
            })
        })
        .collect();

    Ok(Json(json!({ "events": events })))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Helper: reset the global nonce before each test.
    fn reset_nonce() {
        let mut guard = OAUTH_NONCE.lock().unwrap();
        *guard = None;
    }

    #[test]
    fn setting_and_reading_nonce() {
        reset_nonce();

        // Initially no nonce stored
        {
            let guard = OAUTH_NONCE.lock().unwrap();
            assert!(guard.is_none(), "nonce should start as None");
        }

        // Set a nonce (mirrors what get_nonce handler does)
        let nonce_value = "test-nonce-abc123".to_string();
        {
            let mut guard = OAUTH_NONCE.lock().unwrap();
            *guard = Some(nonce_value.clone());
        }

        // Read it back
        {
            let guard = OAUTH_NONCE.lock().unwrap();
            assert_eq!(guard.as_deref(), Some("test-nonce-abc123"));
        }
    }

    #[test]
    fn nonce_consumed_after_take() {
        reset_nonce();

        // Store a nonce
        {
            let mut guard = OAUTH_NONCE.lock().unwrap();
            *guard = Some("single-use-nonce".to_string());
        }

        // Consume via .take() — mirrors what oauth_callback does
        let consumed = {
            let mut guard = OAUTH_NONCE.lock().unwrap();
            guard.take()
        };
        assert_eq!(consumed, Some("single-use-nonce".to_string()));

        // Second read should yield None — nonce is single-use
        {
            let guard = OAUTH_NONCE.lock().unwrap();
            assert!(guard.is_none(), "nonce must be None after take()");
        }
    }

    #[test]
    fn nonce_overwrite_replaces_previous() {
        reset_nonce();

        {
            let mut guard = OAUTH_NONCE.lock().unwrap();
            *guard = Some("first".to_string());
        }
        {
            let mut guard = OAUTH_NONCE.lock().unwrap();
            *guard = Some("second".to_string());
        }

        let value = OAUTH_NONCE.lock().unwrap().clone();
        assert_eq!(value, Some("second".to_string()));
    }

    #[test]
    fn epoch_secs_returns_reasonable_value() {
        let now = epoch_secs();
        // Should be after 2024-01-01 (1704067200) and before 2100-01-01
        assert!(
            now > 1_704_067_200,
            "epoch_secs should be a recent timestamp"
        );
        assert!(
            now < 4_102_444_800,
            "epoch_secs should not be in the far future"
        );
    }

    #[test]
    fn oauth_redirect_allows_loopback_and_same_origin() {
        assert!(is_allowed_oauth_redirect(
            "http://localhost:5173/auth/callback",
            "http://127.0.0.1:5000"
        ));
        assert!(is_allowed_oauth_redirect(
            "http://127.0.0.1:5173/auth/callback",
            "http://127.0.0.1:5000"
        ));
        assert!(is_allowed_oauth_redirect(
            "https://app.example.test/auth/callback",
            "https://app.example.test"
        ));
    }

    #[test]
    fn oauth_redirect_rejects_prefix_lookalikes() {
        assert!(!is_allowed_oauth_redirect(
            "http://localhost:5000.evil.test/auth/callback",
            "http://localhost:5000"
        ));
        assert!(!is_allowed_oauth_redirect(
            "https://app.example.test.evil.test/auth/callback",
            "https://app.example.test"
        ));
        assert!(!is_allowed_oauth_redirect(
            "javascript:alert(1)",
            "http://localhost:5000"
        ));
    }

    #[test]
    fn html_attribute_escape_blocks_redirect_markup_breakout() {
        let escaped = escape_html_attr(r#"http://localhost:5173/"><script>alert(1)</script>"#);
        assert!(!escaped.contains('"'));
        assert!(!escaped.contains("<script>"));
        assert!(escaped.contains("&quot;&gt;&lt;script&gt;"));
    }

    #[test]
    fn detects_insecure_dev_session() {
        let session = UserSession {
            access_token: "dev-token".to_string(),
            refresh_token: "dev-refresh".to_string(),
            user_id: "dev-user".to_string(),
            email: "dev@localhost".to_string(),
            expires_at: epoch_secs() + 3600,
            encryption_key: vec![0; 32],
            mfa_verified: true,
            factor_id: None,
            factor_type: None,
            available_mfa_methods: vec![],
            created_at: epoch_secs(),
        };

        assert!(is_insecure_dev_session(&session));
    }

    // ---- service_credential_to_env_var ----

    #[test]
    fn service_credential_mapping_bluebubbles() {
        assert_eq!(
            service_credential_to_env_var("bluebubbles", "host"),
            Some("BLUEBUBBLES_HOST")
        );
        assert_eq!(
            service_credential_to_env_var("bluebubbles", "password"),
            Some("BLUEBUBBLES_PASSWORD")
        );
    }

    #[test]
    fn service_credential_mapping_openclaw() {
        assert_eq!(
            service_credential_to_env_var("openclaw", "url"),
            Some("OPENCLAW_API_URL")
        );
        assert_eq!(
            service_credential_to_env_var("openclaw", "api_url"),
            Some("OPENCLAW_API_URL")
        );
        assert_eq!(
            service_credential_to_env_var("openclaw", "api-url"),
            Some("OPENCLAW_API_URL")
        );
        assert_eq!(
            service_credential_to_env_var("openclaw", "api_key"),
            Some("OPENCLAW_API_KEY")
        );
        assert_eq!(
            service_credential_to_env_var("openclaw", "ws"),
            Some("OPENCLAW_WS")
        );
    }

    #[test]
    fn service_credential_mapping_harness_alias() {
        assert_eq!(
            service_credential_to_env_var("harness", "url"),
            Some("HARNESS_API_URL")
        );
        assert_eq!(
            service_credential_to_env_var("harness", "api-key"),
            Some("HARNESS_API_KEY")
        );
        assert_eq!(
            service_credential_to_env_var("harness", "ws"),
            Some("HARNESS_WS")
        );
    }

    #[test]
    fn service_credential_mapping_hermes_primary() {
        assert_eq!(
            service_credential_to_env_var("hermes", "url"),
            Some("HERMES_API_URL")
        );
        assert_eq!(
            service_credential_to_env_var("hermes", "api-key"),
            Some("HERMES_API_KEY")
        );
        assert_eq!(
            service_credential_to_env_var("hermes", "ws"),
            Some("HERMES_WS")
        );
        assert_eq!(
            service_credential_to_env_var("hermes", "password"),
            Some("HERMES_PASSWORD")
        );
    }

    #[test]
    fn service_credential_mapping_hermes_dashboard_primary() {
        assert_eq!(
            service_credential_to_env_var("hermes-dashboard", "dashboard-url"),
            Some("HERMES_DASHBOARD_URL")
        );
        assert_eq!(
            service_credential_to_env_var("hermes-dashboard", "dashboard-api-url"),
            Some("HERMES_DASHBOARD_API_URL")
        );
        assert_eq!(
            service_credential_to_env_var("hermes_dashboard", "dashboard_api_key"),
            Some("HERMES_DASHBOARD_API_KEY")
        );
        assert_eq!(
            service_credential_to_env_var("hermes-dashboard", "dashboard-password"),
            Some("HERMES_DASHBOARD_PASSWORD")
        );
    }

    #[test]
    fn service_credential_mapping_agentsecrets() {
        assert_eq!(
            service_credential_to_env_var("agentsecrets", "url"),
            Some("AGENTSECRETS_URL")
        );
        assert_eq!(
            service_credential_to_env_var("agent-secrets", "base-url"),
            Some("AGENTSECRETS_URL")
        );
        assert_eq!(
            service_credential_to_env_var("agentsecrets", "client-api-key"),
            Some("AGENTSECRETS_CLIENT_API_KEY")
        );
        assert_eq!(
            service_credential_to_env_var("agentsecrets", "api_key"),
            Some("AGENTSECRETS_CLIENT_API_KEY")
        );
        assert_eq!(
            service_credential_to_env_var("agentsecrets", "approver-api-key"),
            Some("SECRET_BROKER_APPROVER_API_KEY")
        );
    }

    #[test]
    fn service_credential_mapping_proxmox() {
        assert_eq!(
            service_credential_to_env_var("proxmox", "host"),
            Some("PROXMOX_HOST")
        );
        assert_eq!(
            service_credential_to_env_var("proxmox", "token_id"),
            Some("PROXMOX_TOKEN_ID")
        );
        assert_eq!(
            service_credential_to_env_var("proxmox", "token-id"),
            Some("PROXMOX_TOKEN_ID")
        );
        assert_eq!(
            service_credential_to_env_var("proxmox", "token_secret"),
            Some("PROXMOX_TOKEN_SECRET")
        );
    }

    #[test]
    fn service_credential_mapping_couchdb() {
        assert_eq!(
            service_credential_to_env_var("couchdb", "url"),
            Some("COUCHDB_URL")
        );
        assert_eq!(
            service_credential_to_env_var("couchdb", "user"),
            Some("COUCHDB_USER")
        );
        assert_eq!(
            service_credential_to_env_var("couchdb", "username"),
            Some("COUCHDB_USER")
        );
        assert_eq!(
            service_credential_to_env_var("couchdb", "password"),
            Some("COUCHDB_PASSWORD")
        );
        assert_eq!(
            service_credential_to_env_var("couchdb", "database"),
            Some("COUCHDB_DATABASE")
        );
        assert_eq!(
            service_credential_to_env_var("couchdb", "custom_headers"),
            Some("COUCHDB_CUSTOM_HEADERS")
        );
        assert_eq!(
            service_credential_to_env_var("couchdb", "headers"),
            Some("COUCHDB_CUSTOM_HEADERS")
        );
    }

    #[test]
    fn service_credential_mapping_returns_none_for_unknown() {
        assert_eq!(service_credential_to_env_var("unknown", "host"), None);
        assert_eq!(
            service_credential_to_env_var("bluebubbles", "unknown_key"),
            None
        );
        assert_eq!(service_credential_to_env_var("", ""), None);
    }

    #[test]
    fn service_credential_mapping_agentmail() {
        assert_eq!(
            service_credential_to_env_var("agentmail", "url"),
            Some("AGENTMAIL_URL")
        );
        assert_eq!(
            service_credential_to_env_var("agentmail", "api_key"),
            Some("AGENTMAIL_API_KEY")
        );
        assert_eq!(
            service_credential_to_env_var("agentmail", "api-key"),
            Some("AGENTMAIL_API_KEY")
        );
        assert_eq!(
            service_credential_to_env_var("agentmail", "default-inbox-id"),
            Some("AGENTMAIL_DEFAULT_INBOX_ID")
        );
        assert_eq!(
            service_credential_to_env_var("agentmail", "default-address"),
            Some("AGENTMAIL_DEFAULT_ADDRESS")
        );
    }

    #[test]
    fn service_credential_mapping_email_metadata() {
        assert_eq!(
            service_credential_to_env_var("email", "provider"),
            Some("EMAIL_PROVIDER")
        );
        assert_eq!(
            service_credential_to_env_var("email", "label"),
            Some("EMAIL_LABEL")
        );
    }

    #[test]
    fn service_credential_mapping_all_services_covered() {
        // Verify every service mentioned in the design spec has at least one mapping
        let services = [
            "bluebubbles",
            "openclaw",
            "proxmox",
            "opnsense",
            "portainer",
            "plex",
            "jellyfin",
            "emby",
            "sonarr",
            "radarr",
            "lidarr",
            "readarr",
            "whisparr",
            "mylar",
            "prowlarr",
            "bazarr",
            "overseerr",
            "jellyseerr",
            "tautulli",
            "jellystat",
            "qbittorrent",
            "sabnzbd",
            "nzbget",
            "transmission",
            "deluge",
            "unraid",
            "wizarr",
            "autobrr",
            "recyclarr",
            "kometa",
            "flaresolverr",
            "ssh",
            "sftp",
            "email",
            "agentmail",
            "caldav",
            "ntfy",
            "couchdb",
        ];
        for service in services {
            // Each service should have at least one recognized credential key
            let has_mapping = [
                "host",
                "url",
                "password",
                "key",
                "secret",
                "token",
                "api_key",
                "api-key",
                "ws",
                "token_id",
                "token-id",
                "token_secret",
                "token-secret",
                "instances",
                "username",
                "user",
                "port",
                "topic",
            ]
            .iter()
            .any(|key| service_credential_to_env_var(service, key).is_some());
            assert!(
                has_mapping,
                "service '{}' should have at least one credential mapping",
                service
            );
        }
    }
}
