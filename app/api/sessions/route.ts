import { NextResponse } from 'next/server'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export async function GET() {
  try {
    const { stdout } = await execAsync('openclaw sessions list --json 2>/dev/null', {
      timeout: 5000,
      env: { ...process.env, PATH: '/usr/local/bin:/usr/bin:/bin:/home/aparcedodev/.local/bin:/home/aparcedodev/.npm-global/bin' },
    })

    let sessions = []
    try {
      const parsed = JSON.parse(stdout.trim() || '[]')
      sessions = Array.isArray(parsed) ? parsed.slice(0, 5) : []
    } catch { /* parse failed */ }

    return NextResponse.json({ sessions })
  } catch {
    // Return mock/empty data if openclaw command fails
    return NextResponse.json({
      sessions: [
        { id: 'main', label: 'main session', kind: 'main', lastActive: new Date().toISOString() },
      ]
    })
  }
}
