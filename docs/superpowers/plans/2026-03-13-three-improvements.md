# Three Improvements Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the god modules (misc.rs, pipeline.rs), create a typed frontend API layer, and add reconnection with exponential backoff to the Chat page.

**Architecture:** Backend splits are purely structural — move handlers into new files, update mod.rs imports, zero behavior change. Frontend API layer wraps `fetch()` in a typed client that all pages import. Chat reconnection replaces fixed-interval polling with exponential backoff + SSE upgrade.

**Tech Stack:** Rust/Axum (backend splits), TypeScript/React (API layer + reconnection), TanStack React Query

---

## Chunk 1: God Module Splits (Backend)

### Task 1: Split misc.rs — Create ideas.rs

**Files:**
- Create: `src-tauri/src/routes/ideas.rs`
- Modify: `src-tauri/src/routes/misc.rs` (remove ideas section, lines 392-534)
- Modify: `src-tauri/src/routes/mod.rs` (add `pub mod ideas;`, merge router)

- [ ] **Step 1: Create ideas.rs with handlers extracted from misc.rs**

Extract these items from `misc.rs` lines 392-534:
- `IdeasQuery` struct
- `PostIdeaBody` struct
- `PatchIdeaBody` struct
- `DeleteIdeaParams` struct
- `get_ideas()` handler
- `post_idea()` handler
- `patch_idea()` handler (includes auto-mission-creation logic)
- `delete_idea()` handler
- `router()` function with `/ideas` route

```rust
use axum::{extract::{Query, State}, routing::get, Json, Router};
use serde::Deserialize;
use serde_json::{json, Value};
use crate::error::AppError;
use crate::server::AppState;
use crate::supabase::SupabaseClient;

// Copy structs: IdeasQuery, PostIdeaBody, PatchIdeaBody, DeleteIdeaParams
// Copy handlers: get_ideas, post_idea, patch_idea, delete_idea
// All verbatim from misc.rs lines 392-534

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/ideas", get(get_ideas).post(post_idea).patch(patch_idea).delete(delete_idea))
}
```

- [ ] **Step 2: Remove ideas section from misc.rs**

Delete lines 392-534 from `misc.rs` and remove the `/ideas` route from its `router()` function.

- [ ] **Step 3: Register ideas module in mod.rs**

Add `pub mod ideas;` to the module declarations and `.merge(ideas::router())` to the router function.

- [ ] **Step 4: Build and verify**

Run: `cd src-tauri && cargo build 2>&1 | head -30`
Expected: Compiles with no errors.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/routes/ideas.rs src-tauri/src/routes/misc.rs src-tauri/src/routes/mod.rs
git commit -m "refactor: extract ideas routes from misc.rs into ideas.rs"
```

---

### Task 2: Split misc.rs — Create decisions.rs

**Files:**
- Create: `src-tauri/src/routes/decisions.rs`
- Modify: `src-tauri/src/routes/misc.rs` (remove decisions section, lines 209-325)
- Modify: `src-tauri/src/routes/mod.rs`

- [ ] **Step 1: Create decisions.rs with handlers from misc.rs**

Extract from `misc.rs` lines 209-325:
- `DecisionsQuery` struct
- `PostDecisionBody` struct
- `PatchDecisionBody` struct
- `get_decisions()`, `post_decision()`, `patch_decision()`, `delete_decision()`
- `router()` with `/decisions` route

Same import pattern as ideas.rs. All handlers verbatim.

- [ ] **Step 2: Remove decisions section from misc.rs, update its router**

- [ ] **Step 3: Register decisions module in mod.rs**

Add `pub mod decisions;` and `.merge(decisions::router())`.

- [ ] **Step 4: Build and verify**

Run: `cd src-tauri && cargo build 2>&1 | head -30`
Expected: Clean compile.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/routes/decisions.rs src-tauri/src/routes/misc.rs src-tauri/src/routes/mod.rs
git commit -m "refactor: extract decisions routes from misc.rs into decisions.rs"
```

---

### Task 3: Split misc.rs — Create captures.rs

**Files:**
- Create: `src-tauri/src/routes/captures.rs`
- Modify: `src-tauri/src/routes/misc.rs` (remove quick-capture section, lines 121-207)
- Modify: `src-tauri/src/routes/mod.rs`

