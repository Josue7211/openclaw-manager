# Research Summary: v0.0.3 -- Bug Fixes + OpenClaw Controller + Polish

**Generated:** 2026-03-22
**Milestone:** v0.0.3
**Research files synthesized:** STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md

---

## Executive Summary

OpenClaw Manager v0.0.3 introduces five major feature areas into an established Tauri v2 + Axum + React desktop app: a WYSIWYG notes editor (TipTap replacing CodeMirror), full OpenClaw gateway CRUD (agents, crons, usage, memory), a theme blend slider (continuous dark/light interpolation), an embedded terminal widget (xterm.js + portable-pty), and a project tracker with kanban board (Supabase-backed). All five features map cleanly onto existing architectural patterns -- frontend React Query, Axum proxy routes, CouchDB/Supabase storage -- requiring no new paradigms. The biggest scope item is the TipTap editor migration, which carries the highest risk due to markdown round-trip fidelity with CouchDB/Obsidian LiveSync format. The remaining features are standard CRUD, CSS interpolation, and WebSocket proxying, all of which have proven patterns already in the codebase.

The recommended approach is to tackle bug fixes first (they are already partially addressed but need verification), then build independent features in parallel (theme blend, OpenClaw gateway routes, project tracker schema), followed by the high-complexity features (TipTap editor, terminal widget) where focused attention reduces risk. The critical risk across all features is bundle size -- adding TipTap (~22 packages) and xterm.js (~3 packages) while removing CodeMirror (~11 packages) requires careful lazy-loading and chunking to stay under a 5MB budget. The second critical risk is TipTap silently stripping Obsidian-specific markdown constructs (callouts, wikilinks, image embeds) during the parse/serialize cycle, which would permanently corrupt notes. This must be addressed with a roundtrip test suite before any user content flows through TipTap.

Key mitigations: store markdown as canonical format (never TipTap JSON in CouchDB), build custom TipTap nodes for wikilinks and image embeds before migrating the editor, use OKLCH color space for theme blending to avoid contrast failures at mid-range positions, sanitize all OpenClaw gateway error responses to prevent credential leaks, and implement PTY process group cleanup to prevent zombie shells.

---

## Key Findings

### From STACK.md

| Technology | Purpose | Rationale |
|-----------|---------|-----------|
| TipTap v3.20.x (React) | WYSIWYG notes editor | Official `@tiptap/markdown` for bidirectional CouchDB round-trip; replaces CodeMirror 6 |
| @xterm/xterm v6 | Terminal emulator | De facto standard; 30% smaller than v5; powers VS Code terminal |
| portable-pty 0.9 (Rust) | PTY spawning | From wezterm project; cross-platform; avoids tightly-coupled tauri-plugin-pty |
| CSS color-mix(in oklch) | Theme interpolation | Native browser API; perceptually uniform blending; no JS color library needed |
| lowlight v3 | Syntax highlighting | Decoupled engine for TipTap code blocks; controls which languages load |

- **22 new TipTap packages** replace 11 CodeMirror packages. Net +15 packages but most TipTap extensions are <5KB wrappers.
- **No new state library needed** -- useSyncExternalStore pattern is sufficient for theme blend and terminal state.
- **tauri-plugin-pty rejected** -- 137 weekly downloads, tight Tauri coupling. Direct portable-pty via Axum WebSocket is safer.
- **No new frontend data-fetching patterns** -- all OpenClaw CRUD goes through existing api.ts + React Query mutations.

### From FEATURES.md

**Must-have (P1 for v0.0.3):**
- WYSIWYG editor with inline formatting, tables, slash commands, floating toolbar, markdown round-trip
- OpenClaw agent CRUD (create/update/delete, lifecycle start/stop, model assignment)
- OpenClaw cron CRUD (create/update/delete, schedule editor, enable/disable toggle)
- Theme blend slider (0-100% dark/light, OKLCH interpolation, persisted)
- Kanban board persistence (Supabase tables, CRUD, drag-and-drop, card detail panel)

**Should-have (P2, add during stabilization):**
- Terminal widget (xterm.js + PTY, high complexity/security risk -- defer until core stable)
- Agent memory browser (view/edit/clear RAG context)
- Note templates (meeting notes, daily journal, retro)
- Full-text note search across content

