# Setup

This is the batteries-included path for new Docker or Portainer installs.
Existing setups can keep using separate Supabase, Agent Secrets, memd,
LightRAG, RAGAnything, MinerU, AgentShell, or Mac Bridge endpoints by overriding
the matching env values.

## What Ships

| Service | Default URL inside the stack |
|----------|------------------------------|
| ClawControl backend | `http://clawcontrol-backend:3010` |
| ClawControl frontend | `http://coaching-frontend` |
| Supabase gateway | `http://supabase-gateway:8000` |
| Agent Secrets | `http://secret-broker:4815` |
| AgentShell | `http://agentshell:8077` |
| Harness API | `http://harness-api:3939` |
| memd server | `http://memd-server:8787` |
| memd RAG sidecar | `http://memd-rag-sidecar:9000` |
| LightRAG | `http://lightrag:9621` |
| RAGAnything/MinerU | `http://raganything-miner:8010` |
| Mac Bridge | optional `macos` profile |

## Bundle Layout

The full stack expects the companion repos beside ClawControl on the Docker
host:

```text
/opt/clawcontrol-bundle
  clawcontrol/
  AgentSecrets/
  memd/
  mac-bridge/       # optional; useful only on macOS-capable hosts
```

## New Docker Install

1. Copy the bundle to the Docker host.

2. Create the deployment env.

```bash
cd /opt/clawcontrol-bundle/clawcontrol
npm run stack:env -- --out .env.full
```

This writes `.env.full` with strong random values for the stack secrets and
generates `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` as JWTs signed by
the same `JWT_SECRET`.

3. Edit any site-specific values in `.env.full`.

Most local installs can keep the defaults. Change these when deploying behind a
real host name or tunnel:

- `FRONTEND_PUBLIC_SITE_URL`
- `FRONTEND_PUBLIC_API_BASE`
- `BACKEND_PUBLIC_BASE_URL`
- `CORS_ALLOWED_ORIGINS`
- `SUPABASE_PUBLIC_URL`

If LightRAG should call a hosted LLM/embedding provider, set the matching
`LIGHTRAG_*_API_KEY` values before starting the stack.

4. Check the env before booting.

```bash
npm run stack:check -- --env .env.full --no-docker
```

On a host with Docker installed, omit `--no-docker` to also run
`docker compose config`.

If Docker lives on a homelab VM, point the checker at that SSH host. The
checker copies the local stack/env to a remote temp dir and runs Docker Compose
there:

```bash
npm run stack:check -- --env .env.full --ssh-host openclaw-vm
```

If the stack already lives on the VM, add `--remote-env` and `--remote-stack`
to validate those exact remote files.

5. Start the stack.

```bash
docker compose \
  --env-file .env.full \
  -f deploy/portainer/clawcontrol-full.stack.yml \
  up -d --build
```

For a remote Docker host, run the same command over SSH from the stack
directory on that VM.

6. Open the desktop app and pair it.

Use:

- backend URL: `http://<docker-host>:3010`
- pairing token: value of `PAIRING_TOKEN`

7. Check health.

```bash
curl http://127.0.0.1:3010/api/setup/status
curl http://127.0.0.1:8000/health
curl http://127.0.0.1:8787/healthz
curl http://127.0.0.1:9000/healthz
curl http://127.0.0.1:9621/health
curl http://127.0.0.1:8010/healthz
```

## Portainer

Generate `.env.full` first, then use
`deploy/portainer/clawcontrol-full.stack.yml` as the stack file and paste the
edited `.env.full` contents into the Portainer environment section.

For macOS bridge support, enable the `macos` compose profile only on a host
that can actually access Apple services and has the needed privacy
permissions. Linux Docker hosts should point `MAC_BRIDGE_HOST` at a separate
Mac bridge instead.

## Existing Connected Setup

If a service already exists, leave it external and override the default:

| Existing service | Env override |
|------------------|--------------|
| Supabase | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| Agent Secrets | `AGENTSECRETS_URL`, `AGENTSECRETS_CLIENT_API_KEY` |
| AgentShell | `AGENTSHELL_URL` |
| memd | `MEMD_BASE_URL` |
| memd RAG sidecar | `MEMD_RAG_URL` |
| LightRAG | `LIGHTRAG_BASE_URL`, `LIGHTRAG_API_KEY` |
| RAGAnything/MinerU | `RAGANYTHING_URL`, `MINERU_URL` |
| Mac Bridge | `MAC_BRIDGE_HOST`, `MAC_BRIDGE_API_KEY` |

The app should not tell you those services are missing when they are already
configured through env or the in-app connection settings.

## Current Caveats

- The full stack is scaffolded and YAML/env validation passes in this repo.
- Docker Compose runtime verification still needs to be run on a host with
  Docker installed.
- RAGAnything/MinerU ships with a health wrapper now; full ingestion adapter
  wiring still belongs in the memd RAG sidecar.
- Mac Bridge can ship with the bundle, but Apple service access still depends
  on macOS host permissions.
