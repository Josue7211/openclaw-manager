# Phase 10: OpenClaw Agent Management - Research

**Researched:** 2026-03-22
**Domain:** React + TanStack Query CRUD, split-pane UI patterns, Rust/Axum REST endpoints, optimistic updates
**Confidence:** HIGH

## Summary

Phase 10 transforms the existing Agents page from a read-only grid with inline editing into a full CRUD management interface with a Notes-style split-pane layout: agent list on the left, detail/settings panel on the right. The codebase already provides 80% of the building blocks: `AgentCard.tsx` with card rendering, `agents.rs` with GET/PATCH endpoints, `gateway_forward()` for OpenClaw API proxying, optimistic mutation patterns in `useTodos.ts`, split-pane resize in `Notes.tsx`, confirmation dialog patterns in `DashboardTabs.tsx`, and the `Button` UI component with danger variant.

The backend needs two new endpoints: POST `/api/agents` for creation and DELETE `/api/agents` for soft-delete (setting `deleted_at`). Both endpoints write to local SQLite and log mutations for Supabase sync. The frontend needs a restructured page layout (list panel + detail panel), a dedicated `useAgents` hook with optimistic mutations (matching the `useTodos` pattern), a confirmation dialog for deletion, and lifecycle controls (start/stop/restart) that proxy through `gateway_forward()` to the OpenClaw API.

The Agent data model is already well-defined across SQLite (migration 0006), Supabase (initial migration + RLS), the Rust backend (`agents.rs`), and the frontend type (`agents/types.ts`). The `name` field is the system identifier (e.g., 'koda'), while `display_name` is user-editable. The `status` field has three known values: 'active', 'idle', 'awaiting_deploy'. Agent lifecycle controls (start/stop/restart) will need new OpenClaw gateway endpoints.

**Primary recommendation:** Build the new agents page as a full-bleed split-pane layout (matching Notes.tsx pattern), extract a `useAgents` hook with full optimistic CRUD (matching `useTodos.ts` pattern), add POST/DELETE routes to `agents.rs`, and add agent lifecycle routes that proxy through `gateway_forward()`.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| MH-06 | OpenClaw Agent CRUD -- full create/update/delete plus lifecycle controls, proxied through gateway, with optimistic UI | All research findings: existing backend (agents.rs GET/PATCH), gateway_forward() proxy, useTodos optimistic pattern, Notes split-pane layout, DashboardTabs confirmation dialog, Button component |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 18 | Component framework | Already used everywhere |
| @tanstack/react-query | 5 | Server state, optimistic mutations | Already used for agents query |
| @phosphor-icons/react | 2 | Icons (Robot, Gear, Plus, Trash, Play, Stop, ArrowClockwise) | Already used across all pages |
| axum | 0.7 | Rust HTTP framework for new POST/DELETE routes | Already used by agents.rs |
| sqlx | 0.8 | SQLite queries for agent CRUD | Already used by agents.rs |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| react-dom (createPortal) | 18 | Portal for confirmation dialog | Delete confirmation dialog |
| serde / serde_json | 1 | Request body deserialization for POST/DELETE | New endpoint handlers |
| chrono | 0.4 | Timestamps for created_at/updated_at | Agent creation |
| uuid | 1 | Generate agent IDs | POST /api/agents |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Split-pane (Notes pattern) | Modal for settings | Notes pattern is specified in requirements and provides better UX for editing multiple fields |
| Inline confirmation dialog | window.confirm() | Inline dialog with portal matches existing DashboardTabs pattern, is accessible, and branded |
| Custom useAgents hook | Inline mutations in page | Hook extraction matches useTodos pattern, enables reuse in dashboard widget |

**Installation:** No new packages needed. All dependencies already present.

## Architecture Patterns