- [ ] **Step 1: Create captures.rs**

Extract from `misc.rs` lines 121-207:
- `QuickCaptureBody` struct
- `post_quick_capture()` handler
- `router()` with `/quick-capture` POST route

- [ ] **Step 2: Remove quick-capture section from misc.rs, update its router**

- [ ] **Step 3: Register captures module in mod.rs**

Add `pub mod captures;` and `.merge(captures::router())`.

- [ ] **Step 4: Build and verify**

Run: `cd src-tauri && cargo build 2>&1 | head -30`

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/routes/captures.rs src-tauri/src/routes/misc.rs src-tauri/src/routes/mod.rs
git commit -m "refactor: extract quick-capture route from misc.rs into captures.rs"
```

---

### Task 4: Split misc.rs — Create changelog.rs and search.rs

**Files:**
- Create: `src-tauri/src/routes/changelog.rs`
- Create: `src-tauri/src/routes/search.rs`
- Modify: `src-tauri/src/routes/misc.rs` (remove changelog lines 536-587, search lines 589-627)
- Modify: `src-tauri/src/routes/mod.rs`

- [ ] **Step 1: Create changelog.rs**

Extract from `misc.rs` lines 536-587:
- `PostChangelogBody` struct
- `get_changelog()`, `post_changelog()`, `delete_changelog()`
- `router()` with `/changelog` route

- [ ] **Step 2: Create search.rs**

Extract from `misc.rs` lines 589-627:
- `SearchQuery` struct
- `get_search()` handler (uses `tokio::join!` for parallel queries)
- `router()` with `/search` GET route

- [ ] **Step 3: Remove changelog and search from misc.rs, update its router**

- [ ] **Step 4: Register both modules in mod.rs**

Add `pub mod changelog;` and `pub mod search;` plus their `.merge()` calls.

- [ ] **Step 5: Build and verify**

Run: `cd src-tauri && cargo build 2>&1 | head -30`

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/routes/changelog.rs src-tauri/src/routes/search.rs src-tauri/src/routes/misc.rs src-tauri/src/routes/mod.rs
git commit -m "refactor: extract changelog and search routes from misc.rs"
```

---

### Task 5: Rename remaining misc.rs to appropriate names

After tasks 1-4, `misc.rs` should only contain:
- **Memory** (`get_memory`, lines 47-119) — 73 lines
- **Workflow Notes** (lines 327-390) — 64 lines
- **Cache** (lines 629-721) — 93 lines
- Plus the `value_hash` helper and `CACHE_HASHES` static

**Files:**
- Create: `src-tauri/src/routes/memory.rs` (get_memory handler)
- Create: `src-tauri/src/routes/workflow_notes.rs` (workflow notes CRUD)
- Create: `src-tauri/src/routes/cache.rs` (cache + cache-refresh handlers + CACHE_HASHES static + value_hash helper)
- Delete: `src-tauri/src/routes/misc.rs`
- Modify: `src-tauri/src/routes/mod.rs` (remove `pub mod misc`, add three new modules)

- [ ] **Step 1: Create memory.rs**

Extract `get_memory()` handler. Note: this handler uses `reqwest` to call OpenClaw API and reads local filesystem. Include all relevant imports.

```rust
pub fn router() -> Router<AppState> {
    Router::new().route("/memory", get(get_memory))
}
```

- [ ] **Step 2: Create workflow_notes.rs**

Extract `WorkflowNotesQuery`, `PostWorkflowNoteBody`, `PatchWorkflowNoteBody`, and three handlers.

```rust
pub fn router() -> Router<AppState> {
    Router::new().route("/workflow-notes", get(get_workflow_notes).post(post_workflow_note).patch(patch_workflow_note))
}
```

- [ ] **Step 3: Create cache.rs**

Extract `CACHE_HASHES` static, `value_hash()` helper, `get_cache()`, `get_cache_refresh()`, `post_cache_refresh()`.

```rust
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/cache", get(get_cache))
        .route("/cache-refresh", get(get_cache_refresh).post(post_cache_refresh))
}
```

- [ ] **Step 4: Delete misc.rs, update mod.rs**

Remove `pub mod misc;` and `.merge(misc::router())`. Add:
```rust
pub mod memory;
pub mod workflow_notes;
pub mod cache;
// ...
.merge(memory::router())
.merge(workflow_notes::router())
.merge(cache::router())
```

