---
phase: 59-strip-unused-crate-dependencies
plan: 01
subsystem: infra
tags: [cargo, rust, dependencies, cargo-machete]

# Dependency graph
requires:
  - phase: 58-audit-allow-dead-code
    provides: "Clean dead code audit ensuring removed code doesn't leave orphaned crate consumers"
provides:
  - "Cleaned Cargo.toml with 3 fewer dependencies (axum-extra, tokio-stream, tower)"
  - "Zero unused crate dependencies verified by cargo-machete"
affects: [60-strip-dead-route-modules, 74-full-route-audit]

# Tech tracking
tech-stack:
  added: [cargo-machete]
  patterns: [cargo-machete-audit]

key-files:
  created: []
  modified:
    - src-tauri/Cargo.toml
    - src-tauri/Cargo.lock

key-decisions:
  - "No cargo-machete ignore list needed -- zero false positives detected"
  - "Pre-existing clippy warnings (73) left untouched -- out of scope for crate stripping"

patterns-established:
  - "cargo-machete as dependency audit tool for future crate additions"

requirements-completed: [RUST-02]

# Metrics
duration: 6min
completed: 2026-03-24
---

# Phase 59 Plan 01: Strip Unused Crate Dependencies Summary

**Removed 3 unused Rust crate dependencies (axum-extra, tokio-stream, tower) verified by cargo-machete with zero false positives**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-24T08:39:48Z
- **Completed:** 2026-03-24T08:46:06Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Removed `axum-extra` (zero imports -- no TypedHeader or other axum-extra types used)
- Removed `tokio-stream` (zero imports -- StreamExt comes from futures crate)
- Removed `tower` (zero direct imports -- tower-http pulls it as transitive dependency)
- cargo-machete reports clean: zero unused dependencies
- All 269 Rust tests pass after removal
- Cargo.lock shed 83 lines of transitive dependency entries

## Task Commits

Each task was committed atomically:

1. **Task 1: Install cargo-machete, audit, and remove unused crates** - `b333f71` (chore)
2. **Task 2: Verify build, tests, and cargo-machete clean report** - `1b9b33e` (chore)

## Files Created/Modified
- `src-tauri/Cargo.toml` - Removed 3 unused dependency declarations
- `src-tauri/Cargo.lock` - Updated lockfile reflecting dependency removal (-83 lines)

## Decisions Made
- No `[package.metadata.cargo-machete]` ignore section added because cargo-machete found zero false positives (async-stream was NOT flagged)
- Pre-existing clippy warnings (73 total, all unrelated to crate removal) left untouched per SCOPE BOUNDARY rule -- they are not caused by this plan's changes

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Worktree was missing `koel.rs` file (present in main repo but not synced to worktree) causing a pre-existing build failure. Copied the file from main repo to unblock build verification. This is a worktree sync issue, not related to the crate removal.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Cargo.toml is clean with only used dependencies
- Ready for Phase 60 (Strip Dead Route Modules) -- route module audit can proceed
- cargo-machete installed and available for future audits

## Self-Check: PASSED

- FOUND: src-tauri/Cargo.toml
- FOUND: src-tauri/Cargo.lock
- FOUND: 59-01-SUMMARY.md
- FOUND: commit b333f71
- FOUND: commit 1b9b33e

---
*Phase: 59-strip-unused-crate-dependencies*
*Completed: 2026-03-24*
