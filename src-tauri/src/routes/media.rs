use axum::{
    extract::{Path, Query, State},
    routing::{delete, get, post, put},
    Json, Router,
};
use futures::future::join_all;
use reqwest::header::{COOKIE, SET_COOKIE};
use reqwest::Method;
use serde::{Deserialize, Deserializer, Serialize};
use serde_json::{json, Map, Value};
use std::collections::HashMap;
use std::path::PathBuf;
use std::time::Duration;
use tokio::process::Command;

use crate::error::AppError;
use crate::routes::homelab;
use crate::server::{AppState, RequireAuth};

// ── Config helpers ──────────────────────────────────────────────────────────

fn parse_u64_loose(raw: &str) -> Option<u64> {
    raw.trim().parse::<u64>().ok()
}

fn value_as_u64(value: &Value) -> Option<u64> {
    match value {
        Value::Number(number) => number
            .as_u64()
            .or_else(|| number.as_f64().map(|n| n as u64)),
        Value::String(raw) => parse_u64_loose(raw),
        _ => None,
    }
}

fn deserialize_optional_u64_loose<'de, D>(deserializer: D) -> Result<Option<u64>, D::Error>
where
    D: Deserializer<'de>,
{
    let value = Option::<Value>::deserialize(deserializer)?;
    Ok(value.as_ref().and_then(value_as_u64))
}

struct PlexConfig {
    url: String,
    token: String,
}

struct SonarrConfig {
    url: String,
    api_key: String,
}

struct RadarrConfig {
    url: String,
    api_key: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ArrKind {
    Sonarr,
    Radarr,
    Lidarr,
    Prowlarr,
}

#[derive(Debug, Clone)]
struct ArrConfig {
    id: &'static str,
    name: &'static str,
    kind: ArrKind,
    api_version: &'static str,
    url: String,
    api_key: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum EcosystemKind {
    Jellyfin,
    Emby,
    Overseerr,
    Jellyseerr,
    Tautulli,
    Bazarr,
    Jellystat,
    Qbittorrent,
    Sabnzbd,
    Nzbget,
    Transmission,
    Deluge,
    Unraid,
    Wizarr,
}

#[derive(Debug, Clone)]
struct EcosystemConfig {
    id: &'static str,
    name: &'static str,
    kind: EcosystemKind,
    url: String,
    api_key: Option<String>,
    username: Option<String>,
    password: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
enum MediaServiceState {
    Online,
    Degraded,
    Offline,
    Configured,
    DetectedMissingCredentials,
    DetectedNoDirectUi,
    DetectedUnpublishedPort,
    NotDetected,
}

#[derive(Debug, Clone, Copy)]
struct MediaServiceDefinition {
    id: &'static str,
    name: &'static str,
    group: &'static str,
    kind: &'static str,
    default_port: Option<u16>,
    url_env: Option<&'static str>,
    required_envs: &'static [&'static str],
    credential_keys: &'static [&'static str],
    actions: &'static [&'static str],
    docker_hints: &'static [&'static str],
}

#[derive(Debug, Clone)]
struct MediaDockerDetection {
    container: String,
    image: String,
    state: String,
    status: String,
    ports: String,
    endpoint_id: Option<i64>,
    endpoint_name: Option<String>,
    host: Option<String>,
    source: String,
}

const ACTIONS_STREAMING: &[&str] = &["health", "streams"];
const ACTIONS_ARR: &[&str] = &[
    "health",
    "search",
    "add",
    "refresh",
    "missing-search",
    "rss-sync",
];
const ACTIONS_PROWLARR: &[&str] = &["health", "indexers", "application-sync"];
const ACTIONS_REQUESTS: &[&str] = &["health", "approve", "decline"];
const ACTIONS_ANALYTICS: &[&str] = &["health", "streams", "history"];
const ACTIONS_SUBTITLES: &[&str] = &["health", "wanted"];
const ACTIONS_USENET_DOWNLOADS: &[&str] = &["health", "pause", "resume", "remove"];
const ACTIONS_TORRENT_DOWNLOADS: &[&str] = &["health", "pause", "resume", "remove", "recheck"];
const ACTIONS_QBITTORRENT: &[&str] = &[
    "health",
    "pause",
    "resume",
    "remove",
    "recheck",
    "set-category",
    "add-tags",
];
const ACTIONS_SERVER: &[&str] = &["health", "open"];
const ACTIONS_INVITES: &[&str] = &["health", "invites"];
const ACTIONS_DISCOVERED: &[&str] = &["open", "setup"];
const ACTIONS_MONITORING: &[&str] = &["health", "open"];
const ACTIONS_SSH: &[&str] = &["terminal", "sftp", "setup"];
const MEDIA_HTTP_TIMEOUT: Duration = Duration::from_secs(12);
const REQUEST_DISCOVERY_PROVIDERS: &[(&str, &str)] = &[
    ("8", "Netflix"),
    ("9", "Prime Video"),
    ("15", "Hulu"),
    ("337", "Disney+"),
    ("350", "Apple TV+"),
    ("531", "Paramount+"),
    ("386", "Peacock"),
    ("1899", "Max"),
];

const MEDIA_SERVICE_REGISTRY: &[MediaServiceDefinition] = &[
    MediaServiceDefinition {
        id: "plex",
        name: "Plex",
        group: "streaming",
        kind: "streaming",
        default_port: Some(32400),
        url_env: Some("PLEX_URL"),
        required_envs: &["PLEX_URL", "PLEX_TOKEN"],
        credential_keys: &["plex.url", "plex.token"],
        actions: ACTIONS_STREAMING,
        docker_hints: &["plex", "plexinc"],
    },
    MediaServiceDefinition {
        id: "jellyfin",
        name: "Jellyfin",
        group: "streaming",
        kind: "streaming",
        default_port: Some(8096),
        url_env: Some("JELLYFIN_URL"),
        required_envs: &["JELLYFIN_URL"],
        credential_keys: &["jellyfin.url", "jellyfin.api-key"],
        actions: ACTIONS_DISCOVERED,
        docker_hints: &["jellyfin"],
    },
    MediaServiceDefinition {
        id: "emby",
        name: "Emby",
        group: "streaming",
        kind: "streaming",
        default_port: Some(8096),
        url_env: Some("EMBY_URL"),
        required_envs: &["EMBY_URL"],
        credential_keys: &["emby.url", "emby.api-key"],
        actions: ACTIONS_DISCOVERED,
        docker_hints: &["emby"],
    },
    MediaServiceDefinition {
        id: "sonarr",
        name: "Sonarr",
        group: "arr",
        kind: "series",
        default_port: Some(8989),
        url_env: Some("SONARR_URL"),
        required_envs: &["SONARR_URL", "SONARR_API_KEY"],
        credential_keys: &["sonarr.url", "sonarr.api-key"],
        actions: ACTIONS_ARR,
        docker_hints: &["sonarr"],
    },
    MediaServiceDefinition {
        id: "radarr",
        name: "Radarr",
        group: "arr",
        kind: "movie",
        default_port: Some(7878),
        url_env: Some("RADARR_URL"),
        required_envs: &["RADARR_URL", "RADARR_API_KEY"],
        credential_keys: &["radarr.url", "radarr.api-key"],
        actions: ACTIONS_ARR,
        docker_hints: &["radarr"],
    },
    MediaServiceDefinition {
        id: "lidarr",
        name: "Lidarr",
        group: "arr",
        kind: "music",
        default_port: Some(8686),
        url_env: Some("LIDARR_URL"),
        required_envs: &["LIDARR_URL", "LIDARR_API_KEY"],
        credential_keys: &["lidarr.url", "lidarr.api-key"],
        actions: ACTIONS_ARR,
        docker_hints: &["lidarr"],
    },
    MediaServiceDefinition {
        id: "readarr",
        name: "Readarr",
        group: "arr",
        kind: "books",
        default_port: Some(8787),
        url_env: Some("READARR_URL"),
        required_envs: &["READARR_URL", "READARR_API_KEY"],
        credential_keys: &["readarr.url", "readarr.api-key"],
        actions: ACTIONS_DISCOVERED,
        docker_hints: &["readarr"],
    },
    MediaServiceDefinition {
        id: "whisparr",
        name: "Whisparr",
        group: "arr",
        kind: "adult",
        default_port: Some(6969),
        url_env: Some("WHISPARR_URL"),
        required_envs: &["WHISPARR_URL", "WHISPARR_API_KEY"],
        credential_keys: &["whisparr.url", "whisparr.api-key"],
        actions: ACTIONS_DISCOVERED,
        docker_hints: &["whisparr"],
    },
    MediaServiceDefinition {
        id: "mylar",
        name: "Mylar",
        group: "arr",
        kind: "comics",
        default_port: Some(8090),
        url_env: Some("MYLAR_URL"),
        required_envs: &["MYLAR_URL", "MYLAR_API_KEY"],
        credential_keys: &["mylar.url", "mylar.api-key"],
        actions: ACTIONS_DISCOVERED,
        docker_hints: &["mylar", "mylar3"],
    },
    MediaServiceDefinition {
        id: "prowlarr",
        name: "Prowlarr",
        group: "indexers",
        kind: "indexer",
        default_port: Some(9696),
        url_env: Some("PROWLARR_URL"),
        required_envs: &["PROWLARR_URL", "PROWLARR_API_KEY"],
        credential_keys: &["prowlarr.url", "prowlarr.api-key"],
        actions: ACTIONS_PROWLARR,
        docker_hints: &["prowlarr"],
    },
    MediaServiceDefinition {
        id: "bazarr",
        name: "Bazarr",
        group: "subtitles",
        kind: "subtitles",
        default_port: Some(6767),
        url_env: Some("BAZARR_URL"),
        required_envs: &["BAZARR_URL", "BAZARR_API_KEY"],
        credential_keys: &["bazarr.url", "bazarr.api-key"],
        actions: ACTIONS_SUBTITLES,
        docker_hints: &["bazarr"],
    },
    MediaServiceDefinition {
        id: "overseerr",
        name: "Overseerr",
        group: "requests",
        kind: "requests",
        default_port: Some(5055),
        url_env: Some("OVERSEERR_URL"),
        required_envs: &["OVERSEERR_URL", "OVERSEERR_API_KEY"],
        credential_keys: &["overseerr.url", "overseerr.api-key"],
        actions: ACTIONS_REQUESTS,
        docker_hints: &["overseerr"],
    },
    MediaServiceDefinition {
        id: "jellyseerr",
        name: "Jellyseerr",
        group: "requests",
        kind: "requests",
        default_port: Some(5055),
        url_env: Some("JELLYSEERR_URL"),
        required_envs: &["JELLYSEERR_URL", "JELLYSEERR_API_KEY"],
        credential_keys: &["jellyseerr.url", "jellyseerr.api-key"],
        actions: ACTIONS_REQUESTS,
        docker_hints: &["jellyseerr"],
    },
    MediaServiceDefinition {
        id: "tautulli",
        name: "Tautulli",
        group: "analytics",
        kind: "analytics",
        default_port: Some(8181),
        url_env: Some("TAUTULLI_URL"),
        required_envs: &["TAUTULLI_URL", "TAUTULLI_API_KEY"],
        credential_keys: &["tautulli.url", "tautulli.api-key"],
        actions: ACTIONS_ANALYTICS,
        docker_hints: &["tautulli"],
    },
    MediaServiceDefinition {
        id: "jellystat",
        name: "Jellystat",
        group: "analytics",
        kind: "analytics",
        default_port: Some(3000),
        url_env: Some("JELLYSTAT_URL"),
        required_envs: &["JELLYSTAT_URL"],
        credential_keys: &["jellystat.url", "jellystat.api-key"],
        actions: ACTIONS_ANALYTICS,
        docker_hints: &["jellystat"],
    },
    MediaServiceDefinition {
        id: "qbittorrent",
        name: "qBittorrent",
        group: "downloads",
        kind: "downloads",
        default_port: Some(8080),
        url_env: Some("QBITTORRENT_URL"),
        required_envs: &["QBITTORRENT_URL"],
        credential_keys: &[
            "qbittorrent.url",
            "qbittorrent.username",
            "qbittorrent.password",
        ],
        actions: ACTIONS_QBITTORRENT,
        docker_hints: &["qbittorrent", "qbittorrent-nox"],
    },
    MediaServiceDefinition {
        id: "sabnzbd",
        name: "SABnzbd",
        group: "downloads",
        kind: "downloads",
        default_port: Some(8080),
        url_env: Some("SABNZBD_URL"),
        required_envs: &["SABNZBD_URL", "SABNZBD_API_KEY"],
        credential_keys: &["sabnzbd.url", "sabnzbd.api-key"],
        actions: ACTIONS_USENET_DOWNLOADS,
        docker_hints: &["sabnzbd", "sab"],
    },
    MediaServiceDefinition {
        id: "nzbget",
        name: "NZBGet",
        group: "downloads",
        kind: "downloads",
        default_port: Some(6789),
        url_env: Some("NZBGET_URL"),
        required_envs: &["NZBGET_URL"],
        credential_keys: &["nzbget.url", "nzbget.username", "nzbget.password"],
        actions: ACTIONS_USENET_DOWNLOADS,
        docker_hints: &["nzbget"],
    },
    MediaServiceDefinition {
        id: "transmission",
        name: "Transmission",
        group: "downloads",
        kind: "downloads",
        default_port: Some(9091),
        url_env: Some("TRANSMISSION_URL"),
        required_envs: &["TRANSMISSION_URL"],
        credential_keys: &[
            "transmission.url",
            "transmission.username",
            "transmission.password",
        ],
        actions: ACTIONS_TORRENT_DOWNLOADS,
        docker_hints: &["transmission"],
    },
    MediaServiceDefinition {
        id: "deluge",
        name: "Deluge",
        group: "downloads",
        kind: "downloads",
        default_port: Some(8112),
        url_env: Some("DELUGE_URL"),
        required_envs: &["DELUGE_URL"],
        credential_keys: &["deluge.url", "deluge.password"],
        actions: ACTIONS_TORRENT_DOWNLOADS,
        docker_hints: &["deluge"],
    },
    MediaServiceDefinition {
        id: "unraid",
        name: "Unraid",
        group: "server",
        kind: "server",
        default_port: Some(80),
        url_env: Some("UNRAID_URL"),
        required_envs: &["UNRAID_URL"],
        credential_keys: &["unraid.url", "unraid.api-key"],
        actions: ACTIONS_SERVER,
        docker_hints: &["unraid"],
    },
    MediaServiceDefinition {
        id: "portainer",
        name: "Portainer",
        group: "server",
        kind: "control",
        default_port: Some(9443),
        url_env: None,
        required_envs: &["PORTAINER_INSTANCES"],
        credential_keys: &["portainer.instances"],
        actions: ACTIONS_SERVER,
        docker_hints: &["portainer"],
    },
    MediaServiceDefinition {
        id: "grafana",
        name: "Grafana",
        group: "monitoring",
        kind: "dashboard",
        default_port: Some(3000),
        url_env: Some("GRAFANA_URL"),
        required_envs: &["GRAFANA_URL"],
        credential_keys: &["grafana.url", "grafana.api-key"],
        actions: ACTIONS_MONITORING,
        docker_hints: &["grafana"],
    },
    MediaServiceDefinition {
        id: "prometheus",
        name: "Prometheus",
        group: "monitoring",
        kind: "metrics",
        default_port: Some(9090),
        url_env: Some("PROMETHEUS_URL"),
        required_envs: &["PROMETHEUS_URL"],
        credential_keys: &["prometheus.url"],
        actions: ACTIONS_MONITORING,
        docker_hints: &["prometheus"],
    },
    MediaServiceDefinition {
        id: "loki",
        name: "Loki",
        group: "monitoring",
        kind: "logs",
        default_port: Some(3100),
        url_env: Some("LOKI_URL"),
        required_envs: &["LOKI_URL"],
        credential_keys: &["loki.url"],
        actions: ACTIONS_MONITORING,
        docker_hints: &["loki"],
    },
    MediaServiceDefinition {
        id: "alloy",
        name: "Grafana Alloy",
        group: "monitoring",
        kind: "agent",
        default_port: Some(12345),
        url_env: Some("ALLOY_URL"),
        required_envs: &["ALLOY_URL"],
        credential_keys: &["alloy.url"],
        actions: ACTIONS_MONITORING,
        docker_hints: &["alloy"],
    },
    MediaServiceDefinition {
        id: "cloudflared",
        name: "Cloudflared",
        group: "network",
        kind: "tunnel",
        default_port: None,
        url_env: Some("CLOUDFLARED_URL"),
        required_envs: &["CLOUDFLARED_URL"],
        credential_keys: &["cloudflared.url"],
        actions: ACTIONS_DISCOVERED,
        docker_hints: &["cloudflared"],
    },
    MediaServiceDefinition {
        id: "crowdsec",
        name: "CrowdSec",
        group: "security",
        kind: "security",
        default_port: Some(8080),
        url_env: Some("CROWDSEC_URL"),
        required_envs: &["CROWDSEC_URL"],
        credential_keys: &["crowdsec.url"],
        actions: ACTIONS_DISCOVERED,
        docker_hints: &["crowdsec"],
    },
    MediaServiceDefinition {
        id: "pelican",
        name: "Pelican",
        group: "server",
        kind: "panel",
        default_port: Some(80),
        url_env: Some("PELICAN_URL"),
        required_envs: &["PELICAN_URL"],
        credential_keys: &["pelican.url", "pelican.api-key"],
        actions: ACTIONS_DISCOVERED,
        docker_hints: &["pelican"],
    },
    MediaServiceDefinition {
        id: "vaultwarden",
        name: "Vaultwarden",
        group: "secrets",
        kind: "passwords",
        default_port: Some(80),
        url_env: Some("VAULTWARDEN_URL"),
        required_envs: &["VAULTWARDEN_URL"],
        credential_keys: &["vaultwarden.url"],
        actions: ACTIONS_DISCOVERED,
        docker_hints: &["vaultwarden"],
    },
    MediaServiceDefinition {
        id: "wizarr",
        name: "Wizarr",
        group: "invites",
        kind: "invites",
        default_port: Some(5690),
        url_env: Some("WIZARR_URL"),
        required_envs: &["WIZARR_URL"],
        credential_keys: &["wizarr.url", "wizarr.api-key"],
        actions: ACTIONS_INVITES,
        docker_hints: &["wizarr"],
    },
    MediaServiceDefinition {
        id: "autobrr",
        name: "autobrr",
        group: "automation",
        kind: "automation",
        default_port: Some(7474),
        url_env: Some("AUTOBRR_URL"),
        required_envs: &["AUTOBRR_URL"],
        credential_keys: &["autobrr.url", "autobrr.api-key"],
        actions: ACTIONS_DISCOVERED,
        docker_hints: &["autobrr"],
    },
    MediaServiceDefinition {
        id: "recyclarr",
        name: "Recyclarr",
        group: "automation",
        kind: "automation",
        default_port: None,
        url_env: Some("RECYCLARR_URL"),
        required_envs: &["RECYCLARR_URL"],
        credential_keys: &["recyclarr.url", "recyclarr.api-key"],
        actions: ACTIONS_DISCOVERED,
        docker_hints: &["recyclarr"],
    },
    MediaServiceDefinition {
        id: "kometa",
        name: "Kometa",
        group: "automation",
        kind: "metadata",
        default_port: None,
        url_env: Some("KOMETA_URL"),
        required_envs: &["KOMETA_URL"],
        credential_keys: &["kometa.url", "kometa.api-key"],
        actions: ACTIONS_DISCOVERED,
        docker_hints: &["kometa", "plex-meta-manager", "pmm"],
    },
    MediaServiceDefinition {
        id: "flaresolverr",
        name: "FlareSolverr",
        group: "indexers",
        kind: "proxy",
        default_port: Some(8191),
        url_env: Some("FLARESOLVERR_URL"),
        required_envs: &["FLARESOLVERR_URL"],
        credential_keys: &["flaresolverr.url"],
        actions: ACTIONS_DISCOVERED,
        docker_hints: &["flaresolverr"],
    },
    MediaServiceDefinition {
        id: "gluetun",
        name: "Gluetun",
        group: "network",
        kind: "vpn",
        default_port: None,
        url_env: Some("GLUETUN_URL"),
        required_envs: &["GLUETUN_URL"],
        credential_keys: &["gluetun.url"],
        actions: ACTIONS_DISCOVERED,
        docker_hints: &["gluetun"],
    },
    MediaServiceDefinition {
        id: "lettarrboxd",
        name: "Lettarrboxd",
        group: "automation",
        kind: "lists",
        default_port: None,
        url_env: Some("LETTARRBOXD_URL"),
        required_envs: &["LETTARRBOXD_URL"],
        credential_keys: &["lettarrboxd.url", "lettarrboxd.api-key"],
        actions: ACTIONS_DISCOVERED,
        docker_hints: &["lettarrboxd"],
    },
    MediaServiceDefinition {
        id: "picard",
        name: "MusicBrainz Picard",
        group: "music",
        kind: "tagging",
        default_port: Some(5800),
        url_env: Some("PICARD_URL"),
        required_envs: &["PICARD_URL"],
        credential_keys: &["picard.url"],
        actions: ACTIONS_DISCOVERED,
        docker_hints: &["picard", "musicbrainz"],
    },
    MediaServiceDefinition {
        id: "koel",
        name: "Koel",
        group: "music",
        kind: "streaming",
        default_port: Some(80),
        url_env: Some("KOEL_URL"),
        required_envs: &["KOEL_URL"],
        credential_keys: &["koel.url", "koel.api-key"],
        actions: ACTIONS_DISCOVERED,
        docker_hints: &["koel"],
    },
    MediaServiceDefinition {
        id: "nzbhydra2",
        name: "NZBHydra2",
        group: "indexers",
        kind: "indexer",
        default_port: Some(5076),
        url_env: Some("NZBHYDRA2_URL"),
        required_envs: &["NZBHYDRA2_URL"],
        credential_keys: &["nzbhydra2.url", "nzbhydra2.api-key"],
        actions: ACTIONS_DISCOVERED,
        docker_hints: &["nzbhydra", "nzbhydra2"],
    },
    MediaServiceDefinition {
        id: "jackett",
        name: "Jackett",
        group: "indexers",
        kind: "indexer",
        default_port: Some(9117),
        url_env: Some("JACKETT_URL"),
        required_envs: &["JACKETT_URL"],
        credential_keys: &["jackett.url", "jackett.api-key"],
        actions: ACTIONS_DISCOVERED,
        docker_hints: &["jackett"],
    },
    MediaServiceDefinition {
        id: "tracearr",
        name: "Tracearr",
        group: "analytics",
        kind: "analytics",
        default_port: None,
        url_env: Some("TRACEARR_URL"),
        required_envs: &["TRACEARR_URL"],
        credential_keys: &["tracearr.url", "tracearr.api-key"],
        actions: ACTIONS_DISCOVERED,
        docker_hints: &["tracearr"],
    },
    MediaServiceDefinition {
        id: "ssh",
        name: "SSH",
        group: "remote",
        kind: "remote",
        default_port: Some(22),
        url_env: Some("SSH_HOST"),
        required_envs: &["SSH_HOST"],
        credential_keys: &["ssh.host", "ssh.user", "ssh.password", "ssh.key-path"],
        actions: ACTIONS_SSH,
        docker_hints: &["openssh", "sshd"],
    },
    MediaServiceDefinition {
        id: "sftp",
        name: "SFTP",
        group: "remote",
        kind: "remote",
        default_port: Some(22),
        url_env: Some("SFTP_HOST"),
        required_envs: &["SFTP_HOST"],
        credential_keys: &["sftp.host", "sftp.user", "sftp.password", "sftp.key-path"],
        actions: ACTIONS_SSH,
        docker_hints: &["sftp"],
    },
];

fn plex_config(state: &AppState) -> Option<PlexConfig> {
    let token = state.secret_or_default("PLEX_TOKEN");
    if token.is_empty() {
        return None;
    }
    let url = state.secret_or_default("PLEX_URL");
    if url.is_empty() {
        tracing::warn!("PLEX_TOKEN is set but PLEX_URL is not configured");
        return None;
    }
    Some(PlexConfig { url, token })
}

