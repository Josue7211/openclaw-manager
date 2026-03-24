# Milestones

## v1.0 — OpenClaw Manager Publishable Release

**Shipped:** 2026-03-21
**Phases:** 11 (8 main + 3 decimal insertions) | **Plans:** 52 | **Commits:** 239
**Timeline:** 2026-03-07 → 2026-03-21 (14 days)
**Codebase:** 74,399 LOC TypeScript/React + 25,362 LOC Rust

### Key Accomplishments

1. Responsive layout shell with auto-collapsing sidebar and CSS container queries
2. Full theming system — 15+ presets, GTK/Wallbash system mode, font customization, share codes
3. Setup wizard — 9-step onboarding with demo mode, guided tour, credential validation
4. Dashboard grid — drag-and-drop widgets, Widget Registry, multi-page layouts, undo/redo
5. Bjorn AI module builder — natural language → sandboxed preview → approve → dashboard with hot-reload
6. 11 composable UI primitives registered in Widget Registry for manual and AI composition
7. Data export — Supabase JSON, SQLite backup, notes markdown from Settings

### Requirements

92/92 requirements satisfied (100%)
- LAYOUT: 6/6 | POLISH: 16/16 | THEME: 8/8 | SYSMODE: 7/7
- WIZARD: 8/8 | DASH: 11/11 | PAGE: 7/7 | PRIM: 14/14
- BJORN: 12/12 | EXPORT: 3/3

### Integration

28/28 key cross-phase exports wired. 4/4 E2E user flows verified.
Zero orphaned exports, zero broken flows.

### Test Suite

- Frontend: 103 test files, 2,177 tests passing
- Backend: 245 Rust tests passing

### Archive

- [v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md)
- [v1.0-REQUIREMENTS.md](milestones/v1.0-REQUIREMENTS.md)
- [v1.0-MILESTONE-AUDIT.md](milestones/v1.0-MILESTONE-AUDIT.md)

---

## v0.0.2 — Widget-First Architecture

**Shipped:** 2026-03-22
**Phases:** 7 | **Requirements:** 15/15 (100%)
**Timeline:** 2026-03-21 → 2026-03-22 (1 day)

### Key Accomplishments

1. Widget-first architecture: 28 registered widgets, 23 kernel hooks
2. DashboardDataContext removed — all widgets fetch independently via React Query + SSE
3. Home page as widget grid, 7 dashboard presets, category tabs in Widget Picker
4. Notes formatting toolbar + wikilink autocomplete + backlinks panel
5. Discord-style status bar, activity feed, quick capture, clock + system info widgets

---

## v0.0.3 — AI Ops Center + OpenClaw Controller + Polish

**Shipped:** 2026-03-24
**Phases:** 55 (19 main + 36 additions across Groups G–T)
**Timeline:** 2026-03-22 → 2026-03-24 (2 days)

### Key Accomplishments

1. Theme blend — OKLCH color interpolation, engine, slider UI with persistence
2. OpenClaw controller — gateway proxy, agent CRUD, cron management, usage/models/tools tabs
3. Terminal — portable-pty backend + xterm.js frontend with theme integration
4. AI Ops Center — Claude Code session management, monitor frontend, remote VM viewer (noVNC)
5. Gateway WS connection — tokio-tungstenite client, SSE event bus, session wiring
6. Session management — history view, live output, send/controls, subagent spawn
7. Approvals queue — backend + UI for exec governance
8. Skills & tools — catalog, invocation UI, skills tab
9. Enhanced monitoring — usage charts, cost alerts, activity feed, KPI widget
10. Notes editor overhaul — tables, search, templates, slash commands, graph view fix

### Known Issues

- Many OpenClaw pages built against assumed API shapes, not verified against actual gateway protocol
- Rapid development left dead code and broken stubs across the codebase

---
*Last updated: 2026-03-24*
