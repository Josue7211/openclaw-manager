import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const weekStart = searchParams.get('week_start')

  try {
    let query = supabaseAdmin
      .from('weekly_reviews')
      .select('*')
      .order('week_start', { ascending: false })

    if (weekStart) {
      query = query.eq('week_start', weekStart)
    } else {
      query = query.limit(10)
    }

    const { data, error } = await query
    if (error) return NextResponse.json({ reviews: [] })
    return NextResponse.json({ reviews: data || [] })
  } catch {
    return NextResponse.json({ reviews: [] })
  }
}

export async function POST(req: Request) {
  const body = await req.json()
  const { week_start, wins, incomplete_count, priorities, reflection } = body

  if (!week_start) return NextResponse.json({ error: 'week_start required' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('weekly_reviews')
    .upsert(
      { week_start, wins, incomplete_count, priorities, reflection },
      { onConflict: 'week_start' }
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: 'Database error' }, { status: 500 })
  return NextResponse.json({ review: data })
}
