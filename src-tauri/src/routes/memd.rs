use axum::{
    extract::{Query, State},
    routing::{get, post},
    Json, Router,
};
use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::{sqlite::SqliteRow, FromRow, Row};
use std::path::PathBuf;
use std::time::{Duration, Instant};

use crate::error::{success_json, AppError};
use crate::server::{AppState, RequireAuth};
use crate::validation::{sanitize_postgrest_value, validate_uuid};

type ScopeRow = (String, String, String, String, String, i64, String, String);
type ScopeCountRow = (
    String,
    String,
    String,
    String,
    String,
    i64,
    String,
    String,
    i64,
);
type AuditRow = (
    String,
    String,
    String,
    Option<String>,
    Option<String>,
    String,
    String,
);

#[derive(Clone, Debug, Deserialize)]
struct ScopeInput {
    kind: String,
    name: String,
    description: Option<String>,
}

#[derive(Debug, Deserialize)]
struct QueryBody {
    query: Option<String>,
    limit: Option<i64>,
    scope: Option<ScopeInput>,
    kinds: Option<Vec<String>>,
    statuses: Option<Vec<String>>,
    stages: Option<Vec<String>>,
    #[serde(rename = "sourceAgent")]
    source_agent: Option<String>,
    #[serde(rename = "includeArchived")]
    include_archived: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct OperationPlanBody {
    action: String,
    target: Option<String>,
    reason: Option<String>,
}

#[derive(Debug, Deserialize)]
struct UpsertBody {
    id: Option<String>,
    scope: Option<ScopeInput>,
    kind: Option<String>,
    title: Option<String>,
    content: Option<String>,
    summary: Option<String>,
    source: Option<String>,
    confidence: Option<i64>,
    priority: Option<i64>,
    #[serde(rename = "retentionDays")]
    retention_days: Option<i64>,
    metadata: Option<Value>,
}

#[derive(Debug, Deserialize)]
struct ArchiveBody {
    ids: Vec<String>,
    scope: Option<ScopeInput>,
    reason: Option<String>,
}

#[derive(Debug, Deserialize)]
struct CompactBody {
    scope: Option<ScopeInput>,
    #[serde(rename = "keepLatest")]
    keep_latest: Option<i64>,
    #[serde(rename = "maxAgeDays")]
    max_age_days: Option<i64>,
}

#[derive(Debug, Deserialize)]
struct AuditQuery {
    #[serde(rename = "scopeId")]
    scope_id: Option<String>,
    limit: Option<i64>,
}

#[derive(Clone)]
struct MemdScopeRecord {
    id: String,
    user_id: String,
    kind: String,
    name: String,
    description: String,
    is_default: bool,
    created_at: String,
    updated_at: String,
}

#[derive(Clone)]
struct MemdEntryRecord {
    id: String,
    scope_id: String,
    scope_kind: String,
    scope_name: String,
    scope_description: String,
    kind: String,
    title: String,
    content: String,
    summary: String,
    source: String,
    confidence: i64,
    priority: i64,
    retention_days: i64,
    version: i64,
    status: String,
    metadata: String,
    created_at: String,
    updated_at: String,
    archived_at: Option<String>,
}

impl<'r> FromRow<'r, SqliteRow> for MemdEntryRecord {
    fn from_row(row: &'r SqliteRow) -> Result<Self, sqlx::Error> {
        Ok(Self {
            id: row.try_get("id")?,
            scope_id: row.try_get("scope_id")?,
            scope_kind: row.try_get("scope_kind")?,
            scope_name: row.try_get("scope_name")?,
            scope_description: row.try_get("scope_description")?,
            kind: row.try_get("kind")?,
            title: row.try_get("title")?,
            content: row.try_get("content")?,
            summary: row.try_get("summary")?,
            source: row.try_get("source")?,
            confidence: row.try_get("confidence")?,
            priority: row.try_get("priority")?,
            retention_days: row.try_get("retention_days")?,
            version: row.try_get("version")?,
            status: row.try_get("status")?,
            metadata: row.try_get("metadata")?,
            created_at: row.try_get("created_at")?,
            updated_at: row.try_get("updated_at")?,
            archived_at: row.try_get("archived_at")?,
        })
    }
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/authority", get(authority_memo))
        .route("/health", get(health_memo))
        .route("/query", post(query_memo))
        .route("/operations/plan", post(plan_operation))
        .route("/upsert", post(upsert_memo))
        .route("/archive", post(archive_memo))
        .route("/compact", post(compact_memo))
        .route("/scopes", get(list_scopes))
        .route("/audit", get(list_audit))
}

fn default_scope() -> ScopeInput {
    ScopeInput {
        kind: "user".to_string(),
        name: "brain".to_string(),
        description: Some("Default brain scope".to_string()),
    }
}

fn scope_to_json(scope: &MemdScopeRecord, entry_count: Option<i64>) -> Value {
    json!({
        "id": scope.id,
        "userId": scope.user_id,
        "kind": scope.kind,
        "name": scope.name,
        "description": scope.description,
        "isDefault": scope.is_default,
        "createdAt": scope.created_at,
        "updatedAt": scope.updated_at,
        "entryCount": entry_count,
    })
}

fn entry_to_json(entry: &MemdEntryRecord, score: i64) -> Value {
    let metadata = serde_json::from_str::<Value>(&entry.metadata).unwrap_or_else(|_| json!({}));
    json!({
        "id": entry.id,
        "scope": {
            "id": entry.scope_id,
            "kind": entry.scope_kind,
            "name": entry.scope_name,
            "description": entry.scope_description,
        },
        "kind": entry.kind,
        "title": entry.title,
        "content": entry.content,
        "summary": entry.summary,
        "source": entry.source,
        "confidence": entry.confidence,
        "priority": entry.priority,
        "retentionDays": entry.retention_days,
        "version": entry.version,
        "status": entry.status,
        "metadata": metadata,
        "createdAt": entry.created_at,
        "updatedAt": entry.updated_at,
        "archivedAt": entry.archived_at,
        "name": entry.title,
        "path": format!("memd/{}/{}/{}", entry.scope_kind, entry.scope_name, entry.id),
        "snippet": if entry.summary.trim().is_empty() {
            entry.content.chars().take(160).collect::<String>()
        } else {
            entry.summary.clone()
        },
        "score": score,
    })
}

fn audit_to_json(row: &AuditRow) -> Value {
    json!({
        "id": row.0,
        "userId": row.1,
        "action": row.2,
        "scopeId": row.3,
        "entryId": row.4,
        "details": serde_json::from_str::<Value>(&row.5).unwrap_or_else(|_| json!({})),
        "createdAt": row.6,
    })
}

fn normalize_limit(limit: Option<i64>, default: i64, max: i64) -> i64 {
    limit.unwrap_or(default).clamp(1, max)
}

fn sanitize_scope_component(input: &str, field: &str) -> Result<String, AppError> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err(AppError::BadRequest(format!("{field} required")));
    }
    Ok(sanitize_postgrest_value(trimmed)?.to_string())
}

fn optional_trimmed(input: Option<&str>, max_len: usize) -> Option<String> {
    input
        .map(|v| v.trim())
        .filter(|v| !v.is_empty())
        .map(|v| v.chars().take(max_len).collect::<String>())
}

