# Architecture Patterns

**Domain:** All-in-one life productivity desktop app with AI module builder, dashboard grid, theming, rich notes, and responsive layout
**Researched:** 2026-03-19

## Recommended Architecture

The five new systems layer onto the existing Tauri v2 + Axum + React architecture without replacing any current abstractions. Each system owns a clear boundary and communicates through well-defined interfaces.

```
+-----------------------------------------------------------------------+
|  FRONTEND (React)                                                      |
|                                                                        |
|  +------------------+  +-------------------+  +---------------------+  |
|  | Dashboard Grid   |  | Notes Engine      |  | Theme Engine        |  |
|  | (react-grid-     |  | (TipTap +         |  | (CSS var manager +  |  |
|  |  layout v2)      |  |  custom wiki      |  |  preset store +     |  |
|  |                  |  |  extension)        |  |  live editor)       |  |
|  +--------+---------+  +--------+----------+  +----------+----------+  |
|           |                     |                         |            |
|  +--------+---------+  +--------+----------+  +-----------+----------+ |
|  | Widget Registry  |  | Backlink Index    |  | Theme Serializer     | |
|  | (lazy-loaded     |  | (client-side      |  | (JSON import/export) | |
|  |  components +    |  |  link graph)      |  |                      | |
|  |  Bjorn modules)  |  |                   |  |                      | |
|  +--------+---------+  +-------------------+  +----------------------+ |
|           |                                                            |
|  +--------+-----------------------------------------------------------+|
|  | Module Sandbox (iframe srcdoc)                                      |
|  | - Bjorn-generated components rendered in isolation                   |
|  | - postMessage bridge for data/events                                |
|  | - Approval flow before promoting to production registry              |
|  +---------------------------------------------------------------------+
|                                                                        |
|  +---------------------------------------------------------------------+
|  | Responsive Layout Shell                                              |
|  | - CSS container queries on main content area                         |
|  | - Breakpoint-aware sidebar collapse                                  |
|  | - Dashboard grid auto-adapts via react-grid-layout breakpoints       |
|  +---------------------------------------------------------------------+
+-----------------------------------------------------------------------+
           |                    |                    |
           v                    v                    v
+-----------------------------------------------------------------------+
|  BACKEND (Axum on localhost:3000)                                      |
|                                                                        |
|  /api/dashboard/layout    - CRUD for grid layouts per user             |
|  /api/modules/bjorn       - Proxy to Bjorn for code generation         |
|  /api/modules/registry    - List/approve/reject generated modules      |
|  /api/themes              - CRUD for custom themes                     |
|  /api/vault/*             - (existing) CouchDB notes proxy             |
|  /api/vault/backlinks     - Backlink index queries                     |
+-----------------------------------------------------------------------+
           |                    |                    |
           v                    v                    v
+-----------------------------------------------------------------------+
|  PERSISTENCE                                                           |
|                                                                        |
|  SQLite (local)           Supabase (remote)       CouchDB (notes)      |
|  - dashboard_layouts      - dashboard_layouts     - note documents     |
|  - module_registry        - module_registry       - (existing)         |
|  - custom_themes          - custom_themes                              |
|  - theme_presets (seed)   - theme_presets                              |
+-----------------------------------------------------------------------+
```

### Component Boundaries

| Component | Responsibility | Communicates With | Data Ownership |
|-----------|---------------|-------------------|----------------|
| **Dashboard Grid** | Drag/resize widget placement, edit mode toggle, layout persistence | Widget Registry, Responsive Shell, Axum `/api/dashboard/layout` | Layout JSON (positions, sizes, breakpoint variants) |
| **Widget Registry** | Maps widget IDs to lazy-loaded React components, includes both built-in and Bjorn-generated modules | Dashboard Grid, Module Sandbox, `modules.ts` store | Registry manifest (widget ID, component path, metadata) |
| **Module Sandbox** | Isolates Bjorn-generated code in iframe, provides data bridge, handles approval flow | Widget Registry, Axum `/api/modules/bjorn`, Bjorn (via OpenClaw VM) | Module source code, approval status |
| **Notes Engine** | Rich text editing with wiki links, backlinks, graph view | Axum `/api/vault/*`, Backlink Index | Note content (in CouchDB via existing vault proxy) |
| **Backlink Index** | Maintains client-side graph of note-to-note links for instant backlink lookups | Notes Engine, Graph View | Derived link graph (computed from note content) |
| **Theme Engine** | Manages CSS variable overrides, preset selection, live editing, import/export | `themes.ts` store, Axum `/api/themes`, localStorage | Theme definitions (JSON objects mapping CSS var names to values) |
| **Responsive Shell** | Container query breakpoints, sidebar auto-collapse, layout adaptation | Dashboard Grid, LayoutShell, CSS container queries | Breakpoint state (derived from container dimensions) |

