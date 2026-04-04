# Phase 92: Chat History Display - Research

**Researched:** 2026-03-24
**Domain:** OpenClaw session history rendering — Axum backend route + React message thread UI
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Use the existing `MarkdownBubble` component (lazy-loaded) for assistant messages — it already handles markdown
- Add syntax highlighting to code blocks via a lightweight library (check what is already in the bundle)
- Add a copy-to-clipboard button on code blocks (absolute positioned top-right corner)
- User messages render as plain text (no markdown) in accent-colored bubbles (existing pattern from SessionHistoryPanel)
- Keep the existing `ROLE_CONFIG` pattern from `SessionHistoryPanel.tsx` — user messages right-aligned, assistant/system/tool left-aligned
- Messages use the existing bubble pattern: 85% max-width, role label + icon above, timestamp on role label row
- Tool messages show `toolName` as subtitle (already implemented)
- Add `GET /api/gateway/sessions/:key/history` route to `gateway.rs` that calls the OpenClaw `chat.history` RPC method
- The hook `useSessionHistory` already calls this endpoint pattern — just need the backend route
- Support `limit` query param forwarded to gateway for pagination
- Use cursor-based "load more" at the top of the message list (scroll up to load older messages)
- Default limit: 50 messages per page
- "Load older messages" button at top when more messages available (gateway returns whether there are more)

### Claude's Discretion
- Exact code highlighting theme (match dark/light mode CSS vars)
- Animation for new messages appearing
- Exact scroll behavior for "load more" (preserve scroll position after loading older messages)

### Deferred Ideas (OUT OF SCOPE)
- Message search within a conversation (future phase)
- Message editing/deletion (future phase)
- Image/attachment rendering in messages (future phase)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CHAT-01 | User can view chat history for a selected session (chat.history with sessionKey) | Backend route pattern established; `gateway_forward` path validation rejects `?` so handler uses `state.http` directly; `useSessionHistory` hook already wired to correct endpoint |
| CHAT-04 | Chat messages display with proper formatting (markdown rendering, code blocks) | `MarkdownBubble` + `marked` v17 renderer hook; `marked.use({ renderer })` for code blocks; `highlight.js` needs install (not in bundle); copy button via event delegation on `.md-bubble` container |
</phase_requirements>

## Summary

Phase 92 adds the backend route that `useSessionHistory` has been calling since Phase 91, and upgrades `SessionHistoryPanel` with syntax-highlighted code blocks and a copy button. The React side is largely built — `SessionHistoryPanel.tsx`, `MarkdownBubble.tsx`, types, and the query hook all exist. The only missing piece is `GET /api/gateway/sessions/:key/history` in `gateway.rs`.

The critical Rust pitfall: `gateway_forward` rejects `?` in paths (security guard for query injection). To forward the `limit` query param to OpenClaw, the handler must build the URL directly using `state.http` — the same pattern used in `chat.rs` (`fetch_remote_history`). It does NOT call `gateway_forward` with a `?`-containing path.

For syntax highlighting: `marked` v17 supports a `renderer.code({ text, lang })` extension hook. `highlight.js` is not in the bundle — the lightest option is `highlight.js` with selective language imports (adds ~30-80KB gzipped). The theme must use CSS vars (`--bg-elevated`, `--text-primary`) to match dark/light mode.

