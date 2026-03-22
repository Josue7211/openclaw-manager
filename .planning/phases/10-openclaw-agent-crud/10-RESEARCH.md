# Phase 10: OpenClaw Agent Management - Research

**Researched:** 2026-03-22
**Domain:** Frontend CRUD UI + Rust backend agent lifecycle management
**Confidence:** HIGH

## Summary

Phase 10 transforms the existing agents page from a simple card grid with inline editing into a polished master-detail layout with a right-side settings panel (mirroring the Notes page pattern), full CRUD capabilities (create, update, delete), and agent lifecycle controls (start, stop, restart). The backend needs POST and DELETE endpoints added to `agents.rs` plus lifecycle proxy routes through `gateway_forward()`. The frontend needs a layout overhaul from the current scrollable card grid to a full-bleed split panel with agent list on the left and detail panel on the right.

The codebase already has well-established patterns for every building block needed: optimistic mutations with rollback (`useTodos` hook), split-panel layouts (Notes page), slide panels (Knowledge `SlidePanel`), confirmation dialogs (DashboardTabs portal pattern), real-time subscription (`useTableRealtime`), and the gateway proxy (`gateway_forward()`). No new dependencies are needed.

**Primary recommendation:** Reuse the Notes page `position: absolute; inset: 0` full-bleed layout with a resizable left panel (agent list) and a right panel (agent detail/settings). Backend needs 3 new endpoints: `POST /agents` (create), `DELETE /agents` (soft-delete), and `POST /agents/action` (start/stop/restart via `gateway_forward()`). Extract optimistic mutation logic into a `useAgents()` hook following the `useTodos()` pattern.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| MH-06 | Full create/update/delete for agents plus lifecycle controls (start, stop, restart). Proxied through gateway helper. | Backend CRUD endpoints + gateway_forward lifecycle proxy + frontend optimistic mutations + split-panel UI |
</phase_requirements>

## Standard Stack

### Core (already in project -- zero new dependencies)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 18 | UI framework | Already used everywhere |
| @tanstack/react-query | existing | Server state, mutations, cache | Already used for all data fetching |
| @phosphor-icons/react | existing | Icon library | Already used across all pages |
| axum | existing | Rust HTTP framework | Backend already built on axum |
| sqlx | existing | SQLite queries | All CRUD uses sqlx |

### Supporting (already in project)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| react-router-dom | existing | URL routing | Route already registered at `/agents` |
| react-dom (createPortal) | 18 | Portal for confirmation dialog | Delete confirmation rendering |
| serde_json | existing | JSON serialization | Backend request/response bodies |
| chrono | existing | Timestamps | `created_at`, `updated_at` fields |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom split panel | ResizablePanel component | ResizablePanel exists but is sidebar-specific; Notes page pattern is simpler and proven for content pages |
| Modal for settings | Slide panel (Knowledge pattern) | User specifically wants right-side panel like notes editor, not a modal overlay |
| window.confirm() for delete | Portal-based dialog | Portal dialog is accessible, themed, and matches DashboardTabs pattern |

**Installation:**
```bash
# No new packages needed -- everything is already in the project
```

## Architecture Patterns

### Recommended Project Structure
```
frontend/src/
  pages/
    agents/
      AgentCard.tsx          # MODIFY: simplify card, add onClick for selection
      AgentDetailPanel.tsx   # NEW: right-side detail/settings panel
      AgentList.tsx          # NEW: left-side scrollable agent list with search
      CreateAgentModal.tsx   # NEW: modal for creating new agents
      LiveProcesses.tsx      # KEEP: shown in agent list area or detail panel
      types.ts               # MODIFY: extend Agent type with missing fields
      __tests__/
        types.test.ts        # KEEP existing, update for new fields
  pages/
    Agents.tsx               # MODIFY: full-bleed split layout
  lib/
    hooks/
      useAgents.ts           # NEW: CRUD mutations with optimistic updates

src-tauri/src/
  routes/
    agents.rs                # MODIFY: add POST + DELETE + lifecycle action endpoints
```

