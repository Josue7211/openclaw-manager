# Team Autonomous Execution — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade `/gsd:autonomous` from serial phase execution to a supervisor-driven parallel agent team model with dependency graph analysis, wave computation, and per-wave quality gates.

**Architecture:** The existing `autonomous.md` workflow file gets restructured. Steps 1-2 (initialize, discover) stay mostly the same. A new step 2.5 computes waves from the dependency graph. Step 3 (execute) is replaced with a wave-based loop that spawns parallel agents in worktrees. Step 4 (iterate) becomes a per-wave quality gate + merge step. Everything else (smart_discuss, lifecycle, handle_blocker) is preserved.

**Tech Stack:** GSD workflow markdown, gsd-tools.cjs CLI, Claude Code Agent tool with worktree isolation.

**Spec:** `docs/superpowers/specs/2026-03-24-team-autonomous-design.md`

---

### Task 1: Add Dependency Graph & Wave Computation Step

**Files:**
- Modify: `~/.claude/get-shit-done/workflows/autonomous.md` (after step 2, before step 3)

- [ ] **Step 1: Read the current autonomous.md**

Read the full file to understand the exact insertion points.

- [ ] **Step 2: Add step 2.5 — Compute Dependency Graph & Waves**

Insert a new `<step name="compute_waves">` after `</step>` of `discover_phases` and before `<step name="execute_phase">`. Content:

```markdown
<step name="compute_waves">

## 2.5. Compute Dependency Graph & Waves

**Purpose:** Determine which phases can execute in parallel by analyzing `depends_on` fields from the ROADMAP.

### 2.5a. Parse Dependencies

For each incomplete phase, extract dependencies from the phase detail already fetched in step 2:

```bash
DETAIL=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" roadmap get-phase ${PHASE_NUM})
```

Parse the `depends_on` field from JSON. Normalize to phase numbers:
- Extract phase numbers via regex: match all occurrences of `Phase (\d+(?:\.\d+)?)` (case-insensitive)
- If no phase numbers found (e.g., "Nothing", empty, prose-only) → empty dependency set
- Only keep dependencies within the current milestone's incomplete phase set
- Cross-milestone dependencies are assumed satisfied

Build an internal dependency map:
```
deps = {
  91: [],           // no dependencies
  92: [91],         // depends on Phase 91
  93: [92],         // depends on Phase 92
  94: [93],         // depends on Phase 93
  95: [93],         // depends on Phase 93
  96: [91],         // depends on Phase 91
  97: [93],         // depends on Phase 93
  98: [91, 93],     // depends on Phase 91 and Phase 93
}
```

### 2.5b. Topological Sort into Waves

Algorithm:
1. Initialize `wave_number = 1`, `assigned = {}`, `waves = []`
2. Loop while unassigned phases remain:
   a. Find all phases whose dependencies are ALL in `assigned` (or have no dependencies)
   b. If none found → circular dependency error → fall back to serial mode
   c. Group these phases into `waves[wave_number]`
   d. Add all grouped phases to `assigned`
   e. Increment `wave_number`
3. Result: ordered list of waves, each containing 1-N phase numbers

### 2.5c. Smart Routing Decision

```
if len(waves) == len(incomplete_phases):
    mode = "serial"    # Every wave has exactly 1 phase — no parallelism possible
elif len(incomplete_phases) == 1:
    mode = "direct"    # Single phase — skip overhead
else:
    mode = "team"      # At least one wave has 2+ phases
```

Display routing decision:

**Serial mode:**
```
Mode: Serial (all phases depend on previous — no parallelism possible)
```

**Team mode:**
```
Mode: Team (${num_waves} waves, max ${max_parallel} phases in parallel)

Wave Plan:
| Wave | Phases | Mode |
|------|--------|------|
| 1    | 91     | serial |
| 2    | 92, 96 | parallel (2 agents) |
| 3    | 93     | serial |
| 4    | 94, 95, 97 | parallel (3 agents) |
| 5    | 98     | serial |
```

</step>
```

- [ ] **Step 3: Commit**

