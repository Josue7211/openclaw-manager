use axum::{
    extract::rejection::JsonRejection,
    extract::{Query, State},
    http::StatusCode,
    response::IntoResponse,
    routing::get,
    Json, Router,
};
use ical::parser::ical::component::IcalCalendar;
use ical::IcalParser;
use reqwest::header::CONTENT_TYPE;
use serde::Deserialize;
use serde::Serialize;
use serde_json::{json, Value};
use std::io::BufReader;

use crate::error::AppError;
use crate::server::{AppState, RequireAuth};

// ── Types ───────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CalendarEvent {
    id: String,
    title: String,
    start: String,
    end: String,
    all_day: bool,
    calendar: String,
    object_url: Option<String>,
}

#[derive(Debug, Clone)]
struct CalendarObject {
    href: String,
    data: String,
}

// ── Router ──────────────────────────────────────────────────────────────────

/// Build the calendar router (CalDAV event discovery and fetching).
pub fn router() -> Router<AppState> {
    Router::new().route(
        "/calendar",
        get(get_events)
            .post(post_event)
            .patch(patch_event)
            .delete(delete_event),
    )
}

// ── GET /api/calendar ───────────────────────────────────────────────────────

async fn get_events(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> impl IntoResponse {
    if let Some(data) = fetch_bridge_calendar(&state).await {
        return (StatusCode::OK, Json(data));
    }

    let url = state
        .secret("CALDAV_URL")
        .unwrap_or_else(|| "https://caldav.icloud.com".to_string());
    let username = state.secret_or_default("CALDAV_USERNAME");
    let password = state.secret_or_default("CALDAV_PASSWORD");

    if username.is_empty() || password.is_empty() {
        if let Some(data) = fetch_local_macos_calendar().await {
            return (StatusCode::OK, Json(data));
        }
        return (
            StatusCode::OK,
            Json(json!({
                "events": [],
                "error": "missing_credentials",
                "message": "iCloud Calendar is not hydrated. Unlock account sync or reconnect the iCloud Calendar account."
            })),
        );
    }

    // Build a dedicated CalDAV client that refuses redirects (SSRF prevention)
    let caldav_client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .unwrap_or_else(|_| state.http.clone());

    match fetch_caldav_events(&caldav_client, &url, &username, &password).await {
        Ok(mut events) => {
            events.sort_by(|a, b| a.start.cmp(&b.start));
            (StatusCode::OK, Json(json!({ "events": events })))
        }
        Err(e) => {
            tracing::error!("[calendar] GET error: {e:#}");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({
                    "events": [],
                    "error": "fetch_failed"
                })),
            )
        }
    }
}

// ── CalDAV helpers ──────────────────────────────────────────────────────────

fn bridge_config(state: &AppState) -> Option<(String, String)> {
    let api_key = state.secret_or_default("MAC_BRIDGE_API_KEY");
    let host = state
        .secret("MAC_BRIDGE_HOST")
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .or_else(|| (!api_key.trim().is_empty()).then(|| "http://127.0.0.1:4100".to_string()))?;
    Some((host, api_key))
}

async fn fetch_bridge_calendar(state: &AppState) -> Option<Value> {
    let (host, api_key) = bridge_config(state)?;

    let url = format!("{host}/calendar");
    let mut req = state
        .http
        .get(&url)
        .timeout(std::time::Duration::from_secs(8));
    if !api_key.is_empty() {
        req = req.header("X-API-Key", api_key);
    }

    match req.send().await {
        Ok(res) if res.status().is_success() => match res.json::<Value>().await {
            Ok(data) => Some(json!({
                "events": data.get("events").cloned().unwrap_or_else(|| json!([])),
                "source": "mac-bridge"
            })),
            Err(e) => {
                tracing::warn!("[calendar] failed to decode Mac Bridge calendar response: {e}");
                None
            }
        },
        Ok(res) => {
            tracing::warn!("[calendar] Mac Bridge calendar returned {}", res.status());
            None
        }
        Err(e) => {
            tracing::warn!("[calendar] Mac Bridge calendar request failed: {e}");
            None
        }
    }
}

async fn post_bridge_calendar_event(state: &AppState, payload: Value) -> Result<Value, AppError> {
    let (host, api_key) = bridge_config(state)
        .ok_or_else(|| AppError::BadRequest("Mac Bridge is not configured".into()))?;
    let mut req = state
        .http
        .post(format!("{host}/calendar"))
        .timeout(std::time::Duration::from_secs(15))
        .header("Content-Type", "application/json")
        .json(&payload);
    if !api_key.is_empty() {
        req = req.header("X-API-Key", api_key);
    }
    let res = req.send().await.map_err(|e| {
        AppError::Internal(anyhow::anyhow!("Mac Bridge calendar create failed: {e}"))
    })?;
    if res.status().is_success() {
        return res
            .json::<Value>()
            .await
            .map_err(|e| AppError::Internal(e.into()));
    }
    let status = res.status();
    let text = res.text().await.unwrap_or_default();
    Err(AppError::BadRequest(format!(
        "Mac Bridge calendar create {status}: {text}"
    )))
}

async fn patch_bridge_calendar_event(
    state: &AppState,
    id: &str,
    payload: Value,
) -> Result<Value, AppError> {
    let (host, api_key) = bridge_config(state)
        .ok_or_else(|| AppError::BadRequest("Mac Bridge is not configured".into()))?;
    let encoded_id = urlencoding::encode(id);
    let mut req = state
        .http
        .patch(format!("{host}/calendar/{encoded_id}"))
        .timeout(std::time::Duration::from_secs(15))
        .header("Content-Type", "application/json")
        .json(&payload);
    if !api_key.is_empty() {
        req = req.header("X-API-Key", api_key);
    }
    let res = req.send().await.map_err(|e| {
        AppError::Internal(anyhow::anyhow!("Mac Bridge calendar update failed: {e}"))
    })?;
    if res.status().is_success() {
        return res
            .json::<Value>()
            .await
            .map_err(|e| AppError::Internal(e.into()));
    }
    let status = res.status();
    let text = res.text().await.unwrap_or_default();
    Err(AppError::BadRequest(format!(
        "Mac Bridge calendar update {status}: {text}"
    )))
}

