# Phase 16: Session Monitor Frontend - Research

**Researched:** 2026-03-23
**Domain:** React page for monitoring Claude Code sessions with real-time output streaming (xterm.js reuse)
**Confidence:** HIGH

## Summary

Phase 16 builds the frontend for the Claude Code session monitor -- a full-page split-pane layout showing all active/recent sessions in a card list with a live terminal-style output viewer powered by xterm.js. The codebase already has every building block needed: the Phase 15 backend (`claude_sessions.rs`) exposes REST endpoints at `/api/claude-sessions` and WebSocket streaming at `/api/claude-sessions/:id/ws`, the Phase 14 terminal widget provides `useTerminal`, `buildThemeFromCSS`, and the `terminal-container` CSS class, and the agents page (`pages/agents/`) provides the exact split-pane layout pattern (list + detail panel).

The primary challenge is adapting `useTerminal` from an interactive PTY terminal to a read-only session output viewer. The existing hook sends `{ type: "input" }` and `{ type: "resize" }` JSON messages to the terminal PTY backend, but the session WebSocket relay (`claude_sessions.rs`) forwards raw text/binary frames from the OpenClaw session stream. The session output hook should be simpler: connect to the session WebSocket, write incoming text frames to xterm.js, and handle no user input (read-only). A separate `useSessionOutput` hook is the right approach -- it reuses `Terminal` + `FitAddon` but removes the input handlers and resize protocol.

**Primary recommendation:** Build a new `Sessions` page at `pages/sessions/` following the Notes/Agents split-pane pattern. Create a `useSessionOutput` hook adapted from `useTerminal` (read-only, no input forwarding, no resize protocol). Use React Query with 5-second polling for the session list. React Query invalidation on session mutations (create/kill) provides immediate UI updates without WebSocket on the list endpoint.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Session list in a card grid layout -- each card shows task, status badge, duration, model
- Status badges use existing CSS color vars: running=green, paused=amber, completed=blue, failed=red
- Clicking a card opens a split-pane output viewer (Notes.tsx pattern from Phase 10)
- Output viewer reuses xterm.js Terminal from Phase 14 -- connects to `/api/claude-sessions/:id/ws`
- Responsive: cards stack on small viewports, split-pane collapses to full-width
- "New Session" button opens inline form: task textarea + optional working dir + model select
- Pause/Resume/Kill buttons on each session card (disabled when inapplicable)
- Kill shows confirmation inline (not modal) -- matches Phase 10 agent lifecycle pattern
- Controls disabled (not hidden) when OpenClaw is unreachable
- WebSocket connection to session output stream (reuses `useTerminal` hook pattern from Phase 14)
- Session list polls `/api/claude-sessions` every 5 seconds via React Query (consistent with dashboard polling)
- Status transitions trigger React Query invalidation for immediate UI update
- No SSE -- REST polling + WebSocket output is simpler and proven

### Claude's Discretion
- Component file organization and hook structure
- Animation and transition details
- Empty state design
- Error message wording

### Deferred Ideas (OUT OF SCOPE)
- Session history/replay for completed sessions
- Token usage and cost display per session
- Structured output parsing (tool calls, code blocks highlighted)
- Multi-select session operations (bulk kill)
- Session search/filter
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| MH-26 | Live dashboard showing all active Claude Code sessions with real-time status. Each session shows: task description, status (running/paused/completed/failed), duration, model. Live terminal-style output viewer per session (reuses xterm.js). Session controls: spawn, pause, resume, kill. Auto-updates via WebSocket. | Backend API fully implemented in Phase 15 (`claude_sessions.rs`). xterm.js + `buildThemeFromCSS` from Phase 14. Split-pane pattern from `Notes.tsx`/`AgentDetailPanel.tsx`. React Query polling at 5s interval. Session creation via `POST /api/claude-sessions`. Kill via `POST /api/claude-sessions/:id/kill`. WebSocket output at `/api/claude-sessions/:id/ws`. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 18/19 | UI components | Already installed |
| @tanstack/react-query | existing | Session list polling, mutation cache invalidation | Already installed, centralized in `query-keys.ts` |
| @xterm/xterm | 6.0.0 | Session output terminal emulation | Already installed (Phase 14), vite chunk configured |
| @xterm/addon-fit | 0.11.0 | Fit terminal to container | Already installed (Phase 14) |
| @xterm/addon-web-links | 0.12.0 | Clickable URLs in output | Already installed (Phase 14) |
| @phosphor-icons/react | existing | Icons for buttons and status indicators | Already installed, used throughout app |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| react-router-dom | existing | Route registration | Lazy-loaded page at `/sessions` |
| lib/api.ts | existing | Fetch wrapper with auth | All API calls to `/api/claude-sessions/*` |

