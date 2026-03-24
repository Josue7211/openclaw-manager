# Phase 1: Wizard State Foundation - Context

**Gathered:** 2026-03-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Rewrite the onboarding wizard's state management and navigation. Deliver a multi-step wizard that persists field values across navigation, pre-fills from OS keychain, shows step progress, gates Next on connection test success, and offers Skip to Demo on every step. The wizard shell, state hooks, step rendering, and navigation are in scope. Supabase-specific step logic (Phase 2), per-service configuration (Phase 3), demo mode app-shell wiring (Phase 4), and visual polish (Phase 5) are out of scope.

</domain>

<decisions>
## Implementation Decisions

### Wizard layout & navigation
- Centered card overlay (portal-rendered) with backdrop — same pattern as current wizard
- Responsive width: min 480px, max 640px (replaces fixed 520px)
- Fixed max-height with internal content scrolling — footer stays pinned
- Backdrop is inert — clicking it does NOT dismiss the wizard
- X button always visible in top-right corner. Escape key also dismisses
- Slide left/right transitions between steps (right for Next, left for Back)
- Transition timing: Claude's discretion (use `var(--ease-spring)` or similar)
- Navigation buttons split: Back/Next in fixed footer bar, Skip to Demo as subtle inline link above progress indicator

### Step composition
- Hybrid approach: service steps are data-driven from SERVICE_GROUPS config; Welcome, Module Selection, Supabase, and Done are custom components
- Step order: Welcome → Service steps (filtered) → Module Selection → Done
  - Services come BEFORE module selection — users configure what they have, then modules reflect what passed
- Step list recalculates immediately when module selection changes (no deferred update)
- Nested file structure: `components/onboarding/` subdirectory with types.ts, constants.ts, useWizardState.ts, and individual step components

### Progress indicator
- Dots + "Step N of M" text label (enhance existing ProgressDots)
- Completed steps show as filled dots — no checkmarks
- Dots are clickable to jump to visited steps only (cannot skip ahead past unvisited)
- Positioned above the footer bar, between step content and navigation buttons

### Connection test UX
- Inline "Test Connection" button below the last field in each service step
- Test failure: error banner at top of step content showing the error reason
- No auto-retry on failure — user fixes and clicks Test again
- Strict gate: Next disabled until test passes. Only way forward without passing is Skip to Demo
- No "proceed anyway" override — strict enforcement per FLOW-07

### Claude's Discretion
- Slide transition timing and easing curve (recommended: `var(--ease-spring)`, 150-250ms)
- Loading/spinner placement during connection tests
- Exact spacing, padding, and typography within the wizard card
- How to handle the Tauri guard (`window.__TAURI_INTERNALS__`) in browser dev mode

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Wizard implementation
- `frontend/src/components/OnboardingWelcome.tsx` — Current wizard (1082 lines). SOURCE OF TRUTH for SERVICE_GROUPS config, field definitions, keychain keys, test endpoints, and inline sub-components (ProgressDots, TestResult)
- `frontend/src/lib/hooks/useLocalStorageState.ts` — Persistence hook to use for wizard step/completed tracking (FLOW-06)
- `frontend/src/lib/modules.ts` — Module enable/disable state (useSyncExternalStore pattern)

### Keychain & secrets
- `src-tauri/src/secrets.rs` — FRONTEND_BLOCKED_KEYS list defines which keychain keys return null to frontend. Critical for understanding what can/cannot be pre-filled (FLOW-04)

### Existing hooks to reuse
- `frontend/src/lib/hooks/useFocusTrap.ts` — Modal focus management (already used in wizard)
- `frontend/src/lib/hooks/useEscapeKey.ts` — Escape-to-close (already used in wizard)

### CSS & theming
- `frontend/src/globals.css` — CSS variables for colors, spacing, z-indices, transitions. All wizard styling must use these variables

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `SERVICE_GROUPS` array: Full config for all service steps (fields, keychain keys, test endpoints, skip labels). Move to `onboarding/constants.ts`
- `ProgressDots`: Inline component rendering step dots. Extract to `onboarding/shared/ProgressDots.tsx` and enhance with text label
- `TestResult`: Inline component showing test pass/fail badge. Extract to `onboarding/shared/TestResult.tsx`
- `wizardInput`, `primaryBtn`, `secondaryBtn`, `skipBtn`, `fieldLabel`: CSS style objects. Move to `onboarding/shared/styles.ts`
- `useFocusTrap`, `useEscapeKey`: Already battle-tested hooks imported in current wizard

### Established Patterns
- Portal rendering via `createPortal` for modal overlay
- Tauri IPC via `invoke('get_secret'/'set_secret')` with `__TAURI_INTERNALS__` guard
- `useSyncExternalStore` for cross-component reactive state (modules, sidebar)
- Inline CSS objects (not CSS modules or Tailwind) for component-scoped styling

### Integration Points
- `STORAGE_KEY = 'setup-complete'` in localStorage — app shell reads to show/hide wizard
- `getEnabledModules()` / `setEnabledModules()` — sidebar module visibility
- `'mc-demo-mode'` localStorage key — Phase 1 sets on Skip to Demo, Phase 4 wires app shell to read it

</code_context>

<specifics>
## Specific Ideas

- Services come BEFORE module selection — this is a deliberate reversal of current flow. Configure first, then choose what to show
- Supabase gets its own custom component even though it has fields like other services — it's the auth foundation
- Error banner at step top (not inline) for test failures — should be prominent and unmissable
- Clickable progress dots for visited steps creates a non-linear navigation escape hatch without bypassing test gates

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-wizard-state-foundation*
*Context gathered: 2026-03-19*