fn sonarr_config(state: &AppState) -> Option<SonarrConfig> {
    let api_key = state.secret_or_default("SONARR_API_KEY");
    if api_key.is_empty() {
        return None;
    }
    let url = state.secret_or_default("SONARR_URL");
    if url.is_empty() {
        tracing::warn!("SONARR_API_KEY is set but SONARR_URL is not configured");
        return None;
    }
    Some(SonarrConfig { url, api_key })
}

fn radarr_config(state: &AppState) -> Option<RadarrConfig> {
    let api_key = state.secret_or_default("RADARR_API_KEY");
    if api_key.is_empty() {
        return None;
    }
    let url = state.secret_or_default("RADARR_URL");
    if url.is_empty() {
        tracing::warn!("RADARR_API_KEY is set but RADARR_URL is not configured");
        return None;
    }
    Some(RadarrConfig { url, api_key })
}

fn trim_url(url: String) -> String {
    url.trim().trim_end_matches('/').to_string()
}

fn clean_media_env_value(value: &str) -> String {
    value
        .trim()
        .trim_matches(|ch| ch == '"' || ch == '\'')
        .to_string()
}

fn raw_media_env_value(key: &str) -> Option<String> {
    let mut paths = Vec::new();
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    paths.push(manifest_dir.join(".env.local"));
    paths.push(manifest_dir.join("../.env.local"));
    if let Ok(cwd) = std::env::current_dir() {
        paths.push(cwd.join(".env.local"));
        paths.push(cwd.join("src-tauri/.env.local"));
    }
    paths.dedup();
    paths.into_iter().find_map(|path| {
        let contents = std::fs::read_to_string(path).ok()?;
        contents.lines().find_map(|line| {
            let trimmed = line.trim();
            if trimmed.is_empty() || trimmed.starts_with('#') {
                return None;
            }
            let (env_key, value) = trimmed.split_once('=')?;
            if env_key.trim() == key && !value.trim().is_empty() {
                Some(clean_media_env_value(value))
            } else {
                None
            }
        })
    })
}

fn media_secret(state: &AppState, key: &str) -> String {
    raw_media_env_value(key).unwrap_or_else(|| state.secret_or_default(key))
}

fn service_host(url: &str) -> String {
    url::Url::parse(url)
        .ok()
        .and_then(|parsed| parsed.host_str().map(ToString::to_string))
        .unwrap_or_else(|| url.to_string())
}

#[cfg(test)]
fn media_definition(id: &str) -> Option<&'static MediaServiceDefinition> {
    MEDIA_SERVICE_REGISTRY.iter().find(|def| def.id == id)
}

fn secret_present(state: &AppState, key: &str) -> bool {
    state
        .secret(key)
        .is_some_and(|value| !value.trim().is_empty())
}

fn detection_supplies_url(service_detections: &[Value]) -> bool {
    service_detections.iter().any(|detection| {
        detection
            .get("detected_url")
            .and_then(Value::as_str)
            .is_some_and(|url| !url.trim().is_empty())
    })
}

fn missing_envs_with_detections(
    state: &AppState,
    def: &MediaServiceDefinition,
    service_detections: &[Value],
) -> Vec<&'static str> {
    let detected_url_present = detection_supplies_url(service_detections);
    if suppress_missing_credentials_for_detected_service(def, service_detections) {
        return Vec::new();
    }
    def.required_envs
        .iter()
        .copied()
        .filter(|key| {
            if Some(*key) == def.url_env && detected_url_present {
                return false;
            }
            !secret_present(state, key)
        })
        .collect()
}

fn suppress_missing_credentials_for_detected_service(
    def: &MediaServiceDefinition,
    service_detections: &[Value],
) -> bool {
    !detection_supplies_url(service_detections)
        && !service_detections.is_empty()
        && (detected_no_direct_ui_service(def.id) || detected_unpublished_port_service(def.id))
}

fn detected_no_direct_ui_service(id: &str) -> bool {
    matches!(id, "gluetun" | "cloudflared" | "kometa" | "recyclarr")
}

fn detected_unpublished_port_service(id: &str) -> bool {
    matches!(id, "flaresolverr" | "crowdsec" | "pelican" | "alloy")
}

fn any_credential_present(state: &AppState, def: &MediaServiceDefinition) -> bool {
    def.required_envs
        .iter()
        .any(|key| secret_present(state, key))
}

fn docker_text_matches(def: &MediaServiceDefinition, text: &str) -> bool {
    let text = text.to_ascii_lowercase();
    def.docker_hints
        .iter()
        .any(|hint| text.contains(&hint.to_ascii_lowercase()))
}

fn endpoint_host_from_url(url: &str) -> Option<String> {
    let trimmed = url.trim();
    if trimmed.is_empty() {
        return None;
    }
    if let Ok(parsed) = url::Url::parse(trimmed) {
        return parsed.host_str().map(ToString::to_string);
    }
    let with_scheme = format!("tcp://{trimmed}");
    url::Url::parse(&with_scheme)
        .ok()
        .and_then(|parsed| parsed.host_str().map(ToString::to_string))
}

fn parse_portainer_ports(ports: &str) -> Vec<(Option<u16>, Option<u16>)> {
    let Ok(value) = serde_json::from_str::<Value>(ports) else {
        return Vec::new();
    };
    value
        .as_array()
        .into_iter()
        .flatten()
        .map(|port| {
            (
                port.get("PublicPort")
                    .and_then(Value::as_u64)
                    .and_then(|port| u16::try_from(port).ok()),
                port.get("PrivatePort")
                    .and_then(Value::as_u64)
                    .and_then(|port| u16::try_from(port).ok()),
            )
        })
        .collect()
}

fn portainer_port_binding_reachable(detection: &MediaDockerDetection, port: &Value) -> bool {
    let Some(public_port) = port.get("PublicPort").and_then(Value::as_u64) else {
        return false;
    };
    if public_port == 0 {
        return false;
    }

    let Some(ip) = port.get("IP").and_then(Value::as_str).map(str::trim) else {
        return true;
    };
    if ip.is_empty() || matches!(ip, "0.0.0.0" | "::") {
        return true;
    }
    if matches!(ip, "127.0.0.1" | "::1" | "localhost") {
        return false;
    }
    detection
        .host
        .as_deref()
        .is_some_and(|host| host.eq_ignore_ascii_case(ip))
}

fn parse_cli_ports(ports: &str) -> Vec<(Option<u16>, Option<u16>)> {
    ports
        .split(',')
        .filter_map(|chunk| {
            let chunk = chunk.trim();
            let (public, private) = chunk.split_once("->")?;
            let private_port = private
                .split('/')
                .next()
                .and_then(|value| value.parse::<u16>().ok());
            let public_port = public
                .rsplit(':')
                .next()
                .and_then(|value| value.parse::<u16>().ok());
            Some((public_port, private_port))
        })
        .collect()
}

fn detection_ports(detection: &MediaDockerDetection) -> Vec<(Option<u16>, Option<u16>)> {
    let portainer_ports = parse_portainer_ports(&detection.ports);
    if portainer_ports.is_empty() {
        parse_cli_ports(&detection.ports)
    } else {
        portainer_ports
    }
}

fn detection_exposes_port(detection: &MediaDockerDetection, port: u16) -> bool {
    detection_ports(detection)
        .iter()
        .any(|(public, private)| public == &Some(port) || private == &Some(port))
}

fn service_ports(def: &MediaServiceDefinition) -> Vec<u16> {
    let mut ports = Vec::new();
    if let Some(port) = def.default_port {
        ports.push(port);
    }
    match def.id {
        "ssh" | "sftp" => ports.push(2022),
        _ => {}
    }
    ports.sort_unstable();
    ports.dedup();
    ports
}

fn detection_exposes_service_port(
    def: &MediaServiceDefinition,
    detection: &MediaDockerDetection,
) -> bool {
    service_ports(def)
        .into_iter()
        .any(|port| detection_exposes_port(detection, port))
}

fn detected_public_port(
    def: &MediaServiceDefinition,
    detection: &MediaDockerDetection,
) -> Option<u16> {
    let service_ports = service_ports(def);
    if service_ports.is_empty() {
        return None;
    }
    if let Ok(value) = serde_json::from_str::<Value>(&detection.ports) {
        if let Some(ports) = value.as_array() {
            return ports.iter().find_map(|port| {
                let public = port
                    .get("PublicPort")
                    .and_then(Value::as_u64)
                    .and_then(|port| u16::try_from(port).ok());
                let private = port
                    .get("PrivatePort")
                    .and_then(Value::as_u64)
                    .and_then(|port| u16::try_from(port).ok());
                let matches_service = public.is_some_and(|port| service_ports.contains(&port))
                    || private.is_some_and(|port| service_ports.contains(&port));
                if matches_service && portainer_port_binding_reachable(detection, port) {
                    public
                } else {
                    None
                }
            });
        }
    }
    detection_ports(detection)
        .into_iter()
        .find_map(|(public, private)| {
            if public.is_some_and(|port| service_ports.contains(&port)) {
                public
            } else if private.is_some_and(|port| service_ports.contains(&port)) {
                public
            } else {
                None
            }
        })
}

fn detection_has_detected_url(
    def: &MediaServiceDefinition,
    detection: &MediaDockerDetection,
) -> bool {
    detected_public_port(def, detection).is_some() && detection.host.is_some()
}

fn service_detection_url(service_detections: &[Value]) -> Option<String> {
    service_detections.iter().find_map(|detection| {
        detection
            .get("detected_url")
            .and_then(Value::as_str)
            .filter(|url| !url.trim().is_empty())
            .map(ToString::to_string)
    })
}

fn detection_matches_service(
    def: &MediaServiceDefinition,
    detection: &MediaDockerDetection,
) -> bool {
    if def.id == "portainer" {
        let container = detection.container.to_ascii_lowercase();
        let image = detection.image.to_ascii_lowercase();
        return container == "portainer"
            || container == "portainer_agent"
            || image.starts_with("portainer/");
    }
    if def.id == "grafana" {
        let container = detection.container.to_ascii_lowercase();
        let image = detection.image.to_ascii_lowercase();
        return container == "grafana"
            || container.ends_with("-grafana")
            || container.ends_with("_grafana")
            || image.starts_with("grafana/grafana");
    }
    if matches!(def.id, "ssh" | "sftp") && detection_exposes_service_port(def, detection) {
        return true;
    }
    if detection_is_sidecar(def, detection) {
        return false;
    }
    docker_text_matches(def, &detection.container)
        || docker_text_matches(def, &detection.image)
        || (gluetun_can_route_service(def.id)
            && detection.container.eq_ignore_ascii_case("gluetun")
            && detection_exposes_service_port(def, detection))
}

fn gluetun_can_route_service(service_id: &str) -> bool {
    matches!(
        service_id,
        "sonarr" | "radarr" | "prowlarr" | "qbittorrent" | "sabnzbd"
    )
}

fn detection_match_rank(def: &MediaServiceDefinition, detection: &MediaDockerDetection) -> u8 {
    if docker_text_matches(def, &detection.container) || docker_text_matches(def, &detection.image)
    {
        0
    } else {
        1
    }
}

fn detection_container_name(detection: &Value) -> Option<&str> {
    detection.get("container").and_then(Value::as_str)
}

fn detection_is_primary_container(def: &MediaServiceDefinition, container: &str) -> bool {
    let lower = container.to_ascii_lowercase();
    match def.id {
        "pelican" => lower.contains("pelican-panel"),
        "crowdsec" => lower == "crowdsec" || lower.contains("crowdsec-engine"),
        _ => lower.eq_ignore_ascii_case(def.id),
    }
}

fn detection_is_sidecar_name(container: &str) -> bool {
    let lower = container.to_ascii_lowercase();
    lower.ends_with("-db")
        || lower.ends_with("_db")
        || lower.contains("postgres")
        || lower.contains("mariadb")
        || lower.contains("mysql")
        || lower.contains("redis")
}

fn detection_is_sidecar(def: &MediaServiceDefinition, detection: &MediaDockerDetection) -> bool {
    let lower = detection.container.to_ascii_lowercase();
    lower != def.id && detection_is_sidecar_name(&lower)
}

fn detected_url(def: &MediaServiceDefinition, detection: &MediaDockerDetection) -> Option<String> {
    let host = detection.host.as_ref()?;
    let port = detected_public_port(def, detection)?;
    let scheme = match def.id {
        "ssh" => "ssh",
        "sftp" => "sftp",
        "portainer" => "https",
        _ => "http",
    };
    Some(format!("{scheme}://{host}:{port}"))
}

fn media_detection_json(def: &MediaServiceDefinition, detection: &MediaDockerDetection) -> Value {
    let detected_url = detected_url(def, detection);
    let default_port_exposed = detection_exposes_service_port(def, detection);
    json!({
        "service": def.id,
        "name": def.name,
        "source": detection.source,
        "container": detection.container,
        "image": detection.image,
        "state": detection.state,
        "status": detection.status,
        "ports": detection.ports,
        "endpoint_id": detection.endpoint_id,
        "endpoint_name": detection.endpoint_name,
        "host": detection.host,
        "detected_url": detected_url,
        "default_port_exposed": default_port_exposed,
        "default_port_published": detection_has_detected_url(def, detection),
    })
}

fn detections_for_service(
    def: &MediaServiceDefinition,
    detections: &[MediaDockerDetection],
) -> Vec<Value> {
    let mut matches = detections
        .iter()
        .filter(|detection| detection_matches_service(def, detection))
        .collect::<Vec<_>>();
    matches.sort_by_key(|detection| {
        (
            detection_is_sidecar(def, detection),
            detection_match_rank(def, detection),
            !detection_has_detected_url(def, detection),
        )
    });
    matches
        .into_iter()
        .map(|detection| media_detection_json(def, detection))
        .collect()
}

fn state_label(state: MediaServiceState) -> &'static str {
    match state {
        MediaServiceState::Online => "online",
        MediaServiceState::Degraded => "degraded",
        MediaServiceState::Offline => "offline",
        MediaServiceState::Configured => "configured",
        MediaServiceState::DetectedMissingCredentials => "detected_missing_credentials",
        MediaServiceState::DetectedNoDirectUi => "detected_no_direct_ui",
        MediaServiceState::DetectedUnpublishedPort => "detected_unpublished_port",
        MediaServiceState::NotDetected => "not_detected",
    }
}

fn service_diagnostic(
    def: &MediaServiceDefinition,
    service_detections: &[Value],
    checked: bool,
    configured: bool,
    healthy: bool,
    detected_running: bool,
) -> Option<String> {
    if healthy {
        return None;
    }

    let default_port = def.default_port;
    let primary_detection = service_detections
        .iter()
        .find(|detection| {
            detection_container_name(detection).is_some_and(|container| {
                detection_is_primary_container(def, container)
                    && !detection_is_sidecar_name(container)
            })
        })
        .or_else(|| {
            service_detections.iter().find(|detection| {
                detection_container_name(detection)
                    .is_some_and(|container| !detection_is_sidecar_name(container))
            })
        })
        .or_else(|| service_detections.first());
    let running_detection = primary_detection
        .filter(|detection| {
            detection
                .get("state")
                .and_then(Value::as_str)
                .is_some_and(|state| state.eq_ignore_ascii_case("running"))
        })
        .or_else(|| {
            service_detections.iter().find(|detection| {
                detection
                    .get("state")
                    .and_then(Value::as_str)
                    .is_some_and(|state| state.eq_ignore_ascii_case("running"))
                    && detection_container_name(detection)
                        .is_none_or(|container| !detection_is_sidecar_name(container))
            })
        })
        .or_else(|| {
            service_detections.iter().find(|detection| {
                detection
                    .get("state")
                    .and_then(Value::as_str)
                    .is_some_and(|state| state.eq_ignore_ascii_case("running"))
            })
        });
    let endpoint = running_detection
        .or(primary_detection)
        .and_then(|detection| {
            detection
                .get("endpoint_name")
                .and_then(Value::as_str)
                .or_else(|| detection.get("source").and_then(Value::as_str))
        })
        .unwrap_or("homelab");
    let container = running_detection
        .or(primary_detection)
        .and_then(detection_container_name)
        .unwrap_or(def.name);
    let any_published_url = service_detection_url(service_detections).is_some();
    let any_exposed_port = service_detections.iter().any(|detection| {
        detection
            .get("default_port_exposed")
            .and_then(Value::as_bool)
            .unwrap_or(false)
    });

    if configured && checked && detected_running && !any_published_url {
        if let Some(port) = default_port {
            return Some(format!(
                "{container} is running on {endpoint}, but port {port} is not published by Docker or Gluetun."
            ));
        }
        return Some(format!(
            "{container} is running on {endpoint}, but no reachable service URL was detected."
        ));
    }

    if configured && checked && detected_running && any_published_url {
        return Some(format!(
            "{container} is running on {endpoint}, but the health check failed."
        ));
    }

    if configured && checked && !detected_running {
        return Some(
            "Credentials are configured, but no running container was detected.".to_string(),
        );
    }

    if !configured && !detected_running {
        if let Some(detection) = primary_detection {
            let primary_container = detection_container_name(detection).unwrap_or(container);
            let state = detection
                .get("state")
                .and_then(Value::as_str)
                .unwrap_or("detected");
            let status = detection
                .get("status")
                .and_then(Value::as_str)
                .unwrap_or(state);
            if !state.eq_ignore_ascii_case("running") {
                return Some(format!("{primary_container} is {status} on {endpoint}."));
            }
        }
    }

    if !configured && detected_running && !any_published_url {
        if let Some(port) = default_port {
            return Some(format!(
                "{container} is detected on {endpoint}, but port {port} is not published yet."
            ));
        }
        return Some(format!(
            "{container} is detected on {endpoint}, but no web control URL or management port is published."
        ));
    }

    if !configured && detected_running && any_exposed_port {
        return Some(format!(
            "{container} is detected on {endpoint}. Add the missing credentials to control it."
        ));
    }

    None
}

fn service_state_from_flags(
    service_id: &str,
    healthy: bool,
    degraded: bool,
    configured: bool,
    checked: bool,
    detected_running: bool,
    detected: bool,
    partial: bool,
    has_detected_url: bool,
) -> MediaServiceState {
    if healthy {
        MediaServiceState::Online
    } else if detected_running && !has_detected_url && detected_no_direct_ui_service(service_id) {
        MediaServiceState::DetectedNoDirectUi
    } else if detected_running && !has_detected_url && detected_unpublished_port_service(service_id)
    {
        MediaServiceState::DetectedUnpublishedPort
    } else if detected && !detected_running {
        MediaServiceState::Offline
    } else if degraded || (configured && checked && detected_running) {
        MediaServiceState::Degraded
    } else if configured && checked {
        MediaServiceState::Offline
    } else if configured {
        MediaServiceState::Configured
    } else if detected || partial {
        MediaServiceState::DetectedMissingCredentials
    } else {
        MediaServiceState::NotDetected
    }
}

fn normalize_service_value(
    state: &AppState,
    def: &MediaServiceDefinition,
    mut service: Value,
    detections: &[MediaDockerDetection],
    checked: bool,
) -> Value {
    let service_detections = detections_for_service(def, detections);
    let missing = missing_envs_with_detections(state, def, &service_detections);
    let configured = missing.is_empty();
    let partial = !configured && any_credential_present(state, def);
    let detected = !service_detections.is_empty();
    let healthy = service
        .get("healthy")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let degraded = service
        .get("degraded")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let detected_running = service_detections.iter().any(|detection| {
        detection
            .get("state")
            .and_then(Value::as_str)
            .is_some_and(|state| state.eq_ignore_ascii_case("running"))
    });
    let detection_url = service_detection_url(&service_detections);
    let normalized_state = service_state_from_flags(
        def.id,
        healthy,
        degraded,
        configured,
        checked,
        detected_running,
        detected,
        partial,
        detection_url.is_some(),
    );

    let host = service
        .get("host")
        .and_then(Value::as_str)
        .map(ToString::to_string)
        .or_else(|| {
            def.url_env
                .and_then(|key| state.secret(key))
                .map(|url| service_host(&url))
        })
        .or_else(|| {
            service_detections.iter().find_map(|detection| {
                detection
                    .get("host")
                    .and_then(Value::as_str)
                    .map(ToString::to_string)
            })
        });
    let service_url = service
        .get("url")
        .and_then(Value::as_str)
        .map(ToString::to_string)
        .or_else(|| def.url_env.and_then(|key| state.secret(key)))
        .or_else(|| service_detection_url(&service_detections));
    let diagnostic = service_diagnostic(
        def,
        &service_detections,
        checked,
        configured,
        healthy,
        detected_running,
    );

    let obj = service
        .as_object_mut()
        .expect("service json must be an object");
    obj.insert("id".into(), json!(def.id));
    obj.insert("name".into(), json!(def.name));
    obj.insert("label".into(), json!(def.name));
    obj.insert("group".into(), json!(def.group));
    obj.insert("kind".into(), json!(def.kind));
    obj.insert("default_port".into(), json!(def.default_port));
    obj.insert("configured".into(), json!(configured));
    obj.insert("detected".into(), json!(detected));
    obj.insert("healthy".into(), json!(healthy));
    obj.insert("state".into(), json!(state_label(normalized_state)));
    obj.insert("status".into(), json!(state_label(normalized_state)));
    obj.insert("missing_credentials".into(), json!(missing));
    obj.insert("credential_keys".into(), json!(def.credential_keys));
    obj.insert("actions".into(), json!(def.actions));
    obj.insert("detections".into(), json!(service_detections));
    if let Some(diagnostic) = diagnostic {
        obj.insert("diagnostic".into(), json!(diagnostic));
    }
    if let Some(host) = host {
        obj.insert("host".into(), json!(host));
    }
    if let Some(service_url) = service_url {
        obj.insert("url".into(), json!(service_url));
    }
    if let Some(detection_url) = detection_url {
        obj.insert("detected_url".into(), json!(detection_url));
    }
    service
}

fn stub_for_definition(
    state: &AppState,
    def: &MediaServiceDefinition,
    detections: &[MediaDockerDetection],
) -> Value {
    normalize_service_value(
        state,
        def,
        json!({
            "id": def.id,
            "name": def.name,
            "kind": def.kind,
            "configured": false,
            "healthy": false,
        }),
        detections,
        false,
    )
}

async fn fetch_local_media_docker_detections() -> Vec<MediaDockerDetection> {
    let output = match tokio::time::timeout(
        Duration::from_secs(5),
        Command::new("docker")
            .args(["ps", "-a", "--format", "{{json .}}"])
            .output(),
    )
    .await
    {
        Ok(Ok(output)) if output.status.success() => output,
        _ => return Vec::new(),
    };

    String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter_map(|line| serde_json::from_str::<Value>(line).ok())
        .map(|row| MediaDockerDetection {
            container: row
                .get("Names")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .trim_start_matches('/')
                .to_string(),
            image: row
                .get("Image")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string(),
            state: row
                .get("State")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string(),
            status: row
                .get("Status")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string(),
            ports: row
                .get("Ports")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string(),
            endpoint_id: None,
            endpoint_name: None,
            host: None,
            source: "docker".to_string(),
        })
        .collect()
}

fn portainer_detections_from_inventory(inventory: &Value) -> Vec<MediaDockerDetection> {
    let mut endpoint_hosts: HashMap<i64, String> = HashMap::new();
    for instance in inventory
        .get("instances")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        let instance_host = instance
            .get("url")
            .and_then(Value::as_str)
            .and_then(endpoint_host_from_url);
        for endpoint in instance
            .get("endpoints")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
        {
            let Some(id) = endpoint.get("id").and_then(Value::as_i64) else {
                continue;
            };
            if let Some(host) = endpoint
                .get("url")
                .and_then(Value::as_str)
                .and_then(endpoint_host_from_url)
                .or_else(|| instance_host.clone())
            {
                endpoint_hosts.insert(id, host);
            }
        }
    }

    inventory
        .get("containers")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .map(|row| {
            let endpoint_id = row.get("endpoint_id").and_then(Value::as_i64);
            let host = endpoint_id.and_then(|id| endpoint_hosts.get(&id).cloned());
            MediaDockerDetection {
                container: row
                    .get("name")
                    .or_else(|| row.get("container"))
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .trim_start_matches('/')
                    .to_string(),
                image: row
                    .get("image")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string(),
                state: row
                    .get("state")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string(),
                status: row
                    .get("status")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string(),
                ports: row
                    .get("ports")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string(),
                endpoint_id,
                endpoint_name: row
                    .get("endpoint_name")
                    .and_then(Value::as_str)
                    .map(ToString::to_string),
                host,
                source: "portainer".to_string(),
            }
        })
        .collect()
}

