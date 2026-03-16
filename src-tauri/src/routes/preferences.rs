use axum::{extract::State, routing::get, Json, Router};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::error::{success_json, AppError};
use crate::server::AppState;
use crate::supabase::SupabaseClient;

// ── Required Supabase table ─────────────────────────────────────────────────
//
//   CREATE TABLE IF NOT EXISTS user_preferences (
//     user_id TEXT PRIMARY KEY DEFAULT 'default',
//     preferences JSONB NOT NULL DEFAULT '{}',
//     updated_at TIMESTAMPTZ DEFAULT NOW()
//   );
//
// ─────────────────────────────────────────────────────────────────────────────

const TABLE: &str = "user_preferences";
const USER_ID: &str = "default";

/// Build the user-preferences router (get/patch JSONB preferences in Supabase).
pub fn router() -> Router<AppState> {
    Router::new().route(
        "/user-preferences",
        get(get_preferences).patch(patch_preferences),
    )
}

// ── GET /api/user-preferences ───────────────────────────────────────────────
//
// Returns the full preferences JSONB object for the default user.
// If no row exists yet, returns an empty object.

async fn get_preferences(
    State(state): State<AppState>,
) -> Result<Json<Value>, AppError> {
    let sb = SupabaseClient::from_state(&state)?;

    let query = format!("select=preferences&user_id=eq.{USER_ID}");
    match sb.select_single(TABLE, &query).await {
        Ok(row) => {
            let prefs = row.get("preferences").cloned().unwrap_or(json!({}));
            Ok(success_json(prefs))
        }
        Err(_) => {
            // No row found — return empty preferences
            Ok(success_json(json!({})))
        }
    }
}

// ── PATCH /api/user-preferences ─────────────────────────────────────────────
//
// Merges the provided JSON object into the existing preferences.
// Uses Supabase upsert so the row is created on first write.

#[derive(Debug, Deserialize)]
struct PatchBody {
    preferences: Value,
}

async fn patch_preferences(
    State(state): State<AppState>,
    Json(body): Json<PatchBody>,
) -> Result<Json<Value>, AppError> {
    if !body.preferences.is_object() {
        return Err(AppError::BadRequest(
            "preferences must be a JSON object".into(),
        ));
    }

    let sb = SupabaseClient::from_state(&state)?;

    // Read existing preferences (if any)
    let query = format!("select=preferences&user_id=eq.{USER_ID}");
    let existing = match sb.select_single(TABLE, &query).await {
        Ok(row) => row
            .get("preferences")
            .and_then(|v| v.as_object().cloned())
            .unwrap_or_default(),
        Err(_) => serde_json::Map::new(),
    };

    // Merge: incoming keys overwrite existing keys (shallow merge)
    let mut merged = existing;
    if let Some(incoming) = body.preferences.as_object() {
        for (k, v) in incoming {
            merged.insert(k.clone(), v.clone());
        }
    }

    let now = chrono::Utc::now().to_rfc3339();
    let row = json!({
        "user_id": USER_ID,
        "preferences": Value::Object(merged.clone()),
        "updated_at": now,
    });

    sb.upsert(TABLE, row).await?;

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
