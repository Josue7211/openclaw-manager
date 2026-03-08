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

    const subagents = lines.slice(1).map((line, i) => {
      const marker = '--dangerously-skip-permissions -p '
      const markerIdx = line.indexOf(marker)
      let task = ''
      if (markerIdx !== -1) {
        task = line.slice(markerIdx + marker.length, markerIdx + marker.length + 80).trim()
      }

      return {
        id: `temp-${i}`,
        name: NAMES[i % NAMES.length],
        model: 'claude-sonnet-4-6',
        status: 'active',
        task,
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
