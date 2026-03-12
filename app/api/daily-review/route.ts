import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date') || new Date().toISOString().slice(0, 10)

  const { data, error } = await supabaseAdmin
    .from('daily_reviews')
    .select('*')
    .eq('date', date)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) return NextResponse.json({ error: 'Database error' }, { status: 500 })
  return NextResponse.json({ review: data })
}

export async function POST(req: Request) {
  const { date, accomplishments, priorities, notes } = await req.json()
  if (!date) return NextResponse.json({ error: 'Missing date' }, { status: 400 })

  // Upsert by date (one review per day)
  const { data, error } = await supabaseAdmin
    .from('daily_reviews')
    .upsert(
      { date, accomplishments: accomplishments || '', priorities: priorities || '', notes: notes || '' },
      { onConflict: 'date' }
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: 'Database error' }, { status: 500 })
  return NextResponse.json({ review: data })
}
