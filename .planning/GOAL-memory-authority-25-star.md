# Goal: 25-Star Memory Authority

## North Star

Memory becomes a governed control plane, not a file list.

memd is the canonical memory system. ClawControl is the operator cockpit. AgentShell is the execution boundary. AgentSecrets is the scoped capability and secret broker. Portainer/Docker is the production owner for the shared memd service.

The 25-star bar is: the user can trust memory to explain what it knows, where it came from, what owns it, what is stale, what needs repair, and what actions are safe to run next.

## Hard Rules

- memd is the memory authority; Hermes/OpenClaw files are provider artifacts, not the source of truth.
- Memory can influence policy and recommendations, but it must not bypass AgentShell, AgentSecrets, or approvals.
- ClawControl may observe Portainer/Docker state directly, but container mutation must go through AgentShell capability flow or an explicit admin-approved operation.
- ClawControl must never store a broad Bitwarden session key as normal runtime config.
- AgentSecrets owns secret release. AgentShell owns command/system execution. ClawControl owns UI, audit, policy, and review.
- Destructive memory maintenance is opt-in and must have a backup, count comparison, and audit record.
- No screen should imply "no memory" when memd has rows, bundle files, expired logs, or candidate entries.

## Current Baseline

- OpenClaw memd is now Docker-managed by Portainer.
- `clawcontrol-memd` owns `0.0.0.0:8787`.
- `clawcontrol-memd-rag` owns `0.0.0.0:9000`.
- `memd-server.service` is inactive and disabled.
- Docker memd health reports 1,354 rows.
- Expired/status memory log rows are preserved by default.
- The current Docker memd server accepts `kind=correction`.
- The Rust RAG sidecar cannot run on the OpenClaw VM CPU because of ORT/illegal-instruction failures, so the Docker proxy sidecar remains the production path.

## System Model

| Layer | 25-Star Role | Allowed Authority |
| --- | --- | --- |
| ClawControl Memory UI | Observe, search, review, repair, approve | Read memory, request safe edits, display warnings |
| ClawControl backend | Normalize APIs, cache nonsecret health, enforce UI policy | Read memd, call AgentShell/AgentSecrets, store audit |
| memd server | Canonical durable memory | Store/query/promote/expire/correct memory |
| memd RAG sidecar | Retrieval enrichment | Search/rerank/LightRAG bridge |
| AgentShell | Execution and host/container action boundary | Run only typed, scoped, approved actions |
| AgentSecrets | Secret/capability broker | Release scoped, expiring secrets and capabilities |
| Portainer | Docker source of operational truth | Container state and stack management |

## Roadmap

### Phase MA-0: Product Contract

Goal: lock the vocabulary and safety boundaries before new surfaces spread.

- Define `Memory Authority` payload fields and statuses.
- Define memory states: current, candidate, stale, archived/log, conflicted, correction.
- Define owner states: docker, systemd, both, none, unknown.
- Define safety states: ok, degraded, blocked, unsafe, unknown.
- Define what ClawControl can do directly versus what must go through AgentShell.
- Define which secrets/capabilities must come from AgentSecrets.

Acceptance:

- One markdown contract exists for frontend, backend, memd, AgentShell, and AgentSecrets.
- No runtime code needs a broad Bitwarden session.
- The contract says exactly which operations need approval.

### Phase MA-1: Authority API

Goal: one backend endpoint tells the UI what owns memory and whether it is trustworthy.

Add `GET /api/memd/authority`.

Payload should include:

- memd base URL and last check time.
- memd health: status, latency, item count, pressure counts, RAG state.
- breakdowns by status, stage, kind, project, namespace, and source system.
- owner detection: Docker container state, systemd state when observable, active port owner when observable.
- expected floor checks: item count below last-known-good or configured floor.
- backup summary: latest known backup path/time/count when available.
- warnings: Docker down, systemd active, count drop, RAG down, atlas dormant, unknown owner, backup stale.

Safety:

