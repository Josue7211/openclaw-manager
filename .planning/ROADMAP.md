# Roadmap: OpenClaw Manager

## Milestones

- v1.0 -- Publishable release (shipped 2026-03-21) -- [Full details](milestones/v1.0-ROADMAP.md)
- v0.0.2 -- Widget-First Architecture (shipped 2026-03-22)
- v0.0.3 -- AI Ops Center + OpenClaw Controller + Polish (shipped 2026-03-24)
- v0.0.4 -- Stabilize & Strip (in progress)

## Phases

### v0.0.4 -- Stabilize & Strip

**Group U: Dev Workflow Fixes** *(unblocks everything else)*
- [x] **Phase 56: Browser Mode Auth Fix** - Fix browser mode auth to work without Tauri shell for development (completed 2026-03-24)
- [ ] **Phase 57: ffir Error Toast Fix** - Resolve persistent "ffir" binary reference error toast on every page load

**Group V: Backend Dead Code Audit & Strip** *(Rust compiler assists, source of truth)*
- [ ] **Phase 58: Audit #[allow(dead_code)] Annotations** - Audit all 13 annotations across 7 Rust files, remove or justify each
- [ ] **Phase 59: Strip Unused Crate Dependencies** - Run cargo-machete and remove unused crates from Cargo.toml
- [ ] **Phase 60: Strip Dead Route Modules** - Remove backend route modules with zero frontend consumers after audit
- [ ] **Phase 61: Strip Nonexistent Gateway Methods** - Remove pause/resume routes that map to nothing in the gateway protocol

**Group W: Frontend Tooling Setup**
- [ ] **Phase 62: Configure knip for Dead Code Detection** - Set up knip v6 with entry points for lazy routes and widget registry

**Group X: Frontend Dead Code Strip** *(using knip results + manual audit)*
- [ ] **Phase 63: Strip noVNC Dependency** - Remove @novnc/novnc package and VncPreviewWidget.tsx (confirmed dead)
- [ ] **Phase 64: Strip TipTap/Project Tracker Stubs** - Remove all TipTap and Project Tracker stub references
- [ ] **Phase 65: Strip Unused File Exports** - Remove all unused file exports detected by knip
- [ ] **Phase 66: Strip Unused npm Dependencies** - Remove all unused npm dependencies detected by knip
- [ ] **Phase 67: Strip Unused Imports** - Clean all unused imports via eslint-plugin-unused-imports
- [ ] **Phase 68: Enable TypeScript Strict Flags** - Enable noUnusedLocals and noUnusedParameters, fix all violations

**Group Y: Test Coverage** *(after code is stable)*
- [ ] **Phase 69: OpenClaw Hook Tests** - Unit tests for useAgents, useCrons, useOpenClawStatus, useOpenClawModels
- [ ] **Phase 70: Terminal Hook Tests** - Unit tests for useTerminal, useSessionOutput
- [ ] **Phase 71: Gateway Integration Tests** - Integration tests for gateway status and health check paths

**Group Z: Final Verification** *(after everything else)*
- [ ] **Phase 72: Sidebar Module Smoke Test** - Verify every sidebar module loads without errors after cleanup
- [ ] **Phase 73: Widget Render Smoke Test** - Verify all 30+ widgets render without crashes after cleanup
- [ ] **Phase 74: Full Route Audit** - Verify no 404s, blank pages, or infinite loaders across all routes

## Phase Details

### Phase 56: Browser Mode Auth Fix
**Goal**: Developers can run the frontend in browser mode (npm run dev) and authenticate without needing the Tauri shell
**Depends on**: Nothing (first phase -- unblocks dev workflow)
**Requirements**: DEV-01
**Success Criteria** (what must be TRUE):
  1. Running `npm run dev` and opening localhost:5173 in a browser reaches the login page
  2. Developer can log in via browser mode and access all pages without Tauri-specific APIs failing
  3. No "window.__TAURI__" or similar errors in the browser console during normal usage
**Plans**: 1 plan
Plans:
- [ ] 56-01-PLAN.md -- Fix AuthGuard bypass, OAuth callback redirect, and browser-mode auth tests

### Phase 57: ffir Error Toast Fix
**Goal**: Clean page loads with zero unexpected error toasts
**Depends on**: Nothing (parallel with Phase 56)
**Requirements**: DEV-02
**Success Criteria** (what must be TRUE):
  1. Loading any page in the app produces zero error toasts
  2. The "ffir" binary reference is removed or conditionally guarded so it never fires in normal operation
  3. The browser console shows no uncaught errors related to missing binaries on page load
