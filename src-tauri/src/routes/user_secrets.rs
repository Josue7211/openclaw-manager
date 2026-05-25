use axum::extract::{Path, State};
use axum::routing::get;
use axum::{Json, Router};
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::HashMap;

use crate::error::{success_json, AppError};
use crate::server::{AppState, RequireAuth};
use crate::supabase::SupabaseClient;
use crate::validation::sanitize_postgrest_value;

/// Build the user secrets router (CRUD for encrypted credentials).
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/secrets", get(list_secrets))
        .route("/secrets/migrate", axum::routing::post(migrate_secrets))
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
    let sb = SupabaseClient::from_state(&state)?;

    let Some(input_credentials) = body.credentials.as_object() else {
        return Err(AppError::BadRequest(
            "credentials must be a JSON object".into(),
        ));
    };

    let sanitized_credentials = sanitize_credentials(input_credentials);
    if sanitized_credentials.is_empty() {
        return Err(AppError::BadRequest(
            "credentials must include at least one non-empty field".into(),
        ));
    }

    let mut merged_credentials = existing_service_credentials(&sb, &session, service)
        .await
        .unwrap_or_default();
    merge_partial_update_credentials(&mut merged_credentials, sanitized_credentials);

    let credentials_value = Value::Object(merged_credentials.clone());
    let json_bytes = serde_json::to_vec(&credentials_value)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("failed to serialize credentials: {e}")))?;

    let (ciphertext, nonce) = crate::crypto::encrypt(&json_bytes, &session.encryption_key)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("encryption failed: {e}")))?;

    let row = json!({
        "user_id": session.user_id,
        "service": service,
        "encrypted_credentials": ciphertext,
        "nonce": nonce,
    });

    sb.upsert_as_user("user_secrets", row, &session.access_token)
        .await?;

    let mut updated_secrets = std::collections::HashMap::new();
    if !merged_credentials.is_empty() {
        for (key, value) in &merged_credentials {
            if let Some(value) = value.as_str().filter(|value| !value.trim().is_empty()) {
                if let Some(env_var) =
                    crate::routes::auth::service_credential_to_env_var(service, key.as_str())
                {
                    updated_secrets.insert(env_var.to_string(), value.trim().to_string());
                }
            }
        }
    }
    if !updated_secrets.is_empty() {
        state.merge_secrets(updated_secrets);
    }

    // Audit trail (never log the credential values — just the service name)
    let details = serde_json::to_string(&json!({ "service": service })).unwrap_or_default();
    crate::audit::log_audit_or_warn(
        &state.db,
        &session.user_id,
        "update",
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
// upserts into Supabase user_secrets. Existing service rows are preserved and
// only missing/empty fields are filled from local credentials.

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
        .select_as_user(
            "user_secrets",
            "select=service,encrypted_credentials,nonce",
            &session.access_token,
        )
        .await
        .unwrap_or(json!([]));
    let existing_services: HashMap<String, Value> = existing
        .as_array()
        .unwrap_or(&vec![])
        .iter()
        .filter_map(|r| r["service"].as_str().map(|s| (s.to_string(), r.clone())))
        .collect();

    // Map env var names back to (service, credential_key) pairs
    let env_to_service: &[(&str, &str, &str)] = &[
        ("BLUEBUBBLES_HOST", "bluebubbles", "host"),
        ("BLUEBUBBLES_PASSWORD", "bluebubbles", "password"),
        ("HARNESS_API_URL", "harness", "api_url"),
        ("HARNESS_API_KEY", "harness", "api_key"),
        ("HARNESS_WS", "harness", "ws"),
        ("HARNESS_PASSWORD", "harness", "password"),
        ("CODEX_LB_API_URL", "codex-lb", "api_url"),
        (
            "CODEX_LB_DASHBOARD_PASSWORD",
            "codex-lb",
            "dashboard_password",
        ),
        ("HERMES_API_URL", "hermes", "api_url"),
        ("HERMES_API_KEY", "hermes", "api_key"),
        ("HERMES_WS", "hermes", "ws"),
        ("HERMES_PASSWORD", "hermes", "password"),
        ("OPENCLAW_API_URL", "openclaw", "api_url"),
        ("OPENCLAW_API_KEY", "openclaw", "api_key"),
        ("OPENCLAW_WS", "openclaw", "ws"),
        ("OPENCLAW_PASSWORD", "openclaw", "password"),
        ("AGENTSECRETS_URL", "agentsecrets", "url"),
        (
            "AGENTSECRETS_CLIENT_API_KEY",
            "agentsecrets",
            "client_api_key",
        ),
        (
            "SECRET_BROKER_APPROVER_API_KEY",
            "agentsecrets",
            "approver_api_key",
        ),
        ("SUNSHINE_HOST", "sunshine", "url"),
        ("VNC_HOST", "vnc", "url"),
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
        ("LIDARR_URL", "lidarr", "url"),
        ("LIDARR_API_KEY", "lidarr", "api_key"),
        ("PROWLARR_URL", "prowlarr", "url"),
        ("PROWLARR_API_KEY", "prowlarr", "api_key"),
        ("OVERSEERR_URL", "overseerr", "url"),
        ("OVERSEERR_API_KEY", "overseerr", "api_key"),
        ("TAUTULLI_URL", "tautulli", "url"),
        ("TAUTULLI_API_KEY", "tautulli", "api_key"),
        ("BAZARR_URL", "bazarr", "url"),
        ("BAZARR_API_KEY", "bazarr", "api_key"),
        ("JELLYSEERR_URL", "jellyseerr", "url"),
        ("JELLYSEERR_API_KEY", "jellyseerr", "api_key"),
        ("JELLYSTAT_URL", "jellystat", "url"),
        ("JELLYSTAT_API_KEY", "jellystat", "api_key"),
        ("QBITTORRENT_URL", "qbittorrent", "url"),
        ("QBITTORRENT_USERNAME", "qbittorrent", "username"),
        ("QBITTORRENT_PASSWORD", "qbittorrent", "password"),
        ("SABNZBD_URL", "sabnzbd", "url"),
        ("SABNZBD_API_KEY", "sabnzbd", "api_key"),
        ("NZBGET_URL", "nzbget", "url"),
        ("NZBGET_USERNAME", "nzbget", "username"),
        ("NZBGET_PASSWORD", "nzbget", "password"),
        ("TRANSMISSION_URL", "transmission", "url"),
        ("TRANSMISSION_USERNAME", "transmission", "username"),
        ("TRANSMISSION_PASSWORD", "transmission", "password"),
        ("DELUGE_URL", "deluge", "url"),
        ("DELUGE_PASSWORD", "deluge", "password"),
        ("UNRAID_URL", "unraid", "url"),
        ("UNRAID_API_KEY", "unraid", "api_key"),
        ("WIZARR_URL", "wizarr", "url"),
        ("WIZARR_API_KEY", "wizarr", "api_key"),
        ("EMAIL_HOST", "email", "host"),
        ("EMAIL_PORT", "email", "port"),
        ("EMAIL_USER", "email", "user"),
        ("EMAIL_PASSWORD", "email", "password"),
        ("CALDAV_URL", "caldav", "url"),
        ("CALDAV_USERNAME", "caldav", "username"),
        ("CALDAV_PASSWORD", "caldav", "password"),
        ("NTFY_URL", "ntfy", "url"),
        ("NTFY_TOPIC", "ntfy", "topic"),
        ("COUCHDB_URL", "couchdb", "url"),
        ("COUCHDB_USER", "couchdb", "user"),
        ("COUCHDB_PASSWORD", "couchdb", "password"),
        ("COUCHDB_DATABASE", "couchdb", "database"),
        ("COUCHDB_CUSTOM_HEADERS", "couchdb", "custom_headers"),
        ("MAC_BRIDGE_HOST", "mac-bridge", "host"),
        ("MAC_BRIDGE_API_KEY", "mac-bridge", "api_key"),
        ("ANTHROPIC_API_KEY", "anthropic", "api_key"),
        ("LIGHTRAG_BASE_URL", "lightrag", "base_url"),
        ("LIGHTRAG_API_KEY", "lightrag", "api_key"),
        ("LIGHTRAG_LLM_BINDING_API_KEY", "lightrag", "llm_api_key"),
        (
            "LIGHTRAG_EMBEDDING_BINDING_API_KEY",
            "lightrag",
            "embedding_api_key",
        ),
        ("MEMD_RAG_URL", "memd", "rag_url"),
        ("RAGANYTHING_URL", "raganything", "url"),
        ("MINERU_URL", "mineru", "url"),
        ("RAG_URL", "rag", "url"),
    ];

    // Group current secrets by service
    let mut services: HashMap<String, serde_json::Map<String, Value>> = HashMap::new();

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
        let mut creds = sanitize_credentials(creds);
        if creds.is_empty() {
            skipped += 1;
            continue;
        }

        if let Some(row) = existing_services.get(service) {
            let Ok(mut remote_creds) = decrypt_service_credentials(row, &session.encryption_key)
            else {
                tracing::warn!(
                    service = %service,
                    "skipping migration merge because existing synced secret could not be decrypted"
                );
                skipped += 1;
                continue;
            };
            let changed = fill_missing_credentials(&mut remote_creds, creds);
            if !changed {
                skipped += 1;
                continue;
            }
            creds = remote_creds;
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

fn sanitize_credentials(
    credentials: &serde_json::Map<String, Value>,
) -> serde_json::Map<String, Value> {
    credentials
        .iter()
        .filter_map(|(key, value)| match value {
            Value::String(s) if !s.trim().is_empty() => {
                Some((key.clone(), Value::String(s.trim().to_string())))
            }
            Value::Array(items) if !items.is_empty() => Some((key.clone(), value.clone())),
            Value::Object(map) if !map.is_empty() => Some((key.clone(), value.clone())),
            Value::Bool(_) | Value::Number(_) => Some((key.clone(), value.clone())),
            _ => None,
        })
        .collect()
}

fn merge_partial_update_credentials(
    existing: &mut serde_json::Map<String, Value>,
    incoming: serde_json::Map<String, Value>,
) -> bool {
    let mut changed = false;
    for (key, value) in incoming {
        if existing.get(&key) != Some(&value) {
            existing.insert(key, value);
            changed = true;
        }
    }
    changed
}

fn fill_missing_credentials(
    existing: &mut serde_json::Map<String, Value>,
    incoming: serde_json::Map<String, Value>,
) -> bool {
    let mut changed = false;
    for (key, value) in incoming {
        let existing_has_value = existing
            .get(&key)
            .and_then(Value::as_str)
            .map(|value| !value.trim().is_empty())
            .unwrap_or_else(|| existing.get(&key).is_some());
        if !existing_has_value {
            existing.insert(key, value);
            changed = true;
        }
    }
    changed
}

fn decrypt_service_credentials(
    row: &Value,
    encryption_key: &[u8],
) -> Result<serde_json::Map<String, Value>, AppError> {
    let ciphertext = row["encrypted_credentials"]
        .as_str()
        .ok_or_else(|| AppError::Internal(anyhow::anyhow!("missing encrypted_credentials")))?;
    let nonce = row["nonce"]
        .as_str()
        .ok_or_else(|| AppError::Internal(anyhow::anyhow!("missing nonce")))?;

    let plaintext = crate::crypto::decrypt(ciphertext, nonce, encryption_key)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("decryption failed: {e}")))?;
    let credentials: Value = serde_json::from_slice(&plaintext)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("invalid credentials JSON: {e}")))?;
    let credentials = credentials
        .as_object()
        .ok_or_else(|| AppError::Internal(anyhow::anyhow!("credentials must be an object")))?;
    Ok(sanitize_credentials(credentials))
}

