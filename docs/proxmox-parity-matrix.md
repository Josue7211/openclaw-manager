# Proxmox Parity Matrix

This matrix is the source of truth for ClawControl Proxmox parity. A Proxmox control is not considered shipped unless it has a backend path, UI state, permission/error handling, task/audit behavior when applicable, and tests.

Status legend:

- `implemented`: works through the ClawControl backend.
- `external`: works by launching the real Proxmox UI; embedded ClawControl parity is still missing.
- `read_only`: inventory or navigation is visible, but mutation is not implemented.
- `blocked`: UI must not render an active control.

## Gate Rules

1. No fake buttons: visible actions must be advertised by `/api/homelab` `control.actions`.
2. Capability metadata in `/api/homelab` `control.capabilities` overrides optimistic UI assumptions.
3. `blocked` actions must be hidden or disabled with an explicit reason.
4. Destructive actions require typed confirmation, backend validation, and audit logging.
5. Async Proxmox actions must surface the returned UPID/task state before they are marked complete.

## Current Foundation

The long-form implementation roadmap lives in `docs/proxmox-100-parity-plan.md`. The runtime capability registry now enumerates implemented, read-only, and blocked Proxmox surfaces through `/api/homelab` `control.capabilities`; the frontend Datacenter `Coverage` tab renders that registry so missing parity cannot be mistaken for shipped functionality.