### Pattern 1: Full-Bleed Split Panel Layout (from Notes page)
**What:** `position: absolute; inset: 0` container with flex children for list and detail panels, separated by a resizable divider.
**When to use:** Any page that needs a master-detail view.
**Example:**
```typescript
// Source: frontend/src/pages/notes/Notes.tsx lines 138-175
return (
  <div style={{
    position: 'absolute', inset: 0,
    margin: '-20px -28px',      // Counteracts parent padding for full-bleed
    display: 'flex', overflow: 'hidden',
    userSelect: 'text', WebkitUserSelect: 'text',
  }}>
    {/* Left panel: list */}
    <div style={{
      width: listWidth, minWidth: listWidth,
      borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Agent list content */}
    </div>

    {/* Resize handle */}
    <div
      onMouseDown={handleResize}
      style={{ width: 4, cursor: 'col-resize', flexShrink: 0,
               marginLeft: -2, marginRight: -2, zIndex: 10, position: 'relative' }}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize agent list"
    />

    {/* Right panel: detail */}
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {selectedAgent ? <AgentDetailPanel agent={selectedAgent} /> : <EmptyState />}
    </div>
  </div>
)
```

### Pattern 2: Optimistic Mutations with Rollback (from useTodos)
**What:** Cancel queries, snapshot previous state, optimistically update cache, rollback on error, invalidate on settle.
**When to use:** All CRUD mutations for immediate UI feedback.
**Example:**
```typescript
// Source: frontend/src/lib/hooks/useTodos.ts lines 18-35
const createMutation = useMutation({
  mutationFn: async (agent: Partial<Agent>) => {
    return api.post<{ agent: Agent }>('/api/agents', agent)
  },
  onMutate: async (newAgent) => {
    await queryClient.cancelQueries({ queryKey: queryKeys.agents })
    const prev = queryClient.getQueryData(queryKeys.agents)
    queryClient.setQueryData(queryKeys.agents, (old: { agents?: Agent[] } | undefined) => ({
      ...old,
      agents: [...(old?.agents || []), { id: 'temp-' + Date.now(), ...newAgent } as Agent],
    }))
    return { prev }
  },
  onError: (_err, _vars, ctx) => {
    if (ctx?.prev) queryClient.setQueryData(queryKeys.agents, ctx.prev)
  },
  onSettled: () => invalidateAgents(),
})
```

### Pattern 3: Confirmation Dialog via Portal (from DashboardTabs)
**What:** Delete confirmation rendered via `createPortal(dialog, document.body)` to escape container-type layout constraints.
**When to use:** Destructive actions (delete agent).
**Example:**
```typescript
// Source: frontend/src/components/dashboard/DashboardTabs.tsx lines 275-319
{confirmDeleteId && createPortal(
  <div role="dialog" aria-modal="true" style={{
    position: 'fixed', inset: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(0,0,0,0.5)', zIndex: 'var(--z-modal)',
  }} onClick={handleCancel}>
    <div style={{
      background: 'var(--bg-elevated)', borderRadius: 'var(--radius-lg)',
      padding: '24px', maxWidth: '360px', width: '90%',
      border: '1px solid var(--border)', boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
    }} onClick={e => e.stopPropagation()}>
      <p style={{ fontWeight: 600 }}>Delete agent?</p>
      <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
        This cannot be undone.
      </p>
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
        <Button variant="secondary" onClick={cancel}>Cancel</Button>
        <Button variant="danger" onClick={confirmDelete}>Delete</Button>
      </div>
    </div>
  </div>,
  document.body,
)}
```

