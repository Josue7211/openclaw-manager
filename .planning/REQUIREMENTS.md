# Requirements: OpenClaw Manager

**Defined:** 2026-03-24
**Core Value:** AI agent (Bjorn) builds, previews, and hot-reloads custom modules inside the running app -- making it infinitely extensible without writing code.

## v0.0.4 Requirements

Requirements for stabilization milestone. Each maps to roadmap phases.

### Dead Code -- Frontend

- [x] **DEAD-01**: All unused file exports detected by knip are removed or justified
- [ ] **DEAD-02**: All unused npm dependencies detected by knip are removed from package.json
- [x] **DEAD-03**: All unused imports cleaned via eslint-plugin-unused-imports
- [ ] **DEAD-04**: TypeScript strict flags `noUnusedLocals` and `noUnusedParameters` enabled and passing
- [x] **DEAD-05**: noVNC dependency (`@novnc/novnc`) and `VncPreviewWidget.tsx` removed
- [ ] **DEAD-06**: All TipTap/Project Tracker stub references removed

### Dead Code -- Backend

- [x] **RUST-01**: All 13 `#[allow(dead_code)]` annotations audited -- remove or justify each
- [ ] **RUST-02**: Unused crate dependencies detected by cargo-machete are removed from Cargo.toml
- [x] **RUST-03**: Backend route modules with zero frontend consumers removed (workspace.rs, decisions.rs, dlp.rs, habits.rs, deploy.rs -- after audit)
- [x] **RUST-04**: Nonexistent gateway methods removed (pause/resume routes that map to nothing)

### Dev Workflow

- [x] **DEV-01**: Browser mode auth works without Tauri shell for development
- [x] **DEV-02**: Persistent "ffir" error toast resolved -- no error toasts on clean page load
- [x] **DEV-03**: knip configured with entry points for lazy-loaded routes and widget registry

### Test Coverage

- [x] **TEST-01**: OpenClaw hooks (useAgents, useCrons, useOpenClawStatus, useOpenClawModels) have unit tests
- [ ] **TEST-02**: Terminal hooks (useTerminal, useSessionOutput) have unit tests
- [x] **TEST-03**: Gateway status and health check paths have integration tests

### Verification

- [ ] **VERIFY-01**: Every sidebar module loads without errors after dead code removal
- [ ] **VERIFY-02**: All 30+ widgets render without crashes after cleanup
- [ ] **VERIFY-03**: No 404s, blank pages, or infinite loaders across all routes

## Future Requirements

### Gateway Integration (v0.0.5)

- **GW-01**: Connect handshake uses protocol v3 with role/scopes/client metadata
- **GW-02**: All 9 wrong RPC method names corrected (sessions.history->chat.history, etc.)
- **GW-03**: SSE event bus wired to real gateway WS events
- **GW-04**: All OpenClaw tabs verified against live gateway with real data
- **GW-05**: Activity feed wired to real gateway events (not assumed activity.recent)

## Out of Scope

| Feature | Reason |
|---------|--------|
| New features / modules | Stabilization only -- no new functionality |
| Gateway protocol fixes | Deferred to v0.0.5 as its own milestone |
| TipTap editor migration | Deferred from v0.0.3, remains deferred |
| Project Tracker | Deferred from v0.0.3, remains deferred |
| Mobile app | Web-first desktop app |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| DEV-01 | Phase 56 | Complete |
| DEV-02 | Phase 57 | Complete |
| RUST-01 | Phase 58 | Complete |
| RUST-02 | Phase 59 | Pending |
| RUST-03 | Phase 60 | Complete |
| RUST-04 | Phase 61 | Complete |
| DEV-03 | Phase 62 | Complete |
| DEAD-05 | Phase 63 | Complete |
| DEAD-06 | Phase 64 | Pending |
| DEAD-01 | Phase 65 | Complete |
| DEAD-02 | Phase 66 | Pending |
| DEAD-03 | Phase 67 | Complete |
| DEAD-04 | Phase 68 | Pending |
| TEST-01 | Phase 69 | Complete |
| TEST-02 | Phase 70 | Pending |
| TEST-03 | Phase 71 | Complete |
| VERIFY-01 | Phase 72 | Pending |
| VERIFY-02 | Phase 73 | Pending |
| VERIFY-03 | Phase 74 | Pending |

**Coverage:**
- v0.0.4 requirements: 19 total
- Mapped to phases: 19
- Unmapped: 0

---
*Requirements defined: 2026-03-24*
*Last updated: 2026-03-24 after roadmap creation*
