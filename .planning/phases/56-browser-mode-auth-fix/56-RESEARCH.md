# Phase 56: Browser Mode Auth Fix - Research

**Researched:** 2026-03-24
**Domain:** Tauri v2 browser-mode compatibility / auth flow
**Confidence:** HIGH

## Summary

The current codebase already has significant Tauri/browser-mode awareness -- every `__TAURI_INTERNALS__` check guards dynamic imports so they only fire inside the Tauri webview. The **core blocker** is narrower than it appears: `AuthGuard.tsx` detects browser dev mode (`import.meta.env.DEV && !__TAURI_INTERNALS__`) and skips auth entirely, jumping straight to `authenticated`. This means the app loads but the developer **never actually authenticates** against the Axum backend, so any API call that uses `RequireAuth` fails with 401/403, and the user session is never established.

There are two code changes needed and one UX improvement:
1. **AuthGuard.tsx** -- Remove the `devNoBackend` bypass so browser-mode users go through the real login flow.
2. **auth.rs OAuth callback** -- After successful PKCE exchange, redirect browser-mode users back to `VITE_SITE_URL` (port 5173) instead of showing the "close this tab" HTML page. Currently the callback renders a static HTML page designed for the Tauri flow where the webview polls for completion -- in browser mode the user gets stranded on port 3000.
3. **All other Tauri API sites (23 call sites)** -- Already properly guarded with `if (window.__TAURI_INTERNALS__)` checks. No changes needed.

The Axum backend already supports browser-mode requests in debug builds via `#[cfg(debug_assertions)]` origin check that allows localhost origins without `X-API-Key`. CORS is already configured to allow `localhost:*` origins.

**Primary recommendation:** Remove the `devNoBackend` auth bypass in `AuthGuard.tsx`, update the OAuth callback in `auth.rs` to redirect back to the frontend URL when the request originates from a browser (not Tauri), and verify the existing Tauri guards produce no console errors. This is a surgical fix, not an architectural change.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
None -- all implementation choices are at Claude's discretion (infrastructure phase).

### Claude's Discretion
All implementation choices are at Claude's discretion -- pure infrastructure phase. Use ROADMAP phase goal, success criteria, and codebase conventions to guide decisions.

### Deferred Ideas (OUT OF SCOPE)
None.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DEV-01 | Browser mode auth works without Tauri shell for development | Full analysis of AuthGuard bypass, OAuth callback redirect, Axum middleware debug exemptions, and all 24 Tauri API call sites completed |
</phase_requirements>

## Standard Stack

No new libraries required. This phase modifies existing code only.

### Core (Already Installed)
| Library | Version | Purpose | Relevant to Phase |
|---------|---------|---------|-------------------|
| @tauri-apps/api | ^2.10.1 | Tauri IPC bridge | Dynamic imports guarded by `__TAURI_INTERNALS__` |
| @tauri-apps/plugin-shell | ^2.3.5 | Shell open (OAuth in Tauri) | Used in `lib/tauri.ts` -- already try/catch wrapped |
| @tauri-apps/plugin-dialog | ^2.6.0 | File picker dialog | Used in `CustomCssEditor.tsx` -- already guarded |
| @tauri-apps/plugin-fs | ^2.4.5 | File system access | Used in `CustomCssEditor.tsx` -- already guarded |

**No installation needed.**

## Architecture Patterns

### Current Pattern: Tauri Guard (CORRECT -- keep as-is)

Every Tauri API usage in the codebase already follows this pattern:

```typescript
// Guard: only runs inside Tauri webview
if (window.__TAURI_INTERNALS__) {
  import('@tauri-apps/api/core').then(({ invoke }) => {
    invoke<T>('command_name').then(/* ... */).catch(/* ... */)
  })
}
```

This pattern is used correctly in: `main.tsx` (6 sites), `LayoutShell.tsx` (4 sites), `Settings.tsx` (2 sites), `SettingsConnections.tsx` (2 sites), `Login.tsx` (1 site), `OnboardingWelcome.tsx` (3 sites), `FontPicker.tsx` (1 site), `CustomCssEditor.tsx` (3 sites), `WizardTailscale.tsx` (1 site), `theme-engine.ts` (1 site).

