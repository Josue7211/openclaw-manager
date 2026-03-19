# Phase 1: Wizard State Foundation - Research

**Researched:** 2026-03-19
**Domain:** React multi-step wizard state management, Tauri keychain IPC, localStorage persistence
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| FLOW-01 | User can navigate forward and back without losing entered values | Lifted state in parent, each step reads from shared map — no re-mount data loss |
| FLOW-02 | User sees a progress indicator showing current step and total steps | `ProgressDots` component already exists; needs label showing "Step N of M" text |
| FLOW-03 | User can skip to demo mode from any step | Global "Skip to Demo" button in wizard shell, sets `isDemoMode` flag + closes wizard |
| FLOW-04 | Pre-existing values from .env.local / OS keychain are pre-filled on first mount | Tauri `invoke('get_secret', {key})` on wizard open; env vars already in VITE_ prefix for Supabase, backend env for others |
| FLOW-05 | Field entries saved to OS keychain when clicking Next | `invoke('set_secret', {key, value})` — already called in `saveAndNext` in existing `StepServiceGroup` |
| FLOW-06 | Wizard remembers which steps were completed if user closes and reopens | `localStorage` persisted step index + `completedSteps: Set<number>` inside `useLocalStorageState` |
| FLOW-07 | User cannot proceed until current step's connection test passes (Skip to Demo always available) | `testStatus === 'ok'` gates Next; `skipToDemo` always rendered |
| FLOW-08 | If values are pre-filled, wizard auto-tests on mount and enables Next immediately on success | `useEffect` after keychain load triggers `testConnection()` when all required fields are non-empty |
</phase_requirements>

---

## Summary

Phase 1 is a **state machine refactor** of the existing `OnboardingWelcome.tsx` wizard. The current wizard is already structurally sound — it has the right steps, the `SERVICE_GROUPS` field definitions, the `ProgressDots` component, keychain IPC via Tauri `invoke`, and a `useRef` guard against double-loading. The critical flaw is that each step component owns its own local `useState` for field values. When the user goes back and then forward, the step component unmounts and remounts, resetting all entered values to empty.

The fix is to lift all field values into the parent wizard component as a single `Record<string, string>` map keyed by `keychainKey`. Steps receive their slice of this map as props along with setter callbacks. Additionally, the wizard needs to persist the current step index to `localStorage` (so "close and reopen" resumes mid-wizard per FLOW-06), wire up a global "Skip to Demo" button visible on every step (FLOW-03), and enforce the "Next disabled until test passes" gate (FLOW-07) with auto-test on pre-fill (FLOW-08).

The approach is a **full rewrite** of the wizard orchestration layer (the main component and step coordination), while preserving reusable sub-components: `SERVICE_GROUPS`, `ProgressDots`, `TestResult`, `ModuleToggleRow`, and all the field rendering logic. This avoids rebuilding from scratch while producing a clean state foundation that the remaining phases (Supabase, service config, demo mode, polish) will build on.

**Primary recommendation:** Lift all field values into one `Record<string, string>` in the parent wizard, persist wizard progress to `localStorage` with `useLocalStorageState`, and add a global `onSkipToDemo` callback threaded through every step's props.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 19.2.4 | Component model, `useState`, `useEffect`, `useCallback`, `useRef` | Project stack — no alternative |
| `@tauri-apps/api` | 2.10.1 | `invoke('get_secret')` / `invoke('set_secret')` for keychain IPC | Only way to call Rust commands from frontend |
| `useLocalStorageState` | internal | Persist wizard step index + completed steps across closes | Already exists in `frontend/src/lib/hooks/useLocalStorageState.ts` |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `lucide-react` | 0.577.0 | Icons (ChevronLeft, ChevronRight, SkipForward, CheckCircle, Loader2) | All icon usage — already imported in wizard |
| `@testing-library/react` | 16.3.2 | Component tests for wizard state transitions | Writing unit tests for FLOW-01 through FLOW-08 |
| `vitest` | 4.1.0 | Test runner | Project standard — `cd frontend && npx vitest run` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Lifted `Record<string,string>` | `useReducer` with a wizard state machine | `useReducer` is cleaner at scale but adds boilerplate for 8 fields; plain `useState` is sufficient here |
| `useLocalStorageState` for step | `sessionStorage` | sessionStorage resets on tab close; localStorage survives until explicit clear — correct for FLOW-06 |
| Tauri `invoke` for keychain | Direct env var reads | Env vars are not available to frontend JS except VITE_ prefix; keychain is the only correct path for secrets |

