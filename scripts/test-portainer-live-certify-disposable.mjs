#!/usr/bin/env node

import crypto from 'node:crypto'
import http from 'node:http'
import { spawn } from 'node:child_process'

const API_KEY = 'dummy-portainer-cert-key'
const CONTAINER_NAME = 'clawcontrol-cert-events-mock'
const CONTAINER_ID = 'mock-container-id'
const RENAMED_CONTAINER_NAME = `${CONTAINER_NAME}-renamed`
const DUPLICATE_CONTAINER_NAME = `${CONTAINER_NAME}-copy`
const DUPLICATE_CONTAINER_ID = 'mock-container-copy-id'
const RECREATED_CONTAINER_ID = 'mock-container-recreated-id'
const SOURCE_IMAGE = 'alpine:3.20'
const TAGGED_IMAGE = `${CONTAINER_NAME}-image:cert`
const VOLUME_NAME = `${CONTAINER_NAME}-vol`
const NETWORK_NAME = `${CONTAINER_NAME}-net`
const NETWORK_ID = 'mock-network-id'
const STACK_NAME = `${CONTAINER_NAME}-stack`
const STACK_ID = '17'

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

function websocketTextFrame(text) {
  const payload = Buffer.from(text)
  if (payload.length > 125) throw new Error('mock websocket frame payload is too large')
  return Buffer.concat([Buffer.from([0x81, payload.length]), payload])
}

