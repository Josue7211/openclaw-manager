---
phase: 03-setup-wizard-onboarding
plan: 04
subsystem: ui
tags: [react, wizard, service-connection, tailscale, supabase, openclaw, bluebubbles, couchdb, phosphor-icons]

# Dependency graph
requires:
  - phase: 03-setup-wizard-onboarding
    provides: "wizard-store.ts (state management), wizard.rs (backend test endpoints), check_tailscale Tauri IPC"
provides:
  - "5 service step components: WizardTailscale, WizardSupabase, WizardOpenClaw, WizardMacServices, WizardServerServices"
  - "Stub WizardConnectionTest and WizardGuidePanel (sibling plan 03-03 delivers final versions)"
affects: [03-05-PLAN, 03-06-PLAN, SetupWizard shell integration]

# Tech tracking
tech-stack:
  added: []
  patterns: [wizard-service-step, collapsible-service-card, password-field-toggle]

key-files:
  created:
    - frontend/src/components/wizard/WizardTailscale.tsx
    - frontend/src/components/wizard/WizardSupabase.tsx
    - frontend/src/components/wizard/WizardOpenClaw.tsx
    - frontend/src/components/wizard/WizardMacServices.tsx
    - frontend/src/components/wizard/WizardServerServices.tsx
    - frontend/src/components/wizard/WizardConnectionTest.tsx
    - frontend/src/components/wizard/WizardGuidePanel.tsx
  modified: []

key-decisions:
  - "Stub WizardConnectionTest and WizardGuidePanel created for sibling plan 03-03 dependency -- plan 03-03 overwrites with final versions"
  - "Tailscale step uses Tauri IPC auto-detect with browser-mode manual IP fallback"
  - "Optional steps (Mac Services, Server Services) auto-complete on unmount with 'skipped' status if unconfigured"
  - "Platform detection for Mac Services uses navigator.platform/userAgent pattern"

patterns-established:
  - "Wizard service step pattern: heading + description + WizardGuidePanel + form fields + WizardConnectionTest"
  - "Password field toggle: position:relative wrapper with absolute Eye/EyeSlash button at right end"
  - "Collapsible service card: CaretDown toggle + expanded state + card container with border-radius-lg"

requirements-completed: [WIZARD-02, WIZARD-07]

# Metrics
duration: 5min
completed: 2026-03-20
---

# Phase 03 Plan 04: Service Connection Steps Summary

**5 wizard service step components -- Tailscale auto-detect via Tauri IPC, Supabase/OpenClaw with connection testing, Mac Services collapsible cards, CouchDB server services**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-20T04:09:50Z
- **Completed:** 2026-03-20T04:15:00Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- WizardTailscale auto-detects Tailscale connectivity via check_tailscale Tauri IPC with manual browser fallback
- WizardSupabase and WizardOpenClaw accept URL + secret key with show/hide toggle and backend connection testing
- WizardMacServices groups BlueBubbles + Mac Bridge as collapsible cards with platform detection banner
- WizardServerServices shows CouchDB with URL, username, and password configuration
- All components follow UI-SPEC typography, spacing, and accessibility requirements

## Task Commits

Each task was committed atomically:

1. **Task 1: Required service steps -- Tailscale, Supabase, OpenClaw** - `ee9243c` (feat)
2. **Task 2: Optional service steps -- Mac Services and Server Services** - `c76ece6` (feat)

## Files Created/Modified
- `frontend/src/components/wizard/WizardTailscale.tsx` - Tailscale auto-detection step with Tauri IPC and browser fallback
- `frontend/src/components/wizard/WizardSupabase.tsx` - Supabase URL + anon key connection step
- `frontend/src/components/wizard/WizardOpenClaw.tsx` - OpenClaw URL + API key connection step
- `frontend/src/components/wizard/WizardMacServices.tsx` - BlueBubbles + Mac Bridge collapsible cards
- `frontend/src/components/wizard/WizardServerServices.tsx` - CouchDB configuration step
- `frontend/src/components/wizard/WizardConnectionTest.tsx` - Stub connection test component (plan 03-03 delivers final)
- `frontend/src/components/wizard/WizardGuidePanel.tsx` - Stub guide panel (plan 03-03 delivers final)

## Decisions Made
- Created stub versions of WizardConnectionTest and WizardGuidePanel because sibling plan 03-03 was executing in parallel. The stubs are functional and follow the same interface contract. Plan 03-03 overwrites WizardGuidePanel with the final version including animation support.
- Tailscale step separates Tauri auto-detect mode from browser manual mode via `__TAURI_INTERNALS__` check, matching the established pattern from SettingsConnections.tsx.
- Optional steps use React.useEffect cleanup to mark step as completed/skipped on unmount, ensuring the wizard shell always sees them as done when navigating forward.
- Platform detection for Mac Services uses `navigator.platform` with regex fallback to `navigator.userAgent` for broad browser compatibility.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 5 service step components ready for integration into SetupWizard shell (plan 03-05 or 03-06)
- WizardConnectionTest stub is functional -- plan 03-03's final version will be used at runtime
- All components import from wizard-store.ts (plan 01) and use backend endpoints from wizard.rs (plan 02)
- 1564 frontend tests passing, all pre-commit checks green

## Self-Check: PASSED

All files verified present, all commits verified in git log.

---
*Phase: 03-setup-wizard-onboarding*
*Completed: 2026-03-20*