**Installation:** No new packages needed. All dependencies already in `frontend/package.json`.

---

## Architecture Patterns

### Recommended Project Structure

```
frontend/src/components/
├── OnboardingWelcome.tsx     # Full rewrite — wizard shell only
└── onboarding/               # New subdirectory for extracted step components
    ├── types.ts              # WizardState, StepProps, TestStatus, FieldDef, ServiceGroupDef
    ├── constants.ts          # SERVICE_GROUPS (moved from OnboardingWelcome.tsx)
    ├── useWizardState.ts     # Custom hook — all state logic extracted here
    ├── StepWelcome.tsx       # Unchanged from current
    ├── StepModuleSelection.tsx  # Receives enabledModules + setEnabledModules as props
    ├── StepSupabase.tsx      # Receives fieldValues + setField + testStatus as props
    ├── StepServiceGroup.tsx  # Receives fieldValues + setField + testStatus as props
    ├── StepDone.tsx          # Receives summary info as props
    └── shared/
        ├── ProgressDots.tsx  # Extracted (already exists inline)
        ├── TestResult.tsx    # Extracted (already exists inline)
        └── styles.ts         # Shared CSS-in-JS constants (wizardInput, primaryBtn, etc.)
```

**Judgment call:** The current file is 1082 lines. Splitting into subdirectory is justified for a full rewrite and makes each step independently testable. However, the planner may choose to keep everything in one file if the rewrite is scoped tightly. The `useWizardState` extraction is the most important part — it separates concerns regardless of file layout.

### Pattern 1: Lifted Field State

**What:** A single `Record<string, string>` lives in the parent wizard (or `useWizardState` hook). Steps receive `fieldValues` and `setField(key, value)` as props. Steps never own their own field state.

**When to use:** Any time two or more steps share data, or a step that can be navigated away from needs to preserve its values.

**Example:**

```typescript
// In useWizardState.ts (or OnboardingWelcome.tsx)
const [fieldValues, setFieldValues] = useState<Record<string, string>>({})

const setField = useCallback((key: string, value: string) => {
  setFieldValues(prev => ({ ...prev, [key]: value }))
}, [])

// Step receives:
// <StepServiceGroup
//   group={group}
//   fieldValues={fieldValues}
//   setField={setField}
//   testStatus={testStatuses[group.id]}
//   onNext={next}
//   onBack={back}
//   onSkipToDemo={skipToDemo}
// />
```

### Pattern 2: Per-Step Test Status Map

**What:** Rather than each step owning `testStatus` state, the parent maintains `testStatuses: Record<string, TestStatus>` keyed by service group ID (e.g. `{ bluebubbles: 'ok', openclaw: 'idle' }`). This allows the parent to know which steps have passed, enabling the progress indicator to show completed steps.

**When to use:** Wizard needs to enforce gating (FLOW-07) and show completion marks on the progress indicator.

**Example:**

```typescript
const [testStatuses, setTestStatuses] = useState<Record<string, TestStatus>>({})

const setTestStatus = useCallback((stepId: string, status: TestStatus) => {
  setTestStatuses(prev => ({ ...prev, [stepId]: status }))
}, [])
```

### Pattern 3: Wizard Persistence via localStorage

**What:** Step index and completed steps set are persisted to `localStorage` using `useLocalStorageState`. On wizard re-open, the user resumes from where they left off.

**When to use:** FLOW-06 — wizard remembers progress.

**Example:**

```typescript
// Source: frontend/src/lib/hooks/useLocalStorageState.ts
const [savedStep, setSavedStep] = useLocalStorageState<number>('wizard-step', 0)
const [completedSteps, setCompletedSteps] = useLocalStorageState<number[]>('wizard-completed', [])
```

