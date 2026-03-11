use keyring::Entry;
use rand::Rng;
use std::collections::HashMap;

const SERVICE: &str = "com.mission-control";

/// Mapping of keyring key names to environment variable names.
const KEY_ENV_MAP: &[(&str, &str)] = &[
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
    ("supabase.url", "NEXT_PUBLIC_SUPABASE_URL"),
    ("supabase.anon-key", "NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    ("supabase.service-role-key", "SUPABASE_SERVICE_ROLE_KEY"),
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
];

fn get_entry(key: &str) -> Option<String> {
    Entry::new(SERVICE, key).ok()?.get_password().ok()
}

fn set_entry(key: &str, value: &str) -> Result<(), String> {
    Entry::new(SERVICE, key)
        .map_err(|e| e.to_string())?
        .set_password(value)
        .map_err(|e| e.to_string())
}

/// Auto-generate MC_API_KEY if not already stored in the keychain.
/// Returns the existing or newly generated 256-bit random hex key.
fn ensure_api_key() -> String {
    if let Some(existing) = get_entry("mc-api-key") {
        return existing;
    }

    let mut bytes = [0u8; 32];
    rand::thread_rng().fill(&mut bytes);
    let key = hex::encode(bytes);

    // Best-effort store; if it fails we still return the generated key
    // so the app can function for this session.
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

/// Check if this is a first run — i.e. no user-configured secrets
/// exist in the keychain yet.
pub fn is_first_run() -> bool {
    USER_KEYS.iter().all(|key| get_entry(key).is_none())
}

// ---------------------------------------------------------------------------
// Tauri commands (exported for the frontend)
// ---------------------------------------------------------------------------

/// Retrieve a single secret from the OS keychain by its keyring key name.
#[tauri::command]
pub fn get_secret(key: String) -> Option<String> {
    get_entry(&key)
}

/// Store a secret in the OS keychain.
#[tauri::command]
pub fn set_secret(key: String, value: String) -> Result<(), String> {
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
