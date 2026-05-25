import http from 'node:http'
import net from 'node:net'
import { spawn } from 'node:child_process'

const host = '127.0.0.1'
const port = 5174

function probeHttp() {
  return new Promise(resolve => {
    const req = http.get({ host, port, path: '/', timeout: 900 }, res => {
      res.resume()
      resolve(true)
    })
    req.on('timeout', () => {
      req.destroy()
      resolve(false)
    })
    req.on('error', () => resolve(false))
  })
}

function probePort() {
  return new Promise(resolve => {
    const socket = net.createConnection({ host, port })
    socket.setTimeout(900)
    socket.on('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.on('timeout', () => {
      socket.destroy()
      resolve(false)
    })
    socket.on('error', () => resolve(false))
  })
}

if (await probeHttp()) {
  console.log(`Vite is already serving http://${host}:${port}; reusing it for Tauri.`)
  process.exit(0)
}

if (await probePort()) {
  console.error(`Port ${port} is in use, but it is not serving Vite. Stop that process and run cargo tauri dev again.`)
  process.exit(1)
}

const child = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', '--host', host, '--port', String(port), '--strictPort'],
  { stdio: 'inherit' },
)

const forward = signal => {
  if (!child.killed) child.kill(signal)
}

process.on('SIGINT', forward)
process.on('SIGTERM', forward)
child.on('exit', code => process.exit(code ?? 0))
