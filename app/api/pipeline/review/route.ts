import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import {
  ROUTING_TABLE, MISSION_STATUS, REVIEW_STATUS,
  sendNotify, setAgentActive, setAgentIdle, logActivity,
  spawnAgentProcess, cleanRegistryByMissionId, extractWorkdir, notifyBjorn, appendLog,
} from '@/lib/pipeline'

export async function POST(req: Request) {
  try {
    const { mission_id, verdict, notes } = await req.json() as {
      mission_id: string
      verdict: 'approved' | 'rejected'
      notes?: string
    }

    if (!mission_id) return NextResponse.json({ error: 'mission_id is required' }, { status: 400 })
    if (!verdict || ![REVIEW_STATUS.APPROVED, REVIEW_STATUS.REJECTED].includes(verdict)) {
      return NextResponse.json({ error: 'verdict must be "approved" or "rejected"' }, { status: 400 })
    }

    const { data: mission, error: fetchErr } = await supabaseAdmin
      .from('missions').select('*').eq('id', mission_id).single()
    if (fetchErr || !mission) return NextResponse.json({ error: 'Mission not found' }, { status: 404 })

    if (mission.review_status !== REVIEW_STATUS.PENDING) {
      return NextResponse.json({
        error: `Mission review_status is "${mission.review_status}", not "pending". Nothing to review.`,
      }, { status: 400 })
    }

    const codexRoute = ROUTING_TABLE.codex
    const codexLogFile = `/tmp/codex-review-${mission_id.slice(0, 8)}.log`

    // Ingest Codex review log (append to existing worker events)
    appendLog(mission_id, codexLogFile).catch(() => {})

    // ── Approved ─────────────────────────────────────────────────
    if (verdict === 'approved') {
      await Promise.all([
        supabaseAdmin.from('missions').update({
          status: MISSION_STATUS.DONE, review_status: REVIEW_STATUS.APPROVED,
          review_notes: notes || null, progress: 100, updated_at: new Date().toISOString(),
        }).eq('id', mission_id),
        setAgentIdle(codexRoute.agentId),
      ])

      logActivity({
        mission_id, agent_id: codexRoute.agentId, event_type: 'pipeline_review_approved',
        description: `Codex approved: "${mission.title}"${notes ? ` — ${notes}` : ''}`,
        metadata: { verdict: 'approved', notes },
      })
      cleanRegistryByMissionId(mission_id).catch(() => {})
      sendNotify('Review Approved', `"${mission.title}" — ready for deploy`, 3, ['white_check_mark']).catch(() => {})
      notifyBjorn(`Codex APPROVED "${mission.title}" (${mission_id}).${notes ? ` Notes: ${notes}` : ''}\nReady for deploy. Tell Josue the task is done.`).catch(() => {})

      return NextResponse.json({ action: 'approved', message: 'Review approved. Safe to deploy.', mission_id, can_deploy: true })
    }

    // ── Rejected → auto-spawn Gunther to fix ─────────────────────
    const guntherRoute = ROUTING_TABLE.gunther
    const workdir = extractWorkdir(mission)
    const fixLogFile = `/tmp/gunther-fix-${mission_id.slice(0, 8)}.log`

    // Update mission + reset Codex + activate Gunther in parallel
    await Promise.all([
      supabaseAdmin.from('missions').update({
        status: MISSION_STATUS.ACTIVE, review_status: REVIEW_STATUS.REJECTED,
        review_notes: notes || null, progress: 50,
        log_path: fixLogFile, assignee: guntherRoute.agentId,
        updated_at: new Date().toISOString(),
      }).eq('id', mission_id),
      setAgentIdle(codexRoute.agentId),
      setAgentActive(guntherRoute.agentId, `Fix: ${mission.title}`),
    ])

    logActivity({
      mission_id, agent_id: codexRoute.agentId, event_type: 'pipeline_review_rejected',
      description: `Codex rejected: "${mission.title}" — ${notes || 'no notes'}. Auto-spawning Gunther to fix.`,
      metadata: { verdict: 'rejected', notes },
    })

    // Build fix prompt
    const fixPrompt = [
      `Task: Fix issues in "${mission.title}"`,
      '', 'Codex (the code reviewer) rejected the previous changes with these notes:',
      notes || 'No specific notes provided.',
      '', 'Fix the issues described above. Do NOT rewrite everything — make targeted fixes based on the review feedback.',
      'When done, output a summary of what you fixed.',
      `\nWorking directory: ${workdir}`,
    ].join('\n')

    // Spawn Gunther
    let fixPid = 0
    try {
      const result = await spawnAgentProcess({
        route: guntherRoute, prompt: fixPrompt, workdir,
        logFile: fixLogFile, missionId: mission_id, task: `Fix: ${mission.title}`,
      })
      fixPid = result.pid
    } catch {
      await setAgentIdle(guntherRoute.agentId)
    }

    sendNotify('Review Rejected → Gunther Fixing', `"${mission.title}" — ${notes || 'see review'}`, 4, ['x', 'hammer']).catch(() => {})
    notifyBjorn(`Codex REJECTED "${mission.title}" (${mission_id}). Issues: ${notes || 'no details'}.\nGunther has been auto-spawned to fix. No action needed from you.`).catch(() => {})

    return NextResponse.json({
      action: 'rejected_auto_fix',
      message: 'Review rejected. Gunther auto-spawned to fix. Will auto-review again when done.',
      mission_id, review_notes: notes || null, gunther_pid: fixPid, gunther_log: fixLogFile,
    })

  } catch (err) {
    console.error('[pipeline/review]', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
