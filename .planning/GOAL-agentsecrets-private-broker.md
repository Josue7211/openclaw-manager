# Goal: 10-Star Agent Secrets

## North Star

Agent Secrets is the private broker for agent capability and secret access. It should let ClawControl agents request sensitive actions without putting raw vault tokens in every desktop app, and without relying on one laptop's localhost tunnel as the system of record.

## Required Model

- Host Agent Secrets on a controlled machine or private network service.
- Expose it by Tailscale/LAN HTTP or public HTTPS only.
- Keep raw provider tokens on the broker side whenever possible.
- Store ClawControl client and approver keys in synced encrypted app secrets.
- Use the local OS keychain as device cache/fallback, not as the only source of truth.
- Require human approval for sensitive broker requests and show those approvals in ClawControl.
- Never treat a missing localhost tunnel as a healthy production config.

## Security Rules

- Plain HTTP is allowed only for loopback, LAN, or Tailscale/private hosts.
- Public hosts must use HTTPS.
- Broker health must include client-key auth; unauthenticated `/healthz` is not enough.
- Missing, invalid, unreachable, and insecure states must be visible as separate statuses.
- Approver keys are higher privilege than client keys and should not be logged or displayed.

## Current State

- ClawControl knows how to call Agent Secrets for health, proxy routes, and approvals.
- Settings include Agent Secrets URL, client key, and approver key.
- The local app was pinned to `http://127.0.0.1:4815`, which is only valid when a tunnel is running.
- OpenClaw VM deployment is remembered, but the VM identity/reachability must be repaired before deploying secrets there again.

## Next Ship Targets

- Bring the OpenClaw VM broker back online at a stable private URL.
- Save Agent Secrets credentials through the synced encrypted `user_secrets` path.
- Add setup UI copy/status that distinguishes private hosted, local tunnel, missing auth, bad auth, and insecure URL.
- Add a broker rotation flow for client and approver keys.
