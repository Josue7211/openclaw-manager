use axum::{
    extract::{Path, State},
    routing::{get, patch, post, put, delete as delete_route},
    Json, Router,
};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::error::AppError;
use crate::server::{AppState, RequireAuth};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Nested `{ w, h }` object the frontend sends for `defaultSize`.
#[derive(Debug, Deserialize)]
struct SizeObj {
    w: Option<i64>,
    h: Option<i64>,
}

type ModuleRow = (
    String, String, String, String, String, String, String,
    i64, i64, i64, i64, String, String,
);

/// Convert a 13-column module row into the JSON shape the frontend expects.
fn module_row_to_json(row: &ModuleRow) -> Value {
    json!({
        "id": row.0,
        "userId": row.1,
        "name": row.2,
        "description": row.3,
        "icon": row.4,
        "source": row.5,
        "configSchema": serde_json::from_str::<Value>(&row.6).unwrap_or(json!({})),
        "defaultSize": { "w": row.7, "h": row.8 },
        "version": row.9,
        "enabled": row.10 != 0,
        "createdAt": row.11,
        "updatedAt": row.12,
    })
}

/// Re-fetch a module row by id + user_id from the database.
async fn fetch_module_row(
    db: &sqlx::SqlitePool,
    id: &str,
    user_id: &str,
) -> Result<ModuleRow, AppError> {
    let row: ModuleRow = sqlx::query_as(
        "SELECT id, user_id, name, description, icon, source, config_schema, \
         default_size_w, default_size_h, version, enabled, created_at, updated_at \
         FROM bjorn_modules WHERE id = ? AND user_id = ?",
    )
    .bind(id)
    .bind(user_id)
    .fetch_one(db)
    .await?;
    Ok(row)
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/bjorn/modules", get(list_modules).post(create_module))
        .route(
            "/api/bjorn/modules/{id}",
            put(update_module).delete(delete_module),
        )
        .route("/api/bjorn/modules/{id}/toggle", patch(toggle_module))
        .route("/api/bjorn/modules/{id}/versions", get(list_versions))
        .route("/api/bjorn/modules/{id}/rollback", post(rollback_module))
        .route("/api/bjorn/bridge", post(bridge_proxy))
}

// ---------------------------------------------------------------------------
// List modules
// ---------------------------------------------------------------------------

async fn list_modules(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let rows: Vec<ModuleRow> = sqlx::query_as(
        "SELECT id, user_id, name, description, icon, source, config_schema, \
         default_size_w, default_size_h, version, enabled, created_at, updated_at \
         FROM bjorn_modules \
         WHERE user_id = ? AND deleted_at IS NULL \
         ORDER BY updated_at DESC",
    )
    .bind(&session.user_id)
    .fetch_all(&state.db)
    .await?;

    let modules: Vec<Value> = rows.iter().map(module_row_to_json).collect();

    Ok(Json(json!({ "modules": modules })))
}

// ---------------------------------------------------------------------------
// Create module
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
struct CreateModuleBody {
    name: String,
    description: Option<String>,
    icon: Option<String>,
    source: String,
    #[serde(rename = "configSchema")]
    config_schema: Option<Value>,
    #[serde(rename = "defaultSize")]
    default_size: Option<SizeObj>,
    #[serde(rename = "defaultSizeW")]
    default_size_w: Option<i64>,
    #[serde(rename = "defaultSizeH")]
    default_size_h: Option<i64>,
}

