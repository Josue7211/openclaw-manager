import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET() {
  const { data, error } = await supabaseAdmin.from('todos').select('*').order('created_at')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ todos: data })
}

export async function POST(req: Request) {
  const { text } = await req.json()
  if (!text?.trim()) return NextResponse.json({ error: 'Empty text' }, { status: 400 })
  const { data, error } = await supabaseAdmin.from('todos').insert({ text: text.trim(), done: false }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ todo: data })
}

export async function PATCH(req: Request) {
  const { id, done, text } = await req.json()
  const updates: Record<string, unknown> = {}
  if (done !== undefined) updates.done = done
  if (text !== undefined) updates.text = text
  const { data, error } = await supabaseAdmin.from('todos').update(updates).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ todo: data })
}

export async function DELETE(req: Request) {
  const { id } = await req.json()
  const { error } = await supabaseAdmin.from('todos').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
