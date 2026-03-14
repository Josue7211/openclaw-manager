

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  MessageSquare, Send, RefreshCw, ArrowLeft, AlertCircle, Mic,
  Paperclip, X, Search, ChevronDown, ChevronUp, CornerUpLeft, Check, CheckCheck, SmilePlus,
  PenSquare, BellOff, Pin,
} from 'lucide-react'

import { useSearchParams } from 'react-router-dom'
import { API_BASE, api } from '@/lib/api'
import { formatContactLabel } from '@/lib/utils'

import LinkPreviewCard from '@/components/messages/LinkPreviewCard'
import AudioWaveform from '@/components/messages/AudioWaveform'
import ReactionPills from '@/components/messages/ReactionPills'
import VideoThumbnail from '@/components/messages/VideoThumbnail'
import MessageMenu, { type MessageMenuState } from '@/components/messages/MessageMenu'
import { MButton } from '@/components/messages/MessageMenu'
import { ContactAvatar, GroupAvatar } from '@/components/messages/ContactAvatar'
import Lightbox, { type LightboxData } from '@/components/Lightbox'

import { useConversationList, useMessageCompose, useMessagesSSE, cleanPayloadText } from '@/hooks/messages'
import { setRecentConversations } from '@/components/CommandPalette'
import { MessagesConversationSkeleton, MessagesThreadSkeleton } from '@/components/Skeleton'
import { isDemoMode, DEMO_CONVERSATIONS } from '@/lib/demo-data'
import { DemoBadge } from '@/components/DemoModeBanner'

/* ─── Types ─────────────────────────────────────────────────────────────── */

interface Participant { address: string; service: string }

interface Conversation {
  guid: string
  chatId: string
  displayName: string | null
  participants: Participant[]
  service: string
  lastMessage: string | null
  lastDate: number | null
  lastFromMe: number
  isUnread?: boolean
  isJunk?: boolean
}

interface Reaction {
  type: number        // 2000–2005
  fromMe: boolean
  handle?: string
}

interface Attachment {
  guid: string
  mimeType: string
  transferName: string
  isSticker?: boolean
  uti?: string
}

interface Message {
  originalROWID?: number
  guid: string
  text: string
  dateCreated: number
  isFromMe: boolean
  isAudioMessage?: boolean
  handle?: { address: string; service: string }
  attachments?: Attachment[]
  balloonBundleId?: string | null
  groupTitle?: string | null
  groupActionType?: number
  itemType?: number
  dateRead?: number | null
  dateDelivered?: number | null
  reactions?: Reaction[]
  threadOriginatorGuid?: string | null
  _failed?: boolean
  _failedText?: string
  _failedChatGuid?: string
  _failedReplyGuid?: string | null
}

type ServiceFilter = 'all' | 'iMessage' | 'SMS'

interface ConvContextMenu {
  x: number
  y: number
  convGuid: string
  isUnread: boolean
  isMuted: boolean
  isPinned: boolean
}

/* ─── Constants ─────────────────────────────────────────────────────────── */

const URL_RE = /https?:\/\/[^\s<>"')\]]+/gi

/* ─── Utilities ─────────────────────────────────────────────────────────── */

function timeAgo(ts: number | null): string {
  if (!ts) return ''
  const d = new Date(ts)
  if (isNaN(d.getTime())) return ''
  const now = Date.now()
  const diff = (now - d.getTime()) / 1000
  if (diff < 60) return 'now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`
  const thisYear = new Date().getFullYear()
  if (d.getFullYear() !== thisYear) {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffDays === 0) {
    return `Today ${formatTime(ts)}`
  } else if (diffDays === 1) {
    return `Yesterday ${formatTime(ts)}`
  } else if (diffDays < 7) {
    return `${d.toLocaleDateString('en-US', { weekday: 'long' })} ${formatTime(ts)}`
  }
  const opts: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' }
  if (d.getFullYear() !== now.getFullYear()) opts.year = 'numeric'
  return `${d.toLocaleDateString('en-US', opts)} ${formatTime(ts)}`
}

const contactLabel = formatContactLabel

function isIMessage(conv: Conversation): boolean {
  const svc = conv.service?.toLowerCase() || ''
  const guidLower = conv.guid?.toLowerCase() || ''
  if (svc.includes('imessage') || guidLower.startsWith('imessage')) return true
  // macOS 26+ uses 'any' as the unified service — treat as iMessage unless clearly SMS
  if (svc === 'any' || guidLower.startsWith('any;')) {
    // If participants have explicit SMS service, it's SMS; otherwise treat as iMessage
    const hasExplicitSms = conv.participants?.some(p => p.service?.toLowerCase() === 'sms')
    if (!hasExplicitSms) return true
  }
  // Group chats where all participants have iMessage or 'any' service
  if (conv.participants?.length > 1 &&
    conv.participants.every(p => {
      const ps = p.service?.toLowerCase() || ''
      return ps.includes('imessage') || ps === 'any'
    })) return true
  return false
}

function shouldShowTimestamp(messages: Message[], idx: number): boolean {
  if (idx === 0) return true
  const prev = messages[idx - 1]
  const curr = messages[idx]
  return (curr.dateCreated - prev.dateCreated) > 3600000
}

function resolveSenderName(handle: { address: string } | undefined, contactLookup: Record<string, string>): string {
  if (!handle) return 'Unknown'
  const addr = handle.address
  const digits = addr.replace(/\D/g, '')
  const normalized = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
  return contactLookup[normalized] || contactLookup[addr.toLowerCase()] || addr
}

function isGroupChat(conv: Conversation): boolean {
  return (conv.participants?.length ?? 0) > 1
}

function renderTextWithLinks(text: string, fromMe: boolean): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  URL_RE.lastIndex = 0

  while ((match = URL_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }
    const url = match[0].replace(/[.,;:!?)]+$/, '')
    const trailing = match[0].slice(url.length)
    parts.push(
      <a key={match.index} href={url} target="_blank" rel="noopener noreferrer"
        onClick={e => e.stopPropagation()}
        style={{
          color: fromMe ? 'rgba(255,255,255,0.95)' : 'var(--apple-blue)',
          textDecoration: 'underline',
          textDecorationStyle: 'dotted' as const,
          textUnderlineOffset: '2px',
        }}>
        {url}
      </a>
    )
    if (trailing) parts.push(trailing)
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }

  URL_RE.lastIndex = 0
  return parts.length > 0 ? parts : [text]
}

/** Wrap matching substrings in <mark> for in-conversation search highlighting */
function highlightSearchText(
  nodes: React.ReactNode[],
  query: string,
  isActiveMatch: boolean,
): React.ReactNode[] {
  if (!query) return nodes
  const q = query.toLowerCase()
  let keyCounter = 0
  return nodes.map(node => {
    if (typeof node !== 'string') return node
    const parts: React.ReactNode[] = []
    let remaining = node
    let lower = remaining.toLowerCase()
    let idx = lower.indexOf(q)
    while (idx !== -1) {
      if (idx > 0) parts.push(remaining.slice(0, idx))
      parts.push(
        <mark key={`hl-${keyCounter++}`} style={{
          background: isActiveMatch ? 'rgba(255,204,0,0.5)' : 'rgba(255,204,0,0.25)',
          color: 'inherit',
          borderRadius: '2px',
          padding: '0 1px',
        }}>
          {remaining.slice(idx, idx + query.length)}
        </mark>
      )
      remaining = remaining.slice(idx + query.length)
      lower = remaining.toLowerCase()
      idx = lower.indexOf(q)
    }
    if (remaining) parts.push(remaining)
    return parts.length > 0 ? parts : node
  }).flat()
}

/* ─── Main Page ─────────────────────────────────────────────────────────── */

