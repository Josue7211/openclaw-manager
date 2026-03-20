# Phase 3: Setup Wizard + Onboarding - Research

**Researched:** 2026-03-19
**Domain:** Multi-step setup wizard, connection testing, guided tour, animation, demo mode
**Confidence:** HIGH

## Summary

Phase 3 rewrites the existing ~1078-line `OnboardingWelcome.tsx` from scratch as a full-screen linear wizard with 10 steps, demo mode with guided tour, and celebration animations. The existing code provides valuable reference for service field layouts, keychain integration patterns, and connection test flows, but its state management (plain `useState`, no persistence, no resume) must be completely replaced with a `useSyncExternalStore` pattern matching the project's established conventions in `theme-store.ts`, `sidebar-settings.ts`, and `modules.ts`.

The most significant architectural challenge is that the existing connection test endpoint (`/api/status/connections`) requires `RequireAuth` (a user session), but the wizard runs BEFORE the user has logged in. This means the wizard needs new dedicated backend endpoints that accept credentials as request body parameters and test connections without requiring a session. The Tailscale detection can use the existing `tailscale.rs` module via a new unauthenticated Tauri IPC command or a new API endpoint exempted from session auth.

The UI contract (03-UI-SPEC.md) is exceptionally detailed -- it specifies exact pixel dimensions, animation timings, color values, and accessibility requirements. The implementation should follow it precisely as the design contract.

**Primary recommendation:** Build the wizard state store first (matching `useSyncExternalStore` pattern), then the backend connection test endpoints (wizard-specific, no session required), then the step components, then demo mode and guided tour, and finally animations and polish.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Full-screen takeover wizard replaces entire app until done
- Linear step order: Welcome -> Tailscale -> Supabase -> OpenClaw -> Mac Services -> Server Services -> Modules -> Theme -> Summary -> Done
- Step dots progress indicator (filled for completed, outlined for upcoming)
- Skip button on every step; 3 required services are hard gates (Tailscale, Supabase, OpenClaw)
- First-run only (no `setup-complete` in localStorage); returning users go straight to login
- Resumable wizard state persisted in localStorage
- Tailscale is a hard requirement for remote services
- Mac Services and Server Services are optional, skippable
- Module selection with preset bundles (Essentials, Full Setup, Minimal) + card grid to fine-tune
- Simplified theme grid: 8 popular presets with live preview (WYSIWYG)
- Light/Dark/System mode toggle
- Demo mode available on every step; user can jump between demo and wizard seamlessly
- Interactive guided tour with tooltips; user-driven (click to advance)
- Summary screen with confetti celebration
- "Re-run Walkthrough" button in Settings -> Connections
- Animation intensity setting: Full / Reduced / None; respects prefers-reduced-motion
- Morphing card step transitions (specified in UI-SPEC)
- Logo reveal via radial clip-path wipe

### Claude's Discretion
- Exact step transition animation -> DECIDED in UI-SPEC: morphing card (scale + fade + height morph)
- Logo reveal animation style -> DECIDED in UI-SPEC: radial clip-path wipe with glow halo
- Celebration animation specifics -> DECIDED in UI-SPEC: canvas-confetti burst
- How to structure the guided tour tooltip system -> DECIDED in UI-SPEC: portal tooltip with clip-path spotlight cutout
- Card grid layout details -> DECIDED in UI-SPEC: `repeat(auto-fill, minmax(200px, 1fr))`
- Which 6-8 theme presets -> DECIDED in UI-SPEC: Default Dark, Dracula, Nord, Catppuccin Mocha, Default Light, Solarized Light, Catppuccin Latte, Rose Pine
- How to dim unavailable modules -> DECIDED in UI-SPEC: `opacity: 0.45` on card, toggle disabled