async fn ensure_scope(
    db: &sqlx::SqlitePool,
    user_id: &str,
    scope: Option<&ScopeInput>,
) -> Result<MemdScopeRecord, AppError> {
    let is_default_scope = scope.is_none();
    let scope = scope.cloned().unwrap_or_else(default_scope);
    let kind = sanitize_scope_component(&scope.kind, "scope.kind")?;
    let name = sanitize_scope_component(&scope.name, "scope.name")?;
    let description = optional_trimmed(scope.description.as_deref(), 255).unwrap_or_default();

    if let Some(row) = sqlx::query_as::<_, ScopeRow>(
        "SELECT id, user_id, scope_kind, scope_name, description, is_default, created_at, updated_at \
         FROM memd_scopes WHERE user_id = ? AND scope_kind = ? AND scope_name = ?",
    )
    .bind(user_id)
    .bind(&kind)
    .bind(&name)
    .fetch_optional(db)
    .await?
    {
        return Ok(MemdScopeRecord {
            id: row.0,
            user_id: row.1,
            kind: row.2,
            name: row.3,
            description: row.4,
            is_default: row.5 != 0,
            created_at: row.6,
            updated_at: row.7,
        });
    }

    let id = crate::routes::util::random_uuid();
    let now = chrono::Utc::now().to_rfc3339();
    let is_default = i64::from(is_default_scope || (kind == "user" && name == "brain"));

    // Avoid uniqueness races (another request might create the same scope concurrently).
    // If the scope already exists, we update the description/updated_at but keep its original id.
    sqlx::query(
        "INSERT INTO memd_scopes \
         (id, user_id, scope_kind, scope_name, description, is_default, created_at, updated_at) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?) \
         ON CONFLICT(user_id, scope_kind, scope_name) DO UPDATE SET \
           description = excluded.description, \
           is_default = excluded.is_default, \
           updated_at = excluded.updated_at",
    )
    .bind(&id)
    .bind(user_id)
    .bind(&kind)
    .bind(&name)
    .bind(&description)
    .bind(is_default)
    .bind(&now)
    .bind(&now)
    .execute(db)
    .await?;

    // Re-fetch to return the canonical scope row (especially important on conflict).
    let row = sqlx::query_as::<_, ScopeRow>(
        "SELECT id, user_id, scope_kind, scope_name, description, is_default, created_at, updated_at \
         FROM memd_scopes WHERE user_id = ? AND scope_kind = ? AND scope_name = ?",
    )
    .bind(user_id)
    .bind(&kind)
    .bind(&name)
    .fetch_one(db)
    .await?;

    Ok(MemdScopeRecord {
        id: row.0,
        user_id: row.1,
        kind: row.2,
        name: row.3,
        description: row.4,
        is_default: row.5 != 0,
        created_at: row.6,
        updated_at: row.7,
    })
}

async fn query_entry_rows(
    db: &sqlx::SqlitePool,
    user_id: &str,
    scope_id: Option<&str>,
    include_archived: bool,
    limit: i64,
) -> Result<Vec<MemdEntryRecord>, AppError> {
    let rows: Vec<MemdEntryRecord> = if let Some(scope_id) = scope_id {
        if include_archived {
            sqlx::query_as(
                "SELECT e.id, e.scope_id, s.scope_kind, s.scope_name, s.description as scope_description, \
                 e.kind, e.title, e.content, e.summary, e.source, e.confidence, e.priority, \
                 e.retention_days, e.version, e.status, e.metadata, e.created_at, e.updated_at, e.archived_at \
                 FROM memd_entries e \
                 JOIN memd_scopes s ON s.id = e.scope_id AND s.user_id = e.user_id \
                 WHERE e.user_id = ? AND e.scope_id = ? \
                 ORDER BY e.priority DESC, e.updated_at DESC \
                 LIMIT ?",
            )
            .bind(user_id)
            .bind(scope_id)
            .bind(limit)
            .fetch_all(db)
            .await?
        } else {
            sqlx::query_as(
                "SELECT e.id, e.scope_id, s.scope_kind, s.scope_name, s.description as scope_description, \
                 e.kind, e.title, e.content, e.summary, e.source, e.confidence, e.priority, \
                 e.retention_days, e.version, e.status, e.metadata, e.created_at, e.updated_at, e.archived_at \
                 FROM memd_entries e \
                 JOIN memd_scopes s ON s.id = e.scope_id AND s.user_id = e.user_id \
                 WHERE e.user_id = ? AND e.scope_id = ? AND e.status = 'active' \
                 ORDER BY e.priority DESC, e.updated_at DESC \
                 LIMIT ?",
            )
            .bind(user_id)
            .bind(scope_id)
            .bind(limit)
            .fetch_all(db)
            .await?
        }
    } else if include_archived {
        sqlx::query_as(
            "SELECT e.id, e.scope_id, s.scope_kind, s.scope_name, s.description as scope_description, \
             e.kind, e.title, e.content, e.summary, e.source, e.confidence, e.priority, \
             e.retention_days, e.version, e.status, e.metadata, e.created_at, e.updated_at, e.archived_at \
             FROM memd_entries e \
             JOIN memd_scopes s ON s.id = e.scope_id AND s.user_id = e.user_id \
             WHERE e.user_id = ? \
             ORDER BY e.priority DESC, e.updated_at DESC \
             LIMIT ?",
        )
        .bind(user_id)
        .bind(limit)
        .fetch_all(db)
        .await?
    } else {
        sqlx::query_as(
            "SELECT e.id, e.scope_id, s.scope_kind, s.scope_name, s.description as scope_description, \
             e.kind, e.title, e.content, e.summary, e.source, e.confidence, e.priority, \
             e.retention_days, e.version, e.status, e.metadata, e.created_at, e.updated_at, e.archived_at \
             FROM memd_entries e \
             JOIN memd_scopes s ON s.id = e.scope_id AND s.user_id = e.user_id \
             WHERE e.user_id = ? AND e.status = 'active' \
             ORDER BY e.priority DESC, e.updated_at DESC \
             LIMIT ?",
        )
        .bind(user_id)
        .bind(limit)
        .fetch_all(db)
        .await?
    };

    Ok(rows)
}

