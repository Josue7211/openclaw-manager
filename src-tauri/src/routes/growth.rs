use axum::{
    extract::{Path, State},
    routing::{get, post},
    Json, Router,
};
use serde::Deserialize;
use serde_json::{json, Map, Value};
use sqlx::SqlitePool;
use std::collections::{HashMap, HashSet};

use super::util::random_uuid;
use crate::error::{success_json, AppError};
use crate::server::{AppState, RequireAuth, UserSession};
use crate::supabase::SupabaseClient;

const PLATFORMS: &[&str] = &["tiktok", "instagram", "youtube"];
const CONTENT_TABLES: &[(&str, &str)] = &[
    ("creatorWatchlist", "growth_creator_watchlist"),
    ("viralVideos", "growth_viral_videos"),
    ("contentRecipes", "growth_content_recipes"),
    ("contentIdeas", "growth_content_ideas"),
    ("postPackages", "growth_post_packages"),
    ("metricSnapshots", "growth_post_metric_snapshots"),
    (
        "quarantinedAnalyticsRows",
        "growth_quarantined_analytics_rows",
    ),
];
const POST_STATES: &[&str] = &[
    "draft",
    "needs-video",
    "ready-for-approval",
    "approved",
    "queued",
    "posted",
    "blocked",
];
const IDEA_STATES: &[&str] = &[
    "idea",
    "scripted",
    "needs-video",
    "ready-for-approval",
    "queued",
    "recorded",
    "packaged",
    "posted",
    "archived",
];
#[cfg(test)]
const CONNECTOR_STATUSES: &[&str] = &[
    "not_configured",
    "configured",
    "oauth_required",
    "permission_missing",
    "review_required",
    "ready",
    "error",
];

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/growth/state", get(get_state).put(put_state))
        .route("/growth/viral-videos", post(add_viral_video))
        .route("/growth/ideas/generate", post(generate_ideas))
        .route(
            "/growth/post-packages",
            post(upsert_post_package).patch(patch_post_package),
        )
        .route(
            "/growth/post-packages/:id/approve",
            post(approve_post_package),
        )
        .route(
            "/growth/runs/watchlist-refresh",
            post(run_watchlist_refresh),
        )
        .route(
            "/growth/runs/calendar-planning",
            post(run_calendar_planning),
        )
        .route("/growth/runs", get(get_runs))
        .route("/growth/runs/owned-analytics", post(run_owned_analytics))
        .route("/growth/runs/recipe-scoring", post(run_recipe_scoring))
        .route(
            "/growth/runs/recommendation-refresh",
            post(run_recommendation_refresh),
        )
        .route(
            "/growth/analytics/import/preview",
            post(preview_analytics_import),
        )
        .route(
            "/growth/analytics/import/commit",
            post(commit_analytics_import),
        )
        .route("/growth/connectors/status", get(get_connector_status))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StateBody {
    #[serde(default)]
    creator_watchlist: Vec<Value>,
    #[serde(default)]
    viral_videos: Vec<Value>,
    #[serde(default)]
    content_recipes: Vec<Value>,
    #[serde(default)]
    content_ideas: Vec<Value>,
    #[serde(default)]
    post_packages: Vec<Value>,
    #[serde(default)]
    metric_snapshots: Vec<Value>,
    #[serde(default)]
    quarantined_analytics_rows: Vec<Value>,
}

fn now() -> String {
    chrono::Utc::now().to_rfc3339()
}

fn json_text(value: &Value) -> Result<String, AppError> {
    serde_json::to_string(value).map_err(|e| AppError::Internal(e.into()))
}

fn parse_json(value: &str) -> Value {
    serde_json::from_str(value).unwrap_or_else(|_| json!({}))
}

fn normalize_text(value: &str) -> String {
    value
        .to_lowercase()
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() { ch } else { ' ' })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn platform(value: &Value) -> Option<String> {
    value
        .get("platform")
        .and_then(Value::as_str)
        .filter(|platform| PLATFORMS.contains(platform))
        .map(str::to_string)
}

fn timestamp(value: &Value) -> String {
    for key in ["createdAt", "capturedAt", "measuredAt", "lastReviewedAt"] {
        if let Some(ts) = value
            .get(key)
            .and_then(Value::as_str)
            .filter(|ts| !ts.is_empty())
        {
            return ts.to_string();
        }
    }
    now()
}

fn status_for(table: &str, value: &Value) -> String {
    let raw = match table {
        "growth_post_packages" => value.get("approvalState").and_then(Value::as_str),
        "growth_post_metric_snapshots" => value.get("horizon").and_then(Value::as_str),
        "growth_quarantined_analytics_rows" => Some("quarantined"),
        _ => value.get("status").and_then(Value::as_str),
    };
    let status = raw.unwrap_or(match table {
        "growth_content_recipes" => "testing",
        "growth_content_ideas" => "idea",
        "growth_post_packages" => "draft",
        "growth_post_metric_snapshots" => "24h",
        "growth_viral_videos" => "captured",
        _ => "active",
    });
    if table == "growth_post_packages" && !POST_STATES.contains(&status) {
        "blocked".into()
    } else if table == "growth_content_ideas" && !IDEA_STATES.contains(&status) {
        "idea".into()
    } else {
        status.into()
    }
}

fn array_for<'a>(body: &'a StateBody, key: &str) -> &'a [Value] {
    match key {
        "creatorWatchlist" => &body.creator_watchlist,
        "viralVideos" => &body.viral_videos,
        "contentRecipes" => &body.content_recipes,
        "contentIdeas" => &body.content_ideas,
        "postPackages" => &body.post_packages,
        "metricSnapshots" => &body.metric_snapshots,
        "quarantinedAnalyticsRows" => &body.quarantined_analytics_rows,
        _ => &[],
    }
}

async fn log_sync(
    db: &SqlitePool,
    table: &str,
    row_id: &str,
    operation: &str,
    payload: Option<&Value>,
) -> Result<(), AppError> {
    let payload_text = match payload {
        Some(value) => Some(json_text(value)?),
        None => None,
    };
    crate::sync::log_mutation(db, table, row_id, operation, payload_text.as_deref())
        .await
        .map_err(|e| AppError::Internal(e.into()))
}

fn sync_payload(user_id: &str, item: &Value, table: &str) -> Value {
    json!({
        "id": item["id"],
        "user_id": user_id,
        "platform": platform(item),
        "status": status_for(table, item),
        "payload": item,
        "updated_at": now(),
    })
}

async fn upsert_content_item(
    db: &SqlitePool,
    user_id: &str,
    table: &str,
    item: &Value,
) -> Result<(), AppError> {
    let id = item
        .get("id")
        .and_then(Value::as_str)
        .filter(|id| !id.trim().is_empty())
        .ok_or_else(|| AppError::BadRequest("Growth item missing id.".into()))?;
    let payload = json_text(item)?;
    let created_at = timestamp(item);
    let updated_at = now();
    let platform = platform(item);
    let status = status_for(table, item);
    let sql = format!(
        "INSERT INTO {table} (id, user_id, platform, status, payload, created_at, updated_at) \
         VALUES (?, ?, ?, ?, ?, ?, ?) \
         ON CONFLICT(id) DO UPDATE SET \
           platform = excluded.platform, \
           status = excluded.status, \
           payload = excluded.payload, \
           updated_at = excluded.updated_at, \
           deleted_at = NULL",
    );
    sqlx::query(&sql)
        .bind(id)
        .bind(user_id)
        .bind(platform)
        .bind(status)
        .bind(payload)
        .bind(created_at)
        .bind(&updated_at)
        .execute(db)
        .await?;
    log_sync(
        db,
        table,
        id,
        "UPDATE",
        Some(&sync_payload(user_id, item, table)),
    )
    .await?;
    Ok(())
}

