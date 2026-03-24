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

- ✓ Strip dead/unused code, components, routes, and imports — v0.0.4
- ✓ Remove deferred feature stubs (TipTap, Project Tracker) — v0.0.4 (verified never scaffolded)
- ✓ Harden test coverage for v0.0.3 features — v0.0.4 (68 new hook tests + 117 smoke tests)
- ✓ TypeScript strict flags (noUnusedLocals/noUnusedParameters) — v0.0.4
- ✓ Dev workflow fixes (browser mode auth, error toasts) — v0.0.4

- ✓ Protocol v3 handshake with device identity and reconnect — v0.0.5
- ✓ All 9 wrong RPC method names corrected — v0.0.5
- ✓ SSE event bus wired to gateway WebSocket events — v0.0.5
- ✓ Live data verification for agents, crons, usage, models, activity — v0.0.5

### Active

- [ ] Verify and fix every page/widget with real data end-to-end
- [ ] Fix remaining UI bugs, broken loaders, and error states

### Out of Scope

- Native mobile app — web-first desktop app, mobile deferred
- Self-hosted Matrix integration — future collaboration feature, not v1
- Real-time chat (non-iMessage) — defer to Matrix integration later
- Video posts / media hosting — storage/bandwidth concerns, defer

## Current Milestone: v0.0.6 — Sessions & Chat

**Goal:** Full session management with proper chat.send/history/abort methods, live streaming responses, model selection per session.

**Target features:**
- Sessions CRUD (list, create via chat.send, patch label, delete, compact)
- Chat history retrieval (chat.history with sessionKey, paginated)
- Chat send with live streaming (chat.send with deliver flag, SSE token stream)
- Chat abort (cancel in-progress agent responses)
- Model selection per session (models.list → picker in new session form)
- Session output streaming (gateway events → SSE → frontend live token display)

**Status:** In progress

## Context

**v1.0 shipped 2026-03-21.** Publishable release with 11 phases, 92 requirements, full cross-platform support.

**v0.0.2 shipped 2026-03-22.** Widget-first architecture: 28 registered widgets, 23 kernel hooks, DashboardDataContext removed, Home page as widget grid, 7 dashboard presets, category tabs in Widget Picker, notes formatting toolbar + wikilink autocomplete + backlinks panel, Discord-style status bar, activity feed widget, quick capture widget, clock + system info widgets.

**v0.0.3 shipped 2026-03-24.** AI Ops Center: 55 phases across 10 groups — theme blend (OKLCH), OpenClaw controller (agents, crons, usage, models, tools, skills), terminal (PTY + xterm.js), session management (spawn, monitor, history, live output), remote VM viewer (noVNC), gateway WS connection, approvals queue, notes editor overhaul (tables, search, templates, shortcuts, graph view). Built rapidly — many pages use assumed API shapes, not verified against actual gateway protocol.

**v0.0.4 shipped 2026-03-24.** Stabilize & Strip: 19 phases across 6 groups — dev workflow fixes (browser auth, error toasts), backend dead code audit (13 annotations, 3 unused crates, 3 dead routes, 2 nonexistent gateway methods), frontend tooling (knip), frontend dead code strip (82 exports, 97 imports, 2 packages, noVNC removal), TypeScript strict flags, test coverage (68 hook tests), final verification (117 smoke tests across modules/widgets/routes).

**v0.0.5 shipped 2026-03-24.** Gateway Protocol v3: 16 phases across 4 groups — protocol v3 handshake with device identity, exponential backoff reconnect, 9 RPC method corrections (chat, agents, crons, models, usage, tools/skills, activity), SSE event bus wiring (14 event types), agent + session event streaming, live data verification for all OpenClaw tabs (agents, crons, usage, models, activity feed).

The user's vision: the app should feel like Discord meets Google Docs — everything modular and customizable via the widget system, notes as rich as Google Docs leveraging Obsidian, full OpenClaw control center, Apple-quality polish throughout.

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

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-03-24 after v0.0.5 milestone completion*