async fn insert_audit(
    db: &sqlx::SqlitePool,
    user_id: &str,
    action: &str,
    scope_id: Option<&str>,
    entry_id: Option<&str>,
    details: Value,
) -> Result<(), AppError> {
    let id = crate::routes::util::random_uuid();
    let now = chrono::Utc::now().to_rfc3339();
    sqlx::query(
        "INSERT INTO memd_audit (id, user_id, action, scope_id, entry_id, details, created_at) \
         VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(user_id)
    .bind(action)
    .bind(scope_id)
    .bind(entry_id)
    .bind(details.to_string())
    .bind(&now)
    .execute(db)
    .await?;
    Ok(())
}

async fn query_memo(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Json(body): Json<QueryBody>,
) -> Result<Json<Value>, AppError> {
    if let Some(response) = query_remote_memd(&state, &body).await? {
        return Ok(response);
    }
    if let Some(response) = query_bundle_memd(&body)? {
        return Ok(response);
    }

    let scope = ensure_scope(&state.db, &session.user_id, body.scope.as_ref()).await?;
    let limit = normalize_limit(body.limit, 10, 100);
    let mut entries = query_entry_rows(
        &state.db,
        &session.user_id,
        Some(&scope.id),
        body.include_archived.unwrap_or(false),
        limit.saturating_mul(5),
    )
    .await?;

    let needle = body
        .query
        .as_deref()
        .unwrap_or_default()
        .trim()
        .to_lowercase();

    let mut scored: Vec<(i64, MemdEntryRecord)> = entries
        .drain(..)
        .filter_map(|entry| {
            if needle.is_empty() {
                return Some((entry.priority.max(0), entry));
            }

            let haystack = format!(
                "{} {} {} {}",
                entry.title, entry.summary, entry.content, entry.scope_name
            )
            .to_lowercase();
            if !haystack.contains(&needle) {
                return None;
            }

            let mut score = entry.priority.max(0) + entry.confidence.max(0) / 10;
            if entry.title.to_lowercase().contains(&needle) {
                score += 30;
            }
            if entry.summary.to_lowercase().contains(&needle) {
                score += 20;
            }
            if entry.content.to_lowercase().contains(&needle) {
                score += 10;
            }
            if entry.kind.to_lowercase().contains(&needle) {
                score += 5;
            }
            Some((score, entry))
        })
        .collect();

    scored.sort_by(|a, b| {
        b.0.cmp(&a.0)
            .then_with(|| b.1.priority.cmp(&a.1.priority))
            .then_with(|| b.1.updated_at.cmp(&a.1.updated_at))
    });

    let entries: Vec<Value> = scored
        .into_iter()
        .take(limit as usize)
        .map(|(score, entry)| entry_to_json(&entry, score))
        .collect();

    insert_audit(
        &state.db,
        &session.user_id,
        "query",
        Some(&scope.id),
        None,
        json!({
            "query": body.query,
            "limit": limit,
            "includeArchived": body.include_archived.unwrap_or(false),
            "resultCount": entries.len(),
        }),
    )
    .await?;

    Ok(success_json(json!({
        "scope": scope_to_json(&scope, None),
        "entries": entries,
    })))
}

fn read_dev_env_value(key: &str) -> Option<String> {
    for path in [".env.local", "../.env.local"] {
        let Ok(iter) = dotenvy::from_filename_iter(path) else {
            continue;
        };
        for item in iter.flatten() {
            if item.0 == key && !item.1.trim().is_empty() {
                return Some(item.1);
            }
        }
    }
    None
}

fn current_project_root() -> Option<PathBuf> {
    let mut dir = std::env::current_dir().ok()?;
    loop {
        if dir.join(".memd").is_dir() || dir.join("AGENTS.md").is_file() {
            return Some(dir);
        }
        if !dir.pop() {
            return None;
        }
    }
}

fn read_memd_env_value(key: &str) -> Option<String> {
    let root = current_project_root()?;
    let env_path = root.join(".memd/env");
    let Ok(iter) = dotenvy::from_path_iter(env_path) else {
        return None;
    };
    for item in iter.flatten() {
        if item.0 == key && !item.1.trim().is_empty() {
            return Some(item.1);
        }
    }
    None
}

fn read_memd_config_base_url() -> Option<String> {
    let root = current_project_root()?;
    let config_path = root.join(".memd/config.json");
    let content = std::fs::read_to_string(config_path).ok()?;
    let config: Value = serde_json::from_str(&content).ok()?;
    config
        .get("base_url")
        .or_else(|| {
            config
                .get("authority_state")
                .and_then(|authority| authority.get("shared_base_url"))
        })
        .and_then(Value::as_str)
        .map(str::to_string)
}

fn memd_base_url(state: &AppState) -> Option<String> {
    read_memd_env_value("MEMD_BASE_URL")
        .or_else(read_memd_config_base_url)
        .or_else(|| state.secret("MEMD_BASE_URL"))
        .or_else(|| dotenvy::var("MEMD_BASE_URL").ok())
        .or_else(|| read_dev_env_value("MEMD_BASE_URL"))
        .map(|value| value.trim().trim_end_matches('/').to_string())
        .filter(|value| !value.is_empty())
}

fn local_bundle_memory_count() -> Option<usize> {
    let root = current_project_root()?;
    let raw_spine = root.join(".memd/state/raw-spine.jsonl");
    let content = std::fs::read_to_string(raw_spine).ok()?;
    Some(
        content
            .lines()
            .filter(|line| !line.trim().is_empty())
            .count(),
    )
}

async fn fetch_memd_health_payload(
    state: &AppState,
    base_url: &str,
) -> Result<(Value, u64), String> {
    let started = Instant::now();
    let response = state
        .http
        .get(format!("{base_url}/healthz"))
        .timeout(Duration::from_secs(5))
        .send()
        .await;
    let latency_ms = started.elapsed().as_millis() as u64;
    let response = response.map_err(|error| error.to_string())?;
    if !response.status().is_success() {
        return Err(format!("memd server returned {}", response.status()));
    }
    let payload: Value = response.json().await.map_err(|error| error.to_string())?;
    Ok((payload, latency_ms))
}

fn memd_expected_min_items(state: &AppState) -> Option<u64> {
    read_memd_env_value("MEMD_EXPECTED_MIN_ITEMS")
        .or_else(|| state.secret("MEMD_EXPECTED_MIN_ITEMS"))
        .or_else(|| dotenvy::var("MEMD_EXPECTED_MIN_ITEMS").ok())
        .or_else(|| read_dev_env_value("MEMD_EXPECTED_MIN_ITEMS"))
        .and_then(|value| value.trim().parse::<u64>().ok())
}

fn memd_authority_token(state: &AppState) -> Option<String> {
    read_memd_env_value("MEMD_AUTHORITY_TOKEN")
        .or_else(|| state.secret("MEMD_AUTHORITY_TOKEN"))
        .or_else(|| dotenvy::var("MEMD_AUTHORITY_TOKEN").ok())
        .or_else(|| read_dev_env_value("MEMD_AUTHORITY_TOKEN"))
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn pressure_count(pressure: &Value, key: &str) -> u64 {
    pressure.get(key).and_then(Value::as_u64).unwrap_or(0)
}

fn memory_operation_contract(action: &str, target: Option<&str>, reason: Option<&str>) -> Value {
    let target = target.unwrap_or("clawcontrol-memd");
    let reason = reason.unwrap_or("Memory authority operation requested from ClawControl");
    let (label, risk, approval, agent_action, capabilities): (&str, &str, bool, &str, Vec<&str>) =
        match action {
            "health.check" => (
                "Check memd health",
                "low",
                false,
                "memd.health.check",
                vec![],
            ),
            "backup.create" => (
                "Create memd backup",
                "medium",
                true,
                "memd.backup.create",
                vec!["agentsecrets:memd:backup"],
            ),
            "container.restart" => (
                "Restart memd container",
                "medium",
                true,
                "portainer.container.restart",
                vec!["agentsecrets:portainer:write"],
            ),
            "container.recreate" => (
                "Recreate memd stack",
                "high",
                true,
                "portainer.stack.redeploy",
                vec!["agentsecrets:portainer:write", "agentsecrets:memd:backup"],
            ),
            "import.sync" => (
                "Import/sync memory archive",
                "high",
                true,
                "memd.import.sync",
                vec!["agentsecrets:memd:write", "agentsecrets:ssh:desktop"],
            ),
            "db.restore" => (
                "Restore memd database",
                "critical",
                true,
                "memd.db.restore",
                vec!["agentsecrets:memd:restore", "agentsecrets:memd:backup"],
            ),
            _ => (
                "Unknown memory operation",
                "blocked",
                true,
                "memd.operation.unknown",
                vec![],
            ),
        };

    json!({
        "action": action,
        "label": label,
        "target": target,
        "reason": reason,
        "risk": risk,
        "requiresApproval": approval,
        "allowed": action != "unknown" && risk != "blocked",
        "agentShell": {
            "action": agent_action,
            "target": target,
            "dryRunFirst": true,
        },
        "agentSecrets": {
            "capabilities": capabilities,
        },
        "guardrails": [
            "never mutate Docker/Portainer from the renderer",
            "take or verify a backup before high-risk work",
            "route secret use through AgentSecrets",
            "route host/container work through AgentShell",
            "require local approval for destructive or externally visible changes"
        ],
    })
}

async fn plan_operation(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Json(body): Json<OperationPlanBody>,
) -> Result<Json<Value>, AppError> {
    let agent_shell = crate::routes::agent_shell_support::health(&state)
        .await
        .map(|response| response.0)
        .unwrap_or_else(|error| json!({ "ok": false, "error": format!("{error:?}") }));
    let secrets = crate::routes::secret_broker_support::health_status(&state).await;
    Ok(success_json(json!({
        "plan": memory_operation_contract(&body.action, body.target.as_deref(), body.reason.as_deref()),
        "safety": {
            "agentShell": agent_shell,
            "agentSecrets": secrets,
        },
    })))
}

async fn authority_memo(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let base_url = memd_base_url(&state);
    let checked_at = chrono::Utc::now().to_rfc3339();
    let local_count = local_bundle_memory_count().unwrap_or(0);
    let expected_min_items = memd_expected_min_items(&state);
    let authority_token_configured = memd_authority_token(&state).is_some();
    let mut warnings = Vec::new();
    let agent_shell = crate::routes::agent_shell_support::health(&state)
        .await
        .map(|response| response.0)
        .unwrap_or_else(|error| json!({ "ok": false, "error": format!("{error:?}") }));
    let secrets = crate::routes::secret_broker_support::health_status(&state).await;

    let Some(base_url) = base_url else {
        warnings.push(json!({
            "severity": "error",
            "code": "memd_base_url_missing",
            "message": "MEMD_BASE_URL is not configured, so ClawControl is using only the local bundle fallback.",
            "action": "configure MEMD_BASE_URL through memd/AgentSecrets before treating this as source of truth"
        }));
        return Ok(success_json(json!({
            "checkedAt": checked_at,
            "source": "memd-bundle",
            "baseUrl": null,
            "ok": local_count > 0,
            "health": {
                "remoteHealthy": false,
                "itemCount": local_count,
                "localItemCount": local_count,
            },
            "counts": {
                "total": local_count,
                "active": local_count,
                "stale": 0,
                "expired": 0,
                "candidates": 0,
                "sampleSize": 0,
                "partial": true,
            },
            "owner": {
                "mode": "fallback",
                "active": "local_bundle",
                "verified": false,
            },
            "authoritySearch": {
                "mode": "unavailable",
                "configured": authority_token_configured,
                "tokenRequired": true,
                "endpoint": "/memory/authority/search",
            },
            "safety": {
                "agentShell": agent_shell,
                "agentSecrets": secrets,
            },
            "operations": [
                memory_operation_contract("health.check", None, None),
                memory_operation_contract("backup.create", None, None),
                memory_operation_contract("import.sync", None, None),
                memory_operation_contract("container.restart", None, None),
                memory_operation_contract("container.recreate", None, None),
                memory_operation_contract("db.restore", None, None)
            ],
            "warnings": warnings,
        })));
    };

    let health_result = fetch_memd_health_payload(&state, &base_url).await;
    let (health_payload, latency_ms, remote_healthy) = match health_result {
        Ok((payload, latency_ms)) => (payload, latency_ms, true),
        Err(error) => {
            warnings.push(json!({
                "severity": "error",
                "code": "memd_unreachable",
                "message": error,
                "action": "check Portainer stack, Docker network, and AgentShell host access"
            }));
            (json!({}), 0, false)
        }
    };

    let item_count = health_payload
        .get("items")
        .and_then(Value::as_u64)
        .unwrap_or(local_count as u64);
    let pressure = health_payload
        .get("pressure")
        .cloned()
        .unwrap_or_else(|| json!({}));
    let expired = pressure_count(&pressure, "expired");
    let stale = pressure_count(&pressure, "stale");
    let candidates = pressure_count(&pressure, "candidates");
    let active = item_count.saturating_sub(expired).saturating_sub(stale);

    if let Some(floor) = expected_min_items {
        if item_count < floor {
            warnings.push(json!({
                "severity": "error",
                "code": "memd_count_below_floor",
                "message": format!("memd reports {item_count} items, below expected floor {floor}."),
                "action": "hold destructive actions; verify backup/sync before repair"
            }));
        }
    }

    if expired > 0 {
        warnings.push(json!({
            "severity": "info",
            "code": "expired_rows_present",
            "message": format!("{expired} expired rows exist; these are memory logs/status history, not active memories."),
            "action": "use the Logs view to inspect them"
        }));
    }

    if health_payload
        .get("rag")
        .and_then(|rag| rag.get("reachable"))
        .and_then(Value::as_bool)
        == Some(false)
    {
        warnings.push(json!({
            "severity": "warning",
            "code": "rag_unreachable",
            "message": "RAG sidecar is not reachable from memd.",
            "action": "verify clawcontrol-memd-rag in Portainer before semantic search work"
        }));
    }

    if health_payload
        .get("atlas")
        .and_then(|atlas| atlas.get("dormant"))
        .and_then(Value::as_bool)
        == Some(true)
    {
        warnings.push(json!({
            "severity": "info",
            "code": "atlas_dormant",
            "message": "Atlas is dormant by design right now.",
            "action": "no action unless graph/atlas features are expected"
        }));
    }

    warnings.push(json!({
        "severity": "info",
        "code": "owner_probe_required",
        "message": "The renderer can verify memd health, but Docker/Portainer ownership must be inspected through AgentShell/AgentSecrets.",
        "action": "use the operation contract when container changes are needed"
    }));

    let source_inventory = query_remote_memd_sources(&state, &base_url)
        .await
        .unwrap_or_default();
    let ownerless_private_count: u64 = source_inventory
        .iter()
        .filter(|source| source.get("source_agent").is_none_or(Value::is_null))
        .filter(|source| {
            source
                .get("visibility")
                .and_then(Value::as_str)
                .is_none_or(|visibility| visibility == "private")
        })
        .map(|source| {
            source
                .get("item_count")
                .and_then(Value::as_u64)
                .unwrap_or(0)
        })
        .sum();
    if ownerless_private_count > 0 {
        warnings.push(json!({
            "severity": "warning",
            "code": "ownerless_private_rows_need_memd_authority",
            "message": format!("{ownerless_private_count} private rows have no source_agent, so normal memd search will not return their content."),
            "action": "add a Docker-side memd authority/inventory endpoint or backfill source_agent ownership before full content sync"
        }));
    }
    if ownerless_private_count > 0 && !authority_token_configured {
        warnings.push(json!({
            "severity": "warning",
            "code": "memd_authority_token_missing",
            "message": "MEMD_AUTHORITY_TOKEN is not configured in ClawControl, so the guarded memd authority endpoint cannot be used yet.",
            "action": "store the token through AgentSecrets/.memd env after the Docker image is redeployed with MEMD_AUTHORITY_SEARCH=1"
        }));
    }

    Ok(success_json(json!({
        "checkedAt": checked_at,
        "source": if remote_healthy { "memd-server" } else { "memd-bundle" },
        "baseUrl": base_url,
        "ok": remote_healthy,
        "health": {
            "status": health_payload.get("status").and_then(Value::as_str).unwrap_or(if remote_healthy { "ok" } else { "error" }),
            "remoteHealthy": remote_healthy,
            "itemCount": item_count,
            "localItemCount": local_count,
            "pressure": pressure,
            "rag": health_payload.get("rag").cloned().unwrap_or(Value::Null),
            "atlas": health_payload.get("atlas").cloned().unwrap_or(Value::Null),
            "latencyMs": latency_ms,
        },
        "counts": {
            "total": item_count,
            "active": active,
            "stale": stale,
            "expired": expired,
            "candidates": candidates,
            "sampleSize": 0,
            "partial": true,
            "byKindSample": {},
            "byStatusSample": {},
            "byStageSample": {},
            "byProjectSample": {},
            "byNamespaceSample": {},
            "sourceInventorySize": source_inventory.len(),
            "ownerlessPrivate": ownerless_private_count,
        },
        "owner": {
            "mode": "docker_expected",
            "active": if remote_healthy { "docker_memd_server" } else { "unknown" },
            "verified": false,
            "portainerRequired": true,
            "containers": [
                { "name": "clawcontrol-memd", "role": "server", "port": 8787, "status": if remote_healthy { "reachable" } else { "unknown" } },
                { "name": "clawcontrol-memd-rag", "role": "rag-sidecar", "port": 9000, "status": health_payload.get("rag").and_then(|rag| rag.get("reachable")).and_then(Value::as_bool).map(|ok| if ok { "reachable" } else { "unreachable" }).unwrap_or("unknown") }
            ],
            "systemd": { "service": "memd-server.service", "expected": "inactive_disabled", "status": "not_observable_from_renderer" }
        },
        "authoritySearch": {
            "mode": "token_gated",
            "configured": authority_token_configured,
            "tokenRequired": true,
            "endpoint": "/memory/authority/search",
            "usedForInventory": authority_token_configured,
        },
        "safety": {
            "agentShell": agent_shell,
            "agentSecrets": secrets,
        },
        "operations": [
            memory_operation_contract("health.check", None, None),
            memory_operation_contract("backup.create", None, None),
            memory_operation_contract("import.sync", None, None),
            memory_operation_contract("container.restart", None, None),
            memory_operation_contract("container.recreate", None, None),
            memory_operation_contract("db.restore", None, None)
        ],
        "warnings": warnings,
    })))
}

async fn health_memo(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let base_url = memd_base_url(&state);
    let checked_at = chrono::Utc::now().to_rfc3339();
    let local_count = local_bundle_memory_count().unwrap_or(0);

    let Some(base_url) = base_url else {
        return Ok(success_json(json!({
            "source": "memd-bundle",
            "status": if local_count > 0 { "fallback" } else { "missing" },
            "baseUrl": null,
            "remoteHealthy": false,
            "itemCount": local_count,
            "localItemCount": local_count,
            "checkedAt": checked_at,
        })));
    };

    match fetch_memd_health_payload(&state, &base_url).await {
        Ok((payload, latency_ms)) => Ok(success_json(json!({
            "source": "memd-server",
            "status": payload.get("status").and_then(Value::as_str).unwrap_or("ok"),
            "baseUrl": base_url,
            "remoteHealthy": true,
            "itemCount": payload.get("items").and_then(Value::as_u64).unwrap_or(local_count as u64),
            "localItemCount": local_count,
            "pressure": payload.get("pressure").cloned().unwrap_or(Value::Null),
            "rag": payload.get("rag").cloned().unwrap_or(Value::Null),
            "atlas": payload.get("atlas").cloned().unwrap_or(Value::Null),
            "latencyMs": latency_ms,
            "checkedAt": checked_at,
        }))),
        Err(error) => Ok(success_json(json!({
            "source": "memd-bundle",
            "status": if local_count > 0 { "fallback" } else { "error" },
            "baseUrl": base_url,
            "remoteHealthy": false,
            "itemCount": local_count,
            "localItemCount": local_count,
            "error": error,
            "latencyMs": 0,
            "checkedAt": checked_at,
        }))),
    }
}

fn first_content_line(content: &str) -> String {
    content
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .unwrap_or("Memory")
        .chars()
        .take(96)
        .collect()
}

fn remote_item_to_entry(item: &Value) -> Option<Value> {
    let id = item.get("id").and_then(Value::as_str)?.to_string();
    let content = item
        .get("content")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    let title = item
        .get("title")
        .and_then(Value::as_str)
        .map(str::to_string)
        .unwrap_or_else(|| first_content_line(&content));
    let scope = item
        .get("scope")
        .and_then(Value::as_str)
        .unwrap_or("memd")
        .to_string();
    let kind = item
        .get("kind")
        .and_then(Value::as_str)
        .unwrap_or("memory")
        .to_string();
    let confidence = item
        .get("confidence")
        .and_then(Value::as_f64)
        .unwrap_or(0.0);
    let snippet: String = content.chars().take(240).collect();

    Some(json!({
        "id": id,
        "scope": {
            "kind": scope,
            "name": item.get("project").and_then(Value::as_str).unwrap_or("shared"),
            "description": item.get("namespace").and_then(Value::as_str).unwrap_or_default(),
        },
        "kind": kind,
        "title": title,
        "content": content,
        "summary": snippet,
        "source": item.get("source_system").and_then(Value::as_str).unwrap_or("memd-server"),
        "confidence": (confidence * 100.0).round() as i64,
        "priority": 0,
        "retentionDays": 0,
        "version": item.get("version").and_then(Value::as_u64).unwrap_or(1),
        "status": item.get("status").and_then(Value::as_str).unwrap_or("active"),
        "metadata": item,
        "createdAt": item.get("created_at").and_then(Value::as_str).unwrap_or_default(),
        "updatedAt": item.get("updated_at").and_then(Value::as_str).unwrap_or_default(),
        "archivedAt": null,
        "name": title,
        "path": format!("memd/{scope}/{id}"),
        "snippet": snippet,
        "score": confidence,
    }))
}

fn value_text<'a>(value: &'a Value, key: &str) -> &'a str {
    value.get(key).and_then(Value::as_str).unwrap_or_default()
}

