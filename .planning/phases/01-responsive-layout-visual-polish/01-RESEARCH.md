# Phase 1: Responsive Layout Shell + Visual Polish - Research

**Researched:** 2026-03-19
**Domain:** CSS layout, responsive design, icon migration, design system implementation
**Confidence:** HIGH

## Summary

This phase transforms an existing Tauri v2 + React 18 desktop app into a visually cohesive product with responsive layout behavior. The codebase already has a solid CSS variable foundation (~200+ variables in `globals.css`), skeleton loading screens, an error boundary, and sidebar resize infrastructure. The work divides into: (1) adding CSS container queries to `<main>` for component-level responsiveness, (2) implementing sidebar auto-collapse at the 900px container breakpoint, (3) migrating ~57 hex and ~81 rgba hardcoded color values across 30+ TSX files to CSS variables, (4) migrating 78 files from lucide-react to @phosphor-icons/react, (5) creating shared feedback components (Toast, ErrorState, EmptyState, ProgressBar), and (6) establishing consistent spacing/typography/button/radius/shadow scales.

The app currently uses Plus Jakarta Sans (loaded via Google Fonts CDN) and needs to switch to Inter. Fonts are loaded in `frontend/index.html` via a Google Fonts link. The sidebar already supports collapse to 64px with a manual toggle; the new requirement is auto-collapse driven by container queries. WebKitGTK 2.50.6 (installed on the user's CachyOS system) fully supports CSS container queries -- no polyfill needed.

**Primary recommendation:** Work in layers: (1) design system foundation (CSS variables for spacing, typography, fonts, shadows), (2) container query shell + sidebar auto-collapse, (3) shared feedback components, (4) icon migration page-by-page, (5) hardcoded color audit file-by-file. Each layer is independently testable and does not break existing functionality.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Sidebar auto-collapses to icon-only strip when main content area drops below 900px
- Collapsed sidebar shows tooltips on hover (page name) -- VS Code/Discord pattern
- Collapse/expand uses smooth slide animation (~200ms ease)
- On ultrawide monitors (1920px+), content stretches to fill the entire width -- no max-width cap
- Use CSS container queries (not viewport media queries) for component-level responsiveness
- Three breakpoint tiers: compact (<900px content), default (900-1400px), wide (>1400px)
- Apple Settings density as baseline -- comfortable spacing, grouped sections with subtle dividers
- Default font: Inter -- set up CSS variables (--font-body, --font-heading, --font-mono) for Phase 2 font customization
- Icons: Migrate from Lucide to Phosphor Icons -- supports filled, outline, duotone, and thin variants
- Border radius: Rounded (8-12px) -- soft, modern, Apple/iOS feel
- Shadows: Subtle drop shadows on cards/panels for elevation -- Notion-like
- Buttons: 4-level hierarchy -- Primary (solid filled accent), Secondary (outlined border), Ghost (no border, transparent bg), Danger (red filled)
- Spacing scale: 4px-based scale (4, 8, 12, 16, 24, 32, 48) as CSS variables
- Loading: Skeleton screens for initial page load + thin accent-colored progress bar (2-3px) at top for navigation
- Error: Toast for background errors + inline replacement with retry button for page-level failures
- Toast position: Configurable by user (default: top-left). Stacking: Replace (new replaces current)
- Empty state: Shared EmptyState with configurable icon, title, subtitle, optional action button
- Keep current sidebar min/max width constraints (150-160px to 400px)
- No double-click behavior on resize handle
- Resize handle: hover-only visibility (invisible until hovering near edge)

### Claude's Discretion
- Exact skeleton animation style (shimmer vs pulse) -- RESOLVED: shimmer (already implemented in Skeleton.tsx)
- Empty state visual design (icon choice, text tone) -- follow UI-SPEC copywriting contract
- Icon migration strategy (all-at-once or page-by-page) -- RECOMMEND: page-by-page (78 files is too many for a single diff)
- Exact progress bar implementation details -- build custom, no NProgress dependency needed
- Color variable naming scheme -- follow UI-SPEC: --{semantic}-{modifier} pattern
- Whether to use Tailwind utility classes or CSS variables for spacing scale -- RECOMMEND: CSS variables (project does not use Tailwind; globals.css already has --space-1 through --space-8)

### Deferred Ideas (OUT OF SCOPE)
- Page presets -- Phase 4/7
- Page duplication -- Phase 4
- Widget-style placement -- Phase 4
- Font customization UI -- Phase 2
- Compact density mode -- Phase 2
- Blank canvas for Bjorn -- Phase 7
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| LAYOUT-01 | App layout adapts to window resize without breaking | Container queries on `<main>`, grid reflow rules, sidebar auto-collapse |
| LAYOUT-02 | Sidebar auto-collapses to icon-only mode when main area < 900px | Container query trigger + existing collapse mechanism at width 64px |
| LAYOUT-03 | Dashboard grid reflows to fewer columns at smaller container widths | Container query tiers: 1-col (<900px), 2-col (900-1400px), 3-col (>1400px) |
| LAYOUT-04 | Switching between 1080p and 1440p monitors preserves usable layout | Container queries are viewport-independent; test at both resolutions |
| LAYOUT-05 | All pages use CSS container queries for component-level responsiveness | Apply `container-type: inline-size` to `<main>`, write `@container` rules |
| LAYOUT-06 | Sidebar resize handle works smoothly without layout jank | Already functional; add hover-only visibility per UI-SPEC |
| POLISH-01 | All hardcoded color values migrated to CSS variables | 57 hex + 81 rgba across 30+ files; map to existing CSS vars |
| POLISH-02 | Consistent spacing scale across all 17+ pages | New --space-12 (48px) and --space-16 (64px) vars + apply scale systematically |
| POLISH-03 | Unified button hierarchy (primary, secondary, ghost, danger) | Create reusable Button component or CSS classes matching UI-SPEC |
| POLISH-04 | Consistent typography scale | Switch to Inter, add --font-body/--font-heading/--font-mono, apply 4 type roles |
| POLISH-05 | Shared LoadingState component on all async pages/widgets | Skeleton screens already exist; verify all pages use them as Suspense fallbacks |
| POLISH-06 | Shared ErrorState component with retry action | New `<ErrorState>` based on existing PageErrorBoundary visual pattern |
| POLISH-07 | Shared EmptyState component with contextual guidance | New `<EmptyState>` component per UI-SPEC interface |
| POLISH-08 | Consistent icon style across all modules | Migrate 78 lucide-react imports to @phosphor-icons/react |
| POLISH-09 | Consistent border-radius and shadow depth | Border radius scale already in globals.css; add shadow CSS variables |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 18 | UI framework | Already in use, project standard |
| CSS Variables | N/A | Design tokens | Already established pattern in globals.css |
| CSS Container Queries | N/A | Component-level responsive layout | WebKitGTK 2.50.6 fully supports; no polyfill needed |
| @phosphor-icons/react | latest | Icon library | CONTEXT decision; replaces lucide-react; supports filled/outline/duotone/thin weights |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Inter (Google Fonts) | Variable | Body + heading font | CONTEXT decision; replaces Plus Jakarta Sans |
| JetBrains Mono (Google Fonts) | Variable | Monospace font | Already loaded, already used in .mono class |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| CSS container queries | Viewport media queries | Container queries are component-relative, enabling sidebar-aware layouts |
| Custom progress bar | nprogress / @tanem/react-nprogress | Custom is simpler (< 40 lines), avoids dependency for a 2px bar |
| Custom toast system | react-hot-toast / sonner | Custom needed for replace-mode stacking + configurable position; external libs default to stack mode |

**Installation:**
```bash
cd frontend && npm install @phosphor-icons/react
```

**Font change (index.html):**
```html
<!-- Replace Plus Jakarta Sans with Inter -->
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@300;400;500;600&display=swap" rel="stylesheet" />
```

---

## Architecture Patterns

### Recommended Project Structure

New and modified files for this phase:

```
frontend/src/
├── components/
│   ├── ui/                    # NEW: shared design system components
│   │   ├── Button.tsx         # 4-level button hierarchy
│   │   ├── EmptyState.tsx     # Shared empty state
│   │   ├── ErrorState.tsx     # Shared inline error state
│   │   ├── Toast.tsx          # Toast notification + provider
│   │   └── ProgressBar.tsx    # Thin navigation progress bar
│   ├── LayoutShell.tsx        # MODIFIED: container query context, auto-collapse, progress bar
│   ├── Sidebar.tsx            # MODIFIED: tooltip on collapsed icons, hover-only resize handle
│   ├── Skeleton.tsx           # UNCHANGED (already complete)
│   └── PageErrorBoundary.tsx  # UNCHANGED (ErrorState is a NEW sibling, not a replacement)
├── globals.css                # MODIFIED: font stack, spacing vars, shadow vars, container queries
├── lib/
│   └── sidebar-settings.ts   # MODIFIED: add auto-collapse state management
└── pages/                     # MODIFIED: each page gets color migration + feedback states
```

### Pattern 1: Container Query Responsive Layout

**What:** CSS container queries on `<main>` element drive layout changes based on content area width, not viewport width.

**When to use:** All responsive behavior in this app. The sidebar consumes variable width, so only the `<main>` element's width determines content layout.

**Example:**
```css
/* In globals.css */
main[data-container="main-content"] {
  container-type: inline-size;
  container-name: main-content;
}

/* Compact tier */
@container main-content (max-width: 899px) {
  .responsive-grid { grid-template-columns: 1fr; }
}

/* Default tier */
@container main-content (min-width: 900px) and (max-width: 1399px) {
  .responsive-grid { grid-template-columns: repeat(2, 1fr); }
}

/* Wide tier */
@container main-content (min-width: 1400px) {
  .responsive-grid { grid-template-columns: repeat(3, 1fr); }
}
```

**Integration with LayoutShell.tsx:**
```typescript
// Add container-type to the <main> element
<main
  id="main-content"
  data-container="main-content"
  style={{
    flex: 1,
    overflow: 'hidden',
    containerType: 'inline-size',
    containerName: 'main-content',
    // ... existing styles
  }}
>
```

### Pattern 2: Sidebar Auto-Collapse via Container Query Observer

**What:** Auto-collapse the sidebar when the main content area drops below 900px. This must be JavaScript-driven because the sidebar width change is a React state update, not a pure CSS change.

**When to use:** When window resize causes main content area to shrink below 900px.

**Implementation approach:**
```typescript
// In LayoutShell.tsx, use ResizeObserver on <main> to detect width
const mainRef = useRef<HTMLElement>(null)

useEffect(() => {
  if (!mainRef.current) return
  const observer = new ResizeObserver(entries => {
    const width = entries[0].contentRect.width
    if (width < 900 && sidebarWidth > 64) {
      // Auto-collapse
      setSidebarWidth(64)
    }
  })
  observer.observe(mainRef.current)
  return () => observer.disconnect()
}, []) // Only set up once
```

**Why ResizeObserver instead of pure CSS:** The sidebar collapse requires changing React state (`sidebarWidth`), which drives the sidebar component's width prop. Pure CSS container queries cannot trigger React state changes. The ResizeObserver fires when the `<main>` element resizes, which happens when the window is resized.

**Important subtlety:** The auto-collapse should NOT auto-expand. If the user manually collapsed the sidebar, resizing the window larger should NOT auto-expand it. Track an `autoCollapsed` flag to distinguish manual vs automatic collapse.

### Pattern 3: Page-by-Page Icon Migration

**What:** Replace lucide-react imports with @phosphor-icons/react one file at a time.

**When to use:** During the icon migration task (POLISH-08).

**Example:**
```typescript
// Before (lucide-react)
import { ChevronRight, Settings, Plus } from 'lucide-react'
<ChevronRight size={14} />

// After (@phosphor-icons/react)
import { CaretRight, Gear, Plus } from '@phosphor-icons/react'
<CaretRight size={14} weight="regular" />
```

**Icon name mapping (partial -- most common):**
| Lucide | Phosphor | Notes |
|--------|----------|-------|
| ChevronRight/Down/Up | CaretRight/Down/Up | Same concept, different name |
| Settings | Gear | |
| Plus | Plus | Same name |
| Search | MagnifyingGlass | |
| X | X | Same name |
| Trash2 | Trash | |
| Check | Check | Same name |
| Home | House | |
| MessageCircle | ChatCircle | |
| Bell | Bell | Same name |
| FileText | FileText | Same name |
| Mail | Envelope | |
| AlertTriangle | Warning | |
| Copy | Copy | Same name |
| Play/Pause | Play/Pause | Same names |

**Weight mapping (per UI-SPEC):**
- `regular` (default) for most icons
- `bold` for active/selected states
- `fill` for filled indicators
- Size: 20px sidebar/nav, 16px inline, 24px page headers

### Pattern 4: Toast System with Replace Stacking

**What:** Custom toast notification system that replaces the current toast instead of stacking.

**When to use:** For all background error/success/info notifications.

**Implementation:**
```typescript
// Toast context + provider wrapping the app
const ToastContext = createContext<ToastAPI>(null!)

interface Toast {
  id: string
  type: 'success' | 'error' | 'warning' | 'info'
  message: string
  action?: { label: string; onClick: () => void }
  persistent?: boolean
}

// Only one toast visible at a time (replace mode)
// 5-second auto-dismiss unless persistent
// Position from localStorage (default: top-left)
```

### Anti-Patterns to Avoid

- **Mixing viewport and container queries:** Do NOT use `@media` for layout responsiveness. Use `@container` exclusively. Reserve `@media` only for `prefers-reduced-motion` and `prefers-color-scheme`.
- **Hardcoding colors in new code:** Every color must reference a CSS variable. Zero exceptions.
- **Importing lucide-react in new code:** All new code uses @phosphor-icons/react exclusively.
- **Using `window.dispatchEvent` for toast notifications:** Use the React context pattern from Pattern 4.
- **Using NProgress or external progress bar libraries:** Build the progress bar as a small custom component (< 40 lines).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Icon library | Custom SVG icons | @phosphor-icons/react | 6000+ icons with multiple weights, tree-shakeable |
| Font loading | @font-face for Inter | Google Fonts CDN link | Already the pattern (Plus Jakarta Sans loaded this way) |
| Skeleton animation | Custom CSS animation | Existing `Skeleton.tsx` with shimmer keyframe | Already built, tested, and used across 5+ page skeletons |
| Container query polyfill | Polyfill for older WebKitGTK | Native CSS | WebKitGTK 2.50.6 on user's system fully supports container queries |
| Button component library | Radix/Base UI | Custom `<Button>` with CSS classes | Only 4 variants needed; external library is overkill and adds dependency |

**Key insight:** The existing codebase already has most of the infrastructure (CSS variables, skeleton system, error boundary, sidebar collapse toggle). This phase is about systematizing and completing what exists, not building from scratch.

---

## Common Pitfalls

### Pitfall 1: Container Query + Sidebar Auto-Collapse Feedback Loop

**What goes wrong:** Setting sidebar width to 64px changes `<main>` width, which triggers the ResizeObserver, which might try to collapse again or interfere with manual expand.
**Why it happens:** The ResizeObserver fires every time `<main>` resizes, including when the sidebar collapses (expanding `<main>`).
**How to avoid:** (1) Only auto-collapse, never auto-expand from the observer. (2) Track whether collapse was manual or automatic. (3) Debounce the ResizeObserver callback by ~100ms. (4) Use a ref flag to skip the observer callback when the sidebar is already at 64px.
**Warning signs:** Sidebar flickering, infinite resize loops, sidebar not staying collapsed.

### Pitfall 2: Lucide-to-Phosphor Icon Name Mismatches

**What goes wrong:** Lucide and Phosphor use different names for the same concept. Direct find-replace breaks.
**Why it happens:** Icon libraries have different naming conventions (e.g., Lucide `Trash2` vs Phosphor `Trash`; Lucide `ChevronDown` vs Phosphor `CaretDown`).
**How to avoid:** Create a mapping table before starting migration. Test each file after migration -- icons that don't exist in Phosphor will cause import errors at compile time.
**Warning signs:** TypeScript import errors, missing icons at runtime.

### Pitfall 3: Hardcoded Colors That Look Like CSS Variable Values

**What goes wrong:** Some hardcoded colors like `#ff5f57` (traffic light red) are intentionally hardcoded because they represent platform-specific constants, not theme tokens.
**Why it happens:** Not all inline colors should become CSS variables. Traffic light buttons, selection highlight colors, and platform-specific values are exempt.
**How to avoid:** During the color audit, categorize each hardcoded color as: (a) should become CSS variable, (b) intentionally hardcoded (document why), or (c) already matches an existing variable.
**Warning signs:** Traffic light buttons changing color with theme, skeleton gradient backgrounds breaking.

### Pitfall 4: Font Weight Differences Between Plus Jakarta Sans and Inter

**What goes wrong:** Text looks different after font switch because Inter's weight 600 appears different from Plus Jakarta Sans weight 600 at the same size.
**Why it happens:** Different typefaces have different x-heights, stroke widths, and weight curves.
**How to avoid:** The UI-SPEC specifies only weights 400 and 600. After switching to Inter, do a visual review of heading/body text across 3-4 representative pages. Adjust font sizes in the typography scale if needed -- the UI-SPEC sizes (12, 15, 20, 24px) were designed for Inter.
**Warning signs:** Text looking too thin or too heavy after font switch.

### Pitfall 5: Breaking Full-Bleed Pages with Container Queries

**What goes wrong:** Messages and Settings use `position: absolute; inset: 0` to fill the entire main area. Adding `container-type: inline-size` to `<main>` or an intermediate wrapper can break this absolute positioning.
**Why it happens:** `container-type: inline-size` establishes a new containing block for absolutely positioned descendants. This is similar to how `position: relative` creates a containing block.
**How to avoid:** Apply `container-type: inline-size` to the `<main>` element itself (which already has `position: relative`). Full-bleed pages that use `position: absolute; inset: 0` should continue to work because their positioning context was already `<main>`. Test Messages and Settings pages explicitly after adding container query context.
**Warning signs:** Messages or Settings page not filling the area, scrollbars appearing, layout shifting.

### Pitfall 6: Phosphor Icons Bundle Size with Naive Imports

**What goes wrong:** Importing from the main `@phosphor-icons/react` barrel export can cause bundlers to eagerly resolve all 9000+ icon modules during development, slowing HMR.
**Why it happens:** Vite in development mode doesn't fully tree-shake barrel exports.
**How to avoid:** For development performance, consider importing from specific paths: `import { Gear } from '@phosphor-icons/react/dist/ssr/Gear'`. However, production builds with Vite tree-shake correctly from barrel imports. Start with barrel imports; switch to path imports only if dev server HMR becomes noticeably slow.
**Warning signs:** Dev server slow to start, HMR taking > 2 seconds after icon migration.

### Pitfall 7: Toast Position Configuration Without Storage Migration

**What goes wrong:** Toast position is stored in localStorage but there's no migration for existing users who don't have the key.
**Why it happens:** New localStorage key without a default value in the migration system.
**How to avoid:** Use a sensible default (`top-left` per user preference) in the toast provider. Read from localStorage but fall back to default. Add the key to the existing `lib/migrations.ts` system.
**Warning signs:** Toast appearing in wrong position on first load, undefined position causing layout issues.

---

## Code Examples

### Container Query Setup in LayoutShell

```typescript
// LayoutShell.tsx -- add container-type to <main>
<main
  ref={mainRef}
  id="main-content"
  data-testid="main-content"
  style={{
    flex: 1,
    overflow: 'hidden',
    background: 'transparent',
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
    containerType: 'inline-size',
    containerName: 'main-content',
  }}
>
```

### Sidebar Auto-Collapse with ResizeObserver

```typescript
// In LayoutShell.tsx
const mainRef = useRef<HTMLElement>(null)
const autoCollapsedRef = useRef(false)
const prevSidebarWidthRef = useRef(sidebarWidth)

useEffect(() => {
  const el = mainRef.current
  if (!el) return

  const observer = new ResizeObserver((entries) => {
    const mainWidth = entries[0].contentRect.width
    if (mainWidth < 900 && sidebarWidth > 64) {
      prevSidebarWidthRef.current = sidebarWidth
      autoCollapsedRef.current = true
      setSidebarWidth(64)
    }
    // Note: do NOT auto-expand -- user controls expansion
  })

  observer.observe(el)
  return () => observer.disconnect()
}, [sidebarWidth, setSidebarWidth])
```

### EmptyState Component

```typescript
// components/ui/EmptyState.tsx
import React from 'react'

interface EmptyStateProps {
  icon: React.ElementType
  title: string
  description?: string
  action?: {
    label: string
    onClick: () => void
  }
}

export const EmptyState = React.memo(function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div
      role="status"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-12) var(--space-6)',
        textAlign: 'center',
      }}
    >
      <Icon size={48} weight="regular" style={{ color: 'var(--text-muted)', marginBottom: 'var(--space-4)' }} />
      <h3 style={{ fontSize: 'var(--text-xl)', fontWeight: 600, lineHeight: 1.2, margin: '0 0 var(--space-2)' }}>
        {title}
      </h3>
      {description && (
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', margin: 0, maxWidth: '360px', lineHeight: 1.5 }}>
          {description}
        </p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          style={{
            marginTop: 'var(--space-6)',
            padding: 'var(--space-2) var(--space-4)',
            background: 'var(--accent)',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            color: 'var(--text-on-color)',
            fontSize: 'var(--text-base)',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {action.label}
        </button>
      )}
    </div>
  )
})
```

### Navigation Progress Bar

```typescript
// components/ui/ProgressBar.tsx
import { useEffect, useState } from 'react'
import { useNavigation } from 'react-router-dom'

export function NavigationProgressBar() {
  const navigation = useNavigation()
  const [progress, setProgress] = useState(0)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (navigation.state === 'loading') {
      setVisible(true)
      setProgress(30)
      const timer = setTimeout(() => setProgress(60), 200)
      const timer2 = setTimeout(() => setProgress(80), 600)
      return () => { clearTimeout(timer); clearTimeout(timer2) }
    } else {
      if (visible) {
        setProgress(100)
        const timer = setTimeout(() => { setVisible(false); setProgress(0) }, 300)
        return () => clearTimeout(timer)
      }
    }
  }, [navigation.state])

  if (!visible) return null

  return (
    <div
      role="progressbar"
      aria-valuenow={progress}
      aria-label="Loading page"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: '2px',
        zIndex: 'var(--z-max)',
        pointerEvents: 'none',
      }}
    >
      <div style={{
        height: '100%',
        width: `${progress}%`,
        background: 'var(--accent)',
        transition: progress < 100
          ? 'width 0.6s cubic-bezier(0.4, 0, 0.2, 1)'
          : 'width 0.15s ease, opacity 0.3s ease',
        opacity: progress === 100 ? 0 : 1,
      }} />
    </div>
  )
}
```

**Note on React Router:** The app uses `<Route>` components with `<Outlet>` (not `createBrowserRouter`), so `useNavigation()` may not work directly. An alternative is to use `useLocation()` to detect route changes:

```typescript
// Alternative: location-based progress bar
import { useLocation } from 'react-router-dom'

export function NavigationProgressBar() {
  const location = useLocation()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    setVisible(true)
    const timer = setTimeout(() => setVisible(false), 400)
    return () => clearTimeout(timer)
  }, [location.pathname])

  // ... render thin bar
}
```

### Shadow CSS Variables

```css
/* Add to globals.css */
--shadow-none: none;
--shadow-low: 0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06);
--shadow-medium: 0 4px 12px rgba(0,0,0,0.1), 0 1px 4px rgba(0,0,0,0.06);
--shadow-high: 0 8px 24px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08);
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Viewport media queries | CSS container queries | Chrome 105 (Sep 2022) | Component-level responsiveness independent of viewport |
| `@media (min-width)` | `@container (min-width)` | Safari 16 / WebKitGTK 2.38+ | Works in Tauri on all platforms |
| lucide-react | @phosphor-icons/react | User decision | More weight variants (fill, duotone, thin, bold) |
| Plus Jakarta Sans | Inter | User decision | Better readability at small sizes, wider language support |
| Manual sidebar collapse | Auto-collapse via ResizeObserver | This phase | Responsive sidebar without user intervention |

**Deprecated/outdated:**
- Plus Jakarta Sans: Replaced by Inter per CONTEXT decision
- lucide-react: Replaced by @phosphor-icons/react per CONTEXT decision
- Hardcoded rgba/hex colors: All must migrate to CSS variables (POLISH-01)

---

## Open Questions

1. **Progress bar trigger mechanism**
   - What we know: The app uses React Router v6 with `<BrowserRouter>`, `<Routes>`, and `<Route>` elements. The `useNavigation()` hook only works with the data router API (`createBrowserRouter`).
   - What's unclear: Whether the app's router supports `useNavigation()` for detecting navigation state.
   - Recommendation: Use `useLocation()` to detect route changes and trigger the progress bar. This is simpler and works with the current router setup. The bar shows briefly on every route change.

2. **Sidebar auto-collapse persistence**
   - What we know: Sidebar width is persisted in localStorage. Auto-collapse should not persist -- it's a responsive behavior.
   - What's unclear: Should the sidebar restore to its previous width when the window is enlarged again?
   - Recommendation: Track `prevSidebarWidthRef` so that when the user manually expands after auto-collapse, it returns to their last manually-set width.

3. **Existing badge classes in globals.css**
   - What we know: `.badge-green`, `.badge-blue`, etc. use hardcoded rgba values that should technically become CSS variables.
   - What's unclear: Whether to migrate these globals.css badge classes in POLISH-01 scope (they're in CSS, not JSX/TS).
   - Recommendation: Include globals.css badge classes in the color audit. The UI-SPEC target is "zero remaining inline color literals in JSX/TS files" but cleaning globals.css badges is a low-effort bonus.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 2.x with jsdom |
| Config file | `frontend/vitest.config.ts` |
| Quick run command | `cd frontend && npx vitest run --reporter=verbose` |
| Full suite command | `cd frontend && npx vitest run` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LAYOUT-01 | Layout adapts to resize | manual | Visual inspection at 900px, 1200px, 1800px | N/A |
| LAYOUT-02 | Sidebar auto-collapses at <900px | unit | `cd frontend && npx vitest run src/components/__tests__/LayoutShell.test.tsx -x` | Wave 0 |
| LAYOUT-03 | Dashboard grid reflows | unit | `cd frontend && npx vitest run src/pages/dashboard/__tests__/grid-reflow.test.tsx -x` | Wave 0 |
| LAYOUT-04 | 1080p/1440p layout | manual | Visual inspection | N/A |
| LAYOUT-05 | Container queries on all pages | unit | `cd frontend && npx vitest run src/components/__tests__/LayoutShell.test.tsx -x` | Wave 0 |
| LAYOUT-06 | Resize handle smooth | manual | Visual inspection | N/A |
| POLISH-01 | No hardcoded colors | smoke | `grep -rn '#[0-9a-fA-F]\{3,8\}\|rgba(' frontend/src --include='*.tsx' --include='*.ts' \| grep -v node_modules \| grep -v __tests__ \| grep -v globals.css \| grep -v themes.ts \| wc -l` | Script-based |
| POLISH-02 | Spacing scale applied | manual | Visual review + grep for inline pixel values | N/A |
| POLISH-03 | Button hierarchy | unit | `cd frontend && npx vitest run src/components/ui/__tests__/Button.test.tsx -x` | Wave 0 |
| POLISH-04 | Typography scale | smoke | Verify Inter font load + CSS variable application | Manual |
| POLISH-05 | LoadingState on all pages | unit | `cd frontend && npx vitest run src/components/__tests__/Skeleton.test.tsx -x` | Exists |
| POLISH-06 | ErrorState with retry | unit | `cd frontend && npx vitest run src/components/ui/__tests__/ErrorState.test.tsx -x` | Wave 0 |
| POLISH-07 | EmptyState component | unit | `cd frontend && npx vitest run src/components/ui/__tests__/EmptyState.test.tsx -x` | Wave 0 |
| POLISH-08 | No lucide-react imports | smoke | `grep -rn "from 'lucide-react'" frontend/src \| wc -l` (should be 0) | Script-based |
| POLISH-09 | Consistent radius/shadow | manual | Visual review | N/A |

### Sampling Rate
- **Per task commit:** `cd frontend && npx vitest run --reporter=verbose`
- **Per wave merge:** `cd frontend && npx vitest run`
- **Phase gate:** Full suite green + POLISH-01 and POLISH-08 smoke scripts return 0

### Wave 0 Gaps
- [ ] `frontend/src/components/ui/__tests__/EmptyState.test.tsx` -- covers POLISH-07
- [ ] `frontend/src/components/ui/__tests__/ErrorState.test.tsx` -- covers POLISH-06
- [ ] `frontend/src/components/ui/__tests__/Button.test.tsx` -- covers POLISH-03
- [ ] `frontend/src/components/ui/__tests__/Toast.test.tsx` -- covers toast system
- [ ] `frontend/src/components/ui/__tests__/ProgressBar.test.tsx` -- covers progress bar
- [ ] `frontend/src/components/__tests__/LayoutShell.test.tsx` -- covers LAYOUT-02, LAYOUT-05 (container query setup, auto-collapse logic)

---

## Existing Codebase Findings

### Current State Summary

| Aspect | Current State | Action Needed |
|--------|---------------|---------------|
| CSS variables | ~200+ variables in globals.css | Add --space-12, --space-16, --shadow-*, --font-body/heading/mono |
| Spacing scale | --space-1 through --space-8 exist | Add --space-12 (48px) and --space-16 (64px) |
| Typography scale | --text-2xs through --text-3xl exist | Update sizes to match UI-SPEC 4 active roles |
| Border radius | --radius-sm through --radius-full exist | Already correct per UI-SPEC |
| Shadows | Not in CSS variables | Add --shadow-none/low/medium/high |
| Font | Plus Jakarta Sans (Google Fonts CDN) | Switch to Inter in index.html + globals.css |
| Icons | lucide-react (78 files) | Migrate to @phosphor-icons/react |
| Hardcoded colors | 57 hex + 81 rgba across 30+ files | Map to existing CSS variables |
| Skeleton screens | Complete (7 variants, tested) | No changes needed |
| Error boundary | PageErrorBoundary.tsx (tested) | Keep as-is; add new ErrorState for data fetches |
| Sidebar collapse | Manual toggle to 64px works | Add auto-collapse via ResizeObserver |
| Container queries | Not used anywhere | Add to `<main>` element |
| Sidebar resize | Functional (64-320px, snap at 100px) | Add hover-only visibility to handle |
| Toast system | Not implemented | Build new Toast + ToastProvider |
| Lazy loading | All 25 routes use Suspense + skeletons | Already complete for POLISH-05 |

### Files with Most Hardcoded Colors (from codebase scan)

These files have the highest concentration of inline color values and should be prioritized in the color audit:
- `components/Sidebar.tsx` -- traffic light colors (intentionally hardcoded), editing states
- `components/LayoutShell.tsx` -- title bar background, offline banner
- `components/NotificationCenter.tsx` -- notification type colors
- `pages/messages/MessageThread.tsx` -- message bubble colors
- `pages/messages/ConversationList.tsx` -- unread indicators
- `pages/dashboard/*.tsx` -- status colors, chart colors
- `pages/pipeline/*.tsx` -- status badge colors
- `pages/missions/*.tsx` -- event type colors

### Sidebar Collapse Mechanics (Existing)

Current sidebar behavior (from `Sidebar.tsx` lines 1010-1049):
- Min width: 64px (collapsed), Max width: 320px (code says 320, CONTEXT says 400)
- Snap behavior: below 100px snaps to 64 (collapsed) or 100
- `collapsed` derived: `width <= 64`
- `textOpacity` calculated: `Math.min(1, Math.max(0, (width - 80) / 80))`
- Collapse toggle button at bottom of sidebar
- Width persisted via `useLocalStorageState('sidebar-width', 260)`

**Note:** The CONTEXT says min 150-160px and max 400px, but the code enforces 64-320px. The CONTEXT also says "keep current min/max width constraints as-is" so use the code values (64-320px).

### Router Pattern

The app uses React Router v6 with `<BrowserRouter>` wrapping `<Routes>` and `<Route>` elements (traditional, not data router). This means `useNavigation()` is NOT available. The progress bar should use `useLocation()` to detect route changes.

---

## Sources

### Primary (HIGH confidence)
- `frontend/src/globals.css` -- Full CSS variable system, keyframes, utility classes
- `frontend/src/components/LayoutShell.tsx` -- Current layout shell implementation
- `frontend/src/components/Sidebar.tsx` -- Current sidebar with collapse, resize, drag-reorder
- `frontend/src/components/Skeleton.tsx` -- Existing skeleton screen system
- `frontend/src/components/PageErrorBoundary.tsx` -- Existing error boundary
- `frontend/src/lib/sidebar-settings.ts` -- Sidebar settings store
- `frontend/src/lib/themes.ts` -- Accent color system
- `frontend/src/main.tsx` -- Router setup with all 25 lazy-loaded routes
- `frontend/index.html` -- Font loading (Google Fonts CDN)
- `frontend/vitest.config.ts` -- Test configuration
- WebKitGTK 2.50.6 installed on user system (container queries supported since 2.38)

### Secondary (MEDIUM confidence)
- [Can I Use - Container Queries](https://caniuse.com/css-container-queries) -- 95%+ global support, Safari 16+ / WebKitGTK 2.38+
- [Phosphor Icons React - npm](https://www.npmjs.com/package/@phosphor-icons/react) -- Tree-shakeable, 6000+ icons, multiple weights
- [MDN - CSS Container Queries](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Containment/Container_queries) -- Canonical documentation

### Tertiary (LOW confidence)
- None -- all findings verified against codebase and official documentation

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries verified, existing codebase patterns well understood
- Architecture: HIGH -- container queries verified on target platform, sidebar collapse mechanics understood from source code
- Pitfalls: HIGH -- identified from actual codebase inspection (hardcoded colors counted, full-bleed pages identified, router pattern confirmed)

**Research date:** 2026-03-19
**Valid until:** 2026-04-19 (stable domain -- CSS/React patterns don't change fast)
