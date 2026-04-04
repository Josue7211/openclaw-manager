# Phase 91: Session List - Research

**Researched:** 2026-03-24
**Domain:** OpenClaw Gateway RPC / React Query / Axum route
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Replace `useGatewaySessions` hook to call `/api/gateway/sessions` which proxies `sessions.list` RPC — simplify to gateway-only, remove the two-tier fallback
- The `ClaudeSession` type needs to match the real `sessions.list` response shape (key, label, agentKey, messageCount, lastActivity)
- Keep React Query for caching with 5s staleTime
- Keep the existing split-panel layout (list left, detail right)
- Each session card shows: label (or "Untitled"), agent name, message count badge, relative timestamp (SecondsAgo)
- Sort by lastActivity descending (newest first)
- Empty state: centered icon + "No sessions yet" + "Start a new chat" button
- Add/update `GET /api/gateway/sessions` route in Axum that calls `sessions.list` via `gateway_forward`
- Response: thin pass-through of the gateway payload

### Claude's Discretion
- Specific card styling, hover states, and selected state styling
- Whether to show session status (running/completed/failed) as a colored dot or text label
- Loading skeleton design while sessions are being fetched

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SESS-01 | User can view a list of all sessions with label, agent name, message count, and last activity timestamp | `sessions.list` RPC returns `{ sessions: [...] }` payload where each session has `key`, `label`, `agentKey`, `messageCount`, `lastActivity` fields — confirmed from protocol reference + worktree patterns |
</phase_requirements>

---

## Summary

Phase 91 replaces the existing v0.0.3 session list (which used an assumed data shape and a two-tier gateway+CLI fallback) with a proper implementation backed by the real `sessions.list` RPC method from the OpenClaw gateway.

The backend gap is the critical path: `GET /api/gateway/sessions` is called by the frontend but does not exist in `src-tauri/src/routes/gateway.rs` in the main codebase. The worktrees for v0.0.5 implemented this route against a `GatewayWsClient` that had an async `request()` method, but that version of `gateway_ws.rs` was NOT merged to main. The current main codebase `GatewayWsClient` only has event broadcast — no `request()` method.

The resolution: add `GET /api/gateway/sessions` to `gateway.rs` that calls `gateway_forward` (HTTP-based, already working) with method `GET` on the sessions endpoint. This matches how `gateway_activity` and `openclaw_health` work — HTTP proxy, not WS RPC. The WS client will gain `request()` in a later phase if needed; for list-only this HTTP proxy approach is sufficient and already proven.

The frontend types need updating: the current `ClaudeSession` type uses `id`, `task`, `status`, `model`, `workingDir`, `startedAt`, `duration`, `kind`. The real `sessions.list` response from OpenClaw uses `key`, `label`, `agentKey`, `messageCount`, `lastActivity`. The hook and types file need to be updated to match.