- [ ] **Step 5: Build and verify**

Run: `cd src-tauri && cargo build 2>&1 | head -30`

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/routes/memory.rs src-tauri/src/routes/workflow_notes.rs src-tauri/src/routes/cache.rs src-tauri/src/routes/mod.rs
git rm src-tauri/src/routes/misc.rs
git commit -m "refactor: eliminate misc.rs — split into memory, workflow_notes, cache modules"
```

---

### Task 6: Split pipeline.rs into pipeline/ directory

`pipeline.rs` is 1,238 lines. Split into a module directory.

**Files:**
- Create: `src-tauri/src/routes/pipeline/mod.rs` (re-exports router, shared types/constants)
- Create: `src-tauri/src/routes/pipeline/agents.rs` (AgentRoute consts, routing_table, escalation_target, route_agent)
- Create: `src-tauri/src/routes/pipeline/registry.rs` (RegistryEntry, read/write/register/clean functions)
- Create: `src-tauri/src/routes/pipeline/helpers.rs` (validate_uuid, validate_workdir, slugify, shell_escape, supabase helpers, exec/env, spawn_agent_process, log_activity, send_notify)
- Create: `src-tauri/src/routes/pipeline/spawn.rs` (SpawnBody, pipeline_spawn handler)
- Create: `src-tauri/src/routes/pipeline/complete.rs` (CompleteBody, pipeline_complete handler)
- Create: `src-tauri/src/routes/pipeline/review.rs` (ReviewBody, pipeline_review handler)
- Create: `src-tauri/src/routes/pipeline/events.rs` (PipelineEventBody, get/post handlers)
- Delete: `src-tauri/src/routes/pipeline.rs`
- Modify: `src-tauri/src/routes/mod.rs` (no change needed — `pub mod pipeline` already works with directory modules)

- [ ] **Step 1: Create pipeline/ directory structure**

Run: `mkdir -p src-tauri/src/routes/pipeline`

- [ ] **Step 2: Create pipeline/agents.rs**

Extract from pipeline.rs lines 42-135:
- `status` constants module (lines 22-40)
- `AgentRoute` struct and 5 const instances (ROMAN, SONNET, GUNTHER, JIRAIYA, CODEX)
- `routing_table()`, `escalation_target()`, `route_agent()`

Make items `pub(crate)` so other pipeline submodules can access them.

- [ ] **Step 3: Create pipeline/registry.rs**

Extract lines 181-240: `RegistryEntry`, `read_registry()`, `write_registry()`, `register_process()`, `clean_registry_by_mission_id()`.

- [ ] **Step 4: Create pipeline/helpers.rs**

Extract lines 137-435: validation functions, supabase helpers, exec/env setup, `spawn_agent_process()`, `log_activity()`, `send_notify()`. Import from `agents.rs` and `registry.rs` as needed.

- [ ] **Step 5: Create pipeline/spawn.rs**

Extract lines 446-679: `SpawnBody` struct, `pipeline_spawn()` handler. Import helpers, agents, registry.

- [ ] **Step 6: Create pipeline/complete.rs**

Extract lines 680-985: `CompleteBody` struct, `pipeline_complete()` handler.

- [ ] **Step 7: Create pipeline/review.rs**

Extract lines 987-1172: `ReviewBody` struct, `pipeline_review()` handler.

- [ ] **Step 8: Create pipeline/events.rs**

Extract lines 1174-1238: `PipelineEventBody` struct, `get_pipeline_events()`, `post_pipeline_event()`.

- [ ] **Step 9: Create pipeline/mod.rs**

```rust
mod agents;
mod registry;
mod helpers;
mod spawn;
mod complete;
mod review;
mod events;

