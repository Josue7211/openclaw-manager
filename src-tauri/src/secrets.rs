use keyring::Entry;
use rand::Rng;
use std::collections::HashMap;

const SERVICE: &str = "com.mission-control";

/// Mapping of keyring key names to environment variable names.
pub(crate) const KEY_ENV_MAP: &[(&str, &str)] = &[
    ("bluebubbles.host", "BLUEBUBBLES_HOST"),
    ("bluebubbles.password", "BLUEBUBBLES_PASSWORD"),
    ("caldav.url", "CALDAV_URL"),
    ("caldav.username", "CALDAV_USERNAME"),
    ("caldav.password", "CALDAV_PASSWORD"),
    ("proxmox.host", "PROXMOX_HOST"),
    ("proxmox.token-id", "PROXMOX_TOKEN_ID"),
    ("proxmox.token-secret", "PROXMOX_TOKEN_SECRET"),
    ("opnsense.host", "OPNSENSE_HOST"),
    ("opnsense.key", "OPNSENSE_KEY"),
    ("opnsense.secret", "OPNSENSE_SECRET"),
    ("mc-api-key", "MC_API_KEY"),
    ("plex.url", "PLEX_URL"),
    ("plex.token", "PLEX_TOKEN"),
    ("openclaw.ws", "OPENCLAW_WS"),
    ("openclaw.password", "OPENCLAW_PASSWORD"),
    ("openclaw.api-url", "OPENCLAW_API_URL"),
    ("openclaw.api-key", "OPENCLAW_API_KEY"),
    ("mac-bridge.host", "MAC_BRIDGE_HOST"),
    ("mac-bridge.api-key", "MAC_BRIDGE_API_KEY"),
    ("anthropic.api-key", "ANTHROPIC_API_KEY"),
    ("sonarr.url", "SONARR_URL"),
    ("sonarr.api-key", "SONARR_API_KEY"),
    ("radarr.url", "RADARR_URL"),
    ("radarr.api-key", "RADARR_API_KEY"),
    ("email.host", "EMAIL_HOST"),
    ("email.port", "EMAIL_PORT"),
    ("email.user", "EMAIL_USER"),
    ("email.password", "EMAIL_PASSWORD"),
    ("ntfy.url", "NTFY_URL"),
    ("ntfy.topic", "NTFY_TOPIC"),
    ("supabase.url", "SUPABASE_URL"),
    ("supabase.anon-key", "SUPABASE_ANON_KEY"),
    ("supabase.service-role-key", "SUPABASE_SERVICE_ROLE_KEY"),
    ("couchdb.url", "COUCHDB_URL"),
    ("couchdb.user", "COUCHDB_USER"),
    ("couchdb.password", "COUCHDB_PASSWORD"),
    ("couchdb.database", "COUCHDB_DATABASE"),
    ("mc-bind.host", "MC_BIND_HOST"),
    ("mc-agent.key", "MC_AGENT_KEY"),
];

/// Keys that are user-configured (excludes auto-generated mc-api-key).
const USER_KEYS: &[&str] = &[
    "bluebubbles.host",
    "bluebubbles.password",
    "caldav.url",
    "caldav.username",
    "caldav.password",
    "proxmox.host",
    "proxmox.token-id",
    "proxmox.token-secret",
    "opnsense.host",
    "opnsense.key",
    "opnsense.secret",
    "plex.url",
    "plex.token",
    "openclaw.ws",
    "openclaw.password",
    "openclaw.api-url",
    "openclaw.api-key",
    "mac-bridge.host",
    "mac-bridge.api-key",
    "anthropic.api-key",
    "sonarr.url",
    "sonarr.api-key",
    "radarr.url",
    "radarr.api-key",
    "email.host",
    "email.port",
    "email.user",
    "email.password",
    "ntfy.url",
    "ntfy.topic",
    "supabase.url",
    "supabase.anon-key",
    "supabase.service-role-key",
    "couchdb.url",
    "couchdb.user",
    "couchdb.password",
    "couchdb.database",
    "mc-bind.host",
    "mc-agent.key",
];

fn get_entry(key: &str) -> Option<String> {
    Entry::new(SERVICE, key).ok()?.get_password().ok()
}

pub(crate) fn set_entry(key: &str, value: &str) -> Result<(), String> {
    Entry::new(SERVICE, key)
        .map_err(|e| e.to_string())?
        .set_password(value)
        .map_err(|e| e.to_string())
}

/// Generate a fresh MC_API_KEY on every app start.
///
/// The key is regenerated each launch and overwritten in the keychain.
/// This limits the window of exposure if a key is ever leaked — it only
/// lives for the duration of one app process. The keychain store is
/// best-effort (the in-memory key is what actually matters).
fn ensure_api_key() -> String {
    let mut bytes = [0u8; 32];
    rand::thread_rng().fill(&mut bytes);
    let key = hex::encode(bytes);

    // Best-effort store in keychain so `get_secret("mc-api-key")` works
    // for the frontend to read it during this session.
    let _ = set_entry("mc-api-key", &key);

    key
}

