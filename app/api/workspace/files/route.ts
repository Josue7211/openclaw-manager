import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

const WORKSPACE = '/home/aparcedodev/.openclaw/workspace'
const API_URL = process.env.OPENCLAW_API_URL
const API_KEY = process.env.OPENCLAW_API_KEY

export async function GET() {
  // Remote mode: proxy to OpenClaw API
  if (API_URL) {
    try {
      const res = await fetch(`${API_URL}/files`, {
        headers: API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {},
      })
      const data = await res.json()
      return NextResponse.json(data)
    } catch {
      return NextResponse.json({ coreFiles: [], memoryFiles: [] })
    }
  }

  // Local mode: read from filesystem
  const coreFiles = ['SOUL.md', 'AGENTS.md', 'USER.md', 'IDENTITY.md', 'TOOLS.md', 'HEARTBEAT.md', 'RESEARCH.md', 'BOOTSTRAP.md']
    .filter(f => fs.existsSync(path.join(WORKSPACE, f)))
    .map(f => ({ name: f, path: f }))

  const memoryDir = path.join(WORKSPACE, 'memory')
  const memoryFiles = fs.existsSync(memoryDir)
    ? fs.readdirSync(memoryDir)
        .filter(f => f.endsWith('.md'))
        .sort()
        .reverse()
        .map(f => ({ name: f, path: `memory/${f}` }))
    : []

  return NextResponse.json({ coreFiles, memoryFiles })
}
