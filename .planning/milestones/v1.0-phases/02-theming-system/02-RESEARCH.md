# Phase 2: Theming System - Research

**Researched:** 2026-03-19
**Domain:** CSS theming, View Transitions API, font management, theme scheduling, custom CSS injection
**Confidence:** HIGH

## Summary

Phase 2 builds a comprehensive theming system on the CSS variable foundation established in Phase 1. The app already has 100+ CSS custom properties in `globals.css`, a light/dark mode toggle via `data-theme`, accent/glow/secondary/logo color pickers persisted in localStorage and synced via `preferences-sync.ts`, and the `useSyncExternalStore` pattern used throughout the codebase for reactive cross-component state. This phase extends that foundation into a full theme engine with 17+ curated presets, per-theme user customizations, import/export with share codes, font management (4 slots + Google Fonts + system fonts), custom CSS injection via CodeMirror, theme scheduling via sunrise/sunset calculation, per-page/per-category theme overrides, and a ripple animation on theme switch using the View Transitions API.

The standard stack is minimal: `react-colorful` (5.6.1, 2.5KB) for the hex color picker, `lz-string` (1.5.0, ~5KB) for share code compression, `@codemirror/lang-css` (6.3.1) for the custom CSS editor (CodeMirror 6 is already in the project for the notes editor), and `font-kit` (0.14.3) Rust crate for system font enumeration via a Tauri command. The ripple animation uses the native View Transitions API (`document.startViewTransition`), which has reached Baseline status as of October 2025 (Chrome 111+, Firefox 133+, Safari 18+, Edge 111+) -- but since Tauri uses WebKitGTK on Linux, the implementation must include a graceful fallback to instant swap when the API is unavailable.

**Primary recommendation:** Build a `ThemeStore` (useSyncExternalStore pattern) that manages the entire ThemeState, apply theme presets by iterating CSS custom properties on `document.documentElement.style`, use the View Transitions API with clip-path circle animation for the ripple effect (with fallback), and add a `theme-state` key to `preferences-sync.ts` SYNCED_KEYS with a migration from the old `theme`/`accent-color` keys.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Preset Architecture (Layered):** Base themes control surfaces/text/borders; accent colors are independent. Mix-and-match: any base with any accent. Per-theme user customizations saved and restored on switch. "Reset to Default" restores factory settings per theme.
- **Preset Catalog:** 17+ themes shipped (4 light, 6 dark, 4 colorful/themed, 2 high contrast). Real names for community themes (Dracula, Nord, Catppuccin), original names for custom ones.
- **Accent Colors:** Keep current 7 swatches + custom hex input via react-colorful. Secondary accent, logo color, glow color all overridable per theme.
- **Custom Presets:** Users can save current config as a named custom preset with favorite/pin support.
- **Theme Picker UX:** Super+T opens centered modal (like Spotlight). Cards with artwork + UI preview mockup + color swatches. No live preview on hover. Mode selector at top.
- **Theme Switching Animation:** Ripple from click point using clip-path circle. System-follow uses center of screen.
- **Mode Toggle:** Three modes (Light, Dark, System-follow). prefers-color-scheme media query for system mode.
- **Theme Persistence & Sync:** Supabase via existing preferences-sync. Per-theme customizations synced. Instant CSS variable swap (no reload).
- **Import/Export:** JSON file picker, paste JSON/URL, drag-drop, share code (compressed base64 string with `ocm-theme:v1:` prefix). Artwork optionally included. Strict validation.
- **Font Customization:** 4 font slots (body, heading, mono, UI). Sources: system fonts, bundled (Inter, JetBrains Mono, Fira Code), Google Fonts API, custom file upload. Live preview. Base font size slider (80%-120%). Fonts saved with themes. Global font override toggle.
- **Custom Branding:** App title (replaces "OpenClaw Manager" everywhere), logo upload, sidebar header text, login tagline.
- **Custom CSS Injection:** CodeMirror editor in Settings + external file watching via Tauri. Both available.
- **Theme Scheduling:** Sunrise/sunset auto-switch (timezone-based, no location API) + manual time ranges.
- **Per-Page/Per-Category Theming:** Global -> Category -> Page cascade. Sidebar right-click context menu. Override applied to `<main>` only (sidebar/titlebar stay global).

### Claude's Discretion
- Exact artwork images for built-in presets (source/create appropriate imagery)
- CSS editor: Use CodeMirror (already in project) with `@codemirror/lang-css`
- Share code compression: Use lz-string
- Sunrise/sunset calculation: Use SunCalc or timezone-offset approximation
- Google Fonts API integration details
- System font enumeration approach (Tauri command via font-kit crate)

