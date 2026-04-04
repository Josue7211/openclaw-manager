# Pitfalls Research

**Domain:** Stabilization/cleanup pass on a rapidly-built Tauri v2 + React 18 + Rust/Axum app (v0.0.4)
**Researched:** 2026-03-24
**Confidence:** HIGH (pitfalls derived directly from codebase analysis of 44 route modules, 30+ widgets, 29 lazy pages, 106 test files, plus documented community patterns)

## Critical Pitfalls

### Pitfall 1: Over-Deleting Dynamic Imports That Look Unused

**What goes wrong:**
Static analysis (grep, IDE "find usages", Knip) reports a component or module as "unused" because it is only referenced via dynamic `import()` expressions in the widget registry, `React.lazy()` calls, or string-based module IDs. Developer removes it. App compiles. TypeScript is happy. But at runtime, when a user navigates to that page or drops that widget onto their dashboard, the dynamic import fails with a chunk loading error and the UI shows a blank Suspense fallback or crashes into an error boundary.

**Why it happens:**
This codebase has 3 layers of dynamic imports that defeat static analysis:

1. **30+ widget components** loaded via `() => import('@/components/widgets/FooWidget')` in `widget-registry.ts` (lines 91-514) -- these files are never statically imported anywhere in the codebase
2. **29 lazy-loaded route pages** via `React.lazy(() => import('./pages/Foo'))` in `main.tsx` (lines 17-46) -- the only reference is the `lazy()` call, not a direct import
3. **9 wizard steps** lazy-loaded in `SetupWizard.tsx` -- conditional rendering means they never appear in normal usage

The widget registry is the highest-risk surface. Each widget's `component` field is a factory function returning a dynamic import. The file that is imported (e.g., `TerminalWidget.tsx`) has zero static importers. Any tool that scans for `import FooWidget from` will report it as dead code.

Additionally, 5 lazy-loaded shell components in `LayoutShell.tsx` (CommandPalette, KeyboardShortcutsModal, SetupWizard, ThemePicker, GuidedTour) are conditional on user actions -- they will never show up in a static import scan.

**How to avoid:**
- Before removing ANY file under `components/widgets/`, `pages/`, or `components/wizard/`, search `widget-registry.ts`, `main.tsx`, `LayoutShell.tsx`, and `SetupWizard.tsx` for the filename
- Run Knip with explicit entry points that include the widget registry: configure `knip.json` to recognize `widget-registry.ts` component fields as entry points
- Create a pre-deletion validation script: for each file proposed for deletion, grep all `import(` expressions for matching paths
- Never batch-delete files -- delete one file, verify the app still loads every route and renders every widget type, then proceed
- After each deletion, run `cd frontend && npx vitest run` to catch broken test imports

**Warning signs:**
- Knip or manual analysis flags files under `components/widgets/` or `pages/` as unused
- A component has zero imports but its filename appears inside an `import()` string literal
- Suspense fallbacks suddenly appearing where pages used to render
- Console errors: `Failed to fetch dynamically imported module`
- Widget grid shows blank cells where widgets should be

**Phase to address:**
Dead code stripping phase. Must run automated checks BEFORE and AFTER every deletion. The deletion verification loop is: delete file -> build -> load every route -> open widget picker and verify every widget renders -> run tests -> commit.

---

### Pitfall 2: Removing "Dead" Rust Route Handlers Called by External Systems

**What goes wrong:**
A Rust route handler in `src-tauri/src/routes/` appears unused because no frontend `api.get`/`api.post` call references its path. Developer removes the handler and its `.merge()` registration in `routes/mod.rs`. But an external system -- the OpenClaw gateway, a webhook, the Mac Bridge, Supabase Realtime, or a CI pipeline -- was calling that endpoint. The external integration silently breaks. No compile error, no test failure, no visible UI change until someone tries to use the feature.

**Why it happens:**
The codebase has 44 route modules merged into the main router in `routes/mod.rs`. Several routes exist specifically as targets for external callers:

- **`events.rs`** -- connects to Supabase Realtime via WebSocket, pushes to frontend via SSE. The frontend calls the SSE endpoint, but Supabase pushes TO the backend.
- **`deploy.rs`** -- triggered by external CI/deployment systems
- **`pipeline/agents.rs`** -- called by pipeline orchestration agents
- **`terminal.rs`** -- bidirectional WebSocket PTY relay (browser connects IN)
- **`claude_sessions.rs`** -- WebSocket relay to OpenClaw VM (browser connects IN, handler connects OUT to upstream)
- **`vnc.rs`** -- noVNC proxy (browser connects IN)
- **`cache.rs`** -- cache-refresh endpoint may be called by external scripts
- **`gateway.rs`** -- OpenClaw gateway callback target

Rust's compiler will NOT warn about unused route handlers because they ARE used -- by the Axum router via `.route()` registration. The compiler only sees the function referenced in the router builder. The only way to know if an external system calls them is to audit external codebases or monitor traffic.

Additionally, 7 handler functions already have `#[allow(dead_code)]` annotations (in `pipeline/agents.rs`, `pipeline/helpers.rs`, `auth.rs`, `bjorn.rs`, `media.rs`) -- these were intentionally kept despite appearing unused.

**How to avoid:**
- Before removing any route handler, check BOTH:
  1. Frontend grep: `grep -r "/api/[route-path]" frontend/src/`
  2. External caller audit: is this endpoint a webhook target, callback URL, WebSocket relay, or SSE source?
