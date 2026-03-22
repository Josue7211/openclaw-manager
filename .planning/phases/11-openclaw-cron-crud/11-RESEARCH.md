# Phase 11: OpenClaw Agent Calendar (Cron CRUD) - Research

**Researched:** 2026-03-22
**Domain:** Frontend cron calendar UI with CRUD + Rust backend cron proxy routes
**Confidence:** HIGH

## Summary

Phase 11 adds full CRUD capabilities to the existing cron calendar page. The current `CronJobs.tsx` page already has a polished read-only calendar: a week grid (`WeekGrid.tsx`) showing cron fire times plotted on a 7-day time grid, a frequent-jobs bar (`FrequentBar.tsx`) for sub-hourly intervals, and a job list (`JobList.tsx`). It fetches data from `GET /api/crons` which shells out to `openclaw cron list --json`. The page is fully functional for viewing but has zero mutation capability -- no create, edit, toggle, or delete.

The backend currently fetches cron jobs via CLI binary invocation (`openclaw_cli.rs`). Phase 9 established the `gateway_forward()` proxy pattern in `gateway.rs` which is the standard way to forward CRUD operations to the OpenClaw API. The architecture research confirms the OpenClaw gateway exposes `POST /api/crons`, `PUT /api/crons/:id`, and `DELETE /api/crons/:id` endpoints. The approach is: create a new `crons.rs` route module that uses `gateway_forward()` for write operations while keeping the existing CLI-based `GET /crons` as the read path (it already works), then add a `useCrons()` hook on the frontend with optimistic mutations following the `useAgents()` pattern from Phase 10.

The frontend needs: (1) click-to-edit on existing calendar entries and job list items to open an edit form, (2) a create button that opens a form with schedule picker, (3) a toggle switch on each job for enable/disable, and (4) a delete button with confirmation dialog. The existing `CronJob` type in `pages/crons/types.ts` already has all required fields (`id`, `name`, `description`, `schedule`, `state`, `enabled`). No new dependencies are needed.

**Primary recommendation:** Add `routes/crons.rs` with POST/PATCH/DELETE handlers using `gateway_forward()`. Create a `useCrons()` hook with optimistic mutations. Add a `CronFormModal` component for create/edit. Add toggle switches and delete buttons to `JobList.tsx`. Make calendar event pills and job list items clickable to open the edit form.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| MH-07 | Full create/update/delete for cron jobs with a human-readable schedule editor and enable/disable toggle | Backend cron proxy routes via `gateway_forward()` + frontend `useCrons()` hook with optimistic mutations + schedule picker UI + Toggle component for enable/disable + confirmation dialog for delete |
</phase_requirements>

## Standard Stack

### Core (already in project -- zero new dependencies)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 19.2 | UI framework | Already used everywhere |
| @tanstack/react-query | 5.90 | Server state, mutations, cache | Used for all data fetching; `useMutation` for CRUD |
| @phosphor-icons/react | 2.1 | Icon library | Used across all pages |
| axum | existing | Rust HTTP framework | Backend already built on axum |
| reqwest | existing | HTTP client for gateway proxy | Used by `gateway_forward()` |

### Supporting (already in project)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| react-dom (createPortal) | 19.2 | Portal for modal/dialog rendering | Create/edit modal, delete confirmation |
| serde / serde_json | existing | JSON serialization | Backend request/response bodies |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom schedule picker | cronstrue (npm) for human-readable cron | Adding a new dep for cron-to-text is unnecessary -- the existing `humanSchedule()` in `types.ts` already handles this. The schedule picker should offer presets (every 5m, 30m, 1h, 6h, 12h, 24h) rather than raw crontab. |
| Inline editing in job list | Modal form (like AgentDetailPanel) | A modal is more appropriate: cron jobs have multiple fields (name, description, schedule, command). Inline editing would be too cramped in the compact job list. |
| Right-side panel (Notes pattern) | Modal dialog | Unlike agents which have many editable fields warranting a persistent side panel, cron jobs have just 3-4 fields. A modal is simpler, faster to build, and matches the existing `CreateAgentModal` precedent. |

**Installation:**
```bash
# No new packages needed -- everything is already in the project
```

## Architecture Patterns

