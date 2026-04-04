# Phase 96: Session Rename, Delete, Compact - Research

**Researched:** 2026-03-24
**Domain:** React Query mutations + Axum gateway proxy routes + inline editing + context menus
**Confidence:** HIGH

## Summary

Phase 96 adds three session management operations — rename, delete, and compact — all proxied through the existing `gateway_forward()` chokepoint in `src-tauri/src/routes/gateway.rs`. The frontend uses the established optimistic-update `useMutation` pattern (identical to `useAgents.ts` and `useTodos.ts`). The backend adds three new routes to the already-wired `gateway.rs` router.

The codebase has all required primitives in place: `useToast` for error/success feedback, `Button` component with `variant="danger"` for destructive actions, `useFocusTrap`/`useEscapeKey` for modal management, `MessageMenu.tsx` as the context menu reference pattern, and `AgentDetailPanel.tsx` as the delete-confirmation dialog reference. No new libraries are needed.

The key insight for the Compact operation: `gateway_forward()` rejects `?` in paths, so if OpenClaw's `/sessions/{key}/compact` endpoint returns a response with token savings, the data comes back as a plain JSON `Value` — just parse what the gateway returns and surface it in the UI. The same http-bypass pattern used in Plan 92 (state.http direct call) is NOT needed here because `/sessions/{key}/compact` is a POST without query params.

**Primary recommendation:** Build this in two plans — Plan 01 adds the 3 Axum routes + validation + unit tests for each; Plan 02 adds the React frontend (context menu on SessionCard, inline rename, delete dialog, compact button). Both plans are independent enough to parallelize if desired.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Interaction Pattern**
- Right-click context menu on SessionCard (or three-dot menu button) with options: Rename, Compact, Delete
- Double-click on session label triggers inline rename (editable text field replaces label)
- Delete shows a confirmation dialog before proceeding (prevents accidental deletion)
- Compact shows a brief confirmation + visual feedback (token count before/after if available)

**Backend Routes**
- `PATCH /api/gateway/sessions/:key` — calls `gateway_forward(PATCH, /sessions/{key})` with `{ label }` body → maps to `sessions.patch`
- `DELETE /api/gateway/sessions/:key` — calls `gateway_forward(DELETE, /sessions/{key})` → maps to `sessions.delete`
- `POST /api/gateway/sessions/:key/compact` — calls `gateway_forward(POST, /sessions/{key}/compact)` → maps to `sessions.compact`

**Optimistic Updates**
- Rename: update SessionCard label immediately via React Query cache, rollback on error
- Delete: remove from list immediately, rollback on error
- Compact: show "compacting..." state, update messageCount/token info on success
- All mutations invalidate `queryKeys.gatewaySessions` on settlement

**UI Feedback**
- Rename: inline text input with Enter to confirm, Escape to cancel
- Delete: modal confirmation dialog with session label displayed, styled like existing delete dialogs
- Compact: button with loading spinner/state, success toast or inline feedback
- Error states: toast or inline error message on failure

### Claude's Discretion
- Exact context menu positioning and styling
- Animation for session removal from list (slide out or fade)
- Whether to show token savings after compact
- Keyboard shortcuts for rename (F2) and delete (Backspace/Delete with focus)

