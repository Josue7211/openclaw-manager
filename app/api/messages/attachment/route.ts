import { NextResponse } from 'next/server'
import { BB_HOST, BB_PASSWORD, BRIDGE_HOST, bridgeHeaders, ATTACHMENT_GUID_RE, MEDIA_HEADERS } from '../_lib/bb'

export const dynamic = 'force-dynamic'

// Fetch HEIC/HEICS from Mac Bridge (already converted to PNG with alpha by sips)
async function tryFetchFromBridge(guid: string, originalName: string): Promise<Response | null> {
  if (!BRIDGE_HOST) return null

  try {
    const params = new URLSearchParams({ guid })
    if (originalName) params.set('name', originalName)
    const rawRes = await fetch(`${BRIDGE_HOST}/messages/attachment-raw?${params}`, { headers: bridgeHeaders() })
    if (!rawRes.ok) return null

    const contentType = rawRes.headers.get('content-type') || 'image/png'
    const data = await rawRes.arrayBuffer()
    return new NextResponse(data, {
      headers: { 'Content-Type': contentType, ...MEDIA_HEADERS },
    })
  } catch {
    return null
  }
}

// GET /api/messages/attachment?guid=XXXX&uti=public.heics — proxy attachment from BlueBubbles
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const guid = searchParams.get('guid')
  const utiHint = searchParams.get('uti')

  if (!guid || !BB_HOST) {
    return new NextResponse(null, { status: 404 })
  }

  // Validate guid format to prevent path traversal
  if (!ATTACHMENT_GUID_RE.test(guid)) {
    return new NextResponse(null, { status: 400 })
  }

  try {
    // If frontend passes UTI hint, skip metadata fetch for non-HEIC
    let uti = utiHint || ''
    let transferName = ''

    if (!uti) {
      // Check attachment metadata — use UTI (not mimeType) since BB converts HEIC and reports image/jpeg
      const metaUrl = `${BB_HOST}/api/v1/attachment/${encodeURIComponent(guid)}?password=${encodeURIComponent(BB_PASSWORD)}`
      const metaRes = await fetch(metaUrl)
      if (metaRes.ok) {
        const meta = await metaRes.json()
        uti = meta.data?.uti || ''
        transferName = meta.data?.transferName || ''
      }
    }

    // HEIC/HEICS: fetch original from Mac Bridge and convert (BB strips animation)
    if (uti === 'public.heics' || uti === 'public.heic') {
      const originalName = transferName ? transferName.replace(/\.jpeg$/i, '') : ''
      const converted = await tryFetchFromBridge(guid, originalName)
      if (converted) return converted
    }

    // Default: use BB download endpoint (works for JPEG, PNG, GIF, video, audio, etc.)
    const url = `${BB_HOST}/api/v1/attachment/${encodeURIComponent(guid)}/download?password=${encodeURIComponent(BB_PASSWORD)}`
    const res = await fetch(url)

    if (!res.ok) {
      return new NextResponse(null, { status: 404 })
    }

    const data = await res.arrayBuffer()
    const rawType = res.headers.get('content-type') || 'application/octet-stream'
    const safeType = /^(image|video|audio)\//.test(rawType) ? rawType : 'application/octet-stream'

    return new NextResponse(data, {
      headers: { 'Content-Type': safeType, ...MEDIA_HEADERS },
    })
  } catch {
    return new NextResponse(null, { status: 502 })
  }
}