fn local_bundle_item_to_entry(item: &Value, index: usize) -> Option<Value> {
    let content = value_text(item, "content_preview").trim().to_string();
    if content.is_empty() {
        return None;
    }
    let id = value_text(item, "id")
        .trim()
        .to_string()
        .if_empty_then(|| format!("bundle-{index}"));
    let kind = value_text(item, "event_type")
        .trim()
        .to_string()
        .if_empty_then(|| value_text(item, "memory_kind").trim().to_string())
        .if_empty_then(|| "memory".to_string());
    let title = first_content_line(&content);
    let confidence = item
        .get("confidence")
        .and_then(Value::as_f64)
        .unwrap_or(0.0);
    let snippet: String = content.chars().take(240).collect();

    Some(json!({
        "id": id,
        "scope": {
            "kind": "bundle",
            "name": value_text(item, "project").if_empty("local"),
            "description": value_text(item, "namespace"),
        },
        "kind": kind,
        "title": title,
        "content": content,
        "summary": snippet,
        "source": value_text(item, "source_system").if_empty("memd-bundle"),
        "confidence": (confidence * 100.0).round() as i64,
        "priority": 0,
        "retentionDays": 0,
        "version": 1,
        "status": "active",
        "metadata": item,
        "createdAt": value_text(item, "recorded_at"),
        "updatedAt": value_text(item, "recorded_at"),
        "archivedAt": null,
        "name": title,
        "path": format!("memd/bundle/{id}"),
        "snippet": snippet,
        "score": confidence,
    }))
}

