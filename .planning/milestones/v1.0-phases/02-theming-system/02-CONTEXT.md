# Phase 2: Theming System - Context

**Gathered:** 2026-03-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Build a comprehensive theming system with curated presets, system-follow mode, import/export, font customization, custom branding, CSS injection, theme scheduling, and per-page/per-category theme overrides. The layered architecture separates base themes (surfaces, text, borders) from accent colors (user picks independently). Phase 1 already migrated all hardcoded colors to CSS variables, making theme overrides work everywhere.

This phase does NOT include: the advanced visual CSS variable editor UI (deferred to v2 per requirements), community theme gallery/marketplace, or dashboard grid/widgets.

</domain>

<decisions>
## Implementation Decisions

### Preset Architecture (Layered)
- **Base themes** control surfaces, text, borders, shadows — the overall look
- **Accent colors** are independent — user picks accent separately from base theme
- Mix and match: any base theme with any accent color
- Each base theme defines a default accent, secondary accent, and glow color
- User customizations to a theme (accent override, glow, fonts) are saved per-theme
- Switching via Super+T loads the user's SAVED version, not factory default
- "Reset to Default" button restores factory settings for that theme

### Preset Catalog (10+ themes)
Ship these base themes:
- **Light:** Default Light, Solarized Light, Catppuccin Latte, Gruvbox Light
- **Dark:** Default Dark (improved), Dracula, Nord, Solarized Dark, Catppuccin Mocha, Gruvbox Dark, Rosé Pine
- **Colorful/Themed:** Terminal/Watch Dogs style, Purple mode, Pink mode, Monster High mode
- **High Contrast:** High Contrast Light, High Contrast Dark
- Naming: Real names for community themes (Dracula, Nord, Catppuccin), original names for custom ones
- Each preset ships with curated artwork image for the picker card

### Accent Colors
- Keep current 7 accent swatches (purple, blue, green, orange, pink, red, cyan)
- Add custom hex input (color picker) for any color
- Secondary accent (--accent-secondary) defined per base theme, user can override
- Logo color: matches accent by default, override available
- Glow color (--glow-top-rgb): defined per base theme, user can override independently

### Custom Presets
- Users can save current theme config as a named custom preset
- Custom presets support favorite/pin — pinned presets appear at top of picker
- Custom presets include: base theme ID, accent overrides, glow, fonts, logo color, all customizations

### Theme Picker UX (Super+T)
- Keyboard shortcut: Super+T opens theme picker
- Layout: centered modal (like Spotlight/GlobalSearch), not full-screen
- Cards: artwork background + small UI preview mockup overlay showing actual colors
- Color swatches: row of 4-5 circles on each card for quick palette glance
- Live preview on hover: NO — preview in card only, app doesn't change until click
- Mode selector (Light/Dark/System) at the top of the Super+T picker
- Also accessible in Settings → Display panel (expanded version)

### Theme Switching Animation
- Ripple effect from click point: theme spreads outward in a circle from where user clicked
- System-follow OS switch: uses same ripple animation (from center of screen)

### Mode Toggle
- Three modes: Light, Dark, System-follow
- Quick access: at top of Super+T picker + in Settings page
- System-follow uses `prefers-color-scheme` media query
- Mode switch triggers ripple animation

### Theme Persistence & Sync
- Theme selection persisted to Supabase via existing preferences-sync
- Per-theme user customizations saved locally + synced
- Theme applies instantly without page reload (CSS variable swap)

### Import/Export
- **Import from:** JSON file picker, paste JSON/URL, drag and drop onto picker, share code (compressed base64 string)
- **Export includes:** Full theme definition + all user customizations (accent, glow, fonts, logo)
- **Artwork:** Included in export (artwork + UI preview) — optional checkbox, user's choice
- **Validation:** Strict — reject invalid themes with clear error message on any issue
- **Share code:** Base64-encoded compressed JSON for easy sharing in Discord/chat

### Font Customization
- **4 font slots:** body, heading, mono, UI (buttons/labels/sidebar)
- **Font sources:** System fonts, bundled selection (Inter, JetBrains Mono, Fira Code, etc.), Google Fonts API, custom .ttf/.woff2 file upload
- **Font picker:** Selecting a font immediately applies it live to the app (revert on cancel)
- **Base font size:** Global scale slider (80% to 120%) that multiplies all type sizes
- **Part of theme:** Fonts are saved with themes. Switching themes changes fonts.
- **Global font override toggle:** Optional setting to persist font choices across all themes (overrides theme fonts)
- CSS variables: `--font-body`, `--font-heading`, `--font-mono`, `--font-ui` (add --font-ui in this phase)

### Custom Branding
- **App title text:** Customizable — replaces "OpenClaw Manager" everywhere (title bar, login page, sidebar header, window title)
- **App logo/icon:** Upload custom logo image to replace default
- **Sidebar header text:** Custom text
- **Login page branding:** Custom title and tagline

### Custom CSS Injection
- **Built-in CSS editor:** Monaco/CodeMirror in Settings with syntax highlighting and live preview
- **External file:** User points to a .css file on disk, app watches for changes and hot-reloads
- Both options available — built-in for quick tweaks, external for power users

