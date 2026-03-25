# Phase 92: Chat History Display - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning
**Mode:** Auto-accepted recommendations (autonomous mode)

<domain>
## Phase Boundary

Users can select a session from the session list (Phase 91) and read its full conversation with proper markdown formatting, syntax-highlighted code blocks, and pagination for long histories.

</domain>

<decisions>
## Implementation Decisions

### Message Rendering
- Use the existing `MarkdownBubble` component (lazy-loaded) for assistant messages — it already handles markdown
- Add syntax highlighting to code blocks via a lightweight library (e.g., `highlight.js` or `prism.js` — check what's already in the bundle)
- Add a copy-to-clipboard button on code blocks (absolute positioned top-right corner)
- User messages render as plain text (no markdown) in accent-colored bubbles (existing pattern from SessionHistoryPanel)

### Layout & Alignment
- Keep the existing `ROLE_CONFIG` pattern from `SessionHistoryPanel.tsx` — user messages right-aligned, assistant/system/tool left-aligned
- Messages use the existing bubble pattern: 85% max-width, role label + icon above, timestamp on role label row
- Tool messages show `toolName` as subtitle (already implemented)

### Backend Route
- Add `GET /api/gateway/sessions/:key/history` route to `gateway.rs` that calls `gateway_forward(GET, /chat/history/{key})` — maps to OpenClaw `chat.history` RPC method
- The hook `useSessionHistory` already calls this endpoint pattern — just need the backend route
- Support `limit` query param forwarded to gateway for pagination

### Pagination
- Use cursor-based "load more" at the top of the message list (scroll up to load older messages)
- Default limit: 50 messages per page
- "Load older messages" button at top when more messages available (gateway returns whether there are more)

### Claude's Discretion
- Exact code highlighting theme (match dark/light mode CSS vars)
- Animation for new messages appearing
- Exact scroll behavior for "load more" (preserve scroll position after loading older messages)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `SessionHistoryPanel.tsx` — already renders messages with `MessageBubble` and `MarkdownBubble`
- `useSessionHistory.ts` — React Query hook calling `/api/gateway/sessions/${sessionId}/history`
- `MarkdownBubble.tsx` — lazy-loaded markdown renderer
- `types.ts` — `SessionHistoryMessage`, `SessionHistoryResponse` types already defined
- `queryKeys.sessionHistory(key)` — query key already registered
- `ROLE_CONFIG` — role-based styling already configured (user/assistant/system/tool)

### Established Patterns
- `gateway_forward(state, Method::GET, path, body)` — single chokepoint for OpenClaw API calls
- React Query with `staleTime: 30_000` and `retry: 1` for session data
- Demo mode check via `isDemoMode()` — return empty data when OpenClaw not configured
- SSE event invalidation via `useGatewaySSE` — `'chat'` events invalidate session queries

### Integration Points
- Backend: Add route to `gateway.rs` router (`.route("/gateway/sessions/:key/history", get(handler))`)
- Frontend: `SessionHistoryPanel` is already wired into `SessionsPage` right panel
- The hook already fetches from the correct endpoint — just needs the backend route

</code_context>

<specifics>
## Specific Ideas

- Code blocks must have a copy button (iOS-level polish standard)
- Syntax highlighting should respect the current theme (dark/light)
- Loading state should use skeleton shimmer, not a spinner (per UI polish rules)
- Empty state for "no messages yet" with a prompt to start chatting

</specifics>

<deferred>
## Deferred Ideas

- Message search within a conversation (future phase)
- Message editing/deletion (future phase)
- Image/attachment rendering in messages (future phase)

</deferred>
