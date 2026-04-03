# External Integrations

**Analysis Date:** 2026-04-03

## Core Integration Surface

- The frontend does not call remote services directly.
- The embedded Rust server proxies all service calls and owns auth, validation, and redaction.
- Settings and onboarding both write to the same connection contract via `frontend/src/lib/service-registry.ts`.
- AgentShell is a separate adapter surface exposed through `AGENTSHELL_URL`.

## Service Matrix

- BlueBubbles
  - Used for Messages/iMessage integration
  - Keys: `bluebubbles.host`, `bluebubbles.password`
  - Backend path: `src-tauri/src/routes/messages.rs`
  - Test endpoint: `GET /api/v1/server/info?password=...`

- OpenClaw
  - Used for chat, agents, crons, missions, and other AI workspace flows
  - Keys: `openclaw.api-url`, `openclaw.api-key`, `openclaw.ws`, `openclaw.password`
  - Backend paths: `src-tauri/src/routes/chat.rs`, `memory.rs`, `openclaw_cli.rs`, `claude_sessions.rs`, `status.rs`
  - Test endpoint: `GET /v1/models`

- AgentShell
  - Used as a thin launch/approval adapter around OpenClaw-compatible hosts
  - Keys: `agentshell.url`
  - Backend paths: `src-tauri/src/routes/agent_shell.rs`, `agent_shell_support.rs`
  - Test endpoint: `GET /healthz`

- Supabase
  - Used for user data, sync, auth, and remote persistence
  - Keys: `supabase.url`, `supabase.anon-key`, `supabase.service-role-key`
  - Backend paths: `src-tauri/src/supabase.rs`, `sync.rs`, `gotrue.rs`, auth routes
  - Test endpoint: `GET /rest/v1/`

- Proxmox and OPNsense
  - Used for homelab monitoring
  - Keys: `proxmox.host`, `proxmox.token-id`, `proxmox.token-secret`, `opnsense.host`, `opnsense.key`, `opnsense.secret`
  - Backend path: `src-tauri/src/routes/homelab.rs`

- Plex, Sonarr, Radarr
  - Used for media radar
  - Keys: `plex.url`, `plex.token`, `sonarr.url`, `sonarr.api-key`, `radarr.url`, `radarr.api-key`
  - Backend path: `src-tauri/src/routes/media.rs`

- IMAP Email
  - Used for inbox monitoring
  - Keys: `email.host`, `email.port`, `email.user`, `email.password`
  - Backend path: `src-tauri/src/routes/email.rs`

- CalDAV
  - Used for calendar sync
  - Keys: `caldav.url`, `caldav.username`, `caldav.password`
  - Backend path: `src-tauri/src/routes/calendar.rs`

- ntfy
  - Used for push notifications and alert delivery
  - Keys: `ntfy.url`, `ntfy.topic`
  - Backend path: `src-tauri/src/routes/notify.rs`

- Anthropic
  - Used for direct Claude access when enabled
  - Keys: `anthropic.api-key`

- CouchDB / LiveSync notes
  - Used for notes/vault integration
  - Keys: `couchdb.url`, `couchdb.user`, `couchdb.password`, `couchdb.database`
  - Backend path: `src-tauri/src/routes/vault.rs`

- Mac Bridge
  - Used for Apple ecosystem glue where macOS is involved
  - Keys: `mac-bridge.host`, `mac-bridge.api-key`
  - Backend path: `src-tauri/src/routes/reminders.rs`

## Trust And Transport

- Secrets are stored in the OS keychain, then merged into runtime state after login.
- The frontend captures credentials through the wizard, but the backend owns the secret store and service calls.
- Tailscale is the common network path for local self-hosted services.
- The connection status UI verifies both service reachability and expected peer hostname when configured.
