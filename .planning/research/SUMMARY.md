# Project Research Summary

**Project:** OpenClaw Manager (mission-control) — v0.0.4 Stabilize & Strip
**Domain:** Post-rapid-development codebase stabilization (Tauri v2 + React 18 + Rust/Axum)
**Researched:** 2026-03-24
**Confidence:** HIGH

## Executive Summary

v0.0.4 is a stabilization milestone, not a feature milestone. The codebase grew from ~25K to ~74K lines in ~2 days (v0.0.3, 55 phases) and is now carrying critical correctness debt: the OpenClaw gateway integration uses wrong RPC method names in 9 places and sends an incorrect connect handshake, which means the core OpenClaw value proposition (sessions, approvals, usage, models, tools, skills) is entirely non-functional despite being visually present in the UI. The recommended approach is a strict "fix first, strip second" sequence — correcting broken integrations before removing any dead code, because wrong-but-structurally-correct code is far more valuable than no code.

The tooling story is clear and well-documented. Knip v6 (released 2026-03-24) + eslint-plugin-unused-imports covers the TypeScript dead code surface, cargo clippy + cargo-machete covers the Rust surface, and TypeScript `noUnusedLocals`/`noUnusedParameters` flags are free wins that just need to be enabled. The codebase has 473 frontend files and 72 Rust files across 47 registered route modules, 21 app modules, and 30+ widgets — the audit surface is large but well-defined and the tools can automate most of it.

The primary risks are not technical, they are process risks. The codebase has three layers of dynamic imports that defeat static analysis (widget registry, React.lazy pages, wizard steps), four `useSyncExternalStore` state chains that break silently when their contract is violated, and WebSocket CAS guards that cause permanent connection refusal if their RAII lifecycle is mishandled. Every significant pitfall in this milestone is a "compiles fine, breaks at runtime" pattern. Small batch commits with per-deletion verification are mandatory, not optional.

## Key Findings

### Recommended Stack

The tooling stack for dead code detection is fully decided and battle-tested. Knip v6 is the clear winner for TypeScript project-wide analysis — ts-prune (the prior art) is deprecated and its author recommends Knip. The eslint-plugin-unused-imports fills the specific gap Knip explicitly does not cover (per-file import cleanup). On the Rust side, cargo-machete is preferred over cargo-udeps because it requires no nightly compiler and runs in under 1 second — acceptable tradeoff for its regex-based false positive risk, which is mitigated by a short ignore list in `Cargo.toml`.

**Core technologies:**
- **knip v6**: Project-wide TypeScript dead code detection — best-in-class, 2-4x faster than v5 via oxc-parser, auto-detects Vite/Vitest, has `--fix` for automated export/dep removal
- **eslint-plugin-unused-imports v4**: Per-file import cleanup with autofix — fills the gap knip intentionally leaves (intra-file unused imports)
- **TypeScript `noUnusedLocals` + `noUnusedParameters`**: Zero-cost wins — already in tsconfig.app.json, just flip to `true`; caught by existing pre-commit `tsc --noEmit` check
- **cargo clippy + `dead_code` lint**: Built-in Rust dead code detection — 13 existing `#[allow(dead_code)]` annotations across 7 files are the primary audit targets
- **cargo-machete v0.9**: Fast Rust unused dependency detection — stable toolchain, <1s runtime; known `tauri-build` false positive requires one-line ignore in `Cargo.toml`

**Critical version requirements:** Knip v6 drops Node 18 support (project uses Node 20+, no issue). ESLint plugin v4 requires ESLint 9 flat config (project already uses it).

### Expected Features

The stabilization has 8 defined work categories with clear prioritization. Categories 1 and 2 (broken gateway integration and dead routes) are P0/P1 blockers. Categories 3-6 (API shape mismatches, error handling, test coverage, accessibility) are P2 quality work. Categories 7-8 (unused deps, duplicate widgets) are P3 cleanup.

**Must have (table stakes):**
- Fix gateway connect handshake to protocol v3 (wrong auth format blocks all WS RPC) — everything downstream depends on this
- Fix 9 wrong gateway method names (`sessions.history` -> `chat.history`, `sessions.send` -> `chat.send`, `exec.approve` -> `exec.approval.resolve`, etc.) — core OpenClaw pages are silently broken
- Fix "ffir" binary reference causing persistent error toast on every page load
- Remove `sessions.pause`/`sessions.resume` routes that call methods which do not exist in the protocol
- Fix browser mode auth (dev workflow is blocked without this)
- Remove noVNC dependency and VncPreviewWidget (rejected feature, dead dependency)
- Add PageErrorBoundary to all v0.0.3 pages that lack it

