# Architecture Research: Systematic Codebase Audit Strategy

**Domain:** Post-rapid-development codebase audit (Tauri v2 + React 18 + Rust/Axum)
**Researched:** 2026-03-24
**Confidence:** HIGH (patterns verified against actual codebase structure, tooling verified against official docs)

---

## System Overview: What We're Auditing

The codebase spans 473 TypeScript/TSX files (~36,259 lines) on the frontend and 72 Rust files (~28,616 lines) on the backend. After 55 phases shipped in 2 days (v0.0.3), the key risk categories are:

```
                     AUDIT SURFACE MAP
                     =================

Frontend (473 files)                    Backend (72 files)
--------------------                    ------------------
42 page modules (pages/)                47 route modules (routes/)
40+ components (components/)            gateway_ws.rs (WS client)
30+ hooks (hooks/ + lib/hooks/)         server.rs (AppState, middleware)
50+ lib utilities (lib/)                sync.rs (SQLite <-> Supabase)
                                        service_client.rs (HTTP client)
        |                                       |
        |         INTEGRATION SURFACE           |
        +---------------------------------------+
        |                                       |
  api.ts (fetch wrapper) <--> Axum routes (/api/*)
  query-keys.ts (49 keys)     47 route modules
  modules.ts (21 modules)     mod.rs (routes registered)
  React Router (42 routes)    External services (7+)
```

### Critical Numbers

| Metric | Count | Audit Concern |
|--------|-------|---------------|
| Registered route modules | 47 | Are all consumed by frontend? |
| Frontend page components | 42 | Are all reachable via routing? |
| React Query keys | 49 | Do all map to real endpoints? |
| App modules (modules.ts) | 21 | Do all have working pages? |
| Frontend hooks | 30+ | Are all imported somewhere? |
| Lib utility files | 50+ | Are all still used? |
| API endpoint paths (frontend) | 120+ distinct paths | Do all resolve to Axum handlers? |
| Axum registered routes | 100+ | Are all called from frontend? |

---

## Recommended Audit Order: Backend First

**Verdict: Audit backend (Rust) before frontend (TypeScript).**

### Rationale

1. **Backend is the source of truth.** Every frontend feature flows through Axum routes. If a backend route is broken or missing, no amount of frontend polish matters.

2. **Rust compiler catches more.** `cargo build` with `#[warn(dead_code)]` already surfaces unused functions, structs, and imports. The Rust compiler is a free first-pass auditor.

3. **Gateway protocol correctness is backend-only.** The critical issue (openclaw_data.rs using REST-style `gateway_forward` with HTTP paths like `/usage`, `/models` -- but the gateway is WS RPC with methods like `usage.status`, `models.list`) is entirely a backend problem. Frontend hooks call the right Axum routes; the Axum handlers forward to the wrong gateway methods.

4. **Smaller surface = faster wins.** 72 Rust files audit faster than 473 TypeScript files. Backend audit produces a validated route inventory that the frontend audit can check against.

5. **Dependency direction.** Frontend depends on backend API shape. Fixing backend routes may change response shapes, which cascades to frontend. Audit backend first to stabilize the API contract before auditing frontend consumers.

### Build Order (Phases)

```
Phase 1: Backend Route Inventory        (Rust, no frontend changes)
    |
    v
Phase 2: Gateway Integration Audit      (Rust, protocol correctness)
    |
    v
Phase 3: Frontend Dead Code Detection   (TypeScript, tooling-assisted)
    |
    v
Phase 4: Frontend-Backend Binding Audit (Cross-layer, route matching)
    |
    v
Phase 5: Integration Verification       (End-to-end, per-page)
```

---

## Phase 1: Backend Route Inventory

**Goal:** Produce a complete map of every registered Axum route, its handler, and whether it's reachable.

### Technique: Static Route Extraction

The route registration is centralized in `src-tauri/src/routes/mod.rs`. Every route module has a `pub fn router()` that registers routes via `.route()` calls. Extract the full inventory:

