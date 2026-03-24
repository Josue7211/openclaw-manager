# Phase 91: Session List - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning
**Mode:** Auto-generated (autonomous mode)

<domain>
## Phase Boundary

Replace the existing v0.0.3 sessions list (which uses wrong API shapes and the CLI-based fallback) with a proper sessions list powered by the real `sessions.list` gateway RPC method. Users see all their sessions with label, agent name, message count, and last activity — sorted by most recent.

</domain>

<decisions>
## Implementation Decisions

### Data Layer
- Replace `useGatewaySessions` hook to call `/api/gateway/sessions` which proxies `sessions.list` RPC — the current hook has a two-tier fallback (gateway + CLI) that adds complexity; simplify to gateway-only since v0.0.5 confirmed the connection works
- The `ClaudeSession` type in `types.ts` needs to match the real `sessions.list` response shape from the gateway (key, label, agentKey, messageCount, lastActivity, etc.) — not the assumed shape from v0.0.3
- Keep React Query for caching with 5s staleTime — consistent with other gateway data hooks

### Session List UI
- Keep the existing split-panel layout (list on left, detail on right) — matches the Messages page pattern
- Each session card shows: label (or "Untitled" fallback), agent name, message count badge, relative timestamp (use existing SecondsAgo component)
- Sort by lastActivity descending (newest first) — this is the natural expectation
- Empty state: centered icon + "No sessions yet" + "Start a new chat" button — consistent with other empty states in the app

### Backend Route
- Add/update `GET /api/gateway/sessions` route in Axum that calls `sessions.list` via `gateway_forward` — this route may already exist from v0.0.3 but needs to use the correct RPC method and response parsing
- Response shape should be a thin pass-through of the gateway response — no transformation beyond what's needed for frontend consumption

### Claude's Discretion
- Specific card styling, hover states, and selected state styling
- Whether to show session status (running/completed/failed) as a colored dot or text label
- Loading skeleton design while sessions are being fetched

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `SecondsAgo` component for relative timestamps
- `GatewayStatusDot` component for connection status
- `useGatewaySSE` hook for real-time updates (already wired for 'chat' events)
- `gateway_forward` function in Rust for proxying RPC calls
- `queryKeys.gatewaySessions` already defined
- Existing `SessionCard.tsx`, `SessionList.tsx`, `SessionsPage.tsx` — skeletons to rewrite

### Established Patterns
- React Query for all data fetching (see useAgents, useCrons hooks)
- Split-panel layout (Messages page pattern: list left, detail right)
- CSS variables for all colors (var(--border), var(--hover-bg), etc.)
- Demo mode fallback via `isDemoMode()` check

### Integration Points
- Route: `/sessions` in main.tsx router
- Sidebar: "Sessions" link already exists
- SSE: 'chat' events already subscribed in SessionsPage
- Backend: `src-tauri/src/routes/claude_sessions.rs` — needs gateway RPC integration

</code_context>

<specifics>
## Specific Ideas

No specific requirements — standard list view following established app patterns. The real `sessions.list` response shape from the gateway protocol is the key driver.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
