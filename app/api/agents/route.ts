import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('agents')
    .select('*')
    .order('sort_order', { ascending: true })

  if (error) return NextResponse.json({ error: 'Database error' }, { status: 500 })
  return NextResponse.json({ agents: data })
}

export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const { id, ...fields } = body

  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const allowed = ['display_name', 'emoji', 'role', 'status', 'current_task', 'color', 'model', 'sort_order']
  // allowed status values: 'active' | 'idle' | 'awaiting_deploy'
  const update: Record<string, string | number> = { updated_at: new Date().toISOString() }
  for (const key of allowed) {
    if (key in fields) update[key] = fields[key]
  }

  const { data, error } = await supabaseAdmin
    .from('agents')
    .update(update)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: 'Database error' }, { status: 500 })
  return NextResponse.json({ agent: data })
}
