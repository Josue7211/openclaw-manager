# Feature Landscape: v0.0.4 Stabilization & Strip

**Domain:** Codebase stabilization for a rapidly-built Tauri v2 + React 18 + Rust/Axum app
**Researched:** 2026-03-24
**Confidence:** HIGH (based on direct codebase analysis + verified gateway protocol docs)

## Context

v0.0.3 shipped 55 phases across 10 feature groups in ~2 days. The codebase grew from ~25K to ~74K lines (38K frontend + 35K backend). Many features were built against assumed API shapes, not verified against the actual OpenClaw gateway protocol. This research identifies every stabilization category, maps the specific issues found, and provides a prioritization framework for fix-vs-strip decisions.

---

## Stabilization Categories

### Category 1: Broken Gateway Integration (CRITICAL)

**What:** Backend routes call OpenClaw gateway methods that do not exist in the protocol. The frontend works against these broken backend routes. Nothing crashes -- the gateway just returns errors that get swallowed or shown as generic failures.

**Specific issues found in `src-tauri/src/routes/gateway.rs` and `approvals.rs`:**

| Current (Wrong) | Correct (Protocol v3) | Impact |
|------------------|-----------------------|--------|
| `sessions.history` | `chat.history` | Session history never loads |
| `sessions.send` | `chat.send` (params: sessionKey, message, deliver, idempotencyKey) | Cannot send messages to agents |
| `sessions.pause` | Does not exist in protocol | Route always errors |
| `sessions.resume` | Does not exist in protocol | Route always errors |
| `activity.recent` | Does not exist in protocol | Activity feed always empty |
| `exec.approvals.list` | `exec.approvals.get` | Approval queue never loads |
| `exec.approve` | `exec.approval.resolve` (with action: "approve") | Cannot approve executions |
| `exec.reject` | `exec.approval.resolve` (with action: "reject") | Cannot reject executions |
| `memory.search` | Not in the 88 documented methods | Memory search always fails |

**Connect handshake is also wrong:**
- Current: sends `{ auth: { type: "password", password: "..." } }`
- Correct: sends `{ minProtocol: 3, maxProtocol: 3, role: "operator", scopes: [...], client: { id, version, platform, mode }, auth: { token: "..." } }`

**Complexity:** MEDIUM -- method names and param shapes need updating, not architectural changes.
**Priority:** P0 -- this is the core value prop of the OpenClaw integration. Nothing works until these are fixed.

### Category 2: Dead Routes & Feature Stubs (HIGH)

**What:** Backend routes that serve no functional purpose, or frontend pages that call endpoints returning errors.

**Specific issues found:**

| Route/Feature | Status | Action |
|---------------|--------|--------|
| `POST /api/gateway/sessions/:id/pause` | Calls nonexistent `sessions.pause` | Strip entirely |
| `POST /api/gateway/sessions/:id/resume` | Calls nonexistent `sessions.resume` | Strip entirely |
| `GET /api/gateway/activity` | Calls nonexistent `activity.recent` | Strip or rewire to real event stream |
| `POST /api/gateway/memory/search` | Calls unverified `memory.search` | Verify against protocol, strip if nonexistent |
| noVNC dependency (`@novnc/novnc`) | VNC was rejected; user wants Moonlight/Sunshine | Strip noVNC, keep Sunshine TCP ping |
| `VncPreviewWidget.tsx` | References noVNC which was rejected | Strip or rename to SunshineWidget |
| `ffir` binary reference | Causes persistent error toast on every page | Find and remove the reference |

**Routes that exist but may have no frontend consumer (verify before stripping):**
- `routes/dlp.rs` -- Data Loss Prevention
- `routes/deploy.rs` -- Deployment management
- `routes/workspace.rs` -- Workspace management
- `routes/workflow_notes.rs` -- Workflow notes
- `routes/stale.rs` -- Stale item tracking
- `routes/reviews.rs` -- Code reviews
- `routes/decisions.rs` -- Decision logging
- `routes/changelog.rs` -- Changelog generation
- `routes/cache.rs` -- Cache management

**Complexity:** LOW per route, MEDIUM in aggregate (many files to audit).
**Priority:** P1 -- dead code obscures real code and increases maintenance burden.

### Category 3: API Shape Mismatches (HIGH)

**What:** Frontend types and hooks assume API response shapes that don't match what the gateway actually returns.

**Specific issues found:**

