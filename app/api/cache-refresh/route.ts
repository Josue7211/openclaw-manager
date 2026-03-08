import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

const CACHE_KEYS = ['status', 'heartbeat', 'sessions', 'subagents', 'agents']

export async function POST(req: Request) {
  const base = new URL(req.url).origin

  const results = await Promise.allSettled(
    CACHE_KEYS.map(async (key) => {
      try {
        const res = await fetch(`${base}/api/${key}`, { cache: 'no-store' })
        if (!res.ok) return
        const value = await res.json()
        await supabaseAdmin.from('cache').upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
      } catch {
        // silent — cache stays stale
      }
    })
  )

  const ok = results.filter(r => r.status === 'fulfilled').length
  return NextResponse.json({ ok, total: CACHE_KEYS.length })
}

export async function GET() {
  const { data, error } = await supabaseAdmin.from('cache').select('*')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const result: Record<string, unknown> = {}
  for (const row of data ?? []) result[row.key] = row.value
  return NextResponse.json(result)
}