trait EmptyStringExt {
    fn if_empty_then(self, fallback: impl FnOnce() -> String) -> String;
}

impl EmptyStringExt for String {
    fn if_empty_then(self, fallback: impl FnOnce() -> String) -> String {
        if self.trim().is_empty() {
            fallback()
        } else {
            self
        }
    }
}

trait EmptyStrExt<'a> {
    fn if_empty(self, fallback: &'a str) -> &'a str;
}

impl<'a> EmptyStrExt<'a> for &'a str {
    fn if_empty(self, fallback: &'a str) -> &'a str {
        if self.trim().is_empty() {
            fallback
        } else {
            self
        }
    }
}

fn entry_matches_query(entry: &Value, needle: &str) -> bool {
    if needle.is_empty() {
        return true;
    }
    [
        "title", "content", "summary", "snippet", "kind", "source", "path",
    ]
    .iter()
    .any(|key| {
        entry
            .get(*key)
            .and_then(Value::as_str)
            .map(|value| value.to_lowercase().contains(needle))
            .unwrap_or(false)
    })
}

fn query_bundle_memd(body: &QueryBody) -> Result<Option<Json<Value>>, AppError> {
    let Some(root) = current_project_root() else {
        return Ok(None);
    };
    let raw_spine = root.join(".memd/state/raw-spine.jsonl");
    let Ok(content) = std::fs::read_to_string(raw_spine) else {
        return Ok(None);
    };
    let limit = normalize_limit(body.limit, 10, 100) as usize;
    let needle = body
        .query
        .as_deref()
        .unwrap_or_default()
        .trim()
        .to_lowercase();
    let mut seen = std::collections::HashSet::new();
    let entries: Vec<Value> = content
        .lines()
        .enumerate()
        .filter_map(|(index, line)| {
            serde_json::from_str::<Value>(line)
                .ok()
                .map(|item| (index, item))
        })
        .filter_map(|(index, item)| local_bundle_item_to_entry(&item, index))
        .filter(|entry| entry_matches_query(entry, &needle))
        .filter(|entry| {
            entry
                .get("id")
                .and_then(Value::as_str)
                .map(|id| seen.insert(id.to_string()))
                .unwrap_or(true)
        })
        .take(limit)
        .collect();

    if entries.is_empty() {
        return Ok(None);
    }

    Ok(Some(success_json(json!({
        "scope": null,
        "entries": entries,
        "source": "memd-bundle",
        "baseUrl": null,
    }))))
}

