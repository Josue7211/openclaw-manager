use axum::{extract::State, routing::get, Json, Router};
use reqwest::Method;
use serde::Deserialize;
use serde_json::json;
use serde_json::Value;
use std::path::PathBuf;
use tokio::time::Duration;

use crate::error::AppError;
use crate::server::{AppState, RequireAuth};

use super::gateway::{gateway_forward, openclaw_api_key, openclaw_api_url};

// ── Router ──────────────────────────────────────────────────────────────────

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/openclaw/usage", get(get_usage))
        .route("/openclaw/models", get(get_models))
        .route(
            "/openclaw/runtime-config",
            get(get_runtime_config).patch(patch_runtime_config),
        )
}

// ── GET /openclaw/usage ─────────────────────────────────────────────────────

async fn get_usage(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let result = gateway_forward(&state, Method::GET, "/usage", None).await?;
    Ok(Json(result))
}

// ── GET /openclaw/models ────────────────────────────────────────────────────

async fn get_models(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let result = gateway_forward(&state, Method::GET, "/models", None).await?;
    Ok(Json(result))
}

#[derive(Debug, Default)]
struct OpenClawRuntimePrefs {
    chat_primary_model: Option<String>,
    heartbeat_model: Option<String>,
    favorite_models: Option<Vec<String>>,
}

