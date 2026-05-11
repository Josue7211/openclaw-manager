# Goal: 25-Star Sovereign Executive System

## North Star

ClawControl becomes the private command center for a user's digital life. It does not try to be one giant app that does everything itself. It coordinates trusted surfaces:

- ClawControl is the cockpit, state graph, policy surface, and operator UI.
- Agent Shell is the sensitive execution runtime.
- Agent Secrets is the scoped secret and capability broker.
- memd is durable memory, preferences, decisions, and continuity.
- Mac Bridge and BlueBubbles are Apple-world adapters.
- Mobile and iMessage approvals are the remote human approval layer.

The 25-star bar is: the system can run the week while the user sleeps, but only inside clear policy, audit, expiry, and approval bounds.

## Product Thesis

The winning system is not maximum autonomy. It is calibrated trust.

Low-risk work should happen automatically. Medium-risk work should be proposed and batch-approved. High-risk work should require explicit mobile or biometric approval. Every action should be explainable, reversible when possible, and logged.

## System Boundary

ClawControl should orchestrate and observe. It should not become the place where every raw secret, shell action, or dangerous side effect happens.

| Layer | Responsibility | Hard Rule |
| --- | --- | --- |
| ClawControl | UI, state graph, sync, policy, approvals, audit | Never hold broad raw authority when a scoped token can do |
| Agent Shell | Execute commands, tools, file/system actions | No sensitive action without capability token |
| Agent Secrets | Secret custody, scoped release, approver keys | No vague grants; every release has scope and expiry |
| memd | Durable memory, preferences, outcomes, corrections | Memory informs policy, but does not bypass policy |
| Mac Bridge | Calendar, Reminders, Contacts, local Apple APIs | Must round-trip create/update/delete to Apple sources |
| BlueBubbles | iMessage sync, private API actions, webhooks | Must expose health and degradation states |
| Mobile/iMessage Approval | Human approval from phone | iMessage approvals are structured and limited; biometric app for high risk |

## Risk Model

### Low Risk

Examples: summarize unread messages, draft reminders, classify inbox, update local dashboard, prepare a reply draft.

Allowed behavior:
- Auto-run with audit.
- Notify only on failure or notable finding.
- Store outcome in memd.

### Medium Risk

Examples: create reminders, move calendar events, send low-stakes messages, update notes, restart private services.

Allowed behavior:
- Require policy match or user approval.
- Can use iMessage approval if action is bounded and reversible.
- Must include expiry and exact action summary.

### High Risk

Examples: send money, delete data, reveal secrets, change infrastructure firewall rules, send sensitive personal/professional messages, access production credentials.

Allowed behavior:
- Require mobile app approval with strong confirmation.
- Agent Shell receives short-lived single-purpose capability.
- Agent Secrets releases only exact secret/action scope.
- Audit log must include requester, policy, approver, expiry, tool target, and result.

## Roadmap

Atomic execution ledger: `.planning/25-star-atomic-execution-ledger.md`.

### Phase 0: Trust Baseline

Goal: make the current bridge reliable enough to build on.

- BlueBubbles private API health check in ClawControl.
- Mac Bridge health check for Calendar and Reminders.
- Backend port/URL contract stabilized around `3010` local and Tailscale remote.
- Integration status dashboard: Apple Messages, Calendar, Reminders, Agent Shell, Agent Secrets, memd.
- Redaction pass: no query secrets or approval tokens in logs.

Acceptance:
- User can see exactly why Messages/Calendar/Reminders are connected, degraded, or broken.
- BlueBubbles helper disconnect is detected within 30 seconds.
- One-click restart exists for safe local services.

### Phase 1: Approval Kernel

Goal: one approval model for every sensitive action.

- Canonical contract: `docs/agentshell-approval-contract.md`.
- Define `approval_request` schema: id, requester, action, target, risk, scope, expiry, summary, diff, policy, nonce.
- Define approval states: pending, approved, denied, expired, consumed, failed.
- Add backend queue and audit table.
- Add frontend approval center with filters by risk and source.
- Add policy resolver: auto, ask, deny.
- Add memd logging for durable approval decisions and corrections.

Acceptance:
- No sensitive action path has a one-off approval model.
- Approval can be simulated without executing.
- Expired approval cannot be consumed.

### Phase 2: Agent Shell Capability Handshake

Goal: Agent Shell executes sensitive actions only with scoped capability tokens.

- Define capability token envelope: action, target, scope, expiry, issuer, approval id.
- Add ClawControl to Agent Shell request broker.
- Add capability verification in Agent Shell adapter.
- Add cancellation, timeout, and result reporting.
- Add safe dry-run mode for shell/file/network actions.

Acceptance:
- Agent Shell refuses sensitive requests without a valid capability.
- Capability cannot be reused outside its scope.
- Every execution returns an auditable result envelope.

### Phase 3: Agent Secrets Broker Integration

Goal: secrets are released only through scoped approvals.

- Bind secrets to service, action, and environment.
- Add approve-to-release flow from approval kernel.
- Add rotation/revoke UI for client and approver keys.
- Add masking and structured secret access logs.
- Add failure states for unreachable broker, invalid client key, invalid approver key, insecure URL.

