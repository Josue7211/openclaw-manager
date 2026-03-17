use axum::{extract::State, routing::patch, Json, Router};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::error::AppError;
use crate::server::AppState;
use crate::server::RequireAuth;
use crate::validation::validate_uuid;

/// Tables that support soft-delete restoration. Must be a subset of
/// `SOFT_DELETE_TABLES` in `server.rs` — only user-facing data tables.
const RESTORABLE_TABLES: &[&str] = &[
    "todos",
    "missions",
    "mission_events",
    "agents",
    "ideas",
    "captures",
    "habits",
    "habit_entries",
    "changelog_entries",
    "decisions",
    "knowledge_entries",
    "daily_reviews",
    "weekly_reviews",
    "retrospectives",
    "workflow_notes",
];

pub fn router() -> Router<AppState> {
    Router::new().route("/restore", patch(restore_item))
}

// ── PATCH /api/restore ────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct RestoreBody {
    table: String,
    id: String,
}

/// Restore a soft-deleted item by clearing its `deleted_at` timestamp.
///
/// Only items deleted within the last 30 days can be restored (after that,
/// the cleanup job hard-deletes them). The table name is validated against
/// a strict allowlist to prevent arbitrary table access.
async fn restore_item(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Json(body): Json<RestoreBody>,
) -> Result<Json<Value>, AppError> {
    validate_uuid(&body.id)?;

    // Validate table against allowlist to prevent SQL injection
    if !RESTORABLE_TABLES.contains(&body.table.as_str()) {
        return Err(AppError::BadRequest(format!(
            "table '{}' is not restorable; allowed: {}",
            &body.table[..body.table.len().min(50)],
            RESTORABLE_TABLES.join(", ")
        )));
    }

    let now = chrono::Utc::now().to_rfc3339();

    // Clear deleted_at — only restore rows owned by this user that are still
    // soft-deleted (not yet hard-purged by the cleanup job).
    let sql = format!(
        "UPDATE {} SET deleted_at = NULL, updated_at = ? \
         WHERE id = ? AND user_id = ? AND deleted_at IS NOT NULL",
        body.table
    );

    let result = sqlx::query(&sql)
        .bind(&now)
        .bind(&body.id)
        .bind(&session.user_id)
        .execute(&state.db)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound(
            "item not found or already restored".into(),
        ));
    }

    tracing::info!(
        user_id = %session.user_id,
        table = %body.table,
        item_id = %body.id,
        "DLP: soft-deleted item restored"
    );

    // Log for sync engine so the restore propagates to Supabase.
    // Read back the row to build the sync payload.
    let row: Option<(String,)> = sqlx::query_as(&format!(
        "SELECT id FROM {} WHERE id = ? AND user_id = ?",
        body.table
    ))
    .bind(&body.id)
    .bind(&session.user_id)
    .fetch_optional(&state.db)
    .await?;

    if row.is_some() {
        // Log as UPDATE so sync engine pushes the cleared deleted_at
        crate::sync::log_mutation(
            &state.db,
            &body.table,
            &body.id,
            "UPDATE",
            Some(&json!({ "id": body.id, "deleted_at": null, "updated_at": now }).to_string()),
        )
        .await
        .map_err(|e| AppError::Internal(e.into()))?;
    }

    Ok(Json(json!({ "ok": true, "restored": true })))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn restorable_tables_are_non_empty() {
        assert!(!RESTORABLE_TABLES.is_empty());
    }

    #[test]
    fn restorable_tables_include_core_tables() {
        assert!(RESTORABLE_TABLES.contains(&"todos"));
        assert!(RESTORABLE_TABLES.contains(&"missions"));
        assert!(RESTORABLE_TABLES.contains(&"ideas"));
        assert!(RESTORABLE_TABLES.contains(&"knowledge_entries"));
    }

    #[test]
    fn restorable_tables_exclude_system_tables() {
        assert!(!RESTORABLE_TABLES.contains(&"user_preferences"));
        assert!(!RESTORABLE_TABLES.contains(&"cache"));
        assert!(!RESTORABLE_TABLES.contains(&"api_cache"));
        assert!(!RESTORABLE_TABLES.contains(&"_sync_log"));
    }

    #[test]
    fn restore_body_deserializes() {
        let json = r#"{"table": "todos", "id": "550e8400-e29b-41d4-a716-446655440000"}"#;
        let body: RestoreBody = serde_json::from_str(json).unwrap();
        assert_eq!(body.table, "todos");
        assert_eq!(body.id, "550e8400-e29b-41d4-a716-446655440000");
    }

    #[test]
    fn invalid_table_rejected() {
        // This tests the allowlist logic directly
        assert!(!RESTORABLE_TABLES.contains(&"users"));
        assert!(!RESTORABLE_TABLES.contains(&"_sync_log"));
        assert!(!RESTORABLE_TABLES.contains(&"api_cache; DROP TABLE todos"));
    }
}
