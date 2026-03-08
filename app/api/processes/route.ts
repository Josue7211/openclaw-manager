import { NextResponse } from "next/server"
import { exec } from "child_process"
import { promisify } from "util"
const execAsync = promisify(exec)

export async function GET() {
  try {
    const { stdout } = await execAsync(
      "ps aux | grep -E \"claude|haiku|sonnet|opus\" | grep -v grep | grep -v \"next\" | awk \"{print $1, $2, $11, $12, $13}\"",
      { timeout: 5000, env: { ...process.env, PATH: "/usr/local/bin:/usr/bin:/bin:/home/aparcedodev/.local/bin:/home/aparcedodev/.npm-global/bin" } }
    )
    const lines = stdout.trim().split("\n").filter(Boolean)
    const processes = lines.map(line => {
      const parts = line.split(" ")
      return { user: parts[0], pid: parts[1], cmd: parts.slice(2).join(" ") }
    })
    return NextResponse.json({ processes })
  } catch {
    return NextResponse.json({ processes: [] })
  }
}
