mod agents;
mod complete;
mod events;
pub(crate) mod helpers;
mod registry;
mod review;
mod spawn;

use crate::server::AppState;
use axum::{
    routing::{get, post},
    Router,
};

/// Build the pipeline router (spawn, complete, review, events).
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/pipeline/spawn", post(spawn::pipeline_spawn))
        .route("/pipeline/complete", post(complete::pipeline_complete))
        .route("/pipeline/review", post(review::pipeline_review))
        .route(
            "/pipeline-events",
            get(events::get_pipeline_events).post(events::post_pipeline_event),
        )
}
