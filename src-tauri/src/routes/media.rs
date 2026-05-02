use axum::{
    extract::{Path, Query, State},
    routing::{delete, get, post},
    Json, Router,
};
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

fn arr_config(state: &AppState, id: &str) -> Option<ArrConfig> {
    let (name, kind, url_key, key_key, api_version) = match id {
        "sonarr" => ("Sonarr", ArrKind::Sonarr, "SONARR_URL", "SONARR_API_KEY", "v3"),
        "radarr" => ("Radarr", ArrKind::Radarr, "RADARR_URL", "RADARR_API_KEY", "v3"),
        "lidarr" => ("Lidarr", ArrKind::Lidarr, "LIDARR_URL", "LIDARR_API_KEY", "v1"),
        "prowlarr" => ("Prowlarr", ArrKind::Prowlarr, "PROWLARR_URL", "PROWLARR_API_KEY", "v1"),
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
    arr_request_value(http, cfg, Method::GET, path, None).await.ok()
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

async fn service_health(http: &reqwest::Client, cfg: &ArrConfig) -> Value {
    match arr_fetch_value(http, cfg, "/system/status").await {
        Some(status) => json!({
            "id": cfg.id,
            "name": cfg.name,
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

    // If nothing is configured, return mock data
    if plex_cfg.is_none() && sonarr_cfg.is_none() && radarr_cfg.is_none() {
        return Ok(Json(mock_response()));
    }

    let http = &state.http;
    let arr_services = all_arr_configs(&state);

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

    let recently_added_out: Value = if recently_added.is_empty() {
        serde_json::to_value(mock_recently_added()).unwrap_or(json!([]))
    } else {
        serde_json::to_value(&recently_added).unwrap_or(json!([]))
    };

    let upcoming_out: Value = if upcoming.is_empty() {
        serde_json::to_value(mock_upcoming()).unwrap_or(json!([]))
    } else {
        serde_json::to_value(&upcoming).unwrap_or(json!([]))
    };

    let mut services = Vec::new();
    for service in &arr_services {
        services.push(service_health(http, service).await);
    }

    let mut queue = Vec::new();
    let mut calendar = Vec::new();
    let mut library = Vec::new();
    for service in &arr_services {
        queue.extend(fetch_arr_queue(http, service).await);
        calendar.extend(fetch_arr_calendar(http, service, &today, &end_date).await);
        library.extend(fetch_arr_library(http, service).await);
    }

    Ok(Json(json!({
        "now_playing": now_playing,
        "recently_added": recently_added_out,
        "upcoming": upcoming_out,
        "services": services,
        "queue": queue,
        "calendar": calendar,
        "library": library,
        "mock": false,
    })))
}

async fn get_media_services(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let http = &state.http;
    let mut services = Vec::new();
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
    Ok(Json(json!({ "service": cfg.id, "results": extract_records(results) })))
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

    if !matches!(cfg.kind, ArrKind::Sonarr | ArrKind::Radarr) {
        return Err(AppError::BadRequest(format!(
            "Add is only implemented for Sonarr and Radarr right now, not {}",
            cfg.name
        )));
    }

    let http = &state.http;
    let quality_profile_id = match req
        .options
        .get("qualityProfileId")
        .and_then(Value::as_i64)
    {
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
        _ => unreachable!(),
    };

    let path = match cfg.kind {
        ArrKind::Radarr => "/movie",
        ArrKind::Sonarr => "/series",
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
            ArrKind::Radarr => json!({ "name": "MoviesSearch", "movieIds": req.id.map(|id| vec![id]).unwrap_or_default() }),
            ArrKind::Lidarr => json!({ "name": "ArtistSearch", "artistId": req.id }),
            ArrKind::Prowlarr => json!({ "name": "ApplicationIndexerSync" }),
        },
        "rss-sync" => json!({ "name": "RssSync" }),
        "application-sync" => json!({ "name": "ApplicationIndexerSync" }),
        _ => req.body,
    };

    let result = arr_request_value(&state.http, &cfg, Method::POST, "/command", Some(command)).await?;
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
        .route("/search", get(search_media))
        .route("/add", post(add_media))
        .route("/command", post(media_command))
}