| Surface | Action / Area | Status | Current Behavior | Required For 100% |
| --- | --- | --- | --- | --- |
| Node | Shell | implemented | Embedded termproxy/vncwebsocket proxy opens an xterm.js panel using Proxmox's framed shell protocol. Live smoke on 2026-05-22 reached websocket `OK` against node `pve`. | Task-aware reconnect/error states and browser visual certification. |
| VM | Console | implemented | Embedded vncproxy/vncwebsocket proxy opens a noVNC panel for running QEMU guests, retries transient Proxmox node/vncproxy request failures, and shows an explicit stopped-guest prompt instead of an indefinite loader. Live smoke on 2026-05-22 reached `RFB 003.008` against VM 100, VM 200, and VM 500 on `pve`. | Browser visual certification and richer boot-state/start prompts. |
| CT | Console | implemented | Embedded vncproxy/vncwebsocket proxy opens a noVNC panel for running LXC guests. Live smoke on 2026-05-22 reached `RFB 003.008` against CT 101 on `pve`. | Browser visual certification and richer boot-state/start prompts. |
| Storage | Reload storage | blocked | No backend handler; UI must not render it. | Add real backend endpoint or remove permanently. |
| Node | Create VM / CT | implemented | Backend posts to node qemu/lxc creation endpoints and enriches returned UPIDs when Proxmox returns task IDs. | Add template/image picker and validation against live storage inventory. |
| Node | Reboot / Shutdown | implemented | Backend posts to node status endpoint and enriches returned UPIDs with immediate task status. | Add HA/preflight warnings and live task polling. |
| Guest | Lifecycle | implemented | Start, shutdown, reboot, stop, delete route through Proxmox API and enrich UPID responses with an immediate task status snapshot. Live disposable LXC certification proved start/reboot/shutdown/start/stop/delete against VMID `991`, with inventory state checks after each lifecycle action. | Richer status UI, reset/suspend/resume if desired. |
| Guest | Config edits | implemented | CPU, memory, name, tags, onboot, protection, network/disk basics route through Proxmox API and enrich UPID responses with an immediate task status snapshot. QEMU config uses Proxmox `POST /config`; LXC config uses Proxmox `PUT /config`. | Cover every hardware option Proxmox exposes. |
| Guest | Snapshots | implemented | Create, rollback, delete. | Snapshot tree UI and task progress. |
| Guest | Backup | implemented | Manual vzdump submission and backup archive delete route through the backend. Disposable live certification verifies backup archive appearance and deletion cleanup. | Backup job management, retention, restore workflow polish. |
| Datacenter | Backup jobs inventory | read_only | Backend fetches live `/cluster/backup` scheduled job rows; Datacenter Backup renders job schedule, selection, mode, compression, notification, and retention alongside backup archives. | Add job create/update/delete/run, prune preview, and task progress. |
| Firewall | Guest rules/options | implemented | Basic guest firewall options/rules route through backend. | Datacenter/node firewall parity, ipsets, aliases, security groups. |
| Firewall | Datacenter options/rules/aliases/ipsets/security groups | read_only | Backend fetches live `/cluster/firewall` options, rules, aliases, IP sets with entries, and security groups with rules; Datacenter Firewall renders those objects. | Add datacenter firewall writes, macros/refs, and node firewall inventory/mutations. |
| HA | Guest HA | implemented | Add/set/remove HA resource. | HA group writes, fencing state, policy views. |
| HA | HA manager groups/status | read_only | Backend fetches live `/cluster/ha/groups` and `/cluster/ha/status/current`; Datacenter HA renders resources, groups, and CRM/LRM status. | Add HA group CRUD, placement policy editing, node maintenance/evacuation, and diagnostics. |
| Replication | Jobs/status inventory | read_only | Backend fetches live `/cluster/replication`; Datacenter and guest Replication tabs render job source, target, schedule, rate, sync times, failures, and errors. | Add create/update/delete/run flows and per-job status/task logs. |
| Pools | Pool/member inventory | read_only | Backend fetches live `/pools` and per-pool members; Datacenter Pools renders pools and guest/storage membership. | Add pool create/update/delete and membership management. |
| Tasks | Status/log/stop | implemented | Backend can fetch task status/log and stop running tasks; UI task tabs fetch real Proxmox log/status payloads for selected UPIDs, UPID-returning toolbar actions poll task status after submission, and recent UPID activity persists across resource selection/remounts. | Global task drawer filters, cancel affordances, and longer retention. |
| Permissions | Users/groups/tokens/ACL/realms | read_only | Backend fetches live `/access/users`, `/access/groups`, `/access/roles`, `/access/acl`, `/access/domains`, and per-user API token inventory; Datacenter and tree-level Permissions tabs render real rows. | Guarded users, groups, roles, tokens, ACL, and realm mutation API with permission previews. |
| Permissions | Permission mutations | blocked | Capability registry exposes write controls as missing; active create/update/delete controls must not render yet. | Typed confirmations, audit logging, and backend handlers for all access writes. |
| SDN | Zones/VNets/Subnets/IPAM/DNS/DHCP/status inventory | read_only | Backend fetches live `/cluster/sdn` status, zones, VNets, per-VNet subnets, controllers, IPAM, DNS, and DHCP provider rows; Datacenter SDN renders real inventory. | Add SDN create/update/delete, apply/rollback, and task/state verification. |
| SDN | Create/update/delete/apply/rollback | blocked | Capability registry exposes SDN writes as missing; active mutation controls must not render yet. | Guarded mutation API for zones, VNets, subnets, providers, apply, rollback, and task log tracking. |
| Logs | Cluster log, node syslog, node journal | read_only | Backend fetches `/cluster/log`, `/nodes/{node}/syslog`, and `/nodes/{node}/journal`; Datacenter Logs renders cluster and node logs, and Node Logs scopes rows to the selected node. | Add search, follow/tail streaming, download, severity filters, and journal cursor controls. |
| Node | Network/DNS/Hosts/Time/Repos/Updates | read_only | Live Proxmox API inventory is now fetched for node interfaces, DNS, hosts, time, and apt repositories and rendered in node tabs. | Editable config, apply/revert, apt update/upgrade flows. |
| Node | Disks/ZFS/Ceph | read_only | Storage-like inventory only. | Full disk/ZFS/Ceph API coverage. |
| Storage | Content inventory | read_only | Backend fetches live `/nodes/{node}/storage/{storage}/content` rows for active stores; storage `Content` renders ISO/template/backup/image/rootdir/snippet entries instead of backup-only rows. | Add mutation flows, task tracking, and content-type specific validation. |
| Storage | Content upload/download/delete/protect/notes | blocked | Capability registry and Coverage tab expose mutations as missing; active write controls must not render yet. | ISO/template/backup/image/rootdir/snippet upload, download, delete, protect/unprotect, and notes management. |
| Datacenter | Firewall writes/backup job mutations/replication writes/pool writes/certs/notifications/logs | blocked | Capability registry and Coverage tab expose these writes/surfaces as missing; no active controls render. | Full datacenter administration parity. |
| Parity registry | Coverage map | implemented | `/api/homelab` publishes the Proxmox surface map in `control.capabilities`, and the frontend Datacenter `Coverage` tab renders it. | Keep the registry synchronized with every new route, UI panel, and certification result. |

