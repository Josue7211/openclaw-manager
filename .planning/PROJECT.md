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

### Active

- [ ] Setup wizard (onboarding, service connections, first-run experience)
- [ ] Bjorn module builder (AI-generated modules with dev preview panel + hot reload)
- [ ] Pre-built module primitives (charts, lists, forms) for Bjorn to compose from
- [ ] Free-form dashboard grid (drag/resize/swap widgets, snap to grid cells)
- [ ] Dashboard edit mode (enter/exit, rearrange widgets, add/remove)
- [ ] Theming system — curated presets (light/dark base, accent colors)
- [ ] Theming system — advanced CSS variable editor for full customization
- [ ] Theme import/export and community sharing
- [ ] Discord-style sidebar (modular categories, collapsible sections, activity indicators)
- [ ] Seamless page transitions (no reloads, content stays loaded in background)
- [ ] Notes overhaul — wiki-style [[linking]] with backlinks and graph view
- [ ] Notes overhaul — rich text WYSIWYG editing (toolbar, inline images, tables, code blocks)
- [ ] Notes overhaul — full-text search, tags, folders, starred notes
- [ ] Notes overhaul — collaboration (sharing, permissions, real-time co-editing)
- [ ] Responsive/adaptive layout (window resizing, multi-monitor, 1080p ↔ 1440p seamless)
- [ ] Visual consistency across all pages (unified design language)
- [ ] Loading states, error messages, empty states polish
- [ ] Finance / budgeting module
- [ ] Health / fitness module
- [ ] Bookmarks / read-later module
- [ ] Unread badges, notification counts per page
- [ ] Simplified setup for non-technical users (cloud setup path)

### Out of Scope

- Native mobile app — web-first desktop app, mobile deferred
- Self-hosted Matrix integration — future collaboration feature, not v1
- Real-time chat (non-iMessage) — defer to Matrix integration later
- Video posts / media hosting — storage/bandwidth concerns, defer

## Context

The app is in alpha. Core modules exist and work but need significant polish — visual inconsistency between pages, broken features (note linking doesn't work), poor responsive behavior (window resizing breaks layout, monitor switching isn't seamless), and missing feedback states throughout.

The existing codebase has 1039 frontend tests, 231 Rust tests, and 21 E2E tests. Security score is 96/100. The foundation is solid but the UX needs to catch up.

Bjorn is an existing AI agent running on the OpenClaw VM. The challenge is bridging Bjorn's code generation into the running Tauri app safely — sandboxed preview, approval flow, then hot reload into production. This is the differentiating feature.

A v0.1.0 setup wizard milestone is already planned (archived at `.planning-v0.1.0-wizard/`) and will be completed as part of this project.

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
| Bjorn modules sandboxed via dev preview panel | Prevents AI-generated code from crashing production app | — Pending |
| Free-form grid over slot-based dashboard | More flexibility, matches iOS widget paradigm | — Pending |
| Layered theming (presets + advanced editor) | Accessible for casual users, powerful for tinkerers | — Pending |
| Everything in parallel (polish + features + Bjorn) | All workstreams are load-bearing for v1.0 publish | — Pending |
| Download binary + setup wizard for distribution | Simplest path for users, Docker only for backend services | — Pending |

---
*Last updated: 2026-03-19 after project initialization*
