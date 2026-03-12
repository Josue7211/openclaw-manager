#!/usr/bin/env node
/**
 * Lightweight API server for exposing OpenClaw workspace files.
 * Run this on the VM where OpenClaw's workspace lives.
 *
 * Usage:
 *   OPENCLAW_WORKSPACE=~/.openclaw/workspace API_KEY=your-secret node openclaw-api.mjs
 *
 * Then set in Mission Control's .env.local:
 *   OPENCLAW_API_URL=http://your-vm-ip:3939
 *   OPENCLAW_API_KEY=your-secret
 */

import { createServer } from 'node:http'
import { readFileSync, readdirSync, existsSync, statSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve, sep, dirname } from 'node:path'
import { homedir } from 'node:os'

const PORT = parseInt(process.env.PORT || '3939')
const API_KEY = process.env.API_KEY || ''
const WORKSPACE = process.env.OPENCLAW_WORKSPACE || join(homedir(), '.openclaw/workspace')

const CORE_FILES = ['SOUL.md', 'AGENTS.md', 'USER.md', 'IDENTITY.md', 'TOOLS.md', 'HEARTBEAT.md', 'RESEARCH.md', 'BOOTSTRAP.md']

function json(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
  res.end(JSON.stringify(data))
}

function safePath(userPath) {
  const resolved = resolve(WORKSPACE, userPath.replace(/^\//, ''))
  if (!resolved.startsWith(WORKSPACE + sep) && resolved !== WORKSPACE) return null
  return resolved
}

function auth(req) {
  if (!API_KEY) return true
  const header = req.headers['authorization'] || ''
  return header === `Bearer ${API_KEY}`
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = []
    req.on('data', c => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks).toString()))
  })
}

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' })
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

  // POST /file — write a file
  if (path === '/file' && req.method === 'POST') {
    const body = JSON.parse(await readBody(req))
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
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`OpenClaw API listening on :${PORT}`)
  console.log(`Workspace: ${WORKSPACE}`)
  console.log(`Auth: ${API_KEY ? 'API key required' : 'open (set API_KEY to secure)'}`)
})