```bash
# Extract all registered routes from Rust source
grep -rn '\.route(' src-tauri/src/routes/ --include="*.rs" | grep -v test | grep -v '//'
```

Cross-reference against frontend API calls:

```bash
# Extract all frontend API paths
grep -rn "api\.\(get\|post\|put\|patch\|del\)" frontend/src/ --include="*.ts" --include="*.tsx" | \
  grep -oP "'/api/[^']*'" | sort -u
```

### What to Look For

| Signal | Meaning | Action |
|--------|---------|--------|
| Backend route with no frontend caller | Orphaned endpoint | Candidate for removal or future use |
| Frontend API call with no backend route | Broken integration | Fix or remove frontend code |
| Route module in `mod.rs` but handler is stub | Incomplete feature | Complete or remove |
| Route registered but handler returns mock data | v0.0.3 placeholder | Wire to real data or remove |

### Rust Compiler as Auditor

```bash
# Enable all dead code warnings (they may be suppressed with #[allow])
RUSTFLAGS="-W dead_code" cargo check 2>&1 | grep "warning.*dead_code"

# Check for unused dependencies
cargo +nightly udeps  # or manually review Cargo.toml
```

The Rust compiler's `dead_code` lint catches unused functions, structs, enums, and trait implementations at the crate level. However, it does NOT catch Axum handlers that are registered but never called by a client -- those are "live" from the compiler's perspective because they're referenced in `.route()` calls.

### Known Backend Issues to Flag

| Route Module | Issue | Severity |
|--------------|-------|----------|
| `openclaw_data.rs` | Uses `gateway_forward()` (HTTP) to reach gateway endpoints like `/usage`, `/models` -- but gateway protocol is WS RPC (`usage.status`, `models.list`) | CRITICAL |
| `openclaw_cli.rs` | Shells out to `openclaw` binary -- fragile, depends on binary being on PATH | MEDIUM |
| `workspace.rs` | Unclear if consumed by any frontend page | AUDIT |
| `workflow_notes.rs` | May overlap with `vault.rs` (notes) functionality | AUDIT |
| `dlp.rs` | Data loss prevention restore -- verify frontend consumer exists | AUDIT |
| `deploy.rs` | Single `post_deploy` handler -- verify still used | AUDIT |
| `stale.rs` | Stale items detection -- verify Pipeline page consumes this | AUDIT |

---

## Phase 2: Gateway Integration Audit

**Goal:** Fix every OpenClaw integration to use the correct gateway protocol.

### The Core Problem

The codebase has TWO communication channels to OpenClaw, and they're used inconsistently:

```
CHANNEL 1: gateway_forward() in gateway.rs
  - Uses HTTP (reqwest) to OPENCLAW_API_URL
  - Sends REST-style requests (GET /usage, GET /models, etc.)
  - Used by: openclaw_data.rs (usage, models, tools, skills)
  - PROBLEM: OpenClaw gateway does NOT have REST endpoints for these
  - These paths (/usage, /models, etc.) may return 404 or unexpected data

CHANNEL 2: state.gateway_ws (GatewayWs) in gateway.rs
  - Uses persistent WebSocket to OPENCLAW_WS (port 18789)
  - Sends WS RPC requests (sessions.list, activity.recent, memory.search)
  - Used by: gateway.rs handlers (sessions, activity, memory search)
  - CORRECT: This matches the gateway protocol v3
```

### What Needs to Change

| Current (Wrong) | Gateway Protocol Method | File |
|------------------|------------------------|------|
| `GET /usage` via HTTP | `usage.status` via WS RPC | openclaw_data.rs |
| `GET /models` via HTTP | `models.list` via WS RPC | openclaw_data.rs |
| `GET /tools` via HTTP | No direct equivalent -- skills.status? | openclaw_data.rs |
| `POST /tools/invoke` via HTTP | No direct equivalent | openclaw_data.rs |
| `GET /skills` via HTTP | `skills.status` via WS RPC | openclaw_data.rs |

