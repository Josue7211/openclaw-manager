# Phase 93: Chat Send with Token Streaming - Research

**Researched:** 2026-03-25
**Domain:** Chat send mutation + SSE token streaming + React optimistic UI
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- User types message in compose input at the bottom of SessionHistoryPanel
- On submit (Enter key), message appears immediately as a user bubble (optimistic)
- `chat.send` called via Axum proxy with `{ sessionKey, message, deliver: true, idempotencyKey }`
- idempotencyKey is a UUID generated client-side
- Agent response tokens arrive via existing SSE event bus (`'chat'` events from gateway)
- Tokens accumulate into a streaming message that renders incrementally (not batched)
- When streaming completes (end-of-stream marker), full response is displayed as a single message
- Streaming state managed in a React hook (not global state)
- When no session is selected (or user clicks "New Chat"), first message creates the session
- Response from `chat.send` includes the new sessionKey
- After session creation, session list is invalidated to show the new session
- Backend route: `POST /api/gateway/chat/send` — calls `gateway_forward(POST, /chat/send)` with message payload
- Response format: `{ ok: true, sessionKey: string }`

### Claude's Discretion
- Exact compose input styling and height behavior
- Whether to show a "streaming" indicator in the session list while streaming
- Error handling for failed sends (retry button, error toast, etc.)

### Deferred Ideas (OUT OF SCOPE)
- Multiline input with Shift+Enter (Phase 94)
- Thinking/typing indicator (Phase 94)
- Stop/abort streaming (Phase 97)
- Model selection for new sessions (Phase 95)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CHAT-02 | User can send a message to an agent and see the response stream in real-time (chat.send with deliver:true) | Backend route pattern confirmed via gateway_forward; optimistic mutation pattern from useSessionMutations; SSE 'chat' event already flows through useGatewaySSE |
| STREAM-01 | Agent responses stream token-by-token to the frontend via SSE (not batch after completion) | SSE event bus already bridges gateway WS to frontend; 'chat' event is already in GATEWAY_EVENT_MAP; accumulator state pattern needed in new hook |
</phase_requirements>

---

## Summary

Phase 92 shipped the backend route and frontend hook for reading chat history. Phase 93 wires the write path: sending a message, receiving streaming tokens, and displaying them incrementally. All the infrastructure is already in place — the SSE bridge is running, `'chat'` events are already in the event bus map, and the mutation pattern from `useSessionMutations` is the exact template to follow.

The work splits cleanly into three pieces: (1) a new `POST /api/gateway/chat/send` Axum route in `gateway.rs` that calls `gateway_forward`, (2) a new `useChatSend` hook with optimistic insert + streaming accumulator wired to the `'chat'` SSE events, and (3) a compose input UI appended to `SessionHistoryPanel` that auto-scrolls on new tokens.

The key design insight is that `chat.send` returns immediately with `{ ok, sessionKey }` — the response tokens then arrive asynchronously as `'chat'` SSE events from the gateway WebSocket bridge. The hook must buffer these tokens in local state and append them to the message list without touching the React Query cache (which holds the persisted history). On stream completion (end-of-stream marker in the payload), the streamed content is finalized in place.

**Primary recommendation:** Use `useGatewaySSE({ events: ['chat'], onEvent: ... })` inside `useChatSend` to accumulate tokens into a `streamingMessage` local state; render this alongside the React Query history messages in `SessionHistoryPanel`.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @tanstack/react-query | ^5.x | useMutation for chat.send + cache invalidation | Already used for all mutations in this codebase (useSessionMutations pattern) |
| useGatewaySSE | local hook | Subscribe to 'chat' SSE events for token streaming | Singleton EventSource already established; 'chat' event already in GATEWAY_EVENT_MAP |
| api.post | local wrapper | POST to /api/gateway/chat/send | Standard fetch wrapper with auth headers already used everywhere |
| gateway_forward | Rust helper | Proxy chat.send to OpenClaw API | Existing single chokepoint for all gateway API calls |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| useQueryClient | @tanstack/react-query | Invalidate gatewaySessions + sessionHistory after send | Used when new session is created (first message) |
| useToast | local component | Error feedback on failed send | Already used in useSessionMutations for error states |
| isDemoMode | local lib | Skip API calls in demo mode | Must be checked in useChatSend as with all other hooks |
| crypto.randomUUID() | browser API | Generate idempotencyKey per send | Available in all modern browsers; no library needed |