### Recommended Project Structure
```
frontend/src/
  pages/
    crons/
      types.ts               # KEEP: CronJob, CronSchedule, helpers (already complete)
      WeekGrid.tsx            # MODIFY: add onClick handler to event pills
      FrequentBar.tsx         # MODIFY: add onClick handler to frequent job pills
      JobList.tsx             # MODIFY: add toggle switch, edit/delete buttons, onClick
      CronFormModal.tsx       # NEW: modal for create/edit with schedule picker
      __tests__/
        types.test.ts         # KEEP existing tests
        CronFormModal.test.ts # NEW: test schedule picker logic
  pages/
    CronJobs.tsx              # MODIFY: add create button, wire up CRUD callbacks
  hooks/
    useCrons.ts               # NEW: CRUD mutations with optimistic updates

src-tauri/src/
  routes/
    crons.rs                  # NEW: POST/PATCH/DELETE handlers using gateway_forward()
    mod.rs                    # MODIFY: add `pub mod crons;` and merge router
```

### Pattern 1: Gateway-Proxied CRUD (from agents.rs + gateway.rs)
**What:** Backend routes that forward write operations to the OpenClaw API via `gateway_forward()`, keeping all credential handling server-side.
**When to use:** For all cron CRUD mutations (create, update, delete, toggle).
**Example:**
```rust
// Source: existing gateway_forward() pattern in agents.rs lines 275-283
use super::gateway::gateway_forward;

async fn create_cron(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Json(body): Json<Value>,
) -> Result<Json<Value>, AppError> {
    let result = gateway_forward(
        &state,
        Method::POST,
        "/crons",
        Some(body),
    ).await?;
    Ok(Json(result))
}
```

### Pattern 2: Optimistic Mutations Hook (from useAgents.ts)
**What:** A `useCrons()` hook that wraps React Query's `useMutation` with optimistic cache updates and rollback on error.
**When to use:** For all frontend CRUD operations.
**Example:**
```typescript
// Source: useAgents.ts lines 29-62 pattern
const toggleMutation = useMutation({
  mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
    return api.patch<{ job: CronJob }>('/api/crons/update', { id, enabled })
  },
  onMutate: async ({ id, enabled }) => {
    await queryClient.cancelQueries({ queryKey: ['crons'] })
    const prev = queryClient.getQueryData<CronsResponse>(['crons'])
    queryClient.setQueryData<CronsResponse>(['crons'], (old) => ({
      ...old,
      jobs: (old?.jobs || []).map((j) =>
        j.id === id ? { ...j, enabled } : j
      ),
    }))
    return { prev }
  },
  onError: (_err, _vars, ctx) => {
    if (ctx?.prev) queryClient.setQueryData(['crons'], ctx.prev)
  },
  onSettled: () => invalidateCrons(),
})
```

### Pattern 3: Portal Confirmation Dialog (from AgentDetailPanel.tsx)
**What:** A `createPortal`-based modal with focus trap and escape key handling for destructive actions.
**When to use:** Before deleting a cron job.
**Example:**
```typescript
// Source: AgentDetailPanel.tsx lines 283-319
{confirmDeleteId && createPortal(
  <div style={{ position: 'fixed', inset: 0, zIndex: 9999, ... }}
    onClick={cancelDelete}>
    <div ref={dialogRef} role="dialog" aria-modal="true"
      aria-label="Confirm delete cron job" onClick={e => e.stopPropagation()}>
      <h3>Delete Cron Job</h3>
      <p>Are you sure you want to delete "{job.name}"?</p>
      <Button variant="secondary" onClick={cancelDelete}>Cancel</Button>
      <Button variant="danger" onClick={confirmDelete}>Delete</Button>
    </div>
  </div>,
  document.body,
)}
```

### Pattern 4: Toggle Switch (from settings/Toggle.tsx)
**What:** An accessible toggle component with `role="switch"` and `aria-checked`.
**When to use:** For enabling/disabling cron jobs inline in the job list.
**Example:**
```typescript
// Source: settings/Toggle.tsx
import Toggle from '@/pages/settings/Toggle'

<Toggle
  on={job.enabled ?? true}
  onToggle={(enabled) => toggleMutation.mutate({ id: job.id, enabled })}
  label={`Toggle ${job.name}`}
/>
```