### Deferred Ideas (OUT OF SCOPE)
- User management (happens in-app after setup, not in wizard)
- Advanced theme customization in wizard (full picker is Phase 2; wizard uses simplified 6-8 presets)
- Service auto-discovery (automatically detect services on tailnet)
- App-wide animation system (the intensity toggle affects the whole app but infrastructure is cross-cutting)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| WIZARD-01 | First-run detection triggers setup wizard automatically | `setup-complete` localStorage key; existing pattern in `OnboardingWelcome.tsx` line 9; integration point in `LayoutShell.tsx` (lazy-loaded `OnboardingWelcome`); also `check_first_run()` Tauri command in `secrets.rs` |
| WIZARD-02 | Service connection step (BlueBubbles, OpenClaw, Supabase, CouchDB, Mac Bridge -- each optional) | Existing connection test endpoints in `status.rs` (requires auth); wizard needs new unauthenticated test endpoints; keychain keys defined in `secrets.rs`; field patterns from `SettingsConnections.tsx` |
| WIZARD-03 | Module selection step (enable/disable from available modules) | `APP_MODULES` array in `modules.ts` (17 modules); `setEnabledModules()` and `getEnabledModules()` API; `nav-items.ts` has Phosphor icons per module; preset bundle definitions in UI-SPEC |
| WIZARD-04 | Theme selection step (pick from presets, choose light/dark/system) | `BUILT_IN_THEMES` in `theme-definitions.ts` (17 presets); `setActiveTheme()` and `setMode()` from `theme-store.ts`; UI-SPEC selects 8 presets for wizard |
| WIZARD-05 | Demo mode option for users without infrastructure | Existing `isDemoMode()` in `demo-data.ts` (checks `VITE_SUPABASE_URL`); `DemoModeBanner.tsx`; demo data already exists for todos, missions, calendar; wizard needs `demo-mode` localStorage key independent of env var |
| WIZARD-06 | Setup can be skipped and completed later via Settings | Existing "Re-run Setup" button in `SettingsConnections.tsx` line 281-290; `resetSetupWizard()` function; "Skip setup" link on Welcome screen |
| WIZARD-07 | Progressive disclosure (collapse advanced options) | Expandable guide panels on each service step (UI-SPEC defined); collapsible service cards in Mac Services step; preset bundles simplify module selection |
| WIZARD-08 | Setup state persisted so interrupted wizard resumes where user left off | `useSyncExternalStore` pattern (theme-store, sidebar-settings); localStorage key `wizard-state`; state shape defined in UI-SPEC |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React 18 | 18.x | UI framework | Already in project |
| useSyncExternalStore | React 18 built-in | Wizard state management | Project's established pattern for theme-store, sidebar-settings, modules, keybindings |
| canvas-confetti | ^1.9 | Celebration animation on wizard completion | ~6KB, zero deps, 5M+ weekly npm downloads, renders to temporary canvas. Specified in UI-SPEC |
| Phosphor Icons | @phosphor-icons/react | Step icons, module icons, navigation | Already in project; nav-items.ts maps icons to modules |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @tauri-apps/api/core | 2.x | OS keychain access via `invoke('get_secret')` / `invoke('set_secret')` | Credential storage during wizard, Tailscale detection |
| React Router | 6.x | Navigation after wizard completes | Already in project; `useNavigate()` for dashboard transition |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| canvas-confetti | react-canvas-confetti | React wrapper adds complexity; raw canvas-confetti is simpler for a one-time burst |
| Custom tour system | react-joyride / react-tourlight | External libraries add 20-50KB and may conflict with the project's custom CSS variable system; hand-built tour with portal + clip-path is more maintainable |
| useSyncExternalStore | useReducer + localStorage | Would break consistency with the 4 other stores in the project; useSyncExternalStore handles concurrent renders safely |

**Installation:**
```bash
cd frontend && npm install canvas-confetti && npm install -D @types/canvas-confetti
```

## Architecture Patterns

### Recommended Project Structure
```
frontend/src/
├── components/
│   ├── SetupWizard.tsx           # Full-screen wizard shell: dots, transitions, navigation
│   ├── wizard/
│   │   ├── WizardStepDots.tsx    # Step progress indicator (10 dots)
│   │   ├── WizardWelcome.tsx     # Welcome + logo reveal + Get Started / Try Demo
│   │   ├── WizardTailscale.tsx   # Tailscale connectivity check
│   │   ├── WizardSupabase.tsx    # Supabase URL + anon key + test
│   │   ├── WizardOpenClaw.tsx    # OpenClaw URL + API key + test
│   │   ├── WizardMacServices.tsx # BlueBubbles + Mac Bridge (optional)
│   │   ├── WizardServerServices.tsx # CouchDB (optional)
│   │   ├── WizardModules.tsx     # Preset bundles + module card grid
│   │   ├── WizardTheme.tsx       # 8-preset grid + light/dark/system
│   │   ├── WizardSummary.tsx     # Recap + confetti + tour prompt
│   │   ├── WizardGuidePanel.tsx  # Reusable expandable setup instructions
│   │   └── WizardConnectionTest.tsx # Reusable test button + inline result
│   ├── GuidedTour.tsx            # Tour overlay with spotlight cutout
│   └── tour/
│       └── TourTooltip.tsx       # Positioned tooltip with arrow
├── hooks/
│   ├── useWizardState.ts         # useSyncExternalStore wizard state
│   └── useAnimationIntensity.ts  # useSyncExternalStore animation pref
├── lib/
│   └── wizard-store.ts           # Wizard state store (external store pattern)
```

### Pattern 1: Wizard State Store (useSyncExternalStore)

