# State

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-03-19 — Milestone v0.1.0 started

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-19)

**Core value:** Every external service proxied through local Axum server. Frontend never touches remote services. Secrets in OS keychain.
**Current focus:** Onboarding wizard redesign

## Accumulated Context

- Existing wizard is ~700 lines in OnboardingWelcome.tsx
- Has SERVICE_GROUPS config for each service (BlueBubbles, OpenClaw, Homelab, Media, Email, Calendar, ntfy, Anthropic)
- Each group has fields, keychain keys, test endpoints, skip labels
- Wizard loads keychain values on mount but doesn't persist across step navigation
- Demo mode exists via isDemoMode() (detects missing VITE_SUPABASE_URL)
- Supabase step uses direct fetch() for connection test (browser-side)
- Service steps use /api/status/connections for tests (requires running backend + auth)
- Connection tests fail with 401 on fresh install because user isn't authenticated yet
