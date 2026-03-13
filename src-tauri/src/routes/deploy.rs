use axum::{extract::State, routing::post, Json, Router};
use serde_json::{json, Value};

use crate::error::AppError;
use crate::server::AppState;
use crate::supabase::SupabaseClient;

pub fn router() -> Router<AppState> {
    Router::new().route("/deploy", post(post_deploy))
}

/// POST /deploy
///
/// Finds all agents with `status = 'awaiting_deploy'`, transitions them to
/// `active`, and returns success.  The frontend calls this with no JSON body.
async fn post_deploy(
    State(_state): State<AppState>,
) -> Result<Json<Value>, AppError> {
    let sb = SupabaseClient::from_env()?;

    // Fetch agents that are awaiting deploy
    let agents = sb
        .select("agents", "select=id&status=eq.awaiting_deploy")
        .await?;

    let ids: Vec<&str> = agents
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|a| a.get("id").and_then(|v| v.as_str()))
                .collect()
        })
        .unwrap_or_default();

    if ids.is_empty() {
        return Ok(Json(json!({ "ok": true, "deployed": 0 })));
    }

    // Transition each awaiting agent to active
    let now = chrono::Utc::now().to_rfc3339();
    for id in &ids {
        sb.update(
            "agents",
            &format!("id=eq.{id}"),
            json!({
                "status": "active",
                "updated_at": now,
            }),
        )
        .await?;
    }

    Ok(Json(json!({ "ok": true, "deployed": ids.len() })))
}