async fn load_payloads(
    db: &SqlitePool,
    user_id: &str,
    table: &str,
) -> Result<Vec<Value>, AppError> {
    let sql = format!(
        "SELECT payload FROM {table} WHERE user_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 1000",
    );
    let rows: Vec<String> = sqlx::query_scalar(&sql).bind(user_id).fetch_all(db).await?;
    Ok(rows.into_iter().map(|row| parse_json(&row)).collect())
}

async fn load_state(db: &SqlitePool, user_id: &str) -> Result<Value, AppError> {
    let mut out = Map::new();
    for (key, table) in CONTENT_TABLES {
        out.insert(
            (*key).into(),
            json!(load_payloads(db, user_id, table).await?),
        );
    }
    Ok(Value::Object(out))
}

async fn get_state(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    Ok(success_json(load_state(&state.db, &session.user_id).await?))
}

async fn put_state(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Json(body): Json<StateBody>,
) -> Result<Json<Value>, AppError> {
    for (key, table) in CONTENT_TABLES {
        for item in array_for(&body, key) {
            upsert_content_item(&state.db, &session.user_id, table, item).await?;
        }
    }
    Ok(success_json(load_state(&state.db, &session.user_id).await?))
}

async fn add_viral_video(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Json(mut body): Json<Value>,
) -> Result<Json<Value>, AppError> {
    if body.get("id").and_then(Value::as_str).is_none() {
        body["id"] = json!(format!("viral-{}", random_uuid()));
    }
    if body.get("source").and_then(Value::as_str).is_none() {
        body["source"] = json!("manual-link");
    }
    if body
        .get("sourceConfidence")
        .and_then(Value::as_str)
        .is_none()
    {
        body["sourceConfidence"] = json!("medium");
    }
    if body.get("capturedAt").and_then(Value::as_str).is_none() {
        body["capturedAt"] = json!(now());
    }
    upsert_content_item(&state.db, &session.user_id, "growth_viral_videos", &body).await?;
    Ok(success_json(load_state(&state.db, &session.user_id).await?))
}

fn growth_metric_score(metrics: &Value) -> i64 {
    let views = metrics
        .get("views")
        .and_then(Value::as_i64)
        .unwrap_or(0)
        .max(0);
    if views <= 0 {
        return 0;
    }
    let rate = |key: &str| {
        metrics.get(key).and_then(Value::as_i64).unwrap_or(0).max(0) as f64 / views as f64
    };
    let retention = metrics
        .get("watchRetention")
        .and_then(Value::as_f64)
        .unwrap_or(0.0)
        / 100.0;
    let follow_rate = metrics
        .get("followerDelta")
        .and_then(Value::as_i64)
        .unwrap_or(0)
        .max(0) as f64
        / views as f64;
    let lead = metrics
        .get("leadSignal")
        .and_then(Value::as_i64)
        .unwrap_or(0)
        .clamp(0, 8) as f64;
    (rate("likes") * 450.0
        + rate("comments") * 1100.0
        + rate("shares") * 6800.0
        + rate("saves") * 6200.0
        + follow_rate * 11000.0
        + retention * 80.0
        + lead * 8.0)
        .round() as i64
}

fn topic_hashtags(topic: &str) -> Vec<&'static str> {
    let normalized = normalize_text(topic);
    let mut tags = vec!["sciencebasedlifting", "fitnesscoach", "strengthtraining"];
    if normalized.contains("beginner") {
        tags.push("beginnerfitness");
    }
    if normalized.contains("protein") || normalized.contains("recovery") {
        tags.push("naturalbodybuilding");
    }
    if normalized.contains("squat")
        || normalized.contains("deadlift")
        || normalized.contains("bench")
    {
        tags.push("formcheck");
    }
    if normalized.contains("coaching") || normalized.contains("accountability") {
        tags.push("onlinecoach");
    }
    tags.truncate(5);
    tags
}

fn generated_ideas_from_state(state: &Value) -> Vec<Value> {
    let now = now();
    let date = now.split('T').next().unwrap_or("today");
    let mut recipes = state
        .get("contentRecipes")
        .and_then(Value::as_array)
        .filter(|items| !items.is_empty())
        .cloned()
        .unwrap_or_else(|| {
            vec![json!({
                "id": "default-proof-cue",
                "name": "Proof cue",
                "hookFormula": "Stop doing {lift cue} this way.",
                "proofType": "mechanical tension and setup position",
                "cta": "DM me 'FORM' for a quick audit."
            })]
        });
    recipes.sort_by(|left, right| {
        let score = |recipe: &Value| {
            recipe
                .get("baselineScore")
                .and_then(Value::as_i64)
                .unwrap_or(40)
                + recipe
                    .get("expectedUpside")
                    .and_then(Value::as_i64)
                    .unwrap_or(3)
                    * 18
                - recipe
                    .get("difficulty")
                    .and_then(Value::as_i64)
                    .unwrap_or(3)
                    * 7
        };
        score(right).cmp(&score(left))
    });
    let learned_topics = state
        .get("viralVideos")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .flat_map(|video| {
            [
                video
                    .get("topic")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string(),
                video
                    .get("hook")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string(),
            ]
        })
        .map(|item| {
            normalize_text(&item)
                .split_whitespace()
                .take(4)
                .collect::<Vec<_>>()
                .join(" ")
        })
        .filter(|item| !item.is_empty())
        .collect::<Vec<_>>();
    let base_topics = [
        "bench press shoulder pain",
        "squat depth myth",
        "science-based arm growth",
        "natural lifter recovery",
        "beginner progressive overload",
        "protein timing truth",
        "deadlift setup fix",
        "gym consistency system",
        "online coaching accountability",
        "lat pulldown cue",
    ];
    let mut topics = Vec::new();
    for topic in learned_topics
        .iter()
        .take(4)
        .map(String::as_str)
        .chain(base_topics.iter().copied())
    {
        if !topics.contains(&topic.to_string()) {
            topics.push(topic.to_string());
        }
        if topics.len() == 10 {
            break;
        }
    }

    let mut ideas = topics
        .iter()
        .enumerate()
        .map(|(index, topic)| {
            let recipe = &recipes[index % recipes.len()];
            let recipe_id = recipe.get("id").and_then(Value::as_str).unwrap_or("recipe");
            let recipe_name = recipe.get("name").and_then(Value::as_str).unwrap_or("Proof cue");
            let cta = recipe
                .get("cta")
                .and_then(Value::as_str)
                .unwrap_or("DM me 'FORM' for a quick audit.");
            let title = format!("{topic}: {recipe_name}");
            let score = recipe.get("baselineScore").and_then(Value::as_i64).unwrap_or(40)
                + recipe.get("expectedUpside").and_then(Value::as_i64).unwrap_or(3) * 18
                - recipe.get("difficulty").and_then(Value::as_i64).unwrap_or(3) * 7
                + if index < 5 { 8 } else { 0 };
            (score, json!({
                "id": format!("idea-{date}-{}", index + 1),
                "recipeId": recipe_id,
                "title": title.chars().take(72).collect::<String>(),
                "scriptOutline": [
                    format!("Open with the exact mistake: {topic}."),
                    format!("Show one wrong rep, then the corrected {topic} cue."),
                    "Give the science in one sentence: setup changes the target muscle.",
                    cta
                ],
                "platformVariants": {
                    "tiktok": format!("TikTok: fast hook in first second, gym demo before context, {cta}"),
                    "instagram": format!("Reels: cover text with the mistake, saveable cue list, polished demo, {cta}"),
                    "youtube": format!("Shorts: searchable one-problem title, immediate answer, clear retention loop, {cta}")
                },
                "caption": format!("{title}. {cta}"),
                "hashtags": topic_hashtags(topic),
                "cta": cta,
                "status": "idea",
                "makeToday": false,
                "createdAt": now
            }))
        })
        .collect::<Vec<_>>();
    let mut top = ideas.clone();
    top.sort_by(|left, right| right.0.cmp(&left.0));
    let top_ids = top
        .iter()
        .take(3)
        .filter_map(|(_, idea)| idea.get("id").and_then(Value::as_str).map(str::to_string))
        .collect::<HashSet<_>>();
    ideas
        .drain(..)
        .map(|(_, mut idea)| {
            if let Some(id) = idea.get("id").and_then(Value::as_str) {
                idea["makeToday"] = json!(top_ids.contains(id));
            }
            idea
        })
        .collect()
}