| File | Assumption | Reality |
|------|-----------|---------|
| `pages/openclaw/types.ts` -- `UsageData` | Expects `total_tokens`, `prompt_tokens`, etc. | Real shape is from `usage.status` / `usage.cost` -- needs verification |
| `pages/openclaw/types.ts` -- `ToolsResponse` | Expects `{ tools: ToolInfo[] }` | Gateway has no `/tools` HTTP endpoint -- tools are managed via skills/plugins |
| `pages/openclaw/types.ts` -- `SkillsResponse` | Expects `{ skills: SkillInfo[] }` | Real method is `skills.status` / `skills.bins` via WS, not HTTP GET |
| `hooks/useAgents.ts` | Calls `GET /api/agents` which reads from local SQLite | Real agents live on the gateway (`agents.list` WS method) -- dual source of truth |
| `hooks/useOpenClawModels.ts` | Calls `GET /api/openclaw/models` via HTTP forward | Real method is `models.list` via WS -- HTTP forward might work if gateway has REST API |

**Complexity:** MEDIUM -- requires testing each endpoint against the live gateway to determine actual response shapes.
**Priority:** P0 -- these pages render incorrectly or show "not configured" falsely.

### Category 4: Error Handling Gaps (MEDIUM)

**What:** Rapid development often skips robust error handling. Common patterns to audit.

**Areas to check:**

| Area | What to Audit | Likely Issues |
|------|---------------|---------------|
| Gateway WS disconnect during request | Does pending request cleanup happen? | Yes -- `drain_pending` exists, but error messages may be generic |
| Frontend error boundaries per page | Does each page have `PageErrorBoundary`? | Some v0.0.3 pages likely lack them |
| Loading/empty/error state consistency | Do all pages use `SkeletonList`/`EmptyState`/`ErrorState`? | v0.0.3 pages use ad-hoc loading indicators |
| Network offline handling | Does the offline queue handle gateway WS methods? | Offline queue is for REST, not WS |
| Toast error deduplication | Same error repeated on polling interval? | v0.0.3 bug: "ffir" error repeats on every page |
| Auth errors in browser mode | API calls without X-API-Key in dev mode | Known v0.0.3 bug -- browser mode lacks auth session |

**Complexity:** LOW per fix, MEDIUM in aggregate.
**Priority:** P2 -- user-facing quality issue, not a blocker.

### Category 5: Test Coverage Gaps (MEDIUM)

**What:** v0.0.3 features shipped with minimal test coverage for the new pages/hooks.

**Current test inventory:**
- 1039 frontend tests across 53 test files
- 231 Rust tests
- 21 E2E tests
- 23 TODO/FIXME/HACK annotations across 8 files

**Pages with NO test files (from v0.0.3):**

| Page/Feature | Lines | Test Files |
|--------------|-------|------------|
| `pages/openclaw/` (ModelsTab, ToolsTab, SkillsTab, UsageTab, BudgetSection) | ~600 | 0 |
| `pages/Agents.tsx` + agents/ subdirectory | ~500 | 1 (types only) |
| `pages/CronJobs.tsx` + crons/ subdirectory | ~400 | 1 (types only) |
| `pages/Status.tsx` | ~266 | 0 |
| `hooks/useAgents.ts` | 120 | 0 |
| `hooks/useOpenClaw*.ts` (4 hooks) | ~60 | 0 |
| `hooks/useCrons.ts` | ~120 | 0 |
| `hooks/useBudgetAlerts.ts` | ~50 | 0 |
| `components/widgets/TerminalWidget.tsx` | ~100 | 0 |
| `components/widgets/VncPreviewWidget.tsx` | ~80 | 0 |
| `components/widgets/OpenClawKpiWidget.tsx` | ~100 | 0 |
| `components/GatewayStatusDot.tsx` | ~60 | 0 |
| `components/ModelSelector.tsx` | ~80 | 0 |
| `gateway_ws.rs` (Rust) | ~450 | Minimal (compile test only) |
| `routes/approvals.rs` (Rust) | 113 | 0 |
| `routes/terminal.rs` (Rust) | ~200 | 0 |
| `routes/vnc.rs` (Rust) | 53 | 1 (shape test only) |

**Complexity:** LOW per test, HIGH in aggregate (~30 files need tests).
**Priority:** P2 -- tests prevent regressions during the fix phase, so ideally added before P0/P1 work, but pragmatically added during or after.

### Category 6: Accessibility Regressions (MEDIUM)

**What:** Rapid v0.0.3 development likely introduced accessibility violations.