### Verification Approach

For each OpenClaw-facing route handler:

1. Check which communication channel it uses (HTTP vs WS RPC)
2. Check the method name against the 88 known gateway RPC methods
3. Verify response shape matches what frontend expects
4. Test with actual gateway (if accessible)

### Integration Map (All OpenClaw Touchpoints)

```
Frontend Hook/Page          -> Axum Route              -> Gateway Method
-----------------------        ---------------------       ----------------
useOpenClawUsage.ts         -> /openclaw/usage          -> usage.status (WS)  [BROKEN: uses HTTP]
useOpenClawModels.ts        -> /openclaw/models         -> models.list (WS)   [BROKEN: uses HTTP]
useOpenClawTools.ts         -> /openclaw/tools          -> skills.bins? (WS)  [BROKEN: uses HTTP]
useOpenClawSkills.ts        -> /openclaw/skills         -> skills.status (WS) [BROKEN: uses HTTP]
useGatewayStatus.ts         -> /gateway/status          -> local state check  [OK]
useGatewaySessions.ts       -> /gateway/sessions        -> sessions.list (WS) [OK]
useSessionHistory.ts        -> /gateway/sessions/:id/history -> sessions.history (WS) [VERIFY]
SessionControls.tsx         -> /gateway/sessions/:id/send    -> sessions.send (WS)    [VERIFY: should be chat.send?]
SessionControls.tsx         -> /gateway/sessions/:id/pause   -> sessions.pause (WS)   [OK]
SessionControls.tsx         -> /gateway/sessions/:id/resume  -> sessions.resume (WS)  [OK]
ActivityPage.tsx            -> /gateway/activity        -> activity.recent (WS) [VERIFY method exists]
Memory search widget        -> /gateway/memory/search   -> memory.search (WS) [VERIFY method exists]
useAgents.ts                -> /api/agents              -> agents.list? (WS)  [AUDIT: uses Supabase, not gateway]
useCrons.ts                 -> /api/crons               -> cron.list? (WS)    [AUDIT: uses openclaw CLI]
GatewayStatusDot.tsx        -> /openclaw/health         -> health check       [OK: HTTP health probe]
useBudgetAlerts.ts          -> /api/budget-alerts?      -> usage.cost? (WS)   [AUDIT]
```

---

## Phase 3: Frontend Dead Code Detection

**Goal:** Identify unused files, exports, components, hooks, and dependencies.

### Primary Tool: Knip

Knip is the current best-in-class tool for JavaScript/TypeScript dead code detection. It finds unused files, unused exports, unused dependencies, and unused dev dependencies. It has native support for Vite, React, and TypeScript projects.

```bash
# Install
cd frontend && npm install -D knip

# Create knip.json configuration
cat > knip.json << 'EOF'
{
  "$schema": "https://unpkg.com/knip@latest/schema.json",
  "entry": ["src/main.tsx"],
  "project": ["src/**/*.{ts,tsx}"],
  "ignore": ["src/**/*.test.{ts,tsx}", "src/**/__tests__/**"],
  "ignoreDependencies": ["@tauri-apps/*"]
}
EOF

# Run analysis
npx knip
```

Knip will report:
- **Unused files**: TypeScript/TSX files not reachable from `main.tsx`
- **Unused exports**: Functions, components, types, constants exported but never imported
- **Unused dependencies**: npm packages in `package.json` not referenced in code
- **Unused dev dependencies**: Dev packages not used by any config or test

### Supplementary: ESLint Unused Imports

```bash
npm install -D eslint-plugin-unused-imports
```

This catches per-file unused imports that Knip may not flag (Knip focuses on cross-file analysis).

### Manual Audit Targets

Knip handles most cases, but these require manual review:

| Target | Why Manual | Approach |
|--------|-----------|----------|
| Lazy-loaded pages | Knip follows static imports; `lazy(() => import(...))` should be traced | Verify each `lazy()` in main.tsx maps to a working page |
| Dynamic widget registry | Widgets registered via `widget-registry.ts` may not have static imports | Cross-reference registry entries with actual component files |
| CSS-only dependencies | Packages imported only in CSS or HTML won't be caught | Review `globals.css` for `@import` statements |
| Bjorn modules (runtime) | Runtime-loaded sandboxed modules can't be statically analyzed | Separate concern -- not part of this audit |

### What to Look For

| Signal | Meaning | Action |
|--------|---------|--------|
| Component file not imported anywhere | Dead component | Remove (after confirming not lazy-loaded) |
| Hook with 0 import sites | Orphaned hook | Remove |
| Query key defined but never used in `useQuery` | Stale cache key | Remove from query-keys.ts |
| Module in modules.ts with no matching route | Broken navigation | Fix route or remove module |
| Type/interface exported but never imported | Dead type | Remove |
| Utility function in lib/ with 0 callers | Dead utility | Remove |

---

## Phase 4: Frontend-Backend Binding Audit

**Goal:** Verify every frontend API call resolves to a working backend handler, and every backend handler has at least one frontend consumer.

### Technique: Path Cross-Reference

Extract two lists and diff them:

**List A: Frontend API paths** (what the frontend calls)
```bash
grep -rPoh "'/api/[^']*'" frontend/src/ --include="*.ts" --include="*.tsx" | \
  sed "s/'//g" | sort -u > /tmp/frontend-paths.txt
```

**List B: Backend route paths** (what the backend serves)
```bash
grep -rPoh '"/[^"]*"' src-tauri/src/routes/ --include="*.rs" | \
  grep -v test | grep -v '//' | sed 's/"//g' | sort -u > /tmp/backend-paths.txt
```

**Diff:**
```bash
# Frontend calls with no backend handler:
comm -23 /tmp/frontend-paths.txt /tmp/backend-paths.txt

# Backend handlers with no frontend caller:
comm -13 /tmp/frontend-paths.txt /tmp/backend-paths.txt
```

### Known Complexity: Path Patterns

Some routes use dynamic segments (`:id`, `{id}`). The cross-reference must account for:
- Axum path params: `/api/gateway/sessions/:id/history`
- Frontend string interpolation: `` `/api/gateway/sessions/${sessionId}/history` ``

These won't match in a naive string comparison. Use regex normalization:
```bash
# Normalize Axum params
sed 's/:[a-z_]*/*/g; s/{[a-z_]*}/*/g'

# Normalize frontend template literals
sed 's/\${[^}]*}/*/g'
```

### Integration Point Inventory

Every frontend-to-backend binding falls into one of these categories:

```
Category 1: Direct REST (api.get/post/patch/del -> Axum handler -> Supabase)
  - Todos, Missions, Calendar, Knowledge, Ideas, etc.
  - Audit: Verify handler exists, response shape matches frontend types

Category 2: Gateway Proxy (api.* -> Axum handler -> gateway_forward/gateway_ws -> OpenClaw)
  - OpenClaw usage, models, tools, skills, sessions, activity
  - Audit: Verify gateway method is correct, response shape matches

Category 3: External Service Proxy (api.* -> Axum handler -> reqwest -> external)
  - BlueBubbles (messages), Mac Bridge (reminders), CouchDB (vault/notes)
  - Audit: Verify service URL comes from secrets, error handling works

Category 4: Local-only (api.* -> Axum handler -> local state/computation)
  - Health checks, status, cache, terminal, VNC status
  - Audit: Verify handler logic is correct

Category 5: WebSocket (frontend WS -> Axum WS handler)
  - Chat streaming, terminal PTY, session output
  - Audit: Verify WS upgrade works, message format correct
```

---

## Phase 5: Integration Verification

**Goal:** Verify each page actually works end-to-end with real data (or gracefully degrades).

### Per-Page Verification Checklist

