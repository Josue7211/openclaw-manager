use axum::{extract::Query, extract::State, routing::{get, post, patch, delete}, Json, Router};
use serde::Deserialize;
use serde_json::{json, Value};
use std::path::Path;

use crate::error::AppError;
use crate::server::AppState;
use crate::supabase::SupabaseClient;

// ── Router ──────────────────────────────────────────────────────────────────

pub fn router() -> Router<AppState> {
    Router::new()
        // memory
        .route("/memory", get(get_memory))
        // quick-capture
        .route("/quick-capture", post(post_quick_capture))
        // decisions
        .route("/decisions", get(get_decisions).post(post_decision).patch(patch_decision).delete(delete_decision))
        // workflow-notes
        .route("/workflow-notes", get(get_workflow_notes).post(post_workflow_note).patch(patch_workflow_note))
        // ideas
        .route("/ideas", get(get_ideas).post(post_idea).patch(patch_idea))
        // changelog
        .route("/changelog", get(get_changelog).post(post_changelog).delete(delete_changelog))
        // search
        .route("/search", get(get_search))
        // cache
        .route("/cache", get(get_cache))
        .route("/cache-refresh", get(get_cache_refresh).post(post_cache_refresh))
}

// ── GET /api/memory ─────────────────────────────────────────────────────────

async fn get_memory(State(_state): State<AppState>) -> Result<Json<Value>, AppError> {
    // Check for remote OpenClaw API first
    if let Ok(openclaw_url) = std::env::var("OPENCLAW_API_URL") {
        if !openclaw_url.is_empty() {
            let client = reqwest::Client::new();
            let mut req = client.get(format!("{openclaw_url}/memory"));
            if let Ok(key) = std::env::var("OPENCLAW_API_KEY") {
                req = req.header("Authorization", format!("Bearer {key}"));
            }
            match req.send().await {
                Ok(res) if res.status().is_success() => {
                    let body: Value = res.json().await.unwrap_or(json!({ "entries": [] }));
                    return Ok(Json(body));
                }
                _ => return Ok(Json(json!({ "entries": [] }))),
            }
        }
    }

    // Local filesystem mode
    let home = std::env::var("HOME").unwrap_or_default();
    let memory_dir = Path::new(&home).join(".openclaw/workspace/memory");

    if !memory_dir.exists() {
        return Ok(Json(json!({ "entries": [] })));
    }

    let mut files: Vec<String> = Vec::new();
    let mut dir = match tokio::fs::read_dir(&memory_dir).await {
        Ok(d) => d,
        Err(_) => return Ok(Json(json!({ "entries": [] }))),
    };

    while let Ok(Some(entry)) = dir.next_entry().await {
        let name = entry.file_name().to_string_lossy().to_string();
        if name.ends_with(".md") && !name.starts_with('.') {
            files.push(name);
        }
    }

    files.sort();
    files.reverse();
    files.truncate(5);

    let mut entries = Vec::new();
    for file in &files {
        let file_path = memory_dir.join(file);
        let preview = match tokio::fs::read_to_string(&file_path).await {
            Ok(content) => {
                let first_line = content
                    .lines()
                    .find(|l| {
                        let trimmed = l.trim();
                        !trimmed.is_empty() && !trimmed.starts_with('#')
                    })
                    .unwrap_or("");
                first_line.chars().take(120).collect::<String>()
            }
            Err(_) => String::new(),
        };

        let date = file.trim_end_matches(".md");
        entries.push(json!({
            "date": date,
            "preview": preview,
            "path": format!("memory/{file}"),
        }));
    }

    Ok(Json(json!({ "entries": entries })))
}

// ── POST /api/quick-capture ─────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct QuickCaptureBody {
    content: Option<String>,
    #[serde(rename = "type")]
    capture_type: Option<String>,
    source: Option<String>,
}

