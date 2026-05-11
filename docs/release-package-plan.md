# Release Package Plan

Goal: new users get ClawControl with the companion stack already present, while
power users can point the app at services they already run.

## Current Package Shape

- Full Docker/Portainer stack:
  [`deploy/portainer/clawcontrol-full.stack.yml`](../deploy/portainer/clawcontrol-full.stack.yml)
- Full env example:
  [`deploy/portainer/clawcontrol-full.env.example`](../deploy/portainer/clawcontrol-full.env.example)
- Setup guide:
  [`docs/SETUP.md`](SETUP.md)

## Ships By Default

- ClawControl backend and frontend
- Supabase-compatible stack
- Agent Secrets
- AgentShell
- Harness API sidecar
- memd server
- memd RAG sidecar
- LightRAG
- RAGAnything/MinerU
- Mac Bridge as optional macOS profile

## Done

- Full-stack compose scaffold exists.
- Default internal URLs are wired.
- Env example covers all compose variables.
- `npm run stack:env` generates first-run secrets and Supabase JWTs.
- `npm run stack:check` validates env coverage, placeholder values, Supabase
  JWT signatures, and Docker Compose config locally or on an SSH Docker host.
- Docs describe bundled defaults and external override path.
- Local memd fallback exists for Knowledge and Memory when no remote RAG is
  reachable.
- The existing backend stack can now own Docker-managed memd server and memd
  RAG sidecar.

## Still Needed Before Release Label

- Run `docker compose up -d --build` on a Docker host and verify all health
  checks.
- Verify Supabase migrations apply cleanly on first boot.
- Wire full RAGAnything/MinerU ingestion through memd RAG sidecar.
- Run the memd systemd-to-compose migration on `openclaw-vm`.
- Decide whether companion repos are shipped as git submodules, release
  archive folders, or prebuilt images.