fn fallback_plex_vm_detections(state: &AppState) -> Vec<MediaDockerDetection> {
    let host = ["SONARR_URL", "RADARR_URL", "PROWLARR_URL", "PLEX_URL"]
        .into_iter()
        .find_map(|key| {
            let value = state.secret_or_default(key);
            if value.trim().is_empty() {
                None
            } else {
                Some(service_host(&value))
            }
        });
    let Some(host) = host else {
        return Vec::new();
    };
    if host.trim().is_empty() || host == "homelab" {
        return Vec::new();
    }

    let services = [
        (
            "jellyfin",
            "jellyfin/jellyfin",
            "running",
            Some(8096),
            Some(8096),
        ),
        (
            "sonarr",
            "lscr.io/linuxserver/sonarr",
            "running",
            Some(8989),
            Some(8989),
        ),
        (
            "radarr",
            "lscr.io/linuxserver/radarr",
            "running",
            Some(7878),
            Some(7878),
        ),
        (
            "prowlarr",
            "lscr.io/linuxserver/prowlarr",
            "running",
            Some(9696),
            Some(9696),
        ),
        (
            "bazarr",
            "lscr.io/linuxserver/bazarr",
            "running",
            Some(6767),
            Some(6767),
        ),
        (
            "overseerr",
            "sctx/overseerr",
            "running",
            Some(5055),
            Some(5055),
        ),
        (
            "tautulli",
            "lscr.io/linuxserver/tautulli",
            "running",
            Some(8181),
            Some(8181),
        ),
        (
            "qbittorrent",
            "lscr.io/linuxserver/qbittorrent",
            "running",
            Some(8082),
            Some(8080),
        ),
        (
            "sabnzbd",
            "lscr.io/linuxserver/sabnzbd",
            "running",
            Some(8090),
            Some(8080),
        ),
        ("kometa", "kometateam/kometa", "running", None, None),
        (
            "flaresolverr",
            "ghcr.io/flaresolverr/flaresolverr",
            "running",
            Some(8191),
            Some(8191),
        ),
        ("gluetun", "qmcgaw/gluetun", "running", None, None),
        ("lettarrboxd", "lettarrboxd", "restarting", None, None),
        (
            "picard",
            "mikenye/picard",
            "running",
            Some(5800),
            Some(5800),
        ),
        ("koel", "koel", "exited", Some(80), Some(80)),
    ];

    services
        .into_iter()
        .map(
            |(container, image, state_label, public_port, private_port)| {
                let ports = match (public_port, private_port) {
                    (Some(public), Some(private)) => json!([{
                        "IP": "0.0.0.0",
                        "PrivatePort": private,
                        "PublicPort": public,
                        "Type": "tcp"
                    }])
                    .to_string(),
                    _ => String::new(),
                };
                MediaDockerDetection {
                    container: container.to_string(),
                    image: image.to_string(),
                    state: state_label.to_string(),
                    status: state_label.to_string(),
                    ports,
                    endpoint_id: None,
                    endpoint_name: Some("plex-vm".to_string()),
                    host: Some(host.clone()),
                    source: "tailnet-known".to_string(),
                }
            },
        )
        .collect()
}

async fn fetch_media_docker_detections(state: &AppState) -> Vec<MediaDockerDetection> {
    let (mut local, portainer_inventory) = tokio::join!(
        fetch_local_media_docker_detections(),
        homelab::fetch_portainer_inventory(state),
    );
    let mut portainer = portainer_detections_from_inventory(&portainer_inventory);
    local.append(&mut portainer);
    if !local.iter().any(|detection| {
        detection.endpoint_name.as_deref() == Some("plex-vm")
            || [
                "sonarr",
                "radarr",
                "prowlarr",
                "bazarr",
                "overseerr",
                "tautulli",
            ]
            .iter()
            .any(|hint| detection.container.eq_ignore_ascii_case(hint))
    }) {
        local.extend(fallback_plex_vm_detections(state));
    }
    local
}

fn arr_config(state: &AppState, id: &str) -> Option<ArrConfig> {
    let (name, kind, url_key, key_key, api_version) = match id {
        "sonarr" => (
            "Sonarr",
            ArrKind::Sonarr,
            "SONARR_URL",
            "SONARR_API_KEY",
            "v3",
        ),
        "radarr" => (
            "Radarr",
            ArrKind::Radarr,
            "RADARR_URL",
            "RADARR_API_KEY",
            "v3",
        ),
        "lidarr" => (
            "Lidarr",
            ArrKind::Lidarr,
            "LIDARR_URL",
            "LIDARR_API_KEY",
            "v1",
        ),
        "prowlarr" => (
            "Prowlarr",
            ArrKind::Prowlarr,
            "PROWLARR_URL",
            "PROWLARR_API_KEY",
            "v1",
        ),
        _ => return None,
    };

    let url = trim_url(state.secret_or_default(url_key));
    let api_key = state.secret_or_default(key_key);
    if url.is_empty() || api_key.is_empty() {
        return None;
    }

    Some(ArrConfig {
        id: match id {
            "sonarr" => "sonarr",
            "radarr" => "radarr",
            "lidarr" => "lidarr",
            "prowlarr" => "prowlarr",
            _ => return None,
        },
        name,
        kind,
        api_version,
        url,
        api_key,
    })
}

fn all_arr_configs(state: &AppState) -> Vec<ArrConfig> {
    ["sonarr", "radarr", "lidarr", "prowlarr"]
        .into_iter()
        .filter_map(|id| arr_config(state, id))
        .collect()
}

fn ecosystem_config(state: &AppState, id: &str) -> Option<EcosystemConfig> {
    let (name, kind, url_key, api_key_key, username_key, password_key) = match id {
        "jellyfin" => (
            "Jellyfin",
            EcosystemKind::Jellyfin,
            "JELLYFIN_URL",
            Some("JELLYFIN_API_KEY"),
            None,
            None,
        ),
        "emby" => (
            "Emby",
            EcosystemKind::Emby,
            "EMBY_URL",
            Some("EMBY_API_KEY"),
            None,
            None,
        ),
        "overseerr" => (
            "Overseerr",
            EcosystemKind::Overseerr,
            "OVERSEERR_URL",
            Some("OVERSEERR_API_KEY"),
            None,
            None,
        ),
        "jellyseerr" => (
            "Jellyseerr",
            EcosystemKind::Jellyseerr,
            "JELLYSEERR_URL",
            Some("JELLYSEERR_API_KEY"),
            None,
            None,
        ),
        "tautulli" => (
            "Tautulli",
            EcosystemKind::Tautulli,
            "TAUTULLI_URL",
            Some("TAUTULLI_API_KEY"),
            None,
            None,
        ),
        "bazarr" => (
            "Bazarr",
            EcosystemKind::Bazarr,
            "BAZARR_URL",
            Some("BAZARR_API_KEY"),
            None,
            None,
        ),
        "jellystat" => (
            "Jellystat",
            EcosystemKind::Jellystat,
            "JELLYSTAT_URL",
            Some("JELLYSTAT_API_KEY"),
            None,
            None,
        ),
        "qbittorrent" => (
            "qBittorrent",
            EcosystemKind::Qbittorrent,
            "QBITTORRENT_URL",
            None,
            Some("QBITTORRENT_USERNAME"),
            Some("QBITTORRENT_PASSWORD"),
        ),
        "sabnzbd" => (
            "SABnzbd",
            EcosystemKind::Sabnzbd,
            "SABNZBD_URL",
            Some("SABNZBD_API_KEY"),
            None,
            None,
        ),
        "nzbget" => (
            "NZBGet",
            EcosystemKind::Nzbget,
            "NZBGET_URL",
            None,
            Some("NZBGET_USERNAME"),
            Some("NZBGET_PASSWORD"),
        ),
        "transmission" => (
            "Transmission",
            EcosystemKind::Transmission,
            "TRANSMISSION_URL",
            None,
            Some("TRANSMISSION_USERNAME"),
            Some("TRANSMISSION_PASSWORD"),
        ),
        "deluge" => (
            "Deluge",
            EcosystemKind::Deluge,
            "DELUGE_URL",
            None,
            None,
            Some("DELUGE_PASSWORD"),
        ),
        "unraid" => (
            "Unraid",
            EcosystemKind::Unraid,
            "UNRAID_URL",
            Some("UNRAID_API_KEY"),
            None,
            None,
        ),
        "wizarr" => (
            "Wizarr",
            EcosystemKind::Wizarr,
            "WIZARR_URL",
            Some("WIZARR_API_KEY"),
            None,
            None,
        ),
        _ => return None,
    };

    let url = trim_url(media_secret(state, url_key));
    if url.is_empty() {
        return None;
    }
    Some(EcosystemConfig {
        id: match id {
            "jellyfin" => "jellyfin",
            "emby" => "emby",
            "overseerr" => "overseerr",
            "jellyseerr" => "jellyseerr",
            "tautulli" => "tautulli",
            "bazarr" => "bazarr",
            "jellystat" => "jellystat",
            "qbittorrent" => "qbittorrent",
            "sabnzbd" => "sabnzbd",
            "nzbget" => "nzbget",
            "transmission" => "transmission",
            "deluge" => "deluge",
            "unraid" => "unraid",
            "wizarr" => "wizarr",
            _ => return None,
        },
        name,
        kind,
        url,
        api_key: api_key_key
            .map(|key| media_secret(state, key))
            .filter(|value| !value.trim().is_empty()),
        username: username_key
            .map(|key| media_secret(state, key))
            .filter(|value| !value.trim().is_empty()),
        password: password_key
            .map(|key| media_secret(state, key))
            .filter(|value| !value.trim().is_empty()),
    })
}

fn all_ecosystem_configs(state: &AppState) -> Vec<EcosystemConfig> {
    [
        "jellyfin",
        "emby",
        "overseerr",
        "jellyseerr",
        "tautulli",
        "bazarr",
        "jellystat",
        "qbittorrent",
        "sabnzbd",
        "nzbget",
        "transmission",
        "deluge",
        "unraid",
        "wizarr",
    ]
    .into_iter()
    .filter_map(|id| ecosystem_config(state, id))
    .collect()
}

fn arr_path(cfg: &ArrConfig, path: &str) -> String {
    format!(
        "{}/api/{}{}",
        cfg.url,
        cfg.api_version,
        if path.starts_with('/') {
            path.to_string()
        } else {
            format!("/{path}")
        }
    )
}

// ── Response types (match TypeScript response shape) ────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
struct NowPlaying {
    title: String,
    #[serde(rename = "type")]
    media_type: Option<String>,
    user: String,
    progress: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct RecentlyAdded {
    title: String,
    #[serde(rename = "type")]
    media_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    service: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    kind: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    subtitle: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    year: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    detail_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    detail_ref: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Upcoming {
    title: String,
    air_date: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    service: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    kind: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    subtitle: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    detail_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    detail_ref: Option<Value>,
}

// ── Plex API types ──────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(bound(deserialize = "T: serde::de::DeserializeOwned"))]
struct PlexMediaContainer<T> {
    #[serde(rename = "MediaContainer")]
    media_container: Option<PlexContainer<T>>,
}

#[derive(Debug, Deserialize)]
#[serde(bound(deserialize = "T: serde::de::DeserializeOwned"))]
struct PlexContainer<T> {
    #[serde(rename = "Metadata", default)]
    metadata: Vec<T>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)] // serde struct: player field deserialized from Plex API but not yet consumed
struct PlexSession {
    title: Option<String>,
    #[serde(rename = "grandparentTitle")]
    grandparent_title: Option<String>,
    #[serde(rename = "type")]
    media_type: Option<String>,
    #[serde(rename = "User")]
    user: Option<PlexUser>,
    #[serde(rename = "Player")]
    player: Option<PlexPlayer>,
    #[serde(rename = "viewOffset")]
    #[serde(default, deserialize_with = "deserialize_optional_u64_loose")]
    view_offset: Option<u64>,
    #[serde(default, deserialize_with = "deserialize_optional_u64_loose")]
    duration: Option<u64>,
}

#[derive(Debug, Deserialize)]
struct PlexUser {
    title: Option<String>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)] // serde struct: state field deserialized from Plex API but not yet consumed
struct PlexPlayer {
    state: Option<String>,
}

#[derive(Debug, Deserialize)]
struct PlexLibraryItem {
    #[serde(rename = "ratingKey")]
    rating_key: Option<String>,
    #[serde(rename = "parentRatingKey")]
    parent_rating_key: Option<String>,
    #[serde(rename = "grandparentRatingKey")]
    grandparent_rating_key: Option<String>,
    title: Option<String>,
    #[serde(rename = "parentTitle")]
    parent_title: Option<String>,
    #[serde(rename = "grandparentTitle")]
    grandparent_title: Option<String>,
    #[serde(rename = "type")]
    media_type: Option<String>,
    year: Option<i64>,
}

// ── Sonarr API types ────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[allow(dead_code)] // serde struct: all fields used but lint fires on struct-level for Deserialize-only types
struct SonarrEpisode {
    id: Option<i64>,
    #[serde(rename = "seriesId")]
    series_id: Option<i64>,
    series: Option<SonarrSeries>,
    title: Option<String>,
    #[serde(rename = "airDateUtc")]
    air_date_utc: Option<String>,
    #[serde(rename = "seasonNumber")]
    season_number: Option<u32>,
    #[serde(rename = "episodeNumber")]
    episode_number: Option<u32>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)] // serde struct: added field deserialized from Sonarr API but not yet consumed
struct SonarrSeries {
    id: Option<i64>,
    title: Option<String>,
    year: Option<i64>,
    added: Option<String>,
}

// ── Radarr API types ────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[allow(dead_code)] // serde struct: date_added field deserialized from Radarr API but not yet consumed
struct RadarrMovie {
    id: Option<i64>,
    title: Option<String>,
    year: Option<i64>,
    #[serde(rename = "dateAdded")]
    date_added: Option<String>,
    #[serde(rename = "hasFile")]
    has_file: Option<bool>,
}

fn detail_ref(service: &str, kind: &str, id: impl ToString) -> Value {
    json!({
        "service": service,
        "kind": kind,
        "id": id.to_string(),
    })
}

fn plex_recent_item(item: PlexLibraryItem) -> Option<RecentlyAdded> {
    let raw_type = item.media_type.as_deref().unwrap_or("media");
    let (title, subtitle, kind, detail_id) = match raw_type {
        "episode" => {
            let show = item.grandparent_title.clone()?;
            let episode = item.title.clone().unwrap_or_else(|| "Episode".into());
            let season = item.parent_title.clone().unwrap_or_default();
            let subtitle = [season.as_str(), episode.as_str()]
                .into_iter()
                .filter(|part| !part.trim().is_empty())
                .collect::<Vec<_>>()
                .join(" - ");
            (
                show,
                Some(subtitle),
                "episode",
                item.rating_key
                    .clone()
                    .or(item.grandparent_rating_key.clone())
                    .or(item.parent_rating_key.clone()),
            )
        }
        "season" => {
            let show = item
                .grandparent_title
                .clone()
                .or(item.parent_title.clone())
                .or(item.title.clone())?;
            (
                show,
                item.title.clone(),
                "season",
                item.grandparent_rating_key
                    .clone()
                    .or(item.rating_key.clone())
                    .or(item.parent_rating_key.clone()),
            )
        }
        "show" => (
            item.title.clone()?,
            None,
            "show",
            item.rating_key
                .clone()
                .or(item.grandparent_rating_key.clone())
                .or(item.parent_rating_key.clone()),
        ),
        "movie" => (item.title.clone()?, None, "movie", item.rating_key.clone()),
        other => (item.title.clone()?, None, other, item.rating_key.clone()),
    };
    let detail_id = detail_id?;
    Some(RecentlyAdded {
        title,
        media_type: if raw_type == "movie" { "movie" } else { "show" }.into(),
        service: Some("plex".into()),
        kind: Some(kind.into()),
        id: Some(detail_id.clone()),
        subtitle,
        year: item.year,
        detail_id: Some(detail_id.clone()),
        detail_ref: Some(detail_ref("plex", kind, detail_id)),
    })
}

fn sonarr_upcoming_item(ep: SonarrEpisode, series_map: &HashMap<i64, String>) -> Upcoming {
    let series_id = ep.series_id;
    let show_title = ep
        .series
        .and_then(|s| s.title)
        .or_else(|| series_id.and_then(|id| series_map.get(&id).cloned()))
        .unwrap_or_else(|| "Unknown".into());
    let season = ep.season_number.unwrap_or(0);
    let episode = ep.episode_number.unwrap_or(0);
    let episode_title = ep.title.unwrap_or_default();
    let title = if episode_title.trim().is_empty() {
        format!("{} S{:02}E{:02}", show_title, season, episode)
    } else {
        format!(
            "{} S{:02}E{:02}: {}",
            show_title, season, episode, episode_title
        )
    };
    let air_date = ep
        .air_date_utc
        .as_deref()
        .unwrap_or("")
        .split('T')
        .next()
        .unwrap_or("")
        .to_string();
    let id = ep.id.map(|id| id.to_string());
    Upcoming {
        title,
        air_date,
        service: Some("sonarr".into()),
        kind: Some("episode".into()),
        id: id.clone(),
        subtitle: Some("Episode".into()),
        detail_id: id.clone(),
        detail_ref: id.map(|id| detail_ref("sonarr", "episode", id)),
    }
}

// ── Fetch helpers ───────────────────────────────────────────────────────────

async fn plex_fetch<T: serde::de::DeserializeOwned>(
    http: &reqwest::Client,
    cfg: &PlexConfig,
    path: &str,
) -> Option<T> {
    let url = format!("{}{}", cfg.url, path);
    let separator = if url.contains('?') { '&' } else { '?' };
    let full_url = format!("{}{}X-Plex-Token={}", url, separator, cfg.token);

    let res = http
        .get(&full_url)
        .header("Accept", "application/json")
        .timeout(MEDIA_HTTP_TIMEOUT)
        .send()
        .await
        .ok()?;

    if !res.status().is_success() {
        tracing::warn!("Plex {} returned {}", path, res.status());
        return None;
    }

    res.json::<T>().await.ok()
}

async fn sonarr_fetch<T: serde::de::DeserializeOwned>(
    http: &reqwest::Client,
    cfg: &SonarrConfig,
    path: &str,
) -> Option<T> {
    let url = format!("{}/api/v3{}", cfg.url, path);

    let res = http
        .get(&url)
        .header("X-Api-Key", &cfg.api_key)
        .timeout(MEDIA_HTTP_TIMEOUT)
        .send()
        .await
        .ok()?;

    if !res.status().is_success() {
        tracing::warn!("Sonarr {} returned {}", path, res.status());
        return None;
    }

    res.json::<T>().await.ok()
}

async fn radarr_fetch<T: serde::de::DeserializeOwned>(
    http: &reqwest::Client,
    cfg: &RadarrConfig,
    path: &str,
) -> Option<T> {
    let url = format!("{}/api/v3{}", cfg.url, path);

    let res = http
        .get(&url)
        .header("X-Api-Key", &cfg.api_key)
        .timeout(MEDIA_HTTP_TIMEOUT)
        .send()
        .await
        .ok()?;

    if !res.status().is_success() {
        tracing::warn!("Radarr {} returned {}", path, res.status());
        return None;
    }

    res.json::<T>().await.ok()
}

async fn arr_fetch_value(http: &reqwest::Client, cfg: &ArrConfig, path: &str) -> Option<Value> {
    match arr_request_value(http, cfg, Method::GET, path, None).await {
        Ok(value) => Some(value),
        Err(err) => {
            tracing::warn!("{} {} fetch failed: {:?}", cfg.name, path, err);
            None
        }
    }
}

async fn arr_request_value(
    http: &reqwest::Client,
    cfg: &ArrConfig,
    method: Method,
    path: &str,
    body: Option<Value>,
) -> Result<Value, AppError> {
    let mut req = http
        .request(method, arr_path(cfg, path))
        .header("X-Api-Key", &cfg.api_key)
        .header("Accept", "application/json")
        .timeout(MEDIA_HTTP_TIMEOUT);

    if let Some(body) = body {
        req = req.json(&body);
    }

    let res = req.send().await.map_err(AppError::from)?;
    let status = res.status();
    if !status.is_success() {
        let text = res.text().await.unwrap_or_default();
        let short = if text.chars().count() > 220 {
            format!("{}...", text.chars().take(220).collect::<String>())
        } else {
            text
        };
        return Err(AppError::BadRequest(format!(
            "{} {} returned {} {}",
            cfg.name, path, status, short
        )));
    }

    if status == reqwest::StatusCode::NO_CONTENT {
        return Ok(json!({}));
    }

    res.json::<Value>().await.map_err(AppError::from)
}

fn ecosystem_kind_label(kind: EcosystemKind) -> &'static str {
    match kind {
        EcosystemKind::Jellyfin | EcosystemKind::Emby => "streaming",
        EcosystemKind::Overseerr | EcosystemKind::Jellyseerr => "requests",
        EcosystemKind::Tautulli | EcosystemKind::Jellystat => "analytics",
        EcosystemKind::Bazarr => "subtitles",
        EcosystemKind::Qbittorrent
        | EcosystemKind::Sabnzbd
        | EcosystemKind::Nzbget
        | EcosystemKind::Transmission
        | EcosystemKind::Deluge => "downloads",
        EcosystemKind::Unraid => "server",
        EcosystemKind::Wizarr => "invites",
    }
}

fn ecosystem_url(cfg: &EcosystemConfig, path: &str) -> String {
    format!(
        "{}{}",
        cfg.url,
        if path.starts_with('/') {
            path.to_string()
        } else {
            format!("/{path}")
        }
    )
}

async fn ecosystem_get_json(
    http: &reqwest::Client,
    cfg: &EcosystemConfig,
    path: &str,
) -> Result<Value, AppError> {
    let mut req = http
        .get(ecosystem_url(cfg, path))
        .header("Accept", "application/json")
        .timeout(MEDIA_HTTP_TIMEOUT);
    if let Some(api_key) = &cfg.api_key {
        req = req.header("X-Api-Key", api_key);
    }
    if let (Some(username), Some(password)) = (&cfg.username, &cfg.password) {
        req = req.basic_auth(username, Some(password));
    }
    let res = req.send().await.map_err(AppError::from)?;
    if !res.status().is_success() {
        return Err(AppError::BadRequest(format!(
            "{} {} returned {}",
            cfg.name,
            path,
            res.status()
        )));
    }
    res.json::<Value>().await.map_err(AppError::from)
}

async fn ecosystem_get_text(
    http: &reqwest::Client,
    cfg: &EcosystemConfig,
    path: &str,
) -> Result<String, AppError> {
    let mut req = http
        .get(ecosystem_url(cfg, path))
        .timeout(MEDIA_HTTP_TIMEOUT);
    if let Some(api_key) = &cfg.api_key {
        req = req.header("X-Api-Key", api_key);
    }
    if let (Some(username), Some(password)) = (&cfg.username, &cfg.password) {
        req = req.basic_auth(username, Some(password));
    }
    let res = req.send().await.map_err(AppError::from)?;
    if !res.status().is_success() {
        return Err(AppError::BadRequest(format!(
            "{} {} returned {}",
            cfg.name,
            path,
            res.status()
        )));
    }
    res.text().await.map_err(AppError::from)
}

async fn ecosystem_post_json(
    http: &reqwest::Client,
    cfg: &EcosystemConfig,
    path: &str,
    body: Value,
) -> Result<Value, AppError> {
    let mut req = http
        .post(ecosystem_url(cfg, path))
        .header("Accept", "application/json")
        .json(&body)
        .timeout(MEDIA_HTTP_TIMEOUT);
    if let Some(api_key) = &cfg.api_key {
        req = req.header("X-Api-Key", api_key);
    }
    if let (Some(username), Some(password)) = (&cfg.username, &cfg.password) {
        req = req.basic_auth(username, Some(password));
    }
    let res = req.send().await.map_err(AppError::from)?;
    let status = res.status();
    if !status.is_success() {
        let text = res.text().await.unwrap_or_default();
        return Err(AppError::BadRequest(format!(
            "{} {} returned {} {}",
            cfg.name, path, status, text
        )));
    }
    if status == reqwest::StatusCode::NO_CONTENT {
        return Ok(json!({}));
    }
    res.json::<Value>().await.map_err(AppError::from)
}