**What:** Centralized wizard state following the exact pattern of `theme-store.ts` -- module-level `_state`, `_listeners`, `persist()`, `mutate()`, `subscribe()`, `getSnapshot()`.

**When to use:** All wizard step components read/write through this store.

**Example:**
```typescript
// Source: Matches theme-store.ts pattern (verified in codebase)
const STORAGE_KEY = 'wizard-state'

interface WizardState {
  currentStep: number
  completedSteps: number[]   // Use array, not Set (JSON serialization)
  stepStatus: Record<number, 'idle' | 'testing' | 'success' | 'error' | 'skipped'>
  // Credentials (temp, saved to keychain on completion)
  tailscaleIp: string
  supabaseUrl: string
  supabaseAnonKey: string
  openclawUrl: string
  openclawApiKey: string
  blueBubblesUrl: string
  blueBubblesPassword: string
  macBridgeUrl: string
  macBridgeApiKey: string
  couchdbUrl: string
  couchdbUsername: string
  couchdbPassword: string
  // Test results (NOT persisted -- re-run on resume)
  testResults: Record<string, { status: string; latencyMs?: number; error?: string }>
  // Module selection
  enabledModules: string[]
  activeBundle: 'essentials' | 'full' | 'minimal' | null
  // Theme
  selectedThemeId: string
  selectedMode: 'dark' | 'light' | 'system'
}

let _state: WizardState = loadInitialState()
const _listeners = new Set<() => void>()

function persist() {
  // Exclude testResults from persistence (re-run on resume)
  const { testResults, ...persistable } = _state
  localStorage.setItem(STORAGE_KEY, JSON.stringify(persistable))
  _listeners.forEach(fn => fn())
}

// React hook
export function useWizardState() {
  return useSyncExternalStore(subscribe, getWizardState)
}
```

### Pattern 2: Connection Test Without Auth

**What:** New Axum endpoints that accept credentials in the request body and test connections without requiring a `RequireAuth` session. Still protected by `X-API-Key` middleware.

**When to use:** During wizard, before user has logged in.

**Example:**
```rust
// Source: Based on existing test_supabase() in status.rs, adapted for wizard
// New endpoint: POST /api/wizard/test-connection
// Body: { "service": "supabase", "url": "https://...", "key": "..." }
// Returns: { "status": "ok", "latency_ms": 45 } or { "status": "error", "error": "..." }

// This endpoint does NOT use RequireAuth -- only X-API-Key (which the
// frontend has from OS keychain via get_secret('mc-api-key'))
async fn wizard_test_connection(
    State(state): State<AppState>,
    Json(body): Json<WizardTestRequest>,
) -> Result<Json<Value>, AppError> {
    match body.service.as_str() {
        "tailscale" => test_tailscale_connectivity().await,
        "supabase" => test_supabase_direct(&state.http, &body.url, &body.key).await,
        "openclaw" => test_openclaw_direct(&state.http, &body.url, &body.key).await,
        // etc.
        _ => Err(AppError::BadRequest("unknown service".into())),
    }
}
```

### Pattern 3: Morphing Card Step Transition

**What:** CSS transition where outgoing step fades + scales, container height morphs, incoming step fades + scales from opposite direction.

**When to use:** Every step navigation (forward and backward).

**Example:**
```typescript
// Source: UI-SPEC transition specification
// Implementation approach: Use a ref to measure incoming step height,
// animate container height, coordinate opacity/scale with CSS transitions

// The transition container holds both outgoing and incoming content
// with absolute positioning during the transition:
//
// 1. Outgoing: opacity 1->0, scale(1)->scale(0.96), translateY(0)->translateY(8px) -- 200ms
// 2. Container: animate height to new step height -- 250ms, var(--ease-spring)
// 3. Incoming: opacity 0->1, scale(1.04)->scale(1), translateY(-8px)->translateY(0) -- 250ms
//
// Total perceived: ~350ms

// Key: use ResizeObserver or useLayoutEffect to measure new step height
// before starting the transition. Set container height explicitly during
// transition, then remove it after animation completes.
```

### Pattern 4: Spotlight Tour Overlay

**What:** Portal-rendered tooltip + semi-transparent backdrop with clip-path cutout around target element.

**When to use:** Demo mode tour and post-setup tour.

