# Project Research Summary

**Project:** OpenClaw Manager -- New Features Milestone (v1.0 Publish)
**Domain:** All-in-one life productivity desktop app with AI module builder
**Researched:** 2026-03-19
**Confidence:** HIGH

## Executive Summary

OpenClaw Manager is a mature alpha (v0.0.1) with a solid foundation -- 17 working modules, 1039 frontend tests, 231 Rust tests, security score 96/100, and a locked-in stack of Tauri v2 + Axum + React. The research confirms that the path to a publishable v1.0 is not about building more features from scratch but about three parallel tracks: **(1)** polishing what exists (visual consistency, responsive layout, loading/error/empty states), **(2)** adding the table-stakes features that open-source users expect (setup wizard, theming, customizable dashboard, data export), and **(3)** building the differentiating AI module builder that no competitor offers. The existing CSS variable system, preferences-sync infrastructure, and SQLite-to-Supabase sync engine provide strong foundations that the new systems layer onto directly.

The recommended technology additions are minimal and targeted: `react-grid-layout` v2 for the dashboard grid, `Tiptap` 3.x for the rich text notes editor, `Sucrase` for in-browser JSX transformation in the AI module sandbox, and `react-colorful` for the theme editor color picker. Total bundle impact is approximately 150-200KB gzipped. No new backend dependencies are required -- the Axum server gains a few new route groups but the architecture pattern (frontend -> Axum proxy -> external services) remains unchanged. CSS Container Queries handle responsive layout without any library.

The primary risks are concentrated in two areas: the AI module builder (CSP constraints, sandbox escape via prompt injection, memory leaks on hot-reload) and the notes editor migration (data corruption during CodeMirror-to-Tiptap transition, CouchDB conflict resolution during WYSIWYG editing). Both are mitigable with specific architectural decisions detailed below. A less obvious but equally critical risk is the theming system: the codebase has 100+ hardcoded color values scattered across TypeScript style utilities and JSX inline styles that will resist theme changes unless audited and migrated to CSS variables first.

## Key Findings

### Recommended Stack

The stack additions are conservative and well-vetted. No experimental or pre-1.0 libraries. All choices have high community adoption, TypeScript support, and integrate cleanly with the existing architecture. See [STACK.md](STACK.md) for full rationale and alternatives considered.

**Core technologies:**
- **react-grid-layout v2** (2.2.2): Dashboard drag/resize grid -- 22K GitHub stars, 1.6M weekly downloads, TypeScript-native in v2, built-in responsive breakpoints, layout serialization to JSON. React 19 compatibility needs validation (community fork exists as fallback).
- **Tiptap 3.x** (~14 packages): Rich text notes editor -- headless ProseMirror framework, 100+ extensions, modular imports. Replaces CodeMirror for WYSIWYG editing while retaining CodeMirror in code blocks via `extension-code-block-lowlight`. Custom `WikiLink` node extension is viable using ProseMirror's Node.create() API.
- **Sucrase** (3.35.0): In-browser JSX/TypeScript transform for AI module preview -- 275KB vs Babel's 2.8MB, 4-20x faster. Used inside the sandboxed iframe to transform Bjorn-generated code without requiring `unsafe-eval` in the app's CSP.
- **react-colorful** (5.0.1): Color picker for theme editor -- 2.5KB, zero dependencies, WAI-ARIA accessible. The only new library needed for theming; everything else uses existing CSS variable patterns.
- **No library for responsive layout.** CSS Container Queries + react-grid-layout's built-in breakpoints handle all adaptation needs.

**CSP change required:** Add `frame-src blob: data:` for the AI module sandbox iframe. No other CSP changes needed.

### Expected Features

The competitive landscape analysis against Notion, Obsidian, Raycast, Home Assistant, Grafana, and Dashy/Homarr reveals a clear feature hierarchy. See [FEATURES.md](FEATURES.md) for full competitive analysis and dependency graph.

