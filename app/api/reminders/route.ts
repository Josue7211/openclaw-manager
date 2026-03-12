import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const BRIDGE_HOST = process.env.MAC_BRIDGE_HOST || ''
const BRIDGE_API_KEY = process.env.MAC_BRIDGE_API_KEY || ''

interface BridgeReminder {
  id: string
  title: string
  completed?: boolean
  isCompleted?: boolean
  dueDate?: string | null
  priority?: number
  notes?: string | null
  list?: string
}

async function bridgeFetch(path: string, opts?: RequestInit) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (BRIDGE_API_KEY) headers['X-API-Key'] = BRIDGE_API_KEY

  const res = await fetch(`${BRIDGE_HOST}${path}`, { ...opts, headers })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Bridge ${res.status}: ${body}`)
  }
  return res.json()
}

function normalizeReminder(r: BridgeReminder) {
  return {
    id: r.id,
    title: r.title,
    completed: r.completed ?? r.isCompleted ?? false,
    dueDate: r.dueDate || null,
    priority: r.priority ?? 0,
    notes: r.notes || null,
    list: r.list || 'Reminders',
  }
}

export async function GET(req: Request) {
  if (!BRIDGE_HOST) {
    return NextResponse.json({
      error: 'bridge_not_configured',
      message: 'Set MAC_BRIDGE_HOST in .env.local (e.g. http://macbook.tailnet.ts.net:4100)',
      reminders: [],
    })
  }

  try {
    const { searchParams } = new URL(req.url)
    const VALID_FILTERS = ['all', 'incomplete', 'completed', 'today']
    const rawFilter = searchParams.get('filter') || 'all'
    const filter = VALID_FILTERS.includes(rawFilter) ? rawFilter : 'all'
    const data = await bridgeFetch(`/reminders?filter=${encodeURIComponent(filter)}`)

    const reminders = Array.isArray(data)
      ? data.map(normalizeReminder)
      : (data.reminders ?? []).map(normalizeReminder)

    return NextResponse.json({ reminders, source: 'bridge' })
  } catch (err) {
    console.error('[reminders] Error:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Failed to fetch reminders', reminders: [] }, { status: 502 })
  }
}

export async function PATCH(req: Request) {
  if (!BRIDGE_HOST) {
    return NextResponse.json({ error: 'bridge_not_configured' }, { status: 503 })
  }

  try {
    const { id, completed } = await req.json()
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    if (completed) {
      await bridgeFetch('/reminders/complete', {
        method: 'POST',
        body: JSON.stringify({ ids: [id] }),
      })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[reminders] PATCH error:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Failed to update reminder' }, { status: 502 })
  }
}
