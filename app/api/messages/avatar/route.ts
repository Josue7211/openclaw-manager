import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const BRIDGE_HOST = process.env.MAC_BRIDGE_HOST || ''
const BRIDGE_API_KEY = process.env.MAC_BRIDGE_API_KEY || ''
const BB_HOST = process.env.BLUEBUBBLES_HOST || ''
const BB_PASSWORD = process.env.BLUEBUBBLES_PASSWORD || ''

function normalizePhone(addr: string): string {
  const digits = addr.replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1)
  return digits
}

// Cache BlueBubbles contact avatars in memory (10 min TTL)
let bbAvatarCache: Map<string, Buffer> | null = null
let bbCacheTime = 0
const CACHE_TTL = 10 * 60 * 1000

async function getBBContactAvatars(): Promise<Map<string, Buffer>> {
  if (bbAvatarCache && Date.now() - bbCacheTime < CACHE_TTL) return bbAvatarCache
  if (!BB_HOST) return new Map()

  try {
    const sep = '/contact/query'.includes('?') ? '&' : '?'
    const url = `${BB_HOST}/api/v1/contact/query${sep}password=${encodeURIComponent(BB_PASSWORD)}`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 500, extraProperties: ['avatar'] }),
    })
    if (!res.ok) return new Map()
    const json = await res.json()
    if (json.status !== 200) return new Map()

    const map = new Map<string, Buffer>()
    for (const c of json.data ?? []) {
      if (!c.avatar) continue
      const buf = Buffer.from(c.avatar, 'base64')
      for (const ph of c.phoneNumbers ?? []) {
        if (ph.address) {
          const n = normalizePhone(ph.address)
          if (n.length >= 7) map.set(n, buf)
        }
      }
      for (const em of c.emails ?? []) {
        if (em.address?.includes('@')) map.set(em.address.toLowerCase(), buf)
      }
    }

    bbAvatarCache = map
    bbCacheTime = Date.now()
    return map
  } catch {
    return new Map()
  }
}

// GET /api/messages/avatar?address=+17861234567
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const address = searchParams.get('address')

  if (!address) return new NextResponse(null, { status: 404 })

  const normalized = normalizePhone(address)
  const lowered = address.toLowerCase()

  // 1) Try MAC_BRIDGE
  if (BRIDGE_HOST) {
    try {
      const headers: Record<string, string> = {}
      if (BRIDGE_API_KEY) headers['X-API-Key'] = BRIDGE_API_KEY
      const res = await fetch(
        `${BRIDGE_HOST}/contacts/photo?address=${encodeURIComponent(address)}`,
        { headers, next: { revalidate: 3600 } }
      )
      if (res.ok) {
        const imageData = await res.arrayBuffer()
        if (imageData.byteLength > 0) {
          return new NextResponse(imageData, {
            headers: {
              'Content-Type': res.headers.get('content-type') || 'image/tiff',
              'Cache-Control': 'public, max-age=3600',
            },
          })
        }
      }
    } catch { /* fall through */ }
  }

  // 2) Try BlueBubbles contact avatars
  const avatars = await getBBContactAvatars()
  const avatar = avatars.get(normalized) || avatars.get(lowered)
  if (avatar) {
    return new NextResponse(new Uint8Array(avatar), {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=3600',
      },
    })
  }

  return new NextResponse(null, { status: 404 })
}