async fn post_quick_capture(
    State(_state): State<AppState>,
    Json(body): Json<QuickCaptureBody>,
) -> Result<Json<Value>, AppError> {
    let sb = SupabaseClient::from_env()?;

    let content = body.content.as_deref().unwrap_or("").trim().to_string();
    if content.is_empty() {
        return Err(AppError::BadRequest("content is required".into()));
    }

    let valid_types = ["Note", "Task", "Idea", "Decision"];
    let capture_type = body.capture_type.as_deref().unwrap_or("");
    if !valid_types.contains(&capture_type) {
        return Err(AppError::BadRequest(format!(
            "type must be one of: {}",
            valid_types.join(", ")
        )));
    }

    let now = chrono::Utc::now().to_rfc3339();
    let source = body.source.as_deref().unwrap_or("ios-shortcut");

    match capture_type {
        "Task" => {
            let row = sb
                .insert(
                    "todos",
                    json!({ "title": content, "completed": false, "created_at": now }),
                )
                .await?;
            let id = row.get("id").and_then(|v| v.as_i64()).map(|v| v.to_string()).unwrap_or_default();
            Ok(Json(json!({ "ok": true, "id": id })))
        }
        "Idea" => {
            let row = sb
                .insert(
                    "ideas",
                    json!({ "title": content, "status": "pending", "created_at": now }),
                )
                .await?;
            let id = row.get("id").and_then(|v| v.as_i64()).map(|v| v.to_string()).unwrap_or_default();
            Ok(Json(json!({ "ok": true, "id": id })))
        }
        _ => {
            // Note or Decision — try captures table, fall back to todos
            let captures_result = sb
                .insert(
                    "captures",
                    json!({ "title": content, "type": capture_type, "source": source, "created_at": now }),
                )
                .await;

            match captures_result {
                Ok(row) => {
                    let id = row.get("id").and_then(|v| v.as_i64()).map(|v| v.to_string()).unwrap_or_default();
                    Ok(Json(json!({ "ok": true, "id": id })))
                }
                Err(_) => {
                    // Fallback to todos table
                    let row = sb
                        .insert(
                            "todos",
                            json!({
                                "title": format!("[{capture_type}] {content}"),
                                "completed": false,
                                "created_at": now,
                            }),
                        )
                        .await?;
                    let id = row.get("id").and_then(|v| v.as_i64()).map(|v| v.to_string()).unwrap_or_default();
                    Ok(Json(json!({ "ok": true, "id": id })))
                }
            }
        }
    }
}

// ── Decisions ───────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct DecisionsQuery {
    q: Option<String>,
}

async fn get_decisions(
    State(_state): State<AppState>,
    Query(params): Query<DecisionsQuery>,
) -> Result<Json<Value>, AppError> {
    let sb = SupabaseClient::from_env()?;

    let mut query = "select=*&order=created_at.desc".to_string();
    if let Some(q) = &params.q {
        let safe: String = q.chars().filter(|c| *c != ',' && *c != '(' && *c != ')').collect();
        query.push_str(&format!(
            "&or=(title.ilike.%25{safe}%25,decision.ilike.%25{safe}%25,rationale.ilike.%25{safe}%25)"
        ));
    }

    let data = sb.select("decisions", &query).await?;
    Ok(Json(json!({ "decisions": data })))
}

#[derive(Debug, Deserialize)]
struct PostDecisionBody {
    title: Option<String>,
    decision: Option<String>,
    alternatives: Option<String>,
    rationale: Option<String>,
    outcome: Option<String>,
    tags: Option<Value>,
    linked_mission_id: Option<Value>,
}

async fn post_decision(
    State(_state): State<AppState>,
    Json(body): Json<PostDecisionBody>,
) -> Result<Json<Value>, AppError> {
    let sb = SupabaseClient::from_env()?;

    let title = body.title.as_deref().unwrap_or("").trim();
    if title.is_empty() {
        return Err(AppError::BadRequest("title required".into()));
    }
    let decision_text = body.decision.as_deref().unwrap_or("").trim();
    if decision_text.is_empty() {
        return Err(AppError::BadRequest("decision required".into()));
    }
    let rationale = body.rationale.as_deref().unwrap_or("").trim();
    if rationale.is_empty() {
        return Err(AppError::BadRequest("rationale required".into()));
    }

    let data = sb
        .insert(
            "decisions",
            json!({
                "title": title,
                "decision": decision_text,
                "alternatives": body.alternatives.as_deref().map(|s| s.trim()).filter(|s| !s.is_empty()),
                "rationale": rationale,
                "outcome": body.outcome.as_deref().map(|s| s.trim()).filter(|s| !s.is_empty()),
                "tags": body.tags.clone().unwrap_or(json!([])),
                "linked_mission_id": body.linked_mission_id.clone(),
            }),
        )
        .await?;

    Ok(Json(json!({ "decision": data })))
}

