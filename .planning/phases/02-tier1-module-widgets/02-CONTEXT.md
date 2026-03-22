# Phase 2: Convert Tier 1 Modules to Widgets - Context

**Gathered:** 2026-03-22
**Status:** Executing

<domain>
## Phase Boundary

Convert simple modules (Todos, Calendar, Reminders, Knowledge, Pomodoro) into dashboard widgets using the kernel hook + widget shell pattern established in Phase 1. Each gets a compact widget view with "View all" link to full page.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — infrastructure phase. User specified "default for all."

- Widget components go in `components/widgets/` (new directory)
- Kernel hooks go in `lib/hooks/dashboard/` alongside Phase 1 hooks
- All widgets registered as `tier: 'builtin'`, `category: 'productivity'`
- Default size 2x2 for list-based widgets, 1x2 for Pomodoro timer
- Compact view shows 3-5 items max with "View all" navigation link
- Pomodoro uses localStorage (no API) — same as full page

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `useTodos()` hook with optimistic mutations (lib/hooks/useTodos.ts)
- `queryKeys` centralized definitions
- `useTableRealtime` for SSE invalidation
- Kernel hook pattern from Phase 1 (useAgentStatus, useMissions, etc.)
- Widget registration via registerWidget() in widget-registry.ts

### Established Patterns
- WidgetProps: { widgetId, config, isEditMode, size }
- React.lazy component loading via registry
- Demo mode support via isDemoMode()
- CSS variables for all styling

### Integration Points
- widget-registry.ts — register 5 new widgets
- lib/hooks/dashboard/index.ts — export new hooks
- Each widget navigates to full page via useNavigate

</code_context>

<specifics>
## Specific Ideas

No specific requirements — standard widget conversion following proven pattern.

</specifics>

<deferred>
## Deferred Ideas

None.

</deferred>
