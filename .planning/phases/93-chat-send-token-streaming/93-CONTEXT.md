# Phase 93: Chat Send with Token Streaming - Context

**Gathered:** 2026-03-25
**Status:** Ready for planning
**Mode:** Auto-accepted recommendations (autonomous mode)

<domain>
## Phase Boundary

Users can type a message in the chat thread, send it, and watch the agent's response appear token-by-token in real-time via SSE streaming. Sending the first message in a new session implicitly creates the session — no separate create step.

</domain>

<decisions>
## Implementation Decisions

### Send Flow
- User types message in a compose input area at the bottom of SessionHistoryPanel
- On submit (Enter key), the message appears immediately in the thread as a user bubble (optimistic)
- `chat.send` is called via Axum proxy with `{ sessionKey, message, deliver: true, idempotencyKey }`
- The idempotencyKey is a UUID generated client-side to prevent duplicate sends on retry

### Streaming Architecture
- Agent response tokens arrive via the existing SSE event bus (`'chat'` events from gateway)
- Tokens accumulate into a streaming message that renders incrementally (not batched)
- When streaming completes (end-of-stream marker), the full response is displayed as a single message
- The streaming state is managed in a React hook (not global state)

### New Session Creation
- When no session is selected (or user clicks "New Chat"), the first message creates the session
- The response from `chat.send` includes the new sessionKey
- After session creation, the session list is invalidated to show the new session

### Backend Route
- `POST /api/gateway/chat/send` — calls `gateway_forward(POST, /chat/send)` with the message payload
- Response format: `{ ok: true, sessionKey: string }` (the gateway assigns/returns the session key)

### Claude's Discretion
- Exact compose input styling and height behavior
- Whether to show a "streaming" indicator in the session list while streaming
- Error handling for failed sends (retry button, error toast, etc.)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `useGatewaySSE` hook — singleton EventSource with per-event callbacks and query invalidation
- `event-bus.ts` — typed pub/sub with `GATEWAY_EVENT_MAP` mapping `'chat'` to `'gateway-chat'`
- `SessionHistoryPanel.tsx` — already renders messages with `MessageBubble` and `MarkdownBubble`
- `useSessionHistory` hook — fetches history, returns messages/hasMore/isLoading
- `queryKeys.sessionHistory(key)` and `queryKeys.gatewaySessions` for cache invalidation
- `gateway_forward()` — single chokepoint for gateway API calls
- `api.post()` — fetch wrapper with auth headers

### Established Patterns
- Optimistic updates via React Query `useMutation` with rollback
- SSE events invalidate React Query caches via `useGatewaySSE({ queryKeys: {...} })`
- Demo mode bypass via `isDemoMode()` — skip API calls in demo mode

### Integration Points
- Backend: Add `POST /api/gateway/chat/send` route to `gateway.rs`
- Frontend: Add compose UI to `SessionHistoryPanel` or `SessionsPage`
- Hook: New `useChatSend` hook for message sending + streaming state
- SSE: Wire `'chat'` events to accumulate streaming tokens

</code_context>

<specifics>
## Specific Ideas

- The compose input should auto-focus when a session is selected
- Send button should be visually prominent (accent color)
- Optimistic user message should appear immediately with no delay
- Token streaming should feel real-time — no batching or throttling

</specifics>

<deferred>
## Deferred Ideas

- Multiline input with Shift+Enter (Phase 94 — Streaming UX Polish)
- Thinking/typing indicator (Phase 94)
- Stop/abort streaming (Phase 97)
- Model selection for new sessions (Phase 95)

</deferred>
