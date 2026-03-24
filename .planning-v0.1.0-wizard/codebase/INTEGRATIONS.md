# External Integrations

**Analysis Date:** 2026-03-19

## APIs & External Services

**Messages (macOS only):**
- BlueBubbles - iMessage bridge server running on Mac
  - SDK/Client: Custom `bb_fetch()` pattern in `src-tauri/src/routes/messages.rs` (250+ lines)
  - Host env var: `BLUEBUBBLES_HOST` (e.g., `http://your-bluebubbles-host:1234`)
  - Auth: `BLUEBUBBLES_PASSWORD` query parameter (redacted in logs via `redact_bb_url()`)
  - Endpoints: `/api/messages` - fetch conversations, send messages, manage reactions, share attachments
  - SQLite cache: Message history stored locally to avoid repeated BlueBubbles queries
  - SSE + GUID deduplication: Real-time message streaming with duplicate detection

**Chat (AI Agent):**
- OpenClaw - AI workspace gateway (remote VM)
  - WebSocket: `OPENCLAW_WS` (e.g., `ws://your-openclaw-host:18789`)
  - HTTP: `OPENCLAW_API_URL` (e.g., `http://your-openclaw-host:8080`)
  - Auth: `OPENCLAW_PASSWORD` (password auth) + `OPENCLAW_API_KEY` (HTTP key auth)
  - Implementation: `src-tauri/src/routes/chat.rs` - WebSocket for real-time chat, SSE for long responses
  - Connection limits: Max 5 concurrent WebSocket + 5 concurrent SSE connections per app instance
  - Frontend display: `VITE_OPENCLAW_WS` + `VITE_OPENCLAW_HTTP` for iframe embedding
  - Image handling: Chat responses can reference images stored in `~/.openclaw/chat_images/`

**Calendar (optional - CalDAV):**
- CalDAV server (default iCloud: `https://caldav.icloud.com`)
  - URL env var: `CALDAV_URL`
  - Auth: `CALDAV_USERNAME` + `CALDAV_PASSWORD` (basic auth)
  - Implementation: `src-tauri/src/routes/calendar.rs` - iCalendar parsing, SSRF protection (redirect policy: none)
  - Endpoints: Fetch calendar events via PROPFIND/REPORT
  - Fallback: No credentials = empty calendar

**Reminders (macOS only):**
- Mac Bridge - Companion service for Apple ecosystem
  - SDK/Client: REST API proxy in `src-tauri/src/routes/reminders.rs`
  - Host env var: `MAC_BRIDGE_HOST` (e.g., `http://macbook.tailnet.ts.net:4100`)
  - Auth: `MAC_BRIDGE_API_KEY` (X-API-Key header)
  - Endpoints: GET/PATCH reminders, manage Apple Reminders
  - Source: Separate repo `github.com/Josue7211/mac-bridge` (macOS launchd service)
  - Platform: macOS only - unavailable on Linux/Windows

**Notes/Vault (optional - CouchDB):**
- CouchDB - Obsidian LiveSync format notes
  - Host env var: `COUCHDB_URL` (e.g., `http://couchdb-host:5984`)
  - Auth: `COUCHDB_USER` + `COUCHDB_PASSWORD` (basic auth)
  - Database: `COUCHDB_DATABASE` (default: `josue-vault`)
  - Implementation: `src-tauri/src/routes/vault.rs` - Proxy all CouchDB requests through Axum
  - Credentials never reach frontend (stored in OS keychain)
  - Chunk format: Base64-encoded segments reassembled on frontend
  - Filter: LiveSync internal docs (`h:*`, `ps:*`, `ix:*`, `cc:*`, `_design/*`) filtered on both backend and frontend

**Email (optional - IMAP):**
- IMAP server (any RFC 5321 compliant)
  - Host env var: `EMAIL_HOST` (e.g., `imap.gmail.com`)
  - Port env var: `EMAIL_PORT` (default: 993, TLS)
  - Auth: `EMAIL_USER` + `EMAIL_PASSWORD`
  - Implementation: `src-tauri/src/routes/email.rs` - async-imap client with TLS
  - Endpoints: `/api/email` - fetch mailboxes and messages
  - TLS: async-native-tls (platform-native TLS)

**Homelab - Proxmox (optional):**
- Proxmox VE - Virtualization platform
  - Host env var: `PROXMOX_HOST` (e.g., `https://your-proxmox-host:8006`)
  - Auth: `PROXMOX_TOKEN_ID` (user@pam!token-name) + `PROXMOX_TOKEN_SECRET` (API token)
  - Implementation: `src-tauri/src/routes/homelab.rs` - HTTP client with token auth
  - Endpoints: Get nodes, VMs, resources; fallback to mock data if unconfigured

