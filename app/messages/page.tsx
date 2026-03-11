'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { MessageSquare, Send, RefreshCw, ArrowLeft, AlertCircle, User, Mic, Paperclip, X, Users, Search } from 'lucide-react'

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
}

type ServiceFilter = 'all' | 'iMessage' | 'SMS'
type LightboxData = { src: string; type: 'image' | 'video' } | null

/* ─── Constants ─────────────────────────────────────────────────────────── */

const LOUPE_W = 720
const LOUPE_H = 480

const AVATAR_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
  '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE',
  '#85C1E9', '#F8C471', '#82E0AA', '#F1948A',
  '#FF9FF3', '#54A0FF', '#5F27CD', '#01A3A4',
]

const REACTION_EMOJI: Record<number, string> = {
  2000: '❤️',
  2001: '👍',
  2002: '👎',
  2003: '😂',
  2004: '‼️',
  2005: '❓',
}

const REACTION_NAMES: { key: string; emoji: string; type: number }[] = [
  { key: 'love', emoji: '❤️', type: 2000 },
  { key: 'like', emoji: '👍', type: 2001 },
  { key: 'dislike', emoji: '👎', type: 2002 },
  { key: 'laugh', emoji: '😂', type: 2003 },
  { key: 'emphasize', emoji: '‼️', type: 2004 },
  { key: 'question', emoji: '❓', type: 2005 },
]

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
  return `${d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} ${formatTime(ts)}`
}