**Plans**: TBD

### Phase 58: Audit #[allow(dead_code)] Annotations
**Goal**: Every suppressed dead code warning in Rust has an explicit justification or is removed
**Depends on**: Phase 56 (dev workflow must be stable)
**Requirements**: RUST-01
**Success Criteria** (what must be TRUE):
  1. Each of the 13 `#[allow(dead_code)]` annotations has been individually reviewed
  2. Annotations on genuinely unused code are removed (and the dead code deleted or fixed)
  3. Annotations on code used via dynamic dispatch, FFI, or conditional compilation have a `// Justification:` comment
  4. `cargo clippy` passes with no new dead_code warnings after the audit
**Plans**: TBD

### Phase 59: Strip Unused Crate Dependencies
**Goal**: Cargo.toml contains only crates that are actually imported and used in the Rust source
**Depends on**: Phase 58 (dead code audit may remove code that was the only consumer of a crate)
**Requirements**: RUST-02
**Success Criteria** (what must be TRUE):
  1. `cargo-machete` reports zero unused dependencies (excluding known false positives like `tauri-build`)
  2. `cargo build` and `cargo test` pass after dependency removal
  3. Any false positives are documented in a `[package.metadata.cargo-machete]` ignore list in Cargo.toml
**Plans**: TBD

### Phase 60: Strip Dead Route Modules
**Goal**: Backend has no route modules that serve zero frontend or external consumers
**Depends on**: Phase 58 (dead code audit identifies candidates)
**Requirements**: RUST-03
**Success Criteria** (what must be TRUE):
  1. Each candidate dead route (workspace.rs, decisions.rs, dlp.rs, habits.rs, deploy.rs) has been audited for frontend callers, external callers (CI pipelines, webhooks), and WebSocket consumers
  2. Routes confirmed dead are removed from `routes/mod.rs` and their files deleted
  3. Routes with external consumers are documented with a `// Called by:` comment and kept
  4. `cargo build` passes and the app starts without route registration errors
**Plans**: TBD

### Phase 61: Strip Nonexistent Gateway Methods
**Goal**: No backend routes call gateway methods that do not exist in the protocol
**Depends on**: Phase 58 (dead code audit context)
**Requirements**: RUST-04
**Success Criteria** (what must be TRUE):
  1. `sessions.pause` and `sessions.resume` routes are removed (these methods do not exist in gateway protocol v3)
  2. Any frontend UI that called pause/resume is updated to remove or disable those buttons
  3. No Rust code references nonexistent gateway RPC method names
  4. `cargo build` passes after removal
**Plans**: TBD

### Phase 62: Configure knip for Dead Code Detection
**Goal**: knip v6 runs cleanly against the codebase with correct entry points so dynamic imports are not flagged as false positives
**Depends on**: Phase 57 (dev workflow stable before tooling setup)
**Requirements**: DEV-03
**Success Criteria** (what must be TRUE):
  1. `knip.json` exists with entry points for `main.tsx`, all lazy-loaded route files, widget registry factory functions, and wizard steps
  2. Running `npx knip` produces a report with zero false positives on known-used widget components and lazy pages
  3. The knip report identifies genuinely unused exports, files, and dependencies ready for cleanup
**Plans**: TBD

### Phase 63: Strip noVNC Dependency
**Goal**: The rejected noVNC feature is fully removed from the codebase
**Depends on**: Phase 62 (knip confirms noVNC is dead)
**Requirements**: DEAD-05
**Success Criteria** (what must be TRUE):
  1. `@novnc/novnc` is removed from package.json and node_modules
  2. `VncPreviewWidget.tsx` is deleted
  3. Any widget registry entry referencing VncPreviewWidget is removed with a corresponding `lib/migrations.ts` entry for dashboard state cleanup
  4. No import or reference to noVNC or VncPreviewWidget exists anywhere in the codebase
**Plans**: TBD

### Phase 64: Strip TipTap/Project Tracker Stubs
**Goal**: All deferred feature stubs are removed so they do not confuse developers or appear in search results
**Depends on**: Phase 62 (knip confirms these are dead)
**Requirements**: DEAD-06
**Success Criteria** (what must be TRUE):
  1. No TipTap package references exist in package.json
  2. No TipTap import statements exist in any TypeScript file
  3. No Project Tracker component, route, type, or hook reference exists in the codebase
  4. Any sidebar module entries for deferred features are removed from `sidebar-config.ts` and `modules.ts`