### Deferred Ideas (OUT OF SCOPE)
- **Advanced visual CSS variable editor** -- Full GUI with sliders for every variable. Deferred to v2 (ATHEME-01, ATHEME-02).
- **Community theme gallery** -- Static JSON index hosted on GitHub. Deferred to v2 (ATHEME-03).
- **Theme marketplace** -- Out of scope entirely.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| THEME-01 | Three theme modes: light, dark, system-follow (via prefers-color-scheme) | ThemeStore manages mode state; system-follow uses matchMedia listener already in main.tsx. Extend with proper ThemeState integration. |
| THEME-02 | 6-8 curated theme presets (2 light, 2 dark, 2 high-contrast, 2 colorful accent) | UI-SPEC defines 17 presets. Each is a JSON object with ~25-30 CSS properties. Two-tier architecture keeps presets maintainable. |
| THEME-03 | Theme selection persisted to Supabase via existing preferences-sync | Add 'theme-state' to SYNCED_KEYS in preferences-sync.ts. Migration from old 'theme'/'accent-color' keys. |
| THEME-04 | Theme applies instantly without page reload | CSS custom property swap on document.documentElement.style. Already proven with existing applyAccentColor() pattern. |
| THEME-05 | All UI elements respect active theme (zero hardcoded colors remaining after POLISH-01) | Phase 1 migrated hardcoded colors. Preset color maps cover all Tier 1 variables. Alpha tints derived programmatically from accent. |
| THEME-06 | Theme import from JSON file | validateTheme() with property name whitelist, value sanitization (reject url(), @import, expression(), javascript:). Share code via lz-string. |
| THEME-07 | Theme export as JSON file | exportTheme() serializes ThemeDefinition + UserThemeOverrides. Optional artwork inclusion. Share code generation. |
| THEME-08 | Smooth transition animation when switching themes | View Transitions API (document.startViewTransition) with clip-path circle ripple from click point. Fallback to instant swap for unsupported browsers/reduced motion. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| react-colorful | 5.6.1 | HexColorPicker for custom accent color | 2.5KB, zero deps, WAI-ARIA accessible, no CSS import needed since v5. HexColorPicker + HexColorInput components. |
| lz-string | 1.5.0 | Theme share code compression | De facto standard for client-side string compression. compressToBase64/decompressFromBase64 for share codes. 6.9M weekly downloads. |
| @codemirror/lang-css | 6.3.1 | CSS language mode for custom CSS editor | Official CodeMirror 6 CSS language package. Provides syntax highlighting, indentation, and CSS property/value autocompletion. Project already uses 8 CodeMirror packages. |
| font-kit (Rust) | 0.14.3 | System font enumeration via Tauri command | Cross-platform font loading library by Servo. SystemSource::all_families() enumerates installed fonts on Linux (fontconfig), macOS (Core Text), Windows (DirectWrite). |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| suncalc | 1.9.0 | Sunrise/sunset calculation | For theme scheduling. Requires lat/lng -- derive approximate coordinates from timezone offset, or use a simpler timezone-based approximation without this library. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| react-colorful | Native `<input type="color">` | Already used in current SettingsDisplay.tsx. react-colorful provides a much better UX (inline saturation/hue picker vs OS-native dialog popup). The 2.5KB cost is negligible. |
| lz-string | pako (zlib) | pako is 45KB vs lz-string's 5KB. lz-string is purpose-built for URL/localStorage-safe string compression. |
| @codemirror/lang-css | Monaco Editor | Monaco is 2.5MB+ vs ~50KB for the CodeMirror CSS extension. CodeMirror is already bundled. |
| font-kit | font-loader crate | font-loader provides `system_fonts::query_all()` but is less maintained. font-kit is by Servo, actively maintained, handles edge cases on all 3 platforms. |
| suncalc | Hardcoded timezone-offset lookup table | SunCalc gives accurate sunrise/sunset for any date given lat/lng. A timezone-offset table is approximate but requires no coordinates. Recommend the simple approach first (see Architecture section). |

**Installation:**
```bash
# Frontend
cd frontend && npm install react-colorful lz-string @codemirror/lang-css
npm install -D @types/lz-string

# Rust (add to src-tauri/Cargo.toml)
# font-kit = "0.14"
# tauri-plugin-dialog = "2"  (for file picker -- logo upload, CSS file browse)
```

## Architecture Patterns

### Recommended Project Structure
```
frontend/src/
  lib/
    theme-store.ts           # ThemeState, useSyncExternalStore, persistence, applyTheme()
    theme-definitions.ts     # Built-in preset definitions (17 ThemeDefinition objects)
    theme-validation.ts      # validateTheme(), sanitizeThemeImport(), whitelist
    theme-scheduling.ts      # Sunrise/sunset calc, schedule checker, timer
    themes.ts                # KEEP existing -- internal helpers (darken, lighten, hexToRgb)
    preferences-sync.ts      # ADD 'theme-state' to SYNCED_KEYS
    migrations.ts            # ADD v4->v5 migration for old theme/accent-color keys
  components/
    ThemePicker.tsx           # Super+T modal (lazy-loaded)
    ThemeCard.tsx             # Individual preset card with artwork + swatches
    ThemePreview.tsx          # Miniature UI mockup showing theme colors
    AccentPicker.tsx          # Swatch row + react-colorful HexColorPicker
    FontPicker.tsx            # Font selection per slot with live preview
    ThemeImportExport.tsx     # Import/export panel
    ThemeScheduler.tsx        # Schedule settings UI
    CustomCssEditor.tsx       # CodeMirror CSS editor + external file watcher
    BrandingSettings.tsx      # App title, logo, sidebar text, login tagline
  pages/settings/
    SettingsDisplay.tsx       # Expanded theme controls (replaces current minimal UI)
```

### Pattern 1: ThemeStore (useSyncExternalStore)
**What:** Centralized theme state management following the established pattern from `keybindings.ts` and `sidebar-settings.ts`.
**When to use:** All theme-related state reads and mutations across any component.
**Example:**
```typescript
// Source: Follows keybindings.ts pattern exactly
// lib/theme-store.ts

import type { ThemeState, ThemeDefinition, UserThemeOverrides } from './theme-definitions'

const STORAGE_KEY = 'theme-state'
let _state: ThemeState = loadInitialState()
const _listeners = new Set<() => void>()

function loadInitialState(): ThemeState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* fallback */ }
  return { mode: 'dark', activeThemeId: 'default-dark', overrides: {}, customThemes: [] }
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(_state))
  _listeners.forEach(fn => fn())
}

export function getThemeState(): ThemeState { return _state }
export function subscribeTheme(fn: () => void) {
  _listeners.add(fn)
  return () => { _listeners.delete(fn) }
}

export function setActiveTheme(id: string, clickEvent?: { clientX: number; clientY: number }) {
  _state = { ..._state, activeThemeId: id }
  applyTheme(_state, clickEvent)
  persist()
}

// Hook for components:
// const themeState = useSyncExternalStore(subscribeTheme, getThemeState)
```