```bash
git add ~/.claude/get-shit-done/workflows/autonomous.md
git commit -m "feat(gsd): add dependency graph and wave computation to autonomous"
```

---

### Task 2: Restructure Execute Step for Wave-Based Execution

**Files:**
- Modify: `~/.claude/get-shit-done/workflows/autonomous.md` (replace step 3 execute_phase)

- [ ] **Step 1: Read current execute_phase step**

Read lines 109-329 of autonomous.md to understand the current serial execution logic.

- [ ] **Step 2: Replace execute_phase with wave-based execution**

Replace the `<step name="execute_phase">` block with a new version that handles both serial and team modes. The new step:

**For serial mode:** Preserve existing behavior exactly — discuss → plan → execute one phase at a time. The existing code for smart_discuss, plan, execute, and post-execution routing stays unchanged.

**For team mode:** Execute one wave at a time:

```markdown
<step name="execute_wave">

## 3. Execute Waves

**If mode is "serial" or "direct":** Use the original serial execution logic (step 3-serial below).

**If mode is "team":** Execute waves in order.

For each wave, display the wave progress banner:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► AUTONOMOUS ▸ Wave {W}/{TW} [████░░░░░░] {P}%
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

 {For each phase in this wave:}
 ◆ Phase {N} ({Name}) — {status}

 {For completed waves:}
 Wave {W}: ✓ Phase {N} ({Name}), Phase {M} ({Name})
 {For current wave:}
 Wave {W}: ◆ {phases} (in progress)
 {For future waves:}
 Wave {W}: ○ {phases}
```

### 3a. Pre-Wave: Discuss & Plan All Phases in This Wave

For each phase in the current wave (sequentially — discuss is interactive):

1. **Smart Discuss** — if CONTEXT.md missing, run smart_discuss for this phase (same logic as serial mode step 3a)
2. **Plan** — `Skill(skill="gsd:plan-phase", args="${PHASE_NUM}")` (same as serial mode step 3b)

Verify each phase has both context and plans before proceeding to execution.

### 3b. Spawn Parallel Agents

**If wave has 1 phase:** Execute serially (same as serial mode — use Skill directly):
```
Skill(skill="gsd:execute-phase", args="${PHASE_NUM} --no-transition")
```

**If wave has 2+ phases:** Spawn one agent per phase in parallel:

For each phase in the wave, launch an Agent:
```
Agent(
  description="Execute Phase {N}: {Name}",
  subagent_type="general-purpose",
  isolation="worktree",
  run_in_background=true,
  prompt="You are executing Phase {N}: {Name} of milestone {milestone_version}.

Your task: Run /gsd:execute-phase {N} --no-transition

This will execute all plans for Phase {N}, run verification, and commit results.

Important:
- You are in an isolated worktree — commit freely
- Run quality gates (compilation + tests) before completing
- If verification finds gaps, attempt gap closure once
- Return your final status: PASSED, GAPS_FOUND, or FAILED

Project instructions: Read ./CLAUDE.md if it exists."
)
```

### 3c. Collect Results

Wait for all agents in the wave to complete (they were launched with `run_in_background: true` — the system notifies when each completes).

For each completed agent:
- If the agent returned worktree changes: note the worktree path and branch for merge
- If the agent returned with no changes: the worktree was auto-cleaned — check if SUMMARY.md exists in the phase directory on main (spot-check fallback)
- If the agent failed: note the failure for blocker handling

### 3d. Merge Worktrees

For each agent that produced changes (has a worktree branch):

```bash
# Merge the agent's worktree branch into main
git merge {worktree_branch} --no-edit
```

**If merge succeeds:** Continue to next worktree.

**If merge conflict:**
1. Read the conflict markers in each conflicting file
2. Read SUMMARY.md from both phases to understand intent
3. Resolve conflicts:
   - Route files (server.rs, main.tsx): keep both additions, fix imports
   - Type files: merge type definitions, ensure no duplicates
   - CSS: keep both additions
   - Other: prefer the phase with the longer dependency chain
