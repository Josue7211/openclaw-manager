# Phase 05: Page Experience - Context

**Gathered:** 2026-03-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Make navigation between modules feel instant and polished — state is preserved, activity is visible at a glance, and power users can find anything in seconds. No new features — this is UX polish for existing pages.

</domain>

<decisions>
## Implementation Decisions

### Navigation & State Preservation
- React Router ScrollRestoration for automatic scroll position save/restore between routes
- page-cache.ts for form state preservation (draft text, filter selections, accordion states)
- CSS opacity+transform fade for page transitions (NOT View Transitions API — WebKitGTK crashes)
- No full-page reloads — all navigation is client-side via React Router

### Unread Badges & Activity
- Red dot badges on sidebar items for modules with new activity
- Event-bus events (new-message, mission-updated, etc.) drive badge state
- Per-conversation unread counts in Messages conversation list (already partially implemented)
- Activity dot on collapsed category headers when any child has unread content

### Global Search Extension
- Extend existing GlobalSearch.tsx to query: notes, todos, calendar events, knowledge entries
- Search queries go through Axum endpoints (not direct Supabase)
- Results grouped by type with icons matching sidebar module icons
- CommandPalette items show keyboard shortcut hints

### Keyboard Shortcut Discoverability
- Append ' (Ctrl+X)' to existing aria-labels and title attrs on buttons that have keybindings
- CommandPalette items display their shortcut on the right side
- Existing KeyboardShortcutsModal is sufficient — no new overlay needed

### Sidebar Enhancements
- Collapsible categories: click category header to toggle, chevron indicator
- Collapsed state persisted in localStorage via sidebar-config.ts
- Dashboard sub-items: show dashboard page names under Dashboard sidebar entry (from dashboard-store pages)

### Claude's Discretion
- Exact page transition timing and easing
- Which modules get unread badges (at minimum: Messages, Missions, Pipeline)
- How many search results per category in GlobalSearch
- Badge count format (number vs dot) per module

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `frontend/src/components/GlobalSearch.tsx` — Existing spotlight search (needs extension)
- `frontend/src/components/CommandPalette.tsx` — Cmd+K palette (needs shortcut hints)
- `frontend/src/components/Sidebar.tsx` — Sidebar with categories (needs collapse + badges)
- `frontend/src/lib/event-bus.ts` — Typed pub/sub for new-message, mission-updated events
- `frontend/src/lib/sidebar-config.ts` — Category layout, localStorage persistence
- `frontend/src/lib/page-cache.ts` — Existing page-level cache helpers

### Established Patterns
- useSyncExternalStore for reactive state (sidebar-config, theme-store, dashboard-store)
- Event-bus for cross-component communication (NOT custom DOM events)
- React Query for data fetching, query keys in lib/query-keys.ts

### Integration Points
- Sidebar.tsx — add collapse toggles, badge dots, dashboard sub-items
- GlobalSearch.tsx — add search providers for notes, todos, calendar, knowledge
- LayoutShell.tsx — page transition wrapper around <Outlet>
- CommandPalette.tsx — shortcut hints on items

</code_context>

<specifics>
## Specific Ideas

- Discord-style collapsible sidebar categories with chevron
- Unread dot similar to Discord's white dot on unread channels
- Dashboard pages as sidebar sub-items (like Discord channels under a server)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
