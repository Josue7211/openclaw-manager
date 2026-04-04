use crate::server::AppState;
use axum::{routing::get, Json, Router};
use serde_json::{json, Value};

pub mod agent_shell;
pub mod agent_shell_support;
pub mod agents;
pub mod approvals;
pub mod auth;
pub mod bjorn;
pub mod cache;
pub mod calendar;
pub mod captures;
pub mod changelog;
pub mod chat;
pub mod claude_sessions;
pub mod crons;
pub mod deploy;
pub mod email;
pub mod events;
pub mod export;
pub mod gateway;
pub mod gateway_events;
pub mod homelab;
pub mod ideas;
pub mod jobs;
// pub mod koel; // removed: file does not exist (stripped in prior phase)
pub mod knowledge;
pub mod media;
pub mod memd;
pub mod memory;
pub mod messages;
pub mod missions;
pub mod notify;
pub mod openclaw_cli;
pub mod openclaw_data;
pub mod pipeline;
pub mod preferences;
pub mod reminders;
pub mod reviews;
pub mod search;
pub mod stale;
pub mod status;
pub mod terminal;
pub mod todos;
pub mod user_secrets;
pub mod util;
pub mod vault;
pub mod vnc;
pub mod wizard;
pub mod workflow_notes;
pub mod workspace;

/// Build the top-level API router, nesting all sub-module routes.
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/health", get(health))
        .merge(agents::router())
        .merge(agent_shell::router())
        .merge(approvals::router())
        .merge(bjorn::router())
        .nest("/auth", auth::router())
        .merge(calendar::router())
        .nest("/chat", chat::router())
        .merge(deploy::router())
        .merge(email::router())
        .merge(export::router())
        .merge(gateway::router())
        .merge(gateway_events::router())
        .merge(events::router())
        .merge(homelab::router())
        .merge(knowledge::router())
        .nest("/media", media::router())
        .merge(messages::router())
        .merge(cache::router())
        .merge(captures::router())
        .merge(changelog::router())
        .merge(crons::router())
        .merge(ideas::router())
        .merge(jobs::router())
        // .merge(koel::router()) // removed: module does not exist
        .nest("/memd", memd::router())
        .merge(memory::router())
        .merge(search::router())
        .merge(workflow_notes::router())
        .merge(missions::router())
        .merge(notify::router())
        .merge(openclaw_cli::router())
        .merge(openclaw_data::router())
        .merge(pipeline::router())
        .merge(preferences::router())
        .merge(reminders::router())
        .merge(reviews::router())
        .merge(stale::router())
        .merge(status::router())
        .merge(todos::router())
        .merge(terminal::router())
        .merge(claude_sessions::router())
        .merge(user_secrets::router())
        .merge(vault::router())
        .merge(vnc::router())
        .merge(wizard::router())
        .merge(crate::audit::router())
        .nest("/workspace", workspace::router())
}

async fn health() -> Json<Value> {
    Json(json!({ "ok": true }))
}
