use axum::{Router, routing::get, Json};
use serde_json::{json, Value};
use crate::server::AppState;

pub mod agents;
pub mod auth;
pub mod calendar;
pub mod chat;
pub mod deploy;
pub mod email;
pub mod habits;
pub mod homelab;
pub mod knowledge;
pub mod media;
pub mod messages;
pub mod misc;
pub mod missions;
pub mod notify;
pub mod openclaw_cli;
pub mod pipeline;
pub mod reminders;
pub mod reviews;
pub mod stale;
pub mod status;
pub mod todos;
pub mod workspace;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/health", get(health))
        .merge(agents::router())
        .nest("/auth", auth::router())
        .merge(calendar::router())
        .nest("/chat", chat::router())
        .merge(deploy::router())
        .merge(email::router())
        .merge(habits::router())
        .merge(homelab::router())
        .merge(knowledge::router())
        .nest("/media", media::router())
        .merge(messages::router())
        .merge(misc::router())
        .merge(missions::router())
        .merge(notify::router())
        .merge(openclaw_cli::router())
        .merge(pipeline::router())
        .merge(reminders::router())
        .merge(reviews::router())
        .merge(stale::router())
        .merge(status::router())
        .merge(todos::router())
        .nest("/workspace", workspace::router())
}

async fn health() -> Json<Value> {
    Json(json!({ "ok": true }))
}
