use axum::extract::{Path, State};
use axum::routing::get;
use axum::{Json, Router};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::error::{success_json, AppError};
use crate::server::{AppState, RequireAuth};
use crate::supabase::SupabaseClient;
use crate::validation::sanitize_postgrest_value;

/// Build the user secrets router (CRUD for encrypted credentials).
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/secrets", get(list_secrets))
        .route("/secrets/migrate", axum::routing::post(migrate_secrets))
        .route("/secrets/:service/summary", get(get_secret_summary))
        .route(
            "/secrets/:service",
            get(get_secret).put(put_secret).delete(delete_secret),
        )
}

// ── GET /api/secrets ──────────────────────────────────────────────────────
//
// List all secrets for the current user (service names only, no decrypted values).

async fn list_secrets(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let sb = SupabaseClient::from_state(&state)?;

    let data = sb
        .select_as_user(
            "user_secrets",
            "select=service,updated_at&order=service.asc",
            &session.access_token,
        )
        .await?;

    Ok(success_json(data))
}

fn mask_secret_value(value: &Value) -> Value {
    match value {
        Value::String(s) => {
            let trimmed = s.trim();
            if trimmed.is_empty() {
                json!({ "kind": "empty", "masked": "" })
            } else {
                let first = trimmed.chars().take(2).collect::<String>();
                let last = trimmed
                    .chars()
                    .rev()
                    .take(2)
                    .collect::<String>()
                    .chars()
                    .rev()
                    .collect::<String>();
                json!({
                    "kind": "string",
                    "length": trimmed.chars().count(),
                    "masked": format!("{first}***{last}"),
                })
            }
        }
        Value::Number(_) => json!({ "kind": "number", "masked": "***" }),
        Value::Bool(_) => json!({ "kind": "boolean", "masked": "***" }),
        Value::Null => json!({ "kind": "null", "masked": null }),
        Value::Array(values) => json!({
            "kind": "array",
            "count": values.len(),
            "masked": format!("[{} items]", values.len()),
        }),
        Value::Object(map) => json!({
            "kind": "object",
            "count": map.len(),
            "masked": format!("{{{} keys}}", map.len()),
        }),
    }
}

fn credentials_summary(service: &str, updated_at: Option<&str>, credentials: &Value) -> Value {
    let fields = credentials
        .as_object()
        .map(|map| {
            map.iter()
                .map(|(key, value)| {
                    json!({
                        "key": key,
                        "present": !value.is_null(),
                        "preview": mask_secret_value(value),
                    })
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    json!({
        "service": service,
        "updatedAt": updated_at,
        "fieldCount": fields.len(),
        "fields": fields,
    })
}

fn audit_secret_details(service: &str, credentials: &Value) -> String {
    let field_names = credentials
        .as_object()
        .map(|map| map.keys().cloned().collect::<Vec<_>>())
        .unwrap_or_default();

    serde_json::to_string(&json!({
        "service": service,
        "fieldCount": field_names.len(),
        "fields": field_names,
    }))
    .unwrap_or_else(|_| "{}".to_string())
}

// ── GET /api/secrets/:service ─────────────────────────────────────────────
//
// Fetch and decrypt a specific secret by service name.

async fn get_secret(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Path(service): Path<String>,
) -> Result<Json<Value>, AppError> {
    if session.encryption_key.is_empty() {
        return Err(AppError::BadRequest(
            "Encryption key not available. Log in with email/password to manage secrets.".into(),
        ));
    }

    let service = service.trim();
    sanitize_postgrest_value(service)?;

    let sb = SupabaseClient::from_state(&state)?;

    let rows = sb
        .select_as_user(
            "user_secrets",
            &format!(
                "select=service,encrypted_credentials,nonce,updated_at&service=eq.{}&limit=1",
                service
            ),
            &session.access_token,
        )
        .await?;

    let row = rows
        .as_array()
        .and_then(|arr| arr.first())
        .ok_or_else(|| AppError::NotFound(format!("no secret for service: {service}")))?;

    let ciphertext = row["encrypted_credentials"]
        .as_str()
        .ok_or_else(|| AppError::Internal(anyhow::anyhow!("missing encrypted_credentials")))?;
    let nonce = row["nonce"]
        .as_str()
        .ok_or_else(|| AppError::Internal(anyhow::anyhow!("missing nonce")))?;

    let plaintext = crate::crypto::decrypt(ciphertext, nonce, &session.encryption_key)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("decryption failed: {e}")))?;

    let credentials: Value = serde_json::from_slice(&plaintext)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("invalid credentials JSON: {e}")))?;

    Ok(success_json(json!({
        "service": service,
        "credentials": credentials,
    })))
}

