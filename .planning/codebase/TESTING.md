# Testing Patterns

**Analysis Date:** 2026-04-03

## Frontend Tests

- Vitest is the unit test runner.
- jsdom is the default browser environment.
- Testing Library is used for React components and user interactions.
- Coverage is configured through Vitest and lives under `frontend/coverage/`.

## Frontend Test Commands

```bash
cd frontend && npm test
cd frontend && npm run test:watch
cd frontend && npm run test:e2e
cd frontend && npm run test:e2e:headed
cd frontend && npm run typecheck
cd frontend && npm run lint
```

## Backend Tests

- Rust verification runs through `cargo check`, `cargo test`, and `cargo clippy`.
- Backend route logic is tested with unit tests in `src-tauri/src/` and integration-style checks where practical.
- The Tauri desktop binary is exercised through dev and build commands.

## Repository Verification Pattern

- Frontend typecheck is used to verify shared service contracts after refactors.
- `git diff --check` is used to catch formatting and patch errors.
- Cross-platform CI is expected to run at least Linux and macOS.

## Test Layout

- Component and hook tests live near the source they cover.
- Backend tests are kept with the Rust modules they validate.
- Service contract refactors should be verified at both the type level and the route level.

## High Value Test Areas

- Connection capture and settings flows
- Wizard service test endpoints
- AgentShell proxy routes
- Auth/session handling
- Service registry changes
- Route modules with large payload or proxy logic
