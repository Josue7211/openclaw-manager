//! Immutable audit log for security-sensitive actions.
//!
//! All mutations to critical resources (secrets, todos, sessions) are recorded
//! here. The audit_log table is append-only — entries are never updated or deleted.

use axum::extract::{Query, State};
use axum::{Json, Router};
use axum::routing::get;
use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::SqlitePool;

use crate::error::{success_json, AppError};
use crate::server::{AppState, RequireAuth};

/// Insert an audit log entry. Fire-and-forget — callers should not fail a
/// request just because audit logging failed (log a warning instead).
pub async fn log_audit(
    db: &SqlitePool,
    user_id: &str,
    action: &str,
    resource_type: &str,
    resource_id: Option<&str>,
    details: Option<&str>,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO audit_log (user_id, action, resource_type, resource_id, details) \
         VALUES (?, ?, ?, ?, ?)",
    )
    .bind(user_id)
    .bind(action)
    .bind(resource_type)
    .bind(resource_id)
    .bind(details.unwrap_or("{}"))
    .execute(db)
    .await?;
    Ok(())
}

/// Convenience wrapper that logs a warning on failure instead of propagating.
/// Use this in route handlers where audit failure should not block the response.
pub async fn log_audit_or_warn(
    db: &SqlitePool,
    user_id: &str,
    action: &str,
    resource_type: &str,
    resource_id: Option<&str>,
    details: Option<&str>,
) {
    if let Err(e) = log_audit(db, user_id, action, resource_type, resource_id, details).await {
        tracing::warn!(
            action = action,
            resource_type = resource_type,
            "audit log write failed: {e}"
        );
    }
}

// ---------------------------------------------------------------------------
// GET /api/audit-log
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
pub struct AuditLogQuery {
    pub resource_type: Option<String>,
    pub action: Option<String>,
    pub limit: Option<i64>,
}

/// Return recent audit log entries for the authenticated user.
///
/// Query parameters:
/// - `resource_type` — filter by resource type (e.g. "todos", "secrets")
/// - `action` — filter by action (e.g. "create", "delete")
/// - `limit` — max entries to return (default 200, max 500)
async fn get_audit_log(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Query(params): Query<AuditLogQuery>,
) -> Result<Json<Value>, AppError> {
    let limit = params.limit.unwrap_or(200).min(500).max(1);

    // Build dynamic WHERE clause
    let mut conditions = vec!["user_id = ?".to_string()];
    if params.resource_type.is_some() {
        conditions.push("resource_type = ?".to_string());
    }
    if params.action.is_some() {
        conditions.push("action = ?".to_string());
    }

    let sql = format!(
        "SELECT id, user_id, action, resource_type, resource_id, details, created_at \
         FROM audit_log WHERE {} ORDER BY created_at DESC LIMIT ?",
        conditions.join(" AND ")
    );

    let mut query = sqlx::query_as::<_, (i64, String, String, String, Option<String>, String, String)>(&sql)
        .bind(&session.user_id);

    if let Some(ref rt) = params.resource_type {
        query = query.bind(rt);
    }
    if let Some(ref action) = params.action {
        query = query.bind(action);
    }
    query = query.bind(limit);

    let rows = query.fetch_all(&state.db).await?;

    let entries: Vec<Value> = rows
        .into_iter()
        .map(|(id, user_id, action, resource_type, resource_id, details, created_at)| {
            // Parse details back to JSON object if possible, otherwise keep as string
            let details_val = serde_json::from_str::<Value>(&details)
                .unwrap_or_else(|_| Value::String(details));
            json!({
                "id": id,
                "user_id": user_id,
                "action": action,
                "resource_type": resource_type,
                "resource_id": resource_id,
                "details": details_val,
                "created_at": created_at,
            })
        })
        .collect();

    Ok(success_json(json!(entries)))
}

pub fn router() -> Router<AppState> {
    Router::new().route("/audit-log", get(get_audit_log))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn audit_log_query_defaults() {
        let q: AuditLogQuery = serde_json::from_str("{}").unwrap();
        assert!(q.resource_type.is_none());
        assert!(q.action.is_none());
        assert!(q.limit.is_none());
    }

    #[test]
    fn audit_log_query_with_params() {
        let q: AuditLogQuery =
            serde_json::from_str(r#"{"resource_type":"todos","action":"create","limit":50}"#)
                .unwrap();
        assert_eq!(q.resource_type.as_deref(), Some("todos"));
        assert_eq!(q.action.as_deref(), Some("create"));
        assert_eq!(q.limit, Some(50));
    }

    #[tokio::test]
    async fn log_audit_insert_and_read() {
        // In-memory SQLite for testing
        let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
        sqlx::query(
            "CREATE TABLE audit_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                action TEXT NOT NULL,
                resource_type TEXT NOT NULL,
                resource_id TEXT,
                details TEXT DEFAULT '{}',
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            )",
        )
        .execute(&pool)
        .await
        .unwrap();

        // Insert
        log_audit(&pool, "user-1", "create", "todos", Some("todo-abc"), None)
            .await
            .unwrap();

        log_audit(
            &pool,
            "user-1",
            "delete",
            "secrets",
            Some("bluebubbles"),
            Some(r#"{"service":"bluebubbles"}"#),
        )
        .await
        .unwrap();

        // Read back
        let count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM audit_log WHERE user_id = ?")
            .bind("user-1")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(count.0, 2);

        // Verify resource filter
        let filtered: (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM audit_log WHERE user_id = ? AND resource_type = ?",
        )
        .bind("user-1")
        .bind("todos")
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(filtered.0, 1);
    }

    #[tokio::test]
    async fn log_audit_default_details() {
        let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
        sqlx::query(
            "CREATE TABLE audit_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                action TEXT NOT NULL,
                resource_type TEXT NOT NULL,
                resource_id TEXT,
                details TEXT DEFAULT '{}',
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            )",
        )
        .execute(&pool)
        .await
        .unwrap();

        log_audit(&pool, "user-1", "logout", "session", None, None)
            .await
            .unwrap();

        let row: (String,) =
            sqlx::query_as("SELECT details FROM audit_log WHERE user_id = ?")
                .bind("user-1")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(row.0, "{}");
    }
}