async fn generate_ideas(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let current = load_state(&state.db, &session.user_id).await?;
    let ideas = generated_ideas_from_state(&current);
    for idea in &ideas {
        upsert_content_item(&state.db, &session.user_id, "growth_content_ideas", idea).await?;
    }
    Ok(success_json(json!({ "ideas": ideas })))
}

async fn upsert_post_package(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Json(body): Json<Value>,
) -> Result<Json<Value>, AppError> {
    let package = validate_post_package(body, false);
    upsert_content_item(
        &state.db,
        &session.user_id,
        "growth_post_packages",
        &package,
    )
    .await?;
    Ok(success_json(load_state(&state.db, &session.user_id).await?))
}

async fn patch_post_package(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Json(body): Json<Value>,
) -> Result<Json<Value>, AppError> {
    let id = body
        .get("id")
        .and_then(Value::as_str)
        .ok_or_else(|| AppError::BadRequest("Post package patch missing id.".into()))?;
    let row: Option<String> = sqlx::query_scalar(
        "SELECT payload FROM growth_post_packages WHERE id = ? AND user_id = ? AND deleted_at IS NULL LIMIT 1",
    )
    .bind(id)
    .bind(&session.user_id)
    .fetch_optional(&state.db)
    .await?;
    let mut merged = row
        .map(|row| parse_json(&row))
        .unwrap_or_else(|| json!({ "id": id }));
    merge_object(&mut merged, &body);
    let package = validate_post_package(merged, false);
    upsert_content_item(
        &state.db,
        &session.user_id,
        "growth_post_packages",
        &package,
    )
    .await?;
    Ok(success_json(load_state(&state.db, &session.user_id).await?))
}

fn merge_object(target: &mut Value, patch: &Value) {
    if let (Some(target), Some(patch)) = (target.as_object_mut(), patch.as_object()) {
        for (key, value) in patch {
            target.insert(key.clone(), value.clone());
        }
    }
}

fn validate_post_package(mut package: Value, approve: bool) -> Value {
    let mut errors = Vec::new();
    if package
        .get("scriptDraft")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .is_none()
    {
        errors.push("Add a script draft before approval.");
    }
    if package
        .get("videoFile")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .is_none()
    {
        errors.push("Attach a vertical video file before approval.");
    }
    let has_shot_list = package
        .get("shotList")
        .and_then(Value::as_array)
        .map(|items| {
            items.iter().any(|item| {
                item.get("label")
                    .and_then(Value::as_str)
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .is_some()
            })
        })
        .unwrap_or(false);
    if !has_shot_list {
        errors.push("Add at least one shot list item.");
    }
    let has_cover_variant = package
        .get("coverTitleVariants")
        .and_then(Value::as_array)
        .map(|items| {
            items.iter().any(|item| {
                item.as_str()
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .is_some()
            })
        })
        .unwrap_or(false);
    if !has_cover_variant {
        errors.push("Add at least one cover/title variant.");
    }

    let variants = package
        .get("platformVariants")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    let enabled: Vec<_> = PLATFORMS
        .iter()
        .filter(|platform| {
            variants
                .get(**platform)
                .and_then(Value::as_object)
                .and_then(|variant| variant.get("enabled"))
                .and_then(Value::as_bool)
                .unwrap_or(true)
        })
        .collect();
    if enabled.is_empty() {
        errors.push("Enable at least one staging platform.");
    }
    for platform in enabled {
        let variant = variants
            .get(*platform)
            .and_then(Value::as_object)
            .cloned()
            .unwrap_or_default();
        for key in ["title", "caption", "scheduledAt"] {
            if variant
                .get(key)
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .is_none()
            {
                errors.push(match key {
                    "title" => "Platform variant needs a title.",
                    "caption" => "Platform variant needs a caption.",
                    _ => "Platform variant needs a scheduled time.",
                });
            }
        }
    }

    let has_errors = !errors.is_empty();
    package["validationErrors"] = json!(errors);
    if !package
        .get("approvalAudit")
        .and_then(Value::as_array)
        .is_some()
    {
        package["approvalAudit"] = json!([]);
    }
    package["approvalState"] = if has_errors {
        if approve {
            append_approval_audit(
                &mut package,
                "blocked",
                "system",
                "Validation blocked internal approval.",
            );
            json!("blocked")
        } else if package.get("videoFile").and_then(Value::as_str).is_some() {
            json!("draft")
        } else {
            json!("needs-video")
        }
    } else if approve {
        let timestamp = now();
        package["approvedAt"] = json!(timestamp);
        package["queuedAt"] = json!(timestamp);
        append_approval_audit(
            &mut package,
            "approved",
            "local-user",
            "Internal staging approval recorded.",
        );
        append_approval_audit(
            &mut package,
            "queued",
            "system",
            "Queued internally; no live publish control exposed.",
        );
        json!("queued")
    } else {
        json!("ready-for-approval")
    };
    package
}

fn append_approval_audit(package: &mut Value, event: &str, actor: &str, notes: &str) {
    let audit = package
        .get_mut("approvalAudit")
        .and_then(Value::as_array_mut);
    if let Some(audit) = audit {
        audit.push(json!({
            "id": format!("audit-{}", random_uuid()),
            "event": event,
            "actor": actor,
            "at": now(),
            "notes": notes,
        }));
    }
}

async fn approve_post_package(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Path(id): Path<String>,
) -> Result<Json<Value>, AppError> {
    let row: Option<String> = sqlx::query_scalar(
        "SELECT payload FROM growth_post_packages WHERE id = ? AND user_id = ? AND deleted_at IS NULL LIMIT 1",
    )
    .bind(&id)
    .bind(&session.user_id)
    .fetch_optional(&state.db)
    .await?;
    let package = row.ok_or_else(|| AppError::NotFound("Post package not found.".into()))?;
    let package = validate_post_package(parse_json(&package), true);
    upsert_content_item(
        &state.db,
        &session.user_id,
        "growth_post_packages",
        &package,
    )
    .await?;
    Ok(success_json(package))
}

