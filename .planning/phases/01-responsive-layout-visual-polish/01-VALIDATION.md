---
phase: 1
slug: responsive-layout-visual-polish
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-19
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 3.x (frontend), cargo test (backend) |
| **Config file** | `frontend/vitest.config.ts` |
| **Quick run command** | `cd frontend && npx vitest run --reporter=verbose` |
| **Full suite command** | `cd frontend && npx vitest run && cd ../src-tauri && cargo test` |
| **Estimated runtime** | ~45 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd frontend && npx vitest run --reporter=verbose`
- **After every plan wave:** Run `cd frontend && npx vitest run && cd ../src-tauri && cargo test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 45 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | LAYOUT-01..06 | visual + unit | `npx vitest run` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | POLISH-01 | grep audit | `grep -rn 'rgba\|#[0-9a-f]' --include='*.tsx' frontend/src/` | ✅ | ⬜ pending |
| TBD | TBD | TBD | POLISH-05..07 | unit | `npx vitest run` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | POLISH-02..04,08,09 | visual | manual | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `frontend/src/components/__tests__/EmptyState.test.tsx` — stubs for POLISH-07
- [ ] `frontend/src/components/__tests__/ErrorState.test.tsx` — stubs for POLISH-06
- [ ] `frontend/src/components/__tests__/LoadingState.test.tsx` — stubs for POLISH-05
- [ ] `frontend/src/components/__tests__/Toast.test.tsx` — stubs for toast component
- [ ] `frontend/src/components/__tests__/LayoutShell.test.tsx` — stubs for LAYOUT-01, LAYOUT-02

*Existing vitest infrastructure covers the framework requirement.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Window resize 900px→ultrawide without overflow | LAYOUT-01 | Visual layout verification | Resize window from 900px to max, check each page for overflow/clipping |
| Sidebar auto-collapse animation smoothness | LAYOUT-02 | Animation quality is subjective | Resize below 900px, verify smooth slide transition |
| Monitor switch 1080p↔1440p seamless | LAYOUT-04 | Requires multi-monitor setup | Move window between monitors, verify no layout breakage |
| Consistent spacing/typography across all pages | POLISH-02..04 | Visual design consistency check | Open each page, compare spacing, button styles, typography |
| Consistent icon style (Phosphor) | POLISH-08 | Visual icon consistency | Verify all icons are Phosphor, no Lucide remnants |
| Consistent border-radius/shadows | POLISH-09 | Visual consistency | Compare card/panel components across pages |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 45s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