### Deferred Ideas (OUT OF SCOPE)
- Bulk operations (select multiple sessions to delete)
- Session archival (hide without deleting)
- Undo for delete (soft delete with timer)
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SESS-03 | User can rename a session by editing its label (sessions.patch) | PATCH /api/gateway/sessions/:key route + inline edit in SessionCard + optimistic label update in cache |
| SESS-04 | User can delete a session (sessions.delete with confirmation) | DELETE /api/gateway/sessions/:key route + confirmation dialog (AgentDetailPanel pattern) + optimistic remove from list |
| SESS-05 | User can compact a session to reduce token usage (sessions.compact) | POST /api/gateway/sessions/:key/compact route + compact button with loading state + toast feedback |
</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@tanstack/react-query` | existing | Mutations with optimistic updates, cache management | Already used everywhere: useAgents, useTodos, useCrons |
| `axum` | existing | Rust HTTP routes for PATCH/DELETE/POST | Already used in gateway.rs, crons.rs, agents.rs |
| `reqwest` | existing | HTTP forwarding to OpenClaw via `gateway_forward()` | The single chokepoint already in place |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@phosphor-icons/react` | existing | Context menu icons (PencilSimple, Trash, ArrowsCounterClockwise, DotsThree) | All icons already in phosphor set used across app |
| `useToast` from `@/components/ui/Toast` | existing | Success/error feedback after mutations | Already used in WizardConnectionTest, declared in LayoutShell |
| `useFocusTrap` / `useEscapeKey` | existing | Delete confirmation modal focus management | Already used in AgentDetailPanel |
| `createPortal` from `react-dom` | existing | Render modals above layout stacking context | Already used in AgentDetailPanel |
| `Button` from `@/components/ui/Button` | existing | Cancel/Delete/Compact buttons with consistent styling | `variant="danger"` for Delete, `variant="secondary"` for Cancel |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Right-click context menu | Three-dot `DotsThree` icon button on hover | Three-dot is always visible; right-click matches desktop convention. CONTEXT.md says "or three-dot menu" — implement three-dot as the visible trigger, right-click as bonus |
| Inline rename on double-click | Modal rename form | Inline edit is lower friction. CONTEXT.md locks this to inline. |
| Toast for compact feedback | Inline status in SessionCard | Toast is consistent with error pattern used app-wide. |

**Installation:** No new packages needed.

---

## Architecture Patterns

### Recommended Project Structure

New files this phase creates:

```
frontend/src/
├── hooks/sessions/
│   ├── useSessionMutations.ts        # All 3 mutations (rename, delete, compact)
│   └── __tests__/
│       └── useSessionMutations.test.ts
├── pages/sessions/
│   ├── SessionCard.tsx               # Modified: add context menu + inline rename
│   ├── SessionList.tsx               # Modified: pass onDelete/onRename/onCompact down
│   └── SessionsPage.tsx              # Modified: handle selected session cleared on delete

src-tauri/src/routes/
└── gateway.rs                        # Modified: add 3 new handlers + route registrations
```

### Pattern 1: Optimistic Mutation (established project pattern)

**What:** Cancel in-flight queries, snapshot current cache, apply optimistic update, rollback on error, invalidate on settle.
**When to use:** All three mutations (rename, delete, compact).

```typescript
// Source: frontend/src/hooks/useAgents.ts (verified in codebase)
const renameMutation = useMutation({
  mutationFn: async ({ key, label }: { key: string; label: string }) =>
    api.patch(`/api/gateway/sessions/${key}`, { label }),
  onMutate: async ({ key, label }) => {
    await queryClient.cancelQueries({ queryKey: queryKeys.gatewaySessions })
    const prev = queryClient.getQueryData<GatewaySessionsResponse>(queryKeys.gatewaySessions)
    queryClient.setQueryData<GatewaySessionsResponse>(queryKeys.gatewaySessions, (old) => ({
      ...old,
      sessions: (old?.sessions ?? []).map((s) =>
        s.key === key ? { ...s, label } : s
      ),
    }))
    return { prev }
  },
  onError: (_err, _vars, ctx) => {
    if (ctx?.prev) queryClient.setQueryData(queryKeys.gatewaySessions, ctx.prev)
  },
  onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.gatewaySessions }),
})
```

**Delete optimistic — remove from list immediately:**
```typescript
// Source: frontend/src/hooks/useAgents.ts (verified) + useTodos.ts (verified)
queryClient.setQueryData<GatewaySessionsResponse>(queryKeys.gatewaySessions, (old) => ({
  ...old,
  sessions: (old?.sessions ?? []).filter((s) => s.key !== key),
}))
```

### Pattern 2: Axum Gateway Route (PATCH/DELETE/POST with path param)

**What:** New route handlers in `gateway.rs` that validate input, encode the key, then call `gateway_forward()`.
**When to use:** All three backend routes.

