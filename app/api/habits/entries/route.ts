import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

// GET /api/habits/entries?since=YYYY-MM-DD
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const since = searchParams.get('since')
  let query = supabaseAdmin.from('habit_entries').select('*')
  if (since) query = query.gte('date', since)
  const { data, error } = await query.order('date')
  if (error) return NextResponse.json({ error: 'Database error' }, { status: 500 })
  return NextResponse.json({ entries: data })
}

// POST — toggle today's entry for a habit (upsert/delete)
export async function POST(req: Request) {
  const { habit_id, date } = await req.json()
  if (!habit_id || !date) return NextResponse.json({ error: 'habit_id and date required' }, { status: 400 })

  // Check if entry exists
  const { data: existing } = await supabaseAdmin
    .from('habit_entries')
    .select('id')
    .eq('habit_id', habit_id)
    .eq('date', date)
    .maybeSingle()

  if (existing) {
    // Toggle off — delete
    const { error } = await supabaseAdmin.from('habit_entries').delete().eq('id', existing.id)
    if (error) return NextResponse.json({ error: 'Database error' }, { status: 500 })
    return NextResponse.json({ done: false })
  } else {
    // Toggle on — insert
    const { error } = await supabaseAdmin
      .from('habit_entries')
      .insert({ habit_id, date })
    if (error) return NextResponse.json({ error: 'Database error' }, { status: 500 })
    return NextResponse.json({ done: true })
  }
}