### Anti-Patterns to Avoid
- **Don't use window.confirm():** Use the portal-based dialog pattern for accessibility and theming consistency.
- **Don't fetch via `openclaw` CLI for writes:** The CLI binary may not be installed. Use `gateway_forward()` for all mutations -- it has proper error handling, credential injection, and error sanitization.
- **Don't add cron expression parsing library:** The existing `humanSchedule()` and schedule presets (dropdown) are sufficient. Users should pick from presets, not type raw crontab syntax (MH-07 says "schedule picked from a UI, not raw crontab syntax").
- **Don't create a separate route at `/crons/new`:** Use a modal from the existing page. The crons page is already registered at `/crons` and adding sub-routes would be over-engineering for a form modal.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cron expression parsing | Custom parser for `0 0 * * *` | Schedule presets (every 5m, 30m, 1h, etc.) | MH-07 explicitly says "schedule picked from a UI, not raw crontab syntax". The `CronSchedule` type uses `kind: 'every'` with `everyMs` for interval jobs -- presets map directly to this. |
| Focus trap in modal | Custom focus management | `useFocusTrap` from `lib/hooks/useFocusTrap` | Already battle-tested across modals and dialogs |
| Escape key handling | Custom keydown listener | `useEscapeKey` from `lib/hooks/useEscapeKey` | Already used in all modals |
| Toggle switch | Custom checkbox styling | `Toggle` from `pages/settings/Toggle.tsx` | Accessible (`role="switch"`, `aria-checked`), spring-animated, already proven |
| Delete confirmation | `window.confirm()` | Portal dialog with `useFocusTrap` | Matches existing pattern from AgentDetailPanel, accessible |
| API communication | Direct fetch to OpenClaw | `gateway_forward()` in `gateway.rs` | Handles credentials, error sanitization, path validation |

**Key insight:** Every UI primitive needed (Toggle, Button, modal dialog, focus trap, escape key, portal) already exists in the codebase. The backend proxy pattern (`gateway_forward()`) is also fully established. This phase is pure composition of existing patterns.

## Common Pitfalls

### Pitfall 1: CLI vs Gateway Read Path Mismatch
**What goes wrong:** The `GET /api/crons` currently uses the `openclaw` CLI binary (`openclaw cron list --json`). If we also add a gateway-based GET, the two sources could return different data formats.
**Why it happens:** The CLI and gateway API may serialize `CronJob` differently.
**How to avoid:** Keep the existing CLI-based `GET /crons` as the read path (it works and the frontend already consumes its format). Only add gateway proxy routes for write operations (POST, PATCH, DELETE). After a mutation, invalidate the `['crons']` query to re-fetch via CLI.
**Warning signs:** Different field names or missing fields after mutations.

### Pitfall 2: Optimistic Update Format Mismatch
**What goes wrong:** The optimistic update adds/modifies a `CronJob` in the cache, but the shape doesn't match what the CLI returns on re-fetch, causing UI flicker.
**Why it happens:** The gateway API returns the created/updated job in its format, while the CLI list returns a slightly different shape.
**How to avoid:** Make optimistic updates match the `CronJob` interface exactly as defined in `types.ts`. On `onSettled`, always invalidate to get the authoritative list from the CLI.
**Warning signs:** UI elements briefly disappear or change position after mutation settles.

### Pitfall 3: Schedule Preset to everyMs Mapping
**What goes wrong:** The schedule picker presets need to map to `CronSchedule` objects that the OpenClaw API understands.
**Why it happens:** The `CronSchedule` type has two modes: `kind: 'every'` with `everyMs` (interval-based) and `kind: 'cron'` with `expr` (cron expression). The API needs to receive the correct format.
**How to avoid:** For the schedule picker, use a `<select>` with predefined presets that map directly to `{ kind: 'every', everyMs: N }`. Include a "Custom (cron)" option for advanced users that allows typing a cron expression mapped to `{ kind: 'cron', expr: '...' }`.
**Warning signs:** Jobs created with wrong schedule, or schedule not displaying correctly in the calendar.

