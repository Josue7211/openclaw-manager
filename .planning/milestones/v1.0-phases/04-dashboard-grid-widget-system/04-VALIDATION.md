---
phase: 04
slug: dashboard-grid-widget-system
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-20
---

# Phase 04 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.x |
| **Config file** | frontend/vitest.config.ts |
| **Quick run command** | `cd frontend && npx vitest run --no-coverage` |
| **Full suite command** | `cd frontend && npx vitest run --no-coverage` |
| **Estimated runtime** | ~7 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd frontend && npx vitest run --no-coverage`
- **After every plan wave:** Run `cd frontend && npx vitest run --no-coverage`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 04-01-01 | 01 | 1 | DASH-01 | unit | `npx vitest run src/lib/__tests__/widget-registry.test.ts` | ❌ W0 | ⬜ pending |
| 04-01-02 | 01 | 1 | DASH-02 | unit | `npx vitest run src/lib/__tests__/dashboard-store.test.ts` | ❌ W0 | ⬜ pending |
| 04-02-01 | 02 | 1 | DASH-03 | unit | `npx vitest run src/pages/dashboard/__tests__/DashboardGrid.test.tsx` | ❌ W0 | ⬜ pending |
| 04-03-01 | 03 | 2 | DASH-04 | unit | `npx vitest run src/pages/dashboard/__tests__/WidgetPicker.test.tsx` | ❌ W0 | ⬜ pending |
| 04-04-01 | 04 | 2 | DASH-05 | unit | `npx vitest run src/pages/dashboard/__tests__/WidgetWrapper.test.tsx` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Test files created as stubs during task execution
- [ ] Existing vitest infrastructure covers all phase requirements

*Existing infrastructure covers all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Drag-and-drop widget repositioning | DASH-03 | Browser interaction | Drag a widget, verify it snaps to grid |
| Resize handles work smoothly | DASH-04 | Browser interaction | Resize a widget, verify it snaps to valid sizes |
| Edit mode toggle reveals chrome | DASH-06 | Visual verification | Enter edit mode, verify grid lines and handles appear |
| Layout adapts to monitor change | DASH-09 | Multi-display | Move window between monitors, verify layout adapts |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
