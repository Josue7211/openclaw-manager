# Phase 3: Setup Wizard + Onboarding - Context

**Gathered:** 2026-03-19
**Status:** Ready for planning

<domain>
## Phase Boundary

First-run setup wizard that takes new users from launch to a configured, personalized app in under 5 minutes. Full-screen takeover with linear steps, three required infrastructure services (Tailscale + Supabase + OpenClaw), optional platform-grouped services, module selection with preset bundles, simplified theme picker, and an interactive demo/tour mode. The wizard only shows on first launch — returning users go straight to login.

This phase does NOT include: user management (handled in-app after setup), advanced theme editor (Phase 2 handles), dashboard customization (Phase 4), or new module creation.

</domain>

<decisions>
## Implementation Decisions

### Wizard Flow
- **Full-screen takeover** — wizard replaces the entire app until done, focused with no distractions
- **Linear step order:** Welcome → Tailscale → Supabase → OpenClaw → Mac Services → Server Services → Modules → Theme → Summary → Done
- **Progress indicator:** Step dots at the top — filled for completed, outlined for upcoming (iOS/macOS style)
- **Skip button on every step** — nothing blocks progression except the 3 required services
- **First-run only** — wizard only shows on truly first launch (no `setup-complete` in localStorage). Returning users go straight to login. User management happens in-app, not in wizard.
- **Resumable** — wizard state persisted so interrupted wizard resumes at the exact step user left off

### Required Infrastructure (3 services)
- **Tailscale** — network connectivity check. Must be connected before any remote service can be tested. If not detected, error with explanation of what Tailscale is and why it's needed.
- **Supabase** — database backend. URL + anon key, connection test required to proceed.
- **OpenClaw** — AI gateway. URL + API key, connection test required to proceed.
- These 3 are hard gates — user cannot skip them (but can jump to demo mode instead)

### Optional Services (platform-grouped)
- **Mac Services** step: BlueBubbles (iMessage) + Mac Bridge (Reminders, Notes, Contacts, Find My) — one screen
- **Server Services** step: CouchDB (Obsidian notes) — one screen
- Each has a Skip button
- Services not on macOS still show but are clearly labeled "Requires macOS with BlueBubbles"

### Service Connection UX
- **Expandable guide sections** — collapsible panel on each step with full setup instructions
- **Connection test behavior — all three simultaneously:**
  1. Inline result + latency below the Test button ("Connected (45ms)" or specific error)
  2. Toast notification for success/failure
  3. Step dot turns green/red as status indicator