### Pitfall 4: Axum Route Registration -- Path Conflict with openclaw_cli.rs
**What goes wrong:** New crons CRUD routes conflict with the existing `GET /crons` in `openclaw_cli.rs` because both register on the `/crons` path.
**Why it happens:** `openclaw_cli.rs` already registers `GET /crons`. The new `crons.rs` module needs to register `POST /crons` on the same path, which is fine in Axum (different methods), but could cause confusion.
**How to avoid:** Register POST/PATCH/DELETE in the new `crons.rs` on the `/crons` path (POST) and distinct sub-paths for update and delete (e.g., `/crons/update`, `/crons/delete`) since Axum path params (`/crons/{id}`) with dynamic segments may conflict with fixed segments. Alternatively, use request body for the ID (matching the `agents.rs` pattern where DELETE reads the ID from JSON body).
**Warning signs:** Compilation succeeds but routes return 404 or method-not-allowed.

### Pitfall 5: Missing `mod.rs` Registration
**What goes wrong:** Creating `crons.rs` but forgetting to add `pub mod crons;` to `mod.rs` and merge the router.
**Why it happens:** Rust module system requires explicit declaration.
**How to avoid:** Always update `mod.rs` with both the module declaration and router merge.
**Warning signs:** Compilation error about unresolved module, or 404 on the new endpoints.

## Code Examples

Verified patterns from the existing codebase:

### Backend: Cron CRUD Route Structure
```rust
// Source: agents.rs pattern + gateway.rs gateway_forward()
// File: src-tauri/src/routes/crons.rs

use axum::{
    extract::State,
    routing::{delete, patch, post},
    Json, Router,
};
use reqwest::Method;
use serde::Deserialize;
use serde_json::{json, Value};

use crate::error::AppError;
use crate::server::{AppState, RequireAuth};
use super::gateway::gateway_forward;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/crons", post(create_cron))
        .route("/crons/update", patch(update_cron))
        .route("/crons/delete", delete(delete_cron))
}

#[derive(Debug, Deserialize)]
struct CreateCronBody {
    name: String,
    description: Option<String>,
    schedule: Value,  // { kind, everyMs?, expr? }
}

async fn create_cron(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Json(body): Json<CreateCronBody>,
) -> Result<Json<Value>, AppError> {
    if body.name.trim().is_empty() {
        return Err(AppError::BadRequest("name required".into()));
    }
    let payload = json!({
        "name": body.name.trim(),
        "description": body.description,
        "schedule": body.schedule,
    });
    let result = gateway_forward(&state, Method::POST, "/crons", Some(payload)).await?;
    Ok(Json(result))
}

#[derive(Debug, Deserialize)]
struct UpdateCronBody {
    id: String,
    #[serde(flatten)]
    fields: Value,
}

async fn update_cron(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Json(body): Json<Value>,
) -> Result<Json<Value>, AppError> {
    let id = body.get("id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| AppError::BadRequest("id required".into()))?;
    if id.is_empty() || id.len() > 100 {
        return Err(AppError::BadRequest("invalid cron id".into()));
    }
    let result = gateway_forward(
        &state, Method::PUT, &format!("/crons/{id}"), Some(body),
    ).await?;
    Ok(Json(result))
}

#[derive(Debug, Deserialize)]
struct DeleteCronBody {
    id: String,
}

async fn delete_cron(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Json(body): Json<DeleteCronBody>,
) -> Result<Json<Value>, AppError> {
    if body.id.is_empty() || body.id.len() > 100 {
        return Err(AppError::BadRequest("invalid cron id".into()));
    }
    let result = gateway_forward(
        &state, Method::DELETE, &format!("/crons/{}", body.id), None,
    ).await?;
    Ok(Json(result))
}
```