**Homelab - OPNsense (optional):**
- OPNsense - Network firewall/router
  - Host env var: `OPNSENSE_HOST` (e.g., `https://your-opnsense-host`) or `OPNSENSE_URL` (fallback)
  - Auth: `OPNSENSE_API_KEY` + `OPNSENSE_API_SECRET` (or `OPNSENSE_KEY` + `OPNSENSE_SECRET`)
  - Implementation: `src-tauri/src/routes/homelab.rs` - HTTP client with key/secret headers
  - Endpoints: System resources, CPU, memory, bandwidth
  - Fallback: Mock data if unconfigured

**Media - Plex (optional):**
- Plex Media Server
  - URL env var: `PLEX_URL` (e.g., `http://your-plex-host:32400`)
  - Auth: `PLEX_TOKEN`
  - Implementation: `src-tauri/src/routes/media.rs` - XML parsing (uses `xml-rs`)
  - Endpoints: Now playing, recently added, library stats
  - Fallback: Empty data if unconfigured

**Media - Sonarr (optional):**
- Sonarr - TV show management
  - URL env var: `SONARR_URL` (e.g., `http://your-sonarr-host:8989`)
  - Auth: `SONARR_API_KEY` (X-Api-Key header)
  - Implementation: `src-tauri/src/routes/media.rs`
  - Endpoints: Upcoming episodes, queue status

**Media - Radarr (optional):**
- Radarr - Movie management
  - URL env var: `RADARR_URL` (e.g., `http://your-radarr-host:7878`)
  - Auth: `RADARR_API_KEY` (X-Api-Key header)
  - Implementation: `src-tauri/src/routes/media.rs`
  - Endpoints: Upcoming movies, queue status

**Notifications (optional - ntfy.sh):**
- ntfy.sh - Push notification service
  - URL env var: `NTFY_URL` (default: `https://ntfy.sh` or self-hosted)
  - Topic env var: `NTFY_TOPIC` (default: `mission-control`)
  - Implementation: `src-tauri/src/routes/notify.rs` + `src-tauri/src/routes/pipeline/helpers.rs`
  - Method: HTTP POST to `/TOPIC` with JSON body
  - Used by: Mission events, security alerts, pipeline notifications
  - Note: CRLF-safe headers to prevent header injection

**AI Agents/Memory (optional - OpenClaw API):**
- OpenClaw API - Agent memory and data retrieval
  - URL env var: `OPENCLAW_API_URL` (e.g., `http://your-openclaw-host:8080`)
  - Auth: `OPENCLAW_API_KEY` (Authorization header)
  - Implementation: `src-tauri/src/routes/memory.rs`
  - Endpoints: Search agent memory, knowledge graph queries

## Data Storage

**Databases:**
- **PostgreSQL** (via Supabase)
  - Connection: Remote via tunnel `ssh services-vm -L 15432:172.18.0.4:5432`
  - User: `supabase_admin` (not `postgres`)
  - Client: Custom `SupabaseClient` in `src-tauri/src/supabase.rs` (service-role key)
  - Tables: 21 tables (users, todos, missions, ideas, habits, mission_events, etc.)
  - RLS: All tables enforce Row-Level Security (user-only isolation)
  - Realtime: Subscriptions enabled for public schema

- **SQLite** (local)
  - Path: `~/.local/share/mission-control/db.sqlite`
  - Purpose: Offline sync state, session cache, security event log, message cache
  - ORM: sqlx (with compile-time query verification)

**File Storage:**
- Local filesystem only (no cloud object storage)
  - Notes: CouchDB (Obsidian LiveSync) via `COUCHDB_URL`
  - Chat images: `~/.openclaw/chat_images/` (served via Axum at `/api/chat/image`)
  - App logs: `~/.local/share/mission-control/logs/` (daily rotation, 7-day retention)

**Caching:**
- In-memory (Rust):
  - Avatar cache: LRU (500 entries, `Arc<Vec<u8>>`)
  - Link preview cache: LRU (500 entries)
  - Message connection counters: Atomic (5 concurrent WS, 5 concurrent SSE)

- Local SQLite:
  - Message cache from BlueBubbles (avoid repeated API calls)
  - Mission event cache

## Authentication & Identity

**Auth Provider:**
- Supabase Auth (self-hosted GoTrue)
  - Implementation: Custom OAuth + MFA integration in `src-tauri/src/routes/auth.rs` (66KB)
  - Methods: Email/password + PKCE OAuth (GitHub, Google) + TOTP + WebAuthn
  - Session: JWT in `Authorization: Bearer` header (3600s expiry, 24h hard timeout)
  - MFA: Hard gate via `RequireAuth` extractor (MFA must be verified before data access)
  - Device auth: `MC_API_KEY` from OS keychain (per-install key)
  - Backend session: Server-side `UserSession` struct with encryption key + MFA status
  - Dev mode: Session persisted to `_dev_session` SQLite table (1h expiry, debug-only)