**Plans**: TBD

### Phase 65: Strip Unused File Exports
**Goal**: Every exported function, type, constant, and component in the frontend is imported by at least one consumer
**Depends on**: Phases 60, 61, 63, 64 (backend and known-dead stripping done first so knip results are accurate)
**Requirements**: DEAD-01
**Success Criteria** (what must be TRUE):
  1. `npx knip` reports zero unused exports (or all remaining are justified with `// knip:ignore` comments)
  2. Removed exports do not break any import chain (verified by `tsc --noEmit`)
  3. Each removal is a single-purpose commit for safe bisection
**Plans**: TBD

### Phase 66: Strip Unused npm Dependencies
**Goal**: package.json contains only packages that are actually imported somewhere in the source
**Depends on**: Phase 65 (unused exports removed first -- some deps may only be consumed by dead exports)
**Requirements**: DEAD-02
**Success Criteria** (what must be TRUE):
  1. `npx knip --include dependencies` reports zero unused dependencies
  2. `npm install` succeeds after removal
  3. `npm run build` produces a working bundle
  4. No runtime "module not found" errors when navigating all pages
**Plans**: TBD

### Phase 67: Strip Unused Imports
**Goal**: Every import statement in every TypeScript file is consumed within that file
**Depends on**: Phase 66 (dependency cleanup done first)
**Requirements**: DEAD-03
**Success Criteria** (what must be TRUE):
  1. ESLint with `eslint-plugin-unused-imports` reports zero unused import violations
  2. The autofix was applied in batches (not one giant commit) for safe bisection
  3. `tsc --noEmit` passes after all import cleanup
**Plans**: TBD

### Phase 68: Enable TypeScript Strict Flags
**Goal**: TypeScript compiler catches unused locals and parameters as errors, preventing future dead code accumulation
**Depends on**: Phase 67 (all existing unused imports cleaned first)
**Requirements**: DEAD-04
**Success Criteria** (what must be TRUE):
  1. `tsconfig.app.json` has `"noUnusedLocals": true` and `"noUnusedParameters": true`
  2. `tsc --noEmit` passes with zero violations
  3. The pre-commit hook (`scripts/pre-commit.sh`) catches any future violations before they are committed
**Plans**: TBD

### Phase 69: OpenClaw Hook Tests
**Goal**: Core OpenClaw data-fetching hooks have test coverage to prevent regressions during future gateway integration work
**Depends on**: Phase 68 (codebase is clean and stable before writing tests)
**Requirements**: TEST-01
**Success Criteria** (what must be TRUE):
  1. `useAgents` hook has tests covering: fetch success, fetch error, empty state, agent CRUD mutations
  2. `useCrons` hook has tests covering: fetch success, fetch error, create/toggle/delete mutations
  3. `useOpenClawStatus` hook has tests covering: connected, disconnected, and error states
  4. `useOpenClawModels` hook has tests covering: model list fetch and empty provider handling
  5. All tests pass via `npx vitest run`
**Plans**: TBD

### Phase 70: Terminal Hook Tests
**Goal**: Terminal and session output hooks have test coverage for WebSocket lifecycle edge cases
**Depends on**: Phase 68 (codebase is clean and stable)
**Requirements**: TEST-02
**Success Criteria** (what must be TRUE):
  1. `useTerminal` hook has tests covering: WebSocket connect, send input, receive output, resize, disconnect, reconnect
  2. `useSessionOutput` hook has tests covering: stream start, data arrival, stream end, error handling
  3. WebSocket mock properly simulates the connect/message/close lifecycle
  4. All tests pass via `npx vitest run`
**Plans**: TBD

### Phase 71: Gateway Integration Tests
**Goal**: Gateway connection health is verified by automated tests that catch regressions in the status/health endpoints
**Depends on**: Phase 68 (codebase is clean and stable)
**Requirements**: TEST-03
**Success Criteria** (what must be TRUE):
  1. Integration test verifies `/api/openclaw/health` returns correct status when gateway is reachable
  2. Integration test verifies `/api/openclaw/health` returns graceful error when gateway is unreachable
  3. Integration test verifies gateway WebSocket connection status is surfaced correctly via SSE
  4. All tests pass in CI (gateway may be mocked for CI environment)
**Plans**: TBD