**Installation:** No new dependencies required. All needed libraries are already in the project.

---

## Architecture Patterns

### Recommended Project Structure

New files for this phase:
```
frontend/src/
├── hooks/sessions/
│   ├── useChatSend.ts                        # new — send + streaming accumulator
│   └── __tests__/useChatSend.test.ts         # new — unit tests
└── pages/sessions/
    └── ChatComposeInput.tsx                  # new — compose input component

src-tauri/src/routes/
└── gateway.rs                               # modified — add POST /api/gateway/chat/send
```

### Pattern 1: Backend — gateway_forward POST Route

**What:** Add `POST /api/gateway/chat/send` that calls `gateway_forward(POST, /chat/send, body)`.
**When to use:** All gateway write operations that don't need query params use this exact pattern.
**Example** (derived from existing `compact_session` and `patch_session` patterns in `gateway.rs`):

```rust
#[derive(Debug, Deserialize)]
struct ChatSendBody {
    session_key: Option<String>,   // None for new sessions
    message: String,
    deliver: bool,
    idempotency_key: String,
}

async fn gateway_chat_send(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Json(body): Json<ChatSendBody>,
) -> Result<Json<Value>, AppError> {
    if body.message.trim().is_empty() {
        return Err(AppError::BadRequest("message cannot be empty".into()));
    }
    if body.message.len() > 32_768 {
        return Err(AppError::BadRequest("message too long".into()));
    }
    if body.idempotency_key.is_empty() || body.idempotency_key.len() > 64 {
        return Err(AppError::BadRequest("invalid idempotencyKey".into()));
    }

    let mut payload = serde_json::json!({
        "message": body.message,
        "deliver": body.deliver,
        "idempotencyKey": body.idempotency_key,
    });
    if let Some(key) = &body.session_key {
        if !key.is_empty() && key.len() <= 100 {
            payload["sessionKey"] = serde_json::Value::String(key.clone());
        }
    }

    let result = gateway_forward(&state, Method::POST, "/chat/send", Some(payload))
        .await
        .map_err(|e| {
            tracing::error!("[gateway] chat.send failed: {e:?}");
            match e {
                AppError::BadRequest(_) => e,
                _ => AppError::BadRequest("Gateway error: failed to send message".into()),
            }
        })?;

    Ok(Json(json!({ "ok": true, "data": result })))
}
```

Register in `router()`:
```rust
.route("/gateway/chat/send", post(gateway_chat_send))
```

### Pattern 2: Frontend — useChatSend Hook

**What:** Manages the full send lifecycle: optimistic insert, API call, SSE token accumulation, stream finalization.
**When to use:** Single consumer — `SessionHistoryPanel` (or `ChatComposeInput` if extracted).

