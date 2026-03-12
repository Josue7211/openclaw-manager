import { NextResponse } from 'next/server'
import sharp from 'sharp'
import { BB_HOST, BB_PASSWORD, BRIDGE_HOST, bridgeHeaders, normalizePhone } from '../_lib/bb'

export const dynamic = 'force-dynamic'

// Cache BlueBubbles contact avatars in memory (10 min TTL)
let bbAvatarCache: Map<string, Buffer> | null = null
let bbCacheTime = 0
const CACHE_TTL = 10 * 60 * 1000
const MAX_AVATAR_BYTES = 512 * 1024
const MAX_CACHE_BYTES = 100 * 1024 * 1024

async function getBBContactAvatars(): Promise<Map<string, Buffer>> {
  if (bbAvatarCache && Date.now() - bbCacheTime < CACHE_TTL) return bbAvatarCache
  if (!BB_HOST) return new Map()

  try {
    const url = `${BB_HOST}/api/v1/contact/query?password=${encodeURIComponent(BB_PASSWORD)}`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 500, extraProperties: ['avatar'] }),
    })
    if (!res.ok) return new Map()
    const json = await res.json()
    if (json.status !== 200) return new Map()

    const map = new Map<string, Buffer>()
    let totalBytes = 0
    for (const c of json.data ?? []) {
      if (!c.avatar) continue
      const buf = Buffer.from(c.avatar, 'base64')
      if (buf.byteLength > MAX_AVATAR_BYTES) continue
      if (totalBytes + buf.byteLength > MAX_CACHE_BYTES) break
      for (const ph of c.phoneNumbers ?? []) {
        if (ph.address) {
          const n = normalizePhone(ph.address)
          if (n.length >= 7) map.set(n, buf)
        }
      }
      for (const em of c.emails ?? []) {
        if (em.address?.includes('@')) map.set(em.address.toLowerCase(), buf)
      }
      totalBytes += buf.byteLength
    }

    bbAvatarCache = map
    bbCacheTime = Date.now()
    return map
  } catch {
    return new Map()
  }
}

// Convert any image to JPEG for browser compatibility (handles TIFF from Mac Bridge)
async function toJpeg(data: ArrayBuffer): Promise<Buffer> {
  return sharp(Buffer.from(data)).jpeg({ quality: 80 }).toBuffer()
}

// GET /api/messages/avatar?address=+17861234567
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const address = searchParams.get('address')

  if (!address) return new NextResponse(null, { status: 404 })

  const normalized = normalizePhone(address)
  const lowered = address.toLowerCase()

  // 1) Try BlueBubbles contact avatars first (already browser-friendly JPEG/PNG)
  const avatars = await getBBContactAvatars()
  const avatar = avatars.get(normalized) || avatars.get(lowered)
  if (avatar) {
    return new NextResponse(new Uint8Array(avatar), {
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=3600',
      },
    })
  }

  // 2) Try MAC_BRIDGE (may return TIFF — convert to JPEG)
  if (BRIDGE_HOST) {
    try {
      const res = await fetch(
        `${BRIDGE_HOST}/contacts/photo?address=${encodeURIComponent(address)}`,
        { headers: bridgeHeaders(), next: { revalidate: 3600 } }
      )
      if (res.ok) {
        const imageData = await res.arrayBuffer()
        if (imageData.byteLength > 0) {
          const jpeg = await toJpeg(imageData)
          return new NextResponse(new Uint8Array(jpeg), {
            headers: {
              'Content-Type': 'image/jpeg',
              'Cache-Control': 'public, max-age=3600',
            },
          })
        }
      }
    } catch { /* fall through */ }
  }

  return new NextResponse(null, { status: 404 })
}
