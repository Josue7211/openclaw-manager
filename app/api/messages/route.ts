import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { bbFetch, normalizePhone, getContactMap, CHAT_GUID_RE, MESSAGE_GUID_RE } from './_lib/bb'

export const dynamic = 'force-dynamic'

// Map string reaction names to numeric types (BB may return either format)
const REACTION_NAME_TO_TYPE: Record<string, number> = {
  love: 2000, like: 2001, dislike: 2002, laugh: 2003, emphasize: 2004, question: 2005,
  '-love': 3000, '-like': 3001, '-dislike': 3002, '-laugh': 3003, '-emphasize': 3004, '-question': 3005,
}

function normalizeReactionType(raw: unknown): number | null {
  if (typeof raw === 'number' && raw >= 2000) return raw
  if (typeof raw === 'string') return REACTION_NAME_TO_TYPE[raw] ?? null
  return null
}

// Process messages to separate reactions from regular messages and attach them
/* eslint-disable @typescript-eslint/no-explicit-any */
function processMessagesWithReactions(rawMessages: any[]): any[] {
  // Map: parentGuid -> Map<senderKey, { type, dateCreated }>
  const reactionMap = new Map<string, Map<string, { type: number; fromMe: boolean; handle?: string; dateCreated: number }>>()
  const regularMessages: any[] = []

  for (const msg of rawMessages) {
    const assocGuid = msg.associatedMessageGuid
    const reactionType = normalizeReactionType(msg.associatedMessageType)
    if (assocGuid && reactionType !== null) {
      // Reaction message — strip p:N/ or bp: prefix to get parent GUID
      const parentGuid = assocGuid.replace(/^(p|bp):\d+\//, '')
      const senderKey = msg.isFromMe ? '__me__' : (msg.handle?.address || 'unknown')

      if (!reactionMap.has(parentGuid)) reactionMap.set(parentGuid, new Map())
      const senderMap = reactionMap.get(parentGuid)!
      const existing = senderMap.get(senderKey)

      // Only keep the most recent reaction per sender per message
      if (!existing || msg.dateCreated > existing.dateCreated) {
        if (reactionType >= 3000) {
          // Remove reaction
          senderMap.delete(senderKey)
        } else {
          senderMap.set(senderKey, {
            type: reactionType,
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
  const before = searchParams.get('before')

  try {
    if (chatGuid) {
      // Fetch messages (extra to capture reactions) and contacts in parallel
      const requestedLimit = Math.max(1, Math.min(parseInt(limit, 10) || 25, 500))
      // Validate chatGuid format (service;type;identifier)
      if (!CHAT_GUID_RE.test(chatGuid)) {
        return NextResponse.json({ error: 'Invalid conversation ID' }, { status: 400 })
      }

      const queryBody: Record<string, unknown> = {
        chatGuid,
        limit: Math.min(requestedLimit * 4, 1000),
        offset: 0,
        sort: 'DESC',
        with: ['attachment', 'handle'],
      }
      if (before) {
        const beforeTs = parseInt(before, 10)
        if (!isNaN(beforeTs)) queryBody.before = beforeTs
      }

      const [rawMessages, contactMap] = await Promise.all([
        bbFetch('/message/query', {
          method: 'POST',
          body: JSON.stringify(queryBody),
        }),
        getContactMap(),
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
          limit: Math.max(1, Math.min(parseInt(limit, 10) || 25, 500)),
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
      getContactMap(),
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
      lastMessage?: { text?: string; dateCreated?: number; isFromMe?: boolean; dateRead?: number | null }
    }

    // Track per normalized ID: best chat entry (prefer iMessage) + newest date across all versions
    const bestChat = new Map<string, Record<string, unknown>>()
    const newestDate = new Map<string, { text: string | undefined; dateCreated: number | undefined; isFromMe: boolean | undefined; dateRead: number | null }>()

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
          dateRead: c.lastMessage?.dateRead ?? null,
        })
      }
    }

    // Supplement with recent messages that BB's chat query might miss
    type MessageRecord = {
      text?: string
      dateCreated?: number
      isFromMe?: boolean
      dateRead?: number | null
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

        if (!existing) {
          bestChat.set(normalizedId, chat as Record<string, unknown>)
        } else if (thisPriority > existingPriority) {
          // Preserve participants from the existing record (message query doesn't include them)
          const merged = { ...(chat as Record<string, unknown>) }
          if (!merged.participants && existing.participants) {
            merged.participants = existing.participants
          }
          bestChat.set(normalizedId, merged)
        }

        const msgDate = msg.dateCreated || 0
        const prevNewest = newestDate.get(normalizedId)
        if (!prevNewest || msgDate > (prevNewest.dateCreated || 0)) {
          newestDate.set(normalizedId, {
            text: msg.text,
            dateCreated: msg.dateCreated,
            isFromMe: msg.isFromMe,
            dateRead: msg.dateRead ?? null,
          })
        }
      }
    }

    // Build contact lookup for frontend
    const contactLookup: Record<string, string> = {}
    for (const [key, name] of contactMap.entries()) {
      contactLookup[key] = name
    }

    // Backfill participants for chats that came from recentMessages (which lack participant data).
    // For 1:1 chats, infer the participant from the chatIdentifier (phone/email).
    // For group chats missing participants, batch-fetch from BB.
    const missingParticipantGuids: string[] = []
    for (const [, entry] of bestChat) {
      const p = entry.participants
      const hasParticipants = Array.isArray(p) && p.length > 0
      if (!hasParticipants) {
        const chatId = (entry.chatIdentifier as string) || ''
        const guid = (entry.guid as string) || ''
        // Group chats have + in the GUID service separator (e.g. iMessage;+;chatXXX)
        const isGroup = guid.includes(';+;')
        if (isGroup) {
          missingParticipantGuids.push(guid)
        } else if (chatId) {
          // 1:1 chat — infer participant from chatIdentifier
          // macOS 26+ uses 'any;-;' for all GUIDs — default to iMessage
          const guidService = guid.split(';')[0]
          const service = (guidService && guidService !== 'any') ? guidService : 'iMessage'
          entry.participants = [{ address: chatId, service }]
        }
      }
    }

    // Batch-fetch participants for group chats missing them
    if (missingParticipantGuids.length > 0) {
      // Use BB chat query with participants (individual endpoint returns empty on macOS 26+)
      const fetches = missingParticipantGuids.map(guid =>
        bbFetch('/chat/query', {
          method: 'POST',
          body: JSON.stringify({ guid, with: ['participants'] }),
        }).then((data: unknown) => {
          const arr = Array.isArray(data) ? data : []
          return arr[0] ?? null
        }).catch(() => null)
      )
      const results = await Promise.all(fetches)
      const groupParticipantsMap = new Map<string, { address: string; service: string }[]>()
      for (let i = 0; i < results.length; i++) {
        const chatData = results[i]
        if (chatData?.participants?.length > 0) {
          groupParticipantsMap.set(missingParticipantGuids[i], chatData.participants)
        }
      }

      // For group chats where BB returned no participants, infer from recent message handles
      const stillMissing = missingParticipantGuids.filter(g => !groupParticipantsMap.has(g))
      if (stillMissing.length > 0) {
        const msgFetches = stillMissing.map(guid =>
          bbFetch('/message/query', {
            method: 'POST',
            body: JSON.stringify({ chatGuid: guid, limit: 50, sort: 'DESC', with: ['handle'] }),
          }).catch(() => [])
        )
        const msgResults = await Promise.all(msgFetches)
        for (let i = 0; i < stillMissing.length; i++) {
          const msgs = msgResults[i] ?? []
          const seen = new Set<string>()
          const inferred: { address: string; service: string }[] = []
          for (const m of msgs) {
            const addr = m.handle?.address
            // Use the handle's actual service (iMessage/SMS/RCS) — not the GUID prefix
            // macOS 26+ uses 'any;' for all GUIDs but handles still report correct service
            const handleSvc = m.handle?.service || ''
            if (addr && !seen.has(addr)) {
              seen.add(addr)
              inferred.push({ address: addr, service: handleSvc })
            }
          }
          if (inferred.length > 0) {
            groupParticipantsMap.set(stillMissing[i], inferred)
          }
        }
      }

      // Patch bestChat entries
      for (const [, entry] of bestChat) {
        if (!Array.isArray(entry.participants) || (entry.participants as unknown[]).length === 0) {
          const guid = (entry.guid as string) || ''
          const fetched = groupParticipantsMap.get(guid)
          if (fetched) entry.participants = fetched
        }
      }
    }

    // Build final conversations using best chat + newest date
    const conversations = Array.from(bestChat.entries()).map(([normalizedId, c]) => {
      const rawParticipants = c.participants
      const participants = Array.isArray(rawParticipants)
        ? rawParticipants.map((p: Record<string, unknown>) => ({ address: String(p.address || ''), service: String(p.service || '') }))
        : []
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

      // Unread = last message is incoming and has no dateRead
      const isUnread = newest && !newest.isFromMe && !newest.dateRead

      return {
        guid: c.guid as string,
        chatId,
        displayName,
        participants,
        service: (() => {
          // Resolve real service — macOS 26+ uses 'any' prefix for all GUIDs
          // Participants still report correct service (iMessage/SMS/RCS)
          const partSvc = participants[0]?.service?.toLowerCase() || ''
          if (partSvc && partSvc !== 'any') return participants[0].service
          const guidPrefix = ((c.guid as string) || '').split(';')[0]?.toLowerCase() || ''
          if (guidPrefix && guidPrefix !== 'any') return guidPrefix
          // 'any' with no explicit SMS → iMessage (macOS 26+ default)
          const hasSms = participants.some(p => p.service?.toLowerCase() === 'sms')
          const hasRcs = participants.some(p => p.service?.toLowerCase() === 'rcs')
          if (hasSms) return 'SMS'
          if (hasRcs) return 'RCS'
          return 'iMessage'
        })(),
        lastMessage: newest?.text || null,
        lastDate: newest?.dateCreated || null,
        lastFromMe: newest?.isFromMe ? 1 : 0,
        isUnread: !!isUnread,
      }
    })

    // Sort by most recent message
    conversations.sort((a, b) => (b.lastDate || 0) - (a.lastDate || 0))

    return NextResponse.json({ conversations, contacts: contactLookup })
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err)
    if (raw === 'bluebubbles_not_configured') {
      return NextResponse.json({ error: 'bluebubbles_not_configured', conversations: [] })
    }
    console.error('Messages API error:', raw)
    return NextResponse.json({ error: 'Backend service error' }, { status: 502 })
  }
}

// POST /api/messages — send a message
export async function POST(req: Request) {
  try {
    const { chatGuid, text, selectedMessageGuid } = await req.json()
    if (!chatGuid || !text || typeof chatGuid !== 'string' || typeof text !== 'string') {
      return NextResponse.json({ error: 'chatGuid and text required' }, { status: 400 })
    }
    if (!CHAT_GUID_RE.test(chatGuid)) {
      return NextResponse.json({ error: 'Invalid conversation ID' }, { status: 400 })
    }
    if (text.length > 10000) {
      return NextResponse.json({ error: 'Message too long' }, { status: 400 })
    }
    if (selectedMessageGuid !== undefined && selectedMessageGuid !== null) {
      if (typeof selectedMessageGuid !== 'string' || !MESSAGE_GUID_RE.test(selectedMessageGuid)) {
        return NextResponse.json({ error: 'Invalid reply message GUID' }, { status: 400 })
      }
    }

    const result = await bbFetch('/message/text', {
      method: 'POST',
      body: JSON.stringify({
        chatGuid,
        tempGuid: `temp-${randomUUID()}`,
        message: text,
        ...(selectedMessageGuid ? { selectedMessageGuid } : {}),
      }),
    })
    return NextResponse.json({ ok: true, message: result })
  } catch (err) {
    console.error('Send message error:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Failed to send message' }, { status: 502 })
  }
}