**No new dependencies required.** Everything needed is already installed.

## Architecture Patterns

### Recommended Project Structure
```
frontend/src/
├── pages/
│   └── sessions/
│       ├── SessionsPage.tsx       # Main page: split-pane layout (list + output viewer)
│       ├── SessionCard.tsx        # Individual session card (React.memo)
│       ├── SessionList.tsx        # Scrollable card list + "New Session" button
│       ├── SessionOutputPanel.tsx # xterm.js output viewer for selected session
│       ├── NewSessionForm.tsx     # Inline create form (task + workingDir + model)
│       └── types.ts               # Session, SessionStatus, CreateSessionPayload
├── hooks/
│   └── sessions/
│       └── useSessionOutput.ts    # Read-only xterm.js WebSocket hook (adapted from useTerminal)
```

### Pattern 1: Split-Pane Page (Notes.tsx / Agents pattern)
**What:** Full-bleed page with resizable left list panel and right detail panel.
**When to use:** The sessions page layout.
**Example (from Notes.tsx):**
```typescript
// Source: frontend/src/pages/notes/Notes.tsx
return (
  <div style={{
    position: 'absolute', inset: 0,
    margin: '-20px -28px',
    display: 'flex', overflow: 'hidden',
  }}>
    {/* Left panel (session list) */}
    <div style={{ width: treeWidth, minWidth: treeWidth, borderRight: '1px solid var(--border)' }}>
      <SessionList ... />
    </div>
    {/* Resize handle */}
    <div onMouseDown={handleResize} role="separator" aria-orientation="vertical" ... />
    {/* Right panel (output viewer) */}
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <SessionOutputPanel ... />
    </div>
  </div>
)
```

### Pattern 2: Session Card with Status Badge (AgentCard pattern)
**What:** `React.memo` card component with status indicator dot and badge.
**When to use:** Each session in the list.
**Example (from AgentCard.tsx):**
```typescript
// Source: frontend/src/pages/agents/AgentCard.tsx
export const SessionCard = React.memo(function SessionCard({ session, selected, onSelect }: SessionCardProps) {
  return (
    <button type="button" onClick={onSelect} aria-pressed={selected} style={{
      background: selected ? 'var(--active-bg)' : 'var(--bg-card)',
      border: `1px solid ${selected ? 'var(--accent)44' : 'var(--border)'}`,
      borderRadius: '16px', padding: '14px 16px',
      width: '100%', textAlign: 'left', cursor: 'pointer',
    }}>
      <StatusBadge status={session.status} />
      <span>{session.task}</span>
      <span style={{ fontFamily: 'monospace', fontSize: '10px' }}>{session.model}</span>
    </button>
  )
})
```

### Pattern 3: Read-Only Terminal Output (adapted useTerminal)
**What:** `useSessionOutput` hook that connects xterm.js to a WebSocket and writes incoming frames.
**When to use:** The output viewer panel.
**Key differences from `useTerminal`:**
- No `onData` / `onBinary` handlers (read-only -- no user input to the session stream)
- No `{ type: "resize" }` protocol (session output streams are raw text, not PTY-aware)
- No `{ type: "input" }` protocol
- WebSocket URL is `/api/claude-sessions/:id/ws` (not `/api/terminal/ws`)
- Pre-flight check uses `/api/claude-sessions/status` (not `/api/terminal/status`)
- Copy-paste Ctrl+Shift+C works for copying output (no paste needed)
- Session ID is a parameter that changes when user selects different sessions