For each of the 21 registered modules (from `modules.ts`):

1. **Route exists** -- Is there a `<Route>` in main.tsx matching the module's `route` field?
2. **Page loads** -- Does the lazy-loaded component render without crash?
3. **Data fetches** -- Do React Query hooks resolve (or show meaningful error)?
4. **Backend responds** -- Does the Axum handler return valid JSON?
5. **External service connected** -- If the handler proxies externally, is the service reachable?
6. **Error states** -- Does the page show a useful error when the service is down?

### Modules Requiring External Services (Higher Risk)

| Module | External Dependency | Failure Mode |
|--------|---------------------|-------------|
| Messages | BlueBubbles on Mac | Page should show "BlueBubbles not configured" |
| Reminders | Mac Bridge on Mac | Page should show "Mac Bridge not configured" |
| OpenClaw | OpenClaw Gateway WS | Page should show "Gateway not connected" |
| Sessions | OpenClaw Gateway WS | Page should show "Gateway not connected" |
| Remote Viewer | Sunshine/Moonlight | Page should show "Not available" |
| Approvals | OpenClaw Gateway WS | Page should show "Gateway not connected" |
| Activity | OpenClaw Gateway WS | Page should show "Gateway not connected" |
| Home Lab | Proxmox + OPNsense | Page should show service-specific errors |
| Media Radar | Plex + Sonarr + Radarr | Page should show "Services not configured" |
| Calendar | CalDAV server | Page should show "Calendar not configured" |
| Email | IMAP server | Page should show "Email not configured" |

### Modules That Are Local-Only (Lower Risk)

| Module | Data Source | Notes |
|--------|-------------|-------|
| Todos | Supabase | Should always work if auth is valid |
| Notes | CouchDB (self-hosted) | Should work if CouchDB configured |
| Pomodoro | Local state + Supabase | Timer is local, history in Supabase |
| Pipeline | Supabase | Should always work if auth is valid |
| Knowledge | Supabase | Should always work if auth is valid |
| Dashboard | Aggregates from multiple | Should gracefully degrade per widget |

---

## Architectural Patterns for the Audit

### Pattern 1: Route-Consumer Tracing

**What:** For every Axum route, trace the full chain: frontend component -> hook/query -> api.ts call -> Axum handler -> data source.

**When to use:** During Phase 4, to verify bindings are complete.

**Example chain:**
```
OpenClaw Models page
  -> pages/openclaw/ModelsTab.tsx
    -> hooks/useOpenClawModels.ts
      -> api.get('/api/openclaw/models')
        -> routes/openclaw_data.rs::get_models()
          -> gateway_forward(GET, "/models")  <-- WRONG: should be WS RPC "models.list"
```

### Pattern 2: Knip + Manual Dead Export Sweep

**What:** Run Knip for automated detection, then manually verify edge cases (lazy imports, dynamic registry, CSS-only deps).

**When to use:** Phase 3, as the primary dead code detection strategy.

**Trade-offs:** Knip may produce false positives for dynamically-referenced code (widget registry entries, Bjorn sandbox API). Suppress these explicitly in knip.json rather than ignoring Knip findings globally.

### Pattern 3: Gateway Method Verification

**What:** For each Axum handler that communicates with OpenClaw, verify the gateway method name against the 88 known RPC methods documented in the reference.

**When to use:** Phase 2, for every handler in `gateway.rs` and `openclaw_data.rs`.

**Example:**
```rust
// WRONG: This sends HTTP GET to /usage -- gateway has no REST endpoint for this
let result = gateway_forward(&state, Method::GET, "/usage", None).await?;

// RIGHT: This sends WS RPC to "usage.status" method
let payload = gw.request("usage.status", json!({})).await?;
```

---

## Anti-Patterns to Avoid During Audit

### Anti-Pattern 1: Removing Without Tracing

