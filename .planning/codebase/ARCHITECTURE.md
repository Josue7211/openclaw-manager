# Architecture

**Analysis Date:** 2026-04-03

## System Shape

- Mission Control is a Tauri v2 desktop app with a React frontend and an embedded Rust/Axum backend.
- The backend runs locally on `127.0.0.1:3000` and acts as the only trusted gateway from the webview to remote services.
- The app is local-first but not offline-only: SQLite handles local state while Supabase remains the remote source of truth for synced data.

## Layers

- Presentation: React pages, components, hooks, and client state in `frontend/src/`
- Local gateway: Rust server, auth middleware, route handlers, and service proxies in `src-tauri/src/`
- Persistence: SQLite for local state plus Supabase/PostgREST for shared data
- System integration: keychain, logging, validation, crypto, and Tailscale checks

## Main Contracts

- `AppState` in `src-tauri/src/server.rs` is the shared backend context.
- `RequireAuth` gates authenticated routes and enforces MFA before data access.
- `UserSession` stores the current user tokens and derived encryption key.
- `frontend/src/lib/service-registry.ts` is the frontend source of truth for connection groups and form fields.

## Request Flow

- The frontend makes requests through a local API wrapper.
- The Rust backend authenticates and validates requests.
- Remote service calls are proxied through route-specific clients.
- Sensitive data stays in the backend or the OS keychain.

## Integration Model

- OpenClaw is the centerpiece runtime and has a built-in gateway that Mission Control can control directly.
- Mission Control is a control-plane wrapper around the OpenClaw gateway itself, plus its own safe UI/workflow features that sit above the gateway.
- MemD is the assistant brain layer: it owns durable context, memory retrieval, and compaction policies that shape higher-level agent behavior.
- AgentShell is a separate optional safety wrapper/adapter that can sit in front of OpenClaw directly or in front of Mission Control's gateway access.
- BlueBubbles, Supabase, homelab services, email, calendar, ntfy, and notes all plug into the same backend proxy model.

## Important Boundaries

- The frontend should not know raw credentials after capture.
- The backend should not expose secret material back to the webview.
- Service-specific logic belongs in route modules, not the React tree.
- MemD should stay a first-class subsystem, not a per-page cache.
- AgentShell should remain a thin adapter, not a second runtime.
- Mission Control should be thought of as a wrapper around OpenClaw's gateway first, with extra safe features layered on top where needed, and a general personal infrastructure hub second.
- AgentShell should be thought of as a drop-in safety boundary for OpenClaw consumers, not a product-specific layer.
