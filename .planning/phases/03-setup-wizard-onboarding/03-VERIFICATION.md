---
phase: 03-setup-wizard-onboarding
verified: 2026-03-20T00:35:00Z
status: human_needed
score: 4/4 success criteria verified (automated)
human_verification:
  - test: "Complete the wizard flow from first launch to dashboard"
    expected: "User sees wizard on first launch, can configure services, pick modules, pick theme, and land on dashboard in under 5 minutes"
    why_human: "Full end-to-end flow with real UI interactions, timing, and visual polish cannot be verified programmatically"
  - test: "Verify morphing card transitions and staggered animations look polished"
    expected: "Step transitions scale/fade/morph smoothly, welcome screen text staggers in, confetti fires on summary"
    why_human: "Animation quality and visual timing are subjective and require visual inspection"
  - test: "Test connection testing with real service endpoints"
    expected: "Entering valid credentials and clicking Test Connection shows latency, entering invalid shows helpful error with fix suggestion"
    why_human: "Requires real backend services running and Tailscale connected"
  - test: "Verify guided tour spotlight and tooltip positioning"
    expected: "Tour stops highlight correct elements, tooltips position without clipping, clicks pass through spotlight cutout"
    why_human: "Visual overlay positioning and click-through behavior need manual testing"
  - test: "Verify wallbash dark/light/auto mode switch propagation"
    expected: "Switching wallbash mode on HyDE desktop updates app theme within 500ms"
    why_human: "Requires Hyprland desktop environment with wallbash theme active"
---

# Phase 3: Setup Wizard + Onboarding Verification Report