async fn delete_bridge_calendar_event(
    state: &AppState,
    id: &str,
    payload: Value,
) -> Option<Result<(), AppError>> {
    let (host, api_key) = bridge_config(state)?;
    let encoded_id = urlencoding::encode(id);
    let candidates = [
        (
            reqwest::Method::POST,
            format!("{host}/calendar/delete"),
            Some(payload.clone()),
        ),
        (
            reqwest::Method::DELETE,
            format!("{host}/calendar/{encoded_id}"),
            None,
        ),
        (
            reqwest::Method::DELETE,
            format!("{host}/calendar?id={encoded_id}"),
            None,
        ),
    ];

    let mut last_error: Option<AppError> = None;
    for (method, url, body) in candidates {
        let mut req = state
            .http
            .request(method, &url)
            .timeout(std::time::Duration::from_secs(8))
            .header("Content-Type", "application/json");
        if !api_key.is_empty() {
            req = req.header("X-API-Key", &api_key);
        }
        if let Some(body) = body {
            req = req.json(&body);
        }

        match req.send().await {
            Ok(res) if res.status().is_success() => return Some(Ok(())),
            Ok(res) => {
                let status = res.status();
                let text = res.text().await.unwrap_or_default();
                last_error = Some(AppError::BadRequest(format!(
                    "Mac Bridge calendar delete {status}: {text}"
                )));
            }
            Err(e) => {
                last_error = Some(AppError::Internal(anyhow::anyhow!(
                    "Mac Bridge calendar delete failed: {e}"
                )));
            }
        }
    }

    Some(Err(last_error.unwrap_or_else(|| {
        AppError::Internal(anyhow::anyhow!("Mac Bridge calendar delete failed"))
    })))
}

#[cfg(target_os = "macos")]
async fn fetch_local_macos_calendar() -> Option<Value> {
    let home = std::env::var("HOME").ok()?;
    let db = std::path::Path::new(&home)
        .join("Library/Group Containers/group.com.apple.calendar/Calendar.sqlitedb");
    if !db.exists() {
        return None;
    }

    let query = r#"
      SELECT
        ci.ROWID AS id,
        ci.ROWID AS localId,
        ci.UUID AS appleEventId,
        COALESCE(ci.external_id, '') AS objectUrl,
        COALESCE(ci.summary, '') AS title,
        strftime('%Y-%m-%dT%H:%M:%SZ', ci.start_date + 978307200, 'unixepoch') AS start,
        strftime('%Y-%m-%dT%H:%M:%SZ', ci.end_date + 978307200, 'unixepoch') AS end,
        CASE WHEN COALESCE(ci.all_day, 0) = 0 THEN 0 ELSE 1 END AS allDay,
        COALESCE(c.title, '') AS calendar
      FROM CalendarItem ci
      LEFT JOIN Calendar c ON c.ROWID = ci.calendar_id
      WHERE ci.start_date BETWEEN (strftime('%s','now','-30 days') - 978307200)
        AND (strftime('%s','now','+30 days') - 978307200)
        AND COALESCE(ci.hidden, 0) = 0
      ORDER BY ci.start_date ASC
      LIMIT 500
    "#;

    let output = tokio::process::Command::new("sqlite3")
        .arg("-json")
        .arg(db)
        .arg(query)
        .output()
        .await
        .ok()?;

    if !output.status.success() {
        tracing::warn!(
            "[calendar] local macOS Calendar sqlite query failed: {}",
            String::from_utf8_lossy(&output.stderr)
        );
        return None;
    }

    let mut events: Value = serde_json::from_slice(&output.stdout).ok()?;
    if let Some(items) = events.as_array_mut() {
        for item in items {
            if let Some(map) = item.as_object_mut() {
                let all_day = map
                    .get("allDay")
                    .and_then(|v| v.as_i64())
                    .map(|value| value != 0)
                    .unwrap_or(false);
                map.insert("allDay".to_string(), json!(all_day));
            }
        }
    }
    Some(json!({ "events": events, "source": "local-macos-calendar" }))
}

#[cfg(not(target_os = "macos"))]
async fn fetch_local_macos_calendar() -> Option<Value> {
    None
}

/// Discover calendar collection URLs via PROPFIND on the CalDAV principal.
async fn discover_calendars(
    client: &reqwest::Client,
    base_url: &str,
    username: &str,
    password: &str,
) -> anyhow::Result<Vec<(String, String)>> {
    // Step 1: Find the current-user-principal.
    let principal_body = r#"<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:">
  <d:prop>
    <d:current-user-principal/>
  </d:prop>
</d:propfind>"#;

    let resp = client
        .request(reqwest::Method::from_bytes(b"PROPFIND").unwrap(), base_url)
        .basic_auth(username, Some(password))
        .header(CONTENT_TYPE, "application/xml; charset=utf-8")
        .header("Depth", "0")
        .body(principal_body)
        .send()
        .await?;

    let principal_xml = resp.text().await?;
    let principal_href = extract_href_from_tag(&principal_xml, "current-user-principal")
        .unwrap_or_else(|| format!("/principals/users/{username}/"));

    let principal_url = resolve_url(base_url, &principal_href);

    // Step 2: Find the calendar-home-set.
    let home_body = r#"<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <c:calendar-home-set/>
  </d:prop>
</d:propfind>"#;

    let resp = client
        .request(
            reqwest::Method::from_bytes(b"PROPFIND").unwrap(),
            &principal_url,
        )
        .basic_auth(username, Some(password))
        .header(CONTENT_TYPE, "application/xml; charset=utf-8")
        .header("Depth", "0")
        .body(home_body)
        .send()
        .await?;

    let home_xml = resp.text().await?;
    let home_href = extract_href_from_tag(&home_xml, "calendar-home-set")
        .unwrap_or_else(|| principal_href.clone());

    let home_url = resolve_url(base_url, &home_href);

    // Step 3: List calendars in the home set.
    let list_body = r#"<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:cs="http://calendarserver.org/ns/">
  <d:prop>
    <d:resourcetype/>
    <d:displayname/>
    <cs:getctag/>
  </d:prop>
</d:propfind>"#;

    let resp = client
        .request(reqwest::Method::from_bytes(b"PROPFIND").unwrap(), &home_url)
        .basic_auth(username, Some(password))
        .header(CONTENT_TYPE, "application/xml; charset=utf-8")
        .header("Depth", "1")
        .body(list_body)
        .send()
        .await?;

    let list_xml = resp.text().await?;

    // Parse out individual <d:response> blocks that contain a <d:calendar/> resourcetype.
    let calendars = parse_calendar_list(&list_xml, base_url);

    Ok(calendars)
}

/// Fetch calendar objects for a single calendar via a REPORT request.
async fn fetch_calendar_objects(
    client: &reqwest::Client,
    calendar_url: &str,
    calendar_name: &str,
    username: &str,
    password: &str,
    start: &str,
    end: &str,
) -> anyhow::Result<Vec<CalendarEvent>> {
    let objects =
        fetch_calendar_ical_objects(client, calendar_url, username, password, start, end).await?;
    let mut events = Vec::new();
    for object in objects {
        let object_url = resolve_url(calendar_url, &object.href);
        events.extend(parse_vcalendar(
            &object.data,
            calendar_name,
            Some(object_url),
        ));
    }

    Ok(events)
}