**Primary recommendation:** Add one Axum handler to `gateway.rs` using `state.http` directly (not `gateway_forward`) for query param forwarding; extend `MarkdownBubble` with a `marked.use({ renderer: { code } })` hook that wraps `<pre>` in a positioned container with a copy button; add `highlight.js` with common languages only.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `marked` | 17.0.4 (already installed) | Markdown to HTML | Already used in MarkdownBubble; globals.css has `.md-bubble` styles |
| `highlight.js` | latest (needs `npm install`) | Syntax highlighting for code blocks | Modular imports, works with marked renderer hook, well-maintained |
| `dompurify` | already installed | HTML sanitization after marked | Already in `sanitizeHtml`; `class` and `span` already in allowlist |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `marked` renderer extension | built-in API | Custom code block renderer | Used to inject hljs tokens + wrapper `div` around `<pre>` for copy button |
| Axum `Path` + `Query` extractors | already in crate deps | Extract `:key` + `?limit=N` from route | Used in the new session history handler |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| highlight.js | Prism.js | Prism needs DOM-based approach or `prism-react-renderer` — more complex with marked |
| highlight.js | shiki | Shiki is async + 200KB+ bundle — overkill for a read-only history view |
| highlight.js full bundle | highlight.js/core + selective langs | Selective import reduces bundle size significantly; use common langs only |

**Installation (frontend only):**
```bash
cd frontend && npm install highlight.js
```

No new Rust crate dependencies required. The handler uses `state.http` (already a `reqwest::Client` in `AppState`).

## Architecture Patterns

### Recommended File Changes

No new directories needed. Changes are localized to:
```
src-tauri/src/routes/
└── gateway.rs            # + gateway_session_history handler + route registration

frontend/src/
├── components/
│   └── MarkdownBubble.tsx          # + highlight.js renderer extension + copy button event delegation
├── pages/sessions/
│   ├── SessionHistoryPanel.tsx     # + pagination UI (load more button, scroll position)
│   └── types.ts                    # + optional hasMore field on SessionHistoryResponse
└── globals.css                     # + .md-code-block and .md-copy-btn styles
```

### Pattern 1: Axum handler with direct `state.http` for query params

**What:** When a gateway route needs to forward query params, build the request directly with `state.http` rather than using `gateway_forward` (which rejects `?` in paths).

**When to use:** Any handler that must append `?key=value` to the upstream OpenClaw URL.

**Example:**
```rust
// Source: established in src-tauri/src/routes/chat.rs (fetch_remote_history)
// and src-tauri/src/routes/claude_sessions.rs (Path extractor pattern)

#[derive(Debug, Deserialize)]
struct HistoryQueryParams {
    limit: Option<u32>,
}

async fn gateway_session_history(
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
    Path(key): Path<String>,
    axum::extract::Query(params): axum::extract::Query<HistoryQueryParams>,
) -> Result<Json<Value>, AppError> {
    if key.is_empty() || key.len() > 100 {
        return Err(AppError::BadRequest("invalid session key".into()));
    }
    let encoded_key = crate::routes::util::percent_encode(&key);

    let base = openclaw_api_url(&state).ok_or_else(|| {
        AppError::BadRequest("OpenClaw API not configured".into())
    })?;
    let api_key = openclaw_api_key(&state);
    let limit = params.limit.unwrap_or(50).min(200);
    let url = format!("{base}/chat/history/{encoded_key}?limit={limit}");

    let mut req = state.http
        .get(&url)
        .header("Content-Type", "application/json")
        .timeout(Duration::from_secs(30));

    if !api_key.is_empty() {
        req = req.header("Authorization", format!("Bearer {api_key}"));
    }

    let res = req.send().await.map_err(|e| {
        tracing::error!("[gateway] session history {key} failed: {e}");
        AppError::Internal(anyhow::anyhow!("Failed to reach OpenClaw API"))
    })?;

    let status = res.status();
    if !status.is_success() {
        let text = res.text().await.unwrap_or_default();
        tracing::error!("[gateway] GET /chat/history/{key} -> {status}");
        let safe_msg = sanitize_error_body(&text);
        if status.is_client_error() {
            return Err(AppError::BadRequest(format!("OpenClaw: {safe_msg}")));
        }
        return Err(AppError::Internal(anyhow::anyhow!("OpenClaw API error")));
    }

    res.json::<Value>().await
        .map(Json)
        .map_err(|e| AppError::Internal(e.into()))
}
```

Router registration (in `gateway.rs` router function):
```rust
.route("/gateway/sessions/:key/history", get(gateway_session_history))
```

