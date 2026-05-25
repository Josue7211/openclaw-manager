#!/usr/bin/env node

const DEFAULT_BASE = 'http://127.0.0.1:3010'
const REQUIRED_ANY_TARGET_ACK = 'I_UNDERSTAND_THIS_MUTATES_PORTAINER'
const SAFE_NAME_PREFIXES = ['clawcontrol-cert', 'cc-cert', 'test-clawcontrol']

function argValue(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function hasFlag(name) {
  return process.argv.includes(name)
}

function usage() {
  console.log(`Usage:
  MC_API_KEY=... npm run portainer:certify-live -- --read-only

  MC_API_KEY=... npm run portainer:certify-live -- --create-disposable --yes

Environment:
  CLAWCONTROL_API_BASE           Backend base URL. Defaults to ${DEFAULT_BASE}
  MC_API_KEY                     Backend API key. CLAWCONTROL_API_KEY also works.
  PORTAINER_CERTIFY_INSTANCE     Optional Portainer instance id/name to target.
  PORTAINER_CERTIFY_ENDPOINT_ID  Optional Docker endpoint id to target.
  PORTAINER_CERTIFY_NAME         Disposable container name. Defaults to clawcontrol-cert-events-<timestamp>.
  PORTAINER_CERTIFY_IMAGE        Disposable image. Defaults to alpine:3.20.
  PORTAINER_CERTIFY_ALLOW_ANY    Set to ${REQUIRED_ANY_TARGET_ACK} to bypass name-prefix guard.

Flags:
  --read-only                    Certify inventory, bounded Docker events, and live event websocket without mutation.
  --create-disposable            Create/remove a safe temporary container to prove real Docker event generation.
  --container-lifecycle          With --create-disposable, certify start/restart/pause/unpause/stop/kill via the disposable container.
  --container-details            With --create-disposable, certify inspect/logs/stats/processes/changes/exec via the disposable container.
  --container-mutations          With --create-disposable, certify restart policy, resources, rename, duplicate, and recreate.
  --docker-images                With --create-disposable, certify pull/inspect/history/tag/remove-tag for the disposable image.
  --docker-assets                With --create-disposable, certify disposable volume and network create/inspect/connect/disconnect/remove.
  --swarm-assets                 With --create-disposable, certify disposable Swarm secret and config create/inspect/remove.
  --docker-stacks                With --create-disposable, certify disposable standalone stack create/inspect/file/logs/update/start/stop/delete.
  --keep-disposable              Do not remove a created disposable container after certification.
  --no-ws                        Create live follow session but do not open the websocket.
  --yes                          Required acknowledgement for --create-disposable.
`)
}

const base = (process.env.CLAWCONTROL_API_BASE || DEFAULT_BASE).replace(/\/$/, '')
const apiKey = process.env.CLAWCONTROL_API_KEY || process.env.MC_API_KEY
const readOnly = hasFlag('--read-only') || !hasFlag('--create-disposable')
const createDisposable = hasFlag('--create-disposable')
const runContainerLifecycle = hasFlag('--container-lifecycle')
const runContainerDetails = hasFlag('--container-details')
const runContainerMutations = hasFlag('--container-mutations')
const runDockerImages = hasFlag('--docker-images')
const runDockerAssets = hasFlag('--docker-assets')
const runSwarmAssets = hasFlag('--swarm-assets')
const runDockerStacks = hasFlag('--docker-stacks')
const keepDisposable = hasFlag('--keep-disposable')
const skipWs = hasFlag('--no-ws')
const instanceSelector = process.env.PORTAINER_CERTIFY_INSTANCE || argValue('--instance')
const endpointSelector = process.env.PORTAINER_CERTIFY_ENDPOINT_ID || argValue('--endpoint-id')
const disposableName = process.env.PORTAINER_CERTIFY_NAME || argValue('--name') || `clawcontrol-cert-events-${Date.now()}`
const disposableImage = process.env.PORTAINER_CERTIFY_IMAGE || argValue('--image') || 'alpine:3.20'
const disposableRenamedContainerName = `${disposableName}-renamed`
const disposableDuplicateContainerName = `${disposableName}-copy`
const disposableImageTagRepo = `${disposableName}-image`
const disposableImageTag = 'cert'
const disposableTaggedImage = `${disposableImageTagRepo}:${disposableImageTag}`
const disposableVolumeName = `${disposableName}-vol`
const disposableNetworkName = `${disposableName}-net`
const disposableSecretName = `${disposableName}-secret`
const disposableConfigName = `${disposableName}-config`
const disposableStackName = `${disposableName}-stack`

if (hasFlag('--help') || hasFlag('-h')) {
  usage()
  process.exit(0)
}

try {
  if (!apiKey) throw new Error('MC_API_KEY or CLAWCONTROL_API_KEY is required')
  if (createDisposable && !hasFlag('--yes')) {
    throw new Error('--yes is required because --create-disposable mutates the selected Docker endpoint')
  }
  if (runContainerLifecycle && !createDisposable) {
    throw new Error('--container-lifecycle requires --create-disposable')
  }
  if (runContainerDetails && !createDisposable) {
    throw new Error('--container-details requires --create-disposable')
  }
  if (runContainerMutations && !createDisposable) {
    throw new Error('--container-mutations requires --create-disposable')
  }
  if (runDockerImages && !createDisposable) {
    throw new Error('--docker-images requires --create-disposable')
  }
  if (runDockerAssets && !createDisposable) {
    throw new Error('--docker-assets requires --create-disposable')
  }
  if (runSwarmAssets && !createDisposable) {
    throw new Error('--swarm-assets requires --create-disposable')
  }
  if (runDockerStacks && !createDisposable) {
    throw new Error('--docker-stacks requires --create-disposable')
  }
} catch (error) {
  console.error(error.message)
  usage()
  process.exit(2)
}

if (createDisposable) {
  const safeName = SAFE_NAME_PREFIXES.some(prefix => disposableName.toLowerCase().startsWith(prefix))
  const allowAny = process.env.PORTAINER_CERTIFY_ALLOW_ANY === REQUIRED_ANY_TARGET_ACK
  if (!safeName && !allowAny) {
    console.error(`Refusing to mutate "${disposableName}". Name must start with one of ${SAFE_NAME_PREFIXES.join(', ')}.`)
    console.error(`To override, set PORTAINER_CERTIFY_ALLOW_ANY=${REQUIRED_ANY_TARGET_ACK}`)
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

function parseEventLines(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      try {
        return JSON.parse(line)
      } catch {
        return null
      }
    })
    .filter(Boolean)
}

function eventMatchesName(event, name) {
  return event?.Actor?.Attributes?.name === name || event?.id === name
}

function parseImageRef(ref) {
  const clean = String(ref || '').trim()
  const lastSlash = clean.lastIndexOf('/')
  const lastColon = clean.lastIndexOf(':')
  if (lastColon > lastSlash) {
    return {
      image: clean.slice(0, lastColon),
      tag: clean.slice(lastColon + 1) || 'latest',
    }
  }
  return { image: clean, tag: 'latest' }
}

function disposableStackCompose(marker = 'clawcontrol-stack-cert') {
  return [
    'services:',
    '  cert:',
    `    image: ${disposableImage}`,
    `    command: sh -c "echo ${marker} && sleep 300"`,
    '    restart: "no"',
    '',
  ].join('\n')
}

function dockerEndpointCandidates(homelab) {
  const instances = homelab?.portainer?.instances ?? []
  const matchingInstances = instanceSelector
    ? instances.filter(instance => instance.id === instanceSelector || instance.name === instanceSelector)
    : instances
  const targets = []
  for (const instance of matchingInstances) {
    const endpoints = instance.endpoints ?? []
    for (const endpoint of endpoints) {
      if (endpointSelector && String(endpoint.id) !== String(endpointSelector)) continue
      const platform = String(endpoint.platform || endpoint.type || '').toLowerCase()
      if (platform.includes('docker') || Number(endpoint.type) === 1 || Number(endpoint.type) === 2) {
        targets.push({ instance, endpoint })
      }
    }
  }
  return targets
}

function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object: ${JSON.stringify(value)}`)
  }
  return value
}

function assertArray(value, label) {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array: ${JSON.stringify(value)}`)
  }
  return value
}