```typescript
// Adapted from frontend/src/hooks/useTerminal.ts
export function useSessionOutput(
  containerRef: React.RefObject<HTMLDivElement | null>,
  sessionId: string | null,
  options?: { fontSize?: number }
): { connected: boolean; error: string | null } {
  // Create Terminal on mount (same as useTerminal)
  // Connect WebSocket to /api/claude-sessions/{sessionId}/ws
  // Write incoming text frames to term (read-only)
  // No onData/onBinary handlers (no user input)
  // Reconnect when sessionId changes
  // Dispose on unmount
}
```

### Pattern 4: Lifecycle Controls (AgentDetailPanel disabled-not-hidden pattern)
**What:** Buttons that are disabled (not hidden) when the OpenClaw backend is unreachable.
**When to use:** Kill, pause, resume buttons on session cards / detail panel.
**Example (from AgentDetailPanel.tsx):**
```typescript
// Source: frontend/src/pages/agents/AgentDetailPanel.tsx
<button
  type="button"
  onClick={() => onKill(session.id)}
  disabled={!openclawHealthy}
  aria-label="Kill session"
  title={openclawHealthy ? 'Kill session' : 'OpenClaw not connected'}
  style={{
    opacity: openclawHealthy ? 1 : 0.4,
    cursor: openclawHealthy ? 'pointer' : 'not-allowed',
  }}
  className={openclawHealthy ? 'hover-bg' : undefined}
>
```

### Pattern 5: React Query with Polling (dashboard pattern)
**What:** `useQuery` with `refetchInterval: 5000` for session list auto-refresh.
**When to use:** The session list data fetching.
```typescript
const { data, isLoading, error } = useQuery({
  queryKey: queryKeys.claudeSessions,
  queryFn: () => api.get<SessionListResponse>('/api/claude-sessions'),
  refetchInterval: 5000,
})
```

### Anti-Patterns to Avoid
- **Using `useTerminal` directly for session output:** The existing hook sends `{ type: "input" }` and `{ type: "resize" }` JSON messages that the session WebSocket relay doesn't understand. Build a separate `useSessionOutput` hook.
- **WebSocket for session list updates:** The CONTEXT.md explicitly says "Session list polls `/api/claude-sessions` every 5 seconds via React Query" -- do not build a WebSocket subscription for list updates.
- **Custom DOM events for status transitions:** Use React Query `invalidateQueries` after mutations (create/kill), not `window.dispatchEvent`.
- **`div onClick` for cards:** Must use `<button>` with `aria-pressed` for accessibility.
- **Hardcoded status colors:** Use CSS variables: `--green-400` (running), `--amber` (paused), `--blue` (completed), `--red-500` (failed).
- **Auto-focus on terminal mount:** Use click-to-focus pattern (consistent with TerminalWidget.tsx).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Terminal emulation | Canvas/DOM text rendering | xterm.js `Terminal` | Battle-tested, handles ANSI codes, scrollback, selection |
| Terminal theme sync | Manual color extraction | `buildThemeFromCSS()` from `terminal-theme.ts` | Already reads CSS vars, handles theme changes |
| Terminal fit to container | Manual cols/rows calculation | `FitAddon.fit()` + `ResizeObserver` | Handles font metrics, DPR, subpixel rendering |
| API fetching | Raw `fetch()` calls | `api.get()` / `api.post()` from `lib/api.ts` | Auth headers, timeout, error handling, offline queue |
| Data caching/polling | Manual setInterval + useState | React Query `useQuery` with `refetchInterval` | Dedup, cache, background refresh, error retry |
| Status duration display | Manual timer interval | `SecondsAgo` component or `useEffect` with interval | Already handles tick coalescing across instances |
| Resize handle | Custom drag implementation | Copy resize handler from `Notes.tsx` | Tested, handles cursor, user-select, min/max bounds |

**Key insight:** This phase is almost entirely assembly of existing patterns. The only genuinely new code is `useSessionOutput` (adapted from `useTerminal`) and `NewSessionForm`. Everything else follows proven patterns from Notes, Agents, and Dashboard pages.