**Must have (table stakes for v1.0 launch):**
- T1: Setup wizard / onboarding flow -- gating factor for open-source adoption
- T2+T3: Dark/light/system theme + curated presets (6-8) -- non-negotiable since 2023
- T4+T5: Free-form dashboard grid + edit mode -- the visual first impression
- T6: Loading, error, and empty states across all pages -- perceived quality baseline
- T7: Visual consistency audit -- unified spacing, buttons, icons, typography
- T8: Responsive/adaptive layout -- multi-monitor setups are the norm for the target audience
- T9: Seamless page transitions -- keep state when switching modules
- T10: Unread badges / notification counts -- per-module and per-conversation

**Should have (differentiators for v1.0):**
- D1: Bjorn module builder -- the killer feature, no competitor has this
- D2: Pre-built module primitives (10-15 components) -- foundation for D1 and manual customization

**Defer to post-v1.0:**
- D3/D4: Advanced theme editor + community gallery -- presets are enough for launch
- D5/D6: Notes overhaul (wiki links, WYSIWYG) -- existing notes work, big investment better as focused follow-up
- D7: Embedded VM desktop viewer -- niche feature
- D8: AI-powered module suggestions -- requires D1 to be stable + usage data
- D9/D10: Finance + health modules -- prime candidates for Bjorn to generate once D1 works
- T13: Data export/backup -- important for trust, can ship shortly after v1.0

### Architecture Approach

The five new systems (dashboard grid, AI module builder, notes engine, theme engine, responsive shell) layer onto the existing Tauri + Axum + React architecture without replacing any current abstractions. Each system owns a clear boundary with well-defined interfaces. The key architectural insight is that the Widget Registry pattern serves double duty: it manages both built-in dashboard widgets (refactored from existing cards) and Bjorn-generated modules (loaded via sandboxed iframes). See [ARCHITECTURE.md](ARCHITECTURE.md) for component diagrams and data flow details.

**Major components:**
1. **Dashboard Grid** -- react-grid-layout v2 managing widget positions, edit mode, layout persistence via SQLite + Supabase sync
2. **Widget Registry** -- Central manifest mapping widget IDs to lazy-loaded React components (built-in) or sandboxed iframe instances (Bjorn modules)
3. **Module Sandbox** -- `<iframe srcdoc="..." sandbox="allow-scripts">` with postMessage bridge for AI-generated code isolation. Null origin prevents access to parent DOM/cookies/localStorage
4. **Notes Engine** -- Tiptap editor with custom WikiLink node extension, BacklinkIndex (client-side Map), Graph View integration
5. **Theme Engine** -- JSON-serializable theme definitions applied via `document.documentElement.style.setProperty()`, two-tier variable architecture (primitives + semantic), presets as minimal JSON objects
6. **Responsive Shell** -- CSS container queries on main content area and individual widgets, sidebar auto-collapse, react-grid-layout breakpoints keyed to container width (not viewport)

**Key patterns to follow:**
- Widget as Lazy-Loaded Module (self-contained data fetching, error boundary, loading state per widget)
- Sandbox Isolation via srcdoc iframe (postMessage bridge, no allow-same-origin, no network access)
- Theme as Serializable JSON (CSS variable overrides, never passed through React props/state)
- Container Queries for Component-Level Responsiveness (not viewport media queries)

### Critical Pitfalls

Research identified 16 pitfalls (5 critical, 7 moderate, 4 minor). The critical ones are architectural -- they must be solved in design, not patched during implementation. See [PITFALLS.md](PITFALLS.md) for full analysis with prevention strategies.

