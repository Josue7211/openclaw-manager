# Agent Shell Approval Contract

This contract is the shared boundary between ClawControl, Agent Shell, Agent Secrets, and mobile approval surfaces. It exists so sensitive actions never depend on a broad raw credential or a vague "yes".

## Roles

| System | Responsibility |
| --- | --- |
| ClawControl | Owns approval queue, policy decision, audit, UI, and mobile/iMessage approval routing. |
| Agent Shell | Plans and executes work. Sensitive execution requires a scoped capability token. |
| Agent Secrets | Releases secrets only when the approval scope allows that exact release. |
| Mobile/iMessage | Lets the human approve or deny bounded requests away from desktop. |

## Approval Request

An approval request describes intent before execution.

```json
{
  "id": "appr_01JZ...",
  "source": "agentshell",
  "requester": {
    "kind": "agent",
    "id": "chief-of-staff",
    "display_name": "Chief of Staff"
  },
  "action": "messages.send",
  "target": {
    "kind": "imessage_chat",
    "id": "chat:+15555550123",
    "display": "Josue"
  },
  "risk": "medium",
  "scope": {
    "service": "bluebubbles",
    "operation": "send_text",
    "chat_guid": "chat:+15555550123",
    "max_messages": 1
  },
  "summary": "Send one iMessage reply to Josue.",
  "diff": {
    "before": null,
    "after": {
      "text": "On it. I will send the draft tonight."
    }
  },
  "policy": {
    "decision": "ask",
    "rule_id": "messages.medium.send_text"
  },
  "nonce": "approval-nonce-from-requester",
  "expires_at": "2026-05-09T21:00:00Z",
  "raw": {}
}
```

Required fields:

| Field | Rule |
| --- | --- |
| `id` | Stable request id from requester or ClawControl. |
| `source` | `clawcontrol`, `agentshell`, `agentsecrets`, `harness`, `mobile`, or a future source string. |
| `requester` | Object naming the agent, service, or human that requested the action. |
| `action` | Stable dot-name action such as `shell.exec`, `secret.read`, `file.write`, `git.push`, `deploy.run`, `messages.send`, or `calendar.delete`. |
| `target` | Object naming the concrete resource. Avoid broad labels like "all files". |
| `risk` | `low`, `medium`, `high`, or `critical`. |
| `scope` | Exact execution bounds. This is what the capability token enforces. |
| `summary` | Human-readable one-line intent. |
| `diff` | Proposed before/after or command plan. Can be `{}` only when no diff exists. |
| `policy` | Resolver output: `auto`, `ask`, or `deny`, plus rule metadata. |
| `nonce` | Requester-provided anti-replay value. ClawControl stores only `nonce_hash`. |
| `expires_at` | Expiry timestamp. Expired approvals cannot be consumed. |

## States

Approval states:

| State | Meaning |
| --- | --- |
| `pending` | Waiting for approval or rejection. |
| `approved` | Human or policy approved it; capability can be issued. |
| `rejected` | Human or policy denied it. |
| `expired` | Request timed out before approval or consumption. |
| `consumed` | Capability was used for the approved action. |
| `failed` | Execution failed after approval. |

Capability states:

| State | Meaning |
| --- | --- |
| `active` | Token can still be used. |
| `consumed` | Token was used once. |
| `revoked` | Token was explicitly canceled. |
| `expired` | Token timed out. |

## Capability Token

The capability token is opaque to Agent Shell callers and stored only as a hash in ClawControl.

```json
{
  "capability": "cap_live_opaque_random_token",
  "capability_id": "cap_01JZ...",
  "approval_id": "appr_01JZ...",
  "action": "messages.send",
  "target": {
    "kind": "imessage_chat",
    "id": "chat:+15555550123"
  },
  "scope": {
    "service": "bluebubbles",
    "operation": "send_text",
    "chat_guid": "chat:+15555550123",
    "max_messages": 1
  },
  "risk": "medium",
  "issuer": "clawcontrol",
  "issued_at": "2026-05-09T20:55:00Z",
  "expires_at": "2026-05-09T21:00:00Z"
}
```

Rules:

- One token maps to one approval.
- Tokens are short-lived and single-use by default.
- Agent Shell must reject sensitive execution when the token is missing, expired, reused, or outside scope.
- Agent Secrets must release only the exact secret/action/environment allowed by scope.
- High-risk and critical actions must not be approvable through plain iMessage.
- Agent Shell authenticates service-to-service calls with a dedicated ClawControl service token, never a user session key or broad secret.

## Result Envelope

Every execution reports back to ClawControl.

```json
{
  "request_id": "appr_01JZ...",
  "capability_id": "cap_01JZ...",
  "status": "success",
  "started_at": "2026-05-09T20:55:15Z",
  "finished_at": "2026-05-09T20:55:18Z",
  "summary": "Sent one iMessage reply.",
  "stdout": "",
  "stderr": "",
  "artifacts": [],
  "redactions": ["message_body"]
}
```

Valid result statuses: `success`, `failed`, `denied`, `timeout`, `canceled`.

## Minimum Endpoints

ClawControl side:

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/approvals/requests` | Create a local or Agent Shell approval request. |
| `GET` | `/api/approvals` | List federated approval queue. |
| `POST` | `/api/approvals/:id/approve` | Approve and issue/prepare capability when needed. |
| `POST` | `/api/approvals/:id/reject` | Reject with optional reason. |
| `POST` | `/api/approvals/:id/result` | Store execution result and consume/fail grant. |
| `POST` | `/api/approvals/sweep-expired` | Mark expired pending/approved approvals and active grants. |
| `POST` | `/api/capabilities/verify` | Verify token hash, scope, status, and expiry. |
| `POST` | `/api/capabilities/:id/revoke` | Revoke a live capability by id. |

Agent Shell side:

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/v1/sessions/plan` | Return dry-run plan and approval request shape. |
| `POST` | `/v1/sessions` | Execute only when no sensitive action is present or a valid capability is attached. |
| `POST` | `/v1/capabilities/verify` | Optional local adapter verification hook when Agent Shell owns enforcement. |

## First Real Flow

1. Agent Shell plans a side effect, for example `messages.send`.
2. ClawControl receives an approval request and stores `nonce_hash`.
3. Approval Center or mobile approves the exact request.
4. ClawControl issues a scoped capability token.
5. Agent Shell executes once, inside scope.
6. Agent Shell sends a result envelope.
7. ClawControl marks capability consumed and writes audit events.

## Non-Negotiables

- No raw Bitwarden session, BlueBubbles private API key, or broad shell authority goes to an agent.
- No approval can outlive its expiry.
- No capability can be reused silently.
- No destructive Apple-world action can be local-only unless the UI says local-only before approval.
- Every approval, capability issue, consume, revoke, and failure is auditable.
