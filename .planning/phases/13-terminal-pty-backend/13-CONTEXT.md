# Phase 13: Terminal PTY Backend - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Build secure PTY spawning with WebSocket relay. New terminal.rs route module with /api/terminal/ws endpoint. CAS guard limits to 3 concurrent sessions. Environment sanitized. Process group cleanup ensures zero orphans.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — infrastructure phase.

Key constraints from research:
- portable-pty 0.9.0 as the only new dependency
- CAS guard pattern copied from chat.rs (MAX_PTY_CONNECTIONS = 3)
- WebSocket upgrade pattern from chat.rs with RequireAuth
- Environment strip 15 sensitive prefixes using CommandBuilder::env_remove()
- Process group kill via killpg(pgid, SIGKILL) on Unix
- PTY I/O via spawn_blocking to avoid blocking tokio runtime
- Drop pair.slave immediately after spawn to prevent FD leak
- 4KB read buffer, 64KB WebSocket chunks
- Default shell detection: SHELL env var on Unix, PowerShell fallback on Windows

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- chat.rs CAS guard (lines 22-76) — copy for PTY connection limit
- chat.rs WebSocket upgrade (lines 1028-1048) — copy for terminal endpoint
- RequireAuth extractor for auth
- AppState.db for session metadata if needed

### Integration Points
- New: src-tauri/src/routes/terminal.rs
- Register in routes/mod.rs
- Cargo.toml: add portable-pty = "0.9"

</code_context>

<specifics>
## Specific Ideas

No specific requirements — infrastructure phase

</specifics>

<deferred>
## Deferred Ideas

None

</deferred>
