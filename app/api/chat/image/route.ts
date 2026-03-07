import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

// Only serve images from known safe directories
const ALLOWED_DIRS = [
  '/tmp',
  path.join(process.env.HOME || '/home/aparcedodev', '.openclaw/workspace/chat-uploads'),
  path.join(process.env.HOME || '/home/aparcedodev', '.openclaw/workspace'),
]

function isSafePath(filePath: string): boolean {
  const resolved = path.resolve(filePath)
  return ALLOWED_DIRS.some(dir => resolved.startsWith(dir + path.sep) || resolved.startsWith(dir))
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

  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
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
    return NextResponse.json({ error: 'read error' }, { status: 500 })
  }
}
