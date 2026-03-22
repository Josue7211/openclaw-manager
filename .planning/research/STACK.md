# Technology Stack

**Project:** OpenClaw Manager v0.0.3 -- Bug Fixes + OpenClaw Controller + Notes Editor + Theme Blend + Terminal
**Researched:** 2026-03-22

## Recommended Stack Additions

Four new capability areas require new dependencies. The existing core (Tauri v2, Axum, React 19, Vite 8, TanStack React Query 5, Supabase, CouchDB) remains unchanged.

---

### 1. Rich Text Notes Editor (TipTap / ProseMirror)

**Why TipTap over CodeMirror:** CodeMirror is a code editor that renders markdown as source text with syntax highlighting. TipTap is a WYSIWYG rich text editor built on ProseMirror -- it renders formatted output (bold text looks bold, headings are large, tables are visual grids). The project goal is "Google Docs-level editing," which is fundamentally a WYSIWYG problem. CodeMirror cannot do this without rebuilding ProseMirror on top of it.

**Why TipTap v3 specifically:** TipTap 3.x (current: 3.20.x) ships official `@tiptap/markdown` for bidirectional markdown conversion. This is critical because notes are stored as markdown in CouchDB (Obsidian LiveSync format). The editor must consume markdown on load and emit markdown on save. The community `tiptap-markdown` package is now deprecated in favor of the official extension.

| Package | Version | Purpose | Why This One |
|---------|---------|---------|--------------|
| `@tiptap/react` | ^3.20.4 | React bindings + core editor | Includes core, no separate `@tiptap/core` needed. Declarative `<Tiptap>` component or `useEditor` hook. |
| `@tiptap/pm` | ^3.20.4 | ProseMirror peer dependency | Required by all TipTap extensions. Bundles prosemirror-state, -view, -model, -transform. |
| `@tiptap/starter-kit` | ^3.20.4 | Base extensions bundle | Paragraph, heading (1-6), bold, italic, strike, code, blockquote, bullet list, ordered list, hard break, horizontal rule, history. Replaces 15+ individual extension imports. |
| `@tiptap/extension-table` | ^3.20.1 | Visual table editing | Tables with row/column add/remove, cell merge, resize. Google Docs parity. |
| `@tiptap/extension-table-row` | ^3.20.0 | Table row node | Required peer of `@tiptap/extension-table`. |
| `@tiptap/extension-table-header` | ^3.20.0 | Table header cell node | Required peer of `@tiptap/extension-table`. |
| `@tiptap/extension-table-cell` | ^3.20.0 | Table cell node | Required peer of `@tiptap/extension-table`. |
| `@tiptap/extension-image` | ^3.20.2 | Inline/block images | Renders `<img>` with drag-resize. Replaces CodeMirror's `ImageWidget` hack. |
| `@tiptap/extension-link` | ^3.20.2 | Clickable links | Auto-detect URLs, paste URL on selection to create link. Replaces manual `[text](url)` insertion. |
| `@tiptap/extension-placeholder` | ^3.20.0 | Empty editor placeholder | "Start writing..." text. Replaces CodeMirror's `placeholder()`. |
| `@tiptap/extension-code-block-lowlight` | ^3.20.0 | Syntax-highlighted code blocks | Fenced code blocks with language detection. Uses lowlight for highlighting. |
| `@tiptap/extension-task-list` | ^3.20.0 | Checkbox task lists | Interactive `- [ ]` / `- [x]` checkboxes. Obsidian compatibility. |
| `@tiptap/extension-task-item` | ^3.20.0 | Task list items | Required peer of task-list. |
| `@tiptap/extension-highlight` | ^3.20.0 | Text highlighting | `==highlighted==` syntax support. |
| `@tiptap/extension-underline` | ^3.20.0 | Underline formatting | Cmd+U support. |
| `@tiptap/extension-text-align` | ^3.20.0 | Text alignment | Left/center/right/justify alignment. |
| `@tiptap/extension-typography` | ^3.20.0 | Smart quotes and dashes | Auto-converts `--` to em-dash, smart quotes, etc. |
| `@tiptap/extension-dropcursor` | ^3.20.0 | Drag-and-drop cursor | Visual indicator when dragging content. |
| `@tiptap/extension-gapcursor` | ^3.20.0 | Gap cursor for block nodes | Allows cursor placement before/after tables, images. |
| `@tiptap/markdown` | ^3.20.0 | Markdown import/export | Bidirectional markdown conversion. `editor.storage.markdown.getMarkdown()` to serialize, pass markdown as `content` to parse. No API calls needed. |
| `lowlight` | ^3.3.0 | Syntax highlighting engine | Required by `code-block-lowlight`. Decoupled so we control which languages are loaded. |

