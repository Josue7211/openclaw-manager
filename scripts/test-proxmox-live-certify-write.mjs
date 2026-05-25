#!/usr/bin/env node

import http from 'node:http'
import { spawn } from 'node:child_process'

const API_KEY = 'dummy-cert-key'
const VMID = 900
const VM_NAME = 'clawcontrol-cert-vm'
const NODE = 'pve'
const EXPECTED_ACTIONS = [
  'set-memory',
  'set-cpu',
  'set-network',
  'snapshot',
  'delete-snapshot',
  'add-disk',
  'remove-disk',
  'add-ha',
  'set-ha-state',
  'remove-ha',
  'add-firewall-rule',
  'delete-firewall-rule',
  'backup',
  'delete-backup',
  'reboot',
  'shutdown',
  'start',
  'stop',
  'start',
]

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

function readBody(req) {
  return new Promise(resolve => {
    const chunks = []
    req.on('data', chunk => chunks.push(chunk))
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString() || '{}'))
      } catch {
        resolve({})
      }
    })
  })
}

function assertControlAction(body, expectedAction, expectedKind = 'qemu') {
  const expectedResourceType = expectedKind === 'lxc' ? 'lxc' : 'vm'
  if (body.provider !== 'proxmox') throw new Error(`${expectedAction}: provider was ${body.provider}`)
  if (body.resourceType !== expectedResourceType) throw new Error(`${expectedAction}: resourceType was ${body.resourceType}`)
  if (body.resourceId !== String(VMID)) throw new Error(`${expectedAction}: resourceId was ${body.resourceId}`)
  if (body.action !== expectedAction) throw new Error(`expected action ${expectedAction}, got ${body.action}`)
  if (body.args?.node !== NODE) throw new Error(`${expectedAction}: node was ${body.args?.node}`)
  if (body.args?.kind !== expectedKind) throw new Error(`${expectedAction}: kind was ${body.args?.kind}`)
  if (body.args?.name !== VM_NAME) throw new Error(`${expectedAction}: name was ${body.args?.name}`)
}

function assertActionArgs(body) {
  switch (body.action) {
    case 'set-memory':
      if (body.args.memory_mb !== 4096) throw new Error('set-memory did not use inventory memory')
      break
    case 'set-cpu':
      if (body.args.cores !== 4) throw new Error('set-cpu did not use inventory cores')
      break
    case 'set-network':
      if (body.args.net !== 'net0' || body.args.value !== 'virtio,bridge=vmbr0') {
        throw new Error('set-network did not replay visible NIC config')
      }
      break
    case 'snapshot':
      if (!String(body.args.snapname || '').startsWith('clawcontrol-cert-')) {
        throw new Error('snapshot name was not generated with clawcontrol-cert prefix')
      }
      if (body.args.description !== 'ClawControl disposable live certification snapshot') {
        throw new Error('snapshot description mismatch')
      }
      break
    case 'delete-snapshot':
      if (!String(body.args.snapname || '').startsWith('clawcontrol-cert-')) {
        throw new Error('delete-snapshot did not use generated snapshot name')
      }
      if (body.confirmation !== VM_NAME) {
        throw new Error('delete-snapshot did not send typed confirmation')
      }
      break
    case 'backup':
      if (body.args.mode !== 'snapshot' || body.args.storage !== 'local' || body.args.compress !== 'zstd') {
        throw new Error('backup args mismatch')
      }
      break
    case 'add-disk':
      if (body.args.disk !== 'scsi1' || body.args.value !== 'local-lvm:1G') {
        throw new Error('add-disk args mismatch')
      }
      break
    case 'remove-disk':
      if (body.args.disk !== 'scsi1' || body.confirmation !== VM_NAME) {
        throw new Error('remove-disk did not target temporary disk with typed confirmation')
      }
      break
    case 'add-ha':
      if (body.args.state !== 'started' || body.args.comment !== 'ClawControl disposable live certification') {
        throw new Error('add-ha args mismatch')
      }
      break
    case 'set-ha-state':
      if (body.args.state !== 'started') throw new Error('set-ha-state args mismatch')
      break
    case 'remove-ha':
      if (body.confirmation !== VM_NAME) throw new Error('remove-ha did not send typed confirmation')
      break
    case 'add-firewall-rule':
      if (
        body.args.type !== 'in' ||
        body.args.action !== 'ACCEPT' ||
        body.args.proto !== 'tcp' ||
        body.args.dport !== '65535' ||
        body.args.source !== '127.0.0.1' ||
        body.args.enable !== false ||
        !String(body.args.comment || '').startsWith('clawcontrol-cert-')
      ) {
        throw new Error('add-firewall-rule args mismatch')
      }
      break
    case 'delete-firewall-rule':
      if (body.args.pos !== 7 || body.confirmation !== VM_NAME) {
        throw new Error('delete-firewall-rule did not delete discovered temporary rule with typed confirmation')
      }
      break
    case 'resize-disk':
      if (body.args.disk !== 'scsi0' || body.args.size !== '+1G') {
        throw new Error('resize-disk args mismatch')
      }
      break
    default:
      break
  }
}

