# Phase 58: Audit #[allow(dead_code)] Annotations - Research

**Researched:** 2026-03-24
**Domain:** Rust dead code analysis, Tauri v2 backend
**Confidence:** HIGH

## Summary

There are exactly 13 `#[allow(dead_code)]` annotations across 7 files in `src-tauri/src/`. Each has been individually examined against call sites, serde deserialization usage, and field access patterns. The annotations fall into three categories: (1) genuinely unused code that can be removed, (2) serde deserialization structs where the `#[allow(dead_code)]` suppresses the "struct never constructed" warning (they're constructed by `Deserialize`, not by user code), and (3) code kept for future use that needs a justification comment.

**Primary recommendation:** Process each annotation individually -- remove the `#[allow(dead_code)]` on deserialization structs (replace with `// Justification: constructed by serde::Deserialize` if needed, or just let serde's derive handle it), delete genuinely dead code, and add justification comments for intentionally-kept-but-unused code.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
None -- all implementation choices at Claude's discretion (pure infrastructure/audit phase).

### Claude's Discretion
All implementation choices are at Claude's discretion. Use ROADMAP phase goal, success criteria, and codebase conventions to guide decisions.

### Deferred Ideas (OUT OF SCOPE)
None.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RUST-01 | All 13 `#[allow(dead_code)]` annotations audited -- remove or justify each | Complete inventory of all 13 annotations with per-annotation verdict below |
</phase_requirements>

## Standard Stack

No new libraries required. This phase is pure code audit/cleanup using existing tooling.

### Core Tools
| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| cargo clippy | 0.1.94 | Lint verification after changes | Already installed, standard Rust linting |
| cargo check | (rustc) | Compilation verification | Fastest way to confirm no breakage |
| cargo test | (rustc) | Regression detection | 231 existing Rust tests |

## Architecture Patterns

### Serde Deserialization Structs

The Rust compiler reports struct fields as "dead code" when they are only populated via `#[derive(Deserialize)]` and never read by application code. This is the most common reason for `#[allow(dead_code)]` in this codebase (8 of 13 annotations). The correct approach depends on whether the field is actually consumed:

- **Field IS read after deserialization:** The `#[allow(dead_code)]` can simply be removed -- if `#[derive(Deserialize)]` is present, the compiler won't warn about the struct being "constructed" since Deserialize handles that. The warning is about the fields not being read by your code.
- **Field is NOT read after deserialization:** The field can be removed from the struct entirely. Serde will ignore unknown fields by default (or with `#[serde(deny_unknown_fields)]` absent).
- **Struct is deserialized but no fields are read:** The struct should be examined for whether it needs to exist at all.

### Intentionally Unused API Methods

Some methods (like `rpc()`, `health_check()`) are part of a client API that should remain available even if not currently called. These get `// Justification:` comments.

### Anti-Patterns to Avoid
- **Blanket struct-level `#[allow(dead_code)]`:** Suppresses warnings for ALL fields, hiding genuinely unused ones. Prefer field-level annotations or removing unused fields.
- **Removing code that is used via serde:** Always check if `Deserialize` is derived before concluding a struct/field is dead.

## Complete Annotation Inventory

### File 1: `src-tauri/src/supabase.rs` (3 annotations)

**Annotation 1 -- Line 98: `rpc_url()` method**
```rust
#[allow(dead_code)]
fn rpc_url(&self, function: &str) -> String
```
- **Called by:** `self.rpc()` method at line 426, and test `test_rpc_url()` at line 479
- **Callers of `rpc()`:** NONE in production code. Zero call sites found.
- **Verdict:** `rpc_url()` is only used by `rpc()` which is itself unused. However, both `rpc_url` and `rpc` are part of the SupabaseClient public API. They are intentionally available for future use.
- **Action:** KEEP -- add `// Justification: SupabaseClient API surface -- available for RPC calls from future routes`

**Annotation 2 -- Line 423: `rpc()` method**
```rust
#[allow(dead_code)]
pub async fn rpc(&self, function: &str, body: Value) -> anyhow::Result<Value>
```
- **Called by:** No production callers. Only referenced in docs/comments.
- **Verdict:** Intentional API surface, not currently consumed but architecturally valuable.
- **Action:** KEEP -- add `// Justification: SupabaseClient API surface -- available for RPC calls from future routes`

**Annotation 3 -- Line 447: `health_check()` method**
```rust
#[allow(dead_code)]
pub async fn health_check(&self) -> bool
```
- **Called by:** `sync.rs:107` and `sync.rs:477` -- ACTIVELY USED in production.
- **Verdict:** This annotation is WRONG. The method IS used. The annotation should be removed.
- **Action:** REMOVE -- method is actively called from `sync.rs`. The warning was likely a false positive from a build configuration mismatch (e.g., the method was marked dead before `sync.rs` was written).

### File 2: `src-tauri/src/routes/bjorn.rs` (1 annotation)

**Annotation 4 -- Line 553: `BridgeBody.args` field**
```rust
#[derive(Debug, Deserialize)]
struct BridgeBody {
    source: String,
    command: String,
    #[allow(dead_code)]
    args: Option<Value>,
}
```
- **Usage:** `bridge_proxy()` only reads `body.source` and `body.command`. `args` is deserialized but never read.
- **Context:** `bridge_proxy()` is a stub (returns TODO error). The `args` field will be needed when implemented.
- **Verdict:** Stub code with TODO. Field is intentionally present for future use.
- **Action:** KEEP -- change to `// Justification: deserialized from JSON request body; will be used when bridge proxy is implemented (see TODO above)`

### File 3: `src-tauri/src/routes/auth.rs` (1 annotation)

**Annotation 5 -- Line 598: `SignupBody` struct**
```rust
#[derive(Deserialize)]
#[allow(dead_code)]
struct SignupBody {
    email: String,
    password: String,
    invite_token: Option<String>,
}
```
- **Usage:** Used as `Json<SignupBody>` parameter in `signup()` handler. The handler binds it as `Json(_body)` (underscore-prefixed = intentionally unused). Signup is disabled -- the handler just logs and returns 403.
- **Verdict:** The struct is constructed via serde's `Deserialize`, so the "never constructed" warning is a false positive. The fields are intentionally not read because signup is disabled. The struct validates the request shape even though the handler rejects all requests.
- **Action:** KEEP -- add `// Justification: serde::Deserialize constructs this from JSON; fields unused because signup is disabled (validates request shape)`

### File 4: `src-tauri/src/routes/media.rs` (5 annotations)

**Annotation 6 -- Line 107: `PlexSession` struct**
```rust
#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct PlexSession { ... }
```
- **Usage:** Deserialized via `plex_fetch::<PlexMediaContainer<PlexSession>>()` at line 314. Most fields ARE read: `grandparent_title`, `title`, `media_type`, `view_offset`, `duration`, `user`. Only `player` is NOT read.
- **Verdict:** Struct is constructed by serde. The `#[allow(dead_code)]` on the struct suppresses the "struct never constructed" warning which is a serde false positive. The `player` field is genuinely unused but the struct-level annotation hides that.
- **Action:** REMOVE struct-level annotation. Add field-level annotation on `player`: `#[allow(dead_code)] // Justification: deserialized from Plex API; reserved for future player state display`

**Annotation 7 -- Line 129: `PlexPlayer` struct**
```rust
#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct PlexPlayer {
    state: Option<String>,
}
```
- **Usage:** Only used as the type for `PlexSession.player`, which is never read after deserialization.
- **Verdict:** Genuinely unused. `PlexPlayer` and `PlexSession.player` could both be removed. However, they model the Plex API response and may be used in the future for showing player state.
- **Action:** KEEP but move to field-level justification. Replace struct-level `#[allow(dead_code)]` with `// Justification: models Plex API player state; reserved for future now-playing feature enhancement`

**Annotation 8 -- Line 145: `SonarrEpisode` struct**
```rust
#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct SonarrEpisode { ... }
```
- **Usage:** Deserialized via `sonarr_fetch::<Vec<SonarrEpisode>>()` at line 343. Fields `series`, `title`, `air_date_utc`, `season_number`, `episode_number` are ALL accessed.
- **Verdict:** ALL fields are used. The `#[allow(dead_code)]` is suppressing a false positive from serde construction.
- **Action:** REMOVE -- all fields are used, serde handles construction

**Annotation 9 -- Line 158: `SonarrSeries` struct**
```rust
#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct SonarrSeries {
    title: Option<String>,
    year: Option<i64>,
    added: Option<String>,
}
```
- **Usage:** Deserialized via `sonarr_fetch::<Vec<SonarrSeries>>()` at line 352. Fields `title` and `year` are read. `added` is NOT read.
- **Verdict:** Struct is constructed by serde (false positive). `added` field is genuinely unused.
- **Action:** REMOVE struct-level annotation. Either remove `added` field (serde ignores unknown fields by default) or add field-level `#[allow(dead_code)]` with justification.

**Annotation 10 -- Line 168: `RadarrMovie` struct**
```rust
#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct RadarrMovie {
    title: Option<String>,
    year: Option<i64>,
    date_added: Option<String>,
    has_file: Option<bool>,
}
```
- **Usage:** Deserialized via `radarr_fetch::<Vec<RadarrMovie>>()` at line 366. Fields `title`, `year`, `has_file` are read. `date_added` is NOT read.
- **Verdict:** Same as SonarrSeries. Struct is serde-constructed. `date_added` is genuinely unused.
- **Action:** REMOVE struct-level annotation. Either remove `date_added` field or add field-level `#[allow(dead_code)]` with justification.

### File 5: `src-tauri/src/routes/pipeline/helpers.rs` (1 annotation)

**Annotation 11 -- Line 208: `clean_env()` function**
```rust
#[allow(dead_code)]
pub(super) fn clean_env(state: &crate::server::AppState, model: &str) -> Vec<(String, String)>
```
- **Usage:** ZERO callers. The codebase uses `clean_env_from_env()` (the fallback version without AppState) instead. There's a TODO at line 287: "spawn_agent_process should accept &AppState to pass secrets to clean_env."
- **Verdict:** The function is intentionally kept as the "correct" implementation that will replace `clean_env_from_env()` once the refactor happens. It's dead but architecturally planned.
- **Action:** KEEP -- add `// Justification: intended replacement for clean_env_from_env() once spawn_agent_process accepts &AppState (see TODO at line 287)`

### File 6: `src-tauri/src/routes/terminal.rs` (1 annotation)

**Annotation 12 -- Line 184: `PtyCleanup.master` field**
```rust
struct PtyCleanup {
    child: Box<dyn portable_pty::Child + Send + Sync>,
    #[allow(dead_code)]
    master: Box<dyn MasterPty + Send>,
    #[cfg(unix)]
    pgid: Option<i32>,
}
```
- **Usage:** The field IS accessed at line 363 via `pty.master.resize(...)` through the `Arc<Mutex<Option<PtyCleanup>>>` shared reference. The `#[allow(dead_code)]` is likely wrong -- the compiler may warn because `PtyCleanup`'s own methods (just `Drop`) don't read `master`, but it IS read externally.
- **Verdict:** The annotation might be needed because the compiler's dead_code analysis doesn't track access through `Arc<Mutex<Option<T>>>` into struct fields from outside the struct's own impl block. The field is actively used but the compiler can't prove it.
- **Action:** KEEP but update comment -- `// Justification: accessed via Arc<Mutex<Option<PtyCleanup>>> for resize operations (line ~363); compiler can't track cross-scope field access`

### File 7: `src-tauri/src/routes/pipeline/agents.rs` (1 annotation)

**Annotation 13 -- Line 15: `status::mission::PENDING` constant**
```rust
pub mod mission {
    #[allow(dead_code)]
    pub const PENDING: &str = "pending";
    pub const ACTIVE: &str = "active";
    pub const DONE: &str = "done";
    pub const FAILED: &str = "failed";
    pub const AWAITING_REVIEW: &str = "awaiting_review";
}
```
- **Usage:** ZERO call sites for `PENDING`. Other constants in the same module (`ACTIVE`, `DONE`, `FAILED`, `AWAITING_REVIEW`) ARE used.
- **Verdict:** The constant mirrors a database/frontend status value. All other statuses are used. `PENDING` completes the enum-like set for consistency with the frontend's `lib/constants.ts`.
- **Action:** KEEP -- add `// Justification: completes status enum for consistency with frontend constants (lib/constants.ts); used in database but not yet matched in Rust`

## Summary of Actions

| # | Location | Current State | Verdict | Action |
|---|----------|--------------|---------|--------|
| 1 | supabase.rs:98 `rpc_url()` | Unused in prod | KEEP | Add justification comment |
| 2 | supabase.rs:423 `rpc()` | Unused in prod | KEEP | Add justification comment |
| 3 | supabase.rs:447 `health_check()` | ACTIVELY USED | REMOVE | Delete annotation (it's wrong) |
| 4 | bjorn.rs:553 `BridgeBody.args` | Stub code, unused | KEEP | Add justification comment |
| 5 | auth.rs:598 `SignupBody` | Serde-constructed, disabled handler | KEEP | Add justification comment |
| 6 | media.rs:107 `PlexSession` | Serde-constructed, most fields used | REMOVE struct-level | Move to field-level on `player` with justification |
| 7 | media.rs:129 `PlexPlayer` | Serde-constructed, genuinely unused | KEEP | Add justification comment |
| 8 | media.rs:145 `SonarrEpisode` | Serde-constructed, ALL fields used | REMOVE | All fields are accessed |
| 9 | media.rs:158 `SonarrSeries` | Serde-constructed, `added` unused | REMOVE struct-level | Remove `added` field or add field-level justification |
| 10 | media.rs:168 `RadarrMovie` | Serde-constructed, `date_added` unused | REMOVE struct-level | Remove `date_added` field or add field-level justification |
| 11 | helpers.rs:208 `clean_env()` | Planned replacement, zero callers | KEEP | Add justification comment |
| 12 | terminal.rs:184 `PtyCleanup.master` | Used externally via Arc | KEEP | Update justification comment |
| 13 | agents.rs:15 `PENDING` | Completes status set, unused | KEEP | Add justification comment |

**Totals:** 5 annotations REMOVED (3 outright, 2 moved to field-level), 8 annotations KEPT with justification comments added.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Dead code detection | Manual grep analysis | `cargo check` warnings without `#[allow(dead_code)]` | Compiler analysis catches things grep misses |
| Serde field suppression | Custom deserialization | `#[allow(dead_code)]` with justification OR remove unused fields | serde skips unknown fields by default |

## Common Pitfalls

### Pitfall 1: Removing Serde Deserialization Fields That Break API Parsing
**What goes wrong:** Removing a field from a `#[derive(Deserialize)]` struct when the API response includes that field, and `#[serde(deny_unknown_fields)]` is present.
**Why it happens:** Confusion between "field not read by code" and "field not in API response."
**How to avoid:** Check for `deny_unknown_fields` before removing fields. In this codebase, none of the affected structs use it, so removing unused fields is safe.
**Warning signs:** Deserialization errors after field removal.

### Pitfall 2: Removing `health_check()` Annotation Causes New Warnings Elsewhere
**What goes wrong:** After removing `#[allow(dead_code)]` from `health_check()`, cargo check should compile cleanly since it IS used. If it doesn't, there may be a conditional compilation issue.
**Why it happens:** Different feature flags or `--no-default-features` may exclude `sync.rs`.
**How to avoid:** Run `cargo check` with the same flags as `cargo tauri dev` uses.
**Warning signs:** Warning appears after removing annotation.

### Pitfall 3: Breaking Compilation by Removing Struct Fields Used in Struct Literals
**What goes wrong:** Removing a field from a struct that is constructed somewhere with that field explicitly set.
**Why it happens:** Serde-only structs shouldn't have manual constructors, but tests might.
**How to avoid:** Grep for the struct name + field name before removing.
**Warning signs:** Compilation error "no field X on type Y."

## Code Examples

### Pattern: Justification Comment Format
```rust
// Source: project convention (established in this audit)
#[allow(dead_code)] // Justification: SupabaseClient API surface -- available for RPC calls from future routes
pub async fn rpc(&self, function: &str, body: Value) -> anyhow::Result<Value> { ... }
```

### Pattern: Field-Level Allow with Justification
```rust
// Source: project convention
#[derive(Debug, Deserialize)]
struct PlexSession {
    title: Option<String>,
    #[allow(dead_code)] // Justification: deserialized from Plex API; reserved for future player state display
    player: Option<PlexPlayer>,
    // ... other fields
}
```

### Pattern: Removing Struct-Level Allow When All Fields Are Used
```rust
// BEFORE:
#[derive(Debug, Deserialize)]
#[allow(dead_code)]  // <-- remove this
struct SonarrEpisode { ... }

// AFTER:
#[derive(Debug, Deserialize)]
struct SonarrEpisode { ... }
```

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | cargo test (built-in) |
| Config file | `src-tauri/Cargo.toml` |
| Quick run command | `cd src-tauri && cargo check` |
| Full suite command | `cd src-tauri && cargo test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| RUST-01a | No spurious `#[allow(dead_code)]` annotations | compile check | `cd src-tauri && cargo check 2>&1` | N/A (compiler) |
| RUST-01b | No new dead_code warnings after audit | clippy | `cd src-tauri && cargo clippy 2>&1 \| grep dead_code` | N/A (linter) |
| RUST-01c | All kept annotations have justification comments | grep audit | `grep -B1 'allow(dead_code)' src-tauri/src/**/*.rs \| grep -c Justification` | N/A (grep) |
| RUST-01d | No compilation regressions | cargo test | `cd src-tauri && cargo test` | Existing 231 tests |

### Sampling Rate
- **Per task commit:** `cd src-tauri && cargo check && cargo test`
- **Per wave merge:** `cd src-tauri && cargo test && cargo clippy`
- **Phase gate:** `cargo clippy 2>&1 | grep dead_code` returns zero results

### Wave 0 Gaps
None -- existing cargo test infrastructure covers all phase requirements.

## Sources

### Primary (HIGH confidence)
- Direct codebase analysis -- all 13 annotations examined with full call-site tracing
- `grep` across entire `src-tauri/src/` directory for usage of each annotated item
- Line-by-line reading of surrounding code context for each annotation

### Secondary (MEDIUM confidence)
- Rust reference on `#[allow(dead_code)]` behavior with serde derive macros (well-established pattern)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, existing tooling only
- Architecture: HIGH -- direct codebase analysis, all 13 annotations individually verified
- Pitfalls: HIGH -- verified through actual code examination, not speculation

**Research date:** 2026-03-24
**Valid until:** 2026-04-24 (stable -- Rust dead code analysis doesn't change between versions)