async fn configured_social_services(state: &AppState, session: &UserSession) -> HashSet<String> {
    if let Ok(sb) = SupabaseClient::from_state(state) {
        if let Ok(rows) = sb
            .select_as_user(
                "user_secrets",
                "select=service&service=in.(social.tiktok,social.instagram,social.youtube)",
                &session.access_token,
            )
            .await
        {
            if let Some(rows) = rows.as_array() {
                return rows
                    .iter()
                    .filter_map(|row| row.get("service").and_then(Value::as_str))
                    .map(str::to_string)
                    .collect();
            }
        }
    }

    PLATFORMS
        .iter()
        .filter_map(|platform| {
            let service = format!("social.{platform}");
            state
                .secret(&service)
                .filter(|value| !value.trim().is_empty())
                .map(|_| service)
        })
        .collect()
}

async fn persist_connector_status(
    state: &AppState,
    user_id: &str,
    connector: &Value,
) -> Result<(), AppError> {
    let id = connector
        .get("id")
        .and_then(Value::as_str)
        .ok_or_else(|| AppError::Internal(anyhow::anyhow!("connector missing id")))?;
    let platform = connector.get("platform").and_then(Value::as_str);
    let status = connector
        .get("status")
        .and_then(Value::as_str)
        .unwrap_or("not_configured");
    let permissions_value = connector
        .get("permissions")
        .cloned()
        .unwrap_or_else(|| json!([]));
    let permissions = json_text(&permissions_value)?;
    let metadata = json_text(&json!({
        "service": connector.get("service").and_then(Value::as_str),
        "readinessOnly": true,
    }))?;
    let updated_at = now();
    sqlx::query(
        "INSERT INTO growth_connector_accounts \
         (id, user_id, platform, status, account_label, permissions, metadata, created_at, updated_at) \
         VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?) \
         ON CONFLICT(id) DO UPDATE SET \
           platform = excluded.platform, \
           status = excluded.status, \
           account_label = excluded.account_label, \
           permissions = excluded.permissions, \
           metadata = excluded.metadata, \
           updated_at = excluded.updated_at, \
           deleted_at = NULL",
    )
    .bind(id)
    .bind(user_id)
    .bind(platform)
    .bind(status)
    .bind(permissions)
    .bind(metadata)
    .bind(&updated_at)
    .bind(&updated_at)
    .execute(&state.db)
    .await?;

    let payload = json!({
        "id": id,
        "user_id": user_id,
        "platform": platform,
        "status": status,
        "account_label": null,
        "permissions": permissions_value,
        "metadata": {
            "service": connector.get("service").and_then(Value::as_str),
            "readinessOnly": true,
        },
        "updated_at": updated_at,
    });
    log_sync(
        &state.db,
        "growth_connector_accounts",
        id,
        "UPDATE",
        Some(&payload),
    )
    .await
}

async fn connector_statuses(state: &AppState, session: &UserSession) -> Result<Value, AppError> {
    let configured_services = configured_social_services(state, session).await;
    let statuses = connector_statuses_for(&session.user_id, &configured_services);
    for connector in &statuses {
        persist_connector_status(state, &session.user_id, connector).await?;
    }
    Ok(json!(statuses))
}

fn connector_statuses_for(user_id: &str, configured_services: &HashSet<String>) -> Vec<Value> {
    PLATFORMS
        .iter()
        .map(|platform| {
            let service = format!("social.{platform}");
            let configured = configured_services.contains(&service);
            let required_scopes = match *platform {
                "tiktok" => vec!["video.list", "user.info.basic", "analytics.read"],
                "instagram" => vec!["instagram_basic", "instagram_manage_insights", "pages_show_list"],
                _ => vec!["youtube.readonly", "yt-analytics.readonly"],
            };
            json!({
                "id": format!("{user_id}:{platform}"),
                "platform": platform,
                "status": if configured { "configured" } else { "not_configured" },
                "service": service,
                "accountLabel": null,
                "permissions": [],
                "requiredScopes": required_scopes,
                "lastCheckedAt": now(),
                "lastSuccessfulReadOnlyCheckAt": if configured { Some(now()) } else { None::<String> },
                "blockingReason": if configured {
                    "OAuth/app review not complete; readiness metadata only.".to_string()
                } else {
                    format!("Missing secret service social.{platform}.")
                },
                "reason": if configured {
                    "Credential metadata found. V2.5 is readiness-only; OAuth scopes, app review, and manual approval still gate any future publish bridge.".to_string()
                } else {
                    format!("Missing secret service social.{platform}; no token value is read or stored.")
                },
                "diagnostics": {
                    "readinessOnly": true,
                    "tokenStored": false,
                    "checkedSecretService": service,
                    "publishControlsEnabled": false
                }
            })
        })
        .collect()
}

async fn get_connector_status(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    Ok(success_json(
        json!({ "connectors": connector_statuses(&state, &session).await? }),
    ))
}

async fn log_run(
    state: &AppState,
    session: &UserSession,
    run_type: &str,
    status: &str,
    source_counts: Value,
    created_record_counts: Value,
    updated_record_counts: Value,
    blocked_reason: Option<&str>,
) -> Result<Value, AppError> {
    let id = format!("growth-run-{}", random_uuid());
    let started = now();
    let connectors = connector_statuses(state, session).await?;
    sqlx::query(
        "INSERT INTO growth_agent_runs \
         (id, user_id, run_type, started_at, completed_at, status, source_counts, created_record_counts, updated_record_counts, blocked_reason, connector_statuses, created_at, updated_at) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&session.user_id)
    .bind(run_type)
    .bind(&started)
    .bind(&started)
    .bind(status)
    .bind(json_text(&source_counts)?)
    .bind(json_text(&created_record_counts)?)
    .bind(json_text(&updated_record_counts)?)
    .bind(blocked_reason)
    .bind(json_text(&connectors)?)
    .bind(&started)
    .bind(&started)
    .execute(&state.db)
    .await?;
    let payload = json!({
        "id": id,
        "user_id": session.user_id,
        "run_type": run_type,
        "started_at": started,
        "completed_at": started,
        "status": status,
        "source_counts": source_counts,
        "created_record_counts": created_record_counts,
        "updated_record_counts": updated_record_counts,
        "blocked_reason": blocked_reason,
        "connector_statuses": connectors,
        "updated_at": now(),
    });
    log_sync(
        &state.db,
        "growth_agent_runs",
        payload["id"].as_str().unwrap_or_default(),
        "INSERT",
        Some(&payload),
    )
    .await?;
    Ok(payload)
}

async fn get_runs(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let rows = sqlx::query_as::<_, (String,)>(
        "SELECT json_object(\
           'id', id,\
           'run_type', run_type,\
           'started_at', started_at,\
           'completed_at', completed_at,\
           'status', status,\
           'source_counts', json(source_counts),\
           'created_record_counts', json(created_record_counts),\
           'updated_record_counts', json(updated_record_counts),\
           'blocked_reason', blocked_reason,\
           'connector_statuses', json(connector_statuses)\
         ) \
         FROM growth_agent_runs \
         WHERE user_id = ? \
         ORDER BY started_at DESC \
         LIMIT 25",
    )
    .bind(&session.user_id)
    .fetch_all(&state.db)
    .await?;
    let runs = rows
        .into_iter()
        .map(|(row,)| parse_json(&row))
        .collect::<Vec<_>>();
    Ok(success_json(json!({ "runs": runs })))
}

async fn run_watchlist_refresh(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let run = log_run(
        &state,
        &session,
        "growth.watchlist.refresh.daily",
        "blocked",
        json!({ "providers": 0 }),
        json!({}),
        json!({}),
        Some("Official competitor research provider is not configured; manual/link intake remains active."),
    )
    .await?;
    Ok(success_json(json!({ "run": run })))
}

fn row_string(row: &Value, keys: &[&str]) -> String {
    for key in keys {
        let normalized = key.replace(' ', "_");
        if let Some(value) = row
            .get(*key)
            .or_else(|| row.get(normalized.as_str()))
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            return value.to_string();
        }
    }
    String::new()
}

