# Configuration

ClawControl currently has two configuration modes:

1. local/dev mode: `.env.local` plus in-app settings
2. release-path mode: batteries-included Docker setup with one compose file and one deployment env

New Docker installs should use the full stack so Supabase, Agent Secrets,
AgentShell, memd, LightRAG, RAGAnything/MinerU, and RAG ship with ClawControl
by default. Existing personal setups can keep pointing the app at separately
hosted services through env overrides or in-app connection settings.

The active release direction is a backend-first setup flow:

- one full Docker Compose stack
- one generated deployment `.env`
- one backend URL
- one pairing token

Tracking docs:

- [SETUP.md](SETUP.md)
- [backend-stack.md](backend-stack.md)
- [release-package-plan.md](release-package-plan.md)

## Required For Full Docker Stack

| Variable | Description |
|----------|-------------|
| `FRONTEND_PUBLIC_SITE_URL` | Public frontend URL (for example `http://localhost:8088`) |
| `BACKEND_PUBLIC_BASE_URL` | Public backend URL (for example `http://localhost:3010`) |
| `PAIRING_TOKEN` | Token pasted into the desktop app during pairing |
| `MC_AGENT_KEY` | Stable API key for agent/backend calls |
| `POSTGRES_PASSWORD` | Bundled Supabase database password |
| `JWT_SECRET` | Supabase JWT signing secret |
| `SUPABASE_URL` | Bundled gateway URL or external Supabase URL |
| `SUPABASE_ANON_KEY` | Supabase anonymous JWT |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `SECRET_BROKER_CLIENT_API_KEY` | Agent Secrets client key |
| `SECRET_BROKER_APPROVER_API_KEY` | Agent Secrets approver key |

## Built-in Docker Stack

Fresh Docker/Portainer installs ship these services:

| Service | Default |
|----------|---------|
| Supabase-compatible backend | Postgres, PostgREST, GoTrue, Realtime, Storage, Meta, gateway |
| Agent Secrets | `http://secret-broker:4815` |
| AgentShell | `http://agentshell:8077` |
| Harness API sidecar | `http://harness-api:3939` |
| memd server | `http://memd-server:8787` |
| memd RAG sidecar | `http://memd-rag-sidecar:9000` |
| LightRAG | `http://lightrag:9621` |
| RAGAnything/MinerU | `http://raganything-miner:8010` |
| Mac Bridge | shipped as optional `macos` profile |

External values still win. If a user already has Supabase, Agent Secrets,
memd, LightRAG, or Mac Bridge running elsewhere, set the corresponding env var
or in-app connection and ClawControl will use that instead.

## Release-Path Scaffold

The current release scaffold lives in:

- [../deploy/portainer/clawcontrol-full.stack.yml](../deploy/portainer/clawcontrol-full.stack.yml)
- [../deploy/portainer/clawcontrol-full.env.example](../deploy/portainer/clawcontrol-full.env.example)
- [SETUP.md](SETUP.md)
- [backend-stack.md](backend-stack.md)
- [release-package-plan.md](release-package-plan.md)

For now:

- the full compose stack is scaffolded
- `npm run stack:env` generates first-run secrets and Supabase JWTs
- `npm run stack:check` validates the env and compose wiring
- setup/status and pairing endpoints exist
- the desktop app can store a backend URL and pairing token
- Docker runtime verification is still a release work item

## Optional -- Homelab

| Variable | Description |
|----------|-------------|
| `PROXMOX_HOST` | Proxmox VE API URL (e.g. `https://<proxmox-host>:8006`) |
| `PROXMOX_TOKEN_ID` | Proxmox API token ID |
| `PROXMOX_TOKEN_SECRET` | Proxmox API token secret |
| `OPNSENSE_HOST` | OPNsense firewall URL (e.g. `https://<opnsense-host>`) |
| `OPNSENSE_KEY` | OPNsense API key |
| `OPNSENSE_SECRET` | OPNsense API secret |