### Pattern 2: Theme Application via CSS Custom Properties
**What:** Apply theme by iterating a ThemeDefinition's `colors` object and setting each as a CSS custom property.
**When to use:** Every theme switch, mode change, or override application.
**Example:**
```typescript
// Source: Extends existing applyAccentColor() pattern in themes.ts
export function applyTheme(state: ThemeState, clickEvent?: { clientX: number; clientY: number }) {
  const def = resolveThemeDefinition(state)
  const overrides = state.overrides[state.activeThemeId]
  const el = document.documentElement

  const apply = () => {
    // Tier 1: Surface/text/border from preset
    for (const [key, value] of Object.entries(def.colors)) {
      el.style.setProperty(`--${key}`, value)
    }
    // Tier 2: Apply user accent overrides
    if (overrides?.accent) applyAccentColor(overrides.accent)
    if (overrides?.glow) applyGlowColor(overrides.glow)
    if (overrides?.secondary) applySecondaryColor(overrides.secondary)
    if (overrides?.logo) applyLogoColor(overrides.logo)
    // Derive alpha tints from accent
    deriveAlphaTints(overrides?.accent || def.colors.accent)
    // Set data-theme for CSS selectors
    el.dataset.theme = def.category.includes('light') ? 'light' : 'dark'
    el.dataset.themeId = def.id
    // Apply fonts
    applyFonts(overrides?.fonts || def.fonts, state.globalFontOverride)
    // Apply font scale
    applyFontScale(overrides?.fontScale || def.fontScale)
  }

  // Use View Transitions API for ripple if available
  if (clickEvent && document.startViewTransition
      && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    performRippleTransition(apply, clickEvent.clientX, clickEvent.clientY)
  } else {
    apply()
  }
}
```

### Pattern 3: View Transitions Ripple Animation
**What:** Circular clip-path animation expanding from click point to reveal new theme.
**When to use:** Theme switching via user click (not initial load).
**Example:**
```typescript
// Source: View Transitions API (Baseline October 2025)
// https://developer.mozilla.org/en-US/docs/Web/API/Document/startViewTransition
// https://akashhamirwasia.com/blog/full-page-theme-toggle-animation-with-view-transitions-api/
import { flushSync } from 'react-dom'

async function performRippleTransition(applyFn: () => void, x: number, y: number) {
  const transition = document.startViewTransition(() => {
    flushSync(applyFn)
  })

  await transition.ready

  const right = window.innerWidth - x
  const bottom = window.innerHeight - y
  const maxRadius = Math.hypot(Math.max(x, right), Math.max(y, bottom))

  document.documentElement.animate(
    {
      clipPath: [
        `circle(0px at ${x}px ${y}px)`,
        `circle(${maxRadius}px at ${x}px ${y}px)`,
      ],
    },
    {
      duration: 400,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)', // --ease-spring
      pseudoElement: '::view-transition-new(root)',
    }
  )
}
```

**Required CSS:**
```css
/* Disable default View Transition animation -- we use custom clip-path */
::view-transition-old(root),
::view-transition-new(root) {
  animation: none;
  mix-blend-mode: normal;
}
```

### Pattern 4: Per-Page Theme Override Scoping
**What:** Apply theme overrides to `<main>` element only, keeping sidebar/titlebar in global theme.
**When to use:** When a page or category has a theme override configured.
**Example:**
```typescript
// In LayoutShell.tsx or a ThemeProvider wrapper
function applyPageOverride(mainEl: HTMLElement, themeId: string) {
  const def = getThemeDefinitionById(themeId)
  if (!def) return
  for (const [key, value] of Object.entries(def.colors)) {
    mainEl.style.setProperty(`--${key}`, value)
  }
}

function clearPageOverride(mainEl: HTMLElement) {
  // Remove all inline custom properties -- inherits from :root
  mainEl.removeAttribute('style')
}
```

### Pattern 5: Share Code Format
**What:** Compressed base64 theme string with version prefix for sharing in Discord/chat.
**When to use:** Theme export as share code and import from share code.
**Example:**
```typescript
import LZString from 'lz-string'

const SHARE_PREFIX = 'ocm-theme:v1:'

export function encodeShareCode(theme: ThemeDefinition, overrides?: UserThemeOverrides): string {
  const payload = { theme, overrides }
  const json = JSON.stringify(payload)
  const compressed = LZString.compressToBase64(json)
  return SHARE_PREFIX + compressed
}

export function decodeShareCode(code: string): { theme: ThemeDefinition; overrides?: UserThemeOverrides } | null {
  if (!code.startsWith(SHARE_PREFIX)) return null
  const compressed = code.slice(SHARE_PREFIX.length)
  const json = LZString.decompressFromBase64(compressed)
  if (!json) return null
  try {
    const parsed = JSON.parse(json)
    // Run through validateTheme() before accepting
    return parsed
  } catch { return null }
}
```