use axum::{routing::{get, post}, Router};
use crate::server::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/pipeline/spawn", post(spawn::pipeline_spawn))
        .route("/pipeline/complete", post(complete::pipeline_complete))
        .route("/pipeline/review", post(review::pipeline_review))
        .route("/pipeline-events", get(events::get_pipeline_events).post(events::post_pipeline_event))
}
```

- [ ] **Step 10: Delete pipeline.rs**

Run: `git rm src-tauri/src/routes/pipeline.rs`

`mod.rs` in `routes/` already has `pub mod pipeline;` which resolves to the directory.

- [ ] **Step 11: Build and verify**

Run: `cd src-tauri && cargo build 2>&1 | head -30`

- [ ] **Step 12: Commit**

```bash
git add src-tauri/src/routes/pipeline/
git rm src-tauri/src/routes/pipeline.rs
git commit -m "refactor: split pipeline.rs (1238 lines) into pipeline/ module directory"
```

---

## Chunk 2: Frontend API Abstraction Layer

### Task 7: Create typed API client

**Files:**
- Modify: `frontend/src/lib/api.ts` (expand from 1-line export to full API client)

- [ ] **Step 1: Build the API client**

Replace the single-line `api.ts` with a typed client. The client should:
- Export `API_BASE` (unchanged)
- Export `api` object with `.get()`, `.post()`, `.patch()`, `.delete()` methods
- Each method: constructs URL, sets `Content-Type: application/json`, handles response parsing
- On non-OK response: throw an `ApiError` with status + body
- Export `ApiError` class

```typescript
export const API_BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:3000'

export class ApiError extends Error {
  constructor(public status: number, public body: unknown) {
    super(`API ${status}`)
    this.name = 'ApiError'
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const opts: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  }
  if (body !== undefined) opts.body = JSON.stringify(body)
  const res = await fetch(`${API_BASE}${path}`, opts)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new ApiError(res.status, text)
  }
  const contentType = res.headers.get('content-type') || ''
  if (contentType.includes('application/json')) return res.json()
  return undefined as T
}

export const api = {
  get: <T = unknown>(path: string) => request<T>('GET', path),
  post: <T = unknown>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T = unknown>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  del: <T = unknown>(path: string, body?: unknown) => request<T>('DELETE', path, body),
}
```

- [ ] **Step 2: Verify build**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -20`
Expected: No type errors from api.ts.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/api.ts
git commit -m "feat: add typed API client with error handling"
```

---

### Task 8: Migrate pages to use API client (batch 1 — high-traffic pages)

**Files:**
- Modify: `frontend/src/pages/Pipeline.tsx`
- Modify: `frontend/src/pages/Dashboard.tsx`
- Modify: `frontend/src/pages/Todos.tsx`
- Modify: `frontend/src/pages/Missions.tsx`
- Modify: `frontend/src/pages/Agents.tsx`

- [ ] **Step 1: Migrate Pipeline.tsx**

Find all `fetch(\`${API_BASE}/api/...`)` calls and replace with `api.get()`, `api.post()`, `api.patch()`, `api.del()`. Update imports: add `{ api }` to the import from `@/lib/api`.

Pattern to replace:
```typescript
// Before:
const res = await fetch(`${API_BASE}/api/ideas?status=${filter}`)
const data = await res.json()

// After:
const data = await api.get(`/api/ideas?status=${filter}`)
```

For mutations (POST/PATCH/DELETE), same pattern:
```typescript
// Before:
await fetch(`${API_BASE}/api/ideas`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ id, status }),
})

// After:
await api.patch('/api/ideas', { id, status })
```

Replace `.catch(() => {})` with `.catch(() => {})` (keep silent catches where they exist — changing error UX is out of scope).

- [ ] **Step 2: Migrate Dashboard.tsx, Todos.tsx, Missions.tsx, Agents.tsx**

Same pattern. Find `fetch(\`${API_BASE}...`)`, replace with `api.*()` calls. Update imports.

- [ ] **Step 3: Verify build**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/Pipeline.tsx frontend/src/pages/Dashboard.tsx frontend/src/pages/Todos.tsx frontend/src/pages/Missions.tsx frontend/src/pages/Agents.tsx
git commit -m "refactor: migrate high-traffic pages to typed API client"
```

---

### Task 9: Migrate pages to use API client (batch 2 — remaining pages)

**Files:**
- Modify: `frontend/src/pages/Chat.tsx`
- Modify: `frontend/src/pages/Email.tsx`
- Modify: `frontend/src/pages/Memory.tsx`
- Modify: `frontend/src/pages/KnowledgeBase.tsx`
- Modify: `frontend/src/pages/Capture.tsx`
- Modify: `frontend/src/pages/Settings.tsx`
- Modify: `frontend/src/pages/Search.tsx`
- Modify: `frontend/src/pages/Messages.tsx`
- Modify: `frontend/src/pages/Personal.tsx`
- Modify: `frontend/src/pages/Calendar.tsx`
- Modify: `frontend/src/pages/CronJobs.tsx`
- Modify: `frontend/src/pages/Reminders.tsx`
- Modify: `frontend/src/pages/Login.tsx`