**Example:**
```typescript
// Source: UI-SPEC tour tooltip specification
// The backdrop covers the viewport with rgba(0,0,0,0.3)
// A clip-path polygon creates a rectangular "window" around the target element
// The tooltip is positioned relative to the target using getBoundingClientRect()

interface TourStop {
  id: string
  target: string          // CSS selector
  title: string
  body: string
  placement: 'top' | 'bottom' | 'left' | 'right'
  section?: string        // Tour section for skip-by-section
}

// Spotlight cutout via clip-path polygon:
// clip-path: polygon(
//   0% 0%, 100% 0%, 100% 100%, 0% 100%,   // outer rectangle (full viewport)
//   0% 0%,                                    // return to start
//   X1 Y1, X2 Y1, X2 Y2, X1 Y2, X1 Y1      // inner rectangle (target + 8px padding)
// )
// This creates a "frame" that is clipped everywhere except around the target.
```

### Anti-Patterns to Avoid

- **Using useState for wizard state:** State will be lost on component re-render or unmount. Use useSyncExternalStore with localStorage persistence.
- **Calling existing /api/status/connections from wizard:** Requires RequireAuth session which doesn't exist yet. Use dedicated wizard test endpoints.
- **Storing credentials in localStorage:** Credentials must ONLY be in the wizard state temporarily (which IS localStorage, but is cleaned up on completion) and then saved to OS keychain. Never leave credentials in localStorage after wizard completes.
- **Direct Supabase calls from frontend:** Per CLAUDE.md, "Remove ALL Supabase from frontend, proxy everything through Axum backend."
- **Testing connections with `fetch()` directly from frontend:** The old OnboardingWelcome.tsx does `fetch(\`${testUrl}/rest/v1/\`)` directly. The new wizard MUST go through Axum for all connection tests (security, CORS, credential isolation).
- **Using `window.dispatchEvent()` for cross-component communication:** Per CLAUDE.md, use useSyncExternalStore or event-bus pattern instead.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Confetti animation | Custom particle system | `canvas-confetti` | GPU-accelerated, handles cleanup, well-tested, ~6KB |
| Focus trapping | Custom focus management | `useFocusTrap` hook | Already exists in the project, handles edge cases |
| Toast notifications | Custom notification system | `Toast` component from `components/ui/Toast.tsx` | Phase 1 already built this; handles positioning, auto-dismiss |
| OS keychain access | Custom IPC calls | `invoke('get_secret')` / `invoke('set_secret')` | Existing Tauri commands with allowlists and validation in `secrets.rs` |
| Theme application | Custom CSS injection | `setActiveTheme()` / `setMode()` from `theme-store.ts` | Phase 2 theme engine handles all CSS variable application, including legacy aliases |
| Module enable/disable | Custom localStorage | `setEnabledModules()` from `modules.ts` | Existing reactive store with subscriber pattern |
| Button variants | Custom styled buttons | `Button` from `components/ui/Button.tsx` | Phase 1 established 4-variant hierarchy (primary, secondary, ghost, danger) |
| Tooltip positioning | Manual getBoundingClientRect | Floating UI or manual calculation | For the tour tooltip, manual positioning with `getBoundingClientRect()` + viewport collision detection is appropriate here since we don't want a full library; limit to 4 placements (top, bottom, left, right) |

**Key insight:** The project already has reactive state stores, UI components, keychain integration, and connection test infrastructure. The wizard's job is to orchestrate these existing pieces in a new full-screen flow, not rebuild them.

## Common Pitfalls

### Pitfall 1: Connection Tests Require Auth Session
**What goes wrong:** The wizard calls `/api/status/connections` which requires `RequireAuth`. The request fails with 401 because the user hasn't logged in yet.
**Why it happens:** The existing connection test endpoint was designed for Settings (post-login). The wizard runs pre-login.
**How to avoid:** Create new `POST /api/wizard/test-connection` endpoint(s) that:
  - Accept credentials in the request body
  - Only require `X-API-Key` (not `RequireAuth`)
  - Use the same underlying `reqwest` HTTP client and test logic
  - Are rate-limited to prevent abuse
**Warning signs:** 401 errors when testing connections in the wizard.

### Pitfall 2: Credentials Left in localStorage After Wizard
**What goes wrong:** Wizard state (including URLs, passwords, API keys) persists in localStorage after the wizard completes, creating a security issue.
**Why it happens:** The wizard state is persisted for resume-on-interrupt, and the cleanup step is missed.
**How to avoid:** On wizard completion:
  1. Save all credentials to OS keychain via `invoke('set_secret', ...)`
  2. Delete `wizard-state` from localStorage
  3. Set `setup-complete` in localStorage
  4. Verify no credential-containing keys remain in localStorage
**Warning signs:** Searching localStorage after setup and finding URLs/passwords.

