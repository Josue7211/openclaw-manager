import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('email_accounts')
    .select('id, label, host, port, username, tls, is_default, created_at')
    .order('created_at')
  if (error) return NextResponse.json({ error: 'Database error' }, { status: 500 })
  return NextResponse.json({ accounts: data ?? [] })
}

export async function POST(req: Request) {
  const body = await req.json()
  const { label, host, port, username, password, tls, is_default } = body
  if (!label || !host || !username || !password) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  if (is_default) {
    await supabaseAdmin.from('email_accounts').update({ is_default: false }).neq('id', '00000000-0000-0000-0000-000000000000')
  }

  const { data, error } = await supabaseAdmin
    .from('email_accounts')
    .insert({ label, host, port: port ?? 993, username, password, tls: tls ?? true, is_default: is_default ?? false })
    .select('id, label, host, port, username, tls, is_default, created_at')
    .single()
  if (error) return NextResponse.json({ error: 'Database error' }, { status: 500 })
  return NextResponse.json({ account: data })
}

export async function PATCH(req: Request) {
  const body = await req.json()
  const { id, label, host, port, username, password, tls, is_default } = body
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  if (is_default) {
    await supabaseAdmin.from('email_accounts').update({ is_default: false }).neq('id', id)
  }

  const updates: Record<string, unknown> = {}
  if (label !== undefined) updates.label = label
  if (host !== undefined) updates.host = host
  if (port !== undefined) updates.port = port
  if (username !== undefined) updates.username = username
  if (password !== undefined) updates.password = password
  if (tls !== undefined) updates.tls = tls
  if (is_default !== undefined) updates.is_default = is_default

  const { data, error } = await supabaseAdmin
    .from('email_accounts')
    .update(updates)
    .eq('id', id)
    .select('id, label, host, port, username, tls, is_default, created_at')
    .single()
  if (error) return NextResponse.json({ error: 'Database error' }, { status: 500 })
  return NextResponse.json({ account: data })
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  const { error } = await supabaseAdmin.from('email_accounts').delete().eq('id', id)
  if (error) return NextResponse.json({ error: 'Database error' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
