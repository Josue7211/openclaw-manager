---
phase: 58-audit-allow-dead-code-annotations
verified: 2026-03-24T12:00:00Z
status: gaps_found
score: 2/4 must-haves verified
gaps:
  - truth: "Every #[allow(dead_code)] annotation has been individually reviewed and either removed or justified"
    status: failed
    reason: "terminal.rs:184 has #[allow(dead_code)] with no inline justification comment. terminal.rs was listed in the PLAN's files_modified but was NOT touched by the phase 58 commit (4e8a3c6). The annotation governs PtyCleanup.master."
    artifacts:
      - path: "src-tauri/src/routes/terminal.rs"
        issue: "Line 184: #[allow(dead_code)] with no // Justification: or any inline comment"
    missing:
      - "Add inline justification to terminal.rs:184 — e.g. `#[allow(dead_code)] // Justification: accessed via Arc<Mutex<Option<PtyCleanup>>> for resize operations; compiler cannot track cross-scope field access`"
  - truth: "cargo clippy produces zero dead_code warnings after the audit"
    status: failed
    reason: "7 'never used' dead_code warnings exist after the audit. These are pre-existing and not introduced by this phase, but the truth as stated in the PLAN is not met. Warnings: BOOT_EPOCH and boot_epoch in status.rs; PTY_BLOCKED_PREFIXES in terminal.rs; require_str and mime_from_extension in util.rs; select/select_single/insert/upsert/update/delete methods in supabase.rs; verify_peer in tailscale.rs."
    artifacts:
      - path: "src-tauri/src/routes/status.rs"
        issue: "BOOT_EPOCH static and boot_epoch function are never used (pre-existing)"
      - path: "src-tauri/src/routes/terminal.rs"
        issue: "PTY_BLOCKED_PREFIXES constant reported as never used (false positive — used in test block)"
      - path: "src-tauri/src/routes/util.rs"
        issue: "require_str and mime_from_extension functions are never used (pre-existing)"
      - path: "src-tauri/src/supabase.rs"
        issue: "select, select_single, insert, upsert, update, delete methods are never used — these are SupabaseClient public API methods that have no #[allow(dead_code)] annotation and generate warnings"
      - path: "src-tauri/src/tailscale.rs"
        issue: "verify_peer function is never used (pre-existing)"
    missing:
      - "Decision needed: either add #[allow(dead_code)] // Justification: annotations to the SupabaseClient methods (select, select_single, insert, upsert, update, delete) in supabase.rs, or accept that these pre-existing warnings are out of scope for this phase"
      - "Note: the supabase.rs methods are the most directly related to this phase's scope — they are the callers of rpc_url/rpc which already have justified suppressions"
---

# Phase 58: Audit allow(dead_code) Annotations — Verification Report

**Phase Goal:** Every suppressed dead code warning in Rust has an explicit justification or is removed
**Verified:** 2026-03-24T12:00:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Every #[allow(dead_code)] annotation has been individually reviewed and either removed or justified | FAILED | terminal.rs:184 has annotation with no inline comment; terminal.rs was not modified in commit 4e8a3c6 |
| 2 | No struct-level #[allow(dead_code)] hides genuinely unused fields | PARTIAL | SonarrSeries.added and RadarrMovie.date_added remain (plan called for removal); executor kept with struct-level justification instead — acceptable alternative approach |
| 3 | cargo clippy produces zero dead_code warnings after the audit | FAILED | 7 "never used" warnings remain: BOOT_EPOCH, boot_epoch, PTY_BLOCKED_PREFIXES, require_str, mime_from_extension, select/select_single/insert/upsert/update/delete, verify_peer |
| 4 | All 231 existing Rust tests still pass | VERIFIED | 291 tests pass (count grew since plan was written); `cargo test` exits 0 |