**Critical:** Reset both keys when the wizard finishes (user clicks "Get Started") or when `resetSetupWizard()` is called.

### Pattern 4: Keychain Pre-fill + Auto-Test

**What:** On wizard open (not on every step mount), load all known keychain keys in a single batched `Promise.all`. Store results into `fieldValues`. If all required fields for the current step are non-empty after loading, trigger `testConnection()` automatically.

**When to use:** FLOW-04 (pre-fill) and FLOW-08 (auto-test on pre-fill).

**Example:**

```typescript
// Load all keychain values once when wizard opens
useEffect(() => {
  if (!window.__TAURI_INTERNALS__) return
  import('@tauri-apps/api/core').then(({ invoke }) => {
    const allKeys = SERVICE_GROUPS.flatMap(g => g.fields.map(f => f.keychainKey))
    Promise.all(
      allKeys.map(key =>
        invoke<string | null>('get_secret', { key })
          .then(v => ({ key, value: v }))
          .catch(() => ({ key, value: null }))
      )
    ).then(results => {
      const loaded: Record<string, string> = {}
      for (const r of results) {
        if (r.value) loaded[r.key] = r.value
      }
      setFieldValues(prev => ({ ...loaded, ...prev })) // don't overwrite user-entered values
    })
  })
}, []) // run once on wizard mount
```

### Pattern 5: Skip to Demo

**What:** A "Skip to Demo" button is rendered in the wizard shell footer (not inside individual steps). Clicking it calls a `skipToDemo` function that sets `localStorage.setItem('demo-mode', 'true')`, calls `dismiss()`, and fires `onClose?.()`. This gives every step access to demo-mode without threading through step components.

**When to use:** FLOW-03 — visible on any step.

**Implementation note:** Check how demo mode is currently detected in the app (appears to be `VITE_SUPABASE_URL` absence). The wizard needs to set a flag that the app reads. A dedicated `localStorage` key like `'mc-demo-mode'` is the clean approach.

### Pattern 6: Next-Button Gate

**What:** The Next button in the wizard shell is disabled when `currentStepRequiresTest && testStatuses[currentStepId] !== 'ok'`. Steps that don't have a `testKey` (e.g. Welcome, Module Selection) never gate.

**Example:**

```typescript
const stepRequiresTest = currentGroup?.testKey !== undefined
const nextEnabled = !stepRequiresTest || testStatuses[currentGroup?.id ?? ''] === 'ok'

<button
  onClick={next}
  disabled={!nextEnabled}
  style={{ ...primaryBtn, opacity: nextEnabled ? 1 : 0.5, cursor: nextEnabled ? 'pointer' : 'not-allowed' }}
  aria-disabled={!nextEnabled}
>
  Next <ChevronRight size={14} />
</button>
```

### Anti-Patterns to Avoid

- **Per-step `useState` for field values:** The root cause of FLOW-01 failing in the current code. Each step's local `useState` resets on unmount.
- **Loading keychain values inside step `useEffect`:** If this runs on each step mount, Back navigation re-fetches and overwrites user edits. Load once at wizard open.
- **`isDemoMode` as React state only:** Demo mode must outlive the wizard's React state. It must be a `localStorage` flag so the app shell can read it after the wizard unmounts.
- **Calculating `totalSteps` inside `renderStep`:** `activeGroups` (filtered by enabled modules) must be calculated before rendering steps, and only recalculated when module selection changes — not on every render. The current code uses `useMemo` with `[step]` as dep, which is a functional workaround; the rewrite should track this more explicitly.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Persisting wizard step to storage | Custom serialization/deserialization | `useLocalStorageState` from `lib/hooks/` | Already handles parse errors and default values |
| Debouncing auto-test trigger | Custom timer | Run auto-test in the same `useEffect` that fires after keychain load | No user input involved — just fire immediately after load completes |
| Focus management in dialog | Custom tabindex logic | `useFocusTrap` from `lib/hooks/` | Already handles Tab wrap-around; already used in current wizard |
| Escape to close | Manual `keydown` listener | `useEscapeKey` from `lib/hooks/` | Already imported and used in current wizard |
| Batching keychain reads | Sequential `await` calls | `Promise.all(keys.map(invoke))` | O(n) sequential waits would be 8+ RTTs vs. concurrent |