## Verified Evidence

- 2026-05-22 live non-destructive smoke against current inventory returned node `pve` and guests `100 media`, `400 nextcloud`, `200 openclaw`, `300 truenas`, `500 services`, and `101 adguard`, all with node `pve`.
- 2026-05-22 live shell smoke created `/api/homelab/proxmox/shell/session`, upgraded `/api/homelab/proxmox/shell/ws`, and received `OK`.
- 2026-05-22 live console smoke created `/api/homelab/proxmox/console/session`, upgraded `/api/homelab/proxmox/console/ws`, and received `RFB 003.008`.
- 2026-05-22 current-code live smoke on temp backend port 3031 returned inventory node `pve`, guests `500 services`, `300 truenas`, `400 nextcloud`, `200 openclaw`, `100 media`, `101 adguard`, shell websocket `OK`, and console websocket `RFB 003.008` for VM `500 services`.
- 2026-05-22 live control smoke called `/api/homelab/control` for console without a node in the payload and verified backend node inference returned `pve`.
- 2026-05-22 `scripts/proxmox-live-certify.mjs --read-only` added a repeatable non-mutating gate for `/api/homelab` inventory, `/api/homelab/proxmox/shell/session`, `/api/homelab/proxmox/shell/ws` greeting `OK`, `/api/homelab/proxmox/console/session`, `/api/homelab/proxmox/console/ws` greeting `RFB `, and single-node console node inference.
- 2026-05-22 the read-only certification runner passed an end-to-end local mock backend/websocket test proving API-key auth propagation, shell websocket greeting validation, console websocket greeting validation, single-node console node omission for inference, and fallback from a QEMU guest whose console cannot open to the next candidate.
- 2026-05-22 live read-only certification against the patched backend and current inventory passed when pinned to VMID `500` / `services`: `/api/homelab` returned node `pve` and 6 guests, shell websocket returned `OK`, console session inferred node `pve`, and console websocket returned `RFB 003.008`.
- 2026-05-22 live read-only certification also passed unpinned after candidate fallback was added: current inventory returned node `pve` and 6 guests, shell websocket returned `OK`, the runner selected VMID `100` / `media`, console session inferred node `pve`, and console websocket returned `RFB 003.008`. This was re-run against the current backend on `127.0.0.1:3010` after cleanup hardening.
- 2026-05-22 console startup was hardened after live pinned checks exposed transient Proxmox request failures. Backend console session creation now retries node inference and `vncproxy` request failures before returning an actionable error.
- 2026-05-22 live pinned read-only console certification passed for all currently running guests: VMID `100` / `media`, VMID `200` / `openclaw`, VMID `500` / `services`, and CT `101` / `adguard`. VMID `300` / `truenas` and VMID `400` / `nextcloud` were stopped; the frontend now blocks those with a stopped-guest message instead of opening a noVNC loader that cannot complete an RFB handshake.
- 2026-05-22 the disposable write certification runner gained a repeatable mock test for exact VMID/name identity refusal, same-value memory/CPU/network writes, snapshot create/delete with typed confirmation, optional add-disk/remove-disk hardware certification, optional add/set/remove HA certification, optional add/delete firewall rule certification by refreshed inventory position, optional backup submission plus backup archive deletion, optional disposable-only resize-disk growth, LXC create/lifecycle certification, lifecycle action ordering with inventory status checks, and one task-status poll per returned UPID.
- 2026-05-22 the disposable write certification runner gained a guarded `--create-disposable` mode. It refuses to reuse an existing VMID, creates a safe `clawcontrol-cert`/`cc-cert`/`test-clawcontrol` QEMU VM or LXC CT with small configurable resources, certifies the core write path, and deletes it with `purge` plus `destroy-unreferenced-disks` cleanup flags unless `--keep-disposable` is set. Mock coverage verifies create, certify, cleanup, and the refusal path.
- 2026-05-22 the disposable write certification runner was tightened to fail non-OK Proxmox UPID exitstatus values, tolerate Proxmox `WARNINGS:*` only when subsequent inventory verification proves the state, stop a running disposable VM before cleanup delete, verify new backup archives appear, delete those backup archives, verify the archives disappear, and restrict `--resize-disk` to QEMU `--create-disposable` because disk growth is irreversible.
- 2026-05-22 live disposable create/certify/delete passed against VMID `990` / `clawcontrol-cert-live-990` on node `pve` using `--create-disposable --hardware --firewall`. The live run created the VM, verified same-value memory/CPU/network writes, snapshot create/delete, temporary add-disk/remove-disk, guest firewall add/delete, and cleanup delete. A follow-up inventory check returned no VMID `990`.
- 2026-05-22 that live disposable run exposed and fixed two Proxmox API compatibility bugs before passing: create/add disk allocation values now normalize `local-lvm:1G`-style UI input into Proxmox allocation syntax, and DELETE cleanup flags are sent in the query string instead of a rejected DELETE body.
- 2026-05-22 strict live disposable certification passed against VMID `990` / `clawcontrol-cert-live-990` using `--create-disposable --resize-disk --backup-storage local`. The run created the VM, verified same-value config writes, snapshot create/delete, grew the disposable first disk by `+1G`, submitted a vzdump backup to `local`, verified the new archive appeared, deleted the archive, verified it disappeared, deleted the VM, and a follow-up inventory check returned no VMID `990` and no backup for VMID `990`.
- 2026-05-22 strict live disposable certification passed against VMID `990` / `clawcontrol-cert-live-990` using `--create-disposable --hardware --firewall --ha`. The run verified temporary add-disk/remove-disk, add/set/remove HA resource state, guest firewall add/delete, and cleanup delete. HA and firewall endpoints returned success without UPID tasks, which is valid for those Proxmox API paths.
- 2026-05-22 strict live disposable QEMU lifecycle certification using `--create-disposable --lifecycle` did not pass on the blank no-OS disposable VM. `start` reached `running`, but Proxmox returned `VM quit/powerdown failed - got timeout` for `reboot`; cleanup then stopped and deleted VMID `990`. That failure led to using an LXC template for lifecycle proof instead of a blank QEMU guest.
- 2026-05-22 strict live disposable LXC lifecycle certification passed against VMID `991` / `clawcontrol-cert-lifecycle-991` using `PROXMOX_CERTIFY_CREATE_KIND=lxc`, `PROXMOX_CERTIFY_CREATE_TEMPLATE=local:vztmpl/debian-13-standard_13.1-2_amd64.tar.zst`, and `--create-disposable --lifecycle`. The run created the CT, verified same-value memory/CPU/network config writes, snapshot create/delete, start, reboot, shutdown, start, stop, and delete. Follow-up inventory returned no VMID `991` and no backup for VMID `991`.
- 2026-05-22 live LXC certification exposed and fixed a real API parity bug: LXC config writes must use `PUT /api2/json/nodes/{node}/lxc/{vmid}/config`, not QEMU's `POST /config`. Unit coverage now checks this request method directly.
- Unit coverage includes fake-Proxmox runtime verification for console `vncproxy`, shell `termproxy`, action error bodies, core guest action methods/paths/forms, node mutation task enrichment, real `root@pam!token` task UPID validation, task log/status fetching, immediate UPID task-status enrichment, and frontend polling for UPID-returning VM actions.
- Frontend coverage includes persisted recent UPID activity after Proxmox VM actions, including selection changes, remounts, and poll status updates.
- Disposable live-write certification is scripted by `npm run proxmox:certify-live -- --yes --lifecycle`. The runner refuses to mutate a target unless VMID and exact guest name are supplied, and the name starts with `clawcontrol-cert`, `cc-cert`, or `test-clawcontrol` unless `PROXMOX_CERTIFY_ALLOW_ANY=I_UNDERSTAND_THIS_MUTATES_PROXMOX` is set.