- Mark routes with caller comments: `// Called by: frontend`, `// Called by: OpenClaw gateway`, `// Called by: external webhook`
- Routes with `WebSocketUpgrade` are ALWAYS called by external clients (browser or upstream relay) -- never remove without verifying the WebSocket client is also being removed
- Create an API inventory document mapping every route to its callers before deleting any handlers
- The `#[allow(dead_code)]` annotations are a signal, not a cleanup target -- review each before removing

**Warning signs:**
- Handler has `#[allow(dead_code)]` (intentionally kept)
- Route is in `mod.rs` but zero frontend `api.*` calls reference its path
- Route handler takes `WebSocketUpgrade` -- always has an external/browser caller
- Route is under `pipeline/` -- pipeline orchestration runs outside the app process
- Route uses `events::router()` -- this is the Supabase Realtime bridge, not a standard CRUD endpoint

**Phase to address:**
API route audit phase. Must complete a full route inventory mapping every handler to its callers BEFORE removing any handlers. This phase must come before dead code stripping.

---

### Pitfall 3: Breaking Widget Registry Integrity and Persisted Dashboard State

**What goes wrong:**
During cleanup, a developer modifies `widget-registry.ts` -- removing a widget definition, renaming an ID, or changing the import path. Existing dashboard layouts stored in localStorage (key: `dashboard-state`) and synced to Supabase (`preferences-sync.ts`) reference the old widget ID by string. When the app loads, the grid tries to instantiate a widget whose type no longer exists in the registry. `WidgetWrapper` either crashes (no fallback) or renders a blank cell. The user's carefully arranged multi-page dashboard is silently broken.

**Why it happens:**
The widget registry is a runtime registry with 30+ entries. Dashboard state is persisted as JSON containing widget instances with a `type` field that matches a registry key (e.g., `"todos"`, `"terminal"`, `"clock"`). These strings are NOT validated at compile time. If a registry entry is removed or its key changes, the string reference becomes a dangling pointer to nothing.

This is compounded by:
1. **Bjorn AI modules** which dynamically call `registerWidget()` with arbitrary IDs stored in Supabase -- removing or changing `registerWidget`'s signature breaks all AI-created widgets
2. **Dashboard presets** (7 defined in codebase) which hardcode widget type strings -- removing a type breaks preset application
3. **Multi-device sync** -- user's desktop has the old widget, mobile Supabase has the old state, new cleanup code doesn't recognize either

**How to avoid:**
- Never remove a widget registry entry without first searching for its type string in: `dashboard-state` localStorage, Supabase `preferences` table, preset definitions, and test files
- Add a migration step in `lib/migrations.ts` that removes instances of deleted widget types from persisted dashboard state
- When renaming a widget ID, add a migration mapping old ID -> new ID in dashboard state
- Test by: saving a dashboard with the target widget, performing the cleanup, reloading, verifying no blank cells or crashes
- The `registerWidget` function and `WidgetDefinition` type are effectively public API for Bjorn -- do not change signature without updating `bjorn-store.ts`
- 11 primitive widgets registered in `components/primitives/register.ts` have their own registration flow -- verify these survive cleanup too

**Warning signs:**
- Dashboard loads with blank grid cells where widgets used to render
- Console errors about unknown widget type or missing definition
- Bjorn modules stop rendering after cleanup
- Widget Picker shows fewer widgets than expected
- `WidgetWrapper` falls through to error boundary

**Phase to address:**
Widget cleanup phase. Every removed widget type MUST have a corresponding localStorage migration entry. Test with a pre-cleanup dashboard snapshot.

---

### Pitfall 4: Cleanup Commits That Introduce Silent Behavioral Regressions

**What goes wrong:**
A cleanup commit removes or refactors 20+ files at once. Tests pass. TypeScript compiles. Cargo builds. But a subtle behavioral regression slips through: a React Query key was changed so caches no longer invalidate, an event-bus subscription was removed so unread badges stop counting, a CSS class was renamed breaking a hover state, or a `useSyncExternalStore` subscriber was removed breaking cross-component reactivity.

**Why it happens:**
55 phases built in 2 days means the codebase has many "invisible dependency" patterns that TypeScript cannot validate:

1. **React Query keys** in `query-keys.ts` (49 keys) -- cache invalidation depends on string array matching, not type checking. Changing `['gateway', 'status']` to `['gatewayStatus']` breaks every `invalidateQueries` call that uses the old key.
2. **Event bus** (`event-bus.ts`) -- `emit('new-message')` in `useMessagesSSE.ts`, `subscribe('new-message')` in `unread-store.ts`. No compile-time link between emitter and subscriber. Removing the emitter silently kills the subscriber.
3. **localStorage keys** -- 15+ keys scattered across modules (e.g., `sidebar-config`, `dashboard-state`, `theme-state`, `enabled-modules`, `setup-complete`, `error-reporting`), all referenced by string.
4. **CSS class dependencies** -- hover utilities (`.hover-bg`, `.hover-bg-bright`), CSS variables (`var(--accent)`, `var(--ease-spring)`), z-index layers (`var(--z-sidebar)`, `var(--z-modal)`)
5. **`useSyncExternalStore` stores** -- `keybindings.ts`, `sidebar-settings.ts`, `titlebar-settings.ts`, `modules.ts` -- subscribers are decoupled from the store by design. Modifying the store's `getSnapshot` changes behavior in every consuming component.