fn response_cookie(res: &reqwest::Response) -> Option<String> {
    res.headers()
        .get(SET_COOKIE)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.split(';').next())
        .map(ToString::to_string)
}

async fn qbittorrent_cookie(
    http: &reqwest::Client,
    cfg: &EcosystemConfig,
) -> Result<Option<String>, AppError> {
    let (Some(username), Some(password)) = (&cfg.username, &cfg.password) else {
        return Ok(None);
    };
    let form = [
        ("username", username.as_str()),
        ("password", password.as_str()),
    ];
    let res = http
        .post(ecosystem_url(cfg, "/api/v2/auth/login"))
        .header("Referer", &cfg.url)
        .form(&form)
        .timeout(MEDIA_HTTP_TIMEOUT)
        .send()
        .await
        .map_err(AppError::from)?;
    if !res.status().is_success() {
        return Err(AppError::BadRequest(format!(
            "{} login returned {}",
            cfg.name,
            res.status()
        )));
    }
    Ok(response_cookie(&res))
}

async fn qbittorrent_get_json(
    http: &reqwest::Client,
    cfg: &EcosystemConfig,
    path: &str,
) -> Result<Value, AppError> {
    let cookie = qbittorrent_cookie(http, cfg).await?;
    let mut req = http
        .get(ecosystem_url(cfg, path))
        .header("Accept", "application/json")
        .timeout(MEDIA_HTTP_TIMEOUT);
    if let Some(cookie) = cookie {
        req = req.header(COOKIE, cookie);
    }
    let res = req.send().await.map_err(AppError::from)?;
    if !res.status().is_success() {
        return Err(AppError::BadRequest(format!(
            "{} {} returned {}",
            cfg.name,
            path,
            res.status()
        )));
    }
    res.json::<Value>().await.map_err(AppError::from)
}

async fn qbittorrent_get_text(
    http: &reqwest::Client,
    cfg: &EcosystemConfig,
    path: &str,
) -> Result<String, AppError> {
    let cookie = qbittorrent_cookie(http, cfg).await?;
    let mut req = http
        .get(ecosystem_url(cfg, path))
        .timeout(MEDIA_HTTP_TIMEOUT);
    if let Some(cookie) = cookie {
        req = req.header(COOKIE, cookie);
    }
    let res = req.send().await.map_err(AppError::from)?;
    if !res.status().is_success() {
        return Err(AppError::BadRequest(format!(
            "{} {} returned {}",
            cfg.name,
            path,
            res.status()
        )));
    }
    res.text().await.map_err(AppError::from)
}

async fn qbittorrent_post_form(
    http: &reqwest::Client,
    cfg: &EcosystemConfig,
    path: &str,
    form: &[(&str, &str)],
) -> Result<Value, AppError> {
    let cookie = qbittorrent_cookie(http, cfg).await?;
    let mut req = http
        .post(ecosystem_url(cfg, path))
        .form(form)
        .timeout(MEDIA_HTTP_TIMEOUT);
    if let Some(cookie) = cookie {
        req = req.header(COOKIE, cookie);
    }
    let res = req.send().await.map_err(AppError::from)?;
    if !res.status().is_success() {
        return Err(AppError::BadRequest(format!(
            "{} {} returned {}",
            cfg.name,
            path,
            res.status()
        )));
    }
    let text = res.text().await.unwrap_or_default();
    Ok(json!({ "status": text }))
}

async fn transmission_rpc(
    http: &reqwest::Client,
    cfg: &EcosystemConfig,
    body: Value,
) -> Result<Value, AppError> {
    async fn send_once(
        http: &reqwest::Client,
        cfg: &EcosystemConfig,
        body: &Value,
        session: Option<&str>,
    ) -> Result<reqwest::Response, AppError> {
        let mut req = http
            .post(ecosystem_url(cfg, "/transmission/rpc"))
            .header("Accept", "application/json")
            .json(body)
            .timeout(MEDIA_HTTP_TIMEOUT);
        if let Some(session) = session {
            req = req.header("X-Transmission-Session-Id", session);
        }
        if let (Some(username), Some(password)) = (&cfg.username, &cfg.password) {
            req = req.basic_auth(username, Some(password));
        }
        req.send().await.map_err(AppError::from)
    }

    let res = send_once(http, cfg, &body, None).await?;
    let res = if res.status() == reqwest::StatusCode::CONFLICT {
        let session = res
            .headers()
            .get("X-Transmission-Session-Id")
            .and_then(|value| value.to_str().ok())
            .map(ToString::to_string)
            .ok_or_else(|| {
                AppError::BadRequest("Transmission did not return a session id".into())
            })?;
        send_once(http, cfg, &body, Some(&session)).await?
    } else {
        res
    };
    if !res.status().is_success() {
        return Err(AppError::BadRequest(format!(
            "{} rpc returned {}",
            cfg.name,
            res.status()
        )));
    }
    res.json::<Value>().await.map_err(AppError::from)
}

async fn deluge_cookie(
    http: &reqwest::Client,
    cfg: &EcosystemConfig,
) -> Result<Option<String>, AppError> {
    let Some(password) = &cfg.password else {
        return Ok(None);
    };
    let res = http
        .post(ecosystem_url(cfg, "/json"))
        .header("Accept", "application/json")
        .json(&json!({ "method": "auth.login", "params": [password], "id": 1 }))
        .timeout(MEDIA_HTTP_TIMEOUT)
        .send()
        .await
        .map_err(AppError::from)?;
    if !res.status().is_success() {
        return Err(AppError::BadRequest(format!(
            "{} login returned {}",
            cfg.name,
            res.status()
        )));
    }
    Ok(response_cookie(&res))
}

async fn deluge_rpc(
    http: &reqwest::Client,
    cfg: &EcosystemConfig,
    method: &str,
    params: Value,
) -> Result<Value, AppError> {
    let cookie = deluge_cookie(http, cfg).await?;
    let mut req = http
        .post(ecosystem_url(cfg, "/json"))
        .header("Accept", "application/json")
        .json(&json!({ "method": method, "params": params, "id": 1 }))
        .timeout(MEDIA_HTTP_TIMEOUT);
    if let Some(cookie) = cookie {
        req = req.header(COOKIE, cookie);
    }
    let res = req.send().await.map_err(AppError::from)?;
    if !res.status().is_success() {
        return Err(AppError::BadRequest(format!(
            "{} {} returned {}",
            cfg.name,
            method,
            res.status()
        )));
    }
    res.json::<Value>().await.map_err(AppError::from)
}

async fn nzbget_rpc(
    http: &reqwest::Client,
    cfg: &EcosystemConfig,
    method: &str,
    params: Value,
) -> Result<Value, AppError> {
    ecosystem_post_json(
        http,
        cfg,
        "/jsonrpc",
        json!({ "method": method, "params": params, "id": 1 }),
    )
    .await
}

async fn ecosystem_health(http: &reqwest::Client, cfg: &EcosystemConfig) -> Value {
    let health = match cfg.kind {
        EcosystemKind::Jellyfin | EcosystemKind::Emby => {
            ecosystem_get_json(http, cfg, "/System/Info/Public").await
        }
        EcosystemKind::Overseerr | EcosystemKind::Jellyseerr => {
            ecosystem_get_json(http, cfg, "/api/v1/status").await
        }
        EcosystemKind::Tautulli => {
            let key = urlencoding::encode(cfg.api_key.as_deref().unwrap_or(""));
            ecosystem_get_json(http, cfg, &format!("/api/v2?apikey={key}&cmd=status")).await
        }
        EcosystemKind::Bazarr => match ecosystem_get_json(http, cfg, "/api/system/status").await {
            Ok(value) => Ok(value),
            Err(_) => ecosystem_get_text(http, cfg, "/api/system/status")
                .await
                .map(|_| json!({}))
                .or_else(|_| Ok(json!({ "version": "detected" }))),
        },
        EcosystemKind::Jellystat => ecosystem_get_json(http, cfg, "/api/health").await,
        EcosystemKind::Qbittorrent => qbittorrent_get_text(http, cfg, "/api/v2/app/version")
            .await
            .map(|version| json!({ "version": version })),
        EcosystemKind::Sabnzbd => {
            let key = urlencoding::encode(cfg.api_key.as_deref().unwrap_or(""));
            ecosystem_get_json(
                http,
                cfg,
                &format!("/api?mode=version&output=json&apikey={key}"),
            )
            .await
        }
        EcosystemKind::Nzbget => ecosystem_get_json(http, cfg, "/jsonrpc/version").await,
        EcosystemKind::Transmission => {
            transmission_rpc(
                http,
                cfg,
                json!({ "method": "session-get", "arguments": { "fields": ["version"] } }),
            )
            .await
        }
        EcosystemKind::Deluge => deluge_rpc(http, cfg, "web.connected", json!([])).await,
        EcosystemKind::Unraid | EcosystemKind::Wizarr => {
            ecosystem_get_text(http, cfg, "/").await.map(|_| json!({}))
        }
    };

    json!({
        "id": cfg.id,
        "name": cfg.name,
        "host": service_host(&cfg.url),
        "kind": ecosystem_kind_label(cfg.kind),
        "configured": true,
        "healthy": health.is_ok(),
        "version": health.ok().and_then(|value| {
            value.get("version")
                .or_else(|| value.get("Version"))
                .or_else(|| value.get("appData").and_then(|v| v.get("version")))
                .or_else(|| value.get("response").and_then(|v| v.get("version")))
                .and_then(Value::as_str)
                .map(ToString::to_string)
        }),
    })
}

async fn service_health(http: &reqwest::Client, cfg: &ArrConfig) -> Value {
    match arr_fetch_value(http, cfg, "/system/status").await {
        Some(status) => json!({
            "id": cfg.id,
            "name": cfg.name,
            "host": service_host(&cfg.url),
            "kind": match cfg.kind {
                ArrKind::Sonarr => "series",
                ArrKind::Radarr => "movie",
                ArrKind::Lidarr => "music",
                ArrKind::Prowlarr => "indexer",
            },
            "configured": true,
            "healthy": true,
            "version": status.get("version").and_then(Value::as_str).unwrap_or("unknown"),
            "appName": status.get("appName").and_then(Value::as_str).unwrap_or(cfg.name),
        }),
        None => json!({
            "id": cfg.id,
            "name": cfg.name,
            "host": service_host(&cfg.url),
            "kind": match cfg.kind {
                ArrKind::Sonarr => "series",
                ArrKind::Radarr => "movie",
                ArrKind::Lidarr => "music",
                ArrKind::Prowlarr => "indexer",
            },
            "configured": true,
            "healthy": false,
        }),
    }
}

async fn plex_service_health(http: &reqwest::Client, cfg: &PlexConfig) -> Value {
    let host = service_host(&cfg.url);
    match plex_fetch::<Value>(http, cfg, "/identity").await {
        Some(identity) => json!({
            "id": "plex",
            "name": "Plex",
            "host": host,
            "kind": "streaming",
            "configured": true,
            "healthy": true,
            "version": identity
                .get("MediaContainer")
                .and_then(|container| container.get("version"))
                .and_then(Value::as_str)
                .unwrap_or("configured"),
        }),
        None => json!({
            "id": "plex",
            "name": "Plex",
            "host": host,
            "kind": "streaming",
            "configured": true,
            "healthy": false,
        }),
    }
}

async fn generic_web_service_health(
    state: &AppState,
    http: &reqwest::Client,
    def: &MediaServiceDefinition,
    detections: &[MediaDockerDetection],
) -> Option<Value> {
    let service_detections = detections_for_service(def, detections);
    let url = def
        .url_env
        .and_then(|key| {
            let value = media_secret(state, key);
            if value.trim().is_empty() {
                None
            } else {
                Some(trim_url(value))
            }
        })
        .or_else(|| {
            service_detections.iter().find_map(|detection| {
                detection
                    .get("detected_url")
                    .and_then(Value::as_str)
                    .map(ToString::to_string)
            })
        })?;

    let health_path = match def.id {
        "grafana" => "/api/health",
        "prometheus" => "/-/healthy",
        "loki" => "/ready",
        "alloy" => "/-/ready",
        _ => "",
    };
    let health_url = format!("{url}{health_path}");
    let healthy = http
        .get(&health_url)
        .timeout(MEDIA_HTTP_TIMEOUT)
        .send()
        .await
        .map(|res| res.status().is_success())
        .unwrap_or(false);

    Some(json!({
        "id": def.id,
        "name": def.name,
        "host": service_host(&url),
        "url": url,
        "kind": def.kind,
        "configured": true,
        "healthy": healthy,
    }))
}

async fn service_status_for_definition(
    state: &AppState,
    def: &MediaServiceDefinition,
    detections: &[MediaDockerDetection],
) -> Value {
    let http = &state.http;
    match def.id {
        "plex" => match plex_config(state) {
            Some(cfg) => normalize_service_value(
                state,
                def,
                plex_service_health(http, &cfg).await,
                detections,
                true,
            ),
            None => stub_for_definition(state, def, detections),
        },
        "sonarr" | "radarr" | "lidarr" | "prowlarr" => match arr_config(state, def.id) {
            Some(cfg) => normalize_service_value(
                state,
                def,
                service_health(http, &cfg).await,
                detections,
                true,
            ),
            None => stub_for_definition(state, def, detections),
        },
        "jellyfin" | "emby" | "overseerr" | "jellyseerr" | "tautulli" | "bazarr" | "jellystat"
        | "qbittorrent" | "sabnzbd" | "nzbget" | "transmission" | "deluge" | "unraid"
        | "wizarr" => match ecosystem_config(state, def.id) {
            Some(cfg) => normalize_service_value(
                state,
                def,
                ecosystem_health(http, &cfg).await,
                detections,
                true,
            ),
            None => stub_for_definition(state, def, detections),
        },
        "flaresolverr" | "picard" | "koel" | "grafana" | "prometheus" | "loki" | "alloy"
        | "cloudflared" | "crowdsec" | "pelican" | "vaultwarden" => {
            match generic_web_service_health(state, http, def, detections).await {
                Some(service) => normalize_service_value(state, def, service, detections, true),
                None => stub_for_definition(state, def, detections),
            }
        }
        _ => stub_for_definition(state, def, detections),
    }
}

async fn build_media_services(state: &AppState, detections: &[MediaDockerDetection]) -> Vec<Value> {
    join_all(
        MEDIA_SERVICE_REGISTRY
            .iter()
            .map(|def| service_status_for_definition(state, def, detections)),
    )
    .await
}

fn media_discovery_items(state: &AppState, detections: &[MediaDockerDetection]) -> Vec<Value> {
    MEDIA_SERVICE_REGISTRY
        .iter()
        .flat_map(|def| {
            let service_detections = detections_for_service(def, detections);
            let missing = missing_envs_with_detections(state, def, &service_detections);
            let configured = missing.is_empty();
            service_detections.into_iter().map(move |mut detection| {
                if let Some(obj) = detection.as_object_mut() {
                    obj.insert("configured".into(), json!(configured));
                    obj.insert("missing_credentials".into(), json!(missing));
                    obj.insert("credential_keys".into(), json!(def.credential_keys));
                    obj.insert("default_port".into(), json!(def.default_port));
                }
                detection
            })
        })
        .collect()
}

fn media_capabilities() -> Value {
    let mut capabilities = serde_json::Map::new();
    for def in MEDIA_SERVICE_REGISTRY {
        capabilities.insert(
            def.id.to_string(),
            json!({
                "actions": def.actions,
                "group": def.group,
                "kind": def.kind,
                "credential_keys": def.credential_keys,
                "default_port": def.default_port,
            }),
        );
    }
    Value::Object(capabilities)
}

fn add_service_tag(service: &ArrConfig, mut value: Value) -> Value {
    if let Some(obj) = value.as_object_mut() {
        obj.insert("service".into(), json!(service.id));
        obj.insert("serviceName".into(), json!(service.name));
    }
    value
}

fn extract_records(value: Value) -> Vec<Value> {
    for key in ["records", "data", "results", "rows"] {
        if let Some(records) = value.get(key).and_then(Value::as_array) {
            return records.clone();
        }
    }
    value.as_array().cloned().unwrap_or_default()
}

async fn fetch_arr_queue(http: &reqwest::Client, cfg: &ArrConfig) -> Vec<Value> {
    if cfg.kind == ArrKind::Prowlarr {
        return Vec::new();
    }
    let Some(value) = arr_fetch_value(http, cfg, "/queue?page=1&pageSize=50").await else {
        return Vec::new();
    };
    extract_records(value)
        .into_iter()
        .map(|v| add_service_tag(cfg, v))
        .collect()
}

async fn fetch_arr_calendar(
    http: &reqwest::Client,
    cfg: &ArrConfig,
    start: &str,
    end: &str,
) -> Vec<Value> {
    if cfg.kind == ArrKind::Prowlarr {
        return Vec::new();
    }
    let path = format!("/calendar?start={start}&end={end}&includeSeries=true");
    let Some(value) = arr_fetch_value(http, cfg, &path).await else {
        return Vec::new();
    };
    extract_records(value)
        .into_iter()
        .map(|v| add_service_tag(cfg, v))
        .collect()
}

async fn fetch_arr_library(http: &reqwest::Client, cfg: &ArrConfig) -> Vec<Value> {
    let path = match cfg.kind {
        ArrKind::Sonarr => "/series",
        ArrKind::Radarr => "/movie?excludeLocalCovers=true",
        ArrKind::Lidarr => "/artist",
        ArrKind::Prowlarr => return Vec::new(),
    };
    let Some(value) = arr_fetch_value(http, cfg, path).await else {
        return Vec::new();
    };
    extract_records(value)
        .into_iter()
        .take(60)
        .map(|v| add_service_tag(cfg, v))
        .collect()
}

async fn fetch_arr_wanted(http: &reqwest::Client, cfg: &ArrConfig) -> Vec<Value> {
    if cfg.kind == ArrKind::Prowlarr {
        return Vec::new();
    }
    let Some(value) = arr_fetch_value(http, cfg, "/wanted/missing?page=1&pageSize=50").await else {
        return Vec::new();
    };
    extract_records(value)
        .into_iter()
        .map(|v| add_service_tag(cfg, v))
        .collect()
}

async fn fetch_arr_history(http: &reqwest::Client, cfg: &ArrConfig) -> Vec<Value> {
    if cfg.kind == ArrKind::Prowlarr {
        return Vec::new();
    }
    let Some(value) = arr_fetch_value(http, cfg, "/history?page=1&pageSize=50").await else {
        return Vec::new();
    };
    extract_records(value)
        .into_iter()
        .map(|v| add_service_tag(cfg, v))
        .collect()
}

async fn fetch_arr_indexers(http: &reqwest::Client, cfg: &ArrConfig) -> Vec<Value> {
    if cfg.kind != ArrKind::Prowlarr {
        return Vec::new();
    }
    let Some(value) = arr_fetch_value(http, cfg, "/indexer").await else {
        return Vec::new();
    };
    extract_records(value)
        .into_iter()
        .map(|v| add_service_tag(cfg, v))
        .collect()
}

async fn fetch_arr_health(http: &reqwest::Client, cfg: &ArrConfig) -> Vec<Value> {
    if cfg.kind != ArrKind::Prowlarr {
        return Vec::new();
    }
    let Some(value) = arr_fetch_value(http, cfg, "/health").await else {
        return Vec::new();
    };
    extract_records(value)
        .into_iter()
        .map(|v| add_service_tag(cfg, v))
        .collect()
}

fn add_ecosystem_tag(service: &EcosystemConfig, mut value: Value) -> Value {
    if let Some(obj) = value.as_object_mut() {
        obj.insert("service".into(), json!(service.id));
        obj.insert("serviceName".into(), json!(service.name));
    }
    value
}

async fn fetch_ecosystem_requests(http: &reqwest::Client, cfg: &EcosystemConfig) -> Vec<Value> {
    if !matches!(
        cfg.kind,
        EcosystemKind::Overseerr | EcosystemKind::Jellyseerr
    ) {
        return Vec::new();
    }
    let Ok(value) = ecosystem_get_json(http, cfg, "/api/v1/request?take=50&skip=0").await else {
        return Vec::new();
    };
    let requests = value
        .get("results")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .collect::<Vec<_>>();
    join_all(
        requests
            .into_iter()
            .map(|request| enrich_media_request(http, cfg, request)),
    )
    .await
}

async fn enrich_media_request(
    http: &reqwest::Client,
    cfg: &EcosystemConfig,
    mut request: Value,
) -> Value {
    let has_title = request
        .pointer("/media/title")
        .and_then(Value::as_str)
        .is_some_and(|title| !title.trim().is_empty());
    let media_type = request
        .pointer("/media/mediaType")
        .or_else(|| request.get("type"))
        .and_then(Value::as_str)
        .map(str::to_string);
    let tmdb_id = request.pointer("/media/tmdbId").and_then(value_as_u64);

    if !has_title {
        if let (Some(media_type), Some(tmdb_id)) = (media_type, tmdb_id) {
            let path = match media_type.as_str() {
                "movie" => Some(format!("/api/v1/movie/{tmdb_id}")),
                "tv" => Some(format!("/api/v1/tv/{tmdb_id}")),
                _ => None,
            };
            if let Some(path) = path {
                if let Ok(detail) = ecosystem_get_json(http, cfg, &path).await {
                    let title = detail
                        .get("title")
                        .or_else(|| detail.get("name"))
                        .or_else(|| detail.get("originalTitle"))
                        .or_else(|| detail.get("originalName"))
                        .and_then(Value::as_str)
                        .filter(|title| !title.trim().is_empty())
                        .map(str::to_string);
                    let year = detail
                        .get("releaseDate")
                        .or_else(|| detail.get("firstAirDate"))
                        .and_then(Value::as_str)
                        .and_then(|date| date.get(0..4))
                        .and_then(|year| year.parse::<u16>().ok());
                    if let Some(media) = request.get_mut("media").and_then(Value::as_object_mut) {
                        if let Some(title) = title {
                            media.insert("title".into(), json!(title));
                        }
                        if let Some(year) = year {
                            media.insert("year".into(), json!(year));
                        }
                    }
                }
            }
        }
    }

    add_ecosystem_tag(cfg, request)
}

async fn fetch_ecosystem_streams(http: &reqwest::Client, cfg: &EcosystemConfig) -> Vec<Value> {
    match cfg.kind {
        EcosystemKind::Tautulli => {
            let key = urlencoding::encode(cfg.api_key.as_deref().unwrap_or(""));
            let Ok(value) =
                ecosystem_get_json(http, cfg, &format!("/api/v2?apikey={key}&cmd=get_activity"))
                    .await
            else {
                return Vec::new();
            };
            value
                .get("response")
                .and_then(|v| v.get("data"))
                .and_then(|v| v.get("sessions"))
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default()
                .into_iter()
                .map(|v| add_ecosystem_tag(cfg, v))
                .collect()
        }
        _ => Vec::new(),
    }
}

async fn fetch_ecosystem_subtitles(http: &reqwest::Client, cfg: &EcosystemConfig) -> Vec<Value> {
    if cfg.kind != EcosystemKind::Bazarr {
        return Vec::new();
    }
    let mut out = Vec::new();
    for path in ["/api/movies/wanted", "/api/episodes/wanted"] {
        match ecosystem_get_json(http, cfg, path).await {
            Ok(value) => {
                let records = extract_records(value);
                tracing::debug!(
                    service = cfg.id,
                    path,
                    count = records.len(),
                    "fetched Bazarr subtitle wanted records"
                );
                out.extend(records.into_iter().map(|v| add_ecosystem_tag(cfg, v)));
            }
            Err(err) => {
                tracing::warn!(
                    service = cfg.id,
                    path,
                    error = ?err,
                    "failed to fetch Bazarr subtitle wanted records"
                );
            }
        }
    }
    out
}