- The endpoint is read-only.
- If Portainer credentials are unavailable, return `owner: unknown` with a useful warning instead of failing the whole panel.
- Any Portainer API key must come from AgentSecrets or user secrets, never hardcoded.

Acceptance:

- UI can render a complete authority panel from one call.
- Count drop from 1,354 to 212 would show as a red warning.
- Docker and systemd conflict would show as a red warning.

### Phase MA-2: Memory Authority Dashboard

Goal: the Memory page starts with operational truth.

UI sections:

- Authority strip: owner, health, count, RAG, backup, last checked.
- Count cards: current, candidates, stale, logs/expired, corrections.
- Warning stack: actionable, ranked, no decorative noise.
- Source map: memd server, RAG sidecar, bundle files, provider files.

Design rules:

- Dense operational UI, not a landing page.
- No card-in-card nesting.
- Use icons for health/action controls.
- Text must fit at desktop and narrow widths.

Acceptance:

- User can tell in 5 seconds whether memory is real, current, Docker-owned, and backed up.
- Empty legacy logs no longer mask memd log rows.

### Phase MA-3: Memory Inventory Views

Goal: every class of memory is visible and explainable.

Tabs or segmented views:

- Current: active canonical memories.
- Inbox: candidate memories awaiting review.
- Repair: stale/conflicted/superseded/correction-needed rows.
- Logs: expired/status rows and historical memory log events.
- Files: `.memd/*`, `SOUL.md`, `AGENTS.md`, provider identity files.
- Graph: entities, links, regions, dormant warnings.

Filters:

- status
- stage
- kind
- project
- namespace
- source system
- created/updated range
- confidence

Acceptance:

- `Memory Logs` shows expired/status rows when memd reports them.
- `No logs found` only appears when both legacy logs and memd log rows are actually empty.
- Search and filters keep route `all` behavior so cross-project rows are not hidden.

### Phase MA-4: Review And Repair Actions

Goal: memory can be corrected safely from the UI.

Actions:

- promote candidate to canonical
- mark stale
- expire/archive
- correct memory
- merge duplicates
- copy id/source
- open source file when available
- request re-ingest

Safety:

- Low-risk memory edits can be direct if scoped to memd and audited.
- Bulk edits, destructive drains, import/re-ingest, or container-affecting actions require AgentShell capability and/or approval.
- Secret-backed imports use AgentSecrets.

Acceptance:

- Every mutation has an audit row.
- Bulk destructive action cannot run without approval and backup.
- Corrections are first-class memory rows, not comments lost in UI state.

### Phase MA-5: Backup And Drift Guardrails

Goal: memory cannot silently shrink or drift.

Backend guardrails:

- Track last-known-good counts.
- Track latest backup count.
- Warn on sudden count drop.
- Warn when expired/log rows disappear unexpectedly.
- Warn when Docker image/container changes without count verification.
- Warn when systemd becomes active again.
- Warn when RAG is down or using fallback/proxy mode.

Operational flows:

- Pre-migration backup.
- Post-migration count comparison.
- Rollback instructions.
- AgentShell-managed restart/recreate with a capability token.
- AgentSecrets-backed Portainer credential release with scope and expiry.

Acceptance:

- A repeat of the 1,354 -> 212 drop is blocked or loudly flagged.
- Restart/cutover path shows backup path and before/after counts.

### Phase MA-6: AgentShell + AgentSecrets Integration

Goal: ClawControl can safely operate memory infrastructure without raw operator credentials.

AgentShell actions:

- `memd.health.check`
- `memd.backup.create`
- `memd.container.restart`
- `memd.container.recreate`
- `memd.db.restore`
- `memd.import.run`
- `memd.rag.health.check`

AgentSecrets capabilities:

- Portainer read-only token release.
- Portainer stack mutation token release.
- SSH/host maintenance capability when needed.
- memd admin token if memd grows authenticated admin routes.

Risk model:

- Read-only health: auto allowed.
- Backup creation: low/medium, policy allowed with audit.
- Restart/recreate: medium, approval required unless break-glass policy is active.
- DB restore/import/drain: high, explicit approval required.
- Broad vault/session release: denied.

Acceptance:

- ClawControl never asks the agent to paste a broad vault session for normal operation.
- AgentShell refuses host/container mutation without a scoped capability.
- AgentSecrets logs every Portainer or host credential release.

### Phase MA-7: RAG Hardening

Goal: retrieval is useful and stable on the actual OpenClaw hardware.

Options:

- Keep the current LightRAG proxy sidecar as production default.
- Build a CPU-safe embedding sidecar that avoids AVX/ORT illegal-instruction crashes.
- Move embedding to a services VM or other compatible host.
- Add runtime CPU-feature detection and select backend automatically.

Acceptance:

- RAG health says exactly which backend is active.
- Illegal-instruction failure cannot take down memd server.
- Search/rerank degrades clearly to lexical/proxy mode.

### Phase MA-8: Tests And Verification

Goal: regressions are hard to ship.

Backend tests:

- authority payload shape
- status/stage/kind breakdowns
- count-drop warning
- Docker/systemd owner conflict warning
- expired/log rows preserved unless `MEMD_GC_EXPIRED_ITEMS=1`
- query route `all` does not hide cross-project rows

Frontend tests:

- authority strip renders ok/degraded/unsafe
- logs view renders expired/status rows
- no-memory empty states are truthful
- filters do not hide memd files
- repair actions show correct risk state

Operational verification:

- `npm --prefix frontend run typecheck -- --pretty false`
- relevant frontend tests
- `cargo check --manifest-path src-tauri/Cargo.toml --lib`
- memd server/client checks when memd source changes
- remote smoke: Docker owner, item count, RAG health

Acceptance:

- 25-star memory cannot pass with Docker down, systemd stealing ownership, or a silent count drop.

## Implementation Slices

### Slice 1: Observable 25-Star

- Add authority contract.
- Add read-only authority endpoint.
- Add Memory Authority dashboard.
- Add status/stage/kind breakdown display.
- Add logs view from memd expired/status rows.
- Add tests for payload and UI rendering.

Ship value:

- User can see the truth immediately.
- No sensitive mutation paths yet.

### Slice 2: Repairable 25-Star

- Add memory review actions.
- Add direct audited low-risk memd edits.
- Add correction workflow.
- Add repair queue.
- Add filters and source/provenance view.

Ship value:

- User can fix memory without leaving ClawControl.

### Slice 3: Operational 25-Star

- Add AgentShell action contract for memd operations.
- Add AgentSecrets capability release flow for Portainer/host maintenance.
- Add backup/cutover/restart guardrails.
- Add count-drop blocking and rollback guide.

Ship value:

- ClawControl can safely operate the memory stack.

### Slice 4: Retrieval 25-Star

- Harden RAG backend selection.
- Add CPU-safe embedding path or remote embedding host.
- Add graph/source map.
- Add semantic/provenance explanations.

Ship value:

- Search becomes trustworthy and explainable.

## Open Decisions

- Should ClawControl store last-known-good memory counts locally, in memd, or both?
- Should Portainer read-only health use AgentSecrets on every request or cache a short-lived token?
- Should DB restore be high-risk always, or medium-risk when restoring the latest verified backup?
- Should the current LightRAG proxy sidecar remain the default until a CPU-safe Rust sidecar exists?
- Which memory actions are direct low-risk versus approval-gated?

## First Concrete Build Target

Build Slice 1 first.

Deliverables:

- `GET /api/memd/authority`
- `MemoryAuthorityPanel` on `/memory`
- memd inventory split into Current, Inbox, Repair, Logs, Files
- honest empty states
- red warnings for count drop, owner conflict, Docker down, RAG down, missing backup
- backend and frontend tests

Done means:

- The user can open Memory and immediately know: "Docker owns memd, RAG is healthy, 1,354 rows exist, 1,142 are logs/expired, backups exist, no hidden systemd fallback."