```typescript
// Source: derived from useSessionMutations.ts + useGatewaySSE.ts patterns
import { useState, useRef, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import { useGatewaySSE } from '@/lib/hooks/useGatewaySSE'
import { isDemoMode } from '@/lib/demo-data'
import type { SessionHistoryMessage } from '@/pages/sessions/types'

interface StreamingMessage {
  id: string           // temp ID for the in-progress assistant message
  role: 'assistant'
  content: string      // accumulates tokens
  isStreaming: boolean
  timestamp: string
}

export interface UseChatSendReturn {
  sendMessage: (text: string) => Promise<void>
  isSending: boolean
  streamingMessage: StreamingMessage | null  // null when not streaming
  sendError: string | null
}

export function useChatSend(
  sessionKey: string | null,
  onSessionCreated?: (newKey: string) => void,
): UseChatSendReturn {
  const queryClient = useQueryClient()
  const demo = isDemoMode()
  const [isSending, setIsSending] = useState(false)
  const [streamingMessage, setStreamingMessage] = useState<StreamingMessage | null>(null)
  const [sendError, setSendError] = useState<string | null>(null)
  const streamingIdRef = useRef<string | null>(null)
  const currentSessionKeyRef = useRef<string | null>(sessionKey)
  currentSessionKeyRef.current = sessionKey

  // Subscribe to 'chat' SSE events and accumulate tokens into streamingMessage
  useGatewaySSE(demo ? undefined : {
    events: ['chat'],
    onEvent: (_eventName, payload) => {
      const p = payload as Record<string, unknown>
      const activeId = streamingIdRef.current
      if (!activeId) return

      // Token chunk
      if (p.token && typeof p.token === 'string') {
        setStreamingMessage(prev => prev
          ? { ...prev, content: prev.content + p.token }
          : null
        )
      }

      // End-of-stream
      if (p.done === true) {
        setStreamingMessage(prev => prev ? { ...prev, isStreaming: false } : null)
        streamingIdRef.current = null

        // Invalidate history so persisted messages reload
        const key = currentSessionKeyRef.current
        if (key) {
          queryClient.invalidateQueries({ queryKey: queryKeys.sessionHistory(key) })
        }
      }
    },
  })

  const sendMessage = useCallback(async (text: string) => {
    if (demo || !text.trim() || isSending) return

    setSendError(null)
    setIsSending(true)

    const idempotencyKey = crypto.randomUUID()
    const tempId = `streaming-${Date.now()}`
    streamingIdRef.current = tempId

    // Start the streaming message placeholder
    setStreamingMessage({
      id: tempId,
      role: 'assistant',
      content: '',
      isStreaming: true,
      timestamp: new Date().toISOString(),
    })

    try {
      const result = await api.post<{ ok: boolean; data?: { sessionKey?: string } }>(
        '/api/gateway/chat/send',
        {
          session_key: currentSessionKeyRef.current || null,
          message: text.trim(),
          deliver: true,
          idempotency_key: idempotencyKey,
        },
      )

      // Handle new session creation
      const newKey = result?.data?.sessionKey
      if (newKey && !currentSessionKeyRef.current) {
        currentSessionKeyRef.current = newKey
        queryClient.invalidateQueries({ queryKey: queryKeys.gatewaySessions })
        onSessionCreated?.(newKey)
      }
    } catch (err) {
      streamingIdRef.current = null
      setStreamingMessage(null)
      setSendError(err instanceof Error ? err.message : 'Failed to send message')
    } finally {
      setIsSending(false)
    }
  }, [demo, isSending, queryClient, onSessionCreated])

  return { sendMessage, isSending, streamingMessage, sendError }
}
```

### Pattern 3: Optimistic User Message + Streaming Agent Response

**What:** The compose input immediately appends the user message to the displayed list (not via React Query cache) and then shows the streaming assistant response as tokens arrive.
**When to use:** This avoids cache mutation complexity — the optimistic message is local state, not cache state.

The pattern in `SessionHistoryPanel`:
```typescript
// Local state for the currently-in-flight exchange
const [optimisticUserMsg, setOptimisticUserMsg] = useState<SessionHistoryMessage | null>(null)

const handleSend = async (text: string) => {
  const userMsg: SessionHistoryMessage = {
    id: `opt-${Date.now()}`,
    role: 'user',
    content: text,
    timestamp: new Date().toISOString(),
  }
  setOptimisticUserMsg(userMsg)
  await sendMessage(text)
  // Clear optimistic message when history reloads (after invalidation)
  setOptimisticUserMsg(null)
}

// Render order: [...messages, optimisticUserMsg, streamingMessage]
// where messages = from useSessionHistory, optimisticUserMsg and streamingMessage = local state
```

### Pattern 4: Chat SSE Event Shape