### Phase 72: Sidebar Module Smoke Test
**Goal**: Every module registered in the sidebar loads its page component without crashing after all dead code removal
**Depends on**: Phases 68, 69, 70, 71 (all cleanup and tests complete)
**Requirements**: VERIFY-01
**Success Criteria** (what must be TRUE):
  1. Every enabled module in `modules.ts` resolves its lazy-loaded page component without import errors
  2. Clicking each sidebar item renders a page (not a blank screen, not an error boundary)
  3. No console errors related to missing components, hooks, or modules during navigation
**Plans**: TBD

### Phase 73: Widget Render Smoke Test
**Goal**: Every widget in the registry renders its default state without crashing after cleanup
**Depends on**: Phase 72 (sidebar modules verified first)
**Requirements**: VERIFY-02
**Success Criteria** (what must be TRUE):
  1. Every widget type in `widget-registry.ts` can be instantiated on a dashboard page
  2. No widget throws a runtime error during initial render (checked via error boundary catches)
  3. Widget registry has no dangling references to deleted components
  4. Dashboard state migrations handle any removed widget types gracefully
**Plans**: TBD

### Phase 74: Full Route Audit
**Goal**: Every route in the app resolves to a working page with no dead links, blank screens, or infinite loading states
**Depends on**: Phases 72, 73 (modules and widgets verified)
**Requirements**: VERIFY-03
**Success Criteria** (what must be TRUE):
  1. Every route defined in the React Router config resolves to a rendered page
  2. No route produces a 404, blank page, or uncaught error
  3. No page is stuck in an infinite loading state (loading states resolve within 10 seconds or show appropriate error/empty state)
  4. Navigation between all routes works (forward, back, sidebar click, direct URL)
**Plans**: TBD

## Progress

**Execution Order:** Groups execute in order: U -> V -> W -> X -> Y -> Z. Phases within a group can run in parallel where dependencies allow.

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 56. Browser Mode Auth Fix | v0.0.4 | 0/1 | Complete    | 2026-03-24 |
| 57. ffir Error Toast Fix | v0.0.4 | 0/? | Not started | - |
| 58. Audit #[allow(dead_code)] | v0.0.4 | 0/? | Not started | - |
| 59. Strip Unused Crates | v0.0.4 | 0/? | Not started | - |
| 60. Strip Dead Route Modules | v0.0.4 | 0/? | Not started | - |
| 61. Strip Nonexistent Gateway Methods | v0.0.4 | 0/? | Not started | - |
| 62. Configure knip | v0.0.4 | 0/? | Not started | - |
| 63. Strip noVNC | v0.0.4 | 0/? | Not started | - |
| 64. Strip TipTap/Project Tracker | v0.0.4 | 0/? | Not started | - |
| 65. Strip Unused Exports | v0.0.4 | 0/? | Not started | - |
| 66. Strip Unused npm Deps | v0.0.4 | 0/? | Not started | - |
| 67. Strip Unused Imports | v0.0.4 | 0/? | Not started | - |
| 68. Enable TS Strict Flags | v0.0.4 | 0/? | Not started | - |
| 69. OpenClaw Hook Tests | v0.0.4 | 0/? | Not started | - |
| 70. Terminal Hook Tests | v0.0.4 | 0/? | Not started | - |
| 71. Gateway Integration Tests | v0.0.4 | 0/? | Not started | - |
| 72. Sidebar Module Smoke Test | v0.0.4 | 0/? | Not started | - |
| 73. Widget Render Smoke Test | v0.0.4 | 0/? | Not started | - |
| 74. Full Route Audit | v0.0.4 | 0/? | Not started | - |

<details>
<summary>v0.0.3 -- AI Ops Center + OpenClaw Controller + Polish (55 phases) -- SHIPPED 2026-03-24</summary>

**Group A: Bug Verification** *(code-reviewed, verified)*
- [x] **Phase 1: Verify Widget Resize Fix** - Confirm widget resize handles work across all widget types *(verified 2026-03-23)*
- [x] **Phase 2: Verify Page Layout Fix** - Confirm full-bleed and scrolling pages work at all viewport sizes *(verified 2026-03-23)*
- [x] **Phase 3: Verify Widget Tab-Switch Fix** - Confirm widgets persist across page/tab navigation *(verified 2026-03-23)*
- [x] **Phase 4: Verify Widget Picker UX Fixes** - Confirm duplicates, animations, preset feedback, delete dialog *(verified 2026-03-23)*

