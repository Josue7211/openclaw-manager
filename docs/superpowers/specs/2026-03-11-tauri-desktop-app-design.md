# Mission Control — Tauri Desktop App Design

**Date:** 2026-03-11
**Status:** Approved
**Author:** Josue

## Overview

Wrap the existing mission-control Next.js app in a Tauri v2 desktop shell for cross-platform distribution to family and friends. The app bundles a Node.js sidecar running the Next.js server, with Rust-side secret management via OS keychain and native OS notifications.

## Goals

- Distribute mission-control as a downloadable desktop app (.dmg, .msi, .AppImage)
- Support macOS (Intel + Apple Silicon), Windows (x64), and Linux
- Non-technical users can install and set up with a wizard or config import
- Auto-updates so users always run the latest version
- Modular feature system — app adapts to whatever integrations a user has configured
- Native OS notifications for real-time events (e.g. new iMessage)
- Secrets stored in OS keychain, never in plain text files
- Local SQLite database — zero external database setup required
- Optional self-hosted sync for multi-device users

## Non-Goals

- Mobile support (future — Tauri v2 supports iOS/Android but not in scope)
- Rewriting API routes in Rust (existing Next.js routes stay as-is)
- Electron (Tauri chosen for smaller binary size and Rust security)
- Cloud-hosted database (each user stores data locally)

## Architecture

### High-Level Overview

```
Tauri Desktop App
├── Webview (React/Next.js frontend)
│   └── fetch() → localhost:3000
├── Rust Core
│   ├── Secret management (OS keychain)
│   ├── SQLite database (local, per-user)
│   ├── Native notifications
│   ├── System tray
│   ├── Auto-updater
│   ├── Sidecar lifecycle management
│   └── Sync client (optional, Phase 2)
└── Node.js Sidecar (Next.js standalone server)
    ├── 59 API routes (migrated from Supabase → SQLite)
    ├── SSE streaming endpoints
    ├── Middleware (auth + rate limiting)
    └── Bound to 127.0.0.1:3000 only
```

### Startup Sequence

1. User launches app — Tauri process starts
2. Rust reads all secrets from OS keychain
3. Rust spawns Node.js sidecar with secrets injected as environment variables
4. Rust waits for sidecar health check (`GET /api/health` returns 200)
5. Webview loads `http://127.0.0.1:3000`
6. If first run (no secrets found), webview shows setup wizard instead

### Shutdown Sequence

1. User closes window or quits from tray
2. Tauri sends SIGTERM to Node.js sidecar
3. Sidecar gracefully shuts down
4. Tauri process exits

## Secret Management

### Storage

All secrets stored in OS keychain under the namespace `com.mission-control`:

| Key | Example Value | Required |
|-----|---------------|----------|
| `com.mission-control.bluebubbles.host` | `http://100.69.211.3:1234` | No |
| `com.mission-control.bluebubbles.password` | `(password)` | No |
| `com.mission-control.sync.url` | `https://sync.yourdomain.com` | No (Phase 2) |
| `com.mission-control.sync.token` | `(auth token)` | No (Phase 2) |
| `com.mission-control.caldav.url` | `https://caldav.icloud.com` | No |
| `com.mission-control.caldav.username` | `user@icloud.com` | No |
| `com.mission-control.caldav.password` | `(app password)` | No |
| `com.mission-control.proxmox.host` | `https://10.0.0.PROXMOX:8006` | No |
| `com.mission-control.proxmox.token-id` | `root@pam!mc` | No |
| `com.mission-control.proxmox.token-secret` | `(token)` | No |
| `com.mission-control.opnsense.host` | `https://10.0.0.1` | No |
| `com.mission-control.opnsense.key` | `(key)` | No |
| `com.mission-control.opnsense.secret` | `(secret)` | No |
| `com.mission-control.mc-api-key` | `(auto-generated)` | Yes (auto) |
| `com.mission-control.plex.url` | `http://10.0.0.SERVICES:32400` | No |
| `com.mission-control.plex.token` | `(token)` | No |
| `com.mission-control.openclaw.ws` | `ws://127.0.0.1:18789` | No |
| `com.mission-control.openclaw.password` | `(password)` | No |
| `com.mission-control.mac-bridge.host` | `http://100.69.211.3:4100` | No |
| `com.mission-control.mac-bridge.api-key` | `(key)` | No |
| `com.mission-control.anthropic.api-key` | `(key)` | No |
| `com.mission-control.sonarr.url` | `http://10.0.0.SERVICES:8989` | No |
| `com.mission-control.sonarr.api-key` | `(key)` | No |
| `com.mission-control.radarr.url` | `http://10.0.0.SERVICES:7878` | No |
| `com.mission-control.radarr.api-key` | `(key)` | No |
| `com.mission-control.email.host` | `imap.gmail.com` | No |
| `com.mission-control.email.port` | `993` | No |
| `com.mission-control.email.user` | `user@gmail.com` | No |
| `com.mission-control.email.password` | `(app password)` | No |
| `com.mission-control.ntfy.url` | `https://ntfy.sh` | No |
| `com.mission-control.ntfy.topic` | `(topic)` | No |