Live-proven against disposable guests: CPU, memory, network, lifecycle start/reboot/shutdown/stop, disk add/remove, resize-disk on disposable QEMU, snapshot create/delete, backup create/delete, HA add/set/remove, firewall add/delete, create VM/CT, and delete VM/CT. Production inventory guests were not mutated.

## Disposable Live Certification

Run this first to certify the current inventory, embedded shell, embedded console, and node inference without mutation:

```bash
MC_API_KEY=dev-proxmox-smoke-key npm run proxmox:certify-live -- --read-only
```

Optionally pin the console target:

```bash
MC_API_KEY=dev-proxmox-smoke-key \
PROXMOX_CERTIFY_VMID=500 \
PROXMOX_CERTIFY_NAME=services \
npm run proxmox:certify-live -- --read-only
```

Run this only against a disposable guest:

```bash
MC_API_KEY=dev-proxmox-smoke-key \
PROXMOX_CERTIFY_VMID=900 \
PROXMOX_CERTIFY_NAME=clawcontrol-cert-vm \
npm run proxmox:certify-live -- --yes --lifecycle
```

Or let the runner create and delete a purpose-built disposable QEMU VM:

```bash
MC_API_KEY=dev-proxmox-smoke-key \
PROXMOX_CERTIFY_VMID=900 \
PROXMOX_CERTIFY_NAME=clawcontrol-cert-vm \
npm run proxmox:certify-live -- --yes --create-disposable --hardware --firewall --lifecycle
```