async fn fetch_calendar_ical_objects(
    client: &reqwest::Client,
    calendar_url: &str,
    username: &str,
    password: &str,
    start: &str,
    end: &str,
) -> anyhow::Result<Vec<CalendarObject>> {
    let report_body = format!(
        r#"<?xml version="1.0" encoding="utf-8"?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <d:getetag/>
    <c:calendar-data/>
  </d:prop>
  <c:filter>
    <c:comp-filter name="VCALENDAR">
      <c:comp-filter name="VEVENT">
        <c:time-range start="{start}" end="{end}"/>
      </c:comp-filter>
    </c:comp-filter>
  </c:filter>
</c:calendar-query>"#
    );

    let resp = client
        .request(
            reqwest::Method::from_bytes(b"REPORT").unwrap(),
            calendar_url,
        )
        .basic_auth(username, Some(password))
        .header(CONTENT_TYPE, "application/xml; charset=utf-8")
        .header("Depth", "1")
        .body(report_body)
        .send()
        .await?;

    let xml = resp.text().await?;

    let mut objects = extract_calendar_objects(&xml);
    if objects.is_empty() {
        objects = extract_calendar_data(&xml)
            .into_iter()
            .map(|data| CalendarObject {
                href: calendar_url.to_string(),
                data,
            })
            .collect();
    }

    Ok(objects)
}

/// Top-level fetch: discover calendars, then fetch events from each.
async fn fetch_caldav_events(
    client: &reqwest::Client,
    base_url: &str,
    username: &str,
    password: &str,
) -> anyhow::Result<Vec<CalendarEvent>> {
    let calendars = discover_calendars(client, base_url, username, password).await?;

    if calendars.is_empty() {
        tracing::warn!("[calendar] no calendars discovered from {base_url}");
        return Ok(Vec::new());
    }

    // Time range: 30 days ago to 30 days from now (matching TS).
    let now = chrono::Utc::now();
    let ago30 = now - chrono::Duration::days(30);
    let in30 = now + chrono::Duration::days(30);
    // CalDAV time-range uses UTC format: YYYYMMDDTHHmmssZ
    let start = ago30.format("%Y%m%dT%H%M%SZ").to_string();
    let end = in30.format("%Y%m%dT%H%M%SZ").to_string();

    // Fetch all calendars concurrently.
    let handles: Vec<_> = calendars
        .into_iter()
        .map(|(cal_url, cal_name)| {
            let client = client.clone();
            let start = start.clone();
            let end = end.clone();
            let username = username.to_string();
            let password = password.to_string();
            tokio::spawn(async move {
                match fetch_calendar_objects(
                    &client, &cal_url, &cal_name, &username, &password, &start, &end,
                )
                .await
                {
                    Ok(events) => events,
                    Err(e) => {
                        tracing::warn!("[calendar] failed to fetch {cal_name} ({cal_url}): {e:#}");
                        Vec::new()
                    }
                }
            })
        })
        .collect();

    let mut all_events = Vec::new();
    for handle in handles {
        if let Ok(events) = handle.await {
            all_events.extend(events);
        }
    }

    Ok(all_events)
}

// ── iCalendar parsing ───────────────────────────────────────────────────────

/// Parse a VCALENDAR iCal blob into CalendarEvents using the `ical` crate.
/// Falls back to manual regex-style parsing if the crate parser fails.
fn parse_vcalendar(
    ics_text: &str,
    calendar_name: &str,
    object_url: Option<String>,
) -> Vec<CalendarEvent> {
    // Try the ical crate parser first.
    let reader = BufReader::new(ics_text.as_bytes());
    let parser = IcalParser::new(reader);

    let mut events = Vec::new();
    let mut parsed_any = false;

    for cal_result in parser {
        match cal_result {
            Ok(cal) => {
                parsed_any = true;
                events.extend(extract_events_from_ical(
                    &cal,
                    calendar_name,
                    object_url.clone(),
                ));
            }
            Err(_) => continue,
        }
    }

    // If the crate parser produced nothing, fall back to manual parsing
    // (mirrors the TypeScript regex approach).
    if !parsed_any || events.is_empty() {
        events = parse_vcalendar_manual(ics_text, calendar_name, object_url);
    }

    events
}

/// Extract CalendarEvents from a parsed IcalCalendar.
fn extract_events_from_ical(
    cal: &IcalCalendar,
    calendar_name: &str,
    object_url: Option<String>,
) -> Vec<CalendarEvent> {
    let mut events = Vec::new();

    for event in &cal.events {
        let get_prop = |name: &str| -> Option<String> {
            event
                .properties
                .iter()
                .find(|p| p.name == name)
                .and_then(|p| p.value.clone())
        };

        let has_date_param = |name: &str| -> bool {
            event.properties.iter().any(|p| {
                p.name == name
                    && p.params.as_ref().is_some_and(|params| {
                        params
                            .iter()
                            .any(|(k, vals)| k == "VALUE" && vals.iter().any(|v| v == "DATE"))
                    })
            })
        };

        let dtstart = match get_prop("DTSTART") {
            Some(s) => s,
            None => continue,
        };

        let uid = get_prop("UID").unwrap_or_default();
        let summary = get_prop("SUMMARY").unwrap_or_else(|| "(No title)".to_string());
        let dtend = get_prop("DTEND").or_else(|| get_prop("DUE"));

        // Determine if all-day: either the raw value is 8 chars (YYYYMMDD)
        // or the property has a VALUE=DATE parameter.
        let all_day = dtstart.len() == 8 || has_date_param("DTSTART");

        let start = format_ical_date(&dtstart);
        let end = dtend
            .as_deref()
            .map(format_ical_date)
            .unwrap_or_else(|| start.clone());

        let id = if uid.is_empty() { generate_id() } else { uid };

        events.push(CalendarEvent {
            id,
            title: summary,
            start,
            end,
            all_day,
            calendar: calendar_name.to_string(),
            object_url: object_url.clone(),
        });
    }

    events
}

/// Manual VEVENT parser matching the TypeScript implementation.
fn parse_vcalendar_manual(
    ics_text: &str,
    calendar_name: &str,
    object_url: Option<String>,
) -> Vec<CalendarEvent> {
    let mut events = Vec::new();
    let vevents: Vec<&str> = ics_text.split("BEGIN:VEVENT").skip(1).collect();

    for vevent in vevents {
        let get = |key: &str| -> String {
            // Match: ^KEY[^:]*:(.*)$  (multiline)
            for line in vevent.lines() {
                let trimmed = line.trim();
                if let Some(rest) = trimmed.strip_prefix(key) {
                    // Check that the character after the key is either ':' or ';'
                    if rest.starts_with(':') || rest.starts_with(';') {
                        // Extract value after the first ':'
                        if let Some(colon_pos) = rest.find(':') {
                            return rest[colon_pos + 1..].trim().to_string();
                        }
                    }
                }
            }
            String::new()
        };

        let uid = get("UID");
        let summary = {
            let s = get("SUMMARY");
            if s.is_empty() {
                "(No title)".to_string()
            } else {
                s
            }
        };
        let dtstart_raw = get("DTSTART");
        let dtend_raw = {
            let end = get("DTEND");
            if end.is_empty() {
                get("DUE")
            } else {
                end
            }
        };

        if dtstart_raw.is_empty() {
            continue;
        }

        // Check for VALUE=DATE in the DTSTART line (all-day indicator).
        let dtstart_line_has_value_date = vevent.lines().any(|l| {
            let t = l.trim();
            t.starts_with("DTSTART") && t.contains("VALUE=DATE")
        });
        let all_day = dtstart_raw.len() == 8 || dtstart_line_has_value_date;

        let start = format_ical_date(&dtstart_raw);
        let end = if dtend_raw.is_empty() {
            start.clone()
        } else {
            format_ical_date(&dtend_raw)
        };

        let id = if uid.is_empty() { generate_id() } else { uid };

        events.push(CalendarEvent {
            id,
            title: summary,
            start,
            end,
            all_day,
            calendar: calendar_name.to_string(),
            object_url: object_url.clone(),
        });
    }

    events
}

