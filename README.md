# clawctrl

clawctrl is the local-first desktop control plane for the homelab, Hermes,
memd, agent sessions, notes, reminders, Proxmox, Portainer, and related personal
operations.

This branch is the current T7 source-of-truth workspace. `clawctrl` is the
active product identity across docs, package metadata, memd labels, and app UI.

## Active Surface

- `frontend/`: React desktop UI.
- `src-tauri/`: Tauri backend, local APIs, persistence, secrets, and service
  adapters.
- `shared/`: runtime provider catalogs and shared app data.
- `scripts/`: verification and live certification scripts.
- `docs/`: current architecture, parity, and Hermes runbooks.
- `.memd/`: project memory/bootstrap bundle used by Codex, Hermes, and other
  agent harnesses.

## Common Commands

```bash
npm run frontend:dev
npm run check
npm run check:all
```

`npm run check` runs architecture checks, frontend typecheck, bundle budget, and
dead-code checks. `npm run check:all` adds frontend tests and the Tauri backend
`cargo check`.

## Runtime Notes

- T7 `/run/media/josue/T7/projects/clawctrl` is the source-of-truth local
  workspace.
- memd state must come from the repo `.memd` bundle before transcript recall.
- Hermes uses the clawctrl/memd bootstrap path for project memory and agent
  context.
- Generated runtime memory pages under `.memd/state`, `.memd/wake.md`,
  `.memd/mem.md`, and related compiled outputs are intentionally ignored.

## Docs

- [Architecture](docs/architecture.md)
- [Repo baseline](docs/repo-baseline.md)
- [Hermes infrastructure map](docs/hermes-infra-map.md)
- [Hermes Mac services runbook](docs/hermes-mac-services-runbook.md)
- [Notes parity roadmap](docs/notes-parity-roadmap.md)
- [Proxmox parity matrix](docs/proxmox-parity-matrix.md)
- [Portainer parity matrix](docs/portainer-parity-matrix.md)
