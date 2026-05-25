#!/usr/bin/env node

import crypto from 'node:crypto'
import http from 'node:http'
import { spawn } from 'node:child_process'

const API_KEY = 'dummy-portainer-cert-key'

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
  setTimeout(() => socket.end(), 50)
}

async function main() {
  const requests = []
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
                endpoints: [
                  {
                    id: 3,
                    name: 'agent-vm',
                    platform: 'docker',
                    type: 2,
                    status: 1,
                    features: ['swarm'],
                    docker_info: {
                      name: 'agent-vm',
                      server_version: '27.5.1',
                      operating_system: 'Ubuntu 24.04.2 LTS',
                      os_type: 'linux',
                      architecture: 'x86_64',
                      cpus: 8,
                      memory_bytes: 33554432,
                      containers: 2,
                      containers_running: 1,
                      containers_paused: 0,
                      containers_stopped: 1,
                      images: 4,
                      docker_root_dir: '/var/lib/docker',
                      driver: 'overlay2',
                      swarm_local_node_state: 'active',
                      swarm_control_available: true,
                    },
                  },
                ],
                stacks: [{ id: 42, name: 'edge-stack', type: 2, endpoint_id: 3, instance_id: 'services' }],
                containers: [
                  {
                    id: 'nginx-container-id',
                    name: 'nginx',
                    image: 'nginx:1.27',
                    status: 'Up 4 minutes',
                    state: 'running',
                    ports: '0.0.0.0:8080->80/tcp',
                    created: 1779235000,
                    command: 'nginx -g daemon off;',
                    network_names: ['bridge'],
                    mount_count: 1,
                    labels: { 'com.docker.compose.project': 'edge-stack' },
                    endpoint_id: 3,
                    endpoint_name: 'agent-vm',
                    instance_id: 'services',
                    provider: 'portainer',
                  },
                ],
                images: [
                  {
                    id: 'sha256:nginx-image-id',
                    name: 'nginx:1.27',
                    tags: ['nginx:1.27'],
                    digests: ['nginx@sha256:example'],
                    size: 192000000,
                    shared_size: -1,
                    virtual_size: 192000000,
                    containers: 1,
                    labels_count: 0,
                    created: 1779234000,
                    endpoint_id: 3,
                    endpoint_name: 'agent-vm',
                    instance_id: 'services',
                  },
                ],
                volumes: [
                  {
                    id: 'nginx-data',
                    name: 'nginx-data',
                    driver: 'local',
                    mountpoint: '/var/lib/docker/volumes/nginx-data/_data',
                    created_at: '2026-05-22T12:00:00Z',
                    scope: 'local',
                    status: null,
                    labels_count: 1,
                    options_count: 0,
                    usage_ref_count: 1,
                    usage_size: 4096,
                    endpoint_id: 3,
                    endpoint_name: 'agent-vm',
                    instance_id: 'services',
                  },
                ],
                networks: [
                  {
                    id: 'bridge-network-id',
                    name: 'bridge',
                    driver: 'bridge',
                    scope: 'local',
                    created: '2026-05-22T12:00:00Z',
                    ipam: '172.17.0.0/16 via 172.17.0.1',
                    internal: false,
                    attachable: false,
                    ingress: false,
                    enable_ipv6: false,
                    containers_count: 1,
                    endpoint_id: 3,
                    endpoint_name: 'agent-vm',
                    instance_id: 'services',
                  },
                ],
                secrets: [
                  {
                    id: 'secret-id',
                    name: 'api-token',
                    created_at: '2026-05-22T12:00:00Z',
                    updated_at: '2026-05-22T12:00:00Z',
                    endpoint_id: 3,
                    endpoint_name: 'agent-vm',
                    instance_id: 'services',
                  },
                ],
                configs: [
                  {
                    id: 'config-id',
                    name: 'nginx-conf',
                    created_at: '2026-05-22T12:00:00Z',
                    updated_at: '2026-05-22T12:00:00Z',
                    endpoint_id: 3,
                    endpoint_name: 'agent-vm',
                    instance_id: 'services',
                  },
                ],
                swarm_services: [
                  {
                    id: 'service-id',
                    name: 'web-service',
                    image: 'nginx:1.27',
                    mode: 'replicated',
                    replicas: 2,
                    created_at: '2026-05-22T12:00:00Z',
                    updated_at: '2026-05-22T12:05:00Z',
                    endpoint_id: 3,
                    endpoint_name: 'agent-vm',
                    instance_id: 'services',
                  },
                ],
                swarm_nodes: [
                  {
                    id: 'node-id',
                    hostname: 'swarm-manager',
                    state: 'ready',
                    availability: 'active',
                    role: 'manager',
                    manager_reachability: 'reachable',
                    leader: true,
                    endpoint_id: 3,
                    endpoint_name: 'agent-vm',
                    instance_id: 'services',
                  },
                ],
                swarm_tasks: [
                  {
                    id: 'task-id',
                    service_id: 'service-id',
                    node_id: 'node-id',
                    slot: 1,
                    desired_state: 'running',
                    state: 'running',
                    message: 'started',
                    container_id: 'task-container-id',
                    endpoint_id: 3,
                    endpoint_name: 'agent-vm',
                    instance_id: 'services',
                  },
                ],
              },
              {
                id: 'lab',
                name: 'Lab Portainer',
                available: true,
                endpoints: [
                  {
                    id: 8,
                    name: 'lab-docker',
                    platform: 'docker',
                    type: 1,
                    status: 1,
                    docker_info: {
                      name: 'lab-docker',
                      server_version: '27.5.1',
                      operating_system: 'Debian GNU/Linux 12',
                      os_type: 'linux',
                      architecture: 'x86_64',
                      cpus: 4,
                      memory_bytes: 17179869184,
                      containers: 0,
                      containers_running: 0,
                      containers_paused: 0,
                      containers_stopped: 0,
                      images: 0,
                      docker_root_dir: '/var/lib/docker',
                      driver: 'overlay2',
                      swarm_local_node_state: 'inactive',
                      swarm_control_available: false,
                    },
                  },
                ],
                stacks: [],
                containers: [],
                images: [],
                volumes: [],
                networks: [],
                secrets: [],
                configs: [],
                swarm_services: [],
                swarm_nodes: [],
                swarm_tasks: [],
              },
            ],
          },
        },
      })
      return
    }

    if (req.url === '/api/homelab/portainer/action' && req.method === 'POST') {
      const body = await readBody(req)
      requests.push({ method: req.method, url: req.url, body })
      if (body.resourceType !== 'endpoint' || body.resourceId !== '3' || body.action !== 'events') {
        json(res, 400, { error: 'unexpected action body' })
        return
      }
      if (typeof body.args?.since !== 'number' || typeof body.args?.until !== 'number') {
        json(res, 400, { error: 'bounded event request missing since/until' })
        return
      }
      json(res, 200, {
        data: {
          mode: 'portainer-api',
          response: {
            logs: '{"time":1779235200,"Type":"container","Action":"start","Actor":{"Attributes":{"name":"nginx"}}}\n',
          },
        },
      })
      return
    }

    if (req.url === '/api/homelab/portainer/terminal/session' && req.method === 'POST') {
      const body = await readBody(req)
      requests.push({ method: req.method, url: req.url, body })
      if (body.resourceType !== 'endpoint' || body.resourceId !== '3' || body.action !== 'events-follow') {
        json(res, 400, { error: 'unexpected terminal body' })
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

    json(res, 404, { error: `unhandled ${req.method} ${req.url}` })
  })

  server.on('upgrade', handleUpgrade)

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  const child = spawn(process.execPath, ['scripts/portainer-live-certify.mjs', '--read-only'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      CLAWCONTROL_API_BASE: `http://127.0.0.1:${port}`,
      MC_API_KEY: API_KEY,
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
    throw new Error(`Portainer read-only cert runner exited ${code}\n${stderr}`)
  }

  const requiredOutput = [
    '[inventory] instance=services endpoint=3 agent-vm',
    '[inventory] docker-info instance=services endpoint=3 engine=27.5.1 os=Ubuntu 24.04.2 LTS cpu=8 memory=33554432 storage=overlay2',
    '[inventory] normalized rows instance=services endpoint=3 containers=1 stacks=1 images=1 volumes=1 networks=1 secrets=1 configs=1',
    '[inventory] swarm rows instance=services endpoint=3 services=1 nodes=1 tasks=1',
    '[inventory] docker-info instance=lab endpoint=8 engine=27.5.1 os=Debian GNU/Linux 12 cpu=4 memory=17179869184 storage=overlay2',
    '[inventory] normalized rows instance=lab endpoint=8 containers=0 stacks=0 images=0 volumes=0 networks=0 secrets=0 configs=0',
    '[events] bounded returned 1 parseable events',
    '[session] events-follow endpoint=3 id=portainer-events-1',
    '[ws] events-follow: connected',
    '[done] Portainer Docker events read-only certification completed.',
  ]
  for (const line of requiredOutput) {
    if (!stdout.includes(line)) {
      throw new Error(`missing expected runner output: ${line}`)
    }
  }

  const actionRequest = requests.find(request => request.url === '/api/homelab/portainer/action')
  if (!actionRequest || actionRequest.body.action !== 'events') {
    throw new Error('bounded events action request was not observed')
  }
  const terminalRequest = requests.find(request => request.url === '/api/homelab/portainer/terminal/session')
  if (!terminalRequest || terminalRequest.body.action !== 'events-follow') {
    throw new Error('events-follow terminal request was not observed')
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
