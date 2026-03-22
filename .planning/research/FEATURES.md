# Feature Research: v0.0.3 New Features

**Domain:** Rich text editing, AI agent management, theme interpolation, embedded terminals, project tracking
**Researched:** 2026-03-22
**Confidence:** MEDIUM-HIGH

## Feature Landscape

This research covers the five major v0.0.3 feature areas identified in PROJECT.md. Each section maps table stakes, differentiators, and anti-features specific to that domain, with complexity estimates calibrated against the existing codebase.

---

### 1. Rich Text Editor (Google Docs-Level Notes)

**Current state:** CodeMirror 6 markdown editor with toolbar (bold/italic/strike/code/lists/links/blockquote/code blocks/headings), wikilink autocomplete, backlinks panel, graph view, image embeds via `![[file.png]]` syntax, CouchDB/Obsidian LiveSync storage.

**Target:** WYSIWYG editing comparable to Google Docs -- true rich text where formatting is inline rather than markdown syntax visible.

#### Table Stakes

| Feature | Why Expected | Complexity | Depends On |
|---------|--------------|------------|------------|
| WYSIWYG block editing (headings, paragraphs, lists) | Users typing bold text expect to see bold, not `**text**` | HIGH | TipTap migration |
| Inline formatting (bold, italic, strikethrough, code) | Same formatting the CodeMirror toolbar already does, but rendered inline | MEDIUM | TipTap migration |
| Tables (insert, resize columns, add/remove rows) | Google Docs comparison demands tables | MEDIUM | TipTap `@tiptap/extension-table` |
| Image embeds (drag-drop, paste, inline display) | Already works via `![[]]` syntax -- must not regress | MEDIUM | TipTap image extension + vault media proxy |
| Code blocks with syntax highlighting | Already works in CodeMirror -- must not regress | LOW | TipTap `@tiptap/extension-code-block-lowlight` |
| Slash commands (`/heading`, `/table`, `/code`) | Modern editors (Notion, Google Docs) train users to expect this | MEDIUM | TipTap suggestion API |
| Markdown paste support | Users copy markdown from the web and expect it to render | LOW | TipTap markdown extension handles this natively |
| Keyboard shortcuts (Cmd+B/I/K/Shift+S) | Already exist -- must not regress | LOW | TipTap keybindings map 1:1 |
| Undo/redo | Already exists via CodeMirror history -- must not regress | FREE | TipTap includes built-in history |
| Wikilink `[[note]]` support | Core Obsidian compatibility feature, already works | MEDIUM | Custom TipTap node extension |
| Backlinks panel | Already built as BacklinksPanel.tsx -- must not regress | LOW | Parse content for `[[links]]` same as today |
| CouchDB round-trip fidelity | Notes stored in CouchDB must not corrupt on save | HIGH | Markdown serialization must match Obsidian format |

#### Differentiators

| Feature | Value Proposition | Complexity | Depends On |
|---------|-------------------|------------|------------|
| Floating toolbar (select text to format) | Google Docs UX -- toolbar appears on selection | LOW | TipTap `BubbleMenu` built-in component |
| Embeds (YouTube, tweets, iframes) | Rich content beyond plain text | MEDIUM | TipTap `@tiptap/extension-embed` or custom node |
| Checklist items with completion state | Task lists within notes | LOW | TipTap `@tiptap/extension-task-list` |
| Note templates (meeting notes, daily journal, retro) | Structured starting points accelerate note creation | LOW | JSON template definitions applied on create |
| Version history (diff view) | See what changed, revert to previous | HIGH | CouchDB revisions + diff rendering |
| Real-time collaboration (cursor presence) | The "Google Docs" experience -- see other users editing | VERY HIGH | Yjs + Hocuspocus server + CouchDB sync |
| Drag-and-drop block reordering | Notion-style block manipulation | MEDIUM | TipTap drag handle extension |
| Full-text search across all notes | Find content inside notes, not just titles | MEDIUM | Backend search endpoint over CouchDB content |

#### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Real-time collaboration in v0.0.3 | "Google Docs-level" implies it | Requires Yjs + Hocuspocus server, new infrastructure, conflict resolution with CouchDB LiveSync, massive complexity | Defer to v0.0.4+; single-user WYSIWYG is already a huge upgrade |
| Obsidian plugin compatibility | Users expect Obsidian features | TipTap uses ProseMirror JSON internally, not markdown -- plugin APIs are completely different | Maintain Obsidian-format markdown on disk via TipTap markdown serializer |
| Full ProseMirror JSON storage | TipTap natively stores JSON | Breaks Obsidian LiveSync compatibility, notes become unreadable in Obsidian | Store as markdown in CouchDB, parse on load, serialize on save |
| Dual-pane editor (source + preview) | Power users want raw markdown | Adds UI complexity, two editors to maintain | Single WYSIWYG editor with "View Source" toggle for edge cases |
| WYSIWYG for Mermaid/LaTeX | Rich rendering of diagrams and math | Specialized renderers add complexity | Render in read mode only; plain text in edit mode |

**Key migration decision:** TipTap replaces CodeMirror as the editor engine. TipTap is built on ProseMirror and provides WYSIWYG editing with a headless, extension-based architecture. The critical constraint is that notes must remain stored as **markdown in CouchDB** for Obsidian compatibility. TipTap's markdown extension handles bidirectional parse/serialize, but the wikilink `[[syntax]]` needs a custom TipTap node that serializes back to `[[link]]` in markdown. HIGH confidence this is achievable -- TipTap's extension API is designed for exactly this.

---

### 2. OpenClaw Agent Management (Full Controller)

**Current state:** Read-only agent listing (AgentCard.tsx with name/emoji/role/model editing), read-only cron listing (WeekGrid + JobList from `openclaw` CLI), read-only session listing. The OpenClaw gateway has a full API surface (agents, crons, sessions, models, memory, tools, config, files, workspace, usage) but MC only uses chat + basic reads.

**Target:** Full CRUD control panel -- create/update/delete agents, manage crons, view usage metrics, manage memory, access terminal.

#### Table Stakes

| Feature | Why Expected | Complexity | Depends On |
|---------|--------------|------------|------------|
| Agent CRUD (create, update, delete) | Can't manage agents if you can only view them | MEDIUM | OpenClaw API endpoints (already exist) |
| Agent lifecycle controls (start, stop, restart, deploy) | Basic operational control | MEDIUM | OpenClaw API + status polling |
| Cron CRUD (create, update, delete, toggle enable/disable) | Currently read-only -- need full management | MEDIUM | OpenClaw API endpoints |
| Cron schedule editor (human-readable, not raw crontab) | Users shouldn't need to know cron syntax | MEDIUM | Cron expression builder UI component |
| Agent status monitoring (active/idle/error with live updates) | Already partially works via StatusDot -- needs real-time | LOW | SSE or polling from OpenClaw API |
| Usage metrics (token counts, cost, model usage per agent) | Operational cost visibility | MEDIUM | OpenClaw usage API endpoint |
| Agent log viewer (recent output, errors) | Need to debug agent behavior | MEDIUM | OpenClaw API + scrollable log panel |
| Model assignment (per-agent model selection) | Already exists in edit mode -- needs polish | LOW | Models endpoint already integrated |

#### Differentiators

| Feature | Value Proposition | Complexity | Depends On |
|---------|-------------------|------------|------------|
| Agent memory browser (view/edit/clear RAG context) | Understand what the agent "remembers" | MEDIUM | OpenClaw memory API |
| Agent tool permissions (enable/disable tools per agent) | Fine-grained control over agent capabilities | MEDIUM | OpenClaw tools API |
| Agent activity timeline (visual history of actions) | See what an agent has been doing over time | MEDIUM | Mission events from Supabase |
| Batch operations (restart all, update model globally) | Fleet management for multiple agents | LOW | UI pattern over existing per-agent APIs |
| Agent templates (pre-configured role + model + tools) | Quick-create agents from proven configurations | LOW | Template definitions in localStorage/Supabase |
| Cost dashboard (daily/weekly/monthly usage charts) | Budget visibility and trend analysis | MEDIUM | Aggregate usage data + chart widget |
| Agent comparison (side-by-side metrics) | Evaluate which agent/model combo performs best | LOW | UI layout using existing data |

#### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Agent code editor (edit agent source) | Power users want to modify agent behavior | Agent code lives on the OpenClaw VM -- editing through MC adds remote file sync complexity and security risk | Link to OpenClaw workspace files via "Open in editor" |
| Live streaming agent output | Real-time terminal-style output | WebSocket infrastructure, massive data volume, UI complexity | Polling recent log lines every 5-10 seconds |
| Multi-gateway support | Manage multiple OpenClaw instances | Architecture assumes single gateway -- multi-gateway adds routing complexity | Single gateway, configurable in Settings |
| Agent marketplace | Share/download agent configurations | No infrastructure, premature | Local templates are sufficient |

---

### 3. Theme Blend Slider (Dark/Light Interpolation)

**Current state:** 24 built-in themes (13 dark, 8 light, 3 colorful/high-contrast), theme store with useSyncExternalStore, 5-color customization (accent, glow, secondary, tertiary, logo), glow opacity/border radius/panel opacity sliders, scheduling, custom CSS, import/export, GTK/Wallbash system mode integration. Themes switch discretely -- picking "Default Dark" vs "Default Light" is a binary toggle.

**Target:** A slider that continuously blends between dark and light variants of a theme, producing smooth intermediate states.

#### Table Stakes

| Feature | Why Expected | Complexity | Depends On |
|---------|--------------|------------|------------|
| Blend slider (0% = full dark, 100% = full light) | Core feature request | MEDIUM | Color interpolation engine |
| Perceptually uniform interpolation | Blending RGB looks wrong -- need oklab/oklch color space | MEDIUM | CSS `color-mix()` or JS oklab math |
| Preserves accent/secondary/tertiary colors | User's chosen accent color must survive blending | LOW | Only interpolate Tier 1 (surface/text/border) vars |
| Real-time preview as slider moves | User must see changes instantly | LOW | Apply CSS vars on `input` event |
| Persistence | Slider position saved across restarts | LOW | Add `blendPosition` to ThemeState |

#### Differentiators

| Feature | Value Proposition | Complexity | Depends On |
|---------|-------------------|------------|------------|
| Per-page blend override | Different blend level for notes vs dashboard | LOW | Already have `pageOverrides` in ThemeState |
| Time-of-day auto-blend | Gradually shift darker as evening approaches | MEDIUM | Blend position as function of time |
| Blend-aware contrast checking | Warn when intermediate state has poor text contrast | MEDIUM | WCAG contrast ratio calculation |

#### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Arbitrary theme-to-theme blending | "Blend Dracula with Solarized" | Theme definitions have different semantic color meanings -- blending creates nonsensical results | Only blend between matched dark/light counterpart pairs |
| Animated auto-blend transitions | Smooth animation when slider moves | CSS transitions on 50+ custom properties tank performance | Immediate application, no transitions |
| Blend slider in widget form | "Theme widget on dashboard" | Niche use -- clutters widget picker | Accessible from Settings only, or as a title bar control |

**Implementation approach:** Each theme pair (e.g., `default-dark` / `default-light`) shares the same semantic structure. The `COUNTERPART_MAP` already exists in `theme-definitions.ts`. The blend engine interpolates each CSS variable between the dark and light values using `oklab` color space for perceptually uniform results. Non-color variables (border-radius, opacity) interpolate linearly. The blend position (0-100) stores in `ThemeState.blendPosition`. Only Tier 1 variables (surfaces, text, borders) blend -- Tier 2 (accent colors) remain fixed per user choice.

---

### 4. Embedded Terminal Widget

**Current state:** No terminal integration exists. The project uses Tauri v2 with shell permissions scoped to HTTPS/HTTP URLs only. The OpenClaw VM runs remotely and is accessed via Tailscale.

**Target:** An embedded terminal widget in the dashboard for interacting with OpenClaw or local shell.

#### Table Stakes

