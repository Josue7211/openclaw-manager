


import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { ChatText, WarningCircle, BellSlash, PushPin } from '@phosphor-icons/react'

import { useSearchParams } from 'react-router-dom'
import { api } from '@/lib/api'
import { formatContactLabel } from '@/lib/utils'

import MessageMenu, { type MessageMenuState } from '@/components/messages/MessageMenu'
import { MButton } from '@/components/messages/MessageMenu'
import Lightbox, { type LightboxData } from '@/components/Lightbox'

import { useConversationList, useMessageCompose, useMessagesSSE, cleanPayloadText, type SSEMessage } from '@/hooks/messages'
import { setRecentConversations } from '@/components/CommandPalette'
import { usePageTitle } from '@/lib/hooks/usePageTitle'

import { getReadOverrides, setReadOverride, clearReadOverride } from '@/hooks/messages/readOverrides'

import { ConversationList, MessageThread, ComposePanel } from './messages/index'
import type { Conversation, Message, ConvContextMenu } from './messages/types'
import { formatTime, isIMessage } from './messages/utils'

/* ─── Main Page ─────────────────────────────────────────────────────────── */

export default function MessagesPage() {
  const pageTitle = usePageTitle('Messages')
  const [searchParams, setSearchParams] = useSearchParams()
  const [messages, setMessages] = useState<Message[]>([])
  const [selected, setSelected] = useState<Conversation | null>(null)
  const [panelWidth, setPanelWidth] = useState(340)
  const isDraggingRef = useRef(false)
  const [msgsLoading, setMsgsLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const hasMoreRef = useRef(true)

  const [lightbox, setLightbox] = useState<LightboxData>(null)

  const [messageMenu, setMessageMenu] = useState<MessageMenuState | null>(null)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedConvs, setSelectedConvs] = useState<Set<string>>(new Set())
  const [convCtx, setConvCtx] = useState<ConvContextMenu | null>(null)
  const [focusedConvIndex, setFocusedConvIndex] = useState(-1)
  const [composeMode, setComposeMode] = useState(false)
  const [composeTo, setComposeTo] = useState('')
  const [composeSending, setComposeSending] = useState(false)
  const composeDraftRef = useRef('')
  const [composeHasDraft, setComposeHasDraft] = useState(false)

  /* ── Drag-and-drop state ── */
  const [dragOver, setDragOver] = useState(false)

  /* ── Message search state ── */
  const [showMessageSearch, setShowMessageSearch] = useState(false)
  const [messageSearch, setMessageSearch] = useState('')
  const [activeMatchIndex, setActiveMatchIndex] = useState(0)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const isNearBottomRef = useRef(true)
  const pendingScrollRef = useRef<'instant' | 'smooth' | null>(null)
  const [showScrollBtn, setShowScrollBtn] = useState(false)
  const scrollDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const selectedGuidRef = useRef<string | null>(null)
  // Track the newest message timestamp per conversation for delta sync
  const newestTsMap = useRef<Record<string, number>>({})

  /* ── Custom hooks ── */

  const {
    conversations, setConversations,
    contactLookup, setContactLookup,
    loading, error, setError,
    searchQuery, setSearchQuery,
    serviceFilter, setServiceFilter,
    showJunk, setShowJunk,
    loadingMoreConvs,
    convListRef,
    filteredConversations,
    fetchConversations,
    handleConvListScroll,
    mutedConvs, setMutedConvs,
    pinnedConvs, setPinnedConvs,
  } = useConversationList()


  // Keep a ref so SSE handler can read muted state without re-subscribing
  const mutedConvsRef = useRef(mutedConvs)
  mutedConvsRef.current = mutedConvs

  const fetchMessages = useCallback(async (conv: Conversation, silent = false) => {
    try {
      if (!silent) setMsgsLoading(true)
      // Delta sync: on silent refreshes, only fetch messages newer than the
      // last known timestamp for this conversation.
      const sinceTs = silent ? newestTsMap.current[conv.guid] : undefined
      let url = `/api/messages?conversation=${encodeURIComponent(conv.guid)}&limit=50`
      if (sinceTs) url += `&since=${sinceTs}`

      const data = await api.get<{ messages?: Message[]; contacts?: Record<string, string>; newestTimestamp?: number }>(url)
      // Guard: only apply if we're still viewing this conversation
      if (selectedGuidRef.current === conv.guid) {
        const incoming = data.messages ?? []
        if (sinceTs && incoming.length > 0) {
          // Delta: append only genuinely new messages
          setMessages(prev => {
            const existingGuids = new Set(prev.map(m => m.guid))
            const fresh = incoming.filter(m => !existingGuids.has(m.guid))
            return fresh.length > 0 ? [...prev, ...fresh] : prev
          })
        } else {
          // Full load (initial or non-silent)
          setMessages(incoming)
        }
        if (data.contacts) setContactLookup(prev => ({ ...prev, ...data.contacts }))
      }
      // Track newest timestamp for next delta sync
      if (data.newestTimestamp) {
        newestTsMap.current[conv.guid] = data.newestTimestamp
      }
    } catch {
      if (!silent && selectedGuidRef.current === conv.guid) setMessages([])
    } finally {
      if (!silent) setMsgsLoading(false)
    }
  }, [setContactLookup])

  const {
    hasDraft,
    sending,
    attachmentFile,
    attachmentPreview,
    replyTo, setReplyTo,
    clearAttachment,
    handleDraftChange,
    handleSend: sendMessage,
    handlePaste,
    handleFileSelect,
    attachFile,
    retryMessage,
    dismissFailedMessage,
    resetCompose,
  } = useMessageCompose({
    selected,
    inputRef,
    fileInputRef,
    pendingScrollRef,
    setMessages,
    fetchMessages,
  })

  const contactLookupRef = useRef(contactLookup)
  contactLookupRef.current = contactLookup

  const { sseConnected, toast, dismissToast } = useMessagesSSE({
    selectedGuidRef,
    mutedConvsRef,
    contactLookupRef,
    onNewMessage: useCallback((msg: SSEMessage, msgChats: string[]) => {
      // Update the newest timestamp so the next delta sync skips this message
      if (msg.dateCreated) {
        for (const cg of msgChats) {
          const prev = newestTsMap.current[cg] ?? 0
          if (msg.dateCreated > prev) newestTsMap.current[cg] = msg.dateCreated
        }
      }
      if (selectedGuidRef.current && msgChats.includes(selectedGuidRef.current)) {
        setMessages(prev => {
          if (prev.some(m => m.guid === msg.guid)) return prev
          const tempIdx = msg.isFromMe
            ? prev.findIndex(m => m.guid.startsWith('temp-') && m.text === msg.text)
            : -1
          if (tempIdx >= 0) {
            const next = [...prev]
            next[tempIdx] = msg
            return next
          }
          return [...prev, msg]
        })
      }
      // Instantly update conversation list (don't wait for debounced re-fetch)
      setConversations(prev => {
        const preview = msg.text || (msg.attachments?.length ? '\u{1F4CE} Attachment' : '')
        return prev.map(c => {
          if (!msgChats.includes(c.guid)) return c
          return {
            ...c,
            lastMessage: (msg.isFromMe ? 'You: ' : '') + preview,
            lastDate: msg.dateCreated ?? Date.now(),
            isUnread: !msg.isFromMe && c.guid !== selectedGuidRef.current ? true : c.isUnread,
          }
        }).sort((a, b) => (b.lastDate ?? 0) - (a.lastDate ?? 0))
      })
    }, [setConversations]),
    onUpdateMessage: useCallback((msg: SSEMessage) => {
      setMessages(prev => prev.map(m => m.guid === msg.guid ? { ...m, ...msg } : m))
    }, []),
    onRefreshConvos: useCallback(() => {
      fetchConversations(true)
    }, [fetchConversations]),
  })

  /* ── Scroll helpers ── */

  // Use refs for scroll-related state so handlers stay stable
  const loadingMoreRef = useRef(false)
  const messagesRef = useRef(messages)
  messagesRef.current = messages
  const selectedRef = useRef(selected)
  selectedRef.current = selected

  const loadOlderMessages = useCallback(async () => {
    if (!selectedRef.current || loadingMoreRef.current || !hasMoreRef.current) return
    const el = scrollContainerRef.current
    if (!el) return
    const prevScrollHeight = el.scrollHeight
    const convGuid = selectedRef.current.guid

    loadingMoreRef.current = true
    setLoadingMore(true)
    try {
      const oldest = messagesRef.current[0]
      const before = oldest?.dateCreated || Date.now()
      const data = await api.get<{ messages?: Message[] }>(`/api/messages?conversation=${encodeURIComponent(convGuid)}&limit=50&before=${before}`)
      if (selectedGuidRef.current !== convGuid) return // stale
      const older: Message[] = data.messages ?? []
      if (older.length === 0) {
        hasMoreRef.current = false
      } else {
        setMessages(prev => {
          const existingGuids = new Set(prev.map(m => m.guid))
          const fresh = older.filter(m => !existingGuids.has(m.guid))
          if (fresh.length === 0) { hasMoreRef.current = false; return prev }
          return [...fresh, ...prev]
        })
        requestAnimationFrame(() => {
          el.scrollTop = el.scrollHeight - prevScrollHeight
        })
      }
    } catch { /* best-effort */ }
    loadingMoreRef.current = false
    setLoadingMore(false)
  }, []) // stable — uses refs only

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150
    isNearBottomRef.current = nearBottom
    if (scrollDebounce.current) clearTimeout(scrollDebounce.current)
    scrollDebounce.current = setTimeout(() => setShowScrollBtn(!nearBottom), 80)

    // Load more when scrolled to top
    if (el.scrollTop < 50 && !loadingMoreRef.current && hasMoreRef.current) {
      loadOlderMessages()
    }
  }, [loadOlderMessages]) // stable — loadOlderMessages is stable

  // Resizable panel drag handler
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isDraggingRef.current = true
    const startX = e.clientX
    const startWidth = panelWidth
    const onMove = (ev: MouseEvent) => {
      const newWidth = Math.max(72, Math.min(600, startWidth + ev.clientX - startX))
      setPanelWidth(newWidth)
    }
    const onUp = () => {
      isDraggingRef.current = false
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      // Snap to avatar-only if text is fully faded out
      setPanelWidth(prev => prev > 72 && prev < 90 ? 72 : prev)
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [panelWidth])

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const doScroll = () => {
      const el = scrollContainerRef.current
      if (!el) return
      el.scrollTop = el.scrollHeight
      isNearBottomRef.current = true
      setShowScrollBtn(false)
    }
    if (behavior === 'instant') {
      doScroll()
      // Also do it next frame in case layout isn't done
      requestAnimationFrame(doScroll)
    } else {
      requestAnimationFrame(() => {
        const el = scrollContainerRef.current
        if (!el) return
        el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
        isNearBottomRef.current = true
        setShowScrollBtn(false)
      })
    }
  }, [])

  /* ── Conversation selection ── */

  useEffect(() => {
    if (selected) {
      const isSwitch = selectedGuidRef.current !== selected.guid
      selectedGuidRef.current = selected.guid
      if (isSwitch) {
        pendingScrollRef.current = 'instant'
        hasMoreRef.current = true
        resetCompose()
      }
      fetchMessages(selected)
      inputRef.current?.focus()

      if (selected.isUnread) {
        api.post('/api/messages/read', { chatGuid: selected.guid }).catch(() => {})
        setConversations(prev => prev.map(c =>
          c.guid === selected.guid ? { ...c, isUnread: false } : c
        ))
      }
    }
  }, [selected, fetchMessages, resetCompose, setConversations])

  /* ── Sync selected conversation → URL search params ── */

  useEffect(() => {
    const current = searchParams.get('chat')
    if (selected) {
      if (current !== selected.guid) setSearchParams({ chat: selected.guid }, { replace: true })
    } else {
      if (current) setSearchParams({}, { replace: true })
    }
  }, [selected, searchParams, setSearchParams])

  /* ── Restore selection from URL on mount (once conversations load) ── */

  const restoredFromUrl = useRef(false)
  useEffect(() => {
    if (restoredFromUrl.current || conversations.length === 0) return
    const chatGuid = searchParams.get('chat')
    if (!chatGuid) { restoredFromUrl.current = true; return }
    const match = conversations.find(c => c.guid === chatGuid)
    if (match) {
      setSelected(match)
      restoredFromUrl.current = true
    }
  }, [conversations, searchParams])

  /* ── Feed conversations to command palette ── */

  useEffect(() => {
    setRecentConversations(conversations)
    return () => { setRecentConversations([]) }
  }, [conversations])

  /* ── Handle command palette params (compose, open) ── */

  const handledPaletteParams = useRef(false)
  useEffect(() => {
    if (handledPaletteParams.current || conversations.length === 0) return
    const composeParam = searchParams.get('compose')
    const openParam = searchParams.get('open')

    if (composeParam === '1') {
      setComposeMode(true)
      setComposeTo('')
      composeDraftRef.current = ''
      setComposeHasDraft(false)
      setSelected(null)
      setSearchParams({}, { replace: true })
      handledPaletteParams.current = true
    } else if (openParam) {
      const match = conversations.find(c => c.guid === openParam)
      if (match) {
        setSelected(match)
        setComposeMode(false)
        setSearchParams({ chat: match.guid }, { replace: true })
        handledPaletteParams.current = true
      }
    }
  }, [conversations, searchParams, setSearchParams])

  const prevMsgCountRef = useRef(0)
  useEffect(() => {
    const behavior = pendingScrollRef.current
    pendingScrollRef.current = null
    const grew = messages.length > prevMsgCountRef.current
    prevMsgCountRef.current = messages.length

    if (behavior) {
      scrollToBottom(behavior)
      // Re-scroll after media loads (images/videos shift layout)
      if (behavior === 'instant') {
        const t1 = setTimeout(() => scrollToBottom('instant'), 300)
        const t2 = setTimeout(() => scrollToBottom('instant'), 800)
        return () => { clearTimeout(t1); clearTimeout(t2) }
      }
    } else if (grew && isNearBottomRef.current) {
      scrollToBottom('smooth')
    }
  }, [messages, scrollToBottom])

  /* ── Escape key: close overlays or deselect conversation ── */

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        const target = e.target as HTMLElement
        const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
        if (showMessageSearch) {
          setShowMessageSearch(false); setMessageSearch(''); setActiveMatchIndex(0)
        } else if (lightbox || messageMenu || convCtx) {
          setLightbox(null); setMessageMenu(null); setConvCtx(null)
        } else if (!isInput && composeMode) {
          setComposeMode(false)
          setPanelWidth(340)
        } else if (!isInput && selected) {
          setSelected(null)
          selectedGuidRef.current = null
          setFocusedConvIndex(-1)
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [lightbox, messageMenu, convCtx, selected, showMessageSearch, composeMode])

  /* ── Reactions ── */

  const sendReaction = useCallback(async (msgGuid: string, reaction: string) => {
    if (!selected) return
    setMessageMenu(null)
    try {
      await api.post('/api/messages/react', {
        chatGuid: selected.guid,
        selectedMessageGuid: msgGuid,
        reaction,
      })
      setTimeout(() => fetchMessages(selected, true), 1500)
    } catch { /* best-effort */ }
  }, [selected, fetchMessages])

  /* ── Mark read/unread ── */

  const toggleReadStatus = useCallback(async (convGuid: string, markUnread: boolean) => {
    setConvCtx(null)
    // Protect this override from SSE refreshes for 10 seconds
    setReadOverride(convGuid, markUnread)
    const prev = [...conversations]
    setConversations(p => p.map(c =>
      c.guid === convGuid ? { ...c, isUnread: markUnread } : c
    ))
    api.post('/api/messages/read', { chatGuid: convGuid, action: markUnread ? 'unread' : 'read' })
      .catch(() => {
        clearReadOverride(convGuid)
        setConversations(prev)
      })
  }, [conversations, setConversations])

  const batchMarkReadStatus = useCallback(async (action: 'read' | 'unread') => {
    const guids = Array.from(selectedConvs)
    const prev = [...conversations]
    setConversations(p => p.map(c =>
      guids.includes(c.guid) ? { ...c, isUnread: action === 'unread' } : c
    ))
    const results = await Promise.allSettled(guids.map(guid =>
      api.post('/api/messages/read', { chatGuid: guid, action })
    ))
    if (results.some(r => r.status === 'rejected')) {
      setConversations(prev)
    }
    setSelectedConvs(new Set())
    setSelectMode(false)
  }, [conversations, selectedConvs, setConversations])

  // Reset keyboard focus when filters change
  useEffect(() => { setFocusedConvIndex(-1) }, [searchQuery, serviceFilter, showJunk])

  /* ── Compose send handler ── */

  const handleComposeSend = useCallback(async () => {
    const text = composeDraftRef.current.trim()
    const to = composeTo.trim()
    if (!text || !to || composeSending) return

    setComposeSending(true)

    // Build chat GUID: try iMessage first (email or phone)
    const isEmail = to.includes('@')
    const chatGuid = isEmail
      ? `iMessage;-;${to}`
      : `iMessage;-;${to.startsWith('+') ? to : `+${to}`}`

    try {
      await api.post('/api/messages', { chatGuid, text })

      // Clear compose state
      composeDraftRef.current = ''
      setComposeHasDraft(false)

      // Refresh conversations and select the new one
      await fetchConversations()
      setComposeMode(false)

      // Find the conversation we just sent to
      setTimeout(() => {
        setConversations(prev => {
          const match = prev.find(c => c.guid === chatGuid)
          if (match) setSelected(match)
          return prev
        })
      }, 500)
    } catch {
      // If iMessage GUID failed, could try SMS - but keep it simple for now
    } finally {
      setComposeSending(false)
    }
  }, [composeTo, composeSending, fetchConversations, setConversations])

  /* ── Delivery markers (iMessage-style) ── */

  const deliveryMarkers = useMemo(() => {
    const markers: Record<string, string> = {}
    let foundRead = false
    let foundDelivered = false
    let foundSent = false

    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i]
      if (!m.isFromMe) continue

      if (m.guid.startsWith('temp-')) {
        if (!foundSent) { foundSent = true; markers[m.guid] = 'Sending...' }
        continue
      }

      if (m.dateRead && !foundRead) {
        foundRead = true
        markers[m.guid] = `Read ${formatTime(m.dateRead)}`
      } else if (m.dateDelivered && !foundDelivered && !foundRead) {
        foundDelivered = true
        markers[m.guid] = 'Delivered'
      } else if (!foundSent && !foundRead && !foundDelivered) {
        foundSent = true
        markers[m.guid] = 'Sent'
      }

      if (foundRead && foundDelivered && foundSent) break
    }

    return markers
  }, [messages])

  /* ── Message search logic ── */

  const searchMatches = useMemo(() => {
    if (!messageSearch.trim()) return []
    const q = messageSearch.toLowerCase()
    const matches: number[] = []
    messages.forEach((msg, idx) => {
      const text = cleanPayloadText(msg.text)
      if (text && text.toLowerCase().includes(q)) {
        matches.push(idx)
      }
    })
    return matches
  }, [messages, messageSearch])

  // Reset active match index when search changes
  useEffect(() => {
    setActiveMatchIndex(0)
  }, [messageSearch])

  // Reset search when conversation changes
  useEffect(() => {
    setShowMessageSearch(false)
    setMessageSearch('')
    setActiveMatchIndex(0)
  }, [selected?.guid])

  const jumpToNextMatch = useCallback(() => {
    if (searchMatches.length === 0) return
    setActiveMatchIndex(prev => (prev + 1) % searchMatches.length)
  }, [searchMatches.length])

  const jumpToPrevMatch = useCallback(() => {
    if (searchMatches.length === 0) return
    setActiveMatchIndex(prev => (prev - 1 + searchMatches.length) % searchMatches.length)
  }, [searchMatches.length])

  /* ── Drag-and-drop handlers ── */

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.dataTransfer.types.includes('Files')) {
      setDragOver(true)
    }
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    // Only set false if we're actually leaving the container
    const rect = e.currentTarget.getBoundingClientRect()
    const { clientX, clientY } = e
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
      setDragOver(false)
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) {
      attachFile(file)
    }
  }, [attachFile])

  // Scroll to active search match
  useEffect(() => {
    if (searchMatches.length > 0 && activeMatchIndex < searchMatches.length) {
      const msgIdx = searchMatches[activeMatchIndex]
      const msgGuid = messages[msgIdx]?.guid
      if (msgGuid) {
        const el = document.querySelector(`[data-msg-guid="${msgGuid}"]`)
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }
  }, [activeMatchIndex, searchMatches, messages])

  /* ── Error state ── */

  if (error) {
    return (
      <div style={{ maxWidth: '560px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '28px' }}>
          <ChatText size={20} style={{ color: 'var(--accent)' }} />
          <h1 style={{ margin: 0, fontSize: 'var(--text-2xl)', fontWeight: 700 }}>Messages</h1>
        </div>
        <div className="card" style={{ padding: '32px', textAlign: 'center' }}>
          <WarningCircle size={32} style={{ color: 'var(--text-muted)', marginBottom: '16px' }} />
          {error === 'bluebubbles_not_configured' ? (
            <>
              <h2 style={{ margin: '0 0 8px', fontSize: '16px', fontWeight: 600 }}>BlueBubbles not configured</h2>
              <p style={{ margin: '0 0 20px', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                Messages requires BlueBubbles running on your Mac.
              </p>
              <div style={{
                background: 'var(--bg-base)', borderRadius: '8px', border: '1px solid var(--border)',
                padding: '16px 20px', textAlign: 'left', fontFamily: 'monospace', fontSize: '12px',
                color: 'var(--text-secondary)', lineHeight: 2,
              }}>
                <div><span style={{ color: 'var(--text-muted)' }}># .env.local</span></div>
                <div>BLUEBUBBLES_HOST=http://mac-tailscale-ip:1234</div>
                <div>BLUEBUBBLES_PASSWORD=your-server-password</div>
              </div>
            </>
          ) : (
            <>
              <h2 style={{ margin: '0 0 8px', fontSize: '16px', fontWeight: 600 }}>Connection error</h2>
              <p style={{ margin: '0 0 16px', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                Could not reach BlueBubbles server.
              </p>
              <button
                onClick={() => { setError(null); fetchConversations() }}
                style={{
                  marginTop: '16px', padding: '8px 20px', fontSize: '13px', fontWeight: 500,
                  background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                  borderRadius: '8px', color: 'var(--text-primary)', cursor: 'pointer',
                }}
              >
                Retry
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  /* ── Render ── */

  return (
    <div style={{ display: 'flex', position: 'absolute', inset: 0, margin: '-20px -28px', gap: '0', overflow: 'hidden' }}>

      {/* ═══ Conversation list ═══ */}
      <ConversationList
        pageTitle={pageTitle}
        panelWidth={panelWidth}
        isDragging={isDraggingRef.current}
        selected={selected}
        composeMode={composeMode}
        conversations={conversations}
        filteredConversations={filteredConversations}
        loading={loading}
        loadingMoreConvs={loadingMoreConvs}
        convListRef={convListRef}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        serviceFilter={serviceFilter}
        setServiceFilter={setServiceFilter}
        showJunk={showJunk}
        setShowJunk={setShowJunk}
        selectMode={selectMode}
        setSelectMode={setSelectMode}
        selectedConvs={selectedConvs}
        setSelectedConvs={setSelectedConvs}
        focusedConvIndex={focusedConvIndex}
        setFocusedConvIndex={setFocusedConvIndex}
        mutedConvs={mutedConvs}
        pinnedConvs={pinnedConvs}
        onSelectConversation={(conv) => { setSelected(conv); setComposeMode(false) }}
        onStartCompose={() => {
          setComposeMode(true)
          setComposeTo('')
          composeDraftRef.current = ''
          setComposeHasDraft(false)
          setSelected(null)
          selectedGuidRef.current = null
          setMessages([])
        }}
        onRefresh={() => fetchConversations()}
        onConvListScroll={handleConvListScroll}
        onContextMenu={setConvCtx}
        onBatchMarkRead={() => batchMarkReadStatus('read')}
        onBatchMarkUnread={() => batchMarkReadStatus('unread')}
        onBatchDelete={() => {
          const guids = Array.from(selectedConvs)
          setConversations(prev => prev.filter(c => !guids.includes(c.guid)))
          if (selected && guids.includes(selected.guid)) setSelected(null)
          setSelectedConvs(new Set())
          setSelectMode(false)
        }}
        fetchMessages={fetchMessages}
      />

      {/* Resize handle */}
      {(selected || composeMode) && (
        <div
          onMouseDown={handleResizeStart}
          style={{
            width: '5px',
            cursor: 'col-resize',
            background: 'transparent',
            flexShrink: 0,
            position: 'relative',
            zIndex: 10,
          }}
        />
      )}

      {/* ═══ Message thread ═══ */}
      {selected ? (
        <MessageThread
          selected={selected}
          messages={messages}
          msgsLoading={msgsLoading}
          loadingMore={loadingMore}
          contactLookup={contactLookup}
          sseConnected={sseConnected}
          deliveryMarkers={deliveryMarkers}
          scrollContainerRef={scrollContainerRef}
          handleScroll={handleScroll}
          showScrollBtn={showScrollBtn}
          scrollToBottom={scrollToBottom}
          showMessageSearch={showMessageSearch}
          setShowMessageSearch={setShowMessageSearch}
          messageSearch={messageSearch}
          setMessageSearch={setMessageSearch}
          searchMatches={searchMatches}
          activeMatchIndex={activeMatchIndex}
          setActiveMatchIndex={setActiveMatchIndex}
          jumpToNextMatch={jumpToNextMatch}
          jumpToPrevMatch={jumpToPrevMatch}
          searchInputRef={searchInputRef}
          inputRef={inputRef}
          fileInputRef={fileInputRef}
          hasDraft={hasDraft}
          sending={sending}
          attachmentFile={attachmentFile}
          attachmentPreview={attachmentPreview}
          replyTo={replyTo}
          setReplyTo={setReplyTo}
          clearAttachment={clearAttachment}
          handleDraftChange={handleDraftChange}
          handleSend={sendMessage}
          handlePaste={handlePaste}
          handleFileSelect={handleFileSelect}
          retryMessage={retryMessage}
          dismissFailedMessage={dismissFailedMessage}
          dragOver={dragOver}
          handleDragOver={handleDragOver}
          handleDragLeave={handleDragLeave}
          handleDrop={handleDrop}
          setLightbox={setLightbox}
          setMessageMenu={setMessageMenu}
          onBack={() => { setSelected(null); setMessages([]); setMessageMenu(null); setReplyTo(null); setPanelWidth(340) }}
        />
      ) : composeMode ? (
        <ComposePanel
          onBack={() => { setComposeMode(false); setPanelWidth(340) }}
          onSend={handleComposeSend}
          composeTo={composeTo}
          setComposeTo={setComposeTo}
          composeSending={composeSending}
          composeDraftRef={composeDraftRef}
          composeHasDraft={composeHasDraft}
          setComposeHasDraft={setComposeHasDraft}
        />
      ) : null}

      {/* ═══ Message Menu ═══ */}
      {messageMenu && (
        <MessageMenu
          x={messageMenu.x} y={messageMenu.y} msg={messageMenu.msg}
          onReact={(reaction) => sendReaction(messageMenu.msgGuid, reaction)}
          onReply={() => { setReplyTo(messageMenu.msg); setMessageMenu(null); inputRef.current?.focus() }}
          onCopy={() => {
            if (messageMenu.msg.text) navigator.clipboard.writeText(messageMenu.msg.text).catch(() => {})
            setMessageMenu(null)
          }}
          onClose={() => setMessageMenu(null)}
        />
      )}

      {/* ═══ Conversation Context Menu ═══ */}
      {convCtx && (
        <>
          <div role="presentation" onClick={() => setConvCtx(null)} style={{ position: 'fixed', inset: 0, zIndex: 998 }} />
          <div style={{
            position: 'fixed', left: convCtx.x, top: convCtx.y, zIndex: 999,
            background: 'var(--bg-modal)',
            backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
            border: '1px solid var(--border-hover)',
            borderRadius: '10px', padding: '4px',
            boxShadow: '0 8px 32px var(--overlay)', minWidth: '180px',
            animation: 'ctxIn 0.15s var(--ease-spring)',
          }}>
            <MButton
              icon={convCtx.isUnread
                ? <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="4" fill="var(--text-secondary)" /></svg>
                : <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="4" fill="var(--apple-blue)" /></svg>
              }
              label={convCtx.isUnread ? 'Mark as Read' : 'Mark as Unread'}
              onClick={() => toggleReadStatus(convCtx.convGuid, !convCtx.isUnread)}
            />
            <MButton
              icon={<PushPin size={16} color="var(--text-secondary)" style={convCtx.isPinned ? { fill: 'var(--text-secondary)' } : undefined} />}
              label={convCtx.isPinned ? 'Unpin' : 'Pin'}
              onClick={() => {
                const guid = convCtx.convGuid
                setPinnedConvs(prev =>
                  prev.includes(guid) ? prev.filter(g => g !== guid) : [...prev, guid]
                )
                setConvCtx(null)
              }}
            />
            <MButton
              icon={<BellSlash size={16} color={convCtx.isMuted ? 'var(--apple-blue)' : 'var(--text-secondary)'} />}
              label={convCtx.isMuted ? 'Unmute' : 'Mute'}
              onClick={() => {
                const guid = convCtx.convGuid
                setMutedConvs(prev =>
                  prev.includes(guid) ? prev.filter(g => g !== guid) : [...prev, guid]
                )
                setConvCtx(null)
              }}
            />
          </div>
        </>
      )}

      <Lightbox data={lightbox} onClose={() => setLightbox(null)} />

      {/* ═══ Toast notification ═══ */}
      <div aria-live="assertive" role="alert">
        {toast && (
          <button
            onClick={() => {
              if (toast.chatGuid) {
                const conv = conversations.find(c => c.guid === toast.chatGuid)
                if (conv) { setSelected(conv); setComposeMode(false) }
              }
              dismissToast()
            }}
            style={{
              position: 'fixed', top: '16px', right: '20px', zIndex: 1100,
              background: 'var(--bg-modal)',
              backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
              border: '1px solid var(--border-hover)',
              borderRadius: '14px', padding: '12px 16px',
              boxShadow: '0 8px 32px var(--overlay)',
              maxWidth: '320px', cursor: 'pointer',
              animation: 'toastIn 0.3s var(--ease-spring)',
              display: 'flex', alignItems: 'center', gap: '10px',
              textAlign: 'left', font: 'inherit', color: 'inherit',
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {(() => {
                    const addr = toast.sender
                    const digits = addr.replace(/\D/g, '')
                    const normalized = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
                    return contactLookup[normalized] || contactLookup[addr.toLowerCase()] || addr
                  })()}
                </span>
                {toast.count > 1 && (
                  <span style={{
                    fontSize: '10px', fontWeight: 700, color: 'var(--text-on-color)',
                    background: 'var(--apple-blue)', borderRadius: '8px',
                    padding: '1px 5px', flexShrink: 0, lineHeight: '14px',
                  }}>
                    {toast.count}
                  </span>
                )}
              </div>
              <div style={{
                fontSize: '12px', color: 'var(--text-secondary)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {toast.text}
              </div>
            </div>
          </button>
        )}
      </div>
    </div>
  )
}