**Key insight:** This phase is a refactor, not a ground-up build. The existing helpers, components, and IPC patterns are correct — the only structural problem is state ownership.

---

## Common Pitfalls

### Pitfall 1: Step Unmount Resets useState

**What goes wrong:** User fills in BlueBubbles host, clicks Back to module selection, then clicks Next. The BlueBubbles fields are empty.

**Why it happens:** `StepServiceGroup` remounts fresh; its `useState<Record<string, string>>({})` initializes to empty. The `useRef(loadedRef)` guard means the keychain reload doesn't fire again.

**How to avoid:** All field values live in the parent. Steps receive values as props. Steps call parent setter — never local state for field values.

**Warning signs:** Any `useState` for `values` / `fields` inside a step component.

---

### Pitfall 2: Keychain Load Overwrites User Edits on Back Navigation

**What goes wrong:** User types a new URL for BlueBubbles, goes back, comes forward. The keychain value (old URL) is re-fetched and overwrites the edit.

**Why it happens:** Keychain load is inside a step `useEffect` with `loadedRef` guarding, but if the ref is per-step instance, a new instance gets a fresh ref.

**How to avoid:** Batch-load all keychain values once when the wizard opens. Use `setFieldValues(prev => ({ ...loaded, ...prev }))` — this means user-entered values (already in `prev`) take precedence over keychain values.

**Warning signs:** Keychain load inside any step `useEffect`.

---

### Pitfall 3: FRONTEND_BLOCKED_KEYS

**What goes wrong:** `invoke('get_secret', { key: 'bluebubbles.password' })` returns `null` even if the key is set in the keychain.

**Why it happens:** `secrets.rs` has a `FRONTEND_BLOCKED_KEYS` list that includes `bluebubbles.password`, `openclaw.password`, `openclaw.api-key`, `openclaw.ws`, and most other secrets. These return `None` to the frontend by design.

**How to avoid:** Blocked keys will return null — the wizard should pre-fill what it can (non-blocked keys like `bluebubbles.host`, `openclaw.api-url`) and leave blocked fields blank, showing them as "configured (hidden)" if the `get_secret` call returned null but a connection test passes. Do not try to work around the block.

**Readable keys (not blocked):** `bluebubbles.host`, `openclaw.api-url`, `supabase.url`, `caldav.url`, `caldav.username`, `proxmox.host`, `proxmox.token-id`, `plex.url`, `sonarr.url`, `radarr.url`, `email.host`, `email.port`, `email.user`, `caldav.url`, `ntfy.url`, `ntfy.topic`, `mac-bridge.host`.

**Blocked keys (returns null):** `bluebubbles.password`, `openclaw.password`, `openclaw.api-key`, `openclaw.ws`, `anthropic.api-key`, all token/secret fields.

---

### Pitfall 4: `activeGroups` Recalculation Timing

**What goes wrong:** User selects modules in step 1, clicks Next. `activeGroups` still reflects the pre-selection state, so the wrong service steps are shown.

**Why it happens:** The current code uses `useMemo(() => ..., [step])` — recalculating when the step index changes, which is a workaround. In the rewrite, module selection must update a dedicated `enabledModules` state in the parent, and `activeGroups` must be derived from that.

**How to avoid:** Parent holds `enabledModules: string[]` as state. `StepModuleSelection` receives it as a prop and calls a setter. `activeGroups` is `useMemo(() => ..., [enabledModules])`.

---

### Pitfall 5: Demo Mode Not Surviving Wizard Unmount

**What goes wrong:** User clicks "Skip to Demo". The wizard closes. App shell still shows the real login screen because demo mode flag was only in React state that is now gone.

**Why it happens:** Demo mode is a cross-component concern that spans wizard → app shell → all pages.

**How to avoid:** Demo mode must be `localStorage`. Check the existing demo detection pattern in `lib/demo-data.ts` — it exports `DEMO_TODOS`, `DEMO_MISSIONS` etc. but the activation flag needs to be a `localStorage` key that the app shell reads on mount. The wizard sets this key; the app shell reads it. The current code uses `VITE_SUPABASE_URL` absence as the proxy for demo detection — a dedicated `'mc-demo-mode'` key is cleaner.

