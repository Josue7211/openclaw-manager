import { NextRequest, NextResponse } from 'next/server'
import { openclawChatSend, saveImageToDisk } from '@/lib/openclaw'

async function sendViaChatSend(text: string, images: string[] = [], deliver = false): Promise<{ ok: boolean; error?: string }> {
  const attachments = images.flatMap((dataUrl) => {
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
    if (!match) return []
    return [{ mimeType: match[1], content: match[2] }]
  })
  return openclawChatSend({
    sessionKey: 'main',
    message: text,
    attachments: attachments.length > 0 ? attachments : undefined,
    deliver,
    clientMode: 'ui',
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

  // Save images to disk so they survive the pipeline even when the routing model has no vision
  const savedPaths: string[] = []
  for (const img of imgs) {
    const saved = saveImageToDisk(img)
    if (saved) savedPaths.push(saved)
  }

  // Inject image path annotations into text so Bjorn (text-only) can reference them when routing
  let annotatedText = txt
  if (savedPaths.length > 0) {
    const annotations = savedPaths.map(p => `[Attached image: ${p}]`).join('\n')
    annotatedText = annotatedText ? `${annotatedText}\n${annotations}` : annotations
  }

  // For /new and /reset commands, deliver: true to hit OpenClaw's inbound pipeline
  const shouldDeliver = txt === '/new' || txt === '/reset'
  const result = await sendViaChatSend(annotatedText, imgs, shouldDeliver)

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 })
  }
  return NextResponse.json({ ok: true })
}