### Recommended Project Structure
```
frontend/src/
  pages/
    agents/
      AgentCard.tsx           # MODIFIED: add settings gear button, lifecycle action buttons
      AgentDetailPanel.tsx    # NEW: right-side settings panel (mirrors NoteEditor pattern)
      AgentList.tsx           # NEW: left-side scrollable list of agent cards
      LiveProcesses.tsx       # EXISTING: kept as-is, shown below agent list
      types.ts                # MODIFIED: add 'name' field, 'memory' optional field
      __tests__/
        types.test.ts         # EXISTING: update for new fields
        useAgents.test.ts     # NEW: hook unit tests
  hooks/
    useAgents.ts              # NEW: extracted CRUD hook with optimistic mutations
  pages/
    Agents.tsx                # MODIFIED: full-bleed split-pane layout

src-tauri/src/routes/
  agents.rs                   # MODIFIED: add POST and DELETE handlers
  gateway.rs                  # EXISTING: used for lifecycle proxy calls
```

### Pattern 1: Split-Pane Layout (from Notes.tsx)
**What:** Full-bleed page with resizable left panel (agent list) and right panel (detail/settings). Position absolute inset 0, negative margin to fill main area.
**When to use:** When showing a master-detail view with a list on one side and content on the other.
**Example:**
```typescript
// Source: frontend/src/pages/notes/Notes.tsx lines 138-175
<div style={{
  position: 'absolute', inset: 0,
  margin: '-20px -28px',  // cancel main padding
  display: 'flex', overflow: 'hidden',
}}>
  {/* Left panel */}
  <div style={{ width: listWidth, minWidth: listWidth, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
    <AgentList ... />
  </div>

  {/* Resize handle */}
  <div
    onMouseDown={handleResize}
    role="separator"
    aria-orientation="vertical"
    aria-label="Resize agent list"
    style={{ width: 4, cursor: 'col-resize', background: 'transparent', flexShrink: 0, marginLeft: -2, marginRight: -2, zIndex: 10, position: 'relative' }}
  />

  {/* Right panel */}
  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
    {selectedAgent ? <AgentDetailPanel agent={selectedAgent} ... /> : <EmptyState />}
  </div>
</div>
```

