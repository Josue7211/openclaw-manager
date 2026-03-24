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

- [ ] Strip dead/unused code, components, routes, and imports
- [ ] Fix OpenClaw gateway integration to use correct protocol methods
- [ ] Remove deferred feature stubs (TipTap, Project Tracker)
- [ ] Verify and fix every page/widget with real data end-to-end
- [ ] Harden test coverage for v0.0.3 features
- [ ] Fix remaining UI bugs, broken loaders, and error states

### Out of Scope

- Native mobile app — web-first desktop app, mobile deferred
- Self-hosted Matrix integration — future collaboration feature, not v1
- Real-time chat (non-iMessage) — defer to Matrix integration later
- Video posts / media hosting — storage/bandwidth concerns, defer

## Current Milestone: v0.0.4 — Stabilize & Strip

**Goal:** Harden everything shipped in v0.0.3, remove dead code and broken stubs, fix real gateway integration, ensure every page actually works end-to-end.

**Target features:**
- Strip dead/unused code, components, routes, and imports across the codebase
- Fix OpenClaw gateway integration (pages use wrong API methods — wire to actual gateway protocol)
- Remove deferred feature stubs (TipTap references, Project Tracker remnants)
- Verify and fix every page/widget with real data (not just compilation)
- Harden test coverage for rapidly-built v0.0.3 features
- Fix any remaining UI bugs, broken loaders, and error states

## Context

**v1.0 shipped 2026-03-21.** Publishable release with 11 phases, 92 requirements, full cross-platform support.

**v0.0.2 shipped 2026-03-22.** Widget-first architecture: 28 registered widgets, 23 kernel hooks, DashboardDataContext removed, Home page as widget grid, 7 dashboard presets, category tabs in Widget Picker, notes formatting toolbar + wikilink autocomplete + backlinks panel, Discord-style status bar, activity feed widget, quick capture widget, clock + system info widgets.

**v0.0.3 shipped 2026-03-24.** AI Ops Center: 55 phases across 10 groups — theme blend (OKLCH), OpenClaw controller (agents, crons, usage, models, tools, skills), terminal (PTY + xterm.js), session management (spawn, monitor, history, live output), remote VM viewer (noVNC), gateway WS connection, approvals queue, notes editor overhaul (tables, search, templates, shortcuts, graph view). Built rapidly — many pages use assumed API shapes, not verified against actual gateway protocol.

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
*Last updated: 2026-03-24 after v0.0.4 milestone start*