**All 24 call sites are properly guarded.** No dynamic imports fire without the `__TAURI_INTERNALS__` check.

### Problem 1: AuthGuard Bypass (Frontend)

```typescript
// AuthGuard.tsx -- THE PROBLEM
const devNoBackend = import.meta.env.DEV && !(window as Record<string, unknown>).__TAURI_INTERNALS__
const [state, setState] = useState<AuthState>(isDemoMode() || devNoBackend ? 'authenticated' : 'loading')
```

When running `npm run dev` in a browser:
1. `import.meta.env.DEV` is `true`
2. `__TAURI_INTERNALS__` is `undefined`
3. `devNoBackend` becomes `true`
4. Auth state initializes as `'authenticated'` -- skipping login entirely
5. No session is established with the Axum backend
6. All API calls to routes using `RequireAuth` fail with 401

### Problem 2: OAuth Callback Strands Browser Users (Backend)

The OAuth callback in `auth.rs` (line 1588) renders a static HTML page:

```rust
Ok(Html(callback_page(
    "Signed In",
    "Signed in!",
    "You're all set! You can close this tab and return to OpenClaw Manager.",
    false,
)))
```

This is designed for the Tauri flow where:
1. User clicks OAuth on the Tauri webview
2. External browser opens to OAuth provider
3. Provider redirects to `localhost:3000/api/auth/callback`
4. Axum exchanges code, stores session
5. HTML page says "close this tab"
6. Tauri webview polls `/api/auth/session` and detects success

In browser mode (user is ON `localhost:5173`):
1. User clicks OAuth on `localhost:5173`
2. **Same tab** navigates to OAuth provider (via `window.location.href`)
3. Provider redirects to `localhost:3000/api/auth/callback`
4. Axum exchanges code, stores session
5. User sees "close this tab" HTML page on port 3000
6. **User is stranded** -- they must manually navigate back to `localhost:5173`

**Fix:** After PKCE exchange succeeds, detect if the request comes from a browser (not Tauri) and redirect to `VITE_SITE_URL` or `http://localhost:5173` instead of rendering the static HTML page. The callback could check the `Referer` header or accept a `redirect_to` query parameter set by the frontend.

### Current Backend Support: Already Works for API Key Bypass

The Axum `api_key_auth` middleware (`server.rs:1049`) already has a debug-mode bypass:

```rust
#[cfg(debug_assertions)]
if let Some(origin) = req.headers().get("origin").and_then(|v| v.to_str().ok()) {
    if origin.starts_with("http://localhost:") || origin.starts_with("http://127.0.0.1:") {
        return next.run(req).await;
    }
}
```

This means: in debug builds, requests from `localhost:5173` (Vite dev server) bypass the `X-API-Key` check. The auth endpoints (`/api/auth/*`) are also exempt from API key auth via `AUTH_EXEMPT_PREFIXES`.

### The Fix: Two-Scenario Browser Mode

Browser mode has two distinct scenarios that require different handling:

**Scenario A: Browser + Axum backend running (cargo tauri dev or standalone cargo run)**
- The Axum backend IS running on `localhost:3000`
- Auth should work normally (login via OAuth or email/password)
- The `#[cfg(debug_assertions)]` bypass allows requests without `X-API-Key`
- Dev session persistence means you only login once per 24 hours

**Scenario B: Browser-only, NO backend (npm run dev only)**
- No Axum backend at all -- API calls fail with network errors
- This is the demo/showcase mode
- `isDemoMode()` already handles this (returns true when `VITE_SUPABASE_URL` is unset)

The current `devNoBackend` bypass conflates these two scenarios. The fix:

1. **Remove `devNoBackend` bypass** -- let AuthGuard always check `/api/auth/session`
2. **If the session check fails with a network error AND isDemoMode()**, fall back to authenticated (demo mode still works)
3. **Update OAuth callback** -- redirect to frontend URL after successful exchange in browser mode
4. **Login.tsx already handles browser mode correctly** -- it redirects to the OAuth URL directly instead of opening a separate browser window

### OAuth Callback Redirect Strategy

