use axum::{Router, routing::get, Json};
use serde_json::{json, Value};
use crate::server::AppState;

pub mod status;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/health", get(health))
        .nest("/status", status::router())
}

async fn health() -> Json<Value> {
    Json(json!({ "ok": true }))
}