**Score:** 2/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src-tauri/src/supabase.rs` | health_check annotation removed; rpc/rpc_url justified | VERIFIED | Lines 98 and 423 have inline justification comments; no annotation on health_check at line 447 |
| `src-tauri/src/routes/media.rs` | Struct-level annotations removed or field-level justified | PARTIAL | 5 struct-level annotations present, all with inline justification comments; added/date_added fields retained (deviation from plan) |
| `src-tauri/src/routes/auth.rs` | SignupBody annotation justified | VERIFIED | Line 598: `#[allow(dead_code)] // fields consumed by serde deserialization; body intentionally discarded (signup disabled)` |
| `src-tauri/src/routes/bjorn.rs` | BridgeBody.args annotation justified | VERIFIED | Line 553: `#[allow(dead_code)] // deserialized from JSON request but not yet read; needed when bridge proxy is implemented` |
| `src-tauri/src/routes/terminal.rs` | PtyCleanup.master annotation justified | FAILED | Line 184: `#[allow(dead_code)]` with NO inline comment — file was not modified by this phase despite being listed in PLAN's files_modified |
| `src-tauri/src/routes/pipeline/helpers.rs` | clean_env() annotation justified | VERIFIED | Line 208: `#[allow(dead_code)] // preferred over clean_env_from_env once spawn_agent_process gets &AppState (see TODO below)` |
| `src-tauri/src/routes/pipeline/agents.rs` | PENDING constant annotation justified | VERIFIED | Line 15: `#[allow(dead_code)] // completes the status enum; will be used when mission creation is wired` |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src-tauri/src/supabase.rs` | `src-tauri/src/sync.rs` | health_check() method call | VERIFIED | sync.rs lines 107 and 477 both call `client.health_check().await` — annotation removal was correct |
| `src-tauri/src/routes/media.rs` | Plex/Sonarr/Radarr API responses | serde::Deserialize | VERIFIED | `#[derive(Debug, Deserialize)]` present on all media structs |

### Data-Flow Trace (Level 4)

Not applicable. This phase modifies annotations only — no data rendering components.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| All Rust tests pass | `cargo test` | 291 passed; 0 failed | PASS |
| cargo check succeeds | `cargo check` | Clean compile | PASS |
| No dead_code annotation without comment | `grep -rn 'allow(dead_code)' src-tauri/src/ \| grep -vc '// '` | 1 (terminal.rs:184) | FAIL |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| RUST-01 | 58-01-PLAN.md | All 13 `#[allow(dead_code)]` annotations audited — remove or justify each | PARTIAL | 12 annotations found (not 13 as requirement stated); 1 removed (health_check); 11 kept but 1 lacks justification comment (terminal.rs:184) |

**RUST-01 notes:**
- REQUIREMENTS.md records 13 annotations; the RESEARCH found only 12 (the SUMMARY confirms 12). The count discrepancy is minor — the research phase identified the correct actual count.
- The requirement is marked "Complete" in REQUIREMENTS.md's phase mapping table but the implementation has a gap (terminal.rs:184 unjustified).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src-tauri/src/routes/terminal.rs` | 184 | `#[allow(dead_code)]` with no inline comment | Blocker | Violates the core invariant this phase was meant to establish: every suppression must have a justification |
| `src-tauri/src/supabase.rs` | 132+ | `select`, `select_single`, `insert`, `upsert`, `update`, `delete` methods generate dead_code warnings with no suppression | Warning | These are public API methods on SupabaseClient — they should either be used or have justified suppressions; they are the callers that make rpc_url/rpc justified |

### Human Verification Required

None — all checks were automated.

## Gaps Summary

**2 gaps block full goal achievement:**

**Gap 1 (Blocker): terminal.rs:184 missing justification**

The PLAN explicitly listed `terminal.rs` in `files_modified` and specified the exact justification to add: `#[allow(dead_code)] // Justification: accessed via Arc<Mutex<Option<PtyCleanup>>> for resize operations; compiler cannot track cross-scope field access`. The executor's commit (`4e8a3c6`) did not include terminal.rs — it was a one-commit implementation that skipped this file. The annotation suppresses the `master: Box<dyn MasterPty + Send>` field in the `PtyCleanup` struct.

**Fix:** Add justification comment to terminal.rs:184 inline.

**Gap 2 (Warning — scope question): 7 residual dead_code warnings from clippy**

The PLAN truth stated "cargo clippy produces zero dead_code warnings." This is unmet. However, 6 of the 7 warnings are in files entirely outside the phase's scope (status.rs, util.rs, tailscale.rs). The 7th — the SupabaseClient methods in supabase.rs — is directly related since those methods are what make `rpc_url` and `rpc` meaningful (they are the consumer context). The executor justified `rpc_url` and `rpc` but left the public methods that would use them unsuppressed.

These warnings are pre-existing and were not introduced by this phase, but the phase's stated goal was zero dead_code warnings. A decision is needed: treat them as in-scope for a follow-on fix, or accept the narrower interpretation that only the annotated items needed auditing.

**Plan deviation (not a blocker): media.rs field removal skipped**

The PLAN called for removing `SonarrSeries.added` and `RadarrMovie.date_added` fields entirely. The executor instead kept them and added struct-level justification comments. The resulting state is acceptable — the suppression is now documented — but differs from the plan's approach of field removal. The SUMMARY accurately describes this as "serde struct: added field deserialized from Sonarr API but not yet consumed" which is a legitimate justification.

---

_Verified: 2026-03-24T12:00:00Z_
_Verifier: Claude (gsd-verifier)_
