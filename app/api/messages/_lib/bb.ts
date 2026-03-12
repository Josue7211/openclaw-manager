// Shared BlueBubbles + Mac Bridge configuration and helpers for all /api/messages/* routes

export const BB_HOST = process.env.BLUEBUBBLES_HOST || ''
export const BB_PASSWORD = process.env.BLUEBUBBLES_PASSWORD || ''
export const BRIDGE_HOST = process.env.MAC_BRIDGE_HOST || ''
export const BRIDGE_API_KEY = process.env.MAC_BRIDGE_API_KEY || ''

// GUID validation patterns
export const CHAT_GUID_RE = /^[a-zA-Z0-9_;+\-@.]+$/
export const MESSAGE_GUID_RE = /^[a-zA-Z0-9_;+\-@./: ]+$/
export const ATTACHMENT_GUID_RE = /^[a-zA-Z0-9_\-]+$/

// Valid reaction names (BB tapback API)
export const VALID_REACTIONS = [
  'love', 'like', 'dislike', 'laugh', 'emphasize', 'question',
  '-love', '-like', '-dislike', '-laugh', '-emphasize', '-question',
] as const

export function normalizePhone(addr: string): string {
  const digits = addr.replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1)
  return digits
}

export async function bbFetch(path: string, opts?: RequestInit & { body?: string }) {
  if (!BB_HOST) throw new Error('bluebubbles_not_configured')
  const sep = path.includes('?') ? '&' : '?'
  const url = `${BB_HOST}/api/v1${path}${sep}password=${encodeURIComponent(BB_PASSWORD)}`
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const res = await fetch(url, { ...opts, headers })
  if (!res.ok) {
    console.error(`BlueBubbles ${res.status}: ${await res.text().catch(() => '')}`)
    throw new Error('Backend service error')
  }
  const json = await res.json()
  if (json.status !== 200) {
    console.error('BlueBubbles API error:', json.error?.message || json.message)
    throw new Error('Backend service error')
  }
  return json.data
}

export function bridgeHeaders(): Record<string, string> {
  const h: Record<string, string> = {}
  if (BRIDGE_API_KEY) h['X-API-Key'] = BRIDGE_API_KEY
  return h
}

export const MEDIA_HEADERS = {
  'Content-Disposition': 'inline',
  'X-Content-Type-Options': 'nosniff',
  'Cache-Control': 'public, max-age=86400',
}

// Contact map with TTL cache (shared across requests)
let contactMapCache: Map<string, string> | null = null
let contactMapTime = 0
const CONTACT_CACHE_TTL = 5 * 60 * 1000

export async function getContactMap(): Promise<Map<string, string>> {
  if (contactMapCache && Date.now() - contactMapTime < CONTACT_CACHE_TTL) return contactMapCache
  const map = new Map<string, string>()
  try {
    const contacts = await bbFetch('/contact/query', {
      method: 'POST',
      body: JSON.stringify({ limit: 500 }),
    })
    for (const c of contacts ?? []) {
      const name = c.displayName || [c.firstName, c.lastName].filter(Boolean).join(' ')
      if (!name) continue
      for (const ph of c.phoneNumbers ?? []) {
        if (!ph.address) continue
        const normalized = normalizePhone(ph.address)
        if (normalized.length < 7) continue
        map.set(normalized, name)
      }
      for (const em of c.emails ?? []) {
        if (em.address && em.address.includes('@')) map.set(em.address.toLowerCase(), name)
      }
    }
  } catch {
    // Contact lookup is best-effort
  }
  contactMapCache = map
  contactMapTime = Date.now()
  return map
}