**Custom extension needed:** Wikilinks (`[[note title]]`). No maintained npm package exists. Build a custom TipTap node extension using TipTap's `Node.create()` API. The existing `wikilinkCompletion.ts` logic (autocomplete from `allNoteTitles`) translates directly to a TipTap `Suggestion` plugin. Reference: `aarkue/tiptap-wikilink-extension` on GitHub for the pattern, but vendor the ~100 lines rather than depending on an unpublished package.

**What gets removed:** All 8 `@codemirror/*` packages and `@lezer/highlight` (7 direct dependencies) are replaced by TipTap. The `EditorToolbar.tsx` formatting helpers (toggleWrap, toggleLinePrefix, etc.) are replaced by TipTap commands (`editor.chain().focus().toggleBold().run()`). The `imageEmbedPlugin` ViewPlugin is replaced by `@tiptap/extension-image`.

---

### 2. OpenClaw Gateway API Integration

**No new frontend dependencies.** The existing `api.ts` fetch wrapper + React Query pattern handles all API communication. OpenClaw gateway exposes a REST API; the Axum backend proxies requests to it.

**Backend (Rust) changes only -- no new crates:**

| What | How | Why |
|------|-----|-----|
| Agent CRUD routes | Extend `routes/agents.rs` with POST/DELETE + proxy to OpenClaw API | Existing `openclaw_api_url()` + `openclaw_api_key()` helpers already work. Add `POST /api/agents` (create), `DELETE /api/agents/:id` (delete), `POST /api/agents/:id/start`, `POST /api/agents/:id/stop`. |
| Cron CRUD routes | Extend `routes/openclaw_cli.rs` with POST/PUT/DELETE | Currently only `GET /crons`. Add `POST /api/crons` (create), `PUT /api/crons/:id` (update schedule/command), `DELETE /api/crons/:id`, `POST /api/crons/:id/run` (trigger). |
| Usage tracking | New `routes/usage.rs` with `GET /api/usage` | Proxy to OpenClaw gateway's `/usage` endpoint. Returns token counts, costs, model breakdown. No new crate -- `reqwest` + `serde_json` handle it. |
| Memory management | New `GET/POST /api/agents/:id/memory` | Proxy to OpenClaw's memory API. Read/write agent memory files. |

**Frontend patterns:**

| Pattern | Implementation |
|---------|---------------|
| Agent CRUD UI | React Query mutations with optimistic updates. `queryClient.invalidateQueries({ queryKey: ['agents'] })` on success. |
| Cron management | Same pattern. `useMutation` + invalidation. Form UI for cron expression + command. |
| Usage dashboard | `useQuery` with 60s `refetchInterval`. Chart primitives (BarChart, LineChart) already exist in widget system. |

---

### 3. Theme Blend Slider (CSS Color Interpolation)

**No new dependencies.** CSS `color-mix()` is Baseline Widely Available as of 2025. The existing theme engine already uses `color-mix()` in `globals.css` (line 339-340). The blend slider is a pure CSS + JavaScript feature.

**Implementation approach -- `color-mix(in oklch)` with a slider variable:**

| What | How | Why |
|------|-----|-----|
| Blend variable | `--theme-blend: 0` (dark) to `--theme-blend: 1` (light) on `:root` | Single CSS custom property drives all interpolated values. |
| Surface interpolation | `--bg-base: color-mix(in oklch, var(--dark-bg-base) calc((1 - var(--theme-blend)) * 100%), var(--light-bg-base))` | OKLCH produces perceptually uniform blends. sRGB would create muddy grays. |
| Accent preservation | Accent colors do NOT blend. They stay as-is regardless of slider position. | Users pick accent independently of dark/light. Blending would destroy the color identity. |
| ThemeState extension | Add `blendFactor?: number` to `UserThemeOverrides` interface | Persists to localStorage via existing theme store. 0=dark, 1=light, 0.5=twilight. |
| Engine integration | `applyThemeBlend(factor: number)` in `theme-engine.ts` | Reads dark and light ThemeDefinition for current theme pair (via COUNTERPART_MAP), computes blended values, applies to `:root`. |

**Why OKLCH over sRGB:** The existing `color-mix` usage in globals.css uses `srgb`, which works for simple alpha tinting. But surface color blending (dark gray to light white) through sRGB creates desaturated, muddy mid-values. OKLCH interpolation keeps perceived brightness linear, so a 50% blend looks genuinely halfway between dark and light. This is the CSS Color Level 4 recommended approach.

