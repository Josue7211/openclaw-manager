<p align="center">
  <img src="frontend/public/logo-128.png" alt="Mission Control" width="96" />
</p>

<h1 align="center">Mission Control</h1>

<p align="center">
  A unified personal command center. One desktop app for your messages, calendar, email, todos, AI chat, homelab, and more.
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="MIT License" /></a>
  <a href="https://github.com/Josue7211/mission-control/actions"><img src="https://github.com/Josue7211/mission-control/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <img src="https://img.shields.io/badge/Tauri-v2-24C8D8?logo=tauri&logoColor=white" alt="Tauri v2" />
  <img src="https://img.shields.io/badge/Platform-macOS%20%7C%20Linux%20%7C%20Windows-lightgrey" alt="Platform" />
</p>

---

## What is this?

Mission Control is a **Tauri v2 desktop app** that brings all your personal tools into a single, keyboard-driven interface. Instead of juggling browser tabs, separate apps, and terminal windows, you get one unified dashboard backed by a local Rust/Axum server that talks to your own services over Tailscale (or any private network).

Every integration is optional. At minimum, you need a Supabase instance for auth and storage -- everything else plugs in as you set it up.

## Features

**Personal**
- **AI Chat** -- Conversational AI assistant via OpenClaw (streaming, Markdown rendering)
- **Messages** -- iMessage integration through BlueBubbles (read, send, search, attachments, reactions)
- **Todos** -- Task management with projects, labels, and drag-and-drop ordering
- **Calendar** -- CalDAV-synced calendar view (iCloud, Nextcloud, etc.)
- **Email** -- IMAP email client with folder navigation
- **Reminders** -- macOS Reminders sync via Mac Bridge
- **Pomodoro** -- Focus timer with heatmap tracking

**Homelab & Media**
- **Home Lab** -- Monitor Proxmox VMs/containers and OPNsense firewall status
- **Media Radar** -- Track movies and TV shows via Sonarr, Radarr, and Plex

**Agents & Automation**
- **Dashboard** -- At-a-glance overview of missions, agents, and pipeline status
- **Missions** -- Define high-level objectives and track progress
- **Agents** -- Manage AI agent workflows
- **Memory** -- Persistent knowledge store for agents
- **Pipeline** -- Kanban-style workflow board
- **Cron Jobs** -- Scheduled task management
- **Knowledge Base** -- Shared reference documents

**App-wide**
- **Command Palette** -- Fuzzy search across all pages and actions (`Ctrl+K`)
- **Global Search** -- Full-text search across todos, messages, missions, and more
- **Keyboard Shortcuts** -- Configurable keybindings for everything
- **Notifications** -- Native OS notifications via Tauri + ntfy push support
- **Theming** -- Dark mode with CSS variable-based theming
- **Onboarding** -- Guided setup wizard for first-time users

## Screenshots

> Screenshots will be added before the first release.

![Dashboard](docs/screenshots/dashboard.png)
![Messages](docs/screenshots/messages.png)
![Chat](docs/screenshots/chat.png)

## Architecture

```
+------------------+       +------------------------+       +-------------------+
|                  |       |    Mission Control      |       |                   |
|   Tauri Window   | <---> |    Axum Server          | <---> |   Supabase        |
|   (React/Vite)   |       |    (localhost:3000)     |       |   (Postgres+Auth) |
|                  |       |                         |       |                   |
+------------------+       +-----+------+------+----+       +-------------------+
                                 |      |      |
                    Tailscale / LAN / Internet
                                 |      |      |
                  +--------------+--+   |   +--+--------------+
                  |                 |   |   |                 |
                  | BlueBubbles    |   |   | Proxmox /       |
                  | (iMessage)     |   |   | OPNsense        |
                  +-----------+----+   |   +-----------+-----+
                              |        |               |
                     +--------+--+  +--+--------+  +---+-------+
                     | CalDAV    |  | Sonarr /  |  | OpenClaw  |
                     | (iCloud)  |  | Radarr /  |  | (AI)      |
                     +-----------+  | Plex      |  +-----------+
                                    +-----------+
```

The React frontend runs inside a Tauri webview. On launch, Tauri starts an embedded Axum HTTP server on `127.0.0.1:3000` that acts as a secure proxy -- the frontend never talks to external services directly. Secrets are stored in the OS keychain via the `keyring` crate.

## Prerequisites

