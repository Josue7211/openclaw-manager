# Codebase Concerns

**Analysis Date:** 2026-03-19

## Tech Debt

**BlueBubbles Service Fetch Migration:**
- Issue: `bb_fetch()` is called directly in `src-tauri/src/routes/messages.rs` instead of using the unified `ServiceClient` pattern
- Files: `src-tauri/src/routes/messages.rs` (lines 97-100, TODO comment present), `src-tauri/src/service_client.rs` (exists but underutilized)
- Impact: Inconsistent timeout handling, retry logic duplicated, harder to maintain and audit
- Fix approach: Refactor all `bb_fetch` calls to use `state.bb.as_ref().ok_or(...)?` via ServiceClient. The client is already instantiated; `bb_fetch` is legacy code.

**Messages Route Code Organization:**
- Issue: Single `messages.rs` file contains 2,800+ lines covering conversations, send, avatars, link previews, attachments, SSE bridge
- Files: `src-tauri/src/routes/messages.rs` (7 TODO comments marking extraction opportunities)
- Impact: Difficult to navigate, test, and modify. Lines 602, 1369, 1468, 1594, 2077, 2719 are extraction boundaries
- Fix approach: Split into sub-modules: `conversations.rs`, `send.rs`, `avatars.rs`, `link_preview.rs`, `attachments.rs`, `stream.rs`. Update `lib.rs` to re-export

**Regex Compilation Overhead in Chat Route:**
- Issue: `src-tauri/src/routes/chat.rs` compiles 6 regexes on every call instead of caching with `OnceLock`
- Files: `src-tauri/src/routes/chat.rs` (lines 279, 284, 289, 294, 299, 304, 309, 314) — note: some ARE using OnceLock, but multiple pattern-building functions compile inline
- Impact: Performance regression on every chat message processing, especially for image/attachment filtering
- Fix approach: Wrap all inline `Regex::new()` calls in `OnceLock` statics (matches pattern already used in `messages.rs`)

**AppState.db Allocated but Unused:**
- Issue: `AppState` holds a `SqlitePool` (local database) that is never queried from any route handler
- Files: `src-tauri/src/server.rs` (field definition), no queries found anywhere
- Impact: Wasted memory and startup time. No code currently depends on it
- Fix approach: Remove `db: SqlitePool` from `AppState` and all initialization code. If offline-first sync ever needs local SQLite, re-add with actual usage

**Pipeline Routes Multiple Unwrap Calls:**
- Issue: Routes in `src-tauri/src/routes/pipeline/` use `unwrap_or_default()` and `.unwrap()` extensively
- Files: `src-tauri/src/routes/pipeline/registry.rs:56`, `complete.rs:87`, `spawn.rs`, `helpers.rs` (20+ instances)
- Impact: Silent failures if JSON parsing fails; user sees empty data instead of error message
- Fix approach: Replace with `.ok_or_else()` to return meaningful error responses

**Duplicate Supabase Client Initialization:**
- Issue: `SupabaseClient::from_env()` pattern was used historically; unclear if centralized AppState client exists
- Files: `src-tauri/src/supabase.rs` contains client builders; routes may still call `from_env()` directly
- Impact: Inconsistent configuration, harder to rotate credentials, potential race conditions if called during session refresh
- Fix approach: Audit all routes to ensure they use `state.supabase` or equivalent singleton, not `from_env()`

---

## Known Bugs

**Supabase Realtime 503 Error (Infrastructure):**
- Symptoms: Realtime subscriptions fail with 503 Service Unavailable on services-vm
- Files: N/A (infrastructure issue, not code)
- Trigger: Supabase container (realtime service) in docker-compose
- Workaround: `ssh services-vm "cd ~/supabase/docker && docker compose restart realtime"`
- Status: Documented in project memory as known infrastructure issue

---

## Security Considerations

**Origin Header Bypass in Auth Middleware (CRITICAL):**
- Risk: Any localhost process can bypass origin checks and POST auth codes
- Files: `src-tauri/src/server.rs` (auth middleware logic)
- Current mitigation: `MC_API_KEY` prevents unauthorized access, but origin check is loose
- Recommendations:
  - Verify that WebView origin is strict (should be appid-specific)
  - Audit auth middleware to ensure origin validation is not bypassable
  - Consider CSRF token on OAuth callback instead of origin-only validation