### Data Flow

**Dashboard Widget Rendering:**
```
1. User opens Dashboard page
2. DashboardGrid fetches layout from Axum: GET /api/dashboard/layout
3. Axum checks SQLite cache, falls back to Supabase
4. Layout JSON describes widget positions: [{id: "heartbeat", x: 0, y: 0, w: 4, h: 2}, ...]
5. DashboardGrid maps each widget ID through WidgetRegistry
6. WidgetRegistry resolves: built-in -> React.lazy(import), Bjorn module -> iframe sandbox
7. Each widget independently fetches its own data via React Query
8. User drags/resizes -> onLayoutChange fires -> debounced save to Axum: PUT /api/dashboard/layout
9. Axum writes to SQLite (immediate), syncs to Supabase (30s cycle)
```

**Bjorn Module Generation Flow:**
```
1. User requests new module (e.g., "Weather widget") via chat or module builder UI
2. Frontend sends request to Axum: POST /api/modules/bjorn {prompt, context}
3. Axum proxies to OpenClaw VM (Bjorn agent) via Tailscale
4. Bjorn generates React component code + metadata
5. Axum stores generated code in module_registry table (status: "preview")
6. Frontend receives module code
7. Module Sandbox renders code in srcdoc iframe:
   - Injects React + component primitives library
   - Renders the generated component
   - postMessage bridge exposes: theme variables, API proxy, event bus
8. User sees live preview in sandbox panel
9. User approves -> status changes to "approved"
10. Widget Registry adds module to available widgets
11. User adds to dashboard grid like any other widget
```

**Theme Application Flow:**
```
1. User selects preset OR edits variables in Theme Editor
2. ThemeEngine builds complete variable map: {--accent: "#a78bfa", --bg-base: "#0a0a0c", ...}
3. ThemeEngine applies all variables to document.documentElement.style
4. Derived variables computed automatically (dim = darken(accent, 25%), bright = lighten(accent, 25%))
5. Theme JSON saved: localStorage (immediate) + Axum PUT /api/themes (persisted)
6. Import/Export: JSON file containing full variable map + metadata (name, author, version)
```

**Notes Wiki Link Flow:**
```
1. User types [[Page Name]] in TipTap editor
2. Custom WikiLink extension detects pattern via ProseMirror inputRule
3. Extension renders inline chip (styled node decoration) with link text
4. On content change: parser extracts all [[links]], updates BacklinkIndex
5. BacklinkIndex is a client-side Map<noteId, Set<noteId>> rebuilt on note list load
6. Backlinks panel queries: "which notes link TO this note?" via BacklinkIndex
7. Graph View reads BacklinkIndex to build force-directed graph (existing react-force-graph-2d)
8. Clicking a wiki link: resolves title -> noteId, navigates to that note
9. If target doesn't exist: prompts to create, then navigates
```

**Responsive Adaptation Flow:**
```
1. LayoutShell wraps main content area in a container-query context
2. CSS container queries apply breakpoint classes based on main area width (not viewport)
3. Dashboard Grid uses react-grid-layout's ResponsiveGridLayout:
   - Breakpoints map to main area width, not window width
   - Layouts stored per breakpoint: {lg: [...], md: [...], sm: [...]}
4. Sidebar auto-collapses when main area drops below threshold
5. Pages use container-query utility classes for their internal responsive behavior
6. On window resize / monitor switch: container width changes -> queries fire -> layout adapts
```

## Patterns to Follow