**What:** The gateway emits `'chat'` SSE events for token streaming. Based on the OpenClaw protocol v3 and the existing SSE bridge in `gateway_events.rs`, the event payload shape is:

```typescript
// Partial token during streaming:
{ token: "Hello", sessionKey: "sess-abc", agentKey: "main" }

// End of stream marker:
{ done: true, sessionKey: "sess-abc" }
```

**IMPORTANT:** The exact payload shape is LOW confidence (unverified against live gateway). The `streamingIdRef` approach guards against processing events for the wrong session — confirm the payload includes `sessionKey` and filter by it if so.

### Pattern 5: ChatComposeInput Component

```typescript
// Minimal single-line input, Enter to send
// Auto-focuses when sessionKey changes
// Disabled during isSending

interface ChatComposeInputProps {
  sessionKey: string | null
  onSend: (text: string) => void
  disabled?: boolean
}
```

Style: Fixed at bottom of `SessionHistoryPanel`'s flex column. The panel's outer container is already a flex column — compose input sits at the end (`flex-shrink: 0`).

### Anti-Patterns to Avoid
- **Storing streaming tokens in React Query cache:** The cache holds persisted history. Mixing in-flight tokens corrupts it and causes flicker on invalidation. Use local state instead.
- **Polling after send:** Do NOT setTimeout + re-fetch like the old chat handler. SSE delivers the tokens — no polling needed.
- **Single `messages` array for both history and streaming:** Keep them separate (history from useSessionHistory, optimistic/streaming from local state) and concat only for rendering. This avoids cache mutation.
- **Using window.dispatchEvent for streaming state:** The CLAUDE.md explicitly forbids DOM events for cross-component communication. Use hook return values.
- **Batching tokens before render:** STREAM-01 requires token-by-token rendering. Each SSE event must update state immediately.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Idempotency key generation | Custom UUID function | `crypto.randomUUID()` | Browser-native, cryptographically random, already available |
| SSE connection management | New EventSource | `useGatewaySSE` | Singleton already established, refcounted, auto-reconnects |
| Gateway HTTP proxy | Custom reqwest setup | `gateway_forward()` | Security-validated (path sanitization, error sanitization, auth headers) |
| Toast notifications | Custom toast state | `useToast()` | Already used in `useSessionMutations`, consistent UX |
| Message timestamp formatting | Custom date format | `new Date(ts).toLocaleTimeString(...)` | Already the pattern in `MessageBubble` |

**Key insight:** The streaming infrastructure is already complete. `gateway_events.rs` bridges the gateway WS to SSE, `useGatewaySSE` consumes it, and `'chat'` is already in `GATEWAY_EVENT_MAP`. This phase only adds: (1) a new backend POST route, (2) a hook that wires SSE callbacks to local state, and (3) a compose UI.

---

## Common Pitfalls

### Pitfall 1: validate_gateway_path rejects query params
**What goes wrong:** Calling `gateway_forward` with `/chat/send` works fine (no `?` or `..`), but if someone tries to add query params to the path string, the validator rejects it.
**Why it happens:** `validate_gateway_path` explicitly rejects `?` in path strings (security: prevents query injection).
**How to avoid:** Always put params in the JSON body for POST routes. Session history had to use `state.http` directly because of query params — `chat.send` is a POST with a JSON body, so `gateway_forward` works correctly.
**Warning signs:** `AppError::BadRequest("invalid gateway path")` returned from the Axum layer.

### Pitfall 2: Chat SSE event payload shape unknown
**What goes wrong:** The token accumulator reads `p.token` and `p.done` but the actual gateway may emit differently shaped events.
**Why it happens:** OpenClaw's `'chat'` event payload format is not explicitly documented in our memory files — only that the event is named `'chat'`.
**How to avoid:** Add defensive parsing with optional chaining. Log the raw payload in a `console.debug` call during initial testing so the actual shape can be observed. Be prepared for formats like `{ type: 'token', content: '...' }` or `{ delta: '...' }`.
**Warning signs:** `streamingMessage.content` stays empty despite the send succeeding.

