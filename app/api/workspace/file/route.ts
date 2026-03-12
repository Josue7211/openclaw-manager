import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

const WORKSPACE = '/home/aparcedodev/.openclaw/workspace'
const API_URL = process.env.OPENCLAW_API_URL
const API_KEY = process.env.OPENCLAW_API_KEY

function safePath(userPath: string): string | null {
  const resolved = path.resolve(WORKSPACE, userPath.replace(/^\//, ''))
  if (!resolved.startsWith(WORKSPACE + path.sep) && resolved !== WORKSPACE) {
    return null
  }
  try {
    const real = fs.realpathSync(resolved)
    if (!real.startsWith(WORKSPACE + path.sep) && real !== WORKSPACE) {
      return null
    }
    return real
  } catch {
    return resolved
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const filePath = searchParams.get('path') || ''

  // Remote mode
  if (API_URL) {
    try {
      const res = await fetch(`${API_URL}/file?path=${encodeURIComponent(filePath)}`, {
        headers: API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {},
      })
      const data = await res.json()
      return NextResponse.json(data, { status: res.status })
    } catch {
      return NextResponse.json({ error: 'API unreachable' }, { status: 502 })
    }
  }

  // Local mode
  const full = safePath(filePath)
  if (!full) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
  }
  try {
    const stat = fs.statSync(full)
    if (stat.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large (max 5MB)' }, { status: 413 })
    }
    const content = fs.readFileSync(full, 'utf-8')
    return NextResponse.json({ content })
  } catch {
    return NextResponse.json({ error: 'File not found' }, { status: 404 })
  }
}

export async function POST(req: Request) {
  const { path: filePath, content } = await req.json()
  if (typeof filePath !== 'string' || typeof content !== 'string') {
    return NextResponse.json({ error: 'path and content required' }, { status: 400 })
  }
  if (content.length > 5 * 1024 * 1024) {
    return NextResponse.json({ error: 'Content too large (max 5MB)' }, { status: 413 })
  }

  // Remote mode
  if (API_URL) {
    try {
      const res = await fetch(`${API_URL}/file`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}),
        },
        body: JSON.stringify({ path: filePath, content }),
      })
      const data = await res.json()
      return NextResponse.json(data, { status: res.status })
    } catch {
      return NextResponse.json({ error: 'API unreachable' }, { status: 502 })
    }
  }

  // Local mode
  const full = safePath(filePath)
  if (!full) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
  }
  try {
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, content, 'utf-8')
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Failed to write file' }, { status: 500 })
  }
}