### Pattern 1: Widget as Lazy-Loaded Module
**What:** Each dashboard widget is a self-contained React component that owns its own data fetching, error boundary, and loading state. Registered in a central manifest.
**When:** Every built-in and Bjorn-generated dashboard widget.
**Why:** Widgets must be independently loadable, crashable (without taking down the grid), and addable/removable at runtime.
**Example:**
```typescript
// lib/widget-registry.ts
export interface WidgetDefinition {
  id: string
  name: string
  description: string
  icon: string // lucide icon name
  defaultSize: { w: number; h: number }
  minSize?: { w: number; h: number }
  maxSize?: { w: number; h: number }
  source: 'builtin' | 'bjorn'
  component: () => Promise<{ default: React.ComponentType<WidgetProps> }>
}

export interface WidgetProps {
  id: string         // instance ID on the grid
  width: number      // current pixel width (for responsive internals)
  height: number     // current pixel height
  isEditing: boolean // dashboard in edit mode
}

// Registration
export const BUILTIN_WIDGETS: WidgetDefinition[] = [
  {
    id: 'heartbeat',
    name: 'Heartbeat',
    description: 'Agent heartbeat monitor',
    icon: 'Heart',
    defaultSize: { w: 4, h: 2 },
    source: 'builtin',
    component: () => import('@/pages/dashboard/HeartbeatCard'),
  },
  // ... more widgets
]
```

### Pattern 2: Sandbox Isolation via srcdoc iframe
**What:** Bjorn-generated modules render inside an iframe with `sandbox="allow-scripts"` using `srcdoc` to inject a self-contained HTML document. Communication happens exclusively via `postMessage`.
**When:** Any AI-generated or user-submitted component before and after approval.
**Why:** Prevents untrusted code from accessing the parent window's DOM, cookies, localStorage, or Tauri IPC. Sandboxed iframes cannot navigate the parent or access `window.parent` contents.
**Example:**
```typescript
// components/ModuleSandbox.tsx
interface SandboxProps {
  code: string        // Generated React component source
  theme: Record<string, string>  // CSS variables to inject
  data?: unknown      // Initial data payload
}

function ModuleSandbox({ code, theme, data }: SandboxProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const srcdoc = useMemo(() => buildSandboxHTML(code, theme, data), [code, theme, data])

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.source !== iframeRef.current?.contentWindow) return
      // Handle messages: {type: 'api-request', path, method, body}
      // Proxy through Axum, send response back via postMessage
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [])

  return (
    <iframe
      ref={iframeRef}
      srcDoc={srcdoc}
      sandbox="allow-scripts"
      style={{ width: '100%', height: '100%', border: 'none' }}
      title="Module Preview"
    />
  )
}
```

### Pattern 3: Theme as Serializable JSON
**What:** A theme is a plain JSON object mapping CSS variable names to values, with metadata. Themes are applied by iterating the object and calling `setProperty` on `documentElement`.
**When:** Preset selection, custom editing, import/export, cross-device sync.
**Why:** JSON serialization enables import/export, Supabase sync, and community sharing without any build step. CSS variables are already the app's styling primitive.
**Example:**
```typescript
// lib/theme-engine.ts
export interface ThemeDefinition {
  id: string
  name: string
  author: string
  version: number
  base: 'dark' | 'light'
  variables: Record<string, string>  // "--accent" -> "#a78bfa"
  meta?: { description?: string; tags?: string[] }
}

export function applyTheme(theme: ThemeDefinition): void {
  const el = document.documentElement
  el.setAttribute('data-theme', theme.base)
  for (const [key, value] of Object.entries(theme.variables)) {
    el.style.setProperty(key, value)
  }
  // Compute derived variables
  const accent = theme.variables['--accent']
  if (accent) {
    el.style.setProperty('--accent-dim', darken(accent, 25))
    el.style.setProperty('--accent-bright', lighten(accent, 25))
  }
}

export function exportTheme(theme: ThemeDefinition): string {
  return JSON.stringify(theme, null, 2)
}

export function importTheme(json: string): ThemeDefinition {
  const parsed = JSON.parse(json)
  // Validate shape, sanitize values (no url() or protocol handlers in values)
  return validateThemeDefinition(parsed)
}
```

### Pattern 4: TipTap with Custom WikiLink Node
**What:** Replace CodeMirror (current) with TipTap for the notes editor, implementing wiki links as a custom ProseMirror Node type that renders as clickable inline chips.
**When:** Notes overhaul phase.
**Why:** TipTap provides true WYSIWYG editing (toolbar, inline images, tables, code blocks) while CodeMirror is a code/markdown editor. Wiki links as typed ProseMirror nodes enable structured backlink extraction, autocomplete suggestions, and proper rendering without regex parsing.
**Example:**
```typescript
// extensions/wiki-link.ts
import { Node, mergeAttributes } from '@tiptap/core'

export const WikiLink = Node.create({
  name: 'wikiLink',
  group: 'inline',
  inline: true,
  atom: true,  // Non-editable inline block

  addAttributes() {
    return {
      target: { default: null },   // Target note title
      alias: { default: null },    // Display text (optional)
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-wiki-link]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, {
      'data-wiki-link': '',
      class: 'wiki-link',
    }), HTMLAttributes.alias || HTMLAttributes.target]
  },

  addInputRules() {
    // Match [[Target|Alias]] or [[Target]]
    return [
      nodeInputRule({
        find: /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/,
        type: this.type,
        getAttributes: match => ({
          target: match[1].trim(),
          alias: match[2]?.trim() || null,
        }),
      }),
    ]
  },
})
```