**Primary recommendation:** Add `GET /api/gateway/sessions` route using `gateway_forward`, update `ClaudeSession` type to real shape, rewrite `useGatewaySessions` hook to gateway-only, update `SessionCard` to show label/agentKey/messageCount/lastActivity.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@tanstack/react-query` | v5 (already installed) | Data fetching + caching | All data fetching in this app uses RQ |
| `gateway_forward` (Rust) | (internal) | HTTP proxy to OpenClaw API | Single chokepoint, handles auth, error sanitization, SSRF protection |
| `SecondsAgo` | (internal component) | Relative timestamp display | Already used in messages, notifications |
| `GatewayStatusDot` | (internal component) | Connection status dot | Already in SessionList header |
| `@phosphor-icons/react` | (already installed) | Icons for empty state | App-wide icon library |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `React.memo` | React 18 | Memoize SessionCard | List of items that re-render on selection change |
| `isDemoMode()` | (internal) | Demo mode guard | Required in every gateway-connected hook |

---

## Architecture Patterns

### Existing Pattern: gateway_forward HTTP Proxy

All OpenClaw API calls go through `gateway_forward` in `src-tauri/src/routes/gateway.rs`. This is a synchronous HTTP request to the OpenClaw API URL with Bearer token auth, 30s timeout, path validation, and error sanitization. The `sessions.list` endpoint is exposed on the OpenClaw REST API (not WS-only), so `gateway_forward` works.

The correct path is `/sessions` (same path that `claude_sessions.rs` currently calls in `list_sessions`). The existing `claude_sessions.rs` `list_sessions` handler ALREADY calls `gateway_forward(&state, Method::GET, "/sessions", None)` — so the backend route at `/api/gateway/sessions` just needs to do the same, without the `kind == "claude-code"` filter (return all sessions).

### Pattern: Hook + Route + Type Triad

Every gateway feature follows this three-part structure:

1. **Rust route** in `src-tauri/src/routes/` — handles auth, calls `gateway_forward`, returns `Json<Value>`
2. **TypeScript hook** in `frontend/src/hooks/` — wraps `useQuery`, calls the route, returns typed data
3. **TypeScript types** in `pages/sessions/types.ts` — define the shape of the data

For Phase 91, all three parts need to be updated to match the real `sessions.list` response shape.

### Real sessions.list Response Shape (HIGH confidence)

From the OpenClaw Protocol v3 reference (gateway_protocol.md + complete reference):
- Method: `sessions.list`
- Params: `{}` (no params)
- Response payload: `{ sessions: [...] }`

Each session object contains:
```typescript
{
  key: string           // unique session identifier (used as ID everywhere in protocol)
  label: string         // user-visible session name
  agentKey: string      // which agent handles this session
  messageCount: number  // total messages in session
  lastActivity: string  // ISO-8601 timestamp of last message/activity
}
```

**Note:** The old `ClaudeSession` type used `id` (not `key`), `task` (not `label`), `status`, `model`, `workingDir`, `startedAt`, `duration`, `kind` — NONE of these match the real protocol. The type file needs a full rewrite.

**Note on `key` vs `id`:** The protocol uses `key` as the session identifier. All other gateway methods (`chat.history`, `chat.send`, `sessions.patch`, `sessions.delete`) accept `sessionKey` as the parameter. The frontend should use `session.key` as the internal ID, not `session.id`.

### Pattern: Empty State

Other pages in this app follow:
- Centered container with icon (phosphor-icons), headline, subtext, optional action button
- CSS variables: `--text-muted`, `--text-primary`, `--hover-bg`, `--border`
- No custom SVGs — use Phosphor icons (e.g., `ChatTeardrop`, `ChatDots` from `@phosphor-icons/react`)

### Anti-Patterns to Avoid
- **Two-tier fallback:** The old hook had gateway + CLI fallback. Remove entirely — gateway-only per locked decision.
- **`source` field on hook return:** The `DataSource = 'gateway' | 'cli' | 'none'` type is being removed. The hook should return only `{ sessions, isLoading, error }` (or `available` if needed for unreachable state).
- **Using `session.id`:** Use `session.key` — the protocol identifier.
- **Using `task` field:** Display `session.label` with an "Untitled" fallback.
- **Filtering by `kind == "claude-code"`:** The new `/api/gateway/sessions` should pass through all sessions from `sessions.list` — no filtering.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Relative timestamps | Custom time-ago logic | `SecondsAgo` component | Already handles live-updating, edge cases (future dates, etc.) |
| API error handling | Custom error catching | `gateway_forward` | Already handles 4xx/5xx, sanitizes errors, handles network failures |
| HTTP with auth | Manual fetch | `gateway_forward` | SSRF protection, path validation, Bearer token injection |
| Query invalidation | Manual refetch | React Query `refetchInterval: 5_000` | Standard pattern throughout app |

---

## Common Pitfalls

### Pitfall 1: Route Registration Without Testing
**What goes wrong:** Axum routes compile fine but silently fail to register when router merges conflict or handler return types mismatch.
**Why it happens:** `Result<Response, AppError>` return types don't work in merged routers; compilation succeeds but route is a 404.
**How to avoid:** Use `Result<Json<Value>, AppError>` return type. Test with `curl http://localhost:3000/api/gateway/sessions` after adding the route.
**Warning signs:** Frontend gets 404 but backend compiled clean.