**Note for planner:** FLOW-03 says "Skip to Demo" closes the wizard into demo mode. Demo mode activation logic (the `localStorage` key name and how the app shell reads it) may need coordination with Phase 4 (Demo Mode phase), but the wizard must at least close and set the flag.

---

### Pitfall 6: `saveAndNext` Saves to Supabase via API — Requires Auth

**What goes wrong:** In the current `StepServiceGroup.saveAndNext`, after keychain save it calls `api.put('/api/secrets/${svc.name}', ...)`. This endpoint requires auth (`RequireAuth`). During onboarding, the user is not yet authenticated.

**Why it happens:** The wizard was designed assuming Supabase auth would be done in step 2, but the current flow has service steps before auth is complete.

**How to avoid:** In Phase 1, only save to the OS keychain (the `invoke('set_secret')` call). Skip the `api.put` to `/api/secrets/:service` until Phase 3 (when we know auth context is resolved). The keychain save is sufficient for the wizard to function; Supabase sync happens later.

---

### Pitfall 7: `window.__TAURI_INTERNALS__` Guard in Browser Dev Mode

**What goes wrong:** `invoke` calls throw or return undefined when running `npm run dev` in the browser (not via `cargo tauri dev`).

**Why it happens:** Tauri IPC is only available when running inside the Tauri webview. Browser mode (`localhost:5173`) has no `__TAURI_INTERNALS__`.

**How to avoid:** Always guard keychain calls with `if (!window.__TAURI_INTERNALS__) return`. The current code already does this — preserve it in the rewrite. In browser dev mode, the wizard should still render and be navigable; fields just won't pre-fill.

---

## Code Examples

### Wizard State Hook Structure

```typescript
// Source: analysis of frontend/src/lib/hooks/useLocalStorageState.ts + existing OnboardingWelcome.tsx

export interface WizardState {
  fieldValues: Record<string, string>      // keychainKey -> value
  testStatuses: Record<string, TestStatus> // groupId -> status
  testErrors: Record<string, string>       // groupId -> error message
  enabledModules: string[]
  currentStep: number
  completedSteps: number[]
}

export function useWizardState() {
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({})
  const [testStatuses, setTestStatuses] = useState<Record<string, TestStatus>>({})
  const [testErrors, setTestErrors] = useState<Record<string, string>>({})
  const [enabledModules, setEnabledModules] = useState<string[]>(() => getEnabledModules())

  // Persisted across closes (FLOW-06)
  const [currentStep, setCurrentStep] = useLocalStorageState<number>('wizard-step', 0)
  const [completedSteps, setCompletedSteps] = useLocalStorageState<number[]>('wizard-completed', [])

  const setField = useCallback((key: string, value: string) => {
    setFieldValues(prev => ({ ...prev, [key]: value }))
    // Reset test status for the group that owns this field
    // (find group by field key, reset its testStatus)
  }, [])

  const setTestStatus = useCallback((groupId: string, status: TestStatus, error?: string) => {
    setTestStatuses(prev => ({ ...prev, [groupId]: status }))
    setTestErrors(prev => ({ ...prev, [groupId]: error ?? '' }))
  }, [])

  return { fieldValues, setField, testStatuses, setTestStatus, testErrors,
           enabledModules, setEnabledModules, currentStep, setCurrentStep,
           completedSteps, setCompletedSteps }
}
```

### Keychain Batch Load

