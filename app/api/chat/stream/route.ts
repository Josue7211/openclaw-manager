import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { parseMessages } from '../history/route'

const OPENCLAW = path.join(process.env.HOME || '/home/aparcedodev', '.openclaw')

function getSessionFile(): string | null {
  try {
    const idx = JSON.parse(fs.readFileSync(path.join(OPENCLAW, 'agents/main/sessions/sessions.json'), 'utf-8'))
    const sessionId = idx['agent:main:main']?.sessionId
    if (!sessionId) return null
    const p = path.join(OPENCLAW, `agents/main/sessions/${sessionId}.jsonl`)
    return fs.existsSync(p) ? p : null
  } catch { return null }
}

export async function GET() {
  const filePath = getSessionFile()
  if (!filePath) {
    return new Response('data: {"error":"no session"}\n\n', {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
    })
  }

  let lastSize = fs.statSync(filePath).size
  let lastCount = parseMessages(filePath).length

  const stream = new ReadableStream({
    start(controller) {
      // Send a heartbeat comment immediately
      controller.enqueue(new TextEncoder().encode(': connected\n\n'))

      const interval = setInterval(() => {
        try {
          const stat = fs.statSync(filePath)
          if (stat.size === lastSize) {
            // Keep-alive ping
            controller.enqueue(new TextEncoder().encode(': ping\n\n'))
            return
          }
          lastSize = stat.size

          const messages = parseMessages(filePath)
          if (messages.length > lastCount) {
            const newMsgs = messages.slice(lastCount)
            lastCount = messages.length
            for (const msg of newMsgs) {
              const data = JSON.stringify(msg)
              controller.enqueue(new TextEncoder().encode(`data: ${data}\n\n`))
            }
          }
        } catch {
          controller.enqueue(new TextEncoder().encode(': error\n\n'))
        }
      }, 1000)

      // Clean up on close
      const cleanup = () => clearInterval(interval)
      ;(controller as any)._cleanup = cleanup
    },
    cancel() {
      // interval cleanup handled by GC
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
