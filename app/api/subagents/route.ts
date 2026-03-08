import { NextResponse } from 'next/server'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export async function GET() {
  try {
    const { stdout } = await execAsync('openclaw subagents list --json 2>/dev/null', {
      timeout: 5000,
      env: { ...process.env, PATH: '/usr/local/bin:/usr/bin:/bin:/home/aparcedodev/.local/bin:/home/aparcedodev/.npm-global/bin' },
    })

    let agents = []
    try {
      const parsed = JSON.parse(stdout.trim() || '[]')
      agents = Array.isArray(parsed) ? parsed : []
    } catch { /* parse failed */ }

    return NextResponse.json({ count: agents.length, agents })
  } catch {
    return NextResponse.json({ count: 0, agents: [] })
  }
}