**What people do:** See a warning about unused code and delete it immediately.
**Why it's wrong:** The code may be consumed via dynamic import, widget registry, or lazy loading. Deletion breaks runtime behavior that the compiler/linter can't see.
**Do this instead:** Before removing any code, trace its usage: check lazy imports in main.tsx, widget-registry.ts entries, modules.ts references, and Bjorn sandbox API surface.

### Anti-Pattern 2: Fixing Frontend Before Backend

**What people do:** Fix frontend components that show broken data without checking if the backend handler is correct.
**Why it's wrong:** The frontend may be displaying the data correctly -- the backend handler may be returning wrong data from a broken gateway integration. Fixing the frontend masks the real bug.
**Do this instead:** Always verify the backend handler returns correct data (curl the endpoint) before modifying frontend display logic.

### Anti-Pattern 3: Bulk Deletion Without Testing

**What people do:** Identify 50 unused files and delete them all in one commit.
**Why it's wrong:** Some "unused" files may be imported transitively, referenced in tests, or used by the build system. Bulk deletion makes it hard to identify which removal broke something.
**Do this instead:** Delete in small batches (5-10 files), run `cargo check` and `npm run build` after each batch, run tests after each batch.

### Anti-Pattern 4: Ignoring Compiler Warnings

**What people do:** Suppress `dead_code` warnings with `#[allow(dead_code)]` instead of investigating them.
**Why it's wrong:** After rapid development, many `#[allow(dead_code)]` annotations are applied to silence the compiler during development. These are now audit targets -- each one should be evaluated.
**Do this instead:** `grep -rn 'allow(dead_code)' src-tauri/src/` and evaluate each one. If the code is truly dead, remove it. If it's used, remove the annotation.

---

## Integration Points Summary

### Frontend -> Backend (via api.ts)

| Category | Frontend Location | Backend Route | External Service |
|----------|-------------------|---------------|------------------|
| Messages | hooks/messages/ | routes/messages.rs | BlueBubbles |
| Chat | pages/chat/ | routes/chat.rs | OpenClaw (HTTP/WS) |
| Todos | lib/hooks/useTodos.ts | routes/todos.rs | Supabase |
| Calendar | pages/Calendar.tsx | routes/calendar.rs | CalDAV server |
| Reminders | pages/Reminders.tsx | routes/reminders.rs | Mac Bridge |
| Email | pages/Email.tsx | routes/email.rs | IMAP server |
| Notes/Vault | lib/vault.ts, pages/notes/ | routes/vault.rs | CouchDB |
| Homelab | pages/HomeLab.tsx | routes/homelab.rs | Proxmox, OPNsense |
| Media | pages/MediaRadar.tsx | routes/media.rs | Plex, Sonarr, Radarr |
| Missions | pages/missions/ | routes/missions.rs | Supabase |
| Agents | hooks/useAgents.ts | routes/agents.rs | Supabase (not gateway!) |
| Crons | hooks/useCrons.ts | routes/crons.rs | Supabase + openclaw CLI |
| Knowledge | pages/knowledge/ | routes/knowledge.rs | Supabase |
| Pipeline | pages/pipeline/ | routes/pipeline/ | Supabase |
| Settings | pages/settings/ | routes/preferences.rs, status.rs, user_secrets.rs | Multiple |
| OpenClaw Data | hooks/useOpenClaw*.ts | routes/openclaw_data.rs | OpenClaw (BROKEN) |
| Gateway | hooks/sessions/ | routes/gateway.rs | OpenClaw WS |
| Sessions | pages/sessions/ | routes/claude_sessions.rs, gateway.rs | OpenClaw WS + CLI |
| Terminal | hooks/useTerminal.ts | routes/terminal.rs | Local PTY |
| VNC/Remote | pages/remote/ | routes/vnc.rs | Sunshine |
| Approvals | hooks/useApprovals.ts | routes/approvals.rs | OpenClaw WS |
| Bjorn | pages/chat/BjornTab.tsx | routes/bjorn.rs | Supabase + sandbox |
| Auth | pages/login/ | routes/auth.rs | Supabase Auth |
| Export | pages/settings/SettingsPrivacy.tsx | routes/export.rs | Supabase + CouchDB |
| Search | components/GlobalSearch.tsx | routes/search.rs | Supabase |
| Koel/Music | widgets, CommandPalette | routes/koel.rs | Koel API |
| Wizard | components/SetupWizard.tsx | routes/wizard.rs | Local |

