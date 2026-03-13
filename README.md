# Mission Control

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A unified personal dashboard built as a Tauri v2 desktop app with a Vite/React frontend and a Rust/Axum backend.

## Features

- **Dashboard** -- at-a-glance overview of your day
- **Messages** -- iMessage integration via BlueBubbles
- **Calendar** -- CalDAV-synced calendar view
- **Email** -- IMAP email client
- **Todos** -- task management with projects and labels
- **Pomodoro** -- focus timer with heatmap tracking
- **AI Agents** -- built-in AI assistant workflows
- **Homelab Monitoring** -- Proxmox, OPNsense, Plex, Sonarr, Radarr
- **Media** -- media library and tracking
- **OpenClaw** -- workspace integration

Most integrations are optional. You only need a Supabase instance to get the core app running.

## Prerequisites

- [Node.js](https://nodejs.org) 20+
- [Rust toolchain](https://rustup.rs) (install via rustup)
- [Tauri v2 prerequisites](https://v2.tauri.app/start/prerequisites/) (system dependencies vary by OS)
- A [Supabase](https://supabase.com) project (provides PostgreSQL + auth)

## Quick Start

```bash
git clone https://github.com/Josue7211/mission-control.git
cd mission-control/frontend
npm install
cp .env.example .env.local
```

Edit `.env.local` and fill in your Supabase URL and anon key.

**Frontend only** (development server):

```bash
npm run dev
```

**Full desktop app** (Tauri + embedded Axum server on port 3000):

```bash
cargo tauri dev
```

## Configuration

See [docs/CONFIGURATION.md](docs/CONFIGURATION.md) for environment variables, integration setup, and advanced options.

## Project Structure

```
mission-control/
├── frontend/          # Vite + React + TypeScript + React Router
├── src-tauri/         # Tauri v2 shell + Rust/Axum backend
├── supabase/          # Migrations, RLS policies, seed data
├── docs/              # Additional documentation
└── scripts/           # Build and utility scripts
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines and how to submit changes.

## License

[MIT](LICENSE)
