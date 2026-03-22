# Research Summary: Widget-First Architecture (v0.0.2)

**Domain:** Dashboard widget system fixes and module-to-widget conversion
**Researched:** 2026-03-22
**Overall confidence:** HIGH

## Executive Summary

The widget-first conversion is an architectural refactoring of how 17 app modules render and fetch data. Currently, the app has two disconnected rendering paths: full-page route components (React Router) and dashboard widget cards (Widget Registry + DashboardGrid). These paths share no code. Page components own their data fetching directly. Widget cards depend on a monolithic `DashboardDataContext` that fetches all agent data in one blob, regardless of which widgets are placed.

The conversion introduces a three-layer pattern for every module: a **kernel hook** (data + logic, no UI), a **widget shell** (compact dashboard component satisfying `WidgetProps`), and a **page shell** (full-page route that composes widgets plus page chrome). React Query's built-in deduplication means widgets fetch their own data without duplicating network requests. The existing Widget Registry, WidgetWrapper, DashboardGrid, and dashboard-store remain unchanged -- they already handle lazy loading, error boundaries, responsive layouts, and multi-page state.

The 17 modules classify into three tiers of conversion difficulty. Tier 1 (7 modules: Todos, Calendar, Reminders, Knowledge, Pomodoro, Memory, Missions) are simple extractions. Tier 2 (5 modules: Notes, Pipeline, Email, Homelab, Media) decompose into multiple widgets. Tier 3 (3 modules: Messages, Chat, Agents) keep their full-page experience with a summary-only widget for dashboards. The Personal page unification (converting the static Home layout to DashboardGrid) is the key architectural milestone that proves the system works end-to-end.

Before any of this, the v1.0 post-ship dashboard bugs (broken drag/resize, config panel positioning, widget picker state) must be fixed. The architecture for edit mode is sound -- the bugs are interaction-level issues in react-grid-layout integration.

## Key Findings

**Stack:** No new dependencies needed. React Query deduplication, existing WidgetRegistry, and react-grid-layout handle the architecture. The stack is locked and sufficient.

**Architecture:** Module Kernel + Widget Shell + Page Shell pattern. Each module owns its data via React Query hooks. Widgets are size-responsive (compact at w<=4, full at w=12). DashboardDataContext is deprecated incrementally.

**Critical pitfall:** Converting existing cards from context to independent hooks must happen FIRST (Phase 1), before any new widgets. If new module widgets are built alongside the old context-dependent cards, the codebase has two competing data patterns that create merge conflicts and confusion.

## Implications for Roadmap

Based on research, suggested phase structure:

1. **Fix Widget Bugs + Decouple Existing Cards** - Unblock all subsequent work
   - Addresses: Drag/resize, config panel, widget picker bugs; context decoupling
   - Avoids: Building new features on a broken foundation

2. **Convert Tier 1 Modules to Widgets** - Prove the pattern with simple modules
   - Addresses: Todos, Calendar, Reminders, Knowledge, Pomodoro, Memory, Missions
   - Avoids: Starting with complex modules that have unclear decomposition

3. **Unify Personal + Dashboard Pages** - Core architectural milestone
   - Addresses: Eliminating the dual-page-system, proving grid-everywhere works
   - Avoids: Maintaining two separate layout systems indefinitely

4. **Convert Tier 2 Modules to Widgets** - Handle multi-widget modules
   - Addresses: Notes, Pipeline, Email, Homelab, Media
   - Avoids: Over-decomposing (not everything needs to be a widget)

5. **Category Presets + Widget Picker Enhancement** - Polish
   - Addresses: One-click preset layouts for complex modules
   - Avoids: Users manually placing 5+ widgets to recreate a "Notes workspace"

6. **Convert Tier 3 Modules (Summary Widgets)** - Entry-point widgets
   - Addresses: Messages, Chat, Agents summary widgets
   - Avoids: Trying to make full interactive experiences fit in grid cells

7. **Remove DashboardDataContext + Cleanup** - Technical debt removal
   - Addresses: Monolithic context deletion, production edit mode verification
   - Avoids: Leaving deprecated code paths that new contributors might use

**Phase ordering rationale:**
- Phase 1 before all else: broken edit mode blocks testing any widget changes
- Phase 2 before Phase 3: Home page needs Tier 1 widgets to populate its default layout
- Phase 3 before Phase 4: Personal/Dashboard unification proves the grid-everywhere approach before tackling complex modules
- Phase 4 before Phase 5: Presets reference widget IDs that must exist first
- Phase 6 can be parallel with Phase 5: Tier 3 widgets are independent of presets

**Research flags for phases:**
- Phase 1: Needs debugging research into react-grid-layout transform context issues (config panel positioning, drag interaction)
- Phase 3: Needs careful migration planning for existing dashboard-state localStorage (users have customized layouts)
- Phase 4 (Notes): Decomposition boundaries need design review -- how much of the Obsidian integration makes sense as standalone widgets vs page-only

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Architecture pattern | HIGH | Kernel+Shell is a well-established React pattern; React Query deduplication is documented core behavior |
| Module classification | HIGH | Based on direct analysis of every page component in the codebase |
| Build order | HIGH | Dependencies are clear; each phase's output feeds the next |
| Bug root causes | MEDIUM | Config panel and drag bugs likely transform-context related but not debugged yet |
| Notes decomposition | MEDIUM | Which sub-views make sense as standalone widgets needs design validation |
| Performance at scale | MEDIUM | React Query deduplication is proven, but 30+ concurrent widgets on one page is untested |

## Gaps to Address

- react-grid-layout transform context debugging (needed for Phase 1 bug fixes)
- Exact config schema definitions for each new module widget
- Dashboard-state localStorage migration strategy when adding Home page to existing users
- Whether `useAgentCache()` should use the existing `/api/cache` blob endpoint or be split into per-service endpoints
- Accessibility audit of widget compact views (truncated content needs ARIA treatment)