- **Credentials saved on both:** temp save on successful test, confirmed on Next
- **Error messages:** Specific error + fix suggestion ("Connection refused on port 3000 — is BlueBubbles running?")
- **Tailscale auto-detect:** If a 100.x.x.x IP fails, add hint: "This is a Tailscale address — is Tailscale connected?"
- **Pre-fill:** Only relevant for first launch — if keychain already has values (shouldn't on first run), pre-fill and auto-test
- **"Re-run Walkthrough" button** in Settings → Connections for returning users who want to redo setup

### Module Selection Step
- **Preset bundles + customization:** Start with bundle choice ("Essentials", "Full Setup", "Minimal"), then show card grid to fine-tune
- **Card grid with toggles:** Each module as a card (icon + name + description) with toggle switch
- **Show all, dim unavailable:** All 16+ modules visible, but ones requiring unconfigured services are dimmed with label ("Requires BlueBubbles")
- **Modules grouped by category** in the card grid

### Theme Selection Step
- **Simplified grid:** Show 6-8 popular presets as cards (subset of full 17 presets from Phase 2)
- **Live preview:** Clicking a preset immediately changes the wizard's own appearance — WYSIWYG
- **Mode selector:** Light/Dark/System toggle above the preset grid

### Demo Mode
- **"Try Demo" button on welcome screen** — prominent, not hidden
- **"Try Demo" button visible on every step** — at the top, user can bail to demo at any point
- **Interactive guided tour** — tooltip walkthrough pointing out features, but NOT locked down
- **User-driven tooltips** — click to advance, not auto-advancing
- **Interactions work** — clicking a module opens it with demo data, not just looking at tooltips
- **Seamless switching** — from demo back to wizard at any time, and vice versa
- **Demo data wiped on real setup complete** — clean slate
- **"Re-run Walkthrough" button** in Settings → Connections to replay the tour after setup

### Completion Experience
- **Summary screen** — recap of what was configured: services connected, modules enabled, theme chosen
- **Celebration animation** — confetti or particle effect after summary
- **Smooth transition to dashboard** — animation from summary into the live dashboard
- **Optional tour prompt** — "Want a quick tour?" after landing on dashboard
- **Tour is thorough but skippable** — covers sidebar, dashboard, settings, key modules. User can skip the whole tour or skip individual sections.
- **Tour uses same tooltip system as demo mode** — consistent guided experience

### Visual Design & Animations
- **Modern minimal** with animated logo reveal intro on welcome screen
- **Plain background with ambient glow gradient** — matches app's existing visual language
- **Animations everywhere in the app** — fun, makes you want to use it, not just the wizard
- **Animation intensity setting** in Settings: three levels — Full / Reduced / None
- **Respect `prefers-reduced-motion`** as initial default, with manual override
- **Step transitions:** Claude's discretion — something cool, not basic slide or basic fade
- **Wizard step transition should feel modern and intentional** — not generic

### Claude's Discretion
- Exact step transition animation (something cooler than slide/fade)
- Logo reveal animation style
- Celebration animation specifics (confetti vs particles vs something else)
- How to structure the guided tour tooltip system
- Card grid layout details (2 columns, 3 columns, responsive)
- Which 6-8 theme presets to show in the simplified picker
- How to dim unavailable modules (opacity, overlay, grayscale)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Wizard Prior Art
- `.planning-v0.1.0-wizard/ROADMAP.md` — Archived 5-phase wizard breakdown (state foundation, Supabase, services, demo, polish)
- `.planning-v0.1.0-wizard/PROJECT.md` — Wizard project context
- `frontend/src/components/OnboardingWelcome.tsx` — Existing ~700-line wizard with broken state management (to be rewritten, not patched)

### Service Infrastructure
- `src-tauri/src/secrets.rs` — OS keychain integration for storing service credentials
- `src-tauri/src/tailscale.rs` — Tailscale peer verification, status checking
- `frontend/src/pages/settings/SettingsConnections.tsx` — Existing connection UI (reference for field layouts, test button patterns)
- `CLAUDE.md` §Infrastructure — Network architecture, service roles, Tailscale mesh details

### Module System
- `frontend/src/lib/modules.ts` — 16 toggleable modules, enable/disable API
- `frontend/src/lib/nav-items.ts` — Module listing with icons and categories

### Theme System (Phase 2)
- `frontend/src/lib/theme-definitions.ts` — 17 preset definitions
- `frontend/src/lib/theme-store.ts` — Theme state management
- `frontend/src/components/ui/ThemePicker.tsx` — Full theme picker (reference for simplified wizard version)

### Demo Mode
- `frontend/src/lib/demo-data.ts` — Existing fake data for showcase mode
- `frontend/src/components/DemoModeBanner.tsx` — Existing demo mode banner

### Phase 1 Components
- `frontend/src/components/ui/Button.tsx` — 4-variant button hierarchy
- `frontend/src/components/ui/EmptyState.tsx` — Shared empty state
- `frontend/src/components/ui/ErrorState.tsx` — Shared error state with retry
- `frontend/src/components/ui/Toast.tsx` — Toast notification system

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `OnboardingWelcome.tsx` — Will be **rewritten** (not patched). Use as reference for what field layouts look like, but discard the state management.
- `SettingsConnections.tsx` — Connection test patterns, field layouts, error handling. Reuse the backend test endpoints.
- `demo-data.ts` — Complete fake data set already usable for demo mode.
- `DemoModeBanner.tsx` — Existing banner, extend for demo/tour mode.
- `modules.ts` / `APP_MODULES` — Module registry with IDs, labels, and enabled state.
- `theme-definitions.ts` + `ThemePicker.tsx` — Reuse preset data, simplify for wizard context.
- `useFocusTrap` — Modal focus management for the full-screen wizard.
- `Button`, `EmptyState`, `ErrorState`, `Toast` — Phase 1 shared components ready to use.

### Established Patterns
- `useSyncExternalStore` for reactive state (theme, sidebar, keybindings) — wizard state should follow same pattern
- `useLocalStorageState` for persistent state — wizard progress persisted this way
- `api.get/post` for backend calls — connection tests go through Axum
- OS keychain via `secrets.rs` — credentials stored server-side, never in frontend

### Integration Points
- `LayoutShell.tsx` — Where wizard takeover happens (render wizard instead of normal app shell)
- `main.tsx` — First-run detection (`setup-complete` localStorage key)
- `keybindings.ts` — May need to disable shortcuts during wizard
- Settings → Connections — "Re-run Walkthrough" button lives here
- `server.rs` — Connection test endpoints already exist for health checks

</code_context>

<specifics>
## Specific Ideas

- "I want the app to feel fun, and make you want to use it" — animations are a feature, not decoration
- Animation intensity configurable: Full / Reduced / None — respect user preference
- Tailscale is a HARD requirement — no Tailscale, no remote services, period
- Wizard is replayable from Settings → Connections ("Re-run Walkthrough" button)
- Demo mode and wizard seamlessly swap — user can jump between them at any point
- Tour after setup is thorough but modular — skip the whole thing or skip individual sections

</specifics>

<deferred>
## Deferred Ideas

- **User management** — Adding/managing users happens in-app after setup, not in the wizard
- **Advanced theme customization in wizard** — Full Super+Shift+T picker deferred; wizard uses simplified 6-8 preset grid
- **Service auto-discovery** — Automatically detect services on tailnet instead of manual URL entry — future improvement
- **App-wide animation system** — The animation intensity toggle affects the whole app, but the full animation infrastructure is a cross-cutting concern that may need its own plan

</deferred>

---

*Phase: 03-setup-wizard-onboarding*
*Context gathered: 2026-03-19*
