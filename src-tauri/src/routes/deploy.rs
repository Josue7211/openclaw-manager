use axum::{extract::State, routing::post, Json, Router};
use serde_json::{json, Value};

use crate::error::AppError;
use crate::server::{AppState, RequireAuth};
use crate::supabase::SupabaseClient;
use crate::validation::sanitize_postgrest_value;

/// Build the deploy router (transition awaiting_deploy agents to active).
pub fn router() -> Router<AppState> {
    Router::new().route("/deploy", post(post_deploy))
}

/// POST /deploy
///
/// Finds all agents with `status = 'awaiting_deploy'`, transitions them to
/// `active`, and returns success.  The frontend calls this with no JSON body.
async fn post_deploy(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let sb = SupabaseClient::from_state(&state)?;
    let jwt = &session.access_token;

    // Fetch agents that are awaiting deploy
    let agents = sb
        .select_as_user("agents", "select=id&status=eq.awaiting_deploy", jwt)
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
        sanitize_postgrest_value(id)?;
        sb.update_as_user(
            "agents",
            &format!("id=eq.{id}"),
            json!({
                "status": "active",
                "updated_at": now,
            }),
            jwt,
        )
        .await?;
    }

    Ok(Json(json!({ "ok": true, "deployed": ids.len() })))
}