### Pitfall 2: Using Wrong Session Field Names
**What goes wrong:** Frontend breaks because it accesses `session.id` or `session.task` which don't exist in the real response.
**Why it happens:** The v0.0.3 types were assumed, not derived from the real protocol.
**How to avoid:** Use `session.key` as the ID, `session.label` as the display name, `session.agentKey` for agent name, `session.messageCount` for count, `session.lastActivity` for timestamp.
**Warning signs:** Session cards render empty or throw "Cannot read property of undefined".

### Pitfall 3: cargo Caching After .rs Changes
**What goes wrong:** `cargo tauri dev` doesn't pick up edited `.rs` files.
**Why it happens:** Tauri's aggressive caching.
**How to avoid:** Run `CARGO_TARGET_DIR=/tmp/mc-target cargo clean -p mission-control` before restarting dev server.
**Warning signs:** Changes to `.rs` files are not reflected even after restart.

### Pitfall 4: SSE Event Subscription on Wrong Query Key
**What goes wrong:** `useGatewaySSE` invalidates `queryKeys.gatewayActivity` instead of `queryKeys.gatewaySessions` — list never refreshes on new sessions.
**Why it happens:** Copy-paste from other SSE hooks.
**How to avoid:** The `useGatewaySSE` call in the sessions hook must use `queryKeys.gatewaySessions`.

### Pitfall 5: `/api/gateway/sessions` vs `/api/claude-sessions`
**What goes wrong:** The new route URL conflicts with or overlaps the old one.
**Why it happens:** Two different routes with similar purposes: old `/api/claude-sessions` (with CLI fallback) and new `/api/gateway/sessions` (gateway-only).
**How to avoid:** Both can coexist during transition. The frontend must call `/api/gateway/sessions` (not `/api/claude-sessions`). The old route in `claude_sessions.rs` is kept for backward compatibility but the new hook exclusively uses the gateway route.

---

## Code Examples

### GET /api/gateway/sessions Axum Route
```rust
// Source: follows gateway_activity pattern in src-tauri/src/routes/gateway.rs
/// `GET /api/gateway/sessions`
///
/// Proxies `sessions.list` through the OpenClaw API.
/// Returns the full sessions list without filtering.
async fn gateway_sessions(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Result<Json<Value>, AppError> {
    let payload = gateway_forward(&state, Method::GET, "/sessions", None)
        .await
        .map_err(|e| {
            tracing::error!("[gateway] sessions.list failed: {e:?}");
            match e {
                AppError::BadRequest(_) => e,
                _ => AppError::BadRequest("Gateway error: failed to fetch sessions".into()),
            }
        })?;

    Ok(Json(json!({ "ok": true, "sessions": payload })))
}
```

### Updated ClaudeSession Type
```typescript
// Source: derived from OpenClaw Protocol v3 sessions.list method
export interface ClaudeSession {
  key: string            // session identifier (use this as ID)
  label: string          // display name (may be empty — show "Untitled" as fallback)
  agentKey: string       // agent handling this session
  messageCount: number   // total messages
  lastActivity: string   // ISO-8601 timestamp
  [key: string]: unknown // forward-compatible
}

export interface GatewaySessionsResponse {
  ok: boolean
  sessions: ClaudeSession[]
}
```

