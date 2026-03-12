import { execSync } from 'child_process'
import { NextResponse } from 'next/server'

const NAMES = ['Axel', 'Nova', 'Pixel', 'Hex', 'Byte', 'Flux', 'Cipher', 'Sage']

export async function GET() {
  try {
    const output = execSync('ps aux', { encoding: 'utf8' })
    const lines = output.split('\n').filter(line =>
      line.includes('claude') &&
      !line.includes('grep') &&
      !line.includes('/bin/bash')
    )

    const subagents = lines.slice(1).map((_line, i) => {
      // Don't extract prompt/task from ps output — it can contain sensitive content
      return {
        id: `temp-${i}`,
        name: NAMES[i % NAMES.length],
        model: 'claude-sonnet-4-6',
        status: 'active',
        task: '(running)',
        temp: true,
      }
    })

    return NextResponse.json({
      total: lines.length,
      kodaActive: lines.length > 0,
      subagents,
    })
  } catch {
    return NextResponse.json({ total: 0, kodaActive: false, subagents: [] })
  }
}
