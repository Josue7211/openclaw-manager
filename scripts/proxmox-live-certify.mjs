#!/usr/bin/env node

const DEFAULT_BASE = 'http://127.0.0.1:3010'
const REQUIRED_ANY_TARGET_ACK = 'I_UNDERSTAND_THIS_MUTATES_PROXMOX'
const SAFE_NAME_PREFIXES = ['clawctrl-cert', 'cc-cert', 'test-clawctrl']

function argValue(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function hasFlag(name) {
  return process.argv.includes(name)
}

function usage() {
  console.log(`Usage:
  MC_API_KEY=... npm run proxmox:certify-live -- --read-only

  MC_API_KEY=... PROXMOX_CERTIFY_VMID=900 PROXMOX_CERTIFY_NAME=clawctrl-cert-vm \\
    npm run proxmox:certify-live -- --lifecycle

  MC_API_KEY=... PROXMOX_CERTIFY_VMID=900 PROXMOX_CERTIFY_NAME=clawctrl-cert-vm \\
    npm run proxmox:certify-live -- --create-disposable --hardware --firewall --lifecycle --yes

  MC_API_KEY=... PROXMOX_CERTIFY_VMID=901 PROXMOX_CERTIFY_NAME=clawctrl-cert-ct \\
    PROXMOX_CERTIFY_CREATE_KIND=lxc PROXMOX_CERTIFY_CREATE_TEMPLATE=local:vztmpl/debian-13-standard_13.1-2_amd64.tar.zst \\
    npm run proxmox:certify-live -- --create-disposable --lifecycle --yes

Environment:
  CLAWCTRL_API_BASE       Backend base URL. Defaults to ${DEFAULT_BASE}
  MC_API_KEY                 Backend API key. CLAWCTRL_API_KEY also works.
  PROXMOX_CERTIFY_VMID       Disposable VMID to mutate, or read-only console target.
  PROXMOX_CERTIFY_NAME       Exact guest name expected for that VMID.
  PROXMOX_CERTIFY_NODE       Optional node assertion.
  PROXMOX_CERTIFY_ALLOW_ANY  Set to ${REQUIRED_ANY_TARGET_ACK} to bypass name-prefix guard.
  PROXMOX_CERTIFY_POLL_MS    Task poll interval. Defaults to 2500.
  PROXMOX_CERTIFY_POLLS      Task poll attempts. Defaults to 24.
  PROXMOX_CERTIFY_TEMP_DISK  Temporary disk key for --hardware. Defaults to scsi1.
  PROXMOX_CERTIFY_DISK_VALUE Temporary disk config for --hardware. Defaults to local-lvm:1G.
  PROXMOX_CERTIFY_CREATE_STORAGE Storage for --create-disposable VM disk. Defaults to local-lvm.
  PROXMOX_CERTIFY_CREATE_DISK    Disk size for --create-disposable VM. Defaults to 1G.
  PROXMOX_CERTIFY_CREATE_NET0    Network config for --create-disposable VM. Defaults to virtio,bridge=vmbr0,firewall=1.
  PROXMOX_CERTIFY_CREATE_KIND    qemu or lxc for --create-disposable. Defaults to qemu.
  PROXMOX_CERTIFY_CREATE_TEMPLATE OS template volid for LXC --create-disposable.

Flags:
  --read-only                Certify inventory, shell session, and console session without mutation.
  --no-ws                    In read-only mode, create sessions but do not open websocket handshakes.
  --create-disposable        Create the target VM first, certify it, then delete it unless --keep-disposable is set.
  --keep-disposable          Do not delete a VM created by --create-disposable after certification.
  --hardware                 Also add and remove a temporary disk on the disposable VM.
  --ha                       Also add, update, and remove HA resource state on the disposable VM.
  --firewall                 Also add and remove one uniquely commented guest firewall rule.
  --resize-disk              Also grow the disposable VM's first disk by +1G. Requires --create-disposable.
  --lifecycle                Also certify start/reboot/shutdown/stop and restore original running/stopped state.
  --backup-storage <store>   Also submit a manual backup to the target storage.
  --yes                      Required acknowledgement that this can mutate the target VM.
`)
}

function requireValue(value, label) {
  if (!value || !String(value).trim()) {
    throw new Error(`${label} is required`)
  }
  return String(value).trim()
}

const base = (process.env.CLAWCTRL_API_BASE || DEFAULT_BASE).replace(/\/$/, '')
const apiKey = process.env.CLAWCTRL_API_KEY || process.env.MC_API_KEY
const targetVmid = Number(process.env.PROXMOX_CERTIFY_VMID || argValue('--vmid'))
const targetName = process.env.PROXMOX_CERTIFY_NAME || argValue('--name')
const targetNode = process.env.PROXMOX_CERTIFY_NODE || argValue('--node')
const readOnly = hasFlag('--read-only')
const skipWs = hasFlag('--no-ws')
const runHardware = hasFlag('--hardware')
const runHa = hasFlag('--ha')
const runFirewall = hasFlag('--firewall')
const runResizeDisk = hasFlag('--resize-disk')
const runLifecycle = hasFlag('--lifecycle')
const createDisposable = hasFlag('--create-disposable')
const keepDisposable = hasFlag('--keep-disposable')
const backupStorage = argValue('--backup-storage')
const taskPollIntervalMs = Math.max(1, Number(process.env.PROXMOX_CERTIFY_POLL_MS || 2500))
const taskPollAttempts = Math.max(1, Number(process.env.PROXMOX_CERTIFY_POLLS || 24))
const tempDisk = process.env.PROXMOX_CERTIFY_TEMP_DISK || argValue('--temp-disk') || 'scsi1'
const tempDiskValue = process.env.PROXMOX_CERTIFY_DISK_VALUE || argValue('--disk-value') || 'local-lvm:1G'
const createStorage = process.env.PROXMOX_CERTIFY_CREATE_STORAGE || argValue('--create-storage') || 'local-lvm'
const createDiskSize = process.env.PROXMOX_CERTIFY_CREATE_DISK || argValue('--create-disk') || '1G'
const createKind = (process.env.PROXMOX_CERTIFY_CREATE_KIND || argValue('--create-kind') || 'qemu').toLowerCase()
const createTemplate = process.env.PROXMOX_CERTIFY_CREATE_TEMPLATE || argValue('--create-template')
const createNet0 = process.env.PROXMOX_CERTIFY_CREATE_NET0 || argValue('--create-net0') || (createKind === 'lxc' ? 'name=eth0,bridge=vmbr0,ip=dhcp,firewall=1' : 'virtio,bridge=vmbr0,firewall=1')

if (hasFlag('--help') || hasFlag('-h')) {
  usage()
  process.exit(0)
}

try {
  requireValue(apiKey, 'MC_API_KEY or CLAWCTRL_API_KEY')
  if (!readOnly) {
    requireValue(targetName, 'PROXMOX_CERTIFY_NAME or --name')
    if (!Number.isFinite(targetVmid) || targetVmid <= 0) {
      throw new Error('PROXMOX_CERTIFY_VMID or --vmid must be a positive number')
    }
    if (!hasFlag('--yes')) {
      throw new Error('--yes is required because this script mutates the selected Proxmox guest')
    }
  }
} catch (error) {
  console.error(error.message)
  usage()
  process.exit(2)
}

if (!readOnly) {
  const safeName = SAFE_NAME_PREFIXES.some(prefix => targetName.toLowerCase().startsWith(prefix))
  const allowAny = process.env.PROXMOX_CERTIFY_ALLOW_ANY === REQUIRED_ANY_TARGET_ACK
  if (!safeName && !allowAny) {
    console.error(`Refusing to mutate "${targetName}". Name must start with one of ${SAFE_NAME_PREFIXES.join(', ')}.`)
    console.error(`To override, set PROXMOX_CERTIFY_ALLOW_ANY=${REQUIRED_ANY_TARGET_ACK}`)
    process.exit(2)
  }
  if (runResizeDisk && !createDisposable) {
    console.error('Refusing --resize-disk without --create-disposable because disk growth is irreversible.')
    process.exit(2)
  }
  if (!['qemu', 'lxc'].includes(createKind)) {
    console.error('PROXMOX_CERTIFY_CREATE_KIND must be qemu or lxc')
    process.exit(2)
  }
  if (createDisposable && createKind === 'lxc') {
    requireValue(createTemplate, 'PROXMOX_CERTIFY_CREATE_TEMPLATE or --create-template is required for LXC --create-disposable')
  }
  if (createKind === 'lxc' && (runHardware || runResizeDisk)) {
    console.error('LXC disposable certification does not support --hardware or --resize-disk; use QEMU for those paths.')
    process.exit(2)
  }
}

async function request(path, body) {
  const response = await fetch(`${base}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  let parsed
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    parsed = text
  }
  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}: ${text.slice(0, 800)}`)
  }
  return parsed && typeof parsed === 'object' && 'data' in parsed ? parsed.data : parsed
}