// ── POST /api/calendar ──────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct CreateCalendarBody {
    title: String,
    start: String,
    end: Option<String>,
    calendar: Option<String>,
    #[serde(rename = "allDay")]
    all_day: Option<bool>,
}

async fn post_event(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Json(body): Json<CreateCalendarBody>,
) -> Result<Json<Value>, AppError> {
    let title = body.title.trim();
    if title.is_empty() {
        return Err(AppError::BadRequest("title required".into()));
    }
    let start = body.start.trim();
    if start.is_empty() {
        return Err(AppError::BadRequest("start required".into()));
    }
    let payload = json!({
        "title": title,
        "start": start,
        "end": body.end.as_deref().map(str::trim).filter(|value| !value.is_empty()),
        "calendar": body.calendar.as_deref().map(str::trim).filter(|value| !value.is_empty()),
        "allDay": body.all_day.unwrap_or(false),
    });
    let created = post_bridge_calendar_event(&state, payload).await?;
    Ok(Json(created))
}

// ── PATCH /api/calendar ─────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct UpdateCalendarBody {
    id: Option<Value>,
    #[serde(rename = "appleEventId")]
    apple_event_id: Option<String>,
    title: String,
    start: String,
    end: Option<String>,
    calendar: Option<String>,
    #[serde(rename = "allDay")]
    all_day: Option<bool>,
}

async fn patch_event(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Query(query): Query<DeleteCalendarQuery>,
    Json(body): Json<UpdateCalendarBody>,
) -> Result<Json<Value>, AppError> {
    let id = body
        .id
        .clone()
        .and_then(calendar_id_value_to_string)
        .or(query.id)
        .or(body.apple_event_id.clone())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| AppError::BadRequest("id required".into()))?;
    let title = body.title.trim();
    if title.is_empty() {
        return Err(AppError::BadRequest("title required".into()));
    }
    let start = body.start.trim();
    if start.is_empty() {
        return Err(AppError::BadRequest("start required".into()));
    }
    let payload = json!({
        "id": id,
        "appleEventId": body.apple_event_id,
        "title": title,
        "start": start,
        "end": body.end.as_deref().map(str::trim).filter(|value| !value.is_empty()),
        "calendar": body.calendar.as_deref().map(str::trim).filter(|value| !value.is_empty()),
        "allDay": body.all_day.unwrap_or(false),
    });
    let updated = patch_bridge_calendar_event(&state, &id, payload).await?;
    Ok(Json(updated))
}

// ── DELETE /api/calendar ────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct DeleteCalendarBody {
    id: Option<Value>,
    #[serde(rename = "objectUrl")]
    object_url: Option<String>,
    #[serde(rename = "localId")]
    local_id: Option<Value>,
    #[serde(rename = "appleEventId")]
    apple_event_id: Option<String>,
    calendar: Option<String>,
    title: Option<String>,
    start: Option<String>,
    end: Option<String>,
}

#[derive(Debug, Deserialize, Default)]
struct DeleteCalendarQuery {
    id: Option<String>,
    #[serde(rename = "objectUrl")]
    object_url: Option<String>,
    #[serde(rename = "localId")]
    local_id: Option<String>,
    #[serde(rename = "appleEventId")]
    apple_event_id: Option<String>,
    calendar: Option<String>,
    title: Option<String>,
    start: Option<String>,
    end: Option<String>,
}

async fn delete_event(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Query(query): Query<DeleteCalendarQuery>,
    body: Result<Json<DeleteCalendarBody>, JsonRejection>,
) -> Result<Json<Value>, AppError> {
    let body = match body {
        Ok(Json(body)) => Some(body),
        Err(_) => None,
    };
    let body_id = body.as_ref().and_then(|body| body.id.clone());
    let body_object_url = body.as_ref().and_then(|body| body.object_url.clone());
    let id = body_id
        .and_then(calendar_id_value_to_string)
        .or(query.id)
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_default();
    let object_url = body_object_url
        .or(query.object_url)
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let local_id = body
        .as_ref()
        .and_then(|body| body.local_id.clone())
        .and_then(calendar_id_value_to_string)
        .or(query.local_id)
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let apple_event_id = body
        .as_ref()
        .and_then(|body| body.apple_event_id.clone())
        .or(query.apple_event_id)
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let calendar_name = body
        .as_ref()
        .and_then(|body| body.calendar.clone())
        .or(query.calendar)
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let title = body
        .as_ref()
        .and_then(|body| body.title.clone())
        .or(query.title)
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let start = body
        .as_ref()
        .and_then(|body| body.start.clone())
        .or(query.start)
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let end = body
        .as_ref()
        .and_then(|body| body.end.clone())
        .or(query.end)
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let bridge_payload = json!({
        "id": if id.is_empty() { Value::Null } else { json!(id) },
        "objectUrl": object_url.clone(),
        "localId": local_id.clone(),
        "appleEventId": apple_event_id.clone(),
        "calendar": calendar_name.clone(),
        "title": title.clone(),
        "start": start.clone(),
        "end": end.clone(),
    });

    let bridge_id = apple_event_id
        .as_deref()
        .or(object_url.as_deref())
        .or(local_id.as_deref())
        .or(if id.is_empty() {
            None
        } else {
            Some(id.as_str())
        });

    let mut bridge_error: Option<AppError> = None;
    if let Some(bridge_id) = bridge_id {
        if let Some(result) =
            delete_bridge_calendar_event(&state, bridge_id, bridge_payload.clone()).await
        {
            match result {
                Ok(()) => return Ok(Json(json!({ "ok": true, "source": "mac-bridge" }))),
                Err(err) => {
                    tracing::warn!("[calendar] Mac Bridge delete did not complete: {err:?}");
                    bridge_error = Some(err);
                }
            }
        }
    }

    let username = state.secret_or_default("CALDAV_USERNAME");
    let password = state.secret_or_default("CALDAV_PASSWORD");
    if !username.is_empty() && !password.is_empty() {
        let base_url = state
            .secret("CALDAV_URL")
            .unwrap_or_else(|| "https://caldav.icloud.com".to_string());
        let caldav_client = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .unwrap_or_else(|_| state.http.clone());

        let delete_url = match object_url {
            Some(url) => validate_caldav_object_url(&base_url, &url)?,
            None if !id.is_empty() => {
                find_caldav_event_object_url(&caldav_client, &base_url, &username, &password, &id)
                    .await?
                    .ok_or_else(|| AppError::BadRequest("calendar event not found".into()))?
            }
            None => return Err(AppError::BadRequest("id or objectUrl required".into())),
        };

        delete_caldav_object(&caldav_client, &delete_url, &username, &password).await?;
        return Ok(Json(json!({ "ok": true, "source": "caldav" })));
    }

    if let Some(result) = delete_local_macos_calendar_event(
        local_id.as_deref().or(if id.is_empty() {
            None
        } else {
            Some(id.as_str())
        }),
        apple_event_id.as_deref(),
        calendar_name.as_deref(),
        title.as_deref(),
        start.as_deref(),
        end.as_deref(),
    )
    .await
    {
        result?;
        return Ok(Json(json!({ "ok": true, "source": "calendar-app" })));
    }

    if id.is_empty() {
        return Err(AppError::BadRequest("id or objectUrl required".into()));
    }

    if let Some(err) = bridge_error {
        return Err(err);
    }

    Err(AppError::BadRequest(
        "Calendar delete needs CalDAV credentials or Mac Bridge".into(),
    ))
}

