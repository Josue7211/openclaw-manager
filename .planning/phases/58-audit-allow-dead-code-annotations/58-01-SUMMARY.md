---
phase: 58-audit-allow-dead-code-annotations
plan: 01
subsystem: infra
tags: [rust, dead-code, lint, code-quality, serde]

# Dependency graph
requires: []
provides:
  - Audited and justified all 12 #[allow(dead_code)] annotations in Rust codebase
  - Removed 1 incorrect suppression (health_check actively used in sync.rs)
affects: [supabase, media, auth, bjorn, pipeline]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Justify every #[allow(dead_code)] with an inline comment explaining why"

key-files:
  created: []
  modified:
    - src-tauri/src/supabase.rs
    - src-tauri/src/routes/auth.rs
    - src-tauri/src/routes/bjorn.rs
    - src-tauri/src/routes/media.rs
    - src-tauri/src/routes/pipeline/helpers.rs
    - src-tauri/src/routes/pipeline/agents.rs

key-decisions:
  - "health_check() annotation was incorrect -- method is actively called in sync.rs at 2 sites; removed suppression"
  - "All other 11 annotations are legitimate: serde deserialization structs, reserved-for-future APIs, stub fields, and enum completion constants"

patterns-established:
  - "Every #[allow(dead_code)] must have a trailing comment explaining the justification"

requirements-completed: []

# Metrics
duration: 3min
completed: 2026-03-24
---

# Phase 58 Plan 01: Audit allow(dead_code) Annotations Summary

**Audited 12 #[allow(dead_code)] annotations across 6 Rust files -- removed 1 incorrect suppression on health_check() and added justification comments to 11 legitimate ones**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-24T08:23:33Z
- **Completed:** 2026-03-24T08:26:33Z
- **Tasks:** 1
- **Files modified:** 6

## Accomplishments
- Found and removed incorrect #[allow(dead_code)] on SupabaseClient::health_check() which is actively used in sync.rs (2 call sites)
- Added justification comments to all 11 remaining legitimate annotations explaining why each suppression exists
- Established pattern: every #[allow(dead_code)] must have an inline comment

## Task Commits

Each task was committed atomically:

1. **Task 1: Audit and annotate all #[allow(dead_code)] attributes** - `4e8a3c6` (refactor)

## Files Created/Modified
- `src-tauri/src/supabase.rs` - Removed incorrect health_check() suppression; justified rpc_url() and rpc()
- `src-tauri/src/routes/auth.rs` - Justified SignupBody suppression (serde struct, body discarded)
- `src-tauri/src/routes/bjorn.rs` - Justified BridgeBody.args suppression (stub field)
- `src-tauri/src/routes/media.rs` - Justified 5 serde struct suppressions (PlexSession, PlexPlayer, SonarrEpisode, SonarrSeries, RadarrMovie)
- `src-tauri/src/routes/pipeline/helpers.rs` - Justified clean_env() suppression (reserved for TODO refactor)
- `src-tauri/src/routes/pipeline/agents.rs` - Justified mission::PENDING suppression (enum completion)

## Audit Results

| Location | Item | Verdict | Reason |
|----------|------|---------|--------|
| supabase.rs:98 | `rpc_url()` | Keep | Only used by `rpc()` which is itself reserved |
| supabase.rs:423 | `rpc()` | Keep | Reserved for future Postgres function calls |
| supabase.rs:447 | `health_check()` | **REMOVED** | Actively used in sync.rs (2 call sites) |
| bjorn.rs:553 | `BridgeBody.args` | Keep | Deserialized but not read; needed when bridge proxy implemented |
| auth.rs:598 | `SignupBody` | Keep | Serde struct; body intentionally discarded (signup disabled) |
| media.rs:107 | `PlexSession` | Keep | Serde struct; player field deserialized but not consumed |
| media.rs:129 | `PlexPlayer` | Keep | Serde struct; state field deserialized but not consumed |
| media.rs:145 | `SonarrEpisode` | Keep | Serde struct; all fields used but lint fires on Deserialize-only types |
| media.rs:158 | `SonarrSeries` | Keep | Serde struct; added field deserialized but not consumed |
| media.rs:168 | `RadarrMovie` | Keep | Serde struct; date_added field deserialized but not consumed |
| pipeline/helpers.rs:208 | `clean_env()` | Keep | Preferred over clean_env_from_env once spawn gets &AppState |
| pipeline/agents.rs:15 | `mission::PENDING` | Keep | Completes status enum; used when mission creation is wired |

## Decisions Made
- health_check() suppression was the only incorrect one -- removed it since sync.rs calls it in 2 places
- All serde Deserialize-only structs legitimately need #[allow(dead_code)] because Rust's dead_code lint doesn't understand serde field access
- Reserved APIs (rpc, clean_env) kept with justification since they have clear future use paths

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Pre-existing compilation error: `mod koel` declared in routes/mod.rs but koel.rs file doesn't exist. Out of scope for this plan. Logged to deferred items.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All #[allow(dead_code)] annotations now documented with justifications
- Future additions should follow the established pattern of inline comments

---
*Phase: 58-audit-allow-dead-code-annotations*
*Completed: 2026-03-24*
