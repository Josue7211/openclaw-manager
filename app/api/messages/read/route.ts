import { NextResponse } from 'next/server'
import { BB_HOST, BB_PASSWORD, CHAT_GUID_RE } from '../_lib/bb'

export const dynamic = 'force-dynamic'

// POST /api/messages/read — mark a chat as read or unread via BB Private API
export async function POST(req: Request) {
  try {
    const { chatGuid, action = 'read' } = await req.json()

    if (!chatGuid || typeof chatGuid !== 'string') {
      return NextResponse.json({ error: 'chatGuid is required' }, { status: 400 })
    }
    if (!CHAT_GUID_RE.test(chatGuid)) {
      return NextResponse.json({ error: 'Invalid conversation ID' }, { status: 400 })
    }
    if (action !== 'read' && action !== 'unread') {
      return NextResponse.json({ error: 'action must be "read" or "unread"' }, { status: 400 })
    }
    if (!BB_HOST) {
      return NextResponse.json({ error: 'BlueBubbles not configured' }, { status: 500 })
    }

    const endpoint = action === 'unread' ? 'unread' : 'read'
    const url = `${BB_HOST}/api/v1/chat/${encodeURIComponent(chatGuid)}/${endpoint}?password=${encodeURIComponent(BB_PASSWORD)}`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })

    if (res.ok) {
      return NextResponse.json({ ok: true })
    }

    console.error(`BlueBubbles mark-${endpoint} ${res.status}: ${await res.text().catch(() => '')}`)
    return NextResponse.json({ error: `Failed to mark as ${endpoint}` }, { status: 502 })
  } catch (err) {
    console.error('Mark read/unread error:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Failed to update read status' }, { status: 502 })
  }
}