fn calendar_id_value_to_string(value: Value) -> Option<String> {
    match value {
        Value::String(s) => Some(s),
        Value::Number(n) => Some(n.to_string()),
        Value::Null => None,
        other => Some(other.to_string()),
    }
}

#[cfg(target_os = "macos")]
async fn delete_local_macos_calendar_event(
    local_id: Option<&str>,
    apple_event_id: Option<&str>,
    calendar_name: Option<&str>,
    _title: Option<&str>,
    _start: Option<&str>,
    _end: Option<&str>,
) -> Option<Result<(), AppError>> {
    let home = std::env::var("HOME").ok()?;
    let db = std::path::Path::new(&home)
        .join("Library/Group Containers/group.com.apple.calendar/Calendar.sqlitedb");
    if !db.exists() {
        return None;
    }

    let local_id = local_id
        .map(str::trim)
        .filter(|value| !value.is_empty() && value.bytes().all(|byte| byte.is_ascii_digit()));
    let mut resolved_event_id = apple_event_id.map(str::to_string);
    let mut resolved_calendar_name = calendar_name.map(str::to_string);

    if let Some(row_id) = local_id {
        let query = format!(
            "SELECT COALESCE(ci.UUID, '') AS uuid, COALESCE(c.title, '') AS calendar \
             FROM CalendarItem ci LEFT JOIN Calendar c ON c.ROWID = ci.calendar_id \
             WHERE ci.ROWID = {row_id} LIMIT 1"
        );
        let output = match tokio::process::Command::new("sqlite3")
            .arg("-json")
            .arg(&db)
            .arg(query)
            .output()
            .await
        {
            Ok(output) => output,
            Err(e) => return Some(Err(AppError::Internal(e.into()))),
        };
        if output.status.success() {
            if let Ok(rows) = serde_json::from_slice::<Vec<Value>>(&output.stdout) {
                if let Some(row) = rows.first() {
                    if resolved_event_id.is_none() {
                        resolved_event_id = row
                            .get("uuid")
                            .and_then(|value| value.as_str())
                            .filter(|value| !value.is_empty())
                            .map(str::to_string);
                    }
                    if resolved_calendar_name.is_none() {
                        resolved_calendar_name = row
                            .get("calendar")
                            .and_then(|value| value.as_str())
                            .filter(|value| !value.is_empty())
                            .map(str::to_string);
                    }
                }
            }
        }
    }

    if let Some(event_id) = resolved_event_id.as_deref() {
        let script = r#"
on deleteEvent(eventId, calendarName)
  launch application "Calendar"
  tell application "Calendar"
    if calendarName is not "" then
      repeat with cal in calendars
        if name of cal is calendarName then
          tell cal
            delete (first event whose id is eventId)
          end tell
          return "deleted"
        end if
      end repeat
    end if

    repeat with cal in calendars
      try
        tell cal
          delete (first event whose id is eventId)
        end tell
        return "deleted"
      end try
    end repeat
  end tell
  error "event not found in Calendar.app"
end deleteEvent

on run argv
  set eventId to item 1 of argv
  set calendarName to ""
  if (count of argv) > 1 then set calendarName to item 2 of argv
  return deleteEvent(eventId, calendarName)
end run
"#;
        let calendar_arg = resolved_calendar_name.as_deref().unwrap_or("");
        if let Ok(output) = tokio::process::Command::new("osascript")
            .arg("-e")
            .arg(script)
            .arg(event_id)
            .arg(calendar_arg)
            .output()
            .await
        {
            if output.status.success() {
                return Some(Ok(()));
            }
            tracing::warn!(
                "[calendar] Calendar.app delete failed: {}",
                String::from_utf8_lossy(&output.stderr)
            );
        }
    }

    if local_id.is_some() {
        return Some(Err(AppError::BadRequest(
            "Calendar.app could not delete that event; refusing local-only hide because it would not sync to iCloud."
                .into(),
        )));
    }

    None
}

#[cfg(not(target_os = "macos"))]
async fn delete_local_macos_calendar_event(
    _local_id: Option<&str>,
    _apple_event_id: Option<&str>,
    _calendar_name: Option<&str>,
    _title: Option<&str>,
    _start: Option<&str>,
    _end: Option<&str>,
) -> Option<Result<(), AppError>> {
    None
}

fn validate_caldav_object_url(base_url: &str, object_url: &str) -> Result<String, AppError> {
    let base = reqwest::Url::parse(base_url)
        .map_err(|_| AppError::BadRequest("invalid CalDAV base URL".into()))?;
    let object = match reqwest::Url::parse(object_url) {
        Ok(url) => url,
        Err(_) if object_url.starts_with('/') => base
            .join(object_url)
            .map_err(|_| AppError::BadRequest("invalid calendar object URL".into()))?,
        Err(_) => return Err(AppError::BadRequest("invalid calendar object URL".into())),
    };

    if base.scheme() != object.scheme() || base.host_str() != object.host_str() {
        return Err(AppError::BadRequest(
            "calendar object URL does not match CalDAV host".into(),
        ));
    }

    Ok(object.to_string())
}