#[derive(Debug, Deserialize)]
struct PatchDecisionBody {
    id: Option<Value>,
    title: Option<Value>,
    decision: Option<Value>,
    alternatives: Option<Value>,
    rationale: Option<Value>,
    outcome: Option<Value>,
    tags: Option<Value>,
    linked_mission_id: Option<Value>,
}

async fn patch_decision(
    State(_state): State<AppState>,
    Json(body): Json<PatchDecisionBody>,
) -> Result<Json<Value>, AppError> {
    let sb = SupabaseClient::from_env()?;

    let id = body.id.as_ref().ok_or_else(|| AppError::BadRequest("id required".into()))?;

    let mut update = json!({ "updated_at": chrono::Utc::now().to_rfc3339() });
    let obj = update.as_object_mut().unwrap();
    if let Some(v) = &body.title { obj.insert("title".into(), v.clone()); }
    if let Some(v) = &body.decision { obj.insert("decision".into(), v.clone()); }
    if let Some(v) = &body.alternatives { obj.insert("alternatives".into(), v.clone()); }
    if let Some(v) = &body.rationale { obj.insert("rationale".into(), v.clone()); }
    if let Some(v) = &body.outcome { obj.insert("outcome".into(), v.clone()); }
    if let Some(v) = &body.tags { obj.insert("tags".into(), v.clone()); }
    if let Some(v) = &body.linked_mission_id { obj.insert("linked_mission_id".into(), v.clone()); }

    let data = sb.update("decisions", &format!("id=eq.{id}"), update).await?;
    Ok(Json(json!({ "decision": data })))
}

async fn delete_decision(
    State(_state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, AppError> {
    let sb = SupabaseClient::from_env()?;

    let id = body.get("id").ok_or_else(|| AppError::BadRequest("id required".into()))?;
    sb.delete("decisions", &format!("id=eq.{id}")).await?;
    Ok(Json(json!({ "ok": true })))
}

// ── Workflow Notes ──────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct WorkflowNotesQuery {
    category: Option<String>,
}

async fn get_workflow_notes(
    State(_state): State<AppState>,
    Query(params): Query<WorkflowNotesQuery>,
) -> Result<Json<Value>, AppError> {
    let sb = SupabaseClient::from_env()?;

    let mut query = "select=*&order=created_at.desc".to_string();
    if let Some(cat) = &params.category {
        query.push_str(&format!("&category=eq.{cat}"));
    }

    let data = sb.select("workflow_notes", &query).await?;
    Ok(Json(json!({ "notes": data })))
}

#[derive(Debug, Deserialize)]
struct PostWorkflowNoteBody {
    category: Option<String>,
    note: Option<String>,
}

async fn post_workflow_note(
    State(_state): State<AppState>,
    Json(body): Json<PostWorkflowNoteBody>,
) -> Result<Json<Value>, AppError> {
    let sb = SupabaseClient::from_env()?;

    let category = body.category.as_deref().unwrap_or("");
    let note = body.note.as_deref().unwrap_or("");
    if category.is_empty() || note.is_empty() {
        return Err(AppError::BadRequest("category and note required".into()));
    }

    let data = sb
        .insert("workflow_notes", json!({ "category": category, "note": note }))
        .await?;
    Ok(Json(json!({ "note": data })))
}

#[derive(Debug, Deserialize)]
struct PatchWorkflowNoteBody {
    id: Option<Value>,
    applied: Option<Value>,
}

async fn patch_workflow_note(
    State(_state): State<AppState>,
    Json(body): Json<PatchWorkflowNoteBody>,
) -> Result<Json<Value>, AppError> {
    let sb = SupabaseClient::from_env()?;

    let id = body.id.as_ref().ok_or_else(|| AppError::BadRequest("id required".into()))?;
    let data = sb
        .update("workflow_notes", &format!("id=eq.{id}"), json!({ "applied": body.applied }))
        .await?;
    Ok(Json(json!({ "note": data })))
}

// ── Ideas ───────────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct IdeasQuery {
    status: Option<String>,
}

