use axum::{extract::{Query, State}, routing::get, Json, Router};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::error::AppError;
use crate::server::AppState;
use crate::supabase::SupabaseClient;

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
    let pattern = format!("%25{q}%25");

    // Search todos and missions in parallel
    let todos_query = format!("select=id,text,done,created_at&text=ilike.{pattern}&limit=20");
    let missions_query = format!("select=id,title,status,created_at&title=ilike.{pattern}&limit=20");
    let (todos_result, missions_result) = tokio::join!(
        sb.select("todos", &todos_query),
        sb.select("missions", &missions_query),
    );

    let todos = todos_result.unwrap_or(json!([]));
    let missions = missions_result.unwrap_or(json!([]));

    Ok(Json(json!({
        "todos": todos,
        "missions": missions,
    })))
}