### Pattern 4: Backend CRUD with Sync Engine (from todos.rs)
**What:** Insert/update/delete in local SQLite, log mutation for sync engine, audit log, return updated row.
**When to use:** All data mutations that need Supabase sync.
**Example:**
```rust
// Source: src-tauri/src/routes/todos.rs lines 61-113
async fn create_agent(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Json(body): Json<CreateAgentBody>,
) -> Result<Json<Value>, AppError> {
    let id = crate::routes::util::random_uuid();
    let now = chrono::Utc::now().to_rfc3339();
    // INSERT into agents table
    sqlx::query("INSERT INTO agents (id, user_id, display_name, emoji, role, model, ...) VALUES (?, ?, ?, ?, ?, ?, ...)")
        .bind(&id).bind(&session.user_id)/* ... */
        .execute(&state.db).await?;
    // Log mutation for sync engine
    crate::sync::log_mutation(&state.db, "agents", &id, "INSERT", Some(&payload)).await?;
    // Audit trail
    crate::audit::log_audit_or_warn(&state.db, &session.user_id, "create", "agents", Some(&id), None).await;
    Ok(Json(json!({ "agent": agent_val })))
}
```

### Pattern 5: Lifecycle Actions via Gateway Proxy
**What:** Start/stop/restart agents by forwarding commands to the OpenClaw API through `gateway_forward()`.
**When to use:** Any operation that needs to reach the remote OpenClaw VM.
**Example:**
```rust
// Based on: src-tauri/src/routes/gateway.rs gateway_forward()
async fn agent_action(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Json(body): Json<AgentActionBody>,
) -> Result<Json<Value>, AppError> {
    validate_uuid(&body.agent_id)?;
    let path = format!("/agents/{}/action", body.agent_id);
    let payload = json!({ "action": body.action }); // "start" | "stop" | "restart"
    gateway_forward(&state, Method::POST, &path, Some(payload)).await
        .map(Json)
}
```

### Pattern 6: Create Modal (from Knowledge AddEntryModal)
**What:** Fixed-position modal with backdrop, form, focus trap, escape key handling, loading state.
**When to use:** Creating new agents.
**Example:**
```typescript
// Source: frontend/src/pages/knowledge/AddEntryModal.tsx lines 62-162
<div style={{ position: 'fixed', inset: 0, zIndex: 300,
              background: 'var(--overlay-heavy)',
              display: 'flex', alignItems: 'center', justifyContent: 'center' }}
     onClick={onClose}>
  <div ref={trapRef} role="dialog" aria-modal="true"
       style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)',
                borderRadius: '12px', padding: '24px', width: '480px' }}
       onClick={e => e.stopPropagation()}>
    <form onSubmit={handleSubmit}>
      {/* Form fields: name, emoji, role, model select */}
      <Button type="submit" variant="primary" disabled={loading}>
        {loading ? 'Creating...' : 'Create Agent'}
      </Button>
    </form>
  </div>
</div>
```

### Anti-Patterns to Avoid
- **Inline editing on cards for full config:** The current AgentCard has inline editing for name/emoji/role/model. Move comprehensive editing to the detail panel; keep cards read-only with a click-to-select interaction.
- **Direct fetch without React Query for mutations:** All mutations must go through `useMutation` for optimistic updates and cache management.
- **`window.confirm()` for delete:** Use the portal-based confirmation dialog pattern from DashboardTabs.
- **Custom DOM events for cross-component communication:** Use React Query cache invalidation and `useTableRealtime` SSE subscription instead.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| UUID generation | Custom ID generator | `crate::routes::util::random_uuid()` (backend), `crypto.randomUUID()` (frontend temp IDs) | Already exists, used everywhere |
| Optimistic cache updates | Manual state management | React Query `onMutate`/`onError`/`onSettled` | Proven rollback pattern in `useTodos` |
| Focus trap in modals | Manual focus management | `useFocusTrap` hook | Already exists in `lib/hooks/` |
| Escape key handling | `keydown` event listener | `useEscapeKey` hook | Already exists in `lib/hooks/` |
| Real-time updates | Manual polling | `useTableRealtime('agents', ...)` | SSE-based, already used on agents page |
| Error display | Custom error handling | `ApiError` class + `useApiError` hook | Already exists in `lib/api.ts` and `lib/hooks/` |
| Gateway proxying | Direct HTTP calls to OpenClaw | `gateway_forward()` from `routes/gateway.rs` | Built in Phase 9, handles auth + error sanitization |
| Sync to Supabase | Manual Supabase calls | `crate::sync::log_mutation()` | Sync engine handles push automatically |
| Audit logging | Skip it | `crate::audit::log_audit_or_warn()` | Security requirement per CLAUDE.md |
| Resize handle | Custom drag implementation | Copy Notes.tsx `handleResize` pattern | Handles mouse capture, cursor, user-select correctly |

