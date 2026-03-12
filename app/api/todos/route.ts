import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET() {
  const { data, error } = await supabaseAdmin.from('todos').select('*').order('created_at')
  if (error) return NextResponse.json({ error: 'Database error' }, { status: 500 })
  return NextResponse.json({ todos: data })
}

export async function POST(req: Request) {
  const { text } = await req.json()
  if (!text?.trim()) return NextResponse.json({ error: 'Empty text' }, { status: 400 })
  const { data, error } = await supabaseAdmin.from('todos').insert({ text: text.trim(), done: false }).select().single()
  if (error) return NextResponse.json({ error: 'Database error' }, { status: 500 })
  return NextResponse.json({ todo: data })
}

export async function PATCH(req: Request) {
  const { id, done, text, due_date, snoozed_until } = await req.json()
  const updates: Record<string, unknown> = {}
  if (done !== undefined) updates.done = done
  if (text !== undefined) updates.text = text
  if (due_date !== undefined) updates.due_date = due_date
  if (snoozed_until !== undefined) updates.snoozed_until = snoozed_until

  const { data, error } = await supabaseAdmin.from('todos').update(updates).eq('id', id).select().single()
  if (error) {
    // If due_date column doesn't exist, retry without it
    if (due_date !== undefined && (error.message?.includes('due_date') || error.code === '42703')) {
      const { due_date: _ignored, ...fallbackUpdates } = updates
      const { data: d2, error: e2 } = await supabaseAdmin.from('todos').update(fallbackUpdates).eq('id', id).select().single()
      if (e2) return NextResponse.json({ error: 'Database error' }, { status: 500 })
      return NextResponse.json({ todo: d2 })
    }
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }
  return NextResponse.json({ todo: data })
}

export async function DELETE(req: Request) {
  const { id } = await req.json()
  const { error } = await supabaseAdmin.from('todos').delete().eq('id', id)
  if (error) return NextResponse.json({ error: 'Database error' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