### Anti-Patterns to Avoid
- **Storing 100+ CSS properties per preset:** Use two-tier architecture. Presets define ~25-30 Tier 1 properties. Alpha tints (~50 variables) are derived programmatically from the accent color using `hexToRgba()`.
- **Passing theme through React context/props:** Theme is applied to the DOM via `document.documentElement.style.setProperty()`. Components read theme via CSS `var()` references. No React re-render needed for theme changes.
- **Using `color-mix()` in CSS for alpha tints:** While modern, `color-mix()` is not supported in WebKitGTK versions used by Tauri on some Linux distros. Derive alpha tints in JS and set as CSS variables.
- **Relaxing CSP for custom CSS injection:** Custom CSS uses a `<style>` element, not dynamic code. CSP remains unchanged.
- **Creating a custom file watcher from scratch:** Use Tauri's built-in `fs` plugin or Rust-side `notify` crate for external CSS file watching.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Color picker UI | Custom saturation/hue/brightness picker | `react-colorful` HexColorPicker + HexColorInput | Color space math, accessibility (keyboard navigation, ARIA), touch support, and HSV-to-hex conversion are deceptively complex. react-colorful is 2.5KB and handles all of it. |
| String compression | Custom LZW or deflate implementation | `lz-string` compressToBase64/decompressFromBase64 | URL-safe base64 encoding of compressed data is error-prone. lz-string handles edge cases (Unicode, padding) correctly. |
| CSS syntax highlighting | Custom tokenizer | `@codemirror/lang-css` with CodeMirror 6 | Lezer-based parser provides accurate CSS tokenization, property name completion, and value suggestions. Already bundled (CodeMirror in project). |
| System font enumeration | JavaScript font detection hacks | Rust `font-kit` crate via Tauri command | Browser JS cannot enumerate system fonts reliably (only canvas measurement tricks). font-kit uses native platform APIs (fontconfig, Core Text, DirectWrite). |
| Sunrise/sunset calculation | Manual solar position algorithm | Timezone-offset approximation (or `suncalc` if precision needed) | The solar position algorithm involves Julian dates, hour angles, declination, and atmospheric refraction. For a "roughly correct" sunrise/sunset, a lookup table by latitude band (derived from timezone offset) is sufficient. |
| Ripple animation | Custom DOM cloning + CSS animation | View Transitions API `document.startViewTransition()` | The API handles the snapshot/crossfade natively with zero DOM cloning. The clip-path animation runs on the browser-created pseudo-elements. |
| Theme import validation | Manual property-by-property checks | Schema-driven whitelist validator | A whitelist of allowed CSS property names + a blocklist of dangerous value patterns (url(), @import, expression(), javascript:, script tags) is more maintainable than ad-hoc validation. |

**Key insight:** The theming system's complexity is in orchestration (many moving parts coordinated correctly), not in individual algorithms. Each piece has a well-tested library. The risk is in integration, not implementation.

## Common Pitfalls

### Pitfall 1: Alpha Tint Variables Not Updating on Accent Change
**What goes wrong:** The app has 50+ alpha tint variables (`--accent-a10`, `--purple-a08`, `--red-a12`, etc.) with hardcoded RGBA values in globals.css. Changing the accent color via `applyAccentColor()` updates `--accent` but not the alpha tints, so decorative backgrounds using `--accent-a10` still show the old purple.
**Why it happens:** The alpha tints are defined as static RGBA values, not derived from the accent.
**How to avoid:** After applying a new accent color, regenerate all accent-derived alpha tint variables programmatically. Parse the hex to RGB, then set each alpha tint: `--accent-a10: rgba(${r}, ${g}, ${b}, 0.1)`. The non-accent tints (red-a12, green-400-a12, etc.) remain static per theme preset.
**Warning signs:** Changing accent to red but seeing purple glow/tint backgrounds on hover states.

### Pitfall 2: View Transitions API Not Available in WebKitGTK
**What goes wrong:** `document.startViewTransition` is undefined in certain WebKitGTK versions bundled with Linux distros. The ripple animation silently fails, or worse, the theme switch doesn't happen at all if the code assumes the API exists.
**Why it happens:** Tauri uses the system WebKitGTK on Linux, not a bundled browser. WebKitGTK version depends on the distro. View Transitions reached Baseline in October 2025 (Safari 18+), but WebKitGTK may lag behind Safari releases.
**How to avoid:** Always feature-detect: `if (document.startViewTransition)`. Fallback: apply theme instantly without animation. Also fallback for `prefers-reduced-motion: reduce`.
**Warning signs:** Theme switch works on macOS but does nothing on Linux.

### Pitfall 3: Preferences-Sync Race on Theme State
**What goes wrong:** The existing preferences-sync overwrites localStorage on startup from Supabase (remote wins). If a user changes theme on Device A, then opens Device B before sync completes, Device B's old theme state gets pushed to Supabase, overwriting Device A's change.
**Why it happens:** The current sync is simple "remote wins on load, push on change." There's no timestamp-based conflict resolution.
**How to avoid:** Add a `lastModified` timestamp to `ThemeState`. On sync merge, compare timestamps -- most recent wins. This is simple enough for a single-user app.
**Warning signs:** Theme "reverts" after opening the app on a second device.