**Keychain Secrets Written to Process Environment (MEDIUM):**
- Risk: Historical issue where secrets loaded via `load_env_vars()` were written to process-wide env vars, visible in `/proc/PID/environ`
- Files: `src-tauri/src/secrets.rs` (load_env_vars function, line 127)
- Current mitigation: CLAUDE.md states secrets go through AppState.secret() not std::env, but confirm all call sites follow this
- Recommendations:
  - Audit all routes to confirm no calls to `std::env::var("BLUEBUBBLES_PASSWORD")` etc.
  - Ensure only development fallback (`dotenvy::dotenv()`) uses env vars, not production flow

**CSP Script-Src Misconfiguration (MEDIUM):**
- Risk: Audit report from 2026-03-14 flagged `unsafe-inline` in script-src CSP
- Files: `src-tauri/src/main.rs` (Tauri CSP configuration)
- Current mitigation: Tauri's WebView runs in a confined context, but CSP should still be strict
- Recommendations:
  - Remove `unsafe-inline` from script-src
  - Use nonces for any inline `<style>` tags (e.g., in Messages page)
  - Verify all scripts are external and integrity-checked

**Shell Permission Too Broad (MEDIUM):**
- Risk: Shell permission set to `http://**` allows any HTTP URL, should be HTTPS-only
- Files: `src-tauri/tauri.conf.json` or equivalent (shell allowlist)
- Current mitigation: Tauri sandboxes shell access, but should be restricted further
- Recommendations:
  - Change `http://**` to `https://**` only
  - Whitelist specific domains if possible (OpenClaw, BlueBubbles, Supabase)

**SSRF Protection Regex Patterns (LOW):**
- Risk: Private IP range detection uses custom regexes instead of standard library (potential bypass)
- Files: `src-tauri/src/routes/messages.rs` (lines 1604-1616, link preview SSRF check)
- Current mitigation: 15+ regex patterns cover common private ranges
- Recommendations:
  - Consider using `ipnetwork` crate for RFC-compliant range checking
  - Add unit tests for regex patterns (currently not tested)
  - Document why custom approach was chosen over standard library

**API Key Stored on Window Global (MEDIUM):**
- Risk: MC_API_KEY was exposed on `window.apiKey` in old code, visible to any XSS
- Files: Unclear if fixed in current frontend; audit required
- Current mitigation: Should be passed only in X-API-Key header via fetch wrapper
- Recommendations:
  - Verify `window.apiKey` is never exposed
  - Confirm all API calls use fetch wrapper from `lib/api.ts`
  - Test XSS protection via CSP

---

## Performance Bottlenecks

**Will-Change: Transform Applied Globally (GPU Memory):**
- Problem: `.card` elements have `will-change: transform` which reserves GPU memory
- Files: `frontend/src/globals.css` (lines 518, 521)
- Cause: Premature optimization; should only be applied during animations
- Improvement path:
  - Remove global `will-change: transform` from `.card`
  - Apply only when animation is active via `.card.animating { will-change: transform }`
  - Monitor GPU memory usage before/after

**Inline `<style>` Tag in Messages (Re-render Cost):**
- Problem: Messages page re-injects `<style>` tag on every render, causing recalc of all message styles
- Files: `frontend/src/pages/Messages.tsx` (style tag location unclear; audit needed)
- Cause: Styles should be in external CSS or CSS-in-JS, not inline HTML
- Improvement path:
  - Move styles to `messages.css` or emotion/styled-components
  - Measure paint time before/after removal

**Fullscreen Polling Every 1 Second (Event Listener Missed):**
- Problem: Fullscreen state changes polled via interval instead of using fullscreenchange event
- Files: Unclear; audit required
- Cause: Developer may not have known about fullscreenchange event
- Improvement path:
  - Replace interval with `document.addEventListener('fullscreenchange', ...)`
  - Test on multiple browsers (Safari, Firefox, Chrome)

**Conversation List Virtualization (Already Done):**
- Status: GOOD — virtualized with `@tanstack/react-virtual`

**Message Thread NOT Virtualized (Expected):**
- Status: KNOWN LIMITATION — variable message heights cause jank, accept as-is

---

## Fragile Areas

**Keybindings Sync via Index (Fragile Diffing):**
- Files: `frontend/src/lib/keybindings.ts` (uses `useSyncExternalStore`)
- Why fragile: Index-based diffing breaks if shortcuts are reordered (e.g., user adds one at position 0)
- Safe modification:
  - Add a unique `id` field to each keybinding
  - Diff by ID, not index position
  - Validate that all keybindings have IDs before sync
