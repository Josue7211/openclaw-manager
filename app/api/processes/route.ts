import { NextResponse } from 'next/server'
import { exec, execFile } from 'child_process'
import { promisify } from 'util'
import { readdir, readFile, writeFile } from 'fs/promises'
import { supabaseAdmin } from '@/lib/supabase'
import { REGISTRY_PATH, AGENT_STATUS } from '@/lib/pipeline'
import type { RegistryEntry } from '@/lib/pipeline'

const execAsync = promisify(exec)
const execFileAsync = promisify(execFile)

const LOG_PATH_RE = /^\/tmp\/[a-zA-Z0-9._-]+\.log$/

const EXEC_ENV = {
  ...process.env,
  PATH: '/usr/local/bin:/usr/bin:/bin:/home/aparcedodev/.local/bin:/home/aparcedodev/.npm-global/bin',
}

// Cache nproc — CPU count doesn't change at runtime
let cachedNcpus: number | null = null

interface Registry {
  [pid: string]: RegistryEntry
}

interface ProcessEntry {
  pid: string
  cmd: string
  cpu: string
  mem: string
  elapsed: string
  logFile: string | null
  agentName: string | null
  agentEmoji: string | null
  lastLogLine: string | null
  task: string | null
  mission_id: string | null
  mission_title: string | null
  started_at: string | null
}

async function readRegistry(): Promise<Registry> {
  try {
    const content = await readFile(REGISTRY_PATH, 'utf8')
    return JSON.parse(content) as Registry
  } catch {
    return {}
  }
}

async function writeRegistry(registry: Registry): Promise<void> {
  try {
    await writeFile(REGISTRY_PATH, JSON.stringify(registry, null, 2), 'utf8')
  } catch {
    // ignore write errors
  }
}

async function getLastLogLine(logPath: string): Promise<string | null> {
  if (!LOG_PATH_RE.test(logPath)) return null
  try {
    const { stdout } = await execFileAsync('tail', ['-1', logPath], { timeout: 2000, env: EXEC_ENV })
    return stdout.trim() || null
  } catch {
    return null
  }
}

async function matchPidsToLogs(pids: string[]): Promise<Map<string, { logFile: string; lastLogLine: string | null }>> {
  const map = new Map<string, { logFile: string; lastLogLine: string | null }>()
  try {
    const files = await readdir('/tmp')
    const logFiles = files.filter(f => f.endsWith('.log'))
    // Collect all (pid, logPath) pairs, then fetch last lines in parallel
    const pairs: { pid: string; logPath: string }[] = []
    for (const file of logFiles) {
      const logPath = `/tmp/${file}`
      for (const pid of pids) {
        if (file.includes(pid)) {
          pairs.push({ pid, logPath })
        }
      }
    }
    const results = await Promise.all(
      pairs.map(async ({ pid, logPath }) => ({
        pid, logPath, lastLogLine: await getLastLogLine(logPath),
      }))
    )
    for (const { pid, logPath, lastLogLine } of results) {
      map.set(pid, { logFile: logPath, lastLogLine })
    }
  } catch {
    // /tmp not readable
  }
  return map
}

async function getTopCpuMem(pids: string[]): Promise<Map<string, { cpu: string; mem: string }>> {
  const map = new Map<string, { cpu: string; mem: string }>()
  if (pids.length === 0) return map
  try {
    // Validate all PIDs are numeric before shell interpolation
    const safePids = pids.filter(p => /^\d+$/.test(p))
    if (safePids.length === 0) return map
    const pidList = safePids.join(',')
    const { stdout } = await execAsync(
      `top -bn2 -d0.5 -p ${pidList}`,
      { timeout: 8000, env: EXEC_ENV }
    )
    // top -bn2 outputs two batches; we want the second for accurate snapshot.
    // Split on the "top -" header line to get batches.
    const batches = stdout.split(/^top - /m)
    const lastBatch = batches[batches.length - 1] ?? ''
    // Find the header line with PID column
    const batchLines = lastBatch.split('\n')
    let headerIdx = -1
    for (let i = 0; i < batchLines.length; i++) {
      if (/^\s*PID\s+USER/i.test(batchLines[i])) {
        headerIdx = i
        break
      }
    }
    if (headerIdx === -1) return map
    // Parse process lines after header
    for (let i = headerIdx + 1; i < batchLines.length; i++) {
      const parts = batchLines[i].trim().split(/\s+/)
      if (parts.length < 10) continue
      // top columns: PID USER PR NI VIRT RES SHR S %CPU %MEM TIME+ COMMAND
      const pid = parts[0]
      const cpu = parts[8]
      const mem = parts[9]
      if (pid && !isNaN(Number(pid))) {
        map.set(pid, { cpu, mem })
      }
    }
  } catch {
    // top failed — caller will fall back to ps values
  }
  return map
}