## Common Pitfalls

### Pitfall 1: Sending Input/Resize to Session WebSocket
**What goes wrong:** The output viewer sends `{ type: "input" }` or `{ type: "resize" }` JSON messages to the session WebSocket, which relays them to the upstream OpenClaw session stream. The upstream doesn't expect these frame types and may error or ignore them silently.
**Why it happens:** Copy-pasting `useTerminal` without removing the input handlers.
**How to avoid:** Build `useSessionOutput` without `onData`, `onBinary`, or `onResize` handlers. The session WebSocket is read-only from the client perspective -- data only flows upstream->client. The client may send commands in the future (pause/resume), but those go through REST endpoints, not the output WebSocket.
**Warning signs:** Console errors or "unknown message type" in backend logs.

### Pitfall 2: Terminal Not Disposing on Session Switch
**What goes wrong:** User clicks a different session card, but the xterm.js Terminal instance from the previous session persists, leaking memory and leaving a stale WebSocket connection.
**Why it happens:** `useEffect` deps don't include `sessionId`, so the effect doesn't re-run when the selected session changes.
**How to avoid:** Include `sessionId` in the `useEffect` dependency array. On cleanup, dispose the Terminal and close the WebSocket. On re-run, create a fresh Terminal and WebSocket for the new session. Alternatively, use a `key={sessionId}` on the output panel component to force unmount/remount.
**Warning signs:** Multiple WebSocket connections visible in DevTools Network tab, growing memory usage.

### Pitfall 3: Stale Session List After Mutation
**What goes wrong:** User creates or kills a session, but the list doesn't update for up to 5 seconds (the polling interval).
**Why it happens:** React Query only refetches on interval; mutations don't automatically invalidate.
**How to avoid:** Call `queryClient.invalidateQueries({ queryKey: queryKeys.claudeSessions })` in the `onSuccess` callback of `useMutation` for create and kill operations. This triggers an immediate refetch.
**Warning signs:** "I created a session but it didn't appear" -- the 5-second delay confuses users.

### Pitfall 4: user-select: none Breaks Terminal Selection
**What goes wrong:** Users can't select text in the xterm.js output viewer.
**Why it happens:** `globals.css` sets `user-select: none` on `*`. Phase 14 solved this with `.terminal-container .xterm { user-select: text }`.
**How to avoid:** Use the `terminal-container` CSS class on the output viewer container div. This is already defined in globals.css and overrides the global `user-select: none`.
**Warning signs:** Text selection cursor doesn't appear in the terminal output area.

### Pitfall 5: Session Status Not Mapping to CSS Variables
**What goes wrong:** Status badges show wrong colors or use hardcoded values.
**Why it happens:** The backend returns status strings like "running", "paused", "completed", "failed" -- these need to be mapped to CSS variable names.
**How to avoid:** Create a `STATUS_COLORS` map: `{ running: 'var(--green-400)', paused: 'var(--amber)', completed: 'var(--blue)', failed: 'var(--red-500)', unknown: 'var(--text-muted)' }`. Use this in the `StatusBadge` component.
**Warning signs:** Color inconsistency with the rest of the app, theme blend slider not affecting status colors.

### Pitfall 6: Missing Module Registration
**What goes wrong:** The Sessions page works at `/sessions` but doesn't appear in the sidebar.
**Why it happens:** The page route is added to `main.tsx` but the module isn't registered in `lib/modules.ts`.
**How to avoid:** Add to `APP_MODULES` in `modules.ts`: `{ id: 'sessions', name: 'Sessions', description: 'Claude Code session monitor', icon: 'Terminal', route: '/sessions' }`. Also add the query key to `query-keys.ts`.
**Warning signs:** Page accessible by direct URL but not visible in sidebar.

## Code Examples