function assertKeys(value, keys, label) {
  const object = assertObject(value, label)
  const missing = keys.filter(key => !Object.prototype.hasOwnProperty.call(object, key))
  if (missing.length > 0) {
    throw new Error(`${label} missing normalized keys: ${missing.join(', ')}`)
  }
  return object
}

function assertSampleKeys(rows, keys, label) {
  const row = rows[0]
  if (!row) return
  assertKeys(row, keys, `${label} sample`)
}

function rowsForEndpoint(rows, endpointId) {
  return rows.filter(row => String(row?.endpoint_id ?? '') === String(endpointId))
}

function validateDockerInventory(target) {
  const info = assertKeys(
    target.endpoint.docker_info,
    [
      'name',
      'server_version',
      'operating_system',
      'os_type',
      'architecture',
      'cpus',
      'memory_bytes',
      'containers',
      'containers_running',
      'containers_paused',
      'containers_stopped',
      'images',
      'docker_root_dir',
      'driver',
      'swarm_local_node_state',
      'swarm_control_available',
    ],
    `endpoint ${target.endpoint.id} docker_info`,
  )

  const containers = rowsForEndpoint(assertArray(target.instance.containers, 'instance.containers'), target.endpoint.id)
  const stacks = rowsForEndpoint(assertArray(target.instance.stacks, 'instance.stacks'), target.endpoint.id)
  const images = rowsForEndpoint(assertArray(target.instance.images, 'instance.images'), target.endpoint.id)
  const volumes = rowsForEndpoint(assertArray(target.instance.volumes, 'instance.volumes'), target.endpoint.id)
  const networks = rowsForEndpoint(assertArray(target.instance.networks, 'instance.networks'), target.endpoint.id)
  const secrets = rowsForEndpoint(assertArray(target.instance.secrets, 'instance.secrets'), target.endpoint.id)
  const configs = rowsForEndpoint(assertArray(target.instance.configs, 'instance.configs'), target.endpoint.id)

  assertSampleKeys(containers, [
    'id',
    'name',
    'image',
    'status',
    'state',
    'ports',
    'endpoint_id',
    'endpoint_name',
    'instance_id',
    'provider',
  ], 'container')
  assertSampleKeys(stacks, ['id', 'name', 'type', 'endpoint_id', 'instance_id'], 'stack')
  assertSampleKeys(images, [
    'id',
    'name',
    'tags',
    'digests',
    'size',
    'labels_count',
    'created',
    'endpoint_id',
    'endpoint_name',
    'instance_id',
  ], 'image')
  assertSampleKeys(volumes, [
    'id',
    'name',
    'driver',
    'mountpoint',
    'scope',
    'labels_count',
    'options_count',
    'endpoint_id',
    'endpoint_name',
    'instance_id',
  ], 'volume')
  assertSampleKeys(networks, [
    'id',
    'name',
    'driver',
    'scope',
    'ipam',
    'internal',
    'attachable',
    'ingress',
    'enable_ipv6',
    'containers_count',
    'endpoint_id',
    'endpoint_name',
    'instance_id',
  ], 'network')
  assertSampleKeys(secrets, ['id', 'name', 'created_at', 'updated_at', 'endpoint_id', 'endpoint_name', 'instance_id'], 'secret')
  assertSampleKeys(configs, ['id', 'name', 'created_at', 'updated_at', 'endpoint_id', 'endpoint_name', 'instance_id'], 'config')

  console.log(
    `[inventory] docker-info instance=${target.instance.id} endpoint=${target.endpoint.id} engine=${info.server_version ?? 'unknown'} os=${info.operating_system ?? 'unknown'} cpu=${info.cpus ?? 'unknown'} memory=${info.memory_bytes ?? 'unknown'} storage=${info.driver ?? 'unknown'}`,
  )
  console.log(
    `[inventory] normalized rows instance=${target.instance.id} endpoint=${target.endpoint.id} containers=${containers.length} stacks=${stacks.length} images=${images.length} volumes=${volumes.length} networks=${networks.length} secrets=${secrets.length} configs=${configs.length}`,
  )
}