async fn get_secret_summary(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Path(service): Path<String>,
) -> Result<Json<Value>, AppError> {
    if session.encryption_key.is_empty() {
        return Err(AppError::BadRequest(
            "Encryption key not available. Log in with email/password to manage secrets.".into(),
        ));
    }

    let service = service.trim();
    sanitize_postgrest_value(service)?;

    let sb = SupabaseClient::from_state(&state)?;
    let rows = sb
        .select_as_user(
            "user_secrets",
            &format!(
                "select=service,encrypted_credentials,nonce,updated_at&service=eq.{}&limit=1",
                service
            ),
            &session.access_token,
        )
        .await?;

    let row = rows
        .as_array()
        .and_then(|arr| arr.first())
        .ok_or_else(|| AppError::NotFound(format!("no secret for service: {service}")))?;

    let ciphertext = row["encrypted_credentials"]
        .as_str()
        .ok_or_else(|| AppError::Internal(anyhow::anyhow!("missing encrypted_credentials")))?;
    let nonce = row["nonce"]
        .as_str()
        .ok_or_else(|| AppError::Internal(anyhow::anyhow!("missing nonce")))?;
    let updated_at = row["updated_at"].as_str();

    let plaintext = crate::crypto::decrypt(ciphertext, nonce, &session.encryption_key)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("decryption failed: {e}")))?;

    let credentials: Value = serde_json::from_slice(&plaintext)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("invalid credentials JSON: {e}")))?;

    Ok(success_json(credentials_summary(service, updated_at, &credentials)))
}

// ── PUT /api/secrets/:service ─────────────────────────────────────────────
//
// Create or update an encrypted secret.

#[derive(Debug, Deserialize)]
struct PutSecretBody {
    credentials: Value,
}

async fn put_secret(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Path(service): Path<String>,
    Json(body): Json<PutSecretBody>,
) -> Result<Json<Value>, AppError> {
    if session.encryption_key.is_empty() {
        return Err(AppError::BadRequest(
            "Encryption key not available. Log in with email/password to manage secrets.".into(),
        ));
    }

    let service = service.trim();
    sanitize_postgrest_value(service)?;

    if !body.credentials.is_object() {
        return Err(AppError::BadRequest(
            "credentials must be a JSON object".into(),
        ));
    }

    let json_bytes = serde_json::to_vec(&body.credentials)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("failed to serialize credentials: {e}")))?;

    let (ciphertext, nonce) = crate::crypto::encrypt(&json_bytes, &session.encryption_key)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("encryption failed: {e}")))?;

    let sb = SupabaseClient::from_state(&state)?;
    let existing = sb
        .select_as_user(
            "user_secrets",
            &format!("select=service&service=eq.{}&limit=1", service),
            &session.access_token,
        )
        .await
        .unwrap_or_else(|_| json!([]));
    let action = if existing.as_array().map(|arr| arr.is_empty()).unwrap_or(true) {
        "create"
    } else {
        "update"
    };

    let row = json!({
        "user_id": session.user_id,
        "service": service,
        "encrypted_credentials": ciphertext,
        "nonce": nonce,
    });

    sb.upsert_as_user("user_secrets", row, &session.access_token)
        .await?;

    // Audit trail (never log the credential values — just the service name)
    let details = audit_secret_details(service, &body.credentials);
    crate::audit::log_audit_or_warn(
        &state.db,
        &session.user_id,
        action,
        "secrets",
        Some(service),
        Some(&details),
    )
    .await;

    Ok(success_json(json!({ "ok": true })))
}

// ── DELETE /api/secrets/:service ──────────────────────────────────────────
//
// Delete a secret for the given service.