### Simplified useGatewaySessions Hook
```typescript
// Source: follows useAgents, useCrons pattern in this codebase
export function useGatewaySessions() {
  const demo = isDemoMode()

  useGatewaySSE(demo ? undefined : {
    events: ['chat'],
    queryKeys: { chat: queryKeys.gatewaySessions },
  })

  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.gatewaySessions,
    queryFn: () => api.get<GatewaySessionsResponse>('/api/gateway/sessions'),
    refetchInterval: demo ? false : 5_000,
    staleTime: 5_000,
    enabled: !demo,
    retry: 0,
  })

  if (demo) {
    return { sessions: [], isLoading: false, available: false }
  }

  return {
    sessions: data?.sessions ?? [],
    isLoading,
    available: !isError,
  }
}
```

### SessionCard Displaying Real Fields
```tsx
// Source: follows existing SessionCard.tsx pattern
<div style={{ fontSize: '13px', fontWeight: 600 }}>
  {session.label || 'Untitled'}
</div>
<div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
  {session.agentKey}
</div>
<div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
  <span>{session.messageCount} messages</span>
  <SecondsAgo timestamp={session.lastActivity} />
</div>
```

### Empty State Pattern
```tsx
// Source: follows messages/ConversationList empty state pattern
<div style={{
  flex: 1, display: 'flex', flexDirection: 'column',
  alignItems: 'center', justifyContent: 'center', gap: '12px',
  padding: '24px', color: 'var(--text-muted)',
}}>
  <ChatTeardrop size={32} weight="thin" />
  <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
    No sessions yet
  </div>
  <div style={{ fontSize: '12px', textAlign: 'center' }}>
    Start a new chat to create your first session
  </div>
  <button type="button" /* ... navigate to chat ... */>
    Start a new chat
  </button>
</div>
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| `ClaudeSession` with `id`, `task`, `status`, `model`, `kind` | `ClaudeSession` with `key`, `label`, `agentKey`, `messageCount`, `lastActivity` | Type must be rewritten; `session.id` references → `session.key` |
| Two-tier hook (gateway + CLI fallback) | Gateway-only hook | Removes `source` field, removes fallback query, simplifies logic |
| `GET /api/claude-sessions` (with `kind` filter) | `GET /api/gateway/sessions` (all sessions, no filter) | New route in `gateway.rs`; old route in `claude_sessions.rs` stays for other consumers |
| "No active sessions" empty text | Designed empty state with icon + CTA | Requires `ChatTeardrop` or similar icon |

**Deprecated/outdated:**
- `DataSource` type (`'gateway' | 'cli' | 'none'`) — removed with CLI fallback
- `source` property in hook return — removed
- `useQuery` for `queryKeys.claudeSessions` fallback — removed
- `ClaudeSession.status` — not in real protocol; remove unless gateway returns it
- `ClaudeSession.startedAt`, `ClaudeSession.duration` — not in real protocol; remove
- `SessionCard` kill button (calls `/kill`) — out of scope for this phase; leave it or remove it

---

## Open Questions

1. **Does the gateway REST API actually expose `/sessions` or is it WS-only?**
   - What we know: `claude_sessions.rs` `list_sessions` already calls `gateway_forward(&state, Method::GET, "/sessions", None)` and this has been working to return session data
   - What's unclear: The exact HTTP response shape vs the WS `sessions.list` payload shape — they may differ slightly
   - Recommendation: Use `gateway_forward` (HTTP). The current `list_sessions` in `claude_sessions.rs` parses `sessions` array from the response — the HTTP endpoint exists. The new `/api/gateway/sessions` route should return all sessions without the `kind` filter.

2. **Should `/api/gateway/sessions` use `gateway_forward` (HTTP) or `gateway_ws.request()` (WS RPC)?**
   - What we know: Current main codebase `GatewayWsClient` has no `request()` method — it's event-broadcast only. The worktree versions have `request()` but were not merged.
   - What's unclear: Whether v0.0.5 was supposed to have merged the full `GatewayWsClient`
   - Recommendation: Use `gateway_forward` (HTTP) for this phase — it's proven, simpler, and matches how all other non-streaming routes work. No need to add WS RPC capability just for a list call.

3. **What does the real `sessions.list` payload look like when the gateway has 47 sessions?**
   - What we know: Protocol v3 docs say `sessions.list` returns `{ sessions: [...] }`. The `key`, `label`, `agentKey`, `messageCount`, `lastActivity` fields come from the protocol reference.
   - What's unclear: Whether HTTP `/sessions` returns the same shape as WS `sessions.list` payload, or has extra/different fields
   - Recommendation: Parse defensively — use optional chaining, display graceful fallbacks for missing fields. The `[key: string]: unknown` index signature on `ClaudeSession` covers unknown fields.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (frontend), Cargo test (Rust) |
| Config file | `frontend/vite.config.ts` (inline vitest config) |
| Quick run command | `cd frontend && npx vitest run src/hooks/sessions` |
| Full suite command | `cd /home/josue/Documents/projects/mission-control/frontend && npx vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SESS-01 | `useGatewaySessions` returns sessions array from `/api/gateway/sessions` | unit | `cd frontend && npx vitest run src/hooks/sessions` | ✅ (rewrite needed) |
| SESS-01 | `ClaudeSession` type uses `key`, `label`, `agentKey`, `messageCount`, `lastActivity` | unit (type check) | `cd frontend && npx tsc --noEmit --project tsconfig.app.json` | ✅ (update types) |
| SESS-01 | Sessions sorted by `lastActivity` descending | unit | existing test file | ✅ (add test case) |
| SESS-01 | Empty state renders when sessions array is empty | unit | existing test file | ✅ (add test case) |
| SESS-01 | Rust route returns `{ ok: true, sessions: [...] }` on success | unit | `CARGO_TARGET_DIR=/tmp/mc-target cargo test --manifest-path src-tauri/Cargo.toml routes::gateway` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `cd frontend && npx vitest run src/hooks/sessions`
- **Per wave merge:** `cd frontend && npx vitest run` + `CARGO_TARGET_DIR=/tmp/mc-target cargo test --manifest-path src-tauri/Cargo.toml`
- **Phase gate:** Full suite green + agent-browser verification before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] Rust test for `GET /api/gateway/sessions` route — test that it calls `gateway_forward` and returns correct envelope

