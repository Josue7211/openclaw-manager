# Architecture Patterns: v0.0.3 Feature Integration

**Domain:** Desktop app feature integration (5 new subsystems into existing Tauri v2 + Axum + React)
**Researched:** 2026-03-22
**Overall confidence:** HIGH (all patterns verified against existing codebase)

---

## Table of Contents

1. [Recommended Architecture Overview](#recommended-architecture-overview)
2. [Feature 1: TipTap Editor Replacing CodeMirror](#feature-1-tiptap-editor-replacing-codemirror)
3. [Feature 2: OpenClaw Gateway CRUD APIs](#feature-2-openclaw-gateway-crud-apis)
4. [Feature 3: Terminal Widget](#feature-3-terminal-widget)
5. [Feature 4: Theme Blend Slider](#feature-4-theme-blend-slider)
6. [Feature 5: Project Tracker](#feature-5-project-tracker)
7. [Build Order and Dependencies](#build-order-and-dependencies)
8. [New vs Modified Files](#new-vs-modified-files)
9. [Anti-Patterns to Avoid](#anti-patterns-to-avoid)
10. [Sources](#sources)

---

## Recommended Architecture Overview

All five features follow the app's established patterns: frontend components fetch via React Query, data flows through the Axum server on `localhost:3000`, external services are proxied with credentials held server-side. No new architectural paradigms are needed -- every feature maps cleanly onto existing patterns.

```
Frontend (React)                    Backend (Axum)                  External
---------------------               ---------------------           --------
TipTap Editor       --- api.ts ---> /api/vault/*          --------> CouchDB
OpenClaw Controller --- api.ts ---> /api/gateway/*  (NEW) --------> OpenClaw Gateway :18789
Terminal Widget     --- WebSocket > /api/terminal/ws (NEW) -------> SSH/PTY on OpenClaw VM
Theme Blend Slider  --- theme-store (localStorage)                  (local only)
Project Tracker     --- api.ts ---> /api/projects/* (NEW) --------> Supabase PostgreSQL
```

### Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `NoteEditor.tsx` (rewrite) | WYSIWYG editing via TipTap, markdown round-trip | vault.ts, CouchDB proxy |
| `gateway.rs` (new route module) | Proxy CRUD to OpenClaw gateway API | OpenClaw VM at OPENCLAW_API_URL |
| `terminal.rs` (new route module) | WebSocket relay to PTY/SSH on remote VM | OpenClaw VM via SSH or PTY |
| `theme-store.ts` (modify) | Blend slider state, CSS property interpolation | globals.css custom properties |
| `projects.rs` (new route module) | Project CRUD with Supabase | Supabase PostgreSQL |

---

## Feature 1: TipTap Editor Replacing CodeMirror

### Current State

The editor is a CodeMirror 6 instance (`NoteEditor.tsx`, 431 lines) with:
- `@codemirror/view`, `@codemirror/state`, `@codemirror/lang-markdown`
- Custom theme (`mcTheme`), highlight style (`mcHighlighting`)
- Image embed plugin for `![[image.png]]` syntax (custom `ViewPlugin` with `WidgetType`)
- Wikilink click handler (regex match on click coordinates)
- Wikilink autocomplete via `wikilinkCompletion.ts` (CodeMirror `autocompletion` override)
- Formatting toolbar (`EditorToolbar.tsx`, 343 lines) with `toggleWrap`, `toggleLinePrefix`, `toggleHeading`, `insertLink`, `insertCodeBlock`, `insertHorizontalRule`, `toggleNumberedList`
- Content stored as **raw markdown strings** in CouchDB via `vault.ts`

### Integration Strategy: Markdown-In, Markdown-Out

**Critical constraint:** CouchDB stores raw markdown. Obsidian LiveSync format expects markdown text in chunk data fields. The vault backend (`vault.rs`) assembles content by concatenating chunk strings. TipTap must load markdown and save markdown -- never store TipTap JSON in CouchDB.

```
CouchDB (markdown chunks) --> vault.rs assembles --> vault.ts getNote()
  --> TipTap setContent(md, {contentType: 'markdown'})
                            |
                       user edits (ProseMirror DOM)
                            |
  TipTap getMarkdown() --> vault.ts putNote({content: markdown})
  --> api.put('/api/vault/doc?id=...') --> vault.rs --> CouchDB PUT
```

**Use `@tiptap/extension-markdown`** (official, released March 10, 2026 in TipTap 3.7.0). This provides:
- `editor.commands.setContent(markdown, { contentType: 'markdown' })` -- parse markdown into ProseMirror doc
- `editor.getMarkdown()` -- serialize ProseMirror doc back to markdown
- Custom serializers for extensions via `renderMarkdown` config in extension definitions
- Built on MarkedJS for CommonMark-compliant parsing

### New/Modified Components

| File | Action | Details |
|------|--------|---------|
| `NoteEditor.tsx` | **REWRITE** | Replace CodeMirror with TipTap `useEditor` hook. Remove all CM imports, theme, highlight style, image plugin, click handler |
| `EditorToolbar.tsx` | **REWRITE** | Replace CodeMirror dispatch calls with TipTap `editor.chain().focus().*().run()` commands. Same button layout, same icons, new API |
| `wikilinkCompletion.ts` | **DELETE** | Replaced by WikilinkExtension with TipTap Suggestion plugin |
| `WikilinkExtension.ts` | **NEW** | Custom TipTap Node for `[[link\|display]]` syntax with click handler and suggestion autocomplete |
| `ImageEmbedExtension.ts` | **NEW** | Custom TipTap Node for `![[image.png]]` inline rendering. Replaces CodeMirror `ViewPlugin`/`WidgetType` pattern |
| `BacklinksPanel.tsx` | **NO CHANGE** | Consumes `note.links` array extracted by `vault.ts`, not editor internals |
| `vault.ts` | **NO CHANGE** | Already stores/retrieves raw markdown strings. `putNote` calls `extractWikilinks()` and `extractTags()` from content string |
| `vault.rs` | **NO CHANGE** | Already assembles content from LiveSync chunks as strings |
| `Notes.tsx` | **MINOR CHANGE** | Remove CodeMirror-specific `EditorView` ref pattern, use TipTap `editor` instance from `useEditor` |

### TipTap Extension Architecture

```typescript
useEditor({
  extensions: [
    StarterKit,                     // Headings, bold, italic, lists, code, blockquote, hr
    Markdown.configure({            // @tiptap/extension-markdown
      transformCopiedText: true,    // Copy as markdown, not HTML
    }),
    Placeholder.configure({
      placeholder: 'Start writing...',
    }),
    Link.configure({
      openOnClick: false,           // Handle clicks manually for wikilinks
    }),
    Image,                          // @tiptap/extension-image
    Table, TableRow, TableCell, TableHeader,
    TaskList, TaskItem,
    CodeBlockLowlight.configure({
      lowlight,                     // Syntax highlighting in code blocks
    }),
    WikilinkExtension.configure({   // CUSTOM
      onWikilinkClick: (target) => onWikilinkClickRef.current(target),
      allNoteTitles: allNoteTitles, // For autocomplete suggestions
    }),
    ImageEmbedExtension.configure({ // CUSTOM
      resolveUrl: (filename) => `${API_BASE}/api/vault/media/${encodeURIComponent(filename)}`,
    }),
    Highlight,
    Typography,                     // Smart quotes, dashes
  ],
  content: note.content,
  onUpdate: ({ editor }) => {
    onChange(editor.getMarkdown())
  },
})
```

### WikilinkExtension Design

Custom TipTap Node (inline, atomic) because wikilinks have self-contained syntax that should be rendered as a single clickable chip:

```typescript
// WikilinkExtension.ts
import { Node, mergeAttributes } from '@tiptap/core'
import Suggestion from '@tiptap/suggestion'

export const WikilinkExtension = Node.create({
  name: 'wikilink',
  group: 'inline',
  inline: true,
  atom: true,

  addAttributes() {
    return {
      target: { default: '' },
      display: { default: null },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-wikilink]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(
      { 'data-wikilink': '', class: 'wikilink-chip' },
      HTMLAttributes,
    ), HTMLAttributes.display || HTMLAttributes.target]
  },

  // Custom markdown serialization
  renderMarkdown: {
    toMarkdown(state, node) {
      const { target, display } = node.attrs
      if (display && display !== target) {
        state.write(`[[${target}|${display}]]`)
      } else {
        state.write(`[[${target}]]`)
      }
    },
  },

  addNodeView() {
    // Render as clickable inline chip with accent color
    // On click: call options.onWikilinkClick(target)
  },

  addInputRules() {
    // Match [[ to trigger suggestion popup
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        char: '[[',
        items: ({ query }) => {
          // Filter allNoteTitles by query
        },
        render: () => {
          // Dropdown list of matching note titles
        },
      }),
    ]
  },
})
```

### ImageEmbedExtension Design

Custom TipTap Node that replaces the CodeMirror `ImageWidget` + `imageEmbedPlugin`:

```typescript
// ImageEmbedExtension.ts
export const ImageEmbedExtension = Node.create({
  name: 'imageEmbed',
  group: 'block',
  atom: true,

  addAttributes() {
    return { filename: { default: '' } }
  },

  renderHTML({ HTMLAttributes }) {
    const url = this.options.resolveUrl(HTMLAttributes.filename)
    return ['div', { class: 'image-embed-wrapper' }, [
      'img', { src: url, alt: HTMLAttributes.filename, loading: 'lazy' },
    ]]
  },

  renderMarkdown: {
    toMarkdown(state, node) {
      state.write(`![[${node.attrs.filename}]]`)
    },
  },

  // Parse markdown: recognize ![[filename.png]] pattern
  // This requires a custom Markdown tokenizer since ![[...]] is not standard
})
```

### Toolbar Command Mapping

| Current (CodeMirror) | New (TipTap) | Notes |
|---------------------|-------------|-------|
| `toggleWrap(view, '**')` | `editor.chain().focus().toggleBold().run()` | Direct mapping |
| `toggleWrap(view, '*')` | `editor.chain().focus().toggleItalic().run()` | Direct mapping |
| `toggleWrap(view, '~~')` | `editor.chain().focus().toggleStrike().run()` | Direct mapping |
| `toggleWrap(view, '`')` | `editor.chain().focus().toggleCode().run()` | Direct mapping |
| `toggleLinePrefix(view, '- ')` | `editor.chain().focus().toggleBulletList().run()` | Direct mapping |
| `toggleNumberedList(view)` | `editor.chain().focus().toggleOrderedList().run()` | Direct mapping |
| `toggleLinePrefix(view, '- [ ] ')` | `editor.chain().focus().toggleTaskList().run()` | Direct mapping |
| `toggleHeading(view, N)` | `editor.chain().focus().toggleHeading({ level: N }).run()` | Direct mapping |
| `insertLink(view)` | `editor.chain().focus().setLink({ href: '' }).run()` | May need link edit modal |
| `insertCodeBlock(view)` | `editor.chain().focus().toggleCodeBlock().run()` | Direct mapping |
| `insertHorizontalRule(view)` | `editor.chain().focus().setHorizontalRule().run()` | Direct mapping |
| `toggleLinePrefix(view, '> ')` | `editor.chain().focus().toggleBlockquote().run()` | Direct mapping |
| `viewRef.current` (EditorView) | `editor` from `useEditor()` | Hook-based, no ref needed |

### Data Flow (unchanged from current)

```
User types --> TipTap onUpdate --> getMarkdown() --> debounce 600ms
--> vault.putNote({content: markdown}) --> api.put('/api/vault/doc?id=...')
--> Axum vault.rs --> CouchDB PUT
```

The save debounce (600ms) in `Notes.tsx` (`saveTimerRef`) remains unchanged. The `pendingContentRef` pattern also stays the same.

### Risk: Markdown Round-Trip Fidelity

The `@tiptap/extension-markdown` is labeled "early release" by TipTap (released March 10, 2026). Edge cases to validate:
- Nested blockquotes with lists
- Frontmatter YAML blocks (Obsidian uses these -- TipTap may strip them)
- Raw HTML embedded in markdown
- `![[image.png]]` custom syntax (not standard markdown -- needs custom tokenizer)
- Complex table formatting with alignment
- Wikilinks `[[target|display]]` (custom syntax -- needs custom tokenizer)

**Mitigation:** Before committing to the full rewrite, build a test harness that loads 20+ representative notes from the vault, runs them through TipTap's parse/serialize cycle, and compares input vs output markdown. Any notes that differ non-trivially indicate edge cases needing custom tokenizer work.

---

## Feature 2: OpenClaw Gateway CRUD APIs

### Current State

The OpenClaw gateway at `OPENCLAW_API_URL` (configured via secrets, typically `http://10.0.0.173:18789`) exposes a comprehensive REST API. Currently, Mission Control uses:

| What | How | Route File |
|------|-----|-----------|
| Chat (bidirectional) | WebSocket + HTTP | `chat.rs` |
| Agent listing (local DB) | SQLite query + model sync fire-and-forget | `agents.rs` |
| Sessions listing | `openclaw` CLI binary invocation | `openclaw_cli.rs` |
| Cron listing | `openclaw` CLI binary invocation | `openclaw_cli.rs` |
| Memory entries | Local filesystem or gateway HTTP fallback | `memory.rs` |
| Workspace files | Local filesystem or gateway HTTP fallback | `workspace.rs` |

The gateway has full CRUD APIs for agents, sessions, crons, models, tools, config, files, usage, and health -- but MC only reads from some of them and writes to none.

### What Needs CRUD Proxying

| Gateway Endpoint | Current MC Support | Action Needed |
|-----------------|-------------------|---------------|
| `GET /api/agents` | Local SQLite only | **ADD** gateway HTTP fallback |
| `POST /api/agents` | None | **NEW** create agent proxy |
| `PUT /api/agents/:id` | PATCH model only | **EXPAND** full update proxy |
| `DELETE /api/agents/:id` | None | **NEW** delete agent proxy |
| `GET /api/sessions` | CLI binary only | **ADD** gateway HTTP fallback |
| `POST /api/sessions` | None | **NEW** create session proxy |
| `DELETE /api/sessions/:id` | None | **NEW** terminate session proxy |
| `GET /api/crons` | CLI binary only | **ADD** gateway HTTP fallback |
| `POST /api/crons` | None | **NEW** create cron proxy |
| `PUT /api/crons/:id` | None | **NEW** update cron proxy |
| `DELETE /api/crons/:id` | None | **NEW** delete cron proxy |
| `GET /api/models` | None | **NEW** list available models |
| `GET /api/usage` | None | **NEW** usage/cost data |
| `GET /api/tools` | None | **NEW** tool registry |
| `GET /api/config` | None | **NEW** gateway config read |
| `PUT /api/config` | None | **NEW** gateway config write |

### New Axum Route Module: `gateway.rs`

Create a **generic proxy module** rather than individual handlers per resource. This avoids boilerplate and matches the pattern used by `memory.rs` (check `OPENCLAW_API_URL` first, fallback to local).

```rust
// src-tauri/src/routes/gateway.rs

/// Generic proxy to the OpenClaw gateway API.
/// All requests require RequireAuth and forward to OPENCLAW_API_URL.

pub fn router() -> Router<AppState> {
    Router::new()
        // Agent CRUD
        .route("/gateway/agents", get(proxy_get).post(proxy_post))
        .route("/gateway/agents/{id}", get(proxy_get_by_id).put(proxy_put).delete(proxy_delete))
        // Session management
        .route("/gateway/sessions", get(proxy_get).post(proxy_post))
        .route("/gateway/sessions/{id}", delete(proxy_delete))
        // Cron management
        .route("/gateway/crons", get(proxy_get).post(proxy_post))
        .route("/gateway/crons/{id}", get(proxy_get_by_id).put(proxy_put).delete(proxy_delete))
        // Read-only resources
        .route("/gateway/models", get(proxy_get))
        .route("/gateway/usage", get(proxy_get))
        .route("/gateway/tools", get(proxy_get))
        .route("/gateway/config", get(proxy_get).put(proxy_put))
        .route("/gateway/health", get(proxy_get))
}
```

### Proxy Helper Pattern

Reusable function that maps Axum request path to gateway URL:

```rust
/// Forward a request to the OpenClaw gateway.
/// Strips the /gateway/ prefix and forwards to OPENCLAW_API_URL/api/*.
async fn gateway_forward(
    state: &AppState,
    method: reqwest::Method,
    gateway_path: &str,
    body: Option<Value>,
) -> Result<Json<Value>, AppError> {
    let base = state.secret("OPENCLAW_API_URL")
        .filter(|s| !s.is_empty())
        .ok_or_else(|| AppError::BadRequest("OpenClaw API not configured".into()))?;

    let key = state.secret_or_default("OPENCLAW_API_KEY");
    let url = format!("{base}/{gateway_path}");

    let mut req = state.http.request(method, &url)
        .timeout(Duration::from_secs(15));
    if !key.is_empty() {
        req = req.header("Authorization", format!("Bearer {key}"));
    }
    if let Some(body) = body {
        req = req.json(&body);
    }

    let resp = req.send().await
        .map_err(|e| AppError::Internal(e.into()))?;
    let status = resp.status();
    let json: Value = resp.json().await.unwrap_or(json!({}));

    if !status.is_success() {
        return Err(AppError::BadRequest(format!("Gateway {status}: {json}")));
    }
    Ok(Json(json))
}
```

This pattern is already proven in the codebase -- `memory.rs` does essentially the same thing with `reqwest::Client::get(format!("{openclaw_url}/memory"))`.

### Frontend: OpenClaw Controller Page

```
frontend/src/pages/openclaw/        (NEW directory)
  OpenClawPage.tsx                   Main controller page with tab navigation
  AgentManager.tsx                   Agent CRUD with inline editing
  CronManager.tsx                    Cron job management (create/edit/delete/toggle)
  SessionList.tsx                    Active sessions with terminate action
  ModelSelector.tsx                  Available models grid
  UsageDashboard.tsx                 Usage/cost charts over time
  ToolRegistry.tsx                   Available tools listing
  ConfigPanel.tsx                    Gateway configuration editor
  types.ts                           TypeScript interfaces for gateway resources
```

React Query keys follow existing pattern in `lib/query-keys.ts`:

```typescript
export const gatewayKeys = {
  agents: ['gateway', 'agents'] as const,
  agent: (id: string) => ['gateway', 'agents', id] as const,
  sessions: ['gateway', 'sessions'] as const,
  crons: ['gateway', 'crons'] as const,
  cron: (id: string) => ['gateway', 'crons', id] as const,
  models: ['gateway', 'models'] as const,
  usage: ['gateway', 'usage'] as const,
  tools: ['gateway', 'tools'] as const,
  config: ['gateway', 'config'] as const,
}
```

### Relationship to Existing Routes

The new `/api/gateway/*` routes do NOT replace existing routes:
- `agents.rs` continues to manage the local SQLite agent table (UI personalization: emoji, color, display_name)
- `openclaw_cli.rs` continues to work when the CLI binary is available locally
- `memory.rs` and `workspace.rs` continue their local-first-with-gateway-fallback pattern

The gateway routes provide **additional CRUD capability** that the CLI and local routes do not have. The frontend OpenClaw page uses the gateway routes exclusively; existing dashboard widgets continue using their current data sources.

### Sidebar/Module Integration

Add to `lib/modules.ts` as a new module:

```typescript
{
  id: 'openclaw',
  name: 'OpenClaw',
  description: 'AI agent gateway control center',
  icon: 'Robot',
  route: '/openclaw',
  requiresConfig: ['OPENCLAW_API_URL'],
}
```

---

## Feature 3: Terminal Widget

### Architecture Decision: WebSocket Relay Through Axum

The terminal cannot connect directly to the OpenClaw VM because:
1. The frontend runs in Tauri's webview -- no direct SSH/PTY capability
2. SSH credentials must never reach the frontend (security model)
3. The Axum server already handles all external proxying

**Pattern:** xterm.js in frontend <--WebSocket--> Axum relay <--PTY--> local shell (or SSH to remote VM)

### Backend: WebSocket Terminal Handler

```rust
// src-tauri/src/routes/terminal.rs

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/terminal/ws", get(terminal_ws_handler))
}

/// WebSocket upgrade handler -- spawns a PTY and bridges I/O.
async fn terminal_ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
    RequireAuth(_session): RequireAuth,
) -> Response {
    // CAS connection limit (same pattern as chat.rs)
    let guard = TerminalConnectionGuard::try_new()
        .ok_or_else(|| /* 429 too many connections */)?;

    ws.on_upgrade(move |socket| handle_terminal_session(socket, state, guard))
}
```

### Two Connection Modes

**Mode 1: Local PTY** (primary, covers the main use case):
- Spawn a shell (`/bin/bash` or `$SHELL`) via the `portable-pty` crate
- The PTY process runs as the user who launched the Tauri app
- Lower latency, simpler, no SSH credential management
- Works when the app runs directly on any machine

**Mode 2: SSH Relay** (future enhancement, for remote OpenClaw VM access):
- Use `russh` crate (async Rust SSH client) to connect to the OpenClaw VM
- SSH credentials managed via `AppState.secret("TERMINAL_SSH_KEY")` or similar
- Important: `~/.ssh/mission-control` has a passphrase -- needs SSH agent forwarding or a separate key
- Defer to Phase 2; local PTY covers the main use case

**Recommendation: Start with `portable-pty` for local mode.** This covers 80% of use cases. SSH relay is a well-scoped follow-up.

### PTY Session Lifecycle

```rust
async fn handle_terminal_session(
    mut ws: WebSocket,
    state: AppState,
    _guard: TerminalConnectionGuard,
) {
    // 1. Spawn PTY with the user's default shell
    let pair = PtyPair::new(/* size from first WS message */);
    let mut reader = pair.slave.try_clone_reader()?;
    let mut writer = pair.master.take_writer()?;

    // 2. Bidirectional bridge
    // WS -> PTY stdin (user keystrokes)
    // PTY stdout -> WS (terminal output)

    // 3. Resize handling: WS resize messages update PTY size

    // 4. Idle timeout: close after 30 min no I/O

    // 5. On WS close: kill PTY process, drop guard (frees connection slot)
}
```

### Frontend: xterm.js Component

Use `@xterm/xterm` (rebranded xterm.js v5+) with addons:

```
Packages:
  @xterm/xterm           -- Core terminal emulator
  @xterm/addon-fit       -- Auto-resize terminal to container
  @xterm/addon-attach    -- WebSocket I/O bridge (optional, can do manually)
  @xterm/addon-web-links -- Clickable URLs in terminal output
```

```typescript
// components/Terminal.tsx
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

export default function TerminalComponent({ widgetId, size }: WidgetProps) {
  const termRef = useRef<HTMLDivElement>(null)
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    const term = new Terminal({
      theme: {
        background: 'var(--bg-base)',     // Match app theme
        foreground: 'var(--text-primary)',
        cursor: 'var(--accent)',
        selectionBackground: 'var(--accent-a30)',
      },
      fontFamily: '"JetBrains Mono", "Fira Code", monospace',
      fontSize: 13,
      cursorBlink: true,
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(termRef.current!)
    fitAddon.fit()

    // WebSocket connection
    const ws = new WebSocket(`ws://localhost:3000/api/terminal/ws`)
    wsRef.current = ws

    ws.onopen = () => {
      // Send initial terminal size
      ws.send(JSON.stringify({
        type: 'resize',
        cols: term.cols,
        rows: term.rows,
      }))
    }

    // Terminal -> WebSocket (user input)
    term.onData(data => ws.send(data))

    // WebSocket -> Terminal (PTY output)
    ws.onmessage = (event) => {
      if (typeof event.data === 'string') {
        term.write(event.data)
      }
    }

    // Resize observer for widget container
    const observer = new ResizeObserver(() => fitAddon.fit())
    observer.observe(termRef.current!)

    return () => {
      observer.disconnect()
      ws.close()
      term.dispose()
    }
  }, [])

  return <div ref={termRef} style={{ width: '100%', height: '100%' }} />
}
```

### Widget Registry Integration

```typescript
registerWidget({
  id: 'terminal',
  name: 'Terminal',
  description: 'Interactive terminal session',
  icon: 'Terminal',
  category: 'productivity',
  tier: 'builtin',
  defaultSize: { w: 6, h: 4 },
  minSize: { w: 3, h: 2 },
  component: () => import('@/components/Terminal'),
  metadata: { requiresService: 'local' },
})
```

Also available as a full page (route `/terminal`) for users who want a dedicated terminal experience.

### WebSocket Connection Limits

Follow the existing CAS (Compare-and-Swap) connection guard pattern from `chat.rs`:

```rust
static TERMINAL_WS_CONNECTIONS: AtomicUsize = AtomicUsize::new(0);
const MAX_TERMINAL_CONNECTIONS: usize = 3;

struct TerminalConnectionGuard;

impl TerminalConnectionGuard {
    fn try_new() -> Option<Self> {
        loop {
            let current = TERMINAL_WS_CONNECTIONS.load(Ordering::Acquire);
            if current >= MAX_TERMINAL_CONNECTIONS { return None; }
            if TERMINAL_WS_CONNECTIONS.compare_exchange(
                current, current + 1,
                Ordering::AcqRel, Ordering::Acquire,
            ).is_ok() {
                return Some(Self);
            }
        }
    }
}

impl Drop for TerminalConnectionGuard {
    fn drop(&mut self) {
        TERMINAL_WS_CONNECTIONS.fetch_sub(1, Ordering::AcqRel);
    }
}
```

### Security Considerations

- Terminal sessions gated via `RequireAuth` (MFA verified)
- PTY process runs as the app user (not root), inherits their permissions
- No shell injection vector -- WebSocket passes raw bytes, not command strings
- Idle timeout: close PTY after 30 minutes of no I/O activity
- `MC_API_KEY` required for WebSocket upgrade (existing auth middleware handles this)
- Max 3 concurrent terminals to prevent resource exhaustion
- Terminal output is not logged (privacy -- user's shell activity)

---

## Feature 4: Theme Blend Slider

### Current State

The theme system has five layers:

1. **`theme-definitions.ts`**: 24 built-in themes, each with a `colors: Record<string, string>` map of CSS custom property names to values. Dark/light counterpart mapping via `COUNTERPART_MAP`.
2. **`theme-store.ts`**: `useSyncExternalStore` pattern managing `ThemeState` (mode, activeThemeId, overrides, customThemes, schedule).
3. **`theme-engine.ts`**: Resolves which theme to apply and sets CSS custom properties on `document.documentElement` via `el.style.setProperty()`.
4. **`themes.ts`**: Helper functions (`applyAccentColor`, `applySecondaryColor`, etc.) that generate dim/bright/solid variants from a base color.
5. **`globals.css`**: `:root` block (~250 CSS variables for dark defaults) + `[data-theme="light"]` block (~80 overrides for light mode) + `[data-accent]` block for dynamic accent borders/glows.

### How Theme Application Currently Works

```
User selects theme --> theme-store mutate() --> persist to localStorage
  --> applyTheme(state) in theme-engine.ts
    --> resolveThemeDefinition(state) --> picks ThemeDefinition
    --> iterate theme.colors: el.style.setProperty('--' + key, value)
    --> apply accent/secondary/tertiary overrides
    --> apply fonts, glow, radius, panel opacity overrides
    --> set data-theme="dark"|"light" attribute
```

### Integration Strategy: CSS Custom Property Interpolation in JavaScript

The blend slider creates a continuous spectrum between a dark theme and its light counterpart by interpolating every CSS custom property that differs.

**The interpolation happens in `theme-engine.ts`, NOT in CSS.**

Reasons:
1. CSS `color-mix()` only works for color values, but themes also differ in numeric values (`--glow-opacity`, `--radius-md`)
2. Some values use `rgba()` with varying alpha channels that need per-component interpolation
3. The theme system already applies properties via `el.style.setProperty()` in JS -- adding interpolation there is natural
4. JS gives control over the color space used (oklch for perceptual uniformity)

### ThemeState Extension

```typescript
// In theme-definitions.ts
export interface ThemeState {
  mode: 'dark' | 'light' | 'system'
  activeThemeId: string
  overrides: Record<string, UserThemeOverrides>
  customThemes: ThemeDefinition[]
  schedule?: ThemeSchedule
  blendPosition?: number  // NEW: 0.0 = fully dark, 1.0 = fully light
  // ... existing fields
}
```

### Interpolation Logic

```typescript
// theme-engine.ts -- new exports

/**
 * Interpolate between two theme definitions at position t.
 * t=0: fully darkTheme, t=1: fully lightTheme
 */
export function interpolateThemes(
  darkTheme: ThemeDefinition,
  lightTheme: ThemeDefinition,
  t: number,
): Record<string, string> {
  const result: Record<string, string> = {}
  const allKeys = new Set([
    ...Object.keys(darkTheme.colors),
    ...Object.keys(lightTheme.colors),
  ])

  for (const key of allKeys) {
    const darkVal = darkTheme.colors[key]
    const lightVal = lightTheme.colors[key]

    if (!darkVal || !lightVal) {
      // Only one theme defines this -- use whichever exists
      result[key] = (t < 0.5 ? darkVal : lightVal) || darkVal || lightVal
      continue
    }

    result[key] = interpolateValue(darkVal, lightVal, t)
  }

  return result
}

function interpolateValue(a: string, b: string, t: number): string {
  // Case 1: Both are hex colors (#rrggbb)
  if (a.startsWith('#') && b.startsWith('#')) {
    return interpolateHexOklch(a, b, t)
  }
  // Case 2: Both are rgba() colors
  if (a.startsWith('rgba(') && b.startsWith('rgba(')) {
    return interpolateRgba(a, b, t)
  }
  // Case 3: Both are numbers (e.g., glow-opacity: 0.10 vs 0.06)
  const na = parseFloat(a), nb = parseFloat(b)
  if (!isNaN(na) && !isNaN(nb)) {
    return String(na + (nb - na) * t)
  }
  // Case 4: Non-interpolatable -- snap at midpoint
  return t < 0.5 ? a : b
}
```

### Color Space: oklch for Perceptual Uniformity

RGB interpolation produces muddy gray/brown midpoints when blending dark and light themes. oklch maintains perceptual brightness and saturation through the blend.

Add `parseColorToOklch()` and `oklchToHex()` helpers to `themes.ts`:

```typescript
// themes.ts -- new helpers

interface Oklch { L: number; C: number; h: number }

function hexToOklch(hex: string): Oklch { /* ... */ }
function oklchToHex(oklch: Oklch): string { /* ... */ }

export function interpolateHexOklch(a: string, b: string, t: number): string {
  const ca = hexToOklch(a)
  const cb = hexToOklch(b)
  return oklchToHex({
    L: ca.L + (cb.L - ca.L) * t,
    C: ca.C + (cb.C - ca.C) * t,
    h: ca.h + (cb.h - ca.h) * t,  // Handle hue wrapping for 360-degree space
  })
}
```

### Integration with `applyTheme()`

Modify the existing `applyTheme()` function in `theme-engine.ts`:

```typescript
export function applyTheme(state: ThemeState): void {
  const t = state.blendPosition ?? (state.mode === 'light' ? 1.0 : 0.0)

  if (t === 0.0 || t === 1.0) {
    // Pure mode: existing behavior, no interpolation overhead
    const theme = resolveThemeDefinition(state)
    applyThemeDefinition(theme, state)
  } else {
    // Blend mode: interpolate between dark and light counterparts
    const darkTheme = resolveThemeDefinition({ ...state, mode: 'dark' })
    const lightTheme = resolveThemeDefinition({ ...state, mode: 'light' })
    const blended = interpolateThemes(darkTheme, lightTheme, t)

    const el = document.documentElement
    for (const [key, value] of Object.entries(blended)) {
      el.style.setProperty(`--${key}`, value)
    }

    // Set data-theme based on dominant side (for CSS selectors)
    el.setAttribute('data-theme', t < 0.5 ? 'dark' : 'light')
  }
}
```

### Theme Pairing

The blend slider needs two themes to interpolate between. Use the existing `COUNTERPART_MAP` from `theme-definitions.ts`:

```typescript
export const COUNTERPART_MAP: Record<string, string> = {
  'default-dark': 'default-light',
  'midnight-blue': 'ocean-breeze',
  // ... etc
}
```

When the user's active theme is `default-dark`, the slider blends toward `default-light`. If no counterpart exists, the slider is disabled (or blends toward the built-in default-light).

### UI Component

Add to `SettingsDisplay.tsx` in the mode selector card, after the Dark/Light/System mode buttons:

```typescript
{state.mode !== 'system' && (
  <div style={{ marginTop: 12, padding: '0 4px' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
        Blend
      </span>
      <span style={{ fontSize: 10, color: 'var(--text-muted)', opacity: 0.5 }}>
        {Math.round((state.blendPosition ?? 0) * 100)}%
      </span>
    </div>
    <input
      type="range"
      min={0} max={100} step={1}
      value={(state.blendPosition ?? 0) * 100}
      onChange={e => setBlendPosition(Number(e.target.value) / 100)}
      aria-label="Theme blend between dark and light"
      style={{ width: '100%' }}
    />
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', opacity: 0.4 }}>
      <span>Dark</span>
      <span>Light</span>
    </div>
  </div>
)}
```

### Performance: RAF-Throttled Application

The slider fires `onChange` continuously during drag. Applying ~80 CSS custom properties per frame needs throttling:

```typescript
// theme-store.ts
let _rafId: number | null = null

export function setBlendPosition(t: number) {
  mutate(s => ({ ...s, blendPosition: t }))
  if (_rafId) cancelAnimationFrame(_rafId)
  _rafId = requestAnimationFrame(() => {
    applyTheme(getThemeState())
    _rafId = null
  })
}
```

### Modified Files

| File | Change |
|------|--------|
| `theme-definitions.ts` | Add `blendPosition?: number` to `ThemeState` interface |
| `theme-store.ts` | Add `setBlendPosition()` mutation with RAF throttling |
| `theme-engine.ts` | Add `interpolateThemes()`, modify `applyTheme()` to use blend when set |
| `themes.ts` | Add `hexToOklch()`, `oklchToHex()`, `interpolateHexOklch()`, `interpolateRgba()` helpers |
| `SettingsDisplay.tsx` | Add blend slider UI in mode selector section |
| `globals.css` | **NO CHANGE** (interpolation done in JS, `[data-theme]` attribute still set) |

---

## Feature 5: Project Tracker

### Architecture Decision: Supabase Table, Not CouchDB

**Use Supabase PostgreSQL** because:
1. Projects have structured, relational data (status, assignee, priority, dates, column ordering) -- PostgreSQL excels at this
2. Kanban boards need efficient filtered queries (`WHERE column_id = ? AND deleted_at IS NULL ORDER BY sort_order`) -- SQL is natural
3. Supabase Realtime provides instant multi-device sync (already used for todos, agents, preferences, missions)
4. CouchDB is for unstructured document content (notes); project metadata is not a document
5. RLS user isolation is already established across 21 tables (migration `20260316000000_rls_user_isolation.sql`)
6. The soft-delete pattern (`deleted_at TIMESTAMPTZ`) is standard across the app

### Database Schema

New migration: `supabase/migrations/20260322000000_projects.sql`

```sql
-- Project boards
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  color TEXT DEFAULT '#a78bfa',
  icon TEXT DEFAULT 'Kanban',
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- Kanban columns (lanes)
CREATE TABLE IF NOT EXISTS project_columns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  name TEXT NOT NULL,
  color TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  wip_limit INTEGER,           -- Optional work-in-progress limit
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Project items (cards)
CREATE TABLE IF NOT EXISTS project_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  column_id UUID NOT NULL REFERENCES project_columns(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  priority TEXT CHECK (priority IN ('none', 'low', 'medium', 'high', 'urgent')) DEFAULT 'none',
  status TEXT CHECK (status IN ('todo', 'in_progress', 'done', 'blocked')) DEFAULT 'todo',
  assignee TEXT,
  labels TEXT[] DEFAULT '{}',
  due_date DATE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- RLS (FORCE mode, matching existing security pattern)
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects FORCE ROW LEVEL SECURITY;
ALTER TABLE project_columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_columns FORCE ROW LEVEL SECURITY;
ALTER TABLE project_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_items FORCE ROW LEVEL SECURITY;

CREATE POLICY "Users own their projects"
  ON projects FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Users own their columns"
  ON project_columns FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Users own their items"
  ON project_items FOR ALL USING (user_id = auth.uid());

-- Realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE projects;
ALTER PUBLICATION supabase_realtime ADD TABLE project_columns;
ALTER PUBLICATION supabase_realtime ADD TABLE project_items;

-- Indexes for common queries
CREATE INDEX idx_project_items_column ON project_items(column_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_project_items_project ON project_items(project_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_projects_user ON projects(user_id) WHERE deleted_at IS NULL;

-- Default columns for new projects (seeded via the app, not SQL)
```

### Backend: Axum Route Module

Follow the same pattern as `todos.rs` -- query Supabase via PostgREST or direct SQL through the session's access token:

```rust
// src-tauri/src/routes/projects.rs

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/projects", get(list_projects).post(create_project))
        .route("/projects/{id}", get(get_project).put(update_project).delete(soft_delete_project))
        .route("/projects/{id}/columns", get(list_columns).post(create_column))
        .route("/projects/{id}/columns/reorder", post(reorder_columns))
        .route("/projects/{id}/columns/{col_id}", put(update_column).delete(delete_column))
        .route("/projects/{id}/items", get(list_items).post(create_item))
        .route("/projects/{id}/items/{item_id}", put(update_item).delete(soft_delete_item))
        .route("/projects/{id}/items/{item_id}/move", post(move_item))
}

/// Move an item between columns or reorder within a column.
/// Accepts: { column_id, sort_order }
async fn move_item(/* ... */) -> Result<Json<Value>, AppError> {
    // Update item's column_id and sort_order
    // Shift other items' sort_order as needed
}
```

### Frontend Components

```
frontend/src/pages/projects/           (NEW directory)
  ProjectsPage.tsx                      Board selector + kanban view
  KanbanBoard.tsx                       Drag-and-drop board
  ProjectCard.tsx                       Individual card on the board
  ColumnHeader.tsx                      Column header with title, WIP count, add button
  ProjectSettings.tsx                   Project metadata editor (name, color, icon)
  AddItemModal.tsx                      Quick-add card modal
  types.ts                              TypeScript interfaces
```

### Drag-and-Drop for Kanban

Use HTML5 Drag and Drop API with `onDragStart`, `onDragOver`, `onDrop` handlers. The existing codebase already implements DnD this way (sidebar categories, widget grid). No external DnD library needed.

```typescript
// KanbanBoard.tsx drag handling
function handleDragStart(e: DragEvent, itemId: string, columnId: string) {
  e.dataTransfer.setData('text/plain', JSON.stringify({ itemId, columnId }))
  e.dataTransfer.effectAllowed = 'move'
}

function handleDrop(e: DragEvent, targetColumnId: string, targetIndex: number) {
  const { itemId, columnId: sourceColumnId } = JSON.parse(e.dataTransfer.getData('text/plain'))
  moveItem.mutate({ itemId, targetColumnId, targetIndex })
}
```

### React Query Integration

```typescript
// lib/query-keys.ts additions
export const projectKeys = {
  all: ['projects'] as const,
  detail: (id: string) => ['projects', id] as const,
  columns: (id: string) => ['projects', id, 'columns'] as const,
  items: (id: string) => ['projects', id, 'items'] as const,
}
```

### Realtime Sync

```typescript
useSupabaseRealtime({
  table: 'project_items',
  filter: `project_id=eq.${projectId}`,
  onInsert: () => queryClient.invalidateQueries(projectKeys.items(projectId)),
  onUpdate: () => queryClient.invalidateQueries(projectKeys.items(projectId)),
  onDelete: () => queryClient.invalidateQueries(projectKeys.items(projectId)),
})
```

### Widget Registration

```typescript
registerWidget({
  id: 'project-board',
  name: 'Project Board',
  description: 'Kanban-style project tracking',
  icon: 'Kanban',
  category: 'productivity',
  tier: 'builtin',
  defaultSize: { w: 6, h: 4 },
  minSize: { w: 4, h: 3 },
  configSchema: {
    fields: [{
      key: 'projectId',
      label: 'Project',
      type: 'select',
      default: '',
      options: [],  // Populated dynamically from user's projects
    }],
  },
  component: () => import('@/pages/projects/KanbanBoard'),
})
```

### Default Project Template

When creating a new project, seed 4 default columns:

```typescript
const DEFAULT_COLUMNS = [
  { name: 'Backlog', color: 'var(--text-muted)', sort_order: 0 },
  { name: 'To Do', color: 'var(--blue)', sort_order: 1 },
  { name: 'In Progress', color: 'var(--amber)', sort_order: 2 },
  { name: 'Done', color: 'var(--green)', sort_order: 3 },
]
```

---

## Build Order and Dependencies

```
Phase 1: Independent foundations (all parallel, no interdependencies)
  +-- Theme Blend Slider        (modifies existing theme system only, 6 files)
  +-- OpenClaw Gateway Routes   (new Axum module + frontend page, ~15 files)
  +-- Project Tracker Schema    (new Supabase migration + Axum routes + page, ~12 files)

Phase 2: Complex features (after Phase 1 patterns are proven)
  +-- TipTap Editor             (rewrite NoteEditor + EditorToolbar + 2 new extensions)
  +-- Terminal Widget           (new WebSocket route + xterm.js component)

Phase 3: Integration and polish
  +-- Wire into Widget Registry (Terminal, Project Board widgets)
  +-- Add to sidebar modules    (OpenClaw, Projects)
  +-- Settings/connections      (OpenClaw API URL configuration)
```

### Rationale for This Order

1. **Phase 1 features are independent** -- no deps between theme slider, gateway routes, and project tracker. All three can be built in parallel by different agents.

2. **Theme Blend Slider is smallest scope** -- ~6 modified files, no new backend routes, no database changes. Quick win that visually demonstrates progress.

3. **Gateway Routes and Project Tracker are standard CRUD** -- follow established patterns (memory.rs proxy pattern, todos.rs Supabase pattern). Low risk.

4. **TipTap Editor in Phase 2** -- highest complexity and risk due to markdown round-trip fidelity concerns. Benefits from having other features done so it gets focused attention. The `@tiptap/extension-markdown` is "early release" and needs thorough testing.

5. **Terminal Widget in Phase 2** -- WebSocket + PTY is complex systems programming. The WebSocket pattern from `chat.rs` provides a template, but PTY lifecycle management is new territory in the codebase. `portable-pty` crate needs evaluation.

6. **Integration last** -- widget registration, sidebar modules, and settings wiring should happen after core features are functional.

### Dependency Graph

```
Theme Blend      --> (none)
Gateway Routes   --> (none)
Project Tracker  --> (none, but migration needs db:push before testing)
TipTap Editor    --> (none, but install @tiptap/* packages first)
Terminal Widget  --> (none, but install @xterm/* and portable-pty crate first)

Widget Registry  --> Terminal + Projects must be functional first
Sidebar Modules  --> OpenClaw page + Projects page must be functional first
```

---

## New vs Modified Files

### New Files: Backend (Rust)

| File | Purpose | Lines (est.) |
|------|---------|-------------|
| `src-tauri/src/routes/gateway.rs` | Generic OpenClaw gateway proxy | ~200 |
| `src-tauri/src/routes/terminal.rs` | WebSocket terminal relay + PTY management | ~250 |
| `src-tauri/src/routes/projects.rs` | Project tracker CRUD via Supabase | ~300 |
| `supabase/migrations/20260322000000_projects.sql` | Projects schema + RLS + indexes | ~60 |

### New Files: Frontend (TypeScript/React)

| File | Purpose |
|------|---------|
| `pages/openclaw/OpenClawPage.tsx` | Main controller page with tab navigation |
| `pages/openclaw/AgentManager.tsx` | Agent CRUD with inline editing |
| `pages/openclaw/CronManager.tsx` | Cron job CRUD (create/edit/delete/toggle) |
| `pages/openclaw/SessionList.tsx` | Active sessions with terminate action |
| `pages/openclaw/ModelSelector.tsx` | Available models grid |
| `pages/openclaw/UsageDashboard.tsx` | Usage/cost visualization |
| `pages/openclaw/ToolRegistry.tsx` | Available tools listing |
| `pages/openclaw/types.ts` | TypeScript interfaces for gateway resources |
| `pages/projects/ProjectsPage.tsx` | Board selector + kanban view |
| `pages/projects/KanbanBoard.tsx` | Drag-and-drop kanban board |
| `pages/projects/ProjectCard.tsx` | Individual card component |
| `pages/projects/ColumnHeader.tsx` | Column header with controls |
| `pages/projects/ProjectSettings.tsx` | Project metadata editor |
| `pages/projects/types.ts` | TypeScript interfaces |
| `pages/notes/WikilinkExtension.ts` | Custom TipTap Node for `[[link]]` |
| `pages/notes/ImageEmbedExtension.ts` | Custom TipTap Node for `![[image]]` |
| `components/Terminal.tsx` | xterm.js terminal component |
| `hooks/useTerminal.ts` | Terminal WebSocket lifecycle hook |

### Modified Files: Backend (Rust)

| File | Change |
|------|--------|
| `src-tauri/src/routes/mod.rs` | Add `pub mod gateway; pub mod terminal; pub mod projects;` and merge their routers |
| `src-tauri/Cargo.toml` | Add `portable-pty` dependency |

### Modified Files: Frontend (TypeScript/React)

| File | Change |
|------|--------|
| `pages/notes/NoteEditor.tsx` | **REWRITE** -- CodeMirror to TipTap `useEditor` |
| `pages/notes/EditorToolbar.tsx` | **REWRITE** -- TipTap chain commands replacing CodeMirror dispatches |
| `pages/notes/wikilinkCompletion.ts` | **DELETE** -- replaced by WikilinkExtension |
| `pages/notes/Notes.tsx` | Minor: remove `viewRef` pattern, adjust toolbar props |
| `lib/theme-definitions.ts` | Add `blendPosition?: number` to `ThemeState` |
| `lib/theme-store.ts` | Add `setBlendPosition()` with RAF throttling |
| `lib/theme-engine.ts` | Add `interpolateThemes()`, modify `applyTheme()` |
| `lib/themes.ts` | Add oklch conversion + interpolation helpers |
| `pages/settings/SettingsDisplay.tsx` | Add blend slider UI in mode selector |
| `lib/modules.ts` | Register OpenClaw + Projects modules |
| `lib/query-keys.ts` | Add `gatewayKeys` + `projectKeys` |
| `lib/widget-registry.ts` | Register Terminal + Project Board widgets |
| `package.json` | Add @tiptap/*, @xterm/* packages; remove @codemirror/* packages |

### Unchanged Files (Critical -- DO NOT TOUCH)

| File | Why Unchanged |
|------|---------------|
| `lib/vault.ts` | Already stores/loads raw markdown -- works with TipTap as-is |
| `routes/vault.rs` | Already assembles markdown from LiveSync chunks -- no change needed |
| `pages/notes/BacklinksPanel.tsx` | Consumes `note.links` array, not editor internals |
| `pages/notes/GraphView.tsx` | Uses note metadata arrays, not editor |
| `pages/notes/FileTree.tsx` | Uses note list data, not editor |
| `pages/notes/types.ts` | `VaultNote` interface unchanged -- still has `content: string` |
| `routes/chat.rs` | Existing chat WebSocket unrelated to terminal |
| `routes/agents.rs` | Continues managing local SQLite agents; gateway routes are additive |
| `routes/openclaw_cli.rs` | Continues working for local CLI; gateway routes are additive |

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Storing TipTap JSON in CouchDB
**What:** Saving TipTap's internal ProseMirror JSON document structure instead of markdown.
**Why bad:** Breaks Obsidian LiveSync compatibility. Other clients (mobile Obsidian, desktop Obsidian) editing the same vault would see JSON gibberish instead of markdown. The entire vault ecosystem assumes plain text markdown in chunk data.
**Instead:** Always use `editor.getMarkdown()` to serialize before saving. Always use `setContent(md, { contentType: 'markdown' })` to load. The content field in CouchDB remains a plain markdown string.

### Anti-Pattern 2: Direct Gateway Calls from Frontend
**What:** Having React components call `http://10.0.0.173:18789/api/*` directly via fetch.
**Why bad:** Exposes Tailscale IP and gateway API credentials to the browser. Violates the zero-credential-in-frontend security model. Also bypasses rate limiting and auth middleware.
**Instead:** All gateway calls go through Axum routes (`/api/gateway/*`). Axum injects the `OPENCLAW_API_KEY` header server-side. Frontend only ever calls `localhost:3000`.

### Anti-Pattern 3: SSH Credentials in Terminal WebSocket Messages
**What:** Sending SSH username/password/key material through the WebSocket protocol from frontend to backend.
**Why bad:** WebSocket message contents are visible in browser devtools Network tab. Credentials would be exposed.
**Instead:** All SSH/PTY credentials stay in the Axum backend (retrieved via `AppState.secret()`). The WebSocket carries only raw terminal I/O bytes (stdin/stdout). The frontend never knows how the backend connects to the shell.

### Anti-Pattern 4: setInterval for Theme Blend Updates
**What:** Using `setInterval` to poll the blend slider position and re-apply theme properties.
**Why bad:** Wasteful CPU, creates jank when dragging the slider. The theme system already uses event-driven updates.
**Instead:** Use `requestAnimationFrame` throttling triggered by the slider's `onChange` event. One RAF per frame, cancels pending frames on new input.

### Anti-Pattern 5: Single Table for Projects/Columns/Items
**What:** Cramming projects, columns, and items into one table with a `type` discriminator column.
**Why bad:** Cannot use foreign key constraints or cascade deletes. Queries become complex. Violates normal form. The existing codebase uses separate tables for related entities (e.g., `mission_events` referencing `missions`).
**Instead:** Three tables with proper foreign keys and `ON DELETE CASCADE`.

### Anti-Pattern 6: Building a Custom Markdown Parser for TipTap
**What:** Writing a custom markdown-to-ProseMirror parser from scratch instead of using `@tiptap/extension-markdown`.
**Why bad:** Enormous scope, guaranteed bugs, maintenance burden. The official extension handles CommonMark correctly and supports custom tokenizers for extensions.
**Instead:** Use `@tiptap/extension-markdown` and only add custom tokenizers for non-standard syntax (`[[wikilinks]]`, `![[embeds]]`).

---

## Sources

### High Confidence (official docs, codebase analysis)
- [TipTap Markdown Documentation](https://tiptap.dev/docs/editor/markdown) -- Official docs for @tiptap/extension-markdown
- [TipTap Markdown Installation](https://tiptap.dev/docs/editor/markdown/getting-started/installation) -- Package names and setup
- [TipTap Markdown Basic Usage](https://tiptap.dev/docs/editor/markdown/getting-started/basic-usage) -- getMarkdown() and setContent APIs
- [TipTap React Integration](https://tiptap.dev/docs/editor/getting-started/install/react) -- React bindings and useEditor hook
- [TipTap Markdown Release (March 2026)](https://tiptap.dev/blog/release-notes/introducing-bidirectional-markdown-support-in-tiptap) -- Release date and "early release" status
- [CSS color-mix() - MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/color_value/color-mix) -- Color interpolation reference
- [xterm.js Official](https://xtermjs.org/) -- Terminal emulator library
- Codebase analysis of 20+ source files -- PRIMARY source for all integration decisions

### Medium Confidence (verified third-party)
- [TipTap WikiLink Extension](https://github.com/aarkue/tiptap-wikilink-extension) -- Reference for custom wikilink node design
- [react-xtermjs](https://www.qovery.com/blog/react-xtermjs-a-react-library-to-build-terminals) -- React integration patterns for xterm.js
- [CSS color-mix() Chrome DevRel](https://developer.chrome.com/docs/css-ui/css-color-mix) -- oklch color space for perceptual uniformity
