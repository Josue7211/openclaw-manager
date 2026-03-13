use axum::{Router, routing::get, Json};
use serde_json::{json, Value};
use crate::server::AppState;

pub mod auth;
pub mod calendar;
pub mod chat;
pub mod email;
pub mod homelab;
pub mod media;
pub mod messages;
pub mod openclaw_cli;
pub mod status;
pub mod workspace;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/health", get(health))
        .nest("/auth", auth::router())
        .merge(calendar::router())
        .nest("/chat", chat::router())
        .merge(email::router())
        .merge(homelab::router())
        .nest("/media", media::router())
        .merge(messages::router())
        .merge(openclaw_cli::router())
        .merge(status::router())
        .nest("/workspace", workspace::router())
}

async fn health() -> Json<Value> {
    Json(json!({ "ok": true }))
}
