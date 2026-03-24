# OpenClaw Manager

## What This Is

A self-hosted desktop app (Tauri v2 + Axum + React) that unifies personal infrastructure — iMessage, AI chat, task management, homelab monitoring, and agent orchestration — into one interface. Open source. All integrations are modular. Users enable only what they have.

## Core Value

Every external service is proxied through a single local Axum server. The frontend never touches remote services directly. Secrets live in the OS keychain, never in source.

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
- ✓ Offline-first SQLite ↔ Supabase sync (30s interval) — v0.0.1
- ✓ Tailscale agent access (MC_BIND_HOST + MC_AGENT_KEY) — v0.0.1
- ✓ CI release builds (Linux + macOS + Windows) — v0.0.1
- ✓ 13-agent security sweep (score 96/100) — v0.0.1
- ✓ Demo mode with sample data — v0.0.1

### Active

- [ ] Onboarding wizard redesign (full first-time setup experience)

### Out of Scope

- Native mobile app — web-first desktop, mobile deferred
- Real-time collaborative editing — single-user app
- Embedded noVNC VM viewer — planned for future milestone

## Current Milestone: v0.1.0 Onboarding Wizard Redesign

**Goal:** A polished, functional first-time setup experience that guides new users from zero to a working app, with demo mode as an escape hatch.

**Target features:**
- Persistent field values across wizard navigation
- "Skip to Demo" button on every step
- Connection tests that handle unconfigured services gracefully
- Pre-fill from .env.local / keychain when available
- Supabase step saves to keychain
- Clean, modern multi-step wizard UI

## Context

- App just shipped v0.0.1 with production builds for all platforms
- Current onboarding wizard has critical bugs: fields don't persist when navigating back, no demo mode escape, connection tests 401 on fresh installs, Supabase values not saved to keychain
- User tested fresh install on Mac — wizard is non-functional for first-time users
- Full redesign approved by user (not a patch job)
- Existing wizard code is in `frontend/src/components/OnboardingWelcome.tsx` (~700 lines)
- The app already has a working demo mode (`isDemoMode()` in `lib/demo-data.ts`)

## Constraints

- **Security**: Secrets must go through OS keychain (Tauri `invoke`), never localStorage
- **Accessibility**: All interactive elements must have ARIA labels, focus traps on modals
- **CSS**: Use CSS variables from globals.css, never hardcode colors
- **Modules**: Each service step should respect enabled modules from `lib/modules.ts`
- **Cross-platform**: Must work in Tauri WebView on Linux, macOS, Windows

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Rename to OpenClaw Manager | Reflects the OpenClaw ecosystem branding | ✓ Good |
| Drop Intel Mac builds | Apple Silicon only, Intel Mac dying | ✓ Good |
| MC_AGENT_KEY for Tailscale access | Stable key for external agents (Bjorn) | ✓ Good |
| Axum binds to 0.0.0.0 via MC_BIND_HOST | Enables Tailscale agent access | ✓ Good |

---
*Last updated: 2026-03-19 after v0.0.1 release*
