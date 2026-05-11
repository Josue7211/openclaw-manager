<p align="center">
  <img src="frontend/public/logo-128.png" alt="ClawControl" width="96" />
</p>

<h1 align="center">ClawControl</h1>

<p align="center">
  A self-hosted personal command center — messages, AI chat, task management, homelab monitoring, and agent orchestration in one desktop app.
</p>

<p align="center">
  <a href="https://github.com/Josue7211/clawcontrol"><img src="https://img.shields.io/badge/GitHub-Josue7211%2Fclawcontrol-181717?logo=github" alt="GitHub repository" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-AGPLv3-blue.svg" alt="AGPLv3 License" /></a>
  <img src="https://img.shields.io/badge/Tauri-v2-24C8D8?logo=tauri&logoColor=white" alt="Tauri v2" />
  <img src="https://img.shields.io/badge/Platform-Linux%20%7C%20macOS%20%7C%20Windows-lightgrey" alt="Platform" />
</p>

<!-- TODO: Add screenshot once UI is finalized -->

---

## What is this?

ClawControl is a **modular desktop control plane** for OpenClaw and your other personal infrastructure. Think Discord meets iOS Settings — but self-hosted, private, and fully under your control.

OpenClaw is the centerpiece. It already has a built-in gateway, and ClawControl is the wrapper/consumer that controls that gateway safely day to day while layering additional safe features on top when the gateway does not already cover them. AgentShell is another optional safety wrapper. Every module is optional, but the OpenClaw-powered experience is what turns the app into ClawControl instead of a generic productivity shell.