async fn delete_secret(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Path(service): Path<String>,
) -> Result<Json<Value>, AppError> {
    if session.encryption_key.is_empty() {
        return Err(AppError::BadRequest(
            "Encryption key not available. Log in with email/password to manage secrets.".into(),
        ));
    }

    let service = service.trim();
    sanitize_postgrest_value(service)?;

    let sb = SupabaseClient::from_state(&state)?;

    sb.delete_as_user(
        "user_secrets",
        &format!("service=eq.{}", service),
        &session.access_token,
    )
    .await?;

    // Audit trail
    let details = serde_json::to_string(&json!({ "service": service })).unwrap_or_default();
    crate::audit::log_audit_or_warn(
        &state.db,
        &session.user_id,
        "delete",
        "secrets",
        Some(service),
        Some(&details),
    )
    .await;

    Ok(success_json(json!({ "ok": true })))
}

// ── POST /api/secrets/migrate ─────────────────────────────────────────────
//
// One-time migration: reads all secrets currently in AppState (loaded from OS
// keychain at startup), groups them by service, encrypts each group, and
// upserts into Supabase user_secrets. Skips services that already exist.

async fn migrate_secrets(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    if session.encryption_key.is_empty() {
        return Err(AppError::BadRequest(
            "No encryption key — OAuth logins cannot migrate secrets".into(),
        ));
    }

    let sb = SupabaseClient::from_state(&state)?;

    // Fetch existing secrets to avoid overwriting
    let existing = sb
        .select_as_user("user_secrets", "select=service", &session.access_token)
        .await
        .unwrap_or(json!([]));
    let existing_services: std::collections::HashSet<String> = existing
        .as_array()
        .unwrap_or(&vec![])
        .iter()
        .filter_map(|r| r["service"].as_str().map(|s| s.to_string()))
        .collect();

    // Map env var names back to (service, credential_key) pairs
    let env_to_service: &[(&str, &str, &str)] = &[
        ("BLUEBUBBLES_HOST", "bluebubbles", "host"),
        ("BLUEBUBBLES_PASSWORD", "bluebubbles", "password"),
        ("OPENCLAW_API_URL", "openclaw", "api_url"),
        ("OPENCLAW_API_KEY", "openclaw", "api_key"),
        ("OPENCLAW_WS", "openclaw", "ws"),
        ("OPENCLAW_PASSWORD", "openclaw", "password"),
        ("AGENTSHELL_URL", "agentshell", "url"),
        ("PROXMOX_HOST", "proxmox", "host"),
        ("PROXMOX_TOKEN_ID", "proxmox", "token_id"),
        ("PROXMOX_TOKEN_SECRET", "proxmox", "token_secret"),
        ("OPNSENSE_HOST", "opnsense", "host"),
        ("OPNSENSE_KEY", "opnsense", "key"),
        ("OPNSENSE_SECRET", "opnsense", "secret"),
        ("PLEX_URL", "plex", "url"),
        ("PLEX_TOKEN", "plex", "token"),
        ("SONARR_URL", "sonarr", "url"),
        ("SONARR_API_KEY", "sonarr", "api_key"),
        ("RADARR_URL", "radarr", "url"),
        ("RADARR_API_KEY", "radarr", "api_key"),
        ("EMAIL_HOST", "email", "host"),
        ("EMAIL_PORT", "email", "port"),
        ("EMAIL_USER", "email", "user"),
        ("EMAIL_PASSWORD", "email", "password"),
        ("CALDAV_URL", "caldav", "url"),
        ("CALDAV_USERNAME", "caldav", "username"),
        ("CALDAV_PASSWORD", "caldav", "password"),
        ("NTFY_URL", "ntfy", "url"),
        ("NTFY_TOPIC", "ntfy", "topic"),
        ("MAC_BRIDGE_HOST", "mac-bridge", "host"),
        ("MAC_BRIDGE_API_KEY", "mac-bridge", "api_key"),
        ("ANTHROPIC_API_KEY", "anthropic", "api_key"),
    ];

    // Group current secrets by service
    let mut services: std::collections::HashMap<String, serde_json::Map<String, Value>> =
        std::collections::HashMap::new();

    for &(env_var, service, cred_key) in env_to_service {
        if let Some(value) = state.secret(env_var) {
            if !value.is_empty() {
                services
                    .entry(service.to_string())
                    .or_default()
                    .insert(cred_key.to_string(), Value::String(value));
            }
        }
    }

    let mut migrated = 0usize;
    let mut skipped = 0usize;

    for (service, creds) in &services {
        if existing_services.contains(service) {
            tracing::debug!(service = %service, "skipping migration — already exists in user_secrets");
            skipped += 1;
            continue;
        }

        let creds_value = Value::Object(creds.clone());
        let json_bytes = serde_json::to_vec(&creds_value)
            .map_err(|e| AppError::Internal(anyhow::anyhow!("serialize failed: {e}")))?;

        let (ciphertext, nonce) = crate::crypto::encrypt(&json_bytes, &session.encryption_key)
            .map_err(|e| AppError::Internal(anyhow::anyhow!("encryption failed: {e}")))?;

        let row = json!({
            "user_id": session.user_id,
            "service": service,
            "encrypted_credentials": ciphertext,
            "nonce": nonce,
        });

        if let Err(e) = sb
            .upsert_as_user("user_secrets", row, &session.access_token)
            .await
        {
            tracing::warn!(service = %service, "failed to migrate secret: {e}");
            continue;
        }

        tracing::info!(service = %service, "migrated secret to user_secrets");
        migrated += 1;
    }

    Ok(success_json(json!({
        "migrated": migrated,
        "skipped": skipped,
        "total_services": services.len(),
    })))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn put_body_rejects_non_object() {
        let body = serde_json::from_str::<PutSecretBody>(r#"{"credentials": "not-an-object"}"#);
        // Deserialization succeeds (it's valid JSON), but the handler validates the shape
        assert!(body.is_ok());
        assert!(!body.unwrap().credentials.is_object());
    }

    #[test]
    fn put_body_accepts_object() {
        let body = serde_json::from_str::<PutSecretBody>(
            r#"{"credentials": {"host": "example.com", "password": "secret"}}"#,
        );
        assert!(body.is_ok());
        assert!(body.unwrap().credentials.is_object());
    }

    #[test]
    fn service_name_validation() {
        // Valid service names
        assert!(sanitize_postgrest_value("bluebubbles").is_ok());
        assert!(sanitize_postgrest_value("openclaw-api").is_ok());
        assert!(sanitize_postgrest_value("supabase_config").is_ok());

        // Invalid service names (injection attempts)
        assert!(sanitize_postgrest_value("test&or=(id.neq.null)").is_err());
        assert!(sanitize_postgrest_value("").is_err());
        assert!(sanitize_postgrest_value("test=inject").is_err());
    }

    #[test]
    fn encrypt_decrypt_roundtrip_for_credentials() {
        let key = crate::crypto::derive_key("test-password", "test-user-id");
        let credentials = json!({
            "host": "192.168.1.100:1234",
            "password": "my-secret-password"
        });

        let json_bytes = serde_json::to_vec(&credentials).unwrap();
        let (ciphertext, nonce) = crate::crypto::encrypt(&json_bytes, &key).unwrap();
        let decrypted = crate::crypto::decrypt(&ciphertext, &nonce, &key).unwrap();
        let roundtripped: Value = serde_json::from_slice(&decrypted).unwrap();

        assert_eq!(roundtripped, credentials);
    }

    #[test]
    fn summary_masks_string_values() {
        let credentials = json!({
            "url": "http://100.100.100.100:8077",
            "api_key": "super-secret-token-value",
        });
        let summary = credentials_summary("agentshell", Some("2026-04-04T00:00:00Z"), &credentials);
        assert_eq!(summary["service"], "agentshell");
        assert_eq!(summary["fieldCount"], 2);
        let fields = summary["fields"].as_array().unwrap();
        assert!(fields.iter().all(|field| field["preview"]["masked"].is_string()));
        let joined = summary.to_string();
        assert!(!joined.contains("super-secret-token-value"));
        assert!(!joined.contains("100.100.100.100"));
    }

    #[test]
    fn audit_details_only_include_field_names() {
        let credentials = json!({
            "url": "http://example.internal",
            "password": "do-not-log-me",
        });
        let details = audit_secret_details("bluebubbles", &credentials);
        assert!(details.contains("bluebubbles"));
        assert!(details.contains("url"));
        assert!(details.contains("password"));
        assert!(!details.contains("do-not-log-me"));
        assert!(!details.contains("example.internal"));
    }
}