### Pitfall 3: Auto-scroll breaks on token append
**What goes wrong:** Each token update (`setStreamingMessage`) triggers a re-render which may or may not scroll to bottom, depending on whether the user has scrolled up.
**Why it happens:** `SessionHistoryPanel` currently auto-scrolls only on initial load (`limit === 50`). Streaming tokens need their own scroll logic.
**How to avoid:** Track whether the user is "pinned to bottom" (scrollTop near scrollHeight). If pinned, scroll on every token append. If user has scrolled up, don't scroll (they're reading history). A `useEffect` watching `streamingMessage?.content` handles this.
**Warning signs:** New tokens appear but view doesn't scroll; or view snaps to bottom interrupting history reading.

### Pitfall 4: useGatewaySSE called conditionally breaks React rules
**What goes wrong:** Wrapping `useGatewaySSE` in an `if (sessionKey)` guard violates React hooks rules.
**Why it happens:** Hooks cannot be called conditionally per React rules.
**How to avoid:** Always call `useGatewaySSE` — use `demo ? undefined : { ... }` to disable callbacks conditionally (same pattern as `useGatewaySessions`). Use `streamingIdRef` to guard the callback: if no active stream, ignore events.
**Warning signs:** React error "rendered more hooks than previous render."

### Pitfall 5: New session sessionKey extraction
**What goes wrong:** When `sessionKey` is null (new chat), `chat.send` creates a session and returns the new key. But the frontend `selectedId` state in `SessionsPage` still points to `null`, so the compose input keeps showing "new chat" mode after the first message.
**Why it happens:** `SessionsPage` controls `selectedId` — it must be updated when a new session is created.
**How to avoid:** The `onSessionCreated` callback in `useChatSend` calls up to `SessionsPage` to `setSelectedId(newKey)`. The planner must wire this callback through `SessionHistoryPanel` props.
**Warning signs:** After first message in a new session, the session list shows the new session but it's not selected; history panel still shows "no session selected."

### Pitfall 6: Optimistic message cleared too early
**What goes wrong:** `setOptimisticUserMsg(null)` called after `sendMessage` resolves (POST completes), but history hasn't reloaded yet. Brief flash of missing user message.
**Why it happens:** History invalidation is async — the query refetches after invalidation, not immediately.
**How to avoid:** Clear `optimisticUserMsg` in the React Query `onSuccess` of the history refetch, OR keep it until `streamingMessage?.isStreaming === false` (stream complete). Simplest: clear on stream done when history also reloads.
**Warning signs:** User message briefly disappears then reappears.

---

## Code Examples

Verified patterns from the existing codebase:

### Existing mutation pattern (from useSessionMutations.ts)
```typescript
// Source: frontend/src/hooks/sessions/useSessionMutations.ts
const deleteMutation = useMutation({
  mutationFn: (key: string) => api.del(`/api/gateway/sessions/${key}`),
  onError: (_err, _key, ctx) => {
    toast.show({ type: 'error', message: 'Failed to delete session' })
  },
  onSettled: () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.gatewaySessions })
  },
})
```

### Existing SSE subscription pattern (from useGatewaySessions.ts)
```typescript
// Source: frontend/src/hooks/sessions/useGatewaySessions.ts
useGatewaySSE(demo ? undefined : {
  events: ['chat'],
  queryKeys: {
    chat: queryKeys.gatewaySessions,
  },
})
```

### Per-event callback pattern (from useGatewaySSE.ts)
```typescript
// Source: frontend/src/lib/hooks/useGatewaySSE.ts
useGatewaySSE({
  events: ['chat'],
  onEvent: (eventName, payload) => {
    // payload is the parsed JSON from the SSE data field
    // eventName is the SSE event type (e.g., 'chat')
  },
})
```

