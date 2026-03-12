import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { BB_HOST, BB_PASSWORD, CHAT_GUID_RE, MESSAGE_GUID_RE } from '../_lib/bb'

export const dynamic = 'force-dynamic'

// POST /api/messages/send-attachment — send an attachment via BlueBubbles
export async function POST(req: Request) {
  try {
    if (!BB_HOST) {
      return NextResponse.json({ error: 'BlueBubbles not configured' }, { status: 500 })
    }

    const formData = await req.formData()
    const chatGuid = formData.get('chatGuid') as string
    const file = formData.get('attachment') as File | null
    const message = (formData.get('message') as string) || ''
    const selectedMessageGuid = formData.get('selectedMessageGuid') as string | null

    if (!chatGuid || !CHAT_GUID_RE.test(chatGuid)) {
      return NextResponse.json({ error: 'Invalid chatGuid' }, { status: 400 })
    }
    if (!file) {
      return NextResponse.json({ error: 'attachment required' }, { status: 400 })
    }
    if (selectedMessageGuid && !MESSAGE_GUID_RE.test(selectedMessageGuid)) {
      return NextResponse.json({ error: 'Invalid reply GUID' }, { status: 400 })
    }
    // 50MB limit
    if (file.size > 50 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large (max 50MB)' }, { status: 400 })
    }

    // BB attachment API uses multipart
    const bbForm = new FormData()
    bbForm.append('chatGuid', chatGuid)
    bbForm.append('tempGuid', `temp-${randomUUID()}`)
    bbForm.append('name', file.name)
    if (message) bbForm.append('message', message)
    if (selectedMessageGuid) bbForm.append('selectedMessageGuid', selectedMessageGuid)

    // Convert File to Blob for Node fetch compatibility
    const buffer = await file.arrayBuffer()
    bbForm.append('attachment', new Blob([buffer], { type: file.type }), file.name)

    const url = `${BB_HOST}/api/v1/message/attachment?password=${encodeURIComponent(BB_PASSWORD)}`
    const res = await fetch(url, { method: 'POST', body: bbForm })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.error(`BB send-attachment ${res.status}: ${text}`)
      return NextResponse.json({ error: 'Failed to send attachment' }, { status: 502 })
    }

    const json = await res.json()
    return NextResponse.json({ ok: true, message: json.data })
  } catch (err) {
    console.error('Send attachment error:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Failed to send attachment' }, { status: 502 })
  }
}
