# Goal: 10-Star Memory Surface

## North Star

The Memory page must be the trustworthy front door for all agent memory in ClawControl. It should show the memory system the user actually uses, not an empty legacy panel.

## Required Model

- Show provider core files for the active runtime: Hermes, OpenClaw, or both when both are present.
- Show legacy provider memory logs separately from memd memory.
- Show memd as the bottom category and treat memd as the default memory system.
- Find memd from the real project/workspace root even when Harness/OpenClaw remote config is active.
- Keep old remote `/files` responses compatible by normalizing `.memd/*` out of `memoryFiles`.
- Allow listed local fallback files to open and edit from the same root they were discovered in.

## Acceptance

- Memory page never says `No memd files found` while `.memd/wake.md`, `.memd/mem.md`, `.memd/config.json`, or `.memd/compiled/memory/*.md` exists in the active project.
- `SOUL.md`, `AGENTS.md`, and other identity/core files appear when present in the active provider or project.
- Remote Harness/OpenClaw cannot mask local memd.
- Tests cover generic Harness/OpenClaw plus memd, Hermes plus memd, and old remote response normalization.
- Running dev app is restarted/rebuilt so the visible screen uses the fixed backend.

## Current Diagnosis

- Frontend now has the `memd` section.
- The backend can still return no memd because remote `/files` wins before local memd is merged, and local lookup can point at a harness workspace instead of the repo `.memd`.

## Completed

- Memory page shows workspace files, legacy memory logs, then memd as the bottom category.
- memd category shows real `/api/memd/query` memories from the memd server plus `.memd` files.
- Backend merges local memd files into remote `/files` results and reads `.memd/*` locally first.
- AppleDouble `._*` sidecar files are filtered so they do not show as broken memory files.
- Repo memd config now points at the live mounted memd service.
- `/api/memd/query` falls back to `.memd/state/raw-spine.jsonl` when the server has no indexed items.
- OpenClaw-VM `memd-server.service` now uses persistent `~/.local/share/memd/memd.db` instead of `/tmp/memd.db`.
- Imported the local Mac bundle spine into the live memd server; `/healthz` reports 24 active items.
- Used Bitwarden session to SSH into the CachyOS desktop at its Tailscale address.
- Imported desktop memd bundle spines from global `~/.memd` plus project bundles into the shared memd server.
- Normalized all discovered desktop `.memd/config.json` and `.memd/env` files to shared authority at `http://100.104.154.24:8787`.
- Verified desktop default `memd healthz` reaches the shared server and reports 1,354 indexed items.
- Verified desktop direct memd API search returns imported `cornerstone` memory records.
- Imported local Mac project spines from `clawcontrol` and `memd` into the shared server.
- Shared memd `/healthz` now reports 1,354 indexed items after desktop plus Mac imports.
- Updated Mac shell defaults in `~/.zshenv` and `~/.profile` so new shells use the shared memd server.
- Added ClawControl `/api/memd/health` and a Memory page health strip showing live source, item count, status, URL, and latency/error.
- Fixed memd CLI `lookup --route all` upstream so scoped project defaults no longer hide imported cross-project memories.
- Installed the rebuilt `memd` CLI to `/Volumes/T7/node/bin/memd`; old binary backed up beside it.
- Installed the rebuilt `memd` CLI on the CachyOS desktop at `~/.local/bin/memd`; old binary backed up beside it.
- Updated desktop global memd hook fallback URLs from localhost to the shared OpenClaw endpoint.
- Re-imported desktop and Mac raw spines into the current OpenClaw shared memd service after the service reset back to 137 items.
- Detected OpenClaw memd server image/schema lag: the running server rejects `kind=correction`, so import maps those records to `kind=fact` with `kind:correction-mapped` until the image is updated.
- Attempted live server binary update, backed up DB/binary first, and restored the backup after cross-built binaries failed on OpenClaw (`Exec format error` from macOS arm64, then `GLIBC_2.43` from CachyOS). OpenClaw does not currently have Cargo installed; correct fix is to build inside OpenClaw or its Docker base image.
- Increased ClawControl's remote memd query timeout and switched the proxy to `route=all` so a full shared memory list does not silently fall back to an empty local store.
- Used the Portainer API at the Services VM Tailscale URL to manage the OpenClaw Docker endpoint when host SSH key auth was unavailable.
- Updated the Portainer Bitwarden item to include the working Tailscale URL and updated the MacBook SSH Bitwarden items to use `aparcedodev`.
- Migrated live OpenClaw memd ownership from user systemd to Portainer Docker: `memd-server.service` is inactive/disabled, `clawcontrol-memd` owns `0.0.0.0:8787`, and `clawcontrol-memd-rag` owns `0.0.0.0:9000`.
- Rebuilt `portainer-memd-server:latest` from current memd source, with the server decoupled from the CPU-incompatible in-process FastEmbed/ORT runtime.
- Kept RAG behind the Docker sidecar proxy because the Rust sidecar image also hits illegal-instruction crashes on the OpenClaw VM CPU.
- Patched memd so expired memory rows are not physically deleted by default from `/healthz`, `/memory/context/compact`, or runtime maintenance; `MEMD_GC_EXPIRED_ITEMS=1` is now required for destructive expired-row GC.
- Restored the pre-Portainer 1,354-row DB after Docker startup had pruned expired/status rows down to 212.
- Verified Docker memd health reports 1,354 items, including 1,142 expired/status log rows, and Docker RAG health reports the LightRAG proxy reachable.
- Verified current source Docker memd accepts `kind=correction`; the temporary probe row was deleted afterward so the DB stayed at 1,354 items.

## Remaining Follow-Up

- Optional: build or configure a sidecar embedding backend that runs on OpenClaw's VM CPU without AVX/ORT illegal-instruction failures. Current Docker RAG sidecar proxy is healthy and connected to LightRAG.
