


import { useEffect, useRef, useState, useCallback, lazy, Suspense } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Send } from 'lucide-react'
import { type LightboxData } from '@/components/Lightbox'
const Lightbox = lazy(() => import('@/components/Lightbox'))
import { useLocalStorageState } from '@/lib/hooks/useLocalStorageState'
import { useChatSocket, type WsMessage } from '@/lib/hooks/useChatSocket'
import { api, ApiError } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import { PageHeader } from '@/components/PageHeader'
import { isDemoMode, DEMO_CHAT_MESSAGES } from '@/lib/demo-data'
import { DemoBadge } from '@/components/DemoModeBanner'

import { type ChatMessage, type OptimisticMsg, cleanMessages, isSlashCommand } from './chat/types'
import ChatThread from './chat/ChatThread'
import ChatInput from './chat/ChatInput'

export default function ChatPage() {
  const _demo = isDemoMode()
  const [messages, setMessages]   = useState<ChatMessage[]>(_demo ? DEMO_CHAT_MESSAGES : [])
  const [input, setInput]         = useState('')
  const [images, setImages]       = useState<string[]>([])
  const [sending, setSending]     = useState(false)
  const [connected, setConnected] = useState(_demo)
  const [mounted, setMounted]     = useState(_demo)
  const [lightbox, setLightbox]   = useState<LightboxData>(null)
  const [atBottom, setAtBottom]   = useState(true)
  const [optimistic, setOptimistic] = useState<OptimisticMsg[]>([])
  const [isTyping, setIsTyping]   = useState(false)
  const [systemMsg, setSystemMsg] = useState<string | null>(null)
  const [notConfigured, setNotConfigured] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [model, setModel] = useLocalStorageState('chat-model', 'claude-sonnet-4-6')
  const [sysPrompt, setSysPrompt] = useLocalStorageState('chat-system-prompt', '')
  const [showSysPrompt, setShowSysPrompt] = useState(false)
  const failCountRef              = useRef(0)
  const lastUserMsgTimeRef        = useRef<number>(0)
  const bottomRef                 = useRef<HTMLDivElement>(null)
  const scrollRef                 = useRef<HTMLDivElement>(null)
  const pendingReadsRef           = useRef<number>(0)       // count of in-progress FileReaders
  const pendingSendRef            = useRef<boolean>(false)   // send was requested while reads pending
  const pendingTextRef            = useRef<string>('')       // text saved when queued send fired
  const imagesRef                 = useRef<string[]>([])     // always-current mirror of images state
  const draftTimerRef              = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Keep imagesRef in sync with committed images state (safety net for normal send path) ──
  useEffect(() => { imagesRef.current = images }, [images])

  // ── Auto-scroll (only when already at bottom) ──
  useEffect(() => {
    if (atBottom) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, optimistic, isTyping, atBottom])

  // ── Load chat draft from localStorage on mount ──
  useEffect(() => {
    const draft = localStorage.getItem('chat-draft')
    if (draft) setInput(draft)
    try {
      const saved = localStorage.getItem('chat-draft-images')
      if (saved) {
        const parsed = JSON.parse(saved) as string[]
        if (Array.isArray(parsed) && parsed.length > 0) { imagesRef.current = parsed; setImages(() => parsed) }
      }
    } catch { /* ignore */ }
    return () => {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current)
    }
  }, [])

  // ── WebSocket + polling fallback ──
  const optimisticImageCacheRef = useRef<Map<string, string[]>>(new Map())
  const backoffRef = useRef(5000)

  // Helper: reconcile an array of incoming messages into state
  const reconcileMessages = useCallback((incoming: ChatMessage[]) => {
    setMessages(prev => {
      const existingIds = new Set(prev.map(m => m.id))
      const newMsgs = incoming.filter(m => !existingIds.has(m.id))
      if (newMsgs.length === 0) return prev
      return [...prev, ...newMsgs]
    })

    // Remove optimistic bubbles that now appear in real history
    const removeOptimistic = () => {
      setOptimistic(prev => {
        if (prev.length === 0) return prev
        const filtered = prev.filter(opt => {
          const historyMsg = incoming.find(m => m.role === 'user' && m.text === opt.text)
          if (!historyMsg) return true
          if ((opt.images?.length ?? 0) > 0 && (!historyMsg.images || historyMsg.images.length === 0)) return true
          return false
        })
        return filtered.length === prev.length ? prev : filtered
      })
    }
    removeOptimistic()
    setTimeout(removeOptimistic, 1500)

    // Clear typing indicator when assistant replies after our last user message
    if (lastUserMsgTimeRef.current > 0) {
      const lastAssistant = [...incoming].reverse().find(m => m.role === 'assistant')
      if (lastAssistant && new Date(lastAssistant.timestamp).getTime() > lastUserMsgTimeRef.current) {
        setIsTyping(false)
      }
    }
  }, [])

  // -- WebSocket: receive individual new messages in real time --
  const onWsMessage = useCallback((msg: WsMessage) => {
    const cleaned = cleanMessages([msg as ChatMessage])
    const sessionStart = localStorage.getItem('session-start')
    let filtered = cleaned
    if (sessionStart) {
      const startTime = parseInt(sessionStart, 10)
      filtered = cleaned.filter(m => new Date(m.timestamp).getTime() >= startTime)
    }
    if (filtered.length === 0) return

    if (!mounted) setMounted(true)
    setConnected(true)
    failCountRef.current = 0
    setNotConfigured(false)
    setHistoryError(null)

    reconcileMessages(filtered)
  }, [mounted, reconcileMessages])

  const { connected: wsConnected, usingFallback } = useChatSocket({
    onMessage: onWsMessage,
    onStatusChange: (status) => {
      if (status) {
        setConnected(true)
        setHistoryError(null)
      }
    },
    enabled: !_demo,
  })

  // -- Polling fallback: only active when WebSocket is unavailable --
  // Also used for initial history load (WS only sends NEW messages)
  const { data: historyData, dataUpdatedAt, isError: historyIsError, error: historyQueryError } = useQuery<{ messages?: ChatMessage[]; error?: string }>({
    queryKey: queryKeys.chatHistory,
    queryFn: () => api.get<{ messages?: ChatMessage[]; error?: string }>('/api/chat/history'),
    enabled: !_demo,
    // Always fetch once on mount for history; then only poll if WS is down
    refetchInterval: (query) => {
      if (wsConnected && !usingFallback) return false  // WS active — no polling needed
      return query.state.error ? Math.min((backoffRef.current *= 2), 30000) : ((backoffRef.current = 5000), 5000)
    },
  })

  // Surface network-level failures as a user-visible error
  useEffect(() => {
    if (historyIsError && !notConfigured) {
      // Only show error if WS is also down
      if (!wsConnected) {
        setConnected(false)
        const label = historyQueryError instanceof ApiError
          ? historyQueryError.serviceLabel
          : 'OpenClaw unreachable'
        setHistoryError(label)
      }
    }
  }, [historyIsError, historyQueryError, notConfigured, wsConnected])

  // ── Reconcile incoming history (initial load + polling fallback) ──
  useEffect(() => {
    if (!historyData) return
    if (!mounted) setMounted(true)

    if (historyData.error === 'openclaw_not_configured') {
      setNotConfigured(true)
      setConnected(false)
      return
    }

    let incoming: ChatMessage[] = cleanMessages(historyData.messages || [])
    const sessionStart = localStorage.getItem('session-start')
    if (sessionStart) {
      const startTime = parseInt(sessionStart, 10)
      incoming = incoming.filter(m => new Date(m.timestamp).getTime() >= startTime)
    }

    setConnected(true)
    failCountRef.current = 0
    setNotConfigured(false)
    setHistoryError(null)

    reconcileMessages(incoming)
  }, [historyData, dataUpdatedAt, reconcileMessages])

  // ── Paste image ──
  useEffect(() => {
    const handler = (e: ClipboardEvent) => {
      Array.from(e.clipboardData?.items || []).forEach(item => {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (file) readImageFile(file)
        }
      })
    }
    window.addEventListener('paste', handler)
    return () => window.removeEventListener('paste', handler)
  }, [])

  const readImageFile = (file: File) => {
    pendingReadsRef.current += 1
    const reader = new FileReader()
    reader.onload = e => {
      const b64 = e.target?.result as string
      // Update imagesRef IMMEDIATELY (synchronously) so send() sees it
      // even if React hasn't re-rendered yet.
      imagesRef.current = [...imagesRef.current, b64]
      pendingReadsRef.current -= 1
      const isLast = pendingReadsRef.current === 0
      const currentImgs = [...imagesRef.current]  // snapshot for queued send

      // Save to localStorage synchronously — outside any updater so timing is deterministic
      try {
        const total = currentImgs.reduce((sum, s) => sum + s.length, 0)
        if (total <= 4 * 1024 * 1024) localStorage.setItem('chat-draft-images', JSON.stringify(currentImgs))
      } catch { /* ignore */ }

      if (isLast && pendingSendRef.current) {
        pendingSendRef.current = false
        const textToSend = pendingTextRef.current
        // Reset imagesRef NOW (decision point) so any new paste that arrives
        // before the async _doSend fires won't be wiped by it.
        imagesRef.current = []
        setImages(currentImgs)
        setTimeout(() => _doSend(textToSend, currentImgs), 0)
      } else {
        // Normal path: update React state for UI (ref already updated above)
        setImages(currentImgs)
      }
    }
    reader.onerror = () => { pendingReadsRef.current -= 1 }
    reader.readAsDataURL(file)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    Array.from(e.target.files || []).forEach(readImageFile)
    e.target.value = ''
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/')).forEach(readImageFile)
  }, [])

  // ── Send ──
  const send = () => {
    const text = input.trim()
    const currentImages = imagesRef.current  // always-current, no stale closure
    if ((!text && currentImages.length === 0 && pendingReadsRef.current === 0) || sending) return

    // ── Demo mode: add messages locally ──
    if (_demo) {
      const userMsg: ChatMessage = { id: `demo-u-${Date.now()}`, role: 'user', text, timestamp: new Date().toISOString() }
      setMessages(prev => [...prev, userMsg])
      setInput('')
      setIsTyping(true)
      setTimeout(() => {
        const reply: ChatMessage = {
          id: `demo-a-${Date.now()}`,
          role: 'assistant',
          text: 'This is demo mode — connect an OpenClaw instance in **Settings > Connections** to chat with a real AI agent. Your messages will be sent to your self-hosted AI gateway.',
          timestamp: new Date().toISOString(),
        }
        setMessages(prev => [...prev, reply])
        setIsTyping(false)
      }, 1500)
      return
    }

    // ── Intercept slash commands ──
    if (isSlashCommand(text)) {
      setInput('')
      localStorage.removeItem('chat-draft')
      localStorage.setItem('session-start', Date.now().toString())
      setSystemMsg('── Starting fresh session… ──')
      setMessages([])
      setOptimistic([])
      api.post('/api/chat', { text, images: [], model, systemPrompt: sysPrompt || undefined }).catch((err) => {
        console.error('Slash command failed:', err)
        setSystemMsg('Failed to send command — try again')
        setTimeout(() => setSystemMsg(null), 4000)
      })
      setTimeout(() => {
        setSystemMsg('── Session reset ──')
        setTimeout(() => setSystemMsg(null), 3000)
      }, 2500)
      return
    }

    // If images are still being read from disk/clipboard, queue the send
    if (pendingReadsRef.current > 0) {
      pendingSendRef.current = true
      pendingTextRef.current = text
      setInput('')
      localStorage.removeItem('chat-draft')
      return
    }

    // Reset imagesRef NOW (decision point) before _doSend so new pastes
    // after this point start fresh and aren't zeroed by _doSend running later.
    imagesRef.current = []
    _doSend(text, currentImages)
  }

  const _doSend = (text: string, imgs: string[]) => {
    const msgId = `opt-${Date.now()}-${Math.random()}`
    setSending(true)
    setInput('')
    localStorage.removeItem('chat-draft')
    localStorage.removeItem('chat-draft-images')
    setImages([])
    // imagesRef.current is already reset at the decision point (send() or
    // the queued-send branch in readImageFile.onload) — resetting it here
    // again would race with images pasted after the decision was made.
    pendingSendRef.current = false

    // Add optimistic bubble immediately before any async work
    setOptimistic(prev => [...prev, { id: msgId, text, status: 'sending', images: imgs }])
    // Cache images so we can restore them if the history record arrives without attachments
    if (imgs.length > 0) {
      optimisticImageCacheRef.current.set(text, imgs)
      setTimeout(() => optimisticImageCacheRef.current.delete(text), 60000)
    }

    // Fire send — don't await; WS gateway has no clean ack
    api.post('/api/chat', { text, images: imgs, model, systemPrompt: sysPrompt || undefined }).catch(() => {
      setOptimistic(prev => prev.map(m => m.id === msgId ? { ...m, status: 'error' } : m))
      setSending(false)
    })

    // Optimistically mark sent after 500ms fallback — no need to wait for real ack
    setTimeout(() => {
      setOptimistic(prev => prev.map(m => m.id === msgId ? { ...m, status: 'sent' } : m))
      setIsTyping(true)
      lastUserMsgTimeRef.current = Date.now()
      // After checkmark fades (0.5s delay + 2s animation), mark permanent; polling will remove it
      setTimeout(() => setOptimistic(prev => prev.map(m => m.id === msgId ? { ...m, status: 'permanent' } : m)), 2500)
      // Safety cleanup in case polling never removes it
      setTimeout(() => setOptimistic(prev => prev.filter(m => m.id !== msgId)), 30000)
      setTimeout(() => setIsTyping(false), 60000)
    }, 500)

    setSending(false)
  }

  const retry = async (msg: OptimisticMsg) => {
    setOptimistic(prev => prev.map(m => m.id === msg.id ? { ...m, status: 'sending' } : m))
    try {
      await api.post('/api/chat', { text: msg.text, images: msg.images || [], model, systemPrompt: sysPrompt || undefined })
      setOptimistic(prev => prev.map(m => m.id === msg.id ? { ...m, status: 'sent' } : m))
      setTimeout(() => setOptimistic(prev => prev.filter(m => m.id !== msg.id)), 2000)
    } catch {
      setOptimistic(prev => prev.map(m => m.id === msg.id ? { ...m, status: 'error' } : m))
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* Header with PageHeader + DemoBadge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
        <PageHeader defaultTitle="Chat" />
        {_demo && <DemoBadge />}
      </div>

      {/* Model selector + connection status + system prompt (delegated to ChatInput header) */}
      <ChatInput
        input={input}
        setInput={setInput}
        images={images}
        setImages={setImages}
        imagesRef={imagesRef}
        sending={sending}
        model={model}
        setModel={setModel}
        sysPrompt={sysPrompt}
        setSysPrompt={setSysPrompt}
        showSysPrompt={showSysPrompt}
        setShowSysPrompt={setShowSysPrompt}
        connected={connected}
        wsConnected={wsConnected}
        historyIsError={historyIsError}
        isDemo={_demo}
        onSend={send}
        onFileChange={handleFileChange}
        draftTimerRef={draftTimerRef}
      />

      {/* Not configured banner */}
      {notConfigured && (
        <div style={{
          marginBottom: '12px', padding: '20px 24px', flexShrink: 0,
          background: 'rgba(59, 130, 246, 0.08)',
          border: '1px solid rgba(59, 130, 246, 0.25)',
          borderRadius: '12px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
            <Send size={14} style={{ color: 'rgba(96, 165, 250, 1)' }} />
            <span style={{ fontWeight: 600, fontSize: '14px', color: 'rgba(96, 165, 250, 1)' }}>OpenClaw not reachable</span>
          </div>
          <p style={{ margin: '0 0 12px', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Chat requires an OpenClaw instance. Add the following to <code style={{ background: 'var(--bg-elevated)', padding: '1px 5px', borderRadius: '4px', fontFamily: 'monospace', fontSize: '12px' }}>.env.local</code> and restart:
          </p>
          <pre style={{ margin: '0', padding: '12px 16px', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px', fontFamily: 'monospace', color: 'var(--text-primary)', overflowX: 'auto', lineHeight: 1.8 }}>
{`OPENCLAW_WS=ws://your-openclaw-host:18789
OPENCLAW_PASSWORD=your-password
OPENCLAW_API_URL=http://your-openclaw-host:3001
OPENCLAW_API_KEY=your-api-key`}
          </pre>
        </div>
      )}

      {/* History load error */}
      {historyError && (
        <div style={{
          marginBottom: '12px', padding: '12px 16px', flexShrink: 0,
          background: 'rgba(239, 68, 68, 0.08)',
          border: '1px solid rgba(239, 68, 68, 0.25)',
          borderRadius: '10px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: '13px', color: 'rgba(248, 113, 113, 1)' }}>
            Could not load chat history: {historyError}
          </span>
          <button
            onClick={() => {
              setHistoryError(null)
              api.get<{ messages?: ChatMessage[] }>('/api/chat/history')
                .then(d => {
                  const sessionStart = localStorage.getItem('session-start')
                  const startTime = sessionStart ? parseInt(sessionStart, 10) : 0
                  let msgs = cleanMessages(d.messages || [])
                  if (startTime > 0) msgs = msgs.filter(m => new Date(m.timestamp).getTime() >= startTime)
                  if (msgs.length) setMessages(msgs)
                })
                .catch(err => setHistoryError(err instanceof Error ? err.message : 'Failed to load chat history'))
            }}
            style={{
              background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '8px', padding: '4px 12px', color: 'rgba(248, 113, 113, 1)',
              fontSize: '12px', cursor: 'pointer', flexShrink: 0,
            }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Message thread */}
      <ChatThread
        messages={messages}
        optimistic={optimistic}
        isTyping={isTyping}
        mounted={mounted}
        atBottom={atBottom}
        systemMsg={systemMsg}
        lightbox={lightbox}
        setLightbox={setLightbox}
        setAtBottom={setAtBottom}
        scrollRef={scrollRef}
        bottomRef={bottomRef}
        optimisticImageCacheRef={optimisticImageCacheRef}
        onDrop={onDrop}
        retry={retry}
      />

      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes fadeOutCheck { 0% { opacity: 1; } 100% { opacity: 0; } }
        .md-bubble p:last-child { margin-bottom: 0 !important; }
      `}</style>

      <Suspense fallback={null}>
        <Lightbox data={lightbox} onClose={() => setLightbox(null)} />
      </Suspense>
    </div>
  )
}
