import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

const OPENCLAW_URL = process.env.OPENCLAW_API_URL
const OPENCLAW_KEY = process.env.OPENCLAW_API_KEY

export async function GET() {
  // Remote API mode — proxy to OpenClaw VM
  if (OPENCLAW_URL) {
    try {
      const headers: Record<string, string> = {}
      if (OPENCLAW_KEY) headers['Authorization'] = `Bearer ${OPENCLAW_KEY}`
      const res = await fetch(`${OPENCLAW_URL}/memory`, { headers, cache: 'no-store' })
      if (!res.ok) return NextResponse.json({ entries: [] })
      return NextResponse.json(await res.json())
    } catch {
      return NextResponse.json({ entries: [] })
    }
  }

  // Local filesystem mode
  try {
    const memoryDir = path.join(process.env.HOME || '', '.openclaw/workspace/memory')

    if (!fs.existsSync(memoryDir)) {
      return NextResponse.json({ entries: [] })
    }

    const files = fs.readdirSync(memoryDir)
      .filter(f => f.endsWith('.md') && !f.startsWith('.'))
      .sort()
      .reverse()
      .slice(0, 5)

    const entries = files.map(file => {
      const filePath = path.join(memoryDir, file)
      let preview = ''
      try {
        const content = fs.readFileSync(filePath, 'utf-8')
        const firstLine = content
          .split('\n')
          .find(l => l.trim() && !l.trim().startsWith('#')) || ''
        preview = firstLine.slice(0, 120)
      } catch { /* ignore */ }

      const date = file.replace('.md', '')
      return { date, preview, path: `memory/${file}` }
    })

    return NextResponse.json({ entries })
  } catch {
    return NextResponse.json({ entries: [] })
  }
}