```typescript
// Source: analysis of existing StepServiceGroup keychain load + secrets.rs FRONTEND_BLOCKED_KEYS

useEffect(() => {
  if (!window.__TAURI_INTERNALS__) return
  // Only load keys that are NOT in FRONTEND_BLOCKED_KEYS
  // (blocked keys return null anyway, but skip the network round-trip)
  const loadableKeys = SERVICE_GROUPS
    .flatMap(g => g.fields)
    .filter(f => !f.secret) // blocked keys are all secret fields
    .map(f => f.keychainKey)

  import('@tauri-apps/api/core').then(({ invoke }) => {
    Promise.all(
      loadableKeys.map(key =>
        invoke<string | null>('get_secret', { key })
          .then(v => ({ key, value: v }))
          .catch(() => ({ key, value: null }))
      )
    ).then(results => {
      const loaded: Record<string, string> = {}
      for (const r of results) {
        if (r.value) loaded[r.key] = r.value
      }
      setFieldValues(prev => ({ ...loaded, ...prev })) // prev (user edits) take priority
    })
  })
}, []) // Once on wizard mount only
```

### Progress Indicator with Step Label

```typescript
// Current ProgressDots only shows dots with no text label.
// FLOW-02 requires "which step they are on out of the total".
// Enhance to include a label above the dots:

function ProgressIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
        Step {current + 1} of {total}
      </span>
      <ProgressDots current={current} total={total} />
    </div>
  )
}
```

### Skip to Demo Button in Wizard Shell

```typescript
// Rendered in the wizard footer on every step except the Welcome step
// (Welcome step has its own "Try Demo" button per DEMO-01 in Phase 4)

{step > 0 && (
  <button
    onClick={onSkipToDemo}
    style={skipBtn}
    aria-label="Skip setup and enter demo mode"
  >
    <SkipForward size={12} /> Skip to Demo
  </button>
)}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Steps own local field state (`useState` in step) | Lifted state in parent wizard | This phase | FLOW-01: Back/forward no longer loses values |
| Keychain load per-step-mount | Batch load once on wizard open | This phase | FLOW-04: Pre-fill once, user edits survive navigation |
| No persistence across wizard sessions | `useLocalStorageState` for step + completedSteps | This phase | FLOW-06: Close/reopen resumes progress |
| Next always enabled | Next gated on `testStatus === 'ok'` | This phase | FLOW-07: Enforced connection test before advance |
| No auto-test | Auto-test after keychain pre-fill if all fields present | This phase | FLOW-08: Pre-filled steps advance without manual test click |

**Deprecated/outdated:**
- Per-step `loadedRef` + step-level keychain `useEffect`: Replaced by single wizard-open batch load.
- `useMemo(() => activeGroups, [step])` hack: Replaced by `useMemo(() => activeGroups, [enabledModules])`.

---

## Open Questions

1. **Demo mode activation flag name and app-shell integration**
   - What we know: The app uses `VITE_SUPABASE_URL` absence to determine demo mode in some places; `lib/demo-data.ts` provides mock data.
   - What's unclear: There is no explicit `'mc-demo-mode'` `localStorage` key that the app shell reads. Phase 4 owns demo mode fully, but Phase 1 needs to define the flag it sets on "Skip to Demo".
   - Recommendation: Phase 1 sets `localStorage.setItem('mc-demo-mode', 'true')` and documents it. Phase 4 wires up the app shell to read it. The planner should note this dependency.

2. **Supabase step pre-fill**
   - What we know: `supabase.url` is readable from keychain (not blocked). `supabase.anon-key` is in FRONTEND_BLOCKED_KEYS — cannot be read by frontend.
   - What's unclear: FLOW-04 says "pre-filled from .env.local or OS keychain". The current StepSupabase reads `import.meta.env.VITE_SUPABASE_URL` (VITE_ prefix). This env var is compiled into the bundle — not a runtime value. In the keychain model, there is `supabase.url` and `supabase.anon-key`.
   - Recommendation: Pre-fill `supabase.url` from keychain. Leave `supabase.anon-key` blank (blocked). Show "configured (hidden)" badge if the connection test endpoint responds successfully. Supabase step is Phase 2 — Phase 1 only needs the framework; the planner should note that SUPA-04 (pre-filled values auto-test) is Phase 2.

3. **`/api/status/connections` auth requirement during wizard**
   - What we know: The endpoint requires `RequireAuth` (MFA enforced). During onboarding the user has no session.
   - What's unclear: How does the existing wizard test connections? It calls `api.get('/api/status/connections')` without auth — this must be erroring silently.
   - Recommendation: Phase 1 should stub out or defer connection tests. The test button can be shown but the `TestStatus` gating for FLOW-07 should use a mock/passthrough result for Phase 1. Phase 3 resolves the pre-auth connection test problem properly. The planner should mark FLOW-07 as "partial implementation" in Phase 1 — the gate mechanism is in place but the actual test API will be fixed in Phase 3.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.0 |
| Config file | `frontend/vitest.config.ts` |
| Quick run command | `cd frontend && npx vitest run src/lib/__tests__/` |
| Full suite command | `cd frontend && npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FLOW-01 | Back/forward navigation preserves field values | unit | `cd frontend && npx vitest run src/components/__tests__/useWizardState.test.ts -t "field values survive"` | Wave 0 |
| FLOW-02 | Progress indicator shows current step and total | unit | `cd frontend && npx vitest run src/components/__tests__/useWizardState.test.ts -t "progress"` | Wave 0 |
| FLOW-03 | Skip to Demo available on every non-welcome step | unit | `cd frontend && npx vitest run src/components/__tests__/useWizardState.test.ts -t "skip to demo"` | Wave 0 |
| FLOW-04 | Fields pre-filled from keychain on mount | unit | `cd frontend && npx vitest run src/components/__tests__/useWizardState.test.ts -t "pre-fill"` | Wave 0 |
| FLOW-05 | Keychain save called on Next | unit | `cd frontend && npx vitest run src/components/__tests__/useWizardState.test.ts -t "keychain save"` | Wave 0 |
| FLOW-06 | Step index persisted to localStorage | unit | `cd frontend && npx vitest run src/components/__tests__/useWizardState.test.ts -t "persistence"` | Wave 0 |
| FLOW-07 | Next disabled when test not passed | unit | `cd frontend && npx vitest run src/components/__tests__/useWizardState.test.ts -t "next gated"` | Wave 0 |
| FLOW-08 | Auto-test fires after pre-fill | unit | `cd frontend && npx vitest run src/components/__tests__/useWizardState.test.ts -t "auto-test"` | Wave 0 |