**What NOT to add:**
- No `colord` or `chroma.js` -- CSS `color-mix()` handles interpolation natively in the browser
- No JavaScript color math library -- the theme engine already has `darken()` and `lighten()` in `themes.ts`, and `color-mix()` replaces the need for JS-side interpolation

---

### 4. Terminal/Shell Widget (xterm.js + PTY)

**Why xterm.js:** It is the de facto standard for browser-based terminals. Powers VS Code's terminal, Hyper, and most browser IDE terminals. No viable alternative exists with comparable feature set, performance, and ecosystem.

**Why NOT `tauri-plugin-pty`:** The plugin (v0.1.1) is a community package with 137 weekly npm downloads. It couples PTY lifecycle to Tauri's plugin system, which is awkward for a widget that may be created/destroyed many times. Instead, use `portable-pty` directly in the Axum server with WebSocket transport -- this matches the existing WebSocket pattern used for OpenClaw chat (`routes/chat.rs`).

**Why WebSocket for PTY transport:** The existing chat system already uses Axum WebSocket upgrades with connection limiting (CAS-based `AtomicUsize` guards). The terminal widget follows the same pattern: WebSocket upgrade at `/api/terminal/ws`, bidirectional data flow, RAII connection guard for cleanup.

#### Frontend packages:

| Package | Version | Purpose | Why This One |
|---------|---------|---------|--------------|
| `@xterm/xterm` | ^6.0.0 | Terminal emulator | Latest major version. 30% smaller bundle than v5 (265kb vs 379kb). Scoped `@xterm/*` packages. |
| `@xterm/addon-fit` | ^0.11.0 | Auto-resize terminal to container | Essential for widget resize. Calls `term.fit()` when widget dimensions change. |
| `@xterm/addon-web-links` | ^0.12.0 | Clickable URLs in terminal output | Quality-of-life. Auto-detects URLs and makes them clickable. |

**Addons NOT needed:**
- `@xterm/addon-webgl` -- WebGL renderer is for high-throughput terminals (CI logs streaming). A widget terminal does not need it. Canvas renderer (default) is sufficient.
- `@xterm/addon-canvas` -- Only needed if explicitly opting out of the default renderer. Not necessary.
- `@xterm/addon-search` -- Terminal search is nice-to-have, add later if users request it.

#### Backend (Rust) crate:

| Crate | Version | Purpose | Why |
|-------|---------|---------|-----|
| `portable-pty` | ^0.9.0 | Cross-platform PTY spawning | From the wezterm project. Works on Linux, macOS, Windows. Provides `CommandBuilder`, `PtyPair`, bidirectional read/write. MIT licensed. |

**Architecture:**

```
React (xterm.js) <--WebSocket--> Axum (routes/terminal.rs) <--PTY--> /bin/bash (or ssh)
```

For remote execution (OpenClaw VM), the terminal widget spawns `ssh openclaw-vm` rather than a local shell. The SSH connection goes through Tailscale, so no additional auth is needed beyond the SSH key. The user's `~/.ssh/config` handles host resolution.

**Security considerations:**
- Terminal WebSocket requires `RequireAuth` (MFA-verified session)
- Connection limit: max 3 concurrent PTY sessions (same CAS pattern as chat)
- PTY spawns with user's environment, NOT root
- Shell command is configurable: default `$SHELL` or `/bin/bash`, user can override via Settings
- SSRF is not a concern -- PTY is local process spawning, not HTTP proxying

---

## Packages to Remove

| Package | Reason |
|---------|--------|
| `@codemirror/autocomplete` | Replaced by TipTap's suggestion/autocomplete API |
| `@codemirror/commands` | Replaced by TipTap commands (toggleBold, toggleItalic, etc.) |
| `@codemirror/lang-css` | No longer needed -- code blocks handled by lowlight |
| `@codemirror/lang-markdown` | TipTap IS the markdown editor, no separate language mode needed |
| `@codemirror/language` | Replaced by TipTap + lowlight |
| `@codemirror/language-data` | Replaced by lowlight language bundles |
| `@codemirror/search` | TipTap has its own search or use browser Cmd+F |
| `@codemirror/state` | ProseMirror state replaces CodeMirror state |
| `@codemirror/view` | ProseMirror view replaces CodeMirror view |
| `@lezer/highlight` | lowlight replaces Lezer for syntax highlighting |
| `marked` | TipTap's markdown extension handles parsing; `marked` was used for preview rendering which TipTap replaces with live WYSIWYG |

