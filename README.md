<p align="center">
  <img src="frontend/public/logo-128.png" alt="OpenClaw Manager" width="96" />
</p>

<h1 align="center">OpenClaw Manager</h1>

<p align="center">
  A self-hosted personal command center — messages, AI chat, task management, homelab monitoring, and agent orchestration in one desktop app.
</p>

<p align="center">
  <a href="https://github.com/Josue7211/openclaw-manager/releases"><img src="https://img.shields.io/github/v/release/Josue7211/openclaw-manager?include_prereleases&label=Download&color=7c3aed" alt="Download" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="MIT License" /></a>
  <img src="https://img.shields.io/badge/Tauri-v2-24C8D8?logo=tauri&logoColor=white" alt="Tauri v2" />
  <img src="https://img.shields.io/badge/Platform-Linux%20%7C%20macOS%20%7C%20Windows-lightgrey" alt="Platform" />
</p>

<!-- TODO: Add screenshot once UI is finalized -->

---

## What is this?

OpenClaw Manager is a **modular desktop app** that brings all your personal infrastructure into one interface. Think Discord meets iOS Settings — but self-hosted, private, and fully under your control.

Every module is optional. Enable only what you have — but [OpenClaw](https://github.com/Josue7211/openclaw) is the heart of the app. Without it you still get a solid productivity hub (todos, calendar, email, notes, pomodoro), but you miss out on AI chat, autonomous agents, cron jobs, missions, and the full dashboard.

| Module | What it does | Requires |
|--------|-------------|----------|
| **Messages** | iMessage (read, send, search, reactions, attachments) | Mac + [BlueBubbles](https://bluebubbles.app) |
| **AI Chat** | Streaming AI chat with model switching | [OpenClaw](https://github.com/Josue7211/openclaw) or any LLM gateway |
| **Todos** | Task management with projects and labels | Supabase |
| **Calendar** | CalDAV sync (iCloud, Nextcloud, etc.) | CalDAV server |
| **Email** | IMAP client with folder navigation | IMAP server |
| **Reminders** | Apple Reminders sync | Mac + [Mac Bridge](https://github.com/Josue7211/mac-bridge) |
| **Notes** | Obsidian-compatible markdown notes | CouchDB + [LiveSync](https://github.com/vrtmrz/obsidian-livesync) |
| **Pomodoro** | Focus timer with activity heatmap | Local only |
| **Home Lab** | VM/container status, firewall monitoring | Proxmox + OPNsense |
| **Media Radar** | Track movies/TV shows | Plex + Sonarr + Radarr |
| **Dashboard** | Agent status, missions, pipelines | OpenClaw + Supabase |
| **Agents** | AI agent management and monitoring | OpenClaw |
| **Crons** | Scheduled jobs and recurring tasks | OpenClaw |
| **Missions** | Autonomous agent task tracking and replay | OpenClaw + Supabase |
| **Pipeline** | CI/CD pipeline management and ship log | Supabase |
| **Knowledge** | Shared reference documents | Supabase |
| **Personal** | Morning brief, daily review, habits | Supabase |

**App-wide features:** Command palette (`Ctrl+K`), global search, configurable keyboard shortcuts, native notifications with per-conversation mute, dark/light theming, custom sidebar layout, offline-first with sync.

---

## Architecture

<p align="center">
  <img src="docs/overview-simple.png" alt="Overview — what the app does" />
</p>

<p align="center">
  <img src="docs/architecture.png" alt="Technical architecture diagram" />
</p>

> Open the `.excalidraw` files in `docs/` with [excalidraw.com](https://excalidraw.com) for editable versions.

The app runs as a **Tauri v2 desktop application** with an embedded Axum HTTP server on `localhost:3000`. The React frontend never talks to remote services directly — everything is proxied through Axum. Secrets are stored in the OS keychain, never in environment files or source code.

**Key design decisions:**
- **Offline-first**: Local SQLite database syncs to Supabase every 30 seconds
- **Multi-device**: Run on Linux + macOS simultaneously, data syncs via Supabase
- **Zero telemetry**: No analytics, no phone-home, fully self-hosted
- **Defense in depth**: API key auth + Tailscale ACLs + Cloudflare Access + MFA + RLS on all tables

---

## Download

Grab the latest release for your platform:

| Platform | Download |
|----------|----------|
| **Linux** (.deb) | [Releases page](https://github.com/Josue7211/openclaw-manager/releases) |
| **Linux** (.rpm) | [Releases page](https://github.com/Josue7211/openclaw-manager/releases) |
| **macOS** (.dmg) — Intel + Apple Silicon | [Releases page](https://github.com/Josue7211/openclaw-manager/releases) |
| **Windows** (.msi) | [Releases page](https://github.com/Josue7211/openclaw-manager/releases) |

Or build from source (see below).

---

## Quick Start

### From release binary

1. Download and install for your platform
2. Launch the app
3. The onboarding wizard guides you through connecting services
4. No services configured? The app runs in **demo mode** with sample data

### From source

```bash
git clone https://github.com/Josue7211/openclaw-manager.git
cd mission-control

# Install frontend dependencies
cd frontend && npm install && cd ..

# Run in development mode (Tauri + Vite hot-reload)
cargo tauri dev

# Or production build
cargo tauri build
```

### Prerequisites

| Requirement | Notes |
|---|---|
| **Node.js 20+** | [nodejs.org](https://nodejs.org) |
| **Rust stable** | [rustup.rs](https://rustup.rs) |
| **Tauri v2 system deps** | [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) |
| **Supabase** | Self-hosted (Docker) or [Supabase Cloud](https://supabase.com) |

---

## Configuration

All service URLs and secrets are configured through **Settings > Connections** in the app. For development, you can also use a `.env.local` file:

```bash
cp .env.example .env.local   # Edit with your values
```

### Required (for full functionality)

| Variable | Description |
|---|---|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-side only) |

### Recommended (unlocks AI features)

| Variable | Description |
|---|---|
| `OPENCLAW_WS` | OpenClaw WebSocket URL (AI chat streaming) |
| `OPENCLAW_API_URL` | OpenClaw HTTP API URL |
| `OPENCLAW_API_KEY` | OpenClaw API key |
| `AGENTSHELL_URL` | AgentShell adapter URL (launch/approval bridge) |

OpenClaw powers AI Chat, Agents, Crons, Missions, and the full Dashboard. The app works without it as a productivity hub, but these are the features that make it special.

### Optional (per module)

| Variable | Module |
|---|---|
| `BLUEBUBBLES_HOST` / `BLUEBUBBLES_PASSWORD` | Messages |
| `MAC_BRIDGE_HOST` / `MAC_BRIDGE_API_KEY` | Reminders / Contacts |
| `COUCHDB_URL` / `COUCHDB_USER` / `COUCHDB_PASSWORD` / `COUCHDB_DATABASE` | Notes |
| `CALDAV_URL` / `CALDAV_USERNAME` / `CALDAV_PASSWORD` | Calendar |
| `EMAIL_HOST` / `EMAIL_PORT` / `EMAIL_USER` / `EMAIL_PASSWORD` | Email |
| `PROXMOX_HOST` / `PROXMOX_TOKEN_ID` / `PROXMOX_TOKEN_SECRET` | Home Lab |
| `OPNSENSE_HOST` / `OPNSENSE_KEY` / `OPNSENSE_SECRET` | Home Lab |
| `PLEX_URL` / `PLEX_TOKEN` | Media Radar |
| `SONARR_URL` / `SONARR_API_KEY` / `RADARR_URL` / `RADARR_API_KEY` | Media Radar |
| `MC_BIND_HOST` | Set to `0.0.0.0` to expose API over Tailscale |
| `MC_AGENT_KEY` | Stable API key for external agents (e.g. Bjorn) |

Sensitive credentials are stored in the **OS keychain** at runtime (macOS Keychain, Linux Secret Service, Windows Credential Manager). The `.env.local` file is a development fallback only and is gitignored.

---

## Security

OpenClaw Manager handles private data (messages, credentials, notes). Security is non-negotiable:

- **No telemetry, no analytics, no phone-home** — fully self-hosted and offline-capable
- **3-layer auth**: API key (constant-time) → Tailscale ACLs (WireGuard) → Cloudflare Access (OAuth)
- **MFA hard gate** on all data endpoints — no data access without TOTP verification
- **AES-256-GCM** encryption for user secrets, **Argon2id** key derivation
- **RLS + FORCE** on all 28 Supabase tables — row-level user isolation
- **CSP** blocks `unsafe-eval`, `object-src`, `frame-ancestors`
- **Core dumps disabled**, debugger detection, binary integrity checks at startup
- **Secrets zeroized** on drop — tokens cleared from memory when session ends
- **24-hour hard session expiry** regardless of token refresh
- **Append-only audit logs** for security-sensitive operations

See [docs/SECURITY.md](docs/SECURITY.md) for the full security model, threat analysis, and contributor rules.

---

## Testing

```bash
# Frontend (1039 tests)
cd frontend && npx vitest run

# Rust (231 tests)
cd src-tauri && cargo test

# Type check
cd frontend && npx tsc --noEmit

# Pre-commit (runs everything: secrets scan, a11y, types, tests, build)
./scripts/pre-commit.sh
```

---

## Project Structure

```
mission-control/
├── frontend/                # React + Vite + TypeScript
│   └── src/
│       ├── components/      # Sidebar, CommandPalette, Lightbox, etc.
│       ├── pages/           # Route pages (all lazy-loaded)
│       ├── hooks/           # Custom React hooks
│       └── lib/             # API client, types, keybindings, utilities
├── src-tauri/               # Tauri v2 + Rust backend
│   └── src/
│       ├── main.rs          # Entry, system tray, integrity checks
│       ├── server.rs        # Axum server, auth middleware, rate limiting
│       ├── routes/          # HTTP handlers per module
│       ├── crypto.rs        # AES-256-GCM + Argon2id
│       ├── secrets.rs       # OS keychain integration
│       ├── sync.rs          # Offline-first SQLite ↔ Supabase sync
│       └── audit.rs         # Append-only security audit log
├── supabase/                # Database migrations (28 tables, RLS)
├── docs/                    # Architecture diagrams, security docs
├── scripts/                 # Pre-commit, e2e tests, utilities
└── .github/workflows/       # CI (lint, test, build) + Release (all platforms)
```

---

## Contributing

1. Fork the repo
2. Create a branch (`git checkout -b feature/my-feature`)
3. Run `./scripts/pre-commit.sh` before committing
4. Open a PR

All PRs run through CI: type-check, 1039 frontend tests, 231 Rust tests, security audit, production build.

---

## License

[MIT](LICENSE) — Josue Aparcedo