**Group B: Infrastructure**
- [x] **Phase 5: Set CI Bundle Budget** - CI check failing if any chunk >400KB or total >5MB *(completed 2026-03-22)*

**Group C: Theme Blend**
- [x] **Phase 6: Theme Blend -- OKLCH Helpers** *(completed 2026-03-22)*
- [x] **Phase 7: Theme Blend -- Interpolation Engine** *(completed 2026-03-22)*
- [x] **Phase 8: Theme Blend -- Slider UI + Persistence** *(completed 2026-03-22)*

**Group D: OpenClaw Controller**
- [x] **Phase 9: OpenClaw Gateway Proxy Helper** *(completed 2026-03-22)*
- [x] **Phase 10: OpenClaw Agent Management** *(completed 2026-03-22)*
- [x] **Phase 11: OpenClaw Agent Calendar** *(completed 2026-03-22)*
- [x] **Phase 12: OpenClaw Usage + Models + Controller Page** *(completed 2026-03-22)*

**Group E: Terminal**
- [x] **Phase 13: Terminal PTY Backend** *(completed 2026-03-23)*
- [x] **Phase 14: Terminal Frontend (xterm.js)** *(completed 2026-03-23)*

**Group F: AI Ops Center**
- [x] **Phase 15: Claude Code Session Backend** *(completed 2026-03-23)*
- [x] **Phase 16: Session Monitor Frontend** *(completed 2026-03-23)*
- [x] **Phase 17: Remote VM Viewer** *(completed 2026-03-23)*

**Group G: Integration + Polish**
- [x] **Phase 18: Widget Registry + Sidebar Module Integration** *(completed 2026-03-23)*
- [x] **Phase 19: Final Verification + Bundle Audit** *(completed 2026-03-23)*

**Group H: Post-Ship Bug Fixes**
- [x] **Phase 19.1: Post-Ship Bug Fixes** *(verified 2026-03-23)*

**Group I: Critical Bug Fixes**
- [x] **Phase 20-24** *(committed 2026-03-23)*

**Group J-T: Gateway, Sessions, Tabs, Approvals, Skills, Monitoring, Memory, Models, Remote Desktop, Dashboard, Notes**
- [x] **Phases 25-55** *(committed 2026-03-23 to 2026-03-24)*

**Total:** 55 phases -- all complete

</details>

<details>
<summary>v0.0.2 -- Widget-First Architecture (7 phases) -- SHIPPED 2026-03-22</summary>

- [x] Phase 1: Fix Widget Bugs + Decouple Existing Cards (MH-01 through MH-04)
- [x] Phase 2: Convert Tier 1 Modules to Widgets (MH-05, MH-11, MH-14, MH-15)
- [x] Phase 3: Unify Personal + Dashboard Pages (MH-06)
- [x] Phase 4: Convert Tier 2 Modules to Widgets (MH-07, MH-11)
- [x] Phase 5: Category Presets + Widget Picker Enhancement (MH-08, MH-12)
- [x] Phase 6: Convert Tier 3 Modules -- Summary Widgets (MH-09, MH-15)
- [x] Phase 7: Remove DashboardDataContext + Cleanup (MH-10, MH-13)

**Total:** 7 phases, 15 requirements -- all complete

</details>

<details>
<summary>v1.0 (Phases 1-8 + 3 decimal insertions) -- SHIPPED 2026-03-21</summary>

- [x] Phase 1: Responsive Layout Shell + Visual Polish (5/5 plans)
- [x] Phase 2: Theming System (7/7 plans)
- [x] Phase 2.1: Theme Settings Page Polish + System Mode Fix (4/4 plans)
- [x] Phase 2.2: Theme System Mode Fixes (2/2 plans)
- [x] Phase 3: Setup Wizard + Onboarding (7/7 plans)
- [x] Phase 4: Dashboard Grid + Widget System (6/6 plans)
- [x] Phase 4.1: Wallbash GTK System Mode Integration Fix (2/2 plans)
- [x] Phase 5: Page Experience (3/3 plans)
- [x] Phase 6: Module Primitives Library (7/7 plans)
- [x] Phase 7: Bjorn Module Builder (7/7 plans)
- [x] Phase 8: Data Export (2/2 plans)

**Total:** 11 phases, 52 plans, 92 requirements -- all complete

</details>

---
*Roadmap created: 2026-03-19*
*Last updated: 2026-03-24*