- [ ] **Step 1: Migrate all remaining pages**

Same `fetch() → api.*()` replacement pattern. Skip `EventSource` constructions (Messages.tsx SSE) — those stay as raw `new EventSource()`.

- [ ] **Step 2: Migrate components**

Update `frontend/src/components/QuickCaptureWidget.tsx` and `frontend/src/components/GlobalSearch.tsx` similarly.

- [ ] **Step 3: Update hooks**

Update `frontend/src/hooks/useTauriQuery.ts` and `frontend/src/hooks/useSupabaseQuery.ts` to import and use `api.get()` / `api.post()` etc. instead of raw `fetch()`.

- [ ] **Step 4: Verify build**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/ frontend/src/components/QuickCaptureWidget.tsx frontend/src/components/GlobalSearch.tsx frontend/src/hooks/
git commit -m "refactor: migrate all remaining pages and hooks to typed API client"
```

---

## Chunk 3: Chat Reconnection with Exponential Backoff

### Task 10: Add exponential backoff to Chat.tsx polling

**Files:**
- Modify: `frontend/src/pages/Chat.tsx`

The chat page currently polls `/api/chat/history` every 2 seconds via a fixed `setInterval`. When the backend is down, `failCountRef` increments and after 3 failures shows a "not configured" banner, but polling stays at 2s — hammering a dead server.

- [ ] **Step 1: Replace fixed interval with adaptive polling**

Replace the polling `useEffect` (currently around lines 175-178):

```typescript
// Before:
useEffect(() => {
  const interval = setInterval(pollHistory, 2000)
  return () => clearInterval(interval)
}, [pollHistory])
```

With exponential backoff logic:

```typescript
useEffect(() => {
  let delay = 2000
  let timer: ReturnType<typeof setTimeout>

  const tick = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/chat/history`)
      const d = await res.json()

      if (d.error === 'openclaw_not_configured') {
        setNotConfigured(true)
        setConnected(false)
        delay = Math.min(delay * 2, 30000) // back off up to 30s
      } else {
        // success — process messages (existing logic)
        setConnected(true)
        failCountRef.current = 0
        setNotConfigured(false)
        delay = 2000 // reset to fast polling

        // ... existing message processing from pollHistory ...
      }
    } catch {
      setConnected(false)
      failCountRef.current += 1
      if (failCountRef.current >= 3) setNotConfigured(true)
      delay = Math.min(delay * 2, 30000) // exponential backoff, cap at 30s
    }

    timer = setTimeout(tick, delay)
  }

  tick() // start immediately
  return () => clearTimeout(timer)
}, []) // no deps — refs handle stale closure
```

Key changes:
- `setTimeout` chain instead of `setInterval` — delay adapts per iteration
- On success: reset to 2s
- On failure: double delay, cap at 30s
- On `openclaw_not_configured`: also back off (don't hammer a server that says it's not configured)

- [ ] **Step 2: Remove the separate `pollHistory` useCallback**

The polling logic is now inline in the `useEffect`. Remove the `pollHistory` useCallback and merge its message-processing logic into the `tick` function above.

- [ ] **Step 3: Verify build**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 4: Test manually**

1. Start the app with OpenClaw running → should poll at 2s, show green "live" dot
2. Stop OpenClaw → should see delay grow (check Network tab: gaps between requests widen to 4s, 8s, 16s, 30s)
3. Restart OpenClaw → should recover to 2s polling within one cycle, green dot returns

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Chat.tsx
git commit -m "feat: add exponential backoff to chat polling (2s → 30s on failure)"
```

---

### Task 11: Final build verification

- [ ] **Step 1: Full Rust build**

Run: `cd src-tauri && cargo build 2>&1 | tail -5`
Expected: `Finished` with no errors.

- [ ] **Step 2: Full frontend type check**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Run frontend dev server**

Run: `cd frontend && npx vite --host 2>&1 | head -10`
Expected: Vite starts without errors.