**Defer to v0.0.4+:**
- Real-time collaboration on notes (Yjs + Hocuspocus -- massive scope)
- Version history for notes (CouchDB revision diffing)
- Kanban swimlanes, agent comparison dashboard

**Anti-features (explicitly reject):**
- Obsidian plugin compatibility (different paradigm)
- Storing TipTap JSON in CouchDB (breaks LiveSync)
- Full SSH client / multi-gateway support (scope creep)
- Real-time collaboration in v0.0.3 (infrastructure not ready)

### From ARCHITECTURE.md

**All five features follow established patterns:**
- Frontend: React Query fetches through api.ts to localhost:3000
- Backend: Axum proxy routes with RequireAuth, credentials from AppState.secret()
- Storage: Supabase for structured data, CouchDB for document content
- Real-time: Supabase Realtime for project items, WebSocket for terminal

**Major components:**
| Component | Pattern | Key Files |
|-----------|---------|-----------|
| NoteEditor rewrite | TipTap useEditor + markdown extension | NoteEditor.tsx, EditorToolbar.tsx (both rewritten) |
| OpenClaw gateway proxy | Generic proxy module (like memory.rs) | New gateway.rs with gateway_forward() helper |
| Terminal relay | WebSocket upgrade (like chat.rs) + PTY | New terminal.rs with CAS connection guard |
| Theme blend | JS interpolation in theme-engine.ts | Modified theme-engine.ts, theme-store.ts, themes.ts |
| Project tracker | Supabase CRUD (like todos.rs) | New projects.rs + 3 new tables + RLS |

**Critical architectural decisions:**
1. Markdown is canonical -- TipTap JSON is ephemeral (in-memory only)
2. Gateway proxy sanitizes all upstream errors before forwarding
3. PTY runs as app user (not root), max 3 concurrent sessions
4. Theme interpolation happens in JS (not CSS), using OKLCH color space
5. Three separate Supabase tables for projects/columns/items (not a single-table anti-pattern)

### From PITFALLS.md

**Top 5 pitfalls in priority order:**

1. **TipTap markdown roundtrip silently drops content** -- ProseMirror strips anything without a schema node. Obsidian callouts, frontmatter YAML, and custom syntax vanish permanently. Prevention: build roundtrip test suite as the FIRST task, implement passthrough node for unrecognized blocks.

2. **Dual-format content corruption during migration** -- CodeMirror and TipTap normalize markdown differently. Prevention: one editor at a time (no toggle), freeze storage format as raw markdown, test against notes with chunk history.

3. **PTY zombie processes and resource leaks** -- Terminal sessions spawn real OS processes that become zombies on unclean teardown. Prevention: kill process GROUP (not just PID), track sessions in AppState, implement PTY reaper, cap concurrent sessions.

4. **OpenClaw API proxy leaks credentials** -- New CRUD routes multiply opportunities for credential exposure in error messages. Prevention: single gateway_forward() helper with error sanitization, validate all path parameters with validate_uuid().

5. **Theme blend produces illegible text** -- Mid-range slider positions create backgrounds where neither dark nor light text colors have sufficient WCAG contrast. Prevention: text color must be a function of background lightness (not the slider), enforce minimum contrast ratios.

**Additional critical pitfall:** Bundle size blow-up. Adding TipTap + xterm.js without removing CodeMirror or lazy-loading pushes the bundle past 5MB. Prevention: lazy-load both editors, remove CodeMirror after migration, set CI bundle budget.

---

## Implications for Roadmap

### Suggested Phase Structure

The following 25 phases are ordered by dependency, risk, and independence. Phases within the same group can run in parallel. Each phase does exactly one thing.

---

**Group A: Bug Verification (must come first)**

**Phase 1: Verify widget resize fix**
- Rationale: v0.0.2 applied a z-index fix but needs verification. Blocks confidence in adding new widgets.
- Delivers: Confirmed widget resize works across all widget types
- Features: Bug fix verification
- Pitfalls to avoid: None (verification only)

**Phase 2: Verify page layout fix**
- Rationale: Pages filling screen width was fixed but needs verification across all pages.
- Delivers: Confirmed full-bleed and scrolling pages work correctly
- Features: Bug fix verification
- Pitfalls to avoid: None

**Phase 3: Verify widget tab-switch fix**
- Rationale: Widget disappearance on tab switch was fixed via memo deps. Needs cross-browser verification.
- Delivers: Confirmed widgets persist across page/tab navigation
- Features: Bug fix verification
- Pitfalls to avoid: None