async fn get_ideas(
    State(_state): State<AppState>,
    Query(params): Query<IdeasQuery>,
) -> Result<Json<Value>, AppError> {
    let sb = SupabaseClient::from_env()?;

    let mut query = "select=*&order=created_at.desc".to_string();
    if let Some(status) = &params.status {
        query.push_str(&format!("&status=eq.{status}"));
    }

    let data = sb.select("ideas", &query).await?;
    Ok(Json(json!({ "ideas": data })))
}

#[derive(Debug, Deserialize)]
struct PostIdeaBody {
    title: Option<String>,
    description: Option<Value>,
    why: Option<Value>,
    effort: Option<Value>,
    impact: Option<Value>,
    category: Option<Value>,
}

async fn post_idea(
    State(_state): State<AppState>,
    Json(body): Json<PostIdeaBody>,
) -> Result<Json<Value>, AppError> {
    let sb = SupabaseClient::from_env()?;

    let title = body.title.as_deref().unwrap_or("").trim();
    if title.is_empty() {
        return Err(AppError::BadRequest("Title required".into()));
    }

    let data = sb
        .insert(
            "ideas",
            json!({
                "title": title,
                "description": body.description,
                "why": body.why,
                "effort": body.effort,
                "impact": body.impact,
                "category": body.category,
                "status": "pending",
            }),
        )
        .await?;

    Ok(Json(json!({ "idea": data })))
}

#[derive(Debug, Deserialize)]
struct PatchIdeaBody {
    id: Option<Value>,
    status: Option<String>,
    mission_id: Option<Value>,
}

async fn patch_idea(
    State(_state): State<AppState>,
    Json(body): Json<PatchIdeaBody>,
) -> Result<Json<Value>, AppError> {
    let sb = SupabaseClient::from_env()?;

    let id = body.id.as_ref().ok_or_else(|| AppError::BadRequest("id required".into()))?;

    let mut update = serde_json::Map::new();
    if let Some(ref s) = body.status {
        update.insert("status".into(), json!(s));
    }
    if let Some(ref m) = body.mission_id {
        update.insert("mission_id".into(), m.clone());
    }

    if update.is_empty() {
        return Err(AppError::BadRequest(
            "At least one field (status or mission_id) must be provided".into(),
        ));
    }

    // If approving, auto-create a mission
    if body.status.as_deref() == Some("approved") {
        let idea_data = sb.select("ideas", &format!("select=*&id=eq.{id}")).await?;
        if let Some(idea) = idea_data.as_array().and_then(|a| a.first()) {
            let idea_title = idea.get("title").and_then(|v| v.as_str()).unwrap_or("Untitled");
            match sb
                .insert(
                    "missions",
                    json!({ "title": idea_title, "assignee": "koda", "status": "pending" }),
                )
                .await
            {
                Ok(mission) => {
                    if let Some(mid) = mission.get("id") {
                        update.insert("mission_id".into(), mid.clone());
                    }
                }
                Err(e) => {
                    tracing::error!("[ideas] Failed to create mission: {e}");
                }
            }
        }
    }

    let data = sb
        .update("ideas", &format!("id=eq.{id}"), Value::Object(update))
        .await?;
    Ok(Json(json!({ "idea": data })))
}

// ── Changelog ───────────────────────────────────────────────────────────────

async fn get_changelog(State(_state): State<AppState>) -> Result<Json<Value>, AppError> {
    let sb = SupabaseClient::from_env()?;
    let data = sb.select("changelog_entries", "select=*&order=date.desc").await?;
    Ok(Json(json!({ "entries": data })))
}

#[derive(Debug, Deserialize)]
struct PostChangelogBody {
    title: Option<String>,
    date: Option<String>,
    description: Option<String>,
    tags: Option<Value>,
}

async fn post_changelog(
    State(_state): State<AppState>,
    Json(body): Json<PostChangelogBody>,
) -> Result<Json<Value>, AppError> {
    let sb = SupabaseClient::from_env()?;

    let title = body.title.as_deref().unwrap_or("").trim();
    if title.is_empty() {
        return Err(AppError::BadRequest("Title required".into()));
    }
    let date = body.date.as_deref().ok_or_else(|| AppError::BadRequest("Date required".into()))?;

    let data = sb
        .insert(
            "changelog_entries",
            json!({
                "title": title,
                "date": date,
                "description": body.description.as_deref().map(|s| s.trim()).unwrap_or(""),
                "tags": body.tags.clone().unwrap_or(json!([])),
            }),
        )
        .await?;

    Ok(Json(json!({ "entry": data })))
}

