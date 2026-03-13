#!/usr/bin/env node
/**
 * Lightweight API server for exposing OpenClaw workspace files.
 * Run this on the machine where OpenClaw's workspace lives.
 *
 * Environment variables:
 *   PORT                 – listen port (default: 3939)
 *   API_KEY              – bearer token for auth (optional, open if unset)
 *   OPENCLAW_WORKSPACE   – workspace directory (default: ~/.openclaw/workspace)
 *
 * Then point Mission Control at it via the Settings page or keyring:
 *   openclaw.ws  = http://<host>:3939
 *   openclaw.password = <your API_KEY>
 */

import { createServer } from 'node:http'
import { readFileSync, readdirSync, existsSync, statSync, mkdirSync, writeFileSync, unlinkSync, realpathSync } from 'node:fs'
import { join, resolve, sep, dirname } from 'node:path'
import { homedir } from 'node:os'
import { timingSafeEqual } from 'node:crypto'

const PORT = parseInt(process.env.PORT || '3939')
const API_KEY = process.env.API_KEY || ''
const WORKSPACE = process.env.OPENCLAW_WORKSPACE || join(homedir(), '.openclaw/workspace')
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || ''
const MAX_BODY_BYTES = 6 * 1024 * 1024

const CORE_FILES = ['SOUL.md', 'AGENTS.md', 'USER.md', 'IDENTITY.md', 'TOOLS.md', 'HEARTBEAT.md', 'RESEARCH.md', 'BOOTSTRAP.md']

function corsOrigin() {
  return ALLOWED_ORIGIN || '*'
}

function json(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': corsOrigin() })
  res.end(JSON.stringify(data))
}

function safePath(userPath) {
  const cleaned = userPath.replace(/^\//, '')
  if (cleaned.includes('..')) return null
  const resolved = resolve(WORKSPACE, cleaned)
  if (!resolved.startsWith(WORKSPACE + sep) && resolved !== WORKSPACE) return null
  // Follow symlinks to prevent escaping via symlink
  try {
    const real = realpathSync(resolved)
    const wsReal = realpathSync(WORKSPACE)
    if (!real.startsWith(wsReal + sep) && real !== wsReal) return null
    return real
  } catch {
    // File doesn't exist yet (for writes) — lexical check above is sufficient
    return resolved
  }
}

function auth(req) {
  if (!API_KEY) return true
  const header = req.headers['authorization'] || ''
  const expected = `Bearer ${API_KEY}`
  if (header.length !== expected.length) return false
  try {
    return timingSafeEqual(Buffer.from(header), Buffer.from(expected))
  } catch {
    return false
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', c => {
      size += c.length
      if (size > MAX_BODY_BYTES) {
        req.destroy()
        reject(new Error('Body too large'))
        return
      }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString()))
    req.on('error', reject)
  })
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'Access-Control-Allow-Origin': corsOrigin(), 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS' })
      return res.end()
    }

    if (!auth(req)) return json(res, { error: 'Unauthorized' }, 401)

    const url = new URL(req.url, `http://localhost:${PORT}`)
    const path = url.pathname.replace(/\/$/, '')

    // GET /files — list core + memory files
    if (path === '/files' && req.method === 'GET') {
      const coreFiles = CORE_FILES
        .filter(f => existsSync(join(WORKSPACE, f)))
        .map(f => ({ name: f, path: f }))

      const memDir = join(WORKSPACE, 'memory')
      const memoryFiles = existsSync(memDir)
        ? readdirSync(memDir).filter(f => f.endsWith('.md')).sort().reverse().map(f => ({ name: f, path: `memory/${f}` }))
        : []

      return json(res, { coreFiles, memoryFiles })
    }

    // GET /file?path=... — read a file
    if (path === '/file' && req.method === 'GET') {
      const filePath = url.searchParams.get('path') || ''
      const full = safePath(filePath)
      if (!full) return json(res, { error: 'Invalid path' }, 400)
      try {
        const stat = statSync(full)
        if (stat.size > 5 * 1024 * 1024) return json(res, { error: 'File too large' }, 413)
        const content = readFileSync(full, 'utf-8')
        return json(res, { content })
      } catch {
        return json(res, { error: 'File not found' }, 404)
      }
    }

    // POST /file — write/edit a file
    if (path === '/file' && req.method === 'POST') {
      const raw = await readBody(req)
      let body
      try { body = JSON.parse(raw) } catch { return json(res, { error: 'Invalid JSON' }, 400) }
      const { path: filePath, content } = body
      if (typeof filePath !== 'string' || typeof content !== 'string') return json(res, { error: 'path and content required' }, 400)
      if (content.length > 5 * 1024 * 1024) return json(res, { error: 'Content too large' }, 413)
      const full = safePath(filePath)
      if (!full) return json(res, { error: 'Invalid path' }, 400)
      try {
        mkdirSync(dirname(full), { recursive: true })
        writeFileSync(full, content, 'utf-8')
        return json(res, { ok: true })
      } catch {
        return json(res, { error: 'Write failed' }, 500)
      }
    }

    // DELETE /file?path=... — delete a file
    if (path === '/file' && req.method === 'DELETE') {
      const filePath = url.searchParams.get('path') || ''
      if (!filePath) return json(res, { error: 'path is required' }, 400)
      const basename = filePath.split('/').pop()
      if (CORE_FILES.includes(basename) && !filePath.startsWith('memory/')) {
        return json(res, { error: 'Cannot delete core workspace files' }, 400)
      }
      const full = safePath(filePath)
      if (!full) return json(res, { error: 'Invalid path' }, 400)
      try {
        unlinkSync(full)
        return json(res, { ok: true })
      } catch (e) {
        if (e.code === 'ENOENT') return json(res, { error: 'File not found' }, 404)
        return json(res, { error: 'Delete failed' }, 500)
      }
    }

    // GET /memory — memory entries with previews
    if (path === '/memory' && req.method === 'GET') {
      const memDir = join(WORKSPACE, 'memory')
      if (!existsSync(memDir)) return json(res, { entries: [] })
      const files = readdirSync(memDir).filter(f => f.endsWith('.md') && !f.startsWith('.')).sort().reverse().slice(0, 5)
      const entries = files.map(file => {
        let preview = ''
        try {
          const content = readFileSync(join(memDir, file), 'utf-8')
          const firstLine = content.split('\n').find(l => l.trim() && !l.trim().startsWith('#')) || ''
          preview = firstLine.slice(0, 120)
        } catch { /* ignore */ }
        return { date: file.replace('.md', ''), preview, path: `memory/${file}` }
      })
      return json(res, { entries })
    }

    json(res, { error: 'Not found' }, 404)
  } catch (e) {
    if (!res.headersSent) {
      json(res, { error: 'Internal server error' }, 500)
    }
  }
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`OpenClaw API listening on :${PORT}`)
  console.log(`Workspace: ${WORKSPACE}`)
  console.log(`Auth: ${API_KEY ? 'API key required' : 'open (set API_KEY to secure)'}`)
})
