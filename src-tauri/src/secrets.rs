use keyring::Entry;
use rand::Rng;
use std::collections::HashMap;
use std::path::PathBuf;
#[cfg(target_os = "macos")]
use std::process::Command;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    mpsc, OnceLock,
};
use std::time::Duration;

const SERVICE: &str = "com.clawctrl.desktop";
const LEGACY_CLAWCONTROL_SERVICE: &str = "com.clawcontrol.desktop";
const LEGACY_SERVICE: &str = "com.mission-control";
static PROCESS_API_KEY: OnceLock<String> = OnceLock::new();
static KEYRING_DISABLED: AtomicBool = AtomicBool::new(false);

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
    ("jellyfin.url", "JELLYFIN_URL"),
    ("jellyfin.api-key", "JELLYFIN_API_KEY"),
    ("harness.ws", "HARNESS_WS"),
    ("harness.password", "HARNESS_PASSWORD"),
    ("harness.api-url", "HARNESS_API_URL"),
    ("harness.api-key", "HARNESS_API_KEY"),
    ("harness.provider", "HARNESS_PROVIDER"),
    ("harness.dir", "HARNESS_DIR"),
    ("codex-lb.api-url", "CODEX_LB_API_URL"),
    ("codex-lb.dashboard-password", "CODEX_LB_DASHBOARD_PASSWORD"),
    ("hermes.dashboard-url", "HERMES_DASHBOARD_URL"),
    ("hermes.dashboard-api-url", "HERMES_DASHBOARD_API_URL"),
    ("hermes.dashboard-api-key", "HERMES_DASHBOARD_API_KEY"),
    ("hermes.dashboard-password", "HERMES_DASHBOARD_PASSWORD"),
    ("hermes.usage-api-url", "HERMES_USAGE_API_URL"),
    ("hermes.usage-api-key", "HERMES_USAGE_API_KEY"),
    ("hermes.dashboard-token", "HERMES_DASHBOARD_TOKEN"),
    ("hermes.ws", "HERMES_WS"),
    ("hermes.password", "HERMES_PASSWORD"),
    ("hermes.api-url", "HERMES_API_URL"),
    ("hermes.api-key", "HERMES_API_KEY"),
    ("hermes.dir", "HERMES_DIR"),
    ("hermes.discord-bot-token", "DISCORD_BOT_TOKEN"),
    ("hermes.discord-allowed-users", "DISCORD_ALLOWED_USERS"),
    ("hermes.discord-reply-to-mode", "DISCORD_REPLY_TO_MODE"),
    ("hermes.bluebubbles-server-url", "BLUEBUBBLES_SERVER_URL"),
    ("hermes.bluebubbles-password", "BLUEBUBBLES_PASSWORD"),
    (
        "hermes.bluebubbles-allowed-users",
        "BLUEBUBBLES_ALLOWED_USERS",
    ),
    (
        "hermes.bluebubbles-allow-all-users",
        "BLUEBUBBLES_ALLOW_ALL_USERS",
    ),
    ("hermes.gateway-allow-all-users", "GATEWAY_ALLOW_ALL_USERS"),
    ("openclaw.ws", "OPENCLAW_WS"),
    ("openclaw.password", "OPENCLAW_PASSWORD"),
    ("openclaw.api-url", "OPENCLAW_API_URL"),
    ("openclaw.api-key", "OPENCLAW_API_KEY"),
    ("openclaw.dir", "OPENCLAW_DIR"),
    ("sunshine.host", "SUNSHINE_HOST"),
    ("vnc.host", "VNC_HOST"),
    ("agentsecrets.url", "AGENTSECRETS_URL"),
    ("agentsecrets.client-api-key", "AGENTSECRETS_CLIENT_API_KEY"),
    (
        "agentsecrets.approver-api-key",
        "SECRET_BROKER_APPROVER_API_KEY",
    ),
    ("agentmail.url", "AGENTMAIL_URL"),
    ("agentmail.api-key", "AGENTMAIL_API_KEY"),
    ("agentmail.default-address", "AGENTMAIL_DEFAULT_ADDRESS"),
    ("agentmail.default-inbox-id", "AGENTMAIL_DEFAULT_INBOX_ID"),
    ("agentmail.default-label", "AGENTMAIL_DEFAULT_LABEL"),
    ("agentmail.default-provider", "AGENTMAIL_DEFAULT_PROVIDER"),
    ("agentshell.url", "AGENTSHELL_URL"),
    ("mac-bridge.host", "MAC_BRIDGE_HOST"),
    ("mac-bridge.api-key", "MAC_BRIDGE_API_KEY"),
    ("anthropic.api-key", "ANTHROPIC_API_KEY"),
    ("lightrag.base-url", "LIGHTRAG_BASE_URL"),
    ("lightrag.api-key", "LIGHTRAG_API_KEY"),
    ("memd.rag-url", "MEMD_RAG_URL"),
    ("raganything.url", "RAGANYTHING_URL"),
    ("mineru.url", "MINERU_URL"),
    ("rag.url", "RAG_URL"),
    ("sonarr.url", "SONARR_URL"),
    ("sonarr.api-key", "SONARR_API_KEY"),
    ("radarr.url", "RADARR_URL"),
    ("radarr.api-key", "RADARR_API_KEY"),
    ("lidarr.url", "LIDARR_URL"),
    ("lidarr.api-key", "LIDARR_API_KEY"),
    ("prowlarr.url", "PROWLARR_URL"),
    ("prowlarr.api-key", "PROWLARR_API_KEY"),
    ("overseerr.url", "OVERSEERR_URL"),
    ("overseerr.api-key", "OVERSEERR_API_KEY"),
    ("tautulli.url", "TAUTULLI_URL"),
    ("tautulli.api-key", "TAUTULLI_API_KEY"),
    ("bazarr.url", "BAZARR_URL"),
    ("bazarr.api-key", "BAZARR_API_KEY"),
    ("jellyseerr.url", "JELLYSEERR_URL"),
    ("jellyseerr.api-key", "JELLYSEERR_API_KEY"),
    ("jellystat.url", "JELLYSTAT_URL"),
    ("jellystat.api-key", "JELLYSTAT_API_KEY"),
    ("qbittorrent.url", "QBITTORRENT_URL"),
    ("qbittorrent.username", "QBITTORRENT_USERNAME"),
    ("qbittorrent.password", "QBITTORRENT_PASSWORD"),
    ("sabnzbd.url", "SABNZBD_URL"),
    ("sabnzbd.api-key", "SABNZBD_API_KEY"),
    ("nzbget.url", "NZBGET_URL"),
    ("nzbget.username", "NZBGET_USERNAME"),
    ("nzbget.password", "NZBGET_PASSWORD"),
    ("transmission.url", "TRANSMISSION_URL"),
    ("transmission.username", "TRANSMISSION_USERNAME"),
    ("transmission.password", "TRANSMISSION_PASSWORD"),
    ("deluge.url", "DELUGE_URL"),
    ("deluge.password", "DELUGE_PASSWORD"),
    ("unraid.url", "UNRAID_URL"),
    ("unraid.api-key", "UNRAID_API_KEY"),
    ("wizarr.url", "WIZARR_URL"),
    ("wizarr.api-key", "WIZARR_API_KEY"),
    ("kometa.url", "KOMETA_URL"),
    ("flaresolverr.url", "FLARESOLVERR_URL"),
    ("gluetun.url", "GLUETUN_URL"),
    ("lettarrboxd.url", "LETTARRBOXD_URL"),
    ("picard.url", "PICARD_URL"),
    ("koel.url", "KOEL_URL"),
    ("koel.api-key", "KOEL_API_KEY"),
    ("ssh.host", "SSH_HOST"),
    ("ssh.user", "SSH_USER"),
    ("ssh.password", "SSH_PASSWORD"),
    ("ssh.key-path", "SSH_KEY_PATH"),
    ("email.host", "EMAIL_HOST"),
    ("email.port", "EMAIL_PORT"),
    ("email.user", "EMAIL_USER"),
    ("email.password", "EMAIL_PASSWORD"),
    ("email.provider", "EMAIL_PROVIDER"),
    ("email.label", "EMAIL_LABEL"),
    ("ntfy.url", "NTFY_URL"),
    ("ntfy.topic", "NTFY_TOPIC"),
    ("supabase.url", "SUPABASE_URL"),
    ("supabase.anon-key", "SUPABASE_ANON_KEY"),
    ("supabase.service-role-key", "SUPABASE_SERVICE_ROLE_KEY"),
    (
        "gotrue.external-google-enabled",
        "GOTRUE_EXTERNAL_GOOGLE_ENABLED",
    ),
    (
        "gotrue.external-github-enabled",
        "GOTRUE_EXTERNAL_GITHUB_ENABLED",
    ),
    ("backend.public-base-url", "BACKEND_PUBLIC_BASE_URL"),
    ("backend.device-api-key", "BACKEND_DEVICE_API_KEY"),
    ("pairing.token", "PAIRING_TOKEN"),
    ("couchdb.url", "COUCHDB_URL"),
    ("couchdb.user", "COUCHDB_USER"),
    ("couchdb.password", "COUCHDB_PASSWORD"),
    ("couchdb.database", "COUCHDB_DATABASE"),
    ("couchdb.custom-headers", "COUCHDB_CUSTOM_HEADERS"),
    ("mc-bind.host", "MC_BIND_HOST"),
    ("mc-bind.port", "MC_BIND_PORT"),
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
    "jellyfin.url",
    "jellyfin.api-key",
    "harness.ws",
    "harness.password",
    "harness.api-url",
    "harness.api-key",
    "harness.provider",
    "harness.dir",
    "codex-lb.api-url",
    "codex-lb.dashboard-password",
    "hermes.dashboard-url",
    "hermes.dashboard-api-url",
    "hermes.dashboard-api-key",
    "hermes.dashboard-password",
    "hermes.usage-api-url",
    "hermes.usage-api-key",
    "hermes.dashboard-token",
    "hermes.ws",
    "hermes.password",
    "hermes.api-url",
    "hermes.api-key",
    "hermes.dir",
    "hermes.discord-bot-token",
    "hermes.discord-allowed-users",
    "hermes.discord-reply-to-mode",
    "hermes.bluebubbles-server-url",
    "hermes.bluebubbles-password",
    "hermes.bluebubbles-allowed-users",
    "hermes.bluebubbles-allow-all-users",
    "hermes.gateway-allow-all-users",
    "openclaw.ws",
    "openclaw.password",
    "openclaw.api-url",
    "openclaw.api-key",
    "openclaw.dir",
    "sunshine.host",
    "vnc.host",
    "agentsecrets.url",
    "agentsecrets.client-api-key",
    "agentsecrets.approver-api-key",
    "agentmail.url",
    "agentmail.api-key",
    "agentmail.default-address",
    "agentmail.default-inbox-id",
    "agentmail.default-label",
    "agentmail.default-provider",
    "agentshell.url",
    "mac-bridge.host",
    "mac-bridge.api-key",
    "anthropic.api-key",
    "lightrag.base-url",
    "lightrag.api-key",
    "memd.rag-url",
    "raganything.url",
    "mineru.url",
    "rag.url",
    "sonarr.url",
    "sonarr.api-key",
    "radarr.url",
    "radarr.api-key",
    "lidarr.url",
    "lidarr.api-key",
    "prowlarr.url",
    "prowlarr.api-key",
    "overseerr.url",
    "overseerr.api-key",
    "tautulli.url",
    "tautulli.api-key",
    "bazarr.url",
    "bazarr.api-key",
    "jellyseerr.url",
    "jellyseerr.api-key",
    "jellystat.url",
    "jellystat.api-key",
    "qbittorrent.url",
    "qbittorrent.username",
    "qbittorrent.password",
    "sabnzbd.url",
    "sabnzbd.api-key",
    "nzbget.url",
    "nzbget.username",
    "nzbget.password",
    "transmission.url",
    "transmission.username",
    "transmission.password",
    "deluge.url",
    "deluge.password",
    "unraid.url",
    "unraid.api-key",
    "wizarr.url",
    "wizarr.api-key",
    "kometa.url",
    "flaresolverr.url",
    "gluetun.url",
    "lettarrboxd.url",
    "picard.url",
    "koel.url",
    "koel.api-key",
    "ssh.host",
    "ssh.user",
    "ssh.password",
    "ssh.key-path",
    "email.host",
    "email.port",
    "email.user",
    "email.password",
    "email.provider",
    "email.label",
    "ntfy.url",
    "ntfy.topic",
    "supabase.url",
    "supabase.anon-key",
    "supabase.service-role-key",
    "backend.public-base-url",
    "backend.device-api-key",
    "couchdb.url",
    "couchdb.user",
    "couchdb.password",
    "couchdb.database",
    "couchdb.custom-headers",
    "mc-bind.host",
    "mc-bind.port",
    "mc-agent.key",
];

