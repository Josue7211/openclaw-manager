import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

let ntfyCache: { url: string; topic: string; ts: number } | null = null
const NTFY_CACHE_TTL = 60_000 // 60 seconds

async function getNtfyConfig(): Promise<{ url: string; topic: string }> {
  if (ntfyCache && Date.now() - ntfyCache.ts < NTFY_CACHE_TTL) {
    return ntfyCache
  }

  const { data } = await supabaseAdmin
    .from('prefs')
    .select('key, value')
    .in('key', ['ntfy_url', 'ntfy_topic'])

  const map: Record<string, string> = {}
  for (const row of data ?? []) {
    map[row.key] = row.value
  }

  ntfyCache = {
    url: map['ntfy_url'] || process.env.NTFY_URL || 'http://localhost:2586',
    topic: map['ntfy_topic'] || process.env.NTFY_TOPIC || 'mission-control',
    ts: Date.now(),
  }
  return ntfyCache
}

export async function POST(req: NextRequest) {
  const { title, message, priority, tags } = await req.json()

  if (!title || !message) {
    return NextResponse.json({ error: 'title and message required' }, { status: 400 })
  }

  const { url, topic } = await getNtfyConfig()

  // SSRF protection: block cloud metadata and sensitive internal endpoints
  try {
    const parsed = new URL(`${url}/${topic}`)
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return NextResponse.json({ error: 'Invalid ntfy URL protocol' }, { status: 400 })
    }
    const host = parsed.hostname
    // Block cloud metadata endpoints (AWS, GCP, Azure, DigitalOcean, link-local)
    const BLOCKED_HOSTS = [
      '169.254.169.254',           // AWS/GCP/DO metadata
      'metadata.google.internal',  // GCP metadata
      '100.100.100.200',           // Alibaba metadata
      'fd00:ec2::254',             // AWS IPv6 metadata
    ]
    if (
      BLOCKED_HOSTS.includes(host) ||
      host.endsWith('.internal') ||
      host.startsWith('fe80:') ||                      // IPv6 link-local
      host === '[::1]' && parsed.port === '80'         // loopback on port 80 (metadata proxy)
    ) {
      return NextResponse.json({ error: 'Invalid ntfy URL' }, { status: 400 })
    }
  } catch {
    return NextResponse.json({ error: 'Invalid ntfy URL' }, { status: 400 })
  }

  const headers: Record<string, string> = {
    'Title': title,
    'Priority': String(priority ?? 3),
    'Content-Type': 'text/plain',
  }
  if (tags && Array.isArray(tags) && tags.length > 0) {
    headers['Tags'] = tags.join(',')
  }

  const res = await fetch(`${url}/${topic}`, {
    method: 'POST',
    headers,
    body: message,
  })

  if (!res.ok) {
    console.error('[notify] ntfy error:', res.status, await res.text().catch(() => ''))
    return NextResponse.json({ ok: false, error: 'Notification delivery failed' }, { status: 502 })
  }

  return NextResponse.json({ ok: true })
}