### Example 1: Session Types
```typescript
// Source: Derived from backend claude_sessions.rs response shapes
export type SessionStatus = 'running' | 'paused' | 'completed' | 'failed' | 'unknown'

export interface ClaudeSession {
  id: string
  task: string
  status: SessionStatus
  model: string | null
  workingDir: string | null
  startedAt: string | null
  duration: number | null  // seconds
  kind: string
  agentId?: string
  [key: string]: unknown  // forward-compatible with unknown API shapes
}

export interface SessionListResponse {
  sessions: ClaudeSession[]
  available?: boolean  // false when OpenClaw is unreachable
  error?: string
}

export interface CreateSessionPayload {
  task: string
  model?: string
  workingDir?: string
}
```

### Example 2: Query Keys Addition
```typescript
// Addition to frontend/src/lib/query-keys.ts
claudeSessions: ['claude-sessions'] as const,
claudeSessionDetail: (id: string) => ['claude-sessions', id] as const,
claudeSessionStatus: ['claude-sessions', 'status'] as const,
```

### Example 3: Session List Hook with React Query
```typescript
// Source: Pattern from existing useQuery usage throughout codebase
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import type { SessionListResponse, CreateSessionPayload } from './types'

export function useSessionList() {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: queryKeys.claudeSessions,
    queryFn: () => api.get<SessionListResponse>('/api/claude-sessions'),
    refetchInterval: 5000,
  })

  const createMutation = useMutation({
    mutationFn: (payload: CreateSessionPayload) =>
      api.post('/api/claude-sessions', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.claudeSessions })
    },
  })

  const killMutation = useMutation({
    mutationFn: (id: string) =>
      api.post(`/api/claude-sessions/${id}/kill`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.claudeSessions })
    },
  })

  return {
    sessions: query.data?.sessions ?? [],
    isLoading: query.isLoading,
    available: query.data?.available !== false,
    error: query.data?.error ?? null,
    createSession: createMutation.mutate,
    killSession: killMutation.mutate,
    isCreating: createMutation.isPending,
    isKilling: killMutation.isPending,
  }
}
```

### Example 4: useSessionOutput Hook (Read-Only Terminal)
```typescript
// Adapted from frontend/src/hooks/useTerminal.ts
import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { API_BASE } from '@/lib/api'
import { buildThemeFromCSS } from '@/lib/terminal-theme'

interface UseSessionOutputReturn {
  connected: boolean
  error: string | null
}

export function useSessionOutput(
  containerRef: React.RefObject<HTMLDivElement | null>,
  sessionId: string | null,
  options?: { fontSize?: number }
): UseSessionOutputReturn {
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fontSize = options?.fontSize ?? 13

  useEffect(() => {
    const container = containerRef.current
    if (!container || !sessionId) return

    let mounted = true
    let term: Terminal | null = null
    let ws: WebSocket | null = null
    let fitAddon: FitAddon | null = null
    let resizeObserver: ResizeObserver | null = null
    let themeObserver: MutationObserver | null = null

    // Create terminal (read-only)
    fitAddon = new FitAddon()
    const webLinksAddon = new WebLinksAddon()

    term = new Terminal({
      cursorStyle: 'bar',
      cursorBlink: false,  // read-only, no cursor blink
      fontSize,
      fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
      scrollback: 5000,    // more scrollback for session output
      theme: buildThemeFromCSS(),
      allowProposedApi: true,
      disableStdin: true,  // read-only
    })

    term.loadAddon(fitAddon)
    term.loadAddon(webLinksAddon)
    term.open(container)

    // Copy-only via Ctrl+Shift+C
    term.attachCustomKeyEventHandler((event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.code === 'KeyC' && event.type === 'keydown') {
        const selection = term?.getSelection()
        if (selection) {
          navigator.clipboard.writeText(selection)
          return false
        }
      }
      return true
    })

    requestAnimationFrame(() => {
      if (!mounted) return
      fitAddon?.fit()
    })

    // WebSocket for session output stream
    const wsBase = API_BASE.replace(/^http/, 'ws')
    ws = new WebSocket(`${wsBase}/api/claude-sessions/${sessionId}/ws`)
    let didOpen = false

    ws.onopen = () => {
      if (!mounted) { ws?.close(); return }
      didOpen = true
      setConnected(true)
      setError(null)
    }

    ws.onmessage = (event) => {
      if (!mounted) return
      if (typeof event.data === 'string') {
        try {
          const msg = JSON.parse(event.data)
          if (msg.error) { setError(msg.error); return }
        } catch { /* not JSON, write as text */ }
        term?.write(event.data)
      }
    }

    ws.onclose = (event) => {
      if (!mounted) return
      setConnected(false)
      if (!didOpen && event.code === 1006) {
        setError('Session output connection failed')
      }
    }

    // ResizeObserver for container fitting
    resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        if (!mounted || !fitAddon) return
        fitAddon.fit()
      })
    })
    resizeObserver.observe(container)

    // Theme sync
    themeObserver = new MutationObserver(() => {
      if (term) term.options.theme = buildThemeFromCSS()
    })
    themeObserver.observe(document.documentElement, {
      attributes: true, attributeFilter: ['data-theme', 'style'],
    })

    return () => {
      mounted = false
      themeObserver?.disconnect()
      resizeObserver?.disconnect()
      if (ws) { ws.onclose = null; ws.close() }
      term?.dispose()
    }
  }, [sessionId]) // Re-run when sessionId changes

  return { connected, error }
}
```

