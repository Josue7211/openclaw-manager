import { useEffect, useRef, useState } from 'react'
import { API_BASE } from '@/lib/api'
import { playNotificationChime } from '@/lib/audio'
import { addNotification } from '@/components/NotificationCenter'
import { emit } from '@/lib/event-bus'
import { cleanPayloadText } from './shared'

export interface SSEMessage {
  guid: string
  text: string
  dateCreated: number
  isFromMe: boolean
  handle?: { address: string; service: string }
  attachments?: { guid: string; mimeType: string; transferName: string; isSticker?: boolean; uti?: string }[]
  chats?: { guid: string }[]
  [key: string]: unknown
}

// Track recently notified message GUIDs to prevent spam
const notifiedGuids = new Set<string>()
const MAX_NOTIFIED = 200

interface SSEEvent {
  type: string
  data: SSEMessage
}

interface UseMessagesSSEParams {
  selectedGuidRef: React.MutableRefObject<string | null>
  mutedConvsRef: React.MutableRefObject<string[]>
  contactLookupRef: React.MutableRefObject<Record<string, string>>
  onNewMessage: (msg: SSEMessage, chatGuids: string[]) => void
  onUpdateMessage: (msg: SSEMessage) => void
  onRefreshConvos: () => void
}

interface ToastData {
  sender: string
  text: string
  chatGuid?: string
  count: number
}

export function useMessagesSSE({
  selectedGuidRef: _selectedGuidRef,
  mutedConvsRef,
  contactLookupRef,
  onNewMessage,
  onUpdateMessage,
  onRefreshConvos,
}: UseMessagesSSEParams) {
  const [sseConnected, setSseConnected] = useState(false)
  const [toast, setToast] = useState<ToastData | null>(null)
  const toastTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Request notification permission on mount
  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {})
    }
  }, [])

  // Keep callbacks in refs so the SSE effect doesn't re-run when they change
  const onNewMessageRef = useRef(onNewMessage)
  onNewMessageRef.current = onNewMessage
  const onUpdateMessageRef = useRef(onUpdateMessage)
  onUpdateMessageRef.current = onUpdateMessage
  const onRefreshConvosRef = useRef(onRefreshConvos)
  onRefreshConvosRef.current = onRefreshConvos

  useEffect(() => {
    let es: EventSource | null = null
    let retryTimeout: ReturnType<typeof setTimeout> | null = null
    let retryDelay = 3000
    let connected = false
    let debounceTimer: ReturnType<typeof setTimeout> | null = null

    function debouncedRefreshConvos() {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => onRefreshConvosRef.current(), 2000)
    }

    function connect() {
      es = new EventSource(`${API_BASE}/api/messages/stream`)
      es.onmessage = async (ev) => {
        try {
          const event: SSEEvent = JSON.parse(ev.data)
          if (event.type === 'connected') {
            connected = true
            setSseConnected(true)
            emit('connection-status', { connected: true }, 'sse')
            retryDelay = 3000
          } else if (event.type === 'new-message') {
            const msg = event.data
            const msgChats = msg.chats?.map((c: { guid: string }) => c.guid) ?? []
            onNewMessageRef.current(msg, msgChats)

            const senderAddr = msg.handle?.address || ''

            // Publish to event bus
            emit('new-message', { guid: msg.guid, sender: senderAddr, chatGuids: msgChats }, 'sse')

            // Notification for incoming messages (deduplicated by GUID)
            if (!msg.isFromMe && !notifiedGuids.has(msg.guid)) {
              notifiedGuids.add(msg.guid)
              if (notifiedGuids.size > MAX_NOTIFIED) {
                const first = notifiedGuids.values().next().value
                if (first) notifiedGuids.delete(first)
              }

              // Try exact match, then normalized (strip leading +/1)
              const normalize = (s: string) => s.replace(/^\+?1?/, '').replace(/\D/g, '')
              let senderName = contactLookupRef.current[senderAddr]
              if (!senderName) {
                const norm = normalize(senderAddr)
                for (const [k, v] of Object.entries(contactLookupRef.current)) {
                  if (normalize(k) === norm) { senderName = v; break }
                }
              }
              if (!senderName) senderName = senderAddr
              const preview = cleanPayloadText(msg.text).slice(0, 80) || 'New message'
              const dnd = localStorage.getItem('dnd-enabled') === 'true'
              const isMuted = msgChats.some(g => mutedConvsRef.current.includes(g))

              if (!dnd && !isMuted) {
                // Sound chime
                if (localStorage.getItem('notif-sound') !== 'false') {
                  playNotificationChime()
                }

                // In-app toast banner
                if (localStorage.getItem('in-app-notifs') !== 'false') {
                  if (toastTimeout.current) clearTimeout(toastTimeout.current)
                  setToast(prev => {
                    if (prev && prev.sender === senderName) {
                      return { sender: senderName, text: preview, chatGuid: msgChats[0], count: prev.count + 1 }
                    }
                    return { sender: senderName, text: preview, chatGuid: msgChats[0], count: 1 }
                  })
                  toastTimeout.current = setTimeout(() => setToast(null), 4000)
                }

                // System notification
                if (localStorage.getItem('system-notifs') !== 'false' && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
                  new Notification(senderName, { body: preview, tag: 'mc-msg-' + msg.guid })
                }

                // Unified notification center
                addNotification('message', senderName || 'Unknown', preview, '/messages')
              }
            }
            debouncedRefreshConvos()
          } else if (event.type === 'updated-message') {
            onUpdateMessageRef.current(event.data)
          } else if (event.type === 'chat-read') {
            emit('message-read', null, 'sse')
            debouncedRefreshConvos()
          }
        } catch { /* ignore */ }
      }
      es.onerror = () => {
        connected = false
        setSseConnected(false)
        emit('connection-status', { connected: false }, 'sse')
        es?.close()
        retryTimeout = setTimeout(connect, retryDelay)
        retryDelay = Math.min(retryDelay * 2, 30000)
      }
    }

    connect()
    const convPoll = setInterval(() => {
      if (!connected) onRefreshConvosRef.current()
    }, 60000)

    return () => {
      es?.close()
      if (retryTimeout) clearTimeout(retryTimeout)
      if (debounceTimer) clearTimeout(debounceTimer)
      if (toastTimeout.current) clearTimeout(toastTimeout.current)
      clearInterval(convPoll)
    }
  }, []) // stable — uses refs for all callbacks

  const dismissToast = () => setToast(null)

  return { sseConnected, toast, dismissToast }
}