Large cleanup commits make it impossible to `git bisect` which deletion caused the regression. The 106 test files and 1039 tests provide coverage but NOT for cross-module integration behavior (e.g., "does completing a todo emit an event that updates the sidebar unread badge?").

**How to avoid:**
- One logical change per commit. "Remove unused FooWidget" is one commit. "Remove unused BarWidget" is another. Never "Remove 15 unused components" in one commit.
- After each commit, run the full test suite: `cd frontend && npx vitest run` + `cd src-tauri && cargo test`
- For event-bus changes: grep for BOTH `emit('event-name')` AND `subscribe('event-name')` -- removing an emitter while a subscriber exists creates a silent dead subscription
- For React Query key changes: grep for the key array literal in ALL files, not just the definition file
- For localStorage key changes: search for the exact string key across the entire codebase
- For CSS changes: search for the class name or variable name in all `.tsx` and `.css` files
- Verify after cleanup: change a setting, verify it propagates without page reload. Send a message, verify badge updates. Change theme, verify all pages reflect it.

**Warning signs:**
- Sidebar unread badges stuck at zero
- Dashboard widgets show stale data that never refreshes
- Theme changes don't propagate to all components
- Keyboard shortcuts stop working
- Settings changes require page reload to take effect
- Notification sounds stop playing

**Phase to address:**
Every cleanup phase. Single-purpose commits are a mandatory process rule, not a suggestion. No exceptions for "simple" cleanups.

---

### Pitfall 5: Removing Wrong-But-Functional OpenClaw Code Before Fixing It

**What goes wrong:**
The v0.0.3 OpenClaw pages (Agents, Sessions, Tools, Models, Skills, Usage, Approvals, CronJobs, Remote Viewer, Activity) were built against assumed API shapes, not the verified gateway protocol. During cleanup, a developer sees these "wrong" handlers and removes them as broken code. But now there is NO code for these features. When the correct gateway integration is wired later, everything must be rebuilt from scratch instead of corrected in place.

**Why it happens:**
The PROJECT.md explicitly states: "many pages use assumed API shapes, not verified against actual gateway protocol." The natural cleanup impulse is to remove wrong code. But wrong code that is structurally 70-80% correct is far more valuable than no code. The existing handlers have:
- Correct Axum route structure with `RequireAuth` middleware and `AppState`
- Correct frontend React Query patterns with proper `queryKey` definitions, loading/error states
- Correct TypeScript interfaces (even if field names are wrong)
- Correct error handling via `AppError` with status codes
- Correct UI layout, accessibility (aria labels, keyboard navigation), and responsive design
- Correct WebSocket upgrade patterns with CAS connection guards

Only the API endpoint paths, request/response field names, and protocol-specific behaviors need correction. Removing the handlers throws away all the surrounding infrastructure that IS correct.

The gateway hooks demonstrate this clearly: `useGatewaySessions` (hooks/sessions/useGatewaySessions.ts) already has a fallback chain (try gateway -> fall back to CLI -> handle demo mode). The architecture is right. The endpoint path may be wrong.

**How to avoid:**
- Fix first, strip second. Correct the gateway integration BEFORE stripping dead code. The order matters.
- For handlers where the correct API is unknown, add `// TODO(v0.0.4): verify against gateway protocol v3` comments instead of deleting
- Distinguish between "wrong integration" (keep, fix later) and "dead feature stub" (safe to remove). Example: TipTap references are dead stubs (TipTap was never integrated). OpenClaw pages are wrong integrations (the feature exists, the wiring is just incorrect).
- The reference docs in memory (`reference_openclaw_complete.md` with all 88 methods, `reference_openclaw_gateway_protocol.md`) provide the correct shapes -- use them to FIX, not to justify deletion
- Frontend hooks (`useOpenClawModels`, `useOpenClawTools`, `useOpenClawSkills`, `useOpenClawUsage`, `useBudgetAlerts`, `useGatewaySessions`, `useGatewayStatus`, `useSessionOutput`, `useSessionHistory`, `useApprovals`) are architecturally sound and should be corrected, not removed

**Warning signs:**
- PRs that delete files under `pages/openclaw/`, `pages/sessions/`, `pages/agents/`, `pages/approvals/`, `pages/remote/`, `pages/status/`, `pages/activity/`
- PRs that delete hooks under `hooks/sessions/`, `hooks/useOpenClaw*`, `hooks/useApprovals`, `hooks/useBudgetAlerts`
- PRs that delete route handlers: `gateway.rs`, `claude_sessions.rs`, `terminal.rs`, `vnc.rs`, `openclaw_cli.rs`, `openclaw_data.rs`, `approvals.rs`
- Any justification that says "this doesn't work right, so remove it"

**Phase to address:**
Gateway integration fix phase MUST be the first phase, before any dead code stripping. The sequence is: audit -> fix integrations -> THEN strip genuinely dead code.

---

### Pitfall 6: Breaking CouchDB LiveSync Chunk Reassembly Logic

**What goes wrong:**
The notes/vault system (`vault.rs` backend + `lib/vault.ts` frontend) handles Obsidian LiveSync's complex document format. During cleanup, a developer "simplifies" the chunk reassembly logic, removes encoding detection functions, or changes the LiveSync document filtering. Notes that were readable become garbled, images fail to render, or notes in subdirectories 404.