async function runCase({ missingName = false, echo = true } = {}) {
  const actions = []
  const taskPolls = []
  let actionIndex = 0
  let firewallComment = ''
  let vmStatus = 'running'
  let backupVolid = ''
  let backupName = ''
  const server = http.createServer(async (req, res) => {
    if (req.headers['x-api-key'] !== API_KEY) {
      json(res, 401, { error: 'bad key' })
      return
    }

    if (req.url === '/api/homelab' && req.method === 'GET') {
      const firewallRules = firewallComment ? [{ pos: 7, comment: firewallComment }] : []
      const backups = backupVolid ? [{
        volid: backupVolid,
        name: backupName,
        node: NODE,
        storage: 'local',
        kind: 'qemu',
        vmid: VMID,
        protected: false,
      }] : []
      json(res, 200, {
        data: {
          proxmox: {
            nodes: [{ name: NODE, status: 'online' }],
            backups,
            vms: [{
              vmid: VMID,
              name: missingName ? 'wrong-name' : VM_NAME,
              node: NODE,
              kind: 'qemu',
              status: vmStatus,
              maxmem: 4096 * 1024 * 1024,
              config: { memory: '4096', cores: '4' },
              networks: [{ key: 'net0', value: 'virtio,bridge=vmbr0' }],
              disks: [{ key: 'scsi0', value: 'local-lvm:vm-900-disk-0,size=8G' }],
              firewall_rules: firewallRules,
            }],
          },
        },
      })
      return
    }

    if (req.url === '/api/homelab/control' && req.method === 'POST') {
      const body = await readBody(req)
      if (body.resourceType === 'task' && body.action === 'task-status') {
        taskPolls.push(body)
        json(res, 200, {
          data: {
            mode: 'proxmox-api',
            action: 'task-status',
            response: { data: { status: 'stopped', exitstatus: String(body.resourceId).includes(':create-lxc:') ? 'WARNINGS: 1' : 'OK', type: 'mock', id: body.resourceId } },
          },
        })
        return
      }

      const expectedAction = EXPECTED_ACTIONS[actionIndex]
      if (body.resourceType === 'backup') {
        if (body.provider !== 'proxmox') throw new Error(`${expectedAction}: provider was ${body.provider}`)
        if (body.action !== expectedAction) throw new Error(`expected action ${expectedAction}, got ${body.action}`)
        if (body.action !== 'delete-backup') throw new Error(`unexpected backup action ${body.action}`)
        if (body.resourceId !== backupVolid) throw new Error(`delete-backup resourceId was ${body.resourceId}`)
        if (body.args?.node !== NODE || body.args?.archive !== backupVolid || body.args?.storage !== 'local') {
          throw new Error('delete-backup args mismatch')
        }
        if (body.args?.name !== backupName || body.confirmation !== backupName) {
          throw new Error('delete-backup did not send typed confirmation')
        }
        backupVolid = ''
        backupName = ''
        actions.push(body)
        actionIndex += 1
        const upid = `UPID:${NODE}:mock:${actionIndex}:${body.action}:${VMID}:root@pam:`
        json(res, 200, {
          data: {
            mode: 'proxmox-api',
            action: body.action,
            task: { upid, node: NODE },
            response: { data: upid },
          },
        })
        return
      }

      assertControlAction(body, expectedAction)
      assertActionArgs(body)
      if (body.action === 'add-firewall-rule') firewallComment = body.args.comment
      if (body.action === 'backup') {
        backupName = `vzdump-qemu-${VMID}-2026_05_22-10_00_00.vma.zst`
        backupVolid = `local:backup/${backupName}`
      }
      if (body.action === 'shutdown' || body.action === 'stop') vmStatus = 'stopped'
      if (body.action === 'start' || body.action === 'reboot') vmStatus = 'running'
      actions.push(body)
      actionIndex += 1
      const upid = `UPID:${NODE}:mock:${actionIndex}:${body.action}:${VMID}:root@pam:`
      json(res, 200, {
        data: {
          mode: 'proxmox-api',
          action: body.action,
          task: { upid, node: NODE },
          response: { data: upid },
        },
      })
      return
    }

    json(res, 404, { error: `unhandled ${req.method} ${req.url}` })
  })

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  const child = spawn(process.execPath, [
    'scripts/proxmox-live-certify.mjs',
    '--yes',
    '--hardware',
    '--ha',
    '--firewall',
    '--lifecycle',
    '--backup-storage',
    'local',
  ], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      CLAWCONTROL_API_BASE: `http://127.0.0.1:${port}`,
      MC_API_KEY: API_KEY,
      PROXMOX_CERTIFY_VMID: String(VMID),
      PROXMOX_CERTIFY_NAME: VM_NAME,
      PROXMOX_CERTIFY_POLL_MS: '1',
      PROXMOX_CERTIFY_POLLS: '2',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let stdout = ''
  let stderr = ''
  child.stdout.on('data', chunk => {
    stdout += chunk
    if (echo) process.stdout.write(chunk)
  })
  child.stderr.on('data', chunk => {
    stderr += chunk
    if (echo) process.stderr.write(chunk)
  })

  const code = await new Promise(resolve => child.on('exit', resolve))
  await new Promise(resolve => server.close(resolve))
  return { code, stdout, stderr, actions, taskPolls }
}

async function runCreateDisposableCase({ existingVm = false, resizeDisk = false, createKind = 'qemu', lifecycle = false, echo = true } = {}) {
  const actions = []
  const taskPolls = []
  let created = existingVm
  let guestStatus = 'stopped'
  const expectedActions = [
    createKind === 'lxc' ? 'create-lxc' : 'create-vm',
    'set-memory',
    'set-cpu',
    'set-network',
    'snapshot',
    'delete-snapshot',
    ...(resizeDisk ? ['resize-disk'] : []),
    ...(lifecycle ? ['start', 'reboot', 'shutdown', 'start', 'stop'] : []),
    'delete',
  ]
  let actionIndex = 0

  const vmPayload = () => ({
    vmid: VMID,
    name: VM_NAME,
    node: NODE,
    kind: createKind,
    status: guestStatus,
    maxmem: 512 * 1024 * 1024,
    config: { memory: '512', cores: '1' },
    networks: [{ key: 'net0', value: createKind === 'lxc' ? 'name=eth0,bridge=vmbr0,ip=dhcp,firewall=1' : 'virtio,bridge=vmbr0,firewall=1' }],
    disks: [{ key: createKind === 'lxc' ? 'rootfs' : 'scsi0', value: 'local-lvm:vm-900-disk-0,size=1G' }],
    firewall_rules: [],
  })

  const server = http.createServer(async (req, res) => {
    if (req.headers['x-api-key'] !== API_KEY) {
      json(res, 401, { error: 'bad key' })
      return
    }

    if (req.url === '/api/homelab' && req.method === 'GET') {
      json(res, 200, {
        data: {
          proxmox: {
            nodes: [{ name: NODE, status: 'online' }],
            vms: created ? [vmPayload()] : [],
          },
        },
      })
      return
    }

    if (req.url === '/api/homelab/control' && req.method === 'POST') {
      const body = await readBody(req)
      if (body.resourceType === 'task' && body.action === 'task-status') {
        taskPolls.push(body)
        json(res, 200, {
          data: {
            mode: 'proxmox-api',
            action: 'task-status',
            response: { data: { status: 'stopped', exitstatus: String(body.resourceId).includes(':create-lxc:') ? 'WARNINGS: 1' : 'OK', type: 'mock', id: body.resourceId } },
          },
        })
        return
      }

      const expectedAction = expectedActions[actionIndex]
      if (body.action !== expectedAction) throw new Error(`expected action ${expectedAction}, got ${body.action}`)
      if (body.provider !== 'proxmox') throw new Error(`${expectedAction}: provider was ${body.provider}`)
      if (body.action === 'create-vm' || body.action === 'create-lxc') {
        if (body.resourceType !== 'node' || body.resourceId !== NODE) throw new Error(`${body.action} did not target node`)
        if (body.args?.vmid !== VMID || body.args?.name !== VM_NAME) throw new Error(`${body.action} identity mismatch`)
        if (body.args?.memory_mb !== 512 || body.args?.cores !== 1) throw new Error(`${body.action} sizing mismatch`)
        if (body.args?.storage !== 'local-lvm' || body.args?.disk_size !== '1G') throw new Error(`${body.action} disk mismatch`)
        if (body.action === 'create-lxc' && body.args?.ostemplate !== 'local:vztmpl/debian-13-standard_13.1-2_amd64.tar.zst') {
          throw new Error('create-lxc template mismatch')
        }
        if (body.args?.start !== false) throw new Error(`${body.action} should not auto-start disposable guest`)
        created = true
      } else {
        assertControlAction(body, expectedAction, createKind)
        switch (body.action) {
          case 'set-memory':
            if (body.args.memory_mb !== 512) throw new Error('set-memory did not use created VM memory')
            break
          case 'set-cpu':
            if (body.args.cores !== 1) throw new Error('set-cpu did not use created VM cores')
            break
          case 'set-network':
            if (body.args.net !== 'net0' || body.args.value !== (createKind === 'lxc' ? 'name=eth0,bridge=vmbr0,ip=dhcp,firewall=1' : 'virtio,bridge=vmbr0,firewall=1')) {
              throw new Error('set-network did not replay created VM NIC config')
            }
            break
          case 'delete':
            if (body.confirmation !== VM_NAME) throw new Error('delete did not send typed confirmation')
            if (body.args?.purge !== true || body.args?.destroy_unreferenced_disks !== true) {
              throw new Error('delete did not request purge and destroy_unreferenced_disks cleanup')
            }
            break
          default:
            assertActionArgs(body)
        }
      }
      if (body.action === 'shutdown' || body.action === 'stop') guestStatus = 'stopped'
      if (body.action === 'start' || body.action === 'reboot') guestStatus = 'running'
      actions.push(body)
      actionIndex += 1
      const upid = `UPID:${NODE}:mock:${actionIndex}:${body.action}:${VMID}:root@pam:`
      json(res, 200, {
        data: {
          mode: 'proxmox-api',
          action: body.action,
          task: { upid, node: NODE },
          response: { data: upid },
        },
      })
      return
    }

    json(res, 404, { error: `unhandled ${req.method} ${req.url}` })
  })

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  const child = spawn(process.execPath, [
    'scripts/proxmox-live-certify.mjs',
    '--yes',
    '--create-disposable',
    ...(resizeDisk ? ['--resize-disk'] : []),
    ...(lifecycle ? ['--lifecycle'] : []),
  ], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      CLAWCONTROL_API_BASE: `http://127.0.0.1:${port}`,
      MC_API_KEY: API_KEY,
      PROXMOX_CERTIFY_VMID: String(VMID),
      PROXMOX_CERTIFY_NAME: VM_NAME,
      PROXMOX_CERTIFY_CREATE_KIND: createKind,
      PROXMOX_CERTIFY_CREATE_TEMPLATE: 'local:vztmpl/debian-13-standard_13.1-2_amd64.tar.zst',
      PROXMOX_CERTIFY_POLL_MS: '1',
      PROXMOX_CERTIFY_POLLS: '2',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let stdout = ''
  let stderr = ''
  child.stdout.on('data', chunk => {
    stdout += chunk
    if (echo) process.stdout.write(chunk)
  })
  child.stderr.on('data', chunk => {
    stderr += chunk
    if (echo) process.stderr.write(chunk)
  })

  const code = await new Promise(resolve => child.on('exit', resolve))
  await new Promise(resolve => server.close(resolve))
  return { code, stdout, stderr, actions, taskPolls, expectedActions }
}

async function main() {
  const mismatch = await runCase({ missingName: true, echo: false })
  if (mismatch.code === 0 || !mismatch.stderr.includes(`VMID ${VMID} is named "wrong-name"`)) {
    throw new Error('write cert did not reject VMID/name mismatch')
  }
  if (mismatch.actions.length !== 0) {
    throw new Error('write cert mutated after VMID/name mismatch')
  }

  const result = await runCase()
  if (result.code !== 0) {
    throw new Error(`write cert runner exited ${result.code}\n${result.stderr}`)
  }
  const actionNames = result.actions.map(action => action.action)
  if (JSON.stringify(actionNames) !== JSON.stringify(EXPECTED_ACTIONS)) {
    throw new Error(`write cert actions mismatch: ${JSON.stringify(actionNames)}`)
  }
  if (result.taskPolls.length !== EXPECTED_ACTIONS.length) {
    throw new Error(`expected one task poll per action, got ${result.taskPolls.length}`)
  }
  if (!result.stdout.includes('[done] Proxmox disposable VM certification completed.')) {
    throw new Error('write cert did not report completion')
  }

  const existing = await runCreateDisposableCase({ existingVm: true, echo: false })
  if (existing.code === 0 || !existing.stderr.includes(`Refusing --create-disposable because VMID ${VMID} already exists`)) {
    throw new Error('create-disposable did not refuse an existing VMID')
  }
  if (existing.actions.length !== 0) {
    throw new Error('create-disposable mutated after existing VMID refusal')
  }

  const created = await runCreateDisposableCase()
  if (created.code !== 0) {
    throw new Error(`create-disposable cert runner exited ${created.code}\n${created.stderr}`)
  }
  const createdActionNames = created.actions.map(action => action.action)
  if (JSON.stringify(createdActionNames) !== JSON.stringify(created.expectedActions)) {
    throw new Error(`create-disposable actions mismatch: ${JSON.stringify(createdActionNames)}`)
  }
  if (created.taskPolls.length !== created.expectedActions.length) {
    throw new Error(`expected one task poll per create-disposable action, got ${created.taskPolls.length}`)
  }
  if (!created.stdout.includes('[cleanup] deleted disposable VM')) {
    throw new Error('create-disposable did not report cleanup delete')
  }

  const resized = await runCreateDisposableCase({ resizeDisk: true, echo: false })
  if (resized.code !== 0) {
    throw new Error(`create-disposable resize cert runner exited ${resized.code}\n${resized.stderr}`)
  }
  const resizedActionNames = resized.actions.map(action => action.action)
  if (JSON.stringify(resizedActionNames) !== JSON.stringify(resized.expectedActions)) {
    throw new Error(`create-disposable resize actions mismatch: ${JSON.stringify(resizedActionNames)}`)
  }

  const lxcLifecycle = await runCreateDisposableCase({ createKind: 'lxc', lifecycle: true, echo: false })
  if (lxcLifecycle.code !== 0) {
    throw new Error(`create-disposable LXC lifecycle cert runner exited ${lxcLifecycle.code}\n${lxcLifecycle.stderr}`)
  }
  const lxcLifecycleActionNames = lxcLifecycle.actions.map(action => action.action)
  if (JSON.stringify(lxcLifecycleActionNames) !== JSON.stringify(lxcLifecycle.expectedActions)) {
    throw new Error(`create-disposable LXC lifecycle actions mismatch: ${JSON.stringify(lxcLifecycleActionNames)}`)
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