### MC_API_KEY Auto-Generation

On first launch, if no `mc-api-key` exists in keychain, Rust generates a random 256-bit hex string and stores it. This key is injected into the sidecar and used by the webview automatically. Users never interact with it.

### Keychain → Environment Variable Mapping

Rust reads keychain entries and maps them to the environment variables the Next.js app expects:

```
com.mission-control.bluebubbles.host     → BLUEBUBBLES_HOST
com.mission-control.bluebubbles.password → BLUEBUBBLES_PASSWORD
com.mission-control.sync.url             → SYNC_URL (Phase 2, optional)
com.mission-control.sync.token           → SYNC_TOKEN (Phase 2, optional)
com.mission-control.caldav.url           → CALDAV_URL
com.mission-control.caldav.username      → CALDAV_USERNAME
com.mission-control.caldav.password      → CALDAV_PASSWORD
com.mission-control.proxmox.host         → PROXMOX_HOST
com.mission-control.proxmox.token-id     → PROXMOX_TOKEN_ID
com.mission-control.proxmox.token-secret → PROXMOX_TOKEN_SECRET
com.mission-control.opnsense.host        → OPNSENSE_HOST
com.mission-control.opnsense.key         → OPNSENSE_KEY
com.mission-control.opnsense.secret      → OPNSENSE_SECRET
com.mission-control.mc-api-key           → MC_API_KEY
com.mission-control.plex.url             → PLEX_URL
com.mission-control.plex.token           → PLEX_TOKEN
com.mission-control.openclaw.ws          → OPENCLAW_WS
com.mission-control.openclaw.password    → OPENCLAW_PASSWORD
com.mission-control.mac-bridge.host      → MAC_BRIDGE_HOST
com.mission-control.mac-bridge.api-key   → MAC_BRIDGE_API_KEY
com.mission-control.anthropic.api-key    → ANTHROPIC_API_KEY
com.mission-control.sonarr.url           → SONARR_URL
com.mission-control.sonarr.api-key       → SONARR_API_KEY
com.mission-control.radarr.url           → RADARR_URL
com.mission-control.radarr.api-key       → RADARR_API_KEY
com.mission-control.email.host           → EMAIL_HOST
com.mission-control.email.port           → EMAIL_PORT
com.mission-control.email.user           → EMAIL_USER
com.mission-control.email.password       → EMAIL_PASSWORD
com.mission-control.ntfy.url             → NTFY_URL
com.mission-control.ntfy.topic           → NTFY_TOPIC
```

## Database — Local SQLite

### Overview

Each user gets their own SQLite database stored in the app's data directory:
- macOS: `~/Library/Application Support/com.mission-control/data.db`
- Windows: `%APPDATA%/com.mission-control/data.db`
- Linux: `~/.local/share/com.mission-control/data.db`

This replaces Supabase as the default storage backend. Zero setup — the database is created on first launch with the schema applied automatically via migrations.

### SQLite Implementation

**Library choice: `tauri-plugin-sql`** (Rust-managed SQLite exposed via IPC)

Rather than `better-sqlite3` (native C++ addon with cross-platform bundling headaches), Rust owns the SQLite database via `tauri-plugin-sql`. The Node.js sidecar accesses it through a lightweight bridge:
- Rust exposes `db_query` and `db_execute` Tauri commands
- `lib/db.ts` in Node.js calls these via a local HTTP endpoint that Rust serves alongside the sidecar, or via a Unix socket/named pipe
- Alternative: Node.js uses `sql.js` (WASM-based SQLite, zero native deps, works everywhere)