fn sanitize_filter_list(values: Option<&Vec<String>>, max_items: usize) -> Vec<String> {
    values
        .into_iter()
        .flat_map(|values| values.iter())
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
        .take(max_items)
        .map(|value| value.chars().take(80).collect::<String>())
        .collect()
}

fn sanitize_optional_token(value: Option<&str>, max_len: usize) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| value.chars().take(max_len).collect::<String>())
}

fn remote_memd_search_request(
    body: &QueryBody,
    limit: usize,
    max_chars_per_item: usize,
    source_agent: Option<&str>,
) -> Value {
    let mut statuses = sanitize_filter_list(body.statuses.as_ref(), 12);
    if statuses.is_empty() && !body.include_archived.unwrap_or(false) {
        statuses.push("active".to_string());
    }
    let source_agent = sanitize_optional_token(source_agent.or(body.source_agent.as_deref()), 160);

    json!({
        "query": body.query,
        "route": "all",
        "scopes": [],
        "kinds": sanitize_filter_list(body.kinds.as_ref(), 12),
        "statuses": statuses,
        "source_agent": source_agent,
        "tags": [],
        "stages": sanitize_filter_list(body.stages.as_ref(), 12),
        "limit": limit,
        "max_chars_per_item": max_chars_per_item,
    })
}

async fn query_remote_memd_source_agents(
    state: &AppState,
    base_url: &str,
) -> Result<Vec<String>, AppError> {
    let sources = query_remote_memd_sources(state, base_url).await?;
    let mut seen = std::collections::HashSet::new();
    let mut agents = Vec::new();
    for source in sources {
        let Some(agent) = source.get("source_agent").and_then(Value::as_str) else {
            continue;
        };
        let agent = agent.trim();
        if !agent.is_empty() && seen.insert(agent.to_string()) {
            agents.push(agent.to_string());
        }
    }
    Ok(agents)
}

async fn query_remote_memd_sources(
    state: &AppState,
    base_url: &str,
) -> Result<Vec<Value>, AppError> {
    let response = state
        .http
        .get(format!("{base_url}/memory/source?limit=200"))
        .timeout(Duration::from_secs(8))
        .send()
        .await?;
    if !response.status().is_success() {
        return Ok(Vec::new());
    }
    let payload: Value = response
        .json()
        .await
        .map_err(|error| AppError::Internal(error.into()))?;
    Ok(payload
        .get("sources")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default())
}

async fn post_remote_memd_search(
    state: &AppState,
    base_url: &str,
    request: Value,
) -> Result<Vec<Value>, AppError> {
    let response = state
        .http
        .post(format!("{base_url}/memory/search"))
        .timeout(Duration::from_secs(12))
        .json(&request)
        .send()
        .await?;

    if !response.status().is_success() {
        return Ok(Vec::new());
    }

    let payload: Value = response
        .json()
        .await
        .map_err(|error| AppError::Internal(error.into()))?;

    Ok(payload
        .get("items")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default())
}

async fn post_remote_memd_authority_search(
    state: &AppState,
    base_url: &str,
    request: Value,
) -> Result<Option<Vec<Value>>, AppError> {
    let Some(token) = memd_authority_token(state) else {
        return Ok(None);
    };
    let response = state
        .http
        .post(format!("{base_url}/memory/authority/search"))
        .header("x-memd-authority-token", token)
        .timeout(Duration::from_secs(12))
        .json(&request)
        .send()
        .await;

    let Ok(response) = response else {
        return Ok(None);
    };
    if !response.status().is_success() {
        return Ok(None);
    }

    let payload: Value = response
        .json()
        .await
        .map_err(|error| AppError::Internal(error.into()))?;
    Ok(Some(
        payload
            .get("items")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default(),
    ))
}

async fn query_remote_memd_raw_items(
    state: &AppState,
    base_url: &str,
    body: &QueryBody,
    max_chars_per_item: usize,
) -> Result<Vec<Value>, AppError> {
    let limit = normalize_limit(body.limit, 10, 100) as usize;
    let request = remote_memd_search_request(body, limit, max_chars_per_item, None);
    if let Some(items) = post_remote_memd_authority_search(state, base_url, request.clone()).await?
    {
        return Ok(items);
    }
    let items = post_remote_memd_search(state, base_url, request).await?;
    if !items.is_empty() || body.source_agent.is_some() {
        return Ok(items);
    }

    let agents = query_remote_memd_source_agents(state, base_url).await?;
    if agents.is_empty() {
        return Ok(items);
    }

    let mut seen = std::collections::HashSet::new();
    let mut merged = Vec::new();
    for agent in agents {
        let remaining = limit.saturating_sub(merged.len());
        if remaining == 0 {
            break;
        }
        let request =
            remote_memd_search_request(body, remaining, max_chars_per_item, Some(agent.as_str()));
        let agent_items = post_remote_memd_search(state, base_url, request).await?;
        for item in agent_items {
            if item
                .get("id")
                .and_then(Value::as_str)
                .map(|id| seen.insert(id.to_string()))
                .unwrap_or(true)
            {
                merged.push(item);
            }
            if merged.len() >= limit {
                break;
            }
        }
    }
    Ok(merged)
}

async fn query_remote_memd(
    state: &AppState,
    body: &QueryBody,
) -> Result<Option<Json<Value>>, AppError> {
    let Some(base_url) = memd_base_url(state) else {
        return Ok(None);
    };
    let Ok(items) = query_remote_memd_raw_items(state, &base_url, body, 900).await else {
        return Ok(None);
    };
    let entries: Vec<Value> = items.iter().filter_map(remote_item_to_entry).collect();
    if entries.is_empty() {
        return Ok(None);
    }

    Ok(Some(success_json(json!({
        "scope": null,
        "entries": entries,
        "source": "memd-server",
        "baseUrl": base_url,
    }))))
}

