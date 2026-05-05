# Security Review: Desktop Auth and Email Access

Date: 2026-05-05
Scope: `src-tauri/src/server.rs`, `src-tauri/src/routes/email.rs`, `src-tauri/src/routes/mail_accounts.rs`

## Executive Summary

The Harness 401 investigation exposed a real auth-boundary risk in debug builds: localhost-origin requests could bypass the desktop API key, and Email/Mail Accounts GET routes could return mailbox/account data without a verified app session. This has been fixed by making the dev bypass explicit opt-in and requiring `RequireAuth` for email reads and mail account reads.

## Findings

### SEC-001: Debug localhost API-key bypass was too broad

Severity: High

Location: `src-tauri/src/server.rs:1156`

Evidence: API-key bypass for localhost and Tauri origins is now guarded by `ALLOW_INSECURE_DEV_API_KEY_BYPASS`; before this fix, debug builds allowed those origins by default. Because the backend keeps a process-wide authenticated user session, any local origin that reached the debug server could have reused that session boundary.

Impact: A local web page or process could make authenticated-looking API calls during a signed-in desktop session in debug mode.

Fix applied: The bypass is now off by default and only enabled when `ALLOW_INSECURE_DEV_API_KEY_BYPASS=1` is explicitly set.

### SEC-002: Email and mail account reads did not require a user session

Severity: High

Location: `src-tauri/src/routes/email.rs:527`, `src-tauri/src/routes/mail_accounts.rs:234`

Evidence: `GET /api/email` and `GET /api/mail-accounts` now use `RequireAuth`. Before this fix, both routes accepted optional sessions and fell back to local/default AgentMail or IMAP configuration.

Impact: Private email metadata, account labels, and mailbox previews could be exposed locally without a verified ClawControl account session.

Fix applied: Both GET paths require `RequireAuth`; email account selection is resolved from the authenticated user's synced mail account registry.

## Verification

- `CARGO_TARGET_DIR=/tmp/mc-target cargo check --manifest-path src-tauri/Cargo.toml`
- `PATH="/opt/homebrew/bin:/usr/local/bin:$PATH" NODE_OPTIONS="--no-experimental-webstorage" ./frontend/node_modules/.bin/tsc --noEmit --project frontend/tsconfig.app.json`
- `CARGO_TARGET_DIR=/tmp/mc-target cargo test --manifest-path src-tauri/Cargo.toml routes::email::tests -- --nocapture`
- `CARGO_TARGET_DIR=/tmp/mc-target cargo test --manifest-path src-tauri/Cargo.toml routes::mail_accounts::tests -- --nocapture`
- `CARGO_TARGET_DIR=/tmp/mc-target cargo test --manifest-path src-tauri/Cargo.toml server::tests -- --nocapture`
- Runtime check: unauthenticated `GET /api/mail-accounts` and `GET /api/email` now return `401 Unauthorized`.

## Remaining Follow-Ups

- Add route-level integration tests for unauthenticated Email/Mail Accounts GET rejection.
- Continue the Email product work separately: real unified mailbox sync, account creation through AgentMail, draft review, and sent/drafts views.