Use a disposable LXC template for graceful lifecycle proof:

```bash
MC_API_KEY=dev-proxmox-smoke-key \
PROXMOX_CERTIFY_VMID=901 \
PROXMOX_CERTIFY_NAME=clawcontrol-cert-ct \
PROXMOX_CERTIFY_CREATE_KIND=lxc \
PROXMOX_CERTIFY_CREATE_TEMPLATE=local:vztmpl/debian-13-standard_13.1-2_amd64.tar.zst \
npm run proxmox:certify-live -- --yes --create-disposable --lifecycle
```

The runner verifies inventory identity, then submits same-value CPU/memory/network config writes and creates/deletes a temporary snapshot. Passing `--hardware` also adds and removes a temporary QEMU disk, `--ha` adds/updates/removes HA resource state, `--firewall` adds a disabled uniquely commented guest firewall rule, refreshes inventory to find its returned position, then deletes that exact rule, `--resize-disk` grows the first visible QEMU disk by `+1G` and is only allowed with QEMU `--create-disposable`, `--lifecycle` certifies `start`, `reboot`, `shutdown`, `start`, `stop`, and original running-state restore with live inventory status checks, and `--backup-storage <store>` certifies manual backup submission plus backup archive deletion. In `--create-disposable` mode, the runner also certifies guest deletion by cleaning up the created guest with purge/destroy-unreferenced-disk flags.

## Next Ship Sequence

1. Keep the capability registry complete before adding any new control.
2. Upgrade console and shell UX to Proxmox-grade controls and browser-certify both panels.
3. Expand guest QEMU/LXC config parity, then certify disposable QEMU and LXC flows.
4. Expand node network/DNS/hosts/time/repos/updates, disks/ZFS/Ceph, and logs.
5. Expand datacenter permissions, firewall, HA groups, backup jobs, replication, pools, SDN, certs, and notifications.
6. Add mock Proxmox server and Playwright real-workflow certification.