```rust
// Source: src-tauri/src/routes/crons.rs (verified — gateway_forward pattern with body)
// Source: src-tauri/src/routes/bjorn.rs (verified — Path<String> extraction)
async fn patch_session(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Path(key): Path<String>,
    Json(body): Json<PatchSessionBody>,
) -> Result<Json<Value>, AppError> {
    if key.is_empty() || key.len() > 100 {
        return Err(AppError::BadRequest("invalid session key".into()));
    }
    let payload = gateway_forward(
        &state,
        Method::PATCH,
        &format!("/sessions/{key}"),
        Some(json!({ "label": body.label })),
    ).await.map_err(|e| {
        tracing::error!("[sessions] rename failed: {e:?}");
        match e {
            AppError::BadRequest(_) => e,
            _ => AppError::BadRequest("Gateway error: failed to rename session".into()),
        }
    })?;
    Ok(Json(json!({ "ok": true, "session": payload })))
}
```

**Route registration (add to router() in gateway.rs):**
```rust
// Source: src-tauri/src/routes/gateway.rs router() function (verified)
.route("/gateway/sessions/:key", patch(patch_session).delete(delete_session))
.route("/gateway/sessions/:key/compact", post(compact_session))
```

**Important:** `gateway_forward` uses `validate_gateway_path()` which rejects `?`, `#`, `..`, and null bytes, but accepts `/sessions/{key}/compact` just fine as long as the key doesn't contain those characters. The key validation (length 1-100) prevents injection. `gateway_forward` does NOT need the `state.http` bypass used in Plan 92 (history needed `?limit=` query param; compact/patch/delete do not).

### Pattern 3: Inline Rename Input

**What:** Replace the label `<div>` with an `<input>` when `isEditing` is true. Confirm on Enter/blur, cancel on Escape.
**When to use:** Double-click on SessionCard label, or "Rename" from context menu.

```typescript
// Source: frontend/src/pages/agents/AgentDetailPanel.tsx (debounced input pattern — verified)
// Adapted for inline: no debounce needed, commit on Enter/blur
const [isEditing, setIsEditing] = useState(false)
const [draftLabel, setDraftLabel] = useState(session.label || '')

// Commit on Enter or blur
const commitRename = () => {
  if (draftLabel.trim() && draftLabel.trim() !== session.label) {
    onRename(session.key, draftLabel.trim())
  }
  setIsEditing(false)
}

// Cancel on Escape
const handleKeyDown = (e: React.KeyboardEvent) => {
  if (e.key === 'Enter') { e.preventDefault(); commitRename() }
  if (e.key === 'Escape') { setDraftLabel(session.label || ''); setIsEditing(false) }
}
```

### Pattern 4: Context Menu (MessageMenu pattern)

**What:** Fixed-position popover triggered by right-click or button click. Close on outside click, Escape, or item selection.
**When to use:** The three-dot button and right-click on SessionCard.

```typescript
// Source: frontend/src/components/messages/MessageMenu.tsx (verified — onContextMenu pattern)
// Key pattern: position fixed, useEffect for outside-click and Escape, backdrop overlay
const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null)

const handleContextMenu = (e: React.MouseEvent) => {
  e.preventDefault()
  setMenuPos({ x: e.clientX, y: e.clientY })
}
```

Menu items with existing `MButton` pattern from `MessageMenu.tsx`:
- PencilSimple icon — "Rename" → triggers inline edit
- ArrowsCounterClockwise icon — "Compact" → triggers compact confirmation
- Trash icon — "Delete" → opens delete confirmation dialog (styled red)

### Pattern 5: Delete Confirmation Dialog (AgentDetailPanel pattern)

**What:** Modal portal with focus trap, role="dialog", aria-modal="true", Cancel + Delete buttons.
**When to use:** Delete action from context menu.

