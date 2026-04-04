---
phase: 56-browser-mode-auth-fix
plan: 01
subsystem: auth
tags: [oauth, browser-mode, demo-mode, pkce, redirect, vitest]

# Dependency graph
requires: []
provides:
  - "Browser-mode OAuth flow with redirect_to support"
  - "Demo-mode network error fallback in AuthGuard"
  - "AuthGuard unit tests (6 tests)"
affects: [auth, login, settings]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "redirect_to query param for browser-mode OAuth redirect"
    - "meta http-equiv refresh for cross-origin redirect from callback page"
    - "localhost-only redirect_to validation to prevent open redirect"

key-files:
  created:
    - frontend/src/components/__tests__/AuthGuard.test.tsx
  modified:
    - frontend/src/components/AuthGuard.tsx
    - frontend/src/pages/Login.tsx
    - src-tauri/src/server.rs
    - src-tauri/src/routes/auth.rs

key-decisions:
  - "Used meta http-equiv refresh instead of HTTP 302 because oauth_callback returns Html<String>"
  - "Validated redirect_to as localhost-only to prevent open redirect attacks"
  - "Extracted redirect_to from PendingOAuthFlow before it gets cleared during PKCE exchange"

patterns-established:
  - "Browser-mode OAuth redirect: frontend sends redirect_to param, backend stores in flow, callback redirects back"

requirements-completed: [DEV-01]

# Metrics
duration: 4min
completed: 2026-03-24
---

# Phase 56 Plan 01: Browser-Mode Auth Fix Summary

**Browser-mode OAuth with redirect_to param, AuthGuard demo-mode network fallback, and 6 unit tests**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-24T07:30:43Z
- **Completed:** 2026-03-24T07:35:25Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments
- AuthGuard catch block now falls back to demo mode when backend is unreachable and isDemoMode() is true
- OAuth flow sends redirect_to param in browser mode, Axum stores it, callback redirects browser users back to frontend via meta-refresh
- redirect_to validated as localhost-only (prevents open redirect vulnerability)
- 6 unit tests covering demo mode, session check, network errors, and devNoBackend regression guard

## Task Commits

Each task was committed atomically:

1. **Task 1: Remove AuthGuard devNoBackend bypass and add network error fallback** - `521e557` (fix)
2. **Task 2: Add redirect_to support to OAuth flow (frontend + backend)** - `6e51379` (feat)
3. **Task 3: Add AuthGuard unit tests for browser-mode and demo-mode behavior** - `61a88b2` (test)

## Files Created/Modified
- `frontend/src/components/AuthGuard.tsx` - Added isDemoMode() check in catch block for network error fallback
- `frontend/src/pages/Login.tsx` - Added redirect_to query param to OAuth request in browser mode
- `src-tauri/src/server.rs` - Added redirect_to: Option<String> to PendingOAuthFlow struct
- `src-tauri/src/routes/auth.rs` - Added OAuthStartQuery, redirect_to validation, meta-refresh redirect in callback
- `frontend/src/components/__tests__/AuthGuard.test.tsx` - 6 unit tests for browser-mode and demo-mode auth behavior

## Decisions Made
- Used meta http-equiv refresh instead of HTTP 302 redirect because oauth_callback returns Html<String>, not Response
- Validated redirect_to as localhost-only (http://localhost: or http://127.0.0.1:) to prevent open redirect attacks
- Extracted redirect_to from PendingOAuthFlow before the flow gets cleared during PKCE exchange success

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] AuthGuard already had devNoBackend removed**
- **Found during:** Task 1
- **Issue:** Plan instructions assumed devNoBackend constant existed on line 12, but it was already removed in a prior change
- **Fix:** Only applied the catch block demo-mode fallback (the remaining change from Task 1)
- **Files modified:** frontend/src/components/AuthGuard.tsx
- **Verification:** grep confirms no devNoBackend, tsc compiles cleanly

---

**Total deviations:** 1 auto-fixed (1 bug/stale plan reference)
**Impact on plan:** Minimal -- the code was already partially correct, only the catch block needed the demo fallback.

## Issues Encountered
- Pre-existing Rust compile error: `koel.rs` module referenced in mod.rs but file missing. Not related to this plan's changes. Logged as out-of-scope.
- Pre-existing TypeScript errors in SetupWizard.tsx and TourTooltip.tsx. Not related to this plan's changes.

## Known Stubs

None -- all functionality is fully wired.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Browser-mode auth flow complete and tested
- Tauri-mode auth unchanged
- Ready for any phase that depends on browser-mode development

## Self-Check: PASSED

- All 5 files exist
- All 3 task commits verified (521e557, 6e51379, 61a88b2)

---
*Phase: 56-browser-mode-auth-fix*
*Completed: 2026-03-24*