fn metric_number(row: &Value, keys: &[&str]) -> i64 {
    let raw = row_string(row, keys).to_lowercase().replace(',', "");
    if raw.is_empty() {
        return 0;
    }
    let multiplier = if raw.ends_with('k') {
        1_000.0
    } else if raw.ends_with('m') {
        1_000_000.0
    } else {
        1.0
    };
    let clean = raw
        .chars()
        .filter(|ch| ch.is_ascii_digit() || *ch == '.')
        .collect::<String>();
    clean
        .parse::<f64>()
        .map(|value| (value * multiplier).round() as i64)
        .unwrap_or(0)
}

fn infer_import_platform(row: &Value) -> &'static str {
    let value = normalize_text(&row_string(row, &["platform", "network", "channel"]));
    if value.contains("instagram") || value.contains("reel") {
        "instagram"
    } else if value.contains("youtube") || value.contains("short") {
        "youtube"
    } else {
        "tiktok"
    }
}

fn infer_horizon(row: &Value) -> &'static str {
    match row_string(row, &["horizon", "age", "window"]).as_str() {
        "1h" => "1h",
        "72h" => "72h",
        "7d" => "7d",
        _ => "24h",
    }
}

fn infer_confidence(row: &Value, attributed: bool) -> &'static str {
    match row_string(row, &["confidence", "source_confidence"]).as_str() {
        "low" => "low",
        "medium" => "medium",
        "high" => "high",
        _ if attributed => "high",
        _ => "low",
    }
}

fn infer_source(row: &Value) -> &'static str {
    match row_string(row, &["source"]).as_str() {
        "watchlist" => "watchlist",
        "manual-link" => "manual-link",
        "approved-provider" => "approved-provider",
        _ => "owned-analytics",
    }
}

fn import_attribution(
    state: &Value,
    row: &Value,
) -> (
    Option<String>,
    Option<String>,
    Option<String>,
    Option<String>,
) {
    let package_raw = row_string(row, &["package", "package_id", "post_package_id"]);
    let idea_raw = row_string(row, &["idea", "idea_id"]);
    let recipe_raw = row_string(row, &["recipe", "recipe_id"]);
    let topic = row_string(row, &["topic", "content_topic"]);
    let packages = state
        .get("postPackages")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let ideas = state
        .get("contentIdeas")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let recipes = state
        .get("contentRecipes")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let package = packages.iter().find(|package| {
        package.get("id").and_then(Value::as_str) == Some(package_raw.as_str())
            || package.get("ideaId").and_then(Value::as_str) == Some(idea_raw.as_str())
    });
    let idea = ideas.iter().find(|idea| {
        idea.get("id").and_then(Value::as_str) == Some(idea_raw.as_str())
            || package.and_then(|package| package.get("ideaId").and_then(Value::as_str))
                == idea.get("id").and_then(Value::as_str)
            || (!topic.is_empty()
                && idea
                    .get("title")
                    .and_then(Value::as_str)
                    .map(normalize_text)
                    .unwrap_or_default()
                    .contains(&normalize_text(&topic)))
    });
    let recipe = recipes.iter().find(|recipe| {
        recipe.get("id").and_then(Value::as_str) == Some(recipe_raw.as_str())
            || idea.and_then(|idea| idea.get("recipeId").and_then(Value::as_str))
                == recipe.get("id").and_then(Value::as_str)
            || recipe
                .get("topics")
                .and_then(Value::as_array)
                .map(|topics| {
                    topics.iter().any(|recipe_topic| {
                        recipe_topic
                            .as_str()
                            .map(|value| normalize_text(&topic).contains(&normalize_text(value)))
                            .unwrap_or(false)
                    })
                })
                .unwrap_or(false)
    });
    (
        package.and_then(|item| item.get("id").and_then(Value::as_str).map(str::to_string)),
        idea.and_then(|item| item.get("id").and_then(Value::as_str).map(str::to_string)),
        recipe.and_then(|item| item.get("id").and_then(Value::as_str).map(str::to_string)),
        if topic.is_empty() { None } else { Some(topic) },
    )
}

fn preview_import_rows(state: &Value, rows: &[Value]) -> Vec<Value> {
    rows.iter()
        .enumerate()
        .map(|(index, row)| {
            let (post_package_id, idea_id, recipe_id, topic) = import_attribution(state, row);
            let attributed = post_package_id.is_some() || idea_id.is_some() || recipe_id.is_some();
            let platform = infer_import_platform(row);
            json!({
                "id": format!("import-{}-{index}", random_uuid()),
                "raw": row,
                "platform": platform,
                "postPackageId": post_package_id,
                "ideaId": idea_id,
                "recipeId": recipe_id,
                "topic": topic,
                "horizon": infer_horizon(row),
                "source": infer_source(row),
                "confidence": infer_confidence(row, attributed),
                "metrics": {
                    "views": metric_number(row, &["views", "plays", "impressions"]),
                    "likes": metric_number(row, &["likes"]),
                    "comments": metric_number(row, &["comments", "replies"]),
                    "shares": metric_number(row, &["shares", "reposts"]),
                    "saves": metric_number(row, &["saves", "bookmarks"]),
                    "watchRetention": metric_number(row, &["watch_retention", "retention"]),
                    "followerDelta": metric_number(row, &["follower_delta", "followers"]),
                    "leadSignal": metric_number(row, &["lead_signal", "leads", "dms"])
                },
                "measuredAt": row_string(row, &["measured_at", "date"]),
                "attributed": attributed,
                "quarantineReason": if attributed { Value::Null } else { json!("Missing package, idea, recipe, or topic attribution.") },
            })
        })
        .collect()
}

async fn preview_analytics_import(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Json(body): Json<Value>,
) -> Result<Json<Value>, AppError> {
    let current = load_state(&state.db, &session.user_id).await?;
    let rows = body
        .get("rows")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    Ok(success_json(
        json!({ "preview": preview_import_rows(&current, &rows) }),
    ))
}