async fn delete_changelog(
    State(_state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, AppError> {
    let sb = SupabaseClient::from_env()?;
    let id = body.get("id").ok_or_else(|| AppError::BadRequest("id required".into()))?;
    sb.delete("changelog_entries", &format!("id=eq.{id}")).await?;
    Ok(Json(json!({ "ok": true })))
}

// ── Search ──────────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct SearchQuery {
    q: Option<String>,
}

async fn get_search(
    State(_state): State<AppState>,
    Query(params): Query<SearchQuery>,
) -> Result<Json<Value>, AppError> {
    let q = params.q.as_deref().unwrap_or("").trim().to_string();

    if q.is_empty() {
        return Ok(Json(json!({
            "todos": [],
            "missions": [],
        })));
    }

    let sb = SupabaseClient::from_env()?;
    let pattern = format!("%25{q}%25");

    // Search todos and missions in parallel
    let todos_query = format!("select=id,text,done,created_at&text=ilike.{pattern}&limit=20");
    let missions_query = format!("select=id,title,status,created_at&title=ilike.{pattern}&limit=20");
    let (todos_result, missions_result) = tokio::join!(
        sb.select("todos", &todos_query),
        sb.select("missions", &missions_query),
    );

    let todos = todos_result.unwrap_or(json!([]));
    let missions = missions_result.unwrap_or(json!([]));

    Ok(Json(json!({
        "todos": todos,
        "missions": missions,
    })))
}

// ── Cache ───────────────────────────────────────────────────────────────────

async fn get_cache(State(_state): State<AppState>) -> Result<Json<Value>, AppError> {
    let sb = SupabaseClient::from_env()?;
    let data = sb.select("cache", "select=*").await?;

    let mut result = serde_json::Map::new();
    if let Some(rows) = data.as_array() {
        for row in rows {
            if let (Some(key), Some(value)) = (
                row.get("key").and_then(|k| k.as_str()),
                row.get("value"),
            ) {
                result.insert(key.to_string(), value.clone());
            }
        }
    }

    Ok(Json(Value::Object(result)))
}

async fn get_cache_refresh(State(_state): State<AppState>) -> Result<Json<Value>, AppError> {
    let sb = SupabaseClient::from_env()?;
    let data = sb.select("cache", "select=*").await?;
    Ok(Json(json!({ "rows": data })))
}

async fn post_cache_refresh(State(_state): State<AppState>) -> Result<Json<Value>, AppError> {
    // In the Tauri desktop context, cache refresh fetches from the local Axum
    // server's own endpoints and upserts the results into Supabase.
    // For now, this is a stub — the frontend can orchestrate cache refreshes
    // by calling individual endpoints and posting results.
    let sb = SupabaseClient::from_env()?;

    let cache_keys = ["status", "heartbeat", "sessions", "subagents", "agents"];
    let client = reqwest::Client::new();
    let base = "http://127.0.0.1:3000";

    let mut ok_count = 0u32;
    let total = cache_keys.len() as u32;

    let futures: Vec<_> = cache_keys
        .iter()
        .map(|key| {
            let client = client.clone();
            let url = format!("{base}/api/{key}");
            let sb_ref = &sb;
            async move {
                let res = match client.get(&url).send().await {
                    Ok(r) if r.status().is_success() => r,
                    _ => return false,
                };
                let value: Value = match res.json().await {
                    Ok(v) => v,
                    Err(_) => return false,
                };
                let now = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true);
                let _ = sb_ref
                    .upsert(
                        "cache",
                        json!({ "key": key, "value": value, "updated_at": now }),
                    )
                    .await;
                true
            }
        })
        .collect();

    let results = futures::future::join_all(futures).await;
    for success in results {
        if success {
            ok_count += 1;
        }
    }

    Ok(Json(json!({ "ok": ok_count, "total": total })))
}