| Feature | Why Expected | Complexity | Depends On |
|---------|--------------|------------|------------|
| Terminal emulator rendering (cursor, colors, scrollback) | Basic terminal must look and behave like a terminal | MEDIUM | xterm.js integration |
| OpenClaw VM shell access | Primary use case -- run commands on the agent VM | HIGH | SSH/PTY over Tailscale, security model |
| Copy/paste support | Standard terminal interaction | LOW | xterm.js handles this |
| ANSI color support | Commands output colored text | FREE | xterm.js handles ANSI natively |
| Scrollback buffer | Scroll up to see previous output | LOW | xterm.js configuration |
| Fit to container (responsive sizing) | Terminal must resize with widget | LOW | xterm.js `fit` addon |

#### Differentiators

| Feature | Value Proposition | Complexity | Depends On |
|---------|-------------------|------------|------------|
| Multiple terminal tabs | Switch between different sessions | MEDIUM | Tab state management |
| Predefined command shortcuts | One-click "restart agent", "tail logs" | LOW | Button bar above terminal |
| Session persistence across page navigation | Don't lose terminal state when switching pages | MEDIUM | Keep PTY connection alive in background |
| Local terminal access | Shell on the user's own machine | MEDIUM | `tauri-plugin-pty` for local PTY |

#### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Full SSH client | "Connect to any server" | Scope creep, credential management nightmare, security surface | Single preconfigured connection to OpenClaw VM |
| File transfer (SCP/SFTP) | "Upload/download files" | Complex UI, security risk | Use existing vault/workspace file APIs |
| Terminal multiplexer (tmux-like splits) | Power users want split panes | Massive complexity for a widget | Single terminal per widget instance; add multiple widgets for splits |
| Browser-based terminal without Tauri | "Use in browser mode too" | PTY requires native process access -- impossible in pure browser | Terminal only available in Tauri desktop mode |

**Implementation approach:** Use `xterm.js` for rendering and `tauri-plugin-pty` for local PTY spawning. For OpenClaw VM access, the Axum backend opens a WebSocket to proxy stdin/stdout between the frontend xterm.js instance and a remote PTY session via Tailscale. Security constraint: SSH key has a passphrase, so non-interactive SSH from Bash tool fails -- the terminal must handle interactive auth or use a pre-authenticated session. **This is the highest-risk feature** because it requires new Tauri plugin integration, WebSocket PTY proxying, and careful security sandboxing.

---

### 5. Project Tracker / Kanban Board

**Current state:** A `KanbanBoard` primitive widget already exists with HTML5 drag-and-drop, typed columns/cards, and basic card movement. The Pipeline page has ideas, notes, retros, ship log, and status views. Supabase has `ideas` and `missions` tables.

**Target:** A proper project management tool with kanban board, task tracking, and workflow visualization.

#### Table Stakes

| Feature | Why Expected | Complexity | Depends On |
|---------|--------------|------------|------------|
| Persistent kanban columns and cards (CRUD) | Current KanbanBoard is config-driven only -- no persistence | MEDIUM | New Supabase table (`projects`, `project_tasks`) |
| Drag-and-drop cards between columns | Already works in KanbanBoard primitive | LOW | Existing HTML5 DnD code |
| Card detail view (description, assignee, due date, labels) | Clicking a card should open a detail panel | MEDIUM | Slide-over panel pattern (already used in Pipeline) |
| Multiple boards/projects | Users have more than one project | LOW | Project selector + Supabase query filter |
| Column customization (rename, reorder, add/delete) | Standard kanban feature | LOW | Column CRUD operations |
| Card labels/tags with colors | Visual categorization | LOW | Tag chip component (already exists as TagChip) |
| Due dates with overdue highlighting | Time-based tracking | LOW | Date picker + conditional styling |

#### Differentiators

| Feature | Value Proposition | Complexity | Depends On |
|---------|-------------------|------------|------------|
| Link cards to missions/ideas | Connect project tasks to existing OpenClaw missions | LOW | Foreign key to `missions`/`ideas` tables |
| Agent assignment (assign task to AI agent) | Unique to this app -- assign work to Bjorn/agents | MEDIUM | Agent selection + mission dispatch |
| Board templates (Software Dev, Content Pipeline, Personal) | Quick-start with pre-configured columns | LOW | Template definitions |
| Swimlanes (group by assignee, priority, label) | Advanced organization | MEDIUM | Row grouping logic |
| Board-level metrics (throughput, cycle time, WIP) | Productivity insights | MEDIUM | Date tracking on column transitions |
| Calendar view of due dates | Alternate visualization | LOW | Reuse existing Calendar component |
| Integration with todos | Sync board cards with todo list | MEDIUM | Bidirectional sync between tables |

#### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Gantt charts | "Full project management" | Complex rendering, niche use case, massive implementation | Timeline view showing start/end dates is simpler |
| Resource allocation / capacity planning | Enterprise PM feature | Irrelevant for personal/small-team use | Simple WIP limits per column |
| Time tracking per card | "Track hours spent" | Scope creep into time-tracking app territory | Link to Pomodoro sessions if needed |
| Sprints / iterations | Scrum methodology support | Over-engineering for personal project management | Simple deadline-based workflows |
| Comments/discussions on cards | Collaboration feature | No multi-user infrastructure yet | Description field is sufficient for single user |

---

## Feature Dependencies (Cross-Feature)

```
TipTap Migration (Notes Editor)
    -- independent, no other features depend on it
    -- but must complete before Version History (which needs content diffing)

OpenClaw Controller
    -- independent of other features
    -- Terminal Widget enhances it (terminal connects to same VM)
    -- Agent Assignment in Kanban depends on agent CRUD being complete

Theme Blend Slider
    -- independent, small scope
    -- depends on existing COUNTERPART_MAP in theme-definitions.ts
    -- no other features depend on it

Terminal Widget
    -- depends on new Tauri plugin integration (tauri-plugin-pty)
    -- enhanced by OpenClaw controller (predefined commands)
    -- independent of other features

Project Tracker / Kanban
    -- depends on new Supabase tables
    -- enhanced by OpenClaw controller (agent assignment)
    -- KanbanBoard primitive already exists as starting point
```

### Dependency Graph

```
Theme Blend Slider (standalone, smallest scope)

Notes Editor (standalone, largest scope)
    -- Version History (future, depends on notes)

OpenClaw Controller (standalone)
    |
    +--> Terminal Widget (enhances controller)
    |
    +--> Kanban Agent Assignment (enhances kanban)

Kanban Board (standalone, new Supabase tables)
    -- Agent Assignment (depends on OpenClaw controller)
```

## MVP Definition

### Launch With (v0.0.3 Core)

- [ ] **TipTap WYSIWYG editor** replacing CodeMirror -- WYSIWYG blocks, inline formatting, tables, slash commands, floating toolbar. Markdown round-trip to CouchDB. Wikilinks as custom TipTap node.
- [ ] **OpenClaw agent CRUD** -- create, update, delete agents; lifecycle controls (start/stop/deploy); model assignment; usage metrics display.
- [ ] **OpenClaw cron CRUD** -- create, update, delete cron jobs; schedule editor with human-readable UI; enable/disable toggle.
- [ ] **Theme blend slider** -- continuous 0-100 dark/light interpolation using oklab color space; persisted in ThemeState.
- [ ] **Kanban board persistence** -- new Supabase tables, CRUD for boards/columns/cards, drag-and-drop, card detail panel.

### Add After Validation (v0.0.3.x)

- [ ] **Terminal widget** -- xterm.js + tauri-plugin-pty; defer until core features stable due to high complexity and security risk
- [ ] **Agent memory browser** -- view/edit/clear agent RAG context
- [ ] **Note templates** -- pre-built starting points for common note types
- [ ] **Kanban-to-mission linking** -- connect board cards to OpenClaw missions
- [ ] **Full-text note search** -- search inside note content, not just titles

### Future Consideration (v0.0.4+)

