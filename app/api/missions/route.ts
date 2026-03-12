import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { findAgentLogFile } from '@/lib/logParser'
import { sendNotify, logActivity, MISSION_STATUS, ingestLog } from '@/lib/pipeline'

export async function GET() {
  const { data, error } = await supabaseAdmin.from('missions').select('*').order('created_at')
  if (error) return NextResponse.json({ error: 'Database error' }, { status: 500 })
  return NextResponse.json({ missions: data })
}

export async function POST(req: Request) {
  const { title, assignee } = await req.json()
  if (!title?.trim()) return NextResponse.json({ error: 'Empty title' }, { status: 400 })
  const { data, error } = await supabaseAdmin.from('missions').insert({ title: title.trim(), assignee: assignee || 'team', status: 'pending' }).select().single()
  if (error) return NextResponse.json({ error: 'Database error' }, { status: 500 })
  return NextResponse.json({ mission: data })
}

export async function PATCH(req: Request) {
  const { id, status, assignee, progress, log_path } = await req.json()
  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: 'Valid mission id required' }, { status: 400 })
  }
  const VALID_STATUSES = Object.values(MISSION_STATUS)
  if (status !== undefined && !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` }, { status: 400 })
  }
  const clampedProgress = progress !== undefined ? Math.max(0, Math.min(100, Number(progress))) : undefined
  const updates: Record<string, unknown> = {}
  if (status !== undefined) { updates.status = status; updates.updated_at = new Date().toISOString() }
  if (assignee !== undefined) updates.assignee = assignee
  if (clampedProgress !== undefined) updates.progress = clampedProgress
  if (log_path !== undefined) updates.log_path = log_path
  const { data, error } = await supabaseAdmin.from('missions').update(updates).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: 'Database error' }, { status: 500 })

  // Send push notification for terminal status changes
  if (data && (status === MISSION_STATUS.DONE || status === MISSION_STATUS.FAILED)) {
    const emoji = status === MISSION_STATUS.DONE ? 'white_check_mark' : 'x'
    const priority = status === MISSION_STATUS.DONE ? 3 : 4
    sendNotify(
      `Mission ${status === MISSION_STATUS.DONE ? 'Complete' : 'Failed'}`,
      data.title,
      priority,
      [emoji],
    ).catch(() => {})
  }

  // Log activity for status changes
  if (status !== undefined && data) {
    const parts: string[] = [`Mission "${data.title}" status changed to ${status}`]
    if (clampedProgress !== undefined) parts.push(`progress: ${clampedProgress}%`)
    logActivity({
      mission_id: id,
      agent_id: data.assignee || null,
      event_type: 'mission_status_change',
      description: parts.join(', '),
      metadata: { status, progress: clampedProgress },
    })
  }

  // When marking done, auto-ingest agent log
  if (status === MISSION_STATUS.DONE && id && data) {
    // Calculate mission duration for elapsed_seconds distribution
    const created = new Date(data.created_at).getTime()
    const updated = data.updated_at ? new Date(data.updated_at).getTime() : Date.now()
    const durationSec = Math.round((updated - created) / 1000)

    // Determine log path: explicit, or find by assignee pattern
    let finalLogPath = log_path
    if (!finalLogPath && data.assignee) {
      finalLogPath = findAgentLogFile(data.assignee)
    }

    if (finalLogPath) {
      ingestLog(id, finalLogPath, durationSec).catch(() => {})
    }
  }

  return NextResponse.json({ mission: data })
}

export async function DELETE(req: Request) {
  const { id } = await req.json()
  const { error } = await supabaseAdmin.from('missions').delete().eq('id', id)
  if (error) return NextResponse.json({ error: 'Database error' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