### Frontend: useCrons Hook
```typescript
// Source: useAgents.ts pattern
// File: frontend/src/hooks/useCrons.ts

import { useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { CronJob } from '@/pages/crons/types'

interface CronsResponse { jobs: CronJob[] }

export function useCrons() {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery<CronsResponse>({
    queryKey: ['crons'],
    queryFn: () => api.get<CronsResponse>('/api/crons'),
  })

  const invalidateCrons = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['crons'] })
  }, [queryClient])

  const createMutation = useMutation({
    mutationFn: async (payload: {
      name: string;
      schedule: CronJob['schedule'];
      description?: string
    }) => {
      return api.post<{ job: CronJob }>('/api/crons', payload)
    },
    onSettled: () => invalidateCrons(),
  })

  const updateMutation = useMutation({
    mutationFn: async (fields: { id: string } & Partial<CronJob>) => {
      return api.patch<{ job: CronJob }>('/api/crons/update', fields)
    },
    onMutate: async (fields) => {
      await queryClient.cancelQueries({ queryKey: ['crons'] })
      const prev = queryClient.getQueryData<CronsResponse>(['crons'])
      queryClient.setQueryData<CronsResponse>(['crons'], (old) => ({
        ...old,
        jobs: (old?.jobs || []).map((j) =>
          j.id === fields.id ? { ...j, ...fields } : j
        ),
      }))
      return { prev }
    },
    onError: (_err, _fields, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['crons'], ctx.prev)
    },
    onSettled: () => invalidateCrons(),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.del('/api/crons/delete', { id })
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['crons'] })
      const prev = queryClient.getQueryData<CronsResponse>(['crons'])
      queryClient.setQueryData<CronsResponse>(['crons'], (old) => ({
        ...old,
        jobs: (old?.jobs || []).filter((j) => j.id !== id),
      }))
      return { prev }
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['crons'], ctx.prev)
    },
    onSettled: () => invalidateCrons(),
  })

  return {
    jobs: data?.jobs ?? [],
    loading: isLoading,
    createMutation,
    updateMutation,
    deleteMutation,
    invalidateCrons,
  }
}
```

### Frontend: Schedule Preset Picker
```typescript
// Schedule presets for the create/edit form
const SCHEDULE_PRESETS = [
  { label: 'Every 5 minutes', schedule: { kind: 'every', everyMs: 300000 } },
  { label: 'Every 15 minutes', schedule: { kind: 'every', everyMs: 900000 } },
  { label: 'Every 30 minutes', schedule: { kind: 'every', everyMs: 1800000 } },
  { label: 'Every hour', schedule: { kind: 'every', everyMs: 3600000 } },
  { label: 'Every 2 hours', schedule: { kind: 'every', everyMs: 7200000 } },
  { label: 'Every 6 hours', schedule: { kind: 'every', everyMs: 21600000 } },
  { label: 'Every 12 hours', schedule: { kind: 'every', everyMs: 43200000 } },
  { label: 'Every day', schedule: { kind: 'every', everyMs: 86400000 } },
  { label: 'Custom (cron expression)', schedule: null }, // shows text input
] as const
```