async fn fetch_ecosystem_downloads(http: &reqwest::Client, cfg: &EcosystemConfig) -> Vec<Value> {
    match cfg.kind {
        EcosystemKind::Sabnzbd => {
            let key = urlencoding::encode(cfg.api_key.as_deref().unwrap_or(""));
            let Ok(value) = ecosystem_get_json(
                http,
                cfg,
                &format!("/api?mode=queue&output=json&apikey={key}"),
            )
            .await
            else {
                return Vec::new();
            };
            value
                .get("queue")
                .and_then(|queue| queue.get("slots"))
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default()
                .into_iter()
                .map(|v| add_ecosystem_tag(cfg, v))
                .collect()
        }
        EcosystemKind::Qbittorrent => {
            let Ok(value) = qbittorrent_get_json(http, cfg, "/api/v2/torrents/info").await else {
                return Vec::new();
            };
            value
                .as_array()
                .cloned()
                .unwrap_or_default()
                .into_iter()
                .map(|v| add_ecosystem_tag(cfg, v))
                .collect()
        }
        EcosystemKind::Nzbget => {
            let Ok(value) = ecosystem_get_json(http, cfg, "/jsonrpc/listgroups").await else {
                return Vec::new();
            };
            value
                .get("result")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default()
                .into_iter()
                .map(|v| add_ecosystem_tag(cfg, v))
                .collect()
        }
        EcosystemKind::Transmission => {
            let Ok(value) = transmission_rpc(
                http,
                cfg,
                json!({
                    "method": "torrent-get",
                    "arguments": {
                        "fields": ["id", "name", "status", "percentDone", "totalSize", "rateDownload", "eta"]
                    }
                }),
            )
            .await
            else {
                return Vec::new();
            };
            value
                .get("arguments")
                .and_then(|v| v.get("torrents"))
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default()
                .into_iter()
                .map(|mut v| {
                    if let Some(obj) = v.as_object_mut() {
                        if let Some(progress) = obj.get("percentDone").and_then(Value::as_f64) {
                            obj.insert("progress".into(), json!((progress * 100.0).round()));
                        }
                        if let Some(size) = obj.get("totalSize").cloned() {
                            obj.insert("size".into(), size);
                        }
                    }
                    add_ecosystem_tag(cfg, v)
                })
                .collect()
        }
        EcosystemKind::Deluge => {
            let Ok(value) = deluge_rpc(
                http,
                cfg,
                "web.update_ui",
                json!([
                    [
                        "name",
                        "state",
                        "progress",
                        "total_size",
                        "download_payload_rate",
                        "eta"
                    ],
                    {}
                ]),
            )
            .await
            else {
                return Vec::new();
            };
            let Some(torrents) = value
                .get("result")
                .and_then(|v| v.get("torrents"))
                .and_then(Value::as_object)
            else {
                return Vec::new();
            };
            torrents
                .iter()
                .map(|(id, value)| {
                    let mut item = value.clone();
                    if let Some(obj) = item.as_object_mut() {
                        obj.insert("id".into(), json!(id));
                        if let Some(size) = obj.get("total_size").cloned() {
                            obj.insert("size".into(), size);
                        }
                        if let Some(state) = obj.get("state").cloned() {
                            obj.insert("status".into(), state);
                        }
                    }
                    add_ecosystem_tag(cfg, item)
                })
                .collect()
        }
        _ => Vec::new(),
    }
}

async fn first_option_id(http: &reqwest::Client, cfg: &ArrConfig, path: &str) -> Option<i64> {
    let value = arr_fetch_value(http, cfg, path).await?;
    value
        .as_array()
        .and_then(|items| items.first())
        .and_then(|item| item.get("id"))
        .and_then(Value::as_i64)
}

async fn first_root_path(http: &reqwest::Client, cfg: &ArrConfig) -> Option<String> {
    let value = arr_fetch_value(http, cfg, "/rootfolder").await?;
    value
        .as_array()
        .and_then(|items| items.first())
        .and_then(|item| item.get("path"))
        .and_then(Value::as_str)
        .map(ToString::to_string)
}

fn merge_object(mut base: Value, extra: Value) -> Value {
    if let (Some(base_obj), Some(extra_obj)) = (base.as_object_mut(), extra.as_object()) {
        for (k, v) in extra_obj {
            base_obj.insert(k.clone(), v.clone());
        }
    }
    base
}

fn copy_field(src: &Value, dst: &mut Map<String, Value>, key: &str) {
    if let Some(value) = src.get(key) {
        dst.insert(key.to_string(), value.clone());
    }
}

fn picked_object(src: &Value, keys: &[&str]) -> Option<Value> {
    let mut out = Map::new();
    for key in keys {
        copy_field(src, &mut out, key);
    }
    if out.is_empty() {
        None
    } else {
        Some(Value::Object(out))
    }
}

fn copy_nested(src: &Value, dst: &mut Map<String, Value>, key: &str, keys: &[&str]) {
    if let Some(value) = src.get(key).and_then(|value| picked_object(value, keys)) {
        dst.insert(key.to_string(), value);
    }
}

fn normalize_media_record(src: Value, keys: &[&str], nested: &[(&str, &[&str])]) -> Value {
    let mut out = Map::new();
    copy_field(&src, &mut out, "service");
    copy_field(&src, &mut out, "serviceName");
    for key in keys {
        copy_field(&src, &mut out, key);
    }
    for (key, nested_keys) in nested {
        copy_nested(&src, &mut out, key, nested_keys);
    }
    Value::Object(out)
}

fn detail_kind_for_service(service: &str, fallback: &str) -> &'static str {
    if fallback == "episode" {
        return "episode";
    }
    match service {
        "sonarr" => "series",
        "radarr" => "movie",
        "lidarr" => "artist",
        "plex" => "media",
        _ => match fallback {
            "episode" => "episode",
            _ => "item",
        },
    }
}

fn attach_detail_ref(value: &mut Value, fallback_kind: &str) {
    let Some(obj) = value.as_object_mut() else {
        return;
    };
    let Some(service) = obj
        .get("service")
        .and_then(Value::as_str)
        .map(ToString::to_string)
    else {
        return;
    };
    let id = obj
        .get("id")
        .and_then(|value| {
            value
                .as_i64()
                .map(|id| id.to_string())
                .or_else(|| value.as_str().map(ToString::to_string))
        })
        .or_else(|| {
            obj.get("series")
                .and_then(|series| series.get("id"))
                .and_then(Value::as_i64)
                .map(|id| id.to_string())
        });
    if let Some(id) = id {
        let kind = detail_kind_for_service(&service, fallback_kind);
        obj.insert("kind".into(), json!(kind));
        obj.insert("detail_id".into(), json!(id.clone()));
        obj.insert("detail_ref".into(), detail_ref(&service, kind, id));
    }
}

fn normalize_queue_item(value: Value) -> Value {
    normalize_media_record(
        value,
        &[
            "id",
            "title",
            "status",
            "trackedDownloadStatus",
            "timeleft",
            "sizeleft",
            "size",
        ],
        &[
            ("movie", &["title", "id"]),
            ("series", &["title", "id"]),
            ("episode", &["title", "seasonNumber", "episodeNumber"]),
            ("artist", &["artistName"]),
        ],
    )
}

fn normalize_library_item(value: Value) -> Value {
    let mut out = normalize_media_record(
        value,
        &[
            "id",
            "title",
            "artistName",
            "year",
            "network",
            "studio",
            "genres",
            "monitored",
            "hasFile",
        ],
        &[("statistics", &["episodeFileCount", "episodeCount"])],
    );
    attach_detail_ref(&mut out, "item");
    out
}

fn normalize_calendar_item(value: Value) -> Value {
    let mut out = normalize_media_record(
        value,
        &[
            "id",
            "title",
            "airDateUtc",
            "releaseDate",
            "inCinemas",
            "seasonNumber",
            "episodeNumber",
        ],
        &[("movie", &["title", "id"]), ("series", &["title", "id"])],
    );
    attach_detail_ref(&mut out, "episode");
    out
}

fn normalize_wanted_item(value: Value) -> Value {
    let mut out = normalize_media_record(
        value,
        &[
            "id",
            "title",
            "sourceTitle",
            "eventType",
            "airDateUtc",
            "releaseDate",
            "date",
        ],
        &[
            ("movie", &["title"]),
            ("series", &["title"]),
            ("artist", &["artistName"]),
            ("episode", &["title", "seasonNumber", "episodeNumber"]),
            ("album", &["title"]),
            ("data", &["droppedPath", "importedPath", "releaseGroup"]),
        ],
    );
    attach_detail_ref(&mut out, "episode");
    out
}

fn normalize_indexer_item(value: Value) -> Value {
    normalize_media_record(
        value,
        &[
            "id",
            "name",
            "enable",
            "protocol",
            "priority",
            "implementationName",
        ],
        &[],
    )
}

fn normalize_indexer_health_item(value: Value) -> Value {
    normalize_media_record(value, &["source", "type", "message", "wikiUrl"], &[])
}

fn normalize_release_item(value: Value) -> Value {
    let grab_payload = value.clone();
    let mut out = normalize_media_record(
        value,
        &[
            "id",
            "guid",
            "title",
            "sortTitle",
            "indexer",
            "indexerId",
            "indexer_id",
            "protocol",
            "size",
            "seeders",
            "leechers",
            "age",
            "ageHours",
            "ageMinutes",
            "publishDate",
            "downloadUrl",
            "magnetUrl",
            "infoUrl",
            "downloadClientId",
        ],
        &[("categories", &["id", "name"])],
    );
    if let Some(obj) = out.as_object_mut() {
        obj.insert("grabPayload".into(), grab_payload);
    }
    out
}

fn normalize_request_item(value: Value) -> Value {
    normalize_media_record(
        value,
        &["id", "status", "createdAt"],
        &[
            (
                "media",
                &[
                    "title",
                    "name",
                    "mediaType",
                    "tmdbId",
                    "tvdbId",
                    "year",
                    "status",
                    "status4k",
                ],
            ),
            ("requestedBy", &["displayName", "email"]),
        ],
    )
}

fn nested_i64(value: &Value, path: &[&str]) -> Option<i64> {
    let mut cursor = value;
    for key in path {
        cursor = cursor.get(*key)?;
    }
    cursor
        .as_i64()
        .or_else(|| cursor.as_u64().and_then(|id| i64::try_from(id).ok()))
        .or_else(|| cursor.as_str().and_then(|raw| raw.parse::<i64>().ok()))
}

fn arr_related_record_matches(
    cfg: &ArrConfig,
    detail_kind: &str,
    detail_id: i64,
    record: &Value,
) -> bool {
    match cfg.kind {
        ArrKind::Sonarr if detail_kind == "episode" => {
            nested_i64(record, &["id"]) == Some(detail_id)
                || nested_i64(record, &["episodeId"]) == Some(detail_id)
                || nested_i64(record, &["episode", "id"]) == Some(detail_id)
        }
        ArrKind::Sonarr => {
            nested_i64(record, &["id"]) == Some(detail_id)
                || nested_i64(record, &["seriesId"]) == Some(detail_id)
                || nested_i64(record, &["series", "id"]) == Some(detail_id)
        }
        ArrKind::Radarr => {
            nested_i64(record, &["id"]) == Some(detail_id)
                || nested_i64(record, &["movieId"]) == Some(detail_id)
                || nested_i64(record, &["movie", "id"]) == Some(detail_id)
        }
        ArrKind::Lidarr => {
            nested_i64(record, &["id"]) == Some(detail_id)
                || nested_i64(record, &["artistId"]) == Some(detail_id)
                || nested_i64(record, &["artist", "id"]) == Some(detail_id)
        }
        ArrKind::Prowlarr => false,
    }
}

async fn arr_detail_context(
    http: &reqwest::Client,
    cfg: &ArrConfig,
    detail_kind: &str,
    detail_id: i64,
) -> Value {
    if cfg.kind == ArrKind::Prowlarr {
        return json!({ "queue": [], "wanted": [], "history": [] });
    }
    let (queue, wanted, history) = tokio::join!(
        async {
            fetch_arr_queue(http, cfg)
                .await
                .into_iter()
                .filter(|item| arr_related_record_matches(cfg, detail_kind, detail_id, item))
                .map(normalize_queue_item)
                .collect::<Vec<_>>()
        },
        async {
            fetch_arr_wanted(http, cfg)
                .await
                .into_iter()
                .filter(|item| arr_related_record_matches(cfg, detail_kind, detail_id, item))
                .map(normalize_wanted_item)
                .collect::<Vec<_>>()
        },
        async {
            fetch_arr_history(http, cfg)
                .await
                .into_iter()
                .filter(|item| arr_related_record_matches(cfg, detail_kind, detail_id, item))
                .map(normalize_wanted_item)
                .collect::<Vec<_>>()
        },
    );
    json!({ "queue": queue, "wanted": wanted, "history": history })
}

fn normalize_stream_item(value: Value) -> Value {
    let original = value.clone();
    let mut out = normalize_media_record(
        value,
        &[
            "title",
            "full_title",
            "user",
            "username",
            "friendly_name",
            "player",
            "product",
            "state",
            "transcode_decision",
            "video_decision",
            "audio_decision",
            "progress",
            "progress_percent",
            "view_offset",
            "duration",
        ],
        &[],
    );
    if let Some(obj) = out.as_object_mut() {
        if obj.get("player").and_then(Value::as_str).is_none() {
            if let Some(player) = original
                .get("friendly_name")
                .or_else(|| original.get("product"))
                .and_then(Value::as_str)
                .filter(|value| !value.trim().is_empty())
            {
                obj.insert("player".into(), json!(player));
            }
        }
        if obj
            .get("transcode_decision")
            .and_then(Value::as_str)
            .is_none()
        {
            let decision = original
                .get("video_decision")
                .or_else(|| original.get("audio_decision"))
                .and_then(Value::as_str)
                .filter(|value| !value.trim().is_empty());
            if let Some(decision) = decision {
                obj.insert("transcode_decision".into(), json!(decision));
            }
        }
        if obj.get("progress").and_then(Value::as_f64).is_none() {
            let progress = original
                .get("progress_percent")
                .and_then(Value::as_f64)
                .or_else(|| {
                    let view_offset = original.get("view_offset").and_then(value_as_u64)?;
                    let duration = original.get("duration").and_then(value_as_u64)?;
                    (duration > 0).then_some((view_offset as f64 / duration as f64) * 100.0)
                });
            if let Some(progress) = progress {
                obj.insert("progress".into(), json!(progress.round()));
            }
        }
    }
    out
}

fn normalize_download_item(value: Value) -> Value {
    normalize_media_record(
        value,
        &[
            "id",
            "hash",
            "nzo_id",
            "NZBID",
            "ID",
            "name",
            "filename",
            "status",
            "state",
            "category",
            "tags",
            "progress",
            "percentage",
            "percentDone",
            "ratio",
            "eta",
            "dlspeed",
            "upspeed",
            "amount_left",
            "mb",
            "size",
            "totalSize",
        ],
        &[],
    )
}

fn normalize_subtitle_item(value: Value) -> Value {
    let mut out = normalize_media_record(
        value.clone(),
        &[
            "id",
            "title",
            "language",
            "missing_subtitles",
            "radarrId",
            "sonarrSeriesId",
            "sonarrEpisodeId",
            "seriesTitle",
            "episode_number",
            "episodeTitle",
            "sceneName",
            "airDateUtc",
            "releaseDate",
        ],
        &[
            ("movie", &["title"]),
            ("series", &["title"]),
            ("episode", &["title", "seasonNumber", "episodeNumber"]),
        ],
    );

    if let Some(obj) = out.as_object_mut() {
        if !obj.contains_key("title") {
            if let Some(title) = value.get("seriesTitle").and_then(Value::as_str) {
                let episode = value
                    .get("episode_number")
                    .and_then(Value::as_str)
                    .unwrap_or("");
                let episode_title = value
                    .get("episodeTitle")
                    .and_then(Value::as_str)
                    .unwrap_or("");
                obj.insert(
                    "title".into(),
                    json!(format!("{title} {episode} {episode_title}").trim()),
                );
            }
        }

        if let Some(missing) = value.get("missing_subtitles").and_then(Value::as_array) {
            let languages: Vec<String> = missing
                .iter()
                .filter_map(|item| {
                    item.as_str().map(ToString::to_string).or_else(|| {
                        item.get("name")
                            .and_then(Value::as_str)
                            .map(ToString::to_string)
                    })
                })
                .collect();
            if !languages.is_empty() {
                obj.insert("missing_subtitles".into(), json!(languages));
            }
            let details: Vec<Value> = missing
                .iter()
                .filter_map(|item| item.as_object())
                .map(|item| {
                    json!({
                        "name": item.get("name").and_then(Value::as_str),
                        "code2": item.get("code2").and_then(Value::as_str),
                        "code3": item.get("code3").and_then(Value::as_str),
                        "forced": item.get("forced").and_then(Value::as_bool).unwrap_or(false),
                        "hi": item.get("hi").and_then(Value::as_bool).unwrap_or(false),
                    })
                })
                .collect();
            if !details.is_empty() {
                obj.insert("missing_subtitle_details".into(), json!(details));
            }
        }
    }

    out
}

fn build_browse_items(library: &[Value]) -> Vec<Value> {
    library
        .iter()
        .filter(|item| {
            item.get("detail_ref").is_some()
                && (item.get("title").is_some() || item.get("artistName").is_some())
        })
        .cloned()
        .collect()
}

// ── Mock data (matches TypeScript MOCK_DATA) ────────────────────────────────

fn mock_recently_added() -> Vec<RecentlyAdded> {
    vec![
        RecentlyAdded {
            title: "Breaking Bad".into(),
            media_type: "show".into(),
            service: Some("sonarr".into()),
            kind: Some("series".into()),
            id: Some("demo-breaking-bad".into()),
            subtitle: Some("Series".into()),
            year: Some(2008),
            detail_id: Some("demo-breaking-bad".into()),
            detail_ref: Some(
                json!({"service": "sonarr", "kind": "series", "id": "demo-breaking-bad"}),
            ),
        },
        RecentlyAdded {
            title: "Inception".into(),
            media_type: "movie".into(),
            service: Some("radarr".into()),
            kind: Some("movie".into()),
            id: Some("demo-inception".into()),
            subtitle: Some("Movie".into()),
            year: Some(2010),
            detail_id: Some("demo-inception".into()),
            detail_ref: Some(json!({"service": "radarr", "kind": "movie", "id": "demo-inception"})),
        },
    ]
}

fn mock_upcoming() -> Vec<Upcoming> {
    vec![
        Upcoming {
            title: "House of Dragon S2E5".into(),
            air_date: "2026-03-10".into(),
            service: Some("sonarr".into()),
            kind: Some("episode".into()),
            id: Some("demo-house-dragon-s02e05".into()),
            subtitle: Some("Episode".into()),
            detail_id: Some("demo-house-dragon-s02e05".into()),
            detail_ref: Some(
                json!({"service": "sonarr", "kind": "episode", "id": "demo-house-dragon-s02e05"}),
            ),
        },
        Upcoming {
            title: "Severance S2E8".into(),
            air_date: "2026-03-12".into(),
            service: Some("sonarr".into()),
            kind: Some("episode".into()),
            id: Some("demo-severance-s02e08".into()),
            subtitle: Some("Episode".into()),
            detail_id: Some("demo-severance-s02e08".into()),
            detail_ref: Some(
                json!({"service": "sonarr", "kind": "episode", "id": "demo-severance-s02e08"}),
            ),
        },
    ]
}

fn mock_response() -> Value {
    let services: Vec<Value> = MEDIA_SERVICE_REGISTRY
        .iter()
        .map(|def| {
            json!({
                "id": def.id,
                "name": def.name,
                "label": def.name,
                "group": def.group,
                "kind": def.kind,
                "default_port": def.default_port,
                "configured": false,
                "detected": false,
                "healthy": false,
                "state": "not_detected",
                "status": "not_detected",
                "missing_credentials": def.required_envs,
                "credential_keys": def.credential_keys,
                "actions": def.actions,
                "detections": [],
            })
        })
        .collect();
    json!({
        "now_playing": null,
        "recently_added": mock_recently_added(),
        "upcoming": mock_upcoming(),
        "services": services,
        "queue": [],
        "calendar": [],
        "library": [],
        "browse": [],
        "wanted": [],
        "history": [],
        "indexers": [],
        "indexer_health": [],
        "requests": [],
        "streams": [],
        "subtitles": [],
        "downloads": [],
        "detections": [],
        "capabilities": media_capabilities(),
        "mock": true,
    })
}

// ── GET /media ──────────────────────────────────────────────────────────────

