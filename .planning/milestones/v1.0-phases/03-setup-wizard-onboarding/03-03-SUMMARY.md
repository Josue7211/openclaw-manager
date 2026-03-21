---
phase: 03-setup-wizard-onboarding
plan: 03
subsystem: ui
tags: [react, wizard, onboarding, animation, accessibility, focus-trap, morphing-transition]

# Dependency graph
requires:
  - phase: 03-setup-wizard-onboarding (plan 01)
    provides: wizard-store (useWizardState, step management, first-run detection)
  - phase: 03-setup-wizard-onboarding (plan 02)
    provides: backend wizard endpoints (test-connection, save-credentials, reload-secrets)
  - phase: 01 (plan 05)
    provides: Button, Toast, useFocusTrap shared components
provides:
  - SetupWizard full-screen shell with step dots, morphing card transitions, and navigation
  - WizardStepDots progress indicator with 6 visual states
  - WizardWelcome screen with logo reveal animation and staggered text
  - WizardGuidePanel expandable setup instructions component
  - WizardConnectionTest reusable test button with inline result and toast
  - LayoutShell integration showing wizard on first run
affects: [03-setup-wizard-onboarding (plans 04, 05, 06)]

# Tech tracking
tech-stack:
  added: []
  patterns: [morphing-card-transition, stagger-animation-with-reduced-motion, step-dot-progress-indicator]

key-files:
  created:
    - frontend/src/components/SetupWizard.tsx
    - frontend/src/components/wizard/WizardStepDots.tsx
    - frontend/src/components/wizard/WizardWelcome.tsx
    - frontend/src/components/wizard/WizardGuidePanel.tsx
    - frontend/src/components/wizard/WizardConnectionTest.tsx
  modified:
    - frontend/src/globals.css
    - frontend/src/components/LayoutShell.tsx
    - frontend/src/pages/settings/SettingsConnections.tsx

key-decisions:
  - "Logo uses existing /logo-128.png from public assets rather than placeholder icon"
  - "WizardGuidePanel uses max-height transition for expand/collapse instead of grid-template-rows trick for wider browser support"
  - "SettingsConnections imports resetWizard from wizard-store instead of OnboardingWelcome for single source of truth"
  - "OnboardingWelcome.tsx file kept in place (not deleted) to avoid breaking SettingsConnections re-run wizard flow"

patterns-established:
  - "Morphing card transition: 4-phase state machine (idle/exiting/measuring/entering) for content swap with height animation"
  - "Stagger animation: useEffect + visible class pattern with configurable delays per element"
  - "Step dots: progressbar ARIA pattern with per-dot aria-label including step name and status"

requirements-completed: [WIZARD-01, WIZARD-07, WIZARD-08]

# Metrics
duration: 6min
completed: 2026-03-20
---

# Phase 03 Plan 03: Wizard Shell & Welcome Screen Summary

**Full-screen wizard shell with morphing card transitions, step dots progress indicator, logo reveal welcome screen, and shared guide/test components wired into LayoutShell**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-20T04:09:39Z
- **Completed:** 2026-03-20T04:15:39Z
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments
- SetupWizard renders as full-screen overlay at z-index 10000 with focus trap, ARIA dialog, and morphing card step transitions
- WizardStepDots shows 10 dots with 6 visual states (completed, success, dimmed, current, upcoming, error) plus pulsing animation
- WizardWelcome displays logo reveal animation with staggered text fade-in and three CTAs matching UI-SPEC copy exactly
- WizardGuidePanel and WizardConnectionTest provide reusable components for service step screens
- LayoutShell wired to show SetupWizard on first run, replacing old OnboardingWelcome rendering

## Task Commits

Each task was committed atomically:

1. **Task 1: SetupWizard shell with step dots and morphing card transitions** - `406778d` (feat)
2. **Task 2: WizardWelcome screen with logo reveal animation** - `4634e5d` (feat)
3. **Task 3: Shared wizard components + LayoutShell integration** - `8ab750d` (feat)

## Files Created/Modified
- `frontend/src/components/SetupWizard.tsx` - Full-screen wizard shell with step navigation, morphing transitions, navigation buttons
- `frontend/src/components/wizard/WizardStepDots.tsx` - Step progress dots with 6 visual states and progressbar ARIA
- `frontend/src/components/wizard/WizardWelcome.tsx` - Welcome screen with logo reveal, staggered text, Get Started/Try Demo/Skip
- `frontend/src/components/wizard/WizardGuidePanel.tsx` - Expandable setup instructions with slide-down animation
- `frontend/src/components/wizard/WizardConnectionTest.tsx` - Connection test button with inline result, toast notifications, wizard store sync
- `frontend/src/globals.css` - Added --z-wizard, dot-pulse, logo-reveal, logo-glow keyframes, wizard ambient glow, reduced motion overrides
- `frontend/src/components/LayoutShell.tsx` - Replaced OnboardingWelcome with SetupWizard, added isFirstRun check
- `frontend/src/pages/settings/SettingsConnections.tsx` - Import resetWizard from wizard-store instead of OnboardingWelcome

## Decisions Made
- Used existing `/logo-128.png` from public assets for the welcome screen logo rather than a placeholder icon
- WizardGuidePanel uses max-height CSS transition for expand/collapse (wider compatibility than grid-template-rows 0fr trick)
- SettingsConnections now imports `resetWizard` from wizard-store as the canonical reset function
- OnboardingWelcome.tsx file intentionally not deleted -- still used by SettingsConnections for the re-run wizard flow

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] WizardGuidePanel and WizardConnectionTest stubs already existed from plan 03-04**
- **Found during:** Task 3 (creating shared components)
- **Issue:** Plan 03-04 had pre-created stub files for these components since it depends on them
- **Fix:** Overwrote stubs with full implementations as designed in this plan
- **Files modified:** `frontend/src/components/wizard/WizardGuidePanel.tsx`, `frontend/src/components/wizard/WizardConnectionTest.tsx`
- **Verification:** Full acceptance criteria pass, all tests pass
- **Committed in:** `8ab750d` (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Stub overwrite was expected -- plan 03-04 created stubs anticipating this plan would deliver final versions. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Wizard shell is ready for service step components (plans 04: Tailscale/Supabase/OpenClaw/Mac/Server)
- Step placeholder content renders for all not-yet-built steps (1-8)
- WizardGuidePanel and WizardConnectionTest are ready for reuse in service step components
- All existing tests pass (1564/1564)

## Self-Check: PASSED

All 5 created files verified on disk. All 3 task commits (406778d, 4634e5d, 8ab750d) verified in git log. SUMMARY.md present.

---
*Phase: 03-setup-wizard-onboarding*
*Completed: 2026-03-20*
