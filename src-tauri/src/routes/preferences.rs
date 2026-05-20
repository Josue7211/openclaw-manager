use axum::{extract::State, routing::get, Json, Router};
use serde::Deserialize;
use serde_json::{json, Map, Value};
use tracing::{debug, warn};

use crate::error::{success_json, AppError};
use crate::server::{AppState, RequireAuth, UserSession};
use crate::supabase::SupabaseClient;

/// Build the user-preferences router (get/patch preferences in local SQLite).
pub fn router() -> Router<AppState> {
    Router::new().route(
        "/user-preferences",
        get(get_preferences).patch(patch_preferences),
    )
}

// ── GET /api/user-preferences ───────────────────────────────────────────────
//
// Returns the full preferences JSON object for the authenticated user.
// If no row exists yet, returns an empty object.

async fn get_preferences(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    if let Some(remote) = fetch_remote_preferences(&state, &session).await {
        upsert_local_preferences(
            &state,
            &session.user_id,
            remote.preferences.clone(),
            remote.updated_at.as_deref(),
        )
        .await?;
        return Ok(success_json(remote.preferences));
    }

    let row: Option<(String,)> = sqlx::query_as(
        "SELECT preferences FROM user_preferences \
         WHERE user_id = ? AND deleted_at IS NULL \
         LIMIT 1",
    )
    .bind(&session.user_id)
    .fetch_optional(&state.db)
    .await?;

    let prefs = match row {
        Some((prefs_str,)) => serde_json::from_str::<Value>(&prefs_str).unwrap_or(json!({})),
        None => json!({}),
    };

    Ok(success_json(prefs))
}

// ── PATCH /api/user-preferences ─────────────────────────────────────────────
//
// Merges the provided JSON object into the existing preferences.
// Uses SQLite UPSERT so the row is created on first write.

#[derive(Debug, Deserialize)]
struct PatchBody {
    preferences: Value,
}

async fn patch_preferences(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Json(body): Json<PatchBody>,
) -> Result<Json<Value>, AppError> {
    if !body.preferences.is_object() {
        return Err(AppError::BadRequest(
            "preferences must be a JSON object".into(),
        ));
    }

    let user_id = &session.user_id;

    // Read existing preferences (if any)
    let existing = read_local_preferences(&state, user_id).await?;

    // Merge: incoming keys overwrite existing keys (shallow merge)
    let mut merged = existing;
    if let Some(incoming) = body.preferences.as_object() {
        for (k, v) in incoming {
            merged.insert(k.clone(), v.clone());
        }
    }

    let now = chrono::Utc::now().to_rfc3339();
    let merged_value = Value::Object(merged.clone());
    upsert_local_preferences(&state, user_id, merged_value.clone(), Some(&now)).await?;

    let sync_payload = json!({
        "user_id": user_id,
        "preferences": merged_value,
        "updated_at": now,
    });

    if let Err(err) = upsert_remote_preferences(&state, &session, sync_payload.clone()).await {
        warn!(user_id = %user_id, "direct user_preferences sync failed; queueing background retry: {err}");
        queue_preferences_sync_retry(&state, user_id, sync_payload).await?;
    } else {
        debug!(user_id = %user_id, "user_preferences synced directly to Supabase");
    }

    Ok(success_json(Value::Object(merged)))
}

struct RemotePreferences {
    preferences: Value,
    updated_at: Option<String>,
}

fn supabase_client_for_user_preferences(state: &AppState) -> anyhow::Result<SupabaseClient> {
    let url = state
        .secret("SUPABASE_URL")
        .ok_or_else(|| anyhow::anyhow!("SUPABASE_URL not set"))?;
    let project_key = state
        .secret("SUPABASE_ANON_KEY")
        .or_else(|| state.secret("VITE_SUPABASE_ANON_KEY"))
        .or_else(|| state.secret("SUPABASE_SERVICE_ROLE_KEY"))
        .ok_or_else(|| anyhow::anyhow!("Supabase key not set"))?;

    Ok(SupabaseClient::new(&url, &project_key))
}

async fn fetch_remote_preferences(
    state: &AppState,
    session: &UserSession,
) -> Option<RemotePreferences> {
    let client = match supabase_client_for_user_preferences(state) {
        Ok(client) => client,
        Err(err) => {
            debug!("remote user_preferences fetch skipped: {err}");
            return None;
        }
    };

    let query = format!(
        "select=preferences,updated_at&user_id=eq.{}",
        urlencoding::encode(&session.user_id),
    );
    match client
        .select_single_as_user("user_preferences", &query, &session.access_token)
        .await
    {
        Ok(row) => Some(RemotePreferences {
            preferences: row.get("preferences").cloned().unwrap_or_else(|| json!({})),
            updated_at: row
                .get("updated_at")
                .and_then(|value| value.as_str())
                .map(ToOwned::to_owned),
        }),
        Err(err) => {
            debug!(user_id = %session.user_id, "remote user_preferences JSON blob fetch missed or failed: {err}");
            fetch_remote_preferences_key_value(&client, session).await
        }
    }
}

