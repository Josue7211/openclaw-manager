import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET() {
  const now = new Date()
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString()

  const [todosRes, missionsRes, ideasRes] = await Promise.all([
    supabaseAdmin
      .from('todos')
      .select('*')
      .eq('done', false)
      .lt('updated_at', sevenDaysAgo)
      .or(`snoozed_until.is.null,snoozed_until.lt.${now.toISOString()}`),
    supabaseAdmin
      .from('missions')
      .select('*')
      .eq('status', 'active')
      .lt('updated_at', oneDayAgo),
    supabaseAdmin
      .from('ideas')
      .select('*')
      .eq('status', 'pending')
      .lt('created_at', threeDaysAgo),
  ])

  const items = [
    ...(todosRes.data || []).map((t: Record<string, unknown>) => ({
      ...t,
      type: 'todo' as const,
      title: t.text,
      staleSince: t.updated_at || t.created_at,
    })),
    ...(missionsRes.data || []).map((m: Record<string, unknown>) => ({
      ...m,
      type: 'mission' as const,
      staleSince: m.updated_at || m.created_at,
    })),
    ...(ideasRes.data || []).map((i: Record<string, unknown>) => ({
      ...i,
      type: 'idea' as const,
      staleSince: i.created_at,
    })),
  ]

  // Sort by staleSince ascending (oldest first)
  items.sort((a, b) => new Date(a.staleSince as string).getTime() - new Date(b.staleSince as string).getTime())

  return NextResponse.json({ items })
}

export async function PATCH(req: Request) {
  const { id, type, action } = await req.json()

  if (action === 'snooze') {
    const snoozedUntil = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
    if (type === 'todo') {
      const { error } = await supabaseAdmin.from('todos').update({ snoozed_until: snoozedUntil }).eq('id', id)
      if (error) return NextResponse.json({ error: 'Database error' }, { status: 500 })
    } else if (type === 'mission') {
      const { error } = await supabaseAdmin.from('missions').update({ updated_at: snoozedUntil }).eq('id', id)
      if (error) return NextResponse.json({ error: 'Database error' }, { status: 500 })
    } else if (type === 'idea') {
      const { error } = await supabaseAdmin.from('ideas').update({ created_at: snoozedUntil }).eq('id', id)
      if (error) return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  }

  if (action === 'done') {
    if (type === 'todo') {
      const { error } = await supabaseAdmin.from('todos').update({ done: true }).eq('id', id)
      if (error) return NextResponse.json({ error: 'Database error' }, { status: 500 })
    } else if (type === 'mission') {
      const { error } = await supabaseAdmin.from('missions').update({ status: 'completed', updated_at: new Date().toISOString() }).eq('id', id)
      if (error) return NextResponse.json({ error: 'Database error' }, { status: 500 })
    } else if (type === 'idea') {
      const { error } = await supabaseAdmin.from('ideas').update({ status: 'built' }).eq('id', id)
      if (error) return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

export async function DELETE(req: Request) {
  const { id, type } = await req.json()
  const VALID_TYPES = { todo: 'todos', mission: 'missions', idea: 'ideas' } as const
  const table = VALID_TYPES[type as keyof typeof VALID_TYPES]
  if (!table) return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
  const { error } = await supabaseAdmin.from(table).delete().eq('id', id)
  if (error) return NextResponse.json({ error: 'Database error' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