async fn delete_caldav_object(
    client: &reqwest::Client,
    object_url: &str,
    username: &str,
    password: &str,
) -> Result<(), AppError> {
    let res = client
        .delete(object_url)
        .basic_auth(username, Some(password))
        .send()
        .await
        .map_err(|e| AppError::Internal(e.into()))?;

    if res.status().is_success() || res.status() == StatusCode::NOT_FOUND {
        return Ok(());
    }

    let status = res.status();
    let text = res.text().await.unwrap_or_default();
    Err(AppError::Internal(anyhow::anyhow!(
        "CalDAV delete {status}: {text}"
    )))
}

async fn find_caldav_event_object_url(
    client: &reqwest::Client,
    base_url: &str,
    username: &str,
    password: &str,
    event_id: &str,
) -> Result<Option<String>, AppError> {
    let calendars = discover_calendars(client, base_url, username, password)
        .await
        .map_err(|e| AppError::Internal(e.into()))?;
    let now = chrono::Utc::now();
    let start = (now - chrono::Duration::days(365))
        .format("%Y%m%dT%H%M%SZ")
        .to_string();
    let end = (now + chrono::Duration::days(365))
        .format("%Y%m%dT%H%M%SZ")
        .to_string();

    for (calendar_url, _) in calendars {
        let objects =
            fetch_calendar_ical_objects(client, &calendar_url, username, password, &start, &end)
                .await
                .map_err(|e| AppError::Internal(e.into()))?;
        for object in objects {
            let object_url = resolve_url(&calendar_url, &object.href);
            let events = parse_vcalendar(&object.data, "", Some(object_url.clone()));
            if events.iter().any(|event| event.id == event_id) {
                return Ok(Some(object_url));
            }
        }
    }

    Ok(None)
}

/// Format an iCalendar date/datetime string into the same format
/// as the TypeScript handler produces.
///
/// Input examples:
///   - `20250315`           → `2025-03-15`           (all-day)
///   - `20250315T140000Z`   → `2025-03-15T14:00:00Z` (UTC)
///   - `20250315T140000`    → `2025-03-15T14:00:00`   (floating)
fn format_ical_date(raw: &str) -> String {
    // Strip any leading value-type prefix (e.g. from manual parsing
    // where the value might still carry "VALUE=DATE:" etc.).
    let d = if let Some(pos) = raw.rfind(':') {
        &raw[pos + 1..]
    } else {
        raw
    };
    let d = d.trim();

    if d.len() == 8 {
        // YYYYMMDD — all-day
        return format!("{}-{}-{}", &d[0..4], &d[4..6], &d[6..8]);
    }

    if d.len() >= 15 {
        // YYYYMMDDTHHmmss[Z]
        let year = &d[0..4];
        let month = &d[4..6];
        let day = &d[6..8];
        let hour = &d[9..11];
        let min = &d[11..13];
        let sec = &d[13..15];
        let utc = if d.ends_with('Z') { "Z" } else { "" };
        return format!("{year}-{month}-{day}T{hour}:{min}:{sec}{utc}");
    }

    // Fallback: return as-is.
    d.to_string()
}

/// Generate a random ID (matches TS: `Math.random().toString(36).slice(2)`).
fn generate_id() -> String {
    use rand::Rng;
    let mut rng = rand::thread_rng();
    let n: u64 = rng.gen();
    format!("{:x}", n)
}

// ── XML helpers ─────────────────────────────────────────────────────────────
//
// We use simple string-based extraction rather than pulling in a full XML
// parser. CalDAV responses are well-structured enough for this approach.

/// Extract the first `<d:href>` value inside a tag like `<d:current-user-principal>`.
fn extract_href_from_tag(xml: &str, tag_local_name: &str) -> Option<String> {
    // Look for the tag with any namespace prefix (or none).
    // e.g. <d:current-user-principal>, <D:current-user-principal>, <current-user-principal>
    let open_patterns = vec![
        format!("<d:{tag_local_name}"),
        format!("<D:{tag_local_name}"),
        format!("<{tag_local_name}"),
        format!("<ns0:{tag_local_name}"),
        format!("<ns1:{tag_local_name}"),
    ];

    for pattern in &open_patterns {
        if let Some(start_idx) = xml.find(pattern.as_str()) {
            // Find the closing tag.
            let close_patterns = [
                format!("</d:{tag_local_name}>"),
                format!("</D:{tag_local_name}>"),
                format!("</{tag_local_name}>"),
                format!("</ns0:{tag_local_name}>"),
                format!("</ns1:{tag_local_name}>"),
            ];

            let section_end = close_patterns
                .iter()
                .filter_map(|p| xml[start_idx..].find(p.as_str()))
                .min()
                .map(|offset| start_idx + offset)
                .unwrap_or(xml.len());

            let section = &xml[start_idx..section_end];

            // Extract <d:href>...</d:href> or <D:href>...</D:href> or <href>...</href>.
            if let Some(href) = extract_href(section) {
                return Some(href);
            }
        }
    }

    None
}

/// Extract content from any `<X:href>...</X:href>` tag.
fn extract_href(xml: &str) -> Option<String> {
    extract_tag_content(xml, &["d:href", "D:href", "href", "ns0:href", "ns1:href"])
}

/// Parse the calendar listing PROPFIND response.
/// Returns `(url, display_name)` pairs for each calendar resource.
fn parse_calendar_list(xml: &str, base_url: &str) -> Vec<(String, String)> {
    let mut calendars = Vec::new();

    // Split on <d:response>, <D:response>, or <response> boundaries.
    let response_splits: Vec<&str> = split_xml_responses(xml);

    for response in response_splits {
        // Must contain a <calendar/> (or similar) resourcetype.
        let is_calendar = response.contains("<d:calendar")
            || response.contains("<D:calendar")
            || response.contains("<cal:calendar")
            || response.contains("<C:calendar")
            || response.contains(":calendar/>")
            || response.contains("<calendar/")
            || response.contains("<calendar ");

        if !is_calendar {
            continue;
        }

        // Extract href.
        let href = match extract_href(response) {
            Some(h) => h,
            None => continue,
        };

        // Extract displayname.
        let name = extract_displayname(response).unwrap_or_else(|| "Calendar".to_string());

        let url = resolve_url(base_url, &href);
        calendars.push((url, name));
    }

    calendars
}

/// Split an XML multistatus response into individual `<d:response>` sections.
fn split_xml_responses(xml: &str) -> Vec<&str> {
    let mut results = Vec::new();

    // Try various namespace prefixes for <response>.
    let open_tags = [
        "<d:response>",
        "<D:response>",
        "<response>",
        "<d:response ",
        "<D:response ",
        "<response ",
    ];
    let close_tags = ["</d:response>", "</D:response>", "</response>"];

    for open in &open_tags {
        let mut search_from = 0;
        while let Some(start) = xml[search_from..].find(open) {
            let abs_start = search_from + start;
            let after_start = abs_start + open.len();

            // Find the matching close tag.
            let end = close_tags
                .iter()
                .filter_map(|ct| {
                    xml[after_start..]
                        .find(ct)
                        .map(|pos| after_start + pos + ct.len())
                })
                .min();

            if let Some(abs_end) = end {
                results.push(&xml[abs_start..abs_end]);
                search_from = abs_end;
            } else {
                break;
            }
        }

        if !results.is_empty() {
            break; // Found responses with this prefix, don't try others.
        }
    }

    results
}