```typescript
// Source: frontend/src/pages/agents/AgentDetailPanel.tsx lines 284-318 (verified)
// Key elements: createPortal(, document.body), useFocusTrap, useEscapeKey, Button variant="danger"
{confirmDeleteKey && createPortal(
  <div
    style={{ position: 'fixed', inset: 0, zIndex: 9999,
             display: 'flex', alignItems: 'center', justifyContent: 'center',
             background: 'var(--overlay-heavy)' }}
    onClick={() => setConfirmDeleteKey(null)}
  >
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Confirm delete session"
      onClick={(e) => e.stopPropagation()}
      style={{ background: 'var(--bg-panel)', borderRadius: '12px',
               padding: '24px', width: '380px',
               border: '1px solid var(--border)',
               boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}
    >
      <h3>Delete Session</h3>
      <p>Are you sure you want to delete <strong>{label}</strong>?
         This cannot be undone.</p>
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
        <Button variant="secondary" onClick={cancelDelete}>Cancel</Button>
        <Button variant="danger" onClick={confirmDelete}>Delete</Button>
      </div>
    </div>
  </div>,
  document.body
)}
```

### Pattern 6: Toast for Mutation Feedback

**What:** `useToast()` hook from `@/components/ui/Toast`, call `toast.show()` in mutation `onError` (and optionally `onSuccess` for compact).
**When to use:** Compact success (show token savings if available), all three mutation errors.

```typescript
// Source: frontend/src/components/ui/Toast.tsx (verified — show() API)
const toast = useToast()

// In mutation onError:
onError: (err) => {
  const msg = err instanceof ApiError ? err.serviceLabel : 'Failed to rename session'
  toast.show({ type: 'error', message: msg })
}

// In compact onSuccess (if token data available):
onSuccess: (data) => {
  const savings = data?.tokensSaved
  toast.show({
    type: 'success',
    message: savings ? `Compacted — saved ${savings} tokens` : 'Session compacted',
  })
}
```

### Anti-Patterns to Avoid

- **Using `gateway_forward` for query-param paths:** The history route (Phase 92) bypasses `gateway_forward` and uses `state.http` directly because `?limit=X` is rejected by `validate_gateway_path`. This phase's endpoints (`PATCH /sessions/:key`, `DELETE /sessions/:key`, `POST /sessions/:key/compact`) have no query params, so `gateway_forward` works correctly.
- **Path params in the Axum handler without validation:** Always check `key.is_empty() || key.len() > 100`. See crons.rs lines 113-115 and 150-152 (verified pattern).
- **Sending full body to gateway for DELETE:** `gateway_forward` accepts `body: Option<Value>`. For DELETE, pass `None` — the key is in the path. For PATCH rename, pass `Some(json!({ "label": body.label }))`.
- **Calling gateway_forward with a key that contains slashes:** Session keys from the OpenClaw protocol are short alphanumeric strings. If a key ever contains `/`, `validate_gateway_path` will reject it as path traversal. Research found no indication keys contain slashes — treat this as a non-issue but the validation catches it anyway.
- **Using `window.dispatchEvent` for cross-component state:** The project rule says never use custom DOM events. Use the `onSelect(null)` callback in `SessionsPage` to clear selection when the selected session is deleted.
- **Inline imports of the Supabase client in frontend:** This phase has no Supabase interaction — all mutation calls go through `api.patch/del/post` to the Axum backend.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Outside-click menu close | Custom event listener logic | Reuse `MessageMenu.tsx` pattern (useEffect with mousedown + keydown) | Already battle-tested, covers all edge cases |
| Error display | Custom error component | `useToast()` from `@/components/ui/Toast` | Already wired into `LayoutShell` via `ToastProvider` |
| Modal focus trap | Custom focus management | `useFocusTrap` hook from `@/lib/hooks/useFocusTrap` | Handles Tab cycling, initial focus, cleanup |
| Escape key close | Inline `keydown` handler | `useEscapeKey` hook from `@/lib/hooks/useEscapeKey` | Consistent behavior, already used in AgentDetailPanel |
| Danger button | Custom styled button | `Button` component with `variant="danger"` | Consistent red styling, disabled state, transitions |
| Cache sync | Manual state → context sync | React Query optimistic update + invalidation on settle | Prevents dual sources of truth, handles network errors |

**Key insight:** The codebase already has every building block. This phase is a composition exercise.

---

## Common Pitfalls

