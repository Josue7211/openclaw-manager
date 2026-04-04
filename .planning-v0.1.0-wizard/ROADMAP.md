# Roadmap: OpenClaw Manager

## Milestones

- ✅ **v0.0.1 Initial Release** — Phases 0 (shipped 2026-03-19, pre-GSD)
- 🚧 **v0.1.0 Onboarding Wizard Redesign** — Phases 1-5 (in progress)

## Overview

v0.1.0 rewrites the onboarding wizard from scratch. The existing ~700-line OnboardingWelcome.tsx has broken state management, no demo escape hatch, and connection tests that 401 on fresh installs. The rewrite delivers a wizard that persists values, pre-fills from keychain, gates progression on successful tests, and offers demo mode at every step.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

### 🚧 v0.1.0 Onboarding Wizard Redesign

- [ ] **Phase 1: Wizard State Foundation** - Navigation, persistence, progress indicator, and pre-fill architecture
- [ ] **Phase 2: Supabase Step** - Supabase URL/key entry, connection test, guide with setup links
- [ ] **Phase 3: Service Steps** - All service configuration steps with graceful unconfigured states
- [ ] **Phase 4: Demo Mode** - Demo entry from welcome and every step, in-app banner link back to wizard
- [ ] **Phase 5: Polish** - Accessible markup, masked fields, responsive layout, dark-theme visual design

## Phase Details

### Phase 1: Wizard State Foundation
**Goal**: Users can navigate a multi-step wizard that never loses their values
**Depends on**: Nothing (first phase)
**Requirements**: FLOW-01, FLOW-02, FLOW-03, FLOW-04, FLOW-05, FLOW-06, FLOW-07, FLOW-08
**Success Criteria** (what must be TRUE):
  1. User can click Back and forward repeatedly without any field losing its value
  2. User sees a progress indicator that updates to show which step they are on out of the total
  3. User can click "Skip to Demo" on any step and the wizard closes into demo mode
  4. Fields are pre-populated with values from .env.local or the OS keychain on first mount
  5. When the current step has no active connection test result, the Next button is disabled until the test passes
**Plans**: TBD

### Phase 2: Supabase Step
**Goal**: Users can configure their Supabase instance as the first required step
**Depends on**: Phase 1
**Requirements**: SUPA-01, SUPA-02, SUPA-03, SUPA-04
**Success Criteria** (what must be TRUE):
  1. User sees a Supabase step with links to Supabase Cloud signup and the self-hosted Docker setup guide
  2. User can enter a Supabase URL and anon key, and values are saved to the OS keychain when clicking Next
  3. User can click "Test Connection" and sees a success state with latency in milliseconds or an error message
  4. When values are pre-filled from environment variables, a "configured" badge appears and the test runs automatically
**Plans**: TBD

### Phase 3: Service Steps
**Goal**: Users can configure optional services without seeing 401 errors or confusing failures
**Depends on**: Phase 2
**Requirements**: SVC-01, SVC-02, SVC-03, SVC-04, SVC-05
**Success Criteria** (what must be TRUE):
  1. A service step with no saved credentials shows a clear "not configured" message instead of a 401 error
  2. Clicking "Test Connection" saves credentials to keychain first, then runs the test against the service
  3. A passing connection test shows the service name and response latency in milliseconds
  4. When keychain values are pre-filled on step mount, the connection test runs automatically without user action
  5. Each optional service step has a labeled "Skip" button that advances without requiring a passing test
**Plans**: TBD

### Phase 4: Demo Mode
**Goal**: Users who cannot or do not want to configure services can reach a working demo in one click
**Depends on**: Phase 1
**Requirements**: DEMO-01, DEMO-02, DEMO-03, DEMO-04
**Success Criteria** (what must be TRUE):
  1. User can click "Try Demo" on the welcome step and the wizard exits into demo mode without entering any credentials
  2. User can click "Skip to Demo" on any service configuration step and immediately enter demo mode
  3. After entering demo mode, all modules show realistic sample data without any backend connection
  4. The demo mode banner inside the app contains a link that reopens the setup wizard
**Plans**: TBD

### Phase 5: Polish
**Goal**: The wizard is accessible, visually polished, and works at minimum window size
**Depends on**: Phases 1-4
**Requirements**: UI-01, UI-02, UI-03, UI-04
**Success Criteria** (what must be TRUE):
  1. The wizard visually matches the app's dark theme and uses only CSS variables from globals.css
  2. Every button, input, and interactive element has an ARIA label and is fully keyboard-navigable
  3. Password and secret fields show masked dots by default and reveal on clicking a show/hide toggle
  4. The wizard is usable without horizontal scrolling at a 900x600 window size
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Wizard State Foundation | 0/TBD | Not started | - |
| 2. Supabase Step | 0/TBD | Not started | - |
| 3. Service Steps | 0/TBD | Not started | - |
| 4. Demo Mode | 0/TBD | Not started | - |
| 5. Polish | 0/TBD | Not started | - |
