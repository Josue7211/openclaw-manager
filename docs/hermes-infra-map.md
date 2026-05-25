# Hermes Agent Infra Map

This is the ClawControl/Hermes messaging topology for the current Hermes Agent migration. Runtime hosts are configured through secrets/env, not baked into the app.

## Configured Nodes

| Role | Config | Service |
| --- | --- | --- |
| Hermes dashboard | `HERMES_DASHBOARD_URL` | Dashboard/control-plane API. |
| Hermes compat API | `HERMES_API_URL` | Existing Hermes-compatible agent API surface. |
| Hermes gateway WS | `HERMES_WS` | Gateway websocket target. |
| Hermes usage API | `HERMES_USAGE_API_URL` or `HERMES_DASHBOARD_API_URL` | Dashboard/usage API surface. |
| Mac Bridge | `MAC_BRIDGE_HOST` | Apple integration bridge. |
| BlueBubbles | `BLUEBUBBLES_HOST` | iMessage bridge. Hermes maps this to `BLUEBUBBLES_SERVER_URL`. |

Legacy `HARNESS_*`, `OPENCLAW_*`, and `CODEX_LB_*` keys are still accepted as compatibility aliases where needed, but Hermes-specific keys take precedence.

## Target Platform State

- Discord target: `Local AI Club` server.
- Discord default behavior: mention-only, channel allowlist, user allowlist, `GATEWAY_ALLOW_ALL_USERS=false`.
- iMessage target: selected BlueBubbles group chat, using configured Mac/BlueBubbles credentials.
- Matrix: retired. ClawControl audits and clears Hermes Matrix env only after explicit confirmation.

## ClawControl Control Routes

ClawControl owns the browser-facing API under `/api/hermes/control/*`.

- Dashboard token stays backend-only.
- Public UI responses redact secret values.
- Env/config writes are allowlisted.
- Dashboard proxy only allows local, private LAN, or Tailscale targets.
- Missing hosts are reported as unconfigured instead of replaced with personal-machine defaults.