**Key insight:** Every piece of infrastructure needed for this phase already exists in the codebase. The work is composition, not invention.

## Common Pitfalls

### Pitfall 1: Full-Bleed Layout Missing Negative Margin
**What goes wrong:** The agent page renders inside the `<main>` element which has padding. Without `margin: '-20px -28px'`, the split panel won't fill the entire area.
**Why it happens:** The Notes page uses this trick but it's easy to forget.
**How to avoid:** Copy the exact `position: absolute; inset: 0; margin: '-20px -28px'` pattern from Notes.tsx line 139-144.
**Warning signs:** Visible gap between sidebar and agent list panel.

### Pitfall 2: Soft Delete vs Hard Delete
**What goes wrong:** Hard-deleting agents from SQLite causes sync conflicts with Supabase.
**Why it happens:** The sync engine expects rows to exist for conflict resolution. The GET query already filters `WHERE deleted_at IS NULL`.
**How to avoid:** Always soft-delete by setting `deleted_at = NOW()`. The cleanup job in `server.rs` (line 1046-1063) purges rows where `deleted_at` is older than 30 days and `synced_at` is set.
**Warning signs:** Agents reappear after deletion on next sync.

### Pitfall 3: Axum Route Registration Silently Failing
**What goes wrong:** New POST/DELETE handlers compile but return 404 at runtime.
**Why it happens:** Per CLAUDE.md: "Handlers returning `Result<Response, AppError>` may silently fail to register in merged routers. Use `Result<Json<Value>, AppError>` to match all other handlers."
**How to avoid:** Always return `Result<Json<Value>, AppError>`. Test with `curl` immediately after adding new routes.
**Warning signs:** 404 on a route that definitely compiles.

### Pitfall 4: Agent Type Mismatch Between Frontend and Backend
**What goes wrong:** Frontend `Agent` type has 8 fields, but backend returns 12 fields (including `name`, `sort_order`, `created_at`, `updated_at`). Creating a new agent requires server-generated fields.
**Why it happens:** Frontend type was written before backend schema was finalized.
**How to avoid:** Extend the frontend `Agent` type to include all backend fields. Make server-generated fields optional in the create form.
**Warning signs:** TypeScript errors when trying to use `created_at` or `sort_order`.

### Pitfall 5: Mutation Log for Sync
**What goes wrong:** New POST/DELETE endpoints don't call `log_mutation()`, so changes never sync to Supabase.
**Why it happens:** Easy to forget -- the existing PATCH handler calls it but POST/DELETE are new.
**How to avoid:** Every mutation endpoint MUST call `crate::sync::log_mutation(&state.db, "agents", &id, "INSERT"|"DELETE", Some(&payload))`.
**Warning signs:** Agents created locally don't appear in Supabase, or deleted agents reappear.

### Pitfall 6: Lifecycle Actions Without OpenClaw Configured
**What goes wrong:** Start/stop/restart buttons fail when OpenClaw is not configured.
**Why it happens:** `gateway_forward()` returns "OpenClaw API not configured" error.
**How to avoid:** Check OpenClaw health status. If not configured, disable lifecycle buttons with a tooltip explaining why. Use the existing `/api/openclaw/health` endpoint.
**Warning signs:** Error toasts on every lifecycle action click.

### Pitfall 7: Portal Dialog Escaping container-type
**What goes wrong:** Confirmation dialog positioned incorrectly or clipped.
**Why it happens:** The `<main>` element has `container-type: inline-size` which traps `position: fixed` elements.
**How to avoid:** Use `createPortal(dialog, document.body)` -- exactly the pattern used in DashboardTabs.tsx.
**Warning signs:** Dialog appears inside the main content area instead of centered on screen.