**Recommended: `sql.js` for simplicity.** WASM SQLite runs in Node.js with no native compilation needed. The database file path is passed as an env var by Rust at sidecar launch. This avoids the entire cross-platform native addon problem.

**Migration strategy:**
- Create a `lib/db.ts` module that exposes query helpers matching current Supabase patterns
- API routes swap `supabase.from('todos').select()` → `db.query('SELECT * FROM todos')`
- Schema lives in `migrations/` as numbered SQL files
- Node.js applies migrations on server startup (before accepting requests)
- SQLite configured with WAL mode for crash resilience and concurrent reads

### Supabase Realtime Replacement

Five frontend pages use `supabase.channel()` / `.on('postgres_changes', ...)` for live updates. SQLite has no built-in push mechanism. Replacement strategy:

**Server-Sent Events (SSE) from Next.js API:**
- New endpoint: `GET /api/db/changes` — SSE stream
- When any API route writes to SQLite, it emits a change event (table name + row ID)
- Frontend subscribes to this SSE stream and refreshes relevant data
- This reuses the same SSE pattern already working for messages and chat

**Migration per page:**
- `app/page.tsx` — replace 3 Supabase realtime channels with SSE subscription
- `app/agents/page.tsx` — replace agents realtime with SSE
- `app/personal/page.tsx` — replace todos + cache realtime with SSE
- `app/todos/page.tsx` — replace todos realtime with SSE
- `app/pipeline/page.tsx` — replace ideas realtime with SSE

### Email Account Passwords

The `email_accounts` table stores IMAP passwords per-row. These must not sit in plaintext SQLite. Strategy:
- Each email account password is stored as a separate keychain entry: `com.mission-control.email-account.<account-id>`
- SQLite stores only a reference ID, not the password
- `lib/db.ts` exposes a helper that joins the DB record with the keychain secret at query time

### Database Resilience

- **WAL mode** enabled on creation for crash safety and concurrent access
- **Automatic backups** — on each app launch, copy `data.db` to `data.db.bak` (rotate last 3)
- **Corruption recovery** — if SQLite integrity check fails on launch, restore from most recent backup and notify user

### What stays in SQLite

All user data that currently lives in Supabase:
- Todos, missions, ideas, decisions, retrospectives
- Knowledge base entries, memory/notes
- Habits, sessions, preferences
- Pipeline events, agent state
- Chat history (OpenClaw conversations)
- Workflow notes, captures

### What does NOT go in SQLite

Data from external services is fetched live, not stored:
- BlueBubbles messages (fetched from BB server)
- Calendar events (fetched from CalDAV)
- Email (fetched from IMAP)
- Homelab status (fetched from Proxmox/OPNsense)
- Media library (fetched from Plex/Sonarr/Radarr)

## Multi-Device Sync (Phase 2)

### Overview

Optional feature for users who want the same data across multiple devices (e.g. laptop + desktop). Not required — most users will use a single machine.

### Architecture

```
User's Laptop                Homelab Sync Server              User's Desktop
  SQLite ──push changes──►  SQLite (source of truth)  ◄──push changes── SQLite
          ◄──pull changes──  (Cloudflare Tunnel)       ──pull changes──►
                              sync.yourdomain.com
```

### How it works

1. Each row in sync-enabled tables has a `updated_at` timestamp and a `device_id`
2. Each device tracks `last_synced_at` timestamp
3. **Push:** device sends rows where `updated_at > last_synced_at` to sync server
4. **Pull:** device asks server for rows where `updated_at > last_synced_at`
5. **Conflict resolution:** last-write-wins using server-assigned timestamps (avoids client clock skew)
6. Sync runs in background on an interval (e.g. every 30 seconds) and on app launch

### Sync Server

- Lightweight service running on the user's homelab (or any server they control)
- Exposed via Cloudflare Tunnel — no Tailscale/VPN needed for clients
- Simple REST API: `POST /sync/push`, `POST /sync/pull`
- Authenticated with a per-user token stored in the client's keychain
- Just another SQLite database that acts as the merge point

### Who needs this

- Power users with multiple machines (like the developer)
- Most family/friends: single device, local-only, never touch sync

### Keychain entries for sync (optional)