function validateSwarmInventory(target) {
  const hasSwarmFeature = Array.isArray(target.endpoint.features) && target.endpoint.features.includes('swarm')
  const services = rowsForEndpoint(assertArray(target.instance.swarm_services, 'instance.swarm_services'), target.endpoint.id)
  const nodes = rowsForEndpoint(assertArray(target.instance.swarm_nodes, 'instance.swarm_nodes'), target.endpoint.id)
  const tasks = rowsForEndpoint(assertArray(target.instance.swarm_tasks, 'instance.swarm_tasks'), target.endpoint.id)
  if (!hasSwarmFeature && services.length === 0 && nodes.length === 0 && tasks.length === 0) return

  assertSampleKeys(services, [
    'id',
    'name',
    'image',
    'mode',
    'replicas',
    'created_at',
    'updated_at',
    'endpoint_id',
    'endpoint_name',
    'instance_id',
  ], 'swarm service')
  assertSampleKeys(nodes, [
    'id',
    'hostname',
    'state',
    'availability',
    'role',
    'manager_reachability',
    'leader',
    'endpoint_id',
    'endpoint_name',
    'instance_id',
  ], 'swarm node')
  assertSampleKeys(tasks, [
    'id',
    'service_id',
    'node_id',
    'slot',
    'desired_state',
    'state',
    'message',
    'container_id',
    'endpoint_id',
    'endpoint_name',
    'instance_id',
  ], 'swarm task')
  console.log(
    `[inventory] swarm rows instance=${target.instance.id} endpoint=${target.endpoint.id} services=${services.length} nodes=${nodes.length} tasks=${tasks.length}`,
  )
}

