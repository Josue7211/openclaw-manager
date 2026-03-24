use axum::{extract::State, routing::get, Json, Router};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

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

async fn get_media(State(state): State<AppState>, RequireAuth(_session): RequireAuth) -> Result<Json<Value>, AppError> {
    let plex_cfg = plex_config(&state);
    let sonarr_cfg = sonarr_config(&state);
    let radarr_cfg = radarr_config(&state);

    // If nothing is configured, return mock data
    if plex_cfg.is_none() && sonarr_cfg.is_none() && radarr_cfg.is_none() {
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
                    plex_fetch::<PlexMediaContainer<PlexSession>>(
                        http,
                        cfg,
                        "/status/sessions",
                    )
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

    Ok(Json(json!({
        "now_playing": now_playing,
        "recently_added": recently_added_out,
        "upcoming": upcoming_out,
        "mock": false,
    })))
}

// ── Router ──────────────────────────────────────────────────────────────────

/// Build the `/media` sub-router (Plex now-playing, Sonarr/Radarr recently added + upcoming).
pub fn router() -> Router<AppState> {
    Router::new().route("/", get(get_media))
}