**Should have (differentiators):**
- Verify all OpenClaw pages against live gateway responses (usage, models, tools, skills)
- Fix API shape mismatches in frontend TypeScript types once real response shapes are confirmed
- Add tests for OpenClaw hooks/pages (currently 0 test files for ~600 lines of page code)
- Accessibility audit of all v0.0.3 pages (aria-label, role="dialog", focus traps)
- Consistent loading/empty/error states across all v0.0.3 pages using shared components
- Audit and strip verified-dead backend routes (`workspace.rs`, `decisions.rs`, `workflow_notes.rs` candidates)

**Defer (v0.0.5+):**
- Dual source of truth consolidation (agents live in both SQLite and gateway) — architectural decision, document and defer
- Performance optimization — correctness first
- New pages or features — stabilization scope is fix and strip only
- State management pattern refactoring — do not touch working code

### Architecture Approach

The recommended audit order is backend-first. The Rust compiler serves as a free first-pass auditor, gateway protocol correctness is a backend-only problem, and fixing backend routes may change response shapes that cascade to frontend — auditing backend first stabilizes the API contract before touching frontend consumers. The audit proceeds in 5 phases: backend route inventory, gateway integration fix, frontend dead code detection, frontend-backend binding cross-reference, and integration verification.

**Major components:**
1. **Gateway WS channel** (`gateway_ws.rs`, `routes/gateway.rs`) — correct WS RPC infrastructure, needs method name fixes only; do not remove or rewrite
2. **OpenClaw data routes** (`routes/openclaw_data.rs`) — currently uses HTTP channel for WS-only methods (`usage.status`, `models.list`, etc.); needs full rewrite to WS RPC
3. **Frontend OpenClaw hooks** (`hooks/useOpenClaw*.ts`, `hooks/sessions/*`) — architecturally sound React Query patterns; only endpoint paths and response shapes need correction
4. **Widget registry** (`widget-registry.ts`) — 30+ dynamic imports; all static analysis must treat this file as a secondary entry point alongside `main.tsx`
5. **Dead route candidates** — 9 route modules with low-confidence frontend consumers that need explicit external-caller audit before any deletion

**Key patterns to follow:**
- Fix-before-strip ordering: correct integrations before removing code
- Small batch deletions: one logical deletion per commit, verify app after each
- Dynamic import awareness: check widget registry, `main.tsx` lazy(), `LayoutShell.tsx` before flagging anything as unused
- External caller audit: backend routes may be called by CI pipelines, Supabase Realtime, or WebSocket clients — grep only catches frontend HTTP callers

### Critical Pitfalls

1. **Over-deleting dynamic imports** — Knip and grep cannot see widget registry factory functions or `React.lazy()` as consumers. The 30+ widget components and 29 lazy-loaded pages all have zero static importers. Before removing any file under `components/widgets/` or `pages/`, manually check `widget-registry.ts`, `main.tsx`, `LayoutShell.tsx`, and `SetupWizard.tsx`.

2. **Removing wrong-but-structural OpenClaw code** — The OpenClaw pages (agents, sessions, tools, models, skills, usage, approvals) have correct Axum route structure, correct React Query patterns, correct error handling, and correct accessibility. Only the method names and response shapes are wrong. Removing them destroys all the surrounding correct infrastructure. Sequence must be: fix integration, THEN strip if genuinely dead.

3. **Breaking widget registry integrity** — Dashboard state is persisted as JSON with widget `type` strings referencing registry keys. Removing a registry entry without a `lib/migrations.ts` migration entry creates dangling references that crash `WidgetWrapper` silently at runtime. Every removed widget type requires a corresponding dashboard state migration.

4. **Silent behavioral regressions from bulk commits** — The codebase has invisible dependency patterns: 49 React Query keys (string-matched cache invalidation), event-bus emitter/subscriber pairs, 15+ localStorage key strings, and 4 `useSyncExternalStore` chains. A large cleanup commit that passes all tests can still silently break sidebar badges, theme propagation, keyboard shortcuts, and notification sounds. One logical deletion per commit is a mandatory rule.

