import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { findAgentLogFile } from '@/lib/logParser'
import {
  ROUTING_TABLE, MISSION_STATUS, REVIEW_STATUS,
  sendNotify, setAgentActive, setAgentIdle, logActivity,
  spawnAgentProcess, cleanRegistryByMissionId, extractWorkdir, ingestLog,
  notifyBjorn,
} from '@/lib/pipeline'

const ESCALATION: Record<string, string> = {
  roman: 'sonnet',
  sonnet: 'jiraiya',
}
const MAX_RETRIES = 3

/** Resolve log path and ingest events for a mission (fire-and-forget) */
function ingestMissionLog(missionId: string, mission: { log_path?: string | null; created_at: string }, agentId: string) {
  const logPath = mission.log_path || findAgentLogFile(agentId)
  if (!logPath) return { logPath: null }
  const durationSec = Math.round((Date.now() - new Date(mission.created_at).getTime()) / 1000)
  ingestLog(missionId, logPath, durationSec).catch(() => {})
  return { logPath }
}

export async function POST(req: Request) {
  try {
    const { mission_id, status, failure_reason } = await req.json() as {
      mission_id: string
      status: 'done' | 'failed'
      failure_reason?: string
    }

    if (!mission_id) return NextResponse.json({ error: 'mission_id is required' }, { status: 400 })
    if (!status || ![MISSION_STATUS.DONE, 'failed'].includes(status)) {
      return NextResponse.json({ error: 'status must be "done" or "failed"' }, { status: 400 })
    }

    const { data: mission, error: fetchErr } = await supabaseAdmin
      .from('missions').select('*').eq('id', mission_id).single()
    if (fetchErr || !mission) return NextResponse.json({ error: 'Mission not found' }, { status: 404 })

    // Guard: skip if mission is already done or reviewed (e.g. Codex auto-complete firing after /api/pipeline/review)
    if (mission.status === MISSION_STATUS.DONE || mission.review_status === REVIEW_STATUS.APPROVED || mission.review_status === REVIEW_STATUS.REJECTED) {
      return NextResponse.json({ action: 'skipped', message: 'Mission already completed or reviewed.', mission_id })
    }

    const isCodeTask = mission.task_type === 'code'
    const agentId = mission.assignee
    const routedAgent = mission.routed_agent || ''

    // ── Failure ──────────────────────────────────────────────────
    if (status === 'failed') {
      const retryCount = (mission.retry_count || 0) + 1
      const shouldEscalate = retryCount >= MAX_RETRIES && ESCALATION[routedAgent]

      // Common updates for all failure paths
      await Promise.all([
        supabaseAdmin.from('missions').update({
          status: MISSION_STATUS.FAILED, retry_count: retryCount, updated_at: new Date().toISOString(),
        }).eq('id', mission_id),
        setAgentIdle(agentId),
      ])

      if (shouldEscalate) {
        const escalatedAgent = ESCALATION[routedAgent]
        logActivity({
          mission_id, agent_id: agentId, event_type: 'pipeline_escalation',
          description: `${retryCount} failures — escalating from ${routedAgent} to ${escalatedAgent}. Reason: ${failure_reason || 'unknown'}`,
          metadata: { retry_count: retryCount, from: routedAgent, to: escalatedAgent, reason: failure_reason },
        })
        sendNotify('Mission Escalated', `"${mission.title}" failed ${retryCount}x → escalating to ${escalatedAgent}`, 4, ['warning']).catch(() => {})

        return NextResponse.json({
          action: 'escalate',
          message: `Failed ${retryCount}x. Escalate to ${escalatedAgent}. Use POST /api/pipeline/spawn to re-route.`,
          escalate_to: escalatedAgent, retry_count: retryCount, failure_reason: failure_reason || null,
        })
      }

      logActivity({
        mission_id, agent_id: agentId, event_type: 'pipeline_failure',
        description: `Mission failed (attempt ${retryCount}/${MAX_RETRIES}). Reason: ${failure_reason || 'unknown'}`,
        metadata: { retry_count: retryCount, reason: failure_reason },
      })
      sendNotify('Mission Failed', `"${mission.title}" attempt ${retryCount}/${MAX_RETRIES}. ${failure_reason || ''}`, 4, ['x']).catch(() => {})

      return NextResponse.json({
        action: retryCount < MAX_RETRIES ? 'retry' : 'escalate_manual',
        message: retryCount < MAX_RETRIES
          ? `Failed (${retryCount}/${MAX_RETRIES}). Read the log, diagnose, then retry or re-spawn.`
          : `Failed ${retryCount}x with no escalation path. Manual intervention needed.`,
        retry_count: retryCount, can_retry: retryCount < MAX_RETRIES, failure_reason: failure_reason || null,
      })
    }

    // ── Success: code task → auto-spawn Codex review ─────────────
    if (isCodeTask) {
      const codexRoute = ROUTING_TABLE.codex
      const workdir = extractWorkdir(mission)
      const codexLogFile = `/tmp/codex-review-${mission_id.slice(0, 8)}.log`

      // Update mission + reset worker + activate Codex in parallel
      await Promise.all([
        supabaseAdmin.from('missions').update({
          status: MISSION_STATUS.AWAITING_REVIEW, review_status: REVIEW_STATUS.PENDING,
          progress: 90, updated_at: new Date().toISOString(),
        }).eq('id', mission_id),
        setAgentIdle(agentId),
        setAgentActive(codexRoute.agentId, `Review: ${mission.title}`),
      ])

      // Ingest worker logs (fire-and-forget)
      ingestMissionLog(mission_id, mission, agentId)

      // Build Codex review prompt
      const reviewPrompt = [
        `You are Codex, the code review agent. Review the changes for mission: "${mission.title}"`,
        '', 'Your job is to REVIEW, not fix. Check:',
        '1. Run "git diff" in the project directory to see what changed',
        '2. Run "npm run build" to verify it compiles',
        '3. Check for broken imports, logic errors, missing props, type errors',
        '4. If agent-browser is available, open the app and visually verify the changes look correct',
        '', 'When done, submit your review by running:',
        '', 'curl -X POST http://localhost:3000/api/pipeline/review \\',
        '  -H "Content-Type: application/json" \\',
        '  -H "X-API-Key: $MC_API_KEY" \\',
        `  -d '{"mission_id":"${mission_id}","verdict":"approved","notes":"your review notes"}'`,
        '', 'Use verdict "approved" if changes are good. Use "rejected" with detailed notes if there are issues.',
        `\nWorking directory: ${workdir}`,
      ].join('\n')

      // Spawn Codex
      let codexPid = 0
      try {
        const result = await spawnAgentProcess({
          route: codexRoute, prompt: reviewPrompt, workdir,
          logFile: codexLogFile, missionId: mission_id, task: `Review: ${mission.title}`,
        })
        codexPid = result.pid
      } catch (spawnErr) {
        console.error('[pipeline/complete] Failed to spawn Codex:', spawnErr)
        // Rollback Codex to idle if spawn fails
        await setAgentIdle(codexRoute.agentId)
      }

      logActivity({
        mission_id, agent_id: codexRoute.agentId, event_type: 'pipeline_auto_review',
        description: `Auto-spawned Codex to review "${mission.title}"`,
        metadata: { task_type: 'code', codex_pid: codexPid, log_file: codexLogFile },
      })
      sendNotify('Codex Reviewing', `🔍 Auto-reviewing "${mission.title}"`, 3, ['eyes']).catch(() => {})
      notifyBjorn(`Code task "${mission.title}" (${mission_id}) completed by ${routedAgent}. Codex is now auto-reviewing. You don't need to do anything — Codex will approve or reject automatically.`).catch(() => {})

      return NextResponse.json({
        action: 'review_auto_spawned',
        message: 'Code task done. Codex auto-spawned for review. Deploy will unblock when Codex approves.',
        mission_id, review_status: 'pending', codex_pid: codexPid, codex_log: codexLogFile,
      })
    }

    // ── Success: non-code task → done immediately ────────────────
    await Promise.all([
      supabaseAdmin.from('missions').update({
        status: MISSION_STATUS.DONE, progress: 100, updated_at: new Date().toISOString(),
      }).eq('id', mission_id),
      setAgentIdle(agentId),
    ])

    const { logPath } = ingestMissionLog(mission_id, mission, agentId)
    let logTail = ''
    if (logPath) {
      // Read last 2000 chars of log for Bjorn notification
      try {
        const { execSync } = await import('child_process')
        logTail = execSync(`tail -c 2000 ${logPath.replace(/[^a-zA-Z0-9/._-]/g, '')}`, { encoding: 'utf-8', timeout: 3000 })
      } catch { /* best effort */ }
    }

    logActivity({
      mission_id, agent_id: agentId, event_type: 'mission_status_change',
      description: `Mission "${mission.title}" completed successfully`, metadata: { status: 'done' },
    })
    sendNotify('Mission Complete', `"${mission.title}" done`, 3, ['white_check_mark']).catch(() => {})
    cleanRegistryByMissionId(mission_id).catch(() => {})

    // Notify Bjorn with the result so he can relay to user
    notifyBjorn(`Mission "${mission.title}" (${mission_id}) completed by ${routedAgent}.\n\nWorker output:\n${logTail || '(no log output)'}\n\nRelay this result to Josue now.`).catch(() => {})

    return NextResponse.json({ action: 'done', message: 'Mission completed. No review needed (non-code task).', mission_id })

  } catch (err) {
    console.error('[pipeline/complete]', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