/// Load all secrets from the OS keychain and return them as a
/// `HashMap<env_var_name, value>`. Only entries that exist in the
/// keychain are included. The `MC_API_KEY` is auto-generated when
/// absent.
pub fn load_env_vars() -> HashMap<String, String> {
    // Ensure the api key exists before iterating.
    let api_key = ensure_api_key();

    let mut env_vars = HashMap::new();

    for &(keyring_key, env_name) in KEY_ENV_MAP {
        if keyring_key == "mc-api-key" {
            env_vars.insert(env_name.to_string(), api_key.clone());
            continue;
        }
        if let Some(value) = get_entry(keyring_key) {
            env_vars.insert(env_name.to_string(), value);
        }
    }

    env_vars
}

/// All env-var names that correspond to keychain secrets.
/// Used by `load_secrets` to know which `.env.local` values to merge.
fn known_secret_keys() -> std::collections::HashSet<&'static str> {
    KEY_ENV_MAP.iter().map(|&(_, env_name)| env_name).collect()
}

/// Load secrets from the OS keychain, then merge in any `.env.local`
/// values as a dev-mode fallback. Returns the merged `HashMap` without
/// ever calling `std::env::set_var`, so secrets stay out of
/// `/proc/PID/environ`.
pub fn load_secrets() -> HashMap<String, String> {
    let mut secrets = load_env_vars();

    // Load .env.local as a dev-mode fallback.
    // Only merge keys that correspond to known secrets and that the
    // keychain didn't already provide (keychain takes precedence).
    let known = known_secret_keys();
    for path in &[".env.local", "../.env.local"] {
        if let Ok(iter) = dotenvy::from_filename_iter(path) {
            tracing::info!("Merging dev secrets from {}", path);
            for (key, value) in iter.flatten() {
                if known.contains(key.as_str()) && !secrets.contains_key(&key) {
                    secrets.insert(key, value);
                }
            }
            break;
        }
    }

    secrets
}

/// Check if this is a first run — i.e. no user-configured secrets
/// exist in the keychain yet.
pub fn is_first_run() -> bool {
    USER_KEYS.iter().all(|key| get_entry(key).is_none())
}

// ---------------------------------------------------------------------------
// Tauri commands (exported for the frontend)
// ---------------------------------------------------------------------------

/// Check if a key is in the allowed set (KEY_ENV_MAP keys + USER_KEYS).
pub(crate) fn is_allowed_key(key: &str) -> bool {
    KEY_ENV_MAP.iter().any(|&(k, _)| k == key) || USER_KEYS.contains(&key)
}

/// Keys that must never be returned to the frontend via IPC.
/// The frontend only needs: `mc-api-key`, `bluebubbles.host`, `openclaw.api-url`.
const FRONTEND_BLOCKED_KEYS: &[&str] = &[
    "supabase.service-role-key",
    "supabase.anon-key",
    "anthropic.api-key",
    "bluebubbles.password",
    "openclaw.password",
    "openclaw.api-key",
    "openclaw.ws",
    "proxmox.host",
    "proxmox.token-id",
    "proxmox.token-secret",
    "opnsense.host",
    "opnsense.key",
    "opnsense.secret",
    "plex.url",
    "plex.token",
    "sonarr.url",
    "sonarr.api-key",
    "radarr.url",
    "radarr.api-key",
    "email.host",
    "email.port",
    "email.user",
    "email.password",
    "caldav.url",
    "caldav.username",
    "caldav.password",
    "mac-bridge.host",
    "mac-bridge.api-key",
    "ntfy.url",
    "ntfy.topic",
    "mc-agent.key",
    "couchdb.url",
    "couchdb.user",
    "couchdb.password",
    "couchdb.database",
];

/// Keys that the frontend is allowed to write (allowlist).
/// Only keys needed by the onboarding wizard and Settings UI are included.
const FRONTEND_WRITABLE_KEYS: &[&str] = &[
    "bluebubbles.host", "bluebubbles.password",
    "openclaw.api-url", "openclaw.api-key", "openclaw.ws", "openclaw.password",
    "proxmox.host", "proxmox.token-id", "proxmox.token-secret",
    "opnsense.host", "opnsense.key", "opnsense.secret",
    "plex.url", "plex.token",
    "sonarr.url", "sonarr.api-key",
    "radarr.url", "radarr.api-key",
    "email.host", "email.port", "email.user", "email.password",
    "caldav.url", "caldav.username", "caldav.password",
    "ntfy.url", "ntfy.topic",
    "mac-bridge.host", "mac-bridge.api-key",
    "anthropic.api-key",
    "supabase.url", "supabase.anon-key",
    "mc-bind.host", "mc-agent.key",
];

/// Retrieve a single secret from the OS keychain by its keyring key name.
/// Only keys in the KEY_ENV_MAP/USER_KEYS allowlist are permitted.
/// Sensitive backend-only keys (e.g. service-role-key) are blocked from
/// frontend access.
#[tauri::command]
pub fn get_secret(key: String) -> Option<String> {
    if !is_allowed_key(&key) {
        return None;
    }
    if FRONTEND_BLOCKED_KEYS.contains(&key.as_str()) {
        return None;
    }
    get_entry(&key)
}