**Net dependency change:** Remove 11 packages, add ~22 TipTap packages + 3 xterm packages + 1 lowlight = ~26 new packages. However, TipTap's packages are lightweight wrappers (most are <5KB) over ProseMirror, and `@tiptap/pm` bundles all ProseMirror deps. Effective bundle impact is moderate.

---

## What Is NOT Needed

| Technology | Why Not |
|-----------|---------|
| `Monaco Editor` | Overkill for notes. Monaco is VS Code's editor -- designed for code, not prose. 5MB+ bundle. |
| `Slate.js` | Abandoned by core team. Last meaningful release was 2023. TipTap has stronger community and maintenance. |
| `Quill` | Outdated architecture (Quill 2.0 has been "coming soon" for years). No markdown round-trip support. |
| `@tiptap/extension-collaboration` | Real-time co-editing is out of scope for v0.0.3. Add later with Yjs when collaboration is prioritized. |
| `@tiptap/extension-mention` | Mentions are for multi-user apps. Single-user app does not need @-mentions. Wikilinks cover the linking use case. |
| `colord` / `chroma.js` / `color` | CSS `color-mix()` is native and sufficient for theme blending. No JS color math library needed. |
| `tauri-plugin-pty` | Too tightly coupled to Tauri plugin lifecycle. Direct `portable-pty` in Axum gives better control over PTY lifecycle, matches existing WebSocket patterns. |
| `react-xtermjs` / `@pablo-lion/xterm-react` | Thin React wrappers over xterm.js that add unnecessary abstraction. Direct xterm.js usage in a `useEffect` is ~30 lines and gives full control. |
| `Zustand` / `Jotai` | `useSyncExternalStore` pattern is established and sufficient. Adding a state library for 1-2 new features creates ecosystem fragmentation. |
| `Yjs` / `Automerge` | CRDT libraries for real-time collaboration. Not needed until collaboration feature is built. |

---

## Installation

```bash
# Frontend -- TipTap + xterm.js
cd frontend && npm install \
  @tiptap/react @tiptap/pm @tiptap/starter-kit @tiptap/markdown \
  @tiptap/extension-table @tiptap/extension-table-row \
  @tiptap/extension-table-header @tiptap/extension-table-cell \
  @tiptap/extension-image @tiptap/extension-link \
  @tiptap/extension-placeholder @tiptap/extension-code-block-lowlight \
  @tiptap/extension-task-list @tiptap/extension-task-item \
  @tiptap/extension-highlight @tiptap/extension-underline \
  @tiptap/extension-text-align @tiptap/extension-typography \
  @tiptap/extension-dropcursor @tiptap/extension-gapcursor \
  lowlight \
  @xterm/xterm @xterm/addon-fit @xterm/addon-web-links

# Frontend -- remove CodeMirror (after TipTap migration is complete)
cd frontend && npm uninstall \
  @codemirror/autocomplete @codemirror/commands @codemirror/lang-css \
  @codemirror/lang-markdown @codemirror/language @codemirror/language-data \
  @codemirror/search @codemirror/state @codemirror/view @lezer/highlight \
  marked

# Backend -- PTY support
cd src-tauri && cargo add portable-pty@0.9
```

---

## Integration Points with Existing Code

### TipTap <-> CouchDB/Vault

The notes system stores markdown in CouchDB via `lib/vault.ts`. The integration flow:

1. **Load:** `vault.getNote(id)` returns `VaultNote.content` (markdown string)
2. **Parse:** Pass markdown to TipTap via `@tiptap/markdown` -- `editor.commands.setContent(markdownString)` using markdown serializer
3. **Edit:** User edits in WYSIWYG mode
4. **Save:** `editor.storage.markdown.getMarkdown()` extracts markdown string
5. **Store:** `vault.updateNote(id, markdownContent)` writes back to CouchDB

The `VaultNote` type and vault API remain unchanged. Only the editor component changes.

### TipTap <-> Existing Features