function websocketUrl(relativeUrl) {
  const wsBase = base.startsWith('https://')
    ? `wss://${base.slice('https://'.length)}`
    : base.startsWith('http://')
      ? `ws://${base.slice('http://'.length)}`
      : base
  const separator = relativeUrl.includes('?') ? '&' : '?'
  return `${wsBase}${relativeUrl}${separator}apiKey=${encodeURIComponent(apiKey)}`
}

async function readWebsocketGreeting(relativeUrl, label, expectedPrefix) {
  if (skipWs) {
    console.log(`[ws] ${label}: skipped by --no-ws`)
    return
  }
  if (typeof WebSocket !== 'function') {
    throw new Error('Node WebSocket global is unavailable. Use Node 22+ or pass --no-ws.')
  }

  await new Promise((resolve, reject) => {
    let socket
    const timer = setTimeout(() => {
      try {
        socket?.close()
      } catch {
        // Ignore close failures while timing out.
      }
      reject(new Error(`${label} websocket did not receive ${expectedPrefix} within 8s`))
    }, 8000)

    socket = new WebSocket(websocketUrl(relativeUrl))
    socket.binaryType = 'arraybuffer'
    socket.onerror = () => {
      clearTimeout(timer)
      reject(new Error(`${label} websocket failed to connect`))
    }
    socket.onmessage = event => {
      const data = event.data instanceof ArrayBuffer
        ? Buffer.from(event.data).toString('utf8')
        : Buffer.isBuffer(event.data)
          ? event.data.toString('utf8')
          : String(event.data)
      clearTimeout(timer)
      socket.close()
      if (!data.startsWith(expectedPrefix)) {
        reject(new Error(`${label} websocket returned unexpected greeting: ${JSON.stringify(data.slice(0, 120))}`))
        return
      }
      console.log(`[ws] ${label}: ${JSON.stringify(data.slice(0, 32))}`)
      resolve()
    }
  })
}

