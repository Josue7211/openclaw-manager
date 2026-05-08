# Portainer Stacks

## `clawcontrol-backend.stack.yml`

Deploys the real ClawControl Axum backend in headless mode.

Expected layout on the VM:

```text
/opt/clawcontrol-backend
  docker/clawcontrol-backend.Dockerfile
  src-tauri/...
```

Use `deploy/portainer/clawcontrol-backend.env.example` as the starting point
for the stack env file. This backend is where Supabase auth, AgentShell
bridging, proxy routes, and backend-side secrets resolution should live.

## `clawcontrol-harness-api.stack.yml`

Deploys the generic harness workspace sidecar on a Docker host through Portainer.

Expected layout on the VM:

```text
/opt/clawcontrol
  docker/harness-api.Dockerfile
  scripts/harness-api.mjs
```

Recommended workflow:

1. Sync this repo to `/opt/clawcontrol` on the target VM.
2. Copy `deploy/portainer/clawcontrol-harness-api.env.example` to a real env file.
3. In Portainer, create/update a stack using `deploy/portainer/clawcontrol-harness-api.stack.yml`.
4. Set `HARNESS_API_URL` in ClawControl to the remote harness endpoint instead of `127.0.0.1`.

Notes:

- This stack does not duplicate Supabase. It only runs the harness workspace sidecar.
- Supabase OAuth providers are configured separately in your Supabase deployment.
