# Phase 11: OpenClaw Agent Calendar - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Add CRUD capabilities to the existing cron job UI. Backend: new crons.rs with POST/PUT/DELETE endpoints (SQLite + gateway sync). Frontend: enhance existing CronsPage with edit/create/delete capabilities, add croner library for proper cron expression rendering, integrate into the calendar view.

</domain>

<decisions>
## Implementation Decisions

### Backend
- New crons.rs route file following agents.rs CRUD pattern exactly
- SQLite storage with soft delete (deleted_at) + log_mutation() for Supabase sync
- gateway_forward() for syncing changes to OpenClaw VM
- GET /api/crons already exists (reads from openclaw CLI) — keep for now, CRUD writes to local SQLite

### Frontend
- Enhance existing CronsPage (pages/crons/) — don't rebuild from scratch
- Add croner library for cron expression → fire times calculation (fixes `kind: 'cron'` rendering gap)
- Add cronstrue library for human-readable cron descriptions
- useCrons hook following useAgents pattern (optimistic mutations)
- Click calendar entry to edit (modal or inline panel)
- Create cron: button that opens a schedule picker (not raw crontab)
- Toggle enabled/disabled per job
- Delete with confirmation dialog

### Claude's Discretion
- Schedule picker UI design (time picker, day selector, preset options)
- How to integrate with existing WeekGrid/MonthView calendar components
- Whether to use modal or inline panel for editing
- How to handle dual data sources (CLI read vs SQLite write) during transition

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- CronsPage with WeekGrid, FrequentBar, JobList (80% of UI exists)
- CronJob, CronSchedule types already defined
- 404 lines of existing cron tests
- useAgents hook pattern for CRUD mutations
- gateway_forward() from Phase 9
- AgentDetailPanel pattern for edit panels

### Integration Points
- pages/crons/ — enhance existing components
- src-tauri/src/routes/ — new crons.rs
- Frontend needs: croner, cronstrue npm packages

</code_context>

<specifics>
## Specific Ideas

User wants this to be the "agent calendar" — cron schedules displayed visually, categorized under agents.

</specifics>

<deferred>
## Deferred Ideas

None

</deferred>
