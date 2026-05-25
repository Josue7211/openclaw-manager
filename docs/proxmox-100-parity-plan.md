# Proxmox 100% Parity Plan

Objective: ClawControl must be usable as the primary Proxmox VE control plane for day-to-day operations, including console, shell, guests, nodes, storage, networking, firewall, backup, HA, permissions, tasks, datacenter, and cluster administration. Until every row below is implemented and verified, the module must not be described as 100% parity.

Official scope source:

- Proxmox VE API viewer: https://pve.proxmox.com/pve-docs/api-viewer/
- Proxmox VE API wiki: https://pve.proxmox.com/wiki/Proxmox_VE_API
- Proxmox VE Administration Guide: https://pve.proxmox.com/pve-docs/pve-admin-guide.pdf

## Non-Negotiable Rules

1. No fake controls. A visible active control must be present in `/api/homelab.control.actions`, backed by a route, and covered by tests.
2. Capability truth comes from `/api/homelab.control.capabilities`; UI copy cannot overclaim status.
3. Destructive actions require typed confirmation, backend validation, audit logging, and task/result visibility.
4. Live write certification can only mutate disposable `clawcontrol-cert*`, `cc-cert*`, or `test-clawcontrol*` resources unless the operator explicitly overrides the guard.
5. Completion requires browser verification for UI fidelity, unit tests for backend paths, mock API tests, and live read-only plus disposable write certification.

## Implementation Phases

### Phase 1: Truth, Navigation, And Console Fidelity

Status: in progress.

Deliverables:

- Capability registry covering implemented, read-only, and blocked Proxmox surfaces.
- Datacenter Coverage tab showing exactly what is implemented vs missing.
- Proxmox-like resource tree and config tabs for datacenter, node, QEMU, LXC, storage, backup, HA, services, tasks, firewall, and permissions.
- Console panel with noVNC reconnect, scale, resize, Ctrl-Alt-Del, fullscreen, clipboard/paste, keyboard capture state, and stopped-guest actions.
- Shell panel with xterm.js reconnect, copy, paste, clear, fullscreen, resize, and status/error states.

Acceptance:

- No placeholder can look like a working control.
- Console and shell are visually and behaviorally certified in browser tests.
- `/api/homelab.control.capabilities` contains the full surface map.

### Phase 2: Guest Parity

Surfaces:

- QEMU: summary, console, hardware, options, task history, monitor, backup, replication, snapshots, firewall, permissions.
- LXC: summary, console, resources, network, DNS, options, task history, backup, replication, snapshots, firewall, permissions.

Backend work:

- Cover every common QEMU and LXC config key exposed by Proxmox.
- Add monitor command routes with guarded command input.
- Add clone/template conversion, cloud-init, boot order, machine/BIOS/TPM/EFI, serial, USB, PCI, audio, NUMA, hotplug, startup/shutdown order, agent, lock/unlock, suspend/resume/reset where supported.
- Add guest permission views and ACL mutations.

Acceptance:

- Disposable QEMU and LXC cert runners create, configure, snapshot, backup, restore, clone, migrate, firewall, HA, and delete.
- Production guests are read-only unless explicitly targeted by operator-confirmed actions.

### Phase 3: Datacenter And Cluster Parity

Surfaces:

- Search, summary, cluster resources, options, storage, backup jobs, replication, HA, firewall, permissions, pools, SDN, notifications, metrics, tasks, logs.

Backend work:

- Cluster options read/write.
- Backup job CRUD, schedules, run-now, retention, prune, notes, task tracking.
- Replication job CRUD/run/status.
- HA groups, policies, status, CRM/LRM diagnostics.
- Pools CRUD and membership management.
- SDN read inventory is now covered for status, zones, VNets, per-VNet subnets, controllers, IPAM, DNS, and DHCP providers; remaining work is guarded CRUD plus apply/rollback task tracking.
- Logs read inventory is now covered for cluster log, node syslog, and node journal; remaining work is search, download, severity filters, and follow/tail streaming.
- Notification targets, matchers, test-send, and history.

Acceptance:

- Datacenter dashboard can perform every routine cluster-level operation without opening Proxmox.

### Phase 4: Node Parity

Status: read-side inventory started. Node Network, DNS, Hosts, Time, and Repositories tabs now render Proxmox API inventory; write/apply/update flows remain.

Surfaces:

- Summary, shell, system, network, DNS, hosts, time, syslog/journal, updates, repositories, firewall, disks, LVM, LVM-thin, ZFS, Ceph, certificates, services, tasks.

Backend work:

- Editable network interface flow with apply/revert.
- DNS, hosts, time/NTP write support.
- Repository inventory and apt update/upgrade/package task flows.
- Disk initialize/wipe/smart, directory storage, LVM, LVM-thin, ZFS, and Ceph panels.
- Certificate upload, ACME accounts/plugins/orders.
- Syslog/journal search and download.

Acceptance:

- Node admin operations that normally require Proxmox are available in ClawControl with guarded destructive paths.

### Phase 5: Storage And Backup Content Parity

Surfaces:

- Storage config, node storage status, content browser, upload/download/delete ISO/templates/backups/images/rootdir, backup protection, restore flows.

Backend work:

- Storage config CRUD across supported storage types.
- Content upload/download/delete/protect/unprotect.
- Restore to new VMID/CTID with target storage/network options and task polling.
- Backup notes and retention/prune.

Acceptance:

- ISO/template/backup workflows work end to end without Proxmox UI.

### Phase 6: Firewall, SDN, And Permissions

Surfaces:

- Datacenter/node/guest firewall options/rules, aliases, ipsets, security groups, macros.
- SDN zones, VNets, subnets, IPAM, DNS, DHCP, apply.
- Users, groups, roles, API tokens, ACLs, realms, two-factor state where API-supported.

Acceptance:

- Network/security/identity administration is possible from ClawControl with clear permission and task feedback.

### Phase 7: Certification And Release Gate

Required gates:

- Rust unit tests for every backend path and validation rule.
- Frontend unit tests for tabs, controls, blocked action hiding, and task polling.
- Mock Proxmox API certification for read and write flows.
- Live read-only certification against current inventory.
- Live disposable write certification for QEMU and LXC.
- Playwright screenshots for desktop/mobile Proxmox module, console, shell, loading, blocked surfaces, and action dialogs.
- Final parity matrix row-by-row audit in `docs/proxmox-parity-matrix.md`.

Definition of done:

- Every Proxmox VE dashboard surface in this plan is implemented or intentionally marked out of scope by the user.
- Every visible control is backed by a verified backend route.
- There are no generic "feature not available" failures for advertised actions.
- The user can operate Proxmox VE from ClawControl for normal administration without opening the Proxmox dashboard.