### Pitfall 4: Google Fonts API Key Exposure
**What goes wrong:** The Google Fonts API requires an API key for the fonts list endpoint (`https://www.googleapis.com/webfonts/v1/webfonts?key=API_KEY`). Embedding this key in frontend JavaScript exposes it in the bundle.
**Why it happens:** Google Fonts API keys are not secret (they're restricted to the Fonts API and rate-limited), but the project's security posture prohibits any hardcoded keys in source.
**How to avoid:** Proxy Google Fonts API requests through the Axum backend. The API key lives in the OS keychain (via `secrets.rs`) and is never sent to the frontend. Alternatively, bundle a static font list (Google Fonts updates infrequently) and fetch CSS directly from `fonts.googleapis.com` (no key needed for the CSS endpoint).
**Warning signs:** API key visible in browser devtools Network tab or in the JS bundle.

### Pitfall 5: Font Size Scale Breaking Fixed Layouts
**What goes wrong:** Setting `font-size: 120%` on `<html>` makes all `rem` units 20% larger. But the app uses `px` units extensively (spacing scale `--space-N`, component dimensions, layout values). The font scale only affects text, not layout, creating misalignment between text size and container padding.
**Why it happens:** The app's spacing scale is defined in `px`, not `rem`. Typography sizes are also in `px` (--text-sm: 13px).
**How to avoid:** The font scale slider should only affect `--text-*` variables, NOT the `<html>` font-size. Multiply each `--text-*` variable by the scale factor in JS: `el.style.setProperty('--text-base', \`${15 * scale}px\`)`. This keeps spacing and layout in `px` while scaling only text.
**Warning signs:** Increasing font size causes sidebar items to overflow, buttons to misalign, or fixed-height elements to clip text.

### Pitfall 6: Custom CSS Injection via External File
**What goes wrong:** The external CSS file watcher reads a file from disk and injects it as a `<style>` element. If the file contains `background-image: url('http://evil.com/...')`, it could attempt to load external resources.
**Why it happens:** Custom CSS is explicitly NOT sanitized (per UI-SPEC: "it is an explicit power-user feature").
**How to avoid:** The existing CSP (`img-src 'self' data: http://127.0.0.1:3000`) blocks external resource loading in CSS `url()` values. Verify this also blocks `background-image` with external URLs in injected `<style>` elements. The `<style>` element should respect CSP automatically since it's same-origin.
**Warning signs:** External CSS file loads images from the internet.

### Pitfall 7: Migration From Old Theme Keys
**What goes wrong:** Existing users have `theme` (string: 'dark'|'light'|'system'), `accent-color` (hex string), `glow-color`, `secondary-color`, `logo-color` as separate localStorage keys. The new system uses a single `theme-state` key. If migration doesn't run, existing preferences are lost.
**Why it happens:** The migration in `migrations.ts` (v4 -> v5) must read old keys, construct a ThemeState object, write the new key, and remove old keys. If any step fails, the user gets default theme instead of their saved preferences.
**How to avoid:** Write migration v5 carefully in migrations.ts. Read all old keys, construct ThemeState with `mode` from old `theme` key, `activeThemeId` based on mode (default-dark or default-light), and accent/glow/secondary/logo from old keys as UserThemeOverrides. Keep old keys as fallback during one version cycle.
**Warning signs:** After update, all users see default dark theme regardless of previous settings.

## Code Examples

Verified patterns from official sources and existing codebase:

### ThemeDefinition Type (from UI-SPEC)
```typescript
// Source: 02-UI-SPEC.md, verified against existing globals.css variable names
interface ThemeDefinition {
  id: string                    // "dracula", "nord", "custom-{uuid}"
  name: string                  // "Dracula", "My Custom Theme"
  category: 'dark' | 'light' | 'high-contrast' | 'colorful'
  builtIn: boolean
  artwork?: string              // Base64 data URL or asset path
  colors: Record<string, string>  // ~25-30 CSS custom properties
  fonts?: { body?: string; heading?: string; mono?: string; ui?: string }
  fontScale?: number            // 0.8 to 1.2
}
```

### Registering the Theme Picker Keybinding
```typescript
// Source: Follows existing keybindings.ts DEFAULTS pattern
// Add to DEFAULTS array in keybindings.ts:
{ id: 'theme-picker', label: 'Theme picker', key: 't', mod: true, action: 'theme-picker' }
// NOTE: 't' is currently assigned to nav-todos. Reassign nav-todos to a different key
// or use Super+Shift+T for theme picker.
```

**KEYBINDING CONFLICT:** `key: 't'` is already used by `nav-todos` (line 31 of keybindings.ts: `{ id: 'nav-todos', label: 'Go to Todos', key: 't', mod: true, route: '/todos' }`). Options:
1. Change theme picker to `Super+Shift+T` (recommended -- "T for Theme" with Shift to distinguish)
2. Reassign nav-todos to another key (e.g., `Super+O` for "tOdos")

### react-colorful Integration
```typescript
// Source: https://github.com/omgovich/react-colorful
// https://react-colorful.netlify.app/docs/components-hexcolorpicker--overview/
import { HexColorPicker, HexColorInput } from 'react-colorful'

function AccentPicker({ color, onChange }: { color: string; onChange: (c: string) => void }) {
  const [showPicker, setShowPicker] = useState(false)
  return (
    <div>
      {ACCENT_PRESETS.map(p => (
        <button key={p.id} onClick={() => onChange(p.color)}
          aria-label={`${p.label} accent`}
          aria-pressed={color === p.color}
          style={{ background: p.color, width: 28, height: 28, borderRadius: '50%' }} />
      ))}
      <button onClick={() => setShowPicker(!showPicker)} aria-label="Custom accent color">
        {/* Rainbow gradient button */}
      </button>
      {showPicker && (
        <div>
          <HexColorPicker color={color} onChange={onChange} />
          <HexColorInput color={color} onChange={onChange} prefixed alpha />
        </div>
      )}
    </div>
  )
}
```

### lz-string Share Code
```typescript
// Source: https://github.com/pieroxy/lz-string
import LZString from 'lz-string'

// Compress theme to share code
const json = JSON.stringify(themePayload)
const code = 'ocm-theme:v1:' + LZString.compressToBase64(json)
// Result: "ocm-theme:v1:N4IgDgLglmB2AUwgJzA..." (URL/clipboard safe)

// Decompress share code
const compressed = code.slice('ocm-theme:v1:'.length)
const decompressed = LZString.decompressFromBase64(compressed)
const payload = JSON.parse(decompressed)
```

### CodeMirror CSS Editor
```typescript
// Source: https://github.com/codemirror/lang-css
// Project already has @codemirror/view, @codemirror/state, etc.
import { EditorView, basicSetup } from 'codemirror'
import { css, cssCompletionSource } from '@codemirror/lang-css'
import { autocompletion } from '@codemirror/autocomplete'

function createCssEditor(parent: HTMLElement, initialDoc: string, onChange: (value: string) => void) {
  return new EditorView({
    parent,
    doc: initialDoc,
    extensions: [
      basicSetup,
      css(),
      autocompletion({ override: [cssCompletionSource] }),
      EditorView.updateListener.of(update => {
        if (update.docChanged) {
          // Debounce 500ms before applying
          onChange(update.state.doc.toString())
        }
      }),
    ],
  })
}
```

### System Font Enumeration (Rust/Tauri Command)
```rust
// Source: https://github.com/servo/font-kit
// Add to src-tauri/Cargo.toml: font-kit = "0.14"

use font_kit::source::SystemSource;

#[tauri::command]
fn list_system_fonts() -> Vec<String> {
    let source = SystemSource::new();
    match source.all_families() {
        Ok(mut families) => {
            families.sort();
            families.dedup();
            families
        }
        Err(_) => vec![]
    }
}
```

### Sunrise/Sunset from Timezone (No Geolocation)
```typescript
// Approximate approach: derive daylight hours from season + assume mid-latitude
// This gives +/- 30 minute accuracy, acceptable for theme scheduling

function approximateSunTimes(date: Date): { sunrise: Date; sunset: Date } {
  // Day of year
  const start = new Date(date.getFullYear(), 0, 0)
  const dayOfYear = Math.floor((date.getTime() - start.getTime()) / 86400000)

  // Assume ~40 degrees latitude (covers most of US, Europe, East Asia)
  const approxLat = 40
  // Solar declination (simplified)
  const declination = -23.45 * Math.cos((2 * Math.PI / 365) * (dayOfYear + 10))
  const latRad = (approxLat * Math.PI) / 180
  const declRad = (declination * Math.PI) / 180

  // Hour angle at sunrise/sunset
  const hourAngle = Math.acos(-Math.tan(latRad) * Math.tan(declRad))
  const hoursOfDaylight = (2 * hourAngle * 180) / (Math.PI * 15)

  // Solar noon is roughly 12:00 local time
  const solarNoon = 12
  const sunriseHour = solarNoon - hoursOfDaylight / 2
  const sunsetHour = solarNoon + hoursOfDaylight / 2

  const sunrise = new Date(date)
  sunrise.setHours(Math.floor(sunriseHour), Math.round((sunriseHour % 1) * 60), 0, 0)
  const sunset = new Date(date)
  sunset.setHours(Math.floor(sunsetHour), Math.round((sunsetHour % 1) * 60), 0, 0)

  return { sunrise, sunset }
}
```

### Theme Import Validation
```typescript
// Source: 02-UI-SPEC.md Security Contract + PITFALLS.md #13

const ALLOWED_PROPERTY_PATTERNS = [
  /^bg-/, /^text-/, /^border-/, /^accent/, /^glow-/, /^glass-/,
  /^hover-/, /^active-/, /^green/, /^red/, /^warning/, /^amber/,
  /^yellow/, /^gold/, /^blue/, /^purple/, /^cyan/, /^pink/, /^orange/,
  /^shadow-/, /^overlay/, /^font-(body|heading|mono|ui)$/,
]

const DANGEROUS_PATTERNS = [
  /url\s*\(/i, /@import/i, /expression\s*\(/i, /javascript:/i,
  /<script/i, /<\/script/i,
]

function validateThemeImport(data: unknown): { valid: boolean; error?: string } {
  if (!data || typeof data !== 'object') return { valid: false, error: 'Invalid format' }
  const def = data as Record<string, unknown>

  if (!def.id || !def.name || !def.colors) return { valid: false, error: 'Missing required fields' }

  const colors = def.colors as Record<string, string>
  for (const [key, value] of Object.entries(colors)) {
    // Check property name against whitelist
    if (!ALLOWED_PROPERTY_PATTERNS.some(p => p.test(key))) {
      return { valid: false, error: `Unsupported property: ${key}` }
    }
    // Check value against dangerous patterns
    if (typeof value !== 'string') return { valid: false, error: `Invalid value for ${key}` }
    if (value.length > 200) return { valid: false, error: `Value too long for ${key}` }
    if (DANGEROUS_PATTERNS.some(p => p.test(value))) {
      return { valid: false, error: 'This theme file contains unsupported properties and can\'t be imported.' }
    }
  }

  return { valid: true }
}
```

### Alpha Tint Derivation
```typescript
// Derive all accent-dependent alpha tint variables from a base hex color
function deriveAlphaTints(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const el = document.documentElement

  // Accent alpha tints
  const tints = [
    ['accent-a10', 0.1], ['accent-a12', 0.12], ['accent-a15', 0.15],
    ['accent-a30', 0.3], ['accent-a40', 0.4],
  ] as const
  for (const [name, alpha] of tints) {
    el.style.setProperty(`--${name}`, `rgba(${r}, ${g}, ${b}, ${alpha})`)
  }

  // Purple-alpha tints (use accent color instead of hardcoded purple)
  const purpleTints = [
    ['purple-a08', 0.08], ['purple-a10', 0.1], ['purple-a12', 0.12],
    ['purple-a15', 0.15], ['purple-a20', 0.2], ['purple-a30', 0.3],
    ['purple-a40', 0.4], ['purple-a55', 0.55], ['purple-a75', 0.75],
    ['purple-a90', 0.9],
  ] as const
  for (const [name, alpha] of purpleTints) {
    el.style.setProperty(`--${name}`, `rgba(${r}, ${g}, ${b}, ${alpha})`)
  }

  // Border accent
  el.style.setProperty('--border-accent', `rgba(${r}, ${g}, ${b}, 0.25)`)
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| CSS class swapping for themes | CSS custom properties on :root | 2020-2022 | Themes are JS-driven, instant, no class overhead |
| Manual DOM cloning for transitions | View Transitions API | Baseline Oct 2025 | Native browser support for clip-path transitions |
| Server-side font rendering detection | font-kit native enumeration | 2024+ | Accurate system font lists without canvas hacks |
| Base64 manual encoding for sharing | lz-string compressToBase64 | Stable since 2017 | 60-80% compression on theme JSON, URL-safe output |
| Monaco for small editors | CodeMirror 6 | 2022+ | 50KB vs 2.5MB, modular, treeshakable, same features for CSS editing |

**Deprecated/outdated:**
- `window.queryLocalFonts()`: The Local Font Access API exists but requires user permission (popup). font-kit via Tauri command is seamless.
- `document.fonts.check()`: Only tests if a font is loaded, not installed. Cannot enumerate.
- CSS `@supports (color-mix(...))`: Not reliably available in WebKitGTK. Stick with JS-derived alpha tints.

## Open Questions

1. **Keybinding conflict: Super+T**
   - What we know: `Super+T` is currently assigned to "Go to Todos" in keybindings.ts
   - What's unclear: User preference on reassignment
   - Recommendation: Use `Super+Shift+T` for theme picker, keep `Super+T` for Todos. Or reassign Todos to `Super+O`. The planner should pick one and document it.

2. **Artwork images for 17 presets**
   - What we know: UI-SPEC specifies "curated artwork image for the picker card" per preset
   - What's unclear: Source of artwork (generated gradients? stock images? custom illustrations?)
   - Recommendation: For built-in themes, auto-generate artwork from theme colors (gradient/mesh using the 5 swatch colors). For custom themes, auto-generate from theme colors. This avoids asset management and licensing issues. The "Include artwork" export toggle becomes "Include custom artwork" (only for user-uploaded images).

3. **Google Fonts API key management**
   - What we know: The list endpoint requires an API key. CSS endpoint does not.
   - What's unclear: Whether to proxy through Axum or bundle a static font list
   - Recommendation: Bundle a static JSON list of popular Google Fonts (top 100 by popularity) in the frontend. For the actual CSS loading, use the public CSS endpoint (`fonts.googleapis.com/css2?family=...`) which requires no key. Update the static list periodically via a build script, not at runtime.

4. **WebKitGTK View Transitions support**
   - What we know: View Transitions API is Baseline since Oct 2025 (Safari 18+). Tauri on Linux uses system WebKitGTK.
   - What's unclear: Which WebKitGTK version on CachyOS (user's primary platform) supports View Transitions
   - Recommendation: Feature-detect with `if (document.startViewTransition)`. Always implement the instant-swap fallback. Test on the actual target system early in development.

5. **Tauri plugins for file dialog and file watching**
   - What we know: `tauri-plugin-dialog` provides file open/save dialogs. `tauri-plugin-fs` or `notify` crate provides file watching. Neither is currently in Cargo.toml.
   - What's unclear: Whether to add Tauri plugins or implement file operations via existing Axum endpoints
   - Recommendation: For the logo upload and CSS file browse, use `tauri-plugin-dialog` for the native file picker. For CSS file watching, implement in Rust with the `notify` crate (already mature -- just a Tauri command that sets up a watcher and emits events via `app.emit()`). Add `tauri-plugin-dialog = "2"` to Cargo.toml.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.0 + @testing-library/react 16.3.2 |
| Config file | `frontend/vitest.config.ts` |
| Quick run command | `cd frontend && npx vitest run --reporter=verbose` |
| Full suite command | `cd frontend && npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| THEME-01 | Mode switching (dark/light/system) updates data-theme attribute and resolves correct theme | unit | `cd frontend && npx vitest run src/lib/__tests__/theme-store.test.ts -t "mode" -x` | No -- Wave 0 |
| THEME-02 | Built-in presets load correct CSS variable values | unit | `cd frontend && npx vitest run src/lib/__tests__/theme-definitions.test.ts -x` | No -- Wave 0 |
| THEME-03 | Theme state persists to localStorage and syncs via preferences-sync | unit | `cd frontend && npx vitest run src/lib/__tests__/theme-store.test.ts -t "persist" -x` | No -- Wave 0 |
| THEME-04 | applyTheme() sets CSS custom properties on document.documentElement | unit | `cd frontend && npx vitest run src/lib/__tests__/theme-store.test.ts -t "apply" -x` | No -- Wave 0 |
| THEME-05 | All preset color keys match globals.css variable names | unit | `cd frontend && npx vitest run src/lib/__tests__/theme-definitions.test.ts -t "variable names" -x` | No -- Wave 0 |
| THEME-06 | validateThemeImport rejects malicious inputs, accepts valid themes | unit | `cd frontend && npx vitest run src/lib/__tests__/theme-validation.test.ts -x` | No -- Wave 0 |
| THEME-07 | exportTheme produces valid JSON, encodeShareCode produces decodable string | unit | `cd frontend && npx vitest run src/lib/__tests__/theme-validation.test.ts -t "export" -x` | No -- Wave 0 |
| THEME-08 | Ripple animation gracefully degrades when View Transitions API unavailable | unit | `cd frontend && npx vitest run src/lib/__tests__/theme-store.test.ts -t "ripple fallback" -x` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `cd frontend && npx vitest run --reporter=verbose`
- **Per wave merge:** `cd frontend && npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `frontend/src/lib/__tests__/theme-store.test.ts` -- covers THEME-01, THEME-03, THEME-04, THEME-08
- [ ] `frontend/src/lib/__tests__/theme-definitions.test.ts` -- covers THEME-02, THEME-05
- [ ] `frontend/src/lib/__tests__/theme-validation.test.ts` -- covers THEME-06, THEME-07
- [ ] `frontend/src/lib/__tests__/theme-scheduling.test.ts` -- covers sunrise/sunset calculation, schedule time matching
- [ ] Install new dependencies: `npm install react-colorful lz-string @codemirror/lang-css && npm install -D @types/lz-string`

## Sources

### Primary (HIGH confidence)
- [MDN: View Transition API](https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API) -- API reference, browser support table, Baseline status
- [MDN: document.startViewTransition()](https://developer.mozilla.org/en-US/docs/Web/API/Document/startViewTransition) -- Method signature, usage patterns
- [Akash Hamirwasia: Full-page theme toggle with View Transitions](https://akashhamirwasia.com/blog/full-page-theme-toggle-animation-with-view-transitions-api/) -- Verified implementation pattern with clip-path circle animation
- [react-colorful GitHub](https://github.com/omgovich/react-colorful) -- v5.6.1 API, HexColorPicker + HexColorInput components, zero-dependency
- [lz-string GitHub](https://github.com/pieroxy/lz-string) -- v1.5.0 API, compressToBase64/decompressFromBase64
- [CodeMirror lang-css](https://github.com/codemirror/lang-css) -- v6.3.1 CSS language provider with completion source
- [font-kit by Servo](https://github.com/servo/font-kit) -- v0.14.3 cross-platform font enumeration
- [Google Fonts Developer API](https://developers.google.com/fonts/docs/developer_api) -- Font list endpoint, CSS2 API for loading
- [Google Fonts CSS2 API](https://developers.google.com/fonts/docs/css2) -- No API key needed for CSS loading, variable fonts support
- [Tauri Plugin Dialog](https://v2.tauri.app/plugin/dialog/) -- v2 file open/save dialogs with extension filters
- [Tauri GitHub Discussion #9616](https://github.com/tauri-apps/tauri/discussions/9616) -- font-kit approach for system font enumeration in Tauri
- Existing codebase: `themes.ts`, `preferences-sync.ts`, `keybindings.ts`, `sidebar-settings.ts`, `globals.css`, `SettingsDisplay.tsx`, `main.tsx`, `LayoutShell.tsx`, `GlobalSearch.tsx`
- Planning docs: `02-CONTEXT.md`, `02-UI-SPEC.md`, `PITFALLS.md` (#5, #9, #13), `SUMMARY.md`

### Secondary (MEDIUM confidence)
- [Chrome: View Transitions in 2025](https://developer.chrome.com/blog/view-transitions-in-2025) -- Latest updates, cross-document transitions, SPA patterns
- [DevToolbox: CSS View Transitions 2026 Guide](https://devtoolbox.dedyn.io/blog/css-view-transitions-complete-guide) -- Comprehensive SPA/MPA patterns
- [NOAA Sunrise/Sunset Calculator](https://gml.noaa.gov/grad/solcalc/sunrise.html) -- Reference algorithm for solar position
- [suncalc npm](https://www.npmjs.com/package/suncalc) -- v1.9.0, BSD licensed, zero deps
- [Theme Toggle View Transition Demo](https://theme-toggle.rdsx.dev/) -- Working demo of the exact clip-path technique
- [Vuetify Discussion: Ripple on Theme Change](https://github.com/vuetifyjs/vuetify/discussions/19903) -- Community implementation examples

### Tertiary (LOW confidence)
- WebKitGTK View Transitions support: Not directly verified for the specific WebKitGTK version on CachyOS. Feature detection is the safe path.
- `color-mix()` in CSS: Supported in all modern browsers but WebKitGTK support on older distros unconfirmed. JS derivation is the safe path.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries verified on npm with current versions, active maintenance, proven in production
- Architecture: HIGH -- extends proven patterns already in the codebase (useSyncExternalStore, CSS custom properties, preferences-sync)
- Pitfalls: HIGH -- critical pitfalls verified against actual codebase code and documented in prior research
- View Transitions API: MEDIUM -- API is Baseline, but WebKitGTK version on target platform needs runtime verification
- Sunrise/sunset calculation: MEDIUM -- the timezone-offset approximation approach is rough (+/- 30 min) but meets the stated requirement of "no location API"
- Google Fonts integration: MEDIUM -- static font list bundling is straightforward, but the exact list size and update frequency need to be determined during implementation

**Research date:** 2026-03-19
**Valid until:** 2026-04-19 (stable domain -- CSS theming patterns change slowly)
