# Technology Stack

**Analysis Date:** 2026-03-19

## Languages

**Primary:**
- TypeScript 5.9.3 - Frontend (React) and type generation
- Rust (2021 edition) - Backend (Tauri + Axum server) and CLI tooling

**Secondary:**
- SQL - Supabase migrations and database schema
- Shell - Build scripts, deployment, CI/CD

## Runtime

**Environment:**
- Node.js >=20.0.0 - Frontend build and package management
- Tauri v2.10.1 - Desktop app framework
- Rust tokio 1.x - Async runtime for backend

**Package Manager:**
- npm >=10.0.0 - Node dependencies
- Cargo - Rust dependencies (Rust 2021 edition)
- Lockfiles: `package-lock.json`, `Cargo.lock` (both committed)

## Frameworks

**Frontend:**
- React 19.2.4 - UI framework
- React Router 7.13.1 - Client-side routing
- Vite 8.0.0 - Build tool and dev server (port 5173)
- TanStack React Query 5.90.21 - Server state management
- TanStack React Virtual 3.13.6 - List virtualization for Conversation List

**Backend:**
- Tauri 2.x - Desktop app framework with plugins (tray-icon, shell, notification)
- Axum 0.7 - HTTP server (embedded, listens on `127.0.0.1:3000`)
- Tokio 1.x - Async runtime (multi-threaded)

**Testing:**
- Vitest 4.1.0 - Unit tests (frontend)
- Jest DOM + React Testing Library - Component testing
- Playwright - E2E tests (21 test files via `scripts/e2e.sh`)
- cargo test - Rust unit tests (231 tests)

**Build/Dev:**
- TypeScript ~5.9.3 - Type checking
- ESLint 9.39.4 + typescript-eslint - Linting
- Prettier 3.8.1 - Code formatting
- Tauri CLI 2.10.1 - App building and dev mode

## Key Dependencies

**Critical (Frontend):**
- `@tanstack/react-query` - All server state queries through centralized keys in `lib/query-keys.ts`
- `react-router-dom` - URL-based state and navigation
- `marked` 17.0.4 - Markdown rendering for notes and messages
- `@codemirror/*` - Code editor for note editing (6.x suite)
- `dompurify` 3.3.3 - Markdown XSS prevention
- `lucide-react` 0.577.0 - UI icon library
- `react-force-graph-2d` 1.29.1 - Knowledge graph visualization

**Critical (Backend/Rust):**
- `axum` 0.7 + `tokio` 1.x - HTTP server and async runtime
- `sqlx` 0.7 - SQLite ORM with compile-time query verification
- `reqwest` 0.12 - HTTP client (with rustls-tls, no default features)
- `serde_json` - JSON serialization
- `aes-gcm` 0.10 + `argon2` 0.5 - Encryption/key derivation for user_secrets
- `tokio-tungstenite` 0.21 - WebSocket for chat (native-tls)
- `async-imap` 0.9 - IMAP client for email
- `ical` 0.11 - iCalendar parsing for CalDAV
- `zeroize` 1.x - Memory safety for sensitive data

**Infrastructure (Backend):**
- `tower` 0.4 + `tower-http` 0.5 - HTTP middleware (CORS, timeout, tracing)
- `tracing` 0.1 + `tracing-subscriber` 0.3 - Structured logging
- `keyring` 3.x - OS keychain (apple-native, windows-native, sync-secret-service)
- `regex` 1.x - Pattern matching
- `chrono` 0.4 - Datetime handling
- `dirs` 5.x - Platform paths (`config_dir`, `data_local_dir`)
- `sha2` 0.10 + `base64` 0.22 + `subtle` 2.x - Cryptographic utilities

## Configuration

**Environment:**
- All config via environment variables loaded from `.env.local` (not committed)
- `.env.example` documents all required and optional environment variables
- Secrets stored in OS keychain via `src-tauri/src/secrets.rs` (never in env files)
- Runtime configuration through Settings → Connections UI

**Build:**
- `tsconfig.json` + `tsconfig.app.json` + `tsconfig.node.json` - TypeScript configuration
- `src-tauri/tauri.conf.json` - Tauri app config (window size, CSP, bundle targets)
- `supabase/config.toml` - Local Supabase development (API port 54321, DB port 54322, Studio port 54323)
- `.prettierrc` - Prettier formatting rules
- `vite.config.ts` - Frontend build configuration (implicit, using defaults)

**CSP (Content Security Policy):**
- `src-tauri/tauri.conf.json` restricts:
  - `script-src 'self'` - No inline scripts or eval
  - `connect-src 'self' http://127.0.0.1:3000 ws://127.0.0.1:3000 http://localhost:5173 ws://localhost:5173` - Only local Axum server and Vite dev server
  - `img-src 'self' data: http://127.0.0.1:3000` - Local and data URLs only (proxied images)
  - No `unsafe-eval` - prevents `Function()` or string-based `setTimeout()`

## Platform Requirements

**Development:**
- Node.js >=20.0.0
- Rust 1.70+ (via rustup recommended)
- OS-specific: macOS (Xcode Command Line Tools), Linux (build-essential), Windows (MSVC)
- Tauri prerequisites: WebKit (Linux), WKWebKit (macOS), WebView2 (Windows)

**Production:**
- Targets: Linux (CachyOS tested, likely any x86_64 distro), macOS (Intel/Apple Silicon), Windows (x64)
- Desktop distribution via Tauri bundler (`.deb`, `.app`, `.msi`)
- System tray integration via Tauri tray-icon plugin
- Waybar compatibility on Wayland/Hyprland

## Local Development Services

**Supabase (self-hosted development):**
- Docker container with PostgreSQL 17, Realtime, PostgREST
- API: `http://127.0.0.1:54321`
- Database: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`
- Studio (web UI): `http://127.0.0.1:54323`
- Seed data loaded from `supabase/seed.sql` on reset

**Backend Server (Tauri embedded Axum):**
- Listens: `http://127.0.0.1:3000` (localhost only, no remote access)
- Provides: Auth, messages, chat, vault, missions, reminders, calendar, email, homelab status, media, etc.
- Authentication: `X-API-Key` header with `MC_API_KEY` from OS keychain
- Session: JWT passthrough via `Authorization: Bearer <token>`

**Frontend Dev Server (Vite):**
- Listens: `http://localhost:5173`
- Hot module replacement (HMR)
- Proxies API requests to Axum server via `VITE_API_BASE` env var

## Database

**Primary:**
- Supabase (self-hosted PostgreSQL)
- 21 tables (users, todos, missions, ideas, etc.) with Row-Level Security (RLS)
- Realtime subscriptions enabled on public tables
- Migrations: 8 SQL files in `supabase/migrations/` (20260301000000_initial.sql through 20260317200000_security_fixes.sql)

**Local/Embedded:**
- SQLite (`~/.local/share/mission-control/db.sqlite`) for:
  - Offline-first sync state
  - User session (dev-only, 1h expiry)
  - Security event logging
  - Message cache (BlueBubbles)
  - Mission event cache

**Note Storage (optional):**
- CouchDB (Obsidian LiveSync format) proxied via Axum at `/api/vault/*`
- Credentials stored in OS keychain, never sent to frontend
- Configured via `COUCHDB_URL`, `COUCHDB_USER`, `COUCHDB_PASSWORD`, `COUCHDB_DATABASE`

---

*Stack analysis: 2026-03-19*