### Pitfall 8: cargo tauri dev Not Recompiling
**What goes wrong:** Changes to `.rs` files don't take effect after restart.
**Why it happens:** Per CLAUDE.md: "`cargo tauri dev` doesn't always recompile after editing `.rs` files."
**How to avoid:** Run `touch src-tauri/src/routes/agents.rs` before `cargo tauri dev` if changes aren't picked up. Or `cargo clean -p mission-control`.
**Warning signs:** Old endpoint behavior persists after code changes.

## Code Examples

### Existing Agent Data Model (Backend SQLite Schema)
```sql
-- Source: src-tauri/migrations/0006_relax_not_null.sql lines 6-21
CREATE TABLE agents (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT DEFAULT '',
    display_name TEXT,
    emoji TEXT,
    role TEXT,
    status TEXT DEFAULT 'idle',
    current_task TEXT DEFAULT '',
    model TEXT,
    color TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    deleted_at TEXT
);
```

### Existing Frontend Agent Type (needs extension)
```typescript
// Source: frontend/src/pages/agents/types.ts
// CURRENT:
export interface Agent {
  id: string
  display_name: string
  emoji: string
  role: string
  status: string
  current_task: string | null
  color: string | null
  model: string | null
}

// NEEDS TO BECOME:
export interface Agent {
  id: string
  name: string              // system name (e.g., 'koda')
  display_name: string
  emoji: string
  role: string
  status: string
  current_task: string | null
  color: string | null
  model: string | null
  sort_order: number
  created_at: string
  updated_at: string
}
```

### Existing Backend Router (GET + PATCH only)
```rust
// Source: src-tauri/src/routes/agents.rs lines 27-32
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/agents", get(get_agents).patch(update_agent))
        .route("/agents/active-coders", get(active_coders))
        .route("/subagents/active", get(subagents_active))
}
// NEEDS: .post(create_agent).delete(delete_agent) on "/agents"
//        .route("/agents/action", post(agent_action)) for lifecycle
```

### Existing Page Query + Real-time Pattern
```typescript
// Source: frontend/src/pages/Agents.tsx lines 25-64
const { data: agentsData, isLoading } = useQuery<{ agents: Agent[] }>({
  queryKey: queryKeys.agents,
  queryFn: () => api.get<{ agents: Agent[] }>('/api/agents'),
  enabled: !_demo,
})
useTableRealtime('agents', { queryKey: queryKeys.agents })
```

### Existing Agent Status Constants
```typescript
// Source: frontend/src/lib/constants.ts
export const AGENT_STATUS = {
  ACTIVE: 'active',
  IDLE: 'idle',
  AWAITING_DEPLOY: 'awaiting_deploy',
} as const
```

### Gateway Forward Function Signature
```rust
// Source: src-tauri/src/routes/gateway.rs lines 111-164
pub(crate) async fn gateway_forward(
    state: &AppState,
    method: Method,
    path: &str,
    body: Option<Value>,
) -> Result<Value, AppError>
```

### Module Registration (already done)
```typescript
// Source: frontend/src/lib/modules.ts line 23
{ id: 'agents', name: 'Agents', description: 'Agent management', icon: 'Bot', route: '/agents' },
```

### Route Registration (already done)
```typescript
// Source: frontend/src/main.tsx lines 29, 294
const Agents = lazy(() => import('./pages/Agents'))
<Route path="/agents" element={<Suspense fallback={<GenericPageSkeleton />}><Agents /></Suspense>} />
```

### Query Key (already registered)
```typescript
// Source: frontend/src/lib/query-keys.ts line 8
agents: ['agents'] as const,
```

### Existing Model Sync to OpenClaw (fire-and-forget)
```rust
// Source: src-tauri/src/routes/agents.rs lines 188-215
// When model changes, sync to OpenClaw API:
if let Some(model) = &body.model {
    if let Some(base) = openclaw_api_url(&state) {
        let url = format!("{}/agents/model", base);
        tokio::spawn(async move {
            client.post(&url).json(&json!({"agentId": id, "model": model})).send().await;
        });
    }
}
```

### API Wrapper Methods
```typescript
// Source: frontend/src/lib/api.ts lines 105-111
export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  del: <T>(path: string, body?: unknown) => request<T>('DELETE', path, body),
}
```