### Backend Route Modules Without Clear Frontend Consumers (Audit Targets)

| Route Module | Routes | Likely Consumer | Confidence |
|--------------|--------|----------------|------------|
| `workspace.rs` | /workspace/* | Unknown | LOW -- audit for removal |
| `workflow_notes.rs` | /workflow-notes | Pipeline tab? | MEDIUM -- verify |
| `dlp.rs` | /restore | Settings recycle bin? | MEDIUM -- verify |
| `deploy.rs` | /deploy | Agents LiveProcesses | MEDIUM -- verify |
| `habits.rs` | /habits, /habits/entries | No page visible | LOW -- may be widget-only |
| `captures.rs` | /quick-capture | Sidebar quick capture | MEDIUM -- verify |
| `changelog.rs` | /changelog | Pipeline ShipLog tab | HIGH -- verified |
| `decisions.rs` | /decisions | Unknown | LOW -- audit for removal |
| `events.rs` | /events (SSE) | Real-time updates? | MEDIUM -- verify |
| `memory.rs` | /memory | Memory page | HIGH -- verified |

---

## New vs Modified Files for Audit

This audit does NOT create new features. It modifies/removes existing files.

### Files That Will Be Modified

| File | Change Type | Reason |
|------|-------------|--------|
| `src-tauri/src/routes/openclaw_data.rs` | Rewrite | Switch from HTTP to WS RPC |
| `src-tauri/src/routes/mod.rs` | Modify | Remove dead route registrations |
| `frontend/src/lib/modules.ts` | Modify | Remove modules with no working page |
| `frontend/src/lib/query-keys.ts` | Modify | Remove unused query keys |
| `frontend/src/main.tsx` | Modify | Remove dead route entries |

### Files That May Be Removed

Determined by audit findings. Candidates include:
- Unused hook files in `hooks/`
- Unused utility files in `lib/`
- Dead page components that have no route
- Backend route modules with no frontend consumer

### Files That Must NOT Be Touched

| File | Reason |
|------|--------|
| `routes/auth.rs` | Security-critical, well-tested |
| `routes/messages.rs` | Core feature, 2927 lines, heavily integrated |
| `routes/chat.rs` | Core feature, 1303 lines, WebSocket + HTTP |
| `server.rs` | Core infrastructure, middleware |
| `crypto.rs`, `audit.rs` | Security infrastructure |
| `lib/api.ts` | Every component depends on this |

---

## Sources

- [Knip -- JavaScript/TypeScript dead code detector](https://knip.dev/) -- PRIMARY tool for frontend dead code detection
- [Knip GitHub](https://github.com/webpro-nl/knip) -- 100+ framework plugins, Vite support confirmed
- [eslint-plugin-unused-imports](https://www.npmjs.com/package/eslint-plugin-unused-imports) -- Per-file unused import detection
- [Rust dead_code lint](https://doc.rust-lang.org/rust-by-example/attribute/unused.html) -- Built-in compiler dead code detection
- [cargo-minify](https://github.com/tweedegolf/cargo-minify) -- Automated Rust dead code removal (use with caution)
- [Effective TypeScript: Use Knip](https://effectivetypescript.com/2023/07/29/knip/) -- Rationale for Knip over ts-prune (ts-prune is maintenance-mode)
- OpenClaw Gateway Protocol v3 -- 88 RPC methods reference (from project memory)

---
*Architecture research for: v0.0.4 Stabilize and Strip -- Codebase Audit Strategy*
*Researched: 2026-03-24*
