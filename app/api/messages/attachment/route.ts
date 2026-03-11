import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const BB_HOST = process.env.BLUEBUBBLES_HOST || ''
const BB_PASSWORD = process.env.BLUEBUBBLES_PASSWORD || ''

// GET /api/messages/attachment?guid=XXXX — proxy attachment from BlueBubbles
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const guid = searchParams.get('guid')

  if (!guid || !BB_HOST) {
    return new NextResponse(null, { status: 404 })
  }

  // Validate guid format to prevent path traversal
  if (!/^[a-zA-Z0-9\-]+$/.test(guid)) {
    return new NextResponse(null, { status: 400 })
  }

  try {
    const url = `${BB_HOST}/api/v1/attachment/${encodeURIComponent(guid)}/download?password=${encodeURIComponent(BB_PASSWORD)}`
    const res = await fetch(url)

    if (!res.ok) {
      return new NextResponse(null, { status: 404 })
    }

    const data = await res.arrayBuffer()
    const contentType = res.headers.get('content-type') || 'application/octet-stream'

    return new NextResponse(data, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400',
      },
    })
  } catch {
    return new NextResponse(null, { status: 502 })
  }
}
