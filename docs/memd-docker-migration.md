# memd Docker Migration

Original `openclaw-vm` state before migration:

- `memd-server` runs as a user systemd service.
- Data lives in `/home/aparcedodev/.local/share/memd/memd.db`.
- The DB is about 12 MB.
- The service listens on `0.0.0.0:8787`.
- No memd RAG sidecar is currently listening on `:9000`.

The backend compose stack now includes:

- `memd-server`
- `memd-rag-sidecar`

Both are meant to deploy with `clawcontrol-backend` and `secret-broker`.

`openclaw-vm` was migrated on 2026-05-09. The successful backup is:

```text
/home/aparcedodev/backups/memd/20260509-085957
```

For that host, the compose env uses the existing known-good
`/home/aparcedodev/.local/bin/memd-server` binary through
`docker/memd-server-local.Dockerfile`, plus
`docker/memd-rag-sidecar-proxy.Dockerfile` for a lightweight LightRAG proxy.
The source-build Dockerfiles remain the default path for fresh bundle builds.

## Migration Command

Run this on `openclaw-vm` after syncing this repo into
`/home/aparcedodev/stacks/clawcontrol-backend`:

```bash
cd /home/aparcedodev/stacks/clawcontrol-backend
bash scripts/migrate-memd-systemd-to-compose.sh
```

What the script does:

1. Backs up `/home/aparcedodev/.local/share/memd`.
2. Validates the Docker Compose config.
3. Stops `memd-server.service` so Docker can bind port `8787`.
4. Starts `memd-server` and `memd-rag-sidecar` through compose.
5. Verifies:
   - `http://127.0.0.1:8787/healthz`
   - `http://127.0.0.1:9000/healthz`
6. Disables the systemd memd service after Docker health checks pass.

If Docker health fails, the script stops the Docker memd services and restarts
the original systemd service.

## Manual Health Checks

```bash
curl http://127.0.0.1:8787/healthz
curl http://127.0.0.1:9000/healthz
curl http://100.104.154.24:8787/healthz
curl http://100.104.154.24:9000/healthz
```

## Rollback

```bash
cd /home/aparcedodev/stacks/clawcontrol-backend
docker compose --env-file .env -f deploy/portainer/clawcontrol-backend.stack.yml stop memd-server memd-rag-sidecar
systemctl --user enable --now memd-server.service
```