**Phase Goal:** New users (including non-technical users) can go from first launch to a configured, personalized app in under 5 minutes without reading documentation.
**Verified:** 2026-03-20T00:35:00Z
**Status:** human_needed
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths (from ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | First-time users see the setup wizard automatically on launch, and returning users who completed setup go straight to the dashboard | VERIFIED | `LayoutShell.tsx:35` initializes `showWizard` from `isFirstRun()` which checks `!localStorage.getItem('setup-complete')`. Wizard renders at z-10000 as fixed overlay. `completeWizard()` sets `setup-complete` key. |
| 2 | User can connect services (BlueBubbles, OpenClaw, Supabase, CouchDB, Mac Bridge) individually with each being optional, select modules, and pick a theme in a progressive non-overwhelming flow | VERIFIED | 5 service step components exist (WizardTailscale, WizardSupabase, WizardOpenClaw, WizardMacServices, WizardServerServices). Steps 1-3 are required, 4-5 are optional/skippable. WizardModules has 3 presets + card grid. WizardTheme has 8 presets + mode selector. All use WizardConnectionTest calling `POST /api/wizard/test-connection`. Backend wizard.rs handles all 5 service types. |
| 3 | User can choose demo mode to explore the app with fake data without any infrastructure | VERIFIED | `activateDemoMode()` in wizard-store.ts sets `demo-mode` in localStorage. SetupWizard.tsx `handleTryDemo` calls `activateDemoMode()` + `completeWizard()`. DemoModeBanner.tsx has "Run Setup Wizard" button calling `deactivateDemoMode()` + `resetWizard()`. |
| 4 | User can skip the wizard at any point and complete setup later via Settings, and an interrupted wizard resumes exactly where the user left off | VERIFIED | WizardWelcome has "Skip setup" button calling `completeWizard()`. SetupWizard.tsx navigation has Skip button on optional steps. SettingsConnections.tsx has "Re-run Setup" with `resetWizard()`. Wizard state persists to localStorage with `wizard-state` key and 24h TTL. `loadInitialState()` restores `currentStep` on reload. `testResults` are excluded from persistence (re-run on resume). |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `frontend/src/lib/wizard-store.ts` | Wizard state management | VERIFIED | 7143 bytes, 14 exported functions, useSyncExternalStore pattern, 24h TTL, testResults excluded from persistence |
| `frontend/src/lib/animation-intensity.ts` | Animation intensity store | VERIFIED | 3848 bytes, prefers-reduced-motion detection, data-animation DOM attribute |
| `frontend/src/lib/tour-store.ts` | Tour state management | VERIFIED | 7895 bytes, 8 stops in 3 sections, useSyncExternalStore, localStorage persistence |
| `frontend/src/components/SetupWizard.tsx` | Full-screen wizard shell | VERIFIED | 17395 bytes (509 lines), morphing card transitions, focus trap, aria-modal, all 9 step components lazy-loaded, completion flow with credential save |
| `frontend/src/components/wizard/WizardStepDots.tsx` | Step progress indicator | VERIFIED | 3422 bytes, progressbar ARIA, multiple visual states |
| `frontend/src/components/wizard/WizardWelcome.tsx` | Welcome screen with logo reveal | VERIFIED | 5363 bytes, "Welcome to OpenClaw Manager" copy, Get Started/Try Demo/Skip buttons, logo-reveal animation |
| `frontend/src/components/wizard/WizardGuidePanel.tsx` | Expandable setup instructions | VERIFIED | 2939 bytes, aria-expanded, role="region", max-height transition |
| `frontend/src/components/wizard/WizardConnectionTest.tsx` | Connection test button | VERIFIED | 4455 bytes, calls `api.post('/api/wizard/test-connection')`, 4 button states, aria-live result |
| `frontend/src/components/wizard/WizardTailscale.tsx` | Tailscale detection step | VERIFIED | 7911 bytes, `invoke('check_tailscale')` Tauri IPC, browser fallback |
| `frontend/src/components/wizard/WizardSupabase.tsx` | Supabase connection step | VERIFIED | 4639 bytes, URL + anon key inputs, WizardConnectionTest with service="supabase" |
| `frontend/src/components/wizard/WizardOpenClaw.tsx` | OpenClaw connection step | VERIFIED | 4593 bytes, URL + API key inputs, WizardConnectionTest with service="openclaw" |
| `frontend/src/components/wizard/WizardMacServices.tsx` | Mac Services step | VERIFIED | 9537 bytes, BlueBubbles + Mac Bridge collapsible cards, WizardConnectionTest |
| `frontend/src/components/wizard/WizardServerServices.tsx` | Server Services step | VERIFIED | 5455 bytes, CouchDB card with WizardConnectionTest |
| `frontend/src/components/wizard/WizardModules.tsx` | Module selection | VERIFIED | 13468 bytes, 3 preset bundles (radiogroup), categorized card grid, unavailable dimming |
| `frontend/src/components/wizard/WizardTheme.tsx` | Theme selection | VERIFIED | 11474 bytes, setActiveTheme/setMode for WYSIWYG, 8 presets, mode selector radiogroup |
| `frontend/src/components/wizard/WizardSummary.tsx` | Summary + confetti | VERIFIED | 10473 bytes, canvas-confetti on mount, service/module/theme recap cards, Launch Dashboard + Tour buttons |
| `frontend/src/components/GuidedTour.tsx` | Tour overlay | VERIFIED | 6827 bytes, clip-path polygon cutout, createPortal, TourTooltip rendering |
| `frontend/src/components/tour/TourTooltip.tsx` | Positioned tour tooltip | VERIFIED | 11363 bytes, getBoundingClientRect positioning, role="dialog", smart placement |
| `src-tauri/src/routes/wizard.rs` | Backend wizard endpoints | VERIFIED | 13129 bytes, 3 POST endpoints (test-connection, save-credentials, reload-secrets), 5 service handlers |
| `frontend/src/lib/theme-definitions.ts` | Theme variants | VERIFIED | Contains rose-pine-light, dracula-light, nord-light, tokyo-night-light + 9 more new variants. COUNTERPART_MAP has 36 entries. |
| `frontend/src/lib/theme-engine.ts` | Wallbash generation counter | VERIFIED | `_wallbashGeneration` counter, `getWallbashGeneration()` export, increments on color/scheme change |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| SetupWizard.tsx | wizard-store.ts | useWizardState hook | WIRED | Line 3: `import { useWizardState, ... } from '@/lib/wizard-store'` |
| SetupWizard.tsx | animation-intensity.ts | shouldReduceMotion | WIRED | Line 13: `import { shouldReduceMotion } from '@/lib/animation-intensity'` |
| LayoutShell.tsx | SetupWizard.tsx | Conditional render on isFirstRun | WIRED | Line 35: `useState(() => isFirstRun())`, Line 373-377: conditional render |
| LayoutShell.tsx | GuidedTour.tsx | Conditional render on tourState.active | WIRED | Line 47: `useTourState()`, Line 381-384: conditional render |
| WizardConnectionTest.tsx | /api/wizard/test-connection | api.post call | WIRED | Line 36: `api.post('/api/wizard/test-connection', ...)` |
| SetupWizard.tsx | /api/wizard/save-credentials | Completion flow | WIRED | Line 156: `api.post('/api/wizard/save-credentials', ...)` |
| SetupWizard.tsx | /api/wizard/reload-secrets | Completion flow | WIRED | Line 162: `api.post('/api/wizard/reload-secrets')` |
| SetupWizard.tsx | modules.ts | setEnabledModules | WIRED | Line 11: `import { setEnabledModules }`, Line 165: `setEnabledModules(wizard.enabledModules)` |
| WizardTailscale.tsx | Tauri IPC | invoke('check_tailscale') | WIRED | Line 65: `invoke<TailscaleCheck>('check_tailscale')` |
| WizardTheme.tsx | theme-store.ts | setActiveTheme/setMode | WIRED | Line 15: imported, Lines 271/279: called |
| WizardSummary.tsx | canvas-confetti | confetti() on mount | WIRED | Line 10: `import confetti from 'canvas-confetti'`, Line 128: `confetti({...})` |
| wizard.rs | routes/mod.rs | Router registration | WIRED | `pub mod wizard` (line 39), `.merge(wizard::router())` (line 79) |
| check_tailscale | main.rs | Tauri command registration | WIRED | `tailscale::check_tailscale` in generate_handler (line 168) |
| DemoModeBanner.tsx | wizard-store.ts | resetWizard + deactivateDemoMode | WIRED | Line 4: imported, Lines 48-49: called |
| SettingsConnections.tsx | wizard-store.ts | resetWizard | WIRED | Line 7: `import { resetWizard as resetSetupWizard }`, Re-run Setup button present |
| GuidedTour.tsx | tour-store.ts | useTourState | WIRED | Reads tourState for active stop, renders TourTooltip |
| Sidebar.tsx | data-tour attributes | Tour targeting | WIRED | data-tour="sidebar", data-tour="module-list", data-tour="settings" |

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|---------------|-------------|--------|----------|
| WIZARD-01 | 01, 03 | First-run detection triggers setup wizard automatically | SATISFIED | `isFirstRun()` checks `!localStorage.getItem('setup-complete')`. LayoutShell renders wizard when true. |
| WIZARD-02 | 02, 04 | Service connection step (BB, OC, SB, CDB, MB -- each optional) | SATISFIED | 5 service step components exist. Backend handles all 5 types. Steps 4-5 are skippable. |
| WIZARD-03 | 05 | Module selection step (enable/disable from available modules) | SATISFIED | WizardModules.tsx: 3 presets, categorized card grid, toggle switches, unavailable dimming |
| WIZARD-04 | 05 | Theme selection step (pick from presets, choose light/dark/system) | SATISFIED | WizardTheme.tsx: 8 preset cards, Dark/Light/System mode selector, WYSIWYG via setActiveTheme |
| WIZARD-05 | 01, 05, 06 | Demo mode option for users without infrastructure | SATISFIED | activateDemoMode/deactivateDemoMode in wizard-store, Try Demo button in wizard, Run Setup Wizard in DemoModeBanner |
| WIZARD-06 | 02, 05 | Setup can be skipped and completed later via Settings | SATISFIED | Skip setup on welcome, Skip button on optional steps, Re-run Setup in SettingsConnections with resetWizard |
| WIZARD-07 | 03, 04 | Progressive disclosure (no 20-step wall -- collapse advanced options) | SATISFIED | WizardGuidePanel collapses by default. Mac/Server steps are collapsible cards. 9 steps presented one at a time with morphing transitions. |
| WIZARD-08 | 01, 03 | Setup state persisted so interrupted wizard resumes where user left off | SATISFIED | wizard-store persists to localStorage (excluding testResults). loadInitialState restores currentStep. 24h TTL. 29 unit tests pass. |

No orphaned requirements found -- all 8 WIZARD requirements from ROADMAP are claimed and satisfied by plans.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none found) | -- | -- | -- | -- |