async fn commit_analytics_import(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Json(body): Json<Value>,
) -> Result<Json<Value>, AppError> {
    let rows = body
        .get("previewRows")
        .or_else(|| body.get("preview_rows"))
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let mut snapshots = 0usize;
    let mut quarantined = 0usize;
    for row in &rows {
        if row
            .get("attributed")
            .and_then(Value::as_bool)
            .unwrap_or(false)
        {
            let snapshot = json!({
                "id": format!("metric-import-{}", random_uuid()),
                "postPackageId": row.get("postPackageId").and_then(Value::as_str).unwrap_or_default(),
                "ideaId": row.get("ideaId").cloned().unwrap_or(Value::Null),
                "recipeId": row.get("recipeId").cloned().unwrap_or(Value::Null),
                "topic": row.get("topic").cloned().unwrap_or(Value::Null),
                "platform": row.get("platform").and_then(Value::as_str).unwrap_or("tiktok"),
                "measuredAt": row.get("measuredAt").and_then(Value::as_str).filter(|value| !value.is_empty()).map(str::to_string).unwrap_or_else(now),
                "horizon": row.get("horizon").and_then(Value::as_str).unwrap_or("24h"),
                "metrics": row.get("metrics").cloned().unwrap_or_else(|| json!({})),
                "source": row.get("source").and_then(Value::as_str).unwrap_or("owned-analytics"),
                "confidence": row.get("confidence").and_then(Value::as_str).unwrap_or("medium"),
                "evidenceSummary": format!(
                    "{} {} import committed.",
                    row.get("platform").and_then(Value::as_str).unwrap_or("platform"),
                    row.get("horizon").and_then(Value::as_str).unwrap_or("24h")
                )
            });
            upsert_content_item(
                &state.db,
                &session.user_id,
                "growth_post_metric_snapshots",
                &snapshot,
            )
            .await?;
            snapshots += 1;
        } else {
            let quarantine = json!({
                "id": format!("quarantine-{}", random_uuid()),
                "raw": row.get("raw").cloned().unwrap_or_else(|| json!({})),
                "platform": row.get("platform").cloned().unwrap_or(Value::Null),
                "source": row.get("source").and_then(Value::as_str).unwrap_or("owned-analytics"),
                "confidence": row.get("confidence").and_then(Value::as_str).unwrap_or("low"),
                "quarantineReason": row.get("quarantineReason").and_then(Value::as_str).unwrap_or("Missing attribution."),
                "capturedAt": now(),
            });
            upsert_content_item(
                &state.db,
                &session.user_id,
                "growth_quarantined_analytics_rows",
                &quarantine,
            )
            .await?;
            quarantined += 1;
        }
    }
    let run = log_run(
        &state,
        &session,
        "growth.analytics.import.manual",
        "completed",
        json!({ "previewRows": rows.len(), "attributedRows": snapshots, "quarantinedRows": quarantined }),
        json!({ "growth_post_metric_snapshots": snapshots, "growth_quarantined_analytics_rows": quarantined }),
        json!({}),
        None,
    )
    .await?;
    let mut learned = load_state(&state.db, &session.user_id).await?;
    let learned_recipes = learn_recipe_scores(&learned);
    for recipe in &learned_recipes {
        upsert_content_item(
            &state.db,
            &session.user_id,
            "growth_content_recipes",
            recipe,
        )
        .await?;
    }
    learned["contentRecipes"] = json!(learned_recipes);
    Ok(success_json(json!({ "run": run, "state": learned })))
}

fn planned_slot_for(index: usize, platform: &str) -> Value {
    let day = (index / PLATFORMS.len()) as i64;
    let date = (chrono::Utc::now() + chrono::Duration::days(day))
        .date_naive()
        .to_string();
    json!({
        "id": format!("slot-{date}-{platform}-{index}"),
        "date": date,
        "platform": platform,
        "state": if index < 3 { "scripted" } else { "idea" },
        "title": "",
        "batchRecording": day == 1 || day == 4,
        "order": index,
    })
}

async fn run_calendar_planning(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let mut current = load_state(&state.db, &session.user_id).await?;
    let mut ideas = current
        .get("contentIdeas")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    if ideas.is_empty() {
        ideas = generated_ideas_from_state(&current);
    }

    let mut updated = 0usize;
    for (index, idea) in ideas.iter_mut().enumerate() {
        let platform = PLATFORMS[index % PLATFORMS.len()];
        let mut slot = planned_slot_for(index, platform);
        slot["ideaId"] = idea.get("id").cloned().unwrap_or_else(|| json!(""));
        slot["title"] = idea.get("title").cloned().unwrap_or_else(|| json!(""));
        idea["plannedSlots"] = json!([slot]);
        if index < 3 {
            idea["status"] = json!("scripted");
            idea["makeToday"] = json!(true);
        }
        upsert_content_item(&state.db, &session.user_id, "growth_content_ideas", idea).await?;
        updated += 1;
    }

    let run = log_run(
        &state,
        &session,
        "growth.calendar.plan.daily",
        "completed",
        json!({ "ideas": ideas.len(), "platforms": PLATFORMS.len() }),
        json!({}),
        json!({ "growth_content_ideas": updated }),
        None,
    )
    .await?;
    current = load_state(&state.db, &session.user_id).await?;
    Ok(success_json(json!({ "run": run, "state": current })))
}

fn enabled_package_platforms(package: &Value) -> Vec<&'static str> {
    let variants = package
        .get("platformVariants")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    PLATFORMS
        .iter()
        .copied()
        .filter(|platform| {
            variants
                .get(*platform)
                .and_then(Value::as_object)
                .and_then(|variant| variant.get("enabled"))
                .and_then(Value::as_bool)
                .unwrap_or(true)
        })
        .collect()
}

fn mock_metric_snapshot(
    package: &Value,
    idea: Option<&Value>,
    platform: &str,
    index: usize,
) -> Value {
    let package_id = package
        .get("id")
        .and_then(Value::as_str)
        .unwrap_or("post-package");
    let idea_id = package
        .get("ideaId")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let recipe_id = idea
        .and_then(|idea| idea.get("recipeId").and_then(Value::as_str))
        .unwrap_or_default();
    let title_len = package
        .get("platformVariants")
        .and_then(|variants| variants.get(platform))
        .and_then(|variant| variant.get("title"))
        .and_then(Value::as_str)
        .map(str::len)
        .unwrap_or(32) as i64;
    let views = 2_400 + (title_len * 137) + (index as i64 * 503);
    json!({
        "id": format!("metric-{package_id}-{platform}-24h"),
        "postPackageId": package_id,
        "ideaId": idea_id,
        "recipeId": recipe_id,
        "platform": platform,
        "measuredAt": now(),
        "horizon": "24h",
        "source": "owned-analytics",
        "confidence": "medium",
        "evidenceSummary": format!("{platform} readiness-only mocked analytics: {views} views."),
        "metrics": {
            "views": views,
            "likes": views / 8,
            "comments": views / 80,
            "shares": views / 30,
            "saves": views / 24,
            "watchRetention": 61 + (title_len % 25),
            "followerDelta": views / 100,
            "leadSignal": 0
        }
    })
}

