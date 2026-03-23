use axum::{routing::get, Json, Router};
use serde_json::{json, Value};
use std::time::Duration;
use tracing::debug;

use crate::server::{AppState, RequireAuth};

/// Check if the Sunshine host is reachable via TCP ping.
async fn remote_status(
    axum::extract::State(state): axum::extract::State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Json<Value> {
    let host = match state.secret("SUNSHINE_HOST") {
        Some(h) if !h.is_empty() => h,
        _ => {
            return Json(json!({
                "configured": false,
                "reachable": false,
                "message": "SUNSHINE_HOST not configured. Set it in Settings > Connections."
            }));
        }
    };

    // TCP ping to Sunshine HTTPS API port (default 47990)
    let addr = if host.contains(':') {
        host.clone()
    } else {
        format!("{host}:47990")
    };

    let reachable = tokio::time::timeout(
        Duration::from_secs(3),
        tokio::net::TcpStream::connect(&addr),
    )
    .await
    .map(|r| r.is_ok())
    .unwrap_or(false);

    debug!("remote: Sunshine at {addr} reachable={reachable}");

    Json(json!({
        "configured": true,
        "reachable": reachable,
        "host": host,
        "message": if reachable { "Sunshine is online" } else { "Sunshine is not reachable" }
    }))
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/remote/status", get(remote_status))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn remote_status_response_shape() {
        // Ensures JSON structure compiles
        let val = json!({
            "configured": true,
            "reachable": false,
            "host": "10.0.0.173",
            "message": "Sunshine is not reachable"
        });
        assert_eq!(val["configured"], true);
        assert_eq!(val["reachable"], false);
    }
}
