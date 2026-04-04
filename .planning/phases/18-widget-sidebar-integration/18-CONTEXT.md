# Phase 18: Widget Registry + Sidebar Module Integration - Context

**Gathered:** 2026-03-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire all new features (terminal, sessions, VNC viewer) into the widget picker and sidebar. Most wiring was done in prior phases — this phase fills the remaining gaps.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — pure integration/wiring phase. Most wiring already done in Phases 14-17.

### Already Done (verified)
- Terminal widget registered in widget-registry.ts (Phase 14)
- Sessions module registered in modules.ts with requiresConfig (Phase 16)
- Sessions route at /sessions in main.tsx (Phase 16)
- Sessions nav item in nav-items.ts (Phase 16)
- Remote viewer module registered in modules.ts with requiresConfig (Phase 17)
- Remote viewer route at /remote in main.tsx (Phase 17)
- OpenClaw page accessible from sidebar (Phase 12)
- All lazy-loaded via React.lazy (Phases 14-17)

### Remaining Gaps
- VNC viewer dashboard widget not in widget-registry.ts (static card, click opens /remote)
- Claude Code sessions dashboard widget not in widget-registry.ts (shows active count, click opens /sessions)
- Remote viewer nav item may be missing from nav-items.ts
- No requiresConfig warning display for OpenClaw sidebar entry

</decisions>

<code_context>
## Existing Code Insights

### Integration Points
- `frontend/src/lib/widget-registry.ts` — BUILTIN_WIDGETS array
- `frontend/src/lib/nav-items.ts` — sidebar navigation items
- `frontend/src/lib/modules.ts` — module definitions with requiresConfig

</code_context>

<specifics>
No specific requirements — fill remaining registration gaps.
</specifics>

<deferred>
None — all integration work covered.
</deferred>
