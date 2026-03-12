import { supabaseAdmin } from '@/lib/supabase'
import { parseClaudeLog } from '@/lib/logParser'
import fs from 'fs'
import { spawn } from 'child_process'

// Re-export shared constants from lib/constants (importable by both server and client)
export { AGENT_STATUS, MISSION_STATUS, REVIEW_STATUS } from '@/lib/constants'
import { AGENT_STATUS, MISSION_STATUS } from '@/lib/constants'

// ── Shared constants ─────────────────────────────────────────────────────────

export const PROJECT_DIR = process.cwd()
export const REGISTRY_PATH = '/tmp/agent-registry.json'

// ── Agent routing table ──────────────────────────────────────────────────────

export interface AgentRoute {
  agentId: string
  model: string
  flags: string
  logPrefix: string
  displayName: string
  emoji: string
}

export const ROUTING_TABLE: Record<string, AgentRoute> = {
  roman: {
    agentId: 'fast',
    model: 'claude-haiku-4-5',
    flags: '--dangerously-skip-permissions',
    logPrefix: 'roman',
    displayName: 'Roman',
    emoji: '⚡',
  },
  sonnet: {
    agentId: 'sonnet',
    model: 'claude-sonnet-4-6',
    flags: '--dangerously-skip-permissions',
    logPrefix: 'sonnet',
    displayName: 'Sonnet',
    emoji: '🧩',
  },
  gunther: {
    agentId: 'koda',
    model: 'claude-opus-4-6',
    flags: '--verbose --output-format stream-json --dangerously-skip-permissions',
    logPrefix: 'gunther',
    displayName: 'Gunther',
    emoji: '🛠️',
  },
  jiraiya: {
    agentId: 'deep',
    model: 'claude-opus-4-6',
    flags: '--dangerously-skip-permissions',
    logPrefix: 'jiraiya',
    displayName: 'Jiraiya',
    emoji: '🧠',
  },
  codex: {
    agentId: 'review',
    model: 'claude-haiku-4-5',
    flags: '--dangerously-skip-permissions',
    logPrefix: 'codex',
    displayName: 'Codex',
    emoji: '🔍',
  },
}

// ── Notifications ────────────────────────────────────────────────────────────

export async function sendNotify(title: string, message: string, priority = 3, tags?: string[]) {
  try {
    await fetch('http://localhost:3000/api/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, message, priority, tags }),
    })
  } catch { /* best-effort */ }
}

// ── Notify Bjorn (send message to his OpenClaw session) ─────────────────────

export async function notifyBjorn(message: string): Promise<void> {
  const { openclawChatSend } = await import('@/lib/openclaw')
  await openclawChatSend({ message, timeoutMs: 10000 })
}

// ── Agent status helpers ─────────────────────────────────────────────────────

export async function setAgentActive(agentId: string, task: string) {
  return supabaseAdmin.from('agents').update({
    status: AGENT_STATUS.ACTIVE,
    current_task: task,
    updated_at: new Date().toISOString(),
  }).eq('id', agentId)
}

export async function setAgentIdle(agentId: string) {
  return supabaseAdmin.from('agents').update({
    status: AGENT_STATUS.IDLE,
    current_task: '',
    updated_at: new Date().toISOString(),
  }).eq('id', agentId)
}

// ── Activity logging ─────────────────────────────────────────────────────────

export function logActivity(params: {
  mission_id: string
  agent_id: string
  event_type: string
  description: string
  metadata?: Record<string, unknown>
}) {
  // Fire-and-forget — never block on activity logging
  supabaseAdmin.from('activity_log').insert(params).then(() => {}).catch(() => {})
}

// ── Agent registry helpers ───────────────────────────────────────────────────

export interface RegistryEntry {
  agentId: string
  agentName: string
  emoji: string
  task: string
  logFile: string
  mission_id?: string
  started_at?: string
}

export async function registerProcess(pid: number | string, entry: RegistryEntry) {
  try {
    const reg = fs.existsSync(REGISTRY_PATH)
      ? JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf-8'))
      : {}
    reg[String(pid)] = entry
    fs.writeFileSync(REGISTRY_PATH, JSON.stringify(reg, null, 2))
  } catch { /* best effort */ }
}

export async function cleanRegistryByMissionId(missionId: string) {
  try {
    if (!fs.existsSync(REGISTRY_PATH)) return
    const reg = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf-8'))
    for (const [pid, entry] of Object.entries(reg)) {
      if ((entry as { mission_id?: string }).mission_id === missionId) {
        delete reg[pid]
      }
    }
    fs.writeFileSync(REGISTRY_PATH, JSON.stringify(reg, null, 2))
  } catch { /* best effort */ }
}

// ── Input validation ─────────────────────────────────────────────────────────

/** Validate a string is a UUID (safe for shell interpolation) */
export function validateUUID(id: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error('Invalid UUID format')
  }
  return id
}

/** Validate workdir is a safe absolute path (no shell metacharacters) */
export function validateWorkdir(workdir: string): string {
  // Must be absolute
  if (!workdir.startsWith('/')) {
    throw new Error('workdir must be an absolute path')
  }
  // Only allow alphanumeric, hyphens, underscores, dots, slashes
  if (!/^[a-zA-Z0-9/_.\-]+$/.test(workdir)) {
    throw new Error('workdir contains invalid characters')
  }
  // No path traversal
  if (workdir.includes('..')) {
    throw new Error('workdir must not contain ".."')
  }
  return workdir
}

/** Shell-escape a string for safe interpolation into bash commands */
function shellEscape(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'"
}

// ── Spawn agent process ──────────────────────────────────────────────────────

const MC_BASE_URL = 'http://localhost:3000'