#[cfg(target_os = "macos")]
fn get_entry_raw_security(service: &str, key: &str) -> Option<String> {
    let output = Command::new("security")
        .args(["find-generic-password", "-s", service, "-a", key, "-w"])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let mut value = String::from_utf8(output.stdout).ok()?;
    while value.ends_with('\n') || value.ends_with('\r') {
        value.pop();
    }
    if value.is_empty() {
        None
    } else {
        Some(value)
    }
}

#[cfg(target_os = "macos")]
fn get_entry_raw(key: &str) -> Option<String> {
    get_entry_raw_security(SERVICE, key)
        .or_else(|| get_entry_raw_security(LEGACY_CLAWCONTROL_SERVICE, key))
        .or_else(|| get_entry_raw_security(LEGACY_SERVICE, key))
        .or_else(|| {
            Entry::new(SERVICE, key)
                .ok()
                .and_then(|entry| entry.get_password().ok())
        })
        .or_else(|| {
            Entry::new(LEGACY_CLAWCONTROL_SERVICE, key)
                .ok()
                .and_then(|entry| entry.get_password().ok())
        })
        .or_else(|| {
            Entry::new(LEGACY_SERVICE, key)
                .ok()
                .and_then(|entry| entry.get_password().ok())
        })
}

#[cfg(not(target_os = "macos"))]
fn get_entry_raw(key: &str) -> Option<String> {
    Entry::new(SERVICE, key)
        .ok()
        .and_then(|entry| entry.get_password().ok())
        .or_else(|| {
            Entry::new(LEGACY_CLAWCONTROL_SERVICE, key)
                .ok()
                .and_then(|entry| entry.get_password().ok())
        })
        .or_else(|| {
            Entry::new(LEGACY_SERVICE, key)
                .ok()
                .and_then(|entry| entry.get_password().ok())
        })
}