fn learn_recipe_scores(state: &Value) -> Vec<Value> {
    let recipes = state
        .get("contentRecipes")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let videos = state
        .get("viralVideos")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let snapshots = state
        .get("metricSnapshots")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let ideas = state
        .get("contentIdeas")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let packages = state
        .get("postPackages")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let idea_to_recipe = ideas
        .iter()
        .filter_map(|idea| {
            Some((
                idea.get("id").and_then(Value::as_str)?.to_string(),
                idea.get("recipeId").and_then(Value::as_str)?.to_string(),
            ))
        })
        .collect::<HashMap<_, _>>();
    let package_to_idea = packages
        .iter()
        .filter_map(|package| {
            Some((
                package.get("id").and_then(Value::as_str)?.to_string(),
                package.get("ideaId").and_then(Value::as_str)?.to_string(),
            ))
        })
        .collect::<HashMap<_, _>>();
    recipes
        .into_iter()
        .map(|mut recipe| {
            let recipe_id = recipe.get("id").and_then(Value::as_str).unwrap_or_default();
            let topics = recipe
                .get("topics")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default()
                .into_iter()
                .filter_map(|topic| topic.as_str().map(normalize_text))
                .collect::<Vec<_>>();
            let mut scores = Vec::new();
            for video in &videos {
                let text = normalize_text(&format!(
                    "{} {} {}",
                    video.get("topic").and_then(Value::as_str).unwrap_or_default(),
                    video.get("hook").and_then(Value::as_str).unwrap_or_default(),
                    video.get("notes").and_then(Value::as_str).unwrap_or_default()
                ));
                if topics.iter().any(|topic| !topic.is_empty() && text.contains(topic)) {
                    scores.push(growth_metric_score(&video["metrics"]));
                }
            }
            let recipe_snapshots = snapshots
                .iter()
                .filter(|snapshot| {
                    if snapshot
                        .get("recipeId")
                        .and_then(Value::as_str)
                        .map(|id| id == recipe_id)
                        .unwrap_or(false)
                    {
                        return true;
                    }
                    let idea_id = snapshot
                        .get("ideaId")
                        .and_then(Value::as_str)
                        .map(str::to_string)
                        .or_else(|| {
                            snapshot
                                .get("postPackageId")
                                .and_then(Value::as_str)
                                .and_then(|package_id| package_to_idea.get(package_id).cloned())
                        });
                    idea_id
                        .and_then(|id| idea_to_recipe.get(&id).cloned())
                        .map(|id| id == recipe_id)
                        .unwrap_or(false)
                })
                .cloned()
                .collect::<Vec<_>>();
            scores.extend(recipe_snapshots.iter().map(|snapshot| growth_metric_score(&snapshot["metrics"])));
            if !scores.is_empty() {
                let best = scores.iter().max().copied().unwrap_or(0) as f64;
                let average = scores.iter().sum::<i64>() as f64 / scores.len() as f64;
                let next_score = (average * 0.6 + best * 0.4).round() as i64;
                let baseline = recipe.get("baselineScore").and_then(Value::as_i64).unwrap_or(40);
                let mut platform_scores = Map::new();
                for platform in PLATFORMS {
                    let platform_values = recipe_snapshots
                        .iter()
                        .filter(|snapshot| {
                            snapshot
                                .get("platform")
                                .and_then(Value::as_str)
                                .map(|value| value == *platform)
                                .unwrap_or(false)
                        })
                        .map(|snapshot| growth_metric_score(&snapshot["metrics"]))
                        .collect::<Vec<_>>();
                    let score = if platform_values.is_empty() {
                        recipe
                            .get("platformScores")
                            .and_then(|scores| scores.get(*platform))
                            .and_then(Value::as_i64)
                            .unwrap_or(0)
                    } else {
                        platform_values.iter().sum::<i64>() / platform_values.len() as i64
                    };
                    platform_scores.insert((*platform).into(), json!(score));
                }
                let best_platform = platform_scores
                    .iter()
                    .max_by_key(|(_, score)| score.as_i64().unwrap_or(0))
                    .map(|(platform, _)| platform.to_string())
                    .unwrap_or_else(|| "tiktok".into());
                let best_platform_score = platform_scores
                    .get(&best_platform)
                    .and_then(Value::as_i64)
                    .unwrap_or(0);
                let recommendation = if best_platform_score >= 120 || next_score >= baseline + 40 {
                    ("double-down", format!("{best_platform} is carrying strongest score."))
                } else if next_score <= baseline + 5 {
                    ("pause", "Topic fatigue risk or weak owned signal.".to_string())
                } else if best_platform_score >= 80 || next_score >= baseline + 15 {
                    ("remix", format!("{best_platform} has enough signal for a new angle."))
                } else {
                    ("test", "Need more imported owned analytics before calling a winner.".to_string())
                };
                let mut evidence = recipe_snapshots
                    .iter()
                    .map(|snapshot| {
                        let platform = snapshot.get("platform").and_then(Value::as_str).unwrap_or("tiktok");
                        let score = growth_metric_score(&snapshot["metrics"]);
                        json!({
                            "id": format!("evidence-{}", snapshot.get("id").and_then(Value::as_str).unwrap_or("snapshot")),
                            "source": snapshot.get("source").and_then(Value::as_str).unwrap_or("owned-analytics"),
                            "platform": platform,
                            "summary": snapshot.get("evidenceSummary").and_then(Value::as_str).map(str::to_string).unwrap_or_else(|| format!("{platform} snapshot scored {score}.")),
                            "score": score,
                            "measuredAt": snapshot.get("measuredAt").cloned().unwrap_or(Value::Null)
                        })
                    })
                    .collect::<Vec<_>>();
                evidence.sort_by(|left, right| {
                    right.get("score").and_then(Value::as_i64).unwrap_or(0).cmp(&left.get("score").and_then(Value::as_i64).unwrap_or(0))
                });
                recipe["baselineScore"] = json!(next_score);
                recipe["platformScores"] = Value::Object(platform_scores);
                recipe["recommendation"] = json!(recommendation.0);
                recipe["recommendationReason"] = json!(recommendation.1);
                recipe["recommendationEvidence"] = json!(evidence.into_iter().take(6).collect::<Vec<_>>());
                recipe["topicFatigue"] = json!(recommendation.0 == "pause");
                recipe["status"] = json!(if next_score >= baseline + 35 {
                    "winning"
                } else if next_score >= baseline + 12 {
                    "promising"
                } else if next_score <= (baseline - 20).max(10) {
                    "failed"
                } else {
                    "testing"
                });
                recipe["lastReviewedAt"] = json!(now());
            }
            recipe
        })
        .collect()
}

async fn run_owned_analytics(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let current = load_state(&state.db, &session.user_id).await?;
    let packages = current
        .get("postPackages")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let ideas = current
        .get("contentIdeas")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let eligible: Vec<Value> = packages
        .into_iter()
        .filter(|package| {
            matches!(
                package.get("approvalState").and_then(Value::as_str),
                Some("approved" | "queued" | "posted")
            )
        })
        .collect();
    if eligible.is_empty() {
        let run = log_run(
            &state,
            &session,
            "growth.analytics.owned.daily",
            "blocked",
            json!({ "queuedPackages": 0 }),
            json!({}),
            json!({}),
            Some("No approved or queued post packages are ready for mocked analytics import."),
        )
        .await?;
        return Ok(success_json(json!({ "run": run, "state": current })));
    }

    let mut created = 0usize;
    for (index, package) in eligible.iter().enumerate() {
        let idea = package
            .get("ideaId")
            .and_then(Value::as_str)
            .and_then(|idea_id| {
                ideas
                    .iter()
                    .find(|idea| idea.get("id").and_then(Value::as_str) == Some(idea_id))
            });
        for platform in enabled_package_platforms(package) {
            let snapshot = mock_metric_snapshot(package, idea, platform, index);
            upsert_content_item(
                &state.db,
                &session.user_id,
                "growth_post_metric_snapshots",
                &snapshot,
            )
            .await?;
            created += 1;
        }
    }
    let run = log_run(
        &state,
        &session,
        "growth.analytics.owned.daily",
        "completed",
        json!({ "queuedPackages": eligible.len(), "source": "mocked-owned-analytics" }),
        json!({ "growth_post_metric_snapshots": created }),
        json!({}),
        None,
    )
    .await?;
    let mut learned = load_state(&state.db, &session.user_id).await?;
    let learned_recipes = learn_recipe_scores(&learned);
    for recipe in &learned_recipes {
        upsert_content_item(
            &state.db,
            &session.user_id,
            "growth_content_recipes",
            recipe,
        )
        .await?;
    }
    learned["contentRecipes"] = json!(learned_recipes);
    Ok(success_json(json!({ "run": run, "state": learned })))
}

