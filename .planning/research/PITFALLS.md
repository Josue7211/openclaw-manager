# Pitfalls Research

**Domain:** Adding rich text editor migration, remote API management, terminal embedding, theme interpolation, and bundle management to existing Tauri v2 + Axum + React desktop app (v0.0.3)
**Researched:** 2026-03-22
**Confidence:** HIGH (verified against codebase, official docs, and community post-mortems)

## Critical Pitfalls

### Pitfall 1: TipTap Markdown Roundtrip Silently Drops Content

**What goes wrong:**
ProseMirror (TipTap's foundation) is strict about schema validation -- content that does not match the schema is silently discarded. When content stored as markdown in CouchDB (Obsidian LiveSync format) is loaded into TipTap, any markdown construct lacking a corresponding TipTap node/mark definition is stripped on parse. When serialized back to markdown and saved, that content is permanently gone. TipTap issue #7147 documents that markdown extracted after a parse-serialize roundtrip differs from the original even for standard constructs. The current codebase stores raw markdown strings in CouchDB (`doc.content`) and the `putNote()` function in `vault.ts` writes `note.content` directly -- if that content has been through TipTap's schema, anything TipTap did not understand is gone.

**Why it happens:**
- Obsidian supports markdown extensions (callouts `> [!note]`, Dataview queries, Templater syntax, embedded queries) that have no TipTap equivalent
- TipTap's `enableContentCheck` option only fires events -- it does not prevent stripping
- Developers assume "markdown is markdown" without testing against real vault content
- The existing CodeMirror editor is plaintext -- it passes through everything without interpretation, so all Obsidian-specific syntax survives today

**How to avoid:**
1. Never store TipTap JSON as the canonical format. Keep raw markdown as the source of truth in CouchDB. TipTap's document model is ephemeral (in-memory only).
2. Create a passthrough node for unrecognized markdown blocks. When the markdown parser encounters syntax it cannot map to a TipTap node, wrap it in a `rawBlock` or `unknownMarkdown` node that preserves the original text verbatim and renders it as a styled code block.
3. Add a roundtrip test suite that loads every note in the test vault through TipTap's parse/serialize cycle and diffs the output against the input. Any diff is a data loss bug.
4. Implement `[[wikilink]]` as a custom TipTap node with a dedicated `markdownTokenizer` before migrating any editing. This is the most-used Obsidian extension in the current vault.
5. Support `#tags` as inline marks rather than relying on regex extraction from raw text (which is what `extractTags()` in `vault.ts` does today).

**Warning signs:**
- Notes with Obsidian callouts (`> [!tip]`) appear as plain blockquotes after editing
- Frontmatter YAML blocks disappear or get mangled
- `[[wikilinks]]` break or become plain text
- Tags extracted from content (`extractTags()`) return different results before vs. after a TipTap edit
- User reports "my note is shorter after I opened it"

**Phase to address:**
Notes editor migration (earliest phase). Must be resolved BEFORE any user content flows through TipTap. Build the roundtrip test suite as the very first task, before implementing any TipTap code.

---

### Pitfall 2: Dual-Format Content Corruption During Migration Period

**What goes wrong:**
During the migration from CodeMirror to TipTap, both editors may exist simultaneously. If TipTap saves content with different whitespace normalization than CodeMirror, notes edited in one editor become corrupted when opened in the other. CouchDB's revision system (`_rev`) will accept both formats, creating a state where the same note has been through incompatible pipelines.

The current `putNote()` in `vault.ts` stores content as a raw string and uses `extractWikilinks()` and `extractTags()` to parse metadata from the raw markdown. If TipTap normalizes whitespace, changes list indentation, or reorders frontmatter, these extraction functions produce different results for the same note.

**Why it happens:**
- TipTap normalizes markdown on parse (trailing whitespace, blank lines between blocks, list indentation depth)
- The LiveSync chunk system (`children` array + `h:*` chunk docs + `eden` inline chunks) in CouchDB was designed for raw text -- TipTap may change content at chunk boundaries
- Developers test with fresh notes, not with notes that have existing LiveSync chunk history

**How to avoid:**
1. One editor at a time. Do not ship a "toggle between CodeMirror and TipTap" option. Pick a cutover point and switch completely.
2. Freeze the storage format. Content saved to CouchDB must always be raw markdown, never TipTap JSON. TipTap's `storage.markdown.getMarkdown()` output must match what CodeMirror would have stored.
3. Test against notes with chunk history. The vault reassembly logic in `vault.rs` (lines 179-220) concatenates chunks from `children`, `eden`, and standalone `h:*` docs. Ensure TipTap-edited notes produce valid content when chunked back by LiveSync.

**Warning signs:**
- Notes show extra blank lines or missing blank lines after editing
- LiveSync on mobile Obsidian shows conflicts after editing in TipTap
- `_rev` conflicts in CouchDB logs

**Phase to address:**
Notes editor migration. Implement a migration test that round-trips 50+ representative notes through TipTap and compares output byte-for-byte.

---

### Pitfall 3: PTY Zombie Processes and Resource Leaks from Terminal Sessions

**What goes wrong:**
When embedding a terminal via xterm.js + tauri-plugin-pty, each terminal session spawns a real OS process (bash/zsh/fish). If the terminal component unmounts without properly killing the PTY process, or if the Tauri window closes unexpectedly, the child process becomes a zombie. Over time, accumulated zombie processes consume PIDs and memory. This is especially dangerous in a desktop app where users may open/close terminal panels dozens of times per session.

The xterm.js GitHub (issue #1518) documents that `Terminal.dispose()` does not clean up all references, and the PTY side must be killed separately. The `tauri-plugin-pty` crate has only one maintainer and 137 weekly npm downloads -- it is not battle-tested at scale.

**Why it happens:**
- React component lifecycle (`useEffect` cleanup) fires but the PTY kill signal races with process teardown
- On macOS and Linux, killing the PTY master FD does not always kill the child process group (need `SIGHUP` to the process group)
- Window close (`beforeunload`) in Tauri does not reliably await async cleanup
- Developers test by opening one terminal, not by opening/closing 50 terminals rapidly

**How to avoid:**
1. Kill the process group, not just the PID. Use `kill(-pid, SIGTERM)` (negative PID = process group) in the Rust PTY cleanup handler, with a fallback `SIGKILL` after a 2-second grace period.
2. Track all PTY sessions in `AppState`. Maintain a `HashMap<SessionId, PtyHandle>` in the Axum `AppState` so that on app exit, all PTY processes can be force-killed.
3. Implement a PTY reaper. A background tokio task that periodically checks for orphaned PTY processes and kills them.
4. Limit concurrent terminals. Cap at 3-5 concurrent PTY sessions (similar to `MAX_WS_CONNECTIONS = 5` pattern already in `chat.rs`).
5. Handle `window.onbeforeunload` by sending a synchronous kill signal through Tauri's IPC before the window closes.

**Warning signs:**
- `ps aux | grep pts` shows growing number of shell processes
- System memory creep over hours of use
- "Too many open files" errors
- Terminal becomes unresponsive but the process still runs

**Phase to address:**
Terminal embedding phase. Build the PTY lifecycle manager before building the UI. Test with a loop that opens and closes 100 terminals.

---

### Pitfall 4: OpenClaw API Proxy Leaks Credentials or Forwards Errors Verbatim

**What goes wrong:**
The existing `agents.rs` and `chat.rs` routes proxy to the OpenClaw gateway using secrets from the keychain (`OPENCLAW_API_URL`, `OPENCLAW_API_KEY`). Adding full CRUD for agents, crons, memory, tools, and files means many more proxy routes. Each new route is an opportunity to (a) leak the API key in error messages, (b) forward internal OpenClaw error details to the frontend, or (c) create an SSRF vector where user-supplied data becomes part of the URL.

The current `couch_get()` in `vault.rs` already demonstrates the problematic pattern: on error it returns `CouchDB {status}: {body}` which could contain sensitive info from the upstream service.

**Why it happens:**
- Copy-pasting the `couch_get` error pattern to OpenClaw routes
- Upstream error bodies contain internal paths, stack traces, or API keys in headers
- Developers test with valid inputs; error paths get minimal testing
- URL construction with user-supplied agent IDs or cron names without validation

**How to avoid:**
1. Sanitize all upstream error responses. Never forward the raw error body from OpenClaw to the frontend. Map to a fixed set of error messages: "Agent not found", "Gateway unavailable", "Invalid request".
2. Validate all path parameters. Agent IDs should be UUID-validated (use existing `validate_uuid()`). Cron names should be alphanumeric + dashes only. Reject anything else before it reaches the URL builder.
3. Use a single `openclaw_proxy()` helper (similar to `couch_get()` but with error sanitization built in) so all OpenClaw routes share the same credential handling and error mapping.
4. Never include the API key in logs. Use the existing `redact()` pattern from `redact.rs`.
5. Test error paths explicitly. For each new endpoint, test with: invalid ID, nonexistent resource, OpenClaw offline, OpenClaw returning 500, oversized response body.

**Warning signs:**
- Frontend console shows raw OpenClaw internal errors
- Error messages contain file paths or stack traces
- API key appears in Tauri log output
- SSRF-style requests succeed (e.g., agent ID containing `../`)

**Phase to address:**
OpenClaw controller phase. Implement the `openclaw_proxy()` helper as the first task, then build all routes on top of it.

---

### Pitfall 5: Theme Blend Slider Produces Illegible Text (Contrast Failure)

**What goes wrong:**
The v0.0.3 plan includes a "continuous dark-to-light interpolation" slider for theme blending. When interpolating between dark theme colors (e.g., `--bg-base: #0a0a0f`) and light theme colors (e.g., `--bg-base: #ffffff`) at intermediate positions (30-70%), the resulting backgrounds fall in a mid-gray range where neither dark-mode text colors (white/light gray) nor light-mode text colors (dark gray/black) provide sufficient WCAG contrast. The slider position at 50% is essentially guaranteed to fail AA contrast ratios for body text.

The current `themes.ts` uses naive hex interpolation via `darken()`/`lighten()` which operates in sRGB -- this produces perceptually uneven transitions where the middle values appear muddy.

**Why it happens:**
- RGB/hex interpolation is not perceptually uniform -- 50% between dark and light in sRGB is not perceptually "halfway"
- Text color must switch from light-on-dark to dark-on-light at some threshold, but a smooth slider has no natural breakpoint
- Developers test at the extremes (0% = dark, 100% = light) and miss the middle
- Gamut clipping on sRGB-only displays can shift OKLCH interpolated colors away from expected luminance

**How to avoid:**
1. Use OKLCH color space for interpolation. Replace the `darken()`/`lighten()` functions with OKLCH-based interpolation. CSS `color-mix(in oklch, dark 60%, light)` produces perceptually uniform transitions.
2. Text color must be a function of background lightness, not the slider. At every slider position, compute the OKLCH lightness of `--bg-base` and choose `--text-primary` as white (L < 0.55) or near-black (L >= 0.55). Do not interpolate text color on the same curve as background color.
3. Enforce minimum contrast ratios. After computing every CSS variable pair, verify WCAG AA (4.5:1 for normal text, 3:1 for large text). If a pair fails, adjust the text color until it passes.
4. Limit the slider range or use discrete steps. Instead of continuous 0-100%, offer 10-15 pre-validated positions, or limit to dark-85%-to-dark-15% range and skip the truly unusable middle.
5. Test with actual content. The notes editor, sidebar, and dashboard all have small text elements that will fail first.

**Warning signs:**
- Text becomes hard to read at mid-slider positions
- Users with low-vision cannot use intermediate themes
- Automated contrast checker reports AA failures
- Borders and dividers disappear in the mid-range

**Phase to address:**
Theme system phase. Must include automated contrast validation as part of the slider implementation, not as a follow-up.

---

### Pitfall 6: TipTap + Extensions Blow the Bundle Past Acceptable Size

**What goes wrong:**
The current total JS bundle is ~4.1 MB (uncompressed). Adding TipTap with a "Google Docs-level" extension set (tables, embeds, code blocks, task lists, images, mentions, collaboration) can add 200-400 KB minified. Combined with xterm.js (~250 KB minified), the total bundle could exceed 5 MB uncompressed. The current Vite config has only 4 manual chunks (react, query, icons, phosphor-icons). The `dist-*.js` files in the build output include 7 unnamed `dist-*.js` files totaling over 800 KB that are not being chunked intelligently.

**Why it happens:**
- TipTap historically had tree-shaking issues (prosemirror-tables pulled in even when unused, adding ~85 KB)
- The `StarterKit` extension pulls in everything; developers use it for convenience
- xterm.js and its addons (fit, webgl, canvas) are monolithic
- Each new page/feature adds code that loads on startup if not properly lazy-loaded
- CodeMirror is not removed when TipTap is added, leaving both in the bundle during development (currently 8 `@codemirror/*` packages)

**How to avoid:**
1. Import TipTap extensions individually, never use StarterKit. Import only `@tiptap/extension-document`, `@tiptap/extension-paragraph`, etc. for exactly the features needed.
2. Lazy-load the TipTap editor. The notes editor should be in its own chunk loaded only when the user navigates to Notes. Use `React.lazy()` for the entire editor component.
3. Lazy-load xterm.js. Terminal is a power-user feature. Load it on demand, not at startup.
4. Remove CodeMirror packages from dependencies once TipTap migration is complete.
5. Add chunk configuration for new libraries. Extend `manualChunks` in `vite.config.ts` to put TipTap, xterm.js, and ProseMirror in their own chunks.
6. Set a bundle budget. Add a CI check that fails if any single chunk exceeds 400 KB or total exceeds 5 MB.
7. Audit the unnamed `dist-*.js` chunks to identify what libraries they contain and whether they can be deduplicated or lazy-loaded.

**Warning signs:**
- Cold start time increases noticeably (>500ms regression)
- `npm run build` output shows chunks >500 KB
- Memory usage at idle exceeds 300 MB
- CodeMirror and TipTap/ProseMirror both appear in bundle analysis

**Phase to address:**
Every phase. Set the bundle budget in the first phase, enforce in CI. Remove CodeMirror in the notes migration phase. Lazy-load terminal and editor immediately upon adding them.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Storing TipTap JSON alongside markdown in CouchDB | Faster rendering (no parse step) | Two sources of truth, sync conflicts with Obsidian, doubles storage | Never -- markdown is the canonical format |
| Using TipTap StarterKit | Quick setup, all features immediately | 100+ KB of unused extensions, tree-shaking failures | Never -- import individual extensions |
| Forwarding OpenClaw errors verbatim | Less code in proxy handlers | Credential leaks, confusing error messages | Never -- always sanitize upstream errors |
| Using `setInterval` for PTY health checks | Simple implementation | Race conditions, missed cleanup on rapid mount/unmount | Only if interval > 10s and cleanup is guaranteed |
| RGB interpolation for theme slider | Works with existing `darken()`/`lighten()` functions | Perceptually uneven, mid-range contrast failures | Never -- use OKLCH from the start |
| Keeping CodeMirror as TipTap fallback | Safety net during migration | Permanent 300+ KB bundle overhead, two code paths to maintain | Only during active migration sprint (max 2 weeks), then remove |
| Hardcoded PTY shell path (`/bin/bash`) | Works on Linux | Breaks on macOS (zsh default), Windows (powershell), NixOS (`/run/current-system/...`) | Never -- detect from `$SHELL` or `COMSPEC` env var |

## Integration Gotchas

Common mistakes when connecting to external services.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| OpenClaw API (agent CRUD) | Constructing URLs with unsanitized agent names/IDs (path traversal) | Validate all IDs with `validate_uuid()`, encode names with `urlencoding::encode()` |
| OpenClaw API (cron management) | Assuming cron CRUD is idempotent -- creating duplicate crons on retry | Use PUT with deterministic IDs instead of POST, or check existence before create |
| OpenClaw API (file/workspace) | Serving remote file content with wrong MIME type or without size limits | Validate file extension against allowlist, set Content-Length limit (10 MB), use `mime_from_extension()` pattern from `vault.rs` |
| CouchDB (TipTap content) | Writing content without `_rev` causing 409 conflicts | Always fetch current `_rev` before update, handle 409 with automatic retry (current `putNote()` does this partially) |
| CouchDB (LiveSync interop) | Saving content that breaks LiveSync chunking (e.g., changing `type` from `newnote` to `plain`) | Never modify LiveSync metadata fields (`type`, `children`, `eden`), only update `content` |
| PTY (terminal) | Spawning shell as root or inheriting sensitive env vars | Drop privileges, sanitize `env::vars()` to exclude secrets before spawning |
| Theme system (CSS vars) | Setting CSS variables without updating the `[data-theme]` attribute | Always update both CSS variables AND the data-theme attribute in sync |

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| TipTap re-parsing full markdown on every keystroke | Editor lag, high CPU | Use TipTap's transaction system (edits are deltas, not full re-renders). Only serialize to markdown on save/blur, not on every `onUpdate` | Notes > 5,000 words |
| Fetching all notes from CouchDB on every sync cycle | 30s sync in `vault.ts` re-fetches everything via `_all_docs?include_docs=true` | Use CouchDB `_changes` feed with `since` parameter for incremental sync | Vault > 200 notes |
| xterm.js rendering without WebGL addon | Canvas-based rendering causes high CPU for fast-scrolling terminal output | Use `@xterm/addon-webgl` for GPU-accelerated rendering | Terminal output > 1000 lines/sec (e.g., `find /`) |
| Computing OKLCH contrast ratios on every slider `onChange` | Jank during drag | Debounce contrast validation to 100ms, use CSS `color-mix()` for the live preview (GPU-accelerated), validate in JS only on slider release | Always visible during drag |
| OpenClaw agent list polling every 10s | Unnecessary network traffic when agent state rarely changes | Use SSE or WebSocket for agent state changes (OpenClaw already supports WebSocket for chat). Poll at 30s minimum, or only when the agents page is active | > 10 agents with frequent status changes |
| GraphView re-rendering on every note edit | react-force-graph-2d recalculates entire graph layout (currently 188 KB chunk) | Memoize graph data, only recompute when note links actually change (compare `links` arrays), not on content changes | Vault > 100 notes with links |

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| PTY spawning inherits `MC_API_KEY` and other secrets from parent process env | Child process (user's shell) can read API keys via `env` command | Build explicit env var allowlist for PTY spawn; exclude all `MC_*`, `OPENCLAW_*`, `COUCHDB_*`, `SUPABASE_*` vars |
| Terminal escape sequence injection (e.g., title change sequences rewrite Tauri window title) | UI spoofing, potential for social engineering via crafted terminal output | Sanitize terminal output for dangerous escape sequences (OSC title changes, hyperlink escapes). xterm.js docs explicitly warn about this |
| OpenClaw proxy passes user input to shell commands on remote VM | Remote code execution on OpenClaw VM | Never construct shell commands from user input. Use OpenClaw's API endpoints, not shell exec. Validate all inputs are IDs/names, not commands |
| Theme CSS injection via malformed color values in share codes | XSS via CSS property injection (`color: red; background: url(evil)`) | Validate all color values against strict hex/oklch regex before applying to `style.setProperty()`. Current `applyAccentColor()` does no validation |
| CouchDB document ID injection via note titles | Read/modify arbitrary CouchDB docs (e.g., `_users`, `_config`) | Current `put_note()` in `vault.rs` checks for `..` and `_` prefix -- extend to also block `_all_docs`, `_changes`, `_design` paths |

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Showing TipTap toolbar always (even when not editing) | Cluttered UI, toolbar takes space from content | Show toolbar on focus/selection only, or make it floating. Current `EditorToolbar` is always visible -- consider a floating bubble on text selection |
| Terminal font does not match editor font settings | Visual inconsistency, jarring context switch | Share the monospace font CSS variable between terminal and code blocks |
| Theme slider with no live preview | Users must commit to see the effect | Use CSS `color-mix()` for instant preview, apply theme vars in a scoped container before committing |
| OpenClaw agent management with no error recovery | User deletes an agent, cannot undo | Implement soft-delete pattern (already established in PROJECT.md constraints) for agents and crons |
| Editor mode switch without autosave | User switches notes, loses unsaved changes | Autosave on blur/switch with debounce (current CodeMirror `onChange` triggers save -- ensure TipTap does the same) |
| Terminal opens in wrong directory | User expects PWD = project root, gets home dir | Default to last-used directory, persist per-session. Offer a "Open terminal here" option in the file tree |

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **TipTap Editor:** Often missing frontmatter preservation -- verify YAML front matter (`---` blocks) survives roundtrip
- [ ] **TipTap Editor:** Often missing image embed support -- verify `![[image.png]]` Obsidian syntax renders AND roundtrips (current CodeMirror has custom `ImageWidget` for this)
- [ ] **TipTap Editor:** Often missing keyboard shortcuts -- verify Cmd+B/I/K/Shift+S all work (currently defined in CodeMirror keymap, must be re-implemented)
- [ ] **TipTap Editor:** Often missing wikilink autocomplete -- verify `[[` triggers completion popup (currently implemented in `wikilinkCompletion.ts`, must be ported)
- [ ] **TipTap Editor:** Often missing backlinks panel integration -- verify backlinks still resolve after TipTap migration (currently in `BacklinksPanel.tsx`)
- [ ] **Terminal:** Often missing resize handling -- verify terminal re-fits when panel is resized (need `@xterm/addon-fit` + ResizeObserver)
- [ ] **Terminal:** Often missing clipboard integration -- verify Ctrl+Shift+C/V work correctly (Ctrl+C is SIGINT in terminal, not copy)
- [ ] **Terminal:** Often missing shell detection -- verify correct shell launches on macOS (zsh), Linux (bash/zsh), Windows (PowerShell)
- [ ] **Terminal:** Often missing scrollback persistence -- verify scroll history is not lost when terminal panel is hidden and reshown
- [ ] **OpenClaw CRUD:** Often missing optimistic updates -- verify UI updates immediately on create/delete, rolls back on error
- [ ] **OpenClaw CRUD:** Often missing loading states -- verify skeleton/spinner shows during API calls (follow existing React Query patterns)
- [ ] **OpenClaw CRUD:** Often missing offline behavior -- verify graceful degradation when OpenClaw VM is unreachable (Tailscale down)
- [ ] **Theme Slider:** Often missing persistence -- verify slider position survives app restart (must be in localStorage AND synced to Supabase via preferences-sync)
- [ ] **Theme Slider:** Often missing system theme interaction -- verify slider resets correctly when user switches to "System" theme mode
- [ ] **Bundle Size:** Often missing stale dependency cleanup -- verify CodeMirror packages are removed from `package.json` after migration

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| TipTap data loss (content stripped) | HIGH | If caught quickly: restore from CouchDB revision history (`_rev` chain). If not: restore from Obsidian mobile backup or CouchDB compaction backup. Prevention is critical -- recovery is painful. |
| Zombie PTY processes | LOW | Run `pkill -f pts` or restart app. Add a "kill all terminals" button in Settings. Implement the PTY reaper as a hotfix. |
| Theme contrast failures deployed | MEDIUM | Ship a "Reset to default" button that restores known-good theme. Add contrast validation in next release. Mark affected slider range as disabled. |
| OpenClaw credential leak in logs | HIGH | Rotate the `OPENCLAW_API_KEY` immediately. Audit log files for exposure. Add `redact()` calls to all OpenClaw proxy handlers. |
| Bundle size regression (>5 MB) | LOW | Run `npx vite-bundle-visualizer`, identify largest chunks, add to `manualChunks`, lazy-load offending pages. Usually fixable in 1-2 hours. |
| CouchDB sync conflicts from format mismatch | MEDIUM | Use CouchDB's conflict resolution API (`_bulk_docs` with `_revisions`), pick the markdown version as winner, delete the conflicting revision. |

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| TipTap markdown roundtrip data loss | Notes Editor (first task) | Roundtrip test suite passes for all notes in test vault; zero diff on parse-serialize cycle |
| Dual-format content corruption | Notes Editor (migration cutover) | Byte-for-byte comparison of 50+ notes before/after TipTap edit |
| PTY zombie processes | Terminal Embedding (first task) | Open/close 100 terminals in a loop, verify 0 orphaned processes via `ps aux` |
| OpenClaw credential leaks | OpenClaw Controller (first task) | `grep -r "OPENCLAW" src-tauri/` shows no raw values in error returns; fuzz test with invalid inputs |
| Theme contrast failures | Theme System (embedded in slider impl) | Automated WCAG AA check for all CSS variable pairs at every slider position |
| Bundle size blow-up | Every Phase (CI enforcement) | CI check: no chunk > 400 KB, total < 5 MB uncompressed |
| Terminal inheriting secrets | Terminal Embedding (PTY spawn) | `env` command in embedded terminal shows no `MC_*` or `OPENCLAW_*` vars |
| OpenClaw error forwarding | OpenClaw Controller (proxy helper) | Fuzz test with malformed inputs, verify no upstream detail in response body |
| GraphView performance regression | Notes Editor (after graph integration) | Graph renders in < 200ms for 200-node vault |
| Theme CSS injection | Theme System (share code parsing) | Attempt CSS injection via share code import, verify sanitization blocks it |

## Sources

- [TipTap Issue #7147: Markdown roundtrip inconsistency](https://github.com/ueberdosis/tiptap/issues/7147)
- [TipTap Markdown Extension Docs](https://tiptap.dev/docs/editor/markdown)
- [TipTap Invalid Schema Handling](https://tiptap.dev/docs/guides/invalid-schema)
- [TipTap Custom Markdown Serializing](https://tiptap.dev/docs/editor/markdown/advanced-usage/custom-serializing)
- [TipTap Tree-Shaking Issue #471](https://github.com/ueberdosis/tiptap/issues/471)
- [TipTap Bidirectional Markdown Support](https://tiptap.dev/blog/release-notes/introducing-bidirectional-markdown-support-in-tiptap)
- [xterm.js Security Guide](https://xtermjs.org/docs/guides/security/)
- [xterm.js Memory Leak Issue #1518](https://github.com/xtermjs/xterm.js/issues/1518)
- [xterm.js Flow Control Docs](https://xtermjs.org/docs/guides/flowcontrol/)
- [tauri-plugin-pty (Tnze)](https://github.com/Tnze/tauri-plugin-pty)
- [tauri-terminal reference implementation (marc2332)](https://github.com/marc2332/tauri-terminal)
- [OKLCH in CSS - Evil Martians](https://evilmartians.com/chronicles/oklch-in-css-why-quit-rgb-hsl)
- [CSS color-mix() Complete Guide for 2026](https://devtoolbox.dedyn.io/blog/css-color-mix-complete-guide)
- [OKLCH for Accessible Color Palettes - LogRocket](https://blog.logrocket.com/oklch-css-consistent-accessible-color-palettes)
- [Obsidian LiveSync GitHub](https://github.com/vrtmrz/obsidian-livesync)
- [Axum Error Handling - LogRocket](https://blog.logrocket.com/rust-axum-error-handling/)
- Existing codebase: `vault.ts`, `vault.rs`, `themes.ts`, `NoteEditor.tsx`, `chat.rs`, `agents.rs`, `vite.config.ts`

---
*Pitfalls research for: OpenClaw Manager v0.0.3 feature additions*
*Researched: 2026-03-22*
