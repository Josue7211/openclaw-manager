# Team Autonomous Execution — Design Spec

**Date:** 2026-03-24
**Status:** Approved
**Scope:** Replace serial `/gsd:autonomous` with supervisor-driven parallel agent teams

## Problem

Serial autonomous execution hits three recurring failure modes:

1. **Context exhaustion** — single agent loses track of earlier phases mid-milestone
2. **Quality gate skipping** — pressure to finish causes corners to be cut
3. **Wasted parallelism** — phases with no dependencies wait in line for no reason

## Solution

Upgrade `/gsd:autonomous` to a **supervisor workflow** where Claude acts as team lead, delegating implementation to parallel agent teams while managing merges, quality gates, and cross-phase consistency.

## Architecture

### Execution Model

```
┌──────────────────────────────────────────────────────────┐
│  SUPERVISOR (Claude — main context)                       │
│                                                           │
│  Responsibilities:                                        │
│  • Dependency graph analysis                              │
│  • Wave computation                                       │
│  • Agent spawning & monitoring                            │
│  • Worktree merge + conflict resolution                   │
│  • Quality gate enforcement (per-wave)                    │
│  • Blocker triage                                         │
│  • Cross-phase consistency checks                         │
│  • Progress reporting                                     │
│                                                           │
│  NEVER writes implementation code directly                │
└─────────┬───────────┬───────────┬────────────────────────┘
          │           │           │
    ┌─────▼─────┐ ┌───▼─────┐ ┌──▼──────┐
    │ Agent A   │ │ Agent B │ │ Agent C │  ← Wave N
    │ Phase X   │ │ Phase Y │ │ Phase Z │
    │ (worktree)│ │(worktree│ │(worktree│
    └───────────┘ └─────────┘ └─────────┘
```

### Workflow Steps

#### Step 1: Initialize & Analyze

Same as current autonomous: parse milestone, load roadmap, display banner.

**New:** Build dependency graph from ROADMAP `depends_on` fields.

**Dependency parsing rules:**
- `depends_on` is a free-text string in ROADMAP.md (e.g., "Phase 91", "Phase 91, Phase 93", "Nothing (v0.0.5 already shipped)")
- Extract phase numbers via regex: `/Phase (\d+(?:\.\d+)?)/gi`
- If no phase numbers found (e.g., "Nothing", empty, prose-only) → empty dependency set (phase has no prerequisites)
- Only consider dependencies within the current milestone's phase range
- Cross-milestone dependencies are assumed satisfied (prior milestone shipped)

#### Step 2: Batch Discuss

For all phases without CONTEXT.md, run **sequentially** (not parallel — discuss uses AskUserQuestion which requires serial user interaction):

- Infrastructure phases → auto-generate minimal context inline (no agent needed)
- UI/feature phases → run smart discuss one phase at a time, presenting grey area tables per phase
- If `workflow.skip_discuss=true` → auto-generate minimal context for all phases (no user interaction, fully parallelizable)

**Why sequential:** Even in autonomous mode, smart discuss presents grey area tables via AskUserQuestion. Multiple simultaneous question streams would block each other. The supervisor runs discuss for each phase in dependency order so later phases can reference earlier decisions.

**Optimization:** Infrastructure-only phases (detected by goal keywords: scaffolding, setup, migration, refactor) skip discuss entirely and get auto-generated minimal CONTEXT.md. This is already implemented in the existing autonomous.md.

#### Step 3: Batch Plan

