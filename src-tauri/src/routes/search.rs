use axum::{extract::{Query, State}, routing::get, Json, Router};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::error::AppError;
use crate::server::{AppState, RequireAuth};
use crate::supabase::SupabaseClient;
use crate::validation::sanitize_search_query;

/// Build the search router (cross-table search across todos, missions,
/// calendar events, and knowledge entries).
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

    if q.len() > 200 {
        return Err(AppError::BadRequest("Search query too long (max 200 characters)".into()));
    }

    if q.is_empty() {
        return Ok(Json(json!({
            "todos": [],
            "missions": [],
            "events": [],
            "knowledge": [],
            "notes": [],
            "emails": [],
            "reminders": [],
        })));
    }

    let sb = SupabaseClient::from_state(&state)?;
    let jwt = &session.access_token;
    let safe_q = sanitize_search_query(&q);
    let pattern = format!("%25{safe_q}%25");

    // Search todos, missions, calendar_events, and knowledge_entries in parallel
    let todos_query = format!("select=id,text,done,created_at&text=ilike.{pattern}&limit=20");
    let missions_query = format!("select=id,title,status,created_at&title=ilike.{pattern}&limit=20");
    let calendar_query = format!(
        "select=id,title,start_time,end_time,all_day,calendar_name&title=ilike.{pattern}&limit=10"
    );
    let knowledge_query = format!(
        "select=id,title,content,tags&or=(title.ilike.{pattern},content.ilike.{pattern})&limit=10"
    );

    let (todos_result, missions_result, calendar_result, knowledge_result) = tokio::join!(
        sb.select_as_user("todos", &todos_query, jwt),
        sb.select_as_user("missions", &missions_query, jwt),
        sb.select_as_user("calendar_events", &calendar_query, jwt),
        sb.select_as_user("knowledge_entries", &knowledge_query, jwt),
    );

    let todos = todos_result.unwrap_or(json!([]));
    let missions = missions_result.unwrap_or(json!([]));
    let knowledge = knowledge_result.unwrap_or(json!([]));

    // Map calendar_events fields to frontend CalendarEvent shape:
    // start_time -> start, end_time -> end, all_day stays, calendar_name -> calendar
    let events = match calendar_result {
        Ok(val) => {
            if let Some(arr) = val.as_array() {
                let mapped: Vec<Value> = arr.iter().map(|evt| {
                    json!({
                        "id": evt.get("id").unwrap_or(&json!(null)),
                        "title": evt.get("title").unwrap_or(&json!("")),
                        "start": evt.get("start_time").unwrap_or(&json!("")),
                        "end": evt.get("end_time").unwrap_or(&json!("")),
                        "allDay": evt.get("all_day").unwrap_or(&json!(false)),
                        "calendar": evt.get("calendar_name").unwrap_or(&json!("")),
                    })
                }).collect();
                json!(mapped)
            } else {
                json!([])
            }
        }
        Err(_) => json!([]),
    };

    // Notes search is done client-side from localStorage cache.
    // The backend returns an empty array; the frontend merges its local results.
    let notes: Value = json!([]);

    Ok(Json(json!({
        "todos": todos,
        "missions": missions,
        "events": events,
        "knowledge": knowledge,
        "notes": notes,
        "emails": [],
        "reminders": [],
    })))
}
