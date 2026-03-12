import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import {
  ROUTING_TABLE, PROJECT_DIR, MISSION_STATUS, REVIEW_STATUS,
  sendNotify, setAgentActive, logActivity, buildSpawnCommand, validateWorkdir,
} from '@/lib/pipeline'

function routeAgent(complexity: number, taskType: string): string {
  if (taskType === 'code') return 'gunther'
  if (complexity <= 40) return 'roman'
  if (complexity <= 70) return 'sonnet'
  return 'jiraiya'
}

function slugify(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
}

export async function POST(req: Request) {
  try {
    const { title, complexity, task_type, description, workdir, images } = await req.json() as {
      title: string
      complexity: number
      task_type: 'code' | 'non-code' | 'research' | 'config'
      description?: string
      workdir?: string
      images?: string[]
    }

    // ── Validate ─────────────────────────────────────────────────
    if (!title?.trim()) {
      return NextResponse.json({ error: 'title is required' }, { status: 400 })
    }
    if (complexity == null || complexity < 0 || complexity > 100) {
      return NextResponse.json({ error: 'complexity must be 0-100' }, { status: 400 })
    }
    if (!task_type) {
      return NextResponse.json({ error: 'task_type is required (code | non-code | research | config)' }, { status: 400 })
    }

    // ── Route ────────────────────────────────────────────────────
    const agentName = routeAgent(complexity, task_type)
    const route = ROUTING_TABLE[agentName]

    // ── Check agent availability ─────────────────────────────────
    const { data: agentData } = await supabaseAdmin
      .from('agents').select('status, current_task').eq('id', route.agentId).single()

    if (agentData?.status === 'active') {
      return NextResponse.json({
        error: `${route.displayName} is already active on: "${agentData.current_task}". Wait or use a parallel worker.`,
        agent: agentName,
        agent_status: 'active',
      }, { status: 409 })
    }

    // ── Build spawn command ──────────────────────────────────────
    const slug = slugify(title)
    const logFile = `/tmp/${route.logPrefix}-${slug}.log`
    let cwd = PROJECT_DIR
    if (workdir) {
      try {
        cwd = validateWorkdir(workdir)
      } catch {
        return NextResponse.json({ error: 'Invalid workdir: must be an absolute path with safe characters' }, { status: 400 })
      }
    }

    const imgPaths = Array.isArray(images) ? images.filter(p => typeof p === 'string' && p.startsWith('/home/aparcedodev/.openclaw/media/chat-images/')) : []
    const workerPrompt = [
      `Task: ${title}`,
      description ? `\nContext: ${description}` : '',
      imgPaths.length > 0 ? `\nAttached images (use your Read tool to view these):\n${imgPaths.map(p => `- ${p}`).join('\n')}` : '',
      `\nWorking directory: ${cwd}`,
      '\nWhen done, output a summary of what you changed.',
    ].filter(Boolean).join('\n')

    // ── Create mission first (need ID for auto-complete in spawn command) ──
    const reviewRequired = task_type === 'code'
    const { data: mission, error: missionErr } = await supabaseAdmin
      .from('missions')
      .insert({
        title: title.trim(),
        assignee: route.agentId,
        status: MISSION_STATUS.ACTIVE,
        complexity,
        task_type,
        review_status: reviewRequired ? REVIEW_STATUS.PENDING : null,
        routed_agent: agentName,
        spawn_command: '', // updated below
        log_path: logFile,
      })
      .select().single()

    if (missionErr) {
      console.error('[pipeline/spawn] mission create:', missionErr.message)
      return NextResponse.json({ error: 'Failed to create mission' }, { status: 500 })
    }

    // ── Build spawn command with mission ID for auto-complete ──
    const spawnCommand = buildSpawnCommand({ route, prompt: workerPrompt, workdir: cwd, logFile, missionId: mission.id })
    await supabaseAdmin.from('missions').update({ spawn_command: spawnCommand }).eq('id', mission.id)

    // ── Mark agent active ────────────────────────────────────────
    const { error: agentErr } = await setAgentActive(route.agentId, title.trim())
    if (agentErr) {
      console.error('[pipeline/spawn] agent activate:', agentErr.message)
      await supabaseAdmin.from('missions').delete().eq('id', mission.id)
      return NextResponse.json({ error: 'Failed to activate agent' }, { status: 500 })
    }

    // ── Log + notify (fire-and-forget) ───────────────────────────
    logActivity({
      mission_id: mission.id,
      agent_id: route.agentId,
      event_type: 'pipeline_spawn',
      description: `Pipeline spawned ${route.displayName} (${route.model}) for "${title}" [complexity: ${complexity}%, type: ${task_type}]`,
      metadata: { complexity, task_type, agent: agentName, model: route.model },
    })

    sendNotify('Mission Spawned', `${route.emoji} ${route.displayName} → ${title} [${complexity}%]`, 3, ['rocket']).catch(() => {})

    // ── Registry command for Bjorn ───────────────────────────────
    const registryCommand = `node -e "
const fs = require('fs');
const reg = JSON.parse(fs.readFileSync('/tmp/agent-registry.json','utf8').toString() || '{}');
reg[process.argv[1]] = ${JSON.stringify({
  agentId: route.agentId, agentName: route.displayName, emoji: route.emoji,
  task: title.trim(), logFile, mission_id: mission.id, started_at: new Date().toISOString(),
})};
fs.writeFileSync('/tmp/agent-registry.json', JSON.stringify(reg,null,2));
" PID_HERE`

    return NextResponse.json({
      mission,
      agent: { name: agentName, display_name: route.displayName, emoji: route.emoji, id: route.agentId, model: route.model },
      spawn_command: spawnCommand,
      registry_command: registryCommand,
      log_file: logFile,
      review_required: reviewRequired,
    })
  } catch (err) {
    console.error('[pipeline/spawn]', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