### Pitfall 1: Selected Session Deleted — Stale Detail Panel
**What goes wrong:** User deletes the currently-selected session. `selectedId` still references the deleted key, `SessionHistoryPanel` tries to load history for a non-existent session and shows an error.
**Why it happens:** `SessionsPage.tsx` holds `selectedId` in state. Optimistic delete removes the session from cache. The panel does not know its session was deleted.
**How to avoid:** In `SessionsPage.tsx`, after the delete mutation fires, check if `selectedId === deletedKey` and call `setSelectedId(null)`. Pass an `onDeleted` callback from `SessionList` up to `SessionsPage`, or handle in the `onSettled`/`onSuccess` of the mutation.
**Warning signs:** Console shows 404 for `/api/gateway/sessions/{key}/history` after delete.

### Pitfall 2: Axum Route Order Conflict
**What goes wrong:** Adding `.route("/gateway/sessions/:key", ...)` after the existing `.route("/gateway/sessions", get(gateway_sessions))` causes Axum to panic at startup with a conflicting route message.
**Why it happens:** Axum merges routers and all routes must be unique. `/gateway/sessions` (no trailing segment) and `/gateway/sessions/:key` (path param) are distinct and do NOT conflict.
**How to avoid:** The existing route is `/gateway/sessions` (no param). The new routes are `/gateway/sessions/:key` (with param). These are different Axum paths — they will NOT conflict. Verify by running `cargo check` after adding.
**Warning signs:** `cargo check` fails with "route conflict" error.

### Pitfall 3: Compact Response Structure Unknown
**What goes wrong:** The OpenClaw gateway's `POST /sessions/{key}/compact` may return various shapes: `{}`, `{ "ok": true }`, `{ "tokensSaved": N, "messageCount": N }`, etc.
**Why it happens:** The `gateway_forward()` function returns `Value` — the Rust layer passes through whatever the gateway returns. We cannot guarantee a fixed shape without testing against a live gateway.
**How to avoid:** The frontend `compactMutation`'s `onSuccess` should defensively read `data?.tokensSaved` with optional chaining. If absent, show a generic "Session compacted" toast. Do NOT destructure with required fields.
**Warning signs:** Runtime TypeError "Cannot read property of undefined" in the compact success handler.

### Pitfall 4: Inline Rename Input Focus Race
**What goes wrong:** Double-clicking a SessionCard triggers the `onSelect` handler AND the `onDoubleClick` handler. The card gets selected AND the inline edit opens, but the input doesn't receive focus if the DOM isn't updated yet.
**Why it happens:** React batches state updates. `isEditing = true` triggers a re-render; the `<input>` doesn't exist yet when the first event fires.
**How to avoid:** Use `autoFocus` on the inline `<input>` — React handles focus on mount. Also call `e.stopPropagation()` on the double-click handler to prevent the single-click `onSelect` from triggering again.
**Warning signs:** Inline input appears but has no cursor / is not focused.

### Pitfall 5: Context Menu Position Clamps
**What goes wrong:** Context menu opens near the edge of the viewport and overflows off-screen.
**Why it happens:** `position: fixed` with exact mouse coordinates doesn't account for menu dimensions and viewport boundaries.
**How to avoid:** Follow the `MessageMenu.tsx` pattern exactly — `Math.max(8, Math.min(x - menuW / 2, window.innerWidth - menuW - 8))` for X clamping. Add Y clamping similarly. Menu width is approximately 200px (smaller than MessageMenu at 280px since this menu has no emoji bar).
**Warning signs:** Menu partially or fully off-screen for sessions in the top-right of the list.

### Pitfall 6: DELETE with Body — Axum JSON Extraction
**What goes wrong:** Some DELETE route patterns in the codebase pass the ID in the body (e.g., `crons.rs` uses `DELETE /crons/delete` with a JSON body). Phase 96's design uses path params (`:key`). Axum can extract `Path(key): Path<String>` from a DELETE route — this works fine. Do NOT add a JSON body extractor to the DELETE handler since the frontend won't send one.
**Why it happens:** Confusion between the crons pattern (body-based delete) and this phase's path-param pattern.
**How to avoid:** Delete handler signature: `Path(key): Path<String>` only — no `Json(body)` extractor. The key is fully in the path.
**Warning signs:** `cargo check` type errors if you add both Path and Json extractors incorrectly.