- Test coverage: Unit tests for keybindings logic exist but may not cover reordering scenario

**Event Listener Leak in Settings Keybinding Editor (FIXED?):**
- Files: `frontend/src/pages/settings/` (keybinding editor)
- Why fragile: Event listeners registered but never removed during component cleanup
- Safe modification:
  - Add `useEffect(() => { const handler = ...; element.addEventListener(...); return () => element.removeEventListener(...); }, [])`
  - Test that closing the modal twice doesn't leak listeners
- Test coverage: No specific test for listener cleanup

**Object URL Leak in useMessageCompose (FIXED?):**
- Files: `frontend/src/hooks/messages/useMessageCompose.ts`
- Why fragile: `resetCompose()` may not call `URL.revokeObjectURL()` for audio/preview blobs
- Safe modification:
  - Ensure every `URL.createObjectURL()` has corresponding `revokeObjectURL()` call
  - Consider wrapper: `const createBlobUrl = (blob) => { const url = URL.createObjectURL(blob); return { url, revoke: () => URL.revokeObjectURL(url) }; }`
- Test coverage: No specific test for blob cleanup

**Sidebar Settings Sync via localStorage + Supabase (Race Condition Risk):**
- Files: `frontend/src/lib/sidebar-settings.ts` (useSyncExternalStore)
- Why fragile: Simultaneous local+remote writes can cause data loss
- Safe modification:
  - Implement CRDTs (conflict-free replicated data type) for sidebar config
  - Use Supabase's `eq()` filter to detect remote changes and merge manually
  - Add unit tests for concurrent write scenarios
- Test coverage: No test for concurrent local+remote updates

**Notes Content Loaded with Caching Bug Risk (FIXED?):**
- Files: `frontend/src/lib/vault.ts`, `frontend/src/hooks/notes/useVault.ts`
- Why fragile: Previous issue (2026-03-17) had content caching bug; similar patterns elsewhere could break
- Safe modification:
  - Review all cache invalidation logic in useVault
  - Add `hasFetchedFromBackend` flags to all cache patterns (like notes fix)
  - Test that switching notes shows correct content (not cached old content)
- Test coverage: Basic vault tests exist; add scenario tests

---

## Scaling Limits

**WebSocket Connection Limit (5 Concurrent):**
- Current capacity: 5 simultaneous WebSocket connections (chat + OpenClaw)
- Limit: Enforced via `MAX_WS_CONNECTIONS` in `src-tauri/src/routes/chat.rs`
- Scaling path:
  - Increase constant if user has multiple chat tabs or OpenClaw connections
  - Consider per-user connection pooling if many concurrent connections needed
  - Add monitoring for connection count in logs

**Chat SSE Connection Limit (5 Concurrent):**
- Current capacity: 5 simultaneous SSE streams
- Limit: Enforced via `MAX_CHAT_SSE_CONNECTIONS` in `src-tauri/src/routes/chat.rs`
- Scaling path: Same as WebSocket limit

**Supabase Sync Interval (30 seconds):**
- Current capacity: Push + pull cycle runs every 30s
- Limit: Will lag if >500 pending changes in local SQLite
- Scaling path:
  - Monitor `_sync_log` table size in logs
  - If approaching limits, reduce interval to 15s or batch changes differently
  - Consider immediate push for critical data (messages) vs. deferred push (habits)

**Avatar Cache (500 entry LRU):**
- Current capacity: 500 unique avatars (Arc<Vec<u8>>)
- Limit: Will evict oldest on 501st unique avatar
- Scaling path:
  - Increase cap to 1000 for large group chats
  - Consider separate cache for small (32px) vs. large (256px) avatars

**Link Preview Cache (500 entry LRU):**
- Current capacity: 500 unique link previews
- Limit: Will evict oldest on 501st unique preview
- Scaling path: Acceptable; most users won't hit this

---

## Dependencies at Risk

**Auto-Update Feature Commented Out (MEDIUM):**
- Risk: Tauri updater plugin is commented out (`Cargo.toml` line 50-51), no automatic updates
- Impact: Users must manually download new versions; security patches may not be applied
- Migration plan:
  - Uncomment `tauri-plugin-updater = "2"`
  - Implement update check on startup and in menu
  - Test update flow on all platforms (Linux, macOS, Windows)
  - Document update process in README

