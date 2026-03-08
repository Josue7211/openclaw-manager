import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export async function GET() {
  try {
    const heartbeatPath = path.join(process.env.HOME || '/home/aparcedodev', '.openclaw/workspace/HEARTBEAT.md')
    let lastCheck: string | null = null
    let tasks: string[] = []

    if (fs.existsSync(heartbeatPath)) {
      const stat = fs.statSync(heartbeatPath)
      lastCheck = stat.mtime.toISOString()

      const content = fs.readFileSync(heartbeatPath, 'utf-8')
      // Extract non-comment, non-empty lines as tasks
      tasks = content
        .split('\n')
        .filter(l => l.trim() && !l.trim().startsWith('#'))
        .map(l => l.trim())
    }

    return NextResponse.json({
      lastCheck,
      status: 'ok',
      tasks,
    })
  } catch {
    return NextResponse.json({ lastCheck: null, status: 'unknown', tasks: [] })
  }
}
