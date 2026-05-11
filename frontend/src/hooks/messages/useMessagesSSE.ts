import { useEffect, useRef, useState } from 'react'
import { api, getRequestBaseForPath } from '@/lib/api'
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
  onTyping: (chatGuids: string[], payload: SSEMessage) => void
  onRefreshConvos: () => void
  onReconnectRefresh?: () => void
}

interface ToastData {
  sender: string
  text: string
  chatGuid?: string
  count: number
}

const SSE_INITIAL_RETRY_MS = 3000
const SSE_MAX_RETRY_MS = 30000
const SSE_HEALTHCHECK_MS = 15000
const SSE_STALE_AFTER_MS = 45000
const SSE_WAKE_SKEW_MS = 25000
const SSE_RECONNECT_COOLDOWN_MS = 2500

export function useMessagesSSE({
  selectedGuidRef: _selectedGuidRef,
  mutedConvsRef,
  contactLookupRef,
  onNewMessage,
  onUpdateMessage,
  onTyping,
  onRefreshConvos,
  onReconnectRefresh,
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
  const onTypingRef = useRef(onTyping)
  onTypingRef.current = onTyping
  const onRefreshConvosRef = useRef(onRefreshConvos)
  onRefreshConvosRef.current = onRefreshConvos
  const onReconnectRefreshRef = useRef(onReconnectRefresh)
  onReconnectRefreshRef.current = onReconnectRefresh

  useEffect(() => {
    let es: EventSource | null = null
    let retryTimeout: ReturnType<typeof setTimeout> | null = null
    let retryDelay = SSE_INITIAL_RETRY_MS
    let connected = false
    let debounceTimer: ReturnType<typeof setTimeout> | null = null
    let healthTimer: ReturnType<typeof setInterval> | null = null
    let convPoll: ReturnType<typeof setInterval> | null = null
    let disposed = false
    let connecting = false
    let lastEventAt = Date.now()
    let lastHealthTickAt = Date.now()
    let lastReconnectAt = 0

    function debouncedRefreshConvos() {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => onRefreshConvosRef.current(), 2000)
    }

    function markDisconnected() {
      if (!connected || disposed) return
      connected = false
      setSseConnected(false)
      emit('connection-status', { connected: false }, 'sse')
    }

    function closeStream() {
      es?.close()
      es = null
      markDisconnected()
    }

    function runCatchUp() {
      try {
        onReconnectRefreshRef.current?.()
      } catch {
        onRefreshConvosRef.current()
      }
    }

    function scheduleReconnect(delay = retryDelay, catchUp = false) {
      if (disposed) return
      if (retryTimeout) clearTimeout(retryTimeout)
      if (catchUp) runCatchUp()
      retryTimeout = setTimeout(() => {
        retryTimeout = null
        void connect()
      }, delay)
      if (delay >= retryDelay) retryDelay = Math.min(retryDelay * 2, SSE_MAX_RETRY_MS)
    }

    function forceReconnect(catchUp = true) {
      if (disposed) return
      const now = Date.now()
      if (now - lastReconnectAt < SSE_RECONNECT_COOLDOWN_MS) return
      lastReconnectAt = now
      closeStream()
      retryDelay = SSE_INITIAL_RETRY_MS
      scheduleReconnect(250, catchUp)
    }

    function refreshOrReconnect() {
      const stale = Date.now() - lastEventAt > SSE_STALE_AFTER_MS
      if (!es || es.readyState === EventSource.CLOSED || stale) {
        forceReconnect(true)
        return
      }
      runCatchUp()
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') refreshOrReconnect()
    }

    async function connect() {
      if (connecting || disposed) return
      connecting = true
      try {
        const path = '/api/messages/stream'
        const tokenResponse = await api.post<{ token?: string }>('/api/messages/stream-token', {})
        const token = tokenResponse.token?.trim()
        if (!token) throw new Error('Messages SSE token missing')
        if (disposed) return
        es?.close()
        es = new EventSource(`${getRequestBaseForPath(path)}${path}?sseToken=${encodeURIComponent(token)}`)
      } catch {
        connecting = false
        if (disposed) return
        scheduleReconnect()
        return
      }
      connecting = false
      es.onmessage = async (ev) => {
        lastEventAt = Date.now()
        try {
          const event: SSEEvent = JSON.parse(ev.data)
          if (event.type === 'connected') {
            const wasConnected = connected
            connected = true
            setSseConnected(true)
            emit('connection-status', { connected: true }, 'sse')
            retryDelay = SSE_INITIAL_RETRY_MS
            if (!wasConnected) runCatchUp()
          } else if (event.type === 'heartbeat') {
            if (!connected) {
              connected = true
              setSseConnected(true)
              emit('connection-status', { connected: true }, 'sse')
            }
            retryDelay = SSE_INITIAL_RETRY_MS
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
          } else if (event.type === 'typing') {
            const msg = event.data
            const chatGuids = msg.chats?.map((c: { guid: string }) => c.guid) ??
              [msg.chatGuid, msg.chat?.guid, msg.guid].filter((value): value is string => typeof value === 'string')
            onTypingRef.current(chatGuids, msg)
          } else if (event.type === 'refresh-convos') {
            debouncedRefreshConvos()
          }
        } catch { /* ignore */ }
      }
      es.onerror = () => {
        closeStream()
        scheduleReconnect()
      }
    }

    void connect()
    convPoll = setInterval(() => {
      if (!connected || Date.now() - lastEventAt > SSE_STALE_AFTER_MS) onRefreshConvosRef.current()
    }, 60000)

    healthTimer = setInterval(() => {
      const now = Date.now()
      const sleptOrThrottled = now - lastHealthTickAt > SSE_HEALTHCHECK_MS + SSE_WAKE_SKEW_MS
      lastHealthTickAt = now
      const stale = now - lastEventAt > SSE_STALE_AFTER_MS
      if (sleptOrThrottled || stale || !es || es.readyState === EventSource.CLOSED) {
        forceReconnect(true)
      }
    }, SSE_HEALTHCHECK_MS)

    window.addEventListener('focus', refreshOrReconnect)
    window.addEventListener('online', refreshOrReconnect)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      disposed = true
      es?.close()
      es = null
      if (retryTimeout) clearTimeout(retryTimeout)
      if (debounceTimer) clearTimeout(debounceTimer)
      if (healthTimer) clearInterval(healthTimer)
      if (convPoll) clearInterval(convPoll)
      if (toastTimeout.current) clearTimeout(toastTimeout.current)
      window.removeEventListener('focus', refreshOrReconnect)
      window.removeEventListener('online', refreshOrReconnect)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, []) // stable — uses refs for all callbacks

  const dismissToast = () => setToast(null)

  return { sseConnected, toast, dismissToast }
}