### Pitfall 3: Demo Mode Conflicts with Real isDemoMode()
**What goes wrong:** The existing `isDemoMode()` checks `!import.meta.env.VITE_SUPABASE_URL`. The wizard's demo mode is a user choice, not an env var absence. These two concepts conflict.
**Why it happens:** `isDemoMode()` was designed before the wizard's demo mode existed. They measure different things.
**How to avoid:** The wizard demo mode should:
  - Set `demo-mode: true` in localStorage
  - Create a new `isWizardDemoMode()` function that checks this key
  - Existing `isDemoMode()` continues to check env var for "no backend" mode
  - Components should check both: `isDemoMode() || isWizardDemoMode()`
  - When real setup completes, clear `demo-mode` from localStorage and clean demo data
**Warning signs:** Demo data persisting after real setup, or demo mode activating when env vars are set.

### Pitfall 4: Step Height Measurement During Transition
**What goes wrong:** The morphing card transition animates container height, but the new step's height is unknown until it renders. Measuring before render causes zero-height, measuring after causes a flash.
**Why it happens:** React renders new content asynchronously; you can't measure DOM height before it exists.
**How to avoid:** Use a two-phase approach:
  1. Render the new step offscreen (opacity: 0, position: absolute) to measure its natural height
  2. Set the container to the measured height with a CSS transition
  3. After the height transition completes, fade in the new content
  4. Remove the explicit height constraint after the full transition
  Alternatively, use `max-height` with a generous upper bound, but this makes the animation timing feel wrong. The two-phase approach is better.
**Warning signs:** Content jumping or container height flickering during step changes.

### Pitfall 5: FRONTEND_BLOCKED_KEYS Blocking Wizard Credential Pre-fill
**What goes wrong:** The wizard tries to pre-fill fields from the OS keychain using `invoke('get_secret', { key: 'supabase.url' })`, but `supabase.url` is NOT in `FRONTEND_BLOCKED_KEYS` (good). However, many credential keys like `bluebubbles.password` ARE blocked. The wizard cannot pre-fill secret fields.
**Why it happens:** `FRONTEND_BLOCKED_KEYS` in `secrets.rs` blocks almost all credential keys from the `get_secret` Tauri command for security.
**How to avoid:** For the wizard, pre-filling is only relevant if the keychain already has values (unlikely on first run -- `is_first_run()` checks this). For the "Re-run Walkthrough" flow, the wizard should:
  - Only pre-fill URL fields (which are mostly readable: `bluebubbles.host`, `openclaw.api-url`)
  - NOT attempt to read secret fields -- show them as empty with a "previously configured" indicator
  - Use `invoke('check_first_run')` to determine if pre-fill is even worth attempting
**Warning signs:** `null` returns from `get_secret` for blocked keys.

### Pitfall 6: Tailscale Detection on Non-Linux
**What goes wrong:** The `tailscale` CLI command is not in PATH on some systems, or requires `sudo` on macOS.
**Why it happens:** Tailscale CLI location varies by OS: `/usr/bin/tailscale` on Linux, `/Applications/Tailscale.app/.../tailscale` on macOS, `tailscale.exe` on Windows.
**How to avoid:** The existing `tailscale.rs` already handles this via `Command::new("tailscale")`. For the wizard step, use a Tauri command that wraps `get_tailscale_peers()` -- it returns `Err` if tailscale is not found, which the wizard can display as "Tailscale not detected." The wizard should NOT try to auto-detect the Tailscale IP -- it should ask the user to verify Tailscale is running and show the current machine's Tailscale IP if available.
**Warning signs:** "Failed to run tailscale" errors on the Tailscale step.

### Pitfall 7: Theme WYSIWYG Preview Breaks Wizard Styling
**What goes wrong:** Clicking a dark theme card while in light mode changes ALL CSS variables, including those the wizard itself uses. The wizard text becomes invisible or hard to read.
**Why it happens:** `setActiveTheme()` applies CSS variables globally to the document root.
**How to avoid:** This is actually the intended behavior per CONTEXT.md ("WYSIWYG -- clicking a preset immediately changes the wizard's own appearance"). The wizard MUST use only CSS variables (no hardcoded colors), so it adapts to any theme. Verify every wizard component looks correct in all 8 preset themes, both dark and light.
**Warning signs:** Hard-to-read text or invisible elements when switching between dark and light themes.

## Code Examples

