# Portainer Stacks

## `clawcontrol-full.stack.yml`

Deploys the batteries-included stack for new installs:

- ClawControl backend and frontend
- bundled Supabase-compatible backend: Postgres, PostgREST, GoTrue, Realtime, Storage, Meta, and a tiny nginx gateway
- Agent Secrets
- AgentShell adapter
- harness API sidecar
- memd server
- memd RAG sidecar
- LightRAG
- RAGAnything/MinerU
- optional `mac-bridge` profile for macOS hosts

This stack is the default shape for new Docker images. Existing personal setups
can keep pointing ClawControl at separately hosted services; the env values stay
overrideable.

Expected bundle layout on the Docker host:

```text
/opt/clawcontrol-bundle
  clawcontrol/
  AgentSecrets/
  memd/
  mac-bridge/       # optional; only useful on macOS-capable hosts
```

Generate `.env.full` with:

```bash
npm run stack:env -- --out .env.full
npm run stack:check -- --env .env.full --no-docker
```

For a Docker host reached over SSH, use `--ssh-host openclaw-vm` so the check
runs where Docker actually lives. Add `--remote-env` and `--remote-stack` only
when you want to validate files that already live on the VM.

Then paste the generated env into Portainer and deploy
`deploy/portainer/clawcontrol-full.stack.yml`.

See [../../docs/SETUP.md](../../docs/SETUP.md) for the full setup flow.

`mac-bridge` is included as a profile because Apple services require a macOS
host and local privacy permissions. It ships with the bundle, but Linux Docker
hosts should leave `MAC_BRIDGE_HOST` pointed at a separate Mac bridge.

Built-in defaults in the full stack:

| Dependency | Internal URL |
|---|---|
| Supabase gateway | `http://supabase-gateway:8000` |
| Agent Secrets | `http://secret-broker:4815` |
| AgentShell | `http://agentshell:8077` |
| Harness API | `http://harness-api:3939` |
| memd server | `http://memd-server:8787` |
| memd RAG sidecar | `http://memd-rag-sidecar:9000` |
| LightRAG | `http://lightrag:9621` |
| RAGAnything/MinerU | `http://raganything-miner:8010` |
| Mac Bridge | optional profile, `http://mac-bridge:4100` on macOS-capable hosts |

## `clawcontrol-backend.stack.yml`

Deploys the real ClawControl Axum backend in headless mode plus the public
coaching form frontend. This stack also owns Agent Secrets, memd server, and
memd RAG sidecar for the OpenClaw VM deploy path.

Expected layout on the VM:

```text
/opt/clawcontrol-backend
  docker/...
  frontend/...
  docker/clawcontrol-backend.Dockerfile
  src-tauri/...
```

Use `deploy/portainer/clawcontrol-backend.env.example` as the starting point
for the stack env file. This backend is where Supabase auth, AgentShell
bridging, proxy routes, backend-side secrets resolution, and Docker-managed
memd should live.

If `memd-server` is still running as a user systemd service, migrate it with
[../../docs/memd-docker-migration.md](../../docs/memd-docker-migration.md)
before enabling the compose memd services.

For `coaching.aparcedo.org`, point the Cloudflare Tunnel at the local services
on the VM. A copy lives in `deploy/cloudflare/coaching-ingress.example.yml`:

```yaml
ingress:
  - hostname: coaching.aparcedo.org
    path: /api/training/public/*
    service: http://127.0.0.1:3010
  - hostname: coaching.aparcedo.org
    service: http://127.0.0.1:8088
  - service: http_status:404
```

The public form URL shape is `https://coaching.aparcedo.org/form/<token>`.

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