## Optional -- Calendar (CalDAV)

| Variable | Description |
|----------|-------------|
| `CALDAV_URL` | CalDAV server URL (e.g. `https://caldav.icloud.com`) |
| `CALDAV_USERNAME` | CalDAV account username |
| `CALDAV_PASSWORD` | CalDAV account password |

## Optional -- Mac Bridge (macOS Reminders, Contacts)

| Variable | Description |
|----------|-------------|
| `MAC_BRIDGE_HOST` | Mac Bridge server URL |
| `MAC_BRIDGE_API_KEY` | Mac Bridge API key |

## Optional -- BlueBubbles iMessage

| Variable | Description |
|----------|-------------|
| `BLUEBUBBLES_HOST` | BlueBubbles server URL |
| `BLUEBUBBLES_PASSWORD` | BlueBubbles server password |

## Optional -- Email (IMAP)

| Variable | Description |
|----------|-------------|
| `EMAIL_HOST` | IMAP server hostname |
| `EMAIL_PORT` | IMAP server port (default: `993`) |
| `EMAIL_USER` | Email account username |
| `EMAIL_PASSWORD` | Email account password |
| `EMAIL_TLS` | Enable TLS (default: `true`) |

## Optional -- Media (Plex + ARR stack)

| Variable | Description |
|----------|-------------|
| `PLEX_URL` | Plex Media Server URL |
| `PLEX_TOKEN` | Plex authentication token |
| `SONARR_URL` | Sonarr API URL |
| `SONARR_API_KEY` | Sonarr API key |
| `RADARR_URL` | Radarr API URL |
| `RADARR_API_KEY` | Radarr API key |
| `LIDARR_URL` | Lidarr API URL |
| `LIDARR_API_KEY` | Lidarr API key |
| `PROWLARR_URL` | Prowlarr API URL |
| `PROWLARR_API_KEY` | Prowlarr API key |
| `OVERSEERR_URL` | Overseerr API URL |
| `OVERSEERR_API_KEY` | Overseerr API key |
| `TAUTULLI_URL` | Tautulli API URL |
| `TAUTULLI_API_KEY` | Tautulli API key |
| `BAZARR_URL` | Bazarr API URL |
| `BAZARR_API_KEY` | Bazarr API key |

## Optional -- Harness AI Workspace

| Variable | Description |
|----------|-------------|
| `HARNESS_WS` | Generic harness WebSocket URL |
| `HARNESS_PASSWORD` | Generic harness authentication password |
| `HARNESS_API_URL` | Generic harness API server URL (enables proxied workspace routes) |
| `HARNESS_API_KEY` | Generic harness API key |

`HERMES_*` and `OPENCLAW_*` are supported as provider-specific compatibility aliases. Prefer `HARNESS_*` for new configuration so the app stays provider-neutral.

## Built-in memd, LightRAG, and RAGAnything

ClawControl ships with local memd retrieval for Memory and Knowledge. The full
Docker stack also includes memd RAG sidecar, LightRAG, and a RAGAnything/MinerU
service for multimodal document extraction. External endpoints remain override
paths for users who already run any of these pieces.

| Variable | Description |
|----------|-------------|
| `LIGHTRAG_BASE_URL` | Bundled or external LightRAG server URL (for example `http://lightrag:9621`) |
| `LIGHTRAG_API_KEY` | Optional LightRAG bearer token |
| `MEMD_RAG_URL` | memd RAG sidecar URL. Used when ClawControl should talk to the sidecar instead of raw LightRAG |
| `RAGANYTHING_URL` | RAGAnything/MinerU service URL |
| `MINERU_URL` | MinerU parser service URL, currently same default as RAGAnything |

## Optional -- iOS Quick Capture

| Variable | Description |
|----------|-------------|
| `CAPTURE_API_KEY` | API key for iOS quick-capture shortcut |
