# Technology Stack

**Project:** OpenClaw Manager -- New Features Milestone
**Researched:** 2026-03-19
**Scope:** Dashboard grid, AI module builder, theming system, rich text notes editor, responsive layouts
**Note:** This covers NEW dependencies only. The existing stack (React 19, Tauri v2, Axum, Supabase, etc.) is locked in.

---

## Recommended Stack

### Dashboard Grid System

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| `react-grid-layout` | 2.2.2 | Free-form drag/resize widget grid | React-first, 22K GitHub stars, 1.6M weekly downloads, built-in responsive breakpoints, layout serialization, TypeScript types in v2. The de facto standard for dashboard grids in React. | HIGH |
| `@types/react-grid-layout` | (not needed) | Types | v2 ships its own types | HIGH |

**Rationale:** react-grid-layout is the clear winner for this use case. It provides exactly what the project needs: drag, resize, snap-to-grid, responsive breakpoints, and layout persistence (serializable to JSON for localStorage/Supabase sync). The v2 release (2024) modernized the codebase from Flow to TypeScript and added a hooks API (`useGridLayout`, `useResponsiveLayout`, `useContainerWidth`).

**React 19 compatibility note:** There is a community fork (`react-grid-layout-19`) for React 19, which suggests the mainline may have had compatibility issues. This needs validation during implementation. If the mainline v2.2.2 works with React 19 (likely, since v2 was built for modern React), use it. If not, the fork is available as a fallback.

**Layout persistence strategy:** Use `onLayoutChange` callback to serialize layout JSON. Store in localStorage for instant load, sync to Supabase `user_preferences` for multi-device. This aligns with the existing `preferences-sync.ts` pattern.

### AI Module Builder (Sandboxed Preview)

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| `sucrase` | 3.35.0 | JSX/TypeScript to JS transform | 4-20x faster than Babel, 275KB browser build vs Babel's 2.8MB. Does exactly what we need: strip TypeScript + transform JSX. No plugin system overhead. | HIGH |
| `esbuild-wasm` | 0.27.3 | Alternative JSX transform + bundling | WASM-based, runs in browser, can handle imports. Heavier than Sucrase but more capable if module resolution is needed. Use as fallback or for complex modules. | MEDIUM |

**Architecture: Custom sandbox, NOT Sandpack.**

Sandpack (`@codesandbox/sandpack-react` 2.20.0) was evaluated and rejected because:
1. **Internet dependency:** Sandpack's bundler fetches npm packages from a CDN. The Tauri app must work offline or in airgapped networks.
2. **Self-hosting complexity:** Self-hosting the Sandpack bundler requires cloning the entire codesandbox-client repo and hosting the bundler files. Massive overkill for this use case.
3. **Overkill:** Bjorn generates single-file React components using pre-built primitives (charts, lists, forms) already available in the app. Full npm dependency resolution is unnecessary.
4. **CSP conflict:** Sandpack's iframe loads from `codesandbox.io` by default. The current CSP has `default-src 'self'` with no `frame-src`, and adding external origins weakens security.

**Recommended approach -- iframe + Sucrase:**

```
Bjorn generates JSX/TSX string
  --> Sucrase transforms to plain JS (in-browser, ~5ms)
  --> JS injected into sandboxed iframe via srcdoc or blob URL
  --> iframe uses sandbox="allow-scripts" (no network, no parent access)
  --> Preview renders inside iframe with preloaded React + primitives bundle
  --> User approves --> module saved to Supabase + hot-reloaded into app
```

**CSP changes required:**
- Add `frame-src blob: data:` to allow sandboxed preview iframes
- Do NOT add external origins -- keep the security posture tight
- The iframe `sandbox="allow-scripts"` attribute prevents the preview from accessing the parent page, localStorage, cookies, or making network requests