function handleUpgrade(req, socket) {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1')
  if (url.searchParams.get('apiKey') !== API_KEY) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
    socket.destroy()
    return
  }

  const key = req.headers['sec-websocket-key']
  if (!key) {
    socket.write('HTTP/1.1 400 Bad Request\r\n\r\n')
    socket.destroy()
    return
  }

  const accept = crypto
    .createHash('sha1')
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest('base64')

  socket.write([
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${accept}`,
    '',
    '',
  ].join('\r\n'))

  socket.write(websocketTextFrame('Connected to agent-vm Docker events.\n'))
  setTimeout(() => {
    socket.write(websocketTextFrame(`{"Type":"container","Action":"create","Actor":{"Attributes":{"name":"${CONTAINER_NAME}"}}}\n`))
  }, 30)
  setTimeout(() => socket.end(), 100)
}

function assertEndpointAction(body, action) {
  if (body.provider !== 'portainer') throw new Error(`${action}: provider was ${body.provider}`)
  if (body.instanceId !== 'services') throw new Error(`${action}: instanceId was ${body.instanceId}`)
  if (body.resourceType !== 'endpoint') throw new Error(`${action}: resourceType was ${body.resourceType}`)
  if (body.resourceId !== '3') throw new Error(`${action}: resourceId was ${body.resourceId}`)
  if (body.action !== action) throw new Error(`expected action ${action}, got ${body.action}`)
}

function assertContainerAction(body, action) {
  if (body.provider !== 'portainer') throw new Error(`${action}: provider was ${body.provider}`)
  if (body.instanceId !== 'services') throw new Error(`${action}: instanceId was ${body.instanceId}`)
  if (body.resourceType !== 'container') throw new Error(`${action}: resourceType was ${body.resourceType}`)
  if (![CONTAINER_ID, RECREATED_CONTAINER_ID].includes(body.resourceId)) throw new Error(`${action}: resourceId was ${body.resourceId}`)
  if (body.action !== action) throw new Error(`expected action ${action}, got ${body.action}`)
  if (body.args?.endpoint_id !== 3) throw new Error(`${action}: endpoint_id mismatch`)
}

function assertResourceAction(body, resourceType, resourceId, action) {
  if (body.provider !== 'portainer') throw new Error(`${action}: provider was ${body.provider}`)
  if (body.instanceId !== 'services') throw new Error(`${action}: instanceId was ${body.instanceId}`)
  if (body.resourceType !== resourceType) throw new Error(`${action}: resourceType was ${body.resourceType}`)
  if (body.resourceId !== resourceId) throw new Error(`${action}: resourceId was ${body.resourceId}`)
  if (body.action !== action) throw new Error(`expected action ${action}, got ${body.action}`)
  if (body.args?.endpoint_id !== 3) throw new Error(`${action}: endpoint_id mismatch`)
}

function assertStackAction(body, action) {
  assertResourceAction(body, 'stack', STACK_ID, action)
  if (body.args?.name !== STACK_NAME) throw new Error(`${action}: stack name mismatch`)
}

async function main() {
  const requests = []
  const containerState = { Running: false, Paused: false }
  let currentContainerId = CONTAINER_ID
  let currentContainerName = CONTAINER_NAME
  const server = http.createServer(async (req, res) => {
    if (req.headers['x-api-key'] !== API_KEY) {
      json(res, 401, { error: 'bad key' })
      return
    }

    if (req.url === '/api/homelab' && req.method === 'GET') {
      requests.push({ method: req.method, url: req.url })
      json(res, 200, {
        data: {
          portainer: {
            instances: [
              {
                id: 'services',
                name: 'Services Portainer',
                available: true,
                endpoints: [{ id: 3, name: 'agent-vm', platform: 'docker', type: 2, status: 1 }],
              },
            ],
          },
        },
      })
      return
    }

    if (req.url === '/api/homelab/portainer/terminal/session' && req.method === 'POST') {
      const body = await readBody(req)
      requests.push({ method: req.method, url: req.url, body })
      assertEndpointAction(body, 'events-follow')
      if (body.args?.type !== 'container') {
        json(res, 400, { error: 'events-follow did not request container type filter' })
        return
      }
      json(res, 200, {
        data: {
          sessionId: 'portainer-events-1',
          websocketUrl: '/api/homelab/portainer/terminal/ws?sessionId=portainer-events-1',
          mode: 'portainer-api',
          terminal: 'xterm',
        },
      })
      return
    }

    if (req.url === '/api/homelab/portainer/action' && req.method === 'POST') {
      const body = await readBody(req)
      requests.push({ method: req.method, url: req.url, body })
      if (body.action === 'create-container') {
        assertEndpointAction(body, 'create-container')
        if (body.args?.name !== CONTAINER_NAME) throw new Error('create-container name mismatch')
        if (!String(body.args?.command || '').includes('sleep 300')) throw new Error('create-container command should keep disposable alive')
        if (body.args?.restart_policy !== 'no') throw new Error('create-container restart_policy mismatch')
        json(res, 200, {
          data: {
            mode: 'portainer-api',
            response: { Id: CONTAINER_ID },
          },
        })
        return
      }
      if (body.action === 'update-restart-policy') {
        assertResourceAction(body, 'container', currentContainerId, 'update-restart-policy')
        if (body.args?.restart_policy !== 'no') throw new Error('update-restart-policy value mismatch')
        json(res, 200, {
          data: {
            mode: 'portainer-api',
            response: { Warnings: [] },
          },
        })
        return
      }
      if (body.action === 'update-resources') {
        assertResourceAction(body, 'container', currentContainerId, 'update-resources')
        if (body.args?.cpu_shares !== 128) throw new Error('update-resources cpu_shares mismatch')
        json(res, 200, {
          data: {
            mode: 'portainer-api',
            response: { Warnings: [] },
          },
        })
        return
      }
      if (body.action === 'rename') {
        assertResourceAction(body, 'container', currentContainerId, 'rename')
        if (body.args?.new_name !== RENAMED_CONTAINER_NAME) throw new Error('rename new_name mismatch')
        currentContainerName = RENAMED_CONTAINER_NAME
        json(res, 200, {
          data: {
            mode: 'portainer-api',
            response: {},
          },
        })
        return
      }
      if (body.action === 'duplicate') {
        assertResourceAction(body, 'container', currentContainerId, 'duplicate')
        if (body.args?.name !== RENAMED_CONTAINER_NAME) throw new Error('duplicate source name mismatch')
        if (body.args?.new_name !== DUPLICATE_CONTAINER_NAME) throw new Error('duplicate new_name mismatch')
        if (body.args?.start !== false) throw new Error('duplicate start mismatch')
        json(res, 200, {
          data: {
            mode: 'portainer-api',
            response: { id: DUPLICATE_CONTAINER_ID, name: DUPLICATE_CONTAINER_NAME, started: false },
          },
        })
        return
      }
      if (body.action === 'recreate') {
        assertResourceAction(body, 'container', currentContainerId, 'recreate')
        if (body.confirmation !== CONTAINER_NAME) throw new Error('recreate did not send typed confirmation')
        if (body.args?.name !== CONTAINER_NAME) throw new Error('recreate name mismatch')
        if (body.args?.start !== false) throw new Error('recreate start mismatch')
        currentContainerId = RECREATED_CONTAINER_ID
        currentContainerName = CONTAINER_NAME
        containerState.Running = false
        containerState.Paused = false
        json(res, 200, {
          data: {
            mode: 'portainer-api',
            response: { id: RECREATED_CONTAINER_ID, name: CONTAINER_NAME, started: false },
          },
        })
        return
      }
      if (body.action === 'events') {
        assertEndpointAction(body, 'events')
        if (body.args?.type !== 'container') throw new Error('events history did not request container type filter')
        json(res, 200, {
          data: {
            mode: 'portainer-api',
            response: {
              logs: `{"time":1779235200,"Type":"container","Action":"create","id":"${CONTAINER_ID}","Actor":{"Attributes":{"name":"${CONTAINER_NAME}"}}}\n`,
            },
          },
        })
        return
      }
      if (body.action === 'pull-image') {
        assertEndpointAction(body, 'pull-image')
        if (body.args?.image !== 'alpine') throw new Error('pull-image image mismatch')
        if (body.args?.tag !== '3.20') throw new Error('pull-image tag mismatch')
        json(res, 200, {
          data: {
            mode: 'portainer-api',
            response: [{ status: 'Downloaded newer image for alpine:3.20' }],
          },
        })
        return
      }
      if (body.action === 'create-volume') {
        assertEndpointAction(body, 'create-volume')
        if (body.args?.name !== VOLUME_NAME) throw new Error('create-volume name mismatch')
        if (body.args?.driver !== 'local') throw new Error('create-volume driver mismatch')
        json(res, 200, {
          data: {
            mode: 'portainer-api',
            response: { Name: VOLUME_NAME, Driver: 'local' },
          },
        })
        return
      }
      if (body.action === 'create-network') {
        assertEndpointAction(body, 'create-network')
        if (body.args?.name !== NETWORK_NAME) throw new Error('create-network name mismatch')
        if (body.args?.driver !== 'bridge') throw new Error('create-network driver mismatch')
        json(res, 200, {
          data: {
            mode: 'portainer-api',
            response: { Id: NETWORK_ID, Warning: '' },
          },
        })
        return
      }
      if (body.action === 'create-stack') {
        assertEndpointAction(body, 'create-stack')
        if (body.args?.name !== STACK_NAME) throw new Error('create-stack name mismatch')
        if (!String(body.args?.stack_file_content || '').includes('clawcontrol-stack-cert')) throw new Error('create-stack compose marker missing')
        json(res, 200, {
          data: {
            mode: 'portainer-api',
            response: { Id: Number(STACK_ID), Name: STACK_NAME },
          },
        })
        return
      }
      if (body.action === 'logs') {
        assertContainerAction(body, 'logs')
        json(res, 200, {
          data: {
            mode: 'portainer-api',
            response: { logs: '2026-05-22T00:00:00Z clawcontrol-cert\n' },
          },
        })
        return
      }
      if (body.action === 'stats') {
        assertContainerAction(body, 'stats')
        json(res, 200, {
          data: {
            mode: 'portainer-api',
            response: {
              read: '2026-05-22T00:00:00Z',
              cpu_stats: { cpu_usage: { total_usage: 10 } },
              memory_stats: { usage: 2048, limit: 4096 },
            },
          },
        })
        return
      }
      if (body.action === 'processes') {
        assertContainerAction(body, 'processes')
        json(res, 200, {
          data: {
            mode: 'portainer-api',
            response: {
              Titles: ['UID', 'PID', 'CMD'],
              Processes: [['root', '1', 'sh -c echo clawcontrol-cert && sleep 300']],
            },
          },
        })
        return
      }
      if (body.action === 'exec') {
        assertContainerAction(body, 'exec')
        if (!String(body.args?.cmd || '').includes('clawcontrol-exec')) throw new Error('exec command mismatch')
        json(res, 200, {
          data: {
            mode: 'portainer-api',
            response: {
              exec_id: 'mock-exec-id',
              output: 'clawcontrol-exec\n',
            },
          },
        })
        return
      }
      if (body.action === 'changes') {
        assertContainerAction(body, 'changes')
        json(res, 200, {
          data: {
            mode: 'portainer-api',
            response: [
              { Kind: 1, Path: '/tmp/clawcontrol-cert-detail' },
            ],
          },
        })
        return
      }
      if (body.action === 'inspect-image') {
        const expectedImage = body.resourceId === TAGGED_IMAGE ? TAGGED_IMAGE : SOURCE_IMAGE
        assertResourceAction(body, 'image', expectedImage, 'inspect-image')
        json(res, 200, {
          data: {
            mode: 'portainer-api',
            response: {
              Id: 'sha256:mock-image-id',
              RepoTags: body.resourceId === TAGGED_IMAGE ? [SOURCE_IMAGE, TAGGED_IMAGE] : [SOURCE_IMAGE],
              Size: 7340032,
            },
          },
        })
        return
      }
      if (body.action === 'history-image') {
        assertResourceAction(body, 'image', SOURCE_IMAGE, 'history-image')
        json(res, 200, {
          data: {
            mode: 'portainer-api',
            response: [
              { Id: 'sha256:mock-layer-id', CreatedBy: '/bin/sh -c #(nop) ADD file:mock in /' },
            ],
          },
        })
        return
      }
      if (body.action === 'tag-image') {
        assertResourceAction(body, 'image', SOURCE_IMAGE, 'tag-image')
        if (body.args?.repo !== `${CONTAINER_NAME}-image`) throw new Error('tag-image repo mismatch')
        if (body.args?.tag !== 'cert') throw new Error('tag-image tag mismatch')
        json(res, 200, {
          data: {
            mode: 'portainer-api',
            response: {},
          },
        })
        return
      }
      if (body.action === 'remove-image') {
        assertResourceAction(body, 'image', TAGGED_IMAGE, 'remove-image')
        if (body.confirmation !== TAGGED_IMAGE) throw new Error('remove-image did not send typed confirmation')
        json(res, 200, {
          data: {
            mode: 'portainer-api',
            response: [{ Untagged: TAGGED_IMAGE }],
          },
        })
        return
      }
      if (body.action === 'inspect-stack') {
        assertStackAction(body, 'inspect-stack')
        json(res, 200, {
          data: {
            mode: 'portainer-api',
            response: { Id: Number(STACK_ID), Name: STACK_NAME, Type: 2, EndpointId: 3 },
          },
        })
        return
      }
      if (body.action === 'stack-file') {
        assertStackAction(body, 'stack-file')
        json(res, 200, {
          data: {
            mode: 'portainer-api',
            response: {
              logs: [
                'services:',
                '  cert:',
                '    image: alpine:3.20',
                '    command: sh -c "echo clawcontrol-stack-cert && sleep 300"',
                '',
              ].join('\n'),
            },
          },
        })
        return
      }
      if (body.action === 'stack-logs') {
        assertStackAction(body, 'stack-logs')
        if (body.args?.tail !== 50) throw new Error('stack-logs tail mismatch')
        json(res, 200, {
          data: {
            mode: 'portainer-api',
            response: {
              logs: `===== ${STACK_NAME}_cert_1 (stackcert123) =====\n2026-05-22T00:00:00Z clawcontrol-stack-cert\n`,
              containers: [{ id: 'stackcert123', name: `${STACK_NAME}_cert_1`, image: SOURCE_IMAGE, state: 'running' }],
              tail: 50,
            },
          },
        })
        return
      }
      if (body.action === 'update-stack') {
        assertStackAction(body, 'update-stack')
        if (body.confirmation !== STACK_NAME) throw new Error('update-stack did not send typed confirmation')
        if (!String(body.args?.stack_file_content || '').includes('clawcontrol-stack-cert-updated')) throw new Error('update-stack compose marker missing')
        if (body.args?.prune !== true) throw new Error('update-stack prune mismatch')
        json(res, 200, {
          data: {
            mode: 'portainer-api',
            response: { Id: Number(STACK_ID), Name: STACK_NAME },
          },
        })
        return
      }
      if (body.action === 'stop-stack') {
        assertStackAction(body, 'stop-stack')
        if (body.confirmation !== STACK_NAME) throw new Error('stop-stack did not send typed confirmation')
        json(res, 200, {
          data: {
            mode: 'portainer-api',
            response: {},
          },
        })
        return
      }
      if (body.action === 'start-stack') {
        assertStackAction(body, 'start-stack')
        json(res, 200, {
          data: {
            mode: 'portainer-api',
            response: {},
          },
        })
        return
      }
      if (body.action === 'delete') {
        assertStackAction(body, 'delete')
        if (body.confirmation !== STACK_NAME) throw new Error('stack delete did not send typed confirmation')
        json(res, 200, {
          data: {
            mode: 'portainer-api',
            response: {},
          },
        })
        return
      }
      if (body.action === 'inspect-volume') {
        assertResourceAction(body, 'volume', VOLUME_NAME, 'inspect-volume')
        json(res, 200, {
          data: {
            mode: 'portainer-api',
            response: { Name: VOLUME_NAME, Driver: 'local', Scope: 'local' },
          },
        })
        return
      }
      if (body.action === 'inspect-network') {
        assertResourceAction(body, 'network', NETWORK_NAME, 'inspect-network')
        json(res, 200, {
          data: {
            mode: 'portainer-api',
            response: { Id: NETWORK_ID, Name: NETWORK_NAME, Driver: 'bridge', Scope: 'local' },
          },
        })
        return
      }
      if (body.action === 'connect-container') {
        assertResourceAction(body, 'network', NETWORK_NAME, 'connect-container')
        if (body.args?.container !== CONTAINER_ID) throw new Error('connect-container target mismatch')
        json(res, 200, {
          data: {
            mode: 'portainer-api',
            response: {},
          },
        })
        return
      }
      if (body.action === 'disconnect-container') {
        assertResourceAction(body, 'network', NETWORK_NAME, 'disconnect-container')
        if (body.args?.container !== CONTAINER_ID) throw new Error('disconnect-container target mismatch')
        if (body.args?.force !== true) throw new Error('disconnect-container force mismatch')
        json(res, 200, {
          data: {
            mode: 'portainer-api',
            response: {},
          },
        })
        return
      }
      if (body.action === 'remove-network') {
        assertResourceAction(body, 'network', NETWORK_NAME, 'remove-network')
        if (body.confirmation !== NETWORK_NAME) throw new Error('remove-network did not send typed confirmation')
        json(res, 200, {
          data: {
            mode: 'portainer-api',
            response: {},
          },
        })
        return
      }
      if (body.action === 'remove-volume') {
        assertResourceAction(body, 'volume', VOLUME_NAME, 'remove-volume')
        if (body.confirmation !== VOLUME_NAME) throw new Error('remove-volume did not send typed confirmation')
        json(res, 200, {
          data: {
            mode: 'portainer-api',
            response: {},
          },
        })
        return
      }
      if (body.action === 'remove') {
        if (body.resourceId === DUPLICATE_CONTAINER_ID) {
          assertResourceAction(body, 'container', DUPLICATE_CONTAINER_ID, 'remove')
          if (body.confirmation !== DUPLICATE_CONTAINER_NAME) throw new Error('duplicate remove did not send typed confirmation')
        } else {
          assertContainerAction(body, 'remove')
          if (body.confirmation !== CONTAINER_NAME) throw new Error('remove did not send typed confirmation')
        }
        json(res, 200, {
          data: {
            mode: 'portainer-api',
            response: {},
          },
        })
        return
      }
      if (['start', 'restart', 'pause', 'unpause', 'stop', 'kill', 'inspect'].includes(body.action)) {
        assertContainerAction(body, body.action)
        switch (body.action) {
          case 'start':
          case 'restart':
            containerState.Running = true
            containerState.Paused = false
            break
          case 'pause':
            containerState.Running = true
            containerState.Paused = true
            break
          case 'unpause':
            containerState.Running = true
            containerState.Paused = false
            break
          case 'stop':
          case 'kill':
            containerState.Running = false
            containerState.Paused = false
            break
        }
        json(res, 200, {
          data: {
            mode: 'portainer-api',
            response: {
              Id: body.resourceId,
              Name: `/${currentContainerName}`,
              State: { ...containerState },
            },
          },
        })
        return
      }
      json(res, 400, { error: `unexpected action ${body.action}` })
    }

    json(res, 404, { error: `unhandled ${req.method} ${req.url}` })
  })

  server.on('upgrade', handleUpgrade)

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  const child = spawn(process.execPath, ['scripts/portainer-live-certify.mjs', '--create-disposable', '--container-details', '--docker-images', '--docker-assets', '--docker-stacks', '--container-mutations', '--container-lifecycle', '--yes'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      CLAWCONTROL_API_BASE: `http://127.0.0.1:${port}`,
      MC_API_KEY: API_KEY,
      PORTAINER_CERTIFY_NAME: CONTAINER_NAME,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let stdout = ''
  let stderr = ''
  child.stdout.on('data', chunk => {
    stdout += chunk
    process.stdout.write(chunk)
  })
  child.stderr.on('data', chunk => {
    stderr += chunk
    process.stderr.write(chunk)
  })

  const code = await new Promise(resolve => child.on('exit', resolve))
  await new Promise(resolve => server.close(resolve))

  if (code !== 0) {
    throw new Error(`Portainer disposable cert runner exited ${code}\n${stderr}`)
  }

  const requiredOutput = [
    '[inventory] instance=services endpoint=3 agent-vm',
    '[session] events-follow endpoint=3 id=portainer-events-1',
    `[action] create-container ${CONTAINER_NAME}`,
    `[events] disposable event observed for ${CONTAINER_NAME}`,
    '[details] disposable container detail certification completed.',
    '[images] disposable Docker image certification completed.',
    '[assets] disposable Docker volume/network certification completed.',
    '[stacks] disposable Docker stack certification completed.',
    '[mutations] disposable container mutation certification completed.',
    '[lifecycle] disposable container lifecycle certification completed.',
    `[cleanup] remove ${RECREATED_CONTAINER_ID}`,
    '[done] Portainer Docker events disposable certification completed.',
  ]
  for (const line of requiredOutput) {
    if (!stdout.includes(line)) {
      throw new Error(`missing expected runner output: ${line}`)
    }
  }

  const actions = requests
    .filter(request => request.url === '/api/homelab/portainer/action')
    .map(request => request.body.action)
  for (const action of ['create-container', 'events', 'start', 'logs', 'stats', 'processes', 'exec', 'changes', 'pull-image', 'inspect-image', 'history-image', 'tag-image', 'remove-image', 'create-volume', 'inspect-volume', 'create-network', 'inspect-network', 'connect-container', 'disconnect-container', 'remove-network', 'remove-volume', 'create-stack', 'inspect-stack', 'stack-file', 'stack-logs', 'update-stack', 'stop-stack', 'start-stack', 'delete', 'update-restart-policy', 'update-resources', 'rename', 'duplicate', 'recreate', 'restart', 'pause', 'unpause', 'stop', 'kill', 'remove']) {
    if (!actions.includes(action)) {
      throw new Error(`expected ${action} request was not observed`)
    }
  }
  if (actions.filter(action => action === 'inspect').length < 6) {
    throw new Error('expected repeated inspect requests for lifecycle state verification')
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
