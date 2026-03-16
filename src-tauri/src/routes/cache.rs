use axum::{extract::State, routing::get, Json, Router};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::RwLock;

use crate::error::AppError;
use crate::server::{AppState, RequireAuth};
use crate::supabase::SupabaseClient;

/// Stores hashes of last-upserted cache values to skip redundant writes.
static CACHE_HASHES: std::sync::LazyLock<RwLock<HashMap<String, u64>>> =
    std::sync::LazyLock::new(|| RwLock::new(HashMap::new()));

fn value_hash(v: &Value) -> u64 {
    use std::hash::{Hash, Hasher};
    let s = v.to_string();
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    s.hash(&mut hasher);
    hasher.finish()
}

/// Build the cache router (read/refresh Supabase cache rows).
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/cache", get(get_cache))
        .route("/cache-refresh", get(get_cache_refresh).post(post_cache_refresh))
}

// ── Cache ───────────────────────────────────────────────────────────────────

async fn get_cache(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let sb = SupabaseClient::from_state(&state)?;
    let data = sb.select_as_user("cache", "select=*", &session.access_token).await?;

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

async fn get_cache_refresh(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let sb = SupabaseClient::from_state(&state)?;
    let data = sb.select_as_user("cache", "select=*", &session.access_token).await?;
    Ok(Json(json!({ "rows": data })))
}

async fn post_cache_refresh(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    // In the Tauri desktop context, cache refresh fetches from the local Axum
    // server's own endpoints and upserts the results into Supabase.
    // For now, this is a stub — the frontend can orchestrate cache refreshes
    // by calling individual endpoints and posting results.
    let sb = SupabaseClient::from_state(&state)?;
    let jwt = &session.access_token;

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
            let jwt_ref = jwt;
            async move {
                let res = match client.get(&url).send().await {
                    Ok(r) if r.status().is_success() => r,
                    _ => return false,
                };
                let value: Value = match res.json().await {
                    Ok(v) => v,
                    Err(_) => return false,
                };

                // Skip upsert if value hasn't changed since last write
                let new_hash = value_hash(&value);
                let changed = {
                    let hashes = CACHE_HASHES.read().unwrap();
                    hashes.get(*key) != Some(&new_hash)
                };
                if !changed {
                    return true;
                }

                let now = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true);
                if sb_ref
                    .upsert_as_user(
                        "cache",
                        json!({ "key": key, "value": value, "updated_at": now }),
                        jwt_ref,
                    )
                    .await
                    .is_ok()
                {
                    let mut hashes = CACHE_HASHES.write().unwrap();
                    hashes.insert(key.to_string(), new_hash);
                }
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