### Example 5: Status Badge Component
```typescript
const STATUS_COLORS: Record<string, string> = {
  running: 'var(--green-400)',
  paused: 'var(--amber)',
  completed: 'var(--blue)',
  failed: 'var(--red-500)',
  unknown: 'var(--text-muted)',
}

const STATUS_BG: Record<string, string> = {
  running: 'var(--green-400)',
  paused: 'var(--amber)',
  completed: 'var(--blue)',
  failed: 'var(--red-500)',
  unknown: 'var(--text-muted)',
}

function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? STATUS_COLORS.unknown
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '6px',
      fontSize: '10px', fontWeight: 700,
      color, textTransform: 'uppercase',
    }}>
      <span style={{
        width: '6px', height: '6px', borderRadius: '50%',
        background: color,
        animation: status === 'running' ? 'pulse-dot 1.5s ease-in-out infinite' : 'none',
      }} />
      {status}
    </span>
  )
}
```

### Example 6: Module Registration
```typescript
// Addition to frontend/src/lib/modules.ts APP_MODULES array
{ id: 'sessions', name: 'Sessions', description: 'Claude Code session monitor', icon: 'Terminal', route: '/sessions', requiresConfig: ['OPENCLAW_API_URL'] },
```

### Example 7: Route Registration
```typescript
// Addition to frontend/src/main.tsx
const Sessions = lazy(() => import('./pages/sessions/SessionsPage'))
// ...
<Route path="/sessions" element={<Suspense fallback={<GenericPageSkeleton />}><Sessions /></Suspense>} />
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Terminal PTY interactive hook | Adapted read-only session output hook | Phase 16 (new) | No input forwarding, simpler WebSocket protocol |
| Custom terminal rendering | xterm.js v6 with `@xterm/xterm` | Phase 14 | Consistent terminal rendering across terminal and session output |
| Manual API polling | React Query `refetchInterval: 5000` | Established pattern | Automatic dedup, cache, error retry |

**Deprecated/outdated:**
- None -- this phase uses current patterns

## Open Questions

1. **Pause/Resume API endpoints**
   - What we know: The backend (`claude_sessions.rs`) has `kill_session` but no explicit pause/resume handlers. The CONTEXT.md mentions "Pause/Resume/Kill buttons."
   - What's unclear: Whether the OpenClaw gateway exposes pause/resume endpoints for Claude Code sessions. The backend would need to add these if they exist upstream.
   - Recommendation: Build the UI with disabled pause/resume buttons labeled "coming soon" or wire them to future endpoints. Kill is functional via `POST /api/claude-sessions/:id/kill`. The frontend should have the button placeholders so the UI is complete even if pause/resume are not yet backend-supported.

2. **Session duration calculation**
   - What we know: The backend may return `startedAt` timestamp and/or `duration` field.
   - What's unclear: Whether duration is pre-calculated by the backend or needs client-side calculation from `startedAt`.
   - Recommendation: If the response includes `duration` (seconds), use it directly. Otherwise, calculate from `startedAt` using a live-updating timer (similar to `SecondsAgo` component pattern). Support both approaches defensively.

3. **OpenClaw health check for disabling controls**
   - What we know: The session list response includes `available: false` when OpenClaw is unreachable. Agent controls use a separate health check.
   - What's unclear: Whether to use the session list `available` field or a separate `/api/claude-sessions/status` check.
   - Recommendation: Use the `available` field from the session list response. This is already fetched every 5 seconds and avoids an extra API call. When `available === false`, disable all mutation controls.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.x with jsdom |
| Config file | frontend/vitest.config.ts |
| Quick run command | `cd /mnt/storage/projects/mission-control/frontend && npx vitest run src/pages/sessions` |
| Full suite command | `cd /mnt/storage/projects/mission-control/frontend && npx vitest run` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MH-26-a | Session types are structurally valid | unit | `cd frontend && npx vitest run src/pages/sessions/__tests__/types.test.ts -x` | Wave 0 |
| MH-26-b | Status color mapping covers all statuses | unit | `cd frontend && npx vitest run src/pages/sessions/__tests__/types.test.ts -x` | Wave 0 |
| MH-26-c | Session list renders cards for each session | unit | `cd frontend && npx vitest run src/pages/sessions/__tests__/types.test.ts -x` | Wave 0 |
| MH-26-d | CreateSessionPayload validates task required | unit | `cd frontend && npx vitest run src/pages/sessions/__tests__/types.test.ts -x` | Wave 0 |
| MH-26-e | SessionsPage renders without crash | smoke | Manual -- lazy-loaded page | Manual |
| MH-26-f | xterm.js output viewer connects to session WS | integration | Manual -- requires running backend | Manual |

### Sampling Rate
- **Per task commit:** `cd /mnt/storage/projects/mission-control/frontend && npx vitest run src/pages/sessions -x`
- **Per wave merge:** `cd /mnt/storage/projects/mission-control/frontend && npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `frontend/src/pages/sessions/__tests__/types.test.ts` -- covers MH-26-a, MH-26-b, MH-26-d
- [ ] `frontend/src/pages/sessions/types.ts` -- type definitions
- [ ] `frontend/src/hooks/sessions/useSessionOutput.ts` -- read-only terminal hook
- [ ] No framework install needed -- Vitest is already configured