| Module | What it does | Requires |
|--------|-------------|----------|
| **Messages** | iMessage (read, send, search, reactions, attachments) | Mac + [BlueBubbles](https://bluebubbles.app) |
| **AI Chat** | Streaming AI chat with model switching | [OpenClaw](https://github.com/Josue7211/openclaw) or any LLM gateway |
| **Todos** | Task management with projects and labels | Built-in Supabase stack or external Supabase |
| **Calendar** | CalDAV sync (iCloud, Nextcloud, etc.) | CalDAV server |
| **Email** | IMAP client with folder navigation | IMAP server |
| **Reminders** | Apple Reminders sync | Mac + [Mac Bridge](https://github.com/Josue7211/mac-bridge) |
| **Notes** | Obsidian-compatible markdown notes | CouchDB + [LiveSync](https://github.com/vrtmrz/obsidian-livesync) |
| **Pomodoro** | Focus timer with activity heatmap | Local only |
| **Home Lab** | VM/container status, firewall monitoring | Proxmox + OPNsense |
| **Media Radar** | Track movies/TV shows | Plex + Sonarr + Radarr |
| **Dashboard** | Agent status, missions, pipelines | OpenClaw + built-in Supabase stack |
| **Agents** | AI agent management and monitoring | OpenClaw |
| **Crons** | Scheduled jobs and recurring tasks | OpenClaw |
| **Missions** | Autonomous agent task tracking and replay | OpenClaw + built-in Supabase stack |
| **Pipeline** | CI/CD pipeline management and ship log | Built-in Supabase stack or external Supabase |
| **Knowledge** | Shared reference documents and RAG search | Built-in memd, LightRAG, RAGAnything/MinerU, optional external Supabase |
| **Personal** | Morning brief, daily review, habits | Built-in Supabase stack or external Supabase |

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
- **Defense in depth**: API key auth + Tailscale ACLs + MFA + RLS on all tables

---

## Release Status

`v0.0.8` is the current release-prep milestone.

The repo is moving toward a backend-first package flow:

1. one Docker Compose backend stack
2. one deployment `.env`
3. one backend URL
4. one pairing token

That flow is partially implemented, but it is not fully verified as a release yet.

Tracking docs:

- [docs/SETUP.md](docs/SETUP.md)
- [docs/release-package-plan.md](docs/release-package-plan.md)
- [docs/backend-stack.md](docs/backend-stack.md)
- [docs/CONFIGURATION.md](docs/CONFIGURATION.md)

---

## Quick Start

### Self-hosted release path

New Docker installs use the batteries-included backend-first setup flow:

1. generate one full-stack `.env`
2. validate the stack config
3. run one Docker Compose stack
4. open the desktop app
5. paste backend URL
6. paste pairing token

```bash
npm run stack:env -- --out .env.full
npm run stack:check -- --env .env.full --no-docker
docker compose --env-file .env.full -f deploy/portainer/clawcontrol-full.stack.yml up -d --build
```

Tracking docs:

- [docs/SETUP.md](docs/SETUP.md)
- [docs/release-package-plan.md](docs/release-package-plan.md)
- [docs/backend-stack.md](docs/backend-stack.md)

Current scaffold files:

- [deploy/portainer/clawcontrol-full.stack.yml](deploy/portainer/clawcontrol-full.stack.yml)
- [deploy/portainer/clawcontrol-full.env.example](deploy/portainer/clawcontrol-full.env.example)
- [deploy/portainer/clawcontrol-backend.stack.yml](deploy/portainer/clawcontrol-backend.stack.yml)
- [deploy/portainer/clawcontrol-backend.env.example](deploy/portainer/clawcontrol-backend.env.example)

### From source

```bash
git clone https://github.com/Josue7211/clawcontrol.git
cd clawcontrol

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
| **Supabase** | Bundled in the full Docker stack, or external [Supabase Cloud](https://supabase.com) |

### Built-in stack services

Fresh Docker/Portainer installs ship these services by default:

| Service | Role |
|---|---|
| **Supabase-compatible stack** | Postgres, PostgREST, GoTrue, Realtime, Storage, Meta, and gateway |
| **Agent Secrets** | Secret broker and approval keys |
| **AgentShell** | Launch/approval adapter |
| **Harness API sidecar** | Workspace HTTP/WebSocket bridge |
| **memd server** | Durable memory/bootstrap service |
| **memd RAG sidecar** | Built-in retrieval for Memory and Knowledge |
| **LightRAG** | Long-term semantic graph retrieval |
| **RAGAnything/MinerU** | Multimodal extraction for PDFs, images, tables, equations, and Office docs |
| **Mac Bridge** | Ships as an optional `macos` profile for hosts that can access Apple services |

---

## Configuration

There are currently two configuration paths:

1. current dev/local path: desktop app settings + `.env.local`
2. release path: backend-first setup with `deploy/portainer/clawcontrol-full.stack.yml`

For local development, you can still use a `.env.local` file:

```bash
cp .env.example .env.local   # Edit with your values
```

For release-path planning, use:

- [docs/SETUP.md](docs/SETUP.md)
- [deploy/portainer/clawcontrol-full.stack.yml](deploy/portainer/clawcontrol-full.stack.yml)
- [deploy/portainer/clawcontrol-full.env.example](deploy/portainer/clawcontrol-full.env.example)
- [docs/backend-stack.md](docs/backend-stack.md)

### Required (for full functionality)

| Variable | Description |
|---|---|
| `SUPABASE_URL` | Bundled Supabase gateway URL or your external Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-side only) |

### Recommended (unlocks AI features)

| Variable | Description |
|---|---|
| `HARNESS_WS` | Generic harness WebSocket URL (AI chat streaming) |
| `HARNESS_API_URL` | Generic harness HTTP API URL |
| `HARNESS_API_KEY` | Generic harness API key |
| `AGENTSHELL_URL` | AgentShell adapter URL (launch/approval bridge) |
| `AGENTSECRETS_URL` | Agent Secrets broker URL |
| `MEMD_BASE_URL` / `MEMD_RAG_URL` | memd server and bundled RAG sidecar URLs |
| `LIGHTRAG_BASE_URL` | Bundled or external LightRAG URL |
| `RAGANYTHING_URL` / `MINERU_URL` | Bundled or external multimodal extraction URLs |

The harness gateway powers AI Chat, Agents, Crons, Missions, and control-plane workflows. Users can point it at Hermes, OpenClaw compatibility, Agent Zero, NanoClaw, or another compatible harness. `OPENCLAW_*` remains a legacy compatibility alias only.

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
| `MC_AGENT_KEY` | Stable API key for external agents |

Sensitive credentials are stored in the **OS keychain** at runtime (macOS Keychain, Linux Secret Service, Windows Credential Manager). The `.env.local` file is a development fallback only and is gitignored.

For the backend-first release work, see:

- [docs/backend-stack.md](docs/backend-stack.md)
- [docs/release-package-plan.md](docs/release-package-plan.md)

---

## Security

ClawControl handles private data (messages, credentials, notes). Security is non-negotiable:

- **No telemetry, no analytics, no phone-home** — fully self-hosted and offline-capable
- **3-layer auth**: API key (constant-time) → Tailscale ACLs (WireGuard) → MFA-gated backend access
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
# Frontend
cd frontend && npx vitest run

# Rust
cd src-tauri && cargo test

# Type check
cd frontend && npx tsc --noEmit

# Pre-commit (runs everything: secrets scan, a11y, types, tests, build)
./scripts/pre-commit.sh
```

---

## Project Structure

```
clawcontrol/
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
2. Branch from the current default branch (`main` preferred, `master` during transition)
3. Create a focused topic branch such as `fix/widget-edit-mode` or `feat/messages-search`
4. Run `./scripts/pre-commit.sh` before committing
5. Open a PR against the protected default branch

All PRs run through CI: type-check, 1039 frontend tests, 231 Rust tests, security audit, production build.

Recommended maintainer setup:

- Protect `main`
- Require PR review and green CI before merge
- Keep release work on tags, not long-lived release branches
- Use one branch per fix/feature so bugfixes like dashboard widget/edit-mode work can ship independently

---

## License

[AGPLv3](LICENSE) — Josue Aparcedo