impl OpenClawRuntimePrefs {
    fn overlay(&mut self, other: OpenClawRuntimePrefs) {
        if other.chat_primary_model.is_some() {
            self.chat_primary_model = other.chat_primary_model;
        }
        if other.heartbeat_model.is_some() {
            self.heartbeat_model = other.heartbeat_model;
        }
        if other.favorite_models.is_some() {
            self.favorite_models = other.favorite_models;
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PatchRuntimeConfigBody {
    #[serde(default)]
    chat_primary_model: Option<String>,
    #[serde(default)]
    heartbeat_model: Option<String>,
    #[serde(default)]
    favorite_models: Option<Vec<String>>,
}

fn openclaw_workspace_dir(state: &AppState) -> PathBuf {
    let base = state.secret("OPENCLAW_DIR").unwrap_or_else(|| {
        dirs::home_dir()
            .map(|h| h.join(".openclaw").to_string_lossy().into_owned())
            .unwrap_or_else(|| ".openclaw".to_string())
    });
    PathBuf::from(base).join("workspace")
}

fn normalize_model_id(value: Option<String>) -> Option<String> {
    value
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
}

fn normalize_favorite_models(models: Option<Vec<String>>) -> Option<Vec<String>> {
    models.map(|values| {
        let mut unique = Vec::new();
        for value in values {
            let trimmed = value.trim();
            if !trimmed.is_empty() && !unique.iter().any(|existing: &String| existing == trimmed) {
                unique.push(trimmed.to_string());
            }
        }
        unique
    })
}

async fn load_runtime_prefs(
    state: &AppState,
    user_id: &str,
) -> Result<(String, serde_json::Map<String, Value>, OpenClawRuntimePrefs), AppError> {
    let existing_row: Option<(String, String)> = sqlx::query_as(
        "SELECT id, preferences FROM user_preferences \
         WHERE user_id = ? AND deleted_at IS NULL \
         LIMIT 1",
    )
    .bind(user_id)
    .fetch_optional(&state.db)
    .await?;

    let (row_id, prefs_map) = match existing_row {
        Some((id, prefs_str)) => {
            let map = serde_json::from_str::<Value>(&prefs_str)
                .ok()
                .and_then(|v| v.as_object().cloned())
                .unwrap_or_default();
            (id, map)
        }
        None => (crate::routes::util::random_uuid(), serde_json::Map::new()),
    };

    let runtime = OpenClawRuntimePrefs {
        chat_primary_model: prefs_map
            .get("openclaw-chat-primary-model")
            .and_then(|v| v.as_str())
            .map(ToString::to_string),
        heartbeat_model: prefs_map
            .get("openclaw-heartbeat-model")
            .and_then(|v| v.as_str())
            .map(ToString::to_string),
        favorite_models: prefs_map
            .get("chat-favorite-models")
            .and_then(|v| v.as_array())
            .map(|items| {
                items
                    .iter()
                    .filter_map(|item| item.as_str().map(ToString::to_string))
                    .collect()
            }),
    };

    Ok((row_id, prefs_map, runtime))
}

async fn load_runtime_file(state: &AppState) -> OpenClawRuntimePrefs {
    if let Some(base) = openclaw_api_url(state) {
        let url = format!("{}/runtime-config", base);
        let key = openclaw_api_key(state);
        let mut req = state.http.get(url);
        if !key.is_empty() {
            req = req.header("Authorization", format!("Bearer {key}"));
        }
        return match req.timeout(Duration::from_secs(10)).send().await {
            Ok(resp) if resp.status().is_success() => resp
                .json::<Value>()
                .await
                .ok()
                .map(parse_runtime_config_value)
                .unwrap_or_default(),
            _ => OpenClawRuntimePrefs::default(),
        };
    }

    let path = openclaw_workspace_dir(state).join("OPENCLAW-PREFERENCES.json");
    match tokio::fs::read_to_string(path).await.ok() {
        Some(raw) => {
            parse_runtime_config_value(serde_json::from_str::<Value>(&raw).unwrap_or(Value::Null))
        }
        None => OpenClawRuntimePrefs::default(),
    }
}

fn parse_runtime_config_value(parsed: Value) -> OpenClawRuntimePrefs {
    OpenClawRuntimePrefs {
        chat_primary_model: parsed
            .get("chatPrimaryModel")
            .and_then(|v| v.as_str())
            .map(ToString::to_string),
        heartbeat_model: parsed
            .get("heartbeatModel")
            .and_then(|v| v.as_str())
            .map(ToString::to_string),
        favorite_models: parsed
            .get("favoriteModels")
            .and_then(|v| v.as_array())
            .map(|items| {
                items
                    .iter()
                    .filter_map(|item| item.as_str().map(ToString::to_string))
                    .collect()
            }),
    }
}

async fn persist_runtime_prefs(
    state: &AppState,
    row_id: &str,
    user_id: &str,
    prefs_map: serde_json::Map<String, Value>,
) -> Result<(), AppError> {
    let now = chrono::Utc::now().to_rfc3339();
    let prefs_value = Value::Object(prefs_map.clone());
    let prefs_str =
        serde_json::to_string(&prefs_value).map_err(|e| AppError::Internal(e.into()))?;

    sqlx::query(
        "INSERT INTO user_preferences (id, user_id, preferences, updated_at) \
         VALUES (?, ?, ?, ?) \
         ON CONFLICT(id) DO UPDATE SET preferences = excluded.preferences, updated_at = excluded.updated_at",
    )
    .bind(row_id)
    .bind(user_id)
    .bind(&prefs_str)
    .bind(&now)
    .execute(&state.db)
    .await?;

    let payload = serde_json::to_string(&json!({
        "user_id": user_id,
        "preferences": prefs_value,
        "updated_at": now,
    }))
    .map_err(|e| AppError::Internal(e.into()))?;

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

async fn write_runtime_file(state: &AppState, runtime: &OpenClawRuntimePrefs) {
    let payload = json!({
        "chatPrimaryModel": runtime.chat_primary_model,
        "heartbeatModel": runtime.heartbeat_model,
        "favoriteModels": runtime.favorite_models.clone().unwrap_or_default(),
        "updatedAt": chrono::Utc::now().to_rfc3339(),
        "managedBy": "clawcontrol",
    });

    if let Some(base) = openclaw_api_url(state) {
        let url = format!("{}/runtime-config", base);
        let key = openclaw_api_key(state);
        let mut req = state.http.patch(url).json(&payload);
        if !key.is_empty() {
            req = req.header("Authorization", format!("Bearer {key}"));
        }
        let _ = req.timeout(Duration::from_secs(10)).send().await;
        return;
    }

    let content = payload.to_string();
    let path = openclaw_workspace_dir(state).join("OPENCLAW-PREFERENCES.json");
    if let Some(parent) = path.parent() {
        let _ = tokio::fs::create_dir_all(parent).await;
    }
    let _ = tokio::fs::write(path, content.as_bytes()).await;
}

async fn apply_primary_chat_model(state: &AppState, model: &str) -> bool {
    let Some(base) = openclaw_api_url(state) else {
        return false;
    };

    let url = format!("{}/chat/model", base);
    let key = openclaw_api_key(state);
    let mut req = state.http.post(url).json(&json!({ "model": model }));
    if !key.is_empty() {
        req = req.header("Authorization", format!("Bearer {key}"));
    }

    match req.timeout(Duration::from_secs(10)).send().await {
        Ok(resp) => resp.status().is_success(),
        Err(_) => false,
    }
}

async fn get_runtime_config(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let (_row_id, _prefs_map, prefs_runtime) = load_runtime_prefs(&state, &session.user_id).await?;
    let mut runtime = load_runtime_file(&state).await;
    runtime.overlay(prefs_runtime);
    Ok(Json(json!({
        "chatPrimaryModel": runtime.chat_primary_model,
        "heartbeatModel": runtime.heartbeat_model,
        "favoriteModels": runtime.favorite_models.unwrap_or_default(),
    })))
}

async fn patch_runtime_config(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Json(body): Json<PatchRuntimeConfigBody>,
) -> Result<Json<Value>, AppError> {
    let (row_id, mut prefs_map, mut runtime) = load_runtime_prefs(&state, &session.user_id).await?;

    if let Some(value) = normalize_model_id(body.chat_primary_model) {
        prefs_map.insert("openclaw-chat-primary-model".into(), json!(value.clone()));
        prefs_map.insert("chat-model".into(), json!(value.clone()));
        runtime.chat_primary_model = Some(value);
    }

    if let Some(value) = normalize_model_id(body.heartbeat_model) {
        prefs_map.insert("openclaw-heartbeat-model".into(), json!(value.clone()));
        runtime.heartbeat_model = Some(value);
    }

    if let Some(values) = normalize_favorite_models(body.favorite_models) {
        prefs_map.insert("chat-favorite-models".into(), json!(values.clone()));
        runtime.favorite_models = Some(values);
    }

    persist_runtime_prefs(&state, &row_id, &session.user_id, prefs_map).await?;
    write_runtime_file(&state, &runtime).await;

    let applied = if let Some(model) = runtime.chat_primary_model.as_deref() {
        apply_primary_chat_model(&state, model).await
    } else {
        false
    };

    Ok(Json(json!({
        "ok": true,
        "chatPrimaryModel": runtime.chat_primary_model,
        "heartbeatModel": runtime.heartbeat_model,
        "favoriteModels": runtime.favorite_models.unwrap_or_default(),
        "appliedChatModel": applied,
    })))
}

// ── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::super::gateway::validate_gateway_path;
    use super::*;

    #[test]
    fn validate_usage_path() {
        assert!(validate_gateway_path("/usage").is_ok());
    }

    #[test]
    fn validate_models_path() {
        assert!(validate_gateway_path("/models").is_ok());
    }

    #[test]
    fn reject_usage_with_injection() {
        assert!(validate_gateway_path("/usage?inject=true").is_err());
    }

    #[test]
    fn runtime_overlay_prefers_runtime_values() {
        let mut prefs = OpenClawRuntimePrefs {
            chat_primary_model: Some("openai/gpt-5".into()),
            heartbeat_model: Some("llama-desktop/qwen".into()),
            favorite_models: Some(vec!["openai/gpt-5".into()]),
        };
        let runtime = OpenClawRuntimePrefs {
            chat_primary_model: Some("openai-codex/gpt-5.4".into()),
            heartbeat_model: None,
            favorite_models: Some(vec![
                "openai-codex/gpt-5.4".into(),
                "openai/gpt-5-mini".into(),
            ]),
        };

        prefs.overlay(runtime);

        assert_eq!(
            prefs.chat_primary_model.as_deref(),
            Some("openai-codex/gpt-5.4")
        );
        assert_eq!(prefs.heartbeat_model.as_deref(), Some("llama-desktop/qwen"));
        assert_eq!(
            prefs.favorite_models,
            Some(vec![
                "openai-codex/gpt-5.4".into(),
                "openai/gpt-5-mini".into()
            ])
        );
    }

    #[test]
    fn normalize_favorite_models_trims_and_dedupes() {
        let normalized = normalize_favorite_models(Some(vec![
            " openai/gpt-5 ".into(),
            "".into(),
            "openai/gpt-5".into(),
            "openai/gpt-5-mini".into(),
        ]));

        assert_eq!(
            normalized,
            Some(vec!["openai/gpt-5".into(), "openai/gpt-5-mini".into()])
        );
    }

    #[test]
    fn parse_runtime_config_value_extracts_expected_fields() {
        let parsed = parse_runtime_config_value(json!({
            "chatPrimaryModel": "openai-codex/gpt-5.4",
            "heartbeatModel": "llama-desktop/qwen",
            "favoriteModels": ["openai-codex/gpt-5.4", "openai/gpt-5-mini"]
        }));

        assert_eq!(
            parsed.chat_primary_model.as_deref(),
            Some("openai-codex/gpt-5.4")
        );
        assert_eq!(
            parsed.heartbeat_model.as_deref(),
            Some("llama-desktop/qwen")
        );
        assert_eq!(
            parsed.favorite_models,
            Some(vec![
                "openai-codex/gpt-5.4".into(),
                "openai/gpt-5-mini".into()
            ])
        );
    }
}