### Pattern 5: Container Queries for Component-Level Responsiveness
**What:** Use CSS `@container` queries on the main content area and individual widgets instead of viewport-based media queries. Each component adapts to its actual rendered size.
**When:** All layout adaptation for window resizing, sidebar collapse, multi-monitor moves.
**Why:** In a desktop app with a resizable sidebar, the viewport width is irrelevant -- what matters is the content area width. Container queries make widgets truly portable (same widget works in a narrow sidebar and a full-width panel).
**Example:**
```css
/* In widget CSS */
.widget-container {
  container-type: inline-size;
  container-name: widget;
}

@container widget (max-width: 300px) {
  .widget-header { flex-direction: column; }
  .widget-chart { height: 120px; }
}

@container widget (min-width: 500px) {
  .widget-body { display: grid; grid-template-columns: 1fr 1fr; }
}

/* Main content area */
.main-content {
  container-type: inline-size;
  container-name: main;
}

@container main (max-width: 600px) {
  /* Compact layout rules */
}
```

## Anti-Patterns to Avoid

### Anti-Pattern 1: Viewport Media Queries for Layout Decisions
**What:** Using `@media (max-width: 768px)` to control dashboard grid or page layouts.
**Why bad:** The sidebar width varies (160-360px user-resizable). A 1920px viewport with a 360px sidebar has 1560px of content space, but with a collapsed sidebar it has 1880px. Viewport queries cannot account for this. Widgets inside a grid cell have even less correlation with viewport width.
**Instead:** Use CSS container queries (`@container`) on the main content area and individual widget containers. Use react-grid-layout's breakpoint system (keyed to grid container width) for grid-level responsiveness.

### Anti-Pattern 2: Running Bjorn Code in Main Window Context
**What:** Using dynamic code evaluation or dynamic imports to run AI-generated module code directly in the React app's JavaScript context.
**Why bad:** AI-generated code could access the DOM, steal tokens from `AppState`, call Tauri IPC, read localStorage, or crash the entire app. The app's CSP already blocks unsafe evaluation, so it would also break the security policy.
**Instead:** Always render Bjorn modules in a sandboxed iframe with `srcdoc`. The iframe gets `sandbox="allow-scripts"` (no `allow-same-origin`, no `allow-top-navigation`). Communication via `postMessage` only. Even after approval, Bjorn modules continue to run in sandboxed iframes.

### Anti-Pattern 3: Single Monolithic Notes Editor Component
**What:** Building the TipTap editor, wiki link resolution, backlink panel, graph view, file tree, and search all in one component or tightly coupled module.
**Why bad:** The current `Notes.tsx` is already 492 lines with complex state. Adding TipTap + backlinks + toolbar would push it over 1000 lines. Testing and iterating on individual features becomes impossible.
**Instead:** Split into: `NoteEditor` (TipTap instance), `EditorToolbar` (formatting commands), `BacklinkPanel` (queries BacklinkIndex), `WikiLinkAutocomplete` (suggestion popup), `NoteSearchPanel`, with a thin orchestrator (`NotesPage`) that wires them together via props and shared hooks.

### Anti-Pattern 4: Theme Values in Component Props or State
**What:** Passing theme colors as React props or storing them in React state, then applying via inline styles.
**Why bad:** Every theme change triggers a React re-render cascade across the entire component tree. CSS variables update without React re-renders -- the browser handles repaint natively.
**Instead:** Theme Engine sets CSS variables on `documentElement`. Components reference `var(--accent)` etc. React never needs to know the current theme values. Only the Theme Editor UI itself needs theme state (for its color pickers).