**Areas to audit (based on CLAUDE.md rules):**

| Pattern | Where to Check | Common Violation |
|---------|----------------|------------------|
| `<div onClick>` instead of `<button>` | All v0.0.3 pages (agents, crons, openclaw tabs, terminal) | Not keyboard-navigable |
| Missing `aria-label` on icon buttons | Agent action buttons, cron controls, tab headers | Screen readers announce nothing |
| Missing `role="dialog"` on panels | AgentDetailPanel, approval modals | Not announced as dialogs |
| Missing focus trap on panels/modals | Any panel opened in v0.0.3 pages | Tab key escapes the panel |
| Missing `aria-live` for dynamic content | Terminal output, gateway status, session list updates | Changes not announced |
| Color contrast on status indicators | GatewayStatusDot, agent status badges | May fail WCAG AA |
| Missing keyboard shortcuts for new features | Terminal page, approval queue | Undiscoverable actions |

**Complexity:** LOW per fix (most are 1-2 line attribute additions).
**Priority:** P2 -- non-negotiable per CLAUDE.md, but not a functional blocker. Should be done as part of each page fix, not as a separate pass.

### Category 7: Unused Dependencies (LOW)

**What:** npm packages or Cargo crates installed but no longer needed.

**Suspicious dependencies in `package.json`:**

| Package | Status | Notes |
|---------|--------|-------|
| `@novnc/novnc` | Likely dead | VNC was rejected in favor of Sunshine/Moonlight |
| `@types/novnc__novnc` | Likely dead | Types for dead noVNC dependency |
| `@xterm/xterm` + addons | Active | Terminal widget uses these -- verify |
| `react-force-graph-2d` | Active | Notes graph view uses this |
| `canvas-confetti` | Active | Confetti on milestone completion |

**Complexity:** LOW -- `npm ls` / `depcheck` / `knip` can identify these automatically.
**Priority:** P3 -- cleanup, no functional impact.

### Category 8: Duplicate Widget Concerns (LOW)

**What:** Some widgets may overlap in functionality.

| Widget A | Widget B | Overlap? |
|----------|----------|----------|
| `NowPlayingWidget` | `MusicNowPlayingWidget` | Likely one is Plex, one is Koel -- verify |
| `AgentsSummaryWidget` | `AgentsCard` (dashboard) | May show same data in different formats -- acceptable |
| `PipelineStatusWidget` | `PipelineIdeasWidget` | Different data views of same system -- acceptable |

**Complexity:** LOW.
**Priority:** P3 -- cosmetic concern, not a blocker.

---

## Table Stakes (Must Do)

Features the stabilization milestone MUST deliver. Missing = milestone is not complete.

| Feature | Why Required | Complexity | Depends On |
|---------|-------------|------------|------------|
| Fix gateway connect handshake to protocol v3 | Nothing works without correct auth | MEDIUM | gateway_ws.rs |
| Fix all wrong gateway method names (9 methods) | Core OpenClaw pages broken | MEDIUM | gateway.rs, approvals.rs |
| Remove `sessions.pause`/`sessions.resume` routes | Call nonexistent methods | LOW | gateway.rs |
| Fix approvals to use `exec.approval.resolve` | Approval queue completely broken | LOW | approvals.rs |
| Fix "ffir" executable error toast | Persistent error on every page | LOW | Find source, remove |
| Verify and fix OpenClaw health/models/usage/tools/skills endpoints | Pages show "not configured" falsely | MEDIUM | Test against live gateway |
| Fix browser mode auth (dev mode API calls) | Can't develop without browser mode | LOW | Known v0.0.3 bug |
| Fix dashboard showing 1 widget in browser mode | Core UX broken in dev mode | LOW | Known v0.0.3 bug |
| Remove noVNC dependency and VncPreviewWidget | Dead dependency, rejected feature | LOW | package.json, widget registry |
| Remove or rename Bjorn tab duplication in Chat | UI confusion | LOW | Chat.tsx |
| Add error boundaries to all v0.0.3 pages | Crash resilience | LOW | Per page |

## Differentiators (Should Do)

