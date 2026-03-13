use axum::{Router, routing::get, Json};
use serde_json::{json, Value};
use crate::server::AppState;

pub mod auth;
pub mod chat;
pub mod openclaw_cli;
pub mod status;
pub mod workspace;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/health", get(health))
        .nest("/auth", auth::router())
        .nest("/chat", chat::router())
        .merge(status::router())
        .merge(openclaw_cli::router())
        .nest("/workspace", workspace::router())
}

async fn health() -> Json<Value> {
    Json(json!({ "ok": true }))
}