async function openEventWebsocket(relativeUrl, expectedText, label) {
  if (skipWs) {
    console.log(`[ws] ${label}: skipped by --no-ws`)
    return { close() {} }
  }
  if (typeof WebSocket !== 'function') {
    throw new Error('Node WebSocket global is unavailable. Use Node 22+ or pass --no-ws.')
  }
  const url = websocketUrl(relativeUrl)
  const seen = []
  const socket = new WebSocket(url)
  socket.onmessage = event => {
    const text = typeof event.data === 'string' ? event.data : String(event.data)
    seen.push(text)
  }
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} websocket did not open`)), 5000)
    socket.onopen = () => {
      clearTimeout(timer)
      resolve()
    }
    socket.onerror = () => {
      clearTimeout(timer)
      reject(new Error(`${label} websocket failed to open`))
    }
  })
  console.log(`[ws] ${label}: connected`)
  await waitForSocketText(socket, seen, expectedText, label, 8000)
  return {
    async waitFor(text, timeoutMs = 10000) {
      await waitForSocketText(socket, seen, text, label, timeoutMs)
    },
    close() {
      try {
        socket.close()
      } catch {
        // Ignore close failures during cleanup.
      }
    },
  }
}

function waitForSocketText(socket, seen, expectedText, label, timeoutMs) {
  return new Promise((resolve, reject) => {
    const hasExpected = () => seen.some(item => item.includes(expectedText))
    if (hasExpected()) {
      resolve()
      return
    }
    const previousClose = socket.onclose
    const interval = setInterval(() => {
      if (hasExpected()) {
        clearInterval(interval)
        clearTimeout(timer)
        socket.onclose = previousClose
        const text = seen.find(item => item.includes(expectedText)) ?? ''
        console.log(`[ws] ${label}: ${JSON.stringify(text.slice(0, 160))}`)
        resolve()
      }
    }, 25)
    const timer = setTimeout(() => {
      clearInterval(interval)
      socket.onclose = previousClose
      reject(new Error(`${label} websocket did not receive ${JSON.stringify(expectedText)}`))
    }, timeoutMs)
    socket.onclose = event => {
      previousClose?.(event)
      if (!hasExpected()) {
        clearInterval(interval)
        clearTimeout(timer)
        reject(new Error(`${label} websocket closed before ${JSON.stringify(expectedText)}`))
      }
    }
  })
}

function baseControl(target, action, args = {}) {
  return {
    provider: 'portainer',
    instanceId: target.instance.id,
    resourceType: 'endpoint',
    resourceId: String(target.endpoint.id),
    action,
    args: { name: target.endpoint.name, ...args },
  }
}

function containerControl(target, containerId, action, args = {}, confirm = false) {
  return {
    provider: 'portainer',
    instanceId: target.instance.id,
    resourceType: 'container',
    resourceId: String(containerId),
    action,
    args: {
      endpoint_id: Number(target.endpoint.id),
      name: disposableName,
      ...args,
    },
    confirmation: confirm ? disposableName : undefined,
  }
}

function resourceControl(target, resourceType, resourceId, action, args = {}, confirmation) {
  return {
    provider: 'portainer',
    instanceId: target.instance.id,
    resourceType,
    resourceId: String(resourceId),
    action,
    args: {
      endpoint_id: Number(target.endpoint.id),
      name: String(resourceId),
      ...args,
    },
    confirmation,
  }
}

async function fetchBoundedEvents(target, since, until, extraArgs = {}) {
  const result = await request('/api/homelab/portainer/action', baseControl(target, 'events', {
    since,
    until,
    ...extraArgs,
  }))
  const logs = result?.response?.logs
  if (typeof logs !== 'string') {
    throw new Error(`events response missing response.logs: ${JSON.stringify(result)}`)
  }
  const events = parseEventLines(logs)
  console.log(`[events] bounded returned ${events.length} parseable events`)
  return events
}

async function createEventFollowSession(target, since, extraArgs = {}) {
  const session = await request('/api/homelab/portainer/terminal/session', baseControl(target, 'events-follow', {
    since,
    ...extraArgs,
  }))
  if (!session?.sessionId || !session?.websocketUrl) {
    throw new Error(`events-follow session response missing sessionId/websocketUrl: ${JSON.stringify(session)}`)
  }
  console.log(`[session] events-follow endpoint=${target.endpoint.id} id=${session.sessionId}`)
  return session
}

async function createDisposableContainer(target) {
  console.log(`[action] create-container ${disposableName}`)
  const result = await request('/api/homelab/portainer/action', baseControl(target, 'create-container', {
    name: disposableName,
    image: disposableImage,
    command: 'sh -c "echo clawcontrol-cert && sleep 300"',
    labels: 'clawcontrol.certification=events',
    restart_policy: 'no',
  }))
  const id = result?.response?.Id || result?.response?.id || disposableName
  console.log(`[action] create-container id=${id}`)
  return String(id)
}

async function removeDisposableContainer(target, id) {
  console.log(`[cleanup] remove ${id}`)
  await request('/api/homelab/portainer/action', containerControl(target, id, 'remove', {}, true))
}

async function runContainerAction(target, id, action, label = 'lifecycle') {
  console.log(`[${label}] ${action}`)
  return request('/api/homelab/portainer/action', containerControl(target, id, action))
}

async function runContainerMutationAction(target, id, action, args = {}, confirmation) {
  console.log(`[mutations] ${action}`)
  return request(
    '/api/homelab/portainer/action',
    resourceControl(target, 'container', id, action, args, confirmation),
  )
}

async function inspectDisposableContainer(target, id, expected, label) {
  const result = await request('/api/homelab/portainer/action', containerControl(target, id, 'inspect'))
  const state = result?.response?.State
  if (!state || typeof state !== 'object') {
    throw new Error(`${label} inspect response missing State: ${JSON.stringify(result)}`)
  }
  for (const [key, value] of Object.entries(expected)) {
    if (state[key] !== value) {
      throw new Error(`${label} expected State.${key}=${value}, got ${state[key]}`)
    }
  }
}

async function inspectContainerName(target, id, expectedName, label) {
  const result = await request('/api/homelab/portainer/action', containerControl(target, id, 'inspect'))
  const name = String(result?.response?.Name || '').trim().replace(/^\/+/, '')
  if (name !== expectedName) {
    throw new Error(`${label} expected container name ${expectedName}, got ${name || JSON.stringify(result).slice(0, 800)}`)
  }
}

async function runContainerDetailAction(target, id, action, args = {}) {
  console.log(`[details] ${action}`)
  return request('/api/homelab/portainer/action', containerControl(target, id, action, args))
}

function assertResponseObject(result, action) {
  if (!result?.response || typeof result.response !== 'object') {
    throw new Error(`${action} response missing response object: ${JSON.stringify(result)}`)
  }
  return result.response
}

async function certifyContainerDetails(target, id) {
  await runContainerAction(target, id, 'start', 'details')
  await inspectDisposableContainer(target, id, { Running: true }, 'details start')

  const inspect = assertResponseObject(await runContainerDetailAction(target, id, 'inspect'), 'inspect')
  if (String(inspect.Id || '') !== id && !String(inspect.Name || '').includes(disposableName)) {
    throw new Error(`inspect response did not identify disposable container: ${JSON.stringify(inspect).slice(0, 800)}`)
  }

  const logs = await runContainerDetailAction(target, id, 'logs')
  if (!String(logs?.response?.logs || '').includes('clawcontrol-cert')) {
    throw new Error(`logs response did not include disposable marker: ${JSON.stringify(logs).slice(0, 800)}`)
  }

  const stats = assertResponseObject(await runContainerDetailAction(target, id, 'stats'), 'stats')
  if (!stats.cpu_stats && !stats.memory_stats && !stats.read) {
    throw new Error(`stats response did not look like Docker stats JSON: ${JSON.stringify(stats).slice(0, 800)}`)
  }

  const processes = assertResponseObject(await runContainerDetailAction(target, id, 'processes'), 'processes')
  if (!Array.isArray(processes.Titles) || !Array.isArray(processes.Processes)) {
    throw new Error(`processes response missing Titles/Processes arrays: ${JSON.stringify(processes).slice(0, 800)}`)
  }

  const exec = assertResponseObject(await runContainerDetailAction(target, id, 'exec', {
    cmd: 'echo clawcontrol-exec && touch /tmp/clawcontrol-cert-detail',
  }), 'exec')
  if (!String(exec.output || '').includes('clawcontrol-exec')) {
    throw new Error(`exec response did not include expected output: ${JSON.stringify(exec).slice(0, 800)}`)
  }

  const changes = await runContainerDetailAction(target, id, 'changes')
  if (!Array.isArray(changes?.response)) {
    throw new Error(`changes response was not a Docker changes array: ${JSON.stringify(changes).slice(0, 800)}`)
  }
  if (!changes.response.some(item => String(item?.Path || '').includes('clawcontrol-cert-detail'))) {
    throw new Error(`changes response did not include exec-created marker file: ${JSON.stringify(changes.response).slice(0, 800)}`)
  }

  await runContainerAction(target, id, 'stop', 'details')
  await inspectDisposableContainer(target, id, { Running: false }, 'details stop')
  console.log('[details] disposable container detail certification completed.')
}

async function certifyContainerMutations(target, id) {
  await inspectContainerName(target, id, disposableName, 'mutations initial inspect')

  const restartPolicy = assertResponseObject(
    await runContainerMutationAction(target, id, 'update-restart-policy', {
      endpoint_id: Number(target.endpoint.id),
      name: disposableName,
      restart_policy: 'no',
    }),
    'update-restart-policy',
  )
  if (restartPolicy.Warnings && !Array.isArray(restartPolicy.Warnings)) {
    throw new Error(`update-restart-policy response was unexpected: ${JSON.stringify(restartPolicy).slice(0, 800)}`)
  }

  const resources = assertResponseObject(
    await runContainerMutationAction(target, id, 'update-resources', {
      endpoint_id: Number(target.endpoint.id),
      name: disposableName,
      cpu_shares: 128,
    }),
    'update-resources',
  )
  if (resources.Warnings && !Array.isArray(resources.Warnings)) {
    throw new Error(`update-resources response was unexpected: ${JSON.stringify(resources).slice(0, 800)}`)
  }

  await runContainerMutationAction(target, id, 'rename', {
    endpoint_id: Number(target.endpoint.id),
    name: disposableName,
    new_name: disposableRenamedContainerName,
  })
  await inspectContainerName(target, id, disposableRenamedContainerName, 'rename')

  let duplicateId
  try {
    const duplicate = assertResponseObject(
      await runContainerMutationAction(target, id, 'duplicate', {
        endpoint_id: Number(target.endpoint.id),
        name: disposableRenamedContainerName,
        new_name: disposableDuplicateContainerName,
        start: false,
      }),
      'duplicate',
    )
    duplicateId = String(duplicate.id || duplicate.Id || disposableDuplicateContainerName)
    if (duplicate.name !== disposableDuplicateContainerName) {
      throw new Error(`duplicate response did not identify ${disposableDuplicateContainerName}: ${JSON.stringify(duplicate).slice(0, 800)}`)
    }
  } finally {
    if (duplicateId && !keepDisposable) {
      await runContainerMutationAction(
        target,
        duplicateId,
        'remove',
        { endpoint_id: Number(target.endpoint.id), name: disposableDuplicateContainerName },
        disposableDuplicateContainerName,
      )
    } else if (duplicateId) {
      console.log(`[keep] duplicate container retained: ${duplicateId}`)
    }
  }

  const recreated = assertResponseObject(
    await runContainerMutationAction(
      target,
      id,
      'recreate',
      {
        endpoint_id: Number(target.endpoint.id),
        name: disposableName,
        start: false,
      },
      disposableName,
    ),
    'recreate',
  )
  const recreatedId = String(recreated.id || recreated.Id || id)
  if (recreated.name !== disposableName) {
    throw new Error(`recreate response did not identify ${disposableName}: ${JSON.stringify(recreated).slice(0, 800)}`)
  }
  await inspectContainerName(target, recreatedId, disposableName, 'recreate')
  console.log('[mutations] disposable container mutation certification completed.')
  return recreatedId
}

async function certifyDockerImages(target) {
  const source = parseImageRef(disposableImage)
  const sourceRef = `${source.image}:${source.tag}`
  let tagged = false
  try {
    await runEndpointAssetAction(target, 'pull-image', {
      image: source.image,
      tag: source.tag,
    })

    const inspect = assertResponseObject(
      await runResourceAction(target, 'image', sourceRef, 'inspect-image'),
      'inspect-image',
    )
    const repoTags = Array.isArray(inspect.RepoTags) ? inspect.RepoTags : []
    if (inspect.Id === undefined && !repoTags.includes(sourceRef)) {
      throw new Error(`inspect-image response did not identify ${sourceRef}: ${JSON.stringify(inspect).slice(0, 800)}`)
    }

    const history = await runResourceAction(target, 'image', sourceRef, 'history-image')
    if (!Array.isArray(history?.response)) {
      throw new Error(`history-image response was not a Docker history array: ${JSON.stringify(history).slice(0, 800)}`)
    }

    await runResourceAction(target, 'image', sourceRef, 'tag-image', {
      repo: disposableImageTagRepo,
      tag: disposableImageTag,
    })
    tagged = true

    const taggedInspect = assertResponseObject(
      await runResourceAction(target, 'image', disposableTaggedImage, 'inspect-image'),
      'inspect-image tagged',
    )
    const taggedRepoTags = Array.isArray(taggedInspect.RepoTags) ? taggedInspect.RepoTags : []
    if (!taggedRepoTags.includes(disposableTaggedImage) && taggedInspect.Id === undefined) {
      throw new Error(`tagged inspect-image response did not identify ${disposableTaggedImage}: ${JSON.stringify(taggedInspect).slice(0, 800)}`)
    }
    console.log('[images] disposable Docker image certification completed.')
  } finally {
    if (tagged && !keepDisposable) {
      await runResourceAction(
        target,
        'image',
        disposableTaggedImage,
        'remove-image',
        { name: disposableTaggedImage },
        disposableTaggedImage,
      )
    } else if (tagged) {
      console.log(`[keep] disposable image tag retained: ${disposableTaggedImage}`)
    }
  }
}

async function runEndpointAssetAction(target, action, args = {}) {
  console.log(`[assets] ${action}`)
  return request('/api/homelab/portainer/action', baseControl(target, action, args))
}

async function runResourceAction(target, resourceType, resourceId, action, args = {}, confirmation) {
  console.log(`[assets] ${action} ${resourceId}`)
  return request(
    '/api/homelab/portainer/action',
    resourceControl(target, resourceType, resourceId, action, args, confirmation),
  )
}

async function certifyDockerAssets(target, containerId) {
  let volumeCreated = false
  let networkCreated = false
  try {
    const volume = await runEndpointAssetAction(target, 'create-volume', {
      name: disposableVolumeName,
      driver: 'local',
    })
    const volumeName = volume?.response?.Name || volume?.response?.name
    if (volumeName !== disposableVolumeName) {
      throw new Error(`create-volume response did not identify ${disposableVolumeName}: ${JSON.stringify(volume).slice(0, 800)}`)
    }
    volumeCreated = true

    const volumeInspect = assertResponseObject(
      await runResourceAction(target, 'volume', disposableVolumeName, 'inspect-volume'),
      'inspect-volume',
    )
    if (volumeInspect.Name !== disposableVolumeName) {
      throw new Error(`inspect-volume response did not identify ${disposableVolumeName}: ${JSON.stringify(volumeInspect).slice(0, 800)}`)
    }

    const network = await runEndpointAssetAction(target, 'create-network', {
      name: disposableNetworkName,
      driver: 'bridge',
    })
    const networkId = network?.response?.Id || network?.response?.id || disposableNetworkName
    networkCreated = true

    const networkInspect = assertResponseObject(
      await runResourceAction(target, 'network', disposableNetworkName, 'inspect-network'),
      'inspect-network',
    )
    if (networkInspect.Name !== disposableNetworkName && String(networkInspect.Id || '') !== String(networkId)) {
      throw new Error(`inspect-network response did not identify ${disposableNetworkName}: ${JSON.stringify(networkInspect).slice(0, 800)}`)
    }

    await runResourceAction(target, 'network', disposableNetworkName, 'connect-container', {
      container: containerId,
    })
    await runResourceAction(target, 'network', disposableNetworkName, 'disconnect-container', {
      container: containerId,
      force: true,
    })
    console.log('[assets] disposable Docker volume/network certification completed.')
  } finally {
    if (networkCreated && !keepDisposable) {
      await runResourceAction(
        target,
        'network',
        disposableNetworkName,
        'remove-network',
        { name: disposableNetworkName },
        disposableNetworkName,
      )
    } else if (networkCreated) {
      console.log(`[keep] disposable network retained: ${disposableNetworkName}`)
    }
    if (volumeCreated && !keepDisposable) {
      await runResourceAction(
        target,
        'volume',
        disposableVolumeName,
        'remove-volume',
        { name: disposableVolumeName },
        disposableVolumeName,
      )
    } else if (volumeCreated) {
      console.log(`[keep] disposable volume retained: ${disposableVolumeName}`)
    }
  }
}

async function certifyDockerStack(target) {
  let stackId
  try {
    const created = await runEndpointAssetAction(target, 'create-stack', {
      name: disposableStackName,
      stack_file_content: disposableStackCompose(),
    })
    stackId = String(created?.response?.Id || created?.response?.id || disposableStackName)
    console.log(`[stacks] create-stack id=${stackId}`)

    const stackArgs = { endpoint_id: Number(target.endpoint.id), name: disposableStackName }
    const inspect = assertResponseObject(
      await runResourceAction(target, 'stack', stackId, 'inspect-stack', stackArgs),
      'inspect-stack',
    )
    if (String(inspect.Name || inspect.name || '') !== disposableStackName && String(inspect.Id || inspect.id || '') !== stackId) {
      throw new Error(`inspect-stack response did not identify ${disposableStackName}: ${JSON.stringify(inspect).slice(0, 800)}`)
    }

    const file = await runResourceAction(target, 'stack', stackId, 'stack-file', stackArgs)
    if (!String(file?.response?.logs || '').includes('clawcontrol-stack-cert')) {
      throw new Error(`stack-file response did not include disposable compose marker: ${JSON.stringify(file).slice(0, 800)}`)
    }

    const logs = await runResourceAction(target, 'stack', stackId, 'stack-logs', { ...stackArgs, tail: 50 })
    if (!String(logs?.response?.logs || '').includes('clawcontrol-stack-cert')) {
      throw new Error(`stack-logs response did not include disposable marker: ${JSON.stringify(logs).slice(0, 800)}`)
    }

    await runResourceAction(
      target,
      'stack',
      stackId,
      'update-stack',
      {
        ...stackArgs,
        stack_file_content: disposableStackCompose('clawcontrol-stack-cert-updated'),
        prune: true,
      },
      disposableStackName,
    )
    await runResourceAction(target, 'stack', stackId, 'stop-stack', stackArgs, disposableStackName)
    await runResourceAction(target, 'stack', stackId, 'start-stack', stackArgs)
    console.log('[stacks] disposable Docker stack certification completed.')
  } finally {
    if (stackId && !keepDisposable) {
      await runResourceAction(
        target,
        'stack',
        stackId,
        'delete',
        { endpoint_id: Number(target.endpoint.id), name: disposableStackName },
        disposableStackName,
      )
    } else if (stackId) {
      console.log(`[keep] disposable stack retained: ${stackId}`)
    }
  }
}

async function certifyContainerLifecycle(target, id) {
  await runContainerAction(target, id, 'start')
  await inspectDisposableContainer(target, id, { Running: true }, 'start')
  await runContainerAction(target, id, 'restart')
  await inspectDisposableContainer(target, id, { Running: true }, 'restart')
  await runContainerAction(target, id, 'pause')
  await inspectDisposableContainer(target, id, { Running: true, Paused: true }, 'pause')
  await runContainerAction(target, id, 'unpause')
  await inspectDisposableContainer(target, id, { Running: true, Paused: false }, 'unpause')
  await runContainerAction(target, id, 'stop')
  await inspectDisposableContainer(target, id, { Running: false }, 'stop')
  await runContainerAction(target, id, 'start')
  await inspectDisposableContainer(target, id, { Running: true }, 'start after stop')
  await runContainerAction(target, id, 'kill')
  await inspectDisposableContainer(target, id, { Running: false }, 'kill')
  console.log('[lifecycle] disposable container lifecycle certification completed.')
}

async function certifyReadOnly(target, targets) {
  for (const candidate of targets) {
    validateDockerInventory(candidate)
    validateSwarmInventory(candidate)
  }
  const now = Math.floor(Date.now() / 1000)
  await fetchBoundedEvents(target, now - 3600, now, {})
  const session = await createEventFollowSession(target, now - 300, {})
  const socket = await openEventWebsocket(session.websocketUrl, 'Docker events', 'events-follow')
  socket.close()
  console.log('[done] Portainer Docker events read-only certification completed.')
}

async function certifyDisposable(target) {
  const since = Math.floor(Date.now() / 1000) - 5
  const session = await createEventFollowSession(target, since, { type: 'container' })
  const socket = await openEventWebsocket(session.websocketUrl, 'Docker events', 'events-follow')
  let containerId
  try {
    containerId = await createDisposableContainer(target)
    await socket.waitFor(disposableName, 15000)
    const until = Math.floor(Date.now() / 1000) + 30
    const events = await fetchBoundedEvents(target, since, until, { type: 'container' })
    if (!events.some(event => eventMatchesName(event, disposableName))) {
      throw new Error(`bounded Docker event history did not include ${disposableName}`)
    }
    console.log(`[events] disposable event observed for ${disposableName}`)
    if (runContainerDetails) {
      await certifyContainerDetails(target, containerId)
    }
    if (runDockerImages) {
      await certifyDockerImages(target)
    }
    if (runDockerAssets) {
      await certifyDockerAssets(target, containerId)
    }
    if (runDockerStacks) {
      await certifyDockerStack(target)
    }
    if (runContainerMutations) {
      containerId = await certifyContainerMutations(target, containerId)
    }
    if (runContainerLifecycle) {
      await certifyContainerLifecycle(target, containerId)
    }
  } finally {
    socket.close()
    if (containerId && !keepDisposable) {
      await removeDisposableContainer(target, containerId)
    } else if (containerId) {
      console.log(`[keep] disposable container retained: ${containerId}`)
    }
  }
  console.log('[done] Portainer Docker events disposable certification completed.')
}

async function main() {
  const homelab = await request('/api/homelab')
  const targets = dockerEndpointCandidates(homelab)
  const target = targets[0]
  if (!target) {
    throw new Error('No Portainer Docker endpoint found in /api/homelab inventory')
  }
  console.log(`[inventory] instance=${target.instance.id} endpoint=${target.endpoint.id} ${target.endpoint.name}`)
  if (readOnly && !createDisposable) {
    await certifyReadOnly(target, targets)
  } else {
    await certifyDisposable(target)
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
