#!/usr/bin/env node

import crypto from 'node:crypto'
import http from 'node:http'
import { spawn } from 'node:child_process'

const API_KEY = 'dummy-cert-key'

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

  const greeting = url.pathname.includes('/shell/') ? 'OK' : 'RFB 003.008\n'
  socket.write(websocketTextFrame(greeting))
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
          proxmox: {
            nodes: [{ name: 'pve', status: 'online' }],
            vms: [
              { vmid: 200, name: 'openclaw', node: 'pve', kind: 'qemu', status: 'running' },
              { vmid: 500, name: 'services', node: 'pve', kind: 'qemu', status: 'running' },
            ],
          },
        },
      })
      return
    }

    if (req.url === '/api/homelab/proxmox/shell/session' && req.method === 'POST') {
      const body = await readBody(req)
      requests.push({ method: req.method, url: req.url, body })
      if (body.node !== 'pve') {
        json(res, 400, { error: `unexpected shell node ${body.node}` })
        return
      }
      json(res, 200, {
        data: {
          sessionId: 'shell-1',
          websocketUrl: '/api/homelab/proxmox/shell/ws?sessionId=shell-1',
        },
      })
      return
    }

    if (req.url === '/api/homelab/proxmox/console/session' && req.method === 'POST') {
      const body = await readBody(req)
      requests.push({ method: req.method, url: req.url, body })
      if (body.node !== undefined) {
        json(res, 400, { error: 'single-node read-only cert must omit node to test backend inference' })
        return
      }
      if (body.vmid === 200) {
        json(res, 400, { error: 'mock VM has no available console' })
        return
      }
      if (body.kind !== 'qemu' || body.vmid !== 500) {
        json(res, 400, { error: 'unexpected console target' })
        return
      }
      json(res, 200, {
        data: {
          sessionId: 'console-1',
          websocketUrl: '/api/homelab/proxmox/console/ws?sessionId=console-1',
        },
      })
      return
    }

    json(res, 404, { error: `unhandled ${req.method} ${req.url}` })
  })

  server.on('upgrade', handleUpgrade)

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  const child = spawn(process.execPath, ['scripts/proxmox-live-certify.mjs', '--read-only'], {
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
    throw new Error(`read-only cert runner exited ${code}\n${stderr}`)
  }

  const requiredOutput = [
    '[inventory] nodes=pve guests=2',
    '[ws] shell: "OK"',
    '[skip] console pve/qemu/200 openclaw:',
    '[session] console pve/qemu/500 services id=console-1 node=inferred',
    '[ws] console: "RFB 003.008\\n"',
    '[done] Proxmox read-only certification completed.',
  ]
  for (const line of requiredOutput) {
    if (!stdout.includes(line)) {
      throw new Error(`missing expected runner output: ${line}`)
    }
  }

  const consoleRequest = requests.find(request => request.url === '/api/homelab/proxmox/console/session')
  if (!consoleRequest || consoleRequest.body.node !== undefined) {
    throw new Error('console session request did not prove single-node node inference')
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
