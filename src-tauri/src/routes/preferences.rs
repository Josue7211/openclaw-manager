use axum::{extract::State, routing::get, Json, Router};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::error::{success_json, AppError};
use crate::server::{AppState, RequireAuth};

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
    let row: Option<(String,)> = sqlx::query_as(
        "SELECT preferences FROM user_preferences \
         WHERE user_id = ? AND deleted_at IS NULL \
         LIMIT 1",
    )
    .bind(&session.user_id)
    .fetch_optional(&state.db)
    .await?;

    let prefs = match row {
        Some((prefs_str,)) => {
            serde_json::from_str::<Value>(&prefs_str).unwrap_or(json!({}))
        }
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
    let existing_row: Option<(String, String)> = sqlx::query_as(
        "SELECT id, preferences FROM user_preferences \
         WHERE user_id = ? AND deleted_at IS NULL \
         LIMIT 1",
    )
    .bind(user_id)
    .fetch_optional(&state.db)
    .await?;

    let (row_id, existing) = match existing_row {
        Some((id, prefs_str)) => {
            let map = serde_json::from_str::<Value>(&prefs_str)
                .ok()
                .and_then(|v| v.as_object().cloned())
                .unwrap_or_default();
            (id, map)
        }
        None => (crate::routes::util::random_uuid(), serde_json::Map::new()),
    };

    // Merge: incoming keys overwrite existing keys (shallow merge)
    let mut merged = existing;
    if let Some(incoming) = body.preferences.as_object() {
        for (k, v) in incoming {
            merged.insert(k.clone(), v.clone());
        }
    }

    let now = chrono::Utc::now().to_rfc3339();
    let merged_str = serde_json::to_string(&Value::Object(merged.clone()))
        .map_err(|e| AppError::Internal(e.into()))?;

    // UPSERT: insert or update on conflict
    sqlx::query(
        "INSERT INTO user_preferences (id, user_id, preferences, updated_at) \
         VALUES (?, ?, ?, ?) \
         ON CONFLICT(id) DO UPDATE SET preferences = excluded.preferences, updated_at = excluded.updated_at",
    )
    .bind(&row_id)
    .bind(user_id)
    .bind(&merged_str)
    .bind(&now)
    .execute(&state.db)
    .await?;

    // Log for sync
    let payload = serde_json::to_string(&json!({
        "id": row_id,
        "user_id": user_id,
        "preferences": Value::Object(merged.clone()),
        "updated_at": now,
    }))
    .map_err(|e| AppError::Internal(e.into()))?;

    crate::sync::log_mutation(&state.db, "user_preferences", &row_id, "UPDATE", Some(&payload))
        .await
        .map_err(|e| AppError::Internal(e.into()))?;

    Ok(success_json(Value::Object(merged)))
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