**Why it happens:**
The LiveSync format has many non-obvious rules that LOOK like unnecessary complexity:
- A note is NOT a single CouchDB document. It is a parent doc + N child chunk docs (`h:*` prefix).
- `children` array in parent doc references chunk IDs. `eden` field contains inline chunks not yet graduated to standalone docs.
- Chunk data encoding varies by type: `newnote` = base64-encoded, `plain` = raw text. The `decode_chunk_data` function in `vault.rs` handles this.
- Image attachments must be decoded chunk-by-chunk to bytes, concatenated, then re-encoded as base64. Per-chunk base64 padding breaks simple string concatenation.
- `is_attachment()` checks file extensions to skip `decode_chunk_data` for binary files (PNG bytes are not valid UTF-8).
- Internal LiveSync docs (`h:*`, `ps:*`, `ix:*`, `cc:*`, `_design/*`) must be filtered on both backend AND frontend.
- Hidden files use `i:` prefix (not `!:`); filter with `.obsidian` substring match + `!:` + `!_` prefixes.
- Doc IDs containing slashes (e.g., `homework/image.png`) break path-param routing. The query-param pattern (`/vault/doc?id=...`) exists specifically for this.
- Request logger in `server.rs` skips paths ending in `.png` -- this is intentional to avoid flooding logs with image requests.

Each of these looks like "over-engineering" but exists because of a real LiveSync edge case that caused data loss during development.

**How to avoid:**
- Do NOT modify `vault.rs` chunk reassembly, `decode_chunk_data`, `is_binary_note_type`, `is_attachment`, or LiveSync filter predicates during general cleanup
- Add the comment `// SAFETY: LiveSync format requirement -- do not simplify without testing against real vault` to each encoding/decoding function
- If vault code MUST be touched, test with a real CouchDB instance containing: plain text notes, notes with embedded images, notes in nested folder paths (slashes in IDs), notes with `eden` inline chunks, notes of type `newnote` vs `plain`
- The query-param route pattern (`/vault/doc?id=...`) is NOT a "cleanup target" -- it is required because browsers decode `%2F` in URL paths back to `/`, breaking path-based routing for notes in subdirectories

**Warning signs:**
- Notes appear empty or with garbled content after cleanup
- Image attachments fail to render (broken base64)
- Notes in subdirectories (e.g., `folder/note.md`) return 404
- Base64 decode errors in console
- Vault note count drops (internal docs leaking into visible list, or visible docs being filtered out)

**Phase to address:**
Notes verification phase. If vault code is touched at all, verify against real CouchDB data with the specific test cases above. Preferably, mark vault code as "do not touch during v0.0.4 cleanup" unless there is a specific bug.

---

### Pitfall 7: Orphaning WebSocket Connection Guards (Permanent Connection Refusal)

**What goes wrong:**
The codebase has at least 3 WebSocket endpoints with CAS (Compare-And-Swap) connection limiters using RAII guards:
1. `chat.rs` -- `WsConnectionGuard` with `ACTIVE_WS` AtomicU32 (max connections enforced)
2. `claude_sessions.rs` -- `SessionWsGuard` with `ACTIVE_SESSION_WS` AtomicU32 (max 5)
3. `terminal.rs` -- terminal PTY WebSocket (likely similar pattern)

During cleanup, if a developer removes or refactors a WebSocket handler without preserving the RAII guard lifecycle, the atomic counter increments on connection open but never decrements on close. After N connections (the CAS limit), NO new WebSocket connections can be established for the rest of the session. Users see "too many WebSocket connections" permanently until they restart the app.

**Why it happens:**
The CAS guard pattern works via RAII: the guard struct's `Drop` implementation decrements the atomic counter. If refactoring:
1. Moves the guard creation but not the guard ownership into `on_upgrade`
2. Removes the `_guard` parameter from the WebSocket handler (causing it to drop immediately after upgrade, not after disconnect)
3. Changes error handling so the guard is dropped on the success path but not on error paths (or vice versa)
4. Accidentally creates two guards for one connection (counter incremented twice, decremented once)

These bugs are invisible in testing unless you specifically test: open connection -> close connection -> open another connection.

**How to avoid:**
- When modifying any file with `WebSocketUpgrade`, verify the guard lifecycle:
  1. Guard created BEFORE `on_upgrade` call
  2. Guard MOVED INTO the `on_upgrade` closure (not cloned, not referenced)
  3. Guard held as `_guard` parameter for entire duration of the async handler function
  4. No early returns before `_guard` is moved into the closure
- Never remove `WsConnectionGuard` or `SessionWsGuard` structs without also removing the corresponding `AtomicU32` counter AND the limit check
- Add integration test: connect WebSocket, disconnect, verify counter returns to 0, connect again
- The `session_ws_status` endpoint in `claude_sessions.rs` exposes the counter -- use it for health monitoring

**Warning signs:**
- "too many WebSocket connections" error after app has been running for a while
- WebSocket endpoints stop accepting connections but HTTP endpoints work fine
- Chat stops working, terminal stops connecting, but other pages are fine
- Counter value (visible via status endpoint) never returns to zero after all connections close

**Phase to address:**
WebSocket handler verification phase. Test the full connect -> use -> disconnect -> reconnect lifecycle for each WebSocket endpoint.

