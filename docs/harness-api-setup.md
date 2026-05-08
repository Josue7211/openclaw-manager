# Harness Workspace API

A zero-dependency Node.js micro-server that exposes your selected harness workspace files over HTTP. ClawControl connects to it to read, edit, and delete workspace and memory files from the Memory page.

## Why

ClawControl's Tauri backend can operate in two modes:

- **Local mode** — reads the configured harness workspace directly (works when ClawControl runs on the same machine as the harness)
- **Remote mode** — proxies requests to this API (when the harness runs on a different machine, e.g. a homelab server)

This script is the remote-mode server.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/files` | List core workspace files + memory logs |
| `GET` | `/file?path=...` | Read a file's content |
| `POST` | `/file` | Write/edit a file (`{ "path": "...", "content": "..." }`) |
| `DELETE` | `/file?path=...` | Delete a file (memory files only, core files protected) |
| `GET` | `/memory` | List recent memory entries with previews |

All endpoints return JSON. Auth is via `Authorization: Bearer <API_KEY>` header.

## Quick Start

```bash
# 1. Copy the script to your harness host
cp scripts/harness-api.mjs ~/harness-api.mjs

# 2. Run it
API_KEY=$(openssl rand -hex 32) PORT=3939 node ~/harness-api.mjs
```

That's it. No `npm install` needed — it uses only Node.js built-ins.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3939` | Listen port |
| `API_KEY` | *(empty — open)* | Bearer token for authentication. **Set this in production.** |
| `HARNESS_WORKSPACE` | `~/.harness/workspace` | Path to the harness workspace directory |
| `OPENCLAW_WORKSPACE` | *(unset)* | Compatibility alias for older OpenClaw deployments |

## systemd Service (recommended)

Create `~/.config/systemd/user/harness-api.service`:

```ini
[Unit]
Description=Harness Workspace API
After=network.target

[Service]
Type=simple
ExecStart=/usr/bin/node %h/harness-api.mjs
Environment=PORT=3939
Environment=API_KEY=your-secret-key-here
Environment=HARNESS_WORKSPACE=%h/.harness/workspace
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
```

Then enable and start:

```bash
systemctl --user daemon-reload
systemctl --user enable --now harness-api.service
systemctl --user status harness-api.service
```

## Connecting ClawControl

In ClawControl's Settings page, set:

- **harness.api-url** — `http://<your-host>:3939`
- **harness.api-key** — your `API_KEY` value

Or set these environment variables before launching ClawControl:

```bash
HARNESS_API_URL=http://<your-host>:3939
HARNESS_API_KEY=your-secret-key-here
```

## Security Notes

- The API only serves files within the configured workspace directory — path traversal is blocked
- Core workspace files (SOUL.md, IDENTITY.md, etc.) cannot be deleted via the API
- File size is capped at 5 MB per read/write
- **Always set `API_KEY`** when exposing on a network — without it, anyone can read/write your workspace
- Bind to `127.0.0.1` instead of `0.0.0.0` if you only need local access (edit the `server.listen` call)
