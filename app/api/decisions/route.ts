import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')

  let query = supabaseAdmin
    .from('decisions')
    .select('*')
    .order('created_at', { ascending: false })

  if (q) {
    // Sanitize: strip commas and parens to prevent PostgREST filter injection
    const safe = q.replace(/[,()]/g, '')
    query = query.or(`title.ilike.%${safe}%,decision.ilike.%${safe}%,rationale.ilike.%${safe}%`)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: 'Database error' }, { status: 500 })
  return NextResponse.json({ decisions: data })
}

export async function POST(req: Request) {
  const { title, decision, alternatives, rationale, outcome, tags, linked_mission_id } = await req.json()
  if (!title?.trim()) return NextResponse.json({ error: 'title required' }, { status: 400 })
  if (!decision?.trim()) return NextResponse.json({ error: 'decision required' }, { status: 400 })
  if (!rationale?.trim()) return NextResponse.json({ error: 'rationale required' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('decisions')
    .insert({
      title: title.trim(),
      decision: decision.trim(),
      alternatives: alternatives?.trim() || null,
      rationale: rationale.trim(),
      outcome: outcome?.trim() || null,
      tags: tags || [],
      linked_mission_id: linked_mission_id || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: 'Database error' }, { status: 500 })
  return NextResponse.json({ decision: data })
}

export async function PATCH(req: Request) {
  const { id, title, decision, alternatives, rationale, outcome, tags, linked_mission_id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (title !== undefined) updateData.title = title
  if (decision !== undefined) updateData.decision = decision
  if (alternatives !== undefined) updateData.alternatives = alternatives
  if (rationale !== undefined) updateData.rationale = rationale
  if (outcome !== undefined) updateData.outcome = outcome
  if (tags !== undefined) updateData.tags = tags
  if (linked_mission_id !== undefined) updateData.linked_mission_id = linked_mission_id

  const { data, error } = await supabaseAdmin
    .from('decisions')
    .update(updateData)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: 'Database error' }, { status: 500 })
  return NextResponse.json({ decision: data })
}

export async function DELETE(req: Request) {
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { error } = await supabaseAdmin.from('decisions').delete().eq('id', id)
  if (error) return NextResponse.json({ error: 'Database error' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