| Key | Example | Required |
|-----|---------|----------|
| `com.mission-control.sync.url` | `https://sync.yourdomain.com` | No |
| `com.mission-control.sync.token` | `(auth token)` | No |

## Setup Wizard

### First-Run Flow

```
App Launch → No secrets in keychain?
  │
  ├─► Welcome Screen
  │    "Welcome to Mission Control"
  │    [Set Up Manually]  [Import Config]
  │
  ├─► Manual Path: Step-by-step wizard
  │    Each integration is a card with:
  │    - Name + icon + 1-line description
  │    - Input fields for URL/credentials
  │    - [Test Connection] button
  │    - [Skip] button
  │    Order: Display Name → iMessage → Calendar → Homelab → Media → AI Chat
  │
  └─► Import Path:
       - Paste encrypted config string OR scan QR code
       - Enter passphrase (shared verbally by whoever exported)
       - Secrets decrypted and stored in keychain
       - Show summary of what was imported
```

### Config Export/Import

**Export (from Settings → Integrations → Export):**
- User selects which integrations to include (checkboxes)
- Enters a passphrase for encryption
- App generates AES-256-GCM encrypted base64 string
- Option to display as QR code or copy to clipboard
- Can be used to sync config across user's own devices (desktop, laptop)

**Import:**
- Paste string or scan QR
- Enter passphrase
- Decrypt and store in keychain
- Restart sidecar with new env vars

## Modular Feature System

### Config Endpoint

New API route: `GET /api/config`

Returns which integrations are configured based on which environment variables are present:

```json
{
  "modules": {
    "messages": true,
    "calendar": true,
    "homelab": false,
    "media": false,
    "email": false,
    "chat": false,
    "reminders": false,
    "agents": true
  },
  "user": {
    "displayName": "Josue"
  }
}
```

All modules are core features of the personal AI dashboard. Each is enabled/disabled based solely on whether the user has configured the required integration credentials.

### Frontend Behavior

- Sidebar navigation only renders tabs for enabled modules
- Dashboard adapts widgets based on enabled modules
- Settings page shows all integrations with enable/configure/disable options
- Unconfigured modules show a brief description + "Set Up" button

## Native Notifications

### Flow

1. SSE stream receives event (new message, calendar reminder, etc.)
2. Frontend calls Tauri command: `invoke('send_notification', { title, body, icon? })`
3. Rust fires native notification via `tauri-plugin-notification`
4. On click: Tauri brings window to foreground, frontend navigates to relevant view

### Notification Types

| Event | Title | Body | Action on Click |
|-------|-------|------|-----------------|
| New iMessage | Sender name | Message preview | Open messages, select conversation |
| Calendar event | "Upcoming: Meeting" | Event name + time | Open calendar |
| Pipeline complete | "Build Complete" | Pipeline status | Open pipeline view |

## Build & Distribution

### Repository Structure

**mission-control** (private, development):
```
mission-control/
├── app/                            ← existing Next.js pages & API routes
├── src-tauri/                      ← Tauri shell
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── icons/
│   ├── src/
│   │   ├── main.rs                 ← entry, sidecar lifecycle, tray
│   │   ├── secrets.rs              ← keychain commands
│   │   ├── notifications.rs        ← native notification commands
│   │   └── config.rs               ← config export/import, encryption
│   └── sidecar/                    ← gitignored, built by CI
├── scripts/
│   └── bundle-sidecar.sh           ← downloads Node.js + builds standalone
├── .github/
│   └── workflows/
│       ├── build.yml               ← builds on tag push
│       └── release.yml             ← publishes to releases repo
├── package.json
├── next.config.ts                  ← output: 'standalone'
└── .env.local                      ← dev only, gitignored
```

**mission-control-releases** (distribution):
```
mission-control-releases/
├── README.md                       ← download links per version + changelog
├── latest.json                     ← auto-updater endpoint
└── (GitHub Releases host .dmg, .msi, .AppImage binaries)
```

### Build Artifacts Per Platform

| Platform | Installer | Auto-update artifact |
|----------|-----------|---------------------|
| macOS Intel | `.dmg` | `.app.tar.gz` + signature |
| macOS Apple Silicon | `.dmg` | `.app.tar.gz` + signature |
| Windows x64 | `.msi` + `.exe` NSIS | `.msi.zip` + signature |
| Linux | `.AppImage` + `.deb` | `.AppImage.tar.gz` + signature |