### Pattern 2: Optimistic Mutations (from useTodos.ts)
**What:** Cancel in-flight queries, snapshot previous data, optimistically update cache, rollback on error, invalidate on settle.
**When to use:** Every mutation (create, update, delete) for instant UI feedback.
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
  onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.agents }),
})
```

### Pattern 3: Confirmation Dialog (from DashboardTabs.tsx)
**What:** Portal-based dialog with backdrop, role="dialog", aria-modal="true", Cancel + Delete buttons using Button component.
**When to use:** Before destructive operations (delete agent).
**Example:**
```typescript
// Source: frontend/src/components/dashboard/DashboardTabs.tsx lines 275-318
{confirmDeleteId && createPortal(
  <div role="dialog" aria-modal="true" style={{
    position: 'fixed', inset: 0, zIndex: 'var(--z-modal)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--overlay-heavy)',
  }}>
    <div style={{ background: 'var(--bg-panel)', borderRadius: '12px', padding: '24px', width: '380px', border: '1px solid var(--border)' }}>
      <h3>Delete Agent</h3>
      <p>Are you sure? This cannot be undone.</p>
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
        <Button variant="secondary" onClick={handleCancel}>Cancel</Button>
        <Button variant="danger" onClick={handleConfirmDelete}>Delete</Button>
      </div>
    </div>
  </div>,
  document.body
)}
```

### Pattern 4: Gateway Proxy for Lifecycle Commands
**What:** Use `gateway_forward()` to proxy start/stop/restart to OpenClaw API.
**When to use:** Any agent lifecycle operation that hits the remote OpenClaw VM.
**Example:**
```rust
// Source: src-tauri/src/routes/gateway.rs lines 111-164
// In agents.rs, new handler:
async fn agent_action(
    State(state): State<AppState>,
    RequireAuth(session): RequireAuth,
    Json(body): Json<AgentActionBody>,
) -> Result<Json<Value>, AppError> {
    validate_uuid(&body.id)?;
    let path = format!("/agents/{}/action", body.id);
    let result = gateway_forward(
        &state, Method::POST, &path,
        Some(json!({"action": body.action})),
    ).await?;
    Ok(Json(result))
}
```

### Pattern 5: Card Styling (from AgentCard.tsx)
**What:** Glassmorphic cards with backdrop blur, accent borders for active state, status dots with pulse animation.
**When to use:** Each agent in the list.
**Key CSS variables:**
```css
background: var(--bg-card);
backdrop-filter: blur(24px);
border: 1px solid var(--accent)44;  /* or var(--secondary-a30) when active */
border-radius: 16px;
/* Status dot pulse: animation: pulse-dot 1.5s ease-in-out infinite */
```

### Anti-Patterns to Avoid
- **Inline state in card for settings editing:** The current AgentCard has local editing state. Move editing to the detail panel instead -- cards become read-only display + action buttons.
- **Direct `window.confirm()`:** Use the portal-based confirmation dialog pattern for consistent branding and accessibility.
- **Polling for lifecycle status:** Use the existing SSE `useTableRealtime('agents', ...)` hook to react to status changes pushed from the backend.
- **Custom DOM events for cross-component communication:** Use React Query cache invalidation and the `useTableRealtime` SSE subscription instead.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Optimistic updates | Manual cache manipulation | React Query onMutate/onError/onSettled pattern | Rollback, race conditions, cache consistency are complex |
| Focus trapping in dialog | Manual tabIndex management | `useFocusTrap` hook from `lib/hooks/` | Handles edge cases (circular focus, Escape key) |
| Escape key handling | Manual keydown listener | `useEscapeKey` hook from `lib/hooks/` | Already handles cleanup and conflicts |
| Real-time updates | Manual polling loop | `useTableRealtime('agents', ...)` SSE hook | Already wired, auto-reconnects, shared EventSource singleton |
| API calls | Raw fetch | `api.get/post/patch/del` wrapper | Handles API key, timeout, error reporting, typed responses |
| UUID generation | Math.random() | `crypto.randomUUID()` in frontend, `uuid` crate in Rust | Proper UUID v4 generation |
| Resize handle | Custom drag implementation | Copy Notes.tsx handleResize pattern | Handles mouse capture, cursor, user-select correctly |

**Key insight:** Every UI pattern needed here already exists in the codebase. The split-pane is from Notes, optimistic mutations from Todos, confirmation dialogs from DashboardTabs, card styling from AgentCard, real-time from SSE. The phase is primarily composition and wiring, not invention.

## Common Pitfalls

### Pitfall 1: Soft Delete vs Hard Delete
**What goes wrong:** Hard-deleting agents from SQLite causes sync conflicts with Supabase. The Supabase table has `deleted_at` column.
**Why it happens:** The sync engine (`sync.rs`) expects rows to exist for conflict resolution.
**How to avoid:** Always soft-delete by setting `deleted_at = NOW()`. The GET query already filters `WHERE deleted_at IS NULL`.
**Warning signs:** Agents reappear after deletion on next sync.

### Pitfall 2: Agent ID Format
**What goes wrong:** Creating agents with random UUIDs when existing agents use human-readable IDs (e.g., 'koda', 'fast', 'sonnet').
**Why it happens:** The seed data uses short string IDs, but `validate_uuid()` is called on PATCH.
**How to avoid:** For new user-created agents, generate proper UUIDs. The existing `validate_uuid()` in PATCH should be reviewed -- it may reject non-UUID IDs. The current seed agents have non-UUID IDs. Consider accepting both formats or using a looser validation for agent IDs.
**Warning signs:** PATCH fails for seed agents if validate_uuid is strict.

### Pitfall 3: Missing `name` Field in Frontend Type
**What goes wrong:** The Agent type in `types.ts` is missing the `name` field that the backend returns.
**Why it happens:** The backend returns `name` (system name like 'koda') but the frontend type only has `display_name`.
**How to avoid:** Add `name: string` to the Agent interface in `types.ts`. The name field is used as the system identifier and should not be user-editable for existing agents.
**Warning signs:** TypeScript won't error (the field is just ignored), but you lose the ability to display the system name.

### Pitfall 4: Mutation Log for Sync
**What goes wrong:** New POST/DELETE endpoints don't call `log_mutation()`, so changes never sync to Supabase.
**Why it happens:** Easy to forget -- the existing PATCH handler calls it but POST/DELETE are new.
**How to avoid:** Every mutation endpoint MUST call `crate::sync::log_mutation(&state.db, "agents", &id, "INSERT"|"DELETE", Some(&payload))`.
**Warning signs:** Agents created locally don't appear in Supabase, or deleted agents reappear.

### Pitfall 5: Lifecycle Actions Without OpenClaw
**What goes wrong:** Start/stop/restart buttons fail when OpenClaw is not configured.
**Why it happens:** `gateway_forward()` returns "OpenClaw API not configured" error.
**How to avoid:** Check `openclaw_api_url()` availability in the frontend. If OpenClaw is not configured, disable lifecycle buttons with a tooltip explaining why. Use the existing `/api/openclaw/health` endpoint to check connectivity.
**Warning signs:** Error toasts on every lifecycle action click.

### Pitfall 6: Portal Dialog and container-type
**What goes wrong:** Confirmation dialog positioned incorrectly or clipped.
**Why it happens:** The `<main>` element has `container-type: inline-size` which traps `position: fixed` elements.
**How to avoid:** Use `createPortal(dialog, document.body)` -- this is already the pattern used in DashboardTabs.tsx for exactly this reason.
**Warning signs:** Dialog appears inside the main content area instead of centered on screen.

## Code Examples

### Existing Agent Backend Response Shape
```json
// Source: src-tauri/src/routes/agents.rs GET /agents
{
  "agents": [
    {
      "id": "koda",
      "name": "Koda",
      "display_name": "Gunther",
      "emoji": "\ud83d\udee0\ufe0f",
      "role": "primary",
      "status": "idle",
      "current_task": "",
      "model": "claude-opus-4-6",
      "color": null,
      "sort_order": 1,
      "created_at": "2026-03-15T00:00:00Z",
      "updated_at": "2026-03-22T10:00:00Z"
    }
  ]
}
```

### Existing Agent PATCH Body Shape
```json
// Source: src-tauri/src/routes/agents.rs UpdateAgentBody
{
  "id": "koda",
  "display_name": "Gunther",
  "emoji": "\ud83d\udee0\ufe0f",
  "role": "primary",
  "model": "claude-opus-4-6",
  "status": "active",
  "current_task": "Building new feature",
  "color": "#5865f2",
  "sort_order": 1
}
```

### New POST /api/agents Body Shape (proposed)
```json
{
  "display_name": "New Agent",
  "emoji": "\ud83e\udd16",
  "role": "assistant",
  "model": "claude-sonnet-4-6"
}
```

### New DELETE /api/agents Body Shape (proposed)
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000"
}
```