async fn run_recipe_scoring(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let mut learned = load_state(&state.db, &session.user_id).await?;
    let recipes = learn_recipe_scores(&learned);
    for recipe in &recipes {
        upsert_content_item(
            &state.db,
            &session.user_id,
            "growth_content_recipes",
            recipe,
        )
        .await?;
    }
    learned["contentRecipes"] = json!(recipes);
    let run = log_run(
        &state,
        &session,
        "growth.recipes.score.manual",
        "completed",
        json!({
            "snapshots": learned.get("metricSnapshots").and_then(Value::as_array).map(Vec::len).unwrap_or(0),
            "videos": learned.get("viralVideos").and_then(Value::as_array).map(Vec::len).unwrap_or(0),
        }),
        json!({}),
        json!({ "growth_content_recipes": learned.get("contentRecipes").and_then(Value::as_array).map(Vec::len).unwrap_or(0) }),
        None,
    )
    .await?;
    Ok(success_json(json!({ "run": run, "state": learned })))
}

async fn run_recommendation_refresh(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let mut learned = load_state(&state.db, &session.user_id).await?;
    let recipes = learn_recipe_scores(&learned);
    for recipe in &recipes {
        upsert_content_item(
            &state.db,
            &session.user_id,
            "growth_content_recipes",
            recipe,
        )
        .await?;
    }
    learned["contentRecipes"] = json!(recipes);
    let run = log_run(
        &state,
        &session,
        "growth.recommendations.refresh.manual",
        "completed",
        json!({ "recipes": learned.get("contentRecipes").and_then(Value::as_array).map(Vec::len).unwrap_or(0) }),
        json!({}),
        json!({ "growth_content_recipes": learned.get("contentRecipes").and_then(Value::as_array).map(Vec::len).unwrap_or(0) }),
        None,
    )
    .await?;
    Ok(success_json(json!({ "run": run, "state": learned })))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn approval_validation_blocks_missing_video() {
        let package = validate_post_package(
            json!({
                "id": "post-1",
                "platformVariants": {
                    "tiktok": { "enabled": true, "title": "Lift", "caption": "Cue", "scheduledAt": "2026-05-15T12:00:00Z" }
                }
            }),
            true,
        );
        assert_eq!(package["approvalState"], json!("blocked"));
        assert!(package["validationErrors"]
            .as_array()
            .unwrap()
            .iter()
            .any(|item| item.as_str().unwrap_or("").contains("vertical video")));
    }

    #[test]
    fn approval_validation_queues_ready_package() {
        let package = validate_post_package(
            json!({
                "id": "post-2",
                "videoFile": "/tmp/reel.mp4",
                "scriptDraft": "Hook\nDemo\nCTA",
                "shotList": [{ "id": "shot-1", "label": "Talking hook", "done": false }],
                "coverTitleVariants": ["Lift cue"],
                "platformVariants": {
                    "tiktok": { "enabled": true, "title": "Lift", "caption": "Cue", "scheduledAt": "2026-05-15T12:00:00Z" },
                    "instagram": { "enabled": false },
                    "youtube": { "enabled": false }
                }
            }),
            true,
        );
        assert_eq!(package["approvalState"], json!("queued"));
        assert!(package.get("approvedAt").and_then(Value::as_str).is_some());
        assert!(package.get("queuedAt").and_then(Value::as_str).is_some());
    }

    #[test]
    fn growth_migrations_cover_local_and_supabase_schema() {
        const LOCAL: &str = include_str!("../../migrations/0028_growth_ops.sql");
        const SUPABASE: &str =
            include_str!("../../../supabase/migrations/20260514000000_growth_ops.sql");
        let required_tables = [
            "growth_creator_watchlist",
            "growth_viral_videos",
            "growth_content_recipes",
            "growth_content_ideas",
            "growth_post_packages",
            "growth_post_metric_snapshots",
            "growth_quarantined_analytics_rows",
            "growth_connector_accounts",
            "growth_agent_runs",
        ];
        for table in required_tables {
            assert!(LOCAL.contains(&format!("CREATE TABLE IF NOT EXISTS {table}")));
            assert!(SUPABASE.contains(&format!("CREATE TABLE IF NOT EXISTS {table}")));
            assert!(SUPABASE.contains(&format!("ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")));
            assert!(SUPABASE.contains("auth.uid() = user_id"));
        }
        for platform in PLATFORMS {
            assert!(LOCAL.contains(platform));
            assert!(SUPABASE.contains(platform));
        }
        for state in POST_STATES {
            assert!(LOCAL.contains(state));
            assert!(SUPABASE.contains(state));
        }
        for state in IDEA_STATES {
            assert!(LOCAL.contains(state));
            assert!(SUPABASE.contains(state));
        }
        for status in CONNECTOR_STATUSES {
            assert!(LOCAL.contains(status));
            assert!(SUPABASE.contains(status));
        }
    }

    #[test]
    fn connector_missing_secrets_are_structured_not_configured() {
        let configured = HashSet::new();
        let statuses = connector_statuses_for("user-1", &configured);
        assert_eq!(statuses.len(), 3);
        for status in statuses {
            assert_eq!(status["status"], json!("not_configured"));
            assert_eq!(status["diagnostics"]["readinessOnly"], json!(true));
            assert_eq!(status["diagnostics"]["tokenStored"], json!(false));
            assert!(status["reason"]
                .as_str()
                .unwrap_or_default()
                .contains("Missing secret service social."));
            assert!(status["requiredScopes"].as_array().unwrap().len() >= 2);
            assert!(status["blockingReason"]
                .as_str()
                .unwrap_or_default()
                .contains("Missing secret service social."));
        }
    }

    #[test]
    fn owned_analytics_learning_attributes_snapshots_to_recipe_platforms() {
        let state = json!({
            "contentRecipes": [{
                "id": "recipe-1",
                "name": "Recipe",
                "topics": ["squat"],
                "baselineScore": 40,
                "expectedUpside": 3,
                "difficulty": 2
            }],
            "contentIdeas": [{ "id": "idea-1", "recipeId": "recipe-1", "title": "squat cue" }],
            "postPackages": [{ "id": "post-1", "ideaId": "idea-1" }],
            "metricSnapshots": [{
                "id": "metric-1",
                "postPackageId": "post-1",
                "ideaId": "idea-1",
                "platform": "tiktok",
                "metrics": { "views": 5000, "likes": 800, "comments": 80, "shares": 200, "saves": 260, "watchRetention": 82, "followerDelta": 40, "leadSignal": 2 }
            }]
        });
        let recipes = learn_recipe_scores(&state);
        assert_eq!(recipes[0]["recommendation"], json!("double-down"));
        assert!(recipes[0]["platformScores"]["tiktok"].as_i64().unwrap_or(0) > 100);
    }

    #[test]
    fn generated_ideas_mark_exactly_three_make_today() {
        let ideas = generated_ideas_from_state(&json!({
            "contentRecipes": [
                { "id": "r1", "name": "High score", "baselineScore": 90, "expectedUpside": 5, "difficulty": 1, "hookFormula": "Stop doing {lift cue}.", "proofType": "demo", "cta": "DM FORM", "topics": ["squat"] },
                { "id": "r2", "name": "Low score", "baselineScore": 20, "expectedUpside": 2, "difficulty": 5, "hookFormula": "Try {lift cue}.", "proofType": "demo", "cta": "Save this", "topics": ["bench"] }
            ],
            "viralVideos": [
                { "topic": "lat pulldown cue", "hook": "This pulldown setup fixed my lats" }
            ]
        }));
        assert_eq!(ideas.len(), 10);
        assert_eq!(
            ideas
                .iter()
                .filter(|idea| idea
                    .get("makeToday")
                    .and_then(Value::as_bool)
                    .unwrap_or(false))
                .count(),
            3
        );
    }
}