### Example 1: Wizard State Store (useSyncExternalStore)
```typescript
// Source: Follows theme-store.ts pattern (verified in codebase at frontend/src/lib/theme-store.ts)
import { useSyncExternalStore } from 'react'

const STORAGE_KEY = 'wizard-state'

// Excluded from persistence: testResults (re-run on resume)
const EXCLUDED_FROM_PERSIST = ['testResults']

const DEFAULT_STATE: WizardState = {
  currentStep: 0,
  completedSteps: [],
  stepStatus: {},
  tailscaleIp: '',
  supabaseUrl: '',
  supabaseAnonKey: '',
  openclawUrl: '',
  openclawApiKey: '',
  blueBubblesUrl: '',
  blueBubblesPassword: '',
  macBridgeUrl: '',
  macBridgeApiKey: '',
  couchdbUrl: '',
  couchdbUsername: '',
  couchdbPassword: '',
  testResults: {},
  enabledModules: [],
  activeBundle: 'essentials',
  selectedThemeId: 'default-dark',
  selectedMode: 'dark',
}

let _state: WizardState = loadInitialState()
const _listeners = new Set<() => void>()

function loadInitialState(): WizardState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<WizardState>
      return { ...DEFAULT_STATE, ...parsed, testResults: {} }
    }
  } catch { /* fallback */ }
  return { ...DEFAULT_STATE }
}

function persist() {
  const persistable = { ..._state }
  delete (persistable as Record<string, unknown>).testResults
  localStorage.setItem(STORAGE_KEY, JSON.stringify(persistable))
  _listeners.forEach(fn => fn())
}

export function getWizardState(): WizardState { return _state }
export function subscribeWizard(fn: () => void) {
  _listeners.add(fn)
  return () => { _listeners.delete(fn) }
}
export function useWizardState() {
  return useSyncExternalStore(subscribeWizard, getWizardState)
}
```

### Example 2: Wizard Connection Test Endpoint (Rust)
```rust
// Source: Based on test_supabase() in status.rs (verified at src-tauri/src/routes/status.rs:398)
#[derive(Deserialize)]
struct WizardTestRequest {
    service: String,
    url: String,
    #[serde(default)]
    key: String,
    #[serde(default)]
    password: String,
}

async fn wizard_test_connection(
    State(state): State<AppState>,
    Json(body): Json<WizardTestRequest>,
) -> Result<Json<Value>, AppError> {
    let http = &state.http;
    let result = match body.service.as_str() {
        "supabase" => {
            let rest_url = format!("{}/rest/v1/", body.url.trim_end_matches('/'));
            let start = std::time::Instant::now();
            match http.get(&rest_url)
                .header("apikey", &body.key)
                .header("Authorization", format!("Bearer {}", &body.key))
                .timeout(std::time::Duration::from_secs(5))
                .send().await
            {
                Ok(resp) if resp.status().as_u16() != 401 =>
                    json!({ "status": "ok", "latency_ms": start.elapsed().as_millis() as u64 }),
                Ok(_) =>
                    json!({ "status": "error", "error": "Authentication failed -- check your anon key" }),
                Err(e) =>
                    json!({ "status": "error", "error": connection_error_msg(&e) }),
            }
        },
        "openclaw" => { /* similar pattern */ },
        "bluebubbles" => { /* similar pattern */ },
        "couchdb" => { /* similar pattern */ },
        "mac-bridge" => { /* similar pattern */ },
        _ => return Err(AppError::BadRequest("unknown service".into())),
    };
    Ok(Json(result))
}
```

### Example 3: Tailscale Detection Step
```typescript
// Source: Uses existing tailscale.rs (verified at src-tauri/src/tailscale.rs)
// The wizard's Tailscale step should:
// 1. Try to detect if Tailscale is running via a new Tauri command
// 2. If running, auto-fill the machine's Tailscale IP
// 3. If not running, show a clear error with setup instructions

// New Tauri command needed:
// #[tauri::command]
// pub fn check_tailscale() -> Result<TailscaleStatus, String> {
//   let peers = get_tailscale_peers()?;
//   // Also get self IP from tailscale status --json -> Self -> TailscaleIPs
//   Ok(TailscaleStatus { connected: true, self_ip: "100.x.x.x", peer_count: peers.len() })
// }

// Frontend usage:
async function checkTailscale(): Promise<{ connected: boolean; selfIp?: string }> {
  if (!window.__TAURI_INTERNALS__) {
    // Browser mode: cannot detect Tailscale, show manual check instructions
    return { connected: false }
  }
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    return await invoke('check_tailscale')
  } catch {
    return { connected: false }
  }
}
```

### Example 4: canvas-confetti Usage
```typescript
// Source: canvas-confetti npm documentation (https://www.npmjs.com/package/canvas-confetti)
import confetti from 'canvas-confetti'

function fireCelebration(accentColor: string) {
  confetti({
    particleCount: 100,
    spread: 70,
    origin: { x: 0.5, y: 0.3 },
    colors: [accentColor, '#34d399', '#60a5fa', '#f472b6'],
    gravity: 1.2,
    ticks: 200,
    disableForReducedMotion: true, // Built-in reduced motion support
  })
}
```