**Platform caveat (HIGH confidence):** On Linux (WebKitGTK), Tauri cannot distinguish between iframe requests and main window requests. This means the sandboxed preview iframe inherits some permissions. Mitigation: the `sandbox` attribute on the iframe itself (browser-level, not Tauri-level) still enforces isolation. The preview code cannot call Tauri IPC because it runs in a sandboxed iframe without access to `window.__TAURI__`.

**Why not dynamic code execution APIs:** The CSP blocks `unsafe-eval`, which prevents string-to-code execution methods. This is correct and must not change. The iframe approach is the only safe pattern that works within the existing CSP.

### Rich Text Notes Editor

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| `@tiptap/react` | 3.20.x | Rich text editor framework | Headless, extensible, built on ProseMirror. 100+ extensions. Active development (published daily). React hooks API. Open source core. | HIGH |
| `@tiptap/starter-kit` | 3.20.x | Base extensions bundle | Bold, italic, headings, lists, code blocks, blockquotes, history. One import. | HIGH |
| `@tiptap/extension-table` | 3.20.x | Table support | Tables with merge cells, column resize | HIGH |
| `@tiptap/extension-image` | 3.20.x | Image embedding | Inline and block images | HIGH |
| `@tiptap/extension-code-block-lowlight` | 3.20.x | Syntax highlighted code | Code blocks with language detection | HIGH |
| `@tiptap/extension-link` | 3.20.x | Hyperlinks | URL validation, auto-detect, XSS prevention | HIGH |
| `@tiptap/extension-placeholder` | 3.20.x | Empty editor placeholder | "Type / for commands..." | HIGH |
| `@tiptap/extension-mention` | 3.20.x | @mentions and suggestions | Foundation for `[[wiki-link]]` autocomplete | MEDIUM |
| `@tiptap/extension-task-list` | 3.20.x | Checkbox lists | Interactive todo items in notes | HIGH |
| `lowlight` | 3.x | Syntax highlighting engine | Used by code-block-lowlight extension | HIGH |

**Why Tiptap over alternatives:**

| Criterion | Tiptap 3.x | Lexical (Meta) | BlockNote 0.47.x |
|-----------|-------------|----------------|-------------------|
| Maturity | Stable v3, ProseMirror battle-tested | Younger, still evolving API | Pre-1.0, breaking changes expected |
| Extension ecosystem | 100+ official + community | Growing, fewer options | Built on Tiptap, adds opinions |
| Wiki links | Custom extension viable (ProseMirror node) | Possible but harder | Not built-in |
| Headless (no forced UI) | Yes -- full control over toolbar/menus | Yes | No -- ships opinionated UI |
| Bundle size | Modular, import only what you use | Small core, grows with plugins | Heavier (wraps Tiptap + its own UI) |
| License | Open source core (MIT) | MIT | MIT core, GPL-3.0 advanced features |
| Existing codebase fit | Already using CodeMirror (similar ProseMirror DNA) | Different paradigm | Would conflict with existing styling |

**Wiki-link `[[...]]` implementation:** No official Tiptap extension exists. Build a custom `WikiLink` node extension using Tiptap's `Node.create()` API + the `@tiptap/extension-mention` suggestion popup pattern. The `inputRule` API can detect `[[` and trigger autocomplete. Backlinks are computed server-side by scanning all notes for `[[target]]` references -- store in a Supabase `note_links` table for fast lookup.

**Replaces:** The existing CodeMirror-based note editor (`@codemirror/*` packages in package.json). CodeMirror is a code editor, not a rich text editor. Tiptap provides WYSIWYG with toolbar, inline formatting, and block-level editing. CodeMirror can be retained for the code-block extension's editing experience if desired, but Tiptap becomes the primary notes editor.

### Theming System

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| `react-colorful` | 5.0.1 | Color picker for theme editor | 2.5KB, zero dependencies, accessible (WAI-ARIA), hooks-based. 2.4M weekly downloads. | HIGH |

