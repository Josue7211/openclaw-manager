import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
const GATEWAY_WS  = 'ws://127.0.0.1:18789'
const PASSWORD    = 'REDACTED_PASSWORD'
const SESSION_KEY = 'agent:main:main'

async function sendViaChatSend(text: string, images: string[] = []): Promise<{ ok: boolean; error?: string }> {
  // Build attachments from base64 data URLs — Gateway handles these as real image content blocks
  const attachments = images.flatMap((dataUrl) => {
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
    if (!match) return []
    return [{ mimeType: match[1], content: match[2] }]
  })

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      ws.close()
      resolve({ ok: false, error: 'timeout' })
    }, 15000)

    const ws = new WebSocket(GATEWAY_WS)
    let connected = false

    ws.onmessage = (evt: MessageEvent) => {
      try {
        const f = JSON.parse(evt.data as string)

        if (f.type === 'event' && f.event === 'connect.challenge') {
          ws.send(JSON.stringify({
            type: 'req', id: randomUUID(), method: 'connect',
            params: {
              minProtocol: 3, maxProtocol: 3,
              client: { id: 'gateway-client', version: '1.0.0', platform: 'web', mode: 'ui' },
              role: 'operator', scopes: ['operator.read', 'operator.write'],
              caps: [], commands: [], permissions: {},
              auth: { password: PASSWORD }, locale: 'en-US', userAgent: 'mission-control/1.0.0',
            },
          }))
        } else if (!connected && f.type === 'res' && f.ok && f.payload?.type === 'hello-ok') {
          connected = true
          ws.send(JSON.stringify({
            type: 'req', id: randomUUID(), method: 'chat.send',
            params: {
              sessionKey: SESSION_KEY,
              message: text,
              attachments: attachments.length > 0 ? attachments : undefined,
              deliver: false,
              idempotencyKey: randomUUID(),
            },
          }))
        } else if (connected && f.type === 'res' && f.ok) {
          clearTimeout(timeout)
          ws.close()
          resolve({ ok: true })
        }
      } catch {}
    }

    ws.onerror = () => {
      clearTimeout(timeout)
      resolve({ ok: false, error: 'ws error' })
    }
    ws.onclose = () => { clearTimeout(timeout); if (!connected) resolve({ ok: false, error: 'closed early' }) }
  })
}

export async function POST(req: NextRequest) {
  let body: { text?: string; images?: unknown }
  try {
    body = await req.json()
  } catch (e) {
    console.error('[chat/POST] Failed to parse body:', e)
    return NextResponse.json({ error: 'bad json' }, { status: 400 })
  }
  const { text, images } = body
  const imgs: string[] = Array.isArray(images) ? images : []
  const txt: string    = (text as string)?.trim() ?? ''



  if (!txt && imgs.length === 0) {
    return NextResponse.json({ error: 'empty message' }, { status: 400 })
  }

  const result = await sendViaChatSend(txt, imgs)

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 })
  }
  return NextResponse.json({ ok: true })
}
