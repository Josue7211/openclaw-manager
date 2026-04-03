# Technology Stack

**Analysis Date:** 2026-04-03

## Languages

- TypeScript 5.9.x for the React frontend and typed helpers
- Rust 2021 for the Tauri backend, Axum server, and desktop integration
- SQL for Supabase and SQLite schema definitions
- Shell for scripts and service helpers

## Runtime

- Node.js >=20 and npm >=10 for the frontend toolchain
- Rust stable with Cargo for the backend toolchain
- Tauri v2 as the desktop shell
- Tokio 1.x as the async runtime

## Frontend Stack

- React 19.2.x
- React Router 7.13.x
- Vite 8.x
- TanStack React Query 5.90.x
- TanStack React Virtual 3.13.x
- CodeMirror 6 modules for editor surfaces
- DOMPurify, Marked, Highlight.js, and React Force Graph 2D for content-heavy pages
- Phosphor icons and Tailwind 4 for UI styling support

## Backend Stack

- Axum 0.7 for the embedded HTTP API
- sqlx 0.7 for SQLite access and query verification
- reqwest 0.12 for outbound service calls
- tower-http 0.5 for CORS, timeout, and tracing middleware
- tokio-tungstenite 0.21 for OpenClaw WebSocket flows
- async-imap 0.9 and async-native-tls 0.5 for email
- ical 0.11 for CalDAV parsing
- keyring 3.x for OS keychain integration
- aes-gcm, argon2, zeroize, subtle, sha2, base64 for credential handling

## Build And Test

- `frontend/package.json` owns Vite, Vitest, ESLint, Prettier, Knip, and frontend typecheck scripts
- `src-tauri/Cargo.toml` owns the Rust binary, Tauri plugins, and backend dependencies
- `package.json` at the repo root provides top-level dev and database tunnel scripts
- `src-tauri/tauri.conf.json` defines the desktop shell, CSP, and bundle targets

## Configuration Model

- Runtime secrets are loaded from the OS keychain through `src-tauri/src/secrets.rs`
- `.env.local` is a developer convenience, not the primary secret store
- `.env.example` documents the expected local and self-hosted values
- `frontend/src/lib/service-registry.ts` is the frontend source of truth for connection groups
- `AGENTSHELL_URL` is the AgentShell adapter hook in Mission Control

## Platform Targets

- Linux and macOS are the primary desktop targets
- Windows is still supported, but secondary
- Tauri prerequisites differ by OS: WebKit on Linux, WKWebView on macOS, WebView2 on Windows

## Notes

- The backend listens on `127.0.0.1:3000` and the frontend talks to remote services only through that gateway
- Supabase is the persistent source of truth for synced product data
- SQLite is used for local state and backend caching
