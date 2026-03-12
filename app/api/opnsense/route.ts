import { NextResponse } from 'next/server'
import { homelabFetch } from '@/lib/http'

const HOST   = process.env.OPNSENSE_HOST   ?? 'https://10.0.0.1'
const KEY    = process.env.OPNSENSE_KEY    ?? ''
const SECRET = process.env.OPNSENSE_SECRET ?? ''

// Module-level bandwidth cache to compute rates between calls
const bwCache = new Map<string, { bytesIn: number; bytesOut: number; ts: number }>()

function authHeader() {
  return 'Basic ' + Buffer.from(`${KEY}:${SECRET}`).toString('base64')
}

async function opnFetch(path: string) {
  const res = await homelabFetch(`${HOST}${path}`, {
    headers: { Authorization: authHeader(), Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`OPNsense API error: ${res.status}`)
  return res.json()
}

function formatRate(bytesPerSec: number): string {
  if (bytesPerSec >= 1_000_000) return `${(bytesPerSec / 1_000_000).toFixed(1)} MB/s`
  if (bytesPerSec >= 1_000)     return `${(bytesPerSec / 1_000).toFixed(0)} KB/s`
  return `${Math.round(bytesPerSec)} B/s`
}

export async function GET() {
  try {
    const [ifaceData, firmwareData] = await Promise.allSettled([
      opnFetch('/api/diagnostics/interface/getInterfaceStatistics'),
      opnFetch('/api/firmware/status').catch(() => opnFetch('/api/core/firmware/status')),
    ])

    // ── Bandwidth ──
    let wanIn = '—', wanOut = '—'
    if (ifaceData.status === 'fulfilled') {
      const ifaceVal = ifaceData.value as { statistics?: Record<string, Record<string, number>> }
      const stats: Record<string, Record<string, number>> = ifaceVal.statistics ?? {}

      // Find the WAN link-level entry (has MAC address, highest byte counts)
      const wanEntry = Object.entries(stats).find(([key]) =>
        key.toUpperCase().includes('[WAN]') && key.includes('<Link#') === false &&
        /[0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2}/i.test(key)
      ) ?? Object.entries(stats).find(([key]) => key.toUpperCase().includes('[WAN]'))

      if (wanEntry) {
        const [, v] = wanEntry
        const bytesIn  = (v['received-bytes'] ?? 0) as number
        const bytesOut = (v['sent-bytes']     ?? 0) as number
        const now = Date.now()
        const prev = bwCache.get('wan')

        if (prev && now - prev.ts > 500) {
          const dt = (now - prev.ts) / 1000
          wanIn  = formatRate((bytesIn  - prev.bytesIn)  / dt)
          wanOut = formatRate((bytesOut - prev.bytesOut) / dt)
        } else {
          wanIn = wanOut = '...'
        }

        bwCache.set('wan', { bytesIn, bytesOut, ts: now })
      }
    }

    // ── Firmware ──
    let updateAvailable = false
    let version = '—'
    if (firmwareData.status === 'fulfilled') {
      const fw = firmwareData.value as { status?: string; needs_reboot?: string; product_version?: string; version?: string }
      updateAvailable = fw.status === 'update' || fw.status === 'upgrade' || fw.needs_reboot === '1'
      version = fw.product_version ?? fw.version ?? '—'
    }

    return NextResponse.json({ wanIn, wanOut, updateAvailable, version })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch OPNsense data', wanIn: '—', wanOut: '—', updateAvailable: false, version: '—' }, { status: 500 })
  }
}
