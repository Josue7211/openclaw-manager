import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('retrospectives')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: 'Database error' }, { status: 500 })
  return NextResponse.json({ retrospectives: data })
}

export async function POST(req: Request) {
  const body = await req.json()
  const { mission_id, what_went_well, what_went_wrong, improvements, tags } = body
  if (!mission_id) return NextResponse.json({ error: 'mission_id required' }, { status: 400 })
  const { data, error } = await supabaseAdmin
    .from('retrospectives')
    .insert({
      mission_id,
      what_went_well: what_went_well || null,
      what_went_wrong: what_went_wrong || null,
      improvements: improvements || null,
      tags: tags || [],
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: 'Database error' }, { status: 500 })
  return NextResponse.json({ retrospective: data })
}