### Pattern 2: marked renderer extension for syntax-highlighted code blocks

**What:** Use `marked.use({ renderer: { code } })` to override the default output. Module-level initialization (outside any component) so it runs once per module load.

**Example:**
```typescript
// Source: marked v17 renderer extension API (verified via marked.d.ts)
// Place at module level in MarkdownBubble.tsx, before component definition

import hljs from 'highlight.js/lib/core'
import langJS from 'highlight.js/lib/languages/javascript'
import langTS from 'highlight.js/lib/languages/typescript'
import langPY from 'highlight.js/lib/languages/python'
import langBash from 'highlight.js/lib/languages/bash'
import langJSON from 'highlight.js/lib/languages/json'
import langRust from 'highlight.js/lib/languages/rust'
import langGo from 'highlight.js/lib/languages/go'
import langCSS from 'highlight.js/lib/languages/css'
import langXML from 'highlight.js/lib/languages/xml'

hljs.registerLanguage('javascript', langJS)
hljs.registerLanguage('js', langJS)
hljs.registerLanguage('typescript', langTS)
hljs.registerLanguage('ts', langTS)
hljs.registerLanguage('python', langPY)
hljs.registerLanguage('bash', langBash)
hljs.registerLanguage('sh', langBash)
hljs.registerLanguage('json', langJSON)
hljs.registerLanguage('rust', langRust)
hljs.registerLanguage('go', langGo)
hljs.registerLanguage('css', langCSS)
hljs.registerLanguage('html', langXML)

marked.use({
  gfm: true,
  breaks: true,
  renderer: {
    code({ text, lang }) {
      const validLang = lang && hljs.getLanguage(lang) ? lang : null
      const highlighted = validLang
        ? hljs.highlight(text, { language: validLang }).value
        : hljs.highlightAuto(text).value
      const langAttr = validLang ? ` data-lang="${validLang}"` : ''
      return `<div class="md-code-block"${langAttr}><button class="md-copy-btn" aria-label="Copy code">Copy</button><pre><code class="hljs">${highlighted}</code></pre></div>`
    }
  }
})
```

Note: The existing `marked.use({ gfm: true, breaks: true })` call must be merged into this single `marked.use()` call or called before it.

### Pattern 3: Copy button via event delegation

**What:** One `useEffect` attaches a single delegated `click` listener on the `.md-bubble` container. No per-block listeners. Safe against re-renders that replace `innerHTML`.

**Example:**
```typescript
// In MarkdownBubble component
const containerRef = useRef<HTMLDivElement>(null)

useEffect(() => {
  const el = containerRef.current
  if (!el) return
  const onClick = (e: MouseEvent) => {
    const btn = (e.target as Element).closest('.md-copy-btn')
    if (!btn) return
    const code = btn.closest('.md-code-block')?.querySelector('code')
    if (!code) return
    navigator.clipboard.writeText(code.textContent ?? '').then(() => {
      btn.textContent = 'Copied!'
      setTimeout(() => { btn.textContent = 'Copy' }, 2000)
    }).catch(() => { /* clipboard blocked */ })
  }
  el.addEventListener('click', onClick)
  return () => el.removeEventListener('click', onClick)
}, [/* html dep not needed — event delegation always finds current DOM */])

// render: <div className="md-bubble" ref={containerRef} ... />
```

### Pattern 4: Scroll position preservation for pagination

**What:** Record `scrollHeight` before state update; after DOM update, set `scrollTop += delta`.

**Example:**
```typescript
const loadOlderMessages = useCallback(() => {
  const el = scrollRef.current
  const prevHeight = el?.scrollHeight ?? 0
  fetchOlderPage() // triggers React Query refetch with new offset
  requestAnimationFrame(() => {
    if (el) el.scrollTop += (el.scrollHeight - prevHeight)
  })
}, [fetchOlderPage])
```

### Anti-Patterns to Avoid

