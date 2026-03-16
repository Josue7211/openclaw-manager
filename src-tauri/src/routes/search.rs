use axum::{extract::{Query, State}, routing::get, Json, Router};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::error::AppError;
use crate::server::{AppState, RequireAuth};
use crate::supabase::SupabaseClient;
use crate::validation::sanitize_search_query;

/// Build the search router (cross-table search across todos and missions).
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/search", get(get_search))
}

// ── Search ──────────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct SearchQuery {
    q: Option<String>,
}

async fn get_search(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Query(params): Query<SearchQuery>,
) -> Result<Json<Value>, AppError> {
    let q = params.q.as_deref().unwrap_or("").trim().to_string();

    if q.is_empty() {
        return Ok(Json(json!({
            "todos": [],
            "missions": [],
        })));
    }

    let sb = SupabaseClient::from_state(&state)?;
    let jwt = &session.access_token;
    let safe_q = sanitize_search_query(&q);
    let pattern = format!("%25{safe_q}%25");

    // Search todos and missions in parallel
    let todos_query = format!("select=id,text,done,created_at&text=ilike.{pattern}&limit=20");
    let missions_query = format!("select=id,title,status,created_at&title=ilike.{pattern}&limit=20");
    let (todos_result, missions_result) = tokio::join!(
        sb.select_as_user("todos", &todos_query, jwt),
        sb.select_as_user("missions", &missions_query, jwt),
    );

    let todos = todos_result.unwrap_or(json!([]));
    let missions = missions_result.unwrap_or(json!([]));

    Ok(Json(json!({
        "todos": todos,
        "missions": missions,
    })))
}