**No additional libraries needed.** The theming system is primarily an architecture pattern, not a library choice. The app already uses CSS variables extensively (`globals.css`). The theming system builds on this:

**Architecture:**

1. **Theme presets** -- JSON objects mapping CSS variable names to values. Ship 8-12 curated presets (dark/light base x accent color combos). Stored as static assets.
2. **Theme editor UI** -- Settings panel with `react-colorful` color pickers for each variable category (accent, background, text, borders). Live preview via `document.documentElement.style.setProperty()`.
3. **Theme persistence** -- Save custom theme as JSON in `user_preferences` (localStorage + Supabase sync via existing `preferences-sync.ts`).
4. **Theme import/export** -- JSON file download/upload. Simple, no library needed.

**Why NOT Tailwind CSS v4 theming:** The app already uses a CSS-variable-based system in `globals.css`. Tailwind is installed (`tailwindcss ^4.2.1`) but the design system is built on raw CSS variables (e.g., `--accent`, `--hover-bg`, `--active-bg`, `--ease-spring`). Converting to Tailwind's theme system would mean rewriting the entire styling layer. Use the existing CSS variable pattern -- it's the right approach for runtime theme switching.

**Why NOT a theming library (like `styled-theming`, `theme-ui`):** These add abstraction layers and force opinions about how components consume theme values. The app already has a working pattern (`var(--accent)` in CSS). Adding a library would mean migrating hundreds of component styles for zero benefit.

### Responsive / Adaptive Layouts

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| (no new library) | -- | Responsive layouts | CSS Container Queries + existing CSS variables. No library needed. | HIGH |

**Why no library:** Responsive layout in a Tauri desktop app is about handling window resize events and adapting component layouts. This is a CSS problem, not a library problem.

**Approach:**
- **CSS Container Queries (`@container`)** for component-level responsiveness (sidebar collapse, grid column count, card layouts). Supported in all modern browser engines (WebKit, Chromium, Gecko) which Tauri v2 uses.
- **`react-grid-layout`'s built-in responsive breakpoints** for dashboard grid adaptations (fewer columns on narrow windows).
- **CSS `clamp()` and fluid typography** for text scaling between 1080p and 1440p.
- **`matchMedia` listener** in React for programmatic breakpoint detection (sidebar auto-collapse, layout mode switching).

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Dashboard grid | `react-grid-layout` | `gridstack.js` | Not React-native. DOM manipulation via selectors conflicts with React's virtual DOM. Community React wrapper (`@declarative-gridstack/react`) exists but has tiny adoption (366 weekly downloads vs 1.6M). |
| Dashboard grid | `react-grid-layout` | `dnd-kit` + custom grid | dnd-kit is a drag-and-drop primitive, not a grid layout system. Would need to build resize, snap-to-grid, responsive breakpoints, and layout serialization from scratch. 2-3x more work. |
| Dashboard grid | `react-grid-layout` | `AG Grid` | Enterprise data grid, not a widget dashboard grid. Different problem domain. |
| AI sandbox | Custom iframe + Sucrase | `@codesandbox/sandpack-react` | Requires internet for npm resolution. Self-hosting is heavy. CSP conflicts. Overkill for single-component preview. |
| AI sandbox | Sucrase | Babel standalone | 2.8MB vs 275KB. 4-20x slower. Plugin system unnecessary for JSX+TS stripping. |
| AI sandbox | Sucrase | `esbuild-wasm` | 10MB WASM binary for what Sucrase does in 275KB. Reserve esbuild-wasm for if/when modules need to import third-party packages. |
| Rich text editor | Tiptap 3.x | Lexical (Meta) | Fewer extensions. Wiki-link implementation harder. Community smaller for our use case (notes editor). Tiptap's ProseMirror foundation is more battle-tested for document editing. |
| Rich text editor | Tiptap 3.x | BlockNote 0.47.x | Pre-1.0, opinionated UI conflicts with existing design system. GPL-3.0 on advanced features. Wraps Tiptap anyway -- use Tiptap directly for full control. |
| Rich text editor | Tiptap 3.x | CKEditor / TinyMCE | Heavy, opinionated, WYSIWYG classics. Not headless. Hard to customize deeply. License restrictions on some features. |
| Color picker | `react-colorful` | `react-color` | 10KB+ larger, older architecture (class components), less maintained. |
| Theming | CSS variables (existing) | `styled-theming` / `theme-ui` | Would require migrating entire styling layer. The app already has a working CSS variable system. |
| Responsive | CSS Container Queries | `react-responsive` / `react-use` | Adds JS-level breakpoint detection when CSS-level is sufficient. Container queries are more performant and don't cause re-renders. |