The cleanest approach: have the frontend pass a `redirect_to` query parameter when initiating OAuth. The `start_oauth` handler can store it alongside the PKCE verifier, and the `oauth_callback` handler uses it after successful exchange.

Alternative (simpler): The callback always renders the HTML page, but include JavaScript that detects if the page was loaded as a navigation (not popup) and auto-redirects to `VITE_SITE_URL`. This avoids backend changes but is less robust.

**Recommended approach:** Add `redirect_to` support to the OAuth flow. The frontend passes `?redirect_to=http://localhost:5173` when initiating OAuth. After successful PKCE exchange, callback responds with HTTP 302 redirect to that URL. In Tauri mode, the frontend doesn't pass `redirect_to`, so the existing HTML page behavior is preserved.

### API Key Loading in Browser Mode

In Tauri mode, `main.tsx` loads the MC_API_KEY from the keychain via `invoke('get_secret')` and calls `setApiKey()`. In browser mode, this block is skipped (guarded by `__TAURI_INTERNALS__`), so `_apiKey` stays `undefined` and no `X-API-Key` header is sent.

This is fine because the `#[cfg(debug_assertions)]` bypass in `api_key_auth` allows localhost-origin requests without the header.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Auth bypass detection | Custom env checks | Remove bypass, let existing flow work | The login page + Axum already handle both modes |
| API key in browser mode | Pass key via env var or URL param | Rely on `#[cfg(debug_assertions)]` origin bypass | Debug builds already allow localhost origins |
| Session persistence | Custom cookie/localStorage solution | Use existing `_dev_session` SQLite persistence | Already implemented in debug builds |

## Common Pitfalls

### Pitfall 1: Removing devNoBackend Without Handling Network Errors
**What goes wrong:** If the Axum backend isn't running and `devNoBackend` is removed, `api.get('/api/auth/session')` will throw a network error. The current catch block sets state to `'unauthenticated'`, which redirects to `/login`. But on `/login`, the session check also fails, creating a redirect loop if login endpoints are unreachable.
**Why it happens:** AuthGuard and Login page both hit `/api/auth/session`.
**How to avoid:** When removing `devNoBackend`, add graceful fallback: if the session check fails with a network error (status 0) AND `isDemoMode()` is true, set state to `'authenticated'` (demo mode still works). If `isDemoMode()` is false (VITE_SUPABASE_URL is set but backend is down), show unauthenticated and let the login page handle it gracefully.
**Warning signs:** Login page shows briefly then loops, or blank screen.

### Pitfall 2: OAuth Callback Port Mismatch
**What goes wrong:** The OAuth redirect_uri is hardcoded to `http://127.0.0.1:3000/api/auth/callback` (auth.rs line 943). After OAuth completes, the user's browser is on port 3000 but their app is on port 5173.
**Why it happens:** The callback URL must point to the Axum server (port 3000) because it needs to exchange the code server-side. But the user needs to end up back at port 5173.
**How to avoid:** After the PKCE exchange succeeds in the callback, redirect to the frontend URL. Pass the frontend URL as a `redirect_to` parameter from the frontend, or use `VITE_SITE_URL` env var on the backend.
**Warning signs:** User sees "close this tab" message and has to manually navigate back.

### Pitfall 3: CORS Origin for Vite Dev Server
**What goes wrong:** The Vite dev server runs on `localhost:5173` and makes cross-origin requests to `localhost:3000`. CORS must allow this.
**Why it happens:** Different ports = different origins from CORS perspective.
**How to avoid:** Already handled. The CORS layer in `server.rs` allows origins starting with `http://localhost:` and `http://127.0.0.1:` (line 694-698).
**Warning signs:** Console errors about CORS, requests blocked.

### Pitfall 4: redirect_to Parameter Security
**What goes wrong:** If the `redirect_to` parameter is not validated, an attacker could craft an OAuth URL that redirects to a malicious site after auth, stealing the session.
**Why it happens:** Open redirect vulnerability.
**How to avoid:** Validate that `redirect_to` is a localhost URL (starts with `http://localhost:` or `http://127.0.0.1:`). Reject any other values. This is a dev-only feature so the validation can be strict.
**Warning signs:** None in dev, but good practice to validate.

