<p align="center">
  <img src="frontend/public/logo-128.png" alt="Mission Control" width="96" />
</p>

<h1 align="center">Mission Control</h1>

<p align="center">
  A self-hosted personal command center — messages, AI chat, todos, homelab monitoring, and more in one desktop app.
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="MIT License" /></a>
  <img src="https://img.shields.io/badge/Tauri-v2-24C8D8?logo=tauri&logoColor=white" alt="Tauri v2" />
  <img src="https://img.shields.io/badge/Platform-macOS%20%7C%20Linux%20%7C%20Windows-lightgrey" alt="Platform" />
</p>

<!-- ![Screenshot](docs/screenshot.png) -->

---

## Features

Every module is optional. Enable only what you use.

**Personal**
- **Messages** -- iMessage via [BlueBubbles](https://bluebubbles.app) (read, send, search, attachments, reactions)
- **AI Chat** -- Streaming conversational AI via OpenClaw
- **Todos** -- Projects, labels, drag-and-drop ordering
- **Calendar** -- CalDAV sync (iCloud, Nextcloud, etc.)
- **Email** -- IMAP client with folder navigation
- **Reminders** -- macOS Reminders sync
- **Pomodoro** -- Focus timer with heatmap tracking
- **Notes** -- Markdown note-taking

**Homelab & Media**
- **Home Lab** -- Proxmox VM/container status, OPNsense firewall monitoring
- **Media Radar** -- Track movies and TV shows via Sonarr, Radarr, Plex

**Agents & Automation**
- **Dashboard** -- At-a-glance overview of missions, agents, and pipelines
- **Missions** -- High-level objective tracking with event replay
- **Agents** -- AI agent management
- **Pipeline** -- Kanban workflow board
- **Knowledge Base** -- Shared reference documents

**App-wide**
- Command palette (`Ctrl+K`), global search, configurable keyboard shortcuts
- Native OS notifications with per-conversation mute and DND
- Dark/light theming, custom sidebar layout, resizable panels
- Offline-first with mutation queue and reconnect replay
- Guided onboarding wizard for first-time setup

## Architecture

```
+-----------------------+       +------------------------+       +-------------------+
|                       |       |   Mission Control      |       |                   |
|   Tauri Window        | <---> |   Axum Server          | <---> |   Supabase        |
|   (React + Vite)      |       |   (localhost:3000)     |       |   (Postgres+Auth) |
|                       |       |                        |       |                   |
+-----------------------+       +-----+------+------+----+       +-------------------+
                                      |      |      |
                         Tailscale / LAN / private network
                                      |      |      |
                       +--------------+  +---+---+  +---------------+
                       |              |  |       |  |               |
                       | BlueBubbles  |  | Open- |  | Proxmox /     |
                       | (iMessage)   |  | Claw  |  | OPNsense /    |
                       +--------------+  | (AI)  |  | Plex / etc.   |
                                         +-------+  +---------------+
```

The React frontend runs inside a Tauri webview. On launch, Tauri starts an embedded Axum HTTP server on `127.0.0.1:3000` that proxies all external service calls. The frontend never talks to remote services directly. Secrets are stored in the OS keychain -- never in environment files or source code.

## Prerequisites

| Requirement | Notes |
|---|---|
| **Node.js 20+** | [nodejs.org](https://nodejs.org) |
| **Rust stable** | [rustup.rs](https://rustup.rs) |
| **Tauri v2 system deps** | [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) (varies by OS) |
| **Supabase** | Self-hosted or [Supabase Cloud](https://supabase.com) for auth + storage |

## Quick Start

```bash
git clone https://github.com/Josue7211/mission-control.git
cd mission-control
cd frontend && npm install && cd ..

# Full desktop app (Tauri + Axum backend)
cargo tauri dev

# Or frontend only (browser at localhost:5173)
cd frontend && npm run dev
```

On first launch the onboarding wizard walks you through connecting services.

## Demo Mode

No backend services? No problem. Run the frontend in demo mode:

```bash
cd frontend && npm run dev
```

Without configured services, the app loads with synthetic demo data so you can explore every page and feature. No Supabase, BlueBubbles, or other backends required.

## Configuration

All service URLs and secrets are configured through **Settings > Connections** in the app, or via a `.env.local` file in the project root.

```bash
cp .env.example .env.local
```

### Required

| Variable | Description |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-side) |

### Optional (per module)

| Variable | Module |
|---|---|
| `BLUEBUBBLES_HOST` / `BLUEBUBBLES_PASSWORD` | Messages |
| `OPENCLAW_WS` / `OPENCLAW_API_URL` / `OPENCLAW_API_KEY` | AI Chat |
| `CALDAV_URL` / `CALDAV_USERNAME` / `CALDAV_PASSWORD` | Calendar |
| `EMAIL_HOST` / `EMAIL_PORT` / `EMAIL_USER` / `EMAIL_PASSWORD` | Email |
| `PROXMOX_HOST` / `PROXMOX_TOKEN_ID` / `PROXMOX_TOKEN_SECRET` | Home Lab |
| `OPNSENSE_HOST` / `OPNSENSE_KEY` / `OPNSENSE_SECRET` | Home Lab |
| `PLEX_URL` / `PLEX_TOKEN` | Media Radar |
| `SONARR_URL` / `SONARR_API_KEY` / `RADARR_URL` / `RADARR_API_KEY` | Media Radar |

Sensitive credentials (API keys, passwords) are stored in the **OS keychain** at runtime. The `.env.local` file is gitignored and never committed.

## Security

- **No telemetry, no analytics, no phone-home** -- fully self-hosted and offline-capable
- Secrets stored in OS keychain via `keyring` crate, never in env files or source
- Local API protected by auto-generated `MC_API_KEY` (keychain-stored)
- All remote services accessed over Tailscale (WireGuard-encrypted, ACL-enforced)
- CSP blocks `unsafe-eval`; OAuth uses nonce verification

## Testing

```bash
# Frontend unit tests
cd frontend && npx vitest run

# Frontend type check
cd frontend && npx tsc --noEmit

# Rust tests
cd src-tauri && cargo test

# Rust linting
cd src-tauri && cargo clippy -- -D warnings

# Pre-commit (runs everything)
./scripts/pre-commit.sh
```

## Project Structure

```
mission-control/
├── frontend/              # React + Vite + TypeScript
│   └── src/
│       ├── components/    # Sidebar, CommandPalette, Lightbox, etc.
│       ├── pages/         # Route pages (all lazy-loaded)
│       ├── hooks/         # Custom React hooks
│       └── lib/           # API client, types, keybindings, utilities
├── src-tauri/             # Tauri v2 + Rust backend
│   └── src/
│       ├── main.rs        # Entry point, secrets, system tray
│       ├── server.rs      # Axum server, middleware, CORS
│       ├── routes/        # HTTP handlers per module
│       └── secrets.rs     # OS keychain integration
├── supabase/              # Database migrations
├── scripts/               # Build and utility scripts
└── Makefile               # Common dev commands
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines. In short: fork, branch, run `./scripts/pre-commit.sh`, open a PR.

## License

[MIT](LICENSE) -- Josue Aparecedo
