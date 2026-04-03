# Codebase Concerns

**Analysis Date:** 2026-04-03

## Current Risks

- `frontend/src/pages/settings/SettingsConnections.tsx` still has some duplicated service metadata relative to `frontend/src/lib/service-registry.ts`.
- `src-tauri/src/routes/messages.rs` is still a large module and remains the highest-maintenance route file.
- `src-tauri/src/routes/agent_shell.rs` is currently a proxy layer; it still needs typed request validation before it becomes a stable app contract.
- `src-tauri/src/server.rs` still carries a lot of auth/session responsibility, so auth regressions there affect the whole app.

## Security Risks

- Origin and local-host auth assumptions in `src-tauri/src/server.rs` deserve continued review.
- Secrets must stay out of process environment and browser globals.
- CSP and shell allowlists should remain tight because the app loads rich content and remote integrations.
- AgentShell must never become a second secret authority.

## Maintainability Risks

- The messages route is still the biggest candidate for module splitting.
- Several backend route groups are still hand-wired and easy to drift from the frontend contract.
- Frontend settings and onboarding are better than before, but the settings page should be fully moved onto the shared service registry.

## Performance Risks

- Search, message rendering, and route-heavy pages should be watched for re-render pressure.
- Long proxy chains can hide latency if health checks and timeouts drift.
- Connection limits and polling intervals should stay visible in docs and tests.

## What Looks Healthy

- The core service registry is now centralized.
- The backend gateway pattern is consistent.
- AgentShell is isolated as an adapter instead of being embedded into the product runtime.
- The repo still has strong local-first and secret-minimization boundaries.
