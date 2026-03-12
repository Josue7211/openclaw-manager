import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      mission_id: string
      event_type: 'bash' | 'result' | 'think'
      content: string
      elapsed_seconds?: number
    }
    const { mission_id, event_type, content, elapsed_seconds } = body

    if (!mission_id) return NextResponse.json({ error: 'mission_id required' }, { status: 400 })
    if (!event_type) return NextResponse.json({ error: 'event_type required' }, { status: 400 })
    if (!content) return NextResponse.json({ error: 'content required' }, { status: 400 })

    // Get current max seq for this mission
    const { data: maxRow } = await supabaseAdmin
      .from('mission_events')
      .select('seq')
      .eq('mission_id', mission_id)
      .order('seq', { ascending: false })
      .limit(1)
      .single()

    const nextSeq = ((maxRow?.seq as number | null) ?? 0) + 1

    const { data, error } = await supabaseAdmin
      .from('mission_events')
      .insert({
        mission_id,
        event_type,
        content,
        elapsed_seconds: elapsed_seconds ?? null,
        seq: nextSeq,
      })
      .select()
      .single()

    if (error) { console.error('[mission-events/bjorn]', error.message); return NextResponse.json({ error: 'Database error' }, { status: 500 }) }

    return NextResponse.json({ ok: true, event: data })
  } catch (err) {
    console.error('[mission-events/bjorn]', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
