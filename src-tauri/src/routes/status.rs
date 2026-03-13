use axum::{Router, routing::get, Json, extract::State};
use serde_json::{json, Value};
use crate::server::AppState;
use crate::error::AppError;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(get_status))
}

async fn get_status(State(_state): State<AppState>) -> Result<Json<Value>, AppError> {
    let openclaw_dir = std::env::var("OPENCLAW_DIR").unwrap_or_else(|_| {
        dirs::home_dir()
            .map(|h| h.join(".openclaw").to_string_lossy().into_owned())
            .unwrap_or_else(|| ".openclaw".to_string())
    });
    let identity_path = std::path::Path::new(&openclaw_dir).join("workspace").join("IDENTITY.md");

    let (name, emoji) = if identity_path.exists() {
        let content = tokio::fs::read_to_string(&identity_path).await
            .unwrap_or_default();
        let name = content.lines()
            .find(|l| l.starts_with("Name:"))
            .map(|l| l.trim_start_matches("Name:").trim().to_string())
            .unwrap_or_else(|| "Bjorn".to_string());
        let emoji = content.lines()
            .find(|l| l.starts_with("Emoji:"))
            .map(|l| l.trim_start_matches("Emoji:").trim().to_string())
            .unwrap_or_else(|| "\u{1F9AC}".to_string());
        (name, emoji)
    } else {
        ("Bjorn".to_string(), "\u{1F9AC}".to_string())
    };

    Ok(Json(json!({ "name": name, "emoji": emoji })))
}
