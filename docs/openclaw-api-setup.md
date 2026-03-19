# OpenClaw Workspace API

A zero-dependency Node.js micro-server that exposes your [OpenClaw](https://openclaw.ai) workspace files over HTTP. OpenClaw Manager connects to it to read, edit, and delete workspace and memory files from the Memory page.

## Why

OpenClaw Manager's Tauri backend can operate in two modes:

- **Local mode** — reads `~/.openclaw/workspace` directly (works when OpenClaw Manager runs on the same machine as OpenClaw)
- **Remote mode** — proxies requests to this API (when OpenClaw runs on a different machine, e.g. a homelab server)

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
# 1. Copy the script to your OpenClaw host
cp scripts/openclaw-api.mjs ~/openclaw-api.mjs

# 2. Run it
API_KEY=$(openssl rand -hex 32) PORT=3939 node ~/openclaw-api.mjs
```

That's it. No `npm install` needed — it uses only Node.js built-ins.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3939` | Listen port |
| `API_KEY` | *(empty — open)* | Bearer token for authentication. **Set this in production.** |
| `OPENCLAW_WORKSPACE` | `~/.openclaw/workspace` | Path to the OpenClaw workspace directory |

## systemd Service (recommended)

Create `~/.config/systemd/user/openclaw-api.service`:

```ini
[Unit]
Description=OpenClaw Workspace API
After=network.target

[Service]
Type=simple
ExecStart=/usr/bin/node %h/openclaw-api.mjs
Environment=PORT=3939
Environment=API_KEY=your-secret-key-here
Environment=OPENCLAW_WORKSPACE=%h/.openclaw/workspace
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
```

Then enable and start:

```bash
systemctl --user daemon-reload
systemctl --user enable --now openclaw-api.service
systemctl --user status openclaw-api.service
```

## Connecting OpenClaw Manager

In OpenClaw Manager's Settings page, set:

- **openclaw.ws** — `http://<your-host>:3939`
- **openclaw.password** — your `API_KEY` value

Or set these environment variables before launching OpenClaw Manager:

```bash
OPENCLAW_API_URL=http://<your-host>:3939
OPENCLAW_API_KEY=your-secret-key-here
```

## Security Notes

- The API only serves files within the configured workspace directory — path traversal is blocked
- Core workspace files (SOUL.md, IDENTITY.md, etc.) cannot be deleted via the API
- File size is capped at 5 MB per read/write
- **Always set `API_KEY`** when exposing on a network — without it, anyone can read/write your workspace
- Bind to `127.0.0.1` instead of `0.0.0.0` if you only need local access (edit the `server.listen` call)