**Phase 4: Verify widget picker UX fixes**
- Rationale: Duplicates allowed, entry animations, preset feedback, delete dialog -- all recently fixed.
- Delivers: Confirmed widget picker works as designed
- Features: Bug fix verification
- Pitfalls to avoid: None

---

**Group B: Infrastructure foundations (independent, can run in parallel)**

**Phase 5: Set CI bundle budget**
- Rationale: Must be in place BEFORE adding TipTap or xterm.js. Prevents bundle regression.
- Delivers: CI check failing if any chunk >400KB or total >5MB
- Features: Infrastructure
- Pitfalls to avoid: Bundle size blow-up (Pitfall 6)

**Phase 6: Supabase migration for projects**
- Rationale: Database schema must exist before any project tracker code. Migration + RLS + indexes.
- Delivers: projects, project_columns, project_items tables with RLS and Realtime
- Features: Kanban board (schema only)
- Pitfalls to avoid: Single-table anti-pattern

**Phase 7: Install TipTap packages + remove CodeMirror**
- Rationale: Package installation is a prerequisite for all editor work. Install new, do NOT remove old yet.
- Delivers: TipTap packages in node_modules; build still compiles
- Features: Editor migration (prep only)
- Pitfalls to avoid: Do NOT remove CodeMirror packages until migration is complete

---

**Group C: Low-risk independent features (can run in parallel)**

**Phase 8: Theme blend -- OKLCH helpers**
- Rationale: Add hexToOklch, oklchToHex, interpolateHexOklch to themes.ts. Pure utility functions, easily tested.
- Delivers: Color interpolation utilities with unit tests
- Features: Theme blend (foundations)
- Pitfalls to avoid: Using sRGB instead of OKLCH (Pitfall 5)

**Phase 9: Theme blend -- interpolation engine**
- Rationale: Add interpolateThemes() to theme-engine.ts, modify applyTheme() to handle blendPosition.
- Delivers: Working theme interpolation when blendPosition is set programmatically
- Features: Theme blend (engine)
- Pitfalls to avoid: Contrast failure at mid-range; text color must be lightness-dependent

**Phase 10: Theme blend -- slider UI + persistence**
- Rationale: Add slider to SettingsDisplay.tsx, RAF throttling to theme-store.ts, blendPosition to ThemeState.
- Delivers: User-facing slider that blends between dark and light themes in real-time
- Features: Theme blend (complete)
- Pitfalls to avoid: Animated transitions on 50+ CSS vars; system theme interaction

**Phase 11: OpenClaw gateway proxy helper**
- Rationale: Build the gateway_forward() helper in gateway.rs with error sanitization BEFORE any CRUD routes. This is the security-critical foundation.
- Delivers: Reusable proxy function with credential protection and input validation
- Features: OpenClaw controller (foundation)
- Pitfalls to avoid: Credential leaks in errors (Pitfall 4), SSRF via unsanitized IDs

**Phase 12: OpenClaw agent CRUD**
- Rationale: Agent create/update/delete + lifecycle controls. Depends on Phase 11 gateway helper.
- Delivers: AgentManager.tsx page with full CRUD, optimistic updates, loading/error states
- Features: Agent management
- Pitfalls to avoid: Offline behavior when OpenClaw VM unreachable

**Phase 13: OpenClaw cron CRUD**
- Rationale: Cron create/update/delete + schedule editor. Depends on Phase 11 gateway helper.
- Delivers: CronManager.tsx page with human-readable schedule UI
- Features: Cron management
- Pitfalls to avoid: Duplicate crons on retry (use PUT with deterministic IDs)

**Phase 14: OpenClaw usage + models + controller page**
- Rationale: Read-only endpoints (usage, models, tools) plus the OpenClawPage.tsx shell with tab navigation. Lower risk than CRUD.
- Delivers: Usage dashboard, model selector, tool registry, unified OpenClaw page
- Features: OpenClaw controller (complete)
- Pitfalls to avoid: Excessive polling (30s minimum, only when page is active)