async fn fetch_remote_preferences_key_value(
    client: &SupabaseClient,
    session: &UserSession,
) -> Option<RemotePreferences> {
    let query = format!(
        "select=key,value,updated_at&user_id=eq.{}&deleted_at=is.null",
        urlencoding::encode(&session.user_id),
    );
    let rows = match client
        .select_as_user("user_preferences", &query, &session.access_token)
        .await
    {
        Ok(Value::Array(rows)) => rows,
        Ok(_) => return None,
        Err(err) => {
            debug!(user_id = %session.user_id, "remote user_preferences key/value fetch failed: {err}");
            return None;
        }
    };

    if rows.is_empty() {
        return None;
    }

    let mut preferences = Map::new();
    let mut updated_at: Option<String> = None;
    for row in rows {
        let Some(key) = row.get("key").and_then(Value::as_str) else {
            continue;
        };
        let raw_value = row.get("value").cloned().unwrap_or(Value::Null);
        preferences.insert(key.to_string(), decode_key_value_preference(raw_value));
        if updated_at.is_none() {
            updated_at = row
                .get("updated_at")
                .and_then(Value::as_str)
                .map(ToOwned::to_owned);
        }
    }

    Some(RemotePreferences {
        preferences: Value::Object(preferences),
        updated_at,
    })
}

fn decode_key_value_preference(value: Value) -> Value {
    match value {
        Value::String(text) => serde_json::from_str::<Value>(&text).unwrap_or(Value::String(text)),
        other => other,
    }
}

async fn upsert_remote_preferences(
    state: &AppState,
    session: &UserSession,
    row: Value,
) -> anyhow::Result<()> {
    let client = supabase_client_for_user_preferences(state)?;
    if client
        .upsert_as_user("user_preferences", row.clone(), &session.access_token)
        .await
        .is_ok()
    {
        return Ok(());
    }

    upsert_remote_preferences_key_value(&client, session, &row).await
}

async fn upsert_remote_preferences_key_value(
    client: &SupabaseClient,
    session: &UserSession,
    row: &Value,
) -> anyhow::Result<()> {
    let preferences = row
        .get("preferences")
        .and_then(Value::as_object)
        .ok_or_else(|| anyhow::anyhow!("preferences payload missing object"))?;
    let updated_at_string = row
        .get("updated_at")
        .and_then(Value::as_str)
        .map(ToOwned::to_owned)
        .unwrap_or_else(|| chrono::Utc::now().to_rfc3339());

    let rows = preferences
        .iter()
        .map(|(key, value)| {
            json!({
                "user_id": session.user_id,
                "key": key,
                "value": encode_key_value_preference(value),
                "updated_at": updated_at_string,
            })
        })
        .collect::<Vec<_>>();

    if rows.is_empty() {
        return Ok(());
    }

    client
        .upsert_as_user_on_conflict(
            "user_preferences",
            "user_id,key",
            Value::Array(rows),
            &session.access_token,
        )
        .await
        .map(|_| ())
}

fn encode_key_value_preference(value: &Value) -> String {
    match value {
        Value::String(text) => text.clone(),
        other => other.to_string(),
    }
}

async fn read_local_preferences(
    state: &AppState,
    user_id: &str,
) -> Result<Map<String, Value>, AppError> {
    let row: Option<(String,)> = sqlx::query_as(
        "SELECT preferences FROM user_preferences \
         WHERE user_id = ? AND deleted_at IS NULL \
         LIMIT 1",
    )
    .bind(user_id)
    .fetch_optional(&state.db)
    .await?;

    Ok(row
        .and_then(|(prefs_str,)| {
            serde_json::from_str::<Value>(&prefs_str)
                .ok()
                .and_then(|value| value.as_object().cloned())
        })
        .unwrap_or_default())
}

async fn upsert_local_preferences(
    state: &AppState,
    user_id: &str,
    preferences: Value,
    updated_at: Option<&str>,
) -> Result<(), AppError> {
    let existing_id: Option<String> = sqlx::query_scalar(
        "SELECT id FROM user_preferences \
         WHERE user_id = ? AND deleted_at IS NULL \
         LIMIT 1",
    )
    .bind(user_id)
    .fetch_optional(&state.db)
    .await?;

    let row_id = existing_id.unwrap_or_else(crate::routes::util::random_uuid);
    let now = updated_at
        .map(ToOwned::to_owned)
        .unwrap_or_else(|| chrono::Utc::now().to_rfc3339());
    let prefs_str =
        serde_json::to_string(&preferences).map_err(|e| AppError::Internal(e.into()))?;

    sqlx::query(
        "INSERT INTO user_preferences (id, user_id, preferences, updated_at) \
         VALUES (?, ?, ?, ?) \
         ON CONFLICT(id) DO UPDATE SET \
           preferences = excluded.preferences, \
           updated_at = excluded.updated_at, \
           deleted_at = NULL",
    )
    .bind(&row_id)
    .bind(user_id)
    .bind(&prefs_str)
    .bind(&now)
    .execute(&state.db)
    .await?;

    Ok(())
}

async fn queue_preferences_sync_retry(
    state: &AppState,
    user_id: &str,
    payload: Value,
) -> Result<(), AppError> {
    let payload = serde_json::to_string(&payload).map_err(|e| AppError::Internal(e.into()))?;

    crate::sync::log_mutation(
        &state.db,
        "user_preferences",
        user_id,
        "UPDATE",
        Some(&payload),
    )
    .await
    .map_err(|e| AppError::Internal(e.into()))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn merge_preferences() {
        let mut existing = serde_json::Map::new();
        existing.insert("theme".into(), json!("dark"));
        existing.insert("sidebar-width".into(), json!(260));

        let incoming = json!({ "theme": "light", "accent-color": "#60a5fa" });

        let mut merged = existing;
        if let Some(inc) = incoming.as_object() {
            for (k, v) in inc {
                merged.insert(k.clone(), v.clone());
            }
        }

        assert_eq!(merged.get("theme"), Some(&json!("light")));
        assert_eq!(merged.get("sidebar-width"), Some(&json!(260)));
        assert_eq!(merged.get("accent-color"), Some(&json!("#60a5fa")));
    }
}
