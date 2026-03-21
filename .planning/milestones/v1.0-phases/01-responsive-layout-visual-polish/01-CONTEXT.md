# Phase 1: Responsive Layout Shell + Visual Polish - Context

**Gathered:** 2026-03-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Make the app look and feel like one cohesive product across all window sizes and monitor configurations. Migrate all hardcoded colors to CSS variables, create shared feedback components (loading/error/empty states), establish a consistent spacing/button/typography scale, and implement container-query-based responsive layout with sidebar auto-collapse.

This phase does NOT include: theming UI, theme presets, dashboard grid, page presets, widget placement, font customization UI, or page duplication. Those are Phases 2-7.

</domain>

<decisions>
## Implementation Decisions

### Breakpoint Behavior
- Sidebar auto-collapses to icon-only strip when main content area drops below 900px
- Collapsed sidebar shows tooltips on hover (page name) — VS Code/Discord pattern
- Collapse/expand uses smooth slide animation (~200ms ease)
- On ultrawide monitors (1920px+), content stretches to fill the entire width — no max-width cap
- Use CSS container queries (not viewport media queries) for component-level responsiveness
- Three breakpoint tiers: compact (<900px content), default (900-1400px), wide (>1400px)

### Design Density & Aesthetic
- Apple Settings density as baseline — comfortable spacing, grouped sections with subtle dividers
- Power-user customizability like Discord (compact mode deferred to Phase 2 theming)
- Default font: Inter — but set up CSS variables (`--font-body`, `--font-heading`, `--font-mono`) so Phase 2 can expose font customization
- Icons: Migrate from Lucide to Phosphor Icons — supports filled, outline, duotone, and thin variants
- Border radius: Rounded (8-12px) — soft, modern, Apple/iOS feel
- Shadows: Subtle drop shadows on cards/panels for elevation — Notion-like
- Buttons: 4-level hierarchy — Primary (solid filled accent), Secondary (outlined border), Ghost (no border, transparent bg), Danger (red filled)
- Spacing scale: Establish a consistent 4px-based scale (4, 8, 12, 16, 24, 32, 48) applied as CSS variables

### Feedback Components
- **Loading**: Skeleton screens for initial page load + thin accent-colored progress bar (2-3px) at the very top for navigation (YouTube/NProgress style)
- Skeleton animation style: Claude's discretion (shimmer or pulse)
- **Error**: Toast for background errors (sync failures, API retries) + inline replacement with retry button for page-level failures
- Toast position: Configurable by user (default: top-right). User's preference is top-left (system notifications come top-right)
- Toast stacking: Replace (new toast replaces current one)
- **Empty state**: Shared `<EmptyState>` component with configurable icon, title, subtitle, and optional action button. Claude's discretion on visual style (icon + text, no illustrations).

### Sidebar Resize UX
- Keep current min/max width constraints as-is (approximately 150-160px to 400px)
- No double-click behavior on resize handle
- Resize handle: hover-only visibility (invisible until hovering near edge — VS Code pattern)
- Sidebar width persisted in localStorage (already implemented)

### Claude's Discretion
- Exact skeleton animation style (shimmer vs pulse)
- Empty state visual design (icon choice, text tone)
- Icon migration strategy (all-at-once or page-by-page)
- Exact progress bar implementation details
- Color variable naming scheme for migrated hardcoded colors
- Whether to use Tailwind utility classes or CSS variables for the spacing scale

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Layout & Styling
- `frontend/src/globals.css` — All CSS variables, keyframes, hover utilities, theme overrides
- `frontend/src/components/LayoutShell.tsx` — App shell: sidebar, title bar, main area, offline banner
- `frontend/src/components/Sidebar.tsx` — Sidebar with typewriter animation, quick capture, notifications
- `frontend/src/lib/sidebar-settings.ts` — Sidebar preferences (useSyncExternalStore)
- `frontend/src/lib/titlebar-settings.ts` — Title bar visibility/auto-hide
- `CLAUDE.md` §CSS & Styling — CSS variable rules, hover utilities, theme overrides

### Existing Patterns
- `frontend/src/lib/themes.ts` — Current theme definitions and CSS variable setters
- `frontend/src/components/PageErrorBoundary.tsx` — Existing error boundary pattern
- `frontend/src/components/SecondsAgo.tsx` — Example of shared utility component with React.memo

### Research
- `.planning/research/PITFALLS.md` — Pitfall #5: 100+ hardcoded colors resist theming (must audit before Phase 2)
- `.planning/research/ARCHITECTURE.md` — Container queries recommendation, responsive shell design
- `.planning/research/SUMMARY.md` — Phase ordering rationale (responsive shell first)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `PageErrorBoundary` — Already catches render errors with recovery UI; extend for inline error states
- `SecondsAgo` — Example of a shared utility component wrapped in `React.memo`
- `LayoutShell.tsx` — Already manages sidebar width state, offline detection, title bar auto-hide
- `globals.css` — Solid CSS variable foundation (~40 variables for colors, z-indices, easing)
- `sidebar-settings.ts` — `useSyncExternalStore` pattern for reactive cross-component state

### Established Patterns
- CSS variables in `globals.css` for all colors — but 20+ files still have hardcoded rgba/hex values
- `useSyncExternalStore` pattern for shared reactive state (keybindings, sidebar, titlebar)
- React Query for all data fetching with centralized keys in `query-keys.ts`
- Lazy-loaded pages with `React.lazy()` and Suspense in router

### Integration Points
- `LayoutShell.tsx` — Where responsive shell changes happen (sidebar collapse, container queries)
- `globals.css` — Where new CSS variables and spacing scale go
- Each of 17+ page components — Where loading/error/empty states need to be added
- `frontend/src/components/` — Where shared LoadingState/ErrorState/EmptyState components live

</code_context>

<specifics>
## Specific Ideas

- Apple Settings density + Discord power-user depth — comfortable by default, dense when needed
- Toast position should be configurable in Settings (user prefers top-left due to OS notifications in top-right)
- Phosphor Icons instead of Lucide — more variant options (filled, outline, duotone, thin)
- Inter as default font, but set up CSS variables for Phase 2 font customization
- "I want to be able to duplicate pages, copy styles over, widget-style Apple makeover" — deferred to Phase 4/7

</specifics>

<deferred>
## Deferred Ideas

- **Page presets** — Option to select a layout preset when creating a new page (blank canvas default for AI dev mode) — Phase 4/7
- **Page duplication** — Copy styles and layout from one page to another — Phase 4
- **Widget-style placement** — iOS-style drag/resize/replace widgets on pages — Phase 4
- **Font customization UI** — Let user pick main font, header font, mono font — Phase 2 (theming)
- **Compact density mode** — Discord-style tight spacing as a user toggle — Phase 2 (theming)
- **Blank canvas for Bjorn** — One of the empty state presets should be a blank canvas for AI agent to build on — Phase 7

</deferred>

---

*Phase: 01-responsive-layout-visual-polish*
*Context gathered: 2026-03-19*
