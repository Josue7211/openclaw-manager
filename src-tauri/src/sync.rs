//! Offline-first sync engine: pushes local mutations to Supabase and pulls
//! remote changes into local SQLite. Runs as a background tokio task on a
//! 30-second interval. Skips cycles when Supabase is unreachable.
//!
//! Conflict resolution: **local wins**. If a row has unsynced local changes
//! when a remote update arrives, the remote update is logged to `_conflict_log`
//! and skipped — the local version will be pushed on the next cycle.

use sqlx::SqlitePool;
use serde_json::Value;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{debug, info, warn};

use crate::server::UserSession;
use crate::supabase::SupabaseClient;

/// Tables to sync between local SQLite and remote Supabase.
const SYNC_TABLES: &[&str] = &[
    "todos",
    "missions",
    "mission_events",
    "agents",
    "ideas",
    "captures",
    "habits",
    "habit_entries",
    "user_preferences",
    "changelog_entries",
    "decisions",
    "knowledge_entries",
    "daily_reviews",
    "weekly_reviews",
    "retrospectives",
    "workflow_notes",
    "cache",
];

/// Background sync engine that keeps local SQLite in sync with Supabase.
pub struct SyncEngine {
    db: SqlitePool,
    supabase_url: String,
    service_key: String,
    session: Arc<RwLock<Option<UserSession>>>,
}

impl SyncEngine {
    pub fn new(
        db: SqlitePool,
        supabase_url: String,
        service_key: String,
        session: Arc<RwLock<Option<UserSession>>>,
    ) -> Self {
        Self {
            db,
            supabase_url,
            service_key,
            session,
        }
    }

    /// Start the background sync loop. Runs push+pull every 30 seconds.
    /// Reads the JWT from the shared session on each cycle (handles token
    /// refresh transparently).
    pub fn start(self) {
        tokio::spawn(async move {
            // Wait a few seconds for the app to settle before first sync
            tokio::time::sleep(std::time::Duration::from_secs(5)).await;

            let mut interval = tokio::time::interval(std::time::Duration::from_secs(30));
            loop {
                interval.tick().await;

                // Read current JWT from the shared session
                let jwt = {
                    let guard = self.session.read().await;
                    match guard.as_ref() {
                        Some(s) => s.access_token.clone(),
                        None => {
                            debug!("sync: no active session, skipping cycle");
                            continue;
                        }
                    }
                };

                if let Err(e) = self.sync_cycle(&jwt).await {
                    warn!("sync cycle failed: {e}");
                }
            }
        });
    }

    async fn sync_cycle(&self, jwt: &str) -> anyhow::Result<()> {
        if self.supabase_url.is_empty() || self.service_key.is_empty() {
            debug!("sync: supabase not configured, skipping");
            return Ok(());
        }

        // Check if Supabase is reachable
        let client = SupabaseClient::new(&self.supabase_url, &self.service_key);
        if !client.health_check().await {
            debug!("sync: supabase unreachable, skipping cycle");
            return Ok(());
        }

        self.push(&client, jwt).await?;
        self.pull(&client, jwt).await?;
        Ok(())
    }

    /// Push local changes (from `_sync_log`) to Supabase.
    async fn push(&self, client: &SupabaseClient, jwt: &str) -> anyhow::Result<()> {
        let pending: Vec<(i64, String, String, String, Option<String>)> = sqlx::query_as(
            "SELECT id, table_name, row_id, operation, payload \
             FROM _sync_log WHERE synced_at IS NULL ORDER BY id",
        )
        .fetch_all(&self.db)
        .await?;

        if pending.is_empty() {
            return Ok(());
        }

        info!("sync: pushing {} pending changes", pending.len());

        for (log_id, table, row_id, operation, payload) in &pending {
            let result = match operation.as_str() {
                "INSERT" | "UPDATE" => {
                    if let Some(data) = payload {
                        let body: Value = serde_json::from_str(data)
                            .map_err(|e| anyhow::anyhow!("bad sync payload: {e}"))?;
                        client
                            .upsert_as_user(&table, body, jwt)
                            .await
                            .map(|_| ())
                    } else {
                        continue;
                    }
                }
                "DELETE" => {
                    client
                        .delete_as_user(&table, &format!("id=eq.{}", row_id), jwt)
                        .await
                }
                _ => continue,
            };

            match result {
                Ok(_) => {
                    sqlx::query("UPDATE _sync_log SET synced_at = unixepoch() WHERE id = ?")
                        .bind(log_id)
                        .execute(&self.db)
                        .await?;
                }
                Err(e) => {
                    warn!("sync push failed for {table}/{row_id}: {e}");
                    // Don't mark as synced — will retry next cycle
                }
            }
        }

        Ok(())
    }