5. **WebSocket CAS guard lifecycle** — Three WebSocket endpoints use RAII connection guards (chat, sessions, terminal). If the guard is dropped before the WebSocket handler completes, the atomic counter never decrements. After N connections, the endpoint permanently refuses new connections until app restart. Verification must test the full connect -> use -> disconnect -> reconnect cycle for each WS endpoint.

## Implications for Roadmap

Based on research, the milestone has a natural 5-phase structure driven by the dependency chain: integration correctness must precede dead code detection, which must precede cross-layer binding verification, which must precede integration testing.

### Phase 1: Gateway Integration Fix
**Rationale:** Everything else in the milestone depends on gateway correctness. The connect handshake, 9 wrong method names, and `openclaw_data.rs` HTTP-vs-WS mismatch must be fixed before any page can be verified as working or broken. This is the root cause of multiple "this page doesn't work" reports.
**Delivers:** Correct WS RPC integration for sessions, approvals, usage, models, tools, skills, activity
**Addresses:** Category 1 (broken gateway integration) and part of Category 3 (API shape mismatches)
**Avoids:** Pitfall 5 (removing wrong-but-functional code before fixing it)

### Phase 2: Browser Mode & Dev Workflow Fixes
**Rationale:** Fixes browser mode auth and dashboard widget rendering in browser mode. Unblocks the development workflow for all subsequent verification phases — if dev mode is broken, per-page verification is painful and results are unreliable.
**Delivers:** Working development environment (browser mode auth, dashboard, ffir error toast removed)
**Addresses:** Known v0.0.3 bugs (ffir toast, browser mode auth, dashboard 1-widget bug)
**Avoids:** Compound debugging where dev mode bugs mask real integration bugs

### Phase 3: Dead Route Stripping
**Rationale:** Remove routes that call nonexistent methods (pause/resume) and audit low-confidence routes (workspace, decisions, workflow_notes, dlp, deploy). Must happen AFTER Phase 1 so that routes calling genuinely nonexistent methods are cleanly distinguished from routes that simply needed method name fixes.
**Delivers:** Reduced backend surface area, noVNC dependency removed, dead feature stubs stripped
**Uses:** Backend route inventory technique (static extraction from `routes/mod.rs` + frontend path cross-reference)
**Avoids:** Pitfall 2 (removing routes called by external systems — requires external caller audit before any deletion)

### Phase 4: Frontend Dead Code Detection
**Rationale:** Run Knip v6 + eslint-plugin-unused-imports + TypeScript strict flags after backend is stabilized. Frontend dead code audit is only reliable after backend API shapes are confirmed — some frontend types appear unused until the correct response shape is wired.
**Delivers:** Unused files, exports, deps, components, hooks removed; TypeScript strict flags enabled permanently
**Uses:** knip v6, eslint-plugin-unused-imports v4, TypeScript `noUnusedLocals`/`noUnusedParameters`
**Avoids:** Pitfall 1 (over-deleting dynamic imports — widget registry and lazy() check required before any deletion)

### Phase 5: Per-Page Integration Verification
**Rationale:** End-to-end verification of all 21 modules against real services. This phase catches integration issues that unit tests and type checks cannot — pages that compile and pass tests but show wrong data, wrong error states, or silent failures.
**Delivers:** All pages verified working (or gracefully degraded with correct error state), PageErrorBoundary on all pages, consistent loading/empty/error state components, accessibility audit complete
**Addresses:** Category 3 (API shapes), Category 4 (error handling), Category 6 (accessibility)
**Avoids:** Pitfall 3 (widget registry integrity — every page with widgets verified post-cleanup), Pitfall 4 (silent regressions caught by cross-component smoke tests)

### Phase Ordering Rationale

- Phase 1 before Phase 3: cannot distinguish "wrong method name" from "dead route" until integrations are corrected
- Phase 1 before Phase 4: frontend types look wrong against broken gateway responses; fix gateway first to see real shapes
- Phase 2 before Phases 3-5: dev workflow must work before per-page verification is reliable
- Phase 3 before Phase 4: removing dead backend routes may make corresponding frontend hooks genuinely unreachable; Knip runs after stripping to catch these cascades
- Phase 4 before Phase 5: dead code removal creates clean state to verify against
- Phase 5 last: integration verification is the final gate, not a midpoint checkpoint

### Research Flags

Phases likely needing live-gateway testing or deeper investigation during planning:
- **Phase 1:** `memory.search` is not in the 88 documented gateway methods — needs live gateway probe to determine if the method exists under a different name or should be stripped entirely
- **Phase 1:** `activity.recent` replacement — research suggests rewiring to an event subscription stream rather than a polling endpoint; needs verification against actual gateway event types
- **Phase 3:** External caller audit for `deploy.rs`, `cache.rs`, `pipeline/agents.rs` — need to inspect CI pipeline configs and OpenClaw VM scripts for calls to these endpoints before removing them

