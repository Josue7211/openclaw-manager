use axum::{
    extract::{Path, Query, State},
    routing::{delete, get, post, put},
    Json, Router,
};
use reqwest::header::{COOKIE, SET_COOKIE};
use reqwest::Method;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;

use crate::error::AppError;
use crate::server::{AppState, RequireAuth};

// ── Config helpers ──────────────────────────────────────────────────────────

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

fn service_host(url: &str) -> String {
    url::Url::parse(url)
        .ok()
        .and_then(|parsed| parsed.host_str().map(ToString::to_string))
        .unwrap_or_else(|| url.to_string())
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

    let url = trim_url(state.secret_or_default(url_key));
    if url.is_empty() {
        return None;
    }
    Some(EcosystemConfig {
        id: match id {
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
            .map(|key| state.secret_or_default(key))
            .filter(|value| !value.trim().is_empty()),
        username: username_key
            .map(|key| state.secret_or_default(key))
            .filter(|value| !value.trim().is_empty()),
        password: password_key
            .map(|key| state.secret_or_default(key))
            .filter(|value| !value.trim().is_empty()),
    })
}

fn all_ecosystem_configs(state: &AppState) -> Vec<EcosystemConfig> {
    [
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
    year: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Upcoming {
    title: String,
    air_date: String,
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
    view_offset: Option<u64>,
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
    title: Option<String>,
    #[serde(rename = "type")]
    media_type: Option<String>,
    year: Option<i64>,
}

// ── Sonarr API types ────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[allow(dead_code)] // serde struct: all fields used but lint fires on struct-level for Deserialize-only types
struct SonarrEpisode {
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
    title: Option<String>,
    year: Option<i64>,
    added: Option<String>,
}

// ── Radarr API types ────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[allow(dead_code)] // serde struct: date_added field deserialized from Radarr API but not yet consumed
struct RadarrMovie {
    title: Option<String>,
    year: Option<i64>,
    #[serde(rename = "dateAdded")]
    date_added: Option<String>,
    #[serde(rename = "hasFile")]
    has_file: Option<bool>,
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
    arr_request_value(http, cfg, Method::GET, path, None)
        .await
        .ok()
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
        .header("Accept", "application/json");

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

fn ecosystem_service_stub(id: &'static str, name: &'static str, kind: &'static str) -> Value {
    json!({
        "id": id,
        "name": name,
        "kind": kind,
        "configured": false,
        "healthy": false,
    })
}

fn all_ecosystem_service_stubs() -> Vec<Value> {
    vec![
        ecosystem_service_stub("overseerr", "Overseerr", "requests"),
        ecosystem_service_stub("jellyseerr", "Jellyseerr", "requests"),
        ecosystem_service_stub("tautulli", "Tautulli", "analytics"),
        ecosystem_service_stub("bazarr", "Bazarr", "subtitles"),
        ecosystem_service_stub("jellystat", "Jellystat", "analytics"),
        ecosystem_service_stub("qbittorrent", "qBittorrent", "downloads"),
        ecosystem_service_stub("sabnzbd", "SABnzbd", "downloads"),
        ecosystem_service_stub("nzbget", "NZBGet", "downloads"),
        ecosystem_service_stub("transmission", "Transmission", "downloads"),
        ecosystem_service_stub("deluge", "Deluge", "downloads"),
        ecosystem_service_stub("unraid", "Unraid", "server"),
        ecosystem_service_stub("wizarr", "Wizarr", "invites"),
    ]
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
        .header("Accept", "application/json");
    if let Some(api_key) = &cfg.api_key {
        req = req
            .header("X-Api-Key", api_key)
            .header("X-API-Key", api_key);
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
    let mut req = http.get(ecosystem_url(cfg, path));
    if let Some(api_key) = &cfg.api_key {
        req = req
            .header("X-Api-Key", api_key)
            .header("X-API-Key", api_key);
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
        .json(&body);
    if let Some(api_key) = &cfg.api_key {
        req = req
            .header("X-Api-Key", api_key)
            .header("X-API-Key", api_key);
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
        .header("Accept", "application/json");
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
    let mut req = http.get(ecosystem_url(cfg, path));
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
    let mut req = http.post(ecosystem_url(cfg, path)).form(form);
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
            .json(body);
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
        .json(&json!({ "method": method, "params": params, "id": 1 }));
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
        EcosystemKind::Overseerr | EcosystemKind::Jellyseerr => {
            ecosystem_get_json(http, cfg, "/api/v1/status").await
        }
        EcosystemKind::Tautulli => {
            let key = cfg.api_key.as_deref().unwrap_or("");
            ecosystem_get_json(http, cfg, &format!("/api/v2?apikey={key}&cmd=status")).await
        }
        EcosystemKind::Bazarr => ecosystem_get_json(http, cfg, "/api/system/status").await,
        EcosystemKind::Jellystat => ecosystem_get_json(http, cfg, "/api/health").await,
        EcosystemKind::Qbittorrent => qbittorrent_get_text(http, cfg, "/api/v2/app/version")
            .await
            .map(|version| json!({ "version": version })),
        EcosystemKind::Sabnzbd => {
            let key = cfg.api_key.as_deref().unwrap_or("");
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

fn add_service_tag(service: &ArrConfig, mut value: Value) -> Value {
    if let Some(obj) = value.as_object_mut() {
        obj.insert("service".into(), json!(service.id));
        obj.insert("serviceName".into(), json!(service.name));
    }
    value
}

fn extract_records(value: Value) -> Vec<Value> {
    if let Some(records) = value.get("records").and_then(Value::as_array) {
        return records.clone();
    }
    value.as_array().cloned().unwrap_or_default()
}

async fn fetch_arr_queue(http: &reqwest::Client, cfg: &ArrConfig) -> Vec<Value> {
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
        ArrKind::Radarr => "/movie",
        ArrKind::Lidarr => "/artist",
        ArrKind::Prowlarr => "/indexer",
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
    value
        .get("results")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .map(|v| add_ecosystem_tag(cfg, v))
        .collect()
}

async fn fetch_ecosystem_streams(http: &reqwest::Client, cfg: &EcosystemConfig) -> Vec<Value> {
    match cfg.kind {
        EcosystemKind::Tautulli => {
            let key = cfg.api_key.as_deref().unwrap_or("");
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
        if let Ok(value) = ecosystem_get_json(http, cfg, path).await {
            out.extend(
                extract_records(value)
                    .into_iter()
                    .map(|v| add_ecosystem_tag(cfg, v)),
            );
        }
    }
    out
}

async fn fetch_ecosystem_downloads(http: &reqwest::Client, cfg: &EcosystemConfig) -> Vec<Value> {
    match cfg.kind {
        EcosystemKind::Sabnzbd => {
            let key = cfg.api_key.as_deref().unwrap_or("");
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

// ── Mock data (matches TypeScript MOCK_DATA) ────────────────────────────────

fn mock_recently_added() -> Vec<RecentlyAdded> {
    vec![
        RecentlyAdded {
            title: "Breaking Bad".into(),
            media_type: "show".into(),
            year: Some(2008),
        },
        RecentlyAdded {
            title: "Inception".into(),
            media_type: "movie".into(),
            year: Some(2010),
        },
    ]
}

fn mock_upcoming() -> Vec<Upcoming> {
    vec![
        Upcoming {
            title: "House of Dragon S2E5".into(),
            air_date: "2026-03-10".into(),
        },
        Upcoming {
            title: "Severance S2E8".into(),
            air_date: "2026-03-12".into(),
        },
    ]
}

fn mock_response() -> Value {
    json!({
        "now_playing": null,
        "recently_added": mock_recently_added(),
        "upcoming": mock_upcoming(),
        "services": [
            { "id": "plex", "name": "Plex", "kind": "streaming", "configured": false, "healthy": false },
            { "id": "sonarr", "name": "Sonarr", "kind": "series", "configured": false, "healthy": false },
            { "id": "radarr", "name": "Radarr", "kind": "movie", "configured": false, "healthy": false },
            { "id": "lidarr", "name": "Lidarr", "kind": "music", "configured": false, "healthy": false },
            { "id": "prowlarr", "name": "Prowlarr", "kind": "indexer", "configured": false, "healthy": false },
            { "id": "overseerr", "name": "Overseerr", "kind": "requests", "configured": false, "healthy": false },
            { "id": "jellyseerr", "name": "Jellyseerr", "kind": "requests", "configured": false, "healthy": false },
            { "id": "tautulli", "name": "Tautulli", "kind": "analytics", "configured": false, "healthy": false },
            { "id": "bazarr", "name": "Bazarr", "kind": "subtitles", "configured": false, "healthy": false },
            { "id": "jellystat", "name": "Jellystat", "kind": "analytics", "configured": false, "healthy": false },
            { "id": "qbittorrent", "name": "qBittorrent", "kind": "downloads", "configured": false, "healthy": false },
            { "id": "sabnzbd", "name": "SABnzbd", "kind": "downloads", "configured": false, "healthy": false },
            { "id": "nzbget", "name": "NZBGet", "kind": "downloads", "configured": false, "healthy": false },
            { "id": "transmission", "name": "Transmission", "kind": "downloads", "configured": false, "healthy": false },
            { "id": "deluge", "name": "Deluge", "kind": "downloads", "configured": false, "healthy": false },
            { "id": "unraid", "name": "Unraid", "kind": "server", "configured": false, "healthy": false },
            { "id": "wizarr", "name": "Wizarr", "kind": "invites", "configured": false, "healthy": false }
        ],
        "queue": [],
        "calendar": [],
        "library": [],
        "wanted": [],
        "history": [],
        "indexers": [],
        "requests": [],
        "streams": [],
        "subtitles": [],
        "downloads": [],
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

    // If nothing is configured, return mock data
    if plex_cfg.is_none()
        && sonarr_cfg.is_none()
        && radarr_cfg.is_none()
        && arr_services.is_empty()
        && ecosystem_services.is_empty()
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

    // ── Recently added ──────────────────────────────────────────────────────
    // Merge Plex library + Sonarr series + Radarr movies (deduped by title)

    let mut recently_added: Vec<RecentlyAdded> = Vec::new();

    // 1. Plex recently added (up to 5)
    if let Some(container) = plex_recently {
        if let Some(mc) = container.media_container {
            for item in mc.metadata.into_iter().take(5) {
                let media_type = match item.media_type.as_deref() {
                    Some("movie") => "movie",
                    _ => "show",
                };
                recently_added.push(RecentlyAdded {
                    title: item.title.unwrap_or_else(|| "Unknown".into()),
                    media_type: media_type.into(),
                    year: item.year,
                });
            }
        }
    }

    // 2. Sonarr series (up to 3, only if we have fewer than 5 entries)
    if recently_added.len() < 5 {
        if let Some(series) = sonarr_series {
            for s in series.into_iter().take(3) {
                let title = s.title.unwrap_or_else(|| "Unknown".into());
                if !recently_added.iter().any(|r| r.title == title) {
                    recently_added.push(RecentlyAdded {
                        title,
                        media_type: "show".into(),
                        year: s.year,
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
                    recently_added.push(RecentlyAdded {
                        title,
                        media_type: "movie".into(),
                        year: m.year,
                    });
                }
            }
        }
    }

    // ── Upcoming episodes ───────────────────────────────────────────────────

    let mut upcoming: Vec<Upcoming> = Vec::new();

    if let Some(episodes) = sonarr_calendar {
        for ep in episodes.into_iter().take(6) {
            let show_title = ep
                .series
                .and_then(|s| s.title)
                .unwrap_or_else(|| "Unknown".into());
            let season = ep.season_number.unwrap_or(0);
            let episode = ep.episode_number.unwrap_or(0);
            let label = format!("{} S{:02}E{:02}", show_title, season, episode);
            let air_date = ep
                .air_date_utc
                .as_deref()
                .unwrap_or("")
                .split('T')
                .next()
                .unwrap_or("")
                .to_string();
            upcoming.push(Upcoming {
                title: label,
                air_date,
            });
        }
    }

    // ── Build response ──────────────────────────────────────────────────────
    // Fall back to mock data for sections that returned empty results.

    let recently_added_out: Value = serde_json::to_value(&recently_added).unwrap_or(json!([]));
    let upcoming_out: Value = serde_json::to_value(&upcoming).unwrap_or(json!([]));

    let mut services = Vec::new();
    if let Some(plex) = &plex_cfg {
        services.push(plex_service_health(http, plex).await);
    } else {
        services.push(json!({
            "id": "plex",
            "name": "Plex",
            "kind": "streaming",
            "configured": false,
            "healthy": false,
        }));
    }
    for service in &arr_services {
        services.push(service_health(http, service).await);
    }
    for id in ["sonarr", "radarr", "lidarr", "prowlarr"] {
        if !arr_services.iter().any(|cfg| cfg.id == id) {
            services.push(json!({
                "id": id,
                "name": match id {
                    "sonarr" => "Sonarr",
                    "radarr" => "Radarr",
                    "lidarr" => "Lidarr",
                    "prowlarr" => "Prowlarr",
                    _ => id,
                },
                "configured": false,
                "healthy": false,
                "kind": match id {
                    "sonarr" => "series",
                    "radarr" => "movie",
                    "lidarr" => "music",
                    "prowlarr" => "indexer",
                    _ => "service",
                },
            }));
        }
    }
    for service in &ecosystem_services {
        services.push(ecosystem_health(http, service).await);
    }
    for stub in all_ecosystem_service_stubs() {
        let id = stub.get("id").and_then(Value::as_str).unwrap_or("");
        if !ecosystem_services.iter().any(|cfg| cfg.id == id) {
            services.push(stub);
        }
    }

    let mut queue = Vec::new();
    let mut calendar = Vec::new();
    let mut library = Vec::new();
    let mut wanted = Vec::new();
    let mut history = Vec::new();
    let mut indexers = Vec::new();
    let mut requests = Vec::new();
    let mut streams = Vec::new();
    let mut subtitles = Vec::new();
    let mut downloads = Vec::new();
    for service in &arr_services {
        queue.extend(fetch_arr_queue(http, service).await);
        calendar.extend(fetch_arr_calendar(http, service, &today, &end_date).await);
        library.extend(fetch_arr_library(http, service).await);
        wanted.extend(fetch_arr_wanted(http, service).await);
        history.extend(fetch_arr_history(http, service).await);
        indexers.extend(fetch_arr_indexers(http, service).await);
    }
    for service in &ecosystem_services {
        requests.extend(fetch_ecosystem_requests(http, service).await);
        streams.extend(fetch_ecosystem_streams(http, service).await);
        subtitles.extend(fetch_ecosystem_subtitles(http, service).await);
        downloads.extend(fetch_ecosystem_downloads(http, service).await);
    }

    Ok(Json(json!({
        "now_playing": now_playing,
        "recently_added": recently_added_out,
        "upcoming": upcoming_out,
        "services": services,
        "queue": queue,
        "calendar": calendar,
        "library": library,
        "wanted": wanted,
        "history": history,
        "indexers": indexers,
        "requests": requests,
        "streams": streams,
        "subtitles": subtitles,
        "downloads": downloads,
        "mock": false,
    })))
}

async fn get_media_services(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let http = &state.http;
    let mut services = Vec::new();
    if let Some(cfg) = plex_config(&state) {
        services.push(plex_service_health(http, &cfg).await);
    } else {
        services.push(json!({
            "id": "plex",
            "name": "Plex",
            "kind": "streaming",
            "configured": false,
            "healthy": false,
        }));
    }
    for id in ["sonarr", "radarr", "lidarr", "prowlarr"] {
        if let Some(cfg) = arr_config(&state, id) {
            services.push(service_health(http, &cfg).await);
        } else {
            services.push(json!({
                "id": id,
                "name": match id {
                    "sonarr" => "Sonarr",
                    "radarr" => "Radarr",
                    "lidarr" => "Lidarr",
                    "prowlarr" => "Prowlarr",
                    _ => id,
                },
                "configured": false,
                "healthy": false,
            }));
        }
    }
    let ecosystem_services = all_ecosystem_configs(&state);
    for cfg in &ecosystem_services {
        services.push(ecosystem_health(http, cfg).await);
    }
    for stub in all_ecosystem_service_stubs() {
        let id = stub.get("id").and_then(Value::as_str).unwrap_or("");
        if !ecosystem_services.iter().any(|cfg| cfg.id == id) {
            services.push(stub);
        }
    }

    Ok(Json(json!({ "services": services })))
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
    for cfg in all_arr_configs(&state) {
        indexers.extend(fetch_arr_indexers(http, &cfg).await);
    }
    Ok(Json(json!({ "indexers": indexers })))
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
    let lookup_path = match cfg.kind {
        ArrKind::Sonarr => "/series/lookup",
        ArrKind::Radarr => "/movie/lookup",
        ArrKind::Lidarr => "/artist/lookup",
        ArrKind::Prowlarr => "/search",
    };
    let path = format!("{lookup_path}?term={}", urlencoding::encode(term));
    let results = arr_request_value(&state.http, &cfg, Method::GET, &path, None).await?;
    Ok(Json(
        json!({ "service": cfg.id, "results": extract_records(results) }),
    ))
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

async fn action_media_download(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Path((service, id, action)): Path<(String, String, String)>,
) -> Result<Json<Value>, AppError> {
    let cfg = ecosystem_config(&state, &service)
        .ok_or_else(|| AppError::BadRequest(format!("{service} is not configured")))?;
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
                _ => {
                    return Err(AppError::BadRequest(format!(
                        "Unsupported qBittorrent action: {action}"
                    )))
                }
            }
        }
        EcosystemKind::Sabnzbd => {
            let key = cfg.api_key.as_deref().unwrap_or("");
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
        .route("/search", get(search_media))
        .route("/add", post(add_media))
        .route("/command", post(media_command))
        .route("/requests/:service/:id/:action", post(action_media_request))
        .route(
            "/downloads/:service/:id/:action",
            post(action_media_download),
        )
}
