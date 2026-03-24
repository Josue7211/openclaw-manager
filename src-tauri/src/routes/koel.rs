//! Koel music service routes (stub).

use axum::{routing::get, Json, Router};
use serde_json::{json, Value};

use crate::server::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
}
