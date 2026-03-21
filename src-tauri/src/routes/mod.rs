use axum::{Router, routing::get, Json};
use serde_json::{json, Value};
use crate::server::AppState;

pub mod agents;
pub mod bjorn;
pub mod auth;
pub mod cache;
pub mod calendar;
pub mod captures;
pub mod changelog;
pub mod chat;
pub mod decisions;
pub mod deploy;
pub mod dlp;
pub mod email;
pub mod export;
pub mod events;
pub mod habits;
pub mod homelab;
pub mod ideas;
pub mod knowledge;
pub mod media;
pub mod memory;
pub mod messages;
pub mod missions;
pub mod notify;
pub mod openclaw_cli;
pub mod pipeline;
pub mod preferences;
pub mod reminders;
pub mod reviews;
pub mod search;
pub mod stale;
pub mod status;
pub mod todos;
pub mod user_secrets;
pub mod util;
pub mod workflow_notes;
pub mod vault;
pub mod wizard;
pub mod workspace;

/// Build the top-level API router, nesting all sub-module routes.
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/health", get(health))
        .merge(agents::router())
        .merge(bjorn::router())
        .nest("/auth", auth::router())
        .merge(calendar::router())
        .nest("/chat", chat::router())
        .merge(deploy::router())
        .merge(email::router())
        .merge(export::router())
        .merge(events::router())
        .merge(habits::router())
        .merge(homelab::router())
        .merge(knowledge::router())
        .nest("/media", media::router())
        .merge(messages::router())
        .merge(cache::router())
        .merge(captures::router())
        .merge(changelog::router())
        .merge(decisions::router())
        .merge(dlp::router())
        .merge(ideas::router())
        .merge(memory::router())
        .merge(search::router())
        .merge(workflow_notes::router())
        .merge(missions::router())
        .merge(notify::router())
        .merge(openclaw_cli::router())
        .merge(pipeline::router())
        .merge(preferences::router())
        .merge(reminders::router())
        .merge(reviews::router())
        .merge(stale::router())
        .merge(status::router())
        .merge(todos::router())
        .merge(user_secrets::router())
        .merge(vault::router())
        .merge(wizard::router())
        .merge(crate::audit::router())
        .nest("/workspace", workspace::router())
}

async fn health() -> Json<Value> {
    Json(json!({ "ok": true }))
}