### Agent Lifecycle Action Body (proposed)
```json
// POST /api/agents/action
{
  "id": "koda",
  "action": "start" | "stop" | "restart"
}
```

### Existing Seed Agents
```sql
-- Source: supabase/migrations/20260301000000_initial.sql
INSERT INTO agents (id, name, display_name, emoji, role, model, sort_order) VALUES
  ('koda',   'Koda',    'Gunther', ..., 'primary',  'claude-opus-4-6',   1),
  ('fast',   'Fast',    'Roman',   ..., 'fast',     'claude-haiku-4-5',  2),
  ('sonnet', 'Sonnet',  'Sonnet',  ..., 'balanced', 'claude-sonnet-4-6', 3),
```

### Frontend Type Update Needed
```typescript
// Source: frontend/src/pages/agents/types.ts -- needs these additions
export interface Agent {
  id: string
  name: string              // ADD: system name (e.g., 'koda')
  display_name: string
  emoji: string
  role: string
  status: string
  current_task: string | null
  color: string | null
  model: string | null
  sort_order: number        // ADD: for ordering
  created_at: string        // ADD: for display
  updated_at: string        // ADD: for display
}
```

### api.ts Method Signatures
```typescript
// Source: frontend/src/lib/api.ts
export const api = {
  get: <T = unknown>(path: string) => request<T>('GET', path),
  post: <T = unknown>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T = unknown>(path: string, body?: unknown) => request<T>('PUT', path, body),
  patch: <T = unknown>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  del: <T = unknown>(path: string, body?: unknown) => request<T>('DELETE', path, body),
}
```

