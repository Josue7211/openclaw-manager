# Phase 8: Data Export - Context

**Gathered:** 2026-03-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Data export functionality — users can extract all app data (Supabase tables, local SQLite, CouchDB notes) as portable files from Settings. Pure infrastructure phase.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure phase.

Key constraints from existing architecture:
- Supabase data accessed via Axum backend (never direct from frontend)
- SQLite database at the Tauri data directory
- Notes stored in CouchDB (Obsidian LiveSync format) — proxy through `/api/vault/*`
- Export UI goes in Settings page (existing lazy-loaded panels pattern)
- Use Tauri `dialog.save` for file picker
- No new npm dependencies needed

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `api.get/post` wrapper for backend requests
- Tauri `dialog` plugin for native file save dialogs
- Settings page panel pattern (`pages/settings/` with lazy-loaded sub-components)
- `vault.ts` for CouchDB note operations
- `supabase.rs` for Supabase client helpers

### Established Patterns
- Settings panels as lazy-loaded components
- Axum routes in `src-tauri/src/routes/`
- Tauri commands for filesystem operations

### Integration Points
- Settings page (`pages/settings/`) — add Export panel
- Axum routes — add `/api/export/*` endpoints
- CouchDB proxy (`routes/vault.rs`) — bulk doc fetch for notes export

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
