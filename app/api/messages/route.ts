import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'

export const dynamic = 'force-dynamic'

const BB_HOST = process.env.BLUEBUBBLES_HOST || ''
const BB_PASSWORD = process.env.BLUEBUBBLES_PASSWORD || ''

async function bbFetch(path: string, opts?: RequestInit & { body?: string }) {
  if (!BB_HOST) throw new Error('bluebubbles_not_configured')
  const sep = path.includes('?') ? '&' : '?'
  const url = `${BB_HOST}/api/v1${path}${sep}password=${encodeURIComponent(BB_PASSWORD)}`
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const res = await fetch(url, { ...opts, headers })
  if (!res.ok) throw new Error(`BlueBubbles ${res.status}: ${await res.text().catch(() => '')}`)
  const json = await res.json()
  if (json.status !== 200) throw new Error(json.error?.message || json.message || 'Unknown error')
  return json.data
}

// Normalize a phone number to digits-only for matching
function normalizePhone(addr: string): string {
  const digits = addr.replace(/\D/g, '')
  // Strip leading 1 for US numbers (11 digits → 10)
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1)
  return digits
}

// Build a map: normalized phone/email → displayName
async function buildContactMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  try {
    const contacts = await bbFetch('/contact/query', {
      method: 'POST',
      body: JSON.stringify({ limit: 500 }),
    })
    for (const c of contacts ?? []) {
      const name = c.displayName || [c.firstName, c.lastName].filter(Boolean).join(' ')
      if (!name) continue
      for (const ph of c.phoneNumbers ?? []) {
        if (!ph.address) continue
        const normalized = normalizePhone(ph.address)
        // Skip entries that aren't real phone numbers (less than 7 digits)
        if (normalized.length < 7) continue
        map.set(normalized, name)
      }
      for (const em of c.emails ?? []) {
        if (em.address && em.address.includes('@')) map.set(em.address.toLowerCase(), name)
      }
    }
  } catch {
    // Contact lookup is best-effort
  }
  return map
}