async fn create_module(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Json(body): Json<CreateModuleBody>,
) -> Result<Json<Value>, AppError> {
    if body.name.trim().is_empty() {
        return Err(AppError::BadRequest("name required".into()));
    }
    if body.source.trim().is_empty() {
        return Err(AppError::BadRequest("source required".into()));
    }

    let id = crate::routes::util::random_uuid();
    let version_id = crate::routes::util::random_uuid();
    let now = chrono::Utc::now().to_rfc3339();
    let desc = body.description.as_deref().unwrap_or("");
    let icon = body.icon.as_deref().unwrap_or("Cube");
    let config_schema_str = body
        .config_schema
        .as_ref()
        .map(|v| v.to_string())
        .unwrap_or_else(|| "{}".to_string());
    let w = body.default_size.as_ref().and_then(|s| s.w)
        .or(body.default_size_w)
        .unwrap_or(3);
    let h = body.default_size.as_ref().and_then(|s| s.h)
        .or(body.default_size_h)
        .unwrap_or(3);

    sqlx::query(
        "INSERT INTO bjorn_modules \
         (id, user_id, name, description, icon, source, config_schema, \
          default_size_w, default_size_h, version, enabled, created_at, updated_at) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?)",
    )
    .bind(&id)
    .bind(&session.user_id)
    .bind(body.name.trim())
    .bind(desc)
    .bind(icon)
    .bind(&body.source)
    .bind(&config_schema_str)
    .bind(w)
    .bind(h)
    .bind(&now)
    .bind(&now)
    .execute(&state.db)
    .await?;

    // Insert version 1
    sqlx::query(
        "INSERT INTO bjorn_module_versions (id, module_id, version, source, config_schema, created_at) \
         VALUES (?, ?, 1, ?, ?, ?)",
    )
    .bind(&version_id)
    .bind(&id)
    .bind(&body.source)
    .bind(&config_schema_str)
    .bind(&now)
    .execute(&state.db)
    .await?;

    Ok(Json(json!({
        "module": {
            "id": id,
            "userId": session.user_id,
            "name": body.name.trim(),
            "description": desc,
            "icon": icon,
            "source": body.source,
            "configSchema": body.config_schema.unwrap_or(json!({})),
            "defaultSize": { "w": w, "h": h },
            "version": 1,
            "enabled": true,
            "createdAt": now,
            "updatedAt": now,
        }
    })))
}

// ---------------------------------------------------------------------------
// Update module (new version)
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
struct UpdateModuleBody {
    source: String,
    name: Option<String>,
    description: Option<String>,
    icon: Option<String>,
    #[serde(rename = "configSchema")]
    config_schema: Option<Value>,
    #[serde(rename = "defaultSize")]
    default_size: Option<SizeObj>,
    #[serde(rename = "defaultSizeW")]
    default_size_w: Option<i64>,
    #[serde(rename = "defaultSizeH")]
    default_size_h: Option<i64>,
}