For all discussed phases without plans:
- Identify independent phases (no shared dependencies)
- Spawn planner agents in parallel for independent phases
- Sequential for dependent phases (planner B needs planner A's output)
- Each planner gets: CONTEXT.md + RESEARCH.md + ROADMAP + REQUIREMENTS

#### Step 4: Compute Waves

**Two levels of parallelism (do not conflate):**
- **Cross-phase waves** (this step) — supervisor decides which phases run simultaneously
- **Intra-phase plan waves** (existing) — each executor agent manages plan-level parallelism within its phase using execute-phase.md's existing wave logic

The supervisor operates at phase granularity only. Each executor agent independently handles its own internal plan waves.

```
Input: Phase dependency graph (from Step 1 parsing)
Output: Ordered list of cross-phase waves, each containing 1-N phases

Algorithm:
1. Parse depends_on for each phase → extract phase number dependencies
2. Topological sort phases by parsed dependencies
3. Group phases at same topological depth into candidate waves
4. (Optional) Check aggregated files_modified across all plans in same-wave phases
5. If critical overlap detected (same file modified by both): move one phase to next wave
6. Accept trivial overlaps (route registration files, import files) — supervisor resolves at merge
7. Output: Wave 1 = [91], Wave 2 = [92, 96], Wave 3 = [93], etc.
```

**Smart routing:** If all phases are serial (each depends on previous), skip wave computation and execute one-at-a-time like current autonomous. If only one phase remains, execute directly without overhead.

#### Step 5: Execute Waves

For each wave:

**5a. Spawn agents**
- One `general-purpose` agent per phase in the wave (not `gsd-executor` — that's plan-level)
- Each agent gets `isolation: "worktree"` for file isolation
- Each agent's prompt: "Execute Phase N end-to-end using `/gsd:execute-phase N --no-transition`"
- The agent internally invokes execute-phase which handles its own plan-level waves, verification, and commits within the worktree
- Agents run in parallel via `run_in_background: true`
- The supervisor does NOT manage intra-phase plan waves — that's execute-phase's job

**Nesting model:** Supervisor → general-purpose agent (worktree) → Skill(gsd:execute-phase) → gsd-executor agents (plan-level). The worktree boundary ensures file isolation. Execute-phase manages its own internal merge cycle within the worktree branch. The supervisor only merges the final worktree result back to main.

**5b. Monitor & collect**
- Wait for all agents in wave to complete
- Collect results: SUMMARY.md, VERIFICATION.md, git changes

**5c. Merge worktrees**
- Merge each agent's worktree into main, one at a time
- If merge conflict: supervisor reads both SUMMARY.md files, resolves based on intent
- If resolution unclear: pick the simpler change, note for manual review

**5d. Quality gate (per-wave) — BLOCKING, must pass before spawning next wave**
- Compilation: `cargo check` + `tsc --noEmit` — zero errors
- Tests: `vitest run` + `cargo test` — all pass
- Clippy: no new warnings
- Cross-phase consistency: check shared files (see Supervisor Rule 7)
- Live browser test: agent-browser on all features from this wave
- If any gate fails: supervisor fixes inline, re-runs all gates, only then proceeds to next wave
- **This gate is the firewall between waves.** Next wave agents start from a known-good base.

**5e. Update state**
- Mark completed phases in ROADMAP.md
- Update STATE.md progress
- Re-read ROADMAP.md (catch inserted phases)

#### Step 6: Lifecycle

Same as current: audit → complete → cleanup.

### Merge Strategy

**Primary:** Git worktree merge (already supported by Agent tool).

**Conflict resolution priority:**
1. Route files (server.rs, main.tsx): append operations — merge both additions
2. Shared type files (types.ts): merge type additions, flag if same type modified differently
3. CSS/style files: merge both additions, check for variable conflicts
4. Config files: merge, prefer the phase that depends on the other

**Fallback:** If merge produces compilation errors, supervisor fixes inline. This is expected and normal — the cost of fixing a few import conflicts is far less than serializing everything.

### File Conflict Mitigation

At plan time, detect `files_modified` overlap:
- Overlapping files between phases in the same wave → warning to supervisor
- Supervisor can choose to: accept (will resolve at merge) or resequence (move phase to next wave)
- For this project: route files will always overlap. Accept and resolve — it's trivial.

### Quality Gates

No gates removed. One gate added:

| Gate | Scope | When |
|------|-------|------|
| Compilation | Per-agent | Agent's worktree, before completing |
| Tests | Per-agent | Agent's worktree, before completing |
| Compilation | Per-wave (NEW) | Main branch, after all wave merges |
| Tests | Per-wave (NEW) | Main branch, after all wave merges |
| Clippy | Per-wave (NEW) | Main branch, after all wave merges |
| Live browser | Per-wave (NEW) | Main branch, after all wave merges |
| Full app | Per-milestone | After all phases complete |

### Smart Routing

The workflow auto-detects the right mode:

```
dependency_graph = analyze(ROADMAP.phases)

if all_serial(dependency_graph):
    mode = "serial"  # Same as current autonomous
elif single_phase_remaining:
    mode = "direct"  # Skip overhead, execute inline
else:
    mode = "team"    # Parallel waves
```

Same `/gsd:autonomous` command. No new flags needed.

### Supervisor Rules

1. **Never write implementation code** — spawn agents for all code changes
2. **Always merge, never rebase** — preserves agent commit history
3. **Fix conflicts yourself** — don't re-spawn agents for merge issues
4. **Quality gates are non-negotiable** — wave doesn't advance on broken code
5. **Report between waves** — user sees progress banners with wave completion status
6. **Blocker triage** — if an agent fails: fix and retry once, then ask user
7. **Cross-phase consistency** — after merging all worktrees in a wave, check these specific files for coherence:
   - `src-tauri/src/server.rs` — all new routes registered, no duplicates, no missing imports
   - `frontend/src/main.tsx` or router config — all new pages routed, no duplicate paths
   - Shared type files (`types.ts`, `database.types.ts`) — no conflicting type definitions
   - `frontend/src/lib/query-keys.ts` — no duplicate query keys
   - Run `cargo check` + `tsc --noEmit` as the concrete coherence test — if it compiles, it's coherent

### Progress Reporting

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► AUTONOMOUS ▸ Wave 2/5 [████░░░░░░] 40%
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

 ◆ Phase 92 (Chat History) — executing in worktree
 ◆ Phase 96 (Session CRUD) — executing in worktree

 Wave 1: ✓ Phase 91 (Session List)
 Wave 2: ◆ Phase 92 + Phase 96 (in progress)
 Wave 3: ○ Phase 93 (Chat Send)
 Wave 4: ○ Phase 94 + 95 + 97
 Wave 5: ○ Phase 98
```

### Error Handling

| Scenario | Action |
|----------|--------|
| Agent fails (compilation) | Supervisor fixes in worktree, re-runs agent's remaining tasks |
| Merge conflict | Supervisor resolves based on SUMMARY.md intent |
| Post-merge tests fail | Supervisor fixes on main, re-runs tests |
| Agent hangs (no response) | Check for SUMMARY.md + git log in worktree (spot-check fallback). If work was done, treat as complete. If no progress, re-spawn fresh. Claude Code Task API does not support hard kills — rely on spot-check. |
| All agents in wave fail | Blocker → ask user |
| Cross-phase type mismatch | Supervisor unifies types on main after merge |

### v0.0.6 Wave Plan

```
Wave 1 (serial):  Phase 91 — Session List (foundation)
Wave 2 (parallel): Phase 92 — Chat History Display
                    Phase 96 — Session Rename, Delete, Compact
Wave 3 (serial):  Phase 93 — Chat Send with Token Streaming
Wave 4 (parallel): Phase 94 — Streaming UX Polish
                    Phase 95 — Model Picker for New Sessions
                    Phase 97 — Chat Abort & Stream Resilience
Wave 5 (serial):  Phase 98 — Real-time Session List Updates
```

## Implementation Plan

1. Modify `~/.claude/get-shit-done/workflows/autonomous.md` — restructure to supervisor model
2. Add dependency graph analysis to `gsd-tools.cjs` (or compute inline)
3. Add wave computation logic
4. Add per-wave merge + quality gate step
5. Test on v0.0.6 milestone

## What Stays the Same

- All existing GSD commands (`/gsd:plan-phase`, `/gsd:execute-phase`, etc.)
- Phase directory structure
- PLAN.md / SUMMARY.md / VERIFICATION.md format
- Quality gate definitions
- Blocker handling protocol
- Lifecycle (audit → complete → cleanup)
- Agent types and their responsibilities

## What Changes

- `/gsd:autonomous` becomes a supervisor, not a worker
- Phases execute in parallel waves, not serially
- Per-wave quality gate added (compilation + tests + live test on merged main)
- Merge conflict resolution is an explicit supervisor responsibility
- Batch discuss and batch plan steps added
- Progress reporting shows wave structure