export function buildSpawnCommand(params: {
  route: AgentRoute
  prompt: string
  workdir: string
  logFile: string
  missionId?: string
}): string {
  const safeWorkdir = shellEscape(params.workdir)
  const safeLogFile = shellEscape(params.logFile)
  const claudeCmd = [
    `cd ${safeWorkdir} &&`,
    `unset CLAUDECODE &&`,
    `ANTHROPIC_MODEL=${shellEscape(params.route.model)}`,
    `claude ${params.route.flags}`,
    `-p ${shellEscape(params.prompt)}`,
    `> ${safeLogFile} 2>&1`,
  ].join(' ')

  // If missionId provided, auto-call /api/pipeline/complete when the worker exits
  // Use $MC_API_KEY env var reference instead of embedding the literal key
  if (params.missionId) {
    const safeMissionId = validateUUID(params.missionId)
    const completeCmd = `curl -s -X POST ${MC_BASE_URL}/api/pipeline/complete -H "Content-Type: application/json" -H "X-API-Key: $MC_API_KEY" -d '{"mission_id":"${safeMissionId}","status":"done"}'`
    return `${claudeCmd}; ${completeCmd}`
  }

  return claudeCmd
}

export async function spawnAgentProcess(params: {
  route: AgentRoute
  prompt: string
  workdir: string
  logFile: string
  missionId: string
  task: string
}): Promise<{ pid: number }> {
  const safeWorkdir = validateWorkdir(params.workdir)

  // Write prompt to temp file to avoid shell injection
  const promptFile = `/tmp/prompt-${params.missionId.slice(0, 8)}.txt`
  fs.writeFileSync(promptFile, params.prompt)

  const safeLogFile = shellEscape(params.logFile)
  const safePromptFile = shellEscape(promptFile)
  // Auto-call /api/pipeline/complete when the worker process exits
  // Uses $MC_API_KEY from the clean env — never embed the literal key in the command string
  const safeMissionId = validateUUID(params.missionId)
  const autoComplete = `curl -s -X POST ${MC_BASE_URL}/api/pipeline/complete -H "Content-Type: application/json" -H "X-API-Key: $MC_API_KEY" -d '{"mission_id":"${safeMissionId}","status":"done"}'`
  // Build minimal env — don't leak infrastructure credentials to agents
  const cleanEnv: Record<string, string | undefined> = {
    HOME: process.env.HOME,
    USER: process.env.USER,
    PATH: process.env.PATH,
    SHELL: process.env.SHELL,
    TERM: process.env.TERM,
    LANG: process.env.LANG,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    ANTHROPIC_MODEL: params.route.model,
    MC_API_KEY: process.env.MC_API_KEY,
    // Exclude CLAUDECODE to prevent "nested session" error
    // Exclude: SUPABASE_*, PROXMOX_*, OPNSENSE_*, CALDAV_*, OPENCLAW_*
  }
  const child = spawn('bash', ['-c',
    `cd ${shellEscape(safeWorkdir)} && claude ${params.route.flags} -p "$(cat ${safePromptFile})" > ${safeLogFile} 2>&1; rm -f ${safePromptFile}; ${autoComplete}`
  ], { detached: true, stdio: 'ignore', env: cleanEnv as NodeJS.ProcessEnv })
  child.unref()

  if (!child.pid) {
    throw new Error(`Failed to spawn agent process for ${params.route.displayName}`)
  }
  const pid = child.pid

  // Register in agent registry
  await registerProcess(pid, {
    agentId: params.route.agentId,
    agentName: params.route.displayName,
    emoji: params.route.emoji,
    task: params.task,
    logFile: params.logFile,
    mission_id: params.missionId,
    started_at: new Date().toISOString(),
  })

  return { pid }
}

// ── Log ingestion ────────────────────────────────────────────────────────────

/** Ingest a log file into mission_events. mode='replace' deletes existing events first; mode='append' adds after them. */
export async function ingestLog(missionId: string, logPath: string, durationSec?: number, mode: 'replace' | 'append' = 'replace'): Promise<boolean> {
  try {
    const content = fs.readFileSync(logPath, 'utf-8')
    if (!content.trim()) return false
    const parsed = parseClaudeLog(content, durationSec)
    if (parsed.length === 0) return false

    let seqOffset = 0
    if (mode === 'replace') {
      await supabaseAdmin.from('mission_events').delete().eq('mission_id', missionId)
    } else {
      const { data: maxRow } = await supabaseAdmin
        .from('mission_events')
        .select('seq')
        .eq('mission_id', missionId)
        .order('seq', { ascending: false })
        .limit(1)
        .single()
      seqOffset = ((maxRow?.seq as number | null) ?? -1) + 1
    }

    const rows = parsed.map(e => ({
      mission_id: missionId, event_type: e.event_type, content: e.content,
      file_path: e.file_path || null, seq: seqOffset + e.seq,
      elapsed_seconds: e.elapsed_seconds ?? null,
      tool_input: e.tool_input || null, model_name: e.model_name || null,
    }))
    await supabaseAdmin.from('mission_events').insert(rows)
    return true
  } catch { return false }
}

/** Convenience alias: append log events after existing ones */
export async function appendLog(missionId: string, logPath: string, durationSec?: number): Promise<boolean> {
  return ingestLog(missionId, logPath, durationSec, 'append')
}

// ── Workdir extraction ───────────────────────────────────────────────────────

export function extractWorkdir(mission: { spawn_command?: string | null }): string {
  const raw = mission.spawn_command?.match(/^cd ([^ ]+)/)?.[1] || PROJECT_DIR
  // Strip shell quotes (single or double) that shellEscape adds
  return raw.replace(/^['"]|['"]$/g, '')
}
