import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

const WORKSPACE = '/home/aparcedodev/.openclaw/workspace'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const filePath = searchParams.get('path') || ''
  const safe = filePath.replace(/\.\./g, '').replace(/^\//, '')
  const full = path.join(WORKSPACE, safe)
  if (!full.startsWith(WORKSPACE)) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
  }
  try {
    const content = fs.readFileSync(full, 'utf-8')
    return NextResponse.json({ content })
  } catch {
    return NextResponse.json({ error: 'File not found' }, { status: 404 })
  }
}

export async function POST(req: Request) {
  const { path: filePath, content } = await req.json()
  const safe = filePath.replace(/\.\./g, '').replace(/^\//, '')
  const full = path.join(WORKSPACE, safe)
  if (!full.startsWith(WORKSPACE)) {
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
