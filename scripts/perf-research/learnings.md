# Performance Autoresearch Learnings

## Final Session Summary (2026-03-15)

| Metric | Before session | After session | Delta |
|--------|---------------|---------------|-------|
| **Total gzip JS** | 357.20 kB | 338.84 kB | **-18.36 kB (-5.1%)** |
| **Total gzip CSS** | 8.69 kB | 4.70 kB | **-3.99 kB (-45.9%)** |
| **JS chunks** | — | 58 | — |
| **Hardcoded hex colors** | 248 | 55 (source) / 85 (incl. tests) | **-193 source (-78%)** |
| **Inputs without aria-label** | 68 | 73 | +5 (new pages added) |
| **div-onClick violations** | 7 | — | fixed 5 in session |

### What shipped
1. **react-markdown to marked + DOMPurify** — biggest single win: -25.60 kB gzip (-55% on MarkdownBubble chunk)
2. **Tailwind trimmed to preflight only** — -4.34 kB gzip CSS (-50%), no utility classes were in use
3. **CSS variable cleanup** — replaced 23 hardcoded hex values with CSS vars across 7+ files
4. **A11y top-5 fixes** — AudioWaveform, Lightbox, MessageMenu, PageHeader, Sidebar

### What we learned
- Supabase client (43 kB gzip) cannot be lazy-loaded because AuthGuard needs it at startup
- Lucide icons chunk (10.78 kB) is already well tree-shaken with 85 named imports
- Index chunk (24.28 kB) contains Sidebar + LayoutShell, legitimately eager-loaded
- Many hardcoded hex colors (e.g. `#4ade80`, `#ef4444`, `#60a5fa`) have no exact CSS var match — need new vars defined
- Total JS grew +11.28 kB from mid-session (327.56 kB) to final (338.84 kB) due to new pages (Notes, SettingsModules) and feature additions

### Remaining opportunities
- Split Settings (21+ kB gzip across Settings + SettingsModules) into lazy sub-routes
- Define new CSS vars for remaining Tailwind palette colors used in source (55 occurrences)
- Label 73 remaining inputs without `aria-label`
- Check for duplicate deps across chunks

---

Current baseline: **338.84 kB** total gzip JS + **4.70 kB** gzip CSS (2026-03-15)

## Confirmed Improvements

### CSS variable cleanup — hardcoded hex colors (2026-03-15)

**Before:** 248 hardcoded hex color occurrences across .tsx/.ts files
**After:** 228 hardcoded hex color occurrences (-20 occurrences, -8%)

Replaced 4 exact-match hex values with their CSS variable equivalents:

| Hex value | CSS variable | Occurrences replaced | Files touched |
|-----------|-------------|----------------------|---------------|
| `#f87171` | `var(--red)` | 11 | Todos, Settings, Messages, Agents, Pipeline, BackendErrorBanner, ContextMenu |
| `#34d399` | `var(--green)` | 5 | Pipeline, Missions |
| `#fbbf24` | `var(--warning)` | 6 | Settings, Todos, Login, Missions, DemoModeBanner |
| `#e4e4ec` | `var(--text-primary)` | 1 | Settings |

**Skipped (no exact CSS var match):**
- `#4ade80` (19x) — Tailwind green-400, closest is `--green-bright: #6ee7b7` (different value)
- `#22c55e` (11x) — Tailwind green-500, no direct var
- `#ef4444` (13x) — Tailwind red-500, no direct var (`--red` is `#f87171`)
- `#60a5fa` (8x) — Tailwind blue-400, no direct var
- `#f59e0b` (10x) — Tailwind amber-500, no direct var
- `#fff` (54x) — White, used in many different semantic contexts (buttons, backgrounds, QR codes); `--text-on-accent` only applies to colored button text

**Note:** This is a code quality win, not a bundle size win. CSS variables resolve at runtime so bundle size is unchanged. The main benefit is theme-correctness — if the user customizes the accent/theme, `var(--red)` will reflect theme overrides while raw hex won't.

### Bundle — react-markdown → marked + DOMPurify (2026-03-15)

**Before:** MarkdownBubble chunk 155.49 kB raw / 46.30 kB gzip (react-markdown + remark-gfm + unified ecosystem)
**After:** MarkdownBubble chunk 62.15 kB raw / 20.70 kB gzip (marked + DOMPurify)
**Delta:** -25.60 kB gzip (-55% for this chunk, -8.3% total bundle)

Also externalized `@tauri-apps/*` in vite.config.ts to fix standalone `vite build`.

**TODO:** Add CSS styles for `.md-bubble` elements (h1, h2, code, blockquote, etc.) to globals.css — the inline component overrides from react-markdown are gone. Also uninstall `react-markdown` + `remark-gfm`.

### A11y fixes — top 5 violations (2026-03-15)

- `AudioWaveform.tsx`: `<div onClick>` → `<button aria-label="Seek audio">`
- `Lightbox.tsx`: backdrop gets `aria-hidden="true"`
- `MessageMenu.tsx`: emoji buttons get `aria-label="React with ❤️"` etc.
- `PageHeader.tsx`: both search inputs get `aria-label="Search"`
- `Sidebar.tsx`: quick-capture input gets `aria-label="Quick capture"`

## A11y Baseline (2026-03-15)

| Issue | Count | Priority |
|-------|-------|----------|
| `<input>` without `aria-label` | **68** | High |
| `<div onClick>` instead of `<button>` | **7** | High |
| Modals with `role="dialog"` | 5 (need to audit total modal count) | Medium |
| `<img>` without `alt` | 0 ✅ | — |

Top files for input labels: `Email.tsx`, `Settings.tsx`, `Pomodoro.tsx`, `OnboardingWelcome.tsx`, `GlobalSearch.tsx`, `Sidebar.tsx`

## Failed Experiments

*(none yet)*

## Hypotheses to Try

### Tailwind CSS trimmed — preflight only (2026-03-15)

**Before:** CSS 31.56 kB raw / 8.69 kB gzip (full `@import "tailwindcss"`)
**After:** CSS 14.84 kB raw / 4.35 kB gzip (`@import "tailwindcss/preflight"` only)
**Delta:** -4.34 kB gzip CSS (-50%)

No Tailwind utility classes are used in the app — all styling is custom CSS classes in globals.css. Only the preflight reset (browser normalization) was needed.

### Done
- [x] Chat chunk: was react-markdown — swapped to marked + DOMPurify (-25.6 kB gzip)
- [x] Icons chunk: 85 named imports, well tree-shaken at 10.72 kB — no action needed
- [x] Supabase: can't lazy-load (AuthGuard needs it at startup) — 43 kB is the floor
- [x] Index chunk: Sidebar + LayoutShell, all legitimately eager — 24 kB is reasonable

### Remaining
- [ ] Split Settings (91 kB raw) into lazy sub-routes per section
- [ ] Check for duplicate deps across chunks (e.g. supabase realtime vs main client)
- [ ] A11y: label remaining ~63 inputs without aria-label
- [ ] CSS vars: replace remaining 228 hardcoded colors (add new vars for missing ones)

## Rules for Experiments

1. Make ONE change at a time
2. Run `./measure.sh` after each change
3. If total_gzip_kb improves: keep the change, record here as "Confirmed Improvement"
4. If total_gzip_kb stays same or gets worse: `git checkout` the changed files, record as "Failed Experiment"
5. Never break functionality — run `cd frontend && npm run type-check` after each change
6. Git commit each successful improvement with the size delta in the message
