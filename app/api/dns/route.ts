import { NextResponse } from 'next/server'
import { homelabFetch } from '@/lib/http'

const OPNSENSE_URL = process.env.OPNSENSE_HOST ?? 'https://10.0.0.1'
const OPNSENSE_API_KEY = process.env.OPNSENSE_KEY ?? ''
const OPNSENSE_API_SECRET = process.env.OPNSENSE_SECRET ?? ''

const MOCK_DATA = {
  blocked_today: 1247,
  total_queries: 8432,
  block_rate: '14.8%',
  top_blocked: ['ads.google.com', 'tracking.fb.net', 'analytics.twitter.com'],
  top_clients: ['10.0.0.100', '10.0.0.101'],
}

function authHeader() {
  return 'Basic ' + Buffer.from(`${OPNSENSE_API_KEY}:${OPNSENSE_API_SECRET}`).toString('base64')
}

export async function GET() {
  // Return mock data if env vars not set
  if (!OPNSENSE_API_KEY || !OPNSENSE_API_SECRET) {
    return NextResponse.json({ ...MOCK_DATA, mock: true })
  }

  try {
    // Try AdGuard Home stats endpoint via OPNsense proxy or direct
    const [statsRes, topRes] = await Promise.allSettled([
      homelabFetch(`${OPNSENSE_URL}/control/stats`, {
        headers: { Authorization: authHeader() },
      }),
      homelabFetch(`${OPNSENSE_URL}/control/stats_top`, {
        headers: { Authorization: authHeader() },
      }),
    ])

    if (statsRes.status === 'fulfilled' && statsRes.value.ok) {
      const stats = await statsRes.value.json() as { num_dns_queries?: number; num_blocked_filtering?: number }
      let top_blocked: string[] = []
      let top_clients: string[] = []

      if (topRes.status === 'fulfilled' && topRes.value.ok) {
        const top = await topRes.value.json() as Record<string, Record<string, unknown>>
        top_blocked = Object.keys(top.top_blocked_domains ?? {}).slice(0, 5)
        top_clients = Object.keys(top.top_clients ?? {}).slice(0, 5)
      }

      const total_queries: number = stats.num_dns_queries ?? 0
      const blocked_today: number = stats.num_blocked_filtering ?? 0
      const block_rate =
        total_queries > 0
          ? `${((blocked_today / total_queries) * 100).toFixed(1)}%`
          : '0%'

      return NextResponse.json({ blocked_today, total_queries, block_rate, top_blocked, top_clients, mock: false })
    }

    // Fallback to mock if AdGuard not reachable
    return NextResponse.json({ ...MOCK_DATA, mock: true })
  } catch {
    return NextResponse.json({ ...MOCK_DATA, mock: true })
  }
}
