use std::sync::OnceLock;

use crate::error::AppError;

static UUID_RE: OnceLock<regex::Regex> = OnceLock::new();
static DATE_RE: OnceLock<regex::Regex> = OnceLock::new();

/// Validate that a string is a valid UUID v4 format.
/// Rejects any string containing PostgREST control characters.
pub fn validate_uuid(input: &str) -> Result<&str, AppError> {
    let re = UUID_RE.get_or_init(|| {
        regex::Regex::new(
            r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$",
        )
        .unwrap()
    });
    if !re.is_match(input) {
        return Err(AppError::BadRequest(format!(
            "invalid UUID: {}",
            &input[..input.len().min(36)]
        )));
    }
    Ok(input)
}

/// Validate a PostgREST value -- rejects any input containing query injection characters.
/// Use for non-UUID identifiers (text IDs like agent names, status enums, etc.)
pub fn sanitize_postgrest_value(input: &str) -> Result<&str, AppError> {
    if input.is_empty()
        || input.len() > 255
        || input.contains('&')
        || input.contains('=')
        || input.contains('(')
        || input.contains(')')
        || input.contains(';')
        || input.contains('\n')
        || input.contains('\r')
        || input.contains('\0')
    {
        return Err(AppError::BadRequest("invalid identifier".into()));
    }
    Ok(input)
}

/// Validate a search query -- percent-encode PostgREST special characters.
/// Use for free-text search inputs that go into ilike patterns.
pub fn sanitize_search_query(input: &str) -> String {
    input
        .replace('%', "%25")
        .replace('&', "%26")
        .replace('=', "%3D")
        .replace('(', "%28")
        .replace(')', "%29")
        .replace(';', "%3B")
        .replace('.', "%2E")
        .replace(',', "%2C")
        .replace('+', "%2B")
}

/// Validate a date string (YYYY-MM-DD format).
pub fn validate_date(input: &str) -> Result<&str, AppError> {
    let re = DATE_RE.get_or_init(|| regex::Regex::new(r"^\d{4}-\d{2}-\d{2}$").unwrap());
    if !re.is_match(input) {
        return Err(AppError::BadRequest("invalid date format".into()));
    }
    Ok(input)
}

/// Validate an enum value against an allowlist.
pub fn validate_enum<'a>(input: &'a str, allowed: &[&str]) -> Result<&'a str, AppError> {
    if allowed.contains(&input) {
        Ok(input)
    } else {
        Err(AppError::BadRequest(format!(
            "invalid value: {}",
            &input[..input.len().min(50)]
        )))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn valid_uuid_passes() {
        assert!(validate_uuid("550e8400-e29b-41d4-a716-446655440000").is_ok());
    }

    #[test]
    fn uuid_uppercase_passes() {
        assert!(validate_uuid("550E8400-E29B-41D4-A716-446655440000").is_ok());
    }

    #[test]
    fn uuid_with_injection_fails() {
        assert!(validate_uuid("550e8400&select=*").is_err());
    }

    #[test]
    fn uuid_too_short_fails() {
        assert!(validate_uuid("550e8400").is_err());
    }

    #[test]
    fn uuid_with_extra_chars_fails() {
        assert!(validate_uuid("550e8400-e29b-41d4-a716-446655440000&or=(id.neq.null)").is_err());
    }

    #[test]
    fn empty_postgrest_value_fails() {
        assert!(sanitize_postgrest_value("").is_err());
    }

    #[test]
    fn postgrest_value_with_ampersand_fails() {
        assert!(sanitize_postgrest_value("test&or=(id.neq.null)").is_err());
    }

    #[test]
    fn postgrest_value_with_equals_fails() {
        assert!(sanitize_postgrest_value("test=inject").is_err());
    }

    #[test]
    fn postgrest_value_with_parens_fails() {
        assert!(sanitize_postgrest_value("test(inject)").is_err());
    }

    #[test]
    fn postgrest_value_valid_passes() {
        assert!(sanitize_postgrest_value("koda").is_ok());
        assert!(sanitize_postgrest_value("fast").is_ok());
        assert!(sanitize_postgrest_value("my-agent-123").is_ok());
    }

    #[test]
    fn postgrest_value_too_long_fails() {
        let long = "a".repeat(256);
        assert!(sanitize_postgrest_value(&long).is_err());
    }

    #[test]
    fn search_query_encodes_special_chars() {
        let result = sanitize_search_query("test&inject=true");
        assert!(!result.contains('&'));
        assert!(!result.contains('='));
    }

    #[test]
    fn search_query_encodes_parens() {
        let result = sanitize_search_query("or(status.eq.done)");
        assert!(!result.contains('('));
        assert!(!result.contains(')'));
    }

    #[test]
    fn search_query_preserves_normal_text() {
        let result = sanitize_search_query("hello world");
        assert_eq!(result, "hello world");
    }

    #[test]
    fn valid_date_passes() {
        assert!(validate_date("2026-03-16").is_ok());
    }

    #[test]
    fn invalid_date_fails() {
        assert!(validate_date("not-a-date").is_err());
        assert!(validate_date("2026-03-16&inject").is_err());
    }

    #[test]
    fn date_with_time_fails() {
        assert!(validate_date("2026-03-16T00:00:00").is_err());
    }

    #[test]
    fn validate_enum_passes() {
        assert!(validate_enum("pending", &["pending", "active", "done"]).is_ok());
    }

    #[test]
    fn validate_enum_fails() {
        assert!(validate_enum("hacked", &["pending", "active", "done"]).is_err());
    }

    #[test]
    fn validate_enum_injection_fails() {
        assert!(validate_enum("pending&select=*", &["pending", "active", "done"]).is_err());
    }
}