async fn update_module(
    Path(id): Path<String>,
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Json(body): Json<UpdateModuleBody>,
) -> Result<Json<Value>, AppError> {
    crate::validation::validate_uuid(&id)?;

    // Get current version
    let row: Option<(i64,)> = sqlx::query_as(
        "SELECT version FROM bjorn_modules WHERE id = ? AND user_id = ? AND deleted_at IS NULL",
    )
    .bind(&id)
    .bind(&session.user_id)
    .fetch_optional(&state.db)
    .await?;

    let current_version = row.ok_or(AppError::NotFound("Module not found".into()))?.0;
    let new_version = current_version + 1;
    let now = chrono::Utc::now().to_rfc3339();
    let version_id = crate::routes::util::random_uuid();
    let config_schema_str = body
        .config_schema
        .as_ref()
        .map(|v| v.to_string())
        .unwrap_or_else(|| "{}".to_string());

    // Resolve nested defaultSize over flat fields
    let resolved_w = body.default_size.as_ref().and_then(|s| s.w)
        .or(body.default_size_w);
    let resolved_h = body.default_size.as_ref().and_then(|s| s.h)
        .or(body.default_size_h);

    // Update module row
    let mut query = String::from(
        "UPDATE bjorn_modules SET source = ?, version = ?, config_schema = ?, updated_at = ?",
    );
    let mut bind_count = 4;
    if body.name.is_some() {
        query.push_str(", name = ?");
        bind_count += 1;
    }
    if body.description.is_some() {
        query.push_str(", description = ?");
        bind_count += 1;
    }
    if body.icon.is_some() {
        query.push_str(", icon = ?");
        bind_count += 1;
    }
    if resolved_w.is_some() {
        query.push_str(", default_size_w = ?");
        bind_count += 1;
    }
    if resolved_h.is_some() {
        query.push_str(", default_size_h = ?");
        bind_count += 1;
    }
    query.push_str(" WHERE id = ? AND user_id = ?");

    let _ = bind_count; // suppress warning

    let mut q = sqlx::query(&query)
        .bind(&body.source)
        .bind(new_version)
        .bind(&config_schema_str)
        .bind(&now);

    if let Some(ref name) = body.name {
        q = q.bind(name.trim());
    }
    if let Some(ref desc) = body.description {
        q = q.bind(desc);
    }
    if let Some(ref icon) = body.icon {
        q = q.bind(icon);
    }
    if let Some(w) = resolved_w {
        q = q.bind(w);
    }
    if let Some(h) = resolved_h {
        q = q.bind(h);
    }

    q.bind(&id).bind(&session.user_id).execute(&state.db).await?;

    // Insert new version
    sqlx::query(
        "INSERT INTO bjorn_module_versions (id, module_id, version, source, config_schema, created_at) \
         VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(&version_id)
    .bind(&id)
    .bind(new_version)
    .bind(&body.source)
    .bind(&config_schema_str)
    .bind(&now)
    .execute(&state.db)
    .await?;

    // Prune old versions (keep latest 5)
    sqlx::query(
        "DELETE FROM bjorn_module_versions \
         WHERE module_id = ? AND version NOT IN \
         (SELECT version FROM bjorn_module_versions WHERE module_id = ? ORDER BY version DESC LIMIT 5)",
    )
    .bind(&id)
    .bind(&id)
    .execute(&state.db)
    .await?;

    // Re-fetch full module to return complete object
    let row = fetch_module_row(&state.db, &id, &session.user_id).await?;
    Ok(Json(json!({ "module": module_row_to_json(&row) })))
}

// ---------------------------------------------------------------------------
// Delete module (soft)
// ---------------------------------------------------------------------------

async fn delete_module(
    Path(id): Path<String>,
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    crate::validation::validate_uuid(&id)?;

    let now = chrono::Utc::now().to_rfc3339();
    let result = sqlx::query(
        "UPDATE bjorn_modules SET deleted_at = ?, enabled = 0, updated_at = ? \
         WHERE id = ? AND user_id = ? AND deleted_at IS NULL",
    )
    .bind(&now)
    .bind(&now)
    .bind(&id)
    .bind(&session.user_id)
    .execute(&state.db)
    .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Module not found".into()));
    }

    Ok(Json(json!({ "ok": true })))
}

// ---------------------------------------------------------------------------
// Toggle module enabled/disabled
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
struct ToggleBody {
    enabled: bool,
}

async fn toggle_module(
    Path(id): Path<String>,
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Json(body): Json<ToggleBody>,
) -> Result<Json<Value>, AppError> {
    crate::validation::validate_uuid(&id)?;

    let now = chrono::Utc::now().to_rfc3339();
    let enabled_val: i64 = if body.enabled { 1 } else { 0 };

    sqlx::query(
        "UPDATE bjorn_modules SET enabled = ?, updated_at = ? \
         WHERE id = ? AND user_id = ? AND deleted_at IS NULL",
    )
    .bind(enabled_val)
    .bind(&now)
    .bind(&id)
    .bind(&session.user_id)
    .execute(&state.db)
    .await?;

    // Re-fetch full module to return complete object
    let row = fetch_module_row(&state.db, &id, &session.user_id).await?;
    Ok(Json(json!({ "module": module_row_to_json(&row) })))
}

// ---------------------------------------------------------------------------
// List versions
// ---------------------------------------------------------------------------