async fn get_media(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let plex_cfg = plex_config(&state);
    let sonarr_cfg = sonarr_config(&state);
    let radarr_cfg = radarr_config(&state);
    let arr_services = all_arr_configs(&state);
    let ecosystem_services = all_ecosystem_configs(&state);
    let docker_detections = fetch_media_docker_detections(&state).await;

    // If nothing is configured or detected, return mock data.
    if plex_cfg.is_none()
        && sonarr_cfg.is_none()
        && radarr_cfg.is_none()
        && arr_services.is_empty()
        && ecosystem_services.is_empty()
        && docker_detections.is_empty()
    {
        return Ok(Json(mock_response()));
    }

    let http = &state.http;

    // Build date range for Sonarr calendar: today .. today + 14 days
    let today = chrono::Utc::now().format("%Y-%m-%d").to_string();
    let end_date = (chrono::Utc::now() + chrono::Duration::days(14))
        .format("%Y-%m-%d")
        .to_string();

    // Fire all requests in parallel using tokio::join!
    // Each future resolves to Option<T>, so partial failures are handled gracefully.
    let (plex_sessions, plex_recently, sonarr_calendar, sonarr_series, radarr_movies) = tokio::join!(
        // Plex: currently playing sessions
        async {
            match &plex_cfg {
                Some(cfg) => {
                    plex_fetch::<PlexMediaContainer<PlexSession>>(http, cfg, "/status/sessions")
                        .await
                }
                None => None,
            }
        },
        // Plex: recently added (limit 10)
        async {
            match &plex_cfg {
                Some(cfg) => {
                    plex_fetch::<PlexMediaContainer<PlexLibraryItem>>(
                        http,
                        cfg,
                        "/library/recentlyAdded?X-Plex-Container-Size=10",
                    )
                    .await
                }
                None => None,
            }
        },
        // Sonarr: upcoming calendar (14-day window)
        async {
            match &sonarr_cfg {
                Some(cfg) => {
                    let path = format!("/calendar?start={}&end={}", today, end_date);
                    sonarr_fetch::<Vec<SonarrEpisode>>(http, cfg, &path).await
                }
                None => None,
            }
        },
        // Sonarr: recently added series
        async {
            match &sonarr_cfg {
                Some(cfg) => {
                    sonarr_fetch::<Vec<SonarrSeries>>(
                        http,
                        cfg,
                        "/series?sortKey=added&sortDirection=desc&pageSize=5",
                    )
                    .await
                }
                None => None,
            }
        },
        // Radarr: recently added movies
        async {
            match &radarr_cfg {
                Some(cfg) => {
                    radarr_fetch::<Vec<RadarrMovie>>(
                        http,
                        cfg,
                        "/movie?sortKey=added&sortDirection=desc&pageSize=5",
                    )
                    .await
                }
                None => None,
            }
        },
    );

    // ── Now playing ─────────────────────────────────────────────────────────

    let now_playing: Option<NowPlaying> = plex_sessions.and_then(|container| {
        let sessions = container.media_container?.metadata;
        let s = sessions.into_iter().next()?;
        let title = match (&s.grandparent_title, &s.title) {
            (Some(gp), Some(t)) => format!("{}: {}", gp, t),
            (None, Some(t)) => t.clone(),
            (Some(gp), None) => gp.clone(),
            (None, None) => return None,
        };
        let progress = match (s.view_offset, s.duration) {
            (Some(offset), Some(dur)) if dur > 0 => {
                Some(((offset as f64 / dur as f64) * 100.0).round() as u32)
            }
            _ => None,
        };
        Some(NowPlaying {
            title,
            media_type: s.media_type,
            user: s
                .user
                .and_then(|u| u.title)
                .unwrap_or_else(|| "Unknown".into()),
            progress,
        })
    });

    let sonarr_series_map: HashMap<i64, String> = sonarr_series
        .as_ref()
        .map(|series| {
            series
                .iter()
                .filter_map(|item| Some((item.id?, item.title.clone()?)))
                .collect()
        })
        .unwrap_or_default();

    // ── Recently added ──────────────────────────────────────────────────────
    // Merge Plex library + Sonarr series + Radarr movies (deduped by title)

    let mut recently_added: Vec<RecentlyAdded> = Vec::new();

    // 1. Plex recently added (up to 5)
    if let Some(container) = plex_recently {
        if let Some(mc) = container.media_container {
            for item in mc.metadata.into_iter().take(5) {
                if let Some(item) = plex_recent_item(item) {
                    recently_added.push(item);
                }
            }
        }
    }

    // 2. Sonarr series (up to 3, only if we have fewer than 5 entries)
    if recently_added.len() < 5 {
        if let Some(series) = sonarr_series {
            for s in series.into_iter().take(3) {
                let title = s.title.unwrap_or_else(|| "Unknown".into());
                if !recently_added.iter().any(|r| r.title == title) {
                    let id = s.id.map(|id| id.to_string());
                    recently_added.push(RecentlyAdded {
                        title,
                        media_type: "show".into(),
                        service: Some("sonarr".into()),
                        kind: Some("series".into()),
                        id: id.clone(),
                        subtitle: Some("Series".into()),
                        year: s.year,
                        detail_id: id.clone(),
                        detail_ref: id.map(|id| detail_ref("sonarr", "series", id)),
                    });
                }
            }
        }
    }

    // 3. Radarr movies with files (up to 3, only if we have fewer than 8 entries)
    if recently_added.len() < 8 {
        if let Some(movies) = radarr_movies {
            for m in movies
                .into_iter()
                .filter(|m| m.has_file.unwrap_or(false))
                .take(3)
            {
                let title = m.title.unwrap_or_else(|| "Unknown".into());
                if !recently_added.iter().any(|r| r.title == title) {
                    let id = m.id.map(|id| id.to_string());
                    recently_added.push(RecentlyAdded {
                        title,
                        media_type: "movie".into(),
                        service: Some("radarr".into()),
                        kind: Some("movie".into()),
                        id: id.clone(),
                        subtitle: Some("Movie".into()),
                        year: m.year,
                        detail_id: id.clone(),
                        detail_ref: id.map(|id| detail_ref("radarr", "movie", id)),
                    });
                }
            }
        }
    }

    // ── Upcoming episodes ───────────────────────────────────────────────────

    let mut upcoming: Vec<Upcoming> = Vec::new();

    if let Some(episodes) = sonarr_calendar {
        for ep in episodes.into_iter().take(6) {
            upcoming.push(sonarr_upcoming_item(ep, &sonarr_series_map));
        }
    }

    // ── Build response ──────────────────────────────────────────────────────
    // Fall back to mock data for sections that returned empty results.

    let recently_added_out: Value = serde_json::to_value(&recently_added).unwrap_or(json!([]));
    let upcoming_out: Value = serde_json::to_value(&upcoming).unwrap_or(json!([]));

    let detections = media_discovery_items(&state, &docker_detections);
    let arr_fetch_services = arr_services.clone();
    let ecosystem_fetch_services = ecosystem_services.clone();

    let (services, arr_results, ecosystem_results) = tokio::join!(
        build_media_services(&state, &docker_detections),
        join_all(arr_fetch_services.into_iter().map(|service| {
            let http = state.http.clone();
            let start = today.clone();
            let end = end_date.clone();
            async move {
                tokio::join!(
                    fetch_arr_queue(&http, &service),
                    fetch_arr_calendar(&http, &service, &start, &end),
                    fetch_arr_library(&http, &service),
                    fetch_arr_wanted(&http, &service),
                    fetch_arr_history(&http, &service),
                    fetch_arr_indexers(&http, &service),
                    fetch_arr_health(&http, &service),
                )
            }
        })),
        join_all(ecosystem_fetch_services.into_iter().map(|service| {
            let http = state.http.clone();
            async move {
                tokio::join!(
                    fetch_ecosystem_requests(&http, &service),
                    fetch_ecosystem_streams(&http, &service),
                    fetch_ecosystem_subtitles(&http, &service),
                    fetch_ecosystem_downloads(&http, &service),
                )
            }
        }))
    );

    let mut queue = Vec::new();
    let mut calendar = Vec::new();
    let mut library = Vec::new();
    let mut wanted = Vec::new();
    let mut history = Vec::new();
    let mut indexers = Vec::new();
    let mut indexer_health = Vec::new();
    for (
        service_queue,
        service_calendar,
        service_library,
        service_wanted,
        service_history,
        service_indexers,
        service_indexer_health,
    ) in arr_results
    {
        queue.extend(service_queue);
        calendar.extend(service_calendar);
        library.extend(service_library);
        wanted.extend(service_wanted);
        history.extend(service_history);
        indexers.extend(service_indexers);
        indexer_health.extend(service_indexer_health);
    }

    let mut requests = Vec::new();
    let mut streams = Vec::new();
    let mut subtitles = Vec::new();
    let mut downloads = Vec::new();
    for (service_requests, service_streams, service_subtitles, service_downloads) in
        ecosystem_results
    {
        requests.extend(service_requests);
        streams.extend(service_streams);
        subtitles.extend(service_subtitles);
        downloads.extend(service_downloads);
    }

    let queue: Vec<Value> = queue.into_iter().map(normalize_queue_item).collect();
    let calendar: Vec<Value> = calendar.into_iter().map(normalize_calendar_item).collect();
    let library: Vec<Value> = library.into_iter().map(normalize_library_item).collect();
    let wanted: Vec<Value> = wanted.into_iter().map(normalize_wanted_item).collect();
    let history: Vec<Value> = history
        .into_iter()
        .take(100)
        .map(normalize_wanted_item)
        .collect();
    let indexers: Vec<Value> = indexers.into_iter().map(normalize_indexer_item).collect();
    let indexer_health: Vec<Value> = indexer_health
        .into_iter()
        .map(normalize_indexer_health_item)
        .collect();
    let requests: Vec<Value> = requests.into_iter().map(normalize_request_item).collect();
    let streams: Vec<Value> = streams.into_iter().map(normalize_stream_item).collect();
    let subtitles: Vec<Value> = subtitles.into_iter().map(normalize_subtitle_item).collect();
    let downloads: Vec<Value> = downloads.into_iter().map(normalize_download_item).collect();
    let browse = build_browse_items(&library);

    Ok(Json(json!({
        "now_playing": now_playing,
        "recently_added": recently_added_out,
        "upcoming": upcoming_out,
        "services": services,
        "queue": queue,
        "calendar": calendar,
        "library": library,
        "browse": browse,
        "wanted": wanted,
        "history": history,
        "indexers": indexers,
        "indexer_health": indexer_health,
        "requests": requests,
        "streams": streams,
        "subtitles": subtitles,
        "downloads": downloads,
        "detections": detections,
        "capabilities": media_capabilities(),
        "mock": false,
    })))
}

async fn get_media_services(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let docker_detections = fetch_media_docker_detections(&state).await;
    let services = build_media_services(&state, &docker_detections).await;
    let detections = media_discovery_items(&state, &docker_detections);

    Ok(Json(json!({
        "services": services,
        "detections": detections,
        "capabilities": media_capabilities(),
    })))
}

async fn get_media_discover(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let docker_detections = fetch_media_docker_detections(&state).await;
    let services = build_media_services(&state, &docker_detections).await;
    let detections = media_discovery_items(&state, &docker_detections);

    Ok(Json(json!({
        "services": services,
        "detections": detections,
        "capabilities": media_capabilities(),
    })))
}

async fn get_media_queue(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let http = &state.http;
    let mut queue = Vec::new();
    for cfg in all_arr_configs(&state) {
        queue.extend(fetch_arr_queue(http, &cfg).await);
    }
    Ok(Json(json!({ "queue": queue })))
}

async fn get_media_calendar(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let http = &state.http;
    let start = chrono::Utc::now().format("%Y-%m-%d").to_string();
    let end = (chrono::Utc::now() + chrono::Duration::days(30))
        .format("%Y-%m-%d")
        .to_string();
    let mut calendar = Vec::new();
    for cfg in all_arr_configs(&state) {
        calendar.extend(fetch_arr_calendar(http, &cfg, &start, &end).await);
    }
    Ok(Json(json!({ "calendar": calendar })))
}

async fn get_media_library(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let http = &state.http;
    let mut library = Vec::new();
    for cfg in all_arr_configs(&state) {
        library.extend(fetch_arr_library(http, &cfg).await);
    }
    Ok(Json(json!({ "library": library })))
}

async fn get_media_wanted(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let http = &state.http;
    let mut wanted = Vec::new();
    for cfg in all_arr_configs(&state) {
        wanted.extend(fetch_arr_wanted(http, &cfg).await);
    }
    Ok(Json(json!({ "wanted": wanted })))
}

async fn get_media_history(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let http = &state.http;
    let mut history = Vec::new();
    for cfg in all_arr_configs(&state) {
        history.extend(fetch_arr_history(http, &cfg).await);
    }
    Ok(Json(json!({ "history": history })))
}

async fn get_media_indexers(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let http = &state.http;
    let mut indexers = Vec::new();
    let mut health = Vec::new();
    for cfg in all_arr_configs(&state) {
        indexers.extend(fetch_arr_indexers(http, &cfg).await);
        health.extend(fetch_arr_health(http, &cfg).await);
    }
    let indexers: Vec<Value> = indexers.into_iter().map(normalize_indexer_item).collect();
    let health: Vec<Value> = health
        .into_iter()
        .map(normalize_indexer_health_item)
        .collect();
    Ok(Json(json!({ "indexers": indexers, "health": health })))
}

async fn get_media_requests(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let results = join_all(all_ecosystem_configs(&state).into_iter().map(|service| {
        let http = state.http.clone();
        async move { fetch_ecosystem_requests(&http, &service).await }
    }))
    .await;
    let requests: Vec<Value> = results
        .into_iter()
        .flatten()
        .map(normalize_request_item)
        .collect();
    Ok(Json(json!({ "requests": requests })))
}

async fn get_media_streams(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let results = join_all(all_ecosystem_configs(&state).into_iter().map(|service| {
        let http = state.http.clone();
        async move { fetch_ecosystem_streams(&http, &service).await }
    }))
    .await;
    let streams: Vec<Value> = results
        .into_iter()
        .flatten()
        .map(normalize_stream_item)
        .collect();
    Ok(Json(json!({ "streams": streams })))
}

async fn get_media_subtitles(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let results = join_all(all_ecosystem_configs(&state).into_iter().map(|service| {
        let http = state.http.clone();
        async move { fetch_ecosystem_subtitles(&http, &service).await }
    }))
    .await;
    let subtitles: Vec<Value> = results
        .into_iter()
        .flatten()
        .map(normalize_subtitle_item)
        .collect();
    Ok(Json(json!({ "subtitles": subtitles })))
}

async fn get_media_downloads(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let results = join_all(all_ecosystem_configs(&state).into_iter().map(|service| {
        let http = state.http.clone();
        async move { fetch_ecosystem_downloads(&http, &service).await }
    }))
    .await;
    let downloads: Vec<Value> = results
        .into_iter()
        .flatten()
        .map(normalize_download_item)
        .collect();
    Ok(Json(json!({ "downloads": downloads })))
}

async fn search_media(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Query(params): Query<HashMap<String, String>>,
) -> Result<Json<Value>, AppError> {
    let service = params
        .get("service")
        .map(String::as_str)
        .ok_or_else(|| AppError::BadRequest("Missing service".into()))?;
    let term = params
        .get("query")
        .or_else(|| params.get("term"))
        .map(String::as_str)
        .unwrap_or("")
        .trim();
    if term.is_empty() {
        return Ok(Json(json!({ "results": [] })));
    }

    let cfg = arr_config(&state, service)
        .ok_or_else(|| AppError::BadRequest(format!("{service} is not configured")))?;
    let path = match cfg.kind {
        ArrKind::Sonarr => format!("/series/lookup?term={}", urlencoding::encode(term)),
        ArrKind::Radarr => format!("/movie/lookup?term={}", urlencoding::encode(term)),
        ArrKind::Lidarr => format!("/artist/lookup?term={}", urlencoding::encode(term)),
        ArrKind::Prowlarr => format!("/search?query={}", urlencoding::encode(term)),
    };
    let results = arr_request_value(&state.http, &cfg, Method::GET, &path, None)
        .await
        .map_err(|err| {
            if cfg.kind == ArrKind::Prowlarr {
                AppError::BadRequest(format!(
                    "Prowlarr release search failed. Check Prowlarr health at {}. {:?}",
                    cfg.url, err
                ))
            } else {
                err
            }
        })?;
    let records = extract_records(results);
    let results = if cfg.kind == ArrKind::Prowlarr {
        records.into_iter().map(normalize_release_item).collect()
    } else {
        records
    };
    Ok(Json(json!({ "service": cfg.id, "results": results })))
}

async fn get_media_detail(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Path((service, kind, id)): Path<(String, String, String)>,
) -> Result<Json<Value>, AppError> {
    fn value_string(item: &Value, keys: &[&str]) -> Option<String> {
        keys.iter()
            .find_map(|key| item.get(*key).and_then(Value::as_str))
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToOwned::to_owned)
    }

    fn plex_detail_title(item: &Value, fallback_kind: &str, id: &str) -> (String, Option<String>) {
        let raw_type = item
            .get("type")
            .and_then(Value::as_str)
            .unwrap_or(fallback_kind);
        match raw_type {
            "episode" => {
                let title =
                    value_string(item, &["grandparentTitle", "title"]).unwrap_or_else(|| id.into());
                let episode = value_string(item, &["title"]);
                let season = value_string(item, &["parentTitle"]);
                let subtitle = [season, episode]
                    .into_iter()
                    .flatten()
                    .filter(|part| part != &title)
                    .collect::<Vec<_>>()
                    .join(" - ");
                (title, (!subtitle.is_empty()).then_some(subtitle))
            }
            "season" => {
                let title = value_string(item, &["grandparentTitle", "parentTitle", "title"])
                    .unwrap_or_else(|| id.into());
                let subtitle = value_string(item, &["title"]).filter(|subtitle| subtitle != &title);
                (title, subtitle)
            }
            _ => (
                value_string(item, &["title", "name", "fullTitle"]).unwrap_or_else(|| id.into()),
                None,
            ),
        }
    }

    fn arr_detail_title(item: &Value, id: i64) -> (String, Option<String>) {
        if let Some(series) = item.get("series").and_then(Value::as_object) {
            if let Some(series_title) = series.get("title").and_then(Value::as_str) {
                let episode_title =
                    value_string(item, &["title"]).unwrap_or_else(|| id.to_string());
                let season = item
                    .get("seasonNumber")
                    .and_then(Value::as_u64)
                    .unwrap_or(0);
                let episode = item
                    .get("episodeNumber")
                    .and_then(Value::as_u64)
                    .unwrap_or(0);
                let title = if season > 0 || episode > 0 {
                    format!("{series_title} S{season:02}E{episode:02}: {episode_title}")
                } else {
                    format!("{series_title}: {episode_title}")
                };
                return (title, Some(series_title.to_string()));
            }
        }
        let title = value_string(item, &["title", "name", "artistName", "fullTitle"])
            .unwrap_or_else(|| id.to_string());
        let subtitle = value_string(item, &["network", "studio", "qualityProfileName", "path"]);
        (title, subtitle)
    }

    fn detail_status(item: &Value) -> Option<&'static str> {
        if item.get("monitored").and_then(Value::as_bool) == Some(false) {
            return Some("unmonitored");
        }
        if item.get("hasFile").and_then(Value::as_bool) == Some(true) {
            return Some("available");
        }
        if item.get("hasFile").and_then(Value::as_bool) == Some(false) {
            return Some("missing_file");
        }
        if item.get("enabled").and_then(Value::as_bool) == Some(false) {
            return Some("disabled");
        }
        None
    }

    if service == "plex" {
        let cfg = plex_config(&state)
            .ok_or_else(|| AppError::BadRequest("Plex is not configured".into()))?;
        let value = plex_fetch::<Value>(&state.http, &cfg, &format!("/library/metadata/{id}"))
            .await
            .ok_or_else(|| AppError::NotFound(format!("Plex item {id} was not found")))?;
        let item = value
            .get("MediaContainer")
            .and_then(|container| container.get("Metadata"))
            .and_then(Value::as_array)
            .and_then(|items| items.first())
            .cloned()
            .unwrap_or(value);
        let (title, subtitle) = plex_detail_title(&item, &kind, &id);
        return Ok(Json(json!({
            "service": "plex",
            "kind": kind,
            "id": id,
            "title": title,
            "subtitle": subtitle,
            "year": item.get("year").cloned(),
            "status": detail_status(&item),
            "monitored": item.get("monitored").and_then(Value::as_bool),
            "item": item,
            "actions": ["open"],
        })));
    }

    let cfg = arr_config(&state, &service)
        .ok_or_else(|| AppError::BadRequest(format!("{service} is not configured")))?;
    let parsed_id = id
        .parse::<i64>()
        .map_err(|_| AppError::BadRequest(format!("Invalid media id: {id}")))?;
    let path = match (cfg.kind, kind.as_str()) {
        (ArrKind::Sonarr, "episode") => format!("/episode/{parsed_id}"),
        (ArrKind::Sonarr, _) => format!("/series/{parsed_id}"),
        (ArrKind::Radarr, _) => format!("/movie/{parsed_id}"),
        (ArrKind::Lidarr, _) => format!("/artist/{parsed_id}"),
        (ArrKind::Prowlarr, _) => format!("/indexer/{parsed_id}"),
    };
    let item = arr_request_value(&state.http, &cfg, Method::GET, &path, None).await?;
    let (title, subtitle) = arr_detail_title(&item, parsed_id);
    let related = arr_detail_context(&state.http, &cfg, &kind, parsed_id).await;
    Ok(Json(json!({
        "service": cfg.id,
        "kind": kind,
        "id": parsed_id,
        "title": title,
        "subtitle": subtitle,
        "year": item.get("year").cloned(),
        "status": detail_status(&item),
        "monitored": item.get("monitored").and_then(Value::as_bool),
        "has_file": item.get("hasFile").and_then(Value::as_bool),
        "item": item,
        "queue": related.get("queue").cloned().unwrap_or_else(|| json!([])),
        "wanted": related.get("wanted").cloned().unwrap_or_else(|| json!([])),
        "history": related.get("history").cloned().unwrap_or_else(|| json!([])),
        "actions": match cfg.kind {
            ArrKind::Prowlarr => json!(["toggle"]),
            _ => json!(["refresh", "search", "monitor", "delete"]),
        },
    })))
}

async fn search_media_requests(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Query(params): Query<HashMap<String, String>>,
) -> Result<Json<Value>, AppError> {
    let service = params
        .get("service")
        .map(String::as_str)
        .unwrap_or("overseerr");
    let term = params
        .get("query")
        .or_else(|| params.get("term"))
        .map(String::as_str)
        .unwrap_or("")
        .trim();
    if term.is_empty() {
        return Ok(Json(json!({ "service": service, "results": [] })));
    }

    let cfg = ecosystem_config(&state, service)
        .ok_or_else(|| AppError::BadRequest(format!("{service} is not configured")))?;
    if !matches!(
        cfg.kind,
        EcosystemKind::Overseerr | EcosystemKind::Jellyseerr
    ) {
        return Err(AppError::BadRequest(format!(
            "{} does not support media request search",
            cfg.name
        )));
    }
    let value = ecosystem_get_json(
        &state.http,
        &cfg,
        &format!("/api/v1/search?query={}", urlencoding::encode(term)),
    )
    .await?;
    let results: Vec<Value> = extract_records(value)
        .into_iter()
        .map(normalize_request_discovery_item)
        .collect();
    Ok(Json(json!({ "service": cfg.id, "results": results })))
}

fn normalize_request_discovery_item(item: Value) -> Value {
    normalize_media_record(
        item,
        &[
            "id",
            "mediaType",
            "title",
            "name",
            "overview",
            "releaseDate",
            "firstAirDate",
            "posterPath",
            "backdropPath",
            "voteAverage",
            "popularity",
            "mediaInfo",
        ],
        &[],
    )
}

fn request_discovery_providers() -> Vec<Value> {
    REQUEST_DISCOVERY_PROVIDERS
        .iter()
        .map(|(id, name)| json!({ "id": id, "name": name }))
        .collect()
}

fn request_discovery_path(params: &HashMap<String, String>) -> String {
    let kind = params.get("kind").map(String::as_str).unwrap_or("tv");
    let category = params
        .get("category")
        .map(String::as_str)
        .unwrap_or("popular");
    let base = match (category, kind) {
        ("trending", _) => "/api/v1/discover/trending".to_string(),
        ("upcoming", "movie" | "movies") => "/api/v1/discover/movies/upcoming".to_string(),
        ("upcoming", _) => "/api/v1/discover/tv/upcoming".to_string(),
        (_, "movie" | "movies") => "/api/v1/discover/movies".to_string(),
        _ => "/api/v1/discover/tv".to_string(),
    };

    let mut query = vec![format!(
        "page={}",
        params
            .get("page")
            .and_then(|value| value.parse::<u32>().ok())
            .filter(|page| *page > 0)
            .unwrap_or(1)
    )];
    if let Some(provider) = params
        .get("provider")
        .map(String::as_str)
        .filter(|value| !value.trim().is_empty() && *value != "all")
    {
        query.push(format!(
            "watchRegion={}",
            urlencoding::encode(params.get("region").map(String::as_str).unwrap_or("US"))
        ));
        query.push(format!("watchProviders={}", urlencoding::encode(provider)));
    }
    format!("{base}?{}", query.join("&"))
}

async fn discover_media_requests(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Query(params): Query<HashMap<String, String>>,
) -> Result<Json<Value>, AppError> {
    let service = params
        .get("service")
        .map(String::as_str)
        .unwrap_or("overseerr");
    let cfg = ecosystem_config(&state, service)
        .ok_or_else(|| AppError::BadRequest(format!("{service} is not configured")))?;
    if !matches!(
        cfg.kind,
        EcosystemKind::Overseerr | EcosystemKind::Jellyseerr
    ) {
        return Err(AppError::BadRequest(format!(
            "{} does not support media discovery",
            cfg.name
        )));
    }

    let path = request_discovery_path(&params);
    let value = ecosystem_get_json(&state.http, &cfg, &path).await?;
    let results: Vec<Value> = extract_records(value.clone())
        .into_iter()
        .map(normalize_request_discovery_item)
        .collect();
    Ok(Json(json!({
        "service": cfg.id,
        "kind": params.get("kind").map(String::as_str).unwrap_or("tv"),
        "category": params.get("category").map(String::as_str).unwrap_or("popular"),
        "provider": params.get("provider").cloned(),
        "providers": request_discovery_providers(),
        "page": value.get("page").and_then(Value::as_u64).unwrap_or(1),
        "totalPages": value.get("totalPages").cloned().unwrap_or_else(|| json!(null)),
        "totalResults": value.get("totalResults").cloned().unwrap_or_else(|| json!(null)),
        "results": results,
    })))
}

#[derive(Debug, Deserialize)]
struct UpdateMediaItemRequest {
    #[serde(default)]
    monitored: Option<bool>,
    #[serde(default)]
    enabled: Option<bool>,
}

fn library_item_path(cfg: &ArrConfig, id: i64) -> String {
    match cfg.kind {
        ArrKind::Sonarr => format!("/series/{id}"),
        ArrKind::Radarr => format!("/movie/{id}"),
        ArrKind::Lidarr => format!("/artist/{id}"),
        ArrKind::Prowlarr => format!("/indexer/{id}"),
    }
}

async fn update_media_library_item(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Path((service, id)): Path<(String, i64)>,
    Json(req): Json<UpdateMediaItemRequest>,
) -> Result<Json<Value>, AppError> {
    let cfg = arr_config(&state, &service)
        .ok_or_else(|| AppError::BadRequest(format!("{service} is not configured")))?;
    let path = library_item_path(&cfg, id);
    let mut item = arr_request_value(&state.http, &cfg, Method::GET, &path, None).await?;
    if let Some(obj) = item.as_object_mut() {
        if let Some(monitored) = req.monitored {
            obj.insert("monitored".into(), json!(monitored));
        }
        if let Some(enabled) = req.enabled {
            obj.insert("enable".into(), json!(enabled));
        }
    }
    let result = arr_request_value(&state.http, &cfg, Method::PUT, &path, Some(item)).await?;
    Ok(Json(json!({ "service": cfg.id, "item": result })))
}