---

## Installation

```bash
# Dashboard grid
npm install react-grid-layout

# Rich text editor (Tiptap 3.x ecosystem)
npm install @tiptap/react @tiptap/pm @tiptap/starter-kit \
  @tiptap/extension-table @tiptap/extension-image \
  @tiptap/extension-code-block-lowlight @tiptap/extension-link \
  @tiptap/extension-placeholder @tiptap/extension-mention \
  @tiptap/extension-task-list lowlight

# AI module builder (JSX transform)
npm install sucrase

# Theme editor
npm install react-colorful

# Dev dependencies (none new required -- existing test/build stack covers all)
```

**Total new dependency count:** 14 packages (3 are micro-sized, most are Tiptap ecosystem)
**Estimated bundle impact:** ~150-200KB gzipped total (Tiptap is the heaviest at ~100KB for the configured extensions; react-grid-layout ~40KB; sucrase ~30KB; react-colorful ~2.5KB)

---

## Packages to Remove (Eventually)

| Package | Why Remove | When |
|---------|-----------|------|
| `@codemirror/*` (8 packages) | Replaced by Tiptap for notes editing | After notes overhaul is complete and stable |
| `@lezer/highlight` | CodeMirror dependency, not needed with Tiptap | Same as above |

**Do NOT remove CodeMirror immediately.** Keep it during the transition so the existing notes editor continues working. Remove after Tiptap-based editor is verified and all note formats migrate cleanly.

---

## CSP Changes Required

The current CSP in `src-tauri/tauri.conf.json`:
```
default-src 'self'; script-src 'self'; worker-src 'none'; ...
```

**Required additions for AI module preview:**
```
frame-src blob: data:;
```

This allows the sandboxed iframe to load blob/data URLs containing the transformed preview code. No external origins are added. The iframe's `sandbox="allow-scripts"` attribute provides browser-level isolation.

**No other CSP changes needed** for the other features (grid, theming, rich text editor). They all operate within the existing `'self'` scope.

---

## Key Integration Points with Existing Stack

| New Feature | Integrates With | How |
|-------------|-----------------|-----|
| Dashboard grid | `preferences-sync.ts` | Layout JSON stored in localStorage, synced to Supabase |
| Dashboard grid | `modules.ts` | Widget visibility tied to enabled modules |
| Dashboard grid | React Query | Widgets fetch data through existing query patterns |
| AI module builder | Axum backend | Bjorn sends generated code via OpenClaw WebSocket; Axum validates/stores |
| AI module builder | Supabase | Module source code stored in `user_modules` table |
| AI module builder | CSP | Requires `frame-src blob: data:` addition |
| Rich text editor | CouchDB/Vault | Tiptap JSON document format stored alongside or replacing CouchDB chunks |
| Rich text editor | Supabase | `note_links` table for backlink index |
| Rich text editor | `vault.ts` | Existing vault API extended for Tiptap document format |
| Theming | `globals.css` | Theme presets override existing CSS variables |
| Theming | `preferences-sync.ts` | Custom theme JSON synced like other preferences |
| Theming | `sidebar-settings.ts` pattern | `useSyncExternalStore` for reactive theme state |
| Responsive | `react-grid-layout` | RGL's responsive breakpoints handle grid adaptation |
| Responsive | Sidebar | CSS Container Queries for sidebar collapse behavior |