async fn upsert_memo(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Json(body): Json<UpsertBody>,
) -> Result<Json<Value>, AppError> {
    let scope = ensure_scope(&state.db, &session.user_id, body.scope.as_ref()).await?;
    let now = chrono::Utc::now().to_rfc3339();
    let title = optional_trimmed(body.title.as_deref(), 200)
        .ok_or_else(|| AppError::BadRequest("title required".into()))?;
    let content = optional_trimmed(body.content.as_deref(), 20_000).unwrap_or_default();
    let summary = optional_trimmed(body.summary.as_deref(), 4_000).unwrap_or_default();
    let kind = sanitize_scope_component(body.kind.as_deref().unwrap_or("fact"), "kind")?;
    let source = sanitize_scope_component(body.source.as_deref().unwrap_or("manual"), "source")?;
    let confidence = body.confidence.unwrap_or(50).clamp(0, 100);
    let priority = body.priority.unwrap_or(0).clamp(0, 100);
    let retention_days = body.retention_days.unwrap_or(30).clamp(1, 3650);
    let metadata = body.metadata.unwrap_or_else(|| json!({}));

    let id = if let Some(id) = body.id.as_deref() {
        validate_uuid(id)?;
        id.to_string()
    } else {
        crate::routes::util::random_uuid()
    };

    let existing: Option<(i64, String)> =
        sqlx::query_as("SELECT version, created_at FROM memd_entries WHERE id = ? AND user_id = ?")
            .bind(&id)
            .bind(&session.user_id)
            .fetch_optional(&state.db)
            .await?;

    let created_at = existing
        .as_ref()
        .map(|row| row.1.clone())
        .unwrap_or_else(|| now.clone());
    let version = existing.as_ref().map(|row| row.0 + 1).unwrap_or(1);
    let archived_at: Option<String> = None;
    let metadata_str = metadata.to_string();

    sqlx::query(
        "INSERT INTO memd_entries \
         (id, user_id, scope_id, kind, title, content, summary, source, confidence, priority, \
         retention_days, version, status, metadata, created_at, updated_at, archived_at) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?) \
         ON CONFLICT(id, user_id) DO UPDATE SET \
           scope_id = excluded.scope_id, \
           kind = excluded.kind, \
           title = excluded.title, \
           content = excluded.content, \
           summary = excluded.summary, \
           source = excluded.source, \
           confidence = excluded.confidence, \
           priority = excluded.priority, \
           retention_days = excluded.retention_days, \
           version = excluded.version, \
           status = excluded.status, \
           metadata = excluded.metadata, \
           updated_at = excluded.updated_at, \
           archived_at = excluded.archived_at",
    )
    .bind(&id)
    .bind(&session.user_id)
    .bind(&scope.id)
    .bind(&kind)
    .bind(&title)
    .bind(&content)
    .bind(&summary)
    .bind(&source)
    .bind(confidence)
    .bind(priority)
    .bind(retention_days)
    .bind(version)
    .bind(&metadata_str)
    .bind(&created_at)
    .bind(&now)
    .bind(&archived_at)
    .execute(&state.db)
    .await?;

    insert_audit(
        &state.db,
        &session.user_id,
        if existing.is_some() {
            "update"
        } else {
            "upsert"
        },
        Some(&scope.id),
        Some(&id),
        json!({
            "kind": kind,
            "title": title,
            "priority": priority,
            "confidence": confidence,
            "retentionDays": retention_days,
        }),
    )
    .await?;

    let entry = MemdEntryRecord {
        id: id.clone(),
        scope_id: scope.id.clone(),
        scope_kind: scope.kind.clone(),
        scope_name: scope.name.clone(),
        scope_description: scope.description.clone(),
        kind,
        title: title.clone(),
        content: content.clone(),
        summary: summary.clone(),
        source,
        confidence,
        priority,
        retention_days,
        version,
        status: "active".to_string(),
        metadata: metadata_str,
        created_at,
        updated_at: now.clone(),
        archived_at,
    };

    Ok(success_json(json!({
        "scope": scope_to_json(&scope, None),
        "entry": entry_to_json(&entry, priority + confidence / 10),
    })))
}

async fn archive_memo(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Json(body): Json<ArchiveBody>,
) -> Result<Json<Value>, AppError> {
    if body.ids.is_empty() {
        return Err(AppError::BadRequest("ids required".into()));
    }

    let scope = if let Some(scope) = body.scope.as_ref() {
        Some(ensure_scope(&state.db, &session.user_id, Some(scope)).await?)
    } else {
        None
    };

    let now = chrono::Utc::now().to_rfc3339();
    let mut archived = 0i64;
    for id in &body.ids {
        validate_uuid(id)?;
        let res = if let Some(scope) = &scope {
            sqlx::query(
                "UPDATE memd_entries SET status = 'archived', archived_at = ?, updated_at = ? \
                 WHERE id = ? AND user_id = ? AND scope_id = ?",
            )
            .bind(&now)
            .bind(&now)
            .bind(id)
            .bind(&session.user_id)
            .bind(&scope.id)
            .execute(&state.db)
            .await?
        } else {
            sqlx::query(
                "UPDATE memd_entries SET status = 'archived', archived_at = ?, updated_at = ? \
                 WHERE id = ? AND user_id = ?",
            )
            .bind(&now)
            .bind(&now)
            .bind(id)
            .bind(&session.user_id)
            .execute(&state.db)
            .await?
        };
        archived += res.rows_affected() as i64;
    }

    insert_audit(
        &state.db,
        &session.user_id,
        "archive",
        scope.as_ref().map(|s| s.id.as_str()),
        None,
        json!({
            "ids": body.ids,
            "reason": body.reason,
            "archived": archived,
        }),
    )
    .await?;

    Ok(success_json(json!({
        "archived": archived,
        "scope": scope.map(|s| scope_to_json(&s, None)),
    })))
}

async fn compact_memo(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Json(body): Json<CompactBody>,
) -> Result<Json<Value>, AppError> {
    let scope = ensure_scope(&state.db, &session.user_id, body.scope.as_ref()).await?;
    let keep_latest = normalize_limit(body.keep_latest, 12, 100);
    let max_age_days = normalize_limit(body.max_age_days, 30, 3650);
    let cutoff = chrono::Utc::now() - chrono::Duration::days(max_age_days);
    let cutoff_str = cutoff.to_rfc3339();

    let rows = query_entry_rows(&state.db, &session.user_id, Some(&scope.id), false, 200).await?;

    let mut archive_ids: Vec<String> = Vec::new();
    let mut kept_titles: Vec<String> = Vec::new();
    for (idx, row) in rows.iter().enumerate() {
        if idx < keep_latest as usize || row.updated_at >= cutoff_str {
            kept_titles.push(row.title.clone());
        } else {
            archive_ids.push(row.id.clone());
        }
    }

    let mut archived = 0i64;
    let now = chrono::Utc::now().to_rfc3339();
    for id in &archive_ids {
        let res = sqlx::query(
            "UPDATE memd_entries SET status = 'archived', archived_at = ?, updated_at = ? \
             WHERE id = ? AND user_id = ? AND scope_id = ?",
        )
        .bind(&now)
        .bind(&now)
        .bind(id)
        .bind(&session.user_id)
        .bind(&scope.id)
        .execute(&state.db)
        .await?;
        archived += res.rows_affected() as i64;
    }

    let summary_entry = if archived > 0 {
        let summary_id = crate::routes::util::random_uuid();
        let summary_title = format!("MemD compaction: {} archived", archived);
        let summary_content = format!(
            "Archived {} stale entries from scope {}/{}. Kept {} active entries.",
            archived,
            scope.kind,
            scope.name,
            kept_titles.len()
        );
        let metadata = json!({
            "archivedIds": archive_ids,
            "keepLatest": keep_latest,
            "maxAgeDays": max_age_days,
            "keptTitles": kept_titles.iter().take(10).cloned().collect::<Vec<_>>(),
        });
        sqlx::query(
            "INSERT INTO memd_entries \
             (id, user_id, scope_id, kind, title, content, summary, source, confidence, priority, \
              retention_days, version, status, metadata, created_at, updated_at, archived_at) \
             VALUES (?, ?, ?, 'summary', ?, ?, ?, 'system', 90, 50, 365, 1, 'active', ?, ?, ?, NULL)",
        )
        .bind(&summary_id)
        .bind(&session.user_id)
        .bind(&scope.id)
        .bind(summary_title.as_str())
        .bind(summary_content.as_str())
        .bind(summary_content.as_str())
        .bind(metadata.to_string())
        .bind(&now)
        .bind(&now)
        .execute(&state.db)
        .await?;

        Some(json!({
            "id": summary_id,
            "title": summary_title,
            "content": summary_content,
        }))
    } else {
        None
    };

    insert_audit(
        &state.db,
        &session.user_id,
        "compact",
        Some(&scope.id),
        None,
        json!({
            "archived": archived,
            "keepLatest": keep_latest,
            "maxAgeDays": max_age_days,
        }),
    )
    .await?;

    Ok(success_json(json!({
        "archived": archived,
        "summary": summary_entry,
        "scope": scope_to_json(&scope, None),
    })))
}