1. **CSP blocks dynamic code execution for AI modules** -- The app's `script-src 'self'` CSP with no `unsafe-eval` kills the obvious approach (Babel/eval at runtime). Prevention: pre-compile on OpenClaw VM or use Sucrase inside a sandboxed iframe with its own CSP. Never relax the main app's CSP.
2. **AI-generated code escapes sandbox via prompt injection** -- Bjorn-generated components could contain `fetch('http://127.0.0.1:3000/api/secrets')` or `window.parent` escapes. Prevention: null-origin sandbox (no `allow-same-origin`), static analysis gate rejecting network/DOM APIs, allowlisted primitives only, user approval before execution.
3. **Notes editor migration destroys existing data** -- CodeMirror-to-Tiptap switch risks corrupting CouchDB notes that use Obsidian-specific syntax (`![[image.png]]`, callout blocks, frontmatter). Prevention: keep CodeMirror as fallback, build Obsidian-syntax Tiptap extensions first, round-trip fidelity tests, never change the storage format (always serialize back to Markdown).
4. **Dashboard grid state desynchronized across devices** -- react-grid-layout layouts are resolution-dependent. Syncing a 1440p layout to a 1080p device produces broken grids. Prevention: sync layouts per breakpoint, last-write-wins with timestamps, load layout after widgets mount, default layout fallback.
5. **Theming breaks 40% of the UI** -- The codebase has 100+ hardcoded color values in TypeScript style utilities (`rgba(52, 211, 153, 0.2)` alongside `var(--green-bright)`). CSS variable overrides only affect `var()` references. Prevention: audit and migrate ALL hardcoded colors to CSS variables BEFORE building the theme editor. This is a prerequisite phase, not an afterthought.

## Implications for Roadmap

Based on combined research, the recommended phase structure follows the dependency chain: **polish -> infrastructure -> features -> differentiators**. The critical path is: responsive shell -> visual polish + color audit -> theming -> dashboard grid -> module primitives -> Bjorn builder.

### Phase 1: Responsive Layout Shell + Visual Polish Foundation