### Pitfall 5: Email Login Flow (No Redirect Issue)
**What goes wrong:** Nothing -- email/password login does NOT have the callback redirect problem. The login form POSTs to `/api/auth/login`, gets back a response, and the frontend handles the redirect with `window.location.href = next`. This works across ports because it's an API call, not a page navigation.
**Why it happens:** Email login is a fetch() call, not a redirect flow.
**How to avoid:** No action needed. Email login works in browser mode as-is.
**Warning signs:** N/A

## Code Examples

### Fix 1: AuthGuard.tsx -- Remove devNoBackend bypass

```typescript
// BEFORE (broken in browser mode)
const devNoBackend = import.meta.env.DEV && !(window as Record<string, unknown>).__TAURI_INTERNALS__
const [state, setState] = useState<AuthState>(isDemoMode() || devNoBackend ? 'authenticated' : 'loading')

useEffect(() => {
  if (isDemoMode() || devNoBackend) {
    setState('authenticated')
    return
  }
  // ...
}, [])

// AFTER (works in both modes)
const [state, setState] = useState<AuthState>(isDemoMode() ? 'authenticated' : 'loading')

useEffect(() => {
  if (isDemoMode()) {
    setState('authenticated')
    return
  }

  async function checkAuth() {
    try {
      const res = await api.get<{ ... }>('/api/auth/session')
      // ... existing session check logic (unchanged) ...
    } catch (err) {
      // Network error + demo mode = still show demo
      if (isDemoMode()) {
        setState('authenticated')
        return
      }
      setState('unauthenticated')
    }
  }

  checkAuth()
  const interval = setInterval(checkAuth, 30000)
  return () => clearInterval(interval)
}, [])
```

### Fix 2: OAuth Callback Redirect for Browser Mode

Frontend side -- pass redirect_to when initiating OAuth in browser mode:

```typescript
// Login.tsx -- handleOAuth
const data = await api.get<{ url: string }>(
  `/api/auth/oauth/${provider}${!isTauriApp ? '?redirect_to=' + encodeURIComponent(window.location.origin) : ''}`
)
```

Backend side -- store redirect_to and use it in callback:

```rust
// auth.rs -- start_oauth: accept redirect_to parameter
#[derive(Deserialize)]
struct OAuthQuery {
    redirect_to: Option<String>,
}

// Store redirect_to in PendingOAuthFlow (add field to struct)

// auth.rs -- oauth_callback: after PKCE exchange succeeds
if let Some(redirect_url) = redirect_to {
    // Validate: must be localhost
    if redirect_url.starts_with("http://localhost:") || redirect_url.starts_with("http://127.0.0.1:") {
        return Ok(Redirect::to(&redirect_url).into_response());
    }
}
// Fallback: existing "close this tab" HTML page
```

### Fix 3: Verify Existing Guards Work (No Change Needed)

All Tauri API calls in the codebase are already properly guarded. Example from `main.tsx`:

```typescript
// This block ONLY runs inside Tauri -- browser skips it entirely
if (window.__TAURI_INTERNALS__) {
  import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
    // Tauri-specific logic
  })
} else {
  // Browser fallback (e.g., matchMedia for theme detection)
}
```

## Inventory of All __TAURI_INTERNALS__ Usage

Complete catalog for the planner to verify all sites are handled:

| File | Line(s) | Purpose | Browser Behavior | Action Needed |
|------|---------|---------|-----------------|---------------|
| `main.tsx` | 61, 74, 102, 239, 244 | Focus events, decorations, theme detection, context menu, API key loading | Skipped (else branch for theme uses matchMedia) | None |
| `AuthGuard.tsx` | 12-13 | `devNoBackend` bypass | **Skips auth entirely** | **FIX: Remove bypass** |
| `LayoutShell.tsx` | 184, 317, 329, 341 | Fullscreen detection, window hide/minimize/fullscreen | Skipped gracefully (no-ops) | None |
| `Login.tsx` | 110, 119 | OAuth redirect vs. external browser | Uses `window.location.href` redirect | **ENHANCE: Pass redirect_to param** |
| `Settings.tsx` | 53, 60, 91, 98, 104, 106 | Log dir display, open folder button | Shows "Not available (browser mode)", button disabled | None |
| `SettingsConnections.tsx` | 38, 90 | Keychain load/save for connections | Skipped (falls through to API-only path) | None |
| `OnboardingWelcome.tsx` | 583, 641, 778 | Tailscale detection, connection testing | Skipped (manual mode) | None |
| `FontPicker.tsx` | 359, 365 | System font enumeration | Shows "not available in browser" placeholder | None |
| `CustomCssEditor.tsx` | 184, 211, 253 | File picker, file read | Tab disabled, shows desktop-only message | None |
| `WizardTailscale.tsx` | 58, 64 | Tailscale status detection | Falls back to manual IP entry | None |
| `theme-engine.ts` | 495 | WebKitGTK detection for ripple transition | Falls back to overlay transition | None |

