import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export async function GET() {
  try {
    const identityPath = path.join(process.env.HOME || '/home/aparcedodev', '.openclaw/workspace/IDENTITY.md')
    let name = 'Bjorn'
    let emoji = '🦬'

    if (fs.existsSync(identityPath)) {
      const content = fs.readFileSync(identityPath, 'utf-8')
      const nameMatch = content.match(/\*\*Name:\*\*\s*(.+)/)
      const emojiMatch = content.match(/\*\*Emoji:\*\*\s*(.+)/)
      if (nameMatch) name = nameMatch[1].trim()
      if (emojiMatch) emoji = emojiMatch[1].trim()
    }

    return NextResponse.json({
      name,
      emoji,
      model: 'claude-sonnet-4-6',
      status: 'online',
      lastActive: new Date().toISOString(),
      host: 'Openclaw-VM',
      ip: '10.0.0.SERVICES',
    })
  } catch {
    return NextResponse.json({
      name: 'Bjorn',
      emoji: '🦬',
      model: 'claude-sonnet-4-6',
      status: 'online',
      lastActive: new Date().toISOString(),
      host: 'Openclaw-VM',
      ip: '10.0.0.SERVICES',
    })
  }
}