**Rationale:** Every subsequent system (dashboard grid, theme editor, notes overhaul) needs stable layout behavior. Building a grid on a layout that breaks during window resize wastes effort. The color audit is a prerequisite for theming (Pitfall #5) and must happen early so hardcoded values do not accumulate further.
**Delivers:** CSS container queries on LayoutShell, sidebar auto-collapse breakpoints, page-level responsive utilities, audit of all hardcoded colors, migration of inline color values to CSS variables, shared `<LoadingState>`, `<ErrorState>`, `<EmptyState>` components.
**Addresses:** T6 (loading/error/empty states), T7 (visual consistency), T8 (responsive layout)
**Avoids:** Pitfall #5 (hardcoded colors resist theming), Pitfall #10 (content area width ignored)

### Phase 2: Theming System

**Rationale:** Depends on Phase 1 completing the color variable migration. Theme presets are part of the onboarding flow (users pick a theme during setup). Must be stable before the dashboard grid so widgets inherit correct theme variables.
**Delivers:** ThemeDefinition type + JSON serializer, 6-8 curated presets (2 light, 2 dark, 2 high-contrast, 2 colorful), `applyTheme()` consolidating existing scattered color functions, system theme follow (`prefers-color-scheme`), theme import/export, Supabase sync via existing preferences-sync.
**Uses:** react-colorful (color picker), existing CSS variable system, existing preferences-sync.ts
**Implements:** Theme Engine component from architecture
**Avoids:** Pitfall #9 (variable explosion -- use two-tier architecture with 12-15 semantic controls, not 100+ primitives), Pitfall #13 (malicious CSS in imports -- whitelist variable names, sanitize values)

### Phase 3: Setup Wizard + Onboarding

**Rationale:** Gating factor for open-source adoption. Every user's first experience. Depends on theming being ready (theme selection is part of onboarding). Can be developed in parallel with Phase 2's later stages.
**Delivers:** Multi-step first-run wizard covering: service connections, module selection, theme pick, demo mode for users without infrastructure. Progressive disclosure design.
**Addresses:** T1 (setup wizard), T11 (keyboard shortcut discoverability -- part of onboarding)
**Note:** A v0.1.0 wizard milestone is already planned at `.planning-v0.1.0-wizard/`. This phase should incorporate and extend that work.

### Phase 4: Dashboard Grid + Widget System

**Rationale:** Depends on responsive shell (Phase 1) for container-aware breakpoints and theme engine (Phase 2) for consistent widget styling. The dashboard is the home screen and visual identity of the app. Establishing the Widget Registry here creates the foundation that Bjorn modules plug into later.
**Delivers:** react-grid-layout v2 integration, Widget Registry with lazy loading, edit mode (grid lines, resize handles, add/remove), layout persistence (SQLite + Supabase per-breakpoint sync), existing dashboard cards refactored into widgets, page transitions.
**Uses:** react-grid-layout v2, existing React Query patterns, existing SQLite-to-Supabase sync engine
**Implements:** Dashboard Grid, Widget Registry, Responsive Shell integration with grid breakpoints
**Avoids:** Pitfall #4 (cross-device desync -- per-breakpoint layouts with timestamps), Pitfall #6 (re-render avalanche -- React.memo with custom comparators, paused polling during drag), Pitfall #10 (breakpoints keyed to container width, not viewport)
**Addresses:** T4 (dashboard grid), T5 (edit mode), T9 (page transitions), T10 (unread badges), T12 (full-text search extension)

### Phase 5: Module Primitives Library

**Rationale:** Must exist before Bjorn can generate modules. Each primitive (chart, list, form, stat card, table) needs comprehensive tests and visual regression coverage before AI-generated code composes from them (Pitfall #16). This phase validates the Widget Registry pattern with manually-configured widgets before AI enters the picture.
**Delivers:** 10-15 component primitives (bar chart, line chart, stat card, list view, kanban board, form, table, calendar widget, timer, progress bar, markdown display, counter, image gallery), each with config schema and widget-compatible props interface.
**Implements:** Pre-built module primitives (D2)
**Avoids:** Pitfall #16 (building AI builder before primitives exist)

### Phase 6: Bjorn Module Builder (AI)

**Rationale:** The differentiating feature. Depends on Widget Registry (Phase 4) and Module Primitives (Phase 5). This is the highest-risk system -- AI-generated code execution in a security-conscious desktop app. All other systems must be stable before introducing this variable.
**Delivers:** Module Sandbox (iframe srcdoc with null origin), Sucrase JSX transform inside sandbox, postMessage data bridge, Bjorn API proxy in Axum, static analysis gate for generated code, approval flow UI (preview -> review -> approve -> install), hot-reload into Widget Registry after approval.
**Uses:** Sucrase, existing OpenClaw WebSocket connection, existing Axum proxy pattern
**Implements:** Module Sandbox component from architecture
**Avoids:** Pitfall #1 (CSP blocks eval -- sandboxed iframe with its own context), Pitfall #2 (prompt injection -- null origin, static analysis, allowlisted imports, no network access in sandbox, user approval), Pitfall #11 (memory leaks -- full iframe teardown between reloads, cleanup contract, iteration cap), Pitfall #14 (unapproved modules exposed -- server-side approval status, separate widget picker sections)

### Phase 7: Notes Overhaul (Post-v1.0 or Late v1.0)

**Rationale:** The existing notes work (CouchDB sync + CodeMirror). This is a large, self-contained effort that benefits from stable responsive layout and theming. The data migration risk (Pitfall #3) makes it safer to ship after the core v1.0 features are stable. Could be promoted to late v1.0 if the team has capacity, but should not block launch.
**Delivers:** Tiptap editor replacing CodeMirror for WYSIWYG, WikiLink custom extension with autocomplete, BacklinkIndex (client-side), backlinks panel, editor toolbar, graph view using BacklinkIndex, CodeMirror retained as source/fallback mode.
**Uses:** Tiptap 3.x ecosystem (14 packages), lowlight for syntax highlighting
**Avoids:** Pitfall #3 (data loss -- keep CodeMirror fallback, round-trip fidelity tests, never change CouchDB format), Pitfall #7 (O(n^2) link parsing -- pre-built index on note load, debounced resolution), Pitfall #8 (bundle bloat -- lazy-load, individual imports, measure with vite-bundle-visualizer), Pitfall #12 (CouchDB conflicts -- conflict indicator UI, lock-on-edit, version history), Pitfall #15 (worker-src blocks graph computation -- consider `worker-src 'self'` or Rust-side computation)

### Phase Ordering Rationale

- **Responsive shell before everything** because grid, theme editor, and notes all need stable layout behavior during window resize and multi-monitor switching.
- **Color audit before theming** because 100+ hardcoded colors will make 40% of the UI ignore theme changes (Pitfall #5). This is a prerequisite, not optional.
- **Theming before dashboard grid** because widgets must inherit correct theme variables from day one. Building widgets on hardcoded colors means rework.
- **Dashboard grid before Bjorn builder** because the Widget Registry pattern must be validated with built-in widgets before AI-generated code plugs into it (Pitfall #16).
- **Module primitives before Bjorn** because AI-generated modules compose from these primitives. If primitives are buggy, every generated module inherits those bugs.
- **Notes overhaul last** because it is the most self-contained and the riskiest data migration. The existing notes work well enough for launch. Rushing the Tiptap migration without thorough round-trip testing risks corrupting user data.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 5 (Module Primitives):** Needs research into charting libraries (recharts vs visx vs chart.js), the exact props/config schema contract that Bjorn's prompt template will reference, and how primitives receive data through the postMessage bridge.
- **Phase 6 (Bjorn Module Builder):** Needs security-focused research into iframe sandbox escape vectors on each platform (WebKitGTK on Linux, WebKit on macOS, WebView2 on Windows). Also needs research into the Bjorn agent's prompt engineering for reliable code generation against the primitives API.
- **Phase 7 (Notes Overhaul):** Needs research into Tiptap's Markdown round-trip fidelity for Obsidian-specific syntax (callout blocks, frontmatter YAML, image embeds). Also CouchDB conflict resolution strategies for concurrent editing.

Phases with standard patterns (skip additional research):
- **Phase 1 (Responsive Shell + Visual Polish):** CSS container queries are well-documented and natively supported. The color audit is mechanical work, not a research problem.
- **Phase 2 (Theming):** CSS variable theming is a solved problem. The two-tier architecture is well-documented.
- **Phase 3 (Setup Wizard):** Standard onboarding patterns. The existing `.planning-v0.1.0-wizard/` archive provides a head start.
- **Phase 4 (Dashboard Grid):** react-grid-layout v2 is mature with extensive documentation and examples.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All recommended libraries are mature (1M+ weekly downloads or established ecosystem). Verified against npm, GitHub, official docs. Only uncertainty: react-grid-layout v2 + React 19 compatibility (community fork available as fallback). |
| Features | HIGH | Competitive analysis covers 7 direct competitors with verified feature sets. Table stakes are consensus across all competitors. Differentiator (AI module builder) has no direct competitor, confirming genuine novelty. |
| Architecture | HIGH | All patterns use standard React + browser APIs. Dashboard grid and theme engine extend existing codebase patterns (preferences-sync, modules.ts, SQLite sync). Module Sandbox (srcdoc iframe) is the most standard browser isolation technique. |
| Pitfalls | HIGH (critical), MEDIUM (moderate) | Critical pitfalls (#1-5) verified against actual codebase files, CSP config, CouchDB integration, and library issue trackers. Moderate pitfalls (#6-12) based on documented library issues and architectural analysis. Minor pitfalls (#13-16) extrapolated from security patterns and need validation during implementation. |

**Overall confidence:** HIGH

### Gaps to Address

- **react-grid-layout v2 + React 19 compatibility:** Needs validation during implementation. The community fork `react-grid-layout-19` exists but has lower adoption. Test mainline v2.2.2 first.
- **Tiptap Markdown round-trip for Obsidian syntax:** No existing Tiptap extension handles `![[image embeds]]`, callout blocks (`> [!warning]`), or frontmatter YAML. Custom extensions must be built and validated before migrating any real notes.
- **iframe sandbox behavior on Linux (WebKitGTK):** Tauri cannot distinguish iframe requests from main window requests on Linux. The `sandbox` attribute provides browser-level isolation, but edge cases in WebKitGTK's implementation need testing.
- **Bjorn code generation reliability:** The quality of AI-generated React components depends on prompt engineering and the primitives API contract. This must be validated empirically during Phase 6.
- **CSP `worker-src 'none'` impact:** The current CSP blocks Web Workers entirely. The notes graph view and force-directed layout computation may need off-main-thread work. Decision needed: relax to `worker-src 'self'` or compute heavy tasks in Rust on the Axum backend.
- **Bundle size budget:** Estimated 150-200KB gzipped for new dependencies. Needs measurement with `npx vite-bundle-visualizer` during implementation. Budget: notes chunk under 500KB, dashboard chunk under 300KB.

## Sources

### Primary (HIGH confidence)
- [react-grid-layout GitHub](https://github.com/react-grid-layout/react-grid-layout) -- v2 TypeScript rewrite, responsive breakpoints, layout persistence
- [Tiptap 3.0 stable](https://tiptap.dev/blog/release-notes/tiptap-3-0-is-stable) -- Rich text editor framework
- [Tiptap React docs](https://tiptap.dev/docs/editor/getting-started/install/react) -- Integration patterns
- [Sucrase GitHub](https://github.com/alangpierce/sucrase) -- Browser-side JSX/TS transform
- [Tauri v2 CSP docs](https://v2.tauri.app/security/csp/) -- Content Security Policy constraints
- [Tauri v2 Isolation Pattern](https://v2.tauri.app/concept/inter-process-communication/isolation/) -- iframe sandboxing reference
- [OWASP LLM01:2025 Prompt Injection](https://genai.owasp.org/llmrisk/llm01-prompt-injection/) -- AI security risks
- [NVIDIA: Sandboxing Agentic Workflows](https://developer.nvidia.com/blog/practical-security-guidance-for-sandboxing-agentic-workflows-and-managing-execution-risk/) -- Sandbox security patterns
- [Home Assistant Dashboards](https://www.home-assistant.io/dashboards/) -- Competitor dashboard patterns
- [Grafana Dynamic Dashboards 2026](https://grafana.com/whats-new/2026-01-14-dynamic-dashboards-in-public-preview/) -- Competitor dashboard patterns
- [Notion AI Features](https://www.notion.com/product/ai) -- Competitor AI features
- [Raycast Features](https://www.raycast.com/) -- Competitor UX patterns

### Secondary (MEDIUM confidence)
- [Liveblocks: Rich Text Editor Comparison 2025](https://liveblocks.io/blog/which-rich-text-editor-framework-should-you-choose-in-2025) -- Tiptap vs Lexical vs BlockNote analysis
- [ilert: Why React-Grid-Layout](https://www.ilert.com/blog/building-interactive-dashboards-why-react-grid-layout-was-our-best-choice) -- Real-world RGL case study
- [react-grid-layout Issues #902, #1583](https://github.com/react-grid-layout/react-grid-layout/issues) -- Layout persistence gotchas
- [react-resizable Issue #237](https://github.com/react-grid-layout/react-resizable/issues/237) -- Resize handle lag during drag
- [CSS Container Queries Guide](https://dev.to/smriti_webdev/building-a-responsive-layout-in-2025-css-grid-vs-flexbox-vs-container-queries-234m) -- Container query patterns
- [Sandpack offline limitations](https://github.com/codesandbox/sandpack/issues/1223) -- Why Sandpack was rejected
- Existing codebase analysis: `tauri.conf.json`, `globals.css` (100+ variables), `dashboard/types.ts`, `vault.ts`, `NoteEditor.tsx`, `CONCERNS.md`

### Tertiary (LOW confidence)
- [tiptap-wikilink-extension](https://github.com/aarkue/tiptap-wikilink-extension) -- Community reference for wiki-link implementation (needs adaptation for Obsidian syntax)
- [react-grid-layout-19 fork](https://github.com/Censkh/react-grid-layout-19) -- React 19 compatibility fallback (may not be needed)

---
*Research completed: 2026-03-19*
*Ready for roadmap: yes*