---

## Sources

### Primary (HIGH confidence)
- `/home/josue/.claude/projects/-home-josue-Documents-projects-mission-control/memory/reference_openclaw_complete.md` — `sessions.list` method signature, protocol v3 response shape
- `src-tauri/src/routes/gateway.rs` — `gateway_forward` function signature, `gateway_activity` pattern to follow
- `src-tauri/src/routes/claude_sessions.rs` — existing `list_sessions` that calls `gateway_forward("/sessions")`
- `frontend/src/hooks/sessions/useGatewaySessions.ts` — current hook to rewrite
- `frontend/src/pages/sessions/types.ts` — current types to rewrite
- `.claude/worktrees/agent-a95f39f5/src-tauri/src/routes/gateway.rs` — reference implementation of `gateway_sessions` route

### Secondary (MEDIUM confidence)
- `.claude/worktrees/agent-a95f39f5/src-tauri/src/gateway_ws.rs` — confirms `request()` method is not in main codebase; HTTP proxy is the correct approach for this phase

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries are already installed and used throughout the codebase
- Architecture: HIGH — backend route pattern is directly observable in `gateway.rs`; frontend hook pattern follows `useAgents`/`useCrons`
- Real response shape: MEDIUM — derived from protocol reference + worktree patterns; exact HTTP `/sessions` shape vs WS payload may differ slightly
- Pitfalls: HIGH — all pitfalls are from observed patterns in the existing codebase and CLAUDE.md warnings

**Research date:** 2026-03-24
**Valid until:** 2026-04-24 (stable protocol, changes only if OpenClaw updates its API)
