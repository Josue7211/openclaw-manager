import { BB_HOST, BB_PASSWORD } from '../_lib/bb'
import { io, Socket } from 'socket.io-client'

export const dynamic = 'force-dynamic'

// SSE endpoint that bridges BlueBubbles socket.io events to the browser
export async function GET() {
  if (!BB_HOST) {
    return new Response(JSON.stringify({ error: 'bluebubbles_not_configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const encoder = new TextEncoder()
  let socket: Socket | null = null
  let keepalive: ReturnType<typeof setInterval> | null = null

  const stream = new ReadableStream({
    start(controller) {
      function send(obj: object) {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`)) } catch { /* closed */ }
      }

      keepalive = setInterval(() => {
        try { controller.enqueue(encoder.encode(': keepalive\n\n')) } catch { /* closed */ }
      }, 15000)

      socket = io(BB_HOST, {
        query: { password: BB_PASSWORD },
        transports: ['websocket'],
        reconnection: true,
        reconnectionDelay: 2000,
      })

      socket.on('connect', () => send({ type: 'connected' }))
      socket.on('new-message', (data: unknown) => send({ type: 'new-message', data }))
      socket.on('updated-message', (data: unknown) => send({ type: 'updated-message', data }))
      socket.on('typing-indicator', (data: unknown) => send({ type: 'typing', data }))
      socket.on('chat-read-status-changed', (data: unknown) => send({ type: 'chat-read', data }))
      socket.on('group-name-change', (data: unknown) => send({ type: 'group-name', data }))
      socket.on('disconnect', () => send({ type: 'disconnected' }))
      socket.on('connect_error', () => send({ type: 'error' }))
    },
    cancel() {
      if (keepalive) clearInterval(keepalive)
      socket?.disconnect()
      socket = null
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