    /// Pull remote changes from Supabase into local SQLite.
    async fn pull(&self, client: &SupabaseClient, jwt: &str) -> anyhow::Result<()> {
        for table in SYNC_TABLES {
            if let Err(e) = self.pull_table(client, jwt, table).await {
                warn!("sync pull failed for {table}: {e}");
            }
        }
        Ok(())
    }

    async fn pull_table(
        &self,
        client: &SupabaseClient,
        jwt: &str,
        table: &str,
    ) -> anyhow::Result<()> {
        let last_synced: Option<String> = sqlx::query_scalar(
            "SELECT last_synced_at FROM _sync_state WHERE table_name = ?",
        )
        .bind(table)
        .fetch_optional(&self.db)
        .await?
        .flatten();

        let query = match &last_synced {
            Some(ts) => format!(
                "select=*&updated_at=gt.{}&order=updated_at.asc&limit=500",
                ts
            ),
            None => "select=*&order=updated_at.asc&limit=500".to_string(),
        };

        let rows = client.select_as_user(table, &query, jwt).await?;
        let rows = match rows.as_array() {
            Some(arr) if !arr.is_empty() => arr,
            _ => return Ok(()),
        };

        debug!("sync: pulling {} rows for {table}", rows.len());

        for row in rows {
            let id = row.get("id").and_then(|v| v.as_str()).unwrap_or("");
            if id.is_empty() {
                continue;
            }

            // Check for conflict: does local have a pending unsynced change for this row?
            let has_pending: bool = sqlx::query_scalar(
                "SELECT COUNT(*) > 0 FROM _sync_log \
                 WHERE table_name = ? AND row_id = ? AND synced_at IS NULL",
            )
            .bind(table)
            .bind(id)
            .fetch_one(&self.db)
            .await?;

            if has_pending {
                // Conflict: local has unsynced changes. Log it, let local win.
                let local_json: Option<String> = sqlx::query_scalar(&format!(
                    "SELECT json_object('id', id, 'updated_at', updated_at) FROM {table} WHERE id = ?"
                ))
                .bind(id)
                .fetch_optional(&self.db)
                .await?
                .flatten();

                sqlx::query(
                    "INSERT INTO _conflict_log (table_name, row_id, local_data, remote_data, resolution) \
                     VALUES (?, ?, ?, ?, 'local_wins')",
                )
                .bind(table)
                .bind(id)
                .bind(&local_json)
                .bind(&serde_json::to_string(row).unwrap_or_default())
                .execute(&self.db)
                .await?;

                debug!("sync: conflict on {table}/{id} - local wins");
                continue;
            }

            // Check if soft-deleted remotely
            let deleted_at = row
                .get("deleted_at")
                .and_then(|v| v.as_str())
                .filter(|s| !s.is_empty());

            if deleted_at.is_some() {
                // Soft-deleted remotely — hard-delete locally
                sqlx::query(&format!("DELETE FROM {table} WHERE id = ?"))
                    .bind(id)
                    .execute(&self.db)
                    .await?;
            } else {
                // Upsert into local SQLite with full column mapping for tables
                // that are read locally (offline-first).
                self.upsert_row(table, row).await?;
            }
        }

        // Update sync cursor
        if let Some(last_row) = rows.last() {
            let ts = last_row
                .get("updated_at")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            sqlx::query(
                "INSERT INTO _sync_state (table_name, last_synced_at) VALUES (?, ?) \
                 ON CONFLICT(table_name) DO UPDATE SET last_synced_at = excluded.last_synced_at",
            )
            .bind(table)
            .bind(ts)
            .execute(&self.db)
            .await?;
        }

        Ok(())
    }

    /// Upsert a row from Supabase into local SQLite.
    ///
    /// Tables that are read locally (offline-first) get full column mapping.
    /// All other tables fall back to the minimal (id, user_id, updated_at) upsert
    /// which is enough for sync metadata tracking.
    async fn upsert_row(&self, table: &str, row: &Value) -> anyhow::Result<()> {
        match table {
            "mission_events" => self.upsert_mission_event(row).await,
            _ => self.upsert_generic(table, row).await,
        }
    }

    /// Generic upsert: stores id, user_id, and updated_at.
    async fn upsert_generic(&self, table: &str, row: &Value) -> anyhow::Result<()> {
        let id = row.get("id").and_then(|v| v.as_str()).unwrap_or("");
        let user_id = row.get("user_id").and_then(|v| v.as_str()).unwrap_or("");
        let updated_at = row.get("updated_at").and_then(|v| v.as_str()).unwrap_or("");

        sqlx::query(&format!(
            "INSERT INTO {table} (id, user_id, updated_at) VALUES (?, ?, ?) \
             ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at"
        ))
        .bind(id)
        .bind(user_id)
        .bind(updated_at)
        .execute(&self.db)
        .await?;

        Ok(())
    }