export default function MessagesPage() {
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
  const composeInputRef = useRef<HTMLTextAreaElement>(null)
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
    onNewMessage: useCallback((msg: any, msgChats: string[]) => {
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
    }, []),
    onUpdateMessage: useCallback((msg: any) => {
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
    const prev = [...conversations]
    setConversations(p => p.map(c =>
      c.guid === convGuid ? { ...c, isUnread: markUnread } : c
    ))
    api.post('/api/messages/read', { chatGuid: convGuid, action: markUnread ? 'unread' : 'read' })
      .catch(() => setConversations(prev))
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
      if (composeInputRef.current) {
        composeInputRef.current.value = ''
        composeInputRef.current.style.height = 'auto'
      }

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

  function extractFirstUrl(text: string): string | null {
    URL_RE.lastIndex = 0
    const match = URL_RE.exec(text)
    URL_RE.lastIndex = 0
    return match ? match[0].replace(/[.,;:!?)]+$/, '') : null
  }

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

  /* ── Conversation list virtualizer ── */

  const convVirtualizer = useVirtualizer({
    count: filteredConversations.length,
    getScrollElement: () => convListRef.current,
    estimateSize: () => 72,
    overscan: 5,
  })

  /* ── Message thread virtualizer ── */


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
          <MessageSquare size={20} style={{ color: 'var(--accent)' }} />
          <h1 style={{ margin: 0, fontSize: 'var(--text-2xl)', fontWeight: 700 }}>Messages</h1>
        </div>
        <div className="card" style={{ padding: '32px', textAlign: 'center' }}>
          <AlertCircle size={32} style={{ color: 'var(--text-muted)', marginBottom: '16px' }} />
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
    <div style={{ display: 'flex', position: 'absolute', inset: 0, gap: '0', overflow: 'hidden' }}>

      {/* ═══ Conversation list ═══ */}
      <div style={{
        width: (selected || composeMode) ? `${panelWidth}px` : '100%',
        maxWidth: (selected || composeMode) ? '600px' : undefined,
        minWidth: (selected || composeMode) ? '72px' : undefined,
        borderRight: (selected || composeMode) ? '1px solid var(--border)' : 'none',
        display: 'flex', flexDirection: 'column',
        flexShrink: 0,
        overflow: 'hidden',
        transition: isDraggingRef.current ? 'none' : 'width 0.25s var(--ease-spring)',
      }}>
        {/* Header — hide title first as panel narrows, buttons only at medium, empty spacer at avatar-only */}
        <div style={{
          padding: '0 6px 0 22px',
          height: '57px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: '10px',
          flexShrink: 0,
        }}>
          {(() => {
            const title = 'Messages'
            const charsVisible = panelWidth >= 260 ? title.length
              : panelWidth <= 80 ? 0
              : Math.round(((panelWidth - 80) / 180) * title.length)
            const visibleText = title.slice(0, charsVisible)
            const isDeleting = charsVisible < title.length && charsVisible > 0
            const iconSize = 24
            const badgeOpacity = panelWidth >= 340 ? 1 : panelWidth <= 310 ? 0 : (panelWidth - 310) / 30
            // Buttons fade in after title is mostly visible
            const btnOpacity = panelWidth >= 320 ? 1 : panelWidth <= 280 ? 0 : (panelWidth - 280) / 40
            return (
              <>
                <MessageSquare size={iconSize} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                {charsVisible > 0 && (
                  <h1 style={{
                    margin: 0, fontSize: '20px', fontWeight: 700,
                    whiteSpace: 'nowrap', overflow: 'hidden',
                    display: 'flex', alignItems: 'center',
                  }}>
                    {visibleText}
                    {isDeleting && (
                      <span className="type-cursor" style={{
                        display: 'inline-block', width: '2px', height: '20px',
                        background: 'var(--accent)', marginLeft: '1px',
                        borderRadius: '1px',
                      }} />
                    )}
                  </h1>
                )}
                {badgeOpacity > 0 && !loading && (
                  <span className="badge badge-blue" style={{
                    marginLeft: '2px', opacity: badgeOpacity,
                  }}>{conversations.length}</span>
                )}
                {btnOpacity > 0 && (
                  <div style={{ display: 'flex', gap: '6px', opacity: btnOpacity, flexShrink: 0, marginLeft: '8px' }}>
                    <button
                      onClick={() => {
                        if (selectMode) { setSelectMode(false); setSelectedConvs(new Set()) }
                        else setSelectMode(true)
                      }}
                      style={{
                        background: selectMode ? 'rgba(0,122,255,0.15)' : 'transparent',
                        border: '1px solid var(--border)', borderRadius: '8px',
                        color: selectMode ? 'var(--apple-blue)' : 'var(--text-secondary)',
                        padding: '7px 14px', cursor: 'pointer', fontSize: '12px', fontWeight: 500,
                      }}
                    >
                      {selectMode ? 'Done' : 'Edit'}
                    </button>
                    <button
                      onClick={() => { fetchConversations(); if (selected) fetchMessages(selected) }}
                      aria-label="Refresh"
                      style={{
                        background: 'transparent', border: '1px solid var(--border)', borderRadius: '8px',
                        color: 'var(--text-secondary)', padding: '7px 10px', cursor: 'pointer',
                        display: 'flex', alignItems: 'center',
                      }}
                    >
                      <RefreshCw size={14} />
                    </button>
                    <button
                      onClick={() => {
                        setComposeMode(true)
                        setComposeTo('')
                        composeDraftRef.current = ''
                        setComposeHasDraft(false)
                        setSelected(null)
                        selectedGuidRef.current = null
                        setMessages([])
                      }}
                      aria-label="New Message"
                      style={{
                        background: composeMode ? 'rgba(0,122,255,0.15)' : 'transparent',
                        border: '1px solid var(--border)', borderRadius: '8px',
                        color: composeMode ? 'var(--apple-blue)' : 'var(--text-secondary)',
                        padding: '7px 10px', cursor: 'pointer',
                        display: 'flex', alignItems: 'center',
                      }}
                    >
                      <PenSquare size={14} />
                    </button>
                  </div>
                )}
              </>
            )
          })()}
        </div>

        {(() => {
          const searchOpacity = panelWidth >= 300 ? 1 : panelWidth <= 240 ? 0 : (panelWidth - 240) / 60
          const searchHeight = panelWidth >= 300 ? 46 : panelWidth <= 240 ? 0 : ((panelWidth - 240) / 60) * 46
          const filtersHeight = panelWidth >= 300 ? 42 : panelWidth <= 240 ? 0 : ((panelWidth - 240) / 60) * 42
          return (
            <>
              <div style={{
                height: `${searchHeight}px`, opacity: searchOpacity, overflow: 'hidden',
                transition: isDraggingRef.current ? 'none' : 'height 0.25s ease, opacity 0.2s ease',
              }}>
                <div style={{ padding: '10px 14px 6px', position: 'relative' }}>
                  <Search size={13} style={{
                    position: 'absolute', left: '26px', top: '50%', transform: 'translateY(-50%)',
                    color: 'var(--text-muted)', pointerEvents: 'none',
                  }} />
                  <input
                    type="text" placeholder="Search" value={searchQuery}
                    aria-label="Search conversations"
                    onChange={e => setSearchQuery(e.target.value)}
                    tabIndex={searchOpacity === 0 ? -1 : 0}
                    style={{
                      width: '100%', padding: '8px 12px 8px 34px', fontSize: '13px',
                      background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                      borderRadius: '10px', color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit',
                    }}
                    onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent)' }}
                    onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
                  />
                </div>
              </div>

              <div style={{
                height: `${filtersHeight}px`, opacity: searchOpacity, overflow: 'hidden',
                transition: isDraggingRef.current ? 'none' : 'height 0.25s ease, opacity 0.2s ease',
              }}>
                <div style={{ display: 'flex', gap: '4px', padding: '6px 14px 8px', borderBottom: '1px solid var(--border)' }}>
                  {(['all', 'iMessage', 'SMS'] as ServiceFilter[]).map(f => {
                    const act = serviceFilter === f && !showJunk
                    const count = f === 'all' ? conversations.length
                      : conversations.filter(c => f === 'iMessage' ? isIMessage(c) : !isIMessage(c)).length
                    return (
                      <button key={f} onClick={() => { setServiceFilter(f); if (showJunk) setShowJunk(false) }} style={{
                        flex: 1, padding: '6px 8px', fontSize: '11px',
                        fontWeight: act ? 600 : 450,
                        color: act ? '#fff' : 'var(--text-secondary)',
                        background: act
                          ? (f === 'iMessage' ? 'rgba(0,122,255,0.25)' : f === 'SMS' ? 'rgba(52,199,89,0.2)' : 'rgba(167,139,250,0.15)')
                          : 'transparent',
                        border: act ? 'none' : '1px solid var(--border)',
                        borderRadius: '8px', cursor: 'pointer', transition: 'all 0.15s',
                      }}>
                        {f === 'all' ? 'All' : f}{!showJunk && <span style={{ opacity: 0.6, fontSize: '10px', marginLeft: '4px' }}>{count}</span>}
                      </button>
                    )
                  })}
                  <button onClick={() => setShowJunk(j => !j)} style={{
                    flex: 1, padding: '6px 8px', fontSize: '11px',
                    fontWeight: showJunk ? 600 : 450,
                    color: showJunk ? '#fff' : 'var(--text-muted)',
                    background: showJunk ? 'rgba(248,113,113,0.2)' : 'transparent',
                    border: showJunk ? 'none' : '1px solid var(--border)',
                    borderRadius: '8px', cursor: 'pointer', transition: 'all 0.15s',
                  }}>
                    Junk
                  </button>
                </div>
              </div>
            </>
          )
        })()}

        <div
          ref={convListRef}
          onScroll={handleConvListScroll}
          tabIndex={0}
          onKeyDown={e => {
            const target = e.target as HTMLElement
            const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
            if (e.key === 'ArrowDown' || (!isInput && e.key === 'j')) {
              e.preventDefault()
              setFocusedConvIndex(prev => {
                const next = Math.min(prev + 1, filteredConversations.length - 1)
                convVirtualizer.scrollToIndex(next, { align: 'auto' })
                return next
              })
            } else if (e.key === 'ArrowUp' || (!isInput && e.key === 'k')) {
              e.preventDefault()
              setFocusedConvIndex(prev => {
                const next = Math.max(prev - 1, 0)
                convVirtualizer.scrollToIndex(next, { align: 'auto' })
                return next
              })
            } else if (e.key === 'Enter' && focusedConvIndex >= 0 && focusedConvIndex < filteredConversations.length) {
              e.preventDefault()
              setSelected(filteredConversations[focusedConvIndex])
              setComposeMode(false)
            }
          }}
          className="hidden-scrollbar"
          role="list"
          style={{ flex: 1, overflowY: 'auto', padding: '4px 0', outline: 'none' }}
        >
          {loading && !isDemoMode() && <MessagesConversationSkeleton />}
          {!loading && conversations.length === 0 && !searchQuery && !isDemoMode() && (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              padding: '48px 16px', color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center', gap: '12px',
            }}>
              <MessageSquare size={32} style={{ opacity: 0.3 }} />
              <div>
                <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '4px' }}>No conversations yet</div>
                <div style={{ fontSize: '12px', fontFamily: 'monospace' }}>Messages will appear here once available</div>
              </div>
            </div>
          )}
          {!loading && conversations.length === 0 && !searchQuery && isDemoMode() && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', padding: '4px 0' }}>
              <div style={{ padding: '6px 12px', marginBottom: '4px' }}>
                <DemoBadge />
              </div>
              {DEMO_CONVERSATIONS.map(conv => (
                <div
                  key={conv.guid}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '10px 12px', borderRadius: '10px',
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid var(--border)',
                    cursor: 'default', opacity: 0.7,
                  }}
                >
                  <div style={{
                    width: '36px', height: '36px', borderRadius: '50%',
                    background: 'rgba(167,139,250,0.15)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '14px', color: 'var(--accent)', fontWeight: 600, flexShrink: 0,
                  }}>
                    {(conv.displayName || '?')[0].toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {conv.displayName}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {conv.lastMessage}
                    </div>
                  </div>
                </div>
              ))}
              <div style={{ padding: '12px', fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic', textAlign: 'center' }}>
                Connect BlueBubbles in Settings to see real messages
              </div>
            </div>
          )}
          {!loading && filteredConversations.length === 0 && searchQuery && (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              padding: '32px 16px', color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center', gap: '8px',
            }}>
              <Search size={20} style={{ opacity: 0.4 }} />
              <span>No conversations match your search</span>
            </div>
          )}
          {!loading && filteredConversations.length > 0 && (
            <div style={{ height: `${convVirtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
              {convVirtualizer.getVirtualItems().map(virtualRow => {
                const convIdx = virtualRow.index
                const conv = filteredConversations[convIdx]
                const active = selected?.guid === conv.guid
                const isGroup = isGroupChat(conv)
                const isSel = selectedConvs.has(conv.guid)
                const isFocused = focusedConvIndex === convIdx
                const isPinned = pinnedConvs.includes(conv.guid)
                const prevConv = convIdx > 0 ? filteredConversations[convIdx - 1] : null
                const isPinnedDivider = !isPinned && prevConv && pinnedConvs.includes(prevConv.guid)
                return (
                  <button
                    key={conv.guid}
                    role="listitem"
                    ref={convVirtualizer.measureElement}
                    data-index={virtualRow.index}
                    onClick={() => {
                  if (selectMode) {
                    setSelectedConvs(prev => {
                      const next = new Set(prev)
                      if (next.has(conv.guid)) next.delete(conv.guid)
                      else next.add(conv.guid)
                      return next
                    })
                  } else {
                    setSelected(conv)
                    setComposeMode(false)
                  }
                }}
                onContextMenu={e => {
                  e.preventDefault()
                  setConvCtx({ x: e.clientX, y: e.clientY, convGuid: conv.guid, isUnread: !!conv.isUnread, isMuted: mutedConvs.includes(conv.guid), isPinned: pinnedConvs.includes(conv.guid) })
                }}
                style={{
                  position: 'absolute', top: 0, left: 0, width: '100%',
                  transform: `translateY(${virtualRow.start}px)`,
                  display: 'flex', alignItems: 'center', gap: '12px',
                  padding: isPinnedDivider ? '10px 6px 6px 14px' : '6px 6px 6px 14px',
                  justifyContent: 'flex-start',
                  background: isFocused ? 'rgba(167,139,250,0.10)' : isSel ? 'rgba(0,122,255,0.08)' : 'transparent',
                  border: 'none', borderRadius: '10px', cursor: 'pointer',
                  textAlign: 'left', transition: 'background 0.15s', marginBottom: '2px',
                  outline: isFocused ? '1px solid rgba(167,139,250,0.4)' : 'none',
                  outlineOffset: '-1px',
                  borderTop: isPinnedDivider ? '1px solid rgba(255,255,255,0.06)' : 'none',
                }}
                onMouseEnter={e => { if (!isSel && !isFocused) e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
                onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = isFocused ? 'rgba(167,139,250,0.10)' : 'transparent' }}
              >
                {(() => {
                  // Progressive fade: starts immediately from avatar-only (72px)
                  // Name appears 72→160, preview 120→200, timestamp 100→180
                  const textOpacity = panelWidth >= 160 ? 1 : panelWidth <= 72 ? 0 : (panelWidth - 72) / 88
                  const previewOpacity = panelWidth >= 200 ? 1 : panelWidth <= 120 ? 0 : (panelWidth - 120) / 80
                  const timeOpacity = panelWidth >= 180 ? 1 : panelWidth <= 100 ? 0 : (panelWidth - 100) / 80
                  const avatarSize = 44
                  return (
                    <>
                      {selectMode && textOpacity > 0 && (
                        <div style={{
                          width: '22px', height: '22px', borderRadius: '50%', flexShrink: 0,
                          border: isSel ? 'none' : '2px solid var(--text-muted)',
                          background: isSel ? 'var(--apple-blue)' : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          opacity: textOpacity,
                        }}>
                          {isSel && <Check size={13} color="#fff" strokeWidth={3} />}
                        </div>
                      )}

                      {!selectMode && conv.isUnread && (
                        <div style={{
                          position: 'absolute',
                          ...(textOpacity === 0
                            ? { top: '2px', right: '2px', left: 'auto', transform: 'none' }
                            : { left: '-2px', top: '50%', transform: 'translateY(-50%)' }),
                          width: '8px', height: '8px', borderRadius: '50%', background: 'var(--apple-blue)',
                        }} />
                      )}

                      <div style={{ position: 'relative', flexShrink: 0 }}>
                        {isGroup
                          ? <GroupAvatar conv={conv} size={avatarSize} />
                          : <ContactAvatar
                              address={conv.chatId || conv.participants?.[0]?.address || ''}
                              name={conv.displayName}
                              isImsg={isIMessage(conv)}
                              size={avatarSize}
                            />
                        }
                      </div>
                      {textOpacity > 0 && (
                        <div style={{ flex: 1, minWidth: 0, opacity: textOpacity }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                            <span style={{
                              fontSize: '13px', fontWeight: conv.isUnread ? 700 : 600,
                              color: active ? '#fff' : 'var(--text-primary)',
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                              display: 'flex', alignItems: 'center', gap: '4px',
                            }}>
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{contactLabel(conv)}</span>
                              {pinnedConvs.includes(conv.guid) && <Pin size={11} style={{ flexShrink: 0, opacity: 0.5 }} />}
                              {mutedConvs.includes(conv.guid) && <BellOff size={11} style={{ flexShrink: 0, opacity: 0.5 }} />}
                            </span>
                            {timeOpacity > 0 && (
                              <span style={{
                                fontSize: '10px', color: conv.isUnread ? 'var(--apple-blue)' : 'var(--text-muted)',
                                fontFamily: "'JetBrains Mono', monospace", flexShrink: 0, opacity: timeOpacity,
                              }}>
                                {timeAgo(conv.lastDate)}
                              </span>
                            )}
                          </div>
                          {previewOpacity > 0 && (
                            <div style={{
                              fontSize: '12px',
                              color: conv.isUnread ? 'var(--text-primary)' : 'var(--text-secondary)',
                              fontWeight: conv.isUnread ? 500 : 400,
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                              marginTop: '3px', opacity: previewOpacity,
                            }}>
                              {conv.lastFromMe ? 'You: ' : ''}{cleanPayloadText(conv.lastMessage)}
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )
                })()}
                  </button>
                )
              })}
            </div>
          )}
          {loadingMoreConvs && (
            <div style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
              Loading more...
            </div>
          )}
        </div>

        {selectMode && selectedConvs.size > 0 && panelWidth >= 180 && (
          <div style={{
            padding: '10px 14px', borderTop: '1px solid var(--border)',
            display: 'flex', gap: '8px',
            animation: 'replySlideDown 0.2s var(--ease-spring)',
          }}>
            <button onClick={() => batchMarkReadStatus('read')} style={{
              flex: 1, padding: '8px', fontSize: '12px', fontWeight: 600,
              background: 'rgba(0,122,255,0.12)', border: '1px solid rgba(0,122,255,0.2)',
              borderRadius: '8px', color: '#5ac8fa', cursor: 'pointer',
            }}>
              Mark Read ({selectedConvs.size})
            </button>
            <button onClick={() => batchMarkReadStatus('unread')} style={{
              flex: 1, padding: '8px', fontSize: '12px', fontWeight: 600,
              background: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.2)',
              borderRadius: '8px', color: 'var(--accent-bright)', cursor: 'pointer',
            }}>
              Mark Unread ({selectedConvs.size})
            </button>
            <button onClick={() => {
              const guids = Array.from(selectedConvs)
              setConversations(prev => prev.filter(c => !guids.includes(c.guid)))
              if (selected && guids.includes(selected.guid)) setSelected(null)
              setSelectedConvs(new Set())
              setSelectMode(false)
            }} style={{
              flex: 1, padding: '8px', fontSize: '12px', fontWeight: 600,
              background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.2)',
              borderRadius: '8px', color: '#f87171', cursor: 'pointer',
            }}>
              Delete ({selectedConvs.size})
            </button>
          </div>
        )}
      </div>

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
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, position: 'relative' }}>
          <div style={{
            padding: '0 20px', height: '57px', borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', gap: '12px',
          }}>
            <button
              onClick={() => { setSelected(null); setMessages([]); setMessageMenu(null); setReplyTo(null); setPanelWidth(340) }}
              aria-label="Back to conversations"
              style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: 'var(--text-secondary)', display: 'flex', padding: '4px',
              }}
            >
              <ArrowLeft size={18} />
            </button>
            {isGroupChat(selected)
              ? <GroupAvatar conv={selected} size={34} />
              : <ContactAvatar
                  address={selected.chatId || selected.participants?.[0]?.address || ''}
                  name={selected.displayName}
                  isImsg={isIMessage(selected)}
                  size={34}
                />
            }
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '14px', fontWeight: 600 }}>{contactLabel(selected)}</div>
              <div style={{
                fontSize: '10px',
                color: isIMessage(selected) ? '#5ac8fa' : 'var(--apple-green)',
                fontFamily: "'JetBrains Mono', monospace",
              }}>
                {isIMessage(selected) ? 'iMessage' : 'SMS'}
                {isGroupChat(selected) && (
                  <span style={{ color: 'var(--text-muted)', marginLeft: '6px' }}>
                    {selected.participants.length} people
                  </span>
                )}
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: '4px',
                  marginLeft: '8px', fontSize: '9px',
                  color: sseConnected ? 'var(--apple-green, #34c759)' : '#ffcc00',
                }}>
                  <span style={{
                    width: '6px', height: '6px', borderRadius: '50%',
                    background: sseConnected ? '#34c759' : '#ffcc00',
                    boxShadow: sseConnected ? '0 0 4px rgba(52,199,89,0.5)' : '0 0 4px rgba(255,204,0,0.5)',
                    display: 'inline-block', flexShrink: 0,
                    animation: sseConnected ? undefined : 'pulse 1.5s ease-in-out infinite',
                  }} />
                  {!sseConnected && 'Reconnecting...'}
                </span>
              </div>
            </div>
            {isGroupChat(selected) && (
              <div style={{ display: 'flex', gap: '0', marginLeft: 'auto' }}>
                {selected.participants.slice(0, 6).map((p, i) => (
                  <div key={p.address} style={{ marginLeft: i === 0 ? 0 : '-6px', zIndex: 6 - i }}>
                    <ContactAvatar address={p.address} name={
                      (() => {
                        const digits = p.address.replace(/\D/g, '')
                        const normalized = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
                        return contactLookup[normalized] || contactLookup[p.address.toLowerCase()] || null
                      })()
                    } size={26} />
                  </div>
                ))}
                {selected.participants.length > 6 && (
                  <div style={{
                    marginLeft: '-6px', width: '26px', height: '26px', borderRadius: '50%',
                    background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '9px', color: 'var(--text-muted)', fontWeight: 600,
                  }}>+{selected.participants.length - 6}</div>
                )}
              </div>
            )}
            <button
              onClick={() => {
                setShowMessageSearch(s => {
                  if (s) { setMessageSearch(''); setActiveMatchIndex(0) }
                  else { setTimeout(() => searchInputRef.current?.focus(), 50) }
                  return !s
                })
              }}
              aria-label="Search messages"
              style={{
                background: showMessageSearch ? 'rgba(167,139,250,0.12)' : 'transparent',
                border: '1px solid var(--border)', borderRadius: '8px',
                color: showMessageSearch ? 'var(--accent-bright)' : 'var(--text-secondary)',
                padding: '6px 8px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, marginLeft: isGroupChat(selected) ? '0' : 'auto',
                transition: 'all 0.15s',
              }}
            >
              <Search size={14} />
            </button>
          </div>

          {/* Message search bar */}
          {showMessageSearch && (
            <div style={{
              padding: '8px 20px', borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', gap: '8px',
              background: 'rgba(167,139,250,0.03)',
              animation: 'searchSlideDown 0.2s var(--ease-spring)', overflow: 'hidden',
            }}>
              <Search size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search in conversation..."
                value={messageSearch}
                onChange={e => setMessageSearch(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    if (e.shiftKey) jumpToPrevMatch()
                    else jumpToNextMatch()
                  }
                }}
                style={{
                  flex: 1, padding: '6px 10px', fontSize: '12px',
                  background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                  borderRadius: '8px', color: 'var(--text-primary)', outline: 'none',
                  fontFamily: 'inherit',
                }}
                onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent)' }}
                onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
              />
              {messageSearch && (
                <span style={{
                  fontSize: '11px', color: 'var(--text-muted)',
                  fontFamily: "'JetBrains Mono', monospace",
                  whiteSpace: 'nowrap', flexShrink: 0,
                }}>
                  {searchMatches.length > 0
                    ? `${activeMatchIndex + 1} of ${searchMatches.length}`
                    : '0 results'}
                </span>
              )}
              <div style={{ display: 'flex', gap: '2px', flexShrink: 0 }}>
                <button onClick={jumpToPrevMatch} disabled={searchMatches.length === 0}
                  aria-label="Previous match"
                  style={{
                    background: 'transparent', border: 'none', cursor: searchMatches.length > 0 ? 'pointer' : 'default',
                    color: searchMatches.length > 0 ? 'var(--text-secondary)' : 'var(--text-muted)',
                    display: 'flex', padding: '4px', borderRadius: '4px',
                    opacity: searchMatches.length > 0 ? 1 : 0.4,
                  }}
                >
                  <ChevronUp size={14} />
                </button>
                <button onClick={jumpToNextMatch} disabled={searchMatches.length === 0}
                  aria-label="Next match"
                  style={{
                    background: 'transparent', border: 'none', cursor: searchMatches.length > 0 ? 'pointer' : 'default',
                    color: searchMatches.length > 0 ? 'var(--text-secondary)' : 'var(--text-muted)',
                    display: 'flex', padding: '4px', borderRadius: '4px',
                    opacity: searchMatches.length > 0 ? 1 : 0.4,
                  }}
                >
                  <ChevronDown size={14} />
                </button>
              </div>
              <button onClick={() => { setShowMessageSearch(false); setMessageSearch(''); setActiveMatchIndex(0) }}
                aria-label="Close search"
                style={{
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  color: 'var(--text-muted)', display: 'flex', padding: '4px', borderRadius: '4px',
                }}
              >
                <X size={14} />
              </button>
            </div>
          )}

          {/* Messages */}
          <div
            ref={scrollContainerRef}
            onScroll={handleScroll}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            aria-live="polite"
            style={{
              flex: 1, overflowY: msgsLoading ? 'hidden' : 'auto', padding: '16px 20px',
              position: 'relative',
            }}
          >
            {/* Drag-and-drop overlay */}
            {dragOver && (
              <div style={{
                position: 'absolute', inset: 0, zIndex: 50,
                background: 'rgba(167,139,250,0.08)',
                backdropFilter: 'blur(4px)',
                border: '2px dashed rgba(167,139,250,0.4)',
                borderRadius: '12px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexDirection: 'column', gap: '8px',
                pointerEvents: 'none',
              }}>
                <Paperclip size={32} style={{ color: 'var(--accent-bright)', opacity: 0.7 }} />
                <span style={{
                  fontSize: '14px', fontWeight: 600, color: 'var(--accent-bright)',
                  opacity: 0.9,
                }}>
                  Drop to attach
                </span>
              </div>
            )}
            {loadingMore && (
              <div style={{ textAlign: 'center', padding: '12px 0', color: 'var(--text-muted)', fontSize: '11px' }}>
                <svg width="16" height="16" viewBox="0 0 16 16" style={{ animation: 'spin 1s linear infinite', verticalAlign: 'middle', marginRight: '6px' }}>
                  <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="19 19" strokeLinecap="round" />
                </svg>
                Loading older messages...
              </div>
            )}
            {msgsLoading && <MessagesThreadSkeleton />}
            {!msgsLoading && messages.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', padding: '8px 0' }}>
              {messages.map((msg, idx) => {
              const fromMe = !!msg.isFromMe
              const prevMsg = messages[idx - 1]
              const nextMsg = messages[idx + 1]
              const prevSameSender = prevMsg && !!prevMsg.isFromMe === fromMe &&
                (fromMe || prevMsg.handle?.address === msg.handle?.address)
              const nextSameSender = nextMsg && !!nextMsg.isFromMe === fromMe &&
                (fromMe || nextMsg.handle?.address === msg.handle?.address)
              const isStickerMsg = msg.attachments?.some(a => a.isSticker) === true
              const imsg = isIMessage(selected)
              const showTime = shouldShowTimestamp(messages, idx)
              const isGroup = isGroupChat(selected)
              const showSenderName = isGroup && !fromMe && !prevSameSender

              const br = fromMe
                ? { topLeft: '18px', topRight: prevSameSender && !showTime ? '4px' : '18px', bottomLeft: '18px', bottomRight: nextSameSender ? '4px' : '18px' }
                : { topLeft: prevSameSender && !showTime ? '4px' : '18px', topRight: '18px', bottomLeft: nextSameSender ? '4px' : '18px', bottomRight: '18px' }

              const showMsgAvatar = isGroup && !fromMe && !nextSameSender
              const replyTarget = msg.threadOriginatorGuid
                ? messages.find(m => m.guid === msg.threadOriginatorGuid) ?? null
                : null
              const firstUrl = msg.text ? extractFirstUrl(msg.text) : null
              let cleanText = cleanPayloadText(msg.text)
              // If there's a link preview, remove redundant bare domain/path lines
              // that iMessage creates when it splits a URL across lines
              if (firstUrl && cleanText) {
                try {
                  const urlObj = new URL(firstUrl)
                  const domain = urlObj.hostname.replace(/^www\./, '')
                  // Remove lines that are just the domain or a URL path fragment
                  cleanText = cleanText.split('\n').filter(line => {
                    const t = line.trim()
                    if (!t) return true
                    if (t === domain || t === `www.${domain}`) return false
                    if (t.startsWith('/') && firstUrl.includes(t)) return false
                    return true
                  }).join('\n').trim()
                } catch { /* ignore */ }
              }

              if (msg.groupTitle || msg.groupActionType) {
                return (
                  <div key={msg.guid}>
                    <div style={{
                      textAlign: 'center', padding: '8px 0',
                      fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic',
                    }}>
                      {msg.groupTitle ? `Named the conversation "${msg.groupTitle}"` : 'Group updated'}
                    </div>
                  </div>
                )
              }

              return (
                <div key={msg.guid} data-msg-guid={msg.guid}>
                <div style={{ animation: msg.guid.startsWith('temp-') ? 'msgSlideUp 0.2s var(--ease-spring)' : undefined }}>
                  {showTime && (
                    <div style={{ textAlign: 'center', padding: '14px 0 10px', fontSize: '11px', color: 'var(--text-muted)', fontWeight: 500 }}>
                      {formatTimestamp(msg.dateCreated)}
                    </div>
                  )}

                  {showSenderName && (
                    <div style={{
                      fontSize: '11px', fontWeight: 500, color: 'var(--text-secondary)',
                      paddingLeft: isGroup ? '42px' : '0', marginBottom: '2px', marginTop: '6px',
                    }}>
                      {resolveSenderName(msg.handle, contactLookup)}
                    </div>
                  )}

                  <div className="msg-row" style={{
                    display: 'flex', justifyContent: fromMe ? 'flex-end' : 'flex-start',
                    alignItems: 'center', gap: '4px',
                    marginTop: prevSameSender && !showTime ? '1px' : '4px',
                  }}>
                    {/* Action hints — left of sent messages */}
                    {fromMe && !msg.guid.startsWith('temp-') && (
                      <div className="reply-hint" style={{ display: 'flex', gap: '2px', flexShrink: 0, transition: 'opacity 0.15s' }}>
                        <button onClick={() => {
                            const rect = document.querySelector(`[data-msg-guid="${msg.guid}"]`)?.getBoundingClientRect()
                            if (rect) setMessageMenu({ msgGuid: msg.guid, msg, x: rect.left + rect.width / 2, y: rect.top, fromMe })
                          }}
                          style={{
                            background: 'transparent', border: 'none', cursor: 'pointer',
                            color: 'var(--text-muted)', display: 'flex', padding: '4px',
                            borderRadius: '50%', transition: 'all 0.15s var(--ease-spring)',
                          }}
                          title="React"
                          aria-label="React"
                        >
                          <SmilePlus size={14} />
                        </button>
                        <button onClick={() => { setReplyTo(msg); inputRef.current?.focus() }}
                          style={{
                            background: 'transparent', border: 'none', cursor: 'pointer',
                            color: 'var(--text-muted)', display: 'flex', padding: '4px',
                            borderRadius: '50%', transition: 'all 0.15s var(--ease-spring)',
                          }}
                          title="Reply"
                          aria-label="Reply"
                        >
                          <CornerUpLeft size={14} />
                        </button>
                      </div>
                    )}

                    {isGroup && !fromMe && (
                      <div style={{ width: '28px', flexShrink: 0 }}>
                        {showMsgAvatar && (
                          <ContactAvatar address={msg.handle?.address || ''} name={resolveSenderName(msg.handle, contactLookup)} size={28} />
                        )}
                      </div>
                    )}

                    <div data-msg-guid={msg.guid} style={{
                      maxWidth: '70%', display: 'flex', flexDirection: 'column',
                      opacity: msg.guid.startsWith('temp-') ? 0.7 : msg._failed ? 0.6 : 1,
                      transition: 'opacity 0.2s',
                    }}>
                      {/* Reply context */}
                      {replyTarget && (
                        <>
                          <div style={{
                            fontSize: '11px',
                            color: fromMe ? 'rgba(255,255,255,0.55)' : 'var(--text-muted)',
                            padding: '0 12px', display: 'flex', alignItems: 'center', gap: '4px',
                            marginBottom: '1px',
                          }}>
                            <CornerUpLeft size={10} style={{ flexShrink: 0 }} />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {replyTarget.isFromMe ? 'You' : resolveSenderName(replyTarget.handle, contactLookup)}
                            </span>
                          </div>
                          <div style={{
                            fontSize: '11px', padding: '5px 10px', marginBottom: '2px',
                            borderRadius: '10px',
                            background: fromMe ? 'rgba(255,255,255,0.1)' : 'rgba(120,120,140,0.1)',
                            border: fromMe ? '1px solid rgba(255,255,255,0.1)' : '1px solid var(--border)',
                            color: fromMe ? 'rgba(255,255,255,0.65)' : 'var(--text-secondary)',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            alignSelf: fromMe ? 'flex-end' : 'flex-start',
                          }}>
                            {cleanPayloadText(replyTarget.text) || (replyTarget.attachments?.length ? 'Attachment' : 'Message')}
                          </div>
                        </>
                      )}

                      <div
                        onContextMenu={e => {
                          e.preventDefault()
                          const rect = e.currentTarget.getBoundingClientRect()
                          setMessageMenu({ msgGuid: msg.guid, msg, x: rect.left + rect.width / 2, y: rect.top, fromMe })
                        }}
                        style={{
                          padding: isStickerMsg ? '0' :
                            msg.attachments?.some(a => a.mimeType?.startsWith('image/') || a.mimeType?.startsWith('video/'))
                            ? '3px' : '8px 14px',
                          borderRadius: `${br.topLeft} ${br.topRight} ${br.bottomRight} ${br.bottomLeft}`,
                          background: isStickerMsg ? 'transparent' : fromMe
                            ? (imsg ? 'linear-gradient(135deg, #5ac8fa, #007aff)' : 'linear-gradient(135deg, #34c759, #30b04e)')
                            : 'var(--bg-elevated)',
                          color: fromMe ? '#fff' : 'var(--text-primary)',
                          fontSize: '13px', lineHeight: 1.45, wordBreak: 'break-word',
                          border: isStickerMsg ? 'none' : fromMe ? 'none' : '1px solid var(--border)',
                          cursor: 'default', overflow: 'hidden',
                        }}
                        title={formatTime(msg.dateCreated)}
                      >
                        {msg.attachments && msg.attachments.length > 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: cleanText ? '6px' : 0 }}>
                            {msg.attachments.map((att) => {
                              const mime = att.mimeType || ''
                              const src = `${API_BASE}/api/messages/attachment?guid=${encodeURIComponent(att.guid)}${att.uti ? `&uti=${encodeURIComponent(att.uti)}` : ''}`

                              if (msg.isAudioMessage || mime.startsWith('audio/') || att.transferName?.endsWith('.caf')) {
                                return <AudioWaveform key={att.guid} src={src} fromMe={fromMe} guid={att.guid} />
                              }

                              if (mime.startsWith('image/') || att.isSticker) {
                                return (
                                  <img key={att.guid} src={src} alt={att.transferName || 'image'}
                                    style={{
                                      maxWidth: att.isSticker ? '160px' : 'min(280px, 50vw)',
                                      maxHeight: att.isSticker ? '160px' : '420px',
                                      width: 'auto', height: 'auto',
                                      objectFit: 'contain',
                                      borderRadius: att.isSticker ? '4px' : `${br.topLeft} ${br.topRight} ${br.bottomRight} ${br.bottomLeft}`,
                                      display: 'block', cursor: 'zoom-in',
                                    }}
                                    loading="lazy"
                                    onClick={e => { e.stopPropagation(); setLightbox({ src, type: 'image' }) }}
                                    onLoad={() => { if (isNearBottomRef.current) scrollToBottom('instant') }}
                                    onMouseEnter={e => { if (att.isSticker) e.currentTarget.style.animation = 'stickerWobble 0.5s ease' }}
                                    onAnimationEnd={e => { e.currentTarget.style.animation = '' }}
                                  />
                                )
                              }

                              if (mime.startsWith('video/')) {
                                return (
                                  <VideoThumbnail key={att.guid} src={src} br={br}
                                    onClick={() => setLightbox({ src, type: 'video' })} />
                                )
                              }

                              if (mime === 'application/pdf') {
                                return (
                                  <a key={att.guid} href={src} target="_blank" rel="noreferrer"
                                    onClick={e => e.stopPropagation()} style={{
                                      display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px',
                                      background: fromMe ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)',
                                      borderRadius: '10px', textDecoration: 'none',
                                      border: fromMe ? '1px solid rgba(255,255,255,0.15)' : '1px solid var(--border)',
                                    }}>
                                    <div style={{
                                      width: '32px', height: '32px', borderRadius: '6px',
                                      background: '#ff3b30', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                      fontSize: '10px', fontWeight: 700, color: '#fff', flexShrink: 0,
                                    }}>PDF</div>
                                    <div style={{ minWidth: 0 }}>
                                      <div style={{
                                        fontSize: '12px', fontWeight: 600,
                                        color: fromMe ? 'rgba(255,255,255,0.9)' : 'var(--text-primary)',
                                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                      }}>{att.transferName || 'Document.pdf'}</div>
                                      <div style={{ fontSize: '10px', color: fromMe ? 'rgba(255,255,255,0.5)' : 'var(--text-muted)' }}>
                                        PDF Document
                                      </div>
                                    </div>
                                  </a>
                                )
                              }

                              return (
                                <a key={att.guid} href={src} target="_blank" rel="noreferrer"
                                  onClick={e => e.stopPropagation()} style={{
                                    display: 'flex', alignItems: 'center', gap: '6px',
                                    fontSize: '12px', color: fromMe ? 'rgba(255,255,255,0.8)' : 'var(--accent)',
                                    textDecoration: 'none', padding: '4px 8px',
                                  }}>
                                  <Paperclip size={12} />
                                  {att.transferName || 'Attachment'}
                                </a>
                              )
                            })}
                          </div>
                        )}

                        {msg.isAudioMessage && (!msg.attachments || msg.attachments.length === 0) && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 8px' }}>
                            <Mic size={14} />
                            <span style={{ fontSize: '12px', fontStyle: 'italic' }}>Audio Message</span>
                          </div>
                        )}

                        {cleanText ? (
                          <div style={{
                            padding: msg.attachments?.some(a =>
                              a.mimeType?.startsWith('image/') || a.mimeType?.startsWith('video/')
                            ) ? '4px 10px 6px' : '0',
                          }}>
                            {(() => {
                              const nodes = renderTextWithLinks(cleanText, fromMe)
                              if (!messageSearch.trim()) return nodes
                              const isActive = searchMatches.length > 0 && searchMatches[activeMatchIndex] === idx
                              return highlightSearchText(nodes, messageSearch, isActive)
                            })()}
                          </div>
                        ) : !msg.attachments?.length && !msg.isAudioMessage ? (
                          <span style={{ fontSize: '12px', fontStyle: 'italic', opacity: 0.6 }}>
                            {msg.itemType === 2 ? 'Sticker' : msg.balloonBundleId ? 'iMessage App' : '\u200B'}
                          </span>
                        ) : null}

                        {firstUrl && !msg.attachments?.some(a => a.mimeType?.startsWith('image/')) && (
                          <LinkPreviewCard url={firstUrl} fromMe={fromMe} />
                        )}
                      </div>

                      {msg.reactions && msg.reactions.length > 0 && (
                        <ReactionPills reactions={msg.reactions} fromMe={fromMe} />
                      )}
                    </div>

                    {/* Action hints — right of received messages */}
                    {!fromMe && !msg.guid.startsWith('temp-') && (
                      <div className="reply-hint" style={{ display: 'flex', gap: '2px', flexShrink: 0, transition: 'opacity 0.15s' }}>
                        <button onClick={() => { setReplyTo(msg); inputRef.current?.focus() }}
                          style={{
                            background: 'transparent', border: 'none', cursor: 'pointer',
                            color: 'var(--text-muted)', display: 'flex', padding: '4px',
                            borderRadius: '50%', transition: 'all 0.15s var(--ease-spring)',
                          }}
                          title="Reply"
                          aria-label="Reply"
                        >
                          <CornerUpLeft size={14} />
                        </button>
                        <button onClick={() => {
                            const rect = document.querySelector(`[data-msg-guid="${msg.guid}"]`)?.getBoundingClientRect()
                            if (rect) setMessageMenu({ msgGuid: msg.guid, msg, x: rect.left + rect.width / 2, y: rect.top, fromMe })
                          }}
                          style={{
                            background: 'transparent', border: 'none', cursor: 'pointer',
                            color: 'var(--text-muted)', display: 'flex', padding: '4px',
                            borderRadius: '50%', transition: 'all 0.15s var(--ease-spring)',
                          }}
                          title="React"
                          aria-label="React"
                        >
                          <SmilePlus size={14} />
                        </button>
                      </div>
                    )}
                  </div>

                  {fromMe && msg._failed && (
                    <div style={{
                      textAlign: 'right', fontSize: '10px', color: '#ff453a',
                      padding: '2px 4px 0', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '5px',
                      fontFamily: "'JetBrains Mono', monospace",
                    }}>
                      <AlertCircle size={11} />
                      <span>Failed to send</span>
                      <button
                        onClick={() => retryMessage(msg)}
                        style={{
                          background: 'transparent', border: 'none', cursor: 'pointer',
                          color: 'var(--apple-blue, #007aff)', fontSize: '10px', fontWeight: 500,
                          padding: '0 2px', fontFamily: "'JetBrains Mono', monospace",
                        }}
                      >
                        Retry
                      </button>
                      <button
                        onClick={() => dismissFailedMessage(msg.guid)}
                        style={{
                          background: 'transparent', border: 'none', cursor: 'pointer',
                          color: 'var(--text-muted)', display: 'flex', padding: '0 1px',
                        }}
                        title="Dismiss"
                      >
                        <X size={11} />
                      </button>
                    </div>
                  )}
                  {fromMe && msg.guid.startsWith('temp-') && !msg._failed && (
                    <div style={{
                      textAlign: 'right', fontSize: '10px', color: 'var(--text-muted)',
                      padding: '2px 4px 0', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px',
                      fontFamily: "'JetBrains Mono', monospace",
                    }}>
                      <svg width="12" height="12" viewBox="0 0 12 12" style={{ animation: 'spin 1s linear infinite' }}>
                        <circle cx="6" cy="6" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="14 14" strokeLinecap="round" />
                      </svg>
                      Sending...
                    </div>
                  )}
                  {deliveryMarkers[msg.guid] && fromMe && !msg.guid.startsWith('temp-') && (
                    <div style={{
                      textAlign: 'right', fontSize: '10px',
                      color: deliveryMarkers[msg.guid].startsWith('Read')
                        ? 'var(--apple-blue, #007aff)'
                        : 'var(--text-muted)',
                      padding: '2px 4px 0',
                      fontFamily: "'JetBrains Mono', monospace",
                      fontWeight: deliveryMarkers[msg.guid].startsWith('Read') ? 500 : 400,
                      display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '3px',
                    }}>
                      {deliveryMarkers[msg.guid].startsWith('Read') || deliveryMarkers[msg.guid] === 'Delivered'
                        ? <CheckCheck size={12} />
                        : <Check size={12} />}
                      {deliveryMarkers[msg.guid]}
                    </div>
                  )}
                </div>
                </div>
              )
            })}
            </div>
            )}
            <div style={{ height: '1px', flexShrink: 0 }} />
          </div>

          {/* Scroll FAB */}
          {showScrollBtn && messages.length > 0 && (
            <button onClick={() => scrollToBottom('smooth')} aria-label="Scroll to bottom" style={{
              position: 'absolute', bottom: replyTo ? '130px' : '80px', right: '20px',
              width: '36px', height: '36px', borderRadius: '50%',
              background: 'rgba(30,30,38,0.85)',
              backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
              border: '1px solid var(--border)', color: 'var(--text-secondary)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 16px rgba(0,0,0,0.3)', zIndex: 10,
              animation: 'scrollBtnIn 0.2s var(--ease-spring)',
            }}>
              <ChevronDown size={18} />
            </button>
          )}

          {/* Reply composer */}
          {replyTo && (
            <div style={{
              padding: '8px 20px', borderTop: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', gap: '10px',
              background: 'rgba(167,139,250,0.04)',
              animation: 'replySlideDown 0.2s var(--ease-spring)', overflow: 'hidden',
            }}>
              <CornerUpLeft size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--accent)' }}>
                  Replying to {replyTo.isFromMe ? 'yourself' : resolveSenderName(replyTo.handle, contactLookup)}
                </div>
                <div style={{
                  fontSize: '12px', color: 'var(--text-secondary)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {cleanPayloadText(replyTo.text) || (replyTo.attachments?.length ? 'Attachment' : 'Message')}
                </div>
              </div>
              <button onClick={() => setReplyTo(null)} aria-label="Cancel reply" style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: 'var(--text-muted)', display: 'flex', padding: '4px', borderRadius: '50%',
              }}>
                <X size={14} />
              </button>
            </div>
          )}

          {/* Attachment preview */}
          {attachmentPreview && (
            <div style={{
              padding: '8px 20px', borderTop: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', gap: '10px',
              animation: 'replySlideDown 0.2s var(--ease-spring)',
            }}>
              {attachmentFile?.type.startsWith('image/') ? (
                <img src={attachmentPreview} alt="" style={{
                  width: '48px', height: '48px', borderRadius: '8px', objectFit: 'cover',
                }} />
              ) : (
                <div style={{
                  width: '48px', height: '48px', borderRadius: '8px',
                  background: 'var(--bg-elevated)', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Paperclip size={18} style={{ color: 'var(--text-muted)' }} />
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {attachmentFile?.name}
                </div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                  {attachmentFile ? `${(attachmentFile.size / 1024).toFixed(0)} KB` : ''}
                </div>
              </div>
              <button onClick={clearAttachment} aria-label="Remove attachment" style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: 'var(--text-muted)', display: 'flex', padding: '4px',
              }}>
                <X size={14} />
              </button>
            </div>
          )}

          {/* Input */}
          <div style={{
            padding: '12px 20px',
            borderTop: (replyTo || attachmentPreview) ? 'none' : '1px solid var(--border)',
            display: 'flex', gap: '10px', alignItems: 'flex-end',
          }}>
            <input ref={fileInputRef} type="file" accept="image/*,video/*,.pdf,.gif"
              onChange={handleFileSelect} style={{ display: 'none' }} />
            <button onClick={() => fileInputRef.current?.click()} aria-label="Attach file" style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', display: 'flex', padding: '6px',
              flexShrink: 0, borderRadius: '50%', transition: 'color 0.15s',
            }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)' }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)' }}
            >
              <Paperclip size={18} />
            </button>
            <textarea
              ref={inputRef}
              defaultValue=""
              onChange={handleDraftChange}
              onPaste={handlePaste}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
              placeholder={isIMessage(selected) ? 'iMessage' : 'Text Message'}
              aria-label="Type a message"
              rows={1}
              style={{
                flex: 1, background: 'var(--bg-elevated)',
                border: '1px solid var(--border)', borderRadius: '20px',
                padding: '10px 16px', color: 'var(--text-primary)',
                fontSize: '13px', resize: 'none', outline: 'none',
                fontFamily: 'inherit', maxHeight: '100px', lineHeight: 1.4,
              }}
              onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent)' }}
              onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
            />
            <button
              onClick={sendMessage}
              disabled={(!hasDraft && !attachmentFile) || sending}
              aria-label="Send message"
              style={{
                width: '36px', height: '36px', borderRadius: '50%', border: 'none',
                background: (hasDraft || attachmentFile)
                  ? (isIMessage(selected) ? 'linear-gradient(135deg, #5ac8fa, #007aff)' : 'linear-gradient(135deg, #34c759, #30b04e)')
                  : 'var(--bg-elevated)',
                color: (hasDraft || attachmentFile) ? '#fff' : 'var(--text-muted)',
                cursor: (hasDraft || attachmentFile) ? 'pointer' : 'default',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, transition: 'all 0.2s var(--ease-spring)',
                transform: hasDraft ? 'scale(1)' : 'scale(0.9)',
              }}
            >
              <Send size={16} style={{ marginLeft: '-1px' }} />
            </button>
          </div>
        </div>
      ) : composeMode ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, position: 'relative' }}>
          <div style={{
            padding: '0 20px', height: '57px', borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', gap: '12px',
          }}>
            <button
              onClick={() => { setComposeMode(false); setPanelWidth(340) }}
              aria-label="Back to conversations"
              style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: 'var(--text-secondary)', display: 'flex', padding: '4px',
              }}
            >
              <ArrowLeft size={18} />
            </button>
            <PenSquare size={20} style={{ color: 'var(--accent)', flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '14px', fontWeight: 600 }}>New Message</div>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', monospace" }}>
                Compose
              </div>
            </div>
          </div>
          <div style={{
            padding: '12px 20px', borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', gap: '10px',
          }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', flexShrink: 0 }}>To:</span>
            <input
              type="text"
              value={composeTo}
              onChange={e => setComposeTo(e.target.value)}
              placeholder="Phone number or email"
              autoFocus
              style={{
                flex: 1, background: 'transparent', border: 'none', outline: 'none',
                color: 'var(--text-primary)', fontSize: '13px', fontFamily: 'inherit',
                padding: '4px 0',
              }}
            />
          </div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
              <MessageSquare size={32} style={{ opacity: 0.3, marginBottom: '12px' }} />
              <div>Start a new conversation</div>
            </div>
          </div>
          <div style={{
            padding: '12px 20px',
            borderTop: '1px solid var(--border)',
            display: 'flex', gap: '10px', alignItems: 'flex-end',
          }}>
            <textarea
              ref={composeInputRef}
              defaultValue=""
              onChange={e => {
                composeDraftRef.current = e.target.value
                const hasText = e.target.value.trim().length > 0
                setComposeHasDraft(prev => prev !== hasText ? hasText : prev)
                const el = e.target
                el.style.height = 'auto'
                el.style.height = `${Math.min(el.scrollHeight, 100)}px`
              }}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleComposeSend()
                }
              }}
              placeholder="Message"
              aria-label="Type a message"
              rows={1}
              style={{
                flex: 1, background: 'var(--bg-elevated)',
                border: '1px solid var(--border)', borderRadius: '20px',
                padding: '10px 16px', color: 'var(--text-primary)',
                fontSize: '13px', resize: 'none', outline: 'none',
                fontFamily: 'inherit', maxHeight: '100px', lineHeight: 1.4,
              }}
              onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent)' }}
              onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
            />
            <button
              onClick={handleComposeSend}
              disabled={!composeHasDraft || !composeTo.trim() || composeSending}
              aria-label="Send message"
              style={{
                width: '36px', height: '36px', borderRadius: '50%', border: 'none',
                background: (composeHasDraft && composeTo.trim())
                  ? 'linear-gradient(135deg, #5ac8fa, #007aff)'
                  : 'var(--bg-elevated)',
                color: (composeHasDraft && composeTo.trim()) ? '#fff' : 'var(--text-muted)',
                cursor: (composeHasDraft && composeTo.trim()) ? 'pointer' : 'default',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, transition: 'all 0.2s var(--ease-spring)',
                transform: composeHasDraft ? 'scale(1)' : 'scale(0.9)',
              }}
            >
              <Send size={16} style={{ marginLeft: '-1px' }} />
            </button>
          </div>
        </div>
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
          <div onClick={() => setConvCtx(null)} style={{ position: 'fixed', inset: 0, zIndex: 998 }} />
          <div style={{
            position: 'fixed', left: convCtx.x, top: convCtx.y, zIndex: 999,
            background: 'rgba(30,30,38,0.9)',
            backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '10px', padding: '4px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)', minWidth: '180px',
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
              icon={<Pin size={16} color="var(--text-secondary)" style={convCtx.isPinned ? { fill: 'var(--text-secondary)' } : undefined} />}
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
              icon={<BellOff size={16} color={convCtx.isMuted ? 'var(--apple-blue)' : 'var(--text-secondary)'} />}
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
      <div aria-live="polite">
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
              background: 'rgba(30,30,38,0.92)',
              backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '14px', padding: '12px 16px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
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
                    fontSize: '10px', fontWeight: 700, color: '#fff',
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