- [ ] **Real-time collaboration** on notes -- Yjs + Hocuspocus, massive scope
- [ ] **Version history** for notes -- CouchDB revision diffing
- [ ] **Agent comparison dashboard** -- side-by-side metrics
- [ ] **Terminal multi-session tabs** -- multiple connections
- [ ] **Kanban swimlanes** -- advanced grouping

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Risk | Priority |
|---------|------------|---------------------|------|----------|
| TipTap WYSIWYG editor | HIGH | HIGH | HIGH (CouchDB compat) | P1 |
| OpenClaw agent CRUD | HIGH | MEDIUM | LOW (API exists) | P1 |
| OpenClaw cron CRUD | HIGH | MEDIUM | LOW (API exists) | P1 |
| Theme blend slider | MEDIUM | LOW | LOW (isolated change) | P1 |
| Kanban board persistence | HIGH | MEDIUM | LOW (standard CRUD) | P1 |
| Embedded terminal | MEDIUM | HIGH | HIGH (security, PTY) | P2 |
| Agent memory browser | MEDIUM | MEDIUM | MEDIUM | P2 |
| Note templates | MEDIUM | LOW | LOW | P2 |
| Slash commands in editor | MEDIUM | MEDIUM | LOW | P2 |
| Full-text note search | MEDIUM | MEDIUM | LOW | P2 |
| Real-time collaboration | LOW (v0.0.3) | VERY HIGH | HIGH | P3 |
| Version history | MEDIUM | HIGH | MEDIUM | P3 |
| Kanban swimlanes | LOW | MEDIUM | LOW | P3 |

**Priority key:**
- P1: Must have for v0.0.3 launch
- P2: Should have, add during stabilization
- P3: Future consideration

## Competitor Feature Analysis

| Feature | Google Docs | Notion | Linear | Our Approach |
|---------|------------|--------|--------|--------------|
| WYSIWYG editing | Full rich text | Block-based | Markdown-first | TipTap WYSIWYG with markdown storage |
| Tables | Full spreadsheet-like | Database tables | None | TipTap table extension (insert/edit, not spreadsheet) |
| Slash commands | None (menu-based) | Core UX pattern | Yes | TipTap suggestion API |
| Kanban board | None | Built-in database view | Core product | Dedicated kanban page + widget |
| AI agent control | None | AI assist | None | Full CRUD + lifecycle (unique differentiator) |
| Theme customization | None | Light/dark toggle | Light/dark toggle | 24 themes + blend slider + 5 accent colors |
| Embedded terminal | None | None | None | xterm.js widget (unique differentiator) |
| Collaboration | Real-time, core feature | Real-time | Real-time | Deferred -- single-user first |
| Offline support | Limited | Limited | Full | Full offline-first via SQLite sync |

## Sources

- [TipTap editor documentation](https://tiptap.dev/docs/editor/getting-started/overview)
- [TipTap React installation](https://tiptap.dev/installation/react)
- [TipTap collaboration docs](https://tiptap.dev/docs/collaboration/getting-started/install)
- [TipTap markdown extension](https://tiptap.dev/docs/editor/markdown)
- [TipTap markdown API](https://tiptap.dev/docs/editor/markdown/api/editor)
- [Which rich text editor framework in 2025 (Liveblocks)](https://liveblocks.io/blog/which-rich-text-editor-framework-should-you-choose-in-2025)
- [xterm.js official site](https://xtermjs.org/)
- [tauri-plugin-pty on crates.io](https://crates.io/crates/tauri-plugin-pty)
- [tauri-plugin-pty GitHub](https://github.com/Tnze/tauri-plugin-pty)
- [Tauri shell plugin docs](https://v2.tauri.app/plugin/shell/)
- [xterm.js security guide](https://xtermjs.org/docs/guides/security/)
- [react-xtermjs (Qovery)](https://github.com/Qovery/react-xtermjs)
- [dnd-kit kanban tutorial (LogRocket)](https://blog.logrocket.com/build-kanban-board-dnd-kit-react/)
- [AI agent monitoring best practices (UptimeRobot)](https://uptimerobot.com/knowledge-hub/monitoring/ai-agent-monitoring-best-practices-tools-and-metrics/)
- [CSS color-mix() and oklab](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/filter-function/brightness)
- [CSS theme switching patterns (web.dev)](https://web.dev/patterns/theming/theme-switch)
- Direct codebase analysis: NoteEditor.tsx, EditorToolbar.tsx, AgentCard.tsx, KanbanBoard.tsx, themes.ts, theme-definitions.ts, theme-store.ts, agents.rs, openclaw_cli.rs, vault.ts, widget-registry.ts

---
*Feature research for: OpenClaw Manager v0.0.3*
*Researched: 2026-03-22*
