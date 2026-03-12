import { NextResponse } from 'next/server'
import { BB_HOST, bbFetch, CHAT_GUID_RE, MESSAGE_GUID_RE, VALID_REACTIONS } from '../_lib/bb'

export const dynamic = 'force-dynamic'

// POST /api/messages/react — send a tapback reaction (requires Private API)
export async function POST(req: Request) {
  if (!BB_HOST) {
    return NextResponse.json({ error: 'bluebubbles_not_configured' }, { status: 500 })
  }

  try {
    const { chatGuid, selectedMessageGuid, reaction } = await req.json()

    if (!chatGuid || !selectedMessageGuid || !reaction ||
        typeof chatGuid !== 'string' || typeof selectedMessageGuid !== 'string' || typeof reaction !== 'string') {
      return NextResponse.json(
        { error: 'chatGuid, selectedMessageGuid, and reaction are required' },
        { status: 400 },
      )
    }

    if (!CHAT_GUID_RE.test(chatGuid) || !MESSAGE_GUID_RE.test(selectedMessageGuid)) {
      return NextResponse.json({ error: 'Invalid GUID format' }, { status: 400 })
    }

    if (!(VALID_REACTIONS as readonly string[]).includes(reaction)) {
      return NextResponse.json({ error: 'Invalid reaction type' }, { status: 400 })
    }

    await bbFetch('/message/react', {
      method: 'POST',
      body: JSON.stringify({ chatGuid, selectedMessageGuid, reaction }),
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('React endpoint error:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Reaction failed' }, { status: 502 })
  }
}
