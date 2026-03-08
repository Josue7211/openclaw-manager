import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

const WORKSPACE = '/home/aparcedodev/.openclaw/workspace'

export async function GET() {
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