**Phase 15: Project tracker backend + API**
- Rationale: Axum routes for project CRUD, depends on Phase 6 schema. Follows todos.rs pattern.
- Delivers: /api/projects/* endpoints with CRUD for boards, columns, items, drag reorder
- Features: Project tracker (API)
- Pitfalls to avoid: Missing RLS, cascade delete issues

**Phase 16: Project tracker frontend + kanban board**
- Rationale: ProjectsPage.tsx with drag-and-drop kanban, card detail panel, Realtime sync. Depends on Phase 15.
- Delivers: Full kanban board page with Supabase Realtime sync
- Features: Project tracker (complete)
- Pitfalls to avoid: DnD jank; use existing HTML5 DnD pattern, not a new library

---

**Group D: High-complexity features (focused attention, sequential)**

**Phase 17: TipTap markdown roundtrip test suite**
- Rationale: This MUST come before any TipTap editor code. Load 20+ representative notes through TipTap parse/serialize and diff against input. Any diff is a blocker.
- Delivers: Test suite that validates roundtrip fidelity; list of edge cases needing custom nodes
- Features: Editor migration (safety gate)
- Pitfalls to avoid: Skipping this step leads to silent data loss (Pitfall 1)
- **Needs `/gsd:research-phase`**: YES -- TipTap markdown extension is "early release" and edge cases are undocumented

**Phase 18: TipTap custom extensions (wikilinks + image embeds)**
- Rationale: WikilinkExtension.ts and ImageEmbedExtension.ts must exist before the editor migration. These handle Obsidian-specific syntax that TipTap does not support natively.
- Delivers: Two custom TipTap nodes with markdown serialization that roundtrip correctly
- Features: Editor migration (custom syntax)
- Pitfalls to avoid: Wikilinks becoming plain text; image embeds breaking on serialize

**Phase 19: TipTap editor migration**
- Rationale: Rewrite NoteEditor.tsx and EditorToolbar.tsx. Depends on Phase 17 (tests pass) and Phase 18 (extensions exist).
- Delivers: WYSIWYG editor with all existing features preserved (formatting, toolbar, wikilinks, images, backlinks)
- Features: WYSIWYG editor (core migration)
- Pitfalls to avoid: Dual-format corruption (Pitfall 2); one editor at a time, no toggle

**Phase 20: TipTap polish (slash commands, floating toolbar, tables)**
- Rationale: After core migration works, add differentiator features. BubbleMenu, Suggestion API for slash commands, table extension.
- Delivers: Google Docs-level editing experience
- Features: Editor differentiators
- Pitfalls to avoid: Bundle size; lazy-load entire editor component

**Phase 21: Remove CodeMirror packages**
- Rationale: Only after TipTap migration is verified end-to-end. Removes 11 packages from bundle.
- Delivers: Cleaner bundle, no dual-editor overhead
- Features: Cleanup
- Pitfalls to avoid: Removing before migration is confirmed working

---

**Group E: Terminal (highest risk, after core features stable)**

**Phase 22: Terminal PTY backend (portable-pty + WebSocket)**
- Rationale: Build terminal.rs with PTY lifecycle management, CAS connection guard, process group cleanup. Test with 100 open/close cycles.
- Delivers: /api/terminal/ws endpoint that spawns and manages PTY sessions
- Features: Terminal backend
- Pitfalls to avoid: Zombie processes (Pitfall 3); env var leakage (filter MC_*, OPENCLAW_* from PTY env)
- **Needs `/gsd:research-phase`**: YES -- portable-pty API, PTY process group management on macOS/Linux/Windows

**Phase 23: Terminal frontend (xterm.js component)**
- Rationale: xterm.js in React with WebSocket connection, fit addon, theme integration. Depends on Phase 22.
- Delivers: Working terminal component with resize handling, copy/paste, scrollback
- Features: Terminal frontend
- Pitfalls to avoid: Font mismatch with editor; share monospace CSS variable

---

**Group F: Integration + polish (last)**

**Phase 24: Widget registry + sidebar modules**
- Rationale: Register Terminal and Project Board as widgets. Add OpenClaw and Projects to sidebar modules. Wire Settings connections.
- Delivers: All new features accessible from sidebar and widget picker
- Features: Integration
- Pitfalls to avoid: Forgetting requiresConfig for OpenClaw module

**Phase 25: Final verification + bundle audit**
- Rationale: End-to-end verification of all features together. Bundle size audit. Contrast check on theme slider.
- Delivers: Verified v0.0.3 release candidate
- Features: Quality gate
- Pitfalls to avoid: Shipping without checking mid-range theme slider contrast

---

### Research Flags

| Phase | Needs /gsd:research-phase | Reason |
|-------|---------------------------|--------|
| Phase 17 (TipTap roundtrip tests) | YES | TipTap markdown extension is "early release"; edge cases undocumented |
| Phase 18 (Custom TipTap extensions) | MAYBE | aarkue/tiptap-wikilink-extension exists as reference but is unpublished |
| Phase 22 (Terminal PTY backend) | YES | portable-pty API, process group cleanup patterns, cross-platform PTY differences |
| All other phases | NO | Well-documented patterns exist in codebase; standard CRUD/UI work |

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All packages verified on npm/crates.io with recent publish dates. TipTap v3.20.x is 3 days old. xterm v6 published Dec 2025. |
| Features | MEDIUM-HIGH | Table stakes well-defined. OpenClaw API surface needs verification against actual gateway docs. |
| Architecture | HIGH | All patterns verified against existing codebase. No new paradigms needed. |
| Pitfalls | HIGH | Pitfalls verified against official issue trackers (TipTap #7147, xterm #1518) and codebase analysis. |
| TipTap markdown round-trip | MEDIUM | Official extension labeled "early release." Wikilinks and image embeds require custom work. No guarantee of byte-perfect round-trip for edge cases. |
| OpenClaw API endpoints | MEDIUM | Based on code analysis of existing routes. Actual gateway API surface needs verification -- the gateway may have changed since agents.rs and openclaw_cli.rs were written. |
| Terminal cross-platform | MEDIUM | portable-pty covers Linux/macOS/Windows but PTY behavior differs significantly per platform. SSH passphrase key is a known blocker for non-interactive SSH. |

### Gaps to Address

1. **OpenClaw gateway API documentation** -- The actual API surface of the OpenClaw gateway needs verification. Research is based on code patterns, not gateway docs. Before Phase 11, run `curl` against the gateway to confirm available endpoints.

2. **TipTap frontmatter handling** -- Obsidian uses YAML frontmatter blocks (`---`). No research confirms whether TipTap's markdown extension preserves these. Test in Phase 17.

3. **LiveSync chunk boundary behavior** -- When TipTap normalizes whitespace, content length may change, which could shift LiveSync chunk boundaries. This could cause conflicts on Obsidian mobile. Needs testing with actual LiveSync sync.

4. **SSH passphrase key for terminal** -- The `~/.ssh/mission-control` key has a passphrase. Non-interactive SSH from the Axum server will fail. Phase 22 may need to use a separate key without a passphrase (stored in keychain) or SSH agent forwarding. This is unresolved.

5. **TipTap StarterKit vs individual imports** -- ARCHITECTURE.md shows StarterKit usage but PITFALLS.md says never use StarterKit (tree-shaking failures, 100KB+ overhead). Phase 7/19 must use individual extension imports.

6. **Theme blend contrast validation** -- No automated WCAG contrast checking exists in the codebase. Phase 9 needs to implement this as part of the interpolation engine, not as a follow-up.

---

## Sources

Aggregated from all four research files:

**Official documentation:**
- TipTap React, Markdown, Extensions documentation (tiptap.dev)
- xterm.js official documentation (xtermjs.org)
- CSS color-mix() MDN reference
- portable-pty crate documentation (crates.io)

**Issue trackers:**
- TipTap #7147 (markdown roundtrip inconsistency)
- TipTap #471 (tree-shaking issues)
- xterm.js #1518 (memory leak on dispose)

**npm/crates.io registries:**
- @tiptap/react v3.20.4 (published 3 days ago)
- @xterm/xterm v6.0.0 (published Dec 2025)
- portable-pty v0.9.0

**Community references:**
- aarkue/tiptap-wikilink-extension (reference for custom node)
- Evil Martians OKLCH guide
- tauri-terminal (marc2332) reference implementation

**Codebase analysis:**
- 20+ source files analyzed across frontend and backend
- Current NoteEditor.tsx (431 lines), EditorToolbar.tsx (343 lines), chat.rs, agents.rs, vault.ts, vault.rs, themes.ts, theme-engine.ts, theme-definitions.ts, vite.config.ts

---
*Research synthesis for: OpenClaw Manager v0.0.3*
*Synthesized: 2026-03-22*