fn set_entry_raw(key: &str, value: &str) -> Result<(), String> {
    Entry::new(SERVICE, key)
        .map_err(|e| e.to_string())?
        .set_password(value)
        .map_err(|e| e.to_string())
}

fn get_entry(key: &str) -> Option<String> {
    if KEYRING_DISABLED.load(Ordering::Relaxed) {
        return None;
    }

    let key = key.to_string();
    let (tx, rx) = mpsc::channel();
    let _ = std::thread::Builder::new()
        .name("keyring-get".into())
        .spawn(move || {
            let _ = tx.send(get_entry_raw(&key));
        });

    match rx.recv_timeout(Duration::from_secs(2)) {
        Ok(value) => value,
        Err(_) => {
            KEYRING_DISABLED.store(true, Ordering::Relaxed);
            tracing::warn!("OS keychain lookup timed out; using env/.env.local secrets only");
            None
        }
    }
}

pub(crate) fn get_internal_entry(key: &str) -> Option<String> {
    get_entry(key)
}

pub(crate) fn set_entry(key: &str, value: &str) -> Result<(), String> {
    if KEYRING_DISABLED.load(Ordering::Relaxed) {
        return Err("OS keychain is disabled after a timeout".into());
    }

    let key = key.to_string();
    let value = value.to_string();
    let (tx, rx) = mpsc::channel();
    let _ = std::thread::Builder::new()
        .name("keyring-set".into())
        .spawn(move || {
            let _ = tx.send(set_entry_raw(&key, &value));
        });

    match rx.recv_timeout(Duration::from_secs(2)) {
        Ok(result) => result,
        Err(_) => {
            // A write can block while macOS is prompting or syncing Keychain.
            // Do not disable reads for the whole process: startup still needs
            // persisted user secrets such as Supabase/email credentials.
            tracing::warn!("OS keychain save timed out; secret write skipped");
            Err("OS keychain save timed out".into())
        }
    }
}