**AuthGuard.tsx requires a code change. Login.tsx + auth.rs need the OAuth redirect enhancement. All other 22 sites already handle browser mode correctly.**

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Skip auth in dev+browser | Authenticate via real login flow | This phase | Developers can test the full auth flow in browser |
| OAuth callback shows "close tab" HTML | Redirect to frontend URL in browser mode | This phase | Seamless OAuth in browser without manual navigation |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (via vitest.config.ts) |
| Config file | `frontend/vitest.config.ts` |
| Quick run command | `cd frontend && npx vitest run --reporter=verbose` |
| Full suite command | `cd frontend && npx vitest run` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DEV-01a | AuthGuard sends to login when no session (non-demo, non-Tauri) | unit | `cd frontend && npx vitest run src/components/__tests__/AuthGuard.test.tsx -x` | No -- Wave 0 |
| DEV-01b | AuthGuard shows authenticated in demo mode | unit | `cd frontend && npx vitest run src/components/__tests__/AuthGuard.test.tsx -x` | No -- Wave 0 |
| DEV-01c | Login page OAuth redirects via window.location in browser mode | unit | `cd frontend && npx vitest run src/pages/__tests__/Login.test.tsx -x` | No -- Wave 0 |
| DEV-01d | No __TAURI_INTERNALS__ errors in console (Tauri calls guarded) | smoke | Manual -- verify no console errors | N/A |

### Sampling Rate
- **Per task commit:** `cd frontend && npx vitest run src/components/__tests__/AuthGuard.test.tsx -x`
- **Per wave merge:** `cd frontend && npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `frontend/src/components/__tests__/AuthGuard.test.tsx` -- covers DEV-01a, DEV-01b: AuthGuard renders login redirect in browser mode without Tauri, and authenticated state in demo mode
- [ ] `frontend/src/pages/__tests__/Login.test.tsx` -- covers DEV-01c: Login OAuth uses window.location (not openInBrowser) when not in Tauri

## Open Questions

None -- all questions resolved during research.

## Sources

### Primary (HIGH confidence)
- Direct codebase analysis of all files containing `__TAURI_INTERNALS__` (24 call sites in 11 files)
- `server.rs` API key auth middleware (lines 982-1057) -- debug mode bypass verified at line 1049
- `server.rs` CORS configuration (lines 693-704) -- localhost origins allowed
- `server.rs` dev session persistence (lines 573-605) -- SQLite session survives restarts in debug builds
- `auth.rs` OAuth callback (lines 1425-1602) -- renders static HTML, does NOT redirect to frontend
- `auth.rs` start_oauth (lines 909-964) -- hardcoded callback URL to `localhost:3000/api/auth/callback`
- `secrets.rs` MC_API_KEY generation (lines 105-121) -- auto-generated per launch, stored in keychain

### Secondary (MEDIUM confidence)
- CLAUDE.md project context for architecture understanding
- .env.example files for environment variable patterns

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new libraries, pure code modification
- Architecture: HIGH -- all 24 Tauri call sites audited, pattern is consistent
- Pitfalls: HIGH -- CORS, session, OAuth callback, and redirect flows verified against source code
- OAuth callback redirect fix: HIGH -- verified callback renders HTML (line 1588), confirmed it needs redirect for browser mode

**Research date:** 2026-03-24
**Valid until:** 2026-04-24 (stable -- internal code patterns, no external dependency changes)