## Sources

### Primary (HIGH confidence)
- **Codebase analysis** -- `claude_sessions.rs` (Phase 15 backend), `useTerminal.ts` (Phase 14 hook), `TerminalWidget.tsx` (Phase 14 widget), `terminal-theme.ts` (theme mapping), `Notes.tsx` (split-pane pattern), `AgentCard.tsx` + `AgentDetailPanel.tsx` (card + control patterns), `modules.ts` (module registration), `query-keys.ts` (query key centralization), `main.tsx` (route registration), `widget-registry.ts` (widget registration), `globals.css` (terminal CSS overrides)
- **Phase 15 research** -- `.planning/phases/15-claude-code-session-backend/15-RESEARCH.md` -- backend API contract, WebSocket relay architecture
- **Phase 14 research** -- `.planning/phases/14-terminal-frontend-xterm/14-RESEARCH.md` -- xterm.js v6 API, FitAddon, theme mapping

### Secondary (MEDIUM confidence)
- **CONTEXT.md decisions** -- `.planning/phases/16-session-monitor-frontend/16-CONTEXT.md` -- all locked decisions

### Tertiary (LOW confidence)
- **Pause/resume API availability** -- inferred from CONTEXT.md requirements; backend may not support these yet

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- zero new dependencies, all patterns verified in codebase
- Architecture: HIGH -- direct reuse of Notes.tsx split-pane, AgentCard memo pattern, useTerminal adaptation
- Pitfalls: HIGH -- identified from actual codebase patterns (user-select override, terminal lifecycle, Query invalidation)
- Backend API: HIGH -- Phase 15 implementation fully reviewed, all endpoints confirmed

**Research date:** 2026-03-23
**Valid until:** 2026-04-22 (30 days -- stable patterns, frontend-only phase)