**Keyring Crate Dependency (MEDIUM):**
- Risk: Keyring depends on platform-specific backends (libsecret, macOS keychain, Windows credential manager)
- Impact: If keyring service is unavailable, app returns 503 and cannot start
- Current mitigation: Fallback to `.env.local` file (only in dev mode)
- Recommendations:
  - Add graceful degradation: if keychain unavailable, warn user but allow limited operation
  - Document workaround: set `MC_API_KEY` in `.env.local` manually

**RegEx Crate (LOW):**
- Risk: 15+ inline regex patterns in `messages.rs` for SSRF checking; regex DoS possible
- Current mitigation: Patterns are simple character ranges, not nested quantifiers
- Recommendations: No action needed; patterns are safe

**Tauri v2 Breaking Changes (LOW):**
- Risk: No explicit version pinning in Cargo.toml (uses `"2"` range)
- Impact: Minor updates could break compilation
- Recommendation: Pin to specific version (e.g., `"2.0.0"`) once stable

---

## Missing Critical Features

**No Update Mechanism:**
- Problem: Desktop app has no auto-update capability; users must manually check GitHub releases
- Blocks: Security patches, bug fixes, feature updates don't reach users
- Recommendation: Implement Tauri updater (plugin is ready, just commented out)

**VM Remote Desktop Viewer:**
- Problem: OpenClaw VM logs only available via SSH; no embedded desktop viewer
- Blocks: Users cannot monitor OpenClaw agent status without leaving the app
- Recommendation: Add Proxmox noVNC embedded viewer (MUST ADD per project memory)

**Mac Bridge Settings UI Missing:**
- Problem: Mac Bridge (Reminders, Notes, Contacts, Find My) configured via keychain but not visible in Settings → Connections
- Blocks: macOS users cannot verify or troubleshoot Mac Bridge connection
- Recommendation: Add Mac Bridge section to `frontend/src/pages/settings/SettingsConnections.tsx`

**Soft Delete / Recycle Bin Not Implemented:**
- Problem: Audit noted all deletions should be soft deletes (recycle bin like iOS)
- Blocks: Users cannot recover accidentally deleted missions, ideas, or notes
- Recommendation: Add soft delete to all mutation routes; implement recycle bin UI

---

## Test Coverage Gaps

**Messages Route E2E (Untested Area):**
- What's not tested: Full message send/receive flow with BlueBubbles, avatar caching, link preview OpenGraph extraction
- Files: `src-tauri/src/routes/messages.rs` (2800+ lines, likely <50% tested)
- Risk: Regression in message sending, avatar race conditions, SSRF bypass
- Priority: HIGH — Messages is critical user-facing feature

**Pipeline Route Mission Event Replay (Untested Area):**
- What's not tested: Mission event replay logic, replay_at timestamp validation, conflict resolution
- Files: `src-tauri/src/routes/pipeline/` (multiple files, <30% tested)
- Risk: Corrupted mission state if replay fails silently
- Priority: HIGH — Missions are core feature

**Sync Engine Push/Pull (Untested Area):**
- What's not tested: Conflict resolution (local wins), sync log cleanup, table name/row_id injection prevention
- Files: `src-tauri/src/sync.rs` (575 lines, likely <40% tested)
- Risk: Data corruption on concurrent edits, SQLite injection
- Priority: HIGH — Sync engine is critical for offline-first model

**OAuth Flow with Double-Click (FIXED but May Regress):**
- What's not tested: Double-click during OAuth flow, PKCE verifier storage race condition
- Files: `src-tauri/src/routes/auth.rs`
- Risk: Bug resurfaces if refactored without test
- Priority: MEDIUM — Bug was fixed (2026-03-17) but no regression test added

**Vault Image Attachment Reconstruction (Untested Area):**
- What's not tested: CouchDB chunk reassembly, base64 padding per-chunk, binary file filtering
- Files: `src-tauri/src/routes/vault.rs`
- Risk: Corrupted image data, crashes when viewing notes with images
- Priority: MEDIUM — Notes feature is in use but image handling is complex

**MFA Verification Hard Gate (Partially Tested):**
- What's not tested: `RequireAuth` extractor actually rejects requests when `mfa_verified=false`
- Files: `src-tauri/src/server.rs` (lines 150-165)
- Risk: If `mfa_verified` check is bypassed, user can access data without 2FA
- Priority: CRITICAL — Security

---