| Feature | Migration Path |
|---------|---------------|
| Wikilinks (`[[note]]`) | Custom TipTap node extension. Renders as styled inline element (not raw `[[text]]`). Click handler calls `onWikilinkClick`. |
| Wikilink autocomplete | TipTap `Suggestion` plugin triggered by `[[`. Reuses `allNoteTitles` array from parent component. |
| Image embeds (`![[image.png]]`) | Custom TipTap node extension. On parse, converts `![[file]]` to `<img src="/api/vault/media/...">`. On serialize, converts back to `![[file]]`. |
| Formatting toolbar | Replace `EditorToolbar.tsx` entirely. TipTap commands: `editor.chain().focus().toggleBold().run()`. Toolbar reads `editor.isActive('bold')` for button state. |
| Backlinks panel | Unchanged. Reads from vault metadata, not from editor state. |
| Graph view | Unchanged. Reads link data from vault metadata. |
| File tree | Unchanged. Folder structure from vault API. |

### xterm.js <-> Axum WebSocket

Follows the same pattern as `routes/chat.rs`:

1. `GET /api/terminal/ws` -- WebSocket upgrade with `RequireAuth`
2. Axum handler spawns PTY via `portable-pty::CommandBuilder`
3. Bidirectional: `pty.reader -> ws.send()` and `ws.recv() -> pty.writer`
4. On WebSocket close, kill PTY process and clean up
5. RAII guard decrements connection counter

### Theme Blend <-> Existing Theme Engine

1. `ThemeState` gains `blendFactor?: number` in `theme-definitions.ts`
2. `UserThemeOverrides` gains `blendFactor?: number`
3. `theme-engine.ts` `applyTheme()` reads blend factor
4. When `blendFactor` is between 0 and 1 (exclusive), engine computes interpolated CSS variables between the dark theme and its light counterpart (via `COUNTERPART_MAP`)
5. Applies via `el.style.setProperty('--bg-base', color-mix(in oklch, ${darkVal} ${(1-blend)*100}%, ${lightVal}))`
6. Settings UI: range input slider in `SettingsDisplay.tsx`

---

## Confidence Assessment

| Area | Confidence | Basis |
|------|------------|-------|
| TipTap packages + versions | HIGH | npm registry (published 3 days ago), official docs |
| TipTap markdown round-trip | HIGH | Official `@tiptap/markdown` extension, documented bidirectional support |
| Wikilink custom extension | MEDIUM | Community example exists but no maintained npm package; custom code required |
| xterm.js v6 | HIGH | npm registry, v6.0.0 published Dec 2025 |
| portable-pty | HIGH | crates.io, part of wezterm project, actively maintained |
| CSS color-mix(in oklch) | HIGH | Baseline Widely Available 2025, MDN documentation |
| OpenClaw API surface | MEDIUM | Based on existing code patterns; actual API endpoints need verification against OpenClaw gateway docs |
| tauri-plugin-pty rejection | MEDIUM | Low download count (137/week) and tight Tauri coupling are real concerns; direct portable-pty is safer |

---

## Sources

- [TipTap React installation](https://tiptap.dev/docs/editor/getting-started/install/react) -- official docs
- [@tiptap/react npm](https://www.npmjs.com/package/@tiptap/react) -- v3.20.4, published 3 days ago
- [TipTap extensions overview](https://tiptap.dev/docs/editor/extensions/overview) -- table, image, code-block-lowlight, highlight, link
- [TipTap markdown announcement](https://tiptap.dev/blog/release-notes/introducing-bidirectional-markdown-support-in-tiptap) -- official bidirectional markdown
- [@tiptap/markdown npm](https://www.npmjs.com/package/@tiptap/markdown) -- official markdown extension
- [tiptap-markdown deprecation](https://www.npmjs.com/package/tiptap-markdown) -- community package deprecated in favor of official
- [aarkue/tiptap-wikilink-extension](https://github.com/aarkue/tiptap-wikilink-extension) -- reference implementation for wikilinks
- [@xterm/xterm npm](https://www.npmjs.com/package/@xterm/xterm) -- v6.0.0, published Dec 2025
- [xterm.js releases](https://github.com/xtermjs/xterm.js/releases) -- v6 breaking changes, 30% bundle reduction
- [portable-pty crates.io](https://crates.io/crates/portable-pty) -- v0.9.0
- [tauri-plugin-pty](https://github.com/Tnze/tauri-plugin-pty) -- v0.1.1, evaluated and rejected
- [CSS color-mix() MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value/color-mix) -- specification reference
- [CSS color-mix complete guide](https://devtoolbox.dedyn.io/blog/css-color-mix-complete-guide) -- OKLCH recommendation for perceptual uniformity
- Existing codebase: `frontend/package.json`, `src-tauri/Cargo.toml`, `NoteEditor.tsx`, `EditorToolbar.tsx`, `theme-engine.ts`, `theme-definitions.ts`, `routes/chat.rs`, `routes/agents.rs`, `routes/openclaw_cli.rs`