---

## Code Examples

### Rename Mutation — `useSessionMutations.ts`
```typescript
// Source: pattern from frontend/src/hooks/useAgents.ts (verified)
const renameMutation = useMutation({
  mutationFn: ({ key, label }: { key: string; label: string }) =>
    api.patch(`/api/gateway/sessions/${key}`, { label }),
  onMutate: async ({ key, label }) => {
    await queryClient.cancelQueries({ queryKey: queryKeys.gatewaySessions })
    const prev = queryClient.getQueryData<GatewaySessionsResponse>(queryKeys.gatewaySessions)
    queryClient.setQueryData<GatewaySessionsResponse>(queryKeys.gatewaySessions, (old) => ({
      ...old,
      sessions: (old?.sessions ?? []).map((s) => s.key === key ? { ...s, label } : s),
    }))
    return { prev }
  },
  onError: (_err, _vars, ctx) => {
    if (ctx?.prev) queryClient.setQueryData(queryKeys.gatewaySessions, ctx.prev)
    toast.show({ type: 'error', message: 'Failed to rename session' })
  },
  onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.gatewaySessions }),
})
```

### Delete Mutation — `useSessionMutations.ts`
```typescript
// Source: pattern from frontend/src/hooks/useTodos.ts deleteMutation (verified)
const deleteMutation = useMutation({
  mutationFn: (key: string) => api.del(`/api/gateway/sessions/${key}`),
  onMutate: async (key) => {
    await queryClient.cancelQueries({ queryKey: queryKeys.gatewaySessions })
    const prev = queryClient.getQueryData<GatewaySessionsResponse>(queryKeys.gatewaySessions)
    queryClient.setQueryData<GatewaySessionsResponse>(queryKeys.gatewaySessions, (old) => ({
      ...old,
      sessions: (old?.sessions ?? []).filter((s) => s.key !== key),
    }))
    return { prev }
  },
  onError: (_err, _key, ctx) => {
    if (ctx?.prev) queryClient.setQueryData(queryKeys.gatewaySessions, ctx.prev)
    toast.show({ type: 'error', message: 'Failed to delete session' })
  },
  onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.gatewaySessions }),
})
```

### Compact Mutation — `useSessionMutations.ts`
```typescript
// Source: api wrapper from frontend/src/lib/api.ts (verified)
const compactMutation = useMutation({
  mutationFn: (key: string) => api.post(`/api/gateway/sessions/${key}/compact`),
  onError: () => {
    toast.show({ type: 'error', message: 'Failed to compact session' })
  },
  onSuccess: (data) => {
    // Gateway may or may not include token savings — handle both
    const savings = (data as { tokensSaved?: number })?.tokensSaved
    toast.show({
      type: 'success',
      message: savings ? `Compacted — saved ${savings} tokens` : 'Session compacted',
    })
  },
  onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.gatewaySessions }),
})
```

### Axum PATCH Handler — `gateway.rs`
```rust
// Source: crons.rs update_cron pattern (verified) + bjorn.rs Path<String> pattern (verified)
#[derive(Debug, Deserialize)]
struct PatchSessionBody {
    label: Option<String>,
}

async fn patch_session(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Path(key): Path<String>,
    Json(body): Json<PatchSessionBody>,
) -> Result<Json<Value>, AppError> {
    if key.is_empty() || key.len() > 100 {
        return Err(AppError::BadRequest("invalid session key".into()));
    }
    let label = body.label.as_deref().unwrap_or("").trim().to_string();
    let payload = gateway_forward(
        &state,
        Method::PATCH,
        &format!("/sessions/{key}"),
        Some(json!({ "label": label })),
    ).await.map_err(|e| {
        tracing::error!("[sessions] rename failed: {e:?}");
        match e {
            AppError::BadRequest(_) => e,
            _ => AppError::BadRequest("Gateway error: failed to rename session".into()),
        }
    })?;
    Ok(Json(json!({ "ok": true, "session": payload })))
}
```