// Process messages to separate reactions from regular messages and attach them
/* eslint-disable @typescript-eslint/no-explicit-any */
function processMessagesWithReactions(rawMessages: any[]): any[] {
  // Map: parentGuid -> Map<senderKey, { type, dateCreated }>
  const reactionMap = new Map<string, Map<string, { type: number; fromMe: boolean; handle?: string; dateCreated: number }>>()
  const regularMessages: any[] = []

  for (const msg of rawMessages) {
    const assocGuid = msg.associatedMessageGuid
    const assocType = msg.associatedMessageType
    if (assocGuid && assocType != null && assocType >= 2000) {
      // Reaction message — strip p:N/ or bp: prefix to get parent GUID
      const parentGuid = assocGuid.replace(/^(p|bp):\d+\//, '')
      const senderKey = msg.isFromMe ? '__me__' : (msg.handle?.address || 'unknown')

      if (!reactionMap.has(parentGuid)) reactionMap.set(parentGuid, new Map())
      const senderMap = reactionMap.get(parentGuid)!
      const existing = senderMap.get(senderKey)

      // Only keep the most recent reaction per sender per message
      if (!existing || msg.dateCreated > existing.dateCreated) {
        if (assocType >= 3000) {
          // Remove reaction
          senderMap.delete(senderKey)
        } else {
          senderMap.set(senderKey, {
            type: assocType,
            fromMe: !!msg.isFromMe,
            handle: msg.isFromMe ? undefined : msg.handle?.address,
            dateCreated: msg.dateCreated,
          })
        }
      }
    } else {
      regularMessages.push(msg)
    }
  }

  // Attach reactions to their parent messages
  for (const msg of regularMessages) {
    const reactions = reactionMap.get(msg.guid)
    if (reactions && reactions.size > 0) {
      msg.reactions = Array.from(reactions.values()).map(r => ({
        type: r.type,
        fromMe: r.fromMe,
        handle: r.handle,
      }))
    }
  }

  return regularMessages
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// GET /api/messages — list conversations or get messages for a conversation
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const chatGuid = searchParams.get('conversation')
  const limit = searchParams.get('limit') || '25'

  try {
    if (chatGuid) {
      // Fetch messages (extra to capture reactions) and contacts in parallel
      const requestedLimit = parseInt(limit)
      const [rawMessages, contactMap] = await Promise.all([
        bbFetch('/message/query', {
          method: 'POST',
          body: JSON.stringify({
            chatGuid,
            limit: Math.min(requestedLimit * 2, 500),
            offset: 0,
            sort: 'DESC',
            with: ['attachment', 'handle'],
          }),
        }),
        buildContactMap(),
      ])

      // Process: reverse to chronological, extract reactions, attach to parent msgs
      const reversed = (rawMessages ?? []).reverse()
      const messages = processMessagesWithReactions(reversed)

      // Build a contacts lookup for the frontend (address → name)
      const contactLookup: Record<string, string> = {}
      for (const [key, name] of contactMap.entries()) {
        contactLookup[key] = name
      }

      return NextResponse.json({
        messages,
        contacts: contactLookup,
      })
    }

    // Fetch conversations, recent messages, and contacts in parallel
    const [chats, recentMessages, contactMap] = await Promise.all([
      bbFetch('/chat/query', {
        method: 'POST',
        body: JSON.stringify({
          limit: Math.min(parseInt(limit), 500),
          offset: 0,
          sort: 'lastmessage',
          with: ['lastMessage', 'participants'],
        }),
      }),
      // Also fetch recent messages to find active chats BB's query misses
      bbFetch('/message/query', {
        method: 'POST',
        body: JSON.stringify({
          limit: 1000,
          sort: 'DESC',
          after: Date.now() - 30 * 24 * 60 * 60 * 1000, // last 30 days
          with: ['chat'],
        }),
      }).catch(() => []),
      buildContactMap(),
    ])

    // Service priority: iMessage > RCS > SMS > other
    function servicePriority(guid: string): number {
      if (guid?.startsWith('iMessage;')) return 3
      if (guid?.startsWith('RCS;')) return 2
      if (guid?.startsWith('SMS;')) return 1
      return 0
    }

    // Build conversation map — keyed by normalized phone/email
    // For each number, keep: the best service version (for display) + the newest lastMessage date
    type ChatRecord = Record<string, unknown> & {
      participants?: { address: string; service: string }[]
      lastMessage?: { text?: string; dateCreated?: number; isFromMe?: boolean }
    }

    // Track per normalized ID: best chat entry (prefer iMessage) + newest date across all versions
    const bestChat = new Map<string, Record<string, unknown>>()
    const newestDate = new Map<string, { text?: string; dateCreated?: number; isFromMe?: boolean }>()

    for (const c of (chats ?? []) as ChatRecord[]) {
      const chatId = (c.chatIdentifier as string) || ''
      const normalizedId = normalizePhone(chatId) || chatId.toLowerCase()
      if (!normalizedId) continue

      const existing = bestChat.get(normalizedId)
      const existingPriority = existing ? servicePriority(existing.guid as string) : -1
      const thisPriority = servicePriority(c.guid as string)

      // Always keep the highest-priority service version (iMessage > SMS)
      if (!existing || thisPriority > existingPriority) {
        bestChat.set(normalizedId, c as Record<string, unknown>)
      }

      // Track the newest lastMessage across ALL versions of this chat
      const thisDate = c.lastMessage?.dateCreated || 0
      const prevNewest = newestDate.get(normalizedId)
      if (!prevNewest || thisDate > (prevNewest.dateCreated || 0)) {
        newestDate.set(normalizedId, {
          text: c.lastMessage?.text,
          dateCreated: c.lastMessage?.dateCreated,
          isFromMe: c.lastMessage?.isFromMe,
        })
      }
    }

    // Supplement with recent messages that BB's chat query might miss
    type MessageRecord = {
      text?: string
      dateCreated?: number
      isFromMe?: boolean
      chats?: ChatRecord[]
    }
    for (const msg of (recentMessages ?? []) as MessageRecord[]) {
      for (const chat of msg.chats ?? []) {
        const chatId = (chat.chatIdentifier as string) || ''
        const normalizedId = normalizePhone(chatId) || chatId.toLowerCase()
        if (!normalizedId) continue

        const existing = bestChat.get(normalizedId)
        const existingPriority = existing ? servicePriority(existing.guid as string) : -1
        const thisPriority = servicePriority(chat.guid as string)

        if (!existing || thisPriority > existingPriority) {
          bestChat.set(normalizedId, chat as Record<string, unknown>)
        }

        const msgDate = msg.dateCreated || 0
        const prevNewest = newestDate.get(normalizedId)
        if (!prevNewest || msgDate > (prevNewest.dateCreated || 0)) {
          newestDate.set(normalizedId, {
            text: msg.text,
            dateCreated: msg.dateCreated,
            isFromMe: msg.isFromMe,
          })
        }
      }
    }

    // Build contact lookup for frontend
    const contactLookup: Record<string, string> = {}
    for (const [key, name] of contactMap.entries()) {
      contactLookup[key] = name
    }

    // Build final conversations using best chat + newest date
    const conversations = Array.from(bestChat.entries()).map(([normalizedId, c]) => {
      const participants = (c.participants as { address: string; service: string }[]) ?? []
      const chatId = (c.chatIdentifier as string) || ''
      const newest = newestDate.get(normalizedId)

      // Resolve display name from contacts
      let displayName = (c.displayName as string) || null
      if (!displayName && participants.length === 1) {
        const addr = participants[0].address
        displayName = contactMap.get(normalizePhone(addr))
          || contactMap.get(addr.toLowerCase())
          || null
      }
      if (!displayName && chatId) {
        displayName = contactMap.get(normalizePhone(chatId))
          || contactMap.get(chatId.toLowerCase())
          || null
      }

      return {
        guid: c.guid as string,
        chatId,
        displayName,
        participants,
        service: (c.guid as string)?.split(';')[0] || participants[0]?.service || 'iMessage',
        lastMessage: newest?.text || null,
        lastDate: newest?.dateCreated || null,
        lastFromMe: newest?.isFromMe ? 1 : 0,
      }
    })

    // Sort by most recent message
    conversations.sort((a, b) => (b.lastDate || 0) - (a.lastDate || 0))

    return NextResponse.json({ conversations, contacts: contactLookup })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg === 'bluebubbles_not_configured') {
      return NextResponse.json({ error: 'bluebubbles_not_configured', conversations: [] })
    }
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}

// POST /api/messages — send a message
export async function POST(req: Request) {
  try {
    const { chatGuid, text } = await req.json()
    if (!chatGuid || !text) return NextResponse.json({ error: 'chatGuid and text required' }, { status: 400 })

    const result = await bbFetch('/message/text', {
      method: 'POST',
      body: JSON.stringify({
        chatGuid,
        tempGuid: `temp-${randomUUID()}`,
        message: text,
      }),
    })
    return NextResponse.json({ ok: true, message: result })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