### Sampling Rate

- **Per task commit:** `cd frontend && npx vitest run src/components/__tests__/useWizardState.test.ts`
- **Per wave merge:** `cd frontend && npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `frontend/src/components/__tests__/useWizardState.test.ts` — covers FLOW-01 through FLOW-08
- [ ] `frontend/src/components/onboarding/types.ts` — shared type definitions needed before tests can import

*(Existing test infrastructure in `frontend/src/lib/__tests__/` fully operational. Only the new wizard-specific test file is missing.)*

---

## Sources

### Primary (HIGH confidence)

- Direct code analysis of `frontend/src/components/OnboardingWelcome.tsx` (1082 lines, current wizard implementation)
- Direct code analysis of `src-tauri/src/secrets.rs` (FRONTEND_BLOCKED_KEYS, FRONTEND_WRITABLE_KEYS, Tauri commands)
- Direct code analysis of `frontend/src/lib/hooks/useLocalStorageState.ts`
- Direct code analysis of `frontend/src/lib/modules.ts` (useSyncExternalStore pattern)
- `frontend/package.json` — confirmed Vitest 4.1.0, @testing-library/react 16.3.2, @tauri-apps/api 2.10.1
- `.planning/REQUIREMENTS.md` — FLOW-01 through FLOW-08 requirements
- `.planning/STATE.md` — full rewrite approved, state machine must be rebuilt

### Secondary (MEDIUM confidence)

- `frontend/src/lib/__tests__/modules.test.ts` — test patterns for module-level localStorage state (used as template for wizard state tests)

### Tertiary (LOW confidence)

- None — all findings are grounded in direct code inspection of this codebase.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified from `package.json` and existing imports
- Architecture: HIGH — derived from direct analysis of the existing 1082-line wizard; patterns are grounded in what already works
- Pitfalls: HIGH — FRONTEND_BLOCKED_KEYS is a hard finding from `secrets.rs`; the per-step useState reset is the documented root cause

**Research date:** 2026-03-19
**Valid until:** 2026-04-19 (stable React/Tauri patterns; keychain blocklist only changes if `secrets.rs` is edited)