### Example 5: Animation Intensity Store
```typescript
// Source: Follows useSyncExternalStore pattern (project convention)
const STORAGE_KEY = 'animation-intensity'
type AnimationLevel = 'full' | 'reduced' | 'none'

function getDefaultLevel(): AnimationLevel {
  if (typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return 'reduced'
  }
  return 'full'
}

let _level: AnimationLevel = (() => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'full' || stored === 'reduced' || stored === 'none') return stored
  } catch { /* fall through */ }
  return getDefaultLevel()
})()

// Apply data-animation attribute to <html> for CSS selectors
function applyToDOM() {
  document.documentElement.setAttribute('data-animation', _level)
}
applyToDOM() // Apply on load

// Export: useAnimationIntensity(), getAnimationIntensity(), setAnimationIntensity()
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `useState` + prop drilling for wizard state | `useSyncExternalStore` with external store | React 18 (2022) | Prevents tearing, enables persistence, matches project pattern |
| Direct `fetch()` to test services | Axum proxy for all external calls | Project convention | Security (CORS, credential isolation), consistency |
| CSS `mix-blend-mode` for spotlight overlays | `clip-path: polygon()` for spotlight cutout | Modern browsers (2023+) | Works correctly in dark mode, GPU-accelerated, no color inversion artifacts |
| `localStorage.getItem()` in event handlers | `useSyncExternalStore` reactive store pattern | React 18 | Safe concurrent reads, no stale closures |
| `window.dispatchEvent()` for cross-component sync | `useSyncExternalStore` or `event-bus.ts` | Project convention | Type-safe, testable, no DOM coupling |

**Deprecated/outdated:**
- The existing `OnboardingWelcome.tsx` uses `useState` for all state and `import.meta.env` for Supabase detection. This entire component will be rewritten (not patched), per CONTEXT.md.
- `isDemoMode()` checks `!import.meta.env.VITE_SUPABASE_URL` -- this will remain for "no-backend" detection but the wizard's demo mode is a separate concept using localStorage.

## Open Questions

1. **Credential Security During Wizard Resume**
   - What we know: Wizard state (including credentials) is persisted to localStorage for resume. Credentials are cleaned up on completion.
   - What's unclear: If the user abandons the wizard mid-way (closes the app and never returns), credentials sit in localStorage indefinitely. The `wizard-state` key may contain service URLs and passwords.
   - Recommendation: Accept this risk for v1. The credentials are only Tailscale-accessible service URLs and keys (not banking credentials). Add a TTL check -- if `wizard-state` is older than 24 hours, discard it on next load. This limits exposure.

2. **Wizard Route vs. Portal Rendering**
   - What we know: The existing OnboardingWelcome uses `createPortal` to render as a modal overlay. The new wizard is a full-screen takeover.
   - What's unclear: Should the wizard be a React Router route (`/setup`) or a portal overlay rendered conditionally in LayoutShell?
   - Recommendation: Use a portal approach (like the current code) rendered in LayoutShell BEFORE the auth guard. The wizard runs pre-login, so it cannot be behind `AuthGuard`. Render `SetupWizard` in `main.tsx` outside the `<Routes>` tree, checking `setup-complete` localStorage key.

3. **Backend Restart After Wizard Saves Credentials**
   - What we know: Secrets are loaded from keychain at Axum server startup (`load_secrets()` in `secrets.rs`). The wizard saves new credentials to keychain but the running Axum server already loaded secrets at boot.
   - What's unclear: How does the Axum server pick up newly-saved keychain values without a restart?
   - Recommendation: The `AppState` has a `secret()` method that reads from a HashMap loaded at startup. After the wizard saves credentials to keychain, the frontend should call a new endpoint (e.g., `POST /api/wizard/reload-secrets`) that re-reads the keychain into AppState. Alternatively, the wizard could simply prompt "Restart the app to apply service connections" -- but this breaks the smooth flow. A reload endpoint is better.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (jsdom environment) |
| Config file | `frontend/vitest.config.ts` |
| Quick run command | `cd frontend && npx vitest run --reporter=verbose` |
| Full suite command | `cd frontend && npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| WIZARD-01 | First-run detection when no setup-complete key | unit | `cd frontend && npx vitest run src/lib/__tests__/wizard-store.test.ts -x` | Wave 0 |
| WIZARD-02 | Connection test request formatting and response parsing | unit | `cd frontend && npx vitest run src/hooks/__tests__/useWizardConnectionTest.test.ts -x` | Wave 0 |
| WIZARD-03 | Module selection: preset bundles set correct module IDs | unit | `cd frontend && npx vitest run src/components/wizard/__tests__/WizardModules.test.ts -x` | Wave 0 |
| WIZARD-04 | Theme selection: setActiveTheme called with correct ID | unit | `cd frontend && npx vitest run src/components/wizard/__tests__/WizardTheme.test.ts -x` | Wave 0 |
| WIZARD-05 | Demo mode activation sets localStorage key and navigates | unit | `cd frontend && npx vitest run src/lib/__tests__/wizard-store.test.ts -x` | Wave 0 |
| WIZARD-06 | Skip setup writes setup-complete and skips to login | unit | `cd frontend && npx vitest run src/lib/__tests__/wizard-store.test.ts -x` | Wave 0 |
| WIZARD-07 | Guide panel expands/collapses, module cards dim when unavailable | unit | `cd frontend && npx vitest run src/components/wizard/__tests__/WizardGuidePanel.test.tsx -x` | Wave 0 |
| WIZARD-08 | State persisted to localStorage and restored on reload | unit | `cd frontend && npx vitest run src/lib/__tests__/wizard-store.test.ts -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd frontend && npx vitest run --reporter=verbose`
- **Per wave merge:** `cd frontend && npx vitest run && cd ../src-tauri && cargo test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `frontend/src/lib/__tests__/wizard-store.test.ts` -- covers WIZARD-01, WIZARD-05, WIZARD-06, WIZARD-08 (state persistence, first-run detection, demo mode, skip)
- [ ] `frontend/src/hooks/__tests__/useWizardConnectionTest.test.ts` -- covers WIZARD-02 (connection test parsing)
- [ ] `frontend/src/components/wizard/__tests__/WizardModules.test.ts` -- covers WIZARD-03 (preset bundles, module toggle)
- [ ] `frontend/src/components/wizard/__tests__/WizardTheme.test.ts` -- covers WIZARD-04 (theme selection)
- [ ] `frontend/src/components/wizard/__tests__/WizardGuidePanel.test.tsx` -- covers WIZARD-07 (expandable guide)
- [ ] `frontend/src/hooks/__tests__/useAnimationIntensity.test.ts` -- covers animation intensity store
- [ ] `src-tauri/src/routes/wizard.rs` test module -- covers WIZARD-02 backend (connection test endpoints)

## Sources

### Primary (HIGH confidence)
- `frontend/src/lib/theme-store.ts` -- useSyncExternalStore pattern for external state (lines 1-55)
- `frontend/src/lib/modules.ts` -- Module registry, enable/disable API (17 modules)
- `frontend/src/components/OnboardingWelcome.tsx` -- Existing wizard (reference only, will be rewritten)
- `src-tauri/src/secrets.rs` -- OS keychain integration, allowed/blocked keys, Tauri commands
- `src-tauri/src/tailscale.rs` -- Tailscale peer detection and verification
- `src-tauri/src/routes/status.rs` -- Existing connection test endpoints (require auth)
- `src-tauri/src/server.rs` -- Auth middleware, exempt paths, RequireAuth extractor
- `frontend/src/pages/settings/SettingsConnections.tsx` -- Settings connection UI (reference for patterns)
- `.planning/phases/03-setup-wizard-onboarding/03-CONTEXT.md` -- User decisions and constraints
- `.planning/phases/03-setup-wizard-onboarding/03-UI-SPEC.md` -- Complete UI design contract

### Secondary (MEDIUM confidence)
- [canvas-confetti npm](https://www.npmjs.com/package/canvas-confetti) -- Library API documentation
- [canvas-confetti GitHub](https://github.com/catdad/canvas-confetti) -- Source code and examples
- [CSS clip-path MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/clip-path) -- clip-path polygon syntax for spotlight overlay
- [useSyncExternalStore Epic React](https://www.epicreact.dev/use-sync-external-store-demystified-for-practical-react-development-w5ac0) -- Pattern explanation and best practices
- [DEV Community useSyncExternalStore](https://dev.to/ashishxcode/how-usesyncexternalstore-transformed-my-react-state-management-i31) -- Pattern adoption in modern React

### Tertiary (LOW confidence)
- [react-tourlight](https://github.com/btahir/react-tourlight) -- Reference for clip-path spotlight approach (not used, but validates the technique)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries are either already in the project or well-established (canvas-confetti)
- Architecture: HIGH -- patterns are direct extensions of existing project conventions (useSyncExternalStore, Axum routes)
- Pitfalls: HIGH -- identified through direct code analysis of existing auth middleware, keychain blocked keys, and connection test endpoints
- Connection test auth gap: HIGH -- verified by reading RequireAuth extractor and exempt path lists in server.rs
- Animation approach: MEDIUM -- CSS transition choreography is well-specified in UI-SPEC but implementation complexity may surface during development

**Research date:** 2026-03-19
**Valid until:** 2026-04-19 (stable -- no fast-moving dependencies)
