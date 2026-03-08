import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export async function GET() {
  try {
    const memoryDir = path.join(process.env.HOME || '/home/aparcedodev', '.openclaw/workspace/memory')

    if (!fs.existsSync(memoryDir)) {
      return NextResponse.json({ entries: [] })
    }

    const files = fs.readdirSync(memoryDir)
      .filter(f => f.endsWith('.md') && !f.startsWith('.'))
      .sort()
      .reverse()
      .slice(0, 5)

    const entries = files.map(file => {
      const filePath = path.join(memoryDir, file)
      let preview = ''
      try {
        const content = fs.readFileSync(filePath, 'utf-8')
        // Skip comment lines and get first real content
        const firstLine = content
          .split('\n')
          .find(l => l.trim() && !l.trim().startsWith('#')) || ''
        preview = firstLine.slice(0, 120)
      } catch { /* ignore */ }

      const date = file.replace('.md', '')
      return { date, preview, path: `memory/${file}` }
    })

    return NextResponse.json({ entries })
  } catch {
    return NextResponse.json({ entries: [] })
  }
}
