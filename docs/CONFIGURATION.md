# Configuration

ClawControl currently has two configuration modes:

1. local/dev mode: `.env.local` plus in-app settings
2. release-path mode: backend-first setup with one compose file and one deployment env

The backend-first release path is in progress. It is not fully shipped yet.

The active release direction is a backend-first setup flow:

- one backend Docker Compose stack
- one deployment `.env`
- one backend URL
- one pairing token

Tracking docs:

- [backend-stack.md](backend-stack.md)
- [release-package-plan.md](release-package-plan.md)

## Required

| Variable | Description |
|----------|-------------|
| `VITE_SITE_URL` | Your app URL (e.g. `http://localhost:3000`) |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `MC_API_KEY` | API authentication key (required in production, optional in dev) |

## Release-Path Scaffold

The current release scaffold lives in:

- [../docker-compose.backend.yml](../docker-compose.backend.yml)
- [../.env.backend.example](../.env.backend.example)
- [backend-stack.md](backend-stack.md)
- [release-package-plan.md](release-package-plan.md)

For now:

- the compose stack is scaffolded
- setup/status and pairing endpoints exist
- the desktop app can store a backend URL and pairing token
- package verification is still a work item

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

## Optional -- LightRAG / memd RAG

| Variable | Description |
|----------|-------------|
| `LIGHTRAG_BASE_URL` | LightRAG server URL (for example `http://your-lightrag-host:9621`) |
| `LIGHTRAG_API_KEY` | Optional LightRAG bearer token |
| `MEMD_RAG_URL` | memd RAG sidecar URL. Used when ClawControl should talk to the sidecar instead of raw LightRAG |

## Optional -- iOS Quick Capture

| Variable | Description |
|----------|-------------|
| `CAPTURE_API_KEY` | API key for iOS quick-capture shortcut |