No TODO/FIXME/placeholder stubs, no console.log, no empty implementations, no div onClick (all buttons use `<button>`). All `return null` instances are legitimate conditional rendering.

### Human Verification Required

### 1. Full Wizard End-to-End Flow

**Test:** Clear localStorage (`localStorage.removeItem('setup-complete')`), reload the app. Walk through all 9 wizard steps.
**Expected:** Wizard appears on launch. Welcome screen has logo animation, staggered text, and 3 CTA buttons. Service steps accept credentials and test connections. Module step has preset bundles. Theme step shows WYSIWYG preview. Summary shows recap with confetti. "Launch Dashboard" saves credentials and transitions to the app. On subsequent launch, wizard does NOT appear.
**Why human:** End-to-end flow timing, animation quality, and visual polish require visual inspection.

### 2. Morphing Card Transitions and Animations

**Test:** Navigate through wizard steps forward and backward.
**Expected:** Content exits with scale+fade, container morphs height, new content enters with scale+fade. Direction-aware (forward: scale down on exit, backward: scale up). Reduced motion setting skips animations.
**Why human:** Animation smoothness and timing feel are subjective.

### 3. Connection Testing with Real Services

**Test:** Enter real Supabase/OpenClaw/BlueBubbles credentials and click Test Connection.
**Expected:** Success shows latency in ms with green indicator. Wrong password shows "Authentication failed" with fix suggestion. Unreachable URL shows "Connection refused" or timeout with Tailscale hint if IP starts with 100.
**Why human:** Requires running backend services and Tailscale connectivity.