/// Store a secret in the OS keychain.
/// Only keys in the KEY_ENV_MAP/USER_KEYS allowlist are permitted.
/// Critical keys (mc-api-key, service-role-key) cannot be modified from the frontend.
#[tauri::command]
pub fn set_secret(key: String, value: String) -> Result<(), String> {
    if !is_allowed_key(&key) {
        return Err(format!("Key '{}' is not in the allowed set", key));
    }
    if !FRONTEND_WRITABLE_KEYS.contains(&key.as_str()) {
        return Err("cannot modify this key".into());
    }
    set_entry(&key, &value)
}

/// Return which integration modules are configured based on the
/// presence of their required secrets in the keychain.
#[tauri::command]
pub fn get_modules() -> HashMap<String, bool> {
    let mut modules = HashMap::new();

    modules.insert(
        "messages".to_string(),
        get_entry("bluebubbles.host").is_some(),
    );
    modules.insert("calendar".to_string(), get_entry("caldav.url").is_some());
    modules.insert(
        "homelab".to_string(),
        get_entry("proxmox.host").is_some() || get_entry("opnsense.host").is_some(),
    );
    modules.insert(
        "media".to_string(),
        get_entry("plex.url").is_some()
            || get_entry("sonarr.url").is_some()
            || get_entry("radarr.url").is_some(),
    );
    modules.insert("email".to_string(), get_entry("email.host").is_some());
    modules.insert("chat".to_string(), get_entry("openclaw.ws").is_some());
    modules.insert(
        "agents".to_string(),
        get_entry("anthropic.api-key").is_some(),
    );

    modules
}

/// Check whether this is the first run (no user-configured secrets).
#[tauri::command]
pub fn check_first_run() -> bool {
    is_first_run()
}

#[cfg(test)]
mod tests {
    use super::*;

    // ---- is_allowed_key ----

    #[test]
    fn is_allowed_key_accepts_known_keyring_keys() {
        assert!(is_allowed_key("bluebubbles.host"));
        assert!(is_allowed_key("bluebubbles.password"));
        assert!(is_allowed_key("mc-api-key"));
        assert!(is_allowed_key("supabase.url"));
        assert!(is_allowed_key("supabase.service-role-key"));
    }

    #[test]
    fn is_allowed_key_rejects_unknown_keys() {
        assert!(!is_allowed_key("random.key"));
        assert!(!is_allowed_key(""));
        assert!(!is_allowed_key("bluebubbles"));
        assert!(!is_allowed_key("BLUEBUBBLES_HOST"));
    }

    // ---- KEY_ENV_MAP consistency ----

    #[test]
    fn key_env_map_has_no_empty_entries() {
        for &(keyring_key, env_name) in KEY_ENV_MAP {
            assert!(!keyring_key.is_empty(), "keyring key must not be empty");
            assert!(!env_name.is_empty(), "env name must not be empty");
        }
    }

    #[test]
    fn key_env_map_env_names_are_uppercase() {
        for &(_, env_name) in KEY_ENV_MAP {
            assert_eq!(
                env_name,
                env_name.to_uppercase(),
                "env name '{}' should be UPPERCASE",
                env_name
            );
        }
    }

    // ---- FRONTEND_BLOCKED_KEYS ----

    #[test]
    fn frontend_blocked_keys_are_in_key_env_map() {
        for &blocked in FRONTEND_BLOCKED_KEYS {
            assert!(
                KEY_ENV_MAP.iter().any(|&(k, _)| k == blocked),
                "blocked key '{}' should exist in KEY_ENV_MAP",
                blocked
            );
        }
    }

    #[test]
    fn service_role_key_is_blocked() {
        assert!(FRONTEND_BLOCKED_KEYS.contains(&"supabase.service-role-key"));
    }

    // ---- USER_KEYS consistency ----

    #[test]
    fn user_keys_are_subset_of_key_env_map() {
        for &user_key in USER_KEYS {
            assert!(
                KEY_ENV_MAP.iter().any(|&(k, _)| k == user_key),
                "user key '{}' should exist in KEY_ENV_MAP",
                user_key
            );
        }
    }

    #[test]
    fn user_keys_excludes_mc_api_key() {
        assert!(
            !USER_KEYS.contains(&"mc-api-key"),
            "mc-api-key is auto-generated and should not be in USER_KEYS"
        );
    }

    // ---- known_secret_keys ----

    #[test]
    fn known_secret_keys_has_correct_count() {
        let keys = known_secret_keys();
        assert_eq!(keys.len(), KEY_ENV_MAP.len());
    }

    #[test]
    fn known_secret_keys_contains_all_env_names() {
        let keys = known_secret_keys();
        for &(_, env_name) in KEY_ENV_MAP {
            assert!(
                keys.contains(env_name),
                "known_secret_keys should contain '{}'",
                env_name
            );
        }
    }
}