### Existing gateway_forward POST pattern (from gateway.rs)
```rust
// Source: src-tauri/src/routes/gateway.rs (patch_session handler)
let payload = gateway_forward(
    &state,
    Method::PATCH,
    &format!("/sessions/{key}"),
    Some(json!({ "label": label })),
)
.await
.map_err(|e| {
    tracing::error!("[gateway] session patch failed: {e:?}");
    match e {
        AppError::BadRequest(_) => e,
        _ => AppError::BadRequest("Gateway error: failed to rename session".into()),
    }
})?;
Ok(Json(json!({ "ok": true, "data": payload })))
```

### Auto-scroll to bottom pattern (from SessionHistoryPanel.tsx)
```typescript
// Source: frontend/src/pages/sessions/SessionHistoryPanel.tsx
const scrollRef = useRef<HTMLDivElement>(null)

useEffect(() => {
  if (scrollRef.current && messages.length > 0 && limit === 50) {
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }
}, [messages, limit])
```

### SessionHistoryPanel current layout structure
```typescript
// Source: frontend/src/pages/sessions/SessionHistoryPanel.tsx
// The SessionHistoryView component renders:
// 1. A scrollable div (ref={scrollRef}) with flex-direction: column, flex: 1, overflow-y: auto
// 2. The compose input must be added OUTSIDE this scrollable div, as a sibling
// The outer container needs to become: display: flex; flex-direction: column; height: 100%
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Polling after send (chat.rs pattern) | SSE streaming via gateway WS bridge | Phase 85 shipped SSE bridge | Token-by-token delivery instead of full response on completion |
| New session required before chat.send | chat.send creates session implicitly | Protocol v3 behavior | No separate create step needed |
| WebSocket RPC for writes | HTTP POST via gateway_forward | Phase 9 decision | Avoids 5xx retry on writes |

**Deprecated/outdated:**
- `sessions.send` — does not exist in OpenClaw protocol v3. The correct method is `chat.send`.
- `sessions.history` — does not exist. The correct method is `chat.history` (already proxied as `/api/gateway/sessions/:key/history` in Phase 92).
- setTimeout + re-fetch pattern (used in old messages code) — do NOT apply here. SSE delivers tokens.

---

## Open Questions

1. **Exact shape of the `'chat'` SSE event payload**
   - What we know: `'chat'` is a named event that flows through the SSE bridge from the gateway WS. It's already in `GATEWAY_EVENT_MAP`. The gateway forwards it with `event: "chat"` and the payload verbatim from the WS frame.
   - What's unclear: Does the payload have `{ token: "...", done: false }` or `{ delta: "...", finish_reason: null }` or some other shape? Is there a `sessionKey` field to filter by?
   - Recommendation: Add `console.debug('[chat-sse]', payload)` inside the `onEvent` callback during development. The planner should add defensive parsing (`p?.token ?? p?.delta ?? p?.content` etc.) and the executor should observe the actual shape on first run.

2. **New session key from chat.send response**
   - What we know: The protocol spec says `chat.send` includes `{ sessionKey, message, deliver, idempotencyKey }` params and the gateway "assigns/returns the session key."
   - What's unclear: Is the sessionKey in the response body at `result.sessionKey` or `result.data.sessionKey`? The gateway_forward wrapper wraps responses in `{ ok, data }` — so it would be `result.data.sessionKey`.
   - Recommendation: The backend should pass through the raw gateway response so the frontend can extract `sessionKey` from wherever it appears.

3. **Stream completion signal**
   - What we know: Protocol docs say streaming completes with an end-of-stream marker in the chat event.
   - What's unclear: Is it `{ done: true }` or `{ finish_reason: "stop" }` or `{ type: "done" }`?
   - Recommendation: Handle multiple possible end-of-stream shapes defensively. Planner should specify: treat the stream as complete if `p.done === true || p.finish_reason === 'stop' || p.type === 'done'`.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (frontend), cargo test (Rust) |
| Config file | `frontend/vite.config.ts` (vitest config inline) |
| Quick run command | `cd /home/josue/Documents/projects/mission-control/frontend && npx vitest run hooks/sessions/__tests__/useChatSend.test.ts -x` |
| Full suite command | `cd /home/josue/Documents/projects/mission-control/frontend && npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CHAT-02 | chat.send is called with correct payload | unit | `npx vitest run hooks/sessions/__tests__/useChatSend.test.ts -x` | Wave 0 |
| CHAT-02 | Optimistic user message appears immediately | unit | `npx vitest run hooks/sessions/__tests__/useChatSend.test.ts -x` | Wave 0 |
| CHAT-02 | On error, sendError is set and streaming cleared | unit | `npx vitest run hooks/sessions/__tests__/useChatSend.test.ts -x` | Wave 0 |
| CHAT-02 | New session key from response triggers onSessionCreated | unit | `npx vitest run hooks/sessions/__tests__/useChatSend.test.ts -x` | Wave 0 |
| STREAM-01 | SSE 'chat' tokens accumulate into streamingMessage.content | unit | `npx vitest run hooks/sessions/__tests__/useChatSend.test.ts -x` | Wave 0 |
| STREAM-01 | done=true finalizes stream (isStreaming false) | unit | `npx vitest run hooks/sessions/__tests__/useChatSend.test.ts -x` | Wave 0 |
| STREAM-01 | History invalidated on stream complete | unit | `npx vitest run hooks/sessions/__tests__/useChatSend.test.ts -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd /home/josue/Documents/projects/mission-control/frontend && npx vitest run hooks/sessions/__tests__/useChatSend.test.ts -x`
- **Per wave merge:** `cd /home/josue/Documents/projects/mission-control/frontend && npx vitest run`
- **Phase gate:** Full suite green + browser verification before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `frontend/src/hooks/sessions/__tests__/useChatSend.test.ts` — covers CHAT-02 + STREAM-01 (7 tests)
- [ ] No new fixture files needed — follows existing `useSessionMutations.test.ts` pattern exactly

