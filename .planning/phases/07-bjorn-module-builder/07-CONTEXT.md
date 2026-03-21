# Phase 7: Bjorn Module Builder - Context

**Gathered:** 2026-03-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Bjorn Module Builder — users describe a module in natural language, Bjorn generates a React component from the primitives library, previews it in a sandboxed iframe, and installs approved modules to the dashboard widget picker with hot-reload and version history.

</domain>

<decisions>
## Implementation Decisions

### Sandbox & Security
- Preview runs in sandboxed iframe with `sandbox="allow-scripts"` — no DOM access, no cookies, no Tauri IPC
- Strict static analysis blocklist: fetch, XMLHttpRequest, WebSocket, eval, Function, document.cookie, window.parent, window.top, localStorage, sessionStorage, importScripts — rejected before rendering
- Approved modules escape the sandbox and run as normal React components (same as primitives) — sandbox is preview-only
- Preview iframe CSP: `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'` — zero network, zero external resources

### Code Generation Strategy
- Bjorn composes modules from the 11 primitives API — prompt includes primitive schemas + WidgetProps interface, assembles using only primitives library + standard React
- OpenClaw gateway powers generation (user's configured model) — uses same chat infrastructure, Bjorn is a specialized system prompt
- Tool manifest file at `~/.config/mission-control/tools.json` lists available CLIs with commands, descriptions, and examples — Bjorn reads this at generation time
- Approved modules access live data via a data bridge — postMessage API where parent app proxies requests through Axum. Module requests data, parent resolves via CLI/API. No direct network from module code.

### Module Lifecycle & Persistence
- Generated modules stored in local SQLite table (`bjorn_modules`) with source, config schema, metadata, version history — synced to Supabase for cross-device
- 5 versions per module — oldest pruned on new save
- Approval flow: Preview → Approve/Reject/Edit — sandboxed preview shown, user approves (installs to dashboard), rejects (discards), or requests changes (new generation round)
- Hot-reload via dynamic import with cache-busting — approved modules as JS blobs loaded via `() => import(blobURL)` in registerWidget, re-registration replaces component without restart

### Builder UI & UX
- Builder lives in Chat page as Bjorn tab — reuses existing chat infrastructure
- Side-by-side split: chat left, preview right — user sees generation and result simultaneously
- Module management in Settings → Modules — shows Bjorn-created modules with enable/disable/delete/rollback
- Bjorn explains generation failures in chat with suggested fixes

### Claude's Discretion
- Prompt engineering details for Bjorn's system prompt
- Exact postMessage bridge protocol
- SQLite schema field naming
- Preview iframe HTML template structure
- Cache-busting strategy for blob URLs

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- 11 module primitives in `components/primitives/` with configSchema exports and WidgetProps interface
- `registerWidget()` from `lib/widget-registry.ts` — Map-based O(1) lookup, supports `tier: 'ai'` and `category: 'custom'`
- `useChatSocket` hook for WebSocket + polling fallback to OpenClaw
- `api.get/post/put/del` wrapper with timeout, API key, offline queue
- `dashboard-store.ts` — `addWidgetToPage()` for programmatic widget installation
- `WidgetWrapper.tsx` — lazy loading, error boundary, edit chrome

### Established Patterns
- useSyncExternalStore for reactive state (theme-store, dashboard-store, sidebar-settings)
- React Query for all data fetching, query keys centralized in `lib/query-keys.ts`
- Lazy-loaded pages and modals via React.lazy + Suspense
- SQLite migrations in `src-tauri/migrations/`
- Supabase sync pattern from `sync.rs` (30s interval)

### Integration Points
- `main.tsx` — registerPrimitives() already called at startup, Bjorn modules register similarly
- Chat page (`pages/chat/`) — existing ChatThread, ChatInput, model switcher
- Settings Modules (`pages/settings/SettingsModules.tsx`) — drag-drop module management
- Widget Picker (`components/dashboard/WidgetPicker.tsx`) — shows registered widgets by category

</code_context>

<specifics>
## Specific Ideas

- User has 8 CLIs available: homelab, portainer, koel, firecrawl, vault, openclaw, bw, plus Cloudflare/Proxmox/Portainer APIs via vault credentials
- Tool manifest should auto-discover CLIs from PATH + manual entries for API-only services
- Data bridge pattern: module emits `{ type: 'data-request', source: 'homelab', command: 'status' }` via postMessage, parent validates against tool manifest allowlist, executes via Axum backend, returns result
- Bjorn-generated modules should use `tier: 'ai'` in widget registry to distinguish from built-in and user primitives

</specifics>

<deferred>
## Deferred Ideas

- Bjorn module marketplace/sharing between users
- Bjorn learning from user feedback to improve generation quality
- Module dependency chains (one module depending on another)
- CLI wrapper generation (Bjorn creates new CLIs)

</deferred>