async fn update_media_indexer(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Path((service, id)): Path<(String, i64)>,
    Json(req): Json<UpdateMediaItemRequest>,
) -> Result<Json<Value>, AppError> {
    let cfg = arr_config(&state, &service)
        .ok_or_else(|| AppError::BadRequest(format!("{service} is not configured")))?;
    if cfg.kind != ArrKind::Prowlarr {
        return Err(AppError::BadRequest(format!(
            "{} does not support indexer updates",
            cfg.name
        )));
    }
    let enabled = req
        .enabled
        .ok_or_else(|| AppError::BadRequest("Missing enabled".into()))?;
    let path = format!("/indexer/{id}");
    let mut item = arr_request_value(&state.http, &cfg, Method::GET, &path, None).await?;
    if let Some(obj) = item.as_object_mut() {
        obj.insert("enable".into(), json!(enabled));
    }
    let result = arr_request_value(&state.http, &cfg, Method::PUT, &path, Some(item)).await?;
    Ok(Json(json!({ "service": cfg.id, "indexer": result })))
}

async fn test_media_indexer(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Path((service, id)): Path<(String, i64)>,
) -> Result<Json<Value>, AppError> {
    let cfg = arr_config(&state, &service)
        .ok_or_else(|| AppError::BadRequest(format!("{service} is not configured")))?;
    if cfg.kind != ArrKind::Prowlarr {
        return Err(AppError::BadRequest(format!(
            "{} does not support indexer tests",
            cfg.name
        )));
    }
    let path = format!("/indexer/{id}");
    let item = arr_request_value(&state.http, &cfg, Method::GET, &path, None).await?;
    let result =
        arr_request_value(&state.http, &cfg, Method::POST, "/indexer/test", Some(item)).await?;
    Ok(Json(
        json!({ "service": cfg.id, "indexer": id, "result": result }),
    ))
}

async fn delete_media_library_item(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Path((service, id)): Path<(String, i64)>,
) -> Result<Json<Value>, AppError> {
    let cfg = arr_config(&state, &service)
        .ok_or_else(|| AppError::BadRequest(format!("{service} is not configured")))?;
    let path = match cfg.kind {
        ArrKind::Prowlarr => format!("/indexer/{id}"),
        _ => format!(
            "{}?deleteFiles=false&addImportListExclusion=false",
            library_item_path(&cfg, id)
        ),
    };
    let result = arr_request_value(&state.http, &cfg, Method::DELETE, &path, None).await?;
    Ok(Json(json!({ "service": cfg.id, "result": result })))
}

#[derive(Debug, Deserialize)]
struct AddMediaRequest {
    service: String,
    item: Value,
    #[serde(default)]
    options: Value,
}

#[derive(Debug, Deserialize)]
struct GrabReleaseRequest {
    service: String,
    release: Value,
}

async fn grab_media_release(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Json(req): Json<GrabReleaseRequest>,
) -> Result<Json<Value>, AppError> {
    let cfg = arr_config(&state, &req.service)
        .ok_or_else(|| AppError::BadRequest(format!("{} is not configured", req.service)))?;
    if cfg.kind != ArrKind::Prowlarr {
        return Err(AppError::BadRequest(format!(
            "Release grab is only implemented for Prowlarr, not {}",
            cfg.name
        )));
    }
    let result = arr_request_value(
        &state.http,
        &cfg,
        Method::POST,
        "/search",
        Some(req.release),
    )
    .await?;
    Ok(Json(json!({ "service": cfg.id, "result": result })))
}

async fn add_media(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Json(req): Json<AddMediaRequest>,
) -> Result<Json<Value>, AppError> {
    let cfg = arr_config(&state, &req.service)
        .ok_or_else(|| AppError::BadRequest(format!("{} is not configured", req.service)))?;

    if !matches!(
        cfg.kind,
        ArrKind::Sonarr | ArrKind::Radarr | ArrKind::Lidarr
    ) {
        return Err(AppError::BadRequest(format!(
            "Add is only implemented for Sonarr, Radarr, and Lidarr right now, not {}",
            cfg.name
        )));
    }

    let http = &state.http;
    let quality_profile_id = match req.options.get("qualityProfileId").and_then(Value::as_i64) {
        Some(id) => id,
        None => first_option_id(http, &cfg, "/qualityprofile")
            .await
            .ok_or_else(|| AppError::BadRequest(format!("{} has no quality profile", cfg.name)))?,
    };
    let root_folder_path = match req
        .options
        .get("rootFolderPath")
        .and_then(Value::as_str)
        .map(ToString::to_string)
    {
        Some(path) => path,
        None => first_root_path(http, &cfg)
            .await
            .ok_or_else(|| AppError::BadRequest(format!("{} has no root folder", cfg.name)))?,
    };
    let metadata_profile_id = match cfg.kind {
        ArrKind::Lidarr => match req.options.get("metadataProfileId").and_then(Value::as_i64) {
            Some(id) => Some(id),
            None => Some(
                first_option_id(http, &cfg, "/metadataprofile")
                    .await
                    .ok_or_else(|| {
                        AppError::BadRequest(format!("{} has no metadata profile", cfg.name))
                    })?,
            ),
        },
        _ => None,
    };

    let body = match cfg.kind {
        ArrKind::Radarr => merge_object(
            req.item,
            json!({
                "qualityProfileId": quality_profile_id,
                "rootFolderPath": root_folder_path,
                "monitored": true,
                "minimumAvailability": req.options.get("minimumAvailability").and_then(Value::as_str).unwrap_or("released"),
                "addOptions": { "searchForMovie": true }
            }),
        ),
        ArrKind::Sonarr => merge_object(
            req.item,
            json!({
                "qualityProfileId": quality_profile_id,
                "rootFolderPath": root_folder_path,
                "seasonFolder": true,
                "monitored": true,
                "addOptions": { "searchForMissingEpisodes": true, "monitor": "all" }
            }),
        ),
        ArrKind::Lidarr => merge_object(
            req.item,
            json!({
                "qualityProfileId": quality_profile_id,
                "metadataProfileId": metadata_profile_id,
                "rootFolderPath": root_folder_path,
                "monitored": true,
                "addOptions": { "searchForMissingAlbums": true }
            }),
        ),
        _ => unreachable!(),
    };

    let path = match cfg.kind {
        ArrKind::Radarr => "/movie",
        ArrKind::Sonarr => "/series",
        ArrKind::Lidarr => "/artist",
        _ => unreachable!(),
    };
    let created = arr_request_value(http, &cfg, Method::POST, path, Some(body)).await?;
    Ok(Json(json!({ "service": cfg.id, "item": created })))
}

#[derive(Debug, Deserialize)]
struct MediaCommandRequest {
    service: String,
    name: String,
    #[serde(default)]
    id: Option<i64>,
    #[serde(default)]
    body: Value,
}

async fn media_command(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Json(req): Json<MediaCommandRequest>,
) -> Result<Json<Value>, AppError> {
    let cfg = arr_config(&state, &req.service)
        .ok_or_else(|| AppError::BadRequest(format!("{} is not configured", req.service)))?;

    let command = match req.name.as_str() {
        "search" => match cfg.kind {
            ArrKind::Sonarr => json!({ "name": "SeriesSearch", "seriesId": req.id }),
            ArrKind::Radarr => {
                json!({ "name": "MoviesSearch", "movieIds": req.id.map(|id| vec![id]).unwrap_or_default() })
            }
            ArrKind::Lidarr => json!({ "name": "ArtistSearch", "artistId": req.id }),
            ArrKind::Prowlarr => json!({ "name": "ApplicationIndexerSync" }),
        },
        "missing-search" => match cfg.kind {
            ArrKind::Sonarr => json!({ "name": "MissingEpisodeSearch" }),
            ArrKind::Radarr => json!({ "name": "MissingMoviesSearch" }),
            ArrKind::Lidarr => json!({ "name": "MissingAlbumSearch" }),
            ArrKind::Prowlarr => json!({ "name": "ApplicationIndexerSync" }),
        },
        "rss-sync" => json!({ "name": "RssSync" }),
        "refresh" => match cfg.kind {
            ArrKind::Sonarr => json!({ "name": "RefreshSeries", "seriesId": req.id }),
            ArrKind::Radarr => json!({ "name": "RefreshMovie", "movieId": req.id }),
            ArrKind::Lidarr => json!({ "name": "RefreshArtist", "artistId": req.id }),
            ArrKind::Prowlarr => json!({ "name": "ApplicationIndexerSync" }),
        },
        "application-sync" => json!({ "name": "ApplicationIndexerSync" }),
        _ => req.body,
    };

    let result =
        arr_request_value(&state.http, &cfg, Method::POST, "/command", Some(command)).await?;
    Ok(Json(json!({ "service": cfg.id, "command": result })))
}

async fn delete_media_queue_item(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Path((service, id)): Path<(String, i64)>,
) -> Result<Json<Value>, AppError> {
    let cfg = arr_config(&state, &service)
        .ok_or_else(|| AppError::BadRequest(format!("{service} is not configured")))?;
    let path = format!("/queue/{id}?removeFromClient=true&blocklist=false");
    let result = arr_request_value(&state.http, &cfg, Method::DELETE, &path, None).await?;
    Ok(Json(json!({ "service": cfg.id, "result": result })))
}

async fn action_media_request(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Path((service, id, action)): Path<(String, i64, String)>,
) -> Result<Json<Value>, AppError> {
    let cfg = ecosystem_config(&state, &service)
        .ok_or_else(|| AppError::BadRequest(format!("{service} is not configured")))?;
    if !matches!(
        cfg.kind,
        EcosystemKind::Overseerr | EcosystemKind::Jellyseerr
    ) {
        return Err(AppError::BadRequest(format!(
            "{} does not support request actions",
            cfg.name
        )));
    }

    let path = match action.as_str() {
        "approve" => format!("/api/v1/request/{id}/approve"),
        "decline" => format!("/api/v1/request/{id}/decline"),
        _ => {
            return Err(AppError::BadRequest(format!(
                "Unsupported request action: {action}"
            )))
        }
    };
    let result = ecosystem_post_json(&state.http, &cfg, &path, json!({})).await?;
    Ok(Json(
        json!({ "service": cfg.id, "action": action, "result": result }),
    ))
}

fn payload_bool(value: &Value, key: &str) -> bool {
    value.get(key).and_then(Value::as_bool).unwrap_or(false)
}

fn first_missing_subtitle_detail(payload: &Value) -> Option<Value> {
    payload
        .get("missing_subtitle_details")
        .and_then(Value::as_array)
        .and_then(|items| items.first())
        .cloned()
}

fn bazarr_subtitle_search_path(payload: &Value) -> Result<String, AppError> {
    let detail = first_missing_subtitle_detail(payload).unwrap_or_else(|| json!({}));
    let language = payload
        .get("language")
        .and_then(Value::as_str)
        .or_else(|| detail.get("code2").and_then(Value::as_str))
        .ok_or_else(|| AppError::BadRequest("Missing Bazarr subtitle language".into()))?;
    let forced = payload_bool(payload, "forced") || payload_bool(&detail, "forced");
    let hi = payload_bool(payload, "hi") || payload_bool(&detail, "hi");

    if let Some(radarr_id) = payload.get("radarrId").and_then(Value::as_i64) {
        return Ok(format!(
            "/api/movies/subtitles?radarrid={radarr_id}&language={}&forced={}&hi={}",
            urlencoding::encode(language),
            forced,
            hi
        ));
    }

    let series_id = payload
        .get("sonarrSeriesId")
        .and_then(Value::as_i64)
        .ok_or_else(|| AppError::BadRequest("Missing Bazarr Sonarr series id".into()))?;
    let episode_id = payload
        .get("sonarrEpisodeId")
        .and_then(Value::as_i64)
        .ok_or_else(|| AppError::BadRequest("Missing Bazarr Sonarr episode id".into()))?;
    Ok(format!(
        "/api/episodes/subtitles?seriesid={series_id}&episodeid={episode_id}&language={}&forced={}&hi={}",
        urlencoding::encode(language),
        forced,
        hi
    ))
}

