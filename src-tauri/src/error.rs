use axum::{http::StatusCode, response::{IntoResponse, Response}, Json};
use serde_json::{json, Value};

// ── Standard API Response Envelope ──────────────────────────────────────────
//
// Error responses (produced by AppError):
//   { "ok": false, "error": "<message>", "code": "<error_code>" }
//
// Success responses should use the `success_json` helper for new endpoints:
//   { "ok": true, "data": <payload> }
//
// NOTE: Existing endpoints return ad-hoc success shapes (e.g. { "missions": [...] })
// for backwards compatibility. Do NOT retrofit them — only use `success_json` for
// newly created endpoints going forward.
// ────────────────────────────────────────────────────────────────────────────

/// Wrap a JSON value in the standard success envelope: `{ "ok": true, "data": ... }`.
/// Use this for **new** endpoints only — do not retrofit existing ones.
pub fn success_json(data: Value) -> Json<Value> {
    Json(json!({ "ok": true, "data": data }))
}

#[derive(Debug)]
pub enum AppError {
    NotFound(String),
    Unauthorized,
    BadRequest(String),
    Internal(anyhow::Error),
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, code, message) = match self {
            AppError::NotFound(m) => (StatusCode::NOT_FOUND, "not_found", m),
            AppError::Unauthorized => (StatusCode::UNAUTHORIZED, "unauthorized", "Unauthorized".into()),
            AppError::BadRequest(m) => (StatusCode::BAD_REQUEST, "bad_request", m),
            AppError::Internal(e) => (StatusCode::INTERNAL_SERVER_ERROR, "internal_error", e.to_string()),
        };
        (status, Json(json!({ "ok": false, "error": message, "code": code }))).into_response()
    }
}

impl From<anyhow::Error> for AppError {
    fn from(e: anyhow::Error) -> Self {
        AppError::Internal(e)
    }
}

impl From<sqlx::Error> for AppError {
    fn from(e: sqlx::Error) -> Self {
        AppError::Internal(e.into())
    }
}

impl From<reqwest::Error> for AppError {
    fn from(e: reqwest::Error) -> Self {
        AppError::Internal(e.into())
    }
}
