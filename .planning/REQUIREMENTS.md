# Requirements: OpenClaw Manager

**Defined:** 2026-03-19
**Core Value:** Every external service proxied through local Axum server. Secrets in OS keychain.

## v0.1.0 Requirements

Requirements for onboarding wizard redesign. Each maps to roadmap phases.

### Wizard Flow

- [ ] **FLOW-01**: User can navigate forward and back without losing entered values
- [ ] **FLOW-02**: User sees a progress indicator showing current step and total steps
- [ ] **FLOW-03**: User can skip to demo mode from any step in the wizard
- [ ] **FLOW-04**: Pre-existing values from .env.local / OS keychain are pre-filled in all fields
- [ ] **FLOW-05**: User's field entries are saved to OS keychain when clicking Next
- [ ] **FLOW-06**: Wizard remembers which steps were completed if user closes and reopens
- [ ] **FLOW-07**: User cannot proceed to next step until current step's connection test passes (Skip to Demo always available)
- [ ] **FLOW-08**: If values are pre-filled, wizard auto-tests on mount and enables Next immediately on success

### Supabase Setup

- [ ] **SUPA-01**: User sees a guide with links to Supabase Cloud signup and self-hosted Docker setup
- [ ] **SUPA-02**: User can enter Supabase URL and anon key, which are saved to OS keychain
- [ ] **SUPA-03**: User can test Supabase connection with visual feedback (success/error/latency)
- [ ] **SUPA-04**: Pre-filled values from env vars show a "configured" badge and auto-test

### Service Configuration

- [ ] **SVC-01**: Each service step shows "not configured" gracefully instead of 401 errors
- [ ] **SVC-02**: Test button saves credentials to keychain first, then tests the connection
- [ ] **SVC-03**: Successful connection tests show latency in milliseconds
- [ ] **SVC-04**: Pre-filled values from keychain auto-test on step mount
- [ ] **SVC-05**: Optional services have a clear "Skip" button with context

### Demo Mode

- [ ] **DEMO-01**: User can enter demo mode from the welcome step with one click
- [ ] **DEMO-02**: User can enter demo mode from any service step via "Skip to Demo" button
- [ ] **DEMO-03**: Demo mode shows sample data for all modules without any backend
- [ ] **DEMO-04**: Demo mode banner in-app links back to the setup wizard

### Polish

- [ ] **UI-01**: Wizard has a clean, modern multi-step design matching app's dark theme
- [ ] **UI-02**: All interactive elements have proper ARIA labels and keyboard navigation
- [ ] **UI-03**: Password/secret fields are masked by default with show/hide toggle
- [ ] **UI-04**: Wizard is responsive and works at minimum app window size (900x600)

## Future Requirements

### Onboarding v2

- **OB2-01**: Guided Supabase Cloud project creation via OAuth
- **OB2-02**: Auto-detect services on the local network
- **OB2-03**: Import configuration from another OpenClaw Manager instance
- **OB2-04**: Video walkthrough embedded in setup steps

## Out of Scope

| Feature | Reason |
|---------|--------|
| Supabase auto-provisioning | Requires OAuth integration with Supabase Cloud API, too complex for v0.1.0 |
| Service auto-discovery | Network scanning is platform-specific and raises security concerns |
| Config import/export | Useful but not critical for first-time experience |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| FLOW-01 | Phase 1 | Pending |
| FLOW-02 | Phase 1 | Pending |
| FLOW-03 | Phase 1 | Pending |
| FLOW-04 | Phase 1 | Pending |
| FLOW-05 | Phase 1 | Pending |
| FLOW-06 | Phase 1 | Pending |
| FLOW-07 | Phase 1 | Pending |
| FLOW-08 | Phase 1 | Pending |
| SUPA-01 | Phase 2 | Pending |
| SUPA-02 | Phase 2 | Pending |
| SUPA-03 | Phase 2 | Pending |
| SUPA-04 | Phase 2 | Pending |
| SVC-01 | Phase 3 | Pending |
| SVC-02 | Phase 3 | Pending |
| SVC-03 | Phase 3 | Pending |
| SVC-04 | Phase 3 | Pending |
| SVC-05 | Phase 3 | Pending |
| DEMO-01 | Phase 4 | Pending |
| DEMO-02 | Phase 4 | Pending |
| DEMO-03 | Phase 4 | Pending |
| DEMO-04 | Phase 4 | Pending |
| UI-01 | Phase 5 | Pending |
| UI-02 | Phase 5 | Pending |
| UI-03 | Phase 5 | Pending |
| UI-04 | Phase 5 | Pending |

**Coverage:**
- v0.1.0 requirements: 22 total
- Mapped to phases: 22
- Unmapped: 0

---
*Requirements defined: 2026-03-19*
*Last updated: 2026-03-19 — traceability populated after roadmap creation*