- **`gateway_forward` with `?` in path:** `validate_gateway_path` returns 400 immediately. Use `state.http` directly.
- **Full `highlight.js` import:** `import hljs from 'highlight.js'` loads all 190+ languages (~1MB). Use `highlight.js/lib/core` + selective language imports.
- **`marked.use()` inside component function:** Runs on every mount and accumulates renderer extensions. Module-level only.
- **Per-block copy button via React state:** Since `MarkdownBubble` uses `innerHTML` assignment, React state does not control the code block DOM. Use event delegation.
- **Trusting AI-generated HTML without sanitization:** `MarkdownBubble` already pipes through `sanitizeHtml` (DOMPurify). The hljs output must also go through DOMPurify. The current allowlist already permits `class` and `span` — no change needed.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Syntax highlighting | Custom regex tokenizer | `highlight.js` selective import | Language grammar has hundreds of edge cases per language |
| HTML sanitization | Custom tag stripper | `dompurify` (already used) | XSS from malicious agent content is real risk; DOMPurify is battle-tested |
| Markdown parsing | Custom parser | `marked` (already used) | GFM spec edge cases; already configured and styled |
| Scroll anchor on prepend | Manual scroll math | `scrollHeight` delta pattern | Browsers do not expose scroll anchor for prepend without Intersection Observer |

**Key insight:** All the heavy lifting is already in the bundle or has a 2-line solution. This phase is wiring + UI polish, not infrastructure.

## Common Pitfalls

### Pitfall 1: `validate_gateway_path` rejects `?`

**What goes wrong:** Calling `gateway_forward(&state, Method::GET, &format!("/chat/history/{key}?limit=50"), None)` returns `AppError::BadRequest("invalid gateway path")` immediately — never reaches OpenClaw.

**Why it happens:** The function was designed to prevent query injection and path traversal. The `?` check is intentional and strict.

**How to avoid:** Build the URL with `state.http` directly using `openclaw_api_url` and `openclaw_api_key` (both `pub(crate)`). See Pattern 1.

**Warning signs:** Frontend receives 400 "invalid gateway path" — check path construction first.

### Pitfall 2: DOMPurify stripping hljs span classes

**What goes wrong:** hljs emits `<span class="hljs-keyword">`. If DOMPurify strips `class`, code renders as plain unstyled monospace.

**Why it happens:** Restrictive sanitization allowlist.

**How to avoid:** `sanitize.ts` already has `class` in `ALLOWED_ATTR` and `span` in `ALLOWED_TAGS`. No change needed. Verify before assuming broken.

**Warning signs:** Code blocks look like plain text with no colors despite hljs running.

### Pitfall 3: `marked.use()` called multiple times

**What goes wrong:** If `marked.use()` is inside a component function or `useEffect`, it fires on every mount, accumulating duplicate renderer extensions.

**Why it happens:** Module-level vs. component-level initialization confusion.

**How to avoid:** Keep `marked.use()` at module scope. The existing `marked.use({ gfm: true, breaks: true })` in `MarkdownBubble.tsx` is already at module scope — extend it there.

### Pitfall 4: Session key characters break the upstream URL

**What goes wrong:** A session key containing `/`, `+`, or `%` breaks the upstream URL path or confuses the OpenClaw gateway.

**Why it happens:** OpenClaw session keys are arbitrary strings up to 100 chars — not necessarily UUIDs (per Phase 91 decisions).

**How to avoid:** Percent-encode the key using `crate::routes::util::percent_encode` before building the URL.

### Pitfall 5: Wrong upstream path for `chat.history`

**What goes wrong:** Using `/sessions/{key}/history` (the Axum route path) as the OpenClaw upstream path returns 404.

**Why it happens:** The Axum route path and the OpenClaw API path are different namespaces.

**How to avoid:** OpenClaw HTTP shim path for `chat.history` is `/chat/history/{key}` (inferred from protocol v3 and the naming convention in `chat.rs` where single-thread history is at `/chat/history`). Verify with `curl` immediately after adding the route — per project rules for Axum route testing.