### Theme Scheduling
- **Auto sunrise/sunset:** Detect approximate time, switch light/dark automatically
- **Manual time ranges:** User sets specific times (e.g., "Nord Dark from 6pm to 8am, Solarized Light otherwise")
- Both available as schedule options

### Per-Page/Per-Category Theming
- **Global theme** applies to all pages by default
- **Per-page override:** Each page/module can have its own full theme OR just accent color override
- **Per-category override:** Sidebar categories can have their own theme
- **Access:** Via sidebar right-click context menu on modules/categories, and in module settings panel
- **Fully optional** — only applies if user explicitly sets an override
- Overrides cascade: Global → Category → Page (most specific wins)

### Claude's Discretion
- Exact artwork images for built-in presets (source/create appropriate imagery)
- CSS editor implementation details (Monaco vs CodeMirror — CodeMirror already in the app for notes)
- Share code compression algorithm (lz-string or similar)
- Sunrise/sunset calculation approach (no location API — use system timezone offset)
- Google Fonts API integration details
- How to enumerate system fonts (Tauri API or font enumeration library)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Theming Foundation
- `frontend/src/lib/themes.ts` — Current accent presets, applyAccentColor(), applyGlowColor(), applySecondaryColor(), applyLogoColor(), localStorage persistence
- `frontend/src/globals.css` — All CSS variables (100+), light theme overrides `[data-theme="light"]`
- `frontend/src/main.tsx` — Theme loading on startup
- `frontend/src/lib/preferences-sync.ts` — Multi-device preference sync to Supabase

### Settings UI
- `frontend/src/pages/Settings.tsx` — Current settings with theme/accent controls
- `frontend/src/pages/settings/SettingsDisplay.tsx` — Display settings panel (theme controls live here)

### Keybindings
- `frontend/src/lib/keybindings.ts` — Keyboard shortcut system (Super+T needs registration)
- `frontend/src/components/GlobalSearch.tsx` — Spotlight modal pattern (reference for Super+T picker)
- `frontend/src/components/CommandPalette.tsx` — Command palette pattern (reference for modal UX)

### Phase 1 Decisions
- `.planning/phases/01-responsive-layout-visual-polish/01-CONTEXT.md` — Inter font, Phosphor icons, spacing scale, shadow depth decisions that Phase 2 builds on

### Research
- `.planning/research/SUMMARY.md` — Theme engine architecture recommendation (JSON-serializable definitions, two-tier variables)
- `.planning/research/PITFALLS.md` — Pitfall #9: variable explosion, Pitfall #13: malicious CSS in imports

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `themes.ts` — Already has accent presets, darken/lighten helpers, apply functions, localStorage persistence. Extend this into full ThemeDefinition type.
- `preferences-sync.ts` — Already syncs localStorage to Supabase. Theme preferences plug right in.
- `GlobalSearch.tsx` — Spotlight modal pattern. Super+T picker should follow same UX patterns (centered modal, escape to close, keyboard navigation).
- `applyAccentColor()` / `applyGlowColor()` — Already set CSS variables on document root. Theme switching extends this pattern.
- `[data-theme="light"]` in globals.css — Light mode override pattern already established.

### Established Patterns
- `useSyncExternalStore` for reactive cross-component state (keybindings, sidebar settings) — use same pattern for theme state
- `useLocalStorageState` for persistent local state
- Lazy-loaded modals (CommandPalette, OnboardingWelcome) — theme picker should follow same lazy-load pattern
- `useEscapeKey` hook for modal dismissal

### Integration Points
- `LayoutShell.tsx` — Where theme provider wraps the app
- `main.tsx` — Where theme loads on startup (already loads accent)
- `keybindings.ts` — Register Super+T shortcut
- Settings page — Expand display panel with full theme controls
- Sidebar context menu — Add per-page/per-category theme options

</code_context>

<specifics>
## Specific Ideas

- Theme picker should look like the Catppuccin picker screenshot: large cards with artwork + theme name overlay
- Super+T for quick access (not Super+K which is already Spotlight)
- Ripple animation from click point when switching themes — "don't be basic"
- Monster High, Watch Dogs/Terminal, Purple, Pink as fun themed presets
- Per-theme saved customizations: switching back to a theme loads YOUR version, not factory
- "Reset to Default" button for each theme
- Share code (compressed base64) for easy Discord/chat sharing
- Custom app title that propagates EVERYWHERE (title bar, login, sidebar, window title)
- Per-category theming accessible from sidebar right-click context menu

</specifics>

<deferred>
## Deferred Ideas

- **Advanced visual CSS variable editor** — Full GUI with sliders for every variable. Deferred to v2 per REQUIREMENTS.md (ATHEME-01, ATHEME-02).
- **Community theme gallery** — Static JSON index hosted on GitHub for browsing community themes. Deferred to v2 (ATHEME-03).
- **Theme marketplace** — Out of scope entirely.

</deferred>

---

*Phase: 02-theming-system*
*Context gathered: 2026-03-19*
