use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::{json, Value};
use std::fmt;

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
    Forbidden(String),
    BadRequest(String),
    Internal(anyhow::Error),
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AppError::NotFound(message) => write!(f, "{message}"),
            AppError::Unauthorized => f.write_str("Unauthorized"),
            AppError::Forbidden(message) => write!(f, "{message}"),
            AppError::BadRequest(message) => write!(f, "{message}"),
            AppError::Internal(error) => write!(f, "{error}"),
        }
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, code, message) = match self {
            AppError::NotFound(m) => (StatusCode::NOT_FOUND, "not_found", m),
            AppError::Unauthorized => (
                StatusCode::UNAUTHORIZED,
                "unauthorized",
                "Unauthorized".into(),
            ),
            AppError::Forbidden(m) => (StatusCode::FORBIDDEN, "forbidden", m),
            AppError::BadRequest(m) => (StatusCode::BAD_REQUEST, "bad_request", m),
            AppError::Internal(e) => {
                tracing::error!("internal error: {e:?}");
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({ "ok": false, "error": "Something went wrong", "code": "internal_error" })),
                ).into_response();
            }
        };
        (
            status,
            Json(json!({ "ok": false, "error": message, "code": code })),
        )
            .into_response()
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn success_json_wraps_data() {
        let result = success_json(json!({ "items": [1, 2, 3] }));
        let value = result.0;
        assert_eq!(value["ok"], true);
        assert_eq!(value["data"]["items"], json!([1, 2, 3]));
    }

    #[test]
    fn success_json_with_null() {
        let result = success_json(json!(null));
        let value = result.0;
        assert_eq!(value["ok"], true);
        assert!(value["data"].is_null());
    }

    #[test]
    fn success_json_with_string() {
        let result = success_json(json!("hello"));
        let value = result.0;
        assert_eq!(value["ok"], true);
        assert_eq!(value["data"], "hello");
    }

    #[test]
    fn app_error_display_uses_user_facing_message() {
        assert_eq!(
            AppError::BadRequest("invalid project".into()).to_string(),
            "invalid project"
        );
        assert_eq!(AppError::Unauthorized.to_string(), "Unauthorized");
        assert_eq!(
            AppError::Internal(anyhow::anyhow!("database unavailable")).to_string(),
            "database unavailable",
        );
    }
}
