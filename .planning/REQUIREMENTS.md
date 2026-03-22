# Requirements: v0.0.2 — Widget-First Architecture

**Created:** 2026-03-22
**Source:** Research (SUMMARY.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md)

## Must-Have

### MH-01: Working Edit Mode
Fix dashboard edit mode — drag, resize, and delete must work. Currently broken due to react-grid-layout integration bugs.

### MH-02: Working Config Panels
Widget config panels must open, position correctly, and save settings. Currently broken due to transform context issues.

### MH-03: Independent Widget Data Fetching
Every widget fetches its own data via React Query hooks. No dependency on DashboardDataContext parent. Widgets must work on any page.

### MH-04: Existing Card Decoupling
All 8 existing dashboard cards (AgentStatus, Heartbeat, Agents, Missions, Memory, IdeaBriefing, Network, Sessions) converted from DashboardDataContext to independent React Query hooks.

### MH-05: Tier 1 Module Widgets
Convert simple modules to widgets: Todos, Calendar, Reminders, Knowledge, Pomodoro, Memory, Missions. Each gets a kernel hook + widget shell + page shell.

### MH-06: Personal + Dashboard Unification
Replace static Personal page with DashboardGrid. Home page uses the same widget system as Dashboard. Users can customize their Home layout.

### MH-07: Tier 2 Module Widgets
Convert complex modules to widgets: Notes, Pipeline, Email, Homelab, Media. Multi-widget decomposition where appropriate.

### MH-08: Category Presets
One-click preset layouts for complex modules (e.g., "Notes Workspace", "Monitoring"). Presets add multiple widgets in a configured layout.

### MH-09: Tier 3 Summary Widgets
Summary-only widgets for Messages, Chat, Agents. Link to full page experience. No attempt to cram full interaction into grid cells.

### MH-10: DashboardDataContext Removal
Delete the monolithic context after all cards are decoupled. Clean up deprecated code paths.

### MH-11: Size-Responsive Widgets
All widgets render appropriately at any grid size — compact at small sizes, detailed at large sizes. Use `size` prop from WidgetProps.

### MH-12: Widget Picker Enhancement
Widget Picker shows all module widgets with category filtering. Users can find and add any module widget.

### MH-13: Production Edit Mode
Edit mode works in release builds, not just dev mode.

### MH-14: Lazy-Loaded Widget Components
All widget components use React.lazy. No regression on initial load time.

### MH-15: Widget "View All" Links
Compact widgets include a link/button to navigate to the full page experience.

## Nice-to-Have

### NH-01: Widget Config Schemas
Per-instance settings for module widgets (show completed todos, max items, date range, etc.).

### NH-02: Widget Bundles
"Add all monitoring widgets" one-click from Widget Picker.

### NH-03: Preset Sharing Codes
Share dashboard layouts like theme share codes.

### NH-04: Widget-Level Theme Overrides
Different accent color or style per widget instance.

## Out of Scope

- Full Messages/Chat/Notes experience as widget (summary only)
- Nested widget grids
- Widget marketplace / sharing
- Real-time collaboration
- Widget animations beyond standard CSS transitions

## Success Criteria

1. Every module has a widget representation in the Widget Picker
2. Edit mode (drag/resize/config) works in both dev and production
3. Personal page is a DashboardGrid with customizable layout
4. At least one category preset works end-to-end
5. DashboardDataContext is deleted with zero regressions
6. All widgets fetch data independently via React Query
7. Existing tests pass, new widgets have basic coverage