    /// Full-column upsert for mission_events (read locally for offline access).
    async fn upsert_mission_event(&self, row: &Value) -> anyhow::Result<()> {
        let str_field = |key| row.get(key).and_then(|v| v.as_str()).unwrap_or("");
        let opt_str = |key| row.get(key).and_then(|v| v.as_str()).map(|s| s.to_string());

        let id = str_field("id");
        let user_id = str_field("user_id");
        let mission_id = str_field("mission_id");
        let seq = row.get("seq").and_then(|v| v.as_i64()).unwrap_or(0);
        let event_type = str_field("event_type");
        let content = str_field("content");
        let file_path = opt_str("file_path");
        let tool_input = opt_str("tool_input");
        let tool_output = opt_str("tool_output");
        let model_name = opt_str("model_name");
        let elapsed_seconds: Option<f64> = row.get("elapsed_seconds").and_then(|v| v.as_f64());
        let created_at = str_field("created_at");
        let updated_at = str_field("updated_at");

        sqlx::query(
            "INSERT INTO mission_events \
             (id, user_id, mission_id, seq, event_type, content, file_path, \
              tool_input, tool_output, model_name, elapsed_seconds, created_at, updated_at) \
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) \
             ON CONFLICT(id) DO UPDATE SET \
               seq = excluded.seq, \
               event_type = excluded.event_type, \
               content = excluded.content, \
               file_path = excluded.file_path, \
               tool_input = excluded.tool_input, \
               tool_output = excluded.tool_output, \
               model_name = excluded.model_name, \
               elapsed_seconds = excluded.elapsed_seconds, \
               updated_at = excluded.updated_at"
        )
        .bind(id)
        .bind(user_id)
        .bind(mission_id)
        .bind(seq)
        .bind(event_type)
        .bind(content)
        .bind(&file_path)
        .bind(&tool_input)
        .bind(&tool_output)
        .bind(&model_name)
        .bind(elapsed_seconds)
        .bind(created_at)
        .bind(updated_at)
        .execute(&self.db)
        .await?;

        Ok(())
    }
}

/// Check whether the client can reach Supabase (for health endpoints).
pub async fn is_supabase_reachable(supabase_url: &str, service_key: &str) -> bool {
    if supabase_url.is_empty() || service_key.is_empty() {
        return false;
    }
    let client = SupabaseClient::new(supabase_url, service_key);
    client.health_check().await
}

/// Log a mutation to `_sync_log` so the sync engine can push it to Supabase.
///
/// Call this after every local SQLite INSERT/UPDATE/DELETE on a synced table.
pub async fn log_mutation(
    db: &SqlitePool,
    table: &str,
    row_id: &str,
    operation: &str,
    payload: Option<&str>,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO _sync_log (table_name, row_id, operation, payload) VALUES (?, ?, ?, ?)",
    )
    .bind(table)
    .bind(row_id)
    .bind(operation)
    .bind(payload)
    .execute(db)
    .await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sync_tables_not_empty() {
        assert!(!SYNC_TABLES.is_empty());
    }

    #[test]
    fn sync_tables_contains_todos() {
        assert!(SYNC_TABLES.contains(&"todos"));
    }

    #[test]
    fn sync_tables_contains_missions() {
        assert!(SYNC_TABLES.contains(&"missions"));
    }

    #[test]
    fn sync_tables_contains_agents() {
        assert!(SYNC_TABLES.contains(&"agents"));
    }

    #[test]
    fn sync_tables_contains_mission_events() {
        assert!(SYNC_TABLES.contains(&"mission_events"));
    }

    #[test]
    fn sync_tables_contains_all_expected() {
        let expected = vec![
            "todos", "missions", "mission_events", "agents", "ideas",
            "captures", "habits", "habit_entries", "user_preferences",
            "changelog_entries", "decisions", "knowledge_entries",
            "daily_reviews", "weekly_reviews", "retrospectives",
            "workflow_notes", "cache",
        ];
        for table in expected {
            assert!(
                SYNC_TABLES.contains(&table),
                "SYNC_TABLES should contain {table}"
            );
        }
    }

    #[tokio::test]
    async fn is_supabase_reachable_returns_false_for_empty_url() {
        assert!(!is_supabase_reachable("", "key").await);
    }

    #[tokio::test]
    async fn is_supabase_reachable_returns_false_for_empty_key() {
        assert!(!is_supabase_reachable("http://localhost:54321", "").await);
    }
}