**Session Management:**
- Auto-refresh: When access token expires within 5min, refresh token automatically exchanges it
- PKCE: OAuth code exchange with challenge/verifier to prevent code injection
- Nonce: Stored in app memory during OAuth flow, verified in callback
- Rate limiting: Per-user per-path (not shared bucket)

**Encryption:**
- User secrets: AES-256-GCM with Argon2id key derivation
- Sensitive session data: Zeroized on drop (memory safety)

## Monitoring & Observability

**Error Tracking:**
- None configured (fully self-hosted)
- Local error reporting via `error-reporter.ts` (frontend) + `tracing` (backend)

**Logs:**
- Backend: Structured logging via `tracing` + `tracing-subscriber` (stdout + daily rotating file)
- Path: `~/.local/share/mission-control/logs/YYYY-MM-DD.log`
- Retention: 7 days (cleanup on startup)
- Security: No credentials logged (redaction via `redact.rs`)

**Metrics:**
- Custom counters for connection limits (WebSocket, SSE)
- Prometheus-style metrics not integrated

## CI/CD & Deployment

**Hosting:**
- Desktop (self-hosted on user's machine)
- Remote services reachable via Tailscale mesh VPN (100.x.x.x addresses)
- Cloudflare Access (Zero Trust) on `*.aparcedo.org` domains for web UIs

**CI Pipeline:**
- GitHub Actions (`.github/workflows/ci.yml`)
- SHA-pinned actions for security
- Runs: linting, type checking, tests (frontend + backend), build (all platforms)
- Publish: Tauri artifacts as GitHub release assets

**Deployment:**
- Tauri bundler generates:
  - Linux: `.deb` (Debian/Ubuntu), AppImage (generic)
  - macOS: `.dmg` (universal binary - Intel + Apple Silicon)
  - Windows: `.msi` (x64)
- Manual updates via GitHub releases (no auto-update plugin enabled)

## Environment Configuration

**Required env vars:**
- `VITE_SITE_URL` - Frontend URL (default: `http://localhost:5173`)
- `VITE_SUPABASE_URL` - Supabase project URL
- `VITE_SUPABASE_ANON_KEY` - Supabase anonymous key (frontend only)
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key (backend only)
- `MC_API_KEY` - Local API key (auto-generated, stored in OS keychain)

**Optional env vars:**
- All service integrations (Proxmox, OPNsense, Plex, Sonarr, Radarr, BlueBubbles, OpenClaw, CalDAV, Email, CouchDB, Mac Bridge, ntfy)

**Secrets location:**
- OS keychain (via Tauri + `keyring` crate):
  - Linux: `secret-service` (GNOME Keyring / KDE Wallet)
  - macOS: Keychain
  - Windows: Windows Credential Manager
- Runtime secrets never persisted to disk (zeroized on drop)

**Build-time secrets:**
- `.env.local` (git-ignored) - sourced during `cargo tauri dev`
- No secrets committed to repo

## Webhooks & Callbacks

**Incoming:**
- OAuth callback: `GET /auth/callback?code=...&state=...` (PKCE validation)
- Email webhook: None (IMAP pull model)
- Notification webhook: None (ntfy is push-only from app)

**Outgoing:**
- Ntfy push: POST to `NTFY_URL/{NTFY_TOPIC}` (mission events, security alerts)
- Supabase webhooks: None (using Realtime subscriptions instead)
- CalDAV: GET/PROPFIND only (read-only access)

## Service Connectivity Model

**Network Layers:**
1. **Local (127.0.0.1):** Tauri webview ↔ Axum server (localhost:3000)
2. **Tailscale (100.x.x.x):** Axum server ↔ Remote services (BlueBubbles, OpenClaw, Supabase, CouchDB, etc.)
3. **Public (*.aparcedo.org):** Web UIs protected by Cloudflare Access (GitHub/Google OAuth)

**Service Health Checks:**
- Implemented in `src-tauri/src/routes/status.rs`
- Checks: Supabase, BlueBubbles, OpenClaw, Proxmox, OPNsense, Plex, Sonarr, Radarr, CouchDB, CalDAV, Mac Bridge
- Endpoint: `GET /api/status` - Returns health of all configured services

**Retry & Timeout Strategy:**
- Default timeout: 30 seconds (via `reqwest` client in `service_client.rs`)
- Retry: 5xx errors (configurable per endpoint)
- SSRF protection: DNS pinning via `reqwest .resolve()`, redirect policy: none (CalDAV, OPNsense)

---

*Integration audit: 2026-03-19*