| Requirement | Notes |
|---|---|
| **Node.js 20+** | [nodejs.org](https://nodejs.org) |
| **Rust stable toolchain** | Install via [rustup](https://rustup.rs) |
| **Tauri v2 system deps** | See [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) (varies by OS) |
| **Supabase** | Self-hosted or [Supabase Cloud](https://supabase.com) -- provides Postgres + Auth |

**Optional (for specific modules):**

| Service | Module | Notes |
|---|---|---|
| [BlueBubbles](https://bluebubbles.app) | Messages | Requires a Mac running BlueBubbles server |
| [OpenClaw](https://github.com/openclaw) | AI Chat | AI workspace with WebSocket + REST API |
| CalDAV server | Calendar | iCloud, Nextcloud, or any CalDAV provider |
| IMAP server | Email | Any standard IMAP email account |
| [Proxmox VE](https://www.proxmox.com) | Home Lab | Proxmox API access |
| [OPNsense](https://opnsense.org) | Home Lab | OPNsense API access |
| [Plex](https://www.plex.tv) / [Sonarr](https://sonarr.tv) / [Radarr](https://radarr.video) | Media Radar | Media server + indexer APIs |
| [Mac Bridge](https://github.com) | Reminders | macOS Reminders/Contacts bridge server |
| [ntfy](https://ntfy.sh) | Notifications | Push notification relay |
| [Tailscale](https://tailscale.com) | Networking | Recommended for secure access to homelab services |

## Quick Start

**1. Clone the repo**

```bash
git clone https://github.com/Josue7211/mission-control.git
cd mission-control
```

**2. Apply Supabase migrations**

If you have a Supabase project, apply the migration files in `supabase/migrations/` to your database:

```bash
psql "$DATABASE_URL" < supabase/migrations/20260308_habits.sql
psql "$DATABASE_URL" < supabase/migrations/20260308_mission_events.sql
psql "$DATABASE_URL" < supabase/migrations/20260309_pipeline_columns.sql
```

Or use the Supabase CLI:

```bash
supabase db push
```

**3. Configure environment variables**

```bash
cp .env.example .env.local
```

Open `.env.local` and fill in the required values:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

All other variables are optional -- add them as you enable modules.

**4. Install frontend dependencies**

```bash
cd frontend && npm install
```

**5. Launch the app**

```bash
# Full desktop app (Tauri + embedded Axum server)
cargo tauri dev

# Or frontend only (opens in browser at localhost:5173)
cd frontend && npm run dev
```

**6. First-run setup**

On first launch you will see the onboarding wizard. Head to **Settings > Connections** to configure and test your service connections.

## Configuration

All configuration is done through environment variables. See [`.env.example`](.env.example) for the full list with comments.

### Required

| Variable | Description |
|---|---|
| `VITE_SITE_URL` | Your app URL (default: `http://localhost:5173`) |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anonymous/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-side only) |
| `MC_API_KEY` | API authentication key (required in production) |

### Optional

| Variable | Module | Description |
|---|---|---|
| `BLUEBUBBLES_HOST` | Messages | BlueBubbles server URL |
| `BLUEBUBBLES_PASSWORD` | Messages | BlueBubbles server password |
| `OPENCLAW_WS` | Chat | OpenClaw WebSocket URL |
| `OPENCLAW_API_URL` | Chat | OpenClaw REST API URL |
| `OPENCLAW_API_KEY` | Chat | OpenClaw API key |
| `CALDAV_URL` | Calendar | CalDAV server URL |
| `CALDAV_USERNAME` | Calendar | CalDAV account username |
| `CALDAV_PASSWORD` | Calendar | CalDAV account password |
| `EMAIL_HOST` | Email | IMAP server hostname |
| `EMAIL_PORT` | Email | IMAP port (default: `993`) |
| `EMAIL_USER` | Email | IMAP username |
| `EMAIL_PASSWORD` | Email | IMAP password |
| `PROXMOX_HOST` | Home Lab | Proxmox VE API URL |
| `PROXMOX_TOKEN_ID` | Home Lab | Proxmox API token ID |
| `PROXMOX_TOKEN_SECRET` | Home Lab | Proxmox API token secret |
| `OPNSENSE_HOST` | Home Lab | OPNsense firewall URL |
| `OPNSENSE_KEY` | Home Lab | OPNsense API key |
| `OPNSENSE_SECRET` | Home Lab | OPNsense API secret |
| `PLEX_URL` | Media | Plex server URL |
| `PLEX_TOKEN` | Media | Plex auth token |
| `SONARR_URL` | Media | Sonarr API URL |
| `SONARR_API_KEY` | Media | Sonarr API key |
| `RADARR_URL` | Media | Radarr API URL |
| `RADARR_API_KEY` | Media | Radarr API key |
| `MAC_BRIDGE_HOST` | Reminders | Mac Bridge server URL |
| `MAC_BRIDGE_API_KEY` | Reminders | Mac Bridge API key |
| `NTFY_URL` | Notifications | ntfy server URL |
| `NTFY_TOPIC` | Notifications | ntfy topic name |

See [`docs/CONFIGURATION.md`](docs/CONFIGURATION.md) for detailed setup instructions per module.

## Modules

Each module is self-contained and only activates when its required environment variables are set.

| Module | What it does | Required services |
|---|---|---|
| **Chat** | AI-powered conversational assistant with streaming responses | OpenClaw |
| **Messages** | Read, send, and search iMessages with full attachment support | BlueBubbles (macOS) |
| **Todos** | Task management with projects, labels, and priorities | Supabase (core) |
| **Calendar** | CalDAV calendar sync and event display | Any CalDAV server |
| **Email** | IMAP email client with folder browsing | Any IMAP server |
| **Reminders** | macOS Reminders sync | Mac Bridge (macOS) |
| **Pomodoro** | Focus timer with daily/weekly heatmap | Supabase (core) |
| **Home Lab** | VM/container status, firewall monitoring | Proxmox, OPNsense |
| **Media Radar** | Track upcoming and existing media | Plex, Sonarr, Radarr |
| **Dashboard** | Agent/mission overview with stats | Supabase (core) |
| **Missions** | High-level objective tracking | Supabase (core) |
| **Agents** | AI agent management and deployment | Supabase (core) |
| **Pipeline** | Kanban workflow board | Supabase (core) |
| **Knowledge Base** | Shared reference documents | Supabase (core) |

## Project Structure

```
mission-control/
├── frontend/              # Vite + React 19 + TypeScript + React Router
│   ├── src/
│   │   ├── components/    # Shared UI (Sidebar, CommandPalette, Lightbox, etc.)
│   │   ├── pages/         # Route pages (all lazy-loaded)
│   │   ├── hooks/         # Custom React hooks
│   │   └── lib/           # API client, types, keybindings, utilities
│   └── public/            # Static assets
├── src-tauri/             # Tauri v2 shell + Rust backend
│   ├── src/
│   │   ├── main.rs        # App entry, secrets, Tauri plugin setup
│   │   ├── server.rs      # Axum server: routes, middleware, CORS
│   │   └── routes/        # HTTP handlers (messages, chat, auth, etc.)
│   ├── capabilities/      # Tauri permission definitions
│   └── icons/             # App icons for all platforms
├── supabase/              # Database migrations
├── docs/                  # Additional documentation
├── scripts/               # Build and utility scripts
└── Makefile               # Common dev commands
```

## Development

### Makefile targets

```bash
make dev              # Run full Tauri app (frontend + backend)
make dev-frontend     # Run only the Vite dev server (browser mode)
make test             # Run all tests (Rust + frontend)
make lint             # Run all linters (clippy + ESLint + TypeScript)
make fmt              # Format all code (Prettier + cargo fmt)
make check            # Full CI gate: lint + format check + tests
make build            # Build the production Tauri app
make setup            # Install all dependencies
make clean            # Remove build artifacts
```

### Running tests

```bash
# Frontend (Vitest)
cd frontend && npx vitest run

# Frontend type check
cd frontend && npx tsc --noEmit

# Rust
cd src-tauri && cargo test

# Rust lint
cd src-tauri && cargo clippy -- -D warnings
```

### Pre-commit checks

```bash
./scripts/pre-commit.sh
```

This runs linting, type checking, and tests to catch issues before they hit CI.

## Auto-Updates

The project includes scaffolding for Tauri's built-in auto-update system. It is currently disabled (commented out) to avoid requiring a rebuild. To enable it:

### 1. Generate signing keys

```bash
cargo tauri signer generate -w ~/.tauri/mission-control.key
```

This creates a keypair. The **public key** goes in `tauri.conf.json`; keep the **private key** safe for CI.

### 2. Enable the Cargo dependency

In `src-tauri/Cargo.toml`, uncomment:

```toml
tauri-plugin-updater = "2"
```

### 3. Activate the plugin in main.rs

In `src-tauri/src/main.rs`, uncomment the `.plugin(tauri_plugin_updater::Builder::new().build())` line (see the TODO block near the other plugin TODOs).

### 4. Configure tauri.conf.json

Rename the `_plugins_TODO` key to `plugins` and fill in your values:

```json
"plugins": {
  "updater": {
    "endpoints": [
      "https://github.com/Josue7211/mission-control/releases/latest/download/latest.json"
    ],
    "dialog": true,
    "pubkey": "<paste your public key here>"
  }
}
```

### 5. Enable the capability

In `src-tauri/capabilities/default.json`, move `"updater:default"` from `_permissions_TODO` into the `permissions` array, then delete the `_permissions_TODO` key.

### 6. Set up GitHub Actions for signed releases

Add a release workflow that:

1. Builds the app for each target platform with `cargo tauri build`
2. Signs the bundle using `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` repository secrets
3. Uploads the artifacts and `latest.json` manifest to a GitHub Release

See the Tauri updater docs for a complete workflow example: https://v2.tauri.app/plugin/updater/

### 7. Enable the Settings UI button

Once the updater plugin is active, update the disabled "Check for updates" button in `frontend/src/pages/Settings.tsx` to call the Tauri updater API:

```ts
import { check } from '@tauri-apps/plugin-updater'

const update = await check()
if (update?.available) {
  await update.downloadAndInstall()
}
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines, code conventions, and how to submit changes.

**TL;DR:**

1. Fork the repo and create a feature branch
2. Make your changes
3. Run `./scripts/pre-commit.sh` to verify everything passes
4. Open a pull request describing what changed and why

## License

[MIT](LICENSE) -- Josue Aparcedo
