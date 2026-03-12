import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { parseClaudeLog } from '@/lib/logParser'

export async function GET(req: NextRequest) {
  const mission_id = req.nextUrl.searchParams.get('mission_id')
  const log_path = req.nextUrl.searchParams.get('log_path')
  const action = req.nextUrl.searchParams.get('action')

  // Manual ingest endpoint: GET /api/mission-events?action=ingest&mission_id=X&log_path=/tmp/foo.log
  if (action === 'ingest' && mission_id && log_path) {
    // Validate log_path: must be under /tmp/ with safe characters (no traversal)
    if (!/^\/tmp\/[a-zA-Z0-9._-]+\.log$/.test(log_path)) {
      return NextResponse.json({ error: 'log_path must be a .log file under /tmp/' }, { status: 400 })
    }
    try {
      const fs = await import('fs')
      // Resolve symlinks to prevent reading arbitrary files
      let resolvedPath: string
      try {
        resolvedPath = fs.realpathSync(log_path)
      } catch {
        return NextResponse.json({ error: 'Log file not found' }, { status: 404 })
      }
      if (!resolvedPath.startsWith('/tmp/')) {
        return NextResponse.json({ error: 'log_path must resolve within /tmp/' }, { status: 400 })
      }

      const logContent = fs.readFileSync(resolvedPath, 'utf-8')
      if (!logContent.trim()) {
        return NextResponse.json({ error: 'Log file is empty' }, { status: 400 })
      }

      // Get mission duration if available
      const { data: mission } = await supabaseAdmin
        .from('missions')
        .select('created_at, updated_at')
        .eq('id', mission_id)
        .single()

      let durationSec: number | undefined
      if (mission) {
        const created = new Date(mission.created_at).getTime()
        const updated = mission.updated_at ? new Date(mission.updated_at).getTime() : Date.now()
        durationSec = Math.round((updated - created) / 1000)
      }

      const parsed = parseClaudeLog(logContent, durationSec)
      if (parsed.length === 0) {
        return NextResponse.json({ error: 'No events parsed from log', path: log_path }, { status: 400 })
      }

      const rows = parsed.map(e => ({
        mission_id,
        event_type: e.event_type,
        content: e.content,
        file_path: e.file_path || null,
        seq: e.seq,
        elapsed_seconds: e.elapsed_seconds ?? null,
        tool_input: e.tool_input || null,
        model_name: e.model_name || null,
      }))

      // Delete existing events (idempotent)
      await supabaseAdmin.from('mission_events').delete().eq('mission_id', mission_id)
      const { error } = await supabaseAdmin.from('mission_events').insert(rows)

      if (error) {
        return NextResponse.json({ error: 'Database error' }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        events_inserted: rows.length,
        model_name: parsed[0]?.model_name,
      })
    } catch (err) {
      console.error('[mission-events] Ingest error:', err instanceof Error ? err.message : err)
      return NextResponse.json({ error: 'Failed to ingest log' }, { status: 500 })
    }
  }

  // Standard fetch: GET /api/mission-events?mission_id=X
  if (!mission_id) return NextResponse.json({ error: 'mission_id required' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('mission_events')
    .select('*')
    .eq('mission_id', mission_id)
    .order('seq', { ascending: true })

  if (error) return NextResponse.json({ error: 'Database error' }, { status: 500 })
  return NextResponse.json({ events: data || [] })
}

export async function POST(req: NextRequest) {
  const { mission_id, log_content, mission_duration_seconds } = await req.json()
  if (!mission_id) return NextResponse.json({ error: 'mission_id required' }, { status: 400 })
  if (!log_content) return NextResponse.json({ events_inserted: 0 })

  const parsed = parseClaudeLog(log_content, mission_duration_seconds ?? undefined)
  if (parsed.length === 0) return NextResponse.json({ events_inserted: 0 })

  const rows = parsed.map(e => ({
    mission_id,
    event_type: e.event_type,
    content: e.content,
    file_path: e.file_path || null,
    seq: e.seq,
    elapsed_seconds: e.elapsed_seconds ?? null,
  }))

  // Delete existing events for this mission first (idempotent re-ingest)
  await supabaseAdmin.from('mission_events').delete().eq('mission_id', mission_id)

  const { error } = await supabaseAdmin.from('mission_events').insert(rows)
  if (error) return NextResponse.json({ error: 'Database error' }, { status: 500 })

  return NextResponse.json({ events_inserted: rows.length })
}