### 4. Guided Tour Spotlight and Positioning

**Test:** Click "Take a Quick Tour" on summary screen, or start tour from Settings.
**Expected:** Spotlight overlay highlights sidebar, then module list, then settings, etc. Tooltip positions correctly without viewport clipping. Target elements remain clickable through the cutout.
**Why human:** Visual overlay positioning, clip-path rendering, and click-through behavior need manual testing.

### 5. Wallbash Mode Switching (HyDE Desktop)

**Test:** With wallbash theme active in app, switch HyDE desktop between dark/light/auto modes.
**Expected:** App theme updates within 500ms. Color scheme changes without requiring user interaction in the app.
**Why human:** Requires Hyprland desktop environment with HyDE wallbash theme manager.

### Gaps Summary

No blocking gaps found. All 4 success criteria from the ROADMAP are satisfied by the codebase implementation:
- First-run detection and wizard auto-launch: wired in LayoutShell via isFirstRun()
- Service connections, module selection, and theme picking: 13 wizard component files, backend endpoints, completion flow
- Demo mode: activateDemoMode/deactivateDemoMode with DemoModeBanner integration
- Skip and resume: completeWizard/resetWizard in wizard-store, Re-run Setup in Settings, 24h TTL persistence

All 8 WIZARD requirements are covered by plan implementations. 29 wizard+animation unit tests pass. 325 theme tests pass. No anti-patterns detected.

The only remaining verification is human testing of visual polish, real service connectivity, and animation quality.

---

_Verified: 2026-03-20T00:35:00Z_
_Verifier: Claude (gsd-verifier)_