4. Stage resolved files and complete the merge:
   ```bash
   git add {resolved_files}
   git commit --no-edit
   ```

After all worktrees merged, display:
```
Wave {W}: Merged {N} worktrees into main
{If conflicts: "Resolved {C} merge conflicts in: {file_list}"}
```

### 3e. Cross-Phase Consistency Check

After merging all worktrees in a wave, verify shared files are coherent:

```bash
# Check route registration — no duplicates
grep -c "\.route\|\.merge\|Router::new" src-tauri/src/server.rs 2>/dev/null
# Check for duplicate query keys
grep -c "queryKeys\." frontend/src/lib/query-keys.ts 2>/dev/null
# Compilation is the ultimate coherence test
CARGO_TARGET_DIR=/tmp/mc-target cargo check --manifest-path src-tauri/Cargo.toml 2>&1
cd frontend && npx tsc --noEmit --project tsconfig.app.json 2>&1 && cd ..
```

If compilation fails after merge: supervisor fixes inline (import conflicts, duplicate declarations, etc.), commits the fix, re-runs compilation until clean.

Proceed to per-wave quality gate (step 4).

</step>
```

- [ ] **Step 3: Preserve serial execution as a sub-step**

Keep the original serial execution logic (smart_discuss → plan → execute → post-execution routing) as `<step name="execute_phase_serial">` referenced when `mode == "serial"`. This is the existing step 3 renamed, not deleted.

- [ ] **Step 4: Commit**

```bash
git add ~/.claude/get-shit-done/workflows/autonomous.md
git commit -m "feat(gsd): wave-based parallel execution in autonomous mode"
```

---

### Task 3: Update Quality Gate to Per-Wave Scope

**Files:**
- Modify: `~/.claude/get-shit-done/workflows/autonomous.md` (step 4 iterate)

- [ ] **Step 1: Read current iterate step**

Read lines 615-722 of autonomous.md.

- [ ] **Step 2: Update iterate step for wave-based execution**

The iterate step currently runs after each individual phase. In team mode, it runs after each wave instead. Modify the step:

**Serial mode:** No change — quality gate runs after each phase (existing behavior).

**Team mode:** Quality gate runs after all phases in a wave are merged:

```markdown
## 4. Per-Wave Quality Gate

**4a. MANDATORY Compilation + Tests**

(Same commands as existing step 4a — cargo check, tsc, vitest, cargo test, clippy)

**CRITICAL:** In team mode, this runs on the MERGED main branch, not individual worktrees. This catches cross-phase regressions that individual agents can't see.

**If compilation or tests fail:** STOP. Supervisor fixes inline. Do NOT spawn next wave on broken code.

**4b. MANDATORY Live Browser Verification**

(Same as existing step 4b — agent-browser on all features from ALL phases in this wave)

For team mode, test features from every phase in the wave, not just one phase.

**4c. Re-read ROADMAP and advance**

(Same as existing step 4c)

In team mode: if more waves remain, loop back to step 3 for the next wave.
If all waves complete, proceed to lifecycle step.
```

- [ ] **Step 3: Commit**

```bash
git add ~/.claude/get-shit-done/workflows/autonomous.md
git commit -m "feat(gsd): per-wave quality gates for team execution"
```

---

### Task 4: Update Progress Reporting & Banner Format

**Files:**
- Modify: `~/.claude/get-shit-done/workflows/autonomous.md` (banners in steps 1, 2.5, 3)

- [ ] **Step 1: Update startup banner**

Add mode detection result to the startup banner:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► AUTONOMOUS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

 Milestone: {milestone_version} — {milestone_name}
 Phases: {phase_count} total, {completed_phases} complete
 Mode: {Serial | Team (N waves, max M parallel)}
```

- [ ] **Step 2: Add wave progress banner to execute_wave step**

Already included in Task 2. Verify it shows:
- Current wave number and total waves
- Per-phase status within the wave
- Historical wave completion status
- Progress bar based on phases completed / total

- [ ] **Step 3: Commit**

```bash
git add ~/.claude/get-shit-done/workflows/autonomous.md
git commit -m "feat(gsd): wave-aware progress banners for autonomous mode"
```