### Axum DELETE Handler — `gateway.rs`
```rust
// Source: crons.rs delete_cron + Path<String> pattern (verified)
async fn delete_session(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Path(key): Path<String>,
) -> Result<Json<Value>, AppError> {
    if key.is_empty() || key.len() > 100 {
        return Err(AppError::BadRequest("invalid session key".into()));
    }
    let payload = gateway_forward(
        &state,
        Method::DELETE,
        &format!("/sessions/{key}"),
        None,
    ).await.map_err(|e| {
        tracing::error!("[sessions] delete failed: {e:?}");
        match e {
            AppError::BadRequest(_) => e,
            _ => AppError::BadRequest("Gateway error: failed to delete session".into()),
        }
    })?;
    Ok(Json(json!({ "ok": true, "data": payload })))
}
```

### Axum Compact Handler — `gateway.rs`
```rust
// Source: Same gateway_forward pattern, POST with no body (body: None)
async fn compact_session(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Path(key): Path<String>,
) -> Result<Json<Value>, AppError> {
    if key.is_empty() || key.len() > 100 {
        return Err(AppError::BadRequest("invalid session key".into()));
    }
    let payload = gateway_forward(
        &state,
        Method::POST,
        &format!("/sessions/{key}/compact"),
        None,
    ).await.map_err(|e| {
        tracing::error!("[sessions] compact failed: {e:?}");
        match e {
            AppError::BadRequest(_) => e,
            _ => AppError::BadRequest("Gateway error: failed to compact session".into()),
        }
    })?;
    Ok(Json(json!({ "ok": true, "data": payload })))
}
```

### Route Registration — `gateway.rs` router()
```rust
// Source: gateway.rs router() function (verified — existing routes pattern)
// Add these three lines to the router() function:
.route("/gateway/sessions/:key", patch(patch_session).delete(delete_session))
.route("/gateway/sessions/:key/compact", post(compact_session))
```

