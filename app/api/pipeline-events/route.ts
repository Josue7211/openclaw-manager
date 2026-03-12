import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('pipeline_events')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) return NextResponse.json({ error: 'Database error' }, { status: 500 })
  return NextResponse.json({ events: data })
}

export async function POST(req: Request) {
  const { event_type, agent_id, mission_id, idea_id, description, metadata } = await req.json()
  if (!event_type || !description) return NextResponse.json({ error: 'event_type and description required' }, { status: 400 })
  const { data, error } = await supabaseAdmin
    .from('pipeline_events')
    .insert({ event_type, agent_id, mission_id, idea_id, description, metadata })
    .select()
    .single()
  if (error) return NextResponse.json({ error: 'Database error' }, { status: 500 })
  return NextResponse.json({ event: data })
}