Acceptance:
- No agent receives a broad raw vault session.
- Secret release includes scope, expiry, and consuming action.
- Revocation is visible and testable.

### Phase 4: Mobile Approval Surface

Goal: phone becomes the trusted remote approval device.

- Build mobile approval API: list, inspect, approve, deny.
- Add push transport or polling fallback.
- Add biometric gate for high-risk approvals.
- Add device registration and revocation.
- Add notification copy that is clear and non-leaky.

Acceptance:
- High-risk approvals require mobile strong confirmation.
- Lost phone can be revoked from desktop.
- Mobile can approve while desktop is locked or away.

### Phase 5: iMessage Approval Fallback

Goal: approve bounded low/medium-risk actions from iMessage without opening a security hole.

- Send approval prompt through BlueBubbles.
- Require structured reply: `APPROVE <code>` or `DENY <code>`.
- Use short expiry and one-time nonce.
- Disallow iMessage approval for high-risk actions.
- Add anti-replay and sender identity checks.

Acceptance:
- Plain "yes" never approves anything.
- Approval code maps to exactly one action or bounded batch.
- High-risk requests cannot be approved by iMessage.

### Phase 6: Apple Bridge Completion

Goal: Apple data sync feels native and trustworthy.

- Messages: send, receive, typing, read, delete, undo send, attachments, tapbacks, group metadata, webhooks.
- Calendar: create, update, delete, recurring events, attendee metadata, iCloud round-trip.
- Reminders: create, update, complete, delete, lists, due dates, flagged, priority, notes, iCloud round-trip.
- Contacts: read and identity resolution for messages/calendar/reminders.
- Health dashboard with source-of-truth and last sync timestamps.

Acceptance:
- Real-device test matrix passes against Mac and iPhone.
- Every destructive operation either affects source of truth or clearly says local-only.
- Offline/reconnect produces no silent data loss.

### Phase 7: Personal State Graph

Goal: make messages, calendar, reminders, notes, email, projects, people, and agent actions queryable as one graph.

- Normalize entities: person, project, commitment, message, event, reminder, note, document, approval, action.
- Add entity links and provenance.
- Add search and timeline views.
- Add memd promotion rules for durable facts, preferences, decisions, and corrections.
- Add privacy labels and retention rules.

Acceptance:
- "What do I owe this person?" works across messages, reminders, email, notes, and calendar.
- Each answer cites source objects.
- User can correct memory and policy.

### Phase 8: Executive Agents

Goal: agents behave like staff, not chatbots.

- Chief of staff: daily/weekly plan, follow-ups, risk review.
- Scheduler: calendar proposals, conflict detection, rescheduling drafts.
- Inbox/messages: triage, draft replies, follow-up reminders.
- Ops: homelab health, service restarts, incident summary.
- Research/docs: synthesize, cite, draft, update notes.

Acceptance:
- Agents propose work in queues with clear risk.
- Agents use approval kernel for side effects.
- Agents learn from accepted/rejected outcomes.

### Phase 9: Autonomous Week Loop

Goal: the system can run the week under policy.

- Morning plan: commitments, risks, schedule, messages needing action.
- Midday review: drift, blocked items, approvals waiting.
- Evening close: done, deferred, follow-ups, memory capture.
- Proactive alerts for conflicts, missed messages, broken bridges, expiring approvals.
- Weekly review with decisions, open loops, and suggested next week.

Acceptance:
- User can leave the system running for a week with no hidden side effects.
- Every autonomous action is reconstructable from audit.
- User can pause autonomy globally or per domain.

## First Execution Slice

Build the trust baseline before adding more autonomy.

1. Add integration health dashboard for Messages, Calendar, Reminders, Agent Shell, Agent Secrets, and memd.
2. Add BlueBubbles private API helper watchdog and restart flow.
3. Add Mac Bridge round-trip tests for Calendar and Reminders create/update/delete.
4. Draft approval schema and audit table.
5. Wire one real approval-protected action end to end: "send iMessage reply draft" or "create calendar event".

## Non-Negotiables

- No broad raw secrets in agents.
- No unstructured approvals for side effects.
- No silent local-only deletes when the user expects iCloud/source delete.
- No hidden cloud dependency for private life state.
- No action without provenance, audit, and rollback story.
- No "AI decided" as an explanation.

## Current Open Questions

- Which mobile stack ships first: native app, Tauri mobile, Expo, or PWA?
- Should iMessage approvals be a fallback only, or also a primary medium-risk surface?
- Which Mac should be the always-on Apple bridge host?
- What is the first high-risk action we intentionally support under biometric approval?
- How much of the personal graph lives in SQLite versus Supabase versus memd?

## 25-Star Definition of Done

The user can ask, "Run my week," and the system can:

- Gather context across Apple, email, notes, tasks, calendar, messages, and homelab.
- Propose a plan with risks and open loops.
- Execute low-risk work automatically.
- Ask clean approvals for medium/high-risk work.
- Use Agent Shell and Agent Secrets without leaking raw authority.
- Keep the phone as the approval device.
- Remember outcomes and corrections.
- Explain every action after the fact.

That is the sovereign executive layer.