### Pitfall 6: Copy button visible in loading skeleton

**What goes wrong:** If a skeleton shimmer is rendered as `innerHTML`, the `.md-copy-btn` CSS may flash.

**Why it happens:** CSS hover states apply to skeleton content.

**How to avoid:** Render skeleton as separate React elements (not via `MarkdownBubble`) while loading.

## Code Examples

### CSS additions for code block in globals.css

```css
/* Additions to existing .md-bubble section in globals.css */
.md-code-block {
  position: relative;
}
.md-copy-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  font-size: 11px;
  font-weight: 500;
  padding: 3px 8px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--bg-elevated);
  color: var(--text-muted);
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s var(--ease-spring);
}
.md-code-block:hover .md-copy-btn {
  opacity: 1;
}
/* hljs theme using CSS vars — works in dark and light mode */
.hljs-keyword, .hljs-selector-tag { color: var(--purple); }
.hljs-string, .hljs-attr { color: var(--green-400); }
.hljs-number, .hljs-literal { color: var(--amber); }
.hljs-comment { color: var(--text-muted); font-style: italic; }
.hljs-title, .hljs-name { color: var(--accent-bright); }
.hljs-type, .hljs-built_in { color: var(--blue); }
.hljs-variable { color: var(--text-primary); }
```

### Skeleton shimmer for loading state

```tsx
// In SessionHistoryPanel — replace "Loading history..." text with skeletons
function MessageSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16 }}>
      {[...Array(4)].map((_, i) => (
        <div key={i} style={{
          alignSelf: i % 2 === 0 ? 'flex-end' : 'flex-start',
          width: `${40 + Math.random() * 30}%`,
          height: 60,
          borderRadius: 12,
          background: 'var(--bg-elevated)',
          animation: 'shimmer 1.5s ease-in-out infinite',
        }} />
      ))}
    </div>
  )
}
```

The `shimmer` keyframe already exists in `globals.css` (used by other skeleton components in the app).

### Pagination type additions to `types.ts`

```typescript
export interface SessionHistoryResponse {
  messages: SessionHistoryMessage[]
  hasMore?: boolean   // optional — gateway may not return this
  total?: number      // optional — if gateway returns total count
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `gateway_forward` for all OpenClaw proxy routes | Direct `state.http` for routes needing query params | Established in Phase 9 (gateway decisions) | Query params must be handled by the handler, not the helper function |
| Spinner loading state | Skeleton shimmer | UI polish standard (project rule) | Per project rules: no spinners, use skeletons |
| Plain `<pre><code>` for markdown code blocks | marked renderer extension + hljs | Phase 92 | Code blocks gain syntax colors + copy button |

## Open Questions

1. **Exact upstream path for OpenClaw `chat.history` HTTP REST shim**
   - What we know: Protocol v3 WS method is `chat.history` with `{ sessionKey, limit? }`. The existing `chat.rs` shows `/chat/history` (no key) for single-thread chat. Session-scoped variant is not used elsewhere in the codebase.
   - What's unclear: Whether the HTTP REST path is `/chat/history/{key}`, `/sessions/{key}/history`, or something else.
   - Recommendation: Try `/chat/history/{key}` first. Test immediately with `curl` after adding the route (per Axum route gotchas rule). If 404, fall back to checking OpenClaw gateway HTTP API docs or the `/chat/history?sessionKey={key}` variant.

2. **Does `chat.history` support pagination beyond `limit`?**
   - What we know: Protocol signature is `{ sessionKey, limit? }`. No offset or cursor param documented.
   - What's unclear: Whether gateway returns `hasMore` / total count / cursor in the response.
   - Recommendation: Add `hasMore?: boolean` to `SessionHistoryResponse` type. If gateway does not return `hasMore`, implement local pagination: fetch `limit * (page + 1)` messages and slice on the frontend. Start simple — single page of 50 messages is the common case.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.x |
| Config file | `frontend/vite.config.ts` (vitest inline config) |
| Quick run command | `cd /home/josue/Documents/projects/mission-control/frontend && npx vitest run hooks/sessions/__tests__/` |
| Full suite command | `cd /home/josue/Documents/projects/mission-control/frontend && npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CHAT-01 | `useSessionHistory` calls correct endpoint with sessionId | unit | `cd frontend && npx vitest run hooks/sessions/__tests__/useSessionHistory.test.ts -x` | ❌ Wave 0 |
| CHAT-01 | Backend route proxies to OpenClaw and returns messages | manual smoke | `curl -H "X-API-Key: $KEY" http://localhost:3000/api/gateway/sessions/TEST/history` | N/A |
| CHAT-04 | MarkdownBubble renders `<div class="md-code-block">` for code blocks | unit | `cd frontend && npx vitest run components/__tests__/MarkdownBubble.test.tsx -x` | ❌ Wave 0 |
| CHAT-04 | Copy button present and functional in browser | browser | agent-browser interaction on Sessions page | N/A |