### Anti-Pattern 5: Dashboard Layout Stored Only in localStorage
**What:** Persisting widget positions/sizes only in localStorage without server sync.
**Why bad:** Layout is lost on device switch, browser clear, or app reinstall. The existing app has a SQLite-to-Supabase sync engine specifically for this purpose.
**Instead:** Dashboard layouts go through the same sync path as todos, missions, etc.: write to SQLite immediately (for speed), sync to Supabase on 30s intervals, pull from Supabase on other devices.

## Component Dependency Graph and Build Order

```
Phase 1: Responsive Layout Shell  (no dependencies on other new systems)
   |
   +-- CSS container queries on LayoutShell
   +-- Sidebar auto-collapse thresholds
   +-- Page-level responsive utilities
   |
Phase 2: Theme Engine  (depends on: Responsive Shell for layout stability)
   |
   +-- ThemeDefinition type + serializer
   +-- Preset catalog (8-12 curated themes)
   +-- applyTheme() replacing current individual color functions
   +-- CSS variable editor UI
   +-- Import/export JSON
   +-- Supabase sync via existing sync engine
   |
Phase 3: Dashboard Grid  (depends on: Responsive Shell, Theme Engine)
   |
   +-- react-grid-layout v2 integration
   +-- WidgetRegistry with lazy loading
   +-- Edit mode (enter/exit, add/remove widgets)
   +-- Layout persistence (SQLite + Supabase)
   +-- Existing dashboard cards refactored into widgets
   |
Phase 4: Notes Overhaul  (independent of Dashboard, depends on Theme for styling)
   |
   +-- TipTap editor replacing CodeMirror
   +-- WikiLink custom extension
   +-- BacklinkIndex (client-side)
   +-- Backlinks panel UI
   +-- Editor toolbar (formatting, tables, code blocks)
   +-- Graph view updated to use BacklinkIndex
   +-- Full-text search
   |
Phase 5: Bjorn Module Builder  (depends on: Dashboard Grid, Widget Registry)
   |
   +-- Module Sandbox (iframe srcdoc)
   +-- postMessage data bridge
   +-- Bjorn API proxy in Axum
   +-- Approval flow UI
   +-- Component primitives library (charts, lists, forms for Bjorn to compose)
   +-- Hot-reload into Widget Registry after approval
```

**Build order rationale:**

1. **Responsive Shell first** because every subsequent system needs stable layout behavior. Building the grid or theme editor on a layout that breaks during resize wastes effort.

2. **Theme Engine second** because it replaces and consolidates the existing scattered color functions (`applyAccentColor`, `applyGlowColor`, `applySecondaryColor`, `applyLogoColor`) into a unified system. Both Dashboard and Notes need theming to look correct.

3. **Dashboard Grid third** because it establishes the Widget Registry pattern that Bjorn modules will plug into. Existing dashboard cards (HeartbeatCard, AgentsCard, MissionsCard, etc.) get refactored into widgets, validating the pattern before AI-generated code enters the picture.

4. **Notes Overhaul fourth** because it's the most self-contained system -- it touches the `/notes` page and vault backend but doesn't affect other pages. The TipTap migration is a significant effort that benefits from having responsive layout and theming already stable.

5. **Bjorn Module Builder last** because it depends on the Widget Registry (from Dashboard Grid), the Module Sandbox pattern, and the Axum proxy to OpenClaw. It's also the highest-risk system (AI-generated code execution) and benefits from all other systems being stable first.

## Scalability Considerations

| Concern | At 10 widgets | At 50 widgets | At 200+ widgets |
|---------|--------------|---------------|-----------------|
| Dashboard render | All visible, lazy-loaded | Only visible widgets rendered; offscreen ones unmounted | Virtualized grid or paginated widget pages |
| Widget Registry | Static manifest object | IndexedDB-backed manifest with search | Paginated API from Supabase with local cache |
| Theme variables | ~80 variables, instant apply | Same -- CSS variables don't degrade | Same -- browser handles thousands of CSS variables efficiently |
| Backlink Index | In-memory Map, rebuilt on page load | In-memory Map, incrementally updated on note change | SQLite-backed index with full-text search |
| Bjorn modules | 1-5 sandboxed iframes | Lazy-load iframes on scroll, pool limit of 8 concurrent | Module store with download-on-demand, iframe reuse pool |

## Key Technical Decisions

### react-grid-layout v2 for Dashboard Grid
**Confidence:** HIGH (researched, widely adopted, TypeScript-native in v2)

Use `react-grid-layout` v2 which is a complete TypeScript rewrite with hooks-based API. It provides drag-and-drop, resize, responsive breakpoints, and collision prevention out of the box. The `ResponsiveGridLayout` component handles breakpoint-specific layouts automatically.

