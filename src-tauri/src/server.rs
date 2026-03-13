use axum::Router;
use std::net::SocketAddr;
use tokio::net::TcpListener;
use tower_http::cors::{CorsLayer, Any};
use crate::routes;

#[derive(Clone)]
#[allow(dead_code)]
pub struct AppState {
    pub app: tauri::AppHandle,
    pub db: sqlx::SqlitePool,
    pub http: reqwest::Client,
}

pub async fn start(app_handle: tauri::AppHandle) -> anyhow::Result<()> {
    let state = AppState {
        app: app_handle,
        db: crate::db::init().await?,
        http: reqwest::Client::new(),
    };

    let app = Router::new()
        .nest("/api", routes::router())
        .layer(CorsLayer::new().allow_origin(Any).allow_methods(Any).allow_headers(Any))
        .with_state(state);

    let addr = SocketAddr::from(([127, 0, 0, 1], 3000));
    let listener = TcpListener::bind(addr).await?;
    tracing::info!("Axum listening on {}", addr);
    axum::serve(listener, app).await?;
    Ok(())
}