/// Generate a fresh MC_API_KEY on every app start.
///
/// The key is regenerated each launch and kept in-process. This limits the
/// window of exposure if a key is ever leaked, and avoids blocking startup on
/// macOS Keychain writes before persisted user secrets are loaded.
fn ensure_api_key() -> String {
    PROCESS_API_KEY
        .get_or_init(|| {
            let mut bytes = [0u8; 32];
            rand::thread_rng().fill(&mut bytes);
            let key = hex::encode(bytes);

            key
        })
        .clone()
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

fn load_env_file(path: PathBuf) -> Option<Vec<(String, String)>> {
    let display_path = path.display().to_string();
    let (tx, rx) = mpsc::channel();
    let _ = std::thread::Builder::new()
        .name("dotenv-load".into())
        .spawn(move || {
            let values = dotenvy::from_path_iter(&path)
                .ok()
                .map(|iter| iter.flatten().collect::<Vec<_>>());
            let _ = tx.send(values);
        });

    match rx.recv_timeout(Duration::from_secs(2)) {
        Ok(values) => values,
        Err(_) => {
            tracing::warn!(
                "Timed out reading dev secrets from {}; continuing without it",
                display_path
            );
            None
        }
    }
}

/// Load secrets from the OS keychain, then merge in any `.env.local`
/// values as a dev-mode fallback. Returns the merged `HashMap` without
/// ever calling `std::env::set_var`, so secrets stay out of
/// `/proc/PID/environ`.
pub fn load_secrets() -> HashMap<String, String> {
    let mut secrets = load_env_vars();
    let known = known_secret_keys();

    for (key, value) in std::env::vars() {
        if known.contains(key.as_str()) && !value.trim().is_empty() {
            secrets.insert(key, value);
        }
    }

    // Load .env.local as a dev-mode fallback.
    // Only merge keys that correspond to known secrets and that the
    // keychain didn't already provide (keychain takes precedence).
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let paths = [
        manifest_dir.join(".env.local"),
        manifest_dir.join("../.env.local"),
    ];
    for path in &paths {
        if !path.is_file() {
            continue;
        }
        if let Some(values) = load_env_file(path.clone()) {
            tracing::info!("Merging dev secrets from {}", path.display());
            for (key, value) in values {
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
    let loaded = load_secrets();

    !USER_KEYS.iter().any(|key| {
        KEY_ENV_MAP
            .iter()
            .find(|&&(keyring_key, _)| keyring_key == *key)
            .and_then(|&(_, env_name)| loaded.get(env_name))
            .is_some_and(|value| !value.trim().is_empty())
    })
}

// ---------------------------------------------------------------------------
// Tauri commands (exported for the frontend)
// ---------------------------------------------------------------------------

/// Check if a key is in the allowed set (KEY_ENV_MAP keys + USER_KEYS).
pub(crate) fn is_allowed_key(key: &str) -> bool {
    KEY_ENV_MAP.iter().any(|&(k, _)| k == key) || USER_KEYS.contains(&key)
}

/// Keys that must never be returned to the frontend via IPC.
/// The frontend only needs non-secret identifiers such as API base URLs.
const FRONTEND_BLOCKED_KEYS: &[&str] = &[
    "supabase.service-role-key",
    "supabase.anon-key",
    "anthropic.api-key",
    "bluebubbles.password",
    "harness.password",
    "harness.api-key",
    "harness.ws",
    "codex-lb.api-url",
    "codex-lb.dashboard-password",
    "hermes.dashboard-url",
    "hermes.dashboard-api-url",
    "hermes.dashboard-api-key",
    "hermes.dashboard-password",
    "hermes.usage-api-url",
    "hermes.usage-api-key",
    "hermes.dashboard-token",
    "hermes.password",
    "hermes.api-key",
    "hermes.ws",
    "hermes.discord-bot-token",
    "hermes.bluebubbles-password",
    "openclaw.password",
    "openclaw.api-key",
    "openclaw.ws",
    "agentsecrets.client-api-key",
    "agentsecrets.approver-api-key",
    "agentmail.api-key",
    "proxmox.host",
    "proxmox.token-id",
    "proxmox.token-secret",
    "opnsense.host",
    "opnsense.key",
    "opnsense.secret",
    "plex.token",
    "jellyfin.api-key",
    "sonarr.api-key",
    "radarr.api-key",
    "lidarr.api-key",
    "prowlarr.api-key",
    "overseerr.api-key",
    "tautulli.api-key",
    "bazarr.api-key",
    "jellyseerr.api-key",
    "jellystat.api-key",
    "qbittorrent.username",
    "qbittorrent.password",
    "sabnzbd.api-key",
    "nzbget.username",
    "nzbget.password",
    "transmission.username",
    "transmission.password",
    "deluge.password",
    "unraid.api-key",
    "wizarr.api-key",
    "koel.api-key",
    "ssh.password",
    "ssh.key-path",
    "email.host",
    "email.port",
    "email.user",
    "email.password",
    "email.provider",
    "email.label",
    "caldav.url",
    "caldav.username",
    "caldav.password",
    "mac-bridge.host",
    "mac-bridge.api-key",
    "lightrag.api-key",
    "ntfy.url",
    "ntfy.topic",
    "mc-agent.key",
    "couchdb.url",
    "couchdb.user",
    "couchdb.password",
    "couchdb.database",
    "couchdb.custom-headers",
];

/// Keys that the frontend is allowed to write (allowlist).
/// Only keys needed by the onboarding wizard and Settings UI are included.
const FRONTEND_WRITABLE_KEYS: &[&str] = &[
    "backend.public-base-url",
    "backend.device-api-key",
    "bluebubbles.host",
    "bluebubbles.password",
    "harness.api-url",
    "harness.api-key",
    "harness.ws",
    "harness.password",
    "harness.provider",
    "codex-lb.api-url",
    "codex-lb.dashboard-password",
    "hermes.dashboard-url",
    "hermes.dashboard-api-url",
    "hermes.dashboard-api-key",
    "hermes.dashboard-password",
    "hermes.usage-api-url",
    "hermes.usage-api-key",
    "hermes.dashboard-token",
    "hermes.api-url",
    "hermes.api-key",
    "hermes.ws",
    "hermes.password",
    "hermes.discord-bot-token",
    "hermes.discord-allowed-users",
    "hermes.discord-reply-to-mode",
    "hermes.bluebubbles-server-url",
    "hermes.bluebubbles-password",
    "hermes.bluebubbles-allowed-users",
    "hermes.bluebubbles-allow-all-users",
    "hermes.gateway-allow-all-users",
    "openclaw.api-url",
    "openclaw.api-key",
    "openclaw.ws",
    "openclaw.password",
    "sunshine.host",
    "agentsecrets.url",
    "agentsecrets.client-api-key",
    "agentsecrets.approver-api-key",
    "agentshell.url",
    "proxmox.host",
    "proxmox.token-id",
    "proxmox.token-secret",
    "opnsense.host",
    "opnsense.key",
    "opnsense.secret",
    "plex.url",
    "plex.token",
    "jellyfin.url",
    "jellyfin.api-key",
    "sonarr.url",
    "sonarr.api-key",
    "radarr.url",
    "radarr.api-key",
    "lidarr.url",
    "lidarr.api-key",
    "prowlarr.url",
    "prowlarr.api-key",
    "overseerr.url",
    "overseerr.api-key",
    "tautulli.url",
    "tautulli.api-key",
    "bazarr.url",
    "bazarr.api-key",
    "jellyseerr.url",
    "jellyseerr.api-key",
    "jellystat.url",
    "jellystat.api-key",
    "qbittorrent.url",
    "qbittorrent.username",
    "qbittorrent.password",
    "sabnzbd.url",
    "sabnzbd.api-key",
    "nzbget.url",
    "nzbget.username",
    "nzbget.password",
    "transmission.url",
    "transmission.username",
    "transmission.password",
    "deluge.url",
    "deluge.password",
    "unraid.url",
    "unraid.api-key",
    "wizarr.url",
    "wizarr.api-key",
    "kometa.url",
    "flaresolverr.url",
    "gluetun.url",
    "lettarrboxd.url",
    "picard.url",
    "koel.url",
    "koel.api-key",
    "ssh.host",
    "ssh.user",
    "ssh.password",
    "ssh.key-path",
    "email.host",
    "email.port",
    "email.user",
    "email.password",
    "email.provider",
    "email.label",
    "caldav.url",
    "caldav.username",
    "caldav.password",
    "ntfy.url",
    "ntfy.topic",
    "mac-bridge.host",
    "mac-bridge.api-key",
    "anthropic.api-key",
    "lightrag.base-url",
    "lightrag.api-key",
    "memd.rag-url",
    "raganything.url",
    "mineru.url",
    "rag.url",
    "couchdb.url",
    "couchdb.user",
    "couchdb.password",
    "couchdb.database",
    "couchdb.custom-headers",
    "supabase.url",
    "supabase.anon-key",
    "mc-bind.host",
    "mc-bind.port",
    "mc-agent.key",
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
    if key == "mc-api-key" {
        return Some(ensure_api_key());
    }
    if FRONTEND_BLOCKED_KEYS.contains(&key.as_str()) {
        return None;
    }
    if let Some(value) = get_entry(&key) {
        return Some(value);
    }
    let env_name = KEY_ENV_MAP
        .iter()
        .find_map(|(keyring_key, env_name)| (*keyring_key == key).then_some(*env_name))?;
    load_secrets().get(env_name).cloned()
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
    let loaded = load_secrets();
    let has_secret = |env_name: &str| {
        loaded
            .get(env_name)
            .is_some_and(|value| !value.trim().is_empty())
    };

    modules.insert("messages".to_string(), has_secret("BLUEBUBBLES_HOST"));
    modules.insert("calendar".to_string(), has_secret("CALDAV_URL"));
    modules.insert(
        "homelab".to_string(),
        has_secret("PROXMOX_HOST") || has_secret("OPNSENSE_HOST"),
    );
    modules.insert(
        "media".to_string(),
        has_secret("PLEX_URL")
            || has_secret("SONARR_URL")
            || has_secret("RADARR_URL")
            || has_secret("LIDARR_URL")
            || has_secret("PROWLARR_URL")
            || has_secret("OVERSEERR_URL")
            || has_secret("JELLYSEERR_URL")
            || has_secret("TAUTULLI_URL")
            || has_secret("BAZARR_URL")
            || has_secret("JELLYSTAT_URL")
            || has_secret("QBITTORRENT_URL")
            || has_secret("SABNZBD_URL")
            || has_secret("NZBGET_URL")
            || has_secret("TRANSMISSION_URL")
            || has_secret("DELUGE_URL")
            || has_secret("UNRAID_URL")
            || has_secret("WIZARR_URL"),
    );
    modules.insert("email".to_string(), has_secret("EMAIL_HOST"));
    modules.insert(
        "chat".to_string(),
        has_secret("HARNESS_WS") || has_secret("HERMES_WS") || has_secret("OPENCLAW_WS"),
    );
    modules.insert("agents".to_string(), has_secret("ANTHROPIC_API_KEY"));

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
