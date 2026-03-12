import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'

// ── Centralized OpenClaw config ─────────────────────────────────────────────

export const OPENCLAW_DIR = path.join(process.env.HOME || '/home/aparcedodev', '.openclaw')
export const OPENCLAW_WS = process.env.OPENCLAW_WS || 'ws://127.0.0.1:18789'
export const OPENCLAW_GATEWAY = OPENCLAW_WS.replace('ws://', 'http://').replace('wss://', 'https://')
export const OPENCLAW_PASSWORD = process.env.OPENCLAW_PASSWORD || ''
export const CHAT_IMAGES_DIR = path.join(OPENCLAW_DIR, 'media/chat-images')

const SAFE_IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp'])

// ── Session file lookup ─────────────────────────────────────────────────────

export function getSessionFile(): string | null {
  try {
    const idx = JSON.parse(fs.readFileSync(path.join(OPENCLAW_DIR, 'agents/main/sessions/sessions.json'), 'utf-8'))
    const sessionId = idx['agent:main:main']?.sessionId
    if (!sessionId) return null
    return path.join(OPENCLAW_DIR, `agents/main/sessions/${sessionId}.jsonl`)
  } catch { return null }
}

// ── Image saving ────────────────────────────────────────────────────────────

export function saveImageToDisk(dataUrl: string): string | null {
  const match = dataUrl.match(/^data:image\/([^;]+);base64,(.+)$/)
  if (!match) return null
  const rawExt = match[1] === 'jpeg' ? 'jpg' : match[1]
  if (!SAFE_IMAGE_EXTS.has(rawExt)) return null
  const base64 = match[2]
  const filename = `${randomUUID()}.${rawExt}`
  const filepath = path.join(CHAT_IMAGES_DIR, filename)
  fs.mkdirSync(CHAT_IMAGES_DIR, { recursive: true })
  fs.writeFileSync(filepath, Buffer.from(base64, 'base64'))
  return filepath
}

// ── Shared WebSocket chat.send helper ───────────────────────────────────────

export interface ChatSendOptions {
  sessionKey?: string
  message: string
  attachments?: { mimeType: string; content: string }[]
  deliver?: boolean
  timeoutMs?: number
  clientMode?: 'backend' | 'ui'
}

export async function openclawChatSend(opts: ChatSendOptions): Promise<{ ok: boolean; error?: string }> {
  const {
    sessionKey = 'main',
    message,
    attachments,
    deliver = false,
    timeoutMs = 15000,
    clientMode = 'backend',
  } = opts

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      try { ws.close() } catch {}
      resolve({ ok: false, error: 'timeout' })
    }, timeoutMs)

    const ws = new WebSocket(OPENCLAW_WS)
    let connected = false

    ws.onmessage = (evt: MessageEvent) => {
      try {
        const f = JSON.parse(evt.data as string)

        if (f.type === 'event' && f.event === 'connect.challenge') {
          ws.send(JSON.stringify({
            type: 'req', id: randomUUID(), method: 'connect',
            params: {
              minProtocol: 3, maxProtocol: 3,
              client: { id: 'gateway-client', version: '1.0.0', platform: 'linux', mode: clientMode },
              role: 'operator', scopes: ['operator.read', 'operator.write'],
              caps: [], commands: [], permissions: {},
              auth: { password: OPENCLAW_PASSWORD }, locale: 'en-US', userAgent: 'mission-control/1.0.0',
            },
          }))
        } else if (!connected && f.type === 'res' && f.ok && f.payload?.type === 'hello-ok') {
          connected = true
          ws.send(JSON.stringify({
            type: 'req', id: randomUUID(), method: 'chat.send',
            params: {
              sessionKey,
              message,
              attachments: attachments && attachments.length > 0 ? attachments : undefined,
              deliver,
              idempotencyKey: randomUUID(),
            },
          }))
        } else if (connected && f.type === 'res') {
          clearTimeout(timeout)
          ws.close()
          resolve({ ok: f.ok, error: f.ok ? undefined : f.error?.message })
        }
      } catch {}
    }

    ws.onerror = () => { clearTimeout(timeout); resolve({ ok: false, error: 'ws error' }) }
    ws.onclose = () => { clearTimeout(timeout); if (!connected) resolve({ ok: false, error: 'closed early' }) }
  })
}