---

### Pitfall 8: Destroying useSyncExternalStore Reactivity Chains

**What goes wrong:**
Four critical cross-component state systems use `useSyncExternalStore`: `keybindings.ts`, `sidebar-settings.ts`, `titlebar-settings.ts`, and `modules.ts`. During cleanup, if a developer modifies a store's `subscribe`, `getSnapshot`, or notification logic, components silently stop reacting to state changes. Settings changes no longer propagate. The app appears to work but is actually frozen -- changes only take effect after page reload.

**Why it happens:**
`useSyncExternalStore` has a strict contract:
1. `getSnapshot` must return a value with stable identity (referential equality) when state has NOT changed, and a NEW reference when state HAS changed. Returning a new object on every call causes infinite re-renders. Returning the same cached object after a change causes missed updates.
2. `subscribe` must call the provided callback synchronously on every state change. Debouncing or batching breaks React's synchronous render guarantee.
3. The store module must be a true singleton -- the same object across all importers. If a refactoring creates a second module instance (e.g., by changing import paths or module resolution), components subscribe to different stores and stop communicating.

These stores power: keyboard shortcut dispatch, sidebar category layout/drag-drop, title bar auto-hide, and module enable/disable. Breaking any of them degrades a major UX surface without any error message.

**How to avoid:**
- Do NOT modify the store implementations (`keybindings.ts`, `sidebar-settings.ts`, `titlebar-settings.ts`, `modules.ts`) during general cleanup. They are load-bearing state infrastructure.
- If stores must be modified, verify the contract: `getSnapshot` returns stable refs (same `===` identity when state hasn't changed), `subscribe` fires synchronously
- Test by: changing a setting via the Settings page, then immediately verifying the change is reflected in all consuming components WITHOUT reload. Specifically:
  - Keybindings: reconfigure a shortcut, use it immediately
  - Sidebar: rename a category, verify it updates in the sidebar
  - Titlebar: toggle auto-hide, verify title bar behavior changes
  - Modules: disable a module, verify it disappears from sidebar
- Existing tests in `lib/__tests__/` cover unit behavior -- run them after any modification: `npx vitest run lib/__tests__/keybindings lib/__tests__/modules lib/__tests__/sidebar-settings`

**Warning signs:**
- Settings changes require page reload to take effect
- Sidebar category layout doesn't update after drag-drop
- Keyboard shortcuts stop working after visiting Settings
- Infinite re-renders (React DevTools performance tab shows constant renders)
- Module disable doesn't remove the item from sidebar until next navigation

**Phase to address:**
State/store verification phase. Smoke-test every store consumer pair after any cleanup that touches `lib/` files.

---

### Pitfall 9: Severing Background SSE/Realtime Subscription Chains

**What goes wrong:**
The app uses Server-Sent Events for message notifications (`useMessagesSSE` hook) and a server-side Supabase Realtime WebSocket (`events.rs`) to power live data updates. During cleanup, removing a "redundant" SSE hook or the Realtime connector silently kills background features: new message notifications stop arriving, dashboard widgets show stale data forever, mission status never updates, and the unread badge store (`unread-store.ts`) stops counting.

**Why it happens:**
Background subscriptions are architecturally invisible. They render nothing. They exist as `useEffect` hooks in top-level components or as background tokio tasks in Rust. Their absence causes no compile error, no test failure, and no visible UI breakage on the initial render. The breakage only appears when someone sends a message, updates a mission, or expects live data -- and nothing happens.

The dependency chains are:
```
events.rs (Supabase Realtime WS) -> SSE endpoint -> useRealtimeSSE hook -> queryClient.invalidateQueries() -> React Query refetch -> UI update

useMessagesSSE -> emit('new-message') -> unread-store subscribe -> sidebar badge count + notification sound
```

Each chain has 4-5 links. Removing ANY single link silently breaks everything downstream. And the old `useSupabaseRealtime` hook was already replaced by `useRealtimeSSE` (documented in the source as "Replaces the old useSupabaseRealtime hook") -- the naming history makes it easy to confuse which hook is current vs. legacy.

**How to avoid:**
- Map ALL background subscription chains BEFORE cleanup. Document: data source -> transport -> hook -> consumer -> UI effect.
- Never remove a `useEffect` that contains `subscribe(`, `EventSource`, or `new WebSocket(` without tracing the full chain to its UI consumer
- `events.rs` is the ONLY Supabase Realtime connector -- removing it kills ALL live data updates for the entire app. It is not redundant with React Query; it is the SOURCE that React Query consumes.
- `useMessagesSSE` is the ONLY source of push message notifications -- removing it kills badges AND notification chimes
- `useRealtimeSSE` is the current hook (not legacy) -- `useSupabaseRealtime` references in comments are historical
- Test by: making a data change via an external path (send iMessage via phone, update mission via Supabase dashboard), then verify the UI updates without manual page refresh

**Warning signs:**
- Dashboard widgets show data from page load time, never updating
- Message badge count frozen at zero despite new messages
- Notification sounds stop playing
- "Connected" status indicator shows disconnected
- Mission status changes visible in Supabase but not in the app

**Phase to address:**
Background/realtime verification phase. Must explicitly test every live update path end-to-end.

---

### Pitfall 10: Breaking Preferences Sync and localStorage Migration Chain

**What goes wrong:**
The app has a layered persistence system: localStorage (immediate, client-side) -> Supabase preferences table (cross-device sync). Additionally, `lib/migrations.ts` runs version migrations on localStorage schemas at startup. During cleanup, if a developer removes a "legacy" migration, renames a localStorage key, or modifies `preferences-sync.ts`, users lose their sidebar layout, dashboard configuration, theme, or module toggles.

**Why it happens:**
Preference data flows through multiple layers with complex interactions:
1. User changes a setting -> stored in localStorage immediately under a specific string key
2. `preferences-sync.ts` watches localStorage changes (via monkey-patching `localStorage.setItem`) and syncs to Supabase
3. On a fresh device, preferences are pulled from Supabase into localStorage
4. `migrations.ts` upgrades old localStorage schemas to current format at startup
5. Multiple stores (`sidebar-settings.ts`, `modules.ts`, dashboard store) read from localStorage at initialization

If cleanup removes a migration (thinking "it already ran on existing users"), a NEW user or a user on a new device will get unmigrated schema and corrupted state. If a localStorage key is renamed without updating the sync mapping, the preference "exists" in Supabase under the old key but is never read under the new key.

The monkey-patching of `localStorage.setItem` in `preferences-sync.ts` means the initialization ORDER of modules matters. If cleanup reorders imports, the patch may not be installed before a module writes to localStorage, causing that write to skip Supabase sync.

**How to avoid:**
- Never remove migrations from `migrations.ts` -- they must be idempotent and permanent (a new user will run ALL migrations from v1)
- When renaming a localStorage key, add a migration that copies old key -> new key AND update the Supabase sync mapping
- `preferences-sync.ts` monkey-patches `localStorage.setItem` -- do not modify its initialization order relative to other modules
- Test the full fresh-device flow: clear localStorage, clear Supabase preferences for test user, reload app, verify: sidebar layout restores, dashboard arrangement restores, theme applies, module toggles persist
- The highest-value keys to protect: `dashboard-state`, `sidebar-config`, `theme-state`, `enabled-modules`, `setup-complete`

**Warning signs:**
- Fresh installs show default settings instead of user preferences
- Sidebar layout resets after clearing browser cache
- Dashboard arrangement lost on new device
- Theme reverts to default after clearing localStorage
- Setup wizard re-appears for existing users

**Phase to address:**
Persistence verification phase. Must test the fresh-device restoration flow after any cleanup that touches `lib/` persistence code.

---

## Technical Debt Patterns

Shortcuts that seem reasonable during cleanup but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Batch-deleting 20+ files in one commit | Faster cleanup velocity | Impossible to `git bisect`, blame history destroyed, cannot revert one change without reverting all | Never |
| Removing `#[allow(dead_code)]` annotations without investigation | Cleaner compiler output | These were placed intentionally -- 7 instances mark struct fields for future use or API response types used only in deserialization | Only after verifying each case individually |
| Consolidating small Rust route modules into one large file | Fewer files to maintain | Merge conflicts on any route change, breaks per-module `#[cfg(test)]` test blocks, harder to locate handlers | Never for Axum routes |
| Removing demo mode data and stubs | Less code to maintain | Breaks open-source showcase, setup wizard demo, and screenshot generation (documented as a v1.0 feature) | Never -- demo mode is shipped, user-facing |
| Replacing fire-and-forget API calls with React Query mutations | "Consistent" data fetching pattern | Some calls (kill session, deploy, cache refresh) are one-shot actions that should NOT be cached, retried, or deduplicated | Only for data-fetching reads, never for one-shot POSTs |
| Inlining shared utility functions as "too small to justify a file" | Fewer files | Shared utilities (SecondsAgo, Toggle, LRUCache, PageErrorBoundary) are imported from 10+ locations -- inlining means 10+ copies to maintain | Never for utilities with 3+ importers |
| Removing test files for "trivial" utilities | Faster test suite | Those 106 test files (1039 tests) are the safety net for cleanup -- reducing them reduces cleanup safety | Never during a stabilization milestone |

## Integration Gotchas

Common mistakes when modifying external service connections during cleanup.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| OpenClaw Gateway | Removing gateway proxy handlers because API shapes look wrong | Fix the shapes against the documented protocol (88 methods in reference docs), preserve handler structure |
| CouchDB / LiveSync | Simplifying chunk reassembly because it "looks overcomplicated" | Every edge case in `vault.rs` exists because of a real LiveSync format behavior -- document with safety comments, do not simplify |
| BlueBubbles SSE | Removing message SSE hook as "duplicate" of React Query | SSE is the PUSH channel for new messages; React Query handles initial fetch and cache only. They serve different purposes. |
| Supabase Realtime | Removing `events.rs` WebSocket because "React Query already polls" | `events.rs` is the server-side Realtime connector that bridges Supabase changes to frontend SSE. React Query is the consumer, not the producer. |
| Mac Bridge | Removing reminders/contacts proxy as "unused on Linux" | Mac Bridge features are platform-conditional (enabled per-module). They must exist for macOS users even if they do nothing on Linux. |
| Tailscale verification | Removing `tailscale.rs` startup_verify as "unnecessary ceremony" | This is a security feature validating service IPs match expected Tailscale hostnames. Part of the zero-trust security model. |
| Terminal PTY WebSocket | Removing terminal WS handler because "the widget is niche" | Terminal widget is registered in widget-registry and may be on active user dashboards -- removal breaks persisted layouts |

## Performance Traps

Patterns that could be accidentally introduced during cleanup.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Removing `React.memo` from "simple" components | Cascading re-renders through virtualized lists | Keep `React.memo` on the documented set: ContactAvatar, GroupAvatar, NavSection, Toggle, SidebarQuickCapture | Conversation list with 500+ items |
| Eagerly importing widgets instead of lazy | Initial bundle grows, first paint slows | All widget `component` fields must remain as `() => import()` factory functions | Dashboard with 10+ widgets |
| Removing LRU caches as "premature optimization" | Re-fetching avatars and link previews on every render | LRU caches (500 entries, `Arc<Vec<u8>>`) exist because these are hot paths in message thread scrolling | Message thread with 100+ contacts/links |
| Replacing all `React.lazy` with static imports for "simplicity" | 29 pages loaded upfront, blocking first render | Keep lazy loading for all routes in `main.tsx` | Any route navigation |
| Removing Rust `bounded_cache` | Unbounded HashMap growth for avatar/link preview caches | Keep Arc-based bounded caches with explicit entry limits | Long-running sessions |
| Consolidating dashboard polling intervals | Either too frequent (battery drain) or too slow (stale data) | Current dual-interval (10s fast, 30s slow) is intentionally optimized per data type | Always |

## Security Mistakes

Security-relevant cleanup mistakes specific to this codebase.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Removing `sanitize_error_body` from gateway proxy | Internal IPs, API keys, file paths leaked to frontend via error messages | 5-layer sanitization function in `gateway.rs` -- never bypass, simplify, or remove |
| Removing `validate_gateway_path` | Path traversal allowing access to internal gateway endpoints via `..`, `?`, `#` injection | Keep validation for all user-influenced path segments |
| Simplifying `RequireAuth` extractor | MFA enforcement bypassed on data endpoints | `RequireAuth` checks `mfa_verified` -- removing it reduces auth to single-factor |
| Removing constant-time API key comparison | Timing side-channel attack on MC_API_KEY | `subtle::ConstantTimeEq` must remain for key comparison in auth middleware |
| Removing SSRF protection in link preview | Server-side requests to internal network IPs via crafted message links | DNS pinning via `reqwest .resolve()` in `messages.rs` is a deliberate SSRF mitigation |
| Exposing CouchDB credentials to frontend | Direct CouchDB access bypassing auth proxy | Vault proxy pattern (`/api/vault/*`) keeps CouchDB creds server-side only |
| Removing `audit.rs` append-only log | Loss of security event audit trail | Audit log is a security requirement (documented in SECURITY.md) |
| Removing `crypto.rs` zeroize-on-drop | Encryption keys linger in memory after use | `zeroize` crate usage is deliberate defense-in-depth |

## UX Pitfalls

User-facing issues that cleanup can introduce.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Removing loading/error/empty states from "fast" endpoints | Flash of empty content on slow connections, unhandled errors crash page | Keep all LoadingState/ErrorState/EmptyState components even for endpoints that seem fast |
| Removing `PageErrorBoundary` from "stable" pages | Unhandled promise rejection crashes the entire app instead of one page | Every lazy-loaded page needs its error boundary -- never remove |
| Renaming CSS custom properties | Theme system breaks, custom user themes produce wrong colors | Each CSS variable in `globals.css` is referenced by name in theme presets and user-saved themes. Renaming = breaking stored themes. |
| Removing keyboard shortcut support | Power users lose muscle memory, accessibility degrades | `keybindings.ts` is user-configurable -- shortcuts must persist across updates |
| Removing CommandPalette or GlobalSearch | Primary navigation for keyboard-only users eliminated | Both are lazy-loaded but critical -- they ARE the accessibility navigation layer |
| Removing notification sound/DND logic | Notifications either always play or never play | 4 independent toggles serve different use cases -- simplifying to fewer toggles breaks user expectations |
| Removing `DemoModeBanner` or demo data | Open-source users cannot evaluate the app without setting up full infrastructure | Demo mode is a documented showcase feature |

## "Looks Done But Isn't" Checklist

Things that appear cleaned up but are missing critical steps.

- [ ] **Widget removal:** Removed component file BUT forgot to add localStorage migration for persisted `dashboard-state` instances referencing the old widget type ID
- [ ] **Widget removal:** Removed widget from registry BUT forgot to update preset definitions that include that widget type
- [ ] **Route removal:** Removed Rust handler BUT forgot to remove its `.merge()` call in `routes/mod.rs` -- compile error if handler function is gone, shadow collision if only path changed
- [ ] **Route removal:** Removed backend route BUT forgot to remove the corresponding `queryKeys` entry -- dead key stays in `query-keys.ts`, invalidation code silently fails
- [ ] **Hook removal:** Removed a custom hook BUT a test file (`__tests__/`) still imports it -- 1039-test suite starts failing
- [ ] **Type removal:** Removed a TypeScript interface BUT test assertions still reference its shape -- test fails with non-obvious error
- [ ] **Query key change:** Changed a key array value BUT `invalidateQueries` calls elsewhere reference the old key by spreading/copying -- cache invalidation stops
- [ ] **Event bus cleanup:** Removed an `emit()` call BUT `subscribe()` listeners still exist -- dead listeners that will never fire, no error
- [ ] **CSS cleanup:** Removed a CSS class from `globals.css` BUT `className` strings in JSX still reference it -- element renders without styling, no compile/runtime error
- [ ] **Demo mode gap:** Removed real implementation BUT forgot to update `demo-data.ts` -- demo mode crashes or shows stale data
- [ ] **Onboarding wizard:** Removed a feature BUT setup wizard still has a step for configuring it -- wizard step shows blank form or errors
- [ ] **Module system:** Removed a page BUT `APP_MODULES` in `modules.ts` still lists its ID and route -- sidebar shows a link that navigates to nothing

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Over-deleted dynamic import (widget/page file) | LOW | `git log --diff-filter=D -- path/to/file` to find deletion commit, `git checkout <commit>^ -- path/to/file` to restore |
| Broken widget registry (missing type in dashboard state) | MEDIUM | Restore widget definition, add migration in `migrations.ts` to filter out unknown types from dashboard state, clear `dashboard-state` localStorage as immediate workaround |
| Orphaned WebSocket guard (counter stuck) | LOW | Restart app resets atomic counters, then fix guard lifecycle. No data loss. |
| Broken LiveSync chunks (vault data) | HIGH | If only reads are broken: fix code, data is intact in CouchDB. If write code mangled data via PUT: must restore from CouchDB compaction backup or Obsidian mobile backup. Test against a COPY of the database first. |
| Lost preferences (localStorage/Supabase desync) | MEDIUM | Supabase `preferences` table retains last-synced state. Manual `SELECT` and re-import to localStorage, then fix sync code. |
| Broken realtime chain (SSE/events disconnected) | LOW | Re-add the removed hook/module, verify event chain end-to-end. No data loss, only temporary staleness. |
| Wrong gateway handlers deleted (no code to fix) | HIGH | Must re-implement from scratch if deletion was committed and pushed. All structure, types, UI, tests gone. Always verify before deleting. |
| Silent regression in mega-commit (20+ files) | HIGH | Cannot `git bisect` within one commit. Must manually inspect the entire diff and test each change individually. Prevention (single-purpose commits) is dramatically cheaper than recovery. |
| Broken store reactivity (useSyncExternalStore) | MEDIUM | Revert the store modification. Then understand the contract before re-attempting. Incorrect fixes tend to cascade (e.g., fixing getSnapshot by creating new objects causes infinite renders). |

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Over-deleting dynamic imports | Dead code stripping (with pre-check script) | Navigate every route, open widget picker, verify every widget type renders |
| Removing external-caller routes | API route audit (FIRST phase, before any deletion) | Document every route's callers in code comments |
| Breaking widget registry | Widget cleanup (with localStorage migration) | Save dashboard with all widget types before cleanup, reload after, verify all still render |
| Silent regressions from batch commits | All phases (mandatory process rule) | One logical change per commit, full test suite after each |
| Removing wrong gateway code | Gateway integration fix (MUST precede dead code stripping) | Fix endpoint shapes against protocol docs, verify with real gateway connection |
| Breaking CouchDB chunks | Notes verification (mark vault as "do not touch" unless fixing specific bug) | Test against real CouchDB with text, images, folders, eden chunks |
| Orphaned WebSocket guards | WebSocket handler verification | Open, use, close, reconnect for each WS endpoint -- verify counter lifecycle |
| Breaking store reactivity | State/store verification | Change every setting type, verify instant propagation without reload |
| Severing realtime chains | Background/realtime verification | External data change (message, mission update), verify UI reflects without refresh |
| Breaking preferences sync | Persistence verification | Clear localStorage, reload, verify full restore from Supabase |

## Sources

- Direct codebase analysis: `routes/mod.rs` (44 modules), `widget-registry.ts` (714 lines, 30+ widgets), `main.tsx` (29 lazy pages), `query-keys.ts` (49 keys), 106 test files
- [Knip -- dead code detection for JS/TS](https://knip.dev/) -- recommended tool, but requires entry point configuration for dynamic imports
- [Webpack Issue #7500: dynamic imports defeat tree shaking](https://github.com/webpack/webpack/issues/7500) -- applies to Vite as well for static analysis
- [Clean Code with Rust & Axum](https://www.propelauth.com/post/clean-code-with-rust-and-axum) -- handler refactoring patterns
- [Incremental cleanup methodology](https://understandlegacycode.com/blog/start-cleaning-legacy-with-daily-refactoring-hour/) -- "ship small, every day"
- [Code cleanup regressions](https://medium.com/zoosk-engineering/code-cleanup-when-your-work-is-undoing-other-peoples-work-d2a91a745496) -- cleanup-induced regression patterns
- [tokio-tungstenite memory leak #195](https://github.com/snapview/tokio-tungstenite/issues/195) -- WebSocket cleanup patterns
- [Obsidian LiveSync CouchDB sync](https://deepwiki.com/vrtmrz/obsidian-livesync/3.1-couchdb-synchronization) -- LiveSync format documentation
- [Vibe coding cleanup regressions](https://venturebeat.com/orchestration/vibe-coding-with-overeager-ai-lessons-learned-from-treating-google-ai-studio/) -- over-eager cleanup destroying working features

---
*Pitfalls research for: OpenClaw Manager v0.0.4 — Stabilize & Strip*
*Researched: 2026-03-24*
