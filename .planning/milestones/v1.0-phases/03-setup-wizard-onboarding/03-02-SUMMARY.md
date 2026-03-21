---
phase: 03-setup-wizard-onboarding
plan: 02
subsystem: api
tags: [axum, rust, wizard, connection-test, keychain, tailscale, tauri-command]

# Dependency graph
requires:
  - phase: none
    provides: existing AppState, secrets.rs, tailscale.rs
provides:
  - Wizard backend endpoints (test-connection, save-credentials, reload-secrets)
  - check_tailscale Tauri IPC command for network detection
  - pub(crate) access to secrets set_entry, is_allowed_key, KEY_ENV_MAP
affects: [03-setup-wizard-onboarding, wizard-frontend, settings-connections]

# Tech tracking
tech-stack:
  added: []
  patterns: [wizard-auth-pattern, connection-test-with-hints]

key-files:
  created:
    - src-tauri/src/routes/wizard.rs
  modified:
    - src-tauri/src/routes/mod.rs
    - src-tauri/src/server.rs
    - src-tauri/src/secrets.rs
    - src-tauri/src/tailscale.rs
    - src-tauri/src/main.rs

key-decisions:
  - "Wizard endpoints require X-API-Key but NOT RequireAuth -- runs before login"
  - "Short 5-second timeout on connection test HTTP client for responsive UX"
  - "Tailscale hint appended when URL contains 100.x and connection fails"
  - "Credentials validated against KEY_ENV_MAP allowlist before keychain write"
  - "reload-secrets replaces entire secrets HashMap via RwLock write"

patterns-established:
  - "Wizard auth pattern: X-API-Key required, no RequireAuth extractor, no AUTH_EXEMPT_PREFIXES entry"
  - "Connection test pattern: service-specific tester functions returning Result<(), String> with user-friendly error messages"

requirements-completed: [WIZARD-02, WIZARD-06]

# Metrics
duration: 7min
completed: 2026-03-20
---

# Phase 03 Plan 02: Wizard Backend Endpoints Summary

**Rust wizard endpoints for pre-login connection testing, credential saving to OS keychain, and secrets reloading into AppState -- plus Tailscale detection Tauri command**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-20T03:54:05Z
- **Completed:** 2026-03-20T04:01:40Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Created wizard.rs with 3 POST endpoints handling 5 service types with specific error messages
- Connection test returns latency, Tailscale hints, port-specific messages, and auth failure suggestions
- check_tailscale Tauri command detects Tailscale connectivity, self IP, and peer count
- All 244 Rust tests pass (6 new wizard + 3 new tailscale)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create wizard.rs route module** - `6800728` (feat)
2. **Task 2: Add check_tailscale Tauri command** - `bbca70c` (feat)

## Files Created/Modified
- `src-tauri/src/routes/wizard.rs` - New module: 3 wizard endpoints + 6 unit tests
- `src-tauri/src/routes/mod.rs` - Register wizard module and router
- `src-tauri/src/server.rs` - Document wizard auth model in AUTH_EXEMPT_PREFIXES comment
- `src-tauri/src/secrets.rs` - Make set_entry, is_allowed_key, KEY_ENV_MAP pub(crate)
- `src-tauri/src/tailscale.rs` - Add TailscaleCheck struct and check_tailscale command + 3 tests
- `src-tauri/src/main.rs` - Register check_tailscale in generate_handler

## Decisions Made
- Wizard endpoints require X-API-Key but NOT RequireAuth -- the wizard runs before the user has logged in, so no session exists. The frontend has the API key via the get_secret Tauri command.
- Did NOT add "/api/wizard/" to AUTH_EXEMPT_PREFIXES despite plan instruction -- AUTH_EXEMPT_PREFIXES skips API key check entirely, which would make wizard endpoints unprotected. Instead, wizard endpoints inherit default API key protection and simply don't use RequireAuth extractor.
- Used a fresh reqwest client with 5-second timeout for connection tests instead of the shared AppState HTTP client (30-second timeout) for responsive wizard UX.
- Made set_entry, is_allowed_key, and KEY_ENV_MAP pub(crate) rather than fully public -- limits access to within the crate only.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected AUTH_EXEMPT_PREFIXES misunderstanding**
- **Found during:** Task 1 (wizard route registration)
- **Issue:** Plan instructed adding "/api/wizard/" to AUTH_EXEMPT_PREFIXES, but this would skip X-API-Key check entirely -- contradicting the must_have truth that wizard endpoints are "protected by X-API-Key middleware"
- **Fix:** Did not add to AUTH_EXEMPT_PREFIXES; added explanatory comment instead. Wizard endpoints inherit X-API-Key protection and skip RequireAuth by not using the extractor.
- **Files modified:** src-tauri/src/server.rs
- **Verification:** Reviewed middleware chain -- api_key_auth runs before inject_session, wizard handlers don't extract RequireAuth
- **Committed in:** 6800728 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug fix)
**Impact on plan:** Fix was essential for correctness -- following the plan literally would have removed security protection from wizard endpoints.

## Issues Encountered
- Parallel agent execution caused Task 2 Rust file changes to be included in a different agent's commit (89935bf) instead of the intended bbca70c. Code is intact and correct in the tree; commit attribution is mixed.
- Pre-existing theme test failures in frontend (theme-definitions counts, theme-contrast margins) caused intermittent pre-commit hook failures. Documented in deferred-items.md. Not related to this plan's Rust-only changes.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Wizard backend is complete and ready for frontend integration (Plan 03)
- All 5 service types have connection test handlers
- check_tailscale command available for frontend Tailscale detection step
- Credentials can be saved to keychain and reloaded into AppState without restart

## Self-Check: PASSED

- All 6 created/modified files exist on disk
- Commit 6800728 (Task 1) found in git log
- Commit bbca70c (Task 2) found in git log
- 244 Rust tests pass (cargo test)
- cargo check succeeds

---
*Phase: 03-setup-wizard-onboarding*
*Completed: 2026-03-20*