### Query Key Pattern
```typescript
// Source: frontend/src/lib/query-keys.ts
agents: ['agents'] as const,
```

### SSE Realtime Subscription
```typescript
// Source: frontend/src/pages/Agents.tsx line 64
useTableRealtime('agents', { queryKey: queryKeys.agents })
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Inline editing in AgentCard | Right-side detail panel | Phase 10 | Cards become read-only, detail panel handles all editing |
| No create/delete | Full CRUD via POST/DELETE endpoints | Phase 10 | Users can manage their own agent fleet |
| Direct reqwest calls to OpenClaw | gateway_forward() proxy | Phase 9 | Centralized credential handling, error sanitization |
| Manual polling for agent status | SSE useTableRealtime | Already done | Real-time status updates without polling |

**Deprecated/outdated:**
- The inline editing mode in `AgentCard.tsx` (the `editing` state + save/cancel buttons) should be removed in favor of the detail panel. Cards should only show read-only data + action buttons.
- The model selection dropdown in `AgentCard.tsx` should move to the detail panel.

## Open Questions

1. **OpenClaw Agent Lifecycle API**
   - What we know: The OpenClaw VM runs agents. The gateway proxy can forward requests. The existing code syncs model changes to `/agents/model`.
   - What's unclear: The exact OpenClaw API endpoints for start/stop/restart. The response format. Whether agents are processes, containers, or something else.
   - Recommendation: Build the lifecycle buttons and wire them to `POST /api/agents/action` which calls `gateway_forward(&state, POST, "/agents/{id}/action", body)`. If the OpenClaw API doesn't exist yet, the buttons will show a clear error ("OpenClaw: endpoint not found") via the gateway error handling. Build the UI now; the API can be added later.

2. **Agent Memory Field**
   - What we know: The success criteria mentions "memory" in the settings panel. The database schema doesn't have a memory column.
   - What's unclear: Whether "memory" means persistent context/instructions, conversation history, or something else.
   - Recommendation: Add a `memory` or `system_prompt` TEXT column to the agents table in a migration. Display it as a textarea in the detail panel. This is a lightweight addition that doesn't require OpenClaw API changes -- it's stored locally and synced to Supabase.

3. **Agent ID Validation Strictness**
   - What we know: Existing seed agents use short string IDs ('koda', 'fast', 'sonnet'). The PATCH handler calls `validate_uuid()`.
   - What's unclear: Whether `validate_uuid()` accepts non-UUID strings or is strict UUID-only.
   - Recommendation: Check `validate_uuid()` implementation. If strict, new agents should use UUIDs. If it needs to support both formats, consider a `validate_agent_id()` helper that accepts UUIDs and alphanumeric strings (no special chars).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.x (jsdom environment) |
| Config file | `frontend/vitest.config.ts` |
| Quick run command | `cd frontend && npx vitest run src/pages/agents/__tests__/ --reporter=verbose` |
| Full suite command | `cd frontend && npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MH-06-a | Agent list renders with correct data | unit | `cd frontend && npx vitest run src/pages/agents/__tests__/AgentList.test.tsx -x` | No -- Wave 0 |
| MH-06-b | Agent detail panel shows all fields | unit | `cd frontend && npx vitest run src/pages/agents/__tests__/AgentDetailPanel.test.tsx -x` | No -- Wave 0 |
| MH-06-c | Optimistic create adds agent to list | unit | `cd frontend && npx vitest run src/hooks/__tests__/useAgents.test.ts -x` | No -- Wave 0 |
| MH-06-d | Optimistic delete removes agent from list | unit | `cd frontend && npx vitest run src/hooks/__tests__/useAgents.test.ts -x` | No -- Wave 0 |
| MH-06-e | Delete confirmation dialog renders correctly | unit | `cd frontend && npx vitest run src/pages/agents/__tests__/ConfirmDialog.test.tsx -x` | No -- Wave 0 |
| MH-06-f | Agent type includes all required fields | unit | `cd frontend && npx vitest run src/pages/agents/__tests__/types.test.ts -x` | Yes (needs update) |
| MH-06-g | Lifecycle actions call correct API endpoints | unit | `cd frontend && npx vitest run src/hooks/__tests__/useAgents.test.ts -x` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `cd frontend && npx vitest run src/pages/agents/__tests__/ --reporter=verbose`
- **Per wave merge:** `cd frontend && npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `frontend/src/hooks/__tests__/useAgents.test.ts` -- covers MH-06-c, MH-06-d, MH-06-g (optimistic CRUD hook)
- [ ] `frontend/src/pages/agents/__tests__/AgentList.test.tsx` -- covers MH-06-a (list rendering)
- [ ] `frontend/src/pages/agents/__tests__/AgentDetailPanel.test.tsx` -- covers MH-06-b (detail panel)
- [ ] `frontend/src/pages/agents/__tests__/ConfirmDialog.test.tsx` -- covers MH-06-e (delete confirmation)
- [ ] Update `frontend/src/pages/agents/__tests__/types.test.ts` -- add name, sort_order, created_at, updated_at fields

## Sources

### Primary (HIGH confidence)
- `src-tauri/src/routes/agents.rs` -- full backend implementation (GET, PATCH, active-coders, subagents)
- `src-tauri/src/routes/gateway.rs` -- gateway_forward() proxy, validate_gateway_path(), sanitize_error_body()
- `frontend/src/pages/Agents.tsx` -- current agents page with useQuery, useMutation, SSE subscription
- `frontend/src/pages/agents/AgentCard.tsx` -- current card component with inline editing
- `frontend/src/pages/agents/types.ts` -- Agent and Process interfaces
- `frontend/src/pages/notes/Notes.tsx` -- split-pane layout pattern with resize handle
- `frontend/src/lib/hooks/useTodos.ts` -- optimistic mutation pattern (onMutate, onError, onSettled)
- `frontend/src/components/dashboard/DashboardTabs.tsx` -- confirmation dialog with portal pattern
- `frontend/src/components/ui/Button.tsx` -- Button component with danger variant
- `frontend/src/lib/api.ts` -- API wrapper (get, post, patch, del)
- `frontend/src/lib/query-keys.ts` -- centralized query keys (agents: ['agents'])
- `frontend/src/lib/constants.ts` -- AGENT_STATUS constants
- `src-tauri/migrations/0006_relax_not_null.sql` -- SQLite agents table schema
- `supabase/migrations/20260301000000_initial.sql` -- Supabase agents table + seed data

### Secondary (MEDIUM confidence)
- `.planning/ROADMAP.md` -- Phase 10 requirements, success criteria
- `.planning/REQUIREMENTS.md` -- MH-06 specification
- `.planning/phases/09-openclaw-gateway-proxy/09-RESEARCH.md` -- gateway proxy design context

### Tertiary (LOW confidence)
- OpenClaw agent lifecycle API endpoints -- inferred from existing model sync pattern (`/agents/model`), exact endpoint structure for start/stop/restart is unknown

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already in use, no new dependencies
- Architecture: HIGH -- all UI patterns (split-pane, cards, dialogs) already exist in codebase
- Backend CRUD: HIGH -- GET/PATCH exist, POST/DELETE follow identical patterns
- Pitfalls: HIGH -- identified from direct code analysis (sync, validation, portal)
- OpenClaw lifecycle API: LOW -- exact endpoints unknown, but gateway_forward() handles the proxy layer

**Research date:** 2026-03-22
**Valid until:** 2026-04-22 (stable -- all patterns are internal to this codebase)
