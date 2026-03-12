import { NextResponse } from "next/server"
import { execSync } from "child_process"

export async function GET() {
  try {
    const out = execSync("openclaw cron list --json", { encoding: "utf-8", env: { ...process.env, PATH: "/usr/local/bin:/usr/bin:/bin:/home/aparcedodev/.npm-global/bin" } })
    const jobs = JSON.parse(out)
    return NextResponse.json({ jobs: Array.isArray(jobs) ? jobs : [] })
  } catch (e) {
    console.error('[crons]', e instanceof Error ? e.message : e)
    return NextResponse.json({ jobs: [], error: 'Failed to list crons' })
  }
}