### CI/CD Pipeline

1. Developer pushes git tag `v1.2.0` to mission-control
2. GitHub Actions workflow triggers:
   - Builds Next.js standalone output
   - Downloads platform-specific Node.js binary
   - Bundles sidecar (Node + standalone)
   - Compiles Tauri for all 4 targets (matrix build)
3. Uploads artifacts to mission-control-releases as a GitHub Release
4. Updates `latest.json` for auto-updater
5. Users' apps detect update → prompt to install → restart

### Auto-Updater

Tauri's built-in updater checks:
```
https://github.com/Josue7211/mission-control-releases/releases/latest/download/latest.json
```

`latest.json` format:
```json
{
  "version": "1.2.0",
  "notes": "Bug fixes and new calendar widget",
  "pub_date": "2026-03-11T00:00:00Z",
  "platforms": {
    "darwin-aarch64": { "url": "...Mission-Control_1.2.0_aarch64.app.tar.gz", "signature": "..." },
    "darwin-x86_64": { "url": "...Mission-Control_1.2.0_x64.app.tar.gz", "signature": "..." },
    "linux-x86_64": { "url": "...Mission-Control_1.2.0_amd64.AppImage.tar.gz", "signature": "..." },
    "windows-x86_64": { "url": "...Mission-Control_1.2.0_x64-setup.msi.zip", "signature": "..." }
  }
}
```

### Dev Workflow

```bash
# Development — hot reload, Tauri devtools
npm run tauri dev

# Production test build (current platform only)
npm run tauri build

# Full release (all platforms via CI)
git tag v1.2.0 && git push --tags
```

## Changes to Existing Code

### Modifications needed:

1. **`next.config.ts`** — add `output: 'standalone'`
2. **`package.json`** — add tauri scripts, add `sql.js` dependency (WASM SQLite), remove `@supabase/supabase-js`
3. **`lib/db.ts`** — new module: SQLite connection + query helpers replacing Supabase client
4. **`src-tauri/migrations/`** — SQLite schema (converted from current Supabase tables)
5. **API routes using Supabase** — migrate from `supabase.from().select()` to SQLite queries via `lib/db.ts`
6. **New: `app/api/config/route.ts`** — module detection endpoint
7. **New: `app/setup/page.tsx`** — setup wizard page
8. **New: Settings integration management UI** — enable/disable/configure integrations
9. **Frontend: notification bridge** — small utility to call `invoke('send_notification')` when events arrive via SSE
10. **Frontend: conditional navigation** — sidebar hides unconfigured modules

### Unchanged:

- All API routes that talk to external services (BlueBubbles, CalDAV, Proxmox, etc.)
- All existing page components (UI layer)
- Middleware (auth + rate limiting)
- All streaming endpoints (SSE, Socket.io)

## Standalone Build Details

The sidecar runs `node .next/standalone/server.js`, not `next start`. Key details:
- Next.js `output: 'standalone'` creates a self-contained `.next/standalone/` directory with `server.js`
- Static assets from `.next/static/` and `public/` must be copied into the standalone output
- Rust launches: `node server.js` with `PORT=3000` and `HOSTNAME=127.0.0.1` env vars
- The current `package.json` scripts bind to `0.0.0.0` — the Tauri sidecar overrides this to `127.0.0.1`

### Tauri Capabilities Required

`src-tauri/capabilities/default.json` must declare:
- `notification:default` — send native notifications
- `shell:default` — spawn Node.js sidecar
- `os:default` — detect platform
- `updater:default` — auto-update
- `store:default` — secure keychain access (via `tauri-plugin-store` or keychain plugin)

## Security Considerations

- Secrets in OS keychain, protected by user's system password/biometrics
- Node.js sidecar bound to `127.0.0.1` only — Rust sets `HOSTNAME=127.0.0.1` overriding the `0.0.0.0` default
- MC_API_KEY auto-generated per install — no shared secrets
- Email account passwords stored in keychain, not in SQLite
- Config export encrypted with AES-256-GCM + user-chosen passphrase
- Auto-update signatures verified by Tauri before applying
- No secrets in git, no secrets in app binary
- SQLite in WAL mode with automatic backups for data resilience
- Sync server (Phase 2) authenticated with per-user token over HTTPS via Cloudflare Tunnel
