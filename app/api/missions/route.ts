import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET() {
  const { data, error } = await supabaseAdmin.from('missions').select('*').order('created_at')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ missions: data })
}

export async function POST(req: Request) {
  const { title, assignee } = await req.json()
  if (!title?.trim()) return NextResponse.json({ error: 'Empty title' }, { status: 400 })
  const { data, error } = await supabaseAdmin.from('missions').insert({ title: title.trim(), assignee: assignee || 'team', status: 'pending' }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ mission: data })
}

export async function PATCH(req: Request) {
  const { id, status, assignee } = await req.json()
  const updates: Record<string, unknown> = {}
  if (status !== undefined) { updates.status = status; updates.updated_at = new Date().toISOString() }
  if (assignee !== undefined) updates.assignee = assignee
  const { data, error } = await supabaseAdmin.from('missions').update(updates).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ mission: data })
}

export async function DELETE(req: Request) {
  const { id } = await req.json()
  const { error } = await supabaseAdmin.from('missions').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