---

### Task 5: Update Success Criteria

**Files:**
- Modify: `~/.claude/get-shit-done/workflows/autonomous.md` (success_criteria section)

- [ ] **Step 1: Add team-mode success criteria**

Append to the existing success_criteria block:

```markdown
- [ ] Dependency graph parsed from ROADMAP depends_on fields (free-text normalized to phase numbers)
- [ ] Waves computed via topological sort (phases at same depth grouped)
- [ ] Smart routing: serial mode when all phases linear, team mode when parallelism possible
- [ ] Team mode: parallel agents spawned in worktrees (one per phase per wave)
- [ ] Team mode: worktrees merged sequentially after wave completes
- [ ] Team mode: merge conflicts resolved by supervisor based on SUMMARY.md intent
- [ ] Team mode: cross-phase consistency check after merge (compilation as coherence test)
- [ ] Per-wave quality gate: compilation + tests + clippy + live browser on merged main
- [ ] Wave does not advance on broken code — supervisor fixes before next wave
- [ ] Serial fallback: if all phases are linear, behaves identically to previous autonomous
- [ ] Discuss runs sequentially even in team mode (AskUserQuestion is interactive)
- [ ] Plan can run in parallel for independent phases (planners don't touch code)
- [ ] Each executor agent manages its own intra-phase plan waves via execute-phase
- [ ] Supervisor never writes implementation code — only merge fixes and quality gate fixes
```

- [ ] **Step 2: Commit**

```bash
git add ~/.claude/get-shit-done/workflows/autonomous.md
git commit -m "feat(gsd): team-mode success criteria for autonomous workflow"
```

---

### Task 6: Integration Test — Verify with v0.0.6

**Files:**
- Read: `~/.claude/get-shit-done/workflows/autonomous.md` (verify complete file)
- Read: `.planning/ROADMAP.md` (verify wave computation with real data)

- [ ] **Step 1: Read the final autonomous.md**

Verify all steps are present and properly connected:
1. Initialize (unchanged)
2. Discover phases (unchanged)
2.5. Compute waves (NEW)
3. Execute waves (NEW — with serial fallback)
3-serial. Execute phase serial (preserved original)
Smart discuss (unchanged)
4. Per-wave quality gate (updated)
5. Lifecycle (unchanged)
6. Handle blocker (unchanged)

- [ ] **Step 2: Dry-run wave computation with v0.0.6 data**

Manually trace the algorithm with v0.0.6 phases:
```
Phase 91: depends_on = "Nothing" → deps = []
Phase 92: depends_on = "Phase 91" → deps = [91]
Phase 93: depends_on = "Phase 92" → deps = [92]
Phase 94: depends_on = "Phase 93" → deps = [93]
Phase 95: depends_on = "Phase 93" → deps = [93]
Phase 96: depends_on = "Phase 91" → deps = [91]
Phase 97: depends_on = "Phase 93" → deps = [93]
Phase 98: depends_on = "Phase 91, Phase 93" → deps = [91, 93]

Wave 1: [91] — no deps
Wave 2: [92, 96] — both only depend on 91 (in Wave 1)
Wave 3: [93] — depends on 92 (in Wave 2)
Wave 4: [94, 95, 97] — all depend on 93 (in Wave 3)
Wave 5: [98] — depends on 91 (Wave 1) and 93 (Wave 3) — both satisfied
```

Verify this matches the spec's expected wave plan.

- [ ] **Step 3: Verify serial fallback**

If a milestone had phases: A → B → C → D (each depends on previous):
```
Wave 1: [A] — no deps
Wave 2: [B] — depends on A
Wave 3: [C] — depends on B
Wave 4: [D] — depends on C
```

4 waves, 4 phases → `mode = "serial"` — correct.

- [ ] **Step 4: Final review of autonomous.md for consistency**

Check:
- No orphaned step references
- All step names match cross-references
- Smart discuss step still referenced correctly
- Handle blocker still covers all failure modes
- Lifecycle step still invoked after all waves complete