function readOnlyVmCandidates(homelab) {
  const vms = homelab?.proxmox?.vms ?? []
  if (Number.isFinite(targetVmid) && targetVmid > 0) {
    const vm = vms.find(item => Number(item.vmid) === targetVmid)
    if (!vm) throw new Error(`VMID ${targetVmid} not found in /api/homelab inventory`)
    if (targetName && vm.name !== targetName) {
      throw new Error(`VMID ${targetVmid} is named "${vm.name}", not expected "${targetName}"`)
    }
    if (targetNode && vm.node !== targetNode) {
      throw new Error(`VMID ${targetVmid} is on node "${vm.node}", not expected "${targetNode}"`)
    }
    return [vm]
  }

  const qemu = vms.filter(item => (item.kind || 'qemu') !== 'lxc')
  return [
    ...qemu.filter(item => item.status === 'running'),
    ...qemu.filter(item => item.status !== 'running'),
  ]
}

async function certifyReadOnly() {
  const homelab = await request('/api/homelab')
  const nodes = homelab?.proxmox?.nodes ?? []
  if (!nodes.length) throw new Error('No Proxmox nodes returned by /api/homelab')
  const node = targetNode
    ? nodes.find(item => item.name === targetNode)
    : nodes.find(item => item.status === 'online') ?? nodes[0]
  if (!node) throw new Error(`Node "${targetNode}" not found in /api/homelab inventory`)

  console.log(`[inventory] nodes=${nodes.map(item => item.name).join(', ')} guests=${homelab?.proxmox?.vms?.length ?? 0}`)

  const shellSession = await request('/api/homelab/proxmox/shell/session', { node: node.name })
  if (!shellSession?.sessionId || !shellSession?.websocketUrl) {
    throw new Error(`Shell session response missing sessionId/websocketUrl: ${JSON.stringify(shellSession)}`)
  }
  console.log(`[session] shell node=${node.name} id=${shellSession.sessionId}`)
  await readWebsocketGreeting(shellSession.websocketUrl, 'shell', 'OK')

  const candidates = readOnlyVmCandidates(homelab)
  if (!candidates.length) {
    console.log('[skip] console: no QEMU VM available in inventory')
    return
  }
  const singleNodeCanInfer = nodes.length === 1
  const pinnedConsoleTarget = Number.isFinite(targetVmid) && targetVmid > 0
  let lastConsoleError
  for (const vm of candidates) {
    try {
      const consoleSession = await request('/api/homelab/proxmox/console/session', {
        kind: vm.kind || 'qemu',
        vmid: vm.vmid,
        ...(singleNodeCanInfer ? {} : { node: vm.node || node.name }),
      })
      if (!consoleSession?.sessionId || !consoleSession?.websocketUrl) {
        throw new Error(`Console session response missing sessionId/websocketUrl: ${JSON.stringify(consoleSession)}`)
      }
      console.log(`[session] console ${vm.node || node.name}/${vm.kind || 'qemu'}/${vm.vmid} ${vm.name} id=${consoleSession.sessionId}${singleNodeCanInfer ? ' node=inferred' : ''}`)
      await readWebsocketGreeting(consoleSession.websocketUrl, 'console', 'RFB ')
      console.log('[done] Proxmox read-only certification completed.')
      return
    } catch (error) {
      lastConsoleError = error
      if (pinnedConsoleTarget) throw error
      console.log(`[skip] console ${vm.node || node.name}/${vm.kind || 'qemu'}/${vm.vmid} ${vm.name}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  throw lastConsoleError ?? new Error('No QEMU console candidate could be certified')
}

function taskStatusPayload(result) {
  const response = result?.response
  return response && typeof response === 'object' && 'data' in response ? response.data : response
}

function isFinalTask(payload) {
  if (!payload || typeof payload !== 'object') return false
  const status = String(payload.status || '').toLowerCase()
  return Boolean(payload.exitstatus) || ['stopped', 'ok', 'error', 'warning'].includes(status)
}

function assertTaskSucceeded(payload, label) {
  const exitstatus = payload?.exitstatus
  if (exitstatus) {
    const normalized = String(exitstatus).toUpperCase()
    if (normalized === 'OK') return
    if (normalized.startsWith('WARNINGS:') || normalized.startsWith('WARNING:')) {
      console.log(`[task] ${label} completed with ${exitstatus}; continuing with inventory verification`)
      return
    }
    throw new Error(`${label} task finished with exitstatus ${exitstatus}`)
  }
  const status = String(payload?.status || '').toLowerCase()
  if (status === 'error') {
    throw new Error(`${label} task finished with error status`)
  }
}

async function sleep(ms) {
  await new Promise(resolve => setTimeout(resolve, ms))
}

async function pollTask(task, label) {
  if (!task?.upid || !task?.node) return
  for (let attempt = 1; attempt <= taskPollAttempts; attempt += 1) {
    await sleep(taskPollIntervalMs)
    const result = await request('/api/homelab/control', {
      provider: 'proxmox',
      resourceType: 'task',
      resourceId: task.upid,
      action: 'task-status',
      args: { node: task.node, name: task.upid },
    })
    const payload = taskStatusPayload(result)
    const status = payload?.status || payload?.exitstatus || 'unknown'
    console.log(`[task] ${label} poll ${attempt}: ${status}`)
    if (isFinalTask(payload)) {
      assertTaskSucceeded(payload, label)
      return payload
    }
  }
  throw new Error(`${label} task did not finish within polling window: ${task.upid}`)
}

async function runAction(vm, action, args = {}, options = {}) {
  const input = {
    provider: 'proxmox',
    resourceType: vm.kind === 'lxc' ? 'lxc' : 'vm',
    resourceId: String(vm.vmid),
    action,
    args: {
      node: vm.node,
      kind: vm.kind || 'qemu',
      name: vm.name,
      ...args,
    },
    confirmation: options.confirm ? vm.name : undefined,
  }
  console.log(`[action] ${action}`)
  const result = await request('/api/homelab/control', input)
  if (result?.task) {
    await pollTask(result.task, action)
  } else {
    console.log(`[action] ${action} returned without UPID task`)
  }
  return result
}

async function runBackupAction(backup, action, args = {}, options = {}) {
  const input = {
    provider: 'proxmox',
    resourceType: 'backup',
    resourceId: backup.volid,
    action,
    args: {
      node: backup.node,
      name: backup.name,
      archive: backup.volid,
      kind: backup.kind,
      vmid: backup.vmid,
      storage: backup.storage,
      ...args,
    },
    confirmation: options.confirm ? backup.name : undefined,
  }
  console.log(`[action] ${action}`)
  const result = await request('/api/homelab/control', input)
  if (result?.task) {
    await pollTask(result.task, action)
  } else {
    console.log(`[action] ${action} returned without UPID task`)
  }
  return result
}

async function runNodeAction(node, action, args = {}) {
  const input = {
    provider: 'proxmox',
    resourceType: 'node',
    resourceId: node,
    action,
    args: {
      node,
      name: node,
      ...args,
    },
  }
  console.log(`[action] ${action}`)
  const result = await request('/api/homelab/control', input)
  if (result?.task) {
    await pollTask(result.task, action)
  } else {
    console.log(`[action] ${action} returned without UPID task`)
  }
  return result
}

function findTargetVm(homelab) {
  return homelab?.proxmox?.vms?.find(item => Number(item.vmid) === targetVmid)
}

async function waitForTargetVm(label) {
  let lastError
  for (let attempt = 1; attempt <= taskPollAttempts; attempt += 1) {
    await sleep(taskPollIntervalMs)
    try {
      const homelab = await request('/api/homelab')
      const vm = findTargetVm(homelab)
      if (vm) {
        if (vm.name !== targetName) {
          throw new Error(`VMID ${targetVmid} is named "${vm.name}", not expected "${targetName}"`)
        }
        if (targetNode && vm.node !== targetNode) {
          throw new Error(`VMID ${targetVmid} is on node "${vm.node}", not expected "${targetNode}"`)
        }
        console.log(`[inventory] ${label} visible after refresh ${attempt}: ${vm.node}/${vm.kind}/${vm.vmid} ${vm.name} status=${vm.status}`)
        return vm
      }
    } catch (error) {
      lastError = error
    }
  }
  throw lastError ?? new Error(`VMID ${targetVmid} did not appear in /api/homelab inventory`)
}

async function refreshTargetVm(expectedVm) {
  const refreshed = await request('/api/homelab')
  const next = refreshed?.proxmox?.vms?.find(item => Number(item.vmid) === Number(expectedVm.vmid))
  if (!next) throw new Error(`VMID ${expectedVm.vmid} disappeared from /api/homelab inventory`)
  if (next.name !== expectedVm.name) {
    throw new Error(`VMID ${expectedVm.vmid} is named "${next.name}", not expected "${expectedVm.name}" after refresh`)
  }
  return next
}

async function refreshTargetVmOrNull(expectedVm) {
  const refreshed = await request('/api/homelab')
  const next = refreshed?.proxmox?.vms?.find(item => Number(item.vmid) === Number(expectedVm.vmid))
  if (!next) return null
  if (next.name !== expectedVm.name) {
    throw new Error(`VMID ${expectedVm.vmid} is named "${next.name}", not expected "${expectedVm.name}" after refresh`)
  }
  return next
}

async function waitForTargetStatus(expectedVm, expectedStatus, label) {
  let latest = null
  for (let attempt = 1; attempt <= taskPollAttempts; attempt += 1) {
    await sleep(taskPollIntervalMs)
    latest = await refreshTargetVm(expectedVm)
    if (String(latest.status || '').toLowerCase() === expectedStatus) {
      console.log(`[inventory] ${label} reached ${expectedStatus} after refresh ${attempt}`)
      return latest
    }
  }
  throw new Error(
    `${label} did not reach ${expectedStatus}; latest status was ${latest?.status || 'unknown'}`
  )
}

function backupSetForVm(homelab, vm) {
  return new Set(
    (homelab?.proxmox?.backups ?? [])
      .filter(item => Number(item.vmid) === Number(vm.vmid))
      .map(item => item.volid)
      .filter(Boolean)
  )
}

async function waitForNewBackup(vm, beforeVolids) {
  for (let attempt = 1; attempt <= taskPollAttempts; attempt += 1) {
    await sleep(taskPollIntervalMs)
    const homelab = await request('/api/homelab')
    const backup = (homelab?.proxmox?.backups ?? []).find(item => (
      Number(item.vmid) === Number(vm.vmid) &&
      item.volid &&
      !beforeVolids.has(item.volid)
    ))
    if (backup) {
      console.log(`[inventory] backup visible after refresh ${attempt}: ${backup.volid}`)
      return backup
    }
  }
  throw new Error(`backup task completed but no new backup archive appeared for VMID ${vm.vmid}`)
}

async function waitForBackupAbsent(backup) {
  for (let attempt = 1; attempt <= taskPollAttempts; attempt += 1) {
    await sleep(taskPollIntervalMs)
    const homelab = await request('/api/homelab')
    const exists = (homelab?.proxmox?.backups ?? []).some(item => item.volid === backup.volid)
    if (!exists) {
      console.log(`[inventory] backup absent after refresh ${attempt}: ${backup.volid}`)
      return
    }
  }
  throw new Error(`backup delete task completed but archive is still visible: ${backup.volid}`)
}

async function cleanupCreatedDisposableVm(createdVm) {
  let latest = await refreshTargetVmOrNull(createdVm)
  if (!latest) {
    console.log(`[cleanup] disposable VM ${createdVm.vmid} ${createdVm.name} is already absent`)
    return
  }
  if (String(latest.status || '').toLowerCase() === 'running') {
    try {
      await runAction(latest, 'stop')
      latest = await refreshTargetVmOrNull(createdVm)
    } catch (stopError) {
      console.error(`[cleanup] failed to stop disposable VM ${createdVm.vmid} before delete: ${stopError instanceof Error ? stopError.message : String(stopError)}`)
    }
  }
  if (!latest) {
    console.log(`[cleanup] disposable VM ${createdVm.vmid} ${createdVm.name} is already absent after stop`)
    return
  }
  await runAction(latest, 'delete', { purge: true, destroy_unreferenced_disks: true }, { confirm: true })
  console.log(`[cleanup] deleted disposable VM ${createdVm.vmid} ${createdVm.name}`)
}

function configNumber(vm, key, fallback) {
  const value = vm.config?.[key]
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

async function certifyDisposableVm(vm) {
  console.log(`[target] ${vm.node}/${vm.kind}/${vm.vmid} ${vm.name} status=${vm.status}`)

  const memoryMb = configNumber(vm, 'memory', vm.maxmem ? Math.round(vm.maxmem / 1048576) : 1024)
  const cores = configNumber(vm, 'cores', 1)
  const firstNic = vm.networks?.[0]

  await runAction(vm, 'set-memory', { memory_mb: memoryMb })
  await runAction(vm, 'set-cpu', { cores })
  if (firstNic?.key && firstNic?.value) {
    await runAction(vm, 'set-network', { net: firstNic.key, value: firstNic.value })
  } else {
    console.log('[skip] set-network: no NIC config visible in inventory')
  }

  const snapname = `clawctrl-cert-${Date.now()}`
  await runAction(vm, 'snapshot', { snapname, description: 'clawctrl disposable live certification snapshot' })
  await runAction(vm, 'delete-snapshot', { snapname }, { confirm: true })

  if (runHardware) {
    if (vm.kind === 'lxc') throw new Error('--hardware requires a QEMU disposable VM')
    await runAction(vm, 'add-disk', { disk: tempDisk, value: tempDiskValue })
    await runAction(vm, 'remove-disk', { disk: tempDisk }, { confirm: true })
  } else {
    console.log('[skip] hardware actions. Pass --hardware to certify temporary add-disk/remove-disk on disposable VM.')
  }

  if (runHa) {
    await runAction(vm, 'add-ha', { state: 'started', comment: 'clawctrl disposable live certification' })
    await runAction(vm, 'set-ha-state', { state: 'started' })
    await runAction(vm, 'remove-ha', {}, { confirm: true })
  } else {
    console.log('[skip] HA actions. Pass --ha to certify add-ha/set-ha-state/remove-ha on disposable VM.')
  }

  if (runFirewall) {
    const comment = `clawctrl-cert-${Date.now()}`
    await runAction(vm, 'add-firewall-rule', {
      type: 'in',
      action: 'ACCEPT',
      proto: 'tcp',
      dport: '65535',
      source: '127.0.0.1',
      comment,
      enable: false,
    })
    const refreshedVm = await refreshTargetVm(vm)
    const rule = refreshedVm.firewall_rules?.find(item => item.comment === comment)
    if (rule?.pos === undefined || rule?.pos === null) {
      throw new Error(`Unable to find temporary firewall rule "${comment}" in refreshed inventory; delete it manually before retrying.`)
    }
    await runAction(vm, 'delete-firewall-rule', { pos: rule.pos }, { confirm: true })
  } else {
    console.log('[skip] firewall actions. Pass --firewall to certify add-firewall-rule/delete-firewall-rule on disposable VM.')
  }

  if (runResizeDisk) {
    if (vm.kind === 'lxc') throw new Error('--resize-disk requires a QEMU disposable VM')
    const firstDisk = vm.disks?.find(item => item.key && !String(item.key).startsWith('unused'))
    if (!firstDisk?.key) throw new Error('resize-disk requested but no disk key is visible in inventory')
    await runAction(vm, 'resize-disk', { disk: firstDisk.key, size: '+1G' })
  } else {
    console.log('[skip] resize-disk action. Pass --resize-disk with --create-disposable to certify irreversible disk growth safely.')
  }

  if (backupStorage) {
    const beforeBackups = backupSetForVm(await request('/api/homelab'), vm)
    await runAction(vm, 'backup', { mode: 'snapshot', storage: backupStorage, compress: 'zstd' })
    const backup = await waitForNewBackup(vm, beforeBackups)
    await runBackupAction(backup, 'delete-backup', {}, { confirm: true })
    await waitForBackupAbsent(backup)
  }

  if (runLifecycle) {
    let latest = await refreshTargetVm(vm)
    const originalRunning = latest.status === 'running'
    if (!originalRunning) {
      await runAction(latest, 'start')
      latest = await waitForTargetStatus(latest, 'running', 'start')
    }
    await runAction(latest, 'reboot')
    latest = await waitForTargetStatus(latest, 'running', 'reboot')
    await runAction(latest, 'shutdown')
    latest = await waitForTargetStatus(latest, 'stopped', 'shutdown')
    await runAction(latest, 'start')
    latest = await waitForTargetStatus(latest, 'running', 'start')
    await runAction(latest, 'stop')
    latest = await waitForTargetStatus(latest, 'stopped', 'stop')
    if (originalRunning) {
      await runAction(latest, 'start')
      await waitForTargetStatus(latest, 'running', 'restore-start')
    }
  } else {
    console.log('[skip] lifecycle actions. Pass --lifecycle to certify start/reboot/shutdown/stop on disposable VM.')
  }
}

if (readOnly) {
  await certifyReadOnly()
  process.exit(0)
}

let homelab = await request('/api/homelab')
let vm = findTargetVm(homelab)
let createdVm = null

if (createDisposable) {
  if (vm) throw new Error(`Refusing --create-disposable because VMID ${targetVmid} already exists as "${vm.name}"`)
  const nodes = homelab?.proxmox?.nodes ?? []
  const node = targetNode
    ? nodes.find(item => item.name === targetNode)
    : nodes.find(item => item.status === 'online') ?? nodes[0]
  if (!node?.name) throw new Error('No Proxmox node available for --create-disposable')
  if (createKind === 'lxc') {
    await runNodeAction(node.name, 'create-lxc', {
      vmid: targetVmid,
      name: targetName,
      ostemplate: createTemplate,
      memory_mb: 512,
      cores: 1,
      storage: createStorage,
      disk_size: createDiskSize,
      net0: createNet0,
      start: false,
    })
  } else {
    await runNodeAction(node.name, 'create-vm', {
      vmid: targetVmid,
      name: targetName,
      memory_mb: 512,
      cores: 1,
      storage: createStorage,
      disk_size: createDiskSize,
      net0: createNet0,
      start: false,
    })
  }
  vm = await waitForTargetVm('created disposable VM')
  createdVm = vm
} else {
  if (!vm) throw new Error(`VMID ${targetVmid} not found in /api/homelab inventory`)
  if (vm.name !== targetName) {
    throw new Error(`VMID ${targetVmid} is named "${vm.name}", not expected "${targetName}"`)
  }
  if (targetNode && vm.node !== targetNode) {
    throw new Error(`VMID ${targetVmid} is on node "${vm.node}", not expected "${targetNode}"`)
  }
}

let certError = null
try {
  await certifyDisposableVm(vm)
} catch (error) {
  certError = error
} finally {
  if (createdVm && !keepDisposable) {
    try {
      await cleanupCreatedDisposableVm(createdVm)
    } catch (cleanupError) {
      console.error(`[cleanup] failed to delete disposable VM ${createdVm.vmid} ${createdVm.name}: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`)
      if (!certError) certError = cleanupError
    }
  } else if (createdVm && keepDisposable) {
    console.log(`[cleanup] kept disposable VM ${createdVm.vmid} ${createdVm.name} because --keep-disposable was set`)
  }
}

if (certError) throw certError
console.log('[done] Proxmox disposable VM certification completed.')