## Code Quality Issues

**Inconsistent Error Handling (Error Strings vs. AppError):**
- Problem: Routes use both `Err("bluebubbles_not_configured")` and `AppError::BadRequest(...)`
- Files: `src-tauri/src/routes/messages.rs` (lines 116, 1225, 1306, 2333) return string errors; other routes use `AppError`
- Impact: Inconsistent client response format, difficult to parse
- Fix approach: Define `AppError::NotConfigured(service_name)` variant, use consistently

**Hardcoded Magic Numbers in Regex/Limits:**
- Problem: WebSocket limit `5`, SSRF regex patterns, timeout values scattered throughout code
- Files: Multiple (chat.rs, messages.rs, service_client.rs)
- Impact: Hard to adjust limits, easy to forget all call sites
- Fix approach: Centralize in `src-tauri/src/config.rs` with named constants

**Unused Imports and Dead Code:**
- Problem: Audit found lib/i18n.ts, lib/page-cache.ts (only in tests), old lib/supabase.ts unused
- Files: Multiple frontend files
- Impact: Maintenance burden, confusion about which code is live
- Fix approach: Delete unused files, run cargo/npm clippy regularly

---

## Deployment & Infrastructure

**No Docker Multi-Stage Build (Potential Large Binary):**
- Problem: Unclear if release builds use aggressive optimizations (strip, LTO, single codegen unit)
- Files: `src-tauri/Cargo.toml` (profile.release configured, but unclear if used in CI)
- Impact: Binary size could be 50+ MB, slow downloads for self-hosted users
- Recommendation: Verify CI uses `--release` and `strip = true` for final binary

**Cross-Platform Testing Limited:**
- Problem: Primary dev on Linux/macOS; Windows build untested
- Impact: Tauri window features, system tray, file paths could break on Windows
- Recommendation: Add Windows CI runner (GitHub Actions Windows runner)

**Mac Bridge Only Works on macOS (Design, Not a Bug):**
- Problem: Apple-specific features (Reminders, Notes, Find My) not available on Linux/Windows
- Impact: Feature parity gap on non-macOS
- Recommendation: Document clearly in README; consider web-based sync alternative

**Supabase Self-Hosting Complexity:**
- Problem: User must run docker-compose on services-vm; schema migrations require SSH tunneling and manual SQL in some cases
- Impact: Difficult deployment, easy to make mistakes
- Recommendation: Provide automated deploy script or Ansible playbook

---

## Architecture Concerns

**Dashboard Mixes useState + React Query + Manual Fetch:**
- Problem: Inconsistent state management patterns in dashboard (2026-03-14 audit finding)
- Files: `frontend/src/pages/Dashboard.tsx` (large file, mixed patterns)
- Impact: Hard to add caching, prefetch, optimistic updates
- Fix approach: Audit all dashboard queries, migrate to centralized React Query keys

**Window.dispatchEvent for Title Bar Communication (Violates CLAUDE.md):**
- Problem: Title bar and sidebar use DOM events instead of reactive store
- Files: Unclear; audit needed (2026-03-14 audit flagged this)
- Impact: Fragile cross-component communication, hard to test
- Fix approach: Create `useTitleBarState()` hook using `useSyncExternalStore` (like sidebar-settings.ts)

**Two Supabase Client Files (Duplication):**
- Problem: `lib/supabase.ts` and `lib/supabase/client.ts` may have overlapping definitions
- Files: Both files in frontend
- Impact: Confusion about which to import; duplicated logic
- Fix approach: Audit both files, consolidate into single `lib/supabase/client.ts`, delete old file

---

## Summary & Remediation Priority

**CRITICAL (Fix Now):**
1. Origin header bypass in auth middleware
2. MFA verification hard gate test coverage
3. SSRF regex pattern unit tests

**HIGH (Fix This Week):**
1. Messages route code splitting (extract 2800+ line file)
2. Pipeline routes unwrap error handling
3. Sync engine test coverage

**MEDIUM (Fix Next Sprint):**
1. BlueBubbles migration to ServiceClient
2. Chat regex OnceLock optimization
3. Keybindings index-based diffing (switch to IDs)
4. Keychain secrets in process env (audit)

**LOW (Fix When Updating Area):**
1. Will-change: transform global removal
2. Inline style tag in Messages
3. Unused code cleanup (i18n, page-cache, old supabase.ts)

---

*Concerns audit: 2026-03-19*