### Sampling Rate
- **Per task commit:** `cd frontend && npx vitest run hooks/sessions/__tests__/useSessionHistory.test.ts`
- **Per wave merge:** `cd frontend && npx vitest run`
- **Phase gate:** Full suite green + agent-browser live verification of Sessions page before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `frontend/src/hooks/sessions/__tests__/useSessionHistory.test.ts` — covers CHAT-01 (hook fetches correct endpoint, handles loading/error/empty states, returns messages array). Pattern established by `useGatewaySessions.test.ts` in same directory.
- [ ] `frontend/src/components/__tests__/MarkdownBubble.test.tsx` — covers CHAT-04 (code block renders with `.md-code-block` wrapper and `.md-copy-btn` button present in output HTML).

## Sources

### Primary (HIGH confidence)
- `src-tauri/src/routes/gateway.rs` — direct read: `validate_gateway_path` rejects `?`; `gateway_forward` signature; `openclaw_api_url`/`openclaw_api_key` are `pub(crate)`
- `frontend/src/components/MarkdownBubble.tsx` — direct read: `marked.use` at module scope; `.md-bubble` class; no existing code renderer
- `frontend/src/pages/sessions/SessionHistoryPanel.tsx` — direct read: full `ROLE_CONFIG`, `MessageBubble` component, loading/error/empty states already built
- `frontend/src/hooks/sessions/useSessionHistory.ts` — direct read: exact endpoint called (`/api/gateway/sessions/${sessionId}/history`), query key
- `frontend/src/pages/sessions/types.ts` — direct read: `SessionHistoryMessage`, `SessionHistoryResponse` shapes
- `frontend/src/lib/sanitize.ts` — direct read: DOMPurify config allows `class`, `span`, `code` — hljs output is safe
- `frontend/package.json` — direct read: `marked@17.0.4` present, `highlight.js` absent
- Memory `reference_openclaw_complete.md` — `chat.history` method signature: `{ sessionKey, limit? }`
- `src-tauri/src/routes/chat.rs` — direct read: `fetch_remote_history` using `state.http` directly for URLs with query params
- `src-tauri/src/routes/claude_sessions.rs` — direct read: `Path<String>` extractor usage pattern

### Secondary (MEDIUM confidence)
- `frontend/node_modules/marked/lib/marked.d.ts` — confirms `renderer.code({ text, lang, escaped })` extension hook exists in marked v17

### Tertiary (LOW confidence)
- OpenClaw upstream path `/chat/history/{key}` — inferred from protocol name and naming convention, not verified against running gateway

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified from package.json and existing source files
- Architecture: HIGH — all patterns drawn from existing codebase code
- Pitfalls: HIGH — `validate_gateway_path` behavior verified by reading source; DOMPurify allowlist verified
- OpenClaw upstream path: LOW — inferred, not tested

**Research date:** 2026-03-24
**Valid until:** 2026-04-24 (stable libraries; OpenClaw path may need update if gateway layout differs)