Import additions needed at the top of `gateway.rs`:
```rust
use axum::extract::Path;
use axum::routing::{patch, post, delete};
use serde::Deserialize;
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Crons use body-based DELETE (`/crons/delete` + JSON body) | Sessions use path param DELETE (`/sessions/:key`) | Phase 96 (this phase) | Path params are cleaner REST; client sends `api.del(\`/api/gateway/sessions/${key}\`)` without a body |
| No session mutations existed | Full optimistic CRUD for sessions | Phase 96 (this phase) | Establishes the mutation pattern for future session operations |

**Deprecated/outdated:**
- `api.del(path, { id })` body pattern from todos/agents: for session delete, the key goes in the URL, not the body. The frontend should call `api.del(\`/api/gateway/sessions/${key}\`)` with NO body argument.

---

## Open Questions

1. **OpenClaw `sessions.compact` response shape**
   - What we know: Returns JSON. May contain `{ tokensSaved, messageCount }` or may return `{}`.
   - What's unclear: No official OpenClaw API docs were accessible to verify the exact response shape.
   - Recommendation: Handle defensively with optional chaining. Show "Session compacted" as fallback toast.

2. **OpenClaw `sessions.patch` — label-only or other fields?**
   - What we know: CONTEXT.md says body is `{ label }`.
   - What's unclear: Whether the gateway accepts other fields (e.g., `agentKey` rename) or only `label`.
   - Recommendation: Only send `{ label }` as locked in CONTEXT.md. Do not attempt to patch other fields in this phase.

3. **Session key character set**
   - What we know: Phase 91 uses `key` from the gateway response. Test data shows `sess-1`, `agent-bjorn` style keys.
   - What's unclear: Whether keys can contain characters that need URL encoding (e.g., spaces, `+`).
   - Recommendation: Apply the same `key.len() > 100` guard used in crons. The `validate_gateway_path` in `gateway_forward` provides secondary protection. If future keys need URL encoding, use `crate::routes::util::percent_encode(&key)` (same as Plan 92).

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (frontend), cargo test (Rust) |
| Config file | `frontend/vite.config.ts` (vitest section) |
| Quick run command | `cd frontend && npx vitest run hooks/sessions/__tests__/useSessionMutations.test.ts` |
| Full suite command | `cd frontend && npx vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SESS-03 | Rename mutation updates label in cache optimistically | unit | `cd frontend && npx vitest run hooks/sessions/__tests__/useSessionMutations.test.ts -t "rename"` | ❌ Wave 0 |
| SESS-03 | Rename mutation rolls back on error | unit | same file | ❌ Wave 0 |
| SESS-04 | Delete mutation removes session from cache | unit | `cd frontend && npx vitest run hooks/sessions/__tests__/useSessionMutations.test.ts -t "delete"` | ❌ Wave 0 |
| SESS-04 | Delete mutation rolls back on error | unit | same file | ❌ Wave 0 |
| SESS-05 | Compact mutation invalidates sessions cache on settle | unit | `cd frontend && npx vitest run hooks/sessions/__tests__/useSessionMutations.test.ts -t "compact"` | ❌ Wave 0 |
| SESS-03/04/05 | Backend handlers validate key length | unit (Rust) | `CARGO_TARGET_DIR=/tmp/mc-target cargo test --manifest-path src-tauri/Cargo.toml -- sessions` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `cd frontend && npx vitest run hooks/sessions/__tests__/useSessionMutations.test.ts`
- **Per wave merge:** `cd frontend && npx vitest run`
- **Phase gate:** Full suite green + `CARGO_TARGET_DIR=/tmp/mc-target cargo check --manifest-path src-tauri/Cargo.toml` + browser test

### Wave 0 Gaps
- [ ] `frontend/src/hooks/sessions/__tests__/useSessionMutations.test.ts` — covers SESS-03, SESS-04, SESS-05 mutation behavior
- [ ] Rust unit tests in `gateway.rs` `#[cfg(test)]` block for `patch_session`, `delete_session`, `compact_session` key validation

*(No framework install needed — Vitest and cargo test already configured)*

---

## Sources

### Primary (HIGH confidence)
- `frontend/src/hooks/useAgents.ts` — optimistic mutation pattern (cancel, snapshot, set, rollback, invalidate)
- `frontend/src/lib/hooks/useTodos.ts` — same optimistic pattern for delete (filter from list)
- `src-tauri/src/routes/gateway.rs` — `gateway_forward()` signature, `validate_gateway_path()` behavior, existing router structure
- `src-tauri/src/routes/crons.rs` — body-based gateway mutations (PATCH/DELETE patterns with id validation)
- `src-tauri/src/routes/bjorn.rs` — `Path<String>` extraction pattern in Axum
- `frontend/src/components/messages/MessageMenu.tsx` — context menu: backdrop overlay, outside-click handler, Escape handler, `MButton` component
- `frontend/src/pages/agents/AgentDetailPanel.tsx` — delete confirmation dialog: createPortal, useFocusTrap, useEscapeKey, Button variant="danger"
- `frontend/src/components/ui/Toast.tsx` — `useToast()` API: `show({ type, message })`
- `frontend/src/lib/query-keys.ts` — `queryKeys.gatewaySessions` key
- `frontend/src/pages/sessions/types.ts` — `ClaudeSession`, `GatewaySessionsResponse` types
- `frontend/src/pages/sessions/SessionCard.tsx` — current card structure to extend
- `frontend/src/pages/sessions/SessionList.tsx` — current list structure to extend
- `frontend/src/pages/sessions/SessionsPage.tsx` — `selectedId` state management

### Secondary (MEDIUM confidence)
- OpenClaw gateway route patterns inferred from CONTEXT.md decisions and existing codebase usage

### Tertiary (LOW confidence)
- OpenClaw `sessions.compact` response shape — not verified against live gateway; handled defensively

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries verified present in codebase
- Architecture: HIGH — all patterns verified by reading actual source files
- Pitfalls: HIGH — derived from real codebase constraints (gateway_forward path validation, Axum route conflicts, React render timing)
- OpenClaw compact response: LOW — gateway behavior not testable without live instance

**Research date:** 2026-03-24
**Valid until:** 2026-04-23 (stable project, no external API changes expected)