export async function GET() {
  try {
    // ps aux columns: USER PID %CPU %MEM VSZ RSS TTY STAT START TIME COMMAND
    const { stdout } = await execAsync(
      "ps aux | grep -E 'claude|haiku|sonnet|opus' | grep -v grep | grep -v 'next-server'",
      { timeout: 5000, env: EXEC_ENV }
    )

    const ownPid = String(process.pid)
    const lines = stdout.trim().split('\n').filter(Boolean)
      .filter(line => {
        const parts = line.trim().split(/\s+/)
        const pid = parts[1]
        if (pid === ownPid) return false
        // Filter out bash wrapper processes: only keep actual claude binary processes
        const cmd = parts.slice(10).join(' ')
        return !cmd.includes('/bin/bash -c') && !cmd.includes('bash -c')
      })
    const pids = lines.map(line => line.trim().split(/\s+/)[1]).filter(Boolean)

    // Read registry and clean stale entries, remap child PIDs if needed
    const registry = await readRegistry()
    const livePidSet = new Set(pids)
    let registryDirty = false

    // Collect stale PIDs to check in parallel
    const stalePids = Object.keys(registry).filter(pid => {
      if (!/^\d+$/.test(pid)) {
        delete registry[pid]
        registryDirty = true
        return false
      }
      return !livePidSet.has(pid)
    })

    // Check child processes in parallel
    const childResults = await Promise.all(
      stalePids.map(async (registeredPid) => {
        try {
          const { stdout: childPid } = await execAsync(
            `pgrep -P ${registeredPid} claude`,
            { timeout: 2000, env: EXEC_ENV }
          )
          return { registeredPid, child: childPid.toString().trim() }
        } catch {
          return { registeredPid, child: '' }
        }
      })
    )

    for (const { registeredPid, child } of childResults) {
      if (child && livePidSet.has(child)) {
        const entry = registry[registeredPid]
        delete registry[registeredPid]
        registry[child] = entry
        registryDirty = true
        livePidSet.add(child)
      } else {
        delete registry[registeredPid]
        registryDirty = true
      }
    }
    if (registryDirty) {
      await writeRegistry(registry)
    }

    // Get nproc for ps fallback normalization (cached — CPU count is constant)
    if (cachedNcpus === null) {
      try {
        const { stdout: np } = await execAsync('nproc', { timeout: 2000, env: EXEC_ENV })
        cachedNcpus = parseInt(np.trim(), 10) || 1
      } catch { cachedNcpus = 1 }
    }
    const ncpus = cachedNcpus

    const [pidLogMap, agentsResult, topMap] = await Promise.all([
      matchPidsToLogs(pids),
      supabaseAdmin.from('agents').select('id, display_name, emoji, status'),
      getTopCpuMem(pids),
    ])

    const agentMap = new Map<string, { display_name: string; emoji: string }>()
    for (const a of agentsResult.data ?? []) {
      agentMap.set(a.id, { display_name: a.display_name, emoji: a.emoji })
    }

    const processes: ProcessEntry[] = lines.map(line => {
      const parts = line.trim().split(/\s+/)
      // USER PID %CPU %MEM VSZ RSS TTY STAT START TIME COMMAND...
      const pid = parts[1] ?? ''
      const psCpu = parseFloat(parts[2] ?? '0')
      const psMem = parts[3] ?? '0'
      const elapsed = parts[9] ?? ''
      const rawCmd = parts.slice(10).join(' ')
      // Redact prompt content from command line — it may contain sensitive instructions
      const cmd = rawCmd.replace(/-p\s+(['"])[\s\S]*?\1/g, '-p [redacted]')
        .replace(/-p\s+"?\$\(cat [^)]+\)"?/g, '-p [prompt-file]')

      const topEntry = topMap.get(pid)
      // Prefer top's instantaneous CPU; fall back to ps value normalized by core count
      const cpu = topEntry
        ? topEntry.cpu
        : (psCpu / ncpus).toFixed(1)
      const mem = topEntry ? topEntry.mem : psMem

      const logEntry = pidLogMap.get(pid)

      // Check registry first for agent info
      const regEntry = registry[pid]

      return {
        pid,
        cmd,
        cpu,
        mem,
        elapsed,
        logFile: regEntry?.logFile ?? logEntry?.logFile ?? null,
        agentName: regEntry?.agentName ?? null,
        agentEmoji: regEntry?.emoji ?? null,
        lastLogLine: logEntry?.lastLogLine ?? null,
        task: regEntry?.task ?? null,
        mission_id: regEntry?.mission_id ?? null,
        mission_title: (regEntry as RegistryEntry & { mission_title?: string })?.mission_title ?? null,
        started_at: regEntry?.started_at ?? null,
      }
    })

    // For processes not matched via registry, fall back to log-name matching
    for (const proc of processes) {
      if (proc.agentName === null && proc.logFile) {
        const filename = proc.logFile.replace('/tmp/', '').replace('.log', '')
        for (const [agentId, agentInfo] of agentMap.entries()) {
          if (filename.startsWith(agentId) || filename.includes(agentId)) {
            proc.agentName = agentInfo.display_name
            proc.agentEmoji = agentInfo.emoji
            break
          }
        }
      }
    }

    // Sync agent statuses with running processes
    const liveAgentIds = new Set<string>()
    for (const pid of livePidSet) {
      const regEntry = registry[pid]
      if (regEntry?.agentId) {
        liveAgentIds.add(regEntry.agentId)
      }
    }

    const dbAgents = agentsResult.data ?? []
    const syncPromises: Promise<unknown>[] = []

    // Mark agents with running processes as active (only if not already active)
    for (const agentId of liveAgentIds) {
      const dbAgent = dbAgents.find((a: { id: string; status: string }) => a.id === agentId)
      if (dbAgent && dbAgent.status !== AGENT_STATUS.ACTIVE) {
        syncPromises.push(
          supabaseAdmin
            .from('agents')
            .update({ status: AGENT_STATUS.ACTIVE, updated_at: new Date().toISOString() })
            .eq('id', agentId)
        )
      }
    }

    // Mark agents that are active in DB but have no running process as awaiting_deploy
    for (const agent of dbAgents) {
      if (agent.status === AGENT_STATUS.ACTIVE && !liveAgentIds.has(agent.id)) {
        syncPromises.push(
          supabaseAdmin
            .from('agents')
            .update({ status: AGENT_STATUS.AWAITING_DEPLOY, updated_at: new Date().toISOString() })
            .eq('id', agent.id)
        )
      }
    }

    await Promise.all(syncPromises)

    return NextResponse.json({ processes, agents: agentsResult.data ?? [] })
  } catch (err) {
    console.error('[processes] Error:', err instanceof Error ? err.message : err)
    return NextResponse.json({ processes: [], agents: [], error: 'monitoring_error' })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as {
      pid: string
      agentId: string
      agentName: string
      emoji: string
      task: string
      logFile: string
      mission_id?: string
      mission_title?: string
      started_at?: string
    }
    const { pid, agentId, agentName, emoji, task, logFile, mission_id, mission_title, started_at } = body
    if (!pid || !/^\d+$/.test(String(pid))) {
      return NextResponse.json({ ok: false, error: 'pid must be a numeric string' }, { status: 400 })
    }
    if (logFile && !LOG_PATH_RE.test(logFile)) {
      return NextResponse.json({ ok: false, error: 'logFile must be a .log file under /tmp/' }, { status: 400 })
    }
    const registry = await readRegistry()
    // IMPORTANT: When spawning workers via background exec, the returned PID is typically a bash wrapper.
    // The caller should resolve the actual claude child PID using: pgrep -P <wrapper_pid> claude
    // See docs/SOUL.md for the spawn protocol pattern.
    registry[pid] = { agentId, agentName, emoji, task, logFile, mission_id, started_at } as RegistryEntry
    await writeRegistry(registry)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false, error: 'internal error' }, { status: 500 })
  }
}
