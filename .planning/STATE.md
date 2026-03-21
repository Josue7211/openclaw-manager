---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: complete
stopped_at: Completed 08-02-PLAN.md
last_updated: "2026-03-21T06:48:53.000Z"
progress:
  total_phases: 11
  completed_phases: 11
  total_plans: 52
  completed_plans: 52
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-19)

**Core value:** AI agent (Bjorn) builds, previews, and hot-reloads custom modules inside the running app -- making it infinitely extensible without writing code.
**Current focus:** Phase 08 — data-export (COMPLETE)

## Current Position

Phase: 08 (data-export) — COMPLETE
Plan: 2 of 2 (all complete)

## Performance Metrics

**Velocity:**

- Total plans completed: 0
- Average duration: -
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**

- Last 5 plans: -
- Trend: -

*Updated after each plan completion*
| Phase 01 P01 | 4min | 2 tasks | 4 files |
| Phase 01 P02 | 7min | 2 tasks | 14 files |
| Phase 01 P03 | 17min | 2 tasks | 147 files |
| Phase 01 P04 | 7min | 2 tasks | 19 files |
| Phase 01 P05 | 10min | 2 tasks | 19 files |
| Phase 02 P01 | 8min | 2 tasks | 9 files |
| Phase 02 P03 | 3min | 1 tasks | 2 files |
| Phase 02 P02 | 7min | 2 tasks | 5 files |
| Phase 02 P06 | 5min | 2 tasks | 5 files |
| Phase 02 P04 | 7min | 2 tasks | 6 files |
| Phase 02 P05 | 6min | 2 tasks | 6 files |
| Phase 02 P07 | 6min | 3 tasks | 4 files |
| Phase 02.1 P01 | 4min | 2 tasks | 3 files |
| Phase 02.1 P02 | 14min | 2 tasks | 10 files |
| Phase 02.1 P03 | -min | - tasks | 54 files |
| Phase 02.1 P04 | 6min | 2 tasks | 7 files |
| Phase 02.1 P03 | 8min | 2 tasks | 57 files |
| Phase 02.2 P01 | 7min | 3 tasks | 7 files |
| Phase 02.2 P02 | 6 | 2 tasks | 7 files |
| Phase 03 P01 | 4min | 2 tasks | 6 files |
| Phase 03 P02 | 7 | 2 tasks | 6 files |
| Phase 03 P07 | 10 | 3 tasks | 6 files |
| Phase 03 P04 | 5 | 2 tasks | 7 files |
| Phase 03 P03 | 6 | 3 tasks | 8 files |
| Phase 03 P06 | 6 | 2 tasks | 7 files |
| Phase 03 P05 | 7 | 3 tasks | 6 files |
| Phase 04 P01 | 6min | 2 tasks | 9 files |
| Phase 04 P03 | 5 | 2 tasks | 5 files |
| Phase 04 P02 | 6 | 2 tasks | 5 files |
| Phase 04 P05 | 26min | 1 tasks | 3 files |
| Phase 04 P04 | 3min | 2 tasks | 6 files |
| Phase 04 P06 | 5min | 2 tasks | 3 files |
| Phase 04.1 P01 | 5min | 2 tasks | 3 files |
| Phase 04.1 P02 | 4min | 2 tasks | 3 files |
| Phase 05 P01 | 4 | 2 tasks | 4 files |
| Phase 05 P02 | 4 | 2 tasks | 4 files |
| Phase 05 P03 | 5 | 2 tasks | 5 files |
| Phase 06 P01 | 4 | 2 tasks | 9 files |
| Phase 06 P02 | 9 | 2 tasks | 7 files |
| Phase 06 P04 | 14 | 2 tasks | 5 files |
| Phase 06 P03 | 15 | 2 tasks | 5 files |
| Phase 07 P03 | 2 | 1 tasks | 2 files |
| Phase 07 P04 | 2 | 1 tasks | 3 files |
| Phase 07 P05 | 4min | 2 tasks | 5 files |
| Phase 07 P06 | 4min | 2 tasks | 3 files |
| Phase 07 P07 | 3 | 2 tasks | 1 files |
| Phase 08 P01 | 3 | 2 tasks | 2 files |
| Phase 08 P02 | 3 | 2 tasks | 2 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: 8 phases derived from requirements, matching fine granularity config
- [Roadmap]: Notes overhaul deferred to v2 per research recommendation
- [Roadmap]: Color audit (POLISH-01) is a hard prerequisite for Phase 2 (theming)
- [Roadmap]: Phase 3 (wizard) builds on archived v0.1.0 wizard work at `.planning-v0.1.0-wizard/`
- [Phase 01]: Sidebar collapse 0.2s (was 0.35s) for snappier UX per UI-SPEC
- [Phase 01]: Auto-collapse only, no auto-expand -- prevents surprise layout shifts
- [Phase 01]: CSS-only tooltips via :hover instead of JS state for zero re-renders
- [Phase 01]: Removed lucide-react entirely -- zero references, dependency dropped from package.json
- [Phase 01]: Avatar color palette kept hardcoded -- data colors not theme tokens
- [Phase 01]: Added 30+ CSS variable alpha-tint tiers for theming readiness
- [Phase 01]: Resize handle 8px hit area (was 5px) for easier targeting while invisible by default
- [Phase 01]: useLocation() for ProgressBar (not useNavigation()) since app uses BrowserRouter
- [Phase 01]: Toast uses replace mode (max 1 visible) with 5s auto-dismiss, position from localStorage
- [Phase 01]: components/ui/ directory established for shared design system components
- [Phase 01]: Compact EmptyState pattern: wrap in div with padding 8px-16px for card-sized containers
- [Phase 01]: AccordionBody "No replay" left as specialized status message, not generic EmptyState
- [Phase 01]: Pipeline filter/tab buttons kept custom -- toggle UI, not 4-variant Button hierarchy
- [Phase 01]: BlueBubbles not_configured kept as custom guidance display, not generic ErrorState
- [Phase 01]: Button fontSize/padding via style prop to match Settings 12px compact design
- [Phase 02]: ThemeStore uses useSyncExternalStore with lastModified timestamp for sync conflict resolution
- [Phase 02]: Migration v5 converts old theme/accent-color/glow/secondary/logo keys to unified theme-state
- [Phase 02]: preferences-sync replaced 'theme' + 'accent-color' with single 'theme-state' key in SYNCED_KEYS
- [Phase 02]: ALLOWED_PROPERTY_PATTERNS uses regex array for whitelist extensibility
- [Phase 02]: Share codes strip artwork and force builtIn:false for safe compact sharing
- [Phase 02]: matchMedia guarded with typeof check for test/SSR environments
- [Phase 02]: applyThemeFromState signature changed from (state?) to (clickEvent?) for cleaner API
- [Phase 02]: Font families append system fallback stacks rather than replacing entirely
- [Phase 02]: Solar declination at 40deg latitude for scheduling (+/- 30min, no geolocation needed)
- [Phase 02]: External CSS file uses 2-second polling via Tauri fs plugin (simpler than native watcher)
- [Phase 02]: Per-page override cleanup iterates snapshot to avoid mutation during iteration
- [Phase 02]: Schedule timer only starts when schedule.type is not 'none'
- [Phase 02]: matchesExtraModifier() enables chord keybindings (Ctrl+Shift+T) without conflicting with single-mod (Ctrl+T)
- [Phase 02]: System fonts enumerated via font-kit Tauri command with browser-mode fallback
- [Phase 02]: Google Fonts use CSS2 public endpoint with static 102-font list (no API key per Pitfall #4)
- [Phase 02]: SettingsDisplay reads directly from useThemeState() -- no props from Settings parent
- [Phase 02]: ThemeImportExport supports 4 import methods (file, paste, drag-drop, share code) plus export
- [Phase 02]: Sidebar context menu uses role=menu/menuitemradio for accessibility
- [Phase 02]: Override indicator 6px colored dot matching override theme accent color
- [Phase 02.1]: gsettings color-scheme checked first (GNOME 42+), gtk-theme name as secondary fallback for Linux dark mode detection
- [Phase 02.1]: Non-Linux platforms return false from detect_system_dark_mode (Tauri native detection works there)
- [Phase 02.1]: DEFAULT_SECONDARY changed from blue to green (#34d399) for 3-tier color hierarchy
- [Phase 02.1]: Legacy CSS aliases (--green, --accent-blue) set dynamically in apply functions for zero visual regression
- [Phase 02.1]: Migration v6 renames all secondary overrides to tertiary across all theme entries
- [Phase 02.1]: accentColor CSS property for native slider theming instead of custom thumb styles
- [Phase 02.1]: Panel opacity replaces alpha in rgba() glass-bg and bg-panel values directly
- [Phase 02.1]: Border radius scales proportionally: sm=base-4, lg=base+4, xl=base+8
- [Phase 02.1]: Color grid uses 2-column layout with inline expansion rather than modals
- [Phase 02.1]: var(--green-500) maps to var(--secondary-dim), var(--accent-blue) maps to var(--tertiary) for 3-tier color hierarchy
- [Phase 02.1]: CSS .badge-green and .badge-blue classes use var(--secondary-a12) and var(--tertiary-a12) instead of hardcoded rgba()
- [Phase 02.2]: notify crate with macos_fsevent feature for cross-platform file watching
- [Phase 02.2]: Testable inner functions separate from Tauri commands for unit testing
- [Phase 02.2]: Catppuccin Latte text darkened to #44476a/#5c5f77 (official palette neighbors) for WCAG on composited surfaces
- [Phase 02.2]: system->dark/light transitions do NOT trigger counterpart auto-switch (only explicit dark<->light toggles)
- [Phase 02.2]: buildWallbashTheme uses rgba compositing for bg-panel/bg-card with wallbash base colors
- [Phase 02.2]: Linux system mode shows single active theme card; macOS/Windows shows filtered presets
- [Phase 02.2]: gsettings polling reduced from 1s to 3s -- file watcher handles wallbash instant sync

- [Phase 03]: Wizard store follows useSyncExternalStore pattern from theme-store.ts for codebase consistency
- [Phase 03]: testResults excluded from localStorage persistence -- re-run on resume for security
- [Phase 03]: 24-hour TTL on wizard state to limit credential exposure in localStorage
- [Phase 03]: Animation intensity respects prefers-reduced-motion as initial default via matchMedia
- [Phase 03]: Wizard endpoints require X-API-Key but NOT RequireAuth -- runs before login
- [Phase 03]: Credentials validated against KEY_ENV_MAP allowlist before keychain write
- [Phase 03]: reload-secrets replaces entire HashMap via RwLock write -- no incremental merge
- [Phase 03]: Text colors darkened from official palettes for WCAG AA/AAA on composited surfaces
- [Phase 03]: Purple-mode/pink-mode get light counterparts since originals are already dark-category colorful themes
- [Phase 03]: resolveThemeDefinition uses COUNTERPART_MAP when GTK dark/light doesn't match OS COLOR_SCHEME
- [Phase 03]: Stub WizardConnectionTest/WizardGuidePanel for parallel plan 03-03 dependency
- [Phase 03]: Optional wizard steps auto-complete on unmount with skipped status if unconfigured
- [Phase 03]: Logo uses existing /logo-128.png from public assets for wizard welcome screen
- [Phase 03]: WizardGuidePanel uses max-height transition for expand/collapse (wider browser support)
- [Phase 03]: SettingsConnections imports resetWizard from wizard-store as canonical reset function
- [Phase 03]: clip-path polygon with evenodd fill rule for spotlight cutout -- clicks pass through naturally
- [Phase 03]: data-tour attribute convention for guided tour CSS selector targeting
- [Phase 03]: Summary step hides nav bar -- has its own Launch Dashboard + Tour buttons
- [Phase 03]: Completion flow uses best-effort credential saving -- wizard completes even if keychain save fails

- [Phase 04]: Widget Registry uses Map for O(1) lookup with registerWidget() for future Bjorn AI-generated widgets
- [Phase 04]: Dashboard store uses structuredClone for undo stack entries to prevent reference aliasing
- [Phase 04]: All 8 built-in widgets always included in default layout regardless of enabled modules (graceful empty states)
- [Phase 04]: Per-breakpoint curated layouts instead of auto-reflow: lg 12-col, md 8-col, sm/xs 4-col stacked
- [Phase 04]: RecycleBin capped at 20 items, undo stack capped at 30 entries
- [Phase 04]: setActivePage does NOT push to undo stack (navigation, not edit)
- [Phase 04]: Page-scoped Ctrl+E keydown handler instead of global keybinding to avoid conflict with nav-email
- [Phase 04]: useContainerWidth hook over WidthProvider HOC for container-based width measurement in react-grid-layout v2.2.2
- [Phase 04]: DashboardDataContext shares useDashboardData at page level for widget components
- [Phase 04]: 300ms debounce on onLayoutChange before persisting to dashboard store
- [Phase 04]: SYNCED_KEYS exported as named export for testability and external consumers
- [Phase 04]: LAST_WRITE_WINS_KEYS pattern for dashboard-state timestamp comparison instead of remote-wins
- [Phase 04]: dashboard-edit keybinding registered as action (not route) to coexist with nav-email on same key
- [Phase 04]: Schema-driven config rendering: iterate configSchema.fields to render appropriate input components
- [Phase 04]: WidgetPicker and RecycleBin lazy-loaded via React.lazy with named export wrapper
- [Phase 04]: Long-press on any widget enters edit mode via useLongPress hook from DashboardEditBar
- [Phase 04]: First-use default layout triggers via useEffect when active page has empty layouts

- [Phase 04.1]: wallbashUpdatedRecently window reduced from 5000ms to 500ms -- 5s was suppressing legitimate gsettings events
- [Phase 04.1]: recv_timeout coalescing debounce replaces sleep+drain -- fires 200ms after LAST event instead of dropping events
- [Phase 04.1]: gsettings monitor restart with exponential backoff 1s-60s, reset after 30s stable run
- [Phase 04.1]: setWallbashState atomic updater with single generation increment for race-free state updates
- [Phase 04.1]: debouncedApply moved to module level (150ms, was 100ms IIFE-scoped) for cross-scope event handler access
- [Phase 04.1]: Removed direct setWallbashColors/setWallbashColorScheme from main.tsx event handlers -- only setWallbashState used
- [Phase 05]: Manual scroll restoration via module-level Map (BrowserRouter incompatible with ScrollRestoration component)
- [Phase 05]: usePageState uses in-memory cache (not localStorage) -- form state is ephemeral within a session
- [Phase 05]: Generation counter pattern for useSyncExternalStore snapshot stability in page-cache
- [Phase 05]: Notes search uses client-side localStorage cache instead of CouchDB text search for simplicity and instant results
- [Phase 05]: Calendar event fields mapped in Rust (start_time->start, end_time->end, calendar_name->calendar) to match frontend CalendarEvent shape
- [Phase 05]: Direct localStorage persist for collapsedCategories bypasses undo stack -- collapse is a view preference, not a structural edit
- [Phase 05]: Dashboard sub-items only render when 2+ pages exist -- single page needs no sub-navigation
- [Phase 06]: _pluginId stored in widgetConfigs during addWidgetToPage for O(1) registry lookup by DashboardGrid
- [Phase 06]: resolveColor falls back to var(--accent) for unknown color keys
- [Phase 06]: PrimitiveErrorFallback is inline display, not Error Boundary -- WidgetWrapper provides PageErrorBoundary
- [Phase 06]: SVG sparkline uses polyline with normalized y-coordinates and preserveAspectRatio=none for fluid scaling
- [Phase 06]: ProgressGauge circular variant uses stroke-dasharray/dashoffset with rotate(-90) for 12-o-clock start
- [Phase 06]: MarkdownDisplay reuses same marked + sanitizeHtml pattern from existing MarkdownBubble.tsx
- [Phase 06]: ListView uses 2-state sort toggle (asc/desc) while DataTable uses 3-state cycle (asc/desc/unsorted) -- tables need original order return
- [Phase 06]: Pagination only renders when items exceed pageSize -- no unnecessary UI for small datasets
- [Phase 06]: Shared iconBtnStyle and titleStyle extracted as const objects for consistency between data display primitives
- [Phase 06]: Fixed 400x200 SVG viewBox avoids ResizeObserver complexity for chart primitives
- [Phase 06]: CSS transform tooltip positioning instead of portals -- keeps charts self-contained
- [Phase 06]: BarChart normalizes single-series data to multi-series internally for uniform rendering logic
- [Phase 07]: event.source validation for postMessage (not origin) -- srcdoc iframes have opaque null origin
- [Phase 07]: Blob URL revocation on re-register prevents memory leaks during hot-reload
- [Phase 07]: wrapAsESModule appends export default BjornWidget as the module contract for blob URL imports
- [Phase 07]: exposePrimitivesAPI uses lazy import references on window.__bjornAPI for blob module primitive access
- [Phase 07]: BjornTab uses own message state separate from useChatState for independent Bjorn conversations
- [Phase 07]: Bjorn system prompt sent as system_prompt field in api.post body to reuse existing /api/chat endpoint
- [Phase 07]: module_row_to_json helper + fetch_module_row DRYs 4 serialization sites into 1 shared function
- [Phase 07]: Re-fetch after mutation instead of constructing response from body -- ensures returned data matches DB state
- [Phase 08]: Duplicated vault_config helper locally in export.rs rather than making vault.rs couch_config pub -- keeps module coupling low
- [Phase 08]: EXPORT_TABLES includes bjorn_modules and bjorn_module_versions from Phase 7 additions to SYNC_TABLES
- [Phase 08]: Best-effort per-table error handling -- individual table failures return error objects instead of failing entire export
- [Phase 08]: Added getApiKey() export to api.ts for raw fetch binary downloads -- API key lives in module closure, not localStorage
- [Phase 08]: JSON archive format for notes export instead of .zip to avoid adding zip library dependency

### Roadmap Evolution

- Phase 02.1 inserted after Phase 02: Theme Settings Page Polish + System Mode Fix (URGENT) -- System mode doesn't detect GTK dark themes on Hyprland, Settings Display page needs visual reorganization and improved customizability
- Phase 04.1 inserted after Phase 04: Wallbash GTK System Mode Integration Fix (URGENT) -- Wallbash dark<->light switching unreliable, gsettings monitor race conditions, useGtkTheme toggle state issues, crossfade crashes WebKitGTK

### Pending Todos

None yet.

### Blockers/Concerns

- [Phase 4]: react-grid-layout v2 + React 19 compatibility needs validation during implementation (community fork available as fallback)
- [Phase 7]: iframe sandbox behavior on Linux (WebKitGTK) needs platform-specific testing
- [Phase 7]: Bjorn code generation quality depends on prompt engineering against primitives API contract

## Session Continuity

Last session: 2026-03-21T06:48:53Z
Stopped at: Completed 08-02-PLAN.md (Phase 08 complete)
Resume file: None
