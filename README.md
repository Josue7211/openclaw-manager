# Mission Control

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A unified personal dashboard that brings together your messages, calendar, email, todos, and more into a single interface.

![Screenshot placeholder](docs/screenshot.png)

## Features

- **Dashboard** -- at-a-glance overview of your day
- **Messages / iMessage** -- read and search conversations
- **Calendar** -- CalDAV-synced calendar view
- **Email** -- IMAP email client
- **AI Agents** -- built-in AI assistant workflows
- **Homelab Monitoring** -- keep tabs on your self-hosted services
- **Todos** -- task management
- **Pomodoro** -- focus timer with heatmap tracking
- **Media** -- media library and tracking
- **Knowledge Base** -- personal wiki and notes

Most integrations are optional. You only need a Supabase instance to get the core app running.

## Quick Start

### Prerequisites

- Node.js 20+
- A [Supabase](https://supabase.com) project
- (Optional) [Tauri v2 prerequisites](https://v2.tauri.app/start/prerequisites/) for the desktop app

### Setup

```bash
git clone https://github.com/your-username/mission-control.git
cd mission-control
npm install
cp .env.example .env.local
# Fill in your Supabase URL and anon key in .env.local
npm run dev
```

To run as a Tauri desktop app:

```bash
npm run tauri:dev
```

## Tech Stack

- [Next.js](https://nextjs.org) (React 19, App Router)
- [Supabase](https://supabase.com) (auth, database, storage)
- [Tauri v2](https://v2.tauri.app) (optional native desktop shell)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