async fn existing_service_credentials(
    sb: &SupabaseClient,
    session: &crate::server::UserSession,
    service: &str,
) -> Result<serde_json::Map<String, Value>, AppError> {
    let rows = sb
        .select_as_user(
            "user_secrets",
            &format!(
                "select=service,encrypted_credentials,nonce&service=eq.{}&limit=1",
                service
            ),
            &session.access_token,
        )
        .await?;
    let row = rows
        .as_array()
        .and_then(|arr| arr.first())
        .ok_or_else(|| AppError::NotFound(format!("no secret for service: {service}")))?;
    decrypt_service_credentials(row, &session.encryption_key)
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
    fn sanitize_credentials_removes_empty_values() {
        let credentials = json!({
            "host": " http://100.89.236.13:1234 ",
            "password": "",
            "api_key": "   ",
            "enabled": true
        });
        let sanitized = sanitize_credentials(credentials.as_object().unwrap());
        assert_eq!(
            sanitized.get("host").and_then(Value::as_str),
            Some("http://100.89.236.13:1234")
        );
        assert_eq!(sanitized.get("enabled"), Some(&Value::Bool(true)));
        assert!(!sanitized.contains_key("password"));
        assert!(!sanitized.contains_key("api_key"));
    }

    #[test]
    fn partial_update_credentials_preserves_omitted_remote_fields() {
        let mut existing = json!({
            "host": "http://old-host:1234",
            "password": "saved-password"
        })
        .as_object()
        .unwrap()
        .clone();
        let incoming = json!({
            "host": "http://100.89.236.13:1234"
        })
        .as_object()
        .unwrap()
        .clone();

        assert!(merge_partial_update_credentials(&mut existing, incoming));
        assert_eq!(
            existing.get("host").and_then(Value::as_str),
            Some("http://100.89.236.13:1234")
        );
        assert_eq!(
            existing.get("password").and_then(Value::as_str),
            Some("saved-password")
        );
    }

    #[test]
    fn fill_missing_credentials_fills_empty_existing_fields() {
        let mut existing = json!({
            "host": "http://100.89.236.13:1234",
            "password": ""
        })
        .as_object()
        .unwrap()
        .clone();
        let incoming = json!({
            "password": "recovered-password"
        })
        .as_object()
        .unwrap()
        .clone();

        assert!(fill_missing_credentials(&mut existing, incoming));
        assert_eq!(
            existing.get("password").and_then(Value::as_str),
            Some("recovered-password")
        );
    }

    #[test]
    fn fill_missing_credentials_preserves_nonempty_existing_fields() {
        let mut existing = json!({
            "host": "http://cloud-host:1234",
            "password": "saved-password"
        })
        .as_object()
        .unwrap()
        .clone();
        let incoming = json!({
            "host": "http://stale-local-host:1234",
            "password": "local-password"
        })
        .as_object()
        .unwrap()
        .clone();

        assert!(!fill_missing_credentials(&mut existing, incoming));
        assert_eq!(
            existing.get("host").and_then(Value::as_str),
            Some("http://cloud-host:1234")
        );
        assert_eq!(
            existing.get("password").and_then(Value::as_str),
            Some("saved-password")
        );
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
}