function contactLabel(conv: Conversation): string {
  if (conv.displayName) return conv.displayName
  const id = conv.chatId || conv.participants?.[0]?.address || conv.guid
  if (id.startsWith('+1') && id.length === 12) {
    return `(${id.slice(2, 5)}) ${id.slice(5, 8)}-${id.slice(8)}`
  }
  if (id.startsWith('+') && id.length > 10) {
    const digits = id.replace(/\D/g, '')
    if (digits.length === 11 && digits.startsWith('1')) {
      return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`
    }
    return id
  }
  return id
}

function hashColor(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

function isIMessage(conv: Conversation): boolean {
  return conv.service?.toLowerCase().includes('imessage') ||
    conv.guid?.toLowerCase().startsWith('imessage')
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

/* ─── ContactAvatar ─────────────────────────────────────────────────────── */

function ContactAvatar({ address, name, isImsg, size = 40 }: {
  address: string
  name?: string | null
  isImsg?: boolean
  size?: number
}) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const hasSavedName = !!name
  const initial = hasSavedName ? name!.charAt(0).toUpperCase() : null
  const bgColor = hashColor(address || name || 'default')

  useEffect(() => {
    if (!address) return
    const url = `/api/messages/avatar?address=${encodeURIComponent(address)}`
    const img = new Image()
    img.onload = () => setPhotoUrl(url)
    img.onerror = () => {}
    img.src = url
  }, [address])

  if (photoUrl) {
    return (
      <div style={{
        width: `${size}px`, height: `${size}px`, borderRadius: '50%', flexShrink: 0,
        overflow: 'hidden',
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
    )
  }

  return (
    <div style={{
      width: `${size}px`, height: `${size}px`, borderRadius: '50%', flexShrink: 0,
      background: isImsg !== undefined
        ? (isImsg ? 'linear-gradient(135deg, #5ac8fa, #007aff)' : 'linear-gradient(135deg, #34c759, #30b04e)')
        : bgColor,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff',
    }}>
      {initial ? (
        <span style={{ fontSize: `${Math.round(size * 0.38)}px`, fontWeight: 700 }}>{initial}</span>
      ) : (
        <User size={Math.round(size * 0.48)} strokeWidth={2} />
      )}
    </div>
  )
}

/* ─── GroupAvatar — stacked circles for group chats in list ─────────────── */

function GroupAvatar({ conv, size = 40 }: { conv: Conversation; size?: number }) {
  const parts = conv.participants || []
  if (parts.length <= 1) {
    const addr = conv.chatId || parts[0]?.address || ''
    return <ContactAvatar address={addr} name={conv.displayName} isImsg={isIMessage(conv)} size={size} />
  }

  if (parts.length === 2) {
    const s = Math.round(size * 0.65)
    return (
      <div style={{ width: `${size}px`, height: `${size}px`, position: 'relative', flexShrink: 0 }}>
        <div style={{ position: 'absolute', top: 0, left: 0 }}>
          <ContactAvatar address={parts[0].address} size={s} />
        </div>
        <div style={{ position: 'absolute', bottom: 0, right: 0, border: '2px solid var(--bg-panel)', borderRadius: '50%' }}>
          <ContactAvatar address={parts[1].address} size={s} />
        </div>
      </div>
    )
  }

  // 3+ people — show group icon
  return (
    <div style={{
      width: `${size}px`, height: `${size}px`, borderRadius: '50%', flexShrink: 0,
      background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff',
    }}>
      <Users size={Math.round(size * 0.44)} strokeWidth={2} />
    </div>
  )
}

/* ─── ReactionPills — small emoji pills below a message bubble ──────────── */

function ReactionPills({ reactions, fromMe }: { reactions: Reaction[]; fromMe: boolean }) {
  if (!reactions || reactions.length === 0) return null

  // Group by type and count
  const grouped = new Map<number, number>()
  for (const r of reactions) {
    grouped.set(r.type, (grouped.get(r.type) || 0) + 1)
  }

  return (
    <div style={{
      display: 'flex', gap: '4px',
      justifyContent: fromMe ? 'flex-end' : 'flex-start',
      marginTop: '-6px',
      paddingBottom: '2px',
      paddingLeft: fromMe ? '0' : '12px',
      paddingRight: fromMe ? '12px' : '0',
    }}>
      {Array.from(grouped.entries()).map(([type, count]) => (
        <div key={type} style={{
          display: 'flex', alignItems: 'center', gap: '2px',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          padding: '1px 6px',
          fontSize: '12px',
          lineHeight: 1,
        }}>
          <span>{REACTION_EMOJI[type] || '?'}</span>
          {count > 1 && (
            <span style={{ fontSize: '10px', color: 'var(--text-secondary)', fontWeight: 600 }}>
              {count}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

/* ─── ReactionPicker popup ──────────────────────────────────────────────── */

function ReactionPicker({ x, y, onPick, onClose }: {
  x: number; y: number
  onPick: (reaction: string) => void
  onClose: () => void
}) {
  const pickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) onClose()
    }
    const escHandler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', handler)
    document.addEventListener('keydown', escHandler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('keydown', escHandler)
    }
  }, [onClose])

  // Clamp to viewport
  const pickerW = 260
  const pickerH = 44
  const clampedX = Math.max(8, Math.min(x - pickerW / 2, window.innerWidth - pickerW - 8))
  const clampedY = Math.max(8, y - pickerH - 8)

  return (
    <div
      ref={pickerRef}
      style={{
        position: 'fixed',
        left: clampedX,
        top: clampedY,
        zIndex: 999,
        background: 'var(--bg-panel)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        border: '1px solid var(--border)',
        borderRadius: '22px',
        padding: '6px 10px',
        display: 'flex', gap: '4px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        animation: 'pickerIn 0.15s ease-out',
      }}
    >
      {REACTION_NAMES.map(r => (
        <button
          key={r.key}
          onClick={() => onPick(r.key)}
          style={{
            background: 'transparent',
            border: 'none',
            borderRadius: '50%',
            width: '36px', height: '32px',
            fontSize: '18px',
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'transform 0.1s',
          }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.3)' }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
        >
          {r.emoji}
        </button>
      ))}
    </div>
  )
}

/* ─── Main Page ─────────────────────────────────────────────────────────── */

export default function MessagesPage() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [contactLookup, setContactLookup] = useState<Record<string, string>>({})
  const [selected, setSelected] = useState<Conversation | null>(null)
  const [loading, setLoading] = useState(true)
  const [msgsLoading, setMsgsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [serviceFilter, setServiceFilter] = useState<ServiceFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Lightbox + loupe
  const [lightbox, setLightbox] = useState<LightboxData>(null)
  const [loupe, setLoupe] = useState<{ x: number; y: number; zoom: number } | null>(null)
  const loupeRef = useRef<{ x: number; y: number; zoom: number } | null>(null)
  const minZoomRef = useRef(0.5)
  const imgRef = useRef<HTMLImageElement>(null)

  // Reaction picker
  const [reactionPicker, setReactionPicker] = useState<{ msgGuid: string; x: number; y: number } | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const prevMsgCount = useRef(0)

  /* ── Data fetching ── */

  const fetchConversations = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/messages?limit=500')
      const data = await res.json()
      if (data.error) {
        setError(data.error)
      } else {
        setConversations(data.conversations ?? [])
        if (data.contacts) setContactLookup(prev => ({ ...prev, ...data.contacts }))
        setError(null)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch')
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchMessages = useCallback(async (conv: Conversation, silent = false) => {
    try {
      if (!silent) setMsgsLoading(true)
      const res = await fetch(`/api/messages?conversation=${encodeURIComponent(conv.guid)}&limit=100`)
      const data = await res.json()
      setMessages(data.messages ?? [])
      if (data.contacts) setContactLookup(prev => ({ ...prev, ...data.contacts }))
    } catch {
      if (!silent) setMessages([])
    } finally {
      if (!silent) setMsgsLoading(false)
    }
  }, [])

  useEffect(() => { fetchConversations() }, [fetchConversations])

  useEffect(() => {
    if (selected) {
      fetchMessages(selected)
      inputRef.current?.focus()
    }
  }, [selected, fetchMessages])

  // Scroll to bottom on new messages
  useEffect(() => {
    const isNewOrSent = prevMsgCount.current === 0 || messages.length > prevMsgCount.current
    prevMsgCount.current = messages.length
    if (isNewOrSent) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  // Auto-refresh every 30s
  useEffect(() => {
    if (!selected) return
    const t = setInterval(() => fetchMessages(selected, true), 30000)
    return () => clearInterval(t)
  }, [selected, fetchMessages])

  /* ── Lightbox / Loupe ── */

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setLightbox(null); setLoupe(null); setReactionPicker(null) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => { loupeRef.current = loupe }, [loupe])

  useEffect(() => {
    if (!lightbox || lightbox.type !== 'image') return
    const el = imgRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      if (!loupeRef.current) return
      e.preventDefault()
      setLoupe(l => l ? { ...l, zoom: Math.max(minZoomRef.current, Math.min(12, l.zoom - e.deltaY * 0.008)) } : null)
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [lightbox])

  /* ── Sending ── */

  const sendMessage = useCallback(async () => {
    if (!draft.trim() || !selected || sending) return
    const text = draft
    setDraft('')
    setSending(true)

    const optimistic: Message = {
      guid: `temp-${Date.now()}`,
      text,
      dateCreated: Date.now(),
      isFromMe: true,
    }
    setMessages(prev => [...prev, optimistic])

    try {
      await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatGuid: selected.guid, text }),
      })
      setTimeout(() => fetchMessages(selected), 2000)
    } catch {
      setMessages(prev => prev.filter(m => m.guid !== optimistic.guid))
      setDraft(text)
    } finally {
      setSending(false)
    }
  }, [draft, selected, sending, fetchMessages])

  const sendReaction = useCallback(async (msgGuid: string, reaction: string) => {
    if (!selected) return
    setReactionPicker(null)
    try {
      await fetch('/api/messages/react', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatGuid: selected.guid,
          selectedMessageGuid: msgGuid,
          reaction,
        }),
      })
      // Refresh to pick up the new reaction
      setTimeout(() => fetchMessages(selected, true), 1500)
    } catch {
      // Best-effort
    }
  }, [selected, fetchMessages])

  /* ── Filter conversations ── */

  const filteredConversations = conversations.filter(conv => {
    if (serviceFilter === 'iMessage' && !isIMessage(conv)) return false
    if (serviceFilter === 'SMS' && isIMessage(conv)) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      const name = contactLabel(conv).toLowerCase()
      const lastMsg = (conv.lastMessage || '').toLowerCase()
      return name.includes(q) || lastMsg.includes(q)
    }
    return true
  })

  /* ── Error state ── */

  if (error) {
    return (
      <div style={{ maxWidth: '560px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '28px' }}>
          <MessageSquare size={20} style={{ color: 'var(--accent)' }} />
          <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)' }}>Messages</h1>
        </div>
        <div className="card" style={{ padding: '32px', textAlign: 'center' }}>
          <AlertCircle size={32} style={{ color: 'var(--text-muted)', marginBottom: '16px' }} />
          {error === 'bluebubbles_not_configured' ? (
            <>
              <h2 style={{ margin: '0 0 8px', fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>BlueBubbles not configured</h2>
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
              <h2 style={{ margin: '0 0 8px', fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>Connection error</h2>
              <p style={{ margin: '0 0 16px', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                Could not reach BlueBubbles server. Make sure it&apos;s running and accessible.
              </p>
              <div style={{
                background: 'var(--bg-base)', borderRadius: '8px', border: '1px solid var(--border)',
                padding: '12px 16px', textAlign: 'left', fontFamily: 'monospace', fontSize: '11px',
                color: 'var(--red)', lineHeight: 1.6, wordBreak: 'break-all',
              }}>
                {error}
              </div>
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

  // Find the last sent message for delivery/read status
  const lastSentMsg = [...messages].reverse().find(m => m.isFromMe && !m.guid.startsWith('temp-'))

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 56px)', gap: '0', overflow: 'hidden' }}>
      <style>{`
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes pickerIn {
          from { opacity: 0; transform: scale(0.85) translateY(6px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes lightboxIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>

      {/* ═══ Conversation list ═══ */}
      <div style={{
        width: selected ? '340px' : '100%',
        maxWidth: '420px',
        minWidth: selected ? '300px' : undefined,
        borderRight: selected ? '1px solid var(--border)' : 'none',
        display: 'flex',
        flexDirection: 'column',
        transition: 'width 0.3s var(--ease-spring)',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <MessageSquare size={20} style={{ color: 'var(--accent)' }} />
            <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>Messages</h1>
            {!loading && (
              <span className="badge badge-blue" style={{ marginLeft: '2px' }}>
                {conversations.length}
              </span>
            )}
          </div>
          <button
            onClick={() => { fetchConversations(); if (selected) fetchMessages(selected) }}
            style={{
              background: 'transparent', border: '1px solid var(--border)', borderRadius: '8px',
              color: 'var(--text-secondary)', padding: '6px 8px', cursor: 'pointer',
              display: 'flex', alignItems: 'center',
            }}
          >
            <RefreshCw size={12} />
          </button>
        </div>

        {/* Search */}
        <div style={{ padding: '10px 14px 6px', position: 'relative' }}>
          <Search size={13} style={{
            position: 'absolute', left: '26px', top: '50%', transform: 'translateY(-50%)',
            color: 'var(--text-muted)', pointerEvents: 'none',
          }} />
          <input
            type="text"
            placeholder="Search"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px 8px 34px',
              fontSize: '13px',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              borderRadius: '10px',
              color: 'var(--text-primary)',
              outline: 'none',
              fontFamily: 'inherit',
            }}
            onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent)' }}
            onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
          />
        </div>

        {/* Service filter tabs */}
        <div style={{
          display: 'flex', gap: '4px', padding: '6px 14px 8px',
          borderBottom: '1px solid var(--border)',
        }}>
          {(['all', 'iMessage', 'SMS'] as ServiceFilter[]).map(f => {
            const active = serviceFilter === f
            const count = f === 'all' ? conversations.length
              : conversations.filter(c => f === 'iMessage' ? isIMessage(c) : !isIMessage(c)).length
            return (
              <button
                key={f}
                onClick={() => setServiceFilter(f)}
                style={{
                  flex: 1,
                  padding: '6px 8px',
                  fontSize: '11px',
                  fontWeight: active ? 600 : 450,
                  color: active ? '#fff' : 'var(--text-secondary)',
                  background: active
                    ? (f === 'iMessage' ? 'rgba(0, 122, 255, 0.25)' : f === 'SMS' ? 'rgba(52, 199, 89, 0.2)' : 'rgba(167, 139, 250, 0.15)')
                    : 'transparent',
                  border: active ? 'none' : '1px solid var(--border)',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {f === 'all' ? 'All' : f} <span style={{ opacity: 0.6, fontSize: '10px' }}>{count}</span>
              </button>
            )
          })}
        </div>

        {/* Conversation list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 8px' }}>
          {loading && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '8px 0' }}>
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} style={{
                  height: '64px', borderRadius: '10px',
                  background: 'linear-gradient(90deg, var(--bg-elevated) 25%, var(--bg-panel) 50%, var(--bg-elevated) 75%)',
                  backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite',
                }} />
              ))}
            </div>
          )}
          {!loading && filteredConversations.map((conv) => {
            const active = selected?.guid === conv.guid
            const isGroup = isGroupChat(conv)
            return (
              <button
                key={conv.guid}
                onClick={() => setSelected(conv)}
                style={{
                  width: '100%',
                  display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '12px',
                  background: active ? 'rgba(167, 139, 250, 0.12)' : 'transparent',
                  border: 'none',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s',
                  marginBottom: '2px',
                }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
              >
                {isGroup
                  ? <GroupAvatar conv={conv} size={42} />
                  : <ContactAvatar
                      address={conv.chatId || conv.participants?.[0]?.address || ''}
                      name={conv.displayName}
                      isImsg={isIMessage(conv)}
                      size={42}
                    />
                }
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                    <span style={{
                      fontSize: '13px', fontWeight: 600,
                      color: active ? '#fff' : 'var(--text-primary)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {contactLabel(conv)}
                    </span>
                    <span style={{
                      fontSize: '10px', color: 'var(--text-muted)',
                      fontFamily: "'JetBrains Mono', monospace", flexShrink: 0,
                    }}>
                      {timeAgo(conv.lastDate)}
                    </span>
                  </div>
                  <div style={{
                    fontSize: '12px', color: 'var(--text-secondary)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    marginTop: '3px',
                  }}>
                    {conv.lastFromMe ? 'You: ' : ''}{conv.lastMessage || ''}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* ═══ Message thread ═══ */}
      {selected ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {/* Thread header */}
          <div style={{
            padding: '12px 20px',
            borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', gap: '12px',
          }}>
            <button
              onClick={() => { setSelected(null); setMessages([]); setReactionPicker(null) }}
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
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                {contactLabel(selected)}
              </div>
              <div style={{
                fontSize: '10px',
                color: isIMessage(selected) ? '#5ac8fa' : '#34c759',
                fontFamily: "'JetBrains Mono', monospace",
              }}>
                {isIMessage(selected) ? 'iMessage' : 'SMS'}
                {isGroupChat(selected) && (
                  <span style={{ color: 'var(--text-muted)', marginLeft: '6px' }}>
                    {selected.participants.length} people
                  </span>
                )}
              </div>
            </div>

            {/* Group member avatars in header */}
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
                  }}>
                    +{selected.participants.length - 6}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Messages */}
          <div style={{
            flex: 1, overflowY: 'auto', padding: '16px 20px',
            display: 'flex', flexDirection: 'column', gap: '2px',
          }}>
            {msgsLoading && (
              <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: '12px' }}>
                Loading messages...
              </div>
            )}
            {!msgsLoading && messages.map((msg, idx) => {
              const fromMe = !!msg.isFromMe
              const prevMsg = messages[idx - 1]
              const nextMsg = messages[idx + 1]
              const prevSameSender = prevMsg && !!prevMsg.isFromMe === fromMe
              const nextSameSender = nextMsg && !!nextMsg.isFromMe === fromMe
              const imsg = isIMessage(selected)
              const showTime = shouldShowTimestamp(messages, idx)
              const isGroup = isGroupChat(selected)
              const showSenderName = isGroup && !fromMe && !prevSameSender

              // Bubble border-radius (iMessage-style grouping)
              const br = fromMe
                ? {
                    topLeft: '18px',
                    topRight: prevSameSender && !showTime ? '4px' : '18px',
                    bottomLeft: '18px',
                    bottomRight: nextSameSender ? '4px' : '18px',
                  }
                : {
                    topLeft: prevSameSender && !showTime ? '4px' : '18px',
                    topRight: '18px',
                    bottomLeft: nextSameSender ? '4px' : '18px',
                    bottomRight: '18px',
                  }

              // Show small avatar next to last message in a group (received only, group chats)
              const showMsgAvatar = isGroup && !fromMe && !nextSameSender

              // System messages (group name changes, etc.)
              if (msg.groupTitle || msg.groupActionType) {
                return (
                  <div key={msg.guid} style={{
                    textAlign: 'center', padding: '8px 0',
                    fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic',
                  }}>
                    {msg.groupTitle ? `Named the conversation "${msg.groupTitle}"` : 'Group updated'}
                  </div>
                )
              }

              return (
                <div key={msg.guid}>
                  {showTime && (
                    <div style={{
                      textAlign: 'center', padding: '14px 0 10px',
                      fontSize: '11px', color: 'var(--text-muted)',
                      fontWeight: 500,
                    }}>
                      {formatTimestamp(msg.dateCreated)}
                    </div>
                  )}

                  {/* Sender name in group chats */}
                  {showSenderName && (
                    <div style={{
                      fontSize: '11px', fontWeight: 500,
                      color: 'var(--text-secondary)',
                      paddingLeft: isGroup ? '42px' : '0',
                      marginBottom: '2px',
                      marginTop: '6px',
                    }}>
                      {resolveSenderName(msg.handle, contactLookup)}
                    </div>
                  )}

                  <div style={{
                    display: 'flex',
                    justifyContent: fromMe ? 'flex-end' : 'flex-start',
                    alignItems: 'flex-end',
                    gap: '6px',
                    marginTop: prevSameSender && !showTime ? '1px' : '4px',
                  }}>
                    {/* Sender avatar (group chats, received) */}
                    {isGroup && !fromMe && (
                      <div style={{ width: '28px', flexShrink: 0 }}>
                        {showMsgAvatar && (
                          <ContactAvatar
                            address={msg.handle?.address || ''}
                            name={resolveSenderName(msg.handle, contactLookup)}
                            size={28}
                          />
                        )}
                      </div>
                    )}

                    {/* Message bubble */}
                    <div
                      style={{
                        maxWidth: '70%',
                        display: 'flex',
                        flexDirection: 'column',
                      }}
                    >
                      <div
                        onDoubleClick={e => {
                          e.preventDefault()
                          const rect = e.currentTarget.getBoundingClientRect()
                          setReactionPicker({
                            msgGuid: msg.guid,
                            x: rect.left + rect.width / 2,
                            y: rect.top,
                          })
                        }}
                        style={{
                          padding: msg.attachments?.some(a => a.mimeType?.startsWith('image/') || a.mimeType?.startsWith('video/'))
                            ? '3px'
                            : '8px 14px',
                          borderRadius: `${br.topLeft} ${br.topRight} ${br.bottomRight} ${br.bottomLeft}`,
                          background: fromMe
                            ? (imsg ? 'linear-gradient(135deg, #5ac8fa, #007aff)' : 'linear-gradient(135deg, #34c759, #30b04e)')
                            : 'var(--bg-elevated)',
                          color: fromMe ? '#fff' : 'var(--text-primary)',
                          fontSize: '13px',
                          lineHeight: 1.45,
                          wordBreak: 'break-word',
                          border: fromMe ? 'none' : '1px solid var(--border)',
                          cursor: 'default',
                          overflow: 'hidden',
                        }}
                        title={formatTime(msg.dateCreated)}
                      >
                        {/* Attachments */}
                        {msg.attachments && msg.attachments.length > 0 && (
                          <div style={{
                            display: 'flex', flexDirection: 'column', gap: '4px',
                            marginBottom: msg.text ? '6px' : 0,
                          }}>
                            {msg.attachments.map((att) => {
                              const mime = att.mimeType || ''
                              const src = `/api/messages/attachment?guid=${encodeURIComponent(att.guid)}`

                              if (msg.isAudioMessage || mime.startsWith('audio/') || att.transferName?.endsWith('.caf')) {
                                return (
                                  <div key={att.guid} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 8px' }}>
                                    <Mic size={14} style={{ flexShrink: 0 }} />
                                    <audio controls preload="none" style={{
                                      height: '32px', maxWidth: '220px',
                                      filter: fromMe ? 'brightness(1.3) contrast(0.9)' : 'none',
                                    }}>
                                      <source src={src} />
                                    </audio>
                                  </div>
                                )
                              }

                              if (mime.startsWith('image/')) {
                                return (
                                  /* eslint-disable-next-line @next/next/no-img-element */
                                  <img key={att.guid} src={src} alt={att.transferName || 'image'}
                                    style={{
                                      maxWidth: '280px', maxHeight: '320px',
                                      borderRadius: `${br.topLeft} ${br.topRight} ${br.bottomRight} ${br.bottomLeft}`,
                                      display: 'block',
                                      cursor: 'zoom-in',
                                    }}
                                    loading="lazy"
                                    onClick={e => {
                                      e.stopPropagation()
                                      setLightbox({ src, type: 'image' })
                                    }}
                                  />
                                )
                              }

                              if (mime.startsWith('video/')) {
                                return (
                                  <div key={att.guid} style={{ position: 'relative', cursor: 'pointer' }}
                                    onClick={e => {
                                      e.stopPropagation()
                                      setLightbox({ src, type: 'video' })
                                    }}
                                  >
                                    <video preload="metadata"
                                      style={{
                                        maxWidth: '280px', maxHeight: '320px',
                                        borderRadius: `${br.topLeft} ${br.topRight} ${br.bottomRight} ${br.bottomLeft}`,
                                        display: 'block',
                                      }}>
                                      <source src={src} type={mime} />
                                    </video>
                                    {/* Play button overlay */}
                                    <div style={{
                                      position: 'absolute', inset: 0,
                                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                                      background: 'rgba(0,0,0,0.25)',
                                      borderRadius: `${br.topLeft} ${br.topRight} ${br.bottomRight} ${br.bottomLeft}`,
                                    }}>
                                      <div style={{
                                        width: '44px', height: '44px', borderRadius: '50%',
                                        background: 'rgba(255,255,255,0.9)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                      }}>
                                        <div style={{
                                          width: 0, height: 0,
                                          borderTop: '10px solid transparent',
                                          borderBottom: '10px solid transparent',
                                          borderLeft: '16px solid #333',
                                          marginLeft: '3px',
                                        }} />
                                      </div>
                                    </div>
                                  </div>
                                )
                              }

                              return (
                                <a key={att.guid} href={src} target="_blank" rel="noreferrer"
                                  style={{
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

                        {/* Audio-only messages with no attachment data */}
                        {msg.isAudioMessage && (!msg.attachments || msg.attachments.length === 0) && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 8px' }}>
                            <Mic size={14} />
                            <span style={{ fontSize: '12px', fontStyle: 'italic' }}>Audio Message</span>
                          </div>
                        )}

                        {/* Text */}
                        {msg.text ? (
                          <div style={{
                            padding: msg.attachments?.some(a =>
                              a.mimeType?.startsWith('image/') || a.mimeType?.startsWith('video/')
                            ) ? '4px 10px 6px' : '0',
                          }}>
                            {msg.text}
                          </div>
                        ) : !msg.attachments?.length && !msg.isAudioMessage ? (
                          <span style={{ fontSize: '12px', fontStyle: 'italic', opacity: 0.6 }}>
                            {msg.itemType === 2 ? 'Sticker' :
                             msg.balloonBundleId ? 'iMessage App' : '\u200B'}
                          </span>
                        ) : null}
                      </div>

                      {/* Reactions */}
                      {msg.reactions && msg.reactions.length > 0 && (
                        <ReactionPills reactions={msg.reactions} fromMe={fromMe} />
                      )}
                    </div>
                  </div>

                  {/* Delivery / Read receipt (last sent message only) */}
                  {lastSentMsg?.guid === msg.guid && fromMe && (
                    <div style={{
                      textAlign: 'right',
                      fontSize: '10px',
                      color: 'var(--text-muted)',
                      padding: '2px 4px 0',
                      fontFamily: "'JetBrains Mono', monospace",
                    }}>
                      {msg.dateRead
                        ? `Read ${formatTime(msg.dateRead)}`
                        : msg.dateDelivered
                          ? 'Delivered'
                          : msg.guid.startsWith('temp-')
                            ? 'Sending...'
                            : 'Sent'}
                    </div>
                  )}
                </div>
              )
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div style={{
            padding: '12px 20px',
            borderTop: '1px solid var(--border)',
            display: 'flex', gap: '10px', alignItems: 'flex-end',
          }}>
            <textarea
              ref={inputRef}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  sendMessage()
                }
              }}
              placeholder={isIMessage(selected) ? 'iMessage' : 'Text Message'}
              rows={1}
              style={{
                flex: 1,
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: '20px',
                padding: '10px 16px',
                color: 'var(--text-primary)',
                fontSize: '13px',
                resize: 'none',
                outline: 'none',
                fontFamily: 'inherit',
                maxHeight: '100px',
                lineHeight: 1.4,
              }}
              onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent)' }}
              onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
            />
            <button
              onClick={sendMessage}
              disabled={!draft.trim() || sending}
              style={{
                width: '36px', height: '36px', borderRadius: '50%', border: 'none',
                background: draft.trim()
                  ? (isIMessage(selected) ? 'linear-gradient(135deg, #5ac8fa, #007aff)' : 'linear-gradient(135deg, #34c759, #30b04e)')
                  : 'var(--bg-elevated)',
                color: draft.trim() ? '#fff' : 'var(--text-muted)',
                cursor: draft.trim() ? 'pointer' : 'default',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
                transition: 'all 0.2s',
              }}
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      ) : (
        !loading && conversations.length > 0 && (
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-muted)', fontSize: '13px', fontStyle: 'italic',
          }}>
            Select a conversation
          </div>
        )
      )}

      {/* ═══ Reaction Picker ═══ */}
      {reactionPicker && (
        <ReactionPicker
          x={reactionPicker.x}
          y={reactionPicker.y}
          onPick={(reaction) => sendReaction(reactionPicker.msgGuid, reaction)}
          onClose={() => setReactionPicker(null)}
        />
      )}

      {/* ═══ Lightbox ═══ */}
      {lightbox && (
        <div
          onClick={() => { setLightbox(null); setLoupe(null) }}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.88)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'zoom-out',
            animation: 'lightboxIn 0.2s ease-out',
          }}
        >
          {lightbox.type === 'image' ? (
            <div
              onClick={e => e.stopPropagation()}
              style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={imgRef}
                src={lightbox.src}
                alt="expanded"
                style={{
                  maxWidth: '85vw', maxHeight: '85vh',
                  borderRadius: '10px',
                  border: '1px solid rgba(255,255,255,0.08)',
                  objectFit: 'contain',
                  boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
                  display: 'block',
                  cursor: loupe ? 'crosshair' : 'zoom-in',
                  userSelect: 'none',
                }}
                onClick={e => {
                  const rect = e.currentTarget.getBoundingClientRect()
                  const x = e.clientX - rect.left
                  const y = e.clientY - rect.top
                  setLoupe(l => l ? null : { x, y, zoom: 2.1 })
                }}
                onMouseMove={e => {
                  if (!loupeRef.current) return
                  const rect = e.currentTarget.getBoundingClientRect()
                  setLoupe(l => l ? { ...l, x: e.clientX - rect.left, y: e.clientY - rect.top } : null)
                }}
              />

              {/* Loupe magnifier */}
              {loupe && imgRef.current && (() => {
                const iw = imgRef.current.clientWidth
                const ih = imgRef.current.clientHeight
                minZoomRef.current = Math.max(LOUPE_W / iw, LOUPE_H / ih) / 0.85
                const lx = Math.max(LOUPE_W / 2, Math.min(iw - LOUPE_W / 2, loupe.x))
                const ly = Math.max(LOUPE_H / 2, Math.min(ih - LOUPE_H / 2, loupe.y))
                return (
                  <div
                    style={{
                      position: 'absolute',
                      left: lx - LOUPE_W / 2,
                      top: ly - LOUPE_H / 2,
                      width: LOUPE_W,
                      height: LOUPE_H,
                      borderRadius: '10px',
                      border: '2px solid rgba(255,255,255,0.35)',
                      boxShadow: '0 4px 24px rgba(0,0,0,0.7)',
                      backgroundImage: `url(${lightbox.src})`,
                      backgroundSize: `${iw * loupe.zoom}px ${ih * loupe.zoom}px`,
                      backgroundPosition: `${LOUPE_W / 2 - loupe.x * loupe.zoom}px ${LOUPE_H / 2 - loupe.y * loupe.zoom}px`,
                      backgroundRepeat: 'no-repeat',
                      pointerEvents: 'none',
                    }}
                  />
                )
              })()}
            </div>
          ) : (
            /* Video lightbox */
            <div onClick={e => e.stopPropagation()} style={{ maxWidth: '85vw', maxHeight: '85vh' }}>
              <video
                controls
                autoPlay
                style={{
                  maxWidth: '85vw', maxHeight: '85vh',
                  borderRadius: '10px',
                  boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
                  outline: 'none',
                }}
              >
                <source src={lightbox.src} />
              </video>
            </div>
          )}

          {/* Close button */}
          <button
            onClick={() => { setLightbox(null); setLoupe(null) }}
            style={{
              position: 'fixed', top: '20px', right: '24px',
              background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: '50%', width: '36px', height: '36px',
              color: '#fff', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.2)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)' }}
          >
            <X size={18} />
          </button>
        </div>
      )}
    </div>
  )
}