---

## Sources

### Primary (HIGH confidence)
- `src-tauri/src/routes/gateway.rs` — existing `gateway_forward`, `patch_session`, `compact_session` handler patterns; `validate_gateway_path` constraints
- `src-tauri/src/routes/gateway_events.rs` — SSE bridge implementation; `'chat'` event flows through unchanged
- `frontend/src/lib/hooks/useGatewaySSE.ts` — singleton SSE hook; `onEvent` callback interface
- `frontend/src/hooks/sessions/useSessionMutations.ts` — mutation pattern (useMutation + optimistic + toast)
- `frontend/src/pages/sessions/SessionHistoryPanel.tsx` — existing message rendering; scroll behavior; component structure to extend
- `frontend/src/lib/event-bus.ts` — `GATEWAY_EVENT_MAP` confirms `'chat'` -> `'gateway-chat'` mapping
- `memory/reference_openclaw_complete.md` — `chat.send` params: `{ sessionKey, message, deliver, idempotencyKey }`; 88 RPC methods

### Secondary (MEDIUM confidence)
- `frontend/src/hooks/messages/useMessageCompose.ts` — compose input UX pattern; optimistic message insertion; sending state management
- CONTEXT.md locked decisions — response format `{ ok, sessionKey }`, idempotencyKey UUID, SSE accumulation approach

### Tertiary (LOW confidence)
- Exact `'chat'` SSE event payload shape — unverified against live gateway; requires first-run observation
- Stream completion marker format (`done: true` vs `finish_reason`) — inferred from general SSE streaming conventions, not confirmed

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries are existing project dependencies, no new deps needed
- Architecture: HIGH — backend route pattern is copy-paste from existing handlers; frontend hook pattern is derived directly from `useGatewaySSE` + `useSessionMutations`
- Pitfalls: HIGH for infrastructure pitfalls (validate_gateway_path, React hooks rules), MEDIUM for streaming payload shape (unverified)

**Research date:** 2026-03-25
**Valid until:** 2026-04-25 (stable infrastructure; OpenClaw protocol v3 is stable)
