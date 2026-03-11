import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const BB_HOST = process.env.BLUEBUBBLES_HOST || ''
const BB_PASSWORD = process.env.BLUEBUBBLES_PASSWORD || ''

// POST /api/messages/react — send a tapback reaction (requires Private API)
export async function POST(req: Request) {
  if (!BB_HOST) {
    return NextResponse.json({ error: 'bluebubbles_not_configured' }, { status: 500 })
  }

  try {
    const { chatGuid, selectedMessageGuid, reaction } = await req.json()

    if (!chatGuid || !selectedMessageGuid || !reaction) {
      return NextResponse.json(
        { error: 'chatGuid, selectedMessageGuid, and reaction are required' },
        { status: 400 },
      )
    }

    // Validate reaction type
    const validReactions = [
      'love', 'like', 'dislike', 'laugh', 'emphasize', 'question',
      '-love', '-like', '-dislike', '-laugh', '-emphasize', '-question',
    ]
    if (!validReactions.includes(reaction)) {
      return NextResponse.json({ error: `Invalid reaction: ${reaction}` }, { status: 400 })
    }

    const url = `${BB_HOST}/api/v1/message/react?password=${encodeURIComponent(BB_PASSWORD)}`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chatGuid,
        selectedMessageGuid,
        reaction,
      }),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return NextResponse.json({ error: `BlueBubbles ${res.status}: ${text}` }, { status: 502 })
    }

    const json = await res.json()
    if (json.status !== 200) {
      return NextResponse.json(
        { error: json.error?.message || json.message || 'Reaction failed' },
        { status: 502 },
      )
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