async fn list_scopes(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let rows: Vec<ScopeCountRow> = sqlx::query_as(
        "SELECT s.id, s.user_id, s.scope_kind, s.scope_name, s.description, s.is_default, \
         s.created_at, s.updated_at, COUNT(e.id) as entry_count \
         FROM memd_scopes s \
         LEFT JOIN memd_entries e ON e.scope_id = s.id AND e.user_id = s.user_id AND e.status = 'active' \
         WHERE s.user_id = ? \
         GROUP BY s.id, s.user_id, s.scope_kind, s.scope_name, s.description, s.is_default, s.created_at, s.updated_at \
         ORDER BY s.is_default DESC, s.updated_at DESC",
    )
    .bind(&session.user_id)
    .fetch_all(&state.db)
    .await?;

    let scopes: Vec<Value> = rows
        .into_iter()
        .map(|row| {
            let scope = MemdScopeRecord {
                id: row.0,
                user_id: row.1,
                kind: row.2,
                name: row.3,
                description: row.4,
                is_default: row.5 != 0,
                created_at: row.6,
                updated_at: row.7,
            };
            scope_to_json(&scope, Some(row.8))
        })
        .collect();

    Ok(success_json(json!({ "scopes": scopes })))
}

async fn list_audit(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Query(params): Query<AuditQuery>,
) -> Result<Json<Value>, AppError> {
    let limit = normalize_limit(params.limit, 20, 100);
    let rows: Vec<AuditRow> = if let Some(scope_id) = params.scope_id.as_deref() {
        sqlx::query_as(
            "SELECT id, user_id, action, scope_id, entry_id, details, created_at \
             FROM memd_audit \
             WHERE user_id = ? AND scope_id = ? \
             ORDER BY created_at DESC \
             LIMIT ?",
        )
        .bind(&session.user_id)
        .bind(scope_id)
        .bind(limit)
        .fetch_all(&state.db)
        .await?
    } else {
        sqlx::query_as(
            "SELECT id, user_id, action, scope_id, entry_id, details, created_at \
             FROM memd_audit \
             WHERE user_id = ? \
             ORDER BY created_at DESC \
             LIMIT ?",
        )
        .bind(&session.user_id)
        .bind(limit)
        .fetch_all(&state.db)
        .await?
    };

    let events: Vec<Value> = rows.iter().map(audit_to_json).collect();
    Ok(success_json(json!({ "events": events })))
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::SqlitePool;

    async fn setup_pool() -> SqlitePool {
        let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
        sqlx::query("PRAGMA foreign_keys = ON;")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query(
            "CREATE TABLE memd_scopes (
                id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                scope_kind TEXT NOT NULL,
                scope_name TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                is_default INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                PRIMARY KEY(id, user_id),
                UNIQUE(user_id, scope_kind, scope_name)
            )",
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query(
            "CREATE TABLE memd_entries (
                id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                scope_id TEXT NOT NULL,
                kind TEXT NOT NULL,
                title TEXT NOT NULL,
                content TEXT NOT NULL DEFAULT '',
                summary TEXT NOT NULL DEFAULT '',
                source TEXT NOT NULL,
                confidence INTEGER NOT NULL DEFAULT 50,
                priority INTEGER NOT NULL DEFAULT 0,
                retention_days INTEGER NOT NULL DEFAULT 30,
                version INTEGER NOT NULL DEFAULT 1,
                status TEXT NOT NULL DEFAULT 'active',
                metadata TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                archived_at TEXT,
                PRIMARY KEY(id, user_id),
                FOREIGN KEY(scope_id, user_id) REFERENCES memd_scopes(id, user_id) ON DELETE CASCADE
            )",
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query(
            "CREATE TABLE memd_audit (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                action TEXT NOT NULL,
                scope_id TEXT,
                entry_id TEXT,
                details TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL
            )",
        )
        .execute(&pool)
        .await
        .unwrap();
        pool
    }

    #[tokio::test]
    async fn scope_is_created_and_reused() {
        let pool = setup_pool().await;
        let scope = ensure_scope(
            &pool,
            "user-1",
            Some(&ScopeInput {
                kind: "agent".to_string(),
                name: "brain".to_string(),
                description: Some("Agent brain".to_string()),
            }),
        )
        .await
        .unwrap();

        let again = ensure_scope(
            &pool,
            "user-1",
            Some(&ScopeInput {
                kind: "agent".to_string(),
                name: "brain".to_string(),
                description: Some("Agent brain".to_string()),
            }),
        )
        .await
        .unwrap();

        assert_eq!(scope.id, again.id);
        assert_eq!(scope.kind, "agent");
    }

    #[tokio::test]
    async fn upsert_query_and_archive_roundtrip() {
        // This test intentionally avoids invoking the HTTP handlers because `AppState`
        // contains a `tauri::AppHandle` that cannot be safely constructed in unit tests.
        let pool = setup_pool().await;
        let scope = ensure_scope(&pool, "user-1", None).await.unwrap();

        let now = chrono::Utc::now().to_rfc3339();
        sqlx::query(
            "INSERT INTO memd_entries \
             (id, user_id, scope_id, kind, title, content, summary, source, confidence, priority, \
              retention_days, version, status, metadata, created_at, updated_at, archived_at) \
             VALUES (?, ?, ?, 'fact', 'New idea', 'This is the new brain note', 'Brain note', 'manual', 90, 30, 60, 1, 'active', ?, ?, ?, NULL)",
        )
        .bind("22222222-2222-4222-8222-222222222222")
        .bind("user-1")
        .bind(&scope.id)
        .bind(json!({ "topic": "brain" }).to_string())
        .bind(&now)
        .bind(&now)
        .execute(&pool)
        .await
        .unwrap();

        let queried = query_entry_rows(&pool, "user-1", Some(&scope.id), false, 10)
            .await
            .unwrap();
        assert!(queried.iter().any(|row| row.title == "New idea"));

        let res = sqlx::query(
            "UPDATE memd_entries SET status = 'archived', archived_at = ?, updated_at = ? \
             WHERE id = ? AND user_id = ?",
        )
        .bind(&now)
        .bind(&now)
        .bind("22222222-2222-4222-8222-222222222222")
        .bind("user-1")
        .execute(&pool)
        .await
        .unwrap();
        assert_eq!(res.rows_affected(), 1);

        let active_only = query_entry_rows(&pool, "user-1", Some(&scope.id), false, 10)
            .await
            .unwrap();
        assert!(!active_only
            .iter()
            .any(|row| row.id == "22222222-2222-4222-8222-222222222222"));

        let with_archived = query_entry_rows(&pool, "user-1", Some(&scope.id), true, 10)
            .await
            .unwrap();
        assert!(with_archived
            .iter()
            .any(|row| row.id == "22222222-2222-4222-8222-222222222222"));
    }
}