---

## Sources

### Dashboard Grid
- [react-grid-layout npm](https://www.npmjs.com/package/react-grid-layout) -- v2.2.2, 1.6M weekly downloads
- [react-grid-layout GitHub](https://github.com/react-grid-layout/react-grid-layout) -- 22K stars, TypeScript rewrite in v2
- [react-grid-layout-19 fork](https://github.com/Censkh/react-grid-layout-19) -- React 19 compatibility fork (fallback)
- [gridstack.js](https://gridstackjs.com/) -- Evaluated and rejected (not React-native)
- [ilert: Why React-Grid-Layout Was Our Best Choice](https://www.ilert.com/blog/building-interactive-dashboards-why-react-grid-layout-was-our-best-choice)
- [localStorage persistence demo](https://strml.github.io/react-grid-layout/examples/8-localstorage-responsive.html)

### AI Module Builder
- [Sandpack docs: Hosting the Bundler](https://sandpack.codesandbox.io/docs/guides/hosting-the-bundler) -- Self-hosting evaluated
- [Sandpack offline issue](https://github.com/codesandbox/sandpack/issues/1223) -- Confirms offline limitations
- [Sucrase GitHub](https://github.com/alangpierce/sucrase) -- 275KB browser build, 4-20x faster than Babel
- [esbuild-wasm npm](https://www.npmjs.com/package/esbuild-wasm) -- v0.27.3 fallback option
- [Compiling React in the Browser using esbuild-wasm](https://www.cacoos.com/blog/compiling-in-the-browser)
- [AI Code Sandbox approach](https://nickconfrey.medium.com/i-built-an-ai-code-sandbox-ecd173a7990b)

### Rich Text Editor
- [Tiptap 3.0 stable announcement](https://tiptap.dev/blog/release-notes/tiptap-3-0-is-stable)
- [Tiptap React docs](https://tiptap.dev/docs/editor/getting-started/install/react) -- v3.20.x
- [Tiptap extensions overview](https://tiptap.dev/docs/editor/extensions/overview) -- 100+ extensions
- [Tiptap StarterKit](https://tiptap.dev/docs/editor/extensions/functionality/starterkit)
- [tiptap-wikilink-extension](https://github.com/aarkue/tiptap-wikilink-extension) -- Community reference for wiki links
- [Liveblocks: Which rich text editor in 2025?](https://liveblocks.io/blog/which-rich-text-editor-framework-should-you-choose-in-2025) -- Comparison analysis
- [BlockNote](https://www.blocknotejs.org/) -- Evaluated and rejected (pre-1.0, opinionated UI)

### Theming System
- [CSS Variables for React Devs (Josh Comeau)](https://www.joshwcomeau.com/css/css-variables-for-react-devs/)
- [Dynamic Themes with CSS Variables](https://medium.com/@krandles/adding-dynamic-themes-to-a-react-app-using-css-variables-57957e39f0bf)
- [react-colorful npm](https://www.npmjs.com/package/react-colorful) -- v5.0.1, 2.5KB, 2.4M weekly downloads
- [react-colorful GitHub](https://github.com/omgovich/react-colorful) -- Zero deps, WAI-ARIA accessible

### Tauri Security / CSP
- [Tauri v2 CSP docs](https://v2.tauri.app/security/csp/)
- [Tauri v2 Isolation Pattern](https://v2.tauri.app/concept/inter-process-communication/isolation/) -- iframe sandboxing reference
- [Tauri iframe security discussion](https://github.com/tauri-apps/tauri/discussions/1145)
- [Tauri Linux iframe limitation](https://v2.tauri.app/security/csp/) -- Cannot distinguish iframe from window requests on Linux

---

*Stack research: 2026-03-19*