async fn action_media_subtitle(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Path((service, action)): Path<(String, String)>,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, AppError> {
    let cfg = ecosystem_config(&state, &service)
        .ok_or_else(|| AppError::BadRequest(format!("{service} is not configured")))?;
    if cfg.kind != EcosystemKind::Bazarr {
        return Err(AppError::BadRequest(format!(
            "{} does not support subtitle actions",
            cfg.name
        )));
    }
    if action != "search" {
        return Err(AppError::BadRequest(format!(
            "Unsupported Bazarr subtitle action: {action}"
        )));
    }

    let path = bazarr_subtitle_search_path(&payload)?;

    let mut req = state
        .http
        .patch(ecosystem_url(&cfg, &path))
        .header("Accept", "application/json")
        .timeout(MEDIA_HTTP_TIMEOUT);
    if let Some(api_key) = &cfg.api_key {
        req = req.header("X-Api-Key", api_key);
    }
    let res = req.send().await.map_err(AppError::from)?;
    let status = res.status();
    if !status.is_success() {
        let text = res.text().await.unwrap_or_default();
        return Err(AppError::BadRequest(format!(
            "{} subtitle search returned {} {}",
            cfg.name, status, text
        )));
    }

    Ok(Json(json!({
        "service": cfg.id,
        "action": action,
        "status": status.as_u16(),
        "result": if status == reqwest::StatusCode::NO_CONTENT { json!({ "ok": true }) } else { res.json::<Value>().await.unwrap_or_else(|_| json!({ "ok": true })) },
    })))
}

fn media_request_body(payload: &Value) -> Result<Value, AppError> {
    let media_id = payload
        .get("mediaId")
        .or_else(|| payload.get("id"))
        .and_then(Value::as_i64)
        .ok_or_else(|| AppError::BadRequest("Missing request media id".into()))?;
    let media_type = payload
        .get("mediaType")
        .or_else(|| payload.get("media_type"))
        .and_then(Value::as_str)
        .unwrap_or("movie");
    let mut body = json!({
        "mediaId": media_id,
        "mediaType": media_type,
        "is4k": payload.get("is4k").and_then(Value::as_bool).unwrap_or(false),
    });
    if let Some(obj) = body.as_object_mut() {
        if let Some(seasons) = payload.get("seasons") {
            obj.insert("seasons".into(), normalize_request_seasons(seasons)?);
        }
        if let Some(user_id) = payload.get("userId") {
            obj.insert("userId".into(), user_id.clone());
        }
        if let Some(tags) = payload.get("tags") {
            obj.insert("tags".into(), tags.clone());
        }
    }
    Ok(body)
}

fn normalize_request_seasons(seasons: &Value) -> Result<Value, AppError> {
    let Some(items) = seasons.as_array() else {
        return Err(AppError::BadRequest(
            "Request seasons must be an array".into(),
        ));
    };
    let mut normalized = Vec::new();
    for item in items {
        let season = item
            .as_i64()
            .or_else(|| item.get("seasonNumber").and_then(Value::as_i64))
            .ok_or_else(|| AppError::BadRequest("Invalid request season".into()))?;
        if season > 0 && !normalized.contains(&season) {
            normalized.push(season);
        }
    }
    normalized.sort_unstable();
    Ok(json!(normalized))
}

async fn create_media_request(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Path(service): Path<String>,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, AppError> {
    let cfg = ecosystem_config(&state, &service)
        .ok_or_else(|| AppError::BadRequest(format!("{service} is not configured")))?;
    if !matches!(
        cfg.kind,
        EcosystemKind::Overseerr | EcosystemKind::Jellyseerr
    ) {
        return Err(AppError::BadRequest(format!(
            "{} does not support media requests",
            cfg.name
        )));
    }
    let body = media_request_body(&payload)?;
    let result = ecosystem_post_json(&state.http, &cfg, "/api/v1/request", body).await?;
    Ok(Json(json!({ "service": cfg.id, "request": result })))
}

async fn action_media_download(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Path((service, id, action)): Path<(String, String, String)>,
    payload: Option<Json<Value>>,
) -> Result<Json<Value>, AppError> {
    let cfg = ecosystem_config(&state, &service)
        .ok_or_else(|| AppError::BadRequest(format!("{service} is not configured")))?;
    let payload = payload
        .map(|Json(value)| value)
        .unwrap_or_else(|| json!({}));
    let result = match cfg.kind {
        EcosystemKind::Qbittorrent => {
            let hashes = id.as_str();
            match action.as_str() {
                "pause" => {
                    let form = [("hashes", hashes)];
                    match qbittorrent_post_form(&state.http, &cfg, "/api/v2/torrents/stop", &form)
                        .await
                    {
                        Ok(value) => value,
                        Err(_) => {
                            qbittorrent_post_form(
                                &state.http,
                                &cfg,
                                "/api/v2/torrents/pause",
                                &form,
                            )
                            .await?
                        }
                    }
                }
                "resume" => {
                    let form = [("hashes", hashes)];
                    match qbittorrent_post_form(&state.http, &cfg, "/api/v2/torrents/start", &form)
                        .await
                    {
                        Ok(value) => value,
                        Err(_) => {
                            qbittorrent_post_form(
                                &state.http,
                                &cfg,
                                "/api/v2/torrents/resume",
                                &form,
                            )
                            .await?
                        }
                    }
                }
                "remove" => {
                    let form = [("hashes", hashes), ("deleteFiles", "false")];
                    qbittorrent_post_form(&state.http, &cfg, "/api/v2/torrents/delete", &form)
                        .await?
                }
                "recheck" => {
                    let form = [("hashes", hashes)];
                    qbittorrent_post_form(&state.http, &cfg, "/api/v2/torrents/recheck", &form)
                        .await?
                }
                "set-category" => {
                    let category = payload
                        .get("category")
                        .and_then(Value::as_str)
                        .unwrap_or("")
                        .trim();
                    let form = [("hashes", hashes), ("category", category)];
                    qbittorrent_post_form(&state.http, &cfg, "/api/v2/torrents/setCategory", &form)
                        .await?
                }
                "add-tags" => {
                    let tags = payload
                        .get("tags")
                        .and_then(Value::as_str)
                        .unwrap_or("")
                        .trim();
                    if tags.is_empty() {
                        return Err(AppError::BadRequest("Missing qBittorrent tags".into()));
                    }
                    let form = [("hashes", hashes), ("tags", tags)];
                    qbittorrent_post_form(&state.http, &cfg, "/api/v2/torrents/addTags", &form)
                        .await?
                }
                _ => {
                    return Err(AppError::BadRequest(format!(
                        "Unsupported qBittorrent action: {action}"
                    )))
                }
            }
        }
        EcosystemKind::Sabnzbd => {
            let key = urlencoding::encode(cfg.api_key.as_deref().unwrap_or(""));
            let name = match action.as_str() {
                "pause" => "pause",
                "resume" => "resume",
                "remove" => "delete",
                _ => {
                    return Err(AppError::BadRequest(format!(
                        "Unsupported SABnzbd action: {action}"
                    )))
                }
            };
            ecosystem_get_json(
                &state.http,
                &cfg,
                &format!(
                    "/api?mode=queue&name={name}&value={}&output=json&apikey={key}",
                    urlencoding::encode(&id)
                ),
            )
            .await?
        }
        EcosystemKind::Nzbget => {
            let parsed_id = id.parse::<i64>().map_err(|_| {
                AppError::BadRequest(format!("NZBGet id must be numeric, got {id}"))
            })?;
            let method = match action.as_str() {
                "pause" => "pausegroup",
                "resume" => "resumegroup",
                "remove" => "deletegroup",
                _ => {
                    return Err(AppError::BadRequest(format!(
                        "Unsupported NZBGet action: {action}"
                    )))
                }
            };
            nzbget_rpc(&state.http, &cfg, method, json!([parsed_id])).await?
        }
        EcosystemKind::Transmission => {
            let parsed_id = id.parse::<i64>().map_err(|_| {
                AppError::BadRequest(format!("Transmission id must be numeric, got {id}"))
            })?;
            let body = match action.as_str() {
                "pause" => json!({ "method": "torrent-stop", "arguments": { "ids": [parsed_id] } }),
                "resume" => {
                    json!({ "method": "torrent-start", "arguments": { "ids": [parsed_id] } })
                }
                "remove" => json!({
                    "method": "torrent-remove",
                    "arguments": { "ids": [parsed_id], "delete-local-data": false }
                }),
                "recheck" => {
                    json!({ "method": "torrent-verify", "arguments": { "ids": [parsed_id] } })
                }
                _ => {
                    return Err(AppError::BadRequest(format!(
                        "Unsupported Transmission action: {action}"
                    )))
                }
            };
            transmission_rpc(&state.http, &cfg, body).await?
        }
        EcosystemKind::Deluge => {
            let method = match action.as_str() {
                "pause" => "core.pause_torrent",
                "resume" => "core.resume_torrent",
                "remove" => "core.remove_torrent",
                "recheck" => "core.force_recheck",
                _ => {
                    return Err(AppError::BadRequest(format!(
                        "Unsupported Deluge action: {action}"
                    )))
                }
            };
            let params = if action == "remove" {
                json!([[id], false])
            } else {
                json!([[id]])
            };
            deluge_rpc(&state.http, &cfg, method, params).await?
        }
        _ => {
            return Err(AppError::BadRequest(format!(
                "{} does not support download actions",
                cfg.name
            )))
        }
    };

    Ok(Json(
        json!({ "service": cfg.id, "action": action, "result": result }),
    ))
}

// ── Router ──────────────────────────────────────────────────────────────────

/// Build the `/media` sub-router (Plex now-playing, Sonarr/Radarr recently added + upcoming).
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(get_media))
        .route("/services", get(get_media_services))
        .route("/discover", get(get_media_discover))
        .route("/queue", get(get_media_queue))
        .route("/queue/:service/:id", delete(delete_media_queue_item))
        .route("/calendar", get(get_media_calendar))
        .route("/library", get(get_media_library))
        .route(
            "/library/:service/:id",
            put(update_media_library_item).delete(delete_media_library_item),
        )
        .route("/wanted", get(get_media_wanted))
        .route("/history", get(get_media_history))
        .route("/indexers", get(get_media_indexers))
        .route("/indexers/:service/:id", put(update_media_indexer))
        .route("/indexers/:service/:id/test", post(test_media_indexer))
        .route("/requests", get(get_media_requests))
        .route("/streams", get(get_media_streams))
        .route("/subtitles", get(get_media_subtitles))
        .route("/downloads", get(get_media_downloads))
        .route("/search", get(search_media))
        .route("/detail/:service/:kind/:id", get(get_media_detail))
        .route("/releases/grab", post(grab_media_release))
        .route("/add", post(add_media))
        .route("/command", post(media_command))
        .route("/requests/search", get(search_media_requests))
        .route("/requests/discover", get(discover_media_requests))
        .route("/requests/:service", post(create_media_request))
        .route("/requests/:service/:id/:action", post(action_media_request))
        .route("/subtitles/:service/:action", post(action_media_subtitle))
        .route(
            "/downloads/:service/:id/:action",
            post(action_media_download),
        )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn media_registry_covers_helmarr_plus_clawcontrol_services() {
        let ids: Vec<&str> = MEDIA_SERVICE_REGISTRY.iter().map(|def| def.id).collect();
        for expected in [
            "sonarr",
            "radarr",
            "lidarr",
            "bazarr",
            "unraid",
            "tautulli",
            "jellystat",
            "overseerr",
            "jellyseerr",
            "qbittorrent",
            "sabnzbd",
            "nzbget",
            "wizarr",
            "prowlarr",
            "transmission",
            "deluge",
            "jellyfin",
            "emby",
            "readarr",
            "whisparr",
            "mylar",
            "autobrr",
            "recyclarr",
            "kometa",
            "flaresolverr",
            "gluetun",
            "lettarrboxd",
            "grafana",
            "prometheus",
            "loki",
            "alloy",
            "cloudflared",
            "crowdsec",
            "pelican",
            "vaultwarden",
            "picard",
            "koel",
            "nzbhydra2",
            "jackett",
            "tracearr",
            "ssh",
            "sftp",
        ] {
            assert!(
                ids.contains(&expected),
                "missing registry service {expected}"
            );
        }
    }

    #[test]
    fn media_registry_entries_have_credentials_and_detection_hints() {
        for def in MEDIA_SERVICE_REGISTRY {
            assert!(!def.id.is_empty());
            assert!(!def.name.is_empty());
            assert!(!def.group.is_empty());
            assert!(!def.kind.is_empty());
            assert!(
                !def.credential_keys.is_empty(),
                "{} should expose setup credential keys",
                def.id
            );
            assert!(
                !def.docker_hints.is_empty(),
                "{} should be docker-detectable",
                def.id
            );
            assert!(
                !def.actions.is_empty(),
                "{} should expose capabilities",
                def.id
            );
        }
    }

    #[test]
    fn docker_detection_matches_name_or_image_hints() {
        let sonarr = media_definition("sonarr").expect("sonarr def");
        let detection = MediaDockerDetection {
            container: "media-sonarr-1".into(),
            image: "lscr.io/linuxserver/sonarr:latest".into(),
            state: "running".into(),
            status: "Up 2 hours".into(),
            ports: "0.0.0.0:8989->8989/tcp".into(),
            endpoint_id: None,
            endpoint_name: None,
            host: None,
            source: "docker".into(),
        };
        assert_eq!(detections_for_service(sonarr, &[detection]).len(), 1);
    }

    #[test]
    fn docker_detection_ignores_database_sidecars() {
        let koel = media_definition("koel").expect("koel def");
        let detection = MediaDockerDetection {
            container: "koel-db".into(),
            image: "mariadb:latest".into(),
            state: "running".into(),
            status: "Up 2 hours".into(),
            ports: "0.0.0.0:3306->3306/tcp".into(),
            endpoint_id: None,
            endpoint_name: None,
            host: None,
            source: "docker".into(),
        };
        assert!(detections_for_service(koel, &[detection]).is_empty());
    }

    #[test]
    fn portainer_detection_infers_urls_from_endpoint_hosts() {
        let inventory = json!({
            "instances": [{
                "endpoints": [
                    { "id": 4, "name": "plex-vm", "url": "tcp://100.123.117.46:9001" }
                ]
            }],
            "containers": [
                {
                    "name": "bazarr",
                    "image": "lscr.io/linuxserver/bazarr:latest",
                    "state": "running",
                    "status": "Up 4 hours",
                    "ports": "[{\"PrivatePort\":6767,\"PublicPort\":6767,\"Type\":\"tcp\"}]",
                    "endpoint_id": 4,
                    "endpoint_name": "plex-vm"
                },
                {
                    "name": "gluetun",
                    "image": "qmcgaw/gluetun:latest",
                    "state": "running",
                    "status": "Up 4 hours",
                    "ports": "[{\"PrivatePort\":8989,\"PublicPort\":8989,\"Type\":\"tcp\"},{\"PrivatePort\":7878,\"PublicPort\":7878,\"Type\":\"tcp\"},{\"PrivatePort\":9696,\"PublicPort\":9696,\"Type\":\"tcp\"},{\"PrivatePort\":8080,\"PublicPort\":8082,\"Type\":\"tcp\"}]",
                    "endpoint_id": 4,
                    "endpoint_name": "plex-vm"
                }
            ]
        });
        let detections = portainer_detections_from_inventory(&inventory);
        let bazarr = media_definition("bazarr").expect("bazarr def");
        let sonarr = media_definition("sonarr").expect("sonarr def");
        let qbittorrent = media_definition("qbittorrent").expect("qbittorrent def");

        let bazarr_detection = detections_for_service(bazarr, &detections)
            .into_iter()
            .next()
            .expect("bazarr detection");
        assert_eq!(
            bazarr_detection.get("detected_url").and_then(Value::as_str),
            Some("http://100.123.117.46:6767")
        );

        let sonarr_detection = detections_for_service(sonarr, &detections)
            .into_iter()
            .next()
            .expect("sonarr detection via gluetun");
        assert_eq!(
            sonarr_detection.get("detected_url").and_then(Value::as_str),
            Some("http://100.123.117.46:8989")
        );

        let qbit_detection = detections_for_service(qbittorrent, &detections)
            .into_iter()
            .next()
            .expect("qbit detection via gluetun");
        assert_eq!(
            qbit_detection.get("detected_url").and_then(Value::as_str),
            Some("http://100.123.117.46:8082")
        );
    }

    #[test]
    fn portainer_detection_does_not_invent_unpublished_default_urls() {
        let lidarr = media_definition("lidarr").expect("lidarr def");
        let detection = MediaDockerDetection {
            container: "lidarr".into(),
            image: "lscr.io/linuxserver/lidarr:latest".into(),
            state: "running".into(),
            status: "Up 4 hours".into(),
            ports: "[]".into(),
            endpoint_id: Some(4),
            endpoint_name: Some("plex-vm".into()),
            host: Some("100.123.117.46".into()),
            source: "portainer".into(),
        };
        let lidarr_detection = detections_for_service(lidarr, &[detection])
            .into_iter()
            .next()
            .expect("lidarr detection");

        assert_eq!(
            lidarr_detection.get("detected_url").and_then(Value::as_str),
            None
        );
        assert_eq!(
            lidarr_detection
                .get("default_port_published")
                .and_then(Value::as_bool),
            Some(false)
        );
    }

    #[test]
    fn portainer_local_endpoint_uses_instance_host_for_published_ports() {
        let inventory = json!({
            "instances": [{
                "url": "https://100.124.53.97:9443",
                "endpoints": [
                    { "id": 3, "name": "local", "url": "unix:///var/run/docker.sock" }
                ]
            }],
            "containers": [{
                "name": "vaultwarden",
                "image": "vaultwarden/server:latest",
                "state": "running",
                "status": "Up 4 hours",
                "ports": "[{\"IP\":\"0.0.0.0\",\"PrivatePort\":80,\"PublicPort\":8222,\"Type\":\"tcp\"}]",
                "endpoint_id": 3,
                "endpoint_name": "local"
            }]
        });
        let detections = portainer_detections_from_inventory(&inventory);
        let vaultwarden = media_definition("vaultwarden").expect("vaultwarden def");
        let detection = detections_for_service(vaultwarden, &detections)
            .into_iter()
            .next()
            .expect("vaultwarden detection");

        assert_eq!(
            detection.get("detected_url").and_then(Value::as_str),
            Some("http://100.124.53.97:8222")
        );
    }

    #[test]
    fn portainer_detection_ignores_loopback_and_other_interface_bindings() {
        let pelican = media_definition("pelican").expect("pelican def");
        let crowdsec = media_definition("crowdsec").expect("crowdsec def");
        let pelican_detection = MediaDockerDetection {
            container: "pelican-panel-1".into(),
            image: "ghcr.io/pelican-dev/panel:v1.0.0-beta33".into(),
            state: "running".into(),
            status: "Up 4 hours".into(),
            ports:
                "[{\"IP\":\"127.0.0.1\",\"PrivatePort\":80,\"PublicPort\":8080,\"Type\":\"tcp\"}]"
                    .into(),
            endpoint_id: Some(4),
            endpoint_name: Some("plex-vm".into()),
            host: Some("100.123.117.46".into()),
            source: "portainer".into(),
        };
        let crowdsec_detection = MediaDockerDetection {
            container: "pelican-wings-crowdsec-engine-1".into(),
            image: "crowdsecurity/crowdsec:v1.7.6".into(),
            state: "running".into(),
            status: "Up 4 hours".into(),
            ports: "[{\"IP\":\"10.40.40.153\",\"PrivatePort\":8080,\"PublicPort\":6060,\"Type\":\"tcp\"}]".into(),
            endpoint_id: Some(4),
            endpoint_name: Some("plex-vm".into()),
            host: Some("100.123.117.46".into()),
            source: "portainer".into(),
        };

        let pelican_result = detections_for_service(pelican, &[pelican_detection])
            .into_iter()
            .next()
            .expect("pelican detection");
        let crowdsec_result = detections_for_service(crowdsec, &[crowdsec_detection])
            .into_iter()
            .next()
            .expect("crowdsec detection");

        assert_eq!(
            pelican_result.get("detected_url").and_then(Value::as_str),
            None
        );
        assert_eq!(
            crowdsec_result.get("detected_url").and_then(Value::as_str),
            None
        );

        let gluetun = MediaDockerDetection {
            container: "gluetun".into(),
            image: "qmcgaw/gluetun:latest".into(),
            state: "running".into(),
            status: "Up 4 hours".into(),
            ports:
                "[{\"IP\":\"0.0.0.0\",\"PrivatePort\":8080,\"PublicPort\":8082,\"Type\":\"tcp\"}]"
                    .into(),
            endpoint_id: Some(4),
            endpoint_name: Some("plex-vm".into()),
            host: Some("100.123.117.46".into()),
            source: "portainer".into(),
        };
        assert_eq!(detections_for_service(crowdsec, &[gluetun]).len(), 0);
    }

    #[test]
    fn remote_detection_finds_wings_ssh_sftp_port() {
        let ssh = media_definition("ssh").expect("ssh def");
        let sftp = media_definition("sftp").expect("sftp def");
        let detection = MediaDockerDetection {
            container: "pelican-wings-wings-1".into(),
            image: "ghcr.io/pelican-dev/wings:v1.0.0-beta24".into(),
            state: "running".into(),
            status: "Up 5 weeks".into(),
            ports:
                "[{\"IP\":\"0.0.0.0\",\"PrivatePort\":2022,\"PublicPort\":2022,\"Type\":\"tcp\"}]"
                    .into(),
            endpoint_id: Some(4),
            endpoint_name: Some("plex-vm".into()),
            host: Some("100.123.117.46".into()),
            source: "portainer".into(),
        };

        let ssh_detection = detections_for_service(ssh, &[detection.clone()])
            .into_iter()
            .next()
            .expect("ssh detection");
        let sftp_detection = detections_for_service(sftp, &[detection])
            .into_iter()
            .next()
            .expect("sftp detection");

        assert_eq!(
            ssh_detection.get("detected_url").and_then(Value::as_str),
            Some("ssh://100.123.117.46:2022")
        );
        assert_eq!(
            sftp_detection.get("detected_url").and_then(Value::as_str),
            Some("sftp://100.123.117.46:2022")
        );
    }

    #[test]
    fn media_capabilities_has_actions_per_service() {
        let capabilities = media_capabilities();
        let sonarr_actions = capabilities
            .get("sonarr")
            .and_then(|value| value.get("actions"))
            .and_then(Value::as_array)
            .expect("sonarr actions");
        assert!(sonarr_actions.iter().any(|action| action == "search"));

        let qbit_actions = capabilities
            .get("qbittorrent")
            .and_then(|value| value.get("actions"))
            .and_then(Value::as_array)
            .expect("qbittorrent actions");
        assert!(qbit_actions.iter().any(|action| action == "set-category"));
        assert!(qbit_actions.iter().any(|action| action == "add-tags"));

        let sab_actions = capabilities
            .get("sabnzbd")
            .and_then(|value| value.get("actions"))
            .and_then(Value::as_array)
            .expect("sabnzbd actions");
        assert!(sab_actions.iter().any(|action| action == "pause"));
        assert!(sab_actions.iter().any(|action| action == "resume"));
        assert!(sab_actions.iter().any(|action| action == "remove"));
        assert!(!sab_actions.iter().any(|action| action == "recheck"));
        assert!(!sab_actions.iter().any(|action| action == "set-category"));
        assert!(!sab_actions.iter().any(|action| action == "add-tags"));

        let nzbget_actions = capabilities
            .get("nzbget")
            .and_then(|value| value.get("actions"))
            .and_then(Value::as_array)
            .expect("nzbget actions");
        assert!(!nzbget_actions.iter().any(|action| action == "recheck"));

        let transmission_actions = capabilities
            .get("transmission")
            .and_then(|value| value.get("actions"))
            .and_then(Value::as_array)
            .expect("transmission actions");
        assert!(transmission_actions
            .iter()
            .any(|action| action == "recheck"));
    }

    #[test]
    fn plex_recent_item_uses_show_title_for_seasons_and_episodes() {
        let season = plex_recent_item(PlexLibraryItem {
            rating_key: Some("season-1".into()),
            parent_rating_key: None,
            grandparent_rating_key: Some("show-1".into()),
            title: Some("Season 3".into()),
            parent_title: None,
            grandparent_title: Some("The Bear".into()),
            media_type: Some("season".into()),
            year: Some(2024),
        })
        .expect("season item");
        assert_eq!(season.title, "The Bear");
        assert_eq!(season.subtitle.as_deref(), Some("Season 3"));
        assert_eq!(season.detail_ref.unwrap()["kind"], "season");

        let episode = plex_recent_item(PlexLibraryItem {
            rating_key: Some("episode-1".into()),
            parent_rating_key: Some("season-1".into()),
            grandparent_rating_key: Some("show-1".into()),
            title: Some("Forks".into()),
            parent_title: Some("Season 2".into()),
            grandparent_title: Some("The Bear".into()),
            media_type: Some("episode".into()),
            year: Some(2023),
        })
        .expect("episode item");
        assert_eq!(episode.title, "The Bear");
        assert_eq!(episode.subtitle.as_deref(), Some("Season 2 - Forks"));
    }

    #[test]
    fn sonarr_upcoming_uses_series_map_when_calendar_series_is_missing() {
        let mut series_map = HashMap::new();
        series_map.insert(42, "Severance".to_string());
        let item = sonarr_upcoming_item(
            SonarrEpisode {
                id: Some(1001),
                series_id: Some(42),
                series: None,
                title: Some("Cold Harbor".into()),
                air_date_utc: Some("2026-05-22T01:00:00Z".into()),
                season_number: Some(2),
                episode_number: Some(9),
            },
            &series_map,
        );

        assert_eq!(item.title, "Severance S02E09: Cold Harbor");
        assert_eq!(item.air_date, "2026-05-22");
        assert_ne!(item.title, "Unknown S02E09");
        assert_eq!(item.detail_ref.unwrap()["kind"], "episode");
    }

    #[test]
    fn service_state_labels_include_detected_daemon_and_unpublished_port() {
        assert_eq!(
            state_label(MediaServiceState::DetectedNoDirectUi),
            "detected_no_direct_ui"
        );
        assert_eq!(
            state_label(MediaServiceState::DetectedUnpublishedPort),
            "detected_unpublished_port"
        );
    }

    #[test]
    fn detected_unpublished_services_do_not_show_generic_missing_credentials() {
        let flaresolverr = media_definition("flaresolverr").expect("flaresolverr def");
        let detection = json!({
            "service": "flaresolverr",
            "container": "flaresolverr",
            "state": "running",
            "detected_url": null,
            "default_port_published": false
        });
        assert!(suppress_missing_credentials_for_detected_service(
            flaresolverr,
            &[detection]
        ));

        let bazarr = media_definition("bazarr").expect("bazarr def");
        let bazarr_detection = json!({
            "service": "bazarr",
            "container": "bazarr",
            "state": "running",
            "detected_url": null,
            "default_port_published": false
        });
        assert!(!suppress_missing_credentials_for_detected_service(
            bazarr,
            &[bazarr_detection]
        ));
    }

    #[test]
    fn detected_sidecars_do_not_become_configured_control_apps() {
        assert_eq!(
            service_state_from_flags(
                "gluetun", false, false, true, false, true, true, false, false
            ),
            MediaServiceState::DetectedNoDirectUi
        );
        assert_eq!(
            service_state_from_flags(
                "cloudflared",
                false,
                false,
                true,
                false,
                true,
                true,
                false,
                false
            ),
            MediaServiceState::DetectedNoDirectUi
        );
        assert_eq!(
            service_state_from_flags("kometa", false, false, true, false, true, true, false, false),
            MediaServiceState::DetectedNoDirectUi
        );
        assert_eq!(
            service_state_from_flags(
                "recyclarr",
                false,
                false,
                true,
                false,
                true,
                true,
                false,
                false
            ),
            MediaServiceState::DetectedNoDirectUi
        );
        assert_eq!(
            service_state_from_flags("koel", false, false, false, false, false, true, false, false),
            MediaServiceState::Offline
        );
        assert_eq!(
            service_state_from_flags(
                "flaresolverr",
                false,
                false,
                true,
                false,
                true,
                true,
                false,
                false
            ),
            MediaServiceState::DetectedUnpublishedPort
        );
        assert_eq!(
            service_state_from_flags("bazarr", false, false, true, false, true, true, false, true),
            MediaServiceState::Configured
        );
    }

    #[test]
    fn bazarr_subtitle_search_paths_use_live_wanted_ids() {
        let movie = json!({
            "radarrId": 644,
            "missing_subtitle_details": [{ "code2": "ea", "forced": false, "hi": false }]
        });
        assert_eq!(
            bazarr_subtitle_search_path(&movie).expect("movie path"),
            "/api/movies/subtitles?radarrid=644&language=ea&forced=false&hi=false"
        );

        let episode = json!({
            "sonarrSeriesId": 21,
            "sonarrEpisodeId": 1493,
            "missing_subtitle_details": [{ "code2": "en", "forced": true, "hi": false }]
        });
        assert_eq!(
            bazarr_subtitle_search_path(&episode).expect("episode path"),
            "/api/episodes/subtitles?seriesid=21&episodeid=1493&language=en&forced=true&hi=false"
        );
    }

    #[test]
    fn media_request_body_preserves_seasons_4k_tags_and_user() {
        let body = media_request_body(&json!({
            "id": 157336,
            "media_type": "tv",
            "is4k": true,
            "seasons": [1, 2],
            "tags": [7, 9],
            "userId": 42
        }))
        .expect("request body");

        assert_eq!(body["mediaId"], 157336);
        assert_eq!(body["mediaType"], "tv");
        assert_eq!(body["is4k"], true);
        assert_eq!(body["seasons"], json!([1, 2]));
        assert_eq!(body["tags"], json!([7, 9]));
        assert_eq!(body["userId"], 42);
    }

    #[test]
    fn media_request_body_normalizes_object_seasons_to_overseerr_numbers() {
        let body = media_request_body(&json!({
            "id": 95396,
            "mediaType": "tv",
            "seasons": [{ "seasonNumber": 3 }, { "seasonNumber": 1 }, 1]
        }))
        .expect("request body");

        assert_eq!(body["seasons"], json!([1, 3]));
    }

    #[test]
    fn media_request_body_requires_media_id() {
        let err = media_request_body(&json!({"mediaType": "movie"})).unwrap_err();
        assert!(format!("{err:?}").contains("Missing request media id"));
    }

    #[test]
    fn request_discovery_path_maps_provider_and_category() {
        let params = HashMap::from([
            ("kind".to_string(), "tv".to_string()),
            ("category".to_string(), "popular".to_string()),
            ("provider".to_string(), "350".to_string()),
        ]);
        assert_eq!(
            request_discovery_path(&params),
            "/api/v1/discover/tv?page=1&watchRegion=US&watchProviders=350"
        );

        let params = HashMap::from([
            ("kind".to_string(), "movie".to_string()),
            ("category".to_string(), "upcoming".to_string()),
            ("page".to_string(), "2".to_string()),
        ]);
        assert_eq!(
            request_discovery_path(&params),
            "/api/v1/discover/movies/upcoming?page=2"
        );

        let params = HashMap::from([("category".to_string(), "trending".to_string())]);
        assert_eq!(
            request_discovery_path(&params),
            "/api/v1/discover/trending?page=1"
        );
    }

    #[test]
    fn request_discovery_items_keep_clickable_request_shape() {
        let item = normalize_request_discovery_item(json!({
            "id": 202411,
            "name": "Monarch: Legacy of Monsters",
            "mediaType": "tv",
            "firstAirDate": "2023-11-17",
            "posterPath": "/poster.jpg",
            "mediaInfo": {
                "seasons": [{ "seasonNumber": 1 }, { "seasonNumber": 2 }]
            }
        }));

        assert_eq!(item["id"], 202411);
        assert_eq!(item["title"], "Monarch: Legacy of Monsters");
        assert_eq!(item["mediaType"], "tv");
        assert_eq!(item["firstAirDate"], "2023-11-17");
        assert_eq!(item["mediaInfo"]["seasons"][1]["seasonNumber"], 2);
    }

    #[test]
    fn normalized_request_items_keep_enriched_media_title_and_ids() {
        let item = normalize_request_item(json!({
            "service": "overseerr",
            "serviceName": "Overseerr",
            "id": 43,
            "status": 4,
            "media": {
                "title": "The Secret Life of Walter Mitty",
                "mediaType": "movie",
                "tmdbId": 116745,
                "year": 2013,
                "status": 5,
                "status4k": 1
            },
            "requestedBy": {
                "displayName": "alejandroaparcedo",
                "email": "aaparcedo.io@gmail.com"
            }
        }));

        assert_eq!(item["media"]["title"], "The Secret Life of Walter Mitty");
        assert_eq!(item["media"]["year"], 2013);
        assert_eq!(item["media"]["tmdbId"], 116745);
        assert_eq!(item["requestedBy"]["displayName"], "alejandroaparcedo");
    }

    #[test]
    fn arr_detail_context_matches_episode_queue_wanted_and_history_ids() {
        let cfg = ArrConfig {
            id: "sonarr",
            name: "Sonarr",
            kind: ArrKind::Sonarr,
            api_version: "v3",
            url: "http://sonarr.local".into(),
            api_key: "test".into(),
        };

        assert!(arr_related_record_matches(
            &cfg,
            "episode",
            1776,
            &json!({ "episodeId": 1776, "seriesId": 5 })
        ));
        assert!(arr_related_record_matches(
            &cfg,
            "episode",
            1776,
            &json!({ "id": 1776, "seriesId": 5 })
        ));
        assert!(!arr_related_record_matches(
            &cfg,
            "episode",
            1776,
            &json!({ "episodeId": 270, "seriesId": 5 })
        ));
        assert!(arr_related_record_matches(
            &cfg,
            "series",
            5,
            &json!({ "episodeId": 1776, "seriesId": 5 })
        ));
    }

    #[test]
    fn normalize_indexer_health_keeps_warning_details() {
        let item = normalize_indexer_health_item(json!({
            "service": "prowlarr",
            "serviceName": "Prowlarr",
            "source": "IndexerNoDefinitionCheck",
            "type": "error",
            "message": "Indexers have no definition and will not work: BitSearch.",
            "wikiUrl": "https://wiki.servarr.com/prowlarr/system#indexers-have-no-definition",
            "ignored": true
        }));

        assert_eq!(item["service"], "prowlarr");
        assert_eq!(item["type"], "error");
        assert_eq!(item["source"], "IndexerNoDefinitionCheck");
        assert_eq!(
            item["message"],
            "Indexers have no definition and will not work: BitSearch."
        );
        assert!(item.get("ignored").is_none());
    }

    #[test]
    fn normalize_stream_item_maps_tautulli_progress_and_player() {
        let item = normalize_stream_item(json!({
            "service": "tautulli",
            "serviceName": "Tautulli",
            "full_title": "Severance - Cold Harbor",
            "username": "alejandro",
            "friendly_name": "Apple TV",
            "video_decision": "direct play",
            "view_offset": "42000",
            "duration": "100000",
            "ignored": true
        }));

        assert_eq!(item["player"], "Apple TV");
        assert_eq!(item["transcode_decision"], "direct play");
        assert_eq!(item["progress"], 42.0);
        assert!(item.get("ignored").is_none());
    }

    #[test]
    fn browse_items_keep_clickable_library_shape() {
        let library = vec![
            json!({
                "service": "sonarr",
                "id": 42,
                "kind": "series",
                "title": "Severance",
                "network": "Apple TV+",
                "detail_ref": {"service": "sonarr", "kind": "series", "id": "42"}
            }),
            json!({
                "service": "radarr",
                "id": 7,
                "year": 2024
            }),
        ];

        let browse = build_browse_items(&library);
        assert_eq!(browse.len(), 1);
        assert_eq!(browse[0]["title"], "Severance");
        assert_eq!(browse[0]["network"], "Apple TV+");
        assert_eq!(browse[0]["detail_ref"]["kind"], "series");
    }
}
