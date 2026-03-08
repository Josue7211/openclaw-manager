import { NextResponse } from 'next/server'
import { execSync } from 'child_process'

interface Task {
  id: string
  label: string
  agentId: string
  startedAt: string
}

function getRunningClaudeProcesses(): Task[] {
  try {
    // Check for running claude processes (Claude Code CLI)
    const out = execSync(
      `ps aux | grep -E '[c]laude.*(--dangerously|dangerously)' | grep -v grep`,
      { timeout: 2000, encoding: 'utf-8' }
    ).trim()

    if (!out) return []

    return out.split('\n').filter(Boolean).map((line, i) => {
      // Extract PID and start time from ps output
      const parts = line.trim().split(/\s+/)
      const pid = parts[1] ?? `${i}`
      const startTime = parts[8] ?? new Date().toISOString()

      // Try to parse a start timestamp from ps STIME field
      // ps STIME is like "00:15" (today) or "Mar06" (older)
      let startedAt: string
      try {
        const stime = parts[8] ?? ''
        if (stime.includes(':')) {
          // Today, e.g. "00:15"
          const [h, m] = stime.split(':').map(Number)
          const d = new Date()
          d.setHours(h, m, 0, 0)
          startedAt = d.toISOString()
        } else {
          // Older — just use now minus a rough estimate
          startedAt = new Date(Date.now() - 5 * 60 * 1000).toISOString()
        }
      } catch {
        startedAt = new Date().toISOString()
      }

      return {
        id: pid,
        label: 'Claude Code',
        agentId: 'coding',
        startedAt,
      }
    })
  } catch {
    return []
  }
}

export async function GET() {
  const tasks: Task[] = getRunningClaudeProcesses()

  // Also try OpenClaw sessions as a fallback supplement
  try {
    const res = await fetch('http://localhost:18789/api/sessions', {
      headers: { 'x-openclaw-internal': '1' },
      signal: AbortSignal.timeout(2000),
    })
    if (res.ok) {
      const data = await res.json()
      const activeSessions = (data.sessions || []).filter(
        (s: { kind?: string; status?: string }) =>
          s.kind === 'subagent' && (s.status === 'running' || s.status === 'active')
      )
      for (const s of activeSessions) {
        if (!tasks.find(t => t.agentId === s.agentId)) {
          tasks.push({
            id: s.id ?? s.sessionKey ?? 'session',
            label: s.label ?? s.agentId ?? 'subagent',
            agentId: s.agentId ?? 'coding',
            startedAt: s.startedAt ?? new Date().toISOString(),
          })
        }
      }
    }
  } catch { /* gateway unreachable */ }

  return NextResponse.json({
    active: tasks.length > 0,
    count: tasks.length,
    tasks,
  })
}
