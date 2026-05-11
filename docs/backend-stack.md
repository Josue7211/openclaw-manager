# Backend Stack

The release stack is backend-first: the desktop app pairs with one
ClawControl backend, and that backend talks to bundled or external services.

## Default Topology

```text
Desktop app
  -> ClawControl backend :3010
      -> Supabase gateway :8000
      -> Agent Secrets :4815
      -> AgentShell :8077
      -> Harness API :3939
      -> memd server :8787
      -> memd RAG sidecar :9000
          -> LightRAG :9621
          -> RAGAnything/MinerU :8010
      -> Mac Bridge :4100, optional macOS profile
```

The source of truth for the full stack is
[`deploy/portainer/clawcontrol-full.stack.yml`](../deploy/portainer/clawcontrol-full.stack.yml).

## Built-In Dependencies

| Dependency | Why it exists | Override |
|------------|---------------|----------|
| Supabase-compatible stack | Auth, sync, realtime, storage | `SUPABASE_*` |
| Agent Secrets | Secret broker and approval flow | `AGENTSECRETS_*`, `SECRET_BROKER_*` |
| AgentShell | Launch/approval adapter | `AGENTSHELL_URL` |
| Harness API | Workspace HTTP/WebSocket bridge | `HARNESS_*` |
| memd server | Durable memory/bootstrap service | `MEMD_BASE_URL` |
| memd RAG sidecar | Retrieval adapter contract | `MEMD_RAG_URL` |
| LightRAG | Long-term semantic graph retrieval | `LIGHTRAG_*` |
| RAGAnything/MinerU | Multimodal extraction and parsing | `RAGANYTHING_URL`, `MINERU_URL` |
| Mac Bridge | macOS Reminders/Contacts bridge | `MAC_BRIDGE_*` |

## Rule

Bundled defaults are for new Docker images. External values win for existing
setups, so a personal deployment that already has these services connected
should keep working without setup nagging.

For the OpenClaw VM path, memd should be Docker-managed with the backend stack.
See [memd-docker-migration.md](memd-docker-migration.md).