async fn list_versions(
    Path(id): Path<String>,
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    crate::validation::validate_uuid(&id)?;

    // Verify ownership
    let exists: Option<(String,)> = sqlx::query_as(
        "SELECT id FROM bjorn_modules WHERE id = ? AND user_id = ?",
    )
    .bind(&id)
    .bind(&session.user_id)
    .fetch_optional(&state.db)
    .await?;

    if exists.is_none() {
        return Err(AppError::NotFound("Module not found".into()));
    }

    let rows: Vec<(String, String, i64, String, String, String)> = sqlx::query_as(
        "SELECT id, module_id, version, source, config_schema, created_at \
         FROM bjorn_module_versions \
         WHERE module_id = ? \
         ORDER BY version DESC \
         LIMIT 5",
    )
    .bind(&id)
    .fetch_all(&state.db)
    .await?;

    let versions: Vec<Value> = rows
        .iter()
        .map(|(vid, mid, version, source, config_schema, created)| {
            json!({
                "id": vid,
                "moduleId": mid,
                "version": version,
                "source": source,
                "configSchema": serde_json::from_str::<Value>(config_schema).unwrap_or(json!({})),
                "createdAt": created,
            })
        })
        .collect();

    Ok(Json(json!({ "versions": versions })))
}

// ---------------------------------------------------------------------------
// Rollback to version
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
struct RollbackBody {
    version: i64,
}

async fn rollback_module(
    Path(id): Path<String>,
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Json(body): Json<RollbackBody>,
) -> Result<Json<Value>, AppError> {
    crate::validation::validate_uuid(&id)?;

    // Get current version number
    let current: Option<(i64,)> = sqlx::query_as(
        "SELECT version FROM bjorn_modules WHERE id = ? AND user_id = ? AND deleted_at IS NULL",
    )
    .bind(&id)
    .bind(&session.user_id)
    .fetch_optional(&state.db)
    .await?;

    let current_version = current.ok_or(AppError::NotFound("Module not found".into()))?.0;

    // Get the target version's source and config_schema
    let target: Option<(String, String)> = sqlx::query_as(
        "SELECT source, config_schema FROM bjorn_module_versions \
         WHERE module_id = ? AND version = ?",
    )
    .bind(&id)
    .bind(body.version)
    .fetch_optional(&state.db)
    .await?;

    let (source, config_schema) = target.ok_or_else(|| {
        AppError::BadRequest(format!("Version {} not found", body.version))
    })?;

    let new_version = current_version + 1;
    let now = chrono::Utc::now().to_rfc3339();
    let version_id = crate::routes::util::random_uuid();

    // Update module with rolled-back source
    sqlx::query(
        "UPDATE bjorn_modules SET source = ?, config_schema = ?, version = ?, updated_at = ? \
         WHERE id = ? AND user_id = ?",
    )
    .bind(&source)
    .bind(&config_schema)
    .bind(new_version)
    .bind(&now)
    .bind(&id)
    .bind(&session.user_id)
    .execute(&state.db)
    .await?;

    // Insert rollback as a new version entry
    sqlx::query(
        "INSERT INTO bjorn_module_versions (id, module_id, version, source, config_schema, created_at) \
         VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(&version_id)
    .bind(&id)
    .bind(new_version)
    .bind(&source)
    .bind(&config_schema)
    .bind(&now)
    .execute(&state.db)
    .await?;

    // Prune old versions
    sqlx::query(
        "DELETE FROM bjorn_module_versions \
         WHERE module_id = ? AND version NOT IN \
         (SELECT version FROM bjorn_module_versions WHERE module_id = ? ORDER BY version DESC LIMIT 5)",
    )
    .bind(&id)
    .bind(&id)
    .execute(&state.db)
    .await?;

    // Re-fetch full module to return complete object
    let row = fetch_module_row(&state.db, &id, &session.user_id).await?;
    Ok(Json(json!({ "module": module_row_to_json(&row) })))
}

// ---------------------------------------------------------------------------
// Data bridge proxy (stub)
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
struct BridgeBody {
    source: String,
    command: String,
    #[allow(dead_code)]
    args: Option<Value>,
}

async fn bridge_proxy(
    _state: State<AppState>,
    RequireAuth(_session): RequireAuth,
    Json(body): Json<BridgeBody>,
) -> Result<Json<Value>, AppError> {
    // TODO: Implement data bridge proxy. This will validate `source` against
    // the tools.json manifest and execute CLI commands via the configured
    // backend. For now, return a stub error.
    Ok(Json(json!({
        "error": format!("Data bridge not yet configured for source '{}' command '{}'", body.source, body.command)
    })))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn router_compiles() {
        let _ = router();
    }
}