Features that improve quality beyond minimum viable stabilization.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Add tests for all OpenClaw hooks/pages | Prevents regressions during fixes | MEDIUM | ~15 test files |
| Add Rust tests for gateway_ws.rs | Core infrastructure, high blast radius | HIGH | Mock WS server needed |
| Accessibility audit of all v0.0.3 pages | WCAG compliance per CLAUDE.md | LOW | Aria attributes, semantic HTML |
| Consistent loading/empty/error states | Visual consistency across all pages | MEDIUM | Use shared EmptyState/ErrorState components |
| Strip verified-dead backend routes | Reduce maintenance surface | LOW | After frontend consumer audit |
| Consolidate OpenClaw data sources (gateway WS vs local SQLite) | Single source of truth for agents | MEDIUM | Architecture decision needed |
| Run `knip` / `depcheck` for unused deps | Clean dependency tree | LOW | Automated |

## Anti-Features (Must NOT Do)

Features to explicitly NOT build during stabilization.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Add new pages or features | Stabilization means fixing, not building | Defer to v0.0.5+ |
| Rewrite gateway_ws.rs from scratch | Fix method names and handshake, don't redesign | Targeted edits only |
| Migrate away from CodeMirror to TipTap | v0.0.3 shipped notes with CodeMirror; migration is a separate milestone | Leave as-is |
| Add new widgets | Widget system works; adding more creates more surface to stabilize | Defer to v0.0.5+ |
| Refactor state management patterns | Working patterns shouldn't be touched during stabilization | Only fix what's broken |
| Performance optimization | Premature during stabilization -- fix correctness first | Defer unless blocking |
| Redesign page layouts | Visual changes create new bugs | Only fix broken layouts |

---

## Feature Dependencies

```
Fix gateway handshake (protocol v3)
  -> Fix all gateway method names
     -> Verify OpenClaw pages against real data
        -> Fix API shape mismatches in frontend types
        -> Add tests for corrected endpoints

Remove dead routes (pause/resume/activity)
  -> (no dependencies, can proceed in parallel)

Fix browser mode auth
  -> Fix dashboard widget rendering in browser mode
     -> (enables dev workflow for all other fixes)

Remove noVNC
  -> Update widget registry
  -> Remove VncPreviewWidget
  -> Remove npm packages

Fix "ffir" error
  -> (no dependencies, independent investigation)
```

---

## Prioritization Framework: Fix vs Strip vs Defer

Use this decision tree for every item discovered during stabilization:

### Step 1: Does it call a nonexistent API method?
- YES and is actively used by a page -> **FIX** (correct the method name/params)
- YES and no page uses it -> **STRIP** (dead code)

### Step 2: Does it cause a user-visible error?
- YES, on every page load (like "ffir") -> **FIX immediately** (P0)
- YES, on specific page -> **FIX** (P1)
- No visible error, just wrong data -> **FIX** (P1)

### Step 3: Is it dead code with no consumer?
- Backend route with no frontend caller -> **STRIP**
- Frontend component imported nowhere -> **STRIP**
- npm package imported nowhere -> **STRIP**
- Type definition used only by stripped code -> **STRIP**

### Step 4: Does it work correctly but could be better?
- Loading state is ad-hoc but functional -> **DEFER** (P3, nice-to-have)
- Missing aria-label but button works -> **FIX during page touch** (P2, do when touching the file anyway)
- No test but feature works -> **ADD test** (P2, do during or after fix)

