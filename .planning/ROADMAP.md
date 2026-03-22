# Roadmap: OpenClaw Manager

## Milestones

- ✅ **v1.0** — Publishable release (shipped 2026-03-21) — [Full details](milestones/v1.0-ROADMAP.md)
- ◆ **v0.0.2** — Widget-First Architecture

## Phases

### v0.0.2 — Widget-First Architecture

- [x] Phase 1: Fix Widget Bugs + Decouple Existing Cards
  - **Goal:** Fix broken edit mode (drag/resize/delete), config panel positioning, widget picker state. Decouple all 8 existing dashboard cards from DashboardDataContext to independent React Query hooks.
  - **Requirements:** MH-01, MH-02, MH-03, MH-04
  - **Success criteria:**
    - Edit mode drag/resize works in both dev and production
    - Config panels open and position correctly
    - All 8 existing cards fetch data independently via React Query
    - DashboardDataContext no longer required for card rendering
    - Existing dashboard tests pass

- [x] Phase 2: Convert Tier 1 Modules to Widgets
  - **Goal:** Create widget representations for simple modules using the kernel hook + widget shell + page shell pattern.
  - **Requirements:** MH-05, MH-11, MH-14, MH-15
  - **Success criteria:**
    - Todos, Calendar, Reminders, Knowledge, Pomodoro widgets registered in Widget Registry
    - Each widget fetches data independently via React Query
    - Size-responsive rendering (compact at small sizes, detailed at large)
    - "View all" link navigates to full page
    - Lazy-loaded via React.lazy

- [x] Phase 3: Unify Personal + Dashboard Pages
  - **Goal:** Replace the static Personal page with a DashboardGrid. Home becomes a customizable widget layout using the same system as Dashboard.
  - **Requirements:** MH-06
  - **Success criteria:**
    - Personal page rendered by DashboardGrid
    - Default Home layout includes Tier 1 widgets (Todos, Calendar, Reminders)
    - Users can customize Home layout (add/remove/rearrange widgets)
    - Existing Personal page features preserved (morning brief, daily review, todos, homelab)
    - Dashboard state migration for existing users (localStorage)

- [x] Phase 4: Convert Tier 2 Modules to Widgets
  - **Goal:** Convert complex modules (Notes, Pipeline, Email, Homelab, Media) into widgets with appropriate decomposition.
  - **Requirements:** MH-07, MH-11
  - **Success criteria:**
    - Notes: recent-notes widget + notes-graph widget
    - Pipeline: pipeline-status widget + pipeline-ideas widget
    - Homelab: VM-status widget + network-status widget
    - Media: now-playing widget + media-queue widget
    - Email: inbox-summary widget
    - All widgets size-responsive and independently data-fetching

- [x] Phase 5: Category Presets + Widget Picker Enhancement
  - **Goal:** Add category preset layouts and enhance the Widget Picker with category filtering.
  - **Requirements:** MH-08, MH-12
  - **Success criteria:**
    - At least 3 presets: "Monitoring", "Productivity", "Notes Workspace"
    - Presets add multiple widgets in a preconfigured layout
    - Widget Picker has category tabs/filters
    - All module widgets appear in Widget Picker with correct categories

- [x] Phase 6: Convert Tier 3 Modules (Summary Widgets)
  - **Goal:** Create summary-only widgets for Messages, Chat, and Agents that link to full page experiences.
  - **Requirements:** MH-09, MH-15
  - **Success criteria:**
    - Messages summary widget: recent conversations with unread counts
    - Chat summary widget: recent conversations or quick prompt
    - Agents summary widget: agent status overview
    - Each links to full page experience
    - No attempt to replicate full interaction in widget

- [x] Phase 7: Remove DashboardDataContext + Cleanup
  - **Goal:** Delete the monolithic DashboardDataContext, clean up deprecated code paths, verify production edit mode.
  - **Requirements:** MH-10, MH-13
  - **Success criteria:**
    - DashboardDataContext deleted
    - No component imports DashboardDataContext
    - Production edit mode verified working
    - All tests pass
    - No deprecated data-fetching patterns remain

<details>
<summary>✅ v1.0 (Phases 1-8 + 3 decimal insertions) — SHIPPED 2026-03-21</summary>

- [x] Phase 1: Responsive Layout Shell + Visual Polish (5/5 plans)
- [x] Phase 2: Theming System (7/7 plans)
- [x] Phase 2.1: Theme Settings Page Polish + System Mode Fix (4/4 plans)
- [x] Phase 2.2: Theme System Mode Fixes (2/2 plans)
- [x] Phase 3: Setup Wizard + Onboarding (7/7 plans)
- [x] Phase 4: Dashboard Grid + Widget System (6/6 plans)
- [x] Phase 4.1: Wallbash GTK System Mode Integration Fix (2/2 plans)
- [x] Phase 5: Page Experience (3/3 plans)
- [x] Phase 6: Module Primitives Library (7/7 plans)
- [x] Phase 7: Bjorn Module Builder (7/7 plans)
- [x] Phase 8: Data Export (2/2 plans)

**Total:** 11 phases, 52 plans, 92 requirements — all complete

</details>

---
*Roadmap created: 2026-03-19*
*Last updated: 2026-03-22*
