# OpenClaw Manager

## What This Is

An all-in-one life productivity desktop app (Tauri v2 + Axum + React) that connects AI (OpenClaw) to automate and simplify everything — iMessage, tasks, notes, calendar, homelab, finance, health, and more. Highly modular and customizable: users enable only what they have, and an AI agent (Bjorn) can create entirely new modules on demand. Open source, designed for homelab enthusiasts and power users, but accessible enough for less tech-savvy people to set up.

## Core Value

The AI agent (Bjorn) can build, preview, and hot-reload custom modules inside the running app — making it infinitely extensible without the user writing code.

## Requirements

### Validated

- ✓ Multi-platform desktop app (Linux, macOS, Windows) — v0.0.1
- ✓ Embedded Axum HTTP server proxying all external calls — v0.0.1
- ✓ iMessage via BlueBubbles (read, send, search, reactions) — v0.0.1
- ✓ AI Chat via OpenClaw (WebSocket + HTTP, model switching) — v0.0.1
- ✓ Task management with Supabase sync — v0.0.1
- ✓ CalDAV calendar integration — v0.0.1
- ✓ Homelab monitoring (Proxmox + OPNsense) — v0.0.1
- ✓ Media tracking (Plex + Sonarr + Radarr) — v0.0.1
- ✓ Obsidian-compatible notes via CouchDB LiveSync — v0.0.1
- ✓ Apple Reminders via Mac Bridge — v0.0.1
- ✓ OAuth PKCE + MFA authentication — v0.0.1
- ✓ AES-256-GCM encrypted user secrets — v0.0.1
- ✓ Offline-first SQLite ↔ Supabase sync — v0.0.1
- ✓ Tailscale agent access — v0.0.1
- ✓ CI release builds (Linux + macOS + Windows) — v0.0.1
- ✓ Security sweep (score 96/100) — v0.0.1
- ✓ Responsive layout shell with auto-collapsing sidebar and CSS container queries — v1.0
- ✓ Visual polish — unified button hierarchy, shared LoadingState/ErrorState/EmptyState, consistent spacing — v1.0
- ✓ Theming system — 15+ presets, GTK/Wallbash system mode, font customization, share codes, scheduling — v1.0
- ✓ Setup wizard — 9-step onboarding, demo mode, guided tour, credential validation — v1.0
- ✓ Dashboard grid — drag-and-drop widgets, Widget Registry, multi-page layouts, undo/redo — v1.0
- ✓ Page experience — scroll restoration, page state cache, unread badges, collapsible categories — v1.0
- ✓ 11 composable UI primitives (StatCard, charts, tables, forms, kanban, timer, gallery) — v1.0
- ✓ Bjorn AI module builder — natural language → sandboxed preview → approve → dashboard with hot-reload — v1.0
- ✓ Data export — Supabase JSON, SQLite backup, notes markdown from Settings — v1.0

### Active

- [ ] Notes overhaul — wiki-style [[linking]] with backlinks and graph view
- [ ] Notes overhaul — rich text WYSIWYG editing (toolbar, inline images, tables, code blocks)
- [ ] Notes overhaul — full-text search, tags, folders, starred notes
- [ ] Notes overhaul — collaboration (sharing, permissions, real-time co-editing)
- [ ] Finance / budgeting module
- [ ] Health / fitness module
- [ ] Bookmarks / read-later module
- [ ] Simplified setup for non-technical users (cloud setup path)

### Out of Scope

- Native mobile app — web-first desktop app, mobile deferred
- Self-hosted Matrix integration — future collaboration feature, not v1
- Real-time chat (non-iMessage) — defer to Matrix integration later
- Video posts / media hosting — storage/bandwidth concerns, defer

## Context

**v1.0 shipped 2026-03-21.** The app is a publishable desktop application with 11 completed phases, 92 requirements satisfied, and full cross-phase integration verified. The codebase is 74,399 LOC TypeScript/React + 25,362 LOC Rust with 2,177 frontend tests and 245 Rust tests passing.

The differentiating feature — Bjorn AI module builder — is fully operational: users describe modules in natural language, see them previewed in a sandboxed iframe, approve to dashboard with hot-reload, and manage versions with rollback from Settings. 11 composable primitives provide the building blocks.

Next milestone focus areas: notes overhaul (wiki linking, WYSIWYG, search), new domain modules (finance, health, bookmarks), and cloud setup path for non-technical users.

## Constraints

- **Tech stack**: Tauri v2 + Axum + React — locked in, massive existing codebase
- **Security**: Zero private data in repo, all secrets via OS keychain, no telemetry
- **Infrastructure**: All services over Tailscale mesh VPN, self-hosted Supabase
- **Distribution**: Binary download + setup wizard — no Docker required for the app itself
- **Accessibility**: WCAG compliance non-negotiable (buttons not divs, aria labels, focus traps)
- **Open source**: Everything must work without personal data, demo mode for showcase

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Bjorn modules sandboxed via iframe + CSP + static analysis | Prevents AI-generated code from accessing DOM, network, storage | ✓ Validated v1.0 |
| Free-form grid over slot-based dashboard | More flexibility, matches iOS widget paradigm | ✓ Validated v1.0 |
| Layered theming (presets + advanced editor) | Accessible for casual users, powerful for tinkerers | ✓ Validated v1.0 |
| Everything in parallel (polish + features + Bjorn) | All workstreams are load-bearing for v1.0 publish | ✓ Validated v1.0 |
| Download binary + setup wizard for distribution | Simplest path for users, Docker only for backend services | ✓ Validated v1.0 |
| Widget Registry as integration hub | Single pattern for built-in, primitive, and Bjorn widgets | ✓ Validated v1.0 |
| Soft-delete for all user data | Recycle bin pattern, never hard delete | ✓ Validated v1.0 |

---
*Last updated: 2026-03-21 after v1.0 milestone completion*
