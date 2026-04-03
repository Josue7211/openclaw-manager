# Codebase Structure

**Analysis Date:** 2026-04-03

## Top-Level Layout

```text
mission-control/
├── frontend/
├── src-tauri/
├── supabase/
├── docs/
├── scripts/
├── .planning/codebase/
├── .github/workflows/
├── README.md
├── CHANGELOG.md
├── CLAUDE.md
├── package.json
├── tsconfig.json
└── .gitignore
```

## Frontend

- `frontend/src/main.tsx` is the React entry point and route registry.
- `frontend/src/components/` holds reusable shell, onboarding, and domain UI.
- `frontend/src/pages/` holds the route pages for dashboard, chat, messages, settings, and service areas.
- `frontend/src/hooks/` holds data fetching and interaction hooks.
- `frontend/src/lib/` holds the API client, service registry, storage helpers, and state machines.

## Frontend Notable Files

- `frontend/src/lib/service-registry.ts` centralizes connection groups for onboarding and setup.
- `frontend/src/pages/settings/SettingsConnections.tsx` is the live connection editor.
- `frontend/src/components/OnboardingWelcome.tsx` is the first-run wizard.
- `frontend/src/components/SetupWizard.tsx` is the wizard orchestration wrapper.
- `frontend/src/lib/api.ts` is the fetch wrapper into the local Rust backend.
- `frontend/src/lib/query-keys.ts` centralizes React Query keys.

## Backend

- `src-tauri/src/main.rs` starts the Tauri app and initializes the backend process.
- `src-tauri/src/server.rs` defines `AppState`, auth/session types, and backend middleware.
- `src-tauri/src/routes/` contains the feature routers for the embedded Axum API.
- `src-tauri/src/supabase.rs` and `src-tauri/src/sync.rs` handle remote persistence and sync.
- `src-tauri/src/secrets.rs` handles OS keychain access and secret loading.

## Backend Notable Files

- `src-tauri/src/routes/mod.rs` merges the route tree.
- `src-tauri/src/routes/agent_shell.rs` and `agent_shell_support.rs` proxy AgentShell requests.
- `src-tauri/src/routes/wizard.rs` owns service test and credential bootstrap flows.
- `src-tauri/src/routes/status.rs` provides connectivity and configuration status.
- `src-tauri/src/routes/messages.rs` is still a large integration-heavy module.

## Docs And Planning

- `docs/` contains the user-facing setup, security, and integration docs.
- `.planning/STATE.md` tracks milestone state and the current phase context.
- `.planning/codebase/` stores this codebase map.

## Build And Ops

- `scripts/` holds development and pre-commit helpers.
- `supabase/` holds remote database configuration and migrations.
- `.github/workflows/ci.yml` runs cross-platform CI.

## Structural Notes

- The app is a desktop Tauri shell with a local Rust gateway on `127.0.0.1:3000`.
- The frontend talks to services through the Rust backend, not directly.
- Service contracts are now centralized in the frontend registry and mirrored in backend routes.