### Button Component Variants
```typescript
// Source: frontend/src/components/ui/Button.tsx
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
// danger: { background: 'var(--red-500)', color: 'var(--text-on-color)' }
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Inline editing on cards | Detail panel for full config | This phase | Cards become click-to-select, detail panel handles editing |
| No create/delete | Full CRUD | This phase | Users can manage agent fleet from the UI |
| No lifecycle control | Start/stop/restart via gateway | This phase | Users can control agents without SSH |
| `window.confirm()` | Portal confirmation dialog | DashboardTabs already uses this | Polished, accessible, themeable |

**Deprecated/outdated:**
- The current inline editing pattern on `AgentCard` (the `editing` state + save/cancel buttons) will be replaced with click-to-select behavior. All editing moves to the detail panel.
- The model selection `<select>` dropdown in AgentCard will move to the detail panel.

## Open Questions

1. **OpenClaw Agent Lifecycle API**
   - What we know: `gateway_forward()` can proxy any method/path to the OpenClaw API. The existing code syncs model changes to `/agents/model` on the OpenClaw VM.
   - What's unclear: The exact API contract for start/stop/restart on the OpenClaw side. What endpoints exist? What response format?
   - Recommendation: Build the frontend and backend routes regardless. Use `POST /api/agents/action` with `{ id, action: "start"|"stop"|"restart" }`. The backend proxies via `gateway_forward()`. If the OpenClaw API doesn't exist yet, it returns a clear error. Build the UI now; the remote API can be added later.

2. **Agent Memory Display**
   - What we know: Success criteria says "Settings panel shows all agent configuration: name, model, role, status, memory." The existing `Agent` type and DB schema have no `memory` field.
   - What's unclear: Whether "memory" means the agent's system prompt, persistent context, or workspace files.
   - Recommendation: Add a read-only "Memory" section to the detail panel. If the agent has workspace files accessible via `/api/memory` (already exists for the Memory page), display them. Otherwise show "No memory configured" placeholder. A dedicated `memory` TEXT column could be added via migration if needed for system prompts.

3. **Agent ID Validation**
   - What we know: Existing seed agents use short string IDs ('koda', 'fast', 'sonnet'). The PATCH handler calls `validate_uuid()` on the ID.
   - What's unclear: Whether `validate_uuid()` accepts non-UUID strings.
   - Recommendation: Check `validate_uuid()` implementation. New user-created agents should use proper UUIDs via `random_uuid()`. If `validate_uuid()` is strict UUID-only, existing seed agents may need a separate validation path -- or the validator needs to accept both formats.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest (jsdom environment) |
| Config file | `frontend/vitest.config.ts` |
| Quick run command | `cd frontend && npx vitest run src/pages/agents` |
| Full suite command | `cd frontend && npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MH-06-a | Agent type includes all backend fields (name, sort_order, timestamps) | unit | `cd frontend && npx vitest run src/pages/agents/__tests__/types.test.ts -x` | Yes (needs update) |
| MH-06-b | useAgents hook create mutation with optimistic cache update | unit | `cd frontend && npx vitest run src/lib/hooks/__tests__/useAgents.test.ts -x` | No -- Wave 0 |
| MH-06-c | useAgents hook delete mutation with optimistic removal and rollback | unit | `cd frontend && npx vitest run src/lib/hooks/__tests__/useAgents.test.ts -x` | No -- Wave 0 |
| MH-06-d | AgentDetailPanel renders all config fields | unit | `cd frontend && npx vitest run src/pages/agents/__tests__/AgentDetailPanel.test.tsx -x` | No -- Wave 0 |
| MH-06-e | CreateAgentModal form validation and submission | unit | `cd frontend && npx vitest run src/pages/agents/__tests__/CreateAgentModal.test.tsx -x` | No -- Wave 0 |
| MH-06-f | Delete confirmation dialog renders and calls onConfirm callback | unit | `cd frontend && npx vitest run src/pages/agents/__tests__/AgentDetailPanel.test.tsx -x` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `cd frontend && npx vitest run src/pages/agents`
- **Per wave merge:** `cd frontend && npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `frontend/src/lib/hooks/__tests__/useAgents.test.ts` -- covers MH-06-b, MH-06-c (optimistic CRUD hook)
- [ ] `frontend/src/pages/agents/__tests__/AgentDetailPanel.test.tsx` -- covers MH-06-d, MH-06-f (detail panel + delete confirm)
- [ ] `frontend/src/pages/agents/__tests__/CreateAgentModal.test.tsx` -- covers MH-06-e (create form)
- [ ] Update `frontend/src/pages/agents/__tests__/types.test.ts` -- add name, sort_order, created_at, updated_at field assertions

## Sources

### Primary (HIGH confidence)
- `src-tauri/src/routes/agents.rs` -- full backend: GET, PATCH, active-coders, subagents (read in full)
- `src-tauri/src/routes/gateway.rs` -- gateway_forward() proxy, validation, sanitization (read in full)
- `src-tauri/src/routes/todos.rs` -- POST + DELETE pattern with sync + audit (read in full)
- `src-tauri/migrations/0006_relax_not_null.sql` -- agents table schema (read in full)
- `frontend/src/pages/Agents.tsx` -- current agents page with useQuery, useMutation, SSE (read in full)
- `frontend/src/pages/agents/AgentCard.tsx` -- current card with inline editing (read in full)
- `frontend/src/pages/agents/LiveProcesses.tsx` -- live process panel (read in full)
- `frontend/src/pages/agents/types.ts` -- Agent and Process interfaces (read in full)
- `frontend/src/pages/notes/Notes.tsx` -- split-panel layout with resize (read in full)
- `frontend/src/pages/notes/FileTree.tsx` -- left-panel list component (read partially)
- `frontend/src/pages/knowledge/SlidePanel.tsx` -- right-side slide panel pattern (read in full)
- `frontend/src/pages/knowledge/AddEntryModal.tsx` -- create modal with form (read in full)
- `frontend/src/pages/knowledge/EntryCard.tsx` -- card component with click handler (read in full)
- `frontend/src/pages/KnowledgeBase.tsx` -- CRUD page pattern (read in full)
- `frontend/src/lib/hooks/useTodos.ts` -- optimistic mutation pattern (read in full)
- `frontend/src/components/dashboard/DashboardTabs.tsx` -- portal confirmation dialog (read partially)
- `frontend/src/components/ui/Button.tsx` -- Button with danger variant (read in full)
- `frontend/src/lib/api.ts` -- API wrapper (read in full)
- `frontend/src/lib/query-keys.ts` -- React Query key registry (read in full)
- `frontend/src/lib/constants.ts` -- AGENT_STATUS constants (read in full)
- `frontend/src/lib/modules.ts` -- module registration (read in full)
- `frontend/src/lib/hooks/useRealtimeSSE.ts` -- SSE real-time subscription (read in full)
- `frontend/src/pages/chat/types.ts` -- ModelOption type used in AgentCard (read in full)
- `frontend/src/components/PageHeader.tsx` -- editable page header (read in full)

### Secondary (MEDIUM confidence)
- `.planning/ROADMAP.md` -- Phase 10 description and success criteria
- `.planning/REQUIREMENTS.md` -- MH-06 requirement text

### Tertiary (LOW confidence)
- OpenClaw agent lifecycle API endpoints -- exact contract unknown; designed speculatively based on existing model sync pattern (`/agents/model`)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- zero new dependencies, all patterns verified in codebase
- Architecture: HIGH -- Notes split panel and useTodos optimistic patterns are proven and directly applicable
- Backend CRUD: HIGH -- GET/PATCH exist, POST/DELETE follow identical patterns from todos.rs
- Pitfalls: HIGH -- all pitfalls sourced from CLAUDE.md warnings and actual code inspection
- Lifecycle actions: MEDIUM -- OpenClaw API contract is speculative; backend route is straightforward regardless

**Research date:** 2026-03-22
**Valid until:** 2026-04-22 (stable -- no external dependencies to drift)