/// Extract `<d:displayname>` content from an XML fragment.
fn extract_displayname(xml: &str) -> Option<String> {
    extract_tag_content(xml, &["d:displayname", "D:displayname", "displayname"])
        .map(|s| xml_unescape(&s))
}

/// Generic XML tag content extractor that handles tags with attributes
/// (e.g. `<tag xmlns="DAV:">`).
fn extract_tag_content(xml: &str, tag_names: &[&str]) -> Option<String> {
    for tag in tag_names {
        let open_exact = format!("<{}>", tag);
        let open_attr = format!("<{} ", tag);
        let close = format!("</{}>", tag);

        let start_pos = xml
            .find(&open_exact)
            .map(|pos| pos + open_exact.len())
            .or_else(|| {
                xml.find(&open_attr)
                    .and_then(|pos| xml[pos..].find('>').map(|gt| pos + gt + 1))
            });

        if let Some(value_start) = start_pos {
            if let Some(end) = xml[value_start..].find(&close) {
                let content = xml[value_start..value_start + end].trim().to_string();
                if !content.is_empty() {
                    return Some(content);
                }
            }
        }
    }
    None
}

/// Extract `<cal:calendar-data>` (or `<C:calendar-data>`) content from an XML response.
fn extract_calendar_data(xml: &str) -> Vec<String> {
    let mut results = Vec::new();

    let tag_names = [
        "cal:calendar-data",
        "C:calendar-data",
        "c:calendar-data",
        "caldav:calendar-data",
        "ns0:calendar-data",
        "ns1:calendar-data",
        "calendar-data",
    ];

    for tag in &tag_names {
        let open_exact = format!("<{}>", tag);
        let open_attr = format!("<{} ", tag);
        let close = format!("</{}>", tag);

        let mut search_from = 0;
        while search_from < xml.len() {
            // Find opening tag (exact or with attributes)
            let start_pos = xml[search_from..]
                .find(&open_exact)
                .map(|pos| (search_from + pos, search_from + pos + open_exact.len()))
                .or_else(|| {
                    xml[search_from..].find(&open_attr).and_then(|pos| {
                        let abs = search_from + pos;
                        xml[abs..].find('>').map(|gt| (abs, abs + gt + 1))
                    })
                });

            if let Some((_tag_start, value_start)) = start_pos {
                if let Some(end) = xml[value_start..].find(&close) {
                    let data = xml[value_start..value_start + end].trim().to_string();
                    if !data.is_empty() {
                        results.push(xml_unescape(&data));
                    }
                    search_from = value_start + end + close.len();
                } else {
                    break;
                }
            } else {
                break;
            }
        }

        if !results.is_empty() {
            break;
        }
    }

    results
}

fn extract_calendar_objects(xml: &str) -> Vec<CalendarObject> {
    split_xml_responses(xml)
        .into_iter()
        .filter_map(|response| {
            let href = extract_href(response)?;
            let data = extract_calendar_data(response).into_iter().next()?;
            Some(CalendarObject { href, data })
        })
        .collect()
}

/// Resolve a potentially-relative href against the base CalDAV URL.
fn resolve_url(base_url: &str, href: &str) -> String {
    if href.starts_with("http://") || href.starts_with("https://") {
        return href.to_string();
    }

    // Extract scheme + host from base_url.
    if let Some(idx) = base_url.find("://") {
        let after_scheme = &base_url[idx + 3..];
        let host_end = after_scheme.find('/').unwrap_or(after_scheme.len());
        let origin = &base_url[..idx + 3 + host_end];
        format!("{origin}{href}")
    } else {
        format!("{base_url}{href}")
    }
}

/// Minimal XML entity unescaping.
fn xml_unescape(s: &str) -> String {
    s.replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
}

// ── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_format_ical_date_all_day() {
        assert_eq!(format_ical_date("20250315"), "2025-03-15");
    }

    #[test]
    fn test_format_ical_date_utc() {
        assert_eq!(format_ical_date("20250315T140000Z"), "2025-03-15T14:00:00Z");
    }

    #[test]
    fn test_format_ical_date_floating() {
        assert_eq!(format_ical_date("20250315T140000"), "2025-03-15T14:00:00");
    }

    #[test]
    fn test_parse_vcalendar_manual() {
        let ics = r#"BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:abc123
SUMMARY:Team standup
DTSTART:20250315T090000Z
DTEND:20250315T093000Z
END:VEVENT
BEGIN:VEVENT
UID:def456
SUMMARY:Lunch
DTSTART;VALUE=DATE:20250316
END:VEVENT
END:VCALENDAR"#;

        let events = parse_vcalendar_manual(
            ics,
            "Work",
            Some("https://caldav.example.com/cal/event.ics".to_string()),
        );
        assert_eq!(events.len(), 2);

        assert_eq!(events[0].id, "abc123");
        assert_eq!(events[0].title, "Team standup");
        assert_eq!(events[0].start, "2025-03-15T09:00:00Z");
        assert_eq!(events[0].end, "2025-03-15T09:30:00Z");
        assert!(!events[0].all_day);
        assert_eq!(events[0].calendar, "Work");
        assert_eq!(
            events[0].object_url.as_deref(),
            Some("https://caldav.example.com/cal/event.ics")
        );

        assert_eq!(events[1].id, "def456");
        assert_eq!(events[1].title, "Lunch");
        assert_eq!(events[1].start, "2025-03-16");
        assert_eq!(events[1].end, "2025-03-16");
        assert!(events[1].all_day);
    }

    #[test]
    fn test_extract_href_from_tag() {
        let xml = r#"<d:multistatus>
            <d:response>
                <d:propstat>
                    <d:prop>
                        <d:current-user-principal>
                            <d:href>/principals/users/testuser/</d:href>
                        </d:current-user-principal>
                    </d:prop>
                </d:propstat>
            </d:response>
        </d:multistatus>"#;

        let href = extract_href_from_tag(xml, "current-user-principal");
        assert_eq!(href, Some("/principals/users/testuser/".to_string()));
    }

    #[test]
    fn test_resolve_url() {
        assert_eq!(
            resolve_url("https://caldav.example.com", "/cal/home/"),
            "https://caldav.example.com/cal/home/"
        );
        assert_eq!(
            resolve_url(
                "https://caldav.example.com/dav",
                "https://other.example.com/cal/"
            ),
            "https://other.example.com/cal/"
        );
    }

    #[test]
    fn test_extract_calendar_data() {
        let xml = r#"<d:multistatus>
            <d:response>
                <d:propstat>
                    <d:prop>
                        <cal:calendar-data>BEGIN:VCALENDAR
BEGIN:VEVENT
UID:test1
SUMMARY:Test
DTSTART:20250315T090000Z
END:VEVENT
END:VCALENDAR</cal:calendar-data>
                    </d:prop>
                </d:propstat>
            </d:response>
        </d:multistatus>"#;

        let data = extract_calendar_data(xml);
        assert_eq!(data.len(), 1);
        assert!(data[0].contains("BEGIN:VCALENDAR"));
    }

    #[test]
    fn test_extract_calendar_objects_keeps_href() {
        let xml = r#"<d:multistatus>
            <d:response>
                <d:href>/calendars/user/work/event-1.ics</d:href>
                <d:propstat>
                    <d:prop>
                        <cal:calendar-data>BEGIN:VCALENDAR
BEGIN:VEVENT
UID:test1
SUMMARY:Test
DTSTART:20250315T090000Z
END:VEVENT
END:VCALENDAR</cal:calendar-data>
                    </d:prop>
                </d:propstat>
            </d:response>
        </d:multistatus>"#;

        let objects = extract_calendar_objects(xml);
        assert_eq!(objects.len(), 1);
        assert_eq!(objects[0].href, "/calendars/user/work/event-1.ics");
        assert!(objects[0].data.contains("UID:test1"));
    }

    // ---- xml_unescape ----

    #[test]
    fn test_xml_unescape_all_entities() {
        assert_eq!(xml_unescape("&amp; &lt; &gt; &quot; &apos;"), "& < > \" '");
    }

    #[test]
    fn test_xml_unescape_no_entities() {
        assert_eq!(xml_unescape("plain text"), "plain text");
    }

    #[test]
    fn test_xml_unescape_mixed() {
        assert_eq!(xml_unescape("A &amp; B &lt; C"), "A & B < C");
    }

    // ---- resolve_url ----

    #[test]
    fn test_resolve_url_relative_path() {
        assert_eq!(
            resolve_url("https://caldav.example.com/dav", "/calendars/user/"),
            "https://caldav.example.com/calendars/user/"
        );
    }

    #[test]
    fn test_resolve_url_absolute_passthrough() {
        assert_eq!(
            resolve_url("https://a.com", "http://b.com/path"),
            "http://b.com/path"
        );
    }

    // ---- extract_tag_content ----

    #[test]
    fn test_extract_tag_content_basic() {
        let xml = "<d:displayname>My Calendar</d:displayname>";
        let result = extract_tag_content(xml, &["d:displayname"]);
        assert_eq!(result, Some("My Calendar".to_string()));
    }

    #[test]
    fn test_extract_tag_content_with_attributes() {
        let xml = r#"<d:href xmlns:d="DAV:">/path/to/cal/</d:href>"#;
        let result = extract_tag_content(xml, &["d:href"]);
        assert_eq!(result, Some("/path/to/cal/".to_string()));
    }

    #[test]
    fn test_extract_tag_content_missing() {
        let xml = "<d:other>value</d:other>";
        let result = extract_tag_content(xml, &["d:displayname"]);
        assert_eq!(result, None);
    }

    #[test]
    fn test_extract_tag_content_empty() {
        let xml = "<d:displayname></d:displayname>";
        let result = extract_tag_content(xml, &["d:displayname"]);
        assert_eq!(result, None);
    }

    // ---- split_xml_responses ----

    #[test]
    fn test_split_xml_responses() {
        let xml = r#"<d:multistatus>
            <d:response><d:href>/cal1/</d:href></d:response>
            <d:response><d:href>/cal2/</d:href></d:response>
        </d:multistatus>"#;
        let parts = split_xml_responses(xml);
        assert_eq!(parts.len(), 2);
        assert!(parts[0].contains("/cal1/"));
        assert!(parts[1].contains("/cal2/"));
    }

    #[test]
    fn test_split_xml_responses_empty() {
        let xml = "<d:multistatus></d:multistatus>";
        let parts = split_xml_responses(xml);
        assert!(parts.is_empty());
    }

    // ---- format_ical_date edge cases ----

    #[test]
    fn test_format_ical_date_with_value_prefix() {
        // Value may have leftover prefix from manual parsing
        assert_eq!(format_ical_date("VALUE=DATE:20250401"), "2025-04-01");
    }

    #[test]
    fn test_format_ical_date_short_fallback() {
        // Unknown format returns as-is
        assert_eq!(format_ical_date("2025"), "2025");
    }

    // ---- extract_displayname ----

    #[test]
    fn test_extract_displayname_basic() {
        let xml = "<d:displayname>Work Calendar</d:displayname>";
        assert_eq!(extract_displayname(xml), Some("Work Calendar".to_string()));
    }

    #[test]
    fn test_extract_displayname_with_entities() {
        let xml = "<d:displayname>John&apos;s Calendar</d:displayname>";
        assert_eq!(
            extract_displayname(xml),
            Some("John's Calendar".to_string())
        );
    }

    #[test]
    fn test_extract_displayname_missing() {
        let xml = "<d:href>/cal/</d:href>";
        assert_eq!(extract_displayname(xml), None);
    }

    // ---- parse_vcalendar_manual edge cases ----

    #[test]
    fn test_parse_vcalendar_manual_no_title() {
        let ics = r#"BEGIN:VCALENDAR
BEGIN:VEVENT
UID:no-title-event
DTSTART:20250601T100000Z
END:VEVENT
END:VCALENDAR"#;
        let events = parse_vcalendar_manual(ics, "Personal", None);
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].title, "(No title)");
        assert_eq!(events[0].calendar, "Personal");
    }

    #[test]
    fn test_parse_vcalendar_manual_no_dtstart_skipped() {
        let ics = r#"BEGIN:VCALENDAR
BEGIN:VEVENT
UID:bad-event
SUMMARY:Missing date
END:VEVENT
END:VCALENDAR"#;
        let events = parse_vcalendar_manual(ics, "Cal", None);
        assert!(events.is_empty());
    }

    #[test]
    fn test_validate_caldav_object_url_same_host() {
        let url = validate_caldav_object_url(
            "https://caldav.example.com/base",
            "https://caldav.example.com/cal/event.ics",
        )
        .unwrap();
        assert_eq!(url, "https://caldav.example.com/cal/event.ics");
    }

    #[test]
    fn test_validate_caldav_object_url_allows_absolute_path() {
        let url = validate_caldav_object_url(
            "https://caldav.example.com/base",
            "/calendars/user/work/event.ics",
        )
        .unwrap();
        assert_eq!(
            url,
            "https://caldav.example.com/calendars/user/work/event.ics"
        );
    }

    #[test]
    fn test_validate_caldav_object_url_rejects_other_host() {
        let result = validate_caldav_object_url(
            "https://caldav.example.com/base",
            "https://evil.example.com/cal/event.ics",
        );
        assert!(result.is_err());
    }
}