Phases with standard patterns (skip additional research):
- **Phase 2:** The ffir error and browser mode auth are known, well-scoped bugs with clear fix paths documented in FEATURES.md
- **Phase 4:** Knip v6 configuration is fully specified in STACK.md with a project-specific `knip.json` and ESLint config diff ready to apply
- **Phase 5:** Per-page audit checklist is fully defined in FEATURES.md (Per-Page Audit Checklist and Per-Route Audit Checklist sections)

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | knip v6 verified against official docs same day as research (2026-03-24, npm v6.0.4); cargo-machete verified against crates.io v0.9.1; all configs verified against actual project files (tsconfig.app.json, eslint.config.js, Cargo.toml) |
| Features | HIGH | Based on direct codebase analysis (44 route modules, 30+ widgets, 29 lazy pages, 106 test files) plus verified OpenClaw gateway protocol v3 (88 RPC methods); specific wrong method names confirmed against reference docs in project memory |
| Architecture | HIGH | Audit strategy derived from direct inspection of codebase structure; gateway HTTP-vs-WS mismatch confirmed by tracing actual code paths in `openclaw_data.rs` and `gateway.rs` |
| Pitfalls | HIGH | All 9 pitfalls derived from direct codebase analysis with specific file names, line counts, and runtime failure modes; not generic advice |

**Overall confidence:** HIGH

### Gaps to Address

- **`memory.search` method existence:** Not in the 88 documented gateway methods. During Phase 1, probe the live gateway to determine if this is a renamed method or genuinely nonexistent. Until confirmed, do not remove the frontend search UI — only correct or stub the backend handler.
- **Dual source of truth for agents:** `useAgents.ts` reads from local SQLite via `/api/agents`, but agents canonically live on the gateway (`agents.list` WS method). This architectural conflict is documented but deferred to v0.0.5. During Phase 5 verification, document the actual runtime behavior so v0.0.5 planning starts with a clear picture.
- **External caller inventory for pipeline routes:** `pipeline/agents.rs` and `deploy.rs` may be called by external CI/orchestration systems on the OpenClaw VM. Before Phase 3 stripping, audit the VM's pipeline scripts and any webhook configurations.
- **Widget registry Knip entry points:** Knip needs widget registry dynamic import factory functions declared as explicit entry points. The proposed `knip.json` in STACK.md handles `main.tsx` but the widget registry path needs explicit addition to avoid false positive "unused" reports on all 30+ widget components.

## Sources

### Primary (HIGH confidence)
- `/home/josue/Documents/projects/mission-control` — Direct codebase analysis (473 frontend files, 72 Rust files, 44 route modules, 30+ widgets, 29 lazy pages)
- [knip.dev](https://knip.dev/) — Official documentation, v6 release notes (2026-03-24), configuration reference, auto-fix docs
- [npm: knip v6.0.4](https://www.npmjs.com/package/knip) — Published 2026-03-24
- [GitHub: bnjbvr/cargo-machete v0.9.1](https://github.com/bnjbvr/cargo-machete) — README, known false positives, crates.io
- OpenClaw Gateway Protocol v3 reference — 88 RPC methods, 17 events (project memory: `reference_openclaw_complete.md`)
- Project CLAUDE.md — tsconfig.app.json flags, eslint.config.js structure, pre-commit.sh integration points

### Secondary (MEDIUM confidence)
- [GitHub: sweepline/eslint-plugin-unused-imports](https://github.com/sweepline/eslint-plugin-unused-imports) — ESLint 9 flat config compatibility confirmed
- [Effective TypeScript: Use Knip to detect dead code](https://effectivetypescript.com/2023/07/29/knip/) — knip vs ts-prune comparison, ts-prune deprecation confirmed
- [Rust by Example: dead_code](https://doc.rust-lang.org/rust-by-example/attribute/unused.html) — Built-in lint behavior
- Project memory `project_v003_postship_bugs.md` — Known v0.0.3 bug inventory

### Tertiary (LOW confidence)
- Rust 1.94.0 dead_code lint improvements (web search claims ~15% fewer false positives) — not verified against official release notes

---
*Research completed: 2026-03-24*
*Ready for roadmap: yes*
