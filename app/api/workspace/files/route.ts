import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

const OPENCLAW_URL = process.env.OPENCLAW_API_URL
const OPENCLAW_KEY = process.env.OPENCLAW_API_KEY
const WORKSPACE = path.join(process.env.HOME || '', '.openclaw/workspace')

export async function GET() {
  // Remote API mode — proxy to OpenClaw VM
  if (OPENCLAW_URL) {
    try {
      const headers: Record<string, string> = {}
      if (OPENCLAW_KEY) headers['Authorization'] = `Bearer ${OPENCLAW_KEY}`
      const res = await fetch(`${OPENCLAW_URL}/files`, { headers, cache: 'no-store' })
      if (!res.ok) return NextResponse.json({ coreFiles: [], memoryFiles: [] })
      return NextResponse.json(await res.json())
    } catch {
      return NextResponse.json({ coreFiles: [], memoryFiles: [] })
    }
  }

  // Local filesystem mode
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
