import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

// Only serve images from known safe directories
const OPENCLAW_HOME = process.env.HOME || '/home/aparcedodev'
const ALLOWED_DIRS = [
  path.join(OPENCLAW_HOME, '.openclaw/workspace/chat-uploads'),
  path.join(OPENCLAW_HOME, '.openclaw/workspace'),
  path.join(OPENCLAW_HOME, '.openclaw/media/chat-images'),
]

const ALLOWED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp'])

function isSafePath(filePath: string): boolean {
  const resolved = path.resolve(filePath)
  // Check extension
  if (!ALLOWED_EXTENSIONS.has(path.extname(resolved).toLowerCase())) {
    return false
  }
  // Resolve symlinks to prevent escape
  let realPath: string
  try {
    realPath = fs.realpathSync(resolved)
  } catch {
    return false
  }
  // Verify real path is strictly inside an allowed directory (trailing sep prevents prefix attacks)
  return ALLOWED_DIRS.some(dir => realPath.startsWith(dir + path.sep) || realPath === dir)
}

function guessMime(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  switch (ext) {
    case '.png':  return 'image/png'
    case '.jpg':
    case '.jpeg': return 'image/jpeg'
    case '.gif':  return 'image/gif'
    case '.webp': return 'image/webp'
    default:      return 'image/png'
  }
}

export async function GET(req: NextRequest) {
  const filePath = req.nextUrl.searchParams.get('path')
  if (!filePath) {
    return NextResponse.json({ error: 'missing path' }, { status: 400 })
  }

  if (!isSafePath(filePath)) {
    return NextResponse.json({ error: 'forbidden path' }, { status: 403 })
  }

  try {
    const data = fs.readFileSync(filePath)
    const mime = guessMime(filePath)
    return new NextResponse(data, {
      headers: {
        'Content-Type': mime,
        'Cache-Control': 'public, max-age=86400',
      },
    })
  } catch {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }
}