### Step 5: Is it a design/architecture concern?
- Dual source of truth (SQLite + gateway) -> **DEFER** with documentation (architectural decision for v0.0.5)
- Inconsistent error handling patterns -> **DEFER** unless causing bugs
- Could be refactored for clarity -> **DEFER** (don't touch working code)

---

## MVP Recommendation

Prioritize in this order:

1. **Fix gateway connect handshake** -- everything else depends on this
2. **Fix browser mode auth** -- enables dev workflow for all subsequent fixes
3. **Fix all wrong gateway method names** (9 methods) -- unblocks OpenClaw pages
4. **Fix "ffir" error toast** -- most visible user-facing bug
5. **Strip dead routes** (pause/resume/activity) -- quick wins, reduces noise
6. **Remove noVNC and related code** -- dead dependency, rejected feature
7. **Fix Bjorn tab duplication** -- quick UX fix
8. **Verify OpenClaw pages against live gateway** -- validate fixes work end-to-end
9. **Fix API shape mismatches** -- based on real response shapes from step 8
10. **Add error boundaries to v0.0.3 pages** -- crash resilience
11. **Accessibility audit** -- do during each page touch, not as separate pass
12. **Add tests** -- add as you fix, not in a separate test-writing phase

**Defer:**
- Dashboard widget rendering in browser mode (fix auth first, may resolve itself)
- Unused dependency cleanup (run `knip` after stripping dead code)
- State management consolidation (document the problem, fix in v0.0.5)
- Performance work (not needed until correctness is achieved)

---

## Audit Checklists

### Per-Page Audit Checklist

For each page touched during stabilization:

- [ ] Page loads without errors (no console errors, no error toasts)
- [ ] Page shows real data from live services (not just compilation)
- [ ] Loading state uses `SkeletonList` or `Skeleton` (not ad-hoc spinner)
- [ ] Empty state uses `EmptyState` component (not inline text)
- [ ] Error state uses `ErrorState` component (not inline text)
- [ ] `PageErrorBoundary` wraps the page content
- [ ] All buttons are `<button>`, not `<div onClick>`
- [ ] Icon-only buttons have `aria-label`
- [ ] Modals/panels have `role="dialog"`, `aria-modal="true"`, focus trap
- [ ] No hardcoded colors (uses CSS variables)
- [ ] Demo mode fallback works (`isDemoMode()` check)

### Per-Route Audit Checklist (Rust)

For each backend route touched:

- [ ] Route uses correct gateway method name (verified against protocol v3)
- [ ] Route uses correct parameter names (verified against protocol v3)
- [ ] Route handles gateway WS not connected (returns descriptive error)
- [ ] Route handles gateway WS timeout (30s timeout exists)
- [ ] Error response sanitized (no internal IPs/paths leaked)
- [ ] `RequireAuth` guard present on all data endpoints
- [ ] Route has at least one unit test

### Dead Code Identification Checklist

- [ ] Run `cargo clippy --all-targets --all-features` -- check for unused imports/functions
- [ ] Run `npx knip` or `npx depcheck` -- check for unused npm packages
- [ ] Grep for components not imported anywhere
- [ ] Check widget registry for widgets that reference dead dependencies
- [ ] Check `routes/mod.rs` for routes not called by any frontend page

---

## Gateway Method Correction Reference

Complete mapping of wrong -> correct methods, derived from the verified OpenClaw Gateway Protocol v3 (88 RPC methods, 17 events):

| Category | Wrong Method | Correct Method | Correct Params |
|----------|-------------|----------------|----------------|
| Sessions | `sessions.history` | `chat.history` | `{ sessionKey, limit? }` |
| Sessions | `sessions.send` | `chat.send` | `{ sessionKey, message, deliver, idempotencyKey }` |
| Sessions | `sessions.pause` | *DOES NOT EXIST* | Strip route entirely |
| Sessions | `sessions.resume` | *DOES NOT EXIST* | Strip route entirely |
| Activity | `activity.recent` | *DOES NOT EXIST* | Strip or rewire to event subscription |
| Memory | `memory.search` | *NOT IN 88 METHODS* | Verify or strip |
| Approvals | `exec.approvals.list` | `exec.approvals.get` | `{}` |
| Approvals | `exec.approve` | `exec.approval.resolve` | `{ id, action: "approve" }` |
| Approvals | `exec.reject` | `exec.approval.resolve` | `{ id, action: "reject", reason? }` |

Additionally, the connect handshake must be updated:
- Add `minProtocol: 3`, `maxProtocol: 3`
- Add `role: "operator"`
- Add `scopes: ["operator.read", "operator.admin", "operator.approvals", "operator.pairing"]`
- Add `client: { id: "openclaw-manager", version: "0.0.4", platform: "rust", mode: "ui" }`
- Change auth from `{ type: "password", password }` to `{ token: password }`

---

## Sources

- Direct codebase analysis of `/home/josue/Documents/projects/mission-control` (367 frontend source files, 65 Rust source files)
- OpenClaw Gateway Protocol v3 reference (verified against live gateway, documented in memory `reference_openclaw_complete.md`)
- v0.0.3 post-ship bugs (documented in memory `project_v003_postship_bugs.md`)
- [Fix It, Flag It, or Forget It -- Technical Debt Triage Framework](https://stratechgist.com/p/fix-it-flag-it-or-forget-it-a-practical)
- [Knip -- Dead file/dependency detection for JS/TS](https://knip.dev/)
- [React dead code identification techniques](https://medium.com/@anjantalatatam/how-to-find-dead-code-in-a-react-application-%EF%B8%8F-dc401e4c75f6)
- [Cargo Clippy dead code detection](https://doc.rust-lang.org/rust-by-example/attribute/unused.html)
- [Secure Code Audit Checklist and Best Practices](https://www.codeant.ai/blogs/source-code-audit-checklist-best-practices-for-secure-code)