### Existing Cron Page Data Flow (for reference)
```
CronJobs.tsx
  └── useTauriQuery(['crons'], '/api/crons')
        └── api.get('/api/crons')
              └── Axum GET /crons handler (openclaw_cli.rs)
                    └── `openclaw cron list --json` (CLI binary)
                          └── Returns { jobs: CronJob[] }

After mutation (new flow):
  createMutation.mutate(payload)
    └── api.post('/api/crons', payload)
          └── Axum POST /crons handler (crons.rs)
                └── gateway_forward(&state, POST, "/crons", body)
                      └── OpenClaw gateway API POST /crons
  onSettled → invalidateCrons()
    └── refetches via GET /crons (CLI path, unchanged)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| CLI binary invocation for all OpenClaw ops | `gateway_forward()` HTTP proxy | Phase 9 (2026-03-22) | Write operations no longer need CLI binary installed |
| Agent inline editing | Split-panel CRUD with optimistic mutations | Phase 10 (2026-03-22) | Established the mutation hook pattern (`useAgents()`) |
| Read-only cron calendar | Will add CRUD after this phase | Phase 11 (this phase) | Users can manage cron jobs from the UI |

**Deprecated/outdated:**
- The `openclaw_cli.rs` approach of shelling out to CLI is legacy for writes. Reads still use it (works fine), but writes must use `gateway_forward()`.

## Open Questions

1. **OpenClaw API cron payload format**
   - What we know: The frontend `CronJob` type has `{ id, name, description, schedule: { kind, everyMs?, expr? }, state, enabled }`. The CLI returns this format.
   - What's unclear: The exact POST/PUT body format the OpenClaw gateway expects. It likely mirrors the CronJob type but we cannot verify without API docs.
   - Recommendation: Send the same shape as `CronJob` (minus `state` which is server-computed). If the API rejects it, the `gateway_forward()` error sanitization will surface a clear error message for debugging.

2. **Cron expression support in calendar view**
   - What we know: `getFireTimesInWeek()` only handles `kind: 'every'` with `everyMs`. Jobs with `kind: 'cron'` and `expr` return an empty fire times array -- they show in the job list but not on the calendar grid.
   - What's unclear: Whether we should parse cron expressions client-side to plot them on the calendar.
   - Recommendation: Defer cron expression calendar plotting. It requires a cron parser library (like `cron-parser` npm) and adds scope. For Phase 11, cron-expression jobs appear in the job list only (which is already the behavior). Calendar grid plotting of cron expressions can be a future enhancement.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1 (jsdom) |
| Config file | `frontend/vitest.config.ts` |
| Quick run command | `cd frontend && npx vitest run src/pages/crons/__tests__/ src/hooks/__tests__/` |
| Full suite command | `cd frontend && npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MH-07a | Schedule presets map to valid CronSchedule objects | unit | `cd frontend && npx vitest run src/pages/crons/__tests__/CronFormModal.test.ts -x` | Wave 0 |
| MH-07b | useCrons hook provides CRUD mutations | unit | `cd frontend && npx vitest run src/hooks/__tests__/useCrons.test.ts -x` | Wave 0 |
| MH-07c | CronJob type matches expected shape | unit | `cd frontend && npx vitest run src/pages/crons/__tests__/types.test.ts -x` | Exists |
| MH-07d | Toggle enabled/disabled optimistic update | unit | `cd frontend && npx vitest run src/hooks/__tests__/useCrons.test.ts -x` | Wave 0 |
| MH-07e | Backend cron CRUD route tests | unit | `cd /mnt/storage/projects/mission-control/src-tauri && cargo test routes::crons` | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd frontend && npx vitest run src/pages/crons/__tests__/ src/hooks/__tests__/`
- **Per wave merge:** `cd frontend && npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `frontend/src/pages/crons/__tests__/CronFormModal.test.ts` -- covers MH-07a (schedule presets)
- [ ] `frontend/src/hooks/__tests__/useCrons.test.ts` -- covers MH-07b, MH-07d (CRUD hook)
- [ ] `src-tauri/src/routes/crons.rs` -- backend module with tests (covers MH-07e)

## Sources

### Primary (HIGH confidence)
- `frontend/src/pages/CronJobs.tsx` -- existing cron page (read-only calendar with week grid)
- `frontend/src/pages/crons/types.ts` -- CronJob/CronSchedule types, helper functions
- `frontend/src/pages/crons/WeekGrid.tsx` -- week calendar grid component
- `frontend/src/pages/crons/JobList.tsx` -- job list component
- `frontend/src/pages/crons/FrequentBar.tsx` -- frequent jobs bar
- `frontend/src/hooks/useAgents.ts` -- optimistic mutation hook pattern (Phase 10)
- `src-tauri/src/routes/gateway.rs` -- `gateway_forward()` proxy function (Phase 9)
- `src-tauri/src/routes/agents.rs` -- agent CRUD + gateway usage pattern
- `src-tauri/src/routes/openclaw_cli.rs` -- existing `GET /crons` via CLI
- `frontend/src/pages/agents/AgentDetailPanel.tsx` -- confirmation dialog pattern
- `frontend/src/pages/settings/Toggle.tsx` -- accessible toggle switch component
- `frontend/src/pages/calendar/` -- CalDAV calendar (WeekView, MonthView, shared.ts)
- `frontend/src/lib/query-keys.ts` -- centralized query keys (no `crons` key yet)

### Secondary (MEDIUM confidence)
- `.planning/research/ARCHITECTURE.md` -- OpenClaw gateway API endpoint listing
- `.planning/research/STACK.md` -- cron CRUD approach recommendations
- `.planning/ROADMAP.md` -- Phase 11 success criteria and dependencies

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - zero new dependencies, all patterns already established in codebase
- Architecture: HIGH - directly reuses Phase 9 (gateway_forward) and Phase 10 (useAgents) patterns
- Pitfalls: HIGH - documented from direct codebase analysis and existing anti-patterns
- OpenClaw API format: MEDIUM - inferred from existing CronJob type and CLI output format, not verified against gateway API docs

**Research date:** 2026-03-22
**Valid until:** 2026-04-22 (stable -- internal patterns, no external dependencies)
