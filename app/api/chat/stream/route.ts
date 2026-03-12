import fs from 'fs'
import { parseMessages } from '../history/route'
import { getSessionFile } from '@/lib/openclaw'

export async function GET() {
  const filePath = getSessionFile()
  if (!filePath) {
    return new Response('data: {"error":"no session"}\n\n', {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
    })
  }

  let lastSize = fs.statSync(filePath).size
  let lastCount = parseMessages(filePath).length

  let intervalId: ReturnType<typeof setInterval> | null = null

  const stream = new ReadableStream({
    start(controller) {
      // Send a heartbeat comment immediately
      controller.enqueue(new TextEncoder().encode(': connected\n\n'))

      intervalId = setInterval(() => {
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
    },
    cancel() {
      if (intervalId) clearInterval(intervalId)
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