Key configuration:
- `breakpoints`: `{lg: 1200, md: 900, sm: 600}` (keyed to **container** width via a ResizeObserver wrapper, not viewport)
- `cols`: `{lg: 12, md: 8, sm: 4}`
- `rowHeight`: 80px (allows fine-grained vertical sizing)
- `isDraggable` / `isResizable`: controlled by edit mode state
- `onLayoutChange`: debounced save to Axum backend

### TipTap for Rich Text Notes Editor
**Confidence:** HIGH (industry standard for React WYSIWYG in 2025, ProseMirror foundation)

Replace the current CodeMirror-based `NoteEditor.tsx` with TipTap. CodeMirror is excellent for source editing but cannot provide WYSIWYG rendering of headings, images, tables, and embedded content inline. TipTap's extension system allows custom WikiLink nodes, and its React integration (`@tiptap/react`) provides hooks like `useEditor` that fit the existing React Query + hooks architecture.

The existing CodeMirror theme and syntax highlighting can be preserved for code blocks within TipTap via the `@tiptap/extension-code-block-lowlight` extension.

### srcdoc iframe for Module Sandbox
**Confidence:** HIGH (standard browser isolation, no external dependencies)

Use `<iframe srcdoc="..." sandbox="allow-scripts">` for Bjorn module isolation. This is the strongest isolation boundary available in a browser context without using Web Workers (which cannot render UI). The `sandbox` attribute without `allow-same-origin` prevents the iframe from accessing the parent's cookies, localStorage, or DOM.

Tauri's CSP adds an additional layer -- even if the iframe somehow escaped sandbox, CSP would block unauthorized script execution. On Linux, Tauri cannot distinguish iframe requests from window requests, so the sandbox attribute (not Tauri capabilities) is the primary security boundary.

### CSS Container Queries for Responsive Layout
**Confidence:** HIGH (shipped in all modern browsers, pure CSS, no library needed)

Container queries are natively supported in Chrome 105+, Firefox 110+, Safari 16+. Since Tauri's webview uses the system's WebKit/Chromium, all target platforms support container queries. No polyfill or library needed.

### Theme Engine as JSON + CSS Variables
**Confidence:** HIGH (extends existing pattern, no new dependencies)

The app already uses CSS variables for all colors and has `applyAccentColor()` / `applyGlowColor()` / etc. functions. The Theme Engine consolidates these into a single `applyTheme(ThemeDefinition)` function and adds serialization for import/export. No new library required -- just structured data plus `document.documentElement.style.setProperty()`.

## Sources

- [react-grid-layout GitHub](https://github.com/react-grid-layout/react-grid-layout) - Dashboard grid library (v2 TypeScript rewrite)
- [TipTap Editor](https://tiptap.dev/docs/editor/getting-started/overview) - Rich text editor framework
- [TipTap Custom Extensions](https://tiptap.dev/docs/editor/extensions/custom-extensions/create-new/extension) - WikiLink extension pattern
- [TipTap React Integration](https://tiptap.dev/docs/editor/getting-started/install/react) - React hooks and components
- [Sandpack by CodeSandbox](https://sandpack.codesandbox.io/) - Reference for code sandbox patterns
- [Tauri v2 CSP](https://v2.tauri.app/security/csp/) - Content Security Policy in Tauri
- [Tauri v2 Isolation Pattern](https://v2.tauri.app/concept/inter-process-communication/isolation/) - iframe sandboxing in Tauri
- [CSS Container Queries Guide](https://dev.to/smriti_webdev/building-a-responsive-layout-in-2025-css-grid-vs-flexbox-vs-container-queries-234m) - Container queries best practices
- [react-safe-src-doc-iframe](https://github.com/godaddy/react-safe-src-doc-iframe) - Secure iframe component reference
- [ilert: Why React-Grid-Layout](https://www.ilert.com/blog/building-interactive-dashboards-why-react-grid-layout-was-our-best-choice) - Real-world RGL case study
- [Liveblocks: Rich Text Editor Comparison 2025](https://liveblocks.io/blog/which-rich-text-editor-framework-should-you-choose-in-2025) - TipTap vs alternatives
- [CSS Variables Theming Guide](https://www.frontendtools.tech/blog/css-variables-guide-design-tokens-theming-2025) - Design tokens and CSS variable patterns
