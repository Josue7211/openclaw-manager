# Configuration

OpenClaw Manager uses environment variables for all configuration. Copy `.env.example` to `.env.local` and fill in the values you need.

## Required

| Variable | Description |
|----------|-------------|
| `VITE_SITE_URL` | Your app URL (e.g. `http://localhost:3000`) |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `MC_API_KEY` | API authentication key (required in production, optional in dev) |

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

## Optional -- Media (Plex, Sonarr, Radarr)

| Variable | Description |
|----------|-------------|
| `PLEX_URL` | Plex Media Server URL |
| `PLEX_TOKEN` | Plex authentication token |
| `SONARR_URL` | Sonarr API URL |
| `SONARR_API_KEY` | Sonarr API key |
| `RADARR_URL` | Radarr API URL |
| `RADARR_API_KEY` | Radarr API key |

## Optional -- OpenClaw AI Workspace

| Variable | Description |
|----------|-------------|
| `OPENCLAW_WS` | OpenClaw WebSocket URL |
| `OPENCLAW_PASSWORD` | OpenClaw authentication password |
| `OPENCLAW_API_URL` | OpenClaw API server URL (enables proxied workspace routes) |
| `OPENCLAW_API_KEY` | OpenClaw API key |

## Optional -- iOS Quick Capture

| Variable | Description |
|----------|-------------|
| `CAPTURE_API_KEY` | API key for iOS quick-capture shortcut |
